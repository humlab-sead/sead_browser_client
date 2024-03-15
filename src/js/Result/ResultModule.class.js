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
			
			let selectedSites = this.data.rows ? this.data.rows : this.data;

			if(module != null && typeof module.getSelectedSites == "function") {
				selectedSites = module.getSelectedSites();
			}

			let html = "";
			
			/*
			if(selectedSites.length > Config.maxAllowedSitesInAnExport) {
				html += "The maximum amount of sites you can export in one go is "+Config.maxAllowedSitesInAnExport+" and this result set contains "+selectedSites.length+" sites.";
				html += "<br />";
				html += "Please try to narrow down your search and try again.";
			}
			else {
				html += "This export will contain "+selectedSites.length+" sites and will be delivered as a zipped JSON file.<br />It might take some time to prepare depending on the number of sites.<br /><br /><br />";
				html += "<a id='"+downloadButtonId+"' class='light-theme-button'>Download Zipped JSON</a>";
			}
			*/
			

			html += "This export will contain "+selectedSites.length+" sites.<br /><br />";
			html += "<a id='"+xlsxDownloadButtonId+"' class='light-theme-button'>Download XLSX</a>";
			html += "<a id='"+csvDownloadButtonId+"' class='light-theme-button'>Download CSV</a>";
			html += "<a id='"+jsonDownloadButtonId+"' class='light-theme-button'>Download JSON</a>";
			
			this.sqs.dialogManager.showPopOver("Export sites", html);

			$("#"+xlsxDownloadButtonId).on("click", () => { this.exportSitesAsXlsx(selectedSites); });

			$("#"+csvDownloadButtonId).on("click", async () => { this.exportSitesAsCsv(selectedSites); });

			$("#"+jsonDownloadButtonId).on("click", async () => { this.exportSitesAsJson(selectedSites); });
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

	async exportSitesAsJson(siteIds) {
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
	}

	async exportSitesAsCsv(siteIds) {
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
	}

	async exportSitesAsXlsx(siteIds) {
		let dataRows = [];

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
	}
	
}

export { ResultModule as default }