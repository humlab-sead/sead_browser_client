import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";

class MosaicSampleMethodsModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Sampling methods";
        this.description = "How the sample groups at the sites in the result were sampled, by their share of the sample groups.";
		this.name = "mosaic-sample-methods";
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.plot = null;
        this.renderComplete = false;
        this.chartType = "html";
        this.showChartSelector = false;
        this.topCount = 6;
        this.view = "chart";
        this.requestId = 0;
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

        let response = await super.fetchData("/graphs/sample_methods", JSON.stringify(resultMosaic.sites));
        if(!response) {
            return false;
        }

        let data = await response.json();
        if(requestId != this.requestId) {
            return; //A newer render has taken over
        }
        this.data = data.sample_methods_sample_groups;
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
        let methods = this.data.slice().sort((a, b) => b.sample_groups_count - a.sample_groups_count);
        let sampleGroupCount = methods.reduce((sum, method) => sum + method.sample_groups_count, 0);
        let baseColor = this.sqs.color.colors.baseColor;

        let rows = methods.map(method => {
            let share = sampleGroupCount > 0 ? method.sample_groups_count / sampleGroupCount : 0;
            let name = method.method_meta ? method.method_meta.method_name : "Method "+method.method_id;
            return {
                label: name,
                value: share * 100,
                valueText: this.formatShare(share),
                sampleGroupCount: method.sample_groups_count,
                color: baseColor,
                title: name+" · "+this.formatCount(method.sample_groups_count)+(method.sample_groups_count == 1 ? " sample group" : " sample groups")
            };
        });

        let shownRows = this.takeTopItems(rows, this.topCount, rest => {
            let restCount = rest.reduce((sum, row) => sum + row.sampleGroupCount, 0);
            let share = sampleGroupCount > 0 ? restCount / sampleGroupCount : 0;
            return {
                label: rest.length+" other methods",
                value: share * 100,
                valueText: this.formatShare(share),
                sampleGroupCount: restCount,
                color: "#c8c8c8",
                title: rest.map(row => row.label).join(", "),
                other: true
            };
        });

        let subtitle = "Share of "+this.formatCount(sampleGroupCount)+(sampleGroupCount == 1 ? " sample group" : " sample groups");
        if(shownRows.length < rows.length) {
            subtitle += " · top "+this.topCount+" + other";
        }
        this.setMosaicTileSubtitle(subtitle);

        if(this.view == "table") {
            this.renderDataTable(chartNode, [
                { title: "Sampling method" },
                { title: "Sample groups", numeric: true },
                { title: "Share", numeric: true }
            ], rows.map(row => [row.label, this.formatCount(row.sampleGroupCount), row.valueText]));
            return;
        }

        this.renderRankedBars(chartNode, shownRows, { axisFormat: tick => tick+" %" });
    }

    async update() {
        this.render();
    }

    getAvailableExportFormats() {
        return ["json", "csv", "png"];
    }

    formatDataForExport(data, format = "json") {
        if(format == "csv" || format == "xlsx") {
            data = data.map((item) => ({
                description: item.description || item.method_meta?.description || "",
                method_abbrev_or_alt_name: item.method_abbrev_or_alt_name || item.method_meta?.method_abbrev_or_alt_name || "",
                method_name: item.method_name || item.method_meta?.method_name || "",
                sample_groups_count: item.sample_groups_count
            }));
        }

        return data;
    }

}

export default MosaicSampleMethodsModule;
