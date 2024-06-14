import DatasetModule from "./DatasetModule.class";
/*
* Class: MeasuredValueDataset
 */

class MeasuredValueDataset extends DatasetModule {
	constructor(analysis) {
		super(analysis);
		this.methodIds = [37, 74, 106];
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
				"methodId": analysisMethod.method_id,
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
								"selected": 1,
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
								"selected": 2,
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
					"title": "Sample name"
				},
				{
					"dataType": "string",
					"pkey": false,
					"title": "Value"
				},
			];


			if(analysisMethod.method_id == 33) {
				//if this is ms - there should be pars of values/AEs, one with a prepMethod and one without, both connected to the sample physical_sample
				//these needs to be paired up in 2 series
			}

			dataset.analysis_entities.forEach(ae => {
				
				let value = null;
				if(typeof ae.measured_values != "undefined" && ae.measured_values.length > 0) {
					value = parseFloat(ae.measured_values[0].measured_value);
				}
				
				let sample = this.getPhysicalSampleByPhysicalSampleId(site, ae.physical_sample_id);

				contentItem.data.rows.push([
					{
						"type": "cell",
						"tooltip": "",
						"value": ae.physical_sample_id
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": sample.sample_name
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": value
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
					"methodId": analysisMethod.method_id,
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

export { MeasuredValueDataset as default }