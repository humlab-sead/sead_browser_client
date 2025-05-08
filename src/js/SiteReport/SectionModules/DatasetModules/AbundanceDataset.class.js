import { nanoid } from "nanoid";
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
		this.methodIds = [3, 6, 8, 15, 40, 111]; //These are the analysis method IDs that this module will take responsibility for. So all analyses performed using any of these methods will be fetched and rendered by this module. The rest can go to hell (as far as this module is concerned).
		this.methodMetaDataFetchingComplete = true;

		/*
		this.metaDataFetchingPromises = [];
		this.metaDataFetchingPromises.push(this.analysis.fetchMethodGroupMetaData(this.methodGroupId));
		this.methodIds.map((methodId) => {
			this.metaDataFetchingPromises.push(this.analysis.fetchMethodMetaData(methodId));
		});
		
		Promise.all(this.metaDataFetchingPromises).then((data) => {
			this.methodMetaDataFetchingComplete = true;
		});
		*/
	}

	getSectionByMethodId(methodId, sections) {
		for(let key in sections) {
			if(sections[key].methodId == methodId) {
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


	getEntriesFromLookupTable(siteData, lookupTableKey, matchRefKey, matchInputs) {
		if(typeof siteData.lookup_tables[lookupTableKey] == "undefined") {
			console.warn("Lookup table "+lookupTableKey+" does not exist!");
			return [];
		}
		let found = [];
		for(let key in siteData.lookup_tables[lookupTableKey]) {
			matchInputs.forEach(matchInput => {
				if(siteData.lookup_tables[lookupTableKey][key][matchRefKey] == matchInput) {
					found.push(siteData.lookup_tables[lookupTableKey][key]);
				}
			});
		}

		return found;
	}

	async getSiteEcoCodeContentItem(siteData) {
		let ecoCodeBundles = await new Promise(async (resolve, reject) => {
			let response = await fetch(this.sqs.config.dataServerAddress+"/ecocodes/site/"+siteData.site_id);
			let ecoCodeBundles = await response.json();
			if(typeof ecoCodeBundles.ecocode_bundles != "undefined") {
				resolve(ecoCodeBundles.ecocode_bundles);
			}
			else {
				console.warn("No eco code bundles found for this site.");
				resolve([]);
			}
		});
		
		if(ecoCodeBundles.length == 0) {
			return null;
		}

		/*
		X: Environment
		Y: Abundance / Taxa
		*/
		
		let ecoCodeContentItem = {
			"name": "ci-"+nanoid(),
			"title": "Eco codes",
			"titleTooltip": "Bugs EcoCodes is a habitat classification system.",
			"data": {
				"columns": [
					{
						"title": "Eco code",
						"pkey": true,
					},
					{
						"title": "Aggregated abundance",
					},
					{
						"title": "Aggregated taxa",
					},
					{
						title: "Ecocode definition ID",
						hidden: true,
					},
				],
				"rows": []
			},
			"renderOptions": [
				{
					"name": "Spreadsheet",
					"selected": false,
					"type": "table"
				},
				{
					"selected": false,
					"type": "external_link",
					"url": "https://demo.humlab.umu.se/seadecovis?site="+siteData.site_id,
					"name": "Artistic",
				},
				{
					"name": "Bar chart",
					"selected": true,
					"type": "ecocode",
					"options": [
						{
							"enabled": false,
							"title": "X axis",
							"function": "xAxis",
							"type": "select",
							"selected": 0, //Default column (key)
							"key": 0, //Contains the unique values for the selected columns - not sure we need / should have this
							"options": [
								{
									"title": "Abundance",
									"value": 1,
								},
							]
						},
						{
							"enabled": true,
							"title": "Y axis",
							"function": "yAxis",
							"type": "select",
							"selected": 1,
							"options": [
								{
									"title": "Aggregated abundance",
									"value": 1,
								},
								{
									"title": "Aggregated taxa",
									"value": 2,
								}
							]
						},
						{
							"enabled": false,
							"title": "Sort",
							"function": "sort", //sorts on either x or y axis - leaves it up to the render module to decide
							"type": "select",
							"selected": 1,
							"options": [{
								"title": "Abundance",
								"value": 1,
							},]
						}
					]
				}
			]
		};

		if(ecoCodeBundles) {
			ecoCodeBundles.forEach(ecoCodeBundle => {
				ecoCodeContentItem.data.rows.push([
					{
						type: "cell",
						value: ecoCodeBundle.ecocode.name
					},
					{
						type: "cell",
						value: ecoCodeBundle.abundance
					},
					{
						type: "cell",
						value: ecoCodeBundle.taxa.length
					},
					{
						type: "cell",
						value: ecoCodeBundle.ecocode.ecocode_definition_id
					}
				]);
			});
		}
		

		return ecoCodeContentItem;
	}

	async getSamplesEcoCodeContentItem(siteData) {
		let ecoCodeBundles = await new Promise(async (resolve, reject) => {
			let response = await fetch(this.sqs.config.dataServerAddress+"/ecocodes/site/"+siteData.site_id+"/samples");
			let ecoCodeBundles = await response.json();
			if(typeof ecoCodeBundles.ecocode_bundles != "undefined") {
				resolve(ecoCodeBundles.ecocode_bundles);
			}
			else {
				console.warn("No eco code bundles found for this site.");
				resolve([]);
			}
		});
		
		if(ecoCodeBundles.length == 0) {
			return null;
		}

		if(ecoCodeBundles.length == 1 && ecoCodeBundles[0].ecocodes.length == 0) {
			return null;
		}

		/*
		X: Environment
		Y: Abundance / Taxa
		*/
		
		let ecoCodeContentItem = {
			"name": "contentItem-"+nanoid(),
			"title": "Eco codes per sample",
			"titleTooltip": "Bugs EcoCodes is a habitat classification system.",
			"data": {
				"columns": [
					{
						"title": "Sample ID",
						"pkey": true,
						"hidden": true,
					},
					{
						"title": "Sample name",
					},
					{
						"title": "Aggregated abundance",
					},
					{
						"title": "Aggregated taxa",
					},
					{
						dataType: "subtable",
					}
				],
				"rows": []
			},
			"renderOptions": [
				{
					"name": "Spreadsheet",
					"selected": false,
					"type": "table",
				},
				{
					"name": "Bar chart",
					"selected": true,
					"type": "ecocodes-samples",
					"options": [
						{
							"enabled": false,
							"title": "X axis",
							"function": "xAxis",
							"type": "select",
							"selected": 0, //Default column (key)
							"key": 0, //Contains the unique values for the selected columns - not sure we need / should have this
							"options": [
								{
									"title": "Abundance",
									"value": 2,
								},
							]
						},
						{
							"enabled": true,
							"title": "X axis", //Since this is a reversed/horizontal bar chart the Y axis becomes the X axis...
							"function": "yAxis",
							"type": "select",
							"selected": 1,
							"options": [
								{
									"title": "Aggregated abundance",
									"value": 1,
								},
								{
									"title": "Aggregated taxa",
									"value": 2,
								},
							]
						},
						{
							"enabled": true,
							"title": "Sort",
							"function": "sort", //sorts on either x or y axis - leaves it up to the render module to decide
							"type": "select",
							"selected": 2,
							"options": [
								{
									"title": "Abundance",
									"value": 2,
								},
								{
									"title": "Taxa",
									"value": 3,
								}
							]
						}
					]
				}
			]
		};

		
		ecoCodeBundles.forEach(ecoCodeBundle => {
			let subTable = {
				columns: [
					{
						title: "Ecocode",
						pkey: true,
					},
					{
						title: "Aggregated abundance",
						sort: "desc"
					},
					{
						title: "Aggregated taxa",
					},
					{
						title: "Ecocode definition ID",
						hidden: true,
					},
				],
				rows: []
			}

			let sampleAggAbundance = 0;
			let sampleAggTaxa = 0;

			ecoCodeBundle.ecocodes.forEach(ecocode => {
				let subTableRow = [];
				subTableRow.push(
					{
						type: "cell",
						value: ecocode.ecocode.name,
					},
					{
						type: "cell",
						value: ecocode.abundance,
					},
					{
						type: "cell",
						value: ecocode.taxa.length,
					},
					{
						type: "cell",
						value: ecocode.ecocode.ecocode_definition_id,
					},
				);

				sampleAggAbundance += ecocode.abundance;
				sampleAggTaxa += ecocode.taxa.length;

				subTable.rows.push(subTableRow);
			});
			

			//console.log(ecoCodeBundle);
			//console.log(subTable);
			
			let sampleName = "";
			siteData.sample_groups.forEach(sg => {
				sg.physical_samples.forEach(ps => {
					if(ps.physical_sample_id == ecoCodeBundle.physical_sample_id) {
						sampleName = ps.sample_name;
					}
				});
			})
		
			ecoCodeContentItem.data.rows.push([
				{
					type: "cell",
					value: ecoCodeBundle.physical_sample_id
				},
				{
					type: "cell",
					value: sampleName
				},
				{
					type: "cell",
					value: sampleAggAbundance
				},
				{
					type: "cell",
					value: sampleAggTaxa
				},
				{
					type: "subtable",
					value: subTable
				}
			]);
		});

		return ecoCodeContentItem;
	}

	async makeSection(siteData, sections) {
		let dataGroups = siteData.data_groups.filter((dataGroup) => {
			return dataGroup.type == "abundance";
		});

		let methodDatasets = this.claimDatasets(siteData);

		if(methodDatasets.length == 0) {
			return;
		}


		//if this is palaeontomoly, generate eco code charts as well, but don't if not
		let palaeontomolyDatasetFound = false;
		dataGroups.forEach(dataGroup => {
			if(dataGroup.method_ids.includes(3)) {
				palaeontomolyDatasetFound = true;
			}
		})

		dataGroups.forEach(dataGroup => {
			let datasetBiblioIds = this.getUniqueDatasetBiblioIdsFromDataGroup(methodDatasets, dataGroup);
			let datasetContacts = this.getUniqueDatasetContactsFromDataGroup(methodDatasets, dataGroup);

			let analysisMethod = null;
			for(let key in siteData.lookup_tables.methods) {
				if(dataGroup.method_ids.includes(siteData.lookup_tables.methods[key].method_id)) {
					analysisMethod = siteData.lookup_tables.methods[key];
				}
			}

			let analysisMethodDescription = "";
			if(analysisMethod) {
				analysisMethodDescription = "<h4 class='tooltip-header'>"+analysisMethod.method_name+"</h4>"+analysisMethod.method_abbrev_or_alt_name+"<hr>"+analysisMethod.description;
			}

			let stringifiedMethodIds = dataGroup.method_ids.join("-");
			let section = this.getSectionByMethodId(dataGroup.method_id, sections);	
			if(!section) {
				section = {
					"name": dataGroup.method_group_id+"--"+stringifiedMethodIds,
					"title": dataGroup.method_name,
					"methodId": analysisMethod ? analysisMethod.method_id : null,
					"methodDescription": analysisMethodDescription,
					"collapsed": true,
					"contentItems": []
				};
				sections.push(section);
			}

			let biblioIds = [];
			siteData.datasets.forEach(dataset => {
				if(dataset.biblio_id) {
					if(!biblioIds.includes(dataset.biblio_id)) {
						biblioIds.push(dataset.biblio_id);
					}
				}
			});

			let contentItem = {
				"name": dataGroup.id,
				"title": dataGroup.dataset_name,
				"titleTooltip": "Name of the dataset",
				"datasetId": dataGroup.id,
				"methodId": dataGroup.method_id,
				"exportFormats": ["pdf"],
				"datasetReference": this.sqs.renderBiblioReference(siteData, datasetBiblioIds),
				"datasetReferencePlain": this.sqs.renderBiblioReference(siteData, datasetBiblioIds, false),
				"datasetContacts": this.sqs.renderContacts(siteData, datasetContacts),
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
					"title": "Abundance ID",
					"hidden": "true",
					"pkey": true,
				},
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
					"pkey": false,
					"title": "Sample id"
				},
				{
					"hidden": "true",
					"pkey": false,
					"title": "Taxon id"
				},
			];
			
			dataGroup.values.forEach((value => {

				let elementsValue = "";
				let elementsTooltip = "";

				let abundanceElements = this.getEntriesFromLookupTable(siteData, "abundance_elements", "abundance_element_id", [value.value.abundance_element_id]);
				if(abundanceElements && abundanceElements.length > 0) {
					elementsValue = abundanceElements[0].element_name;
					elementsTooltip = abundanceElements[0].element_description;
				}

				let modificationsValue = "";

				let modificationIds = [];
				value.value.modifications.forEach(item => {
					modificationIds.push(item.modification_type_id);
				});

				if(modificationIds.length > 0) {
					let modifications = this.getEntriesFromLookupTable(siteData, "abundance_modifications", "modification_type_id", modificationIds);
					modifications.forEach(mod => {
						modificationsValue += "!%data:"+mod.modification_type_name+":!%tooltip:"+mod.modification_type_description+":!, ";
					});
					modificationsValue = modificationsValue.substring(0, modificationsValue.length-2);
				}

				let identificationLevelsValue = "";
				value.value.identification_levels.forEach(idlvlItem => {
					identificationLevelsValue += idlvlItem.identification_level_name+", ";
				});
				identificationLevelsValue = identificationLevelsValue.substring(0, identificationLevelsValue.length-2);

				let taxon = this.getTaxonByIdFromLookup(siteData, value.value.taxon_id);

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
						"value": value.value.abundance_id
					},
					{
						"type": "cell",
						"value": value.sample_name
					},
					{
						"type": "cell",
						"value": value.value.abundance
					},
					{
						"type": "cell",
						"value": this.sqs.formatTaxon(taxon, value.value.identification_levels, true, true),
						"rawValue": taxon,
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
						"value": value.physical_sample_id
					},
					{
						"type": "cell",
						"value": value.value.taxon_id
					},
				]);
			}));
			
			section.contentItems.push(contentItem);
		});

		if(palaeontomolyDatasetFound) {
			let ecoCodeSection = this.getSectionByMethodId(3, sections);
			if(ecoCodeSection) {
				//these two get eco codes methods actually return promises, but that's ok, the content-item renderer will handle that
				let siteEcoCodeContentItem = this.getSiteEcoCodeContentItem(siteData);
				let sampleEcoCodeContentItem = this.getSamplesEcoCodeContentItem(siteData);

				if(siteEcoCodeContentItem) {
					ecoCodeSection.contentItems.push(siteEcoCodeContentItem);
				}
				if(sampleEcoCodeContentItem) {
					ecoCodeSection.contentItems.push(sampleEcoCodeContentItem);
				}
			}
			else {
				console.warn("Tried to insert a contentItem into a section that couldn't be found.");
			}
		}
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

				let taxon = this.sqs.getTaxaById(ab.taxonId);
				
				let taxonFormatted = "notaxa";
				if(typeof(taxon != false)) {
					taxonFormatted = this.sqs.formatTaxon(taxon, ab.taxon_identification_levels, true, false);
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
			"exportFormats": ["pdf"],
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