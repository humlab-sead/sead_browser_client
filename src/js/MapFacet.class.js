import 'ol';
import Config from '../config/config.js'
import Facet from './Facet.class.js'
/*
* Class: MapFacet
*/
class MapFacet extends Facet {
	/*
	* Function: constructor
	*/
	constructor(hqs, id = null, template = {}) {
		super(hqs, id, template);
		this.olMap = null;

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
		this.olMap = new ol.Map({
			//target: 'chart-container',
			layers: [
			  new ol.layer.Tile({
	            source: new ol.source.Stamen({
	              layer: 'terrain-background'
	            })
	          })
			],
			view: new ol.View({
			  center: ol.proj.fromLonLat([12.41, 48.82]),
			  zoom: 4
			})
		});

		$("#facet-"+this.id).find(".map-container").show();
		this.olMap.setTarget($("#facet-"+this.id).find(".map-container")[0]);
		
		$("#facet-"+this.id).find(".map-container").bind("mouseover", () => {
			this.drawInteraction.setActive(true);
		});
		$("#facet-"+this.id).find(".map-container").bind("mouseout", () => {
			this.drawInteraction.setActive(false);
		});

		$("#section-left").on("resize", () => {
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
		/* //////////// ADD SELECTION */

		/* add ol.collection to hold all selected features */
		this.mapSelect = new ol.interaction.Select({
			/*
			style: new ol.style.Style({
				fill: new ol.style.Fill({
					color: [33, 68, 102, 0.2]
				}),
				stroke: new ol.style.Stroke({
					color: [33, 68, 102, 1.0],
					width: 2
				})
			})
			*/
		});
		this.olMap.addInteraction(this.mapSelect);
		//var selectedFeatures = this.mapSelect.getFeatures();

		/* //////////// ADD DRAWING */

		/* The current drawing */
		var sketch;

		/* Add drawing vector source */
		var drawingSource = new ol.source.Vector({
			useSpatialIndex : false
		});

		/* Add drawing layer */
		var drawingLayer = new ol.layer.Vector({
			source: drawingSource,
			style: new ol.style.Style({
				fill: new ol.style.Fill({
					color: [33, 68, 102, 0.2]
				}),
				stroke: new ol.style.Stroke({
					color: [33, 68, 102, 1.0],
					width: 2
				})
			})
		});
		this.olMap.addLayer(drawingLayer);

		/* Declare interactions and listener globally so we 
			can attach listeners to them later. */
		var draw;
		var modify;
		var listener;

		// Drawing interaction
		this.drawInteraction = new ol.interaction.Draw({
			source : drawingSource,
			type : 'Polygon',
			//only draw when Ctrl is pressed.
			condition : ol.events.condition.platformModifierKeyOnly,
			style: function(feature, r) {
				var styles = {
					Point: new ol.style.Style({
						image: new ol.style.Circle({
							radius: 5,
							stroke: new ol.style.Stroke({
								color: [33, 68, 102, 1.0],
								width: 2
							})
						})
					}),
					LineString: new ol.style.Style({
						stroke: new ol.style.Stroke({
							color: [33, 68, 102, 1.0],
							width: 2
						})
					}),
					Polygon: new ol.style.Style({
						fill: new ol.style.Fill({
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
		this.drawInteraction.on('drawstart',function(event){
			this.selections = [];
			drawingSource.clear();
			//selectedFeatures.clear();
			this.mapSelect.setActive(false);
			
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
		},this);


		/* Reactivate select after 300ms (to avoid single click trigger)
			and create final set of selected features. */
		this.drawInteraction.on('drawend', (event) => {
			sketch = null;
			this.delaySelectActivate();
			//selectedFeatures.clear();

			var polygon = event.feature.getGeometry();
			this.selections = polygon.getCoordinates();
			
			this.broadcastSelection();
			
			//polygon.getCoordinates();
			/*
			var features = pointsLayer.getSource().getFeatures();

			for (var i = 0 ; i < features.length; i++){
				if(polygon.intersectsExtent(features[i].getGeometry().getExtent())){
					selectedFeatures.push(features[i]);
				}
			}
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

}

export { MapFacet as default }