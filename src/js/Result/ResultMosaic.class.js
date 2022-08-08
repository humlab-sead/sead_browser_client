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
import MosaicDendroTreeSpeciesModule from "./MosaicTileModules/MosaicDendroTreeSpeciesModule.class";
import MosaicDendroDatingHistogramModule from "./MosaicTileModules/MosaicDendroDatingHistogramModule.class";
import MosaicDendroTreeSpeciesChartModule from "./MosaicTileModules/MosaicDendroTreeSpeciesChartModule.class";
import { nanoid } from 'nanoid';

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

		this.modules.push({
			title: "Site map",
			className: "MosaicMapModule",
			classTemplate: MosaicMapModule
		});
		this.modules.push({
			title: "Sample methods",
			className: "MosaicSampleMethodsModule",
			classTemplate: MosaicSampleMethodsModule
		});
		this.modules.push({
			title: "Analysis methods",
			className: "MosaicAnalysisMethodsModule",
			classTemplate: MosaicAnalysisMethodsModule
		});
		this.modules.push({
			title: "Feature types",
			className: "MosaicFeatureTypesModule",
			classTemplate: MosaicFeatureTypesModule
		});
		this.modules.push({
			title: "Ceramic cultures",
			className: "MosaicCeramicsCultureModule",
			classTemplate: MosaicCeramicsCultureModule
		});
		this.modules.push({
			title: "Ceramic relative ages",
			className: "MosaicCeramicsRelativeAgesModule",
			classTemplate: MosaicCeramicsRelativeAgesModule
		});
		this.modules.push({
			title: "Ceramic type counts",
			className: "MosaicCeramicsTypeCountModule",
			classTemplate: MosaicCeramicsTypeCountModule
		});
		this.modules.push({
			title: "Building types",
			className: "MosaicDendroBuildingTypesModule",
			classTemplate: MosaicDendroBuildingTypesModule
		});
		this.modules.push({
			title: "Tree species 2",
			className: "MosaicDendroTreeSpeciesModule",
			classTemplate: MosaicDendroTreeSpeciesModule
		});
		this.modules.push({
			title: "Dating histogram",
			className: "MosaicDendroDatingHistogramModule",
			classTemplate: MosaicDendroDatingHistogramModule
		});
		this.modules.push({
			title: "Tree species",
			className: "MosaicDendroTreeSpeciesChartModule",
			classTemplate: MosaicDendroTreeSpeciesChartModule
		});

		this.modules.forEach(mReg => {
			mReg.name = new mReg.classTemplate().name;
		});
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
	setBgLoadingIndicator(containerNode, isLoading) {
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
		resultGridModules.forEach(mConf => {
			let mosaicTileId = nanoid();
			mConf.grid_box_id = this.getGridBoxId(mConf);

			let tileNode = $("<div id='"+mosaicTileId+"' class='result-mosaic-tile'></div>");
			let module = this.createInstanceOfModule(mConf.name);
			mConf.module = module;

			if(module !== false) {
				let titleSelectHtml = "<h2><select result-mosaic-tile-id='"+mosaicTileId+"' class=\"result-mosaic-tile-chart-selector\">";
				let selectOptionsHtml = "";
				resultGridModules.forEach(gridModule => {
					let moduleMeta = this.getModuleMetaByName(gridModule.name)
					if(gridModule.name == mConf.name) {
						selectOptionsHtml += "<option value=\""+gridModule.name+"\" selected=\"selected\">"+moduleMeta.title+"</option>";
					}
					else {
						selectOptionsHtml += "<option value=\""+gridModule.name+"\">"+moduleMeta.title+"</option>";
					}
				});
				
				titleSelectHtml += selectOptionsHtml;
				titleSelectHtml += "</select></h2>";
				tileNode.append(titleSelectHtml);
				tileNode.append("<div id='"+mConf.grid_box_id+"' module-name='"+mConf.name+"' class='result-mosaic-graph-container'></div>");
				tileNode.css("grid-row", mConf.grid_row);
				tileNode.css("grid-column", mConf.grid_column);
				$('#result-mosaic-container').append(tileNode);
				let promise = module.render("#"+mConf.grid_box_id);
				this.renderPromises.push(promise);
				
			}
			else {
				tileNode.append("<h2>NoSuchModuleError - "+mConf.name+"</h2>");
				tileNode.append("<div id='"+module.name+"' class='result-mosaic-graph-container'></div>");
				tileNode.css("grid-row", mConf.grid_row);
				tileNode.css("grid-column", mConf.grid_column);
				$('#result-mosaic-container').append(tileNode);
			}

		});

		this.bindGridModuleSelectionCallbacks();
	}

	getLiveModuleInstanceByName(name) {
		let domain = this.sqs.domainManager.getActiveDomain();
		for(let key in domain.result_grid_modules) {
			if(domain.result_grid_modules[key].name == name) {
				return domain.result_grid_modules[key].module;
			}
		}
		return false;
	}

	updateGridModules() {
		let activeDomain = this.sqs.domainManager.getActiveDomain();
		let userConfig = this.sqs.loadUserSettings();

		let gridModuleLayout = null;
		userConfig.domains.forEach(d => {
			if(d.name == activeDomain.name) {
				gridModuleLayout = d.result_grid_modules;
			}
		});

		gridModuleLayout.forEach(moduleConf => {
			let module = this.getLiveModuleInstanceByName(moduleConf.name);
			console.log("Updating grid module "+module.name);
			module.update();
		});
	}

	bindGridModuleSelectionCallbacks() {

		$(".result-mosaic-tile-chart-selector").on("change", (evt) => {
			let tileNodeId = $(evt.target).attr("result-mosaic-tile-id");
			let graphContainer = $("#"+tileNodeId+" .result-mosaic-graph-container")
			let gridBoxId = graphContainer.attr("id");

			//let currentModuleName = $("#"+tileNodeId).attr("module-name");
			let selectedModuleName = $(evt.target).val();

			let userConfig = this.sqs.loadUserSettings();
			let activeDomain = this.sqs.domainManager.getActiveDomain();
			
			userConfig.domains.forEach(userConfDom => {
				if(userConfDom.name == activeDomain.name) {
					for(let key in userConfDom.result_grid_modules) {
						if(typeof userConfDom.result_grid_modules[key].grid_box_id == "undefined") {
							userConfDom.result_grid_modules[key].grid_box_id = this.getGridBoxId(userConfDom.result_grid_modules[key]);
						}
						if(userConfDom.result_grid_modules[key].grid_box_id == gridBoxId) {
							console.log("updating "+userConfDom.result_grid_modules[key].name+" to "+selectedModuleName)
							userConfDom.result_grid_modules[key].name = selectedModuleName;
						}
					}
				}
			});
			this.sqs.storeUserSettings(userConfig);
			$("#"+gridBoxId).attr("module-name", selectedModuleName);
			$("#"+gridBoxId).html("");

			let newModule = this.createInstanceOfModule(selectedModuleName);
			newModule.render("#"+gridBoxId);
		});
	}

	createInstanceOfModule(moduleName) {
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

		//let userConfig = this.sqs.loadUserSettings();
		let domain = this.sqs.domainManager.getActiveDomain();
		this.applyDomainGridLayout(domain);

		if($(".result-mosaic-tile").length == 0) {
			this.renderGridModules(domain.result_grid_modules);
		}
		else {
			this.updateGridModules(domain.result_grid_modules);
		}
		
		return;

		this.requestBatchId++;

		let dendroChartOptions = [];
		domain.result_grid_modules.forEach(mConf => {
			let module = this.getModuleByName(mConf.module);
			dendroChartOptions.push({
				moduleName: mConf.module,
				html: "<option value=\""+module.name+"\">"+module.title+"</option>"
			});
		});
		

		domain.result_grid_modules.forEach(mConf => {
			let tileNodeId = nanoid();
			mConf.grid_box_id = tileNodeId;
			let tileNode = $("<div class='result-mosaic-tile'></div>");
			let module = this.getModuleByName(mConf.module);

			if(module !== false) {
				let titleSelectHtml = "<h2><select tile-node-id='"+tileNodeId+"' class=\"result-mosaic-tile-chart-selector\">";
				dendroChartOptions.forEach(dco => {
					if(dco.moduleName == module.name) {
						titleSelectHtml += "<option value=\""+module.name+"\" selected=\"selected\">"+module.title+"</option>";
					}
					else {
						titleSelectHtml += dco.html;
					}
				});

				titleSelectHtml += dendroChartOptions;
				titleSelectHtml += "</select></h2>";
				tileNode.append(titleSelectHtml);
				//tileNode.append("<div id='"+module.name+"' class='result-mosaic-graph-container'></div>");
				tileNode.append("<div id='"+tileNodeId+"' module-name='"+module.name+"' class='result-mosaic-graph-container'></div>");
				tileNode.css("grid-row", mConf.grid_row);
				tileNode.css("grid-column", mConf.grid_column);
				$('#result-mosaic-container').append(tileNode);
				let promise = module.render("#"+tileNodeId);
				this.renderPromises.push(promise);
				
			}
			else {
				tileNode.append("<h2>NoSuchModuleError - "+mConf.module+"</h2>");
				tileNode.append("<div id='"+module.name+"' class='result-mosaic-graph-container'></div>");
				tileNode.css("grid-row", mConf.grid_row);
				tileNode.css("grid-column", mConf.grid_column);
				$('#result-mosaic-container').append(tileNode);
			}
			
		});

		$(".result-mosaic-tile-chart-selector").on("change", (evt) => {
			let currentModuleName = $("#"+tileNodeId).attr("module-name");
			let selectedModuleName = $(evt.target).val();
			let tileNodeId = $(evt.target).attr("tile-node-id");

			let tileNode = $("#"+tileNodeId);

			let userConfig = this.sqs.loadUserSettings();
			let activeDomain = this.sqs.domainManager.getActiveDomain();
			
			userConfig.domains.forEach(userConfDom => {
				if(userConfDom.name == activeDomain.name) {
					console.log(activeDomain, userConfDom);
					for(let key in userConfDom.result_grid_modules) {
						if(userConfDom.result_grid_modules[key].grid_box_id == tileNodeId) {
							userConfDom.result_grid_modules[key].module = selectedModuleName;
						}
					}
				}
			});
			this.sqs.storeUserSettings(userConfig);

			domain.result_grid_modules.forEach(mConf => {
				if(mConf.module == selectedModuleName) {
					mConf.grid_row = tileNode.css("grid-row");
					mConf.grid_column = tileNode.css("grid-column");
				}
			});


			//Unrender old module before rendring new one
			/*
			let currentModuleName = $("#"+tileNodeId).attr("module-name");
			let currentModule = this.getModuleByName(currentModuleName);
			currentModule.unrender();
			*/

			//Update module name for this node
			//FIXME: What is you have multiple instances though?
			$("#"+tileNodeId).attr("module-name", selectedModuleName);
			$("#"+tileNodeId).html("");

			let module = this.getModuleByName(selectedModuleName);
			module.render("#"+tileNodeId);

			
		});

		
		/*
		for(let key in this.modules) {
			if(this.modules[key].domains.includes(domain.name) || this.modules[key].domains.includes("*")) {
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
		*/

		if(this.renderPromises.length == 0) {
			this.sqs.sqsEventDispatch("resultModuleRenderComplete");
			this.resultManager.showLoadingIndicator(false);
		}

		Promise.all(this.renderPromises).then(() => {
			console.log("Mosaic modules render complete");
			this.sqs.sqsEventDispatch("resultModuleRenderComplete");
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
			this.renderNoDataMsg(renderIntoNode);
			return;
		}
		else {
			this.unrenderNoDataMsg(renderIntoNode);
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

		return zc;
	}

	renderHistogram(renderIntoNode, chartSeries, render = true) {

		if(chartSeries.length == 0) {
			this.renderNoDataMsg(renderIntoNode);
			return;
		}
		else {
			this.unrenderNoDataMsg(renderIntoNode);
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
				config.series[key].text = "Low uncertainty";
			}
			if(key == 1) {
				config.series[key].text = "High uncertainty";
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
			"layout":rows+"x1", //row x column
			"toggle-action":"remove"
		};

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

	renderNoDataMsg(renderIntoNode) {
		let noDataMsgNode = $("<div class='result-mosaic-no-data-msg'><div>No data</div></div>");
		$(renderIntoNode).append(noDataMsgNode);
	}

	unrenderNoDataMsg(renderIntoNode) {
		$(".result-mosaic-no-data-msg", renderIntoNode).remove();
	}
	
	renderPieChart(renderIntoNode, chartSeries, chartTitle) {

		if(chartSeries.length == 0) {
			this.renderNoDataMsg(renderIntoNode);
			return;
		}
		else {
			this.unrenderNoDataMsg(renderIntoNode);
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
		/*
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
		*/
		/*
		for(let k in this.graphs) {
			zingchart.exec(this.graphs[k].anchor.substr(1), 'destroy');
			this.removeFromGraphRegistry(this.graphs[k].anchor);
		}
		*/

		$("#result-mosaic-container").html("");
	}

	/*
	unrenderModule(moduleName) {
		this.modules.forEach((module) => {
			if(module.name == moduleName) {
				//module.unrender();
				if(module.renderIntoNode != null) {
					//module.renderIntoNode.substr(1)
					zingchart.exec(module.renderIntoNode, 'destroy');
				}
				
			}
		});
	}
	*/
	exportSettings() {
		return {};
	}
	
	importSettings(settings) {
	}
	
}

export { ResultMosaic as default }