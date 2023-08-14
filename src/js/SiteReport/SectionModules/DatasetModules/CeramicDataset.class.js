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
		/*
		this.methodIds.map((methodId) => {
			this.metaDataFetchingPromises.push(this.analysis.fetchMethodMetaData(methodId));
		});
		*/
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

		let chartAxes = [];

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
			dsg.datasets.forEach((ds, i) => {
				let dataset = ds;

				if(!Number.isNaN(parseFloat(dataset.measurement_value))) {
					dataset.measurement_value = parseFloat(dataset.measurement_value);

					//check that it's unique
					let found = false;
					chartAxes.forEach(ca => {
						if(ca.title == dataset.name) {
							found = true;
						}
					});

					if(!found) {
						chartAxes.push({
							"title": dataset.name,
							"value": 2, //because our data (measurement_value) is in subtable column 2
							"selected": false,
							"location": "subtable"
						});
					}
					
				}

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
				},
				{
					"name": "Bar chart",
					"selected": false,
					"type": "bar",
					"options": [
						{
							"enabled": true,
							"title": "X axis",
							"type": "select",
							"selected": 0,
							"options": [
								{
									"title": "Sample name",
									"value": 2,
									"selected": true
								}
							]
						},
						{
							"enabled": true,
							"title": "Y axis",
							"type": "select",
							"selected": 1,
							"options": chartAxes
						},
						{
							"enabled": false,
							"title": "Sort",
							"type": "select",
							"options": [
							]
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