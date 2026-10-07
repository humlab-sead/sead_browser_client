import { nanoid } from 'nanoid'
/* 
Class: StateManager
StateManager handles saving and loading of states. A state is basically a "savegame". It records the current facets used, their positions, selections and all other relevent data for restoring a certain viewstate at a later time.

A saved viewstate is public or private, as the user chooses when saving it, and can be changed later in the load dialog.
Public is the default: anyone with the link can open it, and it can be shared. A private one opens only for its owner, when
signed in - json_api_server answers anyone else as though it did not exist.
*/
class StateManager {
	/*
	* Function: constructor
	*
	* Config param: requireLoginForViewstateStorage
	*/
	constructor(sqs) {
		this.sqs = sqs;
		
		//Saving always needs a signed-in user, loading only when viewstates aren't also kept locally
		$(window).on("seadSaveStateClicked", (event, data) => {
			this.sqs.userManager.whenSignedIn(() => {
				this.renderSaveViewstateDialog();
			});
		});

		$(window).on("seadLoadStateClicked", (event, data) => {
			const showLoadDialog = () => {
				this.renderLoadViewstateDialog();
				this.updateLoadStateDialog();
			};
			if(Config.requireLoginForViewstateStorage) {
				this.sqs.userManager.whenSignedIn(showLoadDialog);
			}
			else {
				showLoadDialog();
			}
		});
		
		this.sqs.sqsEventListen("userLoggedIn", () => {
			this.updateLoadStateDialog();
		});

		this.sqs.sqsEventListen("userLoggedOut", () => {
			this.updateLoadStateDialog();
		});

	}

	/*
	* Function: renderSaveViewstateDialog
	* Asks for a name and whether the viewstate is public (the default) or private, with a switch.
	* Once saved, the dialog shows the link, and a Share button for a public viewstate.
	*/
	renderSaveViewstateDialog() {
		let frag = $("#viewstate-save-template")[0].content.cloneNode(true);
		const container = this.sqs.dialogManager.showPopOverFragment("Save viewstate", frag, { width: "620px" });

		const toggle = $(".viewstate-private-toggle", container);
		const visibility = () => toggle.prop("checked") ? "private" : "public";
		const renderVisibility = () => {
			$(".viewstate-visibility-option", container).each((index, node) => {
				$(node).toggleClass("viewstate-visibility-option-active", $(node).attr("data-visibility") == visibility());
			});
			$(".viewstate-visibility-hint", container).text(visibility() == "private"
				? "Only you can open it, when you are signed in."
				: "Anyone with the link can open it, and you can share it once it is saved.");
		};
		toggle.on("change", renderVisibility);
		//the words either side of the switch choose too
		$(".viewstate-visibility-option", container).on("click", (evt) => {
			toggle.prop("checked", $(evt.currentTarget).attr("data-visibility") == "private");
			renderVisibility();
		});
		renderVisibility();

		const save = async () => {
			let state = this.saveState(visibility());
			if(state === false) {
				return;
			}
			$("#viewstate-save-btn", container).prop("disabled", true);
			try {
				await this.sendState(state);
			}
			catch(error) {
				$("#viewstate-save-btn", container).prop("disabled", false);
				$.notify("The viewstate could not be saved.", "error");
				return;
			}
			this.renderSavedViewstate(container, state);
		};
		$("#viewstate-save-btn", container).on("click", save);
		$("#viewstate-save-input", container).on("keyup", (evt) => {
			if(evt.key == "Enter") {
				save();
			}
		});
	}

	/*
	* Function: renderSavedViewstate
	* The save dialog once the viewstate is saved: its link, to copy, and to share if it is public.
	*/
	renderSavedViewstate(container, state) {
		$("#popover-dialog-frame > h1").text("Viewstate saved");
		$(".viewstate-save-form", container).hide();
		const saved = $(".viewstate-saved", container).show();
		$(".viewstate-saved-message", saved).text(state.visibility == "private"
			? "\""+state.name+"\" is saved as a private viewstate. Only you can open its link, when you are signed in."
			: "\""+state.name+"\" is saved as a public viewstate. Anyone with its link can open it.");
		const url = this.getViewstateUrl(state.id);
		$(".viewstate-link-url", saved).attr("href", url).text(url);
		$(".viewstate-copy-btn", saved).on("click", () => this.copyViewstateLink(state.id));
		$(".viewstate-share-btn", saved).toggle(state.visibility != "private").on("click", () => this.shareViewstate(state));
	}

	getViewstateUrl(stateId) {
		return Config.serverRoot+"/viewstate/"+stateId;
	}

	/*
	* Function: shareViewstate
	* Shares a public viewstate's link with the system's share sheet where there is one, and
	* copies it otherwise.
	*/
	async shareViewstate(state) {
		const url = this.getViewstateUrl(state.id);
		if(navigator.share) {
			try {
				await navigator.share({ title: "SEAD viewstate: "+state.name, url: url });
				return;
			}
			catch(error) {
				if(error.name == "AbortError") {
					return; //the user closed the share sheet
				}
				//not allowed here (no user gesture left after saving, say): copy instead
			}
		}
		this.copyViewstateLink(state.id);
	}

	async copyViewstateLink(stateId) {
		try {
			await navigator.clipboard.writeText(this.getViewstateUrl(stateId));
			this.sqs.notificationManager.notify("Copied the link to the clipboard", "info", 2000);
		}
		catch(error) {
			this.sqs.notificationManager.notify("The link could not be copied: "+this.getViewstateUrl(stateId), "warning", 8000);
		}
	}

	renderLoadViewstateDialog() {
		let frag = $("#viewstate-load-template")[0].content.cloneNode(true);
		this.sqs.dialogManager.showPopOverFragment("Load viewstate", frag);
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
		if($("#viewstate-load-list").length == 0) {
			return; //the load dialog isn't open
		}
		$("#viewstate-load-list").html("");
		let viewstates = [];

		if(!Config.requireLoginForViewstateStorage) {
			viewstates = this.getLocallyStoredViewstates();
		}

		//viewstates = this.makeListUniqueByProperty(viewstates, "id");

		let user = this.sqs.userManager.getUser();
		console.log("User:", user);

		//If user is logged in, fetch viewstates from server. Whose they are comes from the session cookie.
		if(user != null) {
			$.ajax(this.sqs.config.dataServerAddress+"/viewstates", {
				method: "get",
				xhrFields: { withCredentials: true },
				success: (serverViewstates) => {
					if(!Config.requireLoginForViewstateStorage) {
						viewstates = viewstates.concat(serverViewstates);
						viewstates = this.makeListUniqueByProperty(viewstates, "id");
					}
					else {
						viewstates = serverViewstates;
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
		//kept so that switching one's visibility can redraw the list
		this.lastListedViewstates = viewstates;
		$("#viewstate-load-list").html("");
		let header = "<div class='viewstate-load-item-header'><div>ID</div><div>Name</div><div>Created</div><div>Release</div><div>Visibility</div><div></div><div id='vs-del-header'>Del</div></div>";
		$("#viewstate-load-list").append(header);

		viewstates.map((state) => {
			let oldApiWarn = "";
			//The SEAD release the viewstate was saved in. Before seadRelease was saved, the client's own version stood in for it,
			//and before that apiVersion, which was never kept up to date.
			let release = state.seadRelease ? state.seadRelease : (state.clientVersion ? state.clientVersion : (state.apiVersion ? state.apiVersion : "Unknown"));
			if(release != this.sqs.config.seadRelease) {
				oldApiWarn = "<i class=\"fa fa-exclamation-triangle old-viewstate-api-warning\" aria-hidden=\"true\"></i>";
			}
			var dateString = this.formatTimestampToDateString(state.saved);

			let vsRow = $("<div id='vs-"+state.id+"' class='viewstate-load-item'></div>");
			vsRow.append("<div class='vs-id' vsid='"+state.id+"'>"+state.id+"</div>");
			vsRow.append($("<div></div>").text(state.name)); //typed in by the user, so not HTML
			vsRow.append("<div>"+dateString+"</div>");
			vsRow.append("<div>"+oldApiWarn+" "+release+"</div>");
			vsRow.append(this.renderVisibilityCell(state));
			const share = $("<div></div>").appendTo(vsRow);
			if(state.visibility != "private") {
				$("<button type='button' class='viewstate-share-list-btn' title='Share' aria-label='Share'><i class='fa fa-share-alt' aria-hidden='true'></i></button>")
					.on("click", (evt) => {
						evt.stopPropagation();
						this.shareViewstate(state);
					})
					.appendTo(share);
			}
			vsRow.append("<div><i class='fa fa-trash viewstate-delete-btn' aria-hidden='true'></i></div>");

			$("#viewstate-load-list").append(vsRow);

			this.sqs.tooltipManager.registerTooltip("#vs-"+state.id+" .old-viewstate-api-warning", "This viewstate was created in another release of the SEAD browser, so the data and the result may have changed since.");
		});

		this.sqs.tooltipManager.registerTooltip("#vs-del-header", "Deleting a public viewstate only removes it from your list: it can still be opened with its link. A private one is deleted altogether.", {drawSymbol: true});

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

	/*
	* Function: renderVisibilityCell
	* Whether the viewstate is public or private, as a button that switches it. Only viewstates the
	* server holds have one; one kept in this browser alone has nothing to switch.
	*/
	renderVisibilityCell(state) {
		const cell = $("<div></div>");
		if(state.visibility == null) {
			return cell;
		}
		const button = $("<button type='button' class='viewstate-visibility-btn'></button>").appendTo(cell);
		const render = () => {
			const isPrivate = state.visibility == "private";
			button.empty()
				.append($("<i aria-hidden='true'></i>").addClass(isPrivate ? "fa fa-lock" : "fa fa-globe"))
				.append(document.createTextNode(isPrivate ? " Private" : " Public"))
				.attr("title", isPrivate ? "Only you can open it. Click to make it public." : "Anyone with the link can open it. Click to make it private.");
		};
		render();
		button.on("click", async (evt) => {
			evt.stopPropagation();
			const visibility = state.visibility == "private" ? "public" : "private";
			button.prop("disabled", true);
			try {
				await this.setViewstateVisibility(state.id, visibility);
				state.visibility = visibility;
				this.renderViewStates(this.lastListedViewstates);
			}
			catch(error) {
				console.error("Could not change the viewstate", error);
				$.notify("The viewstate could not be changed.", "error");
				button.prop("disabled", false);
			}
		});
		return cell;
	}

	async setViewstateVisibility(viewstateId, visibility) {
		const response = await fetch(this.sqs.config.dataServerAddress+"/viewstate/"+encodeURIComponent(viewstateId), {
			method: "PATCH",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ visibility: visibility })
		});
		if(!response.ok) {
			throw new Error("The server answered "+response.status);
		}
	}

	deleteViewstate(viewstateId) {
		$.ajax(this.sqs.config.dataServerAddress+"/viewstate/"+viewstateId, {
			method: "delete",
			xhrFields: { withCredentials: true },
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
		$.ajax(Config.dataServerAddress+"/viewstate/"+stateId, {
			method: "GET",
			dataType: "json",
			//so that a private viewstate opens for its owner
			xhrFields: { withCredentials: true },
			error: (jqXHR, textStatus, errorThrown) => {
				console.warn(textStatus, errorThrown);
				this.loadStateFailed(stateId);
			},
			success: (data, textStatus, jqXHR) => {
				//The server answers an id it doesn't know with an empty list
				let state = Array.isArray(data) && data.length > 0 ? data[0] : null;
				if(state == null) {
					this.loadStateFailed(stateId);
				}
				else {
					this.loadState(state);
				}
			}
		});
	}

	/*
	* Function: loadStateFailed
	* Tells the user, and lets everything waiting on the viewstate carry on as if there had been none.
	*/
	loadStateFailed(stateId) {
		console.log("Failed to load viewstate "+stateId);
		//A private viewstate is not found by anyone but its owner
		this.sqs.notificationManager.notify("The viewstate "+stateId+" could not be found. If it is private, only its owner can open it, when signed in.", "error", 10000);

		if(this.getViewstateIdFromUrl() == stateId) {
			window.history.replaceState({}, "SEAD", "/");
		}

		$.event.trigger("seadStateLoadFailed", {
			stateId: stateId
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

		if(this.sqs.userManager.getUser() == null) {
			throw new Error("Not signed in");
		}

		//Who the viewstate belongs to comes from the session cookie
		var upload = {
			"key": state.id,
			"data": JSON.stringify(state),
			"visibility": state.visibility
		};

		upload = JSON.stringify(upload);
		//var address = Config.serverAddress;
		var address = Config.dataServerAddress;
		const response = await $.ajax(address+"/viewstate", {
			method: "POST",
			processData: true,
			data: upload,
			dataType: "json",
			
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			
			xhrFields: { withCredentials: true },
			error: function(jqXHR, textStatus, errorThrown) {
				console.log(jqXHR, textStatus, errorThrown);
			}
		});
		if(!response || response.status != "ok") {
			throw new Error("The server did not store the viewstate");
		}
		
		return state;
	}


	/*
	* Function: saveState
	* Compiles the current view into a viewstate. Does not send it to the server. Normally this is used inside sendState and not directly by itself.
	* 
	* Returns:
	* The state object.
	*/
	saveState(visibility = "public") {
		//the save dialog's name, if it is open
		var name = $("#popover-dialog #viewstate-save-input").val() || "";

		if(name.length == 0) {
			name = "Unnamed";
		}

		let stateId = nanoid();

		var state = {
			id: stateId,
			name: name,
			apiVersion: this.sqs.apiVersion,
			seadRelease: this.sqs.config.seadRelease,
			clientVersion: this.sqs.config.version,
			saved: Date.now(),
			layout: this.getLayoutViewstate(),
			facets: this.sqs.facetManager.getFacetState(),
			result: this.sqs.resultManager.getResultState(),
			siteReport: this.sqs.siteReportManager.getReportState(),
			domain: this.sqs.domainManager.getActiveDomain().name,
			visibility: visibility
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

		/*
		window.history.pushState(state,
			"SEAD",
			"/viewstate/"+stateId);
		*/

		this.updateLoadStateDialog();
		return state;
	}

	saveStateError() {
		$("#popover-dialog #viewstate-save-btn").effect("shake");
	}

	/*
	* Function: loadStateById
	* Fetches and loads a state.
	* 
	* Parameters:
	*/
	loadStateById(stateId) {
		if(Config.viewstateLoadingScreenEnabled) {
			this.sqs.dialogManager.setCover();
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
	async loadState(state) {
		this.lastLoadedState = state;
		
		//If you wonder what's going on here, I don't blame you. This is perhaps the laziest function you've ever seen. It does basically nothing.
		//It just broadcasts a bunch of events and then expects all the other modules to do all of the heavy lifting for it! Can you imagine the gall!
		//So, it's entirely up to the FacetManager/ResultManager and so on so do whatever is necessary to properly load the viewstate.
		//What do we even pay the StateManager for? Who knows! Does it deserve the electricity it's using up, probably not!
		//It's still kind of makes structural sense to keep it though, so there's that. It very existence is justified by a mere technicality, kind of.
		$.event.trigger("seadStatePreLoad", {
			state: state
		});

		//The domain goes first, and has to be finished switching: that rebuilds the filters and the result section, and would sweep away anything restored before it.
		//Viewstates from before there were domains are in the general one.
		await this.sqs.domainManager.setActiveDomain(state.domain ? state.domain : "general", false);

		$.event.trigger("seadStateLoad", {
			state: state
		});

		$.event.trigger("seadStatePostLoad", {
			state: state
		});

		this.restoreLayout(state.layout);
		this.restoreSiteReport(state.siteReport);

		window.history.pushState(state,
			"SEAD",
			"/viewstate/"+state.id);

		if(this.sqs.seoManager) {
			this.sqs.seoManager.setViewstateMeta(state.id);
		}

		clearInterval(this.checkLoadStateCompleteInterval);
		const startedWaiting = Date.now();
		this.checkLoadStateCompleteInterval = setInterval(() => {
			//The loading cover comes down on this, so it can't wait on a result that never comes
			let renderStatus = this.sqs.resultManager.getRenderStatus();
			if(renderStatus == "complete" || renderStatus == "failed" || Date.now() - startedWaiting > 30000) {
				clearInterval(this.checkLoadStateCompleteInterval);
				$.event.trigger("seadStateLoadComplete", {
					state: state
				});
			}
		}, 100);
	}

	/*
	* Function: getLayoutViewstate
	* How the filter view is split between filters and result. Only the desktop layout has a split to speak of.
	*/
	getLayoutViewstate() {
		let view = this.sqs.layoutManager.getViewByName("filters");
		if(!view || this.sqs.layoutManager.getMode() != "desktopMode") {
			return {};
		}
		return {
			left: view.leftLastSize
		};
	}

	restoreLayout(layout) {
		let view = this.sqs.layoutManager.getViewByName("filters");
		if(!view || !layout || typeof layout.left != "number" || this.sqs.layoutManager.getMode() != "desktopMode") {
			return;
		}
		let left = Math.max(0, Math.min(100, layout.left));
		view.setSectionSizes(left, 100 - left, false);
		view.updateSectionCollapseButtons();
	}

	/*
	* Function: restoreSiteReport
	* Opens the site report the viewstate was saved with, over the restored filters - or closes the one showing, if it had none.
	*/
	restoreSiteReport(siteReportState) {
		if(siteReportState && siteReportState.active && siteReportState.siteId) {
			this.sqs.siteReportManager.renderSiteReport(siteReportState.siteId, false);
		}
		else if(this.sqs.activeView == "siteReport") {
			this.sqs.siteReportManager.unrenderSiteReport();
		}
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

	/*
	* Function: getInterfaceState
	*
	* A snapshot of what the interface is currently showing, for consumers that need to
	* reason about it rather than restore it - the SEAD agent above all.
	*
	* This is deliberately read on demand from the live managers rather than maintained as
	* the user clicks around: there is then only one source of truth, and no way for the
	* description to drift out of step with the thing it describes. It reuses the same
	* getFacetState/getResultState/getReportState the viewstate save path uses, and adds
	* the parts of the interface those don't cover, because a viewstate only has to capture
	* what is worth restoring - not what is merely open.
	*
	* Every probe is individually guarded: a partial answer is far more useful here than an
	* exception, since the caller is often asking precisely because something is in an odd
	* state.
	*/
	getInterfaceState() {
		return {
			view: this.sqs.activeView || null,
			layout: this.getLayoutState(),
			domain: this.attempt(() => this.sqs.domainManager.getActiveDomain().name, null),
			filters: this.getFilterState(),
			result: this.getResultSummary(),
			siteReport: this.getSiteReportSummary(),
			dialog: this.getDialogState(),
			expandedMenus: this.getExpandedMenus(),
			quickSearch: this.attempt(() => this.sqs.quickstartSearch.getState(), null)
		};
	}

	/*
	* Function: getInterfaceStateSummary
	*
	* A one-line-per-fact version of getInterfaceState, small enough to travel with every
	* message a user sends the agent.
	*
	* The full snapshot is too large to repeat on every turn, but an agent that only reads
	* state when it thinks to is an agent that will sometimes be confidently wrong - the
	* user can open a site report, close a filter or switch view between two messages, and
	* nothing in the conversation says so. This carries just enough for the agent to know
	* where the user is; it calls getInterfaceState when it needs the detail.
	*/
	getInterfaceStateSummary() {
		let state = this.getInterfaceState();

		let summary = {
			view: state.view,
			domain: state.domain,
			resultView: state.result ? state.result.module : null,
			siteCount: state.result ? state.result.siteCount : null,
			//Just enough of each filter to notice one appearing or disappearing
			filters: (state.filters || []).map(filter => ({
				id: filter.id,
				selectionCount: filter.selectionCount
			}))
		};

		if(state.siteReport) {
			summary.siteReport = {
				siteId: state.siteReport.siteId,
				siteName: state.siteReport.siteName,
				expandedSections: (state.siteReport.sections || []).filter(section => section.expanded).map(section => section.id)
			};
		}
		if(state.dialog && state.dialog.open) {
			summary.dialogOpen = state.dialog.title || true;
		}
		//The dropdown covers the top of the filter panel, so it matters as much as a dialog
		if(state.quickSearch) {
			summary.quickSearchOpen = state.quickSearch.query;
		}

		return summary;
	}

	/*
	* Function: attempt
	* Runs a probe, falling back rather than letting one unavailable manager take the whole
	* snapshot down with it.
	*/
	attempt(probe, fallback = null) {
		try {
			let value = probe();
			return typeof value == "undefined" ? fallback : value;
		}
		catch(error) {
			return fallback;
		}
	}

	getLayoutState() {
		return {
			mode: this.attempt(() => this.sqs.layoutManager.getMode(), null),
			visibleSection: this.attempt(() => this.sqs.layoutManager.getActiveView().getVisibleSection(), null)
		};
	}

	/*
	* Function: getFilterState
	* The open filters, as the viewstate sees them, plus the things that only matter while
	* someone is looking at the screen: the title, how many options loaded, and whatever
	* has been typed into the filter's own text search.
	*/
	getFilterState() {
		return this.attempt(() => {
			let facetState = this.sqs.facetManager.getFacetState();

			return facetState.map(entry => {
				let facet = this.sqs.facetManager.getFacetByName(entry.name);
				let selections = Array.isArray(entry.selections) ? entry.selections : [];

				//A staged filter contributes one entry per stage, and a stage is not a facet
				//of its own - so `getFacetByName` finds nothing for the earlier ones, and
				//they would otherwise read as filters that exist but have no title and
				//cannot be opened. Name the parent instead.
				let parent = facet ? null : this.sqs.facetManager.facets.find(candidate =>
					Array.isArray(candidate.filters) && candidate.filters.some(stage => stage.name == entry.name));
				let stageOf = null;
				if(parent) {
					stageOf = parent.name;
					facet = parent;
				}
				else if(facet && Array.isArray(facet.filters) && facet.filters.length > 1) {
					stageOf = facet.name;
				}

				//The map filter holds polygons, not ids. Hundreds of coordinates say nothing
				//useful about what is selected, so it is summarised instead of listed.
				let isPolygonFilter = entry.type == "geopolygon";

				return {
					id: entry.name,
					title: facet ? facet.title : null,
					type: entry.type,
					//Which filter this is a stage of, when it is one - so two entries that
					//belong to one facet on screen do not read as two separate filters
					stageOf: stageOf,
					position: entry.position,
					minimized: entry.minimized === true,
					//A filter can hold thousands of ids; the count is what matters and the
					//list is only useful up to a point
					selectionCount: selections.length,
					selections: isPolygonFilter
						? selections.map(polygon => (Array.isArray(polygon) ? Math.floor(polygon.length / 2)+" points" : String(polygon)))
						: selections.slice(0, 25),
					//A stage holds its own values, so the facet's own `data` says nothing about it
					optionsLoaded: this.attempt(() => {
						if(stageOf) {
							let stage = facet.filters.find(candidate => candidate.name == entry.name);
							return stage && Array.isArray(stage.data) ? stage.data.length : null;
						}
						return Array.isArray(facet.data) ? facet.data.length : null;
					}, null),
					textSearch: this.attempt(() => {
						let value = $(".facet-text-search-input", facet.getDomRef()).val();
						return value && value.length > 0 ? value : null;
					}, null)
				};
			});
		}, []);
	}

	getResultSummary() {
		return {
			module: this.attempt(() => this.sqs.resultManager.getActiveModule().name, null),
			siteCount: this.attempt(() => this.sqs.resultManager.getActiveModule().getSiteCount(), null),
			//The tiles actually on screen, read from the DOM.
			//
			//Not from resultMosaic.modules: that is the catalogue of every tile type that
			//exists, not the subset this domain renders (which comes from the domain's
			//result_grid_modules), and its titles are the static class names. The tiles
			//retitle themselves once rendered - the catalogue's "Site map" is shown to the
			//user as "Site distribution" - so the DOM is the only place the visible titles
			//exist. It is also a cheap read.
			renderedTiles: this.attempt(() => {
				let titles = [];
				$("#result-mosaic-container .result-mosaic-tile:visible").each((index, element) => {
					let title = $(".mosaic-tile-title", element).first().text().trim();
					if(title.length > 0) {
						titles.push(title);
					}
				});
				//null rather than [] when the mosaic isn't the active view at all
				return titles.length > 0 ? titles : null;
			}, null)
		};
	}

	getSiteReportSummary() {
		let reportState = this.attempt(() => this.sqs.siteReportManager.getReportState(), { active: false });
		if(!reportState || !reportState.active || this.sqs.activeView != "siteReport") {
			return null;
		}

		let report = this.sqs.siteReportManager.siteReport;
		return {
			siteId: reportState.siteId,
			siteName: this.attempt(() => report.siteData.site_name, null),
			loaded: this.attempt(() => report.fetchComplete === true, false),
			sections: this.attempt(() => this.describeReportSections(report.data ? report.data.sections : []), [])
		};
	}

	describeReportSections(sections, level = 0) {
		let described = [];
		(Array.isArray(sections) ? sections : []).forEach(section => {
			if(!section || !section.name) {
				return;
			}
			described.push({
				id: section.name,
				title: section.title,
				level: level,
				expanded: section.collapsed === false,
				contentItems: Array.isArray(section.contentItems) ? section.contentItems.length : 0
			});
			if(Array.isArray(section.sections) && section.sections.length > 0) {
				described = described.concat(this.describeReportSections(section.sections, level + 1));
			}
		});
		return described;
	}

	/*
	* Function: getDialogState
	* Whether a popover is covering the interface. Worth knowing before suggesting the user
	* click something they cannot currently see.
	*/
	getDialogState() {
		return this.attempt(() => {
			if(!$("#popover-dialog").is(":visible")) {
				return null;
			}
			let title = $("#popover-dialog-frame > h1").text();
			return { open: true, title: title && title.length > 0 ? title : null };
		}, null);
	}

	getExpandedMenus() {
		return this.attempt(() => {
			let expanded = [];
			$(".sqs-menu-block-expanded, .first-level-item-expanded").each((index, element) => {
				let label = $(element).find(".first-level-title, .menu-item-title").first().text().trim();
				if(label.length > 0 && expanded.indexOf(label) == -1) {
					expanded.push(label);
				}
			});
			return expanded;
		}, []);
	}
}

export { StateManager as default }
