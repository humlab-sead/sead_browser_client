import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDendroBuildingTypesModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Dendro building types";
		this.name = "mosaic-building-types";
		this.domains = ["dendro"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
    }

    async render(renderIntoNode) {
        this.active = true;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        this.sqs.setLoadingIndicator(renderIntoNode, true);

        this.pendingRequestPromise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_dendro_building_types", resultMosaic.requestBatchId);

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

        let chartSeries = resultMosaic.makeChartSeries(pData.data, "group_description", "No. of samples");
        this.sqs.setLoadingIndicator(renderIntoNode, false);
        this.chart = resultMosaic.renderPieChart(renderIntoNode, chartSeries, this.title);
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

export default MosaicDendroBuildingTypesModule;