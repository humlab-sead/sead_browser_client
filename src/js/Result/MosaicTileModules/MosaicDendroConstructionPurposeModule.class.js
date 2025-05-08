import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";
import { Legend } from "chart.js";

class MosaicConstructionPurposeModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Construction purpose";
		this.name = "mosaic-construction-purpose-chart";
        this.requestId = 0;
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
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
        //let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        
        this.renderPieChart();
        this.renderComplete = true;
    }

    renderPieChart() {
        //set loading indicator
        this.sqs.setLoadingIndicator(this.renderIntoNode, true);

        let requestBody = `{"requestId":1,"requestType":"populate","targetCode":"construction_purpose","domainCode":"dendrochronology","facetConfigs":[{"facetCode":"construction_purpose","position":1,"picks":[],"textFilter":""}]}`;


        this.fetchData("/api/facets/load", requestBody).then(async response => {
            if(!response) {
                return false;
            }

            let data = await response.json();

            let categories = [];
            data.Items.forEach(item => {
                item.Name;
                item.Count;

                categories.push({
                    count: item.Count,
                    name: item.Name
                });
            });

            this.renderPieChartPlotly({
                categories: categories
            });
        });

        /*
        $.ajax({
            method: "POST",
            url: this.sqs.config.serverAddress+"/api/facets/load",
            dataType: "json",
            headers: {
                "Content-Type": "application/json"
            },
            data: requestBody,
            success: (data) => {

                console.log(data);

                let categories = [];
                data.Items.forEach(item => {
                    item.Name;
                    item.Count;

                    categories.push({
                        count: item.Count,
                        name: item.Name
                    });
                });

                this.renderPieChartPlotly({
                    categories: categories
                });
                
            },
            error: (err) => {
                console.error("Error fetching chart data: ", err);
            }
        });
        */
    }

    renderPieChartPlotly(data) {

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
            name: "Construction purpose",
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
    }


    getPieChartFormOptions() {
        /*
        possibilities:
        * analysis methods grouped by dataset count
        * dataset count grouped by time
        * analysis methods grouped by time
        * dataset type grouped by dataset count 
        * dataset type grouped by time 
        */

        let out = `
        
        `;
        return out;
    }

    async update() {
        this.render();
    }

    async fetchData() {
        
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

export default MosaicConstructionPurposeModule;