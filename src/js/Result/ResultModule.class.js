import { nanoid } from "nanoid";
import "file-saver";
import "../../assets/loading-indicator5.svg";
import Config from "../../config/config.json";
import { saveAs } from "file-saver";

/*
* Class: ResultModule
*/
class ResultModule {
	/*
	* Function: constructor
	*/
	constructor(resultManager) {
		this.resultManager = resultManager;
		this.sqs = this.resultManager.sqs;
		this.active = true;
		this.name = "";
		this.data = [];
		this.requestId = 0;

		$(window).on("seadResultMenuSelection", (event, data) => {
			
		});
	}

	isVisible() {
		return true;
	}
	
	/*
	* Function: setActive
	*/
	setActive(active) {
		this.active = active;
	}

	render() {
		//window.alert(this.resultManager.getActiveModule());
		/*
		if(this.name != "taxon") {
			this.renderExportButton();
		}
		*/
	}

	unrender() {
	}

	exportDataDialog() {

	}

	bindExportModuleDataToButton(button, module = null) {

		let sitesExportCallback = () => {
			let downloadButtonId = "dl"+nanoid();
			let resultDataRows = this.data;

			if(typeof resultDataRows.rows != "undefined") {
				resultDataRows = resultDataRows.rows;
			}

			let html = "";
			if(resultDataRows.length > Config.maxAllowedSitesInAnExport) {
				html += "The maximum amount of sites you can export in one go is "+Config.maxAllowedSitesInAnExport+" and this result set contains "+resultDataRows.length+" sites.";
				html += "<br />";
				html += "Please try to narrow down your search and try again.";
			}
			else {
				html += "This export will contain "+resultDataRows.length+" sites and will be delivered as a zipped JSON file.<br />It might take some time to prepare depending on the number of sites.<br /><br /><br />";
				html += "<a id='"+downloadButtonId+"' class='light-theme-button'>Download Zipped JSON</a>";
			}
			
			this.sqs.dialogManager.showPopOver("Export sites", html);

			$("#"+downloadButtonId).on("click", (evt) => {
				
				let buttonHtml = "<div style='display:flex;align-items:center;'>";
				buttonHtml += "<img style='height:1em;width:1em;' src='/loading-indicator5.svg' />&nbsp;";
				buttonHtml += "Preparing...";
				buttonHtml += "</div>";
				$("#"+downloadButtonId).html(buttonHtml);

				let siteIds = [];
				resultDataRows.forEach(site => {
					let siteId = null;
					if(typeof site.site_link != "undefined") {
						siteId = site.site_link;
					}
					else {
						siteId = site.id;
					}
					siteIds.push(siteId);
				});
				
				fetch(Config.dataServerAddress+"/export/sites", {
					method: 'POST',
					mode: 'cors',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(siteIds)
				})
				.then(res => res.blob())
				.then(blob => {
					this.sqs.dialogManager.hidePopOver();
					saveAs(blob, "sites_export.zip");
				});

			});
		};

		
		if(module != null && typeof module.exportCallback == "function") {
			$(button).on("click", (evt) => {
				evt.stopPropagation();
				evt.preventDefault();
				module.exportCallback();
			});
		}
		else {
			$(button).on("click", (evt) => {
				evt.stopPropagation();
				evt.preventDefault();
				sitesExportCallback();
			});
		}

	}
	
}

export { ResultModule as default }