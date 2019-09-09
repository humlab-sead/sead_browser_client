/*
* Class: MeasuredValueDataset
 */

class MeasuredValueDataset {
	constructor(analysis) {
		this.hqs = analysis.hqs;
		this.analysis = analysis;
		this.section = analysis.section;
		this.data = analysis.data;
		this.buildIsComplete = false;
	}
	
	offerAnalysis(analysisJSON) {
		this.analysisData = JSON.parse(analysisJSON);
		var claimed = false;
		
		if (this.analysisData.methodGroupId == 2) { //All in MethodGroupId id 2 = Measured value
			//console.log("MeasuredValueDataset Claimed ", this.analysisData)
			claimed = true;
			this.fetchDataset();
		}
		
		return claimed;
	}
	
	destroy() {
	}
	
	fetchDataset() {
		
		var xhr1 = this.hqs.pushXhr(null, "fetchSiteAnalyses");
		
		xhr1.xhr = $.ajax(this.hqs.config.siteReportServerAddress+"/qse_dataset?dataset_id=eq."+this.analysisData.datasetId, {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				//These are datapoints in the dataset
				var analysisKey = this.hqs.findObjectPropInArray(this.analysis.data.analyses, "datasetId", this.analysisData.datasetId);
				this.analysis.data.analyses[analysisKey].dataset = data;
				
				this.requestMetaDataForDataset(data);

				this.hqs.popXhr(xhr1);
				//this.buildSection();
			}
		});
		
		return xhr1;
	}


	requestMetaDataForDataset(dataset) {

		let promises = [];
		promises = promises.concat(this.analysis.fetchSampleType(dataset));
		
		Promise.all(promises).then((values) => {
			this.buildSection();
		});
	}

	
	buildSection() {
		var analysisKey = this.hqs.findObjectPropInArray(this.data.analyses, "datasetId", this.analysisData.datasetId)
		
		//This is the analysis in raw-data-structure form that we want to parse into formalized form
		var analysis = this.data.analyses[analysisKey];
		
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
		for(var k in analysis.dataset) {
			
			var row = [
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataset[k].analysis_entity_id
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataset[k].sample_name
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataset[k].sample_group_id
				},
				{
					"type": "cell",
					"tooltip": analysis.dataset[k].sample_type.description,
					"value": analysis.dataset[k].sample_type.type_name
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataset[k].measured_value
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