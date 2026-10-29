import MosaicTileModule from "./MosaicTileModule.class";
import { nanoid } from "nanoid";
import Chart from 'chart.js/auto';

Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";

/**
 * DendroBaseModule - Base class for dendrochronology tile modules
 *
 * Provides shared utility functions for parsing and processing dendro data, and renders the data in one of three ways,
 * chosen by the subclass with this.display:
 * - "categories": a ranked bar per category, e.g. per tree species. fetchData returns { categories: [{ name, count, color }] }
 * - "shares": the share of each of a few fixed answers, e.g. bark or no bark. fetchData returns { categories: [{ name, count }] }
 * - "histogram": samples per range of a numeric variable. fetchData returns { series: [{ name, values, exportKey }] }
 * Each can also be shown as a table, and says how many of the samples in the result it covers.
 */
class DendroBaseModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.domains = ["dendrochronology"];
        this.requestId = 0;
        this.active = true;
        this.data = null;
        this.renderComplete = false;
        this.chart = null;
        this.chartType = "html";
        this.showChartSelector = false; // Dendro modules don't need chart selector
        this.display = "categories";
        this.view = "chart";
        this.topCount = 10;
        this.showAll = false;
        this.coverageNoun = "samples"; // what the data is counted in
        this.categoryNoun = "category"; // what a category is, for the subtitle and the table
        this.valueLabel = "Value"; // the axis title of a histogram
        this.showCoverage = true; // whether to say how many of the samples in the result have data
    }

    /**
     * Parse numeric dendro values handling special formats
     */
    parseDendroNumericValue(value) {
        if(!value || value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim();

        if(stringValue === "" || stringValue.toLowerCase() === "undefined") {
            return null;
        }

        // Handle greater than (>28 becomes 29)
        if(stringValue.startsWith(">")) {
            const num = parseFloat(stringValue.substring(1));
            return isNaN(num) ? null : num + 1;
        }

        // Handle less than (<28 becomes 27)
        if(stringValue.startsWith("<")) {
            const num = parseFloat(stringValue.substring(1));
            return isNaN(num) ? null : num - 1;
        }

        // Handle ranges (71-72 becomes 71)
        if(stringValue.includes("-")) {
            const parts = stringValue.split("-");
            const num = parseFloat(parts[0]);
            return isNaN(num) ? null : num;
        }

        // Strip out uncertainty symbols: ?, ~, and any whitespace
        const cleaned = stringValue.replace(/[?~\s]/g, "");

        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    /**
     * Parse binary dendro values (Yes/No)
     */
    parseDendroBinaryValue(value) {
        if(!value || value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim();

        if(stringValue === "" || stringValue.toLowerCase() === "undefined") {
            return null;
        }

        const cleaned = stringValue.replace(/[?~\s]/g, "").toLowerCase();

        if(cleaned === "ja" || cleaned === "yes" || cleaned === "y" || cleaned === "j") {
            return "Yes";
        }

        if(cleaned === "nej" || cleaned === "no" || cleaned === "n") {
            return "No";
        }

        return null;
    }

    /**
     * Parse ternary dendro values (Yes/Maybe/No)
     */
    parseDendroTernaryValue(value, variableName = "") {
        if(!value || value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim().toLowerCase();

        if(stringValue === "") {
            return null;
        }

        if(variableName === "Waney edge (W)") {
            if(stringValue === "w" || stringValue === "b") {
                return "Yes";
            }

            if(stringValue.includes("ej w") || stringValue === "nej") {
                return "No";
            }

            if(stringValue.includes("nära") ||
               stringValue.includes("near") ||
               stringValue.includes("?") ||
               stringValue === "undefined" ||
               stringValue === "indeterminable" ||
               stringValue.includes("eller") ||
               stringValue.includes("or")) {
                return "Maybe";
            }
        }

        return null;
    }

    /**
     * Parse the categories of a numeric variable into a list of values, one per sample
     */
    parseNumericCategories(categories) {
        const values = [];
        categories.forEach(cat => {
            const parsedValue = this.parseDendroNumericValue(cat.name);
            if(parsedValue !== null) {
                for(let i = 0; i < cat.count; i++) {
                    values.push(parsedValue);
                }
            }
        });
        return values;
    }

    /**
     * Fetch variable data from API
     */
    async fetchVariable(variableName, sites, requestId, type = 'categorical') {
        const requestBody = {
            sites: sites,
            requestId: requestId,
            variable: variableName
        };

        try {
            const response = await super.fetchData("/dendro/dynamicchart", JSON.stringify(requestBody));

            if(!response) {
                return { variable: variableName, data: null, error: true, type: type };
            }

            const data = await response.json();

            return { variable: variableName, data: data, error: false, type: type };
        } catch(error) {
            console.warn(`Failed to fetch ${variableName}:`, error);
            return { variable: variableName, data: null, error: true, type: type };
        }
    }

    /**
     * Fetch sample types data
     */
    async fetchSampleTypes(sites, requestId) {
        const requestBody = {
            sites: sites,
            requestId: requestId
        };

        try {
            const response = await super.fetchData("/site/sampletypes", JSON.stringify(requestBody));

            if(!response) {
                return { variable: 'Sample types', data: null, error: true, type: 'categorical' };
            }

            const data = await response.json();

            return { variable: 'Sample types', data: data, error: false, type: 'sampleTypes' };
        } catch(error) {
            console.warn('Failed to fetch Sample types:', error);
            return { variable: 'Sample types', data: null, error: true, type: 'categorical' };
        }
    }

    /**
     * Fetch building types data
     */
    async fetchBuildingTypes(sites, requestId) {
        const requestBody = {
            sites: sites,
            requestId: requestId
        };

        try {
            const response = await super.fetchData("/site/buildingtypes", JSON.stringify(requestBody));

            if(!response) {
                return { variable: 'Building types', data: null, error: true, type: 'categorical' };
            }

            const data = await response.json();

            return { variable: 'Building types', data: data, error: false, type: 'buildingTypes' };
        } catch(error) {
            console.warn('Failed to fetch Building types:', error);
            return { variable: 'Building types', data: null, error: true, type: 'categorical' };
        }
    }

    /**
     * Fetch the number of sample groups at the sites in the result
     */
    async fetchSampleGroupsCount() {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        const response = await super.fetchData("/graphs/data_count", JSON.stringify({ siteIds: resultMosaic.sites, path: "sample_groups" }));
        const data = await response.json();
        return data.item_count;
    }

    /**
     * Fetch the data the tile shows, in the shape this.display calls for, or false if there is none.
     * Implemented by the subclasses.
     */
    async fetchData(requestId) {
        return false;
    }

    /**
     * How many there are in all of what the data is counted in, for the coverage line: a number or a promise for one
     */
    getCoverageTotal() {
        return this.getTotalSamplesCount();
    }

    async render(renderIntoNode = null) {
        super.render();
        this.renderComplete = false;
        if(renderIntoNode) {
            this.renderIntoNode = renderIntoNode;
        }
        if(this.renderIntoNode == null) {
            console.warn("Tried to render "+this.name+" without a node to render into!");
            return false;
        }
        this.active = true;
        const requestId = ++this.requestId;

        this.destroyChart();
        $(this.renderIntoNode).empty();

        const varId = nanoid();
        const chartContainerId = `chart-container-${varId}`;
        $(this.renderIntoNode).append(`
            <div class="mosaic-tile-content" id="${varId}">
                <div class="mosaic-tile-chart" id="${chartContainerId}"></div>
            </div>
        `);

        if(this.renderNoDataIfNoSites()) {
            return;
        }

        this.sqs.setLoadingIndicator(`#${chartContainerId}`, true);

        let data = false;
        try {
            data = await this.fetchData(requestId);
        } catch(error) {
            console.error(`Error fetching data for ${this.name}:`, error);
        }

        if(requestId != this.requestId) {
            return; //A newer render has taken over
        }
        this.sqs.setLoadingIndicator(`#${chartContainerId}`, false);

        if(!this.active) {
            this.renderComplete = true;
            return false;
        }

        if(!data) {
            this.data = null;
            this.renderNoData();
            this.renderComplete = true;
            return;
        }

        this.data = data;
        this.renderViewToggle([{ id: "chart", label: "Chart" }, { id: "table", label: "Table" }], () => {
            this.renderView();
        });
        this.renderView();
        this.renderComplete = true;
    }

    renderView() {
        this.destroyChart();
        this.exportImageRows = null;
        let chartNode = this.getChartNode();

        if(this.display == "histogram") {
            this.renderHistogramView(chartNode);
        }
        else if(this.display == "shares") {
            this.renderSharesView(chartNode);
        }
        else {
            this.renderCategoriesView(chartNode);
        }
    }

    getCategoryRows() {
        const baseColor = this.sqs.color.colors.baseColor;
        const total = this.data.categories.reduce((sum, cat) => sum + cat.count, 0);
        return this.data.categories.slice().sort((a, b) => b.count - a.count).map(cat => ({
            label: cat.name,
            value: cat.count,
            valueText: this.formatCount(cat.count),
            share: total > 0 ? cat.count / total : 0,
            color: cat.color || baseColor,
            title: cat.name+" · "+this.formatCount(cat.count)+" "+this.coverageNoun
        }));
    }

    renderCategoriesView(chartNode) {
        const rows = this.getCategoryRows();
        const total = rows.reduce((sum, row) => sum + row.value, 0);
        const withColors = this.data.categories.some(cat => cat.color);

        let subtitle = this.capitalize(this.coverageNoun)+" per "+this.categoryNoun;
        if(rows.length > this.topCount && this.view == "chart" && !this.showAll) {
            subtitle += " · top "+this.topCount+" of "+this.formatCount(rows.length);
        }
        this.setMosaicTileSubtitle(subtitle);

        if(this.view == "table") {
            this.renderDataTable(chartNode, [
                { title: this.capitalize(this.categoryNoun) },
                { title: this.capitalize(this.coverageNoun), numeric: true },
                { title: "Share", numeric: true }
            ], rows.map(row => [withColors ? { text: row.label, color: row.color } : row.label, row.valueText, this.formatShare(row.share)]));
        }
        else {
            this.renderRankedBars(chartNode, this.showAll ? rows : rows.slice(0, this.topCount), { showSwatches: withColors });

            if(rows.length > this.topCount) {
                let toggleNode = $("<button type='button' class='sqs-link-btn mosaic-show-all-btn'></button>");
                toggleNode.text(this.showAll ? "Show the top "+this.topCount : "Show all "+this.formatCount(rows.length));
                toggleNode.on("click", () => {
                    this.showAll = !this.showAll;
                    this.renderView();
                });
                chartNode.append(toggleNode);
            }
        }

        this.renderCoverageLine(chartNode, total);
    }

    /**
     * The colors of the answers of a yes/no variable, which differ in lightness and not only in hue
     */
    getShareColor(name) {
        const colors = {
            "Yes": this.sqs.color.colors.baseColor,
            "Maybe": "#7fa3c7",
            "No": "#d0d0d0"
        };
        return colors[name] || "#a0a0a0";
    }

    renderSharesView(chartNode) {
        const total = this.data.categories.reduce((sum, cat) => sum + cat.count, 0);
        const rows = this.data.categories.map(cat => {
            const share = total > 0 ? cat.count / total : 0;
            return {
                label: cat.name,
                value: share * 100,
                valueText: this.formatShare(share),
                count: cat.count,
                color: this.getShareColor(cat.name),
                title: cat.name+" · "+this.formatCount(cat.count)+" "+this.coverageNoun
            };
        });

        this.setMosaicTileSubtitle("Share of "+this.formatCount(total)+" "+this.coverageNoun+" with a recorded value");

        if(this.view == "table") {
            this.renderDataTable(chartNode, [
                { title: "Recorded as" },
                { title: this.capitalize(this.coverageNoun), numeric: true },
                { title: "Share", numeric: true }
            ], rows.map(row => [{ text: row.label, color: row.color }, this.formatCount(row.count), row.valueText]));
        }
        else {
            this.renderShareStrip(chartNode, rows);
            this.renderRankedBars(chartNode, rows, { showSwatches: true, axisFormat: tick => tick+" %" });
        }

        this.renderCoverageLine(chartNode, total);
    }

    /**
     * Function: getHistogramBins
     * Bins of a round width spanning the values, at most about maxBins of them. Values which are all whole numbers,
     * such as counts of rings, get bins of whole numbers labelled by the first and last number in them.
     */
    getHistogramBins(values, maxBins = 20) {
        const min = values.reduce((m, value) => Math.min(m, value), Infinity);
        const max = values.reduce((m, value) => Math.max(m, value), -Infinity);
        const integers = values.every(value => Number.isInteger(value));

        let width = 1;
        const rawWidth = (max - min) / maxBins;
        if(rawWidth > 0) {
            const magnitude = Math.pow(10, Math.floor(Math.log10(rawWidth)));
            width = [1, 2, 5, 10].map(f => f * magnitude).find(w => w >= rawWidth);
            if(integers) {
                width = Math.max(1, Math.ceil(width));
            }
        }

        const start = Math.floor(min / width) * width;
        const binCount = Math.max(1, Math.floor((max - start) / width) + 1);
        const round = value => Math.round(value * 1000) / 1000;
        const bins = [];
        for(let i = 0; i < binCount; i++) {
            const binStart = round(start + i * width);
            const binEnd = integers ? binStart + width - 1 : round(binStart + width);
            bins.push({
                startValue: binStart,
                endValue: binEnd,
                label: integers && width == 1 ? String(binStart) : binStart+"–"+binEnd
            });
        }

        return {
            bins: bins,
            binIndex: value => Math.min(binCount - 1, Math.floor((value - start) / width))
        };
    }

    /**
     * The histogram of each series, over bins shared by all of them
     */
    getHistogram() {
        if(this.histogram && this.histogram.data === this.data) {
            return this.histogram;
        }
        const allValues = [].concat(...this.data.series.map(series => series.values));
        const { bins, binIndex } = this.getHistogramBins(allValues);
        const series = this.data.series.map(series => {
            const counts = new Array(bins.length).fill(0);
            series.values.forEach(value => {
                counts[binIndex(value)]++;
            });
            return Object.assign({}, series, { counts: counts });
        });
        this.histogram = { data: this.data, bins: bins, series: series };
        return this.histogram;
    }

    getMedian(values) {
        const sorted = values.slice().sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
        return Math.round(median * 10) / 10;
    }

    getHistogramSubtitle() {
        const values = this.data.series[0].values;
        return this.formatCount(values.length)+" "+this.coverageNoun+" · median "+this.formatCount(this.getMedian(values));
    }

    getSeriesColors() {
        return [this.sqs.color.colors.baseColor, "#8fb0cf"];
    }

    renderHistogramView(chartNode) {
        const { bins, series } = this.getHistogram();
        const colors = this.getSeriesColors();
        //Two series face each other, the second one drawn downwards
        const mirrored = series.length == 2;

        this.setMosaicTileSubtitle(this.getHistogramSubtitle());

        if(this.view == "table") {
            const columns = [{ title: this.valueLabel }].concat(series.map(s => ({ title: series.length > 1 ? s.name : this.capitalize(this.coverageNoun), numeric: true })));
            const rows = [];
            bins.forEach((bin, index) => {
                if(series.some(s => s.counts[index] > 0)) {
                    rows.push([bin.label].concat(series.map(s => this.formatCount(s.counts[index]))));
                }
            });
            this.renderDataTable(chartNode, columns, rows);
            this.renderCoverageLine(chartNode, series[0].values.length);
            return;
        }

        chartNode.addClass("mosaic-tile-chart-fill");

        if(series.length > 1) {
            let legendNode = $("<div class='mosaic-chart-legend'></div>");
            series.forEach((s, index) => {
                let itemNode = $("<span class='mosaic-chart-legend-item'></span>");
                itemNode.append($("<span class='sqs-dot'></span>").css("background-color", colors[index % colors.length]));
                itemNode.append($("<span></span>").text(s.name+(mirrored && index == 1 ? " (drawn downwards)" : "")));
                legendNode.append(itemNode);
            });
            chartNode.append(legendNode);
        }

        let canvasNode = $("<div class='mosaic-tile-canvas'><canvas></canvas></div>");
        chartNode.append(canvasNode);

        const colorSet = this.sqs.color.colors;
        const tickFont = { size: this.sqs.scalePx(11) };
        const coverageNoun = this.coverageNoun;
        const valueLabel = this.valueLabel;

        this.chart = new Chart(canvasNode.find("canvas")[0], {
            type: "bar",
            data: {
                labels: bins.map(bin => bin.label),
                datasets: series.map((s, index) => ({
                    label: s.name,
                    data: mirrored && index == 1 ? s.counts.map(count => -count) : s.counts,
                    backgroundColor: colors[index % colors.length],
                    hoverBackgroundColor: colorSet.textColor,
                    borderRadius: 2,
                    borderSkipped: false,
                    categoryPercentage: 0.9,
                    barPercentage: 1
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: colorSet.textColor,
                        padding: 10,
                        cornerRadius: 6,
                        displayColors: series.length > 1,
                        callbacks: {
                            title: items => valueLabel+": "+items[0].label,
                            label: context => {
                                const count = Math.abs(context.parsed.y);
                                return (series.length > 1 ? context.dataset.label+": " : "")+count.toLocaleString("en-GB")+" "+coverageNoun;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        border: { color: colorSet.borderColor },
                        ticks: { color: colorSet.textMutedColor, font: tickFont, maxRotation: 0, autoSkipPadding: 12 },
                        title: { display: true, text: valueLabel, color: colorSet.textMutedColor, font: tickFont }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { color: "#ebebeb" },
                        border: { display: false },
                        ticks: {
                            color: colorSet.textMutedColor,
                            font: tickFont,
                            precision: 0,
                            maxTicksLimit: 5,
                            callback: value => this.formatAxisCount(Math.abs(value))
                        }
                    }
                }
            }
        });

        this.renderCoverageLine(chartNode, series[0].values.length);
    }

    renderCoverageLine(chartNode, covered) {
        if(this.showCoverage) {
            this.renderCoverage(chartNode, covered, this.getCoverageTotal(), this.coverageNoun);
        }
    }

    capitalize(text) {
        return text.charAt(0).toUpperCase()+text.slice(1);
    }

    destroyChart() {
        if(this.chart && typeof this.chart.destroy === "function") {
            this.chart.destroy();
        }
        this.chart = null;
    }

    async update() {
        await this.render(this.renderIntoNode);
    }

    async unrender() {
        this.destroyChart();
        return super.unrender();
    }

    getAvailableExportFormats() {
        return ["json", "csv", "xlsx", "png"];
    }

    formatDataForExport(data, format = "json") {
        if(!data) return [];

        if(this.display == "histogram") {
            const { bins, series } = this.getHistogram();
            return bins.map((bin, index) => {
                let row = {
                    bin_start: bin.startValue,
                    bin_end: bin.endValue
                };
                series.forEach(s => {
                    row[s.exportKey || "sample_count"] = s.counts[index];
                });
                return row;
            });
        }

        if(data.categories) {
            return data.categories.map(cat => ({
                category: cat.name,
                count: cat.count
            }));
        }

        return Array.isArray(data) ? data : [data];
    }
}

export default DendroBaseModule;
