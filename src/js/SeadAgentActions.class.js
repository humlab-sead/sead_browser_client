/*
* Class: SeadAgentActions
* Runs the commands the SEAD agent asks for against this client.
*
* The agent never sends JavaScript. It sends a command name from the fixed list below
* plus arguments, and anything not in that list is refused here - so what the agent can
* do to the interface is bounded by this file, not by what the model decides to write.
*/
import MapFacet from './MapFacet.class.js';
import Timeline from './IOModules/Timeline.class.js';
import ScreenReader from './ScreenReader.class.js';

export default class SeadAgentActions {
    //Long enough for the scroll to register as a movement the user can follow, short
    //enough that a few filters in a row don't feel slow
    static REVEAL_DELAY_MS = 450;
    //How long to wait for a result load to land before giving up on reporting its count
    static RESULT_REFRESH_TIMEOUT_MS = 15000;
    //The map filter. Its polygons are the only selection in the client that isn't a list of ids.
    static MAP_FILTER = "sites_polygon";
    //How long to wait for a staged filter's next stage to load its values
    static STAGE_DATA_TIMEOUT_MS = 10000;
    //Expandable rows listed per site report section; a site can have hundreds of sample groups
    static MAX_LISTED_ROWS = 30;
    //Areas the agent can put on the map in one go. Each one is several polygons and every
    //polygon becomes its own ST_Within in the query - a whole continent at once helps nobody.
    static MAX_AREAS = 6;

    constructor(sqs) {
        this.sqs = sqs;
        //The general layer: anything on screen, for what the commands below don't cover
        this.screenReader = new ScreenReader(sqs);
    }

    /*
    * Function: execute
    * Runs one command and returns a JSON-serialisable result for the agent. Throws with a
    * readable message when the command can't be carried out; the caller reports that back
    * so the model can adjust rather than being left to guess.
    */
    async execute(command, args) {
        const handler = this.handlers()[command];
        if(!handler) {
            throw new Error("Unknown command: "+command);
        }
        return await handler(args || {});
    }

    /*
    * Function: withBatchedResults
    * Applies a change with result fetching suspended, then does exactly one full render.
    *
    * Without this, two refreshes race: spawnFacet unrenders the result module and starts
    * a render, while the selection broadcast starts an update() of its own. The later
    * request id wins, the earlier response is discarded as stale, and update() ends up
    * refreshing grid modules that unrender() already removed - so the mosaic comes back
    * empty until the user switches result view and forces a real render.
    */
    async withBatchedResults(apply) {
        let resultManager = this.sqs.resultManager;
        //Captured before anything changes, so we can tell the new result set apart from
        //the one that is on screen right now
        let before = this.resultFingerprint();
        let outcome;

        resultManager.setResultDataFetchingSuspended(true);
        try {
            outcome = await apply();
        }
        finally {
            //Resuming already fetches when something was queued while suspended, so only
            //force one when nothing was - either way the result is exactly one full render
            let queued = resultManager.getPendingDataFetch();
            resultManager.setResultDataFetchingSuspended(false);
            if(!queued) {
                //fetchData() is a full render; update() would only refresh existing modules
                resultManager.fetchData();
            }
        }

        //fetchData() only *starts* the load. Reporting a count before it lands means
        //reporting the count for the previous filters - which reads as a confident,
        //completely wrong answer.
        let settled = await this.awaitResultRefresh(before);

        return Object.assign({}, outcome, settled
            ? { siteCount: this.currentSiteCount() }
            //Better to say nothing than to quote the old number
            : { siteCount: null, note: "The results were still loading; call get_state for the site count." });
    }

    /*
    * Function: resultFingerprint
    * Identifies the result set currently loaded. The modules replace these collections
    * wholesale when new data arrives (`this.sites = []`, `this.data.rows = []`), so a
    * change of object identity means new data landed - which a length comparison would
    * miss whenever the new count happens to equal the old.
    */
    resultFingerprint() {
        try {
            let module = this.sqs.resultManager.getActiveModule();
            if(!module) {
                return null;
            }
            return {
                name: module.name,
                sites: module.sites || null,
                rows: module.data ? module.data.rows : null
            };
        }
        catch(error) {
            return null;
        }
    }

    /*
    * Function: awaitResultRefresh
    * Waits for a new result set to replace the one described by 'before'. Returns false if
    * it never arrives, so the caller can decline to report a count rather than report a
    * stale one.
    */
    awaitResultRefresh(before) {
        if(!before) {
            //Nothing to compare against - don't block on a wait that can't terminate
            return Promise.resolve(true);
        }

        return new Promise((resolve) => {
            let waited = 0;
            let poll = setInterval(() => {
                waited += 100;
                let after = this.resultFingerprint();
                let changed = after != null && (after.name != before.name || after.sites !== before.sites || after.rows !== before.rows);

                if(changed || waited >= SeadAgentActions.RESULT_REFRESH_TIMEOUT_MS) {
                    clearInterval(poll);
                    resolve(changed);
                }
            }, 100);
        });
    }

    /*
    * Function: scrollSelectionIntoView
    * Brings the value the agent is about to select into view, so the user sees which row
    * is being picked rather than a filter that silently rearranges itself.
    *
    * The discrete facet renders virtually - only the rows around the scroll position
    * exist in the DOM - so this scrolls the list container and lets the facet's own
    * scroll handler re-render. Purely cosmetic: any failure here is swallowed.
    */
    scrollSelectionIntoView(facet, selections) {
        try {
            if(!facet || !Array.isArray(selections) || selections.length == 0) {
                return false;
            }
            //Whichever list the facet is currently showing - a text search narrows it
            let rows = Array.isArray(facet.visibleData) && facet.visibleData.length > 0 ? facet.visibleData : facet.data;
            if(!Array.isArray(rows) || rows.length == 0) {
                return false;
            }

            let target = parseInt(selections[0]);
            let index = rows.findIndex(row => parseInt(row.id) == target);
            if(index < 0) {
                return false;
            }

            let container = $(facet.getDomRef()).find(".list-container");
            if(container.length == 0) {
                return false;
            }
            let rowHeight = facet.rowHeight || 20;
            //Centre the row rather than pinning it to the top edge
            let offset = Math.max(0, (index * rowHeight) - (container.height() / 2) + (rowHeight / 2));
            container.scrollTop(offset);
            return true;
        }
        catch(error) {
            return false;
        }
    }

    pause(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    handlers() {
        return {
            list_filters: () => this.listFilters(),
            get_state: () => this.getState(),
            get_filter_options: (args) => this.getFilterOptions(args),
            add_filter: (args) => this.addFilter(args),
            set_filter_selections: (args) => this.setFilterSelections(args),
            remove_filter: (args) => this.removeFilter(args),
            clear_filters: () => this.clearFilters(),
            set_domain: (args) => this.setDomain(args),
            set_result_view: (args) => this.setResultView(args),
            open_site_report: (args) => this.openSiteReport(args),
            close_site_report: () => this.closeSiteReport(),
            list_site_report_sections: () => this.listSiteReportSections(),
            set_site_report_section: (args) => this.setSiteReportSection(args),
            set_site_report_rows: (args) => this.setSiteReportRows(args),
            export_site_report: (args) => this.exportSiteReport(args),
            find_areas: (args) => this.findAreas(args),
            set_map_polygons: (args) => this.setMapPolygons(args),
            read_screen: (args) => this.screenReader.read(args),
            click: (args) => this.screenReader.click(args),
            set_value: (args) => this.screenReader.setValue(args)
        };
    }

    /*
    * Function: describesUserFacingChange
    * Whether a command changes what the user sees, so the chatbox can show a line about
    * it. Read-only lookups happen silently.
    */
    static isMutation(command) {
        return ["add_filter", "set_filter_selections", "remove_filter", "clear_filters", "set_domain", "set_result_view",
                "open_site_report", "close_site_report", "set_site_report_section", "set_site_report_rows",
                "export_site_report", "set_map_polygons", "click", "set_value"].indexOf(command) != -1;
    }

    listFilters() {
        let open = this.openFacets().map(facet => facet.name);
        let filters = [];
        (this.sqs.facetDef || []).forEach(group => {
            (group.filters || []).forEach(template => {
                let entry = {
                    id: template.name,
                    title: template.title,
                    group: group.title,
                    type: template.type,
                    description: template.description,
                    open: open.indexOf(template.name) != -1
                };
                //A staged filter is one facet asking two questions in order. Without this
                //the agent sees only the facet and has no way to know the first question
                //exists - or, having read of it elsewhere, tries to open it as a filter of
                //its own.
                if(Array.isArray(template.stagedFilters) && template.stagedFilters.length > 0) {
                    entry.stages = template.stagedFilters.slice();
                    entry.note = "Staged filter: pick "+entry.stages.join(", then ")
                        +". Use these stage ids with get_filter_options and set_filter_selections.";
                }
                filters.push(entry);
            });
        });
        return { filters: filters, openFilters: open };
    }

    /*
    * Function: getState
    * What the interface currently shows. Composed on demand by StateManager, which is
    * also where the viewstate save path gets its picture from - so there is one
    * description of the client rather than an agent-specific copy that can disagree
    * with it.
    */
    getState() {
        return this.sqs.stateManager.getInterfaceState();
    }

    /*
    * Function: getStateSummary
    * The compact version, sent with every message so the agent always knows roughly where
    * the user is - including changes the user made themselves between messages.
    */
    getStateSummary() {
        try {
            return this.sqs.stateManager.getInterfaceStateSummary();
        }
        catch(error) {
            //The agent still works without it; it just has to ask
            console.warn("SEAD agent could not read the interface state", error);
            return null;
        }
    }

    /*
    * Function: getFilterOptions
    * The selectable values of a discrete filter. The filter has to be open for its data to
    * be loaded, so this opens it if it isn't - which is what the user would have to do too.
    */
    async getFilterOptions(args) {
        let name = this.requireFilterName(args);
        let resolved = this.resolveFilter(name);
        if(!resolved) {
            throw new Error("There is no filter called '"+name+"'. Use list_filters to see what exists.");
        }

        let facet = this.sqs.facetManager.getFacetByName(resolved.id);
        if(!facet) {
            facet = await this.spawnAndAwait(resolved.id, []);
        }

        let rows = [];
        if(resolved.stageName) {
            //Each stage of a staged filter keeps its own values; the facet's own `data` is
            //not one of them
            let blockedBy = this.describeStagePrerequisite(resolved, facet);
            if(blockedBy) {
                return {
                    filter: name, options: [], stageOf: resolved.id,
                    note: "'"+name+"' is stage "+(resolved.stageIndex + 1)+" of "+resolved.stages.length
                        +" in the '"+resolved.id+"' filter, and has no values until the stages before it"
                        +" are picked. Select something in '"+blockedBy+"' first."
                };
            }
            let stage = await this.awaitStageData(facet, resolved.stageName);
            rows = stage && Array.isArray(stage.data) ? stage.data : [];
        }
        else {
            rows = Array.isArray(facet.data) ? facet.data : [];
        }

        if(rows.length == 0) {
            return { filter: name, options: [], note: "This filter has no selectable list - it may be a range or map filter." };
        }

        let search = typeof args.search == "string" ? args.search.trim().toLowerCase() : "";
        let options = rows
            //'count' is the aggregate the client shows next to each value - it tells the
            //agent which options are actually worth suggesting
            .map(row => ({ id: row.id, name: String(row.title == null ? row.name : row.title), count: row.count }))
            .filter(option => search.length == 0 || option.name.toLowerCase().indexOf(search) != -1);

        //A discrete filter can hold thousands of values; the model only needs enough to
        //resolve what the user said
        const cap = 60;
        let total = options.length;
        return {
            filter: name,
            stageOf: resolved.stageName ? resolved.id : undefined,
            total: total,
            truncated: total > cap,
            options: options.slice(0, cap)
        };
    }

    async addFilter(args) {
        let name = this.requireFilterName(args);
        let resolved = this.resolveFilter(name);
        if(!resolved) {
            throw new Error("There is no filter called '"+name+"'. Use list_filters to see what exists.");
        }

        if(this.sqs.facetManager.getFacetByName(resolved.id)) {
            //Adding twice is a no-op in the client, so treat it as "make sure it's there"
            return await this.setFilterSelections(args, true);
        }
        let selections = this.normaliseSelections(args.selections);

        return await this.withBatchedResults(async () => {
            //Opened empty first, so the user can watch the value being picked rather than
            //finding the filter already narrowed to something they never saw
            let facet = await this.spawnAndAwait(resolved.id, []);
            if(selections.length > 0) {
                await this.applySelections(facet, resolved, selections);
            }
            return { applied: "add_filter", filter: name, filterOpened: resolved.id, selections: selections };
        });
    }

    /*
    * Function: applySelections
    * Applies a selection to whichever part of the facet it belongs to. A staged filter keeps
    * its selections per stage, out of reach of the facet's own setSelections() - which
    * accepts the call, changes nothing the server ever sees, and leaves the caller thinking
    * the filter was applied.
    */
    async applySelections(facet, resolved, selections) {
        if(resolved.stageName) {
            if(typeof facet.setStageSelections != "function") {
                throw new Error("The filter '"+resolved.id+"' does not take staged selections.");
            }
            let blockedBy = this.describeStagePrerequisite(resolved, facet);
            if(blockedBy) {
                throw new Error("'"+resolved.stageName+"' is stage "+(resolved.stageIndex + 1)+" of "
                    +resolved.stages.length+" in the '"+resolved.id+"' filter. Select something in '"
                    +blockedBy+"' first.");
            }
            if(!facet.setStageSelections(resolved.stageName, selections)) {
                throw new Error("The filter '"+resolved.id+"' has no stage called '"+resolved.stageName+"'.");
            }
            //Picking a system loads its codes; waiting here means a follow-up
            //get_filter_options sees them rather than an empty list
            let next = resolved.stages[resolved.stageIndex + 1];
            if(next && selections.length > 0) {
                await this.awaitStageData(facet, next);
            }
            return;
        }
        await this.revealAndSelect(facet, selections);
    }

    /*
    * Function: revealAndSelect
    * Scrolls the value into view, holds it there long enough to be noticed, then selects
    * it. If the row can't be found the selection still happens - just without the scroll.
    */
    async revealAndSelect(facet, selections) {
        if(this.scrollSelectionIntoView(facet, selections)) {
            await this.pause(SeadAgentActions.REVEAL_DELAY_MS);
        }
        //For a list filter the second argument means "don't append", but for the timeline
        //it means "don't fetch new data", which would move the slider and change nothing else
        if(facet instanceof Timeline) {
            facet.setSelections(selections);
        }
        else {
            facet.setSelections(selections, false);
        }
        //Re-scroll: applying a selection re-renders the list, and a facet set to show only
        //selections reorders it entirely
        this.scrollSelectionIntoView(facet, selections);
    }

    async setFilterSelections(args, tolerateMissing = false) {
        let name = this.requireFilterName(args);
        let resolved = this.resolveFilter(name);
        if(!resolved) {
            throw new Error("There is no filter called '"+name+"'. Use list_filters to see what exists.");
        }

        let facet = this.sqs.facetManager.getFacetByName(resolved.id);
        if(!facet) {
            if(!tolerateMissing) {
                throw new Error("The filter '"+resolved.id+"' is not open. Add it first.");
            }
            return await this.addFilter(args);
        }

        let selections = this.normaliseSelections(args.selections);

        return await this.withBatchedResults(async () => {
            await this.applySelections(facet, resolved, selections);
            return { applied: "set_filter_selections", filter: name, selections: selections };
        });
    }

    async removeFilter(args) {
        let name = this.requireFilterName(args);
        let resolved = this.resolveFilter(name);
        //A stage cannot be closed on its own - it is part of its facet, so that is what goes
        let facet = this.sqs.facetManager.getFacetByName(resolved ? resolved.id : name);
        if(!facet) {
            throw new Error("The filter '"+name+"' is not open.");
        }
        return await this.withBatchedResults(() => {
            facet.destroy();
            return { applied: "remove_filter", filter: name };
        });
    }

    async clearFilters() {
        return await this.withBatchedResults(() => {
            this.sqs.facetManager.reset();
            return { applied: "clear_filters" };
        });
    }

    setDomain(args) {
        let domain = typeof args.domain == "string" ? args.domain.trim() : "";
        if(!domain) {
            throw new Error("Missing 'domain'.");
        }
        //Only offer what this deployment actually enabled, rather than the full list
        let available = this.availableDomains();
        if(available.length > 0 && available.indexOf(domain) == -1) {
            throw new Error("Unknown domain '"+domain+"'. Available: "+available.join(", "));
        }
        this.sqs.domainManager.setActiveDomain(domain);
        return { applied: "set_domain", domain: domain };
    }

    async setResultView(args) {
        let view = typeof args.view == "string" ? args.view.trim() : "";
        if(["map", "table", "mosaic"].indexOf(view) == -1) {
            throw new Error("Unknown result view '"+view+"'. Use map, table or mosaic.");
        }
        await this.sqs.resultManager.setActiveModule(view);
        let active = this.sqs.resultManager.getActiveModule();
        return { applied: "set_result_view", view: active ? active.name : view };
    }

    /*
    * Function: openSiteReport
    * Opens one site's report page - the same thing as clicking a row's site report button,
    * or visiting /site/<id> directly. Waits for the report to finish loading so a
    * follow-up command sees its sections rather than an empty shell.
    */
    async openSiteReport(args) {
        let siteId = parseInt(args.siteId);
        if(isNaN(siteId)) {
            throw new Error("Missing or invalid 'siteId'.");
        }

        //Same pair the router runs for a /site/<id> URL, so the history entry and the
        //back button behave exactly as they would for a real navigation
        this.sqs.setActiveView("siteReport");
        this.sqs.siteReportManager.renderSiteReport(siteId);

        let report = await this.awaitSiteReport(siteId);
        if(!report) {
            throw new Error("The site report for site "+siteId+" did not load.");
        }

        let site = report.siteData || {};
        return {
            applied: "open_site_report",
            siteId: siteId,
            siteName: site.site_name || null,
            url: "/site/" + siteId,
            sections: this.describeSections(report.data ? report.data.sections : [])
        };
    }

    /*
    * Function: awaitSiteReport
    * The report is fetched and rendered asynchronously with no promise to await, so this
    * polls for the manager to be holding a finished report for the site we asked for.
    */
    awaitSiteReport(siteId) {
        return new Promise((resolve) => {
            let waited = 0;
            let poll = setInterval(() => {
                waited += 150;
                let report = this.sqs.siteReportManager ? this.sqs.siteReportManager.siteReport : null;
                let loaded = report && report.siteId == siteId && report.fetchComplete;

                if(loaded || waited >= 20000) {
                    clearInterval(poll);
                    resolve(loaded ? report : null);
                }
            }, 150);
        });
    }

    closeSiteReport() {
        if(!this.currentSiteReport()) {
            throw new Error("No site report is open.");
        }
        this.sqs.siteReportManager.unrenderSiteReport();
        return { applied: "close_site_report" };
    }

    currentSiteReport() {
        let report = this.sqs.siteReportManager ? this.sqs.siteReportManager.siteReport : null;
        //A destroyed report is left on the manager, so check the view too
        return report && this.sqs.activeView == "siteReport" ? report : null;
    }

    requireSiteReport() {
        let report = this.currentSiteReport();
        if(!report) {
            throw new Error("No site report is open. Open one with open_site_report first.");
        }
        return report;
    }

    listSiteReportSections() {
        let report = this.requireSiteReport();
        return {
            siteId: report.siteId,
            siteName: report.siteData ? report.siteData.site_name : null,
            sections: this.describeSections(report.data ? report.data.sections : []),
            note: "A section that is expanded lists its expandableRows: table rows - a sample group, say - "
                +"that open to show the rows inside them (its samples). Open them with set_site_report_rows; "
                +"set_site_report_section only opens and closes whole sections. A collapsed section's rows "
                +"are not listed until it is expanded."
        };
    }

    /*
    * Function: describeSections
    * Flattens the section tree into something the agent can pick an id out of. Sections
    * nest (an analysis method holds its datasets), so the level is kept for context.
    */
    describeSections(sections, level = 0) {
        let described = [];
        (Array.isArray(sections) ? sections : []).forEach(section => {
            if(!section || !section.name) {
                return;
            }
            described.push({
                id: section.name,
                title: section.title,
                level: level,
                expanded: section.collapsed === false,
                contentItems: Array.isArray(section.contentItems) ? section.contentItems.length : 0
            });
            let rows = this.expandableRows(section.name);
            if(rows.length > 0) {
                let entry = described[described.length - 1];
                entry.expandableRows = rows.slice(0, SeadAgentActions.MAX_LISTED_ROWS).map(row => ({
                    id: row.id, label: row.label, expanded: row.expanded
                }));
                if(rows.length > SeadAgentActions.MAX_LISTED_ROWS) {
                    entry.expandableRowsNotListed = rows.length - SeadAgentActions.MAX_LISTED_ROWS;
                }
            }
            if(Array.isArray(section.sections) && section.sections.length > 0) {
                described = described.concat(this.describeSections(section.sections, level + 1));
            }
        });
        return described;
    }

    findSection(sections, name) {
        for(let section of (Array.isArray(sections) ? sections : [])) {
            if(!section) {
                continue;
            }
            if(section.name == name) {
                return section;
            }
            let found = this.findSection(section.sections, name);
            if(found) {
                return found;
            }
        }
        return null;
    }

    /*
    * Function: setSiteReportSection
    * Expands or collapses a section. Expanding renders its content items, which is why
    * this goes through setSectionCollapsedState rather than just toggling a class.
    */
    async setSiteReportSection(args) {
        let report = this.requireSiteReport();
        let name = typeof args.section == "string" ? args.section.trim() : "";
        if(!name) {
            throw new Error("Missing 'section'.");
        }

        let section = this.findSection(report.data ? report.data.sections : [], name);
        if(!section) {
            throw new Error("There is no section '"+name+"' in this site report. Use list_site_report_sections to see what exists.");
        }

        let node = $("#site-report-section-"+name)[0];
        if(!node) {
            throw new Error("The section '"+name+"' is not rendered yet.");
        }

        section.collapsed = args.expanded === false;
        report.setSectionCollapsedState(node, section);

        if(!section.collapsed) {
            //Same reveal the client does when it expands a section itself
            await this.pause(150);
            try {
                node.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            catch(error) {
                //Cosmetic only
            }
        }

        return { applied: "set_site_report_section", section: name, title: section.title, expanded: !section.collapsed };
    }

    /*
    * Function: expandableRows
    * The rows of a section's own tables that open onto a table of their own - each sample
    * group in "Samples" opens onto its samples. Read from the page, since that is where a
    * row is or isn't open; only rows on screen exist there, so a collapsed section, or a
    * row on another page of a paged table, has none to find.
    */
    expandableRows(sectionName) {
        return $("tr.site-report-table-row-with-subtable[row-id]", "#site-report-section-"+sectionName)
            .filter((index, node) => $(node).closest("[site-report-section-name]").attr("site-report-section-name") == sectionName)
            .map((index, node) => {
                let row = $(node);
                //The cells after the chevron say what the row is, e.g. "12724 BjorkerodsMosse_bugsdata.xls"
                let label = row.children("td").not(".site-report-expand-chevron").slice(0, 2)
                    .map((i, cell) => $(cell).text().trim()).get().filter(text => text).join(" ");
                return { id: String(row.attr("row-id")), label: label, expanded: row.hasClass("table-row-expanded"), node: node };
            }).get();
    }

    /*
    * Function: setSiteReportRows
    * Opens or closes rows inside a section's table - a sample group, to show its samples.
    * Goes through the row's own click handler, so the table renders the sub-table exactly
    * as it does for a user, and reports the state the rows are in afterwards rather than
    * the one that was asked for.
    */
    async setSiteReportRows(args) {
        let report = this.requireSiteReport();
        let name = typeof args.section == "string" ? args.section.trim() : "";
        if(!name) {
            throw new Error("Missing 'section'.");
        }
        let wanted = (Array.isArray(args.rows) ? args.rows : []).map(id => String(id).trim()).filter(id => id);
        if(wanted.length == 0) {
            throw new Error("Missing 'rows' - the ids of the rows to open, as given by list_site_report_sections.");
        }
        let expand = args.expanded !== false;

        let section = this.findSection(report.data ? report.data.sections : [], name);
        if(!section) {
            throw new Error("There is no section '"+name+"' in this site report. Use list_site_report_sections to see what exists.");
        }
        //Rows only exist on the page once their section is open
        if(expand && section.collapsed !== false) {
            await this.setSiteReportSection({ section: name, expanded: true });
            await this.pause(300);
        }

        let rows = this.expandableRows(name);
        let found = rows.filter(row => wanted.indexOf(row.id) != -1);
        let notFound = wanted.filter(id => !rows.some(row => row.id == id));
        if(found.length == 0) {
            throw new Error("None of the rows "+wanted.join(", ")+" can be opened in '"+name+"'. "
                +(rows.length > 0
                    ? "The rows that can be: "+rows.slice(0, SeadAgentActions.MAX_LISTED_ROWS).map(row => row.id).join(", ")+"."
                    : "This section has no rows that open onto further rows."));
        }

        found.forEach(row => {
            if(row.expanded != expand) {
                $(row.node).trigger("click");
            }
        });

        if(expand) {
            await this.pause(150);
            try {
                found[0].node.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            catch(error) {
                //Cosmetic only
            }
        }

        //What the page shows now, not what was asked for
        let after = this.expandableRows(name).filter(row => wanted.indexOf(row.id) != -1);
        let result = {
            applied: "set_site_report_rows",
            section: name,
            title: section.title,
            rows: after.map(row => ({ id: row.id, label: row.label, expanded: row.expanded }))
        };
        if(notFound.length > 0) {
            result.notFound = notFound;
            result.note = "Rows not found may be on another page of the table, or not exist in this section.";
        }
        return result;
    }

    /*
    * Function: exportSiteReport
    * Opens the export chooser. The download itself stays the user's click - we don't want
    * the agent putting files on someone's disk unasked.
    */
    async exportSiteReport(args) {
        let report = this.requireSiteReport();
        let name = typeof args.section == "string" ? args.section.trim() : "";
        let section = "all";

        if(name) {
            section = this.findSection(report.data ? report.data.sections : [], name);
            if(!section) {
                throw new Error("There is no section '"+name+"' in this site report.");
            }
        }

        await report.renderExportDialog(["json", "xlsx"], section, "all");
        return { applied: "export_site_report", section: name || "all", note: "The export dialog is open; the user chooses the format." };
    }

    /*
    * Function: findAreas
    * Looks up administrative areas - countries, regions, municipalities - by name in the
    * GADM boundary data the deployment loads alongside SEAD.
    *
    * This is a lookup, not a filter: it exists because area names repeat all over the world
    * ("York" is eight different places) and because the boundary each one resolves to is
    * addressed by a GADM id, not by its name. The id is what set_map_polygons takes.
    */
    async findAreas(args) {
        let query = typeof args.name == "string" ? args.name.trim() : "";
        if(query.length < 2) {
            throw new Error("Missing 'name' - the name of a country, region or municipality to look for.");
        }

        let url = this.sqs.config.dataServerAddress+"/gadm/areas?q="+encodeURIComponent(query);
        if(args.level != null && args.level !== "") {
            url += "&level="+encodeURIComponent(args.level);
        }
        if(typeof args.country == "string" && args.country.trim().length > 0) {
            url += "&country="+encodeURIComponent(args.country.trim());
        }

        let payload = await this.fetchJson(url, "Could not look up areas");
        let areas = Array.isArray(payload.areas) ? payload.areas : [];

        return {
            query: query,
            //Level is worth spelling out: the agent has to choose between a municipality and
            //the region of the same name, and "level 2" means nothing on its own
            areas: areas.map(area => ({
                id: area.gid,
                name: area.name,
                level: ["country", "region", "municipality"][area.level] || String(area.level),
                region: area.region,
                country: area.country
            }))
        };
    }

    /*
    * Function: setMapPolygons
    * Puts polygons on the map filter, either from named areas or as explicit coordinates.
    *
    * The map filter matches sites inside any of its polygons, so an area made of a mainland
    * and its islands, or several separate areas, is one filter rather than several. Areas are
    * given as GADM ids from find_areas; 'polygons' takes [[lat, lon], ...] rings directly, for
    * a shape that isn't an administrative area.
    */
    async setMapPolygons(args) {
        let areaIds = this.normaliseAreaIds(args.areas);
        let explicit = MapFacet.normalisePolygons(args.polygons);

        if(areaIds.length == 0 && explicit.length == 0) {
            throw new Error("Nothing to draw: give 'areas' (ids from find_areas) or 'polygons' ([[lat, lon], ...] rings).");
        }
        if(areaIds.length > SeadAgentActions.MAX_AREAS) {
            throw new Error("Too many areas at once - "+SeadAgentActions.MAX_AREAS+" is the limit.");
        }

        //Resolved before anything is applied, so a bad id doesn't leave the filter half set
        let resolved = [];
        for(let index = 0; index < areaIds.length; index++) {
            resolved.push(await this.fetchAreaPolygons(areaIds[index]));
        }

        let polygons = explicit.slice();
        resolved.forEach(area => {
            polygons = polygons.concat(MapFacet.normalisePolygons(area.polygons));
        });

        if(polygons.length == 0) {
            throw new Error("No usable polygons - the areas resolved to nothing that can be drawn.");
        }

        if(args.append === true) {
            let facet = this.sqs.facetManager.getFacetByName(SeadAgentActions.MAP_FILTER);
            let existing = facet ? MapFacet.normalisePolygons(facet.getSelections()) : [];
            polygons = existing.concat(polygons);
        }

        return await this.withBatchedResults(async () => {
            let facet = this.sqs.facetManager.getFacetByName(SeadAgentActions.MAP_FILTER);
            if(!facet) {
                //The map filter loads no option list, so there is nothing to wait for - it is
                //spawned directly rather than through spawnAndAwait, which polls for one
                facet = this.sqs.facetManager.spawnFacet(SeadAgentActions.MAP_FILTER, [], false);
                if(!facet) {
                    throw new Error("The map filter could not be added.");
                }
            }

            facet.setSelections(polygons);
            //The polygons usually sit somewhere else entirely on the map than where the user
            //was looking, and a filter you can't see is hard to trust
            if(typeof facet.fitViewToSelections == "function") {
                facet.fitViewToSelections();
            }
            facet.broadcastSelection();

            return {
                applied: "set_map_polygons",
                filter: SeadAgentActions.MAP_FILTER,
                areas: resolved.map(area => ({ id: area.gid, name: area.name, country: area.country })),
                polygons: polygons.length,
                //Small islands and minor rings are left out of a boundary - worth passing on,
                //since it is the difference between "Sweden" and "the Swedish mainland"
                omittedRings: resolved.reduce((sum, area) => sum + ((area.rings && area.rings.omitted) || 0), 0)
            };
        });
    }

    /*
    * Function: fetchAreaPolygons
    * One area's boundary, simplified by the server to something a filter can hold.
    */
    async fetchAreaPolygons(areaId) {
        let url = this.sqs.config.dataServerAddress+"/gadm/area/"+encodeURIComponent(areaId)+"/polygons";
        let area = await this.fetchJson(url, "Could not fetch the boundary for '"+areaId+"'");
        if(!area || !Array.isArray(area.polygons) || area.polygons.length == 0) {
            throw new Error("No boundary found for '"+areaId+"'. Use find_areas to get a valid area id.");
        }
        return area;
    }

    normaliseAreaIds(areas) {
        if(typeof areas == "string") {
            areas = areas.split(",");
        }
        if(!Array.isArray(areas)) {
            return [];
        }
        return areas
            .map(area => (typeof area == "string" ? area.trim() : (area && area.id ? String(area.id).trim() : "")))
            .filter(area => area.length > 0);
    }

    /*
    * Function: fetchJson
    * A GET against the data server, with the failure reported in words the agent can pass on
    * rather than as an unhandled rejection.
    */
    async fetchJson(url, failureMessage) {
        let response;
        try {
            response = await fetch(url);
        }
        catch(error) {
            throw new Error(failureMessage+": the data server could not be reached.");
        }
        if(!response.ok) {
            throw new Error(failureMessage+" (HTTP "+response.status+").");
        }
        return await response.json();
    }

    /*
    * Function: spawnAndAwait
    * Adds a filter and waits for its data to load, so a follow-up command sees the values
    * rather than an empty facet.
    */
    spawnAndAwait(name, selections) {
        if(!this.sqs.facetManager.getFacetTemplateByFacetId(name)) {
            throw new Error("There is no filter called '"+name+"'. Use list_filters to see what exists.");
        }
        //triggerResultLoad=false: the batched refresh does one clean render at the end
        let facet = this.sqs.facetManager.spawnFacet(name, selections, false);
        if(!facet) {
            throw new Error("The filter '"+name+"' could not be added.");
        }

        return new Promise((resolve) => {
            //Poll rather than hook the facet's internals; the data arrives asynchronously
            //and the facet has no single 'loaded' promise to await
            let waited = 0;
            let poll = setInterval(() => {
                waited += 100;
                if((Array.isArray(facet.data) && facet.data.length > 0) || waited >= 10000) {
                    clearInterval(poll);
                    resolve(facet);
                }
            }, 100);
        });
    }

    /*
    * Function: resolveFilter
    * Turns a filter id from the agent into the thing the client actually has.
    *
    * Some filters are staged: the client presents "Eco code" as one facet that asks for a
    * classification system first and its codes second, while the server, the filter
    * documentation and the interface state all speak of `ecocode_system` and `ecocode` as
    * two filters. Both readings arrive here, so both are answered: a stage id resolves to
    * its parent facet plus which stage it is.
    *
    * Returns { id, template, stages, stageName, stageIndex } - stageName is null for an
    * ordinary filter - or null when nothing in the client goes by that name.
    */
    resolveFilter(name) {
        let templates = (this.sqs.facetDef || []).flatMap(group => group.filters || []);

        for(let template of templates) {
            let stages = Array.isArray(template.stagedFilters) ? template.stagedFilters : [];
            let stageIndex = stages.indexOf(name);

            //A staged filter's last stage carries the same id as the facet itself
            //(`ecocode`), and that id means the stage - which is the list the user is
            //picking from when they name it.
            if(stageIndex != -1) {
                return { id: template.name, template: template, stages: stages,
                         stageName: name, stageIndex: stageIndex };
            }
            if(template.name == name) {
                return { id: template.name, template: template, stages: stages,
                         stageName: null, stageIndex: -1 };
            }
        }
        return null;
    }

    /*
    * Function: stageOf
    * The stage object inside an open staged facet, or null.
    */
    stageOf(facet, stageName) {
        if(!facet || !Array.isArray(facet.filters) || !stageName) {
            return null;
        }
        return facet.filters.find(stage => stage.name == stageName) || null;
    }

    /*
    * Function: awaitStageData
    * Waits for one stage's values to arrive. A stage only loads once the stages before it
    * have a selection, so this gives up rather than waiting out the clock every time.
    */
    async awaitStageData(facet, stageName) {
        let waited = 0;
        while(waited < SeadAgentActions.STAGE_DATA_TIMEOUT_MS) {
            let stage = this.stageOf(facet, stageName);
            if(stage && Array.isArray(stage.data) && stage.data.length > 0) {
                return stage;
            }
            await this.pause(100);
            waited += 100;
        }
        return this.stageOf(facet, stageName);
    }

    /*
    * Function: describeStagePrerequisite
    * Why a stage is empty, in the terms the agent needs to act on: which stage to pick
    * first. Returns null when the stage has values and nothing is in the way.
    */
    describeStagePrerequisite(resolved, facet) {
        if(resolved.stageIndex < 1) {
            return null;
        }
        for(let index = 0; index < resolved.stageIndex; index++) {
            let earlier = this.stageOf(facet, resolved.stages[index]);
            if(!earlier || earlier.selections.length == 0) {
                return resolved.stages[index];
            }
        }
        return null;
    }

    requireFilterName(args) {
        let name = typeof args.filter == "string" ? args.filter.trim() : "";
        if(!name) {
            throw new Error("Missing 'filter'.");
        }
        return name;
    }

    /*
    * Function: normaliseSelections
    * Selections are ids for a discrete filter and [lower, upper] for a range one. Anything
    * that isn't a number is dropped rather than handed to the facet.
    */
    normaliseSelections(selections) {
        if(!Array.isArray(selections)) {
            return [];
        }
        return selections.map(value => Number(value)).filter(value => !isNaN(value));
    }

    availableDomains() {
        let manager = this.sqs.domainManager;
        if(!manager || !manager.config || !Array.isArray(manager.config.domains)) {
            return [];
        }
        return manager.config.domains.map(domain => domain.name);
    }

    /*
    * Function: openFacets
    * The filters the user currently has open. FacetManager keeps them in a plain array.
    */
    openFacets() {
        return Array.isArray(this.sqs.facetManager.facets) ? this.sqs.facetManager.facets : [];
    }

    /*
    * Function: currentSiteCount
    * How many sites the current filters match, when the active result module knows. It is
    * the single most useful number for the agent to report back, but not every view keeps
    * it, so a null here is normal rather than an error.
    */
    currentSiteCount() {
        try {
            let module = this.sqs.resultManager.getActiveModule();
            if(module && Array.isArray(module.sites)) {
                return module.sites.length;
            }
            if(module && Array.isArray(module.data)) {
                return module.data.length;
            }
        }
        catch(error) {
            //A view that isn't rendered yet simply has no count to give
        }
        return null;
    }
}
