# Release 2026-06.0

Changes since **2025-05.1**.

---

## Highlights

### MCR Charts
Mutual Climatic Range (MCR) analysis is now available as a dedicated chart view in the site report analyses section. MCR charts visualise the reconstructed climatic range for an assemblage and are displayed alongside other analysis results.

### Map Enhancements
The result map has been significantly extended:

- **External overlay layers**: A new overlays panel lets users toggle on/off external reference layers (e.g. SGU geological data), complete with legends. Layers are fetched on demand rather than pre-loaded, keeping initial load fast.
- **Layer management control**: A dedicated layer/overlay management UI replaces the old approach. Users can switch between overlay layers and see their status at a glance.
- **Base layer selector**: Users can now switch between different background/base map tile layers in the sample location maps (site report) and the map filter/facet.
- The individual site points layer is now the default map mode, with improved rendering performance.
- Bing Maps and ArcticDEM removed (no longer functional); replaced with a broader selection of map providers (#405, #414).

### Quick Search
A quick search feature has been added, allowing users to find sites or records without first navigating through the full facet filter workflow.

---

## New Features

### Result Table
- Added a **Country** column with asynchronous country lookup, so each result row now shows the country the site is located in.
- Improved rendering of the method stack column.

### Taxon Features
- Added **GBIF** and **Wikimedia Commons** as additional taxon image providers, broadening image coverage for taxa.
- Taxa list mosaic tiles now support **PNG chart export**.
- Improved rendering of measured values in the taxon datasheet; datasheet content updated.

### Site Report
- Sample dates are now displayed where data is available.
- Eco codes are now shown as percentages rather than raw counts (#346).
- Datasets (methods) are now sorted by name within the analyses section.
- Method colors are applied to analysis buttons/tags for easier visual identification.
- Improved handling of links in sample group descriptions.
- Dataset name is now included in data tables.
- Various site report table layout refinements.

### Export System
- Full-site data exports (JSON, XLSX, CSV) now route through a unified `ExportManager`, replacing the previous ad-hoc approach in `SiteReport`.
- Added CSV export support for full site data exports.
- Added dataset-level export enrichment and sample group description exports.

### UI/UX
- **Height-adjustable filters panel**: the filter section can now be resized vertically by dragging.
- **Help/Quickstart buttons** added above the filters panel for easier discoverability.
- **Feedback button** added to the interface.
- **Selection count** shown in discrete facet headers.
- Upgraded tooltip system with improved styling throughout.
- Improved the quickstart "What is SEAD?" dialog with domain images.
- Clicking outside an overlay panel now closes it.
- Improved section switching and left/right section resizing.
- Country polygons added as a reference layer in the map filter/facet (non-clickable).
- Timeline result module enabled.

### Deployment & Build
- Added HTTPS/scheme support for multi-scheme deployments.
- `SBC_BUILD` Docker build argument added for selecting the npm build script.

---

## Bug Fixes

- Fixed left/right section hide/show buttons going missing.
- Fixed resize handle disappearing in the filters panel.
- Fixed clicking the site report button also selecting the table row.
- Fixed active result module not being restored correctly after domain or navigation changes.
- Fixed result section not defaulting to map in certain situations.
- Fixed manual input on range filters not working.
- Fixed some map overlay layers having identical names.
- Fixed site reports not showing samples (#325).
- Fixed method acronym generation.
- Fixed `EntityAgesDataset` rendering.
- Stylesheet and SCSS deprecation fixes.
- Various minor rendering and layout fixes.

---

## Dependencies & Security

- DOMPurify updated (security patch).
- Lodash, Sass/SCSS, and ChartJS datalabels updated.
- Various dependency updates via dependabot (multi, eazy-logger, http-proxy-middleware).
- Removed unused packages; `deepmerge` moved to production dependencies.
