
/*
* Class: AbundanceDataset
 */

class AbundanceDataset {
	constructor(analysis) {
		this.hqs = analysis.hqs;
		this.analysis = analysis;
		this.section = analysis.section;
		this.data = analysis.data;
		this.taxonPromises = [];
		this.buildIsComplete = false;
	}
	
	offerAnalysis(analysisJSON) {
		this.analysisData = JSON.parse(analysisJSON);
		var claimed = false;
		
		if(this.analysisData.methodGroupId == 1) { //All in MethodGroupId id 1 = Abundance
			//console.log("AbundanceDataset Claimed ", this.analysisData)
			claimed = true;
			this.fetchDataset();
		}
		
		return claimed;
	}
	
	destroy() {
		this.hqs.hqsEventUnlisten("taxaFetchingComplete-"+this.analysisData.datasetId, this);
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
				
				this.requestMetaDataForDataset(data);

				this.hqs.popXhr(xhr1);
			}
		});
		
		return xhr1;
	}
	
	getDataset() {
		var analysisKey = this.hqs.findObjectPropInArray(this.analysis.data.analyses, "datasetId", this.analysisData.datasetId);
		return this.analysis.data.analyses[analysisKey].dataset;
	}
	
	requestMetaDataForDataset(dataset) {

		let promises = [];
		promises = promises.concat(this.fetchTaxa(dataset));
		promises = promises.concat(this.fetchAbundanceIdentificationLevel(dataset));
		promises = promises.concat(this.fetchAbundanceModifications(dataset));
		promises = promises.concat(this.analysis.fetchSampleType(dataset));


		
		Promise.all(promises).then((values) => {
			this.buildSection();
		});
	}

	async fetchTaxa(dataset) {
		var taxonIds = [];
		for(var key in dataset) {
			var taxonId = dataset[key].abundance_taxon_id;
			if (taxonId != null) {
				taxonIds.push(taxonId);
			}
		}

		var taxonPromise = this.hqs.siteReportManager.siteReport.getTaxa(taxonIds);
		taxonPromise.then((taxa) => {
			for(var key in taxa) {
				this.applyTaxon(taxa[key]);
			}
		});

		return taxonPromise;
	}


	async fetchAbundanceIdentificationLevel(dataset) {
		let taxonAbundanceIds = [];
		for(let key in dataset) {
			var taxonId = dataset[key].abundance_taxon_id;
			let abundanceId = dataset[key].abundance_id;
			if (taxonId != null) {
				taxonAbundanceIds.push({
					"taxonId": taxonId,
					"abundanceId": abundanceId
				});
			}
		}

		let promise = this.requestAbundanceIdentificationLevel(taxonAbundanceIds);
		promise.then((identificationLevels) => {
			
			for(let key in identificationLevels) {
				let il = identificationLevels[key];
				for(let dk in dataset) {
					if(dataset[dk].abundance_id == il.abundance_id && dataset[dk].taxon.taxon_id == il.taxon_id) { //FIXME: taxon_id can sometimes be undefined here: AbundanceDataset.class.js:123 Uncaught (in promise) TypeError: Cannot read property 'taxon_id' of undefined
						if(typeof(dataset[dk].taxon.identification_levels) == "undefined") {
							dataset[dk].taxon.identification_levels = [];
						}
						dataset[dk].taxon.identification_levels.push(il);
					}
				}
			}

			//this.hqs.hqsEventDispatch("abundanceIdentificationLevelFetchingComplete-"+this.analysisData.datasetId);
		});

		return promise;
	}

	async requestAbundanceIdentificationLevel(taxonAbundanceIds) {
		let queries = [];
		let itemsLeft = taxonAbundanceIds.length;

		let abundanceId = 0; //FIXME

		let queryString = "(";
		for(let key in taxonAbundanceIds) {
			// (and(taxon_id.eq.18016,abundance_id.eq.55),and(taxon_id.eq.18020,abundance_id.eq.72))
			queryString += "and(abundance_id.eq."+taxonAbundanceIds[key].abundanceId+",taxon_id.eq."+taxonAbundanceIds[key].taxonId+"),";
			if(queryString.length > 1024 && itemsLeft > 1) { //HTTP specs says max 2048
				queryString = queryString.substr(0, queryString.length-1);
				queryString += ")";
				queries.push(queryString);
				queryString = "(";
			}
			itemsLeft--;
		}
		queryString = queryString.substr(0, queryString.length-1);
		queryString += ")";
		queries.push(queryString);

		let queryData = [];
		for(let key in queries) {
			let requestString = this.hqs.config.siteReportServerAddress+"/qse_abundance_identification_levels?or="+queries[key];
			
			let result = await $.ajax(requestString, {
				method: "get",
				dataType: "json",
				success: (data) => {
				}
			});
			for(let i in result) {
				queryData.push(result[i]);
			}
		}

		return queryData;
	}

	async fetchAbundanceModifications(dataset) {
		let abundanceIds = [];
		for(let key in dataset) {
			abundanceIds.push(dataset[key].abundance_id);
		}

		let promise = this.requestAbundanceModifications(abundanceIds);
		promise.then((modifications) => {
			for(let dk in dataset) {
				for(let mk in modifications) {
					if(dataset[dk].abundance_id == modifications[mk].abundance_id) {
						dataset[dk].modifications = [];
						dataset[dk].modifications.push({
							modification_type_id: modifications[mk].modification_type_id,
							modification_type_name: modifications[mk].modification_type_name,
							modification_type_description: modifications[mk].modification_type_description
						});
					}
				}
			}
			//this.hqs.hqsEventDispatch("modificationsFetchingComplete-"+this.analysisData.datasetId);
		});

		return promise;
	}

	async requestAbundanceModifications(abundanceIds) {
		let queries = [];
		let itemsLeft = abundanceIds.length;

		let queryString = "(";
		for(let key in abundanceIds) {
			if(abundanceIds[key] != null) {
				queryString += "abundance_id.eq."+abundanceIds[key]+",";
			}
			else {
				console.log("WARN: Encountered NULL value in abundance ID.");
			}
			if(queryString.length > 1024 && itemsLeft > 1) { //HTTP specs says max 2048
				queryString = queryString.substr(0, queryString.length-1);
				queryString += ")";
				queries.push(queryString);
				queryString = "(";
			}
			itemsLeft--;
		}
		queryString = queryString.substr(0, queryString.length-1);
		queryString += ")";
		queries.push(queryString);

		let queryData = [];
		for(let key in queries) {
			let requestString = this.hqs.config.siteReportServerAddress+"/qse_abundance_modification?or="+queries[key];
			
			let result = await $.ajax(requestString, {
				method: "get",
				dataType: "json",
				success: (data) => {
				}
			});
			for(let i in result) {
				queryData.push(result[i]);
			}
		}

		return queryData;
	}
	
	applyTaxon(taxon) {
		this.taxaComplete = true; //Optimistic presumption
		var ds = this.getDataset();
		for(var key in ds) {
			if(ds[key].abundance_taxon_id == taxon.taxon_id) {
				ds[key].taxon = taxon;
			}
			
			if(typeof(ds[key].taxon) == "undefined") {
				this.taxaComplete = false;
			}
		}
		return this.taxaComplete;
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
				"dataType": "string",
				"pkey": false,
				"title": "Sample name"
			},
			{
				"dataType": "string",
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
				"dataType": "string",
				"pkey": false,
				"title": "Sample type"
			},
            {
                "dataType": "string",
                "pkey": false,
                "title": "Element type"
			},
			{
				"dataType": "string",
                "pkey": false,
                "title": "Modification"
			}
		];
		
		//Filling up the rows
		var rows = [];
		for(var k in analysis.dataset) {
			
			var taxonFormatted = "notaxa";
			if(typeof(analysis.dataset[k].taxon) != "undefined") {
				taxonFormatted = this.hqs.formatTaxon(analysis.dataset[k].taxon, true, analysis.dataset[k].abundance_id);
			}
			
			let modValue = "";
			let modDesc = "";
			for(let mk in analysis.dataset[k].modifications) {
				let mod = analysis.dataset[k].modifications[mk];
				modValue += analysis.dataset[k].modifications[mk].modification_type_name+", ";
				modDesc += analysis.dataset[k].modifications[mk].modification_type_name+": "+analysis.dataset[k].modifications[mk].modification_type_description+" ";
			}
			modValue = modValue.substr(0, modValue.length-2);
			

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
					"tooltip": analysis.dataset[k].sample_type.description,
					"value": analysis.dataset[k].sample_type.type_name
				},
                {
                    "type": "cell",
                    "tooltip": analysis.dataset[k].element_description,
                    "value": analysis.dataset[k].element_name
				},
				{
                    "type": "cell",
                    "tooltip": modDesc == "" ? "" : modDesc,
                    "value": modValue == "" ? "None" : modValue
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
					"type": "table",
					"options": [
						{
							"name": "columnsVisibility",
							"hiddenColumns": [
								3
							],
							"showControls": false
						}
					]
				},
				{
					"name": "Stacked bar chart",
					"selected": true,
					"type": "multistack",
					/*
					"options": {
						"yAxis": 1,
						"xAxis": {
							"key": 3,
							"value": 4
						}
					},
					*/
					
					"options": [
						{
							"title": "X axis",
							"function": "xAxis",
							"type": "select",
							"selected": 3, //Default column (key)
							"key": 4, //Contains the unique values for the selected columns - not sure we need / should have this
							"options": [3] //Column keys
						},
						{
							"title": "Y axis",
							"function": "yAxis",
							"type": "select",
							"selected": 1,
							"options": [1]
						},
						{
							"title": "Sort",
							"function": "sort", //sorts on either x or y axis - leaves it up to the render module to decide
							"type": "select",
							"selected": 4,
							"options": [4] //Used to be: 1,2,3,5,6,7,8
						}
					]
				}
			]
		});
		
		this.buildIsComplete = true;
		this.hqs.hqsEventDispatch("siteAnalysisBuildComplete");
	}
	
	isBuildComplete() {
		return this.buildIsComplete;
	}
}

export { AbundanceDataset as default }