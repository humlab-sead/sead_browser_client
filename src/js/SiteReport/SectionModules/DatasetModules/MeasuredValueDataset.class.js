/*
* Class: MeasuredValueDataset
 */

class MeasuredValueDataset {
	constructor(analysis) {
		this.hqs = analysis.hqs;
		this.analysis = analysis;
		this.section = analysis.section;
		this.data = analysis.data;
		this.analyses = [];
		this.datasetFetchPromises = [];
		this.datasets = [];
		this.buildIsComplete = false;
	}

	offerAnalyses(datasets) {
		for(let key = datasets.length - 1; key >= 0; key--) {
			if(datasets[key].methodGroupId == 2) {
				//console.log("MeasuredValueDataset claiming ", datasets[key].datasetId);
				let dataset = datasets.splice(key, 1)[0];
				this.datasets.push(dataset);
			}
		}

		return new Promise((resolve, reject) => {
			for(let key in this.datasets) {
				let p = this.analysis.fetchAnalysis(this.datasets[key]);
				this.datasetFetchPromises.push(p);
				p = this.fetchDataset(this.datasets[key]);
				this.datasetFetchPromises.push(p);
			}
			
			Promise.all(this.datasetFetchPromises).then(() => {
				if(this.datasets.length > 0) {
					this.buildSection(this.datasets);
				}
				resolve();
			});
		});
	}
	
	destroy() {
	}
	
	async fetchDataset(dataset) {
		await new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/qse_dataset?dataset_id=eq."+dataset.datasetId, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					dataset.dataPoints = data;
					await this.requestMetaDataForDataset(dataset);
					resolve();
				}
			});
		});
	}


	async requestMetaDataForDataset(dataset) {
		await this.analysis.fetchSampleType(dataset);
	}

	
	buildSection(datasets) {
		for(let key in datasets) {
			this.appendDatasetToSection(datasets[key]);
		}
		
		this.buildIsComplete = true;
		this.hqs.hqsEventDispatch("siteAnalysisBuildComplete");
	}

	appendDatasetToSection(dataset) {
		var analysis = dataset;
		
		//This is the section we're parsing into (or creating)
		var sectionKey = this.hqs.findObjectPropInArray(this.section.sections, "name", analysis.methodId);
		
		var method = null;
		for(var key in this.analysis.meta.methods) {
			if(this.analysis.meta.methods[key].method_id == analysis.methodId) {
				method = this.analysis.meta.methods[key];
			}
		}
		
		if(sectionKey === false) {
			var sectionsLength = this.section.sections.push({
				"name": analysis.methodId,
				"title": analysis.methodName,
				"methodDescription": method == null ? "" : method.description,
				"collapsed": true,
				"contentItems": []
			});
			sectionKey = sectionsLength - 1;
		}
		
		//Defining columns
		var columns = [
			{
				"dataType": "number",
				"pkey": true,
				"title": "Analysis entitiy id"
			},
			{
				"dataType": "number",
				"pkey": false,
				"title": "Sample name"
			},
			{
				"dataType": "number",
				"pkey": false,
				"title": "Sample group"
			},
			{
				"dataType": "number",
				"pkey": false,
				"title": "Sample type"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Measured value"
			}
		];
		
		//Filling up the rows
		var rows = [];
		for(var k in analysis.dataPoints) {
			
			var row = [
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataPoints[k].analysis_entity_id
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataPoints[k].sample_name
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataPoints[k].sample_group_id
				},
				{
					"type": "cell",
					"tooltip": analysis.dataPoints[k].sample_type.description,
					"value": analysis.dataPoints[k].sample_type.type_name
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataPoints[k].measured_value
				}
			];
			rows.push(row);
		}
		
		//Defining the contentItem
		let contentItem = {
			"name": analysis.datasetId,
			"title": analysis.datasetName,
			"datasetId": analysis.datasetId,
			"data": {
				"columns": columns,
				"rows": rows
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
							"title": "X axis",
							"type": "select",
							"selected": 1,
							"options": [1, 2, 3, 4]
						},
						{
							"title": "Y axis",
							"type": "select",
							"selected": 4,
							"options": [1, 2, 3, 4]
						},
						{
							"title": "Sort",
							"type": "select",
							"selected": 4,
							"options": [1, 2, 3, 4]
						}
					]/*,
					"options": {
						"xAxis": 1,
						"yAxis": 5,
						"sort": 5
					}*/
				}
			]
		};
		this.section.sections[sectionKey].contentItems.push(contentItem);
		this.buildIsComplete = true;
		this.hqs.hqsEventDispatch("siteAnalysisBuildComplete");
	}
	
	isBuildComplete() {
		return this.buildIsComplete;
	}
}

export { MeasuredValueDataset as default }