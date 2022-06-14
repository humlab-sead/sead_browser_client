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
		this.requestId = 0;
		this.data = [];

		$(window).on("seadResultMenuSelection", (event, data) => {
			
		});
	}
	/*
	* Function: setActive
	*/
	setActive(active) {
		this.active = active;
	}

	render() {
		//window.alert(this.resultManager.getActiveModule());
		if(this.name != "taxon") {
			this.renderExportButton();
		}
	}

	unrender() {
	}

	renderExportButton() {
		$("#result-export-button").on("click", (evt) => {
			evt.stopPropagation();
			evt.preventDefault();

			let downloadButtonId = "dl"+nanoid();

			let html = "";
			if(this.data.rows.length > Config.maxAllowedSitesInAnExport) {
				html += "The maximum amount of sites you can export in one go is "+Config.maxAllowedSitesInAnExport+" and this result set contains "+this.data.rows.length+" sites.";
				html += "<br />";
				html += "Please try to narrow down your search and try again.";
			}
			else {
				html += "This export will contain "+this.data.rows.length+" sites and will be delivered as a zipped JSON file.<br />It might take some time to prepare depending on the number of sites.<br /><br /><br />";
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
				this.data.rows.forEach(site => {
					siteIds.push(site.site_link);
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
		});
	}
	
}

export { ResultModule as default }