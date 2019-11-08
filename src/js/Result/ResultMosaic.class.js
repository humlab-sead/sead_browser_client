import Config from '../../config/config.js'
import ResultModule from './ResultModule.class.js'
import chartjs from 'chart.js';
import * as d3 from 'd3';
import ol from 'ol';
import ResultMap from "./ResultMap.class";

class ResultMosaic extends ResultModule {
	constructor(resultManager) {
		super(resultManager);
		this.hqs = this.resultManager.hqs;
		this.name = "mosaic";
		this.prettyName = "Overview";
		this.icon = "<i class=\"fa fa-pie-chart\" aria-hidden=\"true\"></i>";
		this.tileSize = 400; //px (both height & width) of a mosaic tile
		this.currentZoomLevel = 4;
		this.requestBatchId = 0;

		this.modules = [
			{
				title: "Sampling methods",
				name: "mosaic-sample-methods",
				callback: this.renderSampleMethods
			},
			{
				title: "Site distribution",
				name: "mosaic-map",
				callback: () => {
					this.resultMap = new ResultMap(this.resultManager, "#mosaic-map");
					this.resultMap.fetchData();
				}
			},
			{
				title: "Analytical methods",
				name: "mosaic-analysis-methods",
				callback: this.renderAnalysisMethods
			},
			{
				title: "Feature types",
				name: "mosaic-feature-types",
				callback: this.renderFeatureTypes
			}
		];
	}
	
	clearData() {
		this.data.columns = [];
		this.data.rows = [];
	}
	
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
				if(respData.RequestId == this.requestId && this.resultManager.getActiveModule().name == this.name) { //Only load this data if it matches the last request id dispatched. Otherwise it's old data.
					this.importResultData(respData);
					this.resultManager.showLoadingIndicator(false);
				}
				else {
					console.log("WARN: ResultMosaic discarding old result package data ("+respData.requestId+"/"+this.requestId+").");
				}
			},
			error: (respData, textStatus, jqXHR) => {
				sead.resultManager.showLoadingIndicator(false, true);
			},
			complete: (xhr, textStatus) => {
			}
		});
	}
	
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
	}
	
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
	
	renderData() {
		this.unrender();

		this.resultManager.renderMsg(false);
		$('#result-mosaic-container').html("");
		$('#result-mosaic-container').css("display", "grid");

		this.sites = [];
		for(let key in this.data.rows) {
			if(Number.isInteger(this.data.rows[key].site_link)) {
				this.sites.push(this.data.rows[key].site_link);
			}
		}

		this.requestBatchId++;
		for(let key in this.modules) {
			$('#result-mosaic-container').append("<div class='result-mosaic-tile'><h2>"+this.modules[key].title+"</h2><div id='"+this.modules[key].name+"' class='result-mosaic-graph-container'></div></div>");
			this.modules[key].callback("#"+this.modules[key].name, this);
		}
		
		this.hqs.hqsEventDispatch("resultModuleRenderComplete");
	}

	prepareChartData(data_key_name, data_value_name, data) {
		let types = [];
		for(let key in data) {
			let type_id = data[key][data_key_name];
			
			if(typeof(types[type_id]) == "undefined") {
				types[type_id] = {
					methodId: data[key].type_id,
					featureType: data[key][data_value_name],
					count: 1
				};
			}
			else {
				types[type_id].count++;
			}
		}

		let chartSeries = [];
		for(let key in types) {
			chartSeries.push({
				"values": [types[key].count],
				"text": types[key].featureType
			});
		}
		
		return chartSeries;
	}

	renderFeatureTypes(renderIntoNode, resultMosaic) {
		let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_feature_types", resultMosaic.requestBatchId);

		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}

			let chartSeries = resultMosaic.prepareChartData("feature_type_id", "feature_type_name", promiseData.data);

			resultMosaic.renderBarChart(renderIntoNode, chartSeries);
		});
	}

	renderAnalysisMethods(renderIntoNode, resultMosaic) {
		$(renderIntoNode).html("");
		let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_analysis_methods", resultMosaic.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}

			let chartSeries = resultMosaic.prepareChartData("method_id", "method_name", promiseData.data);

			resultMosaic.renderPieChart(renderIntoNode, chartSeries, "Analysis methods");
		});
	}

	renderSampleMethods(renderIntoNode, resultMosaic) {
		$(renderIntoNode).html("");
		let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_methods", resultMosaic.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}

			let chartSeries = resultMosaic.prepareChartData("method_id", "method_name", promiseData.data);

			resultMosaic.renderPieChart(renderIntoNode, chartSeries, "Sampling methods");
		});
	}

	renderBarChart(renderIntoNode, chartSeries, chartTitle) {
		var config = {
			"type":"bar",
			"background-color": "transparent",
			"series":chartSeries,
			"plot":{
				"value-box":{
					"font-size":12,
					"font-family":"Georgia",
					"font-weight":"normal",
					"decimals": 0,
					"placement":"in",
					"font-color":"white",
				}
			},
			"tooltip":{
				"text": "%t (%v)",
				"html-mode": true,
				"decimals": 0,
				"align": 'left',
				"borderRadius": 3,
				"fontColor":"#000000",
				"fontSize": "16px",
				"backgroundColor": "#ffffff"
			},
			"plot":{
				"animation":{
					"effect":"ANIMATION_EXPAND_BOTTOM"
				}
			}
		};

		

		let colors = this.hqs.color.getColorScheme(config.series.length);
		let legendTextMaxLength = 15;
		for(let key in config.series) {
			config.series[key].backgroundColor = colors[key];
			if(config.series[key]["text"] != null && config.series[key]["text"].length > legendTextMaxLength) {
				config.series[key]["legend-text"] = config.series[key]["text"].substr(0, legendTextMaxLength)+"...";
			}
		}

		let rows = chartSeries.length;
		if(rows > 6) {
			rows = 6;
		}
		config.legend = {
			"highlight-plot":true,
			"draggable":true,
			"max-items":6,
			"overflow":"scroll",
			"drag-handler":"icon",
			"icon":{
				"line-color":"red"
			},
			"layout":rows+"x1", //row x column
			"toggle-action":"remove"
		};

		
		let renderTryInterval = setInterval(() => {
			if($(renderIntoNode).length == 0) {
				console.log("WARN(1): Tried to render mosaic chart before target element was available.");
			}
			else {
				clearInterval(renderTryInterval);
				zingchart.render({
					id : renderIntoNode.substr(1),
					data : config,
					height: "100%"
				});
			}
		}, 100);

		
	}
	
	renderPieChart(renderIntoNode, chartSeries, chartTitle) {

		var config = {
			"type":"pie",
			"background-color": "transparent",
			"series": chartSeries,
			"tooltip":{
				"text": "%t (%v)",
				"html-mode": true,
				"decimals": 0,
				"align": 'left',
				"borderRadius": 3,
				"fontColor":"#000000",
				"fontSize": "16px",
				"backgroundColor": "#ffffff"
			},
			"plot":{
				"animation":{
					"effect":"ANIMATION_EXPAND_LEFT"
				},
				"value-box":{
					"text": "%npv%",
					"font-size":12,
					"font-family":"Georgia",
					"font-weight":"normal",
					"decimals": 2,
					"placement":"out",
					"font-color":"#000",
					"rules": [
						{
							rule: "%npv > 5",
							placement: "in",
							'offset-r': "25%",
							'font-color': "white",
						},
						{
							rule: "%npv <= 5",
							placement: "out",
							'font-color': "black",
						}
					]
				}
			}
		};

		let colors = this.hqs.color.getColorScheme(config.series.length);
		let legendTextMaxLength = 15;
		for(let key in config.series) {
			config.series[key].backgroundColor = colors[key];
			if(config.series[key]["text"] != null && config.series[key]["text"].length > legendTextMaxLength) {
				config.series[key]["legend-text"] = config.series[key]["text"].substr(0, legendTextMaxLength)+"...";
			}
		}

		let rows = chartSeries.length;
		if(rows > 6) {
			rows = 6;
		}
		config.legend = {
			"highlight-plot":true,
			"draggable":true,
			"max-items":6,
			"overflow":"scroll",
			"drag-handler":"icon",
			"icon":{
				"line-color":"red"
			},
			"layout":rows+"x1", //row x column
			"toggle-action":"remove"
		};
		

		let renderTryInterval = setInterval(() => {
			if($(renderIntoNode).length == 0) {
				console.log("WARN(2): Tried to render mosaic chart before target element was available.");
			}
			else {
				clearInterval(renderTryInterval);
				zingchart.render({
					id : renderIntoNode.substr(1),
					data : config,
					height: "100%"
				});
			}
		}, 100);

		
	}

	async fetchSiteData(siteIds, dbView, requestId) {
		let queries = [];
		let itemsLeft = siteIds.length;

		let queryString = "(";
		for(let key in siteIds) {
			queryString += "site_id.eq."+siteIds[key]+",";
			if(queryString.length > 1024 && itemsLeft > 1) { //HTTP specs says max 2048
				queryString = queryString.substr(0, queryString.length-1);
				queryString += ")";
				queries.push(queryString);
				queryString = "(";
			}
			itemsLeft--;
		}
		queryString = queryString.substr(0, queryString.length-1);
		queryString += ")";
		queries.push(queryString);

		let queryData = [];
		for(let key in queries) {
			let requestString = this.hqs.config.siteReportServerAddress+"/"+dbView+"?or="+queries[key];
			
			let result = await $.ajax(requestString, {
				method: "get",
				dataType: "json",
				success: (data) => {
				}
			});
			for(let i in result) {
				queryData.push(result[i]);
			}
		}
		return {
			requestId: requestId,
			data: queryData
		};
	}

	selectRenderCategories() {
		var renderCategories = ["analysis_entities", "site_link", "site_link_filtered", "sitename"];
		
		return renderCategories;
	}
	
	
	unrender() {
		/*
		this.modules.map((module) => {
			zingchart.unbind(module.name);
			$("#"+module.name).remove();
		});
		*/

		$("#result-mosaic-container").hide();
		if(typeof(this.resultMap) != "undefined") {
			this.resultMap.unrender();
		}
	}
	
	exportSettings() {
		return {
		};
	}
	
	importSettings(settings) {
	}
	
}

export { ResultMosaic as default }