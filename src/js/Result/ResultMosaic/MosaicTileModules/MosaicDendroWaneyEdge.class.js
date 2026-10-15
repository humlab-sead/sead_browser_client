import DendroBaseModule from "./DendroBaseModule.class";

/**
 * MosaicDendroWaneyEdge - Display Waney edge ternary variable (Yes/Maybe/No)
 */
class MosaicDendroWaneyEdge extends DendroBaseModule {
    constructor(sqs) {
        super(sqs);
        this.label = "Waney edge (W)";
        this.description = "Presence of waney edge (natural edge with bark) on the sample";
        this.title = "Waney edge";
        this.name = "mosaic-dendro-waney-edge";
        this.display = "shares";
    }

    async fetchData(requestId) {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        const result = await this.fetchVariable(this.label, resultMosaic.sites, requestId, 'ternary');

        if(result.error || !result.data || !result.data.categories || result.data.categories.length === 0) {
            return false;
        }

        // Parse and normalize ternary values
        const normalizedCategories = {};
        result.data.categories.forEach(cat => {
            const normalized = this.parseDendroTernaryValue(cat.name, this.label);
            if(normalized !== null) {
                normalizedCategories[normalized] = (normalizedCategories[normalized] || 0) + cat.count;
            }
        });

        // Ensure all three categories exist in the correct order
        const categories = ["Yes", "Maybe", "No"].map(state => ({
            name: state,
            count: normalizedCategories[state] || 0
        })).filter(cat => cat.count > 0);

        if(categories.length === 0) {
            return false;
        }

        return { categories: categories };
    }
}

export default MosaicDendroWaneyEdge;
