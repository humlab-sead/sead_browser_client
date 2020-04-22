import DatasetModule from "./DatasetModule.class";
import shortid from "shortid";

/**
* Class: GenericDataset
*
* DatasetModule
* 
* This is a fall-back module that will capture all types of analyses/datasets which no other module claims and try to present some sort of basic rendering of some of the data.
*
*/

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

	/**
	 * Function: offerAnalyses
	 * 
	 * Receives incoming offers of analyses/datasets to maybe claim / take responsibility for.
	 * 
	 * Parameters:
	 * datasets - A list of objects describing datasets, is there any in this list you would like to take home with you? Open it up and let's see!
	 * sectionsList - The finished "ContentItem" should be wrapped in a "Section" and that section should be appended to this 
	 */
	offerAnalyses(datasets, sectionsList) {
		this.sectionsList = sectionsList; //Saving this for later

		for(let key = datasets.length - 1; key >= 0; key--) { //Iterating through this backwards because that makes the splicing out of items less problematic
			if(true) { //This module will always happily accept all datasets
				//console.log("Generic claiming ", datasets[key].datasetId); //Announce to the console that we are taking this dataset and running with it
				let dataset = datasets.splice(key, 1)[0]; //Splice (remove) it from the list
				this.datasets.push(dataset); //Add it to our own internal list of datasets we are going to care for

				if(this.analysis.getMethodMetaById(dataset.methodId) === false) { //Try to get method meta data from cache first
					this.datasetFetchPromises.push(this.analysis.fetchMethodMetaData(dataset.methodId)); //Otherwise we fetch it, using a function in the Analysis instance a step above us, since this is somehting all modules will want to do
				}
			}
		}

		//DatasetModules always returns a promise. If no datasets were claimed then that promise resolves right away. Otherwise it will resolve when the ContentItem has been built and appended to the main site report structure.
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
	
	/**
	 * Function: isBuildComplete
	 * 
	 * Don't think this function is used anymore.
	 */
	isBuildComplete() {
		return this.buildIsComplete;
	}

	/*
	* Function: fetchDataset
	*
	* Will fetch some basic information about a dataset
	*
	* Parameters:
	* dataset
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
	
	/**
	 * Function: buildSection
	 * 
	 * Will build the "Section" containing the "ContentItem". A Section is a container in the site report, they can exist on different levels, this section exists on the lowest level (closest to the ContentItems) and it might contain several ContentItems. A ContentItem is a table or a graph - or some other form of rendering of data/content.
	 * Note though that these are just descriptions/definitions of Sections and ContentItems created as a structure. This structure will then be passed on to functions and modules for rendering elsewhere in the site report system.
	 * 
	 * 
	 */
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

		//console.log(JSON.stringify(this.sectionsList, null, 2));
		
		this.buildIsComplete = true;
		this.hqs.hqsEventDispatch("siteAnalysisBuildComplete"); //Don't think this is relevant anymore... I used events for determining if all DatasetModules had finished building before I switched to promises
	}

	/**
	 * Function: appendDatasetToSection
	 * 
	 * Appends a dataset to a section by turning it into a ContentItem
	 */
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

	/**
	 * Function: destroy
	 * 
	 * Maybe this will be used for something one day...
	 */
	destroy() {
	}
	
}

export { GenericDataset as default }