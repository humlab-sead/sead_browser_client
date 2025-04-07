

export default class IOModule {
    constructor(resultManager) {
        this.resultManager = resultManager;
        this.sqs = this.resultManager.sqs;
        this.id = null; //internal/machine name of the module
        this.prettyName = null; //pretty name of the module
        this.data = null; //containing the data to be rendered
        this.renderIntoNode = null; //target DOM element to render into
        this.rendered = false; //boolean to check if the module has been rendered
    }

    render() {
        //render yourself into your targeted container
    }

    update() {
        //data update without triggering a full re-render
    }

    unrender() {
        //remove yourself from the DOM and clean up everything, unregister events, etc.
    }
}