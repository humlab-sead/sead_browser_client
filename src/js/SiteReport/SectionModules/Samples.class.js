import css from '../../../stylesheets/style.scss';

/*
* Class: Samples
 */
class Samples {
	constructor(sqs, siteId) {
		this.sqs = sqs;
		//this.siteReport = this.sqs.siteReportManager.siteReport;
		this.siteId = siteId;
		this.buildComplete = false;
		this.auxiliaryDataFetched = false;
		this.data = {
			"sampleGroups": []
		};
	}

	includeSampleDimensionsColumn(sampleGroup) {
		for(var k in sampleGroup.physical_samples) {
			var sample = sampleGroup.physical_samples[k];
			if(sample.dimensions.length > 0) {
				return true;
			}
		}
		return false;
		if(includeSampleDimensionsColumn) {
			subTableColumns.push({
				"title": "Sample dimensions"
			})
		}
	}

	insertSampleDimensionsIntoTable(subTable, sampleGroup) {
		let insertSampleDimensionColumn = false;
		for(var k in sampleGroup.physical_samples) {
			var sample = sampleGroup.physical_samples[k];
			if(sample.dimensions.length > 0) {
				insertSampleDimensionColumn = true;
			}
		}

		if(insertSampleDimensionColumn) {
			subTable.columns.push({
				"title": "Sample dimensions"
			});

			for(var k in sampleGroup.physical_samples) {
				var sample = sampleGroup.physical_samples[k];
				subTable.rows.forEach(row => {
					if(row[0].value == sample.sample_name) {
						row.push({
							"value": sample.dimensions,
							"type": "cell",
							"tooltip": ""
						});
					}
				});
			}
		}
	}

	insertSampleDescriptionsIntoTable(subTable, sampleGroup) {
		let insertSampleDescriptionsColumn = false;
		for(var k in sampleGroup.physical_samples) {
			var sample = sampleGroup.physical_samples[k];
			if(sample.descriptions.length > 0) {
				insertSampleDescriptionsColumn = true;
			}
		}

		if(insertSampleDescriptionsColumn) {
			subTable.columns.push({
				"title": "Sample descriptions"
			});

			for(var k in sampleGroup.physical_samples) {
				var sample = sampleGroup.physical_samples[k];
				let descriptionValue = "";
				sample.descriptions.forEach(desc => {
					descriptionValue += desc.description+", ";
				});
				descriptionValue = descriptionValue.substring(0, descriptionValue.length-2);
				subTable.rows.forEach(row => {
					if(row[0].value == sample.sample_name) {
						row.push({
							"value": descriptionValue,
							"type": "cell",
							"tooltip": ""
						});
					}
				});
			}
		}
	}

	insertSampleLocationsIntoTable(subTable, sampleGroup) {
		let insertSampleLocationsColumn = false;
		for(var k in sampleGroup.physical_samples) {
			var sample = sampleGroup.physical_samples[k];
			if(sample.locations.length > 0) {
				insertSampleLocationsColumn = true;
			}
		}

		if(insertSampleLocationsColumn) {
			subTable.columns.push({
				"title": "Sample locations"
			});

			for(var k in sampleGroup.physical_samples) {
				var sample = sampleGroup.physical_samples[k];
				let cellValue = "";
				sample.locations.forEach(data => {
					cellValue += data.location+", ";
				});
				cellValue = cellValue.substring(0, cellValue.length-2);
				subTable.rows.forEach(row => {
					if(row[0].value == sample.sample_name) {
						row.push({
							"value": cellValue,
							"type": "cell",
							"tooltip": ""
						});
					}
				});
			}
		}
	}

	insertSampleAltRefsIntoTable(subTable, sampleGroup) {
		let insertColumn = false;
		for(var k in sampleGroup.physical_samples) {
			var sample = sampleGroup.physical_samples[k];
			if(sample.alt_refs.length > 0) {
				insertColumn = true;
			}
		}

		if(insertColumn) {
			subTable.columns.push({
				"title": "Alternative identifiers"
			});

			for(var k in sampleGroup.physical_samples) {
				var sample = sampleGroup.physical_samples[k];
				let cellValue = "";
				sample.alt_refs.forEach(data => {
					/*
					if(data.alt_ref_type) {
						cellValue += data.alt_ref_type+": ";
					}
					
					cellValue += data.alt_ref+", ";
					*/
					cellValue += "%data:"+data.alt_ref+":!%tooltip:"+data.alt_ref_type+" - "+data.description+":!, ";
				});
				cellValue = cellValue.substring(0, cellValue.length-2);
				subTable.rows.forEach(row => {
					if(row[0].value == sample.sample_name) {
						row.push({
							"value": cellValue,
							"type": "cell",
							"tooltip": "",
						});
					}
				});
			}
		}
	}

	insertSampleGroupReferencesIntoTable(table, sampleGroups) {
		let insertSampleGroupReferensesColumn = false;
		sampleGroups.forEach(sg => {
			if(sg.biblio.length > 0) {
				insertSampleGroupReferensesColumn = true;
			}
		});

		if(insertSampleGroupReferensesColumn) {
			table.columns.push({
				"title": "References"
			});

			sampleGroups.forEach(sg => {
				let cellDesc = "";
				sg.biblio.forEach(biblio => {
					cellDesc += biblio.title+", "+biblio.year+", ";
					if(biblio.author) {
						cellDesc += biblio.author;
					}
					else {
						cellDesc += "&lt;Author missing&gt;";
					}
					cellDesc += " | "
				});
				cellDesc = cellDesc.substring(0, cellDesc.length-3);

				table.rows.forEach(row => {
					if(row[1].value == sg.sample_group_id) {
						let cellValue = "%button:"+"<i class='fa fa-book' aria-hidden='true'></i>"+":!%tooltip:"+cellDesc+":!, ";
						row.push({
							"value": cellValue,
							"type": "cell",
							"tooltip": ""
						});
					}
				});

			});
		}

	}

	compileSectionStruct(siteData) {

		let sampleGroupColumns = [
			{
				"dataType": "subtable",
				"pkey": false
			},
			{
				"dataType": "number",
				"pkey": true,
				"title": "Sample group id"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Group name"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Sampling method"
			}
		];

		let sampleGroupRows = [];
		
		let sampleGroupTable = {
			columns: sampleGroupColumns,
			rows: sampleGroupRows
		}
		
		for(var key in siteData.sample_groups) {
			var sampleGroup = siteData.sample_groups[key];
			
			
			
			var subTableColumns = [
				{
					"pkey": true,
					"title": "Sample name"
				},
				{
					"title": "Sample type"
				}
			];
			
			var subTable = {
				"columns": subTableColumns,
				"rows": []
			};
			
			for(var k in sampleGroup.physical_samples) {
				var sample = sampleGroup.physical_samples[k];

				subTable.rows.push([
					{
						"type": "cell",
						"value": sample.sample_name,
						"tooltip": ""
					},
					{
						"type": "cell",
						"value": sample.sample_type_name,
						"tooltip": sample.sample_type_description == null ? "" : sample.sample_type_description
					}
				]);
				
			}

			this.insertSampleDimensionsIntoTable(subTable, sampleGroup);
			this.insertSampleDescriptionsIntoTable(subTable, sampleGroup);
			this.insertSampleLocationsIntoTable(subTable, sampleGroup);
			this.insertSampleAltRefsIntoTable(subTable, sampleGroup);

			sampleGroupRows.push([
				{
					"type": "subtable",
					"value": subTable
				},
				{
					"type": "cell",
					"value": sampleGroup.sample_group_id,
					"tooltip": ""
				},
				{
					"type": "cell",
					"value": sampleGroup.sample_group_name,
					"tooltip": sampleGroup.sample_group_description == null ? "" : sampleGroup.sample_group_description
				},
				{
					"type": "cell",
					"value": sampleGroup.sampling_method.method_name,
					"tooltip": sampleGroup.sampling_method.description == null ? "" : sampleGroup.sampling_method.description
				}
			]);
			
		}

		this.insertSampleGroupReferencesIntoTable(sampleGroupTable, siteData.sample_groups);

		var section = {
			"name": "samples",
			"title": "Overview",
			"collapsed": false,
			"contentItems": [{
				"name": "sampleGroups",
				"title": "Samples taken (groupings)",
				"data": {
					"columns": sampleGroupColumns,
					"rows": sampleGroupRows
				},
				"renderOptions": [{
					"selected": true,
					"type": "table",
					"name": "Spreadsheet",
					"options": [
						{
							"showControls": false,
							"name": "columnsVisibility",
							"hiddenColumns": [
								3
							]
						}
					]
				}]
			}]
		};

		return section;
	}
	
	
	/*
	* Function: render
	*
	* Renders samples table. Although it uses the renderSection function in the SiteReport class,
	* so it really just compiles the data in an appropriate format and hands it over.
	*
	 */
	render(siteData) {
		let section = this.compileSectionStruct(siteData);
		let renderPromise = this.sqs.siteReportManager.siteReport.renderSection(section);
		/*
		renderPromise.then(() => {
			this.fetchAuxiliaryData(); //Lazy-loading this, which is why it's here and not up amoing the other fetch-calls
		})
		*/
	}

	/*
	* Function: fetch
	*
	* Will fetch the sample groups.
	*
	 */
	async fetch() {
		await new Promise((resolve, reject) => {
			$.ajax(this.sqs.config.siteReportServerAddress+"/qse_sample_group?site_id=eq."+this.siteId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					let auxiliaryFetchPromises = [];
					for(var key in data) {
						var sampleGroup = data[key];
						var sampleGroupKey = this.sqs.findObjectPropInArray(this.data.sampleGroups, "sampleGroupId", sampleGroup.sample_group_id);
						
						if(sampleGroupKey === false) {
							this.data.sampleGroups.push({
								"sampleGroupId": sampleGroup.sample_group_id,
								"methodId": sampleGroup.method_id,
								"methodAbbreviation": sampleGroup.method_abbrev_or_alt_name,
								"methodDescription": sampleGroup.method_description,
								"methodName": sampleGroup.method_name,
								"sampleGroupDescription": sampleGroup.sample_group_description,
								"sampleGroupDescriptionTypeDescription": sampleGroup.sample_group_description_type_description,
								"sampleGroupDescriptionTypeName": sampleGroup.sample_group_description_type_name,
								"sampleGroupName": sampleGroup.sample_group_name,
								"samplingContextId": sampleGroup.sampling_context_id,
								"samples": []
							});
							

							auxiliaryFetchPromises.push(this.fetchSampleGroupBiblio(sampleGroup.sample_group_id));
							auxiliaryFetchPromises.push(this.fetchSamples(sampleGroup.sample_group_id));
							auxiliaryFetchPromises.push(this.fetchSampleGroupAnalyses(sampleGroup.sample_group_id));
						}
						
					}

					Promise.all(auxiliaryFetchPromises).then((data) => {
						this.render();
						this.buildComplete = true;
					});

					resolve(data);
				},
				error: () => {
					reject();
				}
			});
		});
	}
	
	async fetchSampleGroupAnalyses(sampleGroupId) {
		return await new Promise((resolve, reject) => {
			$.ajax(this.sqs.config.siteReportServerAddress+"/qse_sample_group_analyses?sample_group_id=eq."+sampleGroupId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					for(let key in this.data.sampleGroups) {
						if(typeof this.data.sampleGroups[key].analyses == "undefined") {
							this.data.sampleGroups[key].analyses = [];
						}
						for(let ak in data) {
							let analysis = data[ak];
							if(this.data.sampleGroups[key].sampleGroupId == analysis.sample_group_id) {
								this.data.sampleGroups[key].analyses.push(analysis);
							}
						}
					}
					resolve(data);
				},
				error: () => {
					reject();
				}
			});
		});
	}

	async fetchSampleGroupBiblio(sampleGroupId) {
		return await new Promise((resolve, reject) => {
			$.ajax(this.sqs.config.siteReportServerAddress+"/qse_sample_group_biblio?sample_group_id=eq."+sampleGroupId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					var sampleGroup = this.getSampleGroupById(sampleGroupId);
					sampleGroup.biblio = data;
					resolve(data);
				},
				error: () => {
					reject();
				}
			});
		});
	}
	
	async fetchSamples(sampleGroupId) {
		return await new Promise((resolve, reject) => {
			$.ajax(this.sqs.config.siteReportServerAddress+"/qse_sample?sample_group_id=eq."+sampleGroupId, {
				method: "get",
				dataType: "json",
				success: (data, textStatus, xhr) => {
					for(var key in data) {
						var sampleGroupKey = this.sqs.findObjectPropInArray(this.data.sampleGroups, "sampleGroupId", data[key].sample_group_id);
						var sample = {
							"sampleId": data[key].physical_sample_id,
							"sampleTypeId": data[key].sample_type_id,
							"sampleTypeName": data[key].sample_type_name,
							"sampleName": data[key].sample_name,
							"sampleTypeDescription": data[key].sample_type_description
						};
						this.data.sampleGroups[sampleGroupKey].samples.push(sample);
						//this.fetchSampleModifiers(data[key].physical_sample_id, sample);
						//this.fetchSampleDimensions(data[key].physical_sample_id, sample); //FIXME: Yeah... this is a performance-hog and it turns out empty at least some of the time anyway... so... that's gonna be a no from me dog
						
					}
					
					resolve(data);
				},
				error: () => {
					reject();
				}
			});
		});
	}
	
	fetchSampleModifiers(sampleId, targetCell) {
		var xhr1 = this.sqs.pushXhr(null, "fetchSampleModifiers");
		xhr1.xhr = $.ajax(this.sqs.config.siteReportServerAddress+"/qse_sample_modifiers?physical_sample_id=eq."+sampleId, {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				console.log(data);
				
				//$("#"+targetCell).html(d);
				this.sqs.popXhr(xhr1);
			}
		});
	}

	async fetchSampleDimensions(sampleId, sampleStruct) {
		let data = await $.ajax(this.sqs.config.siteReportServerAddress+"/qse_sample_dimensions?physical_sample_id=eq."+sampleId, {
			method: "get",
			dataType: "json",
			success: (data, textStatus, xhr) => {
				var d = "";
				for(var key in data) {

					let unit = data[key].unit_abbrev;
					if(unit == "") {
						unit = "ukn unit";
					}

					d += data[key].dimension_value+" "+unit;
					if(key != data.length-1) {
						d += ", ";
					}
				}
				sampleStruct.sampleDimensions = d;
			}
		});

		return data;
	}

	/*
	* Function: fetchAuxiliaryData
	*
	* Fetches extra data (normally triggered for exports) that is normally not fetched (or presented) in the site reports because of the cost of fetching it.
	*/
	async fetchAuxiliaryData() {
		let fetchPromises = [];
		this.data.sampleGroups.forEach((sampleGroup) => {
			sampleGroup.samples.forEach(async (sample) => {
				fetchPromises.push(this.fetchSampleDimensions(sample.sampleId, sample));
			});
		});

		Promise.all(fetchPromises).then(() => {
			let section = this.compileSectionStruct();
			this.sqs.siteReportManager.siteReport.updateSection(section);
			this.auxiliaryDataFetched = true;
		});
	}
	
	getSampleGroupById(sampleGroupId) {
		for(var key in this.data.sampleGroups) {
			if(this.data.sampleGroups[key].sampleGroupId == sampleGroupId) {
				return this.data.sampleGroups[key];
			}
		}
		return false;
	}
	
	destroy() {
	}
}

export { Samples as default }