import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";


class MosaicAnalysisMethodsModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Analytical methods";
        this.description = "The analysis methods of the datasets at the sites in the result, by their share of the datasets. Click a method to add it as a filter.";
		this.name = "mosaic-analysis-methods";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.plot = null;
        this.renderComplete = false;
        this.chartType = "html";
        this.showChartSelector = false;
        this.topCount = 5;
        this.view = "chart";
        this.requestId = 0;
    }

    async render(renderIntoNode = null) {
        super.render();
        this.renderComplete = false;
        if(renderIntoNode) {
            this.renderIntoNode = renderIntoNode;
        }
        if(renderIntoNode == null && this.renderIntoNode == null) {
            console.warn("Tried to render "+this.name+" without a node to render into!");
            return false;
        }
        this.active = true;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        let requestId = ++this.requestId;

        $(this.renderIntoNode).empty();

        const varId = nanoid();
        const chartContainerId = `chart-container-${varId}`;
        const tileHtml = `
            <div class="mosaic-tile-content" id="${varId}">
                <div class="mosaic-tile-chart" id="${chartContainerId}"></div>
            </div>
        `;
        $(this.renderIntoNode).append(tileHtml);

        if(this.renderNoDataIfNoSites()) {
            return;
        }

        this.sqs.setLoadingIndicator(`#${chartContainerId}`, true);

        let response = await super.fetchData("/graphs/analysis_methods", JSON.stringify(resultMosaic.sites));
        if(!response) {
            return false;
        }

        let data = await response.json();
        if(requestId != this.requestId) {
            return; //A newer render has taken over
        }
        this.data = data.analysis_methods_datasets;
        this.sqs.setLoadingIndicator(`#${chartContainerId}`, false);

        if(this.data.length == 0) {
            this.renderNoData();
            this.renderComplete = true;
            return;
        }

        this.renderViewToggle([{ id: "chart", label: "Chart" }, { id: "table", label: "Table" }], () => {
            this.renderView();
        });
        this.renderView();
        this.renderComplete = true;
    }

    getMethodColor(method, index) {
        return this.sqs.color.getAnalysisMethodColor(method.method_id) || this.sqs.color.getColorScheme(this.data.length)[index % this.data.length];
    }

    renderView() {
        let chartNode = this.getChartNode();
        let methods = this.data.slice().sort((a, b) => b.dataset_count - a.dataset_count);
        let datasetCount = methods.reduce((sum, method) => sum + method.dataset_count, 0);

        let rows = methods.map((method, index) => {
            let share = datasetCount > 0 ? method.dataset_count / datasetCount : 0;
            return {
                label: method.method_name,
                value: share * 100,
                valueText: this.formatShare(share),
                datasetCount: method.dataset_count,
                color: this.getMethodColor(method, index),
                title: method.method_name+" · "+this.formatCount(method.dataset_count)+(method.dataset_count == 1 ? " dataset" : " datasets"),
                selected: this.isFilterSelection("dataset_methods", method.method_id),
                onClick: this.getFilterToggleCallback("dataset_methods", method.method_id)
            };
        });

        let shownRows = this.takeTopItems(rows, this.topCount, rest => {
            let restCount = rest.reduce((sum, row) => sum + row.datasetCount, 0);
            let share = datasetCount > 0 ? restCount / datasetCount : 0;
            return {
                label: rest.length+" other methods",
                value: share * 100,
                valueText: this.formatShare(share),
                datasetCount: restCount,
                color: "#c8c8c8",
                title: rest.map(row => row.label).join(", "),
                other: true
            };
        });

        let subtitle = "Share of "+this.formatCount(datasetCount)+(datasetCount == 1 ? " dataset" : " datasets");
        if(shownRows.length < rows.length) {
            subtitle += " · top "+this.topCount+" + other";
        }
        this.setMosaicTileSubtitle(subtitle);

        if(this.view == "table") {
            this.renderDataTable(chartNode, [
                { title: "Method" },
                { title: "Datasets", numeric: true },
                { title: "Share", numeric: true }
            ], rows.map(row => [{ text: row.label, color: row.color }, this.formatCount(row.datasetCount), row.valueText]));
            return;
        }

        this.renderShareStrip(chartNode, shownRows);
        this.renderRankedBars(chartNode, shownRows, { showSwatches: true, axisFormat: tick => tick+" %" });
    }

    async update() {
        this.render();
    }

    getAvailableExportFormats() {
        return ["json", "csv", "png"];
    }

    formatDataForExport(data, format = "json") {
        if(format == "csv" || format == "xlsx") {
            let includeColumns = ["description","method_abbrev_or_alt_name","method_name","dataset_count"];

            //remove columns that we don't want to include
            data = data.map((item) => {
                let newItem = {};
                includeColumns.forEach((column) => {
                    newItem[column] = item[column];
                });
                return newItem;
            });
        }

        return data;
    }
}

export default MosaicAnalysisMethodsModule;
