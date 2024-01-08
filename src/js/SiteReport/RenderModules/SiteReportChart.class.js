import { nanoid } from "nanoid";
import { 
	Chart, 
	CategoryScale, 
	LinearScale, 
	BarController, 
	BarElement,
	Legend,
	Tooltip
 } from "chart.js";
import 'zingchart/es6';
import Plotly from "plotly.js-dist-min";
import proj4 from "proj4";

import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer, Heatmap as HeatmapLayer, Image as ImageLayer, Graticule } from 'ol/layer';
import { Stamen, BingMaps, ImageArcGISRest, OSM } from 'ol/source';
import { Group as GroupLayer } from 'ol/layer';
import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import { Cluster as ClusterSource, Vector as VectorSource } from 'ol/source';
import { fromLonLat } from 'ol/proj.js';
import { Select as SelectInteraction, Draw as DrawInteraction } from 'ol/interaction';
import { Circle as CircleStyle, Fill, Stroke, Style, Text} from 'ol/style.js';
import { Attribution } from 'ol/control';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { createEmpty, extend } from 'ol/extent';
import { transform } from 'ol/proj';
import { boundingExtent } from 'ol/extent';
import { Overlay as OlOverlay } from 'ol';
import { map } from "jquery";
import SqsMenu from "../../SqsMenu.class.js";

import OpenLayersMap from "../../Common/OpenLayersMap.class.js";
import { local } from "d3";

class SiteReportChart {
	constructor(siteReport, contentItem) {
		this.siteReport = siteReport;
		this.sqs = this.siteReport.sqs;
		this.contentItem = contentItem;
		this.chartId = null;
		Chart.register(CategoryScale);
		Chart.register(LinearScale);
		Chart.register(BarController);
		Chart.register(BarElement);
		Chart.register(Legend);
		Chart.register(Tooltip);

		this.chartTheme = {
			graph: {
				title: {
					fontFamily: 'Lato',
					fontSize: 14,
					padding: 15,
					fontColor: '#000',
					adjustLayout: true
				},
				backgroundColor: "#f0f0f0"
			}
		};
	}

	update(updatedExtrasRenderOption = null) {
		return false;
    }

	/*
	* Function: render
	*/
	render(anchorNodeSelector) {
		this.anchorNodeSelector = anchorNodeSelector;
		var node = null;
		this.contentItem.renderOptions.forEach((ro, i) => {
			if(ro.selected) {
				switch(ro.type) {
					case "bar":
						node = this.renderBarChartPlotly();
						break;
					case "ecocode":
						node = this.renderEcoCodeChart();
						break;
					case "ecocodes-samples":
						node = this.renderEcoCodesPerSampleChart();
						break;
					case "ms-bar":
						node = this.renderMagneticSusceptibilityBarChart();
						break;
					case "loi-bar":
						node = this.renderLossOnIgnitionChart();
						break;
					case "pie":
						node = this.renderPieChart();
						break;
					case "multistack":
						node = this.renderMultistack();
						break;
					case "dendrochart":
						node = this.renderDendroChart();
						break;
					case "coordinate-map":
						this.renderCoordinateMap();
						break;
				}
			}
		});

		return this;
	}

	unrender() {
		if(this.chartId != null) {
			zingchart.exec(this.chartId, "destroy");
		}
	}
	
	renderBarChart() {
		//this.renderBarChartZing();
		//this.renderBarChartCJS();
		this.renderBarChartPlotly();
	}

	getCoordinateSystems(coordinates) {
		let coordinateSystems = {
			xy: null,
			z: null
		};

		let xyCoords = [];
		let zCoords = [];

		coordinates.forEach(coordinate => {
			if(this.sqs.config.xyCoordinateDimensionIds.includes(coordinate.dimension.dimension_id)) {
				xyCoords.push(coordinate);
			}
			if(this.sqs.config.zCoordinateDimensionIds.includes(coordinate.dimension.dimension_id)) {
				zCoords.push(coordinate);
			}
		});

		//check that xyCoords are of the same type
		let xyCoordSystemIds = [];
		xyCoords.forEach(coordinate => {
			xyCoordSystemIds.push(coordinate.coordinate_method.method_id);
		});
		xyCoordSystemIds = [...new Set(xyCoordSystemIds)];
		if(xyCoordSystemIds.length > 1) {
			console.warn("X/Y coordinate system mismatch.");
			return coordinateSystems;
		}
		else if(xyCoords.length > 0){
			coordinateSystems.xy = xyCoords[0].coordinate_method;
		}

		let zCoordSystemIds = [];
		zCoords.forEach(coordinate => {
			zCoordSystemIds.push(coordinate.coordinate_method.method_id);
		});
		zCoordSystemIds = [...new Set(zCoordSystemIds)];
		if(zCoordSystemIds.length > 1) {
			console.warn("Z coordinate system mismatch.");
			return coordinateSystems;
		}
		else {
			if(zCoords.length > 0) {
				coordinateSystems.z = zCoords[0].coordinate_method;
			}
		}

		return coordinateSystems;
	}

	getSampleMapPoints(contentItem) {
		let points = [];
		let selectedSampleGroupId = this.getSelectedRenderOptionExtra("Sample group").value;
		let sampleGroupIdColumnKey = this.getTableColumnKeyByTitle("Sample group id");
		let sampleGroupNameColumnKey = this.getTableColumnKeyByTitle("Group name");

		contentItem.data.rows.forEach(row => {
			if(row[sampleGroupIdColumnKey].value == selectedSampleGroupId || selectedSampleGroupId == "all") {
				row.forEach(cell => {
					if(cell.type == "subtable") {
						let subTableCoordinateColumnKey = null;
						cell.value.columns.forEach((sc, k) => {
							if(sc.title == "Coordinates") {
								subTableCoordinateColumnKey = k;
							}
						});

						if(subTableCoordinateColumnKey == null) {
							//no coordinate data found in this sample group - and that's ok
							return false;
						}

						cell.value.rows.forEach(subTableRow => {
							let coordinates = subTableRow[subTableCoordinateColumnKey].data;

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
								sampleName: subTableRow[0].value,
								tooltip: "Sample "+subTableRow[0].value,
								sampleGroupId: row[sampleGroupIdColumnKey].value,
								sampleGroupName: row[sampleGroupNameColumnKey].value
							});

						});
					}
				});
			}
		});

		return points;
	}
	
	renderCoordinateMap() {
		let contentItem = this.contentItem;

		let selectedSampleGroupId = this.getSelectedRenderOptionExtra("Sample group").value;

		let renderMap = true;
		let renderBaseLayer = true;

		let points = this.getSampleMapPoints(contentItem);

		if(points.length == 0) {
			console.warn("WARN: No usable coordinates found for sample group "+selectedSampleGroupId);
			return false;
		}

		if(!renderMap) {
			return false;
		}
	  
		this.chartId = "chart-" + nanoid();
		var chartContainer = $("<div id='" + this.chartId + "' class='sample-coordinates-map-container'></div>");
		$(this.anchorNodeSelector).append(chartContainer);

		let mapFeatures = [];

		//check that all points are in the EPSG:4326 coordinate system
		let localCoordinateSystemFound = false;
		let epsg4326CoordinateSystemFound = false;
		points.forEach(p => {
			if(p.planarCoordSys != "EPSG:4326") {
				localCoordinateSystemFound = true;
			}
			else {
				epsg4326CoordinateSystemFound = true;
			}
		});

		if(localCoordinateSystemFound && !epsg4326CoordinateSystemFound) {
			renderBaseLayer = false;
		}

		points.forEach(p => {
			if(epsg4326CoordinateSystemFound && p.planarCoordSys != "EPSG:4326") {
				//if we are currently rendering points in EPSG:4326, skip any points which are not in EPSG:4326
				console.warn("WARN: Skipping point "+p.sampleName+" since it is not in EPSG:4326 coordinate system.");
				return;
			}

			let tooltip = p.sampleGroupName+": Sample <strong>"+p.sampleName+"</strong>";
			if(p.z) {
				tooltip += ", "+p.zString;
			}

			mapFeatures.push(new Feature({
				geometry: new Point(fromLonLat([p.x, p.y])),
				name: p.sampleName,
				sampleGroupId: p.sampleGroupId,
				sampleGroupName: p.sampleGroupName,
				altitude: p.z,
				tooltip: tooltip
			}));
		});
	  
		var vectorSource = new VectorSource({
			features: mapFeatures
		});

		let samplePointsMap = new OpenLayersMap(this.sqs);
		let geoJson = new GeoJSON().writeFeaturesObject(vectorSource.getFeatures());
		samplePointsMap.setData(geoJson);

		if(renderBaseLayer) {
			samplePointsMap.setMapBaseLayer("topoMap");
		}
		else {
			samplePointsMap.setMapBaseLayer("none");
		}
		samplePointsMap.render("#"+this.chartId);

		samplePointsMap.registerFeatureStyleCallback("sampleCoordinateStyle", (olMap, features, feature) => {
			var pointsNum = feature.get('features').length;
			var clusterSizeText = pointsNum.toString();

			return new Style({
				image: new CircleStyle({
					radius: 10,
					stroke: new Stroke({
						color: samplePointsMap.style.default.strokeColor,
					}),
					fill: new Fill({
						color: this.sqs.color.hexToRgba(samplePointsMap.defaultColorScheme[4], 0.8)
					})
				}),
				text: new Text({
					text: clusterSizeText,
					offsetY: 1,
					fill: new Fill({
						color: '#fff'
					})
				})
			});
		}, true);

		let selectStyle = (feature) => {
			var pointsNum = feature.get('features').length;
			var clusterSizeText = pointsNum.toString();
			return new Style({
				image: new CircleStyle({
					radius: 10,
					stroke: new Stroke({
						color: samplePointsMap.style.default.strokeColor,
					}),
					fill: new Fill({
						color: this.sqs.color.hexToRgba(samplePointsMap.defaultColorScheme[4], 0.8)
					})
				}),
				text: new Text({
					text: clusterSizeText,
					offsetY: 1,
					fill: new Fill({
						color: '#fff'
					})
				})
			});
		}

		let layerId = "clusterPoints";
		samplePointsMap.setMapDataLayer(layerId);

		this.samplePointsMap = samplePointsMap;
		let extent = samplePointsMap.getLayerByName(layerId).getSource().getSource().getExtent();

		let padding = 20;
		samplePointsMap.olMap.getView().fit(extent, {
			padding: [padding, padding, padding, padding],
			maxZoom: renderBaseLayer ? 17 : 30,
		});

		samplePointsMap.addSelectInteraction(selectStyle);
		samplePointsMap.setMapPopupClickCallback(sampleName => {
			this.bringSampleIntoView(JSON.parse(sampleName));
		});
		
		
		let mapMenu = `
		<div class='menu-row-container'>
			<div class='map-base-layer-menu-container'>
				<div class='menu-row-item'>Base layers</div>
				<div class='map-base-layer-menu sqs-menu-container'></div>
			</div>
			<div class='menu-row-item-divider'></div>
			<div class='map-aux-menu-container'>
				<div class='menu-row-item'>Altitude</div>
				<div class='map-aux-menu sqs-menu-container'></div>
			</div>
		</div>
		`;

		$("#"+this.chartId).append(mapMenu);
		if(renderBaseLayer) {
			$("#"+this.chartId+" .map-base-layer-menu-container").show();
		}
		else {
			$("#"+this.chartId+" .map-base-layer-menu-container").hide();
		}
		samplePointsMap.renderBaseLayerMenu("#"+this.chartId+" .map-base-layer-menu-container");
		
		var menu = {
			title: "<i class=\"fa fa-globe result-map-control-icon\" aria-hidden=\"true\"></i><span class='result-map-tab-title'>Baselayer</span>", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: "#"+this.chartId+" .map-aux-menu", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
			staticSelection: true, //whether a selected item remains highlighted or not, purely visual
			visible: true, //show this menu by default
			style: {
				menuTitleClass: "result-map-control-menu-title",
				l1TitleClass: "result-map-control-item-title"
			},
			items: [ //The menu items contained in this menu
				{
					name: "zOn", //identifier of this item, should be unique within this menu
					title: "On", //displayed in the UI
					tooltip: "",
					staticSelection: false, //For tabs - highlighting the currently selected
					selected: false,
					callback: () => {
						console.log("Altitude on callback");
						samplePointsMap.setMapDataLayerStyleType("colorCodedAltitude");
					}
				},
				{
					name: "zOff", //identifier of this item, should be unique within this menu
					title: "Off", //displayed in the UI
					tooltip: "",
					staticSelection: false, //For tabs - highlighting the currently selected
					selected: true,
					callback: () => {
						console.log("Altitude off callback");
						samplePointsMap.setMapDataLayerStyleType("sampleCoordinateStyle");
					}
				}
			],
			triggers: [{
				selector: "#"+this.chartId+" .map-aux-menu-container",
				on: "click"
			}]
		};
		new SqsMenu(this.sqs, menu);
		

		let zMax = null;
		let zMin = null;
		points.forEach(p => {
			let zValue = this.getZFromPoint(p);
			if(zValue) {
				if(zMax == null || p.z > zMax) {
					zMax = zValue;
				}
				if(zMin == null || p.z < zMin) {
					zMin = zValue;
				}
			}
		});

		this.zMax = zMax;
		this.zMin = zMin;

		if(true || (!zMax || !zMin)) { //disabled this since it doesn't work so well
			$(".map-aux-menu-container", "#"+this.chartId).hide();
		}

		this.olMap = samplePointsMap.olMap;
		$("#"+this.chartId).css("cursor", "default");

		if(!renderBaseLayer) {
			//$("#"+this.chartId).append("<div class='sample-coordinates-map-info-text'>Basemap is not shown since this is a local coordinate system.</div>");
			// Create a Graticule control with fine grey lines
			let graticule = new Graticule({
				strokeStyle: new Stroke({
					color: 'rgba(0, 0, 0, 0.5)',
					width: 1,
					lineDash: [0.5, 4], // Customize the line style
				}),
				showLabels: true, // Optionally hide labels
			});
			
			samplePointsMap.olMap.addControl(graticule);
		}
	}

	getZFromPoint(point) {
		//this is simplistic, it only looks for altitude above sea level
		for(let key in point.z) {
			if(point.z[key].coordinate_method.method_id == 76 && typeof point.z[key].measurement != "undefined") {
				return parseFloat(point.z[key].measurement);
			}
		}
		return null;
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
			zCoordPresentation = title+" "+parseFloat(zCoord.measurement)+" "+unitString;
		}

		return zCoordPresentation;
	}

	bringSampleIntoView(sampleInfo) {	
		console.log(sampleInfo);
	}

	auxOptionsMenu(anchorSelector) {
		var menu = {
			title: "<i class=\"fa fa-globe result-map-control-icon\" aria-hidden=\"true\"></i><span class='result-map-tab-title'>Altitude</span>", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: anchorSelector+" .map-aux-menu", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
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
			name: "z-on", //identifier of this item, should be unique within this menu
			title: "Show", //displayed in the UI
			tooltip: "",
			staticSelection: false, //For tabs - highlighting the currently selected
			callback: () => {
				this.renderAltitudeLegend();
			}
		});
		menu.items.push({
			name: "z-off", //identifier of this item, should be unique within this menu
			title: "Hide", //displayed in the UI
			tooltip: "",
			staticSelection: false, //For tabs - highlighting the currently selected
			selected: true,
			callback: () => {
				 this.unrenderAltitudeLegend();
			}
		});
		return menu;
	}
	
	mapValue(x, xMin, xMax, yMin, yMax) {
		return ((x - xMin) / (xMax - xMin)) * (yMax - yMin) + yMin;
	}

	renderAltitudeLegend() {
		this.samplePointsMap.setMapDataLayerStyleType("colorCodedAltitude");

		let maxAltitude = this.chartData.z.max;
		let minAltitude = this.chartData.z.min;
		let unit = this.chartData.z.unit.unit_abbrev;

		$("#"+this.chartId).append("<div id='gradient-legend'><div class='gradient-legend-max'></div><div class='gradient-legend-min'></div></div>");

		const gradientLegend = document.getElementById('gradient-legend');
		
		// Calculate the color scale based on the altitude range
		const gradient = `linear-gradient(to bottom, 
			rgb(${255 * (1 - maxAltitude / 255)}, 0, ${255 * (maxAltitude / 255)}),
			rgb(${255 * (minAltitude / 255)}, 0, ${255 * (1 - minAltitude / 255)})
			)`;
		
		gradientLegend.style.background = gradient;

		$(".gradient-legend-max").html(maxAltitude+" "+unit);
		$(".gradient-legend-min").html(minAltitude+" "+unit);
	}

	unrenderAltitudeLegend() {
		this.samplePointsMap.setMapDataLayerStyleType(null);
		$("#gradient-legend").remove();
	}

	getXCoordinateFromCoordinates(coordinates) {
		let xCoord = null;
		coordinates.forEach(coordinate => {
			if(coordinate.dimension.dimension_name == "X/North") {
				xCoord = coordinate;
			}
		});
		return xCoord;
	}

	getYCoordinateFromCoordinates(coordinates) {
		let yCoord = null;
		coordinates.forEach(coordinate => {
			if(coordinate.dimension.dimension_name == "Y/East") {
				yCoord = coordinate;
			}
		});
		return yCoord;
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
		//Define projections
		proj4.defs("EPSG:3006", "+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs");
		proj4.defs("EPSG:3018", "+proj=tmerc +lat_0=0 +lon_0=14.80827777777778 +k=1 +x_0=1500000 +y_0=0 +ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs");
		proj4.defs("EPSG:3019", "+proj=tmerc +lat_0=0 +lon_0=15.80827777777778 +k=1 +x_0=1500000 +y_0=0 +ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs");
		proj4.defs("EPSG:3021", "+proj=tmerc +lat_0=0 +lon_0=18.05827777777778 +k=1 +x_0=1500000 +y_0=0 +ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs");
		proj4.defs("EPSG:3024", "+proj=tmerc +lat_0=0 +lon_0=20.80827777777778 +k=1 +x_0=1500000 +y_0=0 +ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs");
		proj4.defs("EPSG:3007","+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");
		proj4.defs("SWEREF99_LAT_LONG_TO_1200", "+proj=pipeline +step +proj=latlong +ellps=GRS80 +step +inv +proj=utm +zone=12 +ellps=GRS80 +units=m +no_defs");
		proj4.defs("SWEREF99_LAT_LONG_TO_3006", "+proj=pipeline +step +proj=latlong +ellps=GRS80 +step +inv +proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs");
		proj4.defs("gothenburg-local", "+proj=tmerc +lat_0=0 +lon_0=11.304996 +k=1.00000867 +x_0=-6370680.1969 +y_0=-80.0124 +ellps=GRS80 +units=m +no_defs");
		proj4.defs("EPSG:3021", '+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +units=m +no_defs');
		proj4.defs("EPSG:9999", "+proj=utm +zone=33 +ellps=WGS84 +datum=WGS84 +units=m +no_defs");

		let workingCoordinates = {
			x: null,
			y: null,
			method: null
		}

		//select a coordinate pair to use for the map
		const coordinateSystemPriority = this.sqs.config.coordinateSystemPriority;

		let selectedCoordinates = null;
		coordinatePairs.forEach(pair => {
			//choose the highest priority coordinate system based on pair[0].coordinate_method_id
			if(selectedCoordinates == null || coordinateSystemPriority.indexOf(pair[0].coordinate_method.method_id) < coordinateSystemPriority.indexOf(selectedCoordinates[0].coordinate_method.method_id)) {
				selectedCoordinates = pair;
			}
		});
		
		//pick out the x/y
		selectedCoordinates.forEach(coordinate => {
			if(coordinate.dimension.dimension_name == "X/North") {
				workingCoordinates.y = coordinate;
			}
			if(coordinate.dimension.dimension_name == "Y/East") {
				workingCoordinates.x = coordinate;
			}
			if(coordinate.dimension.dimension_name == "X/East") {
				workingCoordinates.x = coordinate;
			}
			if(coordinate.dimension.dimension_name == "Y/North") {
				workingCoordinates.y = coordinate;
			}
		});

		workingCoordinates.method = workingCoordinates.x.coordinate_method;

		if(workingCoordinates.x == null || workingCoordinates.y == null) {
			//this will trigger if we are fed z-coords only, which can absolutely happen, so don't even warn about it
			return null;
		}

		let outputCoords = null;
		let sweref99Coords = null;
		let coordinateSystem = null;

		switch(workingCoordinates.x.coordinate_method.method_id) {
			case 113: //"Malmö stads koordinatnät"
				outputCoords = [workingCoordinates.x.measurement, workingCoordinates.y.measurement];
				coordinateSystem = "local";
				break;
			case 105: //"Local grid" 
				//outputCoords = [workingCoordinates.x.measurement, workingCoordinates.y.measurement];
				outputCoords = proj4("EPSG:9999", "EPSG:4326", [workingCoordinates.x.measurement, workingCoordinates.y.measurement]);
				coordinateSystem = "local";
				break;
			case 108: //"Göteborgs kommuns koordinatsystem" - we treat this as a local grid, for now
				outputCoords = proj4("EPSG:3006", "EPSG:4326", [workingCoordinates.x.measurement, workingCoordinates.y.measurement]);
				coordinateSystem = "EPSG:4326";
				break;
			case 103: //"RT90 5 gon V"
				let rt90Coords = [workingCoordinates.x.measurement, workingCoordinates.y.measurement];
				sweref99Coords = proj4("EPSG:3019", "EPSG:3006", rt90Coords);
				outputCoords = proj4("EPSG:3006", "EPSG:4326", sweref99Coords);
				coordinateSystem = "EPSG:4326";
				break;
			case 69: //"RT90 2.5 gon V"
				let rt9025Coords = [workingCoordinates.x.measurement, workingCoordinates.y.measurement];
				sweref99Coords = proj4("EPSG:3021", "EPSG:3006", rt9025Coords);
				outputCoords = proj4("EPSG:3006", "EPSG:4326", sweref99Coords);
				coordinateSystem = "EPSG:4326";
				break;
			case 78: //"Height from datum"
				break;
			case 80: //"Height from surface"
				break;
			case 77: //"Depth from reference level"
				break;
			case 76: //"Altitude above sea level"
				break;
			case 79: //"Depth from surface"
				break;
			case 72: //"WGS84"
				outputCoords = [workingCoordinates.x.measurement, workingCoordinates.y.measurement];
				coordinateSystem = "EPSG:4326";
				break;
			case 70: //"SWEREF 99 TM (Swedish)"
				sweref99Coords = [workingCoordinates.x.measurement, workingCoordinates.y.measurement];
				outputCoords = proj4("EPSG:3006", "EPSG:4326", sweref99Coords);
				coordinateSystem = "EPSG:4326";
				break;
			case 121: //"Rikets höjdsystem 1900"
				break;
			case 102: //"RH70"
				break;
			case 114: //"WGS84 UTM zone 32"
				//wgs84Coords = proj4('+proj=utm +zone=32 +ellps=WGS84', "EPSG:4326", [coordinateTrio.x.measurement, coordinateTrio.y.measurement]);
				outputCoords = proj4('+proj=utm +zone=32 +ellps=WGS84 +datum=WGS84 +units=m +no_defs', "EPSG:4326", [workingCoordinates.x.measurement, workingCoordinates.y.measurement]);
				coordinateSystem = "EPSG:4326";
				break;
			case 115: //"Depth from surface lower sample boundary"
				break;
			case 116: //"Depth from surface upper sample boundry "
				break;
			case 122: //"Depth from surface lower sample boundary "
				break;
			case 123: //"UTM U32 euref89"
				outputCoords = proj4("+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs", "EPSG:4326", [workingCoordinates.y.measurement, workingCoordinates.x.measurement]);
				coordinateSystem = "EPSG:4326";
				break;
			case 125: //"Upper sample boundary"
				break;
			case 126: //"Lower sample boundary depth"
				break;
			case 120: //"WGS84 UTM zone 33N"
				outputCoords = proj4('+proj=utm +zone=33 +ellps=WGS84 +datum=WGS84 +units=m +no_defs', "EPSG:4326", [workingCoordinates.y.measurement, workingCoordinates.x.measurement]);
				coordinateSystem = "EPSG:4326";
				break;
			default:
				console.warn("WARN: Support for coordinate method not implemented: "+workingCoordinates.x.coordinate_method.method_name);
		}

		//These don't actually (currently) exist in the database, but here they are for reference
		/*
		case "RT90 7.5 gon V":
			let rt9075Coords = [coordinateTrio.x.measurement, coordinateTrio.y.measurement];
			var sweref99Coords = proj4("EPSG:3018", "EPSG:3006", rt9075Coords);
			var wgs84Coords = proj4("EPSG:3006", "EPSG:4326", sweref99Coords);
			return wgs84Coords;
		case "RT90 0 gon":
			let rt900Coords = [coordinateTrio.x.measurement, coordinateTrio.y.measurement];
			var sweref99Coords = proj4("EPSG:3024", "EPSG:3006", rt900Coords);
			var wgs84Coords = proj4("EPSG:3006", "EPSG:4326", sweref99Coords);
			return wgs84Coords;
		case "RT90 2.5 gon O":
			let rt9025oCoords = [coordinateTrio.x.measurement, coordinateTrio.y.measurement];
			var sweref99Coords = proj4("EPSG:3018", "EPSG:3006", rt9025oCoords);
			var wgs84Coords = proj4("EPSG:3006", "EPSG:4326", sweref99Coords);
			return wgs84Coords;
		case "RT90 5 gon O":
			let rt905oCoords = [coordinateTrio.x.measurement, coordinateTrio.y.measurement];
			var sweref99Coords = proj4("EPSG:3019", "EPSG:3006", rt905oCoords);
			var wgs84Coords = proj4("EPSG:3006", "EPSG:4326", sweref99Coords);
			return wgs84Coords;
		*/

		return {
			coordinates: outputCoords,
			coordinateSystem: coordinateSystem
		};
	}
	

	getMultiStackConfig(chartTitle, legend = false) {

		let tooltipHtml = "<div class='site-report-chart-tooltip'>";
		tooltipHtml += "%v counts of %t (%plot-sum counts across all samples in this analysis)";
		tooltipHtml += "</div>";

		let config = {
            "type": "hbar",
            "stacked": true,
			"background-color": "#ffffff",
            "title":{
                "text": chartTitle,
				"adjustLayout": true,
				"font-size": "16px",
				"font-family": "Rajdhani"
            },
            "legend":{
                "visible": legend,
                "align": 'right',
                "verticalAlign": 'top',
                "toggleAction": 'remove',
				'draggable': true,
				'minimize': true,
				'alpha': 0.5,
				"header": {
					"text": "Taxa",
					'border-bottom': "2px solid #eee"
				  },
                "marker": {
                    "borderWidth": "1px",
                    "borderColor": "#888"
                }
            },
            "plotarea":{
                "margin": "dynamic",
            },
            "tooltip":{
				"text": tooltipHtml,
                "html-mode": true,
                "decimals": 0,
                "align": 'left',
                "borderRadius": 3,
                "fontColor":"#000000",
                "fontSize": "16px",
                "backgroundColor": "#ffffff"
            },
            "plot":{
                "valueBox":{
                    "text":"%total",
                    "rules": [
                        {
                            "rule": '%stack-top == 0',
                            "visible": 0
                        }
                    ]
                },
                "hoverState":{
                    "backgroundColor": "#fff"
				},
				"hover-mode": "plot",
				"stacked": true,
				"stack": 1,
				"stack-type": "normal"
            },
            "scaleX":{
                "labels": [],
				"format": "%v",
                "items-overlap": true,
				"max-labels": 100000,
				"label": {
					"text": "Sample name",
					"visible": true,
					"font-size": "14px"
				}
            },
            "scaleY":{
                "format": "%v",
				"items-overlap": true
            },
            "series": []
        };

		if(legend) {
			config.plotarea["margin-right"] = "25%";
		}

		return config;
	}

	getDendroMeasurementFromSample(dendroSample, measurementType) {
		let value = false;
		dendroSample.forEach(cell => {
			if(cell.type == "subtable") {
				cell.value.rows.forEach(subtableRow => {
					let labelCell = this.getCellWithRole(subtableRow, "label");
					if(labelCell.value == measurementType) {
						let valueCell = this.getCellWithRole(subtableRow, "value");
						value = valueCell.value;
					}
				})
			}
		})
		return value;
	}

	getCellWithRole(tableRow, roleName) {
		for(let key in tableRow) {
			if(typeof tableRow[key].role != undefined && tableRow[key].role == roleName) {
				return tableRow[key];
			}
		}
		return false;
	}

	getTableRowsAsObjects(table) {
		let dataObjects = [];
		for(let rowKey in table.rows) {
			let dataObject = {};
			for(let cellKey in table.rows[rowKey]) {
				let columnName = table.columns[cellKey].title ? table.columns[cellKey].title : table.columns[cellKey].dataType;
				if(columnName == "subtable") {
					let subtable = this.getTableRowsAsObjects(table.rows[rowKey][cellKey].value);
					dataObject[columnName] = subtable;
				}
				else {
					dataObject[columnName] = table.rows[rowKey][cellKey].value;
				}
			}

			dataObjects.push(dataObject);
		}
		return dataObjects;
	}

	getValueByColumnNameFromKeyValueTable(table, keyName) {
		for(let key in table) {
			if(table[key]["Measurement type"] == keyName) {
				return table[key]["Measurement value"]
			}
		}
	}

	getTableColumnKeyByTitle(columnTitle) {
		for(let key in this.contentItem.data.columns) {
			if(this.contentItem.data.columns[key].title == columnTitle) {
				return key;
			}
		}
		return null;
	}

	renderMultistackPlotly(chartTitle = "Abundances") {
		let contentItem = this.contentItem;
		let cir = this.siteReport.getContentItemRenderer(contentItem);
		var ro = cir.getSelectedRenderOption(contentItem);

		let xAxisKey = null;
		let yAxisKey = null;
		let sortKey = null;

		for(let key in ro.options) {

			if(ro.options[key].function == "xAxis") {
				xAxisKey = ro.options[key].selected;
			}
			if(ro.options[key].function == "yAxis") {
				yAxisKey = ro.options[key].selected;
			}
			if(ro.options[key].function == "sort") {
				sortKey = ro.options[key].selected;
			}
		}
		
		//Aggregate so that a taxon contains all the sample abundances
		this.taxa = []; //should maybe be called something like stackCategory to make it more generic?
		var samples = [];
		let sampleNames = [];

		let taxonIdColKey = this.getTableColumnKeyByTitle("Taxon id");
		let taxonNameColKey = this.getTableColumnKeyByTitle("Taxon");
		let abundanceColKey = this.getTableColumnKeyByTitle("Abundance count");
		let sampleIdColKey = this.getTableColumnKeyByTitle("Sample id");
		let sampleNameColKey = this.getTableColumnKeyByTitle("Sample name");

		/*
		var species_trace = {
			x: ['sample 1', 'sample 2', 'sample 3'],
			y: [abundanceSpecies1, abundanceSpecies1, abundanceSpecies1]
		}
		*/

		let uniqueTaxa = new Set();
		for(var key in contentItem.data.rows) {
			let taxonId = contentItem.data.rows[key][taxonIdColKey].value;
			uniqueTaxa.add(taxonId);
		}

		let taxaTraces = [];
		uniqueTaxa.forEach(traceTaxonId => {
			let trace = {
				x: [], //sample names
				y: [], //species abundances across samples
				name: traceTaxonId, //species name
				type: 'bar'
			};
			
			for(var key in contentItem.data.rows) {
				let sampleName = contentItem.data.rows[key][sampleNameColKey].value;
				let taxonId = contentItem.data.rows[key][taxonIdColKey].value;
				let taxonAb = contentItem.data.rows[key][abundanceColKey].value;
				if(taxonId == traceTaxonId) {
					trace.x.push(sampleName);
					trace.y.push(taxonAb);
				}
			}
			taxaTraces.push(trace);
		});
		
		var colors = [];
		//colors = this.sqs.color.getMonoColorScheme(taxonCount);
		//colors = this.sqs.color.getColorScheme(taxonCount, false);
		//colors = this.sqs.color.getVariedColorScheme(taxonCount);
		
		let traces = [];

		var trace1 = {
			x: ['giraffes', 'orangutans', 'monkeys'],
			y: [20, 14, 23],
			name: 'SF Zoo',
			type: 'bar'
		};
			
		var trace2 = {
			x: ['giraffes', 'orangutans', 'monkeys'],
			y: [12, 18, 29],
			name: 'LA Zoo',
			type: 'bar'
		};
			
		//var data = [trace1, trace2];
		let data = taxaTraces;
		var layout = {
			barmode: 'stack'
		};

		this.chartId = "chart-"+nanoid();
		var chartContainer = $("<div id='"+this.chartId+"' class='site-report-chart-container'></div>");
		$(this.anchorNodeSelector).append(chartContainer);

		Plotly.newPlot(this.chartId, data, layout, {responsive: true, displayModeBar: false});

	}

	/*
	* Function: renderMultistack
	*
	* WARNING: This function is currently hard-coded to only handle abundances and requires the data in a specific way.
	* Specified X/Y-axis will be ignored.
	 */
	async renderMultistack(chartTitle = "Abundances") {
		var contentItem = this.contentItem;
		let cir = this.siteReport.getContentItemRenderer(contentItem);
		var ro = cir.getSelectedRenderOption(contentItem);

		let xAxisKey = null;
		let yAxisKey = null;
		let sortKey = null;

		for(let key in ro.options) {

			if(ro.options[key].function == "xAxis") {
				xAxisKey = ro.options[key].selected;
			}
			if(ro.options[key].function == "yAxis") {
				yAxisKey = ro.options[key].selected;
			}
			if(ro.options[key].function == "sort") {
				sortKey = ro.options[key].selected;
			}
		}

		var config = this.getMultiStackConfig(chartTitle, false);
		
		//Aggregate so that a taxon contains all the sample abundances
		this.taxa = []; //should maybe be called something like stackCategory to make it more generic?
		var samples = [];
		let sampleNames = [];

		let taxonIdColKey = this.getTableColumnKeyByTitle("Taxon id");
		let taxonNameColKey = this.getTableColumnKeyByTitle("Taxon");
		let abundanceColKey = this.getTableColumnKeyByTitle("Abundance count");
		let sampleIdColKey = this.getTableColumnKeyByTitle("Sample id");
		let sampleNameColKey = this.getTableColumnKeyByTitle("Sample name");

		//This is the list of samples we're going to use and IN THIS ORDER - VERY IMPORTANT
		for(var key in contentItem.data.rows) {
			var sampleId = contentItem.data.rows[key][sampleIdColKey].value;
			let sampleName = contentItem.data.rows[key][sampleNameColKey].value;

			//Get unique sample Ids
			var sampleFound = false;
			for(var sk in samples) {
				if(samples[sk] == sampleId) {
					sampleFound = true;
				}
			}
			if(sampleFound === false) {
				samples.push(sampleId);
			}

			//Get unique sample names
			let sampleNameFound = false;
			for(var sk in sampleNames) {
				if(sampleNames[sk] == sampleName) {
					sampleNameFound = true;
				}
			}
			if(sampleNameFound === false) {
				sampleNames.push(sampleName);
			}
		}
		
		
		//Build data structure where the taxon is top/master, because that's the twisted weird logic that zingchart uses for rendering...
		var taxonCount = 0;

		for(var key in contentItem.data.rows) {
			var taxonId = contentItem.data.rows[key][taxonIdColKey].value;
			var taxonName = contentItem.data.rows[key][taxonNameColKey].value;
			var abundance = contentItem.data.rows[key][abundanceColKey].value;
			var sampleId = contentItem.data.rows[key][sampleIdColKey].value;
			var sampleName = contentItem.data.rows[key][sampleNameColKey].value;
			
			if(typeof(this.taxa[taxonId]) == "undefined") {
				this.taxa[taxonId] = {
					taxonId: taxonId,
					taxonName: taxonName,
					samples: []
				};
				taxonCount++;
			}

			this.taxa[taxonId].samples.push({
				abundance: abundance,
				sampleId: sampleId,
				sampleName: sampleName
			});
		}
		
		
		var colors = [];
		//colors = this.sqs.color.getMonoColorScheme(taxonCount);
		colors = this.sqs.color.getColorScheme(taxonCount, false);
		//colors = this.sqs.color.getVariedColorScheme(taxonCount);
		
		//Normalize the taxa structure so that each taxon contains all the samples but with zero abundance where non-existant
		var colorKey = 0;
		for(var key in this.taxa) {
			var values = [];
			for(var k in samples) {
				var sampleId = samples[k];
				
				var sampleValue = 0;
				for(var sk in this.taxa[key].samples) {
					if(this.taxa[key].samples[sk].sampleId == sampleId) {
						sampleValue = this.taxa[key].samples[sk].abundance;
					}
				}
				
				values.push(sampleValue);
			}

			config.series.push({
				stack: 1,
				values: values, //This is one taxon, each array item is for one sample - in order
				//text: taxa[key].taxonName+",<br> "+taxa[key].elementType, //Taxon name,
				text: this.taxa[key].taxonName,
				backgroundColor: colors[colorKey++],
				borderColor: "#888",
				borderWidth: "1px",
				valueBox: {
					fontColor: "#000000"
				}
			});
		}

		for(var k in sampleNames) {
			config.scaleX.labels.push(sampleNames[k]);
		}
		
		this.chartId = "chart-"+nanoid();
		var chartContainer = $("<div id='"+this.chartId+"' class='site-report-chart-container'></div>");
		$(this.anchorNodeSelector).append(chartContainer);

		var chartHeight = 130 + (samples.length * 40);

		$("#"+this.chartId).html("<div class='content-item-chart-rendering-message'>Rendering... <div class='mini-loading-indicator' style='display:inline-block;'></div></div>");
		setTimeout(() => {
			$("#"+this.chartId).html("");
			zingchart.render({
				id: this.chartId,
				data: config,
				defaults: this.chartTheme,
				height: chartHeight,
				events: {
					click: (evt, stuff) => {
						console.log("zingchart click evt");
					}
				}
			});
		}, 200);
		
	}

	getSelectedRenderOptionExtra(extraOptionTitle = "Sort") {

        let renderOption = null;
        this.contentItem.renderOptions.forEach(ro => {
            /*
			if(ro.type == "bar") {
                renderOption = ro;
            }
			*/
			
			if(ro.name == "Bar chart" || ro.type == "coordinate-map") {
                renderOption = ro;
            }
			
        });

        let sortOptionSelect = null;
        renderOption.options.forEach(roE => {
            if(roE.title == extraOptionTitle) {
                sortOptionSelect = roE;
            }
        });

        let selectedOption = null;
		if(sortOptionSelect != null) {
			sortOptionSelect.options.forEach(selectOption => {
				if(selectOption.selected === true) {
					selectedOption = selectOption;
				}
			});
		}
        

        if(selectedOption == null && sortOptionSelect != null && sortOptionSelect.options.length > 0) {
            selectedOption = sortOptionSelect.options[0];
        }
        else if(selectedOption == null) {
            return false;
        }

        return selectedOption;
    }

	/*
	* Function: renderBarChartZing
	*
	* Render bar chart using ZingChart
	*/
	renderBarChartZing() {
		var contentItem = this.contentItem;
		
		let xAxisKey = this.getSelectedRenderOptionExtra("X axis").value;
		let yAxisKey = this.getSelectedRenderOptionExtra("Y axis").value;
		let sortCol = this.getSelectedRenderOptionExtra("Sort").value;

		var xUnitSymbol = "";
		var yUnitSymbol = "";
		
		if(contentItem.data.columns[xAxisKey].hasOwnProperty("unit")) {
			xUnitSymbol = contentItem.data.columns[xAxisKey].unit;
		}
		if(contentItem.data.columns[yAxisKey].hasOwnProperty("unit")) {
			yUnitSymbol = contentItem.data.columns[yAxisKey].unit;
		}

		contentItem.data.rows.sort((a, b) => {
			if(a[sortCol].value > b[sortCol].value) {
				return 1;
			}
			else {
				return -1;
			}
		});

		
		var config = {
			"type": "bar",
			"plot": {
				"tooltip": {
					"text": "<span class='chart-tooltip-info'>"+contentItem.data.columns[xAxisKey].title+": %kv</span>\n"+contentItem.data.columns[yAxisKey].title+": %v",
					"font-size": 16,
				},
				"background-color": "#34454f",
				"hover-state": {
					"background-color": "#f60"
				},
				"max-trackers": 10000
			},
			"scale-x": {
				"format":"%v"+xUnitSymbol,
				"label": {
					"text": contentItem.data.columns[xAxisKey].title
				},
				"values": []
			},
			"scale-y": {
				"format":"%v"+yUnitSymbol,
				"label": {
					"text": contentItem.data.columns[yAxisKey].title
				},
				"values": []
			},
			"series": [{
				"values": [],
				"text": "Series1"
			}]
		};
		
		let yValues = [];
		for(var key in contentItem.data.rows) {
			yValues.push(contentItem.data.rows[key][yAxisKey].value);
			config["scale-x"].values.push(contentItem.data.rows[key][xAxisKey].value);
			config["scale-y"].values.push(contentItem.data.rows[key][yAxisKey].value);
			config["series"][0].values.push(contentItem.data.rows[key][yAxisKey].value);
		}

		//This is really silly work-around for a bug in zingchart. The Y-axis doesn't render properly if the maximum difference between the data points is less than 1.0
		let yDiff = Math.max.apply(null, yValues) - Math.min.apply(null, yValues);
		if(yDiff < 1) {
			config["scale-y"].values.push(Math.max.apply(null, yValues) + 1);
		}
		
		this.chartId = "chart-"+nanoid();
		var chartContainer = $("<div id='"+this.chartId+"' class='site-report-chart-container'></div>");
		$(this.anchorNodeSelector).append(chartContainer);

		zingchart.render({
			id : this.chartId,
			data : config,
			defaults: this.chartTheme
		});
	}

	/**
	 * dataTransform
	 * 
	 * Purpose of this method is to transform the data into a format that is easier to work with for charts
	 * 
	 * @param {*} contentItem 
	 */
	dataTransform(contentItem) {
		let xValues = [];
		let yValues = [];

		let xAxisRo = this.getSelectedRenderOptionExtra("X axis");
		let yAxisRo = this.getSelectedRenderOptionExtra("Y axis");

		var xUnitSymbol = "";
		var yUnitSymbol = "";

		if(xAxisRo.location == "subtable") {
			contentItem.data.rows.forEach(row => {
				row.forEach(cell => {
					if(cell.type == "subtable") {
						cell.value.rows.forEach(subTableRow => {
							if(subTableRow[1].value == xAxisRo.title) {
								xValues.push(subTableRow[xAxisRo.value].value);
							}
						});
					}
				});
			});
		}
		else {
			contentItem.data.rows.forEach(row => {
				xValues.push(row[xAxisRo.value].value);
			});
			if (contentItem.data.columns[xAxisRo.value].hasOwnProperty("unit")) {
				xUnitSymbol = contentItem.data.columns[xAxisRo.value].unit;
			}
		}

		if(yAxisRo.location == "subtable") {
			contentItem.data.rows.forEach(row => {
				row.forEach(cell => {
					if(cell.type == "subtable") {
						cell.value.rows.forEach(subTableRow => {
							if(subTableRow[1].value == yAxisRo.title) {
								yValues.push(subTableRow[yAxisRo.value].value);
							}
						});
					}
				});
			});
		}
		else {
			contentItem.data.rows.forEach(row => {
				yValues.push(row[yAxisRo.value].value);
			});
			if (contentItem.data.columns[yAxisRo.value].hasOwnProperty("unit")) {
				yUnitSymbol = contentItem.data.columns[yAxisRo.value].unit;
			}
		}
		
		return {
			x: {
				title: xAxisRo.title,
				values: xValues,
				unit: xUnitSymbol
			},
			y: {
				title: yAxisRo.title,
				values: yValues,
				unit: yUnitSymbol
			}
		}
	}

	renderBarChartPlotly() {
		var contentItem = this.contentItem;
	  
		let chartData = this.dataTransform(contentItem);

		//let xAxisKey = this.getSelectedRenderOptionExtra("X axis").value;
		//let yAxisKey = this.getSelectedRenderOptionExtra("Y axis").value;
		//let sortCol = this.getSelectedRenderOptionExtra("Sort").value;

		// Combine the arrays and sort them based on values
		let keysArray = chartData.x.values;
		let valuesArray = chartData.y.values;

		let combinedArrays = keysArray.map((key, index) => ({ key, value: valuesArray[index] }));
		combinedArrays.sort((a, b) => a.value - b.value);

		// Extract sorted keys and values
		let sortedKeys = combinedArrays.map(item => item.key);
		let sortedValues = combinedArrays.map(item => item.value);

		chartData.y.values = sortedValues;
		chartData.x.values = sortedKeys;

		/*
		contentItem.data.rows.sort((a, b) => {
		  if (a[sortCol].value > b[sortCol].value) {
			return 1;
		  } else {
			return -1;
		  }
		});
		*/

		let graphType = "bar";
		if(contentItem.data.rows.length > 100) {
			graphType = "scatter";
		}
		graphType = "scatter"; //FIXME: We should rename this method to reflect that we are now using scatter plots for bar charts
		
		let data = [
		  {
			x: chartData.x.values,
			y: chartData.y.values,
			type: graphType,
			mode: "markers",
			text: chartData.y.values.map((val) => `${val}${chartData.y.unit}`),
			hoverinfo: "x+text",
			hovertemplate: '%{y}<extra>Sample name %{x}</extra>',
			textposition: 'auto',
			marker: {
				color: this.sqs.color.colors.baseColor,
			}
		  },
		];


		//calculate bottom margin based on lenght of sample names
		let marginB = 50;
		let maxSampleNameLength = 0;
		chartData.x.values.forEach(sampleName => {
			if(sampleName.length > maxSampleNameLength) {
				maxSampleNameLength = sampleName.length;
			}
		});
		marginB += maxSampleNameLength * 5;

		let layout = {
			title: {
				//text: contentItem.data.columns[yAxisKey].title+" by "+contentItem.data.columns[xAxisKey].title,
				font: {
					family: 'Didact Gothic, sans-serif',
					size: 22
				},
			},
			plot_bgcolor: "#fff",
			paper_bgcolor: "#fff",
			autosize: true,
			showlegend: false,
			margin: {
				l: 50,
				r: 50,
				b: marginB,
				t: 50,
				pad: 4
			},
			font: {
				family: 'Didact Gothic, sans-serif',
				size: 14,
				color: '#333'
			},
			xaxis: {
				type: "category", //to get distinct and not linear/range values
				tickangle: 60,
			},
			yaxis: {
				showticklabels: false,
				automargin: true,
			}
		};
	  
		this.chartId = "chart-" + nanoid();
		var chartContainer = $("<div id='" + this.chartId + "' class='site-report-chart-container'></div>");
		$(this.anchorNodeSelector).append(chartContainer);
	  
		Plotly.newPlot(this.chartId, data, layout, {responsive: true, displayModeBar: false});
	}
	  
	
	
	/*
	* Function: renderBarChartZing
	*
	* DEPRECATED. Render bar chart using ChartJS.
	*/
	renderBarChartCJS() {
		var contentItem = this.contentItem;

		let cir = this.siteReport.getContentItemRenderer(this.contentItem);
		var ro = cir.getSelectedRenderOption(contentItem);
		var xAxisKey = ro.options.xAxis;
		var yAxisKey = ro.options.yAxis;
		
		var xAxisLabel = contentItem.data.columns[xAxisKey].title;
		var yAxisLabel = contentItem.data.columns[yAxisKey].title;

		var chartjsData = {};
		chartjsData.labels = [];
		chartjsData.datasets = [];
		chartjsData.datasets.push({
			label: "Dataset 1",
			data: [],
			hoverBackgroundColor: "#f60"
		});

		var bgColor = this.sqs.color.getColorScheme(1)[0];
		bgColor = "#34454f";

		for(var key in contentItem.data.rows) {
			chartjsData.labels.push(contentItem.data.rows[key][xAxisKey]);
			chartjsData.datasets[0].data.push(contentItem.data.rows[key][yAxisKey]);
			chartjsData.datasets[0].backgroundColor = bgColor;
		}

		this.chartConfig = {
			"type": "bar",
			"data": {
				"labels": chartjsData.labels,
				"datasets": chartjsData.datasets
			}
		};

		this.chartConfig.options = {
			responsive: true,
			responsiveAnimationDuration: 0,
			onResize: (chart, size) => {
			},
			legend: {
				position: "top",
				display: false
			},
			tooltips: {
				callbacks: {
					label: function(tooltipItem) {
						return yAxisLabel+": "+tooltipItem.yLabel;
					}
				}
			},
			animation: {
			},
			title: {
				display: false,
				text: contentItem.title
			},
			scales: {
				yAxes: [
					{
						scaleLabel: {
							display: true,
							labelString: yAxisLabel
						},
						ticks: {
							beginAtZero: true
						}
					}
				],
				xAxes: [
					{
						scaleLabel: {
							display: true,
							labelString: xAxisLabel
						},
						ticks: {
							display: contentItem.data.rows.length < 31,
							beginAtZero: false,
							autoSkip: false
						}
					}
				]
			}
		};

		var chartId = "chart-"+nanoid();
		var chartContainer = $("<div class='site-report-chart-container'></div>");
		this.chartNode = $("<canvas id='"+chartId+"' class='site-report-chart'></canvas>");
		chartContainer.append(this.chartNode);
		$(this.anchorNodeSelector).append(chartContainer);
		var ctx = $(this.chartNode)[0].getContext("2d");
		new Chart(ctx, this.chartConfig);

		return chartContainer;
	}

	renderLossOnIgnitionChart() {
		let contentItem = this.contentItem;
		
		let xAxisKey = this.getSelectedRenderOptionExtra("X axis").value;
		let yAxisKey = this.getSelectedRenderOptionExtra("Y axis").value;
		let sortCol = this.getSelectedRenderOptionExtra("Sort").value;

		var xUnitSymbol = "";
		var yUnitSymbol = "";
		
		if(contentItem.data.columns[xAxisKey].hasOwnProperty("unit")) {
			xUnitSymbol = contentItem.data.columns[xAxisKey].unit;
		}
		if(contentItem.data.columns[yAxisKey].hasOwnProperty("unit")) {
			yUnitSymbol = contentItem.data.columns[yAxisKey].unit;
		}

		contentItem.data.rows.sort((a, b) => {
			if(a[sortCol].value > b[sortCol].value) {
				return 1;
			}
			else {
				return -1;
			}
		});

		let sampleNames = [];
		let datasets = [];
		datasets.push({
			label: "Burn loss",
			backgroundColor: "red",
			data: []
		});

		//find column named "Sample name"
		let sampleNameColKey = null;
		contentItem.data.columns.forEach((col, colKey) => {
			if(col.title == "Sample name") {
				sampleNameColKey = colKey;
			}
		});

		for(var key in contentItem.data.rows) {
			let row = contentItem.data.rows[key];
			let sampleName = row[sampleNameColKey].value;
			sampleNames.push(sampleName);
			let value = row[yAxisKey].value;
			
			datasets[0].data.push(value);
		}

		const data = {
			labels: sampleNames,
			datasets: datasets
		};

		let config = {
			type: 'bar',
			data: data,
			options: {
				plugins: {
					legend: {
						position: 'top',
					},
					tooltip: {
						enabled: true,
						callbacks: {
							title: function(context) {
								return "Sample "+context[0].label;
							},
							label: function(context) {
								return context.dataset.label+" loss: "+context.formattedValue+" %";
							}
						}
					}
				},
				responsive: true,
				scales: {
					x: {
						stacked: true,
					},
					y: {
						stacked: true
					}
				}
			}
		  };
		
		  
		this.chartId = "chart-"+nanoid();
		var chartContainer = $("<canvas id='"+this.chartId+"' class='site-report-chart-container'></canvas>");
		$(this.anchorNodeSelector).append(chartContainer);

		new Chart(
			document.getElementById(this.chartId),
			config
		);
	}

	renderEcoCodeChart() {
		let contentItem = this.contentItem;
		let xAxisKey = this.getSelectedRenderOptionExtra("X axis").value;
		let yAxisKey = this.getSelectedRenderOptionExtra("Y axis").value;
		let sortCol = this.getSelectedRenderOptionExtra("Sort").value;

		let ecoCodeNames = [];
		let datasets = [];
		
		datasets.push({
			label: "Eco codes",
			data: [],
			backgroundColor: []
		});

		for(var key in contentItem.data.rows) {
			let row = contentItem.data.rows[key];
			let ecoCodeName = row[0].value;
			ecoCodeNames.push(ecoCodeName);
			datasets[0].data.push(row[yAxisKey].value);
			
			//Find the color for this ecocode
			for(let defKey in this.sqs.bugsEcoCodeDefinitions) {
				if(this.sqs.bugsEcoCodeDefinitions[defKey].name == ecoCodeName) {
					datasets[0].backgroundColor.push(this.sqs.bugsEcoCodeDefinitions[defKey].color);
				}
			}
		}

		const data = {
			labels: ecoCodeNames,
			datasets: datasets
		};

		let config = {
			type: 'bar',
			data: data,
			options: {
				animation: false,
				plugins: {
					title: {
						display: true,
						text: 'Eco codes'
					},
					legend: {
						display: false,
						position: 'top',
					},
					tooltip: {
						enabled: true,
						callbacks: {
							title: function(context) {
								return context[0].label;
							},
							label: function(context) {
								return contentItem.data.columns[yAxisKey].title+": "+context.formattedValue;
							}
						}
					}
				},
				responsive: true,
				scales: {
					x: {
						stacked: true,
					},
					y: {
						stacked: true
					}
				}
			}
		  };
		
		  
		this.chartId = "chart-"+nanoid();
		var chartContainer = $("<canvas id='"+this.chartId+"' class='site-report-chart-container'></canvas>");
		$(this.anchorNodeSelector).append(chartContainer);

		let c = new Chart(
			document.getElementById(this.chartId),
			config
		);
	}

	getSubTableCellFromRow(row) {
		for(let key in row) {
			let cell = row[key];
			if(cell.type == "subtable") {
				return cell;
			}	
		}
	}

	renderEcoCodesPerSampleChart() {
		let contentItem = this.contentItem;
		let yAxisKey = this.getSelectedRenderOptionExtra("X axis").value;
		let sortCol = this.getSelectedRenderOptionExtra("Sort").value;

		//The contentItemRenderer will already have applied its own basic form of sort here
		//but we wish to sort the ecocodes in each sample based on the site-level aggregated values, so we have to do our own sort here to figure that out
		
		let ecocodes = JSON.parse(JSON.stringify(this.sqs.bugsEcoCodeDefinitions)); //copy this

		//let's find out which eco codes are the largest based on aggregating them over all samples
		for(let key in contentItem.data.rows) {
			let row = contentItem.data.rows[key];
			let subtable = this.getSubTableCellFromRow(row).value;
			subtable.rows.forEach(subtableRow => {
				let ecocodeDefinitionId = subtableRow[3].value;
				let ecoCodeAbundanceAgg = subtableRow[1].value;
				let ecoCodeTaxaAgg = subtableRow[2].value;

				for(let ecocodeKey in ecocodes) {
					if(ecocodes[ecocodeKey].ecocode_definition_id == ecocodeDefinitionId) {
						if(typeof ecocodes[ecocodeKey].abundanceAgg == "undefined") {
							ecocodes[ecocodeKey].abundanceAgg = 0;
						}
						ecocodes[ecocodeKey].abundanceAgg += ecoCodeAbundanceAgg;
						if(typeof ecocodes[ecocodeKey].taxaAgg == "undefined") {
							ecocodes[ecocodeKey].taxaAgg = 0;
						}
						ecocodes[ecocodeKey].taxaAgg += ecoCodeTaxaAgg;
					}
				}
			});
		}

		let sortVar = "abundanceAgg";
		if(sortCol == 3) {
			sortVar = "taxaAgg";
		}
		ecocodes.sort((a, b) => {
			if(a[sortVar] > b[sortVar]) {
				return -1;
			}
			else {
				return 1;
			}
		});

		let ecocodesSorted = ecocodes; //Just to make it clear what this is for

		let pkeyCol = null;
		for(let key in contentItem.data.columns) {
			if(contentItem.data.columns[key].pkey) {
				pkeyCol = key;
			}
		}

		let datasets = [];
		let sampleNames = [];
		contentItem.data.rows.forEach(row => {
			//each row is a sample
			let sampleId = row[pkeyCol].value;
			let sampleName = row[1].value;
			let aggAbundance = row[2].value;
			let aggTaxa = row[3].value;
			let subTable = row[4].value;
			sampleNames.push(sampleName);
		});

		//sorting
		//order of ecocodes should match with their size in the site aggregation chart

		ecocodesSorted.forEach(ecocode => {

			let dataset = {
				label: ecocode.name,
				data: [], 
				backgroundColor: ecocode.color
			}
			
			contentItem.data.rows.forEach(row => {
				let sampleId = row[pkeyCol].value;
				let aggAbundance = row[2].value;
				let aggTaxa = row[3].value;
				let subTable = row[4].value;



				subTable.rows.forEach(r => {
					let rowEcocodeName = r[0].value;
					let ecocodeDefinitionId = r[3].value;
					if(rowEcocodeName == ecocode.name) {
						//console.log(rowEcocodeName+": "+r[yAxisKey].value);
						dataset.data.push(r[yAxisKey].value);
					}
				});
			});
			datasets.push(dataset);
		});

		//Datasets should not be samples, they should be per ecocode
		const data = {
			labels: sampleNames,
			datasets: datasets
		};

		let config = {
			type: 'bar',
			data: data,
			options: {
				animation: false,
				indexAxis: 'y',
				plugins: {
					title: {
						display: true,
						text: 'Eco codes'
					},
					legend: {
						display: true,
						position: 'bottom',
						align: 'center'
					},
					tooltip: {
						enabled: true,
						callbacks: {
							title: function(context) {
								return contentItem.data.columns[yAxisKey].title+": "+context[0].formattedValue;
							},
							label: function(context) {
								return context.dataset.label;
							}
						}
					}
				},
				responsive: true,
				scales: {
					x: {
						stacked: true,
					},
					y: {
						stacked: true
					}
				}
			}
		  };
		
		  
		this.chartId = "chart-"+nanoid();
		var chartContainer = $("<canvas id='"+this.chartId+"' class='site-report-chart-container'></canvas>");
		$(this.anchorNodeSelector).append(chartContainer);

		new Chart(
			document.getElementById(this.chartId),
			config
		);
	}

	renderMagneticSusceptibilityBarChart() {
		let contentItem = this.contentItem;
		
		let xAxisKey = this.getSelectedRenderOptionExtra("X axis").value;
		let yAxisKey = this.getSelectedRenderOptionExtra("Y axis").value;
		let sortCol = this.getSelectedRenderOptionExtra("Sort").value;

		var xUnitSymbol = "";
		var yUnitSymbol = "";
		
		if(contentItem.data.columns[xAxisKey].hasOwnProperty("unit")) {
			xUnitSymbol = contentItem.data.columns[xAxisKey].unit;
		}
		if(contentItem.data.columns[yAxisKey].hasOwnProperty("unit")) {
			yUnitSymbol = contentItem.data.columns[yAxisKey].unit;
		}

		contentItem.data.rows.sort((a, b) => {
			if(a[sortCol].value > b[sortCol].value) {
				return 1;
			}
			else {
				return -1;
			}
		});

		let sampleNames = [];
		let datasets = [];
		datasets.push({
			label: "Unburned",
			backgroundColor: "darkblue",
			data: []
		});
		datasets.push({
			label: "Burned",
			backgroundColor: "red",
			data: []
		});

		//get column key for title "Unburned"
		let unburnedColKey = null;
		let burnedColKey = null;
		contentItem.data.columns.forEach((col, colKey) => {
			if(col.title == "Unburned") {
				unburnedColKey = colKey;
			}
			if(col.title == "Burned") {
				burnedColKey = colKey;
			}
		});
		
		for(var key in contentItem.data.rows) {
			let row = contentItem.data.rows[key];
			let sampleName = row[xAxisKey].value;
			sampleNames.push(sampleName);
			let unburned = row[unburnedColKey].value;
			let burned = row[burnedColKey].value;
			
			datasets[0].data.push(unburned);
			datasets[1].data.push(burned);
		}

		const data = {
			labels: sampleNames,
			datasets: datasets
		};

		let config = {
			type: 'bar',
			data: data,
			options: {
				plugins: {
					legend: {
						position: 'top',
					},
					tooltip: {
						enabled: true,
						callbacks: {
							title: function(context) {
								return "Sample "+context[0].label;
							},
							label: function(context) {
								return context.dataset.label+" weight: "+context.formattedValue+" mg";
							}
						}
					}
				},
				responsive: true,
				scales: {
					x: {
						stacked: true,
					},
					y: {
						stacked: true
					}
				}
			}
		  };
		
		  
		this.chartId = "chart-"+nanoid();
		var chartContainer = $("<canvas id='"+this.chartId+"' class='site-report-chart-container'></canvas>");
		$(this.anchorNodeSelector).append(chartContainer);

		new Chart(
			document.getElementById(this.chartId),
			config
		);
	}

	renderPieChart() {
		var contentItem = this.contentItem;
		let cir = this.siteReport.getContentItemRenderer(this.contentItem);
		var ro = cir.getSelectedRenderOption(contentItem);
		
		var dimensionKey = ro.options.dimension;
		
		var config = {
			"type": "pie",
			"plot": {
				"tooltip": {
					"text": "<span class='chart-tooltip-info'>%t (Count: %v)</span>",
					"font-size": 16,
				},
				"background-color": "#34454f",
				"hover-state": {
					"background-color": "#f60"
				},
				"max-trackers": 1000,
				"value-box":{
					"font-size":14,
					"font-weight":"normal",
					"placement":"in",
					"text": "%v"
				}
				
				
			},
			/*
			"legend": {
				"toggle-action": "hide",
				"header": {
					"text": "Legend"
				},
				"item": {
					"cursor": "pointer"
				},
				"draggable": true,
				"drag-handler": "icon"
			},
			*/
			"series": [
			]
		};
		
		
		var categories = [];
		
		for(var key in contentItem.data.rows) {
			var row = contentItem.data.rows[key];
			
			var found = false;
			for(var k in categories) {
				if(categories[k].value == row[dimensionKey].value) {
					categories[k].count++;
					found = true;
				}
			}
			if(!found) {
				categories.push({
					title: row[dimensionKey].value,
					value: row[dimensionKey].value,
					count: 1,
					tooltip: ""
				});
			}
		}
		
		//var colors = this.sqs.siteReportManager.siteReport.getColorScheme(categories.length);
		var colors = this.sqs.color.getMonoColorScheme(categories.length, "#34454f", "#34454f");
		
		for(var key in categories) {
			config.series.push({
				text: categories[key].value,
				values : [categories[key].count],
				backgroundColor: colors[key]
			});
		}
		
		var chartId = "chart-"+nanoid();
		var chartContainer = $("<div id='"+chartId+"' class='site-report-chart-container'></div>");
		$(this.anchorNodeSelector).append(chartContainer);
		
		zingchart.render({
			id : chartId,
			data : config,
			defaults: this.chartTheme
		});
	}

	convertToChartJsData(data) {

		var chartjsStruct = {
			"type": data.type.split("-")[1],
			"data": {
				"labels": data.labels,
				"datasets": data.datasets
			}
		};

		return chartjsStruct;
	}

	renderContentDisplayOptionsPanel(section, contentItem) {
		
	}
}

export { SiteReportChart as default }