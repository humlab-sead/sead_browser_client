import { Buffer } from 'buffer';
import { nanoid } from 'nanoid';
import XLSX from 'xlsx';
import Config from '../../config/config.json';
import ContentItemRenderer from './ContentItemRenderer.class';
import BasicSiteInformation from './SectionModules/BasicSiteInformation.class';
import Samples from './SectionModules/Samples.class';
import Analysis from './SectionModules/Analysis.class';
import EcoCodes from './SectionModules/EcoCodes.class';
import Plotly from "plotly.js-dist-min";
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import ExcelJS from 'exceljs/dist/exceljs.min.js';
pdfMake.vfs = pdfFonts.pdfMake.vfs;
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

		this.fetchSite().then(siteData => {
			console.log(siteData);
			this.siteData = siteData;
			this.fetchComplete = true;
			this.hideLoadingIndicator();
			this.enableExportButton();

			const bsi = new BasicSiteInformation(this.sqs, this.siteId);
			const samples = new Samples(this.sqs, this.site);
			const ecoCodes = new EcoCodes(this.sqs, this.site);
			const analysis = new Analysis(this.sqs, this.siteId);

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

		$("#site-report-exit-menu").on("click", () => {
			this.siteReportManager.unrenderSiteReport();
		});
	}

	async fetchSite() {
		return await $.get(Config.dataServerAddress+"/site/"+this.siteId);
	}

	getModuleByName(moduleName) {
		for(let key in this.modules) {
			if(this.modules[key].name == moduleName) {
				return this.modules[key];
			}
		}
		return false;
	}

	enableExportButton() {
		console.log("enableExportButton");
		//$(".site-report-export-btn").css("cursor", "pointer");
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
	* Renders a single section of the site report structure. Actually it renders all the sections in this render-tree.
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
				console.log("Clicked section title");
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
			node = $("<a id='site-report-json-export-download-btn' class='site-report-export-download-btn light-theme-button'>Download GeoJSON</a>");
			
			//let jsonData = this.prepareJsonExport(exportStruct);
			let jsonData = {};
			
			jsonData.license = this.sqs.config.dataLicense.name+" ("+this.sqs.config.dataLicense.url+")";

			let json = JSON.stringify(jsonData, (key, value) => {
				if(key == "renderInstance") {
					value = null;
				}
				return value;
			}, 2);
			
			let exportData = Buffer.from(json).toString('base64');
			$(node).attr("href", "data:application/octet-stream;charset=utf-8;base64,"+exportData);
			$(node).attr("download", filename+".geojson");
		}
		if(exportFormat == "xlsx") {
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
			
			var data = this.getDataForXlsx(exportStruct.datatable);
			
			data.unshift([""]);
			data.unshift(["Content: "+exportStruct.meta.content]);
			data.unshift(["Section: "+exportStruct.meta.section]);
			data.unshift(["Data distributed by SEAD under the license "+this.sqs.config.dataLicense.name+" ("+this.sqs.config.dataLicense.url+")"]);
			data.unshift(["Reference: "+exportStruct.meta.attribution]);
			data.unshift(["Source url: "+exportStruct.meta.url]);
			data.unshift(["Site name: "+exportStruct.meta.siteName]);
			data.unshift([exportStruct.meta.description]);

			/*
			var ws_name = "SEAD Data";
			var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(data);
			//add worksheet to workbook
			XLSX.utils.book_append_sheet(wb, ws, ws_name);
			//write workbook
			XLSX.writeFile(wb, filename+".xlsx");
			*/

			

			// Add data to the worksheet

			let styles = {
				header1: { size: 14, bold: true },
				header2: { size: 12, bold: true },
			}

			data.forEach(row => {
				let addStyle = null;
				if(typeof row[0] == 'object') {
					if(row[0].style == 'header2') {
						addStyle = styles.header2;
					}
					row.splice(0, 1);
				}

				ws.addRow(row);
				
				if(addStyle != null) {
					ws.lastRow.font = addStyle;
				}
			});
			
			wb.xlsx.writeBuffer().then(buffer => {
				const blob = new Blob([buffer], { type: 'application/octet-stream' });
				const blobUrl = URL.createObjectURL(blob);

				$("#site-report-xlsx-export-download-btn").attr("href", blobUrl);
				$("#site-report-xlsx-export-download-btn").attr("download", filename+".xlsx");
			});

			/*
			wb.xlsx.writeFile(filename + '.xlsx')
			.then(() => {
				console.log("Workbook created!");
			})
			.catch(error => {
				console.error("Error creating workbook:", error);
			});
			*/

			
			
			node = $("<a id='site-report-xlsx-export-download-btn' class='site-report-export-download-btn light-theme-button'>Download XLSX</a>");
			/*
			$(node).on("click", (evt) => {
			});
			*/
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
									
									console.log(chartId, $("#"+chartId));

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
			node = $("<a id='site-report-png-export-download-btn' class='site-report-export-download-btn light-theme-button'>Download PDF</a>");
			$(node).on("click", (evt) => {
				this.renderDataAsPdf(exportStruct);
			});
		}
		
		return node;
	}
	
	renderDataAsPdf(exportStruct) {

		let includedColumns = [
			'Sample name',
			'Abundance count',
			'Taxon',
			'Identification levels',
			'Element type',
			'Modification'
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
					text: "SEAD version",
					style: "subheader2"
				},
				{
					text: this.sqs.config.version+"\n\n",
				},
				{
					text: "Reference",
					style: "subheader2"
				},
				{
					text: exportStruct.meta.attribution+"\n\n",
				},
				{
					text: "Site name",
					style: "subheader2"
				},
				{
					text: this.siteData.site_name+"\n\n",
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

		
		let headerRow = [];
		let taxonColKey = null;
		let colKeys = [];
		for(let colKey in exportStruct.datatable.columns) {
			let col = exportStruct.datatable.columns[colKey];
			if(col.exclude_from_export) {
				continue;
			}
			if(col.title == "Taxon") {
				taxonColKey = col.key;
			}
			if(includedColumns.includes(col.title)) {
				headerRow.push(col.title);
				colKeys.push(colKey);
			}
		}

		let tableRows = [];

		for(let rowKey in exportStruct.datatable.rows) {
			let row = exportStruct.datatable.rows[rowKey];
			let tableRow = [];
			

			for(let cellKey in row) {
				if(colKeys.includes(cellKey)) {
					let cell = row[cellKey];
					if(typeof cell.rawValue != "undefined") {
						tableRow.push(this.sqs.formatTaxon(cell.rawValue, null, false));
					}
					else {
						tableRow.push(cell.value);
					}
				}
			}
			
			tableRows.push(tableRow);
		}

		tableRows.unshift(headerRow)
		
		pdfDoc.content.push({
			table: {
				body: tableRows
			}
		});
		
	

		pdfMake.createPdf(pdfDoc).open();
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
		exportData.sections.forEach(section => {
			section.contentItems.forEach(ci => {
				ci = this.stripExcludedColumnsFromContentItem(ci);
			});
			if(section.hasOwnProperty("sections")) {
				section.sections.forEach(subSection => {
					subSection.contentItems.forEach(ci => {
						ci = this.stripExcludedColumnsFromContentItem(ci);
					});
				});
			}
		});

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
		let exportData = this.sqs.copyObject(this.data);
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
			exportStruct = {
				meta: {
					site: this.siteId,
					section: section.title,
					dataset: contentItem.datasetId,
					content: contentItem.title,
					description: this.sqs.config.dataExportDescription,
					siteName: this.siteData.site_name,
					url: this.sqs.config.serverRoot+"/site/"+this.siteId,
				},
				datatable: this.stripExcludedColumnsFromContentItem(contentItem).data
			};
		}

		exportStruct.meta.attribution = this.sqs.config.dataAttributionString;
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
			if(typeof item == "string" || typeof item == "number") {

			}
		});
		
	}
	
	
	/*
	* Function: getDataForXlsx
	*
	* Formats a data table for XLSX-export. Doesn't actually make it into XLSX, it just created a JSON data structure that is appropriate for feeding into the XLSX library.
	 */
	
	getDataForXlsx2(dataTable) {
		let rows = [];
		let headerRow = [];
		let hiddenIndices = [];
		dataTable.columns.forEach((col, i) => {
			if(!col.hidden) {
				headerRow.push(col.title);
			}
			else {
				hiddenIndices.push(i);
			}
		});
		rows.push({
			style: "header",
			cells: headerRow
		});

		dataTable.rows.forEach((row) => {
			let cells = [];
			row.forEach((cell, i) => {
				if(hiddenIndices.includes(i)) {
					return;
				}
				else {
					cells.push(cell.value);
				}
					
			});

			rows.push({
				style: "default",
				cells: cells
			});
		});

		return rows;
	}

	getDataForXlsx(dataTable) {
		var data = [];
		var row = [];
		let rowIsHeader = false;
		
		for(var key in dataTable.columns) {
			var col = dataTable.columns[key];
			if(col.hasOwnProperty("dataType") && col.dataType == "subtable") {
				//We don't really need to do anything here since the subtable datatype is specified in the row-cells as well...
			}
			else {
				if(col.hasOwnProperty("title")) {
					row.push(col.title);
				}
				else {
					row.push("-empty-");
				}
			}
		}

		row.unshift({ style: 'header2' });

		data.push(row);
		for(var key in dataTable.rows) {
			row = [];
			var subTable = [];
			for(var cellKey in dataTable.rows[key]) {
				var cell = dataTable.rows[key][cellKey];
				
				if(cell.type == "subtable") {
					rowIsHeader = true;
					subTable = this.getDataForXlsx(cell.value);
				}
				else {
					if(cell.hasOwnProperty("value")) {
						row.push(cell.value);
					}
				}
			}
			if(rowIsHeader) {
				row.unshift({ style: 'header2' });
			}
			data.push(row);
			for(var k in subTable) {
				//subTable[k].unshift("SubTable:");
				data.push(subTable[k]);
			}
		}
		
		return data;
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
					}
				});
			}
		});
	}

	pageFlipToSample(sampleGroupId, sampleId) {
		let subTable = $("#cic-sampleGroups .site-report-table-row[row-id="+sampleGroupId+"]").next();
		let dataTable = $("td > div > div > table", subTable).DataTable();
		let rowObj = dataTable.row((idx, data) => data[0] === sampleId);

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
		dataTable.page(pageNumOfSample).draw(false); // The 'false' parameter redraws the table without triggering the 'draw' event
	}

	highlightSampleRow(sampleGroupId, sampleId) {
		let subTable = $("#cic-sampleGroups .site-report-table-row[row-id="+sampleGroupId+"]").next();
		$(".highlighted-table-row", subTable).removeClass("highlighted-table-row");
		let dataTable = $("td > div > div > table", subTable).DataTable();
		let rowObj = dataTable.row((idx, data) => data[0] === sampleId);
		var rowNode = dataTable.row(rowObj.index()).node();
		$("td", rowNode).addClass("highlighted-table-row");

		$("td", rowNode)[0].addEventListener('animationend', function() {
			$("td", rowNode).removeClass('highlighted-table-row');
		});
	}

	/*
	Function: destroy
	*/
	destroy() {
		this.data = null;
		for(let key in this.modules) {
			if(typeof(this.modules[key].module.destroy) == "function") {
				this.modules[key].module.destroy();
			}
		}

		this.sqs.sqsEventUnlisten("siteReportSiteInformationBuildComplete", this);
		this.sqs.sqsEventUnlisten("siteReportSamplesBuildComplete", this);
		this.sqs.sqsEventUnlisten("siteReportAnalysesBuildComplete", this);
	}
	
}

export { SiteReport as default }