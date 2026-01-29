import MosaicDendroNumericVariable from "./MosaicDendroNumericVariable.class";

/**
 * MosaicDendroPith - Display Pith distribution
 */
class MosaicDendroPith extends MosaicDendroNumericVariable {
    constructor(sqs) {
        super(
            sqs,
            "Pith (P)",
            "Pith",
            "Number of rings from pith (center of tree) to the sample edge"
        );
        this.name = "mosaic-dendro-pith";
    }
}

export default MosaicDendroPith;
