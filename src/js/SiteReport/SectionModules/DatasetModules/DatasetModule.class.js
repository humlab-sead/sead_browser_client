class DatasetModule {
    constructor(analysis) {
        this.methodIds = [];
    }

    claimDatasets(site) {
		let methodDatasets = [];
		if(this.methodIds.length == 0 && typeof this.methodGroupIds != "undefined" && this.methodGroupIds.length > 0) {
			methodDatasets = site.datasets.filter(dataset => {
				return this.methodGroupIds.includes(dataset.method_group_id);
			});
		}
		else {
			methodDatasets = site.datasets.filter(dataset => {
				return this.methodIds.includes(dataset.method_id);
			});
		}

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

}

export default DatasetModule;