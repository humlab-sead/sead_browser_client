import { unset } from "lodash";
import DatasetModule from "./DatasetModule.class";
/*
* Class: MagneticSusceptibilityDataset
 */

class MagneticSusceptibilityDataset extends DatasetModule {
	constructor() {
		super();
        this.methodIds = [33];
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

	makeSection(site, sections) {
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
						"type": "ms-bar",
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

			/* NOTE: This is what should be the correct code! But it's swapped in the database so the AEs that are NOT connected to the 550-prepMethod are actually the ones that are burned...
				so this is commented out and we use the below reversed code instead
            let burnedAnalysisEntities = dataset.analysis_entities.filter((ae) => {
                return ae.prepMethods.length > 0 && ae.prepMethods.includes(82);
            });

            let unburnedAnalysisEntities = dataset.analysis_entities.filter((ae) => {
                return ae.prepMethods.length < 1 || !ae.prepMethods.includes(82);
            });
			*/

			if(dataset.dataset_id == 3) {
				console.log(dataset.analysis_entities);
			}

			let unburnedAnalysisEntities = dataset.analysis_entities.filter((ae) => {
                return ae.prepMethods.length > 0 && ae.prepMethods.includes(82);
            });

            let burnedAnalysisEntities = dataset.analysis_entities.filter((ae) => {
                return ae.prepMethods.length < 1 || !ae.prepMethods.includes(82);
            });
			//End of reversed code

            unburnedAnalysisEntities.sort((ae1, ae2) => {
                return ae1.physical_sample_id > ae2.physical_sample_id;
            });

            burnedAnalysisEntities.sort((ae1, ae2) => {
                return ae1.physical_sample_id > ae2.physical_sample_id;
            });

            //console.log(burnedAnalysisEntities);
            //console.log(unburnedAnalysisEntities);

            for(let key in unburnedAnalysisEntities) {
                unburnedSeries.push([
                    unburnedAnalysisEntities[key].physical_sample_id,
                    parseFloat(unburnedAnalysisEntities[key].measured_values[0].measured_value)
                ]);

                let partnerValue = null;

                let partnerAe = this.getAnalysisEntityByPhysicalSampleId(burnedAnalysisEntities, unburnedAnalysisEntities[key].physical_sample_id);
                if(partnerAe) {
                    partnerValue = parseFloat(partnerAe.measured_values[0].measured_value);
                }

                burnedSeries.push([
                    unburnedAnalysisEntities[key].physical_sample_id,
                    partnerValue
                ]);
                //console.log(unburnedAnalysisEntities[key].physical_sample_id+" - "+burnedAnalysisEntities[key].physical_sample_id);
            }


            //NOTE NOTE NOTE: burned and unburned seems to be swapped!! but we're gonna ignore that for now
            for(let key in unburnedSeries) {
                //console.log(unburnedSeries[key], burnedSeries[key]);

				let unit = analysisMethod.unit.unit_abbrev;

				let unburnedValue = unburnedSeries[key][1] == null ? "null" : unburnedSeries[key][1];
				let burnedValue = burnedSeries[key][1] == null ? "null" : burnedSeries[key][1];

				contentItem.data.rows.push([
					{
						"type": "cell",
						"tooltip": "",
						"value": unburnedSeries[key][0]
					},
					{
						"type": "cell",
						"tooltip": "",
						"unit": unit,
						"value": unburnedValue,
					},
					{
						"type": "cell",
						"tooltip": "",
						"unit": unit,
						"value": burnedValue,
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

	makeSectionOLD(siteData, sections) {
		let dataGroups = siteData.data_groups.filter((dataGroup) => {
			return dataGroup.type == "measured_values";
		});

		dataGroups.forEach(dataGroup => {

			let analysisMethod = null;
			for(let key in siteData.lookup_tables.analysis_methods) {
				if(siteData.lookup_tables.analysis_methods[key].method_id == dataGroup.method_id) {
					analysisMethod = siteData.lookup_tables.analysis_methods[key];
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