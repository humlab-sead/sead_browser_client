import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDendroTreeSpeciesModule extends MosaicTileModule {
    constructor(hqs) {
        super();
        this.hqs = hqs;
        this.title = "Dendro tree species";
		this.name = "mosaic-tree-species";
		this.portals = ["dendro"];
    }

    async render(renderIntoNode) {
        let resultMosaic = this.hqs.resultManager.getModule("mosaic");
        resultMosaic.setLoadingIndicator(renderIntoNode, true);

        let pData = await resultMosaic.fetchSiteData(resultMosaic.sites, "qse_dendro_tree_species", resultMosaic.requestBatchId);
        if(pData.requestId < this.requestBatchId) {
            console.log("Discarded stale data");
            return false;
        }

        let chartSeries = resultMosaic.makeChartSeries(pData.data, "genus_name", "count");
        resultMosaic.setLoadingIndicator(renderIntoNode, false);
        resultMosaic.renderPieChart(renderIntoNode, chartSeries, this.title);
    }
}

export default MosaicDendroTreeSpeciesModule;