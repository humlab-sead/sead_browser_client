/* 
* Class: Slot
* Slots are basically just parking spots for facets. They don't do much on their own and their main function is actually just to make it easier for YOU to think about how facets move and are positioned.
* It would be completely possible to design a system where slots are not needed, but it would be harder to understand, so...
*/
class Slot {
	/* 
	* Function: constructor
	*
	* Parameters:
	* id - An arbitrary id.
	*/
	constructor(sqs, id, virtual = false) {
		this.sqs = sqs;
		this.id = id;
		this.virtual = virtual;
		this.rendered = false;
		
		if(!this.virtual) {
			this.initUi();
		}
	}

	initUi() {
		var slotDomObj = $("#slot-template")[0].cloneNode(true);
		$(slotDomObj).attr("id", "slot-"+this.id);
		$(slotDomObj).attr("slot-id", this.id);
		$("#facet-section").append(slotDomObj);

		this.domObj = slotDomObj;

		$(slotDomObj).droppable({
			accept: '.facet',
			activeClass: 'droppable-active',
			hoverClass: 'droppable-hover',
			tolerance: 'pointer',
			drop: function(event, ui) {
				
			},
			over: (event, ui) => {
				let facetId = ui.draggable.attr("facet-id");
				let originSlotId = this.sqs.facetManager.getSlotIdByFacetId(facetId);
				let destinationFacetId = this.sqs.facetManager.getFacetIdBySlotId(parseInt($(event.target).attr("slot-id")));

				var dropSlotId = parseInt($(event.target).attr("slot-id")); //The slot being dragged to (also event.target)
				var dragSlotId = originSlotId; //The slot being dragged from
				var dropFacetId = destinationFacetId; //The facet in the target drop slot
				var dragFacetId = parseInt(ui.draggable.attr("facet-id")); //The facet being dragged

				this.sqs.facetManager.moveFacets(dropSlotId, dropFacetId, dragSlotId, dragFacetId);
				this.sqs.facetManager.updateAllFacetPositions();

			},
			deactivate: function(event, ui) {
				//console.log("out");
			}
		});
	}

	renderBetweenSlotArrow() {
		setTimeout(() => {
			var betweenSlotArrow = $("<div class='slotArrowContainer'></div>");
			if(this.isLastSlot()) {
				betweenSlotArrow.append("<i class=\"fa fa-arrow-right\" aria-hidden=\"true\"></i>");
			}
			else {
				betweenSlotArrow.append("<i class=\"fa fa-arrow-down\" aria-hidden=\"true\"></i>");
			}
			
			$("#facet-section").append(betweenSlotArrow);
			this.betweenSlotArrow = betweenSlotArrow;
		}, 100);
		
	}
	
	isLastSlot() {
		var lastKey = this.sqs.facetManager.slots.length - 1;
		return this.id == this.sqs.facetManager.slots[lastKey].id;
	}
	
	/* 
	* Function: getDomRef
	* Gets the DOM object for this slot. Slots do exist as DOM objects, but they are normally invisible. Modify the CSS and set a background-color for them if you wish to see them.
	*/
	getDomRef() {
		return $("[slot-id="+this.id+"]");
	}

	/*
	* Function: fitSizeToFacet
	*
	* Makes this slot the same height as the facet that is parked in it.
	*
	*/
	fitSizeToFacet() {
		if(this.virtual) {
			return;
		}
		var facet = this.sqs.facetManager.getFacetById(this.sqs.facetManager.getFacetIdBySlotId(this.id));
		var height = $(facet.domObj).css("height");
		//console.log("Facet height is:", height);
		$(this.domObj).css("height", height);
	}

	/*
	* Function: destroy
	*/
	destroy(instantly = false) {
		if(this.virtual) {
			return;
		}
		var d = this.getDomRef();

		$(d).droppable('disable');
		
		if(this.betweenSlotArrow != null) {
			this.betweenSlotArrow.remove();
			this.betweenSlotArrow = null;
		}
		
		
		if(instantly) {
			$(d).remove();
		}
		else {
			$(d).fadeOut(500, function() {
				$(this).remove();
			});
		}
	}
}

export { Slot as default }