import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDendroDatingHistogramModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Dating distribution";
		this.name = "mosaic-dendro-dating-histogram";
        this.requestId = 0;
    }

    async render(renderIntoNode) {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        resultMosaic.setLoadingIndicator(renderIntoNode, true);

        //let requestString = this.sqs.config.dataServerAddress+"/dendro/dating-histogram";
        let requestString = "http://localhost:8484/dendro/dating-histogram";
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
            console.log("Discarding old dendro dating data");
            return;
        }

        let categories = data.categories;

        let chartSeries = [];
        chartSeries.push({
            "values": [],
            "text": [],
            "sites": [],
            "timestamps": []
        });

		for(let key in categories) {
			chartSeries[0].values.push(categories[key].datingsNum);
            chartSeries[0].text.push(categories[key].startYear+"-"+categories[key].endYear);
            chartSeries[0].timestamps.push({
                startTs: categories[key].startTs,
                endTs: categories[key].endTs
            });
		}


        chartSeries.push({
            "values": [],
            "text": [],
            "sites": [],
            "timestamps": []
        });

		for(let key in categories) {
			chartSeries[1].values.push(categories[key].datingsNum - categories[key].datingsNumHighReliability);
            chartSeries[1].text.push(categories[key].startYear+"-"+categories[key].endYear);
            chartSeries[1].timestamps.push({
                startTs: categories[key].startTs,
                endTs: categories[key].endTs
            });
		}

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
        this.chart = resultMosaic.renderHistogram(renderIntoNode, chartSeries);
    }
}

export default MosaicDendroDatingHistogramModule;