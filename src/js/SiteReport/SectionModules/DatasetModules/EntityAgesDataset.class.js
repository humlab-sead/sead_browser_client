import { nanoid } from "nanoid";
import DatasetModule from "./DatasetModule.class";
import StandardAge from "../../../Common/StandardAge.class";
/*
* Class: DatingToPeriodDataset
*
 */

class EntityAgesDataset extends DatasetModule {
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
		this.summary = null;

		this.methodIds = [176];
		this.methodGroupIds = [];
		this.methodMetaDataFetchingComplete = true;
	}
    /*
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
    */

	async makeSection(siteData, sections) {
		let datasets = this.claimDatasets(siteData);
        if(!datasets || datasets.length == 0) {
            return;
        }
        let method = this.analysis.getMethodMetaDataById(datasets[0].method_id);

        let section = {
            "name": method.method_id,
            "title": method.method_name,
            "methodId": method.method_id,
            "methodDescription": method.description,
            "collapsed": true,
            "contentItems": []
        };
        sections.push(section);

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
                "title": "Dating specifier"
            },
            {
                "dataType": "string",
                "title": "Age"
            },
            {
                "dataType": "string",
                "title": "Age older"
            },
            {
                "dataType": "string",
                "title": "Age younger"
            },
            {
                "dataType": "string",
                "title": "Age range"
            },
        ];


        let datasetBiblioIds = new Set();
        let datasetContacts = new Set();

        let rows = [];
        datasets.forEach(dataset => {

            if(dataset.biblio_id) {
                datasetBiblioIds.add(dataset.biblio_id);
            }
            if(dataset.contacts.length > 0) {
                dataset.contacts.forEach(contact => {
                    datasetContacts.add(contact);
                });
            }

            dataset.analysis_entities.forEach(ae => {

                let sample = this.analysis.getSampleBySampleId(siteData, ae.physical_sample_id);

                let row = [
                    {
                        "type": "cell",
                        "tooltip": "",
                        "value": ae.analysis_entity_id
                    },
                    {
                        "type": "cell",
                        "tooltip": "",
                        "value": sample != null ? sample.sample_name : ae.physical_sample_id+" (internal id)"
                    },
                    {
                        "type": "cell",
                        "tooltip": "",
                        "value": ae.entity_ages.dating_specifier != null ? ae.entity_ages.dating_specifier : "No data"
                    },
                    {
                        "type": "cell",
                        "tooltip": "",
                        "value": ae.entity_ages.age != null ? ae.entity_ages.age : "No data"
                    },
                    {
                        "type": "cell",
                        "tooltip": "",
                        "value": ae.entity_ages.age_older != null ? this.sqs.tryParseValueAsNumber(ae.entity_ages.age_older) : "No data"
                    },
                    {
                        "type": "cell",
                        "tooltip": "",
                        "value": ae.entity_ages.age_younger != null ? this.sqs.tryParseValueAsNumber(ae.entity_ages.age_younger) : "No data"
                    },
                    {
                        "type": "cell",
                        "tooltip": "",
                        "value": ae.entity_ages.age_range != null ? ae.entity_ages.age_range : "No data"
                    },
                ];

                rows.push(row);
            });
        });
        
        let contentItem = {
            "name": nanoid(), //Normally: analysis.datasetId
            "title": method.method_name, //Normally this would be: analysis.datasetName
            "datasetReference": this.sqs.renderBiblioReference(siteData, Array.from(datasetBiblioIds), true),
            "datasetReferencePlain": this.sqs.renderBiblioReference(siteData, Array.from(datasetBiblioIds), false),
            "datasetContacts": this.sqs.renderContacts(siteData, Array.from(datasetContacts)),
            "methodId": method.method_id,
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
	}

	getDatingSummary() {
		return this.summary;
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

export { EntityAgesDataset as default }