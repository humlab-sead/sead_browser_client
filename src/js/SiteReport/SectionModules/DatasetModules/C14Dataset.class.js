import { nanoid } from "nanoid";
import DatasetModule from "./DatasetModule.class";
import StandardAge from "../../../Common/StandardAge.class";
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
        this.summary = null;
    }

    async makeSection(siteData, sections) {
		let methodDatasets = this.claimDatasets(siteData);
		let summary = [];
		let dataGroups = siteData.data_groups.filter(dataGroup => {
			return dataGroup.method_ids.some(id => this.methodIds.includes(id));
		});

		// Group dataGroups by methodId so all rows end up in one contentItem per section
		const groupsByMethod = new Map();
		dataGroups.forEach(dataGroup => {
			const methodId = dataGroup.method_ids.find(id => this.methodIds.includes(id));
			if(!groupsByMethod.has(methodId)) {
				groupsByMethod.set(methodId, []);
			}
			groupsByMethod.get(methodId).push(dataGroup);
		});

		groupsByMethod.forEach((groups, methodId) => {
			let section = this.getSectionByMethodId(methodId, sections);
			if(!section) {
				let method = this.getAnalysisMethodMetaById(siteData, methodId);
				section = {
					"name": method.method_id,
					"title": method.method_name,
					"methodId": methodId,
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
			let method = this.analysis.getMethodMetaDataById(methodId);
			let allBiblioIds = [];
			let allContacts = [];

			groups.forEach(dataGroup => {
				// Group flat key/value entries by analysis entity id
				const pointsMap = new Map();
				dataGroup.values.forEach(v => {
					const eid = v.analysis_entitity_id;
					if(!pointsMap.has(eid)) {
						pointsMap.set(eid, {
							analysis_entity_id: eid,
							physical_sample_id: v.physical_sample_id,
							sample_name: v.sample_name,
							dating_values: {}
						});
					}
					pointsMap.get(eid).dating_values[v.key] = v.value;
				});

				[...pointsMap.values()].forEach(point => {
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

					let stdAge = new StandardAge();
					stdAge.ageType = method.method_name;
					stdAge.sample = sample != null ? sample.sample_name : point.physical_sample_id+" (internal id)";
					stdAge.ageOlder = parseInt(point.dating_values.age) + parseInt(point.dating_values.error_older || 0);
					stdAge.ageYounger = parseInt(point.dating_values.age) - parseInt(point.dating_values.error_younger || 0);
					stdAge.isBP = true;
					summary.push(stdAge);

					rows.push(row);
				});

				let datasetBiblioIds = this.getUniqueDatasetBiblioIdsFromDataGroup(methodDatasets, dataGroup);
				let datasetContacts = this.getUniqueDatasetContactsFromDataGroup(methodDatasets, dataGroup);
				allBiblioIds = [...new Set([...allBiblioIds, ...datasetBiblioIds])];
				allContacts = [...allContacts, ...datasetContacts];
			});

			let contentItem = {
				"name": nanoid(),
				"title": method.method_name,
				"datasetReference": this.sqs.renderBiblioReference(siteData, allBiblioIds),
				"datasetReferencePlain": this.sqs.renderBiblioReference(siteData, allBiblioIds, false),
				"datasetContacts": this.sqs.renderContacts(siteData, allContacts),
				"methodId": methodId,
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

		this.summary = summary;
    }

	getDatingSummary() {
		return this.summary;
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