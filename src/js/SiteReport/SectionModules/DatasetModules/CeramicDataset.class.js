/*
* Class: CeramicDataset
*
*/

class CeramicDataset {
	constructor(analysis) {
		this.hqs = analysis.hqs;
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
			//console.log("dataset", datasets[key]);
			if(this.methodIds.includes(datasets[key].methodId)) {
				//console.log("CeramicDataset claiming ", datasets[key].datasetId);
				let dataset = datasets.splice(key, 1)[0];
				this.datasets.push(dataset);
			}
		}

		return new Promise((resolve, reject) => {
			//First order of business: Get the physical_sample_id's based on the pile of dataset id's we've got
			
			//Then: Group the datasets so that for each sample we have a number of datasets (and one dataset can't belong to several samples - I guess?)

			//Then render it so that each sample has it's own "contentItem" containing all of its datasets
			//No wait - belay that - render the samples one on each row in the same table and then have a subtable for each bunch of datasets
			
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
		await $.ajax(this.hqs.config.siteReportServerAddress+"/physical_samples?physical_sample_id=eq."+datasetGroup.physical_sample_id, {
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
				$.ajax(this.hqs.config.siteReportServerAddress+"/qse_dataset?dataset_id=eq."+dataset.datasetId, {
					method: "get",
					dataType: "json",
					success: async (datasetInfo, textStatus, xhr) => {
						dataset.physical_sample_id = datasetInfo[0].physical_sample_id;

						resolve();
					}
				});
			}));

			if(typeof this.analysis.dendroDataTypes == "undefined") {
				promises.push(new Promise((resolve, reject) => {
					$.ajax(this.hqs.config.siteReportServerAddress+"/dendro_lookup", {
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
			
			promises.push(new Promise((resolve, reject) => {
				$.ajax(this.hqs.config.siteReportServerAddress+"/analysis_entities?dataset_id=eq."+dataset.datasetId, {
					method: "get",
					dataType: "json",
					success: async (analysisEntities, textStatus, xhr) => {
						dataset.analysisEntities = analysisEntities;

						/*
						let samplesSet = new Set();
						for(let key in analysisEntities) {
							console.log(dataset.datasetId, analysisEntities[key])
							samplesSet.add(analysisEntities[key].physical_sample_id);
						}

						dataset.samples = Array.from(samplesSet);
						console.log(dataset);
						*/

						for(let key in analysisEntities) {
							await this.fetchDendroData(dataset, analysisEntities[key].analysis_entity_id);
						}
						resolve();
					}
				});
			}));

			/*
			for(let key in dataset.sampleGroups) {
				let sampleGroup = dataset.sampleGroups[key];
				promises.push(new Promise((resolve, reject) => {
					$.ajax(this.hqs.config.siteReportServerAddress+"/qse_sample?sample_group_id=eq."+sampleGroup.sampleGroupId, {
						method: "get",
						dataType: "json",
						success: async (samples, textStatus, xhr) => {
							for(let key in dataset.sampleGroups) {
								for(let k in samples) {
									if(dataset.sampleGroups[key].sampleGroupId == samples[k].sample_group_id) {
										dataset.sampleGroups[key].samples.push(samples[k]);
									}
								}
							}
							resolve();
						}
					});
				}));
			}
			*/

			Promise.all(promises).then(() => {
				resolve();
			});
		});

		return p;
	}


	async fetchDendroData(dataset, analysisEntityId) {
		await $.ajax(this.hqs.config.siteReportServerAddress+"/dendro?analysis_entity_id=eq."+analysisEntityId, {
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

		/*
		var analysisKey = this.hqs.findObjectPropInArray(this.data.analyses, "datasetId", this.analysisData.datasetId);
		let dataTypes = this.analysis.data.analyses[analysisKey].dendroDataTypes;
		for(let key in dataTypes) {
			if(dataTypes[key].dendro_lookup_id == lookupId) {
				return dataTypes[key];
			}
		}
		return false
		*/
	}

	buildSection(dsGroups) {
		console.log(dsGroups);

		//let dsGroups = this.groupDatasetsBySample(datasets);
		
		//let analysis = datasets[0];
		let analysis = dsGroups[0].datasets[0];
		var sectionKey = this.hqs.findObjectPropInArray(this.section.sections, "name", analysis.methodId);
		
		if(sectionKey === false) {
			let method = this.analysis.getMethodMetaById(analysis.methodId);
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
			console.log(ci);
			this.section.sections[sectionKey].contentItems.push(ci);
		});
		
		this.buildIsComplete = true;
		this.hqs.hqsEventDispatch("siteAnalysisBuildComplete"); //Don't think this event is relevant anymore...
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

		//Filling up the rows - all dataset's data goes in the same table for dendro
		var rows = [];
		for(let dk in datasetGroup.datasets) {
			
			let dataset = datasetGroup.datasets[dk];

			for(let key in dataset.dendro) {
				let valueType = this.getDendroValueType(dataset.dendro[key].dendro_lookup_id);
				
				let valueTypeName = dataset.dendro[key].dendro_lookup_id;
				let valueTypeDescription = "Unknown dendrochronological data type";
				
				if(valueType !== false) {
					valueTypeName = valueType.name;
					valueTypeDescription = valueType.description;
				}
				let valueMeasurement = dataset.dendro[key].measurement_value;

				var row = [
					{
						"type": "cell",
						"tooltip": "",
						"value": dataset.dendro[key].analysis_entity_id
					},/*
					{
						"type": "cell",
						"tooltip":dataset.dataTypeDefinition,
						"value": dataset.dataTypeName
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": dataset.datasetName
					},*/
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

		console.log(datasetGroup)
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