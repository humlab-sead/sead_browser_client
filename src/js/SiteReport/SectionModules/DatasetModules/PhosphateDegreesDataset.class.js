
/*
* Class: PhosphateDegreesDataset
 */

class PhosphateDegreesDataset {
	constructor(analysis) {
		this.hqs = analysis.hqs;
		this.analysis = analysis;
		this.section = analysis.section;
		this.data = analysis.data;
	}
	
	offerAnalysis(analysisJSON) {
		this.analysisData = JSON.parse(analysisJSON);
		var claimed = false;
		
		if(this.analysisData.methodId == 37) {
			//console.log("PhosphateDegreesDataset claiming", this.analysisData);
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
				//this.buildSection();
			}
		});
		
		return xhr1;
	}
	
	buildSection() {
		
	}
}

export { PhosphateDegreesDataset as default }