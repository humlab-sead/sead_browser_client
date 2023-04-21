//import Config from '../config/config.js'
import Facet from './Facet.class.js'
import _ from 'underscore';
import { nanoid } from 'nanoid';
/*
* Class: DiscreteFacet
* Subclass of Facet. Renders data in a list.
*/
class DiscreteFacet extends Facet {
	/*
	* Function: constructor
	*/
	constructor(sqs, id = null, template = {}) {
		super(sqs, id, template);
		this.contentWindow = [];
		this.rowHeight = Config.discreteFacetRowHeight;
		this.viewportItemCapacity = Math.floor(Config.facetBodyHeight / this.rowHeight);
		this.textSize = Config.discreteFacetTextSize;
		this.scrollPosition = 0;
		this.textFilterString = "";
		this.visibleData = [];
		this.checkMark = "<div class='fa fa-check facet-row-checkbox-mark' aria-hidden='true'></div>";
		this.specialFunctionLinks = [];
		
		if(this.name == "species") {
			this.specialFunctionLinks.push({
				id: nanoid(),
				icon: '<i class="fa fa-bug" aria-hidden="true"></i>',
				callback: (rowId) => {
					//open species dialog
					
					this.sqs.taxaModule.renderTaxon(rowId);
				}
			});
		}
		
		

		this.updateMaxRowTitleLength();
		this.renderSelections();

		$(this.domObj).find(".facet-body").on("scroll", () => {
			var data = null;
			if($(this.getDomRef()).find(".facet-text-search-input").val().length > 0) {
				data = this.visibleData;
			}
			
			this.updateRenderData(data);
		});

		this.registerTextSearchEvents();
		
		this.sqs.tooltipManager.registerTooltip($(".facet-size-btn", this.getDomRef()), "Show only selections");
		this.sqs.tooltipManager.registerTooltip($(".facet-text-search-btn", this.getDomRef()), "Filter list by text");
	}
	
	/*
	 * Function: registerTextSearchEvents
	 */
	registerTextSearchEvents() {
		$(this.getDomRef()).find(".facet-text-search-btn").on("click", () => {
			if($(this.getDomRef()).find(".facet-text-search-input").css("display") == "none") {
				$(this.getDomRef()).find(".facet-text-search-input").fadeIn(100).focus();
			}
			else {
				if($(this.getDomRef()).find(".facet-text-search-input").val().length > 0) {
					$(this.getDomRef()).find(".facet-text-search-input").val("");
					$(this.getDomRef()).find(".facet-text-search-btn").removeClass("facet-control-active");
					this.renderData(this.data);
				}
				$(this.getDomRef()).find(".facet-text-search-input").fadeOut(100);
			}
		});
		
		$(this.getDomRef()).find(".facet-text-search-btn").show();
		$(this.getDomRef()).find(".facet-text-search-input").on("keyup", (evt) =>  {
			this.textSearch(evt);
		});
	}
	
	textSearch(evt) {
		clearTimeout(this.textSearchTimeout);
		this.textSearchTimeout = setTimeout(() => {
			this.textFilterString = $(evt.target).val().toLowerCase();
			this.visibleData = [];
			if(this.textFilterString.length > 0) {
				for(var key in this.data) {
					if(this.data[key].title.toLowerCase().includes(this.textFilterString)) {
						this.visibleData.push(this.data[key]);
					}
				}
				$(this.getDomRef()).find(".facet-text-search-btn").addClass("facet-control-active");
			}
			else {
				this.visibleData = this.data;
				$(this.getDomRef()).find(".facet-text-search-btn").removeClass("facet-control-active");
			}
			this.renderData(this.visibleData);
		}, 250);
	}

	/*
	* Function: setSelections
	* 
	* Parameters:
	* selections
	* append
	*/
	setSelections(selections, append = true) {
		if(!_.isEqual(this.selections, selections)) {
			if(append) {
				this.selections = this.selections.concat(selections);
			}
			else {
				this.selections = selections;
			}
			
			this.broadcastSelection();
		}
	}
	
	/*
	* Function: addSelection
	 */
	addSelection(selection) {
		for(var key in this.selections) {
			if (this.selections[key] == selection) {
				return;
			}
		}
		this.selections.push(selection);
	}
	
	/*
	* Function: removeSelection
	*/
	removeSelection(selection) {
		for(var key in this.selections) {
			if (this.selections[key] == selection) {
				this.selections.splice(key, 1);
				return;
			}
		}
	}

	/*
	* Function: clearSelections
	*/
	clearSelections() {
		this.selections.forEach(selectionId => {
			$("[facet-row-id='"+selectionId+"']").removeClass("facet-row-selected");
		});
		
		this.selections = [];
	}
	
	/*
	* Function: getSelections
	*/
	getSelections() {
		return this.selections;
	}

	/*
	* Function: adaptToNewWidth
	* 
	* Adapts the facet after a resize (width) event
	* 
	* Parameters:
	* 
	* Returns:
	* 
	*/
	adaptToNewWidth(newWidth) {
		this.updateMaxRowTitleLength()
		this.updateRenderData();
	}

	/*
	* Function: updateMaxRowTitleLength
	* 
	* Figures out the max length of an item in the discrete facet list based on the current width of the facet
	* 
	* Parameters:
	* 
	* Returns:
	* 
	*/
	updateMaxRowTitleLength() {
		this.maxRowTitleLength = Math.floor($(this.domObj).innerWidth() / this.textSize);
	}

	/*
	* Function: updateRenderData
	*
	* FIXME: Dude... This is a mess with this data input variable... I mean, it works, but it's nto pretty. We need to figure this out in a proper way...
	*
	*/
	updateRenderData(data = null) {
		if(this.minimized) {
			//this.renderData(this.getSelectionsAsDataItems());
			this.renderMinimizedView(this.getSelectionsAsDataItems());
		}
		else {
			if(data == null) {
				data = this.data;
			}
			this.renderData(data);
		}
	}

	renderMinimizedView(renderData = []) {

		let displayTitle = "";
		if(renderData.length == 1) {
			displayTitle = renderData.length+ " selection";
		}
		else {
			displayTitle = renderData.length+ " selections";
		}

		this.renderData(renderData);

		$(".facet-row[facet-row-id='collapsed-facet-info-row']").on("click", () => {
			this.maximize();
		});
	}

	/*
	* Function: renderData
	* 
	* Renders/displays the given dataset in the UI. Implements a sliding window technique for performance reasons to be able to handle very large datasets.
	* Basically, only the rows in the viewport (the current part of the list the user actually sees) is being rendered, the parts above and below this window is filled with blank space to make the browser show a correct scrollbar.
	* 
	* Parameters:
	* renderData - The data structure to be rendered.
	* 
	* Returns:
	* 
	*/
	renderData(renderData = null) {
		if(renderData == null) {
			renderData = this.data;
		}
		
		if(renderData.length == 0) {
			this.renderNoDataMsg(true);
			return;
		}
		else {
			this.renderNoDataMsg(false);
		}

		var scrollPos = this.getScrollPos();
		var viewPortHeight = this.viewportItemCapacity*this.rowHeight;
		var topBlankSpaceHeight = scrollPos;
		var bottomBlankSpaceHeight = (renderData.length*this.rowHeight) - scrollPos - viewPortHeight;
		var topBlankSpace = $("<div class='discrete-facet-blank-space'></div>").css("height", topBlankSpaceHeight);
		var bottomBlankSpace = $("<div class='discrete-facet-blank-space'></div>").css("height", bottomBlankSpaceHeight);
		var out = "";
		var dataPos = Math.ceil(scrollPos / this.rowHeight); //Changed this from floor to ceil, which fixes the last item not being rendered
		
		let specialFunctionLinkIds = [];

		for(var i = 0; i < this.viewportItemCapacity; i++) {

			if(dataPos+i < renderData.length) {
				var dataElement = renderData[dataPos+i];
				var selectedClass = "";
				let checkMark = "";
				if(this.selections.indexOf(parseInt(dataElement.id)) != -1) {
					selectedClass = "facet-row-selected";
					checkMark = this.checkMark;
				}
				
				var displayTitle = dataElement.title;

				let specialFunctionLinks = "";
				this.specialFunctionLinks.forEach(funcLink => {
					let specialFunctionLinkId = nanoid();
					specialFunctionLinkIds.push({
						id: specialFunctionLinkId,
						rowId: dataElement.id,
					});

					let link = "<span id='"+specialFunctionLinkId+"' class='filter-special-function-link'>"+funcLink.icon+"</span>";
					specialFunctionLinks += link;
				});
				if(specialFunctionLinks.length > 0) {
					specialFunctionLinks += " ";
				}
				out += `
				<div class='facet-row `+selectedClass+`' facet-row-id='`+dataElement.id+`'>
					<div class='facet-row-checkbox-container'>
						<div class='facet-row-checkbox'>`+checkMark+`</div>
					</div>
					<div class='facet-row-text'>`+specialFunctionLinks+displayTitle+`</div>
					<div class='facet-row-count'>`+dataElement.count+`</div>
				</div>`;
				
				//Disabled this becuase I'm paranoid about performance - probably not good to register this many tooltips, there has to be a better way...
				//this.sqs.tooltipManager.registerTooltip("[facet-row-id='"+dataElement.id+"'] .facet-row-count", "Analysis entities");
			}
		}
		
		
		$(".list-container", this.getDomRef())
			.html("")
			.append(topBlankSpace)
			.append(out)
			.append(bottomBlankSpace)
			.show();
		
		
		$(this.getDomRef()).find(".facet-row").on("click", (evt) => {
			if(this.locked) {
				return;
			}
			this.toggleRowSelection(evt.currentTarget);
		});

		specialFunctionLinkIds.forEach(linkNodeIds => {
			$("#"+linkNodeIds.id).on("click", (evt) => {
				evt.stopPropagation();
				evt.stopImmediatePropagation();
				evt.preventDefault();
				let funcLink = this.specialFunctionLinks.find(funcLink => funcLink.icon == evt.currentTarget.innerHTML);
				funcLink.callback(linkNodeIds.rowId);
			});
		});

		$(this.getDomRef()).find(".facet-row-shortened-text").bind("hover", (obj) => {
			var target = obj.target;
			if($(obj.target).hasClass("facet-row-text")) {
				target = $(obj.target).parent();
			}
			this.toggleRowSelection(target);
		});
	}

	renderNoDataMsg(on = true) {
		super.renderNoDataMsg(on);
		if(on) {
			$(this.getDomRef()).find(".list-container").hide();
		}
		else {
			$(this.getDomRef()).find(".list-container").show();
		}
	}


	/*
	* Function: renderSelections
	* 
	* Highlights the selected rows/values in the UI.
	* 
	*/
	renderSelections() {
		$(".facet-row", this.domObj).removeClass("facet-row-selected");

		for(var sk in this.selections) {
			for(var dk in this.data) {
				if(this.data[dk].id == this.selections[sk]) {
					$(this.domObj).find("[facet-row-id="+this.data[dk].id+"]").addClass("facet-row-selected");
				}
			}
		}
	}

	/*
	* Function: toggleRowSelection
	* 
	*/
	toggleRowSelection(rowDomObj) {
		var found = false;
		var rowId = parseInt($(rowDomObj).attr("facet-row-id"));

		for(var key in this.selections) {
			if(this.selections[key] == rowId) {
				found = key;
			}
		}

		if(found !== false) {
			$(".facet-row-checkbox-mark", rowDomObj).remove();
			$(rowDomObj).removeClass("facet-row-selected");
			this.selections.splice(found, 1);
			this.removeSelection(rowId);
		}
		else {
			$(".facet-row-checkbox", rowDomObj).append(this.checkMark);
			$(rowDomObj).addClass("facet-row-selected");
			//this.selections.push(rowId);
			this.addSelection(rowId);
			//this.setSelections([rowId], true);
		}

		if(this.minimized) {
			this.renderData(this.getSelectionsAsDataItems()); //Re-render data to remove now unselected rows
			this.minimize(); //Recalcuate height by running the minimize routine again
		}


		//Send a ping upwards notifying that a selection was made
		this.broadcastSelection();

		//Update descending facets
		//window.sead.facetManager.chainQueueFacetDataFetch(window.sead.facetManager.getSlotIdByFacetId(this.id)+1);
	}

	/*
	* Function: getScrollPos
	* 
	*/
	getScrollPos() {
		return $(this.domObj).find(".facet-body").scrollTop();
	}

	/*
	* Function: minimize
	*/
	minimize(changeFacetSize = false) {
		this.scrollPosition = this.getScrollPos();
		super.minimize();

		$(".facet-text-search-input", this.getDomRef()).hide();
		$(".facet-text-search-btn", this.getDomRef()).hide();
		
		$(this.domObj).find(".facet-body").show(); //Un-do hide of facet-body which is done in the super
		
		if(changeFacetSize) {
			var headerHeight = $(".facet-header", this.domObj).height();
			headerHeight += 12;
	
			//var selectionsHeight = this.selections.length * this.rowHeight;
			let selectionsHeight = this.rowHeight; //Collapse down to just 1 row
	
			var facetHeight = headerHeight + selectionsHeight;
			if(facetHeight > Config.facetBodyHeight+headerHeight-7) { //FIXME: kinda arbitrary, no?
				facetHeight = Config.facetBodyHeight+headerHeight-7; //FIXME: kinda arbitrary, no?
			}
			$(this.domObj).css("height", facetHeight+"px");
			if(selectionsHeight < facetHeight) {
				$("#facet-"+this.id+" > .facet-body").css("height", selectionsHeight+"px");
			}
			else {
				$("#facet-"+this.id+" > .facet-body").css("height", facetHeight+"px");
			}
		}
		
		var slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
		this.sqs.facetManager.updateSlotSize(slotId);
		this.sqs.facetManager.updateAllFacetPositions();
		
		$(".discrete-facet-blank-space", this.getDomRef()).hide();
		this.updateRenderData();
	}


	/*
	* Function: maximize
	*/
	maximize() {
		super.maximize();
		
		//$(".facet-text-search-input", this.getDomRef()).show();
		$(".facet-text-search-btn", this.getDomRef()).show();
		
		$(".discrete-facet-blank-space", this.getDomRef()).show();
		$("#facet-"+this.id).css("height", this.defaultHeight);
		$("#facet-"+this.id).find(".facet-body").css("height", this.bodyHeight);
		//this.renderData(this.visibleData);
		this.updateRenderData();
		
		$(this.domObj).find(".facet-body").scrollTop(this.scrollPosition);

		var slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
		this.sqs.facetManager.updateSlotSize(slotId);
		this.sqs.facetManager.updateAllFacetPositions();
	}

	/*
	* Function: getSelectionsAsDataItems
	* 
	* Gets the current selections in the same format as the rows in the main data array.
	* 
	* Parameters:
	* 
	* Returns:
	* The current selections in the same format as the rows in the main data array.
	* 
	*/
	getSelectionsAsDataItems() {
		var s = [];

		for(var k in this.data) {
			for(var key in this.selections) {
				if(this.selections[key] == this.data[k].id) {
					s.push(this.data[k]);
				}
			}
		}
		return s;
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
		super.importData();
		this.data = [];
		var i = 0;
		for(var key in data.Items) {
			this.data.push({
				id: data.Items[key].Category,
				name: data.Items[key].Name,
				title: data.Items[key].DisplayName,
				count: data.Items[key].Count,
				extent: data.Items[key].Extent
			});
		}

		const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
		if(this.name == "activeseason") {
			this.data.sort((a, b) => {
				return months.indexOf(a.title)- months.indexOf(b.title);
			});
		}
		else {
			/*
			this.data.sort((a, b) => {
				if(a.title > b.title) {
					return 1;
				}
				else {
					return -1;
				}
			});
			*/
			this.data.sort((a, b) => a.title.trimStart().localeCompare(b.title.trimStart(), "en"))
		}
		
		
		//check how this new data matches up with the current selections
		for(var sk in this.selections) {
			var selectionFound = false;
			for(var dk in this.data) {
				if(this.selections[sk] == this.data[dk].id) {
					selectionFound = true;
				}
			}
			if(!selectionFound) {
				this.inactiveSelections.push(this.selections[sk]);
				var pos = this.selections.indexOf(this.selections[sk]);
				this.selections.splice(pos, 1); //Remove from active selections since current dataset does not contain this item
			}
		}

		for(var sk in this.inactiveSelections) {
			var selectionFound = false;
			for(var dk in this.data) {
				if(this.inactiveSelections[sk] == this.data[dk].id) {
					selectionFound = true;
					this.selections.push(this.inactiveSelections[sk]);
					var pos = this.inactiveSelections.indexOf(this.inactiveSelections[sk]);
					this.inactiveSelections.splice(pos, 1); //Remove from inactive selections and put back into active
				}
			}
		}
		
		return this.data;
	}

}

export { DiscreteFacet as default }