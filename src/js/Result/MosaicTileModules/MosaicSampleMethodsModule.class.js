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
        this.renderComplete = false;
        this.chartType = "plotly";
        this.showChartSelector = false;
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

        // Clear previous content
        $(this.renderIntoNode).empty();

        // Create a container with a header/title bar and a dedicated chart container for Plotly
        const varId = (typeof nanoid === 'function') ? nanoid() : Math.random().toString(36).substr(2, 9);
        const chartContainerId = `chart-container-${varId}`;
        const tileHtml = `
            <div class="sample-methods-tile-container" id="${varId}" style="display: flex; flex-direction: column; height: 100%; width: 100%;">
                <div class="sample-methods-tile-header" style="flex: 0 0 auto;">
                    <h3 class="sample-methods-tile-title" style="margin: 0; font-size: 1.2em;">${this.title}</h3>
                </div>
                <div class="sample-methods-tile-chart" id="${chartContainerId}" style="flex: 1 1 0; min-height: 200px; width: 100%;"></div>
            </div>
        `;
        $(this.renderIntoNode).append(tileHtml);

        // Show loading indicator on the chart container only
        this.sqs.setLoadingIndicator(`#${chartContainerId}`, true);

        let response = await super.fetchData("/graphs/sample_methods", JSON.stringify(resultMosaic.sites));
        if(!response) {
            return false;
        }

        let data = await response.json();
        this.data = data.sample_methods_sample_groups;

        let colors = this.sqs.color.getNiceColorScheme(data.sample_methods_sample_groups.length);

        let chartData = [{
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

        this.sqs.setLoadingIndicator(`#${chartContainerId}`, false);
        resultMosaic.renderPieChartPlotly(`#${chartContainerId}`, chartData, { showlegend: false }).then(plot => {
            this.plot = plot;
        })
        this.renderComplete = true;
    }

    async update() {
        this.render();
    }
    /*
    async unrender() {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        resultMosaic.unrenderPlotlyChart(this.renderIntoNode.substring(1));
        this.pendingRequestPromise = null;
        this.active = false;
        $(".result-export-button-mosaic", this.renderIntoNode).remove();
    }
    */

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