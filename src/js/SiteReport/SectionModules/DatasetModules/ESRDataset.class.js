import { nanoid } from "nanoid";
import DatasetModule from "./DatasetModule.class";
import StandardAge from "../../../Common/StandardAge.class";
/*
* Class: DatingToPeriodDataset
*
 */

class ESRDataset extends DatasetModule {
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

		this.methodIds = [160];
		this.methodGroupIds = [];
		this.methodMetaDataFetchingComplete = true;
	}

	async makeSection(siteData, sections) {
		let datasets = this.claimDatasets(siteData);
        this.summary = [];

        if(datasets.length == 0) {
            this.buildIsComplete = true;
            return;
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
                "title": "Dating lab"
            },
            {
                "dataType": "string",
                "title": "Notes"
            },
        ];

        let rows = [];
        let datasetBiblioIds = new Set();
        let datasetContacts = new Set();

        let methodId = this.methodIds[0];
        let method = this.getAnalysisMethodMetaById(siteData, methodId);

        datasets.forEach(dataset => {
            datasetBiblioIds.add(dataset.biblio_id);
            dataset.contacts.forEach(contact => {
                datasetContacts.add(contact);
            });

            dataset.analysis_entities.forEach(analysisEntity => {

                let labName = "";
                let labTooltip = "";
                for(let key in siteData.lookup_tables.labs) {
                    if(siteData.lookup_tables.labs[key].dating_lab_id == analysisEntity.dating_values.dating_lab_id) {
                        labTooltip = siteData.lookup_tables.labs[key].lab_name;
                        labName = siteData.lookup_tables.labs[key].international_lab_id;
                    }
                }

                let stdAge = new StandardAge();
                stdAge.ageType = method.method_name;
                stdAge.isBP = true; //not verified! someone should check this
                stdAge.ageOlder = analysisEntity.dating_values.age ? parseInt(analysisEntity.dating_values.age) : null;
                stdAge.ageYounger = analysisEntity.dating_values.age ? parseInt(analysisEntity.dating_values.age) : null;
                stdAge.ageLocation = null;
                stdAge.sample = analysisEntity.physical_sample_id;
                this.summary.push(stdAge);

                let row = [
                    {
						"type": "cell",
						"tooltip": "",
						"value": parseInt(analysisEntity.analysis_entity_id)
					},
                    {
						"type": "cell",
						"tooltip": "",
						"value": this.getSampleById(siteData, analysisEntity.physical_sample_id).sample_name
					},
                    {
                        "type": "cell",
                        "tooltip": "",
                        "value": analysisEntity.dating_values.age ? parseInt(analysisEntity.dating_values.age) : ""
                    },
                    {
                        "type": "cell",
                        "tooltip": labTooltip ? labTooltip : "",
                        "value": labName ? labName : analysisEntity.dating_values.dating_lab_id
                    },
                    {
                        "type": "cell",
                        "tooltip": "",
                        "value": analysisEntity.dating_values.notes
                    },
                ]

                rows.push(row);
            });
        });

        //get or create section
        let section = this.getSectionByMethodId(methodId, sections);			
        if(!section) {
            section = {
                "name": methodId,
                "title": method.method_name,
                "methodId": methodId,
                "methodDescription": method.description,
                "collapsed": true,
                "contentItems": []
            };
            sections.push(section);
        }

        let contentItem = {
            "name": nanoid(), //Normally: analysis.datasetId
            "title": method.method_name, //Normally this would be: analysis.datasetName
            "datasetReference": this.sqs.renderBiblioReference(siteData, Array.from(datasetBiblioIds)),
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

export { ESRDataset as default }