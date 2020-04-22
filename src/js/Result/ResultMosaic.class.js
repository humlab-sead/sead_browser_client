import Config from '../../config/config.js'
import ResultModule from './ResultModule.class.js'
//import ResultMap from "./ResultMap.class";

import MosaicMapModule from "./MosaicTileModules/MosaicMapModule.class";
import MosaicSampleMethodsModule from "./MosaicTileModules/MosaicSampleMethodsModule.class";
import MosaicAnalysisMethodsModule from "./MosaicTileModules/MosaicAnalysisMethodsModule.class";
import MosaicFeatureTypesModule from "./MosaicTileModules/MosaicFeatureTypesModule.class";
import MosaicCeramicsCultureModule from "./MosaicTileModules/MosaicCeramicsCultureModule.class";
import MosaicCeramicsRelativeAgesModule from "./MosaicTileModules/MosaicCeramicsRelativeAgesModule.class";
import MosaicCeramicsTypeCountModule from "./MosaicTileModules/MosaicCeramicsTypeCountModule.class";
import MosaicDendroBuildingTypesModule from "./MosaicTileModules/MosaicDendroBuildingTypesModule.class";
import MosaicDendroTreeSpeciesModule from "./MosaicTileModules/MosaicDendroTreeSpeciesModule.class";

class ResultMosaic extends ResultModule {
	constructor(resultManager) {
		super(resultManager);
		this.hqs = this.resultManager.hqs;
		this.name = "mosaic";
		this.prettyName = "Overview";
		this.icon = "<i class=\"fa fa-pie-chart\" aria-hidden=\"true\"></i>";
		this.currentZoomLevel = 4;
		this.requestBatchId = 0;
		this.graphs = [];
		this.renderPromises = [];
		this.modules = [];


		this.modules.push(new MosaicMapModule(this.hqs));
		this.modules.push(new MosaicSampleMethodsModule(this.hqs));
		this.modules.push(new MosaicAnalysisMethodsModule(this.hqs));
		this.modules.push(new MosaicFeatureTypesModule(this.hqs));
		this.modules.push(new MosaicCeramicsCultureModule(this.hqs));
		this.modules.push(new MosaicCeramicsRelativeAgesModule(this.hqs));
		this.modules.push(new MosaicCeramicsTypeCountModule(this.hqs));
		this.modules.push(new MosaicDendroBuildingTypesModule(this.hqs));
		this.modules.push(new MosaicDendroTreeSpeciesModule(this.hqs));

		/*
		//General
		this.modules.push({
			title: "Sampling methods",
			name: "mosaic-sample-methods",
			portals: ["general"],
			callback: this.renderSampleMethods
		});
		this.modules.push({
			title: "Site distribution",
			name: "mosaic-map",
			portals: ["*"],
			callback: async (renderIntoNode, resultMosaic) => {
				console.log(renderIntoNode);
				this.setLoadingIndicator(renderIntoNode, true);
				
				if(typeof this.resultMap == "undefined") {
					this.resultMap = new ResultMap(this.resultManager, "#mosaic-map");
				}
				await this.resultMap.fetchData();

				//this.setLoadingIndicator(renderIntoNode, false);
			}
		});
		this.modules.push({
			title: "Analytical methods",
			name: "mosaic-analysis-methods",
			portals: ["general"],
			callback: this.renderAnalysisMethods
		});
		this.modules.push({
			title: "Feature types",
			name: "mosaic-feature-types",
			portals: ["general"],
			callback: this.renderFeatureTypes
		});

		//Ceramics
		this.modules.push({
			title: "Ceramics culture",
			name: "mosaic-ceramics-culture",
			portals: ["ceramic"],
			callback: async (renderIntoNode, resultMosaic) => {
				this.setLoadingIndicator(renderIntoNode, true);
				await this.renderCeramicsCulture(renderIntoNode);
				this.setLoadingIndicator(renderIntoNode, false);
			}
		});
		this.modules.push({
			title: "Ceramics relative ages",
			name: "mosaic-ceramics-relative-ages",
			portals: ["ceramic"],
			callback: async (renderIntoNode, resultMosaic) => {
				this.setLoadingIndicator(renderIntoNode, true);
				await this.renderCeramicsRelativeAges(renderIntoNode);
				this.setLoadingIndicator(renderIntoNode, false);
			}
		});
		this.modules.push({
			title: "Ceramics type count",
			name: "mosaic-ceramics-type-count",
			portals: ["ceramic"],
			callback: async (renderIntoNode, resultMosaic) => {
				this.setLoadingIndicator(renderIntoNode, true);
				await this.renderCeramicsTypeCount(renderIntoNode);
				this.setLoadingIndicator(renderIntoNode, false);
			}
		});

		//Dendro
		this.modules.push({
			title: "Tree species",
			name: "mosaic-tree-species", //FIXME: This doesn't exist - but maybe it doesn't need to?
			portals: ["dendro"],
			callback: this.renderDendroTreeSpecies
		});

		//Isotopes
		this.modules.push({
			title: "Isotopes in samples",
			name: "mosaic-isotopes-in-samples",
			portals: ["isotopes"],
			callback: this.renderIsotopesInSamples
		});

		this.modules.push({
			title: "Isotopes in samples",
			name: "mosaic-isotopes-in-samples",
			portals: ["isotopes"],
			callback: this.renderIsotopesInSamples
		});
		*/
	}
	
	setLoadingIndicator(containerNode, isLoading) {
		if(isLoading) {
			$(containerNode).addClass("result-mosaic-loading-indicator-bg");
		}
		else {
			$(containerNode).removeClass("result-mosaic-loading-indicator-bg");
		}
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
		
		//var reqData = this.resultManager.getRequestData(++this.requestId, "tabular");
		var reqData = this.resultManager.getRequestData(++this.requestId, "map");
		
		this.resultManager.showLoadingIndicator(true);
		return $.ajax(Config.serverAddress+"/api/result/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: (respData, textStatus, jqXHR) => {
				return respData;
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
	
	/**
	 * Function: render
	 * 
	 * This is the entry-function, the one being called by the ResultManager to set off the rendering of this module and its sub-modules.
	 */
	render() {
		var xhr = this.fetchData();
		xhr.then((respData, textStatus, xhr) => { //success

			if(respData.RequestId == this.requestId && this.resultManager.getActiveModule().name == this.name) { //Only load this data if it matches the last request id dispatched. Otherwise it's old data.
				this.importResultData(respData);
				this.renderData();
			}
			else {
				console.log("WARN: ResultMosaic discarding old result package data ("+respData.RequestId+"/"+this.requestId+").");
			}
		},
		function(xhr, textStatus, errorThrown) { //error
			console.log(errorThrown);
		});
	}
	
	/**
	 * Function: renderData
	 */
	renderData() {
		this.unrender();
		$('#result-mosaic-container').show();
		$('#result-mosaic-container').css("display", "grid");

		this.sites = [];
		for(let key in this.data.rows) {
			if(Number.isInteger(this.data.rows[key].category_id)) {
				this.sites.push(this.data.rows[key].category_id);
			}
		}

		let portal = this.hqs.portalManager.getActivePortal();

		this.requestBatchId++;
		for(let key in this.modules) {
			if(this.modules[key].portals.includes(portal.name) || this.modules[key].portals.includes("*")) {
				if($("#result-mosaic-container #"+this.modules[key].name).length == 0) {
					let tileNode = $("<div class='result-mosaic-tile'></div>");
					tileNode.append("<h2>"+this.modules[key].title+"</h2>");
					tileNode.append("<div id='"+this.modules[key].name+"' class='result-mosaic-graph-container'></div>");
					$('#result-mosaic-container').append(tileNode);
				}
				else {
					console.log("Not creating mosaic tile node since it exists");
				}
				let promise = this.modules[key].render("#"+this.modules[key].name);
				//let promise = this.modules[key].callback("#"+this.modules[key].name, this);
				this.renderPromises.push(promise);
			}
		}

		if(this.renderPromises.length == 0) {
			this.hqs.hqsEventDispatch("resultModuleRenderComplete");
			this.resultManager.showLoadingIndicator(false);
		}

		Promise.all(this.renderPromises).then(() => {
			console.log("Mosaic modules render complete");
			this.hqs.hqsEventDispatch("resultModuleRenderComplete");
			//this.resultManager.showLoadingIndicator(false);
		});
	}

	prepareChartData(data_key_name, data_value_name, data) {
		let types = [];
		for(let key in data) {
			let type_id = data[key][data_key_name];
			
			if(typeof(types[type_id]) == "undefined") {
				types[type_id] = {
					methodId: data[key].type_id,
					featureType: data[key][data_value_name],
					sites: new Set([data[key].site_id]),
					count: 1
				};
			}
			else {
				types[type_id].count++;
				types[type_id].sites.add(data[key].site_id);
			}
		}

		let chartSeries = [];
		for(let key in types) {
			chartSeries.push({
				"values": [types[key].count],
				"text": types[key].featureType,
				"sites": types[key].sites
			});
		}
		
		return chartSeries;
	}


	renderDendroTreeSpecies(renderIntoNode, resultMosaic) {
		//http://seadserv.humlab.umu.se:3000/qse_dendro_tree_species?site_id=eq.1996
		let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_dendro_tree_species", resultMosaic.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}

			let chartSeries = resultMosaic.prepareChartData("method_id", "method_name", promiseData.data);
			resultMosaic.renderPieChart(renderIntoNode, chartSeries, "Sampling methods");
		});
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
		let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_analysis_methods", resultMosaic.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}

			let chartSeries = resultMosaic.prepareChartData("method_id", "method_name", promiseData.data);

			resultMosaic.renderPieChart(renderIntoNode, chartSeries, "Analysis methods");
		});
	}

	renderIsotopesInSamples(renderIntoNode, resultMosaic) {
		/*
		SELECT count(isotope_types.designation) FROM postgrest_api.isotope_types 
		INNER JOIN postgrest_api.isotope_measurements ON isotope_types.isotope_type_id = isotope_measurements.isotope_type_id
		WHERE designation = 'Aquatic signal';
		
		SELECT isotope_types.designation, COUNT(isotope_types.designation)
		FROM postgrest_api.isotope_types
		INNER JOIN postgrest_api.isotope_measurements ON isotope_types.isotope_type_id = isotope_measurements.isotope_type_id
		GROUP BY isotope_types.designation;



		SELECT DISTINCT(methods.method_name)
		FROM postgrest_api.methods
		INNER JOIN postgrest_api.isotope_measurements ON methods.method_id = isotope_measurements.method_id;



		SELECT *
		FROM postgrest_api.sample_locations
		WHERE sample_locations.sample_location_type_id = 2;



		SELECT relative_age_name, COUNT(relative_age_name)
		FROM postgrest_api.relative_ages
		INNER JOIN postgrest_api.relative_dates ON relative_ages.relative_age_id = relative_dates.relative_age_id
		GROUP BY relative_age_name;
		*/
	}

	renderSampleMethods(renderIntoNode, resultMosaic) {
		//WARN: This load is sometimes being done befor there are any sites...
		let promise = resultMosaic.fetchSiteData(resultMosaic.sites, "qse_methods", resultMosaic.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < resultMosaic.requestBatchId) {
				return false;
			}
			//console.log(promiseData.data);
			let chartSeries = resultMosaic.prepareChartData("method_id", "method_name", promiseData.data);

			resultMosaic.renderPieChart(renderIntoNode, chartSeries, "Sampling methods");
		});
	}

	preparePieChart(renderIntoNode, dbViewName, categoryNameAttribute, categoryCountAttribute) {
		let promise = this.fetchSiteData(this.sites, dbViewName, this.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < this.requestBatchId) {
				return false;
			}

			let categories = [];
			for(let key in promiseData.data) {
				let dataPoint = promiseData.data[key];

				let categoryFound = false;
				categories.forEach((category) => {
					if(category.name == dataPoint[categoryNameAttribute]) {
						categoryFound = true;
						category.count += dataPoint[categoryCountAttribute];
					}
				});

				if(!categoryFound) {
					categories.push({
						name: dataPoint[categoryNameAttribute],
						count: dataPoint[categoryCountAttribute]
					});
				}
			}

			let chartSeries = [];
			for(let key in categories) {
				chartSeries.push({
					"values": [categories[key].count],
					"text": categories[key].name
				});
			}

			this.renderPieChart(renderIntoNode, chartSeries, "Sampling methods");
		});

		return promise;
	}

	makeChartSeries(data, categoryNameAttribute, categoryCountAttribute) {
		let categories = [];
		for(let key in data) {
			let dataPoint = data[key];

			let categoryFound = false;
			categories.forEach((category) => {
				if(category.name == dataPoint[categoryNameAttribute]) {
					categoryFound = true;
					category.count += dataPoint[categoryCountAttribute];
					category.sites.add(dataPoint.site_id)
				}
			});

			if(!categoryFound) {
				categories.push({
					name: dataPoint[categoryNameAttribute],
					count: dataPoint[categoryCountAttribute],
					sites: new Set([dataPoint.site_id])
				});
			}
		}

		let chartSeries = [];
		for(let key in categories) {
			chartSeries.push({
				"values": [categories[key].count],
				"text": categories[key].name,
				"sites": categories[key].sites
			});
		}

		return chartSeries;
	}

	prepareBarChart(renderIntoNode, dbViewName, categoryNameAttribute, categoryCountAttribute) {
		let promise = this.fetchSiteData(this.sites, dbViewName, this.requestBatchId);
		promise.then((promiseData) => {
			if(promiseData.requestId < this.requestBatchId) {
				return false;
			}

			let categories = [];
			for(let key in promiseData.data) {
				let dataPoint = promiseData.data[key];

				let categoryFound = false;
				categories.forEach((category) => {
					if(category.name == dataPoint[categoryNameAttribute]) {
						categoryFound = true;
						category.count += dataPoint[categoryCountAttribute];
					}
				});

				if(!categoryFound) {
					categories.push({
						name: dataPoint[categoryNameAttribute],
						count: dataPoint[categoryCountAttribute]
					});
				}
			}

			let chartSeries = [];
			for(let key in categories) {
				chartSeries.push({
					"values": [categories[key].count],
					"text": categories[key].name
				});
			}

			this.renderBarChart(renderIntoNode, chartSeries, "Sampling methods");
		});

		return promise;
	}

	async renderCeramicsCulture(renderIntoNode) {
		return await this.preparePieChart(renderIntoNode, "qse_ceramics_culture", "Culture", "count");
	}

	async renderCeramicsRelativeAges(renderIntoNode) {
		return await this.prepareBarChart(renderIntoNode, "qse_ceramics_relative_ages", "relative_age_name", "count");
	}

	async renderCeramicsTypeCount(renderIntoNode) {
		return await this.preparePieChart(renderIntoNode, "qse_ceramics_type_count", "type_name", "count");
	}

	renderBarChart(renderIntoNode, chartSeries, chartTitle) {

		if(chartSeries.length == 0) {
			let noDataMsgNode = $("<div class='result-mosaic-no-data-msg'><div>No data</div></div>");
			$(renderIntoNode).append(noDataMsgNode);
			return;
		}

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
				"text": "%t, %v counts\n<span>Click to filter on these sites</span>",
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

		/*
		let zc = this.getFromGraphRegistry(renderIntoNode);
		if(zc !== false) { //Update existing chart
			zingchart.exec(renderIntoNode.substr(1), 'setdata', {
				"data": config
			});
		}
		else { //Create new chart
			zc = zingchart.render({
				id : renderIntoNode.substr(1),
				data : config,
				height: "100%"
			});
			this.pushIntoGraphRegistry(zc, renderIntoNode);
		}
		*/
		let zc = zingchart.render({
			id : renderIntoNode.substring(1),
			data : config,
			height: "100%"
		});

		zc.bind("click", (evt) => {
			let startIndex = evt.targetid.indexOf("-plot-") + 6;
			let plot = evt.targetid.substring(startIndex, startIndex+1);
			let facet = this.hqs.facetManager.spawnFacet("sites", [...config.series[plot].sites]);

			let iv = setInterval(() => {
				if(facet.isDataLoaded) {
					facet.minimize();
					clearInterval(iv);
				}
			}, 100);
		});

		return zc;
	}
	
	renderPieChart(renderIntoNode, chartSeries, chartTitle) {

		if(chartSeries.length == 0) {
			let noDataMsgNode = $("<div class='result-mosaic-no-data-msg'><div>No data</div></div>");
			$(renderIntoNode).append(noDataMsgNode);
			return;
		}

		var config = {
			"type":"pie",
			"background-color": "transparent",
			"series": chartSeries,
			"tooltip":{
				"text": "%t, %v counts\n<span>Click to filter on these sites</span>",
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
					'background-color': "transparent"
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

		/*
		let zc = this.getFromGraphRegistry(renderIntoNode);
		if(zc !== false) { //Update existing chart
			zingchart.exec(renderIntoNode.substr(1), 'setdata', {
				"data": config
			});
		}
		else { //Create new chart
			zc = zingchart.render({
				id : renderIntoNode.substr(1),
				data : config,
				height: "100%"
			});
			this.pushIntoGraphRegistry(zc, renderIntoNode);
		}
		*/

		let zc = zingchart.render({
			id : renderIntoNode.substring(1),
			data : config,
			height: "100%"
		});

		zc.bind("click", (evt) => {
			let startIndex = evt.targetid.indexOf("-plot-") + 6;
			let plot = evt.targetid.substring(startIndex, startIndex+1);
			let facet = this.hqs.facetManager.spawnFacet("sites", [...config.series[plot].sites]);

			let iv = setInterval(() => {
				if(facet.isDataLoaded) {
					facet.minimize();
					clearInterval(iv);
				}
			}, 100);
		});

		return zc;
	}

	getFromGraphRegistry(anchorNodeName) {
		for(let k in this.graphs) {
			if(this.graphs[k].anchor == anchorNodeName) {
				return this.graphs[k].graph;
			}
		}
		return false;
	}

	pushIntoGraphRegistry(graphObject, anchorNodeName) {
		this.graphs.push({
			graph: graphObject,
			anchor: anchorNodeName
		});
	}

	removeFromGraphRegistry(anchorNodeName) {
		for(let k in this.graphs) {
			if(this.graphs[k].anchor == anchorNodeName) {
				this.graphs.splice(k, 1);
				return true;
			}
		}
		return false;
	}

	async fetchSiteData(siteIds, dbView, requestId) {
		if(siteIds.length == 0) {
			console.log("No sites");
		}

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
			let requestString = this.hqs.config.siteReportServerAddress+"/"+dbView;
			if(siteIds.length > 0) {
				requestString += "?or="+queries[key];
			}
			
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
		this.modules.forEach((module) => {
			module.unrender();
		});

		if(this.renderTryInterval != null) {
			console.log("WARN: Unrendering when renderTryInterval is active.");
			clearInterval(this.renderTryInterval);
		}

		$("#result-mosaic-container").hide();
		if(typeof(this.resultMap) != "undefined") {
			this.resultMap.unrender();
		}

		/*
		for(let k in this.graphs) {
			zingchart.exec(this.graphs[k].anchor.substr(1), 'destroy');
			this.removeFromGraphRegistry(this.graphs[k].anchor);
		}
		*/
		$("#result-mosaic-container").html("");
	}
	
	exportSettings() {
		return {};
	}
	
	importSettings(settings) {
	}
	
}

export { ResultMosaic as default }