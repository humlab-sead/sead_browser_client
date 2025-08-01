import { nanoid } from 'nanoid';
import SiteReportTable from './RenderModules/SiteReportTable.class';
import SiteReportChart from './RenderModules/SiteReportChart.class';
import DendroChart from './RenderModules/DendroChart.class';
import DendroPlotly from './RenderModules/DendroPlotly.class';

class ContentItemRenderer {
    constructor(siteReport, section, contentItem) {
        this.siteReport = siteReport;
        this.sqs = siteReport.sqs;
        this.section = section;
        this.contentItem = contentItem;
        this.renderInstanceRepository = [];
    }

    render() {
		//if the contentItem is a promise, we wait for it to resolve before rendering and then we update the siteReport.data with the resolved contentItem
		if(this.sqs.isPromise(this.contentItem)) {
			this.contentItem.then((resolvedContentItem) => {
				for(let sectionKey in this.siteReport.data.sections) {
					for(let sectionKey2 in this.siteReport.data.sections[sectionKey].sections) {
						if(typeof this.siteReport.data.sections[sectionKey].sections[sectionKey2].contentItems != "undefined") {
							for(let ciKey in this.siteReport.data.sections[sectionKey].sections[sectionKey2].contentItems) {
								if(this.siteReport.data.sections[sectionKey].sections[sectionKey2].contentItems[ciKey] === this.contentItem) {
									this.siteReport.data.sections[sectionKey].sections[sectionKey2].contentItems[ciKey] = resolvedContentItem;
								}
							}
						}
					}
				}

				this.contentItem = resolvedContentItem;
				this.render();
			});
			return;
		}

		if(!this.contentItem) {
			return;
		}

        var datasetId = "";
		if(this.contentItem.hasOwnProperty("datasetId")) {
			datasetId = "<span class='dataset-id'>("+this.contentItem.name+")</span>";
		}
		
		var headerNode = $("<div class='content-item-header-container'><h4><span class='contentItem-title'>"+this.contentItem.title+"</span>"+datasetId+"</h4></div>");
		
		let cicId = "cic-"+this.contentItem.name; //content-item-container id
		//$("#site-report-section-"+section.name+" > .site-report-level-content").append(headerNode);
		$("#site-report-section-"+this.section.name+" > .site-report-level-content").append("<div id='"+cicId+"' class='content-item-container'></div>");
		$("#site-report-section-"+this.section.name+" > .site-report-level-content > #cic-"+this.contentItem.name).append(headerNode);

        this.renderContentItemTooltip(headerNode);

		$(headerNode).append("<div class='content-item-header-divider'></div>");

		var renderModeSelectorNode = this.renderContentDisplayOptionsPanel(this.section, this.contentItem);
		if(renderModeSelectorNode !== false) {
			$(headerNode).append(renderModeSelectorNode);
			$(headerNode).append("<div class='content-item-header-divider'></div>");
		}
		
		var exportNode = this.getContentItemExportControl(this.section, this.contentItem);
		$(headerNode).append(exportNode);


		let contactData = "<ul style='list-style-type: none;'><li>No contact information available</li></ul>";
		if(typeof this.contentItem.datasetContacts != "undefined" && this.contentItem.datasetContacts.length > 0) {
			contactData = this.contentItem.datasetContacts;
		}
		
		let referenceData = "<ul style='list-style-type: none;'><li>No references available</li></ul>";
		if(typeof this.contentItem.datasetReference != "undefined" && this.contentItem.datasetReference.length > 0) {
			referenceData = this.contentItem.datasetReference;
		}

		headerNode.append("<div class='content-item-header-divider'></div>");
		let refAndContacts = "<h4 class='header-with-underline'>References</h4>";
		refAndContacts += referenceData;
		refAndContacts += "<h4 class='header-with-underline'>Contacts</h4>";
		refAndContacts += contactData;
		headerNode.append(this.renderDatasetReferences(refAndContacts));
		
		
		var dataVisContainerNode = $("<div id='contentItem-"+this.contentItem.name+"' class='data-vis-container'><span class='siteReportContentItemLoadingMsg'>Rendering...</span></div>");
		$("#site-report-section-"+this.section.name+" > .site-report-level-content > #"+cicId).append(dataVisContainerNode);

        this.renderDataVisualization();
    }

	renderPopout(section, contentItem) {
		console.warn("I DO NOTHING!");
		/*
		var controlsId = "content-item-popout-"+nanoid();
		var node = $("#site-report-content-item-popout-template")[0].cloneNode(true);
		$(node).attr("id", controlsId);
		
		$(node).on("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();

			console.log("hit!");
			
			var contentItemNode = $("#site-report-section-"+section.name+" > .site-report-level-content > #cic-"+contentItem.name+" > #contentItem-"+contentItem.name)[0].cloneNode(true);
			//render as popover

			//$("#site-report-section-"+section.name+" > .site-report-level-content > #cic-"+contentItem.name).append(contentItemNode);

			console.log(contentItemNode)
			console.log(contentItemNode.innerHTML)
			
			this.sqs.dialogManager.showPopOver(contentItem.title, "", {
				width: "500px"
			});
			
			$("#popover-dialog-frame > .popover-content").append(contentItemNode);
			
		});
		
		return node;
		*/
	}

	renderDatasetReferences(datasetReference) {
		var controlsId = "content-item-export-"+nanoid();
		var node = $("#site-report-content-item-reference-template")[0].cloneNode(true);
		$(node).attr("id", controlsId);

		$(node).on("click", (evt) => {
			this.sqs.dialogManager.showPopOver("Reference & contact", datasetReference, {
				width: "500px"
			});
		});

		return node;
	}

    renderContentItemTooltip(headerNode) {
        if(typeof this.contentItem.titleTooltip != "undefined" && this.contentItem.titleTooltip != "") {
			this.sqs.tooltipManager.registerTooltip($(".contentItem-title", headerNode), this.contentItem.titleTooltip, { drawSymbol: true });
		}
    }

    /* Function: addRenderInstance
	*
	*
	* Parameters:
	* contentItemName
	* renderInstance
	*/
	addRenderInstance(contentItemName, renderInstance) {
		this.renderInstanceRepository.push({
			contentItemName: contentItemName,
			renderInstance: renderInstance
		});
	}
	
	/* Function: getRenderInstance
	*
	*
	* Parameters:
	* contentItemName
	*/
	getRenderInstance() {
		for(let key in this.renderInstanceRepository) {
			if(this.renderInstanceRepository[key].contentItemName == this.contentItem.name) {
				return this.renderInstanceRepository[key].renderInstance;
			}
		}
		return false;
	}

	/* Function: removeRenderInstance
	*
	*
	* Parameters:
	* contentItemName
	*/
	removeRenderInstance(contentItemName) {
		for(let key in this.renderInstanceRepository) {
			if(this.renderInstanceRepository[key].contentItemName == contentItemName) {
				this.renderInstanceRepository.splice(key, 1);
			}
		}
	}

	/*
	Function: renderDataVisualization
	updatedExtrasRenderOption - This is any update of any of the "extra" render options for this graph/table which triggered this re-render.
	 */
	renderDataVisualization(updatedExtrasRenderOption = null) {
		this.sortContentItemData(this.contentItem);
		
		var anchorSelector = "#site-report-section-"+this.section.name+" > .site-report-level-content > #cic-"+this.contentItem.name+" > #contentItem-"+this.contentItem.name;
		$(anchorSelector).html("");
		
		if(this.contentItem.hasOwnProperty("renderOptions") == false || this.contentItem.renderOptions.length == 0) {
			$(anchorSelector).html("<h5>No support for rendering this type of content.</h5>");
		}

		let renderInstance = this.getRenderInstance(this.contentItem.name);

		//If we already have a renderInstace, we try to re-use that, if not we spawn a new one
		if(renderInstance === false) {
			this.spawnRenderInstance(anchorSelector);
		}
		else {
			let updated = renderInstance.update(updatedExtrasRenderOption);
			if(updated === false) {
				renderInstance.unrender();
				this.removeRenderInstance(this.contentItem.name);
				this.spawnRenderInstance(anchorSelector);
			}
		}	
	}

	spawnRenderInstance(anchorSelector) {
		let renderInstance = null;

		for(var key in this.contentItem.renderOptions) {
			if(this.contentItem.renderOptions[key].selected) {
				switch(this.contentItem.renderOptions[key].type) {
					case "bar":
					case "scatter":
					case "pie":
					case "ms-bar":
					case "loi-bar":
					case "multistack":
					case "ecocode":
					case "ecocodes-samples":
					case "coordinate-map":
						renderInstance = new SiteReportChart(this.siteReport, this.contentItem);
						renderInstance.render(anchorSelector);
						this.addRenderInstance(this.contentItem.name, renderInstance);
						break;
					case "dendrochart":
						renderInstance = new DendroChart(this.siteReport, this.contentItem);
						//renderInstance = new DendroPlotly(this.siteReport, this.contentItem);
						renderInstance.render(anchorSelector);
						this.addRenderInstance(this.contentItem.name, renderInstance);
						break;
					case "table":
					case "external_link":
						renderInstance = new SiteReportTable(this.siteReport, this.contentItem);
						renderInstance.render(anchorSelector);
						renderInstance.renderContentDisplayOptionsPanel(this.section, this.contentItem);
						this.addRenderInstance(this.contentItem.name, renderInstance);
						break;
					default:
						break;
				}
			}
		}

		return renderInstance;
	}

    toggleContentDisplayOptionsPanel(show = true) {
		let controlsId = "view-selector-"+this.contentItem.name;
		let node = $("#"+controlsId);
		let displayOptionsContainerNode = $(".site-report-render-options-container", node);
		if($(displayOptionsContainerNode).is(":visible")) {
			node.parent().animate({
				"border-width": "0"
			}, 100);
		}
		else {
			node.parent().animate({
				"border-width": "1"
			}, 100);
		}
		$(displayOptionsContainerNode).toggle(100);
		
		if(this.contentItem.renderOptions.length == 1) {
			$(".site-report-render-options-main-render-type", node).hide();
		}
	}

	renderOptionSelectedCallback(selectedRenderOption) {
		//Update structure with new selection
		for(let key in this.contentItem.renderOptions) {
			this.contentItem.renderOptions[key].type == selectedRenderOption ? this.contentItem.renderOptions[key].selected = true : this.contentItem.renderOptions[key].selected = false;
		}

		let controlsId = "view-selector-"+this.contentItem.name;
		let node = $("#"+controlsId);

		this.renderDataVisualization();
		this.renderContentDisplayOptionsPanelExtras(node);
	}

	/*
	* Function: renderContentDisplayOptionsPanel
	* 
	* This render the content options display panel. Which is the thing which lets you select whether to render this content item as a chart or table etc.
	*
	 */
	renderContentDisplayOptionsPanel(section, contentItem) {
		var selectedRo = this.getSelectedRenderOption(contentItem);
		if(typeof(selectedRo.options) == "undefined") {
			selectedRo.options = []; //Just normalizing this...
		}

		let numActiveRoOpts = 0;
		selectedRo.options.forEach((roOpt) => {
			if(roOpt.showControls != false) {
				numActiveRoOpts++;
			}
		});

		if(contentItem.renderOptions.length == 1 && numActiveRoOpts == 0) {
			//If there's just 1 renderOption and it has no options, then there's no point to this dialog...
			return false;
		}
		
		//Make DOM node
		let controlsId = "view-selector-"+contentItem.name;
		var node = $("#site-report-render-options-template")[0].cloneNode(true);
		$(node).attr("id", controlsId);
		$(".site-report-render-options-container", node).hide();
		
		//Add RenderOptions to select
		for(var key in contentItem.renderOptions) {
			var optionNode = $("<option>"+contentItem.renderOptions[key].name+"</option>");
			optionNode.attr("value", contentItem.renderOptions[key].type);
			optionNode.attr("selected", contentItem.renderOptions[key].selected);
			$(".site-report-render-mode-selector", node).append(optionNode);
		}

		//Display options button callback
		$(".site-report-toolbar-btn", node).on("click", () => {
			this.toggleContentDisplayOptionsPanel(contentItem);
		});

		//RenderOption selected callback
		$(".site-report-render-options-container > .site-report-render-mode-selector", node).on("change", (evt) => {
			this.renderOptionSelectedCallback($(evt.currentTarget).val());
		});

		this.renderContentDisplayOptionsPanelExtras(node);
		
		return node;
	}

	/*
	* Function: renderContentDisplayOptionsPanelExtras
	* 
	* The 'extras' here refers to any extra options the currently selected render option might have - such as what values to show for each axis in a graph.
	*
	 */
	renderContentDisplayOptionsPanelExtras(node) {
		let selectedRo = this.getSelectedRenderOption(this.contentItem);
		let optionsContainerNode = $(".site-report-render-options-container-extras", node);

		let html = "";
		for(let key in selectedRo.options) {
			let option = selectedRo.options[key];
			if(option.enabled !== false && option.showControls !== false) {
				html += "<label class='site-report-view-selector-label' for=''>"+option.title+":</label>";
                if(option.type == "select") {
                    html += "<select renderOptionExtraKey='"+key+"' class='site-report-view-selector-control site-report-render-mode-selector sqs'>";
                    for(let k2 in option.options) {
                        let selectedHtml = option.options[k2].selected ? "selected" : "";

						let optionTitle = option.options[k2].title;
						
						/*
						//If the title can be parsed to an integer, assume it is a reference to column name and the actual title should be looked up
						if(!isNaN(parseInt(option.options[k2].title))) {
							optionTitle = this.contentItem.data.columns[option.options[k2].title].title;
						}
						*/

                        html += "<option value='"+k2+"' "+selectedHtml+">"+optionTitle+"</option>";
                    }
                    html += "</select>";
                }
                if(option.type == "text") {
                    html += "<input type='text' renderOptionExtraKey='"+key+"' class='site-report-view-selector-control site-report-render-mode-selector sqs' />";
                }
				
			}
		}
		
		optionsContainerNode.html(html);
		
		
		$(".site-report-render-options-container-extras .site-report-view-selector-control", node).on("change", (evt) => {

			let selected = parseInt($(evt.currentTarget).val());
			let renderOptionExtraKey = $(evt.currentTarget).attr("renderOptionExtraKey");

            for(let key in selectedRo.options[renderOptionExtraKey].options) {
                selectedRo.options[renderOptionExtraKey].options[key].selected = false;
            }

			selectedRo.options[renderOptionExtraKey].options[selected].selected = true;

			//selectedRo.options[renderOptionExtraKey].selected = selected;
		    this.renderDataVisualization(selectedRo.options[renderOptionExtraKey]);
		});
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

	sortContentItemData(contentItem) {
		let columnKey = null;
		for(let key in contentItem.renderOptions) {
			if(contentItem.renderOptions[key].selected) {
				let sortKey = this.sqs.findObjectPropInArray(contentItem.renderOptions[key].options, "title", "Sort");
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

    getContentItemExportControl(section, contentItem) {
		var controlsId = "content-item-export-"+nanoid();
		var node = $("#site-report-content-item-export-template")[0].cloneNode(true);
		$(node).attr("id", controlsId);

		$(node).on("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			
			let selectedRoType = "";
			this.contentItem.renderOptions.map((ro) => {
				if(ro.selected) {
					selectedRoType = ro.type;
				}
			});
			
			let exportFormats = ["json", "xlsx"];
			//let exportFormats = ["json", "xlsx", "pdf"];
			
			if(selectedRoType != "table" && selectedRoType != "dendrochart" && selectedRoType != "ecocodes-samples" && selectedRoType != "ecocode") {
				exportFormats.push("png");
			}

			if(selectedRoType == "coordinate-map") {
				exportFormats = ["geojson"];
			}

			if(contentItem.exportFormats) {
				exportFormats = exportFormats.concat(contentItem.exportFormats);
			}

			this.siteReport.renderExportDialog(exportFormats, section, contentItem);
		});
		
		return node;
	}
}

export { ContentItemRenderer as default };