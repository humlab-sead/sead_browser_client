import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";

class MosaicFeatureTypesModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Top feature types";
        this.description = "The kinds of features the samples at the sites in the result were taken from, by number of samples. Click a feature type to add it as a filter.";
		this.name = "mosaic-feature-types";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.requestId = 0;
        this.plot = null;
        this.renderComplete = false;
        this.chartType = "html";
        this.showChartSelector = false;
        this.topCount = 10;
        this.showAll = false;
        this.view = "chart";
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
        let requestId = ++this.requestId;

        $(this.renderIntoNode).empty();

        const varId = nanoid();
        const chartContainerId = `chart-container-${varId}`;
        const tileHtml = `
            <div class="mosaic-tile-content" id="${varId}">
                <div class="mosaic-tile-chart" id="${chartContainerId}"></div>
            </div>
        `;
        $(this.renderIntoNode).append(tileHtml);

        if(this.renderNoDataIfNoSites()) {
            return;
        }

        this.sqs.setLoadingIndicator(`#${chartContainerId}`, true);

        let response = await super.fetchData("/graphs/feature_types", JSON.stringify({ siteIds: resultMosaic.sites }));
        if(!response) {
            return false;
        }
        let data = await response.json();
        if(requestId != this.requestId) {
            return; //A newer render has taken over
        }

        this.data = data.summary_data.slice().sort((a, b) => b.count - a.count).map(featureType => ({
            id: featureType.id,
            label: featureType.name,
            value: featureType.count
        }));
        this.sqs.setLoadingIndicator(`#${chartContainerId}`, false);

        if(this.data.length == 0) {
            this.renderNoData();
            this.renderComplete = true;
            return;
        }

        this.renderViewToggle([{ id: "chart", label: "Chart" }, { id: "table", label: "Table" }], () => {
            this.renderView();
        });
        this.renderView();
        this.renderComplete = true;
    }

    renderView() {
        let chartNode = this.getChartNode();
        let baseColor = this.sqs.color.colors.baseColor;

        let rows = this.data.map(featureType => ({
            label: featureType.label,
            value: featureType.value,
            valueText: this.formatCount(featureType.value),
            color: baseColor,
            title: featureType.label+" · "+this.formatCount(featureType.value)+(featureType.value == 1 ? " sample" : " samples"),
            selected: this.isFilterSelection("feature_type", featureType.id),
            onClick: this.getFilterToggleCallback("feature_type", featureType.id)
        }));

        let subtitle = "Samples per feature type";
        if(rows.length > this.topCount && this.view == "chart" && !this.showAll) {
            subtitle += " · top "+this.topCount+" of "+this.formatCount(rows.length);
        }
        this.setMosaicTileSubtitle(subtitle);

        if(this.view == "table") {
            this.renderDataTable(chartNode, [
                { title: "Feature type" },
                { title: "Samples", numeric: true }
            ], rows.map(row => [row.label, row.valueText]));
            return;
        }

        this.renderRankedBars(chartNode, this.showAll ? rows : rows.slice(0, this.topCount));

        if(rows.length > this.topCount) {
            let toggleNode = $("<button type='button' class='sqs-link-btn mosaic-show-all-btn'></button>");
            toggleNode.text(this.showAll ? "Show the top "+this.topCount : "Show all "+this.formatCount(rows.length)+" feature types");
            toggleNode.on("click", () => {
                this.showAll = !this.showAll;
                this.renderView();
            });
            chartNode.append(toggleNode);
        }
    }

    async update() {
        this.render();
    }

    getAvailableExportFormats() {
        return ["json", "csv", "png"];
    }

    formatDataForExport(data, format = "json") {
        if(format == "csv" || format == "xlsx") {
            return data.map(featureType => ({
                feature_type_id: featureType.id,
                feature_type: featureType.label,
                sample_count: featureType.value
            }));
        }
        return data;
    }

}

export default MosaicFeatureTypesModule;
