import DendroBaseModule from "./DendroBaseModule.class";

/**
 * MosaicDendroTreeSpecies - Display tree species distribution
 */
class MosaicDendroTreeSpecies extends DendroBaseModule {
    constructor(sqs) {
        super(sqs);
        this.title = "Tree species";
        this.description = "The species of the trees the samples at the sites in the result come from, by number of samples.";
        this.name = "mosaic-dendro-tree-species";
        this.categoryNoun = "tree species";
    }

    async fetchData(requestId) {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        const result = await this.fetchVariable("Tree species", resultMosaic.sites, requestId, 'categorical');

        if(result.error || !result.data || !result.data.categories || result.data.categories.length === 0) {
            return false;
        }

        // The species have colors of their own, the same wherever they are shown
        const speciesColors = this.sqs.config.treeSpeciesColors || [];
        const categories = result.data.categories.map(cat => {
            const colorConfig = speciesColors.find(sc => sc.species === cat.name);
            return {
                name: cat.name,
                count: cat.count,
                color: colorConfig ? '#' + colorConfig.color : '#a0a0a0'
            };
        });

        return { categories: categories };
    }
}

export default MosaicDendroTreeSpecies;
