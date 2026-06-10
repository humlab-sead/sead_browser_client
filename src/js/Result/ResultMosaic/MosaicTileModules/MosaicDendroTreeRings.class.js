import MosaicDendroNumericVariable from "./MosaicDendroNumericVariable.class";

/**
 * MosaicDendroTreeRings - Display Tree Rings distribution
 */
class MosaicDendroTreeRings extends MosaicDendroNumericVariable {
    constructor(sqs) {
        super(
            sqs,
            "Tree rings",
            "Tree Rings",
            "Number of tree rings counted in the sample"
        );
        this.name = "mosaic-dendro-tree-rings";
    }
}

export default MosaicDendroTreeRings;
