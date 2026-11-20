import ThinSectionViewer from "../../ThinSectionViewer/ThinSectionViewer.class";

/*
* Class: Microphotographs
*
* The microphotographs, e.g. of petrographic thin sections, of the samples of a site, as a block on the analyses tab
* of the site report, after the analysis methods: the ThinSectionViewer, in a block which is picked from the list of
* methods like the methods are. A site without any gets nothing.
* The images are from the JSON API server's /sample-images/site/:siteId.
*/
class Microphotographs {
	constructor(sqs, siteId) {
		this.sqs = sqs;
		this.siteId = siteId;
		this.name = "microphotographs";
		this.images = [];
		this.viewer = null;
	}

	async fetchImages() {
		let response = await fetch(this.sqs.config.dataServerAddress+"/sample-images/site/"+encodeURIComponent(this.siteId), {
			method: "GET",
			mode: "cors"
		});
		if(!response.ok) {
			throw new Error("Server error: "+response.status+" - "+response.statusText);
		}
		let images = await response.json();
		return Array.isArray(images) ? images : [];
	}

	/*
	* Function: render
	* Adds the block and its entry in the list of methods, if the site has any images.
	*/
	async render(siteReport) {
		try {
			this.images = await this.fetchImages();
		}
		catch(error) {
			console.warn("Could not fetch the microphotographs of site "+this.siteId, error);
			return false;
		}
		if(this.images.length == 0 || this.sqs.siteReportManager.siteReport !== siteReport) {
			return false;
		}

		let sampleCount = new Set(this.images.map(image => image.physical_sample_id)).size;
		let meta = this.images.length+(this.images.length == 1 ? " image" : " images")+" · "+sampleCount+(sampleCount == 1 ? " sample" : " samples");

		//The block, made as the sections of the analysis methods are
		$("#site-report-section-"+this.name).remove();
		let blockNode = $(".site-report-level-container-template")[0].cloneNode(true);
		blockNode = $(blockNode)
			.removeClass("site-report-level-container-template")
			.addClass("site-report-level-container site-report-microphotographs")
			.attr("id", "site-report-section-"+this.name)
			.attr("site-report-section-name", this.name);
		let titleNode = $(".site-report-level-title", blockNode).addClass("site-report-method-title");
		titleNode.append($("<div></div>")
			.append($("<span class='sqs-dot'></span>").css("background-color", this.sqs.color.getAnalysisMethodColor(171) || "#8c8c8c"))
			.append($("<span class='title-text'></span>").text("Microphotographs")));
		titleNode.append($("<p class='site-report-method-meta'></p>").text(meta));
		titleNode.append($("<p class='site-report-method-description'></p>").text("Microphotographs of the thin sections of the site. The metadata recorded for an image is shown with it, and an image without any is marked as that."));
		//The content of a section is hidden until it is expanded, and the block has nothing to expand
		let contentNode = $(".site-report-level-content", blockNode).attr("collapsed", "false").css("display", "block");
		let viewerNode = $("<div class='site-report-microphotographs-viewer'></div>");
		contentNode.append(viewerNode);

		let analysesContentNode = $("#site-report-section-analyses > .site-report-level-content");
		let hasMethodList = analysesContentNode.length > 0;
		if(hasMethodList) {
			analysesContentNode.append(blockNode);
		}
		else {
			$(".site-report-analyses-main").append(blockNode);
		}

		this.viewer = new ThinSectionViewer(this.sqs, {
			embedded: true,
			emptyMessage: "No microphotographs.",
			exportFilenameBase: "sead_microphotographs_site_"+this.siteId
		});
		this.viewer.render(viewerNode, this.images);

		//Its entry in the list of methods, in a group of its own
		let nav = $(".site-report-method-nav");
		nav.append($("<div class='site-report-method-nav-group sqs-label'></div>").text("Images"));
		let item = $("<button type='button' class='site-report-method-nav-item'></button>");
		item.attr("data-method-id", this.name);
		item.append($("<span class='sqs-dot'></span>").css("background-color", this.sqs.color.getAnalysisMethodColor(171) || "#8c8c8c"));
		item.append($("<span class='site-report-method-nav-name'></span>").text("Microphotographs"));
		item.append($("<span class='site-report-method-nav-count'></span>").text(this.images.length));
		item.attr("title", meta);
		item.on("click", () => {
			this.show(siteReport);
		});
		nav.append(item);

		//With no analysis methods to show first, the block is the one shown
		if(!hasMethodList || siteReport.analysisMethodNavItems.length == 0) {
			this.show(siteReport, false);
		}
		return true;
	}

	/*
	* Function: show
	* Shows the block in place of the analysis method shown, which the report's own showAnalysisMethod does for those.
	*/
	show(siteReport, switchTab = true) {
		siteReport.activeMethodId = this.name;
		if(switchTab && siteReport.activeTab != "analyses") {
			siteReport.setActiveTab("analyses");
		}
		$(".site-report-method-nav-item").each((index, item) => {
			let current = $(item).attr("data-method-id") == this.name;
			$(item).toggleClass("site-report-method-nav-item-current", current);
			$(item).attr("aria-current", current ? "true" : "false");
		});
		$("#site-report-section-analyses > .site-report-level-content > .site-report-level-container").removeClass("site-report-method-active");
		$("#site-report-section-"+this.name).addClass("site-report-method-active");
		if(switchTab) {
			siteReport.scrollToTabContent();
		}
		this.sqs.sqsEventDispatch("layoutResize");
	}

	destroy() {
		if(this.viewer) {
			this.viewer.destroy();
			this.viewer = null;
		}
	}
}

export default Microphotographs;
