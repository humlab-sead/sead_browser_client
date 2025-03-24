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

    async fetchData(renderIntoNode = null) {
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

        /*
        let data = await $.ajax(requestString, {
            method: "post",
            dataType: "json",
            data: requestBody,
            headers: {
                "Content-Type": "application/json"
            }
        });
        */

        let response = await this.fetch("/dendro/treespecies", requestBody);
        if(!response) {
            return false;
        }

        let data = await response.json();

        
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

        let backupColors = this.sqs.color.getColorScheme(data.categories.length);
        //map the data.categories "name" property to this.sqs.config.treeSpeciesColors
        //if the name is not found, use a backup color
        let colors = [];
        data.categories.forEach(category => {
            // Find the color configuration for the current category
            let colorConfig = this.sqs.config.treeSpeciesColors.find(speciesColor => speciesColor.species === category.name);
            
            // If a color configuration is found, push the color; otherwise, push the default color
            if (colorConfig) {
                colors.push(colorConfig.color);
            } else {
                console.warn(`No color configuration found for tree species ${category.name}. Using backup color.`);
                colors.push(backupColors.shift());
            }
        });

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
        super.render();
        this.renderComplete = false;
        this.active = true;
        this.renderIntoNode = renderIntoNode;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        let chartSeries = await this.fetchData(renderIntoNode);
        
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
        let chartSeries = await this.fetchData(this.renderIntoNode);
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