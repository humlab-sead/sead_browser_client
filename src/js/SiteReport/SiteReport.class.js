import { Buffer } from 'buffer';
import { nanoid } from 'nanoid';
import Config from '../../config/config.json';
import ContentItemRenderer from './ContentItemRenderer.class';
import BasicSiteInformation from './SectionModules/BasicSiteInformation.class';
import Samples from './SectionModules/Samples.class';
import Analysis from './SectionModules/Analysis.class';
import EcoCodes from './SectionModules/EcoCodes.class';
import Plotly from "plotly.js-dist-min";
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import { Vector as VectorLayer } from 'ol/layer';
import { GeoJSON } from 'ol/format';
/*
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
pdfMake.vfs = pdfFonts.pdfMake.vfs;
*/

/*
* Class: SiteReport
*
*
*/

class SiteReport {
	constructor(siteReportManager, siteId) {
		console.log("New siteReport for site", siteId);
		this.siteReportManager = siteReportManager;
		this.sqs = this.siteReportManager.sqs;
		this.siteId = siteId;
		this.animationTime = 400;
		this.animationEasing = "easeOutCubic";
		this.backMenu = null;
		this.data = {
			sections: []
		};
		this.olMap = null;
		this.modules = [];
		this.renderModules = [];
		this.taxa = [];
		this.fetchComplete = false;
		this.contentItemRendererRepository = [];
		this.show();

        this.showLoadingIndicator();
		
		this.sqs.sqsEventListen("siteReportSiteNotFound", () => {
			clearTimeout(this.loadIndicatorTimeout);
			this.hideLoadingIndicator();
			$(".site-report-title-site-name").html("<span class='siteReportError'>Site not found</span>");
		});

		this.sqs.sqsEventListen("siteReportRenderComplete", () => {
			clearTimeout(this.loadIndicatorTimeout);
			this.hideLoadingIndicator();
		});

		const bsi = new BasicSiteInformation(this.sqs, this.siteId);
		const samples = new Samples(this.sqs, this.site);
		const ecoCodes = new EcoCodes(this.sqs, this.site);
		const analysis = new Analysis(this.sqs, this.siteId);

		bsi.preRender();

		this.fetchSite().then(siteData => {
			console.log(siteData);
			this.linkDataStructures(siteData);

			this.siteData = siteData;
			this.fetchComplete = true;
			this.hideLoadingIndicator();

			this.modules.push({
				"name": "basicSiteInformation",
				"module": bsi
			});
			this.modules.push({
				"name": "samples",
				"module": samples,
				"weight": -1
			});
			this.modules.push({
				"name": "analysis",
				"module": analysis,
				"weight": 1
			});
			this.modules.push({
				"name": "ecocodes",
				"module": ecoCodes,
				"weight": 0
			});

			bsi.render(siteData);
			samples.render(siteData);
			analysis.render(siteData);
		});
		
		this.sqs.tooltipManager.registerTooltip("#site-report-exit-menu", "Back to site finder", {
			placement: "right"
		});

		$("#site-report-exit-menu").off();
		$("#site-report-exit-menu").on("click", () => {
			console.log("Site report Exit menu clicked");
			this.siteReportManager.unrenderSiteReport();
		});
	}

	async loadPdfMake() {
		const pdfMakeModule = await import('pdfmake/build/pdfmake');
		const pdfFontsModule = await import('pdfmake/build/vfs_fonts');
		
		// Set the virtual file system for pdfMake
		pdfMakeModule.default.vfs = pdfFontsModule.default.pdfMake.vfs;
		
		return pdfMakeModule.default;
	}

	linkDataStructures(siteData) {
		siteData.sample_groups.forEach(sampleGroup => {
			//link methods and dimensions to coordinates for sample groups
			sampleGroup.coordinates.forEach(coord => {
				siteData.lookup_tables.methods.forEach(cm => {
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

			//link methods and dimensions to samples for samples
			sampleGroup.physical_samples.forEach(sample => {
				sample.coordinates.forEach(coord => {
					siteData.lookup_tables.methods.forEach(cm => {
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
			});
		});
	}

	async fetchSite() {
		let noCache = "false";
		return await $.get(Config.dataServerAddress+"/site/"+this.siteId+"/"+noCache);
	}

	getModuleByName(moduleName) {
		for(let key in this.modules) {
			if(this.modules[key].name == moduleName) {
				return this.modules[key];
			}
		}
		return false;
	}
	
	/*
	Function: showLoadingIndicator
	*/
	showLoadingIndicator() {
		let loadingIndicator = $("#result-loading-indicator")[0].cloneNode(true);
		$(loadingIndicator).attr("id", "site-report-loading-indicator");
		$("#site-report-content").append(loadingIndicator);
		$(loadingIndicator).fadeIn(100);
	}
	
	/*
	Function: hideLoadingIndicator
	*/
	hideLoadingIndicator() {
		$("#site-report-loading-indicator").fadeOut(100, () => {
			$("#site-report-loading-indicator").remove();
		});
	}
	
	
	/*
	* Function: show
	*
	* Flips to the site report page in the UI.
	*/
	show() {
		//Empty everything
		$("#site-report-content").html("");
		$(".site-report-aux-info-container").html("");
		$(".site-report-container").show();
	}
	
	
	/*
	* Function: getExportData
	* DEFUNCT
	 */
	getExportData() {
		var data = JSON.parse(JSON.stringify(this.data));
		var sections = data.sections;
		
		for(var key in sections) {
			this.prepareSectionsForExport(sections[key]);
			for(var cik in sections[key].contentItems) {
				
				var subTableColumnKey = 0;
				var aggregationColumnKeys = [];
				for(var ck in sections[key].contentItems[cik].data.columns) {
					if(sections[key].contentItems[cik].data.columns[ck].dataType == "subtable") {
						subTableColumnKey = ck;
					}
					
					if(sections[key].contentItems[cik].data.columns[ck].dataType == "aggregation") {
						aggregationColumnKeys.push(ck);
						delete sections[key].contentItems[cik].data.columns[ck];
					}
				}
				
				for(var rk in sections[key].contentItems[cik].data.rows) {
					delete sections[key].contentItems[cik].data.rows[rk][subTableColumnKey].dataLoaded;
					for(var agk in aggregationColumnKeys) {
						delete sections[key].contentItems[cik].data.rows[rk][aggregationColumnKeys[agk]]; //Delete aggregation columns
					}
				}
			}
		}
		
		return Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
	}
	
	/*
	Function: prepareSectionsForExport
	 */
	prepareSectionsForExport(section) {
		delete section.collapsed;
		delete section.rendered;
		for(var key in section.contentItems) {
			delete section.contentItems[key].renderOptions;
			delete section.contentItems[key].dataLoaded;
			if(section.contentItems[key].hasOwnProperty("data") && section.contentItems[key].data.hasOwnProperty("columns")){
				
				if(section.contentItems[key].data.columns[0].dataType == "subtable") {
					delete section.contentItems[key].data.rows[0].aggregationRendered;
					delete section.contentItems[key].data.rows[0][0].expanded;
				}
			}
		}
		
		if(section.hasOwnProperty("sections")) {
			for(var key in section.sections) {
				this.prepareSectionsForExport(section.sections[key]);
			}
		}
	}
	
	sectionHasContentItems(section) {
		return typeof(section.contentItems) == "object" && section.contentItems.length > 0;
	}
	
	sectionHasSubSections(section) {
		return typeof(section.sections) == "object" && section.sections.length > 0;
	}

	/*
	* Function: renderSection
	*
	* Renders all the sections in this render-tree.
	*
	* Parameters:
	* section - The section to render.
	* parent - Don't specify, internal use.
	* level - The level in the tree of this section, 0 if top level.
	*/
	async renderSection(section, parent = null, level = 0) {
		let weight = 0;
		this.modules.map((m) => {
			if(m.name == section.name) {
				weight = m.weight;
			}
		});

		if(parent == null) {
			this.data.sections.push(section);
		}
		
		let hasChildSections = false;
		hasChildSections = section.hasOwnProperty("sections") && section.sections.length > 0;

		if(section.contentItems.length == 0 && hasChildSections === false) {
			return;
		}
		
		$("#site-report-section-"+section.name).remove(); //Just in case this is a re-render

		//Grab a copy of the container sectionNode and initialize it
		var sectionNode = $(".site-report-level-container-template")[0].cloneNode(true);
		$(sectionNode).removeClass("site-report-level-container-template")
			.addClass("site-report-level-container")
			.attr("id", "site-report-section-"+section.name)
			.attr("site-report-section-name", section.name)
			.attr("render-weight", weight);

		//Make header
		var sectionTitle = section.title;
		if(section.hasOwnProperty("methodName")) {
			sectionTitle = section.methodName;
		}
		$(".site-report-level-title", sectionNode)
			.html("<i class=\"site-report-sections-expand-button fa fa-plus-circle\" aria-hidden=\"true\">&nbsp;</i><span class='title-text'>"+sectionTitle+"</span><span class='section-warning'></span>")
			.on("click", (evt) => {
				
				//if evt.target parent has the id "site-report-section-analyses" or "site-report-section-samples" then return
				//because these are the main sections, and it makes little to no sense to collapse them
				let targetSectionId = $(evt.target).parent().attr("id");
				if(targetSectionId == "site-report-section-analyses" || targetSectionId == "site-report-section-samples") {
					return;
				}

				var parent = $(evt.currentTarget).parent();
				var collapsed = parent.children(".site-report-level-content").attr("collapsed") == "true";
				collapsed = !collapsed;
				section.collapsed = collapsed;
				this.setSectionCollapsedState(parent, section); //Set reverse of current state
			});
		
		if(section.hasOwnProperty("methodDescription")) {
			this.sqs.tooltipManager.registerTooltip($(".site-report-level-title > .title-text", sectionNode), section.methodDescription, {drawSymbol: true, anchorPoint: 'symbol'});
		}
		
		//If this is a top-level section, add another class for different theming
		if(level == 0) {
			$(".site-report-level-title", sectionNode).addClass("site-report-level-title-static");
			$(".site-report-sections-expand-button", sectionNode).remove();
		}
		
		if(section.warning) {
			$(".section-warning", sectionNode).html("<i class=\"fa fa-exclamation-triangle site-report-section-warning-icon\" aria-hidden=\"true\"></i>");
			this.sqs.tooltipManager.registerTooltip($(".section-warning", sectionNode), section.warningText);
		}

		if(level == 0) {
			//$("#site-report-content").append(sectionNode);
			this.appendNodeToDomByWeight("#site-report-content", sectionNode);
		}
		else {
			$("#site-report-section-"+parent.name+" > .site-report-level-content").append(sectionNode);
		}
		
		//If this section is not collapsed - render its content items
		if(!section.collapsed) {
			this.setSectionCollapsedState(sectionNode, section);
			if(section.collapsed == false) {
				this.renderContentItems(section);
			}
		}
		
		//Just register some tooltips if description is available
		if(typeof(section.description) != "undefined") {
			var helpAnchor = $(".site-report-level-title", sectionNode);
			this.sqs.tooltipManager.registerTooltip(helpAnchor, section.description, {drawSymbol: true, anchorPoint: 'symbol'});
		}
		else {
			$("#site-report-"+section.name+"-help").remove();
		}
		
		if(typeof(section.sections) != "undefined") {
			for(var key in section.sections) {
				await this.renderSection(section.sections[key], section, level+1);
			}
		}
	}

	getContentItemRenderer(contentItem) {
		for(let key in this.contentItemRendererRepository) {
			if(this.contentItemRendererRepository[key].contentItem.name == contentItem.name) {
				return this.contentItemRendererRepository[key];
			}
		}
		return false;
	}
	
	getContentItemRendererByName(contentItemName) {
		for(let key in this.contentItemRendererRepository) {
			if(this.contentItemRendererRepository[key].contentItem.name == contentItemName) {
				return this.contentItemRendererRepository[key];
			}
		}
		return false;
	}

	updateSection(section) {
		section.contentItems.forEach((contentItem) => {
			let cri = this.getContentItemRenderer(contentItem);
			let renderInstance = cri.getRenderInstance();
			if(!renderInstance) {
				console.warn("Could not find render instance for contentItem");
			}
			else {
				renderInstance.updateData(contentItem);
			}
		});
	}

	/*
	* Function: appendNodeToDomByWeight
	*
	* This function ensures that site report sections are inserted in the right order (according to their weight).
	* This is needed because each section is loaded asynchronously and thus it's a race of whichever gets loaded first gets rendered first and would have ended up on top - if it weren't for this function.
	* Letting it be a race would be bad from a UX perspective since it's confusing for the user if sections are rendered in a different order each time.
	*/
	appendNodeToDomByWeight(parentSelector, node) {
		$(parentSelector+" > .site-report-level-container").each((index, section) => {
			let sectionWeight = $(section).attr("render-weight");
			$(node).attr("render-weight");
			if(parseInt($(node).attr("render-weight")) < parseInt(sectionWeight)) {
				$(node).insertBefore(section);
			}
			else {
				$(node).insertAfter(section);
			}
		});

		if($(parentSelector+" > .site-report-level-container").length == 0) {
			$(parentSelector).append(node);
		}
	}
	
	/*
	* Function: setSectionCollapsedState
	*
	* Does things...
	*
	* Parameters:
	* sectionNode
	* collapsed
	*/
	setSectionCollapsedState(sectionNode, section) {
		var collapsed = section.collapsed;
		sectionNode = $(sectionNode);
		var expandButtonNode = sectionNode.children(".site-report-level-title").find("i.site-report-sections-expand-button");
		if(collapsed) {
			expandButtonNode.removeClass("fa-minus-circle").addClass("fa-plus-circle");
			sectionNode.children(".site-report-level-content").attr("collapsed", "true").slideUp({
				duration: 100,
				easing: this.animationEasing
			});
		}
		else {
			expandButtonNode.removeClass("fa-plus-circle").addClass("fa-minus-circle");
			sectionNode.children(".site-report-level-content").attr("collapsed", "false").slideDown({
				duration: 100,
				easing: this.animationEasing
			});
			
			
			this.renderContentItems(section);
		}
	}
	/*
	Function: renderContentItems
	 */
	async renderContentItems(section, forceReRender = false) {
		
		//If aleady rendered - skip this and go buy some ice-cream instead, sit on a bench in the sunshine and relax. But if force-re-render is enabled then that ice-cream will have to wait.
		if(section.rendered && forceReRender == false) {
			return;
		}
		
		//Reset
		//$("#site-report-section-"+section.name+" > .site-report-level-content").html("");
		
		//If we actually have any content-items... otherwise this is all - academic, as they say...
		if(typeof(section.contentItems) != "object") {
			return;
		}
		
		section.contentItems.forEach(async (contentItem, i) => {
			await this.renderContentItem(section, contentItem);
		});
		
		section.rendered = true;
	}
	
	/*
	Function: renderContentItem
	 */
	async renderContentItem(section, contentItem, forceReRender = false) {
		let cir = new ContentItemRenderer(this, section, contentItem);
		this.contentItemRendererRepository.push(cir);
		cir.render();
	}
	
	prepareJsonExport(exportStruct) {
		//traverse through exportStruct and strip all html from every value
		for(let key in exportStruct) {
			if(typeof exportStruct[key] == "object") {
				exportStruct[key] = this.prepareJsonExport(exportStruct[key]);
			}
			else {
				if(typeof exportStruct[key] == "string") {
					exportStruct[key] = exportStruct[key].replace(/<[^>]*>?/gm, '');
				}
			}
		}

		return exportStruct;
	}

	getExportButton(exportFormat, exportStruct) {
		var node = null;
		let filename = "sead-export-site-"+this.siteId;
		if(exportFormat == "json") {
			node = $("<a id='site-report-json-export-download-btn' class='site-report-export-download-btn light-theme-button'>Download JSON</a>");
			
			let jsonData = this.prepareJsonExport(exportStruct);
			
			jsonData.license = this.sqs.config.dataLicense.name+" ("+this.sqs.config.dataLicense.url+")";

			let json = JSON.stringify(jsonData, (key, value) => {
				if(key == "renderInstance") {
					value = null;
				}
				return value;
			}, 2);
			

			let exportData = Buffer.from(json).toString('base64');
			$(node).attr("href", "data:application/octet-stream;charset=utf-8;base64,"+exportData);
			$(node).attr("download", filename+".json");
		}
		if(exportFormat == "geojson") {
			let cir = this.getContentItemRendererByName("sampleCoordinatesMap");

			let ri = null;
			cir.renderInstanceRepository.forEach(riItem => {
				if(riItem.contentItemName == "sampleCoordinatesMap") {
					ri = riItem;
				}
			});

			let points = [];
			let geojson = {};
			cir.renderInstanceRepository.forEach(riItem => {
				if(riItem.contentItemName == "sampleCoordinatesMap") {
					points = ri.renderInstance.getSampleMapPoints(cir.contentItem);
					geojson = ri.renderInstance.convertPointsToGeoJSON(points);
				}
			});

			node = $("<a id='site-report-json-export-download-btn' class='site-report-export-download-btn light-theme-button'>Download GeoJSON</a>");

			geojson.meta = exportStruct.meta;
			let json = JSON.stringify(geojson, null, 2);
			let exportData = Buffer.from(json).toString('base64');
			$(node).attr("href", "data:application/octet-stream;charset=utf-8;base64,"+exportData);
			$(node).attr("download", filename+".geojson");
		}
		if(exportFormat == "xlsx") {
			node = this.getXlsxExport(filename, exportStruct);
		}
		if(exportFormat == "xlsxBook") {
			node = this.getXlsxBookExport(filename, exportStruct);
		}
		if(exportFormat == "csv") {
			node = this.getCsvExport(filename, exportStruct);
		}
		if(exportFormat == "png") {
			node = $("<a id='site-report-png-export-download-btn' class='site-report-export-download-btn light-theme-button'>Download PNG</a>");

			$(node).on("click", (evt) => {
				for(let k in this.modules) {
					if(this.modules[k].name == "analysis") {
						for(let sk in this.modules[k].module.section.sections) {
							for(let cik in this.modules[k].module.section.sections[sk].contentItems) {
								let ci = this.modules[k].module.section.sections[sk].contentItems[cik];
								if(ci.name == exportStruct.meta.dataset) {
									let chartId = $("#contentItem-"+ci.datasetId+" .site-report-chart-container").attr("id");

									Plotly.downloadImage(chartId, {
										format: 'png', // You can use 'jpeg', 'png', 'webp', 'svg', or 'pdf'
										filename: "site_"+exportStruct.meta.site+"-"+exportStruct.meta.section,
									});
									/*
									zingchart.exec(chartId, 'getimagedata', {
										filetype: 'png',
										callback : (imagedata) => {
											this.pushDownload("SEAD-"+ci.title+"-chart.png", imagedata);
										}
									});
									*/
								}
							}
						}
					}
				}
			});
		}

		if(exportFormat == "pdf") {
			node = $("<a id='site-report-print-btn' class='site-report-export-download-btn light-theme-button'>Download PDF</a>");
			$(node).on("click", (evt) => {
				this.renderDataAsPdf(exportStruct, this.data);
			});
		}
		
		return node;
	}


	getDataForXlsx(data) {
		console.log(data)
		// This will hold all the formatted samples
		const formattedExcelRows = [];

		let subTableColumnKey = null;
		let coordinatesColumnKey = null;
		for(let key in data.columns) {
			if(data.columns[key].dataType == 'subtable') {
				subTableColumnKey = key;
			}

			if(data.columns[key].role == "coordinates") {
				//here we have to ignore the "value" of each cell and instead look for the coordinates in the "data" property
				coordinatesColumnKey = key;
			}
		}

		// Iterate over each sample
		data.rows.forEach((sampleRow) => {
			let excelRow = {};

			if(subTableColumnKey == null) {
				//this is just a plain table - no subtables
				for(let key in sampleRow) {
					if(key == "nodeId" || key == "meta") {
						continue;
					}
					let r = sampleRow[key];
					if(data.columns[key].hidden) {
						continue;
					}

					excelRow[data.columns[key].title] = r.value;
					if(key == coordinatesColumnKey && r.data) {
						excelRow[data.columns[key].title] = r.data;
					}
				}

				formattedExcelRows.push(excelRow);
			}
			else {
				//this is a table with subtables
				//insert the parent level data into the sample object
				let parentLevelData = {};
				for(let key in data.columns) {
					if(data.columns[key].dataType != "subtable" && !data.columns[key].hidden) {
						let columnName = data.columns[key].title;

						parentLevelData[columnName] = sampleRow[key].value;
						if(key == coordinatesColumnKey) {
							//not using "columnName" as the key here because then it would just say "Coordinates" and it would not be clear that this is the coordinates for the sample group and not the individual samples
							parentLevelData["Sample group coordinates"] = this.formatCoordinatesForExport(sampleRow[key].data);
						}
					}
				}

				const subtable = sampleRow[subTableColumnKey].value;
				// Iterate over each row in the subtable

				let keyColumnKey = null;
				let valueColumnKey = null;
				if(typeof subtable.meta != "undefined" && typeof subtable.meta.dataStructure != "undefined" && subtable.meta.dataStructure == "key-value") {
					//this means that we should have a column with the role "key" and a column with the role "value"
					for(let key in subtable.columns) {
						if(subtable.columns[key].role == "key") {
							keyColumnKey = key;
						}
						if(subtable.columns[key].role == "value") {
							valueColumnKey = key;
						}
					}
				}

				excelRow = {...parentLevelData};

				let eachRowIsAKeyValPair = keyColumnKey != null && valueColumnKey != null;

				subtable.rows.forEach((subRow) => {
					if(eachRowIsAKeyValPair) {
						const measurementType = subRow[keyColumnKey].value;
						const measurementValue = subRow[valueColumnKey].value;
						excelRow[measurementType] = measurementValue;
					}
					else {
						excelRow = {...parentLevelData};
						for(let cellKey in subRow) {
							//find column title for this cell key
							let cell = subRow[cellKey];
							let columnName = subtable.columns[cellKey].title;
							excelRow[columnName] = cell.value;
						}
						formattedExcelRows.push(excelRow);
					}
				});
				if(eachRowIsAKeyValPair) {
					formattedExcelRows.push(excelRow);
				}
			}
		});

		return formattedExcelRows;
	}

	formatCoordinatesForExport(coordinates) {
		return coordinates.map(coord => {
			return `${coord.coordinate_method.method_name} ${coord.measurement} ${coord.dimension.dimension_abbrev}; `;
		}).join(' | ');
	}
	
	getCsvExport(filename, exportStruct) {
		//Remove columns from table which are flagged for exclusion
		for(let key in exportStruct.datatable.columns) {
			if(exportStruct.datatable.columns[key].exclude_from_export) {
				exportStruct.datatable.columns.splice(key, 1);
				exportStruct.datatable.rows.forEach((row) => {
					row.splice(key, 1);
				});
			}
		}

		//Strip html from values
		exportStruct.datatable.rows.forEach((row) => {
			row.forEach((column) => {
				if(typeof column.value == "string") {
					column.value = this.sqs.parseStringValueMarkup(column.value, { drawSymbol: false });
					column.value = column.value.replace(/<[^>]*>?/gm, '');
				}
			});
		});

		const formattedExcelRows = this.getDataForXlsx(exportStruct.datatable);

		let csvContent = "data:text/csv;charset=utf-8,";

		// Add the headers to the CSV content
		csvContent += Object.keys(formattedExcelRows[0]).join(",") + "\n";

		// Add the data to the CSV content
		formattedExcelRows.forEach((row) => {
			csvContent += Object.values(row).join(",") + "\n";
		});

		const encodedUri = encodeURI(csvContent);
		const blob = new Blob([csvContent], { type: 'text/csv' });

		$("#site-report-csv-export-download-btn").attr("href", encodedUri);
		$("#site-report-csv-export-download-btn").attr("download", filename+".csv");
		return $("<a id='site-report-csv-export-download-btn' class='site-report-export-download-btn light-theme-button'>Download CSV</a>");
	}

	/*
	getCsvExport(filename, exportStruct) {
		// Remove columns from table which are flagged for exclusion
		for (let key in exportStruct.datatable.columns) {
			if (exportStruct.datatable.columns[key].exclude_from_export) {
				exportStruct.datatable.columns.splice(key, 1);
				exportStruct.datatable.rows.forEach((row) => {
					row.splice(key, 1);
				});
			}
		}
	
		// Strip HTML from values
		exportStruct.datatable.rows.forEach((row) => {
			row.forEach((column, index, theArray) => {
				if (typeof column.value == "string") {
					column.value = this.sqs.parseStringValueMarkup(column.value, { drawSymbol: false });
					column.value = column.value.replace(/<[^>]*>?/gm, '');
					// Update the row array in place with the stripped string
					theArray[index] = column.value;
				}
			});
		});
	
		// Prepare data for CSV
		let data = this.getDataForXlsx(exportStruct.datatable);
	
		// Initialize an array to hold CSV lines
		let csvContent = [];
	
		// Add MetaData to CSV
		let metaData = [
			`"Content","Section","License","Source attribution","Source url","References (citation required)","Site name","Date of export","Description"`,
			`"${exportStruct.meta.content}","${exportStruct.meta.section}","Data distributed by SEAD under the license ${this.sqs.config.dataLicense.name} (${this.sqs.config.dataLicense.url})","${exportStruct.meta.attribution}","${exportStruct.meta.url}","${exportStruct.meta.datasetReference}","${exportStruct.meta.siteName}","${new Date().toLocaleDateString('sv-SE')}","${exportStruct.meta.description}"`
		];
	
		// Concatenate metadata to csvContent
		csvContent = csvContent.concat(metaData, ""); // Adding an empty string for an empty line
	
		// Extract column headers
		let columns = exportStruct.datatable.columns.map(column => column.headerName);
	
		// Add column headers as the first row
		csvContent.push(`"${columns.join('","')}"`);
	
		// Iterate over each data row
		data.forEach(rowObject => {
			// Map each rowObject to its CSV string representation
			let row = columns.map(column => `"${rowObject[column] || ''}"`).join(',');
			csvContent.push(row);
		});
	
		// Combine all CSV lines into a single string
		let csvString = csvContent.join("\n");
	
		// Convert the CSV string to a Blob and create a download link
		const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
		const blobUrl = URL.createObjectURL(blob);
	
		// Create a temporary download link and trigger the download
		let downloadLink = document.createElement("a");
		downloadLink.href = blobUrl;
		downloadLink.download = `${filename}.csv`;
		document.body.appendChild(downloadLink);
		downloadLink.click();
		document.body.removeChild(downloadLink);
	
		return $("<a class='site-report-export-download-btn light-theme-button'>Download CSV</a>");
	}
	*/

	stripHtmlUsingDOM(input) {
		const temporaryElement = document.createElement('div');
		temporaryElement.innerHTML = input;
		return temporaryElement.textContent || temporaryElement.innerText || '';
	}

	getXlsxBookExport(filename, exportStruct) {
		let siteData = exportStruct;

		const wb = new ExcelJS.Workbook();
		const siteWorksheet = wb.addWorksheet("Site");
		const samplesWorksheet = wb.addWorksheet("Samples");

		let siteMetaColumns = [
			"Site identifier",
			"License", 
			"Date of export",
			"Webclient version",
			"API version",
			"Site name",
			"Site description",
			"Latitude (WGS84)",
			"Longitude (WGS84)",
			"Database attribution",
		];

		let headerRow = siteWorksheet.addRow(siteMetaColumns);
		headerRow.eachCell((cell) => {
			cell.font = { bold: true };
		});

		let siteMetaRow = [
			this.siteId,
			this.sqs.config.dataLicense.name+" ("+this.sqs.config.dataLicense.url+")",
			new Date().toLocaleDateString('sv-SE'),
			this.sqs.config.version,
			siteData.api_source,
			siteData.site_name,
			siteData.site_description,
			siteData.latitude_dd,
			siteData.longitude_dd,
			this.sqs.config.dataAttributionString,
		];

		siteWorksheet.addRow(siteMetaRow);


		for(let key in this.sqs.siteReportManager.siteReport.data.sections) {
			let section = this.sqs.siteReportManager.siteReport.data.sections[key];
			if(section.name == "samples") {
				for(let key2 in section.contentItems) {
					let contentItem = section.contentItems[key2];
					if(contentItem.name == "sampleGroups") {
						let subTableColumnKey = null;
						let columnKeys = [];
						let sampleGroupColumns = [];
						contentItem.data.columns.forEach((column, index) => {
							//we exclude columns with a dataType marked as subtables and components from the export
							
							if(column.dataType != "subtable" && column.dataType != "component") {
								columnKeys.push(index);
								sampleGroupColumns.push(column.title);
							}

							if(column.dataType == "subtable") {
								subTableColumnKey = index;
							}
						});

						if(subTableColumnKey != null) {
							contentItem.data.rows.forEach(sampleGroupRow => {

								let sampleGroupExcelRowValues = [];
								columnKeys.forEach(key3 => {
									let v = this.sqs.parseStringValueMarkup(sampleGroupRow[key3].value, { drawSymbol: false });
									v = this.stripHtmlUsingDOM(v);
									sampleGroupExcelRowValues.push(v);
								});

								let subTable = sampleGroupRow[subTableColumnKey].value;

								let columns = [...sampleGroupColumns];
								subTable.columns.forEach(subTableColumn => {
									columns.push(subTableColumn.title);
								});

								//push a new header row for each of the subtables/samples
								let columnRow = samplesWorksheet.addRow(columns);
								columnRow.eachCell((cell) => {
									cell.font = { bold: true };
								});

								subTable.rows.forEach(subTableRow => {
									let excelRow = [...sampleGroupExcelRowValues];
									subTableRow.forEach((subTableCell, index) => {
										let cellValue = this.sqs.parseStringValueMarkup(subTableCell.value, { drawSymbol: false });
										cellValue = this.stripHtmlUsingDOM(cellValue);
										excelRow.push(cellValue);
									});
									samplesWorksheet.addRow(excelRow);
								});
							});

						};
					}
				}
			}

			if(section.name == "analyses") {
				section.sections.forEach(analysisSection => {
					
					//check if a worksheet with this name already exists
					let worksheet = wb.getWorksheet(analysisSection.title);
					if(!worksheet) {
						worksheet = wb.addWorksheet(analysisSection.title);
					}
					
					let biblioRef = null;
					let contactIds = new Set();
					for(let k in siteData.datasets) {
						if(siteData.datasets[k].method_id == 10) {
							siteData.lookup_tables.biblio.forEach(biblio => {
								if(biblio.biblio_id == siteData.datasets[k].biblio_id) {
									biblioRef = biblio;
								}
							});

							siteData.datasets[k].contacts.forEach(contact_id => {
								contactIds.add(contact_id);
							});

							continue;
						}
					}

					const contactIdsArr = Array.from(contactIds);
					let contactString = this.sqs.renderContacts(siteData, contactIdsArr, false);

					
					if(biblioRef) {
						let r = worksheet.addRow(["Dataset reference; please cite this dataset as:"]);
						r.eachCell((cell) => {
							cell.font = { bold: true };
						});
						worksheet.addRow([biblioRef.full_reference]);
					}
					else {
						let r = worksheet.addRow(["Dataset reference"]);
						r.eachCell((cell) => {
							cell.font = { bold: true };
						});
						worksheet.addRow(["No reference found"]);
					}
					let r = worksheet.addRow(["Dataset contact information:"]);
					r.eachCell((cell) => {
						cell.font = { bold: true };
					});
					if(contactIdsArr.length > 0) {
						worksheet.addRow([contactString]);
					}
					else {
						worksheet.addRow(["No contact information found"]);
					}
					
					worksheet.addRow([]);

					analysisSection.contentItems.forEach(contentItem => {
						if(this.sqs.isPromise(contentItem)) {
							console.warn("Content item is a promise");
							return;
						}

						if(contentItem.methodId && (contentItem.methodId == 10 || contentItem.methodId == 171)) {
							this.insanitySubroutine(worksheet, contentItem);
						}
						else {
							this.sanityPrevails(worksheet, contentItem);
						}
					});
				});
			}
		}

		wb.xlsx.writeBuffer().then(buffer => {
			const blob = new Blob([buffer], { type: 'application/octet-stream' });
			const blobUrl = URL.createObjectURL(blob);

			$("#site-report-xlsx-export-download-btn").attr("href", blobUrl);
			$("#site-report-xlsx-export-download-btn").attr("download", filename+".xlsx");
		});

		return $("<a id='site-report-xlsx-export-download-btn' class='site-report-export-download-btn light-theme-button'>Download XLSX</a>");
	}

	sanityPrevails(worksheet, contentItem) {
		let dataTable = contentItem.data;

		let columnRow = [];
		//insert dataset name as the first column
		columnRow.push("Dataset");
		dataTable.columns.forEach((column, index) => {
			if(column.dataType != "subtable" && column.dataType != "component") {
				columnRow.push(column.title);
			}
		});
		let headerRow = worksheet.addRow(columnRow);
		headerRow.eachCell((cell) => {
			cell.font = { bold: true };
		});

		dataTable.rows.forEach((row, index) => {
			let excelRow = [];

			//insert dataset name as the first column
			excelRow.push(contentItem.title);

			dataTable.columns.forEach((column, index) => {
				if(column.dataType != "subtable" && column.dataType != "component") {
					let cellValue = this.sqs.parseStringValueMarkup(row[index].value, { drawSymbol: false });
					cellValue = this.stripHtmlUsingDOM(cellValue);
					excelRow.push(cellValue);
				}
			});

			worksheet.addRow(excelRow);
		});
	}

	insanitySubroutine(worksheet, contentItem) {
		let dataTable = contentItem.data;
		let subTableColumnKey = null;
		let sampleColumns = [];
		let columnKeys = [];
		dataTable.columns.forEach((column, index) => {
			//we exclude columns with a dataType marked as subtables and components from the export
			if(column.dataType != "subtable" && column.dataType != "component") {
				columnKeys.push(index);
				sampleColumns.push(column.title);
			}

			if(column.dataType == "subtable") {
				subTableColumnKey = index;
			}
		});

		if(subTableColumnKey != null) {
			dataTable.rows.forEach(analysisRow => {

				let analysisExcelRowValues = [];
				columnKeys.forEach(key3 => {
					let v = this.sqs.parseStringValueMarkup(analysisRow[key3].value, { drawSymbol: false });
					v = this.stripHtmlUsingDOM(v);
					analysisExcelRowValues.push(v);
				});

				let subTable = analysisRow[subTableColumnKey].value;

				let valueColumnKeys = [];
				let valueColumns = [...sampleColumns];
				subTable.columns.forEach((subTableColumn, index) => {
					if(subTableColumn.exclude_from_export !== true && subTableColumn.hidden !== true) {
						valueColumnKeys.push(index);
						valueColumns.push(subTableColumn.title);
					}
				});

				let headersRow = worksheet.addRow(valueColumns);
				headersRow.eachCell((cell) => {
					cell.font = { bold: true };
				});
				
				subTable.rows.forEach(subTableRow => {
					let excelRow = [...analysisExcelRowValues];
					subTableRow.forEach((subTableCell, index) => {
						if(valueColumnKeys.includes(index)) {
							let cellValue = this.sqs.parseStringValueMarkup(subTableCell.value, { drawSymbol: false });
							cellValue = this.stripHtmlUsingDOM(cellValue);
							excelRow.push(cellValue);
						}
					});

					worksheet.addRow(excelRow);
				});
			});
		}
	}

	getXlsxExport(filename, exportStruct) {
		//Remove columns from table which are flagged for exclusion
		for(let key in exportStruct.datatable.columns) {
			if(exportStruct.datatable.columns[key].exclude_from_export) {
				exportStruct.datatable.columns.splice(key, 1);
				exportStruct.datatable.rows.forEach((row) => {
					row.splice(key, 1);
				});
			}
		}

		//Strip html from values
		exportStruct.datatable.rows.forEach((row) => {
			row.forEach((column) => {
				if(typeof column.value == "string") {
					column.value = this.sqs.parseStringValueMarkup(column.value, { drawSymbol: false });
					column.value = column.value.replace(/<[^>]*>?/gm, '');
				}
			});
		});

		const ws_name = "SEAD Data";
		const wb = new ExcelJS.Workbook();
		const ws = wb.addWorksheet(ws_name);

		let data = this.getDataForXlsx(exportStruct.datatable);

		// Add data to the worksheet

		let styles = {
			header1: { size: 14, bold: true },
			header2: { size: 12, bold: true },
		}

		// Initialize an empty set to track unique properties (columns)
		let columnSet = new Set();

		// Scout through each rowObject to find all unique properties
		data.forEach(rowObject => {
			Object.keys(rowObject).forEach(key => {
				columnSet.add(key);
			});
		});

		// Convert the set of columns into an array
		let columns = Array.from(columnSet);

		let mainHeaderRow = ws.addRow(["SEAD Dataset Export"]);
		mainHeaderRow.font = styles.header1;

		let metaDataHeaderRow = [
			"Content",
			"Section",
			"License",
			"Source attribution",
			"Source url",
			"References (citation required)",
			"Site name",
			"Date of export",
			"Description",
			""
		];
		let metaDataValueRow = [
			exportStruct.meta.content,
			exportStruct.meta.section,
			`Data distributed by SEAD under the license ${this.sqs.config.dataLicense.name} (${this.sqs.config.dataLicense.url})`,
			exportStruct.meta.attribution,
			exportStruct.meta.url,
			exportStruct.meta.datasetReference,
			exportStruct.meta.siteName,
			new Date().toLocaleDateString('sv-SE'),
			exportStruct.meta.description,
			""
		];

		// Add the metadata to the worksheet
		let metaDataHeaderRowExcel = ws.addRow(metaDataHeaderRow);
		metaDataHeaderRowExcel.eachCell((cell) => {
			cell.font = styles.header2;
		});

		// Add the metadata values to the worksheet
		ws.addRow(metaDataValueRow);
		ws.addRow([]); // Empty row for spacing


		// Add the column headers as the first row in the worksheet
		let headerRow = ws.addRow(columns);
		headerRow.eachCell((cell) => {
			cell.font = styles.header2;
		});

		data.forEach(rowObject => {
			// Create an excelRow by extracting all values from the rowObject
			let excelRow = columns.map(column => rowObject[column] || '');
		  
			// Add the excelRow as a new row in the worksheet
			ws.addRow(excelRow);
		});
		  
		
		wb.xlsx.writeBuffer().then(buffer => {
			const blob = new Blob([buffer], { type: 'application/octet-stream' });
			const blobUrl = URL.createObjectURL(blob);

			$("#site-report-xlsx-export-download-btn").attr("href", blobUrl);
			$("#site-report-xlsx-export-download-btn").attr("download", filename+".xlsx");
		});
		
		return $("<a id='site-report-xlsx-export-download-btn' class='site-report-export-download-btn light-theme-button'>Download XLSX</a>");
	}
	
	async renderDataAsPdf(exportStruct, siteData) {
		let includedColumns = [
			'Sample name',
			'Abundance count',
			'Taxon',
			'Identification levels',
			'Element type',
			'Modification',
		];

		let pdfDoc = {
			content: [
				{
					text: "SEAD Dataset Export\n\n",
					style: "header"
				},
				{
					text: exportStruct.meta.section+"\n\n",
				},
				{
					text: exportStruct.meta.description+"\n\n",
				},
				{
					text: "This dataset and more information available at",
				},
				{
					text: exportStruct.meta.url+"\n\n",
				},
				{
					text: "SEAD browser version",
					style: "subheader2"
				},
				{
					text: this.sqs.config.version+"\n\n",
				},
				{
					text: "SEAD reference",
					style: "subheader2"
				},
				{
					text: exportStruct.meta.sead_reference+"\n\n",
				},
				{
					text: "Dataset reference",
					style: "subheader2"
				},
				{
					text: exportStruct.meta.datasetReference+"\n\n",
				},
				{
					text: "Site name",
					style: "subheader2"
				},
				{
					text: this.siteData.site_name+"\n\n",
				},
				{
					text: "Site location",
					style: "subheader2"
				},
				{
					text: exportStruct.meta.siteLocation+"\n\n",
				},
				{
					text: "Site coordinates",
					style: "subheader2"
				},
				{
					text: exportStruct.meta.siteLocationCoordinates+"\n\n",
				},
				{
					text: "Dataset",
					style: "subheader2"
				},
				{
					text: exportStruct.meta.content+"\n\n",
				},
			],
			styles: {
				header: {
					fontSize: 18,
					bold: true
				},
				subheader: {
					fontSize: 15,
					bold: true
				},
				subheader2: {
					fontSize: 12,
					bold: true
				},
				quote: {
					italics: true
				},
				small: {
					fontSize: 8
				}
			}
		};

		
		let abundanceHeaderRow = [];
		let taxonColKey = null;
		let colKeys = [];
		for(let colKey in exportStruct.datatable.columns) {
			let col = exportStruct.datatable.columns[colKey];

			if(col.exclude_from_export) {
				continue;
			}
			if(col.title == "Taxon") {
				taxonColKey = colKey;
			}
			if(includedColumns.includes(col.title)) {
				abundanceHeaderRow.push(col.title);
				colKeys.push(colKey);
			}
		}

		let abundanceTableRows = [];


		let taxonIds = new Set([]);

		for(let rowKey in exportStruct.datatable.rows) {
			let row = exportStruct.datatable.rows[rowKey];
			let tableRow = [];

			for(let cellKey in row) {
				if(colKeys.includes(cellKey)) {
					let cell = row[cellKey];
					if(typeof cell.rawValue != "undefined") {
						tableRow.push(this.sqs.formatTaxon(cell.rawValue, null, false));
						taxonIds.add(parseInt(cell.rawValue.taxon_id));
					}
					else {
						tableRow.push(cell.value);
					}
				}
			}
			
			abundanceTableRows.push(tableRow);
		}

		abundanceTableRows.unshift(abundanceHeaderRow)

		pdfDoc.content.push({
			text: "Taxa abundance and identification data",
			style: "subheader"
		});

		pdfDoc.content.push({
			table: {
				body: abundanceTableRows
			}
		});

		//add space between tables
		pdfDoc.content.push({
			text: "\n\n"
		});
		
		
		let biologyTableRows = [["Taxon", "Biology", "Distribution"]];

		for(let rowKey in exportStruct.datatable.rows) {
			let row = exportStruct.datatable.rows[rowKey];

			let biologyText = "";
			row[taxonColKey].rawValue.text_biology.forEach(bio => {
				biologyText += bio.biology_text + "\n\n";
			});

			let distributionText = "";
			row[taxonColKey].rawValue.text_distribution.forEach(distro => {
				distributionText += distro.distribution_text + "\n\n";
			});

			biologyTableRows.push([row[3].value, biologyText, distributionText]);
		}

		//add a header explaining the table
		pdfDoc.content.push({
			text: "Taxa biology and distribution",
			style: "subheader"
		});

		
		pdfDoc.content.push({
			table: {
				body: biologyTableRows
			}
		});


		let refTableRows = [["Taxon", "Reference"]];

		pdfDoc.content.push({
			text: "\n\nReferences for species data",
			style: "subheader"
		});

		let taxonReferencePromises = [];

		let taxonIdsArray = [...taxonIds];

		// Sort the Array
		taxonIdsArray.sort((a, b) => a - b); // this does nothing since the references are fetched (and therefore also inserted) asynchronously. Should probably be fixed at some point

		taxonIdsArray.forEach(taxonId => {
			let refStr = "";
			taxonReferencePromises.push(this.fetchTaxonReferences(taxonId).then(data => {
				if(data.references && data.references.taxonomy_notes && data.references.taxonomy_notes.length > 0) {
					data.references.taxonomy_notes.forEach(note => {
						refStr += note.biblio.bugs_reference + "\n";
						refStr += note.biblio.title ? note.biblio.title : "";
					});
				}
				else {
					refStr = "No references found";
				}

				refTableRows.push([data.taxon_id, refStr]);
			}));
		});

		await Promise.all(taxonReferencePromises);

		pdfDoc.content.push({
			table: {
				body: refTableRows
			}
		});

		const pdfMake = await this.loadPdfMake();
		pdfMake.createPdf(pdfDoc).open();
	}

	async fetchTaxonReferences(taxonId) {
		let references = null;

		//fetch <json_api_server>/taxon_references/28963
		let url = this.sqs.config.dataServerAddress+"/taxon_references/"+taxonId;
		let response = await fetch(url);
		if(response.ok) {
			references = await response.json();
		}

		return references;
	}

	pushDownload(filename, text) {
		var element = document.createElement('a');
		element.setAttribute('href', text);
		element.setAttribute('download', filename);
		element.style.display = 'none';
		document.body.appendChild(element);
		element.click();
		document.body.removeChild(element);
	}

	stripExcludedColumnsFromExportData(exportData) {
		// Define a recursive function to handle both top-level and nested sections
		const stripSections = (sections) => {
			sections.forEach(section => {
				// Process each content item in the current section
				section.contentItems.forEach(ci => {
					//if ci is an empty object...
					if(Object.keys(ci).length === 0 && ci.constructor === Object) {
						return;
					}

					if (!this.sqs.isPromise(ci)) {
						ci = this.stripExcludedColumnsFromContentItem(ci);
					}
				});
	
				// Recursively process any nested sections
				if (section.hasOwnProperty("sections")) {
					stripSections(section.sections);
				}
			});
		};
	
		// Start the recursion with the top-level sections
		stripSections(exportData.sections);
	
		return exportData;
	}
	

	stripExcludedColumnsFromContentItem(ci) {
		let subTableKey = null;
		ci.data.columns.forEach((col, key) => {
			if(col.dataType == "subtable") {
				subTableKey = key;
			}
		});

		ci.data.rows.forEach(row => {
			if(subTableKey != null) {
				let subTable = row[subTableKey].value;
				
				let excludeKeys = [];
				subTable.columns.forEach((col, key) => {
					if(col.hasOwnProperty("exclude_from_export")) {
						excludeKeys.push(key);
					}
				});

				subTable.rows.forEach((subTableRow, key) => {
					excludeKeys.forEach(excludeKey => {
						subTableRow.splice(excludeKey, 1);
					});
				});

				subTable.columns.forEach((subTableCol, key) => {
					if(subTableCol.exclude_from_export)	{
						subTable.columns.splice(key, 1);
					}
				});	
			}
		});

		return ci;
	}
	
	async renderExportDialog(formats = ["json", "xlsx", "pdf"], section = "all", contentItem = "all") {
		let exportData = this.sqs.copySiteReportData(this.data);

		this.prepareExportStructure(exportData.sections);
		exportData = this.stripExcludedColumnsFromExportData(exportData);

		var exportStruct = {
			info: {
				description: this.sqs.config.dataExportDescription,
				url: ""
			},
			site: this.siteId,
			section: "All",
			content: "All",
			data: exportData
		};

		if(section != "all" && contentItem != "all") {
			let plainRef = typeof contentItem.datasetReferencePlain != "undefined" ? contentItem.datasetReferencePlain : "";
			if(plainRef == "") {
				console.log("No plainRef found, trying to strip the HTML instead")
				if(contentItem.datasetReference) {
					plainRef = contentItem.datasetReference.replace(/<[^>]+>/g, '');
				}

				const lastIndex = plainRef.lastIndexOf('\n');
				if (lastIndex !== -1) {
					plainRef = plainRef.substring(0, lastIndex) + plainRef.substring(lastIndex + 1);
				}
				plainRef = "["+plainRef.replace(/\n/g, '] [')+"]";
			}

			let siteLocationString = "";
			this.siteData.location.forEach((loc) => {
				siteLocationString += loc.location_name + ", ";
			});
			siteLocationString = siteLocationString.slice(0, -2);

			let siteLocationCoordinatesString = parseFloat(this.siteData.latitude_dd) + "\"N, " + parseFloat(this.siteData.longitude_dd) + "\"E, Altitude: " + parseFloat(this.siteData.altitude) + "m"	;

			exportStruct = {
				meta: {
					site: this.siteId,
					section: section.title,
					dataset: contentItem.datasetId,
					content: contentItem.title,
					description: this.sqs.config.dataExportDescription,
					siteName: this.siteData.site_name,
					url: this.sqs.config.serverRoot+"/site/"+this.siteId,
					datasetReference: plainRef,
					siteLocation: siteLocationString,
					siteLocationCoordinates: siteLocationCoordinatesString
				},
				datatable: this.stripExcludedColumnsFromContentItem(contentItem).data
			};
		}

		exportStruct.meta.sead_reference = this.sqs.config.dataAttributionString;
		exportStruct.meta.license = this.sqs.config.dataLicense.name+" ("+this.sqs.config.dataLicense.url+")";
		
		let dialogNodeId = nanoid();
		var dialogNode = $("<div id='node-"+dialogNodeId+"' class='dialog-centered-content-container'></div>");
		this.siteReportManager.sqs.dialogManager.showPopOver("Site data export", "<br />"+dialogNode.prop('outerHTML'));
		

		if(formats.indexOf("json") != -1) {
			var jsonBtn = this.getExportButton("json", exportStruct);
			$("#node-"+dialogNodeId).append(jsonBtn);
		}
		if(formats.indexOf("xlsx") != -1) {
			var xlsxBtn = this.getExportButton("xlsx", exportStruct);
			$("#node-"+dialogNodeId).append(xlsxBtn);
		}
		if(formats.indexOf("geojson") != -1) {
			var btn = this.getExportButton("geojson", exportStruct);
			$("#node-"+dialogNodeId).append(btn);
		}
		/*
		if(formats.indexOf("png") != -1) {
			var pngBtn = this.getExportButton("png", exportStruct);
			$("#node-"+dialogNodeId).append(pngBtn);
		}
		*/
		if(formats.indexOf("pdf") != -1) {
			var pdfBtn = this.getExportButton("pdf", exportStruct);
			$("#node-"+dialogNodeId).append(pdfBtn);
		}
	}

	/* Function: prepareExportStructure
	* 
	* Re-formats the site report data structure to a format more suitable for export, e.g. by removing data/directives related to rendering.
	*/
	prepareExportStructure(data) {
		//These are property keys which somehow refer to the rendering of the data, which we want to strip out when exporting the data since they are not interesting for a third party
		let filterList = [
			"rendered",
			"collapsed",
			"renderOptions",
			"hidden"
		];

		data.map((item) => {
			if(Array.isArray(item)) {
				this.prepareExportStructure(item);
			}
			if(typeof item == "object") {
				let keys = Object.keys(item);
				for(let k in keys) {
					let oKey = keys[k];
					let value = item[oKey];

					if(oKey == "excludeInExport") {
						console.log(item);
					}

					if(Array.isArray(value)) {
						this.prepareExportStructure(value);
					}
					if(filterList.includes(oKey)) {
						delete item[oKey];
					}
				}
			}
		});
		
	}
	
	offerToRenderModules(contentItem, anchorSelector) {
		for(var key in this.renderModules) {
			this.renderModules[key].offer(contentItem, anchorSelector);
		}
	}

	getSectionByName(sectionName) {
		for(let key in this.data.sections) {
			let section = this.data.sections[key];
			if(section.name == sectionName) {
				return section;
			}
		}
	}

	focusOn(query) {
		if(query.section) {
			//find the section
			let section = this.getSectionByName(query.section);
			$("#site-report-section-" + section.name)[0].scrollIntoView({ behavior: 'smooth' });
		}
		else {
			console.warning("focusOn: No section specified");
		}
	}

	expandSampleGroup(sampleGroupId, sampleId) {
		let samplesSection = this.getSectionByName("samples");
		samplesSection.contentItems.forEach((ci) => {
			if(ci.name == "sampleGroups") {
				let sampleGroupIdColumnKey = null;
				for(let key in ci.data.columns) {
					if(ci.data.columns[key].title == "Sample group id") {
						sampleGroupIdColumnKey = key;
					}
				}

				if(!sampleGroupIdColumnKey) {
					console.warn("Could not find sample group id column key");
					return;
				}

				ci.data.rows.forEach((row) => {
					let selectedSampleGroupId = row[sampleGroupIdColumnKey].value;
					if(selectedSampleGroupId == sampleGroupId) {
						//select and click
						let selector = "#cic-sampleGroups .site-report-table-row[row-id="+selectedSampleGroupId+"]";

						//only click if it's not already expanded
						if(!$(selector).hasClass("table-row-expanded")) {
							$(selector).trigger("click");
						}
						else {
							console.log("Sample group row already expanded", selector);
						}
					}
				});
			}
		});
	}

	pageFlipToSampleGroup(sampleGroupId) {
		let dataTable = $("#cic-sampleGroups > #contentItem-sampleGroups table").DataTable();

		//find the dataTable column header called 'Sample group id'
		let sampleGroupIdColumnKey = null;
		dataTable.columns().header().each((header, index) => {
			if(header.innerText == "Sample group id") {
				sampleGroupIdColumnKey = index;
			}
		});

		let sampleGroupRowIndex = null;
		let sampleGroupRowObj = dataTable.row((idx, data) => {
			if(data[0] == sampleGroupId) {
				sampleGroupRowIndex = idx;
			}
			return data[0] == sampleGroupId;
		});

		let sortedIndex = null;
		let rowsSorted = dataTable.rows( { order: 'applied' } );
		if(!rowsSorted[0]) {
			console.warn("Could not get sorted rows");
			return;
		}
		rowsSorted[0].forEach((idx, newIdx) => {
			if(idx == sampleGroupRowObj.index()) {
				sortedIndex = newIdx;
			}
		});

		let pageNumOfSampleGroup = Math.floor(sortedIndex / dataTable.page.len());

		let currentTablePage = dataTable.page();

		if(pageNumOfSampleGroup != currentTablePage) {
			console.log("Page flipping sample group table to page", pageNumOfSampleGroup);
			dataTable.page(pageNumOfSampleGroup).draw(false); // The 'false' parameter redraws the table without triggering the 'draw' event
		}

		//scroll to the sample group
		let rowNode = dataTable.row(sampleGroupRowObj.index()).node();
		$(rowNode)[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	pageFlipToSample(sampleGroupId, sampleName) {
		let subTable = $("#cic-sampleGroups .site-report-table-row[row-id="+sampleGroupId+"]").next();

		let dataTable = $("td > div > div > table", subTable).DataTable();

		//find the dataTable column header called 'Sample name'
		let sampleNameColumnKey = null;
		dataTable.columns().header().each((header, index) => {
			if(header.innerText == "Sample name") {
				sampleNameColumnKey = index;
			}
		});

		let rowObj = dataTable.row((idx, data) => data[sampleNameColumnKey] === sampleName);

		let sortedIndex = null;
		let rowsSorted = dataTable.rows( { order: 'applied' } );
		if(!rowsSorted[0]) {
			console.warn("Could not get sorted rows");
			return;
		}
		rowsSorted[0].forEach((idx, newIdx) => {
			if(idx == rowObj.index()) {
				sortedIndex = newIdx;
			}
		});

		let pageNumOfSample = Math.floor(sortedIndex / dataTable.page.len());
		console.log("Page flipping sample table to page", pageNumOfSample);
		dataTable.page(pageNumOfSample).draw(false); // The 'false' parameter redraws the table without triggering the 'draw' event
	}

	scrollToSample(sampleGroupId, sampleName) {
		let subTable = $("#cic-sampleGroups .site-report-table-row[row-id="+sampleGroupId+"]").next();
		let dataTable = $("td > div > div > table", subTable).DataTable();
		let rowObj = dataTable.row((idx, cells) => cells[1] === sampleName); //cell 1 is the sample name
		if(!rowObj.index()) {
			console.warn("Could not find sample row in table");
			return false;
		}
		let rowNode = dataTable.row(rowObj.index()).node();
		$(rowNode)[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
		return true;
	}

	highlightSampleGroupRow(sampleGroupId) {
		$(".highlighted-table-row").removeClass("highlighted-table-row");
		$("#cic-sampleGroups .site-report-table-row[row-id="+sampleGroupId+"]").addClass("highlighted-table-row");
		
		$("#cic-sampleGroups .site-report-table-row[row-id="+sampleGroupId+"]")[0].addEventListener('animationend', function() {
			$("#cic-sampleGroups .site-report-table-row[row-id="+sampleGroupId+"]").removeClass('highlighted-table-row');
		});
	}

	highlightSampleRow(sampleGroupId, sampleName) {
		let subTable = $("#cic-sampleGroups .site-report-table-row[row-id="+sampleGroupId+"]").next();
		$(".highlighted-table-row", subTable).removeClass("highlighted-table-row");
		let dataTable = $("td > div > div > table", subTable).DataTable();

		//find the dataTable column header called 'Sample name'
		let sampleNameColumnKey = null;
		dataTable.columns().header().each((header, index) => {
			if(header.innerText == "Sample name") {
				sampleNameColumnKey = index;
			}
		});

		let rowObj = dataTable.row((idx, data) => data[sampleNameColumnKey] === sampleName);
		var rowNode = dataTable.row(rowObj.index()).node();

		// Add 'highlighted-table-row' class to the specified row
		$(rowNode).addClass('highlighted-table-row');

		$("td", rowNode).addClass("highlighted-table-row");

		$("td", rowNode)[0].addEventListener('animationend', function() {
			$("td", rowNode).removeClass('highlighted-table-row');
		});
	}

	/*
	Function: destroy
	*/
	destroy() {
		console.log("Destroying site report module");
		this.data = null;
		for(let key in this.modules) {
			if(typeof(this.modules[key].module.destroy) == "function") {
				this.modules[key].module.destroy();
			}
		}

		this.sqs.sqsEventUnlisten("siteReportSiteInformationBuildComplete", this);
		this.sqs.sqsEventUnlisten("siteReportSamplesBuildComplete", this);
		this.sqs.sqsEventUnlisten("siteReportAnalysesBuildComplete", this);
		this.sqs.sqsEventUnlisten("siteReportSiteNotFound", this);
		this.sqs.sqsEventUnlisten("siteReportRenderComplete", this);

		$("#site-report-exit-menu").off("click");
	}
	
}

export { SiteReport as default }