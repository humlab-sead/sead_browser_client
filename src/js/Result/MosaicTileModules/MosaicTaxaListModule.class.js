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

        //render the data as a table
        let out = "";
        out += "<div class='mosaic-top-taxa-container'>";
        out += "<div class='mosaic-top-taxa-table-container'></div>";
        out += "<table class='taxa-table'>";
        out += "<thead>";
        out += "<tr>";
        out += "<th>Taxon</th>";
        out += "<th>Count</th>";
        out += "</thead>";
        out += "<tbody>";
        data.forEach((item) => {
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

        this.sqs.setLoadingIndicator(this.renderIntoNode, false);
        $(this.renderIntoNode).html(out);
    }

    async update() {
        this.render();
    }

    async fetch() {
        
    }

    async unrender() {
        this.active = false;
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

        return data;
    }
}

export default MosaicTaxaListModule;