import MosaicTileModule from "./MosaicTileModule.class";

class MosaicSampleMethodsModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Sampling methods";
		this.name = "mosaic-sample-methods";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.pendingRequestPromise = null;
        this.active = true;
    }

    async render(renderIntoNode) {
        this.active = true;
        let resultMosaicModule = this.sqs.resultManager.getModule("mosaic");
        this.sqs.setBgLoadingIndicator(renderIntoNode, true);
        this.pendingRequestPromise = resultMosaicModule.fetchSiteData(resultMosaicModule.sites, "qse_methods", resultMosaicModule.requestBatchId);
		this.pendingRequestPromise.then((promiseData) => {
            this.pendingRequestPromise = null;
			if(promiseData.requestId < resultMosaicModule.requestBatchId) {
				return false;
			}
            let chartSeries = resultMosaicModule.prepareChartData("method_id", "method_name", promiseData.data);
            this.sqs.setBgLoadingIndicator(renderIntoNode, false);
			this.chart = resultMosaicModule.renderPieChart(renderIntoNode, chartSeries, "Sampling methods");
		});
    }

    async fetch() {
        
    }

    async update() {
        
    }

    async unrender() {
        this.pendingRequestPromise = null;
        this.active = false;
    }
}

export default MosaicSampleMethodsModule;