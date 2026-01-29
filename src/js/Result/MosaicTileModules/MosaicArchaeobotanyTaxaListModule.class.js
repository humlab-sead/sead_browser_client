import MosaicTileModule from "./MosaicTileModule.class";

class MosaicArchaeobotanyTaxaListModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Top taxa";
        this.name = "mosaic-archaeobotany-taxa-list";
        this.domains = ["archaeobotany"];
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
            <div class="taxa-list-tile-container" id="${varId}" style="display: flex; flex-direction: column; height: 100%; width: 100%;">
                <div class="taxa-list-tile-header" style="flex: 0 0 auto;">
                    <h3 class="taxa-list-tile-title" style="margin: 0; font-size: 1.2em;">${this.title}</h3>
                </div>
                <div class="taxa-list-tile-table" id="${tableContainerId}" style="flex: 1 1 0; width: 100%; overflow-y: auto;"></div>
            </div>
        `;
        $(this.renderIntoNode).append(tileHtml);

        this.sqs.setLoadingIndicator(`#${tableContainerId}`, true);

        let response = await fetch(this.sqs.config.dataServerAddress+"/graphs/toptaxa/8", {
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

        // calculate maximum abundance so we can show a proportional background bar per row
        let maxAbundance = 0;
        if(Array.isArray(data) && data.length) {
            maxAbundance = data.reduce((m, it) => {
                const v = Number(it.abundance) || 0;
                return v > m ? v : m;
            }, 0);
        }

        // render the data as a compact div list with integrated thin bars under each item
        let out = "";
        out += "<div class='mosaic-top-taxa-container'>";
        out += "<div class='mosaic-top-taxa-list-container' style='width:100%;'>";
        // header row
        out += "<div style='display:flex; justify-content:space-between; font-weight:600; padding:8px 0; border-bottom:1px solid rgba(0,0,0,0.06);'>";
        out += "<div>Taxon</div>";
        out += "<div>Count</div>";
        out += "</div>";

        // items
        data.forEach((item) => {
            if(renderMaxCount-- <= 0) {
                return;
            }

            // compute percentage of the max abundance (0-100)
            let pct = 0;
            if(maxAbundance > 0) {
                pct = (Number(item.abundance) || 0) / maxAbundance * 100;
                pct = Math.min(100, Math.round(pct * 100) / 100);
            }

            out += "<div class='taxa-item' style='padding:2px 0; border-bottom:1px solid rgba(0,0,0,0.03);'>";
            out += "<div style='display:flex; justify-content:space-between; align-items:center;'>";
            if(item.family && item.genus && item.species) {
                out += "<div style='flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;'>"+this.sqs.formatTaxon(item, null, true, false)+"</div>";
            }
            else {
                out += "<div style='flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;'>Taxon id "+item.taxon_id+"</div>";
            }
            out += "<div style='margin-left:12px; flex:0 0 auto; text-align:right; white-space:nowrap;'>"+item.abundance.toLocaleString(navigator.language)+"</div>";
            out += "</div>";

            // integrated ultra-thin bar (2px) with minimal spacing so it takes almost no extra space
            out += "<div style='margin-top:2px; height:2px; display:block; overflow:visible;'>";
            out += "<div style='height:2px; width:"+pct+"%; background: rgba(0,123,255,0.8); border-radius:1px;'></div>";
            out += "</div>";

            out += "</div>";
        });

        out += "</div>"; // .mosaic-top-taxa-list-container
        out += "</div>"; // .mosaic-top-taxa-container

        this.sqs.setLoadingIndicator(`#${tableContainerId}`, false);
        $(`#${tableContainerId}`).html(out);
        this.renderComplete = true;
    }

    async update() {
        this.render();
    }

    async fetchData() {
        // Not implemented
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

export default MosaicArchaeobotanyTaxaListModule;
