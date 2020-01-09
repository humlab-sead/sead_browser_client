import GenericDataset from './DatasetModules/GenericDataset.class';
import AbundanceDataset from './DatasetModules/AbundanceDataset.class';
import MeasuredValueDataset from './DatasetModules/MeasuredValueDataset.class';
import DendrochronologyDataset from "./DatasetModules/DendrochronologyDataset.class";
import CeramicDataset from "./DatasetModules/CeramicDataset.class";
/*
* Class: Analysis
* 
 */

/* About: Analysis modules
* To prevent the Analysis class from growing to be huge, the handling of different types of analyses are broken out into modules. One module might handle several types of analyses
* if they are similar enoug for it to make sense.
* Each analysis module (which is a class) needs to implement the offerAnalyses(datasets, sections) method. All the datasets (synonymous with analyses) are passed in through this method. 
* The module needs to make a decision on whether to "claim" the dataset or not, it does this by splicing it out of the datasets array. Because of this, the order in which the modules
* are placed in the this.analysisModules array can be important if multiple modules will claim the same types of datasets. Which should be the case in the way that the "Generic" module
* should always claim all datasets and provide a basic representation. Therefore it is important that the Generic module is last in the list of modules.
*
* The second parameters passed in is sections, which is an array of section objects. The analysis module should insert as many of its own sections here as it deems appropriate, which
* is usually just one but can be more if the module handle several different types of analyses. The section object follows the Site Report data structure specification.
* 
* The offerAnalyses() method should return a promise which should be resolved when the modules job is complete. The modules job is complete when the appropriate data structure
* representing the data and how it should be rendered has been built.
*
* What happens between offerAnalyses() and the building of the section (and then resolution of the promise when this is complete), is entirely up to the module, but will normally
* entail some fetching and formatting of data to build the data structure.
*/

class Analysis {
	/*
	* Function: constructor
	*/
	constructor(hqs, siteId) {
		this.hqs = hqs;
		this.siteId = siteId;
		this.buildComplete = false;
		//The section structure this will result in after everything is fetched and parsed.
		this.section = {
			"name": "analyses",
			"title": "Analyses",
			"contentItems": [],
			"sections": [] //Each type of analysis/method will get its own section here
		};

		this.methods = []; //Will contain method meta data
		
		this.data = {
			"analyses": []
		};
		
		this.meta = {
			"methods": []
		};
		
		/* ABOUT analysisModules
		* So what's going on here is that there's a lot of different type of analyses that can be done and lots of different type of datasets
		* so in order for this class not to get HUGE we break them out into modules. So each module takes responsibility for knowing how to handle
		* a certain type of analysis/dataset, both in terms of what extra data can be fetched and how to best render it.
		* All these modules gets registered here and then this class does the basic loading of analyses and then each analysis
		* is handed off to a module (hopefully - assuming there will always be a module written for every type of analysis in the db).
		*
		* NOTE: Order is important here, more specific modules should be first and more generic last, since whichever module claims an analysis first
		* is the one to get it.
		 */
		this.analysisModules = [];
		this.activeAnalysisModules = [];
		this.analysisModules.push({
			"className": AbundanceDataset
		});
		this.analysisModules.push({
			"className": MeasuredValueDataset
		});
		this.analysisModules.push({
			"className": DendrochronologyDataset
		});
		this.analysisModules.push({
			"className": CeramicDataset
		});
		this.analysisModules.push({
			"className": GenericDataset
		});

		for(let key in this.analysisModules) {
			this.analysisModules[key]["instance"] = new this.analysisModules[key]["className"](this);
		}
		
	}

	/*
	* Function: render
	*/
	render() {
		this.hqs.siteReportManager.siteReport.renderSection(this.section);
		this.destroyAllAnalysisModules();
	}
	
	/*
	* Function: destroyAllAnalysisModules
	*/
	destroyAllAnalysisModules() {
		for(var key in this.activeAnalysisModules) {
			this.activeAnalysisModules[key].destroy();
			this.activeAnalysisModules.splice(key, 1);
		}
	}

	/*
	* Function: fetch
	*/
	async fetch() {
		//Fetching all analyses for this site
		await new Promise((resolve, reject) => {

			$.ajax(this.hqs.config.siteReportServerAddress+"/qse_site_analyses?site_id=eq."+this.siteId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					for(var key in data) { //For each analysis...
						//Each analysis (data[key]) here contains:
						//method_id - Defines what type of analysis this is
						//dataset_id - A key you can use to fetch more information about this dataset (a dataset is a result set from an analysis)
						//sample_group_id - The sample group this analysis was performed on
						
						//Check that this datasetId is not already registered. Sometimes we get duplicate dataset ID's with different sample groups as individual rows,
						//presumably because multiple sample groups are sometimes used to perform an analysis
						var analysisKey = this.hqs.findObjectPropInArray(this.data.analyses, "datasetId", data[key].dataset_id);
						
						if(analysisKey === false) {
							this.data.analyses.push({
								"methodGroupId": data[key].method_group_id,
								"methodId": data[key].method_id,
								"datasetId": data[key].dataset_id,
								"sampleGroups": [{
									"sampleGroupId": data[key].sample_group_id,
									"samples": []
								}]
							});
						}
						else {
							this.data.analyses[analysisKey].sampleGroups.push({
								"sampleGroupId": data[key].sample_group_id,
								"samples": []
							});
						}
					}
					
					let analysesPromises = this.delegateAnalyses(this.data.analyses);

					Promise.all(analysesPromises).then(() => {
						this.render();
						resolve();
					});

					//Now that we have stored the analyses properly, fetch more data about each one.
					//(analysis and dataset is pretty much synonymous since the dataset is a result of an analysis)
					/*
					for(var key in this.data.analyses) {
						analysisPromises.push(this.fetchAnalysis(this.data.analyses[key].datasetId));
					}
					

					let promises = methodPromises.concat(analysisPromises);

					Promise.all(promises).then((values) => {
						//console.log("All analyses fetched and built - Running Analysis Render", values);
						this.render();
						resolve(data);
					});
					*/
				},
				error: () => {
					reject();
				}
			});
		});
	}

	/** 
	* Function: delegateAnalyses
	*
	* 
	*
	*/
	delegateAnalyses(analyses) {
		let analysesPromises = [];
		for(var key in this.analysisModules) {
			let promise = this.analysisModules[key]["instance"].offerAnalyses(analyses, this.section.sections);
			analysesPromises.push(promise);
		}
		return analysesPromises;
	}
	
	/*
	* Function: fetchAnalysis
	*
	* Fetches all data about a certain anlysis/dataset, and stores the data in the master data structure. If you thought you were actually gonna get it returned
	* then I must laugh in your general direction, because this is now how the glory of asynchronous javascript work you simple peasant. You want data? You get a slap to the face, and even that is quite generous.
	*
	* Parameters:
	* datasetId
	 */
	async fetchAnalysis(dataset) {
		await new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/qse_analysis?dataset_id=eq."+dataset.datasetId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					//Find the relevant analysis in the master data structure
					dataset.dataTypeId = data[0].data_type_id;
					dataset.masterSetId = data[0].master_set_id; //1 or 2 which is Bugs or MAL, also often empty
					dataset.dataTypeName = data[0].data_type_name;
					dataset.dataTypeDefinition = data[0].definition;
					dataset.methodId = data[0].method_id;
					dataset.methodName = data[0].method_name;
					dataset.datasetName = data[0].dataset_name;
					resolve(dataset);
				}
			});
		});
	}

	async fetchDataset(datasetId) {
		await new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/datasets?dataset_id=eq."+dataset.datasetId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					//Find the relevant analysis in the master data structure
					dataset.dataTypeId = data[0].data_type_id;
					dataset.masterSetId = data[0].master_set_id; //1 or 2 which is Bugs or MAL, also often empty
					dataset.dataTypeName = data[0].data_type_name;
					dataset.dataTypeDefinition = data[0].definition;
					dataset.methodId = data[0].method_id;
					dataset.methodName = data[0].method_name;
					dataset.datasetName = data[0].dataset_name;
					resolve(dataset);
				}
			});
		});
	}

	/*
	* Function: fetchMethodMetaData
	*
	* Fetches all information about a particular method. Such as name & description.
	*
	* Parameters:
	* methodId - The id of the method to fetch.
	 */
	async fetchMethodMetaData(methodId) {
		new Promise((resolve, reject) => {
			let methodObj = null;
			var methodFound = false;
			for(var key in this.meta.methods) {
				if(this.meta.methods[key].method_id == methodId) {
					methodFound = true;
					methodObj = this.meta.methods[key];
				}
			}
			
			if(methodFound == false) {
				$.ajax(this.hqs.config.siteReportServerAddress+"/methods?method_id=eq."+methodId, {
					method: "get",
					dataType: "json",
					success: (data, textStatus, xhr) => {
						let method = data[0];
						this.meta.methods.push(method);
						resolve(method);
					},
					error: () => {
						console.error("WARN: Failed to fetch method meta data");
						reject();
					}
				});
			}
			else {
				resolve(methodObj);
			}
		});
	}
	
	/*
	* Function: destroy
	*/
	destroy() {
	}

	/*
	* Function: fetchSampleType
	*/
	async fetchSampleType(dataset) {
		let uniqueFetchIds = new Set();
		for(let key in dataset.dataPoints) {
			let sampleTypeId = dataset.dataPoints[key].sampleTypeId;
			if (sampleTypeId != null) {
				uniqueFetchIds.add(sampleTypeId);
			}
		}
		let fetchIds = Array.from(uniqueFetchIds);

		let sampleTypes = await this.hqs.fetchFromTable("qse_sample_types", "sample_type_id", fetchIds);

		dataset.dataPoints.map((dp) => {
			sampleTypes.map((st) => {
				if(dp.sampleTypeId == st.sample_type_id) {
					dp.sampleType = st;
				}
			});
		});
	}

	/*
	* Function: fetchMethodMetaData
	*
	* Fetch information about a particular method, such as name and description.
	*
	* Parameters:
	* methodId - The ID of the method.
	*/
	async fetchMethodMetaData(methodId) {
		return new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/methods?method_id=eq."+methodId, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					this.methods.push({
						methodId: data[0].method_id,
						description: data[0].description,
						abbrev: data[0].method_abbrev_or_alt_name,
						name: data[0].method_name,
						recordTypeId: data[0].record_type_id,
						unitId: data[0].unit_id
					});
					resolve();
				}
			});
		});
	}

	async fetchMethodsInGroup(methodGroupId) {
		return new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/methods?method_group_id=eq."+methodGroupId, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					data.map((method) => {
						this.methods.push({
							methodId: method.method_id,
							description: method.description,
							abbrev: method.method_abbrev_or_alt_name,
							name: method.method_name,
							recordTypeId: method.record_type_id,
							unitId: method.unit_id
						});
					});
					
					resolve();
				}
			});
		});
	}

	/*
	* Function: fetchMethodGroupMetaData
	*
	* Fetch information about a particular method group, such as name and description.
	*
	* Parameters:
	* methodGroupId - The ID of the method group.
	*/
	async fetchMethodGroupMetaData(methodGroupId) {
		return new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/method_groups?method_group_id=eq."+methodGroupId, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					this.methodGroup = {
						methodGroupId: data[0].method_group_id,
						description: data[0].description,
						name: data[0].group_name
					};
					resolve();
				}
			});
		});
	}

	/*
	* Function: getMethodMetaById
	*/
	getMethodMetaById(methodId) {
		for(let key in this.methods) {
			if(this.methods[key].methodId == methodId) {
				return this.methods[key];
			}
		}
		return false;
	}

	/*
	* Function: getSectionByMethodId
	*/
	getSectionByMethodId(methodId) {
		for(let key in this.section.sections) {
			if(this.section.sections[key].name == methodId) {
				return this.section.sections[key];
			}
		}
		return false;
	}
}

export { Analysis as default }