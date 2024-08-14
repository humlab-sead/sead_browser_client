/* 
Class: Facet
This is the generic Facet class which the type specific facets (Discrete, Range, Map) inherits. So all functionality/attributes which is common for all types of facets goes here.
*/
class Facet {
	/*
	* Function: constructor
	* 
	* Constructor.
	*
	* Parameters:
	* id - The id of the facet.
	* template - The template object which contains various information needed to instantiate the facet, such as type & title.
	*/
	constructor(sqs, id = null, template = {}) {
		this.id = id;
		this.sqs = sqs;
		this.name = template.name;
		this.type = template.type;
		this.title = template.title;
		this.color = template.color;
		this.description = template.description;
		this.rendered = false;
		this.isBeingDragged = false;
		this.data = [];
		this.isDataLoaded = false;
		this.minimized = false;
		this.selections = [];
		this.inactiveSelections = [];
		this.requestId = 0;
		this.deleted = false;
		this.locked = false;
		this.enabled = true; //If this facet is not applicable within the current domain, this will be false.
		this.dataFetchingEnabled = true;

		var facetDomObj = $("#facet-template")[0].cloneNode(true);
		this.domObj = facetDomObj;
		$(facetDomObj).attr("id", "facet-"+this.id);
		$(facetDomObj).attr("facet-id", this.id);
		$(facetDomObj).find(".facet-title").html(this.title);
		
		this.sqs.tooltipManager.registerTooltip($(".facet-title", facetDomObj), this.description, { drawSymbol: true, anchorPoint: "symbol" });

		$(facetDomObj).find(".facet-header-divider").css("background-color", this.color);
		$("#facet-section").append(facetDomObj);
		
		//Config.facetBodyHeight = "20%";

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
			}
		});

		$(".facet-sql-btn", this.getDomRef()).on("click", () => {
			const formattedSQL = this.sql.replace(/\n/g, "<br/>");
			this.sqs.dialogManager.showPopOver("Filter SQL", formattedSQL);
		});
	}

	showSqlButton(show = true) {
		if(show) {
			$(".facet-sql-btn", this.getDomRef()).show();
		}
		else {
			$(".facet-sql-btn", this.getDomRef()).hide();
		}
	}

	setHeight(height = Config.facetBodyHeight) {
		console.log("setHeight", this.domObj, height)
		$(".facet-body", this.domObj).css("height", height+"px");
		this.bodyHeight = $(".facet-body", this.domObj).css("height");
		/*
		let slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
		this.sqs.facetManager.updateSlotSize(slotId);
		this.sqs.facetManager.updateAllFacetPositions();
		//this.sqs.facetManager.updateShowOnlySelectionsControl();
		*/
	}

	disable() {
		this.enabled = false;
		return;
		this.unRenderData();
		$(".facet-body > .facet-disabled-msg", this.domObj).css("display", "flex");
		$(".facet-size-btn", this.domObj).hide();
		/*
		let slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
		this.sqs.facetManager.updateSlotSize(slotId);
		this.sqs.facetManager.updateAllFacetPositions();
		//this.sqs.facetManager.updateShowOnlySelectionsControl();
		*/
	}

	enable() {
		this.enabled = true;
		return;
		this.renderData();
		$(".facet-body > .facet-disabled-msg", this.domObj).css("display", "none");
		$(".facet-size-btn", this.domObj).show();
	}

	/*
	* Function: showLoadingIndicator
	* 
	* Displays (or not) the XHR loading indicator for this facet.
	*/
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

	/*
	* Function: maximize
	* 
	* Un-mimizes the facet.
	*/
	maximize() {
		$("#facet-"+this.id).find(".facet-size-btn").switchClass("fa-check-square", "fa-check");
		$("#facet-"+this.id+" .facet-size-btn")
			.switchClass("facet-maximize-btn", "facet-minimize-btn")
			.removeClass("facet-control-active");
		
		$("#facet-"+this.id).css("height", this.defaultHeight);
		$("#facet-"+this.id).find(".facet-body").css("height", this.bodyHeight);
		$(this.domObj).find(".facet-body").fadeIn(500);
		this.minimized = false;

		var slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
		this.sqs.facetManager.updateSlotSize(slotId);
		this.sqs.facetManager.updateAllFacetPositions();
		this.sqs.facetManager.updateShowOnlySelectionsControl();
	}

	/*
	* Function: minimize
	* 
	* Collapses the facet to reduce the vertical space it occupies. In a discrete facet the selections will still be shown.
	*/
	minimize(changeFacetSize = false) {
		$("#facet-"+this.id+" .facet-size-btn")
			.switchClass("facet-minimize-btn", "facet-maximize-btn")
			.addClass("facet-control-active");

		/*
		if(changeFacetSize) {
			$("#facet-"+this.id+" > .facet-body").css("height", "0px");
			var headerHeight = $(".facet-header", this.domObj).height();
			headerHeight += 12;
			var selectionsHeight = 0;
			var facetHeight = headerHeight + selectionsHeight;

			$(this.domObj).find(".facet-body").show();
			
			if(facetHeight > Config.facetBodyHeight+headerHeight-7) { //FIXME: kinda arbitrary, no?
				facetHeight = Config.facetBodyHeight+headerHeight-7; //FIXME: kinda arbitrary, no?
			}
			$(this.domObj).css("height", facetHeight+"px");
		}
		*/
		
		this.minimized = true;
		var slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
		this.sqs.facetManager.updateSlotSize(slotId);
		this.sqs.facetManager.updateAllFacetPositions();
		this.sqs.facetManager.updateShowOnlySelectionsControl();
	}

	/*
	* Function: setSelections
	* 
	*/
	setSelections(selections, append = true) {
		
	}

	/*
	* Function: renderData
	* Virtual. Every subclass needs to implement this.
	*/
	renderData() {
		console.warn("WARN: renderData in Facet parent class called. This is probably not what you wanted.");
	}

	/*
	* Function: unRenderData
	* Virtual. Every subclass needs to implement this.
	*/
	unRenderData() {
		console.warn("WARN: unRenderData in Facet parent class called. This is probably not what you wanted.");
	}

	/*
	* Function: renderNoDataMsg
	* Simple routine for rendering a message if the facet contains no data (based on current above selection).
	*/
	renderNoDataMsg(on = true) {
		if(on) {
			//$(this.getDomRef()).find(".facet-no-data-msg").show();
			const noDataBoxFrag = document.getElementById("no-data-box");
			const noDataBox = document.importNode(noDataBoxFrag.content, true);
			let containerNode = $(this.getDomRef()).find(".facet-no-data-msg");
			$(containerNode).html("");
			$(containerNode).append(noDataBox);
			$(".list-container", this.getDomRef()).hide();
			$(this.getDomRef()).find(".facet-no-data-msg").show();
			$(this.getDomRef()).find(".facet-body").css("overflow", "hidden");
		}
		else {
			//$(this.getDomRef()).find(".facet-no-data-msg").hide();
			$(this.getDomRef()).find(".facet-no-data-msg").hide();
			$(this.getDomRef()).find(".facet-no-data-msg").html("");
			$(this.getDomRef()).find(".facet-body").css("overflow", "auto");
		}
	}

	/*
	* Function: destroy
	* Destroys/removes and cleans up after this facet.
	*/
	destroy() {
		this.deleted = true;
		this.broadcastDeletion();
		$(this.getDomRef()).remove();
	}
	
	/*
	* Function: fetchData
	* Fetches/loads data from the server to this facet.
	*
	* Parameters:
	* render - Whether to render the data or not after the fetch is complete. Default: true.
	*/
	fetchData(render = true) {
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
			contentType: 'application/json; charset=utf-8',
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

	/*
	* Function: importData
	* 
	* Imports the data package fetched from the server by converting it to the internal data structure format and storing it in the instance.
	* 
	* Parameters:
	* data - The data package from the server.
	*/
	importData(data) {
		this.sql = data.SqlQuery;
		this.isDataLoaded = true;
	}

	/*
	* Function: broadcastSelection
	* 
	* This should be called whenever something is selected or deselected in a facet. Broadcasts an event letting other components respond to this action.
	*/
	broadcastSelection(filter = null) {
		$.event.trigger("seadFacetSelection", {
			facet: this,
			filter: filter
		});
	}
	
	/*
	* Function: broadcastSelection
	* 
	* This should be called whenever something is selected or deselected in a facet. Broadcasts an event letting other components respond to this action.
	*/
	broadcastDeletion() {
		$.event.trigger("seadFacetDeletion", {
			facet: this
		});
	}

	/*
	* Function: clearData
	* Clears all data in this facet.
	*/
	clearData() {
		this.data = [];
	}

	/*
	* Function: getDomRef
	* Gets the DOM object this facet is associated with.
	*
	* Returns:
	* The DOM object.
	*/
	getDomRef() {
		return $("[facet-id="+this.id+"]");
	}

	/*
	* Function: updatePosition
	* 
	* Visually moves the facet to whatever slot it's currently assigned to based on the position of that slot.
	* 
	*/
	updatePosition() {

		if(this.isBeingDragged) {
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

	/*
	* Function: hasSelection
	* Tells wheter this facet has a selection or not, which is not always completely obvious just by looking at the contents of this.selections since e.g. range facets always have the upper/lower values if nothing else in this array.
	* This mostly meant as a virtual function, facet types should probably implement their own version of this in most cases.
	* 
	* Returns:
	* True or false.
	*/
	hasSelection() {
		if(this.selections.length > 0) {
			return true;
		}

		let multistageSelectionsExists = false;
		if(typeof this.filters != "undefined") {
			this.filters.forEach(filter => {
				if(filter.selections.length > 0) {
					multistageSelectionsExists = true;
				}
			});
		}

		return multistageSelectionsExists;
	}

	lock(locked = true) {
		this.locked = locked;
		if(locked) {
			$(this.domObj).addClass("facet-locked");
			$(".facet-header .facet-domain-indicator", this.domObj).remove();
			$(".facet-header", this.domObj).append("<h3 class='facet-domain-indicator'>PORTAL</h3>");
			$(".facet-domain-indicator").css("color", this.sqs.domainManager.getActiveDomain().color);
			$(this.getDomRef()).draggable({
				disabled: true
			});
		}
		else {
			$(this.domObj).removeClass("facet-locked");
			$(this.getDomRef()).draggable({
				disabled: false
			});
		}
	}
}

export { Facet as default }
