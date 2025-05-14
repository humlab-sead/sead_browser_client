import Facet from './Facet.class.js';
import noUiSlider from "nouislider";
import "nouislider/dist/nouislider.min.css";

import styles from '../stylesheets/style.scss'
import { Chart, CategoryScale, LinearScale, BarController, BarElement } from "chart.js";
/*
Works like this:

When a new selection is made, new data is fetched from the server with the "picks" specified.
This new dataset contains the proper resolution, which we might degrade further client-side.
Max number of categories determines this.
Categories are always kept separate from the source/server data in the internal structures.
Categories should be seen purely as a render thing, not as a dataset you use to work with internally, it's just for display.

Old request data should be discarded (if a new selection was made while data was being fetched)

Data is loaded into "unfiltered" if it was requested without picks - which will give us the entire dataspan, but at low resolution, most importantly it tells us the endpoints
Data is loaded into "filtered" if it was requested with picks. This gives up the higher resolution data we need for a more zoomed in / narrow view of the data

*/



/*
* Class: RangeFacet
* Subclass of Facet. Renders data as a graph with a max/min slider.
*/
class RangeFacet extends Facet {
	/*
	* Function: constructor
	*/
	constructor(sqs, id = null, template = {}) {
		super(sqs, id, template);
		
		this.totalUpper = null; //Lowest possible value of this filter, without filters applied
		this.totalLower = null; //Highest possible value of this fulter, without filters applied
		this.datasets = {
			unfiltered: [],
			filtered: []
		};
		this.selections = [];
		this.chart = null;
		this.slider = null;
		this.minDataValue = null;
		this.maxDataValue = null;

		this.verboseLogging = false;
		
		if(template.name == "analysis_entity_ages") {
			this.unit = "BP";
		}
		
		//this.numberOfCategories = 50; //Number of categories (bars) we want to abstract dataset
		$(".facet-text-search-btn", this.getDomRef()).hide(); //range facets do not have text searching...

		Chart.register(CategoryScale);
		Chart.register(LinearScale);
		Chart.register(BarController);
		Chart.register(BarElement);
	}

	/*
	* Function: setSelections
	* 
	* Parameters:
	* selections - An array containing exactly 2 values, min & max, where min has index 0 and max index 1
	*/
	setSelections(selections) {
		if(this.verboseLogging) {
			console.log("RangeFacet.setSelections", selections);
		}

		let selectionsUpdated = false;
		if(selections.length == 2) {
			if(selections[0] != null && selections[0] != this.selections[0]) {
				this.selections[0] = parseFloat(selections[0]);
				selectionsUpdated = true;
			}
			if(selections[1] != null && selections[1] != this.selections[1]) {
				this.selections[1] = parseFloat(selections[1]);
				selectionsUpdated = true;
			}
		}
		
		$(".slider-manual-input-container[endpoint='upper'] > input", this.getDomRef()).val(this.selections[1]);
		$(".slider-manual-input-container[endpoint='lower'] > input", this.getDomRef()).val(this.selections[0]);
		
		if(selectionsUpdated) {
			this.sqs.facetManager.queueFacetDataFetch(this);
			this.broadcastSelection();
		}
	}


	/*
	* Function: importData
	*
	* Imports the data package fetched from the server by converting it to the internal data structure format and storing it in the instance.
	*
	* Parameters:
	* data - The data package from the server.
	*
	* Returns:
	* The imported/converted data structure.
	*/
	importData(importData, overwrite = true) {
		super.importData(importData);

		if(this.verboseLogging) {
			console.log("RangeFacet.importData", importData);
		}

		this.totalLower = importData.IntervalInfo.FullExtent.DataLow;
		this.totalUpper = importData.IntervalInfo.FullExtent.DataHigh;

		let filteredData = false;
		for(let k in importData.Picks) {
			if(importData.Picks[k].FacetCode == this.name) {
				//This is a dataset narrowed by a selection, so import it into the filtered section of the dataset
				filteredData = true;
			}
		}

		let targetSection = null;
		if(filteredData) {
			this.datasets.filtered = [];
			targetSection = this.datasets.filtered;
		}
		else {
			this.datasets.unfiltered = [];
			targetSection = this.datasets.unfiltered;
		}

		//Create internal format
		let bins = importData.Items;
		for(let itemKey in bins) {
			targetSection.push({
				//Value spans:
				min: bins[itemKey].Extent[0], //Greater Than - except for the first item which should be >=
				max: bins[itemKey].Extent[1], //Lesser Than - except for the last item which should be <=
				value: bins[itemKey].Count //value/count for this category/span
			});
		}
	}
	
	reduceResolutionOfDataset(dataset, selections = [], resolution = 100) {
		if(this.verboseLogging) {
			console.log("RangeFacet.reduceResolutionOfDataset", dataset);
		}

		if(dataset.length <= this.numberOfCategories) { //Nothing to do, we can't upscale data resolution, only downscale
			return dataset;
		}

		//Get highest/lowest data values
		let totalMin = null; //Starting value for the categories
		let totalMax = null; //Ending value for the categories
		if(selections.length == 2) {
			totalMin = selections[0];
			totalMax = selections[1];
		}
		else {
			let endpoints = this.getDataEndpoints();
			totalMin = endpoints.min;
			totalMax = endpoints.max;
		}

		//Make bins
		let fullSpan = totalMax - totalMin;
		let binSize = fullSpan / resolution;

		let binMin = totalMin; //First bin
		let binMax = binMin + binSize; //First bin

		let bins = [];
		for(let i = 0; i < resolution; i++) {
			bins.push({
				min: binMin,
				max: binMax,
				sites: []
			});

			binMin += binSize;
			binMax += binSize;
		}

		
		//We don't like to have floats as bin limits
		bins.map((bin) => {
			bin.max = Math.round(bin.max);
			bin.min = Math.round(bin.min);
		});

		//Do the actual binning of sites
		for(let bk in bins) {
			let bin = bins[bk];
			for(let dk in dataset) {
				let point = dataset[dk];
				if(this.rangeSpanOverlap(point, bin)) {
					bin.sites.push(point);
				}
			}
		}

		//Calculate avg value in each bin
		for(let bk in bins) {
			let binTotal = 0;
			bins[bk].sites.map((site) => {
				binTotal += site.value;
			});
			bins[bk].value = Math.round((binTotal / bins[bk].sites.length) * 10) / 10;
		}

		return bins;
	}

	rangeSpanOverlap(point, reference) {
		if(this.verboseLogging) {
			console.log("RangeFacet.rangeSpanOverlap", point, reference);
		}

		let binEclipse = point.min >= reference.min && point.max <= reference.max; //Overlap through being eclipsed by bin
		if(binEclipse) {
			return true;
		}
		return false;
	}

	/*
	* Function: makeCategories
	*
	* Reduce dataset to number of categories/bars we want. Note that this function will create categories which are somewhat "fuzzy" since the dataset from the server will lack som granularity.
	*/
	makeCategories(data, selections = []) {
		if(this.verboseLogging) {
			console.log("RangeFacet.makeCategories", data);
		}

		//Get highest/lowest data values
		let min = null; //Starting value for the categories
		let max = null; //Ending value for the categories
		if(selections.length == 2) {
			min = selections[0];
			max = selections[1];
		}
		else {
			let endpoints = this.getDataEndpoints();
			min = endpoints.min;
			max = endpoints.max;
		}

		let categorySize = ((min - max)*-1) / this.numberOfCategories;

		this.categories = [];
		for(let i = 0; i < this.numberOfCategories; i++) {
			this.categories.push({
				gt: min + i * categorySize,
				lt: min + (i+1) * categorySize,
				value: 0
			});
		}

		//Add values to categories
		for(let catKey in this.categories) {
			for(let key in data) {
				if(data[key].lt <= this.categories[catKey].lt && data[key].gt >= this.categories[catKey].gt) {
					this.categories[catKey].value += data[key].value;
				}
			}
		}
		
		return this.categories;
	}

	/*
	* Function: getSelections
	*
	* Returns:
	* The facets selections in a facet-specific format.
	*
	*/
	getSelections() {
		return this.selections;
	}
	
	/*
	* Function: hasSelection
	*
	* Determines whether this facet has any selections or not.
	*
	*/
	hasSelection() {
		if(this.selections.length < 2) {
			return false;
		}
		if(typeof(this.selections[0]) == "undefined" || typeof(this.selections[1]) == "undefined") {
			return false;
		}
		if(this.selections[0] != this.minDataValue || this.selections[1] != this.maxDataValue) {
			return true;
		}
		return false;
	}
	
	/*
	* Function: renderData
	*
	* Renders the chart and the slider. Basically all the content in the facet.
	*/
	renderData(selections = []) {
		if(this.verboseLogging) {
			console.log("RangeFacet.renderData", selections);
		}

		if(!this.enabled) {
			//Don't render if this facet is currently disabled
			return;
		}
		
		if(selections.length == 0) {
			selections = this.getSelections();
		}

		if(this.hasSelection()) {
			this.data = this.sqs.copyObject(this.datasets.filtered);
		}
		else {
			this.data = this.sqs.copyObject(this.datasets.unfiltered);
		}
		
		let categories = this.data;
		/*
		console.log(this.data);
		let categories = this.reduceResolutionOfDataset(this.data, selections);
		console.log(categories)
		*/

		$(".facet-body > .chart-container", this.getDomRef()).show();
		if(this.chart == null) {
			this.renderChart(categories, selections);
		}
		else {
			this.updateChart(categories, selections);
		}

		if(this.slider == null) {
			this.renderSlider(categories, selections);
		}
		else {
			//this.updateSlider(categories, selections);
		}
	}

	/*
	* Function: unRenderData
	* Virtual. Every subclass needs to implement this.
	*/
	unRenderData() {
		if(this.verboseLogging) {
			console.log("RangeFacet.unRenderData");
		}

		if(this.chart != null) {
			console.log(this.chart);
			this.chart.destroy();
		}
		if(this.slider != null) {
			console.log(this.slider);
			this.slider.destroy();
		}
		$(".facet-body > .chart-container", this.getDomRef()).hide();
	}

	/*
	 * Function: renderChart
	 *
	 * Renders the chart and only the chart-part of the range facet. Will render whatever is currently in this.data (within selections).
	 */
	renderChart(categories, selections) {
		if(this.verboseLogging) {
			console.log("RangeFacet.renderChart", categories);
		}

		var chartContainerNode = $(".chart-canvas-container", this.getDomRef());
		$(".range-chart-canvas", chartContainerNode).remove();
		chartContainerNode.append($("<canvas></canvas>").attr("id", "facet_"+this.id+"_canvas").addClass("range-chart-canvas"));

		//this.chartJSDatasets = this.getChartDataWithinLimits();

		let chartJSDatasets = this.makeChartJsDataset(categories);

		this.chartJSOptions = {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					display: false
				}
			},
			layout: {
				padding: {
					left: 0,
					right: 0,
					top: 0,
					bottom: 10
				}
			},
			tooltips: {
				displayColors: false
			},
			animation: {
				duration: 0
			},
			scales: {
				x: {
					ticks: {
						display: false  // This will hide the x-axis labels
					}
				}
			}
		};

		var ctx = $("#facet_"+this.id+"_canvas")[0].getContext("2d");
		this.chart = new Chart(ctx, {
			type: "bar",
			data: JSON.parse(JSON.stringify(chartJSDatasets)), //need a copy here - not a reference
			options: this.chartJSOptions
		});
	}

	formatWithSpaces(number) {
		return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
	}

	/*
	 * Function: renderSlider
	 *
	 * Renders the slider and only the slider-part of the range facet.
	 */
	renderSlider(categories, selections) {
		if(this.verboseLogging) {
			console.log("RangeFacet.renderSlider", categories);
		}

		let sliderMin = this.totalLower;
		let sliderMax = this.totalUpper;

		this.sliderMin = sliderMin;
		this.sliderMax = sliderMax;

		let startDefault = this.getSelections();
		if(startDefault.length < 2) {
			startDefault = [sliderMin, sliderMax];
		}
		
		// Access the template element
		const template = document.getElementById("facet-template");
		
		const chartContainer = $(".chart-container", this.getDomRef());
		chartContainer.show();
		const sliderContainer = $(".rangeslider-container", this.getDomRef())[0];

		this.slider = noUiSlider.create(sliderContainer, {
			start: [this.sliderMin, this.sliderMax],
			range: {
				'min': this.sliderMin,
				'max': this.sliderMax
			},
			step: 1,
			connect: true
		});


		$(".slider-manual-input-container", this.getDomRef()).remove();

        var upperManualInputNode;
        var lowerManualInputNode;
        if (template && template.content) {
            var upperManualInputContainer = template.content.querySelector(".slider-manual-input-container[endpoint='upper']");
            var lowerManualInputContainer = template.content.querySelector(".slider-manual-input-container[endpoint='lower']");

            upperManualInputNode = upperManualInputContainer ? upperManualInputContainer.cloneNode(true) : null;
            lowerManualInputNode = lowerManualInputContainer ? lowerManualInputContainer.cloneNode(true) : null;

            // Now use upperManualInputNode and lowerManualInputNode
        } else {
            console.error("Facet template not found or its content is empty.");
        }


		$("input", upperManualInputNode).val(this.sliderMax);
        $("input", lowerManualInputNode).val(this.sliderMin);

        $(".noUi-handle-upper", this.getDomRef()).prepend(upperManualInputNode);
        $(".noUi-handle-lower", this.getDomRef()).prepend(lowerManualInputNode);

        $(".slider-manual-input-container", this.getDomRef()).show();

        this.upperManualInputNode = $(".noUi-handle-upper .slider-manual-input-container .range-facet-manual-input", this.getDomRef());
        this.lowerManualInputNode = $(".noUi-handle-lower .slider-manual-input-container .range-facet-manual-input", this.getDomRef());

		$(".range-unit-box", this.getDomRef()).hide();
		$(".slider-manual-input-container > input").css("border-right-width", "1px");
		
		//Lots of adjustments for setting the right size and position of the digit input boxes depending on how big they need to be
		/*
		let digits = sliderMax.toString().length > sliderMin.toString().length ? sliderMax.toString().length : sliderMin.toString().length;
		var digitSpace = digits*5;
		$(".slider-manual-input-container", this.domObj).css("width", 20 + digitSpace);
		$(".range-facet-manual-input", this.domObj).css("width", 18 + digitSpace);
		
		$(".noUi-handle-lower > .slider-manual-input-container", this.getDomRef()).css("left", Math.round(-7-digitSpace)+"px");
		$(".noUi-handle-upper > .slider-manual-input-container", this.getDomRef()).css("left", Math.round(13)+"px");
		*/
		let digits = sliderMax.toString().length > sliderMin.toString().length ? sliderMax.toString().length : sliderMin.toString().length;
		var digitSpace = 30 + digits * 5;
		$(".slider-manual-input-container .range-facet-manual-input", this.domObj).css("width", digitSpace);



		$(".slider-manual-input-container", this.getDomRef()).show();

		this.upperManualInputNode = $(".noUi-handle-upper .slider-manual-input-container .range-facet-manual-input", this.getDomRef());
		this.lowerManualInputNode = $(".noUi-handle-lower .slider-manual-input-container .range-facet-manual-input", this.getDomRef());

		//$(".slider-manual-input-container[endpoint='upper'] .range-unit-box", this.getDomRef()).hide();
		//$(".slider-manual-input-container[endpoint='lower'] .range-unit-box", this.getDomRef()).hide();
		

		$(".slider-manual-input-container", this.getDomRef()).on("change", (evt) => {
			console.log("Slider manual input change");
			this.manualInputCallback(evt);
		});
		
		this.slider.off("update");
		this.slider.on("update", (values, slider) => {
			
			
			let highValue = parseFloat(values[0]);
			let lowValue = parseFloat(values[1]);
			console.log("Slider update", values);

			$(".noUi-handle-lower .range-facet-manual-input", this.getDomRef()).val(highValue);
			$(".noUi-handle-upper .range-facet-manual-input", this.getDomRef()).val(lowValue);

			//let overlap = this.getHorizontalOverlap(this.lowerManualInputNode[0], this.upperManualInputNode[0]);
			//this.adjustSliderInputPositions(overlap, this.lowerManualInputNode, this.upperManualInputNode);
		});
		this.slider.on("change", (values, slider) => {
			console.group("Slider change");
			//this.sliderMovedCallback(values, slider);
			this.sliderUpdateCallback(values);
		});
	}

	sliderUpdateCallback(values, moveSlider = false) {
		if(this.verboseLogging) {
			console.log("RangeFacet.sliderUpdateCallback", values);
		}


		values[0] = parseInt(values[0], 10);
		values[1] = parseInt(values[1], 10);

		//avoid year zero since it doesn't exist
		if(values[0] == 0) {
			values[0] = -1;
		}
		if(values[1] == 0) {
			values[1] = 1;
		}

		//if current values are not within the slider range, set them to the slider range
		if(values[0] < this.sliderMin) {
			console.log("Lower value ("+values[0]+") is below slider min, setting to min");
			values[0] = this.sliderMin;
		}
		if(values[1] > this.sliderMax) {
			console.log("Upper value ("+values[1]+") is above slider max, setting to max");
			values[1] = this.sliderMax;
		}

		//values[0] = this.sliderMin;
		//values[1] = this.sliderMax;
		
		//console.log("Slider values:", values);
		this.currentValues = values;
		$(this.lowerManualInputNode).val(this.formatValueForDisplay(this.currentValues[0], this.selectedDatingSystem));
		$(this.upperManualInputNode).val(this.formatValueForDisplay(this.currentValues[1], this.selectedDatingSystem));

		if (this.selectedDatingSystem === "AD/BC") {
			let lowerSuffix = this.currentValues[0] > 0 ? "AD" : "BC";
			let upperSuffix = this.currentValues[1] > 0 ? "AD" : "BC";
			$(".slider-manual-input-container[endpoint='lower'] .range-unit-box", this.getDomRef()).html(lowerSuffix);
			$(".slider-manual-input-container[endpoint='upper'] .range-unit-box", this.getDomRef()).html(upperSuffix);
		}

		if (this.selectedDatingSystem === "BP") {
			$(".slider-manual-input-container[endpoint='lower'] .range-unit-box", this.getDomRef()).html("BP");
			$(".slider-manual-input-container[endpoint='upper'] .range-unit-box", this.getDomRef()).html("BP");
		}
		

		/* there's some performance degredation to running this code, so it's commented out for now
		let lowerInput = $(".slider-manual-input-container[endpoint='lower']", this.getDomRef())
		let upperInput = $(".slider-manual-input-container[endpoint='upper']", this.getDomRef())

		if(lowerInput[0] && upperInput[0]) {
			console.log(lowerInput, upperInput);

			//detect horizontal overlap between the inputs
			let lowerInputRect = lowerInput[0].getBoundingClientRect();
			let upperInputRect = upperInput[0].getBoundingClientRect();

			if(lowerInputRect.right > upperInputRect.left) {
				//there is overlap, move the lower input to the left
				let overlap = lowerInputRect.right - upperInputRect.left;
				let left = lowerInputRect.left - overlap;
				lowerInput.css("background", "red");
			}
			else {
				lowerInput.css("background", "blue");
			}
		}
		*/
		

		if(this.useCurtains) {
			this.adjustCurtains(values);
		}

		if(moveSlider) {
			console.log("Moving slider to", values);
			this.slider.set(values);
		}

		this.sliderMovedCallback(values);
	}

	formatValueForDisplay(value, datingSystem, prettyPrint = true) {
		if (datingSystem === "BP") {
			value = Math.abs(value); // Ensure positive for formatting
			if (prettyPrint) {
				if (value >= 1_000_000) {
					return (value / 1_000_000).toFixed(1) + "m"; // Format as millions
				} else if (value >= 1_000) {
					return (value / 1_000).toFixed(1) + "k"; // Format as thousands
				}
			}
			return value; // Return raw value if prettyPrint is false
		}

		if (datingSystem === "AD/BC") {
			if (value < 0) {
				return Math.abs(value) + " BC";
			}
			return value + " AD";
		}
		
		return value;
	}

	adjustSliderInputPositions(overlap, lowerManualInputNode, upperManualInputNode) {
		if(this.verboseLogging) {
			console.log("RangeFacet.adjustSliderInputPositions", overlap);
		}

		const lowerLeftOriginalPosition = (lowerManualInputNode.width() + 8) / 2;
		const upperLeftOriginalPosition = ((upperManualInputNode.width() + 8) / 2)*-1;
	
		let lowerInputLeft = lowerManualInputNode.position().left; // Current `left` position of lower node
		let upperInputLeft = upperManualInputNode.position().left; // Current `left` position of upper node

		let lowerInputNewLeft = lowerInputLeft; // Initialize to current positions
		let upperInputNewLeft = upperInputLeft;
	
		if (overlap > 0) {
			// Adjust positions to remove overlap
			const shiftAmount = overlap / 2; // Split the overlap equally between the two nodes
			lowerInputNewLeft = lowerInputLeft - shiftAmount; // Move lower node left
			upperInputNewLeft = upperInputLeft + shiftAmount; // Move upper node right
			
		} else {
			// No overlap, gradually reset to original positions
			lowerInputNewLeft = lowerInputLeft < lowerLeftOriginalPosition ? lowerInputLeft + 1 : lowerLeftOriginalPosition;
			upperInputNewLeft = upperInputLeft > upperLeftOriginalPosition ? upperInputLeft - 1 : upperLeftOriginalPosition;
		}
	
		// Update positions with calculated values
		lowerManualInputNode[0].style.setProperty("left", `${lowerInputNewLeft}px`, "important");
		upperManualInputNode[0].style.setProperty("left", `${upperInputNewLeft}px`, "important");
	}

	getHorizontalOverlap(element1, element2) {
		const rect1 = element1.getBoundingClientRect();
		const rect2 = element2.getBoundingClientRect();
	
		// Check if they overlap horizontally
		const overlap = Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left);
	
		// Return overlap amount if they overlap, otherwise return 0
		return overlap > 0 ? overlap : 0;
	}
	
	
	updateChart(categories, selections) {
		if(this.verboseLogging) {
			console.log("RangeFacet.updateChart", categories);
		}
		
		let chartJSDatasets = this.makeChartJsDataset(categories);
		this.chart.data.datasets = chartJSDatasets.datasets;
		this.chart.data.labels = chartJSDatasets.labels;
		this.chart.update();
	}
	
	updateSlider(categories, selections) {
		if(this.verboseLogging) {
			console.log("RangeFacet.updateSlider", categories);
		}

		this.slider.updateOptions({
				start: selections,
			},
			true
		);
	}

	getDataEndpoints() {
		return {
			max: this.totalUpper,
			min: this.totalLower
		}
	}
	
	manualInputCallback(evt) {
		if(this.verboseLogging) {
			console.log("RangeFacet.manualInputCallback", evt);
		}

		var newValues = {
			upper: null,
			lower: null
		};
		
		var endpointMoved = "";
		
		console.log(evt);
		console.log($("input", evt.currentTarget).val());

		if($(evt.currentTarget).attr("endpoint") == "upper") {
			endpointMoved = "upper";
			newValues.upper = $("input", evt.currentTarget).val();
			newValues.lower = $(".slider-manual-input-container[endpoint='lower'] > input", this.getDomRef()).val();
			newValues.upper = parseFloat(newValues.upper);
			newValues.lower = parseFloat(newValues.lower);
		}
		if($(evt.currentTarget).attr("endpoint") == "lower") {
			endpointMoved = "lower";
			newValues.lower = $("input", evt.currentTarget).val();
			newValues.upper = $(".slider-manual-input-container[endpoint='upper'] > input", this.getDomRef()).val();
			newValues.upper = parseFloat(newValues.upper);
			newValues.lower = parseFloat(newValues.lower);
		}

		console.log(newValues);
		
		let dataEndPoints = this.getDataEndpoints();

		if(newValues.upper > dataEndPoints.max) {
			console.log("Forcing upper selection to "+dataEndPoints.max+" since that is the data endpoint");
			newValues.upper = dataEndPoints.max;
		}
		if(newValues.lower < dataEndPoints.min) {
			console.log("Forcing lower selection to "+dataEndPoints.min+" since that is the data endpoint");
			newValues.lower = dataEndPoints.min;
		}

		this.setSelections([newValues.lower, newValues.upper]);
		let categories = this.makeCategories(this.data, this.getSelections());
		this.updateChart(categories, this.getSelections());
		this.updateSlider(categories, this.getSelections());
	}
	
	/*
	* Function: sliderMovedCallback
	*
	*/
	sliderMovedCallback(values, whichSlider = null) {
		if(this.verboseLogging) {
			console.log("RangeFacet.sliderMovedCallback", values);
		}

		let highValue = parseFloat(values[0]);
		let lowValue = parseFloat(values[1]);

		this.setSelections([highValue, lowValue]);

		$(".noUi-handle-lower .range-facet-manual-input", this.getDomRef()).val(this.getSelections()[0]);
		$(".noUi-handle-upper .range-facet-manual-input", this.getDomRef()).val(this.getSelections()[1]);

		let categories = this.data;
		//let categories = this.reduceResolutionOfDataset(this.data, this.getSelections());
		this.updateChart(categories, this.getSelections());
	}

	/*
	* Function: renderNoDataMsg
	*/
	renderNoDataMsg(on = true) {
		super.renderNoDataMsg(on);
		if(on) {
			$(this.getDomRef()).find(".chart-container").hide();
		}
		else {
			$(this.getDomRef()).find(".chart-container").show();
		}
	}
	
	/*
	 * Function: makeChartJsDataset
	 *
	 * Translates current dataset (in this.data) to the ChartJS format and returns it.
	 */
	makeChartJsDataset(categories) {
		if(this.verboseLogging) {
			console.log("RangeFacet.makeChartJsDataset", categories);
		}

		var dataset = [];
		var labels = [];

		let dataSet = []; //chartJS dataset structure

		for(let catKey in categories) {
			dataset.push(categories[catKey].value);
		}

		for(let catKey in categories) {

			let labelLow = categories[catKey].min;
			let labelHigh = categories[catKey].max;
			/*
			if(categories[catKey].min % 1000 == 0) {
				labelLow = categories[catKey].min / 1000+"k";
			}
			if(categories[catKey].max % 1000 == 0) {
				labelHigh = categories[catKey].max / 1000+"k";
			}
			*/
			
			if(Config.rangeFilterFuzzyLabels) {
				labelLow = Math.round(labelLow);
				labelHigh = Math.round(labelHigh);
			}
			
			labels.push(labelLow+" - "+labelHigh);
		}

		let chartJsObject = {
			labels: labels,
			datasets: [{
				data: dataset,
				backgroundColor: styles.baseColor,
				borderColor: styles.color3
			}]
		};

		return chartJsObject;
	}
	
	/*
	* Function: minimize
	*/
	minimize() {
		super.minimize();
		
		$(".rangeslider-container-wrapper", this.getDomRef()).css("margin-top", "5px").css("margin-bottom", "5px");
		$(".chart-canvas-container", this.getDomRef()).hide();
		$(this.getDomRef()).css("height", "60px");
		$(".facet-body", this.getDomRef()).css("height", "100%").show();
		
		var slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
		this.sqs.facetManager.updateSlotSize(slotId);
		this.sqs.facetManager.updateAllFacetPositions();
	}
	
	/*
	* Function: maximize
	*/
	maximize() {
		super.maximize();
		
		$(".rangeslider-container-wrapper", this.getDomRef()).css("margin-top", "0px").css("margin-bottom", "0px");
		$(".chart-canvas-container", this.getDomRef()).show();
		
		var slotId = this.sqs.facetManager.getSlotIdByFacetId(this.id);
		this.sqs.facetManager.updateSlotSize(slotId);
		this.sqs.facetManager.updateAllFacetPositions();


		if(this.hasSelection()) {
			this.data = this.sqs.copyObject(this.datasets.filtered);
		}
		else {
			this.data = this.sqs.copyObject(this.datasets.unfiltered);
		}
		
		let categories = this.data;
		//let categories = this.reduceResolutionOfDataset(this.data, this.getSelections());

		this.renderChart(categories, this.getSelections());
	}

	showLoadingIndicator(on = true, error = false) {
		super.showLoadingIndicator(on, error);
		if(on) {
			$(".chart-container", this.domObj).css("opacity", 0.5);
			//$(".chart-canvas-container", this.domObj).css("filter", "blur(2px)");
		}
		else {
			$(".chart-container", this.domObj).css("opacity", 1.0);
			//$(".chart-canvas-container", this.domObj).css("filter", "none");
		}
	}
}

export { RangeFacet as default }