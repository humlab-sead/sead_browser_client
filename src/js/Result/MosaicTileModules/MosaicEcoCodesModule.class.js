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
        this.showChartSelector = false;
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

        // Clear previous content
        $(this.renderIntoNode).empty();

        // Create a container with a header/title bar and a dedicated chart container for Chart.js
        const varId = (typeof nanoid === 'function') ? nanoid() : Math.random().toString(36).substr(2, 9);
        const chartContainerId = `chart-container-${varId}`;
        const tileHtml = `
            <div class="eco-codes-tile-container" id="${varId}" style="display: flex; flex-direction: column; height: 100%; width: 100%;">
                <div class="eco-codes-tile-header" style="flex: 0 0 auto;">
                    <h3 class="eco-codes-tile-title" style="margin: 0; font-size: 1.2em;">${this.title}</h3>
                </div>
                <div class="eco-codes-tile-chart" id="${chartContainerId}" style="flex: 1 1 0; min-height: 200px; width: 100%; display: flex; align-items: stretch;"></div>
            </div>
        `;
        $(this.renderIntoNode).append(tileHtml);

        // Show loading indicator on the chart container only
        this.sqs.setLoadingIndicator(`#${chartContainerId}`, true);

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

        // Calculate total abundance for percentage calculation
        let totalAbundance = responseData.ecocode_groups.reduce((sum, group) => sum + group.totalAbundance, 0);

        for(let key in responseData.ecocode_groups) {
            let ecocode = responseData.ecocode_groups[key];
            let ecoCodeName = ecocode.name;
            ecoCodeNames.push(ecoCodeName);
            // Calculate percentage (0-100)
            let percent = totalAbundance > 0 ? (ecocode.totalAbundance / totalAbundance) * 100 : 0;
            percent = Math.round(percent * 10) / 10; // Round to one decimal place
            datasets[0].data.push(percent);

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
                        display: false,
                        text: ''
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
                                // Show percentage with one decimal
                                return context.formattedValue + "% of total abundance";
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
                        title: {
                            display: true,
                            text: 'Percentage (%)'
                        }
                    },
                    y: {
                        stacked: true
                    }
                }
            }
        };

        this.sqs.setLoadingIndicator(`#${chartContainerId}`, false);
        this.chartId = `chart-${varId}`;
        var chartCanvas = $(`<canvas id='${this.chartId}' style='padding:1.5em;'></canvas>`);
        $(`#${chartContainerId}`).append(chartCanvas);

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