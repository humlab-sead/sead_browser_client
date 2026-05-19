import { nanoid } from "nanoid";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Parser } from "@json2csv/plainjs";
import MosaicTileModule from "./MosaicTileModule.class";

const TSA_SHARPNESS_DEFAULT = 100;

function clamp8(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function createImageData(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext("2d", { willReadFrequently: true }).createImageData(width, height);
}

function cloneImageData(imageData) {
    const clone = createImageData(imageData.width, imageData.height);
    clone.data.set(imageData.data);
    return clone;
}

function copyPixel(data, dst, i) {
    dst[i] = data[i];
    dst[i + 1] = data[i + 1];
    dst[i + 2] = data[i + 2];
    dst[i + 3] = data[i + 3];
}

function sharpenImageData(imageData, factor) {
    if (!imageData) return null;
    const { width, height, data } = imageData;

    if (Math.abs(factor - 1) < 0.0001) {
        return cloneImageData(imageData);
    }

    const amount = factor - 1;
    if (amount < 0) {
        return blurImageData(imageData, Math.abs(amount));
    }

    const output = createImageData(width, height);
    const dst = output.data;
    const centerWeight = 1 + (4 * amount);
    const sideWeight = -amount;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = ((y * width) + x) * 4;

            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                copyPixel(data, dst, i);
                continue;
            }

            const top = (((y - 1) * width) + x) * 4;
            const bottom = (((y + 1) * width) + x) * 4;
            const left = ((y * width) + (x - 1)) * 4;
            const right = ((y * width) + (x + 1)) * 4;

            for (let c = 0; c < 3; c++) {
                const value =
                    (data[i + c] * centerWeight) +
                    (data[top + c] * sideWeight) +
                    (data[bottom + c] * sideWeight) +
                    (data[left + c] * sideWeight) +
                    (data[right + c] * sideWeight);

                dst[i + c] = clamp8(value);
            }

            dst[i + 3] = data[i + 3];
        }
    }

    return output;
}

function blurImageData(imageData, amount) {
    if (!imageData) return null;
    const { width, height, data } = imageData;
    const output = createImageData(width, height);
    const dst = output.data;
    const blurAmount = Math.min(1, Math.max(0, amount));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = ((y * width) + x) * 4;

            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                copyPixel(data, dst, i);
                continue;
            }

            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const ni = (((y + ky) * width) + (x + kx)) * 4;
                        sum += data[ni + c];
                    }
                }

                const blurred = sum / 9;
                const original = data[i + c];
                dst[i + c] = clamp8(
                    (original * (1 - blurAmount)) + (blurred * blurAmount)
                );
            }

            dst[i + 3] = data[i + 3];
        }
    }

    return output;
}

function applySharpness({
    source,
    outputCanvas,
    sharpness = TSA_SHARPNESS_DEFAULT
}) {
    if (!source) {
        throw new Error("applySharpness requires a source image.");
    }
    if (!outputCanvas) {
        throw new Error("applySharpness requires an output canvas.");
    }

    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    if (!width || !height) {
        throw new Error("applySharpness requires a source with width and height.");
    }

    outputCanvas.width = width;
    outputCanvas.height = height;

    const outputCtx = outputCanvas.getContext("2d", { willReadFrequently: true });
    const originalCanvas = document.createElement("canvas");
    originalCanvas.width = width;
    originalCanvas.height = height;
    const originalCtx = originalCanvas.getContext("2d", { willReadFrequently: true });
    originalCtx.drawImage(source, 0, 0, width, height);

    const original = originalCtx.getImageData(0, 0, width, height);
    const factor = sharpness / 100;
    const output = sharpenImageData(original, factor);
    outputCtx.putImageData(output, 0, 0);
    return outputCanvas;
}

class MosaicThinSectionAnalysisModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Petrographic thin section analysis";
        this.name = "mosaic-thin-section-analysis";
        this.domains = ["ceramic", "geoarchaeology"];
        this.images = [];
        this.selectedImages = new Set();
        this.renderIntoNode = null;
        this.renderComplete = false;
        this.showChartSelector = false;
        this.moduleId = nanoid();
        this.currentLayout = null;
        this.lastDesktopWidth = 0;
        this._resizeObserver = null;
        this.currentView = "gallery";
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

    async render(renderIntoNode = null) {
        super.render();
        this.renderComplete = false;
        if (renderIntoNode) {
            this.renderIntoNode = renderIntoNode;
        }
        if (!this.renderIntoNode) {
            console.warn("Tried to render " + this.name + " without a node to render into!");
            return false;
        }

        $(this.renderIntoNode).empty();

        const tileHtml = `
            <div class="mosaic-tile-content" id="tsa-root-${this.moduleId}">
                <div class="mosaic-tile-header">
                    <h3 class="mosaic-tile-title">${this.title}</h3>
                </div>
                <div class="tsa-body" id="tsa-body-${this.moduleId}"></div>
            </div>
        `;
        $(this.renderIntoNode).append(tileHtml);

        await this.fetchData();
        this.renderGallery();
        this.renderComplete = true;
    }

    async fetchData() {
        this.sqs.setLoadingIndicator(`#tsa-body-${this.moduleId}`, true);
        try {
            const response = await fetch(`${this.sqs.config.dataServerAddress}/images`, {
                method: "GET",
                mode: "cors"
            });
            if (!response.ok) throw new Error(`Status ${response.status}`);
            this.images = await response.json();
        } catch (e) {
            console.error("Failed to fetch thin slice images:", e);
            this.images = [];
        }
        this.sqs.setLoadingIndicator(`#tsa-body-${this.moduleId}`, false);
    }

    renderGallery() {
        this.releaseAllCardProcessingStates();
        this.currentView = "gallery";
        const body = $(`#tsa-body-${this.moduleId}`);
        body.empty();

        if (!this.images.length) {
            body.html('<p class="tsa-empty">No images available.</p>');
            return;
        }

        let gridHtml = `<p class="tsa-gallery-hint">Select the images you wish to inspect and then <button class="tsa-inspect-btn tsa-inspect-btn--inline light-theme-button" id="tsa-inspect-btn-hint-${this.moduleId}" disabled><i class="fa fa-search-plus"></i> Inspect selected</button></p><div class="tsa-gallery-scroll"><div class="tsa-gallery-grid">`;
        this.images.forEach(img => {
            const selected = this.selectedImages.has(img.filename) ? "tsa-selected" : "";
            gridHtml += `
                <div class="tsa-gallery-item ${selected}" data-filename="${img.filename}">
                    <div class="tsa-gallery-imgwrap">
                        <img src="${this.sqs.config.dataServerAddress}/image/${img.filename}" alt="${img.filename}" loading="lazy">
                        <div class="tsa-gallery-overlay"><i class="fa fa-check"></i></div>
                    </div>
                    <div class="tsa-gallery-label">${img.filename}</div>
                </div>
            `;
        });
        gridHtml += `</div></div>`;
        gridHtml += `
            <div class="tsa-gallery-footer">
                <span class="tsa-selection-count" id="tsa-sel-count-${this.moduleId}">
                    ${this.selectedImages.size} selected
                </span>
                <button class="tsa-inspect-btn light-theme-button" id="tsa-inspect-btn-${this.moduleId}"
                    ${this.selectedImages.size === 0 ? "disabled" : ""}>
                    <i class="fa fa-search-plus"></i> Inspect selected
                </button>
            </div>
        `;

        body.html(gridHtml);

        body.find(".tsa-gallery-item").on("click", (e) => {
            const item = $(e.currentTarget);
            const filename = item.data("filename");
            if (this.selectedImages.has(filename)) {
                this.selectedImages.delete(filename);
                item.removeClass("tsa-selected");
            } else {
                this.selectedImages.add(filename);
                item.addClass("tsa-selected");
            }
            $(`#tsa-sel-count-${this.moduleId}`).text(`${this.selectedImages.size} selected`);
            const anySelected = this.selectedImages.size > 0;
            $(`#tsa-inspect-btn-${this.moduleId}`).prop("disabled", !anySelected);
            $(`#tsa-inspect-btn-hint-${this.moduleId}`).prop("disabled", !anySelected);
        });

        const doInspect = () => { if (this.selectedImages.size > 0) this.renderInspect(); };
        $(`#tsa-inspect-btn-${this.moduleId}`).on("click", doInspect);
        $(`#tsa-inspect-btn-hint-${this.moduleId}`).on("click", doInspect);
    }

    renderInspect() {
        this.currentView = "inspect";
        const body = $(`#tsa-body-${this.moduleId}`);
        body.empty();

        const toolbarHtml = `
            <div class="tsa-inspect-toolbar">
                <button class="tsa-back-btn light-theme-button" id="tsa-back-${this.moduleId}">
                    <i class="fa fa-arrow-left"></i> Back to gallery
                </button>
                <span class="tsa-inspect-hint">Drag to reposition</span>
                <div class="tsa-toolbar-tools">
                    <div class="tsa-layout-btns">
                        <button class="tsa-layout-btn light-theme-button" data-layout="row" title="Arrange in a row">
                            <i class="fa fa-pause fa-rotate-90"></i> Row
                        </button>
                        <button class="tsa-layout-btn light-theme-button" data-layout="column" title="Arrange in a column">
                            <i class="fa fa-pause"></i> Column
                        </button>
                        <button class="tsa-layout-btn light-theme-button" data-layout="grid" title="Arrange in a grid">
                            <i class="fa fa-th"></i> Grid
                        </button>
                    </div>
                    <div class="tsa-toolbar-divider" aria-hidden="true"></div>
                    <button class="tsa-zoom-btn light-theme-button" id="tsa-zoom-btn-${this.moduleId}" title="Zoom tool">
                        <i class="fa fa-search-plus"></i> Zoom
                    </button>
                </div>
            </div>
            <div class="tsa-desktop" id="tsa-desktop-${this.moduleId}"></div>
        `;
        body.html(toolbarHtml);

        $(`#tsa-back-${this.moduleId}`).on("click", () => {
            this.cleanupZoomTool();
            $(document).off(`mousemove.tsa-${this.moduleId} mouseup.tsa-${this.moduleId}`);
            this.renderGallery();
        });

        $(body).on("click", ".tsa-layout-btn", (e) => {
            const layout = $(e.currentTarget).data("layout");
            this.applyLayout(layout, `#tsa-desktop-${this.moduleId}`);
        });

        const desktop = $(`#tsa-desktop-${this.moduleId}`);
        this.setupZoomTool(body, desktop);
        const cols = Math.min(this.selectedImages.size, 3);
        const stepX = 280;
        const stepY = 380;
        let col = 0, row = 0;

        this.selectedImages.forEach(filename => {
            const imgId = nanoid();
            const left = 20 + col * stepX;
            const top = 20 + row * stepY;
            const imageUrl = `${this.sqs.config.dataServerAddress}/image/${filename}`;

            const cardHtml = `
                <div class="tsa-image-card" id="tsa-card-${imgId}" style="left:${left}px;top:${top}px">
                    <div class="tsa-card-handle">
                        <span class="tsa-card-name">${filename}</span>
                        <button class="tsa-adjust-toggle" data-imgid="${imgId}" title="Image adjustments">
                            <i class="fa fa-sliders"></i>
                        </button>
                        <button class="tsa-close-btn" data-imgid="${imgId}" title="Remove image">
                            <i class="fa fa-times"></i>
                        </button>
                    </div>
                    <div class="tsa-card-imgwrap">
                        <img class="tsa-card-img" id="tsa-img-${imgId}"
                            src="${imageUrl}"
                            alt="${filename}">
                    </div>
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
                                min="0" max="500" step="1" value="${TSA_SHARPNESS_DEFAULT}">
                            <span class="tsa-ctrl-val">${this.formatSharpnessValue(TSA_SHARPNESS_DEFAULT)}</span>
                        </label>
                        <button class="tsa-apply-all-btn" data-imgid="${imgId}">Apply these settings to all images</button>
                        <button class="tsa-normalize-btn" data-imgid="${imgId}">Normalize settings</button>
                    </div>
                    <div class="tsa-resize-handle"></div>
                </div>
            `;

            desktop.append(cardHtml);

            const $card = $(`#tsa-card-${imgId}`);
            $card.data("filters", {
                brightness: 100, contrast: 100, saturate: 100
            });
            $card.data("sharpness", TSA_SHARPNESS_DEFAULT);
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
                $card.css("height", (240 / ratio) + "px");
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
            const filename = $(`#tsa-card-${imgId}`).find(".tsa-card-name").text();
            this.selectedImages.delete(filename);
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
            card.data("sharpness", TSA_SHARPNESS_DEFAULT);
            card.find(".tsa-ctrl").each((_, input) => {
                const $input = $(input);
                $input.val(defaults[$input.data("filter")]);
                $input.siblings(".tsa-ctrl-val").text("100%");
            });
            card.find(".tsa-sharpness-ctrl").val(TSA_SHARPNESS_DEFAULT);
            card.find(".tsa-sharpness-ctrl").siblings(".tsa-ctrl-val").text(this.formatSharpnessValue(TSA_SHARPNESS_DEFAULT));
            this.renderCardImage(imgId);
        });

        this.setupDraggable(`#tsa-desktop-${this.moduleId}`);
        this.setupResponsive(`#tsa-desktop-${this.moduleId}`);

        // Apply default grid layout once all images have loaded (aspect ratios needed)
        const $imgs = desktop.find(".tsa-card-img").toArray();
        const pending = $imgs.filter(img => !img.complete);
        const doLayout = () => this.applyLayout("grid", `#tsa-desktop-${this.moduleId}`);
        if (!pending.length) {
            doLayout();
        } else {
            let loaded = 0;
            pending.forEach(img => {
                $(img).one("load error", () => { if (++loaded >= pending.length) doLayout(); });
            });
        }
    }

    applyLayout(layout, desktopSelector, animate = true) {
        this.currentLayout = layout;
        const $desktop = $(desktopSelector);
        const snapGrid = 20;
        const desktopW = $desktop.width();
        const cards = $desktop.find(".tsa-image-card").toArray();
        const n = cards.length;
        if (!n) return;

        const snap     = (v) => Math.round(v / snapGrid) * snapGrid;
        // Floor-snap for widths: guarantees cols × cardW ≤ desktopW so cards never overflow the container
        const snapDown = (v) => Math.floor(v / snapGrid) * snapGrid;
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

        if (layout === "row") {
            const cardW = snapDown(Math.max(snapGrid, desktopW / n));
            cards.forEach((card, i) => {
                const $card = $(card);
                const ratio = $card.data("aspectRatio") || 1;
                const cardH = snap(cardW / ratio);
                place($card, card, { left: snap(i * cardW) + "px", top: "0px", width: cardW + "px", height: cardH + "px" });
            });
        } else if (layout === "column") {
            const cardW = snapDown(desktopW);
            let top = 0;
            cards.forEach((card) => {
                const $card = $(card);
                const ratio = $card.data("aspectRatio") || 1;
                const cardH = snap(cardW / ratio);
                place($card, card, { left: "0px", top: top + "px", width: cardW + "px", height: cardH + "px" });
                top = snap(top + cardH);
            });
        } else if (layout === "grid") {
            const cols = Math.ceil(Math.sqrt(n));
            const cardW = snapDown(Math.max(snapGrid, desktopW / cols));
            cards.forEach((card, i) => {
                const $card = $(card);
                const ratio = $card.data("aspectRatio") || 1;
                const cardH = snap(cardW / ratio);
                const col = i % cols;
                const row = Math.floor(i / cols);
                place($card, card, { left: snap(col * cardW) + "px", top: snap(row * cardH) + "px", width: cardW + "px", height: cardH + "px" });
            });
        }
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

        if (sharpness === TSA_SHARPNESS_DEFAULT) {
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
        const body = $(`#tsa-body-${this.moduleId}`);
        body.find(".tsa-image-card").each((_, cardNode) => {
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
            <div class="tsa-zoom-overlay" id="tsa-zoom-overlay-${this.moduleId}" style="display:none;">
                <canvas width="200" height="200"></canvas>
            </div>
        `);
        const lens = $(`<div class="tsa-zoom-lens" id="tsa-zoom-lens-${this.moduleId}" style="display:none;"></div>`);
        $desktop.append(overlay);
        this.zoomOverlay = overlay;
        this.zoomCanvas = overlay.find("canvas")[0];
        this.zoomCtx = this.zoomCanvas.getContext("2d");
        this.updateZoomCanvasSize();
        this.zoomLens = lens;

        $body.on(`click.tsa-zoom-${this.moduleId}`, `#tsa-zoom-btn-${this.moduleId}`, (e) => {
            e.preventDefault();
            const active = !this.zoomToolActive;
            this.zoomToolActive = active;
            $body.find(`#tsa-zoom-btn-${this.moduleId}`).toggleClass("tsa-zoom-btn--active", active);
            $desktop.toggleClass("tsa-desktop--zoom-active", active);
            if (!active) {
                this.hideZoomPreview();
            }
        });

        $desktop.on(`mouseleave.tsa-zoom-${this.moduleId}`, ".tsa-card-imgwrap", () => {
            this.hideZoomPreview();
        });

        $desktop.on(`mousemove.tsa-zoom-${this.moduleId}`, ".tsa-card-imgwrap", (evt) => {
            this.updateZoomPreview(evt, $(evt.currentTarget));
        });

        $desktop.on(`touchstart.tsa-zoom-${this.moduleId}`, ".tsa-card-imgwrap", (evt) => {
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

        $desktop.on(`touchmove.tsa-zoom-${this.moduleId}`, ".tsa-card-imgwrap", (evt) => {
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

        $desktop.on(`touchend.tsa-zoom-${this.moduleId} touchcancel.tsa-zoom-${this.moduleId}`, ".tsa-card-imgwrap", (evt) => {
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

        $desktop.on(`wheel.tsa-zoom-${this.moduleId}`, ".tsa-card-imgwrap", (evt) => {
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
                const boxW = tw + padXLabel * 2;
                const boxH = fontSize + padYLabel * 2;

                const cx = cw / 2;
                const cy = ch / 2;
                const radius = Math.min(cw, ch) / 2;
                const edgeMargin = Math.round(radius * 0.08);
                const halfDiag = Math.hypot(boxW / 2, boxH / 2);
                const maxOffset = Math.max(0, ((radius - edgeMargin) - halfDiag) / Math.SQRT2);
                const offset = maxOffset * 0.95;
                const bx = Math.round(cx + offset - boxW / 2);
                const by = Math.round(cy + offset - boxH / 2);

                this.zoomCtx.fillStyle = "rgba(0,0,0,0.55)";
                this.zoomCtx.fillRect(bx, by, boxW, boxH);
                this.zoomCtx.fillStyle = "#fff";
                this.zoomCtx.textBaseline = "top";
                this.zoomCtx.fillText(label, bx + padXLabel, by + padYLabel);
            }
        }

        if (this.zoomOverlay) {
            const gap = 20;
            const margin = 8;
            const overlayW = this.zoomOverlay.outerWidth() || 200;
            const overlayH = this.zoomOverlay.outerHeight() || 200;
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
            this.zoomBoundBody.off(`.tsa-zoom-${this.moduleId}`);
        }
        if (this.zoomBoundDesktop) {
            this.zoomBoundDesktop.off(`.tsa-zoom-${this.moduleId}`);
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
        let resizeHandleH = 0;
        let topZ = 1;

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
            resizeHandleH = $resizing.find(".tsa-card-handle").outerHeight() || 0;
            $desktop.addClass("tsa-desktop--dragging");
        });

        $desktop.on("mousedown", ".tsa-card-handle", (e) => {
            if ($(e.target).is("input, button")) return;
            e.preventDefault();
            $dragging = $(e.currentTarget).closest(".tsa-image-card");
            bringToFront($dragging);
            const pos = $dragging.position();
            offsetX = e.clientX - pos.left;
            offsetY = e.clientY - pos.top;
            $dragging.addClass("tsa-dragging");
            $desktop.addClass("tsa-desktop--dragging");
        });

        $(document).on(`mousemove.tsa-${this.moduleId}`, (e) => {
            if ($resizing) {
                const newW = Math.max(80, resizeStartW + (e.clientX - resizeStartX));
                const newH = resizeAspectRatio
                    ? (newW / resizeAspectRatio) + resizeHandleH
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

        $(document).on(`mouseup.tsa-${this.moduleId}`, (e) => {
            if ($resizing) {
                const rawW = resizeStartW + (e.clientX - resizeStartX);
                const snappedW = Math.max(snapGrid, Math.round(rawW / snapGrid) * snapGrid);
                const snappedH = resizeAspectRatio
                    ? (snappedW / resizeAspectRatio) + resizeHandleH
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
        this.lastDesktopWidth = $desktop.width();

        let debounceTimer = null;
        this._resizeObserver = new ResizeObserver(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const newW = $desktop.width();
                if (!newW || newW === this.lastDesktopWidth) return;

                if (this.currentLayout) {
                    // Re-apply named layout to the new width, no animation
                    this.applyLayout(this.currentLayout, desktopSelector, false);
                } else {
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
                            props.height = (newCardW / ar) + "px";
                        }
                        $card.css(props);
                    });
                }
                this.lastDesktopWidth = newW;
            }, 100);
        });
        this._resizeObserver.observe(el);
    }

    async update() {
        this.render();
    }

    async unrender() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        this.releaseAllCardProcessingStates();
        this.cleanupZoomTool();
        $(document).off(`mousemove.tsa-${this.moduleId} mouseup.tsa-${this.moduleId}`);
        return super.unrender();
    }

    getAvailableExportFormats() {
        return [];
    }

    exportCallback() {
        if (this.currentView === "inspect") {
            this._exportSton();
        } else {
            this._exportGallery();
        }
    }

    _exportGallery() {
        const filenames = this.images.map(img => img.filename);
        if (!filenames.length) return;

        const jsonBtnId = nanoid();
        const csvBtnId  = nanoid();
        const xlsxBtnId = nanoid();

        const html = `
            <div class='dialog-centered-content-container'>
                <a id='${jsonBtnId}' class='site-report-export-download-btn light-theme-button'>Image list as JSON</a>
                <a id='${csvBtnId}'  class='site-report-export-download-btn light-theme-button'>Image list as CSV</a>
                <a id='${xlsxBtnId}' class='site-report-export-download-btn light-theme-button'>Image list as Excel</a>
            </div>
        `;
        this.sqs.dialogManager.showPopOver("Export image list", html);

        const dismiss = () => setTimeout(() => this.sqs.dialogManager.hidePopOver(), 800);

        $(`#${jsonBtnId}`).on("click", () => {
            const blob = new Blob([JSON.stringify(filenames, null, 2)], { type: "application/json;charset=utf-8" });
            saveAs(blob, "sead_thin_slice_images.json");
            dismiss();
        });

        $(`#${csvBtnId}`).on("click", () => {
            const parser = new Parser({ fields: ["filename"] });
            const csv = parser.parse(filenames.map(f => ({ filename: f })));
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            saveAs(blob, "sead_thin_slice_images.csv");
            dismiss();
        });

        $(`#${xlsxBtnId}`).on("click", () => {
            // Simple TSV wrapped in xls mime so Excel opens it natively
            const tsv = ["filename", ...filenames].join("\n");
            const blob = new Blob([tsv], { type: "application/vnd.ms-excel;charset=utf-8" });
            saveAs(blob, "sead_thin_slice_images.xls");
            dismiss();
        });
    }

    async _exportSton() {
        const selectedFilenames = [...this.selectedImages];
        if (!selectedFilenames.length) return;

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
                <a id='${stonBtnId}' class='site-report-export-download-btn light-theme-button'>
                    <i class='fa fa-download'></i> Download STON bundle (${selectedFilenames.length} image${selectedFilenames.length !== 1 ? "s" : ""})
                </a>
            </div>
        `;
        this.sqs.dialogManager.showPopOver("Export for STON", html);

        $(`#${stonBtnId}`).on("click", async () => {
            $(`#${stonBtnId}`).prop("disabled", true).text("Building zip\u2026");

            const zip = new JSZip();
            zip.file("STON.conf", stonConf);
            const imgFolder = zip.folder("images");

            await Promise.all(selectedFilenames.map(async (filename) => {
                try {
                    const url = `${this.sqs.config.dataServerAddress}/image/${encodeURIComponent(filename)}`;
                    const resp = await fetch(url, { mode: "cors" });
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const blob = await resp.blob();
                    imgFolder.file(filename, blob);
                } catch (e) {
                    console.warn(`STON export: could not fetch ${filename}:`, e);
                }
            }));

            const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
            saveAs(zipBlob, "sead_ston_export.zip");
            setTimeout(() => this.sqs.dialogManager.hidePopOver(), 800);
        });
    }
}

export default MosaicThinSectionAnalysisModule;
