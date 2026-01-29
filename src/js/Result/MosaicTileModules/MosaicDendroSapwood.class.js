import MosaicDendroNumericVariable from "./MosaicDendroNumericVariable.class";

/**
 * MosaicDendroSapwood - Display Sapwood distribution
 */
class MosaicDendroSapwood extends MosaicDendroNumericVariable {
    constructor(sqs) {
        super(
            sqs,
            "Sapwood (Sp)",
            "Sapwood",
            "Number of sapwood rings in the sample"
        );
        this.name = "mosaic-dendro-sapwood";
    }
}

export default MosaicDendroSapwood;
