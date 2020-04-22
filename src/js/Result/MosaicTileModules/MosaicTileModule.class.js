class MosaicTileModule {
    constructor(hqs) {
        this.hqs = hqs;
        this.chart = null;
        this.renderIntoNode = null;
    }

    render() {

    }

    unrender() {
        if(this.chart != null) {
            this.chart.destroy();
            this.chart = null;
        }
    }
}

export default MosaicTileModule;