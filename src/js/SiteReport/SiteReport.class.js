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
import { sample } from 'lodash';
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
		this.debugMode = this.siteReportManager.debugMode;
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

	toggleDebug(active = false) {
		this.debugMode = active;
		console.log("Site report debug mode: "+(this.debugMode ? "ON" : "OFF"));
		if(this.debugMode) {
			$(".section-debug-info").css("visibility", "visible");
		}
		else {
			$(".section-debug-info").css("visibility", "hidden");
		}
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
		const noCache = "false"; //tell the serveer to not use a cached response
		const postgresFetch = "false"; //tell the server to use an SQL query against postgres instead of mongodb
		return await $.get(Config.dataServerAddress+"/site/"+this.siteId+"/"+noCache+"/"+postgresFetch);
	}

	getModuleByName(moduleName) {
		for(let key in this.modules) {
			if(this.modules[key].name == moduleName) {
				return this.modules[key];
			}
		}
		return false;
	}

	getAnalysisDatasetModuleInstances() {
		let analysisModule = this.getModuleByName("analysis");
		if(!analysisModule || !analysisModule.module || !Array.isArray(analysisModule.module.datasetModules)) {
			return [];
		}

		return analysisModule.module.datasetModules
			.filter((datasetModule) => {
				return datasetModule && datasetModule.instance;
			})
			.map((datasetModule) => {
				return datasetModule.instance;
			});
	}

	getDatasetModuleByMethodIds(datasetModules, methodIds = []) {
		if(!Array.isArray(methodIds) || methodIds.length == 0) {
			return null;
		}

		return datasetModules.find((datasetModule) => {
			if(!datasetModule || !Array.isArray(datasetModule.methodIds)) {
				return false;
			}
			return methodIds.some((methodId) => {
				return datasetModule.methodIds.includes(methodId);
			});
		}) || null;
	}

	getDatasetModuleByMethodGroupIds(datasetModules, methodGroupIds = []) {
		if(!Array.isArray(methodGroupIds) || methodGroupIds.length == 0) {
			return null;
		}

		return datasetModules.find((datasetModule) => {
			if(!datasetModule || !Array.isArray(datasetModule.methodGroupIds)) {
				return false;
			}
			return methodGroupIds.some((methodGroupId) => {
				return datasetModule.methodGroupIds.includes(methodGroupId);
			});
		}) || null;
	}

	resolveDatasetModuleForExport(section, contentItem) {
		if(section == "all" || contentItem == "all") {
			return null;
		}

		let datasetModules = this.getAnalysisDatasetModuleInstances();
		if(datasetModules.length == 0) {
			return null;
		}

		if(contentItem && contentItem.renderedBy) {
			let byRenderer = datasetModules.find((datasetModule) => {
				return datasetModule.constructor && datasetModule.constructor.name == contentItem.renderedBy;
			});
			if(byRenderer) {
				return byRenderer;
			}
		}

		let contentMethodIds = [];
		if(contentItem && Array.isArray(contentItem.methodIds)) {
			contentMethodIds = contentMethodIds.concat(contentItem.methodIds);
		}
		if(contentItem && typeof contentItem.methodId != "undefined" && contentItem.methodId != null) {
			contentMethodIds.push(contentItem.methodId);
		}

		let byContentMethodIds = this.getDatasetModuleByMethodIds(datasetModules, contentMethodIds);
		if(byContentMethodIds) {
			return byContentMethodIds;
		}

		let sectionMethodIds = [];
		if(section && Array.isArray(section.methodIds)) {
			sectionMethodIds = sectionMethodIds.concat(section.methodIds);
		}
		if(section && typeof section.methodId != "undefined" && section.methodId != null) {
			sectionMethodIds.push(section.methodId);
		}

		let bySectionMethodIds = this.getDatasetModuleByMethodIds(datasetModules, sectionMethodIds);
		if(bySectionMethodIds) {
			return bySectionMethodIds;
		}

		let sectionMethodGroupIds = [];
		if(section && Array.isArray(section.methodGroupIds)) {
			sectionMethodGroupIds = sectionMethodGroupIds.concat(section.methodGroupIds);
		}
		if(section && typeof section.methodGroupId != "undefined" && section.methodGroupId != null) {
			sectionMethodGroupIds.push(section.methodGroupId);
		}

		return this.getDatasetModuleByMethodGroupIds(datasetModules, sectionMethodGroupIds);
	}

	async applyDatasetModuleExportPreparation(exportStruct, section, contentItem) {
		let datasetModule = this.resolveDatasetModuleForExport(section, contentItem);
		if(!datasetModule || typeof datasetModule.prepareExport != "function") {
			return exportStruct;
		}

		let preparedStruct = await datasetModule.prepareExport(exportStruct, {
			section: section,
			contentItem: contentItem,
			siteData: this.siteData,
			siteReport: this,
			sqs: this.sqs,
		});

		if(typeof preparedStruct == "undefined" || preparedStruct == null) {
			return exportStruct;
		}

		return preparedStruct;
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

		let debugInfo = `
		<span class='section-debug-info'>
			Method id: ${section.methodId}
		</span>`;

		if(level == 0) {
			debugInfo = "";
		}

		$(".site-report-level-title", sectionNode)
			.html(`
				<div>
					<i class=\"site-report-sections-expand-button fa fa-chevron-right\" aria-hidden=\"true\">&nbsp;</i>
					<span class='title-text'>${sectionTitle}</span>
					<span class='section-warning'></span>
				</div>
				${debugInfo}
				`)
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
			this.sqs.tooltipManager.registerTooltip($(".site-report-level-title > div > .title-text", sectionNode), section.methodDescription, {drawSymbol: true, anchorPoint: 'symbol'});
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
		var titleNode = sectionNode.children(".site-report-level-title");
		var expandButtonNode = titleNode.find("i.site-report-sections-expand-button");
		var isStaticTitle = titleNode.hasClass("site-report-level-title-static");
		if(collapsed) {
			if(!isStaticTitle) {
				sectionNode.removeClass("site-report-level-expanded");
			}
			expandButtonNode.removeClass("fa-chevron-down").addClass("fa-chevron-right");
			sectionNode.children(".site-report-level-content").attr("collapsed", "true").slideUp({
				duration: 100,
				easing: this.animationEasing
			});
		}
		else {
			if(!isStaticTitle) {
				sectionNode.addClass("site-report-level-expanded");
			}
			expandButtonNode.removeClass("fa-chevron-right").addClass("fa-chevron-down");
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

	getExportButton(exportFormat, section = "all", contentItem = "all") {
		let label = "Download";
		if(exportFormat == "json") {
			label = "Download JSON";
		}
		if(exportFormat == "geojson") {
			label = "Download GeoJSON";
		}
		if(exportFormat == "xlsx") {
			label = "Download XLSX";
		}
		if(exportFormat == "xlsxBook") {
			label = "Download XLSX";
		}
		if(exportFormat == "csv") {
			label = "Download CSV";
		}
		if(exportFormat == "png") {
			label = "Download PNG";
		}
		if(exportFormat == "svg") {
			label = "Download SVG";
		}
		if(exportFormat == "pdf") {
			label = "Download PDF";
		}

		let node = $("<a class='site-report-export-download-btn light-theme-button'>"+label+"</a>");
		$(node).on("click", async (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			await this.executeExport(exportFormat, section, contentItem, node);
		});

		return node;
	}

	setExportButtonLoadingState(buttonNode, isLoading = false) {
		if(!buttonNode) {
			return;
		}
		$(buttonNode).toggleClass("is-loading", isLoading);
		$(buttonNode).attr("aria-busy", isLoading ? "true" : "false");
	}

	getBaseExportFilename() {
		return "sead-export-site-"+this.siteId;
	}

	getExportStructReferenceString(contentItem) {
		let plainRef = typeof contentItem.datasetReferencePlain != "undefined" ? contentItem.datasetReferencePlain : "";
		if(plainRef == "") {
			if(contentItem.datasetReference) {
				plainRef = contentItem.datasetReference.replace(/<[^>]+>/g, '');
			}

			const lastIndex = plainRef.lastIndexOf('\n');
			if(lastIndex !== -1) {
				plainRef = plainRef.substring(0, lastIndex) + plainRef.substring(lastIndex + 1);
			}
			plainRef = "["+plainRef.replace(/\n/g, '] [')+"]";
		}
		return plainRef;
	}

	buildExportStruct(section = "all", contentItem = "all") {
		let exportStruct = {
			meta: {
				site: this.siteId,
				section: "All",
				dataset: "All",
				contentItemName: "all",
				content: "All",
				description: this.sqs.config.dataExportDescription,
				siteName: this.siteData.site_name,
				url: this.sqs.config.serverRoot+"/site/"+this.siteId,
				datasetReference: "",
				siteLocation: "",
				siteLocationCoordinates: "",
				renderType: "all"
			}
		};

		if(section == "all" || contentItem == "all") {
			let exportData = this.sqs.copySiteReportData(this.data);
			this.prepareExportStructure(exportData.sections);
			exportStruct.data = this.stripExcludedColumnsFromExportData(exportData);
		}
		else {
			let selectedRoType = "table";
			if(contentItem.renderOptions) {
				contentItem.renderOptions.forEach((ro) => {
					if(ro.selected) {
						selectedRoType = ro.type;
					}
				});
			}

			let siteLocationString = "";
			this.siteData.location.forEach((loc) => {
				siteLocationString += loc.location_name + ", ";
			});
			siteLocationString = siteLocationString.slice(0, -2);

			let siteLocationCoordinatesString = parseFloat(this.siteData.latitude_dd) + "\"N, " + parseFloat(this.siteData.longitude_dd) + "\"E, Altitude: " + parseFloat(this.siteData.altitude) + "m";
			let contentItemCopy = this.sqs.copySiteReportData(contentItem);
			contentItemCopy = this.stripExcludedColumnsFromContentItem(contentItemCopy);

			exportStruct.meta = {
				site: this.siteId,
				section: section.title,
				dataset: contentItem.datasetId || contentItem.name,
				contentItemName: contentItem.name,
				content: contentItem.title,
				description: this.sqs.config.dataExportDescription,
				siteName: this.siteData.site_name,
				url: this.sqs.config.serverRoot+"/site/"+this.siteId,
				datasetReference: this.getExportStructReferenceString(contentItem),
				siteLocation: siteLocationString,
				siteLocationCoordinates: siteLocationCoordinatesString,
				renderType: selectedRoType
			};
			exportStruct.datatable = contentItemCopy.data;
		}

		exportStruct.meta.sead_reference = this.sqs.config.dataAttributionString;
		exportStruct.meta.license = this.sqs.config.dataLicense.name+" ("+this.sqs.config.dataLicense.url+")";
		return exportStruct;
	}

	async executeGeoJsonExport(exportStruct, filename) {
		let cir = this.getContentItemRendererByName("sampleCoordinatesMap");
		if(!cir || !cir.renderInstanceRepository) {
			this.sqs.notificationManager.notify("Could not find sample coordinates renderer for GeoJSON export.", "error");
			return;
		}

		let ri = null;
		cir.renderInstanceRepository.forEach(riItem => {
			if(riItem.contentItemName == "sampleCoordinatesMap") {
				ri = riItem;
			}
		});

		if(!ri || !ri.renderInstance) {
			this.sqs.notificationManager.notify("Could not find map instance for GeoJSON export.", "error");
			return;
		}

		let points = ri.renderInstance.getSampleMapPoints(cir.contentItem);
		let geojson = ri.renderInstance.convertPointsToGeoJSON(points);
		geojson.meta = exportStruct.meta;
		let json = JSON.stringify(geojson, null, 2);
		let objectUrl = URL.createObjectURL(new Blob([json], { type: "application/geo+json" }));
		this.pushDownload(filename+".geojson", objectUrl);
	}

	executePngExport(exportStruct) {
		const contentItemName = exportStruct.meta.contentItemName || exportStruct.meta.dataset;
		const chartNode = $("#contentItem-"+contentItemName+" .site-report-chart-container").first()[0];
		if(!chartNode) {
			this.sqs.notificationManager.notify("Could not find chart node for PNG export.", "error");
			return;
		}

		const safeBaseName = ("site_"+exportStruct.meta.site+"-"+exportStruct.meta.section+"-"+(exportStruct.meta.content || "chart"))
			.replace(/[^a-z0-9._-]+/gi, "_")
			.toLowerCase();

		if(chartNode.tagName && chartNode.tagName.toLowerCase() == "canvas") {
			const dataUrl = chartNode.toDataURL("image/png");
			this.pushDownload(safeBaseName+".png", dataUrl);
			return;
		}

		const chartId = $(chartNode).attr("id");
		if(chartId) {
			Plotly.downloadImage(chartId, {
				format: 'png',
				filename: safeBaseName,
				scale: 4,
			});
			return;
		}

		this.sqs.notificationManager.notify("This chart renderer does not support PNG export.", "error");
	}

	executeSvgExport(exportStruct) {
		for(let k in this.modules) {
			if(this.modules[k].name == "analysis") {
				for(let sk in this.modules[k].module.section.sections) {
					for(let cik in this.modules[k].module.section.sections[sk].contentItems) {
						let ci = this.modules[k].module.section.sections[sk].contentItems[cik];

						if(ci.name == exportStruct.meta.dataset || ci.datasetId == exportStruct.meta.dataset) {
							let chartId = $("#contentItem-"+ci.datasetId+" .site-report-chart-container").attr("id");
							if(!chartId) {
								this.sqs.notificationManager.notify("Could not find chart node for SVG export.", "error");
								return;
							}

							Plotly.downloadImage(chartId, {
								format: 'svg',
								filename: "site_"+exportStruct.meta.site+"-"+exportStruct.meta.section,
								scale: 1,
								width: 1920,
								height: 1080
							});
							return;
						}
					}
				}
			}
		}

		this.sqs.notificationManager.notify("This chart renderer does not support SVG export.", "error");
	}

	async executeExport(exportFormat, section = "all", contentItem = "all", buttonNode = null) {
		this.setExportButtonLoadingState(buttonNode, true);
		try {
			let exportStruct = this.buildExportStruct(section, contentItem);
			exportStruct = await this.applyDatasetModuleExportPreparation(exportStruct, section, contentItem);
			let filename = this.getBaseExportFilename();

			if(exportFormat == "json") {
				const objectUrl = await this.sqs.exportManager.getJsonExport(exportStruct);
				this.pushDownload(filename+".json", objectUrl);
				return;
			}

			if(exportFormat == "geojson") {
				await this.executeGeoJsonExport(exportStruct, filename);
				return;
			}

			if(exportFormat == "xlsx") {
				if(!exportStruct.datatable) {
					this.sqs.notificationManager.notify("No table data available for XLSX export.", "error");
					return;
				}
				const xlsxExport = await this.getXlsxExport(filename, exportStruct);
				this.pushDownload(xlsxExport.filename, xlsxExport.objectUrl);
				return;
			}

			if(exportFormat == "xlsxBook") {
				this.sqs.notificationManager.notify("XLSX workbook export is not available for this content item.", "error");
				return;
			}

			if(exportFormat == "csv") {
				if(!exportStruct.datatable) {
					this.sqs.notificationManager.notify("No table data available for CSV export.", "error");
					return;
				}
				const csvExport = this.getCsvExport(filename, exportStruct);
				this.pushDownload(csvExport.filename, csvExport.objectUrl);
				return;
			}

			if(exportFormat == "png") {
				this.executePngExport(exportStruct);
				return;
			}

			if(exportFormat == "svg") {
				this.executeSvgExport(exportStruct);
				return;
			}

			if(exportFormat == "pdf") {
				await this.renderDataAsPdf(exportStruct, this.data);
				return;
			}

			this.sqs.notificationManager.notify("Unsupported export format.", "error");
		}
		catch(error) {
			console.error("Export failed", exportFormat, error);
			this.sqs.notificationManager.notify("Failed to generate export file.", "error");
		}
		finally {
			this.setExportButtonLoadingState(buttonNode, false);
		}
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

		// Iterate over each sample group
		data.rows.forEach((sampleGroupRow) => {
			let excelRow = {};

			if(subTableColumnKey == null) {
				//this is just a plain table - no subtables
				for(let key in sampleGroupRow) {
					if(key == "nodeId" || key == "meta") {
						continue;
					}
					let r = sampleGroupRow[key];
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

						// if the "data" attribute is available, then choose that, since it will contain a more complete & raw value of the data. The "value" attribute could be truncated
						parentLevelData[columnName] = sampleGroupRow[key].data ? sampleGroupRow[key].data : sampleGroupRow[key].value;
						if(key == coordinatesColumnKey) {
							//not using "columnName" as the key here because then it would just say "Coordinates" and it would not be clear that this is the coordinates for the sample group and not the individual samples
							parentLevelData["Sample group coordinates"] = this.sqs.formatCoordinatesForExport(sampleGroupRow[key].data);
						}
					}
				}

				const subtable = sampleGroupRow[subTableColumnKey].value;
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

	isMcrExport(exportStruct) {
		return !!(exportStruct && exportStruct.datatable && exportStruct.datatable.mcrData);
	}

	getMcrConsensusBbox(densityMatrix, taxaCount) {
		if(!Array.isArray(densityMatrix) || !taxaCount) {
			return null;
		}

		const rows = densityMatrix.length;
		const cols = rows > 0 && Array.isArray(densityMatrix[0]) ? densityMatrix[0].length : 0;
		let consColMin = cols;
		let consColMax = -1;
		let consRowMin = rows;
		let consRowMax = -1;

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				if (densityMatrix[r][c] === taxaCount) {
					consColMin = Math.min(consColMin, c);
					consColMax = Math.max(consColMax, c);
					consRowMin = Math.min(consRowMin, r);
					consRowMax = Math.max(consRowMax, r);
				}
			}
		}

		return consColMax >= 0 ? [consColMin, consColMax, consRowMin, consRowMax] : null;
	}

	async getMcrXlsxExport(filename, exportStruct) {
		const wb = new ExcelJS.Workbook();
		const summaryWs = wb.addWorksheet("MCR Summary");
		const densityWs = wb.addWorksheet("MCR Density");
		const consensusWs = wb.addWorksheet("MCR Consensus");
		const mcrData = exportStruct.datatable.mcrData || {};
		const densityMatrix = Array.isArray(mcrData.density_matrix) ? mcrData.density_matrix : [];
		const taxaCount = Number(mcrData.taxa_count) || 0;
		const maxCount = Number(mcrData.max_count) || taxaCount;
		const rows = densityMatrix.length;
		const cols = rows > 0 && Array.isArray(densityMatrix[0]) ? densityMatrix[0].length : 0;
		const consensusBbox = this.getMcrConsensusBbox(densityMatrix, taxaCount);

		let styles = {
			header1: { size: 14, bold: true },
			header2: { size: 12, bold: true },
		};

		summaryWs.addRow(["SEAD MCR Export"]).font = styles.header1;
		summaryWs.addRow([]);
		summaryWs.addRow(["Site", exportStruct.meta.site]);
		summaryWs.addRow(["Section", exportStruct.meta.section]);
		summaryWs.addRow(["Content", exportStruct.meta.content]);
		summaryWs.addRow(["Taxa with MCR data", taxaCount]);
		summaryWs.addRow(["Max overlapping taxa in one climate cell", maxCount]);
		summaryWs.addRow(["Matrix rows (Trange axis)", rows]);
		summaryWs.addRow(["Matrix columns (Tmax axis)", cols]);
		summaryWs.addRow(["Consensus envelope available", consensusBbox ? "Yes" : "No"]);
		if(consensusBbox) {
			summaryWs.addRow(["Consensus Tmax min (°C)", consensusBbox[0] - 10]);
			summaryWs.addRow(["Consensus Tmax max (°C)", consensusBbox[1] - 10]);
			summaryWs.addRow(["Consensus Trange min (°C)", consensusBbox[2]]);
			summaryWs.addRow(["Consensus Trange max (°C)", consensusBbox[3]]);
		}

		let summaryMaxColWidth = [10, 10];
		summaryWs.eachRow((row) => {
			row.eachCell((cell, colNumber) => {
				const len = String(cell.value ?? "").length;
				summaryMaxColWidth[colNumber - 1] = Math.max(summaryMaxColWidth[colNumber - 1] || 10, len + 2);
			});
		});
		summaryWs.columns = summaryMaxColWidth.map(width => ({ width: Math.min(width, 60) }));

		let headerRow = ["Trange \\ Tmax"];
		for(let c = 0; c < cols; c++) {
			headerRow.push(c - 10);
		}
		let densityHeader = densityWs.addRow(headerRow);
		densityHeader.font = styles.header2;
		let consensusHeader = consensusWs.addRow(headerRow);
		consensusHeader.font = styles.header2;

		for(let r = 0; r < rows; r++) {
			let densityRow = [r];
			let consensusRow = [r];
			for(let c = 0; c < cols; c++) {
				const cellCount = Number(densityMatrix[r][c]) || 0;
				densityRow.push(cellCount);
				consensusRow.push(cellCount === taxaCount ? 1 : 0);
			}
			densityWs.addRow(densityRow);
			consensusWs.addRow(consensusRow);
		}

		densityWs.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
		consensusWs.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
		densityWs.columns.forEach(column => { column.width = 10; });
		consensusWs.columns.forEach(column => { column.width = 10; });

		const buffer = await wb.xlsx.writeBuffer();
		const blob = new Blob([buffer], { type: 'application/octet-stream' });
		const blobUrl = URL.createObjectURL(blob);
		return {
			filename: filename+"-mcr.xlsx",
			objectUrl: blobUrl
		};
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

		let csvContent = "";
		if(formattedExcelRows.length == 0) {
			throw new Error("No rows available for CSV export");
		}
		csvContent += Object.keys(formattedExcelRows[0]).join(",") + "\n";

		// Add the data to the CSV content
		formattedExcelRows.forEach((row) => {
			csvContent += Object.values(row).join(",") + "\n";
		});

		const encodedUri = "data:text/csv;charset=utf-8,"+encodeURIComponent(csvContent);
		return {
			filename: filename+".csv",
			objectUrl: encodedUri
		};
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

	async getXlsxExport(filename, exportStruct) {
		if(this.isMcrExport(exportStruct)) {
			return await this.getMcrXlsxExport(filename, exportStruct);
		}

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

		const wb = new ExcelJS.Workbook();
		const metadataSheetName = "SEAD metadata";
		let dataSheetName = "SEAD data";
		if(exportStruct && exportStruct.meta && exportStruct.meta.content) {
			dataSheetName = exportStruct.meta.content;
			if(dataSheetName.indexOf(" - ") !== -1) {
				dataSheetName = dataSheetName.split(" - ").pop().trim();
			}
		}

		dataSheetName = dataSheetName.replace(/[\\/*?:[\]]/g, '').trim();
		if(dataSheetName == "") {
			dataSheetName = "SEAD data";
		}
		if(dataSheetName.toLowerCase() == metadataSheetName.toLowerCase()) {
			dataSheetName = "SEAD data";
		}
		if(dataSheetName.length > 31) {
			dataSheetName = dataSheetName.substring(0, 31);
		}

		const metadataWs = wb.addWorksheet(metadataSheetName);
		const dataWs = wb.addWorksheet(dataSheetName);

		let data = this.getDataForXlsx(exportStruct.datatable);

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

		let mainHeaderRow = metadataWs.addRow(["SEAD Dataset Export"]);
		mainHeaderRow.font = styles.header1;

		const webclientVersion = this.sqs.config.version || "";
		const apiVersion = (this.siteData && this.siteData.api_source) ? this.siteData.api_source : "Unknown";

		const metadataRows = [
			["Content", exportStruct.meta.content],
			["Section", exportStruct.meta.section],
			["License", `Data distributed by SEAD under the license ${this.sqs.config.dataLicense.name} (${this.sqs.config.dataLicense.url})`],
			["Source attribution", exportStruct.meta.attribution],
			["Source url", exportStruct.meta.url],
			["References (citation required)", exportStruct.meta.datasetReference],
			["Site name", exportStruct.meta.siteName],
			["Date of export", new Date().toLocaleDateString('sv-SE')],
			["Description", exportStruct.meta.description],
			["SEAD client version", webclientVersion],
			["SEAD JAS version", apiVersion],
		];

		metadataWs.addRow([]);
		metadataRows.forEach((metaRow) => {
			let row = metadataWs.addRow(metaRow);
			row.getCell(1).font = styles.header2;
		});

		let metadataColWidths = [10, 10];
		metadataWs.eachRow((row) => {
			row.eachCell((cell, colNumber) => {
				const len = String(cell.value ?? "").length;
				metadataColWidths[colNumber - 1] = Math.max(metadataColWidths[colNumber - 1] || 10, len + 2);
			});
		});
		metadataWs.columns = metadataColWidths.map(width => ({ width: Math.min(width, 100) }));

		// Add the column headers as the first row in the data worksheet
		let headerRow = dataWs.addRow(columns);
		headerRow.eachCell((cell) => {
			cell.font = styles.header2;
		});

		data.forEach(rowObject => {
			// Create an excelRow by extracting all values from the rowObject
			let excelRow = columns.map(column => rowObject[column] || '');
		  
			// Add the excelRow as a new row in the data worksheet
			dataWs.addRow(excelRow);
		});
		  
		
		const buffer = await wb.xlsx.writeBuffer();
		const blob = new Blob([buffer], { type: 'application/octet-stream' });
		const blobUrl = URL.createObjectURL(blob);
		return {
			filename: filename+".xlsx",
			objectUrl: blobUrl
		};
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
			if(!Array.isArray(sections)) {
				return;
			}

			sections.forEach(section => {
				if(!section || typeof section != "object") {
					return;
				}

				// Process each content item in the current section
				if(Array.isArray(section.contentItems)) {
					section.contentItems.forEach(ci => {
						if(!ci || typeof ci != "object") {
							return;
						}

						//if ci is an empty object...
						if(Object.keys(ci).length === 0 && ci.constructor === Object) {
							return;
						}

						if(!this.sqs.isPromise(ci)) {
							this.stripExcludedColumnsFromContentItem(ci);
						}
					});
				}
	
				// Recursively process any nested sections
				if (section.hasOwnProperty("sections")) {
					stripSections(section.sections);
				}
			});
		};
	
		if(!exportData || !Array.isArray(exportData.sections)) {
			return exportData;
		}

		// Start the recursion with the top-level sections
		stripSections(exportData.sections);
	
		return exportData;
	}
	

	stripExcludedColumnsFromContentItem(ci) {
		if(!ci || !ci.data || !Array.isArray(ci.data.columns) || !Array.isArray(ci.data.rows)) {
			return ci;
		}

		let subTableKey = null;
		ci.data.columns.forEach((col, key) => {
			if(col.dataType == "subtable") {
				subTableKey = key;
			}
		});

		ci.data.rows.forEach(row => {
			if(subTableKey != null && row[subTableKey] && row[subTableKey].value) {
				let subTable = row[subTableKey].value;
				if(!subTable || !Array.isArray(subTable.columns) || !Array.isArray(subTable.rows)) {
					return;
				}
				
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
		let dialogNodeId = nanoid();
		var dialogNode = $("<div id='node-"+dialogNodeId+"' class='dialog-centered-content-container'></div>");
		this.siteReportManager.sqs.dialogManager.showPopOver("Site data export", "<br />"+dialogNode.prop('outerHTML'));
		
		formats.forEach((format) => {
			let btn = this.getExportButton(format, section, contentItem);
			$("#node-"+dialogNodeId).append(btn);
		});
	}

	/* Function: prepareExportStructure
	* 
	* Re-formats the site report data structure to a format more suitable for export, e.g. by removing data/directives related to rendering.
	*/
	prepareExportStructure(data) {
		if(!Array.isArray(data)) {
			return;
		}

		//These are property keys which somehow refer to the rendering of the data, which we want to strip out when exporting the data since they are not interesting for a third party
		let filterList = [
			"rendered",
			"collapsed",
			"renderOptions",
			"hidden"
		];

		data.map((item) => {
			if(item == null) {
				return;
			}

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
