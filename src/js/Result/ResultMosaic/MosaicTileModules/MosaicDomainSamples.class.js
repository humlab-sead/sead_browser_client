import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDomainSamples extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Samples per domain";
        this.description = "How many of the samples at the sites in the result have been analysed in each domain, split by analysis method. Click a method to add it as a filter, or a domain to switch to it.";
        this.name = "mosaic-domain-samples";
        this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.requestId = 0;
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.plot = null;
        this.renderComplete = false;
        this.chartType = "html";
        this.showChartSelector = false;
        this.view = "count";
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
        const requestId = ++this.requestId;
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
            requestId: requestId,
            data
        };
    }

    getDomainColor(facetCode) {
        let domain = this.sqs.config.domains.find(domain => domain.name == facetCode);
        return domain && domain.color ? domain.color : "#8c8c8c";
    }

    /*
    * Function: getSwitchableDomain
    * The domain of the client which a domain in the summary can be switched to, or null if there is none - such as
    * one not enabled, or the one already active.
    */
    getSwitchableDomain(facetCode) {
        let domain = this.sqs.domainManager.getDomain(facetCode);
        if(!domain || domain.enabled === false || domain.name == this.sqs.domainManager.getActiveDomain().name) {
            return null;
        }
        return domain;
    }

    /*
    * Function: getDomainRows
    * A row per domain which has samples in the result, with a segment per analysis method with samples in it,
    * the segments in the usual order of the methods.
    */
    getDomainRows() {
        let rows = [];
        this.data.domains.forEach(domain => {
            let methodCounts = (Array.isArray(domain.method_counts) ? domain.method_counts : []).filter(methodCount => methodCount.sample_count > 0);
            if(methodCounts.length == 0) {
                return;
            }
            methodCounts.sort((a, b) => this.sqs.color.compareAnalysisMethods({ method_id: a.method_id }, { method_id: b.method_id }));
            let total = methodCounts.reduce((sum, methodCount) => sum + methodCount.sample_count, 0);
            let fallbackColors = this.sqs.color.getColorScheme(methodCounts.length);
            rows.push({
                label: domain.display_title || domain.facet_code,
                domain: this.getSwitchableDomain(domain.facet_code),
                color: this.getDomainColor(domain.facet_code),
                total: total,
                segments: methodCounts.map((methodCount, index) => ({
                    methodId: methodCount.method_id,
                    methodName: methodCount.method_name || "Method "+methodCount.method_id,
                    count: methodCount.sample_count,
                    share: total > 0 ? methodCount.sample_count / total : 0,
                    color: this.sqs.color.getAnalysisMethodColor(methodCount.method_id) || fallbackColors[index % fallbackColors.length]
                }))
            });
        });
        rows.sort((a, b) => b.total - a.total);
        return rows;
    }

    renderView() {
        let chartNode = this.getChartNode();
        let rows = this.getDomainRows();

        this.setMosaicTileSubtitle("Samples analysed per domain, split by method");

        let emptyDomains = this.data.domains.filter(domain => !rows.find(row => row.label == (domain.display_title || domain.facet_code)));
        let emptyNote = emptyDomains.length > 0 ? "No samples in this result: "+emptyDomains.map(domain => domain.display_title || domain.facet_code).join(", ")+"." : "";

        if(this.view == "table") {
            let tableRows = [];
            rows.forEach(row => {
                row.segments.forEach(segment => {
                    tableRows.push([row.label, { text: segment.methodName, color: segment.color }, this.formatCount(segment.count)]);
                });
            });
            this.renderDataTable(chartNode, [
                { title: "Domain" },
                { title: "Method" },
                { title: "Samples", numeric: true }
            ], tableRows);
            if(emptyNote) {
                chartNode.append($("<p class='mosaic-chart-note'></p>").text(emptyNote));
            }
            return;
        }

        let maxTotal = rows.reduce((max, row) => Math.max(max, row.total), 0);
        let ticks = this.getNiceTicks(maxTotal, 6);
        let axisMax = ticks[ticks.length - 1];

        let listNode = $("<div class='mosaic-bars mosaic-bars-stacked'></div>");
        let readoutNode = $("<div class='mosaic-chart-readout' aria-live='polite'><span class='sqs-dot'></span><span class='mosaic-chart-readout-text'></span></div>");
        let defaultReadout = "Hover or focus a segment to see its method. Click it to add the method as a filter, or click a domain to switch to it.";
        let setReadout = (segment = null, row = null) => {
            readoutNode.find(".sqs-dot").css("background-color", segment ? segment.color : "transparent");
            readoutNode.find(".mosaic-chart-readout-text").text(segment ? row.label+" · "+segment.methodName+" · "+this.formatCount(segment.count)+(segment.count == 1 ? " sample" : " samples")+" · "+this.formatShare(segment.share)+" of the domain" : defaultReadout);
        };

        rows.forEach(row => {
            let rowNode = $("<div class='mosaic-bar-row'></div>");
            let labelNode = $("<span class='mosaic-bar-label'></span>");
            if(row.domain) {
                labelNode = $("<button type='button' class='mosaic-bar-label'></button>");
                labelNode.attr("title", "Switch to the "+row.domain.title+" domain");
                labelNode.attr("aria-label", row.label+", switch to the "+row.domain.title+" domain");
                labelNode.on("click", () => {
                    this.sqs.domainManager.switchDomain(row.domain.name);
                });
            }
            labelNode.append($("<span class='sqs-dot'></span>").css("background-color", row.color));
            labelNode.append($("<span class='mosaic-bar-label-text'></span>").text(row.label));
            rowNode.append(labelNode);

            let trackNode = $("<span class='mosaic-bar-track'></span>");
            let barNode = $("<span class='mosaic-bar mosaic-bar-segmented'></span>");
            barNode.css("width", Math.max(0.6, row.total / axisMax * 100)+"%");
            row.segments.forEach(segment => {
                let onClick = this.getFilterToggleCallback("dataset_methods", segment.methodId);
                let segmentNode = $(onClick ? "<button type='button'></button>" : "<span></span>").addClass("mosaic-bar-segment");
                segmentNode.css({ flexGrow: segment.count, backgroundColor: segment.color });
                segmentNode.attr("aria-label", row.label+", "+segment.methodName+", "+this.formatCount(segment.count)+" samples, "+this.formatShare(segment.share)+" of the domain");
                if(onClick) {
                    let selected = this.isFilterSelection("dataset_methods", segment.methodId);
                    segmentNode.attr("aria-pressed", selected ? "true" : "false");
                    segmentNode.on("click", onClick);
                }
                segmentNode.on("mouseenter focus", () => {
                    listNode.addClass("mosaic-bars-segment-hover");
                    listNode.find(".mosaic-bar-segment").removeClass("mosaic-bar-segment-hot");
                    segmentNode.addClass("mosaic-bar-segment-hot");
                    setReadout(segment, row);
                });
                barNode.append(segmentNode);
            });
            trackNode.append(barNode);
            rowNode.append(trackNode);

            rowNode.append($("<span class='mosaic-bar-value'></span>").text(this.formatCount(row.total)));
            listNode.append(rowNode);
        });

        listNode.on("mouseleave", () => {
            listNode.removeClass("mosaic-bars-segment-hover");
            listNode.find(".mosaic-bar-segment").removeClass("mosaic-bar-segment-hot");
            setReadout();
        });

        let axisNode = $("<div class='mosaic-bar-axis' aria-hidden='true'><span></span><span class='mosaic-bar-ticks'></span><span></span></div>");
        ticks.forEach(tick => {
            axisNode.find(".mosaic-bar-ticks").append($("<span class='mosaic-bar-tick'></span>").text(this.formatAxisCount(tick)).css("left", (tick / axisMax * 100)+"%"));
        });
        listNode.append(axisNode);

        chartNode.append(listNode);
        setReadout();
        chartNode.append(readoutNode);
        if(emptyNote) {
            chartNode.append($("<p class='mosaic-chart-note'></p>").text(emptyNote));
        }

        this.exportImageRows = rows.map(row => ({
            label: row.label,
            valueText: this.formatCount(row.total),
            segments: row.segments.map(segment => ({
                fraction: segment.count / axisMax,
                color: segment.color
            }))
        }));
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
        const result = await this.fetchData(`#${chartContainerId}`);
        if (!result) {
            this.renderComplete = true;
            return;
        }
        if (result.requestId != this.requestId) {
            return; //A newer render has taken over
        }
        this.data = result.data;

        if (!this.data || !Array.isArray(this.data.domains) || this.getDomainRows().length == 0) {
            this.renderNoData();
            this.renderComplete = true;
            return;
        }

        this.renderViewToggle([{ id: "count", label: "Count" }, { id: "table", label: "Table" }], () => {
            this.renderView();
        });
        this.renderView();
        this.renderComplete = true;
    }

    async update() {
        this.render();
    }

    getAvailableExportFormats() {
        return ["json", "csv", "png"];
    }

    formatDataForExport(data, format = "json") {
        if (format == "csv" || format == "xlsx") {
            const rows = [];
            (data?.domains || []).forEach(domain => {
                const methodCounts = Array.isArray(domain.method_counts) ? domain.method_counts : [];
                if(methodCounts.length === 0) {
                    rows.push({
                        domain: domain.display_title || domain.facet_code || "Unknown",
                        facet_code: domain.facet_code || "",
                        method_id: "",
                        method_name: "",
                        sample_count: 0
                    });
                }
                methodCounts.forEach(method => {
                    rows.push({
                        domain: domain.display_title || domain.facet_code || "Unknown",
                        facet_code: domain.facet_code || "",
                        method_id: method.method_id,
                        method_name: method.method_name || "",
                        sample_count: method.sample_count
                    });
                });
            });
            return rows;
        }
        return data;
    }
}

export default MosaicDomainSamples;
