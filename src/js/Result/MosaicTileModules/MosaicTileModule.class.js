import { nanoid } from "nanoid";
import { Parser } from "json2csv";
import JSZip from "jszip";

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

        let exportData = {
            description: "Data export from the SEAD project. Visit https://www.sead.se for more information.",
            reference: Config.dataAttributionString,
            license: "https://creativecommons.org/licenses/by/4.0/",
            sead_version: Config.version,
            export_date: new Date().toISOString(),
        }

        $("#"+jsonButtonId).on("click", () => {
            exportData.data = this.formatDataForExport(this.data, "json");

            let jsonChartData = JSON.stringify(exportData, null, 2);
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
            let data = this.formatDataForExport(this.data, "csv");
            let csv = parser.parse(data);
            const bytes = new TextEncoder().encode(csv);
            const blob = new Blob([bytes], {
                type: "application/csv;charset=utf-8"
            });
            let filename = this.title.toLowerCase();
            filename = filename.replace(" ", "_");

            //create zip file since we can't include the metdata in the csv file
            let zip = new JSZip();
            zip.file("sead_"+filename+"_graph_data.csv", csv);
            zip.file("sead_"+filename+"_graph_meta.json", JSON.stringify(exportData, null, 2));
            zip.generateAsync({type:"blob"})
            .then((content) => {
                saveAs(content, "sead_"+filename+"_graph_data.zip");
                setTimeout(() => {
                    this.sqs.dialogManager.hidePopOver();
                }, 1000);
            });
        });
    }

    formatDataForExport(data, format = "json") {
        return data;
    }
}

export default MosaicTileModule;