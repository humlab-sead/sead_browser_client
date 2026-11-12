import DendroBaseModule from "./DendroBaseModule.class";

/**
 * MosaicDendroNumericVariable - Display numeric dendro variable as histogram
 * Generic module that can handle any numeric dendro variable
 */
class MosaicDendroNumericVariable extends DendroBaseModule {
    constructor(sqs, variableName, title, description, valueLabel = null) {
        super(sqs);
        this.variableName = variableName;
        this.title = title || variableName;
        this.description = description || '';
        this.name = "mosaic-dendro-" + variableName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        this.display = "histogram";
        this.valueLabel = valueLabel || this.title;
    }

    async fetchData(requestId) {
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        const result = await this.fetchVariable(this.variableName, resultMosaic.sites, requestId, 'numeric');

        if(result.error || !result.data || !result.data.categories || result.data.categories.length === 0) {
            return false;
        }

        const values = this.parseNumericCategories(result.data.categories);
        if(values.length === 0) {
            return false;
        }

        return {
            series: [{ name: this.title, values: values, exportKey: "sample_count" }]
        };
    }
}

export default MosaicDendroNumericVariable;
