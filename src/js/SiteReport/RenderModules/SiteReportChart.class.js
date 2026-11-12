import { nanoid } from "nanoid";
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
import SampleDepths from "../SampleDepths.class.js";
import { local } from "d3";
import { isNumber } from "lodash";

class SiteReportChart {
	constructor(siteReport, contentItem) {
		this.siteReport = siteReport;
		this.sqs = this.siteReport.sqs;
		this.contentItem = contentItem;
		this.chartId = null;
		this.plotlyGd = null;
		this.mcrTooltipEl = null;
	}

	update(updatedExtrasRenderOption = null) {
		if (updatedExtrasRenderOption && updatedExtrasRenderOption.function === "sampleFilter") {
			this.handleMcrSampleFilterChange(updatedExtrasRenderOption);
			return true;
		}
		return false;
    }

	async handleMcrSampleFilterChange(renderOption) {
		const selectedOptions = renderOption.options.filter(o => o.selected);
		const sampleIds = selectedOptions.map(o => o.value).filter(v => v !== null);
		let mcrData;

		if (sampleIds.length === 0) {
			mcrData = this.contentItem.data.originalMcrData;
		} else {
			try {
				const response = await fetch(this.sqs.config.dataServerAddress + "/mcr/samples", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(sampleIds)
				});
				if (response.ok) {
					mcrData = await response.json();
				} else {
					mcrData = this.contentItem.data.originalMcrData;
				}
			} catch (e) {
				console.warn("Could not fetch MCR data for samples", sampleIds, e);
				mcrData = this.contentItem.data.originalMcrData;
			}
		}

		if (mcrData) {
			this.contentItem.data.mcrData = mcrData;
		}
		$(this.anchorNodeSelector).html("");
		this.renderMutualClimaticRangeChart();
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
						node = this.renderBarChart();
						break;
					case "sample-bar":
						node = this.renderSampleBarChart();
						break;
					case "depth-profile":
						node = this.renderDepthProfileChart();
						break;
					case "ecocode":
						node = this.renderEcoCodeChart();
						break;
					case "ecocodes-samples":
						node = this.renderEcoCodesPerSampleChart();
						break;
					case "pie":
						node = this.renderPieChart();
						break;
					case "multistack":
						node = this.renderMultistack();
						//node = this.renderMultistackPlotly();
						break;
					case "mcr":
						node = this.renderMutualClimaticRangeChart();
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
		if(this.plotlyGd != null) {
			Plotly.purge(this.plotlyGd);
		}
		if(this.mcrTooltipEl) {
			this.mcrTooltipEl.remove();
			this.mcrTooltipEl = null;
		}
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
                "fontSize": this.sqs.scalePx("16px"),
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

		Plotly.newPlot(this.chartId, data, layout, {responsive: true, displayModeBar: true});
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

		const rowsBySampleName = [...contentItem.data.rows].sort((a, b) => this.compareSampleNames(a[sampleNameColKey].value, b[sampleNameColKey].value));
		for (const row of rowsBySampleName) {
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
	const layout = this.getPlotlyLayout({
		barmode: "stack",
		height: chartHeight,
		xaxis: this.getPlotlyAxis(`Abundance${abundanceUnit ? ` (${abundanceUnit})` : ""}`),
		yaxis: this.getPlotlyAxis("Sample", {
			title: { text: "Sample", standoff: 16 },
			ticklabelstandoff: 6,
			type: "category",
			categoryorder: "array",
			categoryarray: sampleNames,
			autorange: "reversed",
			showgrid: false
		}),
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
		hovermode: "closest"
	});

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
				<button type="button" id="${buttonId}" class="sqs-btn">
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

	/*
	* Function: getPlotlyLayout
	*
	* The layout all of the site report's Plotly charts start from, so that they look alike: the page's font and colours,
	* light grid lines and any legend above the chart.
	*/
	getPlotlyLayout(layout = {}) {
		const colors = this.sqs.color.colors;
		const font = { family: "IBM Plex Sans, sans-serif", size: this.sqs.scalePx(13), color: colors.textColor };
		return Object.assign({
			font: font,
			paper_bgcolor: "#fff",
			plot_bgcolor: "#fff",
			margin: { l: 10, r: 10, t: 10, b: 10 },
			showlegend: false,
			legend: { orientation: "h", x: 0, y: 1.02, xanchor: "left", yanchor: "bottom" },
			hoverlabel: { font: font, bgcolor: "#fff", bordercolor: colors.borderColor }
		}, layout);
	}

	/*
	* Function: getPlotlyAxis
	*
	* An axis of a site report chart, with its title.
	*/
	getPlotlyAxis(title, axis = {}) {
		const colors = this.sqs.color.colors;
		return Object.assign({
			title: { text: title, standoff: this.sqs.scalePx(12) },
			automargin: true,
			gridcolor: colors.borderColorLight,
			linecolor: colors.borderColor,
			zerolinecolor: colors.borderColor,
			ticks: "outside",
			tickcolor: colors.borderColor
		}, axis);
	}

	getPlotlyConfig() {
		return {
			responsive: true,
			displaylogo: false,
			modeBarButtonsToRemove: ["select2d", "lasso2d"],
			toImageButtonOptions: { format: "png", scale: 2 }
		};
	}

	/*
	* Function: renderPlotlyChart
	*
	* Draws a Plotly chart last in the anchor node, in the container the site report's PNG and SVG exports look for.
	*/
	renderPlotlyChart(traces, layout) {
		this.chartId = "chart-"+nanoid();
		$(this.anchorNodeSelector).append("<div id='"+this.chartId+"' class='site-report-chart-container'></div>");
		this.plotlyGd = document.getElementById(this.chartId);
		return Plotly.newPlot(this.plotlyGd, traces, layout, this.getPlotlyConfig());
	}

	compareSampleNames(a, b) {
		return String(a).localeCompare(String(b), "sv", { numeric: true });
	}

	toNumberOrNull(value) {
		let number = typeof value == "number" ? value : parseFloat(value);
		return isFinite(number) ? number : null;
	}

	/*
	* Function: getUniqueLabels
	*
	* The labels as distinct categories, since a category axis draws all the bars of the same label as one. A repeated
	* label gets zero-width spaces after it, which don't show.
	*/
	getUniqueLabels(labels) {
		let counts = {};
		return labels.map(label => {
			label = String(label);
			let count = counts[label] || 0;
			counts[label] = count + 1;
			return label + "​".repeat(count);
		});
	}

	/*
	* Function: getMethodValueTitle
	*
	* The name of the values the content item's method measures, with their unit, such as "Loss on ignition".
	*/
	getMethodValueTitle() {
		const method = this.siteReport.getMethod(this.contentItem.methodId);
		if(!method) {
			return "Value";
		}
		const unit = this.siteReport.siteData.lookup_tables.units.find(unit => unit.unit_id == method.unit_id);
		return method.method_name + (unit ? " ("+unit.unit_abbrev+")" : "");
	}

	/*
	* Function: getSampleSeries
	*
	* The samples of the content item's table, in the order of their names, and the values of the columns the selected
	* render option draws, as series. Values which aren't numbers, such as a missing burned value, are null.
	*/
	getSampleSeries() {
		const columns = this.contentItem.data.columns;
		const sampleIdColKey = columns.findIndex(column => column.role == "sample_id");
		const sampleNameColKey = columns.findIndex(column => column.role == "sample_name");
		const renderOption = this.siteReport.getContentItemRenderer(this.contentItem).getSelectedRenderOption(this.contentItem);
		const valueTitle = this.getMethodValueTitle();

		const rows = [...this.contentItem.data.rows].sort((a, b) => this.compareSampleNames(a[sampleNameColKey].value, b[sampleNameColKey].value));

		const samples = rows.map(row => ({ id: row[sampleIdColKey].value, name: row[sampleNameColKey].value }));
		const series = renderOption.series.map(seriesColumn => {
			const colKey = columns.findIndex(column => column.title == seriesColumn.column);
			return {
				name: renderOption.series.length == 1 ? valueTitle : seriesColumn.column,
				color: this.sqs.color.colors[seriesColumn.color],
				values: rows.map(row => this.toNumberOrNull(row[colKey].value))
			};
		});

		return { samples, series, valueTitle };
	}

	/*
	* Function: renderBarChart
	*
	* The bar chart of a table whose axes are picked in its display options, such as the ceramics' measurements.
	*/
	renderBarChart() {
		const chartData = this.dataTransform(this.contentItem);

		let unit = chartData.y.unit;
		const unitColKey = this.contentItem.data.columns.findIndex(column => column.title == "Unit");
		if(unitColKey != -1 && this.contentItem.data.rows.length > 0) {
			unit = this.contentItem.data.rows[0][unitColKey].value;
		}

		const bars = chartData.x.values.map((label, i) => ({ label: label, value: this.toNumberOrNull(chartData.y.values[i]) }));
		bars.sort((a, b) => this.compareSampleNames(a.label, b.label));

		const series = [{
			name: chartData.y.title,
			color: this.sqs.color.colors.baseColor,
			values: bars.map(bar => bar.value)
		}];
		const sorted = this.sortSamples(bars.map(bar => ({ name: bar.label })), series);
		this.drawSampleBars(sorted.samples.map(sample => sample.name), sorted.series, chartData.y.title + (unit ? " ("+unit+")" : ""), String(chartData.x.title));
	}

	/*
	* Function: renderSampleBarChart
	*
	* The bar chart of a dataset with a value or a few per sample, such as loss on ignition or magnetic susceptibility.
	*/
	renderSampleBarChart() {
		const { samples, series, valueTitle } = this.getSampleSeries();
		const sorted = this.sortSamples(samples, series);
		this.drawSampleBars(sorted.samples.map(sample => sample.name), sorted.series, valueTitle);
	}

	/*
	* Function: sortSamples
	*
	* The samples, and the values of the series, in the order picked in the chart's "Sort": the order of the samples'
	* names, which they come in, their depths, or one of the series' values, highest or lowest first. Samples without a
	* depth or a value go last, still in the order of their names.
	*
	* Parameters:
	* samples - [{ id, name }], in the order of their names.
	* series - [{ name, color, values }], with a value, or null, per sample.
	*/
	sortSamples(samples, series) {
		const renderOption = this.siteReport.getContentItemRenderer(this.contentItem).getSelectedRenderOption(this.contentItem);
		const sortOption = (renderOption.options || []).find(option => option.title == "Sort");
		const sort = sortOption ? (sortOption.options.find(option => option.selected) || sortOption.options[0]) : null;

		let keys = null;
		if(sort && sort.value == "depth") {
			const sampleDepths = new SampleDepths(this.siteReport.siteData);
			keys = samples.map(sample => {
				const depth = sampleDepths.getDepth(sample.id);
				return depth ? [depth.upper, depth.lower] : null;
			});
		}
		if(sort && (sort.value == "highest" || sort.value == "lowest")) {
			const direction = sort.value == "highest" ? -1 : 1;
			keys = series[sort.series || 0].values.map(value => value == null ? null : [value * direction]);
		}
		if(keys == null) {
			return { samples, series };
		}

		//Array.sort is stable, so samples with the same key stay in the order of their names
		const order = samples.map((sample, index) => index);
		order.sort((a, b) => {
			if(keys[a] == null || keys[b] == null) {
				return (keys[a] == null) - (keys[b] == null);
			}
			return keys[a][0] - keys[b][0] || (keys[a][1] || 0) - (keys[b][1] || 0);
		});

		return {
			samples: order.map(index => samples[index]),
			series: series.map(s => Object.assign({}, s, { values: order.map(index => s.values[index]) }))
		};
	}

	/*
	* Function: drawSampleBars
	*
	* Draws values per sample as bars, with the samples along the x axis in their order. The more samples, the closer the
	* bars, down to a line each, and over a hundred samples a range slider under the chart picks out a part of them to look
	* closer at. Hovering anywhere above a sample shows its values.
	*
	* Parameters:
	* labels - The names of the samples, in their order.
	* series - The values to draw, as [{ name, color, values }], with a value, or null, per sample.
	* valueTitle - The title of the value axis.
	* labelTitle - The title of the sample axis.
	*/
	drawSampleBars(labels, series, valueTitle, labelTitle = "Sample") {
		const manyBars = labels.length > 100;
		const categories = this.getUniqueLabels(labels);

		const traces = series.map(s => ({
			type: "bar",
			name: s.name,
			x: categories,
			y: s.values,
			marker: { color: s.color },
			hovertemplate: s.name+": %{y}<extra></extra>"
		}));

		const xaxis = this.getPlotlyAxis(labelTitle, {
			type: "category",
			categoryorder: "array",
			categoryarray: categories,
			showgrid: false
		});
		if(manyBars) {
			xaxis.rangeslider = { visible: true, thickness: 0.1, bgcolor: this.sqs.color.colors.paneBgColor, bordercolor: this.sqs.color.colors.borderColor, borderwidth: 1 };
		}

		//The sample names may well be drawn on end, and the plot shouldn't shrink for them
		const longestLabel = Math.max(...labels.map(label => String(label).length));

		const layout = this.getPlotlyLayout({
			height: this.sqs.scalePx((manyBars ? 480 : 400) + Math.min(longestLabel * 6, 200)),
			barmode: "group",
			bargap: labels.length > 60 ? 0.05 : 0.2,
			bargroupgap: 0,
			hovermode: "x unified",
			showlegend: series.length > 1,
			//The automatic margins leave no room under the range slider for the axis title
			margin: { l: 10, r: 10, t: 10, b: manyBars ? this.sqs.scalePx(40) : 10 },
			xaxis: xaxis,
			yaxis: this.getPlotlyAxis(valueTitle)
		});

		this.renderPlotlyChart(traces, layout).then(() => {
			if(manyBars) {
				this.renderZoomNote(categories);
			}
		});
	}

	/*
	* Function: renderZoomNote
	*
	* The note under a chart with a range slider. It says that the slider zooms the chart, and once it is zoomed, which of
	* the samples are shown, with a button to show all of them again.
	*
	* Parameters:
	* labels - The categories of the sample axis, in their order.
	*/
	renderZoomNote(labels) {
		const gd = this.plotlyGd;
		const noteNode = $("<p class='sqs-muted site-report-chart-note site-report-chart-zoom-note'></p>");
		$(this.anchorNodeSelector).append(noteNode);

		const update = () => {
			const range = gd.layout.xaxis.range;
			const first = Math.max(0, Math.ceil(range[0]));
			const last = Math.min(labels.length - 1, Math.floor(range[1]));
			noteNode.empty();

			if(first == 0 && last == labels.length - 1) {
				noteNode.append("<i class='fa fa-arrows-h' aria-hidden='true'></i> ");
				noteNode.append(document.createTextNode("To zoom in on some of the samples, drag the handles of the overview under the chart, or drag across the chart."));
				return;
			}

			const count = Math.max(0, last - first + 1);
			let note = "Showing "+count.toLocaleString("en-GB")+" of "+labels.length.toLocaleString("en-GB")+" samples";
			note += count > 0 ? ", "+labels[first]+(count > 1 ? " to "+labels[last] : "")+". " : ". ";
			noteNode.append("<i class='fa fa-search-plus' aria-hidden='true'></i> ", document.createTextNode(note));
			let showAllButton = $("<button type='button' class='sqs-link-btn site-report-chart-note-link'>Show all samples</button>");
			showAllButton.on("click", () => {
				Plotly.relayout(gd, { "xaxis.autorange": true });
			});
			noteNode.append(showAllButton, ".");
		};

		gd.on("plotly_relayout", update);
		update();
	}

	/*
	* Function: renderDepthProfileChart
	*
	* The depth profile of a dataset with a value or a few per sample, for samples which have depths. The samples which
	* don't are named in a note under it, which leads to the bar chart of all of them.
	*/
	renderDepthProfileChart() {
		const { samples, series, valueTitle } = this.getSampleSeries();
		const sampleDepths = new SampleDepths(this.siteReport.siteData);
		samples.forEach(sample => {
			sample.depth = sampleDepths.getDepth(sample.id);
		});

		this.drawDepthProfile(samples, series, valueTitle);

		const withoutDepthCount = samples.filter(sample => sample.depth == null).length;
		if(withoutDepthCount > 0) {
			let note = withoutDepthCount.toLocaleString("en-GB")+(withoutDepthCount == 1 ? " sample isn't" : " samples aren't")+" shown, as "+(withoutDepthCount == 1 ? "it lacks" : "they lack")+" a depth. "+(withoutDepthCount == 1 ? "It is" : "They are")+" in the ";
			let noteNode = $("<p class='sqs-muted site-report-chart-note site-report-chart-depth-note'></p>").text(note);
			let barChartButton = $("<button type='button' class='sqs-link-btn site-report-chart-note-link'>bar chart</button>");
			barChartButton.on("click", () => {
				this.siteReport.getContentItemRendererByName(this.contentItem.name).selectRenderOption("sample-bar");
			});
			noteNode.append(barChartButton, ".");
			$(this.anchorNodeSelector).append(noteNode);
		}
	}

	/*
	* Function: drawDepthProfile
	*
	* Draws values per sample against the samples' depths, going downwards, as horizontal bars which span each sample from
	* its upper to its lower boundary. A sample with a single depth gets a thin bar centered on it. Samples at the same or
	* overlapping depths share them side by side, so that none of them hides another.
	*
	* Parameters:
	* samples - The samples, as [{ name, depth }], with a depth of { upper, lower }, or null for samples which aren't drawn.
	* series - The values to draw, as [{ name, color, values }], with a value, or null, per sample.
	* valueTitle - The title of the value axis.
	*/
	drawDepthProfile(samples, series, valueTitle) {
		const bars = [];
		samples.forEach((sample, index) => {
			if(sample.depth != null) {
				bars.push({ index: index, name: sample.name, depth: sample.depth });
			}
		});

		//The thickness of the samples with a single depth is most of the smallest step between two depths
		const depths = [...new Set(bars.flatMap(bar => [bar.depth.upper, bar.depth.lower]))].sort((a, b) => a - b);
		let smallestStep = Infinity;
		for(let i = 1; i < depths.length; i++) {
			smallestStep = Math.min(smallestStep, depths[i] - depths[i - 1]);
		}
		const pointThickness = isFinite(smallestStep) ? smallestStep * 0.8 : 0.05;

		bars.forEach(bar => {
			if(bar.depth.lower > bar.depth.upper) {
				bar.top = bar.depth.upper;
				bar.bottom = bar.depth.lower;
			}
			else {
				bar.top = bar.depth.upper - pointThickness / 2;
				bar.bottom = bar.depth.upper + pointThickness / 2;
			}
		});
		bars.sort((a, b) => a.top - b.top || a.bottom - b.bottom);

		//Overlapping bars go in lanes side by side, as many lanes as the most bars that overlap at once
		let cluster = [];
		let laneBottoms = [];
		const endCluster = () => {
			cluster.forEach(bar => {
				bar.lanes = laneBottoms.length;
			});
			cluster = [];
			laneBottoms = [];
		};
		bars.forEach(bar => {
			if(cluster.length > 0 && bar.top >= Math.max(...laneBottoms)) {
				endCluster();
			}
			let lane = laneBottoms.findIndex(bottom => bottom <= bar.top);
			if(lane == -1) {
				lane = laneBottoms.length;
				laneBottoms.push(bar.bottom);
			}
			else {
				laneBottoms[lane] = bar.bottom;
			}
			bar.lane = lane;
			cluster.push(bar);
		});
		endCluster();

		const formatDepth = (depth) => {
			return depth.lower > depth.upper ? depth.upper+"–"+depth.lower+" m" : depth.upper+" m";
		};

		const height = Math.min(Math.max(320, 120 + bars.length * 14), 800) * this.sqs.getUiScale();

		//A sample's band of the depth is split between its values, with a gap of up to two pixels to the next sample
		const depthRange = Math.max(...bars.map(bar => bar.bottom)) - Math.min(...bars.map(bar => bar.top));
		const metresPerPixel = depthRange / Math.max(height - 120, 1);
		bars.forEach(bar => {
			bar.band = (bar.bottom - bar.top) / bar.lanes;
			bar.gap = Math.min(bar.band * 0.2, metresPerPixel * 2);
		});

		const traces = series.map((s, seriesIndex) => ({
			type: "bar",
			orientation: "h",
			name: s.name,
			x: bars.map(bar => s.values[bar.index]),
			y: bars.map(bar => bar.top),
			width: bars.map(bar => (bar.band - bar.gap) / series.length),
			offset: bars.map(bar => bar.band * bar.lane + bar.gap / 2 + (bar.band - bar.gap) / series.length * seriesIndex),
			marker: { color: s.color },
			hoverinfo: "skip"
		}));

		//Hovering anywhere beside a sample shows all of its values, from invisible bars across the samples
		traces.push({
			type: "bar",
			orientation: "h",
			showlegend: false,
			x: bars.map(bar => Math.max(0, ...series.map(s => s.values[bar.index] || 0))),
			y: bars.map(bar => bar.top),
			width: bars.map(bar => bar.band),
			offset: bars.map(bar => bar.band * bar.lane),
			marker: { color: "rgba(0,0,0,0)" },
			customdata: bars.map(bar => [bar.name, formatDepth(bar.depth)].concat(series.map(s => s.values[bar.index] == null ? "–" : s.values[bar.index]))),
			hovertemplate: "<b>Sample %{customdata[0]}</b><br>Depth %{customdata[1]}"+series.map((s, i) => "<br>"+s.name+": %{customdata["+(i + 2)+"]}").join("")+"<extra></extra>"
		});

		const layout = this.getPlotlyLayout({
			height: height,
			barmode: "overlay",
			hovermode: "y",
			showlegend: series.length > 1,
			xaxis: this.getPlotlyAxis(valueTitle),
			yaxis: this.getPlotlyAxis("Depth (m)", { autorange: "reversed", zeroline: false })
		});

		this.renderPlotlyChart(traces, layout);
	}

	renderEcoCodeChart() {
		let contentItem = this.contentItem;
		let mode = this.getSelectedRenderOptionExtra("Y axis");
		let yAxisKey = mode.value;

		// Values 1,2 = counts; values 3,4 = percentages (same columns 1,2 but normalised)
		let isPercentage = yAxisKey >= 3;
		let colIndex = isPercentage ? yAxisKey - 2 : yAxisKey;
		let valueTitle = contentItem.data.columns[colIndex].title;

		let total = 0;
		contentItem.data.rows.forEach(row => {
			total += row[colIndex].value;
		});

		let ecoCodeNames = [];
		let values = [];
		let colors = [];
		contentItem.data.rows.forEach(row => {
			let ecoCodeName = row[0].value;
			ecoCodeNames.push(ecoCodeName);
			values.push(isPercentage ? (total > 0 ? (row[colIndex].value / total) * 100 : 0) : row[colIndex].value);

			let ecoCodeDefinition = this.sqs.bugsEcoCodeDefinitions.find(definition => definition.name == ecoCodeName);
			colors.push(ecoCodeDefinition ? ecoCodeDefinition.color : this.sqs.color.colors.baseColor);
		});

		const traces = [{
			type: "bar",
			x: this.getUniqueLabels(ecoCodeNames),
			y: values,
			marker: { color: colors },
			hovertemplate: valueTitle+": %{y"+(isPercentage ? ":.1f}%" : "}")+"<extra></extra>"
		}];

		const layout = this.getPlotlyLayout({
			height: this.sqs.scalePx(420),
			hovermode: "x unified",
			xaxis: this.getPlotlyAxis("Eco code", { type: "category", showgrid: false }),
			yaxis: this.getPlotlyAxis(mode.title, isPercentage ? { ticksuffix: "%" } : {})
		});

		this.renderPlotlyChart(traces, layout);
		this.renderEcoCodeHelpButton();
	}

	getSubTableCellFromRow(row) {
		for(let key in row) {
			let cell = row[key];
			if(cell.type == "subtable") {
				return cell;
			}	
		}
	}

	renderEcoCodeHelpButton() {
		const sqs = this.sqs;
		const helpContent = `
			<div class="ecocode-help-content">
				<h4>What are Eco Codes?</h4>
				<p>
					<strong>Bugs EcoCodes</strong> is a habitat classification system developed for fossil insect assemblages.
					Each insect taxon is assigned to one or more ecocode categories (habitat classes) that reflect its preferred
					habitat or ecological niche (e.g. woodland, dung &amp; carrion, aquatic).
					By aggregating the taxa and their abundances across samples, it is possible to
					reconstruct a picture of the ancient environment at a site.
				</p>
				<h4>Env. rep. and sumrep</h4>
				<p>
					The link between a taxon and a habitat class is its <em>environmental representativeness</em> (env. rep.).
					In SEAD these links are binary &mdash; a taxon either belongs to a habitat class or it does not &mdash; so
					each taxon&ndash;class link counts as an env. rep. of 1.
					Since a taxon may belong to several habitat classes, it contributes to each of them. The
					<em>sumrep</em> &mdash; the sum of the values of all habitat classes, which is what the percentage modes below
					are calculated against &mdash; is therefore normally <em>larger</em> than the number of taxa, or the total
					abundance, actually present in the assemblage.
				</p>
				<h4>Calculation modes</h4>
				<dl>
					<dt>Aggregated abundance &ndash; counts <span class="ecocode-help-alt-term">(abundance weighted, raw)</span></dt>
					<dd>
						Each taxon's env. rep. multiplied by its abundance, summed per habitat class. With binary env. rep. this
						is the total number of <em>individual specimens</em> (Minimum Number of Individuals, MNI) belonging to taxa
						in that class. A high value means many individuals were found that belong to taxa characteristic of that
						habitat.
					</dd>
					<dt>Aggregated taxa &ndash; counts <span class="ecocode-help-alt-term">(no abundance, raw)</span></dt>
					<dd>
						Env. rep. counts for the habitat class only, disregarding abundance: the number of
						<em>distinct species/taxa</em> assigned to that class (taxa occurrence, i.e. presence/absence).
						This reflects habitat diversity rather than individual abundance &mdash; a habitat with many different
						species present will score high even if each species is rare.
					</dd>
					<dt>Aggregated abundance &ndash; percentages <span class="ecocode-help-alt-term">(abundance weighted, % sumrep)</span></dt>
					<dd>
						The abundance-weighted sum for each habitat class expressed as a <em>percentage of the sumrep</em>, that is,
						of the summed abundance-weighted values of all habitat classes. Note that this is <em>not</em> a percentage
						of the assemblage's total MNI, which is a smaller number whenever taxa carry more than one ecocode; the bars
						add up to 100% by construction. This normalises for sample size and makes assemblages from different sites
						or time periods directly comparable.
					</dd>
					<dt>Aggregated taxa &ndash; percentages <span class="ecocode-help-alt-term">(no abundance, % sumrep)</span></dt>
					<dd>
						The taxa count for each habitat class expressed as a <em>percentage of the sumrep</em>, that is, of the
						summed taxa counts of all habitat classes. Again this is <em>not</em> a percentage of the number of distinct
						taxa in the assemblage, which is smaller whenever taxa carry more than one ecocode. Useful for comparing
						habitat diversity independently of how common individual species are.
					</dd>
				</dl>
				<p>
					In the site and dataset total charts these values are aggregated over all samples, and the percentages are
					calculated against the sumrep of that whole aggregation. In the <em>Eco codes per sample</em> chart the same
					four modes are applied within each sample, so each bar is a percentage of that sample's own sumrep.
				</p>
				<p style="margin-top:1em; font-size:0.9em; color:#555;">
					Reference: Buckland, P.I. &amp; Buckland, P.C. (2006). <em>BugsCEP: The Bugs Coleopteran Ecology Package.</em>
					<a href="https://sead.se" target="_blank">sead.se</a>
				</p>
			</div>
		`;

		const btn = $(`<button class="site-report-toolbar-btn ecocode-help-btn" title="About Eco Codes"><i class="fa fa-question-circle"></i> BUGS Eco Codes Help</button>`);
		btn.on("click", () => {
			sqs.dialogManager.showPopOver("BUGS Eco Codes — help", helpContent, { width: "560px" });
		});
		$(this.anchorNodeSelector).append(btn);
	}

	renderEcoCodesPerSampleChart() {
		let contentItem = this.contentItem;
		let mode = this.getSelectedRenderOptionExtra("X axis");
		let yAxisKey = mode.value;
		let sortCol = this.getSelectedRenderOptionExtra("Sort").value;
		// Values 1,2 = counts; values 3,4 = percentages of sample total
		let isPercentage = yAxisKey >= 3;
		let colIndex = isPercentage ? yAxisKey - 2 : yAxisKey;
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
			const aVal = a[sortVar] || 0;
			const bVal = b[sortVar] || 0;
			return bVal - aVal;
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

		//each row is a sample, in the order of their names
		const rows = [...contentItem.data.rows].sort((a, b) => this.compareSampleNames(a[1].value, b[1].value));
		const sampleLabels = this.getUniqueLabels(rows.map(row => row[1].value));
		const traces = [];
		ecocodesSorted.forEach(ecocode => {
			let values = rows.map(row => {
				let aggAbundance = row[2].value;
				let aggTaxa = row[3].value;
				let ecoCodeRow = row[4].value.rows.find(r => r[0].value == ecocode.name);
				if(!ecoCodeRow) {
					return 0;
				}
				if(isPercentage) {
					let agg = colIndex === 1 ? aggAbundance : aggTaxa;
					return agg > 0 ? (ecoCodeRow[colIndex].value / agg) * 100 : 0;
				}
				return ecoCodeRow[colIndex].value;
			});

			//Eco codes which none of the samples have are left out, of the legend too
			if(values.every(value => value == 0)) {
				return;
			}

			traces.push({
				type: "bar",
				orientation: "h",
				name: ecocode.name,
				x: values,
				y: sampleLabels,
				marker: { color: ecocode.color },
				hovertemplate: "<b>Sample %{y}</b><br>%{fullData.name}: %{x"+(isPercentage ? ":.1f}%" : "}")+"<extra></extra>"
			});
		});

		const layout = this.getPlotlyLayout({
			height: this.sqs.scalePx(Math.max(240, rows.length * 36 + 140)),
			barmode: "stack",
			hovermode: "closest",
			showlegend: true,
			xaxis: this.getPlotlyAxis(mode.title, isPercentage ? { range: [0, 100], ticksuffix: "%" } : {}),
			yaxis: this.getPlotlyAxis("Sample", { type: "category", categoryorder: "array", categoryarray: sampleLabels, autorange: "reversed", showgrid: false })
		});

		this.renderPlotlyChart(traces, layout);
		this.renderEcoCodeHelpButton();
	}

	renderMutualClimaticRangeChart() {
		const mcrData = this.contentItem?.data?.mcrData;

		if(this.mcrTooltipEl) {
			this.mcrTooltipEl.remove();
			this.mcrTooltipEl = null;
		}

		if (!mcrData || !mcrData.density_matrix || !mcrData.taxa_count) {
			$(this.anchorNodeSelector).append("<div style='padding:1em;color:#888;'>No MCR data available for this site.</div>");
			return;
		}

		const { density_matrix, taxa_count, max_count } = mcrData;
		const maxDensity = max_count ?? taxa_count;

		const ROWS = 36; // Trange axis: 0-35 C
		const COLS = 60; // Tmax axis: -10 to +49 C

		let consColMin = COLS;
		let consColMax = -1;
		let consRowMin = ROWS;
		let consRowMax = -1;
		for (let r = 0; r < ROWS; r++) {
			for (let c = 0; c < COLS; c++) {
				if (density_matrix[r][c] === taxa_count) {
					consColMin = Math.min(consColMin, c);
					consColMax = Math.max(consColMax, c);
					consRowMin = Math.min(consRowMin, r);
					consRowMax = Math.max(consRowMax, r);
				}
			}
		}

		const cellW = 8;
		const cellH = 9;
		const MARGIN_LEFT = 40;
		const MARGIN_RIGHT = 6;
		const MARGIN_TOP = 6;
		const MARGIN_BOTTOM = 40;
		const canvasW = MARGIN_LEFT + COLS * cellW + MARGIN_RIGHT;
		const canvasH = MARGIN_TOP + ROWS * cellH + MARGIN_BOTTOM;

		this.chartId = "chart-" + nanoid();
		$(this.anchorNodeSelector).append(`<canvas id="${this.chartId}" class="site-report-chart-container" width="${canvasW}" height="${canvasH}" style="max-width:100%;display:block;"></canvas>`);

		const canvas = document.getElementById(this.chartId);
		const ctx = canvas.getContext("2d");

		const densityColor = (count) => {
			if (count === 0 || maxDensity === 0) return '#ebebeb';
			const t = count / maxDensity;
			const r = Math.round(191 + (29 - 191) * t);
			const g = Math.round(219 + (78 - 219) * t);
			const b = Math.round(254 + (216 - 254) * t);
			return `rgb(${r},${g},${b})`;
		};

		for (let row = 0; row < ROWS; row++) {
			for (let col = 0; col < COLS; col++) {
				const displayCol = (COLS - 1) - col;
				const displayRow = (ROWS - 1) - row;
				ctx.fillStyle = density_matrix[row][col] === taxa_count ? '#000000' : densityColor(density_matrix[row][col]);
				ctx.fillRect(MARGIN_LEFT + displayCol * cellW, MARGIN_TOP + displayRow * cellH, cellW - 1, cellH - 1);
			}
		}

		ctx.fillStyle = '#555';
		ctx.font = '11px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		for (let c = 0; c <= COLS; c += 10) {
			ctx.fillText(((COLS - c) - 10) + '°', MARGIN_LEFT + c * cellW, MARGIN_TOP + ROWS * cellH + 4);
		}
		ctx.textBaseline = 'bottom';
		ctx.fillText('Tmax (°C)', MARGIN_LEFT + (COLS * cellW) / 2, canvasH);

		ctx.textAlign = 'right';
		ctx.textBaseline = 'middle';
		for (let r = 0; r < ROWS; r += 5) {
			ctx.fillText((ROWS - 1 - r) + '°', MARGIN_LEFT - 4, MARGIN_TOP + r * cellH + cellH / 2);
		}

		ctx.save();
		ctx.translate(10, MARGIN_TOP + (ROWS * cellH) / 2);
		ctx.rotate(-Math.PI / 2);
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		ctx.fillText('Trange (°C)', 0, 0);
		ctx.restore();

		document.querySelectorAll('.sead-mcr-tooltip').forEach(el => el.remove());
		const tooltipEl = document.createElement('div');
		tooltipEl.className = 'sead-mcr-tooltip';
		tooltipEl.style.cssText = 'position:fixed;background:rgba(30,30,30,0.88);color:#fff;padding:6px 10px;border-radius:4px;font-size:12px;line-height:1.6;pointer-events:none;display:none;z-index:9999;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4);';
		document.body.appendChild(tooltipEl);
		this.mcrTooltipEl = tooltipEl;

		canvas.addEventListener('mousemove', (e) => {
			const rect = canvas.getBoundingClientRect();
			const scaleX = canvasW / rect.width;
			const scaleY = canvasH / rect.height;
			const displayCol = Math.floor(((e.clientX - rect.left) * scaleX - MARGIN_LEFT) / cellW);
			const displayRow = Math.floor(((e.clientY - rect.top) * scaleY - MARGIN_TOP) / cellH);

			if (displayCol < 0 || displayCol >= COLS || displayRow < 0 || displayRow >= ROWS) {
				tooltipEl.style.display = 'none';
				return;
			}

			const col = (COLS - 1) - displayCol;
			const row = (ROWS - 1) - displayRow;
			const tmax = col - 10;
			const trange = row;
			const count = density_matrix[row][col];
			const pct = taxa_count > 0 ? (Math.floor((count / taxa_count) * 1000) / 10).toFixed(1) : "0.0";
			const inConsensus = count === taxa_count;

			let html =
				`<strong>Tmax</strong> (warmest month): ${tmax} °C<br>` +
				`<strong>Trange</strong> (warmest - coldest): ${trange} °C<br>`;

			if (count === 0) {
				html += `<span style="color:#9ca3af">&#9675; No taxa tolerate this cell</span>`;
			} else if (inConsensus) {
				html += `<span style="color:#7dd3fc">&#9679; All ${taxa_count} taxa tolerate this cell (full MCR consensus, shown in black)</span>`;
			} else {
				html += `<span style="color:#93c5fd">&#9681; ${count} of ${taxa_count} taxa tolerate this cell (${pct}%)</span>`;
			}

			tooltipEl.innerHTML = html;
			tooltipEl.style.display = 'block';
			const tipW = tooltipEl.offsetWidth;
			const left = (e.clientX + 16 + tipW > window.innerWidth) ? e.clientX - tipW - 8 : e.clientX + 16;
			tooltipEl.style.left = left + 'px';
			tooltipEl.style.top = (e.clientY - 10) + 'px';
		});

		canvas.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
	}

	renderPieChart() {
		var contentItem = this.contentItem;
		let cir = this.siteReport.getContentItemRenderer(this.contentItem);
		var ro = cir.getSelectedRenderOption(contentItem);
		
		var dimensionKey = ro.options.dimension;

		let labels = [];
		let counts = [];
		contentItem.data.rows.forEach(row => {
			let index = labels.indexOf(row[dimensionKey].value);
			if(index == -1) {
				labels.push(row[dimensionKey].value);
				counts.push(1);
			}
			else {
				counts[index]++;
			}
		});

		const traces = [{
			type: "pie",
			labels: labels,
			values: counts,
			sort: false,
			textinfo: "value",
			marker: { colors: this.sqs.color.getNiceColorScheme(labels.length, this.sqs.color.colors.baseColor), line: { color: "#fff", width: 1 } },
			hovertemplate: "%{label} (Count: %{value})<extra></extra>"
		}];

		this.renderPlotlyChart(traces, this.getPlotlyLayout({
			height: this.sqs.scalePx(400),
			showlegend: true,
			legend: { orientation: "v" }
		}));
	}

	renderContentDisplayOptionsPanel(section, contentItem) {
		
	}
}

export { SiteReportChart as default }
