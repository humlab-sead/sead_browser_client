
/*
* Class: PlantMacrofossilDataset
 */

class PlantMacrofossilDataset {
	constructor(analysis) {
		this.hqs = analysis.hqs;
		this.analysis = analysis;
		this.section = analysis.section;
		this.data = analysis.data;
		this.taxonPromises = [];
		
	}
	
	offerAnalysis(analysisJSON) {
		this.analysisData = JSON.parse(analysisJSON);
		var claimed = false;
		
		if(this.analysisData.methodId == 8) { //Method id 8 = Plant macrofossil analyses
			//console.log("PlantMacrofossilDataset claiming", this.analysisData);
			claimed = true;
			
			this.blockingXhr = this.hqs.pushXhr(null, "fetchSiteAnalyses");  //This is stupid...
			this.hqs.hqsEventListen("fetchPMF", () => {
				this.buildSection();
				this.hqs.popXhr(this.blockingXhr); //More of the same stupidity... but it works!
			}, this);
			
			this.fetchDataset();
		}
		
		return claimed;
	}
	
	/*
	* Function: fetchDataset
	*
	* Gets the bloody samples.
	* Also need to fetch taxon-info for this since it's an abundance counting type of method, yes sir it is sir indeed sir.
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
				
				for(var key in data) {
					var dataset = this.analysis.data.analyses[analysisKey].dataset[key];
					var taxonId = data[key].abundance_taxon_id;
					
					this.taxonPromises[taxonId] = this.hqs.pushXhr(null, "fetchPMF");
					this.taxonPromises[taxonId].xhr = this.hqs.siteReportManager.siteReport.getTaxon(taxonId);
					
					this.taxonPromises[taxonId].xhr.then((taxon) => {
						//dataset.taxonData = taxon[0];
						
						//var analysisKey = this.hqs.findObjectPropInArray(this.analysis.data.analyses, "datasetId", this.analysisData.datasetId);
						//this.analysis.data.analyses[analysisKey].push(taxon[0]);
						
						this.applyTaxon(taxon[0]);
						this.hqs.popXhr(this.taxonPromises[taxon[0].taxon_id]);
					});
				}
				
				this.hqs.popXhr(xhr1);
			}
		});
		
		return xhr1;
	}
	
	getDataset() {
		var analysisKey = this.hqs.findObjectPropInArray(this.analysis.data.analyses, "datasetId", this.analysisData.datasetId);
		return this.analysis.data.analyses[analysisKey].dataset;
	}
	
	applyTaxon(taxon) {
		var ds = this.getDataset();
		for(var key in ds) {
			if(ds[key].abundance_taxon_id == taxon.taxon_id) {
				ds[key].taxon = taxon;
			}
		}
	}
	
	buildSection() {
		var analysisKey = this.hqs.findObjectPropInArray(this.data.analyses, "datasetId", this.analysisData.datasetId)
		
		//This is the analysis in raw-data-structure form that we want to parse into formalized form
		var analysis = this.data.analyses[analysisKey];
		
		console.log(analysis)
		
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
				"collapsed": false,
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
				"title": "Abundance"
			},
			{
				"dataType": "number",
				"pkey": false,
				"title": "Abundance taxon id"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Taxon"
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
			
			var taxonFormatted = analysis.dataset[k].taxon.family_name+", ";
			taxonFormatted += analysis.dataset[k].taxon.genus_name+", ";
			taxonFormatted += analysis.dataset[k].taxon.species;

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
					"value": analysis.dataset[k].abundance
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataset[k].abundance_taxon_id
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": taxonFormatted
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
					"selected": false,
					"type": "bar",
					"options": {
						"xAxis": 4,
						"yAxis": 3
					}
				},
				{
					"name": "Pie chart",
					"selected": true,
					"type": "pie",
					"options": {
						"dimension": 5
					}
				}
			]
		});
		
		console.log("PMF build complete");
	}

}

export { PlantMacrofossilDataset as default }