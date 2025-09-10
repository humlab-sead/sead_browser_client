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
import { Attribution } from 'ol/control';
import XYZ from 'ol/source/XYZ';
import Config from '../../config/config.json';


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
		this.renderIntoNode = renderIntoNode;
		this.includeTimeline = includeTimeline;

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
		this.baseLayers = [];
		this.dataLayers = [];
		this.auxLayers = [];
        this.currentZoomLevel = 4;
		this.selectPopupOverlay = null;
		this.selectInteraction = null;
		this.timeline = null;
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

		//Define base layers
		let stamenLayer = new TileLayer({
			source: new StadiaMaps({
				layer: 'stamen_terrain_background',
				wrapX: true,
				url: "https://tiles-eu.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}.png",
				attributions: ['&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a>', 
					'&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a>',
					'&copy; <a href="https://www.openstreetmap.org/about/" target="_blank">OpenStreetMap contributors</a>',
					'&copy; <a href="https://stamen.com/" target="_blank">Stamen Design</a>'],
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

		let osmLayer = new TileLayer({
			source: new OSM({
				attributions: [
					'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>'
				]
			}),
			visible: false
		});
		osmLayer.setProperties({
			"layerId": "osm",
			"title": "OpenStreetMap",
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

		let sguTopoLayerUrl = "https://maps3.sgu.se/geoserver/wms";
		let sguTopoLayer = new TileLayer({
			source: new TileWMS({
				url: sguTopoLayerUrl,
				params: {
					'LAYERS': '', // jord:SE.GOV.SGU.JORD.GRUNDLAGER.1M
					'TILED': false,
					'FORMAT': 'image/png',
					'TRANSPARENT': true,
					'SRS': 'EPSG:3857', // Web Mercator for OpenLayers compatibility
					'STYLES': '' //JORD_1M_Grundlager
				},
				serverType: 'geoserver',
				attributions: [
					'© <a href="https://www.sgu.se/" target="_blank">Sveriges geologiska undersökning (SGU)</a>',
					'© <a href="https://www.lantmateriet.se/" target="_blank">Lantmäteriet</a>'
				]
			}),
			visible: false
		});

		sguTopoLayer.setProperties({
			"layerId": "sguTopo",
			"title": "SGU",
			"type": "auxLayer",
			"legend": true,
			"pendingMetaDataLoad": true
		});

		this.fetchWmsLayerInfo(sguTopoLayerUrl).then(layers => {

			const sguKeepList = [
				"strandforskjmodell_bp100_vy",
				"strandforskjmodell_bp200_vy",
				"strandforskjmodell_bp300_vy",
				"strandforskjmodell_bp400_vy",
				"strandforskjmodell_bp500_vy",
				"strandforskjmodell_bp600_vy",
				"strandforskjmodell_bp700_vy",
				"strandforskjmodell_bp800_vy",
				"strandforskjmodell_bp900_vy",
				"strandforskjmodell_bp1000_vy",
				"strandforskjmodell_bp1200_vy",
				"strandforskjmodell_bp1300_vy",
				"strandforskjmodell_bp1400_vy",
				"strandforskjmodell_bp1500_vy",
				"strandforskjmodell_bp1600_vy",
				"strandforskjmodell_bp1700_vy",
				"strandforskjmodell_bp1800_vy",
				"strandforskjmodell_bp1900_vy",
				"strandforskjmodell_bp2000_vy",
				"strandforskjmodell_bp2100_vy",
				"strandforskjmodell_bp2200_vy",
				"strandforskjmodell_bp2300_vy",
				"strandforskjmodell_bp2400_vy",
				"strandforskjmodell_bp2500_vy",
				"strandforskjmodell_bp2600_vy",
				"strandforskjmodell_bp2700_vy",
				"strandforskjmodell_bp2800_vy",
				"strandforskjmodell_bp2900_vy",
				"strandforskjmodell_bp3000_vy",
				"strandforskjmodell_bp3100_vy",
				"strandforskjmodell_bp3200_vy",
				"strandforskjmodell_bp3300_vy",
				"strandforskjmodell_bp3400_vy",
				"strandforskjmodell_bp3500_vy",
				"strandforskjmodell_bp3600_vy",
				"strandforskjmodell_bp3700_vy",
				"strandforskjmodell_bp3800_vy",
				"strandforskjmodell_bp3900_vy",
				"strandforskjmodell_bp4000_vy",
				"strandforskjmodell_bp4100_vy",
				"strandforskjmodell_bp4200_vy",
				"strandforskjmodell_bp4300_vy",
				"strandforskjmodell_bp4400_vy",
				"strandforskjmodell_bp4500_vy",
				"strandforskjmodell_bp4600_vy",
				"strandforskjmodell_bp4700_vy",
				"strandforskjmodell_bp4800_vy",
				"strandforskjmodell_bp4900_vy",
				"strandforskjmodell_bp5000_vy",
				"strandforskjmodell_bp5100_vy",
				"strandforskjmodell_bp5200_vy",
				"strandforskjmodell_bp5300_vy",
				"strandforskjmodell_bp5400_vy",
				"strandforskjmodell_bp5500_vy",
				"strandforskjmodell_bp5600_vy",
				"strandforskjmodell_bp5700_vy",
				"strandforskjmodell_bp5800_vy",
				"strandforskjmodell_bp5900_vy",
				"strandforskjmodell_bp6000_vy",
				"strandforskjmodell_bp6100_vy",
				"strandforskjmodell_bp6200_vy",
				"strandforskjmodell_bp6300_vy",
				"strandforskjmodell_bp6400_vy",
				"strandforskjmodell_bp6500_vy",
				"strandforskjmodell_bp6600_vy",
				"strandforskjmodell_bp6700_vy",
				"strandforskjmodell_bp6800_vy",
				"strandforskjmodell_bp6900_vy",
				"strandforskjmodell_bp7000_vy",
				"strandforskjmodell_bp7100_vy",
				"strandforskjmodell_bp7200_vy",
				"strandforskjmodell_bp7300_vy",
				"strandforskjmodell_bp7400_vy",
				"strandforskjmodell_bp7500_vy",
				"strandforskjmodell_bp7600_vy",
				"strandforskjmodell_bp7700_vy",
				"strandforskjmodell_bp7800_vy",
				"strandforskjmodell_bp7900_vy",
				"strandforskjmodell_bp8000_vy",
				"strandforskjmodell_bp8100_vy",
				"strandforskjmodell_bp8200_vy",
				"strandforskjmodell_bp8300_vy",
				"strandforskjmodell_bp8400_vy",
				"strandforskjmodell_bp8500_vy",
				"strandforskjmodell_bp8600_vy",
				"strandforskjmodell_bp8700_vy",
				"strandforskjmodell_bp8800_vy",
				"strandforskjmodell_bp8900_vy",
				"strandforskjmodell_bp9000_vy",
				"strandforskjmodell_bp9100_vy",
				"strandforskjmodell_bp9200_vy",
				"strandforskjmodell_bp9300_vy",
				"strandforskjmodell_bp9400_vy",
				"strandforskjmodell_bp9500_vy",
				"strandforskjmodell_bp9600_vy",
				"strandforskjmodell_bp9700_vy",
				"strandforskjmodell_bp9800_vy",
				"strandforskjmodell_bp9900_vy",
				"strandforskjmodell_bp10000_vy",
				"strandforskjmodell_bp10100_vy",
				"strandforskjmodell_bp10200_vy",
				"strandforskjmodell_bp10300_vy",
				"strandforskjmodell_bp10400_vy",
				"strandforskjmodell_bp10500_vy",
				"strandforskjmodell_bp10600_vy",
				"strandforskjmodell_bp10700_vy",
				"strandforskjmodell_bp10800_vy",
				"strandforskjmodell_bp10900_vy",
				"strandforskjmodell_bp11000_vy",
				"strandforskjmodell_bp11100_vy",
				"strandforskjmodell_bp11200_vy",
				"strandforskjmodell_bp11300_vy",
				"strandforskjmodell_bp11400_vy",
				"strandforskjmodell_bp11500_vy",
				"strandforskjmodell_bp11600_vy",
				"strandforskjmodell_bp11700_vy",
				"strandforskjmodell_bp11800_vy",
				"strandforskjmodell_bp11900_vy",
				"strandforskjmodell_bp12000_vy",
				"strandforskjmodell_bp12100_vy",
				"strandforskjmodell_bp12200_vy",
				"strandforskjmodell_bp12300_vy",
				"strandforskjmodell_bp12400_vy",
				"strandforskjmodell_bp12500_vy",
				"strandforskjmodell_bp12600_vy",
				"strandforskjmodell_bp12700_vy",
				"strandforskjmodell_bp12800_vy",
				"strandforskjmodell_bp12900_vy",
				"strandforskjmodell_bp13000_vy",
				"strandforskjmodell_bp13100_vy",
				"strandforskjmodell_bp13200_vy",
				"strandforskjmodell_bp13300_vy",
				"strandforskjmodell_bp13400_vy",
				"strandforskjmodell_bp13500_vy",
				"bekv_kartform_vy",
				"bekv_bkvv_vy",
				"stre_erof_prognos_vy",
				"stre_eros_index_vy_v2",
				"stre_eros_skydd_vy",
				"stre_eros_skydd_v2_vy",
				"landform_poly_fluvial_vy",
				"v_er_fossil_fuel_resource",
				"v_geologicunit_surficial_25_100_poly",
				"v_geologicunit_surficial_25_100_point",
				"v_geologicunit_surficial_750_poly",
				"jkar_abcdg_jg2_genomslapp_vy",
				"plan_undersokningsomrade_geofysik_vy",
				"plan_undersokningsomrade_geokemi_vy",
				"stre_nnh_moh_1_vy_v2",
				"stre_nnh_moh_15_vy",
				"stre_nnh_moh_15_vy_v2",
				"stre_nnh_moh_2_vy",
				"stre_nnh_moh_2_vy_v2",
				"stre_nnh_moh_3_vy",
				"stre_nnh_moh_3_vy_v2",
				"skugga",
				"genomslapplighet_berg",
				"malo_sont_vy",
				"mare_sont_vy",
				"bark_brunnar_icke_energi_vy",
				"malm_malmer_ferrous_metals_vy",
				"jkar_abcdg_jg2_stre_vy",
				"jdjupmod_und_djup_min_vy",
				"blab_kemi_ree_y_tot_vy",
				"mark_moran_salpeter_icpms_sr_vy",
				"bmod_struktur_textursymbol_vy",
				"made_matl_vy"
			];


			console.log(layers);

			layers.flat.filter(layer => !sguKeepList.includes(layer.abstract)).forEach(layer => {
				let index = layers.flat.indexOf(layer);
				if (index > -1) {
					layers.flat.splice(index, 1);
				}
			});

			layers.layers.filter(layer => !sguKeepList.includes(layer.abstract)).forEach(layer => {
				let index = layers.layers.indexOf(layer);
				if (index > -1) {
					layers.layers.splice(index, 1);
				}
			});

			layers.tree.forEach(layerGroup => {
				layerGroup.children.filter(layer => !sguKeepList.includes(layer.abstract)).forEach(layer => {
					let index = layerGroup.children.indexOf(layer);
					if (index > -1) {
						layerGroup.children.splice(index, 1);
					}
				});
			});

			sguTopoLayer.setProperties({
				"subLayers": layers.flat,
				"subLayersTree": layers.tree,
				"pendingMetaDataLoad": false
			});
		});


		// Aux layers
		let msbFloodingLayerUrl = "https://gisapp.msb.se/arcgis/services/Oversvamningskarteringar/karteringar/MapServer/WmsServer";
		const msbFloodingLayer = new TileLayer({
			source: new TileWMS({
				url: msbFloodingLayerUrl,
				params: {
					'LAYERS': '6', // adjust per capabilities
					'TILED': true,
					'FORMAT': 'image/png'
				},
				serverType: 'geoserver', // or 'mapserver', etc.
				attributions: [
					'© <a href="https://www.msb.se/" target="_blank">MSB</a>'
				]
			}),
			visible: false
		});


		msbFloodingLayer.setProperties({
			"layerId": "msbFlooding",
			"title": "MSB Flooding",
			"type": "auxLayer",
			"subLayers": [],
			"legend": false,
			"pendingMetaDataLoad": true
		});

		this.fetchWmsLayerInfo(msbFloodingLayerUrl).then(layers => {
			//remove the layer at index 0, because it's empty - this is assuming msb floods 
			//layers.shift();

			msbFloodingLayer.setProperties({
				"subLayers": layers.flat,
				"subLayersTree": layers.tree,
				"pendingMetaDataLoad": false
			});

			if(msbFloodingLayer.getProperties().subLayers.length > 0) {
				//set a default subLayer
				msbFloodingLayer.setProperties({
					"selectedSubLayer": 15 //set 15 as the default, which is "Översvämningskarterade vattendrag, översikt"
				});
			}
		});

		let raaWmsUrl = "https://pub.raa.se/visning/uppdrag_v1/wms";
		const raaWmsLayer = new TileLayer({
			source: new TileWMS({
				url: raaWmsUrl,
				params: {
					'LAYERS': '', // Will be set by sublayer selection
					'TILED': true,
					'FORMAT': 'image/png',
					'TRANSPARENT': true,
					'SRS': 'EPSG:3857'
				},
				serverType: 'geoserver',
				attributions: [
					'© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
				]
			}),
			visible: false
		});

		raaWmsLayer.setProperties({
			"layerId": "raaWms",
			"title": "RAÄ Arkeologiska uppdrag",
			"type": "auxLayer",
			"subLayers": [],
			"legend": true,
			"pendingMetaDataLoad": true
		});

		this.fetchWmsLayerInfo(raaWmsUrl).then(layers => {
			console.log(layers);
			// Remove the first layer if it's a group/root layer with no name
			if (layers.length && !layers[0].name) layers.shift();
			raaWmsLayer.setProperties({
				"subLayers": layers.flat,
				"subLayersTree": layers.tree,
				"pendingMetaDataLoad": false
			});
			// Optionally set a default sublayer
			if (raaWmsLayer.getProperties().subLayers.length > 0) {
				raaWmsLayer.setProperties({
					"selectedSubLayer": raaWmsLayer.getProperties().subLayers[0].name
				});
			}
		});

		let raaBebyggelseWmsUrl = "https://pub.raa.se/visning/bebyggelse_kulturhistoriskt_inventerad_v1/wms";
		const raaBebyggelseLayer = new TileLayer({
			source: new TileWMS({
				url: raaBebyggelseWmsUrl,
				params: {
					'LAYERS': '', // Will be set by sublayer selection
					'TILED': true,
					'FORMAT': 'image/png',
					'TRANSPARENT': true,
					'SRS': 'EPSG:3857',
				},
				serverType: 'geoserver',
				attributions: [
					'© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
				]
			}),
			visible: false
		});

		raaBebyggelseLayer.setProperties({
			"layerId": "raaBebyggelse",
			"title": "RAÄ Kulturhistoriskt inventerad bebyggelse",
			"type": "auxLayer",
			"subLayers": [],
			"legend": true,
			"pendingMetaDataLoad": true
		});

		this.fetchWmsLayerInfo(raaBebyggelseWmsUrl).then(layers => {
			// Remove the first layer if it's a group/root layer with no name
			if (layers.length && !layers[0].name) layers.shift();
			raaBebyggelseLayer.setProperties({
				"subLayers": layers.flat,
				"subLayersTree": layers.tree,
				"pendingMetaDataLoad": false
			});
			// Optionally set a default sublayer
			if (raaBebyggelseLayer.getProperties().subLayers.length > 0) {
				raaBebyggelseLayer.setProperties({
					"selectedSubLayer": raaBebyggelseLayer.getProperties().subLayers[0].name
				});
			}
		});

		const raaByggnadsminnenSkyddsomradenUrl = "https://pub.raa.se/visning/enskilda_och_statliga_byggnadsminnen_skyddsomraden_v1/wms";
		const raaByggnadsminnenSkyddsomradenLayer = new TileLayer({
			source: new TileWMS({
				url: raaByggnadsminnenSkyddsomradenUrl,
				params: {
					'LAYERS': '', // Will be set by sublayer selection
					'TILED': true,
					'FORMAT': 'image/png',
					'TRANSPARENT': true,
					'SRS': 'EPSG:3857'
				},
				serverType: 'geoserver',
				attributions: [
					'© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
				]
			}),
			visible: false
		});

		raaByggnadsminnenSkyddsomradenLayer.setProperties({
			"layerId": "raaByggnadsminnenSkyddsomraden",
			"title": "RAÄ Byggnadsminnen och skyddsområden",
			"type": "auxLayer",
			"subLayers": [],
			"legend": true,
			"pendingMetaDataLoad": true
		});

		this.fetchWmsLayerInfo(raaByggnadsminnenSkyddsomradenUrl).then(layers => {
			// Remove the first layer if it's a group/root layer with no name
			if (layers.length && !layers[0].name) layers.shift();
			raaByggnadsminnenSkyddsomradenLayer.setProperties({
				"subLayers": layers.flat,
				"subLayersTree": layers.tree,
				"pendingMetaDataLoad": false
			});
			// Optionally set a default sublayer
			if (raaByggnadsminnenSkyddsomradenLayer.getProperties().subLayers.length > 0) {
				raaByggnadsminnenSkyddsomradenLayer.setProperties({
					"selectedSubLayer": raaByggnadsminnenSkyddsomradenLayer.getProperties().subLayers[0].name
				});
			}
		});

		let raaBuildingsAndChurchesUrl = "https://inspire-raa.metria.se/geoserver/Byggnader/ows";
        const raaBuildingsAndChurchesLayer = new TileLayer({
            source: new TileWMS({
                url: raaBuildingsAndChurchesUrl,
                params: {
                    'LAYERS': '', // Will be set by sublayer selection
                    'TILED': true,
                    'FORMAT': 'image/png',
                    'TRANSPARENT': true,
                    'SRS': 'EPSG:3857'
                },
                serverType: 'geoserver',
                attributions: [
                    '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
                ]
            }),
            visible: false
        });

        raaBuildingsAndChurchesLayer.setProperties({
            "layerId": "raaBuildingsAndChurches",
            "title": "RAÄ Byggnader och kyrkor",
            "type": "auxLayer",
            "subLayers": [],
            "legend": true,
            "pendingMetaDataLoad": true
        });

        this.fetchWmsLayerInfo(raaBuildingsAndChurchesUrl).then(layers => {
            // Remove the first layer if it's a group/root layer with no name
            if (layers.length && !layers[0].name) layers.shift();
            raaBuildingsAndChurchesLayer.setProperties({
                "subLayers": layers.flat,
				"subLayersTree": layers.tree,
                "pendingMetaDataLoad": false
            });
            // Optionally set a default sublayer
            if (raaBuildingsAndChurchesLayer.getProperties().subLayers.length > 0) {
                raaBuildingsAndChurchesLayer.setProperties({
                    "selectedSubLayer": raaBuildingsAndChurchesLayer.getProperties().subLayers[0].name
                });
            }
        });

		let raaBuildingsRuinsUrl = "https://inspire-raa.metria.se/geoserver/ByggnaderRuiner/ows";
        const raaBuildingsRuinsLayer = new TileLayer({
            source: new TileWMS({
                url: raaBuildingsRuinsUrl,
                params: {
                    'LAYERS': '', // Will be set by sublayer selection
                    'TILED': true,
                    'FORMAT': 'image/png',
                    'TRANSPARENT': true,
                    'SRS': 'EPSG:3857'
                },
                serverType: 'geoserver',
                attributions: [
                    '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
                ]
            }),
            visible: false
        });

        raaBuildingsRuinsLayer.setProperties({
            "layerId": "raaBuildingsRuins",
            "title": "RAÄ Byggnader och ruiner",
            "type": "auxLayer",
            "subLayers": [],
            "legend": true,
            "pendingMetaDataLoad": true
        });

        this.fetchWmsLayerInfo(raaBuildingsRuinsUrl).then(layers => {
            // Remove the first layer if it's a group/root layer with no name
            if (layers.length && !layers[0].name) layers.shift();
            raaBuildingsRuinsLayer.setProperties({
                "subLayers": layers.flat,
				"subLayersTree": layers.tree,
                "pendingMetaDataLoad": false
            });
            // Optionally set a default sublayer
            if (raaBuildingsRuinsLayer.getProperties().subLayers.length > 0) {
                raaBuildingsRuinsLayer.setProperties({
                    "selectedSubLayer": raaBuildingsRuinsLayer.getProperties().subLayers[0].name
                });
            }
        });

		let raaKulturarvUrl = "https://inspire-raa.metria.se/geoserver/Kulturarv/ows";
        const raaKulturarvLayer = new TileLayer({
            source: new TileWMS({
                url: raaKulturarvUrl,
                params: {
                    'LAYERS': '', // Will be set by sublayer selection
                    'TILED': true,
                    'FORMAT': 'image/png',
                    'TRANSPARENT': true,
                    'SRS': 'EPSG:3857'
                },
                serverType: 'geoserver',
                attributions: [
                    '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
                ]
            }),
            visible: false
        });

        raaKulturarvLayer.setProperties({
            "layerId": "raaKulturarv",
            "title": "RAÄ Kulturarv",
            "type": "auxLayer",
            "subLayers": [],
            "legend": true,
            "pendingMetaDataLoad": true
        });

        this.fetchWmsLayerInfo(raaKulturarvUrl).then(layers => {
            // Remove the first layer if it's a group/root layer with no name
            if (layers.length && !layers[0].name) layers.shift();
            raaKulturarvLayer.setProperties({
                "subLayers": layers.flat,
				"subLayersTree": layers.tree,
                "pendingMetaDataLoad": false
            });
            // Optionally set a default sublayer
            if (raaKulturarvLayer.getProperties().subLayers.length > 0) {
                raaKulturarvLayer.setProperties({
                    "selectedSubLayer": raaKulturarvLayer.getProperties().subLayers[0].name
                });
            }
        });

		let raaFornlamningarUrl = "https://inspire-raa.metria.se/geoserver/Fornlamningar/ows";
        const raaFornlamningarLayer = new TileLayer({
            source: new TileWMS({
                url: raaFornlamningarUrl,
                params: {
                    'LAYERS': '', // Will be set by sublayer selection
                    'TILED': true,
                    'FORMAT': 'image/png',
                    'TRANSPARENT': true,
                    'SRS': 'EPSG:3857'
                },
                serverType: 'geoserver',
                attributions: [
                    '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
                ]
            }),
            visible: false
        });

        raaFornlamningarLayer.setProperties({
            "layerId": "raaFornlamningar",
            "title": "RAÄ Fornlämningar",
            "type": "auxLayer",
            "subLayers": [],
            "legend": true,
            "pendingMetaDataLoad": true
        });

        this.fetchWmsLayerInfo(raaFornlamningarUrl).then(layers => {
            // Remove the first layer if it's a group/root layer with no name
            if (layers.length && !layers[0].name) layers.shift();
            raaFornlamningarLayer.setProperties({
                "subLayers": layers.flat,
				"subLayersTree": layers.tree,
                "pendingMetaDataLoad": false
            });
            // Optionally set a default sublayer
            if (raaFornlamningarLayer.getProperties().subLayers.length > 0) {
                raaFornlamningarLayer.setProperties({
                    "selectedSubLayer": raaFornlamningarLayer.getProperties().subLayers[0].name
                });
            }
        });

		let raaVarldsarvUrl = "https://inspire-raa.metria.se/geoserver/Varldsarv/ows";
        const raaVarldsarvLayer = new TileLayer({
            source: new TileWMS({
                url: raaVarldsarvUrl,
                params: {
                    'LAYERS': '', // Will be set by sublayer selection
                    'TILED': true,
                    'FORMAT': 'image/png',
                    'TRANSPARENT': true,
                    'SRS': 'EPSG:3857'
                },
                serverType: 'geoserver',
                attributions: [
                    '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
                ]
            }),
            visible: false
        });

        raaVarldsarvLayer.setProperties({
            "layerId": "raaVarldsarv",
            "title": "RAÄ Världsarv",
            "type": "auxLayer",
            "subLayers": [],
            "legend": true,
            "pendingMetaDataLoad": true
        });

        this.fetchWmsLayerInfo(raaVarldsarvUrl).then(layers => {
            // Remove the first layer if it's a group/root layer with no name
            if (layers.length && !layers[0].name) layers.shift();
            raaVarldsarvLayer.setProperties({
                "subLayers": layers.flat,
				"subLayersTree": layers.tree,
                "pendingMetaDataLoad": false
            });
            // Optionally set a default sublayer
            if (raaVarldsarvLayer.getProperties().subLayers.length > 0) {
                raaVarldsarvLayer.setProperties({
                    "selectedSubLayer": raaVarldsarvLayer.getProperties().subLayers[0].name
                });
            }
        });

		let raaLamningarUrl = "https://pub.raa.se/visning/lamningar_v1/wms";
        const raaLamningarLayer = new TileLayer({
            source: new TileWMS({
                url: raaLamningarUrl,
                params: {
                    'LAYERS': '', // Will be set by sublayer selection
                    'TILED': true,
                    'FORMAT': 'image/png',
                    'TRANSPARENT': true,
                    'SRS': 'EPSG:3857'
                },
                serverType: 'geoserver',
                attributions: [
                    '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
                ]
            }),
            visible: false
        });

        raaLamningarLayer.setProperties({
            "layerId": "raaLamningar",
            "title": "RAÄ Kulturhistoriska lämningar",
            "type": "auxLayer",
            "subLayers": [],
            "legend": true,
            "pendingMetaDataLoad": true
        });

        this.fetchWmsLayerInfo(raaLamningarUrl).then(layers => {
            // Remove the first layer if it's a group/root layer with no name
            if (layers.length && !layers[0].name) layers.shift();
            raaLamningarLayer.setProperties({
                "subLayers": layers.flat,
				"subLayersTree": layers.tree,
                "pendingMetaDataLoad": false
            });
            // Optionally set a default sublayer
            if (raaLamningarLayer.getProperties().subLayers.length > 0) {
                raaLamningarLayer.setProperties({
                    "selectedSubLayer": raaLamningarLayer.getProperties().subLayers[0].name
                });
            }
        });

		/*
		var arcticDemLayer = new ImageLayer({
			source: new ImageArcGISRest({
				attributions: "<a target='_blank' href='https://www.pgc.umn.edu/data/arcticdem/'>NSF PGC ArcticDEM</a>",
			  	url: 'https://di-pgc.img.arcgis.com/arcgis/rest/services/arcticdem_rel2210/ImageServer',
			  	params: {
					'format': 'jpgpng',
					'renderingRule': JSON.stringify({
						'rasterFunction': 'Hillshade Gray',
						'rasterFunctionArguments': {
							'ZFactor': 10.0
						}
					}),
					'mosaicRule': JSON.stringify({
						'where': 'acqdate1 IS NULL',
						'ascending': false
					})
			  	},
			}),
			visible: false
		});

		arcticDemLayer.setProperties({
			"layerId": "arcticDem",
			"title": "PGC ArcticDEM",
			"type": "baseLayer"
		});
		*/
		
		this.baseLayers.push(stamenLayer);
		this.baseLayers.push(stamenTerrainLabelsLayer);
		this.baseLayers.push(osmLayer);
		this.baseLayers.push(mapboxSatelliteLayer);
		this.baseLayers.push(openTopoLayer);
		
		//this.baseLayers.push(arcticDemLayer);

		
		this.auxLayers.push(msbFloodingLayer);
		this.auxLayers.push(sguTopoLayer);
		this.auxLayers.push(raaWmsLayer);
		this.auxLayers.push(raaBebyggelseLayer);
		this.auxLayers.push(raaByggnadsminnenSkyddsomradenLayer);
		this.auxLayers.push(raaBuildingsAndChurchesLayer);
		this.auxLayers.push(raaBuildingsRuinsLayer);
		this.auxLayers.push(raaKulturarvLayer);
		this.auxLayers.push(raaFornlamningarLayer);
		this.auxLayers.push(raaVarldsarvLayer);
		this.auxLayers.push(raaLamningarLayer);

		if(Config.resultMapDataLayers.includes("clusterPoints")) {
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
		}

		if(Config.resultMapDataLayers.includes("clusterPoints")) {
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
		}
		
		if(Config.resultMapDataLayers.includes("heatmap")) {
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

		//Set up viewport resize event handlers
		this.resultManager.sqs.sqsEventListen("layoutResize", () => this.resizeCallback());
		$(window).on("resize", () => this.resizeCallback());
		this.resultManager.sqs.sqsEventListen("siteReportClosed", () => this.resizeCallback());
	}

	updateLegend(layer, selectedSubLayers) {
		$(".result-map-legend-content", this.renderIntoNode).html("");
		this.showLegend();
		$(".result-map-legend-title", this.renderIntoNode).text(layer.getProperties().title);
		$(".result-map-legend-description", this.renderIntoNode).text(layer.getProperties().description);
		
		let addedLegends = 0;
		layer.getProperties().subLayers.forEach((subLayer) => {
			//for each selected subLayer, we should draw the legend icon
			if(selectedSubLayers.includes(subLayer.name)) {
				if(subLayer.isGroup) {
					//skip group layers
					return;
				}
				$(".result-map-legend-content", this.renderIntoNode).append(`
					<div class="result-map-legend-item">
						<img src="${subLayer.legendUrl}" alt="${subLayer.title}" class="result-map-legend-icon">
					</div>
				`);
				addedLegends++;
			}
		});

		if(addedLegends == 0) {
			$(".result-map-legend-container", this.renderIntoNode).hide();
		}
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
					if(true) {
						this.renderMap();
						this.renderVisibleDataLayers();
						this.resultManager.sqs.sqsEventDispatch("resultModuleRenderComplete");
					}
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

			const allBaseAndAuxLayers = [...this.baseLayers, ...this.auxLayers];
			
			this.olMap = new Map({
				target: this.renderMapIntoNode,
				attribution: true,
				controls: [attribution], //Override default controls and set NO controls
				layers: new GroupLayer({
					layers: allBaseAndAuxLayers
				}),
				
				view: new View({
					center: fromLonLat([12.41, 48.82]),
					zoom: this.currentZoomLevel,
					minZoom: 2
				}),
				loadTilesWhileInteracting: true,
				loadTilesWhileAnimating: true
			});

			this.olMap.on("moveend", () => {
				var newZoomLevel = this.olMap.getView().getZoom();
				if (newZoomLevel != this.currentZoomLevel) {
					this.currentZoomLevel = newZoomLevel;
				}
			});
		}
		else {
			this.olMap.updateSize();
		}

		if(removeAllDataLayers) {
			this.removeAllDataLayers();
		}

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
		this.dataLayers.forEach((layer, index, array) => {
			if(layer.getVisible()) {
				this.removeLayer(layer.getProperties().layerId)
			}
		});
	}
	

	/*
	* Function: renderVisibleDataLayers
	*/
	renderVisibleBaseLayers() {
		for(var k in this.baseLayers) {
			var layerProperties = this.baseLayers[k].getProperties();
			if(layerProperties.visible) {
				this.baseLayers[k].setVisible(false); //Set to invisible while rendering and then when the function below will call the render function it will be set to visible again
				this.setMapBaseLayer(layerProperties.layerId);
			}
		}
	}

	/*
	* Function: renderVisibleDataLayers
	*/
	renderVisibleDataLayers() {
		for(var k in this.dataLayers) {
			var layerProperties = this.dataLayers[k].getProperties();
			if(layerProperties.visible) {
				this.dataLayers[k].setVisible(false); //Set to invisible while rendering and then when the function below will call the render function it will be set to visible again
				this.setMapDataLayer(layerProperties.layerId);
			}
		}
	}

	removeLayer(layerId) {
		this.olMap.getLayers().forEach((layer, index, array)=> {
			if(typeof(layer) != "undefined" && layer.getProperties().layerId == layerId) {
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


		/*
		d3.select(this.renderMapIntoNode)
			.append("div")
			.attr("id", "result-map-controls-container");

		d3.select("#result-map-controls-container")
			.append("div")
			.attr("id", "result-map-baselayer-controls-menu");
		new SqsMenu(this.resultManager.sqs, this.resultMapBaseLayersControlssqsMenu());

		d3.select("#result-map-controls-container")
			.append("div")
			.attr("id", "result-map-datalayer-controls-menu");
		new SqsMenu(this.resultManager.sqs, this.resultMapDataLayersControlssqsMenu());
		
		

		$(this.renderMapIntoNode).append($("<div></div>").attr("id", "result-map-controls-container"));
		$("#result-map-controls-container").append($("<div></div>").attr("id", "result-map-baselayer-controls-menu"));
		new SqsMenu(this.resultManager.sqs, this.resultMapBaseLayersControlsSqsMenu());

		$("#result-map-controls-container").append($("<div></div>").attr("id", "result-map-datalayer-controls-menu"));
		new SqsMenu(this.resultManager.sqs, this.resultMapDataLayersControlsSqsMenu());

		*/

		if(this.sqs.config.showResultExportButton) {
			this.renderExportButton();
		}
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

	async waitForMetaDataLoadOnLayer(layer) {
		return new Promise((resolve, reject) => {
			setInterval(() => {
				if(!layer.getProperties().pendingMetaDataLoad) {
					clearInterval();
					resolve();
				}
			}, 100);
		});
	}

	setMapAuxLayer(auxLayerId) {
		if(auxLayerId == "none") {
			this.auxLayers.forEach((layer, index, array) => {
				layer.setVisible(false);
			});
			this.unrenderSubLayerSelectionPanel();
		}

		this.auxLayers.forEach(async (layer, index, array) => {
			if(layer.getProperties().layerId == auxLayerId) {
				console.log("Setting aux layer "+auxLayerId+" visible");
				layer.setVisible(true);
				//make sure it's on top
				layer.setZIndex(1);

				if(layer.getProperties().pendingMetaDataLoad) {
					console.log("Waiting for metadata to load on layer "+auxLayerId);
					await this.waitForMetaDataLoadOnLayer(layer);
				}

				//check if the layer has subLayers
				if(layer.getProperties().subLayers) {
					this.renderSubLayerSelectionPanel(layer);
				}
				else {
					this.unrenderSubLayerSelectionPanel();
				}
			}
			else {
				layer.setVisible(false);
			}
		});
	}

	renderSubLayerSelectionPanel(layer) {
		// Remove if it exists
		this.unrenderSubLayerSelectionPanel();

		$(this.renderMapIntoNode).append("<div id='result-map-sub-layer-selection-panel'></div>");
		$("#result-map-sub-layer-selection-panel").css("width", `20em`);

		const titleHtml = `
			<div class="sub-layer-header">
			<h4>Select Layers</h4>
			<button type="button" id="minimize-sublayer-panel" class="minimize-btn" title="Minimize panel">
				<i class="fa fa-minus" aria-hidden="true"></i>
			</button>
			</div>
		`;
		$("#result-map-sub-layer-selection-panel").append(titleHtml);

		$("#result-map-sub-layer-selection-panel").append("<div id='sub-layer-content'></div>");

		// Pull data from layer props
		const layersTree = layer.getProperties().subLayersTree || layer.getProperties().subLayers || [];
		const selectedLayers = layer.getProperties().selectedSubLayers || [];

		// --- NEW: Flatten to leaves only (no groups rendered) ---
		function flattenLeaves(nodes, acc = []) {
			if (!Array.isArray(nodes)) return acc;
			for (const node of nodes) {
			const hasChildren = Array.isArray(node.children) && node.children.length > 0;
			if (hasChildren) {
				flattenLeaves(node.children, acc);
			} else {
				acc.push(node);
			}
			}
			return acc;
		}

		const leafNodes = flattenLeaves(layersTree);

		// Build max-scale info snippet
		function maxScaleHtml(node) {
			if (!node.maxScaleDenominator) return "";
			const scale = node.maxScaleDenominator;
			let scaleText = "";
			if (scale >= 1_000_000) {
			scaleText = Math.round(scale / 1_000_000) + "m";
			} else if (scale >= 1_000) {
			scaleText = (scale / 1_000) + "k";
			} else {
			scaleText = scale;
			}
			return `<span class="legend-zoom-info" title="Layer visible at scale 1:${scale.toLocaleString()}">Visibility scale ≤ 1:${scaleText}</span>`;
		}

		// Render a flat list of leaf layers
		function renderFlatLeafList(leaves, selectedLayers) {
			let html = `<ul class='sub-layer-list' style='margin-left: 0'>`;
			for (const node of leaves) {
				const checked = selectedLayers.includes(node.name) ? "checked" : "";
				const showAbstract = node.abstract && node.abstract !== node.title; // ✅ skip if identical

				html += `
				<li class="sub-layer-leaf">
					<label class="sub-layer-label">
					<input type="checkbox" class="sub-layer-checkbox" name="sub-layer" value="${node.name}" ${checked}>
					<span class="sub-layer-title">${node.title ?? node.name}</span>
					${showAbstract ? `<div class="sub-layer-description">${node.abstract}</div>` : ""}
					${maxScaleHtml(node)}
					</label>
				</li>
				`;
			}
			html += `</ul>`;
			return html;
		}


		let content = "<div class='result-map-sub-layer-selection'>";
		content += renderFlatLeafList(leafNodes, selectedLayers);
		content += "</div>";

		// Controls
		content += `
			<div class="sub-layer-controls">
			<button type="button" id="select-all-sublayers" class="sub-layer-btn">Select All</button>
			<button type="button" id="clear-all-sublayers" class="sub-layer-btn">Clear All</button>
			</div>
		`;

		$("#sub-layer-content").append(content);

		// Events
		$("[name='sub-layer']").on("change", () => {
			this.updateSelectedSubLayers(layer);
		});

		$("#select-all-sublayers").on("click", () => {
			$("[name='sub-layer']").prop("checked", true);
			this.updateSelectedSubLayers(layer);
		});

		$("#clear-all-sublayers").on("click", () => {
			$("[name='sub-layer']").prop("checked", false);
			this.updateSelectedSubLayers(layer);
		});

		$("#minimize-sublayer-panel").on("click", () => {
			const content = $("#sub-layer-content");
			const button = $("#minimize-sublayer-panel");
			const icon = button.find("i");

			if (content.is(":visible")) {
			content.slideUp(200);
			icon.removeClass("fa-minus").addClass("fa-plus");
			button.attr("title", "Expand panel");
			} else {
			content.slideDown(200);
			icon.removeClass("fa-plus").addClass("fa-minus");
			button.attr("title", "Minimize panel");
			}
		});

		// Initialize with current selection
		this.updateSelectedSubLayers(layer);
	}


	updateSelectedSubLayers(layer) {
		const selectedLayers = [];
		
		// Collect all checked sublayers
		$("[name='sub-layer']:checked").each(function() {
			selectedLayers.push($(this).val());
		});

		// Update layer properties
		layer.setProperties({ 
			selectedSubLayers: selectedLayers,
			// Keep backwards compatibility with single selection
			selectedSubLayer: selectedLayers.length > 0 ? selectedLayers[0] : null
		});

		// Update the WMS source with the selected layers
		this.updateLayerSource(layer, selectedLayers);


		if(layer.getProperties().legend) {
			this.updateLegend(layer, selectedLayers);
		}
		else {
			this.hideLegend();
		}
	}

	updateLayerSource(layer, selectedLayers) {
		if (selectedLayers.length === 0) {
			layer.setVisible(false);
			return;
		}
		layer.setVisible(true);
		const source = layer.getSource();
		const currentParams = source.getParams();

		const subLayers = layer.getProperties().subLayers || [];
		const styles = selectedLayers.map(layerName => {
			const sub = subLayers.find(l => l.name === layerName);
			// Find a style that matches the sublayer name, or fallback to first style
			if (sub && sub.styles && sub.styles.length > 0) {
				// Try to match style name to sublayer name
				const match = sub.styles.find(s => s.name.includes(layerName));
				return match ? match.name : sub.styles[0].name;
			}
			return '';
		});

		source.updateParams({
			...currentParams,
			'LAYERS': selectedLayers.join(','),
			'STYLES': styles.join(',')
		});
		source.refresh();
	}

	setSelectedSubLayer(layer, selectedSubLayer) {
		// Convert single selection to array format
		const selectedLayers = Array.isArray(selectedSubLayer) ? selectedSubLayer : [selectedSubLayer];
		
		layer.setProperties({ 
			selectedSubLayers: selectedLayers,
			selectedSubLayer: selectedLayers[0] // Keep backwards compatibility
		});

		this.updateLayerSource(layer, selectedLayers);
	}

	unrenderSubLayerSelectionPanel() {
		this.hideLegend();
		$("#result-map-sub-layer-selection-panel").remove();
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
		//let timeFilteredData = this.timeline.getSelectedSites();
		let timeFilteredData = this.data;
		var geojson = this.getDataAsGeoJSON(timeFilteredData);

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
		//let timeFilteredData = this.timeline.getSelectedSites();
		let timeFilteredData = this.data;
		var geojson = this.getDataAsGeoJSON(timeFilteredData);

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
		//let timeFilteredData = this.timeline.getSelectedSites();
		let timeFilteredData = this.data;
		var geojson = this.getDataAsGeoJSON(timeFilteredData);

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

	/*
	* Function: renderPointsLayer
	*/
	renderPointsLayerOLD() {
		let timeFilteredData = this.timeline.getSelectedSites();
		var geojson = this.getDataAsGeoJSON(timeFilteredData);

		var gf = new GeoJSON({
			featureProjection: "EPSG:3857"
		});
		var featurePoints = gf.readFeatures(geojson);
		
		var pointsSource = new VectorSource({
			features: featurePoints
		});
		
		var layer = new VectorLayer({
			source: pointsSource,
			style: (feature, resolution) => {
				var style = this.getPointStyle(feature);
				return style;
			},
			zIndex: 1
		});
		
		layer.setProperties({
			"layerId": "points",
			"type": "dataLayer"
		});

		this.olMap.addLayer(layer);
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
		for(var key in this.dataLayers) {
			if(this.dataLayers[key].getProperties().visible) {
				return this.dataLayers[key];
			}
		}
		return false;
	}

	/*
	* Function: getVisibleDataLayers
	*/
	getVisibleDataLayers() {
		var visibleLayers = [];
		for(var key in this.dataLayers) {
			if(this.dataLayers[key].getProperties().visible) {
				visibleLayers.push(this.dataLayers[key]);
			}
		}
		return visibleLayers;
	}

	/*
	* Function: getVisibleBaseLayers
	*/
	getVisibleBaseLayers() {
		var visibleLayers = [];
		for(var key in this.baseLayers) {
			if(this.baseLayers[key].getProperties().visible) {
				visibleLayers.push(this.baseLayers[key]);
			}
		}
		return visibleLayers;
	}

	/*
	* Function: exportSettings
	*/
	exportSettings() {
		var struct = {};
		if(this.olMap != null) {
			struct = {
				center: this.olMap.getView().getCenter(),
				zoom: this.olMap.getView().getZoom(),
				baseLayers: [],
				dataLayers: []
			};

			var baseLayers = this.getVisibleBaseLayers();
			for(var key in baseLayers) {
				struct.baseLayers.push(baseLayers[key].getProperties().layerId);
			}
			var dataLayers = this.getVisibleDataLayers();
			for(var key in dataLayers) {
				struct.dataLayers.push(dataLayers[key].getProperties().layerId);
			}
		}
		else {
			return false;
		}

		return struct;
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

		for(var key in this.dataLayers) {
			var prop = this.dataLayers[key].getProperties();

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
			items: [ //The menu items contained in this menu
			],
			triggers: [{
				selector: "#result-map-auxlayer-controls-menu",
				on: "click"
			}]
		};

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
	* Function: getLayerById
	*/
	getLayerById(layerId) {
		for(let k in this.dataLayers) {
			if(this.dataLayers[k].getProperties().layerId == layerId) {
				return this.dataLayers[k];
			}
		}
		for(let k in this.baseLayers) {
			if(this.baseLayers[k].getProperties().layerId == layerId) {
				return this.baseLayers[k];
			}
		}
		return false;
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

	async fetchWfsFeatureTypes(baseUrl, options = {}) {
		const defaultOptions = {
			version: '2.0.0',
			sortByName: true
		};
		const config = { ...defaultOptions, ...options };

		try {
			const capabilitiesUrl = `${baseUrl}?SERVICE=WFS&REQUEST=GetCapabilities&VERSION=${config.version}`;
			console.log(`Fetching WFS capabilities from: ${capabilitiesUrl}`);

			const response = await fetch(capabilitiesUrl);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			const xmlText = await response.text();
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(xmlText, "text/xml");

			const WFS_NS = xmlDoc.documentElement?.namespaceURI || 'http://www.opengis.net/wfs';

			const featureTypeEls = Array.from(
				xmlDoc.getElementsByTagNameNS?.(WFS_NS, 'FeatureType') || xmlDoc.getElementsByTagName('FeatureType')
			);

			const featureTypes = featureTypeEls.map(ftEl => {
				const nameEl = ftEl.getElementsByTagNameNS?.(WFS_NS, 'Name')[0] || ftEl.getElementsByTagName('Name')[0];
				const titleEl = ftEl.getElementsByTagNameNS?.(WFS_NS, 'Title')[0] || ftEl.getElementsByTagName('Title')[0];
				const abstractEl = ftEl.getElementsByTagNameNS?.(WFS_NS, 'Abstract')[0] || ftEl.getElementsByTagName('Abstract')[0];
				return {
					name: nameEl ? nameEl.textContent.trim() : '',
					title: titleEl ? titleEl.textContent.trim() : '',
					abstract: abstractEl ? abstractEl.textContent.trim() : ''
				};
			});

			if (config.sortByName) {
				featureTypes.sort((a, b) => a.title.localeCompare(b.title, 'sv'));
			}

			console.log(`Parsed ${featureTypes.length} WFS feature types`);
			return featureTypes;

		} catch (error) {
			console.error(`Failed to fetch WFS capabilities from ${baseUrl}:`, error);
			throw error;
		}
	}

	async fetchWmsLayerInfo(baseUrl, options = {}) {
		const defaultOptions = {
			version: '1.3.0',
			filterNumericNames: false,
			sortByName: true
		};
		
		const config = { ...defaultOptions, ...options };
		
		try {
			// Construct capabilities URL
			const capabilitiesUrl = `${baseUrl}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=${config.version}`;
			
			console.log(`Fetching WMS capabilities from: ${capabilitiesUrl}`);
			
			// Fetch capabilities
			const response = await fetch(capabilitiesUrl);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			
			const xmlText = await response.text();
			
			// Parse the XML
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(xmlText, "text/xml");
			
			// Check for XML parsing errors
			const parserError = xmlDoc.querySelector('parsererror');
			if (parserError) {
				throw new Error(`XML parsing error: ${parserError.textContent}`);
			}
			
			// Extract layer information
			const layers = this.parseWmsCapabilities(xmlDoc, config);
			layers.flat.sort((a, b) => a.title.localeCompare(b.title));
			
			console.log(`Successfully parsed ${layers.length} layers from WMS service`);
			return layers;
			
		} catch (error) {
			console.error(`Failed to fetch WMS capabilities from ${baseUrl}:`, error);
			throw error;
		}
	}

	parseWmsCapabilities(
		xmlDoc,
		{
			filterNumericNames = false,
			sortByName = true,
			fallbackIfEmpty = true
		} = {}
	) {
		const WMS_NS = xmlDoc.documentElement?.namespaceURI || 'http://www.opengis.net/wms';
		const XLINK_NS = 'http://www.w3.org/1999/xlink';

		const q = (el, tag) =>
			(el.getElementsByTagNameNS?.(WMS_NS, tag)[0] ||
			el.getElementsByTagName(tag)[0]) ?? null;

		const qAll = (el, tag) =>
			Array.from(el.getElementsByTagNameNS?.(WMS_NS, tag) || el.getElementsByTagName(tag) || []);

		// Legend URL under the given element (Layer or Style)
		const getLegendUrl = (el) => {
			const legendEls = qAll(el, 'LegendURL');
			for (const legendEl of legendEls) {
			const online =
				legendEl.getElementsByTagName('OnlineResource')[0] ||
				legendEl.getElementsByTagNameNS?.(WMS_NS, 'OnlineResource')?.[0];
			if (!online) continue;
			const href = online.getAttributeNS
				? online.getAttributeNS(XLINK_NS, 'href')
				: (online.getAttribute('xlink:href') || online.getAttribute('href'));
			if (href) return href;
			}
			return null;
		};

		// Styles array; first style is conventionally the default in GeoServer
		const getStyles = (layerEl) => {
			const styleEls = qAll(layerEl, 'Style');
			return styleEls.map((styleEl) => {
			const name = (q(styleEl, 'Name')?.textContent || '').trim();
			const title = (q(styleEl, 'Title')?.textContent || name).trim();
			const abstract = (q(styleEl, 'Abstract')?.textContent || '').trim();
			return { name, title, abstract, legendUrl: getLegendUrl(styleEl) };
			});
		};

		const getScale = (layerEl, tag) => {
			const el = q(layerEl, tag);
			const val = el ? parseFloat(el.textContent.trim()) : NaN;
			return Number.isFinite(val) ? val : null;
		};

		const getCrsList = (layerEl) => qAll(layerEl, 'CRS').map(n => n.textContent.trim());

		// Convert OGC ScaleDenominator → OL resolution (m/px). 0.28 mm px size per spec.
		const scaleToResolution = (scaleDenom) =>
			Number.isFinite(scaleDenom) ? scaleDenom * 0.00028 : null;

		// Create a node object from a <Layer> element
		const buildNode = (layerEl) => {
			const nameEl = q(layerEl, 'Name');            // may be null for group layers
			const titleEl = q(layerEl, 'Title');

			const name = nameEl ? nameEl.textContent.trim() : null;
			const title = (titleEl?.textContent || name || '').trim();
			const abstract = (q(layerEl, 'Abstract')?.textContent || '').trim();
			const queryable = /^(1|true)$/i.test(layerEl.getAttribute('queryable') || '');
			const styles = getStyles(layerEl);
			const defaultStyle = styles[0]?.name || '';
			const legendUrl = styles[0]?.legendUrl || getLegendUrl(layerEl) || null;

			const minScaleDenominator = getScale(layerEl, 'MinScaleDenominator');
			const maxScaleDenominator = getScale(layerEl, 'MaxScaleDenominator');

			return {
				name,
				title,
				abstract,
				queryable,
				styles,
				defaultStyle,
				legendUrl,
				crsList: getCrsList(layerEl),
				minScaleDenominator,
				maxScaleDenominator,
				// Convenience for OL visibility:
				minResolution: scaleToResolution(maxScaleDenominator) ?? null, // Note: MaxScale → minResolution
				maxResolution: scaleToResolution(minScaleDenominator) ?? null, // Note: MinScale → maxResolution
				children: [],
				isGroup: false
			};
		};

		// Recursively walk the <Layer> tree
		const walk = (layerEl) => {
			const node = buildNode(layerEl);
			const childEls = qAll(layerEl, 'Layer').filter(child => child !== layerEl);
			for (const child of childEls) {
				node.children.push(walk(child));
			}

			node.isGroup = node.children.length > 0;

			return node;
		};

		// Find all top-level <Layer> elements under <Capability>
		const topLayerEls = (() => {
			const caps = q(xmlDoc, 'Capability') || xmlDoc; // fallback: whole doc
			// Only direct children Layers of Capability (avoid duplicating deeper nodes)
			const direct = [];
			const layersAll = qAll(caps, 'Layer');
			for (const lay of layersAll) {
			const parent = lay.parentElement;
			if (parent === caps) direct.push(lay);
			}
			// If the server wraps everything in a single top Layer, accept that one
			return direct.length ? direct : qAll(xmlDoc, 'Layer').slice(0, 1);
		})();

		// Build the tree forest (often a single root group)
		const tree = topLayerEls.map(walk);

		// Now produce a flat list with parent relationships and readable paths
		const flat = [];
		const indexByName = new Map();

		const traverse = (node, parentId = null, pathParts = []) => {
			const id = node.name || `__group__:${pathParts.length}:${node.title || 'Group'}`;

			const path = [...pathParts, node.title || node.name || 'Layer'].filter(Boolean);
			const entry = {
				id,
				name: node.name, // null for groups
				title: node.title,
				abstract: node.abstract,
				queryable: node.queryable,
				styles: node.styles,
				defaultStyle: node.defaultStyle,
				legendUrl: node.legendUrl,
				crsList: node.crsList,
				minScaleDenominator: node.minScaleDenominator,
				maxScaleDenominator: node.maxScaleDenominator,
				minResolution: node.minResolution,
				maxResolution: node.maxResolution,
				parentId,
				path,                     // e.g. ['Arkeologiska uppdrag', 'Undersökningsområde']
				isGroup: node.children.length > 0,
			};

			flat.push(entry);
			if (node.name) indexByName.set(node.name, entry);

			node.children.forEach(child =>
			traverse(child, id, path));

			return entry;
		};

		tree.forEach(root => traverse(root, null, []));

		// Filter/sort on the FLAT list of **named** layers (actual requestable layers)
		let requestable = flat.filter(l => !l.children && l.name);

		if (filterNumericNames) {
			const onlyNumeric = requestable.filter(l => /^\d+$/.test(l.name));
			requestable = onlyNumeric.length || !fallbackIfEmpty ? onlyNumeric : requestable;
		}

		if (sortByName) {
			const allNumeric = requestable.length > 0 && requestable.every(l => /^\d+$/.test(l.name));
			requestable.sort(allNumeric
			? (a, b) => Number(a.name) - Number(b.name)
			: (a, b) => a.name.localeCompare(b.name, 'sv'));
		}

		return {
			tree,           // full hierarchy (groups + children)
			flat,           // everything (groups + layers) with parentId/path
			layers: requestable, // only requestable named layers, filtered/sorted per options
			byName: indexByName  // Map<string, entry> for quick lookups
		};
	}


}

export { ResultMap as default }