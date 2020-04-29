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
    }

    async render(renderIntoNode) {
        if(this.resultMap == null) {
            this.resultMap = new ResultMap(this.sqs.resultManager, renderIntoNode);
        }
        await this.resultMap.fetchData();
    }

    unrender() {
        this.resultMap = null;
    }
}

export default MosaicMapModule;