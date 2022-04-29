import DatasetModule from "./DatasetModule.class";
/*
* Class: AbundanceDataset
*
* Terminology:
* A "dataset" is synonymous with an "analysis". These are used interchangeably here and there, which is unfortunate, but right now it is what it is.
* A datset (or analysis) is a single graph or table in the site report section. So if e.g. Plant macrofossil contains 2 graphs, that's 2 datasets/analyses of that type
 */

class AbundanceDataset extends DatasetModule {
	constructor(analysis) {
		super();
		this.sqs = analysis.sqs;
		this.analysis = analysis;
		this.data = analysis.data;
		this.taxonPromises = [];
		this.analyses = [];
		this.datasetFetchPromises = [];
		this.datasets = [];
		this.buildIsComplete = false;

		this.methodGroupId = 1;
		this.methodIds = [3, 6, 8, 14, 15, 40, 111]; //These are the analysis method IDs that this module will take responsibility for. So all analyses performed using any of these methods will be fetched and rendered by this module. The rest can go to hell (as far as this module is concerned).
		this.methodMetaDataFetchingComplete = false;

		this.metaDataFetchingPromises = [];
		this.metaDataFetchingPromises.push(this.analysis.fetchMethodGroupMetaData(this.methodGroupId));
		this.methodIds.map((methodId) => {
			this.metaDataFetchingPromises.push(this.analysis.fetchMethodMetaData(methodId));
		});

		Promise.all(this.metaDataFetchingPromises).then((data) => {
			this.methodMetaDataFetchingComplete = true;
		});
	}


	getSectionByMethodId(methodId, sections) {
		for(let key in sections) {
			if(sections[key].name == methodId) {
				return sections[key];
			}
		}
		return null;
	}

	getTaxonByIdFromLookup(siteData, taxon_id) {
		if(!siteData.lookup_tables.taxa) {
			return null;
		}
		for(let key in siteData.lookup_tables.taxa) {
			if(siteData.lookup_tables.taxa[key].taxon_id == taxon_id) {
				return siteData.lookup_tables.taxa[key];
			}
		}
		return null;
	}


	getEntriesFromLookupTable(siteData, lookupTableKey, matchRefKey, matchInput) {
		if(!siteData.lookup_tables[lookupTableKey]) {
			return null;
		}
		let found = [];
		for(let key in siteData.lookup_tables[lookupTableKey]) {
			if(siteData.lookup_tables[lookupTableKey][key][matchRefKey] == matchInput) {
				found.push(siteData.lookup_tables[lookupTableKey][key]);
			}
		}

		return found;
	}

	makeSection(siteData, sections) {
		let dataGroups = siteData.data_groups.filter((dataGroup) => {
			return dataGroup.type == "abundance";
		});

		console.log(dataGroups);

		dataGroups.forEach(dataGroup => {
			let section = this.getSectionByMethodId(dataGroup.method_id, sections);
			if(!section) {
				section = {
					"name": dataGroup.method_id,
					"title": dataGroup.method_name,
					"methodDescription": dataGroup.method_name,
					"collapsed": true,
					"contentItems": []
				};
				sections.push(section);
			}

			let contentItem = {
				"name": dataGroup.id,
				"title": dataGroup.dataset_name,
				"titleTooltip": "Name of the dataset",
				"datasetId": dataGroup.id,
				"data": {
					"columns": [],
					"rows": []
				},
				"renderOptions": [
					{
						"name": "Spreadsheet",
						"selected": false,
						"type": "table"
					},
					{
						"name": "Stacked bar chart",
						"selected": true,
						"type": "multistack",
						"options": [
							{
								"enabled": false,
								"title": "X axis",
								"function": "xAxis",
								"type": "select",
								"selected": 2, //Default column (key)
								"key": 2, //Contains the unique values for the selected columns - not sure we need / should have this
								"options": [
									{
										"title": "Abundance",
										"value": 1,
									},
								]
							},
							{
								"enabled": false,
								"title": "Y axis",
								"function": "yAxis",
								"type": "select",
								"selected": 0,
								"options": [{
									"title": "Sample name",
									"value": 0,
								},]
							},
							{
								"enabled": false,
								"title": "Sort",
								"function": "sort", //sorts on either x or y axis - leaves it up to the render module to decide
								"type": "select",
								"selected": 7,
								"options": [{
									"title": "Abundance taxon id",
									"value": 7,
								},]
							}
						]
					}
				]
			};

			contentItem.data.columns = [
				{
					"title": "Sample name"
				},
				{
					"title": "Abundance count"
				},
				{
					"title": "Taxon"
				},
				{
					"title": "Identification levels"
				},
				{
					"title": "Element type"
				},
				{
					"title": "Modification"
				},
				{
					"hidden": "true",
					"pkey": true,
					"title": "Sample id"
				},
				{
					"hidden": "true",
					"pkey": true,
					"title": "Taxon id"
				},
			];
			
			dataGroup.data_points.forEach((data_point => {
				let elementsValue = "";
				let elementsTooltip = "";

				let abundanceElements = this.getEntriesFromLookupTable(siteData, "abundance_elements", "abundance_element_id", [data_point.value.abundance_element_id]);
				if(abundanceElements && abundanceElements.length > 0) {
					elementsValue = abundanceElements[0].element_name;
					elementsTooltip = abundanceElements[0].element_description;
				}

				let modificationsValue = "";

				let modificationIds = [];
				data_point.value.modifications.forEach(item => {
					modificationIds.push(item.modification_type_id);
				});

				let modifications = this.getEntriesFromLookupTable(siteData, "abundance_modifications", "modification_type_id", modificationIds);
				modifications.forEach(mod => {
					//tooltip-format: %data:hellothisisthedata:!%tooltip:hellothisisthetooltip:!
					modificationsValue += "!%data:"+mod.modification_type_name+":!%tooltip:"+mod.modification_type_description+":!, ";
				});
				modificationsValue = modificationsValue.substring(0, modificationsValue.length-2);


				let identificationLevelsValue = "";
				data_point.value.identification_levels.forEach(idlvlItem => {
					identificationLevelsValue += idlvlItem.identification_level_name+", ";
				});
				identificationLevelsValue = identificationLevelsValue.substring(0, identificationLevelsValue.length-2);

				let taxon = this.getTaxonByIdFromLookup(siteData, data_point.value.taxon_id);

				let commonNames = "";
				taxon.common_names.forEach(cn => {
					commonNames += cn.common_name;
					if(cn.language_name_english) {
						commonNames += " ("+cn.language_name_english+")";
					}
					commonNames += ", ";
				});
				if(commonNames.length > 0) {
					commonNames = commonNames.substring(0, commonNames.length-2);
					commonNames = "Common names: "+commonNames;
				}

				contentItem.data.rows.push([
					{
						"type": "cell",
						"value": data_point.sample_name
					},
					{
						"type": "cell",
						"value": data_point.value.abundance
					},
					{
						"type": "cell",
						"value": this.sqs.formatTaxon(taxon, data_point.value.identification_levels),
						"tooltip": commonNames
					},
					{
						"type": "cell",
						"value": identificationLevelsValue
					},
					{
						"type": "cell",
						"value": elementsValue,
						"tooltip": elementsTooltip
					},
					{
						"type": "cell",
						"value": modificationsValue
					},
					{
						"type": "cell",
						"value": data_point.physical_sample_id
					},
					{
						"type": "cell",
						"value": data_point.value.taxon_id
					},
				]);
			}));

			section.contentItems.push(contentItem);

		});
	}





	
	/*
	* Function: offerAnalyses
	*
	* Ok, so, this is a little strange perhaps and deserves some explanation. What's going on here is that the instance of Analysis will fetch just the most basic information regarding which analysis are attached to a certain site.
	* That object will then delegate the responsibility of fetching the rest of the information and structuring it properly, since how this should be done varies between different types, and this is delegated by "offering"
	* the analysis to all the available analysis modules, and whichever module claims it will have it. This (offerAnalyses) is the function which will be passed the analyses and will have to make a decision on wether to claim them or not
	* based on the information available in each analysis object.
	*
	* This function is never called from within this module itself, only from the outside from the higher level Analysis module.
	* 
	* If this function decides to claim one (or more) datasets from the passed in array, it needs to splice these out of the array - that's how the actual claiming is done.
	*
	* The module should structure the fetched information according to the general site report format for sections, content-items and tables structures. You can find the definition of this format inside Johan's head (this needs to be fixed - not the head, the writing down of the format (Tag: FIXME))
	*
	* Parameters:
	* 	datasets - An array of dataset/analysis objects to make decision on.
	*
	* Returns:
	* A promise which should resolve when the data structure for this analysis/dataset is completely built and filled out.
	*/ 
	offerAnalyses(datasets, sectionsList) {
		this.sectionsList = sectionsList;
		for(let key = datasets.length - 1; key >= 0; key--) {
			if(this.methodIds.includes(datasets[key].methodId)) {
				console.log("Abundance claiming ", datasets[key].datasetId, datasets[key]);
				let dataset = datasets.splice(key, 1)[0];
				this.datasets.push(dataset);
			}
		}

		//Now fetch & build all datasets
		return new Promise((resolve, reject) => {
			for(let key in this.datasets) {
				let p = this.analysis.fetchAnalysis(this.datasets[key]);
				this.datasetFetchPromises.push(p);
				p = this.fetchDatasetAnalysisEntities(this.datasets[key]);
				this.datasetFetchPromises.push(p);
			}

			let promises = this.datasetFetchPromises.concat(this.metaDataFetchingPromises); //To make sure meta data fetching is also complete...
			Promise.all(promises).then(() => {
				if(this.methodMetaDataFetchingComplete !== true) {
					console.warn("Method metadata fetching not complete!");
				}
				if(this.datasets.length > 0) {
					this.buildSection(this.datasets);
				}
				resolve();
			});
		});
	}
	
	/*
	* Function: fetchDatasetAnalysisEntities
	*/
	async fetchDatasetAnalysisEntities(dataset) {
		return await new Promise((resolve, reject) => {
			$.ajax(this.sqs.config.siteReportServerAddress+"/qse_dataset2?dataset_id=eq."+dataset.datasetId, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					dataset.dataPoints = [];
					data.map((dataPoint) => {
						dataset.dataPoints.push({
							datasetId: dataPoint.dataset_id,
							analysisEntityId: dataPoint.analysis_entity_id,
							physicalSampleId: dataPoint.physical_sample_id,
							sampleGroupId: dataPoint.sample_group_id,
							sampleTypeId: dataPoint.sample_type_id,
							sampleName: dataPoint.sample_name
						});
					});
					//dataset.dataPoints = data;
					await this.fetchAbundanceData(dataset.dataPoints);
					await this.requestMetaDataForDataset(dataset);
					resolve();
				}
			});
		});
	}

	/*
	* Function: fetchAbundanceData
	*/
	async fetchAbundanceData(dataPoints) {
		//dataPoints is an array of analysisEntities ID's (among other things)
		//For each AE we need to fetch the abundance data coupled to this ID

		let analysisEntityIds = [];
		dataPoints.map((dp) => {
			analysisEntityIds.push(dp.analysisEntityId);
		});
		let abundanceData = await this.sqs.fetchFromTable("abundances", "analysis_entity_id", analysisEntityIds);

		dataPoints.map((dp) => {
			dp.abundances = [];
			abundanceData.map((ad) => {
				if(dp.analysisEntityId == ad.analysis_entity_id) {
					dp.abundances.push({
						abundanceId: ad.abundance_id,
						taxonId: ad.taxon_id,
						elementId: ad.abundance_element_id,
						abundance: ad.abundance,
						dateUpdated: ad.date_updated
					});
				}
			})
		});
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
			$.ajax(this.sqs.config.siteReportServerAddress+"/qse_dataset?dataset_id=eq."+dataset.datasetId, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					//dataset.dataPoints = data;
					await this.requestMetaDataForDataset(dataset);
					resolve();
				}
			});
		});
	}
	
	/*
	* Function: getDataset
	*/
	getDataset() {
		var analysisKey = this.sqs.findObjectPropInArray(this.analysis.data.analyses, "datasetId", this.analysisData.datasetId);
		return this.analysis.data.analyses[analysisKey].dataset;
	}
	
	/*
	* Function: requestMetaDataForDataset
	*/
	async requestMetaDataForDataset(dataset) {
		let promises = [];
		promises = promises.concat(await this.fetchTaxa(dataset));
		promises = promises.concat(await this.fetchAbundanceIdentificationLevel(dataset));
		promises = promises.concat(await this.fetchAbundanceModifications(dataset));
		promises = promises.concat(await this.analysis.fetchSampleType(dataset));
		promises = promises.concat(await this.fetchAbundanceElements(dataset));
		return promises;
	}

	/*
	* Function: fetchAbundanceElements
	*
	*/
	async fetchAbundanceElements(dataset) {
		let uniqueElementIds = new Set();
		dataset.dataPoints.map((dp) => {
			dp.abundances.map((ab) => {
				if(ab.elementId != null) {
					uniqueElementIds.add(ab.elementId);
				}
			});
		});

		let elementIds = Array.from(uniqueElementIds);
		let elements = await this.sqs.fetchFromTable("abundance_elements", "abundance_element_id", elementIds);

		elements.map((e) => {
			dataset.dataPoints.map((dp) => {
				dp.abundances.map((ab) => {
					if(ab.elementId == e.abundance_element_id) {
						ab.element = e;
					}
				});
			});
		});
	}

	/*
	* Function: fetchTaxa
	*
	*/
	async fetchTaxa(dataset) {
		let taxonIds = new Set();
		let dataPoints = dataset.dataPoints;

		dataPoints.map((dp) => {
			dp.abundances.map((ab) => {
				taxonIds.add(ab.taxonId);
			});
		});

		taxonIds = Array.from(taxonIds);
		var taxonPromise = this.sqs.fetchTaxa(taxonIds);
		taxonPromise.then((taxa) => {
			dataset.dataPoints.map((dp) => {
				dp.abundances.map((ab) => {
					ab.taxon = this.sqs.getTaxaById(ab.taxonId);
				});
			});
		});
		
		return taxonPromise;
	}

	/*
	* Function: fetchAbundanceIdentificationLevel
	*/
	async fetchAbundanceIdentificationLevel(dataset) {
		let dataPoints = dataset.dataPoints;
		let taxonAbundanceIds = [];
		for(let key in dataPoints) {
			for(let k2 in dataPoints[key].abundances) {
				let taxonId = dataPoints[key].abundances[k2].taxonId;
				let abundanceId = dataPoints[key].abundances[k2].abundanceId;

				if (taxonId != null) {
					taxonAbundanceIds.push({
						"taxon_id": taxonId,
						"abundance_id": abundanceId
					});
				}
			}
		}

		let identificationLevels = await this.sqs.fetchFromTablePairs("qse_abundance_identification_levels", taxonAbundanceIds);
		
		for(let key in identificationLevels) {
			let il = identificationLevels[key];
			for(let dk in dataPoints) {
				for(let ak in dataPoints[dk].abundances) {
					if(dataPoints[dk].abundances[ak].abundanceId == il.abundance_id && dataPoints[dk].abundances[ak].taxonId == il.taxon_id) {
						if(typeof(dataPoints[dk].abundances[ak].taxon_identification_levels) == "undefined") {
							dataPoints[dk].abundances[ak].taxon_identification_levels = [];
						}
						dataPoints[dk].abundances[ak].taxon_identification_levels.push(il);
					}
				}
			}
		}
	}

	/*
	* Function: fetchAbundanceModifications
	*/
	async fetchAbundanceModifications(dataset) {
		let dataPoints = dataset.dataPoints;
		let abundanceIds = [];
		for(let key in dataPoints) {
			for(let k2 in dataPoints[key].abundances) {
				let abundanceId = dataPoints[key].abundances[k2].abundanceId;
				abundanceIds.push(abundanceId);
			}
		}
		
		let modifications = await this.sqs.fetchFromTable("qse_abundance_modification", "abundance_id", abundanceIds);
		for(let dk in dataPoints) {
			for(let ak in dataPoints[dk].abundances) {
				for(let mk in modifications) {
					if(dataPoints[dk].abundances[ak].abundanceId == modifications[mk].abundance_id) {
						//This is correct - modifications are per abundance, not per sample as you might think
						dataPoints[dk].abundances[ak].modifications = [];
						dataPoints[dk].abundances[ak].modifications.push({
							modification_type_id: modifications[mk].modification_type_id,
							modification_type_name: modifications[mk].modification_type_name,
							modification_type_description: modifications[mk].modification_type_description
						});
					}
				}
			}
		}
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

	/*
	* Function: buildSection
	*/
	buildSection(datasets) {

		//Create sections
		//We want to create as many sections as there are different types of methods in our datasets (usually just one though)
		datasets.map((dataset) => {
			let section = this.analysis.getSectionByMethodId(dataset.methodId);
			if(section === false) {
				let method = this.analysis.getMethodMetaDataById(dataset.methodId);
				var sectionsLength = this.sectionsList.push({
					"name": dataset.methodId,
					"title": dataset.methodName,
					"methodDescription": method.description,
					"collapsed": true,
					"contentItems": []
				});
				section = this.sectionsList[sectionsLength-1];
				/*
				var sectionsLength = this.section.sections.push({
					"name": dataset.methodId,
					"title": dataset.methodName,
					"methodDescription": "",
					"collapsed": true,
					"contentItems": []
				});
				
				section = this.section.sections[sectionsLength-1];
				*/
			}
			this.appendDatasetToSection(section, dataset);
		});
		
		this.buildIsComplete = true;
		this.sqs.sqsEventDispatch("siteAnalysisBuildComplete");
	}

	/*
	* Function: appendDatasetToSection
	*/
	appendDatasetToSection(section, dataset) {
		let analysis = dataset;
		
		//Defining columns
		var columns = [
			{
				"dataType": "number",
				"pkey": true,
				"title": "Analysis entity id"
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
				"title": "Sample type",
				"exclude_from_export": true
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

		//Merge all abundance data, each dataPoint is an analysisEntity
		let abundances = [];
		analysis.dataPoints.map((dp) => {
			abundances = abundances.concat(dp.abundances);
		});

		//Merge abundance records which are of the same taxon, maybe? I think yes
		let mergedAbundances = [];
		abundances.map((ab) => {
			let found = false;
			mergedAbundances.map((m) => {
				if(ab.taxonId == m.taxonId) {
					found = true;
					m.abundance += ab.abundance;
				}
			});

			if(!found) {
				mergedAbundances.push({
					taxonId: ab.taxonId,
					abundance: ab.abundance
				});
			}
		});

		for(var k in analysis.dataPoints) {

			analysis.dataPoints[k].abundances.map((ab) => {
				let modValue = "";
				let modDesc = "";
				for(let mk in ab.modifications) {
					modValue += ab.modifications[mk].modification_type_name+", ";
					modDesc += ab.modifications[mk].modification_type_name+": "+ab.modifications[mk].modification_type_description+" ";
				}
				modValue = modValue.substr(0, modValue.length-2);

				let taxa = this.sqs.getTaxaById(ab.taxonId);
				
				let taxonFormatted = "notaxa";
				if(typeof(taxa != false)) {
					taxonFormatted = this.sqs.formatTaxon(taxa, true, ab.abundanceId, ab.taxon_identification_levels);
				}

				let elementDescription = typeof ab.element == "undefined" ? "" : ab.element.element_description;
				let elementName = typeof ab.element == "undefined" ? "" : ab.element.element_name;
				
				var row = [
					{
						"type": "cell",
						"tooltip": "",
						"value": analysis.dataPoints[k].analysisEntityId
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": analysis.dataPoints[k].sampleName
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": analysis.dataPoints[k].sampleGroupId
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": ab.abundance
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": ab.taxonId
					},
					{
						"type": "cell",
						"tooltip": "",
						"value": taxonFormatted
					},
					{
						"type": "cell",
						"tooltip": analysis.dataPoints[k].sampleType.description,
						"value": analysis.dataPoints[k].sampleType.type_name
					},
					{
						"type": "cell",
						"tooltip": elementDescription,
						"value": elementName
					},
					{
						"type": "cell",
						"tooltip": modDesc == "" ? "" : modDesc,
						"value": modValue == "" ? "None" : modValue
					}
				];
				rows.push(row);
			});

			
			
		}
		
		//Defining the contentItem
		section.contentItems.push({
			"name": analysis.datasetId,
			"title": analysis.datasetName,
			"titleTooltip": "Name of the dataset",
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
							"enabled": false
						}
					]
				},
				{
					"name": "Stacked bar chart",
					"selected": true,
					"type": "multistack",
					"options": [
						{
							"enabled": false,
							"title": "X axis",
							"function": "xAxis",
							"type": "select",
							"selected": 3, //Default column (key)
							"key": 4, //Contains the unique values for the selected columns - not sure we need / should have this
							//"options": [3], //Column keys
							"options": [
								{
									"title": "Abundance",
									"value": 3,
								},
							]
						},
						{
							"enabled": false,
							"title": "Y axis",
							"function": "yAxis",
							"type": "select",
							"selected": 1,
							"options": [{
								"title": "Sample name",
								"value": 1,
							},]
						},
						{
							"enabled": false,
							"title": "Sort",
							"function": "sort", //sorts on either x or y axis - leaves it up to the render module to decide
							"type": "select",
							"selected": 4,
							"options": [{
								"title": "Abundance taxon id",
								"value": 4,
							},]
						}
					]
				}
			]
		});
	}
	
	/*
	* Function: isBuildComplete
	*/
	isBuildComplete() {
		return this.buildIsComplete;
	}

	/*
	* Function: destroy
	*/
	destroy() {
		this.sqs.sqsEventUnlisten("taxaFetchingComplete-"+this.analysisData.datasetId, this);
	}
}

export { AbundanceDataset as default }