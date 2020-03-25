import DatasetModule from "./DatasetModule.class";
/*
* Class: GenericDataset
*
* DatasetModule
* 
* This is a fall-back module that will capture all types of analyses/datasets which no other module claims and try to present some sort of basic rendering of some of the data.
*
 */

import shortid from "shortid";

class GenericDataset extends DatasetModule {
	constructor(analysis) {
		super();
		this.hqs = analysis.hqs;
		this.analysis = analysis;
		this.section = analysis.section;
		this.data = analysis.data;
		this.analyses = [];
		this.datasetFetchPromises = [];
		this.datasets = [];
		this.buildIsComplete = false;
	}

	offerAnalyses(datasets, sectionsList) {
		this.sectionsList = sectionsList;
		for(let key = datasets.length - 1; key >= 0; key--) {
			if(true) { //This module will always happily accept all datasets
				console.log("Generic claiming ", datasets[key].datasetId);
				let dataset = datasets.splice(key, 1)[0];
				this.datasets.push(dataset);

				if(this.analysis.getMethodMetaById(dataset.methodId) === false) {
					this.datasetFetchPromises.push(this.analysis.fetchMethodMetaData(dataset.methodId));
				}

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
	async fetchDataset(dataset) {
		await new Promise((resolve, reject) => {
			$.ajax(this.hqs.config.siteReportServerAddress+"/qse_dataset2?dataset_id=eq."+dataset.datasetId, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					//These are datapoints in the dataset
					dataset.dataPoints = data;
					resolve();
				}
			});
		});
	}
	
	
	
	buildSection(datasets) {
		//Create sections
		//We want to create as many sections as there are different types of methods in our datasets (usually just one though)
		datasets.map((dataset) => {
			let section = this.analysis.getSectionByMethodId(dataset.methodId);
			if(section === false) {
				let warningTooltipId = "sr-warning-tt-"+shortid.generate();
				let method = this.analysis.getMethodMetaById(dataset.methodId);
				var sectionsLength = this.sectionsList.push({
					"name": dataset.methodId,
					"title": dataset.methodName+"&nbsp;&nbsp;<i id='"+warningTooltipId+"' class=\"fa fa-exclamation-triangle site-report-analysis-unknown-warning\" aria-hidden=\"true\"></i>",
					"methodDescription": method.description,
					"collapsed": true,
					"contentItems": []
				});
				this.hqs.tooltipManager.registerTooltip("#"+warningTooltipId, "The SEAD system currently lacks support for handling this type of analysis. The data will be presented in a raw and incomplete format.");
				section = this.sectionsList[sectionsLength-1];
			}
			this.appendDatasetToSection(section, dataset);
		});
		
		this.buildIsComplete = true;
		this.hqs.hqsEventDispatch("siteAnalysisBuildComplete");
	}

	appendDatasetToSection(section, dataset) {
		var analysis = dataset;
		
		var colNames = Object.keys(analysis.dataPoints[0]);
		
		var length = section.contentItems.push({
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
			section.contentItems[ciKey].data.columns.push({
				"dataType": "string",
				"pkey": colNames[colKey] == "analysis_entity_id" ? true : false,
				"title": colNames[colKey]
			});
		}
		
		for(var k in analysis.dataPoints) {
			var row = [];
			for(var colKey in colNames) {
				row.push({
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataPoints[k][colNames[colKey]]
				});
			}
			
			section.contentItems[ciKey].data.rows.push(row);
		}
	}
	
}

export { GenericDataset as default }