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
	constructor(hqs) {
		this.hqs = hqs;
		
		$(window).on("seadSaveStateClicked", (event, data) => {
			this.renderSaveViewstateDialog();
		});

		$(window).on("seadLoadStateClicked", (event, data) => {
			this.renderLoadViewstateDialog();
			this.updateLoadStateDialog();
		});
		
		this.hqs.hqsEventListen("userLoggedIn", () => {
			this.updateLoadStateDialog();
		});

		this.hqs.hqsEventListen("userLoggedOut", () => {
			this.updateLoadStateDialog();
		});

	}

	renderSaveViewstateDialog() {
		var content = $("#viewstate-save-dialog > .overlay-dialog-content").html();
		this.hqs.dialogManager.showPopOver("Save viewstate", content);
		$("#viewstate-save-btn").on("click", () => {
			let state = this.saveState();
			this.sendState(state).then(() => {
				this.hqs.dialogManager.hidePopOver();
				var content = $("#viewstate-post-save-dialog .overlay-dialog-content");
				$("#viewstate-url", content).html("<a href='"+Config.serverRoot+"/viewstate/"+state.id+"'>"+Config.serverRoot+"/viewstate/"+state.id+"</a>");
				$("#viewstate-key", content).html(state.id);
				this.hqs.dialogManager.showPopOver("Viewstate saved", content.html());
			});
		});
	}

	renderLoadViewstateDialog() {
		var content = $("#viewstate-load-dialog > .overlay-dialog-content").html();
		this.hqs.dialogManager.showPopOver("Load viewstate", content);
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
		if(typeof this.hqs.userManager != "undefined" && this.hqs.userManager.user != null) {

			$.ajax(this.hqs.config.viewStateServerAddress+"/viewstates/"+this.hqs.userManager.user.id_token, {
				method: "get",
				success: (viewstates) => {
					console.log(viewstates);

					if(!Config.requireLoginForViewstateStorage) {
						viewstates = viewstates.concat(serverViewstates);
						viewstates = this.makeListUniqueByProperty(viewstates, "id");
					}

					this.sortViewstates(viewstates);
					this.renderViewStates(viewstates);
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
		console.log("renderViewStates");
		$("#viewstate-load-list").html("");
		let header = "<div class='viewstate-load-item-header'><div>ID</div><div>Name</div><div>Time</div><div>Del</div></div>";
		$("#viewstate-load-list").append(header);

		viewstates.map((state) => {
			var dateString = this.formatTimestampToDateString(state.saved);

			let vsRow = "<div class='viewstate-load-item'><div class='vs-id' vsid='"+state.id+"'>"+state.id+"</div><div>"+state.name+"</div><div>"+dateString+"</div><div><i class='fa fa-trash viewstate-delete-btn' aria-hidden='true'></i></div></div>";
			$("#viewstate-load-list").append(vsRow);
			//$("#viewstate-load-list").append("<option value='"+state.id+"''>"+dateString+" "+state.name+" (id:"+state.id+") "+state.origin+"</option>");
		});

		$(".viewstate-delete-btn").on("click", (evt) => {
			evt.stopPropagation();
			let el = $(evt.currentTarget).parent().parent();
			el.css("background-color", "red");
			//el.slideUp(500);
			let viewstateId = $(".vs-id", el).text();
			this.deleteViewstate(viewstateId);
		});

		$(".viewstate-load-item").on("click", evt => {
			console.log(evt.currentTarget);
			const vsId = $(".vs-id", evt.currentTarget).text();
			var state = this.getStateById(vsId);
			if(state === false) {
				$("#viewstate-load-input").notify("Invalid viewstate ID", "error");
				return;
			}
			this.hqs.userManager.googleLogin();

			this.loadState(state);
			this.hqs.dialogManager.hidePopOver();

			$("#viewstate-menu-label").notify("Loaded viewstate "+state.id, "info");
		});
	}

	deleteViewstate(viewstateId) {
		$.ajax(this.hqs.config.viewStateServerAddress+"/viewstate/"+viewstateId+"/"+this.hqs.userManager.user.id_token, {
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
				console.log(state);
				
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

		if(this.hqs.userManager.user == null) {
			return;
		}

		var upload = {
			"key": state.id,
			"user_id_token": this.hqs.userManager.user.id_token,
			"data": JSON.stringify(state)
		};
		console.log(upload);
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
				console.log("Viewstate uploaded");
				console.log(data, textStatus);
				/*
				this.hqs.dialogManager.hidePopOver();
				var content = $("#viewstate-post-save-dialog .overlay-dialog-content");
				$("#viewstate-url", content).html("<a href='"+Config.serverRoot+"/viewstate/"+state.id+"'>"+Config.serverRoot+"/viewstate/"+state.id+"</a>");
				$("#viewstate-key", content).html(state.id);
				this.hqs.dialogManager.showPopOver("Viewstate saved", content.html());
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
			saved: Date.now(),
			layout: {
				left: this.hqs.layoutManager.leftLastSize
			},
			facets: this.hqs.facetManager.getFacetState(),
			result: this.hqs.resultManager.getResultState(),
			siteReport: this.hqs.siteReportManager.getReportState()
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
		console.log(state);
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
			this.hqs.dialogManager.setCover();
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
		console.log(state);
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
			if(this.hqs.resultManager.getRenderStatus() == "complete") {
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
	* Function: hqsMenu
	* Define and return the menu structure for this component, according to the HqsMenu format.
	*
	* See Also:
	* ResponsiveMenu.class.js
	*/
	hqsMenu() {
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