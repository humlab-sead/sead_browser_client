import { micromark } from "micromark";
import SeadAgentActions from "./SeadAgentActions.class.js";

/*
* Class: SeadAgent
* The chatbox in #chatbox-icon. Talks to the standalone sead_agent service, which runs a
* pi harness agent against a locally hosted LLM - the requests no longer pass through the
* json_api_server, and nothing about them leaves the deployment.
*/
export default class SeadAgent {
    /*
    * Shortcuts are markdown links the agent writes into its reply, which become buttons
    * the user can click to perform the action - "or I can switch to the [table](...) view".
    *
    * They ride on a URL fragment rather than a custom scheme on purpose: micromark strips
    * protocols it doesn't recognise (including javascript:), but leaves fragments alone,
    * so the sanitiser stays on. The command still has to be one of these, and its
    * arguments still go through SeadAgentActions - a link cannot do anything the agent
    * could not have done itself.
    */
    /*
    * Shown once when the chatbox is first opened. Kept to two lines: it should say what
    * the agent can do that isn't obvious - that it operates the filters, not just talks
    * about them - and give one example worth copying, without filling the panel.
    */
    static GREETING = "Hello. I can explain what is in SEAD, and I can work the filters for you \u2014 try *\"find sites with dendro data in Sm\u00e5land\"*, or just ask what something means.";

    static SHORTCUT_PREFIX = "#sead-action/";
    static SHORTCUT_COMMANDS = ["set_result_view", "set_domain", "add_filter", "set_filter_selections", "remove_filter", "clear_filters",
                                "open_site_report", "close_site_report", "set_site_report_section", "export_site_report",
                                "set_map_polygons"];

    constructor(sqs) {
        this.sqs = sqs;
        this.abortController = null;
        this.state = "disconnected";
        this.expanded = false;
        //Where the user last left the panel ({top, left, width, height} in px), so
        //reopening it returns it there instead of to the default corner block
        this.savedGeometry = null;
        this.debugMode = false;
        //Sent with every message so the agent keeps one conversation per browser session
        //rather than answering each message cold. Generated lazily on the first open.
        this.conversationId = null;
        //Whether the greeting has already been shown in this browser session
        this.greeted = false;
        //Runs the commands the agent asks for against this client
        this.actions = new SeadAgentActions(sqs);
        //The turn currently in flight, so closing the chatbox can abandon it server-side
        this.activeTurnId = null;

        this.updateChatboxVisibility();

        $("#chatbox-close-btn").on("click", (evt) => {
            evt.stopPropagation();
            this.chatboxIconClickCallback(evt);
        });

        $("#chatbox-input").on("keyup", (evt) => {
            if(evt.key === 'Enter') {
                this.sendMessage();
            }
        });

        $("#chatbox-send-btn").on("click", (evt) => {
            this.sendMessage();
        });

        $("#chatbox-icon").on("click", (event) => {
            if(this.expanded == false) {
                this.chatboxIconClickCallback(event);
            }
        });

        //Delegated, because the buttons are created as replies are rendered
        $("#chatbox-messages").on("click", ".sead-agent-shortcut", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            this.runShortcut($(evt.currentTarget));
        });
    }

    /*
    * Function: toggleDebug
    * Dev mode (shift+D) makes the chatbox available even when it isn't enabled in the config.
    */
    toggleDebug() {
        this.debugMode = !this.debugMode;
        console.log("SEAD agent debug mode: "+(this.debugMode ? "ON" : "OFF"));
        this.updateChatboxVisibility();
    }

    /*
    * Function: updateChatboxVisibility
    * The chatbox icon is shown if the agent is enabled in the config, or if dev mode is active.
    */
    updateChatboxVisibility() {
        if(this.sqs.config.seadAgentEnabled || this.debugMode) {
            $("#chatbox-icon").css("display", "flex");
        }
        else {
            if(this.expanded) {
                //collapse first so any in-flight request is aborted and inline drag/resize styles are cleared
                this.chatboxIconClickCallback(new $.Event("click"));
            }
            $("#chatbox-icon").css("display", "none");
        }
    }

    async sendMessage() {
        if(this.state != "ready") {
            return;
        }
        let input = $("#chatbox-input");
        let message = input.val();
        if(!message || message.trim().length == 0) {
            return;
        }
        input.val("");
        this.setState("loading");

        $("#chatbox-messages").append(`<div class="message"><p><span class="user-message">You:</span> ${this.escapeHtml(message)}</p></div>`);
        $("#chatbox-messages").append(`<div class="message"><p><span class="assistant-message">SEAD agent:</span><span id="chatbox-loading-indicator"></span></p></div>`);
        this.scrollToLatestMessage();

        try {
            let responseText = await this.triggerAgent(message);
            this.renderAgentMessage(responseText);
        }
        catch(error) {
            if(error.name == "AbortError") {
                //the user closed the chatbox while we were waiting - nothing to render
                return;
            }
            console.error("SEAD agent request failed", error);
            //The service phrases its own failures for the user (busy, too long, timed out).
            //Anything else is a transport failure, whose message means nothing to a user.
            this.renderAgentMessage(error.fromAgent ? error.message : "The SEAD agent could not be reached. ("+error.message+")", false);
        }

        this.setState("ready");
    }

    /*
    * Function: triggerAgent
    * Posts the message to the sead_agent service and sees the turn through to an answer.
    *
    * A turn is not one request. The agent can ask this client to do something - read the
    * open filters, add one, switch domain - and each of those suspends the turn until we
    * post the outcome back. So we loop: send, run what it asks for, send the result,
    * until the service says the turn is complete.
    */
    async triggerAgent(message) {
        let abortController = new AbortController();
        this.abortController = abortController;

        try {
            let payload = await this.postToAgent(this.getAgentEndpointUrl(), {
                input: message,
                conversationId: this.getConversationId(),
                //Where the user is as they send this. They may have opened a site report or
                //changed a filter themselves since the last message, and nothing else in
                //the conversation would tell the agent that.
                state: this.actions.getStateSummary()
            }, abortController);

            //Bounded here as well as in the service: a client that kept answering forever
            //would keep the model running forever
            for(let step = 0; step < 32; step++) {
                if(payload.status != "action_required") {
                    break;
                }

                this.activeTurnId = payload.turnId;
                let outcome = await this.runAgentAction(payload.action);

                payload = await this.postToAgent(this.getActionResultUrl(), Object.assign({
                    turnId: payload.turnId,
                    actionId: payload.action.id
                }, outcome), abortController);
            }

            if(payload.status == "action_required") {
                throw this.agentError("The SEAD agent asked for too many steps in one message.");
            }

            return this.extractResponseText(payload);
        }
        finally {
            this.activeTurnId = null;
            //keep the abort live while the body is read, but don't clobber a newer request
            if(this.abortController === abortController) {
                this.abortController = null;
            }
        }
    }

    /*
    * Function: runAgentAction
    * Executes one command from the agent. A command that fails is reported back as an
    * error rather than thrown, so the agent can say so or try something else - only a
    * broken conversation should end the turn.
    */
    async runAgentAction(action) {
        try {
            let result = await this.actions.execute(action.command, action.args);

            if(SeadAgentActions.isMutation(action.command)) {
                this.renderActionNotice(action, result);
            }
            return { result: result };
        }
        catch(error) {
            console.warn("SEAD agent command failed: "+action.command, error);
            return { error: error && error.message ? error.message : String(error) };
        }
    }

    /*
    * Function: renderActionNotice
    * Puts a line in the chatbox for each change the agent made, so a filter never appears
    * without the user being told where it came from.
    */
    renderActionNotice(action, result) {
        let description = this.describeAction(action, result);
        //Goes above the pending reply, so the record reads in the order things happened
        $("#chatbox-loading-indicator").parent().before(`<div class="message agent-action"><p>${this.escapeHtml(description)}</p></div>`);
        this.scrollToLatestMessage();
    }

    describeAction(action, result) {
        let filter = action.args && action.args.filter ? action.args.filter : "";
        switch(action.command) {
            case "add_filter":            return "Added filter: "+filter;
            case "set_filter_selections": return "Changed selection in: "+filter;
            case "remove_filter":         return "Removed filter: "+filter;
            case "clear_filters":         return "Cleared all filters";
            case "set_domain":            return "Switched domain to: "+(action.args ? action.args.domain : "");
            case "set_result_view":       return "Switched view to: "+(action.args ? action.args.view : "");
            case "open_site_report":      return "Opened site report: "+((result && result.siteName) ? result.siteName : (action.args ? action.args.siteId : ""));
            case "close_site_report":     return "Closed the site report";
            case "set_site_report_section":
                return ((action.args && action.args.expanded === false) ? "Collapsed section: " : "Expanded section: ")
                    + ((result && result.title) ? result.title : (action.args ? action.args.section : ""));
            case "export_site_report":    return "Opened the export dialog";
            case "set_map_polygons": {
                let names = (result && Array.isArray(result.areas)) ? result.areas.map(area => area.name).filter(name => name) : [];
                if(names.length > 0) {
                    return "Drew "+names.join(", ")+" on the map filter";
                }
                return "Drew "+((result && result.polygons) ? result.polygons : "")+" polygon(s) on the map filter";
            }
        }
        return "Updated the view";
    }

    /*
    * Function: upgradeShortcuts
    * Turns the agent's shortcut links into buttons. A link whose command isn't one we
    * recognise is flattened to plain text rather than left clickable - the agent doesn't
    * get to invent new ones.
    */
    upgradeShortcuts(container) {
        $(container).find('a[href^="'+SeadAgent.SHORTCUT_PREFIX+'"]').each((index, element) => {
            let link = $(element);
            let shortcut = this.parseShortcut(link.attr("href"));

            if(!shortcut) {
                console.warn("SEAD agent produced an unusable shortcut: "+link.attr("href"));
                link.replaceWith(document.createTextNode(link.text()));
                return;
            }

            link.replaceWith($("<button></button>")
                .attr("type", "button")
                .addClass("sead-agent-shortcut")
                .attr("data-command", shortcut.command)
                .attr("data-args", JSON.stringify(shortcut.args))
                .text(link.text()));
        });
    }

    /*
    * Function: parseShortcut
    * Reads '#sead-action/<command>?<args>'. Returns null for anything unrecognised.
    */
    parseShortcut(href) {
        if(typeof href != "string" || href.indexOf(SeadAgent.SHORTCUT_PREFIX) != 0) {
            return null;
        }
        let body = href.substring(SeadAgent.SHORTCUT_PREFIX.length);
        let split = body.indexOf("?");
        let command = split == -1 ? body : body.substring(0, split);

        if(SeadAgent.SHORTCUT_COMMANDS.indexOf(command) == -1) {
            return null;
        }

        let args = {};
        if(split != -1) {
            let params = new URLSearchParams(body.substring(split + 1));
            params.forEach((value, key) => {
                //'selections' is the only list-valued argument the commands take
                if(key == "selections") {
                    args.selections = value.split(",").map(part => Number(part.trim())).filter(part => !isNaN(part));
                }
                else if(key == "siteId") {
                    args.siteId = parseInt(value);
                }
                else if(key == "expanded") {
                    args.expanded = value != "false";
                }
                //Area ids for the map filter, e.g. 'SWE.13_1,SWE.18.12_1'
                else if(key == "areas") {
                    args.areas = value.split(",").map(part => part.trim()).filter(part => part.length > 0);
                }
                else if(key == "append") {
                    args.append = value != "false";
                }
                else {
                    args[key] = value;
                }
            });
        }
        return { command: command, args: args };
    }

    /*
    * Function: runShortcut
    * Runs a shortcut the user clicked. This goes straight to the client - the agent is not
    * consulted, so the change is immediate and costs no model time.
    */
    async runShortcut(button) {
        if(button.prop("disabled")) {
            return;
        }
        let command = button.attr("data-command");
        let args = {};
        try {
            args = JSON.parse(button.attr("data-args") || "{}");
        }
        catch(error) {
            return;
        }

        button.prop("disabled", true);
        try {
            let result = await this.actions.execute(command, args);
            this.appendActionNotice(this.describeAction({ command: command, args: args }, result));
        }
        catch(error) {
            console.warn("SEAD agent shortcut failed: "+command, error);
            this.appendActionNotice("Could not do that: "+(error && error.message ? error.message : String(error)));
        }
        finally {
            button.prop("disabled", false);
        }
    }

    appendActionNotice(description) {
        $("#chatbox-messages").append(`<div class="message agent-action"><p>${this.escapeHtml(description)}</p></div>`);
        this.scrollToLatestMessage();
    }

    /*
    * Function: postToAgent
    * One leg of a turn. Errors the service reports are marked so sendMessage shows them
    * to the user as they were written.
    */
    async postToAgent(url, body, abortController) {
        let response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            signal: abortController.signal
        });

        if(!response.ok) {
            throw this.agentError(await this.extractErrorMessage(response));
        }
        return await response.json();
    }

    agentError(message) {
        //The service phrases these for the user; mark them so we don't bury them
        //in a generic message of our own
        let error = new Error(message);
        error.fromAgent = true;
        return error;
    }

    /*
    * Function: getAgentEndpointUrl
    * The agent is its own service, reached through the router at /sead-agent.
    */
    getAgentEndpointUrl() {
        return this.getAgentBaseUrl()+"/message";
    }

    getActionResultUrl() {
        return this.getAgentBaseUrl()+"/message/action-result";
    }

    getAgentBaseUrl() {
        return (this.sqs.config.seadAgentAddress || "").replace(/\/+$/, "");
    }

    /*
    * Function: getConversationId
    * One id per browser session, so the agent remembers what was already said. The service
    * scopes it to the client address, and forgets it after its own idle timeout.
    */
    getConversationId() {
        if(!this.conversationId) {
            //The service only accepts [A-Za-z0-9_-]{1,64}
            let generated = (typeof crypto != "undefined" && crypto.randomUUID) ? crypto.randomUUID() : "c"+Date.now()+"-"+Math.random().toString(36).substring(2);
            this.conversationId = generated.replace(/[^A-Za-z0-9_-]/g, "");
        }
        return this.conversationId;
    }

    /*
    * Function: extractErrorMessage
    * The proxy reports its failures as {"error": "..."}, but fall back to the raw body
    * in case something in between (nginx, say) answered instead.
    */
    async extractErrorMessage(response) {
        let body = "";
        try {
            body = await response.text();
        }
        catch(error) {
            return "HTTP "+response.status;
        }

        try {
            let payload = JSON.parse(body);
            if(payload && typeof payload.error == "string") {
                return payload.error;
            }
        }
        catch(error) {
            //not JSON, fall through to the raw body
        }

        return "HTTP "+response.status+" "+body.substring(0, 200);
    }

    /*
    * Function: extractResponseText
    * The service answers {"output_text": "<markdown>"}. Anything else means we're talking
    * to something that isn't the agent, so show the raw payload rather than a blank reply.
    */
    extractResponseText(payload) {
        if(payload && typeof payload.output_text == "string" && payload.output_text.trim().length > 0) {
            return payload.output_text;
        }
        if(typeof payload == "string") {
            return payload;
        }
        return "```json\n"+JSON.stringify(payload, null, 2)+"\n```";
    }

    /*
    * Function: renderAgentMessage
    * Replaces the pending loading indicator with the agent's reply.
    */
    renderAgentMessage(text, renderMarkdown = true) {
        let content = renderMarkdown ? this.stripSingleParagraphWrapper(micromark(text)) : this.escapeHtml(text);
        let indicator = $("#chatbox-loading-indicator");
        let targetMessageLine;

        if(indicator.length > 0) {
            //Replace the pending reply this message was awaited as
            targetMessageLine = indicator.parent();
            indicator.remove();
            targetMessageLine.html(`<span class="assistant-message">SEAD agent:</span> ${content}`);
        }
        else {
            //Nothing was pending - the greeting, say - so start a line of its own
            $("#chatbox-messages").append(`<div class="message"><p><span class="assistant-message">SEAD agent:</span> ${content}</p></div>`);
            targetMessageLine = $("#chatbox-messages .message").last();
        }

        this.upgradeShortcuts(targetMessageLine);
        this.scrollToLatestMessage();
    }

    /*
    * Function: stripSingleParagraphWrapper
    * Keeps one-paragraph replies on the same line as the "SEAD agent:" label, but leaves
    * multi-block markdown (lists, code, several paragraphs) intact.
    */
    stripSingleParagraphWrapper(html) {
        let trimmed = html.trim();
        if(trimmed.startsWith("<p>") && trimmed.endsWith("</p>") && trimmed.indexOf("<p>", 3) === -1) {
            return trimmed.substring(3, trimmed.length - 4);
        }
        return trimmed;
    }

    scrollToLatestMessage() {
        $("#chatbox-messages").scrollTop($("#chatbox-messages")[0].scrollHeight);
    }

    escapeHtml(value) {
        return $("<div></div>").text(value == null ? "" : value).html();
    }

    chatboxIconClickCallback(evt) {
        let chatBoxIcon = $("#chatbox-icon");
        evt.preventDefault();

        if(this.expanded) {
            this.collapseChatbox(chatBoxIcon);
        }
        else {
            this.expandChatbox(chatBoxIcon);
        }
    }

    /*
    * Function: expandChatbox
    * Grows the bubble into the panel. The visibility of the glyph, the panel and the
    * header is the stylesheet's business (they cross-fade with the .expanded class) -
    * doing it here with display toggles was what made the contents appear at full size
    * inside a box that was still growing.
    */
    expandChatbox(chatBoxIcon) {
        if(this.savedGeometry) {
            //The panel was moved or resized last time, so it has to travel to a specific
            //top/left rather than growing out of the corner it is anchored in. Nothing
            //interpolates out of `top: auto`, so pin the bubble's current position in
            //top/left terms first and let that be the transition's starting point.
            let collapsed = this.getCollapsedGeometry();
            chatBoxIcon.css({
                top: collapsed.top + "px",
                left: collapsed.left + "px",
                right: "auto",
                bottom: "auto",
                width: collapsed.width + "px",
                height: collapsed.height + "px"
            });
            //Forces a reflow so the above is what the browser transitions *from*, instead
            //of being coalesced with the target geometry below into one silent jump
            void chatBoxIcon[0].offsetWidth;

            chatBoxIcon.addClass("expanded");
            chatBoxIcon.css(this.clampGeometryToViewport(this.savedGeometry));
        }
        else {
            //Never moved, so it is still anchored bottom/right and grows up and to the
            //left on its own - no explicit geometry needed, and the CSS size applies.
            chatBoxIcon.addClass("expanded");
        }

        this.expanded = true;

        //The panel is pinned bottom-right and grows up/left, so the grip belongs on
        //the top-left corner. The n and w edges stay draggable for single-axis resizing.
        chatBoxIcon.resizable({
            handles: "nw, n, w",
            minWidth: this.sqs.scalePx(380),
            minHeight: this.sqs.scalePx(340),
            //The ceiling used to be max-width/max-height on the expanded rule, but a max
            //on the element clamps the grow transition's intermediate values as well, so
            //it lives here now - where it only limits what the user drags.
            maxWidth: Math.round(window.innerWidth * 0.9),
            maxHeight: Math.round(window.innerHeight * 0.8)
        });

        chatBoxIcon.draggable({
            handle: "#chatbox-header",
        });

        //Held until the panel has actually opened, so the browser doesn't scroll or flash
        //the caret in a box that is still the size of a bubble
        setTimeout(() => {
            $("#chatbox-input")[0].focus();
        }, 250);

        this.onChatboxOpened();
    }

    /*
    * Function: collapseChatbox
    * Shrinks the panel back down into the bubble. If it was dragged or resized it is
    * positioned by inline top/left, which cannot simply be dropped - that would teleport
    * it to the corner before the shrink - so it is flown down into the bubble's resting
    * place and the inline geometry is cleared once it arrives.
    */
    collapseChatbox(chatBoxIcon) {
        this.savedGeometry = this.readInlineGeometry(chatBoxIcon);

        //Tear the drag/resize behaviour down with the panel. The handles are only
        //meaningful while it is expanded, and the site report view's apply() does an
        //unscoped $(".ui-resizable-handle").show() that would otherwise reveal them
        //inside the collapsed bubble.
        if(chatBoxIcon.data("ui-resizable")) {
            chatBoxIcon.resizable("destroy");
        }
        if(chatBoxIcon.data("ui-draggable")) {
            chatBoxIcon.draggable("destroy");
        }

        chatBoxIcon.removeClass("expanded");
        this.expanded = false;

        if(this.savedGeometry) {
            let collapsed = this.getCollapsedGeometry();
            chatBoxIcon.css({
                top: collapsed.top + "px",
                left: collapsed.left + "px",
                width: collapsed.width + "px",
                height: collapsed.height + "px"
            });
            this.clearInlineGeometryAfterTransition(chatBoxIcon);
        }

        this.onChatboxClosed();
        //Keeps it hidden if the agent is disabled. Must run after this.expanded is
        //cleared, or it would re-enter the collapse path.
        this.updateChatboxVisibility();
    }

    /*
    * Function: getCollapsedGeometry
    * The bubble's resting place, expressed the way the expanded panel is positioned. The
    * collapsed bubble is anchored with bottom/right, the panel with top/left, and an
    * animation between the two states needs both ends in the same terms.
    */
    getCollapsedGeometry() {
        let rootStyle = getComputedStyle(document.documentElement);
        let elementStyle = getComputedStyle($("#chatbox-icon")[0]);
        let size = this.cssLengthToPixels(rootStyle.getPropertyValue("--chatbox-collapsed-size"), 54);
        //The bubble's margin still applies once it is positioned by top/left, and it is
        //added to whatever we set. Its resting edge is one margin in from the corner, so
        //top/left have to be set two margins short of it - one for the gap itself and one
        //for the margin that will be added back. Getting this wrong is invisible in the
        //stylesheet and shows up only as the panel landing beside the bubble.
        let marginTop = parseFloat(elementStyle.marginTop) || 0;
        let marginLeft = parseFloat(elementStyle.marginLeft) || 0;
        return {
            width: size,
            height: size,
            top: window.innerHeight - size - (marginTop * 2),
            left: window.innerWidth - size - (marginLeft * 2)
        };
    }

    /*
    * Function: cssLengthToPixels
    * Only handles the units the two chatbox custom properties are written in. The
    * fallback covers the properties being missing entirely, which would otherwise put
    * the bubble's landing point at NaN and strand the panel mid-air.
    */
    cssLengthToPixels(value, fallbackPixels) {
        let trimmed = (value || "").trim();
        let number = parseFloat(trimmed);
        if(isNaN(number)) {
            return fallbackPixels;
        }
        if(trimmed.endsWith("rem")) {
            return number * parseFloat(getComputedStyle(document.documentElement).fontSize);
        }
        return number;
    }

    /*
    * Function: readInlineGeometry
    * What the drag/resize plugins (or a previous expand) left on the element, in px.
    * Returns null when it has never been moved - in which case it is still anchored to
    * the corner and both directions of the animation come out of the stylesheet.
    */
    readInlineGeometry(chatBoxIcon) {
        let style = chatBoxIcon[0].style;
        let geometry = {};
        ["top", "left", "width", "height"].forEach((property) => {
            let value = parseFloat(style[property]);
            if(!isNaN(value)) {
                geometry[property] = value;
            }
        });
        return Object.keys(geometry).length > 0 ? geometry : null;
    }

    /*
    * Function: clampGeometryToViewport
    * The window may well have been resized since the panel was last open, so a remembered
    * position can be off-screen. Returned as css-ready strings.
    */
    clampGeometryToViewport(geometry) {
        let width = geometry.width || 0;
        let height = geometry.height || 0;
        let clamped = {};
        Object.keys(geometry).forEach((property) => {
            let value = geometry[property];
            if(property == "left") {
                value = Math.max(0, Math.min(value, window.innerWidth - width));
            }
            if(property == "top") {
                value = Math.max(0, Math.min(value, window.innerHeight - height));
            }
            clamped[property] = value + "px";
        });
        return clamped;
    }

    /*
    * Function: clearInlineGeometryAfterTransition
    * Drops the inline geometry once the collapse has landed, so the bubble goes back to
    * being positioned by the stylesheet (bottom/right) and follows the viewport corner
    * again if the window is resized.
    */
    clearInlineGeometryAfterTransition(chatBoxIcon) {
        let element = chatBoxIcon[0];
        let timeout = null;
        let finish = (evt) => {
            //Ignore the panel's own fade bubbling up, and the other properties in the
            //container's transition list - width is enough to know it has arrived.
            if(evt && (evt.target !== element || evt.propertyName != "width")) {
                return;
            }
            element.removeEventListener("transitionend", finish);
            clearTimeout(timeout);
            if(this.expanded) {
                //Reopened before the collapse finished; the expand owns the geometry now
                return;
            }
            chatBoxIcon.css({ top: "", left: "", right: "", bottom: "", width: "", height: "" });
        };
        element.addEventListener("transitionend", finish);
        //transitionend never fires for a transition that was pre-empted or reduced to
        //nothing (prefers-reduced-motion), so it can't be the only way out of here
        timeout = setTimeout(() => finish(null), 600);
    }

    setState(state) {
        this.state = state;
        //The send button has to go with the input, or a second message can be started
        //while a turn is still running - the service refuses that as a busy conversation
        $("#chatbox-input").prop("disabled", state != "ready");
        $("#chatbox-send-btn").prop("disabled", state != "ready");
    }

    /*
    * Function: onChatboxOpened
    * Greets the user straight away, then checks in the background that the agent really
    * can answer - which means the model server responding, not just being configured. The
    * greeting is not held up by that check, so the box is never blank while we wait.
    */
    onChatboxOpened() {
        this.renderGreeting();

        if(!this.getAgentBaseUrl()) {
            console.warn("SEAD agent is not configured: seadAgentAddress is missing from the config.");
            this.reportUnavailable("The SEAD agent is not configured on this instance.");
            return;
        }

        this.setState("ready");

        this.checkAvailability().then(availability => {
            if(!availability.reachable) {
                this.reportUnavailable("The SEAD agent is not responding. It may be restarting - try again shortly.");
            }
            else if(!availability.configured) {
                this.reportUnavailable("No language model is configured for the SEAD agent on this instance.");
            }
            else if(!availability.modelReachable) {
                this.reportUnavailable(availability.modelError || "The language model is not responding.");
            }
        });
    }

    /*
    * Function: renderGreeting
    * Says hello once, the first time the chatbox is opened. Reopening keeps whatever was
    * already said rather than greeting again on top of a conversation.
    */
    renderGreeting() {
        if(this.greeted) {
            return;
        }
        this.greeted = true;
        this.renderAgentMessage(SeadAgent.GREETING);
    }

    /*
    * Function: checkAvailability
    * Asks /status, which probes the model server rather than only reporting whether one
    * was configured. Run on every open rather than once per page load, so a model that
    * was down and has come back is noticed. A failure here is never fatal - sending a
    * message would report the real error anyway.
    */
    checkAvailability() {
        return fetch(this.getAgentBaseUrl()+"/status")
            .then(response => response.ok ? response.json() : null)
            .then(payload => {
                if(payload == null) {
                    return { reachable: false, configured: false, modelReachable: false };
                }
                let model = payload.model || {};
                return {
                    reachable: true,
                    configured: payload.configured !== false,
                    modelReachable: model.reachable === true,
                    modelError: model.error
                };
            })
            .catch(() => ({ reachable: false, configured: false, modelReachable: false }));
    }

    /*
    * Function: reportUnavailable
    * Says why the chatbox can't be used and takes the input out of service.
    */
    reportUnavailable(message) {
        this.setState("disconnected");
        $("#chatbox-messages").append(`<div class="message"><p><span class="assistant-message">SEAD agent:</span> ${this.escapeHtml(message)}</p></div>`);
        this.scrollToLatestMessage();
    }

    /*
    * Function: onChatboxClosed
    * Abandon any reply we're still waiting for so it doesn't render into a closed chatbox.
    */
    onChatboxClosed() {
        if(this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        //Dropping the request only stops us listening; tell the service too, so a turn
        //we've walked away from stops occupying the model
        if(this.activeTurnId) {
            let turnId = this.activeTurnId;
            this.activeTurnId = null;
            fetch(this.getAgentBaseUrl()+"/message/abort", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ turnId: turnId }),
                keepalive: true
            }).catch(() => {
                //Best effort - the turn times out on its own anyway
            });
        }
        this.setState("disconnected");
    }
}