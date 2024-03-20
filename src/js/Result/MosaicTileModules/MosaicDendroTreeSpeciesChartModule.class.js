import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDendroTreeSpeciesChartModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Tree species";
		this.name = "mosaic-dendro-tree-species-chart";
        this.requestId = 0;
        this.active = true;
        this.data = null;
        this.renderComplete = false;
        this.chartType = "plotly";
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

        let colors = this.sqs.color.getColorScheme(data.categories.length);

        let chartData = [{
            values: data.categories.map(category => category.count),
            labels: data.categories.map(category => category.name),
            customdata: data.categories.map(category => category.name),
            marker: {
                colors: colors
            },
            type: 'pie',
            hole: 0.4,
            name: "Tree species",
            hoverinfo: 'label+percent',
            textinfo: 'label+percent',
            textposition: "inside",
            hovertemplate: "%{percent} of datasets are %{customdata}<extra></extra>"
        }];

        this.data = data.categories;

        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, false);
        }

        return chartData;
    }

    async render(renderIntoNode) {
        this.renderComplete = false;
        this.active = true;
        this.renderIntoNode = renderIntoNode;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        let chartSeries = await this.fetch(renderIntoNode);
        
        if(chartSeries === false) {
            this.sqs.setNoDataMsg(this.renderIntoNode);
        }
        else {
            this.chart = resultMosaic.renderPieChartPlotly(this.renderIntoNode, chartSeries);
        }
        this.renderComplete = true;
    }

    async update() {
        this.renderComplete = false;
        let chartSeries = await this.fetch(this.renderIntoNode);
        if(chartSeries === false) {
            this.sqs.setNoDataMsg(this.renderIntoNode);
        }
        else {
            this.render(this.renderIntoNode);
        }
        this.renderComplete = true;
	}

}

export default MosaicDendroTreeSpeciesChartModule;