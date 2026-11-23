import { nanoid } from "nanoid";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Parser } from "@json2csv/plainjs";
import { applySharpness, SHARPNESS_DEFAULT } from "./ImageSharpness.js";

//The height of the caption under the image of a card, which holds the site and sample names and the metadata
const CAPTION_HEIGHT = 64;

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/*
* Class: ThinSectionViewer
*
* A gallery of microphotographs, e.g. of petrographic thin sections, to pick from, and an inspect view to look at the
* picked ones side by side: draggable and resizable cards, row, column and grid layouts, brightness, contrast, saturation
* and sharpness adjustments, a zoom lens, and an export of the images to STON.
*
* It is shown by the thin section tile of the result mosaic and by the site report, which each give it a container and
* the list of images to show. An image is an object as delivered by the JSON API server's /sample-images endpoints:
* sample_image_id, image_name, site_id, site_name, sample_name, thumb_url, full_url and metadata, which is null when no
* metadata is recorded for the image, or has magnification, field_of_view_mm, polarisation, resin_type, camera_specs
* and original_file_name. The gallery shows the thumbnails, and the inspect view, the zoom and the export use the images
* in full size.
*
* Whether metadata is missing is always shown, never left out silently.
*/
class ThinSectionViewer {
    /*
    * Parameters:
    * sqs - The SEAD query system.
    * options.embedded - Whether the viewer sits in a page, with a height of its own, rather than fills a tile.
    * options.emptyMessage - What to say when there are no images.
    * options.exportFilenameBase - What the downloaded files are named after.
    */
    constructor(sqs, options = {}) {
        this.sqs = sqs;
        this.embedded = options.embedded === true;
        this.emptyMessage = options.emptyMessage || "No microphotographs.";
        this.exportFilenameBase = options.exportFilenameBase || "sead_microphotographs";
        this.viewerId = nanoid();
        this.images = [];
        this.selectedImages = new Set(); //The keys of the images picked in the gallery
        this.body = null;
        this.currentView = "gallery";
        this.currentLayout = null;
        this.lastDesktopWidth = 0;
        this.lastDesktopHeight = 0;
        this._resizeObserver = null;
        this.modal = null; //The node the viewer is moved into while expanded, see openModal()
        this.modalPlaceholder = null;
        this._modalKeyHandler = null;
        this.zoomToolActive = false;
        this.zoomLensSize = 40;
        this.zoomScale = 4;
        this.zoomLens = null;
        this.zoomOverlay = null;
        this.zoomCanvas = null;
        this.zoomCtx = null;
        this.zoomBoundBody = null;
        this.zoomBoundDesktop = null;
        this.zoomWheelDeltaRemainder = 0;
        this.zoomPinchStartDistance = null;
        this.zoomPinchStartScale = 4;
        this.zoomLabelVisibleUntil = 0;
        this.zoomLabelHideTimer = null;
    }

    /*
    * Function: render
    * Shows the viewer in the container, with the images it has been given by setImages(), if any.
    */
    render(container, images = null) {
        if(images) {
            this.images = images;
        }
        this.leaveInspect();
        this.closeModal();
        this.container = $(container);
        this.container.empty();
        this.body = $("<div class='tsa-body' id='tsa-body-"+this.viewerId+"'></div>");
        this.body.toggleClass("tsa-body--embedded", this.embedded);
        this.container.append(this.body);
        //The button is in both the gallery and the inspect view, which are rendered anew, the body is not
        this.body.on("click", ".tsa-expand-btn", () => {
            if(this.modal) {
                this.closeModal();
            }
            else {
                this.openModal();
            }
        });
        this.renderGallery();
    }

    renderExpandButton() {
        return "<button type='button' class='tsa-expand-btn sqs-btn'></button>";
    }

    updateExpandButtons() {
        if(!this.body) {
            return;
        }
        const expanded = this.modal != null;
        this.body.find(".tsa-expand-btn")
            .html(expanded
                ? "<i class='fa fa-compress' aria-hidden='true'></i> Close"
                : "<i class='fa fa-expand' aria-hidden='true'></i> Expand")
            .attr("title", expanded ? "Back to the page (Esc)" : "Show the microphotographs over the whole page")
            .attr("aria-pressed", expanded ? "true" : "false");
    }

    /*
    * Function: openModal
    * Moves the viewer out of its place in the page into a layer over the page, which leaves only the header visible,
    * where it keeps the view it was in. closeModal() puts it back.
    */
    openModal() {
        if(this.modal || !this.body) {
            return;
        }
        //Keeps the room of the viewer in the page, so that the page doesn't jump
        this.modalPlaceholder = $("<div class='tsa-modal-placeholder'></div>").css("height", this.body.outerHeight()+"px");
        this.body.before(this.modalPlaceholder);
        this.modal = $("<div class='tsa-modal' role='dialog' aria-modal='true' aria-label='Microphotographs'><div class='tsa-modal-frame'></div></div>");
        //Next to the dialogs, so that they come over it, see ThinSectionViewer.scss
        const dialog = $("#popover-dialog");
        if(dialog.length) {
            dialog.before(this.modal);
        }
        else {
            $("body").append(this.modal);
        }
        $("body").addClass("tsa-modal-open");
        this.modal.find(".tsa-modal-frame").append(this.body);
        this.body.addClass("tsa-body--modal");
        //A click on the dimmed margin around the viewer closes it
        this.modal.on("mousedown", evt => {
            if(evt.target === this.modal[0]) {
                this.closeModal();
            }
        });
        //Esc closes it, unless it is meant for a dialog opened over it, e.g. that of the export
        this._modalKeyHandler = evt => {
            if(evt.key == "Escape" && !$("#popover-dialog").is(":visible")) {
                this.closeModal();
            }
        };
        document.addEventListener("keydown", this._modalKeyHandler, true);
        this.updateExpandButtons();
        this.relayout();
    }

    closeModal() {
        if(!this.modal) {
            return;
        }
        document.removeEventListener("keydown", this._modalKeyHandler, true);
        this._modalKeyHandler = null;
        if(this.body) {
            this.body.removeClass("tsa-body--modal");
            if(this.modalPlaceholder) {
                this.modalPlaceholder.replaceWith(this.body);
            }
        }
        if(this.modalPlaceholder) {
            this.modalPlaceholder.remove();
            this.modalPlaceholder = null;
        }
        this.modal.remove();
        this.modal = null;
        $("body").removeClass("tsa-modal-open");
        this.hideZoomPreview();
        this.updateExpandButtons();
        this.relayout();
    }

    /*
    * Function: relayout
    * Fits the images of the inspect view anew to its size, if they are in one of the layouts.
    */
    relayout() {
        if(this.currentView != "inspect" || !this.currentLayout) {
            return;
        }
        const desktopSelector = "#tsa-desktop-"+this.viewerId;
        this.applyLayout(this.currentLayout, desktopSelector, false);
        const desktop = $(desktopSelector)[0];
        if(desktop) {
            this.lastDesktopWidth = desktop.clientWidth;
            this.lastDesktopHeight = desktop.clientHeight;
        }
    }

    /*
    * Function: setImages
    * Replaces the images. Those picked which are no longer there are dropped, and the view goes back to the gallery.
    */
    setImages(images) {
        this.images = images || [];
        const keys = new Set(this.images.map(image => this.getImageKey(image)));
        this.selectedImages.forEach(key => {
            if(!keys.has(key)) {
                this.selectedImages.delete(key);
            }
        });
        if(this.body) {
            this.renderGallery();
        }
    }

    getImages() {
        return this.images;
    }

    /*
    * Function: destroy
    * Lets go of everything the viewer holds outside its own nodes: observers, handlers on the document and image blobs.
    */
    destroy() {
        this.leaveInspect();
        this.closeModal();
        if(this.body) {
            this.body.remove();
            this.body = null;
        }
    }

    getImageKey(image) {
        return String(image.sample_image_id);
    }

    getImageByKey(key) {
        return this.images.find(image => this.getImageKey(image) == key);
    }

    getThumbUrl(image) {
        return this.sqs.config.dataServerAddress+"/"+image.thumb_url;
    }

    getFullUrl(image) {
        return this.sqs.config.dataServerAddress+"/"+image.full_url;
    }

    formatNumber(value) {
        return String(parseFloat(Number(value).toFixed(3)));
    }

    /*
    * Function: describeMetadata
    * The metadata of an image as text: a summary line, a line on resin and camera, and the fields which are not recorded.
    * An image without a metadata record is flagged as that.
    */
    describeMetadata(image) {
        const metadata = image.metadata;
        if(!metadata) {
            return { recorded: false, summary: "no metadata recorded", details: "", missing: [] };
        }
        const summaryParts = [];
        const missing = [];
        if(metadata.magnification) {
            summaryParts.push(metadata.magnification);
        }
        else {
            missing.push("magnification");
        }
        if(metadata.field_of_view_mm != null && metadata.field_of_view_mm !== "") {
            summaryParts.push(this.formatNumber(metadata.field_of_view_mm)+" mm field");
        }
        else {
            missing.push("field of view");
        }
        if(metadata.polarisation) {
            summaryParts.push(metadata.polarisation);
        }
        else {
            missing.push("polarisation");
        }
        const detailParts = [];
        if(metadata.resin_type) {
            detailParts.push(metadata.resin_type);
        }
        else {
            missing.push("resin");
        }
        if(metadata.camera_specs) {
            detailParts.push(metadata.camera_specs);
        }
        else {
            missing.push("camera");
        }
        return {
            recorded: true,
            summary: summaryParts.join(" · "),
            details: detailParts.join(" · "),
            missing: missing
        };
    }

    /*
    * Function: getMetadataTooltip
    * All the metadata of an image, one field to a line.
    */
    getMetadataTooltip(image) {
        const metadata = image.metadata;
        const lines = [image.site_name+" – "+image.sample_name];
        if(!metadata) {
            lines.push("No metadata recorded");
            return lines.join("\n");
        }
        const field = (label, value) => lines.push(label+": "+(value != null && value !== "" ? value : "not recorded"));
        field("Magnification", metadata.magnification);
        field("Field of view", metadata.field_of_view_mm != null && metadata.field_of_view_mm !== "" ? this.formatNumber(metadata.field_of_view_mm)+" mm" : null);
        field("Polarisation", metadata.polarisation);
        field("Resin", metadata.resin_type);
        field("Camera", metadata.camera_specs);
        if(metadata.original_file_name) {
            lines.push("Original file: "+metadata.original_file_name);
        }
        return lines.join("\n");
    }

    /*
    * Function: renderCaption
    * The site and sample names, and the metadata, which go under an image.
    */
    renderCaption(image) {
        const description = this.describeMetadata(image);
        let html = "<div class='tsa-caption' title='"+escapeHtml(this.getMetadataTooltip(image))+"'>";
        html += "<div class='tsa-caption-site'>"+escapeHtml(image.site_name)+"</div>";
        html += "<div class='tsa-caption-sample'>"+escapeHtml(image.sample_name)+"</div>";
        if(!description.recorded) {
            html += "<div class='tsa-caption-meta tsa-caption-missing'><i class='fa fa-exclamation-triangle' aria-hidden='true'></i> "+description.summary+"</div>";
        }
        else {
            //What is not recorded is said next to what is, where a long camera description doesn't cut it off
            html += "<div class='tsa-caption-meta'>"+escapeHtml(description.summary);
            if(description.missing.length > 0) {
                html += (description.summary ? " " : "")+"<span class='tsa-caption-missing'>not recorded: "+escapeHtml(description.missing.join(", "))+"</span>";
            }
            html += "</div>";
            html += "<div class='tsa-caption-meta'>"+escapeHtml(description.details)+"</div>";
        }
        html += "</div>";
        return html;
    }

    renderGallery() {
        this.leaveInspect();
        this.currentView = "gallery";
        const body = this.body;
        body.empty();

        if(!this.images.length) {
            body.html("<p class='tsa-empty'>"+escapeHtml(this.emptyMessage)+"</p>");
            return;
        }

        let html = "<div class='tsa-gallery-header'>";
        html += "<p class='tsa-gallery-hint'>Select the images you wish to inspect and then <button type='button' class='tsa-inspect-btn tsa-inspect-btn--inline sqs-btn' id='tsa-inspect-btn-hint-"+this.viewerId+"' disabled><i class='fa fa-search-plus' aria-hidden='true'></i> Inspect selected</button></p>";
        html += this.renderExpandButton();
        html += "</div>";
        html += "<div class='tsa-gallery-scroll'><div class='tsa-gallery-grid'>";
        this.images.forEach(image => {
            const key = this.getImageKey(image);
            const selected = this.selectedImages.has(key) ? "tsa-selected" : "";
            html += "<div class='tsa-gallery-item "+selected+"' data-key='"+escapeHtml(key)+"' tabindex='0' role='checkbox' aria-checked='"+(selected ? "true" : "false")+"'>";
            html += "<div class='tsa-gallery-imgwrap'>";
            html += "<img src='"+escapeHtml(this.getThumbUrl(image))+"' alt='"+escapeHtml(image.sample_name+", "+image.site_name)+"' loading='lazy'>";
            html += "<div class='tsa-gallery-overlay'><i class='fa fa-check' aria-hidden='true'></i></div>";
            html += "</div>";
            html += this.renderCaption(image);
            html += "</div>";
        });
        html += "</div></div>";
        html += "<div class='tsa-gallery-footer'>";
        html += "<span class='tsa-selection-count' id='tsa-sel-count-"+this.viewerId+"'></span>";
        html += "<span class='tsa-footer-buttons'>";
        html += "<button type='button' class='tsa-select-all-btn sqs-btn'>Select all</button>";
        html += "<button type='button' class='tsa-clear-btn sqs-btn'>Clear</button>";
        html += "<button type='button' class='tsa-export-btn sqs-btn'><i class='fa fa-download' aria-hidden='true'></i> Export list</button>";
        html += "<button type='button' class='tsa-inspect-btn sqs-btn sqs-btn-primary' id='tsa-inspect-btn-"+this.viewerId+"'><i class='fa fa-search-plus' aria-hidden='true'></i> Inspect selected</button>";
        html += "</span>";
        html += "</div>";
        body.html(html);
        this.updateExpandButtons();

        const updateSelectionState = () => {
            const count = this.selectedImages.size;
            $("#tsa-sel-count-"+this.viewerId).text(count+" of "+this.images.length+" selected");
            $("#tsa-inspect-btn-"+this.viewerId+", #tsa-inspect-btn-hint-"+this.viewerId).prop("disabled", count == 0);
        };
        updateSelectionState();

        const toggleItem = item => {
            const key = String(item.data("key"));
            const selected = !this.selectedImages.has(key);
            if(selected) {
                this.selectedImages.add(key);
            }
            else {
                this.selectedImages.delete(key);
            }
            item.toggleClass("tsa-selected", selected).attr("aria-checked", selected ? "true" : "false");
            updateSelectionState();
        };
        body.find(".tsa-gallery-item").on("click", evt => toggleItem($(evt.currentTarget)));
        body.find(".tsa-gallery-item").on("keydown", evt => {
            if(evt.key == " " || evt.key == "Enter") {
                evt.preventDefault();
                toggleItem($(evt.currentTarget));
            }
        });

        body.find(".tsa-select-all-btn").on("click", () => {
            this.images.forEach(image => this.selectedImages.add(this.getImageKey(image)));
            body.find(".tsa-gallery-item").addClass("tsa-selected").attr("aria-checked", "true");
            updateSelectionState();
        });
        body.find(".tsa-clear-btn").on("click", () => {
            this.selectedImages.clear();
            body.find(".tsa-gallery-item").removeClass("tsa-selected").attr("aria-checked", "false");
            updateSelectionState();
        });
        body.find(".tsa-export-btn").on("click", () => this.exportGallery());

        const doInspect = () => {
            if(this.selectedImages.size > 0) {
                this.renderInspect();
            }
        };
        $("#tsa-inspect-btn-"+this.viewerId+", #tsa-inspect-btn-hint-"+this.viewerId).on("click", doInspect);
    }

    renderInspect() {
        this.leaveInspect();
        this.currentView = "inspect";
        const body = this.body;
        body.empty();

        const toolbarHtml = `
            <div class="tsa-inspect-toolbar">
                <button type="button" class="tsa-back-btn sqs-btn" id="tsa-back-${this.viewerId}">
                    <i class="fa fa-arrow-left" aria-hidden="true"></i> Back to gallery
                </button>
                <span class="tsa-inspect-hint">Drag to reposition</span>
                <div class="tsa-toolbar-tools">
                    <div class="tsa-layout-btns">
                        <button type="button" class="tsa-layout-btn sqs-btn" data-layout="row" title="Arrange in a row">
                            <i class="fa fa-pause fa-rotate-90" aria-hidden="true"></i> Row
                        </button>
                        <button type="button" class="tsa-layout-btn sqs-btn" data-layout="column" title="Arrange in a column">
                            <i class="fa fa-pause" aria-hidden="true"></i> Column
                        </button>
                        <button type="button" class="tsa-layout-btn sqs-btn" data-layout="grid" title="Arrange in a grid">
                            <i class="fa fa-th" aria-hidden="true"></i> Grid
                        </button>
                    </div>
                    <div class="tsa-toolbar-divider" aria-hidden="true"></div>
                    <button type="button" class="tsa-zoom-btn sqs-btn" id="tsa-zoom-btn-${this.viewerId}" title="Zoom tool">
                        <i class="fa fa-search-plus" aria-hidden="true"></i> Zoom
                    </button>
                    <button type="button" class="tsa-ston-btn sqs-btn" title="Download the images for use in STON">
                        <i class="fa fa-download" aria-hidden="true"></i> Export for STON
                    </button>
                    <div class="tsa-toolbar-divider" aria-hidden="true"></div>
                    ${this.renderExpandButton()}
                </div>
            </div>
            <div class="tsa-desktop" id="tsa-desktop-${this.viewerId}"></div>
        `;
        body.html(toolbarHtml);
        this.updateExpandButtons();

        $("#tsa-back-"+this.viewerId).on("click", () => {
            this.renderGallery();
        });
        body.find(".tsa-ston-btn").on("click", () => this.exportSton());
        body.find(".tsa-layout-btn").on("click", evt => {
            const layout = $(evt.currentTarget).data("layout");
            this.applyLayout(layout, "#tsa-desktop-"+this.viewerId);
        });

        const desktop = $("#tsa-desktop-"+this.viewerId);
        this.setupZoomTool(body, desktop);
        const cols = Math.min(this.selectedImages.size, 3);
        const stepX = 280;
        const stepY = 380;
        let col = 0, row = 0;

        const selectedImages = this.images.filter(image => this.selectedImages.has(this.getImageKey(image)));
        selectedImages.forEach(image => {
            const imgId = nanoid();
            const key = this.getImageKey(image);
            const left = 20 + col * stepX;
            const top = 20 + row * stepY;
            const imageUrl = this.getFullUrl(image);
            const altText = image.sample_name+", "+image.site_name;

            const cardHtml = `
                <div class="tsa-image-card" id="tsa-card-${imgId}" data-key="${escapeHtml(key)}" style="left:${left}px;top:${top}px">
                    <div class="tsa-card-handle">
                        <span class="tsa-card-name">${escapeHtml(image.site_name)} – ${escapeHtml(image.sample_name)}</span>
                        <button type="button" class="tsa-adjust-toggle" data-imgid="${imgId}" title="Image adjustments" aria-label="Image adjustments">
                            <i class="fa fa-sliders" aria-hidden="true"></i>
                        </button>
                        <button type="button" class="tsa-close-btn" data-imgid="${imgId}" title="Remove image" aria-label="Remove image">
                            <i class="fa fa-times" aria-hidden="true"></i>
                        </button>
                    </div>
                    <div class="tsa-card-imgwrap">
                        <img class="tsa-card-img" id="tsa-img-${imgId}"
                            src="${escapeHtml(imageUrl)}"
                            alt="${escapeHtml(altText)}">
                    </div>
                    ${this.renderCaption(image)}
                    <div class="tsa-card-controls" style="display:none">
                        <label>Brightness
                            <input type="range" class="tsa-ctrl" data-filter="brightness" data-imgid="${imgId}"
                                min="0" max="200" value="100">
                            <span class="tsa-ctrl-val">100%</span>
                        </label>
                        <label>Contrast
                            <input type="range" class="tsa-ctrl" data-filter="contrast" data-imgid="${imgId}"
                                min="0" max="200" value="100">
                            <span class="tsa-ctrl-val">100%</span>
                        </label>
                        <label>Saturation
                            <input type="range" class="tsa-ctrl" data-filter="saturate" data-imgid="${imgId}"
                                min="0" max="300" value="100">
                            <span class="tsa-ctrl-val">100%</span>
                        </label>
                        <label>Sharpness
                            <input type="range" class="tsa-sharpness-ctrl" data-imgid="${imgId}"
                                min="0" max="500" step="1" value="${SHARPNESS_DEFAULT}">
                            <span class="tsa-ctrl-val">${this.formatSharpnessValue(SHARPNESS_DEFAULT)}</span>
                        </label>
                        <button type="button" class="tsa-apply-all-btn" data-imgid="${imgId}">Apply these settings to all images</button>
                        <button type="button" class="tsa-normalize-btn" data-imgid="${imgId}">Normalize settings</button>
                    </div>
                    <div class="tsa-resize-handle"></div>
                </div>
            `;

            desktop.append(cardHtml);

            const $card = $(`#tsa-card-${imgId}`);
            $card.data("filters", {
                brightness: 100, contrast: 100, saturate: 100
            });
            $card.data("sharpness", SHARPNESS_DEFAULT);
            $card.data("processingState", {
                sourceUrl: imageUrl,
                sourceImage: null,
                outputObjectUrl: null,
                renderToken: 0,
                warned: false
            });

            const $img = $card.find(".tsa-card-img");
            const applyAspectRatio = () => {
                const nat = $img[0];
                if (!nat.naturalWidth || !nat.naturalHeight) return;
                const ratio = nat.naturalWidth / nat.naturalHeight;
                $card.data("aspectRatio", ratio);
                $card.css("height", ((240 / ratio) + CAPTION_HEIGHT) + "px");
            };
            if ($img[0].complete) { applyAspectRatio(); }
            else { $img.on("load", applyAspectRatio); }
            this.loadCardSourceImage(imgId);

            col++;
            if (col >= cols) {
                col = 0;
                row++;
            }
        });

        desktop.on("click", ".tsa-close-btn", (e) => {
            e.stopPropagation();
            const imgId = $(e.currentTarget).data("imgid");
            const key = $(`#tsa-card-${imgId}`).data("key");
            this.selectedImages.delete(String(key));
            this.releaseCardProcessingState(imgId);
            $(`#tsa-card-${imgId}`).remove();
            if (desktop.find(".tsa-image-card").length === 0) {
                this.renderGallery();
            }
        });

        desktop.on("click", ".tsa-adjust-toggle", (e) => {
            e.stopPropagation();
            const btn = $(e.currentTarget);
            const card = btn.closest(".tsa-image-card");
            const controls = card.find(".tsa-card-controls");
            const willOpen = !controls.is(":visible");
            controls.toggle(willOpen);
            btn.toggleClass("tsa-adjust-toggle--active", willOpen);
            card.toggleClass("tsa-image-card--adjustments-open", willOpen);
        });

        desktop.on("input", ".tsa-ctrl", (e) => {
            const input = $(e.target);
            const filter = input.data("filter");
            const imgId = input.data("imgid");
            const val = parseInt(input.val());
            const card = $(`#tsa-card-${imgId}`);
            const filters = card.data("filters");
            filters[filter] = val;
            input.siblings(".tsa-ctrl-val").text(val + "%");
            this.renderCardImage(imgId);
        });

        desktop.on("input", ".tsa-sharpness-ctrl", (e) => {
            const input = $(e.target);
            const imgId = input.data("imgid");
            const val = Number(input.val());
            const card = $(`#tsa-card-${imgId}`);
            card.data("sharpness", val);
            input.siblings(".tsa-ctrl-val").text(this.formatSharpnessValue(val));
            this.renderCardImage(imgId);
        });

        desktop.on("click", ".tsa-apply-all-btn", (e) => {
            const srcImgId = $(e.currentTarget).data("imgid");
            const srcFilters = $(`#tsa-card-${srcImgId}`).data("filters");
            const srcSharpness = Number($(`#tsa-card-${srcImgId}`).data("sharpness"));
            desktop.find(".tsa-image-card").each((_, card) => {
                const $card = $(card);
                const targetImgId = $card.find(".tsa-ctrl").first().data("imgid");
                if (!targetImgId) return;
                const targetFilters = $card.data("filters");
                Object.assign(targetFilters, srcFilters);
                $card.data("sharpness", srcSharpness);
                $card.find(".tsa-ctrl").each((_, input) => {
                    const $input = $(input);
                    const f = $input.data("filter");
                    $input.val(srcFilters[f]);
                    $input.siblings(".tsa-ctrl-val").text(srcFilters[f] + "%");
                });
                $card.find(".tsa-sharpness-ctrl").val(srcSharpness);
                $card.find(".tsa-sharpness-ctrl").siblings(".tsa-ctrl-val").text(this.formatSharpnessValue(srcSharpness));
                this.renderCardImage(targetImgId);
            });
        });

        desktop.on("click", ".tsa-normalize-btn", (e) => {
            const imgId = $(e.currentTarget).data("imgid");
            const card = $(`#tsa-card-${imgId}`);
            const defaults = { brightness: 100, contrast: 100, saturate: 100 };
            const filters = card.data("filters");
            Object.assign(filters, defaults);
            card.data("sharpness", SHARPNESS_DEFAULT);
            card.find(".tsa-ctrl").each((_, input) => {
                const $input = $(input);
                $input.val(defaults[$input.data("filter")]);
                $input.siblings(".tsa-ctrl-val").text("100%");
            });
            card.find(".tsa-sharpness-ctrl").val(SHARPNESS_DEFAULT);
            card.find(".tsa-sharpness-ctrl").siblings(".tsa-ctrl-val").text(this.formatSharpnessValue(SHARPNESS_DEFAULT));
            this.renderCardImage(imgId);
        });

        this.setupDraggable(`#tsa-desktop-${this.viewerId}`);
        this.setupResponsive(`#tsa-desktop-${this.viewerId}`);

        // Apply default grid layout once all images have loaded (aspect ratios needed)
        const $imgs = desktop.find(".tsa-card-img").toArray();
        const pending = $imgs.filter(img => !img.complete);
        const doLayout = () => this.applyLayout("grid", `#tsa-desktop-${this.viewerId}`);
        if (!pending.length) {
            doLayout();
        } else {
            let loaded = 0;
            pending.forEach(img => {
                $(img).one("load error", () => { if (++loaded >= pending.length) doLayout(); });
            });
        }
    }

    /*
    * Function: leaveInspect
    * Lets go of what the inspect view holds: the observer of its size, the zoom tool, the handlers on the document
    * and the images made by the adjustments.
    */
    leaveInspect() {
        if(this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        this.releaseAllCardProcessingStates();
        this.cleanupZoomTool();
        $(document).off(`mousemove.tsa-${this.viewerId} mouseup.tsa-${this.viewerId}`);
    }

    /*
    * Function: applyLayout
    * Arranges the cards in a row, a column or a grid, as large as they can be with all of them in view: they fit both
    * the width and the height of the desktop, so that it doesn't scroll, and are centered in it. Only when that would
    * make them smaller than MIN_CARD_WIDTH, e.g. a long column, do they go beyond it, and the desktop scrolls.
    */
    applyLayout(layout, desktopSelector, animate = true) {
        this.currentLayout = layout;
        const $desktop = $(desktopSelector);
        const desktopNode = $desktop[0];
        if (!desktopNode) return;
        const snapGrid = 20;
        const MIN_CARD_WIDTH = 160;
        const cards = $desktop.find(".tsa-image-card").toArray();
        const n = cards.length;
        if (!n) return;
        //The room inside the scrollbars, if there are any yet, as the cards are placed to need none
        const desktopW = desktopNode.clientWidth;
        const desktopH = desktopNode.clientHeight;

        // Floor-snap for widths: guarantees cols x cardW <= desktopW so cards never overflow the container
        const snapDown = (v) => Math.floor(v / snapGrid) * snapGrid;
        //The height of a card is that of its image, which keeps its proportions, and its caption
        const cardHeight = (cardW, ratio) => Math.floor((cardW / ratio) + CAPTION_HEIGHT);
        //The tallest image decides how wide the cards can be for a given height
        const minRatio = Math.min(...cards.map(card => $(card).data("aspectRatio") || 1));
        const widthForHeight = (h) => (h - CAPTION_HEIGHT) * minRatio;
        const fitWidth = (cols, rows) => {
            const w = Math.min(desktopW / cols, widthForHeight(desktopH / rows));
            return Math.max(MIN_CARD_WIDTH, snapDown(w));
        };
        const centerOffset = (used, room) => Math.max(0, Math.floor((room - used) / 2));
        const place = ($card, card, props) => {
            // Override CSS min-width so the layout-computed width is never overridden by the stylesheet floor
            const allProps = Object.assign({ 'min-width': '0' }, props);
            if (animate) {
                $card.addClass("tsa-snapping").css(allProps);
                card.addEventListener("transitionend", () => $card.removeClass("tsa-snapping"), { once: true });
            } else {
                $card.css(allProps);
            }
        };

        //The number of columns: one for a column, all for a row, and for a grid whichever makes the cards the largest
        let cols = 1;
        if (layout === "row") {
            cols = n;
        } else if (layout === "grid") {
            let bestW = -1;
            for (let c = 1; c <= n; c++) {
                const w = Math.min(desktopW / c, widthForHeight(desktopH / Math.ceil(n / c)));
                if (w > bestW) {
                    bestW = w;
                    cols = c;
                }
            }
        } else if (layout !== "column") {
            return;
        }
        const rows = Math.ceil(n / cols);
        const cardW = fitWidth(cols, rows);
        const rowH = cardHeight(cardW, minRatio);
        const left0 = centerOffset(cols * cardW, desktopW);
        const top0 = centerOffset(rows * rowH, desktopH);
        cards.forEach((card, i) => {
            const $card = $(card);
            const ratio = $card.data("aspectRatio") || 1;
            const col = i % cols;
            const row = Math.floor(i / cols);
            place($card, card, {
                left: (left0 + col * cardW) + "px",
                top: (top0 + row * rowH) + "px",
                width: cardW + "px",
                height: cardHeight(cardW, ratio) + "px"
            });
        });
    }

    applyFilters(imgId, filters) {
        const css = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%)`;
        $(`#tsa-img-${imgId}`).css("filter", css);
    }

    formatSharpnessValue(value) {
        return (Number(value) / 100).toFixed(2);
    }

    loadCardSourceImage(imgId) {
        const $card = $(`#tsa-card-${imgId}`);
        if (!$card.length) return;
        const state = $card.data("processingState");
        if (!state || !state.sourceUrl) return;

        const sourceImage = new Image();

        sourceImage.onload = () => {
            const freshCard = $(`#tsa-card-${imgId}`);
            if (!freshCard.length) return;
            const freshState = freshCard.data("processingState");
            if (!freshState) return;
            freshState.sourceImage = sourceImage;
            this.renderCardImage(imgId);
        };

        sourceImage.onerror = () => {
            if (!state.warned) {
                console.warn(`Unable to decode image for sharpness processing: ${state.sourceUrl}`);
                state.warned = true;
            }
        };

        sourceImage.src = state.sourceUrl;
    }

    setCardImageSource(imgId, src) {
        const $card = $(`#tsa-card-${imgId}`);
        if (!$card.length) return;
        const state = $card.data("processingState");
        if (!state) return;
        const $img = $card.find(".tsa-card-img");
        if (!$img.length) return;
        const img = $img[0];

        if (img.src === src) {
            return;
        }

        if (state.outputObjectUrl && state.outputObjectUrl !== src) {
            URL.revokeObjectURL(state.outputObjectUrl);
            state.outputObjectUrl = null;
        }

        img.src = src;
        if (src.startsWith("blob:")) {
            state.outputObjectUrl = src;
        }
    }

    renderCardImage(imgId) {
        const $card = $(`#tsa-card-${imgId}`);
        if (!$card.length) return;
        const filters = $card.data("filters");
        const sharpness = Number($card.data("sharpness"));
        const state = $card.data("processingState");
        if (!filters || Number.isNaN(sharpness) || !state) return;

        this.applyFilters(imgId, filters);

        if (sharpness === SHARPNESS_DEFAULT) {
            this.setCardImageSource(imgId, state.sourceUrl);
            this.applyFilters(imgId, filters);
            return;
        }

        if (!state.sourceImage) {
            return;
        }

        state.renderToken += 1;
        const renderToken = state.renderToken;
        const outputCanvas = document.createElement("canvas");

        try {
            applySharpness({
                source: state.sourceImage,
                outputCanvas,
                sharpness
            });
        } catch (error) {
            if (!state.warned) {
                console.warn("Sharpness processing could not be applied:", error);
                state.warned = true;
            }
            return;
        }

        outputCanvas.toBlob((blob) => {
            const freshCard = $(`#tsa-card-${imgId}`);
            if (!freshCard.length) return;
            const freshState = freshCard.data("processingState");
            if (!freshState || freshState.renderToken !== renderToken) return;
            if (!blob) return;

            const objectUrl = URL.createObjectURL(blob);
            this.setCardImageSource(imgId, objectUrl);
            const freshFilters = freshCard.data("filters");
            if (freshFilters) {
                this.applyFilters(imgId, freshFilters);
            }
        }, "image/png");
    }

    releaseCardProcessingState(imgId) {
        const $card = $(`#tsa-card-${imgId}`);
        if (!$card.length) return;
        const state = $card.data("processingState");
        if (!state) return;
        state.renderToken += 1;
        if (state.outputObjectUrl) {
            URL.revokeObjectURL(state.outputObjectUrl);
            state.outputObjectUrl = null;
        }
    }

    releaseAllCardProcessingStates() {
        if(!this.body) {
            return;
        }
        this.body.find(".tsa-image-card").each((_, cardNode) => {
            const $card = $(cardNode);
            const state = $card.data("processingState");
            if (!state) return;
            state.renderToken += 1;
            if (state.outputObjectUrl) {
                URL.revokeObjectURL(state.outputObjectUrl);
                state.outputObjectUrl = null;
            }
        });
    }

    updateZoomCanvasSize() {
        if (!this.zoomCanvas || !this.zoomOverlay) return;
        const overlayNode = this.zoomOverlay[0];
        const displayW = Math.max(1, Math.round(overlayNode?.clientWidth || 200));
        const displayH = Math.max(1, Math.round(overlayNode?.clientHeight || 200));
        this.zoomCanvas.width = displayW;
        this.zoomCanvas.height = displayH;
        this.zoomCtx = this.zoomCanvas.getContext("2d");
    }

    setZoomScale(nextScale) {
        const clamped = Math.min(8, Math.max(2, nextScale));
        const snapped = Math.round(clamped * 4) / 4;
        if (snapped === this.zoomScale) return false;
        this.zoomScale = snapped;
        this.updateZoomCanvasSize();
        this.showZoomLabelTemporarily();
        return true;
    }

    showZoomLabelTemporarily() {
        this.zoomLabelVisibleUntil = Date.now() + 1000;
        if (this.zoomLabelHideTimer) {
            clearTimeout(this.zoomLabelHideTimer);
        }
        this.zoomLabelHideTimer = setTimeout(() => {
            this.zoomLabelHideTimer = null;
            this.zoomLabelVisibleUntil = 0;
            if (this.zoomOverlay && this.zoomOverlay.is(":visible")) {
                this.updateZoomPreview(this._lastZoomPreviewEvent || {}, this._lastZoomPreviewWrap || null);
            }
        }, 1000);
    }

    getTouchDistance(touches) {
        if (!touches || touches.length < 2) return 0;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }

    getTouchCenter(touches) {
        if (!touches || !touches.length) return null;
        if (touches.length === 1) {
            return { clientX: touches[0].clientX, clientY: touches[0].clientY };
        }
        return {
            clientX: (touches[0].clientX + touches[1].clientX) / 2,
            clientY: (touches[0].clientY + touches[1].clientY) / 2
        };
    }

    setupZoomTool($body, $desktop) {
        this.cleanupZoomTool();
        this.zoomBoundBody = $body;
        this.zoomBoundDesktop = $desktop;
        this.zoomToolActive = false;
        this.zoomWheelDeltaRemainder = 0;
        this.zoomPinchStartDistance = null;
        this.zoomPinchStartScale = this.zoomScale;

        const overlay = $(`
            <div class="tsa-zoom-overlay" id="tsa-zoom-overlay-${this.viewerId}" style="display:none;">
                <canvas width="200" height="200"></canvas>
            </div>
        `);
        const lens = $(`<div class="tsa-zoom-lens" id="tsa-zoom-lens-${this.viewerId}" style="display:none;"></div>`);
        $desktop.append(overlay);
        this.zoomOverlay = overlay;
        this.zoomCanvas = overlay.find("canvas")[0];
        this.zoomCtx = this.zoomCanvas.getContext("2d");
        this.updateZoomCanvasSize();
        this.zoomLens = lens;

        $body.on(`click.tsa-zoom-${this.viewerId}`, `#tsa-zoom-btn-${this.viewerId}`, (e) => {
            e.preventDefault();
            const active = !this.zoomToolActive;
            this.zoomToolActive = active;
            $body.find(`#tsa-zoom-btn-${this.viewerId}`).toggleClass("tsa-zoom-btn--active", active);
            $desktop.toggleClass("tsa-desktop--zoom-active", active);
            if (!active) {
                this.hideZoomPreview();
            }
        });

        $desktop.on(`mouseleave.tsa-zoom-${this.viewerId}`, ".tsa-card-imgwrap", () => {
            this.hideZoomPreview();
        });

        $desktop.on(`mousemove.tsa-zoom-${this.viewerId}`, ".tsa-card-imgwrap", (evt) => {
            this.updateZoomPreview(evt, $(evt.currentTarget));
        });

        $desktop.on(`touchstart.tsa-zoom-${this.viewerId}`, ".tsa-card-imgwrap", (evt) => {
            if (!this.zoomToolActive) return;
            const oe = evt.originalEvent;
            if (!oe?.touches?.length) return;

            evt.preventDefault();
            const center = this.getTouchCenter(oe.touches);
            if (center) {
                this.updateZoomPreview(center, $(evt.currentTarget));
            }

            if (oe.touches.length >= 2) {
                this.zoomPinchStartDistance = this.getTouchDistance(oe.touches);
                this.zoomPinchStartScale = this.zoomScale;
            } else {
                this.zoomPinchStartDistance = null;
                this.zoomPinchStartScale = this.zoomScale;
            }
        });

        $desktop.on(`touchmove.tsa-zoom-${this.viewerId}`, ".tsa-card-imgwrap", (evt) => {
            if (!this.zoomToolActive) return;
            const oe = evt.originalEvent;
            if (!oe?.touches?.length) return;

            evt.preventDefault();
            const touches = oe.touches;
            const center = this.getTouchCenter(touches);

            if (touches.length >= 2) {
                const distance = this.getTouchDistance(touches);
                if (this.zoomPinchStartDistance > 0) {
                    const ratio = distance / this.zoomPinchStartDistance;
                    this.setZoomScale(this.zoomPinchStartScale * ratio);
                } else {
                    this.zoomPinchStartDistance = distance;
                    this.zoomPinchStartScale = this.zoomScale;
                }
            }

            if (center) {
                this.updateZoomPreview(center, $(evt.currentTarget));
            }
        });

        $desktop.on(`touchend.tsa-zoom-${this.viewerId} touchcancel.tsa-zoom-${this.viewerId}`, ".tsa-card-imgwrap", (evt) => {
            if (!this.zoomToolActive) return;
            const oe = evt.originalEvent;
            const touches = oe?.touches || [];

            if (!touches.length) {
                this.zoomPinchStartDistance = null;
                this.zoomPinchStartScale = this.zoomScale;
                this.hideZoomPreview();
                return;
            }

            if (touches.length >= 2) {
                this.zoomPinchStartDistance = this.getTouchDistance(touches);
                this.zoomPinchStartScale = this.zoomScale;
            } else {
                this.zoomPinchStartDistance = null;
                this.zoomPinchStartScale = this.zoomScale;
                const center = this.getTouchCenter(touches);
                if (center) {
                    this.updateZoomPreview(center, $(evt.currentTarget));
                }
            }
        });

        $desktop.on(`wheel.tsa-zoom-${this.viewerId}`, ".tsa-card-imgwrap", (evt) => {
            if (!this.zoomToolActive) return;
            evt.preventDefault();
            const delta = evt.originalEvent?.deltaY ?? evt.originalEvent?.detail ?? 0;
            if (delta) {
                const mode = evt.originalEvent?.deltaMode ?? 0;
                const threshold = mode === 1 ? 3 : 80;
                this.zoomWheelDeltaRemainder += delta;
                const stepCount = Math.trunc(Math.abs(this.zoomWheelDeltaRemainder) / threshold);
                if (stepCount > 0) {
                    const direction = this.zoomWheelDeltaRemainder > 0 ? -1 : 1;
                    this.setZoomScale(this.zoomScale + (direction * stepCount * 0.5));
                    this.zoomWheelDeltaRemainder -= Math.sign(this.zoomWheelDeltaRemainder) * stepCount * threshold;
                }
            }
            this.updateZoomPreview(evt, $(evt.currentTarget));
        });
    }

    hideZoomPreview() {
        if (this.zoomLens) {
            this.zoomLens.detach();
            this.zoomLens.hide();
        }
        if (this.zoomOverlay) {
            this.zoomOverlay.hide();
        }
    }

    updateZoomPreview(evt, $wrap) {
        this._lastZoomPreviewEvent = evt;
        this._lastZoomPreviewWrap = $wrap;
        if (!this.zoomToolActive || !$wrap || !$wrap.length) {
            this.hideZoomPreview();
            return;
        }

        const img = $wrap.find(".tsa-card-img")[0];
        if (!img || !img.naturalWidth || !img.naturalHeight) {
            this.hideZoomPreview();
            return;
        }

        const clientX = evt.clientX ?? evt.originalEvent?.clientX;
        const clientY = evt.clientY ?? evt.originalEvent?.clientY;
        if (clientX == null || clientY == null) {
            this.hideZoomPreview();
            return;
        }

        const rect = img.getBoundingClientRect();
        const boxW = rect.width;
        const boxH = rect.height;
        if (!boxW || !boxH) {
            this.hideZoomPreview();
            return;
        }

        const imgRatio = img.naturalWidth / img.naturalHeight;
        const boxRatio = boxW / boxH;
        const displayW = imgRatio > boxRatio ? boxW : boxH * imgRatio;
        const displayH = imgRatio > boxRatio ? boxW / imgRatio : boxH;
        const padX = (boxW - displayW) / 2;
        const padY = (boxH - displayH) / 2;

        const relX = clientX - rect.left;
        const relY = clientY - rect.top;
        const inImage = relX >= padX && relX <= (padX + displayW) && relY >= padY && relY <= (padY + displayH);
        if (!inImage) {
            this.hideZoomPreview();
            return;
        }

        const overlayW = this.zoomOverlay?.outerWidth() || 200;
        const overlayH = this.zoomOverlay?.outerHeight() || 200;
        const lensW = Math.max(20, Math.min(displayW, overlayW / this.zoomScale));
        const lensH = Math.max(20, Math.min(displayH, overlayH / this.zoomScale));

        if (this.zoomLens) {
            if (!this.zoomLens.parent().is($wrap)) {
                $wrap.append(this.zoomLens);
            }
            const lensHalfW = lensW / 2;
            const lensHalfH = lensH / 2;
            const lensLeft = Math.max(padX, Math.min(relX - lensHalfW, padX + displayW - lensW));
            const lensTop = Math.max(padY, Math.min(relY - lensHalfH, padY + displayH - lensH));
            this.zoomLens.css({
                width: `${lensW}px`,
                height: `${lensH}px`,
                left: `${lensLeft}px`,
                top: `${lensTop}px`
            }).show();
        }

        const sampleDisplayW = overlayW / this.zoomScale;
        const sampleDisplayH = overlayH / this.zoomScale;
        const sampleW = sampleDisplayW * (img.naturalWidth / displayW);
        const sampleH = sampleDisplayH * (img.naturalHeight / displayH);
        const centerX = (relX - padX) * (img.naturalWidth / displayW);
        const centerY = (relY - padY) * (img.naturalHeight / displayH);
        const srcX = Math.max(0, Math.min(centerX - sampleW / 2, img.naturalWidth - sampleW));
        const srcY = Math.max(0, Math.min(centerY - sampleH / 2, img.naturalHeight - sampleH));

        if (this.zoomCtx && this.zoomCanvas) {
            this.updateZoomCanvasSize();
            this.zoomCtx.clearRect(0, 0, this.zoomCanvas.width, this.zoomCanvas.height);
            this.zoomCtx.drawImage(img, srcX, srcY, sampleW, sampleH, 0, 0, this.zoomCanvas.width, this.zoomCanvas.height);
            this.zoomCanvas.style.filter = $(img).css("filter") || "none";

            const now = Date.now();
            if (now < this.zoomLabelVisibleUntil) {
                const scaleLabel = Number.isInteger(this.zoomScale)
                    ? this.zoomScale.toString()
                    : this.zoomScale.toFixed(2).replace(/\.?0+$/, "");
                const label = `${scaleLabel}×`;
                const cw = this.zoomCanvas.width;
                const ch = this.zoomCanvas.height;
                const fontSize = Math.round(cw * 0.08);
                this.zoomCtx.font = `bold ${fontSize}px sans-serif`;
                const tw = this.zoomCtx.measureText(label).width;
                const padXLabel = Math.round(cw * 0.04);
                const padYLabel = Math.round(ch * 0.025);
                const labelBoxW = tw + padXLabel * 2;
                const labelBoxH = fontSize + padYLabel * 2;

                const cx = cw / 2;
                const cy = ch / 2;
                const radius = Math.min(cw, ch) / 2;
                const edgeMargin = Math.round(radius * 0.08);
                const halfDiag = Math.hypot(labelBoxW / 2, labelBoxH / 2);
                const maxOffset = Math.max(0, ((radius - edgeMargin) - halfDiag) / Math.SQRT2);
                const offset = maxOffset * 0.95;
                const bx = Math.round(cx + offset - labelBoxW / 2);
                const by = Math.round(cy + offset - labelBoxH / 2);

                this.zoomCtx.fillStyle = "rgba(0,0,0,0.55)";
                this.zoomCtx.fillRect(bx, by, labelBoxW, labelBoxH);
                this.zoomCtx.fillStyle = "#fff";
                this.zoomCtx.textBaseline = "top";
                this.zoomCtx.fillText(label, bx + padXLabel, by + padYLabel);
            }
        }

        if (this.zoomOverlay) {
            const gap = 20;
            const margin = 8;
            let overlayLeft = clientX + gap;
            let overlayTop = clientY + gap;

            if (overlayLeft + overlayW > window.innerWidth - margin) {
                overlayLeft = clientX - overlayW - gap;
            }
            if (overlayTop + overlayH > window.innerHeight - margin) {
                overlayTop = clientY - overlayH - gap;
            }

            overlayLeft = Math.max(margin, Math.min(overlayLeft, window.innerWidth - overlayW - margin));
            overlayTop = Math.max(margin, Math.min(overlayTop, window.innerHeight - overlayH - margin));

            this.zoomOverlay.css({
                left: `${overlayLeft}px`,
                top: `${overlayTop}px`
            }).show();
        }
    }

    cleanupZoomTool() {
        if (this.zoomBoundBody) {
            this.zoomBoundBody.off(`.tsa-zoom-${this.viewerId}`);
        }
        if (this.zoomBoundDesktop) {
            this.zoomBoundDesktop.off(`.tsa-zoom-${this.viewerId}`);
        }
        this.hideZoomPreview();
        if (this.zoomOverlay) {
            this.zoomOverlay.remove();
        }
        if (this.zoomLens) {
            this.zoomLens.remove();
        }
        this.zoomOverlay = null;
        this.zoomLens = null;
        this.zoomCanvas = null;
        this.zoomCtx = null;
        this.zoomBoundBody = null;
        this.zoomBoundDesktop = null;
        this.zoomWheelDeltaRemainder = 0;
        this.zoomPinchStartDistance = null;
        this.zoomPinchStartScale = this.zoomScale;
        this.zoomLabelVisibleUntil = 0;
        if (this.zoomLabelHideTimer) {
            clearTimeout(this.zoomLabelHideTimer);
            this.zoomLabelHideTimer = null;
        }
        this._lastZoomPreviewEvent = null;
        this._lastZoomPreviewWrap = null;
        this.zoomToolActive = false;
    }

    setupDraggable(desktopSelector) {
        const $desktop = $(desktopSelector);
        const snapGrid = 20;
        let $dragging = null;
        let offsetX = 0, offsetY = 0;
        let $resizing = null;
        let resizeStartX = 0, resizeStartY = 0;
        let resizeStartW = 0, resizeStartH = 0;
        let resizeAspectRatio = null;
        let topZ = 1;

        //The card is as high as its image at the width of the card, and the caption
        const heightForWidth = (width) => (width / resizeAspectRatio) + CAPTION_HEIGHT;

        const bringToFront = ($card) => {
            topZ++;
            $card.css("z-index", topZ);
        };

        $desktop.on("mousedown", ".tsa-resize-handle", (e) => {
            e.preventDefault();
            e.stopPropagation();
            $resizing = $(e.currentTarget).closest(".tsa-image-card");
            bringToFront($resizing);
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;
            resizeStartW = $resizing.outerWidth();
            resizeStartH = $resizing.outerHeight();
            resizeAspectRatio = $resizing.data("aspectRatio") || null;
            $desktop.addClass("tsa-desktop--dragging");
        });

        $desktop.on("mousedown", ".tsa-card-handle", (e) => {
            if ($(e.target).is("input, button") || $(e.target).closest("button").length) return;
            e.preventDefault();
            $dragging = $(e.currentTarget).closest(".tsa-image-card");
            bringToFront($dragging);
            const pos = $dragging.position();
            offsetX = e.clientX - pos.left;
            offsetY = e.clientY - pos.top;
            $dragging.addClass("tsa-dragging");
            $desktop.addClass("tsa-desktop--dragging");
        });

        $(document).on(`mousemove.tsa-${this.viewerId}`, (e) => {
            if ($resizing) {
                const newW = Math.max(80, resizeStartW + (e.clientX - resizeStartX));
                const newH = resizeAspectRatio
                    ? heightForWidth(newW)
                    : Math.max(80, resizeStartH + (e.clientY - resizeStartY));
                $resizing.css({ width: newW + "px", height: newH + "px" });
                return;
            }
            if (!$dragging) return;
            $dragging.css({
                left: (e.clientX - offsetX) + "px",
                top: (e.clientY - offsetY) + "px"
            });
        });

        $(document).on(`mouseup.tsa-${this.viewerId}`, (e) => {
            if ($resizing) {
                const rawW = resizeStartW + (e.clientX - resizeStartX);
                const snappedW = Math.max(snapGrid, Math.round(rawW / snapGrid) * snapGrid);
                const snappedH = resizeAspectRatio
                    ? heightForWidth(snappedW)
                    : Math.max(snapGrid, Math.round((resizeStartH + (e.clientY - resizeStartY)) / snapGrid) * snapGrid);
                $resizing.addClass("tsa-snapping").css({ width: snappedW + "px", height: snappedH + "px" });
                const el = $resizing[0];
                el.addEventListener("transitionend", () => $(el).removeClass("tsa-snapping"), { once: true });
                $resizing = null;
                $desktop.removeClass("tsa-desktop--dragging");
            }
            if (!$dragging) return;
            const rawLeft = e.clientX - offsetX;
            const rawTop = e.clientY - offsetY;
            const snappedLeft = Math.round(rawLeft / snapGrid) * snapGrid;
            const snappedTop = Math.round(rawTop / snapGrid) * snapGrid;
            $dragging.removeClass("tsa-dragging").addClass("tsa-snapping");
            $desktop.removeClass("tsa-desktop--dragging");
            $dragging.css({ left: snappedLeft + "px", top: snappedTop + "px" });
            const el = $dragging[0];
            el.addEventListener("transitionend", () => {
                $(el).removeClass("tsa-snapping");
            }, { once: true });
            this.currentLayout = null; // user manually repositioned
            $dragging = null;
        });
    }

    setupResponsive(desktopSelector) {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        const $desktop = $(desktopSelector);
        const el = $desktop[0];
        if (!el) return;
        this.lastDesktopWidth = el.clientWidth;
        this.lastDesktopHeight = el.clientHeight;

        let debounceTimer = null;
        this._resizeObserver = new ResizeObserver(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const newW = el.clientWidth;
                const newH = el.clientHeight;
                if (!newW || (newW === this.lastDesktopWidth && newH === this.lastDesktopHeight)) return;

                if (this.currentLayout) {
                    // Re-apply named layout to the new size, no animation
                    this.applyLayout(this.currentLayout, desktopSelector, false);
                } else if (newW !== this.lastDesktopWidth) {
                    // Free mode: scale left/width proportionally, derive height from aspect ratio
                    const ratio = newW / this.lastDesktopWidth;
                    $desktop.find(".tsa-image-card").each((_, card) => {
                        const $card = $(card);
                        const curLeft = parseFloat(card.style.left) || 0;
                        const curW = parseFloat(card.style.width) || $card.outerWidth();
                        const newCardW = Math.max(20, curW * ratio);
                        const props = { left: (curLeft * ratio) + "px", width: newCardW + "px" };
                        const ar = $card.data("aspectRatio");
                        if (ar) {
                            props.height = ((newCardW / ar) + CAPTION_HEIGHT) + "px";
                        }
                        $card.css(props);
                    });
                }
                this.lastDesktopWidth = newW;
                this.lastDesktopHeight = newH;
            }, 100);
        });
        this._resizeObserver.observe(el);
    }

    /*
    * Function: exportCallback
    * What the export button of the tile does: with images picked and inspected, the STON bundle, else the list of images.
    */
    exportCallback() {
        if(this.currentView == "inspect") {
            this.exportSton();
        }
        else {
            this.exportGallery();
        }
    }

    getImageExportRow(image) {
        const metadata = image.metadata || {};
        return {
            sample_image_id: image.sample_image_id,
            site_id: image.site_id,
            site_name: image.site_name,
            sample_group_name: image.sample_group_name,
            physical_sample_id: image.physical_sample_id,
            sample_name: image.sample_name,
            image_name: image.image_name,
            image_type: image.image_type,
            image_url: this.getFullUrl(image),
            metadata_recorded: image.metadata ? "yes" : "no",
            magnification: metadata.magnification ?? "",
            field_of_view_mm: metadata.field_of_view_mm ?? "",
            polarisation: metadata.polarisation ?? "",
            resin_type: metadata.resin_type ?? "",
            camera_specs: metadata.camera_specs ?? "",
            original_file_name: metadata.original_file_name ?? ""
        };
    }

    exportGallery() {
        if(!this.images.length) {
            return;
        }

        const jsonBtnId = nanoid();
        const csvBtnId = nanoid();

        const html = `
            <div class='dialog-centered-content-container'>
                <button type='button' id='${jsonBtnId}' class='site-report-export-download-btn sqs-btn'><i class='fa fa-download' aria-hidden='true'></i> Image list as JSON</button>
                <button type='button' id='${csvBtnId}' class='site-report-export-download-btn sqs-btn'><i class='fa fa-download' aria-hidden='true'></i> Image list as CSV</button>
            </div>
        `;
        this.sqs.dialogManager.showPopOver("Export image list", html);

        const dismiss = () => setTimeout(() => this.sqs.dialogManager.hidePopOver(), 800);
        const rows = this.images.map(image => this.getImageExportRow(image));

        $(`#${jsonBtnId}`).on("click", () => {
            const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" });
            saveAs(blob, this.exportFilenameBase+".json");
            dismiss();
        });

        $(`#${csvBtnId}`).on("click", () => {
            const parser = new Parser({ fields: Object.keys(rows[0]) });
            const blob = new Blob([parser.parse(rows)], { type: "text/csv;charset=utf-8" });
            saveAs(blob, this.exportFilenameBase+".csv");
            dismiss();
        });
    }

    /*
    * Function: exportSton
    * The images in view, in full size, and the configuration of STON, the thin section analysis software, in a zip. The
    * metadata of the images is in the zip as well.
    */
    async exportSton() {
        const selectedImages = this.images.filter(image => this.selectedImages.has(this.getImageKey(image)));
        if (!selectedImages.length) return;

        const stonConf = `[Project_info]
Name = SEAD
Directory = images
Extensions = .tif;.png;.jpeg;.JPG;.JPEG;.jpg

[General_image_display]
Image_width = 200
Downgrade_factor = 10

[Zoom_window]
closeup_window = original
closeup_window_size = 50

[Meta_image_options]
Downgrade_factor = 10
Ncol_meta_image = 3
Meta_txt_fontsize = 25
name_on_images = Yes

[Analysis]
pix_to_mm = 0.02
minimum_size = 1

[Conf]
main_window_width = 1150
main_window_height = 700
zoom_window_width = 900
zoom_window_height = 400
zoom_insert_pix_size = 50
cluster_window_width = 900
cluster_window_height = 400
compare_window_width = 900
compare_window_height = 400
`;

        const stonBtnId = nanoid();
        const html = `
            <div class='dialog-centered-content-container'>
                <button type='button' id='${stonBtnId}' class='site-report-export-download-btn sqs-btn'>
                    <i class='fa fa-download' aria-hidden='true'></i> Download STON bundle (${selectedImages.length} image${selectedImages.length !== 1 ? "s" : ""})
                </button>
            </div>
        `;
        this.sqs.dialogManager.showPopOver("Export for STON", html);

        $(`#${stonBtnId}`).on("click", async () => {
            $(`#${stonBtnId}`).prop("disabled", true).text("Building zip…");

            const zip = new JSZip();
            zip.file("STON.conf", stonConf);
            const imgFolder = zip.folder("images");

            const rows = [];
            await Promise.all(selectedImages.map(async (image) => {
                //The file is named as the stored file is, e.g. bjornhovda_ts1.jpg
                const filename = String(image.image_location || image.full_url).split("/").pop();
                try {
                    const resp = await fetch(this.getFullUrl(image), { mode: "cors" });
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const blob = await resp.blob();
                    imgFolder.file(filename, blob);
                    rows.push(Object.assign({ file: "images/"+filename }, this.getImageExportRow(image)));
                } catch (e) {
                    console.warn(`STON export: could not fetch ${filename}:`, e);
                }
            }));

            if(rows.length > 0) {
                const parser = new Parser({ fields: Object.keys(rows[0]) });
                zip.file("metadata.csv", parser.parse(rows));
            }

            const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
            saveAs(zipBlob, "sead_ston_export.zip");
            setTimeout(() => this.sqs.dialogManager.hidePopOver(), 800);
        });
    }
}

export default ThinSectionViewer;
