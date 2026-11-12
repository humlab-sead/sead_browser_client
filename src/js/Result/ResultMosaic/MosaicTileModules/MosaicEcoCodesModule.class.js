import MosaicTileModule from "./MosaicTileModule.class";
import { nanoid } from "nanoid";

class MosaicEcoCodesModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "BUGS eco codes";
        this.description = "Shows the distribution of BUGS eco-code categories across the selected sites, reflecting ecological preferences of identified taxa. Click an eco code to add it as a filter.";
		this.name = "mosaic-ecocodes";
		this.domains = [];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.requestId = 0;
        this.renderComplete = false;
        this.chartType = "html";
        this.showChartSelector = false;
        this.view = "chart";
        //The eco code filter has two stages: a system, then its codes. These codes are those of the BUGS system.
        this.ecocodeSystemId = 2;
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

        // Clear previous content
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

        // Show loading indicator on the chart container only
        this.sqs.setLoadingIndicator(`#${chartContainerId}`, true);

        let response = await super.fetchData("/graphs/ecocodes", JSON.stringify(resultMosaic.sites));
        if(!response) {
            return false;
        }
        let responseData = await response.json();

        if(requestId != this.requestId) {
            return; //A newer render has taken over
        }
        this.sqs.setLoadingIndicator(`#${chartContainerId}`, false);
        this.data = responseData;

        if(!Array.isArray(responseData.ecocode_groups) || responseData.ecocode_groups.length == 0) {
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

    getEcoCodeColor(ecocodeDefinitionId) {
        for(let defKey in this.sqs.bugsEcoCodeDefinitions) {
            if(this.sqs.bugsEcoCodeDefinitions[defKey].ecocode_definition_id == ecocodeDefinitionId) {
                return this.sqs.bugsEcoCodeDefinitions[defKey].color;
            }
        }
        return "#a0a0a0";
    }

    renderView() {
        let chartNode = this.getChartNode();
        let groups = this.data.ecocode_groups.slice().sort((a, b) => b.totalAbundance - a.totalAbundance);
        let totalAbundance = groups.reduce((sum, group) => sum + group.totalAbundance, 0);

        let rows = groups.map(group => {
            let share = totalAbundance > 0 ? group.totalAbundance / totalAbundance : 0;
            return {
                label: group.name,
                value: share * 100,
                valueText: this.formatShare(share),
                abundance: group.totalAbundance,
                color: this.getEcoCodeColor(group.ecocode_definition_id),
                title: group.name+" · abundance "+this.formatCount(group.totalAbundance),
                selected: this.isFilterSelection("ecocode", group.ecocode_definition_id, "ecocode"),
                onClick: this.getStageFilterToggleCallback("ecocode", "ecocode", group.ecocode_definition_id, { ecocode_system: [this.ecocodeSystemId] })
            };
        });

        this.setMosaicTileSubtitle("Share of the summed abundance of "+this.formatCount(totalAbundance));

        if(this.view == "table") {
            this.renderDataTable(chartNode, [
                { title: "Eco code" },
                { title: "Abundance", numeric: true },
                { title: "Share", numeric: true }
            ], rows.map(row => [{ text: row.label, color: row.color }, this.formatCount(row.abundance), row.valueText]));
            return;
        }

        this.renderRankedBars(chartNode, rows, { showSwatches: true, axisFormat: tick => tick+" %" });
    }

    async update() {
        this.render();
    }

    getAvailableExportFormats() {
        return ["json", "csv", "png"];
    }

	formatDataForExport(data, format = "json") {

        if(format == "csv" || format == "xlsx") {
            data = data.ecocode_groups.map((group) => ({
                ecocode_definition_id: group.ecocode_definition_id,
                abbreviation: group.abbreviation,
                name: group.name,
                abundance: group.totalAbundance,
            }));
        }

        return data;
    }
}

export default MosaicEcoCodesModule;
