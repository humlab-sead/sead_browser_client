import MosaicTileModule from "./MosaicTileModule.class";
import { nanoid } from "nanoid";
import {
    Chart,
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Title,
    Tooltip,
    Legend
  } from 'chart.js';
  
  Chart.register(
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Title,
    Tooltip,
    Legend
  );

class MosaicEcoCodesModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "BUGS eco codes";
		this.name = "mosaic-ecocodes";
		this.domains = [];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.requestId = 0;
        this.renderComplete = false;
        this.chartType = "chartjs";
    }

    async render(renderIntoNode = null) {
        super.render();
        this.renderComplete = false;
        if(renderIntoNode) {
            this.renderIntoNode = renderIntoNode;
        }

        if(renderIntoNode == null && this.renderIntoNode == null) {
            console.warn("Tried to render "+this.name+" without a node to render into!");
            return false;
        }

        this.active = true;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        this.sqs.setLoadingIndicator(this.renderIntoNode, true);

        let ecoCodeNames = [];
		let datasets = [];
		
		datasets.push({
			label: "Eco codes",
			data: [],
			backgroundColor: []
		});

        let response = await fetch(this.sqs.config.dataServerAddress+"/graphs/ecocodes", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(resultMosaic.sites)
        });
        let responseData = await response.json();
		this.data = responseData;

        responseData.ecocode_groups.sort(function(a, b) {
            return b.totalAbundance - a.totalAbundance;
        });

        for(let key in responseData.ecocode_groups) {
            let ecocode = responseData.ecocode_groups[key];
            let ecoCodeName = ecocode.name;
            ecoCodeNames.push(ecoCodeName);
            datasets[0].data.push(ecocode.totalAbundance);
            
            for(let defKey in this.sqs.bugsEcoCodeDefinitions) {
                if(this.sqs.bugsEcoCodeDefinitions[defKey].ecocode_definition_id == ecocode.ecocode_definition_id) {
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
                                return context.formattedValue+" counts of taxa fall within this eco code.";
							}
						}
					}
				},
				responsive: true,
                indexAxis: 'y', // Set the index axis to 'y' for vertical bars
                maintainAspectRatio: false,
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
		
		this.sqs.setLoadingIndicator(this.renderIntoNode, false);
		this.chartId = "chart-"+nanoid();
		var chartContainer = $("<canvas id='"+this.chartId+"' style='padding:1.5em;'></canvas>");
		$(this.renderIntoNode).append(chartContainer);
        
		let c = new Chart(
			document.getElementById(this.chartId),
			config
		);
        
        this.renderComplete = true;
    }

    async update() {
        this.render();
    }


	formatDataForExport(data, format = "json") {
		
        if(format == "csv") {
            let includeColumns = ["abbreviation", "ecocode_definition_id", "name", "totalAbundance"];

            //remove columns that we don't want to include
            data = data.ecocode_groups.map((group) => {
                let newItem = {};
                includeColumns.forEach((column) => {
                    newItem[column] = group[column];
                });
                return newItem;
            });
        }

        return data;
    }
}

export default MosaicEcoCodesModule;