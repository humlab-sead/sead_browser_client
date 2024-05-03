import MosaicTileModule from "./MosaicTileModule.class";

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

    async fetch(renderIntoNode = null) {
        
        if(this.pendingRequestPromise != null) {
            this.pendingRequestPromise.abort();
        }

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

        this.pendingRequestPromise = $.ajax(requestString, {
            method: "post",
            dataType: "json",
            data: requestBody,
            headers: {
                "Content-Type": "application/json"
            }
        });

        let data = null;
        try {
            data = await this.pendingRequestPromise;
            this.data = data.categories;
            this.pendingRequestPromise = null;
        }
        catch(error) {
            this.pendingRequestPromise = null;
            return [];
        }
        
        if(!this.active) {
            return false;
        }

        if(data.requestId != this.requestId) {
            console.log("Discarding old dendro dating data");
            return;
        }

        if(data.categories.length == 0) {
            return false;
        }

        
        

        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, false);
        }

        return data.categories;
    }

    async render(renderIntoNode) {
        this.renderComplete = false;
        this.active = true;
        this.renderIntoNode = renderIntoNode;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        let data = await this.fetch(renderIntoNode);

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

        let startYearOfFirstBinLabel = `${data[0].startYear} - ${data[0].endYear}`;
        let endYearOfLastBinLabel = `${data[data.length - 1].startYear} - ${data[data.length - 1].endYear}`;

        if(data === false) {
            this.sqs.setNoDataMsg(this.renderIntoNode);
        }
        else {
            this.chart = resultMosaic.renderHistogramPlotly(this.renderIntoNode, plotlyChartData, {
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
            });
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

export default MosaicDendroDatingHistogramModule;