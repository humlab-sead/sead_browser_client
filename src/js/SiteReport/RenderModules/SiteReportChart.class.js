import shortid from "shortid";
//import Chart from "chart.js";
import { 
	Chart, 
	CategoryScale, 
	LinearScale, 
	BarController, 
	BarElement,
	Legend,
	Tooltip
 } from "chart.js";
import 'zingchart/es6';
import * as d3 from 'd3';
import { circle } from "leaflet";

class SiteReportChart {
	constructor(siteReport, contentItem) {
		this.siteReport = siteReport;
		this.sqs = this.siteReport.sqs;
		this.contentItem = contentItem;
		this.chartId = null;
		
		Chart.register(CategoryScale);
		Chart.register(LinearScale);
		Chart.register(BarController);
		Chart.register(BarElement);
		Chart.register(Legend);
		Chart.register(Tooltip);
		

		this.chartTheme = {
			graph: {
				title: {
					fontFamily: 'Lato',
					fontSize: 14,
					padding: 15,
					fontColor: '#000',
					adjustLayout: true
				},
				backgroundColor: "#f0f0f0"
			}
		};
	}

	update(updatedExtrasRenderOption = null) {
		return false;
    }

	/*
	* Function: render
	*/
	render(anchorNodeSelector) {
		this.anchorNodeSelector = anchorNodeSelector;
		var node = null;
		this.contentItem.renderOptions.forEach((ro, i) => {
			if(ro.selected) {
				console.log(ro.type)
				switch(ro.type) {
					case "bar":
						node = this.renderBarChartZing();
						break;
					case "msbar":
						node = this.renderMagneticSusceptibilityBarChart();
						break;
					case "pie":
						node = this.renderPieChart();
						break;
					case "multistack":
						node = this.renderMultistack();
						break;
					case "dendrochart":
						node = this.renderDendroChart();
						break;
				}
			}
		});

		return this;
	}

	unrender() {
		if(this.chartId != null) {
			zingchart.exec(this.chartId, "destroy");
		}
	}
	
	renderBarChart() {
		this.renderBarChartZing();
		//this.renderBarChartCJS();
	}
	

	getMultiStackConfig(chartTitle, legend = false) {

		let tooltipHtml = "<div class='site-report-chart-tooltip'>";
		tooltipHtml += "%v counts of %t (%plot-sum counts across all samples in this analysis)";
		tooltipHtml += "</div>";

		return {
            "type": "hbar",
            "stacked": true,
            "title":{
                "text": chartTitle,
				"adjustLayout": true,
				"font-size": "16px",
				"font-family": "Rajdhani"
            },
            "legend":{
                "visible": legend,
                "align": 'right',
                "verticalAlign": 'top',
                "toggleAction": 'remove',
				'draggable': true,
				'minimize': true,
				"header": {
					"text": "Taxa",
					'border-bottom': "2px solid #eee"
				  },
                "marker": {
                    "borderWidth": "1px",
                    "borderColor": "#888"
                }
            },
            "plotarea":{
                "margin": "dynamic",
				"margin-right": "25%",
            },
            "tooltip":{
				"text": tooltipHtml,
                "html-mode": true,
                "decimals": 0,
                "align": 'left',
                "borderRadius": 3,
                "fontColor":"#000000",
                "fontSize": "16px",
                "backgroundColor": "#ffffff"
            },
            "plot":{
                "valueBox":{
                    "text":"%total",
                    "rules": [
                        {
                            "rule": '%stack-top == 0',
                            "visible": 0
                        }
                    ]
                },
                "hoverState":{
                    "backgroundColor": "#fff"
				},
				"hover-mode": "plot",
				"stacked": true,
				"stack": 1,
				"stack-type": "normal"
            },
            "scaleX":{
                "labels": [],
				"format": "%v",
                "items-overlap": true,
				"max-labels": 100000,
				"label": {
					"text": "Sample name",
					"visible": true,
					"font-size": "14px"
				}
            },
            "scaleY":{
                "format": "%v",
				"items-overlap": true
            },
            "series": []
        };
	}

	getDendroMeasurementFromSample(dendroSample, measurementType) {
		let value = false;
		dendroSample.forEach(cell => {
			if(cell.type == "subtable") {
				cell.value.rows.forEach(subtableRow => {
					let labelCell = this.getCellWithRole(subtableRow, "label");
					if(labelCell.value == measurementType) {
						let valueCell = this.getCellWithRole(subtableRow, "value");
						value = valueCell.value;
					}
				})
			}
		})
		return value;
	}

	getCellWithRole(tableRow, roleName) {
		for(let key in tableRow) {
			if(typeof tableRow[key].role != undefined && tableRow[key].role == roleName) {
				return tableRow[key];
			}
		}
		return false;
	}

	getTableRowsAsObjects(table) {
		let dataObjects = [];
		for(let rowKey in table.rows) {
			let dataObject = {};
			for(let cellKey in table.rows[rowKey]) {
				let columnName = table.columns[cellKey].title ? table.columns[cellKey].title : table.columns[cellKey].dataType;
				if(columnName == "subtable") {
					let subtable = this.getTableRowsAsObjects(table.rows[rowKey][cellKey].value);
					dataObject[columnName] = subtable;
				}
				else {
					dataObject[columnName] = table.rows[rowKey][cellKey].value;
				}
			}

			dataObjects.push(dataObject);
		}
		return dataObjects;
	}

	

	renderDendroChartOldOld(chartTitle = "Dendrochronology") {
		const width = 40;
		const height = 20;

		console.log(JSON.stringify(this.contentItem));

		const chartId = "chart-"+shortid.generate();
		var chartContainer = $("<div id='"+chartId+"' class='site-report-chart-container'></div>");
		$(this.anchorNodeSelector).append(chartContainer);

		let selection = d3.select(this.anchorNodeSelector).append("svg")
			.attr("width", "200px")
			.attr("height", "200px")
			.style("background", "#ccc")
			.style("color", "#666")
			.attr("viewBox", [0, 0, width, height])
			.selectAll("rect")
			.data([1, 2, 3]) //[[200, 400], [300, 500]]
			.enter()
			.append("rect")
			.attr("class", "dendro-bar")
			.attr("width", "20")
			.attr("height", "20")
			.append("text")
			.text(data => data)

	}

	getValueByColumnNameFromKeyValueTable(table, keyName) {
		for(let key in table) {
			if(table[key]["Measurement type"] == keyName) {
				return table[key]["Measurement value"]
			}
		}
	}

	getTableColumnKeyByTitle(columnTitle) {
		for(let key in this.contentItem.data.columns) {
			if(this.contentItem.data.columns[key].title == columnTitle) {
				return key;
			}
		}
		return null;
	}

	/*
	* Function: renderMultistack
	*
	* WARNING: This function is currently hard-coded to only handle abundances and requires the data in a specific way.
	* Specified X/Y-axis will be ignored.
	 */
	renderMultistack(chartTitle = "Abundances") {
		var contentItem = this.contentItem;
		let cir = this.siteReport.getContentItemRenderer(contentItem);
		var ro = cir.getSelectedRenderOption(contentItem);

		let xAxisKey = null;
		let yAxisKey = null;
		let sortKey = null;

		for(let key in ro.options) {

			if(ro.options[key].function == "xAxis") {
				xAxisKey = ro.options[key].selected;
			}
			if(ro.options[key].function == "yAxis") {
				yAxisKey = ro.options[key].selected;
			}
			if(ro.options[key].function == "sort") {
				sortKey = ro.options[key].selected;
			}
		}

		var config = this.getMultiStackConfig(chartTitle, true);
		
		//Aggregate so that a taxon contains all the sample abundances
		this.taxa = []; //should maybe be called something like stackCategory to make it more generic?
		var samples = [];
		let sampleNames = [];

		let taxonIdColKey = this.getTableColumnKeyByTitle("Taxon id");
		let taxonNameColKey = this.getTableColumnKeyByTitle("Taxon");
		let abundanceColKey = this.getTableColumnKeyByTitle("Abundance count");
		let sampleIdColKey = this.getTableColumnKeyByTitle("Sample id");
		let sampleNameColKey = this.getTableColumnKeyByTitle("Sample name");

		//This is the list of samples we're going to use and IN THIS ORDER - VERY IMPORTANT
		for(var key in contentItem.data.rows) {
			var sampleId = contentItem.data.rows[key][sampleIdColKey].value;
			let sampleName = contentItem.data.rows[key][sampleNameColKey].value;

			//Get unique sample Ids
			var sampleFound = false;
			for(var sk in samples) {
				if(samples[sk] == sampleId) {
					sampleFound = true;
				}
			}
			if(sampleFound === false) {
				samples.push(sampleId);
			}

			//Get unique sample names
			let sampleNameFound = false;
			for(var sk in sampleNames) {
				if(sampleNames[sk] == sampleName) {
					sampleNameFound = true;
				}
			}
			if(sampleNameFound === false) {
				sampleNames.push(sampleName);
			}
		}
		
		
		//Build data structure where the taxon is top/master, because that's the twisted weird logic that zingchart uses for rendering...
		var taxonCount = 0;

		for(var key in contentItem.data.rows) {
			var taxonId = contentItem.data.rows[key][taxonIdColKey].value;
			var taxonName = contentItem.data.rows[key][taxonNameColKey].value;
			var abundance = contentItem.data.rows[key][abundanceColKey].value;
			var sampleId = contentItem.data.rows[key][sampleIdColKey].value;
			var sampleName = contentItem.data.rows[key][sampleNameColKey].value;
			
			if(typeof(this.taxa[taxonId]) == "undefined") {
				this.taxa[taxonId] = {
					taxonId: taxonId,
					taxonName: taxonName,
					samples: []
				};
				taxonCount++;
			}

			this.taxa[taxonId].samples.push({
				abundance: abundance,
				sampleId: sampleId,
				sampleName: sampleName
			});
		}
		
		
		var colors = [];
		//colors = this.sqs.color.getMonoColorScheme(taxonCount);
		colors = this.sqs.color.getColorScheme(taxonCount, false);
		//colors = this.sqs.color.getVariedColorScheme(taxonCount);
		
		//Normalize the taxa structure so that each taxon contains all the samples but with zero abundance where non-existant
		var colorKey = 0;
		for(var key in this.taxa) {
			var values = [];
			for(var k in samples) {
				var sampleId = samples[k];
				
				var sampleValue = 0;
				for(var sk in this.taxa[key].samples) {
					if(this.taxa[key].samples[sk].sampleId == sampleId) {
						sampleValue = this.taxa[key].samples[sk].abundance;
					}
				}
				
				values.push(sampleValue);
			}

			config.series.push({
				stack: 1,
				values: values, //This is one taxon, each array item is for one sample - in order
				//text: taxa[key].taxonName+",<br> "+taxa[key].elementType, //Taxon name,
				text: this.taxa[key].taxonName,
				backgroundColor: colors[colorKey++],
				borderColor: "#888",
				borderWidth: "1px",
				valueBox: {
					fontColor: "#000000"
				}
			});
		}

		for(var k in sampleNames) {
			config.scaleX.labels.push(sampleNames[k]);
		}
		
		this.chartId = "chart-"+shortid.generate();
		var chartContainer = $("<div id='"+this.chartId+"' class='site-report-chart-container'></div>");
		$(this.anchorNodeSelector).append(chartContainer);

		var chartHeight = 130 + (samples.length * 40);

		zingchart.render({
			id: this.chartId,
			data: config,
			defaults: this.chartTheme,
			height: chartHeight,
			events: {
				click: (evt, stuff) => {
					console.log("zingchart click evt");
				}
			}
		});
	}

	getSelectedRenderOptionExtra(extraOptionTitle = "Sort") {
        let renderOption = null;
        this.contentItem.renderOptions.forEach(ro => {
            if(ro.name == "Bar chart") {
                renderOption = ro;
            }
        });

        let sortOptionSelect = null;
        renderOption.options.forEach(roE => {
            if(roE.title == extraOptionTitle) {
                sortOptionSelect = roE;
            }
        });

        let selectedOption = null;
        sortOptionSelect.options.forEach(selectOption => {
            if(selectOption.selected === true) {
                selectedOption = selectOption;
            }
        });

        if(selectedOption == null && sortOptionSelect.options.length > 0) {
            selectedOption = sortOptionSelect.options[0];
        }
        else if(selectedOption == null) {
            return false;
        }

        return selectedOption;
    }

	/*
	* Function: renderBarChartZing
	*
	* Render bar chart using ZingChart
	*/
	renderBarChartZing() {
		var contentItem = this.contentItem;
		/*
		//cri.getSelectedRenderOption();
		console.log(this.siteReport.contentItemRendererRepository);
		var ro = this.siteReport.getSelectedRenderOption(contentItem);
		let xAxisKey = ro.options[this.sqs.findObjectPropInArray(ro.options, "title", "X axis")].selected;
		let yAxisKey = ro.options[this.sqs.findObjectPropInArray(ro.options, "title", "Y axis")].selected;
		*/
		
		let xAxisKey = this.getSelectedRenderOptionExtra("X axis").value;
		let yAxisKey = this.getSelectedRenderOptionExtra("Y axis").value;
		let sortCol = this.getSelectedRenderOptionExtra("Sort").value;

		var xUnitSymbol = "";
		var yUnitSymbol = "";
		
		if(contentItem.data.columns[xAxisKey].hasOwnProperty("unit")) {
			xUnitSymbol = contentItem.data.columns[xAxisKey].unit;
		}
		if(contentItem.data.columns[yAxisKey].hasOwnProperty("unit")) {
			yUnitSymbol = contentItem.data.columns[yAxisKey].unit;
		}

		contentItem.data.rows.sort((a, b) => {
			if(a[sortCol].value > b[sortCol].value) {
				return 1;
			}
			else {
				return -1;
			}
		});

		
		var config = {
			"type": "bar",
			"plot": {
				"tooltip": {
					"text": "<span class='chart-tooltip-info'>"+contentItem.data.columns[xAxisKey].title+": %kv</span>\n"+contentItem.data.columns[yAxisKey].title+": %v",
					"font-size": 16,
				},
				"background-color": "#34454f",
				"hover-state": {
					"background-color": "#f60"
				},
				"max-trackers": 10000
			},
			"scale-x": {
				"format":"%v"+xUnitSymbol,
				"label": {
					"text": contentItem.data.columns[xAxisKey].title
				},
				"values": []
			},
			"scale-y": {
				"format":"%v"+yUnitSymbol,
				"label": {
					"text": contentItem.data.columns[yAxisKey].title
				},
				"values": []
			},
			"series": [{
				"values": [],
				"text": "Series1"
			}]
		};
		
		let yValues = [];
		for(var key in contentItem.data.rows) {
			yValues.push(contentItem.data.rows[key][yAxisKey].value);
			config["scale-x"].values.push(contentItem.data.rows[key][xAxisKey].value);
			config["scale-y"].values.push(contentItem.data.rows[key][yAxisKey].value);
			config["series"][0].values.push(contentItem.data.rows[key][yAxisKey].value);
		}

		//This is really silly work-around for a bug in zingchart. The Y-axis doesn't render properly if the maximum difference between the data points is less than 1.0
		let yDiff = Math.max.apply(null, yValues) - Math.min.apply(null, yValues);
		if(yDiff < 1) {
			config["scale-y"].values.push(Math.max.apply(null, yValues) + 1);
		}
		
		this.chartId = "chart-"+shortid.generate();
		var chartContainer = $("<div id='"+this.chartId+"' class='site-report-chart-container'></div>");
		$(this.anchorNodeSelector).append(chartContainer);

		zingchart.render({
			id : this.chartId,
			data : config,
			defaults: this.chartTheme
		});
	}
	
	
	/*
	* Function: renderBarChartZing
	*
	* DEPRECATED. Render bar chart using ChartJS.
	*/
	renderBarChartCJS() {
		var contentItem = this.contentItem;

		let cir = this.siteReport.getContentItemRenderer(this.contentItem);
		var ro = cir.getSelectedRenderOption(contentItem);
		var xAxisKey = ro.options.xAxis;
		var yAxisKey = ro.options.yAxis;
		
		var xAxisLabel = contentItem.data.columns[xAxisKey].title;
		var yAxisLabel = contentItem.data.columns[yAxisKey].title;

		var chartjsData = {};
		chartjsData.labels = [];
		chartjsData.datasets = [];
		chartjsData.datasets.push({
			label: "Dataset 1",
			data: [],
			hoverBackgroundColor: "#f60"
		});

		var bgColor = this.sqs.color.getColorScheme(1)[0];
		bgColor = "#34454f";

		for(var key in contentItem.data.rows) {
			chartjsData.labels.push(contentItem.data.rows[key][xAxisKey]);
			chartjsData.datasets[0].data.push(contentItem.data.rows[key][yAxisKey]);
			chartjsData.datasets[0].backgroundColor = bgColor;
		}

		this.chartConfig = {
			"type": "bar",
			"data": {
				"labels": chartjsData.labels,
				"datasets": chartjsData.datasets
			}
		};

		this.chartConfig.options = {
			responsive: true,
			responsiveAnimationDuration: 0,
			onResize: (chart, size) => {
			},
			legend: {
				position: "top",
				display: false
			},
			tooltips: {
				callbacks: {
					label: function(tooltipItem) {
						return yAxisLabel+": "+tooltipItem.yLabel;
					}
				}
			},
			animation: {
			},
			title: {
				display: false,
				text: contentItem.title
			},
			scales: {
				yAxes: [
					{
						scaleLabel: {
							display: true,
							labelString: yAxisLabel
						},
						ticks: {
							beginAtZero: true
						}
					}
				],
				xAxes: [
					{
						scaleLabel: {
							display: true,
							labelString: xAxisLabel
						},
						ticks: {
							display: contentItem.data.rows.length < 31,
							beginAtZero: false,
							autoSkip: false
						}
					}
				]
			}
		};

		var chartId = "chart-"+shortid.generate();
		var chartContainer = $("<div class='site-report-chart-container'></div>");
		this.chartNode = $("<canvas id='"+chartId+"' class='site-report-chart'></canvas>");
		chartContainer.append(this.chartNode);
		$(this.anchorNodeSelector).append(chartContainer);
		var ctx = $(this.chartNode)[0].getContext("2d");
		new Chart(ctx, this.chartConfig);

		return chartContainer;
	}

	renderMagneticSusceptibilityBarChart() {
		let contentItem = this.contentItem;
		
		let xAxisKey = this.getSelectedRenderOptionExtra("X axis").value;
		let yAxisKey = this.getSelectedRenderOptionExtra("Y axis").value;
		let sortCol = this.getSelectedRenderOptionExtra("Sort").value;

		var xUnitSymbol = "";
		var yUnitSymbol = "";
		
		if(contentItem.data.columns[xAxisKey].hasOwnProperty("unit")) {
			xUnitSymbol = contentItem.data.columns[xAxisKey].unit;
		}
		if(contentItem.data.columns[yAxisKey].hasOwnProperty("unit")) {
			yUnitSymbol = contentItem.data.columns[yAxisKey].unit;
		}

		contentItem.data.rows.sort((a, b) => {
			if(a[1].value > b[1].value) {
				return 1;
			}
			else {
				return -1;
			}
		});

		let sampleNames = [];
		let datasets = [];
		datasets.push({
			label: "Unburned",
			backgroundColor: "darkblue",
			data: []
		});
		datasets.push({
			label: "Burned",
			backgroundColor: "red",
			data: []
		});

		for(var key in contentItem.data.rows) {
			let row = contentItem.data.rows[key];
			let sampleName = row[0].value;
			sampleNames.push(sampleName);
			let unburned = row[1].value;
			let burned = row[2].value;
			
			datasets[0].data.push(unburned);
			datasets[1].data.push(burned);
		}

		const data = {
			labels: sampleNames,
			datasets: datasets
		};

		let config = {
			type: 'bar',
			data: data,
			options: {
				plugins: {
					legend: {
						position: 'top',
					},
					tooltip: {
						enabled: true,
						callbacks: {
							title: function(context) {
								return "Sample "+context[0].label;
							},
							label: function(context) {
								return context.dataset.label+" weight: "+context.formattedValue+" mg";
							}
						}
					}
				},
				responsive: true,
				scales: {
					x: {
						stacked: true,
					},
					y: {
						stacked: true
					}
				}
			}
		  };
		
		  
		this.chartId = "chart-"+shortid.generate();
		var chartContainer = $("<canvas id='"+this.chartId+"' class='site-report-chart-container'></canvas>");
		$(this.anchorNodeSelector).append(chartContainer);

		new Chart(
			document.getElementById(this.chartId),
			config
		);
	}

	renderPieChart() {
		var contentItem = this.contentItem;
		let cir = this.siteReport.getContentItemRenderer(this.contentItem);
		var ro = cir.getSelectedRenderOption(contentItem);
		
		var dimensionKey = ro.options.dimension;
		
		var config = {
			"type": "pie",
			"plot": {
				"tooltip": {
					"text": "<span class='chart-tooltip-info'>%t (Count: %v)</span>",
					"font-size": 16,
				},
				"background-color": "#34454f",
				"hover-state": {
					"background-color": "#f60"
				},
				"max-trackers": 1000,
				"value-box":{
					"font-size":14,
					"font-weight":"normal",
					"placement":"in",
					"text": "%v"
				}
				
				
			},
			/*
			"legend": {
				"toggle-action": "hide",
				"header": {
					"text": "Legend"
				},
				"item": {
					"cursor": "pointer"
				},
				"draggable": true,
				"drag-handler": "icon"
			},
			*/
			"series": [
			]
		};
		
		
		var categories = [];
		
		for(var key in contentItem.data.rows) {
			var row = contentItem.data.rows[key];
			
			var found = false;
			for(var k in categories) {
				if(categories[k].value == row[dimensionKey].value) {
					categories[k].count++;
					found = true;
				}
			}
			if(!found) {
				categories.push({
					title: row[dimensionKey].value,
					value: row[dimensionKey].value,
					count: 1,
					tooltip: ""
				});
			}
		}
		
		//var colors = this.sqs.siteReportManager.siteReport.getColorScheme(categories.length);
		var colors = this.sqs.color.getMonoColorScheme(categories.length, "#34454f", "#34454f");
		
		for(var key in categories) {
			config.series.push({
				text: categories[key].value,
				values : [categories[key].count],
				backgroundColor: colors[key]
			});
		}
		
		var chartId = "chart-"+shortid.generate();
		var chartContainer = $("<div id='"+chartId+"' class='site-report-chart-container'></div>");
		$(this.anchorNodeSelector).append(chartContainer);
		
		zingchart.render({
			id : chartId,
			data : config,
			defaults: this.chartTheme
		});
	}

	convertToChartJsData(data) {

		var chartjsStruct = {
			"type": data.type.split("-")[1],
			"data": {
				"labels": data.labels,
				"datasets": data.datasets
			}
		};

		return chartjsStruct;
	}

	renderContentDisplayOptionsPanel(section, contentItem) {
		
	}
}

export { SiteReportChart as default }