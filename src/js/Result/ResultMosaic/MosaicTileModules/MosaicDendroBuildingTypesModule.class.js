import DendroBaseModule from "./DendroBaseModule.class";

/**
 * MosaicDendroBuildingTypesModule - Display building type distribution
 */
class MosaicDendroBuildingTypesModule extends DendroBaseModule {
    constructor(sqs) {
        super(sqs);
        this.title = "Building types";
        this.description = "The kinds of buildings the sample groups at the sites in the result were taken from, by number of sample groups.";
        this.name = "mosaic-dendro-building-types";
        this.categoryNoun = "building type";
        // The building type is recorded per sample group
        this.coverageNoun = "sample groups";
    }

    async fetchData(requestId) {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        const result = await this.fetchBuildingTypes(resultMosaic.sites, requestId);

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

    getCoverageTotal() {
        return this.fetchSampleGroupsCount();
    }
}

export default MosaicDendroBuildingTypesModule;
