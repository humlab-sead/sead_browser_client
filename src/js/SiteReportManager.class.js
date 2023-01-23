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

		this.sqs.sqsEventListen("resultModuleRenderComplete", () => {
			if(this.sqs.resultManager.getActiveModule().name == "table" || this.sqs.resultManager.getActiveModule().name == "map") {
				$(".site-report-link").off("click").on("click", (event) => {
					var siteId = parseInt($(event.currentTarget).attr("site-id"));
					//window.location.href = "/site/"+siteId;
					this.renderSiteReport(siteId);
				});
			}
		});

		this.sqs.sqsEventListen("resultMapPopupRender", (data) => {
			$(".site-report-link").off("click").on("click", (event) => {
				var siteId = parseInt($(event.currentTarget).attr("site-id"));
				//window.location.href = "/site/"+siteId;
				this.renderSiteReport(siteId);
			});
		});
		
		/*
		this.sqs.sqsEventListen("siteReportClosed", () => {
			console.log("siteReportClosed button clicked");
			this.sqs.setActiveView("filters");

			let layoutMode = this.sqs.layoutManager.getMode();
			if(layoutMode == "mobileMode") {
				this.sqs.layoutManager.switchSection("right");
			}

			this.siteReport.hide();
			this.siteReportLayoutManager.destroy();
			this.siteReport.destroy();
			this.siteReport = null;
			console.log("site report close - push")
			history.pushState({}, "", "/");
			if(this.sqs.resultManager.activeModuleId == "none") {
				this.sqs.resultManager.activeModuleId = Config.defaultResultModule;
			}
			this.sqs.resultManager.setActiveModule(this.sqs.resultManager.activeModuleId);
		});
		*/

		this.sqs.sqsEventListen("siteReportClosed", () => {
			console.log("siteReportClosed");
			history.pushState({}, "", "/");
		});
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
	
	renderSiteReport(siteId, updateHistory = true) {
		console.log("Rendering siteReport for site:", siteId);
		if(updateHistory) {
			var stateObj = {};
			history.pushState(stateObj, "", "/site/"+siteId);
		}
		
		//This XHR is just for checking if the site with this ID actually exist
		var xhr1 = this.sqs.pushXhr(null, "checkIfSiteExists");
		xhr1.xhr = $.ajax(this.sqs.config.siteReportServerAddress+"/sites?site_id=eq."+siteId, {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				if(data.length == 0) {
					this.sqs.dialogManager.showPopOver("Not found", "The requested site ("+siteId+") does not exist.")
				}
				else {
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
	}

	unrenderSiteReport() {
		$("#site-report-panel").hide();

		//$("#filter-view-main-container").css("display", "flex");
		$("#filter-view-main-container").animate({
			left: "0vw"
		}, this.animationTime, this.animationEasing);
		

		$(".site-report-container").animate({
			left: "100vw"
		}, this.animationTime, this.animationEasing, () => {
			$(".site-report-container").hide();
		});
		
		$("#site-report-exit-menu").animate({
			left: "-100px"
		}, 250, () => {
			this.sqs.menuManager.removeMenu(this.siteReport.backMenu);
			
		});
		
		//If the site report was the entry point, no result module will be selected or rendered, so we need to fix that here...
		if(this.sqs.resultManager.getActiveModule() === false) {
			this.sqs.resultManager.setActiveModule("map", true);
		}

		this.sqs.sqsEventDispatch("siteReportClosed"); //Also fun fact: This is called from a function which calls this function - recursion...
		this.sqs.setActiveView("filters");
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
	
	sqsMenu() {
		return {
			title: "<i class=\"fa fa-arrow-circle-o-left\" style='font-size: 1.5em' aria-hidden=\"true\"></i>",
			anchor: "#site-report-exit-menu",
			visible: false,
			customStyleClasses: "site-report-exit-menu",
			callback: () => {
				this.unrenderSiteReport();
			}
		};
	}
}

export { SiteReportManager as default }