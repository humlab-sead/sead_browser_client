//import Config from '../config/config.js';
import Slot from './Slot.class.js'
import Facet from './Facet.class.js'
import DiscreteFacet from './DiscreteFacet.class.js'
import RangeFacet from './RangeFacet.class.js'
import MapFacet from './MapFacet.class.js';
import MultiStageFacet from './MultiStageFacet.class';
import Config from '../config/config.json';
import TimelineFacet from './TimelineFacet.class.js';
import Timeline from './IOModules/Timeline.class.js';
/* 
Class: FacetManager
The FacetManager handles all things concerning the manipulation of multiple facets, basically anything that has to do with facets that exceeds the scope of the individual facet. For example moving/swapping of facets.
*/
class FacetManager {
	/*
	* Function: constructor
	* 
	*/
	constructor(sqs, filterDefinitions) {
		this.sqs = sqs;
		this.filterDefinitions = filterDefinitions;
		this.slots = [];
		this.facets = [];
		this.links = [];

		/*
		this.facetLinkedList = [];
		this.facetLinkedList.push({
			next: null,
			prev: null,
		});
		*/

		this.facetId = 0;
		this.debugMode = false;

		this.facetDataFetchingSuspended = false; //Wait for signal to fetch data after add/remove/swap among facets?
		this.facetDataFetchQueue = [];
		this.pendingDataFetchQueue = [];
		this.lastTriggeringFacet = false;

		$(window).on("seadStateLoad", (event, data) => {
			this.setFacetDataFetchingSuspended(true); //Disable data fetching while state is being loaded since we'll otherwise end up making a lot of useless requests
			this.removeAllFacets();
			this.batchAddFacets(data.state.facets);
			this.setFacetDataFetchingSuspended(false); //Turn data fetching back on, this will trigger queued requests to the sent. Or in other words: UNLEASH THE DOGS OF WAR
		});
		
		$(window).on("seadFacetSelection", (event, data) => {

			if(typeof data.filter != "undefined" && data.filter != null) {
				this.chainQueueFacetDataFetch(data.facet);
			}
			else {
				let facet = this.getNextFacetFromFacet(data.facet);
				if(facet !== false) {
					this.chainQueueFacetDataFetch(facet);
				}
			}
			
		});
		
		$(window).on("seadFacetDeletion", (event, data) => {
			var fetchFromFacet = this.getNextFacetFromFacet(data.facet);
			this.removeFacet(data.facet);
			if(fetchFromFacet !== false) {
				this.setLastTriggeringFacet(fetchFromFacet.id);
				this.chainQueueFacetDataFetch(fetchFromFacet);
			}
			
			if(this.getCountOfFacetsForSlots() == 0) {
				$("#facet-show-only-selections-btn").hide();
				setTimeout(() => {
					if(this.getCountOfFacetsForSlots() == 0) { //If there's still no facet...
						this.renderDemoSlot();
					}
				}, 500);
			}
		});
		
		$(window).on("seadFacetMove", (event, data) => {
			this.chainQueueFacetDataFetch(data.facet);
		});
		
		$(window).on("seadStateLoadFailed", () => {
			this.setFacetDataFetchingSuspended(false);
		});
		
		this.renderShowOnlySelectionsButton();
		this.renderDemoSlot();
		
		this.sqs.sqsEventListen("sqsFacetPreAdd", () => {
			if(this.demoSlot != null && this.getCountOfFacetsForSlots() == 0) {
				$(".filter-demo-arrow").remove();
				this.removeSlot(this.demoSlot, true);
				this.demoSlot = null;
			}
			$("#facet-show-only-selections-btn").show();
		});
		
		this.sqs.sqsEventListen("sqsFacetPostAdd", () => {
			this.updateSlotArrows();
		});
		this.sqs.sqsEventListen("sqsFacetPostRemove", () => {
			this.updateSlotArrows();
		});

		this.sqs.sqsEventListen("domainChanged", (evt, domainName) => {
			for(let i = this.facets.length - 1; i > -1; i--) {
				let facet = this.facets[i];
				facet.destroy();
			}
			
			this.buildFilterStructure(domainName);
		});

		setTimeout(() => {
			//this.addDefaultFacets();
		}, 500);
		
	}
	
	addDefaultFacets() {
		/*
		if(Config.timelineEnabled) {
			let facetId = "timeline";
			let facetTemplate = this.getFacetTemplateByFacetId("analysis_entity_ages");
			facetTemplate.virtual = true;
			let mapObject = this;
			this.timeline = new TimelineFacet(this.sqs, facetId, facetTemplate, mapObject);
			this.addFacet(this.timeline);
		}
		*/

		Config.defaultFilters.forEach((facetId) => {
			let facetTemplate = this.getFacetTemplateByFacetId(facetId);
			if(!facetTemplate) {
				console.warn("Facet not found: "+facetId);
				return;
			}
			let facet = this.makeNewFacet(facetTemplate);
			if(!facet) {
				console.warn("Facet not found: "+facetId);
				return;
			}
			this.addFacet(facet, false);
		});
	}

	toggleDebug() {
		this.debugMode = !this.debugMode;

		this.facets.forEach((facet) => {
			if(this.debugMode) {
				facet.showSqlButton();
			}
			else {
				facet.showSqlButton(false);
			}
		});
	}
	
	renderShowOnlySelectionsButton() {
		$("#facet-show-only-selections-btn").hide();
		this.showOnlySelectionsSetting = false;
		$("#facet-show-only-selections-btn").on("click", () => {
			this.showOnlySelections(this.showOnlySelectionsSetting ? false : true);
		});
		
		this.sqs.sqsEventListen("seadFacetDeletion", () => {
			this.updateShowOnlySelectionsControl();
		});
	}
	
	showOnlySelections(onOff, doNotManipulateFacets = false) {
		this.showOnlySelectionsSetting = onOff;
		if(this.showOnlySelectionsSetting) {
			$("#facet-show-only-selections-btn > .facet-head-btn").addClass("facet-control-active");
			if(doNotManipulateFacets === false) {
				for(var key in this.facets) {
					this.facets[key].minimize();
				}
			}
		}
		else {
			$("#facet-show-only-selections-btn > .facet-head-btn").removeClass("facet-control-active");
			if(doNotManipulateFacets === false) {
				for (var key in this.facets) {
					this.facets[key].maximize();
				}
			}
		}
	}
	
	updateShowOnlySelectionsControl() {
		var collapsed = [];
		for(var key in this.facets) {
			if(this.facets[key].minimized) {
				collapsed.push(this.facets[key]);
			}
		}
		if(collapsed.length == this.facets.length) {
			this.showOnlySelections(true, true);
		}
		if(collapsed.length < this.facets.length) {
			this.showOnlySelections(false, true);
		}
	}
	
	/*
	* Function: renderDemoSlot
	*
	*
	 */
	renderDemoSlot() {
		this.demoSlot = this.addSlot();
		let filterText = "<span><span id='demo-slot-menu-link' class='jslink-alt'>Add filters</span> here to reduce the result data (shown on the right) down to what you are interested in seeing</span>";
		$(this.demoSlot.getDomRef()).html(filterText);
		$(this.demoSlot.getDomRef()).addClass("slot-visible");
		
		$("#facet-section").append("<div class='filter-demo-arrow'>⤷</div>");

		let filterMenu = this.sqs.menuManager.getMenuByAnchor("#filters-menu-anchor-point");
		if(filterMenu) {
			setTimeout(() => {
				filterMenu.rebindTriggers();
			}, 100);
		}
	}
	
	/*
	* Function: getNextFacetFromFacet
	*
	* Gets the next facet in the facet chain (slot+1).
	*
	*/
	getNextFacetFromFacet(facet) {
		var slotId = this.getSlotByFacet(facet).id+1;
		for(var key in this.links) {
			if(this.links[key].slotId == slotId) {
				return this.getFacetById(this.links[key].facetId);
			}
		}
		return false;
	}
	
	
	/*
	* Function: getLinks
	* 
	* Returns the links array which describes the relationship between facets and slots.
	* 
	* Returns:
	* The links array
	*/
	getLinks() {
		return this.links;
	}

	/*
	* Function: setFacetDataFetchingSuspended
	* 
	* Sets data fetching suspended on/off. This is used when batch-adding facets such as when restoring a viewstate and you don't want to create a server request for each facet being added.
	*
	* Parameters:
	* on - Boolean
	*/
	setFacetDataFetchingSuspended(on) {
		this.facetDataFetchingSuspended = on;
		if(!on) {
			//Dispatch queued requests
			for(var key in this.facetDataFetchQueue) {
				this.facetDataFetchQueue[key].fetchData();
				this.setLastTriggeringFacet(this.facetDataFetchQueue[key]);
				this.pendingDataFetchQueue.push(this.facetDataFetchQueue[key]);
			}
			this.facetDataFetchQueue = [];
		}
	}

	/*
	* Function: makeNewFacet
	* 
	* Instantiate a facet according to the template given.
	*
	* Parameters:
	* template - An object describing the facet, most notably the type.
	* 
	* Returns:
	* The created facet object.
	*/
	makeNewFacet(template) {
		//special case for the timeline facet
		if(template.name == "analysis_entity_ages" && Config.timelineEnabled) {
			return new Timeline(this.sqs, this.getNewFacetId(), template);
		}

		switch(template.type) {
			case "multistage":
				return new MultiStageFacet(this.sqs, this.getNewFacetId(), template);
			case "discrete":
				return new DiscreteFacet(this.sqs, this.getNewFacetId(), template);
			case "range":
				return new RangeFacet(this.sqs, this.getNewFacetId(), template);
			case "rangesintersect":
				return new RangeFacet(this.sqs, this.getNewFacetId(), template);
			case "geopolygon":
				return new MapFacet(this.sqs, this.getNewFacetId(), template);
			default:
				console.warn("Facet type not recognized: "+template.type);
				return false;
		}
	}

	/*
	* Function: getFacetById
	* You put an ID in, you get a facet out. Simple.
	*/
	getFacetById(facetId) {
		for(var key in this.facets) {
			if(this.facets[key].id == facetId) {
				return this.facets[key];
			}
		}
		return false;
	}

	/*
	* Function: getFacetByName
	* What's in a name?
	*/
	getFacetByName(facetName) {
		for(var key in this.facets) {
			if(this.facets[key].name == facetName) {
				return this.facets[key];
			}
		}
		return false;
	}

	/*
	* Function: getSlotById
	* Gets a slot by its ID. What did you expect?
	*/
	getSlotById(slotId) {
		for(var key in this.slots) {
			if(this.slots[key].id == slotId) {
				return this.slots[key];
			}
		}
		return false;
	}
	
	getSlotByFacet(facet) {
		for(var key in this.links) {
			if(this.links[key].facetId == facet.id) {
				return this.getSlotById(this.links[key].slotId)
			}
		}
		return false;
	}

	/*
	* Function: queueFacetDataFetch
	* Queue is a funny word. Anyway, this is basically what you want to use for getting data for a facet. Think of it as "fetchFacetData" if you like, but it's really more of a queue-thingy going on here so...
	*/
	queueFacetDataFetch(facet) {
		if(!facet.enabled) {
			return;
		}
		
		if(!this.facetDataFetchingSuspended) {
			facet.fetchData();
		}
		else {
			this.facetDataFetchQueue.push(facet);
		}
	}

	/*
	* Function: chainQueueFacetDataFetch
	*
	* Fetches data for all facets in the (descending) facet chain starting from the given facet position.
	*
	* Parameters:
	* fromFacetPosition - The starting position, including this position itself. First position is 1, not 0. Because making lists which starts to count from zero doesn't really make a lot of sense when you think about it. Because a number is a symbol which indicates a certain quantity of something. So saying something is number 0 is a perversion of the numerical system since it utilizes numbers as arbitrary symbols rather than a system of counting, there - I said it!
	*/
	chainQueueFacetDataFetch(fromFacet = null) {
		console.log("chainQueueFacetDataFetch", fromFacet);
		if(fromFacet == null) {
			fromFacet = this.getFacetById(this.getFacetIdBySlotId(1));
		}
		this.setLastTriggeringFacet(fromFacet.id);
		var fromSlotId = this.getSlotByFacet(fromFacet).id;
		for(var key in this.links) {
			/*
			if(this.links[key].slotId == fromSlotId) {
				this.lastTriggeringFacet = this.links[key].facetId;
			}
			*/
			if(this.links[key].slotId >= fromSlotId) {
				this.queueFacetDataFetch(this.getFacetById(this.links[key].facetId));
			}
		}
	}

	/*
	* Function: addFacet
	* 
	* Takes a facet instance and attaches it to the system, meaning it will be given a slot, put in the link structure and a visual representation will be created in the UI.
	* 
	* Parameters:
	* facet - The facet instance. You probably got this through makeNewFacet
	* 
	* See Also:
	* makeNewFacet
	*/
	addFacet(facet, minimizeOthers = false, insertIntoSlotPosition = null) {
		this.sqs.sqsEventDispatch("sqsFacetPreAdd", facet);
		if(minimizeOthers) {
			for(var key in this.facets) {
				this.facets[key].minimize();
			}
		}
		
		this.facets.push(facet);

		let slot = this.addSlot(facet.virtual);

		//move the "timeline" facet to the end of the chain
		let timelineFacet = this.getFacetById("timeline");
		this.updateLinks(timelineFacet.id, this.getSlotByFacet(timelineFacet).id+1);

		if(insertIntoSlotPosition != null) {
			this.facets.forEach((facet) => {
				this.updateLinks(facet.id, this.getSlotByFacet(facet).id+1);
			});
			this.updateLinks(facet.id, insertIntoSlotPosition);
		}
		else {
			this.updateLinks(facet.id, slot.id);
		}

		this.queueFacetDataFetch(facet);
		if(!facet.virtual) {
			this.showSectionTitle(false);
			this.updateShowOnlySelectionsControl();
		}
		
		this.sqs.sqsEventDispatch("sqsFacetPostAdd", facet);
	}

	/*
	* Function: batchAddFacets
	* Used by the stateManager system to add a bunch of facets at once.
	*
	* Parameters:
	* facetDefinitions - These are the facets to add, in the regular facetDef-format.
	*/	
	batchAddFacets(facetDefinitions) {
		facetDefinitions.sort(function(a, b) {
			return a.position - b.position;
 		});
 		
		for(var key in facetDefinitions) {
			let facetTemplate = this.getFacetTemplateByFacetId(facetDefinitions[key].name);
			let facet = this.makeNewFacet(facetTemplate);
			if(!facet) {
				console.log("Facet not found: "+facetDefinitions[key].name);
				continue;
			}
			facet.setSelections(facetDefinitions[key].selections);
			this.addFacet(facet, false); //This will trigger a facet load request
			
			if(facetDefinitions[key].minimized) {
				//Wait until data is loaded before minimizing
				var interval = setInterval(() => {
					if(facet.isDataLoaded) {
						clearInterval(interval);
						facet.minimize();
					}
				}, 250);
			}
		}
	}

	/*
	* Function: getFacetTemplateByFacetId
	* You ever found yourself in a situation where you have the ID of a facet but you need its template to instanciate it because that's just how they built the system? Fear no more! With getFacetTemplateByFacetId YOU can have your brand new template shipped to your home, call now! 
	*/	
	getFacetTemplateByFacetId(facetId) {
		var facetDef = this.sqs.facetDef;
		for(var catKey in facetDef) {
			for(var facetKey in facetDef[catKey].filters) {
				if(facetId == facetDef[catKey].filters[facetKey].name) {
					var template = facetDef[catKey].filters[facetKey];
					template.color = facetDef[catKey].color;
					return template;
				}
			}
		}
		return false;
	}

	/*
	* Function: removeFacet
	* Have your facet become a nuisance? Let removeFacet be your problem solver.
	* NOTE: You should probably call Facet.destroy() instead - this will trigger a call to this function automatically because of the event sent out.

	* Parameters:
	* facet - The facet instance.
	*/	
	removeFacet(facet) {
		this.sqs.sqsEventDispatch("sqsFacetPreRemove", facet);
		var killKey = null;
		for(var key in this.facets) {
			if(this.facets[key].id == facet.id) {
				killKey = key;
			}
		}
		this.facets.splice(killKey, 1);

		//Update links - All below needs to be pushed up one slot
		let fromSlotId = this.getSlotIdByFacetId(facet.id);
		this.transposeLinks(fromSlotId);
		
		//Remove link to slot
		this.removeLink(facet.id);
		this.adjustNumberOfSlots();
		this.adjustSlotSizes();
		
		this.updateAllFacetPositions();

		//Update facet menu
		//$(".add-facet-btn[name='"+facet.name+"']").removeClass("menu-item-deactivated");
		
		if(this.facets.length == 0) {
			this.showSectionTitle(true);
		}
		
		this.sqs.sqsEventDispatch("sqsFacetPostRemove", facet);
	}

	/*
	* Function: removeAllFacets
	* The genocide version of removeFacet.
	*/	
	removeAllFacets() {
		for(var key in this.facets) {
			this.facets[key].destroy();
			this.removeSlot();
		}

		this.facets = [];
		this.links = [];
		this.slots = [];
	}

	/*
	* Function: transposeLinks
	* Call this when removing a slot. It will shift all positions below the deleted slot up one notch.

	* Parameters:
	* fromSlotId - The deleted slot id.
	*/
	transposeLinks(fromSlotId) {

		this.ghostLinks = [];

		for(var key in this.links) {
			this.ghostLinks.push({
				facetId: this.links[key].facetId,
				slotId: this.links[key].slotId
			});
		}

		for(var key in this.links) {
			if(this.links[key].slotId > fromSlotId) {
				var moveFacet = this.links[key].facetId;
				var moveFromSlot = this.links[key].slotId;
				var moveToSlot = moveFromSlot-1;

				this.updateLinks(moveFacet, moveToSlot);
			}
		}
	}

	/*
	* Function: adjustSlotSizes
	*/
	adjustSlotSizes() {
		for(var key in this.slots) {
			this.slots[key].fitSizeToFacet();
		}
	}

	getCountOfFacetsForSlots() {
		return this.facets.length;
	}

	/*
	* Function: adjustNumberOfSlots
	* Will adjust the number of slots to match the number of facets.
	*/
	adjustNumberOfSlots() {
		var delta = this.getCountOfFacetsForSlots() - this.slots.length;

		while(delta > 0) {
			this.addSlot();
			delta--;
		}

		while(delta < 0) {
			this.removeSlot();
			delta++;
		}
	}

	/*
	* Function: addSlot
	* Adds a slot. How about that.
	*/
	addSlot(virtual = false) {
		let slotId = this.slots.length+1;
		let slot = new Slot(this.sqs, slotId, virtual);
		this.slots.push(slot);
		return slot;
	}

	/*
	* Function: removeSlot
	* *Poof* *gone*
	*/
	removeSlot(slot = null, instantly = false) {
		if(slot != null) {
			//Delete a specific slot - Normally though you just want to delete the last slot (which happens below if no arg were passed)
			slot.destroy(instantly);
			for(var key in this.slots) {
				if(this.slots[key].id === slot.id) {
					this.slots.splice(key, 1);
				}
			}
			return;
		}
		
		if(this.slots.length > 0) {
			this.slots.pop().destroy(instantly);
		}
	}

	/*
	* Function: updateLinks
	* Updates the link structure the way you want. Just tell it you want to put that facet in that slot and it will figure it out for you. Super handy. But this is rather low level so you're probably looking for moveFacets().

	* Parameters:
	* facetId - The facet ID.
	* slotId - The slot ID.
	*
	* See Also:
	* moveFacets
	*/
	updateLinks(facetId, slotId) {
		let facetFound = false;
		for(let key in this.links) {
			if(this.links[key].facetId == facetId) {
				this.links[key].slotId = slotId;
				facetFound = true;
			}
		}

		if(!facetFound) {
			this.links.push({
				facetId: facetId,
				slotId: slotId
			});
		}
	}

	/*
	* Function: printLinks
	* Spits out the links structure, for debug purposes.
	*/
	printLinks() {
		console.log("LINKS:");
		for(var key in this.links) {
			console.log("("+key+") Facet "+this.links[key].facetId+" => Slot "+this.links[key].slotId);
		}
	}

	/*
	* Function: removeLink
	* No link, no problem.
	*/
	removeLink(facetId) {
		let foundKey = false;
		let keyToFacet = -1;
		for(var key in this.links) {
			if(this.links[key].facetId == facetId && foundKey == false) {
				keyToFacet = key;
				foundKey = true;
			}
		}
		if(foundKey) {
			let slotId = this.links[keyToFacet].slotId;
			this.links.splice(keyToFacet, 1);
			return slotId;
		}
		return false;
	}

	/*
	* Function: getNewFacetId
	* Makes a new unique facet id for your new shiny facet.

	* Returns: 
	* A new unique facet id that you may use as you like. Don't feed after midnight.
	*/
	getNewFacetId() {
		this.facetId++;
		return this.facetId;
	}

	/*
	* Function getSlotIdByFacetId
	* The name really says it all. It gets the id of the slot the facet is parked in based on the facet id.
	*/
	getSlotIdByFacetId(facetId) {
		for(var key in this.links) {
			if(this.links[key].facetId == facetId) {
				return this.links[key].slotId;
			}
		}
		return false;
	}
	
	/*
	* Function getFacetIdBySlotId
	* I'm not explaining this.
	*/
	getFacetIdBySlotId(slotId) {
		for(var key in this.links) {
			if(this.links[key].slotId == slotId) {
				return this.links[key].facetId;
			}
		}
		return false;
	}

	/*
	* Function: moveFacets
	* 
	* Performs a facet move in the underlying structure. Does not actually move the facets visually, but updates the data array describing the facet positions.
	* You probably want to call updateAllFacetPositions() after calling this function to actually sync the facets in the UI with the new structure.
	* 
	* Parameters:
	* dropSlotId - The slot the facet is being dropped in.
	* dropFacetId - The facet of the slot this facet is being dropped in (previous occupant after move is complete).
	* dragSlotId - The slot the facet is being dragged from (origin slot).
	* dragFacetId - The facet being dragged.
	*
	* See Also:
	* updateAllFacetPositions
	*/
	moveFacets(dropSlotId, dropFacetId, dragSlotId, dragFacetId) {

		//If dropFacet == locked facet, refuse to do anything
		if(this.getFacetById(dropFacetId).locked) {
			return;
		}

		if(dragFacetId == dropFacetId) {
			return;
		}

		//if facet is coming from a slot below - send facet down
		if(dragSlotId > dropSlotId) {
			this.updateLinks(dropFacetId, dragSlotId); //wouldn't this always be the dragSlotId?
			this.updateLinks(dragFacetId, dropSlotId);
		}

		//if facet is coming from a slot above - send facet up
		if(dragSlotId < dropSlotId) {
			this.updateLinks(dropFacetId, dragSlotId);
			this.updateLinks(dragFacetId, dropSlotId);
		}

		this.updateSlotSize(dropSlotId);
		this.updateSlotSize(dragSlotId);

		var chainLoadFacetsFrom = 0;
		if(dropSlotId < dragSlotId) {
			chainLoadFacetsFrom = dropSlotId;
		}
		else {
			chainLoadFacetsFrom = dragSlotId;
		}

		var originFacet = this.getFacetById(this.getFacetIdBySlotId(chainLoadFacetsFrom));
		
		this.broadcastFacetMove(originFacet);
	}
	
	/*
	* Function: broadcastFacetMove
	*
	*/
	broadcastFacetMove(originFacet) {
		$.event.trigger("seadFacetMove", {
			facet: originFacet
		});
	}


	/*
	* Function: updateSlotSize
	* 
	* Updates the size of the slot to match the size (height) of the facet.
	* 
	* Parameters:
	* slotId
	*/
	updateSlotSize(slotId) {
		var slot = this.getSlotById(slotId).fitSizeToFacet();
	}
	
	/*
	* Function: updateAllSlotSizes
	*
	*/
	updateAllSlotSizes() {
		for(var key in this.slots) {
			this.updateSlotSize(this.slots[key].id);
		}
	}

	/*
	* Function: updateAllFacetPositions
	* 
	* Visually moves all facets to their assigned slot positions. Basically you want to call this if you update the facets-slots links array.
	* 
	* Parameters:

	* Returns:
	*/
	updateAllFacetPositions() {
		
		//Before we update the facet positions we need to update the slot sizes, otherwise the facet positions might be off
		//this.updateAllSlotSizes();
		
		for(var key in this.facets) {
			this.facets[key].updatePosition();
		}
	}


	/*
	* Function: importFacetDefinitions
	* 
	* Converts facet definitions from DEF to internal format and stores them.
	* 
	* Parameters:
	* data - The DEF facet definitions.

	* Returns:
	*/
	importFacetDefinitions(facetDef) {
		this.sqs.facetDef = [];

		//Check that this group has at least one enabled item, otherwise don't render it
		for(let key in facetDef) {
			let group = facetDef[key];
			group.enabled = false;
			
			group.items.forEach((facet) => {
				if(facet.enabled != false) {
					group.enabled = true;
				}
			});
		}

		for(var key in facetDef) {
			var group = facetDef[key];
			if(group.enabled) {
				var groupKey = this.sqs.facetDef.push({
					name: group.facetGroupKey,
					title: group.displayTitle,
					color: "#214466",
					filters: []
				});
				
				groupKey = groupKey - 1;
				
				for(var fk in group.items) {
					
					if(typeof(group.items[fk].enabled) == "undefined") {
						group.items[fk].enabled = true;
					}
					if(group.items[fk].enabled) {
						if(group.items[fk].facetCode == "analysis_entity_ages") {
							group.items[fk].displayTitle = "Timeline";
						}
						if(group.items[fk].facetCode == "sites_polygon") {
							group.items[fk].displayTitle = "Map polygon";
						}
						var filter = {
							name: group.items[fk].facetCode,
							title: group.items[fk].displayTitle,
							type: group.items[fk].facetTypeKey,
							stagedFilters: group.items[fk].stagedFilters ? group.items[fk].stagedFilters : [],
							dependencies : group.items[fk].dependencies,
							description: group.items[fk].description
						}

						if(this.sqs.config.filterBlacklist.includes(filter.name)) {
							continue;
						}

						filter.callback = this.makeFacetMenuCallback(filter);
						this.sqs.facetDef[groupKey].filters.push(filter);
					}
				}
			}
		}

		return this.sqs.facetDef;
		
		/*
		* NOTE: Here we do some filtering on the facet definitions given from the server. This should not be necessary in production but done to filter out some garbage we're getting from the server right now.
		* Everything below here in this function can safely be erased when/if the server only sends the data we want.
		*/
		/*
		var excludeCategories = ["ROOT", "others"];
		var excludeFacets = [
			"places_all2",
			"physical_samples",
			"sites_helper",
			"tbl_relative_dates_helper",
			"abundance_classification",
			"abundances_all_helper",
			"tbl_denormalized_measured_values_37", //Taken out because of encoding error in displayTitle
			"abundance_helper"
		];
		for(var i = sead.facetDef.length-1; i >= 0; i--) {
			if($.inArray(sead.facetDef[i].name, excludeCategories) !== -1) {
				sead.facetDef.splice(i, 1);
			}
			else {
				
				for(var i2 = sead.facetDef[i].filters.length-1; i2 >= 0; i2--) {
					if($.inArray(sead.facetDef[i].filters[i2].name, excludeFacets) !== -1) {
						sead.facetDef[i].filters.splice(i2, 1);
					}
				}
			}
		}
		*/
		
		//Insert extra group
		/*
		sead.facetDef.push({
			name: "test",
			title: "Geo Test",
			color: "#214466",
			filters: [{
				name: "map",
				title: "Geo",
				type: "map",
				callback: this.makeFacetMenuCallback({
					name: "map",
					title: "Geo",
					type: "map"})
			}]
		});
		*/
	}

	/*
	* Function: loadFacetState
	* 
	* Synchronizes the current real world situation with the one described in the facetState. FIXME: Doesn't seem to be used...?
	*
	* Parameters:
	* 
	* Returns:
	*/
	loadFacetState(facetState) { //Used to be called loadFacetData
		//check that the right facets are active

		for(var key in this.facetState) {
			var found = false;
			for(var k in this.facets) {
				if(this.facetState[key].name == this.facets[k].name) {
					found = true;
				}
			}

			if(!found) {
				//Add this facet
			}
		}

		for(var k in this.facets) {
			var found = false;
			for(var key in this.facetState) {
				if(this.facetState[key].name == this.facets[k].name) {
					found = true;
				}
			}
			if(!found) {
				//Remove this facet
			}
		}


		//check that facets have the right position

		for(var key in this.facetState) {
			if(this.getFacetByName(this.facetState[key].name).position != this.facetState[key].position) {
				//The position of this facet needs to be updated
			}
		}

		//insert data
		for(var key in this.facetState) {
			this.getFacetByName(this.facetState[key].name).loadData(this.facetState[key].data);
		}

		//make selections (without causing a reload)
		for(var key in this.facetState) {
			this.getFacetByName(this.facetState[key].name).selectItems(this.facetState[key].selections);
		}
	}

	/*
	* Function: clearFacetData
	* 
	* Clears the data/content for this facet. 
	* 
	* Parameters:
	* 
	* Returns:
	*/
	clearFacetData() {
		for(var key in this.facets) {
			this.facets[key].clearData();
		}
	}

	/*
	* Function: getFacetState
	* 
	* Gets the current facetState - meaning what facets are active, what their position is in the chain and what selections they might have.
	* 
	* Parameters:
	* inDataExchangeFormat - Return result in DEF (for server comms), otherwise internal format is used.
	* 
	* Returns:
	* The facetState structure in DEF or internal format.
	*/
	getFacetState(inDataExchangeFormat = false, excludeDeletedFacets = true) {
		this.facetState = [];

		this.facets.sort((facetA, facetB) => {
			if(this.getSlotIdByFacetId(facetA.id) > this.getSlotIdByFacetId(facetB.id)) {
				return 1;
			}
			else {
				return -1;
			}
		});

		let currentFilterPosition = 1;
		for(var key in this.facets) {
			if((excludeDeletedFacets === true && this.facets[key].deleted === false) || excludeDeletedFacets === false) {
				
				if(typeof this.facets[key].filters != "undefined" && this.facets[key].filters.length > 1) {
					for(let filterKey in this.facets[key].filters) {
						let filter = this.facets[key].filters[filterKey];
						
						this.facetState.push({
							name: filter.name,
							//position: this.getSlotIdByFacetId(this.facets[key].id) + parseInt(filterKey),
							position: currentFilterPosition++,
							selections: filter.selections,
							type: this.facets[key].type,
							minimized: this.facets[key].minimized
						});
					}
				}
				else {
					this.facetState.push({
						name: this.facets[key].name,
						//position: this.getSlotIdByFacetId(this.facets[key].id),
						position: currentFilterPosition++,
						selections: this.facets[key].getSelections(),
						type: this.facets[key].type,
						minimized: this.facets[key].minimized
					});	
				}
				
			}
		}

		if(inDataExchangeFormat) {
			return this.facetStateToDEF(this.facetState);
		}

		return this.facetState;
	}

	/*
	getFacetState(inDataExchangeFormat = false, excludeDeletedFacets = true) {
		this.facetState = [];

		for(var key in this.facets) {
			if((excludeDeletedFacets === true && this.facets[key].deleted === false) || excludeDeletedFacets === false) {
				this.facetState.push({
					name: this.facets[key].name,
					position: this.getSlotIdByFacetId(this.facets[key].id),
					selections: this.facets[key].getSelections(),
					type: this.facets[key].type,
					minimized: this.facets[key].minimized
				})
			}
		}

		if(inDataExchangeFormat) {
			return this.facetStateToDEF(this.facetState);
		}
		return this.facetState;
	}
	*/
	/*
	* Function: facetStateToDEF
	* 
	* Converts the current facetState structure from its internal format to the Data Exchange Format (DEF) used for communicating with the server.
	* 
	* Parameters:
	* facetState - The internal facetState structure.
	* requestInfo - Object containing requestType, targetCode and triggerCode, since the request packet needs to be shaped according to these.
	* 
	* Returns:
	* The facetState structure in DEF format (json object).
	*/
	facetStateToDEF(facetState, requestInfo) { //DEF = DataExchangeFormat - the protocol used to comm with the server
		var def = [];
		for(var key in facetState) {

			var picks = [];
			if(facetState[key].type == "discrete" || facetState[key].type == "geopolygon" || facetState[key].type == "multistage") {
				for(var sk in facetState[key].selections) {
					
					if(facetState[key].selections[sk] != null) { //I got this once - an empty selection, but I can reproduce it and thus can't find the original cause so I'm just gonna defend against it here for now.
						
						if(facetState[key].type == "geopolygon") {
							picks = facetState[key].selections.map((selection) => {
								return {
									pickValue: selection
								}
							});
						}
						else {
							picks.push({
								pickType: 1, //0 = ukn, 1 = discrete, 2 = lower, 3 = upper
								pickValue: facetState[key].selections[sk],
								text: facetState[key].selections[sk]
							});
						}
					}
					else {
						console.error("Oops! Error number 2398725 (I totally just made that up) occured. But seriously though, there was an error, you should probably look into it. Glad I'm not you.");
						console.error(facetState[key].selections);
					}
				}
			}
			
			/*
			* If this is a range facet and the request is for this facet, we need to exclude any selections/picks for it in this request since that will result
			* in the server generating different categories and thus messing up any viewstate we may be using since the selections in that viewstate
			* may not map up to the existing categories.
			*/
			//if(facetState[key].type == "range" && facetState[key].selections.length == 2 && requestInfo.targetCode != facetState[key].name) {
			if((facetState[key].type == "range" || facetState[key].type == "rangesintersect")  && facetState[key].selections.length == 2) {
				picks.push({
					pickType: 2, //0 = ukn, 1 = discrete, 2 = lower, 3 = upper
					pickValue: facetState[key].selections[0],
					text: facetState[key].selections[0]
				});
				picks.push({
					pickType: 3, //0 = ukn, 1 = discrete, 2 = lower, 3 = upper
					pickValue: facetState[key].selections[1],
					text: facetState[key].selections[1]
				});
			}

			def.push({
				facetCode: facetState[key].name,
				position: facetState[key].position,
				picks: picks,
				textFilter: ""
			});
		}
		
		return def;
	}
	
	/*
	* Function: makesqsMenuFromFacetDef
	*/
	makesqsMenuFromFacetDef(facetDef) {
		var menu = {
			title: "Filters",
			layout: "vertical",
			l1layout: "vertical",
			customLabel: true,
			//menuItemsContainerSelector: "#filters-menu-anchor-point",
			collapsed: true,
			expandHorizontally: true,
			l2TriggerEvent: "mouseover",
			anchor: "#filters-menu-anchor-point",
			//anchor: "#facet-menu", //anchor should be the anchor point / container for the actual pop-out menum, then we should have a separate attr for the activator/button
			triggers: [{
				selector: "#facet-menu",
				on: "click"
			},
			{
				selector: "#filter-menu-filter-area",
				on: "click"
			},
			{
				selector: "#demo-slot-menu-link",
				on: "click"
			}],
			callbacks: [
				{
					selector: "#facet-menu",
					on: "mouseover",
					callback: () => {
						this.sqs.svgSetFill($("#facet-menu")[0], "#3978b4");
						$("#filter-menu-filter-area").css("background", "#3978b4");
					}
				},
				{
					selector: "#facet-menu",
					on: "mouseout",
					callback: () => {
						this.sqs.svgSetFill($("#facet-menu")[0], this.sqs.color.colors.baseColor);
						$("#filter-menu-filter-area").css("background", this.sqs.color.colors.baseColor);
					}
				},
				{
					selector: "#filter-menu-filter-area",
					on: "mouseover",
					callback: () => {
						this.sqs.svgSetFill($("#facet-menu")[0], "#3978b4");
						$("#filter-menu-filter-area").css("background", "#3978b4");
					}
				},
				{
					selector: "#filter-menu-filter-area",
					on: "mouseout",
					callback: () => {
						this.sqs.svgSetFill($("#facet-menu")[0], this.sqs.color.colors.baseColor);
						$("#filter-menu-filter-area").css("background", this.sqs.color.colors.baseColor);
					}
				},
			],
			anchorTriggerEvent: "click",
			//customStyleClasses: "sqs-menu-block-vertical-large",
			viewPortResizeCallback: () => {
				let pos = $("#filter-menu-filter-area").position().left - 15;
				$("#filters-menu-anchor-point").css("left", pos+"px");
			},
			items: []
		};
		
		for(var gk in facetDef) {
			if(facetDef[gk].filters.length == 0) {
				facetDef.splice(gk, 1);
			}
		}

		for(var gk in facetDef) {
			var facetGroup = {
				name: facetDef[gk].name,
				title: facetDef[gk].title,
				tooltip: "",
				children: []
			};
			
			for(var fk in facetDef[gk].filters) {
				let icon = "";
				if(facetDef[gk].filters[fk].type == "discrete") {
					icon = "<span class='sqs-menu-facet-type-icon'><i class=\"fa fa-list-ul\" aria-hidden=\"true\"></i></span>";
				}
				if(facetDef[gk].filters[fk].type == "range" || facetDef[gk].filters[fk].type == "rangesintersect") {
					icon = "<span class='sqs-menu-facet-type-icon'><i class=\"fa fa-bar-chart\" aria-hidden=\"true\"></i></span>";
				}
				if(facetDef[gk].filters[fk].type == "multistage") {
					icon = "<span class='sqs-menu-facet-type-icon'><i class=\"fa fa-list-ul\" aria-hidden=\"true\"></i></span>";
				}
				if(facetDef[gk].filters[fk].type == "geopolygon") {
					icon = "<span class='sqs-menu-facet-type-icon'><i class=\"fa fa-map-marker\" aria-hidden=\"true\"></i></span>";
				}


				facetGroup.children.push({
					name: facetDef[gk].filters[fk].name,
					title: "<div>"+icon+" "+facetDef[gk].filters[fk].title+"</div>",
					tooltip: facetDef[gk].filters[fk].description,
					callback: (() => { //This is a self-executing function that returns a function (which is the callback)
						let facetName = facetDef[gk].filters[fk].name;
						return () => {
							var facets = this.sqs.facetManager.facets;
							var facetExists = false;
							//FIXME: We should be allowing multple instances of the same facet type... but the backend doesn't suppoert it - I think ???
							
							for(var key in facets) {
								if(facets[key].name == facetName) {
									//Facet already exists
									facetExists = true;
									$("#facet-menu [name='"+facetName+"']").effect("shake");
								}
							}
							
							if(facetExists === false) {
								let t = this.sqs.facetManager.getFacetTemplateByFacetId(facetName);
								var facet = this.sqs.facetManager.makeNewFacet(t);
								this.sqs.facetManager.addFacet(facet);
							}
							else {
								this.sqs.notificationManager.notify("Filter already exists.", "info");
							}
						}
					})()
				});
			}
			
			menu.items.push(facetGroup);
		}

		for(var gk in facetDef) {
			let enabled = false;
			for(let ik in facetDef[gk].items) {
				if(facetDef[gk].items[ik].enabled) {
					enabled = true;
				}
			}
			facetDef[gk].enabled = enabled;
		}
		
		return menu;
	}

	/*
	* Function: fetchFacetDefinitions
	* 
	* Gets the facet definitions from the server. These details which facets exists, what type they are and so on. Used to create the facet menu.
	* 
	* Parameters:
	* sead - The main SEAD instance.
	* 
	* Returns:
	*/
	fetchFacetDefinitions(sead) {
		
		//var facetDefUrl = Config.serverAddress+"/api/meta/facet/group";
		//var facetDefUrl = "http://localhost:8080/filters.json"; //FIXME: TEMPORARY, also remove import at top
		//var facetDefUrl = Config.serverRoot+"/filters.json";
		var facetDefUrl = "/filters.json";
		//facetDefUrl = "http://dev.humlab.umu.se:2192/filters.json";

		return $.ajax(facetDefUrl, {
			method: "get",
			dataType: "json",
			success: (data) => {
				this.importFacetDefinitions(data);
			}
		});

	}


	/*
	* Function: makeFacetMenuCallback
	* 
	* Creates the callback function used in the facet menu when a facet is clicked
	* 
	* Parameters:
	* f - Facet object
	* 
	* Returns:
	*/
	makeFacetMenuCallback(f) {
		return function() {
			var facetTemplate = window.sead.facetManager.getFacetTemplateByFacetId(f.name);
			var facet = window.sead.facetManager.makeNewFacet(facetTemplate);
			window.sead.facetManager.addFacet(facet);
		}
	}
	
	/*
	* Function: showSectionTitle
	*/
	showSectionTitle(on) {
		if(on) {
			$("#facet-section-title").fadeIn(100);
		}
		else {
			$("#facet-section-title").fadeOut(100);
		}
	}

	/*
	* Function: getLastFacet
	* 
	* Gets the last facet in the current chain of facets.
	* 
	* Returns:
	* A facet object or false if there are no facets.
	*/
	getLastFacet(excludeDeletedFacets = true) {
		var highestSlotId = 0;
		for(var key in this.links) {
			if(this.links[key].slotId > highestSlotId && (excludeDeletedFacets === false || this.getFacetById(this.links[key].facetId).deleted === false)) {
				highestSlotId = this.links[key].slotId;
			}
		}

		return this.getFacetById(this.getFacetIdBySlotId(highestSlotId));
	}

	getFacetByName(facetName) {
		for(let key in this.facets) {
			if(facetName == this.facets[key].name) {
				return this.facets[key];
			}
		}
		return null;
	}
	
	
	/*
	* Function: getLastTriggeringFacet
	*
	* Gets the facet which was the last one to initiate a result update request.
	*
	* Returns:
	* A facet id or false.
	*/
	getLastTriggeringFacet() {
		return this.getFacetById(this.lastTriggeringFacet);
	}
	
	setLastTriggeringFacet(facet) {
		if(typeof(facet) == "object") {
			this.lastTriggeringFacet = facet.id;
		}
		else {
			this.lastTriggeringFacet = facet;
		}
	}

	/*
	* Function: facetsHasSelections
	* 
	* Determines if any facets has any selections or not.
	* 
	* Returns:
	* boolean
	*/
	facetsHasSelections() {
		for(var key in this.facets) {
			if(this.facets[key].deleted == false && this.facets[key].hasSelection()) {
				return true;
			}
		}
		return false;
	}
	
	/*
	* Function: updateSlotArrows
	 */
	updateSlotArrows() {
		$(".slotArrowContainer").remove();
		for(var key in this.slots) {
			if(this.slots[key].isLastSlot() == false) {
				var betweenSlotArrow = $("<div class='slotArrowContainer'></div>");
				betweenSlotArrow.append("<i class=\"fa fa-arrow-down\" aria-hidden=\"true\"></i>");
				$(this.slots[key].getDomRef()).after(betweenSlotArrow);
			}
		}
	}

	buildFilterStructure(domainName) {
        let domainFilterList = null;
        for(let key in Config.domains) {
            if(Config.domains[key].name == domainName) {
                domainFilterList = Config.domains[key].filters;
                break;
            }
		}

        this.filterDefinitions = this.filterFilters(domainFilterList, this.filterDefinitions);

		this.facetDef = this.importFacetDefinitions(this.filterDefinitions);
		
        var sqsMenuStruct = this.makesqsMenuFromFacetDef(this.facetDef);
		this.sqs.menuManager.createMenu(sqsMenuStruct);
	}
	
	/*
	* Function: filterFilters
	* 
	* It filters the filters.
	*/
	filterFilters(filterList, filterDefinitions) {
		for(let groupKey in filterDefinitions) {
			let facetGroupItems = filterDefinitions[groupKey].items;

			for(let k1 in facetGroupItems) {
				facetGroupItems[k1].enabled = false;
				for(let k2 in filterList) {
					if(facetGroupItems[k1].facetCode == filterList[k2]) {
						facetGroupItems[k1].enabled = true;
					}
					//manually disabling the ecocode_system filter here since it's part of the 2-stage ecocode filter
					if(facetGroupItems[k1].facetCode == "ecocode_system") {
						facetGroupItems[k1].enabled = false;
					}
					
				}
			}
		}
		return filterDefinitions;
	}
	
	/**
	 * Function: spawnFacet
	 * 
	 * This is a shorthand function for making and adding a facet.
	 */
	spawnFacet(facetId, selections = [], triggerResultLoad = true) {
		let found = false;
		this.facets.forEach((facet) => {
			if(facet.name == facetId) {
				found = true;
				console.log("Tried to spawn facet that already exists!");
			}
		});

		if(found) {
			return false;
		}

		if(triggerResultLoad) {
			this.sqs.resultManager.setResultDataFetchingSuspended(true);
		}
		let facetTemplate = this.getFacetTemplateByFacetId(facetId);
		let facet = this.makeNewFacet(facetTemplate);
		facet.setSelections(selections);
		this.addFacet(facet); //This will trigger a facet load request
		if(triggerResultLoad) {
			this.sqs.resultManager.getActiveModule().unrender();
			this.sqs.resultManager.fetchData();
			this.sqs.resultManager.setResultDataFetchingSuspended(false);
		}
		
		return facet;
	}

	reset() {
		//remove all facets
		this.sqs.resultManager.setResultDataFetchingSuspended(true);
		
		//this is a little silly, but we need to avoid manipulating the array we're iterating over so we make a copy
		let facetsToDestroy = [];

		this.facets.forEach((facet) => {
			facetsToDestroy.push(facet);
		});

		facetsToDestroy.forEach(facet => {
			facet.destroy();
		});

		this.sqs.resultManager.setResultDataFetchingSuspended(false);
	}

}

export { FacetManager as default }