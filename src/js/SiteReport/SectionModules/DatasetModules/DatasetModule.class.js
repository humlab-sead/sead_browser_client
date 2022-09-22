class DatasetModule {
    constructor(analysis) {
        this.methodIds = [];
    }

    claimDatasets(site) {
		let methodDatasets = site.datasets.filter(dataset => {
			return this.methodIds.includes(dataset.method_id);
		});

		site.datasets = site.datasets.filter(dataset => {
			return !this.methodIds.includes(dataset.method_id);
		});

		return methodDatasets;
	}

    /**
     * Function: offerAnalyses
     */
	offerAnalyses(datasets, sectionsList) {
        return new Promise((resolve, reject) => {
            resolve();
        });
	}

    makeSection(siteData, sections) {
		//console.log(siteData, sections);
	}

}

export default DatasetModule;