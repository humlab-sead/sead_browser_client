import { nanoid } from "nanoid";
import { Parser } from '@json2csv/plainjs';
import JSZip from "jszip";
import { saveAs } from "file-saver";

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
        this.showChartSelector = true; // Controls whether chart selector dropdown is shown
        this.coverageCharts = new Map(); // Store coverage chart data for resize
        this.resizeHandler = this.handleResize.bind(this);
    }

    showLoadingIndicator(show) {
        if(show && this.renderIntoNode) {
            this.sqs.setLoadingIndicator(this.renderIntoNode, true);
        }
        else if(this.renderIntoNode) {
            this.sqs.setLoadingIndicator(this.renderIntoNode, false);
        }
	}

    async fetchTotalSamplesCount() {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");

        try {
            const response = await fetch(this.sqs.config.dataServerAddress + "/site/samplescount", {
                method: "POST",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sites: resultMosaic.sites })
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();
            return data.count;

        } catch (error) {
            console.error("Error fetching total samples count:", error);
            return null;
        }
    }

    async fetchData(path, postData) {
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

    /**
     * Render a mini coverage chart showing what proportion of total samples have data.
     * Immediately draws the label and an empty bar, then animates fill as totalSamplesOrPromise resolves.
     *
     * @param {HTMLElement} container - Container element to append the mini-chart into
     * @param {number} samplesWithData - Count representing coverage numerator
     * @param {number|Promise<number>} totalSamplesOrPromise - Total samples count or a Promise for it
     */
    async renderCoverageMiniChart(container, samplesWithData, totalSamplesOrPromise) {
        const miniChartId = nanoid();
        const miniChartHtml = `
            <div class="mosaic-mini-chart-container">
                <div class="mosaic-mini-chart-label">Sample Coverage</div>
                <div class="mosaic-mini-chart-wrapper">
                    <canvas id="mini-chart-${miniChartId}" height="16"></canvas>
                </div>
                <div class="mosaic-mini-chart-percentage" id="mini-pct-${miniChartId}">N/A</div>
            </div>
        `;

        $(container).append(miniChartHtml);

        const canvas = document.getElementById(`mini-chart-${miniChartId}`);
        const ctx = canvas.getContext('2d');
        const canvasContainer = canvas.parentElement;
        canvas.width = canvasContainer.clientWidth;
        canvas.height = 16;

        const observer = new ResizeObserver(() => {
            const data = this.coverageCharts.get(miniChartId);
            if (!data) return;
            canvas.width = canvasContainer.clientWidth;
            canvas.height = 16;
            this.drawCoverageLine(canvas.getContext('2d'), canvas.width, canvas.height, data.percentage);
        });
        observer.observe(canvasContainer);
        this.coverageCharts.set(miniChartId, { canvas, percentage: 0, observer });

        this.drawCoverageLine(ctx, canvas.width, canvas.height, 0);

        const totalSamples = await Promise.resolve(totalSamplesOrPromise);
        if(!totalSamples || totalSamples === 0) {
            return;
        }

        const targetPercentage = samplesWithData / totalSamples;
        const pctEl = document.getElementById(`mini-pct-${miniChartId}`);
        const duration = 600;
        const startTime = performance.now();

        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = targetPercentage * eased;

            this.drawCoverageLine(ctx, canvas.width, canvas.height, current);

            if(pctEl) {
                pctEl.textContent = (current * 100).toFixed(1) + '%';
            }

            this.coverageCharts.get(miniChartId).percentage = current;

            if(progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.drawCoverageLine(ctx, canvas.width, canvas.height, targetPercentage);
                if(pctEl) {
                    pctEl.textContent = (targetPercentage * 100).toFixed(1) + '%';
                }
                this.coverageCharts.get(miniChartId).percentage = targetPercentage;
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Handle window resize by redrawing all coverage charts
     */
    handleResize() {
        this.coverageCharts.forEach((chartData) => {
            const { canvas, percentage } = chartData;
            const canvasContainer = canvas.parentElement;
            if(!canvasContainer) return;
            canvas.width = canvasContainer.clientWidth;
            canvas.height = 16;
            const ctx = canvas.getContext('2d');
            this.drawCoverageLine(ctx, canvas.width, canvas.height, percentage);
        });
    }

    /**
     * Draw a rounded coverage bar
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     * @param {number} percentage - 0 to 1
     */
    drawCoverageLine(ctx, width, height, percentage) {
        const lineY = height / 2;
        const lineHeight = 6;
        const padding = 0;
        const lineWidth = width - (padding * 2);
        const filledWidth = lineWidth * percentage;

        ctx.fillStyle = '#E0E0E0';
        ctx.beginPath();
        ctx.roundRect(padding, lineY - lineHeight / 2, lineWidth, lineHeight, lineHeight / 2);
        ctx.fill();

        if(filledWidth > 0) {
            ctx.fillStyle = '#143261';
            ctx.beginPath();
            ctx.roundRect(padding, lineY - lineHeight / 2, filledWidth, lineHeight, lineHeight / 2);
            ctx.fill();
        }
    }

    async render() {
        this.renderComplete = false;
    }

    renderNoData() {
        const $chartArea = $(this.renderIntoNode).find('.mosaic-tile-chart');
        if ($chartArea.length > 0) {
            // Module already rendered its own title via tileHtml — only replace the chart area
            this.sqs.setNoDataMsg($chartArea[0]);
        } else {
            // Module has no own title wrapper; add a title heading to the parent tile
            if (this.title) {
                const $tile = $(this.renderIntoNode).parent();
                if ($tile.find('> h2').length === 0) {
                    $tile.append(`<h2>${this.title}</h2>`);
                }
            }
            this.sqs.setNoDataMsg(this.renderIntoNode);
        }
    }

    async update() {
        
    }

    async unrender() {
        return new Promise((resolve, reject) => {
            this.waitForRenderCompleteInterval = setInterval(() => {
                if(this.renderComplete) {
                    clearInterval(this.waitForRenderCompleteInterval);
    
                    if(this.renderIntoNode != null) {
                        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
                        if(resultMosaic && typeof resultMosaic.cleanupPlotlyChartsInContainer == "function") {
                            resultMosaic.cleanupPlotlyChartsInContainer(this.renderIntoNode);
                        }
                        $(this.renderIntoNode).empty();
                        resolve();
                    }
                    else {
                        console.warn("Render into node was null when trying to unrender!");
                        reject();
                    }
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

        let mapToImageButtonId = nanoid();
        if(exportFormats.includes("mapToImage")) {
            html += "<a id='"+mapToImageButtonId+"' class='site-report-export-download-btn light-theme-button'>Chart as image</a>";
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

        if (exportFormats.includes("mapToImage")) {
            $("#" + mapToImageButtonId).on("click", async () => {
                const canvas = $(".ol-viewport canvas", this.renderIntoNode)[0];
                if (canvas) {
                    canvas.toBlob(function(blob) {
                        saveAs(blob, "sead_graph_data.png");
                    }, 'image/png');
                }
            });
        }

        
    }

    formatDataForExport(data, format = "json") {
        return data;
    }
}

export default MosaicTileModule;
