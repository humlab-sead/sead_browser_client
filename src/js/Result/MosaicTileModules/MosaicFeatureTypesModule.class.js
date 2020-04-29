import MosaicTileModule from "./MosaicTileModule.class";

class MosaicFeatureTypesModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Feature types";
		this.name = "mosaic-feature-types";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
    }

    async render(renderIntoNode) {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        resultMosaic.setLoadingIndicator(renderIntoNode, true);
        
        let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_feature_types", resultMosaic.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}
            let chartSeries = resultMosaic.prepareChartData("feature_type_id", "feature_type_name", promiseData.data);
            resultMosaic.setLoadingIndicator(renderIntoNode, false);
			this.chart = resultMosaic.renderBarChart(renderIntoNode, chartSeries);
		});
    }
}

export default MosaicFeatureTypesModule;