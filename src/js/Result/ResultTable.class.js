//import Config from '../../config/config.js'
import DataTables from 'datatables';
import '../../../node_modules/datatables/media/css/jquery.dataTables.min.css';
import ResultModule from './ResultModule.class.js'
import ApiWsChannel from '../ApiWsChannel.class.js'
import "../../../node_modules/tabulator-tables/dist/css/tabulator.min.css";
import { default as Tabulator } from "tabulator-tables";
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
			$("#result-table-container").css("display", "flex");
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
		this.bindExportModuleDataToButton(exportButton);
	}

	renderDataTable() {
		this.resultManager.renderMsg(false);

		$('#result-table-container').html(`
			<div id='result-datatable'></div>
			<div id='result-datatable-controls'>
			</div>
			`);
		
		$('#result-table-container').css("display", "flex");

		let maxAnalysisEntities = this.data.rows.reduce((max, row) => Math.max(max, row.analysis_entities), 0);

		let maxRenderSlots = 5;
		let currentRenderSlotsTaken = 0;

		this.tabulatorTable = new Tabulator("#result-datatable", {
			data: this.data.rows,
			placeholder:"No data",
			layout: "fitColumns",
			initialSort:[
				{column:"analysis_entities", dir:"desc"},
			],
			selectable: true,
			columns:[
				{title: "Select", widthGrow:-1, formatter: "rowSelection", titleFormatter:"rowSelection", cssClass: "result-table-select-all-checkbox", hozAlign:"center", headerSort:false},
				{title:"View site", widthGrow:0, field:"site_link_filtered", tooltip: true, cellClick: (e, cell) => {
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
				{title:"Data points", field:"analysis_entities", widthGrow:2, formatter: (cell, formatterParams, onRendered) => {
					return `<div class='stacked-bar-outer-container'>
					<div class='stacked-bar-container'>
					<div class='stacked-segment' style='width: ${(cell.getValue() / maxAnalysisEntities * 100)}%;' title='${cell.getValue()}'></div>
					</div>
					<div class='stacked-bar-container-numerical-readout'>${cell.getValue()}</div>
					</div>`;
				}},
				{
					title:"Analyses",
					field:"analyses",
					widthGrow:2,
					formatter: (cell, formatterParams, onRendered) => {
						let cellElement = cell.getElement();
						cellElement.classList.add('stacked-bar-container');
						cellElement.innerHTML = "<div class='cute-little-loading-indicator'></div>";

						let renderInterval = setInterval(() => {
						if(maxRenderSlots > currentRenderSlotsTaken) {
							currentRenderSlotsTaken++;
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
									
									currentOffset += amd.barWidth;
								});
							
								// Clear the loading indicator before appending the SVG
								cellElement.innerHTML = '';
								cellElement.appendChild(svg);
								currentRenderSlotsTaken--;
								});
							}
						}, 200);						
					
						// The initial return is just the loading indicator
						return cellElement.innerHTML;
					}
				}
				  
				
			],
		});

		if(this.sqs.config.showResultExportButton) {
			let exportButton = $("<div></div>").addClass("result-export-button").html("<i class='fa fa-download' aria-hidden='true'></i>&nbsp;Export");
			$("#result-datatable-controls").append(exportButton);
			this.bindExportModuleDataToButton(exportButton, this);
		}

		this.resultManager.sqs.sqsEventDispatch("resultModuleRenderComplete");
	}

	getSelectedSites() {
		let selectedRows = this.tabulatorTable.getSelectedData();
		return selectedRows.map(row => row.site_link_filtered);
	}

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

	update() {
		this.render();
	}
	
	getRenderStatus() {
		return this.renderStatus;
	}
	
	/*
	* Function: unrender
	*/
	unrender() {
		if(this.tabulatorTable) {
			this.tabulatorTable.clearData();
			this.tabulatorTable.destroy();
		}
		$('#result-table-container').html("");
		$("#result-table-container").hide();
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