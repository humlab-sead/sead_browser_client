import 'gridstack/dist/gridstack.min.css';
import { GridStack } from 'gridstack';
import Packery from 'packery';
import Draggabilly from 'draggabilly';

/* 
* Class: ResultManager
* This class handles everything regarding the result section which goes beyond the scope of the individual result modules, such as switching between modules.
*/
class ResultManager {
	/*
	* Function: constructor
	*/
	constructor(sqs) {
		this.sqs = sqs;
		this.modules = [];
		this.activeModuleId = "none";
		this.resultSectionDisabled = false;
		this.resultDataFetchingSuspended = false;
		this.pendingDataFetch = false;
		this.resultModuleRenderStatus = "none";
		this.sqsInitComplete = false;
		this.debugMode = false;
		
		//Event hook-ins below
		if(this.resultSectionDisabled == false) {

			$("#show-query-btn").on("click", () => {
				let sql = this.getActiveModule().getSQL();
				const formattedSQL = sql.replace(/\n/g, "<br/>");

				this.sqs.dialogManager.showPopOver("Result SQL", formattedSQL);
			});

			$(window).on("seadResultMenuSelection", (event, data) => {
				this.sqs.storeUserSettings({
					defaultResultModule: data.selection
				});
				this.sqs.resultManager.setActiveModule(data.selection);
			});
			
			$(window).on("seadFacetSelection", (event, data) => {
				this.updateResultView(data.facet);
			});
			
			$(window).on("seadFacetMove", (event, data) => {
				this.updateResultView(data.facet);
			});
			
			$(window).on("seadFacetDeletion", (event, data) => {
				//If this deleted facet had any selections... otherwise we don't care
				if(data.facet.getSelections().length > 0) {
					this.updateResultView(data.facet);
				}
			});

			$(window).on("sqsInitComplete", () => {
				this.sqsInitComplete = true;
			});
			
			$(window).on("seadStatePreLoad", (event, data) => {
				this.setResultDataFetchingSuspended(true);
			});
			
			$(window).on("seadStatePostLoad", (event, data) => {
				var state = data.state;
				this.setActiveModule(state.result.module, true);
				this.importSettings(state.result.settings);
				if(data.state.facets.length == 0) {
					this.setResultDataFetchingSuspended(false);
				}
			});
			
			$(window).on("seadFacetPendingDataFetchQueueEmpty", (event, data) => {
				//NOTE: Do we ALWAYS want to resume result data fetching when facet fetching is complete?
				this.setResultDataFetchingSuspended(false);
			});
			
			$(window).on("resultModuleRenderComplete", (event, data) => {
				//console.log("received: resultModuleRenderComplete")
				this.resultModuleRenderStatus = "complete";
			});
			
			$(window).on("seadStateLoadFailed", () => {
				this.setResultDataFetchingSuspended(false);
				this.fetchData();
			});
			
			/*
			sead.sqsEventListen("resultModuleRenderComplete", () => {
				this.resultModuleRenderStatus = "complete";
			});
			*/
			
			this.sqs.sqsEventListen("layoutResize", (evt) => {
				if($(".section-right").width() < 655) {
					$("#result-title").hide();
				}
				else {
					$("#result-title").show();
				}
			});
			
			this.sqs.sqsEventListen("layoutChange", (evt, data) => {
				if(data == "mobileMode") {
					$("#result-menu .result-tab-title").hide();
				}
				if(data == "desktopMode") {
					$("#result-menu .result-tab-title").show();
				}
			});

			this.sqs.sqsEventListen("domainChanged", (evt, newDomainName) => {
				this.getActiveModule().render();
			});
			
		}
		
	}

	toggleDebug() {
		this.debugMode = !this.debugMode;

		if(this.debugMode) {
			$("#result-menu .sqs-menu-item-hidden").css("display", "block");
			$("#result-section #show-query-btn").show();
		}
		else {
			$("#result-menu .sqs-menu-item-hidden").css("display", "none");
			$("#result-section #show-query-btn").hide();
		}
	}

    /*
    * Function: addModule
    *
    * Parameters:
    * module
    */
	addModule(module) {
		if(Array.isArray(module)) {
			for(var key in module) {
				this.modules.push(module[key]);
			}
		}
		else {
			this.modules.push(module);
		}
	}
	

	/*
	* Function: getRequestData
	* 
	* Parameters: 
	* requestId
	* requestDataType
	*/
	getRequestData(requestId = 0, requestDataType = "tabular") {
		var facetState = this.sqs.facetManager.getFacetState();

		var targetCode = "";
		var triggerCode = "";

		//If there's no facets or none of the facets has any selections, compile a special request package to get all the data.
		if(this.sqs.facetManager.facets.length == 0 || this.sqs.facetManager.facetsHasSelections() === false) {
			targetCode = "sites";
			triggerCode = "sites";
            facetState = [{
                name: "sites",
                position: 1,
                selections: [],
                type: "discrete"
            }];
		}
		else {
			//If you think this is stupid then I agree with you.
			targetCode = this.sqs.facetManager.getLastFacet().name;
			triggerCode = targetCode;
		}
		
		
		var facetDef = this.sqs.facetManager.facetStateToDEF(facetState, {
			requestType: "populate",
			targetCode: targetCode,
			triggerCode: triggerCode
		});
		
		var viewTypeId = "";
		viewTypeId = requestDataType;

		let domainCode = this.sqs.domainManager.getActiveDomain().name == "general" ? "" : this.sqs.domainManager.getActiveDomain().name;
		
		var reqData = {
		   "facetsConfig": {
		       "requestId": requestId,
			   "requestType": "populate",
			   "domainCode": domainCode,
		       "targetCode": targetCode,
		       "triggerCode": triggerCode,
		       "facetConfigs": facetDef
		   },
		   "resultConfig": {
		       "requestId": requestId,
		       "sessionId": "1",
		       "viewTypeId": viewTypeId,
		       "aggregateKeys": ["site_level"]
		   }
		};

		return reqData;
	}
	
	getRenderStatus() {
		return this.resultModuleRenderStatus;
	}
	
	/*
	* Function: importResultData
	* 
	* Parameters: 
	* data
	*/
	importResultData(data) {
		this.getActiveModule().importResultData(data);
	}

	/*
	* Function: importResultData
	* 
	* Parameters: 
	* data
	*/
	getActiveModule() {
		for(var key in this.modules) {
			if(this.modules[key].name == this.activeModuleId) {
				return this.modules[key].module;
			}
		}
		return false;
	}

	getModule(moduleName) {
		for(var key in this.modules) {
			if(this.modules[key].name == moduleName) {
				return this.modules[key].module;
			}
		}
		return false;
	}

	getModules() {
		return this.modules;
	}

	/*
	* Function: getResultModuleByName
	* 
	* Parameters: 
	* data
	*/
	getResultModuleByName(resultModule) {
		for(var key in this.modules) {
			if(this.modules[key].name == resultModule) {
				return this.modules[key].module;
			}
		}
		return false;
	}

	/*
	* Function: getResultState
	* 
	*/
	getResultState() {
		var resultModuleSettings = this.getResultModuleByName(this.activeModuleId).exportSettings();

		if(resultModuleSettings === false) {
			return false;
		}
		else {
			return {
				module: this.activeModuleId,
				settings: resultModuleSettings
			};
		}
	}

	/*
	* Function: setActiveModule
	* 
	* Sets (and renders) the specified result module.
	*
	* Parameters:
	* resultModuleId
	*/
	//Check that this module exists
	async setActiveModule(resultModuleId, renderModule = true) {
		if(!this.getModule(resultModuleId)) {
			console.warn("Result module "+resultModuleId+" does not exist.");
			return false;
		}
		
		if(renderModule && this.activeModuleId != "none") {
			this.renderMsg(false);
			let module = this.getActiveModule();
			module.setActive(false);
			//module.unrender();
		}
		if(renderModule && this.sqsInitComplete) {
			this.getResultModuleByName(resultModuleId).render();
		}
		else if(renderModule && !this.sqsInitComplete) {
			$(window).on("sqsInitComplete", () => {
				this.getResultModuleByName(resultModuleId).render();
			});
		}
		this.getResultModuleByName(resultModuleId).setActive(true);
		this.activeModuleId = resultModuleId;

		//Update result menu to set which button is highlighted, this needs to be done manually here if a result module is activated programmatically
		let menu = this.sqs.menuManager.getMenuByAnchor("#result-menu");
		if(menu !== false) {
			menu.setSelected(resultModuleId);
		}
	}

	/*
	* Function: updateResultView
	* 
	* Do whatever updates is appropriate to the result section, based on current facets.
	*
	* Parameters:
	* triggeringFacet - This is the facet which triggered the update.
	*/
	updateResultView(triggeringFacet = false, forceRender = false) {
		this.sqs.facetManager.setLastTriggeringFacet(triggeringFacet);
		
		if(this.getResultDataFetchingSuspended() == false) {
			this.renderMsg(false);
			this.getActiveModule().update();
		}
		else {
			this.setPendingDataFetch(true);
		}
	}


	/*
	* Function: renderMsg
	* 
	*/
	renderMsg(render = true, msg = {}) {
		if(render) {
			var domObj = $("#result-msg-contents-template")[0].cloneNode(true);
			$(domObj).attr("id", "result-msg-contents").css("display", "flex");
			$(domObj).find("#result-info-text-container > .large-info-text").html(msg.title);
			$(domObj).find("#result-info-text-container > .small-info-text").html(msg.body);
			$("#result-container").append(domObj);
		}
		else {
			//this.getActiveModule().render();
			$("#result-msg-contents").remove();
		}
	}

	/*
	* Function: importSettings
	* 
	* Parameters: 
	* settings
	*/
	importSettings(settings) {
		this.getResultModuleByName(this.activeModuleId).importSettings(settings);
	}

	/*
	* Function: showLoadingIndicator
	* 
	* Parameters: 
	* on
	* error
	*/
	showLoadingIndicator(on = true, error = false) {
		if(on) {
			$("#result-loading-indicator").fadeIn(100);
		}
		else {
			if(error) {
				$("#result-loading-indicator").addClass("result-loading-indicator-error");

				let warningTriangleIcon = "<i style='color:red;' class='fa fa-exclamation-triangle'></i>";

				this.getActiveModule().unrender();
				this.renderMsg(true, {
					title: warningTriangleIcon+" Error",
					body: "An unknown error occurred when loading this data."
				});

				setTimeout(() => {
					$("#result-loading-indicator").fadeOut(200);
					$("#result-loading-indicator").removeClass("result-loading-indicator-error");
				}, 500);
			}
			else {
				$("#result-loading-indicator").fadeOut(200);
			}
		}
	}

	/*
	* Function: setResultDataFetchingSuspended
	* 
	* Sets data fetching suspended on/off.
	*/
	setResultDataFetchingSuspended(on) {
		this.resultDataFetchingSuspended = on;
		if(!on && this.pendingDataFetch) {
			this.fetchData();
		}
	}
	
	/*
	* Function: getResultDataFetchingSuspended
	*/
	getResultDataFetchingSuspended() {
		return this.resultDataFetchingSuspended;
	}
	
	/*
	* Function: setPendingDataFetch
	*/
	setPendingDataFetch(on) {
		this.pendingDataFetch = on;
		if(!on) {
			this.renderMsg(false);
		}
	}
	
	/*
	* Function: getPendingDataFetch
	*/
	getPendingDataFetch() {
		return this.pendingDataFetch;
	}
	
	/*
	* Function: fetchData
	*/
	fetchData() {
		this.setPendingDataFetch(false);
		this.getActiveModule().render();
	}

	/*
	* Function: sqsMenu
	*
	* Strangely similar to the rMenu. How queer!
	*/
	sqsMenu() {
		let menuItems = [];
		let modules = this.getModules();
		modules.forEach(module => {
			menuItems.push({
				name: module.name,
				title: module.module.icon+"<span class='result-tab-title'>"+module.module.prettyName+"</span>",
				visible: typeof module.module.isVisible == "function" ? module.module.isVisible() : true,
				icon: "",
				staticSelection: this.getActiveModule().name == module.name ? true : false,
				callback: () => {
					$.event.trigger("seadResultMenuSelection", {
						selection: module.name
					});
				}
			});
		});

		return {
			title: "VIEW :",
			layout: "horizontal",
			collapsed: false,
			anchor: "#result-menu",
			staticSelection: true,
			showMenuTitle: false,
			viewPortResizeCallback: () => {
				let modules = this.getModules();
				modules.forEach(module => {
					if(this.sqs.layoutManager.getMode() == "mobileMode") {
						$("#result-menu #menu-item-"+module.name+" .result-tab-title").hide();
					}
					else {
						$("#result-menu #menu-item-"+module.name+" .result-tab-title").show();
					}
				});
			},
			items: menuItems
		};
	}
}

export { ResultManager as default }