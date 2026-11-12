import { computePosition, autoUpdate, flip, shift, offset } from "@floating-ui/dom";
import DendroLib from "../../../../lib/sead_common/DendroLib.class";

/*
* Class: DendroChart
*
* The graph view of a site's dendrochronology dataset: a row per dated sample, with a bar on a time axis
* from the year its tree germinated to the year it was felled, in the color of its tree species. A felling
* year known only within a range has that range drawn on after the bar, lighter.
*
* It is drawn as the dating tab's timeline is, with the same rows, grid and axis. The years are estimated by
* DendroLib, which the server's dating module uses as well, so the two agree.
*/
class DendroChart {
	constructor(siteReport, contentItem) {
		this.siteReport = siteReport;
		this.sqs = siteReport.sqs;
		this.contentItem = contentItem;
		this.dendroLib = new DendroLib();
		this.anchorNodeSelector = null;
		this.chartNode = null;
		this.tooltipNode = null;
		this.tooltipCleanup = null;
		//Species without a color of their own, and samples without a species
		this.otherSpeciesColor = "#a0a0a0";
		this.readRenderOptions();

		this.sqs.sqsEventListen("siteReportClosed", () => {
			this.unrender();
		}, this);
	}

	/*
	* Function: getSelectedRenderOptionExtra
	* The value picked in one of the graph's options, such as "Sort", or the default when it has none.
	*/
	getSelectedRenderOptionExtra(extraOptionTitle, defaultValue) {
		let renderOption = this.contentItem.renderOptions.find(ro => ro && ro.type == "dendrochart");
		let extraOption = renderOption && renderOption.options ? renderOption.options.find(roE => roE.title == extraOptionTitle) : null;
		if(!extraOption || extraOption.options.length == 0) {
			return defaultValue;
		}
		let selectedOption = extraOption.options.find(option => option.selected === true) || extraOption.options[0];
		return selectedOption.value;
	}

	readRenderOptions() {
		this.selectedSort = this.getSelectedRenderOptionExtra("Sort", "felling year");
		this.showUncertainty = this.getSelectedRenderOptionExtra("Uncertainty", "estimates");
		this.selectedSampleGroup = this.getSelectedRenderOptionExtra("Sample group", "all");
	}

	isInSelectedSampleGroup(sampleDataObject) {
		if(this.selectedSampleGroup == "all") {
			return true;
		}
		return this.siteReport.siteData.sample_groups.some(sg => {
			return sg.sample_group_id == this.selectedSampleGroup && sg.physical_samples.some(ps => ps.physical_sample_id == sampleDataObject.physical_sample_id);
		});
	}

	getSpeciesColor(species) {
		let speciesColor = (this.sqs.config.treeSpeciesColors || []).find(sc => sc.species === species);
		return speciesColor ? "#"+speciesColor.color : this.otherSpeciesColor;
	}

	toYear(value) {
		let year = parseInt(value);
		return isNaN(year) ? null : year;
	}

	/*
	* Function: getRow
	* A sample's years, as estimated by DendroLib, or null if it isn't dated.
	*/
	getRow(sampleDataObject) {
		if(typeof this.dendroLib.getDendroMeasurementByName("Not dated", sampleDataObject) != "undefined") {
			return null;
		}
		let fellingOldest = this.toYear(this.dendroLib.getOldestFellingYear(sampleDataObject).value);
		let fellingYoungest = this.toYear(this.dendroLib.getYoungestFellingYear(sampleDataObject).value);
		if(fellingOldest == null || fellingYoungest == null) {
			return null;
		}
		let species = this.dendroLib.getDendroMeasurementByName("Tree species", sampleDataObject) || null;
		return {
			sampleDataObject: sampleDataObject,
			physicalSampleId: sampleDataObject.physical_sample_id,
			label: String(sampleDataObject.sample_name),
			species: species,
			color: this.getSpeciesColor(species),
			germinationOldest: this.toYear(this.dendroLib.getOldestGerminationYear(sampleDataObject).value),
			germinationYoungest: this.toYear(this.dendroLib.getYoungestGerminationYear(sampleDataObject).value),
			fellingOldest: Math.min(fellingOldest, fellingYoungest),
			fellingYoungest: Math.max(fellingOldest, fellingYoungest)
		};
	}

	/*
	* Function: getBarStart
	* Where a sample's bar begins: the latest year its tree can have germinated, else the earliest, else
	* it is just a mark at its felling year.
	*/
	getBarStart(row) {
		let germinationYear = row.germinationYoungest != null ? row.germinationYoungest : row.germinationOldest;
		return germinationYear != null ? Math.min(germinationYear, row.fellingOldest) : row.fellingOldest;
	}

	showsFellingRange(row) {
		return this.showUncertainty != "none" && row.fellingYoungest > row.fellingOldest;
	}

	/*
	* Function: sortRows
	* In the order picked, with the estimates taken into account if they are shown, and by name where that is equal.
	*/
	sortRows(rows) {
		let estimates = this.showUncertainty == "estimates";
		let byName = (a, b) => a.label.localeCompare(b.label, "en-GB", { numeric: true });
		let byYear = (getYear) => (a, b) => {
			let yearA = getYear(a);
			let yearB = getYear(b);
			if(yearA == null || yearB == null) {
				return (yearA == null) - (yearB == null) || byName(a, b);
			}
			return yearA - yearB || byName(a, b);
		};

		switch(this.selectedSort) {
			case "alphabetical":
				rows.sort(byName);
				break;
			case "germination year":
				rows.sort(byYear(row => estimates && row.germinationOldest != null ? row.germinationOldest : row.germinationYoungest));
				break;
			case "felling year":
				rows.sort(byYear(row => estimates ? row.fellingYoungest : row.fellingOldest));
				break;
			case "tree species":
				rows.sort((a, b) => (a.species || "").localeCompare(b.species || "", "sv") || byName(a, b));
				break;
		}
		return rows;
	}

	/*
	* Function: getAxis
	* The years the bars are drawn on, with a little room on either side, and its tick marks at round years.
	*/
	getAxis(rows) {
		let first = Math.min(...rows.map(row => row.germinationOldest != null ? Math.min(row.germinationOldest, this.getBarStart(row)) : this.getBarStart(row)));
		let last = Math.max(...rows.map(row => row.fellingYoungest));
		let span = Math.max(last - first, 10);
		let padding = span * 0.06;
		let axisFirst = first - padding;
		let axisLast = last + padding;

		let roughStep = (axisLast - axisFirst) / 6;
		let magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
		let step = [1, 2, 5, 10].map(m => m * magnitude).find(s => s >= roughStep);
		let ticks = [];
		for(let year = Math.ceil(axisFirst / step) * step; year <= axisLast; year += step) {
			ticks.push(year);
		}

		return {
			ticks: ticks,
			position: (year) => (year - axisFirst) / (axisLast - axisFirst) * 100
		};
	}

	formatYearRange(older, younger) {
		if(older == null && younger == null) {
			return "Unknown";
		}
		if(older == null || younger == null || older == younger) {
			return String(older != null ? older : younger);
		}
		return older+"–"+younger;
	}

	render(anchorNodeSelector) {
		this.anchorNodeSelector = anchorNodeSelector;
		this.renderChart();
		return this;
	}

	/*
	* Function: update
	* Draws the chart again when one of its options changes. Anything else, such as a switch to the
	* spreadsheet, needs a render instance of its own.
	*/
	update(updatedExtrasRenderOption = null) {
		let selectedRenderOption = this.contentItem.renderOptions.find(ro => ro && ro.selected);
		if(updatedExtrasRenderOption == null || !selectedRenderOption || selectedRenderOption.type != "dendrochart") {
			return false;
		}
		this.readRenderOptions();
		this.renderChart();
		return true;
	}

	renderChart() {
		this.hideTooltip();
		if(this.chartNode) {
			this.chartNode.remove();
		}

		let rows = [];
		let notDatedCount = 0;
		this.dendroLib.dataGroupsToSampleDataObjects(this.contentItem.data.dataGroups).forEach(sampleDataObject => {
			if(!this.isInSelectedSampleGroup(sampleDataObject)) {
				return;
			}
			let row = this.getRow(sampleDataObject);
			if(row == null) {
				notDatedCount++;
				return;
			}
			rows.push(row);
		});
		this.sortRows(rows);

		this.chartNode = $("<div class='dendro-chart'></div>");
		if(rows.length == 0) {
			this.chartNode.append($("<p class='sqs-muted dendro-chart-note'></p>").text("There are no dated samples in this "+(this.selectedSampleGroup == "all" ? "dataset" : "sample group")+"."));
		}
		else {
			this.chartNode.append(this.renderLegend(rows));
			this.chartNode.append(this.renderTimeline(rows));
		}
		if(notDatedCount > 0 && rows.length > 0) {
			let note = notDatedCount.toLocaleString("en-GB")+(notDatedCount == 1 ? " sample isn't" : " samples aren't")+" shown, as "+(notDatedCount == 1 ? "it lacks" : "they lack")+" a dating. "+(notDatedCount == 1 ? "It is" : "They are")+" in the ";
			let noteNode = $("<p class='sqs-muted dendro-chart-note'></p>").text(note);
			let spreadsheetButton = $("<button type='button' class='sqs-link-btn dendro-chart-note-link'>spreadsheet view</button>");
			spreadsheetButton.on("click", () => {
				this.showSpreadsheet();
			});
			noteNode.append(spreadsheetButton, ".");
			this.chartNode.append(noteNode);
		}
		$(this.anchorNodeSelector).append(this.chartNode);
	}

	/*
	* Function: renderLegend
	* The tree species shown, in the order of the palette, and what the lighter felling ranges mean.
	*/
	renderLegend(rows) {
		let speciesOrder = (this.sqs.config.treeSpeciesColors || []).map(sc => sc.species);
		let species = [...new Set(rows.map(row => row.species))];
		species.sort((a, b) => {
			let indexA = speciesOrder.includes(a) ? speciesOrder.indexOf(a) : speciesOrder.length;
			let indexB = speciesOrder.includes(b) ? speciesOrder.indexOf(b) : speciesOrder.length;
			return indexA - indexB || String(a).localeCompare(String(b), "sv");
		});

		let legendNode = $("<div class='dendro-chart-legend'></div>");
		species.forEach(name => {
			let itemNode = $("<span class='dendro-chart-legend-item'></span>");
			itemNode.append($("<span class='sqs-dot'></span>").css("background-color", this.getSpeciesColor(name)));
			itemNode.append($("<span></span>").text(name || "Species not given"));
			legendNode.append(itemNode);
		});
		if(rows.some(row => this.showsFellingRange(row))) {
			let itemNode = $("<span class='dendro-chart-legend-item'></span>");
			itemNode.append("<span class='dendro-chart-legend-range' aria-hidden='true'></span>");
			itemNode.append($("<span></span>").text("Felling year within a range"));
			legendNode.append(itemNode);
		}
		return legendNode;
	}

	/*
	* Function: renderTimeline
	* A row per sample, the bar from germination to felling, then the felling range, if there is one.
	*/
	renderTimeline(rows) {
		let axis = this.getAxis(rows);
		let timelineNode = $("<div class='dating-timeline dating-timeline-chart dendro-timeline'></div>");

		let gridNode = $("<div class='dating-timeline-grid' aria-hidden='true'></div>");
		axis.ticks.forEach(tick => {
			gridNode.append($("<span></span>").css("left", axis.position(tick)+"%"));
		});
		timelineNode.append(gridNode);

		rows.forEach(row => {
			let rowNode = $("<button type='button' class='dating-timeline-row dendro-timeline-row'></button>");
			rowNode.attr("aria-label", this.getRowDescription(row));

			let labelNode = $("<span class='dating-timeline-label dendro-timeline-label'></span>");
			labelNode.append($("<span class='dating-timeline-label-main'></span>").text(row.label));
			if(row.species) {
				labelNode.append($("<span class='dating-timeline-label-sub'></span>").text(row.species));
			}
			rowNode.append(labelNode);

			let trackNode = $("<span class='dating-timeline-track'></span>");
			let left = axis.position(this.getBarStart(row));
			let right = axis.position(row.fellingOldest);
			let barNode = $("<span class='dating-timeline-bar dendro-timeline-bar'></span>").css({
				left: left+"%",
				width: Math.max(0, right - left)+"%",
				backgroundColor: row.color
			});
			trackNode.append(barNode);

			if(this.showsFellingRange(row)) {
				barNode.addClass("dendro-timeline-bar-continued");
				trackNode.append($("<span class='dendro-timeline-felling-range'></span>").css({
					left: right+"%",
					width: (axis.position(row.fellingYoungest) - right)+"%",
					backgroundColor: row.color,
					borderColor: row.color
				}));
			}
			rowNode.append(trackNode);

			rowNode.on("mouseenter focus", () => {
				this.showTooltip(row, barNode[0]);
			});
			rowNode.on("mouseleave blur", () => {
				this.hideTooltip();
			});
			rowNode.on("click", () => {
				this.hideTooltip();
				this.showSample(row);
			});

			timelineNode.append(rowNode);
		});

		let axisNode = $("<div class='dating-timeline-axis'><div></div><div class='dating-timeline-axis-ticks'></div></div>");
		axis.ticks.forEach(tick => {
			let tickNode = $("<span class='mono'></span>").text(tick);
			tickNode.css("left", axis.position(tick)+"%");
			$(".dating-timeline-axis-ticks", axisNode).append(tickNode);
		});
		timelineNode.append(axisNode);

		return timelineNode;
	}

	getRowDescription(row) {
		let description = "Sample "+row.label;
		if(row.species) {
			description += ", "+row.species;
		}
		description += ". Germinated "+this.formatYearRange(row.germinationOldest, row.germinationYoungest);
		description += ", felled "+this.formatYearRange(row.fellingOldest, row.fellingYoungest)+".";
		return description;
	}

	/*
	* Function: showTooltip
	* A sample's years, beside its bar, in the site's tooltip style. There is one for the whole chart,
	* moved to whichever row is hovered.
	*/
	showTooltip(row, referenceNode) {
		this.hideTooltip();
		if(this.tooltipNode == null) {
			this.tooltipNode = $("<div class='popper dendro-chart-tooltip' data-state='closed' data-side='top' role='tooltip'></div>");
			$("body").append(this.tooltipNode);
		}

		let headNode = $("<div class='dendro-chart-tooltip-head'></div>");
		headNode.append($("<span class='sqs-dot'></span>").css("background-color", row.color));
		headNode.append($("<strong></strong>").text(row.label));
		if(row.species) {
			headNode.append($("<span class='sqs-muted'></span>").text(row.species));
		}
		let fieldsNode = $("<dl class='dendro-chart-tooltip-fields'></dl>");
		fieldsNode.append("<dt>Germinated</dt>", $("<dd class='mono'></dd>").text(this.formatYearRange(row.germinationOldest, row.germinationYoungest)));
		fieldsNode.append("<dt>Felled</dt>", $("<dd class='mono'></dd>").text(this.formatYearRange(row.fellingOldest, row.fellingYoungest)));
		this.tooltipNode.empty().append(headNode, fieldsNode, $("<div class='sqs-muted dendro-chart-tooltip-hint'>Click for the sample's details</div>"));

		let floatingNode = this.tooltipNode[0];
		let updatePosition = () => {
			computePosition(referenceNode, floatingNode, {
				placement: "top",
				middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })]
			}).then(({ x, y, placement }) => {
				Object.assign(floatingNode.style, { left: x+"px", top: y+"px" });
				this.tooltipNode.attr("data-side", placement.split("-")[0]);
			});
		};
		this.tooltipNode.show();
		this.tooltipCleanup = autoUpdate(referenceNode, floatingNode, updatePosition);
		requestAnimationFrame(() => {
			if(this.tooltipCleanup) {
				this.tooltipNode.attr("data-state", "open");
			}
		});
	}

	hideTooltip() {
		if(this.tooltipCleanup) {
			this.tooltipCleanup();
			this.tooltipCleanup = null;
		}
		if(this.tooltipNode) {
			this.tooltipNode.attr("data-state", "closed").hide();
		}
	}

	showSpreadsheet() {
		let contentItemRenderer = this.siteReport.getContentItemRendererByName(this.contentItem.name);
		if(contentItemRenderer) {
			contentItemRenderer.selectRenderOption("table");
		}
	}

	getValueClassDescription(valueClassId) {
		let valueClass = (this.siteReport.siteData.lookup_tables.dendro || []).find(vc => vc.value_class_id == valueClassId);
		return valueClass ? valueClass.description : null;
	}

	/*
	* Function: showSample
	* The sample's dialog, with all of its dendro measurements first.
	*/
	showSample(row) {
		let fields = row.sampleDataObject.datasets.map(dataset => {
			let field = {
				label: dataset.key,
				help: this.getValueClassDescription(dataset.valueClassId)
			};
			if(dataset.value == "complex") {
				field.html = this.dendroLib.renderDendroDatingAsString(dataset.data, this.siteReport.siteData, true, this.sqs);
			}
			else {
				field.text = dataset.value;
			}
			return field;
		});
		this.siteReport.showSample(row.physicalSampleId, {
			sections: [{ title: "Dendrochronology", fields: fields }]
		});
	}

	unrender() {
		this.hideTooltip();
		if(this.tooltipNode) {
			this.tooltipNode.remove();
			this.tooltipNode = null;
		}
		if(this.chartNode) {
			this.chartNode.remove();
			this.chartNode = null;
		}
		this.sqs.sqsEventUnlisten("siteReportClosed", this);
	}
}

export { DendroChart as default }
