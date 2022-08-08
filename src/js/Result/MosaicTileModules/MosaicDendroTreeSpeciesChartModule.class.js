import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDendroTreeSpeciesChartModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Tree species";
		this.name = "mosaic-dendro-tree-species-chart";
        this.requestId = 0;
    }

    async fetch(renderIntoNode = null) {
        this.sqs.setNoDataMsg(renderIntoNode, false);
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, true);
        }

        let requestString = this.sqs.config.dataServerAddress+"/dendro/treespecies";
         
        let requestBody = {
            sites: resultMosaic.sites,
            requestId: ++this.requestId,
        };

        requestBody = JSON.stringify(requestBody);

        let data = await $.ajax(requestString, {
            method: "post",
            dataType: "json",
            data: requestBody,
            headers: {
                "Content-Type": "application/json"
            }
        });

        if(data.categories.length == 0) {
            this.sqs.setNoDataMsg(renderIntoNode);
            return;
        }

        if(data.requestId != this.requestId) {
            console.log("Discarding old dendro tree species data");
            return;
        }

        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, false);
        }
        let categories = data.categories;

        return categories;
    }

    async render(renderIntoNode) {
        this.renderIntoNode = renderIntoNode;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        let categories = await this.fetch(renderIntoNode);

        let chartSeries = [];

        for(let key in categories) {
            chartSeries.push({
                "values": [categories[key].count],
                "text": [categories[key].name],
                "sites": []
            });
        }
        
        this.chart = resultMosaic.renderPieChart(renderIntoNode, chartSeries);
    }

    async update() {
        let chartSeries = await this.fetch(this.renderIntoNode);
        if(typeof chartSeries == "undefined") {
            console.warn("Unhandled case!")
        }
        else {
            this.render(this.renderIntoNode);
        }
	}
}

export default MosaicDendroTreeSpeciesChartModule;