import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDendroOverviewModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Data overview";
		this.name = "mosaic-dendro-overview";
        this.requestId = 0;
        this.renderIntoNode = null;
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderComplete = false;
        this.chartType = "plotly";
    }

    async fetch(renderIntoNode = null) {
        console.log("fetch");
    }

    async render(renderIntoNode) {
        console.log("render", renderIntoNode);
        super.render();
        this.renderComplete = false;
        this.active = true;
        this.renderIntoNode = renderIntoNode;

        //fetch a summary of all dendro variables
        //like: waney edge: 100 YES : 200 NO
        //tree rings: average count 50
        //radii: average count 2
        //etc.
        //purpose is to demonstrate "what we got"

        $(this.renderIntoNode).html("<div></div>");
    }

    async update() {
        console.log("update");
        this.renderComplete = false;
    }

    async unrender() {
        console.log("unrender");
        console.log("unrendering dendro dating histogram");
    }
}

export default MosaicDendroOverviewModule;