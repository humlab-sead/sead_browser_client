import Plotly from 'plotly.js-dist-min';
import "ion-rangeslider";
import "ion-rangeslider/css/ion.rangeSlider.min.css";

class Timeline {
	constructor(mapObject) {
        this.sqs = mapObject.sqs;
		this.map = mapObject;
		this.chart = null;
		this.sliderElement = null;
		this.sliderAnchorNode = null;
    }

    render() {
        var x = [];
        for (var i = 0; i < 500; i ++) {
            x[i] = Math.random();
        }

        var trace = {
            x: x,
            type: 'histogram',
        };
        var data = [trace];

        let layout = {
            title: 'Timeline',
            plot_bgcolor: this.sqs.color.colors.paneBgColor,
			paper_bgcolor: this.sqs.color.colors.paneBgColor,
			autosize: true,
            margin: { l: 50, r: 50, t: 0, b: 0 },
        };

        let options = {
            displayModeBar: false,
            responsive: true
        };

        Plotly.newPlot('result-timeline-render-container', data, layout, options);
        
        let sliderMin = 0;
        let sliderMax = 100;

        $("#result-timeline-render-container .range-slider-input").ionRangeSlider({
			type: "double",
			min: sliderMin,
			max: sliderMax,
			step: 1,
			skin: "flat",
			prettify_enabled: true, // Enables prettify function
			prettify: (num) => {
				if(this.unit == "BP") {
					return this.formatWithSpaces(num)+" BP";
				}
				else {
					return this.formatWithSpaces(num);
				}
			},
			onFinish: (data) => {
				let values = [];
				values.push(data.from);
				values.push(data.to);
				//this.sliderMovedCallback(values);
			}
		});
    }

    formatWithSpaces(number) {
		return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
	}

    async fetchTimeData() {
        
    }

    getSelectedSites() {
        return this.map.data;
    }

    unrender() {

    }
}

export default Timeline;