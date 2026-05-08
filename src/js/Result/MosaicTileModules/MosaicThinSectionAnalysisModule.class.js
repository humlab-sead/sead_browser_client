import { nanoid } from "nanoid";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Parser } from "@json2csv/plainjs";
import MosaicTileModule from "./MosaicTileModule.class";

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

            const cardHtml = `
                <div class="tsa-image-card" id="tsa-card-${imgId}" style="left:${left}px;top:${top}px">
                    <div class="tsa-card-handle">
                        <span class="tsa-card-name">${filename}</span>
                        <button class="tsa-adjust-toggle" data-imgid="${imgId}" title="Image adjustments">
                            <i class="fa fa-sliders"></i>
                        </button>
                        <i class="fa fa-arrows tsa-drag-icon"></i>
                    </div>
                    <div class="tsa-card-imgwrap">
                        <img class="tsa-card-img" id="tsa-img-${imgId}"
                            src="${this.sqs.config.dataServerAddress}/image/${filename}"
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
                            <input type="range" class="tsa-ctrl" data-filter="sharpness" data-imgid="${imgId}"
                                min="0" max="100" value="100">
                            <span class="tsa-ctrl-val">100%</span>
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
                brightness: 100, contrast: 100, saturate: 100, sharpness: 100
            });

            const $img = $card.find(".tsa-card-img");
            const applyAspectRatio = () => {
                const nat = $img[0];
                if (!nat.naturalWidth || !nat.naturalHeight) return;
                const ratio = nat.naturalWidth / nat.naturalHeight;
                $card.data("aspectRatio", ratio);
                const handleH = $card.find(".tsa-card-handle").outerHeight() || 0;
                $card.css("height", (240 / ratio + handleH) + "px");
            };
            if ($img[0].complete) { applyAspectRatio(); }
            else { $img.on("load", applyAspectRatio); }

            col++;
            if (col >= cols) {
                col = 0;
                row++;
            }
        });

        desktop.on("click", ".tsa-adjust-toggle", (e) => {
            e.stopPropagation();
            const btn = $(e.currentTarget);
            const card = btn.closest(".tsa-image-card");
            card.find(".tsa-card-controls").toggle();
            btn.toggleClass("tsa-adjust-toggle--active");
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
            this.applyFilters(imgId, filters);
        });

        desktop.on("click", ".tsa-apply-all-btn", (e) => {
            const srcImgId = $(e.currentTarget).data("imgid");
            const srcFilters = $(`#tsa-card-${srcImgId}`).data("filters");
            desktop.find(".tsa-image-card").each((_, card) => {
                const $card = $(card);
                const targetImgId = $card.find(".tsa-ctrl").first().data("imgid");
                if (!targetImgId) return;
                const targetFilters = $card.data("filters");
                Object.assign(targetFilters, srcFilters);
                $card.find(".tsa-ctrl").each((_, input) => {
                    const $input = $(input);
                    const f = $input.data("filter");
                    $input.val(srcFilters[f]);
                    $input.siblings(".tsa-ctrl-val").text(srcFilters[f] + "%");
                });
                this.applyFilters(targetImgId, targetFilters);
            });
        });

        desktop.on("click", ".tsa-normalize-btn", (e) => {
            const imgId = $(e.currentTarget).data("imgid");
            const card = $(`#tsa-card-${imgId}`);
            const defaults = { brightness: 100, contrast: 100, saturate: 100, sharpness: 100 };
            const filters = card.data("filters");
            Object.assign(filters, defaults);
            card.find(".tsa-ctrl").each((_, input) => {
                const $input = $(input);
                $input.val(defaults[$input.data("filter")]);
                $input.siblings(".tsa-ctrl-val").text("100%");
            });
            this.applyFilters(imgId, filters);
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
                const handleH = $card.find(".tsa-card-handle").outerHeight() || 0;
                const cardH = snap((cardW / ratio) + handleH);
                place($card, card, { left: snap(i * cardW) + "px", top: "0px", width: cardW + "px", height: cardH + "px" });
            });
        } else if (layout === "column") {
            const cardW = snapDown(desktopW);
            let top = 0;
            cards.forEach((card) => {
                const $card = $(card);
                const ratio = $card.data("aspectRatio") || 1;
                const handleH = $card.find(".tsa-card-handle").outerHeight() || 0;
                const cardH = snap((cardW / ratio) + handleH);
                place($card, card, { left: "0px", top: top + "px", width: cardW + "px", height: cardH + "px" });
                top = snap(top + cardH);
            });
        } else if (layout === "grid") {
            const cols = Math.ceil(Math.sqrt(n));
            const cardW = snapDown(Math.max(snapGrid, desktopW / cols));
            cards.forEach((card, i) => {
                const $card = $(card);
                const ratio = $card.data("aspectRatio") || 1;
                const handleH = $card.find(".tsa-card-handle").outerHeight() || 0;
                const cardH = snap((cardW / ratio) + handleH);
                const col = i % cols;
                const row = Math.floor(i / cols);
                place($card, card, { left: snap(col * cardW) + "px", top: snap(row * cardH) + "px", width: cardW + "px", height: cardH + "px" });
            });
        }
    }

    applyFilters(imgId, filters) {
        const blur = ((100 - filters.sharpness) / 100) * 3;
        const css = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) blur(${blur.toFixed(2)}px)`;
        $(`#tsa-img-${imgId}`).css("filter", css);
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
                            const handleH = $card.find(".tsa-card-handle").outerHeight() || 0;
                            props.height = (newCardW / ar + handleH) + "px";
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
