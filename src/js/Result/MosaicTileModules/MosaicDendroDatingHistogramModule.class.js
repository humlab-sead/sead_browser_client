import MosaicTileModule from "./MosaicTileModule.class";
import Plotly from "plotly.js-dist-min";

class MosaicDendroDatingHistogramModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Dating distribution";
		this.name = "mosaic-dendro-dating-histogram";
        this.requestId = 0;
        this.renderIntoNode = null;
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderComplete = false;
        this.chartType = "plotly";
    }

    async fetchData(renderIntoNode = null) {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, true);
        }
        
        /*
        let requestString = this.sqs.config.dataServerAddress+"/dendro/dating-histogram";
        let requestBody = {
            sites: resultMosaic.sites,
            requestId: ++this.requestId,
        };

        let requestBodyJson = JSON.stringify(requestBody);

        let data = await $.ajax(requestString, {
            method: "post",
            dataType: "json",
            data: requestBodyJson,
            headers: {
                "Content-Type": "application/json"
            }
        });
        */

        let requestBody = {
            sites: resultMosaic.sites,
            requestId: ++this.requestId,
        };

        let requestBodyJson = JSON.stringify(requestBody);

        let response = await this.fetch("/dendro/dating-histogram", requestBodyJson);
        if(!response) {
            return false;
        }

        let data = await response.json();
        
        /*
        if(!this.active) {
            return false;
        }
        */

        if(data.categories.length > 0 && renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, false);
        }

        return {
            requestId: requestBody.requestId,
            data: data.categories
        }
    }

    formatDataToPlotlyChartData(data) {
        if(!data || data.length == 0) {
            console.warn("Fetch for dendro dating histogram returned bad value:", data);
            this.sqs.setNoDataMsg(this.renderIntoNode);
            return;
        }
        if(!data[0].startYear || !data[0].endYear) {
            console.warn("Fetch for dendro dating histogram returned bad value:", data);
            this.sqs.setNoDataMsg(this.renderIntoNode);
            return;
        }

        let plotlyChartData = [{
            x: data.map(item => `${item.startYear} - ${item.endYear}`),
            y: data.map(item => item.datingsNum),
            customdata: data.map(category => category.name),
            type: 'bar',
            name: "Dating histogram",
            hovertemplate: data.map(item => `${item.startYear} - ${item.endYear}<br>%{y} datings<extra></extra>`),
            marker: {
                color: this.sqs.color.getColorScheme(1)[0]
            }
        }];

        return plotlyChartData;
    }

    getPlotlyChartLayoutConfig(data) {
        let startYearOfFirstBinLabel = `${data[0].startYear} - ${data[0].endYear}`;
        let endYearOfLastBinLabel = `${data[data.length - 1].startYear} - ${data[data.length - 1].endYear}`;

        return {
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            bargap: 0.25,
            xaxis: {
                title: "Year range",
                tickangle: -45,
                tickvals: [startYearOfFirstBinLabel, endYearOfLastBinLabel], // Use the exact labels from the x data
                ticktext: [data[0].startYear.toString(), data[data.length - 1].endYear.toString()] // Displaying just the years for clarity
            },
            yaxis: {
                title: "Number of datings",
            },
            margin: {
                l: 70, // Left margin
                r: 50, // Right margin
                b: 70, // Increase bottom margin for more space
                t: 50, // Top margin
                pad: 4
            },
        };
    }

    async render(renderIntoNode) {
        super.render();
        this.renderComplete = false;
        this.active = true;
        this.renderIntoNode = renderIntoNode;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        if(!this.data) {
            let response = await this.fetchData(renderIntoNode);
            this.data = response.data;

            if(response.requestId < this.requestId) {
                //console.log("dating-histogram: Received requestId: ", response.requestId, "but current requestId is: ", this.requestId);
                return;
            }

            if(!this.active) {
                //console.log("dating-histogram: Not active, returning");
                return false;
            }
        }
        if(this.data.length == 0 || this.data == false) {
            this.sqs.setNoDataMsg(this.renderIntoNode);
        }
        else {
            this.chart = await resultMosaic.renderHistogramPlotly(this.renderIntoNode, this.formatDataToPlotlyChartData(this.data), this.getPlotlyChartLayoutConfig(this.data));  
        }
        this.renderComplete = true;
    }

    async update() {
        this.renderComplete = false;

        this.sqs.setLoadingIndicator(this.renderIntoNode, true, false);
        let response = await this.fetchData();
        if(response.requestId != this.requestId) {
            return;
        }

        this.data = response.data;
        this.sqs.setLoadingIndicator(this.renderIntoNode, false, false);
        this.render(this.renderIntoNode);
        this.renderComplete = true;
	}

    async unrender() {
        console.log("unrendering dendro dating histogram");
    }
}

export default MosaicDendroDatingHistogramModule;