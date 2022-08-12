import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDendroTreeSpeciesChartModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Tree species";
		this.name = "mosaic-dendro-tree-species-chart";
        this.requestId = 0;
        this.pendingRequestPromise = null;
        this.active = true;
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

        this.pendingRequestPromise = $.ajax(requestString, {
            method: "post",
            dataType: "json",
            data: requestBody,
            headers: {
                "Content-Type": "application/json"
            }
        });

        let data = await this.pendingRequestPromise;
        this.pendingRequestPromise = null;
        if(!this.active) {
            return false;
        }

        if(data.requestId != this.requestId) {
            console.log("Discarding old dendro tree species data");
            return;
        }
        
        if(data.categories.length == 0) {
            return false;
        }

        let categories = data.categories;

        let chartSeries = [];

        for(let key in categories) {
            chartSeries.push({
                "values": [categories[key].count],
                "text": [categories[key].name],
                "sites": []
            });
        }

        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, false);
        }

        return chartSeries;
    }

    async render(renderIntoNode) {
        this.active = true;
        this.renderIntoNode = renderIntoNode;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        let chartSeries = await this.fetch(renderIntoNode);
        
        if(chartSeries === false) {
            this.sqs.setNoDataMsg(this.renderIntoNode);
        }
        else {
            this.chart = resultMosaic.renderPieChart(this.renderIntoNode, chartSeries);
        }
    }

    async update() {
        let chartSeries = await this.fetch(this.renderIntoNode);
        if(chartSeries === false) {
            this.sqs.setNoDataMsg(this.renderIntoNode);
        }
        else {
            this.render(this.renderIntoNode);
        }
	}

    async unrender() {
        this.pendingRequestPromise = null;
        this.active = false;
    }
}

export default MosaicDendroTreeSpeciesChartModule;