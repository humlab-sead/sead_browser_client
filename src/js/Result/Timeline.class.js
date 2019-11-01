import noUiSlider from "nouislider";
import "nouislider/distribute/nouislider.min.css";
import Color from "../color.class";
import css from '../../stylesheets/style.scss';
import Config from "../../config/config.js";

class Timeline {
	constructor(mapObject) {
		this.map = mapObject;
		this.chart = null;
		this.sliderElement = null;
		this.sliderAnchorNode = null;
		this.categoryCount = 100;
		this.selection = [];
		this.rendered = false;
		//Set up resize event handlers
		
		this.map.resultManager.hqs.hqsEventListen("layoutResize", () => this.resizeCallback());
		$(window).on("resize", () => this.resizeCallback());
		
	}

	resizeCallback() {
		//Re-render everything on resize evt - which may not be very efficient, but it ensures proper adjusting to new size
		if(this.rendered) {
			this.unrender();
			this.render(); //This re-fetches the temperature data as well, which is silly, but it ensures that we have an initial batch of temperature data before rendering begins
		}
	}

	makeAnchorNodes() {
		$(this.map.renderTimelineIntoNode).html("");
		$(this.map.renderTimelineIntoNode).append("<div class='timeline-chart-container'></div>");
		$(this.map.renderTimelineIntoNode).append("<div class='timeline-slider-container'></div>");
	}

	render() {
		this.rendered = true;
		//Loading the temperature data, which is actually not temperature but instead it's isotope data acting as a proxy for temperature
		$.ajax(Config.siteReportServerAddress+"/temperatures?order=years_bp.desc", {
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

	renderData() {
		let data = this.map.data;
		this.setSelection(this.getEarliestSite(data).time.min, this.getLatestSite(data).time.max);
		this.makeAnchorNodes();
		this.renderChart(data);
		this.renderSlider(data);
	}

	getEarliestSite(data) {
		let selected = null;
		for(let key in data) {
			if(selected == null || data[key].time.min < selected.time.min) {
				selected = data[key];
			}
		}
		return selected;
	}
	getLatestSite(data) {
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
	*/
	renderSlider(data) {
		let earliest = this.getEarliestSite(data);
		let latest = this.getLatestSite(data);
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
		$(this.sliderAnchorNode).css("width", "calc(100% - "+((digitSpace) + 0)+"px)");
		$(".slider-manual-input-container", this.sliderAnchorNode).css("width", 22 + digitSpace);
		$(".range-facet-manual-input", this.sliderAnchorNode).css("width", 18 + digitSpace);
		$(".rangeslider-container", this.sliderAnchorNode).css("margin-left", 18 + digitSpace);
		$(".rangeslider-container", this.sliderAnchorNode).css("margin-right", 18 + digitSpace);
		$(".noUi-handle-lower > .slider-manual-input-container", this.sliderAnchorNode).css("left", Math.round(digitSpace*-1-5)+"px");
		$(".slider-manual-input-container", this.sliderAnchorNode).show();
		
		//Adjust slider left and/or right margins to account for length of digits in each left/right legend, which affects where the slider endpoint needs to positioned
		let rightMargin = this.chart.chart.legend.margins.right;
		let leftMargin = this.chart.chart.legend.margins.left;
		$(".timeline-slider-container").css("margin-right", rightMargin+"px");
		$(".timeline-slider-container").css("margin-left", leftMargin+"px");


		this.sliderElement.on("update", (values, slider) => {
			if(this.equalToSelection(values)) { //Skip updating if slider setting is equal to existing selection. This is just to avoid the 2 unnecessary updates that are triggered when the slider is first rendered and the endpoints are moving to their initial positions (I'm guessing that's what's happening).
				return;
			}
			
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

	equalToSelection(values) {
		return parseFloat(values[0]) == this.getSelection()[0] && parseFloat(values[1]) == this.getSelection()[1];
	}

	updateChart(data) {
		//console.log("Update chart");
		let chartJSDatasets = this.getChartDataSets(data, this.getSelection());
		this.chart.data = chartJSDatasets;
		this.chart.update();
	}

	getTimelineMarginSize(data) {
		let earliest = this.getEarliestSite(data);
		let latest = this.getLatestSite(data);
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

	renderChart(data) {
		const chartAnchorNode = $(".timeline-chart-container", this.map.renderTimelineIntoNode);
		chartAnchorNode.append("<div class='timeline-chart-container-wrapper'></div>");
		const canvasNode = $(".timeline-chart-container-wrapper", chartAnchorNode).append($("<canvas class='timeline-chart-container-canvas'></canvas>")).find("canvas");
		
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
				displayColors: false,
				callbacks: {
					label: function(tooltipItem) {
						let tt = tooltipItem;
						let output = "";
						if(tt.datasetIndex == 0) { //Sites dataset
							output = tt.value+" sites";
						}
						else { //temperature dataset
							output = tt.value;
						}
						return output;
					}
				 }
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
	* Function: binSitesByTimeSpan
	*
	* Takes an array of sites and bins/categorizes them according to timespan, according to given number of bins/resolution.
	* Function uses inclusive overlap for binning - so a site is likely to end up in several bins.
	*
	* Parameters:
	* sites - Array of sites
	* resolution - Number of bins to create
	*
	* Returns:
	* Array of bins
	*/
	binSitesByTimeSpan(sites, resolution = 100) {
		let bins = [];
		let totalMax = null;
		let totalMin = null;
	
		//Figure out extreme max/min of the total value range
		sites.map(site => {
			if (site.max > totalMax || totalMax == null) {
				totalMax = site.max;
			}
			if (site.min < totalMin || totalMin == null) {
				totalMin = site.min;
			}
		});

		//Make bins
		let fullSpan = totalMax - totalMin;
		let binSize = fullSpan / resolution;

		let binMin = totalMin; //First bin
		let binMax = binMin + binSize; //First bin

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
			for(let sk in sites) {
				let site = sites[sk];

				//If site overlaps bin endpoints (at all), include it in this bin
				let binEclipse = site.min > bin.min && site.max < bin.max; //Overlap through being eclipsed by bin
				let overlapLow = site.min < bin.min && site.max > bin.min; //Overlap over low point of bin
				let overlapHigh = site.max > bin.max && site.min < bin.max; //Overlap over high point of bin
				let siteEclipse = site.min < bin.min && site.max > bin.max; //Overlap through site eclipsing bin
				if(binEclipse || overlapLow || overlapHigh || siteEclipse) {
					bin.sites.push(site);
				}
			}
		}

		this.siteBins = bins;
		return bins;
	}

	/*
	* Function: getDataSpanAtResolution
	* 
	* Generic function for downgrading the resolution of a dataset, not used anymore.
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



	getTemperatureDataSeriesForSiteBins(temperatureData, siteBins) {
		let temperatureBins = [];
		for(let sk in siteBins) {
			let siteBin = siteBins[sk];

			let tBin = {
				min: siteBin.min, //bin start (same as site bin since we are doing a 1-1 mapping)
				max: siteBin.max, //bin end (same as site bin since we are doing a 1-1 mapping)
				value: null, //avg value
				samples: [] //samples/values being averaged
			};

			temperatureData.map((t) => {
				if(t.year >= siteBin.min && t.year <= siteBin.max) {
					if(!isNaN(t.temp)) {
						tBin.samples.push(t);
					}
				}
			});

			//Calculate average based on what is in tBin.samples
			let total = 0;
			for(let k in tBin.samples) {
				total += tBin.samples[k].temp;
			}
			tBin.value = total / tBin.samples.length;

			temperatureBins.push(tBin);
		}

		//Make the chartjs dataseries
		let temperatureDataSeries = [];
		temperatureBins.map((tb) => {
			let value = Math.round(tb.value*10)/10; //Round to 1 decimal
			temperatureDataSeries.push(value);
		});
		
		this.temperatureBins = temperatureBins;
		return temperatureDataSeries;
	}

	/*
	* Function: getChartDataSets
	*
	* Creates and returns the chart data sets in the format the Chart.js library wants to have them.
	*
	* Parameters:
	* data
	* selection
	*/
	getChartDataSets(data, selection = []) {
		let dataPreparedForCategorization = [];
		data.map((point) => {
			dataPreparedForCategorization.push({
				max: point.time.max,
				min: point.time.min,
				id: point.id
			});
		});

		let bins = this.binSitesByTimeSpan(dataPreparedForCategorization, this.categoryCount);
		
		// Create breakpoints at the selections, so we will divide this into 2 different dataseries with different colors
		let dataSeries = [];
		let dataSeriesColors = [];
		for(let k in bins) {
			let bin = bins[k];
			dataSeries.push(bin.sites.length);
			if(bin.min >= selection[0] && bin.max <= selection[1]) {
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
		bins.map(cat => {
			//let label = "Sites: "+cat.sites.length+"\r\nTimespan: "+this.parseHumanReadableDate(cat.min)+" to "+this.parseHumanReadableDate(cat.max);
			let label = "";
			labels.push(label); //This seems to be literally just the label - as in, it shouldn't contain any values
		});
		
		let temperatureDataSeries = this.getTemperatureDataSeriesForSiteBins(this.temperatureData, bins);
		
		const color = new Color();

		let chartJSDatasets = {
			labels: labels,
			datasets: [
				{
					xAxisID: "time-x-axis",
					yAxisID: "sites-y-axis",
					data: dataSeries,
					backgroundColor: dataSeriesColors,
					hoverBackgroundColor: color.hexToRgba(css.baseColor, 1.0)
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

		return chartJSDatasets;
	}

	parseHumanReadableDate(time) {
		if(time < 0) {
			return (time*-1)+"BCE";
		}
		return time+"CE";
	}


	unrender() {
		if(this.chart != null) {
			this.chart.destroy();
		}
		$(this.sliderAnchorNode).remove();
		this.sliderElement = null;
		this.rendered = false;
	}

}

export { Timeline as default }