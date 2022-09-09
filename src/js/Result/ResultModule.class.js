import { nanoid } from "nanoid";
import "file-saver";
import "../../assets/loading-indicator5.svg";
import Config from "../../config/config.json";
import { saveAs } from "file-saver";
import XLSX from 'xlsx';

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

		/*
		console.log(button, module, this.data);
		return;
		*/

		let sitesExportCallback = () => {
			let jsonDownloadButtonId = "json-dl-"+nanoid();
			let csvDownloadButtonId = "csv-dl-"+nanoid();
			let xlsxDownloadButtonId = "xlsx-dl-"+nanoid();
			let resultDataRows = this.data;

			if(typeof resultDataRows.rows != "undefined") {
				resultDataRows = resultDataRows.rows;
			}

			let html = "";
			/*
			if(resultDataRows.length > Config.maxAllowedSitesInAnExport) {
				html += "The maximum amount of sites you can export in one go is "+Config.maxAllowedSitesInAnExport+" and this result set contains "+resultDataRows.length+" sites.";
				html += "<br />";
				html += "Please try to narrow down your search and try again.";
			}
			else {
				html += "This export will contain "+resultDataRows.length+" sites and will be delivered as a zipped JSON file.<br />It might take some time to prepare depending on the number of sites.<br /><br /><br />";
				html += "<a id='"+downloadButtonId+"' class='light-theme-button'>Download Zipped JSON</a>";
			}
			*/

			html += "This export will contain "+resultDataRows.length+" sites.<br /><br />";
			html += "<a id='"+xlsxDownloadButtonId+"' class='light-theme-button'>Download XLSX</a>";
			html += "<a id='"+csvDownloadButtonId+"' class='light-theme-button'>Download CSV</a>";
			html += "<a id='"+jsonDownloadButtonId+"' class='light-theme-button'>Download JSON</a>";
			
			this.sqs.dialogManager.showPopOver("Export sites", html);

			$("#"+xlsxDownloadButtonId).on("click", (evt) => {
				let dataRows = [];

				dataRows.push(["Content", "List of sites"]);
				dataRows.push(["Description", "Data export from the SEAD project. Visit https://www.sead.se for more information."]);
				dataRows.push(["url", Config.serverRoot]);
				dataRows.push(["Attribution", Config.siteReportExportAttributionString]);
				dataRows.push([]);
				dataRows.push([
					"Site Id",
					"Site name",
					"Latitude",
					"Longitude"
				]);

				resultDataRows.forEach(site => {
					let siteId = null;
					if(typeof site.site_link != "undefined") {
						siteId = site.site_link;
					}
					else {
						siteId = site.id;
					}
					dataRows.push([
						siteId,
						site.title,
						site.lat,
						site.lng
					]);
				});
				
				var ws_name = "SEAD Data";
				var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(dataRows);
				//add worksheet to workbook
				XLSX.utils.book_append_sheet(wb, ws, ws_name);
				//write workbook
				XLSX.writeFile(wb, "sead_sites_export.xlsx");
				
			});

			$("#"+csvDownloadButtonId).on("click", (evt) => {
				let siteExportCsv = "";
				siteExportCsv += "Id,Name,Latitude,Longitude\r\n";
				resultDataRows.forEach(site => {
					let siteId = null;
					if(typeof site.site_link != "undefined") {
						siteId = site.site_link;
					}
					else {
						siteId = site.id;
					}
					siteExportCsv += siteId+","+site.title+","+site.lat+","+site.lng+"\r\n";
				});
				this.sqs.dialogManager.hidePopOver();
				const bytes = new TextEncoder().encode(siteExportCsv);
				const blob = new Blob([bytes], {
					type: "text/csv;charset=utf-8"
				});
				saveAs(blob, "sead_sites_export.csv");
			});

			$("#"+jsonDownloadButtonId).on("click", (evt) => {
				let siteExportJson = [];
				resultDataRows.forEach(site => {
					let siteId = null;
					if(typeof site.site_link != "undefined") {
						siteId = site.site_link;
					}
					else {
						siteId = site.id;
					}
					siteExportJson.push({
						site_id: siteId,
						lat: site.lat,
						lng: site.lng,
						name: site.title
					});
				});
				this.sqs.dialogManager.hidePopOver();
				let jsonData = JSON.stringify(siteExportJson, null, 2);
				const bytes = new TextEncoder().encode(jsonData);
				const blob = new Blob([bytes], {
					type: "application/json;charset=utf-8"
				});
				saveAs(blob, "sead_sites_export.json");
			});

			
			/*
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
			*/
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