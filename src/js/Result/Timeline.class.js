import noUiSlider from "nouislider";
import "nouislider/distribute/nouislider.min.css";

class Timeline {
    constructor(mapObject) {
        this.map = mapObject;
    }

    makeAnchorNodes() {
		console.log(this.map.renderTimelineIntoNode);
        $(this.map.renderTimelineIntoNode).html("");
        $(this.map.renderTimelineIntoNode).append("<div class='timeline-chart-container'></div>");
		$(this.map.renderTimelineIntoNode).append("<div class='timeline-slider-container'></div>");
		
		console.log($(".timeline-chart-container").height());
		console.log($(".timeline-chart-container").width());

		/*
		$(".timeline-chart-container").css("height", $(".timeline-chart-container").height()+"px");
		$(".timeline-chart-container").css("width", $(".timeline-chart-container").width()+"px");
		*/
	}

    render() {
        this.makeAnchorNodes();
        this.renderChart();
        //this.renderSlider();
    }

    renderSlider() {
        const sliderAnchorNode = $(".timeline-slider-container", this.map.renderTimelineIntoNode)[0];

        let sliderMin = 0;
        let sliderMax = 100;
        this.sliderElement = noUiSlider.create(sliderAnchorNode, {
			start: [sliderMin, sliderMax],
			range: {
				'min': sliderMin,
				'max': sliderMax
			},
			//margin: this.categorySpan,
			//step: this.categorySpan,
			connect: true
		});
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
		let highestDataValue = this.data[this.data.length-1].value;
		if(selections.length == 2) {
			if(highestDataValue > selections[1]) {
				highestDataValue = selections[1];
			}
		}
		return highestDataValue;
	}

	getLowestDataValue(data, selections) {
		//Assuming the data array is already sorted
		let lowestDataValue = this.data[0].value;
		if(selections.length == 2) {
			if(lowestDataValue < selections[0]) {
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
		 for(let catKey = 0; catKey < this.numberOfCategories; catKey++) {
 
			 //Determine low/high point of category/bar (not height, height is number of samples within this span)
			 let catLow = lowestDataValue + (catKey * this.categorySpan);
			 let catHigh = lowestDataValue + ((catKey+1) * this.categorySpan);
			 
			 catLow = Math.round(catLow * 10) / 10;
			 catHigh = Math.round(catHigh * 10) / 10;

			 categories.push({
				 lowest: catLow,
				 highest: catHigh,
				 dataPoints: []
			 });
		 }
 
		 //Get number of samples in each category - this will make out the height of the bar
		 for(let catKey in categories) {
			 for(let dataKey in this.data) {
				 let dataValue = this.data[dataKey].value;
				 if(dataValue <= categories[catKey].highest && dataValue >= categories[catKey].lowest) {
					 categories[catKey].dataPoints.push(dataValue);
				 }
			 }
		 }

		return categories;
	}

    renderChart() {

        this.data = JSON.parse(JSON.stringify(this.makeFakeTimeData(this.map.data)));
        //console.log(this.data);

        const chartAnchorNode = $(".timeline-chart-container", this.map.renderTimelineIntoNode);
        const canvasNode = chartAnchorNode.append($("<canvas></canvas>")).find("canvas");

		this.chartJSOptions = {
			responsive: true,
			maintainAspectRatio: false,
			legend: {
				display: false
			},
			scales: {
				xAxes: [{
					display: true,
					barPercentage: 1.0
				}],
				yAxes: [{
					ticks: {
						beginAtZero:true
					}
				}]
			},
			layout: {
				padding: {
					left: 0,
					right: 0,
					top: 0,
					bottom: 0
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
            if(point.maxTime > maxTime) {
                maxTime = point.maxTime;
            }
            if(point.minTime < minTime) {
                minTime = point.minTime;
            }
        });


        //2. Divide this into a suitable number of categories
        let categoryCount = 10;
        let categorySize = (minTime - maxTime) / categoryCount;
        let categories = [];
        for(let i = 1; i <= categoryCount; i++) {
            categories.push({
                label: categorySize * i+" - "+categorySize * (i+1),
                min: categorySize * i,
                max: categorySize * (i+1),
                points: 0
            });
        }
        //3. Count number of points in each category
        
        categories.map(cat => {
            this.data.map(point => {
                if(point.minTime <= cat.max || point.maxTime >= cat.min) {
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
        
        let dataSeries = [];
        categories.map(cat => {
            dataSeries.push(cat.points);
        });

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
        
        let chartJSDatasets = {
			labels: labels,
			datasets: [{
				data: dataSeries,
				backgroundColor: "#00f",
				borderColor: "#00f"
			}]
		};

		var ctx = canvasNode[0].getContext("2d");
		this.chart = new Chart(ctx, {
			type: "bar",
			data: chartJSDatasets, //need a copy here - not a reference
			options: this.chartJSOptions
		});
    }

    


}

export { Timeline as default }