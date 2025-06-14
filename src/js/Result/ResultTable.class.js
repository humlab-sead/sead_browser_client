//import '../../../node_modules/datatables/media/css/jquery.dataTables.min.css';
import ResultModule from './ResultModule.class.js'
import ApiWsChannel from '../ApiWsChannel.class.js'
import "../../../node_modules/tabulator-tables/dist/css/tabulator.min.css";
import { nanoid } from "nanoid";
import { Tabulator, FormatModule, SelectRowModule, InteractionModule, TooltipModule, SortModule, ResponsiveLayoutModule, ResizeTableModule } from "tabulator-tables";

Tabulator.registerModule(FormatModule);
Tabulator.registerModule(SelectRowModule);
Tabulator.registerModule(InteractionModule);
Tabulator.registerModule(TooltipModule);
Tabulator.registerModule(SortModule);
Tabulator.registerModule(ResponsiveLayoutModule);
Tabulator.registerModule(ResizeTableModule);

/*
* Class: ResultTable
*/
class ResultTable extends ResultModule {
	/*
	* Function: constructor
	*/
	constructor(resultManager) {
		super(resultManager);
		this.name = "table";
		this.prettyName = "Spreadsheet";
		this.icon = "<i class=\"fa fa-table\" aria-hidden=\"true\"></i>";
		this.maxRenderCount = 100000;
		this.hasCurrentData = false;
		this.tooltipAnchors = [];
		this.data = {
			columns: [],
			rows: []
		};

		$(window).on("seadResultMenuSelection", (event, data) => {
			this.setActive(data.selection == this.name);
		});
	}

	setActive(active) {
		super.setActive(active);
		if(!this.active) {
			$("#result-table-container").hide();
		}
		else {
			$("#result-table-container").css("display", "grid");
		}
	}
	
	isVisible() {
		return true;
	}

	/*
	* Function: clearData
	*/
	clearData() {
		this.data.columns = [];
		this.data.rows = [];
	}
	
	/*
	* Function: fetchData
	*/
	fetchData() {
		if(this.resultDataFetchingSuspended) {
			this.pendingDataFetch = true;
			return false;
		}

		var reqData = this.resultManager.getRequestData(++this.requestId, "tabular");

		this.resultManager.showLoadingIndicator(true);
		return $.ajax(Config.serverAddress+"/api/result/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: (respData, textStatus, jqXHR) => {
				//Only load this data if it matches the last request id dispatched. Otherwise it's old data.
				//Also drop the data if the result module has switched since it was requested.
				if(respData.RequestId == this.requestId && this.resultManager.getActiveModule().name == this.name) {
					this.importResultData(respData);
					this.resultManager.showLoadingIndicator(false);
				}
				else {
					console.log("WARN: ResultTable discarding old result package data ("+respData.requestId+"/"+this.requestId+").");
				}
			},
			error: (respData, textStatus, jqXHR) => {
				this.resultManager.showLoadingIndicator(false, true);
			},
			complete: (xhr, textStatus) => {
			}
		});
	}
	
	/*
	* Function: importResultData
	*/
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
			this.renderData();
		}
		
	}
	
	/*
	* Function: render
	*/
	render() {
		this.unrender();
		super.render();
		var xhr = this.fetchData();
		xhr.then((data, textStatus, xhr) => { //success
		},
		function(xhr, textStatus, errorThrown) { //error
			console.log(errorThrown);
		});
	}
	
	/*
	* Function: renderData
	*/
	renderData() {
		this.renderDataTable();
		return true;
	}

	renderExportButton(anchorNodeSelector = "#result-table-container") {
		if($("#result-table-container .result-export-button").length > 0) {
			console.warn("renderExportButton - Export button already exists");
			return;
		}
		let exportButton = $("<div></div>").addClass("result-export-button").html("<i class='fa fa-download' aria-hidden='true'></i>&nbsp;Export");
		$(anchorNodeSelector).append(exportButton);
		this.bindExportModuleDataToButton(exportButton, this);
	}

	getFeatureTypeIconUrl(iconName) {
		try {
			return featureTypeIcons(`./${iconName}.webp`);
		} catch (e) {
			// Return a default image 
			return featureTypeIcons(`./undefined.webp`) 
		}
	}


	datingAgeFormatter(cell, type) {
		const row = cell.getRow();
		const cellElement = cell.getElement();
		cellElement.innerHTML = "<div class='cute-little-loading-indicator'></div>";

		let renderInterval = setInterval(() => {
			if (this.maxRenderSlots > this.currentRenderSlotsTaken) {
				this.currentRenderSlotsTaken++;
				clearInterval(renderInterval);

				const rowData = row.getData();
				if (rowData.age_older !== undefined && rowData.age_younger !== undefined) {
					// Already fetched
					cellElement.innerText = type === "older" ? rowData.age_older : rowData.age_younger;
					this.currentRenderSlotsTaken--;
					return;
				}

				$.ajax(Config.dataServerAddress + "/time/sites", {
					data: JSON.stringify({ siteIds: [rowData.site_link_filtered] }),
					dataType: "json",
					method: "POST",
					contentType: 'application/json; charset=utf-8',
					crossDomain: true
				}).then(data => {
					if (data.length === 0) {
						rowData.age_older = rowData.age_younger = null;
						cellElement.innerText = "N/A";
						this.currentRenderSlotsTaken--;
						return;
					}

					const { age_older, age_younger } = data[0];
					rowData.age_older = age_older;
					rowData.age_younger = age_younger;

					cellElement.innerText = type === "older" ? age_older : age_younger;
					this.currentRenderSlotsTaken--;
				}).catch(err => {
					console.error("Error fetching dating data:", err);
					cellElement.innerText = "Error";
					this.currentRenderSlotsTaken--;
				});
			}
		}, 200);

		return cellElement.innerHTML;
	}

	renderDataTable() {
		this.resultManager.renderMsg(false);

		$('#result-table-container').css("display", "grid");
		$('#result-table-container').html(`
			<div id='result-datatable'></div>
			<div id='result-datatable-controls'>
			</div>
			`);

		if(this.sqs.config.showResultExportButton) {
			let exportButton = $("<div></div>").addClass("result-export-button").html("<i class='fa fa-download' aria-hidden='true'></i>&nbsp;Export");
			$("#result-datatable-controls").append(exportButton);
			this.bindExportModuleDataToButton(exportButton, this);
		}

		let maxAnalysisEntities = this.data.rows.reduce((max, row) => Math.max(max, row.analysis_entities), 0);

		this.maxRenderSlots = 12;
		this.currentRenderSlotsTaken = 0;

		let tableColumns = [
			{title: "Select", widthGrow:-1, formatter: "rowSelection", titleFormatter:"rowSelection", cssClass: "result-table-select-all-checkbox", hozAlign:"center", headerSort:false, cellClick: (evt, cell) => { cell.getRow().toggleSelect(); }},
			{title:"View site", widthGrow:0, headerSort: false, field:"site_link_filtered", tooltip: true, cellClick: (e, cell) => {
				cell.getRow().toggleSelect(); //undo selection of row
				let siteId = parseInt(cell.getValue());
				if(!siteId) {
					console.log("WARN: No site ID found in cell value");
					return;
				}
				this.sqs.siteReportManager.renderSiteReport(siteId);
			}, formatter: (cell, formatterParams, onRendered) => {
					return `
					<div class='site-report-link site-report-table-button' site-id='${cell.getValue()}'>
					<i class="fa fa-search" aria-hidden="true"></i>&nbsp;View site
					</div>`;
				}
			},
			{title:"Site ID", field:"site_link_filtered", widthGrow:1, hozAlign:"center"},
			{title:"Site name", field:"sitename", tooltip: true, widthGrow:3},
			{title:"Data points", field:"analysis_entities", widthGrow:1, formatter: (cell, formatterParams, onRendered) => {
				return `<div class='stacked-bar-outer-container'>
				<div class='stacked-bar-container'>
				<div class='stacked-segment' style='width: ${(cell.getValue() / maxAnalysisEntities * 100)}%;' title='${cell.getValue()}'></div>
				</div>
				<div class='stacked-bar-container-numerical-readout'>${cell.getValue()}</div>
				</div>`;
			},
				sorter: "number",
			},
		];

		let activeDomain = this.sqs.domainManager.getActiveDomain().name;

		if(activeDomain != "dendrochronology") {

			tableColumns.push({
				title:"Analyses",
				field:"analyses",
				widthGrow:2,
				headerSort: false,
				formatter: (cell, formatterParams, onRendered) => {
					let cellElement = cell.getElement();
					cellElement.classList.add('stacked-bar-container');
					cellElement.innerHTML = "<div class='cute-little-loading-indicator'></div>";

					let renderInterval = setInterval(() => {
					if(this.maxRenderSlots > this.currentRenderSlotsTaken) {
						this.currentRenderSlotsTaken++;
						clearInterval(renderInterval);

						$.ajax(Config.dataServerAddress + "/graphs/analysis_methods", {
							data: JSON.stringify([cell.getData().site_link_filtered]),
							dataType: "json",
							method: "post",
							contentType: 'application/json; charset=utf-8',
							crossDomain: true
							}).then(data => {
							data.analysis_methods_datasets.sort((a, b) => {
								return Number(a.method_id) - Number(b.method_id);
							});
							let totalDatasetCount = data.analysis_methods_datasets.reduce((total, amd) => total + amd.dataset_count, 0);
						
							let svgNS = "http://www.w3.org/2000/svg";
							let svg = document.createElementNS(svgNS, "svg");
							svg.setAttribute("width", "100%");
							svg.setAttribute("height", "80%");
						
							let currentOffset = 0;
	
							data.analysis_methods_datasets.forEach(amd => {
								amd.color = "000";
								for (let key in this.sqs.config.analysisMethodsColors) {
								let amc = this.sqs.config.analysisMethodsColors[key];
								if (amc.method_id == amd.method_id) {
									amd.color = amc.color;
								}
								}
						
								let rect = document.createElementNS(svgNS, "rect");
								amd.barWidth = (amd.dataset_count / totalDatasetCount) * 100;
								
								rect.setAttribute("x", `${currentOffset}%`);
								rect.setAttribute("width", `${amd.barWidth}%`);
								rect.setAttribute("height", "100%");
								rect.setAttribute("fill", `#${amd.color}`);
								svg.appendChild(rect);
	
								this.sqs.tooltipManager.registerTooltip(rect, `Method: ${amd.method_name}, Datasets: ${amd.dataset_count}`)
								this.tooltipAnchors.push(rect);
								
								currentOffset += amd.barWidth;
							});
						
							// Clear the loading indicator before appending the SVG
							cellElement.innerHTML = '';
							cellElement.appendChild(svg);
							this.currentRenderSlotsTaken--;
							});
						}
					}, 200);						
				
					// The initial return is just the loading indicator
					return cellElement.innerHTML;
				}
			});
		}
		
		if(activeDomain == "dendrochronology") {

			tableColumns.push(
				{
					title: "Age older",
					field: "age_older",
					width: 90,
					formatter: (cell) => this.datingAgeFormatter(cell, "older"),
					headerSort: false,
				},
				{
					title: "Age younger",
					field: "age_younger",
					width: 90,
					formatter: (cell) => this.datingAgeFormatter(cell, "younger"),
					headerSort: false,
				}
			);
		}

		if(this.sqs.config.featureTypesEnabledDomainsList && this.sqs.config.featureTypesEnabledDomainsList.includes(activeDomain)) {
			tableColumns.push({
				title:"Feature types",
				field:"feature_types",
				widthGrow:2,
				headerSort: false,
				formatter: (cell, formatterParams, onRendered) => {
					let cellElement = cell.getElement();
					cellElement.classList.add('stacked-bar-container');
					cellElement.innerHTML = "<div class='cute-little-loading-indicator'></div>";

					let renderInterval = setInterval(() => {
					if(this.maxRenderSlots > this.currentRenderSlotsTaken) {
						this.currentRenderSlotsTaken++;
						clearInterval(renderInterval);

						$.ajax(Config.dataServerAddress + "/graphs/feature_types", {
							data: JSON.stringify({ siteIds: [cell.getData().site_link_filtered] }),
							dataType: "json",
							method: "post",
							contentType: 'application/json; charset=utf-8',
							crossDomain: true
							}).then(data => {
								let maxFeatureCount = data.summary_data.reduce((max, ft) => Math.max(max, ft.count), 0);

								//sort feature types by feature count
								data.summary_data.sort((a, b) => {
									return b.count - a.count;
								});

								const maxDisplayFeaturesCount = 5;
								let displayFeaturesDisplayedCount = 0;
								let ftData = "<div class='feature-type-icons'>";
								let otherFeatureTypes = "";

								if(data.summary_data.length >= maxDisplayFeaturesCount) {
									//this might seem strange, but it is because if
									//we are going over the limit, then the last slot will be the "other" slot,
									//so we need to reduce the amount of availble slots by one
									displayFeaturesDisplayedCount++;
								}

								data.summary_data.forEach(ft => {
									if(displayFeaturesDisplayedCount >= maxDisplayFeaturesCount) {
										otherFeatureTypes += `${ft.name} (${ft.count}), `;
										return;
									}
									displayFeaturesDisplayedCount++;

									ftData += this.sqs.renderFeatureTypeIcon(ft.name, ft.count, maxFeatureCount);
								});

								if(displayFeaturesDisplayedCount == maxDisplayFeaturesCount) {
									let ttId = "tt-"+nanoid();
									ftData += `<div id='${ttId}' class='feature-type-icon-container'>
										<div class='feature-type-icon'>...</div>
									</div>`;
									otherFeatureTypes = otherFeatureTypes.slice(0, -2); //remove trailing comma
									this.sqs.tooltipManager.registerTooltip("#"+ttId, "Other features: "+otherFeatureTypes);
									this.tooltipAnchors.push("#"+ttId);
								}

								ftData += "</div>";

								cellElement.innerHTML = ftData ? ftData : "";
								this.currentRenderSlotsTaken--;
							});
						}
					}, 200);						
				
					// The initial return is just the loading indicator
					return cellElement.innerHTML;
				}
			});
		}

		this.tabulatorTable = new Tabulator("#result-datatable", {
			data: this.data.rows,
			placeholder:"No data",
			layout: "fitColumns",
			initialSort:[
				{column:"analysis_entities", dir:"desc"},
			],
			selectable: true,
			columns: tableColumns,
		});

		/* this is a hack to make resize of the table work, and it works, but it's inefficient since it re-fetches the dynamic columns
		window.addEventListener('resize', () => {
			this.tabulatorTable.redraw(true); 
		});
		*/

		this.resultManager.sqs.sqsEventDispatch("resultModuleRenderComplete");
	}

	getSelectedSites() {
		let selectedRows = this.tabulatorTable.getSelectedData();
		if (selectedRows.length === 0) {
			// No selection means all sites are selected
			return this.data.rows.map(row => row.site_link_filtered);
		}
		return selectedRows.map(row => row.site_link_filtered);
	}

	/*
	async fetchAnalysesStackedBar(siteId, siteTdId, rowsNum) {
		if(!this.wsChan) {
			this.wsChan = new ApiWsChannel(this.sqs, "ws://localhost:8484").connect().then((chan) => {
				console.log("Connected to WS")
				
				chan.bindListen((evt) => {
					let data = JSON.parse(evt.data);

					let highestDatasetCount = 0;
					data.analysis_methods_datasets.forEach(amd => {
						if(amd.dataset_count > highestDatasetCount) {
							highestDatasetCount = amd.dataset_count;
						}
					});

					let barHtml = "<div class='stacked-bar-container'>";
					data.analysis_methods_datasets.forEach(amd => {

						amd.color = "black";
						for(let key in this.sqs.config.analysisMethodsColors) {
							let amc = this.sqs.config.analysisMethodsColors[key];
							if(amc.method_group_id == amd.method_group_id) {
								amd.color = "#"+amc.color;
							}
						}

						amd.barWidth = (amd.dataset_count / highestDatasetCount) * 100;
						barHtml += "<div class='stacked-segment' style='width: "+(amd.barWidth)+"%; background-color: "+amd.color+";'></div>";
						//console.log(amd.barWidth)
					});
					barHtml += "</div>";
					$("#"+siteTdId).html(barHtml);
				});

				chan.send({
					type: "analysis_methods",
					siteId: siteId
				});
			});
		}
		else {
			this.wsChan.send({
				type: "analysis_methods",
				siteId: siteId
			});
		
		}
	}
	*/

	/*
	renderAnalysesStackedBar(row, rowsNum) {
		let siteId = row.site_link_filtered;
		let siteTdId = "site-"+siteId;
		let out = "<td id='"+siteTdId+"'></td>";

		this.requestsQueue.push({
			siteId: siteId,
			callback: async () => { return this.fetchAnalysesStackedBar(siteId, siteTdId, rowsNum); }
		});

		return out;
	}
	*/

	update() {
		this.render();
	}
	
	getRenderStatus() {
		return this.renderStatus;
	}
	
	/*
	* Function: unrender
	*/
	async unrender() {
		if(this.tabulatorTable) {
			this.tabulatorTable.clearData();
			this.tabulatorTable.destroy();
		}
		$('#result-table-container').html("");
		$("#result-table-container").hide();

		//unregister all tooltips
		this.tooltipAnchors.forEach(anchor => {
			this.sqs.tooltipManager.unRegisterTooltip(anchor);
		});
		this.tooltipAnchors = [];
	}
	
	/*
	* Function: exportSettings
	*/
	exportSettings() {
		return {
		};
	}
	
	/*
	* Function: importSettings
	*/
	importSettings(settings) {
	}

}

export { ResultTable as default }