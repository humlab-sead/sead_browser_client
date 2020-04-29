import sqsMenu from './sqsMenu.class.js'

/*
* Class: sqsMenuManager
*/
class sqsMenuManager {
	/*
	* Function: constructor
	*/
	constructor(sqs) {
		this.sqs = sqs;
		this.menus = [];
		
		$(window).on("seadStatePostLoad", (event, data) => {
			var menu = this.getMenuByAnchor("#result-menu");
			menu.setSelected(data.state.result.module);
		});
		
		$("#dev-notice").on("click", () => {
			$("#dev-notice").slideUp(500);
		});
	}
	/*
	* Function: getMenuByAnchor
	*/
	getMenuByAnchor(anchor) {
		for(var key in this.menus) {
			if(this.menus[key].id == anchor) {
				return this.menus[key];
			}
		}
		return false;
	}
	
	/*
	* Function: createMenu
	*
	* Creates and renders an sqsMenu given a sqsMenu definition.
	*
	*/
	createMenu(menuDef) {
		
		if(typeof(menuDef.title) == "undefined") {
			menuDef.title = "NONAME";
		}
		if(typeof(menuDef.layout) == "undefined") {
			menuDef.layout = "vertical";
		}
		if(typeof(menuDef.collapsed) == "undefined") {
			menuDef.collapsed = true;
		}
		if(typeof(menuDef.weight) == "undefined") {
			menuDef.weight = 0;
		}
		if(typeof(menuDef.anchor) == "undefined") {
			menuDef.anchor = "";
			console.log("WARN: Anchor attribute empty when creating menu, this is not allowed!");
		}
		var menu = new sqsMenu(this.sqs, menuDef);
		this.menus.push(menu);
		return menu;
	}
	
	removeMenu(menu) {
		for(var key in this.menus) {
			if(this.menus[key] == menu) {
				this.menus[key].unrender();
				this.menus.splice(key, 1);
				return;
			}
		}
	}
	
	/*
	* Function: closeAllMenus
	*/
	closeAllMenus() {
		for(var key in this.menus) {
			this.menus[key].closeMenu();
		}
	}
	
	/*
	* Function: closeAllMenusExcept
	*/
	closeAllMenusExcept(exceptMenuWithAnchor) {
		for(var key in this.menus) {
			if(this.menus[key].anchor != exceptMenuWithAnchor) {
				this.menus[key].closeMenu();
			}
		}
	}
	
	/*
	* Function: combineMenus
	*
	* This function will merge several sqsMenu-definitions into a single menu. Useful for when you want to let each module define its own menu items, but you want to combine menu items from several modules in the same menu.
	*
	* Parameters:
	* masterMenu - The master menu. Needs to contain at least the attributes title and anchor, according to the sqsMenu spec.
	* menus - Array of menus according to the sqsMenu spec. The items-section from these will be merged into the master menu, other attributes such as title of the menu will be ignored.
	*
	* Return:
	* A new sqsMenu containing all the items.
	*/
	combineMenus(masterMenu, menus) {
		if(typeof(masterMenu.items) == "undefined") {
			masterMenu.items = [];
		}
		
		for(var key in menus) {
			if(typeof(menus[key].weight) == "undefined") {
				menus[key].weight = 0;
			}
		}
		
		menus.sort((a, b) => {
			if(a.weight > b.weight) {
				return 1;
			}
			else {
				return -1;
			}
		});
		
		for(var key in menus) {
			masterMenu.items = masterMenu.items.concat(menus[key].items);
		}
		
		return masterMenu;
	}


	/*
	* Function: rebind
	* 
	* Rebinds the triggers to the menu anchors. In case the anchors were previously removed and re-added, this needs to be called.
	*/
	rebind(menuDef) {
		let m = new  sqsMenu(this.sqs, menuDef, false);
		m.bindMenuAnchor(m.menuDef);
	}
}

export { sqsMenuManager as default }