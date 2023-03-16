import { nanoid } from "nanoid";
import DatasetModule from "./DatasetModule.class";
/*
* Class: DatingToPeriodDataset
*
 */

class DatingToPeriodDataset extends DatasetModule {
	constructor(analysis) {
		super();
		this.sqs = analysis.sqs;
		this.analysis = analysis;
		this.data = analysis.data;
		this.analyses = [];
		this.datasetFetchPromises = [];
		this.offeredDatasets = [];
		this.datasets = [];
		this.buildIsComplete = false;
		this.section = analysis.section;

		this.methodIds = [14];
		this.methodGroupIds = [3, 19, 20]
		this.methodMetaDataFetchingComplete = true;
	}

	getSection(sectionName) {
		let sectionKey = this.sqs.findObjectPropInArray(this.section.sections, "name", sectionName);
		if(sectionKey === false) {
			return false;
		}

		return this.section.sections[sectionKey];
	}

	createSection(sectionData) {
		let sectionsLength = this.section.sections.push(sectionData);
		let sectionKey = sectionsLength - 1;
		return this.section.sections[sectionKey];
	}
	
	groupDatasetsByMethod(datasets) {
		let datasetGroups = [];
		for(let key in datasets) {
			let found = false;
			for(let gKey in datasetGroups) {
				if(datasetGroups[gKey].methodId == datasets[key].method.method_id) {
					found = true;
					datasetGroups[gKey].datasets.push(datasets[key]);
				}
			}

			if(!found) {
				datasetGroups.push({
					methodId: datasets[key].method.method_id,
					datasets: [datasets[key]]
				});
			}
		}

		return datasetGroups;
	}

	async makeSection(siteData, sections) {
		let datasets = this.claimDatasets(siteData);
		
		//we make our own 'data groups' here despite this exact data structure already existing in the siteData from the server
		//this is because we need to do this based on the datasets we claim, otherwise we break the whole claiming system
		let dataGroups = [];
	
		datasets.forEach(ds => {
			let dataGroupFound = false;
			dataGroups.forEach(dg => {
				if(dg.method_id == ds.method_id) {
					dataGroupFound = true;
					dg.data_points = dg.data_points.concat(ds.analysis_entities);
				}
			});
			if(!dataGroupFound) {
				dataGroups.push({
					method_id: ds.method_id,
					method_group_id: ds.method_group_id,
					type: "dating_values",
					data_points: ds.analysis_entities
				});
			}
		});

		dataGroups.forEach(dataGroup => {
			let section = this.getSectionByMethodId(dataGroup.method_id, sections);			
			if(!section) {
				let method = this.getAnalysisMethodMetaById(siteData, dataGroup.method_id);
				section = {
					"name": method.method_id,
					"title": method.method_name,
					"methodId": dataGroup.method_id,
					"methodDescription": method.description,
					"collapsed": true,
					"contentItems": []
				};
				sections.push(section);
			}

			let columns = [
				{
					"dataType": "number",
					"pkey": true,
					"title": "Analysis entitiy id",
					"hidden": true
				},
				{
					"dataType": "string",
					"title": "Sample"
				},
				{
					"dataType": "string",
					"title": "Age name"
				},
				{
					"dataType": "string",
					"title": "Age location"
				},
			];

			let foundAgeData = false;
			dataGroup.data_points.forEach(point => {
				if(point.dating_values.cal_age_younger || point.dating_values.cal_age_older) {
					foundAgeData = true;
				}
			});

			let foundC14Data = false;
			dataGroup.data_points.forEach(point => {
				if(point.dating_values.c14_age_younger || point.dating_values.c14_age_older) {
					foundC14Data = true;
				}
			});

			if(foundAgeData) {
				columns.push({
					"dataType": "string",
					"title": "Age"
				});
			}

			if(foundC14Data) {
				columns.push({
					"dataType": "string",
					"title": "C14 age"
				});
			}

			let rows = [];
			
			dataGroup.data_points.forEach(point => {
				
				let sample = this.analysis.getSampleBySampleId(siteData, point.physical_sample_id);

				let ageLocationTooltip = "";
				if(point.dating_values.age_location_type && point.dating_values.age_location_desc) {
					ageLocationTooltip = "<h4 class='tooltip-header'>"+point.dating_values.age_location_type+"</h4><hr/>"+point.dating_values.age_location_desc;
				}
				if(point.dating_values.age_location_type && !point.dating_values.age_location_desc) {
					ageLocationTooltip = "<h4 class='tooltip-header'>"+point.dating_values.age_location_type+"</h4>";
				}

				let ageTooltip = ageTooltip = "<h4 class='tooltip-header'>"+point.dating_values.age_type+"</h4><hr/>"+point.dating_values.age_description+"<br/><br/>"+point.dating_values.rel_age_desc;
				if(!point.dating_values.rel_age_desc) {
					ageTooltip = "<h4 class='tooltip-header'>"+point.dating_values.age_type+"</h4><hr/>"+point.dating_values.age_description;
				}

				let row = [
					{
						"type": "cell",
						"tooltip": "",
						"value": point.analysis_entity_id
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": sample != null ? sample.sample_name : point.physical_sample_id+" (internal id)"
					},
					{
						"type": "cell",
						"tooltip": ageTooltip,
						"value": point.dating_values.relative_age_name
					},
					{
						"type": "cell",
						"tooltip": ageLocationTooltip,
						"value": point.dating_values.age_location_name != null ? point.dating_values.age_location_name : "No data"
					},
				];

				if(foundAgeData) {
					row.push({
						"type": "cell",
						"tooltip": "",
						"value": this.formatAge(point.dating_values.cal_age_older, point.dating_values.cal_age_younger)
					});
				}

				if(foundC14Data) {
					row.push({
						"type": "cell",
						"tooltip": "",
						"value": this.formatAge(point.dating_values.c14_age_older, point.dating_values.c14_age_younger)
					});
				}

				rows.push(row);
			});

			let method = this.analysis.getMethodMetaDataById(dataGroup.method_id);

			let contentItem = {
				"name": nanoid(), //Normally: analysis.datasetId
				"title": method.method_name, //Normally this would be: analysis.datasetName
				"data": {
					"columns": columns,
					"rows": rows
				},
				"renderOptions": [
					{
						"name": "Spreadsheet",
						"selected": true,
						"type": "table",
					}
				]
			};

			section.contentItems.push(contentItem);
		});

		

	}

	formatAge(older, younger) {
		if(!older && !younger) {
			return "No data";
		}
		if(younger && older) {
			return parseFloat(older)+" - "+parseFloat(younger)+" BP";
		}
		if(younger && !older) {
			return "< "+parseFloat(younger)+" BP"
		}
		if(!younger && older) {
			return "> "+parseFloat(older)+" BP"
		}
	}
	

	buildContentItemOLD(datasetGroup) {
		let method = this.analysis.getMethodMetaDataById(datasetGroup.methodId);

		let analysisEntities = [];
		for(let key in datasetGroup.datasets) {
			analysisEntities = analysisEntities.concat(datasetGroup.datasets[key].analysis_entities)
		}

		//Defining columns
		var columns = [
			{
				"dataType": "number",
				"pkey": true,
				"title": "Analysis entitiy id",
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
				"title": "Period" //Dating age name
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "C14 Age"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Cal Age"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Notes"
			}
		];

		let rows = [];
		//for(let dpKey in dataset.dataPoints) {
		for(let dKey in analysisEntities) {

			let ae = analysisEntities[dKey];
			console.log(ae);

			let ageName = ae.age_data.relative_age_name;
			if(ae.age_data.abbreviation != null) {
				ageName += " ("+ae.age_data.abbreviation+")";
			}

			let c14Age = "None";
			if(ae.age_data.c14_age_younger != null && ae.age_data.c14_age_older != null) {
				c14Age = Math.round(ae.age_data.c14_age_younger)+" - "+Math.round(ae.age_data.c14_age_older);
			}

			let calAge = "None";
			if(ae.age_data.cal_age_younger != null && ae.age_data.cal_age_older != null) {
				calAge = Math.round(ae.age_data.cal_age_younger)+" - "+Math.round(ae.age_data.cal_age_older);
			}

			let row = [
				{
					"type": "cell",
					"tooltip": "",
					"value": ae.analysis_entity_id
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": ae.physical_sample.sample_name
				},
				{
					"type": "cell",
					"tooltip": ae.age_data.description == null ? "" : ae.age_data.description,
					"value": ageName
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": c14Age
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": calAge
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": ae.age_data.notes == null ? "None" : notes = ae.age_data.notes
				}
			];

			rows.push(row);

		}

		let ci = {
			"name": "method-"+datasetGroup.methodId, //This just needs to be something unique for this CI within this SR
			"title": "Datasets",
			"titleTooltip": "Multiple datasets, one per row. Each row is a dating analysis performed on a sample. A sample may have multiple datings.",
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

	/*
	* Function: isBuildComplete
	*/
	isBuildComplete() {
		return this.buildIsComplete;
	}

	/*
	* Function: destroy
	*/
	destroy() {
	}
}

export { DatingToPeriodDataset as default }