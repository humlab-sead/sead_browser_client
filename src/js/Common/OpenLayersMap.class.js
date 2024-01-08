/**
 * This is intended to be a generic class for creating OpenLayers maps, which is needed as a wrapper because of the ungodly amount of code required to create a map.
 */

import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer, VectorTile as VectorTileLayer, Heatmap as HeatmapLayer } from 'ol/layer';
import { StadiaMaps, BingMaps, TileArcGISRest, XYZ } from 'ol/source';
import { Group as GroupLayer } from 'ol/layer';
import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import MVT from 'ol/format/MVT';
import { Cluster as ClusterSource, Vector as VectorSource, VectorTile as VectorTileSource, TileDebug as TileDebugSource } from 'ol/source';
import { fromLonLat, toLonLat, get as getProjection } from 'ol/proj.js';
import { Select as SelectInteraction } from 'ol/interaction';
import { Circle as CircleStyle, Fill, Stroke, Style, Text} from 'ol/style.js';
import { Attribution } from 'ol/control';
import { getTopLeft } from 'ol/extent';
import { createXYZ } from 'ol/tilegrid';
import TileGrid from 'ol/tilegrid/TileGrid.js';
import SqsMenu from '../SqsMenu.class.js';
import { nanoid } from 'nanoid';

class OpenLayersMap {
    constructor(sqs) {
        this.sqs = sqs;
        this.olMap = null;
        this.baseLayers = [];
		this.dataLayers = [];
        this.currentZoomLevel = 4;
        this.setData(null); //this sets the data to be an empty geojson object
		this.defaultExtent = [-16163068.253070222, -2582960.0598126827, 5596413.462927474, 12053813.61245915];
		this.handleMapPopupClickCallback = null;
		this.selectedStyleType = null;
		this.featureStyleCallback = null;
		this.defaultColorScheme = this.sqs.color.getColorScheme(20, false);
		this.featureStyleCallbacks = [];

		this.registerFeatureStyleCallback("default", (olMap, features, feature, resolution) => {
			return this.getSingularPointStyle(feature);
		}, true);

		this.registerFeatureStyleCallback("colorCodedAltitude", (olMap, features, feature, resolution) => {
			return this.getColorCodedAltitudePointStyle(olMap, features, feature);
		});

        //These attributes are used to set the style of map points
		this.style = {
			default: {
				fillColor: this.sqs.color.hexToRgba(this.defaultColorScheme[13], 0.5),
				strokeColor: "#fff",
				textColor: "#fff",
			},
			selected: {
				fillColor: this.defaultColorScheme[14],
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
			source: new StadiaMaps({
				layer: 'stamen_terrain_background',
				wrapX: true,
				url: "https://tiles-eu.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}.png",
				attributions: `&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a>
				&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a>
				&copy; <a href="https://www.openstreetmap.org/about/" target="_blank">OpenStreetMap contributors</a>
				&copy; <a href="https://stamen.com/" target="_blank">Stamen Design</a>`
			}),
			visible: true
		});
		stamenLayer.setProperties({
			"layerId": "stamen",
			"title": "Terrain",
			"type": "baseLayer"
		});
		
		let bingAerialLayer = new TileLayer({
			source: new BingMaps({
				key: 'At_1FuTga4p88618KkMhqxYZE71lCvBhzEx7ccisF9rShHoLsDLv-5zzGh3l25X5',
				imagerySet: "Aerial",
				wrapX: true,
				attributions: "Baselayer © <a target='_blank' href='https://www.microsoft.com/en-us/maps'>Microsoft Corporation</a>"
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
				key: this.sqs.config.keys.bingMaps,
				imagerySet: "AerialWithLabels",
				wrapX: true,
				attributions: "Baselayer © <a target='_blank' href='https://www.microsoft.com/en-us/maps'>Microsoft Corporation</a>"
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
				attributions: "Baselayer © <a target='_blank' href='https://www.pgc.umn.edu/data/arcticdem/'>NSF PGC ArcticDEM</a>",
				wrapX: true
			}),
			visible: false
		});
		arcticDemLayer.setProperties({
			"layerId": "arcticDem",
			"title": "PGC ArcticDEM",
			"type": "baseLayer"
		});

		let osmLayer = new TileLayer({
			source: new XYZ({
				url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png',
				wrapX: true,
				attributions: "Baselayer © <a target='_blank' href='https://www.openstreetmap.org/'>OpenStreetMap</a>"
			}),
			visible: false
		});
		osmLayer.setProperties({
			"layerId": "osm",
			"title": "OpenStreetMap",
			"type": "baseLayer"
		});

		let openTopoLayer = new TileLayer({
			source: new XYZ({
				url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
				wrapX: true,
				attributions: "Baselayer © <a target='_blank' href='https://www.opentopomap.org/'>OpenTopoMap</a>"
			}),
			visible: false
		});
		openTopoLayer.setProperties({
			"layerId": "topoMap",
			"title": "OpenTopoMap",
			"type": "baseLayer"
		});

		
		this.baseLayers.push(stamenLayer);
		this.baseLayers.push(bingAerialLayer);
		this.baseLayers.push(bingAerialLabelsLayer);
		this.baseLayers.push(arcticDemLayer);
		this.baseLayers.push(osmLayer);
		this.baseLayers.push(openTopoLayer);
		
		//Define data layers
        let dataLayer = new VectorLayer();
        dataLayer.setProperties({
            layerId: "clusterPoints",
            title: "Clustered",
            type: "dataLayer",
            renderCallback: () => {
                this.renderClusteredPointsLayer(this.data, 5, false, true);
            },
            visible: false
        });
        this.dataLayers.push(dataLayer);

		dataLayer = new VectorLayer();
		dataLayer.setProperties({
			layerId: "points",
			title: "Individual",
			type: "dataLayer",
			renderCallback: () => {
				this.renderPointsLayer(this.data, this.selectedStyleType);
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
				this.renderAbundancePointsLayer(this.data);
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
                this.renderHeatmapLayer(this.data);
            },
            visible: false
        });
        this.dataLayers.push(dataLayer);

		document.addEventListener('mapPopupClick', (event) => {
			console.log(event);
		});
    }

	geFeatureStyle(name = null) {
		if(name == null) {
			name = this.selectedStyleType;
		}
		for(let key in this.featureStyleCallbacks) {
			if(this.featureStyleCallbacks[key].name == name) {
				return this.featureStyleCallbacks[key];
			}
		}
		return false;
	}

	registerFeatureStyleCallback(name, featureStyleCallback, selected = false) {
		let style = {
			name: name,
			selected: selected,
			callback: featureStyleCallback
		};
		this.featureStyleCallbacks.push(style);
		
		if(selected) {
			this.setMapDataLayerStyleType(name);
		}
		
		return style;
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

	getLayerByName(layerName) {
		let layer = null;
		this.olMap.getLayers().forEach((l, index, array) => {
			if(l.getProperties().layerId == layerName) {
				layer = l;
			}
		});
		return layer;
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

    setData(data = null) {
		if(data == null) { //if data is null, set it to an empty geojson object
			data = {
				"type": "FeatureCollection",
				"features": []
			  };
		}
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

	baseLayerMenu(anchorSelector) {
		var menu = {
			title: "<i class=\"fa fa-globe result-map-control-icon\" aria-hidden=\"true\"></i><span class='result-map-tab-title'>Baselayer</span>", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: anchorSelector+" .map-base-layer-menu", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
			staticSelection: true, //whether a selected item remains highlighted or not, purely visual
			visible: true, //show this menu by default
			style: {
				menuTitleClass: "result-map-control-menu-title",
				l1TitleClass: "result-map-control-item-title"
			},
			items: [ //The menu items contained in this menu
			],
			triggers: [{
				selector: anchorSelector,
				on: "click"
			}]
		};

		for(var key in this.baseLayers) {
			var prop = this.baseLayers[key].getProperties();
			menu.items.push({
				name: prop.layerId, //identifier of this item, should be unique within this menu
				title: prop.title, //displayed in the UI
				tooltip: "",
				staticSelection: prop.visible, //For tabs - highlighting the currently selected
				selected: prop.visible,
				callback: this.makeMapControlMenuCallback(prop)
			});
		}
		return menu;
	}


	makeMapControlMenuCallback(layerProperties) {
		return () => {
			switch(layerProperties.type) {
				case "dataLayer":
					this.setMapDataLayer(layerProperties.layerId);
					break;
				case "baseLayer":
					this.setMapBaseLayer(layerProperties.layerId);
					break;
			}
		}
	}

	renderBaseLayerMenu(anchorSelector) {
		new SqsMenu(this.sqs, this.baseLayerMenu(anchorSelector));

		/*
		let baseLayerMenu = document.createElement('div');
		baseLayerMenu.classList.add('base-layer-menu');

		let baseLayerMenuTitle = document.createElement('div');
		baseLayerMenuTitle.classList.add('base-layer-menu-title');
		baseLayerMenuTitle.innerHTML = "Base Layer";
		baseLayerMenu.appendChild(baseLayerMenuTitle);

		this.baseLayers.forEach((layer, index, array) => {
			let baseLayerMenuItem = document.createElement('div');
			baseLayerMenuItem.classList.add('base-layer-menu-item');
			baseLayerMenuItem.innerHTML = layer.getProperties().title;
			baseLayerMenuItem.addEventListener('click', () => {
				this.setMapBaseLayer(layer.getProperties().layerId);
			});
			baseLayerMenu.appendChild(baseLayerMenuItem);
		});
		*/

		//return baseLayerMenu;
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

	setMapDataLayerStyleType(styleType = null) {
		for(let key in this.featureStyleCallbacks) {
			if(this.featureStyleCallbacks[key].name == styleType) {
				this.featureStyleCallbacks[key].selected = true;
				this.featureStyleCallback = this.featureStyleCallbacks[key].callback;
			}
			else {
				this.featureStyleCallbacks[key].selected = false;
			}
		}

		let reRender = false;
		if(this.selectedStyleType != styleType) {
			reRender = true;
		}
		this.selectedStyleType = styleType;
		if(reRender) {
			this.dataLayers.forEach((layer, index, array) => {
				if(layer.getVisible() == true) {
					layer.getProperties().renderCallback(this);
				}
			});
		}
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
	renderClusteredPointsLayer(geojson, clusterDistance = 35, printLabels = true, fixedPointSize = false) {
		var gf = new GeoJSON({
			//featureProjection: "EPSG:3857"
		});
		var featurePoints = gf.readFeatures(geojson);
		var pointsSource = new VectorSource({
			features: featurePoints
		});
		
		var clusterSource = new ClusterSource({
			distance: clusterDistance,
			source: pointsSource
		});
		
		var clusterLayer = new VectorLayer({
			source: clusterSource,
			style: (feature) => {
				return this.geFeatureStyle().callback(this.olMap, featurePoints, feature);
			},
			zIndex: 1
		});
		
		clusterLayer.setProperties({
			"layerId": "clusterPoints",
			"type": "dataLayer"
		});

		if(this.getLayerByName("clusterPoints") != null) {
			console.log("removing clusterPoints layer");
			this.removeLayer("clusterPoints");
		}

		console.log("adding clusterPoints layer");
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
		
		if(this.getLayerByName("gbif") != null) {
			this.removeLayer("gbif");
		}
		this.olMap.addLayer(gbifLayer);
	}

	renderHeatmapLayer(geojson) {
		var gf = new GeoJSON({
			//featureProjection: "EPSG:3857"
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
		
		if(this.getLayerByName("heatmap") != null) {
			this.removeLayer("heatmap");
		}
		this.olMap.addLayer(layer);
	}

	/*
	* Function: renderPointsLayer
	*/
	renderPointsLayer(geoJsonData, styleType = null) {
		var gf = new GeoJSON({
			//featureProjection: "EPSG:3857"
		});
		var featurePoints = gf.readFeatures(geoJsonData);
		var pointsSource = new VectorSource({
			features: featurePoints
		});
		
		var clusterSource = new ClusterSource({
			distance: 0,
			source: pointsSource
		});
		
		var clusterLayer = new VectorLayer({
			source: clusterSource,
			style: this.geFeatureStyle().callback,
			zIndex: 1
		});
		
		clusterLayer.setProperties({
			"layerId": "points",
			"type": "dataLayer"
		});
		if(this.getLayerByName("points") != null) {
			this.removeLayer("points");
		}
		this.olMap.addLayer(clusterLayer);
	}

	renderAbundancePointsLayer(geojson) {
		var gf = new GeoJSON({
			//featureProjection: "EPSG:3857"
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
		if(this.getLayerByName("points") != null) {
			this.removeLayer("points");
		}
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

		return geojson;
	}

    removeLayer(layerId) {
		this.olMap.getLayers().forEach((layer, index, array)=> {
			if(typeof(layer) != "undefined" && layer.getProperties().layerId == layerId) {
				this.olMap.removeLayer(layer);
			}
		});
	}

	getColorCodedAltitudePointStyle(olMap, features, feature, options = { selected: false, highlighted: false }) {
		//calcultate max z
		let zMax = 0;
		features.forEach(f => {
			let zCoords = f.get('altitude');
			zCoords.forEach(z => {
				if(z.coordinate_method.method_id == 76) { //76 is height above sea level
					if(z.measurement > zMax) {
						zMax = parseFloat(z.measurement);
					}
				}
			});
		});

		var pointsNum = feature.get('features').length;
		var clusterSizeText = pointsNum.toString();
		if(pointsNum > 999) {
			clusterSizeText = pointsNum.toString().substring(0, 1)+"k+";
		}
		let pointSize = 10;

		var zIndex = 0;
		
		//default values if point is not selected and not highlighted
		var fillColor = this.style.default.fillColor;
		var strokeColor = "#00f";
		var textColor = "#fff";

		let subFeatures = feature.get('features');
		for(let key in subFeatures) {
			let f = subFeatures[key];
			let zCoords = f.get('altitude');
			let averageZValue = 0;
			zCoords.forEach(z => {
				if(z.coordinate_method.method_id == 76) { //76 is height above sea level
					averageZValue += z.measurement;
				}
			});

			averageZValue = averageZValue / zCoords.length;

			//calculate a color gradient based on the average z value between zMax and zMin
			let v = 255 * (averageZValue / zMax);
			fillColor = "rgba("+v+", 0, 0)";
		}
		
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
	getSingularPointStyle(feature, options = { selected: false, highlighted: false }) {
		var pointsNum = feature.get('features').length;
		var clusterSizeText = pointsNum.toString();
		if(pointsNum > 999) {
			clusterSizeText = pointsNum.toString().substring(0, 1)+"k+";
		}
		let pointSize = 10;

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
	* Function: getClusterPointStyle
	*/
	getClusterPointStyle(feature, options = { selected: false, highlighted: false, labels: true, fixedPointSize: false, showOnlySampleGroups: [] }) {
		var pointsNum = feature.get('features').length;
		var clusterSizeText = pointsNum.toString();
		if(pointsNum > 999) {
			clusterSizeText = pointsNum.toString().substring(0, 1)+"k+";
		}

		let pointSize = 10;
		if(!options.fixedPointSize) {
			pointSize = 8+(Math.log10(feature.getProperties().features.length)*15);
		}
		
		feature.getProperties().features.forEach(f => {
			if(options.showOnlySampleGroups && options.showOnlySampleGroups.length > 0) {
				if(options.showOnlySampleGroups.indexOf(f.get('sampleGroupId')) == -1) {
					pointSize = 0;
				}
			}
		});
		
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
			if(pointName != null && options.labels) {
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
		let data = this.data.features;
	
		let lngLow, lngHigh, latLow, latHigh;
		if (data.length > 0) {
			lngLow = Math.min(...data.map(feature => feature.geometry.coordinates[0]));
			lngHigh = Math.max(...data.map(feature => feature.geometry.coordinates[0]));
			latLow = Math.min(...data.map(feature => feature.geometry.coordinates[1]));
			latHigh = Math.max(...data.map(feature => feature.geometry.coordinates[1]));
		} else {
			latHigh = false;
			latLow = false;
			lngHigh = false;
			lngLow = false;
		}
	
		let extentNW = null;
		let extentSE = null;
		let extent = null;
		if (latHigh === false || latLow === false || lngHigh === false || lngLow === false) {
			extent = this.defaultExtent;
		} else {
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
		this.renderTargetSelector = renderTargetSelector;

        renderTarget.innerHTML = "";

		//create attribution and set its position to bottom left
		const attribution = new Attribution({
			collapsible: false,
			collapsed: false,
		});

        this.olMap = new Map({
            target: renderTarget,
			attribution: true,
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
    }

	addSelectInteraction(selectStyle = null) {
		if(this.selectInteraction != null) {
			this.olMap.removeInteraction(this.selectInteraction);
		}

		this.selectInteraction = this.createSelectInteraction(selectStyle);
		this.olMap.addInteraction(this.selectInteraction);
	}

	getVisibleDataLayer() {
		for(var key in this.dataLayers) {
			if(this.dataLayers[key].getProperties().visible) {
				return this.dataLayers[key];
			}
		}
		return false;
	}

	createSelectInteraction(selectStyle = null) {
		let popupContainer = document.createElement('div');
		popupContainer.id = "map-popup-container-"+nanoid();
		popupContainer.classList.add("map-popup-container");
		$(this.renderTargetSelector).append(popupContainer);

		this.selectPopupOverlay = new Overlay({
			element: popupContainer,
			positioning: 'bottom-center',
			offset: [0, -17]
		});
		this.olMap.addOverlay(this.selectPopupOverlay);

		var selectInteraction = new SelectInteraction({
			style: selectStyle != null ? selectStyle : (feature) => {
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
			},
		});

		selectInteraction.setProperties({
			selectInteraction: true
		});
		
		selectInteraction.on("select", (evt) => {
			if(evt.selected.length == 1 && evt.selected[0].getProperties().hasOwnProperty("features") == false) {
				$(popupContainer).show();
				var feature = evt.selected[0];
				var coords = feature.getGeometry().getCoordinates();
				var prop = feature.getProperties();

				var tableRows = "<tr row-site-id='"+prop.id+"'><td>"+prop.name+"</td></tr>";
				tableRows = sqs.sqsOffer("resultMapPopupSites", {
					tableRows: tableRows,
					olFeatures: prop.features
				}).tableRows;
				$("tbody", popupContainer).html(tableRows);

				this.selectPopupOverlay.setPosition(coords);
			}
			else if(evt.selected.length == 1 && evt.selected[0].getProperties().hasOwnProperty("features") == true) {
				$(popupContainer).show();

				var feature = evt.selected[0];
				var coords = feature.getGeometry().getCoordinates();
				var prop = evt.selected[0].getProperties();

				$(popupContainer).html("<table><tbody></tbody></table>")

				var tableRows = "";

				/*
				let sampleGroupedBySampleGroup = [];
				//group prop.features by sampleGroupId
				prop.features.forEach(f => {
					let sampleGroupId = f.get('sampleGroupId');
					if(sampleGroupedBySampleGroup[sampleGroupId] == undefined) {
						sampleGroupedBySampleGroup[sampleGroupId] = [];
					}
					sampleGroupedBySampleGroup[sampleGroupId].push(f);
				});
				*/

				for(var fk in prop.features) {
					let fprop = prop.features[fk].getProperties();
					let data = JSON.stringify({
						sampleName: fprop.name,
						sampleGroupId: fprop.sampleGroupId,
						sampleGroupName: fprop.sampleGroupName
					});
					let ttSampleId = "tt-"+nanoid();
					tableRows += "<tr data='"+data+"' row-id='"+fprop.id+"'>";
					tableRows += "<td><span id='"+ttSampleId+"' class='sample-map-tooltip-link'>"+fprop.tooltip+"</span></td>";
					tableRows += "</tr>";

					/*
					this.sqs.registerDelayedCallback("#"+ttSampleId, () => {
						console.log(data, fprop.id, fprop.sampleGroupId, fprop.tooltip);
					});
					*/
					
					this.sqs.tooltipManager.registerTooltip("#"+ttSampleId, () => {
						let sr = this.sqs.siteReportManager.siteReport;
						sr.focusOn({ section: "samples" });
						sr.expandSampleGroup(fprop.sampleGroupId, fprop.name);
						sr.pageFlipToSample(fprop.sampleGroupId, fprop.name);
						sr.scrollToSample(fprop.sampleGroupId, fprop.name);
						sr.highlightSampleRow(fprop.sampleGroupId, fprop.name);
						
					}, {
						eventType: "click",
					});
					
				}

				tableRows = sqs.sqsOffer("samplePositionMapPopup", {
					tableRows: tableRows,
					olFeatures: prop.features
				}).tableRows;
				

				$("tbody", popupContainer).html(tableRows);

				$("tr", popupContainer).on("click", (evt) => {
					this.handleMapPopupClick($(evt.currentTarget).attr("data"));
				});

				this.selectPopupOverlay.setPosition(coords);
			}
			else {
				$(popupContainer).hide();
				this.selectPopupOverlay.setPosition();
			}
			sqs.sqsEventDispatch("resultMapPopupRender");
		});
		
		return selectInteraction;
	}

	handleMapPopupClick(data) {
		if(this.handleMapPopupClickCallback != null) {
			this.handleMapPopupClickCallback(data);
		}
		else {
			console.warn("No callback specified for map popup click");
		}
	}

	setMapPopupClickCallback(callback) {
		this.handleMapPopupClickCallback = callback;
	}

	getPointStyle(feature, options = { selected: false, highlighted: false }) {
		
		var pointSize = 8;
		var zIndex = 0;
		var text = "";
		
		//default values if point is not selected and not highlighted
		var fillColor = this.style.default.fillColor;
		var strokeColor = this.style.default.strokeColor;
		
		//if point is highlighted (its a hit when doing a search)
		if(options.highlighted) {
			fillColor = this.style.highlighted.fillColor;
			strokeColor = this.style.highlighted.strokeColor;
			zIndex = 10;
		}
		//if point is selected (clicked on)
		if(options.selected) {
			fillColor = this.style.selected.fillColor;
			strokeColor = this.style.selected.strokeColor;
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

	

}

export default OpenLayersMap;