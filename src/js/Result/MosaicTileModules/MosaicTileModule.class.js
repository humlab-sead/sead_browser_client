class MosaicTileModule {
    constructor(sqs) {
        this.sqs = sqs;
        this.chart = null;
        this.renderIntoNode = null;
    }

    render() {

    }

    update() {
        
    }

    unrender() {
        if(this.chart != null) {
            this.chart.destroy();
            this.chart = null;
        }
    }
}

export default MosaicTileModule;