import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDendroWaneyEdgeModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Waney edge";
		this.name = "mosaic-waney-edge-chart";
        this.requestId = 0;
		this.domains = ["dendrochronology"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.plot = null;
        this.renderComplete = false;
        this.chartType = "plotly";
        this.chartFormId = "sqs-form-chart-"+nanoid();
    }

    async render(renderIntoNode = null) {
        super.render();
        this.renderComplete = false;
        if(renderIntoNode) {
            this.renderIntoNode = renderIntoNode;
        }
        if(renderIntoNode == null && this.renderIntoNode == null) {
            console.warn("Tried to render "+this.name+" without a node to render into!");
            return false;
        }
        this.active = true;

        await this.fetchData();
        this.renderComplete = true;
    }

    async fetchData() {
        let variable = "Waney edge (W)";

        let resultMosaic = this.sqs.resultManager.getModule("mosaic");

        let requestBody = {
            sites: resultMosaic.sites,
            requestId: ++this.requestId,
            variable: variable
        };

        requestBody = JSON.stringify(requestBody);

        //set loading indicator
        this.sqs.setLoadingIndicator(this.renderIntoNode, true);


        let response = await super.fetchData("/dendro/dynamicchart", requestBody);
        if(!response) {
            return false;
        }
        let data = await response.json();


        this.data = data.categories;

        if(data.categories.length == 0) {
            //set no data msg
            this.sqs.setNoDataMsg(this.renderIntoNode, true);
            return false;
        }

        let chartData = [{
            labels: [],
            values: [],
            customdata: [],
            marker: {
                colors: this.sqs.color.getColorScheme(data.categories.length)
            },
            type: 'pie',
            hole: 0.4,
            name: "Dynamic chart",
            hoverinfo: 'label+percent',
            textinfo: 'label+percent',
            textposition: "inside",
            //hovertemplate: "%{percent} of datasets are %{customdata}<extra></extra>"
        }];

        data.categories.sort((a, b) => {
            if(a.count > b.count) {
                return -1;
            }
            else {
                return 1;
            }
        });

        data.categories.forEach(category => {
            chartData[0].labels.push(category.name);
            chartData[0].values.push(category.count);
        });

        resultMosaic.renderPieChartPlotly(this.renderIntoNode, chartData, { showlegend: false }).then(plot => {
            this.plot = plot;
        });




        /*
        $.ajax({
            method: "POST",
            url: this.sqs.config.dataServerAddress+"/dendro/dynamicchart",
            dataType: "json",
            headers: {
                "Content-Type": "application/json"
            },
            data: requestBody,
            success: (data) => {

                this.data = data.categories;

                if(data.categories.length == 0) {
                    //set no data msg
                    this.sqs.setNoDataMsg(this.renderIntoNode, true);
                    return false;
                }

                let chartData = [{
                    labels: [],
                    values: [],
                    customdata: [],
                    marker: {
                        colors: this.sqs.color.getColorScheme(data.categories.length)
                    },
                    type: 'pie',
                    hole: 0.4,
                    name: "Dynamic chart",
                    hoverinfo: 'label+percent',
                    textinfo: 'label+percent',
                    textposition: "inside",
                    //hovertemplate: "%{percent} of datasets are %{customdata}<extra></extra>"
                }];
        
                data.categories.sort((a, b) => {
                    if(a.count > b.count) {
                        return -1;
                    }
                    else {
                        return 1;
                    }
                });
        
                data.categories.forEach(category => {
                    chartData[0].labels.push(category.name);
                    chartData[0].values.push(category.count);
                });

                let resultMosaic = this.sqs.resultManager.getModule("mosaic");
                resultMosaic.renderPieChartPlotly(this.renderIntoNode, chartData, { showlegend: false }).then(plot => {
                    this.plot = plot;
                });
            },
            error: (err) => {
                console.error("Error fetching chart data: ", err);
            }
        });
        */
    }

    async update() {
        this.render();
    }

    getAvailableExportFormats() {
        return ["json", "csv", "png"];
    }

    formatDataForExport(data, format = "json") {
        if(format == "csv") {

            let includeColumns = [];
            if(data.length > 0) {
                includeColumns = Object.keys(data[0]);
            }

            //includeColumns = ["description","method_abbrev_or_alt_name","method_name","dataset_count"];

            //remove columns that we don't want to include
            data = data.map((item) => {
                let newItem = {};
                includeColumns.forEach((column) => {
                    newItem[column] = item[column];
                });
                return newItem;
            });
        }
        if(format == "png") {
            let resultMosaic = this.sqs.resultManager.getModule("mosaic");
            resultMosaic.exportPieChartPlotly(this.renderIntoNode, this.plot);
        }

        return data;
    }
}

export default MosaicDendroWaneyEdgeModule;