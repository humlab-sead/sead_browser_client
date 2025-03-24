import MosaicTileModule from "./MosaicTileModule.class";

class MosaicCeramicsRelativeAgesModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Ceramic relative ages";
		this.name = "mosaic-ceramic-relative-ages";
		this.domains = ["ceramic"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderComplete = false;
        this.chartType = "zingchart";
    }

    async render(renderIntoNode) {
        super.render();
        this.renderComplete = false;
        this.active = true;
        this.renderIntoNode = renderIntoNode;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        this.sqs.setLoadingIndicator(renderIntoNode, true);

        this.pendingRequestPromise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_ceramics_relative_ages", resultMosaic.requestBatchId);

        let pData = await this.pendingRequestPromise;
        this.pendingRequestPromise = null;
        if(!this.active) {
            return false;
        }
        if(pData.requestId < this.requestBatchId) {
            console.log("Discarded stale data");
            return false;
        }

        this.data = pData.data;

        let chartSeries = resultMosaic.makeChartSeries(pData.data, "relative_age_name", "count");
        this.sqs.setLoadingIndicator(renderIntoNode, false);
        this.chart = resultMosaic.renderBarChart(renderIntoNode, chartSeries, this.title);
        this.renderComplete = true;
    }

    async update() {
        
    }

    async fetchData() {
        
    }

}

export default MosaicCeramicsRelativeAgesModule;