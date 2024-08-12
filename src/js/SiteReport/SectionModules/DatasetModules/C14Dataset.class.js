import { nanoid } from "nanoid";
import DatasetModule from "./DatasetModule.class";
/*
* Class: DatingToPeriodDataset
*
 */

class C14Dataset extends DatasetModule {
	constructor(analysis) {
		super();
		this.sqs = analysis.sqs;
		this.analysis = analysis;
		this.data = analysis.data;
        this.buildIsComplete = true;
        this.methodIds = [151, 148, 38];
    }

    async makeSection(siteData, sections) {
		let methodDatasets = this.claimDatasets(siteData);
		let dataGroups = siteData.data_groups.filter(dataGroup => {
			if(this.methodIds.includes(dataGroup.method_id)) {
				return true;
			}
			return false;
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
					"title": "Age"
				},
				{
					"dataType": "string",
					"title": "Notes"
				},
				{
					"dataType": "string",
					"title": "Lab number"
				},
			];

			let rows = [];
			
			dataGroup.data_points.forEach(point => {
				let sample = this.analysis.getSampleBySampleId(siteData, point.physical_sample_id);
				let lab = this.getDatingLabById(siteData, point.dating_values.dating_lab_id);

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
						"tooltip": "",
						"value": this.formatAge(point.dating_values)
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": point.dating_values.notes != null ? point.dating_values.notes : "No data"
					},
					{
						"type": "cell",
						"tooltip": lab != null ? "Lab name: "+lab.lab_name + "<hr/>International ID: " + lab.international_lab_id : "",
						"value": point.dating_values.lab_number != null ? point.dating_values.lab_number : "No data"
					},
				];

				rows.push(row);
			});

			let method = this.analysis.getMethodMetaDataById(dataGroup.method_id);

			let datasetBiblioIds = this.getUniqueDatasetBiblioIdsFromDataGroup(methodDatasets, dataGroup);
			let datasetContacts = this.getUniqueDatasetContactsFromDataGroup(methodDatasets, dataGroup);
			
			let contentItem = {
				"name": nanoid(), //Normally: analysis.datasetId
				"title": method.method_name, //Normally this would be: analysis.datasetName
				"datasetReference": this.sqs.renderBiblioReference(siteData, datasetBiblioIds),
				"datasetReferencePlain": this.sqs.renderBiblioReference(siteData, datasetBiblioIds, false),
				"datasetContacts": this.sqs.renderContacts(siteData, datasetContacts),
				"methodId": dataGroup.method_id,
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

	getDatingLabById(site, labId) {
		for(let key in site.lookup_tables.labs) {
			if(site.lookup_tables.labs[key].dating_lab_id == labId) {
				return site.lookup_tables.labs[key];
			}
		}
		return null;
	}

    formatAge(datingValues) {
		let ageStr = "";
		if(datingValues.dating_uncertainty) {
			ageStr += datingValues.dating_uncertainty+" ";
		}
		let age = parseInt(datingValues.age);
		let ageOlder = age;
		let ageYounger = age;
		
		if(parseInt(datingValues.error_older)) {
			ageOlder += parseInt(datingValues.error_older);
		}
		if(parseInt(datingValues.error_younger)) {
			ageYounger -= parseInt(datingValues.error_younger);
		}

		ageStr += ageOlder+" - "+ageYounger+" BP";

		return ageStr;
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

export { C14Dataset as default }