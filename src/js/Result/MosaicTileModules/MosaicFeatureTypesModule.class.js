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
        this.sqs.setLoadingIndicator(this.renderIntoNode, true);
        
        
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
        
        this.sqs.setLoadingIndicator(this.renderIntoNode, false);
        resultMosaic.renderBarChartPlotly(this.renderIntoNode, chartSeries).then(plot => {
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