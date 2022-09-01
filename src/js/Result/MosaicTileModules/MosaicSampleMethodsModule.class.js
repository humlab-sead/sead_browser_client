import MosaicTileModule from "./MosaicTileModule.class";

class MosaicSampleMethodsModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Sampling methods";
		this.name = "mosaic-sample-methods";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
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
        let resultMosaicModule = this.sqs.resultManager.getModule("mosaic");
        this.sqs.setLoadingIndicator(this.renderIntoNode, true);
        const promiseData = await resultMosaicModule.fetchSiteData(resultMosaicModule.sites, "qse_methods", resultMosaicModule.requestBatchId);
        if(promiseData.requestId < resultMosaicModule.requestBatchId) {
            return false;
        }

        this.data = promiseData.data;

        let chartSeries = resultMosaicModule.prepareChartData("method_id", "method_name", promiseData.data);
        this.sqs.setLoadingIndicator(this.renderIntoNode, false);
        this.chart = resultMosaicModule.renderPieChart(this.renderIntoNode, chartSeries, "Sampling methods");
    }

    async fetch() {
        
    }

    async update() {
        this.render();
    }

    async unrender() {
        this.active = false;

        console.log(this.renderIntoNode);
        console.log($(".result-export-button-mosaic", this.renderIntoNode));
        $(".result-export-button-mosaic", this.renderIntoNode).remove();
    }
}

export default MosaicSampleMethodsModule;