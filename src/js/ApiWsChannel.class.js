import { nanoid } from "nanoid";
export class ApiWsChannel {
    constructor() {
        this.channelId = nanoid();
        this.ws = null;
        this.address = "ws://localhost:3500";
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.address, "api");
            this.ws.onopen = () => {
                this.ws.onmessage = this.listen;
                resolve(this);
            };
        });
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