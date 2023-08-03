//import Config from '../../config/config.js'
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
//import MosaicDendroTreeSpeciesModule from "./MosaicTileModules/OLD-MosaicDendroTreeSpeciesModule.class";
import MosaicDendroDatingHistogramModule from "./MosaicTileModules/MosaicDendroDatingHistogramModule.class";
import MosaicDendroTreeSpeciesChartModule from "./MosaicTileModules/MosaicDendroTreeSpeciesChartModule.class";
import MosaicTemporalDistributionModule from "./MosaicTileModules/MosaicTemporalDistributionModule.class";
import MosaicTaxaListModule from "./MosaicTileModules/MosaicTaxaListModule.class";
import MosaicEcoCodesModule from './MosaicTileModules/MosaicEcoCodesModule.class.js';
import { nanoid } from 'nanoid';
import Plotly from "plotly.js-dist";

class ResultMosaic extends ResultModule {
	constructor(resultManager) {
		super(resultManager);
		this.sqs = this.resultManager.sqs;
		this.name = "mosaic";
		this.prettyName = "Overview";
		this.icon = "<i class=\"fa fa-bar-chart\" aria-hidden=\"true\"></i>";
		this.currentZoomLevel = 4;
		this.requestBatchId = 0;
		this.graphs = [];
		this.renderPromises = [];
		this.modules = [];

		$(window).on("seadResultMenuSelection", (event, data) => {
			if(data.selection != this.name) {
				$("#result-mosaic-container").hide();
			}
			else {
				$("#result-mosaic-container").show();
			}
		});

		/*
		//On domain change - unrender/render all tile modules
		this.sqs.sqsEventListen("domainChanged", (evt, newDomainName) => {
			if(this.resultManager.getActiveModule().name == this.name) {
				
				this.modules.forEach(moduleMeta => {
					console.log(moduleMeta)
					//let module = this.getInstanceOfModule(moduleMeta.name);
					//module.unrender();
				})
				
			}
		});
		*/

		this.modules.push({
			title: "Site map",
			className: "MosaicMapModule",
			classTemplate: MosaicMapModule,
			module: null
		});
		this.modules.push({
			title: "Sampling methods by sample groups",
			className: "MosaicSampleMethodsModule",
			classTemplate: MosaicSampleMethodsModule,
			module: null
		});
		this.modules.push({
			title: "Analysis methods by datasets",
			className: "MosaicAnalysisMethodsModule",
			classTemplate: MosaicAnalysisMethodsModule,
			module: null
		});
		this.modules.push({
			title: "Top feature types",
			className: "MosaicFeatureTypesModule",
			classTemplate: MosaicFeatureTypesModule,
			module: null
		});
		this.modules.push({
			title: "Ceramic cultures",
			className: "MosaicCeramicsCultureModule",
			classTemplate: MosaicCeramicsCultureModule,
			module: null
		});
		this.modules.push({
			title: "Ceramic relative ages",
			className: "MosaicCeramicsRelativeAgesModule",
			classTemplate: MosaicCeramicsRelativeAgesModule,
			module: null
		});
		this.modules.push({
			title: "Ceramic type counts",
			className: "MosaicCeramicsTypeCountModule",
			classTemplate: MosaicCeramicsTypeCountModule,
			module: null
		});
		this.modules.push({
			title: "Building types",
			className: "MosaicDendroBuildingTypesModule",
			classTemplate: MosaicDendroBuildingTypesModule,
			module: null
		});
		this.modules.push({
			title: "Dating histogram",
			className: "MosaicDendroDatingHistogramModule",
			classTemplate: MosaicDendroDatingHistogramModule,
			module: null
		});
		this.modules.push({
			title: "Tree species",
			className: "MosaicDendroTreeSpeciesChartModule",
			classTemplate: MosaicDendroTreeSpeciesChartModule,
			module: null
		});
		this.modules.push({
			title: "Temporal distribution of datasets",
			className: "MosaicTemporalDistributionModule",
			classTemplate: MosaicTemporalDistributionModule,
			module: null
		});
		this.modules.push({
			title: "Top taxa",
			className: "MosaicTaxaListModule",
			classTemplate: MosaicTaxaListModule,
			module: null
		});
		this.modules.push({
			title: "BUGS eco codes",
			className: "MosaicEcoCodesModule",
			classTemplate: MosaicEcoCodesModule,
			module: null
		});
		

		this.modules.forEach(mReg => {
			mReg.name = new mReg.classTemplate().name;
		});
	}

	isVisible() {
		return true;
	}

	getModuleMetaByName(name) {
		for(let key in this.modules) {
			if(this.modules[key].name == name) {
				return this.modules[key];
			}
		}
		return false;
	}
	
	getModuleByClassName(name) {
		for(let key in this.modules) {
			if(this.modules[key].className == name) {
				return this.modules[key];
			}
		}
		return false;
	}
	
	/*
	setLoadingIndicator(containerNode, isLoading) {
		if(isLoading) {
			$(containerNode).addClass("result-mosaic-loading-indicator-bg");
		}
		else {
			$(containerNode).removeClass("result-mosaic-loading-indicator-bg");
		}
	}
	*/

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
			contentType: 'application/json; charset=utf-8',
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

		this.sites = [];
		for(let key in this.data.rows) {
			if(Number.isInteger(this.data.rows[key].category_id)) {
				this.sites.push(this.data.rows[key].category_id);
			}
		}
	}
	
	/**
	 * Function: render
	 * 
	 * This is the entry-function, the one being called by the ResultManager to set off the rendering of this module and its sub-modules.
	 * 
	 * This will also be called when the domain changes, despite the reuslt module not changing, which means we need to unrender any previous mosaic tiles
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

	update() {
		console.log("mosaic update")
		var xhr = this.fetchData();
		xhr.then((respData, textStatus, xhr) => { //success
			if(respData.RequestId == this.requestId && this.resultManager.getActiveModule().name == this.name) { //Only load this data if it matches the last request id dispatched. Otherwise it's old data.
				this.importResultData(respData);
				this.updateGridModules();
			}
			else {
				console.log("WARN: ResultMosaic discarding old result package data ("+respData.RequestId+"/"+this.requestId+").");
			}
		},
		function(xhr, textStatus, errorThrown) { //error
			console.log(errorThrown);
		});
	}
	
	applyDomainGridLayout(domain) {
		let rows = domain.result_grid_layout[0];
		let grid_rows_css = "";
		for(let i = 0; i < rows; i++) {
			grid_rows_css += "1fr ";
		}
		let cols = domain.result_grid_layout[1];
		let grid_cols_css = "";
		for(let i = 0; i < cols; i++) {
			grid_cols_css += "1fr ";
		}

		$("#result-mosaic-container").css("grid-template-rows", grid_rows_css);
		$("#result-mosaic-container").css("grid-template-columns", grid_cols_css);
	}

	getGridBoxId(moduleConf) {
		let gridRow = moduleConf.grid_row.replace(/\s+/g, '');
		let gridCol = moduleConf.grid_column.replace(/\s+/g, '');
		return "mosaic-grid-box-" + gridRow + "-" + gridCol;
	}

	renderGridModules(resultGridModules) {
		for(let key in this.modules) {
			if(this.modules[key].module != null) {
				this.modules[key].module.unrender();
			}
		}

		resultGridModules.forEach(mConf => {
			if(typeof mConf.default == "undefined" || mConf.default == true) {
				let mosaicTileId = nanoid();
				mConf.grid_box_id = this.getGridBoxId(mConf);
				this.renderGridModule(mConf, mosaicTileId).then(() => {
					if(this.sqs.config.showMosaicExportButtons) {
						let exportButton = $("<div></div>").addClass("result-export-button-mosaic").html("<i class='fa fa-download' aria-hidden='true'></i>&nbsp;Export");
						$("#"+mosaicTileId).append(exportButton);
						this.bindExportModuleDataToButton("#"+mosaicTileId+" .result-export-button-mosaic", mConf.module);
					}
				});
			}
		});

		//Save currently rendered modules to registry
		resultGridModules.forEach(mConf => {
			for(let key in this.modules) {
				if(this.modules[key].name == mConf.module_name) {
					this.modules[key].module = mConf.module;
				}
			}
		});

		let moduleSelectionOptions = [];
		resultGridModules.forEach(mConf => {
			let moduleMeta = this.getModuleMetaByName(mConf.default_module);
			moduleSelectionOptions.push({
				name: mConf.default_module,
				title: moduleMeta.title
			});
		});

		resultGridModules.forEach(mConf => {
			let titleSelectHtml = this.renderGridModuleSelector(resultGridModules, mConf, mConf.grid_box_id, moduleSelectionOptions);
			$("#"+mConf.grid_box_id).parent().append(titleSelectHtml);
		});

		this.bindGridModuleSelectionCallbacks();
	}

	async renderGridModule(moduleConf, mosaicTileId) {
		let module = this.getInstanceOfModule(moduleConf.module_name);
		
		let tileNode = $("<div id='"+mosaicTileId+"' class='result-mosaic-tile'></div>");
		if(!module) {
			tileNode.append("<h2>NoSuchModuleError - "+moduleConf.module_name+"</h2>");
			tileNode.append("<div id='"+module.name+"' class='result-mosaic-graph-container'></div>");
			tileNode.css("grid-row", moduleConf.grid_row);
			tileNode.css("grid-column", moduleConf.grid_column);
		}
		else {
			moduleConf.module = module;
			moduleConf.moduleInstanceId = nanoid();
			tileNode.append("<div id='"+moduleConf.grid_box_id+"' module-instance-id='"+moduleConf.moduleInstanceId+"' module-name='"+moduleConf.module_name+"' class='result-mosaic-graph-container'></div>");
			tileNode.css("grid-row", moduleConf.grid_row);
			tileNode.css("grid-column", moduleConf.grid_column);
			$('#result-mosaic-container').append(tileNode);
			await module.render("#"+moduleConf.grid_box_id);
		}
		
	}

	unrenderGridModules() {
		
	}

	renderGridModuleSelector(resultGridModules, moduleConf, grid_box_id, options) {
		let titleSelectHtml = "<h2><select result-mosaic-grid-box-id='"+grid_box_id+"' class=\"result-mosaic-tile-chart-selector\">";

		let selectOptionsHtml = "";
		resultGridModules.forEach(moduleSpec => {
			let moduleTitle = moduleSpec.module_name;
			//find this module in this.modules by name, just to get the title
			this.modules.forEach(moduleReg => {
				if(moduleReg.name == moduleSpec.module_name) {
					moduleTitle = moduleReg.title;
				}
			});

			if(moduleSpec.module_name == moduleConf.module_name) {
				selectOptionsHtml += "<option value=\""+moduleSpec.module_name+"\" selected=\"selected\">"+moduleTitle+"</option>";
			}
			else {
				selectOptionsHtml += "<option value=\""+moduleSpec.module_name+"\">"+moduleTitle+"</option>";
			}
		});

		titleSelectHtml += selectOptionsHtml;
		titleSelectHtml += "</select></h2>";

		return titleSelectHtml;
	}

	bindGridModuleSelectionCallbacks() {
		$(".result-mosaic-tile-chart-selector").on("change", (evt) => {
			let mosaicTileNode = $(evt.target).parent().parent();
			let graphContainer = $(".result-mosaic-graph-container", mosaicTileNode);
			let gridBoxId = graphContainer.attr("id");
			let currentModuleInstanceId = graphContainer.attr("module-instance-id")
			let currentModuleMeta = this.getModuleMetaByInstanceId(currentModuleInstanceId);
			currentModuleMeta.module.unrender();

			let selectedModuleName = $(evt.target).val();

			let activeDomain = this.sqs.domainManager.getActiveDomain();

			for(let key in activeDomain.result_grid_modules) {
				if(typeof activeDomain.result_grid_modules[key].grid_row == "undefined") {
					activeDomain.result_grid_modules[key].grid_row = currentModuleMeta.grid_row;
				}
				if(typeof activeDomain.result_grid_modules[key].grid_column == "undefined") {
					activeDomain.result_grid_modules[key].grid_column = currentModuleMeta.grid_column;
				}

				if(typeof activeDomain.result_grid_modules[key].grid_box_id == "undefined") {
					activeDomain.result_grid_modules[key].grid_box_id = this.getGridBoxId(activeDomain.result_grid_modules[key]);
				}
				if(activeDomain.result_grid_modules[key].moduleInstanceId == currentModuleInstanceId) {
					console.log("Updating "+activeDomain.result_grid_modules[key].module_name+" to "+selectedModuleName)
					activeDomain.result_grid_modules[key].module_name = selectedModuleName;
					activeDomain.result_grid_modules[key].module = this.getInstanceOfModule(selectedModuleName);
					$("#"+gridBoxId).attr("module-name", selectedModuleName);
					$("#"+gridBoxId).html("");
					activeDomain.result_grid_modules[key].module.render("#"+gridBoxId);
				}
			}
		});
	}

	getLiveModuleInstanceByName(name) {
		let domain = this.sqs.domainManager.getActiveDomain();
		for(let key in domain.result_grid_modules) {
			if(domain.result_grid_modules[key].module_name == name) {
				return domain.result_grid_modules[key].module;
			}
		}
		return false;
	}

	updateGridModules() {
		let activeDomain = this.sqs.domainManager.getActiveDomain();
		
		activeDomain.result_grid_modules.forEach(moduleConf => {
			if(typeof moduleConf.module != "undefined" && moduleConf.module != null) {
				console.log("Updating grid module "+moduleConf.module.name);
				moduleConf.module.update();
			}
		});
	}

	getModuleMetaByInstanceId(moduleInstanceId) {
		let domain = this.sqs.domainManager.getActiveDomain();
		for(let key in domain.result_grid_modules) {
			if(domain.result_grid_modules[key].moduleInstanceId == moduleInstanceId) {
				return domain.result_grid_modules[key];
			}
		}
	}

	getInstanceOfModule(moduleName) {
		for(let key in this.modules) {
			if(this.modules[key].name == moduleName) {
				return new this.modules[key].classTemplate(this.sqs);
			}
		}
		return null;
	}
	
	/**
	 * Function: renderData
	 */
	renderData() {
		this.unrender();
		$('#result-mosaic-container').show();
		$('#result-mosaic-container').css("display", "grid");

		let domain = this.sqs.domainManager.getActiveDomain();
		//let userConfig = this.sqs.loadUserSettings();
		this.applyDomainGridLayout(domain);

		if($(".result-mosaic-tile").length == 0) {
			this.renderGridModules(domain.result_grid_modules);
		}
		else {
			this.updateGridModules(domain.result_grid_modules);
		}
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

	/*
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
	*/

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
			console.log(promiseData.data);
			let chartSeries = resultMosaic.prepareChartData("method_id", "method_name", promiseData.data);
			console.log(chartSeries);
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

	renderBarChartPlotly(renderIntoNode, chartSeries, chartTitle) {
		if(chartSeries.length == 0) {
			this.sqs.setNoDataMsg(renderIntoNode);
			return;
		}
		else {
			this.sqs.setNoDataMsg(renderIntoNode, false);
		}

		chartSeries.sort((a, b) => {
			return a.value - b.value;
		});

		let data = [{
			y: chartSeries.map((obj) => { return obj.label; }),
			x: chartSeries.map((obj) => { return obj.value; }),
			type: 'bar',
			orientation: 'h',
			hovertemplate: '%{y}<extra>%{x} samples</extra>',
			text: chartSeries.map((obj) => { return obj.label; }),
			textposition: 'auto',
			marker: {
				color: this.sqs.color.colors.baseColor,
			}
		}];

		let layout = {
			title: {
				text: chartTitle,
				font: {
					family: 'Didact Gothic, sans-serif',
					size: 22
				},
			},
			plot_bgcolor: this.sqs.color.colors.paneBgColor,
			paper_bgcolor: this.sqs.color.colors.paneBgColor,
			autosize: true,
			showlegend: false,
			margin: {
				l: 50,
				r: 50,
				b: 50,
				t: 50,
				pad: 4
			},
			font: {
				family: 'Didact Gothic, sans-serif',
				size: 14,
				color: '#333'
			},
			yaxis: {
				showticklabels: false,
				automargin: true,
			},
			responsive: true
		};

		Plotly.newPlot($(renderIntoNode)[0], data, layout, {responsive: true});
	}

	renderBarChart(renderIntoNode, chartSeries, chartTitle) {

		if(chartSeries.length == 0) {
			this.sqs.setNoDataMsg(renderIntoNode);
			return;
		}
		else {
			this.sqs.setNoDataMsg(renderIntoNode, false);
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

		

		let colors = this.sqs.color.getColorScheme(config.series.length);
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

		/*
		zc.bind("click", (evt) => {
			let startIndex = evt.targetid.indexOf("-plot-") + 6;
			let plot = evt.targetid.substring(startIndex, startIndex+1);
			let facet = this.sqs.facetManager.spawnFacet("sites", [...config.series[plot].sites]);

			let iv = setInterval(() => {
				if(facet.isDataLoaded) {
					facet.minimize();
					clearInterval(iv);
				}
			}, 100);
		});
		*/

		return zc;
	}

	renderHistogram(renderIntoNode, chartSeries, render = true) {

		if(chartSeries.length == 0) {
			this.sqs.setNoDataMsg(renderIntoNode);
			return;
		}
		else {
			this.sqs.setNoDataMsg(renderIntoNode, false);
		}

		let xScaleLabels = chartSeries[0].text;

		var config = {
			"type":"bar",
			"background-color": "transparent",
			"series": chartSeries,
			"plot":{
				"stacked": true,
				"animation":{
					"effect":"ANIMATION_EXPAND_BOTTOM"
				}
			},
			"plotarea": {
				"margin": '130 10 90 60'
			},
			"tooltip":{
				"text": "%scale-key-text\r\n%v dated samples\r\n%t",
				"html-mode": true,
				"decimals": 0,
				"align": 'left',
				"borderRadius": 3,
				"fontColor":"#000000",
				"fontSize": "16px",
				"backgroundColor": "#ffffff"
			},
			"scale-x": {
				"labels": xScaleLabels,
				"tick": {
					"visible": false,
					"_lineColor": '#D8D8D8'
				},
				"item": {
					"color": '#6C6C6C',
					"angle": '-35'
				},
			},
		};
		
		let colors = this.sqs.color.getColorScheme(config.series.length);
		let legendTextMaxLength = 15;
		for(let key in config.series) {
			config.series[key].backgroundColor = colors[key];
			
			if(key == 0) {
				config.series[key].text = ""; //Low uncertainty
			}
			if(key == 1) {
				config.series[key].text = "High uncertainty";
			}
			
			
		}

		let rows = chartSeries.length;
		if(rows > 6) {
			rows = 6;
		}
		/*
		config.legend = {
			"highlight-plot":true,
			"draggable":true,
			"max-items":6,
			"overflow":"scroll",
			"layout":rows+"x1", //row x column
			"toggle-action":"remove"
		};
		*/

		if(render) {
			let zc = zingchart.render({
				id : renderIntoNode.substring(1),
				data : config,
				height: "100%"
			});

			/*
			zc.bind("click", (evt) => {
				let startIndex = evt.targetid.indexOf("-plot-") + 6;
				let plot = evt.targetid.substring(startIndex, startIndex+1);
				let facet = this.sqs.facetManager.spawnFacet("sites", [...config.series[plot].sites]);

				let iv = setInterval(() => {
					if(facet.isDataLoaded) {
						facet.minimize();
						clearInterval(iv);
					}
				}, 100);
			});
			*/

			return zc;
		}
		else {
			return config;
		}
		
	}

	/*
	renderNoDataMsg(renderIntoNode) {
		let noDataMsgNode = $("<div class='result-mosaic-no-data-msg'><div>No data</div></div>");
		$(renderIntoNode).append(noDataMsgNode);
	}

	unrenderNoDataMsg(renderIntoNode) {
		$(".result-mosaic-no-data-msg", renderIntoNode).remove();
	}
	*/

	renderPieChartPlotly(renderIntoNode, chartData, layoutConfig = {}) {
		if(typeof renderIntoNode == "object") {
			console.warn("target node is an object, we need to convert this to an id");
			return;
		}

		let layout = {
      		paper_bgcolor: this.sqs.color.colors.paneBgColor,
			showlegend: true,
			title: {
				text:'',
				font: {
				  family: 'Didact Gothic, sans-serif',
				  size: 22
				},
			},
		};

		Object.assign(layout, layoutConfig);
		let anchorNodeId = renderIntoNode.substring(1);

		let config = {
			responsive: true
		}

		Plotly.newPlot(anchorNodeId, chartData, layout, config);

		this.sqs.sqsEventListen("layoutResize", () => {
			Plotly.relayout(anchorNodeId, layout);
		}, this);

	}

	unrenderPlotlyChart(selector) {
		this.sqs.sqsEventUnlisten("layoutResize", this);
		let node = $(selector);
		if(node.length == 0) {
			console.warn("Bailing on unrenderPlotlyChart because node was not found");
			return;
		}
		Plotly.purge(node[0]);
	}
	
	renderPieChart(renderIntoNode, chartSeries, chartTitle) {

		if(chartSeries.length == 0) {
			this.sqs.setNoDataMsg(renderIntoNode);
			return;
		}
		else {
			this.sqs.setNoDataMsg(renderIntoNode, false);
		}

		var config = {
			"type":"pie",
			"background-color": "transparent",
			"series": chartSeries,
			"tooltip":{
				"text": "%t, %v counts",
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

		let colors = this.sqs.color.getColorScheme(config.series.length);
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

		this.pushIntoGraphRegistry({
			anchor: renderIntoNode.substring(1),
			graph: zc,
			data: config
		});

		/*
		zc.bind("click", (evt) => {
			let startIndex = evt.targetid.indexOf("-plot-") + 6;
			let plot = evt.targetid.substring(startIndex, startIndex+1);

			let facet = this.sqs.facetManager.getFacetByName("sites");
			if(facet === false) {
				facet = this.sqs.facetManager.spawnFacet("sites", [...config.series[plot].sites]);
			}
			else {
				facet.setSelections([...config.series[plot].sites]);
			}


			let iv = setInterval(() => {
				if(facet.isDataLoaded) {
					facet.minimize();
					clearInterval(iv);
				}
			}, 100);
		});
		*/

		return zc;
	}

	getFromGraphRegistry(anchorNodeName) {
		for(let k in this.graphs) {
			if(this.graphs[k].anchor == anchorNodeName) {
				return this.graphs[k];
			}
		}
		return false;
	}

	pushIntoGraphRegistry(graphObject) {
		this.graphs.push(graphObject);
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
			let requestString = this.sqs.config.siteReportServerAddress+"/"+dbView;
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
		this.modules.forEach(module => {
			if(module.module != null && typeof module.module.unrender == "function") {
				module.module.unrender();
			}
		});

		$("#result-mosaic-container").html("");
	}

	exportSettings() {
		return {};
	}
	
	importSettings(settings) {
	}
	
}

export { ResultMosaic as default }