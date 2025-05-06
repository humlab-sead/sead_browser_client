import { nanoid } from "nanoid";
import { Parser } from '@json2csv/plainjs';
import JSZip from "jszip";

class MosaicTileModule {
    constructor(sqs) {
        this.sqs = sqs;
        this.chart = null;
        this.renderIntoNode = null;
        this.active = true;
        this.data = null;
        this.renderComplete = false;
        this.chartType = "";
        this.name = "";
    }

    async fetch(path, postData) {
        return new Promise(async (resolve, reject) => {
            try {
                let response = await fetch(this.sqs.config.dataServerAddress + path, {
                    method: "POST",
                    mode: "cors",
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: postData
                });
            
                if (!response.ok) {
                    // Handle non-200 HTTP responses
                    throw new Error(`Server error: ${response.status} - ${response.statusText}`);
                }

                resolve(response);
            
            } catch (error) {
                this.sqs.setErrorIndicator(this.renderIntoNode, "Could not fetch data for "+this.name+" module");
                reject(error);
                return;
            }
        });
    }

    async render() {
        this.renderComplete = false;
    }

    async update() {
        
    }

    async unrender() {
        return new Promise((resolve, reject) => {
            this.waitForRenderCompleteInterval = setInterval(() => {
                if(this.renderComplete) {
                    clearInterval(this.waitForRenderCompleteInterval);
    
                    if(this.chart != null && !this.chart instanceof Promise && this.chartType == "chartjs") {
                        this.chart.destroy();
                        this.chart = null;
                    }
    
                    let resultMosaic = this.sqs.resultManager.getModule("mosaic");
                    if(this.renderIntoNode != null && this.renderIntoNode.length > 0 && this.chartType == "plotly") {
                        resultMosaic.unrenderPlotlyChart(this.renderIntoNode);
                    }

                    this.pendingRequestPromise = null;
                    this.active = false;
                    console.log("Unrendered "+this.name+" module")
                    resolve();
                }
            }, 100);
        });
    }

    getAvailableExportFormats() {
        return ["json", "csv"];
    }

    exportCallback() {
        let exportFormats = this.getAvailableExportFormats();

        let html = "<div class='dialog-centered-content-container'>";
        
        let jsonButtonId = nanoid();
        if(exportFormats.includes("json")) {
            html += "<a id='"+jsonButtonId+"' class='site-report-export-download-btn light-theme-button'>Chart data as JSON</a>";
        }
        
        let csvButtonId = nanoid();
        if(exportFormats.includes("csv")) {
            html += "<a id='"+csvButtonId+"' class='site-report-export-download-btn light-theme-button'>Chart data as CSV</a>";
        }
        let pngButtonId = nanoid();
        if(exportFormats.includes("png")) {
            html += "<a id='"+pngButtonId+"' class='site-report-export-download-btn light-theme-button'>Chart as image</a>";
        }

        html += "</div>";
        this.sqs.dialogManager.showPopOver("Export chart data", html);

        let exportData = {
            description: this.sqs.config.dataExportDescription,
            reference: Config.dataAttributionString,
            license: "https://creativecommons.org/licenses/by/4.0/",
            sead_version: Config.version,
            export_date: new Date().toISOString(),
        }

        if(exportFormats.includes("json")) {
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
        }
        
        if(exportFormats.includes("csv")) {
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

        if(exportFormats.includes("png")) {
            $("#"+pngButtonId).on("click", () => {
                let data = this.formatDataForExport(this.data, "png");
            });
        }
        
    }

    formatDataForExport(data, format = "json") {
        return data;
    }
}

export default MosaicTileModule;