//import Config from "../config/config.js";

/*
* Class: MainMenu
*/
class MainMenu {
	/*
	* Function: constructor
	*/
	constructor() {
		this.bindSettingsButton();
		this.bindStateButton();
		//this.bindAboutButton();
	}
	
	/*
	* Function: bindSettingsButton
	*/
	bindSettingsButton() {
		$("#settings-btn").bind("click", function() {
			console.log("fetch-state");
			window.sead.stateManager.fetchState();
		});
	}
	
	/*
	* Function: bindStateButton
	*/
	bindStateButton() {
		$("#state-btn").bind("click", function() {
			window.sead.stateManager.sendState();
		});
	}
	
	/*
	* Function: bindAboutButton
	*/
	bindAboutButton() {
		/*
		$("#about-btn").bind("click", () => {
			event.stopPropagation(); //To prevent immediate closing of the dialog
			console.log("about", Config);
			$("#data-license-section").html(Config.dataLicense.name);
			window.sead.dialogManager.renderDialog("#about-section");
		});

		$(".overlay-dialog").bind("click", () => {
			event.stopPropagation(); //To prevent closing of the dialog when clicked inside it
		});
		*/
	}
	
	/*
	* Function: bindHelpButton
	*/
	bindHelpButton() {
		$("#help-menu-label").bind("click", () => {
			event.stopPropagation(); //To prevent immediate closing of the dialog
			window.sead.dialogManager.renderDialog("#help-section");
		});

		$(".overlay-dialog").bind("click", () => {
			event.stopPropagation(); //To prevent closing of the dialog when clicked inside it
		});
		
	}


}


export { MainMenu as default }