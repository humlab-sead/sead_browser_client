import SiteReport from './SiteReport/SiteReport.class';
//import Config from "../config/config.js";

/*
* Class: SiteReportManager
 */

class SiteReportManager {
	constructor(sqs) {
		this.sqs = sqs;
		this.siteReport = null;
		this.siteReportsEnabled = true;
		this.debugMode = false;

		/*
		this.sqs.sqsEventListen("resultModuleRenderComplete", () => {
			if(this.sqs.resultManager.getActiveModule().name == "table" || this.sqs.resultManager.getActiveModule().name == "map") {
				$(".site-report-link").off("click").on("click", (event) => {
					var siteId = parseInt($(event.currentTarget).attr("site-id"));
					//window.location.href = "/site/"+siteId;
					this.renderSiteReport(siteId);
				});
			}
		});
		*/

		this.sqs.sqsEventListen("resultMapPopupRender", (data) => {
			$(".site-report-link").off("click").on("click", (event) => {
				var siteId = parseInt($(event.currentTarget).attr("site-id"));
				//window.location.href = "/site/"+siteId;
				this.renderSiteReport(siteId);
			});
		});

		this.sqs.sqsEventListen("siteReportClosed", () => {
			console.log("siteReportClosed");
			this.siteReport.destroy();
		});
	}

	toggleDebug() {
		this.debugMode = !this.debugMode;
		if(this.siteReport) {
			this.siteReport.toggleDebug(this.debugMode);
		}
	}
	
	sqsOffer(offerName, offerData) {
		if(this.siteReportsEnabled) {
			if(offerName == "resultTableData") {
				$("tbody > tr", offerData.node).each((index, el) => {
					let siteId = offerData.data.rows[index].site_link;
					$(el).addClass("site-report-link");
					$(el).attr("site-id", siteId);
				});
			}
			if(offerName == "resultMapPopupSites") {
				var r = $(offerData.tableRows);
				var html = "";
				r.each((index, el) => {
					let siteId = $(el).attr("row-site-id");
					$(el).addClass("site-report-link");
					$(el).attr("site-id", siteId);
					html += $(el)[0].outerHTML;
				});
				offerData.tableRows = html;
			}
		}
		
		return offerData;
	}
	
	/*
	* Function: fetchSiteLocations
	*
	* Every site that has coordinates, for the map in the site report. Fetched once and then reused,
	* so going from one site report to the next doesn't fetch them again.
	*/
	fetchSiteLocations() {
		if(!this.siteLocationsPromise) {
			this.siteLocationsPromise = new Promise((resolve, reject) => {
				$.ajax(this.sqs.config.siteReportServerAddress+"/tbl_sites?select=site_id,site_name,latitude_dd,longitude_dd&latitude_dd=not.is.null&longitude_dd=not.is.null", {
					method: "get",
					dataType: "json",
					success: (data) => {
						resolve(data);
					},
					error: (xhr, textStatus, errorThrown) => {
						//Let the next site report try again
						this.siteLocationsPromise = null;
						reject(errorThrown);
					}
				});
			});
		}
		return this.siteLocationsPromise;
	}

	renderSiteReport(siteId, updateHistory = true) {
		if(updateHistory) {
			var stateObj = {};
			history.pushState(stateObj, "", "/site/"+siteId);
		}

		if(this.sqs.seoManager) {
			this.sqs.seoManager.setSiteMeta(siteId);
		}
		
		//This XHR is just for checking if the site with this ID actually exist
		var xhr1 = this.sqs.pushXhr(null, "checkIfSiteExists");
		xhr1.xhr = $.ajax(this.sqs.config.siteReportServerAddress+"/tbl_sites?site_id=eq."+siteId, {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				if(data.length == 0) {
					this.sqs.dialogManager.showPopOver("Not found", "The requested site ("+siteId+") does not exist.")
					if(this.sqs.seoManager) {
						this.sqs.seoManager.setNotFoundMeta("/site/"+siteId);
					}
				}
				else {
					let siteName = data[0].site_name || data[0].name || data[0].site || null;
					if(this.sqs.seoManager) {
						this.sqs.seoManager.setSiteMeta(siteId, siteName);
					}

					//Yay - it exists, so go ahead and render, if system is ready...
					if(this.sqs.systemReady) {
						this.sqs.setActiveView("siteReport");
						this.siteReport = new SiteReport(this, siteId);
					}
					else {
						setTimeout(() => {
							this.renderSiteReport(siteId, false);
						}, 100);
					}
				}
				
				this.sqs.popXhr(xhr1);
			}
		});

		this.sqs.matomoTrackPageView("Site report");
	}

	unrenderSiteReport() {
		$("#site-report-main-container").hide();
		$("#site-report-main-container").css("display", "none");

		//$("#filter-view-main-container").css("display", "flex");
		$("#filter-view-main-container").animate({
			left: "0vw"
		}, this.animationTime, this.animationEasing);
		

		$(".site-report-container").animate({
			left: "100vw"
		}, this.animationTime, this.animationEasing, () => {
			$(".site-report-container").hide();
		});
		
		//If the site report was the entry point, no result module will be selected or rendered, so we need to fix that here...
		if(this.sqs.resultManager.getActiveModule() === false) {
			this.sqs.resultManager.setActiveModule(this.sqs.config.defaultResultModule, true);
		}

		this.sqs.sqsEventDispatch("siteReportClosed");
		this.sqs.setActiveView("filters");
		this.sqs.sqsEventDispatch("layoutResize");

		this.sqs.matomoTrackPageView("Filter view");
	}
	
	/*
	* Function: getResultSiteIds
	*
	* The sites in the current result, in the order the result view shows them, so a site report
	* can step to the previous and next one. Empty when there is no result yet.
	*/
	getResultSiteIds() {
		let module = this.sqs.resultManager ? this.sqs.resultManager.getActiveModule() : false;
		if(!module || typeof module.getResultSiteIds != "function") {
			return [];
		}
		return module.getResultSiteIds();
	}

	/*
	* Function: getSiteIdFromUrl
	*
	* Returns:
	* A site ID if the URL contains one, otherwise false.
	*/
	getSiteIdFromUrl() {
		var siteId = false;
		var urlPath = window.location.pathname.split("/");
		if(urlPath[1] == "site" && typeof(urlPath[2]) != "undefined") {
			siteId = urlPath[2];
		}
		return siteId;
	}
	
	getReportState() {
		//this.siteReport outlives the report being closed, so whether one is showing is a question for the view
		var state = {
			active: this.siteReport != null && this.sqs.activeView == "siteReport"
		};
		
		if(state.active) {
			state.siteId = this.siteReport.siteId;
		}
		
		return state;
	}
	
}

export { SiteReportManager as default }
