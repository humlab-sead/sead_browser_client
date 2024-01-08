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
		if(datasetReferencesHtml == "") {
			datasetReferencesHtml = "No data";
		}

		let sampleGroupBiblioIds = [];
		siteData.sample_groups.forEach(sampleGroup => {
			sampleGroup.biblio.forEach(biblio => {
				if(sampleGroupBiblioIds.indexOf(biblio.biblio_id) == -1) {
					sampleGroupBiblioIds.push(biblio.biblio_id);
				}
			});
		});
		let sampleGroupReferencesHtml = this.sqs.renderBiblioReference(siteData, sampleGroupBiblioIds);
		if(sampleGroupReferencesHtml == "") {
			sampleGroupReferencesHtml = "No data";
		}

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
			.append("<div class='site-report-aux-header-container'><h4>Sample group references</h4></div>")
			.append("<div class='site-report-aux-header-underline'></div>")
			.append("<div class='site-report-site-description site-report-aux-info-text-container'>"+sampleGroupReferencesHtml+"</div>")
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

	renderDatasetContacts(siteData) {
		let datasetContactIds = [];
		let out = "";
		for(let key in siteData.datasets) {
			let dataset = siteData.datasets[key];
			dataset.contacts.forEach(contact_id => {
				if(datasetContactIds.indexOf(contact_id) == -1) {
					datasetContactIds.push(contact_id);
					siteData.lookup_tables.dataset_contacts.forEach(datasetContact => {

						out += "<div class='site-reference-box'>";
						if(datasetContact.contact_type) {
							out += datasetContact.contact_type+" ";
						}
						if(datasetContact.contact_first_name) {
							out += datasetContact.contact_first_name+" ";
						}
						if(datasetContact.contact_last_name) {
							out += datasetContact.contact_last_name+" ";
						}
						if(datasetContact.contact_address_1) {
							out += "<br />"+datasetContact.contact_address_1;
						}
						if(datasetContact.contact_address_2) {
							out += "<br />"+datasetContact.contact_address_2;
						}
						if(datasetContact.contact_email) {
							out += "<br />"+datasetContact.contact_email;
						}
						if(datasetContact.contact_url) {
							out += "<br /><a target='_blank' href='"+datasetContact.contact_url+"'>"+datasetContact.contact_url+"</a>";
						}
						if(datasetContact.contact_location_name) {
							out += "<br />"+datasetContact.contact_location_name;
						}

						out += "</div>";
					});
				}
			});
		}
		return out;
	}

	renderDatasetReferences(siteData) {
		let out = "";

		//only print a dataset reference once
		let datasetBiblioIds = [];
		siteData.datasets.forEach(dataset => {
			if(dataset.biblio_id != null) {
				siteData.lookup_tables.biblio.forEach(biblio => {
					if(biblio.biblio_id == dataset.biblio_id && datasetBiblioIds.indexOf(biblio.biblio_id) == -1) {
						datasetBiblioIds.push(biblio.biblio_id);
						console.log(biblio.biblio_id, datasetBiblioIds, datasetBiblioIds.indexOf(biblio.biblio_id));
						out += "<div class='site-reference-box'>";
	
						if(biblio.full_reference) {
							out += biblio.full_reference;
						}
						else {
							if(biblio.authors) {
								out += biblio.authors+", ";
							}
							if(biblio.year) {
								out += biblio.year+", ";
							}
							if(biblio.title) {
								out += "<span style='font-style:italic;'>"+biblio.title+"</span>, ";
							}
							if(biblio.isbn) {
								out += "<br />ISBN "+biblio.isbn;
							}
							if(biblio.bugs_reference) {
								out += "<br />BugsCEP reference: "+biblio.bugs_reference;
							}
							if(biblio.doi) {
								out += "<br />DOI: "+biblio.doi;
							}
							if(biblio.url) {
								out += "<br />URL: <a target='_blank' href='"+biblio.url+"'>"+biblio.url+"</a>";
							}
							if(biblio.notes) {
								out += "<br />Notes: "+biblio.notes;
							}
						}
						
						out += "</div>";
					}
				});
			}
		});

		

		/*
		dataset.contacts.forEach(dsc => {
			dataset.dataset_name;
			dataset.method_id;
			dsc.contact_id;
			dsc.contact_type_id

			let dsAnalysisMethodName = "Unknown";
			siteData.lookup_tables.analysis_methods.forEach(method => {
				if(method.method_id == dataset.method_id) {
					dsAnalysisMethodName = method.method_name;
				}
			});


			let contactTypeData = null;
			siteData.lookup_tables.dataset_contact_types.forEach(datasetContactType => {
				if(datasetContactType.contact_type_id == dsc.contact_type_id) {
					contactTypeData = datasetContactType;
				}
			});

			let contactData = null;
			siteData.lookup_tables.dataset_contacts.forEach(datasetContact => {
				if(datasetContact.contact_id == dsc.contact_id) {
					contactData = datasetContact;
				}
			});


			out += "<div class='site-reference-box'>";
			out += "<h5 class='site-report-reference-title'>"+dsAnalysisMethodName+" dataset "+dataset.dataset_name+"</h5>";

			//contactTypeData.contact_type_name; //e.g. "dataset imported by"
			//contactTypeData.description; //should be used as tt for above

			let personName = "";
			if(contactData.first_name && contactData.last_name) {
				personName = contactData.first_name+" "+contactData.last_name;
			}
			if(!contactData.first_name && contactData.last_name) {
				personName = contactData.last_name;
			}

			let contactTypeName = "";
			if(contactTypeData.contact_type_name) {
				contactTypeName = contactTypeData.contact_type_name.trim();
			}

			let ttId = nanoid();
			out += "<div><span id='"+ttId+"'>"+contactTypeName+"</span> "+personName+"</div>";
			if(contactData.email || contactData.address_1 || contactData.address_2) {
				out += "<hr/>";
			}
			out += contactData.address_1 ? "<div>"+contactData.address_1+"</div>" : "";
			out += contactData.address_2 ? "<div>"+contactData.address_2+"</div>" : "";
			if(contactData.email || contactData.url) {
				out += "<br/>";
			}
			out += contactData.email ? "<div>"+contactData.email+"</div>" : "";
			out += contactData.url ? "<div><a target='_blank' href='"+contactData.url+"'>"+contactData.url+"</a></div>" : "";
			out += "</div>";

			this.sqs.tooltipManager.registerTooltip("#"+ttId, contactTypeData.description);
		});
		*/
		return out;
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