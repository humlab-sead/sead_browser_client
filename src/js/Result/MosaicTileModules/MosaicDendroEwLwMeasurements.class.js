import MosaicDendroBinaryVariable from "./MosaicDendroBinaryVariable.class";

/**
 * MosaicDendroEwLwMeasurements - Display EW/LW measurements availability
 */
class MosaicDendroEwLwMeasurements extends MosaicDendroBinaryVariable {
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
