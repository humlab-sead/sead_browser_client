import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";

class MosaicAnalysisMethodsModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Analytical methods";
		this.name = "mosaic-analysis-methods";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
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
        
        let promiseData = await resultMosaic.fetchSiteData(resultMosaic.sites, "qse_analysis_methods", resultMosaic.requestBatchId);
		if(!this.active) {
            return false;
        }
        if(promiseData.requestId < resultMosaic.requestBatchId) {
            console.warn("Discarding old data for MosaicAnalysisMethodsModule");
            return false;
        }

        this.data = promiseData.data;
        let chartSeries = resultMosaic.prepareChartData("method_id", "method_name", promiseData.data);
        this.sqs.setLoadingIndicator(this.renderIntoNode, false);
        this.chart = resultMosaic.renderPieChart(this.renderIntoNode, chartSeries, "Analysis methods");
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

export default MosaicAnalysisMethodsModule;