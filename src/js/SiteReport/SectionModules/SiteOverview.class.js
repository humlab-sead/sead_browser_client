/*
* Class: SiteOverview
*
* The summary under the site's name, which is also the site report's tabs: a tab for each, saying briefly
* what it holds - where the site is, its samples, analyses, dating and references. And the overview tab,
* which says a little about each and leads on to the tab with the rest, where a sample group or an
* analysis method opens where it's shown in full.
*/
class SiteOverview {
	constructor(sqs, siteReport) {
		this.sqs = sqs;
		this.siteReport = siteReport;
		this.siteData = null;
	}

	render(siteData) {
		this.siteData = siteData;
		this.renderSummary(siteData);
		this.renderOverview(siteData);
	}

	getDatingModule() {
		let datingModule = this.siteReport.getModuleByName("dating");
		return datingModule ? datingModule.module : null;
	}

	getSampleCount(siteData) {
		let count = 0;
		siteData.sample_groups.forEach(sampleGroup => {
			count += sampleGroup.physical_samples.length;
		});
		return count;
	}

	/*
	* Function: renderAnalysesBar
	* The site's analysis methods as one thin bar under the analyses tab's name, a segment for each, as wide as its
	* share of the datasets. Only a picture of the mix - the tab itself is what opens them.
	*/
	renderAnalysesBar(methods) {
		let barNode = $("<span class='site-report-analyses-bar' aria-hidden='true'></span>");
		methods.forEach(method => {
			let segmentNode = $("<span class='site-report-analyses-bar-segment'></span>");
			segmentNode.css({
				flexGrow: method.datasets.length,
				backgroundColor: method.color || "#8c8c8c"
			});
			barNode.append(segmentNode);
		});
		return barNode;
	}

	/*
	* Function: renderSummaryCell
	*
	* One tab in the summary: its name, a count after it, and a line under it on what it holds. The whole tab is one
	* button, with nothing in it that goes anywhere else, so that it reads as what it is. A tab with nothing on it is
	* there, so the tabs are always the same, but can't be opened.
	*/
	renderSummaryCell(tabName, label, count, sub, extraClass = "") {
		let cellNode = $("<button type='button' class='site-report-summary-cell'></button>");
		cellNode.attr("data-tab", tabName);
		if(extraClass) {
			cellNode.addClass(extraClass);
		}
		let tab = this.siteReport.getTab(tabName);
		if(tab && !tab.disabled) {
			let current = this.siteReport.activeTab == tabName;
			cellNode.toggleClass("site-report-summary-cell-current", current);
			cellNode.attr("aria-current", current ? "true" : "false");
			cellNode.on("click", () => {
				this.siteReport.setActiveTab(tabName);
			});
		}
		else {
			cellNode.prop("disabled", true);
		}

		let headNode = $("<span class='site-report-summary-cell-head'></span>");
		headNode.append($("<span class='site-report-summary-label'></span>").text(label));
		if(count != null) {
			headNode.append($("<span class='site-report-summary-count'></span>").text(count.toLocaleString("en-GB")));
		}
		cellNode.append(headNode);

		if(sub instanceof jQuery) {
			cellNode.append(sub);
		}
		else {
			cellNode.append($("<span class='site-report-summary-sub'></span>").text(sub).attr("title", sub));
		}
		return cellNode;
	}

	renderSummary(siteData) {
		let summaryNode = $(".site-report-summary");
		summaryNode.empty();

		//Where the site is: the country, and the places in it under that
		let bsiModule = this.siteReport.getModuleByName("basicSiteInformation");
		let locationNames = bsiModule ? bsiModule.module.getOrderedLocations(siteData).map(location => location.location_name.trim()) : [];
		summaryNode.append(this.renderSummaryCell("overview", "Overview", null, locationNames.length > 0 ? locationNames.join(" · ") : "Location not recorded"));

		let sampleCount = this.getSampleCount(siteData);
		if(sampleCount > 0) {
			let sampleGroupCount = siteData.sample_groups.length;
			summaryNode.append(this.renderSummaryCell("samples", "Samples", sampleCount, "in "+sampleGroupCount.toLocaleString("en-GB")+(sampleGroupCount == 1 ? " group" : " groups")));
		}
		else {
			summaryNode.append(this.renderSummaryCell("samples", "Samples", null, "None recorded"));
		}

		let methods = this.siteReport.getAnalysisMethods(siteData);
		if(methods.length > 0) {
			let datasetCount = siteData.datasets.length;
			let cellNode = this.renderSummaryCell("analyses", "Analyses", datasetCount, this.renderAnalysesBar(methods));
			cellNode.attr("title", methods.map(method => method.name+" · "+method.datasets.length+(method.datasets.length == 1 ? " dataset" : " datasets")).join("\n"));
			summaryNode.append(cellNode);
		}
		else {
			summaryNode.append(this.renderSummaryCell("analyses", "Analyses", null, "None recorded"));
		}

		let dating = this.getDatingModule();
		if(dating && dating.hasDatings(siteData)) {
			let ageSummary = siteData.age_summary;
			summaryNode.append(this.renderSummaryCell("dating", "Dating", null, dating.formatRange(ageSummary.older, ageSummary.younger), "site-report-summary-dating"));
		}
		else {
			summaryNode.append(this.renderSummaryCell("dating", "Dating", null, "None recorded", "site-report-summary-dating"));
		}

		let biblioIds = this.siteReport.getReferenceBiblioIds(siteData);
		if(biblioIds.length > 0) {
			let biblios = siteData.lookup_tables.biblio.filter(biblio => biblioIds.includes(biblio.biblio_id));
			let referencesSub = biblios.slice(0, 2).map(biblio => this.getShortReference(biblio)).filter(text => text != "").join(" · ");
			if(biblioIds.length > 2) {
				referencesSub += " · "+(biblioIds.length - 2)+" more";
			}
			summaryNode.append(this.renderSummaryCell("references", "References", biblioIds.length, referencesSub));
		}
		else {
			summaryNode.append(this.renderSummaryCell("references", "References", null, "None recorded"));
		}
	}

	/*
	* Function: getShortReference
	* A reference as briefly as it can be cited: "Coope 1977", the first author's surname and the year,
	* or without an author, the beginning of the title.
	*/
	getShortReference(biblio) {
		if(biblio.bugs_reference) {
			return biblio.bugs_reference;
		}
		let surname = biblio.authors ? biblio.authors.split(/,|&| and /)[0].trim() : "";
		if(surname != "") {
			return [surname, biblio.year].filter(part => part).join(" ");
		}
		if(biblio.title) {
			return biblio.title.length > 40 ? biblio.title.slice(0, 40).trim()+"…" : biblio.title;
		}
		return biblio.year ? String(biblio.year) : "";
	}

	/*
	* Function: renderCard
	* A card for the overview, with a heading and, optionally, a link on to the tab with the rest.
	*/
	renderCard(title, linkText = null, linkCallback = null) {
		let cardNode = $("<section class='sqs-card sqs-card-body site-report-overview-card'></section>");
		let headNode = $("<div class='sqs-card-head-row'></div>");
		headNode.append($("<h2 class='sqs-card-title'></h2>").text(title));
		if(linkText) {
			let linkNode = $("<button type='button' class='sqs-link-btn'></button>").html(linkText+" &rarr;");
			linkNode.on("click", linkCallback);
			headNode.append(linkNode);
		}
		cardNode.append(headNode);
		return cardNode;
	}

	renderOverview(siteData) {
		let mainNode = $(".site-report-overview-main");
		mainNode.empty();

		let dating = this.getDatingModule();
		if(dating && dating.hasDatings(siteData)) {
			let datingCard = this.renderCard("Dating", "Open dating", () => {
				this.siteReport.setActiveTab("dating");
			});
			let datingNode = $("<div class='site-report-overview-dating'></div>");
			datingCard.append(datingNode);
			mainNode.append(datingCard);
			dating.renderOverviewDating(datingNode);
		}

		if(siteData.sample_groups.length > 0) {
			let sampleGroupsCard = this.renderCard("Sample groups", "All samples", () => {
				this.siteReport.setActiveTab("samples");
			});
			this.sqs.tooltipManager.registerTooltip($(".sqs-card-title", sampleGroupsCard), "A sample group is a set of related samples from the site, collected with the same sampling method. Samples are usually grouped by structure (e.g. House 1), stratigraphic sequence (e.g. Profile 3) or core, but the investigators decide the grouping.", { drawSymbol: true, anchorPoint: "symbol" });
			sampleGroupsCard.append(this.renderSampleGroupsTable(siteData));
			mainNode.append(sampleGroupsCard);
		}

		let methods = this.siteReport.getAnalysisMethods(siteData);
		if(methods.length > 0) {
			let analysesCard = this.renderCard("Analyses", "Open analyses", () => {
				this.siteReport.setActiveTab("analyses");
			});
			let listNode = $("<ul class='site-report-method-tiles'></ul>");
			methods.forEach(method => {
				let tileNode = $("<button type='button' class='site-report-method-tile'></button>");
				tileNode.append($("<span class='sqs-dot'></span>").css("background-color", method.color || "#8c8c8c"));
				let textNode = $("<span class='site-report-method-tile-text'></span>");
				textNode.append($("<span class='site-report-method-tile-name'></span>").text(method.name));
				let sub = method.sampleGroups.map(sampleGroup => sampleGroup.sample_group_name).slice(0, 3).join(", ");
				if(method.sampleGroups.length > 3) {
					sub += " and "+(method.sampleGroups.length - 3)+" more";
				}
				sub += (sub ? " · " : "")+method.datasets.length+(method.datasets.length == 1 ? " dataset" : " datasets");
				textNode.append($("<span class='site-report-method-tile-sub'></span>").text(sub));
				tileNode.append(textNode);
				tileNode.append("<i class='fa fa-angle-right' aria-hidden='true'></i>");
				tileNode.on("click", () => {
					this.siteReport.showAnalysisMethod(method.methodId);
				});
				listNode.append($("<li></li>").append(tileNode));
			});
			analysesCard.append(listNode);
			mainNode.append(analysesCard);
		}

		let siteBiblioIds = siteData.biblio.map(siteRef => siteRef.biblio_id);
		let siteReferencesHtml = this.sqs.renderBiblioReference(siteData, siteBiblioIds);
		if(siteReferencesHtml != "") {
			let referenceCard = this.renderCard(siteBiblioIds.length == 1 ? "Reference" : "References", "All references", () => {
				this.siteReport.setActiveTab("references");
			});
			referenceCard.append($("<div class='site-report-reference-list'></div>").html(siteReferencesHtml));
			mainNode.append(referenceCard);
		}
	}

	/*
	* Function: renderSampleGroupsTable
	* One row per sample group: how it was sampled, what was analysed and how many samples it has.
	* A row opens its sample group on the samples tab, and an analysis in it opens that method's datasets.
	*/
	renderSampleGroupsTable(siteData) {
		let tableNode = $("<table class='sqs-table site-report-sample-groups-table'><thead><tr><th>Group</th><th>Method</th><th>Analyses</th><th class='sqs-num'>Samples</th></tr></thead><tbody></tbody></table>");
		let methods = this.siteReport.getAnalysisMethods(siteData);

		siteData.sample_groups.forEach(sampleGroup => {
			let rowNode = $("<tr class='site-report-sample-groups-row'></tr>");
			let revealSampleGroup = () => {
				this.siteReport.revealSampleGroup(sampleGroup.sample_group_id);
			};
			rowNode.on("click", revealSampleGroup);

			let groupCell = $("<td></td>");
			let groupNameNode = $("<button type='button' class='site-report-group-name'></button>").text(sampleGroup.sample_group_name);
			groupNameNode.on("click", (evt) => {
				evt.stopPropagation();
				revealSampleGroup();
			});
			groupCell.append(groupNameNode);
			groupCell.append(" ");
			groupCell.append($("<span class='mono sqs-muted site-report-group-id'></span>").text("#"+sampleGroup.sample_group_id));
			rowNode.append(groupCell);

			let samplingMethod = this.siteReport.getMethod(sampleGroup.method_id);
			rowNode.append($("<td></td>").text(samplingMethod ? samplingMethod.method_name : "—"));

			let groupMethods = methods.filter(method => method.sampleGroups.includes(sampleGroup));
			let analysesCell = $("<td></td>");
			if(groupMethods.length == 0) {
				analysesCell.append($("<span class='sqs-muted'></span>").text("—"));
			}
			else if(groupMethods.length <= 2) {
				groupMethods.forEach(method => {
					let chipNode = $("<button type='button' class='sqs-chip site-report-method-chip'></button>");
					chipNode.append($("<span class='sqs-dot'></span>").css("background-color", method.color || "#8c8c8c"));
					chipNode.append($("<span></span>").text(method.abbrev || method.name));
					chipNode.attr("title", method.name);
					chipNode.on("click", (evt) => {
						evt.stopPropagation();
						this.siteReport.showAnalysisMethod(method.methodId);
					});
					analysesCell.append(chipNode).append(" ");
				});
			}
			else {
				let dotsNode = $("<span class='site-report-method-dots'></span>");
				groupMethods.forEach(method => {
					let dotNode = $("<button type='button' class='sqs-dot site-report-method-dot'></button>").css("background-color", method.color || "#8c8c8c");
					dotNode.attr("title", method.name).attr("aria-label", method.name);
					dotNode.on("click", (evt) => {
						evt.stopPropagation();
						this.siteReport.showAnalysisMethod(method.methodId);
					});
					dotsNode.append(dotNode);
				});
				analysesCell.append(dotsNode);
				analysesCell.append($("<span class='sqs-muted'></span>").text(" "+groupMethods.length+" methods"));
			}
			rowNode.append(analysesCell);

			rowNode.append($("<td class='sqs-num'></td>").text(sampleGroup.physical_samples.length.toLocaleString("en-GB")));
			tableNode.find("tbody").append(rowNode);
		});

		return $("<div class='site-report-table-scroll'></div>").append(tableNode);
	}

	destroy() {
	}
}

export { SiteOverview as default }
