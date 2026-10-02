# Issues overview

An assessment of every open issue in [humlab-sead/sead_browser_client](https://github.com/humlab-sead/sead_browser_client/issues) (69 issues as of 2026-09-30), rated by how fixable each one is from within this repository.

Ratings:

- **Fixable now**: the work only touches the webclient.
- **Requires human decision**: someone has to decide what the right outcome is before it can be built.
- **Beyond scope of webclient**: the work lies mainly in another service (database, json_api_server, sead_query_api) or depends on data that doesn't exist yet.

The ratings are based on the issue text and a quick look at the code. No bugs were reproduced.

## Probably already resolved (verify, then close)

| # | Issue | Why |
|---|---|---|
| [273](https://github.com/humlab-sead/sead_browser_client/issues/273) | Map filter | `MapFacet` supports polygon selections (commit 7f87bc5). |
| [133](https://github.com/humlab-sead/sead_browser_client/issues/133) | Result table exportable | `ResultTable` already has an export button (`renderExportButton`). |
| [303](https://github.com/humlab-sead/sead_browser_client/issues/303) | Sample features | `Samples.class.js` shows a "Feature types" column. `feature_name` and the description may still be missing. |
| [249](https://github.com/humlab-sead/sead_browser_client/issues/249) | License in exports | `dataLicense` is written into site-report and MCR exports. Check that the other export paths include it, and that credit to the original authors is covered. |
| [445](https://github.com/humlab-sead/sead_browser_client/issues/445) | Taxon images | The fix (more image providers) is done according to the issue thread and is waiting to be deployed. |
| [320](https://github.com/humlab-sead/sead_browser_client/issues/320) | Dendro dating structure update | The discussion concluded the difference was expected. |
| [325](https://github.com/humlab-sead/sead_browser_client/issues/325) | Export charts as PNG | Done apart from "top taxa", which is a small fixable-now task. |

## Fixable now

| # | Issue | Notes |
|---|---|---|
| [412](https://github.com/humlab-sead/sead_browser_client/issues/412) | Units on range filters | Add "counts" and "years" axis titles in `RangeFacet`. |
| [411](https://github.com/humlab-sead/sead_browser_client/issues/411) | Lines showing range expansion | A client-side chart drawing change. |
| [375](https://github.com/humlab-sead/sead_browser_client/issues/375) | Finer time-range selection | Add manual input boxes to `RangeFacet`, as in the old prototype. |
| [274](https://github.com/humlab-sead/sead_browser_client/issues/274) | Closing the eco code filter doesn't update results | A client event-handling bug. |
| [282](https://github.com/humlab-sead/sead_browser_client/issues/282) | Sorting ignores "show only selected" | Sorting in `DiscreteFacet` should apply only to the visible selection. |
| [281](https://github.com/humlab-sead/sead_browser_client/issues/281) | "Show only selected" is capped at 12 rows with no scrollbar | A client bug. The tooltip idea ("Showing xx selected") is cheap to add too. |
| [298](https://github.com/humlab-sead/sead_browser_client/issues/298) | Search filter lost when toggling "show selected" | A client filter-state bug. |
| [289](https://github.com/humlab-sead/sead_browser_client/issues/289) | Two-stage eco code filter is unclear | Only client UX work, though a quick agreement on the design would help. |
| [275](https://github.com/humlab-sead/sead_browser_client/issues/275) | Redundant loading indicator | Remove the overall indicator from the result section. |
| [315](https://github.com/humlab-sead/sead_browser_client/issues/315) | Tutorial doesn't close the About dialog | The tutorial should close open dialogs when it starts. |
| [407](https://github.com/humlab-sead/sead_browser_client/issues/407) | Tutorial stuck on small screens | Fix scrolling and layout in the tutorial steps. |
| [293](https://github.com/humlab-sead/sead_browser_client/issues/293) | Tooltips repeatedly trying to attach | Attach them when the sample group is expanded instead. |
| [294](https://github.com/humlab-sead/sead_browser_client/issues/294) | Chart render options looked up by name | Refactor within the site report. |
| [328](https://github.com/humlab-sead/sead_browser_client/issues/328) | Dendro tooltips go outside the viewport | Keep tooltips inside the viewport. |
| [339](https://github.com/humlab-sead/sead_browser_client/issues/339) | Dendro chart: tree species colours and legend | Only client chart work. |
| [443](https://github.com/humlab-sead/sead_browser_client/issues/443) | MCR fixes | Reversing the axes and using black cells instead of orange are quick. Choosing samples and highlighting species is bigger but still client-only. |
| [277](https://github.com/humlab-sead/sead_browser_client/issues/277) | Site name in the CSV export header | A one-line change in the export header. |
| [321](https://github.com/humlab-sead/sead_browser_client/issues/321) | Soil chemistry axis labels | Mostly done. What's left is the "Magnetic Susceptibility" y-axis label. The instrument name isn't in the database, so that part is out of scope. |
| [316](https://github.com/humlab-sead/sead_browser_client/issues/316) | Magnetic susceptibility shows no data (site 111) | The data exists according to the issue thread, so it's a client rendering issue. |
| [313](https://github.com/humlab-sead/sead_browser_client/issues/313) | RadioMetricDatingDataset needs investigating | Still imported and registered in `Analysis.class.js`. Either update it to the new data format or remove it. |
| [312](https://github.com/humlab-sead/sead_browser_client/issues/312) | Bundle size | `SiteReport.class.js` imports pdfmake statically (lines 15–16) **and** dynamically (line 123), so the static import keeps it in the main bundle. exceljs is also imported two ways (`exceljs` and `exceljs/dist/exceljs.min.js`). |
| [204](https://github.com/humlab-sead/sead_browser_client/issues/204) | Browser back button | A `popstate` handler exists but routing only partly supports it. Needs a repro, but the fix is client-side. |
| [295](https://github.com/humlab-sead/sead_browser_client/issues/295) | Charts as pop-outs | Client-only. |
| [453](https://github.com/humlab-sead/sead_browser_client/issues/453) | Taxon missing on site 138; "Export all site data" broken | Probably a client bug, since the per-dataset export does include the taxon. Could turn out to be in json_api_server. |
| [459](https://github.com/humlab-sead/sead_browser_client/issues/459) | "Thermal" merged into petrographic data | Probably client-side dataset/datagroup method matching (related to #402). Could also come from json_api_server. |
| [311](https://github.com/humlab-sead/sead_browser_client/issues/311) | Unsupported analysis methods (site 92) | Rendering can go through `GenericDataset` or new modules. The requested renaming is a database change. |
| [376](https://github.com/humlab-sead/sead_browser_client/issues/376) | Site metadata in dataset exports | Client export work, provided the site object already carries the metadata. |

## Requires human decision

| # | Issue | What needs deciding |
|---|---|---|
| [461](https://github.com/humlab-sead/sead_browser_client/issues/461) | Time periods and timeline | How to standardise periods (on the technical-meeting agenda). The confusing timeline axis could be clarified right away. |
| [460](https://github.com/humlab-sead/sead_browser_client/issues/460) | Ceramic sites show "no data" in the dating overview | Whether this is correct at all. Domain experts need to answer. |
| [458](https://github.com/humlab-sead/sead_browser_client/issues/458) | Samples without dimensions | Mostly a data question. The feature type tag rendering is a small client fix. |
| [454](https://github.com/humlab-sead/sead_browser_client/issues/454) | Order eco codes by relation | Someone has to define the grouping and order. |
| [442](https://github.com/humlab-sead/sead_browser_client/issues/442) | Does the MCR envelope make sense? | A scientific judgement. |
| [429](https://github.com/humlab-sead/sead_browser_client/issues/429) | GraphicWalker via API | An architecture decision, and it would involve server work. |
| [402](https://github.com/humlab-sead/sead_browser_client/issues/402) | Datagroups overhaul | The issue itself asks whether datagroups are still a good idea. Also affects json_api_server. |
| [374](https://github.com/humlab-sead/sead_browser_client/issues/374) | aDNA library counts | A data-modelling decision, not client work. |
| [367](https://github.com/humlab-sead/sead_browser_client/issues/367) | Show when samples were taken and analysed | Vague. Needs a spec and a check of what dates exist. |
| [354](https://github.com/humlab-sead/sead_browser_client/issues/354) | Remaining dendro exports | Which aggregated exports to build needs to be defined. |
| [332](https://github.com/humlab-sead/sead_browser_client/issues/332) | Clearer citations in dendro exports | Open questions in the thread are unanswered. The citation text may also belong in the database. |
| [307](https://github.com/humlab-sead/sead_browser_client/issues/307) | British or American English | A policy decision. |
| [304](https://github.com/humlab-sead/sead_browser_client/issues/304) | Confusion about references | The questions about data semantics need answers. |
| [302](https://github.com/humlab-sead/sead_browser_client/issues/302) | Site "other records" | Whether they're worth showing without a `biblio_id`. |
| [291](https://github.com/humlab-sead/sead_browser_client/issues/291) | Dendro dating overview chart is wrong | Nobody has said what the chart should show. With a spec, the fix is probably client-only. |
| [290](https://github.com/humlab-sead/sead_browser_client/issues/290) | Feature type count mismatch | Whether it's a bug at all, since the filter counts analysis entities and the chart counts samples. |
| [271](https://github.com/humlab-sead/sead_browser_client/issues/271) | SEAD manual | Resources and scope. |
| [247](https://github.com/humlab-sead/sead_browser_client/issues/247) | Showing modern vs. archaeological data | A design choice. |
| [122](https://github.com/humlab-sead/sead_browser_client/issues/122) | Viewstates policy | A long-term architecture decision. |
| [345](https://github.com/humlab-sead/sead_browser_client/issues/345) | Artefact typology has many datasets | The issue is unclear to its assignee, and BugsCEP needs checking. Likely a data issue. |

## Beyond scope of webclient

| # | Issue | Where the work is |
|---|---|---|
| [462](https://github.com/humlab-sead/sead_browser_client/issues/462) | Search by Landskap/Socken | The free-text search (`/jsonapi/freesearch`) runs in json_api_server. |
| [457](https://github.com/humlab-sead/sead_browser_client/issues/457) | Search taxa by common name | Same search endpoint. |
| [451](https://github.com/humlab-sead/sead_browser_client/issues/451) | Rearrange the filter menu | Filter groups (`FacetGroupKey`) come from the sead_query_api facet definitions. Also on the technical-meeting agenda. |
| [450](https://github.com/humlab-sead/sead_browser_client/issues/450) | Version numbers in exports | The client version is already there. The JSON API, Query API and database versions need endpoints on those services. |
| [448](https://github.com/humlab-sead/sead_browser_client/issues/448) | Koch eco codes shown twice | A database fix: remove the bad "KochGroup" import. |
| [423](https://github.com/humlab-sead/sead_browser_client/issues/423) | aDNA raw data link | Waiting for a database patch, then possibly a small client change. |
| [389](https://github.com/humlab-sead/sead_browser_client/issues/389) | External data (e.g. IsoArch) | Needs data sources and links in the database. |
| [372](https://github.com/humlab-sead/sead_browser_client/issues/372) | Dendro request list | Most items are new filters, which need sead_query_api facets. |
| [347](https://github.com/humlab-sead/sead_browser_client/issues/347) | Region polygons | Needs a region hierarchy in the database plus boundary data. Already labelled "can't fix". |
| [340](https://github.com/humlab-sead/sead_browser_client/issues/340) | Tucson-format export | There is no tree-ring width data yet. |
| [299](https://github.com/humlab-sead/sead_browser_client/issues/299) | Filter results missing (2023, supersead) | Probably the query API or json_api_server. Old, so try reproducing it first. |
| [266](https://github.com/humlab-sead/sead_browser_client/issues/266) | Research project portals | Needs a project entity in the database and query API support. |
| [201](https://github.com/humlab-sead/sead_browser_client/issues/201) | Multi-site eco code charts | Needs aggregated data from the server. A large feature. |
| [189](https://github.com/humlab-sead/sead_browser_client/issues/189) | Image support | Needs image storage, ingestion and resizing. |
| [132](https://github.com/humlab-sead/sead_browser_client/issues/132) | Site report as PDF | pdfmake is already in the client, but the richer content asked for needs data that isn't available and agreement on what to include. Borderline. |

## Quick wins

#312 (the pdfmake import), #277, #412, #275, #315 and #274, plus closing the issues listed as probably resolved once verified.
