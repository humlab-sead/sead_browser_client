import MosaicDendroNumericVariable from "./MosaicDendroNumericVariable.class";

/**
 * MosaicDendroAnalysedRadii - Display Analysed Radii distribution
 */
class MosaicDendroAnalysedRadii extends MosaicDendroNumericVariable {
    constructor(sqs) {
        super(
            sqs,
            "Number of analysed radii.",
            "Analysed radii",
            "Number of radii that were analyzed from the tree sample",
            "Analysed radii"
        );
        this.name = "mosaic-dendro-analysed-radii";
    }
}

export default MosaicDendroAnalysedRadii;
