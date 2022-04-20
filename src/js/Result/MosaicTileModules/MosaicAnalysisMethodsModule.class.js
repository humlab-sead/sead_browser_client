import MosaicTileModule from "./MosaicTileModule.class";

class MosaicAnalysisMethodsModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Analytical methods";
		this.name = "mosaic-analysis-methods";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
    }

    async render(renderIntoNode) {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        resultMosaic.setLoadingIndicator(renderIntoNode, true);
        
        let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_analysis_methods", resultMosaic.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
                console.warn("Discarding old data for MosaicAnalysisMethodsModule");
				return false;
			}

			let chartSeries = resultMosaic.prepareChartData("method_id", "method_name", promiseData.data);
            resultMosaic.setLoadingIndicator(renderIntoNode, false);
			this.chart = resultMosaic.renderPieChart(renderIntoNode, chartSeries, "Analysis methods");
		});
    }
}

export default MosaicAnalysisMethodsModule;