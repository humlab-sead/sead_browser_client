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
	
	/*
	* Function: offerAnalyses
	*
	* Ok, so, this is a little strange perhaps and deserves some explanation. What's going on here is that the instance of Analysis will fetch just the most basic information regarding which analysis are attached to a certain site.
	* That object will then delegate the responsibility of fetching the rest of the information and structuring it properly, since how this should be done varies between different types, and this is delegated by "offering"
	* the analysis to all the available analysis modules, and whichever module claims it will have it. This (offerAnalyses) is the function which will be passed the analyses and will have to make a decision on wether to claim them or not
	* based on the information available in each analysis object.
	*
	* This function is never called from within this module itself, only from the outside from the higher level Analysis module.
	* 
	* If this function decides to claim one (or more) datasets from the passed in array, it needs to splice these out of the array - that's how the actual claiming is done.
	*
	* The module should structure the fetched information according to the general site report format for sections, content-items and tables structures. You can find the definition of this format inside Johan's head (this needs to be fixed - not the head, the writing down of the format (Tag: FIXME))
	*
	* Parameters:
	* 	datasets - An array of dataset/analysis objects to make decision on.
	*
	* Returns:
	* A promise which should resolve when the data structure for this analysis/dataset is completely built and filled out.
	*/ 
	offerAnalyses(datasets, sectionsList) {
		this.sectionsList = sectionsList;
		for(let key = datasets.length - 1; key >= 0; key--) {
			if(this.methodGroupIds.includes(datasets[key].methodGroupId)) {
				//console.log("DatingToPeriodDataset claiming ", datasets[key].datasetId, datasets[key]);
				let dataset = datasets.splice(key, 1)[0];
				this.offeredDatasets.push(dataset);
				//this.datasets.push(dataset);
			}
		}

		//Now fetch & build all datasets
		return new Promise((resolve, reject) => {
			let fetchDataPromises = [];
			fetchDataPromises = fetchDataPromises.concat(this.metaDataFetchingPromises);
			for(let key in this.offeredDatasets) {
				fetchDataPromises.push(this.fetchDataset(this.offeredDatasets[key]));
			}

			Promise.all(fetchDataPromises).then(() => {
				if(this.datasets.length > 0) {
					this.buildSection(this.datasets);
				}
			});

			resolve();
		});
    }

	async fetchDataset(offeredDataset) {
		await $.ajax(this.sqs.config.dataServerAddress+"/dataset/"+offeredDataset.datasetId, {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				this.datasets.push(data);
			}
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
    
    /**  
    * Function: buildSection
	*/
	buildSection(datasets) {
		console.log("buildSection", datasets);

		for(let key in datasets) {
			
			let methodGroup = this.analysis.getMethodGroupMetaDataById(datasets[key].method.method_group_id);

			let section = this.getSection("section-method-group-"+datasets[key].method.method_group_id);
			if(section === false) {
				section = this.createSection({
					"name": "section-method-group-"+datasets[key].method.method_group_id,
					"title": methodGroup.name,
					"methodDescription": methodGroup == null ? "" : methodGroup.description,
					"collapsed": true,
					"contentItems": []
				});
			}

			let ci = this.buildContentItem(datasets[key]);
			section.contentItems.push(ci);
		}
	}
	
	buildContentItem(dataset) {
		//Here are going to present this data by making one table for each dataset, and having the various attributes of that dataset be the rows of the table

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
				"title": "Dating age name"
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
		for(let dKey in dataset.analysis_entities) {

			let ae = dataset.analysis_entities[dKey];
			console.log(ae);

			let ageName = ae.age_data.relative_age_name;
			if(ae.age_data.abbreviation != null) {
				ageName += " ("+ae.age_data.abbreviation+")";
			}

			let c14Age = "None";
			if(ae.age_data.c14_age_younger != null && ae.age_data.c14_age_older != null) {
				c14Age = ae.age_data.c14_age_younger+" - "+ae.age_data.c14_age_older;
			}

			let calAge = "None";
			if(ae.age_data.cal_age_younger != null && ae.age_data.cal_age_older != null) {
				calAge = ae.age_data.cal_age_younger+" - "+ae.age_data.cal_age_older;
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
					"tooltip": ae.age_data.description,
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
			"name": "dataset-"+dataset.dataset_id, //This just needs to be something unique for this CI within this SR
			"title": "Sample "+dataset.dataset_name, 
			"datasetId": dataset.datasedataset_idtId, 
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