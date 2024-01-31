import { micromark } from "micromark";

export default class AIAssistant {
    constructor(sqs) {
        this.sqs = sqs;
        this.threadId = null;
        this.ws = null;
        this.state = "connecting";
        this.expanded = false;
        this.savedAttributes = "";

        if(this.sqs.config.copilotEnabled) {
            $("#chatbox-icon").css("display", "flex");
        }

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
    }

    sendMessage() {
        this.setState("loading");
        let input = $("#chatbox-input");
        let message = input.val();
        input.val("");
        $("#chatbox-messages").append(`<div class="message"><p><span class="user-message">You:</span> ${message}</p></div>`);
        this.ws.send(JSON.stringify({
            threadId: this.threadId ? this.threadId : null,
            message: message
        }));

        $("#chatbox-messages").append(`<div class="message"><p><span class="assistant-message">Assistant:</span><span id="chatbox-loading-indicator"></span></p></div>`);

        //scroll down
        $("#chatbox-messages").scrollTop($("#chatbox-messages")[0].scrollHeight);
    }

    chatboxIconClickCallback(evt) {
        let chatBoxIcon = $("#chatbox-icon");
        evt.preventDefault();

        if(this.expanded) {
            this.savedAttributes = chatBoxIcon.attr("style");
        }
        chatBoxIcon.toggleClass("expanded");

        if(!this.expanded) {
            $("#chatbox-inner-panel").css("display", "flex");
            chatBoxIcon.find(".chat-icon").css("display", "none");
            $("#chatbox-header").css("display", "flex");
            this.expanded = true;
            
            chatBoxIcon.resizable({
                handles: "n, w"
            });

            chatBoxIcon.draggable({
                handle: "#chatbox-header",
            });

            //set focus on input
            setTimeout(() => {
                $("#chatbox-input")[0].focus();
            }, 100);

            if(this.savedAttributes) {
                //animate back to original position
                //this.savedAttributes is a string like: left: 563.75px; top: 577.609px; width: 657px; height: 678px;
                //we need to extract the values and convert them to numbers, but we can't rely on every attribute being present
                let left = null;
                let top = null;
                let width = null;
                let height = null;
                let savedAttributesArray = this.savedAttributes.split(";");
                savedAttributesArray.forEach((attribute) => {
                    let attributeArray = attribute.split(":");
                    if(attributeArray[0].trim() == "left") {
                        left = parseFloat(attributeArray[1].trim().replace("px", ""));
                    }
                    if(attributeArray[0].trim() == "top") {
                        top = parseFloat(attributeArray[1].trim().replace("px", ""));
                    }
                    if(attributeArray[0].trim() == "width") {
                        width = parseFloat(attributeArray[1].trim().replace("px", ""));
                    }
                    if(attributeArray[0].trim() == "height") {
                        height = parseFloat(attributeArray[1].trim().replace("px", ""));
                    }
                });

                
                let properties = {}

                top ? properties.top = top : null;
                left ? properties.left = left : null;
                width ? properties.width = width : null;
                height ? properties.height = height : null;

                chatBoxIcon.animate(properties, 100);
            }

            this.ws = this.initWebSocket();
        }
        else {
            //clear any inline style that might have been set by the resizable plugin
            chatBoxIcon.removeAttr("style");
            $("#chatbox-icon").removeClass("expanded");
            $("#chatbox-inner-panel").css("display", "none");
            $("#chatbox-icon").find(".chat-icon").css("display", "block");
            $("#chatbox-header").css("display", "none")

            if(this.state == "ready") {
                this.closeWebsocket();
            }
            else {
                this.closeWsInterval = setInterval(() => {
                    if(this.state == "ready") {
                        this.closeWebsocket();
                        clearInterval(this.closeWsInterval);
                    }
                }, 200);
            }
            
            this.expanded = false;
        }
    }

    setState(state) {
        if(state != "ready") {
            $("#chatbox-input").prop("disabled", true);
        }
        if(state == "ready") {
            $("#chatbox-input").prop("disabled", false);
        }
    }

    initWebSocket() {
        let ws = new WebSocket(this.sqs.config.copilotServerAddress);
        //let ws = new WebSocket("ws://localhost:3201/");
        ws.onopen = () => {
            console.log("Websocket connection established");
            this.setState("ready");
        }
        ws.onmessage = (evt) => {
            this.threadId = JSON.parse(evt.data).threadId;
            let targetMessageLine = $("#chatbox-loading-indicator").parent();
            $("#chatbox-loading-indicator").remove();
            let message = JSON.parse(evt.data).message;
            
            message = micromark(message);
            //strip surrounding <p> tags
            console.log(message);
            message = message.substring(3, message.length - 5);

            targetMessageLine.html(`<span class="assistant-message">Assistant:</span> ${message}`);
            this.setState("ready");
        }
        ws.onclose = () => {
            console.log("Websocket connection closed");
            this.closeWebsocket(true);
        }

        return ws;
    }

    closeWebsocket(alreadyClosed = false) {
        console.log("Closing websocket");
        if(!alreadyClosed) {
            this.ws.close();
        }
        this.ws = null;
        this.setState("disconnected");
    }
}