import MosaicTileModule from "./MosaicTileModule.class";

class MosaicCeramicsRelativeAgesModule extends MosaicTileModule {
    constructor(hqs) {
        super();
        this.hqs = hqs;
        this.title = "Ceramic relative ages";
		this.name = "mosaic-ceramic-relative-ages";
		this.portals = ["ceramic"];
    }

    async render(renderIntoNode) {
        this.renderIntoNode = renderIntoNode;
        let resultMosaic = this.hqs.resultManager.getModule("mosaic");
        resultMosaic.setLoadingIndicator(renderIntoNode, true);

        let pData = await resultMosaic.fetchSiteData(resultMosaic.sites, "qse_ceramics_relative_ages", resultMosaic.requestBatchId);
        if(pData.requestId < this.requestBatchId) {
            console.log("Discarded stale data");
            return false;
        }

        let chartSeries = resultMosaic.makeChartSeries(pData.data, "relative_age_name", "count");
        resultMosaic.setLoadingIndicator(renderIntoNode, false);
        this.chart = resultMosaic.renderBarChart(renderIntoNode, chartSeries, this.title);
    }
}

export default MosaicCeramicsRelativeAgesModule;