/*
* Class: Dating
*
* The dating tab of the site report, and the dating card on its overview: when the site's samples
* are dated to, under the method which dated them - as a table, or as bars on a time axis, one per
* dated sample. Built from siteData.age_summary, which the server compiles from all of the site's
* datings, normalized to years BP.
*/
class Dating {
	constructor(sqs, siteReport) {
		this.sqs = sqs;
		this.siteReport = siteReport;
		this.siteData = null;
		this.calendar = "BP"; //"BP" or "AD/BC"
		this.view = "graph"; //"table" or "graph"
		//How many samples a method lists before the rest are folded away
		this.rowsPerMethod = 25;
		this.expandedMethods = [];
	}

	getBpYear() {
		let ageSummary = this.siteData ? this.siteData.age_summary : null;
		return ageSummary && ageSummary.bp_year ? ageSummary.bp_year : this.sqs.config.constants.BP;
	}

	hasDatings(siteData = this.siteData) {
		return siteData && siteData.age_summary && Array.isArray(siteData.age_summary.datings) && siteData.age_summary.datings.length > 0;
	}

	/*
	* Function: getDefaultCalendar
	* Calendar years for the recent past, years BP for the deep past and for anything in
	* radiocarbon years, which calendar years would misrepresent.
	*/
	getDefaultCalendar(siteData) {
		let ageSummary = siteData.age_summary;
		let radiocarbon = ageSummary.datings.some(dating => dating.radiocarbon_years_count > 0);
		if(radiocarbon || ageSummary.older > 5000) {
			return "BP";
		}
		return "AD/BC";
	}

	/*
	* Function: formatNumber
	* Digits grouped by thin spaces, "2 700 000". Calendar years below 10 000 are written as they are, "AD 1303".
	*/
	formatNumber(value, groupFourDigits = true) {
		value = Math.round(value) || 0; //No "-0"
		if(!groupFourDigits && Math.abs(value) < 10000) {
			return String(value);
		}
		return value.toLocaleString("en-GB").replace(/,/g, "\u2009");
	}

	/*
	* Function: formatYear
	* A year BP in the current calendar. The calendar has no year zero, so 1950 BP is 1 BC.
	*/
	formatYear(bp, calendar = this.calendar, withUnit = true) {
		if(calendar == "BP") {
			let text = this.formatNumber(bp);
			return withUnit ? text+" BP" : text;
		}
		let ad = Math.round(this.getBpYear() - bp);
		if(ad >= 1) {
			return withUnit ? "AD "+this.formatNumber(ad, false) : this.formatNumber(ad, false);
		}
		let bc = this.formatNumber(1 - ad, false);
		return withUnit ? bc+" BC" : bc;
	}

	/*
	* Function: formatRange
	* From older to younger, e.g. "AD 1303–1717", "605 BC – AD 20" or "10 000 – 7 000 BP".
	*/
	formatRange(older, younger, calendar = this.calendar) {
		if(older == younger) {
			return this.formatYear(older, calendar);
		}
		if(calendar == "BP") {
			return this.formatYear(older, calendar, false)+" – "+this.formatYear(younger, calendar);
		}
		let bpYear = this.getBpYear();
		let olderAd = Math.round(bpYear - older);
		let youngerAd = Math.round(bpYear - younger);
		if(olderAd >= 1 && youngerAd >= 1) {
			return "AD "+this.formatNumber(olderAd, false)+"–"+this.formatNumber(youngerAd, false);
		}
		if(olderAd < 1 && youngerAd < 1) {
			return this.formatNumber(1 - olderAd, false)+"–"+this.formatNumber(1 - youngerAd, false)+" BC";
		}
		return this.formatYear(older, calendar)+" – "+this.formatYear(younger, calendar);
	}

	getSample(physicalSampleId) {
		for(let sampleGroup of this.siteData.sample_groups) {
			let sample = sampleGroup.physical_samples.find(sample => sample.physical_sample_id == physicalSampleId);
			if(sample) {
				return { sample: sample, sampleGroup: sampleGroup };
			}
		}
		return null;
	}

	getSampleCount() {
		let count = 0;
		this.siteData.sample_groups.forEach(sampleGroup => {
			count += sampleGroup.physical_samples.length;
		});
		return count;
	}

	getDatedSampleIds() {
		let sampleIds = [];
		this.siteData.age_summary.datings.forEach(dating => {
			dating.ages.forEach(age => {
				if(age.physical_sample_id != null && !sampleIds.includes(age.physical_sample_id)) {
					sampleIds.push(age.physical_sample_id);
				}
			});
		});
		return sampleIds;
	}

	render(siteData) {
		this.siteData = siteData;
		if(!this.hasDatings(siteData)) {
			return;
		}
		this.calendar = this.getDefaultCalendar(siteData);
		this.renderDatingTab();
	}

	/*
	* Function: renderSegmentedToggle
	* Buttons for picking one of a few values, such as the calendar or the view.
	*
	* Parameters:
	* ariaLabel - What is being picked.
	* options - [[value, label], ...]
	* selected - The value picked now.
	* onChange - Called with the value when another one is picked.
	*/
	renderSegmentedToggle(ariaLabel, options, selected, onChange) {
		let toggleNode = $("<div class='sqs-segmented' role='group'></div>");
		toggleNode.attr("aria-label", ariaLabel);
		options.forEach(([value, label]) => {
			let button = $("<button type='button'></button>").text(label);
			button.attr("aria-pressed", selected == value ? "true" : "false");
			button.on("click", () => {
				if(selected != value) {
					onChange(value);
				}
			});
			toggleNode.append(button);
		});
		return toggleNode;
	}

	/*
	* Function: getDatingRows
	* One row per sample and dating. A sample's dating is often recorded once for each of its analyses,
	* which would otherwise list the sample several times over.
	*/
	getDatingRows(dating) {
		let rows = [];
		let seenKeys = new Set();
		dating.ages.forEach(age => {
			let relativeAgeName = age.relative_age_name ? age.relative_age_name.trim() : "";
			let key = [age.physical_sample_id, relativeAgeName, age.older, age.younger, age.open_older, age.open_younger].join("|");
			if(seenKeys.has(key)) {
				return;
			}
			seenKeys.add(key);

			let sampleInfo = age.physical_sample_id != null ? this.getSample(age.physical_sample_id) : null;
			rows.push({
				label: sampleInfo ? sampleInfo.sample.sample_name : "Sample",
				sampleGroupName: sampleInfo ? sampleInfo.sampleGroup.sample_group_name : "",
				relativeAgeName: relativeAgeName,
				older: age.older,
				younger: age.younger,
				openOlder: age.open_older,
				openYounger: age.open_younger,
				approximate: age.approximate,
				radiocarbon: age.radiocarbon_years,
				disputed: age.disputed
			});
		});
		rows.sort((a, b) => b.older - a.older || a.label.localeCompare(b.label, "en-GB", { numeric: true }));
		return rows;
	}

	/*
	* Function: getRangeText
	* A row's dating in words, in the current calendar: "605 BC – AD 20", "older than 10 000 BP".
	*/
	getRangeText(row) {
		let rangeText = this.formatRange(row.older, row.younger);
		if(row.openOlder) {
			rangeText = "older than "+this.formatYear(row.older);
		}
		if(row.openYounger) {
			rangeText = "younger than "+this.formatYear(row.younger);
		}
		if(row.disputed) {
			rangeText += " (disputed)";
		}
		return rangeText;
	}

	renderDatingTab() {
		let ageSummary = this.siteData.age_summary;
		let cardNode = $(".site-report-dating-card");
		let datedSampleIds = this.getDatedSampleIds();
		let sampleCount = this.getSampleCount();
		let methodCount = ageSummary.datings.length;

		$(".sqs-card-title", cardNode).text("Dated samples");
		$(".site-report-dating-subtitle").text(
			datedSampleIds.length.toLocaleString("en-GB")+" of "+sampleCount.toLocaleString("en-GB")+" samples dated · "
			+methodCount+(methodCount == 1 ? " method" : " methods")
		);

		let headRow = $(".sqs-card-head-row", cardNode);
		$(".site-report-dating-tools", headRow).remove();
		let toolsNode = $("<div class='site-report-dating-tools'></div>");
		toolsNode.append(this.renderSegmentedToggle("Show as", [["table", "Table"], ["graph", "Graph"]], this.view, (view) => {
			this.view = view;
			this.renderDatingTab();
		}));
		toolsNode.append(this.renderSegmentedToggle("Calendar", [["AD/BC", "AD / BC"], ["BP", "BP"]], this.calendar, (calendar) => {
			this.calendar = calendar;
			this.renderDatingTab();
			this.renderSummaryDating();
			let overviewDatingNode = $(".site-report-overview-dating");
			if(overviewDatingNode.length > 0) {
				this.renderOverviewDating(overviewDatingNode);
			}
		}));
		headRow.append(toolsNode);

		let groups = ageSummary.datings.map(dating => {
			return {
				methodId: dating.method_id,
				title: dating.method_name,
				color: this.sqs.color.getAnalysisMethodColor(dating.method_id),
				rows: this.getDatingRows(dating)
			};
		});

		let contentNode = $("#site-report-time-overview");
		contentNode.empty();
		if(this.view == "table") {
			contentNode.append(this.renderTables(groups));
		}
		else {
			contentNode.append(this.renderTimeline(groups, { expandable: true, rangeLabels: false }));
		}

		let notDatedCount = sampleCount - datedSampleIds.length;
		let methodsNode = $(".site-report-dating-methods");
		methodsNode.empty();
		if(notDatedCount > 0) {
			methodsNode.append($("<p class='sqs-muted'></p>").text(notDatedCount.toLocaleString("en-GB")+(notDatedCount == 1 ? " sample is" : " samples are")+" not dated."));
		}

		let noteNode = $(".site-report-dating-note");
		noteNode.empty();
		noteNode.append("<i class='fa fa-info-circle' aria-hidden='true'></i>");
		noteNode.append($("<span></span>").text(this.getExplanation()));
	}

	getExplanation() {
		let ageSummary = this.siteData.age_summary;
		let graph = this.view == "graph";
		let text = graph ? "Each bar spans a sample's dating, from its oldest to its youngest year. " : "";
		if(this.calendar == "BP") {
			text += "Years before present (BP) count back from "+this.getBpYear()+".";
		}
		else {
			text += "Calendar years, converted from years before present (BP, counted back from "+this.getBpYear()+").";
		}
		let radiocarbon = ageSummary.datings.filter(dating => dating.radiocarbon_years_count > 0).map(dating => dating.method_name);
		if(radiocarbon.length > 0) {
			text += " Some ages are in radiocarbon years, which are not calibrated and so not directly comparable with calendar years ("+radiocarbon.join(", ")+")";
			text += graph ? "; they are drawn faded." : ".";
		}
		if(graph && ageSummary.datings.some(dating => dating.open_older || dating.open_younger)) {
			text += " An open end means the dating only says older or younger than a year.";
		}
		return text;
	}

	/*
	* Function: getVisibleRows
	* A group's rows, but only the first few of a long one until the user asks for all of them.
	*/
	getVisibleRows(group, expandable) {
		if(expandable && group.rows.length > this.rowsPerMethod && !this.expandedMethods.includes(group.methodId)) {
			return group.rows.slice(0, this.rowsPerMethod);
		}
		return group.rows;
	}

	renderShowAllButton(group, className) {
		let moreNode = $("<button type='button' class='sqs-link-btn'></button>").addClass(className);
		moreNode.text("Show all "+group.rows.length.toLocaleString("en-GB")+" samples");
		moreNode.on("click", () => {
			this.expandedMethods.push(group.methodId);
			this.renderDatingTab();
		});
		return moreNode;
	}

	/*
	* Function: renderGroupHead
	* The name of a dating method, over its samples, with a link to its datasets when it has any.
	*/
	renderGroupHead(group) {
		let headNode = $("<div class='dating-timeline-group-head'></div>");
		headNode.append($("<span class='sqs-dot'></span>").css("background-color", group.color || "#8c8c8c"));
		headNode.append($("<span class='sqs-label'></span>").text(group.title));
		if(this.siteReport.getAnalysisMethods().find(method => method.methodId == group.methodId)) {
			let linkNode = $("<button type='button' class='sqs-link-btn'>Datasets &rarr;</button>");
			linkNode.on("click", () => {
				this.siteReport.showAnalysisMethod(group.methodId);
			});
			headNode.append(linkNode);
		}
		return headNode;
	}

	/*
	* Function: renderTables
	*
	* A table per method, a row per dated sample, oldest first.
	*
	* Parameters:
	* groups - [{ title, color, methodId, rows: [{ label, sampleGroupName, relativeAgeName, older, younger, openOlder, openYounger, radiocarbon, disputed }] }]
	*/
	renderTables(groups) {
		let tablesNode = $("<div class='dating-tables'></div>");

		groups.forEach(group => {
			let groupNode = $("<div class='dating-table-group'></div>");
			groupNode.append(this.renderGroupHead(group));

			//Datings by an archaeological period or the like name it, others are just years
			let showRelativeAge = group.rows.some(row => row.relativeAgeName);
			let tableNode = $("<table class='sqs-table dating-table'><thead><tr></tr></thead><tbody></tbody></table>");
			let headRowNode = $("thead tr", tableNode);
			headRowNode.append("<th>Sample</th><th>Sample group</th>");
			if(showRelativeAge) {
				headRowNode.append("<th>Dated as</th>");
			}
			headRowNode.append("<th>Age</th>");

			let rows = this.getVisibleRows(group, true);
			rows.forEach(row => {
				let rowNode = $("<tr></tr>");
				rowNode.append($("<td class='dating-table-sample'></td>").text(row.label));
				rowNode.append($("<td></td>").text(row.sampleGroupName));
				if(showRelativeAge) {
					rowNode.append($("<td></td>").text(row.relativeAgeName));
				}
				let ageCell = $("<td class='dating-table-age'></td>").text((row.approximate ? "c. " : "")+this.getRangeText(row));
				if(row.radiocarbon) {
					ageCell.append(" ", $("<span class='sqs-muted'></span>").text("(radiocarbon years)"));
				}
				rowNode.append(ageCell);
				$("tbody", tableNode).append(rowNode);
			});
			groupNode.append($("<div class='dating-table-scroll'></div>").append(tableNode));

			if(rows.length < group.rows.length) {
				groupNode.append(this.renderShowAllButton(group, "dating-table-more"));
			}
			tablesNode.append(groupNode);
		});

		return tablesNode;
	}

	/*
	* Function: renderOverviewDating
	* The dating card on the overview: one bar per method, from its oldest to its youngest dating.
	*/
	renderOverviewDating(containerNode) {
		let groups = [{
			title: null,
			rows: this.siteData.age_summary.datings.map(dating => {
				return {
					label: dating.method_name,
					sublabel: dating.sample_count+(dating.sample_count == 1 ? " sample" : " samples"),
					older: dating.older,
					younger: dating.younger,
					openOlder: dating.open_older,
					openYounger: dating.open_younger,
					approximate: dating.radiocarbon_years_count > 0,
					color: this.sqs.color.getAnalysisMethodColor(dating.method_id)
				};
			})
		}];
		containerNode.empty().append(this.renderTimeline(groups, { compact: true }));
	}

	/*
	* Function: renderSummaryDating
	* The dating tab's cell in the summary at the top of the site report.
	*/
	renderSummaryDating() {
		let cellNode = $(".site-report-summary-dating");
		if(cellNode.length == 0 || !this.hasDatings()) {
			return;
		}
		let ageSummary = this.siteData.age_summary;
		let range = this.formatRange(ageSummary.older, ageSummary.younger);
		$(".site-report-summary-value", cellNode).text(range).attr("title", range);
	}

	/*
	* Function: getAxis
	* The span the bars are drawn on, with a little room on either side, and its tick marks at
	* round numbers.
	*/
	getAxis(rows) {
		let older = Math.max(...rows.map(row => row.older));
		let younger = Math.min(...rows.map(row => row.younger));
		let span = older - younger;
		if(span <= 0) {
			span = Math.max(10, older * 0.1);
		}
		let padding = span * 0.06;
		let axisOlder = older + padding;
		let axisYounger = younger - padding;

		//Ticks at round numbers, in the calendar shown, so the labels read 1500, 1600, ... rather than 450 BP, 350 BP, ...
		let bpYear = this.getBpYear();
		let toCalendar = (bp) => this.calendar == "BP" ? bp : bpYear - bp;
		let fromCalendar = (value) => this.calendar == "BP" ? value : bpYear - value;
		let roughStep = (axisOlder - axisYounger) / 6;
		let magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
		let step = [1, 2, 5, 10].map(m => m * magnitude).find(s => s >= roughStep);

		let ticks = [];
		let start = Math.ceil(Math.min(toCalendar(axisOlder), toCalendar(axisYounger)) / step) * step;
		let end = Math.max(toCalendar(axisOlder), toCalendar(axisYounger));
		for(let value = start; value <= end; value += step) {
			ticks.push(fromCalendar(value));
		}

		return {
			older: axisOlder,
			younger: axisYounger,
			ticks: ticks,
			position: (bp) => (axisOlder - bp) / (axisOlder - axisYounger) * 100
		};
	}

	formatTick(bp) {
		if(this.calendar == "BP") {
			if(Math.abs(bp) >= 10000) {
				return this.formatNumber(bp / 1000, false)+"k";
			}
			return this.formatNumber(bp);
		}
		let ad = Math.round(this.getBpYear() - bp);
		if(ad >= 1) {
			return String(ad);
		}
		let bc = 1 - ad;
		return bc >= 10000 ? Math.round(bc / 1000)+"k BC" : bc+" BC";
	}

	/*
	* Function: renderTimeline
	*
	* Bars on a time axis, older to the left. Each group is a method, with its rows under it.
	*
	* Parameters:
	* groups - [{ title, color, methodId, rows: [{ label, sublabel, relativeAgeName, older, younger, openOlder, openYounger, approximate, radiocarbon, disputed, color }] }]
	* options - compact: smaller rows, for the overview. expandable: fold long groups. rangeLabels: write each
	* row's dating beside its bar, rather than only in its tooltip.
	*/
	renderTimeline(groups, options = {}) {
		let rangeLabels = options.rangeLabels !== false;
		let allRows = [];
		groups.forEach(group => allRows.push(...group.rows));
		let axis = this.getAxis(allRows);

		let timelineNode = $("<div class='dating-timeline'></div>");
		if(options.compact) {
			timelineNode.addClass("dating-timeline-compact");
		}
		if(!rangeLabels) {
			timelineNode.addClass("dating-timeline-chart");
		}

		groups.forEach(group => {
			let groupNode = $("<div class='dating-timeline-group'></div>");
			if(group.title) {
				groupNode.append(this.renderGroupHead(group));
			}

			let rows = this.getVisibleRows(group, options.expandable);
			rows.forEach(row => {
				let rowNode = $("<div class='dating-timeline-row'></div>");
				let labelNode = $("<div class='dating-timeline-label'></div>");
				labelNode.append($("<span class='dating-timeline-label-main'></span>").text(row.label));
				if(row.sublabel) {
					labelNode.append($("<span class='dating-timeline-label-sub'></span>").text(row.sublabel));
				}
				rowNode.append(labelNode);

				let trackNode = $("<div class='dating-timeline-track'></div>");
				let left = axis.position(row.older);
				let right = axis.position(row.younger);
				let barNode = $("<div class='dating-timeline-bar'></div>");
				barNode.css({
					left: left+"%",
					width: Math.max(0, right - left)+"%",
					backgroundColor: row.color || group.color || this.sqs.color.colors.baseColor
				});
				barNode.toggleClass("dating-timeline-bar-open-older", !!row.openOlder);
				barNode.toggleClass("dating-timeline-bar-open-younger", !!row.openYounger);
				barNode.toggleClass("dating-timeline-bar-approximate", !!(row.approximate || row.radiocarbon));
				let rangeText = this.getRangeText(row);
				barNode.attr("title", row.label+(row.relativeAgeName ? " · "+row.relativeAgeName : "")+": "+rangeText);
				trackNode.append(barNode);

				//The range is written beside the bar, on whichever side has room, or in it
				if(rangeLabels) {
					let rangeNode = $("<span class='dating-timeline-range'></span>").text(rangeText);
					if(right < 70) {
						rangeNode.css("left", "calc("+right+"% + 8px)");
					}
					else if(left > 30) {
						rangeNode.css("right", "calc("+(100 - left)+"% + 8px)");
					}
					else {
						rangeNode.addClass("dating-timeline-range-inside").css("left", "calc("+left+"% + 6px)");
					}
					trackNode.append(rangeNode);
				}
				rowNode.append(trackNode);
				groupNode.append(rowNode);
			});

			if(rows.length < group.rows.length) {
				groupNode.append(this.renderShowAllButton(group, "dating-timeline-more"));
			}

			timelineNode.append(groupNode);
		});

		let axisNode = $("<div class='dating-timeline-axis'><div></div><div class='dating-timeline-axis-ticks'></div></div>");
		axis.ticks.forEach(tick => {
			let tickNode = $("<span class='mono'></span>").text(this.formatTick(tick));
			tickNode.css("left", axis.position(tick)+"%");
			$(".dating-timeline-axis-ticks", axisNode).append(tickNode);
		});
		timelineNode.append(axisNode);

		//Light vertical lines at the ticks, behind the bars
		let gridNode = $("<div class='dating-timeline-grid' aria-hidden='true'></div>");
		axis.ticks.forEach(tick => {
			gridNode.append($("<span></span>").css("left", axis.position(tick)+"%"));
		});
		timelineNode.prepend(gridNode);

		return timelineNode;
	}

	destroy() {
	}
}

export { Dating as default }
