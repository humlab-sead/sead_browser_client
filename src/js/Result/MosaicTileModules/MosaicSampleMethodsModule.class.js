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
    }

    async render(renderIntoNode) {
        this.active = true;
        let resultMosaicModule = this.sqs.resultManager.getModule("mosaic");
        this.sqs.setBgLoadingIndicator(renderIntoNode, true);
        const promiseData = await resultMosaicModule.fetchSiteData(resultMosaicModule.sites, "qse_methods", resultMosaicModule.requestBatchId);
        if(promiseData.requestId < resultMosaicModule.requestBatchId) {
            return false;
        }

        this.data = promiseData.data;

        let chartSeries = resultMosaicModule.prepareChartData("method_id", "method_name", promiseData.data);
        this.sqs.setBgLoadingIndicator(renderIntoNode, false);
        this.chart = resultMosaicModule.renderPieChart(renderIntoNode, chartSeries, "Sampling methods");
    }

    async fetch() {
        
    }

    async update() {
        
    }

    async unrender() {
        this.active = false;

        console.log(this.renderIntoNode);
        console.log($(".result-export-button-mosaic", this.renderIntoNode));
        $(".result-export-button-mosaic", this.renderIntoNode).remove();
    }
}

export default MosaicSampleMethodsModule;