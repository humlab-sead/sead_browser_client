class DatasetModule {
    constructor(analysis) {
        this.methodIds = [];
    }

    claimDatasets(site) {
		let methodDatasets = [];
		let methodDatasetsSelectedByGroup = [];
		let methodDatasetsSelectedById = [];
		if(typeof this.methodGroupIds != "undefined" && this.methodGroupIds.length > 0) {
			methodDatasetsSelectedByGroup = site.datasets.filter(dataset => {
				return this.methodGroupIds.includes(dataset.method_group_id);
			});
			//console.log(this.constructor.name+" claimed datasets (by group):", methodDatasets);
		}
		if(typeof this.methodIds != "undefined") {
			methodDatasetsSelectedById = site.datasets.filter(dataset => {
				return this.methodIds.includes(dataset.method_id);
			});
			//console.log(this.constructor.name+" claimed datasets (by id):", methodDatasets);
		}

		methodDatasets = methodDatasetsSelectedByGroup.concat(methodDatasetsSelectedById);

		let unclaimedDatasets = [];
		site.datasets.forEach(dataset => {
			let isClaimed = false;
			methodDatasets.forEach(methodDataset => {
				if(methodDataset.dataset_id == dataset.dataset_id) {
					isClaimed = true;
				}
			});
			if(!isClaimed) {
				unclaimedDatasets.push(dataset);
			}
		});

		site.datasets = unclaimedDatasets;
		
		/* this is much more elegant method for finding the unclaimed datasets, but it doesn't work with method groups...
		site.datasets = site.datasets.filter(dataset => {
			return !this.methodIds.includes(dataset.method_id);
		});
		*/

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

    async makeSection(siteData, sections) {
		//console.log(siteData, sections);
	}

	getSectionByMethodId(methodId, sections) {
		for(let key in sections) {
			if(sections[key].name == methodId) {
				return sections[key];
			}
		}
		return null;
	}

	getAnalysisMethodMetaById(siteData, methodId) {
		if(typeof siteData.lookup_tables.analysis_methods == "undefined") {
			return null;
		}
		for(let key in siteData.lookup_tables.analysis_methods) {
			if(siteData.lookup_tables.analysis_methods[key]) {
				if(siteData.lookup_tables.analysis_methods[key].method_id == methodId) {
					return siteData.lookup_tables.analysis_methods[key];
				}
			}
		}
	}
}

export default DatasetModule;