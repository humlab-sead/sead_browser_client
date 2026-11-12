import DendroBaseModule from "./DendroBaseModule.class";

/**
 * MosaicDendroTreeAge - Display tree age distribution as mirrored histogram
 */
class MosaicDendroTreeAge extends DendroBaseModule {
    constructor(sqs) {
        super(sqs);
        this.title = "Tree age distribution";
        this.description = "The estimated ages of the trees the samples come from. A sample's age is often given as a range: its least age is drawn upwards and its greatest age downwards.";
        this.name = "mosaic-dendro-tree-age";
        this.display = "histogram";
        this.valueLabel = "Age (years)";
    }

    async fetchData(requestId) {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");

        const [treeAgeMin, treeAgeMax] = await Promise.all([
            this.fetchVariable("Tree age ≥", resultMosaic.sites, requestId, 'numeric'),
            this.fetchVariable("Tree age ≤", resultMosaic.sites, requestId, 'numeric')
        ]);

        if(treeAgeMin.error || treeAgeMax.error ||
           !treeAgeMin.data || !treeAgeMax.data ||
           !treeAgeMin.data.categories || !treeAgeMax.data.categories ||
           treeAgeMin.data.categories.length === 0 || treeAgeMax.data.categories.length === 0) {
            return false;
        }

        const minValues = this.parseNumericCategories(treeAgeMin.data.categories);
        const maxValues = this.parseNumericCategories(treeAgeMax.data.categories);

        if(minValues.length === 0 || maxValues.length === 0) {
            return false;
        }

        return {
            series: [
                { name: "At least (≥)", values: minValues, exportKey: "youngest_count" },
                { name: "At most (≤)", values: maxValues, exportKey: "oldest_count" }
            ]
        };
    }

    getHistogramSubtitle() {
        return "Samples per estimated tree age · median "+this.formatCount(this.getMedian(this.data.series[0].values))+"–"+this.formatCount(this.getMedian(this.data.series[1].values))+" years";
    }
}

export default MosaicDendroTreeAge;
