import Color from './Color.class.js';
import FacetManager from './FacetManager.class.js';
import SqsLayoutManager from './SqsLayoutManager.class.js';
import MainMenu from './MainMenu.class.js'
import SqsMenuManager from './SqsMenuManager.class';
import ResultManager from './Result/ResultManager.class.js';
import ResultMap from './Result/ResultMap.class.js'
import ResultTable from './Result/ResultTable.class.js'
import ResultMosaic from './Result/ResultMosaic.class.js'
import StateManager from './StateManager.class.js';
import DialogManager from './DialogManager.class.js';
import TooltipManager from './TooltipManager.class.js';
import SiteReportManager from './SiteReportManager.class';
import HelpAgent from './HelpAgent.class.js';
import UserManager from './UserManager.class.js';
import DomainManager from './DomainManager.class.js';
import Router from './Router.class.js';
import css from '../stylesheets/style.scss';


/* 
* Class: SeadQuerySystem
* This is the master class of the whole SeadQuerySystem (sqs) application. There should only be one instance of this and it contains all other instantiated classes and data structures in the application.
*/
class SeadQuerySystem {
	constructor(settings) {
		this.settings = settings;
		this.requestId = 0;
		this.modules = [];
		this.config = Config;
		this.xhrList = [];
		this.xhrCallbackRegistry = [];
		this.sqsEventRegistry = [];
		this.eventGroups = [];
		this.filterDefinitions = [];
		this.taxa = []; //Local taxonomy db
		this.systemReady = false;

		this.config = this.loadUserSettings(Config);

		this.preload().then(() => {
			console.log("SQS preload complete");
			this.bootstrapSystem();
			console.log("SQS bootstrap complete");
		}, (reason) => {
			$("#preload-failed-indicator").css("display", "block");
			$(".seadlogo-loading-indicator-bg").hide();
		});

		$("body").show();
	}

	bootstrapSystem() {
		$("#sead-logo").on("click", () => {
			window.location = "/";
		});

		$("#preload-loading-indicator").remove();
		$("#header-container").css("display", "flex");

		this.color = new Color();
		this.stateManager = new StateManager(this);
		var viewstate = this.stateManager.getViewstateIdFromUrl();
		this.layoutManager = new SqsLayoutManager(this);
		this.layoutManager.createView("#facet-result-panel", "filters", this.config.facetSectionDefaultWidth, 100-this.config.facetSectionDefaultWidth, {
			rules: [
				{
					type: "show",
					selector: "#domain-menu, #aux-menu",
					evaluator: () => {
						return this.layoutManager.getMode() == "desktopMode";
					}
				},
				{
					type: "show",
					selector: "#facet-menu",
					evaluator: () => {
						let visibleSection = this.layoutManager.getActiveView().getVisibleSection();
						return this.layoutManager.getMode() == "desktopMode" || visibleSection == "left";
					}
				},
				{
					type: "show",
					selector: "#sead-logo",
					evaluator: () => {
						let visibleSection = this.layoutManager.getActiveView().getVisibleSection();
						return this.layoutManager.getMode() == "desktopMode" || visibleSection == "right";
					}
				}
			]
		});
		this.layoutManager.createView("#site-report-panel", "siteReport", 80, 20, {
			collapseIntoVertial: true,
			rules: [
				{
					selector: "#site-report-panel, #site-report-exit-menu"
				},
				{
					type: "show",
					selector: "#domain-menu, #aux-menu, #facet-menu",
					evaluator: false
				}
			]
		});

		//this.layoutManager.setActiveView("filters");

		//this.siteReportLayoutManager = new SqsLayoutManager(this, "#site-report-panel", 80, 20);

		this.menuManager = new SqsMenuManager(this);
		this.dialogManager = new DialogManager(this);
	  	this.tooltipManager = new TooltipManager(this);
		this.facetManager = new FacetManager(this, this.filterDefinitions);
		this.mainMenu = new MainMenu();
		
		this.siteReportManager = new SiteReportManager(this);
		var siteId = this.siteReportManager.getSiteIdFromUrl();

		this.domainManager = new DomainManager(this, "general");
		//this.domainManager.setActiveDomain("general", false);

		this.resultManager = new ResultManager(this);
		this.resultManager.addModule([
			{
				name: "map",
				module: new ResultMap(this.resultManager)
			},
			{
				name: "table",
				module: new ResultTable(this.resultManager)
			},
			{
				name: "mosaic",
				module: new ResultMosaic(this.resultManager)
			}
		]);

		var renderDefaultResult = viewstate === false;
		if(siteId == false) { //Don't bother firing up the result section if a direct request has been made towards a site report
			this.resultManager.setActiveModule(this.config.defaultResultModule, renderDefaultResult);
		}

		if(viewstate != false) {
			this.facetManager.setFacetDataFetchingSuspended(true);
			this.resultManager.setResultDataFetchingSuspended(true);
		}
		
		/*
		if(siteId != false) {
			this.siteReportManager.renderSiteReport(siteId);
		}
		*/

		//this.resultManager.setActiveModule(this.config.defaultResultModule, false);
        /*
        this.resultManager.renderMsg(true, {
            title: "Apply filters",
            body: "You need to narrow down the search result by applying more filters before any result data can be shown here."
        });
        */
	  	
	  	this.help = new HelpAgent();
	  	this.help.setState(true);
		this.userManager = new UserManager(this);
		

		this.menuManager.createMenu(this.resultManager.sqsMenu());

		var auxMenuDef = {
			title: "<i class=\"fa fa-bars\" style='font-size: 1.5em' aria-hidden=\"true\"></i>",
			anchor: "#aux-menu"
		};
		
		var auxMenu = this.menuManager.combineMenus(auxMenuDef, [
			this.stateManager.sqsMenu(),
			this.dialogManager.sqsMenu(),
			//this.userManager.sqsMenu(),
			this.help.sqsMenu()
		]);

		this.menuManager.createMenu(auxMenu);

		
		//this.menuManager.createMenu(this.domainManager.sqsMenu());
		

		this.facetManager.buildFilterStructure("general");

		if(viewstate != false) {
			this.stateManager.loadStateById(viewstate);
		}
		
		this.router = new Router(this);

	  	this.modules.push(this.stateManager);
		this.modules.push(this.layoutManager);
		this.modules.push(this.facetManager);
		this.modules.push(this.resultManager);
		this.modules.push(this.menuManager);
		this.modules.push(this.dialogManager);
		this.modules.push(this.siteReportManager);
		this.modules.push(this.router);
		this.modules.push(this.help);
		for(var key in this.resultManager.modules) {
			this.modules.push(this.resultManager.modules[key].module);
		}

		if(this.config.cookieWarningEnabled) {
			window.cookieconsent.initialise({
				container: document.getElementById("cookie-consent-content"),
				palette:{
					popup: {background: css.paneBgColor},
					button: {background: css.auxColor},
				},
				revokable:true,
				onStatusChange: function(status) {
					console.log(this.hasConsented() ? 'enable cookies' : 'disable cookies');
				},
				position: 'bottom-right',
				content: {
					header: 'Cookies used on the website!',
					message: Config.legalNoticeMsg,
					dismiss: 'I agree'
				},
				showLink: false,
				law: {
					regionalLaw: false,
				},
				location: true,
				expiryDays: -1,
				onPopupOpen: () => {
					$("#privacy-policy-link").on("click", (evt) => {
						evt.stopPropagation();
						var content = $("#gdpr-infobox").html();
						window.sqs.dialogManager.showPopOver("Legal policy", content);
					});
				}
			});

			
		}

		this.renderTimelineDummyWarning();

		this.systemReady = true;
		this.sqsEventDispatch("sqsInitComplete");
		this.router.route();
	}

	/*
	renderUI() {
		let renderMode = this.layoutManager.getMode(); //"mobileMode" or "desktopMode"
		let view = this.getActiveView(); //"filters" or "siteReport"

		if(view == "filters") {

		}
	}
	*/
	

	/*
	* Function: preload
	*
	* This function is meant to augment the Config object by fetch certain data about the SEAD system which is stored in the db.
	* An example of this is the definitions of the various data types which may be associated with an analysis performed on a sample.
	* It would be inefficient to fetch this data every time we spawn a site report and it would be bad practice to have it
	* in static code, so here we are.
	 */
	async preload() {
		let fetchApiVersion = new Promise((resolve, reject) => {
			$.ajax(this.config.serverAddress+"/api/values", {
				method: "get",
				dataType: "json",
				timeout: Config.preloadTimeout,
				success: (data) => {
					this.apiVersion = data[0]+data[1];
					resolve(data);
				},
				error: (e) => {
					reject(e);
				}
			});
		});

		let fetchFacetDefinitionsPromise = new Promise((resolve, reject) => {
			$.ajax(this.config.serverAddress+"/api/facets", {
				method: "get",
				dataType: "json",
				timeout: Config.preloadTimeout,
				success: (data) => {
					this.importFilters(data);
					resolve(data);
				},
				error: (e) => {
					reject(e);
				}
			});
		});

		let fetchDomainDefinitionsPromise = new Promise((resolve, reject) => {
			$.ajax(this.config.serverAddress+"/api/facets/domain", {
				method: "get",
				dataType: "json",
				timeout: Config.preloadTimeout,
				success: async (data) => {
					await this.importDomains(data);
					resolve(data);
				},
				error: (e) => {
					reject(e);
				}
			});
		});
		

		let fetchDataTypesPromise = new Promise((resolve, reject) => {
			$.ajax(this.config.siteReportServerAddress+"/data_types", {
				method: "get",
				dataType: "json",
				timeout: Config.preloadTimeout,
				beforeSend: () => {
				
				},
				success: (data, textStatus, xhr) => {
					this.config.dataTypes = [];
					for(var key in data) {
						this.config.dataTypes.push({
							"groupId": data[key].data_type_group_id,
							"dataTypeId": data[key].data_type_id,
							"dataTypeName": data[key].data_type_name,
							"definition": data[key].definition
						});
					}
					resolve(data);
				},
				error: (e) => {
					reject(e);
				}
			});
		});
		
		let fetchDatasetMasters = new Promise((resolve, reject) => {
			$.ajax(this.config.siteReportServerAddress+"/dataset_masters", {
				method: "get",
				dataType: "json",
				timeout: Config.preloadTimeout,
				success: (data, textStatus, xhr) => {
					this.config.dataSetMasters = [];
					for(var key in data) {
						this.config.dataSetMasters.push({
							"masterSetId": data[key].master_set_id,
							"masterName": data[key].masterName,
							"masterNotes": data[key].master_notes,
							"url": data[key].url
						});
					}
					resolve(data);
				},
				error: (e) => {
					reject(e);
				}
			});
		});

		return await Promise.all([fetchApiVersion, fetchFacetDefinitionsPromise, fetchDataTypesPromise, fetchDatasetMasters, fetchDomainDefinitionsPromise]);
	}

	importFilters(data) {
		for(let key in data) {
			let filter = data[key];

			let filterGroup = this.getFilterGroupById(filter.FacetGroupKey);
			if(filterGroup === false) {
				filterGroup = {
					"facetGroupKey":filter.FacetGroupKey,
					"displayTitle":filter.FacetGroup.DisplayTitle,
					"items":[]
				};
				this.filterDefinitions.push(filterGroup);
			}

			if(filter.IsApplicable) {
				filterGroup.items.push({
					"facetCode": filter.FacetCode,
					"displayTitle": filter.DisplayTitle,
					"facetTypeKey": filter.FacetTypeKey, //"discrete" or "range"
					"aggregateType": filter.AggregateType,
					"aggregateTitle": filter.AggregateTitle,
					"dependencies": [],
					"description": filter.Description,
					"enabled": true
				});
			}
		}
	}

	async importDomains(domains) {
		let fetchDomainFiltersPromises = [];
		//First create the "general" domain since we need it for internal use, but the server doesn't provide it
		domains.unshift({
			FacetId: false,
			FacetCode: "general",
			DisplayTitle: "General",
			Description: "General domain facet",
			FacetGroupKey: "DOMAIN",
			FacetTypeKey: "discrete",
			IsApplicable: false,
			IsDefault: false,
			AggregateType: "count",
			AggregateTitle: "Number of datasets",
			FacetGroup: {
				FacetGroupKey: "DOMAIN",
				DisplayTitle: "Domain facets",
				Description: "DOMAIN"
			}
		});

		//Fetch the filters associated with each domain/domain
		domains.forEach((domain) => {
			fetchDomainFiltersPromises.push(new Promise((resolve, reject) => {
				$.ajax(this.config.serverAddress+"/api/facets/domain/"+domain.FacetCode, {
					method: "get",
					dataType: "json",
					success: (data) => {
						domain.Facets = data;
						resolve(data);
					},
					error: (e) => {
						reject(e);
					}
				});
			}));
		});

		await Promise.all(fetchDomainFiltersPromises).then((data) => {

			domains.forEach((domain) => {
				let domainFacetCodes = [];
				domain.Facets.forEach((facet) => {
					domainFacetCodes.push(facet.FacetCode);
				});

				let domainConfigObject = null;
				Config.domains.forEach((cd) => {
					if(cd.name == domain.FacetCode) {
						domainConfigObject = cd;
					}
				});

				if(domainConfigObject != null) {
					domainConfigObject.title = domain.DisplayTitle;
					domainConfigObject.filters = domainFacetCodes;
				}
			});
		});
	}

	getFilterGroupById(groupId) {
		for(let key in this.filterDefinitions) {
			let group = this.filterDefinitions[key];
			if(group.facetGroupKey == groupId) {
				return group;
			}
		}
		return false;
	}

	init() {
	}
	
	//FIXME: Maybe this can be made static?
	sqsEventDispatch(eventName, args) {
		//console.log("Event dispatch:", eventName, args);
		$.event.trigger(eventName, args);
	}

	sqsEventListen(eventName, callback = null, owner = null) {
		var eventAlreadyRegistered = false;
		for(var key in this.sqsEventRegistry) {
			if (this.sqsEventRegistry[key].eventName == eventName) {
				eventAlreadyRegistered = true;
			}
		}
		
		this.sqsEventRegistry.push({
			eventName: eventName,
			callback: callback,
			owner: owner
		});
		
		if (eventAlreadyRegistered === false) {
			$(window).on(eventName, (event, data) => {
				for (var key in this.sqsEventRegistry) {
					if (this.sqsEventRegistry[key].eventName == eventName) {
						this.sqsEventRegistry[key].callback(event, data);
					}
				}
			});
		}
		
	}
	
	sqsEventUnlisten(eventName, owner = null) {
		//console.log("sqsEventUnlisten", eventName);

		//Remove event from internal registry
		for(var key in this.sqsEventRegistry) {
			if(this.sqsEventRegistry[key].eventName == eventName && this.sqsEventRegistry[key].owner === owner) {
				//console.log("Removing event ", eventName, " for owner ", owner, " from registry");
				this.sqsEventRegistry.splice(key, 1);
			}
		}
		
		var eventStillExistsInRegistry = false;
		for(var key in this.sqsEventRegistry) {
			if(this.sqsEventRegistry[key].eventName == eventName) {
				eventStillExistsInRegistry = true;
			}
		}

		//If there are other owners which still has this event registrered, don't actually deactivate it
		if(eventStillExistsInRegistry === false) {
			//console.log("de-registering event ", eventName);
			$(window).off(eventName);
		}
	}

	
	sqsEventListenToGroup(events, callback = null, owner = null) {

		let handlerFunc = (evt, data) => {
			for(let k in this.eventGroups) {
				let i = $.inArray(evt.type, this.eventGroups[k].events);
				if(i != -1) {
					this.eventGroups[k].firedEvents.push(this.eventGroups[k].events[i]);
				}

				let groupComplete = true;
				for(let k2 in this.eventGroups[k].events) {
					let event = this.eventGroups[k].events[k2];
					if($.inArray(event, this.eventGroups[k].firedEvents) == -1) {
						groupComplete = false;
					}
				}
				if(groupComplete) {
					//console.log("Group complete", this.eventGroups[k])
					this.eventGroups[k].callback();
					for(let k3 in this.eventGroups[k].events) {
						this.sqsEventUnlisten(this.eventGroups[k].events[k3]);
					}
					this.eventGroups.splice(k, 1);
				}
			}
		}

		this.eventGroups.push({
			owner: owner,
			events: events,
			firedEvents: [],
			callback: callback,
			handler: handlerFunc
		});
		
		for(let key in events) {
			this.sqsEventListen(events[key], handlerFunc);
		}
		
	}

	sqsOffer(offerName, offerData) {
		for(var key in this.modules) {
			if(typeof(this.modules[key].sqsOffer) == "function") {
				offerData = this.modules[key].sqsOffer(offerName, offerData);
			}
		}
		return offerData;
	}
	
	setActiveView(viewName) {
		console.log("setActiveView", viewName);
		this.activeView = viewName;
		if(this.layoutManager instanceof SqsLayoutManager) {
			this.layoutManager.setActiveView(viewName);
		}
	}

	getActiveView() {
		return this.activeView;
	}
	
	runSiteReportTesting(siteReportId = null, once = false) {
		console.log("Running site report testing...");
		
		if(siteReportId == null) {
			siteReportId = 1;
		}
		this.siteReportTestingInterval = setInterval(() => {
			
			if(once) {
				clearInterval(this.siteReportTestingInterval);
			}
			
			var srd = new SiteReportData(this, siteReportId);
			//console.log(srd);
			srd.fetch(() => {
				console.log("OK  ", siteReportId);
				siteReportId++;
				srd.destroy();
			});
			
			
		}, 2500);
	}
	
	stopSiteReportTesting() {
		clearInterval(this.siteReportTestingInterval);
	}
	
	
	/*
	* Function: pushXhr
	*
	* See also:
	* pushXhr
	 */
	pushXhr(xhr = null, eventOnComplete = null) {
		var insert = {
			"xhr": xhr,
			"eventOnComplete": eventOnComplete
		};
		this.xhrList.push(insert);
		
		//console.log("XHR-PUSH:", insert);
		
		return insert;
	}
	
	/*
	* Function: popXhr
	*
	* See also:
	* pushXhr
	 */
	popXhr(xhr) {
		//console.log("XHR-POP:", xhr);
		for(var key in this.xhrList) {
			if(this.xhrList[key].xhr === xhr.xhr) {
				var splicedXhr = this.xhrList.splice(key, 1)[0];
				if(splicedXhr.eventOnComplete != null) {
					if(this.getXhrByEvent(splicedXhr.eventOnComplete).length == 0) {
						//No more pending xhr's with this event name, so dispatch the event in question
						this.sqsEventDispatch(splicedXhr.eventOnComplete);
					}
				}
				return splicedXhr;
			}
		}
	}
	
	getXhrByEvent(eventName) {
		var list = [];
		for(var key in this.xhrList) {
			if(this.xhrList[key].eventOnComplete == eventName) {
				list.push(this.xhrList[key]);
			}
		}
		return list;
	}
	
	
	/*
	* Function: scanXhrCallbackRegistry
	*
	 */
	scanXhrCallbackRegistry() {
		for(var key in this.xhrCallbackRegistry) {
			if(this.xhrTagExistsInRegistry(this.xhrCallbackRegistry[key].tag) === false) {
				this.xhrCallbackRegistry[key].callback();
				this.xhrCallbackRegistry.splice(key, 1);
			}
		}
		
		if(this.xhrCallbackRegistry.length > 0) {
			setTimeout(() => {
				this.scanXhrCallbackRegistry();
			}, 100);
		}
	}
	
	xhrTagExistsInRegistry(tag) {
		for(var key in this.xhrList) {
			if(this.xhrList[key].tag == tag) {
				return true;
			}
		}
		return false;
	}
	
	getPendingXhrStats() {
		var blocking = 0;
		var nonBlocking = 0;
		for (var key in this.xhrList) {
			if (this.xhrList[key].blocking) {
				blocking++;
			}
			else {
				nonBlocking++;
			}
		}
		return {
			"blocking": blocking,
			"nonBlocking": nonBlocking
		};
	}
	
	findObjectPropInArray(arr, prop, needle) {
		for(var key in arr) {
			if(arr[key][prop] == needle) {
				return key;
			}
		}
		return false;
	}

	/*
	* Function: formatTaxon
	* Parameters:
	* taxon
	* html
	* abundanceId - Optional. Specifies the abundance counting context (if any).
	* taxon_identification_levels - Optional. Specifies identifications levels.
	*/
	formatTaxon(taxon, html = true, abundanceId = null, taxon_identification_levels = null) {
		
		let familyName = taxon.family_name;
		let genusName = taxon.genus_name;
		let species = taxon.species;

		let modified = false;

		if(taxon_identification_levels != null && abundanceId != null) {
			for(let key in taxon_identification_levels) {
				if(taxon_identification_levels[key].abundance_id == abundanceId) {
					if(taxon_identification_levels[key].identification_level_name == "c.f. Family" || taxon_identification_levels[key].identification_level_name == "Family") {
						familyName = "c.f. "+familyName;
						modified = true;
					}
					if(taxon_identification_levels[key].identification_level_name == "c.f. Genus" || taxon_identification_levels[key].identification_level_name == "Genus") {
						genusName = "c.f. "+genusName;
						modified = true;
					}
					if(taxon_identification_levels[key].identification_level_name == "c.f. Species" || taxon_identification_levels[key].identification_level_name == "Species") {
						species = "c.f. "+species;
						modified = true;
					}
				}
			}
		}
		
		let isPlant = false; //We don't have data on plant or not plant atm, so just assume it's always not, for now

		let tf = "";
		if(!isPlant) { //Don't print out the family name if this is a plant
			tf += familyName+", ";
		}
		if(html) { tf += "<span style='font-style:italic;'>"; }
		tf += genusName;
		if(html) { tf += "</span>"; }
		tf += " ";
		if(html) { tf += "<span style='font-style:italic;'>"; }
		tf += species;
		if(html) { tf += "</span>"; }
		
		if(typeof(taxon.author_name) != "undefined" && taxon.author_name != null) {
			tf += " ";
			tf += taxon.author_name;
		}
		/*
		if(modified) {
			console.log(tf);
		}
		*/

		return tf;
	}

	copyObject(obj) {
		return JSON.parse(JSON.stringify(obj));
	}

	getExtremePropertyInList(data, property, highOrLow = "high") {
		let extremeKey = null;
		for(let key in data) {
			if(highOrLow == "high") {
				if(extremeKey == null || data[key][property] > data[extremeKey][property]) {
					extremeKey = key;
				}
			}
			if(highOrLow == "low") {
				if(extremeKey == null || data[key][property] < data[extremeKey][property]) {
					extremeKey = key;
				}
			}
		}
		if(extremeKey == null) {
			return false;
		}
		return data[extremeKey];
	}

	renderTimelineDummyWarning() {
		setTimeout(() => {
			if($(".timeline-chart-container").length) {
				let pos = $(".timeline-chart-container").offset();
				let top = pos.top - 100;
				let left = pos.left - 20;
				let dummyWarningNode = $("<div id='timeline-dummy-warning' style='left:"+left+"px; top:"+top+"px;'>DUMMY</div>");
				$(".timeline-chart-container").append(dummyWarningNode);
			}
		}, 1000);
		
	}
	
	/*
	* Function: getTaxa
	* 
	* 
	*/
	async fetchTaxa(taxonList) {
		let queries = [];
		let itemsLeft = taxonList.length;
		if(taxonList.length > 0) {
			let taxonQueryString = "(";
			for(let key in taxonList) {
				taxonQueryString += "taxon_id.eq."+taxonList[key]+",";
				if(taxonQueryString.length > 1024 && itemsLeft > 1) { //HTTP specs says max 2048
					taxonQueryString = taxonQueryString.substr(0, taxonQueryString.length-1);
					taxonQueryString += ")";
					queries.push(taxonQueryString);
					taxonQueryString = "(";
				}
				itemsLeft--;
			}
			taxonQueryString = taxonQueryString.substr(0, taxonQueryString.length-1);
			taxonQueryString += ")";
			queries.push(taxonQueryString);
		}

		let queryData = [];
		for(let key in queries) {
			let requestString = this.config.siteReportServerAddress+"/qse_taxon?or="+queries[key];
			
			let result = await $.ajax(requestString, {
				method: "get",
				dataType: "json",
				success: (data) => {
					data.map((t) => {
						this.taxa.push(t);
					});
				}
			});
			for(let i in result) {
				queryData.push(result[i]);
			}
		}
		return queryData;
	}

	getTaxaById(taxonId) {
		let taxonObj = false;
		this.taxa.map((t) => {
			if(t.taxon_id == taxonId) {
				taxonObj = t;
			}
		});
		return taxonObj;
	}

	/*
	* Function: fetchFromTablePairs
	*
	* Similar to fetchFromTable but for when you need to use multiple columns in combination as a primary key.
	*
	* Parameters:
	* tableName
	* fetchParams
	* 
	* Returns:
	* A promise.
	*
	* See also:
	* fetchFromTable
	*/
	async fetchFromTablePairs(tableName, fetchParams) {
		let queries = [];
		let itemsLeft = fetchParams.length;

		let queryString = "(";
		for(let key in fetchParams) {
			let columns = Object.keys(fetchParams[key]);

			let searchAtom = "";
			for(let ck in columns) {
				searchAtom += columns[ck]+".eq."+fetchParams[key][columns[ck]]+",";
			}

			searchAtom = searchAtom.substr(0, searchAtom.length-1);
			searchAtom = "and("+searchAtom+"),";

			queryString += searchAtom;
			if(queryString.length > 1024 && itemsLeft > 1) { //HTTP specs says max 2048
				queryString = queryString.substr(0, queryString.length-1);
				queryString += ")";
				queries.push(queryString);
				queryString = "(";
			}
			itemsLeft--;
		}
		queryString = queryString.substr(0, queryString.length-1);
		queryString += ")";

		if(fetchParams.length == 0) {
			console.warn("Function fetchFromTablePairs was called with an empty list of fetchParams - which seems kind of strange!");
			return;
		}

		queries.push(queryString);

		let queryData = [];
		let promises = [];
		for(let key in queries) {
			let requestString = this.config.siteReportServerAddress+"/"+tableName+"?or="+queries[key];
			
			let p = new Promise((resolve, reject) => {
				$.ajax(requestString, {
					method: "get",
					dataType: "json",
					success: (data) => {
						resolve(data);
					},
					error: () => {
						reject();
					}
				});
			});

			promises.push(p);
		}

		let rData = [];
		return await new Promise((resolve, reject) => {
			Promise.all(promises).then((data) => {
				for(let key in data) {
					rData = rData.concat(data[key]);
				}
				resolve(rData);
			});
		});
	}

	/*
	* Function: fetchFromTable
	*
	* A lot of times you need to fetch a bunch of rows from the database via the PostgREST interface, defined by a list of IDs.
	* This is a function which will do that for you, given then table name, column name and list of IDs it will construct and execute an efficient HTTP query by chaining the IDs in the request.
	*
	* Parameters:
	* tableName - Database name of the table (actually view) in the postgrest_api schema.
	* columnName - The column name you wish to search for the IDs in.
	* fetchIds - The IDs to search for.
	*
	* Returns:
	* A promise.
	*/
	async fetchFromTable(tableName, columnName, fetchIds) {
		if(fetchIds.length == 0) {
			return [];
		}

		let queries = [];
		let itemsLeft = fetchIds.length;

		let queryString = "(";
		for(let key in fetchIds) {
			queryString += columnName+".eq."+fetchIds[key]+",";
			if(queryString.length > 1024 && itemsLeft > 1) { //HTTP specs says max 2048
				queryString = queryString.substr(0, queryString.length-1);
				queryString += ")";
				queries.push(queryString);
				queryString = "(";
			}
			itemsLeft--;
		}
		queryString = queryString.substr(0, queryString.length-1);
		queryString += ")";
		queries.push(queryString);

		let queryData = [];
		let promises = [];
		for(let key in queries) {
			let requestString = this.config.siteReportServerAddress+"/"+tableName+"?or="+queries[key];
			
			let p = new Promise((resolve, reject) => {
				$.ajax(requestString, {
					method: "get",
					dataType: "json",
					success: (data) => {
						resolve(data);
					},
					error: () => {
						reject();
					}
				});
			});

			promises.push(p);
		}

		let rData = [];
		return await new Promise((resolve, reject) => {
			Promise.all(promises).then((data) => {
				for(let key in data) {
					rData = rData.concat(data[key]);
				}
				resolve(rData);
			});
		});
	}

	storeUserSettings(settings) {
		let userSettingsJson = window.localStorage.getItem("sqsUserSettings");
		let userSettings;
		if(!userSettingsJson) {
			userSettings = {};
		}
		else {
			userSettings = JSON.parse(userSettingsJson);
		}
		
		Object.keys(settings).forEach((key) => {
			userSettings[key] = settings[key]
		});
		window.localStorage.setItem("sqsUserSettings", JSON.stringify(userSettings));
	}

	loadUserSettings(mainConfig) {
		let userSettingsJson = window.localStorage.getItem("sqsUserSettings");
		if(!userSettingsJson) {
			return mainConfig;
		}
		let userSettings = JSON.parse(userSettingsJson);
		Object.keys(userSettings).forEach((key) => {
			mainConfig[key] = userSettings[key]
		});
		return mainConfig;
	}
	
}

export { SeadQuerySystem as default }