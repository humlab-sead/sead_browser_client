import MosaicTileModule from "./MosaicTileModule.class";
import { nanoid } from "nanoid";

/**
 * MosaicMutualClimaticRangeModule
 *
 * Fetches MCR reconstructions for all currently selected sites via
 * POST /mcr/sites, then renders an aggregate density heatmap.
 *
 * Each cell in the aggregate density_matrix is the sum of taxon counts
 * across all sites. Cells with full cross-site consensus (matrix='1')
 * are rendered in black.
 */
class MosaicMutualClimaticRangeModule extends MosaicTileModule {
    constructor(sqs) {
        super(sqs);
        this.sqs = sqs;
        this.title = "Mutual climatic range";
        this.description = "Mutual Climatic Range (MCR) reconstruction based on fossil beetle (Coleoptera) taxa found at the selected sites. The chart shows the climate envelope — compatible Tmax (mean temperature of the warmest month) vs Trange (difference between warmest and coldest month) — derived from the overlap of all MCR-registered species present. Cells where all taxa agree are shown in black.";
        this.name = "mutual-climatic-range";
        this.domains = ["palaeo"];
        this.showChartSelector = false;
        this.chartType = "canvas";
        this.renderIntoNode = null;
        this.active = true;
        this.renderComplete = false;
        this.data = null;
        this._tooltipEl = null;
        this._canvas = null;
        this._agg = null;
        this._resizeObserver = null;
        this._dims = null; // computed per-draw, read by tooltip handler

        // Axis dimensions — fixed by the MCR temperature grid
        this.ROWS = 36; // Trange: 0–35 °C
        this.COLS = 60; // Tmax:  −10 to +49 °C

        // Fixed layout margins (px)
        this.MARGIN_LEFT   = 40;
        this.MARGIN_RIGHT  = 6;
        this.MARGIN_TOP    = 6;
        this.MARGIN_BOTTOM = 40;

        this.requestId = 0;
    }

    async fetchData() {
        const resultMosaic = this.sqs.resultManager.getModule("mosaic");
        const siteIds = resultMosaic.sites.map(s => parseInt(s.site_id ?? s, 10)).filter(n => !isNaN(n));

        if (siteIds.length === 0) return null;

        const response = await fetch(this.sqs.config.dataServerAddress + "/mcr/sites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(siteIds)
        });

        if (!response.ok) throw new Error(`MCR /sites request failed: ${response.status}`);
        return await response.json();
    }

    /**
     * Aggregate an array of per-site MCR responses into a single
     * density matrix (summed counts) and a binary consensus matrix.
     * Each site response is flat (no reconstruction wrapper):
     *   { density_matrix, taxa_count, density_bounds, climate_stats }
     */
    _aggregate(siteResponses) {
        const density   = Array.from({ length: this.ROWS }, () => new Int32Array(this.COLS));
        const consensus = Array.from({ length: this.ROWS }, () => new Uint8Array(this.COLS).fill(1));
        let anyData = false;
        let totalTaxa = 0;

        for (const res of siteResponses) {
            if (!res || !res.density_matrix || !res.taxa_count) continue;
            const { density_matrix, taxa_count } = res;

            anyData = true;
            totalTaxa += taxa_count;

            for (let r = 0; r < this.ROWS; r++) {
                for (let c = 0; c < this.COLS; c++) {
                    density[r][c] += density_matrix[r][c];
                    // Consensus: all taxa at this site must tolerate this cell
                    if (density_matrix[r][c] < taxa_count) consensus[r][c] = 0;
                }
            }
        }

        if (!anyData) return null;

        // Consensus bounding box (cells where ALL taxa from ALL sites agree)
        let consColMin = this.COLS, consColMax = -1, consRowMin = this.ROWS, consRowMax = -1;
        for (let r = 0; r < this.ROWS; r++) {
            for (let c = 0; c < this.COLS; c++) {
                if (consensus[r][c]) {
                    consColMin = Math.min(consColMin, c);
                    consColMax = Math.max(consColMax, c);
                    consRowMin = Math.min(consRowMin, r);
                    consRowMax = Math.max(consRowMax, r);
                }
            }
        }

        // Max density value for colour normalization
        let maxDensity = 0;
        for (let r = 0; r < this.ROWS; r++) {
            for (let c = 0; c < this.COLS; c++) {
                if (density[r][c] > maxDensity) maxDensity = density[r][c];
            }
        }

        return {
            density,
            consensus,
            maxDensity,
            totalTaxa,
            sitesWithData: siteResponses[0]?.site_ids?.length ?? siteResponses.filter(r => r?.taxa_count > 0).length,
            consensusBbox: consColMax >= 0 ? [consColMin, consColMax, consRowMin, consRowMax] : null,
        };
    }

    _densityColor(count, maxDensity) {
        if (count === 0 || maxDensity === 0) return '#ebebeb';
        const t = count / maxDensity;
        const r = Math.round(191 + (29  - 191) * t);
        const g = Math.round(219 + (78  - 219) * t);
        const b = Math.round(254 + (216 - 254) * t);
        return `rgb(${r},${g},${b})`;
    }

    // Draw the heatmap to exactly fill the wrapper's current box.
    // Called on every resize — cheap, reads the cached aggregate, never refetches.
    _drawChart(canvas, agg) {
        const wrapper = canvas.parentElement; // .mcr-chart-wrapper — flexes to fill remaining tile height
        const boxW = Math.max(80, (wrapper ? wrapper.clientWidth  : 0) || 0);
        const boxH = Math.max(60, (wrapper ? wrapper.clientHeight : 0) || 0);

        // Adaptive margins: shrink the axis gutters on small tiles so the grid keeps a usable area,
        // but never exceed the comfortable fixed maxima on large tiles.
        const marginLeft   = Math.min(this.MARGIN_LEFT,   Math.round(boxW * 0.14));
        const marginBottom = Math.min(this.MARGIN_BOTTOM, Math.round(boxH * 0.18));
        const marginRight  = this.MARGIN_RIGHT;
        const marginTop    = this.MARGIN_TOP;

        const plotW = Math.max(1, boxW - marginLeft - marginRight);
        const plotH = Math.max(1, boxH - marginTop  - marginBottom);
        const cellW = plotW / this.COLS;
        const cellH = plotH / this.ROWS;

        // Cached for the tooltip handler so it stays correct after any responsive redraw.
        this._dims = { boxW, boxH, marginLeft, marginTop, plotW, plotH, cellW, cellH };

        // Render at device-pixel resolution for crisp cells/labels, present at CSS box size.
        const dpr = window.devicePixelRatio || 1;
        canvas.width  = Math.round(boxW * dpr);
        canvas.height = Math.round(boxH * dpr);
        canvas.style.width  = boxW + 'px';
        canvas.style.height = boxH + 'px';

        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, boxW, boxH);

        const { density, consensus, maxDensity } = agg;

        // 1px grid lines only when cells are large enough to read; otherwise fill gaplessly.
        const gap = (cellW > 6 && cellH > 6) ? 1 : 0;

        // Cells — boundaries rounded so adjacent cells tile exactly with no sub-pixel seams,
        // filling the whole plot area regardless of box size.
        for (let row = 0; row < this.ROWS; row++) {
            for (let col = 0; col < this.COLS; col++) {
                const displayCol = (this.COLS - 1) - col;
                const displayRow = (this.ROWS - 1) - row;
                const x0 = Math.round(marginLeft + displayCol * cellW);
                const x1 = Math.round(marginLeft + (displayCol + 1) * cellW);
                const y0 = Math.round(marginTop  + displayRow * cellH);
                const y1 = Math.round(marginTop  + (displayRow + 1) * cellH);
                ctx.fillStyle = consensus[row][col] === 1 ? '#000000' : this._densityColor(density[row][col], maxDensity);
                ctx.fillRect(x0, y0, Math.max(1, x1 - x0 - gap), Math.max(1, y1 - y0 - gap));
            }
        }

        // Axis labels, scaled to the tile and suppressed when there's no room for them.
        const fontPx = Math.max(8, Math.min(11, Math.round(boxH / 28)));
        ctx.fillStyle = '#555';
        ctx.font = fontPx + 'px sans-serif';

        const showTicks = cellW > 2;

        // X axis ticks + title
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        if (showTicks && marginBottom > 12) {
            for (let c = 0; c <= this.COLS; c += 10) {
                ctx.fillText(((this.COLS - c) - 10) + '°', marginLeft + c * cellW, marginTop + plotH + 3);
            }
        }
        if (marginBottom >= this.MARGIN_BOTTOM - 6) {
            ctx.textBaseline = 'bottom';
            ctx.fillText('Tmax (°C)', marginLeft + plotW / 2, boxH);
        }

        // Y axis ticks
        if (showTicks && marginLeft > 16) {
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (let r = 0; r < this.ROWS; r += 5) {
                ctx.fillText((this.ROWS - 1 - r) + '°', marginLeft - 4, marginTop + r * cellH + cellH / 2);
            }
        }

        // Y axis title (rotated)
        if (marginLeft >= this.MARGIN_LEFT - 6) {
            ctx.save();
            ctx.translate(fontPx + 1, marginTop + plotH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('Trange (°C)', 0, 0);
            ctx.restore();
        }
    }

    _attachTooltip(canvas, agg) {
        if (this._tooltipEl) {
            this._tooltipEl.remove();
            this._tooltipEl = null;
        }
        const tooltipEl = document.createElement('div');
        tooltipEl.style.cssText = 'position:fixed;background:rgba(30,30,30,0.88);color:#fff;padding:6px 10px;border-radius:4px;font-size:12px;line-height:1.6;pointer-events:none;display:none;z-index:9999;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4);';
        document.body.appendChild(tooltipEl);
        this._tooltipEl = tooltipEl;

        const { density, consensus, totalTaxa, sitesWithData } = agg;

        canvas.addEventListener('mousemove', (e) => {
            // Read current dims — stays correct after a responsive redraw
            if (!this._dims) { tooltipEl.style.display = 'none'; return; }
            const { boxW, boxH, marginLeft, marginTop, cellW, cellH } = this._dims;
            const rect = canvas.getBoundingClientRect();
            // Map client coords into the canvas' CSS box (rect ≈ boxW/boxH; margins/cells are in CSS px)
            const x = (e.clientX - rect.left) * (boxW / rect.width);
            const y = (e.clientY - rect.top)  * (boxH / rect.height);
            const displayCol = Math.floor((x - marginLeft) / cellW);
            const displayRow = Math.floor((y - marginTop)  / cellH);

            if (displayCol < 0 || displayCol >= this.COLS || displayRow < 0 || displayRow >= this.ROWS) {
                tooltipEl.style.display = 'none';
                return;
            }

            const col = (this.COLS - 1) - displayCol;
            const row = (this.ROWS - 1) - displayRow;
            const tmax   = col - 10;
            const trange = row;
            const count  = density[row][col];
            const pct    = totalTaxa > 0 ? (Math.floor((count / totalTaxa) * 1000) / 10).toFixed(1) : "0.0";
            const inConsensus = consensus[row][col] === 1;

            let html =
                `<strong>Tmax</strong> (warmest month): ${tmax} °C<br>` +
                `<strong>Trange</strong> (warmest − coldest): ${trange} °C<br>`;

            if (count === 0) {
                html += `<span style="color:#9ca3af">&#9675; No taxa tolerate this cell across selected sites</span>`;
            } else if (inConsensus) {
                html += `<span style="color:#7dd3fc">&#9679; All taxa across all ${sitesWithData} sites tolerate this cell (full consensus, shown in black)</span>`;
            } else {
                html += `<span style="color:#93c5fd">&#9681; ${count} of ${totalTaxa} taxa tolerate this cell (${pct}%)</span>`;
            }

            tooltipEl.innerHTML = html;
            tooltipEl.style.display = 'block';
            const tipW = tooltipEl.offsetWidth;
            const left = (e.clientX + 16 + tipW > window.innerWidth) ? e.clientX - tipW - 8 : e.clientX + 16;
            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top  = (e.clientY - 10) + 'px';
        });

        canvas.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
    }

    async render(renderIntoNode = null) {
        super.render();
        this.renderComplete = false;
        if (renderIntoNode) this.renderIntoNode = renderIntoNode;
        if (!this.renderIntoNode) {
            console.warn("MosaicMutualClimaticRangeModule: no renderIntoNode");
            return false;
        }

        this.active = true;
        const currentRequestId = ++this.requestId;

        $(this.renderIntoNode).empty();
        this.showLoadingIndicator(true);

        let siteResponse;
        try {
            siteResponse = await this.fetchData();
        } catch(e) {
            console.error("MosaicMutualClimaticRangeModule fetch error:", e);
            this.sqs.setErrorIndicator(this.renderIntoNode, "Could not fetch MCR data");
            return false;
        }

        if (!this.active || currentRequestId !== this.requestId) return false;
        this.showLoadingIndicator(false);

        if (!siteResponse || !siteResponse.density_matrix || !siteResponse.taxa_count) {
            this.renderNoData();
            this.renderComplete = true;
            return true;
        }

        const agg = this._aggregate([siteResponse]);

        if (!agg) {
            $(this.renderIntoNode).html('<div style="padding:1em;color:#888;">No MCR-registered taxa found in the selected sites.</div>');
            this.renderComplete = true;
            return true;
        }

        const varId       = nanoid();
        const canvasId    = nanoid();
        const coverageId  = nanoid();
        $(this.renderIntoNode).html(
            `<div class="mosaic-tile-content mcr-tile-content" id="${varId}">
                <div class="mcr-chart-wrapper">
                    <canvas id="${canvasId}"></canvas>
                </div>
                <div id="coverage-${coverageId}" class="tile-coverage-container"></div>
            </div>`
        );

        this._canvas = document.getElementById(canvasId);
        this._agg    = agg;
        this._drawChart(this._canvas, agg);
        this._attachTooltip(this._canvas, agg);

        // Coverage mini-chart: sites with MCR data vs total sites in mosaic
        const resultMosaic    = this.sqs.resultManager.getModule("mosaic");
        const totalSites      = resultMosaic.sites.length;
        const coverageContainer = document.getElementById(`coverage-${coverageId}`);
        this.renderCoverageMiniChart(coverageContainer, agg.sitesWithData, totalSites);

        // Redraw fluidly whenever the chart wrapper changes size — observing the wrapper
        // (which flexes between the header and the coverage bar) means the canvas always
        // tracks its true available area, on the fly, without re-fetching or re-aggregating.
        if (this._resizeObserver) this._resizeObserver.disconnect();
        this._resizeObserver = new ResizeObserver(() => {
            if (this._canvas && this._agg) this._drawChart(this._canvas, this._agg);
        });
        const observeTarget = this._canvas.parentElement; // .mcr-chart-wrapper
        this._resizeObserver.observe(observeTarget);

        this.renderComplete = true;
        return true;
    }

    async update() {
        this.renderComplete = false;
        await this.render(this.renderIntoNode);
        this.renderComplete = true;
    }

    async unrender() {
        // Clean up canvas tooltip
        if (this._tooltipEl) {
            this._tooltipEl.remove();
            this._tooltipEl = null;
        }
        // Disconnect resize observer
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        this._canvas = null;
        this._agg    = null;
        this._dims   = null;
        // Clean up coverage mini-chart resize listener
        if (this.coverageCharts.size > 0) {
            window.removeEventListener('resize', this.resizeHandler);
            this.coverageCharts.clear();
        }
        return super.unrender();
    }

    destroy() {
        this.active = false;
        this.unrender();
    }
}

export default MosaicMutualClimaticRangeModule;
