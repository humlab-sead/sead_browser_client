/*
* Class: ScreenReader
* Lets the SEAD agent see and work the interface the way a person does: an outline of what
* is on screen and can be interacted with, and clicking or filling in any of it.
*
* The outline is text read from the page, not a picture of it - each interactive element
* gets a reference ("e14"), a role, a label and its state, grouped by where it is (a
* dialog, a site report section, a filter, a menu). The agent names a reference and one of
* a few fixed actions; the element, and whether it may be touched at all, is decided here.
* Nothing the agent writes is ever run as code.
*
* This sits beside StateManager.getInterfaceState, which is the short, meaningful summary
* ("pollen domain, 812 sites"). This is the long tail: anything a dedicated agent command
* does not cover can still be reached through it.
*
* Most of this client's clickable things are divs and table rows with jQuery handlers, not
* buttons, so an accessibility scan alone would miss them. jQuery keeps a record of the
* handlers it binds - on the element itself, or delegated from a container through a
* selector - and that record is what finds them.
*/
export default class ScreenReader {
    //What the agent never touches or sees: the chatbox it is talking through, the user's
    //account (signing in and out, the sysadmin-only data import), and downloads, which stay
    //the user's own click. A region of the page can opt out with data-sead-agent="off".
    static OFF_LIMITS = [
        "[data-sead-agent='off']",
        "#chatbox-icon",
        "[menu-item='sign-in']", "[menu-item='account']", "[menu-item='account-details']",
        "[menu-item='import-data']", "[menu-item='import']", "[menu-item='sign-out']",
        ".login-container", ".data-import",
        ".site-report-export-download-btn", ".sites-export-btn", "a[download]"
    ].join(", ");

    //Elements with click handlers that are plumbing, not controls: the dialog's backdrop
    //closes it, and its frame stops clicks inside from reaching the backdrop
    static NOT_TARGETS = "#popover-dialog, #popover-dialog-frame, #popover-dialog-frame > .popover-content";

    //Events whose handlers make an element something a person interacts with
    static INTERACTION_EVENTS = ["click", "mousedown", "mouseup", "dblclick", "change"];
    static NATIVE_CONTROLS = "button, select, textarea, input:not([type='hidden']), a[href], [contenteditable='true'], "
        + "[role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='tab'], [role='menuitem'], "
        + "[role='switch'], [role='option'], [role='slider'], [role='combobox'], [role='treeitem']";

    //The client's own ways of saying a thing is open, closed or chosen. Read in addition to
    //the standard attributes, since most widgets here predate them.
    static STATE_RULES = [
        //A section's content says whether it is open; the container's class is never set on
        //the top-level sections, whose titles are static
        { test: el => el.matches(".site-report-level-title"),
          state: el => {
              let content = $(el).closest(".site-report-level-container").children(".site-report-level-content");
              return content.attr("collapsed") == "true" || !content.is(":visible") ? "collapsed" : "expanded";
          } },
        { test: el => el.matches("tr.site-report-table-row-with-subtable"),
          state: el => el.classList.contains("table-row-expanded") ? "expanded" : "collapsed" },
        { test: el => el.matches(".first-level-item"),
          state: el => el.classList.contains("first-level-item-expanded") ? "expanded" : null },
        { test: el => el.classList.contains("sqs-menu-selected") || el.classList.contains("selected") || el.classList.contains("active"),
          state: () => "selected" }
    ];

    //A clickable element holding more controls than this, or covering more of the window
    //than this share, is a panel or a backdrop rather than something a person aims at
    static CONTAINER_MAX_CONTROLS = 6;
    static CONTAINER_MAX_AREA = 0.4;
    //A clickable thing this small (a row, a chip) absorbs the icons inside it
    static SMALL_TARGET_AREA = 0.08;
    //What the client's icon-only buttons do, by their Font Awesome name
    static ICON_MEANINGS = {
        "times": "close", "window-minimize": "minimize", "window-maximize": "maximize", "search": "search",
        "bars": "menu", "chevron-right": "expand", "chevron-down": "collapse", "arrow-circle-o-left": "back",
        "trash": "delete", "download": "download", "info-circle": "information", "question-circle": "help"
    };
    static MAX_ITEMS_PER_REGION = 40;
    static MAX_ITEMS = 160;
    static MAX_LABEL_LENGTH = 80;
    static MAX_TEXT_LENGTH = 3000;
    //How long the page may keep changing after an action before we read it anyway
    static SETTLE_QUIET_MS = 300;
    static SETTLE_MAX_MS = 4000;

    constructor(sqs) {
        this.sqs = sqs;
        //ref -> WeakRef(element). An element keeps its ref for as long as it is on the page,
        //so a ref from an earlier read still means the same thing in a later one.
        this.refs = new Map();
        this.refSequence = 0;
    }

    /*
    * Function: read
    * The outline of what is on screen. 'region' narrows it to one part of the interface,
    * 'section' to one site report section, and 'text' adds that part's visible text, for
    * when the agent needs to read content rather than act on it.
    */
    read(args = {}) {
        let region = typeof args.region == "string" ? args.region : "all";
        let sectionName = typeof args.section == "string" && args.section.trim() ? args.section.trim() : null;
        let root = document.body;
        if(sectionName) {
            root = document.getElementById("site-report-section-"+sectionName);
            if(!root || !this.isVisible(root)) {
                throw new Error("There is no open site report section '"+sectionName+"'.");
            }
        }

        let elements = this.findInteractive(root);
        let groups = new Map();
        let total = 0;
        let omitted = 0;

        elements.forEach(el => {
            let where = this.regionOf(el);
            if(region != "all" && where.kind != region) {
                return;
            }
            if(!groups.has(where.label)) {
                groups.set(where.label, { lines: [], omitted: 0 });
            }
            let group = groups.get(where.label);
            if(group.lines.length >= ScreenReader.MAX_ITEMS_PER_REGION || total >= ScreenReader.MAX_ITEMS) {
                group.omitted++;
                omitted++;
                return;
            }
            group.lines.push("  "+this.describe(el));
            (group.elements = group.elements || []).push(el);
            total++;
        });

        let lines = [];
        groups.forEach(group => this.disambiguate(group));
        groups.forEach((group, label) => {
            lines.push(label);
            lines.push(...group.lines);
            if(group.omitted > 0) {
                lines.push("  ... "+group.omitted+" more not listed - read this region on its own, or a section of it");
            }
        });
        if(lines.length == 0) {
            lines.push(region == "all" ? "Nothing on screen can be interacted with." : "Nothing in '"+region+"' can be interacted with right now.");
        }

        let result = { view: this.describeView(), outline: lines.join("\n") };
        if(omitted > 0) {
            result.omitted = omitted;
        }
        if(args.text === true) {
            result.text = this.visibleText(sectionName ? root : this.regionRoot(region));
        }
        return result;
    }

    /*
    * Function: describeView
    * Which of the client's two views is showing. Only one is on screen at a time, so what
    * is not in the outline may simply be in the other one.
    */
    describeView() {
        if(this.sqs.activeView == "siteReport") {
            let report = this.sqs.siteReportManager ? this.sqs.siteReportManager.siteReport : null;
            let name = report && report.siteData ? report.siteData.site_name : null;
            return "Site report"+(name ? " for "+name : "")+". It covers the main page: the filters, the results and the "
                +"main menu are behind it and can't be clicked until it is closed (its back button, or close_site_report).";
        }
        return "Main page: the filter panel, with the main menu button and the quick search at its top, and the results.";
    }

    /*
    * Function: click
    * Clicks an element from the outline as a person would, then reads back the part of the
    * screen it was in - and any dialog it opened - so the effect is seen, not assumed.
    */
    async click(args = {}) {
        let el = this.resolve(args.ref);
        if(this.isDisabled(el)) {
            throw new Error(args.ref+" is disabled.");
        }
        if(el.matches("a[href]")) {
            let url = new URL(el.getAttribute("href"), window.location.href);
            if(url.origin != window.location.origin) {
                throw new Error(args.ref+" leads away from SEAD ("+url.href+"). Give the user the link instead of following it.");
            }
        }

        let label = this.labelOf(el);
        let where = this.regionOf(el);
        let before = this.regionBlocks();

        this.reveal(el);
        await this.settle(() => {
            ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach(type => {
                el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
            });
            el.click();
        });

        return this.afterAction("click", args.ref, label, where, before);
    }

    /*
    * Function: setValue
    * Fills in a text field, ticks a checkbox, or picks an option in a select - and fires the
    * events the client listens for, since parts of it react to input, change or keyup.
    */
    async setValue(args = {}) {
        let el = this.resolve(args.ref);
        if(this.isDisabled(el)) {
            throw new Error(args.ref+" is disabled.");
        }
        let value = args.value;
        let label = this.labelOf(el);
        let where = this.regionOf(el);
        let before = this.regionBlocks();
        let type = (el.getAttribute("type") || "").toLowerCase();

        this.reveal(el);
        await this.settle(() => {
            if(el.matches("input") && (type == "checkbox" || type == "radio")) {
                let wanted = value === true || value === "true" || value === 1 || value === "1";
                if(el.checked != wanted) {
                    el.click();
                }
                return;
            }
            if(el.matches("select")) {
                let wanted = String(value).trim().toLowerCase();
                let option = Array.from(el.options).find(opt => opt.value.toLowerCase() == wanted)
                    || Array.from(el.options).find(opt => opt.text.trim().toLowerCase() == wanted);
                if(!option) {
                    throw new Error(args.ref+" has no option '"+value+"'. Its options: "
                        +Array.from(el.options).map(opt => opt.text.trim()).slice(0, 30).join(", "));
                }
                el.value = option.value;
                el.dispatchEvent(new Event("change", { bubbles: true }));
                return;
            }
            if(el.matches("input, textarea") || el.isContentEditable) {
                el.focus();
                if(el.isContentEditable) {
                    el.textContent = String(value);
                }
                else {
                    el.value = String(value);
                }
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" }));
                return;
            }
            throw new Error(args.ref+" is not something that takes a value. Use click instead.");
        });

        return this.afterAction("set_value", args.ref, label, where, before);
    }

    /*
    * Function: afterAction
    * What the agent sees after a click or an edit: the region the element was in, plus
    * every region that appeared (a menu, a dialog, a tour) or went away because of it.
    */
    afterAction(action, ref, label, where, before) {
        let result = { applied: action, ref: ref, label: label };
        let after = this.regionBlocks();
        let view = this.describeView();
        if(view != before.view) {
            result.view = view;
        }

        result.region = after.has(where.label) ? after.get(where.label) : "The part of the screen it was in ("+where.label+") is gone.";
        let appeared = Array.from(after.keys()).filter(heading => !before.has(heading) && heading != where.label);
        if(appeared.length > 0) {
            result.appeared = appeared.map(heading => after.get(heading)).join("\n");
        }
        let gone = Array.from(before.keys()).filter(heading => !after.has(heading));
        if(gone.length > 0) {
            result.gone = gone;
        }
        return result;
    }

    /*
    * Function: regionBlocks
    * The whole outline as a map from region heading to that region's block.
    */
    regionBlocks() {
        let blocks = new Map();
        let heading = null;
        let screen = this.read({});
        blocks.view = screen.view;
        screen.outline.split("\n").forEach(line => {
            if(line.indexOf("  ") != 0) {
                heading = line;
                blocks.set(heading, line);
            }
            else if(heading) {
                blocks.set(heading, blocks.get(heading)+"\n"+line);
            }
        });
        return blocks;
    }

    /*
    * Function: findInteractive
    * Every visible element under root that a person could interact with, in page order.
    */
    findInteractive(root) {
        let candidates = new Set();
        //Found only by its pointer cursor - the weakest evidence, so it gives way to anything
        //clickable around it (the chevron cell of a row that is itself clickable)
        let cursorOnly = new Set();
        let delegated = this.delegatedTargets();

        root.querySelectorAll(ScreenReader.NATIVE_CONTROLS).forEach(el => candidates.add(el));
        root.querySelectorAll("*").forEach(el => {
            if(candidates.has(el)) {
                return;
            }
            if(delegated.has(el) || this.hasOwnHandler(el)) {
                candidates.add(el);
            }
            else if(this.looksClickable(el)) {
                candidates.add(el);
                cursorOnly.add(el);
            }
        });

        let interactive = Array.from(candidates).filter(el => this.isVisible(el) && !this.isOffLimits(el) && !el.matches(ScreenReader.NOT_TARGETS));
        let viewportArea = window.innerWidth * window.innerHeight;

        //A container with a handler of its own - a dialog backdrop that closes on click, a
        //panel that tracks clicks - is not what a person aims at; the controls inside are.
        //A table row holding a few links is still a row.
        interactive = interactive.filter(el => {
            let inside = interactive.filter(other => other !== el && el.contains(other));
            let rect = el.getBoundingClientRect();
            let isContainer = inside.length > ScreenReader.CONTAINER_MAX_CONTROLS
                || (inside.length > 0 && rect.width * rect.height > viewportArea * ScreenReader.CONTAINER_MAX_AREA);
            if(isContainer && this.ownLabelOf(el) == "") {
                return false;
            }
            //A panel around off-limits controls (the download buttons of an export dialog)
            //would only be a way of naming them
            return inside.length > 0 || this.ownLabelOf(el) != "" || el.querySelector(ScreenReader.OFF_LIMITS) == null;
        });

        //Then the duplicates, judged against what is left
        interactive = interactive.filter(el => {
            //A cursor, or a bare icon, inside a small clickable thing is part of that thing -
            //the chevron cell of a row that opens when clicked anywhere. Inside a panel it is a
            //control of its own (a dialog's close button).
            let outer = interactive.some(other => {
                if(other === el || !other.contains(el)) {
                    return false;
                }
                let rect = other.getBoundingClientRect();
                return rect.width * rect.height < viewportArea * ScreenReader.SMALL_TARGET_AREA;
            });
            if(outer && (cursorOnly.has(el) || this.isIconOnly(el))) {
                return false;
            }
            //A header holding just its own sort button, with the same name: the button says more
            let inside = interactive.filter(other => other !== el && el.contains(other));
            if(inside.length == 1 && this.labelOf(inside[0]).toLowerCase().indexOf(this.labelOf(el).toLowerCase()) == 0) {
                return false;
            }
            return true;
        });

        //Page order, so the outline reads top to bottom
        return interactive.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
    }

    hasOwnHandler(el) {
        if(typeof el.onclick == "function") {
            return true;
        }
        let events = $._data(el, "events");
        if(!events) {
            return false;
        }
        return ScreenReader.INTERACTION_EVENTS.some(type =>
            Array.isArray(events[type]) && events[type].some(handler => !handler.selector));
    }

    /*
    * Function: delegatedTargets
    * Elements that a container's delegated handler reacts to - $(container).on("click",
    * ".row", ...) - which carry no handler of their own.
    */
    delegatedTargets() {
        let targets = new Set();
        let holders = [document, document.body, ...document.body.querySelectorAll("*")];
        holders.forEach(holder => {
            let events = $._data(holder, "events");
            if(!events) {
                return;
            }
            ScreenReader.INTERACTION_EVENTS.forEach(type => {
                (events[type] || []).forEach(handler => {
                    if(!handler.selector) {
                        return;
                    }
                    try {
                        $(holder).find(handler.selector).each((index, el) => targets.add(el));
                    }
                    catch(error) {
                        //A selector jQuery itself can no longer parse matches nothing
                    }
                });
            });
        });
        return targets;
    }

    /*
    * Function: looksClickable
    * A pointer cursor that starts here rather than being inherited from a parent - how a
    * handler bound by a library outside jQuery (a slider, a table plugin) still shows.
    */
    looksClickable(el) {
        if(getComputedStyle(el).cursor != "pointer") {
            return false;
        }
        return !el.parentElement || getComputedStyle(el.parentElement).cursor != "pointer";
    }

    isVisible(el) {
        if(!el.isConnected) {
            return false;
        }
        if(typeof el.checkVisibility == "function") {
            if(!el.checkVisibility({ visibilityProperty: true })) {
                return false;
            }
        }
        else if(el.getClientRects().length == 0) {
            return false;
        }
        let rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !el.closest("[aria-hidden='true']");
    }

    isOffLimits(el) {
        return el.closest(ScreenReader.OFF_LIMITS) != null;
    }

    isDisabled(el) {
        return el.disabled === true || el.getAttribute("aria-disabled") == "true" || el.classList.contains("disabled");
    }

    /*
    * Function: regionOf
    * Where an element is, as the agent will see it: its kind (for narrowing a read) and a
    * heading line naming the particular dialog, section, filter or menu.
    */
    regionOf(el) {
        let dialog = el.closest("#popover-dialog");
        if(dialog) {
            let title = $("#popover-dialog-frame > h1", dialog).text().trim();
            return { kind: "dialog", label: "Dialog"+(title ? ": "+title : "") };
        }
        let section = el.closest("[site-report-section-name]");
        if(section) {
            let name = section.getAttribute("site-report-section-name");
            let title = $(section).children(".site-report-level-title").find(".title-text").first().text().trim();
            return { kind: "site_report", label: "Site report section: "+(title || name)+" ["+name+"]" };
        }
        if(el.closest("#site-report-main-container")) {
            return { kind: "site_report", label: "Site report" };
        }
        let menu = el.closest(".sqs-menu-container");
        if(menu) {
            return { kind: "menus", label: "Menu"+(menu.id ? " ("+menu.id+")" : "") };
        }
        let facet = el.closest(".facet");
        if(facet) {
            let title = $(".facet-title", facet).first().text().trim();
            return { kind: "filters", label: "Filter: "+(title || "untitled") };
        }
        if(el.closest("#facet-section, #facet-main-container")) {
            return { kind: "filters", label: "Filter panel" };
        }
        if(el.closest("#result-section")) {
            return { kind: "results", label: "Results" };
        }
        return { kind: "page", label: "Page" };
    }

    regionRoot(region) {
        let selectors = {
            dialog: "#popover-dialog-frame",
            site_report: "#site-report-content",
            filters: "#facet-section",
            results: "#result-section"
        };
        return document.querySelector(selectors[region] || "body") || document.body;
    }

    /*
    * Function: disambiguate
    * Five buttons all called "Export" say nothing about which is which. Where labels repeat
    * within a region, each gets the title of the nearest card or panel around it.
    */
    disambiguate(group) {
        let labels = (group.elements || []).map(el => this.labelOf(el));
        labels.forEach((label, index) => {
            if(labels.indexOf(label) == labels.lastIndexOf(label)) {
                return;
            }
            let context = this.nearestTitle(group.elements[index]);
            if(context && context != label) {
                let quoted = JSON.stringify(label);
                group.lines[index] = group.lines[index].replace(quoted, JSON.stringify(label+" ("+context+")"));
            }
        });
    }

    nearestTitle(el) {
        //In a table, what tells one row's "View site" from the next is the row itself. The
        //nearest heading would be the column headers, which are the same for every row.
        let row = el.closest("tr, [role='row']");
        if(row && row !== el) {
            let cells = Array.from(row.children)
                .filter(cell => !cell.contains(el))
                .map(cell => (cell.innerText || "").replace(/\s+/g, " ").trim())
                .filter(text => text);
            if(cells.length > 0) {
                return this.truncate(cells.join(" "), 40);
            }
        }
        let node = el.parentElement;
        for(let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
            let title = Array.from(node.querySelectorAll("h1, h2, h3, h4, h5, [class*='title'], [class*='header']"))
                .find(candidate => !candidate.contains(el) && !el.contains(candidate) && this.isVisible(candidate)
                    && (candidate.innerText || "").trim() != "");
            if(title) {
                return this.truncate(title.innerText.replace(/\s+/g, " ").trim(), 40);
            }
        }
        return "";
    }

    /*
    * Function: describe
    * One line of the outline: "e14 row "12724 BjorkerodsMosse_bugsdata.xls" collapsed".
    */
    describe(el) {
        let parts = [this.refOf(el), this.roleOf(el), JSON.stringify(this.labelOf(el))];
        parts.push(...this.statesOf(el));
        let rect = el.getBoundingClientRect();
        if(rect.bottom < 0 || rect.top > window.innerHeight) {
            parts.push("(off-screen)");
        }
        return parts.join(" ");
    }

    refOf(el) {
        let ref = el.getAttribute("data-sead-ref");
        if(ref && this.refs.has(ref) && this.refs.get(ref).deref() === el) {
            return ref;
        }
        ref = "e"+(++this.refSequence);
        el.setAttribute("data-sead-ref", ref);
        this.refs.set(ref, new WeakRef(el));
        return ref;
    }

    /*
    * Function: resolve
    * The element behind a ref, if it is still there and still something the agent may touch.
    */
    resolve(ref) {
        if(typeof ref != "string" || !this.refs.has(ref.trim())) {
            throw new Error("Unknown ref '"+ref+"'. Refs come from read_screen - read the screen again.");
        }
        let el = this.refs.get(ref.trim()).deref();
        if(!el || !el.isConnected) {
            this.refs.delete(ref.trim());
            throw new Error(ref+" is no longer on the page. Read the screen again.");
        }
        if(this.isOffLimits(el)) {
            throw new Error(ref+" is not something the assistant may use.");
        }
        if(!this.isVisible(el)) {
            throw new Error(ref+" is not visible right now. Read the screen again.");
        }
        return el;
    }

    roleOf(el) {
        let role = el.getAttribute("role");
        if(role) {
            return role;
        }
        let tag = el.tagName.toLowerCase();
        if(tag == "input") {
            let type = (el.getAttribute("type") || "text").toLowerCase();
            return { checkbox: "checkbox", radio: "radio", range: "slider", number: "number", button: "button", submit: "button" }[type] || "textbox";
        }
        return { button: "button", a: "link", select: "select", textarea: "textbox", tr: "row", h1: "heading", h2: "heading", h3: "heading", h4: "heading" }[tag]
            || (el.isContentEditable ? "textbox" : "clickable");
    }

    labelOf(el) {
        let label = el.getAttribute("aria-label")
            || this.labelledBy(el)
            || this.formLabel(el)
            || (el.matches("img") ? el.getAttribute("alt") : "")
            || this.textOf(el)
            || el.getAttribute("title")
            || el.getAttribute("placeholder")
            || (el.id ? this.classHint(el) : "")
            || this.iconHint(el)
            || this.classHint(el)
            || "";
        let title = el.getAttribute("title");
        if(title && label && title != label && title.length < 120 && label.indexOf(title) == -1) {
            label += " - "+title;
        }
        return this.truncate(label, ScreenReader.MAX_LABEL_LENGTH);
    }

    /*
    * Function: ownLabelOf
    * What a container says of itself, leaving out the text of the controls inside it.
    */
    ownLabelOf(el) {
        let own = Array.from(el.childNodes).filter(node => node.nodeType == Node.TEXT_NODE)
            .map(node => node.textContent.trim()).join(" ").trim();
        return own || el.getAttribute("aria-label") || el.getAttribute("title") || "";
    }

    labelledBy(el) {
        let ids = el.getAttribute("aria-labelledby");
        if(!ids) {
            return "";
        }
        return ids.split(/\s+/).map(id => document.getElementById(id)).filter(node => node).map(node => node.textContent.trim()).join(" ");
    }

    formLabel(el) {
        if(!el.matches("input, select, textarea")) {
            return "";
        }
        if(el.id) {
            let label = document.querySelector("label[for='"+CSS.escape(el.id)+"']");
            if(label) {
                return label.textContent.trim();
            }
        }
        let wrapping = el.closest("label");
        return wrapping ? wrapping.textContent.trim() : "";
    }

    textOf(el) {
        if(el.matches("input, select, textarea")) {
            return "";
        }
        //Cells of a table row are separated, so "12724" and "Bjorkerod..." don't run together
        if(el.matches("tr")) {
            return Array.from(el.children).map(cell => cell.innerText.trim()).filter(text => text).join(" | ");
        }
        return (el.innerText || "").replace(/\s+/g, " ").trim();
    }

    iconHint(el) {
        let icon = el.matches("[class*='fa-']") ? el : el.querySelector("[class*='fa-']");
        if(!icon) {
            return "";
        }
        let name = Array.from(icon.classList).find(cls => cls.indexOf("fa-") == 0 && cls != "fa-fw");
        if(!name) {
            return "";
        }
        name = name.substring(3);
        let meaning = ScreenReader.ICON_MEANINGS[name];
        return "[icon: "+name+(meaning ? " - "+meaning : "")+"]";
    }

    isIconOnly(el) {
        return this.textOf(el) == "" && !el.getAttribute("aria-label") && !el.getAttribute("title") && this.iconHint(el) != "";
    }

    //Last resort for an element with no text, title or icon: its own name in the markup
    classHint(el) {
        let name = el.id || Array.from(el.classList).find(cls => cls.indexOf("sqs-") != 0) || "";
        return name ? "["+name.replace(/[-_]+/g, " ").trim()+"]" : "";
    }

    statesOf(el) {
        let states = [];
        if(this.isDisabled(el)) {
            states.push("disabled");
        }
        if(el.matches("input[type='checkbox'], input[type='radio']")) {
            states.push(el.checked ? "checked" : "unchecked");
        }
        else if(el.matches("select")) {
            let option = el.options[el.selectedIndex];
            states.push("value="+JSON.stringify(option ? option.text.trim() : ""));
        }
        else if(el.matches("input, textarea") && el.value) {
            states.push("value="+JSON.stringify(this.truncate(el.value, 60)));
        }
        let expanded = el.getAttribute("aria-expanded");
        if(expanded == "true" || expanded == "false") {
            states.push(expanded == "true" ? "expanded" : "collapsed");
        }
        if(el.getAttribute("aria-selected") == "true" || el.getAttribute("aria-pressed") == "true") {
            states.push("selected");
        }
        ScreenReader.STATE_RULES.forEach(rule => {
            if(rule.test(el)) {
                let state = rule.state(el);
                if(state && states.indexOf(state) == -1) {
                    states.push(state);
                }
            }
        });
        return states;
    }

    visibleText(root) {
        if(!root || this.isOffLimits(root)) {
            return "";
        }
        return this.truncate((root.innerText || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(), ScreenReader.MAX_TEXT_LENGTH);
    }

    reveal(el) {
        try {
            el.scrollIntoView({ behavior: "instant", block: "center" });
        }
        catch(error) {
            //Cosmetic only
        }
    }

    /*
    * Function: settle
    * Runs an action, then waits until the page stops changing - a re-render, a dialog
    * opening, rows loading - or for at most SETTLE_MAX_MS.
    */
    settle(action) {
        return new Promise((resolve, reject) => {
            let quietTimer = null;
            let observer = new MutationObserver(() => {
                clearTimeout(quietTimer);
                quietTimer = setTimeout(done, ScreenReader.SETTLE_QUIET_MS);
            });
            let maxTimer = null;
            let done = () => {
                observer.disconnect();
                clearTimeout(quietTimer);
                clearTimeout(maxTimer);
                resolve();
            };
            observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
            maxTimer = setTimeout(done, ScreenReader.SETTLE_MAX_MS);
            quietTimer = setTimeout(done, ScreenReader.SETTLE_QUIET_MS);
            try {
                action();
            }
            catch(error) {
                observer.disconnect();
                clearTimeout(quietTimer);
                clearTimeout(maxTimer);
                reject(error);
            }
        });
    }

    truncate(text, length) {
        text = String(text || "");
        return text.length > length ? text.substring(0, length - 1)+"…" : text;
    }
}
