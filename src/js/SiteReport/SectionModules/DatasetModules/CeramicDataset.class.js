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
		let claimedDatasets = this.claimDatasets(siteData);
		if(claimedDatasets.length == 0) {
			return;
		}

		let datasetSections = this.buildSections();

		//Each method (petrographic microscopy, thermal analysis) gets its own section
		this.methodIds.forEach(methodId => {
			let methodDatasets = claimedDatasets.filter(ds => ds.method_id == methodId);
			let sampleDataGroups = this.getMethodDataGroupsBySample(siteData, methodDatasets);

			if(sampleDataGroups.length > 0) {
				let methodSection = datasetSections.find(section => section.methodId == methodId);
				if(typeof methodSection == "undefined") {
					console.warn("Could not find a site report section for ceramics method "+methodId);
					return;
				}

				let ci = this.buildContentItem(sampleDataGroups, methodId);
				methodSection.contentItems.push(ci);
			}
		});
	}

	/*
	* Function: getMethodDataGroupsBySample
	*
	* The server compiles one ceramics data group per sample, holding the values of all of the sample's ceramics analyses,
	* of both methods, along with their datings. This picks out the values belonging to the given method's datasets, per sample.
	*/
	getMethodDataGroupsBySample(siteData, methodDatasets) {
		let analysisEntityIds = new Set();
		methodDatasets.forEach(ds => {
			ds.analysis_entities.forEach(ae => {
				analysisEntityIds.add(String(ae.analysis_entity_id));
			});
		});

		let sampleDataGroups = [];
		siteData.data_groups.forEach(dataGroup => {
			if(dataGroup.type != "ceramics") {
				return;
			}

			let values = dataGroup.values.filter(value => analysisEntityIds.has(String(value.analysis_entity_id)));
			if(values.length > 0) {
				sampleDataGroups.push({
					physicalSampleId: dataGroup.physical_sample_id,
					values: values
				});
			}
		});

		return sampleDataGroups;
	}

	/*
	* Function: getDatingSubTableRows
	*
	* Each of a sample's ceramics analyses can carry its own dating, which is often the same for all of them,
	* so each distinct dating of the sample is listed once.
	*/
	getDatingSubTableRows(datingValues) {
		let rows = [];
		let renderedDatings = [];
		datingValues.forEach(value => {
			let dating = value.data;
			let datingKey = dating.method_id+":"+dating.relative_age_id;
			if(renderedDatings.includes(datingKey)) {
				return;
			}
			renderedDatings.push(datingKey);

			let datingValue = dating.relative_age_name;
			let age = this.formatAge(dating.cal_age_older, dating.cal_age_younger);
			if(age != null) {
				datingValue += " ("+age+")";
			}

			let datingTooltip = "";
			if(dating.age_type) {
				datingTooltip = "<h4 class='tooltip-header'>"+dating.age_type+"</h4>";
			}
			if(dating.rel_age_desc && dating.rel_age_desc != dating.relative_age_name) {
				datingTooltip += (datingTooltip != "" ? "<hr/>" : "")+dating.rel_age_desc;
			}

			rows.push([
				{
					"type": "cell",
					"tooltip": "",
					"value": value.analysis_entity_id
				},
				{
					"type": "cell",
					"tooltip": dating.relative_date_method_name ? dating.relative_date_method_name : "",
					"value": value.key
				},
				{
					"type": "cell",
					"tooltip": datingTooltip,
					"value": datingValue
				}
			]);
		});

		return rows;
	}

	formatAge(older, younger) {
		if(older == null && younger == null) {
			return null;
		}
		if(older != null && younger != null) {
			return parseFloat(older)+" - "+parseFloat(younger)+" BP";
		}
		if(younger != null) {
			return "< "+parseFloat(younger)+" BP";
		}
		return "> "+parseFloat(older)+" BP";
	}

	buildSections() {
		let siteData = this.sqs.siteReportManager.siteReport.siteData;
		
		let builtSections = [];

		this.methodIds.forEach(methodId => {
			siteData.lookup_tables.methods.forEach(method => {
				if(method.method_id == methodId) {
					let sectionKey = this.sqs.findObjectPropInArray(this.section.sections, "name", method.method_id);
					if(sectionKey === false) {
						var sectionsLength = this.section.sections.push({
							"name": methodId,
							"title": method.method_name,
							"methodId": method.method_id,
							"methodDescription": method == null ? "" : method.description,
							"collapsed": true,
							"contentItems": []
						});
						sectionKey = sectionsLength - 1;
					}
					//Return the method's section also when it already existed, not only when it was created here
					builtSections.push(this.section.sections[sectionKey]);
				}
			})
		});

		return builtSections;
	}

	buildContentItem(sampleDataGroups, methodId) {
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
		let biblioIds = [];
		let datasetIds = [];
		let datasetContactIds = [];

		let analysisEntityIds = [];
		sampleDataGroups.forEach(dsg => {
			dsg.values.forEach(value => {
				analysisEntityIds.push(value.analysis_entity_id)
			});
		});

		siteData.datasets.forEach(ds => {
			ds.analysis_entities.forEach(ae => {
				ae.analysis_entity_id;
				if(analysisEntityIds.includes(ae.analysis_entity_id)) {
					datasetIds.push(ae.dataset_id);
				}
			});
		});

		siteData.datasets.forEach(ds => {
			datasetContactIds = datasetContactIds.concat(ds.contacts);
			if(datasetIds.includes(ds.dataset_id)) {
				if(ds.biblio_id && !biblioIds.includes(ds.biblio_id)) {
					biblioIds.push(ds.biblio_id);
				}
			}
		});

		sampleDataGroups.forEach(dsg => {

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
			let datingValues = [];
			dsg.values.forEach(value => {
				//The datings of the sample's ceramics analyses, e.g. an archaeological period
				if(value.valueType == "complex") {
					datingValues.push(value);
					return;
				}

				let measurementValue = value.value;
				if(!Number.isNaN(parseFloat(measurementValue))) {
					measurementValue = parseFloat(measurementValue);

					//check that it's unique
					let found = false;
					chartAxes.forEach(ca => {
						if(ca.title == value.key) {
							found = true;
						}
					});

					if(!found) {
						chartAxes.push({
							"title": value.key,
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
						"value": value.analysis_entity_id
					},
					{
						"type": "cell",
						"tooltip": value.description,
						"value": value.key
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": measurementValue
					}
				];

				subTableRows.push(subTableRow);
			});

			subTableRows = subTableRows.concat(this.getDatingSubTableRows(datingValues));

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
		

		let datasetBiblioIds = [];
		siteData.datasets.forEach(ds => {
			if(ds.biblio_id != null) {
				//push if unique
				if(!datasetBiblioIds.includes(ds.biblio_id)) {
					datasetBiblioIds.push(ds.biblio_id);
				}
			}
		});

		let datasetContacts = [];
		siteData.datasets.forEach(ds => {
			if(ds.contacts != null) {
				//push if unique
				ds.contacts.forEach(contact => {
					if(!datasetContacts.includes(contact)) {
						datasetContacts.push(contact);
					}
				});
			}
		});

		let ci = {
			"name": "ceramics-"+methodId, //Normally: analysis.datasetId, but must be unique per method since there's one content item per method section
			"title": "Ceramics", //Normally this would be: analysis.datasetName
			"datasetReference": this.sqs.renderBiblioReference(siteData, datasetBiblioIds),
			"datasetReferencePlain": this.sqs.renderBiblioReference(siteData, datasetBiblioIds, false),
			"datasetContacts": this.sqs.renderContacts(siteData, datasetContacts),
			"methodId": methodId,
			"renderedBy": this.constructor.name,
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