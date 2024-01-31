import css from '../../../stylesheets/style.scss';
import { nanoid } from 'nanoid';
/*
* Class: Samples
 */
class Samples {
	constructor(sqs, site) {
		this.sqs = sqs;
		//this.siteReport = this.sqs.siteReportManager.siteReport;
		this.site = site;
		this.buildComplete = false;
		this.auxiliaryDataFetched = false;
		this.data = {
			"sampleGroups": []
		};
	}

	async fetch() {
	}

	includeSampleDimensionsColumn(sampleGroup) {
		for(let k in sampleGroup.physical_samples) {
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

	insertSampleDimensionsIntoTable(subTable, sampleGroup, siteData = null) {
		let insertSampleDimensionColumn = false;
		for(let k in sampleGroup.physical_samples) {
			var sample = sampleGroup.physical_samples[k];
			if(sample.dimensions.length > 0) {
				insertSampleDimensionColumn = true;
			}
		}

		if(insertSampleDimensionColumn) {
			subTable.columns.push({
				"title": "Sample dimensions"
			});

			for(let k in sampleGroup.physical_samples) {
				var sample = sampleGroup.physical_samples[k];
				subTable.rows.forEach(row => {
					if(row[0].value == sample.sample_name) {
						
						let cellText = "";
						let unitText = "";
						let units = [];

						sample.dimensions.forEach(dim => {
							if(dim.unit_id) {
								units.push(dim.unit_id);
							}
						});

						units = units.filter((value, index, self) => {
							return self.indexOf(value) === index;
						});

						let useIndividualUnits = false;
						if(units.length > 1) {
							//These units are not all the same
							useIndividualUnits = true;
						}
						

						sample.dimensions.forEach(dim => {
							let value = dim.dimension_value;
							let floatVal = parseFloat(dim.dimension_value)

							if(dim.unit_id) {
								for(let key in siteData.lookup_tables.units) {
									if(siteData.lookup_tables.units[key].unit_id == dim.unit_id) {
										let descText = siteData.lookup_tables.units[key].unit_name+" - "+siteData.lookup_tables.units[key].description;
										unitText = "!%data:"+siteData.lookup_tables.units[key].unit_abbrev+":!%tooltip:"+descText+":!";
									}
								}
							}

							if(floatVal) {
								value = floatVal;
							}

							if(useIndividualUnits) {
								cellText += value+" "+unitText+" x ";
							}
							else {
								cellText += value+" x ";
							}
							
						});

						cellText = cellText.substring(0, cellText.length - 3);
						if(!useIndividualUnits) {
							cellText += " "+unitText;
						}

						row.push({
							"value": cellText,
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
		for(let k in sampleGroup.physical_samples) {
			var sample = sampleGroup.physical_samples[k];
			if(sample.descriptions.length > 0) {
				insertSampleDescriptionsColumn = true;
			}
		}

		if(insertSampleDescriptionsColumn) {
			subTable.columns.push({
				"title": "Sample descriptions"
			});

			for(let k in sampleGroup.physical_samples) {
				var sample = sampleGroup.physical_samples[k];
				let descriptionValue = "";
				sample.descriptions.forEach(desc => {
					let ttId = "tt-"+nanoid();
					descriptionValue += "<span id='"+ttId+"'>"+desc.description+"</span>, ";
					this.sqs.tooltipManager.registerTooltip("#"+ttId, "<h4 class='tooltip-header'>"+desc.type_name+"</h4>"+desc.type_description+"<hr/>"+desc.description, { drawSymbol: true });
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
		for(let k in sampleGroup.physical_samples) {
			var sample = sampleGroup.physical_samples[k];
			if(sample.locations.length > 0) {
				insertSampleLocationsColumn = true;
			}
		}

		if(insertSampleLocationsColumn) {
			subTable.columns.push({
				"title": "Sample locations"
			});

			for(let k in sampleGroup.physical_samples) {
				var sample = sampleGroup.physical_samples[k];
				let cellValue = "";
				sample.locations.forEach(data => {
					let ttId = "tt-"+nanoid();
					cellValue += "<span id='"+ttId+"'>"+data.location+"</span>, ";
					this.sqs.tooltipManager.registerTooltip("#"+ttId, "<h4 class='tooltip-header'>"+data.location_type+"</h4>"+data.location_type_description+"<hr/>"+data.location, { drawSymbol: true });
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

	insertSampleCoordinatesIntoTable(subTable, sampleGroup) {
		let siteData = this.sqs.siteReportManager.siteReport.siteData;

		let insertSampleCoordinatesColumn = false;
		for(let k in sampleGroup.physical_samples) {
			var sample = sampleGroup.physical_samples[k];
			if(sample.coordinates.length > 0) {
				insertSampleCoordinatesColumn = true;
			}
		}

		if(insertSampleCoordinatesColumn) {
			subTable.columns.push({
				"title": "Coordinates",
				"role": "coordinates"
			});

			for(let k in sampleGroup.physical_samples) {
				var sample = sampleGroup.physical_samples[k];

				if(typeof sample.coordinates == "undefined") {
					continue;
				}

				//link up coordinate methods and dimensions to each coordinate
				sample.coordinates.forEach(coord => {
					siteData.lookup_tables.coordinate_methods.forEach(cm => {
						if(cm.method_id == coord.coordinate_method_id) {
							coord.coordinate_method = cm;
						}
					});
	
					siteData.lookup_tables.dimensions.forEach(dim => {
						if(dim.dimension_id == coord.dimension_id) {
							coord.dimension = dim;
						}
					});
				});

				//sort coordinates by dimension name
				sample.coordinates.sort((a, b) => {
					if(a.dimension.dimension_name < b.dimension.dimension_name) {
						return -1;
					}
				});

				
				subTable.rows.forEach(row => {
					if(row[0].value == sample.sample_name) {
						row.push({
							"value": this.formatCoordinates(sample.coordinates),
							"type": "cell",
							"tooltip": "",
							"data": sample.coordinates
						});
					}
				});
			}
		}
	}

	insertSampleAltRefsIntoTable(subTable, sampleGroup) {
		let insertColumn = false;
		for(let k in sampleGroup.physical_samples) {
			var sample = sampleGroup.physical_samples[k];
			if(sample.alt_refs.length > 0) {
				insertColumn = true;
			}
		}

		if(insertColumn) {
			subTable.columns.push({
				"title": "Alternative identifiers"
			});
			

			for(let k in sampleGroup.physical_samples) {
				var sample = sampleGroup.physical_samples[k];
				let cellValue = "";
				sample.alt_refs.forEach(data => {
					let ttId = "tt-"+nanoid();
					cellValue += "<span id='"+ttId+"'>"+data.alt_ref+"</span>, ";
					this.sqs.tooltipManager.registerTooltip("#"+ttId, "<h4 class='tooltip-header'>"+data.alt_ref_type+"</h4>"+data.description+"<hr/>"+data.alt_ref, { drawSymbol: true });
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

	getMethodFromDatasetId(site, datasetId) {
		for(let key in site.datasets) {
			if(site.datasets[key].dataset_id == datasetId) {
				for(let alKey in site.lookup_tables.analysis_methods) {
					if(site.lookup_tables.analysis_methods[alKey].method_id == site.datasets[key].method_id) {
						return site.lookup_tables.analysis_methods[alKey];
					}
				}
			}
		}
		return null;
	}

	insertSampleAnalysesIntoTable(table, site) {
		let sampleGroupColKey = null;
		for(let key in table.columns) {
			if(table.columns[key].pkey === true) {
				sampleGroupColKey = key;
			}
		}

		for(let key in table.rows) {
			let row = table.rows[key];
			let sampleGroupId = row[sampleGroupColKey].value;
			let analysisMethodsTags = [];
			for(let sgKey in site.sample_groups) {
				if(site.sample_groups[sgKey].sample_group_id == sampleGroupId) {
					site.sample_groups[sgKey].datasets.forEach(dataset => {
						let method = this.getMethodFromDatasetId(site, dataset);

						let found = false;
						analysisMethodsTags.forEach(methodTag => {
							if(methodTag.method_id == method.method_id) {
								found = true;
							}
						});
						if(!found) {
							analysisMethodsTags.push(method);
						}
					});
				}
			}
			let value = "<div class='analyses-tags-container'>";
			analysisMethodsTags.forEach(methodTag => {
				value += this.getAnalysisTag(site, methodTag)+" ";
				
			});
			value += "</div>";
			row.push({
				"type": "cell",
				"value": value,
				"tooltip": ""
			});
		}
		
		table.columns.push({
			"dataType": "string",
			"pkey": false,
			"title": "Analysis methods"
		});
	}

	getAnalysisTag(site, method) {
		let analysisTagId = "analysis-tag-"+nanoid();

		this.sqs.tooltipManager.registerTooltip("#"+analysisTagId, (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			let siteReport = this.sqs.siteReportManager.siteReport;
			for(let key in siteReport.data.sections) {
				let section = siteReport.data.sections[key];
				if(section.name == "analyses") {
					section.sections.forEach(l2Section => {
						if(method.method_id == l2Section.name) {
							l2Section.collapsed = false;
							this.sqs.siteReportManager.siteReport.setSectionCollapsedState($("#site-report-section-"+l2Section.name)[0], l2Section);

							setTimeout(() => {
								$("#site-report-section-"+l2Section.name)[0].scrollIntoView({
									behavior: "smooth",
								});
							}, 1000);
							
						}
					});
				}
			}
		}, {
			eventType: "click"
		});

		return "<div id='"+analysisTagId+"' class='sample-group-analysis-tag'>"+method.method_abbrev_or_alt_name+"</div>";
	}

	insertSampleGroupCoordinatesIntoTable(table, sampleGroups) {
		let insertSampleGroupCoordinatesColumn = false;
		sampleGroups.forEach(sg => {
			if(sg.coordinates.length > 0) {
				insertSampleGroupCoordinatesColumn = true;
			}
		});

		if(insertSampleGroupCoordinatesColumn) {
			table.columns.push({
				"title": "Coordinates",
				"role": "coordinates"
			});
		}

		table.rows.forEach(row => {
			let sampleGroupId = row[1].value;
			sampleGroups.forEach(sg => {
				if(sg.sample_group_id == sampleGroupId && sg.coordinates.length) {
					row.push({
						"value": this.formatCoordinates(sg.coordinates),
						"type": "cell",
						"tooltip": "",
						"data": sg.coordinates
					});
				}
			});
		});

	}
	
	formatCoordinates(coords) {
		let siteData = this.sqs.siteReportManager.siteReport.siteData;

		let cellValue = "";
		coords.forEach(coord => {
			let coordMethod = null;
			siteData.lookup_tables.coordinate_methods.forEach(cm => {
				if(cm.method_id == coord.coordinate_method_id) {
					coordMethod = cm;
				}
			});

			let dimension = null;
			siteData.lookup_tables.dimensions.forEach(dim => {
				if(dim.dimension_id == coord.dimension_id) {
					dimension = dim;
				}
			});

			let unit = null;
			siteData.lookup_tables.units.forEach(u => {
				if(u.unit_id == coordMethod.unit_id) {
					unit = u;
				}
			});

			if(typeof dimension == "undefined" || dimension == null || typeof dimension.dimension_name == "undefined") {
				console.warn("WARN: Dimension not found for coordinate: ", coord);
				return;
			}

			if(typeof coordMethod == "undefined" || coordMethod == null || typeof coordMethod.method_name == "undefined") {
				console.warn("WARN: Coordinate method not found for coordinate: ", coord);
				return;
			}

			let ttId = "tt-"+nanoid();
			if(coord.accuracy != null) {
				cellValue += "<span id='"+ttId+"'>"+dimension.dimension_name+" "+coord.measurement+" ("+coord.accuracy+")</span>, ";
			}
			else {
				cellValue += "<span id='"+ttId+"'>"+dimension.dimension_name+" "+coord.measurement+"</span>, ";
			}
			
			let ttContent = "<h4 class='tooltip-header'>Coordinate system</h4>"+coordMethod.method_name+"<hr/>"+coordMethod.description;
			if(typeof unit != "undefined" && unit != null) {
				ttContent += "<br/><br/><span>Coordinates are specified in "+unit.unit_name+".</span>";
			}
			this.sqs.tooltipManager.registerTooltip("#"+ttId, ttContent, { drawSymbol: true });
		
		});
		cellValue = cellValue.substring(0, cellValue.length-2);
		return cellValue;
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

				//find table pkey (sample group id)
				let tablePkey = null;
				table.columns.forEach((col, key) => {
					if(col.pkey === true) {
						tablePkey = key;
					}
				});

				table.rows.forEach(row => {
					if(row[tablePkey].value == sg.sample_group_id) {
						let cellValue = "!%data:"+"<i class='fa fa-book' aria-hidden='true'></i>"+":!%tooltip:"+cellDesc+":!";
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
			/*
			{
				"dataType": "string",
				"pkey": false,
				"title": "Expand"
			},
			*/
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
				"title": "Sampling context"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Sampling method"
			},
		];

		let siteHasSampleGroupDescriptions = false;
		for(let key in siteData.sample_groups) {
			if(siteData.sample_groups[key].descriptions.length > 0) {
				siteHasSampleGroupDescriptions = true;
			}
		}
		if(siteHasSampleGroupDescriptions) {
			sampleGroupColumns.push({
				"dataType": "string",
				"pkey": false,
				"title": "Descriptions"
			});
		}
		
		/*
		let siteHasSampleGroupCoordinates = false;
		for(let key in siteData.sample_groups) {
			if(siteData.sample_groups[key].coordinates.length > 0) {
				siteHasSampleGroupCoordinates = true;
			}
		}
		if(siteHasSampleGroupCoordinates) {
			sampleGroupColumns.push({
				"dataType": "string",
				"hidden": false,
				"title": "Coordinates"
			});
		}
		*/

		let sampleGroupRows = [];

		let sampleGroupTable = {
			columns: sampleGroupColumns,
			rows: sampleGroupRows
		}
		
		for(let key in siteData.sample_groups) {
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

			for(let k in sampleGroup.physical_samples) {
				var sample = sampleGroup.physical_samples[k];
				
				let subTableRow = [
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
				];

				subTable.rows.push(subTableRow);
			}

			this.insertSampleDimensionsIntoTable(subTable, sampleGroup, siteData);
			this.insertSampleDescriptionsIntoTable(subTable, sampleGroup);
			this.insertSampleLocationsIntoTable(subTable, sampleGroup);
			this.insertSampleAltRefsIntoTable(subTable, sampleGroup);
			this.insertSampleCoordinatesIntoTable(subTable, sampleGroup);

			let samplingContextValue = "";
			sampleGroup.sampling_context.forEach(samplingContext => {
				let ttId = "tt-"+nanoid();
				samplingContextValue += "<span id='"+ttId+"'>"+samplingContext.sampling_context+"</span>, ";
				this.sqs.tooltipManager.registerTooltip("#"+ttId, samplingContext.description, { drawSymbol: true });
			});
			samplingContextValue = samplingContextValue.substring(0, samplingContextValue.length-2);

			let sampleGroupDescriptionCutLength = 30;
			let sampleGroupDescriptionsStringValue = "";
			sampleGroup.descriptions.forEach(desc => {
				let ttId = "tt-"+nanoid();
				let groupdDescriptionShort = desc.group_description;
				if(desc.group_description.length > sampleGroupDescriptionCutLength) {
					groupdDescriptionShort = desc.group_description.substring(0, 15)+"...";
				}
				sampleGroupDescriptionsStringValue += "<span id='"+ttId+"'>"+groupdDescriptionShort+"</span>, ";
				this.sqs.tooltipManager.registerTooltip("#"+ttId, "<h4 class='tooltip-header'>"+desc.type_name+"</h4>"+desc.type_description+"<hr/>"+desc.group_description, { drawSymbol: true });
			});
			sampleGroupDescriptionsStringValue = sampleGroupDescriptionsStringValue.substring(0, sampleGroupDescriptionsStringValue.length-2);
			
			let samplingMethod = this.getSamplingMethodById(siteData, sampleGroup.sampling_method_id);

			let sampleGroupRow = [
				{
					"type": "subtable",
					"value": subTable
				},
				/*
				{
					"type": "cell",
					"value": "<i class=\"fa fa-plus-circle subtable-expand-button\" aria-hidden=\"true\"></i>",
					"tooltip": "Expand to view the individual samples in this sample group."
				},
				*/
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
					"value": samplingContextValue,
				},
				{
					"type": "cell",
					"value": samplingMethod.method_name,
					"tooltip": samplingMethod.description == null ? "" : samplingMethod.description
				},
			];

			if(siteHasSampleGroupDescriptions) {
				sampleGroupRow.push({
					"type": "cell",
					"value": sampleGroupDescriptionsStringValue, //descriptions
				});
			}

			sampleGroupRows.push(sampleGroupRow);	
		}

		this.insertSampleAnalysesIntoTable(sampleGroupTable, siteData);
		this.insertSampleGroupReferencesIntoTable(sampleGroupTable, siteData.sample_groups);
		this.insertSampleGroupCoordinatesIntoTable(sampleGroupTable, siteData.sample_groups);

		var section = {
			"name": "samples",
			"title": "Overview",
			"collapsed": false,
			"contentItems": [{
				"name": "sampleGroups",
				"title": "Sample groups",
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

		//Only include the sample groups with coordinates as coordinate chart options
		let sampleGroupsWithCoordinates = [];
		siteData.sample_groups.forEach(sampleGroup => {
			let sampleGroupHasSampleWithCoordinates = false;
			sampleGroup.physical_samples.forEach(sample => {
				if(typeof sample.coordinates != "undefined" && sample.coordinates.length > 0) {
					sampleGroupHasSampleWithCoordinates = true;
				}
			});


			//also check if the sample group itself has coordinates
			if(typeof sampleGroup.coordinates != "undefined" && sampleGroup.coordinates.length > 0) {
				sampleGroupHasSampleWithCoordinates = true;
			}

			if(sampleGroupHasSampleWithCoordinates) {
				sampleGroupsWithCoordinates.push(sampleGroup);
			}
		});


		if(sampleGroupsWithCoordinates.length > 0) {
			let roOptions = sampleGroupsWithCoordinates.map(sg => { return { title: sg.sample_group_name, selected: false, value: sg.sample_group_id }; });
			//prepend an "all" option
			roOptions.unshift({ title: "All", selected: true, value: "all" });
	
			let biblioIds = [];
			siteData.sample_groups.forEach(sampleGroup => {
				sampleGroup.biblio.forEach(biblio => {
					if(biblioIds.indexOf(biblio.biblio_id) == -1) {
						biblioIds.push(biblio.biblio_id);
					}
				});
			});

			let sampleCoordinatesContentItem = {
				"name": "sampleCoordinatesMap",
				"title": "Sample coordinates",
				"datasetReference": this.sqs.renderBiblioReference(siteData, biblioIds),
				"datasetContacts": "",
				"collapsed": false,
				"data": {
					"columns": sampleGroupColumns,
					"rows": sampleGroupRows
				},
				"renderOptions": [{
					"selected": true,
					"enabled": true,
					"type": "coordinate-map",
					"name": "Map",
					"options": [{
						"name": "sampleGroup",
						"title": "Sample group",
						"type": "select",
						"options": roOptions
					}]
				}]
			}

			section.contentItems.push(sampleCoordinatesContentItem);
		}

		return section;
	}
	
	getSamplingMethodById(siteData, samplingMethodId) {
		for(let key in siteData.lookup_tables.sampling_methods) {
			if(siteData.lookup_tables.sampling_methods[key].method_id == samplingMethodId) {
				return siteData.lookup_tables.sampling_methods[key];
			}
		}
		return null;
	}
	
	/*
	* Function: render
	*
	* Renders samples table. Although it uses the renderSection function in the SiteReport class,
	* so it really just compiles the data in an appropriate format and hands it over.
	*
	 */
	async render(siteData) {
		let section = this.compileSectionStruct(siteData);
		let renderPromise = this.sqs.siteReportManager.siteReport.renderSection(section);
	}
	
	getSampleGroupById(sampleGroupId) {
		for(let key in this.data.sampleGroups) {
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