import { Image as ImageLayer } from 'ol/layer';
import ImageCanvasSource from 'ol/source/ImageCanvas';
import { fromLonLat } from 'ol/proj.js';
import Config from '../../../config/config.json';

/*
* Class: EcoCodeSurface
*
* The result map's Bugs ecocode layers - one per ecocode, all drawn from the same data. Each layer is a smoothed prevalence surface:
* the colour is the kernel weighted average of the sites' share of the ecocode, and the opacity is how much data lies under the kernel,
* so dense and sparse regions are compared on the same footing while the sparse ones fade out.
*
*   share(x)    = Σ K(x,xᵢ)·wᵢ·pᵢ / Σ K(x,xᵢ)·wᵢ
*   evidence(x) = Σ K(x,xᵢ)·wᵢ
*
* where pᵢ is the site's abundance weighted share of the ecocode (% of sumrep, as in the ecocode charts), K a gaussian with the
* smoothing radius as its standard deviation, and wᵢ = Nᵢ / (Nᵢ + c) a reliability weight from the site's number of individuals,
* so that a handful of beetles counts for little and a very large site does not count for more than a well sampled one.
*/
class EcoCodeSurface {
	constructor(resultMap) {
		this.resultMap = resultMap;
		this.sqs = resultMap.sqs;
		this.layers = [];

		this.data = null; //The /ecocodes/map/sites response
		this.dataKey = null;
		this.pendingKey = null;
		this.pendingFetch = null;
		this.sitePoints = null;
		this.sitePointsKey = null;
		this.lastGrid = null; //The grid behind the last drawn canvas, for the hover readout
		this.tooltip = null;

		this.settings = {
			smoothingKm: 50,
			mode: "share" //"share" or "relative" (to the average of the sites shown)
		};
		this.smoothingKmMin = 10;
		this.smoothingKmMax = 300;

		this.reliabilityHalfCount = 30; //c in wᵢ = Nᵢ / (Nᵢ + c) - a site with this many individuals counts for half
		this.evidenceScale = 1.5; //opacity = 1 - exp(-evidence / evidenceScale)
		this.minEvidence = 0.15; //Below this nothing is drawn, so one small site does not paint a region
		this.maxOpacity = 0.85;
		this.minCellPx = 4; //The grid is computed at no finer than this, and scaled up smoothly
		this.maxKernelCells = 12; //The kernel's standard deviation in grid cells, at most
		this.relativeRangeLog2 = 2; //The relative mode's colour scale runs from ¼ to 4 times the average

		//Sequential - one hue light to dark - for the share, and diverging orange - gray - purple for relative to the average. Purple and
		//orange, since blue disappears into the sea and green into the land of the base maps.
		this.shareRamp = this.makeRamp(["#f3d9ee", "#e3a6d6", "#cf72bd", "#b244a0", "#8e2a83", "#661c63", "#431343"]);
		this.relativeRamp = this.makeRamp(["#733109", "#d0702f", "#f2b98a", "#f0efec", "#dcaed3", "#b244a0", "#661c63"]);
	}

	/*
	* Function: createLayers
	* One data layer per Bugs ecocode, in the order of their abbreviations (BEco01, BEco01a, ...).
	*/
	createLayers(ecocodeDefinitions) {
		let definitions = [...ecocodeDefinitions].sort((a, b) => {
			return String(a.abbreviation).localeCompare(String(b.abbreviation), undefined, { numeric: true });
		});

		this.layers = definitions.map(ecocode => this.createLayer(ecocode));
		return this.layers;
	}

	createLayer(ecocode) {
		const ecocodeId = ecocode.ecocode_definition_id;
		const layer = new ImageLayer({
			zIndex: 200,
			visible: false
		});

		layer.setSource(new ImageCanvasSource({
			ratio: 1,
			canvasFunction: (extent, resolution, pixelRatio, size) => {
				return this.renderCanvas(ecocodeId, extent, resolution, pixelRatio, size);
			}
		}));

		layer.setProperties({
			layerId: "ecocode-"+ecocodeId,
			title: ecocode.name,
			type: "dataLayer",
			menuGroup: "Bugs eco codes",
			ecocode: ecocode,
			legendExpanded: true,
			renderLegendContent: (contentNode) => this.renderLegendContent(layer, contentNode),
			renderCallback: () => this.render(layer)
		});

		return layer;
	}

	getVisibleLayer() {
		return this.layers.find(layer => layer.getVisible());
	}

	/*
	* Function: render
	* Brings the data up to date with the result and the time filter, then redraws the layer.
	*/
	async render(layer) {
		const siteIds = this.resultMap.data.map(site => Number(site.id)).filter(siteId => Number.isInteger(siteId) && siteId > 0);
		const timeWindow = this.getTimeWindow();

		try {
			await this.fetchData(siteIds, timeWindow);
		}
		catch(error) {
			console.error("Failed to fetch ecocode map data:", error);
			this.sqs.notificationManager.notify("Failed to load the eco code data for the map.", "error", 5000);
			return;
		}

		this.hideTooltip();
		layer.getSource().changed();
		this.updateLegendContent(layer);
	}

	hideTooltip() {
		if(this.tooltip) {
			this.tooltip.hide();
		}
	}

	/*
	* Function: getTimeWindow
	* The time filter's selection as [younger, older] in years BP, or null when there is none.
	*/
	getTimeWindow() {
		const facet = this.sqs.facetManager.facets.find(facet => facet.name == "analysis_entity_ages");
		if(!facet || !facet.hasSelection()) {
			return null;
		}
		const selections = facet.getSelections().map(value => Number(value));
		if(selections.length != 2 || selections.some(value => !Number.isFinite(value))) {
			return null;
		}
		return [Math.min(selections[0], selections[1]), Math.max(selections[0], selections[1])];
	}

	async fetchData(siteIds, timeWindow) {
		const key = JSON.stringify([[...siteIds].sort((a, b) => a - b), timeWindow]);
		if(key == this.dataKey) {
			return this.data;
		}
		if(key == this.pendingKey) {
			return this.pendingFetch;
		}

		this.pendingKey = key;
		this.resultMap.resultManager.showLoadingIndicator(true);
		this.pendingFetch = fetch(Config.dataServerAddress+"/ecocodes/map/sites", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				site_ids: siteIds,
				time_window: timeWindow
			})
		}).then(response => {
			if(!response.ok) {
				throw new Error("HTTP "+response.status);
			}
			return response.json();
		}).then(data => {
			//A newer request may have been made while this one was underway
			if(this.pendingKey == key) {
				this.data = data;
				this.dataKey = key;
			}
			return data;
		}).finally(() => {
			if(this.pendingKey == key) {
				this.pendingKey = null;
				this.pendingFetch = null;
			}
			this.resultMap.resultManager.showLoadingIndicator(false);
		});

		return this.pendingFetch;
	}

	/*
	* Function: getSitePoints
	* The sites in the data that have a position on the map and any ecocoded individuals, with their position in map units and weight.
	*/
	getSitePoints() {
		if(!this.data) {
			return [];
		}
		const key = this.dataKey+"/"+this.resultMap.dataRevision;
		if(this.sitePointsKey == key) {
			return this.sitePoints;
		}

		const sitesById = new globalThis.Map();
		this.resultMap.data.forEach(site => sitesById.set(Number(site.id), site));

		const points = [];
		this.data.sites.forEach(siteData => {
			const site = sitesById.get(siteData.site_id);
			if(!site) {
				return;
			}
			const lng = Number(site.lng);
			const lat = Number(site.lat);
			if(!Number.isFinite(lng) || !Number.isFinite(lat) || lng === 0 || lat === 0) {
				return;
			}
			const sumrep = Object.values(siteData.ecocodes).reduce((sum, value) => sum + value, 0);
			if(sumrep <= 0) {
				return;
			}

			const coordinate = fromLonLat([lng, lat]);
			points.push({
				siteId: siteData.site_id,
				x: coordinate[0],
				y: coordinate[1],
				//A distance on the ground is 1/cos(latitude) longer in web mercator
				mercatorScale: 1 / Math.max(Math.cos(lat * Math.PI / 180), 0.05),
				weight: siteData.individuals / (siteData.individuals + this.reliabilityHalfCount),
				ecocodes: siteData.ecocodes,
				sumrep: sumrep
			});
		});

		this.sitePoints = points;
		this.sitePointsKey = key;
		return points;
	}

	getShare(point, ecocodeId) {
		return (point.ecocodes[ecocodeId] || 0) / point.sumrep;
	}

	/*
	* Function: getAverageShare
	* The weighted average share of the ecocode across the sites shown - the baseline of the relative mode.
	*/
	getAverageShare(points, ecocodeId) {
		let weightSum = 0;
		let shareSum = 0;
		points.forEach(point => {
			weightSum += point.weight;
			shareSum += point.weight * this.getShare(point, ecocodeId);
		});
		return weightSum > 0 ? shareSum / weightSum : 0;
	}

	/*
	* Function: getShareScaleMax
	* The share at which the colour scale tops out: the 95th percentile of the ecocode across all sites of all ages, so a colour means the
	* same whatever is filtered.
	*/
	getShareScaleMax(ecocodeId) {
		const reference = this.data && this.data.reference ? this.data.reference.ecocodes[ecocodeId] : null;
		if(reference && reference.p95 > 0) {
			return reference.p95;
		}
		return 1;
	}

	/*
	* Function: renderCanvas
	* The canvasFunction of the layers' sources. The two kernel sums are added up on a grid somewhat coarser than the screen, which is then
	* scaled up smoothly onto the canvas.
	*/
	renderCanvas(ecocodeId, extent, resolution, pixelRatio, size) {
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(size[0]);
		canvas.height = Math.round(size[1]);

		const points = this.getSitePoints();
		if(points.length == 0) {
			this.lastGrid = null;
			return canvas;
		}

		const unitsPerPx = resolution / pixelRatio;
		const smoothingUnits = this.settings.smoothingKm * 1000;

		//A grid cell is made large enough that the kernel spans no more than maxKernelCells of them at the centre of the view
		const centerLat = this.getLatitudeOfMercatorY((extent[1] + extent[3]) / 2);
		const sigmaPxAtCenter = smoothingUnits / Math.max(Math.cos(centerLat * Math.PI / 180), 0.05) / unitsPerPx;
		const cellPx = Math.max(this.minCellPx * pixelRatio, Math.ceil(sigmaPxAtCenter / this.maxKernelCells));
		const cellUnits = unitsPerPx * cellPx;
		const cols = Math.ceil(canvas.width / cellPx) + 1;
		const rows = Math.ceil(canvas.height / cellPx) + 1;

		const weightSums = new Float32Array(cols * rows);
		const valueSums = new Float32Array(cols * rows);

		points.forEach(point => {
			//Below about half a cell the kernel would fall between the cells, so it is not made narrower than that
			const sigmaCells = Math.max(smoothingUnits * point.mercatorScale / cellUnits, 0.6);
			const radiusCells = sigmaCells * 3;
			const cx = (point.x - extent[0]) / cellUnits;
			const cy = (extent[3] - point.y) / cellUnits;
			if(cx + radiusCells < 0 || cx - radiusCells > cols || cy + radiusCells < 0 || cy - radiusCells > rows) {
				return;
			}

			const share = this.getShare(point, ecocodeId);
			const twoSigmaSq = 2 * sigmaCells * sigmaCells;
			const radiusSq = radiusCells * radiusCells;
			const colStart = Math.max(0, Math.floor(cx - radiusCells));
			const colEnd = Math.min(cols - 1, Math.ceil(cx + radiusCells));
			const rowStart = Math.max(0, Math.floor(cy - radiusCells));
			const rowEnd = Math.min(rows - 1, Math.ceil(cy + radiusCells));

			for(let row = rowStart; row <= rowEnd; row++) {
				const dy = row - cy;
				const rowOffset = row * cols;
				for(let col = colStart; col <= colEnd; col++) {
					const dx = col - cx;
					const distanceSq = dx * dx + dy * dy;
					if(distanceSq > radiusSq) {
						continue;
					}
					const kernelWeight = Math.exp(-distanceSq / twoSigmaSq) * point.weight;
					weightSums[rowOffset + col] += kernelWeight;
					valueSums[rowOffset + col] += kernelWeight * share;
				}
			}
		});

		const averageShare = this.getAverageShare(points, ecocodeId);
		const shareScaleMax = this.getShareScaleMax(ecocodeId);

		//Grid cell (col, row) is centred on the grid image's pixel (col, row), so it is drawn offset by half a cell
		const gridCanvas = document.createElement("canvas");
		gridCanvas.width = cols;
		gridCanvas.height = rows;
		const gridContext = gridCanvas.getContext("2d");
		const imageData = gridContext.createImageData(cols, rows);
		const pixels = imageData.data;

		for(let i = 0; i < weightSums.length; i++) {
			const evidence = weightSums[i];
			if(evidence < this.minEvidence) {
				continue;
			}
			const share = valueSums[i] / evidence;
			const color = this.getColor(share, averageShare, shareScaleMax);
			if(!color) {
				continue;
			}
			const offset = i * 4;
			pixels[offset] = color[0];
			pixels[offset + 1] = color[1];
			pixels[offset + 2] = color[2];
			pixels[offset + 3] = Math.round(255 * this.getOpacity(evidence));
		}
		gridContext.putImageData(imageData, 0, 0);

		const context = canvas.getContext("2d");
		context.imageSmoothingEnabled = true;
		context.drawImage(gridCanvas, -cellPx / 2, -cellPx / 2, cols * cellPx, rows * cellPx);

		this.drawSiteMarkers(context, points, extent, unitsPerPx, pixelRatio);

		this.lastGrid = {
			ecocodeId: ecocodeId,
			extent: extent,
			cellUnits: cellUnits,
			cols: cols,
			rows: rows,
			weightSums: weightSums,
			valueSums: valueSums,
			averageShare: averageShare
		};

		return canvas;
	}

	/*
	* Function: drawSiteMarkers
	* Small dots where the data comes from, larger for the better sampled sites.
	*/
	drawSiteMarkers(context, points, extent, unitsPerPx, pixelRatio) {
		context.fillStyle = "rgba(30, 30, 30, 0.55)";
		context.strokeStyle = "rgba(255, 255, 255, 0.8)";
		context.lineWidth = 1 * pixelRatio;
		points.forEach(point => {
			const x = (point.x - extent[0]) / unitsPerPx;
			const y = (extent[3] - point.y) / unitsPerPx;
			if(x < -10 || y < -10 || x > context.canvas.width + 10 || y > context.canvas.height + 10) {
				return;
			}
			const radius = (1.5 + 2 * point.weight) * pixelRatio;
			context.beginPath();
			context.arc(x, y, radius, 0, 2 * Math.PI);
			context.fill();
			context.stroke();
		});
	}

	getOpacity(evidence) {
		return this.maxOpacity * (1 - Math.exp(-evidence / this.evidenceScale));
	}

	getColor(share, averageShare, shareScaleMax) {
		if(this.settings.mode == "relative") {
			if(averageShare <= 0) {
				return null;
			}
			const range = this.relativeRangeLog2;
			const log2Ratio = share > 0 ? Math.log2(share / averageShare) : -range;
			const t = (Math.max(-range, Math.min(range, log2Ratio)) + range) / (2 * range);
			return this.relativeRamp[Math.round(t * 255)];
		}
		const t = Math.max(0, Math.min(1, share / shareScaleMax));
		return this.shareRamp[Math.round(t * 255)];
	}

	/*
	* Function: makeRamp
	* 256 rgb steps evenly interpolated between the given colours.
	*/
	makeRamp(hexColors) {
		const stops = hexColors.map(hex => [
			parseInt(hex.slice(1, 3), 16),
			parseInt(hex.slice(3, 5), 16),
			parseInt(hex.slice(5, 7), 16)
		]);
		const ramp = [];
		for(let i = 0; i < 256; i++) {
			const position = i / 255 * (stops.length - 1);
			const index = Math.min(Math.floor(position), stops.length - 2);
			const fraction = position - index;
			ramp.push([0, 1, 2].map(channel => Math.round(stops[index][channel] + (stops[index + 1][channel] - stops[index][channel]) * fraction)));
		}
		return ramp;
	}

	getRampGradient(ramp) {
		const steps = [0, 0.25, 0.5, 0.75, 1].map(t => {
			const color = ramp[Math.round(t * 255)];
			return `rgb(${color[0]}, ${color[1]}, ${color[2]}) ${t * 100}%`;
		});
		return `linear-gradient(to right, ${steps.join(", ")})`;
	}

	getLatitudeOfMercatorY(y) {
		return (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI;
	}

	/*
	* Function: getValueAtCoordinate
	* What the last drawn surface says at a map coordinate, for the hover readout.
	*/
	getValueAtCoordinate(coordinate) {
		const grid = this.lastGrid;
		if(!grid) {
			return null;
		}
		const col = Math.round((coordinate[0] - grid.extent[0]) / grid.cellUnits);
		const row = Math.round((grid.extent[3] - coordinate[1]) / grid.cellUnits);
		if(col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) {
			return null;
		}
		const evidence = grid.weightSums[row * grid.cols + col];
		if(evidence < this.minEvidence) {
			return null;
		}
		const share = grid.valueSums[row * grid.cols + col] / evidence;
		return {
			share: share,
			evidence: evidence,
			relative: grid.averageShare > 0 ? share / grid.averageShare : null
		};
	}

	formatPercent(share) {
		const percent = share * 100;
		return (percent < 10 ? percent.toFixed(1) : Math.round(percent))+"%";
	}

	formatRatio(ratio) {
		if(ratio >= 1) {
			return ratio.toFixed(1)+"× the average";
		}
		return ratio.toFixed(2)+"× the average";
	}

	formatYearsBP(value) {
		return Math.round(value).toLocaleString("en-US")+" BP";
	}

	/*
	* Function: renderLegendContent
	* The layer's legend: the colour scale, what the fading means, the mode toggle and the smoothing slider, and what data is shown.
	*/
	renderLegendContent(layer, contentNode) {
		const ecocode = layer.getProperties().ecocode;
		const isRelative = this.settings.mode == "relative";
		const ramp = isRelative ? this.relativeRamp : this.shareRamp;
		//The fading is shown in a colour of the share scale, since the middle of the relative scale is a neutral gray
		const evidenceColor = this.shareRamp[192];

		let scaleLabels = "";
		if(isRelative) {
			scaleLabels = `<span>¼×</span><span>average</span><span>4×</span>`;
		}
		else {
			scaleLabels = `<span>0%</span><span>${this.formatPercent(this.getShareScaleMax(ecocode.ecocode_definition_id))} or more</span>`;
		}

		const scaleDescription = isRelative
			? "Share of the eco code compared to its average across the sites shown."
			: "Share of the eco code in the insect assemblages (abundance weighted, % of sumrep).";

		contentNode.html(`
			<div class="legend-content-loaded ecocode-surface-legend">
				<div class="ecocode-surface-mode" role="group" aria-label="Colour scale">
					<button type="button" class="ecocode-surface-mode-btn ${isRelative ? "" : "active"}" data-mode="share" aria-pressed="${!isRelative}">Share</button>
					<button type="button" class="ecocode-surface-mode-btn ${isRelative ? "active" : ""}" data-mode="relative" aria-pressed="${isRelative}">vs. average</button>
				</div>
				<div class="ecocode-surface-scale-description">${scaleDescription}</div>
				<div class="ecocode-surface-ramp" style="background: ${this.getRampGradient(ramp)};"></div>
				<div class="ecocode-surface-ramp-labels">${scaleLabels}</div>
				<div class="ecocode-surface-ramp ecocode-surface-evidence-ramp" style="background: linear-gradient(to right, rgba(${evidenceColor.join(",")}, 0.1), rgba(${evidenceColor.join(",")}, ${this.maxOpacity}));"></div>
				<div class="ecocode-surface-ramp-labels"><span>little data</span><span>much data</span></div>
				<label class="ecocode-surface-smoothing">
					<span>Smoothing radius</span>
					<span class="ecocode-surface-smoothing-value">${this.settings.smoothingKm} km</span>
				</label>
				<input type="range" class="ecocode-surface-smoothing-slider" min="${this.smoothingKmMin}" max="${this.smoothingKmMax}" step="5" value="${this.settings.smoothingKm}" aria-label="Smoothing radius in km">
				<div class="ecocode-surface-stats">${this.getStatsText()}</div>
			</div>
		`);

		$(".ecocode-surface-mode-btn", contentNode).on("click", (evt) => {
			evt.stopPropagation();
			const mode = $(evt.currentTarget).attr("data-mode");
			if(mode == this.settings.mode) {
				return;
			}
			this.settings.mode = mode;
			this.redraw();
		});

		$(".ecocode-surface-smoothing-slider", contentNode).on("input", (evt) => {
			this.settings.smoothingKm = Number($(evt.currentTarget).val());
			$(".ecocode-surface-smoothing-value", contentNode).text(this.settings.smoothingKm+" km");
			this.scheduleRedraw(false);
		});

		//The legend can be dragged by its header only, but keep the slider from starting a sort of the legend items
		$(".ecocode-surface-smoothing-slider", contentNode).on("mousedown touchstart", (evt) => {
			evt.stopPropagation();
		});
	}

	getStatsText() {
		if(!this.data) {
			return "Loading eco code data...";
		}
		const siteCount = this.getSitePoints().length;
		const sampleCounts = this.data.sample_counts;
		let text = `${siteCount.toLocaleString("en-US")} sites with eco coded insects, ${sampleCounts.included.toLocaleString("en-US")} samples.`;
		if(this.data.time_window) {
			text += ` Only samples dated to ${this.formatYearsBP(this.data.time_window[1])} – ${this.formatYearsBP(this.data.time_window[0])}`;
			text += ` (${sampleCounts.undated.toLocaleString("en-US")} undated samples left out).`;
		}
		else {
			text += " All ages are combined - use the time filter to look at one period.";
		}
		return text;
	}

	updateLegendContent(layer) {
		const contentNode = $(`.result-map-legend-item[data-layer-id='${layer.getProperties().layerId}'] .result-map-legend-item-content`, this.resultMap.renderIntoNode);
		if(contentNode.length > 0 && contentNode.find(".ecocode-surface-legend").length > 0) {
			this.renderLegendContent(layer, contentNode);
		}
	}

	/*
	* Function: redraw
	* Redraws the visible ecocode layer with the current settings, and its legend if the scale changed.
	*/
	redraw(updateLegend = true) {
		const layer = this.getVisibleLayer();
		if(!layer) {
			return;
		}
		this.hideTooltip();
		layer.getSource().changed();
		if(updateLegend) {
			this.updateLegendContent(layer);
		}
	}

	scheduleRedraw(updateLegend = true) {
		if(this.redrawFrame) {
			return;
		}
		this.redrawFrame = requestAnimationFrame(() => {
			this.redrawFrame = null;
			this.redraw(updateLegend);
		});
	}

	/*
	* Function: bindHoverReadout
	* Shows what the surface says under the pointer.
	*/
	bindHoverReadout(olMap) {
		//In the map's viewport, which the pointer positions are relative to
		const tooltip = $("<div class='ecocode-surface-tooltip'></div>").hide();
		$(olMap.getViewport()).append(tooltip);
		this.tooltip = tooltip;

		//What it says goes stale when the view or the surface changes
		olMap.on("movestart", () => tooltip.hide());

		olMap.on("pointermove", (evt) => {
			const layer = this.getVisibleLayer();
			if(!layer || evt.dragging) {
				tooltip.hide();
				return;
			}
			const value = this.getValueAtCoordinate(evt.coordinate);
			if(!value) {
				tooltip.hide();
				return;
			}

			const ecocode = layer.getProperties().ecocode;
			let html = `<div class="ecocode-surface-tooltip-title">${ecocode.name}</div>`;
			html += `<div><strong>${this.formatPercent(value.share)}</strong> of the assemblage</div>`;
			if(value.relative !== null) {
				html += `<div>${this.formatRatio(value.relative)} of the sites shown</div>`;
			}
			html += `<div class="ecocode-surface-tooltip-evidence">Data support: ${this.describeEvidence(value.evidence)}</div>`;
			tooltip.html(html).css({
				left: (evt.pixel[0] + 14)+"px",
				top: (evt.pixel[1] + 14)+"px"
			}).show();
		});

		$(olMap.getViewport()).on("mouseleave", () => tooltip.hide());
	}

	describeEvidence(evidence) {
		if(evidence < 0.5) {
			return "very little";
		}
		if(evidence < 1.5) {
			return "little";
		}
		if(evidence < 4) {
			return "moderate";
		}
		return "good";
	}

	exportSettings() {
		return {
			smoothingKm: this.settings.smoothingKm,
			mode: this.settings.mode
		};
	}

	importSettings(settings) {
		if(!settings) {
			return;
		}
		const smoothingKm = Number(settings.smoothingKm);
		if(Number.isFinite(smoothingKm)) {
			this.settings.smoothingKm = Math.max(this.smoothingKmMin, Math.min(this.smoothingKmMax, smoothingKm));
		}
		if(settings.mode == "share" || settings.mode == "relative") {
			this.settings.mode = settings.mode;
		}
	}
}

export { EcoCodeSurface as default }
