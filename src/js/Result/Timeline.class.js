import noUiSlider from "nouislider";
import "nouislider/distribute/nouislider.min.css";
import Color from "../color.class";
import css from '../../stylesheets/style.scss';
import { maxHeaderSize } from "http";

class Timeline {
	constructor(mapObject) {
		this.map = mapObject;
		this.chart = null;
		this.sliderElement = null;
		this.sliderAnchorNode = null;
		this.categoryCount = 100;
		this.selection = [];
		//Set up resize event handlers
		/*
		this.map.resultManager.hqs.hqsEventListen("layoutResize", () => this.resizeCallback());
		$(window).on("resize", () => this.resizeCallback());
		*/
	}

	resizeCallback() {
		//Re-render everything on resize evt - which may not be very efficient, but it ensures proper adjusting to new size
		this.unrender();
		this.render();
	}

	makeAnchorNodes() {
		$(this.map.renderTimelineIntoNode).html("");
		$(this.map.renderTimelineIntoNode).append("<div class='timeline-chart-container'></div>");
		$(this.map.renderTimelineIntoNode).append("<div class='timeline-slider-container'></div>");
		//$(this.map.renderTimelineIntoNode).append("<div class='timeline-slider-container'></div>");
	}

	render() {
		//Loading the temperature data, which is actually not temperature but instead it's isotope data acting as a proxy for temperature
		$.ajax("http://seadserv.humlab.umu.se:8080/temperatures?order=years_bp.desc", {
			method: "get",
			success: (data) => {
				this.temperatureData = [];
				for(let k in data) {
					this.temperatureData.push({
						year: data[k].years_bp * -1,
						temp: data[k].d180_gisp2
					});
				}
				this.renderData();
			}
		});
	}

	copyData(data) {
		return JSON.parse(JSON.stringify(data));
	}

	renderData() {
		let data = this.map.data;
		this.setSelection(this.getEarliestDataPoint(data).time.min, this.getLatestDataPoint(data).time.max);
		this.makeAnchorNodes();
		this.renderChart(data);
		this.renderSlider(data);
	}

	getEarliestDataPoint(data) {
		let selected = null;
		for(let key in data) {
			if(selected == null || data[key].time.min < selected.time.min) {
				selected = data[key];
			}
		}
		return selected;
	}
	getLatestDataPoint(data) {
		let selected = null;
		for(let key in data) {
			if(selected == null || data[key].time.max > selected.time.max) {
				selected = data[key];
			}
		}
		return selected;
	}

	/*
	* Function: renderSLider
	* 
	* 
	*
	*/
	renderSlider(data) {
		let earliest = this.getEarliestDataPoint(data);
		let latest = this.getLatestDataPoint(data);
		//$(".timeline-slider-container", this.map.renderTimelineIntoNode).css("background-color", "blue");
		let sliderAnchorNodeContainer = $(".timeline-slider-container", this.map.renderTimelineIntoNode);
		sliderAnchorNodeContainer.append("<div class='timeline-slider-container-inner'></div>");
		this.sliderAnchorNode = $(".timeline-slider-container-inner", this.map.renderTimelineIntoNode)[0];

		$(sliderAnchorNodeContainer).append("<div class='timeline-label'>Time</div>");

		let sliderMin = earliest.time.min;
		let sliderMax = latest.time.max;
		this.sliderElement = noUiSlider.create(this.sliderAnchorNode, {
			start: [sliderMin, sliderMax],
			range: {
				'min': sliderMin,
				'max': sliderMax
			},
			//margin: this.categorySpan,
			//step: this.categorySpan,
			connect: true
		});


		//From this point onwards there's a lot of code overlap with the rangefacets, this should probably be made to follow DRY better
		var upperManualInputNode = $("#facet-template .slider-manual-input-container[endpoint='upper']")[0].cloneNode(true);
		var lowerManualInputNode = $("#facet-template .slider-manual-input-container[endpoint='lower']")[0].cloneNode(true);

		$("input", upperManualInputNode).val(sliderMax);
		$("input", lowerManualInputNode).val(sliderMin);

		$(".noUi-handle-upper", this.sliderAnchorNode).append(upperManualInputNode);
		$(".noUi-handle-lower", this.sliderAnchorNode).append(lowerManualInputNode);


		let digitSpace = this.getTimelineMarginSize(data);
		$(this.sliderAnchorNode).css("width", "calc(100% - "+((digitSpace*3) + 30)+"px)");
		$(".slider-manual-input-container", this.sliderAnchorNode).css("width", 22 + digitSpace);
		$(".range-facet-manual-input", this.sliderAnchorNode).css("width", 18 + digitSpace);
		$(".rangeslider-container", this.sliderAnchorNode).css("margin-left", 18 + digitSpace);
		$(".rangeslider-container", this.sliderAnchorNode).css("margin-right", 18 + digitSpace);
		$(".noUi-handle-lower > .slider-manual-input-container", this.sliderAnchorNode).css("left", Math.round(digitSpace*-1-5)+"px");
		$(".slider-manual-input-container", this.sliderAnchorNode).show();
		
		this.sliderElement.on("update", (values, slider) => {
			values[0] = Math.round(parseInt(values[0]));
			values[1] = Math.round(parseInt(values[1]));
			this.setSelection(values[0], values[1]);
			this.setManualInputBoxesValues(values);
			this.updateChart(data);
		});

		this.sliderElement.on("change", (values, slider) => {
			//When slider drag stops, redraw map with selection
			let layers = this.map.getVisibleDataLayers();
			layers.map((layer) => {
				this.map.renderDataLayer(layer.getProperties().layerId);
			});
		});
	}

	setSelection(min, max) {
		this.selection = [min, max];
	}

	getSelection() {
		return this.selection;
	}

	updateChart(data) {
		//console.log("Update chart");
		
		let chartJSDatasets = this.getChartDataSets(data, this.getSelection());
		this.chart.data = chartJSDatasets;

		this.chart.update();
	}

	getTimelineMarginSize(data) {
		let earliest = this.getEarliestDataPoint(data);
		let latest = this.getLatestDataPoint(data);
		let sliderMin = earliest.time.min;
		let sliderMax = latest.time.max;
		
		let digits = sliderMax.toString().length > sliderMin.toString().length ? sliderMax.toString().length : sliderMin.toString().length;
		let digitSpace = digits*5;
		return digitSpace;
	}

	setManualInputBoxesValues(values) {
		$(".timeline-slider-container .slider-manual-input-container[endpoint=lower] > input").val(values[0]);
		$(".timeline-slider-container .slider-manual-input-container[endpoint=upper] > input").val(values[1]);
	}

	/*
	* Function: makeFakeTimeData
	* 
	* Makes fake/example time data for the timeline.
	* Data should be structured like:
	* [site]->{
		lat, lng, title, id, time: {min: 0, max: 0}
	}
	* 
	*/
	makeFakeTimeData(dataset, minTime = -100000, maxTime = -5000) {
		let wave = 0.0;
		dataset.map((point) => {
			let signal = Math.sin(wave);
			wave += 0.1;
			if(signal < 0) {
				signal *= -1;
			}
			point.time = {};
			point.time.min = (((minTime - maxTime) * (signal)) + maxTime);
			point.time.max = point.time.min + (5000 * (0.5));

			point.time.min = Math.round(point.time.min);
			point.time.max = Math.round(point.time.max);
		});
		
		return dataset;
	}

	/*
	* Function: getExtremeProperty
	*
	* Great for getting the high/low endpoints of a list of objects, targeting a specific property in these.
	*/
	getExtremeProperty(data, property, highOrLow = "high") {
		let extremeKey = null;
		for(let key in data) {
			if(highOrLow == "high") {
				if(extremeKey == null || data[key][property] > data[extremeKey][property]) {
					extremeKey = key;
				}
			}
			if(highOrLow == "low") {
				if(extremeKey == null || data[key][property] < data[extremeKey][property]) {
					extremeKey = key;
				}
			}
		}
		return data[extremeKey];
	}

	getHighestDataValue(data, selections) {
		//Assuming the data array is already sorted
		let highestDataValue = this.data[this.data.length - 1].value;
		if (selections.length == 2) {
			if (highestDataValue > selections[1]) {
				highestDataValue = selections[1];
			}
		}
		return highestDataValue;
	}

	getLowestDataValue(data, selections) {
		//Assuming the data array is already sorted
		let lowestDataValue = this.data[0].value;
		if (selections.length == 2) {
			if (lowestDataValue < selections[0]) {
				lowestDataValue = selections[0];
			}
		}
		return lowestDataValue;
	}

	makeCategories(data, selections = []) {
		//Make categories
		let categories = [];

		//Highest/lowest data value in dataset (this.data)
		let highestDataValue = this.getHighestDataValue(data, selections);
		let lowestDataValue = this.getLowestDataValue(data, selections);

		let dataSpan = highestDataValue - lowestDataValue;

		//Category (bar span) size
		this.categorySpan = dataSpan / this.numberOfCategories;

		//Make the categories/bars
		for (let catKey = 0; catKey < this.numberOfCategories; catKey++) {

			//Determine low/high point of category/bar (not height, height is number of samples within this span)
			let catLow = lowestDataValue + (catKey * this.categorySpan);
			let catHigh = lowestDataValue + ((catKey + 1) * this.categorySpan);

			catLow = Math.round(catLow * 10) / 10;
			catHigh = Math.round(catHigh * 10) / 10;

			categories.push({
				lowest: catLow,
				highest: catHigh,
				dataPoints: []
			});
		}

		//Get number of samples in each category - this will make out the height of the bar
		for (let catKey in categories) {
			for (let dataKey in this.data) {
				let dataValue = this.data[dataKey].value;
				if (dataValue <= categories[catKey].highest && dataValue >= categories[catKey].lowest) {
					categories[catKey].dataPoints.push(dataValue);
				}
			}
		}

		return categories;
	}

	renderChart(data) {

		//this.data = JSON.parse(JSON.stringify(this.makeFakeTimeData(this.map.data)));
		const chartAnchorNode = $(".timeline-chart-container", this.map.renderTimelineIntoNode);
		chartAnchorNode.append("<div class='timeline-chart-container-wrapper'></div>");
		const canvasNode = $(".timeline-chart-container-wrapper", chartAnchorNode).append($("<canvas class='timeline-chart-container-canvas'></canvas>")).find("canvas");
		//const canvasNode = chartAnchorNode.append($("<canvas class='timeline-chart-container-canvas'></canvas>")).find("canvas");
		
		let marginSize = this.getTimelineMarginSize(data);

		$(".timeline-chart-container-wrapper", this.map.renderTimelineIntoNode).css("width", "calc(100% - "+(marginSize*2-28)+"px)");

		//chartAnchorNode.css("width", "calc(100% - "+(marginSize*2)+"px)");

		this.chartJSOptions = {
			responsive: true,
			maintainAspectRatio: false,
			legend: {
				display: false
			},
			scales: {
				xAxes: [{
					id: 'time-x-axis',
					display: false,
					ticks: {
						min: 0,
						max: 200000
					}
				}],
				yAxes: [{
					id: 'sites-y-axis',
					type: 'linear',
					position: "left",
					ticks: {
						fontColor: css.auxColor
						//beginAtZero: true,
						//max: 100,
						//min: 0
					},
					scaleLabel: {
						display: true,
						labelString: "Sites",
						fontFamily: "Rajdhani",
						fontStyle: "bold",
						fontSize: 14
					}
				},
				{
					id: 'temperature-y-axis',
					type: 'linear',
					position: "right",
					gridLines: {
						display: false
					},
					ticks: {
						beginAtZero: false,
						fontColor: css.baseColor
					},
					scaleLabel: {
						display: true,
						labelString: "δ18O GISP2",
						fontFamily: "Rajdhani",
						fontStyle: "bold",
						fontSize: 14
					}
				}]
			},
			layout: {
				padding: {
					left: 0,
					right: 0,
					top: 10,
					bottom: 10
				}
			},
			tooltips: {
				displayColors: false
			},
			animation: {
				duration: 0
			}
		};

		let chartJSDatasets = this.getChartDataSets(data, this.getSelection());

		var ctx = canvasNode[0].getContext("2d");
		this.chart = new Chart(ctx, {
			type: "bar",
			data: chartJSDatasets,
			options: this.chartJSOptions
		});
	}


	/*
	* Function: getDataSpanAtResolution
	* 
	* Parameters:
	* data - A list containing objects where each object contain "max" and "min" properties or "value".
	* resolution - Number of categories/spans to reduce this data into.
	*/
	getDataSpanAtResolution(data, resolution = 100) {
		let categories = [];
		let point = data[0];
		let max = null;
		let min = null;

		let pointValueIsSpan = false;
		//If we are dealing with data where each datapoint contains a span...
		if(typeof point.max != "undefined" && typeof point.min != "undefined") {
			pointValueIsSpan = true;
			data.map(point => {
				if (point.max > max || max == null) {
					max = point.max;
				}
				if (point.min < min || min == null) {
					min = point.min;
				}
			});
		}
		//If we are dealing with distinct values for each point...
		else {
			data.map(point => {
				if(point.value > max || max == null) {
					max = point.value;
				}
				if(point.value < min || min == null) {
					min = point.value;
				}
			});
		}
		
		let fullSpan = max - min;
		let categorySize = fullSpan / resolution;


		let catMin = min;
		let catMax = catMin + categorySize;

		for(let i = 0; i < resolution; i++) {
			catMin = Math.round(catMin);
			catMax = Math.round(catMax);

			categories.push({
				min: catMin,
				max: catMax,
				points: [],
				pointsNum: 0
			});

			catMin += categorySize;
			catMax += categorySize;
		}

		for(let ck in categories) {
			let cat = categories[ck];
			for(let pk in data) {
				let point = data[pk];

				if(pointValueIsSpan) {
					//If point falls completely within category...
					if(point.min >= cat.max || point.max <= cat.min) {
						//Exclude point
					}
					else {
						cat.pointsNum++;
						cat.points.push(point);
					}
				}
				else {
					if(point.value >= cat.min && point.value <= cat.max) {
						cat.pointsNum++;
						cat.points.push(point);
					}
				}
			}
		}
		return categories;
	}

	getChartDataSets(data, selection = []) {
		let dataPreparedForCategorization = [];
		data.map((point) => {
			dataPreparedForCategorization.push({
				max: point.time.max,
				min: point.time.min,
				id: point.id
			});
		});

		let categories = this.getDataSpanAtResolution(dataPreparedForCategorization, this.categoryCount);
		

		// Create breakpoints at the selections, so we will divide this into 2 different dataseries with different colors

		let dataSeries = [];
		let dataSeriesColors = [];
		for(let k in categories) {
			let cat = categories[k];
			dataSeries.push(cat.points.length);
			if(cat.min >= selection[0] && cat.max <= selection[1]) {
				//This belongs in the selected data series
				dataSeriesColors.push(css.auxColor);
			}
			else {
				//This is outside the selected data series
				dataSeriesColors.push(css.inactiveColor);
			}
		}


		// Categories == number of labels
		let labels = [];
		categories.map(cat => {
			let label = cat.points.length+" sites";
			labels.push(label);
		});

		
		let temperatureDataSeries = [];

		//console.log(this.temperatureData);

		//let earliestTemp = this.getEarliestTemperature(this.temperatureData);
		//let latestTemp = this.getLatestTemperature(this.temperatureData);

		let earliestTemp = this.getExtremeProperty(this.temperatureData, "year", "low");
		let latestTemp = this.getExtremeProperty(this.temperatureData, "year", "high");

		//console.log(data);
		//let latestSite = this.getExtremeProperty(data, ["time", "max"], "high");
		//let earliestSite = this.getExtremeProperty(data, ["time", "min"], "low");

		let earliestSite = this.getEarliestDataPoint(data);
		let latestSite = this.getLatestDataPoint(data);
		
		/*
		console.log(earliestSite, latestSite);
		console.log(earliestTemp, latestTemp);
		*/
		//console.log(this.temperatureData);
		
		//If earliest temperature data is later than the earliest site data point
		if(earliestTemp.year > earliestSite.time.min) {
			//We need to fill out our temperature span (bottom-part) with null-years so that we start at the same point as the site data
			let stepSize = this.temperatureData[1].year - this.temperatureData[0].year;
			let stepsToCreate = ((earliestTemp.year - earliestSite.time.min) / stepSize);
			let currentYear = earliestTemp.year;

			console.log(earliestTemp.year, earliestSite.time.min);
			console.log(stepSize, stepsToCreate, currentYear);

			
			while(stepsToCreate > 0) {
				currentYear -= stepSize;
				let temperaturePoint = {
					year: currentYear,
					temp: NaN
				};
				this.temperatureData.push(temperaturePoint);
				stepsToCreate--;
			}
			
			//Sort
			/*
			this.temperatureData.sort((a, b) => {
				if(a.year > b.year) {
					return 1;
				}
				if(a.year < b.year) {
					return -1;
				}
				return 0;
			});
			*/

			//console.log(this.temperatureData);
			
		}
		//If latest temperature data is earlier than the latest site data point (not likely, but still...)
		if(latestTemp.year < latestSite.time.max) {
			//We need to fill out our temperature span (top-part) with null-years so that we end at the same point as the site data
		}
		
		


		for(let k in this.temperatureData) {
			this.temperatureData[k].value = this.temperatureData[k].year;
		}

		let temperatureCategories = this.getDataSpanAtResolution(this.temperatureData, this.categoryCount);
		//console.log(temperatureCategories);
		//temperatureCategories.reverse();
		
		//console.log(temperatureCategories);
		for(let k in temperatureCategories) {
			//get avg temperature among these points
			let total = 0;
			for(let pk in temperatureCategories[k].points) {
				let point = temperatureCategories[k].points[pk];
				total += point.temp;
			}
			let avgTemp = total / temperatureCategories[k].points.length;

			temperatureDataSeries.push(avgTemp);
		}

		//console.log(temperatureDataSeries);
		const color = new Color();

		let chartJSDatasets = {
			labels: labels,
			datasets: [
				{
					xAxisID: "time-x-axis",
					yAxisID: "sites-y-axis",
					data: dataSeries,
					backgroundColor: dataSeriesColors,
					//borderColor: color.hexToRgba(css.auxColor, 1.0)
				},
				{
					xAxisID: "time-x-axis",
					yAxisID: "temperature-y-axis",
					data: temperatureDataSeries,
					backgroundColor: color.hexToRgba(css.baseColor, 0.75),
					borderColor: color.hexToRgba(css.paneBgColor, 0.5),
					type: "line",
					pointRadius: 2,
					fill: false
				}
			]
		};

		//console.log(temperatureDataSeries.length, dataSeriesSelected.length, dataSeriesUnselected.length);
		//console.log(labels);

		return chartJSDatasets;
	}


	unrender() {
		if(this.chart != null) {
			this.chart.destroy();
		}
		$(this.sliderAnchorNode).remove();
		this.sliderElement = null;
	}


}

export { Timeline as default }