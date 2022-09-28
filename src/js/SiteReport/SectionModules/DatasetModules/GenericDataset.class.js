import DatasetModule from "./DatasetModule.class";
import { nanoid } from "nanoid";
/**
* Class: GenericDataset
*
* DatasetModule
* 
* This is a fall-back module that will capture all types of analyses/datasets which no other module claims and try to present some sort of basic rendering of some of the data.
*
*/

class GenericDataset extends DatasetModule {
	constructor(analysis) {
		super();
		this.sqs = analysis.sqs;
		this.analysis = analysis;
		this.section = analysis.section;
		this.data = analysis.data;
		this.analyses = [];
		this.datasetFetchPromises = [];
		this.datasets = [];
		this.buildIsComplete = false;
	}
	
	/**
	 * Function: isBuildComplete
	 * 
	 * Don't think this function is used anymore.
	 */
	isBuildComplete() {
		return this.buildIsComplete;
	}


	getSectionByMethodId(methodId, sections) {
		for(let key in sections) {
			if(sections[key].name == methodId) {
				return sections[key];
			}
		}
		return null;
	}
	
	makeSection(site, sections) {
		let analysisMethod = null;
		let methodDatasets = site.datasets; //claim ALL that remains

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

			console.log("GenericDataset rendering method", analysisMethod.method_id)
			let section = this.getSectionByMethodId(analysisMethod.method_id, sections);
			if(!section) {
				section = {
					"name": analysisMethod.method_id,
					"title": analysisMethod.method_name,
					"methodId": analysisMethod.method_id,
					"methodDescription": analysisMethodDescription,
					"collapsed": true,
					"warning": true,
					"warningText": "SEAD currently lacks the module to render this data properly.",
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
						"selected": true,
						"type": "table"
					},
					
				]
			};
	
			contentItem.data.columns = [
				{
					"dataType": "string",
					"pkey": true,
					"title": "Sample ID"
				},
				{
					"dataType": "string",
					"pkey": false,
					"title": "Analysis entity ID"
				},
			];

			dataset.analysis_entities.forEach(ae => {
				contentItem.data.rows.push([
					{
						"type": "cell",
						"tooltip": "",
						"value": ae.physical_sample_id
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": ae.analysis_entity_id
					},
				]);
			});
			

			section.contentItems.push(contentItem);
		}
	}

	/**
	 * Function: destroy
	 * 
	 * Maybe this will be used for something one day...
	 */
	destroy() {
	}
	
}

export { GenericDataset as default }