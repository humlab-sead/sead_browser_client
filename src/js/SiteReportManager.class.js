import SiteReport from './SiteReport/SiteReport.class';
import Config from "../config/config.js";

/*
* Class: SiteReportManager
 */

class SiteReportManager {
	constructor(hqs) {
		this.hqs = hqs;
		this.siteReport = null;
		this.siteReportsEnabled = true;

		this.hqs.hqsEventListen("resultModuleRenderComplete", () => {
			if(this.hqs.resultManager.getActiveModule().name == "table" || this.hqs.resultManager.getActiveModule().name == "map") {
				$(".site-report-link").off("click").on("click", (event) => {
					var siteId = parseInt($(event.currentTarget).attr("site-id"));
					this.renderSiteReport(siteId);
				});
			}
		});

		this.hqs.hqsEventListen("resultMapPopupRender", (data) => {
			$(".site-report-link").off("click").on("click", (event) => {
				var siteId = parseInt($(event.currentTarget).attr("site-id"));
				this.renderSiteReport(siteId);
			});
		});
		
		this.hqs.hqsEventListen("siteReportClosed", () => {
			this.hqs.setActiveView("filters");
			this.siteReportLayoutManager.destroy();
			this.siteReport.destroy();
			this.siteReport = null;
			history.pushState({}, "", "/");
			if(this.hqs.resultManager.activeModuleId == "none") {
				this.hqs.resultManager.activeModuleId = Config.defaultResultModule;
			}
			this.hqs.resultManager.setActiveModule(this.hqs.resultManager.activeModuleId);
		});
	}
	
	hqsOffer(offerName, offerData) {
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
	
	renderSiteReport(siteId, updateHistory = true) {
		if(updateHistory) {
			var stateObj = {};
			history.pushState(stateObj, "", "/site/"+siteId);
		}
		
		//This XHR is just for checking if the site with this ID actually exist
		var xhr1 = this.hqs.pushXhr(null, "checkIfSiteExists");
		xhr1.xhr = $.ajax(this.hqs.config.siteReportServerAddress+"/sites?site_id=eq."+siteId, {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				if(data.length == 0) {
					this.hqs.dialogManager.showPopOver("Not found", "The requested site ("+siteId+") does not exist.")
				}
				else {
					//Yay - it exists, so go ahead and render, if system is ready...
					if(this.hqs.systemReady) {
						this.siteReport = new SiteReport(this, siteId);
					}
					else {
						setTimeout(() => {
							this.renderSiteReport(siteId, false);
						}, 100);
					}
				}
				
				this.hqs.popXhr(xhr1);
			}
		});
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
		var state = {
			active: this.siteReport != null ? true : false
		};
		
		if(state.active) {
			state.siteId = this.siteReport.siteId;
		}
		
		return state;
	}
	
	hqsMenu() {
		return {
			title: "<i class=\"fa fa-arrow-circle-o-left\" style='font-size: 1.5em' aria-hidden=\"true\"></i>",
			anchor: "#site-report-exit-menu",
			visible: false,
			callback: () => {
				this.siteReport.hide();
			}
		};
	}
}

export { SiteReportManager as default }