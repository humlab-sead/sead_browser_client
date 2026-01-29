import DendroBaseModule from "./DendroBaseModule.class";
import { nanoid } from "nanoid";

/**
 * MosaicDendroBinaryVariable - Display binary dendro variable (Yes/No)
 * Generic module that can handle any binary dendro variable
 */
class MosaicDendroBinaryVariable extends DendroBaseModule {
    constructor(sqs, variableName, title, description) {
        super(sqs);
        this.variableName = variableName;
        this.title = title || variableName;
        this.description = description || '';
        this.name = "mosaic-dendro-" + variableName.toLowerCase().replace(/[^a-z0-9]/g, '-');
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
            const result = await this.fetchVariable(this.variableName, resultMosaic.sites, requestId, 'categorical');

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

            // Parse and normalize binary values
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

            if(categories.length === 0) {
                if(renderIntoNode) {
                    this.sqs.setLoadingIndicator(renderIntoNode, false);
                }
                return false;
            }

            this.data = {
                label: this.variableName,
                description: this.description,
                categories: categories
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
        const total = data.categories.reduce((sum, cat) => sum + cat.count, 0);
        
        if(total === 0) {
            this.sqs.setNoDataMsg(this.renderIntoNode);
            this.renderComplete = true;
            return;
        }

        const colorIndex = this.getColorIndexForVariable(data.label);
        const allColors = this.sqs.color.getNiceColorScheme(10);
        const colors = data.categories.map((cat, idx) => 
            allColors[(colorIndex + idx) % allColors.length]
        );

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

        // Draw stacked bar chart
        const canvas = document.getElementById(`chart-${varId}`);
        const ctx = canvas.getContext('2d');
        
        const canvasContainer = canvas.parentElement;
        canvas.width = canvasContainer.clientWidth;
        canvas.height = 60;
        
        this.drawStackedBar(ctx, canvas.width, canvas.height, data.categories, colors, total);
        
        this.chartInstances.set(varId, { canvas: canvas, name: data.label });

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

export default MosaicDendroBinaryVariable;
