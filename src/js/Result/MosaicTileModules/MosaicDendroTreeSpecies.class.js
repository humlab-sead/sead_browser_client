import DendroBaseModule from "./DendroBaseModule.class";
import { nanoid } from "nanoid";
import Chart from 'chart.js/auto';

/**
 * MosaicDendroTreeSpecies - Display tree species distribution
 */
class MosaicDendroTreeSpecies extends DendroBaseModule {
    constructor(sqs) {
        super(sqs);
        this.title = "Tree Species";
        this.name = "mosaic-dendro-tree-species";
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
            const result = await this.fetchVariable("Tree species", resultMosaic.sites, requestId, 'categorical');

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

            const categories = result.data.categories.map(cat => ({
                name: cat.name,
                count: cat.count
            }));

            this.data = {
                label: 'Tree species',
                description: 'Distribution of tree species in the dataset',
                categories: categories
            };
            
            if(renderIntoNode) {
                this.sqs.setLoadingIndicator(renderIntoNode, false);
            }

            return this.data;

        } catch(error) {
            console.error("Error fetching tree species data:", error);
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
        const total = data.categories.reduce((sum, cat) => sum + cat.count, 0);
        
        if(total === 0) {
            this.sqs.setNoDataMsg(this.renderIntoNode);
            this.renderComplete = true;
            return;
        }

        // Sort categories by count (descending)
        const sortedCategories = [...data.categories].sort((a, b) => b.count - a.count);
        
        // Get colors for tree species
        let categoryColors = this.sqs.color.getNiceColorScheme(sortedCategories.length);
        if(this.sqs.config.treeSpeciesColors) {
            categoryColors = sortedCategories.map(cat => {
                const colorConfig = this.sqs.config.treeSpeciesColors.find(sc => sc.species === cat.name);
                return colorConfig ? '#' + colorConfig.color : '#999';
            });
        }

        const wrapperHtml = `
            <div class="dendro-tile-container" id="${varId}">
                <div class="dendro-tile-header">
                    <h3 class="dendro-tile-title">${data.label}</h3>
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
                labels: sortedCategories.map(cat => cat.name),
                datasets: [{
                    label: 'Samples',
                    data: sortedCategories.map(cat => cat.count),
                    backgroundColor: categoryColors,
                    borderRadius: 3,
                    minBarLength: 3
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.parsed.x + ' samples';
                            }
                        }
                    }
                },
                scales: {
                    x: {
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
                    },
                    y: {
                        ticks: {
                            font: {
                                size: 10
                            }
                        }
                    }
                }
            }
        });
        
        this.chartInstances.set(varId, { chart: chart, name: data.label });

        // Add mini coverage chart
        const totalSamples = await this.getTotalSamplesCount();
        if(totalSamples) {
            const containerElement = document.getElementById(varId);
            const chartWrapperElement = containerElement.querySelector('.dendro-tile-chart');
            this.renderCoverageMiniChart(chartWrapperElement, total, totalSamples);
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

export default MosaicDendroTreeSpecies;
