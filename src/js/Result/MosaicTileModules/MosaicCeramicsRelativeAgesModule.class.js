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
    }

    async render(renderIntoNode) {
        this.active = true;
        this.renderIntoNode = renderIntoNode;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        this.sqs.setBgLoadingIndicator(renderIntoNode, true);

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

        let chartSeries = resultMosaic.makeChartSeries(pData.data, "relative_age_name", "count");
        this.sqs.setBgLoadingIndicator(renderIntoNode, false);
        this.chart = resultMosaic.renderBarChart(renderIntoNode, chartSeries, this.title);
    }

    async update() {
        
    }

    async fetch() {
        
    }

    async unrender() {
        this.pendingRequestPromise = null;
        this.active = false;
    }
}

export default MosaicCeramicsRelativeAgesModule;