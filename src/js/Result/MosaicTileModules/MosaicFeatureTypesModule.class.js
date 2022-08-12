import MosaicTileModule from "./MosaicTileModule.class";

class MosaicFeatureTypesModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Feature types";
		this.name = "mosaic-feature-types";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.pendingRequestPromise = null;
        this.active = true;
    }

    async render(renderIntoNode) {
        this.active = true;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        this.sqs.setBgLoadingIndicator(renderIntoNode, true);
        
        this.pendingRequestPromise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_feature_types", resultMosaic.requestBatchId);
		this.pendingRequestPromise.then((promiseData) => {
            this.pendingRequestPromise = null;
            if(!this.active) {
                return false;
            }
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}
            let chartSeries = resultMosaic.prepareChartData("feature_type_id", "feature_type_name", promiseData.data);
            this.sqs.setBgLoadingIndicator(renderIntoNode, false);
			this.chart = resultMosaic.renderBarChart(renderIntoNode, chartSeries);
		});
    }
    
    async update() {
        
    }

    async fetch() {
        
    }

    async unrender() {
        this.pendingRequestPromise = null;
        this.active = false;
    }
}

export default MosaicFeatureTypesModule;