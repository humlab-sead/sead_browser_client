class EcoCodes {
	/*
	* Function: constructor
	*/
	constructor(sqs, siteId) {
		this.sqs = sqs;
		this.siteId = siteId;
		this.buildComplete = false;
		this.auxiliaryDataFetched = true; //There is currently no auxiliary data to fetch for any analysis module, so... 

		//The section structure this will result in after everything is fetched and parsed.
		this.section = {
			"name": "ecocodes",
			"title": "Eco codes",
			"contentItems": [],
			"sections": [] //Each type of analysis/method will get its own section here
		};
	}

    async fetch() {
	}

    /*
	* Function: render
	*/
	async render(siteData) {
        console.log("EcoCode module render");

        let sampleGroupColumns = [];
        let sampleGroupRows = [];
        let contentItem = {
            "name": "ecocodes-graph",
            "title": "Eco codes",
            "data": {
                "columns": sampleGroupColumns,
                "rows": sampleGroupRows
            },
            "renderOptions": [{
                "selected": true,
                "type": "bar",
                "name": "Chart",
                "options": [
                    
                ]
            }]
        };
        this.section = {
			"name": "ecocodes",
			"title": "Eco codes",
			"collapsed": false,
			"contentItems": [contentItem]
		};
        
		this.sqs.siteReportManager.siteReport.renderSection(this.section);
	}

	renderD3TimePeriodsGraph() {
		// Set the data for the chart
		var data = [
			{period: "Ancient", start: -3000, end: -500, color: "red"},
			{period: "Medieval", start: 500, end: 1500, color: "blue"},
			{period: "Modern", start: 1500, end: 2021, color: "green"}
		  ];
	  
		  // Set the dimensions and margins of the chart
		  var margin = {top: 10, right: 30, bottom: 30, left: 60},
			width = 600 - margin.left - margin.right,
			height = 400 - margin.top - margin.bottom;
	  
		  // Create the SVG object
		  var svg = d3.select("#chart")
			.append("svg")
			.attr("width", width + margin.left + margin.right)
			.attr("height", height + margin.top + margin.bottom)
			.append("g")
			.attr("transform", "translate(" + margin.left + "," + margin.top + ")");
	  
		  // Create a linear scale for the x-axis
		  var x = d3.scaleLinear()
			.domain([-3500, 2021])
			.range([0, width]);
	  
		  // Create a band scale for the y-axis
		  var y = d3.scaleBand()
			.domain(data.map(function(d) { return d.period; }))
			.range([0, height])
			.padding(0.1);
	  
		  // Add the bars to the chart
		  svg.selectAll(".bar")
			.data(data)
			.enter()
			.append("rect")
			.attr("class", "bar")
			.attr("x", function(d) { return x(d.start); })
			.attr("y", function(d) { return y(d.period); })
			.attr("width", function(d) { return x(d.end) - x(d.start); })
			.attr("height", y.bandwidth())
			.attr("fill", function(d) { return d.color; })
			.attr("title", function(d) { return d.period + ": " + d.start + " - " + d.end; });
	  
		  // Add the x-axis to the chart
		  svg.append("g")
			.attr("transform", "translate(0," + height + ")")
			.call(d3.axisBottom(x));
	  
		  // Add the y-axis to the chart
		  svg.append("g")
			.call(d3.axisLeft(y));
	}

    destroy() {

    }

}

export { EcoCodes as default }

