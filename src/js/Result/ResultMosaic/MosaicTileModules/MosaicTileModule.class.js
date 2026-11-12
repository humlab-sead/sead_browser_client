import { nanoid } from "nanoid";
import { Parser } from '@json2csv/plainjs';
import JSZip from "jszip";
import { saveAs } from "file-saver";
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import Plotly from "plotly.js-dist-min";
import Config from "../../../../config/config.json";

//The number of samples in the current result, shared by the tiles which show how many of them they cover
let totalSamplesCountCache = null;

class MosaicTileModule {
    constructor(sqs) {
        this.sqs = sqs;
        this.chart = null;
        this.renderIntoNode = null;
        this.active = true;
        this.data = null;
        this.renderComplete = false;
        this.chartType = "";
        this.name = "";
        this.showChartSelector = true; // Controls whether chart selector dropdown is shown
    }

    /**
     * Set the title shown in this tile's shared header bar.
     * The header is owned by ResultMosaic and lives on the tile root, not inside
     * the module's render node — so modules with a dynamic title call this instead
     * of rendering their own header.
     * @param {string} title
     */
    setMosaicTileTitle(title) {
        if(!this.renderIntoNode || title == null) {
            return;
        }
        $(this.renderIntoNode).closest(".result-mosaic-tile").find(".mosaic-tile-title").first().text(title);
    }

    /**
     * The line under the title saying what the chart counts, e.g. "Share of 1,234 datasets".
     * @param {string} subtitle
     */
    setMosaicTileSubtitle(subtitle) {
        if(!this.renderIntoNode) {
            return;
        }
        let subtitleNode = $(this.renderIntoNode).closest(".result-mosaic-tile").find(".mosaic-tile-subtitle").first();
        subtitleNode.text(subtitle || "");
    }

    /**
     * A segmented control in the tile header for switching between the ways the data can be shown,
     * e.g. as a chart or as a table. The chosen view is kept in this.view, so it survives the result being updated.
     * @param {Array<{id: string, label: string}>} views
     * @param {function} onChange - called with the id of the chosen view
     */
    renderViewToggle(views, onChange) {
        let slotNode = $(this.renderIntoNode).closest(".result-mosaic-tile").find(".mosaic-tile-view-slot").first();
        slotNode.empty();
        if(!this.view || !views.find(view => view.id == this.view)) {
            this.view = views[0].id;
        }

        let toggleNode = $("<div class='sqs-segmented mosaic-tile-view-toggle' role='group' aria-label='Show as'></div>");
        views.forEach(view => {
            let buttonNode = $("<button type='button'></button>").text(view.label);
            buttonNode.attr("aria-pressed", view.id == this.view ? "true" : "false");
            buttonNode.on("click", () => {
                if(this.view == view.id) {
                    return;
                }
                this.view = view.id;
                toggleNode.find("button").attr("aria-pressed", "false");
                buttonNode.attr("aria-pressed", "true");
                onChange(view.id);
            });
            toggleNode.append(buttonNode);
        });
        slotNode.append(toggleNode);
    }

    formatCount(value) {
        return Number(value).toLocaleString("en-GB");
    }

    //Short enough for the ticks of an axis to fit next to each other: 1.5k rather than 1,500
    formatAxisCount(value) {
        return value >= 1000 ? (value / 1000)+"k" : String(value);
    }

    formatShare(fraction) {
        let percent = fraction * 100;
        return (percent > 0 && percent < 0.1 ? "<0.1" : percent.toFixed(1))+" %";
    }

    /**
     * Round tick values for an axis running from 0 to at least max.
     * @param {number} max
     * @param {number} targetCount - about how many intervals there should be
     * @returns {number[]}
     */
    getNiceTicks(max, targetCount = 4) {
        if(!(max > 0)) {
            return [0, 1];
        }
        let rawStep = max / targetCount;
        let magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        let step = [1, 2, 2.5, 5, 10].map(f => f * magnitude).find(s => s >= rawStep);
        let ticks = [];
        for(let tick = 0; tick < max + step * 0.999; tick += step) {
            ticks.push(Math.round(tick * 1e6) / 1e6);
        }
        return ticks;
    }

    /**
     * Rows of top items with the rest gathered into one "other" row.
     * @param {Array} items - sorted, largest first
     * @param {number} limit - how many to show on their own
     * @param {function} makeOther - given the items left over, returns the row standing in for them
     */
    takeTopItems(items, limit, makeOther) {
        //Gathering a single item into "1 other" would only hide its name
        if(items.length <= limit + 1) {
            return items.slice();
        }
        let rest = items.slice(limit);
        return items.slice(0, limit).concat([makeOther(rest)]);
    }

    /**
     * Function: renderRankedBars
     *
     * A list of horizontal bars, one row per item: a label, the bar and its value, over an axis. This is how most
     * overview tiles show their data. Rows can be clicked to add the item as a filter.
     *
     * Parameters:
     * container - the node to render into
     * rows - [{ label, labelHtml, value, valueText, color, title, onClick, href, actionText, selected, other }]; value decides
     * the length of the bar. labelHtml, if given, is shown instead of label, which then only names the row to screen readers.
     * A row with an href is a link, which onClick handles when it is clicked as such; actionText says what clicking it does.
     * options - { axisFormat: function(tick), showSwatches: boolean, wideLabels: boolean - for long labels, such as taxa }
     */
    renderRankedBars(container, rows, options = {}) {
        let maxValue = rows.reduce((max, row) => Math.max(max, row.value), 0);
        let ticks = this.getNiceTicks(maxValue);
        let axisMax = ticks[ticks.length - 1];
        let axisFormat = options.axisFormat || (tick => this.formatAxisCount(tick));

        let listNode = $("<div class='mosaic-bars'></div>");
        if(rows.some(row => row.onClick)) {
            listNode.addClass("mosaic-bars-interactive");
        }
        if(options.wideLabels) {
            listNode.addClass("mosaic-bars-wide-labels");
        }

        rows.forEach(row => {
            let rowNode = $("<div class='mosaic-bar-row'></div>");
            if(row.href) {
                rowNode = $("<a class='mosaic-bar-row'></a>").attr("href", row.href);
            }
            else if(row.onClick) {
                rowNode = $("<button type='button' class='mosaic-bar-row'></button>");
            }
            if(row.other) {
                rowNode.addClass("mosaic-bar-row-other");
            }
            let labelNode = $("<span class='mosaic-bar-label'></span>");
            if(options.showSwatches) {
                labelNode.append($("<span class='sqs-dot'></span>").css("background-color", row.color));
            }
            let labelTextNode = $("<span class='mosaic-bar-label-text'></span>");
            if(row.labelHtml) {
                labelTextNode.html(row.labelHtml);
            }
            else {
                labelTextNode.text(row.label);
            }
            labelNode.append(labelTextNode);
            rowNode.append(labelNode);

            let trackNode = $("<span class='mosaic-bar-track'></span>");
            let width = axisMax > 0 ? Math.max(row.value > 0 ? 0.6 : 0, row.value / axisMax * 100) : 0;
            trackNode.append($("<span class='mosaic-bar'></span>").css({ width: width+"%", backgroundColor: row.color }));
            rowNode.append(trackNode);
            rowNode.append($("<span class='mosaic-bar-value'></span>").text(row.valueText));

            if(row.title) {
                rowNode.attr("title", row.title);
            }
            if(row.onClick) {
                let actionText = row.actionText || (row.selected ? "remove filter" : "add as filter");
                rowNode.attr("aria-label", row.label+", "+row.valueText+", "+actionText);
                if(row.href) {
                    rowNode.on("click", event => {
                        //A link opened in a new tab or window goes there as usual
                        if(event.ctrlKey || event.metaKey || event.shiftKey) {
                            return;
                        }
                        event.preventDefault();
                        row.onClick(event);
                    });
                }
                else {
                    rowNode.attr("aria-pressed", row.selected ? "true" : "false");
                    rowNode.on("click", row.onClick);
                }
            }
            listNode.append(rowNode);
        });

        let axisNode = $("<div class='mosaic-bar-axis' aria-hidden='true'><span></span><span class='mosaic-bar-ticks'></span><span></span></div>");
        ticks.forEach(tick => {
            let tickNode = $("<span class='mosaic-bar-tick'></span>").text(axisFormat(tick));
            tickNode.css("left", (axisMax > 0 ? tick / axisMax * 100 : 0)+"%");
            axisNode.find(".mosaic-bar-ticks").append(tickNode);
        });
        listNode.append(axisNode);

        $(container).append(listNode);

        this.exportImageRows = rows.map(row => ({
            label: row.label,
            valueText: row.valueText,
            segments: [{ fraction: axisMax > 0 ? row.value / axisMax : 0, color: row.color }]
        }));
        return listNode;
    }

    /**
     * Function: renderShareStrip
     * One bar split into a segment per row, each as wide as its share - the parts of the whole at a glance.
     */
    renderShareStrip(container, rows) {
        let stripNode = $("<div class='mosaic-share-strip' aria-hidden='true'></div>");
        rows.forEach(row => {
            stripNode.append($("<span></span>").css({ flexGrow: row.value, backgroundColor: row.color }).attr("title", row.label+" · "+row.valueText));
        });
        $(container).append(stripNode);
        return stripNode;
    }

    /**
     * Function: renderCoverage
     *
     * A line under a chart saying how much of the result it covers, e.g. that 1,234 of 3,139 samples have a value
     * for the variable shown. The total can be a promise; the line shows a dash until it is in.
     *
     * Parameters:
     * container - the node to append the line to
     * covered - how many have data
     * totalOrPromise - how many there are in all, or a promise for it
     * noun - what is counted, in the plural, e.g. "samples"
     */
    renderCoverage(container, covered, totalOrPromise, noun = "samples") {
        let coverageNode = $("<div class='mosaic-coverage'><span class='mosaic-coverage-label'></span><span class='mosaic-coverage-track'><span class='mosaic-coverage-fill'></span></span><span class='mosaic-coverage-value'>–</span></div>");
        coverageNode.find(".mosaic-coverage-label").text(this.formatCount(covered)+" "+noun+" with data");
        $(container).append(coverageNode);

        Promise.resolve(totalOrPromise).then(total => {
            if(!(total > 0)) {
                return;
            }
            if(covered > total) {
                //The data is counted differently from the total, so no share can be told
                console.warn(this.name+" counts "+covered+" "+noun+" with data, but the result has only "+total);
                return;
            }
            let share = covered / total;
            coverageNode.find(".mosaic-coverage-label").text(this.formatCount(covered)+" of "+this.formatCount(total)+" "+noun);
            coverageNode.find(".mosaic-coverage-fill").css("width", (share * 100)+"%");
            coverageNode.find(".mosaic-coverage-value").text(this.formatShare(share));
            coverageNode.attr("title", this.formatShare(share)+" of the "+noun+" in the result have data for this chart");
        }).catch(error => {
            console.warn("Could not fetch the total for the coverage of "+this.name, error);
        });
        return coverageNode;
    }

    /**
     * Function: renderDataTable
     *
     * Parameters:
     * container - the node to render into
     * columns - [{ title, numeric }]
     * rows - arrays of cell values, one per column; a cell is text, or { text, color } for text with a colored dot
     */
    renderDataTable(container, columns, rows) {
        let tableNode = $("<table class='sqs-table mosaic-data-table'><thead><tr></tr></thead><tbody></tbody></table>");
        columns.forEach(column => {
            tableNode.find("thead tr").append($("<th></th>").text(column.title).toggleClass("sqs-num", column.numeric === true));
        });
        rows.forEach(row => {
            let rowNode = $("<tr></tr>");
            row.forEach((cell, index) => {
                let cellNode = $("<td></td>").toggleClass("sqs-num", columns[index].numeric === true);
                if(cell && typeof cell == "object") {
                    let labelNode = $("<span class='mosaic-table-label'></span>");
                    labelNode.append($("<span class='sqs-dot'></span>").css("background-color", cell.color));
                    labelNode.append($("<span></span>").text(cell.text));
                    cellNode.append(labelNode);
                }
                else {
                    cellNode.text(cell);
                }
                rowNode.append(cellNode);
            });
            tableNode.find("tbody").append(rowNode);
        });
        $(container).append(tableNode);
        return tableNode;
    }

    /**
     * The tile's chart area, emptied, for a tile which draws its chart in HTML rather than with a chart library.
     */
    getChartNode() {
        let chartNode = $(this.renderIntoNode).find(".mosaic-tile-chart").first();
        chartNode.empty();
        chartNode.addClass("mosaic-tile-chart-html");
        chartNode.removeClass("mosaic-tile-chart-fill");
        return chartNode;
    }

    /**
     * Function: isFilterSelection
     * Whether the value is selected in the filter of this facet code, so a bar can show that it is.
     */
    isFilterSelection(facetCode, value, stageName = null) {
        let facet = this.sqs.facetManager.getFacetByName(facetCode);
        if(facet && stageName) {
            let stage = typeof facet.getFilterByName == "function" ? facet.getFilterByName(stageName) : null;
            return stage ? stage.selections.includes(value) : false;
        }
        return facet ? facet.getSelections().includes(value) : false;
    }

    /**
     * Function: getFilterToggleCallback
     * A click handler which adds the value to the filter of this facet code, or takes it out if it is in already.
     * A filter added by the click is collapsed, so what it selects is what shows of it.
     * Null if the active domain doesn't have that filter, in which case the bars aren't clickable.
     */
    getFilterToggleCallback(facetCode, value) {
        if(!this.sqs.facetManager.getFacetTemplateByFacetId(facetCode)) {
            return null;
        }
        return () => {
            let filterAdded = !this.sqs.facetManager.getFacetByName(facetCode);
            let facet = this.sqs.facetManager.toggleFacetSelection(facetCode, value);
            if(filterAdded && facet) {
                this.sqs.facetManager.minimizeWhenLoaded(facet);
            }
        };
    }

    /**
     * Function: getStageFilterToggleCallback
     * As getFilterToggleCallback, for a value in a later stage of a staged filter, such as an eco code of a system.
     * leadingSelections are the selections of the stages before it, e.g. { ecocode_system: [2] }.
     */
    getStageFilterToggleCallback(facetCode, stageName, value, leadingSelections) {
        if(!this.sqs.facetManager.getFacetTemplateByFacetId(facetCode)) {
            return null;
        }
        return () => {
            let filterAdded = !this.sqs.facetManager.getFacetByName(facetCode);
            let facet = this.sqs.facetManager.toggleStageSelection(facetCode, stageName, value, leadingSelections);
            if(filterAdded && facet) {
                this.sqs.facetManager.minimizeWhenLoaded(facet);
            }
        };
    }

    showLoadingIndicator(show) {
        if(show && this.renderIntoNode) {
            this.sqs.setLoadingIndicator(this.renderIntoNode, true);
        }
        else if(this.renderIntoNode) {
            this.sqs.setLoadingIndicator(this.renderIntoNode, false);
        }
	}

    async fetchTotalSamplesCount() {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");

        try {
            const response = await fetch(this.sqs.config.dataServerAddress + "/site/samplescount", {
                method: "POST",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sites: resultMosaic.sites })
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();
            return data.count;

        } catch (error) {
            console.error("Error fetching total samples count:", error);
            return null;
        }
    }

    /**
     * Function: getTotalSamplesCount
     * A promise for the number of samples at the sites in the result, fetched once per result and shared by the tiles.
     */
    getTotalSamplesCount() {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        if(!totalSamplesCountCache || totalSamplesCountCache.sites !== resultMosaic.sites) {
            totalSamplesCountCache = { sites: resultMosaic.sites, promise: this.fetchTotalSamplesCount() };
        }
        return totalSamplesCountCache.promise;
    }

    async fetchData(path, postData) {
        return new Promise(async (resolve, reject) => {
            try {
                let response = await fetch(this.sqs.config.dataServerAddress + path, {
                    method: "POST",
                    mode: "cors",
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: postData
                });
            
                if (!response.ok) {
                    // Handle non-200 HTTP responses
                    throw new Error(`Server error: ${response.status} - ${response.statusText}`);
                }

                resolve(response);
            
            } catch (error) {
                this.sqs.setErrorIndicator(this.renderIntoNode, "Could not fetch data for "+this.name+" module");
                reject(error);
                return;
            }
        });
    }

    async render() {
        this.renderComplete = false;
    }

    renderNoData() {
        //No data, so nothing for the subtitle to describe or for the views to switch between
        const $tile = $(this.renderIntoNode).closest(".result-mosaic-tile");
        $tile.find(".mosaic-tile-subtitle").text("");
        $tile.find(".mosaic-tile-view-slot").empty();
        this.exportImageRows = null;

        const $chartArea = $(this.renderIntoNode).find('.mosaic-tile-chart');
        if ($chartArea.length > 0) {
            // Module already rendered its own title via tileHtml — only replace the chart area
            this.sqs.setNoDataMsg($chartArea[0]);
        } else {
            // Module has no own title wrapper; add a title heading to the parent tile, unless it has the shared header with the title already
            if (this.title) {
                const $tile = $(this.renderIntoNode).parent();
                if ($tile.find('> h2').length === 0 && $tile.find('.mosaic-tile-title').length === 0) {
                    $tile.append(`<h2>${this.title}</h2>`);
                }
            }
            this.sqs.setNoDataMsg(this.renderIntoNode);
        }
    }

    /*
    * Function: renderNoDataIfNoSites
    *
    * With no sites in the result a tile has nothing to show - and several endpoints read an empty list of
    * sites as every site in the database rather than none. Call it once the tile's own container is in place:
    * it shows "No data" and returns true when there are no sites, and the tile should stop there.
    */
    renderNoDataIfNoSites() {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        if(resultMosaic && Array.isArray(resultMosaic.sites) && resultMosaic.sites.length > 0) {
            return false;
        }
        this.data = [];
        this.renderNoData();
        this.renderComplete = true;
        return true;
    }

    async update() {
        
    }

    async unrender() {
        return new Promise((resolve, reject) => {
            this.waitForRenderCompleteInterval = setInterval(() => {
                if(this.renderComplete) {
                    clearInterval(this.waitForRenderCompleteInterval);
    
                    if(this.renderIntoNode != null) {
                        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
                        if(resultMosaic && typeof resultMosaic.cleanupPlotlyChartsInContainer == "function") {
                            resultMosaic.cleanupPlotlyChartsInContainer(this.renderIntoNode);
                        }
                        $(this.renderIntoNode).empty();
                        resolve();
                    }
                    else {
                        console.warn("Render into node was null when trying to unrender!");
                        reject();
                    }
                }
            }, 100);
        });
    }

    getAvailableExportFormats() {
        return ["json", "csv", "png"];
    }

    getExportImageTargetNode() {
        const $renderRoot = $(this.renderIntoNode);
        const tileContentNode = $renderRoot.find(".mosaic-tile-content").first()[0];
        return tileContentNode || $renderRoot[0] || null;
    }

    sanitizeExportFilename(baseName = "chart") {
        return baseName.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").toLowerCase();
    }

    getExportFilenameBase() {
        return this.sanitizeExportFilename(this.title || this.name || "chart");
    }

    normalizeRowsForCsv(data) {
        const rows = Array.isArray(data) ? data : (data == null ? [] : [data]);
        return rows.map(row => this.flattenObjectForExport(row));
    }

    flattenObjectForExport(value, prefix = "", output = {}) {
        if(value == null || typeof value !== "object" || value instanceof Date) {
            output[prefix || "value"] = value;
            return output;
        }

        if(Array.isArray(value)) {
            output[prefix || "value"] = value.every(item => item == null || typeof item !== "object")
                ? value.join("|")
                : JSON.stringify(value);
            return output;
        }

        Object.keys(value).forEach(key => {
            const exportKey = prefix ? `${prefix}_${key}` : key;
            const item = value[key];
            if(item != null && typeof item === "object" && !(item instanceof Date)) {
                this.flattenObjectForExport(item, exportKey, output);
            }
            else {
                output[exportKey] = item;
            }
        });

        return output;
    }

    stripHtmlTags(text) {
        if(typeof text !== "string") {
            return "";
        }
        return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    }

    truncateCanvasText(ctx, text, maxWidth) {
        if(ctx.measureText(text).width <= maxWidth) {
            return text;
        }

        const ellipsis = "...";
        let trimmed = text;
        while(trimmed.length > 1 && ctx.measureText(trimmed + ellipsis).width > maxWidth) {
            trimmed = trimmed.slice(0, -1);
        }
        return trimmed + ellipsis;
    }

    /**
     * Function: exportRowsAsPng
     * Draws the bars of a tile which renders them in HTML (see renderRankedBars) onto a canvas, and saves that.
     */
    exportRowsAsPng(filename) {
        const rows = this.exportImageRows;
        const width = 900;
        const paddingX = 28;
        const labelWidth = 260;
        const valueWidth = 110;
        const rowHeight = 30;
        const top = 84;
        const height = top + rows.length * rowHeight + 24;
        const barX = paddingX + labelWidth;
        const barWidth = width - barX - valueWidth - paddingX;

        const scale = window.devicePixelRatio && window.devicePixelRatio > 1 ? window.devicePixelRatio : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        const ctx = canvas.getContext("2d");
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.textBaseline = "middle";

        const tileNode = $(this.renderIntoNode).closest(".result-mosaic-tile");
        const title = tileNode.find(".mosaic-tile-title").first().text() || this.title || "";
        const subtitle = tileNode.find(".mosaic-tile-subtitle").first().text();
        ctx.fillStyle = "#1e1e1e";
        ctx.font = "600 20px 'IBM Plex Sans', sans-serif";
        ctx.fillText(title, paddingX, 32);
        ctx.fillStyle = "#636363";
        ctx.font = "400 14px 'IBM Plex Sans', sans-serif";
        ctx.fillText(subtitle, paddingX, 56);

        rows.forEach((row, index) => {
            const y = top + index * rowHeight;
            ctx.font = "400 14px 'IBM Plex Sans', sans-serif";
            ctx.fillStyle = "#1e1e1e";
            ctx.textAlign = "left";
            ctx.fillText(this.truncateCanvasText(ctx, row.label, labelWidth - 16), paddingX, y + rowHeight / 2);

            let x = barX;
            row.segments.forEach(segment => {
                const segmentWidth = barWidth * segment.fraction;
                ctx.fillStyle = segment.color;
                ctx.fillRect(x, y + 7, segmentWidth, rowHeight - 14);
                x += segmentWidth;
            });

            ctx.fillStyle = "#333333";
            ctx.textAlign = "right";
            ctx.fillText(row.valueText, width - paddingX, y + rowHeight / 2);
        });

        return this.saveCanvasAsPng(canvas, filename);
    }

    /**
     * Function: exportChartCanvasAsPng
     * Saves the canvas of a chart, such as a Chart.js one, on white and under the tile's title and subtitle, as
     * exportRowsAsPng does for bars drawn in HTML.
     */
    exportChartCanvasAsPng(chartCanvas, filename) {
        //The chart canvas is drawn at the device's pixel ratio, so the frame is scaled to match it
        const ratio = chartCanvas.clientWidth > 0 ? chartCanvas.width / chartCanvas.clientWidth : 1;
        const paddingX = 28;
        const top = 76;
        const paddingBottom = 20;

        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(chartCanvas.width + paddingX * 2 * ratio);
        canvas.height = Math.ceil(chartCanvas.height + (top + paddingBottom) * ratio);
        const ctx = canvas.getContext("2d");
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width / ratio, canvas.height / ratio);
        ctx.textBaseline = "middle";

        const tileNode = $(this.renderIntoNode).closest(".result-mosaic-tile");
        const title = tileNode.find(".mosaic-tile-title").first().text() || this.title || "";
        const subtitle = tileNode.find(".mosaic-tile-subtitle").first().text();
        ctx.fillStyle = "#1e1e1e";
        ctx.font = "600 20px 'IBM Plex Sans', sans-serif";
        ctx.fillText(title, paddingX, 32);
        ctx.fillStyle = "#636363";
        ctx.font = "400 14px 'IBM Plex Sans', sans-serif";
        ctx.fillText(subtitle, paddingX, 56);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(chartCanvas, paddingX * ratio, top * ratio);

        return this.saveCanvasAsPng(canvas, filename);
    }

    async exportImageAsPng() {
        const filename = `sead_${this.getExportFilenameBase()}_chart`;

        if(Array.isArray(this.exportImageRows) && this.exportImageRows.length > 0 && !this.plot) {
            await this.exportRowsAsPng(`${filename}.png`);
            return true;
        }

        if(this.plot) {
            const plot = typeof this.plot.then === "function" ? await this.plot : this.plot;
            if(plot) {
                await Plotly.downloadImage(plot, {
                    format: "png",
                    filename,
                    scale: window.devicePixelRatio || 1
                });
                return true;
            }
        }

        const plotlyNode = $(".js-plotly-plot", this.renderIntoNode)[0];
        if(plotlyNode) {
            await Plotly.downloadImage(plotlyNode, {
                format: "png",
                filename,
                scale: window.devicePixelRatio || 1
            });
            return true;
        }

        if(this.chart && this.chart.canvas && typeof this.chart.toBase64Image === "function") {
            await this.exportChartCanvasAsPng(this.chart.canvas, `${filename}.png`);
            return true;
        }

        if(this.chartType === "zingchart") {
            const chartNodeId = this.getZingChartExportNodeId();
            if(chartNodeId && typeof zingchart !== "undefined" && zingchart.exec) {
                zingchart.exec(chartNodeId, "saveasimage", {
                    filename,
                    format: "png"
                });
                return true;
            }
        }

        const mapCanvas = $(".ol-viewport canvas", this.renderIntoNode)[0];
        if(mapCanvas) {
            await this.saveCanvasAsPng(mapCanvas, `${filename}.png`);
            return true;
        }

        const canvas = $("canvas", this.renderIntoNode)[0];
        if(canvas) {
            await this.saveCanvasAsPng(canvas, `${filename}.png`);
            return true;
        }

        console.warn("No image export target found for " + this.name);
        return false;
    }

    getZingChartExportNodeId() {
        if(this.renderIntoNode) {
            if(typeof this.renderIntoNode === "string") {
                return this.renderIntoNode.replace(/^#/, "");
            }
            if(this.renderIntoNode.id) {
                return this.renderIntoNode.id;
            }
        }
        return null;
    }

    saveDataUrlAsFile(dataUrl, filename) {
        const link = document.createElement("a");
        link.download = filename;
        link.href = dataUrl;
        link.click();
    }

    saveCanvasAsPng(canvas, filename) {
        return new Promise(resolve => {
            try {
                if(canvas.toBlob) {
                    canvas.toBlob(blob => {
                        if(blob) {
                            saveAs(blob, filename);
                        }
                        else {
                            this.saveDataUrlAsFile(canvas.toDataURL("image/png"), filename);
                        }
                        resolve();
                    }, "image/png");
                }
                else {
                    this.saveDataUrlAsFile(canvas.toDataURL("image/png"), filename);
                    resolve();
                }
            }
            catch(error) {
                console.warn("Could not export canvas as PNG", error);
                resolve();
            }
        });
    }

    exportCallback() {
        let exportFormats = this.getAvailableExportFormats();

        let html = "<div class='dialog-centered-content-container'>";
        
        let jsonButtonId = nanoid();
        if(exportFormats.includes("json")) {
            html += "<button type='button' id='"+jsonButtonId+"' class='site-report-export-download-btn sqs-btn'><i class='fa fa-download' aria-hidden='true'></i> Chart data as JSON</button>";
        }
        
        let csvButtonId = nanoid();
        if(exportFormats.includes("csv")) {
            html += "<button type='button' id='"+csvButtonId+"' class='site-report-export-download-btn sqs-btn'><i class='fa fa-download' aria-hidden='true'></i> Chart data as CSV</button>";
        }
        let xlsxButtonId = nanoid();
        if(exportFormats.includes("xlsx")) {
            html += "<button type='button' id='"+xlsxButtonId+"' class='site-report-export-download-btn sqs-btn'><i class='fa fa-download' aria-hidden='true'></i> Chart data as XLSX</button>";
        }
        let pngButtonId = nanoid();
        if(exportFormats.includes("png")) {
            html += "<button type='button' id='"+pngButtonId+"' class='site-report-export-download-btn sqs-btn'><i class='fa fa-download' aria-hidden='true'></i> Chart as image</button>";
        }

        let geojsonButtonId = nanoid();
        if(exportFormats.includes("geojson")) {
            html += "<button type='button' id='"+geojsonButtonId+"' class='site-report-export-download-btn sqs-btn'><i class='fa fa-download' aria-hidden='true'></i> Site data as GeoJSON</button>";
        }

        html += "</div>";
        this.sqs.dialogManager.showPopOver("Export chart data", html);

        let exportData = {
            description: this.sqs.config.dataExportDescription,
            reference: Config.dataAttributionString,
            license: "https://creativecommons.org/licenses/by/4.0/",
            sead_release: Config.seadRelease,
            sead_version: Config.version,
            export_date: new Date().toISOString(),
        }

        if(exportFormats.includes("json")) {
            $("#"+jsonButtonId).on("click", () => {
                exportData.data = this.formatDataForExport(this.data, "json");
    
                let jsonChartData = JSON.stringify(exportData, null, 2);
                const bytes = new TextEncoder().encode(jsonChartData);
                const blob = new Blob([bytes], {
                    type: "application/json;charset=utf-8"
                });
                let filename = this.getExportFilenameBase();
                saveAs(blob, "sead_"+filename+"_graph_data.json");
                setTimeout(() => {
                    this.sqs.dialogManager.hidePopOver();
                }, 1000);
            });
        }
        
        if(exportFormats.includes("csv")) {
            $("#"+csvButtonId).on("click", () => {
                if(this.data == null) {
                    console.warn("Data was null when trying to export!");
                    return;
                }
    
                const parser = new Parser();
                let data = this.formatDataForExport(this.data, "csv");
                let csv = parser.parse(data);
                const bytes = new TextEncoder().encode(csv);
                const blob = new Blob([bytes], {
                    type: "application/csv;charset=utf-8"
                });
                let filename = this.getExportFilenameBase();
    
                //create zip file since we can't include the metdata in the csv file
                let zip = new JSZip();
                zip.file("sead_"+filename+"_graph_data.csv", csv);
                zip.file("sead_"+filename+"_graph_meta.json", JSON.stringify(exportData, null, 2));
                zip.generateAsync({type:"blob"})
                .then((content) => {
                    saveAs(content, "sead_"+filename+"_graph_data.zip");
                    setTimeout(() => {
                        this.sqs.dialogManager.hidePopOver();
                    }, 1000);
                });
            });
        }

        if(exportFormats.includes("xlsx")) {
            $("#"+xlsxButtonId).on("click", async () => {
                if(this.data == null) {
                    console.warn("Data was null when trying to export!");
                    return;
                }

                let filename = this.getExportFilenameBase();
                let data = this.formatDataForExport(this.data, "xlsx");
                await this.exportDataAsXlsx(data, exportData, filename);
                setTimeout(() => {
                    this.sqs.dialogManager.hidePopOver();
                }, 1000);
            });
        }

        if(exportFormats.includes("png")) {
            $("#"+pngButtonId).on("click", async () => {
                const exported = await this.exportImageAsPng();
                if(!exported) {
                    this.formatDataForExport(this.data, "png");
                }
                setTimeout(() => {
                    this.sqs.dialogManager.hidePopOver();
                }, 1000);
            });
        }

        if (exportFormats.includes("geojson")) {
            $("#" + geojsonButtonId).on("click", () => {
                const geojson = this.formatDataForExport(this.data, "geojson");
                const bytes = new TextEncoder().encode(JSON.stringify(geojson, null, 2));
                const blob = new Blob([bytes], { type: "application/geo+json;charset=utf-8" });
                let filename = this.getExportFilenameBase();
                saveAs(blob, "sead_" + filename + ".geojson");
                setTimeout(() => {
                    this.sqs.dialogManager.hidePopOver();
                }, 1000);
            });
        }


    }

    async exportDataAsXlsx(data, exportData, filename) {
        const workbook = new ExcelJS.Workbook();

        const metaSheet = workbook.addWorksheet("Metadata");
        [
            ["SEAD release", exportData.sead_release],
            ["SEAD browser version", exportData.sead_version],
            ["SEAD Query API server version", this.sqs.apiVersion],
            ["JSON API server version", this.sqs.dataServerVersion],
            ["Export date",            exportData.export_date],
            ["Reference",              exportData.reference],
            ["License",                exportData.license],
            ["Description",            exportData.description],
        ].forEach(([key, value]) => {
            const row = metaSheet.addRow([key, value]);
            row.getCell(1).font = { bold: true };
        });
        metaSheet.getColumn(1).width = 26;
        metaSheet.getColumn(2).width = 60;

        const worksheet = workbook.addWorksheet("Chart data");

        if(Array.isArray(data) && data.length > 0) {
            const columns = Object.keys(data[0]);
            worksheet.addRow(columns);
            data.forEach(row => {
                worksheet.addRow(columns.map(column => row[column]));
            });
            worksheet.getRow(1).font = { bold: true };
            worksheet.views = [{ state: "frozen", ySplit: 1 }];
        }
        else {
            worksheet.addRow(["data"]);
            worksheet.addRow([JSON.stringify(data || {}, null, 2)]);
        }

        this._fitWorksheetColumns(worksheet);

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        saveAs(blob, "sead_"+filename+"_graph_data.xlsx");
    }

    _fitWorksheetColumns(worksheet, minimumWidth = 10, maximumWidth = 60) {
        worksheet.columns.forEach(column => {
            let width = minimumWidth;
            column.eachCell({ includeEmpty: true }, cell => {
                width = Math.max(width, String(cell.value ?? "").length + 2);
            });
            column.width = Math.min(width, maximumWidth);
        });
    }

    formatDataForExport(data, format = "json") {
        if(format === "csv" || format === "xlsx") {
            return this.normalizeRowsForCsv(data);
        }
        return data;
    }
}

export default MosaicTileModule;
