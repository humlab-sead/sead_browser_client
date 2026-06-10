import MosaicDendroCategoricalVariable from "./MosaicDendroCategoricalVariable.class";

/**
 * MosaicDendroBark - Display Bark presence
 */
class MosaicDendroBark extends MosaicDendroCategoricalVariable {
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
