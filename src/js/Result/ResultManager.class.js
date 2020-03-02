import Config from '../../config/config.js'
import ResultMap from './ResultMap.class.js'
import ResultTable from './ResultTable.class.js'
import ResultMosaic from './ResultMosaic.class.js'

/* 
* Class: ResultManager
* This class handles everything regarding the result section which goes beyond the scope of the individual result modules, such as switching between modules.
*/
class ResultManager {
	/*
	* Function: constructor
	*/
	constructor(hqs) {
		this.hqs = hqs;
		this.modules = [];
		this.activeModuleId = "none";
		this.resultSectionDisabled = false;
		this.resultDataFetchingSuspended = false;
		this.pendingDataFetch = false;
		this.resultModuleRenderStatus = "none";
		
		//Event hook-ins below
		if(this.resultSectionDisabled == false) {
			$(window).on("seadResultMenuSelection", (event, data) => {
				this.hqs.storeUserSettings({
					defaultResultModule: data.selection
				});
				this.hqs.resultManager.setActiveModule(data.selection);
			});
			
			$(window).on("seadFacetSelection", (event, data) => {
				this.updateResultView(data.facet);
			});
			
			$(window).on("seadFacetMove", (event, data) => {
				this.updateResultView(data.facet);
			});
			
			$(window).on("seadFacetDeletion", (event, data) => {
				//If this deleted facet had any selections... otherwise we don't care
				if (data.facet.selections.length > 0) {
					this.updateResultView(data.facet);
				}
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
			sead.hqsEventListen("resultModuleRenderComplete", () => {
				this.resultModuleRenderStatus = "complete";
			});
			*/
			
			this.hqs.hqsEventListen("layoutResize", (evt) => {
				if($(".section-right").width() < 655) {
					$("#result-title").hide();
				}
				else {
					$("#result-title").show();
				}
			});
			
			this.hqs.hqsEventListen("layoutChange", (evt, data) => {
				if(data == "mobileMode") {
					$("#result-menu .result-tab-title").hide();
				}
				if(data == "desktopMode") {
					$("#result-menu .result-tab-title").show();
				}
			});
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
		var facetState = this.hqs.facetManager.getFacetState();

		var targetCode = "";
		var triggerCode = "";

		//If there's no facets or none of the facets has any selections, compile a special request package to get all the data.
		if(this.hqs.facetManager.facets.length == 0 || this.hqs.facetManager.facetsHasSelections() === false) {
			targetCode = "sites";
			triggerCode = "sites";
            facetState = [{
                name: "sites",
                position: 1,
                selections: [],
                type: "discrete"
            }];
		}
		else{
			//If you think this is stupid then I agree with you.
			targetCode = this.hqs.facetManager.getLastFacet().name;
			triggerCode = targetCode;
		}
		
		
		var facetDef = this.hqs.facetManager.facetStateToDEF(facetState, {
			requestType: "populate",
			targetCode: targetCode,
			triggerCode: triggerCode
		});
		
		var viewTypeId = "";
		viewTypeId = requestDataType;

		var reqData = {
		   "facetsConfig": {
		       "requestId": requestId,
		       "requestType": "populate",
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
	setActiveModule(resultModuleId, renderModule = true) {
		if(renderModule && this.activeModuleId != "none") { //If there's already an active module, unrender this first
			this.renderMsg(false);
			this.getActiveModule().setActive(false);
			this.getActiveModule().unrender();
		}
		if(renderModule) {
			this.getResultModuleByName(resultModuleId).render();
		}
		this.getResultModuleByName(resultModuleId).setActive(true);
		this.activeModuleId = resultModuleId;

		//Update result menu to set which button is highlighted, this needs to be done manually here if a result module is activated programmatically
		let menu = this.hqs.menuManager.getMenuByAnchor("#result-menu");
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
		this.hqs.facetManager.setLastTriggeringFacet(triggeringFacet);
		
		if(this.getResultDataFetchingSuspended() == false) {
			this.renderMsg(false);
			this.getActiveModule().render();
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
			$(domObj).attr("id", "result-msg-contents").css("display", "grid");
			$(domObj).find("#result-info-text-container > .large-info-text").text(msg.title);
			$(domObj).find("#result-info-text-container > .small-info-text").text(msg.body);
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

				this.getActiveModule().unrender();
				this.renderMsg(true, {
					title: "Error",
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
	* Function: hqsMenu
	*
	* Strangely similar to the rMenu. How queer!
	*/
	hqsMenu() {
		return {
			title: "VIEW :",
			layout: "horizontal",
			collapsed: false,
			anchor: "#result-menu",
			staticSelection: true,
			showMenuTitle: false,
			viewPortResizeCallback: () => {
				if(this.hqs.layoutManager.getMode() == "mobileMode") {
					$("#result-menu #menu-item-map .result-tab-title").hide();
					$("#result-menu #menu-item-table .result-tab-title").hide();
					$("#result-menu #menu-item-mosaic .result-tab-title").hide();
					$(".result-map-tab-title").hide();
				}
				else {
					$("#result-menu #menu-item-map .result-tab-title").show();
					$("#result-menu #menu-item-table .result-tab-title").show();
					$("#result-menu #menu-item-mosaic .result-tab-title").show();
					$(".result-map-tab-title").show();
				}
			},
			items: [
				{
					name: "map",
					title: "<i class=\"fa fa-globe\" aria-hidden=\"true\"></i><span class='result-tab-title'>Geographic</span>",
					icon: "",
					staticSelection: this.getActiveModule().name == "map" ? true : false,
					callback: () => {
						$.event.trigger("seadResultMenuSelection", {
							selection: "map"
						});
					}
				},
				{
					name: "table",
					title: "<i class=\"fa fa-table\" aria-hidden=\"true\"></i><span class='result-tab-title'>Spreadsheet</span>",
					icon: "",
					staticSelection: this.getActiveModule().name == "table" ? true : false,
					callback: () => {
						$.event.trigger("seadResultMenuSelection", {
							selection: "table"
						});
					}
				},
				{
					name: "mosaic",
					title: "<i class=\"fa fa-bar-chart\" aria-hidden=\"true\"></i><span class='result-tab-title'>Overview</span>",
					icon: "",
					staticSelection: this.getActiveModule().name == "mosaic" ? true : false,
					callback: () => {
						$.event.trigger("seadResultMenuSelection", {
							selection: "mosaic"
						});
					}
				}
			]
		};
	}
}

export { ResultManager as default }