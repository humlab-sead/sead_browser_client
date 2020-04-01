import MosaicTileModule from "./MosaicTileModule.class";
import ResultMap from "../ResultMap.class";

class MosaicMapModule extends MosaicTileModule {
    constructor(hqs) {
        super();
        this.hqs = hqs;
        this.title = "Site distribution";
		this.name = "mosaic-map";
        this.portals = ["*"];
        this.resultMap = null;
    }

    async render(renderIntoNode) {
        if(this.resultMap == null) {
            this.resultMap = new ResultMap(this.hqs.resultManager, renderIntoNode);
        }
        await this.resultMap.fetchData();
    }

    unrender() {
        this.resultMap = null;
    }
}

export default MosaicMapModule;