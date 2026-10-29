/*OpenLayers imports*/
import { nanoid } from 'nanoid';
import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer, Graticule } from 'ol/layer';
import { Group as GroupLayer } from 'ol/layer';
import { Vector as VectorSource, Cluster as ClusterSource, StadiaMaps } from 'ol/source';
import {fromLonLat, transform} from 'ol/proj.js';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style.js';
import { defaults as defaultControls } from 'ol/control.js';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Overlay from 'ol/Overlay';
import { boundingExtent, getWidth, getHeight } from 'ol/extent';
import css from '../../../stylesheets/style.scss';
import { Chart } from "chart.js";
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
		this.miniMapStyle = {
			siteColor: "#f60",
			otherSitesColor: this.sqs.color.getColorScheme(20, 0.75)[13] //Same as the sites on the result map
		};
		this.miniMapClusterStyles = {};
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
		//Get the other sites for the map going while the site itself is fetched
		this.sqs.siteReportManager.fetchSiteLocations().catch(() => {});
	}

	/*
	* Function: render
	*
	* Fills in what the site report says about the site itself: the title, the location, the site
	* record and the references, and the site and sample maps.
	*/
	async render(siteData) {
		this.data = siteData;

		this.renderTitle(siteData);
		this.renderLocation(siteData);
		this.renderSiteRecord(siteData);
		this.renderReferencesTab(siteData);
		this.bindActions(siteData);

		this.renderMiniMap(siteData);

		//The sample map is on a tab of its own, and a map can't be fitted to its points while hidden
		this.sampleMapRendered = false;
		let renderSampleMapWhenShown = (tabName) => {
			if(tabName == "samples" && !this.sampleMapRendered) {
				this.sampleMapRendered = true;
				this.renderSampleMap(siteData);
			}
		};
		if(!this.siteHasSampleCoordinates(siteData)) {
			$(".site-report-samples-side").hide();
			$(".site-report-samples-side").closest(".site-report-columns").addClass("site-report-columns-single");
		}
		else {
			$(".site-report-samples-side").show();
			renderSampleMapWhenShown(this.sqs.siteReportManager.siteReport.activeTab);
			this.sqs.sqsEventListen("siteReportTabShown", (evt, data) => {
				renderSampleMapWhenShown(data.tab);
			}, this);
		}
	}

	renderTitle(siteData) {
		let titleNode = $(".site-report-title-site-name").text(siteData.site_name);
		this.sqs.tooltipManager.registerTooltip(titleNode, "Name of the site as given by the data provider", {placement: "top"});
		$(".site-report-site-id").text("#"+siteData.site_id);

		let descriptionNode = $(".site-report-site-description");
		if(siteData.site_description) {
			descriptionNode.text(siteData.site_description).removeClass("site-report-no-data");
		}
		else {
			descriptionNode.text("No site description recorded.").addClass("site-report-no-data");
		}
	}

	/*
	* Function: getOrderedLocations
	* The site's locations, the country first, without the blanks and repeats the data sometimes has.
	*/
	getOrderedLocations(siteData) {
		let seen = [];
		let locations = siteData.location.filter(location => {
			let name = location.location_name ? location.location_name.trim() : "";
			if(name == "" || seen.includes(name)) {
				return false;
			}
			seen.push(name);
			return true;
		});
		locations.sort((a, b) => {
			return (a.location_type == "Country" ? 0 : 1) - (b.location_type == "Country" ? 0 : 1);
		});
		return locations;
	}

	/*
	* Function: getLocationTypeLabel
	* A short name for a type of location, for the list beside the map.
	*/
	getLocationTypeLabel(locationType) {
		const labels = {
			"Sub-country administrative region": "Region",
			"Aggregate/non-admin geographical region": "Area",
			"Unprocessed Bugs Transfer": "Place"
		};
		return labels[locationType] ? labels[locationType] : locationType;
	}

	renderLocation(siteData) {
		let listNode = $(".site-report-location-list");
		listNode.empty();

		this.getOrderedLocations(siteData).forEach(location => {
			listNode.append($("<dt></dt>").text(this.getLocationTypeLabel(location.location_type)));
			let valueNode = $("<dd></dd>").text(location.location_name.trim());
			listNode.append(valueNode);
			if(location.location_description) {
				this.sqs.tooltipManager.registerTooltip(valueNode, "<div style='font-weight:bold'>"+location.location_type+"</div><div>"+location.location_description+"</div>");
			}
		});

		if(siteData.latitude_dd != null && siteData.longitude_dd != null) {
			let lat = parseFloat(siteData.latitude_dd).toFixed(5);
			let lon = parseFloat(siteData.longitude_dd).toFixed(5);
			listNode.append($("<dt></dt>").text("Coordinates"));
			listNode.append($("<dd class='mono'></dd>").text(lat+", "+lon));
		}
		if(siteData.altitude != null && siteData.altitude !== "") {
			listNode.append($("<dt></dt>").text("Altitude"));
			listNode.append($("<dd></dd>").text(parseFloat(siteData.altitude)+" m"));
		}
		if(siteData.site_location_accuracy) {
			listNode.append($("<dt></dt>").text("Accuracy"));
			listNode.append($("<dd id='site-location-accuracy-value'></dd>").text(siteData.site_location_accuracy));
		}

		let sampleCount = 0;
		let samplesWithCoordinates = 0;
		siteData.sample_groups.forEach(sampleGroup => {
			sampleGroup.physical_samples.forEach(sample => {
				sampleCount++;
				if(sample.coordinates && sample.coordinates.length > 0) {
					samplesWithCoordinates++;
				}
			});
		});
		let note = "";
		if(samplesWithCoordinates > 0) {
			note = samplesWithCoordinates.toLocaleString("en-GB")+" of "+sampleCount.toLocaleString("en-GB")+" samples have coordinates of their own, see the samples tab.";
		}
		else if(siteData.sample_groups.some(sampleGroup => sampleGroup.coordinates && sampleGroup.coordinates.length > 0)) {
			note = "The samples share their sample group's coordinates.";
		}
		$(".site-report-location-note").text(note);
	}

	renderSiteRecord(siteData) {
		let listNode = $(".site-report-record-list");
		listNode.empty();

		listNode.append($("<dt></dt>").text("Site ID"));
		listNode.append($("<dd class='mono'></dd>").text(siteData.site_id));

		if(siteData.national_site_identifier) {
			listNode.append($("<dt></dt>").text("National ID"));
			listNode.append($("<dd></dd>").text(siteData.national_site_identifier));
		}

		listNode.append($("<dt></dt>").text("Permalink"));
		let permalink = this.getPermalink(siteData);
		listNode.append($("<dd class='mono site-report-permalink'></dd>").append($("<a></a>").attr("href", permalink).text(permalink)));

		let investigationTime = this.getInvestigationYears(siteData);
		if(investigationTime) {
			listNode.append($("<dt></dt>").text("Sampled"));
			listNode.append($("<dd></dd>").text(investigationTime));
		}

		if(siteData.date_updated) {
			let updated = new Date(siteData.date_updated);
			if(!isNaN(updated.getTime())) {
				listNode.append($("<dt></dt>").text("Updated"));
				listNode.append($("<dd></dd>").text(updated.toISOString().substring(0, 10)));
			}
		}
	}

	getPermalink(siteData) {
		return window.location.origin+"/site/"+siteData.site_id;
	}

	/*
	* Function: getInvestigationYears
	* The years the samples were taken in, as a short list, or null if none of them say.
	*/
	getInvestigationYears(siteData) {
		let years = [];
		siteData.sample_groups.forEach(sampleGroup => {
			sampleGroup.physical_samples.forEach(sample => {
				if(sample.date_sampled != null && sample.date_sampled !== "") {
					let match = String(sample.date_sampled).match(/^\d{4}/);
					if(match && !years.includes(parseInt(match[0]))) {
						years.push(parseInt(match[0]));
					}
				}
			});
		});
		if(years.length == 0) {
			return null;
		}
		years.sort((a, b) => a - b);
		if(years.length > 3) {
			return years[0]+"\u2013"+years[years.length - 1];
		}
		return years.join(", ");
	}

	/*
	* Function: renderReferencesTab
	* What the site, its sample groups and its datasets cite, and who to contact about the datasets.
	*/
	renderReferencesTab(siteData) {
		let cardNode = $(".site-report-references-card");
		cardNode.empty();

		let addGroup = (title, html, note = "") => {
			let groupNode = $("<div class='site-report-reference-group'></div>");
			groupNode.append($("<div class='sqs-label'></div>").text(title));
			if(html == "") {
				groupNode.append($("<p class='site-report-no-data'></p>").text("None recorded."));
			}
			else {
				groupNode.append($("<div class='site-report-reference-list'></div>").html(html));
			}
			if(note) {
				groupNode.append($("<p class='sqs-muted site-report-reference-note'></p>").text(note));
			}
			cardNode.append(groupNode);
		};

		let siteBiblioIds = siteData.biblio.map(siteRef => siteRef.biblio_id);
		addGroup("Site", this.sqs.renderBiblioReference(siteData, siteBiblioIds));

		let sampleGroupBiblioIds = [];
		let citingSampleGroups = [];
		siteData.sample_groups.forEach(sampleGroup => {
			sampleGroup.biblio.forEach(biblio => {
				if(!sampleGroupBiblioIds.includes(biblio.biblio_id)) {
					sampleGroupBiblioIds.push(biblio.biblio_id);
				}
				if(!citingSampleGroups.includes(sampleGroup.sample_group_name)) {
					citingSampleGroups.push(sampleGroup.sample_group_name);
				}
			});
		});
		addGroup("Sample groups", this.sqs.renderBiblioReference(siteData, sampleGroupBiblioIds), citingSampleGroups.length > 0 ? "Cited by "+citingSampleGroups.join(", ")+"." : "");

		let datasetBiblioIds = [];
		siteData.datasets.forEach(dataset => {
			if(dataset.biblio_id && !datasetBiblioIds.includes(dataset.biblio_id)) {
				datasetBiblioIds.push(dataset.biblio_id);
			}
		});
		addGroup("Datasets", this.sqs.renderBiblioReference(siteData, datasetBiblioIds));

		let contactsHtml = this.renderDatasetContacts(siteData);
		if(contactsHtml != "") {
			addGroup("Dataset contacts", contactsHtml);
		}
	}

	/*
	* Function: getCitationText
	* How to cite this site's page in SEAD.
	*/
	getCitationText(siteData) {
		let accessed = new Date().toISOString().substring(0, 10);
		return siteData.site_name+" (site "+siteData.site_id+"). SEAD, the Strategic Environmental Archaeology Database. "+this.getPermalink(siteData)+" (accessed "+accessed+").";
	}

	bindActions(siteData) {
		$(".site-report-export-btn").off("click").on("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			this.exportSite();
		});

		$(".site-report-copy-link-btn").off("click").on("click", () => {
			this.copyToClipboard(this.getPermalink(siteData), "Link to the site copied.");
		});

		$(".site-report-cite-btn").off("click").on("click", () => {
			let citationText = this.getCitationText(siteData);
			let siteReferences = this.sqs.renderBiblioReference(siteData, siteData.biblio.map(siteRef => siteRef.biblio_id));
			let copyButtonId = "copy-citation-"+nanoid();
			let html = "<div class='site-report-citation'>";
			html += "<p class='site-report-citation-text'></p>";
			html += "<button type='button' id='"+copyButtonId+"' class='sqs-btn'><i class='fa fa-clipboard' aria-hidden='true'></i> Copy citation</button>";
			if(siteReferences != "") {
				html += "<h4 class='sqs-label'>Please also cite the original publication</h4>"+siteReferences;
			}
			html += "</div>";
			this.sqs.dialogManager.showPopOver("Cite this site", html);
			$(".site-report-citation-text").text(citationText);
			$("#"+copyButtonId).on("click", () => {
				this.copyToClipboard(citationText, "Citation copied.");
			});
		});
	}

	copyToClipboard(text, confirmation) {
		if(navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text).then(() => {
				this.sqs.notificationManager.notify(confirmation, "info");
			}).catch(() => {
				this.sqs.notificationManager.notify("Could not copy to the clipboard.", "error");
			});
		}
		else {
			this.sqs.notificationManager.notify("Could not copy to the clipboard.", "error");
		}
	}

	siteHasSampleCoordinates(siteData) {
		return siteData.sample_groups.some(sampleGroup => {
			if(sampleGroup.coordinates && sampleGroup.coordinates.length > 0) {
				return true;
			}
			return sampleGroup.physical_samples.some(sample => sample.coordinates && sample.coordinates.length > 0);
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

	/*
	* Function: renderDatasetContacts
	* The people the site's datasets name, each once for each role they had.
	*/
	renderDatasetContacts(siteData) {
		let seen = [];
		let out = "";
		siteData.lookup_tables.dataset_contacts.forEach(datasetContact => {
			let key = datasetContact.contact_id+"-"+datasetContact.contact_type_id;
			if(seen.includes(key)) {
				return;
			}
			seen.push(key);

			let name = [datasetContact.contact_first_name, datasetContact.contact_last_name].filter(part => part).join(" ");
			out += "<div class='site-reference-box'>";
			if(datasetContact.contact_type) {
				out += "<span class='sqs-muted'>"+datasetContact.contact_type+"</span> ";
			}
			out += "<strong>"+name+"</strong>";
			[datasetContact.contact_address_1, datasetContact.contact_address_2, datasetContact.contact_location_name].forEach(line => {
				if(line) {
					out += "<br />"+line.replace(/\n/g, ", ");
				}
			});
			if(datasetContact.contact_email) {
				out += "<br /><a href='mailto:"+datasetContact.contact_email+"'>"+datasetContact.contact_email+"</a>";
			}
			if(datasetContact.contact_url) {
				out += "<br /><a target='_blank' href='"+datasetContact.contact_url+"'>"+datasetContact.contact_url+"</a>";
			}
			out += "</div>";
		});
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
		let dialogNodeId = nanoid();
		let dialogNode = $("<div id='node-"+dialogNodeId+"' class='dialog-centered-content-container'></div>");
		this.sqs.dialogManager.showPopOver("Site data export", dialogNode.prop('outerHTML'));

		let btnId = nanoid();
		$("#node-"+dialogNodeId).append("<button type='button' id='site-report-export-btn-"+btnId+"' class='site-report-export-download-btn sqs-btn'><i class='fa fa-download' aria-hidden='true'></i> Download JSON</button>").on("click", "#site-report-export-btn-"+btnId, (evt) => {
			this.sqs.exportManager.getJsonExport(this.data).then(objectUrl => {
				this.triggerDownload(this.data.site_name+".json", objectUrl);
			});
		});

		const sdfBtnSelector = "#site-report-export-btn-"+nanoid();
		$("#node-"+dialogNodeId).append("<button type='button' id='"+sdfBtnSelector.substring(1)+"' class='site-report-export-download-btn sqs-btn' title='A complete copy of this site in the SEAD Data Format (SDF): every table, row and column. Can be edited and submitted back to SEAD; see the README sheet inside.'><i class='fa fa-download' aria-hidden='true'></i> Download XLSX</button>").on("click", sdfBtnSelector, (evt) => {
			this.exportSiteAsSdfXlsx(sdfBtnSelector);
		});

		/* Hidden in favour of the SDF export above, but kept so it can be brought back.
		btnId = nanoid();
		$("#node-"+dialogNodeId).append("<button type='button' id='site-report-export-btn-"+btnId+"' class='site-report-export-download-btn sqs-btn'><i class='fa fa-download' aria-hidden='true'></i> Download XLSX</button>").on("click", "#site-report-export-btn-"+btnId, (evt) => {
			let methodIds = ["all"];
			this.sqs.exportManager.getXlsxBookExport(this.data, true, methodIds).then(objectUrl => {
				this.triggerDownload(this.data.site_name+".xlsx", objectUrl);
			});
		});
		*/

		btnId = nanoid();
		$("#node-"+dialogNodeId).append("<button type='button' id='site-report-export-btn-"+btnId+"' class='site-report-export-download-btn sqs-btn'><i class='fa fa-download' aria-hidden='true'></i> Download CSV (ZIP)</button>").on("click", "#site-report-export-btn-"+btnId, (evt) => {
			this.sqs.exportManager.getCsvExport(this.data).then(objectUrl => {
				this.triggerDownload(this.data.site_name+".zip", objectUrl);
			});
		});
	}

	/*
	* Function: exportSiteAsSdfXlsx
	*
	* Downloads this site as an SDF workbook, using the same export as the "Download XLSX"
	* button in the result view's export dialog (ResultModule.exportSitesAsSdfXlsx).
	*/
	exportSiteAsSdfXlsx(buttonSelector) {
		let resultManager = this.sqs.resultManager;
		let resultModule = resultManager.getActiveModule();
		if(!resultModule) {
			let modules = resultManager.getModules();
			resultModule = modules.length > 0 ? modules[0].module : null;
		}
		if(!resultModule) {
			console.error("No result module available for the SDF export");
			this.sqs.notificationManager.notify("Excel export failed: the export is not available right now.", "error");
			return;
		}
		resultModule.exportSitesAsSdfXlsx([this.siteId], buttonSelector);
	}

	triggerDownload(filename, data) {
		let a = document.createElement("a");
		a.href = data;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	/*
	* Function: renderMiniMap
	*
	* Renders the little map in the sidebar: the site itself, highlighted and on top, among all the
	* other sites in SEAD, clustered like on the result map. Clicking another site opens its site report.
	*/
	renderMiniMap(siteData) {
		$("#site-report-map-container").html("");

		// Create OpenLayersMap instance instead of plain Map
		let olMap = new OpenLayersMap(this.sqs);
		olMap.render("#site-report-map-container");

		// Add menu structure for base layer selector
		let mapMenu = `
		<div class='menu-row-container'>
			<div class='map-base-layer-menu-container'>
				<div class='menu-row-item'>Base layers</div>
				<div class='map-base-layer-menu sqs-menu-container'></div>
			</div>
		</div>
		`;

		$("#site-report-map-container").append(mapMenu);

		let siteCoords = fromLonLat([parseFloat(siteData.longitude_dd), parseFloat(siteData.latitude_dd)]);

		// Set initial view, until the other sites are in and the map can be fitted to the nearest of them
		olMap.olMap.setView(new View({
			center: siteCoords,
			zoom: 7
		}));

		// Add standard base layers
		olMap.addStandardBaseLayers();
		olMap.setMapBaseLayer("osm");

		// Render base layer menu
		olMap.renderBaseLayerMenu("#site-report-map-container .map-base-layer-menu-container");

		// The other sites, filled in once they have been fetched
		let otherSitesSource = new VectorSource();
		let otherSitesLayer = new VectorLayer({
			source: new ClusterSource({
				distance: 30,
				source: otherSitesSource
			}),
			style: (feature) => {
				return this.getMiniMapClusterStyle(feature);
			},
			zIndex: 200
		});
		olMap.olMap.addLayer(otherSitesLayer);

		// This site, in a layer of its own above the others so it's never hidden in a cluster
		let siteLayer = new VectorLayer({
			source: new VectorSource({
				features: [new Feature({
					geometry: new Point(siteCoords),
					name: siteData.site_name
				})]
			}),
			style: new Style({
				image: new CircleStyle({
					radius: 9,
					stroke: new Stroke({
						color: "#fff",
						width: 2
					}),
					fill: new Fill({
						color: this.miniMapStyle.siteColor
					})
				})
			}),
			zIndex: 300
		});
		olMap.olMap.addLayer(siteLayer);

		this.bindMiniMapInteraction(olMap, otherSitesLayer, siteLayer, siteData);

		this.olMap = olMap;

		this.sqs.siteReportManager.fetchSiteLocations().then(sites => {
			let features = [];
			sites.forEach(site => {
				if(site.site_id == siteData.site_id) {
					return;
				}
				features.push(new Feature({
					geometry: new Point(fromLonLat([site.longitude_dd, site.latitude_dd])),
					siteId: site.site_id,
					name: site.site_name
				}));
			});
			otherSitesSource.addFeatures(features);
			this.fitMiniMapToNearbySites(olMap, siteCoords, features);
		}).catch(error => {
			console.warn("Could not fetch the other sites for the site report map", error);
		});

		this.sqs.sqsEventListen("layoutResize", () => {
			this.olMap.olMap.updateSize();
		}, this);
	}

	/*
	* Function: getMiniMapClusterStyle
	*
	* A single site as a small point, a cluster as a bigger one with the number of sites in it.
	*/
	getMiniMapClusterStyle(feature) {
		let sitesNum = feature.get("features").length;
		let cacheKey = sitesNum > 1 ? sitesNum : "single";
		if(!this.miniMapClusterStyles[cacheKey]) {
			let clusterSizeText = sitesNum > 999 ? sitesNum.toString().substring(0, 1)+"k+" : sitesNum.toString();
			this.miniMapClusterStyles[cacheKey] = new Style({
				image: new CircleStyle({
					radius: sitesNum > 1 ? 8+(Math.log10(sitesNum)*8) : 5,
					stroke: new Stroke({
						color: "#fff",
						width: 1.5
					}),
					fill: new Fill({
						color: this.miniMapStyle.otherSitesColor
					})
				}),
				text: sitesNum > 1 ? new Text({
					text: clusterSizeText,
					offsetY: 1,
					fill: new Fill({
						color: "#fff"
					})
				}) : undefined
			});
		}
		return this.miniMapClusterStyles[cacheKey];
	}

	/*
	* Function: fitMiniMapToNearbySites
	*
	* Zooms the map in on the site, as far out as needed to also show its nearest neighbours,
	* but never so far out that the site is lost or so far in that the surroundings are.
	*/
	fitMiniMapToNearbySites(olMap, siteCoords, features, neighbourCount = 5) {
		if(features.length == 0) {
			return;
		}
		//Sites sharing this site's coordinates don't help show what's around it
		let distances = features.map(feature => {
			let coords = feature.getGeometry().getCoordinates();
			return Math.hypot(coords[0] - siteCoords[0], coords[1] - siteCoords[1]);
		}).filter(distance => distance > 1).sort((a, b) => a - b);
		if(distances.length == 0) {
			return;
		}
		let radius = distances[Math.min(neighbourCount, distances.length) - 1] * 1.2;

		let view = olMap.olMap.getView();
		view.fit([siteCoords[0] - radius, siteCoords[1] - radius, siteCoords[0] + radius, siteCoords[1] + radius], {
			padding: [20, 20, 20, 20],
			maxZoom: 10
		});
		if(view.getZoom() < 5) {
			view.setCenter(siteCoords);
			view.setZoom(5);
		}
	}

	/*
	* Function: bindMiniMapInteraction
	*
	* Clicking a site opens its site report and clicking a cluster zooms in on it. A cluster of sites
	* too close together to ever come apart, which happens when they share coordinates, lists them instead.
	*/
	bindMiniMapInteraction(olMap, otherSitesLayer, siteLayer, siteData) {
		let map = olMap.olMap;
		let maxClusterZoom = 15;

		let popupNode = $("<div class='map-popup-container site-report-map-popup'></div>");
		$("#site-report-map-container").append(popupNode);
		let popupOverlay = new Overlay({
			element: popupNode[0],
			positioning: "bottom-center",
			offset: [0, -17],
			autoPan: {
				margin: 50 //Clear of the base layer menu
			}
		});
		map.addOverlay(popupOverlay);

		let getFeatureAtPixel = (pixel, layer) => {
			let hit = null;
			map.forEachFeatureAtPixel(pixel, (feature) => {
				hit = feature;
				return true;
			}, {
				layerFilter: candidate => candidate === layer
			});
			return hit;
		};

		map.on("singleclick", (evt) => {
			popupOverlay.setPosition(undefined);
			popupNode.hide();

			//Looking past this site, at any sites underneath it that share its coordinates
			let cluster = getFeatureAtPixel(evt.pixel, otherSitesLayer);
			if(!cluster) {
				return;
			}
			let sites = cluster.get("features");
			if(sites.length == 1) {
				this.sqs.siteReportManager.renderSiteReport(sites[0].get("siteId"));
				return;
			}

			let extent = boundingExtent(sites.map(site => site.getGeometry().getCoordinates()));
			let view = map.getView();
			let extentInPixelsAtMaxZoom = Math.max(getWidth(extent), getHeight(extent)) / view.getResolutionForZoom(maxClusterZoom);
			if(extentInPixelsAtMaxZoom > otherSitesLayer.getSource().getDistance()) {
				view.fit(extent, {
					padding: [40, 40, 40, 40],
					maxZoom: maxClusterZoom,
					duration: 300
				});
				return;
			}

			popupNode.empty();
			popupNode.append($("<div class='sqs-label'></div>").text(sites.length+" sites here"));
			let listNode = $("<div class='site-report-map-popup-list'></div>");
			sites.sort((a, b) => String(a.get("name")).localeCompare(String(b.get("name")))).forEach(site => {
				let siteNode = $("<button type='button' class='site-report-map-popup-site'></button>").text(site.get("name"));
				siteNode.on("click", () => {
					this.sqs.siteReportManager.renderSiteReport(site.get("siteId"));
				});
				listNode.append(siteNode);
			});
			popupNode.append(listNode);
			popupNode.show();
			popupOverlay.setPosition(cluster.getGeometry().getCoordinates());
		});

		map.on("pointermove", (evt) => {
			if(evt.dragging) {
				return;
			}
			let viewport = map.getViewport();
			let cluster = getFeatureAtPixel(evt.pixel, otherSitesLayer);
			let titles = [];
			if(getFeatureAtPixel(evt.pixel, siteLayer)) {
				titles.push(siteData.site_name+" (this site)");
			}
			if(cluster) {
				let sites = cluster.get("features");
				titles.push(sites.length == 1 ? sites[0].get("name") : sites.length+" sites");
			}
			viewport.style.cursor = cluster ? "pointer" : "";
			if(titles.length > 0) {
				viewport.title = titles.join(" + ");
			}
			else {
				viewport.removeAttribute("title");
			}
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

		olMap.setMapBaseLayer("osm");
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
		
		let padding = 60;
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
		this.sqs.sqsEventUnlisten("layoutResize", this);
		this.sqs.sqsEventUnlisten("siteReportTabShown", this);
	}
}
export { BasicSiteInformation as default }
