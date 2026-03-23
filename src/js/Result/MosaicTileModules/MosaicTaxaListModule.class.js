import MosaicTileModule from "./MosaicTileModule.class";

class MosaicTaxaListModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Top taxa";
		this.name = "mosaic-taxa-list";
		this.domains = ["general", "palaeo", "archaeobotany"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.chartType = "table";
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

        // Create a container with a header/title bar and a dedicated table container
        const varId = (typeof nanoid === 'function') ? nanoid() : Math.random().toString(36).substr(2, 9);
        const tableContainerId = `table-container-${varId}`;
        const tileHtml = `
            <div class="mosaic-tile-content" id="${varId}">
                <div class="mosaic-tile-header">
                    <h3 class="mosaic-tile-title">${this.title}</h3>
                </div>
                <div class="taxa-list-tile-table" id="${tableContainerId}" style="flex: 1 1 0; width: 100%; overflow-y: auto;"></div>
            </div>
        `;
        $(this.renderIntoNode).append(tileHtml);
        this.sqs.tooltipManager.registerTooltip(`#${varId} .mosaic-tile-title`, "Ranked list of the most frequently occurring taxa across the selected sites.", { drawSymbol: true, anchorPoint: 'symbol' });

        this.sqs.setLoadingIndicator(`#${tableContainerId}`, true);

        let response = await fetch(this.sqs.config.dataServerAddress+"/graphs/toptaxa", {
            method: "POST",
            mode: "cors",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(resultMosaic.sites)
        });
        let data = await response.json();

        //Check if we're still active and don't render if we're not
        if(this.active == false) {
            console.log("Not rendering "+this.name+" because it's no longer active");
            return false;
        }

        this.data = data;

        let renderMaxCount = 15;

        //render the data as a table
        let out = "";
        out += "<div class='mosaic-top-taxa-container'>";
        out += "<div class='mosaic-top-taxa-table-container'>";
        out += "<table class='taxa-table'>";
        out += "<thead>";
        out += "<tr>";
        out += "<th>Taxon</th>";
        out += "<th>Count</th>";
        out += "</thead>";
        out += "<tbody>";
        data.forEach((item) => {
            if(renderMaxCount-- <= 0) {
                return;
            }
            out += "<tr>";
            if(item.family && item.genus && item.species) {
                out += "<td>"+this.sqs.formatTaxon(item, null, true, true)+"</td>";
            }
            else {
                out += "<td>Taxon id "+item.taxon_id+"</td>";
            }
            out += "<td>"+item.abundance.toLocaleString(navigator.language)+"</td>";
                out += "</tr>";
        });
        out += "</tbody>";
        out += "</table>";
        out += "</div>";
        out += "</div>";

        this.sqs.setLoadingIndicator(`#${tableContainerId}`, false);
        $(`#${tableContainerId}`).html(out);
        this.renderComplete = true;
    }

    async update() {
        this.render();
    }

    async fetchData() {
        
    }

    formatDataForExport(data, format = "json") {
        if(format == "csv") {
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