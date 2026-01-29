import MosaicTileModule from "./MosaicTileModule.class";

class MosaicFeatureTypesModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Top feature types";
		this.name = "mosaic-feature-types";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.requestId = 0;
        this.plot = null;
        this.renderComplete = false;
        this.chartType = "plotly";
        this.showChartSelector = false;
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

        // Clear previous content
        $(this.renderIntoNode).empty();

        // Create a container with a header/title bar and a dedicated chart container for Plotly
        const varId = (typeof nanoid === 'function') ? nanoid() : Math.random().toString(36).substr(2, 9);
        const chartContainerId = `chart-container-${varId}`;
        const tileHtml = `
            <div class="feature-types-tile-container" id="${varId}" style="display: flex; flex-direction: column; height: 100%; width: 100%;">
                <div class="feature-types-tile-header" style="flex: 0 0 auto;">
                    <h3 class="feature-types-tile-title" style="margin: 0; font-size: 1.2em;">${this.title}</h3>
                </div>
                <div class="feature-types-tile-chart" id="${chartContainerId}" style="flex: 1 1 0; min-height: 200px; width: 100%;"></div>
            </div>
        `;
        $(this.renderIntoNode).append(tileHtml);

        // Show loading indicator on the chart container only
        this.sqs.setLoadingIndicator(`#${chartContainerId}`, true);

        let response = await fetch(this.sqs.config.dataServerAddress+"/graphs/feature_types", {
            method: "POST",
            mode: "cors",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ siteIds: resultMosaic.sites })
        });
        let data = await response.json();

        data.summary_data.sort((a, b) => {
            return b.count - a.count;
        });

        let chartSeries = [];
        data.summary_data.forEach((featureType) => {
            chartSeries.push({
                label: featureType.name,
                value: featureType.count
            });
        });

        //only keep top 20
        chartSeries = chartSeries.slice(0, 20);

        this.data = chartSeries;

        this.sqs.setLoadingIndicator(`#${chartContainerId}`, false);
        resultMosaic.renderBarChartPlotly(`#${chartContainerId}`, chartSeries).then(plot => {
            this.plot = plot;
        });
        this.renderComplete = true;
    }
    
    async update() {
        this.render();
    }

    async fetchData() {
        
    }

    getAvailableExportFormats() {
        return ["json", "csv", "png"];
    }

    formatDataForExport(data, format = "json") {
        if(format == "png") {
            let resultMosaic = this.sqs.resultManager.getModule("mosaic");
            resultMosaic.exportPieChartPlotly(this.renderIntoNode, this.plot);
        }

        return data;
    }

}

export default MosaicFeatureTypesModule;