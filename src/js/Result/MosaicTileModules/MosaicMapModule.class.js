import MosaicTileModule from "./MosaicTileModule.class";
import ResultMap from "../ResultMap.class";

class MosaicMapModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Site distribution";
		this.name = "mosaic-map";
        this.domains = ["*"];
        this.resultMap = null;
        this.pendingRequestPromise = null;
        this.active = true;
        this.renderComplete = false;
        this.chartType = "openlayers";
        this.showChartSelector = false;
    }

    async render(renderIntoNode) {
        super.render();
        this.renderComplete = false;
        this.active = true;
        this.renderIntoNode = renderIntoNode;

        // Clear previous content
        $(this.renderIntoNode).empty();

        // Create a container with a header/title bar and a dedicated map container
        const varId = (typeof nanoid === 'function') ? nanoid() : Math.random().toString(36).substr(2, 9);
        const mapContainerId = `map-container-${varId}`;
        const tileHtml = `
            <div class="map-tile-container" id="${varId}" style="display: flex; flex-direction: column; height: 100%; width: 100%;">
                <div class="map-tile-header" style="flex: 0 0 auto;">
                    <h3 class="map-tile-title" style="margin: 0; font-size: 1.2em;">${this.title}</h3>
                </div>
                <div class="map-tile-map" id="${mapContainerId}" style="flex: 1 1 0; min-height: 200px; width: 100%;"></div>
            </div>
        `;
        $(this.renderIntoNode).append(tileHtml);

        // Render the map into the inner map container
        if(this.resultMap == null) {
            this.resultMap = new ResultMap(this.sqs.resultManager, `#${mapContainerId}`, false, true);
        } else {
            // If already exists, update the container reference
            this.resultMap.renderIntoNode = `#${mapContainerId}`;
        }

        await this.resultMap.fetchData();
        if(this.resultMap != null) {
            this.data = this.resultMap.renderData;
        }
        else {
            console.warn("Map unrendered before data was fetched.");
        }
        this.renderComplete = true;
    }

    async fetchData() {

    }

    async update() {
        if(this.resultMap != null) {
            this.resultMap.update();
        }
        else {
            this.render(this.renderIntoNode);
        }
	}

    getAvailableExportFormats() {
        return ["json", "csv", "mapToImage"];
    }
    
}

export default MosaicMapModule;