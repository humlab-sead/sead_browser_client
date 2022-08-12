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
    }

    async render(renderIntoNode) {
        this.active = true;
        if(this.resultMap == null) {
            this.resultMap = new ResultMap(this.sqs.resultManager, renderIntoNode);
        }
        await this.resultMap.fetchData();
    }

    async fetch() {

    }

    async update() {
        this.resultMap.update();
	}

    async unrender() {

    }

    unrender() {
        this.resultMap = null;
        this.pendingRequestPromise = null;
        this.active = false;
    }
}

export default MosaicMapModule;