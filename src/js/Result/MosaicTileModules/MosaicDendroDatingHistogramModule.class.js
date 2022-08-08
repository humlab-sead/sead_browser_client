import zingchart from "zingchart";
import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDendroDatingHistogramModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Dating distribution";
		this.name = "mosaic-dendro-dating-histogram";
        this.requestId = 0;
        this.renderIntoNode = null;
    }

    async fetch(renderIntoNode = null) {
        
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, true);
        }
        
        let requestString = this.sqs.config.dataServerAddress+"/dendro/dating-histogram";
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

        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, false);
        }
        
        return chartSeries;
    }

    async render(renderIntoNode) {
        this.renderIntoNode = renderIntoNode;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        let chartSeries = await this.fetch(renderIntoNode);
        this.chart = resultMosaic.renderHistogram(renderIntoNode, chartSeries);
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

export default MosaicDendroDatingHistogramModule;