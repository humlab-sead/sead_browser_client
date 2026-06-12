//import Config from '../../../config/config.js'
import ResultModule from '../ResultModule.class.js'
import MosaicGridLayout from './MosaicGridLayout.class.js'
//import ResultMap from "../ResultMap/ResultMap.class";

import MosaicMapModule from "./MosaicTileModules/MosaicMapModule.class";
import MosaicSampleMethodsModule from "./MosaicTileModules/MosaicSampleMethodsModule.class";
import MosaicAnalysisMethodsModule from "./MosaicTileModules/MosaicAnalysisMethodsModule.class";
import MosaicFeatureTypesModule from "./MosaicTileModules/MosaicFeatureTypesModule.class";
import MosaicCeramicsCultureModule from "./MosaicTileModules/MosaicCeramicsCultureModule.class";
import MosaicCeramicsRelativeAgesModule from "./MosaicTileModules/MosaicCeramicsRelativeAgesModule.class";
import MosaicCeramicsTypeCountModule from "./MosaicTileModules/MosaicCeramicsTypeCountModule.class";
import MosaicDendroBuildingTypesModule from "./MosaicTileModules/MosaicDendroBuildingTypesModule.class";
import MosaicTemporalDistributionModule from "./MosaicTileModules/MosaicTemporalDistributionModule.class";
import MosaicTaxaListModule from "./MosaicTileModules/MosaicTaxaListModule.class";
import MosaicArchaeobotanyTaxaListModule from "./MosaicTileModules/MosaicArchaeobotanyTaxaListModule.class.js";
import MosaicEcoCodesModule from './MosaicTileModules/MosaicEcoCodesModule.class.js';
import MosaicDynamicChartModule from './MosaicTileModules/MosaicDynamicChartModule.class.js';
import MosaicDendroTreeSpecies from './MosaicTileModules/MosaicDendroTreeSpecies.class.js';
import MosaicDendroSampleTypes from './MosaicTileModules/MosaicDendroSampleTypes.class.js';
import MosaicDendroTreeAge from './MosaicTileModules/MosaicDendroTreeAge.class.js';
import MosaicDendroSapwood from './MosaicTileModules/MosaicDendroSapwood.class.js';
import MosaicDendroPith from './MosaicTileModules/MosaicDendroPith.class.js';
import MosaicDendroTreeRings from './MosaicTileModules/MosaicDendroTreeRings.class.js';
import MosaicDendroAnalysedRadii from './MosaicTileModules/MosaicDendroAnalysedRadii.class.js';
import MosaicDendroBark from './MosaicTileModules/MosaicDendroBark.class.js';
import MosaicDendroEwLwMeasurements from './MosaicTileModules/MosaicDendroEwLwMeasurements.class.js';
import MosaicDendroWaneyEdge from './MosaicTileModules/MosaicDendroWaneyEdge.class.js';
import MosaicDatedSitesModule from './MosaicTileModules/MosaicDatedSites.class.js';
import MosaicDomainSamples from './MosaicTileModules/MosaicDomainSamples.class.js';
import MosaicMutualClimaticRangeModule from './MosaicTileModules/MosaicMutualClimaticRangeModule.class.js';
import { nanoid } from 'nanoid';
import Plotly from "plotly.js-dist-min";

class ResultMosaic extends ResultModule {
	constructor(resultManager) {
		super(resultManager);
		this.sqs = this.resultManager.sqs;
		this.name = "mosaic";
		this.prettyName = "Overview";
		this.icon = "<i class=\"fa fa-bar-chart\" aria-hidden=\"true\"></i>";
		this.currentZoomLevel = 4;
		this.requestBatchId = 0;
		this.graphs = [];
		this.renderPromises = [];
		this.modules = [];
		this.plotlyLayoutRegistry = new Map();
		this.gridLayout = new MosaicGridLayout();
		this.tileLayout = []; // runtime tile descriptors [{ id, col, row, w, h, minW, minH }]
		this.responsiveLayoutEventOwner = {};
		this.responsiveLayoutResizeTimeout = null;

		$(window).on("seadResultMenuSelection", (event, data) => {
			this.setActive(data.selection == this.name);
		});

		
		//On domain change - unrender/render all tile modules
		/*
		this.sqs.sqsEventListen("domainChanged", (evt, newDomainName) => {
			this.unrender().then(() => {
				this.render();
			});
		});
		*/

		this.modules.push({
			title: "Site map",
			className: "MosaicMapModule",
			classTemplate: MosaicMapModule,
			module: null
		});
		this.modules.push({
			title: "Sample groups sampling methods",
			className: "MosaicSampleMethodsModule",
			classTemplate: MosaicSampleMethodsModule,
			module: null
		});
		this.modules.push({
			title: "Dataset analysis methods",
			className: "MosaicAnalysisMethodsModule",
			classTemplate: MosaicAnalysisMethodsModule,
			module: null
		});
		this.modules.push({
			title: "Top feature types",
			className: "MosaicFeatureTypesModule",
			classTemplate: MosaicFeatureTypesModule,
			module: null
		});
		this.modules.push({
			title: "Ceramic cultures",
			className: "MosaicCeramicsCultureModule",
			classTemplate: MosaicCeramicsCultureModule,
			module: null
		});
		this.modules.push({
			title: "Ceramic relative ages",
			className: "MosaicCeramicsRelativeAgesModule",
			classTemplate: MosaicCeramicsRelativeAgesModule,
			module: null
		});
		this.modules.push({
			title: "Ceramic type counts",
			className: "MosaicCeramicsTypeCountModule",
			classTemplate: MosaicCeramicsTypeCountModule,
			module: null
		});
		this.modules.push({
			title: "Building types",
			className: "MosaicDendroBuildingTypesModule",
			classTemplate: MosaicDendroBuildingTypesModule,
			module: null
		});
		this.modules.push({
			title: "Temporal distribution of datasets",
			className: "MosaicTemporalDistributionModule",
			classTemplate: MosaicTemporalDistributionModule,
			module: null
		});
		this.modules.push({
			title: "Top taxa",
			className: "MosaicTaxaListModule",
			classTemplate: MosaicTaxaListModule,
			module: null
		});
		this.modules.push({
			title: "Top archaeobotanical taxa",
			className: "MosaicArchaeobotanyTaxaListModule",
			classTemplate: MosaicArchaeobotanyTaxaListModule,
			module: null
		});
		this.modules.push({
			title: "BUGS eco codes",
			className: "MosaicEcoCodesModule",
			classTemplate: MosaicEcoCodesModule,
			module: null
		});
		this.modules.push({
			title: "Generate chart",
			className: "MosaicDynamicChartModule",
			classTemplate: MosaicDynamicChartModule,
			module: null
		});
		this.modules.push({
			title: "Tree species",
			className: "MosaicDendroTreeSpecies",
			classTemplate: MosaicDendroTreeSpecies,
			module: null
		});
		this.modules.push({
			title: "Sample types",
			className: "MosaicDendroSampleTypes",
			classTemplate: MosaicDendroSampleTypes,
			module: null
		});
		this.modules.push({
			title: "Tree age distribution",
			className: "MosaicDendroTreeAge",
			classTemplate: MosaicDendroTreeAge,
			module: null
		});
		this.modules.push({
			title: "Sapwood",
			className: "MosaicDendroSapwood",
			classTemplate: MosaicDendroSapwood,
			module: null
		});
		this.modules.push({
			title: "Pith",
			className: "MosaicDendroPith",
			classTemplate: MosaicDendroPith,
			module: null
		});
		this.modules.push({
			title: "Tree Rings",
			className: "MosaicDendroTreeRings",
			classTemplate: MosaicDendroTreeRings,
			module: null
		});
		this.modules.push({
			title: "Analysed Radii",
			className: "MosaicDendroAnalysedRadii",
			classTemplate: MosaicDendroAnalysedRadii,
			module: null
		});
		this.modules.push({
			title: "Bark",
			className: "MosaicDendroBark",
			classTemplate: MosaicDendroBark,
			module: null
		});
		this.modules.push({
			title: "EW/LW Measurements",
			className: "MosaicDendroEwLwMeasurements",
			classTemplate: MosaicDendroEwLwMeasurements,
			module: null
		});
		this.modules.push({
			title: "Waney Edge",
			className: "MosaicDendroWaneyEdge",
			classTemplate: MosaicDendroWaneyEdge,
			module: null
		});
		this.modules.push({
			title: "Dated Sites",
			className: "MosaicDatedSitesModule",
			classTemplate: MosaicDatedSitesModule,
			module: null
		});
		this.modules.push({
			title: "Samples per domain",
			className: "MosaicDomainSamples",
			classTemplate: MosaicDomainSamples,
			module: null
		});
		this.modules.push({
			title: "Mutual climatic range",
			className: "MutualClimaticRangeModule",
			classTemplate: MosaicMutualClimaticRangeModule,
			module: null
		});
		
		this.modules.forEach(mReg => {
			mReg.name = new mReg.classTemplate().name;
		});
	}

	registerPlotlyLayout(anchorNodeId, layout) {
		if(typeof anchorNodeId != "string") {
			return;
		}

		if(anchorNodeId.startsWith("#")) {
			anchorNodeId = anchorNodeId.substring(1);
		}

		this.pruneStalePlotlyLayouts();
		this.plotlyLayoutRegistry.set(anchorNodeId, layout);
		this.sqs.sqsEventUnlisten("layoutResize", this);
		this.sqs.sqsEventListen("layoutResize", () => {
			this.relayoutRegisteredPlotlyCharts();
		}, this);
	}

	unregisterPlotlyLayout(anchorNodeId) {
		if(typeof anchorNodeId != "string") {
			return;
		}

		if(anchorNodeId.startsWith("#")) {
			anchorNodeId = anchorNodeId.substring(1);
		}

		this.plotlyLayoutRegistry.delete(anchorNodeId);
	}

	pruneStalePlotlyLayouts() {
		this.plotlyLayoutRegistry.forEach((layout, anchorNodeId) => {
			let chartNode = document.getElementById(anchorNodeId);
			if(!chartNode || typeof chartNode.data == "undefined") {
				this.plotlyLayoutRegistry.delete(anchorNodeId);
			}
		});
	}

	relayoutRegisteredPlotlyCharts() {
		let staleAnchors = [];

		this.plotlyLayoutRegistry.forEach((layout, anchorNodeId) => {
			let chartNode = document.getElementById(anchorNodeId);
			if(!chartNode || typeof chartNode.data == "undefined") {
				staleAnchors.push(anchorNodeId);
				return;
			}

			try {
				Plotly.relayout(chartNode, { autosize: true });
			}
			catch(e) {
				staleAnchors.push(anchorNodeId);
				console.warn("Failed to relayout plotly chart", e);
			}
		});

		staleAnchors.forEach((anchorNodeId) => {
			this.plotlyLayoutRegistry.delete(anchorNodeId);
		});

		if(this.plotlyLayoutRegistry.size == 0) {
			this.sqs.sqsEventUnlisten("layoutResize", this);
		}
	}

	getPlotlyNodeFromSelector(selector) {
		if(typeof selector == "object") {
			if(selector && selector.jquery) {
				return selector[0];
			}
			return selector;
		}

		if(typeof selector == "string") {
			let node = $(selector);
			if(node.length > 0) {
				return node[0];
			}

			if(!selector.startsWith("#")) {
				node = $("#"+selector);
				if(node.length > 0) {
					return node[0];
				}
			}
		}

		return null;
	}

	cleanupPlotlyChartsInContainer(containerSelector) {
		let containerNode = $(containerSelector);
		if(containerNode.length == 0) {
			return;
		}

		let plotlyNodes = containerNode.find(".js-plotly-plot").addBack(".js-plotly-plot");
		plotlyNodes.each((key, plotlyNode) => {
			this.unrenderPlotlyChart(plotlyNode);
		});
	}

	isVisible() {
		return true;
	}

	setActive(active) {
		super.setActive(active);
		if(active) {
			$("#result-mosaic-container").show();
		}
		else {
			$("#result-mosaic-container").hide();
		}
	}

	getModuleMetaByName(name) {
		for(let key in this.modules) {
			if(this.modules[key].name == name) {
				return this.modules[key];
			}
		}
		return false;
	}
	
	getModuleByClassName(name) {
		for(let key in this.modules) {
			if(this.modules[key].className == name) {
				return this.modules[key];
			}
		}
		return false;
	}
	
	/*
	setLoadingIndicator(containerNode, isLoading) {
		if(isLoading) {
			$(containerNode).addClass("result-mosaic-loading-indicator-bg");
		}
		else {
			$(containerNode).removeClass("result-mosaic-loading-indicator-bg");
		}
	}
	*/

	clearData() {
		this.data.columns = [];
		this.data.rows = [];
	}
	
	fetchData() {
		if(this.resultDataFetchingSuspended) {
			this.pendingDataFetch = true;
			return false;
		}
		
		//var reqData = this.resultManager.getRequestData(++this.requestId, "tabular");
		var reqData = this.resultManager.getRequestData(++this.requestId, "map");
		
		//this.resultManager.showLoadingIndicator(true);
		return $.ajax(Config.serverAddress+"/api/result/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: (respData, textStatus, jqXHR) => {
				return respData;
			},
			error: (respData, textStatus, jqXHR) => {
				this.sqs.resultManager.showLoadingIndicator(false, true);
			},
			complete: (xhr, textStatus) => {
			}
		});
	}
	
	importResultData(data) {
		this.sql = data.Query;
		this.data.columns = [];
		this.data.rows = [];
		
		for(var key in data.Meta.Columns) {
			var c = data.Meta.Columns[key];
			this.data.columns.push({
				title: c.DisplayText,
				field: c.FieldKey
			});
		}
		
		for(var key in data.Data.DataCollection) {
			var d = data.Data.DataCollection[key];
			
			var row = {};
			
			var i = 0;
			for(var ck in this.data.columns) {
				row[this.data.columns[ck].field] = d[i];
				i++;
			}
			
			this.data.rows.push(row);
		}

		this.sites = [];
		for(let key in this.data.rows) {
			if(Number.isInteger(this.data.rows[key].category_id)) {
				this.sites.push(this.data.rows[key].category_id);
			}
		}
	}
	
	/**
	 * Function: render
	 * 
	 * This is the entry-function, the one being called by the ResultManager to set off the rendering of this module and its sub-modules.
	 * 
	 * This will also be called when the domain changes, despite the reuslt module not changing, which means we need to unrender any previous mosaic tiles
	 */
	render() {
		var xhr = this.fetchData();
		xhr.then((respData, textStatus, xhr) => { //success
			if(respData.RequestId == this.requestId && this.resultManager.getActiveModule().name == this.name) { //Only load this data if it matches the last request id dispatched. Otherwise it's old data.
				this.importResultData(respData);
				this.renderData();
			}
			else {
				console.log("WARN: ResultMosaic discarding old result package data ("+respData.RequestId+"/"+this.requestId+").");
			}
		},
		function(xhr, textStatus, errorThrown) { //error
			console.log(errorThrown);
		});
	}

	update() {
		console.log("mosaic update")
		var xhr = this.fetchData();
		xhr.then((respData, textStatus, xhr) => { //success
			if(respData.RequestId == this.requestId && this.resultManager.getActiveModule().name == this.name) { //Only load this data if it matches the last request id dispatched. Otherwise it's old data.
				this.importResultData(respData);
				this.updateGridModules();
			}
			else {
				console.log("WARN: ResultMosaic discarding old result package data ("+respData.RequestId+"/"+this.requestId+").");
			}
		},
		function(xhr, textStatus, errorThrown) { //error
			console.log(errorThrown);
		});
	}
	
	applyDomainGridLayout(domain) {
		// Switch from CSS grid to absolute-positioning tile window manager.
		// The container height is maintained dynamically by updateContainerHeight().
		let container = $("#result-mosaic-container");
		container.css({
			"display": "block",
			"position": "relative",
			"grid-template-rows": "",
			"grid-template-columns": "",
			"grid-gap": "",
			"justify-items": "",
			"align-items": "",
			"overflow": "visible",
		});

		// Ensure the drop-preview element exists
		if ($("#mosaic-drop-preview").length === 0) {
			container.append("<div id='mosaic-drop-preview'></div>");
		}
	}

	getGridBoxId(moduleConf) {
		let gridRow = moduleConf.grid_row.replace(/\s+/g, '');
		let gridCol = moduleConf.grid_column.replace(/\s+/g, '');
		return "mosaic-grid-box-" + gridRow + "-" + gridCol;
	}

	resolveTooltipAnchorNode(anchor) {
		if(!anchor) {
			return null;
		}

		if(typeof anchor == "string") {
			let anchorNode = $(anchor);
			if(anchorNode.length > 0) {
				return anchorNode[0];
			}
			return null;
		}

		if(anchor.jquery) {
			if(anchor.length > 0) {
				return anchor[0];
			}
			return null;
		}

		if(anchor.nodeType === 1) {
			return anchor;
		}

		return null;
	}

	getRegisteredTooltipsForNode(node) {
		let matchingTooltips = [];
		if(!node || !this.sqs || !this.sqs.tooltipManager || !Array.isArray(this.sqs.tooltipManager.tooltips)) {
			return matchingTooltips;
		}

		this.sqs.tooltipManager.tooltips.forEach((tooltip) => {
			let anchorNode = this.resolveTooltipAnchorNode(tooltip.anchor);
			if(anchorNode === node) {
				matchingTooltips.push(tooltip);
			}
		});

		return matchingTooltips;
	}

	getDefaultMosaicTitleTooltip(moduleConf, titleText) {
		let moduleDescription = "";
		if(moduleConf && moduleConf.module && typeof moduleConf.module.description == "string") {
			moduleDescription = moduleConf.module.description.trim();
		}
		if(moduleDescription != "") {
			return moduleDescription;
		}

		let title = titleText;
		if(typeof title != "string" || title.trim() == "") {
			if(moduleConf && moduleConf.module && typeof moduleConf.module.title == "string") {
				title = moduleConf.module.title;
			}
		}
		if(typeof title != "string" || title.trim() == "") {
			title = "this module";
		}
		else {
			title = title.trim();
			title = title.charAt(0).toLowerCase() + title.slice(1);
		}

		return "Shows " + title + " for the currently selected sites.";
	}

	ensureMosaicTileTitleTooltip(mosaicTileId, moduleConf) {
		let titleNode = $("#"+mosaicTileId+" .mosaic-tile-title").first();
		if(titleNode.length == 0) {
			return;
		}

		let titleAnchor = "#"+mosaicTileId+" .mosaic-tile-title";
		let titleText = titleNode.text().trim();
		let existingTooltips = this.getRegisteredTooltipsForNode(titleNode[0]);
		let hasCustomTooltip = false;
		let hasFallbackTooltip = false;

		existingTooltips.forEach((tooltip) => {
			if(tooltip.anchor == titleAnchor) {
				hasFallbackTooltip = true;
			}
			else {
				hasCustomTooltip = true;
			}
		});

		if(hasCustomTooltip) {
			if(hasFallbackTooltip) {
				this.sqs.tooltipManager.unRegisterTooltip(titleAnchor);
			}
			return;
		}

		let tooltipText = this.getDefaultMosaicTitleTooltip(moduleConf, titleText);
		this.sqs.tooltipManager.registerTooltip(titleAnchor, tooltipText, { drawSymbol: true, anchorPoint: "symbol" });
	}

	renderGridModules(resultGridModules) {
		this.rebuildTileLayout(resultGridModules);

		// Render each tile
		const renderPromises = [];
		resultGridModules.forEach(mConf => {
			if (typeof mConf.default == "undefined" || mConf.default == true) {
				renderPromises.push(
					this.renderGridModule(mConf, mConf.mosaicTileId).then(() => {
						this.ensureMosaicTileTitleTooltip(mConf.mosaicTileId, mConf);

						// Module selector goes inside the drag handle
						let moduleSelectionOptions = resultGridModules.map(m => {
							let moduleMeta = this.getModuleMetaByName(m.module_name);
							return { name: m.module_name, title: moduleMeta ? moduleMeta.title : m.module_name };
						});
						let titleSelectHtml = this.renderGridModuleSelector(resultGridModules, mConf, mConf.grid_box_id, moduleSelectionOptions);
						if (titleSelectHtml) {
							$("#"+mConf.mosaicTileId+" .mosaic-tile-drag-handle").append(titleSelectHtml);
						}

						if (this.sqs.config.showMosaicExportButtons) {
							let exportButton = $("<div></div>").addClass("result-export-button-mosaic").attr("title", "Export").html("<i class='fa fa-download' aria-hidden='true'></i>");
							$("#"+mConf.mosaicTileId+" .mosaic-tile-drag-handle").append(exportButton);
							this.bindExportModuleDataToButton("#"+mConf.mosaicTileId+" .result-export-button-mosaic", mConf.module);
						}
					})
				);
			}
		});

		Promise.all(renderPromises).then(() => {
			this.updateContainerHeight();
		});

		// Save module instances to registry
		resultGridModules.forEach(mConf => {
			for (let key in this.modules) {
				if (this.modules[key].name == mConf.module_name) {
					this.modules[key].module = mConf.module;
				}
			}
		});

		this.bindGridModuleSelectionCallbacks();
	}

	rebuildTileLayout(resultGridModules) {
		let domain = this.sqs.domainManager.getActiveDomain();
		const domainRows = domain.result_grid_layout[0];
		const domainCols = domain.result_grid_layout[1];
		const effectiveDomainCols = this.gridLayout.getEffectiveDomainCols();

		this.tileLayout = [];
		resultGridModules.forEach(mConf => {
			if (typeof mConf.default == "undefined" || mConf.default == true) {
				if(typeof mConf.mosaicTileId == "undefined") {
					mConf.mosaicTileId = nanoid();
				}
				mConf.grid_box_id = this.getGridBoxId(mConf);

				const descriptor = this.gridLayout.tileFromModuleConf(
					mConf, domainRows, domainCols, mConf.mosaicTileId, this.tileLayout, effectiveDomainCols
				);

				if(mConf.tileDescriptor) {
					Object.assign(mConf.tileDescriptor, descriptor);
				}
				else {
					mConf.tileDescriptor = descriptor;
				}
				this.tileLayout.push(mConf.tileDescriptor);
			}
		});
	}

	async renderGridModule(moduleConf, mosaicTileId) {
		let module = this.getInstanceOfModule(moduleConf.module_name);

		let tileNode = $("<div id='"+mosaicTileId+"' class='result-mosaic-tile'></div>");

		if (!module) {
			tileNode.append("<div class='mosaic-tile-header mosaic-tile-drag-handle'><h3 class='mosaic-tile-title'>NoSuchModuleError - "+moduleConf.module_name+"</h3></div>");
			tileNode.append("<div class='result-mosaic-graph-container'></div>");
		}
		else {
			moduleConf.module = module;
			moduleConf.moduleInstanceId = nanoid();

			// The header doubles as the drag handle and holds the title, the chart
			// selector and the export button. Modules render only their chart into the
			// graph container; dynamic-title modules update the title via setMosaicTileTitle().
			let registeredMeta = this.getModuleMetaByName(moduleConf.module_name);
			let initialTitle = module.title || (registeredMeta ? registeredMeta.title : "");
			let header = $("<div class='mosaic-tile-header mosaic-tile-drag-handle'></div>");
			$("<h3 class='mosaic-tile-title'></h3>").text(initialTitle).appendTo(header);
			let graphContainer = $("<div id='"+moduleConf.grid_box_id+"' module-instance-id='"+moduleConf.moduleInstanceId+"' module-name='"+moduleConf.module_name+"' class='result-mosaic-graph-container'></div>");
			let resizeHandle = $("<div class='mosaic-tile-resize-handle' title='Drag to resize'></div>");

			tileNode.append(header);
			tileNode.append(graphContainer);
			tileNode.append(resizeHandle);

			// Apply initial absolute position (no transition on first placement)
			this.applyTileGeometry(tileNode[0], moduleConf.tileDescriptor, false);

			$('#result-mosaic-container').append(tileNode);

			this.initTileDrag(tileNode[0], moduleConf);
			this.initTileResize(tileNode[0], moduleConf);

			await module.render("#"+moduleConf.grid_box_id);
		}
	}

	unrenderGridModules() {
		console.warn("Unrendering grid modules - not implemented");
	}

	// ─── tiled window manager ─────────────────────────────────────────────────

	/**
	 * Apply absolute pixel geometry to a tile DOM element from its grid descriptor.
	 * @param {HTMLElement} el
	 * @param {{ col, row, w, h }} descriptor
	 * @param {boolean} [animate=true]
	 */
	applyTileGeometry(el, descriptor, animate = true) {
		const container = document.getElementById("result-mosaic-container");
		if (!container) return;
		const { x, y, width, height } = this.gridLayout.gridToPixel(
			descriptor.col, descriptor.row, descriptor.w, descriptor.h, container
		);
		if (!animate) {
			el.style.transition = "none";
		}
		el.style.left   = x + "px";
		el.style.top    = y + "px";
		el.style.width  = width + "px";
		el.style.height = height + "px";
		if (!animate) {
			// Re-enable transition on next frame so subsequent moves animate
			requestAnimationFrame(() => { el.style.transition = ""; });
		}
	}

	/**
	 * Re-position all tiles to their current layout state.
	 * @param {string|null} [skipId] - tile id to skip (the one being dragged)
	 */
	syncAllTiles(skipId = null) {
		this.tileLayout.forEach(descriptor => {
			if (descriptor.id === skipId) return;
			const el = document.getElementById(descriptor.id);
			if (el) this.applyTileGeometry(el, descriptor, true);
		});
		this.updateContainerHeight();
	}

	updateContainerHeight() {
		const container = document.getElementById("result-mosaic-container");
		if (!container) return;
		const needed = this.gridLayout.getRequiredHeight(this.tileLayout);
		container.style.minHeight = needed + "px";
	}

	updateCSSVars() {
		const container = document.getElementById("result-mosaic-container");
		if (!container) return;
		const gl = this.gridLayout;
		const cw = gl.getColWidth(container);
		container.style.setProperty("--mosaic-col-w", (cw + gl.GAP) + "px");
		container.style.setProperty("--mosaic-row-h", (gl.ROW_H + gl.GAP) + "px");
	}

	configureGridLayoutForDomain(domain) {
		const container = document.getElementById("result-mosaic-container");
		const previousDomainCols = this.gridLayout.getEffectiveDomainCols();
		this.gridLayout.configureForDomain(domain, container);
		this.updateCSSVars();
		return previousDomainCols != this.gridLayout.getEffectiveDomainCols();
	}

	applyResponsiveTileLayout() {
		let activeModule = this.resultManager.getActiveModule();
		if(!activeModule || activeModule.name != this.name || $("#result-mosaic-container").length == 0) {
			return;
		}

		let activeDomain = this.sqs.domainManager.getActiveDomain();
		let columnCountChanged = this.configureGridLayoutForDomain(activeDomain);
		if(columnCountChanged) {
			this.rebuildTileLayout(activeDomain.result_grid_modules);
		}
		this.syncAllTiles();
		this.relayoutRegisteredPlotlyCharts();
	}

	bindResponsiveTileLayoutCallbacks() {
		this.sqs.sqsEventUnlisten("layoutResize", this.responsiveLayoutEventOwner);
		this.sqs.sqsEventListen("layoutResize", () => {
			clearTimeout(this.responsiveLayoutResizeTimeout);
			this.responsiveLayoutResizeTimeout = setTimeout(() => {
				this.applyResponsiveTileLayout();
			}, 0);
		}, this.responsiveLayoutEventOwner);
	}

	initTileDrag(el, moduleConf) {
		const handle   = el.querySelector(".mosaic-tile-drag-handle");
		const preview  = document.getElementById("mosaic-drop-preview");
		const container = document.getElementById("result-mosaic-container");
		const descriptor = moduleConf.tileDescriptor;

		handle.addEventListener("mousedown", (e) => {
			// Don't start drag when clicking on interactive elements inside the handle
			if (e.target.closest("select, button, a, .result-export-button-mosaic")) return;
			e.preventDefault();

			const rect    = el.getBoundingClientRect();
			const offsetX = e.clientX - rect.left;
			const offsetY = e.clientY - rect.top;

			el.classList.add("mosaic-tile-dragging");
			container.classList.add("mosaic-drag-active");
			if (preview) preview.style.display = "block";

			// Snapshot layout so we can replay from a clean state each mousemove
			const snapshot = this.tileLayout.map(t => ({ ...t }));
			const startDescriptor = snapshot.find(t => t.id === descriptor.id);

			let lastCol = descriptor.col;
			let lastRow = descriptor.row;

			const onMove = (e) => {
				const cRect = container.getBoundingClientRect();
				const rawX  = e.clientX - cRect.left - offsetX;
				const rawY  = e.clientY - cRect.top  - offsetY;

				const { col, row } = this.gridLayout.tilePixelToGrid(rawX, rawY, descriptor, startDescriptor, snapshot, container);

				if (col !== lastCol || row !== lastRow) {
					lastCol = col;
					lastRow = row;

					// Restore snapshot then apply move so collisions solve from clean state
					this.tileLayout = snapshot.map(t => ({ ...t }));
					const updated = this.gridLayout.applyLayout(
						this.tileLayout, descriptor.id, col, row, descriptor.w, descriptor.h
					);
					if (updated) {
						this.tileLayout = updated;
						// Update the descriptor reference in moduleConf
						const committed = this.tileLayout.find(t => t.id === descriptor.id);
						Object.assign(descriptor, committed);
					}

					this.syncAllTiles(descriptor.id);
				}

				// Show drop-preview at snapped position
				if (preview) {
					const snapped = this.tileLayout.find(t => t.id === descriptor.id);
					if (snapped) {
						const pix = this.gridLayout.gridToPixel(
							snapped.col, snapped.row, snapped.w, snapped.h, container
						);
						preview.style.left   = pix.x + "px";
						preview.style.top    = pix.y + "px";
						preview.style.width  = pix.width + "px";
						preview.style.height = pix.height + "px";
					}
				}

				// The dragged tile follows the cursor freely
				const cRect2 = container.getBoundingClientRect();
				el.style.left = (e.clientX - cRect2.left - offsetX) + "px";
				el.style.top  = (e.clientY - cRect2.top  - offsetY) + "px";
			};

			const onUp = () => {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);

				el.classList.remove("mosaic-tile-dragging");
				container.classList.remove("mosaic-drag-active");
				if (preview) preview.style.display = "none";

				// Snap to committed grid position with animation
				const committed = this.tileLayout.find(t => t.id === descriptor.id);
				if (committed) this.applyTileGeometry(el, committed, true);

				this.updateContainerHeight();

				// Notify Plotly charts of potential size change
				this.relayoutRegisteredPlotlyCharts();
				this.sqs.sqsEventDispatch("layoutResize");
			};

			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		});
	}

	initTileResize(el, moduleConf) {
		const handle    = el.querySelector(".mosaic-tile-resize-handle");
		const container = document.getElementById("result-mosaic-container");
		const descriptor = moduleConf.tileDescriptor;

		handle.addEventListener("mousedown", (e) => {
			e.preventDefault();
			e.stopPropagation();

			const startX   = e.clientX;
			const startY   = e.clientY;
			const startW   = descriptor.w;
			const startH   = descriptor.h;
			const snapshot = this.tileLayout.map(t => ({ ...t }));

			el.style.zIndex = 1000;

			const onMove = (e) => {
				const gl = this.gridLayout;
				const cw = gl.getColWidth(container);
				const dx = e.clientX - startX;
				const dy = e.clientY - startY;

				const newW = Math.max(descriptor.minW, Math.round(startW + dx / (cw + gl.GAP)));
				const newH = Math.max(descriptor.minH, Math.round(startH + dy / (gl.ROW_H + gl.GAP)));

				this.tileLayout = snapshot.map(t => ({ ...t }));
				const updated = gl.applyLayout(
					this.tileLayout, descriptor.id, descriptor.col, descriptor.row, newW, newH
				);
				if (updated) {
					this.tileLayout = updated;
					const committed = this.tileLayout.find(t => t.id === descriptor.id);
					Object.assign(descriptor, committed);
				}

				this.syncAllTiles(descriptor.id);
				this.applyTileGeometry(el, descriptor, false);
			};

			const onUp = () => {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				el.style.zIndex = "";
				this.updateContainerHeight();
				this.relayoutRegisteredPlotlyCharts();
				this.sqs.sqsEventDispatch("layoutResize");
			};

			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		});
	}

	// ─── end tiled window manager ──────────────────────────────────────────────

	renderGridModuleSelector(resultGridModules, moduleConf, grid_box_id, options) {
		// Check if the current module wants to show the chart selector
		if(moduleConf.module && moduleConf.module.showChartSelector === false) {
			return "";
		}
		
		// Only show the selector if there are more than 1 option
		if(resultGridModules.length <= 1) {
			return "";
		}

		let titleSelectHtml = "<h2><select result-mosaic-grid-box-id='"+grid_box_id+"' class=\"result-mosaic-tile-chart-selector\">";

		let selectOptionsHtml = "";
		resultGridModules.forEach(moduleSpec => {
			let moduleTitle = moduleSpec.module_name;
			//find this module in this.modules by name, just to get the title
			this.modules.forEach(moduleReg => {
				if(moduleReg.name == moduleSpec.module_name) {
					moduleTitle = moduleReg.title;
				}
			});

			if(moduleSpec.module_name == moduleConf.module_name) {
				selectOptionsHtml += "<option value=\""+moduleSpec.module_name+"\" selected=\"selected\">"+moduleTitle+"</option>";
			}
			else {
				selectOptionsHtml += "<option value=\""+moduleSpec.module_name+"\">"+moduleTitle+"</option>";
			}
		});

		titleSelectHtml += selectOptionsHtml;
		titleSelectHtml += "</select></h2>";

		return titleSelectHtml;
	}

	bindGridModuleSelectionCallbacks() {
		$(".result-mosaic-tile-chart-selector").on("change", async (evt) => {
			let mosaicTileNode = $(evt.target).closest(".result-mosaic-tile");
			let graphContainer = $(".result-mosaic-graph-container", mosaicTileNode);
			let gridBoxId = graphContainer.attr("id");
			let currentModuleInstanceId = graphContainer.attr("module-instance-id")
			let currentModuleMeta = this.getModuleMetaByInstanceId(currentModuleInstanceId);
			if(!currentModuleMeta || !currentModuleMeta.module) {
				return;
			}
			await currentModuleMeta.module.unrender();

			let selectedModuleName = $(evt.target).val();

			let activeDomain = this.sqs.domainManager.getActiveDomain();

			for(let key in activeDomain.result_grid_modules) {
				if(typeof activeDomain.result_grid_modules[key].grid_row == "undefined") {
					activeDomain.result_grid_modules[key].grid_row = currentModuleMeta.grid_row;
				}
				if(typeof activeDomain.result_grid_modules[key].grid_column == "undefined") {
					activeDomain.result_grid_modules[key].grid_column = currentModuleMeta.grid_column;
				}

				if(typeof activeDomain.result_grid_modules[key].grid_box_id == "undefined") {
					activeDomain.result_grid_modules[key].grid_box_id = this.getGridBoxId(activeDomain.result_grid_modules[key]);
				}
				if(activeDomain.result_grid_modules[key].moduleInstanceId == currentModuleInstanceId) {
					console.log("Updating "+activeDomain.result_grid_modules[key].module_name+" to "+selectedModuleName)
					activeDomain.result_grid_modules[key].module_name = selectedModuleName;
					activeDomain.result_grid_modules[key].module = this.getInstanceOfModule(selectedModuleName);
					$("#"+gridBoxId).attr("module-name", selectedModuleName);
					$("#"+gridBoxId).html("");
					await activeDomain.result_grid_modules[key].module.render("#"+gridBoxId);
					this.ensureMosaicTileTitleTooltip(mosaicTileNode.attr("id"), activeDomain.result_grid_modules[key]);
				}
			}
		});
	}

	getLiveModuleInstanceByName(name) {
		let domain = this.sqs.domainManager.getActiveDomain();
		for(let key in domain.result_grid_modules) {
			if(domain.result_grid_modules[key].module_name == name) {
				return domain.result_grid_modules[key].module;
			}
		}
		return false;
	}

	updateGridModules() {
		let activeDomain = this.sqs.domainManager.getActiveDomain();
		
		activeDomain.result_grid_modules.forEach(moduleConf => {
			if(typeof moduleConf.module != "undefined" && moduleConf.module != null) {
				console.log("Updating grid module "+moduleConf.module.name);
				moduleConf.module.update();
			}
		});
	}

	getModuleMetaByInstanceId(moduleInstanceId) {
		let domain = this.sqs.domainManager.getActiveDomain();
		for(let key in domain.result_grid_modules) {
			if(domain.result_grid_modules[key].moduleInstanceId == moduleInstanceId) {
				return domain.result_grid_modules[key];
			}
		}
	}

	getInstanceOfModule(moduleName) {
		for(let key in this.modules) {
			if(this.modules[key].name == moduleName) {
				return new this.modules[key].classTemplate(this.sqs);
			}
		}
		return null;
	}
	
	/**
	 * Function: renderData
	 */
	renderData() {
		super.render();
		$('#result-mosaic-container').show();

		let domain = this.sqs.domainManager.getActiveDomain();
		this.applyDomainGridLayout(domain);

		this.configureGridLayoutForDomain(domain);

		if ($(".result-mosaic-tile").length === 0) {
			this.renderGridModules(domain.result_grid_modules);
		}
		else {
			this.updateGridModules(domain.result_grid_modules);
		}

		// Keep CSS vars and tile positions in sync on window resize
		$(window).off("resize.mosaicGrid").on("resize.mosaicGrid", () => {
			this.applyResponsiveTileLayout();
		});
		this.bindResponsiveTileLayoutCallbacks();
	}

	prepareChartData(data_key_name, data_value_name, data) {
		let types = [];
		for(let key in data) {
			let type_id = data[key][data_key_name];
			
			if(typeof(types[type_id]) == "undefined") {
				types[type_id] = {
					methodId: data[key].type_id,
					featureType: data[key][data_value_name],
					sites: new Set([data[key].site_id]),
					count: 1
				};
			}
			else {
				types[type_id].count++;
				types[type_id].sites.add(data[key].site_id);
			}
		}

		let chartSeries = [];
		for(let key in types) {
			chartSeries.push({
				"values": [types[key].count],
				"text": types[key].featureType,
				"sites": types[key].sites
			});
		}
		
		return chartSeries;
	}


	renderDendroTreeSpecies(renderIntoNode, resultMosaic) {
		//http://seadserv.humlab.umu.se:3000/qse_dendro_tree_species?site_id=eq.1996
		let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_dendro_tree_species", resultMosaic.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}

			let chartSeries = resultMosaic.prepareChartData("method_id", "method_name", promiseData.data);
			resultMosaic.renderPieChart(renderIntoNode, chartSeries, "Sampling methods");
		});
	}

	renderFeatureTypes(renderIntoNode, resultMosaic) {
		let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_feature_types", resultMosaic.requestBatchId);

		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}

			let chartSeries = resultMosaic.prepareChartData("feature_type_id", "feature_type_name", promiseData.data);

			resultMosaic.renderBarChart(renderIntoNode, chartSeries);
		});
	}

	renderIsotopesInSamples(renderIntoNode, resultMosaic) {
		/*
		SELECT count(isotope_types.designation) FROM postgrest_api.isotope_types 
		INNER JOIN postgrest_api.isotope_measurements ON isotope_types.isotope_type_id = isotope_measurements.isotope_type_id
		WHERE designation = 'Aquatic signal';
		
		SELECT isotope_types.designation, COUNT(isotope_types.designation)
		FROM postgrest_api.isotope_types
		INNER JOIN postgrest_api.isotope_measurements ON isotope_types.isotope_type_id = isotope_measurements.isotope_type_id
		GROUP BY isotope_types.designation;



		SELECT DISTINCT(methods.method_name)
		FROM postgrest_api.methods
		INNER JOIN postgrest_api.isotope_measurements ON methods.method_id = isotope_measurements.method_id;



		SELECT *
		FROM postgrest_api.sample_locations
		WHERE sample_locations.sample_location_type_id = 2;



		SELECT relative_age_name, COUNT(relative_age_name)
		FROM postgrest_api.relative_ages
		INNER JOIN postgrest_api.relative_dates ON relative_ages.relative_age_id = relative_dates.relative_age_id
		GROUP BY relative_age_name;
		*/
	}

	renderSampleMethods(renderIntoNode, resultMosaic) {
		//WARN: This load is sometimes being done befor there are any sites...
		let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_methods", resultMosaic.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}
			console.log(promiseData.data);
			let chartSeries = resultMosaic.prepareChartData("method_id", "method_name", promiseData.data);
			console.log(chartSeries);
			resultMosaic.renderPieChart(renderIntoNode, chartSeries, "Sampling methods");
		});
	}

	preparePieChart(renderIntoNode, dbViewName, categoryNameAttribute, categoryCountAttribute) {
		let promise = this.fetchSiteData(this.sites, dbViewName, this.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < this.requestBatchId) {
				return false;
			}

			let categories = [];
			for(let key in promiseData.data) {
				let dataPoint = promiseData.data[key];

				let categoryFound = false;
				categories.forEach((category) => {
					if(category.name == dataPoint[categoryNameAttribute]) {
						categoryFound = true;
						category.count += dataPoint[categoryCountAttribute];
					}
				});

				if(!categoryFound) {
					categories.push({
						name: dataPoint[categoryNameAttribute],
						count: dataPoint[categoryCountAttribute]
					});
				}
			}

			let chartSeries = [];
			for(let key in categories) {
				chartSeries.push({
					"values": [categories[key].count],
					"text": categories[key].name
				});
			}

			this.renderPieChart(renderIntoNode, chartSeries, "Sampling methods");
		});

		return promise;
	}

	makeChartSeries(data, categoryNameAttribute, categoryCountAttribute) {
		let categories = [];
		for(let key in data) {
			let dataPoint = data[key];

			let categoryFound = false;
			categories.forEach((category) => {
				if(category.name == dataPoint[categoryNameAttribute]) {
					categoryFound = true;
					category.count += dataPoint[categoryCountAttribute];
					category.sites.add(dataPoint.site_id)
				}
			});

			if(!categoryFound) {
				categories.push({
					name: dataPoint[categoryNameAttribute],
					count: dataPoint[categoryCountAttribute],
					sites: new Set([dataPoint.site_id])
				});
			}
		}

		let chartSeries = [];
		for(let key in categories) {
			chartSeries.push({
				"values": [categories[key].count],
				"text": categories[key].name,
				"sites": categories[key].sites
			});
		}

		return chartSeries;
	}

	prepareBarChart(renderIntoNode, dbViewName, categoryNameAttribute, categoryCountAttribute) {
		let promise = this.fetchSiteData(this.sites, dbViewName, this.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < this.requestBatchId) {
				return false;
			}

			let categories = [];
			for(let key in promiseData.data) {
				let dataPoint = promiseData.data[key];

				let categoryFound = false;
				categories.forEach((category) => {
					if(category.name == dataPoint[categoryNameAttribute]) {
						categoryFound = true;
						category.count += dataPoint[categoryCountAttribute];
					}
				});

				if(!categoryFound) {
					categories.push({
						name: dataPoint[categoryNameAttribute],
						count: dataPoint[categoryCountAttribute]
					});
				}
			}

			let chartSeries = [];
			for(let key in categories) {
				chartSeries.push({
					"values": [categories[key].count],
					"text": categories[key].name
				});
			}

			this.renderBarChart(renderIntoNode, chartSeries, "Sampling methods");
		});

		return promise;
	}

	async renderCeramicsCulture(renderIntoNode) {
		return await this.preparePieChart(renderIntoNode, "qse_ceramics_culture", "Culture", "count");
	}

	async renderCeramicsRelativeAges(renderIntoNode) {
		return await this.prepareBarChart(renderIntoNode, "qse_ceramics_relative_ages", "relative_age_name", "count");
	}

	async renderCeramicsTypeCount(renderIntoNode) {
		return await this.preparePieChart(renderIntoNode, "qse_ceramics_type_count", "type_name", "count");
	}

	async renderBarChartPlotly(renderIntoNode, chartSeries, chartTitle) {
		if(chartSeries.length == 0) {
			this.sqs.setNoDataMsg(renderIntoNode);
			return;
		}
		else {
			this.sqs.setNoDataMsg(renderIntoNode, false);
		}

		chartSeries.sort((a, b) => {
			return a.value - b.value;
		});

		let data = [{
			y: chartSeries.map((obj) => { return obj.label; }),
			x: chartSeries.map((obj) => { return obj.value; }),
			type: 'bar',
			orientation: 'h',
			hovertemplate: '%{y}<extra>%{x} samples</extra>',
			text: chartSeries.map((obj) => { return obj.label; }),
			textposition: 'auto',
			marker: {
				color: this.sqs.color.colors.baseColor,
			}
		}];

		let layout = {
			title: {
				text: chartTitle,
				font: {
					family: 'Didact Gothic, sans-serif',
					size: 22
				},
			},
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
			yaxis: {
				showticklabels: false,
				automargin: true,
			},
			responsive: true,
		};

		let config = {
			responsive: true,
			displayModeBar: false,
			displaylogo: false,
			modeBarButtons: [['toImage']]
		}

		let anchorNodeId = renderIntoNode.substring(1);
		let plot = await Plotly.newPlot(anchorNodeId, data, layout, config);
		this.registerPlotlyLayout(anchorNodeId, layout);
		return plot;
	}

	renderBarChart(renderIntoNode, chartSeries, chartTitle) {

		if(chartSeries.length == 0) {
			this.sqs.setNoDataMsg(renderIntoNode);
			return;
		}
		else {
			this.sqs.setNoDataMsg(renderIntoNode, false);
		}

		var config = {
			"type":"bar",
			"background-color": "transparent",
			"series":chartSeries,
			"plot":{
				"value-box":{
					"font-size":12,
					"font-family":"Georgia",
					"font-weight":"normal",
					"decimals": 0,
					"placement":"in",
					"font-color":"white",
				}
			},
			"tooltip":{
				"text": "%t, %v counts\n<span>Click to filter on these sites</span>",
				"html-mode": true,
				"decimals": 0,
				"align": 'left',
				"borderRadius": 3,
				"fontColor":"#000000",
				"fontSize": "16px",
				"backgroundColor": "#ffffff"
			},
			"plot":{
				"animation":{
					"effect":"ANIMATION_EXPAND_BOTTOM"
				}
			}
		};

		

		let colors = this.sqs.color.getColorScheme(config.series.length);
		let legendTextMaxLength = 15;
		for(let key in config.series) {
			config.series[key].backgroundColor = colors[key];
			if(config.series[key]["text"] != null && config.series[key]["text"].length > legendTextMaxLength) {
				config.series[key]["legend-text"] = config.series[key]["text"].substr(0, legendTextMaxLength)+"...";
			}
		}

		let rows = chartSeries.length;
		if(rows > 6) {
			rows = 6;
		}
		config.legend = {
			"highlight-plot":true,
			"draggable":true,
			"max-items":6,
			"overflow":"scroll",
			"drag-handler":"icon",
			"icon":{
				"line-color":"red"
			},
			"layout":rows+"x1", //row x column
			"toggle-action":"remove"
		};

		/*
		let zc = this.getFromGraphRegistry(renderIntoNode);
		if(zc !== false) { //Update existing chart
			zingchart.exec(renderIntoNode.substr(1), 'setdata', {
				"data": config
			});
		}
		else { //Create new chart
			zc = zingchart.render({
				id : renderIntoNode.substr(1),
				data : config,
				height: "100%"
			});
			this.pushIntoGraphRegistry(zc, renderIntoNode);
		}
		*/
		let zc = zingchart.render({
			id : renderIntoNode.substring(1),
			data : config,
			height: "100%"
		});

		/*
		zc.bind("click", (evt) => {
			let startIndex = evt.targetid.indexOf("-plot-") + 6;
			let plot = evt.targetid.substring(startIndex, startIndex+1);
			let facet = this.sqs.facetManager.spawnFacet("sites", [...config.series[plot].sites]);

			let iv = setInterval(() => {
				if(facet.isDataLoaded) {
					facet.minimize();
					clearInterval(iv);
				}
			}, 100);
		});
		*/

		return zc;
	}

	renderHistogram(renderIntoNode, chartSeries, render = true) {

		if(chartSeries.length == 0) {
			this.sqs.setNoDataMsg(renderIntoNode);
			return;
		}
		else {
			this.sqs.setNoDataMsg(renderIntoNode, false);
		}

		let xScaleLabels = chartSeries[0].text;

		var config = {
			"type":"bar",
			"background-color": "transparent",
			"series": chartSeries,
			"plot":{
				"stacked": true,
				"animation":{
					"effect":"ANIMATION_EXPAND_BOTTOM"
				}
			},
			"plotarea": {
				"margin": '130 10 90 60'
			},
			"tooltip":{
				"text": "%scale-key-text\r\n%v dated samples\r\n%t",
				"html-mode": true,
				"decimals": 0,
				"align": 'left',
				"borderRadius": 3,
				"fontColor":"#000000",
				"fontSize": "16px",
				"backgroundColor": "#ffffff"
			},
			"scale-x": {
				"labels": xScaleLabels,
				"tick": {
					"visible": false,
					"_lineColor": '#D8D8D8'
				},
				"item": {
					"color": '#6C6C6C',
					"angle": '-35'
				},
			},
		};
		
		let colors = this.sqs.color.getColorScheme(config.series.length);
		let legendTextMaxLength = 15;
		for(let key in config.series) {
			config.series[key].backgroundColor = colors[key];
			
			if(key == 0) {
				config.series[key].text = ""; //Low uncertainty
			}
			if(key == 1) {
				config.series[key].text = "High uncertainty";
			}
			
			
		}

		let rows = chartSeries.length;
		if(rows > 6) {
			rows = 6;
		}
		/*
		config.legend = {
			"highlight-plot":true,
			"draggable":true,
			"max-items":6,
			"overflow":"scroll",
			"layout":rows+"x1", //row x column
			"toggle-action":"remove"
		};
		*/

		if(render) {
			let zc = zingchart.render({
				id : renderIntoNode.substring(1),
				data : config,
				height: "100%"
			});

			/*
			zc.bind("click", (evt) => {
				let startIndex = evt.targetid.indexOf("-plot-") + 6;
				let plot = evt.targetid.substring(startIndex, startIndex+1);
				let facet = this.sqs.facetManager.spawnFacet("sites", [...config.series[plot].sites]);

				let iv = setInterval(() => {
					if(facet.isDataLoaded) {
						facet.minimize();
						clearInterval(iv);
					}
				}, 100);
			});
			*/

			return zc;
		}
		else {
			return config;
		}
		
	}

	renderHistogramPlotly(renderIntoNode, chartSeries, layoutConfig = {}, configConfig = {}) {
		if(typeof renderIntoNode == "object") {
			console.warn("target node is an object, we need to convert this to an id");
			return;
		}

		let layout = {
			paper_bgcolor: this.sqs.color.colors.paneBgColor,
			showlegend: false,
			title: {
				text:'',
				font: {
				  family: 'Didact Gothic, sans-serif',
				  size: 22
				},
			},
			margin: {
				l: 50,
				r: 50,
				b: 50,
				t: 50,
				pad: 4
			},
		};

		Object.assign(layout, layoutConfig);
		let anchorNodeId = renderIntoNode.substring(1);

		let config = {
			responsive: true,
			displayModeBar: false
		}

		Object.assign(config, configConfig);

		let plot = Plotly.newPlot(anchorNodeId, chartSeries, layout, config);

		this.registerPlotlyLayout(anchorNodeId, layout);

		return plot;
	}

	/*
	renderNoDataMsg(renderIntoNode) {
		let noDataMsgNode = $("<div class='result-mosaic-no-data-msg'><div>No data</div></div>");
		$(renderIntoNode).append(noDataMsgNode);
	}

	unrenderNoDataMsg(renderIntoNode) {
		$(".result-mosaic-no-data-msg", renderIntoNode).remove();
	}
	*/

	async exportPieChartPlotly(renderIntoNode, plot) {
		let renderImagePromise = Plotly.toImage(plot, {format: 'png', width: 800, height: 800, scale: window.devicePixelRatio || 1});
		renderImagePromise.then((base64ImageUrl) => {
			let a = document.createElement('a');
			a.href = base64ImageUrl;
			a.download = 'chart.png';
			a.click();
		});

	}

	async renderPieChartPlotly(renderIntoNode, chartData, layoutConfig = {}) {
		if(typeof renderIntoNode == "object") {
			console.warn("target node is an object, we need to convert this to an id");
			return;
		}

		let layout = {
      		paper_bgcolor: "#fff",
			showlegend: true,
			title: {
				text:'',
				font: {
				  family: 'Didact Gothic, sans-serif',
				  size: 22
				},
			},
			font: {
				family: 'Didact Gothic, sans-serif',
			},
			margin: {
				l: 50,
				r: 50,
				b: 50,
				t: 50,
				pad: 2
			},
			legend: { x: 1, y: 1, xanchor: 'right', yanchor: 'top', bgcolor: 'rgba(255, 255, 255, 0.5)' }
		};

		Object.assign(layout, layoutConfig);
		let anchorNodeId = renderIntoNode.substring(1);
		let config = {
			responsive: true,
			displayModeBar: false
		}

		let plot = await Plotly.newPlot(anchorNodeId, chartData, layout, config);

		this.registerPlotlyLayout(anchorNodeId, layout);

		return plot;
	}

	unrenderPlotlyChart(selector) {
		let node = this.getPlotlyNodeFromSelector(selector);
		let anchorNodeId = null;
		if(node && typeof node.id == "string") {
			anchorNodeId = node.id;
		}
		else if(typeof selector == "string") {
			anchorNodeId = selector.startsWith("#") ? selector.substring(1) : selector;
		}

		if(anchorNodeId != null) {
			this.unregisterPlotlyLayout(anchorNodeId);
		}

		if(node == null) {
			console.warn("Bailing on unrenderPlotlyChart because node was not found");
			return;
		}

		//check that node is a plotly chart
		if(typeof node.data == "undefined") {
			console.warn("Bailing on unrenderPlotlyChart because node was not a plotly chart");
			return;
		}

		let result = Plotly.purge(node);
		if(this.plotlyLayoutRegistry.size == 0) {
			this.sqs.sqsEventUnlisten("layoutResize", this);
		}
		return result;
	}
	
	renderPieChart(renderIntoNode, chartSeries, chartTitle) {

		if(chartSeries.length == 0) {
			this.sqs.setNoDataMsg(renderIntoNode);
			return;
		}
		else {
			this.sqs.setNoDataMsg(renderIntoNode, false);
		}

		var config = {
			"type":"pie",
			"background-color": "transparent",
			"series": chartSeries,
			"tooltip":{
				"text": "%t, %v counts",
				"html-mode": true,
				"decimals": 0,
				"align": 'left',
				"borderRadius": 3,
				"fontColor":"#000000",
				"fontSize": "16px",
				"backgroundColor": "#ffffff"
			},
			"plot":{
				"animation":{
					"effect":"ANIMATION_EXPAND_LEFT"
				},
				"value-box":{
					"text": "%npv%",
					"font-size":12,
					"font-family":"Georgia",
					"font-weight":"normal",
					"decimals": 2,
					"placement":"out",
					"font-color":"#000",
					'background-color': "transparent"
				}
			}
		};

		let colors = this.sqs.color.getColorScheme(config.series.length);
		let legendTextMaxLength = 15;
		for(let key in config.series) {
			config.series[key].backgroundColor = colors[key];
			if(config.series[key]["text"] != null && config.series[key]["text"].length > legendTextMaxLength) {
				config.series[key]["legend-text"] = config.series[key]["text"].substr(0, legendTextMaxLength)+"...";
			}
		}

		let rows = chartSeries.length;
		if(rows > 6) {
			rows = 6;
		}
		config.legend = {
			"highlight-plot":true,
			"draggable":true,
			"max-items":6,
			"overflow":"scroll",
			"drag-handler":"icon",
			"icon":{
				"line-color":"red"
			},
			"layout":rows+"x1", //row x column
			"toggle-action":"remove"
		};

		/*
		let zc = this.getFromGraphRegistry(renderIntoNode);
		if(zc !== false) { //Update existing chart
			zingchart.exec(renderIntoNode.substr(1), 'setdata', {
				"data": config
			});
		}
		else { //Create new chart
			zc = zingchart.render({
				id : renderIntoNode.substr(1),
				data : config,
				height: "100%"
			});
			this.pushIntoGraphRegistry(zc, renderIntoNode);
		}
		*/

		let zc = zingchart.render({
			id : renderIntoNode.substring(1),
			data : config,
			height: "100%"
		});

		this.pushIntoGraphRegistry({
			anchor: renderIntoNode.substring(1),
			graph: zc,
			data: config
		});

		/*
		zc.bind("click", (evt) => {
			let startIndex = evt.targetid.indexOf("-plot-") + 6;
			let plot = evt.targetid.substring(startIndex, startIndex+1);

			let facet = this.sqs.facetManager.getFacetByName("sites");
			if(facet === false) {
				facet = this.sqs.facetManager.spawnFacet("sites", [...config.series[plot].sites]);
			}
			else {
				facet.setSelections([...config.series[plot].sites]);
			}


			let iv = setInterval(() => {
				if(facet.isDataLoaded) {
					facet.minimize();
					clearInterval(iv);
				}
			}, 100);
		});
		*/

		return zc;
	}

	getFromGraphRegistry(anchorNodeName) {
		for(let k in this.graphs) {
			if(this.graphs[k].anchor == anchorNodeName) {
				return this.graphs[k];
			}
		}
		return false;
	}

	pushIntoGraphRegistry(graphObject) {
		this.graphs.push(graphObject);
	}

	removeFromGraphRegistry(anchorNodeName) {
		for(let k in this.graphs) {
			if(this.graphs[k].anchor == anchorNodeName) {
				this.graphs.splice(k, 1);
				return true;
			}
		}
		return false;
	}

	async fetchSiteData(siteIds, dbView, requestId) {
		if(siteIds.length == 0) {
			console.log("No sites");
		}

		let queries = [];
		let itemsLeft = siteIds.length;

		let queryString = "(";
		for(let key in siteIds) {
			queryString += "site_id.eq."+siteIds[key]+",";
			if(queryString.length > 1024 && itemsLeft > 1) { //HTTP specs says max 2048
				queryString = queryString.substr(0, queryString.length-1);
				queryString += ")";
				queries.push(queryString);
				queryString = "(";
			}
			itemsLeft--;
		}
		queryString = queryString.substr(0, queryString.length-1);
		queryString += ")";
		queries.push(queryString);

		let queryData = [];
		for(let key in queries) {
			let requestString = this.sqs.config.siteReportServerAddress+"/"+dbView;
			if(siteIds.length > 0) {
				requestString += "?or="+queries[key];
			}
			
			let result = await $.ajax(requestString, {
				method: "get",
				dataType: "json",
				success: (data) => {
				}
			});
			for(let i in result) {
				queryData.push(result[i]);
			}
		}
		return {
			requestId: requestId,
			data: queryData
		};
	}

	selectRenderCategories() {
		var renderCategories = ["analysis_entities", "site_link", "site_link_filtered", "sitename"];
		
		return renderCategories;
	}
	
	async unrender() {
		return new Promise((resolve) => {
			let promises = [];
			this.modules.forEach(module => {
				if(module.module != null && typeof module.module.unrender == "function") {
					promises.push(module.module.unrender());
				}
			});

			Promise.all(promises).then(() => {
				this.cleanupPlotlyChartsInContainer("#result-mosaic-container");
				this.plotlyLayoutRegistry.clear();
				this.sqs.sqsEventUnlisten("layoutResize", this);
				this.sqs.sqsEventUnlisten("layoutResize", this.responsiveLayoutEventOwner);
				clearTimeout(this.responsiveLayoutResizeTimeout);
				$(window).off("resize.mosaicGrid");
				this.tileLayout = [];

				console.log("Unrendered all modules, clearing container");
				$("#result-mosaic-container").html("");
				resolve();
			});
		});
	}

	exportSettings() {
		return {};
	}
	
	importSettings(settings) {
	}
	
}

export { ResultMosaic as default }
