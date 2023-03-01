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

		console.log("CeramicDataset");
	}
	
	offerAnalyses(datasets) {
		console.log("offerAnalyses", datasets);
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

	async makeSection(siteData, sections) {
		let methodDatasets = this.claimDatasets(siteData);

		//These datasets needs to be grouped by physical_sample_id in order to make sense
		let uniquePhysicalSampleIds = new Set();

		methodDatasets.forEach(ds => {
			ds.analysis_entities.forEach(ae => {
				uniquePhysicalSampleIds.add(ae.physical_sample_id);
			});
		});

		let sampleDatasets = [];
		uniquePhysicalSampleIds.forEach(physicalSampleId => {
			let sampleDatasetObject = {
				physicalSampleId: physicalSampleId,
				datasets: []
			};
			
			methodDatasets.forEach(ds => {
				ds.analysis_entities.forEach(ae => {
					if(ae.physical_sample_id == sampleDatasetObject.physicalSampleId) {
						sampleDatasetObject.datasets.push(...ae.ceramic_values)
					}
				});
			});

			sampleDatasets.push(sampleDatasetObject);
		});

		console.log(sampleDatasets);

		//var sectionKey = this.sqs.findObjectPropInArray(this.section.sections, "name", analysis.methodId);

		if(sampleDatasets.length > 0) {
			let datasetSections = this.buildSections();

			let ci = this.buildContentItem(sampleDatasets);
			datasetSections[0].contentItems.push(ci);
		}
	}

	buildSections() {
		let siteData = this.sqs.siteReportManager.siteReport.siteData;
		
		let builtSections = [];

		this.methodIds.forEach(methodId => {
			siteData.lookup_tables.analysis_methods.forEach(method => {
				if(method.method_id == methodId) {
					let sectionKey = this.sqs.findObjectPropInArray(this.section.sections, "name", method.method_id);
					if(sectionKey === false) {
						var sectionsLength = this.section.sections.push({
							"name": methodId,
							"title": method.method_name,
							"methodId": method.method_id,
							"methodDescription": method == null ? "" : method.description,
							"collapsed": false,
							"contentItems": []
						});
						sectionKey = sectionsLength - 1;
						builtSections.push(this.section.sections[sectionKey]);
					}
				}
			})
		});

		return builtSections;
	}

	buildContentItem(datasetGroups) {
		let siteData = this.sqs.siteReportManager.siteReport.siteData;

		let columns = [
			{
				"dataType": "subtable",
				"pkey": false
			},
			{
				"dataType": "number",
				"pkey": true,
				"title": "Dataset group",
				"hidden": true
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Sample name"
			},
		];

		let rows = [];
		
		datasetGroups.forEach(dsg => {
			//Defining columns
			var subTableColumns = [
				{
					"dataType": "number",
					"pkey": true,
					"title": "Analysis entitiy id",
					"hidden": true
				},
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
			var subTableRows = [];
			dsg.datasets.forEach(ds => {
				let dataset = ds;

				var subTableRow = [
					{
						"type": "cell",
						"tooltip": "",
						"value": dataset.analysis_entity_id
					},
					{
						"type": "cell",
						"tooltip": dataset.description,
						"value": dataset.name
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": dataset.measurement_value
					}
				];

				subTableRows.push(subTableRow);
			});

			let subTable = {
				"columns": subTableColumns,
				"rows": subTableRows
			};

			let physicalSample = null;
			siteData.sample_groups.forEach(sg => {
				sg.physical_samples.forEach(ps => {
					if(ps.physical_sample_id == dsg.physicalSampleId) {
						physicalSample = ps;
					}
				});
			});

			let row = [
				{
					"type": "subtable",
					"value": subTable
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": "Dataset group"
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": physicalSample.sample_name
				}
			];

			rows.push(row);
	
		});

		

		let ci = {
			"name": "Ceramics", //Normally: analysis.datasetId
			"title": "Ceramics", //Normally this would be: analysis.datasetName
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