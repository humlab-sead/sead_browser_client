import Config from '../config/config.json';
import Color from './Color.class.js';
import FacetManager from './FacetManager.class.js';
import SqsLayoutManager from './SqsLayoutManager.class.js';
import MainMenu from './MainMenu.class.js'
import SqsMenuManager from './SqsMenuManager.class';
import ResultManager from './Result/ResultManager.class.js';
import ResultMap from './Result/ResultMap.class.js'
import ResultTable from './Result/ResultTable.class.js'
import ResultMosaic from './Result/ResultMosaic.class.js'
import TaxaModule from './Common/TaxaModule.class.js'
import StateManager from './StateManager.class.js';
import DialogManager from './DialogManager.class.js';
import TooltipManager from './TooltipManager.class.js';
import SiteReportManager from './SiteReportManager.class';
import HelpAgent from './HelpAgent.class.js';
import UserManager from './UserManager.class.js';
import DomainManager from './DomainManager.class.js';
import NotificationManager from './NotificationManager.class.js';
import Router from './Router.class.js';
import Tutorial from './Tutorial.class.js';
import { nanoid } from 'nanoid';

//import css from '../stylesheets/style.scss';

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
		this.requestUrl = null;

		$("#sead-release-version").text(this.config.version);

		this.storeUserSettings(this.config);

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

	setNoDataMsg(containerNode, set = true) {
		//Remove any overlay box that might already exist in this container (effectively overwriting that msg)
		$(".overlay-msg-box", containerNode).remove();
		
		if(set) {
			const noDataBoxFrag = document.getElementById("no-data-box");
			const noDataBox = document.importNode(noDataBoxFrag.content, true);
			$(containerNode).html("");
			$(containerNode).append(noDataBox);
		}
		else {
			$(containerNode).html("");
		}
	}

	setLoadingIndicator(containerNode, set = true) {
		//Remove any overlay box that might already exist in this container (effectively overwriting that msg)
		$(".overlay-msg-box", containerNode).remove();
				
		if(set) {
			const frag = document.getElementById("logo-loading-indicator");
			const node = document.importNode(frag.content, true);
			$(containerNode).html("");
			$(containerNode).append(node);
		}
		else {
			$(containerNode).html("");
		}

		/*
		if(set) {
			const boxFrag = document.getElementById("logo-loading-indicator");
			const box = document.importNode(boxFrag.content, true);
			$(containerNode).html("");
			$(containerNode).append(box);
		}
		else {
			$(containerNode).html("");
		}
		*/

		/*
		//Remove any overlay box that might already exist in this container (effectively overwriting that msg)
		$(".overlay-msg-box", containerNode).remove();

		if(set) {
			$(containerNode).append("<div class='overlay-msg-box foreground-loading-indicator result-mosaic-loading-indicator-bg'></div>")
		}
		else {
			$(".foreground-loading-indicator", containerNode).remove();
		}
		*/
	}

	setBgLoadingIndicator(containerNode, set = true) {
		if(set) {
			//Remove any overlay box that might already exist in this container (effectively overwriting that msg)
			//$(".overlay-msg-box", containerNode).remove();
			$(containerNode).addClass("result-mosaic-loading-indicator-bg");
		}
		else {
			$(containerNode).removeClass("result-mosaic-loading-indicator-bg");
		}
	}

	bootstrapSystem() {

		$("#preload-loading-indicator").remove();
		$("#header-container").css("display", "flex");

		this.color = new Color();
		for(let key in this.bugsEcoCodeDefinitions) {
			for(let colorKey in Config.ecocodeColors) {
				if(Config.ecocodeColors[colorKey].ecocode_definition_id == this.bugsEcoCodeDefinitions[key].ecocode_definition_id) {
					this.bugsEcoCodeDefinitions[key].color = Config.ecocodeColors[colorKey].color;
				}
			}
		}
		this.stateManager = new StateManager(this);
		var viewstate = this.stateManager.getViewstateIdFromUrl();
		this.layoutManager = new SqsLayoutManager(this);
		this.layoutManager.createView("#filter-view-main-container", "filters", this.config.facetSectionDefaultWidth, 100-this.config.facetSectionDefaultWidth, {
			rules: [
				{
					type: "show",
					selector: "#domain-menu, #aux-menu-button",
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
		this.layoutManager.createView("#site-report-main-container", "siteReport", 80, 20, {
			collapseIntoVertial: true,
			rules: [
				/*
				{
					selector: "#site-report-main-container, #site-report-exit-menu"
				},
				{
					type: "show",
					selector: "#domain-menu, #aux-menu-button, #facet-menu",
					evaluator: false
				}
				*/
			]
		});

		//let domainBox = document.querySelector("#filter-menu-svg").getElementById("domain-menu");
		//let filterBox = document.querySelector("#filter-menu-svg").getElementById("facet-menu");
		
		/*
		$(domainBox).on("mouseover", () => {
			this.svgSetFill(domainBox, "#2d5e8d");
		});
		$(domainBox).on("mouseout", () => {
			this.svgSetFill(domainBox, "#444");
		});
		*/
		/*
		$(filterBox).on("mouseover", () => {
			this.svgSetFill(filterBox, "#3978b4");
		});
		$(filterBox).on("mouseout", () => {
			this.svgSetFill(filterBox, "#2d5e8d");
		});
		*/
		
		

		//this.layoutManager.setActiveView("filters");

		//this.siteReportLayoutManager = new SqsLayoutManager(this, "#site-report-panel", 80, 20);

		this.notificationManager = new NotificationManager(this);
		this.menuManager = new SqsMenuManager(this);
		this.dialogManager = new DialogManager(this);
	  	this.tooltipManager = new TooltipManager(this);
		this.facetManager = new FacetManager(this, this.filterDefinitions);
		this.mainMenu = new MainMenu();
		this.tutorial = new Tutorial(this);
		
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

		/*
		if(this.config.resultTaxonModuleEnabled) {
			this.resultManager.addModule({
				name: "taxon",
				module: new TaxaModule(this)
			});
		}
		*/

		this.taxaModule = new TaxaModule(this);

		this.menuManager.createMenu(this.resultManager.sqsMenu());

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

		var auxMenuDef = {
			anchor: "#aux-menu",
			triggers: [{
				selector: "#aux-menu-button",
				on: "click"
			}]
		};
		
		var auxMenu = this.menuManager.combineMenus(auxMenuDef, [
			this.stateManager.sqsMenu(),
			this.dialogManager.sqsMenu(),
			this.help.sqsMenu(),
			this.tutorial.sqsMenu(),
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

		//FIXME: This is dumb, because this should be handled by the import of the css at the head of this file
		//but that stopped working for some reason when updating webpack, so now I'm doing it like this as a temporary measure
		const css = {
			paneBgColor: "#eeeeee",
			auxColor: "#ff6600"
		};

		if(this.config.cookieWarningEnabled) {
			window.cookieconsent.initialise({
				container: document.getElementById("cookie-consent-content"),
				palette:{
					popup: { background: css.paneBgColor },
					button: { background: css.auxColor },
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

		this.systemReady = true;
		this.sqsEventDispatch("sqsInitComplete");
		this.router.route();
		this.tutorial.init();
	}

	//resets the UI to the initial state, removes any filters and so on
	reset() {
		this.layoutManager.setActiveView("filters");
		this.domainManager.setActiveDomain("general");
		this.resultManager.setActiveModule(this.config.defaultResultModule, true);
		this.facetManager.reset();
		this.menuManager.resetAll();
	}

	/*
	renderUI() {
		let renderMode = this.layoutManager.getMode(); //"mobileMode" or "desktopMode"
		let view = this.getActiveView(); //"filters" or "siteReport"

		if(view == "filters") {

		}
	}
	*/

	svgSetFill(element, color) {
		let style = element.getAttribute("style");
		let styleAttrs = style.split(";");
		let newStyleString = "";
		styleAttrs.forEach(styleAttr => {
			if(styleAttr.length > 0) {
				let attrParts = styleAttr.split(":");
				let name = attrParts[0];
				let value = attrParts[1];
				if(name == "fill") {
					value = color;
				}
				newStyleString += name+":"+value+";";
			}
		});
		element.setAttribute("style", newStyleString);
	}

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
					if(!data) {
						data = [];
					}
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

		fetch(this.config.siteReportServerAddress+"/ecocode_definitions?ecocode_group_id=eq.2")
		.then((response) => response.json())
		.then(ecocodes => {
			this.bugsEcoCodeDefinitions = ecocodes;
		});

		return await Promise.all([fetchApiVersion, fetchFacetDefinitionsPromise, fetchDataTypesPromise, fetchDatasetMasters, fetchDomainDefinitionsPromise]);
	}

	importFilters(data) {

		const customDescriptions = [
			{
				facetCode: "tbl_denormalized_measured_values_33_0",
				description: "Measure of the degree to which a material can be magnetized in the presence of an external magnetic field.",
			},
			{
				facetCode: "tbl_denormalized_measured_values_33_82",
				description: "Measurement of the magnetic susceptibility of a sample at a heating temperature of 550°C.",
			},
			{
				facetCode: "tbl_denormalized_measured_values_32",
				description: "Amount of weight lost by a sample when heated to a high temperature, indicating the presence of organic substances."
			},
			{
				facetCode: "tbl_denormalized_measured_values_37",
				description: "Concentration of phosphate compounds in a sample, often used as an indicator of nutrient availability or pollution."
			},
			{
				facetCode: "record_types",
				description: "Types of proxy measurements used to infer past environmental or climatic conditions."
			},
			{
				facetCode: "feature_type",
				description: "Refers to the classification or categorization of specific geological, environmental, or cultural features associated with the samples"
			},
			{
				facetCode: "abundance_classification",
				description: "Grouping or categorization of samples based on their relative abundance levels within a given context or ecosystem"
			},
			{
				facetCode: "abundances_all",
				description: "The quantitative measurements or levels of abundance observed across different samples, indicating the relative presence or distribution of certain elements, species, or entities"
			},
			{
				facetCode: "dataset_master",
				description: "Main datasets filtered by the data provider organisation."
			},
			{
				facetCode: "dataset_methods",
				description: "The various methods and techniques used for collecting and analyzing data within a dataset"
			},
			{
				facetCode: "region",
				description: "The geographic region, modern or historical, where the samples were collected"
			},
			{
				facetCode: "data_types",
				description: "Types of data generated by an analysis."
			},
			{
				facetCode: "rdb_systems",
				description: "Red Data Book systems are used to classify and document the conservation status of species and ecosystems."
			},
			{
				facetCode: "rdb_codes",
				description: "Red Data Book codes are used to classify and document the conservation status of species and ecosystems."
			},
			{
				facetCode: "modification_types",
				description: "Types of modifications of a sample, such as it being a fragment or carbonised."
			},
			{
				facetCode: "abundance_elements",
				description: "The part (element) of the plant or animal that was counted in the abundance count."
			},
			{
				facetCode: "sample_group_sampling_contexts",
				description: "The context in which the sample was collected."
			},
			{
				facetCode: "construction_type",
				description: "Part of the building that was sampled."
			},
			{
				facetCode: "activeseason",
				description: "Season in which an insect has been observed to be active."
			}
		];

		const filterBlacklist = [
			"abundance_classification", //500 error
			"dataset_methods" //returns zero rows of data
		];

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
				if(filter.FacetCode == "ecocode") { //SPECIAL SPECIAL SPECIAL
					filter.FacetTypeKey = "multistage";
					filter.stagedFilters = ["ecocode_system", "ecocode"];
				}

				if(!filterBlacklist.includes(filter.FacetCode)) {
					let customDesc = customDescriptions.find((item) => item.facetCode == filter.FacetCode);
					filterGroup.items.push({
						"facetCode": filter.FacetCode,
						"displayTitle": filter.DisplayTitle,
						"facetTypeKey": filter.FacetTypeKey, //"discrete" or "range"
						"aggregateType": filter.AggregateType,
						"aggregateTitle": filter.AggregateTitle,
						"dependencies": [],
						"description": customDesc ? customDesc.description : filter.Description,
						"stagedFilters": filter.stagedFilters,
						"enabled": true
					});
				}
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
		this.activeView = viewName;
		if(this.layoutManager instanceof SqsLayoutManager) {
			this.layoutManager.setActiveView(viewName);
		}
		else {
			console.warn("Ignoring request to setActiveView because there's no LayoutManager.");
		}
	
		//dispatch view change event
		this.sqsEventDispatch("viewChange", {
			viewName: viewName
		});

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

	/**
	 * formatTaxon
	 * 
	 * All that was old is new again
	 * 
	 * @param {*} taxon - taxon in the sead data server format 
	 * @param {*} identificationLevels - idenfication levels in the sead data server format
	 */
	 formatTaxon(taxon, identificationLevels = null, html = true, asLink = false) {

		let familyName = taxon.family.family_name;
		let genusName = taxon.genus.genus_name;
		let species = taxon.species;

		let modified = false;

		if(identificationLevels != null) {
			for(let key in identificationLevels) {
				if(identificationLevels[key].identification_level_name == "c.f. Family" || identificationLevels[key].identification_level_name == "Family") {
					familyName = "c.f. "+familyName;
					modified = true;
				}
				if(identificationLevels[key].identification_level_name == "c.f. Genus" || identificationLevels[key].identification_level_name == "Genus") {
					genusName = "c.f. "+genusName;
					modified = true;
				}
				if(identificationLevels[key].identification_level_name == "c.f. Species" || identificationLevels[key].identification_level_name == "Species") {
					species = "c.f. "+species;
					modified = true;
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
		
		if(typeof(taxon.author) != "undefined" && taxon.author != null) {
			tf += " ";
			tf += taxon.author.author_name;
		}

		if(asLink) {
			let linkId = "taxon-link-"+taxon.taxon_id;
			tf = "<span id='"+linkId+"' class='taxon-link' onclick='window.sqs.taxaModule.renderTaxon("+taxon.taxon_id+")'>"+tf+"</span>";
		}

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

	loadUserSettings() {
		let mainConfig = this.config;
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

	parseStringValueMarkup(value, ttOptions = { drawSymbol: true }) {
		if(typeof value == "undefined") {
			console.warn("An undefined value was passed into parseStringValueMarkup");
			return undefined;
		}
		value = value.toString();
		if(typeof value != "string") {
			return "";
		}
		value = value.replace(/(\r\n|\n|\r)/gm, ""); //Strip newlines since they break the pattern matching
		//The pattern here is: !%data:<data>:!%tooltip:<tooltip>:! - I think, try it!
		let result = value.replace(/(?!.*!%data)*!%data:(.*?):!%tooltip:(.*?):!(?!.*!%data)*/g, (match, ttAnchor, ttText, offset, string, groups) => {
			let nodeId = "cell-value-"+nanoid();
			let tt = this.tooltipManager.registerTooltip("#"+nodeId, ttText, ttOptions);
			//this.tooltipIds.push(tt);
			return "<span id='"+nodeId+"'>"+ttAnchor+"</span>";
		});

		return result;
	}

	matomoTrackPageView(pageTitle = "Unknown page") {
		if(this.config.pageTrackingEnabled) {
			_paq.push(['setCustomUrl', '/' + window.location.hash.substr(1)]);
			_paq.push(['setDocumentTitle', pageTitle]);
			_paq.push(['trackPageView']);
		}
	}
	
	
}

export { SeadQuerySystem as default }