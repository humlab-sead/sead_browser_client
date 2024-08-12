class Visualizations {
    constructor(sqs) {
        this.sqs = sqs;
    }

    renderEcoCodeChart(dataset) {

        /*
        dataset = {
			label: "Eco codes",
			data: [],
			backgroundColor: []
		}
        */

		let contentItem = this.contentItem;
		let xAxisKey = this.getSelectedRenderOptionExtra("X axis").value;
		let yAxisKey = this.getSelectedRenderOptionExtra("Y axis").value;
		let sortCol = this.getSelectedRenderOptionExtra("Sort").value;

		let ecoCodeNames = [];
		let datasets = [];
		
		datasets.push({
			label: "Eco codes",
			data: [],
			backgroundColor: []
		});

		for(var key in contentItem.data.rows) {
			let row = contentItem.data.rows[key];
			let ecoCodeName = row[0].value;
			ecoCodeNames.push(ecoCodeName);
			datasets[0].data.push(row[yAxisKey].value);
			
			//Find the color for this ecocode
			for(let defKey in this.sqs.bugsEcoCodeDefinitions) {
				if(this.sqs.bugsEcoCodeDefinitions[defKey].name == ecoCodeName) {
					datasets[0].backgroundColor.push(this.sqs.bugsEcoCodeDefinitions[defKey].color);
				}
			}
		}

		const data = {
			labels: ecoCodeNames,
			datasets: datasets
		};

		let config = {
			type: 'bar',
			data: data,
			options: {
				animation: false,
				plugins: {
					title: {
						display: true,
						text: 'Eco codes'
					},
					legend: {
						display: false,
						position: 'top',
					},
					tooltip: {
						enabled: true,
						callbacks: {
							title: function(context) {
								return context[0].label;
							},
							label: function(context) {
								return contentItem.data.columns[yAxisKey].title+": "+context.formattedValue;
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
		
		  
		this.chartId = "chart-"+nanoid();
		var chartContainer = $("<canvas id='"+this.chartId+"' class='site-report-chart-container'></canvas>");
		$(this.anchorNodeSelector).append(chartContainer);

		let c = new Chart(
			document.getElementById(this.chartId),
			config
		);
	}
}

export default Visualizations;