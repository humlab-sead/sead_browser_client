import Config from '../config/config.js';
import shortid from 'shortid'
import _ from 'underscore';

/* 
Class: StateManager
StateManager handles saving and loading of states. A state is basically a "savegame". It records the current facets used, their positions, selections and all other relevent data for restoring a certain viewstate at a later time.
*/
class StateManager {
	/*
	* Function: constructor
	*
	* Config param: requireLoginForViewstateStorage
	*/
	constructor(sqs) {
		this.sqs = sqs;
		
		$(window).on("seadSaveStateClicked", (event, data) => {
			this.renderSaveViewstateDialog();
		});

		$(window).on("seadLoadStateClicked", (event, data) => {
			this.renderLoadViewstateDialog();
			this.updateLoadStateDialog();
		});
		
		this.sqs.sqsEventListen("userLoggedIn", () => {
			this.updateLoadStateDialog();
		});

		this.sqs.sqsEventListen("userLoggedOut", () => {
			this.updateLoadStateDialog();
		});

	}

	renderSaveViewstateDialog() {
		//let content = $("#templates > #viewstate-save-dialog").html();
		let content = $("#templates > #viewstate-save-dialog")[0].cloneNode(true);
		this.sqs.dialogManager.showPopOver("Save viewstate", content.outerHTML);



		/*
		var content = $("#viewstate-save-dialog > .overlay-dialog-content").html();
		this.sqs.dialogManager.showPopOver("Save viewstate", content);
		*/
		$("#viewstate-save-btn").on("click", () => {
			let state = this.saveState();
			this.sendState(state).then(() => {
				this.sqs.dialogManager.hidePopOver();
				var content = $("#viewstate-post-save-dialog .overlay-dialog-content");
				$("#viewstate-url", content).html("<a href='"+Config.serverRoot+"/viewstate/"+state.id+"'>"+Config.serverRoot+"/viewstate/"+state.id+"</a>");
				$("#viewstate-key", content).html(state.id);
				this.sqs.dialogManager.showPopOver("Viewstate saved", content.html());
			});
		});
		
	}

	renderLoadViewstateDialog() {
		var content = $("#viewstate-load-dialog > .overlay-dialog-content").html();
		this.sqs.dialogManager.showPopOver("Load viewstate", content);
	}

	/*
	* Function: getViewstateIdFromUrl
	* 
	* Returns:
	* A viewstate ID if the URL contains one, otherwise false.
	*/
	getViewstateIdFromUrl() {
		var viewstate = false;
		var urlPath = window.location.pathname.split("/");
		if(urlPath[1] == "viewstate" && typeof(urlPath[2]) != "undefined") {
			viewstate = urlPath[2];
		}
		return viewstate;
	}

	/*
	* Function: getStateById
	* 
	* Parameters:
	* stateId - The state ID.
	* 
	* Returns:
	* A state object.
	*/
	getStateById(stateId) {
		var state = window.localStorage["viewstate-"+stateId];
		if(typeof(state) == "undefined") {
			return false;
		}
		return JSON.parse(state);
	}

	/*
	* Function: formatTimestampToDateString
	* 
	* Parameters:
	* ts - The unix timestamp.
	* 
	* Returns:
	* A string like this: YYYY-MM-DD HH:II
	*/
	formatTimestampToDateString(ts) {
		var d = new Date(ts);

		var month = d.getMonth()+1;
		if(month.toString().length == 1) { month = "0"+month }

		var day = d.getDate();
		if(day.toString().length == 1) { day = "0"+day; }

		var hours = d.getHours();
		if(hours.toString().length == 1) { hours = "0"+hours; }

		var minutes = d.getMinutes();
		if(minutes.toString().length == 1) { minutes = "0"+minutes; }

		var dateString = d.getFullYear()+"-"+month+"-"+day+" "+hours+":"+minutes;

		return dateString;
	}
	
	makeListUniqueByProperty(list, prop) {
		for(let i1 = list.length-1; i1 > -1; i1--) {
			for(let i2 = list.length-1; i2 > -1; i2--) {
				if(typeof list[i1] != "undefined" && typeof list[i2] != "undefined") {
					if(list[i1] !== list[i2] && list[i1][prop] == list[i2][prop]) {
						list.splice(i1, 1);
					}
				}
			}
		}
		return list;
	}

	getLocallyStoredViewstates() {
		let viewstates = [];
		Object.keys(window.localStorage).forEach((key) => {
			if(key.includes("viewstate-")) {
				var state = JSON.parse(window.localStorage[key]);
				state.origin = "browser";
				viewstates.push(state);
			}
		});

		return viewstates;
	}

	/*
	* Function: refreshLoadStateDialog
	* Updates the viewstates which are selectable in the load viewstate dialog. 
	*/
	updateLoadStateDialog() {
		$("#viewstate-load-list").html("");
		let viewstates = [];

		if(!Config.requireLoginForViewstateStorage) {
			viewstates = getLocallyStoredViewstates();
		}

		//viewstates = this.makeListUniqueByProperty(viewstates, "id");


		//If user is logged in, fetch viewstates from server
		if(typeof this.sqs.userManager != "undefined" && this.sqs.userManager.user != null) {

			$.ajax(this.sqs.config.viewStateServerAddress+"/viewstates/"+this.sqs.userManager.user.id_token, {
				method: "get",
				success: (viewstates) => {
					if(!Config.requireLoginForViewstateStorage) {
						viewstates = viewstates.concat(serverViewstates);
						viewstates = this.makeListUniqueByProperty(viewstates, "id");
					}

					this.sortViewstates(viewstates);
					this.renderViewStates(viewstates);
				},
				error: () => {
					console.error("ERROR: Could not load list of viewstates");
					$("#viewstate-load-list").html("ERROR: Could not load list of viewstates");
				}
			});
		}
		else {
			this.sortViewstates(viewstates);
			this.renderViewStates(viewstates);
		}
	}

	sortViewstates(viewstates) {
		return viewstates.sort((a, b) => {
			return parseInt(a.saved) < parseInt(b.saved) ? 1 : -1
		});
	}

	renderViewStates(viewstates) {
		$("#viewstate-load-list").html("");
		let header = "<div class='viewstate-load-item-header'><div>ID</div><div>Name</div><div>Created</div><div>Version</div><div id='vs-del-header'>Del</div></div>";
		$("#viewstate-load-list").append(header);

		viewstates.map((state) => {
			let oldApiWarn = "";
			if(typeof state.apiVersion == "undefined") {
				state.apiVersion = "Unknown";
			}
			if(state.apiVersion != this.sqs.apiVersion) {
				oldApiWarn = "<i class=\"fa fa-exclamation-triangle old-viewstate-api-warning\" aria-hidden=\"true\"></i>";
			}
			var dateString = this.formatTimestampToDateString(state.saved);

			let vsRow = $("<div id='vs-"+state.id+"' class='viewstate-load-item'></div>");
			vsRow.append("<div class='vs-id' vsid='"+state.id+"'>"+state.id+"</div>");
			vsRow.append("<div>"+state.name+"</div>");
			vsRow.append("<div>"+dateString+"</div>");
			vsRow.append("<div>"+oldApiWarn+" "+state.apiVersion+"</div>");
			vsRow.append("<div><i class='fa fa-trash viewstate-delete-btn' aria-hidden='true'></i></div>");

			$("#viewstate-load-list").append(vsRow);

			this.sqs.tooltipManager.registerTooltip("#vs-"+state.id+" .old-viewstate-api-warning", "This viewstate was created using an older version of the SEAD browser and thus may not produce the same result in the current version.");
		});

		this.sqs.tooltipManager.registerTooltip("#vs-del-header", "Deleting a viewstate will only remove it from your personal list. The viewstate will always be accessible via the correct link.", {drawSymbol: true});

		$(".viewstate-delete-btn").on("click", (evt) => {
			evt.stopPropagation();
			let el = $(evt.currentTarget).parent().parent();
			el.css("background-color", "red");
			//el.slideUp(500);
			let viewstateId = $(".vs-id", el).text();
			this.deleteViewstate(viewstateId);
		});

		$(".viewstate-load-item").on("click", evt => {
			const vsId = $(".vs-id", evt.currentTarget).text();
			this.fetchState(vsId);
			this.sqs.dialogManager.hidePopOver();
		});
	}

	deleteViewstate(viewstateId) {
		$.ajax(this.sqs.config.viewStateServerAddress+"/viewstate/"+viewstateId+"/"+this.sqs.userManager.user.id_token, {
			method: "delete",
			success: () => {
				$(".viewstate-load-item > .vs-id[vsid='"+viewstateId+"']").parent().slideUp(500);
			}
		});
	}

	/*
	* Function: fetchState
	* Fetches and then loads the given viewstate.
	* 
	* Parameters:
	* stateId - The viewstate ID.
	*
	*/
	fetchState(stateId) {
		//var address = Config.serverAddress;
		$.ajax(Config.viewStateServerAddress+"/viewstate/"+stateId, {
			method: "GET",
			dataType: "json",
			error: function(jqXHR, textStatus, errorThrown) {
			},
			success: (data, textStatus, jqXHR) => {
				var state = data[0];
				
				if(state === null) {
					console.log("Failed to load viewstate "+stateId);
					$.notify("Failed to load viewstate "+stateId, "error");
					
					$.event.trigger("seadStateLoadFailed", {
						state: state
					});
				}
				else {
					this.loadState(state);
				}
			}
		});

	}

	/*
	* Function: sendState
	* Sends/stores/saves the current view as a viewstate (compiles it and uploads it to the server).
	* 
	* Returns:
	* The saved state object.
	*/
	async sendState(state) {

		if(this.sqs.userManager.user == null) {
			return;
		}

		var upload = {
			"key": state.id,
			"user_id_token": this.sqs.userManager.user.id_token,
			"data": JSON.stringify(state)
		};

		upload = JSON.stringify(upload);
		//var address = Config.serverAddress;
		var address = Config.viewStateServerAddress;
		$.ajax(address+"/viewstate", {
			method: "POST",
			processData: true,
			data: upload,
			dataType: "json",
			
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			
			crossDomain: true,
			error: function(jqXHR, textStatus, errorThrown) {
				console.log(jqXHR, textStatus, errorThrown);
			},
			success: (data, textStatus, jqXHR) => {
				/*
				this.sqs.dialogManager.hidePopOver();
				var content = $("#viewstate-post-save-dialog .overlay-dialog-content");
				$("#viewstate-url", content).html("<a href='"+Config.serverRoot+"/viewstate/"+state.id+"'>"+Config.serverRoot+"/viewstate/"+state.id+"</a>");
				$("#viewstate-key", content).html(state.id);
				this.sqs.dialogManager.showPopOver("Viewstate saved", content.html());
				*/
			}
		});
		
		
		return state;
	}


	/*
	* Function: saveState
	* Compiles the current view into a viewstate. Does not send it to the server. Normally this is used inside sendState and not directly by itself.
	* 
	* Returns:
	* The state object.
	*/
	saveState() {
		var name = $("#viewstate-save-input").val();

		if(name.length == 0) {
			name = "Unnamed";
		}

		var stateId = shortid.generate();

		var state = {
			id: stateId,
			name: name,
			apiVersion: this.sqs.apiVersion,
			saved: Date.now(),
			layout: {
				left: this.sqs.layoutManager.leftLastSize
			},
			facets: this.sqs.facetManager.getFacetState(),
			result: this.sqs.resultManager.getResultState(),
			siteReport: this.sqs.siteReportManager.getReportState(),
			domain: this.sqs.domainManager.getActiveDomain().name
		};

		if(state.facets === false) {
			console.log("Couldn't save facet state");
			this.saveStateError();
			return false;
		}
		if(state.result === false) {
			console.log("Couldn't save result state");
			this.saveStateError();
			return false;
		}
		if(state.siteReport === false) {
			console.log("Couldn't save site-report state");
			this.saveStateError();
			return false;
		}

		window.localStorage.setItem("viewstate-"+stateId, JSON.stringify(state));

		window.history.pushState(state,
			"SEAD",
			"/viewstate/"+stateId);

		this.updateLoadStateDialog();
		return state;
	}

	saveStateError() {
		$("#viewstate-save-btn").effect("shake");
	}

	/*
	* Function: loadStateById
	* Fetches and loads a state.
	* 
	* Parameters:
	*/
	loadStateById(stateId) {
		if(Config.viewstateLoadingScreenEnabled) {
			this.sqs.dialogManager.setCover("Loading");
		}
		this.fetchState(stateId);
	}

	/*
	* Function: loadState
	* Loads a state. You're probably looking for loadStateByID rather than this.
	* 
	* Parameters:
	* state - A state object.
	*/
	loadState(state) {
		this.lastLoadedState = state;
		
		//If you wonder what's going on here, I don't blame you. This is perhaps the laziest function you've ever seen. It does basically nothing.
		//It just broadcasts a bunch of events and then expects all the other modules to do all of the heavy lifting for it! Can you imagine the gall!
		//So, it's entirely up to the FacetManager/ResultManager and so on so do whatever is necessary to properly load the viewstate.
		//What do we even pay the StateManager for? Who knows! Does it deserve the electricity it's using up, probably not!
		//It's still kind of makes structural sense to keep it though, so there's that. It very existence is justified by a mere technicality, kind of.
		$.event.trigger("seadStatePreLoad", {
			state: state
		});

		$.event.trigger("seadStateLoad", {
			state: state
		});

		$.event.trigger("seadStatePostLoad", {
			state: state
		});

		window.history.pushState(state,
			"SEAD",
			"/viewstate/"+state.id);

		this.checkLoadStateCompleteInterval = setInterval(() => {
			if(this.sqs.resultManager.getRenderStatus() == "complete") {
				clearInterval(this.checkLoadStateCompleteInterval);
				$.event.trigger("seadStateLoadComplete", {
					state: state
				});
			}
		}, 100);
	}

	setViewStateDialog(dialog) {
		this.openedViewStateDialog = dialog;
	}

	getViewStateDialog() {
		return this.openedViewStateDialog;
	}

	/*
	* Function: sqsMenu
	* Define and return the menu structure for this component, according to the sqsMenu format.
	*
	* See Also:
	* ResponsiveMenu.class.js
	*/
	sqsMenu() {
		return {
			title: "Viewstate",
			layout: "vertical",
			collapsed: true,
			anchor: "#help-menu",
			items: [
				{
					name: "save",
					title: "<i class=\"fa fa-bookmark-o\" aria-hidden=\"true\"></i> Save viewstate",
					callback: () => {
						$.event.trigger("seadSaveStateClicked", {});
					}
				},
				{
					name: "load",
					title: "<i class=\"fa fa-bookmark-o\" aria-hidden=\"true\"></i> Load viewstate",
					callback: () => {
						$.event.trigger("seadLoadStateClicked", {});
					}
				}
				
			]
		};
	}
}

export { StateManager as default }