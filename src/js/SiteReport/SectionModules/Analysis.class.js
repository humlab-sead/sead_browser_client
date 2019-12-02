import GenericDataset from './DatasetModules/GenericDataset.class';
import AbundanceDataset from './DatasetModules/AbundanceDataset.class';
import MeasuredValueDataset from './DatasetModules/MeasuredValueDataset.class';
/*
* Class: Analysis
*
 */

class Analysis {
	constructor(hqs, siteId, anchor) {
		this.hqs = hqs;
		this.siteId = siteId;
		this.anchor = anchor;
        this.buildComplete = false;
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
			"className": GenericDataset
		});
	}

	render() {
		this.hqs.siteReportManager.siteReport.renderSection(this.section);
		this.destroyAllAnalysisModules();
	}
	
	destroyAllAnalysisModules() {
		for(var key in this.activeAnalysisModules) {
			this.activeAnalysisModules[key].destroy();
			this.activeAnalysisModules.splice(key, 1);
		}
	}

	async fetch() {
		//Fetching all analyses for this site
		await new Promise((resolve, reject) => {

			$.ajax(this.hqs.config.siteReportServerAddress+"/qse_site_analyses?site_id=eq."+this.siteId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					
					//this.section.title += " <span class='small-auxiliary-header-text'>("+data.length+" datasets)</span>";
					let methodPromises = [];
					let analysisPromises = [];
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
							//this.fetchMethodMetaData(data[key].method_id);
							methodPromises.push(this.fetchMethodMetaData(data[key].method_id));
						}
						else {
							this.data.analyses[analysisKey].sampleGroups.push({
								"sampleGroupId": data[key].sample_group_id,
								"samples": []
							});
						}
					}

					
					
					//Now that we have stored the analyses properly, fetch more data about each one.
					//(analysis and dataset is pretty much synonymous since the dataset is a result of an analysis)
					for(var key in this.data.analyses) {
						analysisPromises.push(this.fetchAnalysis(this.data.analyses[key].datasetId));
					}

					let promises = methodPromises.concat(analysisPromises);

					Promise.all(promises).then((values) => {
						//console.log("All analyses fetched and built - Running Analysis Render", values);
						this.render();
						resolve(data);
					});
				},
				error: () => {
					reject();
				}
			});
		});
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
	async fetchAnalysis(datasetId) {
		
		let dataset = null;
		await new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/qse_analysis?dataset_id=eq."+datasetId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					//Find the relevant analysis in the master data structure
					var analysisKey = this.hqs.findObjectPropInArray(this.data.analyses, "datasetId", datasetId);
					this.data.analyses[analysisKey].dataTypeId = data[0].data_type_id;
					this.data.analyses[analysisKey].masterSetId = data[0].master_set_id; //1 or 2 which is Bugs or MAL, also often empty
					this.data.analyses[analysisKey].dataTypeName = data[0].data_type_name;
					this.data.analyses[analysisKey].dataTypeDefinition = data[0].definition;
					this.data.analyses[analysisKey].methodId = data[0].method_id;
					this.data.analyses[analysisKey].methodName = data[0].method_name;
					this.data.analyses[analysisKey].datasetName = data[0].dataset_name;

					dataset = this.data.analyses[analysisKey];

					resolve(dataset);
				}
			});
		});

		
		let foundModuleForDataset = await this.fetchAnalysisDataset(this.hqs.copyObject(dataset));
		if(foundModuleForDataset === false) {
			console.log("WARN: Couldn't find a module for analysis ", analysis);
		}
		
	}
	
	async fetchAnalysisDataset(analysis) {
		//See if there's any registered analysis modules willing to take responsibility for this analysis
		let acceptedModule = null;
		for(var key in this.analysisModules) {
			if(acceptedModule == null) {
				var am = new this.analysisModules[key]["className"](this);
				let analysisAccepted = am.offerAnalysis(JSON.stringify(analysis));

				if(analysisAccepted) {
					acceptedModule = am;
				}
			}
		}

		if(acceptedModule == null) {
			console.error("WARN: No analysis module claimed this dataset!");
			return false;
		}
		else {
			return await acceptedModule.fetchDataset();
		}
	}
	
	
	/*
	* Function: fetchMethodMetaData
	*
	* Fetches all information about a particular method. Such as name & description.
	*
	* Parameters:
	* methodId - The id of the method to fetch.
	 */
	fetchMethodMetaDataOld(methodId) {
		
		var methodFound = false;
		for(var key in this.meta.methods) {
			if(this.meta.methods[key].method_id == methodId) {
				methodFound = true;
			}
		}
		
		if(methodFound == false) {
			var xhr1 = this.hqs.pushXhr(null, "fetchSiteAnalyses");
			xhr1.xhr = $.ajax(this.hqs.config.siteReportServerAddress+"/methods?method_id=eq."+methodId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					this.meta.methods.push(data[0]);
					this.hqs.popXhr(xhr1);
				}
			});
		}
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
	
	
	destroy() {
	}


	fetchSampleType(dataset) {

		let fetchIds = [];
		for(let key in dataset) {
			let sampleTypeId = dataset[key].sample_type_id;
			if (sampleTypeId != null) {
				fetchIds.push(sampleTypeId);
			}
		}
		
		let queries = [];
		let itemsLeft = fetchIds.length;

		let queryString = "(";
		for(let key in fetchIds) {
			queryString += "sample_type_id.eq."+fetchIds[key]+",";
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

		let promises = [];

		for(let key in queries) {
			let requestString = this.hqs.config.siteReportServerAddress+"/qse_sample_types?or="+queries[key];
			
			let p = new Promise((resolve, reject) => {
				$.ajax(requestString, {
					method: "get",
					dataType: "json",
					success: (sampleTypeData) => {
	
						for(let key in dataset) {
							for(let sampleTypeKey in sampleTypeData) {
								if(dataset[key].sample_type_id == sampleTypeData[sampleTypeKey].sample_type_id) {
									dataset[key].sample_type = sampleTypeData[sampleTypeKey];
								}
							}
						}
						resolve(sampleTypeData);
					}
				});
			});

			promises.push(p);
		}

		return promises;
	}
}

export { Analysis as default }