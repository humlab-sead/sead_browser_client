# SEAD Browser Client — JS API Summary

A reference for the JavaScript API used to drive **filters/facets** and the **result section and its modules**.

Everything hangs off the single application instance created in [main.js](../src/js/main.js) and exposed globally as `window.sqs` (a [SeadQuerySystem](../src/js/SeadQuerySystem.class.js) instance). All examples below assume you have that instance, either as `window.sqs` from the console or as `this.sqs` from inside a class.

```js
sqs.facetManager   // FacetManager  - all filter/facet control
sqs.resultManager  // ResultManager - result view switching + data orchestration
sqs.domainManager  // DomainManager - domain switching (drives which filters/tiles exist)
sqs.stateManager   // StateManager  - viewstate save/load
```

---

## Table of contents

1. [Event bus](#1-event-bus)
2. [FacetManager](#2-facetmanager)
3. [Facet base class](#3-facet-base-class)
4. [Facet subclasses](#4-facet-subclasses)
5. [Facet state and the Data Exchange Format](#5-facet-state-and-the-data-exchange-format)
6. [ResultManager](#6-resultmanager)
7. [ResultModule base class](#7-resultmodule-base-class)
8. [Result modules](#8-result-modules)
9. [Mosaic tile modules](#9-mosaic-tile-modules)
10. [DomainManager](#10-domainmanager)
11. [Recipes](#11-recipes)
12. [Gotchas](#12-gotchas)

---

## 1. Event bus

All cross-module coordination goes through the SQS event registry, which wraps jQuery window events. Defined in [SeadQuerySystem.class.js:1017-1117](../src/js/SeadQuerySystem.class.js#L1017-L1117).

| Method | Description |
| --- | --- |
| `sqs.sqsEventDispatch(eventName, args)` | Fire an event. `args` becomes the second argument (`data`) of listeners. |
| `sqs.sqsEventListen(eventName, callback, owner = null)` | Register a listener. `callback(event, data)`. Pass `owner` (usually `this`) so you can unlisten selectively. |
| `sqs.sqsEventUnlisten(eventName, owner = null)` | Remove listeners for that `eventName` **and** that exact `owner`. The underlying jQuery handler is only torn down when no owners remain. |
| `sqs.sqsEventListenToGroup(events, callback, owner)` | Fire `callback` once, after *every* event in the `events` array has fired at least once. Auto-unlistens afterwards. |

Some legacy code dispatches with `$.event.trigger(name, data)` and listens with `$(window).on(name, ...)` directly — functionally equivalent, since the SQS registry sits on the same window events.

### Events relevant to filters and results

| Event | Payload | Fired by / meaning |
| --- | --- | --- |
| `seadFacetSelection` | `{ facet, filter }` | A facet's selections changed. `filter` is non-null only for multistage facets. Drives both the downstream facet chain refetch and `ResultManager.updateResultView()`. |
| `seadFacetDeletion` | `{ facet }` | A facet was destroyed. |
| `seadFacetMove` | `{ facet }` | A facet was dragged to a new slot. |
| `sqsFacetPreAdd` / `sqsFacetPostAdd` | `facet` | Around `FacetManager.addFacet()`. |
| `sqsFacetPreRemove` / `sqsFacetPostRemove` | `facet` | Around `FacetManager.removeFacet()`. |
| `facetDataRendered` | — | A facet finished rendering its data. |
| `facetResize` | — | A facet was resized by the user. |
| `seadFacetPendingDataFetchQueueEmpty` | — | All queued facet fetches completed; ResultManager un-suspends result fetching. |
| `seadResultMenuSelection` | `{ selection }` | The user picked a result view in the result menu. Every result module listens to this to activate/deactivate itself. |
| `resultModuleRenderComplete` | — | Active result module finished rendering. |
| `domainChanged` | `domainName` (string) | Domain switched. FacetManager destroys and rebuilds all facets; ResultManager re-renders the active module. |
| `layoutResize` | — | Viewport/pane resized. |
| `layoutSwitchMode` | — | Desktop ⇄ mobile mode switch. **The layout mode value updates *after* this dispatch**, so listeners use `setTimeout(..., 0)`. |
| `MAP_LAYER_VISIBILITY_CHANGED` | `{ layerId }` | ResultMap changed its visible data layer. |
| `seadStateLoad` / `seadStatePreLoad` / `seadStatePostLoad` / `seadStateLoadFailed` | `{ state }` | Viewstate lifecycle. |
| `sqsInitComplete` | — | Bootstrap finished. |

---

## 2. FacetManager

[FacetManager.class.js](../src/js/FacetManager.class.js) — owns the facet chain: which facets exist, in what order, and how data fetches cascade through them.

### Model

The chain is three parallel structures:

* `facetManager.facets` — array of `Facet` instances.
* `facetManager.slots` — array of `Slot` instances (the visual positions in `#facet-section`).
* `facetManager.links` — array of `{ facetId, slotId }` mapping facets to slots. **This is the authoritative ordering** — `facets[]` order is not the chain order.

Slot ids start at **1**. A facet in slot *n* filters facets in slots *n+1* and below, and the last facet in the chain is the one whose data drives the result view.

### Creating and removing facets

```js
// The one-liner: create + add + fetch, optionally with preset selections
sqs.facetManager.spawnFacet("country", [1, 2, 3]);
sqs.facetManager.spawnFacet("country", [], /* triggerResultLoad = */ false);
```

| Method | Description |
| --- | --- |
| `spawnFacet(facetName, selections = [], triggerResultLoad = true)` | Shorthand for `getFacetTemplateByFacetId` → `makeNewFacet` → `setSelections` → `addFacet`. Returns the facet, or `false` if a facet with that name already exists. When `triggerResultLoad` is true it suspends result fetching, unrenders the active result module, refetches and un-suspends. |
| `getFacetTemplateByFacetId(facetName)` | Look up the facet template (type, title, color, …) from `sqs.facetDef`. Returns `false` if not found. |
| `makeNewFacet(template)` | Instantiate the right subclass for `template.type` (`discrete`, `range`, `rangesintersect`, `geopolygon`, `multistage`), plus the special-cased `analysis_entity_ages` → `Timeline`. Returns `false` on unknown type. |
| `addFacet(facet, minimizeOthers = false, insertIntoSlotPosition = null)` | Attach an instantiated facet: allocate a slot, wire the links, queue a data fetch. Dispatches `sqsFacetPreAdd` / `sqsFacetPostAdd`. |
| `batchAddFacets(facetDefinitions)` | Add many at once from viewstate-format definitions (`{ name, position, selections, minimized }`). Used by the state loader. |
| `removeFacet(facet)` | Detach from slots/links and compact the chain. **Prefer `facet.destroy()`** — it removes the DOM, broadcasts `seadFacetDeletion` and lets FacetManager call this for you. |
| `removeAllFacets()` | Destroy every facet and reset slots/links. |
| `reset()` | Suspend result fetching, destroy all facets, un-suspend. The clean "start over" call. |

### Lookup

| Method | Returns |
| --- | --- |
| `getFacetById(facetId)` | Facet or `false` |
| `getFacetByName(facetName)` | Facet or `null` (see [Gotchas](#12-gotchas)) |
| `getLastFacet(excludeDeletedFacets = true)` | The facet in the highest-numbered slot — the one that produces the result set |
| `getNextFacetFromFacet(facet)` | The facet one slot below, or `false` |
| `getSlotById(slotId)` / `getSlotByFacet(facet)` | Slot |
| `getSlotIdByFacetId(facetId)` / `getFacetIdBySlotId(slotId)` | id |
| `getLinks()` | The raw `links` array |
| `getLastTriggeringFacet()` / `setLastTriggeringFacet(facetOrId)` | The facet that initiated the current request cycle |
| `facetsHasSelections()` | `true` if any non-deleted facet has a selection |

### Data fetching

| Method | Description |
| --- | --- |
| `queueFacetDataFetch(facet)` | The normal "load this facet's data" call. Fetches immediately unless fetching is suspended, in which case it queues. No-op for disabled facets. |
| `chainQueueFacetDataFetch(fromFacet = null)` | Queue fetches for `fromFacet` **and every facet below it** in the chain. Defaults to the facet in slot 1. This is what a selection change triggers. |
| `setFacetDataFetchingSuspended(bool)` | Suspend/resume. Resuming flushes the queue immediately — wrap batch operations in `true` … `false` to avoid a request per facet. |
| `clearFacetData()` | Clear data on all facets. |

### UI control

| Method | Description |
| --- | --- |
| `showOnlySelections(onOff, doNotManipulateFacets = false)` | Minimize (or maximize) every facet — the "show only selections" toggle. Pass `doNotManipulateFacets = true` to only update the button state. |
| `updateShowOnlySelectionsControl()` | Re-derive the toggle state from how many facets are currently minimized. |
| `moveFacets(dropSlotId, dropFacetId, dragSlotId, dragFacetId)` | Reorder the chain (drag & drop). Refuses if the drop target facet is locked. |
| `updateAllFacetPositions()` / `updateAllSlotSizes()` / `updateSlotArrows()` | Re-sync the visual layout to the link structure. |
| `toggleDebug()` | Show the per-filter SQL buttons and hidden menu items. |
| `buildFilterStructure(domainName)` | Recompute which filters are available for a domain and rebuild the filter menu. Called on `domainChanged`. |

---

## 3. Facet base class

[Facet.class.js](../src/js/Facet.class.js) — common behaviour for all filter types.

### Constructor

```js
new Facet(sqs, id, template)
```

`template` comes from `facetManager.getFacetTemplateByFacetId()` and supplies `name`, `type`, `title`, `color`, `description`, and `virtual`.

### Properties

| Property | Meaning |
| --- | --- |
| `id` | Numeric facet instance id (assigned by `FacetManager.getNewFacetId()`) |
| `name` | Server-side facet code, e.g. `"country"`, `"analysis_entity_ages"` |
| `type` | `discrete` \| `range` \| `rangesintersect` \| `geopolygon` \| `multistage` |
| `title`, `description`, `color` | Display metadata |
| `data` | Imported items for this facet |
| `selections` | Current selections (format is subclass-specific) |
| `inactiveSelections` | Selections whose items are no longer present in the current data |
| `isDataLoaded`, `rendered`, `minimized`, `deleted`, `locked`, `enabled` | State flags |
| `dataFetchingEnabled` | Set `false` to make `fetchData()` a no-op |
| `virtual` | A virtual facet participates in the chain but renders no UI |
| `sql` | SQL for the last request (shown by the per-facet SQL button) |
| `requestId` | Guards against stale responses |

### Methods

| Method | Description |
| --- | --- |
| `setSelections(selections, append = true)` | **Virtual** — each subclass implements it. Normally triggers a refetch + `broadcastSelection()`. |
| `getSelections()` | **Virtual** |
| `hasSelection()` | `true` if this facet is actually constraining anything. Range facets override this (a full-span selection doesn't count). |
| `fetchData(render = true)` | POST the current facet state to `/api/facets/load`, then `importData()` + `renderData()`. Discards responses whose `RequestId` doesn't match the latest. |
| `importData(data)` | **Virtual** in effect — base stores `data.SqlQuery` and sets `isDataLoaded`. |
| `renderData()` / `unRenderData()` | **Virtual** — must be implemented by subclasses. |
| `renderNoDataMsg(on = true)` | Show/hide the "no data" box. |
| `broadcastSelection(filter = null)` | Dispatch `seadFacetSelection`. Call this after mutating selections. |
| `broadcastDeletion()` | Trigger `seadFacetDeletion`. |
| `destroy()` | Mark deleted, unlisten, broadcast deletion, remove the DOM. **This is the correct way to remove a facet.** |
| `minimize(changeFacetSize = false)` / `maximize()` | Collapse/expand. |
| `enable()` / `disable()` | Grey out a facet that isn't applicable in the current domain. |
| `lock(locked = true)` | Pin a facet (used for domain-locked "PORTAL" filters); disables dragging and deletion reordering. |
| `setHeight(height)` | Set facet body height. |
| `showLoadingIndicator(on = true, error = false)` | |
| `showSqlButton(show = true)` | |
| `getDomRef()` | jQuery object for this facet's DOM node (`[facet-id=<id>]`). |
| `updatePosition()` | Animate the facet to its slot's position. |
| `clearData()` | |

---

## 4. Facet subclasses

### DiscreteFacet — [DiscreteFacet.class.js](../src/js/DiscreteFacet.class.js)

A virtualised scrolling list of selectable rows. `selections` is an **array of item ids** (integers).

| Method | Description |
| --- | --- |
| `setSelections(selections, append = true)` | With `append = true`, merges into existing selections; otherwise replaces. Only fires a refetch/broadcast if the set actually changed. |
| `addSelection(id)` / `removeSelection(id)` / `clearSelections()` | Individual mutation. Note these do **not** broadcast on their own. |
| `getSelections()` | `[id, …]` |
| `getSelectionsAsDataItems()` | Selected ids resolved against `data` into full items |
| `toggleRowSelection(rowDomObj)` | What a row click does — mutates, re-renders, and broadcasts |
| `sortData(column = "title" \| "count", sortDirection = "asc" \| "desc")` | |
| `textSearch(evt)` / `determineVisibleData()` | Client-side text filtering over `data` |
| `updateRenderData(data = null)` / `renderData(renderData = [])` | Virtualised render — only `viewportItemCapacity` rows exist in the DOM |
| `recalculateViewportCapacity()` | Call after changing facet height |
| `renderMinimizedView(renderData)` | The collapsed summary row |

### RangeFacet — [RangeFacet.class.js](../src/js/RangeFacet.class.js)

A histogram + dual-handle slider. `selections` is exactly `[lower, upper]` as floats.

| Method | Description |
| --- | --- |
| `setSelections([lower, upper])` | Requires exactly 2 values; `null` entries are ignored. Refetches + broadcasts only if a value actually changed. |
| `getSelections()` | `[lower, upper]` |
| `hasSelection()` | `false` when the selection spans the full data range |
| `getDataEndpoints()` | `{ min, max }` of the unfiltered dataset |
| `importData(importData, overwrite = true)` | Builds `datasets.unfiltered` / `datasets.filtered` from the server's bins |
| `makeCategories(data, selections)` / `reduceResolutionOfDataset(dataset, selections, resolution = 100)` | Downsample the raw distribution into histogram bars |
| `renderChart(categories, selections)` / `renderSlider(categories, selections)` | Chart.js chart + noUiSlider |
| `updateChart(...)` / `updateSlider(...)` | In-place updates |
| `sliderUpdateCallback(values, moveSlider = false)` / `sliderMovedCallback(values, whichSlider)` / `manualInputCallback(evt)` | Input handlers |
| `formatValueForDisplay(value, datingSystem, prettyPrint = true)` | Handles `"BP"` and `"AD/BC"` |

Relevant properties: `minDataValue`, `maxDataValue`, `totalLower`, `totalUpper`, `numberOfCategories`, `unit`, `verboseLogging` (set `true` to trace the whole slider/data pipeline to console).

### MultiStageFacet — [MultiStageFacet.class.js](../src/js/MultiStageFacet.class.js)

One facet UI presenting several chained sub-filters (e.g. the two-stage eco-code filter). Built from `template.stagedFilters`.

* `filters` — array of `{ name, data, selections, inactiveSelections, domContainerId }`
* `currentFilterStage` — index into `filters`

| Method | Description |
| --- | --- |
| `getCurrentFilter()` | The active stage object |
| `getFilterByName(filterName)` | |
| `selectNextFilterStage()` / `selectPreviousFilterStage()` | Advance/retreat through the stages |
| `setSelections(selections, append = true)` | Applies to the current stage |
| `getSelections()` | Selections of the **current stage only** |
| `addSelection` / `removeSelection` / `clearSelections` / `getSelectionsAsDataItems` | Current stage |

Note: `FacetManager.getFacetState()` flattens a multistage facet into **one entry per sub-filter**, each with its own chain position.

### MapFacet — [MapFacet.class.js](../src/js/MapFacet.class.js)

Geographic polygon selection on an OpenLayers map (`type: "geopolygon"`). `selections` is an array of polygon/feature values sent as `pickValue`.

| Method | Description |
| --- | --- |
| `setSelections(selections)` / `getSelections()` | |
| `render()` / `unrender()` | Build/tear down the OL map |
| `initMapSelection()` | Wire the box/polygon draw + select interactions |
| `addCountriesLayer()` / `updateCountryLayerVisibility()` | Country borders, shown at zoom ≤ `countryLayerMaxZoom` (5) |

### Timeline — [IOModules/Timeline.class.js](../src/js/IOModules/Timeline.class.js)

Extends `Facet`. Substituted for the `analysis_entity_ages` range facet when `Config.timelineEnabled`. A Plotly chart with a time slider, plus user-importable CSV/XLSX series.

Selections are always stored in **years BP**, regardless of the displayed dating system.

| Method | Description |
| --- | --- |
| `setSelections(selections, triggerUpdate = true)` / `getSelections()` | `[lowerBP, upperBP]` |
| `getSelectedDatingSystem()` | `"BP"` or `"AD/BC"` |
| `setSelectedScale(scale, newDatingSystem = false, triggerUpdate = true)` / `getSelectedScale()` | Zoom/scale preset (persisted in user settings) |
| `convertBPtoADBC(y)` / `convertADBCtoBP(y)` / `convertToBP(value, timeFormat)` | Conversions |
| `addTraceToGraph(trace, builtIn = false, reRenderIfAlreadyExists = false)` | Add a data series |
| `showTraceInGraph(id)` / `hideTraceFromGraph(id)` / `deleteTraceFromGraph(id)` | |
| `getChartTraceByName(name)` / `isTraceRendered(name)` / `isTraceVisible(name)` | |
| `fetchGraphData(graphDataOption, fetchFullRange = false)` | Load a built-in reference series |
| `handleFileImport(file)` / `loadCSV(file)` / `loadExcel(file)` | User data import |
| `updateGraph()` / `renderGraph()` / `renderSlider()` / `updateLegend()` | Rendering |
| `getGraphRange()` / `getCurrentConventionalBPRange()` | |

---

## 5. Facet state and the Data Exchange Format

```js
sqs.facetManager.getFacetState()      // internal format
sqs.facetManager.getFacetState(true)  // Data Exchange Format (what the server wants)
```

**Internal format** — one entry per filter, ordered by chain position:

```js
[{ name: "country", position: 1, selections: [1, 2], type: "discrete", minimized: false }, …]
```

**Data Exchange Format (DEF)** — produced by `facetStateToDEF(facetState, requestInfo)`:

```js
[{
  facetCode: "country",
  position: 1,
  picks: [{ pickType: 1, pickValue: 1, text: 1 }, …],
  textFilter: ""
}]
```

`pickType`: `0` unknown, `1` discrete, `2` lower bound, `3` upper bound. Range facets always emit exactly one type-2 and one type-3 pick. Geopolygon facets emit bare `{ pickValue }` objects.

`getFacetState(inDataExchangeFormat = false, excludeDeletedFacets = true)` — pass `excludeDeletedFacets = false` to include facets marked deleted but not yet reaped.

---

## 6. ResultManager

[Result/ResultManager.class.js](../src/js/Result/ResultManager.class.js) — owns the set of result modules, which one is active, and the request/suspend machinery around them.

### Registration

Modules are registered during bootstrap in [SeadQuerySystem.class.js:446-476](../src/js/SeadQuerySystem.class.js#L446-L476):

```js
resultManager.addModule([{ name: "map", module: new ResultMap(resultManager) }, …]);
```

`addModule(module)` accepts a single `{ name, module }` object or an array of them. `globe` and `lab` are only added when `config.globeResultModuleEnabled` / `config.dataLabResultModuleEnabled` are set.

### Module access and switching

| Method | Description |
| --- | --- |
| `getModules()` | The raw `[{ name, module }]` registry |
| `getModule(name)` / `getResultModuleByName(name)` | The module instance, or `false` |
| `getActiveModule()` | The instance matching `activeModuleId`, or `false` |
| `await setActiveModule(id, renderModule = true, options = {})` | Switch views. Deactivates the current module, activates and renders the new one, and updates the result menu highlight. If bootstrap hasn't finished it defers the render to `sqsInitComplete`. |
| `await ensureActiveModule(renderModule = true)` | Activate the preferred module if none is currently valid |
| `getPreferredModuleId()` | Resolves user setting → `config.defaultResultModule` → first registered module, filtered through layout constraints |
| `resolveModuleForCurrentLayout(id)` | Maps `"mosaic"` → `"table"` in mobile mode |
| `ensureMobileSafeActiveModule(renderModule = true)` | Applies the mobile substitution, remembering the previous choice in `restoreModuleAfterMobile` so it's restored on return to desktop |
| `isMobileMode()` | |
| `applyResultMenuLayoutState()` | Show/hide result tab titles for the current mode |
| `toggleDebug()` | Reveal hidden menu items and the "show query" (SQL) button |
| `sqsMenu()` | Build the `#result-menu` definition |

`setActiveModule` options: `{ layoutFallback: true }` marks the switch as layout-driven so it doesn't overwrite the user's preference; `{ layoutRestore: true }` is used when returning from mobile.

### Data flow

| Method | Description |
| --- | --- |
| `getRequestData(requestId = 0, requestDataType = "tabular")` | Build the full request envelope (`facetsConfig` + `resultConfig`) from the current facet state and active domain. `requestDataType` becomes `resultConfig.viewTypeId` — modules pass `"tabular"`, `"map"`, etc. When no facet has a selection it emits a special "all sites" package. |
| `updateResultView(triggeringFacet = false, forceRender = false)` | Records the triggering facet and calls `getActiveModule().update()` — unless result fetching is suspended, in which case it flags a pending fetch. This is what `seadFacetSelection` ends up calling. |
| `fetchData()` | Clear the pending flag and call `getActiveModule().render()` |
| `importResultData(data)` | Delegate to the active module |
| `setResultDataFetchingSuspended(bool)` / `getResultDataFetchingSuspended()` | Suspend result loading. Un-suspending runs any pending fetch. |
| `setPendingDataFetch(bool)` / `getPendingDataFetch()` | |
| `getRenderStatus()` | `"none"` \| `"complete"` |
| `showLoadingIndicator(on = true, error = false)` | With `error = true`, unrenders the module and shows an error message instead |
| `renderMsg(render = true, msg = { title, body })` | Overlay message in the result container |

### State

| Method | Description |
| --- | --- |
| `getResultState()` | `{ module: activeModuleId, settings: <module>.exportSettings() }` — used by the viewstate saver |
| `importSettings(settings)` | Forward to the active module's `importSettings()` |

---

## 7. ResultModule base class

[Result/ResultModule.class.js](../src/js/Result/ResultModule.class.js). Every result view extends this.

### Contract for a result module

A module must set these in its constructor and implement the lifecycle:

```js
class MyResult extends ResultModule {
  constructor(resultManager) {
    super(resultManager);
    this.name = "myresult";                     // registry key, must match addModule({ name })
    this.prettyName = "My Result";              // menu label
    this.icon = "<i class='fa fa-star'></i>";   // menu icon
  }
  isVisible() { }          // whether it appears in the result menu
  setActive(active) { }    // show/hide the container; call super.setActive(active)
  render() { }             // fetch + render (entry point called by ResultManager)
  update() { }             // re-render for changed filters
  async unrender() { }     // tear down; must resolve when done
  fetchData() { }          // POST resultManager.getRequestData(...) to /api/result/load
  importResultData(data) { }
  exportSettings() { }     // for viewstates
  importSettings(settings) { }
}
```

### Inherited properties

`resultManager`, `sqs`, `active`, `name`, `data`, `requestId`, `sql`, and `dataModules` — an array of `DataHandlingModule` instances (`AbundanceData`, `DendroCeramicsData`, `DatingData`, `IsotopeData`, `MeasuredValuesData`, `EntityAgesData`) used by the export pipeline.

### Inherited methods

| Method | Description |
| --- | --- |
| `getSQL()` | The SQL of the last result request |
| `setActive(active)` | Sets the `active` flag |
| `setExportButtonLoadingIndicator(active = true)` | Spinner on the result export button |
| `bindExportModuleDataToButton(button, module = null)` | Attach the export dropdown/dialog to a button |
| `exportDataDialog()` | |
| `getSelectedMethodIdsForExport()` | Method ids ticked in the export dialog |

### Export API

All take an array of site ids and trigger a browser download.

| Method |
| --- |
| `await exportSitesAsJson(siteIds)` |
| `await exportSitesAsCsv(siteIds)` |
| `await exportSitesAsXlsx(siteIds)` |
| `await exportFullSitesAsJson(siteIds, methodIds = [])` |
| `await exportFullSitesAsXlsx(siteIds, methodIds = [])` |
| `await exportFullSitesAsCsv(siteIds, methodIds = [])` |
| `await exportFullSamplesAsXlsx(siteIds, methodIds = [])` |
| `exportSitesAsSdfXlsx(sites)` |
| `await fetchSites(siteIds)` / `await fetchExportData(siteIds)` / `await fetchDatasetSummaries(siteIds)` |
| `await getDatagroupsAsXlsx(methodId, sites)` / `await getDatasetsAsXlsx(datasets)` / `await getReferenceTable(sites)` |

Heavy exports are handed to web workers in [src/js/Workers/](../src/js/Workers/) (`SiteExport.worker.js`, `DatasetExport.worker.js`, `SdfExport.worker.js`) and progress is reported via the `exportProgress` event (dispatched by `ExportManager` / `SitesDataTransfer`, listened for in `ResultModule`).

---

## 8. Result modules

### ResultMap — [ResultMap.class.js](../src/js/Result/ResultMap/ResultMap.class.js)

OpenLayers map of result sites. `name: "map"`.

```js
new ResultMap(resultManager, renderIntoNode = "#result-map-container", includeTimeline = true, minimalMap = false)
```

`minimalMap = true` skips the legend and drag handling — used for embedding the map as a mosaic tile.

**Layer control.** Layers live in `this.layers` (OpenLayers layer objects) and are keyed by a `layerId` property. Layer definitions come from [ResultMapLayers.class.js](../src/js/Result/ResultMap/ResultMapLayers.class.js).

| Method | Description |
| --- | --- |
| `setMapBaseLayer(baseLayerId)` | `"stamen"`, `"stamenTerrain"`, `"osm"`, `"mapboxSatellite"`, `"topoMap"`, `"arcticDem"` |
| `setMapDataLayer(dataLayerId)` | `"clusterPoints"`, `"points"`, `"heatmap"`. Dispatches `MAP_LAYER_VISIBILITY_CHANGED`. |
| `setMapAuxLayer(id)` / `hideMapAuxLayer(id)` | WMS overlays (SGU etc.) |
| `await setMapExternalLayer(id)` / `hideMapExternalLayer(id)` | External point sources, e.g. `"isoarchLocations"` |
| `getLayerById(layerId)` / `removeLayer(layerId)` / `getVisibleDataLayer()` | |
| `getSelectedAuxLayers()` | |
| `getSortedLayersByHierarchy()` / `updateAllLayerZIndexes()` / `syncLayersToZIndex()` | Stacking order |
| `printOlMapLayers()` / `printLayerStackOrder()` | Debug dumps |

| Method | Description |
| --- | --- |
| `render(fetch = true)` / `await update()` / `await unrender()` | Lifecycle |
| `renderMap(removeAllDataLayers = true)` | (Re)build the OL map |
| `importResultData(data, renderMap = true)` | |
| `getSelectedSites()` | Site ids currently selected on the map |
| `clearSelections()` | |
| `updateLegend()` / `showLegend()` / `hideLegend()` / `makeLegendSortable()` | Draggable, sortable layer legend |
| `openAuxLayersPanel()` / `renderAuxLayersPanel(unavailableGroups, loadingState)` / `unrenderAuxLayersPanel()` | The aux-layer picker |
| `renderInterfaceControls()` / `updateInterfaceControls()` | |
| `setContainerFixedSize()` / `setContainerFlexibleSize()` / `resizeCallback()` | |
| `importSettings({ center, zoom, baseLayers, dataLayers })` | Restores view + layers, polling until the OL map exists |

Point styling is driven by `this.style.default` / `.selected` / `.highlighted` (fill/stroke/text colors) via `getPointStyle`, `getClusterPointStyle`, `getSingularPointStyle`, `getExternalPointStyle`.

### ResultTable — [ResultTable.class.js](../src/js/Result/ResultTable/ResultTable.class.js)

Tabulator-based table. `name: "table"`.

| Method | Description |
| --- | --- |
| `render()` / `update()` / `await unrender()` | |
| `fetchData()` | Requests `"tabular"` data |
| `importResultData(data)` | Fills `this.data = { columns, rows }` |
| `renderDataTable()` | Builds the Tabulator instance in `this.tabulatorTable` |
| `getSelectedSites()` | |
| `updateMobileColumnVisibility()` | Hides low-priority columns in mobile mode |
| `datingAgeFormatter(cell, type)` / `countryFormatter(cell)` / `buildAnalysisMethodsSvg(datasets)` | Cell renderers |
| `await fetchAnalysesStackedBar(siteId, siteTdId, rowsNum)` / `renderAnalysesStackedBar(row, rowsNum)` | Inline per-row analysis bars |
| `getRenderStatus()` | |
| `exportSettings()` / `importSettings(settings)` | Currently no-ops returning `{}` |

`maxRenderCount` (default 100000) caps how many rows are handed to Tabulator.

### ResultMosaic — [ResultMosaic.class.js](../src/js/Result/ResultMosaic/ResultMosaic.class.js)

The tiled dashboard overview. `name: "mosaic"`, `prettyName: "Overview"`. Desktop only — ResultManager substitutes `table` in mobile mode.

`this.modules` is the registry of *available* tile classes: `[{ title, className, classTemplate, module, name }]`. Which tiles are actually shown, and where, comes from the active domain's `result_grid_modules` config.

| Method | Description |
| --- | --- |
| `render()` / `update()` / `await unrender()` | Lifecycle |
| `importResultData(data)` | Fills `this.data` and derives **`this.sites`** — the site id array every tile module queries with |
| `getSelectedSites()` | |
| `getInstanceOfModule(moduleName)` | **New** instance of a registered tile class, by its `name` |
| `getLiveModuleInstanceByName(name)` | The **currently mounted** instance from the domain's grid config |
| `getModuleMetaByName(name)` / `getModuleByClassName(name)` / `getModuleMetaByInstanceId(id)` | Registry lookups |
| `renderGridModules(resultGridModules)` / `await renderGridModule(moduleConf, mosaicTileId)` / `unrenderGridModules()` | Mount/unmount tiles |
| `updateGridModules()` | Call `update()` on every mounted tile |
| `renderGridModuleSelector(...)` / `bindGridModuleSelectionCallbacks()` | The per-tile "swap this tile" dropdown |
| `await fetchSiteData(siteIds, dbView, requestId)` | Batched PostgREST fetch for a view, chunked to keep URLs under the length limit |

**Tile layout** (`this.tileLayout`, backed by [MosaicGridLayout.class.js](../src/js/Result/ResultMosaic/MosaicGridLayout.class.js)):

| Method | Description |
| --- | --- |
| `applyDomainGridLayout(domain)` / `configureGridLayoutForDomain(domain)` | Build the layout from `domain.result_grid_modules` |
| `rebuildTileLayout(resultGridModules)` / `applyTileGeometry(el, descriptor, animate = true)` / `syncAllTiles(skipId = null)` | |
| `initTileDrag(el, moduleConf)` / `initTileResize(el, moduleConf)` | Drag and resize |
| `applyResponsiveTileLayout()` / `bindResponsiveTileLayoutCallbacks()` / `updateContainerHeight()` / `updateCSSVars()` | |

**Chart helpers** available to tile modules:

`renderBarChart`, `renderBarChartPlotly`, `renderPieChart`, `renderPieChartPlotly`, `renderHistogram`, `renderHistogramPlotly`, `preparePieChart`, `prepareBarChart`, `prepareChartData`, `makeChartSeries`, `renderNoDataMsg` / `unrenderNoDataMsg`, `unrenderPlotlyChart`, `setLoadingIndicator(containerNode, isLoading)`.

Plotly charts must register their layout so they get relaid out on resize:

```js
resultMosaic.registerPlotlyLayout(anchorNodeId, layout);
resultMosaic.unregisterPlotlyLayout(anchorNodeId);
resultMosaic.relayoutRegisteredPlotlyCharts();
resultMosaic.cleanupPlotlyChartsInContainer(containerSelector);
```

Chart.js instances go through the graph registry: `pushIntoGraphRegistry(graphObject)`, `getFromGraphRegistry(anchorNodeName)`, `removeFromGraphRegistry(anchorNodeName)`.

### ResultGlobe — [ResultGlobe.class.js](../src/js/Result/ResultGlobe/ResultGlobe.class.js)

3D globe with extruded bars. `name: "globe"`. Enabled by `config.globeResultModuleEnabled`; `isVisible()` currently returns `false`, so it stays out of the menu.

| Method | Description |
| --- | --- |
| `getVisualizationMode()` | `"dendro"` in the dendrochronology domain, else `"ecocodes"` |
| `renderBars(selectedEcocode, selectedCalculationMode, ecoCodeData = null)` | |
| `renderDendroBars(variableName, dendroData, variableConfig)` / `renderCategoricalBars(variableName, siteData, variableConfig)` | |
| `await fetchAndRenderDendroVariable(name)` / `await fetchAndRenderCategoricalVariable(name, config, siteIds)` / `await fetchAndRenderNumericCategoricalVariable(...)` | |
| `renderControlPanel(data)` / `renderEcoCodesControlPanel(data)` / `renderDendroControlPanel(data)` | |
| `removeAllBars()` / `updateBarRadii()` / `updateCylinderRadius()` / `getScaledCylinderRadius()` | |

### ResultLab — [ResultLab.class.js](../src/js/Result/ResultLab/ResultLab.class.js)

Experimental Graphic Walker data-exploration view. `name: "lab"`, `experimental: true`. Enabled by `config.dataLabResultModuleEnabled`.

| Method | Description |
| --- | --- |
| `await render()` / `update()` / `await unrender()` | `update()` shows a confirmation warning before discarding an in-progress exploration |
| `await renderData(data)` / `dataLoadedCallback(tables)` / `presentData(sites)` | |
| `convertTabularDataToGraphicWalkerFormat(filteredTables)` | |
| `guessSemanticType(key, table)` / `guessAnalyticType(key, table)` | Field type inference |
| `cancelFetch(instant = false)` | Abort an in-flight (potentially very large) fetch |
| `getGraphicWalkerTheme()` | |

### ResultDefault — [ResultDefault.class.js](../src/js/Result/ResultDefault/ResultDefault.class.js)

Minimal placeholder implementing only `isVisible`, `render`, `update`, `unrender`.

---

## 9. Mosaic tile modules

[MosaicTileModule.class.js](../src/js/Result/ResultMosaic/MosaicTileModules/MosaicTileModule.class.js) is the base class for everything in [MosaicTileModules/](../src/js/Result/ResultMosaic/MosaicTileModules/).

### Contract

```js
class MosaicMyTile extends MosaicTileModule {
  constructor(sqs) {
    super();
    this.sqs = sqs;
    this.name = "mosaic-my-tile";              // referenced from domain config result_grid_modules
    this.title = "My Tile";
    this.domains = ["general", "palaeo"];       // domains this tile is offered in
    this.chartType = "plotly";                  // "plotly" | "chartjs" | ""
    this.showChartSelector = false;             // show the chart-type dropdown?
  }
  async render(renderIntoNode = null) { super.render(); /* … */ this.renderComplete = true; }
  async update() { }
  async unrender() { }
}
```

Then register it in the `ResultMosaic` constructor's `this.modules.push({ title, className, classTemplate, module: null })` block, and reference its `name` from the domain's `result_grid_modules` in the config.

`unrender()` in the base class **polls until `renderComplete` is true** before emptying the node — so a tile that never sets `renderComplete = true` will hang the domain switch.

### Properties

`sqs`, `renderIntoNode`, `data`, `chart`, `active`, `renderComplete`, `chartType`, `name`, `title`, `domains`, `showChartSelector`, `coverageCharts`.

### Methods

| Method | Description |
| --- | --- |
| `await fetchData(path, postData)` | POST to `config.dataServerAddress + path`. Sets an error indicator and rejects on failure. |
| `await fetchTotalSamplesCount()` | Total sample count for the current result set |
| `setMosaicTileTitle(title)` | Set the shared header title (the header is owned by ResultMosaic, not the tile) |
| `showLoadingIndicator(show)` | |
| `renderNoData()` | |
| `await renderCoverageMiniChart(container, samplesWithData, totalSamplesOrPromise)` | The "sample coverage" mini bar; accepts a promise for the total and animates on resolve |
| `handleResize()` / `drawCoverageLine(ctx, width, height, percentage)` | |
| `getAvailableExportFormats()` | Defaults to `["json", "csv"]` — override to add `"xlsx"`, `"png"` |
| `getExportImageTargetNode()` | Node captured for image export |
| `exportCallback()` | Wired to the tile's export button |
| `await exportDataAsXlsx(data, exportData, filename)` | |
| `formatDataForExport(data, format = "json")` | |
| `exportTopTaxaListAsPng(data, options = {})` | Canvas-rendered list export |
| `sanitizeExportFilename(baseName = "chart")` / `stripHtmlTags(text)` / `truncateCanvasText(ctx, text, maxWidth)` | Helpers |

Dendro tiles inherit shared header/render behaviour from `DendroBaseModule` — check the `extends` chain before assuming a tile implements its own rendering.

---

## 10. DomainManager

[DomainManager.class.js](../src/js/DomainManager.class.js). Domain switching is the main thing that reshapes *both* the filter set and the result section, so it belongs here.

| Method | Description |
| --- | --- |
| `getActiveDomain()` | The active domain config object: `{ name, title, color, filters, filterBlacklist, result_grid_modules, … }` |
| `getDomain(domainName)` | |
| `setActiveDomain(domainName, updateUrl = true)` | No-op if already active. Otherwise: unrenders the current result module, updates the menu and SEO meta, optionally pushes `/<domain>` to history, then dispatches `domainChanged`. |
| `updateMenu()` / `sqsMenu()` | |

Domains ship in `config.domains`; `domain.filters` (the list of facet codes valid for that domain) is populated at boot by `SeadQuerySystem.importDomains()` from `/api/facets/domain/<code>`, minus `domain.filterBlacklist`.

On `domainChanged`:
* `FacetManager` destroys every facet and calls `buildFilterStructure(domainName)`.
* `ResultManager` re-renders the active module (or falls back to `ensureActiveModule(true)`).
* `ResultMosaic.render()` rebuilds the tile grid from the new domain's `result_grid_modules`.

Domains available: `general`, `dendrochronology`, `palaeoentomology`, `archaeobotany`, `pollen`, `geoarchaeology`, `isotope`, `ceramic`.

---

## 11. Recipes

### Add a filter with a preset selection

```js
sqs.facetManager.spawnFacet("country", [1, 2, 3]);
```

### Read the current filter state

```js
sqs.facetManager.getFacetState();      // internal
sqs.facetManager.getFacetState(true);  // as sent to the server
sqs.facetManager.facetsHasSelections();
```

### Change a selection programmatically

```js
const facet = sqs.facetManager.getFacetByName("country");
facet.setSelections([5, 6], false);   // replace rather than append
// setSelections already refetches and broadcasts; only call these if you mutated
// this.selections directly:
// sqs.facetManager.queueFacetDataFetch(facet);
// facet.broadcastSelection();
```

### Add several filters without a request storm

```js
const fm = sqs.facetManager;
fm.setFacetDataFetchingSuspended(true);
sqs.resultManager.setResultDataFetchingSuspended(true);

fm.spawnFacet("country", [1], false);
fm.spawnFacet("sitename", [], false);

fm.setFacetDataFetchingSuspended(false);      // flushes the queue
sqs.resultManager.setResultDataFetchingSuspended(false);
```

### Clear all filters

```js
sqs.facetManager.reset();
```

### Switch the result view

```js
await sqs.resultManager.setActiveModule("table");
await sqs.resultManager.setActiveModule("map", /* renderModule = */ false);
```

### Get the site ids currently in the result set

```js
sqs.resultManager.getActiveModule().getSelectedSites();
sqs.resultManager.getModule("mosaic").sites;   // mosaic keeps a plain id array
```

### Drive the map's layers

```js
const map = sqs.resultManager.getModule("map");
map.setMapBaseLayer("osm");
map.setMapDataLayer("heatmap");     // "points" | "clusterPoints" | "heatmap"
map.setMapAuxLayer("<auxLayerId>");
await map.setMapExternalLayer("isoarchLocations");
map.clearSelections();
```

### Swap a mosaic tile

```js
const mosaic = sqs.resultManager.getModule("mosaic");
const tile = mosaic.getLiveModuleInstanceByName("mosaic-feature-types");
await tile.update();
mosaic.updateGridModules();          // update every mounted tile
```

### Force a result refresh

```js
sqs.resultManager.updateResultView();       // update() on the active module
sqs.resultManager.fetchData();              // full render() cycle
```

### Export the current result set

```js
const module = sqs.resultManager.getActiveModule();
await module.exportSitesAsXlsx(module.getSelectedSites());
```

### React to filter changes from your own code

```js
sqs.sqsEventListen("seadFacetSelection", (evt, data) => {
  console.log("changed:", data.facet.name, data.facet.getSelections());
}, this);

// later
sqs.sqsEventUnlisten("seadFacetSelection", this);
```

### Turn on debug affordances

```js
sqs.facetManager.toggleDebug();    // per-filter SQL buttons
sqs.resultManager.toggleDebug();   // result SQL button + hidden menu items
sqs.facetManager.getFacetByName("analysis_entity_ages").verboseLogging = true;
```

---

## 12. Gotchas

* **`getFacetByName` is defined twice** in `FacetManager` ([line 369](../src/js/FacetManager.class.js#L369) and [line 1493](../src/js/FacetManager.class.js#L1493)). The later definition wins, so a miss returns **`null`**, not `false`. `getFacetById` returns `false` on a miss. Test with `if(!facet)`.
* **`exportSettings()` is not implemented on every result module.** Only `ResultTable` and `ResultMosaic` define it (both returning `{}`); `ResultModule`, `ResultMap`, `ResultGlobe` and `ResultLab` do not. `ResultManager.getResultState()` calls it unconditionally on the active module, so saving a viewstate while `map`, `globe` or `lab` is active will throw. `ResultMap` *does* implement `importSettings()`.
* **Chain order lives in `links`, not `facets`.** Iterating `facetManager.facets` gives you insertion order. Use `getSlotIdByFacetId()` or `getFacetState()` when order matters. `getFacetState()` sorts `this.facets` in place as a side effect.
* **Slot ids are 1-based.**
* **Multistage facets flatten.** One `MultiStageFacet` produces several entries in `getFacetState()` — one per sub-filter, each with its own chain position. `getSelections()` on the facet returns only the *current stage's* selections.
* **Range facet selections are always `[lower, upper]` floats**, and `hasSelection()` is `false` when they equal the full data extent. Timeline selections are always stored in years BP regardless of the displayed dating system.
* **`layoutSwitchMode` fires before the mode value updates.** Existing listeners work around this with `setTimeout(..., 0)`; do the same.
* **Mosaic is desktop-only.** `resolveModuleForCurrentLayout()` silently maps `"mosaic"` → `"table"` in mobile mode, so `activeModuleId` may not be what you asked for. The requested id is remembered in `preferredResultModuleId` / `restoreModuleAfterMobile`.
* **Stale responses are dropped by `requestId`.** Both facets and result modules compare the response's `RequestId` against their own counter and discard mismatches — if a fetch you triggered manually seems to vanish, check that you incremented the counter the same way the module does.
* **`MosaicTileModule.unrender()` polls `renderComplete`.** A tile that never sets `this.renderComplete = true` will block domain switches and view changes forever.
* **`spawnFacet` refuses duplicates**, returning `false` if a facet with that name already exists.
* `addSelection` / `removeSelection` / `clearSelections` on `DiscreteFacet` mutate state but do **not** broadcast — `setSelections()` and `toggleRowSelection()` do.
