import DatasetModule from "./DatasetModule.class";
import { ApiWsChannel } from "../../../ApiWsChannel.class";
import DendroLib from "../../../Common/DendroLib.class";
import moment from "moment";
import { nanoid } from 'nanoid'
import * as d3 from 'd3';
import config from '../../../../config/config.json';
import StandardAge from "../../../Common/StandardAge.class";

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
		this.dl = new DendroLib();
		this.analysis = analysis;
		this.section = analysis.section;
		this.data = analysis.data;
		this.taxonPromises = [];
		this.datasetFetchPromises = [];
		this.datasets = [];
		this.buildIsComplete = false;
		this.methodMetaDataFetchingComplete = false;
		this.extentMin = null;
		this.extentMax = null

		this.methodIds = [10];
		this.metaDataFetchingPromises = [];

		Promise.all(this.metaDataFetchingPromises).then(() => {
			this.methodMetaDataFetchingComplete = true;
		});
		
	}

	getDatingSummary() {
		let summary = [];

		if(this.extentMin == null || this.extentMax == null) {
			return summary;
		}

		//extentMin and extentMax is in years, we need to convert them to BP (before present)
		let extentMinBP = config.constants.BP - this.extentMin;
		let extentMaxBP = config.constants.BP - this.extentMax;

		let stdAge = new StandardAge();
		stdAge.ageType = "Dendrochronological";
		stdAge.ageLocation = "";
		stdAge.ageOlder = extentMinBP;
		stdAge.ageYounger = extentMaxBP;
		stdAge.sample = null;

		summary.push(stdAge);

		return summary;
	}
	

	async getDataBySampleId(physicalSampleId, wsChannel = null) {
		let chan = null;
		let chanCreated = false;
		if(wsChannel == null) {
			let chan = new ApiWsChannel();
			await chan.connect();
			chanCreated = true;
		}
		else {
			chan = wsChannel;
		}

		chan.bindListen((msg) => {
			let data = JSON.parse(msg.data);
			let sample = data.result.sample;
			if(sample.physicalSampleId == physicalSampleId) {
				//This concludes this communication
			}
			console.log(sample);
		})

		chan.send({
			cmd: "getDataForSample",
			physicalSampleId: physicalSampleId
		});

		if(chanCreated) {
			chan.close();
		}
		return {};
	}

	async getAnalysisEntitiesForSamples(samples = []) {
		let chan = new ApiWsChannel();
		await chan.connect();
		chan.listen = (msg) => {
			console.log("received: ", msg);
		};

		let sampleIds = [];
		samples.forEach((sample) => {
			sampleIds.push(sample.physicalSampleId);
		})

		chan.send({
			cmd: "getAnalysisEntitiesForSamples",
			sampleIds: sampleIds
		})

		/*
		samples.forEach((sample) => {
			chan.send({
				cmd: "getAnalysisEntitiesForSampleId",
				sampleId: sample.physicalSampleId
			})
		});
		*/
		
		
		
		return [];
	}

	getDendroData(analysisEntityId) {
		return {};
	}

	/*
	getDendroValues(analysisEntityId) {
		this.getApiWsChannel().then((ws) => {
			let msgId = nanoid();
			ws.onmessage = (evt) => {
				let msg = JSON.parse(evt.data);
				if(msg.msgId == msgId) { //Check that this is for us
					console.log(msg.data);
				}
			};
			ws.send(JSON.stringify({
				msgId: msgId,
				sql: 'SELECT * FROM tbl_dendro_lookup'
			}));
		});
	}
	*/

	/*
	getApiWsChannel() {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket("ws://localhost:3500", "sql");
			this.wsConnectInterval = setInterval(() => {
				if(ws.readyState == 1) {
					clearInterval(this.wsConnectInterval);
					
					resolve(ws);
				}
			}, 100);
		});
	}
	*/

	async fetchDendroDating(datasetGroup) {
		await $.ajax(this.sqs.config.siteReportServerAddress+"/qse_dendro_dating?physical_sample_id=eq."+datasetGroup.physical_sample_id, {
			method: "get",
			dataType: "json",
			success: async (data, textStatus, xhr) => {
				/*
				console.log(datasetGroup)
				console.log(data);

				//datasetGroup.datasets.dendro = data;

				for(let key in data) {
					datasetGroup.datasets.push({
						dendro: [{
							measurement_type: data[key].date_type,
							measurement_value: data[key].older+" - "+data[key].younger,
							measurement_values: {
								age_type: data[key].age_type,
								younger: data[key].younger,
								older: data[key].older,
								plus: data[key].plus,
								minus: data[key].minus,
								error_uncertainty: data[key].error_uncertainty,
								season: data[key].season,
							}
						}]
					});
				}
				*/
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
				for(let key in dataset.dendro) {
					 let measurementType = this.getDendroValueType(dataset.dendro[key].dendro_lookup_id);
					 dataset.dendro[key].measurement_type = {
						dendro_lookup_id: measurementType.dendro_lookup_id,
						name: measurementType.name,
						description: measurementType.description
					 }
				}
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

	getTableRowsAsObjects(contentItem) {
		let dataObjects = [];
		for(let rowKey in contentItem.data.rows) {
			let row = contentItem.data.rows[rowKey];
	
			let dataObject = {
				sampleName: row[2].value,
				sampleTaken: row[3].value,
				datasets: []
			};
	
			row.forEach(cell => {
				if(cell.type == "subtable") {
	
					let subTable = cell.value;
					
					subTable.rows.forEach(subTableRow => {
						let dataset = {
							id: null,
							label: null,
							value: null,
							data: null,
						};
						subTableRow.forEach(subTableCell => {
							if(subTableCell.role == "id") {
								dataset.id = subTableCell.value;
							}
							if(subTableCell.role == "label") {
								dataset.label = subTableCell.value;
							}
							if(subTableCell.role == "value") {
								dataset.value = subTableCell.value;
							}
							if(subTableCell.role == "data") {
								dataset.data = subTableCell.value;
								if(typeof dataset.data.date_type != "undefined") {
									//This is a date type
									dataset.label = dataset.data.date_type;
									dataset.value = "complex";
								}
							}
						})
	
						dataObject.datasets.push(dataset);
					})
					
				}
			})
	
			dataObjects.push(dataObject);
	
		}
	
		return dataObjects;
	}

	getDendroMethodDescription(siteData, dendroLookupId) {
		for(let key in siteData.lookup_tables.dendro) {
			if(siteData.lookup_tables.dendro[key].dendro_lookup_id == dendroLookupId) {
				return siteData.lookup_tables.dendro[key]
			}
		}
		return null;
	}

	async makeSection(siteData, sections) {
		let dendroDatasets = this.claimDatasets(siteData);

		let dataGroups = siteData.data_groups.filter((dataGroup) => {
			return dataGroup.type == "dendro";
		});

		if(dataGroups.length == 0) {
			return sections;
		}

		let columns = [
			{
				dataType: "subtable",
			},
			{
				title: "Sample name",
				pkey: true
			},
			{
				title: "Group"
			},
			{
				title: "Date sampled"
			}
		];
		let rows = [];

		dataGroups.forEach(dataGroup => {

			let dateSampled = dataGroup.date_sampled;
			let dateSampledParsed = new Date(Date.parse(dateSampled));
			if(dateSampledParsed == "Invalid Date") {
				dateSampled = "Unknown"
			}
			else {
				let month = dateSampledParsed.getMonth()+1;
				if(month < 10) {
					month = "0"+month;
				}
				let day = dateSampledParsed.getDay();
				if(day < 10) {
					day = "0"+day;
				}
				dateSampled = dateSampledParsed.getFullYear()+"-"+month+"-"+day;
			}

			
			let subTableColumns = [
				{
					title: "Dendro lookup id",
					hidden: true
				},
				{
					title: "Measurement type"
				},
				{
					title: "Measurement value"
				},
				{
					title: "data",
					hidden: true,
					exclude_from_export: true
				}
			];

			let subTableRows = [];
			dataGroup.datasets.forEach(dataset => {
				let value = dataset.value;
				let tooltip = "";

				/*
				if(dataset.id == 134 || dataset.id == 137) {
					//This is Estimated felling year or Outermost tree-ring date, these are complex values that needs to be parsed
					value = this.dl.renderDendroDatingAsString(value, siteData);
				}
				*/

				if(dataset.id == 134 || dataset.id == 137) {
					value = this.dl.renderDendroDatingAsString(dataset.data, siteData, true, this.sqs);
				}

				subTableRows.push([
					{
						type: "cell",
						value: dataset.id
					},
					{
						type: "cell",
						value: dataset.label,
						tooltip: this.getDendroMethodDescription(siteData, dataset.id).description
					},
					{
						type: "cell",
						value: value,
						tooltip: tooltip
					},
					{
						type: "data",
						value: dataset.value == "complex" ? dataset.data : dataset.value
					}
				]);
			});
			
			let subTable = {
				"columns": subTableColumns,
				"rows": subTableRows
			};

			rows.push([
				{
					type: "subtable",
					value: subTable
				},
				{
					type: "cell",
					value: dataGroup.sample_name
				},
				{
					type: "cell",
					value: this.getSampleGroupBySampleName(dataGroup.sample_name, siteData).sample_group_name
				},
				{
					type: "cell",
					value: dateSampled
				}
			]);
		});

		
		//Check if there are any dated samples, if not, switch to spreadsheet render view
		let extentMin = d3.min(dataGroups, d => {
            let plantingYear = this.dl.getOldestGerminationYear(d).value
            if(!plantingYear) {
                plantingYear = this.dl.getYoungestGerminationYear(d).value;
            }
            return plantingYear;
        });
    
        let extentMax = d3.max(dataGroups, d => {
            let fellingYear =  this.dl.getOldestFellingYear(d).value;
            if(!fellingYear) {
                fellingYear = this.dl.getYoungestFellingYear(d).value;
            }
            return fellingYear;
        });

		this.extentMin = extentMin;
		this.extentMax = extentMax;

		let defaultDisplayOption = "graph";
        //If we couldn't find a single viable dating for any sample, then we can't calculate a range span at all and thus can't draw anything
        if(!extentMin || !extentMax) {
            defaultDisplayOption = "table";
        }


		let sampleGroupsRenderOptionValues = [];
		siteData.sample_groups.forEach(sg => {
			sampleGroupsRenderOptionValues.push({
				value: sg.sample_group_id,
				title: sg.sample_group_name
			});
		})
		sampleGroupsRenderOptionValues.push({
			value: "all",
			title: "All",
			selected: true
		});

		let biblioIds = [];
		dendroDatasets.forEach(ds => {
			//push if unique
			if(biblioIds.indexOf(ds.biblio_id) == -1) {
				biblioIds.push(ds.biblio_id);
			}
		});

		let contentItem = {
			"name": "dendro",
			"title": "Dendrochronology",
			"titleTooltip": "Name of the dataset",
			"datasetId": 0,
			"datasetReference": this.renderDatasetReference(siteData, biblioIds),
			"data": {
				"columns": columns,
				"rows": rows,
				"dataGroups": dataGroups
			},
			"renderOptions": [
				{
					"name": "Spreadsheet",
					"selected": defaultDisplayOption == "table",
					"type": "table"
				},
				{
					"name": "Graph",
					"selected": defaultDisplayOption == "graph",
					"type": "dendrochart",
					"options": [
						{
							"enabled": true,
							"title": "Sort",
							"type": "select",
							"selected": 1,
							//"options": ["Alphabetical", "Germination year", "Felling year", "Tree species"],
							"options": [
								{
									"title": "Alphabetical",
									"value": "alphabetical",
									"selected": true
								},
								{
									"title": "Germination year",
									"value": "germination year",
								},
								{
									"title": "Felling year",
									"value": "felling year",
								},
								{
									"title": "Tree species",
									"value": "tree species",
								},
							]
						},
						{
							"enabled": true,
							"title": "Uncertainty",
							"type": "select",
							"options": [
								{
									"title": "Estimates",
									"value": "estimates",
									"selected": true
								},
								{
									"title": "None",
									"value": "none",
									"selected": false
								},
							]
						},
						{
							"enabled": true,
							"title": "Sample group",
							"type": "select",
							"options": sampleGroupsRenderOptionValues
						}
					]
				},
			]
		};

		//This is just for hiding/disabling some parts of dendro before it's ready for production usage
		if(this.sqs.domainManager.getDomain("dendrochronology").enabled === false) {
			for(let key in contentItem.renderOptions) {
				if(contentItem.renderOptions[key].type == "table") {
					contentItem.renderOptions[key].selected = true;
				}
				if(contentItem.renderOptions[key].type == "dendrochart") {
					delete contentItem.renderOptions[key];
				}
			}
		}

		let analysisMethod = null;
		for(let key in siteData.lookup_tables.analysis_methods) {
			if(siteData.lookup_tables.analysis_methods[key].method_id == 10) {
				analysisMethod = siteData.lookup_tables.analysis_methods[key];
			}
		}

		let analysisMethodDescription = "";
		if(analysisMethod) {
			analysisMethodDescription = "<h4 class='tooltip-header'>"+analysisMethod.method_name+"</h4>"+analysisMethod.method_abbrev_or_alt_name+"<hr>"+analysisMethod.description;
		}
		
		let section = {
			"name": analysisMethod.method_id,
			"title": "Dendrochronology",
			"methodId": analysisMethod.method_id,
			"methodDescription": analysisMethodDescription,
			"collapsed": true,
			"contentItems": [contentItem]
		};

		if(config.dendroSiteReportSectionEnabled) {
			sections.push(section);
		}
	}

	getSampleGroupBySampleName(sampleName, siteData) {
		for(let key in siteData.sample_groups) {
			for(let sampleKey in siteData.sample_groups[key].physical_samples) {
				if(siteData.sample_groups[key].physical_samples[sampleKey].sample_name == sampleName) {
					return siteData.sample_groups[key]
				}
			}
		}
		return false;
	}

	buildContentItemChart(dsGroups) {
		console.warn("buildContentItemChart");
		let columns = [
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
		let rows = [];

		let contentItemId = nanoid();

		let ci = {
			"name": contentItemId, //Normally: analysis.datasetId
			"title": "Dendrochronology", //Normally this would be: analysis.datasetName
			"datasetId": contentItemId, //Normally: analysis.datasetId
			"data": {
				"columns": columns,
				"rows": rows
			},
			"renderOptions": [
				{
					"name": "Graph",
					"selected": true,
					"type": "dendrochart",
					"options": [
					]
				},
				{
					"name": "Spreadsheet",
					"selected": false,
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

		let datingRows = this.getDatingRowsFromDatasetGroup(datasetGroup);
		console.log(datingRows)
		rows = rows.concat(datingRows);
		
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

	getDatingRowsFromDatasetGroup(datasetGroup, includeAnalysisEntityIdColumn = true, appendOriginalData = false) {
		let rows = [];
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

			let row = [];
			if(includeAnalysisEntityIdColumn) {
				row.push({
					"type": "cell",
					"tooltip": "",
					"value": datasetGroup.dating[dk].analysis_entity_id
				});
			}

			//Fetch the dendro lookup id of this: datasetGroup.dating[dk].analysis_entity_id
			//with query: select dendro_lookup_id from tbl_dendro where analysis_entity_id=132678

			//console.log(datasetGroup, datasetGroup.dating[dk].dendro_lookup_id)
			
			row.push({
				"type": "cell",
				"tooltip": "",
				"role": "id",
				"value": datasetGroup.dating[dk].dendro_lookup_id
			});
			row.push({
				"type": "cell",
				"tooltip": "",
				"value": datasetGroup.dating[dk].date_type
			});
			row.push({
				"type": "cell",
				"tooltip": dateUncertaintyTooltip,
				"value": season + value+" "+dateUncertainty
			});

			row.push({
				"type": "cell",
				"tooltip": "",
				"role": "data",
				"value": datasetGroup.dating[dk]
			});

			if(appendOriginalData) {
				row.push({
					"type": "cell",
					"tooltip": "",
					"value": datasetGroup.dating[dk]
				});
			}
			rows.push(row);
		}
		return rows;
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