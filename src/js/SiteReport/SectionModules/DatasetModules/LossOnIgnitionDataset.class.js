import { unset } from "lodash";
import DatasetModule from "./DatasetModule.class";
/*
* Class: LossOnIgnitionDataset
 */

class LossOnIgnitionDataset extends DatasetModule {
	constructor() {
		super();
        this.methodIds = [32];
	}

	destroy() {
	}

	getSectionByMethodId(methodId, sections) {
		for(let key in sections) {
			if(sections[key].name == methodId) {
				return sections[key];
			}
		}
		return null;
	}

	async makeSection(site, sections) {
		
		let analysisMethod = null;
		let methodDatasets = this.claimDatasets(site);

        for(let key in methodDatasets) {
            let dataset = methodDatasets[key];
            for(let k in site.lookup_tables.analysis_methods) {
                if(site.lookup_tables.analysis_methods[k].method_id == dataset.method_id) {
                    analysisMethod = site.lookup_tables.analysis_methods[k];
                }
            }
			if(analysisMethod == null) {
				console.warn("Could not find analysis metadata for", dataset.method_id);
				return;
			}

			let analysisMethodDescription = "";
			if(analysisMethod) {
				analysisMethodDescription = "<h4 class='tooltip-header'>"+analysisMethod.method_name+"</h4>"+analysisMethod.method_abbrev_or_alt_name+"<hr>"+analysisMethod.description;
			}

			let section = this.getSectionByMethodId(analysisMethod.method_id, sections);
			if(!section) {
				section = {
					"name": analysisMethod.method_id,
					"title": analysisMethod.method_name,
					"methodId": analysisMethod.method_id,
					"methodDescription": analysisMethodDescription,
					"collapsed": true,
					"contentItems": []
				};
				sections.push(section);
			}

			let contentItem = {
				"name": dataset.dataset_id,
				"title": dataset.dataset_name,
				"titleTooltip": "Name of the dataset",
				"datasetId": dataset.dataset_id,
				"data": {
					"columns": [],
					"rows": []
				},
				"renderOptions": [
					{
						"name": "Spreadsheet",
						"selected": false,
						"type": "table"
					},
					{
						"name": "Bar chart",
						"selected": true,
						"type": "loi-bar",
						"options": [
							{
								"enabled": false,
								"title": "X axis",
								"type": "select",
								"selected": 0,
								"options": [
									{
										"title": 0,
										"value": 0,
										"selected": true
									},
									{
										"title": 1,
										"value": 1,
										"selected": false
									},
								]
							},
							{
								"enabled": false,
								"title": "Y axis",
								"type": "select",
								"selected": 1,
								"options": [
									{
										"title": 0,
										"value": 0,
										"selected": false
									},
									{
										"title": 1,
										"value": 1,
										"selected": true
									},
								]
							},
							{
								"enabled": false,
								"title": "Sort",
								"type": "select",
								"options": [
									{
										"title": 0,
										"value": 0,
									},
									{
										"title": 1,
										"value": 1,
										"selected": true
									},
								]
							}
						]
					}
				]
			};
	
			contentItem.data.columns = [
				{
					"dataType": "string",
					"pkey": true,
					"title": "Sample name"
				},
				{
					"dataType": "string",
					"pkey": false,
					"title": "Value"
				},
			];

            let series = [];

            dataset.analysis_entities.sort((ae1, ae2) => {
                return ae1.physical_sample_id > ae2.physical_sample_id;
            });

            for(let key in dataset.analysis_entities) {
                let ae = dataset.analysis_entities[key];
                series.push([
                    ae.physical_sample_id,
                    parseFloat(ae.measured_values[0].measured_value)
                ]);
            }

            for(let key in series) {
				let unit = analysisMethod.unit.unit_abbrev;
				let value = series[key][1] == null ? "null" : series[key][1];
				contentItem.data.rows.push([
					{
						"type": "cell",
						"tooltip": "",
						"value": series[key][0]
					},
					{
						"type": "cell",
						"tooltip": "",
						"unit": unit,
						"value": value,
					},
				]);
            }
			
			section.contentItems.push(contentItem);
		}
	}

    getAnalysisEntityByPhysicalSampleId(analysisEntities, physicalSampleId) {
        for(let aePartnerKey in analysisEntities) {
            if(analysisEntities[aePartnerKey].physical_sample_id == physicalSampleId) {
                return analysisEntities[aePartnerKey];
            }
        }
        return null;
    }

}

export { LossOnIgnitionDataset as default }