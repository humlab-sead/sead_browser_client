import { nanoid } from "nanoid";
import Color from "../Color.class";
//import '../../../node_modules/datatables/media/css/jquery.dataTables.min.css';
import Config from '../../config/config.json';
import "../../../node_modules/tabulator-tables/dist/css/tabulator.min.css";
import { Tabulator } from "tabulator-tables";
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

		this.sqs.sqsEventListen("seadFacetSelection", (evt, data) => {
			if(data.facet.name == "species") {
				if(data.facet.selections.length > 0) {
					this.taxonId = parseInt(data.facet.selections[0]);
				}
			}
		}, this);

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
		let scientificName = this.getTaxonImageSearchString(taxonData);
		let gbifData = await this.fetchJsonOrThrow("https://api.gbif.org/v1/species/match?verbose=true&name="+encodeURIComponent(scientificName), "GBIF");
		let speciesKey = gbifData.speciesKey || gbifData.usageKey || gbifData.genusKey;
		if(!speciesKey) {
			return [];
		}

		let gbifMedia = await this.fetchJsonOrThrow("https://api.gbif.org/v1/species/"+speciesKey+"/media?limit=10", "GBIF");
		let mediaItems = Array.isArray(gbifMedia.results) ? gbifMedia.results : [];

		let images = [];
		mediaItems.forEach(item => {
			if(images.length >= 2) {
				return;
			}
			if(item.type && item.type != "StillImage") {
				return;
			}
			let imageUrl = item.identifier || item.references;
			if(!imageUrl) {
				return;
			}
			images.push(this.createNormalizedImage({
				provider: "GBIF",
				sourceUrl: imageUrl,
				thumbnailUrl: imageUrl,
				rightsHolder: item.creator || item.publisher || item.rightsHolder,
				license: item.license || item.rights,
				description: item.title || item.description || scientificName,
				attributionText: "© GBIF"
			}));
		});

		return images;
	}

	async fetchWikimediaImages(taxonData) {
		let scientificName = this.getTaxonImageSearchString(taxonData);
		console.log(scientificName)
		let entitySearch = await this.fetchJsonOrThrow("https://www.wikidata.org/w/api.php?action=wbsearchentities&search="+encodeURIComponent(scientificName)+"&language=en&type=item&limit=5&format=json&origin=*", "Wikidata");
		let entityHits = Array.isArray(entitySearch.search) ? entitySearch.search : [];
		if(entityHits.length == 0) {
			return [];
		}

		console.log(entityHits)

		// Collect {fileName, entityUrl} pairs so we can link back to the taxon page
		let imageFiles = [];
		for(let i = 0; i < entityHits.length && imageFiles.length < 2; i++) {
			let entityId = entityHits[i].id;
			let entityPageUrl = entityHits[i].url ? "https:"+entityHits[i].url : "";
			let entityLabel = entityHits[i].label || scientificName;
			let entityData = await this.fetchJsonOrThrow("https://www.wikidata.org/wiki/Special:EntityData/"+entityId+".json", "Wikidata");
			let claims = entityData && entityData.entities && entityData.entities[entityId] ? entityData.entities[entityId].claims : null;
			let imageClaims = claims && claims.P18 ? claims.P18 : [];

			imageClaims.forEach(claim => {
				let imageFileName = claim && claim.mainsnak && claim.mainsnak.datavalue ? claim.mainsnak.datavalue.value : null;
				if(imageFileName && !imageFiles.find(f => f.fileName == imageFileName) && imageFiles.length < 2) {
					imageFiles.push({ fileName: imageFileName, entityPageUrl, entityLabel });
				}
			});
		}

		let images = [];
		for(let i = 0; i < imageFiles.length && images.length < 2; i++) {
			let { fileName, entityPageUrl, entityLabel } = imageFiles[i];
			let commonsData = await this.fetchJsonOrThrow("https://commons.wikimedia.org/w/api.php?action=query&titles="+encodeURIComponent("File:"+fileName)+"&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=600&format=json&origin=*", "Wikimedia Commons");
			let pages = commonsData && commonsData.query ? commonsData.query.pages : {};
			let pageKeys = Object.keys(pages);
			if(pageKeys.length == 0) {
				continue;
			}

			let page = pages[pageKeys[0]];
			let imageInfo = page && Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
			if(!imageInfo) {
				continue;
			}
			let extMeta = imageInfo.extmetadata || {};
			images.push(this.createNormalizedImage({
				provider: "Wikimedia Commons",
				sourceUrl: imageInfo.descriptionurl || imageInfo.url,
				thumbnailUrl: imageInfo.thumburl || imageInfo.url,
				rightsHolder: this.stripHtml(extMeta.Artist ? extMeta.Artist.value : "") || this.stripHtml(extMeta.Credit ? extMeta.Credit.value : "") || "Wikimedia contributor",
				license: this.stripHtml(extMeta.LicenseShortName ? extMeta.LicenseShortName.value : "") || this.stripHtml(extMeta.UsageTerms ? extMeta.UsageTerms.value : ""),
				description: entityLabel,
				speciesPageUrl: entityPageUrl,
				attributionText: "© Wikimedia Commons"
			}));
		}

		console.log(images);
		return images;
	}

	async fetchInaturalistImages(taxonData) {
		let scientificName = this.getTaxonImageSearchString(taxonData);
		let response = await this.fetchJsonOrThrow("https://api.inaturalist.org/v1/taxa?q="+encodeURIComponent(scientificName)+"&is_active=true&per_page=10&order=desc&order_by=observations_count", "iNaturalist");
		let taxa = Array.isArray(response.results) ? response.results : [];
		console.log(taxa)
		if(taxa.length == 0) {
			return [];
		}

		let speciesLc = scientificName.toLowerCase();
		taxa.sort((a, b) => {
			let aScore = a.name && a.name.toLowerCase() == speciesLc ? 1 : 0;
			let bScore = b.name && b.name.toLowerCase() == speciesLc ? 1 : 0;
			return bScore - aScore;
		});

		let images = [];
		taxa.forEach(taxon => {
			if(images.length >= 2) {
				return;
			}
			let photo = taxon.default_photo;
			if(!photo) {
				return;
			}
			let thumbnailUrl = photo.medium_url || photo.square_url || photo.url;
			let sourceUrl = photo.id ? "https://www.inaturalist.org/photos/"+photo.id : (photo.original_url || photo.large_url || photo.url || thumbnailUrl);
			if(!thumbnailUrl || !sourceUrl) {
				return;
			}

			let photoLicense = photo.license_code;
			if(photoLicense) {
				photoLicense = photoLicense.toUpperCase();
			}

			images.push(this.createNormalizedImage({
				provider: "iNaturalist",
				sourceUrl: sourceUrl,
				thumbnailUrl: thumbnailUrl,
				rightsHolder: photo.attribution || photo.attribution_text,
				license: photoLicense,
				description: taxon.name || scientificName,
				commonName: taxon.preferred_common_name || "",
				speciesPageUrl: taxon.wikipedia_url || (taxon.id ? "https://www.inaturalist.org/taxa/"+taxon.id : ""),
				attributionText: "© iNaturalist"
			}));
		});

		return images;
	}

	async fetchIdigbioImages(taxonData) {
		let scientificName = this.getTaxonImageSearchString(taxonData);
		let query = encodeURIComponent(JSON.stringify({ scientificname: scientificName }));
		let response = await this.fetchJsonOrThrow("https://search.idigbio.org/v2/media/?rq="+query+"&limit=10", "iDigBio");
		let items = Array.isArray(response.items) ? response.items : [];
		if(items.length == 0) {
			return [];
		}

		let images = [];
		items.forEach(item => {
			if(images.length >= 2) {
				return;
			}
			let data = item.data || {};
			let imageUrl = data.accessuri || data.thumbnail || data.accessURI || data.thumbnailURI;
			if(!imageUrl) {
				return;
			}
			images.push(this.createNormalizedImage({
				provider: "iDigBio",
				sourceUrl: data.accessuri || data.accessURI || imageUrl,
				thumbnailUrl: data.thumbnail || data.thumbnailURI || imageUrl,
				rightsHolder: data.rightsholder || data.owner || data.ownerinstitutioncode,
				license: data.license || data.rights,
				description: data.scientificname || scientificName,
				attributionText: "© iDigBio"
			}));
		});

		return images;
	}

	async fetchEolImages(taxonData) {
		let queryUrl = "https://eol.org/api/search/1.0.json?q="+encodeURIComponent(this.getTaxonImageSearchString(taxonData))+"&page=1&key=";
		let eolResponse = await this.fetchJsonOrThrow(queryUrl, "EOL");

		if(!Array.isArray(eolResponse.results) || eolResponse.results.length == 0) {
			return [];
		}
		if(eolResponse.results.length >= this.sqs.config.maxEolImageResults) {
			throw new Error("EOL returned too many hits in species search ("+eolResponse.results.length+"), not going to fetch images.");
		}

		let pagePromises = [];
		eolResponse.results.slice(0, 5).forEach(eolSpecies => {
			pagePromises.push(this.fetchJsonOrThrow("https://eol.org/api/pages/1.0/"+eolSpecies.id+".json?details=true&images_per_page=10", "EOL"));
		});
		let pageResponses = await Promise.allSettled(pagePromises);
		let images = [];

		pageResponses.forEach(result => {
			if(result.status != "fulfilled" || images.length >= 2) {
				return;
			}
			let eolImages = result.value && result.value.taxonConcept && Array.isArray(result.value.taxonConcept.dataObjects)
				? result.value.taxonConcept.dataObjects
				: [];

			eolImages.forEach(image => {
				if(images.length >= 2) {
					return;
				}
				if(!image.eolMediaURL || !image.eolThumbnailURL) {
					return;
				}
				images.push(this.createNormalizedImage({
					provider: "Encyclopedia of Life",
					sourceUrl: image.eolMediaURL,
					thumbnailUrl: image.eolThumbnailURL,
					rightsHolder: image.rightsHolder,
					license: image.license,
					description: image.description,
					attributionText: "© EOL"
				}));
			});
		});

		return images;
	}

	renderSpecies(container, taxonData) {
		
		$("#no-images-msg").hide();
		$("#taxon-images-message-box").show();
		$("#result-taxon-image-container-loading-indicator").show();
		$("#result-taxon-image-container").empty();

		let imageMetaData = [];
		let taxonSpecString = this.sqs.formatTaxon(taxonData);
		let providerFetchOrder = [
			{ provider: "Wikimedia Commons", method: this.fetchWikimediaImages.bind(this) },
			{ provider: "iNaturalist", method: this.fetchInaturalistImages.bind(this) },
			{ provider: "GBIF", method: this.fetchGbifImages.bind(this) },
			{ provider: "iDigBio", method: this.fetchIdigbioImages.bind(this) },
			{ provider: "Encyclopedia of Life", method: this.fetchEolImages.bind(this) } // unreliable source, keep lowest display priority
		];

		Promise.allSettled(providerFetchOrder.map(provider => provider.method(taxonData))).then(results => {
			let allImages = [];

			results.forEach(result => {
				if(result.status == "fulfilled") {
					if(Array.isArray(result.value)) {
						allImages.push(...result.value.slice(0, 2));
					}
				}
				else {
					console.warn(result.reason);
				}
			});

			if(allImages.length > 0) {
				imageMetaData = this.renderSpeciesImages(allImages);
			}
			else {
				$("#no-images-msg").show();
			}

			$("#result-taxon-image-container-loading-indicator").hide();
		}).catch(err => {
			$("#result-taxon-image-container-loading-indicator").hide();
			console.warn(err);
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
		else {
			authorString += "Unknown author";
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

			renderedImages.push(Object.assign({}, image, { id: imageId }));

			let imageNodeHtml = `<div class='result-taxon-image-thumb-container'>
			<button type='button' class='taxon-image-close' aria-label='Close expanded image'>
				<i class='fa fa-times' aria-hidden='true'></i>
			</button>
			<div class='result-taxon-image-thumb'>
				<a href='`+image.sourceUrl+`' target='_blank'>
					<img id='`+imageId+`' src='`+image.thumbnailUrl+`' />
				</a>
			</div>
			<div class='result-taxon-image-thumb-attribution' title='Image fetched from `+image.provider+`'>`+image.attributionText+`</div>
			</div>`;

			let imageNode = $(imageNodeHtml);
			
			imageNodes.push(imageNode);
		});

		let ttId = "tt-"+nanoid();
		
		let tooltipText = "Images are acquired through a fuzzy search, using search strings based on family, genus and species depending on what is available. Because of this, the image results may not represent the actual taxon.";
		$("#result-taxon-image-info").html(`<div class='taxa-image-info'>
		<span id='`+ttId+`'><i class='fa fa-exclamation-triangle taxa-image-fuzzy-warning' aria-hidden='true'></i> Fuzzy search results</span>
		<span class='print-only-text'>`+tooltipText+`</span>
		</div>
		<hr />`);
		$("#result-taxon-image-info").show();
		
		this.sqs.tooltipManager.registerTooltip("#"+ttId, tooltipText, { drawSymbol:true });

		$("#result-taxon-image-container").html(imageNodes);

		renderedImages.forEach(image => {
			let ttRows = "";
			if(image.description) {
				ttRows += `<tr><td class='tt-label'>Species depicted:</td><td>${image.description}</td></tr>`;
			}
			if(image.commonName) {
				ttRows += `<tr><td class='tt-label'>Common name:</td><td>${image.commonName}</td></tr>`;
			}
			ttRows += `<tr><td class='tt-label'>Source:</td><td>${image.provider}</td></tr>`;
			if(image.rightsHolder) {
				ttRows += `<tr><td class='tt-label'>Rights holder:</td><td>${image.rightsHolder}</td></tr>`;
			}
			if(image.license) {
				ttRows += `<tr><td class='tt-label'>License:</td><td>${image.license}</td></tr>`;
			}
			let ttHtml = `<h4 class='tooltip-header'>Image</h4><table class='tooltip-table'>${ttRows}</table>`;
			this.sqs.tooltipManager.registerTooltip("#"+image.id, ttHtml);
		});

		this.registerTaxonImageInteractions();

		return renderedImages;
	}

	registerTaxonImageInteractions() {
		let imageContainer = $("#result-taxon-image-container");

		$(".result-taxon-image-thumb-container", imageContainer).each((index, imageNode) => {
			let thumbContainer = $(imageNode);
			let imageAnchor = $(".result-taxon-image-thumb a", thumbContainer);
			let closeButton = $(".taxon-image-close", thumbContainer);

			imageAnchor.on("click", (evt) => {
				let hasExpandedImage = imageContainer.hasClass("gallery-expanded");
				let isExpandedImage = thumbContainer.hasClass("is-expanded");

				if(!hasExpandedImage) {
					evt.preventDefault();
					this.expandTaxonImage(thumbContainer);
					return;
				}

				if(hasExpandedImage && !isExpandedImage) {
					evt.preventDefault();
					this.expandTaxonImage(thumbContainer);
				}
			});

			closeButton.on("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				this.collapseTaxonImageGallery();
			});
		});
	}

	expandTaxonImage(selectedContainer) {
		let imageContainer = $("#result-taxon-image-container");
		imageContainer.addClass("gallery-expanded");

		$(".result-taxon-image-thumb-container", imageContainer).each((index, imageNode) => {
			let thumbContainer = $(imageNode);
			if(thumbContainer.is(selectedContainer)) {
				thumbContainer.removeClass("is-hidden").addClass("is-expanded");
			}
			else {
				thumbContainer.removeClass("is-expanded").addClass("is-hidden");
			}
		});
	}

	collapseTaxonImageGallery() {
		let imageContainer = $("#result-taxon-image-container");
		imageContainer.removeClass("gallery-expanded");
		$(".result-taxon-image-thumb-container", imageContainer).removeClass("is-expanded is-hidden");
	}

	getTaxonImageSearchString(taxonData) {
		let genus = taxonData.genus && taxonData.genus.genus_name ? taxonData.genus.genus_name : "";
		let species = taxonData.species ? taxonData.species : "";
		// Strip parenthetical qualifiers such as "(grp)", "(s.l.)", "(s.str.)" etc. that confuse API searches
		species = species.replace(/\s*\([^)]*\)/g, "").trim();
		if(this.sqs.config.indicatorStringsForUnknownSpecies.includes(species.toLowerCase())) {
			return genus;
		}
		return (genus+" "+species).trim();
	}

	createNormalizedImage(imageData) {
		return {
			provider: imageData.provider || "Unknown",
			sourceUrl: imageData.sourceUrl || "",
			thumbnailUrl: imageData.thumbnailUrl || imageData.sourceUrl || "",
			rightsHolder: imageData.rightsHolder || "",
			license: imageData.license || "",
			description: imageData.description || "",
			commonName: imageData.commonName || "",
			speciesPageUrl: imageData.speciesPageUrl || "",
			attributionText: imageData.attributionText || "© Unknown"
		};
	}

	async fetchJsonOrThrow(url, providerName = "Unknown provider") {
		let response = await fetch(url);
		if(!response.ok) {
			throw new Error(providerName+" request failed ("+response.status+") for URL "+url);
		}
		return response.json();
	}

	stripHtml(value = "") {
		return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
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
		if(taxonData.measured_attributes.length == 0) {
			this.sqs.setNoDataMsg($("#rcb-measurable-attributes", container));
			return;
		}
		const chart = this.buildMeasuredAttributesChart(taxonData.measured_attributes);
		const list = this.buildMeasuredAttributesList(taxonData.measured_attributes);
		$("#rcb-measurable-attributes", container).html(chart + "<h4>Raw measurements</h4>" + list);
	}

	/*
	 * Renders the raw attribute list (the existing plain-text printout).
	 */
	buildMeasuredAttributesList(attrs) {
		let html = "<ul>";
		attrs.forEach(attr => {
			let value = attr.data;
			if(parseFloat(value)) {
				value = parseFloat(value);
			}
			let atttributeType = attr.attribute_type.charAt(0).toLowerCase() + attr.attribute_type.slice(1);
			let attributeMeasure = "";
			if(attr.attribute_measure != null) {
				attributeMeasure = attr.attribute_measure.charAt(0).toUpperCase() + attr.attribute_measure.slice(1);
			}
			html += "<li>"+attributeMeasure+" "+atttributeType+" "+value+" "+attr.attribute_units+"</li>";
		});
		html += "</ul>";
		return html;
	}

	/*
	 * Maps a raw attribute_type string to a canonical display label.
	 * Falls back to title-casing the raw value for unrecognised types.
	 */
	getAttributeTypeLabel(rawType) {
		const map = {
			'l': 'Length',
			'length': 'Length',
			'elytral length': 'Length (elytral)',
			'average elytral length': 'Length (elytral)',
			'length elytron': 'Length (elytral)',
			'l of elytra at suture': 'Length (elytral)',
			'length, head-end of elytra': 'Length (head\u2013elytra)',
			'length, head-end of elytra:': 'Length (head\u2013elytra)',
			'adult l': 'Length (adult)',
			'adult': 'Length (adult)',
			'larval l': 'Length (larva)',
			'length larva final (10th) instar': 'Length (larva)',
			'length imago': 'Length (imago)',
			'caterpillar length': 'Length (caterpillar)',
			'length puparium': 'Length (puparium)',
			'length male': 'Length (male)',
			'length (male)': 'Length (male)',
			'l male': 'Length (male)',
			'l (male)': 'Length (male)',
			'length female': 'Length (female)',
			'length (female)': 'Length (female)',
			'l female': 'Length (female)',
			'length worker': 'Length (worker)',
			'length (worker)': 'Length (worker)',
			'l (worker)': 'Length (worker)',
			'length queen': 'Length (queen)',
			'length (queen)': 'Length (queen)',
			'l (queen)': 'Length (queen)',
			'length (microgyne)': 'Length (microgyne)',
			'length male wing': 'Wing length (male)',
			'length female wing': 'Wing length (female)',
			'wing l': 'Wingspan',
			'wingspan': 'Wingspan',
			'length male macropterous': 'Length male macropterous',
			'length female macropterous': 'Length female macropterous',
			'length male brachypterous': 'Length male brachypterous',
			'length female brachypterous': 'Length female brachypterous',
			'length (macropterous)': 'Length (macropterous)',
			'length (brachypterous)': 'Length (brachypterous)',
			'length (brachypterous females)': 'Length (brachypterous females)',
			'length (brachyperous)': 'Length (brachypterous)',
			'length ootheca': 'Length (ootheca)',
			'width ootheca': 'Width (ootheca)',
			'length ovipositor': 'Length (ovipositor)',
			'l larval case': 'Length (larval case)',
			'l. larval case': 'Length (larval case)',
			'w larval case': 'Width (larval case)',
			'width': 'Width',
			'w': 'Width',
			'width of pronotum': 'Width (pronotum)',
			'pronotal width': 'Width (pronotum)',
		};
		return map[rawType.toLowerCase().trim()] || (rawType.charAt(0).toUpperCase() + rawType.slice(1));
	}

	/*
	 * Collapses the many spelling/case variants of attribute_measure into a
	 * small set of canonical tokens: 'min', 'max', 'approx', 'lt', 'gt', 'exact'.
	 */
	normalizeMeasure(measure) {
		if(!measure) return 'exact';
		const m = measure.toLowerCase().trim();
		if(m === 'min') return 'min';
		if(['max', 'max.', 'maxmax', 'maxs', 'mx', 'mqx', 'msx', 'nax'].includes(m)) return 'max';
		if(m === '~' || m === 'c.' || m === 'average') return 'approx';
		if(m === '<') return 'lt';
		if(m === '>') return 'gt';
		return 'exact';
	}

	/*
	 * Groups raw attribute rows by canonical label and pairs min/max rows into
	 * range objects. Unpaired rows become point objects.
	 * Returns an array of { label, type, units, min, max } or { label, type, units, measure, value }.
	 */
	groupMeasuredAttributes(attrs) {
		const labelMap = new Map();
		attrs.forEach(attr => {
			const label = this.getAttributeTypeLabel(attr.attribute_type);
			const measure = this.normalizeMeasure(attr.attribute_measure);
			const value = parseFloat(attr.data);
			if(isNaN(value)) return;
			if(!labelMap.has(label)) labelMap.set(label, []);
			labelMap.get(label).push({ measure, value, units: attr.attribute_units || 'mm' });
		});

		const groups = [];
		labelMap.forEach((rows, label) => {
			const minRow = rows.find(r => r.measure === 'min');
			const maxRow = rows.find(r => r.measure === 'max');
			if(minRow && maxRow) {
				groups.push({ label, type: 'range', min: minRow.value, max: maxRow.value, units: minRow.units });
				rows.filter(r => r.measure !== 'min' && r.measure !== 'max').forEach(r => {
					groups.push({ label, type: 'point', measure: r.measure, value: r.value, units: r.units });
				});
			} else {
				rows.forEach(r => {
					groups.push({ label, type: 'point', measure: r.measure, value: r.value, units: r.units });
				});
			}
		});
		return groups;
	}

	/*
	 * Rounds a raw maximum value up to a visually clean scale ceiling.
	 */
	calcNiceMax(values) {
		const raw = Math.max(...values);
		if(!isFinite(raw) || raw <= 0) return 10;
		const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
		const normalized = raw / magnitude;
		const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
		return nice * magnitude;
	}

	/*
	 * Formats a numeric measurement value: integers display without decimals,
	 * floats are trimmed to at most two significant decimal places.
	 */
	fmtAttrVal(v) {
		const n = parseFloat(v);
		return n % 1 === 0 ? n : parseFloat(n.toFixed(2));
	}

	/*
	 * Builds a horizontal range-bar chart for the measured attributes panel.
	 * Each canonical attribute group gets one labelled bar row on a shared mm scale.
	 * Point/approximate values are shown as a narrow tick instead of a span.
	 */
	buildMeasuredAttributesChart(attrs) {
		const groups = this.groupMeasuredAttributes(attrs);
		if(groups.length === 0) return '';

		const allValues = groups.flatMap(g => g.type === 'range' ? [g.min, g.max] : [g.value]);
		const scaleMax = this.calcNiceMax(allValues);

		// Axis ruler
		const TICK_N = 5;
		let axisTicks = '';
		for(let i = 0; i <= TICK_N; i++) {
			const val = (scaleMax / TICK_N) * i;
			const pct = (i / TICK_N * 100).toFixed(1);
			const label = i === TICK_N ? this.fmtAttrVal(val) + '\u202fmm' : this.fmtAttrVal(val);
			let cls = 'mattr-axis-tick';
			if(i === 0) cls += ' mattr-axis-tick-first';
			if(i === TICK_N) cls += ' mattr-axis-tick-last';
			axisTicks += `<div class="${cls}" style="left:${pct}%"><span class="mattr-axis-tick-label">${label}</span><span class="mattr-axis-tick-line"></span></div>`;
		}
		const axisRow = `<div class="mattr-axis-row"><div class="mattr-bar-track mattr-axis-track">${axisTicks}</div></div>`;

		// Data rows
		let rowsHtml = '';
		groups.forEach(g => {
			const safeLabel = g.label.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
			let barHtml, valueHtml;

			if(g.type === 'range') {
				const basePct = (g.min / scaleMax * 100).toFixed(2);
				const spanPct = ((g.max - g.min) / scaleMax * 100).toFixed(2);
				barHtml = `<div class="mattr-bar-base" style="width:${basePct}%;"></div>` +
					`<div class="mattr-bar-span" style="width:${spanPct}%;"></div>`;
				valueHtml = `${this.fmtAttrVal(g.min)}&thinsp;&ndash;&thinsp;${this.fmtAttrVal(g.max)}&thinsp;${g.units}`;
			} else {
				const basePct = (g.value / scaleMax * 100).toFixed(2);
				const prefixes = { approx: '~\u202f', lt: '&lt;\u202f', gt: '&gt;\u202f', exact: '' };
				const prefix = prefixes[g.measure] || '';
				const tick = g.measure !== 'exact' ? `<div class="mattr-point-tick"></div>` : '';
				barHtml = `<div class="mattr-bar-base" style="width:${basePct}%;"></div>${tick}`;
				valueHtml = `${prefix}${this.fmtAttrVal(g.value)}&thinsp;${g.units}`;
			}

			rowsHtml += `<div class="mattr-row">` +
				`<div class="mattr-row-header">` +
				`<span class="mattr-label" title="${safeLabel}">${safeLabel}</span>` +
				`<span class="mattr-range-values">${valueHtml}</span>` +
				`</div>` +
				`<div class="mattr-bar-track">${barHtml}</div>` +
				`</div>`;
		});

		return `<div class="mattr-chart">${axisRow}${rowsHtml}</div>`;
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
			modernDistMap.render("#rcb-distribution-map");
			modernDistMap.addStandardBaseLayers();
			modernDistMap.addGbifLayer(url);
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

		if(this.sqs.seoManager) {
			this.sqs.seoManager.setTaxonMeta(this.taxonId);
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

		if(this.sqs.seoManager) {
			let taxonName = this.sqs.formatTaxon(taxonData, null, false);
			this.sqs.seoManager.setTaxonMeta(this.taxonId, taxonName);
		}

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
		//Reduce this data to only contain data points for active adults in the uk
		//this is because we only have data of this type currently, but if we receive other seasonality data in the future
		//we don't want it to get mixed up here and presented as if it were showing adults active in the uk when it is not
		seasonalityItems = seasonalityItems.filter(item => {
			return item.location.location_id == 224 && item.activity_type.activity_type_id == 3;
		});

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
			text : 'Adults active in the UK',
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
		if(modernDistMap) {
			modernDistMap.setTarget(null);
		}
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
