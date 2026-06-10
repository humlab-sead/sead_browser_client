/**
 * MosaicGridLayout
 *
 * Self-contained grid layout engine for the mosaic tiled window manager.
 * All coordinates use 1-based column/row units. Column units are out of
 * COL_COUNT (12). Row height is configured from the active domain layout.
 * GAP is the gutter between tiles and the container padding.
 *
 * Tile descriptors:
 *   { id, col, row, w, h, minW, minH }
 *
 * No DOM interaction — callers supply the container element when pixel
 * geometry is needed.
 */
class MosaicGridLayout {
    constructor() {
        this.COL_COUNT = 12;
        this.ROW_H     = 80;   // px per row unit
        this.MIN_ROW_H = 80;   // px per row unit
        this.GAP       = 12;   // px gutter / container padding
    }

    // ─── collision helpers ────────────────────────────────────────────────────

    overlaps(a, b) {
        return (
            a.col < b.col + b.w &&
            a.col + a.w > b.col &&
            a.row < b.row + b.h &&
            a.row + a.h > b.row
        );
    }

    /**
     * After placing `movedId` at its new position push every other tile that
     * overlaps downward — recursively until nothing overlaps.
     * Works on a copy of the layout so callers can roll back.
     */
    resolveCollisions(layout, movedId) {
        const sorted = [...layout].sort((a, b) =>
            a.row !== b.row ? a.row - b.row : a.col - b.col
        );

        let changed = true;
        let iterations = 0;
        while (changed && iterations < 100) {
            changed = false;
            iterations++;
            for (let i = 0; i < sorted.length; i++) {
                for (let j = 0; j < sorted.length; j++) {
                    if (i === j) continue;
                    const a = sorted[i];
                    const b = sorted[j];
                    if (!this.overlaps(a, b)) continue;

                    const pushTarget = b.id === movedId ? a : b;
                    const anchor     = b.id === movedId ? b : a;
                    const newRow     = anchor.row + anchor.h;
                    if (pushTarget.row !== newRow) {
                        pushTarget.row = newRow;
                        changed = true;
                    }
                }
            }
        }
        return sorted;
    }

    /**
     * Compact the layout upward: for every tile (top-to-bottom) move it up
     * as far as possible without overlapping anything above it.
     */
    compactLayout(layout, lockedId = null) {
        const sorted = [...layout].sort((a, b) =>
            a.row !== b.row ? a.row - b.row : a.col - b.col
        );

        for (let i = 0; i < sorted.length; i++) {
            const tile = sorted[i];
            if(tile.id === lockedId) {
                continue;
            }
            let targetRow = 1;

            while (targetRow < tile.row) {
                const candidate = { ...tile, row: targetRow };
                const hasOverlap = sorted
                    .slice(0, i)
                    .some(other => this.overlaps(candidate, other));
                if (!hasOverlap) {
                    tile.row = targetRow;
                    break;
                }
                targetRow++;
            }
        }
        return sorted;
    }

    /**
     * Apply a new position for movedId, resolve collisions, compact, and
     * return the updated layout. Returns null if the move is invalid.
     */
    applyLayout(layout, movedId, newCol, newRow, newW, newH) {
        const movedTile = layout.find(t => t.id === movedId);
        if (!movedTile) return null;

        newCol = Math.max(1, Math.min(this.COL_COUNT - newW + 1, newCol));
        newRow = Math.max(1, newRow);
        newW   = Math.max(movedTile.minW, Math.min(this.COL_COUNT - newCol + 1, newW));
        newH   = Math.max(movedTile.minH, newH);

        let updated = layout.map(t =>
            t.id === movedId
                ? { ...t, col: newCol, row: newRow, w: newW, h: newH }
                : { ...t }
        );

        updated = this.resolveCollisions(updated, movedId);
        updated = this.compactLayout(updated, movedId);
        return updated;
    }

    // ─── geometry helpers ─────────────────────────────────────────────────────

    getColWidth(containerEl) {
        const available = containerEl.clientWidth - this.GAP * 2;
        return (available - this.GAP * (this.COL_COUNT - 1)) / this.COL_COUNT;
    }

    gridToPixel(col, row, w, h, containerEl) {
        const cw = this.getColWidth(containerEl);
        return {
            x:      this.GAP + (col - 1) * (cw + this.GAP),
            y:      this.GAP + (row - 1) * (this.ROW_H + this.GAP),
            width:  w * cw + (w - 1) * this.GAP,
            height: h * this.ROW_H + (h - 1) * this.GAP,
        };
    }

    pixelToGrid(px, py, containerEl) {
        const cw = this.getColWidth(containerEl);
        return {
            col: Math.max(1, Math.round((px - this.GAP) / (cw + this.GAP)) + 1),
            row: Math.max(1, Math.round((py - this.GAP) / (this.ROW_H + this.GAP)) + 1),
        };
    }

    roundGridDelta(value) {
        return value >= 0
            ? Math.floor(value + 0.5)
            : Math.ceil(value - 0.5);
    }

    rectsOverlapHorizontally(a, b) {
        return a.x < b.x + b.width && a.x + a.width > b.x;
    }

    verticalEdgeGridDelta(dy, tileHeight) {
        const rowUnit = this.ROW_H + this.GAP;
        const threshold = rowUnit - tileHeight / 2;

        if(dy >= threshold) {
            return Math.floor((dy - threshold) / rowUnit) + 1;
        }
        if(dy <= -threshold) {
            return -Math.floor((-dy - threshold) / rowUnit) - 1;
        }
        return 0;
    }

    verticalEdgeToGridRow(px, py, descriptor, startDescriptor, layout, containerEl) {
        const startPixel = this.gridToPixel(
            startDescriptor.col, startDescriptor.row, startDescriptor.w, startDescriptor.h, containerEl
        );
        const draggedPixel = {
            x: px,
            y: py,
            width: startPixel.width,
            height: startPixel.height,
        };
        const dy = py - startPixel.y;

        if(dy > 0) {
            const targetsBelow = layout
                .filter(tile => tile.id !== descriptor.id && tile.row > startDescriptor.row)
                .map(tile => ({ tile, pixel: this.gridToPixel(tile.col, tile.row, tile.w, tile.h, containerEl) }))
                .filter(target => this.rectsOverlapHorizontally(draggedPixel, target.pixel))
                .sort((a, b) => a.tile.row - b.tile.row);

            if(targetsBelow.length == 0) {
                return startDescriptor.row + this.verticalEdgeGridDelta(dy, draggedPixel.height);
            }

            let row = startDescriptor.row;
            targetsBelow.forEach(target => {
                if(draggedPixel.y + draggedPixel.height >= target.pixel.y + target.pixel.height / 2) {
                    row = target.tile.row;
                }
            });
            return row;
        }

        if(dy < 0) {
            const targetsAbove = layout
                .filter(tile => tile.id !== descriptor.id && tile.row < startDescriptor.row)
                .map(tile => ({ tile, pixel: this.gridToPixel(tile.col, tile.row, tile.w, tile.h, containerEl) }))
                .filter(target => this.rectsOverlapHorizontally(draggedPixel, target.pixel))
                .sort((a, b) => b.tile.row - a.tile.row);

            if(targetsAbove.length == 0) {
                return startDescriptor.row + this.verticalEdgeGridDelta(dy, draggedPixel.height);
            }

            let row = startDescriptor.row;
            targetsAbove.forEach(target => {
                if(draggedPixel.y <= target.pixel.y + target.pixel.height / 2) {
                    row = target.tile.row;
                }
            });
            return row;
        }

        return startDescriptor.row;
    }

    tilePixelToGrid(px, py, descriptor, startDescriptor, layout, containerEl) {
        const cw = this.getColWidth(containerEl);
        const colStep = Math.max(1, descriptor.w) * (cw + this.GAP);
        const startPixel = this.gridToPixel(
            startDescriptor.col, startDescriptor.row, startDescriptor.w, startDescriptor.h, containerEl
        );
        const colDelta = this.roundGridDelta((px - startPixel.x) / colStep) * descriptor.w;
        const row = this.verticalEdgeToGridRow(px, py, descriptor, startDescriptor, layout, containerEl);

        // Horizontal snapping still uses the tile span because the layout has
        // finer internal columns than the configured domain grid.
        return {
            col: Math.max(1, startDescriptor.col + colDelta),
            row: Math.max(1, row),
        };
    }

    getRequiredHeight(layout) {
        const maxRow = layout.reduce((m, t) => Math.max(m, t.row + t.h - 1), 0);
        return this.GAP + maxRow * (this.ROW_H + this.GAP);
    }

    // ─── config translation ───────────────────────────────────────────────────

    configureForDomain(domain, containerEl) {
        if(!domain || !Array.isArray(domain.result_grid_layout)) {
            return;
        }

        const rows = parseInt(domain.result_grid_layout[0], 10) || 1;
        const heightSource = containerEl && containerEl.parentElement
            ? containerEl.parentElement
            : containerEl;

        if(!heightSource) {
            return;
        }

        const parentStyle = window.getComputedStyle(heightSource);
        const parentPadV = parseFloat(parentStyle.paddingTop) + parseFloat(parentStyle.paddingBottom);
        const availableHeight = heightSource.clientHeight - parentPadV - this.GAP * 2 - this.GAP * (rows - 1);
        if(availableHeight > 0) {
            this.ROW_H = Math.max(this.MIN_ROW_H, Math.floor(availableHeight / rows));
        }
    }

    parseGridPlacement(value) {
        if(typeof value == "undefined" || value == null) {
            return { start: null, span: 1 };
        }

        const parts = value.toString().trim().split("/").map(part => part.trim()).filter(part => part != "");
        if(parts.length == 0) {
            return { start: null, span: 1 };
        }

        const first = this.parseGridPlacementPart(parts[0]);
        if(parts.length == 1) {
            return first;
        }

        const second = this.parseGridPlacementPart(parts[1]);
        if(first.start != null && second.start != null) {
            return { start: first.start, span: Math.max(1, second.start - first.start) };
        }

        if(first.start != null && second.span != null) {
            return { start: first.start, span: second.span };
        }

        if(first.span != null && second.start != null) {
            return { start: Math.max(1, second.start - first.span), span: first.span };
        }

        return first;
    }

    parseGridPlacementPart(value) {
        const str = value.toString().trim();
        const spanMatch = str.match(/^span\s+(\d+)$/i);
        if(spanMatch) {
            return { start: null, span: parseInt(spanMatch[1], 10) || 1 };
        }

        const start = parseInt(str, 10);
        if(!isNaN(start)) {
            return { start, span: null };
        }

        return { start: null, span: null };
    }

    findFirstAvailableColumn(row, colSpan, rowSpan, domainCols, existingLayout, colUnit) {
        for(let col = 1; col <= domainCols - colSpan + 1; col++) {
            const candidate = {
                col: (col - 1) * colUnit + 1,
                row,
                w: colSpan * colUnit,
                h: rowSpan,
            };

            const hasOverlap = existingLayout.some(tile => this.overlaps(candidate, tile));
            if(!hasOverlap) {
                return col;
            }
        }

        return 1;
    }

    /**
     * Translate a CSS-grid-style module config entry into a tile descriptor
     * for the 12-column layout engine.
     *
     * @param {object} mConf  - module config with grid_row / grid_column
     * @param {number} domainRows - number of CSS grid rows from result_grid_layout
     * @param {number} domainCols - number of CSS grid columns from result_grid_layout
     * @param {string} id     - unique tile id
     * @param {Array} existingLayout - descriptors already translated for this domain
     * @returns {{ id, col, row, w, h, minW, minH }}
     */
    tileFromModuleConf(mConf, domainRows, domainCols, id, existingLayout = []) {
        const colUnit = Math.floor(this.COL_COUNT / Math.max(1, domainCols));

        const rowPlacement = this.parseGridPlacement(mConf.grid_row);
        const colPlacement = this.parseGridPlacement(mConf.grid_column);

        const gridRow = Math.max(1, rowPlacement.start || 1);
        const rowSpan = Math.max(1, Math.min(rowPlacement.span || 1, domainRows - gridRow + 1));
        let colSpan = Math.max(1, Math.min(colPlacement.span || 1, domainCols));

        let gridCol = colPlacement.start;
        if(gridCol == null) {
            gridCol = this.findFirstAvailableColumn(gridRow, colSpan, rowSpan, domainCols, existingLayout, colUnit);
        }
        gridCol = Math.max(1, Math.min(domainCols, gridCol));
        colSpan = Math.min(colSpan, domainCols - gridCol + 1);

        return {
            id,
            col:  (gridCol - 1) * colUnit + 1,
            row:  gridRow,
            w:    colSpan * colUnit,
            h:    rowSpan,
            minW: Math.max(1, colUnit),
            minH: 1,
        };
    }
}

export { MosaicGridLayout as default };
