import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDendroTreeSpeciesChartModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Tree species";
		this.name = "mosaic-dendro-tree-species-chart";
        this.requestId = 0;
    }

    async render(renderIntoNode) {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        resultMosaic.setLoadingIndicator(renderIntoNode, true);

        //let requestString = this.sqs.config.dataServerAddress+"/dendro/dating-histogram";
        let requestString = "http://localhost:8484/dendro/treespecies";
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

        if(data.requestId != this.requestId) {
            console.log("Discarding old dendro tree species data");
            return;
        }

        let categories = data.categories;
        console.log(categories);

        let chartSeries = [];

        for(let key in categories) {
            chartSeries.push({
                "values": [categories[key].count],
                "text": [categories[key].name],
                "sites": []
            });
        }

        /*
        chartSeries.push({
            "values": [],
            "text": [],
            "sites": []
        });

		for(let key in categories) {
			chartSeries[0].values.push(categories[key].count);
            chartSeries[0].text.push(categories[key].name);
		}
        */

        /*
        let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_feature_types", resultMosaic.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}
            
            
            let chartSeries = resultMosaic.prepareChartData("feature_type_id", "feature_type_name", promiseData.data);
            resultMosaic.setLoadingIndicator(renderIntoNode, false);
			this.chart = resultMosaic.renderBarChart(renderIntoNode, chartSeries);
            
		});
        */

        resultMosaic.setLoadingIndicator(renderIntoNode, false);
        this.chart = resultMosaic.renderPieChart(renderIntoNode, chartSeries);
    }
}

export default MosaicDendroTreeSpeciesChartModule;