import MosaicTileModule from "./MosaicTileModule.class";
import ResultMap from "../ResultMap.class";

class MosaicMapModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Site distribution";
		this.name = "mosaic-map";
        this.domains = ["*"];
        this.resultMap = null;
        this.pendingRequestPromise = null;
        this.active = true;
        this.renderComplete = false;
        this.chartType = "openlayers";
    }

    async render(renderIntoNode) {
        this.renderComplete = false;
        this.active = true;
        this.renderIntoNode = renderIntoNode;
        
        if(this.resultMap == null) {
            this.resultMap = new ResultMap(this.sqs.resultManager, renderIntoNode, false);
        }
        
        await this.resultMap.fetchData();
        if(this.resultMap != null) {
            this.data = this.resultMap.renderData;
        }
        else {
            console.warn("Map unrendered before data was fetched.");
        }
        this.renderComplete = true;
    }

    async fetch() {

    }

    async update() {
        if(this.resultMap != null) {
            this.resultMap.update();
        }
        else {
            this.render(this.renderIntoNode);
        }
	}
    
}

export default MosaicMapModule;