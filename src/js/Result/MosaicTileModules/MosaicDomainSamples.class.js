import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";
import Plotly from "plotly.js-dist-min";

class MosaicDomainSamples extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Samples per domain";
        this.name = "mosaic-domain-samples";
        this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.requestId = 0;
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.plot = null;
        this.renderComplete = false;
        this.chartType = "plotly";
        this.showChartSelector = false;
    }

    normalizeSiteIds(input) {
        if (!Array.isArray(input)) return [];
        const allNumbers = input.every(v => typeof v === "number" || (typeof v === "string" && v.trim() !== ""));
        if (allNumbers) {
            return input
                .map(v => (typeof v === "number" ? v : Number(v)))
                .filter(v => Number.isFinite(v));
        }
        return input
            .map(v => {
                if (v && typeof v === "object") {
                    const candidate = v.site_id ?? v.siteId ?? v.id ?? v.site ?? null;
                    const n = Number(candidate);
                    return Number.isFinite(n) ? n : null;
                }
                return null;
            })
            .filter(v => Number.isFinite(v));
    }

    async fetchData(renderIntoNode = null) {
        const resultMosaic = this.sqs.resultManager.getModule("mosaic");
        if (renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, true);
        }
        const siteIds = this.normalizeSiteIds(resultMosaic?.sites);
        const requestBody = JSON.stringify(siteIds);
        const response = await super.fetchData("/graphs/site/domain_sample_summary", requestBody);
        if (!response) {
            if (renderIntoNode) this.sqs.setLoadingIndicator(renderIntoNode, false);
            return false;
        }
        const data = await response.json();
        if (renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, false);
        }
        return {
            requestId: ++this.requestId,
            data
        };
    }

    formatDataToPlotlyChartData(data) {
        if (!data || !Array.isArray(data.domains) || data.domains.length === 0) {
            this.sqs.setNoDataMsg(this.renderIntoNode);
            return null;
        }
        const methodIdSet = new Set();
        const methodIdToLabel = {};
        data.domains.forEach(domain => {
            if (Array.isArray(domain.method_counts)) {
                domain.method_counts.forEach(mc => {
                    methodIdSet.add(mc.method_id);
                    if (!methodIdToLabel[mc.method_id]) {
                        if (mc.method_name) {
                            methodIdToLabel[mc.method_id] = mc.method_name;
                        } else {
                            methodIdToLabel[mc.method_id] = `Method ${mc.method_id}`;
                        }
                    }
                });
            }
        });
        const methodIds = Array.from(methodIdSet);
        const y = data.domains.map(domain => domain.display_title || domain.facet_code || "Unknown");
        const methodColors = (this.sqs.config.analysisMethodsColors || []).reduce((acc, entry) => {
            acc[entry.method_id] = entry.color.startsWith('#') ? entry.color : `#${entry.color}`;
            return acc;
        }, {});
        const fallbackColors = this.sqs.color.getColorScheme(methodIds.length);
        const traces = methodIds.map((methodId, idx) => {
            const x = data.domains.map(domain => {
                if (!Array.isArray(domain.method_counts)) return 0;
                const found = domain.method_counts.find(mc => mc.method_id === methodId);
                return found && typeof found.sample_count === 'number' ? found.sample_count : 0;
            });
            if (x.some(val => val > 0)) {
                return {
                    x,
                    y,
                    orientation: 'h',
                    type: "bar",
                    name: methodIdToLabel[methodId] || `Method ${methodId}`,
                    marker: { color: methodColors[methodId] || fallbackColors[idx % fallbackColors.length] },
                    hovertemplate: `%{y}<br>%{x} samples<extra></extra>`
                };
            }
            return null;
        }).filter(Boolean);
        return traces;
    }

    async render(renderIntoNode = null) {
        super.render();
        this.renderComplete = false;
        if (renderIntoNode) {
            this.renderIntoNode = renderIntoNode;
        }
        if (renderIntoNode == null && this.renderIntoNode == null) {
            console.warn("Tried to render " + this.name + " without a node to render into!");
            return false;
        }
        this.active = true;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        $(this.renderIntoNode).empty();
        const varId = (typeof nanoid === 'function') ? nanoid() : Math.random().toString(36).substr(2, 9);
        const chartContainerId = `chart-container-${varId}`;
        const tileHtml = `
            <div class="domain-samples-tile-container" id="${varId}" style="display: flex; flex-direction: column; height: 100%; width: 100%;">
                <div class="domain-samples-tile-header" style="flex: 0 0 auto;">
                    <h3 class="domain-samples-tile-title" style="margin: 0; font-size: 1.2em;">${this.title}</h3>
                </div>
                <div class="domain-samples-tile-chart" id="${chartContainerId}" style="flex: 1 1 0; min-height: 200px; width: 100%;"></div>
            </div>
        `;
        $(this.renderIntoNode).append(tileHtml);
        this.sqs.setLoadingIndicator(`#${chartContainerId}`, true);
        const result = await this.fetchData(`#${chartContainerId}`);
        if (!result) {
            this.renderComplete = true;
            return;
        }
        this.data = result.data;
        const chartData = this.formatDataToPlotlyChartData(this.data);
        if (!chartData) {
            console.warn("No chart data could be generated for samples per domain.");
            this.renderComplete = true;
            return;
        }
        this.sqs.setLoadingIndicator(`#${chartContainerId}`, false);
        const layout = {
            barmode: 'stack',
            yaxis: { automargin: true },
            plot_bgcolor: "#fff",
            paper_bgcolor: "#fff",
            autosize: true,
            showlegend: false,
            margin: {
                l: 50,
                r: 50,
                b: 50,
                t: 50,
                pad: 4
            },
            font: {
                family: 'Didact Gothic, sans-serif',
                size: 14,
                color: '#333'
            },
            responsive: true
        };
        const config = {
            responsive: true,
            displayModeBar: false,
            displaylogo: false,
            modeBarButtons: [['toImage']]
        };
        const anchorNodeId = `#${chartContainerId}`;
        Plotly.newPlot($(anchorNodeId)[0], chartData, layout, config).then(plot => {
            this.plot = plot;
        });
        this.renderComplete = true;
    }

    async update() {
        this.render();
    }

    getAvailableExportFormats() {
        return ["json", "csv", "png"];
    }

    formatDataForExport(data, format = "json") {
        if (format == "png") {
            let resultMosaic = this.sqs.resultManager.getModule("mosaic");
            resultMosaic.exportPieChartPlotly(this.renderIntoNode, this.plot);
        }
        return data;
    }
}

export default MosaicDomainSamples;
