/*
* Class: sqsLayoutManager
* This class is responsible for adapting the user interface to various devices and their capabilities, primarily in terms of screen space.
* It relies on the Enquire js lib which in turn relies on CSS3 media queries.
*
* Important: This class has some severe limitations:
* 1. It only handles a 2-pane left/right layout
* 2. It only handles a single page/view - meaning the Filter/result view and the site repots each have their own separate LayoutManagers
*
* Assumed entities:
* .section-toggle-button
* .section-right
* .section-left
* ...and more?
*/
//import Config from "../config/config";
import SqsView from "./SqsView.class";
import enquire from 'enquire.js'

class sqsLayoutManager {

	constructor(sqs) {
		this.sqs = sqs;

		//Set default mode based on current viewport width
		if($(window).width() < Config.screenMobileWidthBreakPoint) {
			this.mode = "mobileMode";
		}
		else {
			this.mode = "desktopMode";
		}

		this.views = [];

		this.mobileBreakpointMediaQuery = "screen and (max-width:"+Config.screenMobileWidthBreakPoint+"px)";
		enquire.register(this.mobileBreakpointMediaQuery, {
			match : () => {
				this.setMode("mobileMode");
				let activeView = this.getActiveView();
				if(activeView !== false) {
					activeView.apply();
				}
			},
			unmatch : () => {
				this.setMode("desktopMode");
				let activeView = this.getActiveView();
				if(activeView !== false) {
					activeView.apply();
				}
			}
		});
	}

	createView(anchor, name, leftSize = 70, rightSize = 30, options = {}) {
		let v = new SqsView(this, anchor, name, leftSize, rightSize, options);
		this.views.push(v);
	}

	setActiveView(viewName) {
		console.log("Activated view:", viewName);
		/*
		if(false) {
			var stateObj = {};
			history.pushState(stateObj, "", "/site/"+siteId);
		}
		*/

		let oldView = this.getActiveView();
		if(oldView !== false) {
			oldView.cleanup();
			oldView.setActive(false);
		}

		let newView = this.getViewByName(viewName);
		if(newView !== false) {
			newView.setActive(true);
			newView.apply();
		}
	}

	getActiveView() {
		for(let key in this.views) {
			if(this.views[key].active) {
				return this.views[key];
			}
		}
		return false;
	}

	getViewByName(viewName) {
		for(let key in this.views) {
			if(this.views[key].name == viewName) {
				return this.views[key];
			}
		}
		return false;
	}

	getMode() {
		return this.mode;
	}

	setMode(mode) {
		this.sqs.sqsEventDispatch("layoutSwitchMode", { mode: this.mode });
		this.mode = mode;
	}


}

export { sqsLayoutManager as default }
