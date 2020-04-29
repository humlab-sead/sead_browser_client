import MosaicTileModule from "./MosaicTileModule.class";

class MosaicSampleMethodsModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Sampling methods";
		this.name = "mosaic-sample-methods";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
    }

    async render(renderIntoNode) {
        let resultMosaicModule = this.sqs.resultManager.getModule("mosaic");
        resultMosaicModule.setLoadingIndicator(renderIntoNode, true);
        let promise = resultMosaicModule.fetchSiteData(resultMosaicModule.sites, "qse_methods", resultMosaicModule.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaicModule.requestBatchId) {
				return false;
			}
            let chartSeries = resultMosaicModule.prepareChartData("method_id", "method_name", promiseData.data);
            resultMosaicModule.setLoadingIndicator(renderIntoNode, false);
			this.chart = resultMosaicModule.renderPieChart(renderIntoNode, chartSeries, "Sampling methods");
		});
    }
}

export default MosaicSampleMethodsModule;