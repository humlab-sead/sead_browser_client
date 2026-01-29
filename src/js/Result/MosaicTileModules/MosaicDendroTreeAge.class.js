import DendroBaseModule from "./DendroBaseModule.class";
import { nanoid } from "nanoid";
import Chart from 'chart.js/auto';

/**
 * MosaicDendroTreeAge - Display tree age distribution as mirrored histogram
 */
class MosaicDendroTreeAge extends DendroBaseModule {
    constructor(sqs) {
        super(sqs);
        this.title = "Tree Age Distribution";
        this.name = "mosaic-dendro-tree-age";
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
            const [treeAgeMin, treeAgeMax] = await Promise.all([
                this.fetchVariable("Tree age ≥", resultMosaic.sites, requestId, 'numeric'),
                this.fetchVariable("Tree age ≤", resultMosaic.sites, requestId, 'numeric')
            ]);

            if(!this.active) {
                if(renderIntoNode) {
                    this.sqs.setLoadingIndicator(renderIntoNode, false);
                }
                return false;
            }

            if(treeAgeMin.error || treeAgeMax.error || 
               !treeAgeMin.data || !treeAgeMax.data ||
               !treeAgeMin.data.categories || !treeAgeMax.data.categories ||
               treeAgeMin.data.categories.length === 0 || treeAgeMax.data.categories.length === 0) {
                if(renderIntoNode) {
                    this.sqs.setLoadingIndicator(renderIntoNode, false);
                }
                return false;
            }

            // Extract values for mirrored histogram
            const minValues = [];
            const maxValues = [];
            
            treeAgeMin.data.categories.forEach(cat => {
                const parsedValue = this.parseDendroNumericValue(cat.name);
                if(parsedValue !== null) {
                    for(let i = 0; i < cat.count; i++) {
                        minValues.push(parsedValue);
                    }
                }
            });
            
            treeAgeMax.data.categories.forEach(cat => {
                const parsedValue = this.parseDendroNumericValue(cat.name);
                if(parsedValue !== null) {
                    for(let i = 0; i < cat.count; i++) {
                        maxValues.push(parsedValue);
                    }
                }
            });
            
            if(minValues.length === 0 || maxValues.length === 0) {
                if(renderIntoNode) {
                    this.sqs.setLoadingIndicator(renderIntoNode, false);
                }
                return false;
            }

            this.data = {
                minValues: minValues,
                maxValues: maxValues,
                minLabel: "Tree age ≥",
                maxLabel: "Tree age ≤"
            };
            
            if(renderIntoNode) {
                this.sqs.setLoadingIndicator(renderIntoNode, false);
            }

            return this.data;

        } catch(error) {
            console.error("Error fetching tree age data:", error);
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
        
        // Find global min and max for shared axis
        const allValues = [...data.minValues, ...data.maxValues];
        allValues.sort((a, b) => a - b);
        const globalMin = allValues[0];
        const globalMax = allValues[allValues.length - 1];
        
        // Create bins with shared edges
        const bins = 20;
        const range = globalMax - globalMin;
        const binSize = range / bins;
        
        // Calculate distributions
        const minHistogram = new Array(bins).fill(0);
        const maxHistogram = new Array(bins).fill(0);
        
        data.minValues.forEach(value => {
            let binIndex = Math.floor((value - globalMin) / binSize);
            if(binIndex >= bins) binIndex = bins - 1;
            minHistogram[binIndex]++;
        });
        
        data.maxValues.forEach(value => {
            let binIndex = Math.floor((value - globalMin) / binSize);
            if(binIndex >= bins) binIndex = bins - 1;
            maxHistogram[binIndex]++;
        });
        
        // Prepare bin centers
        const labels = [];
        for(let i = 0; i < bins; i++) {
            labels.push(Math.round(globalMin + (i + 0.5) * binSize));
        }
        
        // Get SEAD colors
        const colorIndex = this.getColorIndexForVariable('Tree age (mirrored)');
        const allColors = this.sqs.color.getNiceColorScheme(10);
        const colors = [allColors[colorIndex % allColors.length], allColors[(colorIndex + 1) % allColors.length]];
        
        const wrapperHtml = `
            <div class="dendro-tile-container" id="${varId}">
                <div class="dendro-tile-header">
                    <h3 class="dendro-tile-title">Tree Age Distribution</h3>
                </div>
                <div class="dendro-tile-chart">
                    <div class="dendro-tile-chart-canvas-wrapper">
                        <canvas id="chart-${varId}"></canvas>
                    </div>
                </div>
            </div>
        `;
        $(this.renderIntoNode).append(wrapperHtml);
        
        const ctx = document.getElementById(`chart-${varId}`).getContext('2d');
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Youngest (≥)',
                        data: minHistogram,
                        backgroundColor: colors[0] + 'B3',
                        borderColor: colors[0],
                        borderWidth: 1,
                        borderRadius: 3
                    },
                    {
                        label: 'Oldest (≤)',
                        data: maxHistogram.map(v => -v),
                        backgroundColor: colors[1] + 'B3',
                        borderColor: colors[1],
                        borderWidth: 1,
                        borderRadius: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = Math.abs(context.parsed.y);
                                return context.dataset.label + ': ' + value;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Age (years)',
                            font: {
                                size: 11
                            }
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
                            },
                            callback: function(value) {
                                return Math.abs(value);
                            }
                        }
                    }
                }
            }
        });
        
        this.chartInstances.set(varId, { chart: chart, name: 'Tree Age Distribution' });

        // Add mini coverage chart
        const totalSamples = await this.getTotalSamplesCount();
        if(totalSamples) {
            const containerElement = document.getElementById(varId);
            const chartWrapperElement = containerElement.querySelector('.dendro-tile-chart');
            // Use the count of samples that have tree age data (using minValues length as they should match)
            this.renderCoverageMiniChart(chartWrapperElement, data.minValues.length, totalSamples);
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

export default MosaicDendroTreeAge;
