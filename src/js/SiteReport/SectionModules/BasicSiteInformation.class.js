/*OpenLayers imports*/
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

/*
* Class: BasicSiteInformation
*
 */

class BasicSiteInformation {
	constructor(hqs, siteId) {
		this.hqs = hqs;
		this.siteId = siteId;
		this.data = {};
		this.buildComplete = false;
		this.exportTryInterval = null;

		/*
		this.hqs.hqsEventListen("fetchBasicSiteInformation", () => {
            this.buildComplete = true;
			this.render();
			this.hqs.hqsEventDispatch("siteReportSiteInformationBuildComplete");
		}, this);
		*/
	}

	/*
	* Function: fetchBasicSiteInformation
	*
	* Fetches basic site information. Somehow that felt redundant to say. Anyhow, you probably don't want to call this directly. Look at fetch instead.
	*
	* See also:
	* fetch
	 */
	async fetch() {
		
		let p1 = new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/sites?site_id=eq."+this.siteId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					if(data.length == 0) {
						//Result set was empty - which means this site doesn't exist
						this.hqs.hqsEventDispatch("siteReportSiteNotFound");
						console.log("WARN: Site "+this.siteId+" does not exist.");
					}
					else {
						data = data[0];
						this.data.siteId = data.site_id;
						this.data.nationalSiteIdentifier = data.national_site_identifier;
						this.data.siteDescription = data.site_description;
						this.data.siteName = data.site_name;
						this.data.geo = {
							"altitude": data.altitude,
							"latitude": data.latitude_dd,
							"longitude": data.longitude_dd
						};
					}
					resolve(data);
				},
				error: () => {
					reject();
				}
			});
		});
		
		
		let p2 = new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/qse_site_locations?site_id=eq."+this.siteId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					//Locations for a site is normally a hierarchy of locations rather than separate locations, so we might get 3 results which
					//are city, municipality and country.
					this.data.locations = [];
					for(var key in data) {
						this.data.locations.push({
							"siteLocationId": data[key].site_location_id,
							"locationId": data[key].location_id,
							"locationName": data[key].location_name,
							"locationTypeId": data[key].location_type_id,
							"locationTypeName": data[key].location_type,
							"locationTypeDescription": data[key].description
						});
					}
					resolve(data);
				},
				error: () => {
					reject();
				}
			});
		});

		let p3 = new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/qse_site_biblio?site_id=eq."+this.siteId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					this.data.bibliographicReferences = data;
					resolve(data);
				},
				error: () => {
					reject();
				}
			});
		});
		
		await Promise.all([p1, p2, p3]);
		this.render();
	}
	
	/*
	* Function: render
	*
	*/
	render() {
		var data = this.data;
		var node = $(".site-report-title-site-name").html(this.data.siteName);
		this.hqs.tooltipManager.registerTooltip(node, "Name of the site as given by the data provider", {drawSymbol: true, placement: "top"});
		
		var exportLinksHtml = "";
		exportLinksHtml += "<ul class='site-report-export-links'>";
		exportLinksHtml += "<div class='site-report-export-btn' href=''><li class='light-theme-button'><i class=\"fa fa-download\" aria-hidden=\"true\" style='margin-right:5px;'></i><span style='float:right;'>Export all site data</span></li></div>";
		exportLinksHtml += "</ul>";
		
		
		var siteDecription = data.siteDescription;
		if(siteDecription == null) {
			siteDecription = "&lt;No data&gt;";
		}
		
		var node = $(".site-report-aux-info-container");
		node
			.append("<div class='site-report-aux-header-container'><h4>Site identifier</h4></div>")
			.append("<div class='site-report-aux-header-underline'></div>")
			.append("<div class='site-report-aux-info-text-container'>"+data.siteId+"</div>")
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
			.append("<div class='site-report-site-description site-report-description-text-container site-report-aux-info-text-container'>"+siteDecription+"</div>");
		
		
		$("#site-report-locations-container").append("<div id='site-report-map-container'></div>");
		
		var locationsContainer = $("#site-report-locations-container");
		for(var i = 0; i < data.locations.length; i++) {
			var el = $("<span>" + data.locations[i].locationName + "</span>");
			locationsContainer.append(el);
			this.hqs.tooltipManager.registerTooltip(el, data.locations[i].locationTypeDescription, {highlightAnchor: true});
			
			if (i+1 < data.locations.length) {
				locationsContainer.append(", ");
			}
		}
		
		$(".site-report-export-btn", node).on("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			
			if(this.exportTryInterval != null) {
				//This means an export is already pending and thus we should do absolutely nothing here
				return;
			}

			//Check here if the loading of the SR data is complete before doing anything else
			if(hqs.siteReportManager.siteReport.fetchComplete) {
				this.hqs.siteReportManager.siteReport.renderExportDialog(["json"]);
			}
			else {
				let node = $(".site-report-export-btn > li").append("<i class=\"fa fa-spinner\" aria-hidden=\"true\"></i>&nbsp;");
				$(".fa-spinner", node).css("animation", "spin 0.2s linear infinite");
				this.exportTryInterval = setInterval(() => {
					if(hqs.siteReportManager.siteReport.fetchComplete) {
						clearInterval(this.exportTryInterval);
						this.exportTryInterval = null;
						$(".site-report-export-btn .fa-spinner").remove();
						this.hqs.siteReportManager.siteReport.renderExportDialog(["json"]);
					}
				}, 200);
			}
		});
		
		this.renderMiniMap(data);
	}
	
	/*
	* Function: renderMiniMap
	*
	* Renders the little map which shows site position in the sidebar.
	*/
	renderMiniMap() {
		
		var siteData = this.data;
		
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
				center: fromLonLat([siteData.geo.longitude, siteData.geo.latitude]),
				zoom: 4
			})
		});
		
		var iconFeatures = [];
		
		var coords = transform([siteData.geo.longitude, siteData.geo.latitude], 'EPSG:4326', 'EPSG:3857');
		var iconFeature = new Feature({
			geometry: new Point(coords),
			name: siteData.siteName,
			population: 4000,
			rainfall: 500
		});
		
		iconFeatures.push(iconFeature);
		
		var vectorSource = new VectorSource({
			features: iconFeatures //add an array of features
		});
		
		
		var strokeColor = "#000000";
		var fillColor = css.auxColor;
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
		
		this.hqs.hqsEventListen("layoutResize", () => {
			this.olMap.updateSize();
		});
	}
	
	destroy() {
		this.hqs.hqsEventUnlisten("fetchBasicSiteInformation", this);
	}
}
export { BasicSiteInformation as default }