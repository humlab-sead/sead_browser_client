import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";


class MosaicAnalysisMethodsModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Analytical methods";
		this.name = "mosaic-analysis-methods";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.plot = null;
        this.renderComplete = false;
        this.chartType = "plotly";
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
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        this.sqs.setLoadingIndicator(this.renderIntoNode, true);
        /*
        let response = await fetch(this.sqs.config.dataServerAddress+"/graphs/analysis_methods", {
            method: "POST",
            mode: "cors",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(resultMosaic.sites)
        });
        */

        let response = await super.fetchData("/graphs/analysis_methods", JSON.stringify(resultMosaic.sites));
        if(!response) {
            return false;
        }

        let data = await response.json();
        this.data = data.analysis_methods_datasets;

        let colors = this.sqs.color.getColorScheme(data.analysis_methods_datasets.length);

        let  chartData = [{
            labels: [],
            values: [],
            customdata: [],
            marker: {
                colors: colors
            },
            type: 'pie',
            hole: 0.4,
            name: "Analysis methods by datasets",
            hoverinfo: 'label+percent',
            textinfo: 'label+percent',
            textposition: "inside",
            hovertemplate: "%{percent} of datasets are %{customdata}<extra></extra>"
        }];

        data.analysis_methods_datasets.sort((a, b) => {
             if(a.dataset_count > b.dataset_count) {
                return -1;
             }
             else {
                return 1;
             }
        });

        data.analysis_methods_datasets.forEach(method => {
            chartData[0].labels.push(method.method_abbrev_or_alt_name);
            chartData[0].values.push(method.dataset_count);
            chartData[0].customdata.push(method.method_name);
        });

        this.sqs.setLoadingIndicator(this.renderIntoNode, false);
        resultMosaic.renderPieChartPlotly(this.renderIntoNode, chartData, { showlegend: false }).then(plot => {
            this.plot = plot;
        })
        this.renderComplete = true;
    }

    async update() {
        this.render();
    }

    getAvailableExportFormats() {
        return ["json", "csv", "png"];
    }

    formatDataForExport(data, format = "json") {
        if(format == "csv") {
            let includeColumns = ["description","method_abbrev_or_alt_name","method_name","dataset_count"];

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

export default MosaicAnalysisMethodsModule;