/*OpenLayers imports*/
import { nanoid } from 'nanoid';
import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer, Graticule } from 'ol/layer';
import { Group as GroupLayer } from 'ol/layer';
import { Vector as VectorSource, StadiaMaps } from 'ol/source';
import {fromLonLat, transform} from 'ol/proj.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import { defaults as defaultControls } from 'ol/control.js';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import css from '../../../stylesheets/style.scss';
import DatingToPeriodDataset from './DatasetModules/DatingToPeriodDataset.class';
import { Chart } from "chart.js";
import DendrochronologyDataset from './DatasetModules/DendrochronologyDataset.class';
import ESRDataset from './DatasetModules/ESRDataset.class';
import OpenLayersMap from '../../Common/OpenLayersMap.class';
import SqsMenu from '../../SqsMenu.class';

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

	preRender() {
		$(".site-report-title-site-name").html("Loading...");
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
		exportLinksHtml += `<div class='site-report-export-btn' href=''>
			<li class='light-theme-button'><i class=\"fa fa-download\" aria-hidden=\"true\" style='margin-right:5px;'></i>
				<span style='float:right;'>Export all site data</span>
			</li>
		</div>`;
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

		let auxInfoHtml = `<div class='site-report-aux-header-container'><h4>Site identifier</h4></div>
		<div class='site-report-aux-header-underline'></div>
		<div class='site-report-aux-info-text-container site-report-information-item'>${siteData.site_id}</div>
		<div class='site-report-aux-header-container'><h4>Site location</h4></div>
		<div class='site-report-aux-header-underline'></div>
		<div id='site-report-locations-container' class='site-report-information-item'></div>
		<div class='site-report-aux-header-container'><h4>Sample locations</h4></div>
		<div class='site-report-aux-header-underline'></div>
		<div id='site-report-sample-coordinates-container' class='site-report-information-item'></div>
		<div class='site-report-aux-header-container'><h4>Export</h4></div>
		<div class='site-report-aux-header-underline'></div>
		<div class='site-report-aux-info-text-container site-report-information-item'>${exportLinksHtml}</div>
		<div class='site-report-aux-header-container'><h4>Description</h4></div>
		<div class='site-report-aux-header-underline'></div>
		<div class='site-report-information-item site-report-site-description site-report-description-text-container site-report-aux-info-text-container'>${siteDecription}</div>
		<div id='site-report-time-overview-container' class='site-report-aux-info-text-container'>
			<div class='site-report-aux-header-container'><h4>Site dating overview</h4></div>
			<div class='site-report-aux-header-underline'></div>
			<div id="site-report-time-overview" class='site-report-information-item'></div>
		</div>
		<div class='site-report-aux-header-container'><h4>Site reference</h4></div>
		<div class='site-report-aux-header-underline'></div>
		<div class='site-report-site-description site-report-aux-info-text-container site-report-information-item'>${siteReferencesHtml}</div>
		<div class='site-report-aux-header-container'><h4>Sample group references</h4></div>
		<div class='site-report-aux-header-underline'></div>
		<div class='site-report-site-description site-report-aux-info-text-container site-report-information-item'>${sampleGroupReferencesHtml}</div>
		<div class='site-report-aux-header-container'><h4>Dataset references</h4></div>
		<div class='site-report-aux-header-underline'></div>
		<div class='site-report-site-description site-report-aux-info-text-container site-report-information-item'>${datasetReferencesHtml}</div>`;

		node.append(auxInfoHtml);
		
		this.sqs.tooltipManager.registerTooltip("#site-report-time-overview-container .site-report-aux-header-container h4", "This chart shows the extremes (oldest and youngest) of all dated samples in this site, categorized by type of dating. Dating is shown as years before present (BP), which in SEAD is defined as the year "+this.sqs.config.constants.BP+".", {placement: "top", drawSymbol: true});

		$("#site-report-locations-container").append("<div id='site-report-map-container'>");
		$("#site-report-sample-coordinates-container").append("<div id='site-report-sample-map-container'></div>");


		var locationsContainer = $("#site-report-locations-container");
		for(var i = 0; i < siteData.location.length; i++) {
			var el = $("<span>" + siteData.location[i].location_name + "</span>");
			locationsContainer.append(el);
			this.sqs.tooltipManager.registerTooltip(el, "<div style='font-weight:bold'>"+siteData.location[i].location_type+"</div><div>"+siteData.location[i].location_description+"</div>", {drawSymbol: true});
			
			if (i+1 < siteData.location.length) {
				locationsContainer.append(", ");
			}
		}

		if(siteData.site_location_accuracy) {
			locationsContainer.append("<div><h5>Location accuracy</h5><span id='site-location-accuracy-value'>"+siteData.site_location_accuracy+"</span></div>");
		}

		
		$(".site-report-export-btn", node).on("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			this.exportSite();
		});
		
		this.renderMiniMap(siteData);
		this.renderSampleMap(siteData);

		this.sqs.sqsEventListen("analysisSectionsBuilt", () => {
			this.renderTimeOverview("site-report-time-overview");
		});
	}


	renderTimeOverview(targetAnchorQuery) {
		let siteDatingSummary = [];
		this.sqs.siteReportManager.siteReport.modules.forEach(m => {
			if(m.name == "analysis") {
				m.module.datasetModules.forEach(dsm => {
					if(dsm.instance instanceof DatingToPeriodDataset) {
						siteDatingSummary = siteDatingSummary.concat(dsm.instance.getDatingSummary());
					}

					if(dsm.instance instanceof DendrochronologyDataset) {
						siteDatingSummary = siteDatingSummary.concat(dsm.instance.getDatingSummary());
					}

					if(dsm.instance instanceof ESRDataset) {
						siteDatingSummary = siteDatingSummary.concat(dsm.instance.getDatingSummary());
					}
				})
			}
		});

		const standardAges = siteDatingSummary;

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
					younger: standardAge.ageYounger,
					isBP: standardAge.isBP
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

		let ticksLabelCallback = null;
		let tooltipCallback = null;
		console.log(compoundAges)
		if(compoundAges.length > 0 && compoundAges[0].isBP) {
			ticksLabelCallback = function (value, index, values) {
				if (value >= 1000) {
					return value / 1000 + "k BP";
				} else {
					return value+" BP";
				}
			};

			tooltipCallback = function (tooltipItems) {
				let older = tooltipItems[0].raw[0];
				let younger = tooltipItems[0].raw[1];
				return older+" BP - "+younger+" BP";
			}
		}
		else {
			ticksLabelCallback = function (value, index, values) {
				if (value >= 1000) {
					return value / 1000 + "k";
				} else {
					return value;
				}
			};

			tooltipCallback = function (tooltipItems) {
				let older = tooltipItems[0].raw[0];
				let younger = tooltipItems[0].raw[1];
				return older+" - "+younger;
			}
		}

		const config = {
			type: 'bar',
			data: data,
			options: {
				scales: {
					x: {
						reverse: true,
						ticks: {
							callback: ticksLabelCallback,
					  	},
					},
				},
				indexAxis: 'y',
				responsive: true,
				plugins: {
					tooltip: {
						callbacks: {
							title: tooltipCallback,
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
        const chart = new Chart(ctx, config);

		window.addEventListener('resize', () => {
			chart.resize();
		});
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
			siteData.lookup_tables.methods.forEach(method => {
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
		let xlsxBtn = this.sqs.siteReportManager.siteReport.getExportButton("xlsxBook", this.sqs.siteReportManager.siteReport.siteData);
		//let pdfBtn = this.sqs.siteReportManager.siteReport.getExportButton("pdf", this.sqs.siteReportManager.siteReport.siteData);

		let dialogNodeId = nanoid();
		let dialogNode = $("<div id='node-"+dialogNodeId+"' class='dialog-centered-content-container'></div>");
		this.sqs.dialogManager.showPopOver("Site data export", "<br />"+dialogNode.prop('outerHTML'));

		$("#node-"+dialogNodeId).append(jsonBtn);
		$("#node-"+dialogNodeId).append(xlsxBtn);
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

	getMapSampleGroupLocationPointsFromSiteData(olMap, siteData, sampleGroupIdFilter = null) {
		let sampleGroupPoints = [];
		siteData.sample_groups.forEach(sampleGroup => {
			if(sampleGroupIdFilter && sampleGroup.sample_group_id != sampleGroupIdFilter) {
				return;
			}
			if(sampleGroup.coordinates && sampleGroup.coordinates.length > 0) {
				let points = olMap.coordinatesToPoints(sampleGroup.coordinates);

				let pointAccuracy = null;
				if(sampleGroup.coordinates.length > 1) {
					if(sampleGroup.coordinates[0].accuracy != sampleGroup.coordinates[1].accuracy) {
						console.warn("WARN: Sample group coordinates have different accuracy values. Using the first one.");
					}
					pointAccuracy = sampleGroup.coordinates[0].accuracy;
				}

				points.forEach(p => {
					p.level = "Sample group";
					p.name = sampleGroup.sample_group_name;
					p.sampleGroupId = sampleGroup.sample_group_id;
					p.sampleGroupName = sampleGroup.sample_group_name;
					p.tooltip = sampleGroup.sample_group_name;
					p.accuracy = pointAccuracy;
				});
				sampleGroupPoints.push(...points);
			}
		});

		return sampleGroupPoints;
	}

	getMapSampleLocationPointsFromSiteData(olMap, siteData, sampleGroupIdFilter = null) {
		let samplePoints = [];
		siteData.sample_groups.forEach(sampleGroup => {
			if(sampleGroupIdFilter && sampleGroup.sample_group_id != sampleGroupIdFilter) {
				return;
			}
			
			sampleGroup.physical_samples.forEach(sample => {
				if(sample.coordinates && sample.coordinates.length > 0) {
					let points = olMap.coordinatesToPoints(sample.coordinates);

					let pointAccuracy = null;
					if(sample.coordinates.length > 1) {
						if(sample.coordinates[0].accuracy != sample.coordinates[1].accuracy) {
							console.warn("WARN: Sample coordinates have different accuracy values. Using the first one.");
						}
						pointAccuracy = sample.coordinates[0].accuracy;
					}

					points.forEach(p => {

						let tooltipText = sample.sample_name;
						/*
						if(p.zString) {
							tooltipText += " ("+p.zString+")";
						}
						*/

						p.level = "Sample";
						p.name = sample.sample_name;
						p.sampleName = sample.sample_name;
						p.sampleGroupId = sampleGroup.sample_group_id;
						p.sampleGroupName = sampleGroup.sample_group_name;
						p.tooltip = tooltipText;
						p.accuracy = pointAccuracy;
					});
					samplePoints.push(...points);
				}
			});
		});

		return samplePoints;
	}

	renderSampleMap(siteData) {
		$("#site-report-sample-map-container").html("");

		//menu stuff
		let mapMenu = `
		<div class='menu-row-container'>
			<div class='map-base-layer-menu-container'>
				<div class='menu-row-item'>Base layers</div>
				<div class='map-base-layer-menu sqs-menu-container'></div>
			</div>
			<div class='menu-row-item-divider'></div>
			<div class='map-export-menu-container'>
				<div class='menu-row-item'>Export</div>
				<div class='map-export-menu sqs-menu-container'></div>
			</div>
			<div class='menu-row-item-divider'></div>
			<div class='map-sample-group-menu-container'>
				<div class='menu-row-item'>Sample group</div>
				<div class='map-sample-group-menu sqs-menu-container'></div>
			</div>
		</div>
		`;

		let sampleGroupMenuItems = [{
			name: "all",
			title: "All",
			staticSelection: false,
			selected: true,
			callback: () => {
				this.setSampleMapData(olMap, siteData);
			}
		}];

		let siteHasSampleCoordinates = false;
		siteData.sample_groups.forEach(sampleGroup => {
			let sampleGroupHasCoordinates = false;
			if(sampleGroup.coordinates && sampleGroup.coordinates.length > 0) {
				sampleGroupHasCoordinates = true;
				siteHasSampleCoordinates = true;
			}
			sampleGroup.physical_samples.forEach(sample => {
				if(sample.coordinates && sample.coordinates.length > 0) {
					sampleGroupHasCoordinates = true;
					siteHasSampleCoordinates = true;
				}
			});

			if(sampleGroupHasCoordinates) {
				sampleGroupMenuItems.push({
					name: sampleGroup.sample_group_id,
					title: sampleGroup.sample_group_name,
					staticSelection: false,
					selected: false,
					callback: () => {
						this.setSampleMapData(olMap, siteData, sampleGroup.sample_group_id)
					}
				});
			}
		});

		if(!siteHasSampleCoordinates) {
			$("#site-report-sample-map-container").html("There are no samples or sample groups with coordinates in this site.");
			return;
		}

		let olMap = new OpenLayersMap(this.sqs);
		olMap.render("#site-report-sample-map-container");
		$("#site-report-sample-map-container").append(mapMenu);
		
		var menu = {
			title: "<i class=\"fa fa-globe result-map-control-icon\" aria-hidden=\"true\"></i><span class='result-map-tab-title'>Sample group</span>", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: "#site-report-sample-map-container .map-sample-group-menu", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
			staticSelection: true, //whether a selected item remains highlighted or not, purely visual
			visible: true, //show this menu by default
			style: {
				menuTitleClass: "result-map-control-menu-title",
				l1TitleClass: "result-map-control-item-title"
			},
			items: sampleGroupMenuItems,
			triggers: [{
				selector: "#site-report-sample-map-container .map-sample-group-menu-container",
				on: "click"
			}]
		};
		new SqsMenu(this.sqs, menu);

		let sampleGroupsGeojson = this.getSampleGroupsAsGeoJSON(olMap, siteData.sample_groups, null);
		let samplesGeojson = this.getSamplesAsGeoJSON(olMap, siteData.sample_groups, null);
		let allGeojson = sampleGroupsGeojson;
		allGeojson.features.push(...samplesGeojson.features);
		olMap.setGeojsonData(allGeojson);
		//olMap.renderExportMenu("#site-report-sample-map-container .map-export-menu-container", siteData);

		let exportMenu = {
			title: "<i class=\"fa fa-download result-map-control-icon\" aria-hidden=\"true\"></i><span class='result-map-tab-title'>Export</span>", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: "#site-report-sample-map-container .map-export-menu-container .map-export-menu", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
			staticSelection: true, //whether a selected item remains highlighted or not, purely visual
			visible: true, //show this menu by default
			style: {
				menuTitleClass: "result-map-control-menu-title",
				l1TitleClass: "result-map-control-item-title"
			},
			items: [ //The menu items contained in this menu
			],
			triggers: [{
				selector: "#site-report-sample-map-container .map-export-menu-container",
				on: "click"
			}]
		};

		exportMenu.items.push({
			name: "exportMap",
			title: "GeoJSON",
			tooltip: "",
			callback: () => {
				olMap.exportMapAsGeoJSON(siteData);
			}
		});

		new SqsMenu(this.sqs, exportMenu);
		//end of menu stuff

		this.setSampleMapData(olMap, siteData);

		olMap.setMapBaseLayer("topoMap");
	}

	setSampleMapData(olMap, siteData, sampleGroupId = null) {
		let sampleGroupIdFilter = sampleGroupId;
		let sampleGroupPoints = this.getMapSampleGroupLocationPointsFromSiteData(olMap, siteData, sampleGroupIdFilter);
		let samplePoints = this.getMapSampleLocationPointsFromSiteData(olMap, siteData, sampleGroupIdFilter);

		if(sampleGroupPoints.length == 0 && samplePoints.length == 0) {
			console.log("There are no samples or sample groups with coordinates in this site. Not rendering samples map.");
			olMap.addOverlayInfoBox("There are no samples or sample groups with coordinates in this site.", "top");
			return false;
		}

		let foundLocalCoordinates = false;
		let renderBaseLayer = false;
		for(let key in samplePoints) {
			if(samplePoints[key].planarCoordSys == "EPSG:4326") {
				renderBaseLayer = true;
			}
			else {
				foundLocalCoordinates = true;
			}
		}

		for(let key in sampleGroupPoints) {
			if(sampleGroupPoints[key].planarCoordSys == "EPSG:4326") {
				renderBaseLayer = true;
			}
			else {
				foundLocalCoordinates = true;
			}
		}

		if(!renderBaseLayer) {
			$("#site-report-sample-map-container .map-base-layer-menu-container").hide();
		}
		else {
			$("#site-report-sample-map-container .map-base-layer-menu-container").show();
		}

		if(renderBaseLayer && foundLocalCoordinates) {
			console.warn("WARN: Found local coordinates mixed in with WGS84 in sample data. Ignoring local coordinates.");
			//add map overlay explaining that local coordinates are mixed in with WGS84
			olMap.addOverlayInfoBox("This site contains local coordinate systems mixed with WGS84. The map is displayed in WGS84, and local coordinates are ignored.");
		}
		else {
			olMap.removeOverlayInfoBox();
		}

		let sampleGroupFeatures = olMap.getFeaturesFromSamplePoints(sampleGroupPoints);
		let sampleFeatures = olMap.getFeaturesFromSamplePoints(samplePoints);

		//remove any previous dataLayers
		olMap.removeLayer("Sample groups");
		olMap.removeLayer("Samples");

		olMap.addPointsLayerFromFeatures("Sample groups", sampleGroupFeatures, "sampleGroupCoordinates");
		olMap.addPointsLayerFromFeatures("Samples", sampleFeatures, "sampleCoordinates");

		let sampleGroupsExtent = olMap.getExtentFromFeatures(sampleGroupFeatures);
		let samplesExtent = olMap.getExtentFromFeatures(sampleFeatures);

		let combinedExtent = [];
		if(!sampleGroupsExtent) {
			combinedExtent = samplesExtent;
		}
		else if(!samplesExtent) {
			combinedExtent = sampleGroupsExtent;
		}
		else {
			combinedExtent = olMap.combineExtents(sampleGroupsExtent, samplesExtent);
		}
		
		let padding = 30;
		let maxZoom = renderBaseLayer ? 16 : 100;
		olMap.olMap.getView().fit(combinedExtent, {
			padding: [padding, padding, padding, padding],
			maxZoom: maxZoom,
			duration: 500
		});

		if(renderBaseLayer) {
			olMap.addStandardBaseLayers(); //this is safe to run even if the layers are already added
			$("#site-report-sample-map-container .map-base-layer-menu-container").show();
			olMap.renderBaseLayerMenu("#site-report-sample-map-container .map-base-layer-menu-container");
		}
		else {
			$("#site-report-sample-map-container .map-base-layer-menu-container").hide();
			// Create a Graticule control with fine grey lines if it doesn't already exist
			if(olMap.olMap.getControls().getArray().filter(control => control instanceof Graticule).length == 0) {
				let graticule = new Graticule({
					strokeStyle: new Stroke({
						color: 'rgba(0, 0, 0, 0.5)',
						width: 1,
						lineDash: [0.5, 4],
					}),
					showLabels: false,
				});
				
				olMap.olMap.addControl(graticule);
			}
		}

		let selectStyle = (feature) => {
			let dataLayer = olMap.getVisibleDataLayer();
			if(!dataLayer) {
				console.warn("No visible data layer");
				return;
			}

			return new Style({
				image: new CircleStyle({
					radius: 10,
					stroke: new Stroke({
						color: "#fff"
					}),
					fill: new Fill({
						color: "#ff0000"
					})
				})
			});
		};

		olMap.addSelectInteraction(selectStyle);

		let sampleGroupsGeojson = this.getSampleGroupsAsGeoJSON(olMap, siteData.sample_groups, sampleGroupId);
		let samplesGeojson = this.getSamplesAsGeoJSON(olMap, siteData.sample_groups, sampleGroupId);
		let allGeojson = sampleGroupsGeojson;
		allGeojson.features.push(...samplesGeojson.features);
		olMap.setGeojsonData(allGeojson);
	}

	getSampleGroupsAsGeoJSON(olMap, sampleGroups, sampleGroupIdFilter = null) {
		let sampleGroupPoints = [];
		sampleGroups.forEach(sampleGroup => {
			if(sampleGroupIdFilter && sampleGroup.sample_group_id != sampleGroupIdFilter) {
				return;
			}
			if(sampleGroup.coordinates && sampleGroup.coordinates.length > 0) {
				let points = olMap.coordinatesToPoints(sampleGroup.coordinates);
				points.forEach(p => {
					p.level = "Sample group";
					p.name = sampleGroup.sample_group_name;
					p.sampleGroupId = sampleGroup.sample_group_id;
					p.sampleGroupName = sampleGroup.sample_group_name;
					p.tooltip = sampleGroup.sample_group_name;
				});
				sampleGroupPoints.push(...points);
			}
		});

		let sampleGroupsGeojson = olMap.pointsToGeoJSON(sampleGroupPoints);

		return sampleGroupsGeojson;
	}

	getSamplesAsGeoJSON(olMap, sampleGroups, sampleGroupIdFilter = null) {
		let samplePoints = [];
		sampleGroups.forEach(sampleGroup => {
			if(sampleGroupIdFilter && sampleGroup.sample_group_id != sampleGroupIdFilter) {
				return;
			}
			
			sampleGroup.physical_samples.forEach(sample => {
				if(sample.coordinates && sample.coordinates.length > 0) {
					let points = olMap.coordinatesToPoints(sample.coordinates);
					points.forEach(p => {
						p.level = "Sample";
						p.name = sample.sample_name;
						p.sampleName = sample.sample_name;
						p.sampleGroupId = sampleGroup.sample_group_id;
						p.sampleGroupName = sampleGroup.sample_group_name;
						p.tooltip = sample.sample_name;
					});
					samplePoints.push(...points);
				}
			});
		});
		let samplesGeojson = olMap.pointsToGeoJSON(samplePoints);

		return samplesGeojson;
	}
	
	destroy() {
		this.sqs.sqsEventUnlisten("fetchBasicSiteInformation", this);
	}
}
export { BasicSiteInformation as default }