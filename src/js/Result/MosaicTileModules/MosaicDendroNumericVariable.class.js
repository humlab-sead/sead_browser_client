import DendroBaseModule from "./DendroBaseModule.class";
import { nanoid } from "nanoid";
import Chart from 'chart.js/auto';

/**
 * MosaicDendroNumericVariable - Display numeric dendro variable as histogram
 * Generic module that can handle any numeric dendro variable
 */
class MosaicDendroNumericVariable extends DendroBaseModule {
    constructor(sqs, variableName, title, description) {
        super(sqs);
        this.variableName = variableName;
        this.title = title || variableName;
        this.description = description || '';
        this.name = "mosaic-dendro-" + variableName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        this.chartType = "bar";
    }

    async fetchData(renderIntoNode = null) {
        this.sqs.setNoDataMsg(renderIntoNode, false);
        
        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, true);
        }

        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        const requestId = ++this.requestId;

        try {
            const result = await this.fetchVariable(this.variableName, resultMosaic.sites, requestId, 'numeric');

            if(!this.active) {
                if(renderIntoNode) {
                    this.sqs.setLoadingIndicator(renderIntoNode, false);
                }
                return false;
            }

            if(result.error || !result.data || !result.data.categories || result.data.categories.length === 0) {
                if(renderIntoNode) {
                    this.sqs.setLoadingIndicator(renderIntoNode, false);
                }
                return false;
            }

            const parsedValues = [];
            let undefinedCount = 0;
            
            result.data.categories.forEach(cat => {
                const parsedValue = this.parseDendroNumericValue(cat.name);
                if(parsedValue !== null) {
                    for(let i = 0; i < cat.count; i++) {
                        parsedValues.push(parsedValue);
                    }
                } else {
                    undefinedCount += cat.count;
                }
            });

            if(parsedValues.length === 0) {
                if(renderIntoNode) {
                    this.sqs.setLoadingIndicator(renderIntoNode, false);
                }
                return false;
            }

            parsedValues.sort((a, b) => a - b);
            const min = parsedValues[0];
            const max = parsedValues[parsedValues.length - 1];
            const median = parsedValues[Math.floor(parsedValues.length / 2)];

            const distribution = this.calculateDistribution(parsedValues, min, max);

            this.data = {
                label: this.variableName,
                description: this.description,
                min: min,
                median: median,
                max: max,
                count: parsedValues.length,
                undefinedCount: undefinedCount,
                distribution: distribution
            };
            
            if(renderIntoNode) {
                this.sqs.setLoadingIndicator(renderIntoNode, false);
            }

            return this.data;

        } catch(error) {
            console.error(`Error fetching ${this.variableName} data:`, error);
            if(renderIntoNode) {
                this.sqs.setLoadingIndicator(renderIntoNode, false);
            }
            return false;
        }
    }

    async render(renderIntoNode) {
        super.render();
        this.renderComplete = false;
        this.active = true;
        this.renderIntoNode = renderIntoNode;

        const data = await this.fetchData(renderIntoNode);

        if(!this.active) {
            this.sqs.resultManager.showLoadingIndicator(false);
            this.renderComplete = true;
            return false;
        }

        if(data === false || !data) {
            this.sqs.setNoDataMsg(this.renderIntoNode);
            this.sqs.resultManager.showLoadingIndicator(false);
            this.renderComplete = true;
            return;
        }

        $(this.renderIntoNode).empty();

        const varId = nanoid();
        
        const colorIndex = this.getColorIndexForVariable(data.label);
        const colors = this.sqs.color.getNiceColorScheme(10);
        const mainColor = colors[colorIndex % colors.length];

        // Prepare histogram data from distribution
        const labels = [];
        const chartData = [];
        if(data.distribution && data.distribution.length > 0) {
            data.distribution.forEach(bin => {
                labels.push(Math.round((bin.startValue + bin.endValue) / 2));
                chartData.push(bin.count);
            });
        }

        const wrapperHtml = `
            <div class="dendro-tile-container" id="${varId}">
                <div class="dendro-tile-header">
                    <h3 class="dendro-tile-title">${data.label}</h3>
                </div>
                <div class="dendro-tile-charts">
                    <canvas id="chart-${varId}" class="tile-chart-container"></canvas>
                    <div id="coverage-${varId}" class="tile-coverage-container"></div>
                </div>
            </div>
        `;
        $(this.renderIntoNode).append(wrapperHtml);

        const ctx = document.getElementById(`chart-${varId}`).getContext('2d');
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Samples',
                    data: chartData,
                    backgroundColor: mainColor + 'B3',
                    borderColor: mainColor,
                    borderWidth: 1,
                    borderRadius: 3,
                    minBarLength: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.parsed.y + ' samples';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: false
                        },
                        ticks: {
                            font: {
                                size: 10
                            }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Sample Count',
                            font: {
                                size: 11
                            }
                        },
                        ticks: {
                            font: {
                                size: 10
                            }
                        },
                        beginAtZero: true
                    }
                }
            }
        });
        
        this.chartInstances.set(varId, { chart: chart, name: data.label });

        // Add mini coverage chart
        const totalSamples = await this.getTotalSamplesCount();
        if(totalSamples) {
            const coverageContainer = document.getElementById(`coverage-${varId}`);
            this.renderCoverageMiniChart(coverageContainer, data.count || 0, totalSamples);
        }

        this.sqs.resultManager.showLoadingIndicator(false);
        this.renderComplete = true;
    }

    async update() {
        this.renderComplete = false;
        await this.render(this.renderIntoNode);
        this.renderComplete = true;
    }
}

export default MosaicDendroNumericVariable;
