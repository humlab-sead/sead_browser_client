import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDendroTreeSpeciesModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Dendro tree species";
		this.name = "mosaic-tree-species";
		this.domains = ["dendro"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        console.log(this.name);
    }

    async render(renderIntoNode) {
        console.log(this.name);
        this.active = true;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        this.sqs.setBgLoadingIndicator(renderIntoNode, true);

        let pData = await resultMosaic.fetchSiteData(resultMosaic.sites, "qse_dendro_tree_species", resultMosaic.requestBatchId);
        
        if(!this.active) {
            return false;
        }
        if(pData.requestId < this.requestBatchId) {
            console.log("Discarded stale data");
            return false;
        }

        console.log(pData);
        this.data = pData.data;

        let chartSeries = resultMosaic.makeChartSeries(pData.data, "genus_name", "count");
        this.sqs.setBgLoadingIndicator(renderIntoNode, false);
        this.chart = resultMosaic.renderPieChart(renderIntoNode, chartSeries, this.title);
    }
    
    async update() {
        console.log(this.name);
    }

    async fetch() {
        
    }

    async unrender() {
        this.active = false;
    }
}

export default MosaicDendroTreeSpeciesModule;