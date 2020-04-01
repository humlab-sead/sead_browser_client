import MosaicTileModule from "./MosaicTileModule.class";

class MosaicAnalysisMethodsModule extends MosaicTileModule {
    constructor(hqs) {
        super();
        this.hqs = hqs;
        this.title = "Analytical methods";
		this.name = "mosaic-analysis-methods";
		this.portals = ["general", "palaeo", "archaeobotany", "isotopes"];
    }

    async render(renderIntoNode) {
        let resultMosaic = this.hqs.resultManager.getModule("mosaic");
        resultMosaic.setLoadingIndicator(renderIntoNode, true);
        
        let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_analysis_methods", resultMosaic.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}

			let chartSeries = resultMosaic.prepareChartData("method_id", "method_name", promiseData.data);
            resultMosaic.setLoadingIndicator(renderIntoNode, false);
			resultMosaic.renderPieChart(renderIntoNode, chartSeries, "Analysis methods");
		});
    }
}

export default MosaicAnalysisMethodsModule;