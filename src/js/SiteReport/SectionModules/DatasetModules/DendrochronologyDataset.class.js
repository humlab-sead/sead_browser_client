/*
* Class: DendrochronologyDataset
*
* Dendrochronological datasets are a bit special in the way that each dataset has their own method, these can be seen as sub-methods to the 'real' methods in the db method table.
* 
*/

class DendrochronologyDataset {
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
		let claimed = false;
		if(this.analysisData.methodId == 10) { //Dendrochronology
			claimed = true;
		}
		
		return claimed;
	}

	/*
	* Function: fetchDataset
	*
	* Parameters:
	* datasetId
	 */
	async fetchDataset() {
		let promises = [];

		promises.push(new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/dendro_lookup", {
				method: "get",
				dataType: "json",
				success: async (dendroDataTypes, textStatus, xhr) => {
					var analysisKey = this.hqs.findObjectPropInArray(this.analysis.data.analyses, "datasetId", this.analysisData.datasetId);
					this.analysis.data.analyses[analysisKey].dendroDataTypes = dendroDataTypes;
					resolve();
				}
			});
		}));


		promises.push(new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/analysis_entities?dataset_id=eq."+this.analysisData.datasetId, {
				method: "get",
				dataType: "json",
				success: async (analysisEntities, textStatus, xhr) => {
					var analysisKey = this.hqs.findObjectPropInArray(this.analysis.data.analyses, "datasetId", this.analysisData.datasetId);
					this.analysis.data.analyses[analysisKey].analysisEntities = analysisEntities;
					for(let key in analysisEntities) {
						await this.fetchDendroData(analysisEntities[key].analysis_entity_id);
					}
					resolve();
				}
			});
		}));


		await Promise.all(promises).then(() => {
			this.buildSection();
		});
	}


	async fetchDendroData(analysisEntityId) {
		await $.ajax(this.hqs.config.siteReportServerAddress+"/dendro?analysis_entity_id=eq."+analysisEntityId, {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				var analysisKey = this.hqs.findObjectPropInArray(this.analysis.data.analyses, "datasetId", this.analysisData.datasetId);
				this.analysis.data.analyses[analysisKey].dendro = data;
				return data;
			}
		});
	}

	getDendroValueType(lookupId) {
		var analysisKey = this.hqs.findObjectPropInArray(this.data.analyses, "datasetId", this.analysisData.datasetId)
		let dataTypes = this.analysis.data.analyses[analysisKey].dendroDataTypes;
		for(let key in dataTypes) {
			if(dataTypes[key].dendro_lookup_id == lookupId) {
				return dataTypes[key];
			}
		}
		return false;
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
				"title": "Value type"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Measurement value"
			}
		];

		//Filling up the rows
		var rows = [];
		for(let key in analysis.dendro) {
			let valueType = this.getDendroValueType(analysis.dendro[key].dendro_lookup_id);
			
			let valueTypeName = analysis.dendro[key].dendro_lookup_id;
			let valueTypeDescription = "Unknown dendrochronological data type";
			
			if(valueType !== false) {
				valueTypeName = valueType.name;
				valueTypeDescription = valueType.description;
			}
			let valueMeasurement = analysis.dendro[key].measurement_value;
			
			var row = [
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dendro[key].analysis_entity_id
				},
				{
					"type": "cell",
					"tooltip": valueTypeDescription,
					"value": valueTypeName
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": valueMeasurement
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
					"selected": true,
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
				}
			]
		});
		
		this.buildIsComplete = true;
	}
	
	destroy() {
	}
}

export { DendrochronologyDataset as default }