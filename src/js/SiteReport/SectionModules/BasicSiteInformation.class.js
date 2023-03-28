/*OpenLayers imports*/
import { nanoid } from 'nanoid';
import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { OSM as OSMSource } from 'ol/source';
import { Group as GroupLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import {fromLonLat, transform} from 'ol/proj.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import css from '../../../stylesheets/style.scss';
import * as Plotly from "plotly.js";
import DatingToPeriodDataset from './DatasetModules/DatingToPeriodDataset.class';

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

		/*
		let siteReferencesHtml = this.renderReferences(siteData.bibliographicSiteReferences);
		let datasetReferencesHtml = this.renderReferences(siteData.bibliographicDatasetReferences);
		*/

		let datasetReferencesHtml = "";
		// DISABLED - because of how dataset references are done for dendro sites, just have a look and you'll see what I'm talking about
		siteData.datasets.forEach(dataset => {
			datasetReferencesHtml += this.renderDatasetReference(dataset);
		});
		

		let siteReferencesHtml = "";

		siteData.biblio.forEach(siteRef => {
			siteReferencesHtml += "<div class='site-reference-box'>";

			if(siteRef.authors) {
				siteReferencesHtml += siteRef.authors+", ";
			}
			if(siteRef.title) {
				siteReferencesHtml += "<span style='font-style:italic;'>"+siteRef.title+"</span>, ";
			}
			if(siteRef.year) {
				siteReferencesHtml += siteRef.year+", ";
			}
			if(siteRef.isbn) {
				siteReferencesHtml += "<br />ISBN "+siteRef.isbn;
			}

			siteReferencesHtml += "</div>";
		});

		

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
			.append("<div id='site-report-time-overview'></div>")
			.append("<div class='site-report-aux-header-container'><h4>Dataset references</h4></div>")
			.append("<div class='site-report-aux-header-underline'></div>")
			.append("<div class='site-report-site-description site-report-aux-info-text-container'>"+datasetReferencesHtml+"</div>")
			.append("<div class='site-report-aux-header-container'><h4>Site references</h4></div>")
			.append("<div class='site-report-aux-header-underline'></div>")
			.append("<div class='site-report-site-description site-report-aux-info-text-container'>"+siteReferencesHtml+"</div>");
			
		
		$("#site-report-locations-container").append("<div id='site-report-map-container'></div>");

		var locationsContainer = $("#site-report-locations-container");
		for(var i = 0; i < siteData.location.length; i++) {
			var el = $("<span>" + siteData.location[i].location_name + "</span>");
			locationsContainer.append(el);
			this.sqs.tooltipManager.registerTooltip(el, "<div style='font-weight:bold'>"+siteData.location[i].location_type+"</div><div>"+siteData.location[i].location_description+"</div>", {highlightAnchor: true});
			
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

		/*
		setTimeout(() => { //FIXME: this is obviously terrible, but we need to wait for the DatingToPeriodDataset module to do its thing
			this.renderTimeOverview("site-report-time-overview");
		}, 500);
		*/
	}


	renderTimeOverview2(targetAnchorQuery) {
		// Define the geochronology and c14 dating ranges
		var geochronologyData = [
			{range: [100, 200], color: 'rgb(0, 0, 255)'},
			{range: [300, 400], color: 'rgb(0, 0, 255)'},
			{range: [600, 800], color: 'rgb(0, 0, 255)'}
		];
		
		var c14Data = [
			{range: [50, 80], color: 'rgb(255, 0, 0)'},
			{range: [200, 250], color: 'rgb(255, 0, 0)'},
			{range: [400, 500], color: 'rgb(255, 0, 0)'},
			{range: [700, 750], color: 'rgb(255, 0, 0)'}
		];
		
		// Create the trace for the geochronology bars
		var geoTrace = {
			x: geochronologyData.map(d => d.range),
			y: geochronologyData.map((d, i) => i),
			type: 'bar',
			orientation: 'h',
			marker: {
			color: geochronologyData.map(d => d.color)
			},
			hovertemplate: 'Range: %{x[0]} - %{x[1]}<extra></extra>'
		};
		
		// Create the trace for the c14 bars
		var c14Trace = {
			x: c14Data.map(d => d.range),
			y: c14Data.map((d, i) => i + geochronologyData.length),
			type: 'bar',
			orientation: 'h',
			marker: {
			color: c14Data.map(d => d.color)
			},
			hovertemplate: 'Range: %{x[0]} - %{x[1]}<extra></extra>'
		};
		
		// Set the layout of the chart
		var layout = {
			title: 'Dating Ranges',
			xaxis: {
			title: 'Years',
			range: [0, 1000]
			},
			yaxis: {
			title: 'Dating Type',
			tickvals: geochronologyData.map((d, i) => i + 0.5).concat(c14Data.map((d, i) => i + geochronologyData.length + 0.5)),
			ticktext: geochronologyData.map(d => 'Geochronology').concat(c14Data.map(d => 'C14'))
			},
			barmode: 'overlay'
		};
		
		// Create the chart
		var data = [geoTrace, c14Trace];
		Plotly.newPlot(targetAnchorQuery, data, layout);
	}

	//using the an array of the standardAge format, create a timeline chart using plotly where each ageType is represented as lines along the x axis with different colors
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
		})

		const standardAges = siteDatingSummary;

		console.log(standardAges);

		let traces = [];

		standardAges.forEach(standardAge => {
			let found = false;
			traces.forEach(trace => {
				if(trace.ageType == standardAge.ageType) {
					trace.standardAges.push(standardAge);
					found = true;
				}
			});

			if(!found) {
				traces.push({
					ageType: standardAge.ageType,
					standardAges: [standardAge]
				});
			}
		});

		let colors = this.sqs.color.getColorScheme(traces.length);

		let plotlyTraces = [];
		traces.forEach(trace => {
			let plotlyTrace = {
				x: [],
				y: [],
				base: [],
				type: 'bar',
				orientation: 'h',
				marker: {
				  color: colors[traces.indexOf(trace)],
				  opacity: 0.5
				},
				name: trace.ageType
			};

			trace.standardAges.forEach(standardAge => {
				plotlyTrace.x.push(standardAge.ageOlder - standardAge.ageYounger);
				plotlyTrace.y.push(standardAge.ageType);
				plotlyTrace.base.push(standardAge.ageOlder);
			});

			plotlyTraces.push(plotlyTrace);
		});


		console.log(plotlyTraces)

		var layout = {
			title: 'Timeline Chart',
			//barmode: 'overlay',
			xaxis: {
			  type: 'linear'
			},
			yaxis: {
			  showticklabels: false
			},
			showlegend: true
		  };
		  
		  Plotly.newPlot(targetAnchorQuery, plotlyTraces, layout);
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

	renderDatasetReference(dataset) {
		
		//NOTE: This is a temporary hack
		//if the method is 10 (dendro), we don't render dataset referenes, since they end up being far too many
		//we need a proper fix for this further on
		if(dataset.method_id == 10) {
			return "";
		}

		let siteData = this.data;
		let out = "";
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

		return out;
	}
	
	exportSite() {
		let jsonBtn = this.sqs.siteReportManager.siteReport.getExportButton("json", this.sqs.siteReportManager.siteReport.siteData);

		let dialogNodeId = nanoid();
		let dialogNode = $("<div id='node-"+dialogNodeId+"' class='dialog-centered-content-container'></div>");
		this.sqs.dialogManager.showPopOver("Site data export", "<br />"+dialogNode.prop('outerHTML'));

		$("#node-"+dialogNodeId).append(jsonBtn);
	}

	/*
	* Function: renderMiniMap
	*
	* Renders the little map which shows site position in the sidebar.
	*/
	renderMiniMap(siteData) {
		$("#site-report-map-container").html("");

		this.olMap = new Map({
			controls: [],
			target: 'site-report-map-container',
			layers: new GroupLayer({
				layers: [
					new TileLayer({
						source: new OSMSource(),
						visible: true
					})
				]
			}),
			view: new View({
				center: fromLonLat([parseFloat(siteData.longitude_dd), parseFloat(siteData.latitude_dd)]),
				zoom: 4
			})
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
		
		
		var strokeColor = "#000000";
		//var fillColor = css.auxColor;
		let fillColor = "#ff6600";
		var iconStyle = new Style({
			image: new CircleStyle({
				radius: 5,
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