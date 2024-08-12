import Config from "../../../config/config.json";
import MosaicTileModule from "./MosaicTileModule.class";

class MosaicSpeciesModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Species";
		this.name = "mosaic-species";
		this.domains = ["palaeoentomology", "archaeobotany"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.renderComplete = false;
        this.chartType = "";
    }

    async render(renderIntoNode = null) {
        super.render();
        this.renderComplete = false;
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
        

        //Fetch all species found in these sites (resultMosaic.sites)
        let taxaList = await new Promise((resolve, reject) => {
            $.ajax({
                method: "post",
                url: Config.dataServerAddress+"/taxa",
                data: resultMosaic.sites,
                success: (data) => {
                    resolve(data);
                },
                error: () => {
                    reject();
                }
            });
        });
        
        this.sqs.setLoadingIndicator(this.renderIntoNode, false);
        //this.chart = resultMosaic.renderPieChart(this.renderIntoNode, chartSeries, "Analysis methods");
        this.renderComplete = true;
    }

    async update() {
        this.render();
    }

    async fetch() {
    }
}

export default MosaicSpeciesModule;