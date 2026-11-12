import { nanoid } from 'nanoid';
import SiteReportTable from './RenderModules/SiteReportTable.class';
import SiteReportChart from './RenderModules/SiteReportChart.class';
import DendroChart from './RenderModules/DendroChart.class';

class ContentItemRenderer {
	    constructor(siteReport, section, contentItem) {
	        this.siteReport = siteReport;
	        this.sqs = siteReport.sqs;
	        this.section = section;
	        this.contentItem = contentItem;
	        this.renderInstanceRepository = [];
	        this.placeholderId = null;
	        this.displayOptionsNamespace = ".displayOptions-" + nanoid();
	    }

    render() {
		//if the contentItem is a promise, reserve a placeholder div immediately to preserve ordering, then wait for resolution
		if(this.sqs.isPromise(this.contentItem)) {
			// Insert a placeholder now so this slot stays in the correct position among sibling contentItems
			let placeholderId = "cic-placeholder-"+nanoid();
			this.placeholderId = placeholderId;
			$("#site-report-section-"+this.section.name+" > .site-report-level-content").append("<div id='"+placeholderId+"' class='content-item-container'></div>");

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
				if(!this.contentItem) {
					// Promise resolved to null/undefined — remove the placeholder and bail out
					if(this.placeholderId) {
						$("#"+this.placeholderId).remove();
						this.placeholderId = null;
					}
					return;
				}
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
		// If a placeholder was reserved for this item (was a promise), promote it to the real container id.
		// Otherwise append a new container at the end (synchronous items render in order naturally).
		if(this.placeholderId) {
			$("#site-report-section-"+this.section.name+" > .site-report-level-content > #"+this.placeholderId).attr("id", cicId);
			this.placeholderId = null;
		} else {
			$("#site-report-section-"+this.section.name+" > .site-report-level-content").append("<div id='"+cicId+"' class='content-item-container'></div>");
		}
		$("#site-report-section-"+this.section.name+" > .site-report-level-content > #cic-"+this.contentItem.name).append(headerNode);

        this.renderContentItemTooltip(headerNode);

		$(headerNode).append("<div class='content-item-header-divider'></div>");

		//The controls of what is shown, under the title, on a row of their own
		this.headerNode = headerNode;
		let viewControlsNode = $("<div class='content-item-view-controls'></div>");
		viewControlsNode.append(this.renderViewToggle());
		viewControlsNode.append("<div class='content-item-header-extras'></div>");
		viewControlsNode.append(this.renderContentDisplayOptionsPanel(this.section, this.contentItem));
		$(headerNode).append(viewControlsNode);
		this.renderHeaderControls();
		
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
		let refAndContacts = "<div class='dataset-reference-dialog'>";
		refAndContacts += "<h4 class='sqs-label'>References</h4>";
		refAndContacts += referenceData;
		refAndContacts += "<h4 class='sqs-label'>Contacts</h4>";
		refAndContacts += contactData;
		refAndContacts += "</div>";
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
					case "sample-bar":
					case "depth-profile":
					case "multistack":
					case "ecocode":
					case "ecocodes-samples":
					case "mcr":
					case "coordinate-map":
						renderInstance = new SiteReportChart(this.siteReport, this.contentItem);
						renderInstance.render(anchorSelector);
						this.addRenderInstance(this.contentItem.name, renderInstance);
						break;
					case "dendrochart":
						renderInstance = new DendroChart(this.siteReport, this.contentItem);
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

	    closeContentDisplayOptionsPanel(node, dropdownNode) {
			$(dropdownNode).hide(100);
			$(".site-report-toolbar-btn", node).first().attr("aria-expanded", "false");
			$(document).off("mousedown" + this.displayOptionsNamespace);
			$(document).off("touchstart" + this.displayOptionsNamespace);
		}

	    toggleContentDisplayOptionsPanel() {
			let controlsId = "view-selector-"+this.contentItem.name;
			let node = $("#"+controlsId);
			let dropdownNode = $(".site-report-display-options-dropdown", node);

			if ($(dropdownNode).is(":visible")) {
				this.closeContentDisplayOptionsPanel(node, dropdownNode);
			}
			else {
				$(document).off("mousedown" + this.displayOptionsNamespace);
				$(document).off("touchstart" + this.displayOptionsNamespace);
				$(dropdownNode).show(100);
				$(".site-report-toolbar-btn", node).first().attr("aria-expanded", "true");

				$(document).on("mousedown" + this.displayOptionsNamespace + " touchstart" + this.displayOptionsNamespace, (e) => {
					if (!$(node).is(e.target) && $(node).has(e.target).length === 0) {
						this.closeContentDisplayOptionsPanel(node, dropdownNode);
					}
				});
			}
		}

	renderOptionSelectedCallback(selectedRenderOption) {
		//Update structure with new selection
		for(let key in this.contentItem.renderOptions) {
			this.contentItem.renderOptions[key].type == selectedRenderOption ? this.contentItem.renderOptions[key].selected = true : this.contentItem.renderOptions[key].selected = false;
		}

		this.renderDataVisualization();
		this.renderHeaderControls();
	}

	/*
	* Function: selectRenderOption
	* Shows the content item as another of its render options, such as the spreadsheet, as if it was picked in its header.
	*/
	selectRenderOption(renderOptionType) {
		this.renderOptionSelectedCallback(renderOptionType);
	}

	/*
	* Function: renderViewToggle
	*
	* The buttons in the header for switching between the content item's render options, such as its spreadsheet and its
	* chart. Nothing when it only has one.
	*/
	renderViewToggle() {
		let renderOptions = this.contentItem.renderOptions.filter(ro => ro);
		if(renderOptions.length < 2) {
			return null;
		}

		let toggleNode = $("<div class='sqs-segmented content-item-view-toggle' role='group' aria-label='Show as'></div>");
		renderOptions.forEach(ro => {
			let button = $("<button type='button'></button>").text(ro.name);
			button.attr("data-render-option", ro.type);
			button.on("click", () => {
				if(!ro.selected) {
					this.renderOptionSelectedCallback(ro.type);
				}
			});
			toggleNode.append(button);
		});
		return toggleNode;
	}

	/*
	* Function: renderHeaderControls
	*
	* Brings the header up to date with the selected render option: which view is picked, the controls of the option
	* that sit in the header, such as how to sort, and the display options button, if the option has other controls.
	*/
	renderHeaderControls() {
		let selectedRo = this.getSelectedRenderOption(this.contentItem);
		let headerNode = this.headerNode;

		$(".content-item-view-toggle button", headerNode).each((i, button) => {
			$(button).attr("aria-pressed", $(button).attr("data-render-option") == selectedRo.type ? "true" : "false");
		});

		let headerExtrasCount = this.renderRenderOptionExtras($(".content-item-header-extras", headerNode), "header");

		let displayOptionsNode = $(".site-report-display-options-container", headerNode);
		let panelExtrasCount = this.renderRenderOptionExtras($(".site-report-render-options-container-extras", displayOptionsNode), "panel");
		if(panelExtrasCount == 0) {
			this.closeContentDisplayOptionsPanel(displayOptionsNode, $(".site-report-display-options-dropdown", displayOptionsNode));
		}
		displayOptionsNode.toggle(panelExtrasCount > 0);

		let hasViewToggle = $(".content-item-view-toggle", headerNode).length > 0;
		$(".content-item-view-controls", headerNode).toggle(hasViewToggle || headerExtrasCount > 0 || panelExtrasCount > 0);
	}

	/*
	* Function: renderContentDisplayOptionsPanel
	* 
	* The display options button, and the panel it opens, with the controls of the selected render option which aren't
	* in the header. It is hidden when there are none.
	*
	 */
	renderContentDisplayOptionsPanel(section, contentItem) {
		let controlsId = "view-selector-"+contentItem.name;
		var node = $("#site-report-render-options-template")[0].cloneNode(true);
		$(node).attr("id", controlsId);
		$(node).addClass("site-report-display-options-container");
		$(".site-report-display-options-dropdown", node).hide();

		$(".site-report-toolbar-btn", node).on("click", () => {
			this.toggleContentDisplayOptionsPanel(contentItem);
		});

		return node;
	}

	/*
	* Function: renderRenderOptionExtras
	* 
	* The 'extras' here refers to any extra options the currently selected render option might have - such as what values to show for each axis in a graph.
	* Those with a placement of "header" go in the header, the others in the display options panel.
	*
	* Parameters:
	* containerNode - Where to put the controls.
	* placement - Which of the controls to put there, "header" or "panel".
	*
	* Returns:
	* The number of controls.
	 */
	renderRenderOptionExtras(containerNode, placement) {
		let selectedRo = this.getSelectedRenderOption(this.contentItem);
		let controlTypes = ["select", "multiselect", "text"];

		let html = "";
		let count = 0;
		for(let key in selectedRo.options) {
			let option = selectedRo.options[key];
			let optionPlacement = option.placement == "header" ? "header" : "panel";
			if(option.enabled !== false && option.showControls !== false && controlTypes.includes(option.type) && optionPlacement == placement) {
				count++;
				let ariaLabel = String(option.title).replace(/'/g, "&#39;");
				html += "<label class='site-report-view-selector-label' for=''>"+option.title+(placement == "panel" ? ":" : "")+"</label>";
                if(option.type == "select") {
                    html += "<select renderOptionExtraKey='"+key+"' aria-label='"+ariaLabel+"' class='site-report-view-selector-control site-report-render-mode-selector sqs'>";
                    for(let k2 in option.options) {
                        let selectedHtml = option.options[k2].selected ? "selected" : "";
						let optionTitle = option.options[k2].title;
                        html += "<option value='"+k2+"' "+selectedHtml+">"+optionTitle+"</option>";
                    }
                    html += "</select>";
                }
                if(option.type == "multiselect") {
                    let size = Math.min(option.options.length, 6);
                    html += "<select multiple size='"+size+"' renderOptionExtraKey='"+key+"' aria-label='"+ariaLabel+"' class='site-report-view-selector-control site-report-render-mode-selector sqs'>";
                    for(let k2 in option.options) {
                        let selectedHtml = option.options[k2].selected ? "selected" : "";
                        let optionTitle = option.options[k2].title;
                        html += "<option value='"+k2+"' "+selectedHtml+">"+optionTitle+"</option>";
                    }
                    html += "</select>";
                }
                if(option.type == "text") {
                    html += "<input type='text' renderOptionExtraKey='"+key+"' aria-label='"+ariaLabel+"' class='site-report-view-selector-control site-report-render-mode-selector sqs' />";
                }

			}
		}

		$(containerNode).html(html);

		$(".site-report-view-selector-control", containerNode).on("change", (evt) => {

			let renderOptionExtraKey = $(evt.currentTarget).attr("renderOptionExtraKey");
			let extraOption = selectedRo.options[renderOptionExtraKey];

            for(let key in extraOption.options) {
                extraOption.options[key].selected = false;
            }

			if(extraOption.type == "multiselect") {
				let selectedValues = $(evt.currentTarget).val() || [];
				selectedValues.forEach(v => {
					extraOption.options[parseInt(v)].selected = true;
				});
			} else {
				extraOption.options[parseInt($(evt.currentTarget).val())].selected = true;
			}

		    this.renderDataVisualization(extraOption);
		});

		return count;
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
			
			if(selectedRoType != "table" && selectedRoType != "dendrochart") {
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
