import Config from '../config/config.json';

class SeoManager {
	constructor(sqs) {
		this.sqs = sqs;
		this.config = Config;
		this.siteName = "SEAD Browser";
		this.defaultTitle = "SEAD Browser – Strategic Environmental Archaeology Database";
		this.defaultDescription = "SEAD is a national research infrastructure for Swedish archaeological science and an international database for environmental archaeology and Quaternary science data.";
		this.defaultRobots = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
		this.defaultImagePath = "/SEAD-logo-square.png";
		this.defaultImageAlt = "SEAD Browser logo";
		this.serverRoot = this.resolveServerRoot();

		this.ensureTags();
		this.setDefaultRouteMeta(window.location.pathname || "/");
	}

	resolveServerRoot() {
		if(typeof this.config.serverRoot == "string" && this.config.serverRoot.length > 0 && this.config.serverRoot.indexOf("__DOMAIN__") == -1) {
			return this.config.serverRoot.replace(/\/+$/, "");
		}
		return window.location.origin;
	}

	normalizePath(path = "/") {
		if(typeof path != "string" || path.length == 0) {
			path = "/";
		}
		if(!path.startsWith("/")) {
			path = "/"+path;
		}
		return path;
	}

	buildAbsoluteUrl(path = "/") {
		return this.serverRoot + this.normalizePath(path);
	}

	sanitizeText(input) {
		if(typeof input == "undefined" || input == null) {
			return "";
		}
		return input.toString().replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
	}

	getOrCreateMeta(selectorAttr, selectorValue) {
		let node = document.querySelector(`meta[${selectorAttr}="${selectorValue}"]`);
		if(!node) {
			node = document.createElement("meta");
			node.setAttribute(selectorAttr, selectorValue);
			document.head.appendChild(node);
		}
		return node;
	}

	getOrCreateLink(relValue) {
		let node = document.querySelector(`link[rel="${relValue}"]`);
		if(!node) {
			node = document.createElement("link");
			node.setAttribute("rel", relValue);
			document.head.appendChild(node);
		}
		return node;
	}

	getOrCreateJsonLd(scriptId) {
		let node = document.getElementById(scriptId);
		if(!node) {
			node = document.createElement("script");
			node.setAttribute("type", "application/ld+json");
			node.setAttribute("id", scriptId);
			document.head.appendChild(node);
		}
		return node;
	}

	setMetaName(name, content) {
		this.getOrCreateMeta("name", name).setAttribute("content", content);
	}

	setMetaProperty(name, content) {
		this.getOrCreateMeta("property", name).setAttribute("content", content);
	}

	setJsonLd(scriptId, schemaObject) {
		let node = this.getOrCreateJsonLd(scriptId);
		node.textContent = JSON.stringify(schemaObject);
	}

	setCanonical(path = "/") {
		this.getOrCreateLink("canonical").setAttribute("href", this.buildAbsoluteUrl(path));
	}

	setIndexable(indexable = true) {
		if(indexable) {
			this.setMetaName("robots", this.defaultRobots);
		}
		else {
			this.setMetaName("robots", "noindex,nofollow,noarchive");
		}
	}

	ensureTags() {
		this.setMetaName("description", this.defaultDescription);
		this.setMetaName("robots", this.defaultRobots);
		//The image is the square logo, which the large card would crop to a strip
		this.setMetaName("twitter:card", "summary");
		this.setMetaName("twitter:title", this.defaultTitle);
		this.setMetaName("twitter:description", this.defaultDescription);
		this.setMetaName("twitter:image", this.buildAbsoluteUrl(this.defaultImagePath));
		this.setMetaName("twitter:image:alt", this.defaultImageAlt);

		this.setMetaProperty("og:title", this.defaultTitle);
		this.setMetaProperty("og:site_name", this.siteName);
		this.setMetaProperty("og:type", "website");
		this.setMetaProperty("og:description", this.defaultDescription);
		this.setMetaProperty("og:image", this.buildAbsoluteUrl(this.defaultImagePath));
		this.setMetaProperty("og:image:alt", this.defaultImageAlt);
		this.setMetaProperty("og:url", this.buildAbsoluteUrl("/"));

		this.setCanonical("/");
		this.updateStructuredData({
			title: this.defaultTitle,
			description: this.defaultDescription,
			path: "/"
		});
	}

	/*
	* Function: updateStructuredData
	* The schema.org descriptions of the site and of the page. The entity is what the page is
	* about, if it is about one thing - a site report's dataset, a taxon - and is cleared otherwise.
	*/
	updateStructuredData({title, description, path = "/", entity = null}) {
		const pagePath = this.normalizePath(path);
		const absoluteUrl = this.buildAbsoluteUrl(pagePath);

		this.setJsonLd("seo-schema-organization", {
			"@context": "https://schema.org",
			"@type": "Organization",
			"name": "SEAD",
			"alternateName": "Strategic Environmental Archaeology Database",
			"url": this.buildAbsoluteUrl("/"),
			"logo": this.buildAbsoluteUrl(this.defaultImagePath),
			"email": this.config.supportEmail || "support@humlab.umu.se"
		});

		this.setJsonLd("seo-schema-website", {
			"@context": "https://schema.org",
			"@type": "WebSite",
			"name": "SEAD Browser",
			"url": this.buildAbsoluteUrl("/")
		});

		this.setJsonLd("seo-schema-catalog", this.getDataCatalog());

		this.setJsonLd("seo-schema-page", {
			"@context": "https://schema.org",
			"@type": "WebPage",
			"name": title,
			"description": description,
			"url": absoluteUrl,
			"isPartOf": {
				"@type": "WebSite",
				"name": "SEAD Browser",
				"url": this.buildAbsoluteUrl("/")
			}
		});

		let entityNode = document.getElementById("seo-schema-entity");
		if(entity) {
			this.setJsonLd("seo-schema-entity", Object.assign({ "@context": "https://schema.org" }, entity));
		}
		else if(entityNode) {
			entityNode.remove();
		}
	}

	getDataCatalog() {
		let catalog = {
			"@context": "https://schema.org",
			"@type": "DataCatalog",
			"name": this.siteName,
			"alternateName": "Strategic Environmental Archaeology Database",
			"description": this.defaultDescription,
			"url": this.buildAbsoluteUrl("/"),
			"provider": this.getProvider()
		};
		if(this.config.dataLicense && this.config.dataLicense.url) {
			catalog.license = this.config.dataLicense.url;
		}
		return catalog;
	}

	getProvider() {
		return {
			"@type": "Organization",
			"name": "SEAD",
			"url": this.buildAbsoluteUrl("/")
		};
	}

	setSharedMeta({title, description, path = "/", indexable = true, entity = null}) {
		const pageTitle = this.sanitizeText(title) || this.defaultTitle;
		const pageDescription = this.sanitizeText(description) || this.defaultDescription;
		const pagePath = this.normalizePath(path);

		document.title = pageTitle;

		this.setMetaName("description", pageDescription);
		this.setMetaName("twitter:title", pageTitle);
		this.setMetaName("twitter:description", pageDescription);
		this.setMetaName("twitter:image", this.buildAbsoluteUrl(this.defaultImagePath));
		this.setMetaName("twitter:image:alt", this.defaultImageAlt);

		this.setMetaProperty("og:title", pageTitle);
		this.setMetaProperty("og:description", pageDescription);
		this.setMetaProperty("og:url", this.buildAbsoluteUrl(pagePath));
		this.setMetaProperty("og:image", this.buildAbsoluteUrl(this.defaultImagePath));
		this.setMetaProperty("og:image:alt", this.defaultImageAlt);

		this.setCanonical(pagePath);
		this.setIndexable(indexable);
		this.updateStructuredData({
			title: pageTitle,
			description: pageDescription,
			path: pagePath,
			entity: entity
		});
	}

	setDefaultRouteMeta(path = "/") {
		this.setSharedMeta({
			title: this.defaultTitle,
			description: this.defaultDescription,
			path: path,
			indexable: true
		});
	}

	setDomainMeta(domain) {
		if(!domain || domain.name == "general") {
			this.setDefaultRouteMeta("/");
			return;
		}

		const domainTitle = this.sanitizeText(domain.title || domain.name);
		this.setSharedMeta({
			title: domainTitle + " data | " + this.siteName,
			description: "Explore " + domainTitle + " datasets, sites, filters and visualizations in SEAD.",
			path: "/" + domain.name,
			indexable: true
		});
	}

	setSiteMeta(siteId, siteName = null) {
		let cleanSiteName = this.sanitizeText(siteName);
		if(cleanSiteName.length == 0) {
			cleanSiteName = "Site " + siteId;
		}

		this.setSharedMeta({
			title: cleanSiteName + " | SEAD Site Report",
			description: "Site report for " + cleanSiteName + " in the SEAD browser.",
			path: "/site/" + siteId,
			indexable: true
		});
	}

	/*
	* Function: setSiteReportMeta
	* The site report's meta once its data is in: a description of what the site has data on,
	* and the site as a schema.org Dataset, which is what puts it in Google Dataset Search.
	*
	* Parameters:
	* siteData - The site, as the json api server delivers it.
	* methodNames - The names of the methods its datasets were made with.
	*/
	setSiteReportMeta(siteData, methodNames = []) {
		const siteName = this.sanitizeText(siteData.site_name) || "Site " + siteData.site_id;
		const path = "/site/" + siteData.site_id;

		let locationNames = [];
		siteData.location.forEach(location => {
			let name = this.sanitizeText(location.location_name);
			if(name.length > 0 && !locationNames.includes(name)) {
				locationNames.push(name);
			}
		});
		const country = siteData.location.find(location => location.location_type == "Country");
		const region = siteData.location.find(location => location.location_type == "Sub-country administrative region");
		const place = [region, country].filter(location => location).map(location => this.sanitizeText(location.location_name)).join(", ");

		let sampleCount = 0;
		siteData.sample_groups.forEach(sampleGroup => {
			sampleCount += sampleGroup.physical_samples.length;
		});

		let description = "Site report for " + siteName + (place ? ", " + place : "") + ".";
		if(methodNames.length > 0) {
			description += " " + sampleCount.toLocaleString("en-GB") + (sampleCount == 1 ? " sample" : " samples")
				+ " with data from " + this.listNames(methodNames) + ".";
		}
		description += " Environmental archaeology data in SEAD.";

		let lastModified = siteData.date_updated;
		siteData.datasets.forEach(dataset => {
			if(dataset.date_updated && (!lastModified || dataset.date_updated > lastModified)) {
				lastModified = dataset.date_updated;
			}
		});

		let dataset = {
			"@type": "Dataset",
			"name": siteName,
			"description": description,
			"url": this.buildAbsoluteUrl(path),
			"identifier": siteData.site_uuid ? siteData.site_uuid : String(siteData.site_id),
			"keywords": ["environmental archaeology"].concat(methodNames),
			"isAccessibleForFree": true,
			"publisher": this.getProvider(),
			"includedInDataCatalog": {
				"@type": "DataCatalog",
				"name": this.siteName,
				"url": this.buildAbsoluteUrl("/")
			}
		};
		if(methodNames.length > 0) {
			dataset.measurementTechnique = methodNames;
		}
		if(this.config.dataLicense && this.config.dataLicense.url) {
			dataset.license = this.config.dataLicense.url;
		}
		if(lastModified) {
			dataset.dateModified = lastModified.substring(0, 10);
		}

		let spatialCoverage = { "@type": "Place" };
		if(locationNames.length > 0) {
			spatialCoverage.name = locationNames.join(", ");
		}
		const latitude = parseFloat(siteData.latitude_dd);
		const longitude = parseFloat(siteData.longitude_dd);
		if(!isNaN(latitude) && !isNaN(longitude)) {
			spatialCoverage.geo = {
				"@type": "GeoCoordinates",
				"latitude": latitude,
				"longitude": longitude
			};
		}
		if(spatialCoverage.name || spatialCoverage.geo) {
			dataset.spatialCoverage = spatialCoverage;
		}

		let citations = [];
		siteData.biblio.forEach(biblio => {
			let citation = this.sanitizeText(biblio.full_reference) || this.sanitizeText(biblio.title);
			if(citation.length > 0 && !citations.includes(citation)) {
				citations.push(citation);
			}
		});
		if(citations.length > 0) {
			dataset.citation = citations;
		}

		this.setSharedMeta({
			title: siteName + " | SEAD Site Report",
			description: description,
			path: path,
			indexable: true,
			entity: dataset
		});
	}

	/*
	* Function: listNames
	* A few names as an English list, the rest counted: "pollen, insects and 3 other methods".
	*/
	listNames(names, maxNames = 3) {
		if(names.length == 1) {
			return names[0];
		}
		if(names.length <= maxNames) {
			return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
		}
		const rest = names.length - maxNames;
		return names.slice(0, maxNames).join(", ") + " and " + rest + (rest == 1 ? " other method" : " other methods");
	}

	/*
	* Function: setTaxonMeta
	*
	* Parameters:
	* taxonId - The taxon's id.
	* taxonName - The taxon as it is written out, if it is known yet.
	* taxonData - The taxon, as the json api server delivers it, once it is in. Makes it a schema.org Taxon.
	*/
	setTaxonMeta(taxonId, taxonName = null, taxonData = null) {
		let cleanTaxonName = this.sanitizeText(taxonName);
		if(cleanTaxonName.length == 0) {
			cleanTaxonName = "Taxon " + taxonId;
		}

		let entity = null;
		let commonNames = [];
		if(taxonData) {
			const genus = taxonData.genus ? this.sanitizeText(taxonData.genus.genus_name) : "";
			const family = taxonData.family ? this.sanitizeText(taxonData.family.family_name) : "";
			const order = taxonData.order ? this.sanitizeText(taxonData.order.order_name) : "";
			let species = this.sanitizeText(taxonData.species);
			if(this.config.indicatorStringsForUnknownSpecies && this.config.indicatorStringsForUnknownSpecies.includes(species.toLowerCase())) {
				species = "";
			}

			(taxonData.common_names || []).forEach(commonName => {
				let name = this.sanitizeText(commonName.common_name);
				if(name.length > 0 && !commonNames.includes(name)) {
					commonNames.push(name);
				}
			});

			//Each rank's parent, from the order down, so the taxon ends up holding the whole chain
			let parentTaxon = null;
			[["order", order], ["family", family], ["genus", genus]].forEach(([rank, name]) => {
				if(name.length > 0) {
					let taxon = { "@type": "Taxon", "name": name, "taxonRank": rank };
					if(parentTaxon) {
						taxon.parentTaxon = parentTaxon;
					}
					parentTaxon = taxon;
				}
			});

			entity = {
				"@type": "Taxon",
				"name": species.length > 0 ? (genus + " " + species).trim() : genus || cleanTaxonName,
				"taxonRank": species.length > 0 ? "species" : "genus",
				"url": this.buildAbsoluteUrl("/taxon/" + taxonId)
			};
			if(species.length == 0 && parentTaxon) {
				//Only the genus is known, which makes the genus the taxon itself
				parentTaxon = parentTaxon.parentTaxon || null;
			}
			if(parentTaxon) {
				entity.parentTaxon = parentTaxon;
			}
			if(commonNames.length > 0) {
				entity.alternateName = commonNames;
			}

			//What people search for is the scientific name, so it goes first, not the family
			cleanTaxonName = entity.name + (family.length > 0 && family != entity.name ? " (" + family + ")" : "");
		}

		let description = "Taxon datasheet for " + cleanTaxonName + " in SEAD, the Strategic Environmental Archaeology Database.";
		if(commonNames.length > 0) {
			description += " Also known as " + commonNames.slice(0, 3).join(", ") + ".";
		}

		this.setSharedMeta({
			title: cleanTaxonName + " | SEAD Taxon Datasheet",
			description: description,
			path: "/taxon/" + taxonId,
			indexable: true,
			entity: entity
		});
	}

	setViewstateMeta(viewstateId = null) {
		let path = "/viewstate";
		if(viewstateId != null) {
			path += "/" + viewstateId;
		}

		this.setSharedMeta({
			title: "SEAD Viewstate",
			description: "Saved SEAD browser viewstate.",
			path: path,
			indexable: false
		});
	}

	setNotFoundMeta(path = null) {
		this.setSharedMeta({
			title: "Not found | SEAD Browser",
			description: "The requested page could not be found in the SEAD browser.",
			path: path || window.location.pathname || "/",
			indexable: false
		});
	}
}

export { SeoManager as default };
