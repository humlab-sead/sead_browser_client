import Config from '../../config/config.js'
import ResultModule from './ResultModule.class.js'
import chartjs from 'chart.js';
import * as d3 from 'd3';
import ol from 'openlayers';
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
				if(respData.requestId == this.requestId && this.resultManager.getActiveModule().name == this.name) { //Only load this data if it matches the last request id dispatched. Otherwise it's old data.
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
		
		for(var key in data.meta.columns) {
			var c = data.meta.columns[key];
			this.data.columns.push({
				title: c.displayText,
				field: c.fieldKey
			});
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
		/*
		* Ratio of abundance/measured value analysis
		* Ratio of different analysis types
		* Average samples per site per location?
		* Map
		*/
		
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

		zingchart.render({ 
			id : renderIntoNode.substr(1), 
			data : config,
			height: "100%"
		});
	}
	
	renderPieChart(renderIntoNode, chartSeries, chartTitle) {
		var config = {
			"type":"pie",
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
					"effect":"ANIMATION_EXPAND_LEFT"
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
		
		zingchart.render({
			id : renderIntoNode.substr(1),
			data : config,
			height: "100%"
			
		});
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
	
	makeFakeData() {
		this.data.rows = [];
		for(var i = 0; i < 10; i++) {
			this.data.rows.push({
				sitename: "whatevs",
				record_type: "whatevs",
				analysis_entities: Math.random(0, 100),
				site_link: Math.random(0, 100),
				site_link_filtered: Math.random(0, 100)
			});
		}
	}
	
	renderBarChartOld(dataKey) {
		
		var chartCanvasId = "result-mosaic-"+dataKey+"-canvas";
		
		var c = d3.select("#result-mosaic-container").append("canvas")
			.attr("width", this.tileSize)
			.attr("height", this.tileSize)
			.attr("id", chartCanvasId);
		
		var ctx = $("#"+chartCanvasId)[0].getContext("2d");
		
		console.log(this.data);
		
		var axes = [{
			x: {
			
			},
			y: {
			
			}
		}];
		var xLabels = [];
		for(var key in this.data.columns) {
			xLabels.push(this.data.columns[key].title);
		}
		
		var xData = [];
		for(var key in this.data.rows) {
			xData.push(this.data.rows[key].analysis_entities);
		}
		
		var chartData = {
			labels: ["January", "February", "March", "April", "May", "June", "July"],
			datasets: [{
				label: "X-axis",
				borderColor: "#000",
				backgroundColor: "#f00",
				fill: false,
				data: [
					1,
					10,
					8,
					16,
					5
				],
				yAxisID: "y-axis-1",
			},
			{
				label: "My Second dataset",
				borderColor: "#00f",
				backgroundColor: "#00f",
				fill: false,
				data: [
					2,
					6,
					9,
					10,
					3
				],
				yAxisID: "y-axis-2"
			}]
		};
		
		chartData = {
			labels: ["Red", "Blue", "Yellow", "Green", "Purple", "Orange"],
			datasets: [{
				label: '# of Votes',
				data: [12, 19, 3, 5, 2, 3],
				backgroundColor: [
					'rgba(255, 99, 132, 0.2)',
					'rgba(54, 162, 235, 0.2)',
					'rgba(255, 206, 86, 0.2)',
					'rgba(75, 192, 192, 0.2)',
					'rgba(153, 102, 255, 0.2)',
					'rgba(255, 159, 64, 0.2)'
				],
				borderColor: [
					'rgba(255,99,132,1)',
					'rgba(54, 162, 235, 1)',
					'rgba(255, 206, 86, 1)',
					'rgba(75, 192, 192, 1)',
					'rgba(153, 102, 255, 1)',
					'rgba(255, 159, 64, 1)'
				],
				borderWidth: 1
			}]
		};
		
		new Chart(ctx, {
			type: 'bar',
			data: chartData,
			options: {
				responsive: true,
				legend: {
					position: 'top',
				},
				title: {
					display: true,
					text: 'Chart.js Bar Chart'
				}
			}
		});
		
	}
	
	renderBarChartD3(dataKey) {
		$('#result-mosaic-container').append("<div id='result-bar-chart-"+dataKey+"-container'></div>");
		$("#result-bar-chart-"+dataKey+"-container").append("<h3>"+dataKey+"</h3>");
		$("#result-bar-chart-"+dataKey+"-container").append("<svg id='result-bar-chart-"+dataKey+"' class='resultMosaicChart' width='"+this.tileSize+"' height='"+this.tileSize+"'></svg>");
		

		var svg = d3.select("#result-bar-chart-"+dataKey),
			width = +svg.attr("width"),
			height = +svg.attr("height"),
			radius = Math.min(width, height) / 2,
			g = svg.append("g")
				.attr("class", "d3Bars");
		
		var color = d3.scaleOrdinal(["#98abc5", "#8a89a6", "#7b6888", "#6b486b", "#a05d56", "#d0743c", "#ff8c00"]);
		
		var barsSelector = d3.select("#result-bar-chart-"+dataKey+" > .d3Bars")
			.selectAll("rect")
			.data(this.data.rows);
		
		var highestValue = 0;
		for(var key in this.data.rows) {
			highestValue = this.data.rows[key][dataKey] > highestValue ? this.data.rows[key][dataKey] : highestValue;
		}
		
		barsSelector.enter()
			.append("rect")
			.attr("class", "bar")
			.attr("stroke", (d, i) => {
				return "rgba(115,115,255, 0.75)";
			})
			.attr("stroke-weight", "2px")
			.attr("fill", (d, i) => {
				return "rgba(115,115,255,0.5)";
			})
			.attr("x", (d, i) => {
				return i*12;
			})
			.attr("y", (d, i) => {
				if(isNaN(d[dataKey])) {
					return 0;
				}
				else {
					return this.tileSize - (d[dataKey] / highestValue) * 100;
				}
			})
			.attr("width", 10)
			.attr("height", (d, i) => {
				if(isNaN(d[dataKey])) {
					return 0;
				}
				else {
					return (d[dataKey] / highestValue) * 100;
				}
			});
		
		barsSelector.exit().remove();
		
		
	}
	
	renderPieChartD3(dataKey) {
		
		$('#result-mosaic-container').append("<div id='result-pie-chart-"+dataKey+"-container'></div>");
		$("#result-pie-chart-"+dataKey+"-container").append("<h3>"+dataKey+"</h3>");
		$("#result-pie-chart-"+dataKey+"-container").append("<svg id='result-pie-chart-"+dataKey+"' class='resultMosaicChart' width='"+this.tileSize+"' height='"+this.tileSize+"'></svg>");
		
		
		var svg = d3.select("#result-pie-chart-"+dataKey),
			width = +svg.attr("width"),
			height = +svg.attr("height"),
			radius = Math.min(width, height) / 2,
			g = svg.append("g")
				.attr("class", "pieSlices")
				.attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");
		
		
		d3.select("#result-pie-chart-"+dataKey)
			.append("g")
			.attr("transform", "translate(" + width / 2 + "," + height / 2 + ")")
			.attr("class", "pieLabels");
		
		d3.select("#result-pie-chart-"+dataKey)
			.append("g")
			.attr("transform", "translate(" + width / 2 + "," + height / 2 + ")")
			.attr("class", "pieLabelLines");
		
		
		var color = d3.scaleOrdinal(["#98abc5", "#8a89a6", "#7b6888", "#6b486b", "#a05d56", "#d0743c", "#ff8c00"]);
		
		//Calculate arc angles
		var pieGen = d3.pie()
			.value(function (d) {
				return d[dataKey];
			});
		
		var arcDesc = pieGen(this.data.rows);
		
		
		var p = d3.select("#result-pie-chart-"+dataKey+" > .pieSlices")
			.selectAll("path")
			.data(this.data.rows);
		
		var l = d3.select("#result-pie-chart-"+dataKey+" > .pieLabels")
			.selectAll("text")
			.data(this.data.rows);
		
		p.enter()
			.append("path")
			.attr("class", "arc")
			.attr("fill", (d, i) => {
				return color(arcDesc[i].data[dataKey]);
			})
			.attr("d", (d, i) => {
				var arcGen = d3.arc()
					.innerRadius(40)
					.outerRadius(90)
					.startAngle(arcDesc[i].startAngle)
					.endAngle(arcDesc[i].endAngle);
				return arcGen();
			});
		
		p.exit().remove();
		
		l.enter()
			.append("text")
			.attr("dy", "0.35em")
			.style("text-anchor", function(d, i) {
				var midAngle = arcDesc[i].startAngle + (arcDesc[i].endAngle - arcDesc[i].startAngle)/2;
				return midAngle < Math.PI ? "end":"start";
			})
			.attr("transform", function(d, i) {
				var midAngle = arcDesc[i].startAngle + (arcDesc[i].endAngle - arcDesc[i].startAngle)/2;
				
				var outerArcGen = d3.arc()
					.innerRadius(radius * 0.8)
					.outerRadius(radius * 0.8)
					.startAngle(arcDesc[i].startAngle)
					.endAngle(arcDesc[i].endAngle);
				
				
				var pos = outerArcGen.centroid();
				pos[0] = radius * (midAngle < Math.PI ? 1 : -1);
				return "translate("+ pos +")";
				
			})
			.text((d) => {
				return d.sitename;
			});
		
		
		var polyline = d3.select("#result-pie-chart-"+dataKey+" > .pieLabelLines")
			.selectAll("polyline")
			.data(this.data.rows);
		
		polyline.enter()
			.append("polyline")
			.attr("points", (d, i) => {
				var midAngle = arcDesc[i].startAngle + (arcDesc[i].endAngle - arcDesc[i].startAngle)/2;
				var arcGen = d3.arc()
					.innerRadius(40)
					.outerRadius(90)
					.startAngle(arcDesc[i].startAngle)
					.endAngle(arcDesc[i].endAngle);
				
				var arcGen2 = d3.arc()
					.innerRadius(radius * 0.8)
					.outerRadius(radius * 0.8)
					.startAngle(arcDesc[i].startAngle)
					.endAngle(arcDesc[i].endAngle);
				
				var outerArcGen = d3.arc()
					.innerRadius(radius * 0.8)
					.outerRadius(radius * 0.8)
					.startAngle(arcDesc[i].startAngle)
					.endAngle(arcDesc[i].endAngle);
				
				var textPos = outerArcGen.centroid();
				
				textPos[0] = radius * 0.99 * (midAngle < Math.PI ? 1 : -1);
				textPos[1] += 8;
				
				var sliceCentroid = arcGen.centroid();
				var outerJoint = arcGen2.centroid();
				outerJoint[1] += 8;
				
				return [sliceCentroid, outerJoint, textPos];
			});
		
		polyline.transition().duration(1000)
			.attrTween("points", (d) =>  {
			
			});
		
		polyline.exit()
			.remove();
		
		
	}
	
	unrender() {
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