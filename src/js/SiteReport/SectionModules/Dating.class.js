/*
* Class: Dating
*
* The dating tab of the site report, and the dating card on its overview: when the site's samples
* are dated to, drawn as bars on a time axis, one per dated sample, under the method which dated
* it. Built from siteData.age_summary, which the server compiles from all of the site's datings,
* normalized to years BP.
*/
class Dating {
	constructor(sqs, siteReport) {
		this.sqs = sqs;
		this.siteReport = siteReport;
		this.siteData = null;
		this.calendar = "BP"; //"BP" or "AD/BC"
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
	* Function: formatYear
	* A year BP in the current calendar. The calendar has no year zero, so 1950 BP is 1 BC.
	*/
	formatYear(bp, calendar = this.calendar, withUnit = true) {
		if(calendar == "BP") {
			let text = Math.round(bp).toLocaleString("en-GB").replace(/,/g, " ");
			return withUnit ? text+" BP" : text;
		}
		let ad = Math.round(this.getBpYear() - bp);
		if(ad >= 1) {
			return withUnit ? "AD "+ad : String(ad);
		}
		let bc = 1 - ad;
		return withUnit ? bc+" BC" : String(bc);
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
			return "AD "+olderAd+"–"+youngerAd;
		}
		if(olderAd < 1 && youngerAd < 1) {
			return (1 - olderAd)+"–"+(1 - youngerAd)+" BC";
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
	* Function: renderCalendarToggle
	*/
	renderCalendarToggle(onChange) {
		let toggleNode = $("<div class='sqs-segmented' role='group' aria-label='Calendar'></div>");
		[["AD/BC", "AD / BC"], ["BP", "BP"]].forEach(([calendar, label]) => {
			let button = $("<button type='button'></button>").text(label);
			button.attr("aria-pressed", this.calendar == calendar ? "true" : "false");
			button.on("click", () => {
				if(this.calendar != calendar) {
					this.calendar = calendar;
					onChange();
				}
			});
			toggleNode.append(button);
		});
		return toggleNode;
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
		toolsNode.append(this.renderCalendarToggle(() => {
			this.renderDatingTab();
			this.renderSummaryDating();
			let overviewDatingNode = $(".site-report-overview-dating");
			if(overviewDatingNode.length > 0) {
				this.renderOverviewDating(overviewDatingNode);
			}
		}));
		headRow.append(toolsNode);

		let groups = ageSummary.datings.map(dating => {
			let rows = dating.ages.map(age => {
				let sampleInfo = age.physical_sample_id != null ? this.getSample(age.physical_sample_id) : null;
				let label = sampleInfo ? sampleInfo.sample.sample_name : "Sample";
				let sublabel = sampleInfo ? sampleInfo.sampleGroup.sample_group_name : "";
				if(age.relative_age_name) {
					sublabel = age.relative_age_name+(sublabel ? " · "+sublabel : "");
				}
				return {
					label: label,
					sublabel: sublabel,
					older: age.older,
					younger: age.younger,
					openOlder: age.open_older,
					openYounger: age.open_younger,
					approximate: age.approximate || age.radiocarbon_years,
					disputed: age.disputed
				};
			});
			rows.sort((a, b) => b.older - a.older);
			return {
				methodId: dating.method_id,
				title: dating.method_name,
				color: this.sqs.color.getAnalysisMethodColor(dating.method_id),
				rows: rows
			};
		});

		let timelineNode = $("#site-report-time-overview");
		timelineNode.empty();
		timelineNode.append(this.renderTimeline(groups, { expandable: true }));

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
		let text = "Each bar spans a sample's dating, from its oldest to its youngest year.";
		if(this.calendar == "BP") {
			text += " Years before present (BP) count back from "+this.getBpYear()+".";
		}
		else {
			text += " Calendar years, converted from years before present (BP, counted back from "+this.getBpYear()+").";
		}
		let radiocarbon = ageSummary.datings.filter(dating => dating.radiocarbon_years_count > 0).map(dating => dating.method_name);
		if(radiocarbon.length > 0) {
			text += " Some ages are in radiocarbon years, which are not calibrated and so not directly comparable with calendar years ("+radiocarbon.join(", ")+"); they are drawn faded.";
		}
		if(ageSummary.datings.some(dating => dating.open_older || dating.open_younger)) {
			text += " An open end means the dating only says older or younger than a year.";
		}
		return text;
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
	* The "dated to" cell in the summary at the top of the site report.
	*/
	renderSummaryDating() {
		let cellNode = $(".site-report-summary-dating");
		if(cellNode.length == 0 || !this.hasDatings()) {
			return;
		}
		let ageSummary = this.siteData.age_summary;
		$(".site-report-summary-value", cellNode).text(this.formatRange(ageSummary.older, ageSummary.younger));
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
				return Math.round(bp / 1000)+"k";
			}
			return Math.round(bp).toLocaleString("en-GB").replace(/,/g, " ");
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
	* groups - [{ title, color, methodId, rows: [{ label, sublabel, older, younger, openOlder, openYounger, approximate, disputed, color }] }]
	* options - compact: smaller rows, for the overview. expandable: fold long groups.
	*/
	renderTimeline(groups, options = {}) {
		let allRows = [];
		groups.forEach(group => allRows.push(...group.rows));
		let axis = this.getAxis(allRows);

		let timelineNode = $("<div class='dating-timeline'></div>");
		if(options.compact) {
			timelineNode.addClass("dating-timeline-compact");
		}

		groups.forEach(group => {
			let groupNode = $("<div class='dating-timeline-group'></div>");
			if(group.title) {
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
				groupNode.append(headNode);
			}

			let rows = group.rows;
			let folded = options.expandable && rows.length > this.rowsPerMethod && !this.expandedMethods.includes(group.methodId);
			if(folded) {
				rows = rows.slice(0, this.rowsPerMethod);
			}

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
				barNode.toggleClass("dating-timeline-bar-approximate", !!row.approximate);
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
				barNode.attr("title", row.label+": "+rangeText);
				trackNode.append(barNode);

				//The range is written beside the bar, on whichever side has room, or in it
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
				rowNode.append(trackNode);
				groupNode.append(rowNode);
			});

			if(folded) {
				let moreNode = $("<button type='button' class='sqs-link-btn dating-timeline-more'></button>");
				moreNode.text("Show all "+group.rows.length.toLocaleString("en-GB")+" samples");
				moreNode.on("click", () => {
					this.expandedMethods.push(group.methodId);
					this.renderDatingTab();
				});
				groupNode.append(moreNode);
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
