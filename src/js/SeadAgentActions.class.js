/*
* Class: SeadAgentActions
* Runs the commands the SEAD agent asks for against this client.
*
* The agent never sends JavaScript. It sends a command name from the fixed list below
* plus arguments, and anything not in that list is refused here - so what the agent can
* do to the interface is bounded by this file, not by what the model decides to write.
*/
export default class SeadAgentActions {
    //Long enough for the scroll to register as a movement the user can follow, short
    //enough that a few filters in a row don't feel slow
    static REVEAL_DELAY_MS = 450;
    //How long to wait for a result load to land before giving up on reporting its count
    static RESULT_REFRESH_TIMEOUT_MS = 15000;

    constructor(sqs) {
        this.sqs = sqs;
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
            export_site_report: (args) => this.exportSiteReport(args)
        };
    }

    /*
    * Function: describesUserFacingChange
    * Whether a command changes what the user sees, so the chatbox can show a line about
    * it. Read-only lookups happen silently.
    */
    static isMutation(command) {
        return ["add_filter", "set_filter_selections", "remove_filter", "clear_filters", "set_domain", "set_result_view",
                "open_site_report", "close_site_report", "set_site_report_section", "export_site_report"].indexOf(command) != -1;
    }

    listFilters() {
        let open = this.openFacets().map(facet => facet.name);
        let filters = [];
        (this.sqs.facetDef || []).forEach(group => {
            (group.filters || []).forEach(template => {
                filters.push({
                    id: template.name,
                    title: template.title,
                    group: group.title,
                    type: template.type,
                    description: template.description,
                    open: open.indexOf(template.name) != -1
                });
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
        let facet = this.sqs.facetManager.getFacetByName(name);
        if(!facet) {
            facet = await this.spawnAndAwait(name, []);
        }

        let rows = Array.isArray(facet.data) ? facet.data : [];
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
            total: total,
            truncated: total > cap,
            options: options.slice(0, cap)
        };
    }

    async addFilter(args) {
        let name = this.requireFilterName(args);
        if(this.sqs.facetManager.getFacetByName(name)) {
            //Adding twice is a no-op in the client, so treat it as "make sure it's there"
            return await this.setFilterSelections(args, true);
        }
        let selections = this.normaliseSelections(args.selections);

        return await this.withBatchedResults(async () => {
            //Opened empty first, so the user can watch the value being picked rather than
            //finding the filter already narrowed to something they never saw
            let facet = await this.spawnAndAwait(name, []);
            if(selections.length > 0) {
                await this.revealAndSelect(facet, selections);
            }
            return { applied: "add_filter", filter: name, selections: selections };
        });
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
        facet.setSelections(selections, false);
        //Re-scroll: applying a selection re-renders the list, and a facet set to show only
        //selections reorders it entirely
        this.scrollSelectionIntoView(facet, selections);
    }

    async setFilterSelections(args, tolerateMissing = false) {
        let name = this.requireFilterName(args);
        let facet = this.sqs.facetManager.getFacetByName(name);
        if(!facet) {
            if(!tolerateMissing) {
                throw new Error("The filter '"+name+"' is not open. Add it first.");
            }
            return await this.addFilter(args);
        }

        let selections = this.normaliseSelections(args.selections);

        return await this.withBatchedResults(async () => {
            await this.revealAndSelect(facet, selections);
            return { applied: "set_filter_selections", filter: name, selections: selections };
        });
    }

    async removeFilter(args) {
        let name = this.requireFilterName(args);
        let facet = this.sqs.facetManager.getFacetByName(name);
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
            sections: this.describeSections(report.data ? report.data.sections : [])
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
