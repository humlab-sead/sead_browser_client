import DendroBaseModule from "./DendroBaseModule.class";

/**
 * MosaicDendroCategoricalVariable - Display categorical dendro variables
 * Generic module that can handle any categorical dendro variable (including binary variables)
 */
class MosaicDendroCategoricalVariable extends DendroBaseModule {
    constructor(sqs, variableName, title, description) {
        super(sqs);
        this.variableName = variableName;
        this.title = title || variableName;
        this.description = description || '';
        this.name = "mosaic-dendro-" + variableName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        this.display = "shares";
    }

    async fetchData(requestId) {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        const result = await this.fetchVariable(this.variableName, resultMosaic.sites, requestId, 'categorical');

        if(result.error || !result.data || !result.data.categories || result.data.categories.length === 0) {
            return false;
        }

        // Parse and normalize binary values
        const normalizedCategories = {};
        result.data.categories.forEach(cat => {
            const normalized = this.parseDendroBinaryValue(cat.name);
            if(normalized !== null) {
                normalizedCategories[normalized] = (normalizedCategories[normalized] || 0) + cat.count;
            }
        });

        const categories = ["Yes", "No"].map(name => ({
            name: name,
            count: normalizedCategories[name] || 0
        })).filter(cat => cat.count > 0);

        if(categories.length === 0) {
            return false;
        }

        return { categories: categories };
    }
}

export default MosaicDendroCategoricalVariable;
