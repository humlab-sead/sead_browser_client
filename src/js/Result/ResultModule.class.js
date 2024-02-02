import { nanoid } from "nanoid";
import "file-saver";
import "../../assets/loading-indicator5.svg";
import Config from "../../config/config.json";
import { saveAs } from "file-saver";
import XLSX from 'xlsx';
import ExcelJS from 'exceljs/dist/exceljs.min.js';

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

	async fetchExportData(siteIds) {
		return await fetch(Config.dataServerAddress+"/export/bulk/sites", {
			method: 'POST',
			mode: 'cors',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(siteIds)
		}).then(res => res.json());
	}

	bindExportModuleDataToButton(button, module = null) {

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

			$("#"+xlsxDownloadButtonId).on("click", async (evt) => {
				let dataRows = [];

				//get only the id attribute of each result data row
				let siteIds = resultDataRows.map(site => site.id);
				let sitesExportData = await this.fetchExportData(siteIds);

				dataRows.push(["Content", "List of sites"]);
				dataRows.push(["Description", this.sqs.config.dataExportDescription]);
				dataRows.push(["url", Config.serverRoot]);
				dataRows.push(["Attribution", Config.dataAttributionString]);
				dataRows.push([]);
				dataRows.push([
					"Site Id",
					"Site name",
					"National site identifier",
					"Latitude",
					"Longitude",
					"Description"
				]);

				sitesExportData.forEach(site => {
					dataRows.push([
						site.site_id,
						site.site_name,
						site.national_site_identifier,
						site.latitude_dd,
						site.longitude_dd,
						site.site_description
					]);
				});
				
				var ws_name = "SEAD Data";
				var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(dataRows);
				//add worksheet to workbook
				XLSX.utils.book_append_sheet(wb, ws, ws_name);
				//write workbook
				XLSX.writeFile(wb, "sead_sites_export.xlsx");
			});

			$("#"+csvDownloadButtonId).on("click", async (evt) => {

				let siteIds = resultDataRows.map(site => site.id);
				let sitesExportData = await this.fetchExportData(siteIds);

				let siteExportCsv = "";
				siteExportCsv += "Id,Name,National site identifier,Latitude,Longitude,Description\r\n";

				let sanitizeForCsv = (str) => {
					if(str == null) {
						return null;
					}
					return '"'+str.replace(/"/g, "'")+'"';
				}

				sitesExportData.forEach(site => {
					site.site_name = sanitizeForCsv(site.site_name);
					site.site_description = sanitizeForCsv(site.site_description);
					site.national_site_identifier = sanitizeForCsv(site.national_site_identifier);

					siteExportCsv += site.site_id+","+site.site_name+","+site.national_site_identifier+","+site.latitude_dd+","+site.longitude_dd+","+site.site_description+"\r\n";
				});

				this.sqs.dialogManager.hidePopOver();
				const bytes = new TextEncoder().encode(siteExportCsv);
				const blob = new Blob([bytes], {
					type: "text/csv;charset=utf-8"
				});
				saveAs(blob, "sead_sites_export.csv");
			});

			$("#"+jsonDownloadButtonId).on("click", async (evt) => {

				let siteIds = resultDataRows.map(site => site.id);
				let sitesExportData = await this.fetchExportData(siteIds);

				let siteExportJson = [];
				sitesExportData.forEach(site => {
					siteExportJson.push({
						site_id: site.site_id,
						name: site.site_name,
						national_site_identifier: site.national_site_identifier,
						lat: site.latitude_dd,
						lng: site.longitude_dd,
						description: site.site_description
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