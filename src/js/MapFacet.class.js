import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer, Heatmap as HeatmapLayer, Image as ImageLayer } from 'ol/layer';
import { Stamen, BingMaps, ImageArcGISRest } from 'ol/source';
import { Group as GroupLayer } from 'ol/layer';
import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import { Cluster as ClusterSource, Vector as VectorSource } from 'ol/source';
import { fromLonLat } from 'ol/proj.js';
import { Select as SelectInteraction, Draw as DrawInteraction } from 'ol/interaction';
import { Circle as CircleStyle, Fill, Stroke, Style, Text} from 'ol/style.js';
import { Attribution } from 'ol/control';

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
		this.dataFetchingEnabled = false;

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
			attribution: false,
			controls: [attribution],
			layers: [
			  new TileLayer({
	            source: new Stamen({
	              layer: 'terrain-background'
	            })
	          })
			],
			view: new View({
			  center: fromLonLat([12.41, 48.82]),
			  zoom: 3
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
		var selectedFeatures = this.mapSelect.getFeatures();

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
			
			/*
			listener = sketch.getGeometry().on('change',function(event){
				selectedFeatures.clear();
				var polygon = event.target;
				var features = pointsLayer.getSource().getFeatures();

				for (var i = 0 ; i < features.length; i++){
					if(polygon.intersectsExtent(features[i].getGeometry().getExtent())){
						selectedFeatures.push(features[i]);
					}
				}
			});
			*/
		}, this);


		/* Reactivate select after 300ms (to avoid single click trigger)
			and create final set of selected features. */
		this.drawInteraction.on('drawend', (event) => {
			sketch = null;
			this.delaySelectActivate();
			//selectedFeatures.clear();

			var polygon = event.feature.getGeometry();
			this.selections = polygon.getCoordinates()[0];
			this.selections.pop();
			

			//this.broadcastSelection(); //uncomment me when server supports this!
			
			console.log(JSON.stringify(this.selections, null, 2));

			/*
			var features = pointsLayer.getSource().getFeatures();
			for (var i = 0 ; i < features.length; i++){
				if(polygon.intersectsExtent(features[i].getGeometry().getExtent())){
					selectedFeatures.push(features[i]);
				}
			}
			console.log(selectedFeatures);
			*/
			
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
		super.importData();
		
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
		

		/*
		$(".facet-text-search-input", this.getDomRef()).hide();
		$(".facet-text-search-btn", this.getDomRef()).hide();
		

		$(this.domObj).find(".facet-body").show(); //Un-do hide of facet-body which is done in the super
		
		if(changeFacetSize) {
			var headerHeight = $(".facet-header", this.domObj).height();
			let subHeaderHeight = $(".list-container-header", this.domObj).height();
			let facetHeight = headerHeight + subHeaderHeight + this.selections.length * this.rowHeight + 6;
			let facetBodyHeight = subHeaderHeight + this.selections.length * this.rowHeight + 6;
			
			if(facetHeight > Config.facetBodyHeight+headerHeight) {
				facetHeight = Config.facetBodyHeight+headerHeight;
			}

			$(this.domObj).css("height", facetHeight+"px");
			$(".facet-body", this.domObj).css("height", facetBodyHeight+"px");
		}
		
		var slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
		this.sqs.facetManager.updateSlotSize(slotId);
		this.sqs.facetManager.updateAllFacetPositions();
		
		this.updateRenderData();
		*/
	}

	/*
	* Function: maximize
	*/
	maximize() {
		super.maximize();

		$(".map-filter-selection-info", this.domObj).hide();
		/*
		//$(".facet-text-search-input", this.getDomRef()).show();
		$(".facet-text-search-btn", this.getDomRef()).show();
		
		$(".discrete-facet-blank-space", this.getDomRef()).show();
		$("#facet-"+this.id).css("height", this.defaultHeight);
		$("#facet-"+this.id).find(".facet-body").css("height", this.bodyHeight);
		//this.renderData(this.visibleData);
		this.updateRenderData();
		
		$(this.domObj).find(".facet-body").scrollTop(this.scrollPosition);

		var slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
		this.sqs.facetManager.updateSlotSize(slotId);
		this.sqs.facetManager.updateAllFacetPositions();
		*/
	}

	updateRenderData() {
		
	}

}

export { MapFacet as default }