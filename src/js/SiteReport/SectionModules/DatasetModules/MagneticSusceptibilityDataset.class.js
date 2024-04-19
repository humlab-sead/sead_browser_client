import { unset } from "lodash";
import DatasetModule from "./DatasetModule.class";
/*
* Class: MagneticSusceptibilityDataset
 */

class MagneticSusceptibilityDataset extends DatasetModule {
	constructor(analysis) {
		super(analysis);
        this.methodIds = [33];
		this.sqs = analysis.sqs;
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
            for(let k in site.lookup_tables.methods) {
                if(site.lookup_tables.methods[k].method_id == dataset.method_id) {
                    analysisMethod = site.lookup_tables.methods[k];
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
				"datasetReference": this.sqs.renderBiblioReference(site, dataset.biblio_id == null ? [] : [dataset.biblio_id]),
				"datasetReferencePlain": this.sqs.renderBiblioReference(site, dataset.biblio_id == null ? [] : [dataset.biblio_id], false),
				"datasetContacts": this.sqs.renderContacts(site, dataset.contacts),
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
						"type": "ms-bar",
						"options": [
							{
								"enabled": false,
								"title": "X axis",
								"type": "select",
								"selected": 0,
								"options": [
									{
										"title": 1,
										"value": 1,
										"selected": true
									},
									{
										"title": 2,
										"value": 2,
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
										"title": 1,
										"value": 1,
										"selected": false
									},
									{
										"title": 2,
										"value": 2,
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
										"title": 1,
										"value": 1,
									},
									{
										"title": 2,
										"value": 2,
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
					"hidden": true,
					"title": "Sample ID"
				},
				{
					"dataType": "string",
					"pkey": false,
					"title": "Sample name"
				},
				{
					"dataType": "string",
					"pkey": false,
					"title": "Unburned"
				},
				{
					"dataType": "string",
					"pkey": false,
					"title": "Burned"
				},
			];

            let unburnedSeries = [];
            let burnedSeries = [];
			//since this is ms - there should be pars of values/AEs, one with a prepMethod and one without, both connected to the sample physical_sample
            //these needs to be paired up in 2 series

			dataset.analysis_entities.forEach((ae) => {
				if(ae.prepMethods.length > 0 && ae.prepMethods.includes(82)) {
					burnedSeries.push([
						ae.physical_sample_id,
						parseFloat(ae.measured_values[0].measured_value)
					]);
				} else {
					unburnedSeries.push([
						ae.physical_sample_id,
						parseFloat(ae.measured_values[0].measured_value)
					]);
				}
			});

			//sort the series (by physical_sample_id)
			unburnedSeries.sort((a, b) => {
				return a[0] - b[0];
			});
			burnedSeries.sort((a, b) => {
				return a[0] - b[0];
			});

			let physicalSampleIds = new Set();
			unburnedSeries.forEach((seriesItem) => {
				physicalSampleIds.add(seriesItem[0]);
			});
			burnedSeries.forEach((seriesItem) => {
				physicalSampleIds.add(seriesItem[0]);
			});

			physicalSampleIds.forEach((physicalSampleId) => {
				let unburnedValue = "N/A";
				let burnedValue = "N/A";

				//find sample name based on physical_sample_id
				let physicalSample = this.getPhysicalSampleByPhysicalSampleId(site, physicalSampleId)
				let sampleName = physicalSample.sample_name;
				
				//find the unburned value
				let unburnedSeriesItem = unburnedSeries.find((seriesItem) => {
					return seriesItem[0] == physicalSampleId;
				});
				if(unburnedSeriesItem) {
					unburnedValue = unburnedSeriesItem[1];
				}

				//find the burned value
				let burnedSeriesItem = burnedSeries.find((seriesItem) => {
					return seriesItem[0] == physicalSampleId;
				});
				if(burnedSeriesItem) {
					burnedValue = burnedSeriesItem[1];
				}

				contentItem.data.rows.push([
					{
						"type": "cell",
						"tooltip": "",
						"value": physicalSampleId
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": sampleName
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": unburnedValue,
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": burnedValue,
					},
				]);
			});
			
			section.contentItems.push(contentItem);
		}
	}

	getPhysicalSampleByPhysicalSampleId(siteData, physicalSampleId) {
		let selectedSample = null;
		siteData.sample_groups.forEach((sg) => {
			sg.physical_samples.forEach((sample) => {
				if(sample.physical_sample_id == physicalSampleId) {
					selectedSample = sample;
				}
			});
		});
		return selectedSample;
	}

    getAnalysisEntityByPhysicalSampleId(analysisEntities, physicalSampleId) {
        for(let aePartnerKey in analysisEntities) {
            if(analysisEntities[aePartnerKey].physical_sample_id == physicalSampleId) {
                return analysisEntities[aePartnerKey];
            }
        }
        return null;
    }

	async makeSectionOLD(siteData, sections) {
		let dataGroups = siteData.data_groups.filter((dataGroup) => {
			return dataGroup.type == "measured_values";
		});

		dataGroups.forEach(dataGroup => {

			let analysisMethod = null;
			for(let key in siteData.lookup_tables.methods) {
				if(siteData.lookup_tables.methods[key].method_id == dataGroup.method_id) {
					analysisMethod = siteData.lookup_tables.methods[key];
				}
			}
			
			let analysisMethodDescription = "";
			if(analysisMethod) {
				analysisMethodDescription = "<h4 class='tooltip-header'>"+analysisMethod.method_name+"</h4>"+analysisMethod.method_abbrev_or_alt_name+"<hr>"+analysisMethod.description;
			}

			let section = this.getSectionByMethodId(dataGroup.method_id, sections);
			if(!section) {
				section = {
					"name": dataGroup.method_id,
					"title": dataGroup.method_name,
					//"methodDescription": dataGroup.method_name,
					"methodDescription": analysisMethodDescription,
					"collapsed": true,
					"contentItems": []
				};
				sections.push(section);
			}

			let contentItem = {
				"name": dataGroup.id,
				"title": dataGroup.dataset_name,
				"titleTooltip": "Name of the dataset",
				"datasetId": dataGroup.id,
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
						"type": "bar",
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

			dataGroup.datasets.forEach((data_point => {
				contentItem.data.rows.push([
					{
						"type": "cell",
						"tooltip": "",
						"value": data_point.sample_name
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": data_point.value
					},
				]);
			}));

			section.contentItems.push(contentItem);

		});
	}

}

export { MagneticSusceptibilityDataset as default }