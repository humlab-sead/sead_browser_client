import ResultModule from './ResultModule.class.js'
import "../../../node_modules/cesium/Build/Cesium/Widgets/widgets.css";

import "@nobleclem/jquery-multiselect";
import "@nobleclem/jquery-multiselect/jquery.multiselect.css";

import AbundanceData from './DatahandlingModules/AbundanceData.class.js';
import DendroCeramicsData from './DatahandlingModules/DendroCeramicsData.class.js';
import DatingData from './DatahandlingModules/DatingData.class.js';
import IsotopeData from './DatahandlingModules/IsotopeData.class.js';
import MeasuredValuesData from './DatahandlingModules/MeasuredValuesData.class.js';
import EntityAgesData from './DatahandlingModules/EntityAgesData.class.js';
import SiteExportWorker from '../Workers/SiteExport.worker.js';

/*
* Class: ResultModule
*/
class ResultLab extends ResultModule {

    constructor(resultManager, renderIntoNode = "#result-lab-container") {
		super(resultManager);
		this.sqs = resultManager.sqs;
		this.renderIntoNode = renderIntoNode;
		this.name = "lab";
		this.prettyName = "Lab";
		this.icon = "<i class='fa fa-flask'></i>";
		this.experimental = true;
		this.gwRoot = null;
		this.reloadDataGoAheadGiven = true;

		$(this.renderIntoNode).append("<div id='result-lab-render-container'></div>");
		$("#result-lab-render-container", this.renderIntoNode).css("height", "auto");

		this.renderLabIntoNode = $("#result-lab-render-container", renderIntoNode)[0];

		this.dataModules = [];
		this.dataModules.push(new AbundanceData(this.sqs));
		this.dataModules.push(new DendroCeramicsData(this.sqs));
		this.dataModules.push(new DatingData(this.sqs));
		this.dataModules.push(new IsotopeData(this.sqs));
		this.dataModules.push(new MeasuredValuesData(this.sqs));
		this.dataModules.push(new EntityAgesData(this.sqs));

		$("#lab-fetch-cancel-button").on("click", () => {
			this.cancelFetch();
		});


		$("#lab-filter-selections-has-changed-warning-btn").on("click", () => {
			this.reloadDataGoAheadGiven = true;
			$("#lab-filter-selections-has-changed-warning").hide();
			this.update();
		});
	}

	update() {
		console.log("ResultLab.update()");

		if(this.data.rows.length > 0 && !this.reloadDataGoAheadGiven) {
			$("#lab-filter-selections-has-changed-warning").show();
			return;
		}

		this.fetchData().then(() => {
			
		}).catch((error) => {
			console.error("Error fetching data in ResultLab.update():", error);
			this.resultManager.showLoadingIndicator(false, true);
		});
	}

	isVisible() {
		return false;
	}

	async renderData(data) {
		$(this.renderIntoNode).show();
		$("#result-lab-render-container", this.renderIntoNode).html("");

		let siteList = this.data.rows;

		this.siteIds = [];
		siteList.forEach((site) => {
			if(site.site_link && !this.siteIds.includes(site.site_link)) {
				this.siteIds.push(site.site_link);
			}
		});

		let datasetSummaries = await this.fetchDatasetSummaries(this.siteIds);
		console.log("Dataset Summaries: ", datasetSummaries);

		const selectElement = document.getElementById('result-lab-datasets-select');
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

			$('#result-lab-datasets-select').multiselect( 'reload' );
		}

		//$('#result-lab-datasets-select option').prop('selected', true);
		$('#result-lab-datasets-select').multiselect({
			search: true,
			maxPlaceholderOpts: 1,
			selectAll: true,
			texts: {
				placeholder: 'Select options'
			},
			onControlClose: () => {
				this.onMultiSelectControlClose();
			}
		});

		// Close multiselect when clicking outside
		$(document).on('mousedown', (event) => {
			// Check if the click is outside any open multiselect menu
			if (
				!$(event.target).closest('.ms-options-wrap').length &&
				!$(event.target).closest('.ms-options').length
			) {
				$('.ms-options-wrap.ms-active .ms-options-wrap').each(function() {
					$(this).removeClass('ms-active');
				});

				//check if the multiselect is active
				if ($('#result-lab-header .ms-options-wrap.ms-active').length > 0) {
					// If it is, remove the active class
					$('.ms-options-wrap.ms-active').removeClass('ms-active');
					//we also need to fire the onControlClose event manually
					this.onMultiSelectControlClose();
				}
				
			}
		});
	}

	async onMultiSelectControlClose() {

		let methods = $("#result-lab-datasets-select").val();
		//parseInt the methods
		methods = methods.map((method) => parseInt(method));
		//if methods is different from this.selectedMethods OR the siteIds are different, we overwrite it and continue, otherwise we do nothing
		if (methods.length > 0 && (JSON.stringify(methods) !== JSON.stringify(this.selectedMethods) || JSON.stringify(this.siteIds) !== JSON.stringify(this.selectedSites))) {
			this.selectedMethods = methods;
			this.selectedSites = this.siteIds;
			this.reloadDataGoAheadGiven = false;
		}
		else{
			return;
		}

		if(this.dataLoadInProgress) {
			this.cancelFetch(true);
		}

		//let sites = await this.fetchSites(this.siteIds);
		this.dataLoadInProgress = true;
		$("#lab-fetch-cancel-button").prop("disabled", false);
		$("#lab-progress-bar-container").css("display", "block");

		this.siteExportWorker = new SiteExportWorker();
		// Handle messages from the worker
		this.siteExportWorker.onmessage = async (e) => {
			const { type, progress, total, results } = e.data;

			if (type === 'progress') {
				$(".lab-progress-bar-fill").css({
					width: (progress / total * 100)+"%"
				});

				if (progress == total) {
					//$("#export-progress-bar-container .status-msg").text("Formatting data...");
				}
				else {
					$("#lab-progress-bar-container .status-msg").text("Fetching data...");
				}
			}

			if (type === 'complete') {
				$("#lab-progress-bar-container").css("display", "none");
				$(".lab-progress-bar-fill").css({
					width: "0%"
				});
				this.dataLoadInProgress = false;
				this.presentData(results);
			}
		};

		// Start the worker with the necessary data
		this.siteExportWorker.postMessage({
			methods: this.selectedMethods,
			selectedSites: this.siteIds,
			dataServerAddress: Config.dataServerAddress
		});
	}

	cancelFetch(instant = false) {
		console.log("Cancelling fetch in ResultLab.");
		this.siteExportWorker.terminate();

		//set text to "Cancelled" and then hide after a short delay
		$("#lab-progress-bar-container .status-msg").text("Cancelled");
		$("#lab-fetch-cancel-button").prop("disabled", true);
		this.dataLoadInProgress = false;

		if(!instant) {
			setTimeout(() => {
				$("#lab-progress-bar-container").css("display", "none");
				$(".lab-progress-bar-fill").css({
					width: "0%"
				});
			}, 1000);
		}
		else {
			$("#lab-progress-bar-container").css("display", "none");
			$(".lab-progress-bar-fill").css({
				width: "0%"
			});
		}
	}

	presentData(sites) {
		let selectedOptions = $('#result-lab-datasets-select').val();

		let tables = [];
		selectedOptions.forEach((methodId) => {
			this.dataModules.forEach((dataModule) => {
				tables.push(dataModule.getDataAsTable(parseInt(methodId), sites));
			});
		});
		let filteredTables = tables.filter(table => {
			if (table == null || table.rows.length === 0) {
				return false; // Exclude empty tables
			}
			return true;
		});

		this.dataLoadedCallback(filteredTables);
	}

    async render() {
		console.log("ResultLab.render() called.");
		this.unrender();
		super.render();
		
		var xhr = this.fetchData();
		xhr.then((data, textStatus, xhr) => {
		},
		function(xhr, textStatus, errorThrown) { //error
			console.log(errorThrown);
		});
	}

	dataLoadedCallback(tables) {
		let gwData = this.convertTabularDataToGraphicWalkerFormat(tables);

		Promise.all([
			import("react"),
			import("react-dom/client"),
			import("@kanaries/graphic-walker")
		])
		.then(([React, ReactDOMClient, GraphicWalkerModule]) => {
			const { createElement } = React;
			const { createRoot } = ReactDOMClient;
			const { GraphicWalker } = GraphicWalkerModule;

			const container = document.getElementById("result-lab-render-container");
			this.gwRoot = createRoot(container);

			this.gwRoot.render(
				createElement(GraphicWalker, {
					themeConfig: this.getGraphicWalkerTheme(),
					spec: {
						"mark": "bar",
					},
					dataSource: gwData.dataSource,
					rawFields: gwData.rawFields
				})
			);
		})
		.catch(err => {
			console.error("Dynamic import failed:", err);
		});
	}

	getGraphicWalkerTheme() {
		return {
			"light": {
				"area": { "fill": "#590DF5" },
				"bar": { "fill": "#590DF5" },
				"circle": { "fill": "#590DF5" },
				"line": { "stroke": "#590DF5" },
				"point": { "stroke": "#590DF5" },
				"rect": { "fill": "#590DF5" },
				"tick": { "stroke": "#590DF5" },
				"boxplot": { "fill": "#590DF5" },
				"errorbar": { "stroke": "#590DF5" },
				"errorband": { "fill": "#590DF5" },
				"arc": { "fill": "#590DF5" },
				"background": "transparent",
				"range": {
					"category": [
						"#590DF5",
						"#9E00A8",
						"#EB5428",
						"#D1A800",
						"#22D180",
						"#0073A8"
					],
					"diverging": [
						"#7b3294",
						"#c2a5cf",
						"#f7f7f7",
						"#a6dba0",
						"#008837"
					],
					"heatmap": [
						"#000000",
						"#7b3294",
						"#c2a5cf",
						"#f7f7f7",
						"#a6dba0",
						"#008837"
					],
					"ramp": [
						"#EBCCFF",
						"#CCB0FF",
						"#AE95FF",
						"#907BFF",
						"#7262FD",
						"#5349E0",
						"#2F32C3",
						"#001BA7",
						"#00068C"
					]
				},
				"scale": {
					"continuous": {
						"range": [
							"#f7fbff",
							"#08306b"
						]
					}
				}
			},
			"dark": {
				"background": "transparent",
				"header": {
					"titleColor": "#d1d5db",
					"labelColor": "#d1d5db"
				},
				"axis": {
					"gridColor": "#666",
					"domainColor": "#d1d5db",
					"tickColor": "#d1d5db",
					"labelColor": "#d1d5db",
					"titleColor": "#d1d5db"
				},
				"legend": {
					"labelColor": "#d1d5db",
					"titleColor": "#d1d5db"
				},
				"view": { "stroke": "#666" },
				"area": { "fill": "#590DF5" },
				"bar": { "fill": "#590DF5" },
				"circle": { "fill": "#590DF5" },
				"line": { "stroke": "#590DF5" },
				"point": { "stroke": "#590DF5" },
				"rect": { "fill": "#590DF5" },
				"tick": { "stroke": "#590DF5" },
				"boxplot": { "fill": "#590DF5" },
				"errorbar": { "stroke": "#590DF5" },
				"errorband": { "fill": "#590DF5" },
				"arc": { "fill": "#590DF5" },
				"range": {
					"category": [
						"#5B8FF9",
						"#61DDAA",
						"#65789B",
						"#F6BD16",
						"#7262FD",
						"#78D3F8",
						"#9661BC",
						"#F6903D",
						"#008685",
						"#F08BB4"
					],
					"diverging": [
						"#7b3294",
						"#c2a5cf",
						"#f7f7f7",
						"#a6dba0",
						"#008837"
					],
					"heatmap": [
						"#000000",
						"#7b3294",
						"#c2a5cf",
						"#f7f7f7",
						"#a6dba0",
						"#008837"
					],
					"ramp": [
						"#EBCCFF",
						"#CCB0FF",
						"#AE95FF",
						"#907BFF",
						"#7262FD",
						"#5349E0",
						"#2F32C3",
						"#001BA7",
						"#00068C"
					]
				},
				"scale": {
					"continuous": {
						"range": [
							"#f7fbff",
							"#08306b"
						]
					}
				}
			}
		}
	}

	convertTabularDataToGraphicWalkerFormat(filteredTables) {
		// 1. Collect all unique columns by header
		const columnMap = new Map();
		filteredTables.forEach(table => {
			table.columns.forEach(col => {
				console.log(col.key);
				if (!columnMap.has(col.header)) {
					columnMap.set(col.header, {
						fid: col.header,
						name: col.header,
						semanticType: this.guessSemanticType(col.key, table),
						analyticType: this.guessAnalyticType(col.key, table)
					});
				}
			});
		});
		// Add fid field if not present
		if (!columnMap.has("fid")) {
			columnMap.set("fid", {
				fid: "fid",
				name: "fid",
				semanticType: "ordinal",
				analyticType: "dimension"
			});
		}
		const rawFields = Array.from(columnMap.values());

		// 2. Aggregate all rows, filling missing columns with null
		let allRows = [];
		let fidCounter = 1;
		filteredTables.forEach(table => {
			table.rows.forEach(row => {
				const rowObj = {};
				table.columns.forEach((col, i) => {
					rowObj[col.header] = row[i];
				});
				// Fill missing columns
				columnMap.forEach((_, colHeader) => {
					if (!(colHeader in rowObj)) {
						rowObj[colHeader] = null;
					}
				});
				rowObj.fid = fidCounter++;
				allRows.push(rowObj);
			});
		});

		return {
			dataSource: allRows,
			rawFields: rawFields
		};
	}

	guessSemanticType(key, table) {

		let typeGuessBasedOnColumnName = "";

		if (key.includes("date") || key.includes("year") || key.includes("age")) typeGuessBasedOnColumnName = "temporal";
		else if (key.includes("abundance") || key.includes("count") || key.includes("value")) typeGuessBasedOnColumnName =  "quantitative";
		else typeGuessBasedOnColumnName = "nominal";

		let typeGuessBasesOnValues = "nominal"; // Default to nominal
		table.rows.forEach((row) => {
			let value = row[key];
			//check if all the values are numbers or dates or strings
			if (value !== null && value !== undefined) {
				if (!isNaN(Number(value))) {
					typeGuessBasesOnValues = "quantitative";
				} else if (this.valueCanBeParsedAsDate(value)) {
					typeGuessBasesOnValues = "temporal";
				} else if (typeof value === "string") {
					typeGuessBasesOnValues = "nominal";
				}
			}
		});


		if(typeGuessBasedOnColumnName != typeGuessBasesOnValues) {
			console.warn("Semantic type guess based on column name ("+typeGuessBasedOnColumnName+") does not match guess based on values ("+typeGuessBasesOnValues+"). Using the one based on values.");
		}
		return typeGuessBasesOnValues;
	}

	guessAnalyticType(key, table) {
		let typeGuessBasedOnColumnName = "";

		if (key.includes("abundance") || key.includes("count") || key.includes("value")) typeGuessBasedOnColumnName = "measure";
		else typeGuessBasedOnColumnName = "dimension";

		let typeGuessBasesOnValues = "dimension"; // Default to dimension
		table.rows.forEach((row) => {
			let value = row[key];
			//check if all the values are numbers or dates or strings
			if (value !== null && value !== undefined) {
				if (!isNaN(Number(value))) {
					typeGuessBasesOnValues = "measure";
				} else if (typeof value === "string") {
					typeGuessBasesOnValues = "dimension";
				}
			}
		});

		if(typeGuessBasedOnColumnName != typeGuessBasesOnValues) {
			console.warn("Analytic type guess based on column name ("+typeGuessBasedOnColumnName+") does not match guess based on values ("+typeGuessBasesOnValues+"). Using the one based on values.");
		}
		return typeGuessBasesOnValues;
	}

	valueCanBeParsedAsDate(value) {
		if (value === null || value === undefined) return false;
		if (!isNaN(Number(value))) return false; // Numbers are not dates
		if (typeof value === "string") {
			const date = new Date(value);
			return !isNaN(date.getTime()); // Check if the date is valid
		}
		return false; // Other types are not considered dates
	}

	guessSemanticTypeOLD(key) {
		if (key.includes("date") || key.includes("year") || key.includes("age")) return "temporal";
		if (key.includes("abundance") || key.includes("count") || key.includes("value")) return "quantitative";
		return "nominal";
	}

	guessAnalyticTypeOLD(key) {
		if (key.includes("abundance") || key.includes("count") || key.includes("value")) return "measure";
		return "dimension";
	}


	async fetchData() {
		console.log("ResultLab.fetchData() called.");
		if(this.resultManager.getResultDataFetchingSuspended()) {
			console.warn("ResultLab.fetchData() called while data fetching is suspended.");
			return false;
		}

		if(this.dataLoadInProgress) {
			this.cancelFetch(true);
		}
		
		var reqData = this.resultManager.getRequestData(++this.requestId, "tabular");


		this.resultManager.showLoadingIndicator(true);
		return $.ajax(Config.serverAddress+"/api/result/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: (respData, textStatus, jqXHR) => {
				//Only load this data if it matches the last request id dispatched. Otherwise it's old data.
				if(respData.RequestId == this.requestId && this.active) {
					this.importResultData(respData);
					this.resultManager.showLoadingIndicator(false);
				}
				else {
					console.log("WARN: ResultMap discarding old result package data ("+respData.RequestId+"/"+this.requestId+").");
				}
			},
			error: (respData, textStatus, jqXHR) => {
				console.error("Error fetching data for result lab: ", textStatus, respData);
				this.resultManager.showLoadingIndicator(false, true);
			}
		});
	}

	importResultData(data) {
		this.sql = data.Query;
		this.data.columns = [];
		this.data.rows = [];

		for(var key in data.Meta.Columns) {
			var c = data.Meta.Columns[key];
			this.data.columns.push({
				title: c.DisplayText,
				field: c.FieldKey
			});
		}

		var rowsCount = data.Data.DataCollection.length;
		
		if(rowsCount > this.maxRenderCount) {
			this.unrender();
			this.resultManager.renderMsg(true, {
				title: "Too much data",
				body: "This dataset contains "+rowsCount+" rows of data. Please narrow down you search to fall within "+this.maxRenderCount+" rows of data by applying more filters."
			});
			return;
		}

		for(var key in data.Data.DataCollection) {
			var d = data.Data.DataCollection[key];

			var row = {};

			var i = 0;
			for(var ck in this.data.columns) {
				row[this.data.columns[ck].field] = d[i];
				i++;
			}

			this.data.rows.push(row);
		}

		//If this module has gone inactive (normally by being replaced) since this request was sent, ignore the response
		if(this.active) {
			this.renderData(data);
		}
		else {
			console.warn("ResultLab.importResultData() called while inactive, ignoring data.");
		}
	}

    async unrender() {
		$(this.renderIntoNode).hide();
	}

	setActive(active) {
		super.setActive(active);

		if(!active) {
			$(this.renderIntoNode).hide();
		}
	}
}

export { ResultLab as default }