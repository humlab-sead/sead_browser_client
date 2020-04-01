import MosaicTileModule from "./MosaicTileModule.class";

class MosaicFeatureTypesModule extends MosaicTileModule {
    constructor(hqs) {
        super();
        this.hqs = hqs;
        this.title = "Feature types";
		this.name = "mosaic-feature-types";
		this.portals = ["general", "palaeo", "archaeobotany", "isotopes"];
    }

    async render(renderIntoNode) {
        let resultMosaic = this.hqs.resultManager.getModule("mosaic");
        resultMosaic.setLoadingIndicator(renderIntoNode, true);
        
        let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_feature_types", resultMosaic.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}
            let chartSeries = resultMosaic.prepareChartData("feature_type_id", "feature_type_name", promiseData.data);
            resultMosaic.setLoadingIndicator(renderIntoNode, false);
			resultMosaic.renderBarChart(renderIntoNode, chartSeries);
		});
    }
}

export default MosaicFeatureTypesModule;