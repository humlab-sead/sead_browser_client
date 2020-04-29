/*
Class: sqsMenu
Makes menus out of structures, good stuff.

Structure looks like this:

var menu = {
	title: "My Menu", //The name of the menu as it will be displayed in the UI
	layout: "horizontal", //"horizontal" or "vertical" - the flow director of the menu items
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
		this.menuItemsContainerSelector = this.menuDef.anchor+".sqs-menu-container";
		
		if(init) {
			this.renderMenuLabel(sqsMenuDef);
			this.renderMenu(sqsMenuDef);
			this.bindCallbacks(sqsMenuDef);
			this.registerTooltipBindings();
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
			$(".sqs-menu-title-container", this.menuDef.anchor).append("<div class='sqs-menu-title-subtext'>"+m.subText+"</div>");
		}
		
		if(typeof(m.callback) == "function") {
			$(".sqs-menu-title-container", this.menuDef.anchor).on("click", m.callback);
		}
	}
	
	/**
	* Function: renderMenu
	*
	*/
	renderMenu(m) {
		var sqsMenuContainerDisplay = "inline-block";
		var menuCategoryLevelClass = "l1-container-level l1-container-level-vertical";
		if(m.layout == "horizontal") {
			sqsMenuContainerDisplay = "flex";
			menuCategoryLevelClass = "l1-container-level l1-container-level-horizontal";
		}
		
		if(!m.visible) {
			sqsMenuContainerDisplay = "none";
		}

		$(m.anchor).addClass("sqs-menu-container").css("display", sqsMenuContainerDisplay);

		let menuFirstLevelList = $("<ul></ul>").addClass(menuCategoryLevelClass);
		$(this.menuItemsContainerSelector).append(menuFirstLevelList);

		var items = m.items;
		for(var key in items) {
			let l1Classes = "l1-container";
			if(typeof items[key].children != "undefined" && items[key].children.length > 0) {
				//Disable parent clickity-ness
				l1Classes += " l1-inactive";
			}

			var l1TitleClasses = "l1-title";
			if(typeof(m.style.l1TitleClass) != "undefined") {
				l1TitleClasses += " "+m.style.l1TitleClass;
			}

			let firstLevelListItem = $("<li></li>");
			firstLevelListItem.attr("id", "menu-item-"+items[key].name);
			firstLevelListItem.attr("name", items[key].name);
			firstLevelListItem.addClass(l1Classes);
			let span = $("<span></span>");
			span.addClass(l1TitleClasses);
			span.html(items[key].title);
			firstLevelListItem.append(span);
			menuFirstLevelList.append(firstLevelListItem);


			if(items[key].children.length > 0) {
				let menuSecondLevelList = $("<ul></ul>").attr("id", "menu-item-"+items[key].name).addClass("l2-level").css("border-left-color", "#000");

				for(var ck in items[key].children) {
					let secondLevelListItem = $("<li></li>").addClass("l2-title menu-btn").attr("id", "menu-item-"+items[key].children[ck].name).attr("name", items[key].children[ck].name).html(items[key].children[ck].title);
					menuSecondLevelList.append(secondLevelListItem);
				}
				
				firstLevelListItem.append(menuSecondLevelList);
			}
		}

		if(!m.collapsed) {
			var displayMode;
			if(m.layout == "horizontal") {
				displayMode = "inline-block";
			}
			else {
				displayMode = "flex";
			}
			
			$(this.menuItemsContainerSelector+" > .l1-container-level").css("display", displayMode);
		}


		this.bindMenuAnchor(m);

		$(m.anchor).on("mouseleave", () => {
			if(m.collapsed) {
				this.closeMenu(m);
			}
		});
		
		$(m.anchor+" .l1-container").on("click", (event) => { //replace this with mouseover if you like annoying menus
			//$(m.anchor+" .l2-level", event.currentTarget).show();
			$(".l2-level").hide();
			$(".l2-level", event.currentTarget).show();
		});
		
		for(var key in m.items) {
			if(m.items[key].staticSelection) {
				this.setSelected(m.items[key].name);
			}
		}

		let anchorWidth = $(m.anchor).width();
		$(m.anchor+" .l1-container-level-vertical").css("min-width", anchorWidth+"px");
	}


	bindMenuAnchor(m) {
		if(m.items.length > 0) {
			$(m.anchor+" > .sqs-menu-title-container").on("mouseover", () => {
				this.showMenu(m);
			});

			if(typeof m.auxTriggers != "undefined") {
				for(let key in m.auxTriggers) {
					$(m.auxTriggers[key].selector).on(m.auxTriggers[key].on, () => {
						this.showMenu(m);
					});
				}
			}
		}
	}

	showMenu(m) {
		$(".sqs-menu-title-container", m.anchor).addClass("sqs-menu-block-active");

		var displayMode = "flex";
		if(m.layout == "horizontal") {
			displayMode = "inline-block";
		}
		$(m.anchor+" .l1-container-level").css("display", displayMode);

		//Check if l1-container-level-vertical overflows viewport and if so, set it to: right: 0px; to make it bounce of the right edge
		let pos = $(m.anchor+" .l1-container-level").position();
		let width = $(m.anchor+" .l1-container-level").width();
		if(pos.left + width > $(window).width()) {
			$(m.anchor+" .l1-container-level").css("right", "0px");
		}
		
		$(m.anchor+" .l2-level").show();
		var menuHeight = $(m.anchor+" .l1-container-level").height();
		var viewportHeight = $(document).height();
		
		if(menuHeight > viewportHeight-100) {
			$(m.anchor+" .l2-level").hide();
		}
		else {
			$(m.anchor+" .l2-level").show();
		}
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
					this.sqs.tooltipManager.registerTooltip("#menu-item-" + this.menuDef.items[key].children[sk].name, this.menuDef.items[key].children[sk].tooltip, ttOptions);
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
	
	/*
	* Function: setSelected
	*
	*/
	setSelected(menuItemName) {
		for(var key in this.menuDef.items) {
			if(this.menuDef.items[key].name == menuItemName) {
				this.menuDef.items[key].staticSelection = true;
			}
			else {
				this.menuDef.items[key].staticSelection = false;
			}
		}
		
		this.updateRenderSelected();
	}
	
	/*
	* Function: updateRenderSelected
	*/
	updateRenderSelected() {
		for(var key in this.menuDef.items) {
			if(this.menuDef.items[key].staticSelection) {
				$("[name="+this.menuDef.items[key].name+"]", this.menuDef.anchor).addClass("sqs-menu-static-selection");
			}
			else {
				$("[name="+this.menuDef.items[key].name+"]", this.menuDef.anchor).removeClass("sqs-menu-static-selection");
			}
		}
	}
	
	/*
	* Function: bindCallbacks
	* You probably don't want to call this directly, it's mostly for internal use.
	*/
	bindCallbacks(menuDef) {
		
		for(var key in menuDef.items) {
			var item = menuDef.items[key];
			
			$("#menu-item-"+menuDef.items[key].name).on("click", null, menuDef.items[key], (evt) => {
				if(evt.data.children.length == 0 && evt.data.callback != null) {
					if(this.menuDef.staticSelection) {
						this.setSelected($(evt.currentTarget).attr("name"));
					}
					evt.data.callback();
					evt.stopPropagation();
				}
			});
			
			if(item.children.length > 0) {
				for(var ck in item.children) {
					$("#menu-item-"+item.children[ck].name).on("click", null, this.menuDef.items[key].children[ck], (evt) => {
						if(evt.data.callback != null) {
							evt.data.callback(evt.data);
							$(menuDef.anchor+" .l1-container-level-vertical").hide();
						}
						else {
							console.log("WARN: Menu event fired without having an attached callback.")
						}
						evt.stopPropagation();
					});
				}
			}
			
		}
		
		if(typeof menuDef.viewPortResizeCallback != "undefined") {
			this.sqs.sqsEventListen("layoutResize", menuDef.viewPortResizeCallback);
		}
		
		
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

		if(typeof(menuDef) == "undefined") {
			return false;
		}
		if(typeof(menuDef.title) == "undefined") {
			menuDef.title = "";
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
}

export { sqsMenu as default }