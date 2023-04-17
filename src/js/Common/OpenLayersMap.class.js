/**
 * This is intended to be a generic class for creating OpenLayers maps, which is needed as a wrapper because of the ungodly amount of code required to create a map.
 */

import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer, Heatmap as HeatmapLayer } from 'ol/layer';
import { Stamen, BingMaps, TileArcGISRest } from 'ol/source';
import { Group as GroupLayer } from 'ol/layer';
import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import { Cluster as ClusterSource, Vector as VectorSource } from 'ol/source';
import {fromLonLat, toLonLat} from 'ol/proj.js';
import { Select as SelectInteraction } from 'ol/interaction';
import { Circle as CircleStyle, Fill, Stroke, Style, Text} from 'ol/style.js';
import { Attribution } from 'ol/control';
import { getTopLeft } from 'ol/extent';

class OpenLayersMap {
    constructor(sqs) {
        this.sqs = sqs;
        this.olMap = null;
        this.baseLayers = [];
		this.dataLayers = [];
        this.currentZoomLevel = 4;
        this.data = [];

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
		
		//Heatmap
        dataLayer = new HeatmapLayer({
            opacity: 0.5
        });
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

    setData(data = []) {
        //data is assumed to be an array with (at least) the properties: lng, lat, id, title
        this.data = data;
    }

    /*
	* Function: setMapBaseLayer
	*/
	setMapBaseLayer(baseLayerId) {
		if(baseLayerId == "arcticDem") {
			this.sqs.notificationManager.notify("ArcticDEM is a partial map only covering the northern arctic region.", "info", 5000);
		}

		this.baseLayers.forEach((layer, index, array) => {
			if(layer.getProperties().layerId == baseLayerId) {
				layer.setVisible(true);
			}
			else {
				layer.setVisible(false);
			}
		});
	}

	addTextOverlay(text = "") {
		let el = document.createElement('div');
		el.innerHTML = text;
		el.style.position = 'absolute';
		el.style.top = '0';
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
        console.log("renderClusteredPointsLayer")
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
			weight: function(feature) {
				return 1.0;
			},
			radius: 10,
			blur: 30,
			zIndex: 1
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
        console.log("renderPointsLayer")
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

    fitToExtent() {
        let data = this.data;
        let latHigh = this.sqs.getExtremePropertyInList(data, "lat", "high");
		let latLow = this.sqs.getExtremePropertyInList(data, "lat", "low");
		let lngHigh = this.sqs.getExtremePropertyInList(data, "lng", "high");
		let lngLow = this.sqs.getExtremePropertyInList(data, "lng", "low");

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
		//let extent = extentNW.concat(extentSE);

		this.olMap.getView().fit(extent, {
			padding: [20, 20, 20, 20],
			maxZoom: 10,
			duration: 500
		});
    }

    render(renderTargetSelector) {
        let renderTarget = document.querySelector(renderTargetSelector);
        renderTarget.innerHTML = "";
        this.olMap = new Map({
            target: renderTarget,
            controls: [], //Override default controls and set NO controls
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

        this.setMapDataLayer("heatmap");

        this.fitToExtent();
    }

}

export default OpenLayersMap;