import { nanoid } from "nanoid";
import { Parser } from '@json2csv/plainjs';
import JSZip from "jszip";
import { saveAs } from "file-saver";
import Plotly from 'plotly.js-dist-min';

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
        this.requestId = 0;
        this.coverageCharts = new Map(); // Store coverage chart data for resize
        this.chartInstances = new Map(); // Tracks chart instances for export/cleanup
        this.donutChartRegistry = new Map(); // Tracks donut charts for responsive breakpoint restyling
        this.resizeHandler = this.handleResize.bind(this);
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

    /**
     * Render a mini coverage chart showing what proportion of total samples have data.
     * Immediately draws the label and an empty bar, then animates fill as totalSamplesOrPromise resolves.
     *
     * @param {HTMLElement} container - Container element to append the mini-chart into
     * @param {number} samplesWithData - Count representing coverage numerator
     * @param {number|Promise<number>} totalSamplesOrPromise - Total samples count or a Promise for it
     */
    async renderCoverageMiniChart(container, samplesWithData, totalSamplesOrPromise) {
        const miniChartId = nanoid();
        const miniChartHtml = `
            <div class="mosaic-mini-chart-container">
                <div class="mosaic-mini-chart-label">Sample Coverage</div>
                <div class="mosaic-mini-chart-wrapper">
                    <canvas id="mini-chart-${miniChartId}" height="16"></canvas>
                </div>
                <div class="mosaic-mini-chart-percentage" id="mini-pct-${miniChartId}">N/A</div>
            </div>
        `;

        $(container).append(miniChartHtml);

        const canvas = document.getElementById(`mini-chart-${miniChartId}`);
        const ctx = canvas.getContext('2d');
        const canvasContainer = canvas.parentElement;
        canvas.width = canvasContainer.clientWidth;
        canvas.height = 16;

        const observer = new ResizeObserver(() => {
            const data = this.coverageCharts.get(miniChartId);
            if (!data) return;
            canvas.width = canvasContainer.clientWidth;
            canvas.height = 16;
            this.drawCoverageLine(canvas.getContext('2d'), canvas.width, canvas.height, data.percentage);
        });
        observer.observe(canvasContainer);
        this.coverageCharts.set(miniChartId, { canvas, percentage: 0, observer });

        this.drawCoverageLine(ctx, canvas.width, canvas.height, 0);

        const totalSamples = await Promise.resolve(totalSamplesOrPromise);
        if(!totalSamples || totalSamples === 0) {
            return;
        }

        const targetPercentage = samplesWithData / totalSamples;
        const pctEl = document.getElementById(`mini-pct-${miniChartId}`);
        const duration = 600;
        const startTime = performance.now();

        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = targetPercentage * eased;

            this.drawCoverageLine(ctx, canvas.width, canvas.height, current);

            if(pctEl) {
                pctEl.textContent = (current * 100).toFixed(1) + '%';
            }

            this.coverageCharts.get(miniChartId).percentage = current;

            if(progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.drawCoverageLine(ctx, canvas.width, canvas.height, targetPercentage);
                if(pctEl) {
                    pctEl.textContent = (targetPercentage * 100).toFixed(1) + '%';
                }
                this.coverageCharts.get(miniChartId).percentage = targetPercentage;
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Handle window resize by redrawing all coverage charts
     */
    handleResize() {
        this.coverageCharts.forEach((chartData) => {
            const { canvas, percentage } = chartData;
            const canvasContainer = canvas.parentElement;
            if(!canvasContainer) return;
            canvas.width = canvasContainer.clientWidth;
            canvas.height = 16;
            const ctx = canvas.getContext('2d');
            this.drawCoverageLine(ctx, canvas.width, canvas.height, percentage);
        });

        // Restyle donut charts when they cross a breakpoint
        const staleIds = [];
        this.donutChartRegistry.forEach((entry, elementId) => {
            const el = document.getElementById(elementId);
            if (!el || typeof el.data === 'undefined') {
                staleIds.push(elementId);
                return;
            }
            const mode = this.getDonutChartMode(el.offsetWidth);
            if (mode !== entry.lastMode) {
                entry.lastMode = mode;
                this.restyleDonutChart(el, mode);
            }
        });
        staleIds.forEach(id => this.donutChartRegistry.delete(id));
    }

    /**
     * Draw a rounded coverage bar
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     * @param {number} percentage - 0 to 1
     */
    drawCoverageLine(ctx, width, height, percentage) {
        const lineY = height / 2;
        const lineHeight = 6;
        const padding = 0;
        const lineWidth = width - (padding * 2);
        const filledWidth = lineWidth * percentage;

        ctx.fillStyle = '#E0E0E0';
        ctx.beginPath();
        ctx.roundRect(padding, lineY - lineHeight / 2, lineWidth, lineHeight, lineHeight / 2);
        ctx.fill();

        if(filledWidth > 0) {
            ctx.fillStyle = '#143261';
            ctx.beginPath();
            ctx.roundRect(padding, lineY - lineHeight / 2, filledWidth, lineHeight, lineHeight / 2);
            ctx.fill();
        }
    }

    /**
     * Calculate distribution for numeric values
     */
    calculateDistribution(values, min, max, bins = 20) {
        if(values.length === 0 || min === max) {
            return [];
        }

        const range = max - min;
        const binSize = range / bins;
        const histogram = new Array(bins).fill(0);

        values.forEach(value => {
            let binIndex = Math.floor((value - min) / binSize);
            if(binIndex >= bins) binIndex = bins - 1;
            histogram[binIndex]++;
        });

        const maxCount = Math.max(...histogram);

        return histogram.map((count, index) => ({
            binIndex: index,
            count: count,
            height: maxCount > 0 ? (count / maxCount) * 100 : 0,
            startValue: min + (index * binSize),
            endValue: min + ((index + 1) * binSize)
        }));
    }

    /**
     * Return 'compact' or 'normal' based on the container pixel width.
     * compact : < 280 px → inside labels, tighter margins, smaller legend
     * normal  : ≥ 280 px → outside labels, standard margins, full legend
     */
    getDonutChartMode(containerWidth) {
        return containerWidth < 280 ? 'compact' : 'normal';
    }

    /**
     * Incrementally restyle a Plotly donut chart to match the target mode,
     * using restyle (trace properties) + relayout (layout properties) to
     * avoid a full chart recreation.
     */
    restyleDonutChart(element, mode) {
        if (!element || typeof element.data === 'undefined') return;

        let traceUpdate, layoutUpdate;

        if (mode === 'compact') {
            traceUpdate = {
                textposition: 'inside',
                hole: 0.4
            };
            layoutUpdate = {
                margin: { l: 8, r: 8, t: 8, b: 30 },
                'legend.font.size': 8,
                'legend.y': -0.05,
                uniformtext: { minsize: 7, mode: 'hide' }
            };
        } else {
            traceUpdate = {
                textposition: 'outside',
                hole: 0.6
            };
            layoutUpdate = {
                margin: { l: 20, r: 20, t: 20, b: 60 },
                'legend.font.size': 11,
                'legend.y': -0.2,
                uniformtext: { mode: false }
            };
        }

        Plotly.restyle(element, traceUpdate, [0]);
        Plotly.relayout(element, layoutUpdate);
    }

    /**
     * Draw a rounded rectangle on canvas
     */
    drawRoundedRect(ctx, x, y, width, height, radius, roundLeft, roundRight) {
        ctx.beginPath();

        if(roundLeft) {
            ctx.moveTo(x + radius, y);
        } else {
            ctx.moveTo(x, y);
        }

        if(roundRight) {
            ctx.lineTo(x + width - radius, y);
            ctx.arcTo(x + width, y, x + width, y + radius, radius);
        } else {
            ctx.lineTo(x + width, y);
        }

        if(roundRight) {
            ctx.lineTo(x + width, y + height - radius);
            ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        } else {
            ctx.lineTo(x + width, y + height);
        }

        if(roundLeft) {
            ctx.lineTo(x + radius, y + height);
            ctx.arcTo(x, y + height, x, y + height - radius, radius);
        } else {
            ctx.lineTo(x, y + height);
        }

        if(roundLeft) {
            ctx.lineTo(x, y + radius);
            ctx.arcTo(x, y, x + radius, y, radius);
        } else {
            ctx.lineTo(x, y);
        }

        ctx.closePath();
        ctx.fill();
    }

    /**
     * Draw stacked bar chart on canvas
     */
    drawStackedBar(ctx, width, height, categories, colors, total) {
        const barHeight = 40;
        const barY = (height - barHeight) / 2;
        const borderRadius = 3;

        let currentX = 0;

        categories.forEach((cat, idx) => {
            const segmentWidth = (cat.count / total) * width;
            const percentage = ((cat.count / total) * 100).toFixed(1);

            ctx.fillStyle = colors[idx];

            const isFirst = idx === 0;
            const isLast = idx === categories.length - 1;

            this.drawRoundedRect(
                ctx,
                currentX,
                barY,
                segmentWidth,
                barHeight,
                borderRadius,
                isFirst,
                isLast
            );

            if(parseFloat(percentage) > 12) {
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 11px Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const text = `${cat.name} ${percentage}%`;
                const textX = currentX + segmentWidth / 2;
                const textY = barY + barHeight / 2;

                ctx.fillText(text, textX, textY);
            }

            currentX += segmentWidth;
        });
    }

    /**
     * Create a donut chart using Plotly
     * This provides better label handling and responsiveness
     */
    async createDonutChart(elementId, categories, colors, total, variableName) {
        const values = categories.map(cat => cat.count);
        const labels = categories.map(cat => cat.name);
        const percentages = categories.map(cat => ((cat.count / total) * 100).toFixed(1));

        const data = [{
            values: values,
            labels: labels,
            text: percentages.map(p => `${p}%`),
            textposition: 'outside',
            textinfo: 'text',
            hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>Percentage: %{percent}<extra></extra>',
            type: 'pie',
            hole: 0.6,
            marker: {
                colors: colors,
                line: {
                    color: '#fff',
                    width: 2
                }
            },
            pull: 0.01,
            textfont: {
                size: 11,
                color: '#333'
            }
        }];

        const layout = {
            showlegend: true,
            legend: {
                orientation: 'h',
                x: 0.5,
                y: -0.2,
                xanchor: 'center',
                yanchor: 'top',
                font: {
                    size: 11
                }
            },
            margin: {
                l: 20,
                r: 20,
                t: 20,
                b: 60
            },
            autosize: true,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)'
        };

        const config = {
            responsive: true,
            displayModeBar: false
        };

        await Plotly.newPlot(elementId, data, layout, config);

        const chartEl = document.getElementById(elementId);
        const initialMode = this.getDonutChartMode(chartEl ? chartEl.offsetWidth : 999);
        const registryEntry = { lastMode: initialMode, observer: null };
        this.donutChartRegistry.set(elementId, registryEntry);

        if (chartEl) {
            const observer = new ResizeObserver(() => {
                const el = document.getElementById(elementId);
                if (!el || typeof el.data === 'undefined') return;
                const mode = this.getDonutChartMode(el.offsetWidth);
                const entry = this.donutChartRegistry.get(elementId);
                if (entry && mode !== entry.lastMode) {
                    entry.lastMode = mode;
                    this.restyleDonutChart(el, mode);
                }
            });
            observer.observe(chartEl);
            registryEntry.observer = observer;
        }

        return { plotly: true, elementId: elementId };
    }

    /**
     * Download chart as PNG
     */
    downloadChart(chartId) {
        const chartData = this.chartInstances.get(chartId);
        if(!chartData) {
            console.error('Chart not found:', chartId);
            return;
        }

        if(chartData.plotly) {
            Plotly.downloadImage(chartData.elementId, {
                format: 'png',
                filename: `${chartData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart`
            });
        } else if(chartData.chart) {
            const { chart, name } = chartData;
            const url = chart.toBase64Image();
            const link = document.createElement('a');
            link.download = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart.png`;
            link.href = url;
            link.click();
        } else if(chartData.canvas) {
            const { canvas, name } = chartData;
            const url = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart.png`;
            link.href = url;
            link.click();
        }
    }

    async render() {
        this.renderComplete = false;
    }

    renderNoData() {
        const $chartArea = $(this.renderIntoNode).find('.mosaic-tile-chart');
        if ($chartArea.length > 0) {
            // Module already rendered its own title via tileHtml — only replace the chart area
            this.sqs.setNoDataMsg($chartArea[0]);
        } else {
            // Module has no own title wrapper; add a title heading to the parent tile
            if (this.title) {
                const $tile = $(this.renderIntoNode).parent();
                if ($tile.find('> h2').length === 0) {
                    $tile.append(`<h2>${this.title}</h2>`);
                }
            }
            this.sqs.setNoDataMsg(this.renderIntoNode);
        }
    }

    async update() {
        
    }

    async unrender() {
        return new Promise((resolve, reject) => {
            this.waitForRenderCompleteInterval = setInterval(() => {
                if(this.renderComplete) {
                    clearInterval(this.waitForRenderCompleteInterval);

                    this.chartInstances.forEach((chartData) => {
                        if(chartData.chart && typeof chartData.chart.destroy === 'function') {
                            chartData.chart.destroy();
                        }
                    });
                    this.chartInstances.clear();

                    // Disconnect coverage chart observers and clear
                    this.coverageCharts.forEach((chartData) => {
                        if (chartData.observer) chartData.observer.disconnect();
                    });
                    this.coverageCharts.clear();

                    // Disconnect donut chart observers and clear
                    this.donutChartRegistry.forEach((entry) => {
                        if (entry.observer) entry.observer.disconnect();
                    });
                    this.donutChartRegistry.clear();

                    $('.mosaic-tile-download-btn').off('click');

                    this.active = false;

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
        return ["json", "csv"];
    }

    getExportImageTargetNode() {
        const $renderRoot = $(this.renderIntoNode);
        const tileContentNode = $renderRoot.find(".mosaic-tile-content").first()[0];
        return tileContentNode || $renderRoot[0] || null;
    }

    sanitizeExportFilename(baseName = "chart") {
        return baseName.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").toLowerCase();
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

    exportTopTaxaListAsPng(data, options = {}) {
        if(!Array.isArray(data) || data.length === 0) {
            console.warn("No taxa data available for PNG export");
            return;
        }

        const maxRows = options.maxRows || 15;
        const rows = data.slice(0, maxRows);
        const resolveLabel = options.resolveLabel || ((item) => `Taxon id ${item.taxon_id}`);
        const title = options.title || this.title || "Top taxa";
        const barColor = options.barColor || "rgba(0,123,255,0.8)";

        const exportNode = this.getExportImageTargetNode();
        const nodeBounds = exportNode ? exportNode.getBoundingClientRect() : null;
        const width = Math.max(760, Math.ceil(nodeBounds && nodeBounds.width ? nodeBounds.width : 900));

        const paddingX = 28;
        const titleY = 44;
        const headerY = 78;
        const rowHeight = 42;
        const barHeight = 3;
        const tableTop = 96;
        const height = tableTop + (rows.length * rowHeight) + 24;

        const scale = window.devicePixelRatio && window.devicePixelRatio > 1 ? window.devicePixelRatio : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        const ctx = canvas.getContext("2d");

        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = "#222";
        ctx.font = "600 24px Didact Gothic, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(title, paddingX, titleY);

        ctx.font = "600 14px Didact Gothic, sans-serif";
        ctx.fillStyle = "#333";
        ctx.fillText("Taxon", paddingX, headerY);
        ctx.textAlign = "right";
        ctx.fillText("Count", width - paddingX, headerY);
        ctx.textAlign = "left";
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.beginPath();
        ctx.moveTo(paddingX, headerY + 12);
        ctx.lineTo(width - paddingX, headerY + 12);
        ctx.stroke();

        const maxAbundance = rows.reduce((m, item) => {
            const abundance = Number(item.abundance) || 0;
            return abundance > m ? abundance : m;
        }, 0);

        const countColWidth = 130;
        const tableWidth = width - (paddingX * 2);
        const textMaxWidth = tableWidth - countColWidth - 12;

        rows.forEach((item, index) => {
            const rowTop = tableTop + (index * rowHeight);
            const rowTextY = rowTop + 13;
            const abundance = Number(item.abundance) || 0;
            const labelText = this.stripHtmlTags(resolveLabel(item));
            const countText = abundance.toLocaleString(navigator.language);

            ctx.font = "400 14px Didact Gothic, sans-serif";
            ctx.fillStyle = "#1d2b3a";
            ctx.textAlign = "left";
            ctx.fillText(this.truncateCanvasText(ctx, labelText, textMaxWidth), paddingX, rowTextY);

            ctx.textAlign = "right";
            ctx.fillStyle = "#1f1f1f";
            ctx.fillText(countText, width - paddingX, rowTextY);
            ctx.textAlign = "left";

            const barPct = maxAbundance > 0 ? abundance / maxAbundance : 0;
            const barWidth = Math.max(1, (tableWidth * barPct));

            ctx.fillStyle = "rgba(0,0,0,0.06)";
            ctx.fillRect(paddingX, rowTop + 22, tableWidth, barHeight);
            ctx.fillStyle = barColor;
            ctx.fillRect(paddingX, rowTop + 22, barWidth, barHeight);

            ctx.strokeStyle = "rgba(0,0,0,0.06)";
            ctx.beginPath();
            ctx.moveTo(paddingX, rowTop + rowHeight - 2);
            ctx.lineTo(width - paddingX, rowTop + rowHeight - 2);
            ctx.stroke();
        });

        const pngFilename = `sead_${this.sanitizeExportFilename(title)}_chart.png`;
        canvas.toBlob((pngBlob) => {
            if(!pngBlob) {
                console.warn("Could not export Top taxa image");
                return;
            }
            saveAs(pngBlob, pngFilename);
        }, "image/png");
    }

    exportCallback() {
        let exportFormats = this.getAvailableExportFormats();

        let html = "<div class='dialog-centered-content-container'>";
        
        let jsonButtonId = nanoid();
        if(exportFormats.includes("json")) {
            html += "<a id='"+jsonButtonId+"' class='site-report-export-download-btn light-theme-button'>Chart data as JSON</a>";
        }
        
        let csvButtonId = nanoid();
        if(exportFormats.includes("csv")) {
            html += "<a id='"+csvButtonId+"' class='site-report-export-download-btn light-theme-button'>Chart data as CSV</a>";
        }
        let pngButtonId = nanoid();
        if(exportFormats.includes("png")) {
            html += "<a id='"+pngButtonId+"' class='site-report-export-download-btn light-theme-button'>Chart as image</a>";
        }

        let mapToImageButtonId = nanoid();
        if(exportFormats.includes("mapToImage")) {
            html += "<a id='"+mapToImageButtonId+"' class='site-report-export-download-btn light-theme-button'>Chart as image</a>";
        }

        html += "</div>";
        this.sqs.dialogManager.showPopOver("Export chart data", html);

        let exportData = {
            description: this.sqs.config.dataExportDescription,
            reference: Config.dataAttributionString,
            license: "https://creativecommons.org/licenses/by/4.0/",
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
                let filename = this.title.toLowerCase();
                filename = filename.replace(" ", "_");
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
                let filename = this.title.toLowerCase();
                filename = filename.replace(" ", "_");
    
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

        if(exportFormats.includes("png")) {
            $("#"+pngButtonId).on("click", () => {
                let data = this.formatDataForExport(this.data, "png");
            });
        }

        if (exportFormats.includes("mapToImage")) {
            $("#" + mapToImageButtonId).on("click", async () => {
                const canvas = $(".ol-viewport canvas", this.renderIntoNode)[0];
                if (canvas) {
                    canvas.toBlob(function(blob) {
                        saveAs(blob, "sead_graph_data.png");
                    }, 'image/png');
                }
            });
        }

        
    }

    formatDataForExport(data, format = "json") {
        if(format === "png") {
            // Get the first chart instance (there should only be one per module)
            const chartEntry = Array.from(this.chartInstances.values())[0];
            if(!chartEntry) {
                console.error('No chart found for export');
                return;
            }

            if(chartEntry.plotly) {
                Plotly.downloadImage(chartEntry.elementId, {
                    format: 'png',
                    filename: `${chartEntry.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart`
                });
            } else if(chartEntry.chart) {
                const url = chartEntry.chart.toBase64Image();
                const link = document.createElement('a');
                link.download = `${chartEntry.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart.png`;
                link.href = url;
                link.click();
            } else if(chartEntry.canvas) {
                const url = chartEntry.canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `${chartEntry.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart.png`;
                link.href = url;
                link.click();
            }
        }
        return data;
    }
}

export default MosaicTileModule;
