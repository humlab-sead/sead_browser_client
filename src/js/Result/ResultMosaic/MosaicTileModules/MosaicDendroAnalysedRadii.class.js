import MosaicDendroNumericVariable from "./MosaicDendroNumericVariable.class";

/**
 * MosaicDendroAnalysedRadii - Display Analysed Radii distribution
 */
class MosaicDendroAnalysedRadii extends MosaicDendroNumericVariable {
    constructor(sqs) {
        super(
            sqs,
            "Number of analysed radii.",
            "Analysed Radii",
            "Number of radii that were analyzed from the tree sample"
        );
        this.name = "mosaic-dendro-analysed-radii";
    }
}

export default MosaicDendroAnalysedRadii;
