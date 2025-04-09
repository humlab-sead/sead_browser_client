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
import ResultGlobe from './Result/ResultGlobe.class.js'
import TaxaModule from './Common/TaxaModule.class.js'
import StateManager from './StateManager.class.js';
import DialogManager from './DialogManager.class.js';
import TooltipManager from './TooltipManager.class.js';
import SiteReportManager from './SiteReportManager.class';
import HelpAgent from './HelpAgent.class.js';
import UserManager from './UserManager.class.js';
import DomainManager from './DomainManager.class.js';
import NotificationManager from './NotificationManager.class.js';
import ExportManager from './ExportManager.class.js';
import Router from './Router.class.js';
import Tutorial from './Tutorials/Tutorial.class.js';
import SearchManager from './SearchManager.class.js';
import AIAssistant from './AIAssistant.class.js';
import { nanoid } from 'nanoid';
import ApiWsChannel from './ApiWsChannel.class.js';

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

		this.asyncRenderRequestQueue = [];
		this.asyncRenderInFlightRequests = [];
		this.asyncRenderMaxConcurrentRequests = 100;

		this.experimentalFilters = [];
		/*
		this.experimentalFilters = [{
			AggregateTitle: "count of x",
			AggregateType: "count",
			Description: "Geographic",
			DisplayTitle: "Geographic",
			FacetCode: "geographic_polygon",
			FacetGroup: {FacetGroupKey: 'space_time', DisplayTitle: 'Space/Time', Description: 'Space/Time'},
			FacetGroupKey: "space_time",
			FacetId: 200,
			FacetTypeKey: "map",
			IsApplicable: true,
			IsDefault: false,
			enabled: true,
		}];
		*/

		$("#sead-release-version").text(this.config.version);

		this.storeUserSettings(this.config, false);

		this.preload().then(() => {
			console.log("SQS preload complete");
			this.bootstrapSystem();
			console.log("SQS bootstrap complete");
		}, (reason) => {
			$("#preload-failed-indicator").css("display", "block");
			$(".seadlogo-loading-indicator-bg").hide();
		});
		
		$("#system-preload-message").hide();
		$("#main-container").show();
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

	setCustomMsg(containerNode, set = true, msg = "") {
		//Remove any overlay box that might already exist in this container (effectively overwriting that msg)
		$(".overlay-msg-box", containerNode).remove();
		
		if(set) {
			const noDataBoxFrag = document.getElementById("no-data-box");
			const noDataBox = document.importNode(noDataBoxFrag.content, true);
			$("label", noDataBox).text(msg);
			$(containerNode).html("");
			$(containerNode).append(noDataBox);
		}
		else {
			$(containerNode).html("");
		}
	}

	handleMapPopupClick(event) {
		console.log(event);
		//console.log(event);
		//this.sqsOffer("mapPopupClick", event);
		const data = {
			message: 'Hello, World!',
			count: 42
		};
		//const event = new CustomEvent('mapPopupClick', { detail: data });
		//window.dispatchEvent(event);
	}

	setLoadingIndicator(containerNode, set = true, nonInvasive = false) {
		//Remove any overlay box that might already exist in this container (effectively overwriting that msg)
		$(".overlay-msg-box", containerNode).remove();
				
		if(set) {
			const frag = document.getElementById("logo-loading-indicator");
			const node = document.importNode(frag.content, true);
			if(!nonInvasive) {
				$(containerNode).html("");
			}
			$(containerNode).append(node);

			if(nonInvasive) {
				$(".logo-loading-indicator", containerNode).addClass("logo-loading-indicator-non-invasive");
			}
		}
		else {
			if(nonInvasive) {
				$(".logo-loading-indicator", containerNode).remove();
			}
			else {
				$(containerNode).html("");
			}
			
		}
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

	setErrorIndicator(containerNode, msg = "") {
		//Remove any overlay box that might already exist in this container (effectively overwriting that msg)
		$(".overlay-msg-box", containerNode).remove();
		
		const frag = document.getElementById("error-indicator");
		const node = document.importNode(frag.content, true);
		$("label", node).text(msg);
		$(containerNode).html("");
		$(containerNode).append(node);
	}

	setCuteLittleLoadingIndicator(containerNode, set = true) {
		if(set) {
			$(containerNode).html("");
			$(containerNode).addClass("small-loading-indicator");
		}
		else {
			$(containerNode).removeClass("small-loading-indicator");
		}
	}

	asyncRender(containerNodeSelector, params = {}) {
		if(this.asyncRenderRequestQueue === undefined) {
			this.asyncRenderRequestQueue = [];
		}

		//this.setCuteLittleLoadingIndicator(containerNodeSelector, true);

		params.data.request_id = nanoid();

		this.asyncRenderRequestQueue.push({
			containerNodeSelector: containerNodeSelector,
			params: params,
		});
		this.processAsyncRenderQueue();
	}

	processAsyncRenderQueue() {
		if(!this.asyncRenderInterval) {
			this.asyncRenderInterval = setInterval(async () => {

				//if we have a ws channel but waiting for the connection to complete, don't do anything
				if(this.wsChan && this.wsChan.connected() == false) {
					return;
				}

				while(this.asyncRenderRequestQueue.length > 0 && this.asyncRenderMaxConcurrentRequests > this.asyncRenderInFlightRequests.length) {

					let request = this.asyncRenderRequestQueue.shift();
					
					if(request.params.method == "ws") {
						if(!this.wsChan) {
							//console.log("Creating new ws channel");
							this.wsChan = new ApiWsChannel(this);
							await this.wsChan.connect();
							this.wsChan.bindListen((evt) => {
								let data = JSON.parse(evt.data);

								for(let k in this.asyncRenderInFlightRequests) {
									if(this.asyncRenderInFlightRequests[k].params.data.request_id == data.request_id) {
										this.asyncRenderInFlightRequests[k].params.callback(this.asyncRenderInFlightRequests[k], data);
										this.asyncRenderInFlightRequests.splice(k, 1);
										break;
									}
								}
							});
							//console.log("Connected to WS")
						}

						if(!this.wsChan.connected()) {
							console.error("Websocket not connected, cannot send async render request");
						}
						this.wsChan.send(request.params.data);
						this.asyncRenderInFlightRequests.push(request);
					}
					else {
						console.warn("asyncRender does not support method "+request.params.method);
					}

					if(this.asyncRenderRequestQueue.length == 0) {
						clearInterval(this.asyncRenderInterval);
						this.asyncRenderInterval = null;
					}
				}
			}, 100);
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
		

		/*
		let method_ids = [
			3, 6, 8, 10, 14, 15, 16, 21, 32, 33, 35, 36, 37, 38, 39, 40,
			46, 47, 48, 51, 74, 94, 97, 98, 100, 101, 104, 106, 107, 109,
			110, 111, 117, 118, 119, 127, 128, 129, 130, 131, 132, 133,
			134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145,
			146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157,
			158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169,
			170, 171, 172, 174, 175, 176
		];

		//let trees = [264, 15152, 550, 762, 957, 763, 551, 1052];
		let trees = ["Tall", "Ek", "Undefined", "Gran", "Ask", "Bok", "Lärk", "Äppel", "Lind", "Björk"];

		//generate colors
		let colors = this.color.getColorScheme(trees.length);
		let methodColorsConfig = [];
		for(let key in trees) {
			//strip leading #
			let color = colors[key].substring(1);

			methodColorsConfig.push({
				species: trees[key],
				color: color
			});
		}

		console.log(JSON.stringify(methodColorsConfig, null, 2));
		*/
		
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
		this.exportManager = new ExportManager(this);
		this.facetManager = new FacetManager(this, this.filterDefinitions);
		this.facetManager.buildFilterStructure("general");
		this.mainMenu = new MainMenu();
		this.tutorial = new Tutorial(this);
		this.aiAssistant = new AIAssistant(this);
		
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
			},
		]);

		//this.facetManager.addDefaultFacets();

		if(this.config.globeResultModuleEnabled) {
			this.resultManager.addModule([{
				name: "globe",
				module: new ResultGlobe(this.resultManager)
			}]);
		}

		this.taxaModule = new TaxaModule(this);

		this.menuManager.createMenu(this.resultManager.sqsMenu());

		var renderDefaultResult = viewstate === false;
		if(siteId == false) { //Don't bother firing up the result section if a direct request has been made towards a site report
			this.resultManager.setActiveModule(this.getUserSettings().defaultResultModule, renderDefaultResult);
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
	  	
	  	this.help = new HelpAgent(this);
	  	this.help.setState(true);
		this.userManager = new UserManager(this);
		this.searchManager = new SearchManager(this);

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
		this.menuManager.createMenu(this.searchManager.sqsMenu());

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
		this.modules.push(this.searchManager);
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
		this.router.route();
		this.tutorial.init();
		this.sqsEventDispatch("sqsInitComplete");

		document.addEventListener('keydown', (evt) => {
			if(evt.shiftKey && evt.key == "D") {
				this.facetManager.toggleDebug();
				this.resultManager.toggleDebug();
			}
        });
	}

	//resets the UI to the initial state, removes any filters and so on
	reset() {
		this.layoutManager.setActiveView("filters");
		this.domainManager.setActiveDomain("general");
		this.resultManager.setActiveModule(this.config.defaultResultModule, true).then(() => {
			this.facetManager.reset();
			this.menuManager.resetAll();
		});
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
			$.ajax(this.config.siteReportServerAddress+"/tbl_data_types", {
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
			$.ajax(this.config.siteReportServerAddress+"/tbl_dataset_masters", {
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

		fetch(this.config.siteReportServerAddress+"/tbl_ecocode_definitions?ecocode_group_id=eq.2")
		.then((response) => response.json())
		.then(ecocodes => {
			this.bugsEcoCodeDefinitions = ecocodes;
		});

		return await Promise.all([fetchApiVersion, fetchFacetDefinitionsPromise, fetchDataTypesPromise, fetchDatasetMasters, fetchDomainDefinitionsPromise]);
	}

	importFilters(data) {

		this.experimentalFilters.forEach(filter => {
			if(filter.enabled) {
				data.push(filter);
			}
		});

		const customDescriptions = [
			{
				facetCode: "geographic_polygon",
				description: "Geographic polygon"
			},
			{
				facetCode: "tbl_denormalized_measured_values_33_0",
				description: "Measure of the degree to which a material can be magnetized in the presence of an external magnetic field.",
			},
			{
				facetCode: "tbl_denormalized_measured_values_33_82",
				description: "Measurement of the magnetic susceptibility of a sample after heating at a temperature of 550°C.",
			},
			{
				facetCode: "tbl_denormalized_measured_values_32",
				description: "Organic content in % from weight lost when heated to a high temperature (e.g. 550°C)"
			},
			{
				facetCode: "tbl_denormalized_measured_values_37",
				description: "Concentration of phosphate compounds in a sample, often used as an indicator of past human activity."
			},
			{
				facetCode: "record_types",
				description: "General type of proxy measurement (e.g. pollen, dating) used to infer aspects of the past."
			},
			{
				facetCode: "feature_type",
				description: "Archaeological, geological, environmental, or cultural features associated with the excavation and samples"
			},
			{
				facetCode: "abundance_classification",
				description: "Type of quantification or classification system used to record presence or abundance of organisms or material properties."
			},
			{
				facetCode: "abundances_all",
				description: "Quantification of the amount (number, presence etc.) of an organism (taxon, species etc.)"
			},
			{
				facetCode: "dataset_master",
				description: "Organisation (e.g. lab, project, database) providing the data."
			},
			{
				facetCode: "dataset_methods",
				description: "The various methods and techniques used for creating, collecting or analyzing the data"
			},
			{
				facetCode: "region",
				description: "Modern or historical geographical or administrative region"
			},
			{
				facetCode: "data_types",
				description: "Types of data generated by an analysis or observation."
			},
			{
				facetCode: "rdb_systems",
				description: "Red Data Book systems are used to classify and document the conservation status of species and ecosystems."
			},
			{
				facetCode: "rdb_codes",
				description: "Red Data Book codes provide an description of the conservation status of a species in a particular geographical area."
			},
			{
				facetCode: "modification_types",
				description: "Types of modification to an organism (insect, seed, bone etc.), such as it being a fragment or carbonised."
			},
			{
				facetCode: "abundance_elements",
				description: "The part (element) of the organism (plant or animal) that was counted."
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
				description: "Season in which an adult insect has been observed to be active."
			}
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

				if(!this.config.filterBlacklist.includes(filter.FacetCode)) {
					let customDesc = customDescriptions.find((item) => item.facetCode == filter.FacetCode);
					
					filterGroup.items.push({
						"facetCode": filter.FacetCode,
						"displayTitle": filter.DisplayTitle,
						"facetTypeKey": filter.FacetTypeKey, //"discrete" or "range" or "map" or "multistage" or "geopolygon"
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
						
						this.experimentalFilters.forEach(filter => {
							if(filter.enabled) {
								domain.Facets.push(filter);
							}
						});

						//this is a manual insert of an experimental facet
						/*
						domain.Facets.push({
							AggregateTitle: "count of x",
							AggregateType: "count",
							Description: "Geographic",
							DisplayTitle: "Geographic",
							FacetCode: "geographic_polygon",
							FacetGroup: {FacetGroupKey: 'others', DisplayTitle: 'Others', Description: 'Others'},
							FacetGroupKey: "others",
							FacetId: 200,
							FacetTypeKey: "unknown",
							IsApplicable: true,
							IsDefault: false
						});
						*/
						
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

					//yo dawg, I heard you like filters so let's filter the filters
					domainConfigObject.filters = domainConfigObject.filters.filter((facet) => {
						return !domainConfigObject.filterBlacklist.includes(facet);
					});
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

	tryParseValueAsNumber(input) {
		// Check if the input can be parsed as an integer
		if (/^\d+$/.test(input)) {
			return parseInt(input, 10);
		}
	
		// Check if the input can be parsed as a float
		if (/^\d+\.\d+$/.test(input)) {
			return parseFloat(input);
		}
	
		// If parsing as a number failed, return the original string
		return input;
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

		let familyName = taxon.family.family_name ? taxon.family.family_name : taxon.family;
		let genusName = taxon.genus.genus_name ? taxon.genus.genus_name : taxon.genus;
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

	copySiteReportData(obj) {
		// Check if the input is null or not an object (base case for recursion)
		if (obj === null || typeof obj !== 'object') {
			return obj;
		}
	
		// Handle Arrays
		if (Array.isArray(obj)) {
			return obj.reduce((arr, item, index) => {
				// Recursively copy each item in the array
				arr[index] = this.copySiteReportData(item);
				return arr;
			}, []);
		}
	
		// Handle Date objects
		if (obj instanceof Date) {
			return new Date(obj.getTime());
		}
	
		// Create a shallow copy of the object
		const copiedObject = {};
	
		// Recursively copy properties that are not Promises
		Object.keys(obj).forEach(key => {
			const value = obj[key];
			// Check if value is a Promise using instance of or any other logic
			if (!this.isPromise(value)) {
				copiedObject[key] = this.copySiteReportData(value);
			} else {
				// You can choose to set it to null or just omit it from copied object
				// copiedObject[key] = null;
				console.warn('Promise found in object', key);
			}
		});
	
		return copiedObject;
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

	storeUserSettings(settings, overwrite = true) {
		let userSettingsJson = window.localStorage.getItem("sqsUserSettings");
		let userSettings;
		if(!userSettingsJson) {
			userSettings = {};
		}
		else {
			userSettings = JSON.parse(userSettingsJson);
		}
		
		Object.keys(settings).forEach((key) => {
			if(!overwrite && typeof userSettings[key] == "undefined") {
				userSettings[key] = settings[key];
			}
			else if(overwrite) {
				userSettings[key] = settings[key];
			}
		});
		window.localStorage.setItem("sqsUserSettings", JSON.stringify(userSettings));
	}

	getUserSettings() {
		return JSON.parse(window.localStorage.getItem("sqsUserSettings"));
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
			//console.warn("An undefined value was passed into parseStringValueMarkup");
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

	capitalizeAndPrettifyString(str) {
		if(typeof str == "undefined") {
			return "";
		}
		str = str.toLowerCase();
		str = str.charAt(0).toUpperCase() + str.slice(1);
		str = str.replace(/_/g, " ");
		return str;
	}

	matomoTrackPageView(pageTitle = "Unknown page") {
		if(this.config.pageTrackingEnabled) {
			_paq.push(['setCustomUrl', '/' + window.location.hash.substr(1)]);
			_paq.push(['setDocumentTitle', pageTitle]);
			_paq.push(['trackPageView']);
		}
	}

	renderBiblioReference(siteData, biblioIds, htmlEnabled = true) {
		let datasetBiblio = [];
		for (let k in biblioIds) {
			let biblioId = biblioIds[k];
			for (let bibKey in siteData.lookup_tables.biblio) {
				if (siteData.lookup_tables.biblio[bibKey].biblio_id == biblioId) {
					datasetBiblio.push(siteData.lookup_tables.biblio[bibKey]);
					break; // Found the biblio, no need to continue the inner loop
				}
			}
		}
	
		if (datasetBiblio.length == 0) {
			return "";
		}
	
		if (htmlEnabled) {
			// Original HTML rendering logic with slight adjustments for clarity
			let html = "<ul>";
			datasetBiblio.forEach(biblio => {
				html += "<div class='dataset-biblio'><li>";
				if (biblio.full_reference) {
					html += "<span class='dataset-biblio-full-reference'>" + biblio.full_reference + "</span>";
				} else {
					html += this.renderBiblioDetails(biblio, htmlEnabled); 
				}
				html += "</li></div>";
			});
			html += "</ul>";
			return html;
		} else {
			// New plain text rendering logic
			let text = "";
			datasetBiblio.forEach(biblio => {
				if (biblio.full_reference) {
					text += biblio.full_reference + "\n";
				} else {
					text += this.renderBiblioDetails(biblio, htmlEnabled) + "\n";
				}
			});
			return text.trim();
		}
	}

	renderBiblioDetails(biblio, htmlEnabled) {
		let details = "";
		const fields = ['author', 'year', 'title', 'doi', 'isbn', 'url', 'notes', 'bugs_reference']; // List of all fields
		const separator = htmlEnabled ? "</span> " : ", ";
	
		fields.forEach(field => {
			if (biblio[field]) {
				if (htmlEnabled) {
					details += `<span class='dataset-biblio-${field}'>${biblio[field]}</span>${separator}`;
				} else {
					details += `${biblio[field]}${separator}`;
				}
			}
		});
	
		// Trim the last separator: for HTML, it's part of the structure, for text, it needs to be removed
		return htmlEnabled ? details : details.slice(0, -2);
	}

	isPromise(value) {
		return Boolean(value && typeof value.then === 'function');
	}

	renderContacts(siteData, contactIds, html = true) {
		// Reduce contactIds down to just unique values
		contactIds = contactIds.filter((value, index, self) => {
			return self.indexOf(value) === index;
		});
	
		let datasetContacts = [];
		for (let k in contactIds) {
			let contactId = contactIds[k];
			let foundContact = false;
			for (let contactKey in siteData.lookup_tables.dataset_contacts) {
				if (siteData.lookup_tables.dataset_contacts[contactKey].contact_id == contactId) {
					foundContact = true;
					datasetContacts.push(siteData.lookup_tables.dataset_contacts[contactKey]);
				}
			}
			if (!foundContact) {
				console.warn("Contact not found in lookup table:", contactId);
			}
		}
	
		if (datasetContacts.length == 0) {
			return "";
		}
	
		if (!html) {
			let textOutput = "";
			datasetContacts.forEach(contact => {
				if (contact.contact_first_name) {
					textOutput += contact.contact_first_name + "\n";
				}
				if (contact.contact_last_name) {
					textOutput += contact.contact_last_name + "\n";
				}
				if (contact.contact_email) {
					textOutput += contact.contact_email + "\n";
				}
				if (contact.contact_address_1) {
					textOutput += contact.contact_address_1 + "\n";
				}
				if (contact.contact_address_2) {
					textOutput += contact.contact_address_2 + "\n";
				}
				if (contact.contact_location_name) {
					textOutput += contact.contact_location_name + "\n";
				}
				if (contact.contact_url) {
					textOutput += contact.contact_url + "\n";
				}
				if (contact.contact_type_description) {
					textOutput += contact.contact_type_description + "\n";
				}
				textOutput += "\n";
			});
			return textOutput.trim(); // Remove trailing newline
		}
	
		let htmlOutput = "<ul>";
		datasetContacts.forEach(contact => {
			htmlOutput += "<li class='dataset-contact'>";
			if (contact.contact_first_name) {
				htmlOutput += "<div class='dataset-contact-name'>" + contact.contact_first_name + "</div>";
			}
			if (contact.contact_last_name) {
				htmlOutput += "<div class='dataset-contact-name'>" + contact.contact_last_name + "</div>";
			}
			if (contact.contact_email) {
				htmlOutput += "<div class='dataset-contact-email'>" + contact.contact_email + "</div>";
			}
			if (contact.contact_address_1) {
				htmlOutput += "<div class='dataset-contact-phone'>" + contact.contact_address_1 + "</div>";
			}
			if (contact.contact_address_2) {
				htmlOutput += "<div class='dataset-contact-phone'>" + contact.contact_address_2 + "</div>";
			}
			if (contact.contact_location_name) {
				htmlOutput += "<div class='dataset-contact-notes'>" + contact.contact_location_name + "</div>";
			}
			if (contact.contact_url) {
				htmlOutput += "<div class='dataset-contact-notes'>" + contact.contact_url + "</div>";
			}
			if (contact.contact_type_description) {
				htmlOutput += "<div class='dataset-contact-notes'>" + contact.contact_type_description + "</div>";
			}
			htmlOutput += "</li>";
		});
	
		htmlOutput += "</ul>";
	
		return htmlOutput;
	}
	

	renderContactsOLD(siteData, contactIds) {

		//reduce contactIds down to just unique values
		contactIds = contactIds.filter((value, index, self) => {
			return self.indexOf(value) === index;
		});


		let datasetContacts = [];
		for(let k in contactIds) {
			let contactId = contactIds[k];
			let foundContact = false;
			for(let contactKey in siteData.lookup_tables.dataset_contacts) {
				if(siteData.lookup_tables.dataset_contacts[contactKey].contact_id == contactId) {
					foundContact = true;
					datasetContacts.push(siteData.lookup_tables.dataset_contacts[contactKey])
				}
			}
			if(!foundContact) {
				console.warn("Contact not found in lookup table:", contactId);
			}
		}

		if(datasetContacts.length == 0) {
			return "";
		}

		let html = "<ul>";
		datasetContacts.forEach(contact => {
			html += "<li class='dataset-contact'>";
			if(contact.contact_first_name) {
				html += "<div class='dataset-contact-name'>"+contact.contact_first_name+"</div>";
			}
			if(contact.contact_last_name) {
				html += "<div class='dataset-contact-name'>"+contact.contact_last_name+"</div>";
			}
			if(contact.contact_email) {
				html += "<div class='dataset-contact-email'>"+contact.contact_email+"</div>";
			}
			if(contact.contact_address_1) {
				html += "<div class='dataset-contact-phone'>"+contact.contact_address_1+"</div>";
			}
			if(contact.contact_address_2) {
				html += "<div class='dataset-contact-phone'>"+contact.contact_address_2+"</div>";
			}
			if(contact.contact_location_name) {
				html += "<div class='dataset-contact-notes'>"+contact.contact_location_name+"</div>";
			}
			if(contact.contact_url) {
				html += "<div class='dataset-contact-notes'>"+contact.contact_url+"</div>";
			}
			if(contact.contact_type_description) {
				html += "<div class='dataset-contact-notes'>"+contact.contact_type_description+"</div>";
			}
			html += "</li>";
		});

		html += "</ul>";
		
		return html;
	}

	renderFeatureTypeIcon(featureTypeName, featureTypeCount, maxFeatureCount) {
		let ttId = "tt-"+nanoid();
		let printName = featureTypeName.split(" ").map(word => word.substring(0, 1)).join("").toUpperCase();
		let bgHeight = (featureTypeCount / maxFeatureCount) * 100;
		let ftData = `
			<div id='${ttId}' class='feature-type-icon-container'>
				<div class='feature-type-icon-bar' style='height:${bgHeight}%;'></div>
				<div class='feature-type-icon'>${printName}</div>
			</div>
		`;

		if(maxFeatureCount == -1) {
			this.tooltipManager.registerTooltip("#"+ttId, `${featureTypeName}`);
		}
		else {
			this.tooltipManager.registerTooltip("#"+ttId, `${featureTypeName}, ${featureTypeCount} counts`);
		}
		
		return ftData;
	}
	
}

export { SeadQuerySystem as default }