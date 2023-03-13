import 'notifyjs-browser/dist/styles/metro/notify-metro.css';
import 'notifyjs-browser/dist/styles/metro/notify-metro.js';

/*
* Class: HelpAgent
*/
class HelpAgent {
	/*
	* Function: constructor
	*/
	constructor() {
		this.active = false;
		this.msgs = [];

	  	$(window).on("seadHelpStateClicked", (event) => {

	  		if(this.active) {
				this.setState(false);
				$("#menu-help-state-indicator").effect("highlight", {"color": "#fff"}).text("OFF");
			}
			else {
				this.setState(true);
				$("#menu-help-state-indicator").effect("highlight", {"color": "#fff"}).text("ON");
			}

	  	});
	}

	/*
	* Function: registerDefaultHelp
	* Registers some basic/default help popups for various sections.
	*/
	registerDefaultHelp() {
		this.sqs.tooltipManager.registerTooltip("#facet-menu-label", "SEAD contains a vast dataset, in order to view the data you need to filter it into a subsection. Choose your filters here.");
		this.sqs.tooltipManager.registerTooltip("#result-menu-label", "This lets you choose how to present the filtered subset of data. Result will be shown in the right section.");
		this.sqs.tooltipManager.registerTooltip("#result-container", "Here your filtered subset of data will be presented in the way you have choosen in the view menu.\nYou need to have activated at least one filter before anything will be shown here.\nAdd a filter via the filter menu on the top left and make a selection in the filter.");
	}

	/*
	* Function: setState
	* Sets help on/off.
	*/
	setState(on) {
		if(on) {
			$(".help-icon").css("display", "inline-block");
			this.active = true;
			this.bind();
		}
		else {
			$(".help-icon").css("display", "none");
			this.active = false;
			this.unbind();
		}
	}

	/*
	* Function: bind
	* Binds all the registered help items to their DOM elements.
	*/
	bind() {
		for(var key in this.msgs) {
			$(this.msgs[key].key).on("mouseover", this.msgs[key].callback);
			$(this.msgs[key].key).on("mouseout", () =>  {
				$(".notifyjs-bootstrap-base").hide();
				$(".notifyjs-arrow").hide();
			});
		}
	}

	/*
	* Function: unbind
	* Unbinds all the registered help items from their DOM elements.
	*/
	unbind() {
		for(var key in this.msgs) {
			$(this.msgs[key].key).off("mouseover", null, this.msgs[key].callback);
		}
	}
	
	
	/*
	* Function: sqsMenu
	*/
	sqsMenu() {
		return {
			title: "Help",
			layout: "vertical",
			collapsed: true,
			anchor: "#help-menu",
			triggers: [],
			weight: -1,
			items: [
				/*
				{
					name: "help",
					title: "Help : <span id='menu-help-state-indicator'>ON</span>",
					callback: () => {
						$.event.trigger("seadHelpStateClicked", {});
					}
				}
				*/
			]
		};
	}
}

export { HelpAgent as default }