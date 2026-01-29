import MosaicTileModule from "./MosaicTileModule.class";
import { nanoid } from "nanoid";
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import Plotly from 'plotly.js-dist-min';

/**
 * MosaicDendroDashboard - A comprehensive dashboard for displaying dendro variables
 * 
 * This module provides a visual overview of all dendro variables in the dataset,
 * including numeric ranges, binary yes/no values, and categorical distributions.
 */
class MosaicDendroDashboard extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Dendro Dashboard";
        this.name = "mosaic-dendro-dashboard";
        this.domains = ["dendrochronology"];
        this.requestId = 0;
        this.active = true;
        this.data = null;
        this.renderComplete = false;
        this.chartType = "custom";
        this.chartInstances = new Map(); // Store chart instances for export
    }

    async fetchData(renderIntoNode = null) {
        this.sqs.setNoDataMsg(renderIntoNode, false);
        
        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, true);
        }

        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        const requestId = ++this.requestId;

        // Define all variables to fetch
        const variablesToFetch = {
            categorical: ["Tree species", "Bark (B)", "EW/LW measurements"],
            numeric: ["Sapwood (Sp)", "Pith (P)", "Tree rings", "Number of analysed radii.", "Tree age ≥", "Tree age ≤"],
            ternary: ["Waney edge (W)"]
        };

        try {
            // Fetch all variables in parallel
            const allVariables = [
                ...variablesToFetch.categorical.map(v => ({ variable: v, type: 'categorical' })),
                ...variablesToFetch.numeric.map(v => ({ variable: v, type: 'numeric' })),
                ...variablesToFetch.ternary.map(v => ({ variable: v, type: 'ternary' }))
            ];
            
            const fetchPromises = allVariables.map(item => 
                this.fetchVariable(item.variable, resultMosaic.sites, requestId, item.type)
            );
            
            // Add Sample types fetch
            fetchPromises.push(this.fetchSampleTypes(resultMosaic.sites, requestId));

            const results = await Promise.all(fetchPromises);

            if(!this.active) {
                if(renderIntoNode) {
                    this.sqs.setLoadingIndicator(renderIntoNode, false);
                }
                return false;
            }

            // Process results into dashboard data structure
            const dashboardData = this.processResults(results, requestId);

            this.data = dashboardData;
            
            if(renderIntoNode) {
                this.sqs.setLoadingIndicator(renderIntoNode, false);
            }

            return dashboardData;

        } catch(error) {
            console.error("Error fetching dendro dashboard data:", error);
            if(renderIntoNode) {
                this.sqs.setLoadingIndicator(renderIntoNode, false);
            }
            return false;
        }
    }

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

    parseDendroNumericValue(value) {
        if(!value || value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim();
        
        // Filter out "Undefined" or empty strings
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
        
        // Try to parse the cleaned value
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    parseDendroBinaryValue(value) {
        if(!value || value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim();
        
        // Filter out "Undefined" or empty strings
        if(stringValue === "" || stringValue.toLowerCase() === "undefined") {
            return null;
        }

        // Strip uncertainty symbols: ?, ~, and any whitespace, then lowercase
        const cleaned = stringValue.replace(/[?~\s]/g, "").toLowerCase();
        
        // Check for yes/ja variants
        if(cleaned === "ja" || cleaned === "yes" || cleaned === "y" || cleaned === "j") {
            return "Yes";
        }
        
        // Check for no/nej variants
        if(cleaned === "nej" || cleaned === "no" || cleaned === "n") {
            return "No";
        }
        
        // If we can't parse it, return null
        return null;
    }

    parseDendroTernaryValue(value, variableName = "") {
        if(!value || value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim().toLowerCase();
        
        // Filter out empty strings
        if(stringValue === "") {
            return null;
        }

        // Handle Waney edge (W) specific values
        if(variableName === "Waney edge (W)") {
            // Yes cases: W, B
            if(stringValue === "w" || stringValue === "b") {
                return "Yes";
            }
            
            // No cases: Ej W, Nej (not W)
            if(stringValue.includes("ej w") || stringValue === "nej") {
                return "No";
            }
            
            // Maybe cases: Nära W (near W), W?, Undefined, Indeterminable, W eller nära W
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
        
        // If we can't parse it, return null
        return null;
    }

    calculateDistribution(values, min, max, bins = 20) {
        if(values.length === 0 || min === max) {
            return [];
        }

        const range = max - min;
        const binSize = range / bins;
        const histogram = new Array(bins).fill(0);

        // Count values in each bin
        values.forEach(value => {
            let binIndex = Math.floor((value - min) / binSize);
            // Handle edge case where value === max
            if(binIndex >= bins) binIndex = bins - 1;
            histogram[binIndex]++;
        });

        // Find max count for normalization
        const maxCount = Math.max(...histogram);

        // Create distribution data with normalized heights (0-100)
        return histogram.map((count, index) => ({
            binIndex: index,
            count: count,
            height: maxCount > 0 ? (count / maxCount) * 100 : 0,
            startValue: min + (index * binSize),
            endValue: min + ((index + 1) * binSize)
        }));
    }

    processResults(results, requestId) {
        const dashboardData = {
            requestId: requestId,
            numericRanges: [],
            binaryVariables: [],
            ternaryVariables: [],
            categoricalVariables: [],
            countVariables: [],
            mirroredHistogram: null,
            sampleTypes: null
        };

        // Check if we have both Tree age ≥ and Tree age ≤ for mirrored histogram
        const treeAgeMin = results.find(r => r.variable === "Tree age ≥" && !r.error);
        const treeAgeMax = results.find(r => r.variable === "Tree age ≤" && !r.error);
        
        if(treeAgeMin && treeAgeMax) {
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
            
            if(minValues.length > 0 && maxValues.length > 0) {
                dashboardData.mirroredHistogram = {
                    minValues: minValues,
                    maxValues: maxValues,
                    minLabel: "Tree age ≥",
                    maxLabel: "Tree age ≤"
                };
            }
        }

        results.forEach(result => {
            if(result.error || !result.data || !result.data.categories || result.data.categories.length === 0) {
                return; // Skip failed or empty results
            }

            // Handle sample types
            if(result.type === 'sampleTypes') {
                const categories = result.data.categories.map(cat => ({
                    name: cat.name,
                    count: cat.count
                }));

                dashboardData.sampleTypes = {
                    label: 'Sample types',
                    description: 'Distribution of sample types in the dataset',
                    categories: categories
                };
                return;
            }

            // Handle numeric variables (like Sapwood)
            if(result.type === 'numeric') {
                // Skip Tree age variables if we're creating a mirrored histogram
                if(dashboardData.mirroredHistogram && 
                   (result.variable === "Tree age ≥" || result.variable === "Tree age ≤")) {
                    return;
                }
                
                const parsedValues = [];
                let undefinedCount = 0;
                
                result.data.categories.forEach(cat => {
                    const parsedValue = this.parseDendroNumericValue(cat.name);
                    if(parsedValue !== null) {
                        // Add the value multiple times based on count
                        for(let i = 0; i < cat.count; i++) {
                            parsedValues.push(parsedValue);
                        }
                    } else {
                        // Track undefined/unparseable values
                        undefinedCount += cat.count;
                    }
                });

                if(parsedValues.length > 0) {
                    parsedValues.sort((a, b) => a - b);
                    const min = parsedValues[0];
                    const max = parsedValues[parsedValues.length - 1];
                    const median = parsedValues[Math.floor(parsedValues.length / 2)];

                    // Calculate distribution for visualization
                    const distribution = this.calculateDistribution(parsedValues, min, max);

                    dashboardData.numericRanges.push({
                        label: result.variable,
                        description: this.getVariableDescription(result.variable),
                        min: min,
                        median: median,
                        max: max,
                        count: parsedValues.length,
                        undefinedCount: undefinedCount,
                        distribution: distribution
                    });
                }
            }
            // Handle ternary variables (yes/maybe/no)
            else if(result.type === 'ternary') {
                const normalizedCategories = {};
                
                result.data.categories.forEach(cat => {
                    const normalized = this.parseDendroTernaryValue(cat.name, result.variable);
                    if(normalized !== null) {
                        if(!normalizedCategories[normalized]) {
                            normalizedCategories[normalized] = 0;
                        }
                        normalizedCategories[normalized] += cat.count;
                    }
                });

                // Ensure all three categories exist in the correct order
                const categories = ["Yes", "Maybe", "No"].map(state => ({
                    name: state,
                    count: normalizedCategories[state] || 0
                })).filter(cat => cat.count > 0);

                if(categories.length > 0) {
                    dashboardData.ternaryVariables.push({
                        label: result.variable,
                        description: this.getVariableDescription(result.variable),
                        categories: categories
                    });
                }
            }
            // Handle categorical variables
            else {
                // Determine variable type and add to appropriate category
                if(this.isBinaryVariable(result.variable)) {
                    // Parse and normalize binary values (ja/nej, yes/no variants)
                    const normalizedCategories = {};
                    
                    result.data.categories.forEach(cat => {
                        const normalized = this.parseDendroBinaryValue(cat.name);
                        if(normalized !== null) {
                            if(!normalizedCategories[normalized]) {
                                normalizedCategories[normalized] = 0;
                            }
                            normalizedCategories[normalized] += cat.count;
                        }
                    });

                    const categories = Object.entries(normalizedCategories).map(([name, count]) => ({
                        name: name,
                        count: count
                    }));

                    if(categories.length > 0) {
                        dashboardData.binaryVariables.push({
                            label: result.variable,
                            description: this.getVariableDescription(result.variable),
                            categories: categories
                        });
                    }
                } else {
                    const categories = result.data.categories.map(cat => ({
                        name: cat.name,
                        count: cat.count
                    }));

                    dashboardData.categoricalVariables.push({
                        label: result.variable,
                        description: this.getVariableDescription(result.variable),
                        categories: categories
                    });
                }
            }
        });

        return dashboardData;
    }

    isBinaryVariable(variableName) {
        const binaryVariables = [
            "Bark (B)", 
            "EW/LW measurements"
        ];
        return binaryVariables.includes(variableName);
    }

    getVariableDescription(variableName) {
        const descriptions = {
            "Tree species": "Distribution of tree species in the dataset",
            "Sample types": "Distribution of sample types in the dataset",
            "Sapwood (Sp)": "Number of sapwood rings in the sample",
            "Bark (B)": "Presence of bark on the sample",
            "Waney edge (W)": "Presence of waney edge (natural edge with bark) on the sample",
            "Pith (P)": "Number of rings from pith (center of tree) to the sample edge",
            "EW/LW measurements": "Early wood and late wood measurements available",
            "Tree rings": "Number of tree rings counted in the sample",
            "Number of analysed radii.": "Number of radii that were analyzed from the tree sample",
            "Tree age ≥": "Minimum estimated age of the tree",
            "Estimated felling year": "The estimated year when the tree was felled"
        };
        return descriptions[variableName] || "";
    }

    calculateTotalSamples(results) {
        // Find the result with the most samples (typically Tree species has all samples)
        let maxSamples = 0;
        results.forEach(result => {
            if(result.data && result.data.categories) {
                const total = result.data.categories.reduce((sum, cat) => sum + cat.count, 0);
                if(total > maxSamples) {
                    maxSamples = total;
                }
            }
        });
        return maxSamples;
    }





    /**
     * Get total number of samples from the sample types data
     * Returns null if not available
     */
    getTotalSamplesCount() {
        if(!this.data || !this.data.sampleTypes || !this.data.sampleTypes.categories) {
            return null;
        }
        return this.data.sampleTypes.categories.reduce((sum, cat) => sum + cat.count, 0);
    }

    /**
     * Render a mini coverage chart showing what proportion of total samples have this variable
     * @param {HTMLElement} container - Container to append the mini-chart to
     * @param {number} samplesWithVariable - Number of samples that have this variable
     * @param {number} totalSamples - Total number of samples across all selected sites
     */
    renderCoverageMiniChart(container, samplesWithVariable, totalSamples) {
        if(!totalSamples || totalSamples === 0) {
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
        
        this.drawCoverageLine(ctx, canvas.width, canvas.height, percentageWith / 100);
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
     * Render numeric range variable (e.g., Estimated felling year)
     * Shows min, median, and max values in a visual format with distribution
     */
    renderNumericRange(container, variable) {
        if(variable.min == null || variable.max == null) {
            console.log('[DEBUG RENDER] Skipping numeric range for', variable.label, 'due to missing min/max');
            return;
        }

        const varId = nanoid();
        const median = variable.median || Math.round((variable.min + variable.max) / 2);
        const range = variable.max - variable.min;
        const unit = this.getRangeUnit(variable.label);

        // Build coverage text
        let coverageText = `Coverage: ${variable.count || 0} samples`;
        if(variable.undefinedCount && variable.undefinedCount > 0) {
            coverageText += ` (${variable.undefinedCount} undefined)`;
        }

        // Create wrapper div
        const wrapperHtml = `
            <div class="dendro-dashboard-variable" id="${varId}">
                <div id="" class="dendro-dashboard-variable-label">
                    <div class="label-with-info-symbol">
                        ${variable.label}
                        <i class="fa fa-info-circle dendro-dashboard-info-icon" data-tooltip="${variable.description || ''}" title="${variable.description || ''}"></i>
                    </div>
                    <button class="dendro-dashboard-download-btn" data-chart-id="${varId}" title="Download chart as PNG">
                        <i class="fa fa-download"></i>
                    </button>
                </div>
                <div class="dendro-dashboard-chart-wrapper">
                    <div class="grid-variable-chart-container">
                        <canvas id="chart-${varId}"></canvas>
                    </div>
                </div>
            </div>
        `;
        $(container).append(wrapperHtml);

        // Get SEAD color scheme - use a larger palette and pick specific color for this variable
        const colorIndex = this.getColorIndexForVariable(variable.label);
        const colors = this.sqs.color.getNiceColorScheme(10);
        const mainColor = colors[colorIndex % colors.length];

        // Prepare histogram data from distribution
        const labels = [];
        const data = [];
        if(variable.distribution && variable.distribution.length > 0) {
            variable.distribution.forEach(bin => {
                labels.push(Math.round((bin.startValue + bin.endValue) / 2));
                data.push(bin.count);
            });
        }

        const ctx = document.getElementById(`chart-${varId}`).getContext('2d');
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Samples',
                    data: data,
                    backgroundColor: mainColor + 'B3', // 70% opacity
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
        
        this.chartInstances.set(varId, { chart: chart, name: variable.label });

        // Add mini coverage chart
        const totalSamples = this.getTotalSamplesCount();
        if(totalSamples) {
            const containerElement = document.getElementById(varId);
            const chartWrapperElement = containerElement.querySelector('.dendro-dashboard-chart-wrapper');
            this.renderCoverageMiniChart(chartWrapperElement, variable.count || 0, totalSamples);
        }
    }

    getRangeUnit(label) {
        if(label.includes('year') || label.includes('Year')) {
            return 'years';
        }
        if(label.includes('ring') || label.includes('Ring')) {
            return 'rings';
        }
        return '';
    }

    /**
     * Get a unique color index for a variable to ensure distinct colors across charts
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
            'Tree species': 8
        };
        return colorMap[variableName] || 0;
    }

    /**
     * Render mirrored histogram for Tree age ≥ and Tree age ≤
     * Shows minimum age above baseline and maximum age below baseline
     */
    renderMirroredHistogram(container, data) {
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
        
        // Get SEAD colors - use specific indices for mirrored histogram
        const colorIndex = this.getColorIndexForVariable('Tree age (mirrored)');
        const allColors = this.sqs.color.getNiceColorScheme(10);
        const colors = [allColors[colorIndex % allColors.length], allColors[(colorIndex + 1) % allColors.length]];
        
        const wrapperHtml = `
            <div class="dendro-dashboard-variable dendro-dashboard-variable-mirrored" id="${varId}">
                <div class="dendro-dashboard-variable-label">
                    <div class="label-with-info-symbol">
                        Tree Age Distribution
                        <i class="fa fa-info-circle dendro-dashboard-info-icon" 
                        data-tooltip="Mirrored histogram showing youngest age (top) and oldest age (bottom)" 
                        title="Mirrored histogram showing youngest age (top) and oldest age (bottom)"></i>
                    </div>
                    <button class="dendro-dashboard-download-btn" data-chart-id="${varId}" title="Download chart as PNG">
                        <i class="fa fa-download"></i>
                    </button>
                </div>
                <div class="dendro-dashboard-chart-wrapper">
                    <div class="grid-variable-chart-container">
                        <canvas id="chart-${varId}"></canvas>
                    </div>
                </div>
            </div>
        `;
        $(container).append(wrapperHtml);
        
        const ctx = document.getElementById(`chart-${varId}`).getContext('2d');
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Youngest (≥)',
                        data: minHistogram,
                        backgroundColor: colors[0] + 'B3', // 70% opacity
                        borderColor: colors[0],
                        borderWidth: 1,
                        borderRadius: 3
                    },
                    {
                        label: 'Oldest (≤)',
                        data: maxHistogram.map(v => -v), // Negative for mirrored effect
                        backgroundColor: colors[1] + 'B3', // 70% opacity
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
                        display: false
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
                                return Math.abs(value); // Show absolute values
                            }
                        }
                    }
                }
            }
        });
        
        this.chartInstances.set(varId, { chart: chart, name: 'Tree Age Distribution' });

        // Add mini coverage chart
        // The number of samples with tree age data is the length of minValues or maxValues
        const totalSamples = this.getTotalSamplesCount();
        if(totalSamples) {
            const containerElement = document.getElementById(varId);
            const chartWrapperElement = containerElement.querySelector('.dendro-dashboard-chart-wrapper');
            // Use the count of samples that have tree age data (using minValues length as they should match)
            this.renderCoverageMiniChart(chartWrapperElement, data.minValues.length, totalSamples);
        }
    }

    /**
     * Render binary variable (e.g., EW/LW measurements: Yes/No)
     * Shows horizontal stacked bar graph with percentages
     */
    renderBinaryVariable(container, variable) {
        if(!variable.categories || variable.categories.length === 0) {
            return;
        }

        const varId = nanoid();
        const total = variable.categories.reduce((sum, cat) => sum + cat.count, 0);
        
        if(total === 0) {
            return;
        }

        // Get colors from Color class - use specific color for this variable
        const colorIndex = this.getColorIndexForVariable(variable.label);
        const allColors = this.sqs.color.getNiceColorScheme(10);
        const colors = variable.categories.map((cat, idx) => 
            allColors[(colorIndex + idx) % allColors.length]
        );

        const wrapperHtml = `
            <div class="dendro-dashboard-variable" id="${varId}">
                <div class="dendro-dashboard-variable-label">
                    <div class="label-with-info-symbol">
                        ${variable.label}
                        <i class="fa fa-info-circle dendro-dashboard-info-icon" data-tooltip="${variable.description || ''}" title="${variable.description || ''}"></i>
                    </div>
                    <button class="dendro-dashboard-download-btn" data-chart-id="${varId}" title="Download chart as PNG">
                        <i class="fa fa-download"></i>
                    </button>
                </div>
                <div class="dendro-dashboard-chart-wrapper">
                    <div class="grid-variable-chart-container">
                        <div class="dendro-dashboard-stacked-bar-container">
                            <canvas id="chart-${varId}"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        `;
        $(container).append(wrapperHtml);

        // Draw custom stacked bar chart on canvas
        const canvas = document.getElementById(`chart-${varId}`);
        const ctx = canvas.getContext('2d');
        
        // Set canvas size
        const canvasContainer = canvas.parentElement;
        canvas.width = canvasContainer.clientWidth;
        canvas.height = 60;
        
        this.drawStackedBar(ctx, canvas.width, canvas.height, variable.categories, colors, total);
        
        // Store reference for export
        this.chartInstances.set(varId, { canvas: canvas, name: variable.label });

        // Add mini coverage chart
        const totalSamples = this.getTotalSamplesCount();
        if(totalSamples) {
            const containerElement = document.getElementById(varId);
            const chartWrapperElement = containerElement.querySelector('.dendro-dashboard-chart-wrapper');
            this.renderCoverageMiniChart(chartWrapperElement, total, totalSamples);
        }
    }

    /**
     * Render ternary variable (e.g., Waney edge: Yes/Maybe/No)
     * Shows horizontal stacked bar graph with three states
     */
    renderTernaryVariable(container, variable, halfHeight = false) {
        if(!variable.categories || variable.categories.length === 0) {
            return;
        }

        const varId = nanoid();
        const total = variable.categories.reduce((sum, cat) => sum + cat.count, 0);
        
        if(total === 0) {
            return;
        }

        // Get SEAD colors for ternary (Yes/Maybe/No) - use specific color base for this variable
        const colorIndex = this.getColorIndexForVariable(variable.label);
        const allColors = this.sqs.color.getNiceColorScheme(10, "#2d5e8d", {
            vibrancy: 0.4,
            seed: 691
        });
        const colorMap = {
            'Yes': allColors[colorIndex % allColors.length],
            'Maybe': allColors[(colorIndex + 1) % allColors.length], 
            'No': allColors[(colorIndex + 2) % allColors.length]
        };

        const wrapperHtml = `
            <div class="dendro-dashboard-variable${halfHeight ? ' dendro-dashboard-variable-half-height' : ''}" id="${varId}">
                <div class="dendro-dashboard-variable-label">
                    <div class="label-with-info-symbol">
                        ${variable.label}
                        <i class="fa fa-info-circle dendro-dashboard-info-icon" data-tooltip="${variable.description || ''}" title="${variable.description || ''}"></i>
                    </div>
                    <button class="dendro-dashboard-download-btn" data-chart-id="${varId}" title="Download chart as PNG">
                        <i class="fa fa-download"></i>
                    </button>
                </div>
                <div class="dendro-dashboard-chart-wrapper">
                    <div class="grid-variable-chart-container">
                        <div class="dendro-dashboard-stacked-bar-container">
                            <canvas id="chart-${varId}"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        `;
        $(container).append(wrapperHtml);

        // Draw custom stacked bar chart on canvas
        const canvas = document.getElementById(`chart-${varId}`);
        const ctx = canvas.getContext('2d');
        
        // Set canvas size
        const canvasContainer = canvas.parentElement;
        canvas.width = canvasContainer.clientWidth;
        canvas.height = 60;
        
        // Map categories to colors
        const categoryColors = variable.categories.map(cat => colorMap[cat.name] || '#999');
        
        this.drawStackedBar(ctx, canvas.width, canvas.height, variable.categories, categoryColors, total);
        
        // Store reference for export
        this.chartInstances.set(varId, { canvas: canvas, name: variable.label });

        // Add mini coverage chart
        const totalSamples = this.getTotalSamplesCount();
        if(totalSamples) {
            const containerElement = document.getElementById(varId);
            const chartWrapperElement = containerElement.querySelector('.dendro-dashboard-chart-wrapper');
            this.renderCoverageMiniChart(chartWrapperElement, total, totalSamples);
        }
    }

    /**
     * Render categorical variable (e.g., Tree species, Sample type)
     * Shows horizontal bar chart with color-coded bars
     */
    renderCategoricalVariable(container, variable) {
        if(!variable.categories || variable.categories.length === 0) {
            return;
        }

        const varId = nanoid();
        const total = variable.categories.reduce((sum, cat) => sum + cat.count, 0);
        
        if(total === 0) {
            return;
        }

        // Sort categories by count (descending so largest is on top)
        const sortedCategories = [...variable.categories].sort((a, b) => b.count - a.count);
        
        // Use sorted categories directly (largest on top in horizontal chart)
        const displayCategories = sortedCategories;
        
        // Get colors for tree species if applicable
        let categoryColors = this.sqs.color.getNiceColorScheme(displayCategories.length);
        if(variable.label === "Tree species" && this.sqs.config.treeSpeciesColors) {
            categoryColors = displayCategories.map(cat => {
                const colorConfig = this.sqs.config.treeSpeciesColors.find(sc => sc.species === cat.name);
                return colorConfig ? '#' + colorConfig.color : '#999';
            });
        }

        const wrapperHtml = `
            <div class="dendro-dashboard-variable dendro-dashboard-variable-categorical" id="${varId}">
                <div class="dendro-dashboard-variable-label">
                    <div class="label-with-info-symbol">
                        ${variable.label}
                        <i class="fa fa-info-circle dendro-dashboard-info-icon" data-tooltip="${variable.description || ''}" title="${variable.description || ''}"></i>
                    </div>
                    <button class="dendro-dashboard-download-btn" data-chart-id="${varId}" title="Download chart as PNG">
                        <i class="fa fa-download"></i>
                    </button>
                </div>
                <div class="dendro-dashboard-chart-wrapper">
                    <div class="grid-variable-chart-container">
                        <canvas id="chart-${varId}"></canvas>
                    </div>
                </div>
            </div>
        `;
        $(container).append(wrapperHtml);

        const ctx = document.getElementById(`chart-${varId}`).getContext('2d');
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: displayCategories.map(cat => cat.name),
                datasets: [{
                    label: 'Samples',
                    data: displayCategories.map(cat => cat.count),
                    backgroundColor: categoryColors,
                    borderRadius: 3,
                    percentages: displayCategories.map(cat => ((cat.count / total) * 100).toFixed(1)),
                    minBarLength: 3  // Ensure even bars with count of 1 are visible
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
        
        this.chartInstances.set(varId, { chart: chart, name: variable.label });

        // Add mini coverage chart
        const totalSamples = this.getTotalSamplesCount();
        if(totalSamples) {
            const containerElement = document.getElementById(varId);
            const chartWrapperElement = containerElement.querySelector('.dendro-dashboard-chart-wrapper');
            this.renderCoverageMiniChart(chartWrapperElement, total, totalSamples);
        }
    }

    /**
     * Render sample types as a horizontal bar chart using Chart.js
     */
    renderSampleTypesBar(container, variable, halfHeight = false) {
        if(!variable.categories || variable.categories.length === 0) {
            return;
        }

        const varId = nanoid();
        const total = variable.categories.reduce((sum, cat) => sum + cat.count, 0);
        
        if(total === 0) {
            return;
        }

        // Sort categories by count (descending for horizontal bar chart - largest on top)
        const sortedCategories = [...variable.categories].sort((a, b) => b.count - a.count);
        
        // Get colors with nice vibrancy
        const colors = this.sqs.color.getNiceColorScheme(sortedCategories.length, "#2d5e8d", { vibrancy: 0.7 });

        const wrapperHtml = `
            <div class="dendro-dashboard-variable dendro-dashboard-variable-bar${halfHeight ? ' dendro-dashboard-variable-half-height' : ''}" id="${varId}">
                <div class="dendro-dashboard-variable-label">
                    <div class="label-with-info-symbol">
                        ${variable.label}
                        <i class="fa fa-info-circle dendro-dashboard-info-icon" data-tooltip="${variable.description || ''}" title="${variable.description || ''}"></i>
                    </div>
                    <button class="dendro-dashboard-download-btn" data-chart-id="${varId}" title="Download chart as PNG">
                        <i class="fa fa-download"></i>
                    </button>
                </div>
                <div class="dendro-dashboard-chart-wrapper">
                    <div class="grid-variable-chart-container">
                        <canvas id="chart-${varId}"></canvas>
                    </div>
                </div>
            </div>
        `;
        $(container).append(wrapperHtml);

        const ctx = document.getElementById(`chart-${varId}`).getContext('2d');
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedCategories.map(cat => cat.name),
                datasets: [{
                    label: 'Samples',
                    data: sortedCategories.map(cat => cat.count),
                    backgroundColor: colors,
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
                                size: halfHeight ? 10 : 11
                            }
                        },
                        ticks: {
                            font: {
                                size: halfHeight ? 9 : 10
                            }
                        },
                        beginAtZero: true,
                        grid: {
                            color: '#e0e0e0'
                        }
                    },
                    y: {
                        ticks: {
                            font: {
                                size: halfHeight ? 9 : 10
                            }
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
        
        this.chartInstances.set(varId, { chart: chart, name: variable.label });

        // Add mini coverage chart - for sample types, all samples have a type (100% coverage)
        const totalSamples = this.getTotalSamplesCount();
        if(totalSamples) {
            const containerElement = document.getElementById(varId);
            const chartWrapperElement = containerElement.querySelector('.dendro-dashboard-chart-wrapper');
            this.renderCoverageMiniChart(chartWrapperElement, total, totalSamples);
        }
    }

    /**
     * Render a simple count variable (e.g., number of datasets)
     */
    renderCountVariable(container, variable) {
        const varId = nanoid();
        
        const html = `
            <div class="dendro-dashboard-variable dendro-dashboard-variable-count" id="${varId}">
                <div class="dendro-dashboard-count-card">
                    <div class="dendro-dashboard-count-value">${variable.count || 0}</div>
                    <div class="dendro-dashboard-count-label">${variable.label}</div>
                </div>
            </div>
        `;

        $(container).append(html);
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

        // Clear container
        $(this.renderIntoNode).empty();

        // Create main dashboard container
        const dashboardId = nanoid();
        const dashboardHtml = `
            <div class="dendro-dashboard-container" id="${dashboardId}">
                <div class="dendro-dashboard-grid">
                    <!-- Variables will be inserted here -->
                </div>
            </div>
        `;
        
        $(this.renderIntoNode).append(dashboardHtml);
        const gridContainer = $(`#${dashboardId} .dendro-dashboard-grid`);

        // Render mirrored histogram for tree ages if available
        if(data.mirroredHistogram) {
            this.renderMirroredHistogram(gridContainer, data.mirroredHistogram);
        }
        
        // Render sample types and waney edge in a split container (half height each)
        if(data.sampleTypes || (data.ternaryVariables && data.ternaryVariables.length > 0)) {
            const splitContainerId = nanoid();
            const splitContainerHtml = `<div class="dendro-dashboard-split-container" id="${splitContainerId}"></div>`;
            $(gridContainer).append(splitContainerHtml);
            const splitContainer = $(`#${splitContainerId}`);
            
            // Render sample types in top half
            if(data.sampleTypes) {
                this.renderSampleTypesBar(splitContainer, data.sampleTypes, true);
            }
            
            // Render waney edge in bottom half (if it exists)
            const waneyEdge = data.ternaryVariables?.find(v => v.label === "Waney edge (W)");
            if(waneyEdge) {
                this.renderTernaryVariable(splitContainer, waneyEdge, true);
            }
        }

        // Render numeric range variables
        if(data.numericRanges) {
            data.numericRanges.forEach(variable => {
                this.renderNumericRange(gridContainer, variable);
            });
        }

        // Render binary variables
        if(data.binaryVariables) {
            data.binaryVariables.forEach(variable => {
                this.renderBinaryVariable(gridContainer, variable);
            });
        }

        // Render ternary variables (excluding waney edge since it's already rendered)
        if(data.ternaryVariables) {
            data.ternaryVariables.forEach(variable => {
                if(variable.label !== "Waney edge (W)") {
                    this.renderTernaryVariable(gridContainer, variable);
                }
            });
        }

        // Render categorical variables
        if(data.categoricalVariables) {
            data.categoricalVariables.forEach(variable => {
                this.renderCategoricalVariable(gridContainer, variable);
            });
        }

        // Render count variables
        if(data.countVariables) {
            data.countVariables.forEach(variable => {
                this.renderCountVariable(gridContainer, variable);
            });
        }

        // Add tooltips for info icons
        this.addTooltips();

        this.sqs.resultManager.showLoadingIndicator(false);
        this.renderComplete = true;
    }

    /**
     * Draw a stacked horizontal bar directly on canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @param {Array} categories - Array of {name, count} objects
     * @param {Array} colors - Array of colors for each category
     * @param {number} total - Total count across all categories
     */
    drawStackedBar(ctx, width, height, categories, colors, total) {
        const barHeight = 40;
        const barY = (height - barHeight) / 2;
        const borderRadius = 3;
        
        let currentX = 0;
        
        categories.forEach((cat, idx) => {
            const segmentWidth = (cat.count / total) * width;
            const percentage = ((cat.count / total) * 100).toFixed(1);
            
            // Draw rounded rectangle segment
            ctx.fillStyle = colors[idx];
            
            // Determine which corners to round based on position
            const isFirst = idx === 0;
            const isLast = idx === categories.length - 1;
            
            this.drawRoundedRect(
                ctx,
                currentX,
                barY,
                segmentWidth,
                barHeight,
                borderRadius,
                isFirst,  // round left corners
                isLast    // round right corners
            );
            
            // Draw label if segment is wide enough
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
     * Draw a rounded rectangle on canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Rectangle width
     * @param {number} height - Rectangle height
     * @param {number} radius - Corner radius
     * @param {boolean} roundLeft - Round left corners
     * @param {boolean} roundRight - Round right corners
     */
    drawRoundedRect(ctx, x, y, width, height, radius, roundLeft, roundRight) {
        ctx.beginPath();
        
        // Top left corner
        if(roundLeft) {
            ctx.moveTo(x + radius, y);
        } else {
            ctx.moveTo(x, y);
        }
        
        // Top edge and top right corner
        if(roundRight) {
            ctx.lineTo(x + width - radius, y);
            ctx.arcTo(x + width, y, x + width, y + radius, radius);
        } else {
            ctx.lineTo(x + width, y);
        }
        
        // Right edge and bottom right corner
        if(roundRight) {
            ctx.lineTo(x + width, y + height - radius);
            ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        } else {
            ctx.lineTo(x + width, y + height);
        }
        
        // Bottom edge and bottom left corner
        if(roundLeft) {
            ctx.lineTo(x + radius, y + height);
            ctx.arcTo(x, y + height, x, y + height - radius, radius);
        } else {
            ctx.lineTo(x, y + height);
        }
        
        // Left edge and back to start
        if(roundLeft) {
            ctx.lineTo(x, y + radius);
            ctx.arcTo(x, y, x + radius, y, radius);
        } else {
            ctx.lineTo(x, y);
        }
        
        ctx.closePath();
        ctx.fill();
    }

    downloadChart(chartId) {
        const chartData = this.chartInstances.get(chartId);
        if(!chartData) {
            console.error('Chart not found:', chartId);
            return;
        }
        
        // Handle Plotly charts
        if(chartData.plotly) {
            Plotly.downloadImage(chartData.elementId, {
                format: 'png',
                filename: `${chartData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart`
            });
        } else if(chartData.chart) {
            // Chart.js charts (for other chart types)
            const { chart, name } = chartData;
            const url = chart.toBase64Image();
            const link = document.createElement('a');
            link.download = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart.png`;
            link.href = url;
            link.click();
        } else if(chartData.canvas) {
            // Custom canvas charts (binary/ternary)
            const { canvas, name } = chartData;
            const url = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chart.png`;
            link.href = url;
            link.click();
        }
    }

    addTooltips() {
        $('.dendro-dashboard-info-icon').each((idx, el) => {
            const tooltip = $(el).data('tooltip');
            if(tooltip) {
                $(el).attr('title', tooltip);
            }
        });

        // Setup download button listeners
        $('.dendro-dashboard-download-btn').off('click').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const chartId = $(e.currentTarget).data('chart-id');
            this.downloadChart(chartId);
        });
    }

    async update() {
        console.log('[Dendro Dashboard] Updating dashboard data...');
        this.renderComplete = false;
        await this.render(this.renderIntoNode);
        this.renderComplete = true;
    }

    async unrender() {
        return new Promise((resolve, reject) => {
            this.waitForRenderCompleteInterval = setInterval(() => {
                if(this.renderComplete) {
                    clearInterval(this.waitForRenderCompleteInterval);
    
                    // Clean up Chart.js instances
                    this.chartInstances.forEach((chartData, id) => {
                        if(chartData.chart && typeof chartData.chart.destroy === 'function') {
                            chartData.chart.destroy();
                        }
                    });
                    this.chartInstances.clear();

                    // Remove event listeners
                    $('.dendro-dashboard-download-btn').off('click');
                    $('.dendro-dashboard-info-icon').off();

                    // Mark as inactive
                    this.active = false;

                    // Clear the render node
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
}

export default MosaicDendroDashboard;
