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
import { Attribution, Zoom } from 'ol/control';
import { getTopLeft } from 'ol/extent';
import { createXYZ } from 'ol/tilegrid';
import TileGrid from 'ol/tilegrid/TileGrid.js';
import SqsMenu from '../SqsMenu.class.js';
import { nanoid } from 'nanoid';
import proj4 from "proj4";
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { extend, createEmpty } from 'ol/extent';
import Config from '../../config/config.json';

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

		this.registerFeatureStyleCallback("default", (feature, resolution) => {
			return this.getSingularPointStyle(feature);
		}, true);

		this.registerFeatureStyleCallback("sampleGroupCoordinates", (feature, resolution) => {
			return this.getSampleGroupCoordinatesPointStyle(feature);
		}, true);

		this.registerFeatureStyleCallback("sampleCoordinates", (feature, resolution) => {
			return this.getSampleCoordinatesPointStyle(feature);
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

		let stamenTerrainLabelsLayer = new TileLayer({
			source: new StadiaMaps({
				layer: 'stamen_terrain',
				wrapX: true,
				url: "https://tiles-eu.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png",
				attributions: [
					'&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a>',
					'&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a>',
					'&copy; <a href="https://www.openstreetmap.org/about/" target="_blank">OpenStreetMap contributors</a>',
					'&copy; <a href="https://stamen.com/" target="_blank">Stamen Design</a>'
				],
			}),
			visible: false
		});
		stamenTerrainLabelsLayer.setProperties({
			"layerId": "stamenTerrain",
			"title": "Terrain (Labels & Lines)",
			"type": "baseLayer"
		});

		let mapboxSatelliteLayer = new TileLayer({
			source: new XYZ({
				url: `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/{z}/{x}/{y}?access_token=${Config.mapBoxToken}`,
				attributions: [
					'© <a href="https://www.mapbox.com/about/maps/">Mapbox</a>',
					'© <a href="https://www.openstreetmap.org/about/">OpenStreetMap contributors</a>'
				]
			}),
			visible: false
		});
		mapboxSatelliteLayer.setProperties({
			"layerId": "mapboxSatellite",
			"title": "Mapbox Satellite",
			"type": "baseLayer"
		});
		
		/*
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
		*/
		
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
		this.baseLayers.push(stamenTerrainLabelsLayer);
		//this.baseLayers.push(arcticDemLayer);
		this.baseLayers.push(osmLayer);
		this.baseLayers.push(openTopoLayer);
		this.baseLayers.push(mapboxSatelliteLayer);
		
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

	getBaseLayers() {
		return this.baseLayers;
	}

	getFeatureStyle(name = null) {
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
		this.olMap.addLayer(gbifLayer);
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

	setGeojsonData(data) {
		this.setData(data);
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

	exportMenu(anchorSelector, siteData = null) {
		var menu = {
			title: "<i class=\"fa fa-download result-map-control-icon\" aria-hidden=\"true\"></i><span class='result-map-tab-title'>Export</span>", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: anchorSelector+" .map-export-menu", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
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

		menu.items.push({
			name: "exportMap",
			title: "GeoJSON",
			tooltip: "",
			callback: () => {
				this.exportMapAsGeoJSON(siteData);
			}
		});

		return menu;
	}

	exportMapAsGeoJSON(siteData = null) {
		this.data.sead_meta = {
			"site": siteData.site_id ? siteData.site_id : "N/A",
			"description": this.sqs.config.dataExportDescription,
			"siteName": siteData.site_name ? siteData.site_name : "N/A",
			"url": siteData.site_id ? this.sqs.config.serverRoot+"/site/"+siteData.site_id : "N/A",
			"sead_reference": this.sqs.config.dataAttributionString,
			"license": this.sqs.config.dataLicense.name+" ("+this.sqs.config.dataLicense.url+")"
		};

		let blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/geo+json;' });
		let url = URL.createObjectURL(blob);

		// Create a link and trigger the download
		let a = document.createElement("a");
		a.href = url;
		a.download = "sead-site-sample-coordinates-export.geojson";
		document.body.appendChild(a);
		a.click();
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

	renderExportMenu(anchorSelector, siteData = null) {
		new SqsMenu(this.sqs, this.exportMenu(anchorSelector, siteData));
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
	setMapDataLayer(dataLayerId, hideAllOthers = true) {
		this.clearSelections();
		this.dataLayers.forEach((layer, index, array) => {
			if(layer.getProperties().layerId == dataLayerId && layer.getVisible() == false) {
				layer.setVisible(true);
				layer.getProperties().renderCallback(this);
			}
			if(hideAllOthers && layer.getProperties().layerId != dataLayerId && layer.getVisible() == true) {
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
				return this.getFeatureStyle().callback(this.olMap, featurePoints, feature);
			},
			zIndex: 1
		});
		
		clusterLayer.setProperties({
			"layerId": "clusterPoints",
			"type": "dataLayer"
		});

		if(this.getLayerByName("clusterPoints") != null) {
			this.removeLayer("clusterPoints");
		}

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
	renderPointsLayer(geoJsonData, styleType = null, featureProjection = "EPSG:3857") {
		var gf = new GeoJSON({
			featureProjection: featureProjection
		});
		var featurePoints = gf.readFeatures(geoJsonData);

		var pointsSource = new VectorSource({
			features: featurePoints
		});
		
		var clusterSource = new ClusterSource({
			distance: 0,
			source: pointsSource
		});
		
		var layer = new VectorLayer({
			source: clusterSource,
			style: this.getFeatureStyle().callback,
			zIndex: 1
		});
		
		layer.setProperties({
			"layerId": "points",
			"type": "dataLayer"
		});
		if(this.getLayerByName("points") != null) {
			this.removeLayer("points");
		}
		this.olMap.addLayer(layer);
		this.setMapDataLayer("points");
	}

	getFeaturesFromSamplePoints(points) {
		return points.map(point => {
			let olPoint = null;
			if(point.planarCoordSys == "EPSG:4326") {
				olPoint = new Point(fromLonLat([point.x, point.y]))
			}
			else {
				olPoint = new Point([point.x, point.y]);
			}
			return new Feature({
			  geometry: olPoint,
			  level: point.level,
			  name: point.sampleName,
			  sampleName: point.sampleName,
			  sampleGroupId: point.sampleGroupId,
			  sampleGroupName: point.sampleGroupName,
			  tooltip: point.tooltip,
			  z: point.z,
			  accuracy: point.accuracy,
			});
		});
	}

	addPointsLayerFromFeatures(layerName, featurePoints, styleType) {
		var pointsSource = new VectorSource({
			features: featurePoints
		});
		
		var clusterSource = new ClusterSource({
			distance: 0,
			source: pointsSource
		});

		var layer = new VectorLayer({
			source: clusterSource,
			style: styleType ? this.getFeatureStyle(styleType).callback : this.getFeatureStyle().callback,
			zIndex: 1
		});
		
		layer.setProperties({
			"layerId": layerName,
			"type": "dataLayer"
		});

		//remove any previous layer with the same name
		if(this.getLayerByName(layerName) != null) {
			this.removeLayer(layerName);
		}

		this.dataLayers.push(layer);
		this.olMap.addLayer(layer);
		this.setMapDataLayer(layerName, false);

		return layer;
	}

	updatePointsLayerFromFeatures(layerName, featurePoints) {
		let source = this.getLayerByName(layerName).getSource();
		source.clear();

		featurePoints.forEach(feature => {
			source.addFeature(feature);
		});
	}

	addPointsLayerFromGeoJSON(layerName, geoJsonData, styleType = null) {
		const featureProjection = "EPSG:3857";
		
		var gf = new GeoJSON({
			featureProjection: featureProjection
		});
		var featurePoints = gf.readFeatures(geoJsonData);

		var pointsSource = new VectorSource({
			features: featurePoints
		});
		
		var clusterSource = new ClusterSource({
			distance: 0,
			source: pointsSource
		});

		var layer = new VectorLayer({
			source: clusterSource,
			style: styleType ? this.getFeatureStyle(styleType).callback : this.getFeatureStyle().callback,
			zIndex: 1
		});
		
		layer.setProperties({
			"layerId": layerName,
			"type": "dataLayer"
		});

		//remove any previous layer with the same name
		if(this.getLayerByName(layerName) != null) {
			this.removeLayer(layerName);
		}

		this.dataLayers.push(layer);
		this.olMap.addLayer(layer);
		this.setMapDataLayer(layerName, false);

		return layer;
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

	getSampleGroupCoordinatesPointStyle(feature, options = { selected: false, highlighted: false }) {
		var pointsNum = feature.get('features').length;
		var clusterSizeText = pointsNum.toString();
		if(pointsNum > 999) {
			clusterSizeText = pointsNum.toString().substring(0, 1)+"k+";
		}
		let pointSize = 10;

		var zIndex = 0;
		
		//default values if point is not selected and not highlighted
		var fillColor = "rgba(0, 0, 180, 0.5)";
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

		/*
		let accuracyLevels = [
			'Precise',
			'Locality',
			'Parish',
			'Municipality',
			'County',
			'Landscape'
		];
		*/

		let styles = [];

		let featureAccuracy = "Precise";
		feature.get('features').forEach(f => {
			let fProp = f.getProperties();
			if(fProp.accuracy && fProp.accuracy != "Precise") {
				featureAccuracy = "Not precise";
			}
		});
		
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

		if(featureAccuracy == "Not precise") {
			styles.push(new Style({
				image: new CircleStyle({
					radius: 50,
					fill: new Fill({
						color: "rgba(0, 0, 180, 0.25)"
					})
				}),
				zIndex: 5,
				text: new Text({
					text: clusterSizeText == 1 ? "" : clusterSizeText,
					offsetY: 1,
					fill: new Fill({
						color: textColor
					})
				})
			}));
		}
		
		return styles;
	}

	getSampleCoordinatesPointStyle(feature, options = { selected: false, highlighted: false }) {
		let pointsNum = 1;
		if(feature.get('features')) {
			pointsNum = feature.get('features').length;
		}
		
		var clusterSizeText = pointsNum.toString();
		if(pointsNum > 999) {
			clusterSizeText = pointsNum.toString().substring(0, 1)+"k+";
		}
		let pointSize = 10;

		var zIndex = 0;
		
		//default values if point is not selected and not highlighted
		var fillColor = "rgba(180, 0, 0, 0.5)";
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

	getExtentFromFeatures(features) {
		let lngLow, lngHigh, latLow, latHigh;
		if (features.length > 0) {
			let lngs = features.map(feature => feature.getGeometry().getCoordinates()[0]);
			let lats = features.map(feature => feature.getGeometry().getCoordinates()[1]);

			lngLow = Math.min(...lngs);
			lngHigh = Math.max(...lngs);
			latLow = Math.min(...lats);
			latHigh = Math.max(...lats);
		}
		else {
			return null;
		}

		return [lngLow, latLow, lngHigh, latHigh];
	}

	combineExtents(extent1, extent2) {
        let combinedExtent = createEmpty();
        extend(combinedExtent, extent1);
        extend(combinedExtent, extent2);
        return combinedExtent;
    }

	fitToExtent(features, padding = 30, maxZoom = 15, localCoordinateSystem = false) {
		let data = features;

		if (data.length > 0) {
			let extent = this.getExtentFromFeatures(features);

			// Check for valid extent values
			if (extent.some(coord => coord == null || isNaN(coord))) {
				console.error("Invalid coordinates in extent", JSON.stringify(extent, null, 2));
				return;
			}

			this.olMap.getView().fit(extent, {
				padding: [padding, padding, padding, padding],
				maxZoom: maxZoom,
				duration: 500
			});
		} else {
			console.error("No data to fit extent.");
		}
	}
	
	fitToExtentGeojson(geojson = null, padding = 30, maxZoom = 15, localCoordinateSystem = false) {
		let data = geojson != null ? geojson : this.data.features;
		
		if (data.length > 0) {
			let lngs = data.map(feature => feature.geometry.coordinates[0]);
			let lats = data.map(feature => feature.geometry.coordinates[1]);
	
			let lngLow = Math.min(...lngs);
			let lngHigh = Math.max(...lngs);
			let latLow = Math.min(...lats);
			let latHigh = Math.max(...lats);
	
			// Determine the extent based on the coordinate system type
			let extent = localCoordinateSystem 
						 ? [lngLow, latLow, lngHigh, latHigh] 
						 : [fromLonLat([lngLow, latLow]), fromLonLat([lngHigh, latHigh])].flat();
	
			// Check for valid extent values
			if (extent.some(coord => coord == null || isNaN(coord))) {
				console.error("Invalid coordinates in extent", JSON.stringify(extent, null, 2));
				return;
			}
	
			this.olMap.getView().fit(extent, {
				padding: [padding, padding, padding, padding],
				maxZoom: maxZoom,
				duration: 500
			});
		} else {
			console.error("No data to fit extent.");
		}
	}

    render(renderTargetSelector) {
        let renderTarget = document.querySelector(renderTargetSelector);
		this.renderTargetSelector = renderTargetSelector;

		if($(renderTarget).width() == 0) {
			$(renderTarget).width(500);
		}
		if($(renderTarget).height() == 0) {
			$(renderTarget).height(500);
		}

        renderTarget.innerHTML = "";

		//create attribution and set its position to bottom left
		const attribution = new Attribution({
			collapsible: false,
			collapsed: false,
		});

		//create zoom control
		const zoomControl = new Zoom({
			zoomInTipLabel: 'Zoom in',
			zoomOutTipLabel: 'Zoom out'
		});

        this.olMap = new Map({
            target: renderTarget,
			attribution: true,
            controls: [attribution, zoomControl], //Add attribution and zoom controls
            /*
			layers: new GroupLayer({
                layers: this.baseLayers
            }),
            */
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

	addStandardBaseLayers() {
		this.baseLayers.forEach((layer, index, array) => {
			//only add if this layer doesn't already exist
			if(this.getLayerByName(layer.getProperties().layerId) == null) {
				this.olMap.addLayer(layer);
			}
		});
	}

	addSelectInteraction(selectStyle = null, clickablePopupElements = true) {
		if(this.selectInteraction != null) {
			this.olMap.removeInteraction(this.selectInteraction);
		}

		this.selectInteraction = this.createSelectInteraction(selectStyle, clickablePopupElements);
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

	addOverlayInfoBox(text, position = "bottom") {
		const overlayElement = document.createElement('div');
		overlayElement.style.position = 'absolute';
		overlayElement.className = 'ol-overlay-container-info-box';
		
		if(position == "bottom") {
			overlayElement.style.bottom = '1em';
		}
		if(position == "top") {
			overlayElement.style.top = '5em';
		}

		overlayElement.innerText = text;

		$(this.renderTargetSelector).append(overlayElement);
	}

	removeOverlayInfoBox() {
		$(this.renderTargetSelector).find('.ol-overlay-container').remove();
	}

	createSelectInteraction(selectStyle = null, clickablePopupElements = true) {
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
				let dataLayer = this.getVisibleDataLayer();
				if(!dataLayer) {
					console.warn("No visible data layer");
					return;
				}
				if(dataLayer.getProperties().layerId == "clusterPoints") {
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
				//if this is a single point
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
				//if this is a cluster point
				$(popupContainer).show();

				var feature = evt.selected[0];
				var coords = feature.getGeometry().getCoordinates();
				var prop = evt.selected[0].getProperties();

				$(popupContainer).html("<table><tbody></tbody></table>")

				var tableRows = "";

				for(var fk in prop.features) {
					let fprop = prop.features[fk].getProperties();
					let data = JSON.stringify({
						sampleName: fprop.sampleName,
						sampleGroupId: fprop.sampleGroupId,
						sampleGroupName: fprop.sampleGroupName
					});

					let textClass = "sample-map-tooltip-link";
					if(!clickablePopupElements) {
						textClass = "sample-map-tooltip-text";
					}

					let ttSampleId = "tt-"+nanoid();
					tableRows += "<tr data='"+data+"' row-id='"+fprop.id+"'>";
					tableRows += "<td><span id='"+ttSampleId+"' class='"+textClass+"'>"+fprop.tooltip+"</span></td>";
					tableRows += "</tr>";

					if(clickablePopupElements) {
						$(popupContainer).on('click', "#"+ttSampleId, () => {
							let sr = this.sqs.siteReportManager.siteReport;
							sr.focusOn({ section: "samples" });
							
							if(fprop.level == "Sample group") {
								sr.highlightSampleGroupRow(fprop.sampleGroupId);
							}
							if(fprop.level == "Sample") {
								sr.pageFlipToSampleGroup(fprop.sampleGroupId, fprop.sampleGroupName);
								sr.expandSampleGroup(fprop.sampleGroupId, fprop.name);
								sr.pageFlipToSample(fprop.sampleGroupId, fprop.name);
								let success = sr.scrollToSample(fprop.sampleGroupId, fprop.name);
								if(!success) {
									this.sqs.notificationManager.notify("Sample not found", "error");
									return false;
								}
								sr.highlightSampleRow(fprop.sampleGroupId, fprop.name);
							}
							
						});
					}
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

	pointsToGeoJSON(points) {
		let geojson = {
			"type": "FeatureCollection",
			"features": []
		};

		let localCoordinateSystemFound = false;
		let epsg4326CoordinateSystemFound = false;
		
		points.forEach(point => {

			if(point.planarCoordSys == "EPSG:4326") {
				epsg4326CoordinateSystemFound = true;
			}
			else {
				localCoordinateSystemFound = true;
			}

			let feature = {
				"type": "Feature",
				"geometry": {
					"type": "Point",
					"coordinates": [point.x, point.y]
				},
				"properties": {
					"sampleGroupId": point.sampleGroupId,
					"sampleGroupName": point.sampleGroupName,
					"tooltip": point.tooltip ? point.tooltip : "No information available",
					"level": point.level ? point.level : "N/A",
				}
			};
			geojson.features.push(feature);
		});

		if(localCoordinateSystemFound && !epsg4326CoordinateSystemFound) {
			geojson.coordinateSystem = "local";
		}
		if(epsg4326CoordinateSystemFound && !localCoordinateSystemFound) {
			geojson.coordinateSystem = "EPSG:4326";
		}
		if(localCoordinateSystemFound && epsg4326CoordinateSystemFound) {
			geojson.coordinateSystem = "mixed";
		}
		if(!localCoordinateSystemFound && !epsg4326CoordinateSystemFound) {
			geojson.coordinateSystem = "unknown";
		}

		return geojson;
	}

	coordinatesToPoints(coordinates) {
		//do some lookups on the method and dimension unit_id's
		coordinates.forEach(coord => {
			if(coord.coordinate_method && coord.coordinate_method.unit_id) {
				this.sqs.siteReportManager.siteReport.siteData.lookup_tables.units.forEach(unit => {
					if(unit.unit_id == coord.coordinate_method.unit_id) {
						coord.coordinate_method.unit = unit;
					}
				});
			}
			if(coord.dimension && coord.dimension.unit_id) {
				this.sqs.siteReportManager.siteReport.siteData.lookup_tables.units.forEach(unit => {
					if(unit.unit_id == coord.dimension.unit_id) {
						coord.dimension.unit = unit;
					}
				});
			}
		});

		let points = [];
		if(coordinates.length == 0) {
			return;
		}

		//if we have coordinates..
		//1. if something which can be translated to wgs84 is available, choose it
		let planarCoordPairs = this.filterAndPairPlanarCoordinates(coordinates);
		let coordinatePair = null;
		if(planarCoordPairs.length > 0) {
			//planarCoordSys = planarCoords[0].coordinate_method;
			coordinatePair = this.preparePlanarCoordinates(planarCoordPairs);
		}

		//a sample can have multiple z-coordinates, such as in the case where we have both "Depth from surface lower sample boundary" and "Depth from surface upper sample boundary"
		let zCoords = this.getZCoordinatesFromCoordinates(coordinates);
		let zCoordPresentation = "";

		zCoords.forEach(zCoord => {
			if(zCoordPresentation != "") {
				zCoordPresentation += ", ";
			}
			zCoordPresentation += this.getZcoordinateAsString(zCoord);
		});

		points.push({
			x: coordinatePair ? coordinatePair.coordinates[0] : null,
			y: coordinatePair ? coordinatePair.coordinates[1] : null,
			z: zCoords,
			zString: zCoordPresentation,
			planarCoordSys: coordinatePair ? coordinatePair.coordinateSystem : null,
			sampleName: "",
			tooltip: "",
			sampleGroupId: "",
			sampleGroupName: ""
		});

		return points;
	}

	sampleGroupToPoints(sampleGroup) {
		let points = this.coordinatesToPoints(sampleGroup.coordinates);
		
		if(points.length > 0) {
			points[0].sampleGroupId = sampleGroup.sample_group_id;
			points[0].sampleGroupName = sampleGroup.sample_group_name;
			points[0].tooltip = sampleGroup.sample_group_name;
		}
		
		return points;
	}

	filterAndPairPlanarCoordinates(coordinates) {
		let planarCoords = [];
		coordinates.forEach(coordinate => {
			if(this.sqs.config.xyCoordinateDimensionIds.includes(coordinate.dimension.dimension_id)) {
				planarCoords.push(coordinate);
			}
		});

		//match coordinate pairs based on their coordinate_method_id
		let uniqueCoordinatePairs = [];
		let coordinateMethodIds = [];
		planarCoords.forEach(coordinate => {
			if(!coordinateMethodIds.includes(coordinate.coordinate_method.method_id)) {
				coordinateMethodIds.push(coordinate.coordinate_method.method_id);
			}
		});

		coordinateMethodIds.forEach(methodId => {
			let coordinatePair = [];
			planarCoords.forEach(coordinate => {
				if(coordinate.coordinate_method.method_id == methodId) {
					coordinatePair.push(coordinate);
				}
			});
			if(coordinatePair.length == 2) {
				uniqueCoordinatePairs.push(coordinatePair);
			}
		});

		return uniqueCoordinatePairs;
	}

	preparePlanarCoordinates(coordinatePairs) {
		// ---------------------------------------------------------------------------
		// Projections (define once)
		// ---------------------------------------------------------------------------
		if (!this._projDefsInitialized) {
			// WGS84 (EPSG:4326) – explicit, for clarity/consistency
			proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

			// SWEREF99 TM (EPSG:3006) – correct definition (NOT UTM zone 33)
			// Central meridian 15, scale 0.9996, false easting 500000.
			proj4.defs(
			"EPSG:3006",
			"+proj=tmerc +lat_0=0 +lon_0=15 +k=0.9996 +x_0=500000 +y_0=0 " +
				"+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
			);

			// RT90 family (Bessel + 7-param Helmert to WGS84)
			proj4.defs(
			"EPSG:3018", // RT90 0.0 gon V
			"+proj=tmerc +lat_0=0 +lon_0=18.0582777777778 +k=1 +x_0=1500000 +y_0=0 " +
				"+ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs"
			);
			proj4.defs(
			"EPSG:3019", // RT90 2.5 gon V?  (Do NOT rely on this label; see below.)
			"+proj=tmerc +lat_0=0 +lon_0=11.3082777777778 +k=1 +x_0=1500000 +y_0=0 " +
				"+ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs"
			);
			proj4.defs(
			"EPSG:3020", // RT90 5 gon V  (this is the one you asked about)
			"+proj=tmerc +lat_0=0 +lon_0=13.5582777777778 +k=1 +x_0=1500000 +y_0=0 " +
				"+ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs"
			);
			proj4.defs(
			"EPSG:3021", // RT90 2.5 gon V
			"+proj=tmerc +lat_0=0 +lon_0=15.8082777777778 +k=1 +x_0=1500000 +y_0=0 " +
				"+ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs"
			);
			proj4.defs(
			"EPSG:3024", // RT90 0 gon
			"+proj=tmerc +lat_0=0 +lon_0=20.8082777777778 +k=1 +x_0=1500000 +y_0=0 " +
				"+ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs"
			);

			// UTM helpers used in your switch (leave as inline strings in calls, or define)
			proj4.defs(
			"EPSG:32632",
			"+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs"
			);
			proj4.defs(
			"EPSG:32633",
			"+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs"
			);

			// Keep any local grids you actually use
			proj4.defs(
			"gothenburg-local",
			"+proj=tmerc +lat_0=0 +lon_0=11.304996 +k=1.00000867 " +
				"+x_0=-6370680.1969 +y_0=-80.0124 +ellps=GRS80 +units=m +no_defs"
			);

			this._projDefsInitialized = true;
		}

		// ---------------------------------------------------------------------------
		// Select best coordinate pair based on configured priority
		// ---------------------------------------------------------------------------
		const coordinateSystemPriority = this.sqs.config.coordinateSystemPriority;
		let selectedCoordinates = null;

		coordinatePairs.forEach((pair) => {
			if (
			selectedCoordinates == null ||
			coordinateSystemPriority.indexOf(pair[0].coordinate_method.method_id) <
				coordinateSystemPriority.indexOf(
				selectedCoordinates[0].coordinate_method.method_id
				)
			) {
			selectedCoordinates = pair;
			}
		});

		if (!selectedCoordinates || selectedCoordinates.length === 0) return null;

		// ---------------------------------------------------------------------------
		// Normalize axes: workingCoordinates.x = Easting, workingCoordinates.y = Northing
		// ---------------------------------------------------------------------------
		const workingCoordinates = { x: null, y: null, method: null };

		selectedCoordinates.forEach((coordinate) => {
			const dn = coordinate.dimension.dimension_name;

			// Your naming is inconsistent across sources; handle all four labels.
			if (dn === "X/North" || dn === "Y/North") workingCoordinates.y = coordinate;
			if (dn === "Y/East" || dn === "X/East") workingCoordinates.x = coordinate;
		});

		if (!workingCoordinates.x || !workingCoordinates.y) {
			// Happens e.g. if only Z is present.
			return null;
		}

		workingCoordinates.method = workingCoordinates.x.coordinate_method;

		// IMPORTANT: proj4 expects [x,y] = [easting, northing] for projected CRS.
		const XY = [
			Number(workingCoordinates.x.measurement),
			Number(workingCoordinates.y.measurement),
		];

		let outputCoords = null;
		let coordinateSystem = null;

		switch (workingCoordinates.x.coordinate_method.method_id) {
			case 113: // "Malmö stads koordinatnät"
			case 105: // "Local grid"
			case 108: // "Göteborgs kommuns koordinatsystem" (treat as local)
			outputCoords = XY;
			coordinateSystem = "local";
			break;

			case 103: // "RT90 5 gon V"
			// FIX: Use EPSG:3020 (RT90 5 gon V), not 3019
			outputCoords = proj4("EPSG:3020", "EPSG:4326", XY); // => [lon, lat]
			coordinateSystem = "EPSG:4326";
			break;

			case 69: // "RT90 2.5 gon V"
			// Use EPSG:3021; ensure you do not redefine EPSG:3021 elsewhere
			outputCoords = proj4("EPSG:3021", "EPSG:4326", XY);
			coordinateSystem = "EPSG:4326";
			break;

			case 72: // "WGS84" (already lon/lat in many systems; assumes [lon,lat] stored as X=lon, Y=lat)
			// If your storage is [lat,lon], swap here—do not guess. This preserves your prior behavior.
			outputCoords = [workingCoordinates.x.measurement, workingCoordinates.y.measurement];
			coordinateSystem = "EPSG:4326";
			break;

			case 70: // "SWEREF 99 TM (Swedish)"
			// FIX: EPSG:3006 is SWEREF99 TM; our definition is corrected above
			outputCoords = proj4("EPSG:3006", "EPSG:4326", XY);
			coordinateSystem = "EPSG:4326";
			break;

			case 114: // "WGS84 UTM zone 32"
			// FIX: do not swap axes; XY is [E,N]
			outputCoords = proj4("EPSG:32632", "EPSG:4326", XY);
			coordinateSystem = "EPSG:4326";
			break;

			case 120: // "WGS84 UTM zone 33N"
			// FIX: do not swap axes; XY is [E,N]
			outputCoords = proj4("EPSG:32633", "EPSG:4326", XY);
			coordinateSystem = "EPSG:4326";
			break;

			case 123: // "UTM U32 euref89" (commonly ETRS89 / UTM 32N)
			// ETRS89 is practically WGS84 for most mapping use; keep GRS80 ellipsoid.
			outputCoords = proj4(
				"+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
				"EPSG:4326",
				XY
			);
			coordinateSystem = "EPSG:4326";
			break;

			// Heights/depths etc. are intentionally ignored here (no planar output)
			case 78: // "Height from datum"
			case 80: // "Height from surface"
			case 77: // "Depth from reference level"
			case 76: // "Altitude above sea level"
			case 79: // "Depth from surface"
			case 121: // "Rikets höjdsystem 1900"
			case 102: // "RH70"
			case 115: // "Depth from surface lower sample boundary"
			case 116: // "Depth from surface upper sample boundary"
			case 122: // "Depth from surface lower sample boundary "
			case 125: // "Upper sample boundary"
			case 126: // "Lower sample boundary depth"
			outputCoords = null;
			coordinateSystem = null;
			break;

			default:
			console.warn(
				"WARN: Support for coordinate method not implemented: " +
				workingCoordinates.x.coordinate_method.method_name
			);
			outputCoords = null;
			coordinateSystem = null;
		}

		return {
			coordinates: outputCoords,
			coordinateSystem,
		};
	}

	getZCoordinatesFromCoordinates(coordinates) {
		let zCoords = [];
		coordinates.forEach(coordinate => {
			if(this.sqs.config.zCoordinateDimensionIds.includes(coordinate.dimension.dimension_id)) {
				zCoords.push(coordinate);
			}
		});

		return zCoords;
	}

	getZcoordinateAsString(zCoord) {
		if(!zCoord) {
			return null;
		}
		
		let zCoordPresentation = "";
		if(zCoord && zCoord.measurement) {
			let title = zCoord.coordinate_method.method_abbrev_or_alt_name ? zCoord.coordinate_method.method_abbrev_or_alt_name : zCoord.coordinate_method.method_name;
			let unitString = "";
			if(typeof zCoord.coordinate_method.unit != "undefined") {
				unitString = zCoord.coordinate_method.unit.unit_abbrev ? zCoord.coordinate_method.unit.unit_abbrev : zCoord.coordinate_method.unit.unit_name;
			}

			let accuracyString = "";
			if(zCoord.accuracy) {
				accuracyString = " (Accuracy: ±"+parseFloat(zCoord.accuracy)+" "+unitString+")";
			}

			zCoordPresentation = title+" "+parseFloat(zCoord.measurement)+" "+unitString+accuracyString;
		}

		return zCoordPresentation;
	}

}

export default OpenLayersMap;