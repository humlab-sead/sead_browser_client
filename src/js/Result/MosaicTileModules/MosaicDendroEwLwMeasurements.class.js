import MosaicDendroCategoricalVariable from "./MosaicDendroCategoricalVariable.class";

/**
 * MosaicDendroEwLwMeasurements - Display EW/LW measurements availability
 */
class MosaicDendroEwLwMeasurements extends MosaicDendroCategoricalVariable {
    constructor(sqs) {
        super(
            sqs,
            "EW/LW measurements",
            "EW/LW Measurements",
            "Early wood and late wood measurements available"
        );
        this.name = "mosaic-dendro-ew-lw-measurements";
    }
}

export default MosaicDendroEwLwMeasurements;
