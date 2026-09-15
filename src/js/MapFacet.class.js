import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer, Heatmap as HeatmapLayer, Image as ImageLayer } from 'ol/layer';
import { StadiaMaps, BingMaps, ImageArcGISRest } from 'ol/source';
import { Group as GroupLayer } from 'ol/layer';
import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import { Cluster as ClusterSource, Vector as VectorSource } from 'ol/source';
import { fromLonLat, transform } from 'ol/proj.js';
import { Select as SelectInteraction, Draw as DrawInteraction } from 'ol/interaction';
import Feature from 'ol/Feature';
import { Polygon } from 'ol/geom';
import { createEmpty as createEmptyExtent, extend as extendExtent, isEmpty as isEmptyExtent } from 'ol/extent';
import { Circle as CircleStyle, Fill, Stroke, Style, Text} from 'ol/style.js';
import { Attribution } from 'ol/control';
import { click } from 'ol/events/condition.js';
import countries from "../assets/countries.geo.json";
import Facet from './Facet.class.js'
import OpenLayersMap from './Common/OpenLayersMap.class.js'
/*
* Class: MapFacet
*/
class MapFacet extends Facet {
	//How close the map may zoom when moving to a selection. A small polygon would otherwise
	//be fitted to fill the whole map, leaving nothing around it to say where on earth it is.
	static SELECTION_MAX_ZOOM = 9;
	//Margin in pixels between the selection and the edge of the map
	static SELECTION_PADDING = 30;
	//A facet that has just been opened has a map of size [0, 0] for a few frames. Fitting
	//has to wait for a real size, so it is retried for up to this many frames.
	static FIT_ATTEMPTS = 20;
	static FIT_RETRY_MS = 100;

	/*
	* Function: constructor
	*/
	constructor(sqs, id = null, template = {}) {
		super(sqs, id, template);
		this.olMapWrapper = null;
		this.olMap = null;
		this.domObj = this.getDomRef();
		this.dataFetchingEnabled = true;
		this.countryLayer = null;
		this.countryLayerMaxZoom = 5; // Only show country borders at zoom level 5 or below
		//The source holding the selected polygons. Kept on the instance because the selection
		//can now come from somewhere other than the user's own drawing - a restored viewstate,
		//or the agent applying an administrative boundary - and all of them have to be drawn.
		this.drawingSource = null;
		//One entry per polygon, each a flat list of latitude/longitude values
		this.selections = [];

		$(".facet-text-search-btn", this.domObj).hide();

		this.render();
		this.initMapSelection();
		//A facet can be created with selections already in it - spawned from a viewstate, or by
		//the agent - and the map has to show them
		this.renderSelectedPolygons(true);
		this.updateSelectionInfo();
	}

	/*
	* Function: setSelections
	*
	* A selection is a list of polygons, each a flat list of latitude/longitude values:
	* [[lat, lon, lat, lon, ...], ...]. A flat list of numbers is accepted too and read as a
	* single polygon, which is the shape viewstates saved before multi-polygon support hold.
	*/
	setSelections(selections) {
		this.selections = MapFacet.normalisePolygons(selections);
		this.renderSelectedPolygons();
		this.updateSelectionInfo();
		super.setSelections(this.selections);
	}
	
	/*
	* Function: getSelections
	*/
	getSelections() {
		return this.selections;
	}

	/*
	* Function: normalisePolygons
	* Brings every shape a selection can arrive in down to a list of polygons. Callers include
	* saved viewstates, the URL, and the agent, and none of them are obliged to know which
	* form the map happens to use internally.
	*/
	static normalisePolygons(selections) {
		if(!Array.isArray(selections) || selections.length == 0) {
			return [];
		}
		//A flat list of coordinate values is one polygon - how the map filter worked before it
		//could hold more than one
		if(!Array.isArray(selections[0])) {
			let single = MapFacet.normalisePolygon(selections);
			return single.length > 0 ? [single] : [];
		}
		return selections.map(polygon => MapFacet.normalisePolygon(polygon)).filter(polygon => polygon.length > 0);
	}

	/*
	* Function: normalisePolygon
	* One polygon as a flat list of latitude/longitude values. Pairs ([[lat, lon], ...]) are
	* accepted as well, since that is the form the query API and the boundary service use.
	* A polygon of fewer than three points encloses nothing and is dropped.
	*/
	static normalisePolygon(polygon) {
		if(!Array.isArray(polygon)) {
			return [];
		}
		let flat = Array.isArray(polygon[0]) ? polygon.flat() : polygon;
		let values = flat.map(value => Number(value)).filter(value => !isNaN(value));
		if(values.length < 6 || values.length % 2 != 0) {
			return [];
		}
		return values;
	}

	/*
	* Function: render
	*/
	render() {

		$(".facet-body", this.domObj).css("padding", "0px");

		let mapMenu = `
		<div class='base-layer-select-container'>
			<select class='base-layer-select'>
			</select>
		</div>
		<div class='map-polygon-controls'>
			<span class='map-polygon-count'></span>
			<button class='map-polygon-clear-btn' type='button'>Clear</button>
		</div>
		`;

		// Create OpenLayersMap wrapper
		this.olMapWrapper = new OpenLayersMap(this.sqs);
		this.olMapWrapper.render("#facet-"+this.id+" .map-container");
		this.olMap = this.olMapWrapper.olMap;

		// Add standard base layers
		this.olMapWrapper.addStandardBaseLayers();
		this.olMapWrapper.setMapBaseLayer("stamen");

		$("#facet-"+this.id+" .map-container").append(mapMenu);

		// Render base layer select options
		this.olMapWrapper.getBaseLayers().forEach((layer, name) => {
			$("#facet-"+this.id+" .base-layer-select").append("<option value='"+layer.getProperties().layerId+"'>"+layer.get('title')+"</option>");
		});

		// Handle base layer selection change
		$("#facet-"+this.id+" .base-layer-select").on("change", (event) => {
			let selectedLayerName = $(event.currentTarget).val();
			this.olMapWrapper.setMapBaseLayer(selectedLayerName);
		});

		//Drawing adds polygons rather than replacing them, so there has to be a way back to none
		$("#facet-"+this.id+" .map-polygon-clear-btn").on("click", (event) => {
			event.stopPropagation();
			this.clearSelections();
		});
		$("#facet-"+this.id+" .map-polygon-controls").hide();

		$("#facet-"+this.id).find(".map-container").show();
		
		$("#facet-"+this.id).find(".map-container").bind("mouseover", () => {
			this.drawInteraction.setActive(true);
		});
		$("#facet-"+this.id).find(".map-container").bind("mouseout", () => {
			this.drawInteraction.setActive(false);
		});

		$(".section-left").on("resize", () => {
			clearTimeout(this.resizeTicker);
			this.resizeTicker = setTimeout(() => {
				this.olMap.updateSize();
			}, 100);
		});

		if(navigator.platform == "Macintosh" || navigator.platform == "MacIntel" || navigator.platform == "MacPPC" || navigator.platform == "iPhone") {
			$(".map-help-text > .cmd_key_symbol").html("⌘");
		}
		else {
			$(".map-help-text > .cmd_key_symbol").html("CTRL");
		}

		this.addCountriesLayer();
	}

	addCountriesLayer() {
		const geojsonFormat = new GeoJSON();
		const features = geojsonFormat.readFeatures(countries, {
			featureProjection: 'EPSG:3857' 
		});

		const vectorSource = new VectorSource({
			features: features
		});

		this.countryLayer = new VectorLayer({
			source: vectorSource,
			style: new Style({
			  stroke: new Stroke({
				color: '#333333', // Outline color
				width: 1
			  }),
			  fill: new Fill({
				color: 'rgba(255, 255, 255, 0.2)' // Polygon fill color
			  })
			})
		});

		this.olMap.addLayer(this.countryLayer);

		// Set initial visibility based on zoom level
		this.updateCountryLayerVisibility();

		// Listen for zoom changes to show/hide country layer
		this.olMap.getView().on('change:resolution', () => {
			this.updateCountryLayerVisibility();
		});

		// Create a select interaction
		const selectInteraction = new SelectInteraction({
			condition: click,
			// Limit selection to our countryLayer only:
			layers: [this.countryLayer]
		});
		
		/*
		// Add the select interaction to your map
		this.olMap.addInteraction(selectInteraction);
		
		// Listen for the 'select' event
		selectInteraction.on('select', (event) => {
			const selectedFeatures = event.selected;     // array of newly selected features
			const deselectedFeatures = event.deselected; // array of newly deselected features
		
			if (selectedFeatures.length > 0) {
				const feature = selectedFeatures[0];
				// Get properties from the first selected feature
				const props = feature.getProperties();
				console.log('Selected Country Name:', props.name);
				console.log('Selected Country Properties:', props);

				let coordinates = feature.getGeometry().getCoordinates()[0][0];
				console.log(coordinates);
				const convertedCoordinates = coordinates.map(coord => transform(coord, 'EPSG:3857', 'EPSG:4326'));

				//swap the lat and long values
				convertedCoordinates.forEach(coord => {
					coord.reverse();
				});

				console.log(convertedCoordinates);

				//flatten the convertedCoordinates array
				const flatCoordinates = convertedCoordinates.flat();
				this.selections = flatCoordinates;

				console.log(this.selections);
				this.broadcastSelection();
			}
		
			if (deselectedFeatures.length > 0) {
				console.log('Deselected some features');
			}
		});
		*/
	}

	/*
	* Function: updateCountryLayerVisibility
	* 
	* Shows or hides the country borders layer based on zoom level.
	* Only shows borders when zoomed out enough to see multiple European countries.
	*/
	updateCountryLayerVisibility() {
		if (!this.countryLayer) {
			return;
		}
		
		const zoom = this.olMap.getView().getZoom();
		const visible = zoom <= this.countryLayerMaxZoom;
		this.countryLayer.setVisible(visible);
	}

	/*
	* Function: initMapSelection
	*/
	initMapSelection() {
		this.mapSelect = new SelectInteraction({
			style: new Style({
				fill: new Fill({
					color: [33, 68, 102, 0.2]
				}),
				stroke: new Stroke({
					color: [33, 68, 102, 1.0],
					width: 2
				})
			})
		});

		this.olMap.addInteraction(this.mapSelect);
		//var selectedFeatures = this.mapSelect.getFeatures();

		var sketch;

		/* Add drawing vector source */
		var drawingSource = new VectorSource({
			useSpatialIndex : false
		});
		this.drawingSource = drawingSource;

		/* Add drawing layer */
		var drawingLayer = new VectorLayer({
			source: drawingSource,
			style: new Style({
				fill: new Fill({
					color: [33, 68, 102, 0.2]
				}),
				stroke: new Stroke({
					color: [33, 68, 102, 1.0],
					width: 2
				})
			})
		});
		this.olMap.addLayer(drawingLayer);

		// Drawing interaction
		this.drawInteraction = new DrawInteraction({
			source : drawingSource,
			type : 'Polygon',
			//only draw when Ctrl is pressed.
			//condition : ol.events.condition.platformModifierKeyOnly,
			style: function(feature, r) {
				var styles = {
					Point: new Style({
						image: new CircleStyle({
							radius: 5,
							stroke: new Stroke({
								color: [33, 68, 102, 1.0],
								width: 2
							})
						})
					}),
					LineString: new Style({
						stroke: new Stroke({
							color: [33, 68, 102, 1.0],
							width: 2
						})
					}),
					Polygon: new Style({
						fill: new Fill({
							color: [255, 255, 255, 0.3]
						})
					})
				}
				return styles[feature.getGeometry().getType()];
			}
		});


		this.olMap.addInteraction(this.drawInteraction);

		/* Deactivate select while drawing. Polygons accumulate: each one drawn is added to
			the selection, and sites within any of them match. Use the clear button to start
			over. */
		this.drawInteraction.on('drawstart', (event) => {
			if(typeof this.mapSelect != "undefined") {
				this.mapSelect.setActive(false);
			}
			else {
				console.warn("WARN: Map select interaction not defined.");
			}
			
			sketch = event.feature;
		}, this);


		/* Reactivate select after 300ms (to avoid single click trigger)
			and create final set of selected features. */
		this.drawInteraction.on('drawend', (event) => {
			sketch = null;
			this.delaySelectActivate();
			//selectedFeatures.clear();

			let polygon = MapFacet.polygonFromGeometry(event.feature.getGeometry());
			if(polygon.length == 0) {
				//A shape with fewer than three points - nothing was really drawn
				this.renderSelectedPolygons();
				return;
			}

			this.selections = this.selections.concat([polygon]);
			//Re-drawn from the selection rather than left as the sketch, so what is on the map
			//is always exactly what is being filtered on. Deferred by a tick because the draw
			//interaction adds its own finished feature to the source after this handler
			//returns, which would otherwise survive the redraw as a duplicate.
			setTimeout(() => this.renderSelectedPolygons(), 0);
			this.updateSelectionInfo();
			this.broadcastSelection();
		});
	}

	/*
	* Function: delaySelectActivate
	*/
 	delaySelectActivate(){
		setTimeout(() => {
			this.mapSelect.setActive(true)
		},300);
	}

	/*
	* Function: polygonFromGeometry
	* An OpenLayers polygon as a flat list of latitude/longitude values. OpenLayers works in
	* web mercator with longitude first and closes its rings; the query API wants degrees with
	* latitude first and closes rings itself.
	*/
	static polygonFromGeometry(geometry) {
		let coordinates = geometry.getCoordinates()[0].slice();
		coordinates.pop();

		let polygon = [];
		coordinates.forEach(coordinate => {
			let point = transform(coordinate, 'EPSG:3857', 'EPSG:4326');
			polygon.push(point[1], point[0]);
		});

		return polygon.length >= 6 ? polygon : [];
	}

	/*
	* Function: renderSelectedPolygons
	* Draws the current selection on the map.
	*
	* The map used to be write-only: a polygon existed only as the shape the user had just
	* drawn, so a selection that came from anywhere else - a restored viewstate, or the agent
	* applying an administrative boundary - filtered the results while leaving the map blank.
	* Every change to the selection is drawn from here instead.
	*/
	renderSelectedPolygons(fitView = false) {
		if(!this.drawingSource) {
			return;
		}

		this.drawingSource.clear();
		this.selections.forEach(polygon => {
			let coordinates = [];
			for(let index = 0; index < polygon.length; index += 2) {
				coordinates.push(transform([polygon[index + 1], polygon[index]], 'EPSG:4326', 'EPSG:3857'));
			}
			if(coordinates.length > 2) {
				coordinates.push(coordinates[0]); //OpenLayers wants the ring closed
				this.drawingSource.addFeature(new Feature(new Polygon([coordinates])));
			}
		});

		if(fitView) {
			this.fitViewToSelections();
		}
	}

	/*
	* Function: fitViewToSelections
	* Moves the map to the selected polygons. Only used when the selection arrived from
	* somewhere other than the map itself - someone who just drew a polygon is already
	* looking at it, and moving the map under them would be rude.
	*/
	fitViewToSelections(attempt = 0) {
		if(!this.drawingSource) {
			return;
		}

		//Built from the features rather than asked of the source: the drawing source is
		//created without a spatial index, and getExtent() needs one
		let features = this.drawingSource.getFeatures();
		let extent = createEmptyExtent();
		features.forEach(feature => extendExtent(extent, feature.getGeometry().getExtent()));

		if(features.length == 0 || isEmptyExtent(extent) || extent.some(value => value == null || isNaN(value) || !isFinite(value))) {
			return;
		}

		//A map that has not been laid out yet has a size of [0, 0], and OpenLayers cannot work
		//out a resolution for a viewport with no size - so the fit is dropped without a word
		//and the map keeps whatever zoom it started at. That is what made an area the agent had
		//just selected land off-screen: the filter was applied to a map still being built.
		//Wait for the size instead of fitting into nothing.
		this.olMap.updateSize();
		let size = this.olMap.getSize();
		if(!size || size[0] < 2 || size[1] < 2) {
			if(attempt < MapFacet.FIT_ATTEMPTS) {
				setTimeout(() => this.fitViewToSelections(attempt + 1), MapFacet.FIT_RETRY_MS);
			}
			return;
		}

		this.olMap.getView().fit(extent, {
			size: size,
			padding: [MapFacet.SELECTION_PADDING, MapFacet.SELECTION_PADDING, MapFacet.SELECTION_PADDING, MapFacet.SELECTION_PADDING],
			maxZoom: MapFacet.SELECTION_MAX_ZOOM,
			duration: 500
		});
	}

	/*
	* Function: clearSelections
	* Drops every polygon. Bound to the clear button, since polygons now accumulate and
	* drawing a new one no longer replaces what was there.
	*/
	clearSelections() {
		this.selections = [];
		this.renderSelectedPolygons();
		this.updateSelectionInfo();
		this.broadcastSelection();
	}

	/*
	* Function: updateSelectionInfo
	* Keeps the polygon counter and its clear button in step with the selection.
	*/
	updateSelectionInfo() {
		let container = $(".map-polygon-controls", this.domObj);
		if(container.length == 0) {
			return;
		}

		if(this.selections.length == 0) {
			container.hide();
		}
		else {
			container.show();
			$(".map-polygon-count", container).text(this.selections.length == 1 ? "1 area" : this.selections.length+" areas");
		}
	}

	/*
	* Function: unrender
	*/
	unrender() {
		if(this.olMap) {
			this.olMap.setTarget(null);
		}
		$("#result-container").html("");
	}

	/*
	* Function: renderData
	*/
	renderData() {

	}

	/*
	* Function: renderNoDataMsg
	*/
	renderNoDataMsg(on = true) {
		super.renderNoDataMsg(on);
		if(on) {
			$(this.getDomRef()).find(".map-container").hide();
		}
		else {
			$(this.getDomRef()).find(".map-container").show();
		}
	}
	
	/*
	* Function: importData
	*
	* Imports the data package fetched from the server by converting it to the internal data structure format and storing it in the instance.
	*
	* Parameters:
	* data - The data package from the server.
	*/
	importData(data) {
		super.importData(data);
	}

	/*
	* Function: minimize
	*/
	minimize(changeFacetSize = true) {
		super.minimize(changeFacetSize);


		let headerHeight = $(".facet-header", this.domObj).height();
		let facetHeight = headerHeight;
		$(this.domObj).css("height", facetHeight+"px");
		$(".facet-body", this.domObj).css("height", "2em");

		$(".map-filter-selection-info", this.domObj).css("display", "flex");
		if(this.selections.length == 1) {
			$(".map-filter-selection-info", this.domObj).text("Area selection");
		}
		else if(this.selections.length > 1) {
			$(".map-filter-selection-info", this.domObj).text(this.selections.length+" area selections");
		}
		else {
			$(".map-filter-selection-info", this.domObj).text("Nothing selected");
		}
	}

	/*
	* Function: maximize
	*/
	maximize() {
		super.maximize();

		$(".map-filter-selection-info", this.domObj).hide();
	}

	updateRenderData() {
		
	}

}

export { MapFacet as default }