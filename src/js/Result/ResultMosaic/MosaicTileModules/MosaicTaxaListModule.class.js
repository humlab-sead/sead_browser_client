import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";

class MosaicTaxaListModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Top taxa";
        this.description = "Ranked list of the most frequently occurring taxa across the selected sites.";
		this.name = "mosaic-taxa-list";
		this.domains = ["general", "palaeo", "archaeobotany"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.chartType = "html";
        this.showChartSelector = false;
        this.endpoint = "/graphs/toptaxa";
        this.linkTaxa = true; //Whether a taxon opens its page when clicked
        this.topCount = 10;
        this.showAll = false;
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

        let response = await super.fetchData(this.endpoint, JSON.stringify(resultMosaic.sites));
        if(!response) {
            return false;
        }
        let data = await response.json();

        if(requestId != this.requestId) {
            return; //A newer render has taken over
        }
        this.sqs.setLoadingIndicator(`#${chartContainerId}`, false);

        //Check if we're still active and don't render if we're not
        if(this.active == false) {
            console.log("Not rendering "+this.name+" because it's no longer active");
            this.renderComplete = true;
            return false;
        }

        this.data = Array.isArray(data) ? data : [];

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

    getTaxonName(item, html) {
        if(item.family && item.genus && item.species) {
            return this.sqs.formatTaxon(item, null, html, false);
        }
        return "Taxon id "+item.taxon_id;
    }

    renderView() {
        let chartNode = this.getChartNode();
        let baseColor = this.sqs.color.colors.baseColor;

        let rows = this.data.slice().sort((a, b) => (Number(b.abundance) || 0) - (Number(a.abundance) || 0)).map(item => {
            let abundance = Number(item.abundance) || 0;
            let row = {
                label: this.getTaxonName(item, false),
                labelHtml: this.getTaxonName(item, true),
                value: abundance,
                valueText: this.formatCount(abundance),
                color: baseColor,
                title: this.getTaxonName(item, false)+" · abundance "+this.formatCount(abundance)
            };
            if(this.linkTaxa) {
                row.href = "/taxon/"+item.taxon_id;
                row.actionText = "open the taxon";
                row.onClick = () => {
                    this.sqs.taxaModule.renderTaxon(item.taxon_id);
                };
            }
            return row;
        });

        let subtitle = "Summed abundance";
        if(rows.length > this.topCount && this.view == "chart" && !this.showAll) {
            subtitle += " · top "+this.topCount+" of "+this.formatCount(rows.length);
        }
        this.setMosaicTileSubtitle(subtitle);

        if(this.view == "table") {
            this.renderDataTable(chartNode, [
                { title: "Family" },
                { title: "Taxon" },
                { title: "Abundance", numeric: true }
            ], this.data.map(item => [
                item.family || "",
                item.genus && item.species ? item.genus+" "+item.species : "Taxon id "+item.taxon_id,
                this.formatCount(Number(item.abundance) || 0)
            ]));
            return;
        }

        this.renderRankedBars(chartNode, this.showAll ? rows : rows.slice(0, this.topCount), { wideLabels: true });

        if(rows.length > this.topCount) {
            let toggleNode = $("<button type='button' class='sqs-link-btn mosaic-show-all-btn'></button>");
            toggleNode.text(this.showAll ? "Show the top "+this.topCount : "Show all "+this.formatCount(rows.length)+" taxa");
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
            let includeColumns = ["abundance", "family", "genus", "species", "taxon_id"];

            //remove columns that we don't want to include
            data = data.map((item) => {
                let newItem = {};
                includeColumns.forEach((column) => {
                    newItem[column] = item[column];
                });
                return newItem;
            });
        }

        return data;
    }
}

export default MosaicTaxaListModule;
