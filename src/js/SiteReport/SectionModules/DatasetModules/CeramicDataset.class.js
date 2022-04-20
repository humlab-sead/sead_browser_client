import DatasetModule from "./DatasetModule.class";
/*
* Class: CeramicDataset
*
* This class is mostly just copy-and-pasted over from DendrochronologyDataset
*
*/

class CeramicDataset extends DatasetModule {
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
		this.methodIds = [171, 172];

		this.metaDataFetchingPromises = [];
		this.methodIds.map((methodId) => {
			this.metaDataFetchingPromises.push(this.analysis.fetchMethodMetaData(methodId));
		});
	}
	
	offerAnalyses(datasets) {
		for(let key = datasets.length - 1; key >= 0; key--) {
			if(this.methodIds.includes(datasets[key].methodId)) {
				let dataset = datasets.splice(key, 1)[0];
				this.datasets.push(dataset);
			}
		}

		return new Promise((resolve, reject) => {
			for(let key in this.datasets) {
				this.datasetFetchPromises.push(this.analysis.fetchAnalysis(this.datasets[key]));
				this.datasetFetchPromises.push(this.fetchDataset(this.datasets[key]));
			}
			
			let promises = this.datasetFetchPromises.concat(this.metaDataFetchingPromises);
			Promise.all(promises).then(() => {

				this.dsGroups = this.groupDatasetsBySample(this.datasets);

				let fetchSampleDataPromises = [];
				this.dsGroups.map((dsg) => {
					fetchSampleDataPromises.push(this.fetchSampleData(dsg));
				});

				Promise.all(fetchSampleDataPromises).then(() => {
					if(this.datasets.length > 0) {
						this.buildSection(this.dsGroups);
					}
					resolve();
				});

				
			});
		});
	}

	async fetchSampleData(datasetGroup) {
		await $.ajax(this.sqs.config.siteReportServerAddress+"/physical_samples?physical_sample_id=eq."+datasetGroup.physical_sample_id, {
			method: "get",
			dataType: "json",
			success: async (sampleData, textStatus, xhr) => {
				datasetGroup.sample = sampleData[0];
				//resolve();
			}
		});
	}

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

			promises.push(new Promise((resolve, reject) => {
				$.ajax(this.sqs.config.siteReportServerAddress+"/qse_dataset?dataset_id=eq."+dataset.datasetId, {
					method: "get",
					dataType: "json",
					success: async (datasetInfo, textStatus, xhr) => {
						dataset.physical_sample_id = datasetInfo[0].physical_sample_id;

						resolve();
					}
				});
			}));

			if(typeof this.analysis.ceramicsDataTypes == "undefined") {
				promises.push(new Promise((resolve, reject) => {
					$.ajax(this.sqs.config.siteReportServerAddress+"/ceramics_lookup", {
						method: "get",
						dataType: "json",
						success: async (ceramicsDataTypes, textStatus, xhr) => {
							this.analysis.ceramicsDataTypes = ceramicsDataTypes;
							//dataset.ceramicsDataTypes = ceramicsDataTypes; //Maybe this shouldn't be dataset-specific
							resolve();
						}
					});
				}));
			}
			
			promises.push(new Promise((resolve, reject) => {
				$.ajax(this.sqs.config.siteReportServerAddress+"/analysis_entities?dataset_id=eq."+dataset.datasetId, {
					method: "get",
					dataType: "json",
					success: async (analysisEntities, textStatus, xhr) => {
						dataset.analysisEntities = analysisEntities;

						for(let key in analysisEntities) {
							await this.fetchCeramicsData(dataset, analysisEntities[key].analysis_entity_id);
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


	async fetchCeramicsData(dataset, analysisEntityId) {
		await $.ajax(this.sqs.config.siteReportServerAddress+"/ceramics?analysis_entity_id=eq."+analysisEntityId, {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				dataset.ceramics = data;
				return data;
			}
		});
	}


	/*
	* Function: getCeramicsValueType
	*
	* Resolves the ceramics mapping from "ceramics_lookup_id" to value/variable type. Think of the "lookup_id" as the "variable type id" and it will make more sense.
	* 
	*/
	getCeramicsValueType(lookupId) {
		if(typeof this.analysis.ceramicsDataTypes == "undefined") {
			console.error("Tried to access ceramics data types but it was undefined");
			return false;
		}
		for(let key in this.analysis.ceramicsDataTypes) {
			if(this.analysis.ceramicsDataTypes[key].ceramics_lookup_id == lookupId) {
				return this.analysis.ceramicsDataTypes[key];
			}
		}
		return false;
	}

	makeSection(siteData, sections) {
		//console.log(siteData, sections);
	}

	buildSection(dsGroups) {
		let analysis = dsGroups[0].datasets[0];
		var sectionKey = this.sqs.findObjectPropInArray(this.section.sections, "name", analysis.methodId);
		
		if(sectionKey === false) {
			let method = this.analysis.getMethodMetaDataById(analysis.methodId);
			var sectionsLength = this.section.sections.push({
				"name": analysis.methodId,
				"title": analysis.methodName,
				"methodDescription": method == null ? "" : method.description,
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
				"title": "Value type"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Measurement value"
			}
		];

		//Filling up the rows - all dataset's data goes in the same table for ceramics
		var rows = [];
		for(let dk in datasetGroup.datasets) {
			
			let dataset = datasetGroup.datasets[dk];

			for(let key in dataset.ceramics) {
				let valueType = this.getCeramicsValueType(dataset.ceramics[key].ceramics_lookup_id);
				
				let valueTypeName = dataset.ceramics[key].ceramics_lookup_id;
				let valueTypeDescription = "Unknown ceramicschronological data type";
				
				if(valueType !== false) {
					valueTypeName = valueType.name;
					valueTypeDescription = valueType.description;
				}
				let valueMeasurement = dataset.ceramics[key].measurement_value;

				var row = [
					{
						"type": "cell",
						"tooltip": "",
						"value": dataset.ceramics[key].analysis_entity_id
					},
					{
						"type": "cell",
						"tooltip": valueTypeDescription,
						"value": valueTypeName
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": valueMeasurement
					}
				];

				rows.push(row);
			}
		}

		datasetGroup.sample.sample_name
		let ci = {
			"name": datasetGroup.physical_sample_id, //Normally: analysis.datasetId
			"title": "Sample "+datasetGroup.sample.sample_name, //Normally this would be: analysis.datasetName
			"datasetId": datasetGroup.physical_sample_id, //Normally: analysis.datasetId
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
						{
							"name": "columnsVisibility",
							"hiddenColumns": [
								3
							],
							"showControls": false
						}
					]
				}
			]
		};
		
		return ci;
	}
	
	destroy() {
	}

	isBuildComplete() {
		return this.buildIsComplete;
	}
}

export { CeramicDataset as default }