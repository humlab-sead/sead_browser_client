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
        const varId = nanoid();
        const chartContainerId = `chart-container-${varId}`;
        const tileHtml = `
            <div class="analysis-methods-tile-container" id="${varId}" style="display: flex; flex-direction: column; height: 100%; width: 100%;">
                <div class="analysis-methods-tile-header" style="flex: 0 0 auto;">
                    <h3 class="analysis-methods-tile-title" style="margin: 0; font-size: 1.2em;">${this.title}</h3>
                </div>
                <div class="analysis-methods-tile-chart" id="${chartContainerId}" style="flex: 1 1 0; min-height: 200px; width: 100%;"></div>
            </div>
        `;
        $(this.renderIntoNode).append(tileHtml);

        // Show loading indicator on the chart container only
        this.sqs.setLoadingIndicator(`#${chartContainerId}`, true);

        let response = await super.fetchData("/graphs/analysis_methods", JSON.stringify(resultMosaic.sites));
        if(!response) {
            return false;
        }

        let data = await response.json();
        this.data = data.analysis_methods_datasets;

        // Get method_id to color mapping from config
        const methodColors = (this.sqs.config.analysisMethodsColors || []).reduce((acc, entry) => {
            acc[entry.method_id] = entry.color.startsWith('#') ? entry.color : `#${entry.color}`;
            return acc;
        }, {});

        // Fallback color palette if not found in config
        const fallbackColors = this.sqs.color.getColorScheme(data.analysis_methods_datasets.length);

        let chartData = [{
            labels: [],
            values: [],
            customdata: [],
            marker: {
                colors: []
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

        data.analysis_methods_datasets.forEach((method, idx) => {
            chartData[0].labels.push(method.method_abbrev_or_alt_name);
            chartData[0].values.push(method.dataset_count);
            chartData[0].customdata.push(method.method_name);
            // Use config color if available, else fallback
            chartData[0].marker.colors.push(methodColors[method.method_id] || fallbackColors[idx % fallbackColors.length]);
        });

        this.sqs.setLoadingIndicator(`#${chartContainerId}`, false);
        // Render the Plotly chart into the dedicated chart container
        resultMosaic.renderPieChartPlotly(`#chart-container-${varId}`, chartData, { showlegend: false }).then(plot => {
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