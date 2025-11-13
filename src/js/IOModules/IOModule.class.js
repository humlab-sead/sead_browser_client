
export default class IOModule {
    constructor(sqs, id, template) {
        this.sqs = sqs; //reference to the SQS object
        this.resultManager = sqs.resultManager;
        this.id = id; //internal/machine name of the module
        this.name = template.name;
		this.type = template.type;
		this.title = template.title; //pretty name of the module
		this.color = template.color;
		this.description = template.description;
        this.requestId = 0;
        this.renderIntoNode = null; //target DOM element to render into
        this.rendered = false; //boolean to check if the module has been rendered
        this.isBeingDragged = false;

        this.data = []; //containing the data to be rendered
        this.selections = [];
        this.isDataLoaded = false;
        this.minimized = false;
        this.deleted = false;
        this.enabled = true;
        this.dataFetchingEnabled = true;

        this.isPartOfTheFacetChain = true; //boolean to check if the module is part of the chain of facets
        this.verboseLogging = false;

        this.initUi();

		//listen to layoutResize events
		this.sqs.sqsEventListen("layoutResize", () => {
			this.resizeCallback();
		}, this);
        this.sqs.sqsEventListen("facetResize", () => {
            this.resizeCallback();
        }, this);
    }

	resizeCallback() {
	}

    initUi() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} initialized.`);
        }
		let template = document.getElementById("facet-template");
        const facetDomObj = template.content.firstElementChild.cloneNode(true);
		this.domObj = facetDomObj;
		$(facetDomObj).attr("id", "facet-"+this.id);
		$(facetDomObj).attr("facet-id", this.id);
		$(facetDomObj).find(".facet-title").html(this.title);
		
		this.sqs.tooltipManager.registerTooltip($(".facet-title", facetDomObj), this.description, { drawSymbol: true, anchorPoint: "symbol" });

		$(facetDomObj).find(".facet-header-divider").css("background-color", this.color);
		$("#facet-section").append(facetDomObj);

		this.setHeight(Config.facetBodyHeight);
		this.defaultHeight = $(facetDomObj).css("height");
		

		$(facetDomObj).find(".facet-delete-btn").on("click", () => {
			this.destroy();
		});

		$("#section-left").on("resize", () => {
			clearTimeout(this.resizeTicker);
			this.resizeTicker = setTimeout(() => {
				this.adaptToNewWidth($(".section-left").width());
			}, 10);
		});

		$(".facet-title", facetDomObj).on("dblclick", () => {
			if(this.minimized) {
				this.maximize();
			}
			else {
				this.minimize();
			}
		})

		$(facetDomObj).find(".facet-size-btn").on("click", () => {
			if(this.minimized) {
				this.maximize();
			}
			else {
				this.minimize();
			}
		});

		$(this.getDomRef()).draggable({
			containment: "#facet-section",
			stack: ".facet",
			handle: ".facet-header",
			start: (event, ui) => {
				let facet = this.sqs.facetManager.getFacetById($(event.target).attr("facet-id"));
				facet.isBeingDragged = true;
				$(facet.getDomRef()).css("box-shadow", "0px 0px 2px 4px rgba(0,0,0,0.1)");
			},
			stop: (event, ui) => {
				let facet = this.sqs.facetManager.getFacetById($(event.target).attr("facet-id"));
				facet.isBeingDragged = false;
				facet.updatePosition();
				$(facet.getDomRef()).css("box-shadow", "0px 0px 0px 0px rgba(0,0,0,0.2)");
				$(facet.getDomRef()).css("width", "100%"); //reset width to what we want since jQuery will change this to an absolute value after dragstop
				$(facet.getDomRef()).css("z-index", "1");
			}
		});

		$(".facet-sql-btn", this.getDomRef()).on("click", () => {
			const formattedSQL = this.sql.replace(/\n/g, "<br/>");
			this.sqs.dialogManager.showPopOver("Filter SQL", formattedSQL);
		});

		// Initialize resize functionality
		this.initResizeHandle();
	}

	initResizeHandle() {
		const resizeHandle = $(this.getDomRef()).find(".facet-resize-handle");
		let startY = 0;
		let startHeight = 0;
		let isResizing = false;
		const minHeight = 100; // Minimum facet height in pixels

		resizeHandle.on("mousedown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			
			isResizing = true;
			startY = e.clientY;
			startHeight = $(this.getDomRef()).height();
			
			// Add class to prevent text selection during resize
			$(this.getDomRef()).addClass("facet-resizing");
			$("body").addClass("facet-resizing");

			// Attach mousemove and mouseup to document for better tracking
			$(document).on("mousemove.facetResize", (e) => {
				if (!isResizing) return;

				const deltaY = e.clientY - startY;
				let newHeight = startHeight + deltaY;

				// Enforce minimum height
				if (newHeight < minHeight) {
					newHeight = minHeight;
				}

				// Update facet height
				$(this.getDomRef()).css("height", newHeight + "px");
				
				// Update facet body height (subtract header height)
				const headerHeight = $(".facet-header", this.getDomRef()).outerHeight();
				const newBodyHeight = newHeight - headerHeight;
				$(".facet-body", this.getDomRef()).css("height", newBodyHeight + "px");
				
				// Update the slot size to match
				if (this.isPartOfTheFacetChain) {
					let slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
					this.sqs.facetManager.updateSlotSize(slotId);
					
					// Update positions of all facets below this one
					this.sqs.facetManager.updateAllFacetPositions();
				}
				
				// If this has a recalculate method (e.g., for discrete facets), call it
				if (typeof this.recalculateViewportCapacity === 'function') {
					this.recalculateViewportCapacity();
					if (this.isDataLoaded && !this.minimized) {
						this.updateRenderData();
					}
				}
				
				// Dispatch resize event for other parts of the system
				this.sqs.sqsEventDispatch("facetResize", {
					facet: this
				});
			});

			$(document).on("mouseup.facetResize", () => {
				if (isResizing) {
					isResizing = false;
					$(this.getDomRef()).removeClass("facet-resizing");
					$("body").removeClass("facet-resizing");
					
					// Clean up event handlers
					$(document).off("mousemove.facetResize");
					$(document).off("mouseup.facetResize");
					
					// Store the new height as the default height
					this.defaultHeight = $(this.getDomRef()).css("height");
					this.bodyHeight = $(".facet-body", this.getDomRef()).css("height");
				}
			});
		});
	}

    fetchFacetChainData(render = true) {
		if(!this.dataFetchingEnabled) {
			console.warn("WARN: fetchData called on a facet where dataFetchingEnabled is false. Ignoring.");
			return;
		}
		this.showLoadingIndicator(true);
		
		var requestType = "populate";
		/*FIXME: This is undefined, should be facet that triggered the request, not necessarily this facet (could be one above in the chain).
		* Except for when a facet was deleted - this should not count as the trigger in that instance. Yeah it's confusing and I hate it.
		*/
		var triggerCode = this.sqs.facetManager.getLastTriggeringFacet().name;

		let targetCode = this.name;
		
		if(typeof this.filters != "undefined") {
			//this is a multistage facet
			targetCode = this.getCurrentFilter().name;
		}
		
		var fs = this.sqs.facetManager.getFacetState();
		var fc = this.sqs.facetManager.facetStateToDEF(fs, {
			requestType: requestType,
			targetCode: targetCode,
			triggerCode: triggerCode
		});

		let domainCode = this.sqs.domainManager.getActiveDomain().name;
		domainCode = domainCode == "general" ? "" : domainCode;

		var reqData = {
			requestId: ++this.requestId,
			requestType: requestType,
			targetCode: targetCode,
			triggerCode: triggerCode,
			domainCode: domainCode,
			facetConfigs: fc
		};

		return $.ajax(config.serverAddress+"/api/facets/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: (respData, textStatus, jqXHR) => {
				if(this.deleted == false && respData.FacetsConfig.RequestId == this.requestId) { //Only load this data if it matches the last request id dispatched. Otherwise it's old data.
					this.importData(respData);
					if(render && this.minimized == false) {
						this.renderData();
						//dispatch event that this facet has been rendered
						this.sqs.sqsEventDispatch("facetDataRendered", {
							facet: this
						});
					}
					this.showLoadingIndicator(false);
				}
				else {
					console.warn("WARN: Not importing facet data since this facet is either deleted or "+respData.FacetsConfig.RequestId+" != "+this.requestId);
				}

				for(var key in this.sqs.facetManager.pendingDataFetchQueue) {
					if(this === this.sqs.facetManager.pendingDataFetchQueue[key]) {
						this.sqs.facetManager.pendingDataFetchQueue.splice(key, 1);
					}
				}

				if(this.sqs.facetManager.pendingDataFetchQueue.length == 0) {
					$.event.trigger("seadFacetPendingDataFetchQueueEmpty", {
						facet: this
					});
				}
				
			},
			error: (respData, textStatus, jqXHR) => {
				this.showLoadingIndicator(false, true);
			}

		});
	}

    importData(data) {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} importing data.`);
        }

        this.sql = data.SqlQuery;
        this.isDataLoaded = true;
    }

    adaptToNewWidth(newWidth) {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} adapted to new width: ${newWidth}`);
        }
	}

    setHeight(height = Config.facetBodyHeight) {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} set height: ${height}`);
        }
		$(".facet-body", this.domObj).css("height", height+"px");
		this.bodyHeight = $(".facet-body", this.domObj).css("height");
	}

    async fetchData(render = true) {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} fetching data.`);
        }

        if(this.isPartOfTheFacetChain) {
            this.fetchFacetChainData(render);
        }
    }

	getSelections() {
		if(this.verboseLogging) {
			console.log(`IOModule ${this.name} getting selections (${this.selections}).`);
		}
		return this.selections;
	}

	setSelections(selections, triggerUpdate = true) {
		if(this.verboseLogging) {
			console.log(`IOModule ${this.name} setting selections (${selections}).`);
		}
		this.selections = selections;
		if(selectionsUpdated && triggerUpdate) {
			this.sqs.facetManager.queueFacetDataFetch(this);
			this.broadcastSelection();
		}
	}

    renderData() {
        //render yourself into your targeted container
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} rendering data.`);
        }
    }

    update() {
        //data update without triggering a full re-render
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} updating.`);
        }
    }

    unrender() {
        //remove yourself from the DOM and clean up everything, unregister events, etc.
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} unrendering.`);
        }
        this.destroy();
    }

    destroy() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} destroying.`);
        }
		//stop listening to layout resize events
        this.sqs.sqsEventUnlisten("layoutResize", this);
		this.sqs.sqsEventUnlisten("facetResize", this);

		this.deleted = true;
		this.broadcastDeletion();
		$(this.getDomRef()).remove();

        console.log(`IOModule ${this.name} destroyed.`);
	}

    /*
	* Function: broadcastSelection
	* 
	* This should be called whenever something is selected or deselected in a facet. Broadcasts an event letting other components respond to this action.
	*/
	broadcastDeletion() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} broadcasting deletion.`);
        }
		$.event.trigger("seadFacetDeletion", {
			facet: this
		});
	}

    minimize() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} minimizing.`);
        }
        this.minimized = true;
        
        if (this.isPartOfTheFacetChain) {
            var slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
            this.sqs.facetManager.updateSlotSize(slotId);
            this.sqs.facetManager.updateAllFacetPositions();
            this.sqs.facetManager.updateShowOnlySelectionsControl();
            
            // If this has a recalculate method (e.g., for discrete facets), call it
            if (typeof this.recalculateViewportCapacity === 'function') {
                this.recalculateViewportCapacity();
            }
        }
        
        console.log(`Facet ${this.name} minimized.`);
    }

    maximize() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} maximizing.`);
        }
        this.minimized = false;
        
        if (this.isPartOfTheFacetChain) {
            var slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
            this.sqs.facetManager.updateSlotSize(slotId);
            this.sqs.facetManager.updateAllFacetPositions();
            this.sqs.facetManager.updateShowOnlySelectionsControl();
            
            // If this has a recalculate method (e.g., for discrete facets), call it
            if (typeof this.recalculateViewportCapacity === 'function') {
                this.recalculateViewportCapacity();
                if (this.isDataLoaded) {
                    this.updateRenderData();
                }
            }
        }
        
        console.log(`Facet ${this.name} maximized.`);
    }
    getDomRef() {
        return $(`[facet-id=${this.id}]`);
    }

    getSelections() {
        return this.selections;
    }

    updatePosition() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} updating position.`);
        }
		if(this.isBeingDragged || this.virtual || this.isPartOfTheFacetChain == false) {
			return;
		}

		//stop any previously running animation
		this.getDomRef().stop();
		let slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
		let slot = this.sqs.facetManager.getSlotById(slotId);
		let slotPos = slot.getDomRef().position();
		
		//animate facet to position of its slot
		this.getDomRef().animate({
			top: slotPos.top+"px",
			left: slotPos.left+"px"
		}, 0); //Because screw animations that's why

	}

    hasSelection() {
		if(this.selections.length > 0) {
			return true;
		}
    }

    showLoadingIndicator(on = true, error = false) {
		if(on) {
			$(this.domObj).find(".small-loading-indicator").fadeIn(100);
		}
		else {
			if(error) {
				//$(this.domObj).find(".small-loading-indicator").toggle("explode");
				$(this.domObj).find(".small-loading-indicator").addClass(".small-loading-indicator-error");
			}
			else {
				$(this.domObj).find(".small-loading-indicator").fadeOut(100);
			}
		}
	}

    broadcastSelection(filter = null) {
		this.sqs.sqsEventDispatch("seadFacetSelection", {
			facet: this,
			filter: filter
		});
	}
}