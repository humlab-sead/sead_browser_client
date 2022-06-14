import DatasetModule from "./DatasetModule.class";
/*
* Class: MeasuredValueDataset
 */

class MeasuredValueDataset extends DatasetModule {
	constructor() {
		super();
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

	makeSection(siteData, sections) {
		let dataGroups = siteData.data_groups.filter((dataGroup) => {
			return dataGroup.type == "measured_values";
		});

		dataGroups.forEach(dataGroup => {

			let analysisMethod = null;
			for(let key in siteData.analysis_methods) {
				if(siteData.analysis_methods[key].method_id == dataGroup.method_id) {
					analysisMethod = siteData.analysis_methods[key];
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

			dataGroup.data_points.forEach((data_point => {
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