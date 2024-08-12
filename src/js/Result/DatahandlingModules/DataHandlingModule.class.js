class DataHandlingModule {
    constructor(sqs) {
        this.sqs = sqs;
        this.methodIds = [];
        this.methodGroupIds = [];
        this.data = {};
    }

    getMethod(sites, methodId) {
        let method = null;
        for(let key in sites) {
            method = sites[key].lookup_tables.methods.find((m) => { return m.method_id == methodId } );
            if(method) {
                break;
            }
        }

        return method;
    }
    
    claimedDataGroup(dataGroup, verbose = false) {
        let claimed = false;
        if (dataGroup.method_ids.some(methodId => this.methodIds.includes(methodId))) {
            if(verbose) console.log(this.constructor.name + " is claiming data group: " + dataGroup.data_group_id);
            claimed = true;
        }

        if(dataGroup.method_group_ids.some(methodId => this.methodGroupIds.includes(methodId))) {
            if(verbose) console.log(this.constructor.name + " is claiming data group: " + dataGroup.data_group_id);
            claimed = true;
        }

        return claimed;
    }

    getSampleNameByPhysicalSampleId(site, physicalSampleId) {
        let sampleName = null;
        site.sample_groups.forEach((sampleGroup) => {
            sampleGroup.physical_samples.forEach((physicalSample) => {
                if(physicalSample.physical_sample_id == physicalSampleId) {
                    sampleName = physicalSample.sample_name;
                }
            });
        });

        return sampleName;
    }

    setData(sites, dataGroups) {
        this.sites = sites;
        this.dataGroups = dataGroups;
    }

    getDataGroups() {
        return this.dataGroups;
    }

    setSites(sites) {
        this.sites = sites;
    }

    getSites() {
        return this.sites;
    }

    getDataAsTable(methodId, sites) {
        let table = {
            name: this.constructor.name,
            columns: [],
            rows: []
        }

        return table;
    }
    
}

export default DataHandlingModule;