import Config from '../../config/config.js'
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
		this.prettyName = "Tabular";
		this.icon = "<i class=\"fa fa-table\" aria-hidden=\"true\"></i>";
		this.maxRenderCount = 100000;
		this.hasCurrentData = false;
		this.data = {
			columns: [],
			rows: []
		};
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
				if(respData.requestId == this.requestId && this.resultManager.getActiveModule().name == this.name) {
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

		for(var key in data.meta.columns) {
			var c = data.meta.columns[key];
			this.data.columns.push({
				title: c.displayText,
				field: c.fieldKey
			});
		}

		var rowsCount = data.data.dataCollection.length;
		
		if(rowsCount > this.maxRenderCount) {
			this.unrender();
			this.resultManager.renderMsg(true, {
				title: "Too much data",
				body: "This dataset contains "+rowsCount+" rows of data. Please narrow down you search to fall within "+this.maxRenderCount+" rows of data by applying more filters."
			});
			return;
		}
		else {
			/*
			$("#result-container").notify("Loaded "+rowsCount+" rows of data.", {
				elementPosition: "top left",
				className: "info"
			});
			*/
			
		}

		for(var key in data.data.dataCollection) {
			var d = data.data.dataCollection[key];

			var row = {};

			var i = 0;
			for(var ck in this.data.columns) {
				row[this.data.columns[ck].field] = d[i];
				i++;
			}

			this.data.rows.push(row);
		}

		this.renderData();
	}
	
	/*
	* Function: render
	*/
	render() {
		var xhr = this.fetchData();
		xhr.then((data, textStatus, xhr) => { //success
			//If this module has gone inactive (normally by being replaced) since this request was sent, ignore the response
			if(this.active) {
				this.renderData();
			}
		},
		function(xhr, textStatus, errorThrown) { //error
			console.log(errorThrown);
		});
	}
	
	/*
	* Function: renderData
	*/
	renderData() {
		if(true) {
			this.renderDataTable();
			return true;
		}
		else {
			return false;
		}
	}

	/*
	* Function: renderDataTable
	*/
	renderDataTable() {

		this.resultManager.renderMsg(false);

		$('#result-table-container').html("");
		$('#result-table-container').html("<table id='result-datatable'></table>");

		var renderData = JSON.parse(JSON.stringify(this.data)); //Make a copy
		renderData = this.resultManager.hqs.hqsOffer("resultTableData", {
			data: renderData
		}).data;


		var columns = [
			{
				"title": "Site Report",
				"column": "site_link"
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
				"title": "Record type",
				"column": "record_type"
			}
		];

		var colHTML = "<thead><tr>";
		for(var key in columns) {
			colHTML += "<td>"+columns[key].title+"</td>";
		}
		colHTML += "</tr></thead>";
		$('#result-datatable').append(colHTML);

		var bodyHTML = "<tbody>";
		for(var key in renderData.rows) {
			var rowHTML = "<tr>";

			for(var ck in columns) {
				var cellContent = renderData.rows[key][columns[ck].column];
				rowHTML += "<td>"+cellContent+"</td>";
			}

			rowHTML += "</tr>";
			bodyHTML += rowHTML;
		}
		bodyHTML += "</tbody>";
		$('#result-datatable').append(bodyHTML);
		$('#result-table-container').show();
		$('#result-datatable').DataTable({
			paging: false,
			bInfo: false,
			bFilter: false
		});


		this.resultManager.hqs.hqsEventDispatch("resultModuleRenderComplete");

	}

	/*
	* Function: renderDataTableOld
	*/
	renderDataTableOld() {

		this.resultManager.renderMsg(false);

		$('#result-table-container').html("");
		$('#result-table-container').html("<table id='result-datatable'></table>");
		
		var renderData = JSON.parse(JSON.stringify(this.data)); //Make a copy
		renderData = this.resultManager.hqs.hqsOffer("resultTableData", {
			data: renderData
		}).data;

		var colHTML = "<thead><tr>";
		for(var key in columns) {
			colHTML += "<td>"+renderData.columns[key].title+"</td>";
		}
		colHTML += "</tr></thead>";
		$('#result-datatable').append(colHTML);

		var bodyHTML = "<tbody>";
		for(var key in renderData.rows) {
			var rowHTML = "<tr>";
			for(var rk in renderData.rows[key]) {
				var cellContent = "";
				cellContent = renderData.rows[key][rk];
				/*
				if(rk == "site_link") {
					cellContent = "<span class='site-report-link' site-id='"+renderData.rows[key][rk]+"'>"+renderData.rows[key][rk]+"</span>";
				}
				else {
					cellContent = renderData.rows[key][rk];
				}
				*/
				
				rowHTML += "<td>"+cellContent+"</td>";
			}
			rowHTML += "</tr>";
			bodyHTML += rowHTML;
		}
		bodyHTML += "</tbody>";
		$('#result-datatable').append(bodyHTML);
		$('#result-table-container').show();
		$('#result-datatable').DataTable({
			paging: false,
			bInfo: false,
			bFilter: false
		});

		this.resultManager.hqs.hqsEventDispatch("resultModuleRenderComplete");
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