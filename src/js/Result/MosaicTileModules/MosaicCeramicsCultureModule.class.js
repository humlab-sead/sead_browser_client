import MosaicTileModule from "./MosaicTileModule.class";

class MosaicCeramicsCultureModule extends MosaicTileModule {
    constructor(hqs) {
        super();
        this.hqs = hqs;
        this.title = "Ceramic cultures";
		this.name = "mosaic-ceramic-cultures";
		this.portals = ["ceramic"];
    }

    async render(renderIntoNode) {
        let resultMosaic = this.hqs.resultManager.getModule("mosaic");
        resultMosaic.setLoadingIndicator(renderIntoNode, true);

        let pData = await resultMosaic.fetchSiteData(resultMosaic.sites, "qse_ceramics_culture", resultMosaic.requestBatchId);
        if(pData.requestId < this.requestBatchId) {
            console.log("Discarded stale data");
            return false;
        }

        let chartSeries = resultMosaic.makeChartSeries(pData.data, "Culture", "count");
        resultMosaic.setLoadingIndicator(renderIntoNode, false);
        resultMosaic.renderPieChart(renderIntoNode, chartSeries, this.title);
    }
}

export default MosaicCeramicsCultureModule;