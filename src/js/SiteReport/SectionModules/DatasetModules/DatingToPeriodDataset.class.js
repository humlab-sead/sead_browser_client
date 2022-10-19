import { inArray } from "jquery";
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
		this.taxonPromises = [];
		this.analyses = [];
		this.datasetFetchPromises = [];
		this.offeredDatasets = [];
		this.datasets = [];
		this.buildIsComplete = false;
		this.section = analysis.section;

		this.methodIds = [];
		//this.methodGroupId = 19; //Selecting everything in "Dating to period" method group
		this.methodGroupIds = [19, 20]
		this.methodMetaDataFetchingComplete = false;

		this.metaDataFetchingPromises = [];
		for(let key in this.methodGroupIds) {
			this.metaDataFetchingPromises.push(this.analysis.fetchMethodGroupMetaData(this.methodGroupIds[key]));
        	this.metaDataFetchingPromises.push(this.analysis.fetchMethodsInGroup(this.methodGroupIds[key]));
		}

        

		Promise.all(this.metaDataFetchingPromises).then(() => {
			this.methodMetaDataFetchingComplete = true;
		});
	}

	getSection(sectionData) {
		let sectionKey = this.sqs.findObjectPropInArray(this.section.sections, "name", sectionData.name);
		if(sectionKey === false) {
			let sectionsLength = this.section.sections.push(sectionData);

			sectionKey = sectionsLength - 1;
		}

		return this.section.sections[sectionKey];
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
		if(datasets.length > 0) {
			console.warn("DatingToPeriodDataset module has claimed "+datasets.length+" datasets on this site, but have no idea what to do with them!");
		}
	}

    /**  
    * Function: buildSection
	*/
	buildSection(datasets) {
		console.log("buildSection", datasets);

		//Group datasets by method - which will become their own sections with ONE contentItem in each where each dataset is a row

		let datasetGroups = this.groupDatasetsByMethod(datasets);
		console.log(datasetGroups)

		for(let key in datasetGroups) {
			let section = this.getSection("section-method-group-"+datasetGroups[key].methodId);
			if(section === false) {
				let method = this.analysis.getMethodMetaDataById(datasetGroups[key].methodId);
				section = this.createSection({
					"name": "section-method-group-"+datasetGroups[key].methodId,
					"title": method.name,
					"methodDescription": method.description == null ? "" : method.description,
					"collapsed": true,
					"contentItems": []
				});
			}
			let ci = this.buildContentItem(datasetGroups[key]);
			section.contentItems.push(ci);
		}

		/*
		for(let key in datasets) {
			let methodGroup = this.analysis.getMethodGroupMetaDataById(datasets[key].method.method_group_id);

			//let section = this.getSection("section-method-group-"+datasets[key].method.method_group_id);
			let section = this.getSection("section-method-group-"+datasets[key].method.method_id);

			console.log(datasets[key].method)

			if(section === false) {
				section = this.createSection({
					"name": "section-method-group-"+datasets[key].method.method_id,
					"title": datasets[key].method.method_name,
					"methodDescription": methodGroup == null ? "" : methodGroup.description,
					"collapsed": true,
					"contentItems": []
				});
			}

			let ci = this.buildContentItem(datasets[key]);
			section.contentItems.push(ci);
		}
		*/
	}
	

	buildContentItem(datasetGroup) {
		let method = this.analysis.getMethodMetaDataById(datasetGroup.methodId);

		let analysisEntities = [];
		for(let key in datasetGroup.datasets) {
			analysisEntities = analysisEntities.concat(datasetGroup.datasets[key].analysis_entities)
		}

		console.log(analysisEntities)

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
		this.sqs.sqsEventUnlisten("taxaFetchingComplete-"+this.analysisData.datasetId, this);
	}
}

export { DatingToPeriodDataset as default }