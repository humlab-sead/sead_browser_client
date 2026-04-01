class QuickstartSearch {
    constructor(sqs) {
        this.sqs = sqs;
        this.tabOrder = ["sites", "sampleGroups", "datasets", "methods"];
        this.tabResponseCategoryMap = {
            sites: "sites",
            sampleGroups: "sample_groups",
            datasets: "datasets",
            methods: "methods"
        };
        this.activeTab = "sites";
        this.searchDelay = 250;
        this.searchLimit = 20;
        this.currentSearchQuery = "";
        this.tabStates = this.createEmptyTabStates();
        this.scrollLoadThreshold = 72;
        this.suppressNextFocusOpen = false;
        this.latestRequestId = 0;
        this.searchDebounceTimer = null;
        this.tabTitles = {};
        this.tabFacetCandidates = {
            sites: ["sites", "site_name"],
            sampleGroups: ["sample_groups", "sample_group"],
            datasets: ["dataset_master", "datasets", "dataset_name"],
            methods: ["dataset_methods", "methods", "method_name"]
        };
        this.tabCategoryIdFieldMap = {
            sites: "site_id",
            sampleGroups: "sample_group_id",
            datasets: "dataset_id",
            methods: "method_id"
        };

        this.$container = $("#search-container");
        if(this.$container.length === 0) {
            return;
        }

        this.$input = $("#search-container-input");
        this.$submit = $("#search-container-submit");
        this.$dropdown = $("#search-container-dropdown");
        this.$tabs = this.$dropdown.find(".search-dropdown-tab");
        this.$panels = this.$dropdown.find(".search-dropdown-panel");
        this.$panelContainer = this.$dropdown.find(".search-dropdown-panels");
        this.$panelBodies = this.$dropdown.find(".search-dropdown-panel-body");
        this.$resizeHandle = this.$dropdown.find(".search-dropdown-resize-handle");

        this.$tabs.each((index, tabNode) => {
            const $tabNode = $(tabNode);
            const tabKey = $tabNode.data("tab");
            this.tabTitles[tabKey] = $tabNode.text();
        });

        this.bindEvents();
        this.initResizeHandle();
    }

    bindEvents() {
        this.$input.on("input", () => {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                this.search();
            }, this.searchDelay);
        });

        this.$input.on("keydown", (evt) => {
            if(evt.key === "Enter") {
                evt.preventDefault();
                clearTimeout(this.searchDebounceTimer);
                this.search();
            }

            if(evt.key === "Escape") {
                this.hideDropdown();
            }
        });

        this.$submit.on("click", () => {
            clearTimeout(this.searchDebounceTimer);
            this.search();
        });

        this.$tabs.on("click", (evt) => {
            const tabKey = $(evt.currentTarget).data("tab");
            this.setActiveTab(tabKey);
        });

        this.$input.on("focus", () => {
            if(this.suppressNextFocusOpen) {
                this.suppressNextFocusOpen = false;
                return;
            }
            if(this.$input.val().trim().length > 0) {
                this.showDropdown();
            }
        });

        this.handleGlobalPointerDown = (evt) => {
            const eventTarget = evt.target;
            if(!eventTarget || this.$dropdown.length === 0) {
                return;
            }

            if(this.$dropdown[0].contains(eventTarget)) {
                return;
            }

            if(this.$input.length > 0 && this.$input[0] === eventTarget) {
                this.suppressNextFocusOpen = true;
            }

            this.hideDropdown();
        };

        // Capture phase is used so this still runs even when other modules stop bubbling.
        document.addEventListener("mousedown", this.handleGlobalPointerDown, true);
        document.addEventListener("touchstart", this.handleGlobalPointerDown, true);

        this.$panelBodies.on("scroll", (evt) => {
            const tabKey = this.resolveTabKeyFromPanelBody(evt.currentTarget);
            if(tabKey) {
                this.handleTabScroll(tabKey);
            }
        });
    }

    initResizeHandle() {
        if(this.$resizeHandle.length === 0 || this.$panelContainer.length === 0) {
            return;
        }

        let startY = 0;
        let startHeight = 0;
        let isResizing = false;
        const minHeight = 120;
        const viewportPadding = 24;

        this.$resizeHandle.on("mousedown", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();

            isResizing = true;
            startY = evt.clientY;
            startHeight = this.$panelContainer.outerHeight();

            this.$dropdown.addClass("search-dropdown-resizing");
            $("body").addClass("search-dropdown-resizing");

            $(document).on("mousemove.searchDropdownResize", (moveEvt) => {
                if(!isResizing) {
                    return;
                }

                const deltaY = moveEvt.clientY - startY;
                const viewportMaxHeight = Math.max(minHeight, window.innerHeight - viewportPadding);
                let newHeight = startHeight + deltaY;
                newHeight = Math.max(minHeight, Math.min(newHeight, viewportMaxHeight));

                this.$panelContainer.css("height", newHeight+"px");
            });

            $(document).on("mouseup.searchDropdownResize", () => {
                if(!isResizing) {
                    return;
                }

                isResizing = false;
                this.$dropdown.removeClass("search-dropdown-resizing");
                $("body").removeClass("search-dropdown-resizing");
                $(document).off("mousemove.searchDropdownResize");
                $(document).off("mouseup.searchDropdownResize");
            });
        });
    }

    search() {
        const searchQuery = this.normalizeSearchTerm(this.$input.val());

        if(searchQuery.length === 0) {
            this.hideDropdown();
            this.resetSearchState();
            return;
        }

        this.showDropdown();

        if(searchQuery.length < 2) {
            this.resetSearchState();
            this.renderInfoState("Type at least 2 characters to search.");
            return;
        }

        const requestId = ++this.latestRequestId;
        this.currentSearchQuery = searchQuery;
        this.renderLoadingState();
        this.requestFirstPageForAllTabs(searchQuery, requestId);
    }

    requestFirstPageForAllTabs(searchQuery, requestId) {
        const tabRequests = this.tabOrder.map((tabKey) => {
            return this.requestTabPage(tabKey, searchQuery, 1, requestId, true);
        });

        Promise.allSettled(tabRequests).then(() => {
            if(requestId !== this.latestRequestId) {
                return;
            }
            this.ensureActiveTabHasResults();
        });
    }

    normalizeSearchTerm(searchTerm) {
        if(typeof searchTerm !== "string") {
            return "";
        }
        const normalized = typeof searchTerm.normalize === "function" ? searchTerm.normalize("NFKC") : searchTerm;
        return normalized.replace(/\s+/g, " ").trim();
    }

    normalizeLimit(limit) {
        const parsed = parseInt(limit, 10);
        if(Number.isNaN(parsed)) {
            return 20;
        }
        return Math.min(50, Math.max(1, parsed));
    }

    normalizePage(page) {
        const parsed = parseInt(page, 10);
        if(Number.isNaN(parsed)) {
            return 1;
        }
        return Math.max(1, parsed);
    }

    createEmptyTabState() {
        return {
            items: [],
            total: 0,
            page: 0,
            hasMore: false,
            isLoadingInitial: false,
            isLoadingMore: false,
            isLoaded: false,
            errorMessage: null
        };
    }

    createEmptyTabStates() {
        const tabStates = {};
        this.tabOrder.forEach((tabKey) => {
            tabStates[tabKey] = this.createEmptyTabState();
        });
        return tabStates;
    }

    resetSearchState() {
        this.currentSearchQuery = "";
        this.tabStates = this.createEmptyTabStates();
        this.resetTabTitles();
        this.$panelBodies.each((index, bodyNode) => {
            $(bodyNode).empty().scrollTop(0);
        });
    }

    getTabState(tabKey) {
        if(!Object.prototype.hasOwnProperty.call(this.tabStates, tabKey)) {
            this.tabStates[tabKey] = this.createEmptyTabState();
        }
        return this.tabStates[tabKey];
    }

    resolveTabKeyFromPanelBody(panelBodyNode) {
        const $panelBody = $(panelBodyNode);
        const $panel = $panelBody.closest(".search-dropdown-panel");
        if($panel.length === 0) {
            return null;
        }
        return $panel.data("tab") || null;
    }

    getPanelBodyForTab(tabKey) {
        return this.$dropdown.find(".search-dropdown-panel[data-tab='"+tabKey+"'] .search-dropdown-panel-body");
    }

    getResponseCategoryKeyForTab(tabKey) {
        return this.tabResponseCategoryMap[tabKey] || tabKey;
    }

    getTabTotalFromState(tabState) {
        if(!tabState) {
            return 0;
        }
        const parsedTotal = parseInt(tabState.total, 10);
        if(Number.isNaN(parsedTotal)) {
            return Array.isArray(tabState.items) ? tabState.items.length : 0;
        }
        return Math.max(parsedTotal, Array.isArray(tabState.items) ? tabState.items.length : 0);
    }

    updateTabTitle(tabKey) {
        const $tabNode = this.$tabs.filter("[data-tab='"+tabKey+"']");
        if($tabNode.length === 0) {
            return;
        }
        const tabState = this.getTabState(tabKey);
        const tabTotal = this.getTabTotalFromState(tabState);
        $tabNode.text(this.tabTitles[tabKey]+" ("+tabTotal+")");
    }

    updateAllTabTitles() {
        this.tabOrder.forEach((tabKey) => {
            this.updateTabTitle(tabKey);
        });
    }

    resolveConfiguredTabEndpoint(tabKey) {
        const configured = this.sqs.config.quickstartSearchEndpoints;
        if(!configured || typeof configured !== "object") {
            return null;
        }
        if(typeof configured[tabKey] === "string" && configured[tabKey].length > 0) {
            return configured[tabKey];
        }
        return null;
    }

    buildTabSearchRequestUrl(tabKey, searchQuery, page) {
        const limit = this.normalizeLimit(this.searchLimit);
        const normalizedPage = this.normalizePage(page);
        const encodedQuery = encodeURIComponent(searchQuery);
        const categoryKey = this.getResponseCategoryKeyForTab(tabKey);
        const configuredTemplate = this.resolveConfiguredTabEndpoint(tabKey);

        if(configuredTemplate) {
            return this.interpolateEndpointTemplate(configuredTemplate, {
                query: encodedQuery,
                tab: tabKey,
                category: categoryKey,
                limit: String(limit),
                page: String(normalizedPage)
            });
        }

        return this.sqs.config.dataServerAddress+"/search/"+categoryKey+"/"+encodedQuery+"?limit="+limit+"&page="+normalizedPage;
    }

    interpolateEndpointTemplate(template, values) {
        let output = template;
        Object.keys(values).forEach((key) => {
            output = output.replace(new RegExp("\\{"+key+"\\}", "g"), values[key]);
        });
        if(output.indexOf("http://") === 0 || output.indexOf("https://") === 0) {
            return output;
        }
        if(output.indexOf("/") !== 0) {
            output = "/"+output;
        }
        return this.sqs.config.dataServerAddress+output;
    }

    fetchTabResultsPage(tabKey, searchQuery, page) {
        const requestUrl = this.buildTabSearchRequestUrl(tabKey, searchQuery, page);

        return fetch(requestUrl, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            }
        }).then((response) => {
            if(!response.ok) {
                throw new Error("Search request failed with status "+response.status);
            }
            return response.json();
        }).then((data) => {
            return this.mapApiResponseToTabResults(data, tabKey);
        });
    }

    mapApiResponseToTabResults(responseData, tabKey) {
        const categoryPayload = this.resolveCategoryPayloadForTab(responseData, tabKey);
        const items = this.mapCategoryItems(categoryPayload, tabKey);
        const total = this.mapCategoryTotal(categoryPayload, items.length);
        const hasMore = this.mapCategoryHasMore(categoryPayload, items.length, total);
        const page = this.mapCategoryPage(categoryPayload, 1);
        return {
            items: items,
            total: total,
            hasMore: hasMore,
            page: page
        };
    }

    resolveCategoryPayloadForTab(responseData, tabKey) {
        if(!responseData || typeof responseData !== "object") {
            return null;
        }

        if(Array.isArray(responseData.items)) {
            return responseData;
        }

        const categoryKey = this.getResponseCategoryKeyForTab(tabKey);
        if(responseData.categories && typeof responseData.categories === "object") {
            return responseData.categories[categoryKey] || null;
        }

        if(responseData[tabKey] && typeof responseData[tabKey] === "object") {
            return responseData[tabKey];
        }

        if(responseData[categoryKey] && typeof responseData[categoryKey] === "object") {
            return responseData[categoryKey];
        }

        return null;
    }

    requestTabPage(tabKey, searchQuery, page, requestId, replaceItems = false) {
        const tabState = this.getTabState(tabKey);
        if(!replaceItems && (tabState.isLoadingInitial || tabState.isLoadingMore)) {
            return Promise.resolve();
        }
        if(replaceItems && tabState.isLoadingMore) {
            return Promise.resolve();
        }

        tabState.errorMessage = null;
        if(replaceItems) {
            tabState.items = [];
            tabState.total = 0;
            tabState.page = 0;
            tabState.isLoaded = false;
            tabState.isLoadingInitial = true;
            const $panelBody = this.getPanelBodyForTab(tabKey);
            $panelBody.scrollTop(0);
        }
        else {
            tabState.isLoadingMore = true;
        }

        this.renderTab(tabKey);
        this.updateTabTitle(tabKey);

        return this.fetchTabResultsPage(tabKey, searchQuery, page).then((tabPage) => {
            if(requestId !== this.latestRequestId) {
                return;
            }
            const nextItems = Array.isArray(tabPage.items) ? tabPage.items : [];
            if(replaceItems) {
                tabState.items = nextItems;
            }
            else {
                tabState.items = tabState.items.concat(nextItems);
            }
            tabState.total = Number.isFinite(Number(tabPage.total)) ? Number(tabPage.total) : tabState.items.length;
            tabState.page = Number.isFinite(Number(tabPage.page)) ? Number(tabPage.page) : page;
            if(typeof tabPage.hasMore === "boolean") {
                tabState.hasMore = tabPage.hasMore;
            }
            else {
                tabState.hasMore = tabState.items.length < tabState.total;
            }
            tabState.isLoaded = true;
            tabState.errorMessage = null;
            if(nextItems.length === 0 && !replaceItems && this.getTabTotalFromState(tabState) > tabState.items.length) {
                tabState.total = tabState.items.length;
                tabState.hasMore = false;
            }
        }).catch((error) => {
            if(requestId !== this.latestRequestId) {
                return;
            }
            console.warn("Quickstart search failed for tab "+tabKey, error);
            if(replaceItems) {
                tabState.items = [];
                tabState.total = 0;
                tabState.page = 0;
                tabState.hasMore = false;
                tabState.isLoaded = false;
                tabState.errorMessage = "Search is temporarily unavailable. Please try again.";
            }
            else {
                tabState.errorMessage = "Could not load more results right now.";
            }
        }).finally(() => {
            if(requestId !== this.latestRequestId) {
                return;
            }
            tabState.isLoadingInitial = false;
            tabState.isLoadingMore = false;
            this.renderTab(tabKey);
            this.updateTabTitle(tabKey);
            this.ensureActiveTabHasResults();
            this.scheduleLoadMoreCheck(tabKey);
        });
    }

    mapCategoryTotal(categoryData, fallbackCount) {
        if(!categoryData) {
            return fallbackCount;
        }
        let totalValue = categoryData.total;
        if(typeof totalValue === "undefined" && categoryData.pagination && typeof categoryData.pagination === "object") {
            totalValue = categoryData.pagination.total;
        }
        const parsedTotal = parseInt(totalValue, 10);
        if(Number.isNaN(parsedTotal)) {
            return fallbackCount;
        }
        return Math.max(0, parsedTotal);
    }

    mapCategoryHasMore(categoryData, itemCount, total) {
        if(categoryData && categoryData.pagination && typeof categoryData.pagination === "object" && typeof categoryData.pagination.has_more === "boolean") {
            return categoryData.pagination.has_more;
        }
        if(categoryData && categoryData.pagination && typeof categoryData.pagination === "object") {
            const parsedPage = parseInt(categoryData.pagination.page, 10);
            const parsedTotalPages = parseInt(categoryData.pagination.total_pages, 10);
            if(!Number.isNaN(parsedPage) && !Number.isNaN(parsedTotalPages)) {
                return parsedPage < parsedTotalPages;
            }

            const parsedLimit = parseInt(categoryData.pagination.limit, 10);
            const parsedTotal = parseInt(categoryData.pagination.total, 10);
            if(!Number.isNaN(parsedPage) && !Number.isNaN(parsedLimit) && !Number.isNaN(parsedTotal)) {
                return (parsedPage * parsedLimit) < parsedTotal;
            }
        }
        if(itemCount === 0) {
            return false;
        }
        return itemCount < total;
    }

    mapCategoryPage(categoryData, fallbackPage) {
        if(!categoryData || !categoryData.pagination || typeof categoryData.pagination !== "object") {
            return fallbackPage;
        }
        const parsedPage = parseInt(categoryData.pagination.page, 10);
        if(Number.isNaN(parsedPage)) {
            return fallbackPage;
        }
        return Math.max(1, parsedPage);
    }

    mapCategoryItems(categoryData, tabKey) {
        if(!categoryData || !Array.isArray(categoryData.items)) {
            return [];
        }

        return categoryData.items.map((item) => {
            let title = item.matched_value || item.site_name || "Untitled result";
            if(tabKey === "sites") {
                title = item.site_name || item.matched_value || "Untitled site";
            }
            const siteId = this.normalizeSiteId(item.site_id);
            const categoryId = this.normalizeCategoryId(item, tabKey);
            const facetCode = this.resolveFacetCodeForTab(tabKey);

            const metaParts = [];

            if(siteId !== null) {
                metaParts.push("Site ID: "+siteId);
            }
            if(tabKey !== "sites" && item.site_name) {
                metaParts.push("Site: "+item.site_name);
            }
            if(typeof item.score !== "undefined" && item.score !== null && item.score !== "") {
                const numericScore = Number(item.score);
                const scoreText = Number.isFinite(numericScore) ? numericScore.toFixed(3) : item.score;
                metaParts.push("Score: "+scoreText);
            }

            return {
                title: title,
                meta: metaParts.join(" | "),
                siteId: siteId,
                tabKey: tabKey,
                categoryId: categoryId,
                facetCode: facetCode,
                rawItem: item
            };
        });
    }

    normalizeSiteId(siteIdCandidate) {
        const parsed = parseInt(siteIdCandidate, 10);
        if(Number.isNaN(parsed)) {
            return null;
        }
        return parsed;
    }

    normalizeCategoryId(rawItem, tabKey) {
        const idField = this.tabCategoryIdFieldMap[tabKey];
        if(!idField) {
            return null;
        }
        return this.parseIntegerId(rawItem[idField]);
    }

    parseIntegerId(value) {
        const parsed = parseInt(value, 10);
        if(Number.isNaN(parsed)) {
            return null;
        }
        return parsed;
    }

    resolveFacetCodeForTab(tabKey) {
        const candidates = this.tabFacetCandidates[tabKey] || [];
        for(let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            const template = this.sqs.facetManager.getFacetTemplateByFacetId(candidate);
            if(template) {
                return candidate;
            }
        }
        return null;
    }

    ensureFacetDeployed(facetCode) {
        if(!facetCode) {
            return null;
        }

        let facet = this.sqs.facetManager.getFacetByName(facetCode);
        if(facet) {
            return facet;
        }

        const template = this.sqs.facetManager.getFacetTemplateByFacetId(facetCode);
        if(!template) {
            return null;
        }

        facet = this.sqs.facetManager.makeNewFacet(template);
        if(!facet) {
            return null;
        }

        this.sqs.facetManager.addFacet(facet);
        return facet;
    }

    waitForFacetDataRendered(facet, timeoutMs = 12000) {
        if(!facet || facet.isDataLoaded) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const eventOwner = {
                id: "quickstart-search-deploy-"+Date.now()+"-"+Math.random()
            };

            const timeout = setTimeout(() => {
                this.sqs.sqsEventUnlisten("facetDataRendered", eventOwner);
                reject(new Error("Timed out while loading facet data"));
            }, timeoutMs);

            this.sqs.sqsEventListen("facetDataRendered", (evt, data) => {
                if(!data || !data.facet || data.facet.id !== facet.id) {
                    return;
                }
                clearTimeout(timeout);
                this.sqs.sqsEventUnlisten("facetDataRendered", eventOwner);
                resolve();
            }, eventOwner);
        });
    }

    selectDiscreteFacetCategory(facet, categoryId) {
        if(!facet || facet.type !== "discrete") {
            return false;
        }

        const parsedCategoryId = this.parseIntegerId(categoryId);
        if(parsedCategoryId === null) {
            return false;
        }

        const categoryExists = Array.isArray(facet.data) && facet.data.some((item) => {
            return this.parseIntegerId(item.id) === parsedCategoryId;
        });
        if(!categoryExists) {
            return false;
        }

        const currentSelections = Array.isArray(facet.getSelections()) ? facet.getSelections() : [];
        const alreadySelected = currentSelections.some((selectionId) => {
            return this.parseIntegerId(selectionId) === parsedCategoryId;
        });
        if(alreadySelected) {
            return true;
        }

        facet.addSelection(parsedCategoryId);
        if(typeof facet.updateRenderData === "function") {
            facet.updateRenderData();
        }
        facet.broadcastSelection();
        return true;
    }

    centerDiscreteFacetCategory(facet, categoryId) {
        if(!facet || facet.type !== "discrete" || typeof facet.getDomRef !== "function") {
            return;
        }

        const parsedCategoryId = this.parseIntegerId(categoryId);
        if(parsedCategoryId === null) {
            return;
        }

        const $facetDom = facet.getDomRef();
        const $listContainer = $(".list-container", $facetDom);
        if($listContainer.length === 0) {
            return;
        }

        const viewportHeight = $listContainer.innerHeight();
        if(!viewportHeight || viewportHeight <= 0) {
            return;
        }

        const hasTextFilter = (typeof facet.textFilterString === "string" && facet.textFilterString.length > 0)
            || ($(".facet-text-search-input", $facetDom).val() || "").length > 0;

        let renderData = Array.isArray(facet.data) ? facet.data : [];
        if(hasTextFilter && Array.isArray(facet.visibleData) && facet.visibleData.length > 0) {
            renderData = facet.visibleData;
        }

        let rowIndex = renderData.findIndex((item) => {
            return this.parseIntegerId(item.id) === parsedCategoryId;
        });

        if(rowIndex === -1 && renderData !== facet.data && Array.isArray(facet.data)) {
            rowIndex = facet.data.findIndex((item) => {
                return this.parseIntegerId(item.id) === parsedCategoryId;
            });
            renderData = facet.data;
        }

        if(rowIndex === -1) {
            return;
        }

        const rowHeight = Number.isFinite(Number(facet.rowHeight)) && Number(facet.rowHeight) > 0
            ? Number(facet.rowHeight)
            : 24;

        const totalRows = renderData.length;
        const maxScrollTop = Math.max((totalRows * rowHeight) - viewportHeight, 0);
        let targetScrollTop = (rowIndex * rowHeight) - ((viewportHeight - rowHeight) / 2);
        targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));

        $listContainer.scrollTop(targetScrollTop);
        if(typeof facet.updateRenderData === "function") {
            facet.updateRenderData();
        }
    }

    async deployAndSelectFilter(resultItem) {
        if(!resultItem) {
            return;
        }

        if(resultItem.categoryId === null) {
            this.sqs.notificationManager.notify("This search result does not include a selectable filter ID.", "warning");
            return;
        }

        const facetCode = resultItem.facetCode || this.resolveFacetCodeForTab(resultItem.tabKey);
        if(!facetCode) {
            this.sqs.notificationManager.notify("No matching filter is available in the current domain.", "warning");
            return;
        }

        const facet = this.ensureFacetDeployed(facetCode);
        if(!facet) {
            this.sqs.notificationManager.notify("Could not deploy the requested filter.", "warning");
            return;
        }

        try {
            await this.waitForFacetDataRendered(facet);
        }
        catch(err) {
            this.sqs.notificationManager.notify("Filter data is not available right now. Please try again.", "warning");
            return;
        }

        const selected = this.selectDiscreteFacetCategory(facet, resultItem.categoryId);
        if(!selected) {
            this.sqs.notificationManager.notify("Could not select this item in the deployed filter.", "warning");
            return;
        }

        this.centerDiscreteFacetCategory(facet, resultItem.categoryId);

        this.hideDropdown();
    }

    renderLoadingState() {
        this.tabStates = this.createEmptyTabStates();
        this.updateAllTabTitles();
        this.tabOrder.forEach((tabKey) => {
            const tabState = this.getTabState(tabKey);
            tabState.isLoadingInitial = true;
            this.renderTab(tabKey);
        });
    }

    renderInfoState(message) {
        this.$panels.each((index, panelNode) => {
            const $panelBody = $(".search-dropdown-panel-body", panelNode);
            $panelBody.empty();
            $panelBody.append($("<div class='search-dropdown-state'></div>").text(message));
        });
    }

    renderTab(tabKey) {
        const tabState = this.getTabState(tabKey);
        const $panelBody = this.getPanelBodyForTab(tabKey);
        if($panelBody.length === 0) {
            return;
        }
        const shouldPreserveScroll = Array.isArray(tabState.items) && tabState.items.length > 0;
        const previousScrollTop = shouldPreserveScroll ? $panelBody.scrollTop() : 0;

        $panelBody.empty();

        if(tabState.errorMessage && (!Array.isArray(tabState.items) || tabState.items.length === 0)) {
            $panelBody.append($("<div class='search-dropdown-state'></div>").text(tabState.errorMessage));
            return;
        }

        if(tabState.isLoadingInitial && (!Array.isArray(tabState.items) || tabState.items.length === 0)) {
            $panelBody.append($("<div class='search-dropdown-state'></div>").text("Searching..."));
            return;
        }

        if(!Array.isArray(tabState.items) || tabState.items.length === 0) {
            if(tabState.isLoaded && this.currentSearchQuery.length >= 2) {
                $panelBody.append($("<div class='search-dropdown-state'></div>").text("No results in this tab."));
            }
            return;
        }

        this.renderTabResults(tabKey, tabState.items);

        if(tabState.isLoadingMore) {
            $panelBody.append($("<div class='search-dropdown-state search-dropdown-state-loading-more'></div>").text("Loading more..."));
        }

        if(tabState.errorMessage && tabState.items.length > 0) {
            $panelBody.append($("<div class='search-dropdown-state'></div>").text(tabState.errorMessage));
        }

        if(shouldPreserveScroll) {
            $panelBody.scrollTop(previousScrollTop);
        }
    }

    ensureActiveTabHasResults() {
        const activeTabState = this.getTabState(this.activeTab);
        if(activeTabState.isLoadingInitial) {
            return;
        }
        if(Array.isArray(activeTabState.items) && activeTabState.items.length > 0) {
            return;
        }
        const firstTabWithResult = this.tabOrder.find((tabKey) => {
            const tabState = this.getTabState(tabKey);
            return Array.isArray(tabState.items) && tabState.items.length > 0;
        });
        if(firstTabWithResult) {
            this.setActiveTab(firstTabWithResult);
        }
    }

    hasMoreResultsInTab(tabKey) {
        const tabState = this.getTabState(tabKey);
        if(!tabState || !tabState.isLoaded) {
            return false;
        }
        if(typeof tabState.hasMore === "boolean") {
            return tabState.hasMore;
        }
        const loadedCount = Array.isArray(tabState.items) ? tabState.items.length : 0;
        const totalCount = this.getTabTotalFromState(tabState);
        return loadedCount < totalCount;
    }

    handleTabScroll(tabKey) {
        this.maybeLoadMoreForTab(tabKey);
    }

    scheduleLoadMoreCheck(tabKey = this.activeTab) {
        if(typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => {
                this.maybeLoadMoreForTab(tabKey);
            });
            return;
        }
        setTimeout(() => {
            this.maybeLoadMoreForTab(tabKey);
        }, 0);
    }

    maybeLoadMoreForTab(tabKey) {
        if(!tabKey || tabKey !== this.activeTab || !this.$dropdown.is(":visible")) {
            return;
        }
        const tabState = this.getTabState(tabKey);
        if(!this.currentSearchQuery || tabState.isLoadingInitial || tabState.isLoadingMore || !this.hasMoreResultsInTab(tabKey)) {
            return;
        }
        const $panelBody = this.getPanelBodyForTab(tabKey);
        const panelBodyNode = $panelBody.get(0);
        if(!panelBodyNode) {
            return;
        }
        const distanceFromBottom = panelBodyNode.scrollHeight - (panelBodyNode.scrollTop + panelBodyNode.clientHeight);
        if(distanceFromBottom <= this.scrollLoadThreshold) {
            this.loadMoreForTab(tabKey);
        }
    }

    loadMoreForTab(tabKey) {
        const tabState = this.getTabState(tabKey);
        if(!tabKey || tabState.isLoadingInitial || tabState.isLoadingMore || !this.currentSearchQuery || !this.hasMoreResultsInTab(tabKey)) {
            return;
        }

        const requestId = this.latestRequestId;
        const nextPage = this.normalizePage(tabState.page + 1);
        this.requestTabPage(tabKey, this.currentSearchQuery, nextPage, requestId, false);
    }

    renderTabResults(tabKey, results) {
        const $panelBody = this.getPanelBodyForTab(tabKey);
        const $list = $("<div class='search-dropdown-list'></div>");
        results.forEach((resultItem) => {
            const $item = $("<div class='search-dropdown-item'></div>");
            $item.append($("<div class='search-dropdown-item-title'></div>").text(resultItem.title));
            if(resultItem.meta && resultItem.meta.length > 0) {
                $item.append($("<div class='search-dropdown-item-meta'></div>").text(resultItem.meta));
            }

            const $actions = $("<div class='search-dropdown-item-actions'></div>");
            const canGoToSite = resultItem.siteId !== null && this.sqs.siteReportManager && typeof this.sqs.siteReportManager.renderSiteReport === "function";
            const $goToSiteBtn = $("<button type='button' class='search-dropdown-item-action-btn search-dropdown-item-action-btn-site'></button>").html("<i class='fa fa-search' aria-hidden='true'></i>&nbsp;View site");
            if(canGoToSite) {
                $goToSiteBtn.on("click", (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    this.sqs.siteReportManager.renderSiteReport(resultItem.siteId);
                    this.hideDropdown();
                });
            }
            else {
                $goToSiteBtn.prop("disabled", true);
            }
            $actions.append($goToSiteBtn);

            const $deployFilterBtn = $("<button type='button' class='search-dropdown-item-action-btn search-dropdown-item-action-btn-secondary'></button>").text("Apply filter");
            const canDeployFilter = resultItem.categoryId !== null && !!resultItem.facetCode;
            if(canDeployFilter) {
                $deployFilterBtn.on("click", async (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    await this.deployAndSelectFilter(resultItem);
                });
            }
            else {
                $deployFilterBtn.prop("disabled", true);
            }
            $actions.append($deployFilterBtn);

            $item.append($actions);
            $list.append($item);
        });
        $panelBody.append($list);
    }

    resetTabTitles() {
        this.$tabs.each((index, tabNode) => {
            const $tabNode = $(tabNode);
            const tabKey = $tabNode.data("tab");
            $tabNode.text(this.tabTitles[tabKey]);
        });
    }

    setActiveTab(tabKey) {
        this.activeTab = tabKey;
        this.$tabs.removeClass("active");
        this.$tabs.filter("[data-tab='"+tabKey+"']").addClass("active");

        this.$panels.removeClass("active");
        this.$panels.filter("[data-tab='"+tabKey+"']").addClass("active");
        this.scheduleLoadMoreCheck(tabKey);
    }

    showDropdown() {
        this.$dropdown.show();
    }

    hideDropdown() {
        this.$dropdown.hide();
    }
}

export { QuickstartSearch as default };
