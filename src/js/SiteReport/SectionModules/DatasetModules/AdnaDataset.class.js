import DatasetModule from "./DatasetModule.class";
/*
* Class: AdnaDataset
*
 */

class AdnaDataset extends DatasetModule {
	constructor(analysis) {
		super();
		this.sqs = analysis.sqs;
		this.analysis = analysis;
		this.data = analysis.data;
        this.buildIsComplete = true;
        this.methodIds = [175];
    }

    async makeSection(siteData, sections) {
		const methodDatasets = this.claimDatasets(siteData);

        let dataGroups = siteData.data_groups.filter((dataGroup) => {
			return dataGroup.method_ids.includes(this.methodIds[0]);
		});

        if(methodDatasets.length == 0) {
            return;
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
			}
		];
		let rows = [];

		dataGroups.forEach(dataGroup => {
            let subTableColumns = [
				{
					//title: "Dendro lookup id",
					title: "Value class id",
					hidden: true
				},
				{
					title: "Measurement type",
					role: "key"
				},
				{
					title: "Measurement value",
					role: "value"
				},
				{
					title: "data",
					hidden: true,
					exclude_from_export: true
				}
			];


            let subTableRows = [];
			dataGroup.values.forEach(dgValue => {
				let value = dgValue.value;
				let tooltip = "";

				subTableRows.push([
					{
						type: "cell",
						value: dgValue.valueClassId
					},
					{
						type: "cell",
						value: dgValue.key,
						tooltip: this.getMethodDescription(siteData, "adna", dgValue.valueClassId).description
					},
					{
						type: "cell",
						value: value,
						tooltip: tooltip
					},
					{
						type: "data",
						value: dgValue.value == "complex" ? dgValue.data : dgValue.value
					}
				]);
			});
			
			let subTable = {
				"meta": {
					dataStructure: "key-value"
				},
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
				}
			]);

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

        let contentItem = {
			"name": "aDNA",
			"title": "Ancient DNA samples",
			"datasetReference": this.sqs.renderBiblioReference(siteData, datasetBiblioIds, true),
			"datasetReferencePlain": this.sqs.renderBiblioReference(siteData, datasetBiblioIds, false),
			"datasetContacts": this.sqs.renderContacts(siteData, datasetContacts),
			"titleTooltip": "Name of the dataset",
			"datasetId": 0,
			"methodId": 10,
			"data": {
				"columns": columns,
				"rows": rows,
				"dataGroups": dataGroups
			},
			"renderOptions": [
				{
					"name": "Spreadsheet",
					"selected": "table",
					"type": "table"
				},
            ],
        };

        let analysisMethod = null;
		for(let key in siteData.lookup_tables.methods) {
			if(siteData.lookup_tables.methods[key].method_id == this.methodIds[0]) {
				analysisMethod = siteData.lookup_tables.methods[key];
			}
		}

        let analysisMethodDescription = "";
		if(analysisMethod) {
			analysisMethodDescription = "<h4 class='tooltip-header'>"+analysisMethod.method_name+"</h4>"+analysisMethod.method_abbrev_or_alt_name+"<hr>"+analysisMethod.description;
		}

        let section = {
			"name": analysisMethod.method_id,
			"title": "Ancient DNA",
			"methodId": analysisMethod.method_id,
			"methodDescription": analysisMethodDescription,
			"collapsed": true,
			"contentItems": [contentItem]
		};

		sections.push(section);
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

export { AdnaDataset as default }