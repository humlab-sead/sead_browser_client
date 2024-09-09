import DataHandlingModule from './DataHandlingModule.class.js';

class MeasuredValuesData extends DataHandlingModule {
    constructor(sqs) {
        super(sqs);
        this.methodIds = [];
        this.methodGroupIds = [2];
        this.data = [];
    }
    
    getPairsOfValues(values, prepMethodId = 82, filterByPrepMethod = true) {
        let pairs = [];
    
        // Filter the values based on the presence or absence of prep_method 
        let filteredValues = values.filter(value => {
            return filterByPrepMethod ? value.prep_methods.includes(prepMethodId) : !value.prep_methods.includes(prepMethodId);
        });
    
        // Outer loop: iterate over each filtered value item
        filteredValues.forEach((value, index) => {
            // Inner loop: find the sibling with the matching key
            for (let i = 0; i < values.length; i++) {
                if (i !== index && values[i].key === value.key) {
                    // Ensure we are pairing with the opposite type (based on prep_method )
                    if (filterByPrepMethod && !values[i].prep_methods.includes(prepMethodId)) {
                        pairs.push([value, values[i]]);
                        break; // Stop searching once a pair is found
                    } else if (!filterByPrepMethod && values[i].prep_methods.includes(prepMethodId)) {
                        pairs.push([values[i], value]);
                        break; // Stop searching once a pair is found
                    }
                }
            }
        });
    
        return pairs;
    }

    getDataAsTable(methodId, sites) {
        console.log(methodId);
        let method = this.getMethod(sites, methodId);

        let table = {
            name: method.method_name,
            columns: [],
            rows: []
        }

        this.commonColumns.forEach((column) => {
            table.columns.push(column);
        });
        
        let plainValueSeries = [];
        let unburnedSeries = [];
        let burnedSeries = [];
        //since this is ms - there should be pars of values/AEs, one with a prepMethod and one without, both connected to the sample physical_sample
        //these needs to be paired up in 2 series

        let allSiteBiblioIds = new Set();
        sites.forEach((site) => {
            let siteBiblioIds = this.getSiteBiblioIds(site);
            site.data_groups.forEach((dataGroup) => {
                if(this.claimedDataGroup(dataGroup)) {
                    console.log(dataGroup);
                    
                    dataGroup.biblio_ids.forEach((biblioId) => {
                        allSiteBiblioIds.add(biblioId);
                    });

                    dataGroup.values.forEach((value) => {

                        let unit = "";
                        site.lookup_tables.methods.forEach((method) => {
                            if(method.method_id == methodId) {
                                site.lookup_tables.units.forEach((unitItem) => {
                                    if(unitItem.unit_id == method.unit_id) {
                                        unit = unitItem.unit_abbrev;
                                    }
                                });
                            }
                        });
                        

                        if(value.prep_methods.length > 0) {
                            if(value.prep_methods.includes(82)) {
                                burnedSeries.push({
                                    physical_sample_id: value.physical_sample_id,
                                    value: parseFloat(value.value)+unit,
                                    dataGroup: dataGroup,
                                    site: site
                                });
                            } else {
                                unburnedSeries.push({
                                    physical_sample_id: value.physical_sample_id,
                                    value: parseFloat(value.value)+unit,
                                    dataGroup: dataGroup,
                                    site: site 
                                });
                            }
                        }
                        else {
                            plainValueSeries.push({
                                physical_sample_id: value.physical_sample_id,
                                value: parseFloat(value.value)+unit,
                                dataGroup: dataGroup,
                                site: site
                            });
                        }
                    });
                }
            });
        });

        //sort the series (by physical_sample_id)
        unburnedSeries.sort((a, b) => {
            return a.physical_sample_id - b.physical_sample_id;
        });
        burnedSeries.sort((a, b) => {
            return a.physical_sample_id - b.physical_sample_id;
        });
        plainValueSeries.sort((a, b) => {
            return a.physical_sample_id - b.physical_sample_id;
        });

        console.log(unburnedSeries);
        console.log(burnedSeries);
        console.log(plainValueSeries);

        if(plainValueSeries.length > 0) {
            table.columns.push({ header: 'Value', key: 'value', width: 30});
        }
        if(unburnedSeries.length > 0) {
            table.columns.push({ header: 'Unburned', key: 'unburned', width: 30});
        }
        if(burnedSeries.length > 0) {
            table.columns.push({ header: 'Burned', key: 'burned', width: 30});
        }

        plainValueSeries.forEach((seriesItem) => {
            let dataGroup = seriesItem.dataGroup;
            let site = seriesItem.site;
            let physicalSample = this.getPhysicalSampleByPhysicalSampleId(site, seriesItem.physical_sample_id);

            let siteRefStr = Array.from(allSiteBiblioIds).length > 0 ? Array.from(allSiteBiblioIds).join(", ") : "";
            let datasetRefStr = dataGroup.biblio_ids.length > 0 ? dataGroup.biblio_ids.join(", ") : "";
            let sampleGroupBiblioIds = this.getSampleGroupBiblioIds(site, seriesItem.physical_sample_id);
            let sampleGroupRefStr = sampleGroupBiblioIds.length > 0 ? sampleGroupBiblioIds.join(", ") : "";

            let row = [site.site_id, seriesItem.dataGroup.dataset_name, physicalSample.sample_name, siteRefStr, datasetRefStr, sampleGroupRefStr, seriesItem.value];
            if(unburnedSeries.length > 0) {
                row.push("");
            }
            if(burnedSeries.length > 0) {
                row.push("");
            }
            
            table.rows.push(row);
        });

        unburnedSeries.forEach((seriesItem) => {
            let dataGroup = seriesItem.dataGroup;
            let site = seriesItem.site;
            let physicalSample = this.getPhysicalSampleByPhysicalSampleId(site, seriesItem.physical_sample_id);

            let burnedSibling = burnedSeries.find((s) => s.physical_sample_id == seriesItem.physical_sample_id);

            let siteRefStr = Array.from(allSiteBiblioIds).length > 0 ? Array.from(allSiteBiblioIds).join(", ") : "";
            let datasetRefStr = dataGroup.biblio_ids.length > 0 ? dataGroup.biblio_ids.join(", ") : "";
            let sampleGroupBiblioIds = this.getSampleGroupBiblioIds(site, seriesItem.physical_sample_id);
            let sampleGroupRefStr = sampleGroupBiblioIds.length > 0 ? sampleGroupBiblioIds.join(", ") : "";

            let row = [site.site_id, seriesItem.dataGroup.dataset_name, physicalSample.sample_name, siteRefStr, datasetRefStr, sampleGroupRefStr];
            if(plainValueSeries.length > 0) {
                row.push("");
            }

            row.push(seriesItem.value);
            if(burnedSeries.length > 0) {
                row.push(burnedSibling ? burnedSibling.value : "N/A");
            }

            table.rows.push(row);
        });

        burnedSeries.forEach((seriesItem) => {
            let dataGroup = seriesItem.dataGroup;
            let site = seriesItem.site;
            let physicalSample = this.getPhysicalSampleByPhysicalSampleId(site, seriesItem.physical_sample_id);

            let unburnedSibling = unburnedSeries.find((s) => s.physical_sample_id == seriesItem.physical_sample_id);

            let siteRefStr = Array.from(allSiteBiblioIds).length > 0 ? Array.from(allSiteBiblioIds).join(", ") : "";
            let datasetRefStr = dataGroup.biblio_ids.length > 0 ? dataGroup.biblio_ids.join(", ") : "";
            let sampleGroupBiblioIds = this.getSampleGroupBiblioIds(site, seriesItem.physical_sample_id);
            let sampleGroupRefStr = sampleGroupBiblioIds.length > 0 ? sampleGroupBiblioIds.join(", ") : "";

            let row = [site.site_id, seriesItem.dataGroup.dataset_name, physicalSample.sample_name, siteRefStr, datasetRefStr, sampleGroupRefStr];

            if(plainValueSeries.length > 0) {
                row.push("");
            }

            if(unburnedSeries.length > 0) {
                row.push(unburnedSibling ? unburnedSibling.value : "");
            }

            row.push(seriesItem.value);

            table.rows.push(row);
        });

        console.log(table);

        if(table.rows.length == 0) {
            return null;
        }
        return table;
    }
    
    getPhysicalSampleByPhysicalSampleId(siteData, physicalSampleId) {
		let selectedSample = null;
		siteData.sample_groups.forEach((sg) => {
			sg.physical_samples.forEach((sample) => {
				if(sample.physical_sample_id == physicalSampleId) {
					selectedSample = sample;
				}
			});
		});
		return selectedSample;
	}

    getDataAsTableOLD(methodId, sites) {
        let method = this.getMethod(sites, methodId);

        if(!method) {
            return null;
        }

        let table = {
            name: method.method_name,
            columns: [
                { header: 'Site ID', key: 'site_id', width: 10},
				{ header: 'Dataset name', key: 'dataset_name', width: 30},
				{ header: 'Sample name', key: 'sample_name', width: 30},
                { header: 'Reference ID', key: 'reference', width: 30}
            ],
            rows: []
        }

        if(method.method_id == 33) {
            table.columns.push({ header: 'Unburned', key: 'unburned', width: 30});
            table.columns.push({ header: 'Burned', key: 'burned', width: 30});
        }
        else {
            table.columns.push({ header: 'Value', key: 'taxon', width: 30});
        }

        let unitCellValue = "";
        if(method.unit) {
            unitCellValue = method.unit.unit_abbrev;
            table.columns.push({ header: 'Unit', key: 'unit', width: 10});
        }

        sites.forEach((site) => {
            site.data_groups.forEach((dataGroup) => {
                if(this.claimedDataGroup(dataGroup) && dataGroup.method_ids.includes(methodId)) {
                    if(method.method_id == 33) {
                        let unburnedSeries = [];
                        let burnedSeries = [];
                        //since this is ms - there should be pars of values/AEs, one with a prepMethod and one without, both connected to the sample physical_sample
                        //these needs to be paired up in 2 series

                        dataGroup.values.forEach((value) => {
                            if(value.prep_methods.length > 0 && value.prep_methods.includes(82)) {
                                burnedSeries.push([
                                    value.physical_sample_id,
                                    parseFloat(value.value)
                                ]);
                            } else {
                                unburnedSeries.push([
                                    value.physical_sample_id,
                                    parseFloat(value.value)
                                ]);
                            }
                        });

                        //sort the series (by physical_sample_id)
                        unburnedSeries.sort((a, b) => {
                            return a[0] - b[0];
                        });
                        burnedSeries.sort((a, b) => {
                            return a[0] - b[0];
                        });

                        let physicalSampleIds = new Set();
                        unburnedSeries.forEach((seriesItem) => {
                            physicalSampleIds.add(seriesItem[0]);
                        });
                        burnedSeries.forEach((seriesItem) => {
                            physicalSampleIds.add(seriesItem[0]);
                        });

                        unburnedSeries.forEach((seriesItem) => {
            
                            //find sample name based on physical_sample_id
                            let physicalSample = this.getPhysicalSampleByPhysicalSampleId(site, seriesItem[0]);
                            
                            let burnedSibling = burnedSeries.find((s) => s[0] == seriesItem[0]);

                            let refStr = dataGroup.biblio_ids.length > 0 ? dataGroup.biblio_ids.join(", ") : "";
                            let row = [site.site_id, dataGroup.dataset_name, physicalSample.sample_name, refStr, seriesItem[1], burnedSibling ? burnedSibling[1] : "N/A"];
                            table.rows.push(row);
                        });

                        /*
                        //create pairs of values where values that have the same key are pairs and one should have prep_methods 82 and the other no prep_methods
                        let valuePairs = this.getPairsOfValues(dataGroup.values);
                        
                        if(valuePairs.length == 0) {
                            //not all MS values have a burned/unburned pair
                        }

                        valuePairs.forEach((pair) => {

                            let burned = pair[0].prep_methods.includes(82) ? pair[0] : pair[1];
                            let unburned = pair[0].prep_methods.includes(82) ? pair[1] : pair[0];

                            let row = [site.site_id, dataGroup.dataset_name, unburned.sample_name, unburned.value, burned.value];
                            if(method.unit) {
                                row.push(unitCellValue);
                            }
                            table.rows.push(row);
                        });
                        */
                    }
                    else {
                        dataGroup.values.forEach((value) => {
                            let row = [site.site_id, dataGroup.dataset_name, value.sample_name, value.value];
    
                            if(method.unit) {
                                row.push(unitCellValue);
                            }
                            table.rows.push(row);
                        });
                    }

                }
            });
        });

        if(table.rows.length == 0) {
            return null;
        }
        return table;
    }
}

export default MeasuredValuesData;