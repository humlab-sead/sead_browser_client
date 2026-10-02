import { nanoid } from 'nanoid'
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
			this.updateSaveStateDialog();
			this.updateLoadStateDialog();
		});

		this.sqs.sqsEventListen("userLoggedOut", () => {
			this.updateSaveStateDialog();
			this.updateLoadStateDialog();
		});

	}

	renderSaveViewstateDialog() {
		let frag = $("#viewstate-save-template")[0].content.cloneNode(true);
		this.sqs.dialogManager.showPopOverFragment("Save viewstate", frag);
		
		$("#viewstate-save-btn").on("click", () => {
			let state = this.saveState();
			if(state === false) {
				return;
			}
			this.sendState(state).then(() => {
				this.sqs.dialogManager.hidePopOver();
				var content = $("#viewstate-post-save-dialog .overlay-dialog-content");
				$("#viewstate-url", content).html("<a href='"+Config.serverRoot+"/viewstate/"+state.id+"'>"+Config.serverRoot+"/viewstate/"+state.id+"</a>");
				$("#viewstate-key", content).html(state.id);
				this.sqs.dialogManager.showPopOver("Viewstate saved", content.html());
			}).catch(() => {
				$.notify("The viewstate could not be saved.", "error");
			});
		});

		this.updateSaveStateDialog();
	}

	/*
	* Function: updateSaveStateDialog
	* Saving needs a signed-in user; the dialog's login component asks for one otherwise.
	*/
	updateSaveStateDialog() {
		const signedIn = this.sqs.userManager.getUser() != null;
		//Scoped to the popover: index.ejs also holds an older, hidden copy of these ids
		$("#popover-dialog #viewstate-save-input").toggle(signedIn);
		$("#popover-dialog #viewstate-save-btn").toggle(signedIn);
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
		$("#viewstate-load-list").html("");
		let header = "<div class='viewstate-load-item-header'><div>ID</div><div>Name</div><div>Created</div><div>Release</div><div id='vs-del-header'>Del</div></div>";
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
		
		//var address = Config.serverAddress;
		$.ajax(Config.dataServerAddress+"/viewstate/"+stateId, {
			method: "GET",
			dataType: "json",
			error: function(jqXHR, textStatus, errorThrown) {
				console.warn(textStatus, errorThrown);
			},
			success: (data, textStatus, jqXHR) => {
				var state = data[0];
				console.log("fetchState", state)
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

		if(this.sqs.userManager.getUser() == null) {
			throw new Error("Not signed in");
		}

		//Who the viewstate belongs to comes from the session cookie
		var upload = {
			"key": state.id,
			"data": JSON.stringify(state)
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
	saveState() {
		var name = $("#viewstate-save-input").val();

		if(name.length == 0) {
			name = "Unnamed";
		}

		let stateId = nanoid();

		var state = {
			id: stateId,
			name: name,
			apiVersion: this.sqs.apiVersion,
			clientVersion: this.sqs.config.version,
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

		/*
		window.history.pushState(state,
			"SEAD",
			"/viewstate/"+stateId);
		*/

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

		if(this.sqs.seoManager) {
			this.sqs.seoManager.setViewstateMeta(state.id);
		}

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
			expandedMenus: this.getExpandedMenus()
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
			siteCount: this.attempt(() => {
				let module = this.sqs.resultManager.getActiveModule();
				if(module && Array.isArray(module.sites)) {
					return module.sites.length;
				}
				return Array.isArray(module.data) ? module.data.length : null;
			}, null),
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
