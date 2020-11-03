import DatasetModule from "./DatasetModule.class";
import moment from "moment";


/*
* Class: DendrochronologyDataset
*
* Dendrochronological datasets are a bit special in the way that each dataset has their own method, these can be seen as sub-methods to the 'real' methods in the db method table.
* 
*/

class DendrochronologyDataset extends DatasetModule {
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

		this.methodId = 10;
		this.metaDataFetchingPromises = [];
		this.metaDataFetchingPromises.push(this.analysis.fetchMethodMetaData(this.methodId));

		Promise.all(this.metaDataFetchingPromises).then(() => {
			this.methodMetaDataFetchingComplete = true;
		});
	}
	
	/* Function: offerAnalyses
	*/
	offerAnalyses(datasets, sectionsList) {
		this.sectionsList = sectionsList;
		for(let key = datasets.length - 1; key >= 0; key--) {
			if(this.methodId == datasets[key].methodId) {
				//console.log("Dendrochronology claiming ", datasets[key].datasetId);
				let dataset = datasets.splice(key, 1)[0];
				this.datasets.push(dataset);
			}
		}

		return new Promise((resolve, reject) => {
			//First order of business: Get the physical_sample_id's based on the pile of dataset id's we've got
			//Then: Group the datasets so that for each sample we have a number of datasets (and one dataset can't belong to several samples - I guess?)

			//Then render it so that each sample has it's own "contentItem" containing all of its datasets
			//No wait - belay that - render the samples one on each row in the same table and then have a subtable for each bunch of datasets

			//console.log(this.datasets);
			
			for(let key in this.datasets) {
				this.datasetFetchPromises.push(this.analysis.fetchAnalysis(this.datasets[key]));
				this.datasetFetchPromises.push(this.fetchDataset(this.datasets[key]));
			}
			
			Promise.all(this.datasetFetchPromises).then(() => {

				this.dsGroups = this.groupDatasetsBySample(this.datasets);

				let fetchPromises = [];
				this.dsGroups.forEach((dsg) => {
					fetchPromises.push(this.fetchSampleData(dsg));
					fetchPromises.push(this.fetchDendroDating(dsg));
				});

				Promise.all(fetchPromises).then(() => {
					if(this.datasets.length > 0) {
						this.buildSection(this.dsGroups);
					}
					resolve();
				});

				
			});
		});
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
			
			promises.push(new Promise((resolve, reject) => {
				$.ajax(this.sqs.config.siteReportServerAddress+"/analysis_entities?dataset_id=eq."+dataset.datasetId, {
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
					$.ajax(this.sqs.config.siteReportServerAddress+"/qse_sample?sample_group_id=eq."+sampleGroup.sampleGroupId, {
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

		/*
		var analysisKey = this.sqs.findObjectPropInArray(this.data.analyses, "datasetId", this.analysisData.datasetId);
		let dataTypes = this.analysis.data.analyses[analysisKey].dendroDataTypes;
		for(let key in dataTypes) {
			if(dataTypes[key].dendro_lookup_id == lookupId) {
				return dataTypes[key];
			}
		}
		return false
		*/
	}

	buildContentItem(dsGroups) {
		console.log(dsGroups);
		//Defining columns
		var columns = [
			{
				"dataType": "subtable",
				"pkey": false
			},
			{
				"dataType": "number",
				"pkey": true,
				"title": "Physical sample id",
				"hidden": true
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Sample name"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Sample taken"
			}
		];

		let rows = [];
		dsGroups.map((dsg) => {

			let subTableColumns = [
				{
					"title": "Measurement type"
				},
				{
					"title": "Measurement value"
				}
			];

			let subTableRows = [];
			//console.log(dsg);
			dsg.datasets.map((ds) => {
				//console.log(ds.dendro);
				ds.dendro.map((dendro) => {
					let measurementType = this.getDendroValueType(dendro.dendro_lookup_id).name;
					let measurementValue = dendro.measurement_value;

					subTableRows.push([
						{
							"type": "cell",
							"tooltip": "",
							"value": measurementType
						},
						{
							"type": "cell",
							"tooltip": "",
							"value": measurementValue
						}
					]);


				});

				
			});

			let subTable = {
				"columns": subTableColumns,
				"rows": subTableRows
			};

			let row = [
				{
					"type": "subtable",
					"value": subTable
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": dsg.physical_sample_id
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": dsg.sample.sample_name
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": moment(dsg.sample.date_sampled).format('MMMM YYYY')
				}
			];
			rows.push(row);
		});


		let contentItem = {
			"name": 111, //Normally: analysis.datasetId
			"title": "Sample analyses", //Normally this would be: analysis.datasetName
			//"datasetId": 1112, //Normally: analysis.datasetId
			"data": {
				"columns": columns,
				"rows": rows
			},
			"renderOptions": [
				{
					"name": "Spreadsheet",
					"selected": true,
					"type": "table",
					"options": []
				}
			]
		};
		
		return contentItem;
	}

	/* Function: buildSection
	*/
	buildSection(dsGroups) {
		console.log(dsGroups);

		//let dsGroups = this.groupDatasetsBySample(datasets);
		
		//let analysis = datasets[0];
		let analysis = dsGroups[0].datasets[0];
		var sectionKey = this.sqs.findObjectPropInArray(this.section.sections, "name", analysis.methodId);
		
		let method = this.analysis.getMethodMetaDataById(analysis.methodId);
		
		if(sectionKey === false) {
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
			let ci = this.buildContentItemOLD(dsg);
			this.section.sections[sectionKey].contentItems.push(ci);
		});
		
		this.buildIsComplete = true;
		this.sqs.sqsEventDispatch("siteAnalysisBuildComplete"); //Don't think this event is relevant anymore...
	}

	/* Function: buildContentItem
	*/
	buildContentItemOLD(datasetGroup) {
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

		for(let dk in datasetGroup.dating) {

			let value = "";
			let dateUncertainty = "";
			let dateUncertaintyTooltip = "";
			if(datasetGroup.dating[dk].plus != null || datasetGroup.dating[dk].minus != null) {

				let dateUncertaintyType = "";
				if(datasetGroup.dating[dk].error_uncertainty != null) {
					dateUncertaintyType = datasetGroup.dating[dk].error_uncertainty;
				}

				if(datasetGroup.dating[dk].plus == datasetGroup.dating[dk].minus) {
					dateUncertainty = dateUncertaintyType+" +/- "+datasetGroup.dating[dk].plus+" years";
				}
				else {
					if(datasetGroup.dating[dk].plus != null && datasetGroup.dating[dk].minus != null) {
						dateUncertainty = dateUncertaintyType+" +"+datasetGroup.dating[dk].plus+" / -"+datasetGroup.dating[dk].minus+" years";
					}
					else if(datasetGroup.dating[dk].plus != null && datasetGroup.dating[dk].minus == null) {
						dateUncertainty = dateUncertaintyType+" +"+datasetGroup.dating[dk].plus+" years";
						dateUncertaintyTooltip = "No lower error margin for date specified.";
					}
					else if(datasetGroup.dating[dk].plus == null && datasetGroup.dating[dk].minus != null) {
						dateUncertainty = dateUncertaintyType+" +"-datasetGroup.dating[dk].minus+" years";
						dateUncertaintyTooltip = "No upper error margin for date specified.";
					}
				}
				
			}
			if(datasetGroup.dating[dk].older != null) {
				value = datasetGroup.dating[dk].younger + "–" + datasetGroup.dating[dk].older + " " + datasetGroup.dating[dk].age_type;
			}
			else {
				value = datasetGroup.dating[dk].younger+" "+datasetGroup.dating[dk].age_type;
			}

			let season = datasetGroup.dating[dk].season == null ? "" : datasetGroup.dating[dk].season+" ";

			var row = [
				{
					"type": "cell",
					"tooltip": "",
					"value": datasetGroup.dating[dk].analysis_entity_id
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": datasetGroup.dating[dk].date_type
				},
				{
					"type": "cell",
					"tooltip": dateUncertaintyTooltip,
					"value": season + value+" "+dateUncertainty
				}
			];

			rows.push(row);
		}
		
		//datasetGroup.sample.sample_name
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
						},
						{
							"name": "showNumRows",
							"value": 15
						}
					]
				}
			]
		};
		
		return ci;
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

//module.exports = DendrochronologyDataset;

//export { DendrochronologyDataset as default }
export default DendrochronologyDataset;