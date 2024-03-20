import MosaicTileModule from "./MosaicTileModule.class";

class MosaicSampleMethodsModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Sampling methods by sample groups";
		this.name = "mosaic-sample-methods";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.plot = null;
    }

    async render(renderIntoNode = null) {
        if(renderIntoNode) {
            this.renderIntoNode = renderIntoNode;
        }
        if(renderIntoNode == null && this.renderIntoNode == null) {
            console.warn("Tried to render "+this.name+" without a node to render into!");
            return false;
        }
        this.active = true;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        this.sqs.setLoadingIndicator(this.renderIntoNode, true);

        let response = await fetch(this.sqs.config.dataServerAddress+"/graphs/sample_methods", {
            method: "POST",
            mode: "cors",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(resultMosaic.sites)
        });
        let data = await response.json();
        this.data = data.sample_methods_sample_groups;

        let colors = this.sqs.color.getColorScheme(data.sample_methods_sample_groups.length);




        let  chartData = [{
            labels: [],
            values: [],
            customdata: [],
            marker: {
                colors: colors
            },
            type: 'pie',
            hole: 0.4,
            name: "Sampling methods by sample groups",
            hoverinfo: 'label+percent',
            textinfo: 'label+percent',
            textposition: "inside",
            hovertemplate: "%{percent} of sample groups are %{customdata}<extra></extra>"
        }];

        data.sample_methods_sample_groups.sort((a, b) => {
             if(a.sample_groups_count > b.sample_groups_count) {
                return -1;
             }
             else {
                return 1;
             }
        });

        data.sample_methods_sample_groups.forEach(method => {
            chartData[0].labels.push(method.method_meta.method_abbrev_or_alt_name);
            chartData[0].values.push(method.sample_groups_count);
            chartData[0].customdata.push(method.method_meta.method_name);
        });

        this.sqs.setLoadingIndicator(this.renderIntoNode, false);
        resultMosaic.renderPieChartPlotly(this.renderIntoNode, chartData, { showlegend: false }).then(plot => {
            this.plot = plot;
        })


        /*
        const promiseData = await resultMosaicModule.fetchSiteData(resultMosaicModule.sites, "qse_methods", resultMosaicModule.requestBatchId);
        if(promiseData.requestId < resultMosaicModule.requestBatchId) {
            return false;
        }

        this.data = promiseData.data;
        console.log(this.data);

        let chartSeries = resultMosaicModule.prepareChartData("method_id", "method_name", promiseData.data);
        console.log(chartSeries);
        */
        //this.chart = resultMosaicModule.renderPieChart(this.renderIntoNode, chartSeries, "Sampling methods");
    }

    async fetch() {
        
    }

    async update() {
        this.render();
    }

    async unrender() {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        resultMosaic.unrenderPlotlyChart(this.renderIntoNode.substring(1));
        this.pendingRequestPromise = null;
        this.active = false;
        $(".result-export-button-mosaic", this.renderIntoNode).remove();
    }

    getAvailableExportFormats() {
        return ["json", "csv", "png"];
    }
    
    formatDataForExport(data, format = "json") {
        if(format == "csv") {
            let includeColumns = ["description","method_abbrev_or_alt_name","method_name","sample_groups_count"];

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

export default MosaicSampleMethodsModule;