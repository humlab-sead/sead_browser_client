/*OpenLayers imports*/
import { nanoid } from 'nanoid';
import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { OSM } from 'ol/source';
import { Group as GroupLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import {fromLonLat, transform} from 'ol/proj.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import { defaults as defaultControls } from 'ol/control.js';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import css from '../../../stylesheets/style.scss';
import DatingToPeriodDataset from './DatasetModules/DatingToPeriodDataset.class';
import { Chart } from "chart.js";
import DendrochronologyDataset from './DatasetModules/DendrochronologyDataset.class';

/*
* Class: BasicSiteInformation
*
 */

class BasicSiteInformation {
	constructor(sqs, siteId) {
		this.sqs = sqs;
		this.siteId = siteId;
		this.data = {};
		this.buildComplete = false;
		this.exportTryInterval = null;
		this.auxiliaryDataFetched = true; //There is currently no auxiliary data to fetch
		/*
		this.sqs.sqsEventListen("fetchBasicSiteInformation", () => {
            this.buildComplete = true;
			this.render();
			this.sqs.sqsEventDispatch("siteReportSiteInformationBuildComplete");
		}, this);
		*/
	}

	async fetch() {
	}
	
	renderReferences(references) {
		let referenceHtml = "";
		references.forEach((ref) => {
			referenceHtml += "<div class='sr-ref-item'>";
			let authors = ref.authors != null ? ref.authors : "&lt;authors missing&gt;";
			referenceHtml += "<span class='sr-ref-author'>"+authors+"</span>";
			referenceHtml += " ";
			if(ref.year != null) {
				referenceHtml += "<span class='sr-ref-year'>("+ref.year+")</span>";
			}
			referenceHtml += "<div class='sr-ref-title'>"+ref.title+"</div>";
			referenceHtml += "</div>";
		});

		if(references.length == 0) {
			referenceHtml = "No data";
		}

		return referenceHtml;
	}

	/*
	* Function: render
	*
	*/
	async render(siteData) {
		this.data = siteData;
		var data = this.data;
		var node = $(".site-report-title-site-name").html(siteData.site_name);
		this.sqs.tooltipManager.registerTooltip(node, "Name of the site as given by the data provider", {drawSymbol: true, placement: "top"});
		
		var exportLinksHtml = "";
		exportLinksHtml += "<ul class='site-report-export-links'>";
		exportLinksHtml += "<div class='site-report-export-btn' href=''><li class='light-theme-button'><i class=\"fa fa-download\" aria-hidden=\"true\" style='margin-right:5px;'></i><span style='float:right;'>Export all site data</span></li></div>";
		exportLinksHtml += "</ul>";
		
		
		var siteDecription = siteData.site_description;
		if(siteDecription == null) {
			siteDecription = "No data";
		}

		//only get unique biblio ids
		let datasetBiblioIds = [];
		siteData.datasets.forEach(dataset => {
			if(dataset.biblio_id) {
				if(!datasetBiblioIds.includes(dataset.biblio_id)) {
					datasetBiblioIds.push(dataset.biblio_id);
				}
			}
		});

		let datasetReferencesHtml = this.sqs.renderBiblioReference(siteData, datasetBiblioIds);

		let biblioIds = siteData.biblio.map(siteRef => { return siteRef.biblio_id; });
		let siteReferencesHtml = this.sqs.renderBiblioReference(siteData, biblioIds);
		if(siteReferencesHtml == "") {
			siteReferencesHtml = "No data";
		}

		var node = $(".site-report-aux-info-container");
		node
			.append("<div class='site-report-aux-header-container'><h4>Site identifier</h4></div>")
			.append("<div class='site-report-aux-header-underline'></div>")
			.append("<div class='site-report-aux-info-text-container'>"+siteData.site_id+"</div>")
			//.append("<div class='site-report-aux-header-container'><h4>Site name</h4></div>")
			//.append("<div class='site-report-aux-header-underline'></div>")
			//.append("<div class='site-report-aux-info-text-container'>"+data.siteName+"</div>")
			.append("<div class='site-report-aux-header-container'><h4>Location</h4></div>")
			.append("<div class='site-report-aux-header-underline'></div>")
			.append("<div id='site-report-locations-container'></div>")
			.append("<div class='site-report-aux-header-container'><h4>Export</h4></div>")
			.append("<div class='site-report-aux-header-underline'></div>")
			.append("<div class='site-report-aux-info-text-container'>"+exportLinksHtml+"</div>")
			.append("<div class='site-report-aux-header-container'><h4>Description</h4></div>")
			.append("<div class='site-report-aux-header-underline'></div>")
			.append("<div class='site-report-site-description site-report-description-text-container site-report-aux-info-text-container'>"+siteDecription+"</div>")
			.append(`<div id='site-report-time-overview-container' class='site-report-aux-info-text-container'>
				<div class='site-report-aux-header-container'><h4>Site dating overview</h4></div>
				<div class='site-report-aux-header-underline'></div>
				<div id="site-report-time-overview"></div>
			</div>`)
			.append("<div class='site-report-aux-header-container'><h4>Site reference</h4></div>")
			.append("<div class='site-report-aux-header-underline'></div>")
			.append("<div class='site-report-site-description site-report-aux-info-text-container'>"+siteReferencesHtml+"</div>")
			.append("<div class='site-report-aux-header-container'><h4>Dataset references</h4></div>")
			.append("<div class='site-report-aux-header-underline'></div>")
			.append("<div class='site-report-site-description site-report-aux-info-text-container'>"+datasetReferencesHtml+"</div>");
			
		
		this.sqs.tooltipManager.registerTooltip("#site-report-time-overview-container .site-report-aux-header-container h4", "This chart shows the extremes (oldest and youngest) of all dated samples in this site, categorized by type of dating. Dating is shown as years before present (BP), which in SEAD is defined as the year "+this.sqs.config.constants.BP+".", {placement: "top", drawSymbol: true});

		$("#site-report-locations-container").append("<div id='site-report-map-container'></div>");

		var locationsContainer = $("#site-report-locations-container");
		for(var i = 0; i < siteData.location.length; i++) {
			var el = $("<span>" + siteData.location[i].location_name + "</span>");
			locationsContainer.append(el);
			this.sqs.tooltipManager.registerTooltip(el, "<div style='font-weight:bold'>"+siteData.location[i].location_type+"</div><div>"+siteData.location[i].location_description+"</div>", {drawSymbol: true});
			
			if (i+1 < siteData.location.length) {
				locationsContainer.append(", ");
			}
		}
		
		$(".site-report-export-btn", node).on("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			this.exportSite();
		});
		
		this.renderMiniMap(siteData);

		this.sqs.sqsEventListen("analysisSectionsBuilt", () => {
			this.renderTimeOverview("site-report-time-overview");
		});
	}


	renderTimeOverview(targetAnchorQuery) {
		let siteDatingSummary = null;
		this.sqs.siteReportManager.siteReport.modules.forEach(m => {
			if(m.name == "analysis") {
				m.module.datasetModules.forEach(dsm => {
					if(dsm.instance instanceof DatingToPeriodDataset) {
						siteDatingSummary = dsm.instance.getDatingSummary();
					}
				})
			}
		});

		const standardAges = siteDatingSummary;

		/* dendro is not quite compatible since it's not BP
		//now also get the standard ages for any dendro datasets
		let dendrodDatingSummary = null;
		this.sqs.siteReportManager.siteReport.modules.forEach(m => {
			if(m.name == "analysis") {
				m.module.datasetModules.forEach(dsm => {
					if(dsm.instance instanceof DendrochronologyDataset) {
						dendrodDatingSummary = dsm.instance.getDatingSummary();
					}
				});
			}
		});

		standardAges.push(...dendrodDatingSummary);
		*/

		if(standardAges.length == 0) {
			document.getElementById(targetAnchorQuery).innerHTML = "No data";
			return;
		}


		let compoundAges = [];
		standardAges.forEach(standardAge => {
			//try to find in compoundAges
			let found = false;
			compoundAges.forEach(compoundAge => {
				if(compoundAge.ageType == standardAge.ageType) {
					found = true;
					compoundAge.ages.push(standardAge);
					if(standardAge.ageOlder > compoundAge.older) {
						compoundAge.older = standardAge.ageOlder;
					}
					if(standardAge.ageYounger < compoundAge.younger) {
						compoundAge.younger = standardAge.ageYounger;
					}
				}
			});
			if(!found) {
				compoundAges.push({
					ageType: standardAge.ageType,
					ages: [standardAge],
					older: standardAge.ageOlder,
					younger: standardAge.ageYounger
				});
			}
		});

		//labels should be the ageType
		let labels = [];
		for(let key in compoundAges) {
			labels.push(compoundAges[key].ageType);
		}

		let colors = this.sqs.color.getColorScheme(labels.length);

		let datasets = [{
			label: "",
			data: [],
			backgroundColor: colors,
		}];
		for(let key in compoundAges) {
			let age = compoundAges[key];
			datasets[0].data.push([age.older, age.younger])
		}

		const data = {
			labels: labels,
			datasets: datasets
		};

		const config = {
			type: 'bar',
			data: data,
			options: {
				scales: {
					x: {
						reverse: true,
						ticks: {
							callback: function (value, index, values) {
								if (value >= 1000) {
									return value / 1000 + "k BP";
								} else {
									return value+" BP";
								}
							},
					  	},
					},
				},
				indexAxis: 'y',
				responsive: true,
				plugins: {
					tooltip: {
						callbacks: {
							title: (tooltipItems) => {
								let older = tooltipItems[0].raw[0];
								let younger = tooltipItems[0].raw[1];
								return older+" BP - "+younger+" BP";
							},
							label: (data) => {
								return "Dating by "+data.label;
							}
						}
					},
					legend: {
						display: false
					},
					title: {
						display: true,
						text: 'Timeline Chart'
					}
				}
			}
		};

		
		let chartId = nanoid();
		document.getElementById(targetAnchorQuery).innerHTML = '<canvas id="'+chartId+'"></canvas>';

		const ctx = document.getElementById(chartId).getContext("2d");
        const myChart = new Chart(ctx, config);
	}

	/**
	 * Checks if two number ranges overlap and returns the type of overlap.
	 *
	 * @param {Array} range1 - The first range, represented as an array of two numbers.
	 * @param {Array} range2 - The second range, represented as an array of two numbers.
	 * @returns {Object} An object with two properties: `overlap`, which is a boolean indicating whether the two ranges overlap or not, and `type`, which is a string indicating the type of overlap. The possible values for `type` are `"inner"`, `"left"`, `"right"`, and `"outer"`.
	 */
	rangesOverlap(range1, range2) {
		if (range1[0] > range2[1]) {
		  return { overlap: false, type: "outer" };
		} else if (range1[1] < range2[0]) {
		  return { overlap: false, type: "outer" };
		} else if (range1[0] < range2[0] && range1[1] > range2[1]) {
		  return { overlap: true, type: "inner" };
		} else if (range1[0] >= range2[0] && range1[1] <= range2[1]) {
		  return { overlap: true, type: "inner" };
		} else if (range1[0] < range2[0] && range1[1] >= range2[0]) {
		  return { overlap: true, type: "left" };
		} else if (range1[0] <= range2[1] && range1[1] > range2[1]) {
		  return { overlap: true, type: "right" };
		}
	}
	
	exportSite() {
		let jsonBtn = this.sqs.siteReportManager.siteReport.getExportButton("json", this.sqs.siteReportManager.siteReport.siteData);
		//let pdfBtn = this.sqs.siteReportManager.siteReport.getExportButton("pdf", this.sqs.siteReportManager.siteReport.siteData);

		let dialogNodeId = nanoid();
		let dialogNode = $("<div id='node-"+dialogNodeId+"' class='dialog-centered-content-container'></div>");
		this.sqs.dialogManager.showPopOver("Site data export", "<br />"+dialogNode.prop('outerHTML'));

		$("#node-"+dialogNodeId).append(jsonBtn);
		//$("#node-"+dialogNodeId).append(pdfBtn);
	}

	/*
	* Function: renderMiniMap
	*
	* Renders the little map which shows site position in the sidebar.
	*/
	renderMiniMap(siteData) {
		$("#site-report-map-container").html("");

		this.olMap = new Map({
			//controls: [],
			controls: defaultControls({ zoom: true, rotate: false }),
			target: 'site-report-map-container',
			layers: new GroupLayer({
				layers: [
					new TileLayer({
						source: new OSM({
							url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
							attributions: 'Map baselayer: &copy; <a href="https://www.opentopomap.org">OpenTopoMap</a>'
						}),
						visible: true
					})
				]
			}),
			view: new View({
				center: fromLonLat([parseFloat(siteData.longitude_dd), parseFloat(siteData.latitude_dd)]),
				zoom: 4
			}),
		});
		
		var iconFeatures = [];
		
		var coords = transform([parseFloat(siteData.longitude_dd), parseFloat(siteData.latitude_dd)], 'EPSG:4326', 'EPSG:3857');
		var iconFeature = new Feature({
			geometry: new Point(coords),
			name: siteData.site_name
		});
		
		iconFeatures.push(iconFeature);
		
		var vectorSource = new VectorSource({
			features: iconFeatures //add an array of features
		});
		
		
		var strokeColor = "#333";
		let fillColor = css.auxColor;
		var iconStyle = new Style({
			image: new CircleStyle({
				radius: 8,
				stroke: new Stroke({
					color: strokeColor
				}),
				fill: new Fill({
					color: fillColor
				})
			})
		});
		
		
		var vectorLayer = new VectorLayer({
			source: vectorSource,
			style: iconStyle
		});
		
		this.olMap.addLayer(vectorLayer);
		
		this.sqs.sqsEventListen("layoutResize", () => {
			this.olMap.updateSize();
		});
	}
	
	destroy() {
		this.sqs.sqsEventUnlisten("fetchBasicSiteInformation", this);
	}
}
export { BasicSiteInformation as default }