class MosaicTileModule {
    constructor(sqs) {
        this.sqs = sqs;
        this.chart = null;
        this.renderIntoNode = null;
        this.active = true;
    }

    async fetch() {

    }

    async render() {

    }

    async update() {
        
    }

    async unrender() {
        if(this.chart != null) {
            this.chart.destroy();
            this.chart = null;
        }
    }
}

export default MosaicTileModule;