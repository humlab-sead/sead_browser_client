import MosaicDendroBinaryVariable from "./MosaicDendroBinaryVariable.class";

/**
 * MosaicDendroBark - Display Bark presence
 */
class MosaicDendroBark extends MosaicDendroBinaryVariable {
    constructor(sqs) {
        super(
            sqs,
            "Bark (B)",
            "Bark",
            "Presence of bark on the sample"
        );
        this.name = "mosaic-dendro-bark";
    }
}

export default MosaicDendroBark;
