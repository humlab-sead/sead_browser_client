import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";
import ThinSectionViewer from "../../../ThinSectionViewer/ThinSectionViewer.class";

/*
* Class: MosaicThinSectionAnalysisModule
*
* The microphotographs, e.g. of petrographic thin sections, of the samples at the sites in the result: a gallery to pick
* images from, and a view to inspect, zoom, compare and export the picked ones, which is the ThinSectionViewer.
* The data is from the JSON API server's /sample-images/sites.
*/
class MosaicThinSectionAnalysisModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Microphotographs";
        this.description = "Microphotographs, e.g. of petrographic thin sections, of the samples at the sites in the result. Select images to inspect them side by side, adjust and zoom them, or export them for STON. The metadata recorded for an image is shown with it, and an image without any is marked as that.";
        this.name = "mosaic-thin-section-analysis";
        this.domains = ["ceramic", "geoarchaeology"];
        this.requestId = 0;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.renderComplete = false;
        this.chartType = "html";
        this.showChartSelector = false;
        this.viewer = null;
    }

    async fetchData(renderIntoNode = null) {
        const requestId = ++this.requestId;
        const resultMosaic = this.sqs.resultManager.getModule("mosaic");
        const siteIds = resultMosaic.getResultSiteIds();
        if(siteIds.length == 0) {
            //No sites, so no images - and no use in asking
            return { requestId: requestId, data: [] };
        }
        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, true);
        }
        let response = null;
        try {
            response = await super.fetchData("/sample-images/sites", JSON.stringify({ site_ids: siteIds }));
        }
        catch(error) {
            console.warn("Could not fetch the microphotographs", error);
        }
        if(renderIntoNode) {
            this.sqs.setLoadingIndicator(renderIntoNode, false);
        }
        if(!response) {
            return false;
        }
        return {
            requestId: requestId,
            data: await response.json()
        };
    }

    getImageKeys(images) {
        return images.map(image => image.sample_image_id).join(",");
    }

    destroyViewer() {
        if(this.viewer) {
            this.viewer.destroy();
            this.viewer = null;
        }
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
        this.destroyViewer();
        $(this.renderIntoNode).empty();
        const varId = nanoid();
        const chartContainerId = "chart-container-"+varId;
        $(this.renderIntoNode).append("<div class='mosaic-tile-content' id='"+varId+"'><div class='mosaic-tile-chart thin-section-tile-chart' id='"+chartContainerId+"'></div></div>");

        const result = await this.fetchData("#"+chartContainerId);
        if(!result) {
            this.sqs.setErrorIndicator("#"+chartContainerId, "Could not fetch the microphotographs");
            this.renderComplete = true;
            return;
        }
        if(result.requestId != this.requestId) {
            return; //A newer render has taken over
        }
        this.data = result.data;

        this.setMosaicTileSubtitle(this.getSubtitle(this.data));
        this.viewer = new ThinSectionViewer(this.sqs, {
            emptyMessage: "No microphotographs for the sites in this result.",
            exportFilenameBase: "sead_microphotographs"
        });
        this.viewer.render("#"+chartContainerId, this.data);
        this.renderComplete = true;
    }

    getSubtitle(images) {
        if(images.length == 0) {
            return "";
        }
        const siteCount = new Set(images.map(image => image.site_id)).size;
        return images.length.toLocaleString("en-GB")+(images.length == 1 ? " image" : " images")+" from "+siteCount.toLocaleString("en-GB")+(siteCount == 1 ? " site" : " sites");
    }

    /*
    * Function: update
    * The result has changed. The viewer is left as it is if the images are the same, so someone inspecting some of them
    * isn't thrown out of it.
    */
    async update() {
        if(!this.viewer || !this.renderIntoNode) {
            return this.render();
        }
        const result = await this.fetchData();
        if(!result) {
            this.sqs.setErrorIndicator(this.renderIntoNode, "Could not fetch the microphotographs");
            return;
        }
        if(result.requestId != this.requestId) {
            return;
        }
        if(this.getImageKeys(result.data) == this.getImageKeys(this.data || [])) {
            return;
        }
        this.data = result.data;
        this.setMosaicTileSubtitle(this.getSubtitle(this.data));
        this.viewer.setImages(this.data);
    }

    async unrender() {
        this.destroyViewer();
        return super.unrender();
    }

    getAvailableExportFormats() {
        return [];
    }

    exportCallback() {
        if(this.viewer) {
            this.viewer.exportCallback();
        }
    }
}

export default MosaicThinSectionAnalysisModule;
