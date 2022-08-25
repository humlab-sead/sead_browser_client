//import Config from '../../config/config.js'
import DataTables from 'datatables';
import '../../../node_modules/datatables/media/css/jquery.dataTables.min.css';
import ResultModule from './ResultModule.class.js'
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
		this.renderDataTable();
		return true;
	}

	renderExportButton() {
		if($("#result-table-container .result-export-button").length > 0) {
			return;
		}
		let exportButton = $("<div></div>").addClass("result-export-button").html("Export");
		$("#result-table-container").append(exportButton);
		this.bindExportModuleDataToButton(exportButton);
	}

	/*
	* Function: renderDataTable
	*/
	renderDataTable() {

		this.resultManager.renderMsg(false);

		$('#result-table-container').html("");

		this.renderExportButton();

		var renderData = JSON.parse(JSON.stringify(this.data)); //Make a copy

		var columns = [
			{
				"title": "Site ID",
				"column": "site_link_filtered"
			},
			{
				"title": "Site name",
				"column": "sitename"
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
				var cellContent = renderData.rows[key][columns[ck].column];
				tableHtml += "<td>"+cellContent+"</td>";
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
			paging: false,
			bInfo: false,
			bFilter: false,
			order: [[ 1, "asc" ]]
		});

		this.resultManager.sqs.sqsEventDispatch("resultModuleRenderComplete");

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