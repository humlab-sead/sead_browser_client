class DataHandlingModule {
    constructor(sqs) {
        this.sqs = sqs;
        this.methodIds = [];
        this.methodGroupIds = [];
        this.data = {};

        this.commonColumns = [
            { header: 'Site ID', key: 'site_id', width: 10},
            { header: 'Dataset name', key: 'dataset_name', width: 30},
            { header: 'Sample name', key: 'sample_name', width: 30},
            { header: 'Site references', key: 'site_reference', width: 30},
            { header: 'Dataset references', key: 'dataset_reference', width: 30},
            { header: 'Sample group references', key: 'sample_group_reference', width: 30},
        ];
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

        if(this.excludeMethodIds && dataGroup.method_ids.some(methodId => this.excludeMethodIds.includes(methodId))) {
            if(verbose) console.log(this.constructor.name + " is excluding data group: " + dataGroup.data_group_id);
            claimed = false;
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

    getBiblioForSites(sites) {
        let biblio = new Set();
        sites.forEach((site) => {
            site.datasets.forEach((dataset) => { //we can do this since datasets have already been filtered down to the relevant ones
                site.lookup_tables.biblio.forEach((b) => {
                    if(b.biblio_id == dataset.biblio_id) {
                        b.dataset_id = dataset.dataset_id;
                        b.dataset_name = dataset.dataset_name;
                        biblio.add(b);
                    }
                });
            });
        });

        return Array.from(biblio);
    }

    getBiblioAsTable(sites) {
        let biblio = new Set();
        sites.forEach((site) => {
            let b = this.getDatasetBiblio(site);
            b.forEach((b) => {
                biblio.add(b);
            });
        });

        let biblioTable = {
            name: "Bibliography",
            columns: [],
            rows: []
        };

        if(biblio.size == 0) {
            return null;
        }
        //find the keys in the first biblio object
        let keys = Object.keys(Array.from(biblio)[0]);
        keys.forEach((key) => {
            biblioTable.columns.push({ header: key, key: key, width: 30 });
        });

        //now add the rows
        biblio.forEach((b) => {
            let row = [];
            keys.forEach((key) => {
                row.push(b[key]);
            });
            biblioTable.rows.push(row);
        });

        return biblioTable;
    }

    getContactsAsTable(sites) {
        let contacts = new Set();
        sites.forEach((site) => {
            let c = this.getDatasetContacts(site);
            c.forEach((c) => {
                contacts.add(c);
            });
        });

        return Array.from(contacts);
    }

    getDatasetBiblio(site) {
        let biblio = new Set();
        site.datasets.forEach((dataset) => {
            site.lookup_tables.biblio.forEach((b) => {
                if(b.biblio_id == dataset.biblio_id) {
                    b.dataset_id = dataset.dataset_id;
                    b.dataset_name = dataset.dataset_name;
                    biblio.add(b);
                }
            });
        });

        return Array.from(biblio);
    }

    getDatasetContacts(site) {
        let contacts = new Set();
        site.datasets.forEach((dataset) => {
            site.lookup_tables.dataset_contacts.forEach((c) => {
                if(dataset.contacts.includes(c.contact_id)) {
                    c.dataset_id = dataset.dataset_id;
                    c.dataset_name = dataset.dataset_name;
                    contacts.add(c);
                }
            });
        });

        return Array.from(contacts);
    }

    getDataAsTable(methodId, sites) {
        let table = {
            name: this.constructor.name,
            columns: [],
            rows: []
        }

        return table;
    }

    getSampleGroupBiblioIds(site, physicalSampleId) {
        let sampleGroupBiblioIds = [];
        
        // Use `find` to return the first sample group that contains the physical sample with the matching ID
        let sampleGroup = site.sample_groups.find((sampleGroup) => {
            return sampleGroup.physical_samples.some((sample) => sample.physical_sample_id == physicalSampleId);
        });

        if(sampleGroup) {
            sampleGroup.biblio.forEach((b) => {
                sampleGroupBiblioIds.push(b.biblio_id);
            });
        }
        return sampleGroupBiblioIds;
    }

    getSiteBiblioIds(site) {
        let siteBiblioIds = [];
        site.biblio.forEach((b) => {
            siteBiblioIds.push(b.biblio_id);
        });
        return siteBiblioIds;
    }

    getBiblio(site, biblioId) {
        for(let key in site.lookup_tables.biblio) {
            if(site.lookup_tables.biblio[key].biblio_id == biblioId) {
                return site.lookup_tables.biblio[key];
            }
        }
        return null;
    }
    
    getBibliosString(site, biblioIds) {
        let biblioString = "";
        biblioIds.forEach((biblioId) => {
            let biblio = this.getBiblio(site, biblioId);
            if(biblio) {
                biblioString += biblio.title + ", ";
            }
            else {
                console.warn("Could not find biblio with id " + biblioId);
            }
        });
        if(biblioString.length > 0) {
            biblioString = biblioString.substring(0, biblioString.length - 2);
        }
        return biblioString;
    }
}

export default DataHandlingModule;