/**
 * This is intended to be a generic class for creating OpenLayers maps, which is needed as a wrapper because of the ungodly amount of code required to create a map.
 */

import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer, VectorTile as VectorTileLayer, Heatmap as HeatmapLayer } from 'ol/layer';
import { Stamen, BingMaps, TileArcGISRest, XYZ } from 'ol/source';
import { Group as GroupLayer } from 'ol/layer';
import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import MVT from 'ol/format/MVT';
import { Cluster as ClusterSource, Vector as VectorSource, VectorTile as VectorTileSource } from 'ol/source';
import { fromLonLat, toLonLat, get as getProjection } from 'ol/proj.js';
import { Select as SelectInteraction } from 'ol/interaction';
import { Circle as CircleStyle, Fill, Stroke, Style, Text} from 'ol/style.js';
import { Attribution } from 'ol/control';
import { getTopLeft } from 'ol/extent';
import { createXYZ } from 'ol/tilegrid';
import TileGrid from 'ol/tilegrid/TileGrid.js';

class OpenLayersMap {
    constructor(sqs) {
        this.sqs = sqs;
        this.olMap = null;
        this.baseLayers = [];
		this.dataLayers = [];
        this.currentZoomLevel = 4;
        this.data = [];
		this.defaultExtent = [-16163068.253070222, -2582960.0598126827, 5596413.462927474, 12053813.61245915]

        //These attributes are used to set the style of map points
		this.style = {
			default: {
				fillColor: this.sqs.color.getColorScheme(20, 0.5)[13],
				strokeColor: "#fff",
				textColor: "#fff",
			},
			selected: {
				fillColor: this.sqs.color.getColorScheme(20, 1.0)[14],
				strokeColor: "#fff",
				textColor: "#fff",
			},
			highlighted: {
				fillColor: "#f60",
				textColor: "#000",
				strokeColor: "#fff"
			}
		}

		//Define base layers
		let stamenLayer = new TileLayer({
			source: new Stamen({
				layer: 'terrain-background',
				wrapX: true
			}),
			visible: true
		});
		stamenLayer.setProperties({
			"layerId": "stamen",
			"title": "Stamen",
			"type": "baseLayer"
		});
		
		let bingAerialLayer = new TileLayer({
			source: new BingMaps({
				key: 'At_1FuTga4p88618KkMhqxYZE71lCvBhzEx7ccisF9rShHoLsDLv-5zzGh3l25X5',
				imagerySet: "Aerial",
				wrapX: true
			}),
			visible: false
		});
		bingAerialLayer.setProperties({
			"layerId": "bingAerial",
			"title": "Bing Aerial",
			"type": "baseLayer"
		});
		
		let bingAerialLabelsLayer = new TileLayer({
			source: new BingMaps({
				key: 'At_1FuTga4p88618KkMhqxYZE71lCvBhzEx7ccisF9rShHoLsDLv-5zzGh3l25X5',
				imagerySet: "AerialWithLabels",
				wrapX: true
			}),
			visible: false
		});
		bingAerialLabelsLayer.setProperties({
			"layerId": "bingAerialLabels",
			"title": "Bing Aerial + Labels",
			"type": "baseLayer"
		});
		
		let arcticDemLayer = new TileLayer({
			source: new TileArcGISRest({
				url: "http://elevation2.arcgis.com/arcgis/rest/services/Polar/ArcticDEM/ImageServer",
				attributions: "<a target='_blank' href='https://www.pgc.umn.edu/data/arcticdem/'>NSF PGC ArcticDEM</a>",
				wrapX: true
			}),
			visible: false
		});
		arcticDemLayer.setProperties({
			"layerId": "arcticDem",
			"title": "PGC ArcticDEM",
			"type": "baseLayer"
		});
		
		this.baseLayers.push(stamenLayer);
		this.baseLayers.push(bingAerialLayer);
		this.baseLayers.push(bingAerialLabelsLayer);
		this.baseLayers.push(arcticDemLayer);
		
		//Define data layers
        let dataLayer = new VectorLayer();
        dataLayer.setProperties({
            layerId: "clusterPoints",
            title: "Clustered",
            type: "dataLayer",
            renderCallback: () => {
                this.renderClusteredPointsLayer();
            },
            visible: true
        });
        this.dataLayers.push(dataLayer);

		dataLayer = new VectorLayer();
		dataLayer.setProperties({
			layerId: "points",
			title: "Individual",
			type: "dataLayer",
			renderCallback: () => {
				this.renderPointsLayer();
			},
			visible: false
		});
		this.dataLayers.push(dataLayer);

		dataLayer = new VectorLayer();
		dataLayer.setProperties({
			layerId: "abundancePoints",
			title: "Individual",
			type: "dataLayer",
			renderCallback: () => {
				this.renderAbundancePointsLayer();
			},
			visible: false
		});
		this.dataLayers.push(dataLayer);
		
		//Heatmap
        dataLayer = new HeatmapLayer({});
        dataLayer.setProperties({
            layerId: "heatmap",
            title: "Heatmap",
            type: "dataLayer",
            renderCallback: () => {
                this.renderHeatmapLayer();
            },
            visible: false
        });
        this.dataLayers.push(dataLayer);
    }

	addGbifLayer(url) {
		const gbifLayer = new TileLayer({
			source: new XYZ({
			  url: url,
			  attributions: "© <a target='_blank' href='https://www.gbif.org/'>GBIF</a>"
			})
		});

		gbifLayer.setProperties({
            layerId: "gbif",
            title: "GBIF Occurrences",
            type: "baseLayer"
        });


		this.baseLayers.push(gbifLayer);
	}
	
	addGbifLayerVector(url) {
		const gbifLayer = new VectorTileLayer({
			source: new XYZ({
				url: url,
			}),
			renderCallback: () => {
				this.renderGbifDataLayer(url);
			}
		});

		gbifLayer.setProperties({
			layerId: "gbif",
			title: "GBIF Occurrences",
			type: "dataLayer"
		});

		this.dataLayers.push(gbifLayer);
	}

	renderGbifDataLayer(url) {
		const resolutions = [
			156543.03392804097,
			78271.51696402048,
			39135.75848201024,
			19567.87924100512,
			9783.93962050256,
			4891.96981025128
		];

		const gbifSource = new VectorTileSource({
			format: new MVT(),
			tileGrid: new TileGrid({
				extent: getProjection('EPSG:3857').getExtent(),
				resolutions: resolutions,
				tileSize: 256,
			  }),
			  url: url,
			attributions: '© GBIF',
		})

		const gbifLayer = new VectorTileLayer({
			source: gbifSource,
			style: new Style({
				image: new CircleStyle({
					radius: 5,
					fill: new Fill({
						color: 'rgba(255, 255, 255, 0.4)'
					}),
					stroke: new Stroke({
						color: '#ff99CC',
						width: 2.25
					})
				})
			})
		});
		
		gbifLayer.setProperties({
			layerId: "gbif",
			title: "GBIF Occurrences",
			type: "dataLayer"
		});
		
		this.olMap.addLayer(gbifLayer);
	}

    setData(data = []) {
        //data is assumed to be an array with (at least) the properties: lng, lat, id, title
        this.data = data;
    }

    /*
	* Function: setMapBaseLayer
	*/
	setMapBaseLayer(baseLayerId, hideAllOthers = true) {
		if(baseLayerId == "arcticDem") {
			this.sqs.notificationManager.notify("ArcticDEM is a partial map only covering the northern arctic region.", "info", 5000);
		}

		this.baseLayers.forEach((layer, index, array) => {
			if(layer.getProperties().layerId == baseLayerId) {
				layer.setVisible(true);
			}
			else if(hideAllOthers){
				layer.setVisible(false);
			}
		});
	}

	addTextOverlay(text = "") {
		let el = document.createElement('div');
		el.innerHTML = text;
		el.style.position = 'absolute';
		el.style.bottom = '0';
		el.style.left = '0';
		el.style.backgroundColor = 'rgba(255,255,255,0.5)';
		el.style.padding = '5px';
		el.style.borderRadius = '5px';
		this.olMap.getViewport().appendChild(el);
	  }

	/*
	* Function: setMapDataLayer
	*/
	setMapDataLayer(dataLayerId) {
		this.clearSelections();
		this.dataLayers.forEach((layer, index, array) => {
			if(layer.getProperties().layerId == dataLayerId && layer.getVisible() == false) {
				layer.setVisible(true);
				layer.getProperties().renderCallback(this);
			}
			if(layer.getProperties().layerId != dataLayerId && layer.getVisible() == true) {
				this.removeLayer(layer.getProperties().layerId);
				layer.setVisible(false);
			}
		});
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

	/*
	* Function: renderClusteredPointsLayer
	*/
	renderClusteredPointsLayer() {
		var geojson = this.getDataAsGeoJSON(this.data);

		var gf = new GeoJSON({
			featureProjection: "EPSG:3857"
		});
		var featurePoints = gf.readFeatures(geojson);
		var pointsSource = new VectorSource({
			features: featurePoints
		});
		
		var clusterSource = new ClusterSource({
			distance: 35,
			source: pointsSource
		});
		
		var clusterLayer = new VectorLayer({
			source: clusterSource,
			style: (feature, resolution) => {
				var style = this.getClusterPointStyle(feature);
				return style;
			},
			zIndex: 1
		});
		
		clusterLayer.setProperties({
			"layerId": "clusterPoints",
			"type": "dataLayer"
		});
		
		this.olMap.addLayer(clusterLayer);
	}

	renderGbifLayer(url) {
		const gbifLayer = new TileLayer({
			source: new XYZ({
			  url: url,
			  attributions: '© GBIF'
			})
		});
		
		gbifLayer.setProperties({
			"layerId": "gbif",
			"type": "baseLayer"
		});
		
		this.olMap.addLayer(gbifLayer);
	}

	renderHeatmapLayer() {
		var geojson = this.getDataAsGeoJSON(this.data);

		var gf = new GeoJSON({
			featureProjection: "EPSG:3857"
		});
		var featurePoints = gf.readFeatures(geojson);

		var pointsSource = new VectorSource({
			features: featurePoints
		});
		
		var layer = new HeatmapLayer({
			source: pointsSource,
			opacity: 0.6,
			radius: 10,
			blur: 20,
			zIndex: 1,
			weight: function(feature) {
				return 1;
				//console.log(feature.get('abundance_normalized'));
				//return feature.get('abundance_normalized') != NaN ? feature.get('abundance_normalized') : 1;
			}
		});
		
		layer.setProperties({
			"layerId": "heatmap",
			"type": "dataLayer"
		});
		
		this.olMap.addLayer(layer);
	}

	/*
	* Function: renderPointsLayer
	*/
	renderPointsLayer() {
		var geojson = this.getDataAsGeoJSON(this.data);

		var gf = new GeoJSON({
			featureProjection: "EPSG:3857"
		});
		var featurePoints = gf.readFeatures(geojson);
		var pointsSource = new VectorSource({
			features: featurePoints
		});
		
		var clusterSource = new ClusterSource({
			distance: 0,
			source: pointsSource
		});
		
		var clusterLayer = new VectorLayer({
			source: clusterSource,
			style: (feature, resolution) => {
				var style = this.getSingularPointStyle(feature);
				return style;
			},
			zIndex: 1
		});
		
		clusterLayer.setProperties({
			"layerId": "points",
			"type": "dataLayer"
		});
		
		this.olMap.addLayer(clusterLayer);
	}

	renderAbundancePointsLayer() {
		var geojson = this.getDataAsGeoJSON(this.data);

		var gf = new GeoJSON({
			featureProjection: "EPSG:3857"
		});
		var featurePoints = gf.readFeatures(geojson);
		var pointsSource = new VectorSource({
			features: featurePoints
		});
		
		var clusterSource = new ClusterSource({
			distance: 0,
			source: pointsSource
		});
		
		var clusterLayer = new VectorLayer({
			source: clusterSource,
			style: (feature, resolution) => {
				var style = this.getAbundancePointStyle(feature);
				return style;
			},
			zIndex: 1
		});
		
		clusterLayer.setProperties({
			"layerId": "points",
			"type": "dataLayer"
		});
		
		this.olMap.addLayer(clusterLayer);
	}

    getDataAsGeoJSON(data) {
		var geojson = {
			"type": "FeatureCollection",
			"features": [
			]
		};

		let maxAbundance = 0;

		for(var key in data) {
			if(data[key].abundance > maxAbundance) {
				maxAbundance = data[key].abundance;
			}
		}

		for(var key in data) {

			//this should be a value between 0.0 and 1.0
			let abundanceNormalized = data[key].abundance / maxAbundance;

			var feature = {
				"type": "Feature",
				"geometry": {
					"type": "Point",
					"coordinates": [data[key].lng, data[key].lat]
				},
				"properties": {
					id: data[key].id,
					name: data[key].title,
					abundance: data[key].abundance,
					abundance_normalized: abundanceNormalized 
				}
			};
			geojson.features.push(feature);
		}


		/*
		//create another geojson struct where each count of abundance is a feature
		//this is used for the heatmap
		let geojsonAbundance = {
			"type": "FeatureCollection",
			"features": [
			]
		};

		for(var key in data) {

			for(let i = 0; i < data[key].abundance; i++) {
				var feature = {
					"type": "Feature",
					"geometry": {
						"type": "Point",
						"coordinates": [data[key].lng, data[key].lat]
					},
					"properties": {
					}
				};
				geojsonAbundance.features.push(feature);
			}
		}
		*/

		return geojson;
	}

    removeLayer(layerId) {
		this.olMap.getLayers().forEach((layer, index, array)=> {
			if(typeof(layer) != "undefined" && layer.getProperties().layerId == layerId) {
				this.olMap.removeLayer(layer);
			}
		});
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
	* Function: getSingularPointStyle
	*/
	getAbundancePointStyle(feature, options = { selected: false, highlighted: false }) {
		//this can be multiple features if they overlap
		let features = feature.get('features');
		var pointsNum = features.length;

		let pointTotalAbundance = 0;
		for(let key in features) {
			let f = features[key];
			let abundance = f.get('abundance');
			pointTotalAbundance += abundance;
		}

		var clusterSizeText = pointsNum.toString();
		if(pointsNum > 999) {
			clusterSizeText = pointsNum.toString().substring(0, 1)+"k+";
		}
		let pointSize = 10;

		var zIndex = 0;
		
		//default values if point is not selected and not highlighted
		var fillColor = "rgba(0,81,120,0.5)";
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
				//text: clusterSizeText == 1 ? "" : clusterSizeText,
				text: pointTotalAbundance.toString(),
				offsetY: 1,
				fill: new Fill({
					color: textColor
				})
			})
		}));
		
		return styles;
	}

    fitToExtent() {
        let data = this.data;

		let lngLow, lngHigh, latLow, latHigh;
		if(data.length > 0) {
			lngLow = Math.min(...data.map(point => point.lng));
			lngHigh = Math.max(...data.map(point => point.lng));
			latLow = Math.min(...data.map(point => point.lat));
			latHigh = Math.max(...data.map(point => point.lat));
		}
		else {
			latHigh = false;
			latLow = false;
			lngHigh = false;
			lngLow = false;
		}

		let extentNW = null;
		let extentSE = null;
		let extent = null;
		if(latHigh === false || latLow === false || lngHigh === false || lngLow === false) {
			extent = this.defaultExtent;
		}
		else {
			extentNW = fromLonLat([lngLow, latLow]);
			extentSE = fromLonLat([lngHigh, latHigh]);

			extent = extentNW.concat(extentSE);
		}
		
		let padding = 30;
		this.olMap.getView().fit(extent, {
			padding: [padding, padding, padding, padding],
			maxZoom: 10,
			duration: 500
		});
    }

    render(renderTargetSelector) {
        let renderTarget = document.querySelector(renderTargetSelector);
		
		//get height of parent element
		//let parentHeight = renderTarget.parentElement.clientHeight;
		//renderTarget.style.height = parentHeight+"px";

        renderTarget.innerHTML = "";

		//create attribution and set its position to bottom left
		const attribution = new Attribution({
			collapsible: false,
			collapsed: false,
		});

        this.olMap = new Map({
            target: renderTarget,
			attribution: false,
            controls: [attribution], //Override default controls and set NO controls
            layers: new GroupLayer({
                layers: this.baseLayers
            }),
            
            view: new View({
                center: fromLonLat([12.41, 48.82]),
                zoom: this.currentZoomLevel,
                minZoom: 2
            }),
            loadTilesWhileInteracting: true,
            loadTilesWhileAnimating: true
        });

		// Add CSS styling to position the attribution control
		var attributionElement = this.olMap.getTargetElement().getElementsByClassName('ol-attribution')[0];
		attributionElement.getElementsByTagName("button")[0].style.display = "none";

        this.setMapDataLayer("abundancePoints");

		this.fitToExtent();
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

}

export default OpenLayersMap;