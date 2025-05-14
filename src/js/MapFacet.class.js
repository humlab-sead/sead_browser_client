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
import { Circle as CircleStyle, Fill, Stroke, Style, Text} from 'ol/style.js';
import { Attribution } from 'ol/control';
import { click } from 'ol/events/condition.js';
import countries from "../assets/countries.geo.json";
import Facet from './Facet.class.js'
/*
* Class: MapFacet
*/
class MapFacet extends Facet {
	/*
	* Function: constructor
	*/
	constructor(sqs, id = null, template = {}) {
		super(sqs, id, template);
		this.olMap = null;
		this.domObj = this.getDomRef();
		this.dataFetchingEnabled = true;

		$(".facet-text-search-btn", this.domObj).hide();

		this.render();
		this.initMapSelection();
	}

	/*
	* Function: setSelections
	*/
	setSelections(selections) {
		this.selections = selections;
		super.setSelections(selections);
	}
	
	/*
	* Function: getSelections
	*/
	getSelections() {
		return this.selections;
	}

	/*
	* Function: render
	*/
	render() {

		$(".facet-body", this.domObj).css("padding", "0px");

		const attribution = new Attribution({
			collapsible: false,
			collapsed: false,
		});

		this.olMap = new Map({
			//target: 'chart-container',
			attribution: true,
			controls: [attribution],
			layers: [
			  new TileLayer({
	            source: new StadiaMaps({
	              layer: 'stamen_terrain_background',
				  url: "https://tiles-eu.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}.png",
				  attributions: `&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a>
					&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a>
					&copy; <a href="https://www.openstreetmap.org/about/" target="_blank">OpenStreetMap contributors</a>
					&copy; <a href="https://stamen.com/" target="_blank">Stamen Design</a>`
	            })
	          })
			],
			view: new View({
			  center: fromLonLat([12.41, 48.82]),
			  zoom: 3,
			}),
			loadTilesWhileInteracting: true,
			loadTilesWhileAnimating: true
		});

		$("#facet-"+this.id).find(".map-container").show();
		this.olMap.setTarget($("#facet-"+this.id).find(".map-container")[0]);
		
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

		//this.addCountriesLayer();
	}

	addCountriesLayer() {
		const geojsonFormat = new GeoJSON();
		const features = geojsonFormat.readFeatures(countries, {
			featureProjection: 'EPSG:3857' 
		});

		const vectorSource = new VectorSource({
			features: features
		});

		const countryLayer = new VectorLayer({
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

		this.olMap.addLayer(countryLayer);

		// Create a select interaction
		const selectInteraction = new SelectInteraction({
			condition: click,
			// Limit selection to our countryLayer only:
			layers: [countryLayer]
		});
		
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

		/* Deactivate select and delete any existing polygons.
			Only one polygon drawn at a time. */
		this.drawInteraction.on('drawstart', (event) => {
			this.setSelections([]);
			drawingSource.clear();
			//selectedFeatures.clear();
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

			var polygon = event.feature.getGeometry();
			let coordinates = polygon.getCoordinates()[0];
			coordinates.pop();
			const convertedCoordinates = coordinates.map(coord => transform(coord, 'EPSG:3857', 'EPSG:4326'));

			//swap the lat and long values
			convertedCoordinates.forEach(coord => {
				coord.reverse();
			});

			//flatten the convertedCoordinates array
			const flatCoordinates = convertedCoordinates.flat();
			this.selections = flatCoordinates;

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
		if(this.selections.length > 0) {
			$(".map-filter-selection-info", this.domObj).text("Area selection");
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