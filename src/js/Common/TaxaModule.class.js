import { nanoid } from "nanoid";
import Color from "../Color.class";
import '../../../node_modules/datatables/media/css/jquery.dataTables.min.css';
import Config from '../../config/config.json';
import "../../../node_modules/tabulator-tables/dist/css/tabulator.min.css";
import { default as Tabulator } from "tabulator-tables";
import OpenLayersMap from "./OpenLayersMap.class";
import TabContainer from "./TabContainer.class";
import * as d3 from "d3";


/*
* Class: TaxaModule
*/
class TaxaModule {
	/*
	* Function: constructor
	*/
	constructor(sqs) {
		this.sqs = sqs;
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

		$(window).on("beforeprint", (event) => {
			console.log("beforeprint");
			//select the distribution table tab
			this.distriTabCont.showTab(1);
		});
	}

	registerPrintButton() {
		$("#taxon-print-button").on("click", (evt) => {
			window.print();
		});
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

		var reqData = this.sqs.resultManager.getRequestData(++this.requestId, "tabular");

		this.sqs.resultManager.showLoadingIndicator(true);
		return $.ajax(Config.serverAddress+"/api/result/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: async (respData, textStatus, jqXHR) => {
				//Only load this data if it matches the last request id dispatched. Otherwise it's old data.
				//Also drop the data if the result module has switched since it was requested.
				if(respData.RequestId == this.requestId && this.sqs.resultManager.getActiveModule().name == this.name) {
					this.data = this.importResultData(respData);
					this.taxaData = await this.fetchTaxaData(this.data);
					if(this.active) {
						this.sqs.resultManager.showLoadingIndicator(false);
						this.renderData(this.taxaData);
					}
				}
				else {
					console.log("WARN: ResultTable discarding old result package data ("+respData.requestId+"/"+this.requestId+").");
				}
			},
			error: (respData, textStatus, jqXHR) => {
				this.sqs.resultManager.showLoadingIndicator(false, true);
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
			this.sqs.resultManager.renderMsg(true, {
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
			let queryUrl = "https://eol.org/api/search/1.0.json?q=";
			queryUrl += genus;
			
			if(!this.sqs.config.indicatorStringsForUnknownSpecies.includes(taxonData.species.toLowerCase())) {
				queryUrl += "%20"+species;
			}
			queryUrl += "&page=1&key=";

			let promises = [];

			fetch(queryUrl).then(response => response.json()).then(eolResponse => {
				if(eolResponse.results.length < this.sqs.config.maxEolImageResults) {
					eolResponse.results.forEach(eolSpecies => {
						let p = fetch("https://eol.org/api/pages/1.0/"+eolSpecies.id+".json?details=true&images_per_page=10").then(response => response.json());
						promises.push(p);
					});

					Promise.all(promises).then(values => {
						resolve(values)
					});
				}
				else {
					let msg = "EOL returned too many hits in species search ("+eolResponse.results.length+"), not going to fetch images.";
					console.warn(msg);
					//this.sqs.notificationManager.notify(msg, "warning");
					reject(msg);
				}
				
			}).catch(err => {
				console.warn(err);
				reject(err);
			});
		});
	}

	renderSpecies(container, taxonData) {
		$("#no-images-msg").hide();
		$("#taxon-images-message-box").show();
		$("#result-taxon-image-container-eol-loading-indicator").show();

		let imageMetaData = [];
		let taxonSpecString = this.sqs.formatTaxon(taxonData);
		this.fetchEolImages(taxonData).then(eolResponse => {
			let images = [];
			eolResponse.forEach(eolResponseItem => {
				if(typeof eolResponseItem.taxonConcept.dataObjects != "undefined") {
					images.push(...eolResponseItem.taxonConcept.dataObjects)
				}
			});
			if(images.length > 0) {
				imageMetaData = this.renderSpeciesImages(images);
			}
			else {
				$("#no-images-msg").show();
				$("#result-taxon-image-container-eol-loading-indicator").hide();
			}
		});

		let taxonUrl = window.location.protocol+"//"+window.location.host+"/taxon/"+taxonData.taxon_id;
		let taxonLink = "<a target='_blank' href='"+taxonUrl+"'>"+taxonUrl+"</a>";
		$(".taxon-link-container .link", container).html(taxonLink);

		$(".taxon-link-container .link-copy", container).on("click", (evt) => {
			navigator.clipboard.writeText(taxonUrl).then(() => {
				this.sqs.notificationManager.notify("Copied link to clipboard", "info", 2000);
			});
		});

		let authorString = "<span class='rcb-taxon-authors'>";
		if(typeof taxonData.taxa_tree_authors != "undefined") {
			taxonData.taxa_tree_authors.forEach(author => {
				authorString += author.author_name+", ";
			});
			authorString = authorString.slice(0, -2);
		}
		
		authorString += "</span>";
		$("#rcb-species-value", container).html(taxonSpecString+authorString);
	}

	renderSpeciesImages(images) {
		$("#taxon-images-message-box").hide();

		let imageNodes = [];
		let renderedImages = [];
		images.forEach(image => {
			let imageId = "taxa-image-"+nanoid();
			
			renderedImages.push({
				id: imageId,
				image: image,
				rightsHolder: image.rightsHolder,
				provider: "Encyclopedia of Life",
				license: image.license,
				description: image.description
			});

			let imageMetaData = `Provider: Encyclopedia of Life \
			Rights holder: ${image.rightsHolder} \
			License: ${image.license} \
			Description: ${image.description}`;

			let imageNodeHtml = `<div class='result-taxon-image-thumb-container'>
			<div class='result-taxon-image-thumb'>
				<a href='`+image.eolMediaURL+`' target='_blank'>
					<img id='`+imageId+`' title='`+imageMetaData+`' src='`+image.eolThumbnailURL+`' />
				</a>
			</div>
			<div class='result-taxon-image-thumb-attribution' title='Image fetched from Encyclopedia Of Life'>© EOL</div>
			</div>`;

			let imageNode = $(imageNodeHtml);
			
			imageNodes.push(imageNode);
		});

		let ttId = "tt-"+nanoid();
		
		$("#result-taxon-image-info").html(`<div class='taxa-image-info'>
		<span id='`+ttId+`'>Fuzzy search results</span>
		</div>
		<hr />`);
		$("#result-taxon-image-info").show();

		this.sqs.tooltipManager.registerTooltip("#"+ttId, "Images are acquired through a fuzzy search, using search strings based on family, genus and species depending on what is available. Because of this, the image results may not represent the actual taxon.", { drawSymbol:true });

		$("#result-taxon-image-container").html(imageNodes);
		
		return renderedImages;
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
		//this.sqs.setCustomMsg($("#rcb-species-association", container), true, "Unavailable");
		//return;

		let html = "<ul>";
		let assocLinks = [];
		taxonData.species_associations.forEach(assoc => {
			let assocTypeName = assoc.association_type_name.charAt(0).toUpperCase() + assoc.association_type_name.slice(1);

			let assocSpeciesLinkId = "assoc-species-link-"+nanoid();
			assocLinks.push(assocSpeciesLinkId);
			let assocSpeciesRender = "<span id='"+assocSpeciesLinkId+"' class='species-link' assoc-taxon-id='"+assoc.taxon_id+"'>"+this.sqs.formatTaxon(assoc, null, true)+"</span>";

			html += "<li>"+assocTypeName+" species <span>"+assocSpeciesRender+"</span></li>";
		});
		html += "</ul>";

		$("#rcb-species-association", container).append(html);

		assocLinks.forEach(assocLink => {
			$("#"+assocLink, container).on("click", (evt) => {
				let assocTaxonId = $(evt.target).attr("assoc-taxon-id");
				if(typeof assocTaxonId == "undefined") {
					assocTaxonId = $(evt.target).parent().attr("assoc-taxon-id");
				}
				this.renderTaxon(assocTaxonId);
			});
		});

		if(taxonData.species_associations.length == 0) {
			this.sqs.setNoDataMsg($("#rcb-species-association", container));
		}

		return assocLinks.length;
	}

	renderEcologySummary(container, taxonData) {
		let bugsEcocodes = [];
		let kochEcocodes = [];
		taxonData.ecocodes.systems.forEach(system => {
			if(system.ecocode_system_id == 2) { // "Bugs Ecocodes"
				//groups can be ignored since they are not being used
				system.groups[0].codes.forEach(ecocode => {
					bugsEcocodes.push(ecocode);
				});
			}
			if(system.ecocode_system_id == 3) { // "Koch Ecology Codes"
				//groups can be ignored since they are not being used
				system.groups[0].codes.forEach(ecocode => {
					kochEcocodes.push(ecocode);
				});
			}
		});

		let ecologyHtml = "<div class='rcb-ecocodes-container'>";
		ecologyHtml += "<div class='bugs-ecocodes'>";
		let bugsEcocodesNodeId = nanoid();
		ecologyHtml += "<h4 id='"+bugsEcocodesNodeId+"'>Bugs EcoCodes</h4>";

		this.sqs.tooltipManager.registerTooltip("#"+bugsEcocodesNodeId, "A specially developed habitat classification system that allows for semi-quantitative environmental reconstructions.", {drawSymbol:true});

		bugsEcocodes.forEach(bugsCode => {
			let codeColor = "#000";
			for(let key in Config.ecocodeColors) {
				if(bugsCode.ecocode_definition_id == Config.ecocodeColors[key].ecocode_definition_id) {
					codeColor = Config.ecocodeColors[key].color;
				}
			}
			let ttId = "tt-"+nanoid();
			ecologyHtml += "<div id='"+ttId+"'>";
			ecologyHtml += "<div class='ecocode-color-box' style='background-color:"+codeColor+";'></div>";
			ecologyHtml += bugsCode.name+" ("+bugsCode.abbreviation+")";
			ecologyHtml += "</div>";

			let tooltipContent = "<h4 class='tooltip-header'>Bugs EcoCode - "+bugsCode.name+"</h4><hr/>";
			tooltipContent += "Definition: "+bugsCode.definition+"<br/>Abbreviation: "+bugsCode.abbreviation+"<br/><br/>Notes:<br/>"+bugsCode.notes;
			this.sqs.tooltipManager.registerTooltip("#"+ttId, tooltipContent, {drawSymbol:true});
		});
		ecologyHtml += "</div>";

		ecologyHtml += "<div class='koch-ecocodes'>";
		ecologyHtml += "<h4>Koch Ecology Codes</h4>";
		
		kochEcocodes.forEach(kochCode => {
			let codeName;
			if(kochCode.name != null) {
				codeName = kochCode.name.charAt(0).toUpperCase() + kochCode.name.slice(1);
			}
			else {
				codeName = kochCode.abbreviation+" (no name)";
			}
			
			let codeColor = "#000";
			let ttId = "tt-"+nanoid();
			ecologyHtml += "<div id='"+ttId+"'>";
			ecologyHtml += "<div class='ecocode-color-box' style='background-color:"+codeColor+";'></div>";
			ecologyHtml += codeName+" ("+kochCode.abbreviation+")";
			ecologyHtml += "</div>";

			let tooltipContent = "<h4 class='tooltip-header'>Koch EcoCode - "+codeName+"</h4><hr/>";
			tooltipContent += "Abbreviation: "+kochCode.abbreviation;
			this.sqs.tooltipManager.registerTooltip("#"+ttId, tooltipContent, {drawSymbol:true});
		});
		ecologyHtml += "</div>";
		ecologyHtml += "</div>";

		this.sqs.tooltipManager.registerTooltip("#rcb-ecology-summary-header > div", "This is an overview of the ecological environments this taxon is known to reside in.", {drawSymbol:true});

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

		if(taxonData.measured_attributes.length == 0) {
			this.sqs.setNoDataMsg($("#rcb-measurable-attributes", container));
		}

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

		if(taxonData.taxonomy_notes.length == 0) {
			this.sqs.setNoDataMsg($("#rcb-taxonomic-notes", container));
		}
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

	renderDistribution(container, taxonData) {

		let distHtml = "<table class='rcb-reference-data'>";
		taxonData.distribution.forEach(dist => {
			let tooltipId = nanoid();

			let tooltipText = dist.biblio.full_reference ? dist.biblio.full_reference : dist.biblio.authors+" "+dist.biblio.title
			this.sqs.tooltipManager.registerTooltip("#"+tooltipId, "<h3 class='tooltip-header'>Reference</h3>"+tooltipText, { drawSymbol: true });

			distHtml += "<tr>";
			distHtml += "<td><h4 id='"+tooltipId+"'>"+dist.biblio.bugs_reference+"</h4><span class='hidden-tooltip'>"+tooltipText+"</span></td>";
			distHtml += "<td>"+dist.distribution_text+"</td>";
			distHtml += "</tr>";
			
		});
		distHtml += "</table>";

		$("#rcb-distribution-biblio", container).html(distHtml);
		
		//let archeoDistMap = new OpenLayersMap(this.sqs);
		let modernDistMap = new OpenLayersMap(this.sqs);

		fetch("https://api.gbif.org/v1/species/match?name="+taxonData.genus.genus_name+"%20"+taxonData.species+"%20"+taxonData.family.family_name)
		.then(response => response.json())
		.then(data => {
			let url = "https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@2x.png?taxonKey="+data.speciesKey+"&bin=hex&hexPerTile=30&style=classic.poly";
			modernDistMap.addGbifLayer(url);
			//let url = "https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}.mvt?srs=EPSG:3857&taxonKey="+data.speciesKey;
			//modernDistMap.addGbifLayerVector(url);
			modernDistMap.render("#rcb-distribution-map");
			modernDistMap.setMapDataLayer("gbif", false);
			modernDistMap.addTextOverlay("Data sourced from <a target='_blank' href='https://www.gbif.org/'>GBIF</a>.");
		});

		/* this is disabled because it would show archeological distribution, and this is modern taxon data. also: in order for it to make much sense to show the archeological distribution, there should be a time aspect to it
		//fetch taxon distribution data from the json server
		fetch(Config.dataServerAddress+"/taxon_distribution/"+taxonData.taxon_id)
			.then(response => response.json())
			.then(data => {
				archeoDistMap.setData(data);
				archeoDistMap.render("#rcb-distribution-map");
				archeoDistMap.addTextOverlay("Known archeological distribution of the taxon. Number of individuals.");
			})
			.catch(error => {
				console.error(error);
			});
		*/
		
		this.distriTabCont = new TabContainer("#rcb-distribution-container", container, 0);
	}

	renderRdb(container, taxonData) {
		let out = "<ul>";
		taxonData.rdb.forEach(rdb => {
			let rowId = "rdb-system-"+nanoid();
			out += "<li>";
			out += rdb.rdb_definition+" (<span id='"+rowId+"'>"+rdb.rdb_system+"</span>) in ";
			out += rdb.location_name;
			if(rdb.location_type != "Country") {
				out += " ("+rdb.location_type+")";
			}
			//out += " using the "+rdb.rdb_system+" system";
			out += "</li>";

			this.sqs.tooltipManager.registerTooltip("#"+rowId, rdb.biblio_full_reference, {drawSymbol:true});
		});
		out += "</ul>";

		$("#rcb-rdb", container).html(out);

		if(taxonData.rdb.length == 0) {
			this.sqs.setNoDataMsg($("#rcb-rdb", container));
		}
	}

	renderTaxaBiology(instance, taxonData) {
		let bioHtml = "<table class='rcb-reference-data'>";
		taxonData.biology.forEach(bio => {
			let tooltipId = nanoid();

			let tooltipText = bio.biblio.full_reference ? bio.biblio.full_reference : bio.biblio.authors+" "+bio.biblio.title
			this.sqs.tooltipManager.registerTooltip("#"+tooltipId, "<h3 class='tooltip-header'>Reference</h3>"+tooltipText, { drawSymbol: true });

			bioHtml += "<tr>";
			bioHtml += "<td><h4 id='"+tooltipId+"'>"+bio.biblio.bugs_reference+"</h4><span class='hidden-tooltip'>"+tooltipText+"</span></td>";
			bioHtml += "<td>"+bio.biology_text+"</td>";
			bioHtml += "</tr>";
		});
		bioHtml += "</table>";

		this.sqs.tooltipManager.registerTooltip("#rcb-biology-header > div", "Biological references describing the taxon or its habitat.", { drawSymbol: true });

		$("#rcb-biology", instance).html(bioHtml);
	}

	async renderTaxon(taxonId = null) {
		if(taxonId != null) {
			this.taxonId = taxonId;
		}

		//this is just for loading
		this.sqs.dialogManager.showPopOver("Taxon", "<div id='taxa-loading-indicator' class='loading-indicator' style='display: block;'></div>", {
			width: "100%",
			height: "100%",
		});

		this.sqs.resultManager.renderMsg(false);

		const fragment = document.getElementById("result-taxon-container-content-template");
		const instance = document.importNode(fragment.content, true);

		let taxonData = await fetch(Config.dataServerAddress+'/taxon/'+this.taxonId).then(response => response.json());

		this.renderSpecies(instance, taxonData);
		//this.renderSpeciesAssociation(instance, taxonData);
		this.renderEcologySummary(instance, taxonData);
		this.renderMeasurableAttributes(instance, taxonData);
		this.renderTaxonomicNotes(instance, taxonData);
		this.renderRdb(instance, taxonData);
		this.renderDistribution(instance, taxonData);
		this.renderTaxaBiology(instance, taxonData);

		let seasonalityGroups = this.groupByAttribute(taxonData.taxa_seasonality, ["activity_type_id", "location_id"]);

		seasonalityGroups.forEach(group => {
			let locationName = group.items[0].location.location_name;
			let activityName = group.items[0].activity_type.activity_type;
			let header = activityName+" - "+locationName;
			
			group.domId = "rcb-year-wheel-"+nanoid();
			let seasonalityGroupTooltipId = "tt-"+nanoid();
			let html = "<div class='rcb-seasonlity-year-wheel'>";
			//html += "<h4 id='"+seasonalityGroupTooltipId+"' class='centered-label'>"+header+"</h4>";
			html += "<div id='"+group.domId+"' class='rcb-year-wheel'></div>";
			html += "</div>";
			$("#rcb-seasonlity-year-wheels", instance).append(html);

			this.sqs.tooltipManager.registerTooltip("#rcb-seasonlity-year-wheels-header > div", "Months in which this taxon has been observed as active.", { drawSymbol: true });

			let tooltipText = "The activity: '"+activityName+"' is known for this species in the location: '"+locationName+"'";

			if(group.items[0].activity_type.description) {
				tooltipText += "<br />Activity description: '"+group.items[0].activity_type.description+"'";
			}
			
			this.sqs.tooltipManager.registerTooltip("#"+seasonalityGroupTooltipId, tooltipText, { drawSymbol: true });
		});

		this.sqs.dialogManager.showPopOver("", instance, {
			width: "100vw",
			height: "100vh",
			margin: "0px"
		});
		
		seasonalityGroups.forEach(group => {
			this.renderYearWheel(group.domId, group.items);
		});
		

		if(seasonalityGroups.length == 0) {
			this.sqs.setNoDataMsg("#rcb-seasonlity-year-wheels");
		}

		this.sqs.resultManager.sqs.sqsEventDispatch("resultModuleRenderComplete");

		this.sqs.matomoTrackPageView("Taxon datasheet");

		this.registerPrintButton();

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
			slice : '50%',
			//pieTransform : 'flow=5',
			hoverState : {
				visible : false
			},
			tooltip : {
				text : '%plot-description'
			},
			valueBox : {
				placement : 'fixed=50%;50%',
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
				description: activeMonth ? "Observed as active in "+month.name : "Not observed as active in "+month.name,
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

export { TaxaModule as default }