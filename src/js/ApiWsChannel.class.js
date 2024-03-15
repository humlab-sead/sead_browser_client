import { nanoid } from "nanoid";
class ApiWsChannel {
    constructor(sqs, address = null) {
        this.sqs = sqs;
        this.channelId = nanoid();
        this.ws = null;
        this.address = address ? address : sqs.config.dataServerAddress.replace(/^(https?):\/\/(.*)$/, (match, protocol, uri) => `${protocol === 'https' ? 'wss' : 'ws'}://${uri}`);
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.address, "api");
            this.ws.onopen = () => {
                this.ws.onmessage = this.listen;

                if(this.ws.readyState == 1) {
                    resolve(this);
                }
                else {
                    reject("Failed to connect to WebSocket");
                }
            };
        });
    }

    connected() {
        return this.ws.readyState === 1;
    }

    send(msg) {
        msg.channelId = this.channelId;
        this.ws.send(JSON.stringify(msg));
    }

    bindListen(func) {
        this.ws.onmessage = func;
    }

    listen(evt) {
        console.log(evt);
    }

    close() {
        this.ws.close();
    }

}

export { ApiWsChannel as default }