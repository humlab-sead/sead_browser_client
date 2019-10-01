import shortid from 'shortid';
import XLSX from 'xlsx';
import Config from '../../config/config.js';
import BasicSiteInformation from './SectionModules/BasicSiteInformation.class';
import Samples from './SectionModules/Samples.class';
import Analysis from './SectionModules/Analysis.class';
import SiteReportTable from './RenderModules/SiteReportTable.class';
import SiteReportChart from './RenderModules/SiteReportChart.class';
import HqsLayoutManager from "../HqsLayoutManager.class";


/*
* Class: SiteReport
*
*
*/

class SiteReport {
	constructor(siteReportManager, siteId) {
		this.siteReportManager = siteReportManager;
		this.hqs = this.siteReportManager.hqs;
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
		this.show();

        this.showLoadingIndicator();
		
		this.hqs.hqsEventListen("siteReportSiteNotFound", () => {
			clearTimeout(this.loadIndicatorTimeout);
			this.hideLoadingIndicator();
			$(".site-report-title-site-name").html("<span class='siteReportError'>Site not found</span>");
		});


		//Just for hiding loading indicator...
        this.hqs.hqsEventListen("siteReportSiteInformationBuildComplete", () => {
			//console.log("information load complete");
			this.checkModulesLoadComplete();
        }, this);
		this.hqs.hqsEventListen("siteReportSamplesBuildComplete", () => {
			//console.log("samples load complete");
            this.checkModulesLoadComplete();
        }, this);
        this.hqs.hqsEventListen("siteReportAnalysesBuildComplete", () => {
			//console.log("analysis load complete");
            this.checkModulesLoadComplete();
        }, this);



        this.hqs.hqsEventListen("siteReportRenderComplete", () => {
            clearTimeout(this.loadIndicatorTimeout);
            this.hideLoadingIndicator();
        });


		$("#site-report-content")
			.append("<div id='samples-content-container'></div>")
            .append("<div id='analysis-content-container'></div>");


		this.modules.push({
			"name": "basicSiteInformation",
			"module": new BasicSiteInformation(this.hqs, this.siteId)
		});
        this.modules.push({
            "name": "samples",
            "module": new Samples(this.hqs, this.siteId, "#samples-content-container")
        });
        this.modules.push({
            "name": "analysis",
            "module": new Analysis(this.hqs, this.siteId, "#analysis-content-container")
        });

	}

	checkModulesLoadComplete() {
        let allComplete = true;
        for(let key in this.modules) {
            if(this.modules[key].module.buildComplete === false) {
                allComplete = false;
            }
        }
        if(allComplete) {
            this.hideLoadingIndicator();
        }
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

		this.hqs.hqsEventUnlisten("siteReportSiteInformationBuildComplete", this);
        this.hqs.hqsEventUnlisten("siteReportSamplesBuildComplete", this);
        this.hqs.hqsEventUnlisten("siteReportAnalysesBuildComplete", this);
	}
	
	/*
	Function: showLoadingIndicator
	 */
	showLoadingIndicator() {
		let loadingIndicator = $("#result-loading-indicator")[0].cloneNode(true);
		$(loadingIndicator).attr("id", "site-report-loading-indicator").css("margin-top", "50%");
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
		
		//Enable top bar back-button to go back to the filtering section
		$(".site-report-close-btn").on("click", () => {
			this.hide();
		});
		
		$("#facet-result-panel").animate({
			left: "-100vw"
		}, this.animationTime, this.animationEasing, () => {
			$("#facet-result-panel").hide();
		});
		
		$(".site-report-container").show();
		
		$(".site-report-container").animate({
			left: "0vw"
		}, this.animationTime, this.animationEasing);
		
		
		$("#facet-menu, #aux-menu, #portal-menu").animate({
			top: "-100px"
		}, 250, () => {
			$("#facet-menu, #aux-menu, #portal-menu").hide();
			this.backMenu = this.siteReportManager.hqs.menuManager.createMenu(this.siteReportManager.hqs.siteReportManager.hqsMenu());
			$("#site-report-exit-menu").css("position", "relative").css("left", "-100px").show();
			$("#site-report-exit-menu").animate({
				left: "0px"
			}, 250);
		});
		
		this.siteReportManager.hqs.setActiveView("siteReport");
		this.siteReportManager.siteReportLayoutManager = new HqsLayoutManager(this.siteReportManager.hqs, "#site-report-panel", 80, 20);
	}
	
	/*
	* Function: hide
	*
	* Flips back to the filter/result page in the UI.
	*/
	hide() {
		
		$("#facet-result-panel").css("display", "flex");
		$("#facet-result-panel").animate({
			left: "0vw"
		}, this.animationTime, this.animationEasing);
		
		$(".site-report-container").animate({
			left: "100vw"
		}, this.animationTime, this.animationEasing, () => {
			$(".site-report-container").hide();
		});
		
		$("#site-report-exit-menu").animate({
			left: "-100px"
		}, 250, () => {
			this.siteReportManager.hqs.menuManager.removeMenu(this.backMenu);
			$("#facet-menu, #aux-menu, #portal-menu").show().animate({
				top: "0px"
			}, 250);
		});
		
		hqs.hqsEventDispatch("siteReportClosed");
		//window.history.go(-1);
        this.siteReportManager.hqs.setActiveView("explorer"); //Fun fact: this doesn't actually do anything, I think
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
		
		/*
			var exportStruct = {
				info: {
					description: "Data export from the SEAD project. Visit https://www.sead.se for more information.",
					url: Config.serverRoot+"/site/"+this.siteId
				},
				site: this.siteId,
				section: section.title,
				content: contentItem.title,
				datatable: contentItem.data
			};
			 */
		
		console.log(this.data);
		
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
	
	
	/*
	* Function: treeRenderAllSections
	*
	* Recursively traverses the site report structure and renders each section as defined in the JSON.
	*
	* Parameters:
	* data - Site report structure
	* parent - Don't define this, it's used for the internal recursion.
	* level - Don't worry about this either.
	*
	*/
	/*
	treeRenderAllSections(data, parent = null, level = 0) {
		console.log(data.sections);
		for(var key in data.sections) {
			var section = data.sections[key];
			
			this.renderSection(section, data, level);
			
			//Render sub-sections (if any)
			if(this.sectionHasSubSections(section)) {
				//Calling myself
				// - Hello, how are you? I'm good, you? We're the same you know... therefore I am good as well, or is it because I am good that you are also good? Nay, we may be identical but surely the cyclic nature of our relationship implies a certain hierarchy
				this.treeRenderAllSections(section, data, ++level);
			}
		}
	}
	*/
	
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
	renderSection(section, parent = null, level = 0) {
		if(parent == null) {
			this.data.sections.push(section);
		}
		
		let hasChildSections = false;
		hasChildSections = section.hasOwnProperty("sections") && section.sections.length > 0;

		if(section.contentItems.length == 0 && hasChildSections === false) {
			return;
		}
		
		//Grab a copy of the container sectionNode and initialize it
		var sectionNode = $(".site-report-level-container-template")[0].cloneNode(true);
		$(sectionNode).removeClass("site-report-level-container-template")
			.addClass("site-report-level-container")
			.attr("id", "site-report-section-"+section.name)
			.attr("site-report-section-name", section.name);
		
		//Make header
		var sectionTitle = section.title;
		if(section.hasOwnProperty("methodName")) {
			sectionTitle = section.methodName;
		}
		$(".site-report-level-title", sectionNode)
			.html("<i class=\"site-report-sections-expand-button fa fa-plus-circle\" aria-hidden=\"true\">&nbsp;</i>"+sectionTitle)
			.on("click", (evt) => {
				var parent = $(evt.currentTarget).parent();
				var collapsed = parent.children(".site-report-level-content").attr("collapsed") == "true";
				collapsed = !collapsed;
				section.collapsed = collapsed;
				this.setSectionCollapsedState(parent, section); //Set reverse of current state
			});
		
		if(section.hasOwnProperty("methodDescription")) {
			this.hqs.tooltipManager.registerTooltip($(".site-report-level-title", sectionNode), section.methodDescription, {drawSymbol: true});
		}
		
		//If this is a top-level section, add another class for different theming
		if(level == 0) {
			$(".site-report-level-title", sectionNode).addClass("site-report-level-title-static");
			$(".site-report-sections-expand-button", sectionNode).remove();
		}
		
		if(level == 0) {
			$("#site-report-content").append(sectionNode);
		}
		else {
			//console.log("#site-report-section-"+parent.name+" > .site-report-level-content");
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
			this.hqs.tooltipManager.registerTooltip(helpAnchor, section.description, {drawSymbol: true});
		}
		else {
			$("#site-report-"+section.name+"-help").remove();
		}
		
		if(typeof(section.sections) != "undefined") {
			for(var key in section.sections) {
				this.renderSection(section.sections[key], section, level+1);
			}
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
			//this.rotateSectionArrow(expandButtonNode, 0);
			sectionNode.children(".site-report-level-content").attr("collapsed", "true").slideUp({
				duration: 100,
				easing: this.animationEasing
			});
		}
		else {
			expandButtonNode.removeClass("fa-plus-circle").addClass("fa-minus-circle");
			//this.rotateSectionArrow(expandButtonNode, 90);
			sectionNode.children(".site-report-level-content").attr("collapsed", "false").slideDown({
				duration: 100,
				easing: this.animationEasing
			});
			
			
			this.renderContentItems(section);
		}
	}
	
	rotateSectionArrow(node, degrees) {
		$(node).animate({ rotate: degrees }, {
			step: function(now, fx) {
				$(this).css('transform','rotate('+now+'deg)');
			},
			duration: 100
		}, this.animationEasing);
	}
	
	/*
	Function: renderContentItems
	 */
	renderContentItems(section, forceReRender = false) {
		
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
		
		section.contentItems.forEach((contentItem, i) => {
			this.renderContentItem(section, contentItem);
		});
		
		section.rendered = true;
	}
	
	/*
	Function: renderContentItem
	 */
	renderContentItem(section, contentItem, forceReRender = false) {
		var datasetId = "";
		if(contentItem.hasOwnProperty("datasetId")) {
			datasetId = "<span class='dataset-id'>("+contentItem.name+")</span>";
		}
		
		
		var headerNode = $("<div class='content-item-header-container'><h4><span class='contentitem-title'>"+contentItem.title+"</span>"+datasetId+"</h4></div>");
		$("#site-report-section-"+section.name+" > .site-report-level-content").append(headerNode);
		this.hqs.tooltipManager.registerTooltip($(".dataset-id", headerNode), "Unique dataset identifier", { drawSymbol: true });
		this.hqs.tooltipManager.registerTooltip($(".contentitem-title", headerNode), "Name of the dataset as given by the content provider", { drawSymbol: true });
		
		$(headerNode).append("<div class='content-item-header-divider'></div>");
		
		var renderModeSelectorNode = this.renderContentDisplayOptionsPanel(section, contentItem);
		if(renderModeSelectorNode !== false) {
			$(headerNode).append(renderModeSelectorNode);
			$(headerNode).append("<div class='content-item-header-divider'></div>");
		}
		
		
		var exportNode = this.getContentItemExportControl(section, contentItem);
		$(headerNode).append(exportNode);
		
		
		var dataVisContainerNode = $("<div id='contentItem-"+contentItem.name+"' class='data-vis-container'><span class='siteReportContentItemLoadingMsg'>Rendering...</span></div>");
		$("#site-report-section-"+section.name+" > .site-report-level-content").append(dataVisContainerNode);
		
		setTimeout(() => { //This might seem strange, but it's really just because we need a delay here so that the "Rendering..." message can be pushed out to the DOM before the whole browser locks up while rendering the content-items(s), yeah it's a non-ideal "solution"...
			this.renderDataVisualization(section, contentItem);
		}, 200);
		
		
	}
	
	getExportButton(exportFormat, exportStruct) {
		var node = null;
		if(exportFormat == "json") {
			node = $("<a id='site-report-json-export-download-btn' class='site-report-export-download-btn light-theme-button'>Download JSON</a>");
			var exportData = Buffer.from(JSON.stringify(exportStruct, null, 2)).toString("base64");
			$(node).attr("href", "data:application/octet-stream;charset=utf-8;base64,"+exportData);
			$(node).attr("download", "sead-export.json");
			$(node).on("click", (evt) => {
				$(evt.currentTarget).effect("pulsate", 2);
			});
		}
		if(exportFormat == "xlsx") {
			node = $("<a id='site-report-xlsx-export-download-btn' class='site-report-export-download-btn light-theme-button'>Download XLSX</a>");
			$(node).on("click", (evt) => {
				$(evt.currentTarget).effect("pulsate", 2);
				var filename = "sead-export.xlsx";
				var data = this.getDataForXlsx(exportStruct.datatable);
				//var data = this.getDataForXlsx(contentItem.data);
				
				data.unshift([""]);
				data.unshift(["Content: "+exportStruct.content]);
				data.unshift(["Section: "+exportStruct.section]);
				data.unshift([exportStruct.info.url]);
				data.unshift([exportStruct.info.description]);
				
				var ws_name = "SEAD Data";
				var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(data);
				//add worksheet to workbook
				XLSX.utils.book_append_sheet(wb, ws, ws_name);
				//write workbook
				XLSX.writeFile(wb, filename);
			});
		}
		
		return node;
	}
	
	renderExportDialog(formats = ["json", "xlsx"], section = "all", contentItem = "all") {
		
		var exportStruct = {
			info: {
				description: "Data export from the SEAD project. Visit https://www.sead.se for more information.",
				url: ""
			},
			site: this.siteId,
			section: "All",
			content: "All",
			data: this.data
		};
		
		if(section != "all" && contentItem != "all") {
			exportStruct = {
				info: {
					description: "Data export from the SEAD project. Visit https://www.sead.se for more information.",
					url: Config.serverRoot+"/site/"+this.siteId
				},
				site: this.siteId,
				section: section.title,
				content: contentItem.title,
				datatable: contentItem.data
			};
		}
		
		var dialogNodeId = shortid.generate();
		var dialogNode = $("<div id='node-"+dialogNodeId+"' class='dialog-centered-content-container'></div>");
		this.siteReportManager.hqs.dialogManager.showPopOver("Site data export", "<br />"+dialogNode.prop('outerHTML'));
		
		if(formats.indexOf("json") != -1) {
			var jsonBtn = this.getExportButton("json", exportStruct);
			$("#node-"+dialogNodeId).append(jsonBtn)
		}
		if(formats.indexOf("xlsx") != -1) {
			var xlsxBtn = this.getExportButton("xlsx", exportStruct);
			$("#node-"+dialogNodeId).append(xlsxBtn)
		}
	}
	
	getContentItemExportControl(section, contentItem) {
		var controlsId = "content-item-export-"+shortid.generate();
		var node = $("#site-report-content-item-export-template")[0].cloneNode(true);
		$(node).attr("id", controlsId);
		
		$(node).on("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			
			this.renderExportDialog(["json", "xlsx"], section, contentItem);
		});
		
		return node;
	}
	
	/*
	* Function: getDataForXlsx
	*
	* Formats a data table for XLSX-export. Doesn't actually make it into XLSX, it just created a JSON data structure that is appropriate for feeding into the XLSX library.
	 */
	getDataForXlsx(dataTable) {
		var data = [];
		var row = [];
		
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
		data.push(row);
		
		for(var key in dataTable.rows) {
			row = [];
			var subTable = [];
			for(var cellKey in dataTable.rows[key]) {
				var cell = dataTable.rows[key][cellKey];
				if(cell.type == "subtable") {
					subTable = this.getDataForXlsx(cell.value);
				}
				else {
					if(cell.hasOwnProperty("value")) {
						row.push(cell.value);
					}
				}
			}
			data.push(row);
			for(var k in subTable) {
				subTable[k].unshift("SubTable:");
				data.push(subTable[k]);
			}
		}
		
		return data;
	}
	
	/*
	Function: renderDataVisualization
	 */
	renderDataVisualization(section, contentItem) {
		console.log("renderDataVisualization");
		this.sortContentItemData(contentItem);

		this.updateContentDisplayOptionsPanel(section, contentItem);
		
		var anchorSelector = "#site-report-section-"+section.name+" > .site-report-level-content > #contentItem-"+contentItem.name;
		$(anchorSelector).html("");
		
		if(contentItem.hasOwnProperty("renderOptions") == false || contentItem.renderOptions.length == 0) {
			$(anchorSelector).html("<h5>No support for rendering this type of content.</h5>");
		}
		
		if(typeof(contentItem.renderInstance) != "undefined") {
			contentItem.renderInstance.unrender();
		}

		for(var key in contentItem.renderOptions) {
			if(contentItem.renderOptions[key].selected) {
				switch(contentItem.renderOptions[key].type) {
					case "bar":
					case "scatter":
					case "pie":
					case "multistack":
						contentItem.renderInstance = new SiteReportChart(this, contentItem);
						contentItem.renderInstance.render(anchorSelector);
						break;
					case "table":
						contentItem.renderInstance = new SiteReportTable(this, contentItem);
						contentItem.renderInstance.render(anchorSelector);
						contentItem.renderInstance.renderContentDisplayOptionsPanel(section, contentItem);
						break;
					default:
						break;
				}
			}
		}
		
	}
	
	offerToRenderModules(contentItem, anchorSelector) {
		for(var key in this.renderModules) {
			this.renderModules[key].offer(contentItem, anchorSelector);
		}
	}
	
	
	/*
	* Function: renderContentDisplayOptionsPanel
	* 
	* This render the content options display panel. Which is the thing which lets you select whether to render this content item as a chart or table etc.
	*
	 */
	renderContentDisplayOptionsPanel(section, contentItem) {
		var selectedRo = this.getSelectedRenderOption(contentItem);
		console.log(selectedRo, section, contentItem);
		if(typeof(selectedRo.options) == "undefined") {
			selectedRo.options = []; //Just normalizing this...
		}
		
		if(contentItem.renderOptions.length == 1 && Object.keys(selectedRo.options).length == 0) {
			//If there's just 1 renderOption and it has no options, then there's no point to this dialog...
			return false;
		}
		
		//Make DOM node
		//var controlsId = "view-selector-"+shortid.generate(); //FIXME: Replace with another ID
		let controlsId = "view-selector-"+contentItem.name;
		var node = $("#site-report-render-options-template")[0].cloneNode(true);
		$(node).attr("id", controlsId);
		$(".site-report-render-options-container", node).hide();
		
		//Display options button callback
		$(".site-report-display-settings-btn", node).on("click", (evt) => {
			let displayOptionsContainerNode = $(".site-report-render-options-container", node);
			if($(displayOptionsContainerNode).is(":visible")) {
				$(evt.currentTarget).parent().animate({
					"border-width": "0"
				}, 100);
			}
			else {
				$(evt.currentTarget).parent().animate({
					"border-width": "1"
				}, 100);
			}
			$(displayOptionsContainerNode).toggle(100);
		});

		
		
		//Add RenderOptions to select
		for(var key in contentItem.renderOptions) {
			var optionNode = $("<option>"+contentItem.renderOptions[key].name+"</option>");
			optionNode.attr("value", contentItem.renderOptions[key].type);
			optionNode.attr("selected", contentItem.renderOptions[key].selected);
			$(".site-report-render-mode-selector", node).append(optionNode);
		}
		
		/*
		//This seems to set selected ro's depending on currently selected type, but it makes no sense
		for(var key in contentItem.renderOptions) {
			if(contentItem.renderOptions[key].type == selectedRo.type) {
				contentItem.renderOptions[key].selected = true;
			}
			else {
				contentItem.renderOptions[key].selected = false;
			}
		}
		*/

		//RenderOption selected callback
		$(".site-report-render-options-container > .site-report-render-mode-selector", node).bind("change", (evt) => {
			console.log("site-report-render-mode-selector CHANGED");
			var selectedRenderOption = $(evt.currentTarget).val();
			
			//Update structure with new selection
			for(let key in contentItem.renderOptions) {
				contentItem.renderOptions[key].type == selectedRenderOption ? contentItem.renderOptions[key].selected = true : contentItem.renderOptions[key].selected = false;
			}

			this.renderDataVisualization(section, contentItem);
			this.renderContentDisplayOptionsPanelExtras(section, contentItem, node);
		});

		this.renderContentDisplayOptionsPanelExtras(section, contentItem, node);
		
		return node;
	}

	/*
	* Function: renderContentDisplayOptionsPanelExtras
	* 
	* The 'extras' here refers to any extra options the currently selected render option might have - such as what values to show for each axis in a graph.
	*
	 */
	renderContentDisplayOptionsPanelExtras(section, contentItem, node) {
		let selectedRo = this.getSelectedRenderOption(contentItem);
		let optionsContainer = $(".site-report-render-options-container-extras", node);

		let html = "";
		for(let key in selectedRo.options) {
			let option = selectedRo.options[key];
			if(option.showControls !== false) {
				html += "<label class='site-report-view-selector-label' for=''>"+option.title+":</label>";
				html += "<select renderOptionExtraKey='"+key+"' class='site-report-view-selector-control site-report-render-mode-selector hqs'>";
				for(let k2 in option.options) {
					let selectedHtml = option.selected == option.options[k2] ? "selected" : "";
					html += "<option value='"+option.options[k2]+"' "+selectedHtml+">"+contentItem.data.columns[option.options[k2]].title+"</option>";
				}
				html += "</select>";
			}
		}

		optionsContainer.html(html);
		
		
		$(".site-report-render-options-container-extras .site-report-view-selector-control", node).on("change", (evt) => {
			console.log("site-report-render-options-container-extras CHANGED");

			let selected = parseInt($(evt.currentTarget).val());
			let renderOptionExtraKey = $(evt.currentTarget).attr("renderOptionExtraKey");
			selectedRo.options[renderOptionExtraKey].selected = selected;
			
			this.renderDataVisualization(section, contentItem);
		});
		
		
	}
	
	/*
	Function: updateContentDisplayOptionsPanel
	 */
	updateContentDisplayOptionsPanel(section, contentItem) {
		/*
		var sectionNode = $("#site-report-section-"+section.name);
		var displayOptionsNode = $(".site-report-display-options-main", sectionNode);
		
		var selectedRenderOption = this.getSelectedRenderOption(contentItem);
		switch(selectedRenderOption.type) {
			case "table":
				$(".site-report-axis-control", displayOptionsNode).hide();
				break;
			case "bar":
				$(".site-report-axis-control", displayOptionsNode).show();
				$(".site-report-x-axis", displayOptionsNode).val(selectedRenderOption.options.xAxis);
				$(".site-report-y-axis", displayOptionsNode).val(selectedRenderOption.options.yAxis);
				break;
		}
		*/
	}
	
	/*
	Function: getSelectedRenderOption
	 */
	getSelectedRenderOption(contentItem) {
		for(var key in contentItem.renderOptions) {
			if(contentItem.renderOptions[key].selected) {
				return contentItem.renderOptions[key];
			}
		}
		return false;
	}
	
	/*
	Function: showRenderOptions
	 */
	showRenderOptions(show, selectedRenderOptionType = null) {
		if(show) {
			var renderOptionsWith2Axes = ["bar", "scatter"];
			if($.inArray(selectedRenderOptionType, renderOptionsWith2Axes) != -1) {
			
			}
		}
		else {
		
		}
	}
	
	
	async getTaxa(taxonList) {
		let queries = [];
		let itemsLeft = taxonList.length;
		if(taxonList.length > 0) {
			let taxonQueryString = "(";
			for(let key in taxonList) {
				taxonQueryString += "taxon_id.eq."+taxonList[key]+",";
				if(taxonQueryString.length > 1024 && itemsLeft > 1) { //HTTP specs says max 2048
					taxonQueryString = taxonQueryString.substr(0, taxonQueryString.length-1);
					taxonQueryString += ")";
					queries.push(taxonQueryString);
					taxonQueryString = "(";
				}
				itemsLeft--;
			}
			taxonQueryString = taxonQueryString.substr(0, taxonQueryString.length-1);
			taxonQueryString += ")";
			queries.push(taxonQueryString);
		}

		let queryData = [];
		for(let key in queries) {
			let requestString = this.hqs.config.siteReportServerAddress+"/qse_taxon?or="+queries[key];
			
			let result = await $.ajax(requestString, {
				method: "get",
				dataType: "json",
				success: (data) => {
				}
			});
			for(let i in result) {
				queryData.push(result[i]);
			}
		}
		return queryData;
	}

	sortContentItemData(contentItem) {
		let columnKey = null;
		for(let key in contentItem.renderOptions) {
			if(contentItem.renderOptions[key].selected) {
				let sortKey = this.hqs.findObjectPropInArray(contentItem.renderOptions[key].options, "title", "Sort");
				if(sortKey !== false) {
					columnKey = contentItem.renderOptions[key].options[sortKey].selected;
				}
			}
		}
		if(columnKey != null) {
			contentItem.data.rows.sort(function(a, b) {
				if (a[columnKey].value < b[columnKey].value)
					return -1;
				if (a[columnKey].value < b[columnKey].value)
					return 1;
				return 0;
			});
		}
	}
	
	siteReportTabsMenu() {
		return {
			title: "VIEW :",
			layout: "horizontal",
			collapsed: false,
			anchor: "#site-report-tabs",
			staticSelection: true,
			showMenuTitle: false,
			items: [
				{
					name: "samples",
					title: "Samples",
					icon: "",
					/*staticSelection: this.getActiveModule().name == "map" ? true : false,*/
					callback: () => {
						/*
						$.event.trigger("seadResultMenuSelection", {
							selection: "map"
						});
						*/
					}
				},
				{
					name: "analysis",
					title: "Analysis",
					icon: "",
					/*staticSelection: this.getActiveModule().name == "table" ? true : false,*/
					callback: () => {
						/*
						$.event.trigger("seadResultMenuSelection", {
							selection: "table"
						});
						*/
					}
				}
			]
		};
	}
	
}

export { SiteReport as default }