
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
		this.analyses = [];
		this.datasetFetchPromises = [];
		this.datasets = [];
		this.buildIsComplete = false;
	}
	
	offerAnalyses(datasets) {
		for(let key = datasets.length - 1; key >= 0; key--) {
			if(datasets[key].methodGroupId == 1) {
				//console.log("Abundance claiming ", datasets[key].datasetId);
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
		this.hqs.hqsEventUnlisten("taxaFetchingComplete-"+this.analysisData.datasetId, this);
	}
	
	
	/*
	* Function: fetchDataset
	*
	* Gets the bloody samples.
	* Also need to fetch taxon-info for this since it's an abundance counting type of method, yes sir it is sir indeed sir.
	*
	* Parameters:
	* dataset
	 */
	async fetchDataset(dataset) {
		return await new Promise((resolve, reject) => {
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
	
	getDataset() {
		var analysisKey = this.hqs.findObjectPropInArray(this.analysis.data.analyses, "datasetId", this.analysisData.datasetId);
		return this.analysis.data.analyses[analysisKey].dataset;
	}
	
	/*
	*/
	async requestMetaDataForDataset(dataset) {
		let promises = [];
		promises = promises.concat(await this.fetchTaxa(dataset));
		promises = promises.concat(await this.fetchAbundanceIdentificationLevel(dataset));
		promises = promises.concat(await this.fetchAbundanceModifications(dataset));
		promises = promises.concat(await this.analysis.fetchSampleType(dataset));
		return promises;
	}

	async fetchTaxa(dataset) {
		let dataPoints = dataset.dataPoints;
		var taxonIds = [];
		for(var key in dataPoints) {
			var taxonId = dataPoints[key].abundance_taxon_id;
			if (taxonId != null) {
				taxonIds.push(taxonId);
			}
		}

		var taxonPromise = this.hqs.siteReportManager.siteReport.getTaxa(taxonIds);
		taxonPromise.then((taxa) => {
			for(var key in taxa) {
				this.applyTaxon(dataset, taxa[key]);
			}
		});

		return taxonPromise;
	}


	async fetchAbundanceIdentificationLevel(dataset) {
		let dataPoints = dataset.dataPoints;
		let taxonAbundanceIds = [];
		for(let key in dataPoints) {
			var taxonId = dataPoints[key].abundance_taxon_id;
			let abundanceId = dataPoints[key].abundance_id;
			if (taxonId != null) {
				taxonAbundanceIds.push({
					"taxonId": taxonId,
					"abundanceId": abundanceId
				});
			}
		}

		let identificationLevels = await this.requestAbundanceIdentificationLevel(taxonAbundanceIds);
		
		for(let key in identificationLevels) {
			let il = identificationLevels[key];
			for(let dk in dataPoints) {
				if(dataPoints[dk].abundance_id == il.abundance_id && dataPoints[dk].taxon.taxon_id == il.taxon_id) { //FIXME: taxon_id can sometimes be undefined here: AbundanceDataset.class.js:123 Uncaught (in promise) TypeError: Cannot read property 'taxon_id' of undefined
					if(typeof(dataPoints[dk].taxon.identification_levels) == "undefined") {
						dataPoints[dk].taxon.identification_levels = [];
					}
					dataPoints[dk].taxon.identification_levels.push(il);
				}
			}
		}
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
		let dataPoints = dataset.dataPoints;
		let abundanceIds = [];
		for(let key in dataPoints) {
			abundanceIds.push(dataPoints[key].abundance_id);
		}

		let modifications = await this.requestAbundanceModifications(abundanceIds);
		
		for(let dk in dataPoints) {
			for(let mk in modifications) {
				if(dataPoints[dk].abundance_id == modifications[mk].abundance_id) {
					dataPoints[dk].modifications = [];
					dataPoints[dk].modifications.push({
						modification_type_id: modifications[mk].modification_type_id,
						modification_type_name: modifications[mk].modification_type_name,
						modification_type_description: modifications[mk].modification_type_description
					});
				}
			}
		}
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
	
	/*
	* Function: applyTaxon
	* 
	* 
	*/
	applyTaxon(dataset, taxon) {
		this.taxaComplete = true; //Optimistic presumption

		for(var key in dataset.dataPoints) {
			if(dataset.dataPoints[key].abundance_taxon_id == taxon.taxon_id) {
				dataset.dataPoints[key].taxon = taxon;
			}
			
			if(typeof(dataset.dataPoints[key].taxon) == "undefined") {
				this.taxaComplete = false;
			}
		}
		return this.taxaComplete;
	}
	
	
	buildSection(datasets) {
		for(let key in datasets) {
			this.appendDatasetToSection(datasets[key]);
		}
		
		this.buildIsComplete = true;
		this.hqs.hqsEventDispatch("siteAnalysisBuildComplete");
	}

	appendDatasetToSection(dataset) {
		let analysis = dataset;
		var sectionKey = this.hqs.findObjectPropInArray(this.section.sections, "name", analysis.methodId);
		var method = null;
		for(var k in this.analysis.meta.methods) {
			if(this.analysis.meta.methods[k].method_id == analysis.methodId) {
				method = this.analysis.meta.methods[k];
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
		for(var k in analysis.dataPoints) {
			
			var taxonFormatted = "notaxa";
			if(typeof(analysis.dataPoints[k].taxon) != "undefined") {
				taxonFormatted = this.hqs.formatTaxon(analysis.dataPoints[k].taxon, true, analysis.dataPoints[k].abundance_id);
			}
			
			let modValue = "";
			let modDesc = "";
			for(let mk in analysis.dataPoints[k].modifications) {
				let mod = analysis.dataPoints[k].modifications[mk];
				modValue += analysis.dataPoints[k].modifications[mk].modification_type_name+", ";
				modDesc += analysis.dataPoints[k].modifications[mk].modification_type_name+": "+analysis.dataPoints[k].modifications[mk].modification_type_description+" ";
			}
			modValue = modValue.substr(0, modValue.length-2);
			

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
					"tooltip": "",
					"value": analysis.dataPoints[k].abundance
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataPoints[k].abundance_taxon_id
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": taxonFormatted
				},
				{
					"type": "cell",
					"tooltip": analysis.dataPoints[k].sample_type.description,
					"value": analysis.dataPoints[k].sample_type.type_name
				},
				{
					"type": "cell",
					"tooltip": analysis.dataPoints[k].element_description,
					"value": analysis.dataPoints[k].element_name
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
	}
	
	isBuildComplete() {
		return this.buildIsComplete;
	}
}

export { AbundanceDataset as default }