import { nanoid } from "nanoid";
import { saveAs } from "file-saver";
import MosaicTileModule from "./MosaicTileModule.class";

const SVG_NS = "http://www.w3.org/2000/svg";

//A color per band - a method group, or dendrochronology - which stays the same whatever bands the result has.
//In the order the bands are stacked, so neighbours are told apart; "Dating by other method" is the gray of an "other".
const BAND_COLORS = {
    method_group_19: "#1f9e89", //Dating to period
    method_group_20: "#3a6fc4", //Dating to calendar year(s)
    dendrochronology: "#e8961c",
    method_group_3: "#7a5cc0", //Dating by radiometric methods
    method_group_22: "#d4568c", //Dating by radiation exposure methods
    method_group_1: "#a8a020", //Palaeobiological
    method_group_21: "#8a929c" //Dating by other method
};
const UNKNOWN_BAND_COLOR = "#b4b4b4";

const TEXT_COLOR = "#1e1e1e";
const TEXT_MUTED_COLOR = "#636363";
const AXIS_COLOR = "#d6d6d6";
const SURFACE_COLOR = "#ffffff";
const FONT_FAMILY = "'IBM Plex Sans', sans-serif";

/*
* Class: MosaicTemporalDistributionModule
*
* When the dating evidence of the sites in the result is from, on one time axis in three segments: before the
* Holocene on a log scale, the Holocene and the last millennium, each in bins drawn equally wide. Stacked in a band
* per kind of dating - a method group, with dendrochronology on its own - counting the sites with dates in each bin.
* Ages in radiocarbon years are not calibrated, and sites dated only in them are hatched.
* The data is from the JSON API server's /graphs/temporal_distribution.
*/
class MosaicTemporalDistributionModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "When the evidence comes from";
        this.description = "When the dates of the sites in the result are from, on one time axis: before the Holocene on a log scale, then the Holocene, and the last millennium spread out. Each band is a kind of dating - a method group, with dendrochronology on its own - and its height is the number of sites with a date of that kind in the span, however many dates they have. Hatched are sites dated only in radiocarbon years there, which are not calibrated, so they show as younger than they are. A composite chronology is only counted for samples that no other method dates.";
        this.name = "mosaic-temporal-distribution";
        this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.requestId = 0;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.renderComplete = false;
        this.chartType = "html";
        this.showChartSelector = false;
        this.view = "chart";
        this.resizeObserver = null;
        this.cursorBin = null;
    }

    async fetchData(renderIntoNode = null) {
        const requestId = ++this.requestId;
        const resultMosaic = this.sqs.resultManager.getModule("mosaic");
        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, true);
        }
        let response = null;
        try {
            response = await super.fetchData("/graphs/temporal_distribution", JSON.stringify(resultMosaic.getResultSiteIds()));
        }
        catch(error) {
            console.warn("Could not fetch the temporal distribution", error);
        }
        if(!response) {
            if(renderIntoNode) {
                this.sqs.setLoadingIndicator(renderIntoNode, false);
            }
            return false;
        }
        const data = await response.json();
        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, false);
        }
        return {
            requestId: requestId,
            data: data
        };
    }

    getBandColor(bandId) {
        return BAND_COLORS[bandId] || UNKNOWN_BAND_COLOR;
    }

    getSegment(segmentId) {
        return this.data.segments.find(segment => segment.id == segmentId);
    }

    /*
    * Function: formatYear
    * A year BP as it is read on the axis: thousands or millions of years ago before the Holocene, else a calendar year.
    */
    formatYear(bp, withEra = true) {
        if(bp > 11700) {
            if(bp >= 1e6) {
                return (Math.round(bp / 1e5) / 10).toLocaleString("en-GB")+" Ma";
            }
            return Math.round(bp / 1000).toLocaleString("en-GB")+" ka";
        }
        const year = Math.round(this.data.bp_year - bp);
        if(year <= 0) {
            return (1 - year)+(withEra ? " BC" : "");
        }
        return (withEra ? "AD " : "")+year;
    }

    /*
    * Function: formatSpan
    * The span of a bin, e.g. "AD 1500–1525", "4925–4800 BC" or "98–70 ka".
    */
    formatSpan(older, younger) {
        if(younger >= 11700) {
            let olderText = this.formatYear(older);
            let youngerText = this.formatYear(younger);
            let unit = olderText.slice(-3);
            return youngerText.endsWith(unit) ? olderText.slice(0, -3)+"–"+youngerText : olderText+" – "+youngerText;
        }
        const olderYear = Math.round(this.data.bp_year - older);
        const youngerYear = Math.round(this.data.bp_year - younger);
        if(olderYear > 0) {
            return "AD "+olderYear+"–"+youngerYear;
        }
        if(youngerYear <= 0) {
            return (1 - olderYear)+"–"+(1 - youngerYear)+" BC";
        }
        return (1 - olderYear)+" BC – AD "+youngerYear;
    }

    hasRadiocarbonOnlySites() {
        return this.data.bands.some(band => band.radiocarbon_sites.some(count => count > 0));
    }

    renderLegend() {
        const legendNode = $("<div class='mosaic-chart-legend'></div>");
        this.data.bands.forEach(band => {
            const itemNode = $("<span class='mosaic-chart-legend-item'></span>");
            itemNode.append($("<span class='sqs-dot'></span>").css("background-color", this.getBandColor(band.id)));
            itemNode.append($("<span></span>").text(band.label));
            itemNode.attr("title", band.methods.map(method => method.method_name).join(", "));
            legendNode.append(itemNode);
        });
        if(this.hasRadiocarbonOnlySites()) {
            const itemNode = $("<span class='mosaic-chart-legend-item'></span>");
            itemNode.append("<span class='mosaic-temporal-hatch-swatch' aria-hidden='true'></span>");
            itemNode.append($("<span></span>").text("Radiocarbon years, not calibrated"));
            legendNode.append(itemNode);
        }
        return legendNode;
    }

    renderView() {
        this.disconnectResizeObserver();
        const chartNode = this.getChartNode();
        this.setMosaicTileSubtitle("Sites by the age of their dates, per kind of dating");

        if(this.view == "table") {
            this.renderTable(chartNode);
            return;
        }

        chartNode.addClass("mosaic-tile-chart-fill");
        chartNode.append(this.renderLegend());
        const canvasNode = $("<div class='mosaic-tile-canvas mosaic-temporal-canvas'></div>");
        chartNode.append(canvasNode);
        this.readoutNode = $("<div class='mosaic-chart-readout mosaic-temporal-readout' aria-live='polite'></div>");
        chartNode.append(this.readoutNode);
        this.renderCoverage(chartNode, this.data.dated_site_count, this.data.site_count, "sites", { compact: true, predicate: "have dates" });

        this.chartSize = null;
        this.cursorBin = null;
        this.reserveReadoutHeight();
        this.drawChart(canvasNode[0]);
        this.resizeObserver = new ResizeObserver(() => {
            //A change of width can change how the readout wraps, and with it the height left for the chart
            if(this.chartSize && this.chartSize.width != Math.floor(canvasNode[0].clientWidth)) {
                this.reserveReadoutHeight();
            }
            this.drawChart(canvasNode[0]);
        });
        this.resizeObserver.observe(canvasNode[0]);
    }

    /*
    * Function: reserveReadoutHeight
    * The readout is kept as tall as it is for the bin with the most bands in it, so the chart over it doesn't change
    * size, and redraw, as it is pointed at.
    */
    reserveReadoutHeight() {
        let fullestBin = 0;
        let fullestBandCount = -1;
        this.data.bins.forEach((bin, index) => {
            const bandCount = this.data.bands.filter(band => band.sites[index] > 0).length;
            if(bandCount > fullestBandCount) {
                fullestBin = index;
                fullestBandCount = bandCount;
            }
        });
        this.readoutNode.css({ boxSizing: "border-box", minHeight: "" });
        this.setReadout(fullestBin);
        const height = Math.ceil(this.readoutNode.outerHeight());
        this.setReadout(this.cursorBin);
        this.readoutNode.css("min-height", height+"px");
    }

    renderTable(chartNode) {
        const rows = this.data.bands.map(band => [
            { text: band.label, color: this.getBandColor(band.id) },
            this.formatCount(band.site_count),
            this.formatCount(band.age_count),
            this.formatCount(band.radiocarbon_age_count),
            this.formatYear(band.older),
            this.formatYear(band.younger)
        ]);
        const tableNode = this.renderDataTable(chartNode, [
            { title: "Kind of dating" },
            { title: "Sites", numeric: true },
            { title: "Dates", numeric: true },
            { title: "In radiocarbon years", numeric: true },
            { title: "Oldest" },
            { title: "Youngest" }
        ], rows);
        tableNode.find("tbody tr").each((index, rowNode) => {
            $(rowNode).attr("title", this.data.bands[index].methods.map(method => method.method_name).join(", "));
        });
        if(this.data.excluded_composite_age_count > 0) {
            chartNode.append($("<p class='mosaic-chart-note'></p>").text(this.formatCount(this.data.excluded_composite_age_count)+" dates of composite chronologies are left out, as their samples are dated by other methods too."));
        }
    }

    disconnectResizeObserver() {
        if(this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    }

    createSvgElement(name, attributes = {}) {
        const element = document.createElementNS(SVG_NS, name);
        Object.keys(attributes).forEach(key => element.setAttribute(key, attributes[key]));
        return element;
    }

    /*
    * Function: drawChart
    *
    * Draws the stacked bands as an SVG filling the container, again whenever it changes size.
    */
    drawChart(container) {
        const width = Math.floor(container.clientWidth);
        const height = Math.floor(container.clientHeight);
        if(width < 80 || height < 60) {
            return;
        }
        if(this.chartSize && this.chartSize.width == width && this.chartSize.height == height) {
            return;
        }
        this.chartSize = { width: width, height: height };
        //A redraw keeps the bin pointed at, and the focus if the chart had it
        const hadFocus = container.contains(document.activeElement);
        const cursorBin = this.cursorBin;
        $(container).empty();
        this.cursorBin = cursorBin;

        const px = n => this.sqs.scalePx(n);
        const bins = this.data.bins;
        const binCount = bins.length;
        const margin = { top: px(20), right: px(2), bottom: px(24), left: px(2) };
        const plot = { x: margin.left, y: margin.top, w: width - margin.left - margin.right, h: height - margin.top - margin.bottom };
        const binWidth = plot.w / binCount;
        const xOfBin = index => plot.x + index * binWidth;
        const round = value => Math.round(value * 100) / 100;

        //The layers, from the bottom up: each band, and then its sites dated only in radiocarbon years
        const layers = [];
        const stackTop = new Array(binCount).fill(0);
        this.data.bands.forEach(band => {
            [false, true].forEach(radiocarbon => {
                const values = radiocarbon ? band.radiocarbon_sites : band.sites.map((count, index) => count - band.radiocarbon_sites[index]);
                if(!values.some(value => value > 0)) {
                    return;
                }
                const lower = stackTop.slice();
                values.forEach((value, index) => stackTop[index] += value);
                layers.push({ band: band, radiocarbon: radiocarbon, lower: lower, upper: stackTop.slice() });
            });
        });
        const maxTotal = Math.max(...stackTop);
        const yOf = value => plot.y + plot.h - (maxTotal > 0 ? value / maxTotal * plot.h : 0);

        const svg = this.createSvgElement("svg", {
            class: "mosaic-temporal-svg",
            width: width,
            height: height,
            viewBox: "0 0 "+width+" "+height,
            tabindex: "0",
            role: "group",
            "font-family": FONT_FAMILY,
            "aria-label": "When the dates of "+this.formatCount(this.data.dated_site_count)+" sites are from. Use the left and right arrow keys to step through time."
        });
        container.appendChild(svg);

        const patternPrefix = "temporal-hatch-"+nanoid(6)+"-";
        const defs = this.createSvgElement("defs");
        svg.appendChild(defs);
        this.data.bands.forEach(band => {
            if(!band.radiocarbon_sites.some(value => value > 0)) {
                return;
            }
            const pattern = this.createSvgElement("pattern", { id: patternPrefix+band.id, patternUnits: "userSpaceOnUse", width: 5, height: 5, patternTransform: "rotate(45)" });
            pattern.appendChild(this.createSvgElement("rect", { width: 5, height: 5, fill: this.getBandColor(band.id) }));
            pattern.appendChild(this.createSvgElement("rect", { width: 2, height: 5, fill: SURFACE_COLOR, "fill-opacity": 0.7 }));
            defs.appendChild(pattern);
        });

        //Hairlines at round numbers of sites, labelled at the left, behind the bands
        const yTicks = this.getNiceTicks(maxTotal, 3).filter(tick => tick > 0 && tick <= maxTotal);
        yTicks.forEach((tick, index) => {
            const y = Math.round(yOf(tick)) + 0.5;
            svg.appendChild(this.createSvgElement("line", { x1: plot.x, x2: plot.x + plot.w, y1: y, y2: y, stroke: AXIS_COLOR, "stroke-width": 1, "stroke-opacity": 0.7 }));
        });

        //The bands, as steps over the bins, each edged in the surface color so neighbours stand apart
        layers.forEach(layer => {
            let path = "";
            for(let i = 0; i < binCount; i++) {
                path += (i == 0 ? "M" : "L")+round(xOfBin(i))+","+round(yOf(layer.upper[i]))+"L"+round(xOfBin(i + 1))+","+round(yOf(layer.upper[i]));
            }
            for(let i = binCount - 1; i >= 0; i--) {
                path += "L"+round(xOfBin(i + 1))+","+round(yOf(layer.lower[i]))+"L"+round(xOfBin(i))+","+round(yOf(layer.lower[i]));
            }
            svg.appendChild(this.createSvgElement("path", {
                d: path+"Z",
                fill: layer.radiocarbon ? "url(#"+patternPrefix+layer.band.id+")" : this.getBandColor(layer.band.id),
                stroke: SURFACE_COLOR,
                "stroke-width": 1,
                "stroke-linejoin": "round"
            }));
        });

        //The segments: a line where each starts, and its name over it
        const segmentNames = {
            pleistocene: this.data.segments[0] && this.data.segments[0].older > 2580000 ? ["Pleistocene and older · log scale", "Pleistocene", "Pleist."] : ["Pleistocene · log scale", "Pleistocene", "Pleist."],
            holocene: ["Holocene", "Hol."],
            last_millennium: ["Last millennium · spread out", "Last millennium", "Last mill."]
        };
        this.data.segments.forEach((segment, index) => {
            const segmentX = xOfBin(segment.first_bin);
            if(index > 0) {
                svg.appendChild(this.createSvgElement("line", { x1: round(segmentX), x2: round(segmentX), y1: plot.y - px(16), y2: plot.y + plot.h, stroke: TEXT_MUTED_COLOR, "stroke-width": 1, "stroke-opacity": 0.45 }));
            }
            const labelNode = this.createSvgElement("text", {
                x: round(segmentX + (index > 0 ? px(5) : 0)),
                y: plot.y - px(7),
                fill: TEXT_MUTED_COLOR,
                "font-size": px(10),
                "font-weight": 600,
                "letter-spacing": "0.04em"
            });
            svg.appendChild(labelNode);
            const roomForLabel = segment.bin_count * binWidth - px(10);
            const names = segmentNames[segment.id] || [segment.id];
            const fittingName = names.find(name => {
                labelNode.textContent = name.toUpperCase();
                return labelNode.getComputedTextLength() <= roomForLabel;
            });
            if(!fittingName) {
                labelNode.remove();
            }
        });

        //The labels of the hairlines go over the bands, haloed in the surface color so they can be read on them
        yTicks.forEach((tick, index) => {
            const labelNode = this.createSvgElement("text", {
                x: plot.x + px(2),
                y: Math.round(yOf(tick)) - px(3),
                fill: TEXT_MUTED_COLOR,
                "font-size": px(10),
                stroke: SURFACE_COLOR,
                "stroke-width": 3,
                "stroke-linejoin": "round",
                "paint-order": "stroke"
            });
            labelNode.textContent = this.formatAxisCount(tick)+(index == yTicks.length - 1 ? " sites" : "");
            svg.appendChild(labelNode);
        });

        //The baseline and its ticks
        svg.appendChild(this.createSvgElement("line", { x1: plot.x, x2: plot.x + plot.w, y1: round(plot.y + plot.h) + 0.5, y2: round(plot.y + plot.h) + 0.5, stroke: AXIS_COLOR, "stroke-width": 1 }));
        this.drawTicks(svg, plot, xOfBin, px);

        //A column marks the bin pointed at, and the readout says what is in it
        const cursorNode = this.createSvgElement("rect", { class: "mosaic-temporal-hover", x: 0, y: plot.y, width: round(binWidth), height: plot.h, fill: TEXT_COLOR, "fill-opacity": 0.12, visibility: "hidden", "pointer-events": "none" });
        svg.appendChild(cursorNode);
        const showBin = binIndex => {
            this.cursorBin = binIndex;
            if(binIndex === null) {
                cursorNode.setAttribute("visibility", "hidden");
                this.setReadout(null);
                return;
            }
            cursorNode.setAttribute("x", round(xOfBin(binIndex)));
            cursorNode.setAttribute("visibility", "visible");
            this.setReadout(binIndex);
        };
        const hitNode = this.createSvgElement("rect", { class: "mosaic-temporal-hover", x: plot.x, y: 0, width: plot.w, height: plot.y + plot.h, fill: "transparent" });
        svg.appendChild(hitNode);
        hitNode.addEventListener("mousemove", event => {
            const bounds = svg.getBoundingClientRect();
            const binIndex = Math.floor((event.clientX - bounds.left - plot.x) / binWidth);
            if(binIndex >= 0 && binIndex < binCount && binIndex !== this.cursorBin) {
                showBin(binIndex);
            }
        });
        hitNode.addEventListener("mouseleave", () => {
            if(document.activeElement !== svg) {
                showBin(null);
            }
        });
        svg.addEventListener("focus", () => {
            if(this.cursorBin === null) {
                showBin(this.data.sites_per_bin.indexOf(Math.max(...this.data.sites_per_bin)));
            }
        });
        svg.addEventListener("blur", () => showBin(null));
        svg.addEventListener("keydown", event => {
            const steps = { ArrowLeft: -1, ArrowRight: 1, PageUp: -10, PageDown: 10 };
            let binIndex = this.cursorBin === null ? 0 : this.cursorBin;
            if(event.key in steps) {
                binIndex = Math.min(binCount - 1, Math.max(0, binIndex + steps[event.key]));
            }
            else if(event.key == "Home") {
                binIndex = 0;
            }
            else if(event.key == "End") {
                binIndex = binCount - 1;
            }
            else {
                return;
            }
            event.preventDefault();
            showBin(binIndex);
        });
        if(this.cursorBin !== null) {
            showBin(this.cursorBin);
        }
        if(hadFocus) {
            svg.focus({ preventScroll: true });
        }
    }

    /*
    * Function: drawTicks
    *
    * Ticks at round years in each segment - ka and Ma before the Holocene, calendar years after - left out where
    * their labels would run into the ones before them.
    */
    drawTicks(svg, plot, xOfBin, px) {
        const bins = this.data.bins;
        const bpYear = this.data.bp_year;
        const xOfYear = bp => {
            for(let i = 0; i < bins.length; i++) {
                const bin = bins[i];
                if(bp <= bin.older && bp >= bin.younger) {
                    const segment = this.getSegment(bin.segment);
                    const fraction = segment && segment.scale == "log"
                        ? (Math.log(bin.older) - Math.log(bp)) / (Math.log(bin.older) - Math.log(bin.younger))
                        : (bin.older - bp) / (bin.older - bin.younger);
                    return xOfBin(i + fraction);
                }
            }
            return null;
        };

        const ticks = [];
        const pleistocene = this.getSegment("pleistocene");
        if(pleistocene) {
            //The oldest age, at the left edge, says how far back the compressed segment reaches
            ticks.push({ bp: pleistocene.older, label: this.formatYear(pleistocene.older) });
            [2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8].forEach(bp => ticks.push({ bp: bp, label: this.formatYear(bp) }));
        }
        [-8000, -6000, -4000, -2000].forEach(year => ticks.push({ bp: bpYear - year, label: (-year)+" BC" }));
        ticks.push({ bp: bpYear, label: "BC | AD" });
        [1000, 1250, 1500, 1750, 2000].forEach(year => ticks.push({ bp: bpYear - year, label: String(year) }));

        const baseY = plot.y + plot.h;
        const gap = px(10);
        let lastRight = -Infinity;
        ticks.forEach(tick => {
            const x = xOfYear(tick.bp);
            if(x === null) {
                return;
            }
            const labelNode = this.createSvgElement("text", {
                x: Math.round(x * 100) / 100,
                y: baseY + px(16),
                fill: TEXT_MUTED_COLOR,
                "font-size": px(11),
                "text-anchor": "middle"
            });
            labelNode.textContent = tick.label;
            svg.appendChild(labelNode);
            const labelWidth = labelNode.getComputedTextLength();
            let left = x - labelWidth / 2;
            //A label at an edge of the chart is anchored there rather than cut off
            if(left < plot.x) {
                labelNode.setAttribute("text-anchor", "start");
                labelNode.setAttribute("x", plot.x);
                left = plot.x;
            }
            else if(x + labelWidth / 2 > plot.x + plot.w) {
                labelNode.setAttribute("text-anchor", "end");
                labelNode.setAttribute("x", plot.x + plot.w);
                left = plot.x + plot.w - labelWidth;
            }
            if(left < lastRight + gap) {
                labelNode.remove();
                return;
            }
            lastRight = left + labelWidth;
            svg.appendChild(this.createSvgElement("line", { x1: Math.round(x) + 0.5, x2: Math.round(x) + 0.5, y1: baseY, y2: baseY + px(4), stroke: AXIS_COLOR, "stroke-width": 1 }));
        });
    }

    /*
    * Function: setReadout
    * What a bin holds: its span, how many sites have dates in it, and how many of them in each band.
    */
    setReadout(binIndex) {
        if(!this.readoutNode) {
            return;
        }
        this.readoutNode.empty();
        if(binIndex === null) {
            this.readoutNode.append($("<span></span>").text("Point at the chart, or focus it and use the arrow keys, to see how many sites have dates from a span of time."));
            return;
        }
        const bin = this.data.bins[binIndex];
        const siteCount = this.data.sites_per_bin[binIndex];
        const headNode = $("<span class='mosaic-temporal-readout-head'></span>");
        headNode.append($("<strong></strong>").text(this.formatSpan(bin.older, bin.younger)));
        headNode.append($("<span></span>").text(" · "+this.formatCount(siteCount)+(siteCount == 1 ? " site" : " sites")));
        this.readoutNode.append(headNode);
        this.data.bands.forEach(band => {
            const bandSites = band.sites[binIndex];
            if(bandSites == 0) {
                return;
            }
            const itemNode = $("<span class='mosaic-temporal-readout-item'></span>");
            itemNode.append($("<span class='sqs-dot'></span>").css("background-color", this.getBandColor(band.id)));
            let text = band.label+": "+this.formatCount(bandSites);
            const radiocarbonSites = band.radiocarbon_sites[binIndex];
            if(radiocarbonSites > 0) {
                text += radiocarbonSites == bandSites ? ", all in radiocarbon years" : ", "+this.formatCount(radiocarbonSites)+" only in radiocarbon years";
            }
            itemNode.append($("<span></span>").text(text));
            this.readoutNode.append(itemNode);
        });
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
        this.disconnectResizeObserver();
        $(this.renderIntoNode).empty();
        const varId = nanoid();
        const chartContainerId = "chart-container-"+varId;
        $(this.renderIntoNode).append("<div class='mosaic-tile-content' id='"+varId+"'><div class='mosaic-tile-chart' id='"+chartContainerId+"'></div></div>");

        if(this.renderNoDataIfNoSites()) {
            return;
        }
        const result = await this.fetchData("#"+chartContainerId);
        if(!result) {
            this.sqs.setErrorIndicator("#"+chartContainerId, "Could not fetch the dates of the sites");
            this.renderComplete = true;
            return;
        }
        if(result.requestId != this.requestId) {
            return; //A newer render has taken over
        }
        this.data = result.data;

        if(!this.data || !Array.isArray(this.data.bands) || this.data.bands.length == 0) {
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

    async update() {
        this.render();
    }

    async unrender() {
        this.disconnectResizeObserver();
        return super.unrender();
    }

    getAvailableExportFormats() {
        return ["json", "csv", "xlsx", "png"];
    }

    formatDataForExport(data, format = "json") {
        if(format == "csv" || format == "xlsx") {
            const rows = [];
            (data?.bands || []).forEach(band => {
                data.bins.forEach((bin, index) => {
                    rows.push({
                        kind_of_dating: band.label,
                        method_group_id: band.method_group_id,
                        bin_older_bp: bin.older,
                        bin_younger_bp: bin.younger,
                        bin: this.formatSpan(bin.older, bin.younger),
                        sites: band.sites[index],
                        sites_only_in_radiocarbon_years: band.radiocarbon_sites[index]
                    });
                });
            });
            return rows;
        }
        return data;
    }

    /*
    * Function: exportImageAsPng
    * The chart is an SVG, so it is drawn onto a canvas, under the tile's title, subtitle and legend.
    */
    async exportImageAsPng() {
        const svgNode = $(this.renderIntoNode).find("svg.mosaic-temporal-svg")[0];
        if(!svgNode) {
            return super.exportImageAsPng();
        }
        const filename = "sead_"+this.getExportFilenameBase()+"_chart.png";
        const clone = svgNode.cloneNode(true);
        $(clone).find(".mosaic-temporal-hover").remove();
        clone.setAttribute("xmlns", SVG_NS);
        const chartWidth = Number(svgNode.getAttribute("width"));
        const chartHeight = Number(svgNode.getAttribute("height"));

        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(new XMLSerializer().serializeToString(clone));
        });

        const paddingX = 28;
        const legendTop = 76;
        const legendRowHeight = 22;
        const scale = Math.max(2, window.devicePixelRatio || 1);
        const width = Math.max(chartWidth + paddingX * 2, 600);

        //The legend items, wrapped into rows as wide as the image
        const measureCanvas = document.createElement("canvas").getContext("2d");
        measureCanvas.font = "400 13px "+FONT_FAMILY;
        const legendItems = this.data.bands.map(band => ({ label: band.label, color: this.getBandColor(band.id) }));
        if(this.hasRadiocarbonOnlySites()) {
            legendItems.push({ label: "Radiocarbon years, not calibrated", hatched: true });
        }
        const legendRows = [[]];
        let rowWidth = 0;
        legendItems.forEach(item => {
            item.width = 16 + measureCanvas.measureText(item.label).width + 20;
            if(rowWidth + item.width > width - paddingX * 2 && legendRows[legendRows.length - 1].length > 0) {
                legendRows.push([]);
                rowWidth = 0;
            }
            legendRows[legendRows.length - 1].push(item);
            rowWidth += item.width;
        });
        const chartTop = legendTop + legendRows.length * legendRowHeight + 8;
        const height = chartTop + chartHeight + 20;

        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        const ctx = canvas.getContext("2d");
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = SURFACE_COLOR;
        ctx.fillRect(0, 0, width, height);
        ctx.textBaseline = "middle";

        const tileNode = $(this.renderIntoNode).closest(".result-mosaic-tile");
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = "600 20px "+FONT_FAMILY;
        ctx.fillText(tileNode.find(".mosaic-tile-title").first().text() || this.title, paddingX, 32);
        ctx.fillStyle = TEXT_MUTED_COLOR;
        ctx.font = "400 14px "+FONT_FAMILY;
        ctx.fillText(tileNode.find(".mosaic-tile-subtitle").first().text(), paddingX, 56);

        ctx.font = "400 13px "+FONT_FAMILY;
        legendRows.forEach((row, rowIndex) => {
            let x = paddingX;
            const y = legendTop + rowIndex * legendRowHeight + legendRowHeight / 2;
            row.forEach(item => {
                ctx.fillStyle = item.hatched ? "#8a8a8a" : item.color;
                ctx.beginPath();
                ctx.arc(x + 5, y, 5, 0, Math.PI * 2);
                ctx.fill();
                if(item.hatched) {
                    ctx.save();
                    ctx.clip();
                    ctx.strokeStyle = SURFACE_COLOR;
                    ctx.lineWidth = 1.5;
                    for(let offset = -10; offset < 10; offset += 4) {
                        ctx.beginPath();
                        ctx.moveTo(x + offset, y + 6);
                        ctx.lineTo(x + offset + 12, y - 6);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                ctx.fillStyle = TEXT_MUTED_COLOR;
                ctx.fillText(item.label, x + 16, y);
                x += item.width;
            });
        });

        ctx.drawImage(image, paddingX, chartTop, chartWidth, chartHeight);

        await new Promise(resolve => {
            canvas.toBlob(blob => {
                if(blob) {
                    saveAs(blob, filename);
                }
                resolve();
            }, "image/png");
        });
        return true;
    }
}

export default MosaicTemporalDistributionModule;
