import DatasetModule from "./DatasetModule.class";
import moment from "moment";
import { $dataMetaSchema } from "ajv";


/*
* Class: RadioMetricDatingDataset
*/

class RadioMetricDatingDataset extends DatasetModule {
	/* Function: constructor
	*/
	constructor(analysis) {
		super();
		this.sqs = analysis.sqs;
		this.analysis = analysis;
		this.section = analysis.section;
		this.data = analysis.data;
		this.taxonPromises = [];
		this.datasetFetchPromises = [];
		this.datasets = [];
		this.buildIsComplete = false;
		this.methodMetaDataFetchingComplete = false;
		this.datingUncertainty = [];

		this.methodGroupId = 3;
		this.metaDataFetchingPromises = [];
		this.metaDataFetchingPromises.push(this.analysis.fetchMethodGroupMetaData(this.methodGroupId));
		this.metaDataFetchingPromises.push(this.analysis.fetchMethodsInGroup(this.methodGroupId));
		this.metaDataFetchingPromises.push(this.fetchDatingUncertaintySpecification());

		Promise.all(this.metaDataFetchingPromises).then(() => {
			this.methodMetaDataFetchingComplete = true;
		});
	}

	async fetchDatingUncertaintySpecification() {
		await $.ajax(this.sqs.config.siteReportServerAddress+"/dating_uncertainty", {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				this.datingUncertainty = data;
				return this.datingUncertainty;
			}
		});
	}

	getDatingUncertaintyById(datingUncertaintyId) {
		for(let key in this.datingUncertainty) {
			if(this.datingUncertainty[key].dating_uncertainty_id == datingUncertaintyId) {
				return this.datingUncertainty[key];
			}
		}
		return false;
	}
	
	/* Function: offerAnalyses
	*/
	offerAnalyses(datasets, sectionsList) {
        this.sectionsList = sectionsList;
		for(let key = datasets.length - 1; key >= 0; key--) {
			if(this.methodGroupId == datasets[key].methodGroupId) {
                console.log("RadioMetricDating claiming ", datasets[key].datasetId);
				let dataset = datasets.splice(key, 1)[0];
				this.datasets.push(dataset);
            }
		}

		return new Promise((resolve, reject) => {
			
			if(!this.methodMetaDataFetchingComplete) {
				console.warn("Meta data fetching not complete!");
			}



			this.fetch(this.datasets).then(() => {
				this.dsGroups = this.groupDatasetsBySample(this.datasets);

				let fetchPromises = [];
				this.dsGroups.forEach((dsg) => {
					fetchPromises.push(this.fetchSampleData(dsg));
				});

				Promise.all(fetchPromises).then(() => {
					this.buildSection(this.dsGroups);
					resolve();
				});

			});

        });
        
	}

	async fetch(datasets) {
		for(let key in datasets) {
			await this.fetchAnalysisEntities(datasets[key]);
			await this.fetchGeochronologyData(datasets[key]);
			await this.fetchDataset(this.datasets[key]);
		}
	}

	async fetchAnalysisEntities(dataset) {
		await $.ajax(this.sqs.config.siteReportServerAddress+"/analysis_entities?dataset_id=eq."+dataset.datasetId, {
			method: "get",
			dataType: "json",
			success: (analysisEntities, textStatus, xhr) => {
				dataset.analysisEntities = analysisEntities;
				/*
				for(let key in analysisEntities) {
					await this.fetchDendroData(dataset, analysisEntities[key].analysis_entity_id);
				}
				*/
				return analysisEntities;
			}
		});
	}


	async fetchGeochronologyData(dataset) {

		let promises = [];

		dataset.analysisEntities.forEach((ae) => {
			//Fetch all info from geochronology table/view based on AE
			let p = $.ajax(this.sqs.config.siteReportServerAddress+"/geochronology?analysis_entity_id=eq."+ae.analysis_entity_id, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					dataset.geochronology = data;
				}
			});

			promises.push(p);
		});
		
		await Promise.all(promises);
	}

	async fetchDendroDating(datasetGroup) {
		await $.ajax(this.sqs.config.siteReportServerAddress+"/qse_dendro_dating?physical_sample_id=eq."+datasetGroup.physical_sample_id, {
			method: "get",
			dataType: "json",
			success: async (data, textStatus, xhr) => {
				datasetGroup.dating = data;
			}
		});
	}

	/* Function: fetchSampleData
	*/
	async fetchSampleData(datasetGroup) {
		await $.ajax(this.sqs.config.siteReportServerAddress+"/physical_samples?physical_sample_id=eq."+datasetGroup.physical_sample_id, {
			method: "get",
			dataType: "json",
			success: async (sampleData, textStatus, xhr) => {
				datasetGroup.sample = sampleData[0];
			}
		});
	}

	/* Function: groupDatasetsBySample
	*
	* Putting all datasets belonging to the same sample in the same group to make it easier to handle.
	* 
	* Parameters:
	* datasets
	*
	* Returns:
	* datasetGroups
	*/
	groupDatasetsBySample(datasets) {
		
		let datasetGroups = [];
		datasets.map((ds) => {
			let foundGroup = false;
			for(let key in datasetGroups) {
				if(datasetGroups[key].physical_sample_id == ds.physical_sample_id) {
					datasetGroups[key].datasets.push(ds);
					foundGroup = true;
				}
			}

			if(foundGroup == false) {
				datasetGroups.push({
					physical_sample_id: ds.physical_sample_id,
					datasets: [ds]
				});
			}
		});
		
		return datasetGroups;
	}

	/*
	* Function: fetchDataset
	*
	* Parameters:
	* datasetId
	 */
	async fetchDataset(dataset) {
		let p = await new Promise((resolve, reject) => {
			let promises = [];

			//Fetch physical_sample_id's
			promises.push(new Promise((resolve, reject) => {
				$.ajax(this.sqs.config.siteReportServerAddress+"/qse_dataset?dataset_id=eq."+dataset.datasetId, {
					method: "get",
					dataType: "json",
					success: async (datasetInfo, textStatus, xhr) => {
                        if(datasetInfo.length > 1) {
                            console.warn("Dataset query returned multiple instances of information");
                        }
						dataset.physical_sample_id = datasetInfo[0].physical_sample_id;
						resolve();
					}
				});
			}));

			/*
			if(typeof this.analysis.dendroDataTypes == "undefined") {
				promises.push(new Promise((resolve, reject) => {
					$.ajax(this.sqs.config.siteReportServerAddress+"/dendro_lookup", {
						method: "get",
						dataType: "json",
						success: async (dendroDataTypes, textStatus, xhr) => {
							this.analysis.dendroDataTypes = dendroDataTypes;
							//dataset.dendroDataTypes = dendroDataTypes; //Maybe this shouldn't be dataset-specific
							resolve();
						}
					});
				}));
			}
			*/
			
			promises.push(new Promise((resolve, reject) => {
				$.ajax(this.sqs.config.siteReportServerAddress+"/analysis_entities?dataset_id=eq."+dataset.datasetId, {
					method: "get",
					dataType: "json",
					success: async (analysisEntities, textStatus, xhr) => {
						dataset.analysisEntities = analysisEntities;

						for(let key in analysisEntities) {
							await this.fetchDendroData(dataset, analysisEntities[key].analysis_entity_id);
						}
						resolve();
					}
				});
			}));

			Promise.all(promises).then(() => {
				resolve();
			});
		});

		return p;
	}

	/* Function: fetchDendroData
	*/
	async fetchDendroData(dataset, analysisEntityId) {
		await $.ajax(this.sqs.config.siteReportServerAddress+"/dendro?analysis_entity_id=eq."+analysisEntityId, {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				dataset.dendro = data;
				return data;
			}
		});
	}


	/*
	* Function: getDendroValueType
	*
	* Resolves the dendro mapping from "dendro_lookup_id" to value/variable type. Think of the "lookup_id" as the "variable type id" and it will make more sense.
	* 
	*/
	getDendroValueType(lookupId) {
		if(typeof this.analysis.dendroDataTypes == "undefined") {
			console.error("Tried to access dendro data types but it was undefined");
			return false;
		}
		for(let key in this.analysis.dendroDataTypes) {
			if(this.analysis.dendroDataTypes[key].dendro_lookup_id == lookupId) {
				return this.analysis.dendroDataTypes[key];
			}
		}
		return false;
	}
    
    /* Function: buildContentItem
	*/
	buildContentItem(datasetGroup) {
		//Defining columns
		var columns = [
			{
				"dataType": "number",
				"pkey": true,
				"title": "Analysis entitiy id",
				"hidden": true
			},/*
			{
				"dataType": "string",
				"pkey": false,
				"title": "Data type name"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Dataset name"
			},*/
			{
				"dataType": "string",
				"pkey": false,
				"title": "Method"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Lab number"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Measurement value"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Notes"
			}
		];

		//Filling up the rows - all dataset's data goes in the same table
		var rows = [];
		for(let dk in datasetGroup.datasets) {
			let dataset = datasetGroup.datasets[dk];

			for(let key in dataset.geochronology) {
				let valueMeasurement = dataset.geochronology[key].age;

				if(dataset.geochronology[key].error_older != dataset.geochronology[key].error_younger) {
					valueMeasurement += " +"+dataset.geochronology[key].error_older+" / -"+dataset.geochronology[key].error_younger;
				}
				else {
					valueMeasurement += " +/-"+dataset.geochronology[key].error_older;
				}

				let datingUncertainty = null;
				if(dataset.geochronology[key].dating_uncertainty_id != null) {
					datingUncertainty = this.getDatingUncertaintyById(dataset.geochronology[key].dating_uncertainty_id);
					valueMeasurement = datingUncertainty.uncertainty+" "+valueMeasurement;
				}

				let method = this.analysis.getMethodMetaDataById(dataset.methodId);

				var row = [
					{
						"type": "cell",
						"tooltip": "",
						"value": dataset.geochronology[key].analysis_entity_id
					},
					{
						"type": "cell",
						"tooltip": method.description,
						"value": method.name
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": dataset.geochronology[key].lab_number
					},
					{
						"type": "cell",
						"tooltip": "", //datingUncertainty != null ? datingUncertainty.description : ""
						"value": valueMeasurement
					},
					{
						"type": "cell",
						"value": dataset.geochronology[key].notes != null ? dataset.geochronology[key].notes : "None"
					}
				];

				rows.push(row);
			}
		}
		
		//datasetGroup.sample.sample_name
		let ci = {
			"name": datasetGroup.physical_sample_id,
			"title": "Sample "+datasetGroup.sample.sample_name,
			"datasetId": datasetGroup.physical_sample_id,
			"data": {
				"columns": columns,
				"rows": rows
			},
			"renderOptions": [
				{
					"name": "Spreadsheet",
					"selected": true,
					"type": "table",
					"options": [
					]
				}
			]
		};
		
		return ci;
	}

	/* Function: buildSection
	*/
	buildSection(dsGroups) {
		if(dsGroups.length == 0) {
			console.warn("Tried to build a section with 0 DatasetGroups");
			return;
		}
		console.log("buildSection", dsGroups);

		let methodGroup = this.analysis.getMethodGroupMetaDataById(this.methodGroupId);

		//let method = this.analysis.getMethodMetaDataById(dsGroups[0].methodId);
		let sectionName = "method-group-"+methodGroup.methodGroupId;
		var sectionKey = this.sqs.findObjectPropInArray(this.section.sections, "name", sectionName);
		if(sectionKey === false) {
			var sectionsLength = this.section.sections.push({
				"name": sectionName,
				"title": methodGroup.name,
				"methodDescription": methodGroup.description,
				"collapsed": true,
				"contentItems": []
			});
			sectionKey = sectionsLength - 1;
		}

		dsGroups.map((dsg) => {
			let ci = this.buildContentItem(dsg);
			this.section.sections[sectionKey].contentItems.push(ci);
		});
		
		this.buildIsComplete = true;
		this.sqs.sqsEventDispatch("siteAnalysisBuildComplete"); //Don't think this event is relevant anymore...
	}
	
	/* Function: destroy
	*/
	destroy() {
	}

	/* Function: isBuildComplete
	*/
	isBuildComplete() {
		return this.buildIsComplete;
	}
}

export default RadioMetricDatingDataset;