import MosaicTileModule from "./MosaicTileModule.class";

class MosaicCeramicsTypeCountModule extends MosaicTileModule {
    constructor(hqs) {
        super();
        this.hqs = hqs;
        this.title = "Ceramic type count";
		this.name = "mosaic-ceramic-type-count";
		this.portals = ["ceramic"];
    }

    async render(renderIntoNode) {
        let resultMosaic = this.hqs.resultManager.getModule("mosaic");
        resultMosaic.setLoadingIndicator(renderIntoNode, true);

        let pData = await resultMosaic.fetchSiteData(resultMosaic.sites, "qse_ceramics_type_count", resultMosaic.requestBatchId);
        if(pData.requestId < this.requestBatchId) {
            console.log("Discarded stale data");
            return false;
        }

        let chartSeries = resultMosaic.makeChartSeries(pData.data, "type_name", "count");
        resultMosaic.setLoadingIndicator(renderIntoNode, false);
        resultMosaic.renderPieChart(renderIntoNode, chartSeries, this.title);
    }
}

export default MosaicCeramicsTypeCountModule;