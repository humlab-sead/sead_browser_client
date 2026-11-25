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

//An XLSX export of more sites than this gets a notice that it will take a while
const SDF_LARGE_EXPORT_SITES = 100;
//How often a running XLSX export job is asked for its progress
const SDF_JOB_POLL_MS = 1000;
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
		let exportButtons = $("#result-section .result-export-button");
		exportButtons.attr("aria-busy", active ? "true" : "false");

		exportButtons.each(function() {
			let button = $(this);
			let indicator = button.find(".result-export-button-loading-indicator");

			if(active) {
				if(indicator.length === 0) {
					button.append(`<div class="result-export-button-loading-indicator cute-little-loading-indicator-white"></div>`);
				}
				button.addClass("is-loading");
			}
			else {
				button.removeClass("is-loading");
				indicator.remove();
			}
		});
	}

	isVisible() {
		return true;
	}

	/*
	* Function: getSiteCount
	* How many sites the current result holds, or null when there is nothing to count yet.
	* Each module keeps its result in a shape of its own, so each answers for itself; this
	* default covers a module whose data is a plain list of sites.
	*/
	getSiteCount() {
		return Array.isArray(this.data) ? this.data.length : null;
	}

	/*
	* Function: getResultSiteIds
	* The ids of the sites in the current result, in the order they are shown. This default covers
	* a module whose data is a plain list of sites.
	*/
	getResultSiteIds() {
		return Array.isArray(this.data) ? this.data.map(site => site.id) : [];
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

	/*
	* Function: fetchSiteList
	*
	* The site list export's rows, one per site (JSON API server, /export/site_list): site_id, site_name,
	* latitude, longitude, altitude, national_site_identifier, domain, sample_groups_num, samples_num,
	* plus url, the site's page in this SEAD instance. The domain is the site's main domain, the one the
	* result map colours it by.
	*/
	async fetchSiteList(siteIds) {
		const response = await fetch(Config.dataServerAddress+"/export/site_list", {
			method: 'POST',
			mode: 'cors',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(this.normalizeSiteIds(siteIds))
		});
		if(!response.ok) {
			throw new Error("the server returned "+response.status);
		}
		const rows = await response.json();
		rows.forEach(row => {
			row.url = Config.serverRoot+"/site/"+row.site_id;
		});
		return rows;
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

	/*
	* Function: selectExportFormat
	*
	* Marks a format as chosen in the "Export sites" dialog and shows what goes with it: its
	* description, the download button, and the dataset selection for the formats that use it.
	* The XLSX export always contains every dataset, so it gets no dataset selection.
	* With "Site list only" as the content, every format holds the same table of sites, so the
	* dialog describes that instead, and has no datasets to choose or size to warn about.
	*/
	selectExportFormat(format) {
		let content = this.getSelectedExportContent();
		$(".sites-export-format-btn").each((i, btn) => {
			$(btn).toggleClass("selected", $(btn).attr("data-export-format") == format);
		});
		$(".sites-export-format-description").each((i, desc) => {
			$(desc).toggle(content == "all" && $(desc).attr("data-export-format") == format);
		});
		$(".sites-export-content-description").each((i, desc) => {
			$(desc).toggle($(desc).attr("data-export-content") == content);
		});
		$(".sites-export-datasets").toggle(content == "all" && (format == "csv" || format == "json"));

		//The XLSX workbook is built on the server. It takes any number of sites, unless the server
		//is set up with a limit (sitesExportMaxSites); a large one takes a while, which is said up front.
		let sdfExport = content == "all" && format == "xlsx";
		let tooManySites = sdfExport && this.sitesExportMaxSites != null && this.sitesExportSiteCount > this.sitesExportMaxSites;
		let largeExport = sdfExport && !tooManySites && this.sitesExportSiteCount > SDF_LARGE_EXPORT_SITES;
		let notice = "";
		if(tooManySites) {
			notice = "The XLSX export can hold at most "+this.sitesExportMaxSites+" sites, and "+this.sitesExportSiteCount+" are selected. Use filters to narrow down the selection, or choose CSV or JSON.";
		}
		else if(largeExport) {
			notice = "This is a large export: "+this.sitesExportSiteCount.toLocaleString("en")+" sites in one workbook. "
				+"Building it can take a minute or more and the file can be over 100 MB; a progress bar shows how far it has come. "
				+"Excel holds at most about a million rows, so if the selection has more, you will be told how many sites to export at a time.";
		}
		$(".sites-export-limit-notice")
			.text(notice)
			.toggle(tooManySites || largeExport);
		$("#sites-export-dl")
			.toggleClass("disabled", tooManySites)
			.attr("aria-disabled", tooManySites ? "true" : "false")
			.css("display", "inline-flex");
	}

	/*
	* Function: getSelectedExportContent
	*
	* What the "Export sites" dialog is set to export: "all" (all data, the default) or "sites" (the site list).
	*/
	getSelectedExportContent() {
		return $("input[name='sites-export-content']:checked").val() == "sites" ? "sites" : "all";
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
			let [datasetSummaries, sdfMaxSites] = await Promise.all([
				this.fetchDatasetSummaries(selectedSites),
				this.fetchSdfMaxSites()
			]);
			this.sitesExportSiteCount = selectedSites.length;
			this.sitesExportMaxSites = sdfMaxSites;
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

				datasetSummaries.sort((a, b) => {
					if (a.method_name < b.method_name) return -1;
					if (a.method_name > b.method_name) return 1;
					return 0;
				});

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
				this.sqs.dialogManager.showPopOverFragment("Export sites", clone, {
					popOverClass: "sites-export-popover"
				});
			}

			$('#export-datasets option').prop('selected', true);
			$('#export-datasets').multiselect({
				search: true,
				minHeight: 0,
				maxHeight: 260,
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
				$("#samples-export-xlsx-dl").on("click", () => {
					this.exportFullSamplesAsXlsx(selectedSites, this.getSelectedMethodIdsForExport()).then(() => {});
				});

				$("#sites-export-xlsx-dl").on("click", () => {
					this.exportFullSitesAsXlsx(selectedSites, this.getSelectedMethodIdsForExport()).then(() => {});
				});

				$(".sites-export-format-btn").on("click", (evt) => {
					this.selectExportFormat($(evt.currentTarget).attr("data-export-format"));
				});
				$("input[name='sites-export-content']").on("change", () => {
					this.selectExportFormat($(".sites-export-format-btn.selected").attr("data-export-format"));
				});
				this.selectExportFormat("xlsx");

				$("#sites-export-dl").on("click", () => {
					if($("#sites-export-dl").hasClass("disabled")) {
						return;
					}
					let format = $(".sites-export-format-btn.selected").attr("data-export-format");
					if(this.getSelectedExportContent() == "sites") {
						this.exportSiteList(selectedSites, format);
						return;
					}
					if(format == "xlsx") {
						this.exportSitesAsSdfXlsx(selectedSites);
					}
					if(format == "csv") {
						this.exportFullSitesAsCsv(selectedSites, this.getSelectedMethodIdsForExport()).then(() => {});
					}
					if(format == "json") {
						this.exportFullSitesAsJson(selectedSites, this.getSelectedMethodIdsForExport()).then(() => {});
					}
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

	normalizeSiteIds(sites) {
		let ids = (sites || []).map((site) => {
			if(site == null) {
				return null;
			}
			if(typeof site == "object") {
				return site.site_id ?? site.id ?? site.site_link_filtered ?? null;
			}
			return site;
		}).map((value) => parseInt(value)).filter((value) => Number.isInteger(value) && value > 0);

		return Array.from(new Set(ids));
	}

	/*
	* Function: exportSitesAsSdfXlsx
	*
	* Downloads the given sites as a SEAD Data Format (SDF) workbook. The server builds the finished
	* .xlsx (plans/sead-data-format-design.html, D17); the file is saved exactly as received, since
	* any re-processing here could break the row fingerprints the importer relies on.
	* Called from the "Export sites" dialog when XLSX is the chosen format, and from the site
	* report's "Export all site data" dialog, which passes its own button for the loading indicator.
	*/
	async exportSitesAsSdfXlsx(sites, button = "#sites-export-dl") {
		let siteIds = this.normalizeSiteIds(sites);
		if(siteIds.length === 0) {
			this.sqs.notificationManager.notify("No sites selected!", "warning");
			return;
		}

		if(this.exportInProgress) {
			this.sqs.notificationManager.notify("An export is already in progress. Please wait for it to finish.", "info");
			return;
		}
		this.exportInProgress = true;

		$(button).append(`<div class="cute-little-loading-indicator"></div>`);
		this.showSdfProgress("Starting the export...", 0);
		$("#export-progress-bar-container").css("display", "block");

		let job = null;
		$("#export-progress-cancel").show().off("click").on("click", () => {
			if(job) {
				job.cancelled = true;
				fetch(Config.dataServerAddress+"/sdf/export/jobs/"+job.id, { method: "DELETE" }).catch(() => {});
			}
			this.showSdfProgress("Cancelling...", null);
		});

		try {
			//The server builds the workbook as a job: it answers at once, and is asked for its
			//progress until the file is ready, so a large export gets a real progress bar.
			const started = await this.sdfJobRequest(fetch(Config.dataServerAddress+"/sdf/export/jobs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteIds: siteIds })
			}));
			job = { id: started.id, cancelled: false };

			let status = started;
			while(status.state == "queued" || status.state == "running") {
				if(job.cancelled) {
					break;
				}
				this.showSdfJobStatus(status);
				await new Promise(resolve => setTimeout(resolve, SDF_JOB_POLL_MS));
				status = await this.sdfJobRequest(fetch(Config.dataServerAddress+"/sdf/export/jobs/"+job.id));
			}

			if(job.cancelled || status.state == "cancelled") {
				job.cancelled = true;
				throw new Error("cancelled");
			}
			if(status.state == "failed") {
				throw new Error(status.error && status.error.error ? status.error.error : "the server could not build the workbook");
			}

			$("#export-progress-cancel").hide();
			const response = await fetch(Config.dataServerAddress+"/sdf/export/jobs/"+job.id+"/file");
			if(!response.ok) {
				await this.sdfJobRequest(Promise.resolve(response));
			}
			const blob = await this.readSdfResponse(response);
			saveAs(blob, this.sdfFilename(response, siteIds));
		}
		catch(error) {
			//once cancelled, whatever the job says next (often that it is gone) is the cancel
			if(job && job.cancelled) {
				this.sqs.notificationManager.notify("The Excel export was cancelled.", "info");
			}
			else {
				console.error("SDF Excel export failed", error);
				this.sqs.notificationManager.notify("Excel export failed: "+(error && error.message ? error.message : "unknown error"), "error");
			}
		}
		finally {
			$("#export-progress-bar-container").css("display", "none");
			$("#export-progress-cancel").off("click").hide();
			$(".export-progress-bar-fill").css({ width: "0%" });
			$(button).find(".cute-little-loading-indicator").remove();
			this.exportInProgress = false;
		}
	}

	/*
	* Function: sdfJobRequest
	*
	* Awaits a request to the SDF export job endpoints and returns its JSON body, or throws
	* with the server's own message when it refuses (busy, too large, expired, ...).
	*/
	async sdfJobRequest(request) {
		const response = await request;
		let body = null;
		try {
			body = await response.json();
		}
		catch(e) {
			//not a JSON body - the status is reported below
		}
		if(!response.ok) {
			throw new Error(body && body.error ? body.error : "the server returned "+response.status);
		}
		return body;
	}

	/*
	* Function: showSdfJobStatus
	*
	* Shows where a running XLSX export job is: waiting for a free slot on the server, reading
	* the sites from the database, or writing the workbook.
	*/
	showSdfJobStatus(status) {
		const percent = Math.round((status.progress || 0) * 100);
		const sites = status.siteCount == 1 ? "1 site" : status.siteCount.toLocaleString("en")+" sites";
		if(status.state == "queued") {
			this.showSdfProgress("Waiting for the server, which is busy with other exports...", 0);
		}
		else if(status.phase == "gathering") {
			this.showSdfProgress("Collecting the data for "+sites+"... "+percent+"%", status.progress);
		}
		else {
			this.showSdfProgress("Writing the workbook for "+sites+"... "+percent+"%", status.progress);
		}
	}

	/*
	* Function: showSdfProgress
	*
	* Sets the export progress bar's message and fill (0-1). A null fraction leaves the fill as it is.
	*/
	showSdfProgress(message, fraction) {
		$("#export-progress-bar-container .status-msg").text(message);
		if(fraction !== null && fraction !== undefined) {
			$(".export-progress-bar-fill").css({ width: Math.min(100, fraction * 100)+"%" });
		}
	}

	/*
	* Function: readSdfResponse
	*
	* Reads the workbook body into a Blob, moving the progress bar as it downloads. By then the
	* server has built the workbook (exportSitesAsSdfXlsx follows the build), so the bar starts
	* over from empty and covers the transfer.
	*/
	async readSdfResponse(response) {
		const total = parseInt(response.headers.get("Content-Length"));
		if(!response.body || !Number.isInteger(total) || total <= 0) {
			return await response.blob();
		}

		const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
		this.showSdfProgress("Downloading... 0 of "+mb(total)+" MB", 0);
		const reader = response.body.getReader();
		const chunks = [];
		let received = 0;
		while(true) {
			const { done, value } = await reader.read();
			if(done) {
				break;
			}
			chunks.push(value);
			received += value.length;
			this.showSdfProgress("Downloading... "+mb(received)+" of "+mb(total)+" MB", received / total);
		}
		return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
	}

	sdfFilename(response, siteIds) {
		const disposition = response.headers.get("Content-Disposition") || "";
		const match = disposition.match(/filename="?([^";]+)"?/);
		if(match) {
			return match[1];
		}
		return siteIds.length === 1 ? `sead_site_${siteIds[0]}.xlsx` : "sead_sites.xlsx";
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
			{ header: 'SEAD release', key: 'sead_release', width: 10},
			{ header: 'SEAD browser version', key: 'version', width: 10}
		];

		metaWorksheet.addRow([
			this.sqs.config.dataExportDescription, 
			Config.serverRoot, 
			Config.dataAttributionString,
			new Date().toISOString(),
			Config.seadRelease,
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

	/*
	* Function: fetchSdfMaxSites
	*
	* How many sites the server puts in one XLSX (SDF) workbook, from /sdf/version. Returns null if the
	* server can't be asked, in which case the dialog doesn't check and the server's own refusal is shown.
	*/
	async fetchSdfMaxSites() {
		try {
			const response = await fetch(Config.dataServerAddress+"/sdf/version");
			if(!response.ok) {
				return null;
			}
			const version = await response.json();
			return Number.isInteger(version.max_sites) ? version.max_sites : null;
		}
		catch(error) {
			console.warn("Could not fetch the SDF site limit", error);
			return null;
		}
	}

	/*
	* Function: exportSiteList
	*
	* The "Site list only" export: one row per site, as XLSX, CSV or JSON. Built here from
	* fetchSiteList, which is quick even for every site in the database.
	*/
	async exportSiteList(sites, format, button = "#sites-export-dl") {
		if(this.exportInProgress) {
			this.sqs.notificationManager.notify("An export is already in progress. Please wait for it to finish.", "info");
			return;
		}
		this.exportInProgress = true;
		$(button).append(`<div class="cute-little-loading-indicator"></div>`);
		try {
			if(format == "csv") {
				await this.exportSitesAsCsv(sites);
			}
			else if(format == "json") {
				await this.exportSitesAsJson(sites);
			}
			else {
				await this.exportSitesAsXlsx(sites);
			}
		}
		catch(error) {
			console.error("Site list export failed", error);
			this.sqs.notificationManager.notify("Site list export failed: "+(error && error.message ? error.message : "unknown error"), "error");
		}
		finally {
			$(button).find(".cute-little-loading-indicator").remove();
			this.exportInProgress = false;
		}
	}

	siteListFilename(extension) {
		const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
		return "sead_site_list_"+date+"."+extension;
	}

	/*
	* Function: siteListTable
	*
	* The site list as a header row and value rows, in the column order every format uses.
	*/
	siteListTable(rows) {
		const columns = [
			["site_id", "Site ID"],
			["site_name", "Site name"],
			["latitude", "latitude"],
			["longitude", "longitude"],
			["altitude", "altitude"],
			["national_site_identifier", "national_site_identifier"],
			["domain", "domain"],
			["sample_groups_num", "sample_groups_num"],
			["samples_num", "samples_num"],
			["url", "url"]
		];
		return {
			header: columns.map(c => c[1]),
			rows: rows.map(row => columns.map(c => row[c[0]] === undefined ? null : row[c[0]]))
		};
	}

	async exportSitesAsJson(siteIds) {
		const rows = await this.fetchSiteList(siteIds);
		const bytes = new TextEncoder().encode(JSON.stringify(rows, null, 2));
		saveAs(new Blob([bytes], { type: "application/json;charset=utf-8" }), this.siteListFilename("json"));
	}

	async exportSitesAsCsv(siteIds) {
		const table = this.siteListTable(await this.fetchSiteList(siteIds));
		const csvValue = (value) => {
			if(value === null || value === undefined) {
				return '';
			}
			if(typeof value == "number") {
				return String(value);
			}
			return '"'+String(value).replace(/"/g, '""')+'"';
		};
		//the byte order mark makes Excel read the file as UTF-8
		let csv = "\uFEFF" + table.header.map(csvValue).join(",") + "\r\n";
		table.rows.forEach(row => {
			csv += row.map(csvValue).join(",") + "\r\n";
		});
		const bytes = new TextEncoder().encode(csv);
		saveAs(new Blob([bytes], { type: "text/csv;charset=utf-8" }), this.siteListFilename("csv"));
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

	async exportFullSamplesAsXlsx(siteIds, methodIds = []) {
		console.log("Exporting full sites as XLSX");

		let sites = await this.fetchSites(siteIds);
		let objectUrl = await this.sqs.exportManager.getSamplesXlsxBookExport(sites, true, methodIds);
		const a = document.createElement("a");
		a.href = objectUrl;
		a.download = "sead_sites_export.xlsx";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
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
		const table = this.siteListTable(await this.fetchSiteList(siteIds));
		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet("Sites", { views: [{ state: "frozen", ySplit: 1 }] });
		worksheet.addRow(table.header).font = { bold: true };
		const urlColumn = table.header.indexOf("url") + 1;
		table.rows.forEach(row => {
			const added = worksheet.addRow(row);
			//a clickable link, showing the address itself
			const cell = added.getCell(urlColumn);
			if(cell.value) {
				cell.value = { text: cell.value, hyperlink: cell.value };
				cell.font = { color: { argb: "FF0563C1" }, underline: true };
			}
		});
		worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.header.length } };
		worksheet.columns.forEach((column, i) => {
			column.width = [10, 40, 14, 14, 10, 26, 22, 18, 12, 36][i];
		});

		const buffer = await workbook.xlsx.writeBuffer();
		saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), this.siteListFilename("xlsx"));
	}
}

export { ResultModule as default }
