import { nanoid } from "nanoid";
import "file-saver";
import "../../assets/loading-indicator5.svg";
import Config from "../../config/config.json";
import { saveAs } from "file-saver";
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import AbundanceData from "./DatahandlingModules/AbundanceData.class.js";
import DatingData from "./DatahandlingModules/DatingData.class.js";
import DendroCeramicsData from "./DatahandlingModules/DendroCeramicsData.class.js";
import IsotopeData from "./DatahandlingModules/IsotopeData.class.js";
import MeasuredValuesData from "./DatahandlingModules/MeasuredValuesData.class.js";
import EntityAgesData from "./DatahandlingModules/EntityAgesData.class.js";

import SiteExportWorker from '../Workers/SiteExport.worker.js';
import DatasetExportWorker from '../Workers/DatasetExport.worker.js';

import "@nobleclem/jquery-multiselect";
import "@nobleclem/jquery-multiselect/jquery.multiselect.css";


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

	getSQL() {
		return this.sql;
	}

	setExportButtonLoadingIndicator(active = true) {
		if(active) {
			$("#result-container .result-export-button").append("<div class='cute-little-loading-indicator'></div>");
		}
		else {
			$("#result-container .result-export-button .cute-little-loading-indicator").remove();
		}
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

	async unrender() {
	}

	exportDataDialog() {

	}

	/*
	async fetchSites(siteIds) {
		return await fetch(Config.dataServerAddress+"/export/sites", {
			method: 'POST',
			mode: 'cors',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(siteIds)
		}).then(res => res.json());
	}
	*/

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

	getSelectedMethodIdsForExport() {
		let methodIds = $("#export-datasets").val();
					
		if(methodIds && methodIds.length > 0) {
			methodIds = methodIds.map((id) => parseInt(id));
		}
		else {
			methodIds = [];
		}

		return methodIds;
	}

	bindExportModuleDataToButton(button, module = null) {

		let sitesExportCallback = async () => {

			module.setExportButtonLoadingIndicator();

			let jsonDownloadButtonId = "json-dl-"+nanoid();
			let csvDownloadButtonId = "csv-dl-"+nanoid();
			let xlsxDownloadButtonId = "xlsx-dl-"+nanoid();
			let sqlDownloadButtonId = "sql-dl-"+nanoid();
			
			let selectedSites = this.data.rows ? this.data.rows : this.data;

			if(module != null && typeof module.getSelectedSites == "function") {
				selectedSites = module.getSelectedSites();
			}
			
			const template = document.getElementById('exportOptionsTemplate');
			if (!template) {
				console.error("Export options template not found!");
				return;
			}

			const clone = document.importNode(template.content, true);

			const numSitesSpan = clone.querySelector('[data-num-sites]');
			if (numSitesSpan) {
				numSitesSpan.textContent = selectedSites.length;
			}

			//fetch dataset summaries for selected sites to see what is available for export
			let datasetSummaries = await this.fetchDatasetSummaries(selectedSites);
			datasetSummaries.sort((a, b) => {
				if(!a.method_name) { //FIXME: Hotfix due to missing method_id 174.
					return 1;
				}
				return a.method_name.localeCompare(b.method_name);
			});

			const selectElement = clone.getElementById('export-datasets');
			if (selectElement) {
				// Clear existing options (if any)
				selectElement.innerHTML = '';
				// Add new options from your data
				datasetSummaries.forEach(option => {
					const opt = document.createElement('option');
					opt.value = option.method_id;
					opt.textContent = option.method_name+" ("+option.siteCount+" sites, "+option.datasetCount+" datasets)";
					selectElement.appendChild(opt);
				});
			}

			if(selectedSites.length == 0) {
				//this.sqs.dialogManager.showPopOver("Export sites", "No sites selected!");
				this.sqs.notificationManager.notify("No sites selected!", "warning");
			}
			else {
				this.sqs.dialogManager.showPopOver("Export sites", clone);
			}

			$('#export-datasets option').prop('selected', true);
			$('#export-datasets').multiselect({
				search: true,
				maxPlaceholderOpts: 1,
				selectAll: true,
				texts: {
					placeholder: 'Select options'
				}
			});

			// Close multiselect when clicking outside
			$(document).on('mousedown', function(event) {
				// Check if the click is outside any open multiselect menu
				if (
					!$(event.target).closest('.ms-options-wrap').length &&
					!$(event.target).closest('.ms-options').length
				) {
					$('.ms-options-wrap.ms-active .ms-options-wrap').each(function() {
						$(this).removeClass('ms-active');
					});
					// Or simply:
					$('.ms-options-wrap.ms-active').removeClass('ms-active');
				}
			});
			
			module.setExportButtonLoadingIndicator(false);

			if(selectedSites.length > 0) {
				$("#sites-export-xlsx-dl").on("click", () => {
					this.exportFullSitesAsXlsx(selectedSites, this.getSelectedMethodIdsForExport()).then(() => {});
				});

				$("#sites-export-csv-dl").on("click", () => {
					this.exportFullSitesAsCsv(selectedSites, this.getSelectedMethodIdsForExport()).then(() => {});
				});

				$("#sites-export-json-dl").on("click", () => {
					this.exportFullSitesAsJson(selectedSites, this.getSelectedMethodIdsForExport()).then(() => {});
				});

				$("#xlsx-dl").on("click", () => { this.exportSitesAsXlsx(selectedSites); });

				$("#csv-dl").on("click", async () => { this.exportSitesAsCsv(selectedSites); });

				$("#json-dl").on("click", async () => { this.exportSitesAsJson(selectedSites); });

				$("#"+sqlDownloadButtonId).on("click", async () => {
					let currentModule = this.resultManager.getActiveModule();
					const formattedSQL = currentModule.sql.replace(/\n/g, "<br/>");
					this.sqs.dialogManager.showPopOver("Result SQL", formattedSQL);
				});

				$("#dataset-dl").on("click", async () => {
					if(this.exportInProgress) {
						this.sqs.notificationManager.notify("An export is already in progress. Please wait for it to finish.", "info");
						return;
					}
					this.exportInProgress = true;
					
					$("#dataset-dl").append(`<div class="cute-little-loading-indicator"></div>`);
					$("#export-progress-bar-container").css("display", "block");

					let methodId = parseInt($("#export-datasets").val());
					console.log(methodId);

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
							$("#export-progress-bar-container").css("display", "none");
							$(".export-progress-bar-fill").css({
								width: "0%"
							});
							$("#dataset-dl").find(".cute-little-loading-indicator").remove();
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
			this.sqs.notificationManager.notify("SEAD currently lacks support for exporting these type of datasets.", "warning");
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
	
		let siteExportCsv = "\uFEFF"; // Byte Order Mark (BOM) to force Excel to open the file with UTF-8 encoding
		siteExportCsv += `"Id","Name","National site identifier","Latitude","Longitude","Description"\r\n`;
	
		// Updated sanitizeForCsv function
		let sanitizeForCsv = (str) => {
			if (str == null) {
				return '""'; // Return empty quotes if the value is null or undefined
			}
			str = str.toString(); // Ensure the value is a string
			if (str.startsWith('"') && str.endsWith('"')) {
				// If already wrapped in quotes, return as-is
				return str;
			}
			// Otherwise, wrap in quotes and replace any existing double quotes with escaped quotes
			return `"${str.replace(/"/g, '""')}"`;
		};
	
		sitesExportData.forEach(site => {
			// Sanitize each value in the object
			site.site_name = sanitizeForCsv(site.site_name);
			site.site_description = sanitizeForCsv(site.site_description);
			site.national_site_identifier = sanitizeForCsv(site.national_site_identifier);
	
			// Add the sanitized values to the CSV string
			siteExportCsv += `${sanitizeForCsv(site.site_id)},${site.site_name},${site.national_site_identifier},${sanitizeForCsv(site.latitude_dd)},${sanitizeForCsv(site.longitude_dd)},${site.site_description}\r\n`;
		});
	
		this.sqs.dialogManager.hidePopOver();
	
		const bytes = new TextEncoder().encode(siteExportCsv);
		const blob = new Blob([bytes], {
			type: "text/csv;charset=utf-8"
		});
		saveAs(blob, "sead_sites_export.csv");
	}

	async fetchSites(siteIds) {
		this.sqs.sqsEventUnlisten("exportProgress");
		this.sqs.sqsEventListen("exportProgress", (evt, data) => {
			//FIXME: This doesn't work, because the rendering loop is blocked by the processsing. We need to conver the processing code to a web worker.
			//console.log(data.methodName);
			//$("#export-progress-bar-container .status-msg").text(data.methodName);
		});

		return new Promise((resolve, reject) => {
			if(this.exportInProgress) {
				this.sqs.notificationManager.notify("An export is already in progress. Please wait for it to finish.", "info");
				return;
			}
			this.exportInProgress = true;
			$("#export-progress-bar-container").css("display", "block");

			const worker = new SiteExportWorker();
			// Handle messages from the worker
			worker.onmessage = async (e) => {
				const { type, progress, total, results } = e.data;

				if (type === 'progress') {
					$(".export-progress-bar-fill").css({
						width: (progress / total * 100)+"%"
					});

					if (progress == total) {
						//$("#export-progress-bar-container .status-msg").text("Formatting data...");
					}
					else {
						$("#export-progress-bar-container .status-msg").text("Fetching data...");
					}
				}

				if (type === 'complete') {
					$("#export-progress-bar-container").css("display", "none");
					$(".export-progress-bar-fill").css({
						width: "0%"
					});
					this.exportInProgress = false;
					resolve(results);
				}
			};

			// Start the worker with the necessary data
			worker.postMessage({
				methods: this.getSelectedMethodIdsForExport(),
				selectedSites: siteIds,
				dataServerAddress: Config.dataServerAddress
			});
		});
	}

	async exportFullSitesAsJson(siteIds, methodIds = []) {
		console.log("Exporting full sites as JSON");

		let sites = await this.fetchSites(siteIds);
		let jsonData = JSON.stringify(sites, null, 2);
		this.sqs.dialogManager.hidePopOver();
		const bytes = new TextEncoder().encode(jsonData);
		const blob = new Blob([bytes], {
			type: "application/json;charset=utf-8"
		});
		saveAs(blob, "sead_sites_export.json");
	}
	
	async exportFullSitesAsXlsx(siteIds, methodIds = []) {
		console.log("Exporting full sites as XLSX");

		let sites = await this.fetchSites(siteIds);
		let objectUrl = await this.sqs.exportManager.getXlsxBookExport(sites, true, methodIds);
		const a = document.createElement("a");
		a.href = objectUrl;
		a.download = "sead_sites_export.xlsx";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	async exportFullSitesAsCsv(siteIds, methodIds = []) {
		console.log("Exporting full sites as CSV");
		let sites = await this.fetchSites(siteIds);
		let objectUrl = await this.sqs.exportManager.getCsvExportOfSites(sites, methodIds);
		const a = document.createElement("a");
		a.href = objectUrl;
		a.download = "sead_sites_export.zip";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	async exportSitesAsXlsx(siteIds) {
		let workbook = new ExcelJS.Workbook();
		let worksheet = workbook.addWorksheet('SEAD Data');
	  
		let sitesExportData = await this.fetchExportData(siteIds);
	  
		// Adding header rows
		worksheet.addRow(["Content", "List of sites"]);
		worksheet.addRow(["Description", this.sqs.config.dataExportDescription]);
		worksheet.addRow(["url", Config.serverRoot]);
		worksheet.addRow(["Attribution", Config.dataAttributionString]);
		worksheet.addRow([]); // Empty row
		worksheet.addRow([
		  "Site Id",
		  "Site name",
		  "National site identifier",
		  "Latitude",
		  "Longitude",
		  "Description"
		]);
	  
		// Adding data rows
		sitesExportData.forEach(site => {
		  worksheet.addRow([
			site.site_id,
			site.site_name,
			site.national_site_identifier,
			site.latitude_dd,
			site.longitude_dd,
			site.site_description
		  ]);
		});
		

		// Writing the workbook to a Blob
		const buffer = await workbook.xlsx.writeBuffer();
		const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
	  
		// Create a download link and trigger the download
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "sead_sites_export.xlsx";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);
	}
	
	
}

export { ResultModule as default }