/*
* Class: InclusionSpectrum
*
* The inclusion-frequency spectrum of a site's petrographic ceramics data (Konstantara Kyprianou's thesis, figures 8b and 10).
* A row per thin-sectioned sample, with two bars of the same width, one for the fine fraction and one for the coarse
* fraction (the temper), so that the samples can be compared. A bar is a gradient from almost white to a saturated color
* on a log10 axis from 0.2 % to 100 %. Each component, e.g. silt or iron oxide, is a small label at the position of its
* Whitbread (1995) frequency label, such as "common". Components with the same position are stacked.
*
* The values are semi-quantitative visual estimates, so a component sits at its label's position and not at a measured
* percentage. The axis marks the eight labels, and the boundaries between them, which are where the "X to Y" labels sit.
*
* The values are the content item's ceramics values with a key of "Fine fraction: <Component>" or
* "Coarse fraction: <Component>", read from the subtables of the rows of its spreadsheet.
*
* Components can be picked, from the row of them above the chart or by clicking their labels in it, to highlight them in
* every sample, or to show only them. Which are picked is kept while the chart is drawn anew.
*/
class InclusionSpectrum {
	constructor(siteReport, contentItem) {
		this.siteReport = siteReport;
		this.sqs = siteReport.sqs;
		this.contentItem = contentItem;
		this.anchorNodeSelector = null;
		this.chartNode = null;
		this.resizeObserver = null;
		this.selectedComponents = new Set(); //The names of the components picked, e.g. "Sand"
		this.selectionMode = "highlight"; //"highlight" the picked components, or "only" show them

		this.axisMin = 0.2;
		this.axisMax = 100;

		//Percentages are where the label sits on the axis, for the "X to Y" labels that is the boundary between X and Y
		this.labels = [
			{ label: "very rare", position: 0.2, band: "< 0.5" },
			{ label: "very rare to rare", position: 0.5, band: "0.5" },
			{ label: "rare", position: 1.0, band: "0.5–2" },
			{ label: "rare to very few", position: 2, band: "2" },
			{ label: "very few", position: 3.2, band: "2–5" },
			{ label: "very few to few", position: 5, band: "5" },
			{ label: "few", position: 8.7, band: "5–15" },
			{ label: "few to common", position: 15, band: "15" },
			{ label: "common", position: 21.2, band: "15–30" },
			{ label: "common to frequent", position: 30, band: "30" },
			{ label: "frequent", position: 38.7, band: "30–50" },
			{ label: "frequent to dominant", position: 50, band: "50" },
			{ label: "dominant", position: 59.2, band: "50–70" },
			{ label: "dominant to predominant", position: 70, band: "70" },
			{ label: "predominant", position: 85, band: "> 70" }
		];

		this.fractions = [
			{ key: "fine", title: "Fine fraction", keyPrefix: "Fine fraction: " },
			{ key: "coarse", title: "Coarse fraction", keyPrefix: "Coarse fraction: " }
		];

		this.maxGrainSizeKey = "Tempering: Max Grain Size";
		this.temperPercentageKey = "% - Tempering";

		this.sqs.sqsEventListen("siteReportClosed", () => {
			this.unrender();
		}, this);
	}

	/*
	* Function: hasInclusionFrequencies
	* Whether any of the values is under one of the fraction lookups, i.e. whether this view applies at all.
	*/
	static hasInclusionFrequencies(values) {
		return values.some(value => /^(Fine|Coarse) fraction: /.test(value.key));
	}

	/*
	* Function: getPosition
	* Where a percentage is on the axis, as a fraction of its width, from 0 to 1.
	*/
	getPosition(percentage) {
		return Math.log10(percentage / this.axisMin) / Math.log10(this.axisMax / this.axisMin);
	}

	getLabelInfo(value) {
		let label = String(value).trim().toLowerCase();
		return this.labels.find(l => l.label == label) || null;
	}

	/*
	* Function: getSamples
	* A sample per row of the content item's data: its name, the components of each fraction placed by their label,
	* the values it has that don't have a known label, and its tempering figures.
	*/
	getSamples() {
		let samples = [];
		this.contentItem.data.rows.forEach(row => {
			let subTable = row[0].value;
			let sample = {
				physicalSampleId: row[3].value,
				name: String(row[2].value),
				fractions: { fine: [], coarse: [] },
				unplaced: [],
				maxGrainSize: null,
				temperPercentage: null
			};

			let seen = [];
			subTable.rows.forEach(subRow => {
				let key = String(subRow[1].value);
				let value = subRow[2].value;
				if(key == this.maxGrainSizeKey) {
					sample.maxGrainSize = value;
					return;
				}
				if(key == this.temperPercentageKey) {
					sample.temperPercentage = value;
					return;
				}

				this.fractions.forEach(fraction => {
					if(!key.startsWith(fraction.keyPrefix) || seen.includes(key+"="+value)) {
						return;
					}
					seen.push(key+"="+value);
					let component = key.substring(fraction.keyPrefix.length);
					let labelInfo = this.getLabelInfo(value);
					if(labelInfo == null) {
						sample.unplaced.push(fraction.title+": "+component+" ("+value+")");
						return;
					}
					sample.fractions[fraction.key].push({ component: component, labelInfo: labelInfo });
				});
			});

			samples.push(sample);
		});

		samples.sort((a, b) => a.name.localeCompare(b.name, "en-GB", { numeric: true }));
		return samples;
	}

	render(anchorNodeSelector) {
		this.anchorNodeSelector = anchorNodeSelector;
		this.renderChart();
		return this;
	}

	/*
	* Function: update
	* There are no options to change, but the chart is drawn again, since its data may have.
	*/
	update(updatedExtrasRenderOption = null) {
		let selectedRenderOption = this.contentItem.renderOptions.find(ro => ro && ro.selected);
		if(!selectedRenderOption || selectedRenderOption.type != "inclusion-frequencies") {
			return false;
		}
		this.renderChart();
		return true;
	}

	updateData(contentItem) {
		this.contentItem = contentItem;
		this.renderChart();
	}

	renderChart() {
		this.disconnectResizeObserver();
		if(this.chartNode) {
			this.chartNode.remove();
		}

		let samples = this.getSamples();
		this.chartNode = $("<div class='inclusion-spectrum'></div>");

		this.chartNode.append(this.renderComponentFilter(samples));

		let scrollNode = $("<div class='inclusion-spectrum-scroll'></div>");
		let gridNode = $("<div class='inclusion-spectrum-grid' role='table' aria-label='Inclusion frequencies per sample'></div>");

		//The header, with the axis of each panel
		gridNode.append($("<div class='inclusion-spectrum-corner' role='columnheader'></div>").text("Sample"));
		this.fractions.forEach(fraction => {
			gridNode.append(this.renderPanelHeader(fraction));
		});
		gridNode.append($("<div class='inclusion-spectrum-corner inclusion-spectrum-info-header' role='columnheader'>Tempering</div>"));

		samples.forEach(sample => {
			gridNode.append(this.renderSampleName(sample));
			this.fractions.forEach(fraction => {
				gridNode.append(this.renderBar(sample, fraction));
			});
			gridNode.append(this.renderTemperInfo(sample));
		});
		scrollNode.append(gridNode);
		this.chartNode.append(scrollNode);

		this.chartNode.append($("<p class='sqs-muted inclusion-spectrum-note'></p>").text("Semi-quantitative visual estimates (Whitbread 1995 frequency labels). Positions mark the label, not a measured percentage."));

		let unplaced = [];
		samples.forEach(sample => {
			sample.unplaced.forEach(text => unplaced.push(sample.name+", "+text));
		});
		if(unplaced.length > 0) {
			this.chartNode.append($("<p class='sqs-muted inclusion-spectrum-note'></p>").text("Not placed, as the value isn't one of the frequency labels: "+unplaced.join("; ")+"."));
		}

		$(this.anchorNodeSelector).append(this.chartNode);

		this.chartNode.on("click", ".inclusion-spectrum-marker", evt => {
			this.toggleComponent($(evt.currentTarget).attr("data-component"));
		});
		this.chartNode.on("keydown", ".inclusion-spectrum-marker", evt => {
			if(evt.key == "Enter" || evt.key == " ") {
				evt.preventDefault();
				this.toggleComponent($(evt.currentTarget).attr("data-component"));
			}
		});

		//The labels are placed by their measured size, which isn't known until the chart is visible and has its width
		this.applySelection();
		if(typeof ResizeObserver != "undefined") {
			this.resizeObserver = new ResizeObserver(() => {
				this.layoutMarkers();
			});
			this.resizeObserver.observe(this.chartNode[0]);
		}
	}

	/*
	* Function: getComponents
	* The components of the samples, each once, with the fractions it is in and the number of samples it is in, the fine
	* fraction's first and then by name.
	*/
	getComponents(samples) {
		let components = new Map();
		samples.forEach(sample => {
			let inSample = new Set();
			this.fractions.forEach(fraction => {
				sample.fractions[fraction.key].forEach(item => {
					if(!components.has(item.component)) {
						components.set(item.component, { name: item.component, fractions: [], sampleCount: 0 });
					}
					let component = components.get(item.component);
					if(!component.fractions.includes(fraction.key)) {
						component.fractions.push(fraction.key);
					}
					inSample.add(item.component);
				});
			});
			inSample.forEach(name => components.get(name).sampleCount++);
		});
		let fractionOrder = component => this.fractions.findIndex(fraction => fraction.key == component.fractions[0]);
		return Array.from(components.values()).sort((a, b) => fractionOrder(a) - fractionOrder(b) || a.name.localeCompare(b.name, "en-GB"));
	}

	/*
	* Function: renderComponentFilter
	* The components to pick from, and whether the picked ones are highlighted or the only ones shown.
	*/
	renderComponentFilter(samples) {
		let filterNode = $("<div class='inclusion-spectrum-filter' role='group' aria-label='Highlight inclusions'></div>");
		filterNode.append($("<span class='inclusion-spectrum-filter-label'></span>").text("Inclusions"));

		let chipsNode = $("<div class='inclusion-spectrum-chips'></div>");
		this.getComponents(samples).forEach(component => {
			let chipNode = $("<button type='button' class='inclusion-spectrum-chip'></button>");
			chipNode.addClass("inclusion-spectrum-"+component.fractions[0]);
			chipNode.attr("data-component", component.name);
			chipNode.attr("title", component.name+": recorded in "+component.sampleCount+" of "+samples.length+" samples");
			chipNode.append($("<span></span>").text(component.name));
			chipNode.append($("<span class='inclusion-spectrum-chip-count mono'></span>").text(component.sampleCount));
			chipNode.on("click", () => this.toggleComponent(component.name));
			chipsNode.append(chipNode);
		});
		filterNode.append(chipsNode);

		let controlsNode = $("<div class='inclusion-spectrum-filter-controls'></div>");
		let modeNode = $("<div class='inclusion-spectrum-mode' role='group' aria-label='How the picked inclusions are shown'></div>");
		[{ mode: "highlight", text: "Highlight" }, { mode: "only", text: "Show only" }].forEach(item => {
			let buttonNode = $("<button type='button' class='inclusion-spectrum-mode-btn'></button>").text(item.text).attr("data-mode", item.mode);
			buttonNode.on("click", () => {
				this.selectionMode = item.mode;
				this.applySelection();
			});
			modeNode.append(buttonNode);
		});
		controlsNode.append(modeNode);
		let clearNode = $("<button type='button' class='sqs-link-btn inclusion-spectrum-clear'>Clear</button>");
		clearNode.on("click", () => {
			this.selectedComponents.clear();
			this.applySelection();
		});
		controlsNode.append(clearNode);
		filterNode.append(controlsNode);

		filterNode.append($("<span class='sqs-muted inclusion-spectrum-filter-hint'></span>").text("Click an inclusion, here or in the chart, to highlight it in every sample."));
		return filterNode;
	}

	toggleComponent(name) {
		if(!name) {
			return;
		}
		if(this.selectedComponents.has(name)) {
			this.selectedComponents.delete(name);
		}
		else {
			this.selectedComponents.add(name);
		}
		this.applySelection();
	}

	/*
	* Function: applySelection
	* Shows which components are picked: in the row of them, and in the chart, where the others are faded or hidden. The
	* labels are then placed anew, since hidden ones take no room.
	*/
	applySelection() {
		if(!this.chartNode) {
			return;
		}
		//A component no longer in the data can't be picked
		let present = new Set($(".inclusion-spectrum-chip", this.chartNode).toArray().map(node => $(node).attr("data-component")));
		this.selectedComponents.forEach(name => {
			if(!present.has(name)) {
				this.selectedComponents.delete(name);
			}
		});

		let selecting = this.selectedComponents.size > 0;
		let only = selecting && this.selectionMode == "only";
		this.chartNode.toggleClass("has-selection", selecting);

		$(".inclusion-spectrum-chip", this.chartNode).each((i, node) => {
			let selected = this.selectedComponents.has($(node).attr("data-component"));
			$(node).toggleClass("is-selected", selected).attr("aria-pressed", selected ? "true" : "false");
		});
		$(".inclusion-spectrum-mode-btn", this.chartNode).each((i, node) => {
			let current = $(node).attr("data-mode") == this.selectionMode;
			$(node).toggleClass("is-current", current).attr("aria-pressed", current ? "true" : "false").prop("disabled", !selecting);
		});
		$(".inclusion-spectrum-clear", this.chartNode).prop("disabled", !selecting);

		$(".inclusion-spectrum-marker", this.chartNode).each((i, node) => {
			let selected = this.selectedComponents.has($(node).attr("data-component"));
			$(node).toggleClass("is-selected", selected);
			$(node).toggleClass("is-dimmed", selecting && !selected && !only);
			$(node).toggleClass("is-hidden", only && !selected);
			$(node).attr("aria-pressed", selected ? "true" : "false");
		});
		$(".inclusion-spectrum-pin", this.chartNode).each((i, node) => {
			let components = String($(node).attr("data-components")).split("|");
			let selected = components.some(name => this.selectedComponents.has(name));
			$(node).toggleClass("is-selected", selected);
			$(node).toggleClass("is-dimmed", selecting && !selected && !only);
			$(node).toggleClass("is-hidden", only && !selected);
		});
		//A fraction of a sample with none of the picked components says so, when only those are shown
		$(".inclusion-spectrum-bar", this.chartNode).each((i, node) => {
			let markers = $(".inclusion-spectrum-marker", node);
			let none = only && markers.length > 0 && markers.filter(".is-selected").length == 0;
			$(".inclusion-spectrum-filter-empty", node).toggle(none);
		});

		this.layoutMarkers();
	}

	/*
	* Function: renderPanelHeader
	* The title of a panel and its axis: the eight frequency labels, upright and reading upwards since they are many
	* and close together near the right, ticks at the boundaries between them, and the percentages.
	*/
	renderPanelHeader(fraction) {
		let headerNode = $("<div class='inclusion-spectrum-panel-header' role='columnheader'></div>");
		headerNode.addClass("inclusion-spectrum-"+fraction.key);
		headerNode.append($("<div class='inclusion-spectrum-panel-title'></div>").text(fraction.title));

		let axisNode = $("<div class='inclusion-spectrum-axis' aria-hidden='true'></div>");
		this.labels.forEach(labelInfo => {
			let left = this.getPosition(labelInfo.position) * 100+"%";
			if(labelInfo.label.includes(" to ")) {
				axisNode.append($("<span class='inclusion-spectrum-boundary'></span>").css("left", left).attr("title", labelInfo.label+": "+labelInfo.position+" %"));
			}
			else {
				axisNode.append($("<span class='inclusion-spectrum-axis-label'></span>").css("left", left).attr("title", labelInfo.label+" ("+labelInfo.band+" %)").text(labelInfo.label));
			}
		});
		[0.2, 1, 10, 100].forEach(percentage => {
			let tickNode = $("<span class='inclusion-spectrum-percentage mono'></span>").css("left", this.getPosition(percentage) * 100+"%").text(percentage == 100 ? "100 %" : percentage.toLocaleString("en-GB"));
			if(percentage == this.axisMin) {
				tickNode.addClass("is-first");
			}
			if(percentage == this.axisMax) {
				tickNode.addClass("is-last");
			}
			axisNode.append(tickNode);
		});
		headerNode.append(axisNode);
		return headerNode;
	}

	renderSampleName(sample) {
		let nameNode = $("<div class='inclusion-spectrum-sample' role='rowheader'></div>");
		let buttonNode = $("<button type='button' class='sqs-link-btn inclusion-spectrum-sample-btn'></button>").text(sample.name).attr("title", sample.name);
		buttonNode.on("click", () => {
			this.siteReport.showSample(sample.physicalSampleId);
		});
		nameNode.append(buttonNode);
		return nameNode;
	}

	/*
	* Function: renderBar
	* The gradient bar of a sample's fraction, and the label of each of its components. The labels are placed in layoutMarkers.
	*/
	renderBar(sample, fraction) {
		let barNode = $("<div class='inclusion-spectrum-bar' role='cell'></div>");
		barNode.addClass("inclusion-spectrum-"+fraction.key);

		//Where the eight labels are, to compare the samples by
		this.labels.filter(labelInfo => !labelInfo.label.includes(" to ")).forEach(labelInfo => {
			barNode.append($("<span class='inclusion-spectrum-gridline' aria-hidden='true'></span>").css("left", this.getPosition(labelInfo.position) * 100+"%"));
		});
		barNode.append("<div class='inclusion-spectrum-strip' aria-hidden='true'></div>");

		let components = sample.fractions[fraction.key];
		if(components.length == 0) {
			barNode.append($("<span class='sqs-muted inclusion-spectrum-empty'></span>").text("None recorded"));
			return barNode;
		}

		let pins = {};
		components.forEach(component => {
			let labelInfo = component.labelInfo;
			let band = labelInfo.band;
			let tooltip = component.component+": "+labelInfo.label+" (≈ "+band+" %)";

			let markerNode = $("<span class='inclusion-spectrum-marker' role='button' tabindex='0'></span>").text(component.component);
			markerNode.attr("title", tooltip+". Click to highlight it in every sample.").attr("aria-label", tooltip);
			markerNode.attr("data-component", component.component);
			markerNode.attr("data-position", this.getPosition(labelInfo.position));
			barNode.append(markerNode);

			if(typeof pins[labelInfo.label] == "undefined") {
				pins[labelInfo.label] = $("<span class='inclusion-spectrum-pin' aria-hidden='true'></span>").css("left", this.getPosition(labelInfo.position) * 100+"%");
				barNode.append(pins[labelInfo.label]);
			}
			//Which components the pin is for, so that it is shown with them
			let pinComponents = pins[labelInfo.label].attr("data-components");
			pins[labelInfo.label].attr("data-components", pinComponents ? pinComponents+"|"+component.component : component.component);
		});
		barNode.append($("<span class='sqs-muted inclusion-spectrum-empty inclusion-spectrum-filter-empty'></span>").text("None of these").hide());
		return barNode;
	}

	/*
	* Function: renderTemperInfo
	* The max grain size and the percentage of temper, which are next to the coarse bar.
	*/
	renderTemperInfo(sample) {
		let infoNode = $("<div class='inclusion-spectrum-info' role='cell'></div>");
		let figures = [];
		if(sample.maxGrainSize != null && sample.maxGrainSize !== "") {
			figures.push({ title: "Max grain size", text: sample.maxGrainSize+" mm" });
		}
		if(sample.temperPercentage != null && sample.temperPercentage !== "") {
			figures.push({ title: "Temper", text: sample.temperPercentage+" %" });
		}
		if(figures.length == 0) {
			infoNode.append($("<span class='sqs-muted'></span>").text("–"));
		}
		figures.forEach(figure => {
			let figureNode = $("<div class='inclusion-spectrum-figure'></div>");
			figureNode.append($("<span class='sqs-muted'></span>").text(figure.title+" "));
			figureNode.append($("<span class='mono'></span>").text(figure.text));
			infoNode.append(figureNode);
		});
		return infoNode;
	}

	/*
	* Function: layoutMarkers
	* Puts the component labels of each bar under its strip, centered on their position where there is room for it,
	* in as few lines as it takes for none of them to overlap.
	*/
	layoutMarkers() {
		if(!this.chartNode) {
			return;
		}

		let gap = 4;
		let stripHeight = 12;
		let lineHeight = 20;
		$(".inclusion-spectrum-bar", this.chartNode).each((i, barElement) => {
			let barNode = $(barElement);
			let width = barElement.clientWidth;
			let markerNodes = $(".inclusion-spectrum-marker", barNode).not(".is-hidden").toArray();
			if(width == 0) {
				return;
			}
			if(markerNodes.length == 0) {
				barNode.css("height", "");
				return;
			}

			let markers = markerNodes.map(node => ({
				node: node,
				center: parseFloat($(node).attr("data-position")) * width,
				width: node.offsetWidth
			}));
			markers.forEach(marker => {
				marker.left = Math.min(Math.max(marker.center - marker.width / 2, 0), Math.max(width - marker.width, 0));
			});
			markers.sort((a, b) => a.center - b.center || a.node.textContent.localeCompare(b.node.textContent));

			let lineEnds = [];
			markers.forEach(marker => {
				let line = lineEnds.findIndex(end => end + gap <= marker.left);
				if(line == -1) {
					line = lineEnds.length;
					lineEnds.push(0);
				}
				lineEnds[line] = marker.left + marker.width;
				$(marker.node).css({
					left: marker.left+"px",
					top: (stripHeight + gap + line * lineHeight)+"px"
				});
			});
			barNode.css("height", (stripHeight + gap + lineEnds.length * lineHeight + gap)+"px");
		});
	}

	disconnectResizeObserver() {
		if(this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	unrender() {
		this.disconnectResizeObserver();
		if(this.chartNode) {
			this.chartNode.remove();
			this.chartNode = null;
		}
		this.sqs.sqsEventUnlisten("siteReportClosed", this);
	}
}

export { InclusionSpectrum as default }
