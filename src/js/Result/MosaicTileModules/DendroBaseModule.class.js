import MosaicTileModule from "./MosaicTileModule.class";
import { nanoid } from "nanoid";
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import Plotly from 'plotly.js-dist-min';

/**
 * DendroBaseModule - Base class for dendrochronology tile modules
 * 
 * Provides shared utility functions for parsing and processing dendro data
 */
class DendroBaseModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.domains = ["dendrochronology"];
        this.requestId = 0;
        this.active = true;
        this.data = null;
        this.renderComplete = false;
        this.chartInstances = new Map();
        this.coverageCharts = new Map(); // Store coverage chart data for resize
        this.showChartSelector = false; // Dendro modules don't need chart selector
        this.resizeHandler = this.handleResize.bind(this);
    }

    /**
     * Parse numeric dendro values handling special formats
     */
    parseDendroNumericValue(value) {
        if(!value || value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim();
        
        if(stringValue === "" || stringValue.toLowerCase() === "undefined") {
            return null;
        }

        // Handle greater than (>28 becomes 29)
        if(stringValue.startsWith(">")) {
            const num = parseFloat(stringValue.substring(1));
            return isNaN(num) ? null : num + 1;
        }

        // Handle less than (<28 becomes 27)
        if(stringValue.startsWith("<")) {
            const num = parseFloat(stringValue.substring(1));
            return isNaN(num) ? null : num - 1;
        }

        // Handle ranges (71-72 becomes 71)
        if(stringValue.includes("-")) {
            const parts = stringValue.split("-");
            const num = parseFloat(parts[0]);
            return isNaN(num) ? null : num;
        }

        // Strip out uncertainty symbols: ?, ~, and any whitespace
        const cleaned = stringValue.replace(/[?~\s]/g, "");
        
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    /**
     * Parse binary dendro values (Yes/No)
     */
    parseDendroBinaryValue(value) {
        if(!value || value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim();
        
        if(stringValue === "" || stringValue.toLowerCase() === "undefined") {
            return null;
        }

        const cleaned = stringValue.replace(/[?~\s]/g, "").toLowerCase();
        
        if(cleaned === "ja" || cleaned === "yes" || cleaned === "y" || cleaned === "j") {
            return "Yes";
        }
        
        if(cleaned === "nej" || cleaned === "no" || cleaned === "n") {
            return "No";
        }
        
        return null;
    }

    /**
     * Parse ternary dendro values (Yes/Maybe/No)
     */
    parseDendroTernaryValue(value, variableName = "") {
        if(!value || value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim().toLowerCase();
        
        if(stringValue === "") {
            return null;
        }

        if(variableName === "Waney edge (W)") {
            if(stringValue === "w" || stringValue === "b") {
                return "Yes";
            }
            
            if(stringValue.includes("ej w") || stringValue === "nej") {
                return "No";
            }
            
            if(stringValue.includes("nära") || 
               stringValue.includes("near") ||
               stringValue.includes("?") ||
               stringValue === "undefined" ||
               stringValue === "indeterminable" ||
               stringValue.includes("eller") ||
               stringValue.includes("or")) {
                return "Maybe";
            }
        }
        
        return null;
    }

    /**
     * Calculate distribution for numeric values
     */
    calculateDistribution(values, min, max, bins = 20) {
        if(values.length === 0 || min === max) {
            return [];
        }

        const range = max - min;
        const binSize = range / bins;
        const histogram = new Array(bins).fill(0);

        values.forEach(value => {
            let binIndex = Math.floor((value - min) / binSize);
            if(binIndex >= bins) binIndex = bins - 1;
            histogram[binIndex]++;
        });

        const maxCount = Math.max(...histogram);

        return histogram.map((count, index) => ({
            binIndex: index,
            count: count,
            height: maxCount > 0 ? (count / maxCount) * 100 : 0,
            startValue: min + (index * binSize),
            endValue: min + ((index + 1) * binSize)
        }));
    }

    /**
     * Fetch variable data from API
     */
    async fetchVariable(variableName, sites, requestId, type = 'categorical') {
        const requestBody = {
            sites: sites,
            requestId: requestId,
            variable: variableName
        };

        try {
            const response = await super.fetchData("/dendro/dynamicchart", JSON.stringify(requestBody));
            
            if(!response) {
                return { variable: variableName, data: null, error: true, type: type };
            }

            const data = await response.json();
            
            return { variable: variableName, data: data, error: false, type: type };
        } catch(error) {
            console.warn(`Failed to fetch ${variableName}:`, error);
            return { variable: variableName, data: null, error: true, type: type };
        }
    }

    /**
     * Fetch sample types data
     */
    async fetchSampleTypes(sites, requestId) {
        const requestBody = {
            sites: sites,
            requestId: requestId
        };

        try {
            const response = await super.fetchData("/site/sampletypes", JSON.stringify(requestBody));
            
            if(!response) {
                return { variable: 'Sample types', data: null, error: true, type: 'categorical' };
            }

            const data = await response.json();
            
            return { variable: 'Sample types', data: data, error: false, type: 'sampleTypes' };
        } catch(error) {
            console.warn('Failed to fetch Sample types:', error);
            return { variable: 'Sample types', data: null, error: true, type: 'categorical' };
        }
    }

    /**
     * Get color index for consistent coloring across modules
     */
    getColorIndexForVariable(variableName) {
        const colorMap = {
            'Sapwood (Sp)': 0,
            'Pith (P)': 1,
            'Tree rings': 2,
            'Number of analysed radii.': 3,
            'Tree age (mirrored)': 4,
            'Bark (B)': 5,
            'EW/LW measurements': 6,
            'Waney edge (W)': 7,
            'Tree species': 8,
            'Sample types': 9
        };
        return colorMap[variableName] || 0;
    }

    /**
     * Get total number of samples from the sample types data
     * Returns null if not available
     */
    async getTotalSamplesCount() {
        try {
            let resultMosaic = this.sqs.resultManager.getModule("mosaic");
            const result = await this.fetchSampleTypes(resultMosaic.sites, ++this.requestId);
            
            if(result.error || !result.data || !result.data.categories) {
                return null;
            }
            
            return result.data.categories.reduce((sum, cat) => sum + cat.count, 0);
        } catch(error) {
            console.warn('Failed to fetch total sample count:', error);
            return null;
        }
    }

    /**
     * Render a mini coverage chart showing what proportion of total samples have this variable
     * @param {HTMLElement} container - Container to append the mini-chart to
     * @param {number} samplesWithVariable - Number of samples that have this variable
     * @param {number} totalSamples - Total number of samples across all selected sites
     */
    renderCoverageMiniChart(container, samplesWithVariable, totalSamples) {
        if(!totalSamples || totalSamples === 0) {
            console.log('Total samples is zero or undefined, cannot render coverage chart.');
            return;
        }

        const percentageWith = ((samplesWithVariable / totalSamples) * 100).toFixed(1);

        const miniChartId = nanoid();
        const miniChartHtml = `
            <div class="dendro-mini-chart-container">
                <div class="dendro-mini-chart-label">Sample Coverage</div>
                <div class="dendro-mini-chart-wrapper">
                    <canvas id="mini-chart-${miniChartId}" height="16"></canvas>
                </div>
                <div class="dendro-mini-chart-percentage">${percentageWith}%</div>
            </div>
        `;
        
        $(container).append(miniChartHtml);

        // Draw custom line with rounded endpoints
        const canvas = document.getElementById(`mini-chart-${miniChartId}`);
        const ctx = canvas.getContext('2d');
        
        // Set canvas size to match container
        const canvasContainer = canvas.parentElement;
        canvas.width = canvasContainer.clientWidth;
        canvas.height = 16;
        
        // Store chart data for resize handling
        this.coverageCharts.set(miniChartId, {
            canvas: canvas,
            percentage: percentageWith / 100
        });
        
        // Add resize listener if this is the first coverage chart
        if(this.coverageCharts.size === 1) {
            window.addEventListener('resize', this.resizeHandler);
        }
        
        this.drawCoverageLine(ctx, canvas.width, canvas.height, percentageWith / 100);
    }

    /**
     * Handle window resize by redrawing all coverage charts
     */
    handleResize() {
        this.coverageCharts.forEach((chartData, id) => {
            const { canvas, percentage } = chartData;
            const canvasContainer = canvas.parentElement;
            
            if(!canvasContainer) {
                return;
            }
            
            // Update canvas width to match container
            canvas.width = canvasContainer.clientWidth;
            canvas.height = 16;
            
            // Redraw the chart
            const ctx = canvas.getContext('2d');
            this.drawCoverageLine(ctx, canvas.width, canvas.height, percentage);
        });
    }

    /**
     * Draw a coverage line with rounded endpoints
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @param {number} percentage - Percentage filled (0-1)
     */
    drawCoverageLine(ctx, width, height, percentage) {
        const lineY = height / 2;
        const lineHeight = 6;
        const padding = 0;
        const lineWidth = width - (padding * 2);
        const filledWidth = lineWidth * percentage;
        
        // Draw background line (gray)
        ctx.fillStyle = '#E0E0E0';
        ctx.beginPath();
        ctx.roundRect(padding, lineY - lineHeight / 2, lineWidth, lineHeight, lineHeight / 2);
        ctx.fill();
        
        // Draw filled line (blue) with rounded endpoints
        if(filledWidth > 0) {
            ctx.fillStyle = '#143261';
            ctx.beginPath();
            ctx.roundRect(padding, lineY - lineHeight / 2, filledWidth, lineHeight, lineHeight / 2);
            ctx.fill();
        }
    }

    /**
     * Draw a rounded rectangle on canvas
     */
    drawRoundedRect(ctx, x, y, width, height, radius, roundLeft, roundRight) {
        ctx.beginPath();
        
        if(roundLeft) {
            ctx.moveTo(x + radius, y);
        } else {
            ctx.moveTo(x, y);
        }
        
        if(roundRight) {
            ctx.lineTo(x + width - radius, y);
            ctx.arcTo(x + width, y, x + width, y + radius, radius);
        } else {
            ctx.lineTo(x + width, y);
        }
        
        if(roundRight) {
            ctx.lineTo(x + width, y + height - radius);
            ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        } else {
            ctx.lineTo(x + width, y + height);
        }
        
        if(roundLeft) {
            ctx.lineTo(x + radius, y + height);
            ctx.arcTo(x, y + height, x, y + height - radius, radius);
        } else {
            ctx.lineTo(x, y + height);
        }
        
        if(roundLeft) {
            ctx.lineTo(x, y + radius);
            ctx.arcTo(x, y, x + radius, y, radius);
        } else {
            ctx.lineTo(x, y);
        }
        
        ctx.closePath();
        ctx.fill();
    }

    /**
     * Draw stacked bar chart on canvas
     */
    drawStackedBar(ctx, width, height, categories, colors, total) {
        const barHeight = 40;
        const barY = (height - barHeight) / 2;
        const borderRadius = 3;
        
        let currentX = 0;
        
        categories.forEach((cat, idx) => {
            const segmentWidth = (cat.count / total) * width;
            const percentage = ((cat.count / total) * 100).toFixed(1);
            
            ctx.fillStyle = colors[idx];
            
            const isFirst = idx === 0;
            const isLast = idx === categories.length - 1;
            
            this.drawRoundedRect(
                ctx,
                currentX,
                barY,
                segmentWidth,
                barHeight,
                borderRadius,
                isFirst,
                isLast
            );
            
            if(parseFloat(percentage) > 12) {
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 11px Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                const text = `${cat.name} ${percentage}%`;
                const textX = currentX + segmentWidth / 2;
                const textY = barY + barHeight / 2;
                
                ctx.fillText(text, textX, textY);
            }
            
            currentX += segmentWidth;
        });
    }

    /**
     * Create a donut chart using Plotly
     * This provides better label handling and responsiveness
     */
    async createDonutChart(elementId, categories, colors, total, variableName) {
        const values = categories.map(cat => cat.count);
        const labels = categories.map(cat => cat.name);
        const percentages = categories.map(cat => ((cat.count / total) * 100).toFixed(1));
        
        // Create custom text for labels showing both name and percentage
        const textLabels = categories.map((cat, i) => `${cat.name}<br>${percentages[i]}%`);
        
        const data = [{
            values: values,
            labels: labels,
            text: percentages.map(p => `${p}%`),
            textposition: 'outside',
            textinfo: 'text',
            hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>Percentage: %{percent}<extra></extra>',
            type: 'pie',
            hole: 0.6,
            marker: {
                colors: colors,
                line: {
                    color: '#fff',
                    width: 2
                }
            },
            pull: 0.01,
            textfont: {
                size: 11,
                color: '#333'
            }
        }];
        
        const layout = {
            showlegend: true,
            legend: {
                orientation: 'h',
                x: 0.5,
                y: -0.2,
                xanchor: 'center',
                yanchor: 'top',
                font: {
                    size: 11
                }
            },
            margin: {
                l: 20,
                r: 20,
                t: 20,
                b: 60
            },
            autosize: true,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)'
        };
        
        const config = {
            responsive: true,
            displayModeBar: false
        };
        
        await Plotly.newPlot(elementId, data, layout, config);
        
        return { plotly: true, elementId: elementId };
    }

    /**
     * Download chart as PNG
     */
    downloadChart(chartId) {
        const chartData = this.chartInstances.get(chartId);
        if(!chartData) {
            console.error('Chart not found:', chartId);
            return;
        }
        
        if(chartData.plotly) {
            // Plotly chart
            Plotly.downloadImage(chartData.elementId, {
                format: 'png',
                filename: `${chartData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart`
            });
        } else if(chartData.chart) {
            const { chart, name } = chartData;
            const url = chart.toBase64Image();
            const link = document.createElement('a');
            link.download = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart.png`;
            link.href = url;
            link.click();
        } else if(chartData.canvas) {
            const { canvas, name } = chartData;
            const url = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart.png`;
            link.href = url;
            link.click();
        }
    }

    async unrender() {
        return new Promise((resolve, reject) => {
            this.waitForRenderCompleteInterval = setInterval(() => {
                if(this.renderComplete) {
                    clearInterval(this.waitForRenderCompleteInterval);
    
                    this.chartInstances.forEach((chartData, id) => {
                        if(chartData.chart && typeof chartData.chart.destroy === 'function') {
                            chartData.chart.destroy();
                        }
                    });
                    this.chartInstances.clear();

                    // Remove resize listener and clear coverage charts
                    if(this.coverageCharts.size > 0) {
                        window.removeEventListener('resize', this.resizeHandler);
                    }
                    this.coverageCharts.clear();

                    $('.dendro-tile-download-btn').off('click');

                    this.active = false;

                    if(this.renderIntoNode != null) {
                        $(this.renderIntoNode).empty();
                        resolve();
                    } else {
                        console.warn("Render into node was null when trying to unrender!");
                        reject();
                    }
                }
            }, 100);
        });
    }

    getAvailableExportFormats() {
        return ["png"];
    }

    formatDataForExport(data, format = "json") {
        if(format === "png") {
            // Get the first chart instance (there should only be one per module)
            const chartEntry = Array.from(this.chartInstances.values())[0];
            if(!chartEntry) {
                console.error('No chart found for export');
                return;
            }
            
            if(chartEntry.plotly) {
                // Plotly chart
                Plotly.downloadImage(chartEntry.elementId, {
                    format: 'png',
                    filename: `${chartEntry.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart`
                });
            } else if(chartEntry.chart) {
                // Chart.js chart
                const url = chartEntry.chart.toBase64Image();
                const link = document.createElement('a');
                link.download = `${chartEntry.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart.png`;
                link.href = url;
                link.click();
            } else if(chartEntry.canvas) {
                // Custom canvas chart
                const url = chartEntry.canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `${chartEntry.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart.png`;
                link.href = url;
                link.click();
            }
        }
        return data;
    }
}

export default DendroBaseModule;
