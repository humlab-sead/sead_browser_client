/*
* Class: SiteOverview
*
* The summary under the site's name - its sample groups, samples, analyses and dating in figures -
* and the overview tab, which says a little about each and leads on to the tab with the rest.
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
	* The site's analysis methods as one bar, a segment for each, as wide as its share of the datasets.
	*/
	renderAnalysesBar(methods) {
		let barNode = $("<div class='site-report-analyses-bar'></div>");
		methods.forEach(method => {
			let color = method.color || "#8c8c8c";
			let segmentNode = $("<span class='site-report-analyses-bar-segment'></span>");
			segmentNode.css({
				flexGrow: method.datasets.length,
				backgroundColor: color,
				color: this.sqs.color.getContrastingTextColor(color)
			});
			segmentNode.attr("title", method.name+" · "+method.datasets.length+(method.datasets.length == 1 ? " dataset" : " datasets"));
			segmentNode.text(method.abbrev || method.name);
			barNode.append(segmentNode);
		});
		return barNode;
	}

	renderSummaryCell(label, value, sub, extraClass = "") {
		let cellNode = $("<div class='site-report-summary-cell'></div>");
		if(extraClass) {
			cellNode.addClass(extraClass);
		}
		cellNode.append($("<div class='sqs-label'></div>").text(label));
		if(value instanceof jQuery) {
			cellNode.append(value);
		}
		else {
			cellNode.append($("<div class='site-report-summary-value'></div>").text(value));
		}
		if(sub) {
			cellNode.append($("<div class='site-report-summary-sub'></div>").text(sub));
		}
		return cellNode;
	}

	renderSummary(siteData) {
		let summaryNode = $(".site-report-summary");
		summaryNode.empty();

		let sampleGroupNames = siteData.sample_groups.map(sampleGroup => sampleGroup.sample_group_name);
		let sampleGroupsSub = sampleGroupNames.slice(0, 3).join(" · ");
		if(sampleGroupNames.length > 3) {
			sampleGroupsSub += " · "+(sampleGroupNames.length - 3)+" more";
		}
		summaryNode.append(this.renderSummaryCell("Sample groups", siteData.sample_groups.length.toLocaleString("en-GB"), sampleGroupsSub));

		let sampleCount = this.getSampleCount(siteData);
		let samplesWithCoordinates = 0;
		siteData.sample_groups.forEach(sampleGroup => {
			sampleGroup.physical_samples.forEach(sample => {
				if(sample.coordinates && sample.coordinates.length > 0) {
					samplesWithCoordinates++;
				}
			});
		});
		let samplesSub = samplesWithCoordinates > 0 ? samplesWithCoordinates.toLocaleString("en-GB")+" with coordinates" : "";
		summaryNode.append(this.renderSummaryCell("Samples", sampleCount.toLocaleString("en-GB"), samplesSub));

		let methods = this.siteReport.getAnalysisMethods(siteData);
		if(methods.length > 0) {
			let datasetCount = siteData.datasets.length;
			let analysesSub = methods.length+(methods.length == 1 ? " method" : " methods")+" · "+datasetCount.toLocaleString("en-GB")+(datasetCount == 1 ? " dataset" : " datasets");
			summaryNode.append(this.renderSummaryCell("Analyses", this.renderAnalysesBar(methods), analysesSub, "site-report-summary-analyses"));
		}
		else {
			summaryNode.append(this.renderSummaryCell("Analyses", "None", ""));
		}

		let dating = this.getDatingModule();
		if(dating && dating.hasDatings(siteData)) {
			let ageSummary = siteData.age_summary;
			let datedSamples = dating.getDatedSampleIds().length;
			let datingSub = datedSamples+" of "+sampleCount+" samples · "+ageSummary.datings.map(d => d.method_name).join(", ");
			summaryNode.append(this.renderSummaryCell("Dated to", dating.formatRange(ageSummary.older, ageSummary.younger), datingSub, "site-report-summary-dating"));
		}
		else {
			summaryNode.append(this.renderSummaryCell("Dating", "None recorded", "", "site-report-summary-dating site-report-summary-empty"));
		}
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
	*/
	renderSampleGroupsTable(siteData) {
		let tableNode = $("<table class='sqs-table site-report-sample-groups-table'><thead><tr><th>Group</th><th>Method</th><th>Analyses</th><th class='sqs-num'>Samples</th></tr></thead><tbody></tbody></table>");
		let methods = this.siteReport.getAnalysisMethods(siteData);

		siteData.sample_groups.forEach(sampleGroup => {
			let rowNode = $("<tr></tr>");

			let groupCell = $("<td></td>");
			groupCell.append($("<span class='site-report-group-name'></span>").text(sampleGroup.sample_group_name));
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
					let chipNode = $("<span class='sqs-chip'></span>");
					chipNode.append($("<span class='sqs-dot'></span>").css("background-color", method.color || "#8c8c8c"));
					chipNode.append($("<span></span>").text(method.abbrev || method.name));
					chipNode.attr("title", method.name);
					analysesCell.append(chipNode).append(" ");
				});
			}
			else {
				let dotsNode = $("<span class='site-report-method-dots'></span>");
				groupMethods.forEach(method => {
					dotsNode.append($("<span class='sqs-dot'></span>").css("background-color", method.color || "#8c8c8c").attr("title", method.name));
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
