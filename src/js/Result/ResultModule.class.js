import { nanoid } from "nanoid";
import "file-saver";
import "../../assets/loading-indicator5.svg";
import Config from "../../config/config.json";
import { saveAs } from "file-saver";
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs/dist/exceljs.min.js';

import AbundanceData from "./DatahandlingModules/AbundanceData.class.js";
import DatingData from "./DatahandlingModules/DatingData.class.js";
import DendroCeramicsData from "./DatahandlingModules/DendroCeramicsData.class.js";
import IsotopeData from "./DatahandlingModules/IsotopeData.class.js";
import MeasuredValuesData from "./DatahandlingModules/MeasuredValuesData.class.js";
import EntityAgesData from "./DatahandlingModules/EntityAgesData.class.js";

import DatasetExportWorker from '../Workers/DatasetExport.worker.js';


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

		this.dataModules = [];
		this.dataModules.push(new AbundanceData(this.sqs));
		this.dataModules.push(new DendroCeramicsData(this.sqs));
		this.dataModules.push(new DatingData(this.sqs));
		this.dataModules.push(new IsotopeData(this.sqs));
		this.dataModules.push(new MeasuredValuesData(this.sqs));
		this.dataModules.push(new EntityAgesData(this.sqs));

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

		let sitesExportCallback = async () => {
			let jsonDownloadButtonId = "json-dl-"+nanoid();
			let csvDownloadButtonId = "csv-dl-"+nanoid();
			let xlsxDownloadButtonId = "xlsx-dl-"+nanoid();
			let sqlDownloadButtonId = "sql-dl-"+nanoid();
			
			let selectedSites = this.data.rows ? this.data.rows : this.data;

			if(module != null && typeof module.getSelectedSites == "function") {
				selectedSites = module.getSelectedSites();
			}

			let html = "";	
			html += "This export will contain "+selectedSites.length+" sites.<br /><br />";

			html += "<h3>Export list of sites</h3>";
			html += "<a id='"+xlsxDownloadButtonId+"' class='light-theme-button'>Download XLSX</a>";
			html += "<a id='"+csvDownloadButtonId+"' class='light-theme-button'>Download CSV</a>";
			html += "<a id='"+jsonDownloadButtonId+"' class='light-theme-button'>Download JSON</a>";
			html += "<a id='"+sqlDownloadButtonId+"' class='light-theme-button'>View SQL</a>";

			//fetch dataset summaries for selected sites to see what is available for export
			let datasetSummaries = await this.fetchDatasetSummaries(selectedSites);

			datasetSummaries.sort((a, b) => {
				return a.method_name.localeCompare(b.method_name);
			});

			html += "<br /><br /><hr />";
			let aggregatedExportButtonId = "dataset-dl-"+nanoid();
			html += "<h3>Export datasets</h3>";
			html += "<select id='export-datasets'>";

			datasetSummaries.forEach((summary) => {
				html += "<option value='"+summary.method_id+"'>"+summary.method_name+" ("+summary.siteCount+" sites, "+summary.datasetCount+" datasets)</option>";
			});
			html += "</select><br /><br />"
			html += "<div id='export-controls-container'>";
			html += `<a id='`+aggregatedExportButtonId+`' class='light-theme-button dataset-export-btn'>Dataset Export</a>`;
			html += `<div id='export-progress-bar-container'>
				<div class='export-progress-bar-fill'></div>
			</div>`;
			html += "</div>";
			
			if(selectedSites.length == 0) {
				html = "No sites selected!";
			}

			this.sqs.dialogManager.showPopOver("Export sites", html);

			if(selectedSites.length > 0) {
				$("#"+xlsxDownloadButtonId).on("click", () => { this.exportSitesAsXlsx(selectedSites); });

				$("#"+csvDownloadButtonId).on("click", async () => { this.exportSitesAsCsv(selectedSites); });

				$("#"+jsonDownloadButtonId).on("click", async () => { this.exportSitesAsJson(selectedSites); });

				$("#"+sqlDownloadButtonId).on("click", async () => {
					let currentModule = this.resultManager.getActiveModule();
					const formattedSQL = currentModule.sql.replace(/\n/g, "<br/>");
					this.sqs.dialogManager.showPopOver("Result SQL", formattedSQL);
				});

				$("#"+aggregatedExportButtonId).on("click", async () => {
					if(this.exportInProgress) {
						this.sqs.notificationManager.notify("An export is already in progress. Please wait for it to finish.", "info");
						return;
					}
					this.exportInProgress = true;
					
					$("#"+aggregatedExportButtonId).append(`<div class="cute-little-loading-indicator"></div>`);
					$("#export-progress-bar-container").css("visibility", "visible");

					let methodId = parseInt($("#export-datasets").val());

					const worker = new DatasetExportWorker();
					// Handle messages from the worker
					worker.onmessage = (e) => {
						const { type, progress, total, results } = e.data;

						if (type === 'progress') {
							$(".export-progress-bar-fill").css({
								width: (progress / total * 100)+"%"
							});
						}

						if (type === 'complete') {
							this.getDatagroupsAsXlsx(methodId, results); // Use the results
							$("#export-progress-bar-container").css("visibility", "hidden");
							$(".export-progress-bar-fill").css({
								width: "0%"
							});
							$("#"+aggregatedExportButtonId).find(".cute-little-loading-indicator").remove();
							this.exportInProgress = false;
						}
					};

					// Start the worker with the necessary data
					worker.postMessage({
						methodId: methodId,
						selectedSites: selectedSites,
						dataServerAddress: Config.dataServerAddress
					});
					
				 });
			}
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
	
	addMagneticSusceptibilityDatasetsToXlsxTable(table, datasets) {
		table.columns.push({ header: 'MS unburned', key: 'ms_unburned', width: 20});
		table.columns.push({ header: 'MS burned', key: 'ms_burned', width: 20});

		datasets.forEach((dataset) => {
			let unburnedAnalysisEntities = dataset.analysis_entities.filter((ae) => {
				return ae.prepMethods && ae.prepMethods.includes(82) == false;
			});
			let burnedAnalysisEntities = dataset.analysis_entities.filter((ae) => {
				return ae.prepMethods && ae.prepMethods.includes(82);
			});

			let writtenPhysicalSampleIds = [];
			unburnedAnalysisEntities.forEach((ae) => {
				let row = [dataset.site_id, dataset.dataset_name, ae.sample_name, ae.measured_values[0].measured_value];

				//find corresponding burned value by physical_sample_id
				burnedAnalysisEntities.forEach((bae) => {
					if(bae.physical_sample_id == ae.physical_sample_id) {
						row.push(bae.measured_values[0].measured_value);
					}
				});

				writtenPhysicalSampleIds.push(ae.physical_sample_id);

				table.rows.push(row);
			});

			//now do the same for the burnedAnalysisEntities, since it is possible that we could have a burned value without an unburned value
			burnedAnalysisEntities.forEach((ae) => {
				if(!writtenPhysicalSampleIds.includes(ae.physical_sample_id)) {
					let row = [dataset.site_id, dataset.dataset_name, ae.sample_name, null, ae.measured_values[0].measured_value];
					table.rows.push(row);
				}
			});
		});
	}

	addStandardDatasetsToXlsxTable(table, datasets) {

	}

	async getReferenceTable(sites) {

		let columns = [
			'Reference type',
			'Reference ID', 
			'Biblio UUID', 
			'DOI', 
			'Authors',
			'ISBN',
			'Notes',
			'Title',
			'Year',
			'Full reference', 
			'Bugs reference', 
			'URL', 
			'Date updated',
		];
		let rows = [];

		let sampleGroupBiblioIds = new Set();
		let biblioIds = new Set();
		let contactIds = new Set();
		
		//site references
		sites.forEach((site) => {
			site.biblio.forEach(bib => {
				let row = [
					'Site reference',
					bib.biblio_id,
					bib.biblio_uuid,
					bib.doi,
					bib.authors,
					bib.isbn,
					bib.notes,
					bib.title,
					bib.year,
					bib.full_reference,
					bib.bugs_reference,
					bib.url,
					bib.date_updated,
				];
				rows.push(row);
			})
		});

		//sample group references
		sites.forEach((site) => {
			site.sample_groups.forEach((sampleGroup) => {
				sampleGroup.biblio.forEach((biblio) => {
					sampleGroupBiblioIds.add(biblio.biblio_id);
				});
			});
		});

		
		Array.from(sampleGroupBiblioIds).forEach((biblioId) => {
			let biblioIdFound = false;
			sites.forEach((site) => {
				site.lookup_tables.biblio.forEach((biblio) => {
					if(biblio.biblio_id == biblioId) {
						biblioIdFound = true;
						let row = [
							'Sample group reference',
							biblio.biblio_id,
							biblio.biblio_uuid,
							biblio.doi,
							biblio.authors,
							biblio.isbn,
							biblio.notes,
							biblio.title,
							biblio.year,
							biblio.full_reference,
							biblio.bugs_reference,
							biblio.url,
							biblio.date_updated,
						];
						rows.push(row);
					}
				});
			});
			if(!biblioIdFound) {
				console.warn("Sample group reference not found for biblio_id", biblioId);
			}
		});

		//dataset references
		sites.forEach((site) => {
			site.datasets.forEach((dataset) => {
				if(dataset && dataset.biblio_id) {
					biblioIds.add(dataset.biblio_id);
				}
				if(dataset && dataset.contacts.length > 0 ) {
					dataset.contacts.forEach((contact) => {
						contactIds.add(contact.contact_id);
					});
				}
			});
		});


		Array.from(biblioIds).forEach((biblioId) => {
			let biblioIdFound = false;
			sites.forEach((site) => {
				site.lookup_tables.biblio.forEach((biblio) => {
					if(biblio.biblio_id == biblioId) {
						biblioIdFound = true;
						let row = [
							'Dataset reference',
							biblio.biblio_id,
							biblio.biblio_uuid,
							biblio.doi,
							biblio.authors,
							biblio.isbn,
							biblio.notes,
							biblio.title,
							biblio.year,
							biblio.full_reference,
							biblio.bugs_reference,
							biblio.url,
							biblio.date_updated,
						];
						rows.push(row);
					}
				});
			});
			if(!biblioIdFound) {
				console.warn("Dataset reference not found for biblio_id", biblioId);
			}
		});

		return { columns: columns, rows: rows };
	}

	async getDatagroupsAsXlsx(methodId, sites) {
		for(let key in sites) {
			let site = sites[key];
			site.data_groups = site.data_groups.filter(dataGroup => dataGroup !== null);
		}

		let tables = [];
		this.dataModules.forEach((dataModule) => {
			tables.push(dataModule.getDataAsTable(methodId, sites));
		});
		
		let allNull = true;
		let workbook = new ExcelJS.Workbook();
		
		tables.forEach((table) => {
			if(table != null) {
				let datasetWorksheet = workbook.addWorksheet(table.name);
				datasetWorksheet.columns = table.columns;
				table.rows.forEach((row) => {
					datasetWorksheet.addRow(row);
				});
				allNull = false;
			}
		});

		let refWorksheet = workbook.addWorksheet("References");
		let references = await this.getReferenceTable(sites);

		let columns = references.columns.map((column) => {
			return { header: column, key: column, width: 20};
		});
		refWorksheet.columns = columns;

		refWorksheet.rows = [];
		references.rows.forEach((row) => {
			refWorksheet.addRow(row);
		});

		let metaWorksheet = workbook.addWorksheet("SEAD metadata");
		metaWorksheet.columns = [
			{ header: 'Description', key: 'description', width: 20},
			{ header: 'SEAD browser URL', key: 'url', width: 50},
			{ header: 'SEAD Attribution', key: 'attribution', width: 50},
			{ header: 'Date of export', key: 'date_of_export', width: 10},
			{ header: 'SEAD browser version', key: 'version', width: 10}
		];

		metaWorksheet.addRow([
			this.sqs.config.dataExportDescription, 
			Config.serverRoot, 
			Config.dataAttributionString,
			new Date().toISOString(),
			Config.version	
		]);

		if(allNull) {
			console.warn("No data found for export");
			this.sqs.notificationManager.notify("SEAD was unable to export these datasets.", "error");
			return;
		}
		workbook.xlsx.writeBuffer().then((buffer) => {
			saveAs(new Blob([buffer], { type: 'application/octet-stream' }), 'sead_datasets_export.xlsx');
		});
	}

	async getDatasetsAsXlsx(datasets) {
		//generate an xlsx from the datasets
		console.log(datasets);

		let table = {
			columns: [
				{ header: 'Site ID', key: 'site_id', width: 10},
				{ header: 'Dataset name', key: 'dataset_name', width: 30},
				{ header: 'Sample name', key: 'sample_name', width: 30},
			],
			rows: []
		}
		
		let datasetMethodId = null;
		if(datasets.length > 0) {
			if(!datasets[0].method_id && datasets[0].data_groups && datasets[0].data_groups.length > 0 && datasets[0].data_groups[0].method_id) {
				datasetMethodId = datasets[0].data_groups[0].method_id;
			}
			else {
				datasetMethodId = datasets[0].method_id;
			}
		}
		else {
			console.warn("No datasets found for export");
			return;
		}

		if(datasetMethodId == 33) {
			 this.addMagneticSusceptibilityDatasetsToXlsxTable(table, datasets);
		}
		else if(datasetMethodId == 10) {
			console.warn("BUT THIS IS DENDRO!!")
	   	}
		else {
			table.columns.push({ header: 'Value',  key: 'value', width: 20});

			datasets.forEach((dataset) => {
				console.log(dataset);

				/*
				if(dataset.data_group && dataset.data_groups.method_id == 10) {
					dataset.data_group.datasets.forEach(dgds => {
						dgds.id;
						dgds.label;
						dgds.value;
					});
				}
				*/

				/*
				if(dataset.analysis_entities) {
					dataset.analysis_entities.forEach((ae) => {
						if(ae.measured_values) {
							let row = [dataset.site_id, dataset.dataset_name, ae.sample_name, ae.measured_values[0].measured_value];
							table.rows.push(row);
						}
						else {
							console.warn("No measured values found for analysis entity", ae)
						}
					});
				}
				*/
				
			});
		}

		console.log(table);
		
		let workbook = new ExcelJS.Workbook();
		let datasetWorksheet = workbook.addWorksheet("Datasets");
		
		datasetWorksheet.columns = table.columns;

		table.rows.forEach((row) => {
			datasetWorksheet.addRow(row);
		});

		workbook.xlsx.writeBuffer().then((buffer) => {
			saveAs(new Blob([buffer], { type: 'application/octet-stream' }), 'sead_datasets_export.xlsx');
		});
		
	}

	getMeasuredValueDatasetExport(dataset) {
		let table = {
			columns: [
				{ name: 'Measured value' }
			],
			rows: []
		};

		let foundPrepMethod550 = false;
		dataset.analysis_entities.forEach((ae) => {
			if(ae.prepMethods && ae.prepMethods.includes(82)) {
				foundPrepMethod550 = true;
			}
		});

		if(foundPrepMethod550) {
			table.columns.shift();
			table.columns.push({ name: 'Unburned measured value' });
			table.columns.push({ name: 'Burned measured value' });

			let unburnedAanalysisEntities = dataset.analysis_entities.filter((ae) => {
				return ae.prepMethods && ae.prepMethods.includes(82) == false;
			});
			let burnedAanalysisEntities = dataset.analysis_entities.filter((ae) => {
				return ae.prepMethods && ae.prepMethods.includes(82);
			});

			unburnedAanalysisEntities.forEach((ae) => {
				let row = [dataset.site_id, dataset.dataset_name, ae.sample_name, ae.measured_values[0].measured_value];

				//find corresponding burned value by physical_sample_id
				burnedAanalysisEntities.forEach((bae) => {
					if(bae.physical_sample_id == ae.physical_sample_id) {
						row.push(bae.measured_values[0].measured_value);
					}
				});

				table.rows.push(row);
			});
		}
		else {
			dataset.analysis_entities.forEach((ae) => {
				let row = [dataset.site_id, dataset.dataset_name, ae.sample_name, ae.measured_values[0].measured_value];
				table.rows.push(row);
			});
		}

		console.log(table);

		return table;
	}


	async fetchDatasetSummaries(siteIds) {
		return await fetch(Config.dataServerAddress+"/datasetsummaries", {
			method: 'POST',
			mode: 'cors',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(siteIds)
		}).then(res => res.json());
	
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

		let siteExportCsv = "\uFEFF"; //Byte Order Mark (BOM) to force Excel to open the file with UTF-8 encoding
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