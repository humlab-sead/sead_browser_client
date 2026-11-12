import DendroBaseModule from "./DendroBaseModule.class";

/**
 * MosaicDendroSampleTypes - Display sample types distribution
 */
class MosaicDendroSampleTypes extends DendroBaseModule {
    constructor(sqs) {
        super(sqs);
        this.title = "Sample types";
        this.description = "The kinds of samples taken at the sites in the result, such as cores and cross-cuts, by number of samples.";
        this.name = "mosaic-dendro-sample-types";
        this.categoryNoun = "sample type";
        // Every sample has a type, so how many do says nothing
        this.showCoverage = false;
    }

    async fetchData(requestId) {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        const result = await this.fetchSampleTypes(resultMosaic.sites, requestId);

        if(result.error || !result.data || !result.data.categories || result.data.categories.length === 0) {
            return false;
        }

        return {
            categories: result.data.categories.map(cat => ({
                name: cat.name,
                count: cat.count
            }))
        };
    }
}

export default MosaicDendroSampleTypes;
