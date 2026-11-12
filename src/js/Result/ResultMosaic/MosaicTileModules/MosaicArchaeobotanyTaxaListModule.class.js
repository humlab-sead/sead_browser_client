import MosaicTaxaListModule from "./MosaicTaxaListModule.class";

/**
 * MosaicArchaeobotanyTaxaListModule - The top taxa of the archaeobotanical datasets (method 8) rather than the insects
 */
class MosaicArchaeobotanyTaxaListModule extends MosaicTaxaListModule {
    constructor(sqs) {
        super(sqs);
        this.title = "Top taxa";
        this.description = "Ranked list of the most frequently occurring archaeobotanical taxa across the selected sites.";
        this.name = "mosaic-archaeobotany-taxa-list";
        this.domains = ["archaeobotany"];
        this.endpoint = "/graphs/toptaxa/8";
        this.linkTaxa = false;
    }
}

export default MosaicArchaeobotanyTaxaListModule;
