import DendroBaseModule from "./DendroBaseModule.class";
import { nanoid } from "nanoid";

/**
 * MosaicDendroWaneyEdge - Display Waney edge ternary variable (Yes/Maybe/No)
 */
class MosaicDendroWaneyEdge extends DendroBaseModule {
    constructor(sqs) {
        super(sqs);
        this.title = "Waney Edge";
        this.name = "mosaic-dendro-waney-edge";
        this.chartType = "custom";
    }

    async fetchData(renderIntoNode = null) {
        this.sqs.setNoDataMsg(renderIntoNode, false);
        
        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, true);
        }

        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        const requestId = ++this.requestId;

        try {
            const result = await this.fetchVariable("Waney edge (W)", resultMosaic.sites, requestId, 'ternary');

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

            // Parse and normalize ternary values
            const normalizedCategories = {};
            
            result.data.categories.forEach(cat => {
                const normalized = this.parseDendroTernaryValue(cat.name, "Waney edge (W)");
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

            if(categories.length === 0) {
                if(renderIntoNode) {
                    this.sqs.setLoadingIndicator(renderIntoNode, false);
                }
                return false;
            }

            this.data = {
                label: 'Waney edge (W)',
                description: 'Presence of waney edge (natural edge with bark) on the sample',
                categories: categories
            };
            
            if(renderIntoNode) {
                this.sqs.setLoadingIndicator(renderIntoNode, false);
            }

            return this.data;

        } catch(error) {
            console.error("Error fetching waney edge data:", error);
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

        // Get SEAD colors for ternary (Yes/Maybe/No)
        const colorIndex = this.getColorIndexForVariable(data.label);
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
            <div class="dendro-tile-container" id="${varId}">
                <div class="dendro-tile-header">
                    <h3 class="dendro-tile-title">${data.label}</h3>
                </div>
                <div class="dendro-tile-charts">
                    <div id="chart-${varId}" class="tile-chart-container"></div>
                    <div id="coverage-${varId}" class="tile-coverage-container"></div>
                </div>
            </div>
        `;
        $(this.renderIntoNode).append(wrapperHtml);

        // Map categories to colors
        const categoryColors = data.categories.map(cat => colorMap[cat.name] || '#999');
        
        // Create Plotly donut chart
        const chartRef = await this.createDonutChart(`chart-${varId}`, data.categories, categoryColors, total, data.label);
        
        this.chartInstances.set(varId, { plotly: true, elementId: `chart-${varId}`, name: data.label });

        // Add mini coverage chart
        const totalSamples = await this.getTotalSamplesCount();
        if(totalSamples) {
            const coverageContainer = document.getElementById(`coverage-${varId}`);
            this.renderCoverageMiniChart(coverageContainer, total, totalSamples);
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

export default MosaicDendroWaneyEdge;
