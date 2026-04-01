import MosaicTileModule from "./MosaicTileModule.class";
import { nanoid } from "nanoid";

/**
 * MosaicMutualClimaticRangeModule
 *
 * Fetches MCR reconstructions for all currently selected sites via
 * POST /mcr/sites, then renders an aggregate density heatmap.
 *
 * Each cell in the aggregate density_matrix is the sum of taxon counts
 * across all sites. The binary consensus (matrix='1') from an AND of all
 * per-site matrices is shown as an orange bounding box.
 */
class MosaicMutualClimaticRangeModule extends MosaicTileModule {
    constructor(sqs) {
        super(sqs);
        this.sqs = sqs;
        this.title = "Mutual climatic range";
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

    // Derive cell size and canvas dimensions from the available container area.
    _computeDimensions(availableWidth, availableHeight) {
        const cellW = Math.max(4, Math.floor((availableWidth  - this.MARGIN_LEFT - this.MARGIN_RIGHT)  / this.COLS));
        const cellH = Math.max(4, Math.floor((availableHeight - this.MARGIN_TOP  - this.MARGIN_BOTTOM) / this.ROWS));
        return {
            cellW,
            cellH,
            canvasW: this.MARGIN_LEFT + this.COLS * cellW + this.MARGIN_RIGHT,
            canvasH: this.MARGIN_TOP  + this.ROWS * cellH + this.MARGIN_BOTTOM,
        };
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

    _drawChart(canvas, agg) {
        const container = canvas.closest('.result-mosaic-graph-container') ?? canvas.parentElement;
        const availableWidth    = (container ? container.clientWidth  : 0) || 500;
        const containerHeight   = (container ? container.clientHeight : 0) || 400;
        // Subtract the rendered height of sibling elements (title, subtitle) so the canvas fills the remainder
        const wrapper = canvas.parentElement;
        const siblingHeight = wrapper
            ? Array.from(wrapper.children).filter(el => el !== canvas).reduce((sum, el) => sum + el.offsetHeight, 0)
            : 0;
        const availableHeight = Math.max(50, containerHeight - siblingHeight);
        this._dims = this._computeDimensions(availableWidth, availableHeight);
        const { cellW, cellH, canvasW, canvasH } = this._dims;

        canvas.width  = canvasW;
        canvas.height = canvasH;

        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvasW, canvasH);

        const { density, consensus, maxDensity, consensusBbox } = agg;

        // Cells
        for (let row = 0; row < this.ROWS; row++) {
            for (let col = 0; col < this.COLS; col++) {
                ctx.fillStyle = this._densityColor(density[row][col], maxDensity);
                ctx.fillRect(this.MARGIN_LEFT + col * cellW, this.MARGIN_TOP + row * cellH, cellW - 1, cellH - 1);
            }
        }

        // Consensus bounding box
        if (consensusBbox) {
            const [cMin, cMax, rMin, rMax] = consensusBbox;
            ctx.strokeStyle = '#e05c00';
            ctx.lineWidth = 2;
            ctx.strokeRect(
                this.MARGIN_LEFT + cMin * cellW,
                this.MARGIN_TOP  + rMin * cellH,
                (cMax - cMin + 1) * cellW,
                (rMax - rMin + 1) * cellH
            );
        }

        // X axis labels
        ctx.fillStyle = '#555';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let c = 0; c <= this.COLS; c += 10) {
            ctx.fillText((c - 10) + '°', this.MARGIN_LEFT + c * cellW, this.MARGIN_TOP + this.ROWS * cellH + 4);
        }
        ctx.textBaseline = 'bottom';
        ctx.fillText('Tmax (°C)', this.MARGIN_LEFT + (this.COLS * cellW) / 2, canvasH);

        // Y axis labels
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let r = 0; r < this.ROWS; r += 5) {
            ctx.fillText(r + '°', this.MARGIN_LEFT - 4, this.MARGIN_TOP + r * cellH + cellH / 2);
        }

        // Y axis title (rotated)
        ctx.save();
        ctx.translate(10, this.MARGIN_TOP + (this.ROWS * cellH) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('Trange (°C)', 0, 0);
        ctx.restore();
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

        const { density, consensus, totalTaxa, sitesWithData, consensusBbox } = agg;

        canvas.addEventListener('mousemove', (e) => {
            // Read current dims — stays correct after a responsive redraw
            if (!this._dims) { tooltipEl.style.display = 'none'; return; }
            const { cellW, cellH, canvasW, canvasH } = this._dims;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvasW / rect.width;
            const scaleY = canvasH / rect.height;
            const col = Math.floor(((e.clientX - rect.left) * scaleX - this.MARGIN_LEFT) / cellW);
            const row = Math.floor(((e.clientY - rect.top)  * scaleY - this.MARGIN_TOP)  / cellH);

            if (col < 0 || col >= this.COLS || row < 0 || row >= this.ROWS) {
                tooltipEl.style.display = 'none';
                return;
            }

            const tmax   = col - 10;
            const trange = row;
            const count  = density[row][col];
            const pct    = totalTaxa > 0 ? (Math.floor((count / totalTaxa) * 1000) / 10).toFixed(1) : "0.0";
            const inConsensus = consensus[row][col] === 1;
            const inBbox = consensusBbox &&
                col >= consensusBbox[0] && col <= consensusBbox[1] &&
                row >= consensusBbox[2] && row <= consensusBbox[3];

            let html =
                `<strong>Tmax</strong> (warmest month): ${tmax} °C<br>` +
                `<strong>Trange</strong> (warmest − coldest): ${trange} °C<br>`;

            if (count === 0) {
                html += `<span style="color:#9ca3af">&#9675; No taxa tolerate this cell across selected sites</span>`;
            } else if (inConsensus) {
                html += `<span style="color:#7dd3fc">&#9679; All taxa across all ${sitesWithData} sites tolerate this cell (full consensus)</span>`;
            } else {
                html += `<span style="color:#93c5fd">&#9681; ${count} of ${totalTaxa} taxa tolerate this cell (${pct}%)</span>`;
            }

            if (inBbox) {
                html += `<br><span style="color:#fb923c">&#9642; Within cross-site consensus envelope</span>`;
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
            `<div class="mosaic-tile-content" id="${varId}">
                <div class="mosaic-tile-header">
                    <h3 class="mosaic-tile-title">${this.title}</h3>
                </div>
                <canvas id="${canvasId}" style="display:block;max-width:100%;"></canvas>
                <div id="coverage-${coverageId}" class="tile-coverage-container"></div>
            </div>`
        );
        this.sqs.tooltipManager.registerTooltip(`#${varId} .mosaic-tile-title`, "Mutual Climatic Range (MCR) reconstruction based on fossil beetle (Coleoptera) taxa found at the selected sites. The chart shows the climate envelope — compatible Tmax (mean temperature of the warmest month) vs Trange (difference between warmest and coldest month) — derived from the overlap of all MCR-registered species present. The orange bounding box marks the reconstructed climate envelope where all taxa agree.", { drawSymbol: true, anchorPoint: 'symbol' });

        this._canvas = document.getElementById(canvasId);
        this._agg    = agg;
        this._drawChart(this._canvas, agg);
        this._attachTooltip(this._canvas, agg);

        // Coverage mini-chart: sites with MCR data vs total sites in mosaic
        const resultMosaic    = this.sqs.resultManager.getModule("mosaic");
        const totalSites      = resultMosaic.sites.length;
        const coverageContainer = document.getElementById(`coverage-${coverageId}`);
        this.renderCoverageMiniChart(coverageContainer, agg.sitesWithData, totalSites);

        // Redraw whenever the tile is resized
        if (this._resizeObserver) this._resizeObserver.disconnect();
        this._resizeObserver = new ResizeObserver(() => {
            if (this._canvas && this._agg) this._drawChart(this._canvas, this._agg);
        });
        const observeTarget = this._canvas.closest('.result-mosaic-graph-container') ?? this._canvas.parentElement;
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