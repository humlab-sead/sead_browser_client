import Facet from './Facet.class.js'
import { nanoid } from 'nanoid';
/*
* Class: MultiStageFacet
* Subclass of Facet. Renders data in stages as a list.
*/
class MultiStageFacet extends Facet {
	/*
	* Function: constructor
	*/
	constructor(sqs, id = null, template = {}) {
		super(sqs, id, template);
		this.contentWindow = [];
		this.rowHeight = Config.discreteFacetRowHeight;
        this.facetBodyHeight = Config.facetBodyHeight - this.rowHeight;
		//this.viewportItemCapacity = Math.floor(this.facetBodyHeight / this.rowHeight) + 1; //why +1 here? what's the difference against a discrete facet?
		this.viewportItemCapacity = 0;
		this.textSize = Config.discreteFacetTextSize;
		this.scrollPosition = 0;
		this.textFilterString = "";
		this.visibleData = [];
		this.checkMark = "<div class='facet-row-arrow-mark'></div>";
		this.checkMarkSelected = "<div class='facet-row-arrow-mark-selected'></div>";
		this.sortMode = "title";
		this.sortDirection = "asc";
		this.currentFilterStage = 0;
		this.filters = []; //this facet can have multiple filters
		template.stagedFilters.forEach(filterName => {
			let domContainerId = "filter-container-"+nanoid();
			this.filters.push({
				name: filterName,
				data: [],
				selections: [],
				inactiveSelections: [],
				domContainerId: domContainerId
			});

			$(".multistage-container", this.domObj).append("<div id='"+domContainerId+"' class='filter-container'></div>");
		});

		this.checkMarks = {
			uncheckedBox: "<div class='facet-row-checkbox'></div>",
			checkedBox: "<div class='facet-row-checkbox'><div class='fa fa-check facet-row-checkbox-mark' aria-hidden='true'></div></div>",
			uncheckedArrow: "<div class='facet-row-arrow-mark'></div>",
			checkedArrow: "<div class='facet-row-arrow-mark-selected'></div>"
		}

		this.updateMaxRowTitleLength();
		this.renderSelections();

		$(".multistage-container", this.domObj).on("scroll", () => {
			var data = null;
			if($(this.getDomRef()).find(".facet-text-search-input").val().length > 0) {
				data = this.visibleData;
			}
			
			this.updateRenderData(data);
		});

		this.registerTextSearchEvents();
		this.registerSortEvents();
		
		this.sqs.tooltipManager.registerTooltip($(".facet-size-btn", this.getDomRef()), "Show only selections");
		this.sqs.tooltipManager.registerTooltip($(".facet-text-search-btn", this.getDomRef()), "Filter list by text");
        
		let backButtonNode = $("<div class='facet-title-back-button'>◀</div>");
		$(".facet-header", this.domObj).prepend(backButtonNode);
		backButtonNode.on("click", () => {
			this.selectPreviousFilterStage();
		});
		this.sqs.tooltipManager.registerTooltip(backButtonNode, "Go back to parent selection");

		//FIXME: this is a temporary hacky fix, but we listen for site report switch event and hide the filter when the site report is active
		//as a workaround. Because otherwise it can end up in a state where the filter is still visible in the site report view.
		$(document).on('viewChange', (event, args) => {
			if(args.viewName == "siteReport") {
				$("#"+this.getCurrentFilter().domContainerId, this.domObj).css("display", "none");
			}
			else {
				$("#"+this.getCurrentFilter().domContainerId, this.domObj).css("display", "block");
			}
		});
	}

	registerSortEvents() {
		$(this.getDomRef()).find(".facet-sort-alpha-btn").on("click", (evt) => {
			if(this.sortMode == "title") { //If already sorting by title, toggle direction
				if(this.sortDirection == "asc") {
					this.sortDirection = "desc";
				}
				else {
					this.sortDirection = "asc";
				}
			}

			if(this.sortDirection == "asc") {
				$(".sort-symbol", evt.currentTarget).removeClass("fa-sort-alpha-desc");
				$(".sort-symbol", evt.currentTarget).addClass("fa-sort-alpha-asc");
			}
			else {
				$(".sort-symbol", evt.currentTarget).removeClass("fa-sort-alpha-asc");
				$(".sort-symbol", evt.currentTarget).addClass("fa-sort-alpha-desc");
			}

			this.sortMode = "title";
			let renderData = this.getCurrentFilter().data;
			if(this.minimized) {
				renderData = this.getSelectionsAsDataItems();
			}
			this.renderData(renderData);
		});
		$(this.getDomRef()).find(".facet-sort-num-btn").on("click", (evt) => {
			if(this.sortMode == "count") { //If already sorting by title, toggle direction
				if(this.sortDirection == "asc") {
					this.sortDirection = "desc";
				}
				else {
					this.sortDirection = "asc";
				}
			}

			if(this.sortDirection == "asc") {
				$(".sort-symbol", evt.currentTarget).removeClass("fa-sort-numeric-desc");
				$(".sort-symbol", evt.currentTarget).addClass("fa-sort-numeric-asc");
			}
			else {
				$(".sort-symbol", evt.currentTarget).removeClass("fa-sort-numeric-asc");
				$(".sort-symbol", evt.currentTarget).addClass("fa-sort-numeric-desc");
			}

			this.sortMode = "count";
			let renderData = this.getCurrentFilter().data;
			if(this.minimized) {
				renderData = this.getSelectionsAsDataItems();
			}
			this.renderData(renderData);
		});
	}

	getCurrentFilter() {
		return this.filters[this.currentFilterStage];
	}

	getFilterByName(filterName) {
		for(let key in this.filters) {
			if(this.filters[key].name == filterName) {
				return this.filters[key];
			}
		}
		return null;
	}

    selectNextFilterStage() {
		if(this.currentFilterStage < this.filters.length - 1) {
			let oldFilterDomContainer = $("#"+this.getCurrentFilter().domContainerId, this.domObj);
			oldFilterDomContainer.animate({
				left: "-100%"
			}, 500,
			"swing",
			() => {
				oldFilterDomContainer.css("visibility", "hidden");
				oldFilterDomContainer.css("overflow-x", "hidden");
			});

			this.currentFilterStage++;
			
			let newFilterDomContainer = $("#"+this.getCurrentFilter().domContainerId, this.domObj);
			newFilterDomContainer.css("visibility", "visible");
			newFilterDomContainer.css("overflow-x", "visible");
			newFilterDomContainer.animate({
				left: "-100%"
			}, 500);

			$(".facet-title-back-button", this.domObj).css("display", "block");
		}
    }
	selectPreviousFilterStage() {
		if(this.currentFilterStage > 0) {

			let oldFilterDomContainer = $("#"+this.getCurrentFilter().domContainerId, this.domObj);
			oldFilterDomContainer.animate({
				left: "0%"
			}, 500,
			"swing",
			() => {
				oldFilterDomContainer.css("visibility", "hidden");
				oldFilterDomContainer.css("overflow-x", "hidden");
			});

			this.clearSelections();

			this.currentFilterStage--;
			
			let newFilterDomContainer = $("#"+this.getCurrentFilter().domContainerId, this.domObj);
			newFilterDomContainer.css("visibility", "visible");
			newFilterDomContainer.css("overflow-x", "visible");
			newFilterDomContainer.animate({
				left: "0%"
			}, 500);

			$(".facet-title-back-button", this.domObj).css("display", "none");
		}
    }
	
	/*
	 * Function: registerTextSearchEvents
	 */
	registerTextSearchEvents() {
		let filter = this.getCurrentFilter();
		$(this.getDomRef()).find(".facet-text-search-btn").on("click", () => {
			if($(this.getDomRef()).find(".facet-text-search-input").css("display") == "none") {
				$(this.getDomRef()).find(".facet-text-search-input").fadeIn(100).focus();
			}
			else {
				if($(this.getDomRef()).find(".facet-text-search-input").val().length > 0) {
					$(this.getDomRef()).find(".facet-text-search-input").val("");
					$(this.getDomRef()).find(".facet-text-search-btn").removeClass("facet-control-active");
					this.renderData(filter.data);
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
		let filter = this.getCurrentFilter();
		clearTimeout(this.textSearchTimeout);
		this.textSearchTimeout = setTimeout(() => {
			this.textFilterString = $(evt.target).val().toLowerCase();
			this.visibleData = [];
			if(this.textFilterString.length > 0) {
				for(var key in filter.data) {
					if(filter.data[key].title.toLowerCase().includes(this.textFilterString)) {
						this.visibleData.push(filter.data[key]);
					}
				}
				$(this.getDomRef()).find(".facet-text-search-btn").addClass("facet-control-active");
			}
			else {
				this.visibleData = filter.data;
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
		if(!this.selectionsAreEqual(this.selections, selections)) {
			if(append) {
				this.selections = this.selections.concat(selections);
			}
			else {
				this.selections = selections;
			}
			
			this.broadcastSelection();
		}
	}

	selectionsAreEqual(selectionsA, selectionsB) {
		if(selectionsA.length != selectionsB.length) {
			return false;
		}
		for(var key in selectionsA) {
			if(selectionsA[key] != selectionsB[key]) {
				return false;
			}
		}
		return true;
	}
	
	/*
	* Function: addSelection
	 */
	addSelection(selection) {
		let filter = this.getCurrentFilter();
		for(var key in filter.selections) {
			if (filter.selections[key] == selection) {
				return;
			}
		}
		filter.selections.push(selection);
	}
	
	/*
	* Function: removeSelection
	*/
	removeSelection(selection) {
		let filter = this.getCurrentFilter();
		for(var key in filter.selections) {
			if (filter.selections[key] == selection) {
				filter.selections.splice(key, 1);
				return;
			}
		}
	}

	/*
	* Function: clearSelections
	*/
	clearSelections() {
		let filter = this.getCurrentFilter();
		filter.selections.forEach(selectionId => {
			$("[facet-row-id='"+selectionId+"']").removeClass("facet-row-selected");
		});
		
		filter.selections = [];
	}
	
	/*
	* Function: getSelections
	*/
	getSelections() {
		let filter = this.getCurrentFilter();
		return filter.selections;
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
		let filter = this.getCurrentFilter();
		if(this.minimized) {
			//this.renderData(this.getSelectionsAsDataItems());
			this.renderMinimizedView(this.getSelectionsAsDataItems());
		}
		else {
			if(data == null) {
				data = filter.data;
			}
			this.renderData(data);
		}
	}

	renderMinimizedView(renderData = []) {
		this.renderData(renderData);
		
		$(".facet-row[facet-row-id='collapsed-facet-info-row']").on("click", () => {
			this.maximize();
		});
	}

	sortData(renderData, column = "title", sortDirection = "asc") {
		if(column == "title") {
			renderData.sort((a, b) => a.title.trimStart().localeCompare(b.title.trimStart(), "en"));
		}
		if(column == "count") {
			renderData.sort((a, b) => a.count - b.count);
		}

		if(sortDirection == "desc") {
			renderData.reverse();
		}
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
		let filter = this.getCurrentFilter();
		if(renderData == null) {
			renderData = filter.data;
		}
		
		if(renderData.length == 0) {
			//this.renderNoDataMsg(true);
			//return;
		}
		else {
			this.renderNoDataMsg(false);
		}

		this.sortData(renderData, this.sortMode, this.sortDirection);

		var scrollPos = this.getScrollPos();

		if(this.viewportItemCapacity == 0) {
			this.viewportItemCapacity = Math.floor($(".list-container", this.domObj).height() / this.rowHeight);
		}
		
		var viewPortHeight = this.viewportItemCapacity * this.rowHeight;
		var topBlankSpaceHeight = scrollPos;
		var bottomBlankSpaceHeight = (renderData.length * this.rowHeight) - scrollPos - viewPortHeight;
		var topBlankSpace = $("<div class='discrete-facet-blank-space'></div>").css("height", topBlankSpaceHeight);
		var bottomBlankSpace = $("<div class='discrete-facet-blank-space'></div>").css("height", bottomBlankSpaceHeight);
		var out = "";
		var dataPos = Math.ceil(scrollPos / this.rowHeight); //Changed this from floor to ceil, which fixes the last item not being rendered
		
		for(var i = 0; i < this.viewportItemCapacity; i++) {

			if(dataPos+i < renderData.length) {
				var dataElement = renderData[dataPos+i];
				var selectedClass = "";
				let checkMark = "";
				if(filter.selections.indexOf(parseInt(dataElement.id)) != -1) {
					//this item/row is selected
					selectedClass = "facet-row-selected";
					if(this.currentFilterStage == 0) {
						//if this is the inital stage, show arrows instead of checkboxes
						checkMark = this.checkMarks.checkedArrow;
					}
					else {
						checkMark = this.checkMarks.checkedBox;
					}
				}
				else {
					//this item/row is not selected
					//checkMark = "<div class='fa fa-caret-right facet-row-arrow-mark' aria-hidden='true'></div>";
					if(this.currentFilterStage == 0) {
						checkMark = this.checkMarks.uncheckedArrow;
					}
					else {
						checkMark = this.checkMarks.uncheckedBox;
					}
				}
				
				
				var displayTitle = dataElement.title;

				out += `
				<div class='facet-row `+selectedClass+`' facet-row-id='`+dataElement.id+`'>
					<div class='facet-row-checkbox-container'>
					`+checkMark+`
					</div>
					<div class='facet-row-text'>`+displayTitle+`</div>
					<div class='facet-row-count'>`+dataElement.count+`</div>
				</div>`;
			}
		}

		$(".list-container-header", this.domObj).css("display", "block");
		
        
        //$(".staging-container", this.getDomRef()).html("<div class='staging-container-text'>Ecocode system (1/2)</div><hr/>");

		$("#"+this.getCurrentFilter().domContainerId, this.getDomRef())
			.html("")
			.append(topBlankSpace)
			.append(out)
			.append(bottomBlankSpace)
			.show();
		
		$("#"+this.getCurrentFilter().domContainerId, this.getDomRef()).find(".facet-row").on("click", (evt) => {
			if(this.locked) {
				return;
			}
			this.toggleRowSelection(evt.currentTarget);
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
			$(this.getDomRef()).find(".multistage-container").css("display", "none");
		}
		else {
			$(this.getDomRef()).find(".multistage-container").css("display", "grid");
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
		let filter = this.getCurrentFilter();
		for(var sk in filter.selections) {
			for(var dk in filter.data) {
				if(filter.data[dk].id == filter.selections[sk]) {
					$(this.domObj).find("[facet-row-id="+filter.data[dk].id+"]").addClass("facet-row-selected");
				}
			}
		}
	}

	/*
	* Function: toggleRowSelection
	* 
	*/
	toggleRowSelection(rowDomObj) {
		let filter = this.getCurrentFilter();

		var found = false;
		var rowId = parseInt($(rowDomObj).attr("facet-row-id"));

		for(var key in filter.selections) {
			if(filter.selections[key] == rowId) {
				found = key;
			}
		}

		if(found !== false) {
			//unselecting
			
			$(".facet-row-checkbox-container", rowDomObj).children().remove();
			if(this.currentFilterStage == 0) {
				$(".facet-row-checkbox-container", rowDomObj).append(this.checkMarks.uncheckedArrow);
			}
			else {
				$(".facet-row-checkbox-container", rowDomObj).append(this.checkMarks.uncheckedBox);
			}
			

			$(rowDomObj).removeClass("facet-row-selected");
			filter.selections.splice(found, 1);
			this.removeSelection(rowId);
		}
		else {
			//selecting
			$(".facet-row-checkbox-container", rowDomObj).children().remove();
			if(this.currentFilterStage == 0) {
				$(".facet-row-checkbox-container", rowDomObj).append(this.checkMarks.checkedArrow);
			}
			else {
				$(".facet-row-checkbox-container", rowDomObj).append(this.checkMarks.checkedBox);
			}
			
			$(rowDomObj).addClass("facet-row-selected");
			this.addSelection(rowId);
			this.selectNextFilterStage();
		}

		if(this.minimized) {
			this.renderData(this.getSelectionsAsDataItems()); //Re-render data to remove now unselected rows
			this.minimize(); //Recalcuate height by running the minimize routine again
		}

		

		if(this.filters[0].selections.length == 1) {
			for(let key in this.filters[0].data) {
				if(this.filters[0].data[key].id == this.filters[0].selections[0]) {
					$(".facet-title", this.domObj).text(this.title+" - "+this.filters[0].data[key].name)
				}
			}
		}
		else if(this.filters[0].selections.length > 1) {
			$(".facet-title", this.domObj).text(this.title+" - multiple systems");
		}
		else {
			$(".facet-title", this.domObj).text(this.title);
		}


		//Send a ping upwards notifying that a selection was made
		this.broadcastSelection(filter);
	}

	getSelectionsAsDataItems() {
		var s = [];

		let filter = this.getCurrentFilter();

		for(var k in filter.data) {
			for(var key in filter.selections) {
				if(filter.selections[key] == filter.data[k].id) {
					s.push(filter.data[k]);
				}
			}
		}
		return s;
	}

	/*
	* Function: getScrollPos
	* 
	*/
	getScrollPos() {
		return $(this.domObj).find(".multistage-container").scrollTop();
	}

	/*
	* Function: minimize
	*/
	minimize(changeFacetSize = true) {
		this.scrollPosition = this.getScrollPos();
		super.minimize(changeFacetSize);

		$(".facet-text-search-input", this.getDomRef()).hide();
		$(".facet-text-search-btn", this.getDomRef()).hide();
		
		$(this.domObj).find(".facet-body").show(); //Un-do hide of facet-body which is done in the super
		
		if(changeFacetSize) {
			var headerHeight = $(".facet-header", this.domObj).height();
			let subHeaderHeight = $(".list-container-header", this.domObj).height();
			const selectionsNum = this.getCurrentFilter().selections.length;
			let facetHeight = headerHeight + subHeaderHeight + selectionsNum * this.rowHeight + 6;
			let facetBodyHeight = subHeaderHeight + selectionsNum * this.rowHeight + 6;
			
			if(facetHeight > Config.facetBodyHeight+headerHeight) {
				facetHeight = Config.facetBodyHeight+headerHeight;
			}

			$(this.domObj).css("height", facetHeight+"px");
			$(".facet-body", this.domObj).css("height", facetBodyHeight+"px");
		}
		
		var slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
		this.sqs.facetManager.updateSlotSize(slotId);
		this.sqs.facetManager.updateAllFacetPositions();
		
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
		let filter = this.getCurrentFilter();
		for(var k in filter.data) {
			for(var key in filter.selections) {
				if(filter.selections[key] == filter.data[k].id) {
					s.push(filter.data[k]);
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
		super.importData(data);

		let filter = this.getFilterByName(data.FacetsConfig.TargetCode);

		filter.data = [];
		var i = 0;
		for(var key in data.Items) {
			filter.data.push({
				id: data.Items[key].Category,
				name: data.Items[key].Name,
				title: data.Items[key].DisplayName,
				count: data.Items[key].Count,
				extent: data.Items[key].Extent
			});
		}
		
		//check how this new data matches up with the current selections
		for(var sk in filter.selections) {
			var selectionFound = false;
			for(var dk in filter.data) {
				if(filter.selections[sk] == filter.data[dk].id) {
					selectionFound = true;
				}
			}
			if(!selectionFound) {
				filter.inactiveSelections.push(filter.selections[sk]);
				var pos = filter.selections.indexOf(filter.selections[sk]);
				filter.selections.splice(pos, 1); //Remove from active selections since current dataset does not contain this item
			}
		}

		for(var sk in filter.inactiveSelections) {
			var selectionFound = false;
			for(var dk in filter.data) {
				if(filter.inactiveSelections[sk] == filter.data[dk].id) {
					selectionFound = true;
					filter.selections.push(filter.inactiveSelections[sk]);
					var pos = filter.inactiveSelections.indexOf(filter.inactiveSelections[sk]);
					filter.inactiveSelections.splice(pos, 1); //Remove from inactive selections and put back into active
				}
			}
		}
		
		return filter.data;
	}

}

export { MultiStageFacet as default }