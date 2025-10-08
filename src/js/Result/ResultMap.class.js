//import * as d3 from 'd3';
//import Config from '../../config/config.js'
import ResultModule from './ResultModule.class.js'
import TimelineFacet from '../TimelineFacet.class.js';
import SqsMenu from '../SqsMenu.class';

/*OpenLayers imports*/
import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer, Heatmap as HeatmapLayer, Image as ImageLayer, Group as GroupLayer } from 'ol/layer';
import { StadiaMaps, ImageArcGISRest, OSM, TileWMS } from 'ol/source';
import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import { Cluster as ClusterSource, Vector as VectorSource } from 'ol/source';
import { fromLonLat } from 'ol/proj.js';
import { Select as SelectInteraction } from 'ol/interaction';
import { Circle as CircleStyle, Fill, Stroke, Style, Text} from 'ol/style.js';
import { Attribution, Zoom } from 'ol/control';
import XYZ from 'ol/source/XYZ';
import Config from '../../config/config.json';
import ResultMapLayers from './ResultMap/ResultMapLayers.class.js';


/*
* Class: ResultMap
* 
* Map is rendered one of 3 cases:
* 1. Through renderVisibleDataLayers when importResultData is called (which in turn is called upon xhr success of fetchData)
*	Chain looks like this: render() => fetchData() => importResultData() => renderMap()
*																		 => renderVisibleDataLayers()
* 2. importSettings() => setMapDataLayer() => renderCallback()
* 3. resultMapBaseLayersControlssqsMenu() => makeMapControlMenuCallback() => setMapDataLayer()
* 
*/
class ResultMap extends ResultModule {
	/*
	* Function: constructor
	*/
	constructor(resultManager, renderIntoNode = "#result-map-container", includeTimeline = true) {
		super(resultManager);
		this.sqs = this.resultManager.sqs;
		this.renderIntoNode = renderIntoNode;
		this.includeTimeline = includeTimeline;
		this.auxLayersInitialized = false;
		this.resultMapLayers = new ResultMapLayers(this.sqs);

		$(this.renderIntoNode).append("<div class='result-map-render-container'></div>");
		$(this.renderIntoNode).append(`<div class='result-map-legend-container'>
			<h4>Legend</h4>
			<div class='result-map-legend-content'></div>
			</div>`);

		//$(".result-map-render-container", this.renderIntoNode).css("height", "100%");

		this.renderMapIntoNode = $(".result-map-render-container", renderIntoNode)[0];
		
		this.olMap = null;
		this.name = "map";
		this.prettyName = "Geographic";
		this.icon = "<i class=\"fa fa-globe\" aria-hidden=\"true\"></i>";
        this.currentZoomLevel = 4;
		this.selectPopupOverlay = null;
		this.selectInteraction = null;
		this.timeline = null;
		this.layers = [];
		this.defaultExtent = [-9240982.715065815, -753638.6533165146, 11461833.521917604, 19264301.810231723];

		$(window).on("seadResultMenuSelection", (event, data) => {
			if(data.selection != this.name) {
				$("#result-map-container").hide();
			}
			else {
				$("#result-map-container").show();
			}
		});

		//These attributes are used to set the style of map points
		this.style = {
			default: {
				fillColor: this.resultManager.sqs.color.getColorScheme(20, 0.5)[13],
				strokeColor: "#fff",
				textColor: "#fff",
			},
			selected: {
				fillColor: this.resultManager.sqs.color.getColorScheme(20, 1.0)[14],
				strokeColor: "#fff",
				textColor: "#fff",
			},
			highlighted: {
				fillColor: "#f60",
				textColor: "#000",
				strokeColor: "#fff"
			}
		}

		this.layers = this.resultMapLayers.initBaseLayers();

		this.initializeDataLayers();

		//Set up viewport resize event handlers
		this.resultManager.sqs.sqsEventListen("layoutResize", () => this.resizeCallback());
		$(window).on("resize", () => this.resizeCallback());
		this.resultManager.sqs.sqsEventListen("siteReportClosed", () => this.resizeCallback());
	}

	updateLegend() {
		// Clear the current legend content
		$(".result-map-legend-content", this.renderIntoNode).html("");
		
		// Get all visible layers from the unified layers array
		const visibleLayers = this.layers.filter(layer => layer.getVisible());
		
		// If no visible layers at all, hide the legend
		if (visibleLayers.length === 0) {
			this.hideLegend();
			return;
		}
		
		// Create a single container for all legend items
		const allLegendItems = $(`
			<div class="result-map-legend-items sortable-legend"></div>
		`);
		
		// Sort layers by z-index (higher z-index = appears first/on top)
		visibleLayers.sort((a, b) => {
			const zIndexA = typeof a.getZIndex === 'function' ? (a.getZIndex() || 0) : 0;
			const zIndexB = typeof b.getZIndex === 'function' ? (b.getZIndex() || 0) : 0;
			return zIndexB - zIndexA; // Sort in descending order (higher z-index first)
		});
		
		// Process layers in z-index order
		visibleLayers.forEach(layer => {
			const props = layer.getProperties();
			const layerType = props.type;
			const groupName = props.group || "Other";
			
			if (layerType === "dataLayer") {
				// Add data layer with expandable legend item
				const legendItem = this.createLegendItem({
					layerId: props.layerId,
					layerType: "data",
					title: props.title,
					subtitle: "[Data]",
					zIndex: layer.getZIndex() || 0,
					canClose: true,
					canExpand: true
				});
				allLegendItems.append(legendItem);
			} 
			else if (layerType === "baseLayer") {
				// Add base layer
				const visibleBaseLayers = this.layers.filter(l => l.getProperties().type === "baseLayer" && l.getVisible());
				const isLastBaseLayer = visibleBaseLayers.length === 1;
				
				const legendItem = this.createLegendItem({
					layerId: props.layerId,
					layerType: "base",
					title: props.title,
					subtitle: "[Base]",
					zIndex: layer.getZIndex() || 0,
					canClose: !isLastBaseLayer,
					canExpand: true
				});
				allLegendItems.append(legendItem);
			}
			else if (layerType === "auxLayer") {
				console.log("Adding aux layer to legend:", props.title);
				// Add auxiliary layer - each layer is now a first-class object
				const legendItem = this.createLegendItem({
					layerId: props.layerId,
					layerType: "aux",
					layerGroup: groupName,
					title: props.title,
					subtitle: `[${groupName}]`,
					zIndex: layer.getZIndex() || 0,
					canClose: true,
					canExpand: true
				});
				allLegendItems.append(legendItem);
			}
		});
		
		// Add the unified legend items to the legend content
		$(".result-map-legend-content", this.renderIntoNode).append(allLegendItems);
		
		// Show the legend
		this.showLegend();

		// Bind event handlers after adding to DOM
		this.bindLegendEventHandlers();

		this.makeLegendSortable();

		// Update aux layer zoom indicators after legend is built
		if (this.olMap) {
			this.updateAuxLayerZoomIndicators();
		}
	}

	createLegendItem(options) {
		const {
			layerId,
			layerType,
			layerGroup = null,
			title,
			subtitle,
			zIndex,
			canClose = true,
			canExpand = true
		} = options;

		const dataAttributes = [
			`data-layer-id="${layerId}"`,
			`data-layer-type="${layerType}"`,
			`data-z-index="${zIndex}"`,
			layerGroup ? `data-layer-group="${layerGroup}"` : ''
		].filter(Boolean).join(' ');

		// Add zoom indicator for aux layers
		const zoomIndicator = layerType === 'aux' ? 
			'<div class="layer-zoom-indicator zoom-visible" title="Layer visibility depends on zoom level"><i class="fa fa-search" aria-hidden="true"></i></div>' : '';

		return $(`
			<div class="result-map-legend-item" ${dataAttributes}>
				<div class="result-map-legend-item-header">
					<div class="result-map-legend-item-expand-control">
						${canExpand ? '<div class="legend-item-expand" title="Expand/Collapse"><i class="fa fa-chevron-down" aria-hidden="true"></i></div>' : ''}
					</div>
					<div class="result-map-legend-item-info">
						<div class="result-map-legend-sublayer-title">${title}</div>
						<div class="result-map-legend-layer-type">${subtitle}</div>
					</div>
					<div class="result-map-legend-item-controls">
						${zoomIndicator}
						<div class="result-map-legend-item-close-control">
							${canClose ? '<div class="legend-item-close" title="Remove layer"><i class="fa fa-times" aria-hidden="true"></i></div>' : ''}
						</div>
					</div>
				</div>
				<div class="result-map-legend-item-content" style="display: none;">
					<div class="legend-content-placeholder">
						Layer details will appear here...
					</div>
				</div>
			</div>
		`);
	}

	bindLegendEventHandlers() {

		// Handle zoom indicator clicks for aux layers
		$(".layer-zoom-indicator", this.renderIntoNode).off("click").on("click", (evt) => {
			evt.stopPropagation();
			const $legendItem = $(evt.target).closest(".result-map-legend-item");
			const layerId = $legendItem.attr("data-layer-id");
			const layer = this.layers.find(l => l.getProperties().layerId === layerId);
			
			if (!layer || !this.olMap) return;
			
			const props = layer.getProperties();
			const maxScaleDenominator = props.maxScaleDenominator;
			
			if (maxScaleDenominator && $(evt.target).closest(".layer-zoom-indicator").hasClass("zoom-hidden")) {
				// Calculate required zoom level to make layer visible
				const metersPerUnit = this.olMap.getView().getProjection().getMetersPerUnit();
				const requiredResolution = maxScaleDenominator / (metersPerUnit * (96 / 0.0254));
				const targetZoom = this.olMap.getView().getZoomForResolution(requiredResolution) + 0.5; // Add small buffer
				
				// Animate to the appropriate zoom level
				this.olMap.getView().animate({
					zoom: Math.max(targetZoom, this.olMap.getView().getMinZoom()),
					duration: 500
				});
			}
		});

		// Handle expand/collapse buttons
		$(".legend-item-expand").off("click").on("click", (evt) => {
			evt.stopPropagation();
			const parentEl = $(evt.target).closest(".result-map-legend-item");
			const content = parentEl.find(".result-map-legend-item-content");
			const icon = $(evt.target).closest(".legend-item-expand").find("i");

			if (content.is(":visible")) {
				// Collapse
				content.slideUp();
				icon.removeClass("fa-chevron-up").addClass("fa-chevron-down");
			} else {
				// Expand
				content.slideDown();
				icon.removeClass("fa-chevron-down").addClass("fa-chevron-up");
				// Load content when expanded
				this.loadLegendContent(parentEl);
			}
		});

		// Handle close buttons
		$(".legend-item-close").off("click").on("click", (evt) => {
			evt.stopPropagation(); // Prevent event bubbling
			const parentEl = $(evt.target).closest(".result-map-legend-item");
			const layerId = parentEl.attr("data-layer-id");

			// Find the layer in the unified layers array
			const layer = this.layers.find(l => l.getProperties().layerId === layerId);
			if (!layer) {
				console.warn("Layer not found for removal:", layerId);
				return;
			}

			const layerType = layer.getProperties().type;

			switch(layerType) {
				case "baseLayer":
					// Check if it's the last base layer
					const visibleBaseLayers = this.layers.filter(l => 
						l.getProperties().type === "baseLayer" && l.getVisible());
					if (visibleBaseLayers.length <= 1) {
						console.log("Cannot remove the last base layer");
						return;
					}
					layer.setVisible(false);
					break;
					
				case "dataLayer":
					console.log("Deselecting data layer");
					this.setMapDataLayer("none");
					break;
					
				case "auxLayer":
					console.log("Deselecting auxiliary layer");
					let layerId = layer.getProperties().layerId;
					this.hideMapAuxLayer(layerId);
					break;
			}

			// Update the legend after changes
			this.updateLegend();
		});
	}

	loadLegendContent(legendItem) {
		const content = legendItem.find(".result-map-legend-item-content");
		const layerId = legendItem.attr("data-layer-id");
		const layerType = legendItem.attr("data-layer-type");
		
		// Check if content is already loaded
		if (content.find(".legend-content-loaded").length > 0) {
			return;
		}
		
		// Show loading state
		content.html(`
			<div class="legend-content-loading">
				<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Loading legend...
			</div>
		`);
		
		// Find the layer in the unified array
		const layer = this.layers.find(l => l.getProperties().layerId === layerId);
		
		// Simulate loading delay and then show content based on layer type
		setTimeout(() => {
			let legendContent = '';
			
			switch(layerType) {
				case 'data':
					legendContent = `
						<div class="legend-content-loaded">
							<h5>Legend</h5>
							<div class="legend-symbols">
								<div class="legend-symbol-row">
									<div class="legend-symbol" style="background-color: ${this.style.default.fillColor}; width: 12px; height: 12px; border-radius: 50%; display: inline-block;"></div>
									<span>Site location</span>
								</div>
								<div class="legend-symbol-row">
									<div class="legend-symbol" style="background-color: ${this.style.selected.fillColor}; width: 12px; height: 12px; border-radius: 50%; display: inline-block;"></div>
									<span>Selected site</span>
								</div>
							</div>
						</div>
					`;
					break;
					
				case 'base':
					legendContent = `
						<div class="legend-content-loaded">
							<h5>Base</h5>
							<p>This is the background map layer providing geographical context.</p>
						</div>
					`;
					break;
					
				case 'aux':
					const layerProps = layer ? layer.getProperties() : {};
					legendContent = `
						<div class="legend-content-loaded">
							<h5>Legend</h5>
							${layerProps.legendUrl ? 
								`<img src="${layerProps.legendUrl}" alt="Layer legend" style="max-width: 100%; height: auto;" onerror="this.style.display='none';">` : 
								'<p><em>No legend image available</em></p>'
							}
						</div>
					`;
					break;
					
				default:
					legendContent = `
						<div class="legend-content-loaded">
							<p>Legend information for this layer type is not available.</p>
						</div>
					`;
			}
			
			content.html(legendContent);
		}, 500); // Simulate 500ms loading time
	}


	makeLegendSortable() {
		// Make the legend items sortable
		let container = $(".sortable-legend", this.renderIntoNode);
		
		// Flag to prevent automatic reordering during programmatic updates
		this.isUserSorting = false;
		
		container.sortable({
			items: ".result-map-legend-item",
			placeholder: "result-map-legend-item-placeholder",
			helper: function(e, item) {
				// Create clone with exact dimensions
				const helper = item.clone();
				helper.css({
					'width': item.outerWidth() + 'px',
					'height': item.outerHeight() + 'px'
				});
				return helper;
			},
			start: (e, ui) => {
				// Flag that user is actively sorting
				this.isUserSorting = true;
				
				// Store original dimensions
				const width = ui.item.outerWidth();
				const height = ui.item.outerHeight();
				
				// Set placeholder to exact dimensions
				ui.placeholder.css({
					'width': width + 'px',
					'height': height + 'px'
				});
				
				// Preserve original item's size
				ui.item.data('original-size', {
					width: width,
					height: height
				});
				
				// Temporarily fix original item size to prevent container collapse
				ui.item.css({
					'width': width + 'px',
					'height': height + 'px'
				});
			},
			stop: (e, ui) => {
				// Restore original item's flexibility
				ui.item.css({
					'width': '',
					'height': ''
				});
			},
			update: (event, ui) => {
				// Only reorder if this is a user-initiated sort, not a programmatic update
				if (!this.isUserSorting) {
					console.log("Skipping automatic reorder - not user initiated");
					return;
				}
				
				console.log("User reordered layers - applying custom order");
				
				// Get the new order from the legend (ignore hierarchy for user sorting)
				const newOrder = [];
				$(".sortable-legend .result-map-legend-item").each(function() {
					const layerId = $(this).data("layer-id");
					newOrder.push(layerId);
				});
				
				// Apply z-indexes based on legend order (user override)
				newOrder.forEach((layerId, index) => {
					const layer = this.layers.find(l => l.getProperties().layerId === layerId);
					if (layer) {
						const zIndex = 1000 - index; // Top item gets highest z-index
						layer.setZIndex(zIndex);
					}
				});
				
				console.log("User-defined layer order applied:");
				newOrder.forEach((layerId, index) => {
					const layer = this.layers.find(l => l.getProperties().layerId === layerId);
					if (layer) {
						const props = layer.getProperties();
						console.log(`${index + 1}. [${props.type}] ${props.title} - zIndex: ${1000 - index}`);
					}
				});
				
				// Sync the map layer order
				this.syncLayersToZIndex();
				
				// Reset flag
				this.isUserSorting = false;
			}
		});
	}

	getLayerById(layerId) {
		let layer = this.layers.find(l => l.getProperties().layerId === layerId);
		return layer;
	}



	/**
	 * Gets all layers sorted by hierarchy rules and current legend order
	 * Returns layers in order from top to bottom (highest z-index to lowest)
	 */
	getSortedLayersByHierarchy() {
		// Get visible layers and group by type
		const layersByType = {
			dataLayer: [],
			auxLayer: [],
			baseLayer: []
		};
		
		this.layers.filter(layer => layer.getVisible()).forEach(layer => {
			const layerType = layer.getProperties().type;
			if (layersByType[layerType]) {
				layersByType[layerType].push(layer);
			}
		});
		
		// Sort each group by current z-index (preserves user sorting within groups)
		Object.keys(layersByType).forEach(type => {
			layersByType[type].sort((a, b) => {
				const zIndexA = typeof a.getZIndex === 'function' ? (a.getZIndex() || 0) : 0;
				const zIndexB = typeof b.getZIndex === 'function' ? (b.getZIndex() || 0) : 0;
				return zIndexB - zIndexA; // Descending order (higher z-index first)
			});
		});
		
		// Combine groups in hierarchy order: data -> aux -> base
		return [
			...layersByType.dataLayer,
			...layersByType.auxLayer,
			...layersByType.baseLayer
		];
	}

	/**
	 * Recalculates z-indexes for all layers based on hierarchy and current order
	 * Rules: dataLayer (top) > auxLayer (middle) > baseLayer (bottom)
	 * Within each group, layers maintain their relative order from the legend
	 */
	updateAllLayerZIndexes() {
		// Get all layers sorted by hierarchy and current order
		const allLayers = this.getSortedLayersByHierarchy();
		
		// Assign z-indexes counting down from 1000
		allLayers.forEach((layer, index) => {
			const newZIndex = 1000 - index;
			layer.setZIndex(newZIndex);
		});
		
		/*
		console.log("All layer z-indexes updated:");
		allLayers.forEach((layer, index) => {
			const props = layer.getProperties();
			console.log(`${index + 1}. [${props.type}] ${props.title} - zIndex: ${1000 - index}`);
		});
		*/
	}

	/**
	 * Checks if an aux layer is visible at the current zoom level
	 * Uses maxScaleDenominator property to determine visibility
	 */
	isAuxLayerVisibleAtCurrentZoom(layer) {
		if (!this.olMap || layer.getProperties().type !== "auxLayer") {
			return true; // Non-aux layers or no map - assume visible
		}

		const props = layer.getProperties();
		const maxScaleDenominator = props.maxScaleDenominator;
		
		if (!maxScaleDenominator) {
			return true; // No scale constraint - always visible
		}

		const currentResolution = this.olMap.getView().getResolution();
		const metersPerUnit = this.olMap.getView().getProjection().getMetersPerUnit();
		const currentScaleDenominator = currentResolution * metersPerUnit * (96 / 0.0254); // 96 DPI standard

		// Layer is visible if current scale is smaller than max scale (more zoomed in)
		return currentScaleDenominator <= maxScaleDenominator;
	}

	/**
	 * Updates zoom visibility indicators for all aux layers in the legend
	 */
	updateAuxLayerZoomIndicators() {
		// Update each aux layer legend item
		$(".result-map-legend-item[data-layer-type='aux']", this.renderIntoNode).each((index, element) => {
			const $legendItem = $(element);
			const layerId = $legendItem.attr("data-layer-id");
			const layer = this.layers.find(l => l.getProperties().layerId === layerId);
			
			if (!layer) return;

			const isVisibleAtZoom = this.isAuxLayerVisibleAtCurrentZoom(layer);
			const $zoomIndicator = $legendItem.find(".layer-zoom-indicator");
			
			const props = layer.getProperties();
			const maxScaleDenominator = props.maxScaleDenominator;

			if (isVisibleAtZoom) {
				$zoomIndicator.removeClass("zoom-hidden").addClass("zoom-visible");
				$zoomIndicator.attr("title", "Layer is visible at current zoom level");
				$legendItem.removeClass("layer-zoom-limited");
			} else {
				$zoomIndicator.removeClass("zoom-visible").addClass("zoom-hidden");
				if (maxScaleDenominator) {
					const currentRes = this.olMap.getView().getResolution();
					const metersPerUnit = this.olMap.getView().getProjection().getMetersPerUnit();
					const currentScale = Math.round(currentRes * metersPerUnit * (96 / 0.0254));
					$zoomIndicator.attr("title", `Zoom in further to see this layer (current scale: 1:${currentScale.toLocaleString()}, max scale: 1:${maxScaleDenominator.toLocaleString()}). Click to zoom.`);
				} else {
					$zoomIndicator.attr("title", "Zoom in further to see this layer. Click to zoom.");
				}
				$legendItem.addClass("layer-zoom-limited");
			}
		});
	}

	hideLegend() {
		$(".result-map-legend-container", this.renderIntoNode).hide();
	}

	showLegend() {
		$(".result-map-legend-container", this.renderIntoNode).show();
	}

	getSelectedSites() {
		return this.data.map((site) => {
			return site.id
		});
	}

	isVisible() {
		return true;
	}

	renderExportButton() {
		if($("#result-map-container .result-export-button").length > 0) {
			return;
		}
		let exportButton = $("<div></div>").addClass("result-export-button").html("<i class='fa fa-download' aria-hidden='true'></i>&nbsp;Export");
		
		$("#result-map-container").append(exportButton);
		this.bindExportModuleDataToButton(exportButton, this);
	}

	/*
	* Function: render
	*
	* Called from outside. Its the command from sqs to render the contents of this module. Will fetch data and then import & render it.
	*/
	render(fetch = true) {
		super.render();
		this.fetchData().then((data, textStatus, xhr) => { //success
			if(this.active) {
				this.renderInterfaceControls();
			}
		}).catch((xhr, textStatus, errorThrown) => { //error
			console.log("Error fetching data for result map:", xhr, textStatus, errorThrown);
		});
	}

	setActive(active) {
		super.setActive(active);

		if(!active) {
			$(this.renderIntoNode).hide();
		}
		else {
			$(this.renderIntoNode).show();
		}
	}

	/*
	* Function: fetchData
	*/
	async fetchData() {
		if(this.resultManager.getResultDataFetchingSuspended()) {
			return false;
		}
		
		var reqData = this.resultManager.getRequestData(++this.requestId, "map");

		this.resultManager.showLoadingIndicator(true);
		return $.ajax(Config.serverAddress+"/api/result/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: (respData, textStatus, jqXHR) => {
				//Only load this data if it matches the last request id dispatched. Otherwise it's old data.
				if(respData.RequestId == this.requestId && this.active) {
					this.importResultData(respData);
					this.renderMap();
					this.renderVisibleDataLayers();
					this.resultManager.sqs.sqsEventDispatch("resultModuleRenderComplete");
					this.resultManager.showLoadingIndicator(false);
				}
				else {
					console.log("WARN: ResultMap discarding old result package data ("+respData.RequestId+"/"+this.requestId+").");
				}
			},
			error: (respData, textStatus, jqXHR) => {
				this.resultManager.showLoadingIndicator(false, true);
			}
		});
	}

	/*
	* Function: importResultData
	*
	* Imports result data and then renders it.
	*/
	importResultData(data, renderMap = true) {
		this.sql = data.Query;
		this.data = [];
		var keyMap = {};

		for(var key in data.Meta.Columns) {
			if(data.Meta.Columns[key].FieldKey == "category_id") {
				keyMap.id = parseInt(key);
			}
			if(data.Meta.Columns[key].FieldKey == "category_name") {
				keyMap.title = parseInt(key);
			}
			if(data.Meta.Columns[key].FieldKey == "latitude_dd") {
				keyMap.lat = parseInt(key);
			}
			if(data.Meta.Columns[key].FieldKey == "longitude_dd") {
				keyMap.lng = parseInt(key);
			}
		}
		
		for(var key in data.Data.DataCollection) {
			var dataItem = {};
			dataItem.id = data.Data.DataCollection[key][keyMap.id];
			dataItem.title = data.Data.DataCollection[key][keyMap.title];
			dataItem.lng = data.Data.DataCollection[key][keyMap.lng];
			dataItem.lat = data.Data.DataCollection[key][keyMap.lat];
			
			this.data.push(dataItem);
		}

		this.renderData = JSON.parse(JSON.stringify(this.data)); //Make a copy
		this.renderData = this.resultManager.sqs.sqsOffer("resultMapData", {
			data: this.renderData
		}).data;
	}

	async update() {
		await this.fetchData();
	}

	/*
	* Function: setContainerFixedSize
	*
	* Sets fixed size of the openlayers container. This is needed in order for the map to render properly, but it's bad for a responsive design so we switch between fixed/flexible as the viewport is resized.
	*
	* See also:
	*  - setContainerFlexibleSize
	*/
	setContainerFixedSize() {
		let containerWidth = $(this.renderMapIntoNode).width();
		let containerHeight = $(this.renderMapIntoNode).height();
		$(this.renderMapIntoNode).css("width", containerWidth+"px");
		$(this.renderMapIntoNode).css("height", containerHeight+"px");
	}

	/*
	* Function: setContainerFlexibleSize
	*
	* Sets flexible size of the openlayers container.
	* 
	* See also:
	*  - setContainerFixedSize
	*/
	setContainerFlexibleSize() {
		$(this.renderMapIntoNode).css("width", "100%");
		$(this.renderMapIntoNode).css("height", "80%");
	}

	/*
	* Function: renderMap
	*
	* Parameters:
	* removeAllDataLayers
	*/
	renderMap(removeAllDataLayers = true) {
		let filteredData = []; //Filter out points which contrain zero/null coordinates
		for(let key in this.data) {
			if(this.data[key].lat != 0 && this.data[key].lng != 0) {
				filteredData.push(this.data[key]);
			}
		}
		
		$(this.renderIntoNode).show();
		
		if(this.olMap == null) {
			$(this.renderMapIntoNode).html("");

			//create attribution and set its position to bottom left
			const attribution = new Attribution({
				collapsible: false,
				collapsed: false,
			});

			//create zoom control with slider
			const zoomControl = new Zoom({
				className: 'ol-zoom',
				zoomInLabel: '+',
				zoomOutLabel: '−',
				zoomInTipLabel: 'Zoom in',
				zoomOutTipLabel: 'Zoom out'
			});

			this.olMap = new Map({
				target: this.renderMapIntoNode,
				attribution: true,
				controls: [attribution, zoomControl], //Add attribution and zoom controls
				layers: this.layers,
				view: new View({
					center: fromLonLat([12.41, 48.82]),
					zoom: this.currentZoomLevel,
					minZoom: 2
				}),
				loadTilesWhileInteracting: true,
				loadTilesWhileAnimating: true
			});

			this.resultMapLayers.initAuxLayers().then((layers) => {
				this.layers = this.layers.concat(layers);
				this.layers.forEach((layer, index, array) => {
					//check that this layer has not already been added
					let layerExists = false;

					if(!this.olMap) {
						console.warn("olMap not initialized yet, cannot add layers");
						return;
					}

					this.olMap.getLayers().forEach((existingLayer, index, array) => {
						if(existingLayer.getProperties().layerId == layer.getProperties().layerId) {
							layerExists = true;
						}
					});

					if(!layerExists) {
						// Set visibility based on layer type BEFORE adding to map
						const layerProps = layer.getProperties();
						if(layerProps.type === "auxLayer") {
							layer.setVisible(false);
						}
						
						// Add layer to map
						this.olMap.addLayer(layer);
						
						// Recalculate ALL layer z-indexes using unified system
						this.updateAllLayerZIndexes();
					}
				});

				this.auxLayersInitialized = true;
			});

			this.olMap.on("moveend", () => {
				var newZoomLevel = this.olMap.getView().getZoom();
				if (newZoomLevel != this.currentZoomLevel) {
					this.currentZoomLevel = newZoomLevel;
					
					// Update aux layer zoom indicators when zoom changes
					this.updateAuxLayerZoomIndicators();
				}
			});
		}
		else {
			this.olMap.updateSize();
		}

		/*
		if(removeAllDataLayers) {
			this.removeAllDataLayers();
		}
		*/

		let latHigh = this.resultManager.sqs.getExtremePropertyInList(filteredData, "lat", "high");
		let latLow = this.resultManager.sqs.getExtremePropertyInList(filteredData, "lat", "low");
		let lngHigh = this.resultManager.sqs.getExtremePropertyInList(filteredData, "lng", "high");
		let lngLow = this.resultManager.sqs.getExtremePropertyInList(filteredData, "lng", "low");

		let extentNW = null;
		let extentSE = null;
		let extent = null;
		if(latHigh === false || latLow === false || lngHigh === false || lngLow === false) {
			extent = this.defaultExtent;
		}
		else {
			extentNW = fromLonLat([lngLow.lng, latLow.lat]);
			extentSE = fromLonLat([lngHigh.lng, latHigh.lat]);

			extent = extentNW.concat(extentSE);
		}

		this.olMap.getView().fit(extent, {
			padding: [20, 20, 20, 20],
			maxZoom: 10,
			duration: 500
		});

		//NOTE: This can not be pre-defined in HTML since the DOM object itself is removed along with the overlay it's attached to when the map is destroyed.
		let popup = $("<div></div>");
		popup.attr("id", "map-popup-container");
		let table = $("<table></table>").attr("id", "map-popup-sites-table").append("<tbody></tbody>").appendTo(popup);
		$("#result-container").append(popup);

		$("#result-container").append("<div id='tutorial-map-targeting-box'></div>");
		$("#result-container").append("<div id='tutorial-map-targeting-box-upper-left'></div>");

		if(this.selectInteraction != null) {
			this.olMap.removeInteraction(this.selectInteraction);
		}

		this.selectInteraction = this.createSelectInteraction();
		this.olMap.addInteraction(this.selectInteraction);
	}

	removeAllDataLayers() {
		this.layers.forEach((layer, index, array) => {
			if(layer.getProperties().type == "dataLayer" && layer.getVisible()) {
				this.removeLayer(layer.getProperties().layerId)
			}
		});
	}

	/*
	* Function: renderVisibleDataLayers
	*/
	renderVisibleBaseLayers() {
		this.layers.forEach((layer, index, array) => {
			if(layer.getProperties().type == "baseLayer" && layer.getVisible()) {
				layer.setVisible(false); //Set to invisible while rendering and then when the function below will call the render function it will be set to visible again
				this.removeLayer(layer.getProperties().layerId)
			}
		});
	}

	/*
	* Function: renderVisibleDataLayers
	*/
	renderVisibleDataLayers() {
		this.layers.forEach((layer, index, array) => {
			if(layer.getProperties().type == "dataLayer" && layer.getVisible()) {
				layer.setVisible(false); //Set to invisible while rendering and then when the function below will call the render function it will be set to visible again
				this.setMapDataLayer(layer.getProperties().layerId);
			}
		});
	}

	removeLayer(layerId) {
		this.olMap.getLayers().forEach((layer, index, array)=> {
			if(typeof(layer) != "undefined" && layer.getProperties().layerId == layerId) {
				layer.setVisible(false); //set the layer to invisible first, because otherwise it might still show due to caching of layer tiles for the current zoom level
				this.olMap.removeLayer(layer);
			}
		});
	}
	
	/*
	* Function: renderInterface
	*/
	renderInterfaceControls() {
		if($("#result-map-controls-container").length == 0) {
			$(this.renderMapIntoNode).append("<div id='result-map-controls-container'></div>");
		}
		
		$("#result-map-controls-container").html("");

		let auxLayersHtml = "<div class='result-map-map-control-item-container'>";
		auxLayersHtml += "<div id='result-map-auxlayer-controls-menu' class='result-map-map-control-item'>Overlays</div>";
		auxLayersHtml += "<div id='result-map-auxlayer-controls-menu-anchor'></div>";
		auxLayersHtml += "</div>";
		$("#result-map-controls-container").append(auxLayersHtml);

		new SqsMenu(this.resultManager.sqs, this.resultMapAuxLayersControlsSqsMenu());


		// Instead of creating an SqsMenu, add a direct click handler
		/*
		$("#result-map-auxlayer-controls-menu").on("click", () => {
			this.renderAllAuxLayersPanel();
		});
		*/

		let baseLayersHtml = "<div class='result-map-map-control-item-container'>";
		baseLayersHtml += "<div id='result-map-baselayer-controls-menu' class='result-map-map-control-item'>Base layers</div>";
		baseLayersHtml += "<div id='result-map-baselayer-controls-menu-anchor'></div>";
		baseLayersHtml += "</div>";
		$("#result-map-controls-container").append(baseLayersHtml);
		new SqsMenu(this.resultManager.sqs, this.resultMapBaseLayersControlsSqsMenu());

		let dataLayersHtml = "<div class='result-map-map-control-item-container'>";
		dataLayersHtml += "<div id='result-map-datalayer-controls-menu' class='result-map-map-control-item'>Data layers</div>";
		dataLayersHtml += "<div id='result-map-datalayer-controls-menu-anchor'></div>";
		dataLayersHtml += "</div>";
		$("#result-map-controls-container").append(dataLayersHtml);
		new SqsMenu(this.resultManager.sqs, this.resultMapDataLayersControlsSqsMenu());

		if(this.sqs.config.showResultExportButton) {
			this.renderExportButton();
		}
	}

	unrenderAllAuxLayersPanel() {
		$("#result-map-sub-layer-selection-panel").remove();
	}

	renderAuxLayersPanel() {
		// Remove any existing panel
		this.unrenderAuxLayersPanel();

		// Create the panel container
		$(this.renderMapIntoNode).append("<div id='result-map-sub-layer-selection-panel'></div>");
		
		// Set fixed width to prevent shrinking when minimized
		$("#result-map-sub-layer-selection-panel").css({
			"width": "25em",
			"min-width": "25em"
		});

		const titleHtml = `
			<div class="sub-layer-header">
				<h3 class='aux-layer-title'>Overlay Layers</h3>
				<div class="sub-layer-header-buttons">
					<input class="header-text-search-input" type="text" />
					<div id="search-sublayer-panel" class="header-btn" title="Search layers">
						<i class="fa fa-search" aria-hidden="true"></i>
					</div>
					<div id="minimize-sublayer-panel" class="header-btn" title="Minimize panel">
						<i class="fa fa-window-minimize" aria-hidden="true"></i>
					</div>
					<div id="close-sublayer-panel" class="header-btn" title="Close panel">
						<i class="fa fa-times" aria-hidden="true"></i>
					</div>
				</div>
			</div>
		`;
		$("#result-map-sub-layer-selection-panel").append(titleHtml);
		$("#result-map-sub-layer-selection-panel").append("<div id='sub-layer-content'></div>");


		$("#result-map-sub-layer-selection-panel .header-text-search-input").on("change keyup paste", (evt) => {
			evt.stopPropagation();
			const searchTerm = $(evt.currentTarget).val().toLowerCase();

			$(".sub-layer-leaf").each((index, element) => {
				const layerTitle = $(element).find(".sub-layer-title").text().toLowerCase();
				if(layerTitle.includes(searchTerm)) {
					$(element).show();
				} else {
					$(element).hide();
				}
			});
		});

		$("#search-sublayer-panel").on("click", (evt) => {
			evt.stopPropagation();

			//toggle visibility of the search input
			$("#result-map-sub-layer-selection-panel .header-text-search-input").toggle();

			//if opened, focus the input
			if($("#result-map-sub-layer-selection-panel .header-text-search-input").is(":visible")) {
				$("#result-map-sub-layer-selection-panel .header-text-search-input").focus();
			}

			//if closed, it should also be cleared and all layers shown
			if(!$("#result-map-sub-layer-selection-panel .header-text-search-input").is(":visible")) {
				$("#result-map-sub-layer-selection-panel .header-text-search-input").val("");
				$(".sub-layer-leaf").show();
			}
		});

		$("#close-sublayer-panel").on("click", (evt) => {
			evt.stopPropagation();
			this.unrenderAuxLayersPanel();
		});

		$("#minimize-sublayer-panel").on("click", (evt) => {
			evt.stopPropagation();
			
			//toggle class .header-btn-active when clicked
			$("#minimize-sublayer-panel").toggleClass("header-btn-active");

			const panel = $("#result-map-sub-layer-selection-panel");
			const content = $("#sub-layer-content");
			const button = $("#minimize-sublayer-panel");
			const icon = button.find("i");
			
			if (content.is(":visible")) {
				// Minimize the panel
				content.hide();
				icon.removeClass("fa-minus").addClass("fa-plus");
				button.attr("title", "Expand panel");
				panel.addClass("minimized");
			} else {
				// Expand the panel
				content.show();
				icon.removeClass("fa-plus").addClass("fa-minus");
				button.attr("title", "Minimize panel");
				panel.removeClass("minimized");
			}
		});

		// Group layers by provider
		const groupedLayers = this.groupAuxLayersByProvider();
		
		let content = "<div class='result-map-sub-layer-selection'>";
		
		// Add each provider group
		for (const [provider, layers] of Object.entries(groupedLayers)) {
			if (layers.length > 0) {
				content += `<h5>${provider}</h5>`;
				content += `<ul class='sub-layer-list'>`;
				
				layers.forEach(layer => {
					const props = layer.getProperties();
					const isVisible = layer.getVisible();

					const checked = isVisible ? "checked" : "";
					let layerName = props.title;
					if (props.clarifyingName && props.clarifyingName.length > 0) {
						layerName = props.clarifyingName + " " + layerName;
					}
					content += `
					<li class="sub-layer-leaf">
						<label class="sub-layer-label">
							<input type="checkbox" class="aux-layer-checkbox" name="aux-layer" 
								value="${props.layerId}" ${checked} data-has-sublayers="false">
							<span class="sub-layer-title">${layerName}</span>
						</label>
					</li>`;
				});
				
				content += `</ul>`;
			}
		}
		
		content += "</div>";
		
		$("#sub-layer-content").append(content);

		$(".sub-layer-leaf").on("change", (evt) => {
			evt.stopPropagation(); //Prevent event bubbling
			const checkbox = $(evt.currentTarget).find("input.aux-layer-checkbox");
			const layerId = checkbox.val();

			if(checkbox.is(":checked")) {
				console.log("Showing aux layer:", layerId);
				this.setMapAuxLayer(layerId);
			}
			else {
				console.log("Hiding aux layer:", layerId);
				this.hideMapAuxLayer(layerId);
			}
		});

	}

	getSelectedAuxLayers() {
		const selectedLayers = [];
		this.layers.forEach(layer => {
			if (layer.getProperties().type !== "auxLayer") {
				return;
			}
			const props = layer.getProperties();
			if (layer.getVisible() && props.selectedSubLayers) {
				selectedLayers.push(...props.selectedSubLayers);
			}
		});
		return selectedLayers;
	}

	groupAuxLayersByProvider() {
		// Create a regular object instead of a Map
		const groups = {};
		
		this.layers.forEach(layer => {
			const props = layer.getProperties();

			if(!props.type || props.type !== "auxLayer") {
				return; // Only group aux layers
			}

			// Use the group property, or fallback to "Other" if not defined
			const groupName = props.group || "Other";
			
			// Initialize the group array if it doesn't exist yet
			if (!groups[groupName]) {
				groups[groupName] = [];
			}
			
			// Add this layer to its group
			groups[groupName].push(layer);
		});
		
		// Filter out empty groups (though we don't really need to)
		const result = {};
		for (const [key, value] of Object.entries(groups)) {
			if (value.length > 0) {
				result[key] = value;
			}
		}
		
		return result;
	}

	/*
	* Function: setMapBaseLayer
	*/
	setMapBaseLayer(baseLayerId) {
		if(baseLayerId == "arcticDem") {
			this.sqs.notificationManager.notify("ArcticDEM is a partial map only covering the northern arctic region.", "info", 5000);
		}

		let layer = this.layers.find(l => l.getProperties().layerId === baseLayerId);
		if(!layer) {
			console.warn("Base layer not found:", baseLayerId);
		}
		layer.setVisible(true);

		this.layers.forEach((layer, index, array) => {
			if(layer.getProperties().type == "baseLayer" && layer.getVisible() && layer.getProperties().layerId != baseLayerId) {
				layer.setVisible(false); //Set to invisible while rendering and then when the function below will call the render function it will be set to visible again
				this.removeLayer(layer.getProperties().layerId)
			}
		});

		this.syncLayersToZIndex()
	}

	setMapAuxLayer(auxLayerId) {
		let auxLayers = this.layers.filter(l => l.getProperties().type === "auxLayer");
		if(auxLayerId == "none") {
			console.log("Hiding all aux layers");
			auxLayers.forEach((layer, index, array) => {
				layer.setVisible(false);
			});
			this.unrenderAuxLayersPanel();
		}
		
		auxLayers.forEach(async (layer, index, array) => {
			if(layer.getProperties().layerId == auxLayerId) {
				console.log("Setting aux layer "+auxLayerId+" visible");
				layer.setVisible(true);
			}
		});

		// Recalculate ALL layer z-indexes using unified system
		this.updateAllLayerZIndexes();
		this.syncLayersToZIndex();
		
		// Update zoom indicators since aux layer visibility changed
		this.updateAuxLayerZoomIndicators();
	}

	hideMapAuxLayer(auxLayerId) {
		let auxLayers = this.layers.filter(l => l.getProperties().type === "auxLayer");
		auxLayers.forEach(async (layer, index, array) => {
			if(layer.getProperties().layerId == auxLayerId) {
				console.log("Setting aux layer "+auxLayerId+" invisible");
				layer.setVisible(false);
			}
		});

		this.syncLayersToZIndex();
		
		// Update zoom indicators since aux layer visibility changed
		this.updateAuxLayerZoomIndicators();

		//make sure the .sub-layer-leaf is unchecked in the aux layers panel if it's open
		$(`.aux-layer-checkbox[value='${auxLayerId}']`).prop("checked", false);
	}

	printOlMapLayers() {
		if(!this.olMap) {
			console.warn("No OL map to print layers from");
			return;
		}
		console.log("Current OL map layers:");
		this.olMap.getLayers().forEach((layer, index, array) => {
			console.log(layer.getProperties().layerId, layer.getVisible(), layer.getZIndex());
		});
		console.log("End of OL map layers");
	}

	unrenderAuxLayersPanel() {
		$("#result-map-sub-layer-selection-panel").remove();
	}

	syncLayersToZIndex() {
		// Get all layers that should be considered for ordering
		const allLayers = this.layers.filter(layer => layer.getVisible());

		// Sort layers by z-index (ascending order for OpenLayers)
		allLayers.sort((a, b) => {
			const zIndexA = typeof a.getZIndex === 'function' ? (a.getZIndex() || 0) : 0;
			const zIndexB = typeof b.getZIndex === 'function' ? (b.getZIndex() || 0) : 0;
			return zIndexA - zIndexB; // Ascending order for map rendering
		});

		// Update the OpenLayers map layer order
		if (this.olMap) {
			const layerGroup = this.olMap.getLayerGroup();
			const layerCollection = layerGroup.getLayers();
			
			// Clear the current layers
			layerCollection.clear();
			
			// Add layers back in the correct z-index order
			allLayers.forEach(layer => {
				layerCollection.push(layer);
			});
		}

		// Update the legend to reflect the new order
		this.updateLegend();
	}

	printLayerStackOrder() {

		let allLayers = this.layers.filter(layer => layer.getVisible());

		// Sort layers by z-index descending for display
		allLayers.sort((a, b) => {
			const zIndexA = typeof a.getZIndex === 'function' ? (a.getZIndex() || 0) : 0;
			const zIndexB = typeof b.getZIndex === 'function' ? (b.getZIndex() || 0) : 0;
			return zIndexB - zIndexA; // Descending order for display
		});

		console.log("=== Current Layer Stack Order (top to bottom) ===");
		allLayers.forEach((layer, index) => {
			const props = layer.getProperties();
			const zIndex = typeof layer.getZIndex === 'function' ? layer.getZIndex() : 0;
			console.log(`${index + 1}. [${props.type}] ${props.title} (${props.layerId}) - zIndex: ${zIndex}`);
		});
		console.log("==============================================");

	}

	setMapDataLayer(dataLayerId) {
		this.clearSelections();

		let dataLayers = this.layers.filter(l => l.getProperties().type === "dataLayer");

		dataLayers.forEach((layer, index, array) => {
			if(layer.getProperties().layerId == dataLayerId && layer.getVisible() == false) {
				layer.setVisible(true);
				console.log("Setting data layer "+dataLayerId+" visible");
				layer.getProperties().renderCallback(this);
			}
			if(layer.getProperties().layerId != dataLayerId && layer.getVisible() == true) {
				layer.setVisible(false);
			}
		});

		// Recalculate ALL layer z-indexes using unified system
		this.updateAllLayerZIndexes();
		this.syncLayersToZIndex();

		this.sqs.sqsEventDispatch("MAP_LAYER_VISIBILITY_CHANGED", { layerId: dataLayerId });
	}

	/*
	* Function: clearSelections
	*/
	clearSelections() {
		var interactions = this.olMap.getInteractions();
		interactions.forEach((interaction) => {
			var prop = interaction.getProperties();
			if(prop.selectInteraction) {
				interaction.getFeatures().clear();
				this.selectPopupOverlay.setPosition();
			}
		});
	}

	renderClusteredPointsLayer() {
		console.log("Rendering clustered points layer");

		const clusterLayer = this.getLayerById("clusterPoints");
		
		if (!clusterLayer) {
			console.error("Cluster layer not found - it should have been initialized");
			return;
		}
		
		// Get the data
		const timeFilteredData = this.data;
		const geojson = this.getDataAsGeoJSON(timeFilteredData);
		
		// Parse GeoJSON features
		const gf = new GeoJSON({
			featureProjection: "EPSG:3857"
		});
		const featurePoints = gf.readFeatures(geojson);
		
		// Update the source
		const clusterSource = clusterLayer.getSource();
		const vectorSource = clusterSource.getSource();
		
		// Clear existing features and add new ones
		vectorSource.clear();
		vectorSource.addFeatures(featurePoints);
		
		// Make sure the layer is visible
		clusterLayer.setVisible(true);
	}

	// Update the renderPointsLayer method
	renderPointsLayer() {
		console.log("Rendering points layer");
		
		// Find the points layer
		const pointsLayer = this.layers.find(layer => 
			layer.getProperties().layerId === "points");
		
		if (!pointsLayer) {
			console.error("Points layer not found - it should have been initialized");
			return;
		}
		
		// Get the data
		const timeFilteredData = this.data;
		const geojson = this.getDataAsGeoJSON(timeFilteredData);
		
		// Parse GeoJSON features
		const gf = new GeoJSON({
			featureProjection: "EPSG:3857"
		});
		const featurePoints = gf.readFeatures(geojson);
		
		// Update the source
		const clusterSource = pointsLayer.getSource();
		const vectorSource = clusterSource.getSource();
		
		// Clear existing features and add new ones
		vectorSource.clear();
		vectorSource.addFeatures(featurePoints);
		
		// Make sure the layer is visible
		pointsLayer.setVisible(true);
	}

	// Update the renderHeatmapLayer method
	renderHeatmapLayer() {
		console.log("Rendering heatmap layer");
		
		// Find the heatmap layer
		const heatmapLayer = this.layers.find(layer => 
			layer.getProperties().layerId === "heatmap");
		
		if (!heatmapLayer) {
			console.error("Heatmap layer not found - it should have been initialized");
			return;
		}
		
		// Get the data
		const timeFilteredData = this.data;
		const geojson = this.getDataAsGeoJSON(timeFilteredData);
		
		// Parse GeoJSON features
		const gf = new GeoJSON({
			featureProjection: "EPSG:3857"
		});
		const featurePoints = gf.readFeatures(geojson);
		
		// Update the source
		const source = heatmapLayer.getSource();
		
		// Clear existing features and add new ones
		source.clear();
		source.addFeatures(featurePoints);
		
		// Make sure the layer is visible
		heatmapLayer.setVisible(true);
	}

	// Add this method to initialize all data layers at map creation time
	initializeDataLayers() {
		console.log("Initializing data layers...");
		this.layers.push(this.initClusteredPointsLayer());
		this.layers.push(this.initPointsLayer());
		this.layers.push(this.initHeatmapLayer());
	}

	// Initialize the clustered points layer with empty source
	initClusteredPointsLayer() {
		console.log("Initializing clustered points layer");

		let layerConfig = new VectorLayer();
		layerConfig.setProperties({
			layerId: "clusterPoints",
			title: "Clustered sites",
			type: "dataLayer",
			renderCallback: () => {
				this.renderClusteredPointsLayer();
			},
			visible: true
		});
		
		// Create empty vector source
		const pointsSource = new VectorSource();
		
		// Create cluster source with the empty vector source
		const clusterSource = new ClusterSource({
			distance: 35,
			source: pointsSource
		});
		
		// Create vector layer with the cluster source
		const clusterLayer = new VectorLayer({
			source: clusterSource,
			style: (feature, resolution) => {
				return this.getClusterPointStyle(feature);
			},
			zIndex: 200,
			visible: layerConfig.getProperties().visible
		});
		
		// Set properties
		clusterLayer.setProperties({
			"layerId": "clusterPoints",
			"title": layerConfig.getProperties().title,
			"type": "dataLayer",
			"renderCallback": () => this.renderClusteredPointsLayer()
		});
		
		return clusterLayer;
	}

	// Initialize the points layer with empty source
	initPointsLayer() {
		console.log("Initializing points layer");

		const layerConfig = new VectorLayer();
		layerConfig.setProperties({
			layerId: "points",
			title: "Individual sites",
			type: "dataLayer",
			renderCallback: () => {
				this.renderPointsLayer();
			},
			visible: false
		});
		
		// Create empty vector source
		const pointsSource = new VectorSource();
		
		// Create cluster source with distance 0 (no clustering)
		const clusterSource = new ClusterSource({
			distance: 0,
			source: pointsSource
		});
		
		// Create vector layer
		const pointsLayer = new VectorLayer({
			source: clusterSource,
			style: (feature, resolution) => {
				return this.getSingularPointStyle(feature);
			},
			zIndex: 200,
			visible: layerConfig.getProperties().visible
		});
		
		// Set properties
		pointsLayer.setProperties({
			"layerId": "points",
			"title": layerConfig.getProperties().title,
			"type": "dataLayer",
			"renderCallback": () => this.renderPointsLayer()
		});
		
		return pointsLayer;
	}

	// Initialize the heatmap layer with empty source
	initHeatmapLayer() {
		console.log("Initializing heatmap layer");

		const layerConfig = new HeatmapLayer({
			opacity: 0.5
		});
		layerConfig.setProperties({
			layerId: "heatmap",
			title: "Heatmap",
			type: "dataLayer",
			renderCallback: () => {
				this.renderHeatmapLayer();
			},
			visible: false
		});
		
		// Create empty vector source
		const pointsSource = new VectorSource();
		
		// Create heatmap layer
		const heatmapLayer = new HeatmapLayer({
			source: pointsSource,
			weight: function(feature) {
				return 1.0;
			},
			radius: 10,
			blur: 30,
			zIndex: 200,
			visible: layerConfig.getProperties().visible,
			opacity: 0.5
		});
		
		// Set properties
		heatmapLayer.setProperties({
			"layerId": "heatmap",
			"title": layerConfig.getProperties().title,
			"type": "dataLayer",
			"renderCallback": () => this.renderHeatmapLayer()
		});
		
		return heatmapLayer;
	}

	/*
	* Function: getDataAsGeoJSON
	*
	* Returns the internally stored data as GeoJSON, does not fetch anything from server.
	* 
	*/
	getDataAsGeoJSON(data) {
		var geojson = {
			"type": "FeatureCollection",
			"features": [
			]
		};

		for(var key in data) {
			var feature = {
				"type": "Feature",
				"geometry": {
					"type": "Point",
					"coordinates": [data[key].lng, data[key].lat]
				},
				"properties": {
					id: data[key].id,
					name: data[key].title
				}
			};
			geojson.features.push(feature);
		}
		return geojson;
	}

	/*
	* Function: getPointStyle
	*/
	getPointStyle(feature, options = { selected: false, highlighted: false }) {
		var pointSize = 12;
		var zIndex = 0;
		var text = "";
		
		//default values if point is not selected and not highlighted
		var fillColor = this.style.default.fillColor;
		var strokeColor = this.style.default.strokeColor;
		
		//if point is highlighted (its a hit when doing a search)
		if(options.highlighted) {
			fillColor = this.style.highlighted.fillColor;
			strokeColor = this.style.highlighted.strokeColor;
			zIndex = 200;
		}
		//if point is selected (clicked on)
		if(options.selected) {
			fillColor = this.style.selected.fillColor;
			strokeColor = this.style.selected.strokeColor;
			zIndex = 200;
		}

		var styles = [];
		
		styles.push(new Style({
			image: new CircleStyle({
				radius: pointSize,
				stroke: new Stroke({
					color: strokeColor
				}),
				fill: new Fill({
					color: fillColor
				})
			}),
			zIndex: zIndex,
			text: new Text({
				text: text,
				offsetX: 15,
				textAlign: 'left',
				fill: new Fill({
					color: '#fff'
				}),
				stroke: new Stroke({
					color: '#000',
					width: 2
				}),
				scale: 1.2
			})
			
		}));
		
		return styles;
	}

	/*
	* Function: getClusterPointStyle
	*/
	getClusterPointStyle(feature, options = { selected: false, highlighted: false }) {
		var pointsNum = feature.get('features').length;
		var clusterSizeText = pointsNum.toString();
		if(pointsNum > 999) {
			clusterSizeText = pointsNum.toString().substring(0, 1)+"k+";
		}
		var pointSize = 8+(Math.log10(feature.getProperties().features.length)*15);
		
		var zIndex = 0;
		
		//default values if point is not selected and not highlighted
		var fillColor = this.style.default.fillColor;
		var strokeColor = this.style.default.strokeColor;
		var textColor = "#fff";
		
		//if point is highlighted (its a hit when doing a search)
		if(options.highlighted) {
			fillColor = this.style.highlighted.fillColor;
			strokeColor = this.style.highlighted.strokeColor;
			textColor = this.style.highlighted.textColor;
			zIndex = 200;
		}
		//if point is selected (clicked on)
		if(options.selected) {
			fillColor = this.style.selected.fillColor;
			strokeColor = this.style.selected.strokeColor;
			textColor = this.style.selected.textColor;
			zIndex = 200;
		}

		var styles = [];
		styles.push(new Style({
			image: new CircleStyle({
				radius: pointSize,
				stroke: new Stroke({
					color: strokeColor
				}),
				fill: new Fill({
					color: fillColor
				})
			}),
			zIndex: zIndex,
			text: new Text({
				text: clusterSizeText,
				offsetY: 1,
				fill: new Fill({
					color: textColor
				})
			})
		}));
		
		
		if(pointsNum == 1) {
			var pointName = feature.get('features')[0].getProperties().name;
			if(pointName != null) {
				styles.push(new Style({
					zIndex: zIndex,
					text: new Text({
						text: pointName,
						offsetX: 15,
						textAlign: 'left',
						fill: new Fill({
							color: '#fff'
						}),
						stroke: new Stroke({
							color: '#000',
							width: 2
						}),
						scale: 1.2
					})
				}));
			}
			
		}
		
		return styles;
	}

	/*
	* Function: getSingularPointStyle
	*/
	getSingularPointStyle(feature, options = { selected: false, highlighted: false }) {
		var pointsNum = feature.get('features').length;
		var clusterSizeText = pointsNum.toString();
		if(pointsNum > 999) {
			clusterSizeText = pointsNum.toString().substring(0, 1)+"k+";
		}
		let pointSize = 8;

		var zIndex = 0;
		
		//default values if point is not selected and not highlighted
		var fillColor = this.style.default.fillColor;
		var strokeColor = this.style.default.strokeColor;
		var textColor = "#fff";
		
		//if point is highlighted (its a hit when doing a search)
		if(options.highlighted) {
			fillColor = this.style.highlighted.fillColor;
			strokeColor = this.style.highlighted.strokeColor;
			textColor = this.style.highlighted.textColor;
			zIndex = 10;
		}
		//if point is selected (clicked on)
		if(options.selected) {
			fillColor = this.style.selected.fillColor;
			strokeColor = this.style.selected.strokeColor;
			textColor = this.style.selected.textColor;
			zIndex = 10;
		}

		var styles = [];
		styles.push(new Style({
			image: new CircleStyle({
				radius: pointSize,
				stroke: new Stroke({
					color: strokeColor
				}),
				fill: new Fill({
					color: fillColor
				})
			}),
			zIndex: zIndex,
			text: new Text({
				text: clusterSizeText == 1 ? "" : clusterSizeText,
				offsetY: 1,
				fill: new Fill({
					color: textColor
				})
			})
		}));
		
		return styles;
	}

	/*
	* Function: createSelectInteraction
	*/
	createSelectInteraction() {
		this.selectPopupOverlay = new Overlay({
			element: document.getElementById('map-popup-container'),
			positioning: 'bottom-center',
			offset: [0, -17]
		});
		this.olMap.addOverlay(this.selectPopupOverlay);

		var selectInteraction = new SelectInteraction({
			//condition: clickCondition,
			style: (feature) => {
				if(this.getVisibleDataLayer().getProperties().layerId == "clusterPoints") {
					return this.getClusterPointStyle(feature, {
						selected: true,
						highlighted: false
					});
				}
				else {
					return this.getPointStyle(feature, {
						selected: true,
						highlighted: false
					});
				}
			}
		});

		selectInteraction.setProperties({
			selectInteraction: true
		});
		
		selectInteraction.on("select", (evt) => {

			if(evt.selected.length == 1 && evt.selected[0].getProperties().hasOwnProperty("features") == false) {
				$("#map-popup-container").show();
				var feature = evt.selected[0];
				var coords = feature.getGeometry().getCoordinates();
				var prop = feature.getProperties();

				$("#map-popup-title").html("");
				var tableRows = "<tr row-site-id='"+prop.id+"'><td>"+prop.name+"</td></tr>";
				tableRows = sqs.sqsOffer("resultMapPopupSites", {
					tableRows: tableRows,
					olFeatures: prop.features
				}).tableRows;
				$("#map-popup-sites-table tbody").html(tableRows);

				this.selectPopupOverlay.setPosition(coords);
			}
			else if(evt.selected.length == 1 && evt.selected[0].getProperties().hasOwnProperty("features") == true) {
				$("#map-popup-container").show();

				var feature = evt.selected[0];
				var coords = feature.getGeometry().getCoordinates();
				var prop = evt.selected[0].getProperties();

				$("#map-popup-title").html("");
				
				var tableRows = "";
				for(var fk in prop.features) {
					tableRows += "<tr row-site-id='"+prop.features[fk].getProperties().id+"'><td>"+prop.features[fk].getProperties().name+"</td></tr>";
				}

				tableRows = sqs.sqsOffer("resultMapPopupSites", {
					tableRows: tableRows,
					olFeatures: prop.features
				}).tableRows;

				$("#map-popup-sites-table tbody").html(tableRows);

				$("#map-popup-show-all-sites-btn").on("click", (evt) => {
					$("#map-popup-sites-table").show();
					$("#map-popup-show-all-sites-btn").hide();
					this.selectPopupOverlay.setPosition();
					this.selectPopupOverlay.setPosition(coords);
				});
				this.selectPopupOverlay.setPosition(coords);

				//if only one site in cluster, render site report
				/*
				if(prop.features.length == 1) {
					let siteId = prop.features[0].getProperties().id;
					this.sqs.siteReportManager.renderSiteReport(siteId);
				}
				*/
			}
			else {
				$("#map-popup-container").hide();
				this.selectPopupOverlay.setPosition();
			}
			sqs.sqsEventDispatch("resultMapPopupRender");
		});
		
		return selectInteraction;
	}

	/*
	* Function: getVisibleDataLayer
	*/
	getVisibleDataLayer() {
		let dataLayers = this.layers.filter(l => l.getProperties().type === "dataLayer");

		for(var key in dataLayers) {
			if(dataLayers[key].getProperties().visible) {
				return dataLayers[key];
			}
		}
		return false;
	}
	
	/*
	* Function: importSettings
	*/
	importSettings(settings) {
		if(typeof(settings.center) != "undefined" && typeof(settings.zoom) != "undefined") {
			this.settingsImportInterval = setInterval(() => { //Map may not have been initialized yet, so wait until it has
				if(this.olMap != null) {
					this.olMap.getView().setCenter(settings.center);
					this.olMap.getView().setZoom(settings.zoom);
					clearInterval(this.settingsImportInterval);
					
					for(let lk in settings.baseLayers) {
						this.setMapBaseLayer(settings.baseLayers[lk]);
					}
					for(let lk in settings.dataLayers) {
						this.setMapDataLayer(settings.dataLayers[lk]);
					}
				}
			}, 250);
		}
	}

	/*
	* Function: resultMapBaseLayersControlssqsMenu
	*/
	resultMapBaseLayersControlsSqsMenu() {
		var menu = {
			title: "<i class=\"fa fa-globe result-map-control-icon\" aria-hidden=\"true\"></i><span class='result-map-tab-title'>Baselayer</span>", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: "#result-map-baselayer-controls-menu-anchor", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
			staticSelection: true, //whether a selected item remains highlighted or not, purely visual
			visible: true, //show this menu by default
			style: {
				menuTitleClass: "result-map-control-menu-title",
				l1TitleClass: "result-map-control-item-title"
			},
			items: [ //The menu items contained in this menu
			],
			triggers: [{
				selector: "#result-map-baselayer-controls-menu",
				on: "click"
			}]
		};

		for (let key in this.layers) {
			const layer = this.layers[key];
			const prop = layer.getProperties();
			if (prop.type === "baseLayer") {
				menu.items.push({
					name: prop.layerId, //identifier of this item, should be unique within this menu
					title: prop.title, //displayed in the UI
					tooltip: "",
					staticSelection: prop.visible, //For tabs - highlighting the currently selected
					selected: prop.visible,
					callback: this.makeMapControlMenuCallback(prop)
				});
			}
		}
		return menu;
	}

	/*
	* Function: resultMapDataLayersControlssqsMenu
	*/
	resultMapDataLayersControlsSqsMenu() {
		var menu = {
			title: "<i class=\"fa fa-map-marker result-map-control-icon\" aria-hidden=\"true\"></i><span class='result-map-tab-title'>Datalayer</span>", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: "#result-map-datalayer-controls-menu-anchor", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
			staticSelection: true, //whether a selected item remains highlighted or not, purely visual
			visible: true, //show this menu by default
			style: {
				menuTitleClass: "result-map-control-menu-title",
				l1TitleClass: "result-map-control-item-title"
			},
			items: [ //The menu items contained in this menu
			],
			triggers: [{
				selector: "#result-map-datalayer-controls-menu",
				on: "click"
			}]
		};

		for (let key in this.layers) {
			const layer = this.layers[key];
			const prop = layer.getProperties();
			if (prop.type === "dataLayer") {
				menu.items.push({
					name: prop.layerId, //identifier of this item, should be unique within this menu
					title: prop.title, //displayed in the UI
					tooltip: "",
					staticSelection: prop.visible, //For tabs - highlighting the currently selected
					selected: prop.visible,
					callback: this.makeMapControlMenuCallback(prop)
				});
			}
		}

		//add a special 'none' menu item
		menu.items.push({
			name: "none",
			title: "None",
			tooltip: "Disable all data layers",
			staticSelection: false,
			selected: false,
			callback: this.makeMapControlMenuCallback({
				layerId: "none",
				type: "dataLayer"
			})
		});

		return menu;
	}

	resultMapAuxLayersControlsSqsMenu() {
		var menu = {
			title: "<i class=\"fa fa-cogs result-map-control-icon\" aria-hidden=\"true\"></i><span class='result-map-tab-title'>Auxiliary layers</span>", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: "#result-map-auxlayer-controls-menu-anchor", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
			staticSelection: true, //whether a selected item remains highlighted or not, purely visual
			visible: true, //show this menu by default
			style: {
				menuTitleClass: "result-map-control-menu-title",
				l1TitleClass: "result-map-control-item-title"
			},
			items: [],
			/*
			callback: () => {
				this.renderAuxLayersPanel();
			},
			offCallback: () => {
				this.unrenderAllAuxLayersPanel();
			},
			*/
			selected: false,
			callbacks: [{
                selector: "#result-map-auxlayer-controls-menu",
                on: "click",
                callback: () => {
                    //make sure all the auxLayer metadata is loaded, then render the renderAllAuxLayersPanel
					if(!this.auxLayersInitialized) {
						console.log("Waiting for auxLayer metadata to load...");
						let waitForMetaDataLoad = setInterval(() => {
							if(this.auxLayersInitialized) {
								clearInterval(waitForMetaDataLoad);
								this.renderAuxLayersPanel();
							}
						}, 100);
					} else {
						this.renderAuxLayersPanel();
					}

                }
            }],
			triggers: [{
				selector: "#result-map-auxlayer-controls-menu",
				on: "click"
			}]
		};
		
		/*
		for(var key in this.auxLayers) {
			var prop = this.auxLayers[key].getProperties();
			menu.items.push({
				name: prop.layerId, //identifier of this item, should be unique within this menu
				title: prop.title, //displayed in the UI
				tooltip: "",
				staticSelection: prop.visible, //For tabs - highlighting the currently selected
				selected: prop.visible,
				callback: this.makeMapControlMenuCallback(prop)
			});
		}
		//add a special 'none' menu item
		menu.items.push({
			name: "none",
			title: "None",
			tooltip: "Disable all overlays",
			staticSelection: false,
			selected: false,
			callback: this.makeMapControlMenuCallback({
				layerId: "none",
				type: "auxLayer"
			})
		});
		*/
		
		return menu;
	}

	/*
	* Function: makeMapControlMenuCallback
	*/
	makeMapControlMenuCallback(layerProperties) {
		return () => {
			switch(layerProperties.type) {
				case "dataLayer":
					this.setMapDataLayer(layerProperties.layerId);
					break;
				case "baseLayer":
					this.setMapBaseLayer(layerProperties.layerId);
					break;
				case "auxLayer":
					this.setMapAuxLayer(layerProperties.layerId);
					break;
			}
		}
	}

	/*
	* Function: unrender
	*/
	async unrender() {
		if(this.olMap) {
			this.olMap.setTarget(null);
		}
		$(this.renderIntoNode).hide();
		//this.olMap.setTarget(null);
		$("#map-popup-container").remove();
		this.olMap = null;
	}

	/*
	* Function: resizeCallback
	*/
	resizeCallback() {
		if(this.olMap != null && this.active) {
			//$(this.renderIntoNode).hide();
			if(typeof(this.resizeTimeout) != "undefined") {
				clearTimeout(this.resizeTimeout);
			}
			this.resizeTimeout = setTimeout(() => {
				//$(this.renderIntoNode).show();
				this.olMap.updateSize();
			}, 500);
		}
	}

	


}

export { ResultMap as default }