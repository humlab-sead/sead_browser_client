
/*
* Class: LoiDataset
 */

import shortid from "shortid";

class LoiDataset {
	constructor(analysis) {
		this.hqs = analysis.hqs;
		this.analysis = analysis;
		this.section = analysis.section;
		this.data = analysis.data;
	}
	
	offerAnalysis(analysisJSON) {
		this.analysisData = JSON.parse(analysisJSON);
		var claimed = false;
		
		if(this.analysisData.methodId == 32) { //Method id 32 = Loss on ignition
			//console.log("LoiDataset claiming", this.analysisData);
			claimed = true;
			this.fetchDataset();
		}
		
		return claimed;
	}
	
	/*
	* Function: fetchDataset
	*
	* Gets the bloody samples. FIXME: PROBLEM IS: This is really only valid for MAL & Bugs data, what about dendro and ceramics and shit?
	* I think we're gonna need different API/fetch-functions for different kinds of datasets, that's what I reckon mate.
	*
	* Parameters:
	* datasetId
	 */
	fetchDataset() {
		var xhr1 = this.hqs.pushXhr(null, "fetchSiteAnalyses");
		
		xhr1.xhr = $.ajax(this.hqs.config.siteReportServerAddress+"/qse_dataset?dataset_id=eq."+this.analysisData.datasetId, {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				//These are datapoints in the dataset
				var analysisKey = this.hqs.findObjectPropInArray(this.analysis.data.analyses, "datasetId", this.analysisData.datasetId);
				this.analysis.data.analyses[analysisKey].dataset = data;
				
				this.hqs.popXhr(xhr1);
				this.buildSection();
			}
		});
		
		return xhr1;
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
				"title": "Sample id"
			},
			{
				"dataType": "number",
				"pkey": false,
				"title": "Sample group"
			},
			{
				"dataType": "number",
				"pkey": false,
				"title": "Measured value"
			},
			{
				"dataType": "number",
				"pkey": false,
				"title": "Sample type id"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Sample name"
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
					"value": analysis.dataset[k].physical_sample_id
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataset[k].sample_group_id
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataset[k].measured_value
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataset[k].sample_type_id
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataset[k].sample_name
				}
			];
			rows.push(row);
		}
		
		//Defining the contentItem
		this.section.sections[sectionKey].contentItems.push({
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
					"options": {
						"xAxis": 1,
						"yAxis": 3
					}
				}
			]
		});
		
	}
}

export { LoiDataset as default }