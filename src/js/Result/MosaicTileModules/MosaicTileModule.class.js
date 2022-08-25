import { nanoid } from "nanoid";
import { Parser } from "json2csv";

class MosaicTileModule {
    constructor(sqs) {
        this.sqs = sqs;
        this.chart = null;
        this.renderIntoNode = null;
        this.active = true;
        this.data = null;
    }

    async fetch() {

    }

    async render() {

    }

    async update() {
        
    }

    async unrender() {
        if(this.chart != null) {
            this.chart.destroy();
            this.chart = null;
        }
    }

    exportCallback() {
        let html = "<div class='dialog-centered-content-container'>";
        let jsonButtonId = nanoid();
        html += "<a id='"+jsonButtonId+"' class='site-report-export-download-btn light-theme-button'>Chart data as JSON</a>";
        let csvButtonId = nanoid();
        html += "<a id='"+csvButtonId+"' class='site-report-export-download-btn light-theme-button'>Chart data as CSV</a>";
        html += "</div>";
        this.sqs.dialogManager.showPopOver("Export chart data", html);

        $("#"+jsonButtonId).on("click", () => {
            let jsonChartData = JSON.stringify(this.data, null, 2);
            const bytes = new TextEncoder().encode(jsonChartData);
            const blob = new Blob([bytes], {
                type: "application/json;charset=utf-8"
            });
            let filename = this.title.toLowerCase();
            filename = filename.replace(" ", "_");
            saveAs(blob, "sead_"+filename+"_graph_data.json");
            setTimeout(() => {
                this.sqs.dialogManager.hidePopOver();
            }, 1000);
        });

        $("#"+csvButtonId).on("click", () => {
            if(this.data == null) {
                console.warn("Data was null when trying to export!");
                return;
            }
            const parser = new Parser();
            const csv = parser.parse(this.data);
            const bytes = new TextEncoder().encode(csv);
            const blob = new Blob([bytes], {
                type: "application/csv;charset=utf-8"
            });
            let filename = this.title.toLowerCase();
            filename = filename.replace(" ", "_");
            saveAs(blob, "sead_"+filename+"_graph_data.csv");
            setTimeout(() => {
                this.sqs.dialogManager.hidePopOver();
            }, 1000);
        });
    }
}

export default MosaicTileModule;