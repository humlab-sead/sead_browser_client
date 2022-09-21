import GenericDataset from './DatasetModules/GenericDataset.class';
import AbundanceDataset from './DatasetModules/AbundanceDataset.class';
import MeasuredValueDataset from './DatasetModules/MeasuredValueDataset.class';
import DendrochronologyDataset from "./DatasetModules/DendrochronologyDataset.class";
import CeramicDataset from "./DatasetModules/CeramicDataset.class";
import RadioMetricDatingDataset from "./DatasetModules/RadioMetricDatingDataset.class";
import DatingToPeriodDataset from "./DatasetModules/DatingToPeriodDataset.class";
import MagneticSusceptibilityDataset from "./DatasetModules/MagneticSusceptibilityDataset.class";
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
	constructor(sqs, siteId) {
		this.sqs = sqs;
		this.siteId = siteId;
		this.buildComplete = false;
		this.auxiliaryDataFetched = true; //There is currently no auxiliary data to fetch for any analysis module, so... 

		//The section structure this will result in after everything is fetched and parsed.
		this.section = {
			"name": "analyses",
			"title": "Analyses",
			"contentItems": [],
			"sections": [] //Each type of analysis/method will get its own section here
		};
		
		this.data = {
			"analyses": []
		};
		
		//Will contain method meta data
		this.meta = {
			"methods": [], 
			"methodGroups": []
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
		this.datasetModules = [];
		this.activeDatasetModules = []; 
		this.datasetModules.push({
			"className": MagneticSusceptibilityDataset
		});
		this.datasetModules.push({
			"className": AbundanceDataset
		});
		this.datasetModules.push({
			"className": MeasuredValueDataset
		});
		this.datasetModules.push({
			"className": DendrochronologyDataset
		});
		this.datasetModules.push({
			"className": CeramicDataset
		});
		this.datasetModules.push({
			"className": RadioMetricDatingDataset
		});
		this.datasetModules.push({
			"className": DatingToPeriodDataset
		});
		this.datasetModules.push({
			"className": GenericDataset
		});

		for(let key in this.datasetModules) {
			this.datasetModules[key]["instance"] = new this.datasetModules[key]["className"](this);
		}
	}

	getDatasetModuleByName(name) {
		for(let key in this.datasetModules) {
			if(this.datasetModules[key]["instance"].name == name) {
				return this.datasetModules[key]["instance"];
			}
		}
	}

	/*
	* Function: render
	*/
	render(siteData) {
		//analysis.fetch()->delegateAnalyses()->dendro-fetch - need to replace this
		this.delegateBuildSection(siteData, this.section);
		this.sqs.siteReportManager.siteReport.renderSection(this.section);
		this.destroyAllDatasetModules();
	}
	
	/*
	* Function: destroyAllDatasetModules
	*/
	destroyAllDatasetModules() {
		for(var key in this.activeDatasetModules) {
			this.activeDatasetModules[key].destroy();
			this.activeDatasetModules.splice(key, 1);
		}
	}

	async fetchSamplesBySampleGroupId(sampleGroupId) {
		let samples = null;
		await $.ajax(this.sqs.config.siteReportServerAddress+"/physical_samples?sample_group_id=eq."+sampleGroupId, {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				samples = data;
			}
		});

		return samples;
	}

	/*
	* Function: fetch
	*/
	async fetch() {
		//Fetching all analyses for this site
		await new Promise((resolve, reject) => {

			$.ajax(this.sqs.config.siteReportServerAddress+"/qse_site_analyses?site_id=eq."+this.siteId, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					for(var key in data) { //For each analysis...
						//Each analysis (data[key]) here contains:
						//method_id - Defines what type of analysis this is
						//dataset_id - A key you can use to fetch more information about this dataset (a dataset is a result set from an analysis)
						//sample_group_id - The sample group this analysis was performed on
						
						//Check that this datasetId is not already registered. Sometimes we get duplicate dataset ID's with different sample groups as individual rows,
						//presumably because multiple sample groups are sometimes used to perform an analysis
						var analysisKey = this.sqs.findObjectPropInArray(this.data.analyses, "datasetId", data[key].dataset_id);
						
						//Load the physical_samples for this sampleGroup
						let samples = await this.fetchSamplesBySampleGroupId(data[key].sample_group_id);

						if(analysisKey === false) {
							this.data.analyses.push({
								"methodGroupId": data[key].method_group_id,
								"methodId": data[key].method_id,
								"datasetId": data[key].dataset_id,
								"sampleGroups": [{
									"sampleGroupId": data[key].sample_group_id,
									"samples": samples
								}]
							});
						}
						else {
							this.data.analyses[analysisKey].sampleGroups.push({
								"sampleGroupId": data[key].sample_group_id,
								"samples": samples
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

	delegateBuildSection(siteData, section) {
		console.log(siteData);
		for(let key in this.datasetModules) {
			this.datasetModules[key]["instance"].makeSection(siteData, section.sections);
		}
		return section;
	}

	/** 
	* Function: delegateAnalyses
	*
	* 
	*
	*/
	delegateAnalyses(analyses) {
		let analysesPromises = [];
		for(var key in this.datasetModules) {
			let promise = this.datasetModules[key]["instance"].offerAnalyses(analyses, this.section.sections);
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
			$.ajax(this.sqs.config.siteReportServerAddress+"/qse_analysis?dataset_id=eq."+dataset.datasetId, {
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
			$.ajax(this.sqs.config.siteReportServerAddress+"/datasets?dataset_id=eq."+dataset.datasetId, {
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

	addMethodMetaData(method) {
		for(var key in this.meta.methods) {
			if(this.meta.methods[key].method_id == method.methodId) {
				return false;
			}
		}
		this.meta.methods.push(method);
		return true;
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
		if(this.getMethodMetaDataById(methodId) === false) {
			await $.ajax(this.sqs.config.siteReportServerAddress+"/methods?method_id=eq."+methodId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					let method = data[0];
					//this.addMethodMetaData(method);

					this.addMethodMetaData({
						methodId: method.method_id,
						description: method.description,
						abbrev: method.method_abbrev_or_alt_name,
						name: method.method_name,
						recordTypeId: method.record_type_id,
						unitId: method.unit_id
					});

					return method;
				},
				error: () => {
					console.error("WARN: Failed to fetch method meta data");
					return false;
				}
			});
		}
		else {
			return this.getMethodMetaDataById(methodId);
		}
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

		let sampleTypes = await this.sqs.fetchFromTable("qse_sample_types", "sample_type_id", fetchIds);

		dataset.dataPoints.map((dp) => {
			sampleTypes.map((st) => {
				if(dp.sampleTypeId == st.sample_type_id) {
					dp.sampleType = st;
				}
			});
		});
	}

	async fetchMethodsInGroup(methodGroupId) {
		await $.ajax(this.sqs.config.siteReportServerAddress+"/methods?method_group_id=eq."+methodGroupId, {
			method: "get",
			dataType: "json",
			success: async (data, textStatus, xhr) => {
				data.map((method) => {
					if(this.getMethodMetaDataById(method.method_id) === false) {
						this.addMethodMetaData({
							methodId: method.method_id,
							description: method.description,
							abbrev: method.method_abbrev_or_alt_name,
							name: method.method_name,
							recordTypeId: method.record_type_id,
							unitId: method.unit_id
						});
					}
				});
			}
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
			$.ajax(this.sqs.config.siteReportServerAddress+"/method_groups?method_group_id=eq."+methodGroupId, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					this.meta.methodGroups.push({
						methodGroupId: data[0].method_group_id,
						description: data[0].description,
						name: data[0].group_name
					});
					resolve();
				}
			});
		});
	}

	/*
	* Function: getMethodMetaDataById
	*/
	getMethodMetaDataById(methodId) {
		for(let key in this.meta.methods) {
			if(this.meta.methods[key].methodId == methodId) {
				return this.meta.methods[key];
			}
		}
		//console.warn("Couldn't find method with ID", methodId, "in method db (db has "+this.meta.methods.length+" entries)", this.meta.methods);
		return false;
	}

	getMethodGroupMetaDataById(methodGroupId) {
		for(let key in this.meta.methodGroups) {
			if(this.meta.methodGroups[key].methodGroupId == methodGroupId) {
				return this.meta.methodGroups[key];
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

	async fetchRelativeAgesByAnalysisEntityId(analysisEntityId) {
		let relativeDates = null;

		//One analysis entity can have multiple dating/ageing-specifications, so first get the links to all of those
		await $.ajax(this.sqs.config.siteReportServerAddress+"/relative_dates?analysis_entity_id=eq."+analysisEntityId, {
			method: "get",
			dataType: "json",
			success: async (data, textStatus, xhr) => {
				relativeDates = data;
			}
		});

		let promises = [];

		//Then for each link, get the dating/ageing-specifikations themselves
		for(let key in relativeDates) {
			let p = $.ajax(this.sqs.config.siteReportServerAddress+"/relative_ages?relative_age_id=eq."+relativeDates[key].relative_age_id, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					return data[0];
				}
			});
			promises.push(p);
		}

		let returnData =  {
			analysisEntityId: analysisEntityId,
			dating: []
		};

		await Promise.all(promises).then((dating) => {
			returnData.dating = dating[0];
		});

		return returnData;
	}
}

export { Analysis as default }