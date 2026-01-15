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
import { isNumber } from "lodash";

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
						node = this.renderScatterChartPlotly();
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
						//node = this.renderMultistackPlotly();
						break;
					case "dendrochart":
						node = this.renderDendroChart();
						break;
						/*
					case "coordinate-map":
						this.renderCoordinateMap();
						break;
						*/
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
		this.renderScatterChartPlotly();
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

	getSampleGroupMapPoints(contentItem) {
		
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
							if(sc.role == "coordinates") {
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

	convertPointsToGeoJSON(points) {
		let features = [];
		points.forEach(point => {
			let geometry = {};

			if(isNumber(point.x) && isNumber(point.y)) {
				geometry = {
					type: "Point",
					coordinates: [
						point.x,
						point.y
					]
				};
			}

			let zCoordPresentation = "";
			if(point.z.length > 0 && isNumber(parseFloat(point.z[0].measurement))) {
				point.z.forEach(zCoord => {
					if(zCoordPresentation != "") {
						zCoordPresentation += ", ";
					}
					zCoordPresentation += this.getZcoordinateAsString(zCoord);
				});
				point.zString = zCoordPresentation;

				geometry.coordinates.push(point.z[0].measurement);
			}

			features.push({
				type: "Feature",
				geometry: geometry,
				properties: {
					sampleName: point.sampleName,
					sampleGroupId: point.sampleGroupId,
					sampleGroupName: point.sampleGroupName,
					planarCoordSys: point.planarCoordSys,
					verticalCoordDesc: zCoordPresentation,
				}
			});
		});

		let geojson = {
			type: "FeatureCollection",
			features: features
		};
	
		return geojson;
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
				text: [], //tooltip text
				name: traceTaxonId, //species name
				type: 'bar',
				orientation: 'h'
			};
			
			for(var key in contentItem.data.rows) {
				let sampleName = contentItem.data.rows[key][sampleNameColKey].value;
				let taxonId = contentItem.data.rows[key][taxonIdColKey].value;
				let taxonAb = contentItem.data.rows[key][abundanceColKey].value;
				if(taxonId == traceTaxonId) {
					trace.x.push(taxonAb);
					trace.y.push(sampleName);
					trace.text.push(`Taxon ID: ${taxonId}<br>Taxon: <br>Abundance: ${taxonAb}`);
				}
			}
			taxaTraces.push(trace);
		});
		
		let data = taxaTraces;

		var layout = {
			barmode: 'stack',
			title: chartTitle,
			yaxis: {
				title: 'Sample Names',
				showticklabels: true,
			},
			xaxis: {
				title: 'Abundance'
			}
		};

		this.chartId = "chart-"+nanoid();
		var chartContainer = $("<div id='"+this.chartId+"' class='site-report-chart-container'></div>");
		$(this.anchorNodeSelector).append(chartContainer);

		Plotly.newPlot(this.chartId, data, layout, {responsive: true, displayModeBar: false});
	}

	async renderMultistackPlotly3(chartTitle = "Abundances") {
		var contentItem = this.contentItem;
		// Assuming 'this.siteReport.getContentItemRenderer(contentItem)' is a way to access options; you'll need to adapt this part
		let cir = this.siteReport.getContentItemRenderer(contentItem);

		// Prepare data variables
		let taxa = [];
		let samples = []; // Unique sample IDs
		let sampleNames = []; // Unique sample names for x-axis
		let traceColors = []; // Colors for each trace

		// Assumed methods to get column keys based on titles
		let taxonIdColKey = this.getTableColumnKeyByTitle("Taxon id");
		let taxonNameColKey = this.getTableColumnKeyByTitle("Taxon");
		let abundanceColKey = this.getTableColumnKeyByTitle("Abundance count");
		let sampleIdColKey = this.getTableColumnKeyByTitle("Sample id");
		let sampleNameColKey = this.getTableColumnKeyByTitle("Sample name");

		// Data aggregation logic here...

		// Prepare Plotly traces
		let traces = taxa.map(taxon => {
			return {
				x: sampleNames,
				y: taxon.samples.map(sample => sample.abundance), // You'll need to ensure these are correctly ordered to match `sampleNames`
				type: 'bar',
				name: taxon.taxonName,
				marker: {
					color: taxon.color, // Assume each taxon has a color property
				}
			};
		});

		// Layout configuration
		var layout = {
			title: chartTitle,
			barmode: 'stack',
			xaxis: {
				title: 'Sample Names', // Assuming you're labeling the samples on the x-axis
			},
			yaxis: {
				title: 'Abundance', // Assuming you're quantifying abundance on the y-axis
			}
		};

		// Generate a unique ID for the chart container
		this.chartId = "chart-" + nanoid();
		var chartContainer = document.createElement('div');
		chartContainer.id = this.chartId;
		chartContainer.className = 'site-report-chart-container';
		document.querySelector(this.anchorNodeSelector).appendChild(chartContainer);

		// Render the chart using Plotly
		Plotly.newPlot(this.chartId, traces, layout);
	}

	async renderMultistack(chartTitle = "Abundances") {
		const contentItem = this.contentItem;
		const cir = this.siteReport.getContentItemRenderer(contentItem);
		const ro = cir.getSelectedRenderOption(contentItem);

		// Pull selected options (kept for parity, not heavily used below)
		let xAxisKey = null, yAxisKey = null, sortKey = null;
		for (const key in ro.options) {
			const opt = ro.options[key];
			if (opt.function === "xAxis")  xAxisKey = opt.selected;
			if (opt.function === "yAxis")  yAxisKey = opt.selected;
			if (opt.function === "sort")   sortKey = opt.selected;
		}

		// Column keys
		const taxonIdColKey     = this.getTableColumnKeyByTitle("Taxon id");
		const taxonNameColKey   = this.getTableColumnKeyByTitle("Taxon");
		const abundanceColKey   = this.getTableColumnKeyByTitle("Abundance count");
		const sampleIdColKey    = this.getTableColumnKeyByTitle("Sample id");
		const sampleNameColKey  = this.getTableColumnKeyByTitle("Sample name");

		// Optional unit for abundance
		const abundanceUnit = contentItem?.data?.columns?.[abundanceColKey]?.unit || "";

		// 1) Build ordered unique sample ids & names (in encounter order)
		const samples = [];      // sampleId order
		const sampleNames = [];  // sampleName order (same indexing as samples)
		const seenSampleIds = new Set();
		const seenSampleNames = new Set();

		for (const row of contentItem.data.rows) {
			const sid = row[sampleIdColKey].value;
			const sname = row[sampleNameColKey].value;

			if (!seenSampleIds.has(sid)) {
				seenSampleIds.add(sid);
				samples.push(sid);
			}
			if (!seenSampleNames.has(sname)) {
				seenSampleNames.add(sname);
				sampleNames.push(sname);
			}
		}

		// 2) Aggregate rows into taxa map: taxonId -> { taxonName, samples: [{sampleId, sampleName, abundance}] }
		const taxa = {};
		for (const row of contentItem.data.rows) {
			let familyName = row[taxonNameColKey].rawValue.family.family_name;
			let genusName = row[taxonNameColKey].rawValue.genus.genus_name;
			let speciesName = row[taxonNameColKey].rawValue.species;
			
			const taxonId   = row[taxonIdColKey].value;
			const taxonName = row[taxonNameColKey].value;
			const abundance = Number(row[abundanceColKey].value) || 0;
			const sampleId  = row[sampleIdColKey].value;
			const sampleName= row[sampleNameColKey].value;

			// Generate color based on taxonomic hierarchy
			const taxonColor = this.sqs.color.getTaxonomicColor(familyName, genusName, speciesName);

			if (!taxa[taxonId]) {
				taxa[taxonId] = { 
					taxonId, 
					taxonName, 
					samples: [],
					familyName,
					genusName,
					speciesName,
					color: taxonColor
				};
			}
			taxa[taxonId].samples.push({ abundance, sampleId, sampleName });
		}
		
		// 3) Build Plotly traces: one trace per taxon, oriented horizontally (stacked)
		//    Colors are now based on taxonomic hierarchy (already computed and stored in taxa)
		const taxonIds = Object.keys(taxa);
		const traces = [];
		for (const taxonId of taxonIds) {
			const t = taxa[taxonId];
			const values = samples.map(sampleId => {
			const entry = t.samples.find(s => s.sampleId === sampleId);
			return entry ? Number(entry.abundance) || 0 : 0;
			});

			traces.push({
			type: "bar",
			orientation: "h",
			name: t.taxonName,
			y: sampleNames,       // categories on Y (one stacked bar per sample)
			x: values,            // abundance per sample
			marker: {
				color: t.color,
				line: { color: "#888", width: 1 }
			},
			hovertemplate:
				"Sample %{y}<br>%{fullData.name}: %{x}" +
				(abundanceUnit ? ` ${abundanceUnit}` : "") +
				"<extra></extra>"
			});
	}

	// 4) Layout & sizing (match your dynamic height: 130 + 40px per sample)
	const chartHeight = 130 + (samples.length * 40);
	const layout = {
		barmode: "stack",
		title: { text: chartTitle, x: 0, xanchor: "left" },
		height: chartHeight,
		margin: { l: 120, r: 20, t: 40, b: 40 },
		xaxis: {
			title: { text: `Abundance${abundanceUnit ? ` (${abundanceUnit})` : ""}` },
			zeroline: true,
			automargin: true
		},
		yaxis: {
			title: { text: "Sample" },
			type: "category",
			categoryorder: "array",
			categoryarray: sampleNames,
			automargin: true
		},
		// Start with hidden legend
		showlegend: false,
		legend: {
			orientation: "v",
			xanchor: "left",
			yanchor: "top",
			x: 1.02,
			y: 1,
			bgcolor: "rgba(255,255,255,0.95)",
			bordercolor: "#ccc",
			borderwidth: 1
		},
		hovermode: "closest",
		paper_bgcolor: "white",
		plot_bgcolor: "white"
	};

	const config = {
			responsive: true,
			displaylogo: false,
			toImageButtonOptions: { format: "png", scale: 2 }
		};

		// 6) Mount container & render
		this.chartId = "chart-" + nanoid();
		const chartContainer = $(
			`<div id="${this.chartId}" class="site-report-chart-container">
			<div id="${this.chartId}-chart" style="width:100%;"></div>
			</div>`
		);
		$(this.anchorNodeSelector).append(chartContainer);

		// Optional "Rendering..." message
		$(`#${this.chartId}`).html(
			`<div class='content-item-chart-rendering-message'>Rendering... <div class='mini-loading-indicator' style='display:inline-block;'></div></div>`
		);

		setTimeout(async () => {
			$(`#${this.chartId}`).empty();
			await Plotly.newPlot(this.chartId, traces, layout, config);

			// Save a reference for later exports / interactions
			this.plotlyGd = document.getElementById(this.chartId);
			
			// Add legend toggle button
			const buttonId = `${this.chartId}-legend-toggle`;
			const buttonContainer = $(`
			<div class="site-report-chart-legend-toggle" style="margin-top:10px; text-align:right;">
				<button id="${buttonId}" class="light-theme-button">
				<i class="fa fa-list-ul" aria-hidden="true"></i> Show Legend
				</button>
			</div>
			`);
			
			$(`#${this.chartId}`).append(buttonContainer);
			
			// Set up the toggle functionality
			let legendVisible = false;
			$(`#${buttonId}`).on('click', () => {
				legendVisible = !legendVisible;
				
				// Update button text
				$(`#${buttonId}`).html(
					legendVisible ? 
					`<i class="fa fa-list-ul" aria-hidden="true"></i> Hide Taxa Legend` : 
					`<i class="fa fa-list-ul" aria-hidden="true"></i> Show Taxa Legend`
				);
				
				// Update chart layout to show/hide legend
				Plotly.relayout(this.plotlyGd, {
					'showlegend': legendVisible
				});
			});
		}, 0);
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

		console.log(contentItem)
		console.log(xAxisRo)
		console.log(yAxisRo)
		

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

			if(contentItem.dataType == "key-value") {
				contentItem.data.rows.forEach(row => {
					console.log(row);
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
			if(contentItem.dataType == "key-value") {
				contentItem.data.rows.forEach(row => {
					console.log(row);
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

	renderScatterChartPlotly() {
		var contentItem = this.contentItem;
		let chartData = this.dataTransform(contentItem);

		//let xAxisKey = this.getSelectedRenderOptionExtra("X axis").value;
		//let yAxisKey = this.getSelectedRenderOptionExtra("Y axis").value;
		//let sortCol = this.getSelectedRenderOptionExtra("Sort").value;

		// Combine the arrays and sort them based on values
		let keysArray = chartData.x.values;
		let valuesArray = chartData.y.values;

		let unitColKey = null;
		contentItem.data.columns.forEach((column, index) => {
			if(column.title == 'Unit') {
				unitColKey = index;
			}
		});

		if(unitColKey != null && contentItem.data.rows.length > 0) {
			chartData.y.unit = contentItem.data.rows[0][unitColKey].value;
		}

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

		let graphType = "scatter";
		
		let data = [
		  {
			x: chartData.x.values,
			y: chartData.y.values,
			type: graphType,
			mode: "markers",
			text: chartData.y.values.map((val) => `${val} ${chartData.y.unit}`),
			hoverinfo: "x+text",
			hovertemplate: `%{y} ${chartData.y.unit}<extra>Sample name %{x}</extra>`,
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
				title: {
					text: 'Sample',
					font: {
						family: 'Didact Gothic, sans-serif',
						size: 18,
						color: '#333'
					},
				}
			},
			yaxis: {
				showticklabels: false,
				automargin: true,
				title: {
					text: 'Value',
					font: {
						family: 'Didact Gothic, sans-serif',
						size: 18,
						color: '#333'
					},
				}
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
						title: {
							display: true,
							text: 'Sample' // Label for the x-axis
						}
					},
					y: {
						stacked: true,
						title: {
							display: true,
							text: 'Percentage' // Label for the y-axis
						}
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
		let rawValues = [];
		let datasets = [];
		
		datasets.push({
			label: "Eco codes",
			data: [],
			backgroundColor: []
		});

		// First pass: collect raw values and calculate total
		let total = 0;
		for(var key in contentItem.data.rows) {
			let row = contentItem.data.rows[key];
			let value = row[yAxisKey].value;
			rawValues.push(value);
			total += value;
		}

		// Second pass: convert to percentages and build chart data
		for(var key in contentItem.data.rows) {
			let row = contentItem.data.rows[key];
			let ecoCodeName = row[0].value;
			ecoCodeNames.push(ecoCodeName);
			
			// Calculate percentage
			let percentage = total > 0 ? (rawValues[key] / total) * 100 : 0;
			datasets[0].data.push(percentage);
			
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
								return contentItem.data.columns[yAxisKey].title+": "+context.formattedValue+"%";
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
						stacked: true,
						title: {
							display: true,
							text: 'Percentage (%)'
						},
						ticks: {
							callback: function(value) {
								return value + '%';
							}
						}
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

		//figure out percentages 
		let totalTaxaAgg = 0;
		let totalAbundanceAgg = 0;
		ecocodesSorted.forEach(ecocode => {
			if(ecocode.taxaAgg) {
				totalTaxaAgg += ecocode.taxaAgg;
			}
			if(ecocode.abundanceAgg) {
				totalAbundanceAgg += ecocode.abundanceAgg;
			}
		});
		
		ecocodesSorted.forEach(ecocode => {
			if(ecocode.taxaAgg) {
				ecocode.taxaAggPercentage = (ecocode.taxaAgg / totalTaxaAgg * 100).toFixed(2);
			}
			if(ecocode.abundanceAgg) {
				ecocode.abundanceAggPercentage = (ecocode.abundanceAgg / totalAbundanceAgg * 100).toFixed(2);
			}
		});

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
				let aggAbundance = row[2].value;
				let aggTaxa = row[3].value;
				let subTable = row[4].value;

				subTable.rows.forEach(r => {
					let rowEcocodeName = r[0].value;
					let ecocodeDefinitionId = r[3].value;
					if(rowEcocodeName == ecocode.name) {

						let agg = null;
						switch(yAxisKey) {
							case 1:
								agg = aggAbundance;
								break;
							case 2:
								agg = aggTaxa;
								break;
						}

						let percentage = (r[yAxisKey].value / agg) * 100;

						dataset.data.push(percentage);
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
								//provide the formattedValue as a percentage of the total
								console.log(context);
								console.log(ecocodesSorted)

								let ecocode = ecocodesSorted.find(ecocode => {
									if(ecocode.name == context.dataset.label) {
										return ecocode;
									}
								});

								return context.dataset.label + ": "+ecocode.abundanceAggPercentage+"%";
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
		const contentItem = this.contentItem;

		const xAxisKey = this.getSelectedRenderOptionExtra("X axis").value;
		const yAxisKey = this.getSelectedRenderOptionExtra("Y axis").value; // kept for unit lookup
		const sortCol   = this.getSelectedRenderOptionExtra("Sort").value;

		let xUnitSymbol = "";
		let yUnitSymbol = "";

		if (contentItem.data.columns[xAxisKey]?.unit) xUnitSymbol = contentItem.data.columns[xAxisKey].unit;
		if (contentItem.data.columns[yAxisKey]?.unit) yUnitSymbol = contentItem.data.columns[yAxisKey].unit;

		// Sort rows by selected column
		contentItem.data.rows.sort((a, b) => (a[sortCol].value > b[sortCol].value ? 1 : -1));

		// Find the columns titled "Unburned" and "Burned"
		let unburnedColKey = null;
		let burnedColKey = null;
		contentItem.data.columns.forEach((col, colKey) => {
			if (col.title === "Unburned") unburnedColKey = colKey;
			if (col.title === "Burned")   burnedColKey = colKey;
		});

		// Build arrays for Plotly
		const sampleNames = [];
		const unburned = [];
		const burned = [];

		for (const row of contentItem.data.rows) {
			const sampleName = row[xAxisKey].value;
			sampleNames.push(sampleName);
			unburned.push(Number(row[unburnedColKey]?.value) ?? null);
			burned.push(Number(row[burnedColKey]?.value) ?? null);
		}

		// Traces (colors match your Chart.js config)
		const traces = [
			{
			type: "bar",
			name: "Unburned",
			x: sampleNames,
			y: unburned,
			marker: { color: "darkblue" },
			hovertemplate:
				"Sample %{x}<br>Unburned: %{y}" + (yUnitSymbol ? ` ${yUnitSymbol}` : "") + "<extra></extra>"
			},
			{
			type: "bar",
			name: "Burned",
			x: sampleNames,
			y: burned,
			marker: { color: "red" },
			hovertemplate:
				"Sample %{x}<br>Burned: %{y}" + (yUnitSymbol ? ` ${yUnitSymbol}` : "") + "<extra></extra>"
			}
		];

		// Layout with grouped barmode instead of stacked
		const layout = {
			barmode: "group", // Changed from "stack" to "group" for side-by-side bars
			margin: { l: 60, r: 20, t: 10, b: 60 },
			xaxis: {
			title: { text: "Sample" + (xUnitSymbol ? ` (${xUnitSymbol})` : "") },
			type: "category",
			categoryorder: "array",
			categoryarray: sampleNames,
			automargin: true
			},
			yaxis: {
			title: { text: yUnitSymbol ? yUnitSymbol : "" },
			zeroline: true,
			automargin: true
			},
			legend: {
			orientation: "h",
			x: 0,
			y: 1.12,
			xanchor: "left",
			yanchor: "bottom"
			},
			hovermode: "closest" // per-point like Chart.js default
		};

		// Plotly config (responsive, with modebar download button)
		const config = {
			responsive: true,
			displaylogo: false
		};

		// Create/append container (div, not canvas)
		this.chartId = "chart-" + nanoid();
		const chartContainer = $(
			`<div id="${this.chartId}" class="site-report-chart-container"></div>`
		);
		$(this.anchorNodeSelector).append(chartContainer);

		// Render
		Plotly.newPlot(this.chartId, traces, layout, config);

		// Keep a reference to the graph div for later exports
		this.plotlyGd = document.getElementById(this.chartId);
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