
/*
* Class: GenericDataset
*
* DatasetModule
 */

import shortid from "shortid";

class GenericDataset {
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
		
		if(this.analysisData.dataTypeId == 5) { //Abundance
			claimed = true;
		}
		if(this.analysisData.dataTypeId == 6) { //Presence
			claimed = true;
		}
		if(this.analysisData.dataTypeId == 7) { //Spot test interpretation (1, 2 or 3 where 3 is highest)
			claimed = true;
		}
		if(this.analysisData.dataTypeId == 8) { //Continuous
			claimed = true;
		}
		if(this.analysisData.dataTypeId == 9) { //Minimum number of individual organisms (MNI)
			claimed = true;
		}
		if(this.analysisData.dataTypeId == 10) { //Partial abundance
			claimed = true;
		}
		if(this.analysisData.dataTypeId == 13) { //Undefined other
			claimed = true;
		}
		if(this.analysisData.dataTypeId == 14) { //Uncalibrated dates
			claimed = true;
		}
		if(this.analysisData.dataTypeId == 15) { //Counted dates
			claimed = true;
		}

		claimed = true; //This module will always happily accept all datasets

		if(claimed) {
			//console.log("GenericDataset claiming", this.analysisData);
			return this.fetchDataset();
		}
		
		return false;
	}


	
	destroy() {
	
	}
	
	isBuildComplete() {
		return this.buildIsComplete;
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
	async fetchDataset() {
		await new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/qse_dataset?dataset_id=eq."+this.analysisData.datasetId, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					//These are datapoints in the dataset
					var analysisKey = this.hqs.findObjectPropInArray(this.analysis.data.analyses, "datasetId", this.analysisData.datasetId);
					this.analysis.data.analyses[analysisKey].dataset = data;
					this.buildSection();
					resolve();
				}
			});
		});
	}
	
	
	buildSection() {
		var analysisKey = this.hqs.findObjectPropInArray(this.data.analyses, "datasetId", this.analysisData.datasetId)
		
		//This is the analysis in raw-data-structure form that we want to parse into formalized form
		var analysis = this.data.analyses[analysisKey];
		
		//This is the section we're parsing into (or creating)
		var sectionKey = this.hqs.findObjectPropInArray(this.section.sections, "name", analysis.methodId);
		
		var warningTooltipId = "sr-warning-tt-"+shortid.generate();
		if(sectionKey === false) {
			var sectionsLength = this.section.sections.push({
				"name": analysis.methodId,
				"title": analysis.methodName+"&nbsp;&nbsp;<i id='"+warningTooltipId+"' class=\"fa fa-exclamation-triangle site-report-analysis-unknown-warning\" aria-hidden=\"true\"></i>",
				"collapsed": true,
				"contentItems": []
			});
			sectionKey = sectionsLength - 1;
		}
		
		this.hqs.tooltipManager.registerTooltip("#"+warningTooltipId, "This is an unknown type of analysis. The data is presented in a raw format.");
		
		
		var colNames = Object.keys(analysis.dataset[0]); //Hmm... 0? Are we having this conversation again...?
		
		var length = this.section.sections[sectionKey].contentItems.push({
			"name": analysis.datasetId,
			"title": analysis.datasetName,
			"data": {
				"columns": [],
				"rows": []
			},
			"renderOptions": [{
				"selected": true,
				"type": "table"
			}]
		});
		
		var ciKey = length-1;
		
		for(var colKey in colNames) {
			this.section.sections[sectionKey].contentItems[ciKey].data.columns.push({
				"dataType": "string",
				"pkey": colNames[colKey] == "analysis_entity_id" ? true : false,
				"title": colNames[colKey]
			});
		}
		
		
		for(var k in analysis.dataset) {
			
			var row = [];
			for(var colKey in colNames) {
				row.push({
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataset[k][colNames[colKey]]
				});
			}
			
			this.section.sections[sectionKey].contentItems[ciKey].data.rows.push(row);
		}
		
		this.buildIsComplete = true;
		this.hqs.hqsEventDispatch("siteAnalysisBuildComplete");
	}
	
}

export { GenericDataset as default }