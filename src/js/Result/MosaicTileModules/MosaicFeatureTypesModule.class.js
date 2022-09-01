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
        this.data = null;
        this.renderIntoNode = null;
        this.requestId = 0;
    }

    async render(renderIntoNode = null) {
        if(renderIntoNode) {
            this.renderIntoNode = renderIntoNode;
        }
        if(renderIntoNode == null && this.renderIntoNode == null) {
            console.warn("Tried to render "+this.name+" without a node to render into!");
            return false;
        }
        this.active = true;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        this.sqs.setLoadingIndicator(this.renderIntoNode, true);
        
        const promiseData = await resultMosaic.fetchSiteData(resultMosaic.sites, "qse_feature_types", ++this.requestId);
        if(!this.active) {
            return false;
        }
        if(promiseData.requestId < this.requestId) {
            console.log(this.name+" dropped old request data with id "+this.requestId);
            return false;
        }

        this.data = promiseData.data;

        let chartSeries = resultMosaic.prepareChartData("feature_type_id", "feature_type_name", this.data);
        this.sqs.setLoadingIndicator(this.renderIntoNode, false);
        this.chart = resultMosaic.renderBarChart(this.renderIntoNode, chartSeries);
    }
    
    async update() {
        this.render();
    }

    async fetch() {
        
    }

    async unrender() {
        this.pendingRequestPromise = null;
        this.active = false;
    }
}

export default MosaicFeatureTypesModule;