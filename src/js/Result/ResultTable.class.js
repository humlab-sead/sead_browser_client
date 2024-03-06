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
			if(data.selection != this.name) {
				$("#result-table-container").hide();
			}
			else {
				$("#result-table-container").show();
			}
		});
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
		this.renderDataTableNew();
		return true;
	}

	renderExportButton() {
		if($("#result-table-container .result-export-button").length > 0) {
			return;
		}
		let exportButton = $("<div></div>").addClass("result-export-button").html("<i class='fa fa-download' aria-hidden='true'></i>&nbsp;Export");
		$("#result-table-container").append(exportButton);
		this.bindExportModuleDataToButton(exportButton);
	}

	/*
	* Function: renderDataTable
	*/
	renderDataTable() {

		this.resultManager.renderMsg(false);

		$('#result-table-container').html("");

		if(this.sqs.config.showResultExportButton) {
			this.renderExportButton();
		}

		var renderData = JSON.parse(JSON.stringify(this.data)); //Make a copy

		var columns = [
			{
				"title": "Select",
				"column": "select"
			},
			{
				"title": "Site ID",
				"column": "site_link_filtered"
			},
			{
				"title": "Site name",
				"column": "sitename"
			},
			{
				"title": "Samples",
				"column": "samples"
			},
			{
				"title": "Analyses",
				"column": "analyses",
				"sortable": false
			},
			{
				"title": "Record type",
				"column": "record_type"
			}
		];


		let tableHtml = "<table id='result-datatable'>";
		tableHtml += "<thead><tr>";
		for(var key in columns) {
			tableHtml += "<td>"+columns[key].title+"</td>";
		}
		tableHtml += "</tr></thead>";
		//$('#result-datatable').append(colHTML);

		tableHtml += "<tbody>";
		for(var key in renderData.rows) {
			tableHtml += "<tr>";

			for(var ck in columns) {
				if(columns[ck].column == "select") {
					tableHtml += "<td><input type='checkbox' /></td>";
				}
				else if(columns[ck].column == "samples") {
					tableHtml += "<td>Samples</td>";
				}
				else if(columns[ck].column == "analyses") {
					//tableHtml += this.renderAnalysesStackedBar(renderData.rows[key], renderData.rows.length);
					let containerNodeId = "analyses-"+renderData.rows[key].site_link_filtered;
					tableHtml += "<td id='"+containerNodeId+"' class='cute-little-loading-indicator'></td>";
					this.sqs.asyncRender("#"+containerNodeId, {
						serverAddress: this.sqs.config.dataServerAddress,
						method: "ws",
						data: {
							type: "analysis_methods",
							siteId: renderData.rows[key].site_link_filtered
						},
						callback: (request, data) => {
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
							});
							barHtml += "</div>";

							$(request.containerNodeSelector).removeClass("cute-little-loading-indicator").html(barHtml);
						}
					});
				}
				else {
					var cellContent = renderData.rows[key][columns[ck].column];
					tableHtml += "<td>"+cellContent+"</td>";
				}
			}

			tableHtml += "</tr>";
		}
		
		tableHtml += "</tbody></table>";
		let tableNode = $(tableHtml);
		
		let reply = this.resultManager.sqs.sqsOffer("resultTableData", {
			data: renderData,
			node: tableNode
		});
		
		tableNode = reply.node;
		
		$('#result-table-container').append("<div class='datatable-container'></div>")
		
		$("#result-table-container .datatable-container").append(tableNode);
		$('#result-table-container').show();
		$("#result-datatable").DataTable({
			paging: true,
			bInfo: false,
			bFilter: false,
			order: [[ 1, "asc" ]],
			columnDefs: [
				{ "orderable": false, "targets": [0, 3, 4] }
			],
			drawCallback: (settings) => {
				let api = new $.fn.dataTable.Api(settings);
				let pageInfo = api.page.info();
				// Now you can use pageInfo object
				console.log(pageInfo);
			}
		});

		$("#result-datatable > thead").css("position", "sticky").css("top", "0").css("z-index", "1");

		this.resultManager.sqs.sqsEventDispatch("resultModuleRenderComplete");
	}

	renderDataTableNew() {
		this.resultManager.renderMsg(false);

		$('#result-table-container').html("");
		$('#result-table-container').show();

		if(this.sqs.config.showResultExportButton) {
			this.renderExportButton();
		}

		console.log(this.data)
		let maxAnalysisEntities = this.data.rows.reduce((max, row) => Math.max(max, row.analysis_entities), 0);

		this.tabulatorTable = new Tabulator("#result-table-container", {
			data: this.data.rows,
			layout: "fitColumns",
			initialSort:[             //set the initial sort order of the data
				{column:"analysis_entities", dir:"desc"},
			],
			selectable: true,
			columns:[
				{title: "Select", formatter: "rowSelection", titleFormatter:"rowSelection", headerSort:false, cellClick:function(e, cell){
					cell.getRow().toggleSelect(); // This will toggle the row selection on and off
				}},
				{title:"View site", field:"site_link_filtered", tooltip: true, cellClick: (e, cell) => {
					console.log(cell.getValue())
				}, formatter: (cell, formatterParams, onRendered) => {
						return `<div class='site-report-link site-report-table-button' site-id='${cell.getValue()}'><i class="fa fa-search" aria-hidden="true"></i> View site</div>`;
					}
				},
				{title:"Site ID", field:"site_link_filtered"},
				{title:"Site name", field:"sitename", tooltip: true},
				{title:"Analysis entities", field:"analysis_entities", formatter: (cell, formatterParams, onRendered) => {
					return `<div class='stacked-bar-outer-container'>
					<div class='stacked-bar-container'>
					<div class='stacked-segment' style='width: ${(cell.getValue() / maxAnalysisEntities * 100)}%; background-color: rgb(45, 94, 141);' title='${cell.getValue()}'></div>
					</div>
					<div class='stacked-bar-container-numerical-readout'>${cell.getValue()}</div>
					</div>`;
				}},
				{title:"Analyses", field:"analyses", formatter: (cell, formatterParams, onRendered) => {
					cell.getElement().innerHTML = "<div class='cute-little-loading-indicator'></div>";

					let containerNodeId = "analyses-"+cell.getData().site_link_filtered;
					this.sqs.asyncRender("#"+containerNodeId, {
						serverAddress: this.sqs.config.dataServerAddress,
						method: "ws",
						data: {
							type: "analysis_methods",
							siteId: cell.getData().site_link_filtered
						},
						callback: (request, data) => {
							let highestDatasetCount = 0;

							//sort analysis_methods_datasets on name
							data.analysis_methods_datasets.sort((a, b) => {
								if(a.method_name < b.method_name) { return -1; }
								if(a.method_name > b.method_name) { return 1; }
								return 0;
							});

							data.analysis_methods_datasets.forEach(amd => {
								if(amd.dataset_count > highestDatasetCount) {
									highestDatasetCount = amd.dataset_count;
								}
							});

							let totalDatasetCount = data.analysis_methods_datasets.reduce((total, amd) => total + amd.dataset_count, 0);

							let barHtml = "<div class='stacked-bar-container'>";
							data.analysis_methods_datasets.forEach(amd => {
								amd.color = "000";
								for(let key in this.sqs.config.analysisMethodsColors) {
									let amc = this.sqs.config.analysisMethodsColors[key];
									if(amc.method_id == amd.method_id) {
										amd.color = amc.color;
									}
								}
								amd.barWidth = (amd.dataset_count / totalDatasetCount) * 100;
								barHtml += `<div class='stacked-segment' style='width: ${amd.barWidth}%; background-color: #${amd.color};' title='Method: ${amd.method_name}, Datasets: ${amd.dataset_count}'></div>`;
							});
							barHtml += "</div>";
							cell.getElement().innerHTML = barHtml;
						}
					});

					return cell.getElement().innerHTML;
				}},
				
			],
		});

		this.resultManager.sqs.sqsEventDispatch("resultModuleRenderComplete");
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