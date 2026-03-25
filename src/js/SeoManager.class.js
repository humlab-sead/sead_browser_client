import Config from '../config/config.json';

class SeoManager {
	constructor(sqs) {
		this.sqs = sqs;
		this.config = Config;
		this.defaultTitle = "SEAD Browser";
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
		this.setMetaName("twitter:card", "summary_large_image");
		this.setMetaName("twitter:title", this.defaultTitle);
		this.setMetaName("twitter:description", this.defaultDescription);
		this.setMetaName("twitter:image", this.buildAbsoluteUrl(this.defaultImagePath));
		this.setMetaName("twitter:image:alt", this.defaultImageAlt);
		this.setMetaName("twitter:url", this.buildAbsoluteUrl("/"));

		this.setMetaProperty("og:title", this.defaultTitle);
		this.setMetaProperty("og:site_name", "SEAD Browser");
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

	updateStructuredData({title, description, path = "/"}) {
		const pagePath = this.normalizePath(path);
		const absoluteUrl = this.buildAbsoluteUrl(pagePath);

		this.setJsonLd("seo-schema-organization", {
			"@context": "https://schema.org",
			"@type": "Organization",
			"name": "SEAD",
			"url": this.buildAbsoluteUrl("/"),
			"email": this.config.supportEmail || "support@humlab.umu.se"
		});

		this.setJsonLd("seo-schema-website", {
			"@context": "https://schema.org",
			"@type": "WebSite",
			"name": "SEAD Browser",
			"url": this.buildAbsoluteUrl("/")
		});

		this.setJsonLd("seo-schema-catalog", {
			"@context": "https://schema.org",
			"@type": "DataCatalog",
			"name": "SEAD Browser",
			"url": this.buildAbsoluteUrl("/"),
			"provider": {
				"@type": "Organization",
				"name": "SEAD",
				"url": this.buildAbsoluteUrl("/")
			}
		});

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
	}

	setSharedMeta({title, description, path = "/", indexable = true}) {
		const pageTitle = this.sanitizeText(title) || this.defaultTitle;
		const pageDescription = this.sanitizeText(description) || this.defaultDescription;
		const pagePath = this.normalizePath(path);

		document.title = pageTitle;

		this.setMetaName("description", pageDescription);
		this.setMetaName("twitter:title", pageTitle);
		this.setMetaName("twitter:description", pageDescription);
		this.setMetaName("twitter:image", this.buildAbsoluteUrl(this.defaultImagePath));
		this.setMetaName("twitter:image:alt", this.defaultImageAlt);
		this.setMetaName("twitter:url", this.buildAbsoluteUrl(pagePath));

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
			path: pagePath
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
			title: domainTitle + " data | SEAD Browser",
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

	setTaxonMeta(taxonId, taxonName = null) {
		let cleanTaxonName = this.sanitizeText(taxonName);
		if(cleanTaxonName.length == 0) {
			cleanTaxonName = "Taxon " + taxonId;
		}

		this.setSharedMeta({
			title: cleanTaxonName + " | SEAD Taxon Datasheet",
			description: "Taxon datasheet for " + cleanTaxonName + " in the SEAD browser.",
			path: "/taxon/" + taxonId,
			indexable: true
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
