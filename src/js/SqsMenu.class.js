/*
Class: sqsMenu
Makes menus out of structures, good stuff.

Structure looks like this:

var menu = {
	title: "My Menu", //The name of the menu as it will be displayed in the UI
	triggers: [{  //The triggers which should trigger this menu. Usually just one but can be multiple.
		selector: "#selector",
		on: "click"
	}],
	layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
	collapsed: false, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
	anchor: "#help-menu", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
	staticSelection: false, //whether a selected item remains highlighted or not, purely visual
	visible: true, //show this menu by default
	items: [ //The menu items contained in this menu
		{
			name: "help", //identifier of this item, should be unique within this menu
			title: "Help : <span class='menu-state-indicator'>OFF</span>", //displayed in the UI
			tooltip: "",
			staticSelection: false, //For tabs - highlighting the currently selected
			callback: () => { //This function gets called when this item is clicked on
				$.event.trigger("seadHelpStateClicked", {});
			}
		},
		{
			name: "save",
			title: "Save viewstate",
			tooltip: "",
			callback: (menuItem) => {
				$.event.trigger("seadSaveStateClicked", {});
			}
		},
		{
			name: "load",
			title: "Load viewstate",
			tooltip: "",
			callback: (menuItem) => {
				$.event.trigger("seadLoadStateClicked", {});
			}
		},
		{
			name: "other",
			title: "Other options",
			children: [ //This is a menu item which itself contains a sub-menu. Note that this does not have a callback, it expands the children when activated.
				{
					name: "compute",
					title: "Compute stuff",
					tooltip: "",
					callback: (menuItem) => {
						//Calling the proper function here
					}
				},
				{
					name: "erase",
					title: "Erase stuff",
					tooltip: "",
					callback: (menuItem) => {
						//Calling the proper function here
					}
				}
			]
		}
	]
};
*/

class sqsMenu {
	/*
	* Function: constructor
	*
	* Parameters:
	* sqsMenuDef - JSON-structure defining the menu to be generated.
	*/
	constructor(sqs, sqsMenuDef, init = true) {
		this.sqs = sqs;
		sqsMenuDef = this.normalizeMenuDef(sqsMenuDef);
		this.id = sqsMenuDef.anchor;
		this.menuDef = sqsMenuDef;
		this.screenSmallWidthBreakPoint = 1020;
		this.screenLargeWidthBreakPoint = 2000;
		this.closeTimerInterval = null;
		this.menuItemsContainerSelector = this.menuDef.anchor;
		//this.menuItemsContainerSelector = this.menuDef.anchor+".sqs-menu-container";
		
		this.menuDef.secondLevelCollapsed = true;

		
		if(init) {
			this.buildMenu(this.menuDef);
			/*
			if(this.menuDef.customLabel !== true) {
				this.renderMenuLabel(this.menuDef);
			}
			this.renderMenu(this.menuDef);
			this.bindCallbacks(this.menuDef);
			
			*/
			this.registerTooltipBindings();

			if(typeof this.menuDef.viewPortResizeCallback == "function") {
				setTimeout(() => {
					this.menuDef.viewPortResizeCallback();
				}, 500);
			}
		}
	}
	
	/*
	* Function: renderMenuLabel
	*/
	renderMenuLabel(m) {
		var classes = "sqs-menu-title-container";
		
		if(typeof m.customStyleClasses != "undefined") {
			classes += " "+m.customStyleClasses;
		}
		
		if(m.layout == "horizontal") {
			classes += " sqs-menu-block-horizontal";
		}
		else {
			classes += " sqs-menu-block-vertical";
		}
		if(!m.collapsed) {
			classes += " sqs-menu-block-expanded";
		}

		$(this.menuDef.anchor).html("");
		if(m.showMenuTitle) {
			if(typeof(m.style.menuTitleClass) != "undefined") {
				classes += " "+m.style.menuTitleClass;
			}
			$(this.menuDef.anchor).append("<div class='"+classes+"'><div class='sqs-menu-title'>"+this.menuDef.title+"</div></div>");
		}
		
		if(typeof m.subText != "undefined") {
			$(".sqs-menu-title-container", this.menuDef.anchor).append("<div style="+m.subTextContainerStyle+" class='sqs-menu-title-subtext'>"+m.subText+"</div>");
		}
		
		if(typeof(m.callback) == "function") {
			$(".sqs-menu-title-container", this.menuDef.anchor).on("click", m.callback);
		}
	}

	setSelected(itemName) {
		let selectedNum = 0;
		this.menuDef.items.forEach(item => {
			if(item.name == itemName) {
				item.selected = true;
				selectedNum++;
			}
			else {
				item.selected = false;
			}
			item.children.forEach(child => {
				if(child.name == itemName) {
					child.selected = true;
					selectedNum++;
				}
				else {
					child.selected = false;
				}
			});
		});

		if(selectedNum == 0) {
			console.warn("Nothing was selected.");
		}
		if(selectedNum > 1) {
			console.warn("Multiple menu items were selected.");
		}

		if(this.menuDef.staticSelection) {
			let menuAnchorNode = $(this.menuDef.anchor);
			$(".first-level-item", menuAnchorNode).removeClass("sqs-menu-selected");
			$(".second-level-item", menuAnchorNode).removeClass("sqs-menu-selected");
			$("[menu-item='"+itemName+"']", menuAnchorNode).addClass("sqs-menu-selected");
		}
		
		//this.menuDef.triggers

		$("#domain-menu")[0].dispatchEvent(new CustomEvent("selectionchange"));
	}
	
	buildMenu(menu) {
		let menuAnchorNode = $(menu.anchor);
		menuAnchorNode.html("");
		menuAnchorNode.addClass("sqs-menu-container");
		if(menu.layout == "horizontal") {
			menuAnchorNode.addClass("sqs-menu-container-horizontal");
		}

		//first level items
		menu.items.forEach(item => {
			let firstLevelItem = $("<div menu-item='"+item.name+"'><div class='first-level-item-title'>"+item.title+"</div></div>");
			firstLevelItem.addClass("first-level-item");

			if(menu.layout == "horizontal") {
				firstLevelItem.addClass("first-level-item-horizontal");
				//$(".sqs-menu-container")
				menuAnchorNode.css("display", "block");
			}

			//second level items (if any)
			item.children.forEach(child => {
				let childItem = $("<div menu-item='"+child.name+"'>"+child.title+"</div>");
				childItem.addClass("second-level-item");
				firstLevelItem.append(childItem);

				childItem.on("click", (evt) => {
					if(child.callback) {
						evt.stopPropagation();
						$(".sqs-menu-container").hide();
						child.callback();
					}
				})
			});

			//bind first level items
			firstLevelItem.on("click", (evt) => {
				evt.stopPropagation();
				if(item.callback) {
					if(menu.layout == "vertical") {
						menuAnchorNode.css("display", "none");
					}
					this.setSelected(item.name);
					item.callback();
				}
				
				$(".first-level-item", menuAnchorNode).removeClass("first-level-item-expanded");
				$(".second-level-item", menuAnchorNode).css("display", "none");

				//This just sets the lighter background color for expanded items
				if(firstLevelItem.hasClass("first-level-item-expanded")) {
					firstLevelItem.removeClass("first-level-item-expanded");
				}
				else {
					firstLevelItem.addClass("first-level-item-expanded");
				}

				//This "expands" (displays) all of the children items
				$(".second-level-item", firstLevelItem).css("display", "block");

				this.adaptMenuToViewport();
			});
			
			if(item.selected) {
				firstLevelItem.addClass("sqs-menu-selected");
			}

			$(menu.anchor).append(firstLevelItem);
		});

		this.rebindTriggers();

		//This is a very generic callback system where each menu can register any number of callback events
		//the events can be any type of DOM events and the functions executed are also entirely up to the menu to define
		//it is used for hover effect by the domain/filter-menus
		menu.callbacks.forEach(callback => {
			$(callback.selector).off(callback.on);
			$(callback.selector).on(callback.on, callback.callback);
		});

		$("body").on("click", (evt) => {
			if(this.sqs.tutorial.isRunning()) {
				//if tutorial is active, ignore body clicks
				return;
			}
			evt.stopImmediatePropagation();
			this.closeAllMenus();
		})

		this.sqs.sqsEventListen("layoutResize", (evt) => {
			if(typeof this.menuDef.viewPortResizeCallback == "function") {
				this.menuDef.viewPortResizeCallback();
			}
			
			this.adaptMenuToViewport();
		});
	}

	isBottomOutOfViewport() {
		const element = document.querySelector(this.menuDef.anchor);
		const rect = element.getBoundingClientRect();
		const windowHeight = (window.innerHeight || document.documentElement.clientHeight);

		// Check if the bottom of the element is beyond the vertical limit of the viewport
		return rect.bottom > windowHeight;
	}

	adaptMenuToViewport() {
		$(this.menuDef.anchor).css("max-height", "");
		if(this.isBottomOutOfViewport()) {
			//calculate the max height of the menu based on the current position, height and viewport height
			let menuTop = $(this.menuDef.anchor).offset().top;
			let windowHeight = $(window).height();
			let newMaxHeight = windowHeight - menuTop - 0;
			$(this.menuDef.anchor).css("max-height", newMaxHeight+"px");
		}
	}

	closeAllMenus() {
		$(".sqs-menu-container").each((i, el) => {
			if($(el).hasClass("sqs-menu-container-horizontal") == false) {
				$(el).hide();
			}
		})
	}

	
	/*
	* Function: registerTooltipBindings
	*/
	registerTooltipBindings() {
		var ttOptions = {
			placement: "right"
		};
		for(let key in this.menuDef.items) {
			for (var sk in this.menuDef.items[key].children) {
				if(this.menuDef.items[key].children[sk].tooltip != "") {
					this.sqs.tooltipManager.registerTooltip("[menu-item='"+this.menuDef.items[key].children[sk].name+"']", this.menuDef.items[key].children[sk].tooltip, ttOptions);
				}
			}
		}
	}
	
	/*
	* Function: closeMenu
	*/
	closeMenu(m) {
		$(m.anchor+" .l1-container-level").css("display", "none");
		$(".sqs-menu-title-container", m.anchor).removeClass("sqs-menu-block-active");
		//$(this.menuItemsContainerSelector).hide();
		$(m.anchor+" .l1-container-level").css("right", "auto");
	}
	
	unrender() {
		$(this.menuDef.anchor).html("");
	}
	
	/*
	* Function: normalizeMenuDef
	*
	* This just creates some default values for things which might have been omitted in the definition. Just to make the structure more consistent and easier to traverse.
	*
	* Parameters:
	* menuDef - JSON-structure defining the menu to be generated.
	*/
	normalizeMenuDef(menuDef) {

		if(typeof menuDef.anchorTriggerEvent == "undefined") {
			menuDef.anchorTriggerEvent = "mouseover";
		}
		if(typeof(menuDef) == "undefined") {
			return false;
		}
		if(typeof(menuDef.title) == "undefined") {
			menuDef.title = "";
		}
		if(typeof(menuDef.triggers) == "undefined") {
			menuDef.triggers = [];
		}
		if(typeof(menuDef.anchor) == "undefined") {
			menuDef.anchor = "";
		}
		if(typeof(menuDef.layout) == "undefined") {
			menuDef.layout = "vertical";
		}
		if(typeof(menuDef.title) == "undefined") {
			menuDef.collapsed = true;
		}
		if(typeof(menuDef.staticSelection) == "undefined") {
			menuDef.staticSelection = false;
		}
		if(typeof(menuDef.visible) == "undefined") {
			menuDef.visible = true;
		}
		if(typeof(menuDef.showMenuTitle) == "undefined") {
			menuDef.showMenuTitle = true;
		}
		if(typeof(menuDef.style) == "undefined") {
			menuDef.style = {};
		}
		if(typeof(menuDef.items) == "undefined") {
			menuDef.items = [];
		}
		if(typeof(menuDef.callbacks) == "undefined") {
			menuDef.callbacks = [];
		}
		
		for(var key in menuDef.items) {
			if(typeof(menuDef.items[key].children) == "undefined") {
				menuDef.items[key].children = [];
			}
			else {
				for(var ck in menuDef.items[key].children) {
					if(typeof(menuDef.items[key].children[ck].callback) == "undefined") {
						menuDef.items[key].children[ck].callback = null;
					}
					if(typeof(menuDef.items[key].children[ck].staticSelection) == "undefined") {
						menuDef.items[key].children[ck].staticSelection = false;
					}
				}
			}
			if(typeof(menuDef.items[key].callback) == "undefined") {
				menuDef.items[key].callback = null;
			}
			if(typeof(menuDef.items[key].staticSelection) == "undefined") {
				menuDef.items[key].staticSelection = false;
			}
		}
		
		return menuDef;
	}

	rebindTriggers() {
		let menuAnchorNode = $(this.menuDef.anchor);

		this.menuDef.triggers.forEach(trigger => {
			$(trigger.selector).off(trigger.on); //turn the trigger OFF to begin with, just to make sure it doesn't get double-registrered
			$(trigger.selector).on(trigger.on, (evt) => {
				this.closeAllMenus(); //this is to prevent multiple menus being open at once

				evt.stopPropagation(); //To prevent the event reaching the body, which could cause an immediate close of the menu
				if(menuAnchorNode.css("display") == "none") {
					menuAnchorNode.css("display", "block");
				}
				else {
					menuAnchorNode.css("display", "none");
				}
			});
		});
	}

	reset() {
		this.closeAllMenus();
		this.menuDef.items.forEach(item => {
			item.selected = false;
			item.children.forEach(child => {
				child.selected = false;
			});
		});

		//remove the class sqs-menu-block-expanded from all menu items
		$(".first-level-item", this.menuDef.anchor).removeClass("first-level-item-expanded");
		$(".second-level-item", this.menuDef.anchor).css("display", "none");
	}
}

export { sqsMenu as default }