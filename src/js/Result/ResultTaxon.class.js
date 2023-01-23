import { nanoid } from "nanoid";
import Color from "../Color.class";
import '../../../node_modules/datatables/media/css/jquery.dataTables.min.css';
import ResultModule from './ResultModule.class.js'
import Config from '../../config/config.json';
import "../../../node_modules/tabulator-tables/dist/css/tabulator.min.css";
import { default as Tabulator } from "tabulator-tables";

/*
import '../../assets/taxa-images/figure1.png';
import '../../assets/taxa-images/figure2.png';
import '../../assets/taxa-images/figure3.png';
*/
/*
* Class: ResultTaxon
*/
class ResultTaxon extends ResultModule {
	/*
	* Function: constructor
	*/
	constructor(resultManager) {
		super(resultManager);
		this.resultManager = resultManager;
		this.sqs = resultManager.sqs;
		this.name = "taxon";
		this.prettyName = "Species";
		this.icon = "<i class=\"fa fa-bug\" aria-hidden=\"true\"></i>";
		this.maxRenderCount = 100000;
		this.hasCurrentData = false;
		this.data = {
			columns: [],
			rows: []
		};
		this.taxonId = null;

		/*
		$(window).on("seadResultMenuSelection", (event, data) => {
			if(data.selection != this.name) {
				$("#result-taxon-container").hide();
			}
			else {
				$("#result-taxon-container").show();
			}
		});
		*/

		$(window).on("seadFacetSelection", (event, evtObject) => {
			if(evtObject.facet.name == "species") {
				if(evtObject.facet.selections.length > 0) {
					this.taxonId = parseInt(evtObject.facet.selections[0]);
				}
			}
		});

		/*
		this.sqs.sqsEventListen("domainChanged", (evt, newDomainName) => {
			if(newDomainName == "palaeoentomology") {
				$("#menu-item-taxon").show(500);
			}
			else {
				$("#menu-item-taxon").hide(500);
				//If this result module was selected, select something else
				if(this.resultManager.getActiveModule().name == this.name) {
					this.resultManager.setActiveModule("mosaic");
				}
			}
        });
		*/

	}
	
	isVisible() {
		return false;
	}

	/*
	* Function: clearData
	*/
	clearData() {
		this.data.columns = [];
		this.data.rows = [];
	}
	
	/*
	* Function: fetchData
	*/
	fetchData() {
		console.log("fetchData");
		if(this.resultDataFetchingSuspended) {
			this.pendingDataFetch = true;
			return false;
		}

		var reqData = this.resultManager.getRequestData(++this.requestId, "tabular");

		this.resultManager.showLoadingIndicator(true);
		return $.ajax(Config.serverAddress+"/api/result/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: async (respData, textStatus, jqXHR) => {
				//Only load this data if it matches the last request id dispatched. Otherwise it's old data.
				//Also drop the data if the result module has switched since it was requested.
				if(respData.RequestId == this.requestId && this.resultManager.getActiveModule().name == this.name) {
					this.data = this.importResultData(respData);
					this.taxaData = await this.fetchTaxaData(this.data);
					if(this.active) {
						this.resultManager.showLoadingIndicator(false);
						this.renderData(this.taxaData);
					}
				}
				else {
					console.log("WARN: ResultTable discarding old result package data ("+respData.requestId+"/"+this.requestId+").");
				}
			},
			error: (respData, textStatus, jqXHR) => {
				this.resultManager.showLoadingIndicator(false, true);
			},
			complete: (xhr, textStatus) => {
			}
		});
	}
	
	/*
	* Function: importResultData
	*/
	importResultData(data) {
		this.data.columns = [];
		this.data.rows = [];

		for(var key in data.Meta.Columns) {
			var c = data.Meta.Columns[key];
			this.data.columns.push({
				title: c.DisplayText,
				field: c.FieldKey
			});
		}

		var rowsCount = data.Data.DataCollection.length;
		
		if(rowsCount > this.maxRenderCount) {
			this.unrender();
			this.resultManager.renderMsg(true, {
				title: "Too much data",
				body: "This dataset contains "+rowsCount+" rows of data. Please narrow down you search to fall within "+this.maxRenderCount+" rows of data by applying more filters."
			});
			return;
		}

		for(var key in data.Data.DataCollection) {
			var d = data.Data.DataCollection[key];

			var row = {};

			var i = 0;
			for(var ck in this.data.columns) {
				row[this.data.columns[ck].field] = d[i];
				i++;
			}

			this.data.rows.push(row);
		}
		//If this module has gone inactive (normally by being replaced) since this request was sent, ignore the response
		/*
		if(this.active) {
			this.renderData();
		}
		*/
	
		return this.data;
	}
	
	async fetchTaxaData(siteData) {
		let siteIds = [];
		siteData.rows.forEach(site => {
			siteIds.push(site.site_link);
		});
		
		await $.ajax({
			method: "post",
			url: Config.dataServerAddress+"/taxa",
			contentType: "application/json",
			data: JSON.stringify(siteIds),
			success: (taxaData) => {
				this.taxaData = taxaData;
			}
		});
		return this.taxaData;
	}

	/*
	* Function: render
	*/
	render() {
		var xhr = this.fetchData();
		xhr.then((data, textStatus, xhr) => { //success
		},
		function(xhr, textStatus, errorThrown) { //error
			console.log(errorThrown);
		});
	}

	/**
	 * groupByAttribute
	 * 
	 * I would like to take this opportunity to apologize to anyone who might have to read and understand this function in the future
	 */
	groupByAttribute(itemArray, attributes = []) {

		if(typeof attributes == "string") {
			attributes = [attributes];
		}

		let groups = [];
		itemArray.forEach(item => {
			let groupKey = null;
			for(let key in groups) {
				let group = groups[key];

				let matchAll = true;
				attributes.forEach(attr => {
					if(group.attributes[attr] != item[attr]) {
						matchAll = false;
					}
				});

				if(matchAll) {
					groupKey = key;
				}
			}

			if(groupKey == null) {
				let group = {};
				group.attributes = [];
				attributes.forEach(attr => {
					group.attributes[attr] = item[attr];
				});
				group.items = [item];
				groups.push(group);
			}
			else {
				groups[groupKey].items.push(item);
			}
		});

		return groups;
	}

	async fetchGbifImages(taxonData) {
		//GBIF API search
		let family = taxonData.family.family_name;
		let genus = taxonData.genus.genus_name;

		let gbifData = await fetch("https://api.gbif.org/v1/species/match?verbose=true&family="+family+"&genus="+genus).then(response => response.json());

		let gbifMedia = await fetch("https://api.gbif.org/v1/species/"+gbifData.genusKey+"/media").then(response => response.json());

		return gbifMedia;
	}

	async fetchEolImages(taxonData) {
		let family = taxonData.family.family_name.toLowerCase();
		let genus = taxonData.genus.genus_name.toLowerCase();
		let species = taxonData.species.toLowerCase();

		return new Promise((resolve, reject) => {
			fetch("https://eol.org/api/search/1.0.json?q="+genus+"%20"+species+"&page=1&key=").then(response => response.json()).then(eolResponse => {
				if(eolResponse.results.length < 50) {
					eolResponse.results.forEach(eolSpecies => {
						fetch("https://eol.org/api/pages/1.0/"+eolSpecies.id+".json?details=true&images_per_page=10").then(response => response.json()).then(eolSpeciesResponse => {
							resolve(eolSpeciesResponse);
						});
					});
				}
				else {
					let msg = "EOL returned too many hits in species search ("+eolResponse.results.length+"), not going to fetch images.";
					console.warn(msg);
					reject(msg);
				}
				
			});
		});
	}

	renderSpecies(container, taxonData) {
		let taxonSpecString = this.sqs.formatTaxon(taxonData);
		this.fetchEolImages(taxonData).then(eolResponse => {
			if(typeof eolResponse.taxonConcept.dataObjects != "undefined") {
				this.renderSpeciesImages(eolResponse.taxonConcept.dataObjects);
			}
		});
		$("#rcb-species-value", container).html(taxonSpecString);
	}

	renderSpeciesImages(images) {
		let imageNodes = [];
		images.forEach(image => {
			let imageNode = $("<img class='result-taxon-image-thumb' src='"+image.eolThumbnailURL+"' />");
			imageNode.on("click", (evt) => {
				evt.stopPropagation();
				let imageInfo = "©"+image.rightsHolder+"<br />";
				imageInfo += "Provider: <a href='https://eol.org/' target='_blank'>Encyclopedia of Life</a><br />"
				imageInfo += "License: "+image.license+"<br />";
				imageInfo += "Description: "+image.description;
				this.sqs.dialogManager.showPopOver("", "<div class='result-taxon-image-box'><img class='result-taxon-image' src='"+image.eolMediaURL+"' /><div class='result-taxon-image-info'>"+imageInfo+"</div></div>");
			});
			imageNodes.push(imageNode);
		});
		$("#result-taxon-image-container").html("");
		$("#result-taxon-image-container").append(imageNodes);

		this.sqs.tooltipManager.registerTooltip("#result-taxon-image-container-warning", "The images are fetched from external providers using search strings based on genus and species name, because of this, reuslts may be returned that represent different species than the intended one.")
		
	}

	getSelectedSpecies() {
		let selectedSpecies = null;
		let taxaFacet = this.sqs.facetManager.getFacetByName("species");
		if(taxaFacet != null) {
			if(taxaFacet.selections.length > 0) {
				selectedSpecies = taxaFacet.selections[taxaFacet.selections.length-1];
			}
		}
		return selectedSpecies;
	}

	update() {
		this.fetchData();
		//this.renderData();
	}

	renderSpeciesAssociation(container, taxonData) {
		let html = "<ul>";
		taxonData.species_associations.forEach(assoc => {
			let assocTypeName = assoc.association_type_name.charAt(0).toUpperCase() + assoc.association_type_name.slice(1);
			html += "<li>"+assocTypeName+" species <span id='assoc-species-"+assoc.associated_taxon_id+"'>"+assoc.associated_taxon_id+"</span></li>";
		});
		html += "</ul>";

		fetch(Config.dataServerAddress+'/taxon/'+taxonData.taxon_id)
			.then((response) => response.json())
			.then((taxon) => {
				let formattedSpecies = this.sqs.formatTaxon(taxon, null, true);
				$("#assoc-species-"+taxon.taxon_id).html(formattedSpecies);
			});

		$("#rcb-species-association", container).append(html);
	}

	renderEcologySummary(container, taxonData) {

		let bugsEcocodes = taxonData.ecocodes.filter(ecocode =>  {
			return typeof ecocode.definition != "undefined" && ecocode.definition.ecocode_group_id == 2;
		});
		let kochEcocodes = taxonData.ecocodes.filter(ecocode =>  {
			return typeof ecocode.definition != "undefined" && ecocode.definition.ecocode_group_id == 3;
		});

		let ecologyHtml = "<div class='rcb-ecocodes-container'>";
		ecologyHtml += "<div class='bugs-ecocodes'>";
		ecologyHtml += "<h4>Bugs EcoCodes</h4>";
		bugsEcocodes.forEach(bugsCode => {
			let codeColor = "#000";
			for(let key in Config.ecocodeColors) {
				if(bugsCode.definition.ecocode_definition_id == Config.ecocodeColors[key].ecocode_definition_id) {
					codeColor = Config.ecocodeColors[key].color;
				}
			}
			let ttId = "tt-"+nanoid();
			ecologyHtml += "<div id='"+ttId+"'>";
			ecologyHtml += "<div class='ecocode-color-box' style='background-color:"+codeColor+";'></div>";
			ecologyHtml += bugsCode.definition.name+" ("+bugsCode.definition.abbreviation+")";
			ecologyHtml += "</div>";

			let tooltipContent = "<h4 class='tooltip-header'>Bugs EcoCode - "+bugsCode.definition.name+"</h4><hr/>";
			tooltipContent += "Definition: "+bugsCode.definition.definition+"<br/>Abbreviation: "+bugsCode.definition.abbreviation+"<br/><br/>Notes:<br/>"+bugsCode.definition.notes;
			this.sqs.tooltipManager.registerTooltip("#"+ttId, tooltipContent, {drawSymbol:true});
		});
		ecologyHtml += "</div>";

		ecologyHtml += "<div class='koch-ecocodes'>";
		ecologyHtml += "<h4>Koch EcoCodes</h4>";
		kochEcocodes.forEach(kochCode => {
			let codeName = kochCode.definition.name.charAt(0).toUpperCase() + kochCode.definition.name.slice(1);
			let codeColor = "#000";
			let ttId = "tt-"+nanoid();
			ecologyHtml += "<div id='"+ttId+"'>";
			ecologyHtml += "<div class='ecocode-color-box' style='background-color:"+codeColor+";'></div>";
			ecologyHtml += codeName+" ("+kochCode.definition.abbreviation+")";
			ecologyHtml += "</div>";

			//let tooltipContent = codeName+" "+kochCode.definition.abbreviation;
			let tooltipContent = "<h4 class='tooltip-header'>Koch EcoCode - "+codeName+"</h4><hr/>";
			tooltipContent += "Abbreviation: "+kochCode.definition.abbreviation;
			this.sqs.tooltipManager.registerTooltip("#"+ttId, tooltipContent, {drawSymbol:true});
		});
		ecologyHtml += "</div>";

		ecologyHtml += "</div>";

		$("#rcb-ecology-summary", container).append(ecologyHtml);
	}

	renderMeasurableAttributes(container, taxonData) {
		let measurableAttributesHtml = "<ul>";
		taxonData.measured_attributes.forEach(attr => {
			let value = attr.data;
			if(parseFloat(value)) {
				value = parseFloat(value);
			}
			//First letter to lower-case
			let atttributeType = attr.attribute_type.charAt(0).toLowerCase() + attr.attribute_type.slice(1);

			let attributeMeasure = "";
			if(attr.attribute_measure != null) {
				attributeMeasure = attr.attribute_measure.charAt(0).toUpperCase() + attr.attribute_measure.slice(1);
			}
			
			measurableAttributesHtml += "<li>"+attributeMeasure+" "+atttributeType+" "+value+" "+attr.attribute_units+"</li>";
		});
		measurableAttributesHtml += "</ul>";
		$("#rcb-measurable-attributes", container).html(measurableAttributesHtml);
	}

	renderTaxonomicNotes(container, taxonData) {
		let taxaNotesHtml = "";
		taxonData.taxonomy_notes.forEach(taxaNote => {

			let textValue = taxaNote.taxonomy_notes;
			if(this.isUrl(taxaNote.taxonomy_notes)) {
				textValue = "<a target='_blank' href='"+taxaNote.taxonomy_notes+"'>"+taxaNote.taxonomy_notes+"</a>";
			}

			taxaNotesHtml += "<div>";
			taxaNotesHtml += "<h4>"+taxaNote.biblio.authors+"</h4>";
			taxaNotesHtml += textValue;
			taxaNotesHtml += "</div><br />";
			//registerTooltip(anchor, msg, options = {})
			//this.sqs.tooltipManager.registerTooltip("#rcb-taxonomic-notes", "Hello!");
		});
		$("#rcb-taxonomic-notes", container).html(taxaNotesHtml);
	}

	/*
	* Function: renderData
	*/
	async renderData(taxaData) {
			let tableData = [];
			taxaData.sort((a, b) => {
				if(a.abundance > b.abundance) {
					return -1;
				}
				else {
					return 1;
				}
			});

			taxaData.forEach(taxon => {
				tableData.push(taxon);
			});

			$('#result-taxon-container').show();
			
			var table = new Tabulator("#result-taxon-container", {
				data:tableData, //assign data to table
				layout: "fitColumns",
				initialSort:[             //set the initial sort order of the data
					{column:"abundance", dir:"desc"},
				],
				columns:[                 //define the table columns
					{title:"Species", field:"species"},
					{title:"Genus", field:"genus", tooltip: true},
					{title:"Family", field:"family", width:95, editor:"select", editorParams:{values:["male", "female"]}},
					{title:"Abundance", field:"abundance", formatter:"progress", formatterParams:{
						color: [this.sqs.color.colors.baseColor],
						max: taxaData[0].abundance,
					}, tooltip:(cell) => {
						return "Aggregated abundance: "+cell.getValue()+" individuals";
					}},
				],
			});
			
	}
	async renderTaxon() {
		let taxonId = this.getSelectedSpecies();
		if(taxonId != null) {
			this.taxonId = taxonId;
		}

		console.log("taxon - renderData", this.taxonId);

		if(this.taxonId == null) {
			this.taxonId = 31907
			this.taxonId = 18054;
			//this.taxonId = 350;
			this.taxonId = 39708;
			this.taxonId = 30652;
			this.taxonId = 34877;
			//this.taxonId = 33465;
			this.taxonId = 30124;
			this.taxonId = 34145;
			this.taxonId = 32092;
			this.taxonId = 29234;
			this.taxonId = 29992;
			//return;
		}

		this.resultManager.renderMsg(false);

		const fragment = document.getElementById("result-taxon-container-content-template");
		const instance = document.importNode(fragment.content, true);
		
		let taxonData = await fetch(Config.dataServerAddress+'/taxon/'+this.taxonId).then(response => response.json());
		this.renderSpecies(instance, taxonData);
		this.renderSpeciesAssociation(instance, taxonData);		
		this.renderEcologySummary(instance, taxonData);
		this.renderMeasurableAttributes(instance, taxonData);
		this.renderTaxonomicNotes(instance, taxonData);

		console.log(taxonData)
		

		let distHtml = "";
		taxonData.distribution.forEach(dist => {
			let tooltipId = nanoid();
			distHtml += "<h4 id='"+tooltipId+"'>"+dist.biblio.authors+"</h4>";
			distHtml += "<div>"+dist.distribution_text+"</div><br />";

			let tooltipText = dist.biblio.full_reference ? dist.biblio.full_reference : dist.biblio.authors+" "+dist.biblio.title
			tooltipText = "<h3 class='tooltip-header'>Reference</h3>"+tooltipText;
			this.sqs.tooltipManager.registerTooltip("#"+tooltipId, tooltipText, { drawSymbol: true });
		});
		$("#rcb-distribution", instance).html(distHtml);


		let bioHtml = "";
		taxonData.biology.forEach(bio => {
			let tooltipId = nanoid();
			bioHtml += "<h4 id='"+tooltipId+"'>"+bio.biblio.authors+"</h4>";
			bioHtml += "<div>"+bio.biology_text+"</div><br />";

			let tooltipText = bio.biblio.full_reference ? bio.biblio.full_reference : bio.biblio.authors+" "+bio.biblio.title
			tooltipText = "<h3 class='tooltip-header'>Reference</h3>"+tooltipText;
			this.sqs.tooltipManager.registerTooltip("#"+tooltipId, tooltipText, { drawSymbol: true });
		});
		$("#rcb-biology", instance).html(bioHtml);

		let seasonalityGroups = this.groupByAttribute(taxonData.taxa_seasonality, ["activity_type_id", "location_id"]);

		seasonalityGroups.forEach(group => {
			let locationName = group.items[0].location.location_name;
			let activityName = group.items[0].activity_type.activity_type;
			let header = activityName+" - "+locationName;
			
			group.domId = "rcb-year-wheel-"+nanoid();
			let seasonalityGroupTooltipId = "tt-"+nanoid();
			let html = "<div class='rcb-seasonlity-year-wheel'>";
			html += "<h4 id='"+seasonalityGroupTooltipId+"' class='centered-label'>"+header+"</h4>";
			html += "<div id='"+group.domId+"' class='rcb-year-wheel'></div>";
			html += "</div>";
			$("#rcb-seasonlity-year-wheels", instance).append(html);

			let tooltipText = "The activity: '"+activityName+"' is known for this species in the location: '"+locationName+"'";
			if(group.items[0].activity_type.description) {
				tooltipText += "<br />Activity description: '"+group.items[0].activity_type.description+"'";
			}
			
			this.sqs.tooltipManager.registerTooltip("#"+seasonalityGroupTooltipId, tooltipText, { drawSymbol: true });
		});

		$('#result-taxon-container').html("");
		$('#result-taxon-container').append(instance);
		$('#result-taxon-container').show();


		/*
		if(!Config.useExternalTaxonApis) {
			$("#result-taxon-image-container").html("");
			$("#result-taxon-image-container").addClass("result-taxon-image-container-2-col");
			
			//$("#result-taxon-image-container").append("<div><img src='/figure1.png' /></div>");
			//$("#result-taxon-image-container").append("<div><img src='/figure2.png' /></div>");
			//$("#result-taxon-image-container").append("<div><img src='/figure3.png' /></div>");
			
		}
		else {
			this.fetchGbifImages(taxonData).then(gbifMedia => {
				$("#result-taxon-image-container").html("");
	
				if(gbifMedia.results.length > 1) {
					$("#result-taxon-image-container").addClass("result-taxon-image-container-2-col");
				}
	
				gbifMedia.results.forEach(gbifImage => {
					$("#result-taxon-image-container").append("<div><img src='"+gbifImage.identifier+"' /><div class='attribution'>GBIF</div></div>");
				});
			});
		}
		*/

		seasonalityGroups.forEach(group => {
			this.renderYearWheel(group.domId, group.items);
		})

		if(seasonalityGroups.length == 0) {
			this.sqs.setNoDataMsg("#rcb-seasonlity-year-wheels");
		}

		this.resultManager.sqs.sqsEventDispatch("resultModuleRenderComplete");

		return true;
	}

	renderYearWheel(anchor, seasonalityItems = []) {

		let selectedMonths = [];
		seasonalityItems.forEach(item => {
			selectedMonths.push(item.season.season_name);
		});

		let chartConfig = {
		type : 'pie',
		width : '100%',
		height : '100%',
		x : '0px',
		y : '0px',
		'scale-r': {
			'ref-angle':270
		},
		backgroundColor: 'rgba(0, 0, 0, 0)',
		title : {
			text : '',
			fontSize : '12px'
		},
		plot : {
			borderWidth : '1px',
			borderColor : '#888',
			borderAlpha : 1.0,
			slice : '40%',
			//pieTransform : 'flow=5',
			hoverState : {
			visible : false
			},
			tooltip : {
			text : '%plot-description'
			},
			valueBox : {
			placement : 'fixed=50%;60%',
			fontSize : '11px',
			fontColor: "#000",
			fontWeight: "light",
			text : '%t'
			}
		},
		plotarea : {
			margin : '15px 5px 5px 5px'
		},
		series:[]
		};

		let months = [];
		months.push({
			name: "Janary",
			shortName: "Jan"
		});
		months.push({
			name: "February",
			shortName: "Feb"
		});
		months.push({
			name: "March",
			shortName: "Mar"
		});
		months.push({
			name: "April",
			shortName: "Apr"
		});
		months.push({
			name: "May",
			shortName: "May"
		});
		months.push({
			name: "June",
			shortName: "Jun"
		});
		months.push({
			name: "July",
			shortName: "Jul"
		});
		months.push({
			name: "August",
			shortName: "Aug"
		});
		months.push({
			name: "September",
			shortName: "Sep"
		});
		months.push({
			name: "October",
			shortName: "Oct"
		});
		months.push({
			name: "November",
			shortName: "Nov"
		});
		months.push({
			name: "December",
			shortName: "Dec"
		});


		const color = new Color();
		let selectionColor = color.getColorScheme(1);

		months.forEach(month => {
			let bgColor = "#fff";
			let fontColor = "#000";
			let activeMonth = false;
			if(selectedMonths.includes(month.name)) {
				bgColor = selectionColor;
				bgColor = color.colors.baseColor;
				fontColor = "#fff";
				activeMonth = true;
			}
			
			chartConfig.series.push({
				values : [1],
				backgroundColor : bgColor,
				valueBox: {
					fontColor: fontColor,
				},
				tooltip: {
					backgroundColor: "#000"
				},
				text: month.shortName,
				description: activeMonth ? "Active in "+month.name : "Not active in "+month.name,
			});
		});

		zingchart.render({
			id : anchor,
			width: '100%',
			height: '100%',
			data : chartConfig,
		});

	}

	isUrl(string) {
		let url;
		
		try {
			url = new URL(string);
		} catch (_) {
			return false;  
		}

		return url.protocol === "http:" || url.protocol === "https:";
	}
	
	getRenderStatus() {
		return this.renderStatus;
	}
	
	/*
	* Function: unrender
	*/
	unrender() {
		$("#result-taxon-container").hide();
	}
	
	/*
	* Function: exportSettings
	*/
	exportSettings() {
		return {
		};
	}
	
	/*
	* Function: importSettings
	*/
	importSettings(settings) {
	}

}

export { ResultTaxon as default }