import shortid from "shortid";

var $  = require( 'jquery' );
import "jszip";
import "datatables.net-dt";
import "datatables.net-buttons-dt";
import "datatables.net-buttons/js/buttons.colVis.js";
import "datatables.net-buttons/js/buttons.html5.js";
import "datatables.net-buttons/js/buttons.print.js";
import "datatables.net-colreorder-dt";
import "datatables.net-fixedheader-dt";
import "datatables.net-responsive-dt";

/*
* Class: SiteReportTable
*
* Makes fancy tables for site report data.
*
 */

class SiteReportTable {
	constructor(siteReport, contentItem) {
		this.siteReport = siteReport; //The parent site report
		this.sqs = this.siteReport.sqs;
		this.contentItem = contentItem; //This specific "contentItem" to render. This contains all the data we need.
		this.tableNode = null; //DOM node ref
		this.pagingRows = 10; //If more than this many rows in the table we enable paging (goes for both this table and its subtables)
		this.rowPkey = this.getRowPkey(); //Primary key column
		this.subTableColumnKey = false; //This will indicate which column contains the subtable when the data is loaded (normally it's index 0)
		this.dt = null;
		//Just making some shortcuts...
		this.columns = this.contentItem.data.columns;
		this.rows = this.contentItem.data.rows;
		this.rowsTooltips = this.contentItem.data.rowsTooltips;
		this.tooltipIds = [];
		
		this.contentItem.renderOptions.forEach((ro) => {
			if(ro.type == "table") {
				this.renderOptions = ro;
			}
			if(this.renderOptions && !this.renderOptions.hasOwnProperty("options")) {
				this.renderOptions.options = [];
			}
		});
	}

	/*
	* Function: render
	*
	* Render this "renderOption" in an appropriate way. Meaning as a table in this case.
	*
	* Parameters:
	*  anchorNodeSelector - Where to attach the table
	 */
	render(anchorNodeSelector) {
		this.anchorNodeSelector = anchorNodeSelector;
		//Make table node
		this.tableNodeId = "table-"+shortid.generate();
		this.tableNode = $("<table id='"+this.tableNodeId+"' class='site-report-table'><thead><tr></tr></thead><tbody></tbody></table>");
		
		this.renderTableHeader();

		var tbodyNode = $("tbody", this.tableNode);
		for(var key in this.rows) {
			var rowNode = this.renderTableRow(this.rows[key]);
			$(tbodyNode).append(rowNode);
		}

		//Attach table to DOM
		$(anchorNodeSelector).append(this.tableNode);
		
		//Bind callbacks to any cell-buttons that might have been rendered - I apologize to future me for this nesting, it's not as bad as it looks
		for(let rk in this.rows) {
			let row = this.rows[rk];
			for(let ck in row) {
				let cell = row[ck];
				if(typeof cell.buttons != "undefined") {
					for(let bk in cell.buttons) {
						let button = cell.buttons[bk];
						$("#"+button.nodeId).on("click", (evt) => {
							evt.preventDefault();
							evt.stopPropagation();
							button.callback(evt);
						});
					}
				}
			}
		}

		this.renderOptions.options.forEach((option) => {
			if(option.name == "showNumRows") {
				this.pagingRows = option.value;
			}
		});
		

		//Make into DataTable
		this.dt = $(this.tableNode).DataTable({
			"responsive": true,
			"paging": this.rows.length > this.pagingRows,
			"bInfo": false,
			"bFilter": false,
			"sDom": '<"top"i>rt<"bottom"flp><"clear">',
			"order": [[1, 'asc']]
		});
		
	
		//Needed to make the table responsive
		$(this.tableNode).css("width", "100%");
		
		//Hook onto table paging events
		$(this.tableNode).on("draw.dt", (a, b, c, d, e) => {
			if(this.hasSubTable() && $(b.nTable).hasClass("site-report-subtable") === false) {
				this.resetAllSubTableExpansions();
			}
			
			var currentRows = this.getCurrentlyDisplayedRows();
			for(var key in currentRows) {
				var rowId = currentRows[key][this.rowPkey];
				this.renderAggregatedColumnValues(rowId);
			}
		});
		
		if(this.hasSubTable()) { //if there's no subtable then there's no agg either
			this.renderAggregationLegends();
			
			var currentRows = this.getCurrentlyDisplayedRows();
			for (var key in currentRows) {
				var rowId = currentRows[key][this.rowPkey];
				this.renderAggregatedColumnValues(rowId);
			}
			
			this.makeSubTableAggregationBarBindings();
		}
		
		return this;
	}

	updateData(contentItem) {
		let expandedRows = this.getRenderedSubTableRows();
		this.unrender();

		this.contentItem = contentItem;
		this.columns = this.contentItem.data.columns;
		this.rows = this.contentItem.data.rows;
		this.rowsTooltips = this.contentItem.data.rowsTooltips;

		this.render(this.anchorNodeSelector);

		if(expandedRows !== false) {
			this.expandSubTablesForRows(expandedRows);
		}
	}
	
	unrender() {
		this.tooltipIds.forEach(ttId => {
			this.siteReport.sqs.tooltipManager.unRegisterTooltip(ttId);
		});

		this.dt.destroy();
		$("#"+this.tableNodeId).remove();
	}

	expandSubTablesForRows(rows) {
		rows.forEach((row) => {
			this.triggerSubTable(row[this.rowPkey].value);
		});
	}

	getRenderedSubTableRows() {
		if(!this.hasSubTable()) {
			return false;
		}
		let expandedRows = [];
		this.rows.forEach((row) => {
			if(row[this.getSubTableKey()].value.expanded) {
				expandedRows.push(row);
			}
		});
		return expandedRows;
	}

	hasSubTable() {
		for(var key in this.contentItem.data.columns) {
			if(this.contentItem.data.columns[key].dataType == "subtable") {
				return true;
			}
		}
		return false;
	}
	
	getCurrentlyDisplayedRows() {
		var page = this.dt.page.info().page;
		var pageLength = this.dt.page.info().length;
		
		if(pageLength == -1) { //If there's no paging going on, this will be -1, which is a problem, so change it to whatever is set as the default paging length in the class.
			pageLength = this.pagingRows;
		}
		
		return this.rows.slice(page*pageLength, (page*pageLength)+pageLength);
	}

	renderAggregationLegends() {
		for(var key in this.columns) {
			if(this.columns[key].dataType == "aggregation") {
				var aggLegendBtn = this.getAggregationColumnLegendButton(this.columns[key]);
				$("[colkey="+key+"]", this.tableNode).append(aggLegendBtn);
			}
		}
	}

	getAggregationColumnLegendButton(column) {
		//1. Count to total number of (unique) categories in all the rows
		var categories = {};
		var categoriesNum = 0;
		for(var key in this.rows) {
			
			for(var subTableRowKey in this.rows[key][this.getSubTableKey()].rows) {
				var value = this.rows[key][this.getSubTableKey()].rows[subTableRowKey][column.subTableColumnKey];

				if(categories.hasOwnProperty(value)) {
					categories[value] += 1;
				}
				else {
					categories[value] = 1;
					categoriesNum++;
				}
			}
		}

		//2. Make a color scheme for these
		var colors = this.siteReport.getColorScheme(categoriesNum);
		var colorScheme = {};

		var i = 0;
		for(var key in categories) {
			colorScheme[key] = colors[i++];
		}

		column.colorScheme = colorScheme;
		
		//3. And so on, and so forth...
		var aggregationLegend = "<div column-key='"+this.getSubTableKey()+"' class='site-report-table-aggregation-legend-button-container'>";

		for(var i = 0; i < 4; i++) {
			var color = "#888";
			if(typeof(colors[i]) != "undefined") {
				color = colors[i];
			}

			var posTop = 0;
			var posLeft= 0;
			if(i == 1 || i == 3) {
				posLeft = 10;
			}
			if(i > 1) {
				posTop = 10;
			}

			aggregationLegend += "<div class='site-report-table-aggregation-legend-button-background-tile' style='top:"+posTop+"px;left:"+posLeft+"px;background-color:"+color+"'></div>";
		}

		aggregationLegend += "<span class=\"fa fa-question-circle-o site-report-table-aggregation-legend-button\" aria-hidden=\"true\"></span>";
		aggregationLegend += "</div>";
		var aggLegNode = $(aggregationLegend);


		var legend = [];
		for(var key in categories) {
			legend.push({
				"name": key,
				"color": column.colorScheme[key],
				"total": 0
			});
		}

		var popperHtml = "<div class='site-report-table-legend-container'><div class='site-report-legend-title'>Legend</div>";
		popperHtml += "<div class='site-report-table-popper-content-container'>";
		for(var key in legend) {
			popperHtml += "<div class='legend-row'>";
			popperHtml += "<span class='site-report-table-popper-content legend-color-squares' style='width:20px;height:20px;background-color:"+legend[key].color+"'></span>";
			popperHtml += "<span class='site-report-table-popper-content'>"+legend[key].name+"</span>";
			popperHtml += "</div>";
		}
		popperHtml += "</div>";
		popperHtml += "</div>";
		
		let tt = this.siteReport.sqs.tooltipManager.registerTooltip(aggLegNode, popperHtml, {html: false});
		this.tooltipIds.push(tt);
		return aggLegNode;
	}

	resetAllSubTableExpansions() {
		for(var key in this.rows) {
			this.rows[key][this.getSubTableKey()].expanded = false;
		}
	}

	renderTableHeader() {

		//FIXME: Take into account hidden columns

		for(var key in this.columns) {
			if(this.columns[key].dataType != "subtable") {
				//var colTitleNode = $("<td>"+this.columns[key].title+"&nbsp;<i column='"+key+"' class=\"fa fa-eye-slash table-hide-column-btn\" aria-hidden=\"true\"></i></td>"); //with hide-column-button
				
				let columnClasses = "all ";
				if(typeof this.columns[key].hidden != "undefined" && this.columns[key].hidden) {
					columnClasses += "hidden-column";
				}
				
				var colTitleNode = $("<td class='"+columnClasses+"'>"+this.columns[key].title+"</td>");
				colTitleNode.attr("colKey", key);
				/*
				$(".table-hide-column-btn", colTitleNode).on("click", (evt) => {
					evt.stopPropagation();
					var columnId = parseInt($(evt.currentTarget).attr("column"));
					if(this.hasSubTable()) {
						columnId--; //-1 here if there's a subtable
					}
					this.setColumnVisbility(columnId, false);
				});
				*/
				$("thead > tr", this.tableNode).append(colTitleNode);
			}
		}
	}

	renderTableRow(row) {
		
		let rowClasses = "site-report-table-row subtable-collapsed";
		if(this.hasSubTable()) {
			rowClasses += " site-report-table-row-with-subtable"
		}
		var rowPrimaryKeyValue = row[this.rowPkey].value;
		var rowNode = $("<tr row-id='"+rowPrimaryKeyValue+"' class='"+rowClasses+"'></tr>");

		for(var colKey in row) {
			var currentColumn = this.columns[colKey];

			var cellNodeId = "cell-"+shortid.generate();
			
			let colClasses = "";
			if(typeof currentColumn.hidden != "undefined" && currentColumn.hidden === true) {
				colClasses += "hidden-column";
			}
			

			if(row[colKey].type == "cell") {
				var value = row[colKey].value;
				var tooltip = row[colKey].tooltip;
				
				if(row[colKey].hasOwnProperty("callback") && typeof(row[colKey].callback) == "function") {
					row[colKey].callback(row, cellNodeId);
				}
				
				if(currentColumn.dataType == "aggregation") {
					var barChartContainerNodeId = this.tableNodeId+"-"+shortid.generate();
					rowNode.append("<td id='"+cellNodeId+"'><div id='"+barChartContainerNodeId+"'></div></td>");
					//var barChartContainerNode = $("#"+barChartContainerNodeId, rowNode);
					//this.renderAggregatedColumnValue(barChartContainerNode, currentColumn, row);
				}
				else {
					
					if(row[colKey].hasOwnProperty("tooltip") && row[colKey].tooltip != "") {
						
						var tooltipMsg = "";
						var options = null;
						if(typeof(row[colKey].tooltip) == "string" && row[colKey].tooltip != null) {
							tooltipMsg = row[colKey].tooltip;
							options = {drawSymbol:true};
						}
						if(typeof(row[colKey].tooltip) == "object" && row[colKey].tooltip != null) {
							tooltipMsg = row[colKey].tooltip.msg;
							options = row[colKey].tooltip.options;
						}
						
						let tt = this.siteReport.sqs.tooltipManager.registerTooltip("#"+cellNodeId, tooltipMsg, options);
						this.tooltipIds.push("#"+cellNodeId);
					}
					
					//buttons
					if(typeof row[colKey].buttons != "undefined") {
						let buttons = row[colKey].buttons;
						for(let bk in buttons) {
							value += "<div id='"+buttons[bk].nodeId+"' class='sample-group-analysis-infobox'>"+buttons[bk].title+"</div>";
						}
					}

					var cellNode = $("<td id='"+cellNodeId+"' class='"+colClasses+"'>"+value+"</td>");
					rowNode.append(cellNode);
				}
			}
		}

		$(rowNode).on("click", (evt) => {
			var rowNode = $(evt.currentTarget);
			var rowId = rowNode.attr("row-id");
			this.triggerSubTable(rowId);
		});

		return rowNode;
	}

	triggerSubTable(rowId) {
		if(this.getSubTableKey() === false) {
			return;
		}

		var r = this.getTableRowByPkey(rowId);
		
		var subTable = r[this.getSubTableKey()].value;

		if(!subTable.hasOwnProperty("expanded")) {
			subTable.expanded = false;
		}
		
		if(subTable.expanded === false) {
			this.renderSubTable(rowId, subTable);
			subTable.expanded = true;
		}
		else {
			this.unrenderSubTable(rowId);
			subTable.expanded = false;
		}
	}

	getTableRowByPkey(rowId) {
		for(var key in this.rows) {
			if(this.rows[key][this.rowPkey].value == rowId) {
				return this.rows[key];
			}
		}
	}
	
	getRowById(rowId) {
		var sampleGroupIdFieldKey = null;
		for(var k in this.columns) {
			if(this.columns[k].pkey === true) {
				sampleGroupIdFieldKey = k;
			}
		}

		for(var k in this.rows) {
			if(this.rows[k][sampleGroupIdFieldKey] == rowId) {
				return this.rows[k];
			}
		}
	}

	getRowPkey() {
		for(var key in this.contentItem.data.columns) {
			if(this.contentItem.data.columns[key].pkey) {
				return key;
			}
		}
		return false;
	}
	
	getSubTableKey() {
		if(!this.hasSubTable()) {
			return false;
		}
		if(this.subTableColumnKey === false) {
			for(var key in this.columns) {
				if (this.columns[key].dataType == "subtable") {
					this.subTableColumnKey = parseInt(key);
					return this.subTableColumnKey;
				}
			}
		}
		else {
			return this.subTableColumnKey;
		}
		return false;
	}

	getTotalAggregatedColumnValue(column, rows, withColors = true) {
		var columnKey = null;
		for(var key in rows[0].subtable.columns) {
			if(rows[0].subtable.columns[key].name == column.aggregation.subtableColumn) {
				columnKey = key;
			}
		}

		var result = {};
		for(var key in rows) {
			for(var subtableRowKey in rows[key].subtable.rows) {
				var value = rows[key].subtable.rows[subtableRowKey][columnKey];
				if(typeof(result[value]) == "undefined") {
					result[value] = {
						count: 1
					}
				}
				else {
					result[value].count++;
				}
			}
		}

		if(withColors) {
			var colors = this.siteReport.getColorScheme(Object.keys(result).length);
			for(var key in result) {
				var color = colors.shift();
				result[key].color = color;
			}
		}

		return result;
	}

	renderAggregatedColumnValues(rowId) {
		var row = this.getRowById(rowId);
		if(!row.aggregationRendered) {
			for(var ckey in this.columns) {
				if(this.columns[ckey].dataType == "aggregation") {
					
					//This column is of the aggregation type.
					//Now find the row for this samplegroup and render the aggro into the right cell
					var cellNode = $("[row-id="+rowId+"] > td", this.tableNode).get(ckey-1);
					cellNode = $(cellNode).find("div");
					
					if(cellNode.length > 0) { //If this row is currently being displayed (table paging)
						this.renderAggregatedColumnValue(cellNode, this.columns[ckey], row);
					}
					else {
						console.log("WARN: Couldn't find target cell when rendering aggregation.");
					}
				}
			}
			row.aggregationRendered = true;
		}
	}

	getSubTableForRow(row) {
		return row[this.getSubTableKey()];
	}

	renderAggregatedColumnValue(containerNode, column, row) {
		var subTable = this.getSubTableForRow(row);

		var aggResult = {};
		for(var key in subTable.rows) {
			var instanceValue = subTable.rows[key][column.subTableColumnKey];
			if(typeof(aggResult[instanceValue]) == "undefined") {
				aggResult[instanceValue] = 1;
			}
			else {
				aggResult[instanceValue]++;
			}
		}

		var html = "<div class='site-report-table-aggregation-container'>";
		var grandTotal = 0;
		for(var k in aggResult) {
			grandTotal += aggResult[k];
		}

		var fieldKeys = Object.keys(aggResult).sort();
		for(var key in fieldKeys) {
			var subCatName = fieldKeys[key];
			var color = "#888";
			var value = aggResult[subCatName];
			
			color = column.colorScheme[subCatName];
			html += "<div id='' subtable-target-column='"+column.title+"' agg-name='"+subCatName+"' agg-value='"+value+"' agg-total='"+grandTotal+"' class='site-report-table-aggregation-field' style='width:0px;background-color:"+color+";'></div>";
		}
		html += "</div>";
		var node = $(html);
		$(containerNode).html(node);

		$(".site-report-table-aggregation-field", node).each((i, el) => {
			var perc = $(el).attr("agg-value") / $(el).attr("agg-total") * 100;
			setTimeout(() => {
				$(el).animate({
					width: perc+"px"
				}, 250);
			}, (Math.random()*500));
		});
	}

	makeSubTableAggregationBarBindings() {

		$(".site-report-table-aggregation-field").each((index, el) => {
			$(el).on("mouseover", (evt) => {
				this.setSubtableAggregationColumnHighlights(el, true);
				$(el).animate({
					"border-color": "#fff",
					"border-left-width": "1px",
					"border-right-width": "1px",
					"margin-left": "5px",
					"margin-right": "5px"
				}, 100);
			}).on("mouseout", (evt) =>  {
				this.setSubtableAggregationColumnHighlights(el, false);
				$(el).stop().animate({
					"border-color": "#000",
					"border-left-width": "0px",
					"border-right-width": "0px",
					"margin-left": "0px",
					"margin-right": "0px"
				}, 100);
			});

			var name = $(el).attr("agg-name");
			var value = $(el).attr("agg-value");
			var total = $(el).attr("agg-total");

			var p = Math.round((value / total) * 100);
			var popperHtml = "<div class='site-report-legend-title'>"+name+"</div>";
			popperHtml += "<div class='site-report-table-popper-content-container'>";
			popperHtml += "<span class='site-report-table-popper-content'><span style='font-size:1.4em;'>"+value+"</span>/<span style='font-size:0.8em;'>"+total+"</span></span>";
			popperHtml += "<span class='site-report-table-popper-content' style='font-size:1.4em;'>"+p+"%</span>";
			popperHtml += "</div>";

			//this.siteReport.siteReportManager.sqs.tooltipManager.registerTooltip("site-report-aggregation-bar-legend-"+index, $(el)[0], popperHtml, { "stickyWhenClicked": false })

			let tt = this.siteReport.siteReportManager.sqs.tooltipManager.registerTooltip($(el), popperHtml);
		});
	}

	setSubtableAggregationColumnHighlights(aggNode, on) {
		var name = $(aggNode).attr("agg-name");
		var subtableTargetColumn = $(aggNode).attr("subtable-target-column");
		var subTable = $(aggNode).parent().parent().parent().parent().next();

		if(subTable.length > 0) {
			var columnIndex = 0;
			$(".site-report-subtable thead td", subTable).each((i, el) => {
				if ($(el).text() == subtableTargetColumn) {
					columnIndex = i;
				}
			});

			$(".site-report-subtable tbody tr", subTable).each((i, trEl) => {
				$("td", trEl).each((i, el) => {
					if (i == columnIndex) {
						if ($(el).text() == name) {
							if (on) {
								$("td", trEl).css("background", "#999");
								$("td", trEl).first().css("background", "linear-gradient(to left, #999, #999, #c6c6c6)");
								$("td", trEl).last().css("background", "linear-gradient(to right, #999, #999, #c6c6c6)");
							}
							else {
								$("td", trEl).css("background", "");
							}
						}
					}
				});
			});
		}
	}

	renderSubTable(sampleGroupId, subTable) {
		var subTableId = "subtable-"+shortid.generate();
		
		var subTableHtml = "<table id='"+subTableId+"' class='site-report-subtable'><thead>";
		subTableHtml += "<tr>";
		subTable.columns.forEach((d, i) => {
			subTableHtml += "<td>"+d.title+"</td>";
		});

		subTableHtml += "</tr>";
		subTableHtml += "</thead><tbody>";

		subTable.rows.forEach((row, i) => {
			subTableHtml += "<tr>";
			for(var vk in row) {
				var cellNodeId = "cell-"+shortid.generate();
				if(row[vk].hasOwnProperty("callback") && typeof(row[vk].callback) == "function") {
					row[vk].callback(row, cellNodeId);
				}
				
				if(row[vk].hasOwnProperty("tooltip") && row[vk].tooltip != "") {
					let tt = this.siteReport.sqs.tooltipManager.registerTooltip("#"+cellNodeId, row[vk].tooltip, {drawSymbol:true});
					this.tooltipIds.push("#"+cellNodeId);
				}
				
				subTableHtml += "<td id='"+cellNodeId+"'>"+row[vk].value+"</td>";
				
			}
			subTableHtml += "</tr>";
		});

		subTableHtml += "</tbody></table>";

		var colsNum = this.columns.length;
		var rowHtml = "<tr class='hidden site-report-subtable-row'>";
		rowHtml += "<td colspan='"+colsNum+"'>"+subTableHtml+"</td>";
		rowHtml += "</tr>";

		//var rowId = row[this.rowPkey];
		var rowId = sampleGroupId;

		$(rowHtml).insertAfter($("[row-id="+rowId+"]").first()).show();

		$("#"+subTableId).DataTable({
			"responsive": true,
			"paging": subTable.rows.length > this.pagingRows,
			"bInfo": false,
			"bFilter": false,
			"sDom": '<"top"i>rt<"bottom"flp><"clear">'
		});

		$("#"+subTableId).css("width", "100%");
	}

	unrenderSubTable(sampleGroupId) {
		var subTableRow = $("[row-id="+sampleGroupId+"]").next();
		if(subTableRow.hasClass("hidden site-report-subtable-row")) {
			subTableRow.remove();
		}
	}


	renderContentDisplayOptionsPanel(section, contentItem) {
		/* NOTE: DISABLED BECAUSE DATATABLES COLUMN VISIBILITY DOESN'T WORK PROPERLY - IT REARRANGES THE ORDER OF THE COLUMNS SO THAT THE WRONG DATA ENDS UP UNDER THE WRONG HEADLINE - WHICH IS BAD
		let roNode = $(this.anchorNodeSelector).parent().find(".site-report-render-options-container-extras");
		roNode.html("");

		let renderOptionKey = this.sqs.findObjectPropInArray(contentItem.renderOptions, "type", "table");
		let optionItemKey = this.sqs.findObjectPropInArray(contentItem.renderOptions[renderOptionKey].options, "name", "columnsVisibility");
		let renderOption = contentItem.renderOptions[renderOptionKey].options[optionItemKey];

		for(let key in renderOption.hiddenColumns) {
			renderOption.hiddenColumns[key];
		}

		let columnOptionsHtml = "<label class='site-report-view-selector-label site-report-render-option-setting'>Column visibility:</label>";
		columnOptionsHtml += "<table class='site-report-table-column-visibility-options-container site-report-render-option-setting'>";
		for(let key in contentItem.data.columns) {
			if(contentItem.data.columns[key].dataType != "subtable") {
				let checked = this.dt.columns().visible(key) ? "checked" : "";
				columnOptionsHtml += "<tr><td>"+contentItem.data.columns[key].title+"</td><td><input value='"+key+"' class='site-report-table-column-visibility-option' type='checkbox' "+checked+" /></td></tr>";
			}
		}
		columnOptionsHtml += "</table>";

		roNode.append(columnOptionsHtml);

		$(this.anchorNodeSelector).parent().find("input.site-report-table-column-visibility-option").on("click", (evt) => {
			let columnKey = parseInt(evt.currentTarget.value);
			let visible = evt.currentTarget.checked;

			if(!this.hasSubTable()) {
				columnKey++;
			}
			
			this.setColumnVisbility(columnKey, visible);
		});
		*/
	}

	/*
	* Function: setColumnVisibility
	* 
	* Parameters:
	* columnKey - The column to show/hide, starting at 1 and not counting subtables, so 1 is always the first column
	* visible - True/false
	*/
	setColumnVisbility(columnKey, visible = true) {
		console.log("setColumnVisbility", columnKey, visible);
		columnKey--;
		this.dt.column(columnKey).visible(visible);
		let nodes = $(this.anchorNodeSelector).parent().find(".site-report-table-column-visibility-option");

		nodes.each((value, node) => {
			let nodeVal = parseInt($(node).val());
			//console.log(columnKey, nodeVal);
			if(nodeVal == columnKey) {
				$(node).prop("checked", visible);
			}
		});
	}
}

export { SiteReportTable as default }