import SiteReport from './SiteReport/SiteReport.class';

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
        });
	}
	
	hqsOffer(offerName, offerData) {
		if(this.siteReportsEnabled) {
			if(offerName == "resultTableData") {
	            for(var key in offerData.data.rows) {
	                var siteLinkId = offerData.data.rows[key].site_link;
	                //offerData.data.rows[key].site_link = "<span class='site-report-link' site-id='"+siteLinkId+"'>"+siteLinkId+"</span>";
		            offerData.data.rows[key].site_link = "<span class='site-report-link' site-id='"+siteLinkId+"'><i class=\"fa-chevron-circle-right\" aria-hidden=\"true\"></i></span>";
	            }
			}
			if(offerName == "resultMapPopupSites") {
	            var r = $(offerData.tableRows);
	            var html = "";
	            r.each((index, el) => {
					let siteId = $(el).attr("row-site-id");
					$(el).addClass("site-report-link");
					$(el).attr("site-id", siteId);
					$(el).append("<td><i class=\"fa fa-chevron-circle-right\" aria-hidden=\"true\"></i></td>");
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
		xhr1.xhr = $.ajax(this.hqs.config.siteReportServerAddress+"/site?site_id=eq."+siteId, {
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