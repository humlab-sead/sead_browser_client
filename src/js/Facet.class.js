import Config from '../config/config.js';
import _ from 'underscore';
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
	constructor(hqs, id = null, template = {}) {
		this.id = id;
		this.hqs = hqs;
		this.name = template.name;
		this.type = template.type;
		this.title = template.title;
		this.color = template.color;
		this.rendered = false;
		this.isBeingDragged = false;
		this.data = [];
		this.isDataLoaded = false;
		this.minimized = false;
		this.selections = [];
		this.inactiveSelections = [];
		this.requestId = 0;
		this.deleted = false;

		var facetDomObj = $("#facet-template")[0].cloneNode(true);
		$(facetDomObj).attr("id", "facet-"+this.id);
		$(facetDomObj).attr("facet-id", this.id);
		$(facetDomObj).find(".facet-title").html(this.title);
		$(facetDomObj).find(".facet-header-divider").css("background-color", this.color);
		$(facetDomObj).find(".facet-body").css("height", Config.facetBodyHeight+"px");
		$("#facet-section").append(facetDomObj);
		$("#facet-"+this.id+" > .facet-body").css("overflow", "auto");

		this.defaultHeight = $(facetDomObj).css("height");
		this.bodyHeight = $(".facet-body", facetDomObj).css("height");
		this.domObj = facetDomObj;

		$(facetDomObj).find(".facet-delete-btn").bind("click", () => {
			this.destroy();
		});

		$("#section-left").on("resize", () => {
			clearTimeout(this.resizeTicker);
			this.resizeTicker = setTimeout(() => {
				this.adaptToNewWidth($("#section-left").width());
			}, 10);
		});

		$(facetDomObj).find(".facet-size-btn").bind("click", () => {
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
				let facet = this.hqs.facetManager.getFacetById($(event.target).attr("facet-id"));
				facet.isBeingDragged = true;
				$(facet.getDomRef()).css("box-shadow", "0px 0px 2px 4px rgba(0,0,0,0.1)");
			},
			stop: (event, ui) => {
				let facet = this.hqs.facetManager.getFacetById($(event.target).attr("facet-id"));
				facet.isBeingDragged = false;
				facet.updatePosition();
				$(facet.getDomRef()).css("box-shadow", "0px 0px 0px 0px rgba(0,0,0,0.2)");
				$(facet.getDomRef()).css("width", "100%"); //reset width to what we want since jQuery will change this to an absolute value after dragstop
			}
		});
	}


	/*
	* Function: showLoadingIndicator
	* 
	* Displays (or not) the XHR loading indicator for this facet.
	*/
	showLoadingIndicator(on = true, error = false) {
		if(on) {
			$(this.domObj).find(".facet-loading-indicator").fadeIn(100);
		}
		else {
			if(error) {
				//$(this.domObj).find(".facet-loading-indicator").toggle("explode");
				$(this.domObj).find(".facet-loading-indicator").addClass(".facet-loading-indicator-error");
			}
			else {
				$(this.domObj).find(".facet-loading-indicator").fadeOut(100);
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

		var slotId = this.hqs.facetManager.getSlotIdByFacetId(this.id);
		this.hqs.facetManager.updateSlotSize(slotId);
		this.hqs.facetManager.updateAllFacetPositions();
		this.hqs.facetManager.updateShowOnlySelectionsControl();
	}

	/*
	* Function: minimize
	* 
	* Collapses the facet to reduce the vertical space it occupies. In a discrete facet the selections will still be shown.
	*/
	minimize() {
		$("#facet-"+this.id+" .facet-size-btn")
			.switchClass("facet-minimize-btn", "facet-maximize-btn")
			.addClass("facet-control-active");
		$("#facet-"+this.id+" > .facet-body").css("height", "0px");
		
		$(this.domObj).find(".facet-body").show();
		var headerHeight = $(".facet-header", this.domObj).height();
		headerHeight += 12;
		
		var selectionsHeight = 0;
		var facetHeight = headerHeight + selectionsHeight;
		if(facetHeight > Config.facetBodyHeight+headerHeight-7) { //FIXME: kinda arbitrary, no?
			facetHeight = Config.facetBodyHeight+headerHeight-7; //FIXME: kinda arbitrary, no?
		}
		$(this.domObj).css("height", facetHeight+"px");
		
		this.minimized = true;
		var slotId = this.hqs.facetManager.getSlotIdByFacetId(this.id);
		this.hqs.facetManager.updateSlotSize(slotId);
		this.hqs.facetManager.updateAllFacetPositions();
		this.hqs.facetManager.updateShowOnlySelectionsControl();
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
		console.log("WARN: renderData in Facet parent class called. This is probably not what you wanted.");
	}

	/*
	* Function: renderNoDataMsg
	* Simple routine for rendering a message if the facet contains no data (based on current above selection).
	*/
	renderNoDataMsg(on = true) {
		if(on) {
			$(this.getDomRef()).find(".facet-no-data-msg").show();
		}
		else {
			$(this.getDomRef()).find(".facet-no-data-msg").hide();
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

		this.showLoadingIndicator(true);
		
		var requestType = "populate";
		/*FIXME: This is undefined, should be facet that triggered the request, not necessarily this facet (could be one above in the chain).
		* Except for when a facet was deleted - this should not count as the trigger in that instance. Yeah it's confusing and I hate it.
		*/
		var triggerCode = this.hqs.facetManager.getLastTriggeringFacet().name;
		
		var fs = this.hqs.facetManager.getFacetState();
		var fc = this.hqs.facetManager.facetStateToDEF(fs, {
			requestType: requestType,
			targetCode: this.name,
			triggerCode: triggerCode
		});
		
		var reqData = {
			requestId: ++this.requestId,
			requestType: requestType,
			targetCode: this.name,
			triggerCode: triggerCode,
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
					}
					this.showLoadingIndicator(false);
				}
				else {
					console.log("WARN: Not importing facet data since this facet is either deleted or "+respData.FacetsConfig.RequestId+" != "+this.requestId);
				}

				for(var key in this.hqs.facetManager.pendingDataFetchQueue) {
					if(this === this.hqs.facetManager.pendingDataFetchQueue[key]) {
						this.hqs.facetManager.pendingDataFetchQueue.splice(key, 1);
					}
				}

				if(this.hqs.facetManager.pendingDataFetchQueue.length == 0) {
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
		this.isDataLoaded = true;
	}

	/*
	* Function: broadcastSelection
	* 
	* This should be called whenever something is selected or deselected in a facet. Broadcasts an event letting other components respond to this action.
	*/
	broadcastSelection() {
		$.event.trigger("seadFacetSelection", {
			facet: this
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
		let slotId = this.hqs.facetManager.getSlotIdByFacetId(this.id);
		let slot = this.hqs.facetManager.getSlotById(slotId);
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
		return false;
	}
}

export { Facet as default }
