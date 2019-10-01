import noUiSlider from "nouislider";
import "nouislider/distribute/nouislider.min.css";
import Color from "../color.class";
import css from '../../stylesheets/style.scss';

class Timeline {
	constructor(mapObject) {
		this.map = mapObject;
		this.chart = null;
		this.sliderElement = null;
		this.sliderAnchorNode = null;

		//Set up resize event handlers
		this.map.resultManager.hqs.hqsEventListen("layoutResize", () => this.resizeCallback());
		$(window).on("resize", () => this.resizeCallback());
	}

	resizeCallback() {
		//Re-render everything on resize evt - which may not be very efficient, but it ensures proper adjusting to new size
		this.unrender();
		this.render();
	}

	makeAnchorNodes() {
		console.log(this.map.renderTimelineIntoNode);
		$(this.map.renderTimelineIntoNode).html("");
		$(this.map.renderTimelineIntoNode).append("<div class='timeline-chart-container'></div>");
		$(this.map.renderTimelineIntoNode).append("<div class='timeline-slider-container'></div>");
	}

	render() {
		this.makeAnchorNodes();
		this.renderChart();
		this.renderSlider();
	}

	renderSlider() {
		//$(".timeline-slider-container", this.map.renderTimelineIntoNode).css("background-color", "blue");
		let sliderAnchorNodeContainer = $(".timeline-slider-container", this.map.renderTimelineIntoNode);
		sliderAnchorNodeContainer.append("<div class='timeline-slider-container-inner'></div>");
		this.sliderAnchorNode = $(".timeline-slider-container-inner", this.map.renderTimelineIntoNode)[0];

		let sliderMin = 0;
		let sliderMax = 100;
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
		var upperManualInputNode = $("#facet-template .range-facet-manual-input-container[endpoint='upper']")[0].cloneNode(true);
		var lowerManualInputNode = $("#facet-template .range-facet-manual-input-container[endpoint='lower']")[0].cloneNode(true);

		$("input", upperManualInputNode).val(sliderMax);
		$("input", lowerManualInputNode).val(sliderMin);

		$(".noUi-handle-upper", this.sliderAnchorNode).append(upperManualInputNode);
		$(".noUi-handle-lower", this.sliderAnchorNode).append(lowerManualInputNode);

		//Lots of adjustments for setting the right size and position of the digit input boxes depending on how big they need to be
		var digits = sliderMax.toString().length; //FIXME: Also check sliderMin since it might actually contain more digits than max
		var digitSpace = digits*5;
		$(".range-facet-manual-input-container", this.sliderAnchorNode).css("width", 22 + digitSpace);
		$(".range-facet-manual-input", this.sliderAnchorNode).css("width", 18 + digitSpace);
		$(".rangeslider-container", this.sliderAnchorNode).css("margin-left", 18 + digitSpace);
		$(".rangeslider-container", this.sliderAnchorNode).css("margin-right", 18 + digitSpace);
		$(".noUi-handle-lower > .range-facet-manual-input-container", this.sliderAnchorNode).css("left", Math.round(0-digitSpace)+"px");
		
		$(".range-facet-manual-input-container", this.sliderAnchorNode).show();
	}

	makeFakeTimeData(dataset) {
		let minTime = -200000;
		let maxTime = 0;
		dataset.map((point) => {
			point.minTime = (maxTime + minTime) * Math.random() | 0;
			point.maxTime = point.minTime + (5000 * Math.random() | 0);
		});
		return dataset;
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

	renderChart() {
		this.data = JSON.parse(JSON.stringify(this.makeFakeTimeData(this.map.data)));
		const chartAnchorNode = $(".timeline-chart-container", this.map.renderTimelineIntoNode);
		chartAnchorNode.append("<div class='timeline-chart-container-wrapper'></div>");
		const canvasNode = $(".timeline-chart-container-wrapper", chartAnchorNode).append($("<canvas class='timeline-chart-container-canvas'></canvas>")).find("canvas");
		//const canvasNode = chartAnchorNode.append($("<canvas class='timeline-chart-container-canvas'></canvas>")).find("canvas");
		
		this.chartJSOptions = {
			responsive: true,
			maintainAspectRatio: false,
			legend: {
				display: false
			},
			scales: {
				xAxes: [{
					display: false,
					barPercentage: 0.70
				}],
				yAxes: [{
					id: 'right-y-axis',
					type: 'linear',
					position: "right",
					ticks: {
						beginAtZero: false
					}
				},
				{
					id: 'left-y-axis',
					type: 'linear',
					position: "left",
					gridLines: {
						display: false
					},
					ticks: {
						beginAtZero: false
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

		//1. Find total timespan
		let maxTime = null;
		let minTime = null;
		this.data.map(point => {
			if (point.maxTime > maxTime) {
				maxTime = point.maxTime;
			}
			if (point.minTime < minTime) {
				minTime = point.minTime;
			}
		});


		//2. Divide this into a suitable number of categories
		let categoryCount = 100;
		let categorySize = (minTime - maxTime) / categoryCount;
		let categories = [];
		for (let i = 1; i <= categoryCount; i++) {
			categories.push({
				label: categorySize * i + " - " + categorySize * (i + 1),
				min: categorySize * i,
				max: categorySize * (i + 1),
				points: 0
			});
		}

		//3. Count number of points in each category
		categories.map(cat => {
			this.data.map(point => {
				if (point.minTime <= cat.max || point.maxTime >= cat.min) {
					cat.points++;
				}
			});
		});

		//4. Categories == number of labels
		let labels = [];
		categories.map(cat => {
			labels.push(cat.label);
		});

		//5. Count in each category == data (bar height)
		let pointDataSeries = [];
		categories.map(cat => {
			pointDataSeries.push(cat.points);
		});

		let temperatureDataSeries = [];
		for (let i = 0; i < 100; i++) {
			temperatureDataSeries.push(Math.random() * 1500);
		}

        /*
        const labels = [1, 2, 3, 4, 5];
        let chartJSDatasets = {
			labels: labels,
			datasets: [{
				data: [12, 34, 78, 45, 96],
				backgroundColor: "#00f",
				borderColor: "#00f"
			}]
        };
        */

		pointDataSeries = [];
		for(let i = 0; i < 100; i++) {
			pointDataSeries.push(Math.random() * 1000);
		}

		const color = new Color();

		let chartJSDatasets = {
			labels: labels,
			datasets: [
				{
					data: pointDataSeries,
					backgroundColor: color.hexToRgba(css.baseColor, 1.0),
					borderColor: color.hexToRgba(css.baseColor, 1.0)
				},
				{
					data: temperatureDataSeries,
					backgroundColor: color.hexToRgba(css.paneBgColor, 0.25),
					borderColor: color.hexToRgba(css.paneBgColor, 0.5),
					type: "line"
				}
			]
		};

		var ctx = canvasNode[0].getContext("2d");
		this.chart = new Chart(ctx, {
			type: "bar",
			data: chartJSDatasets,
			options: this.chartJSOptions
		});
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