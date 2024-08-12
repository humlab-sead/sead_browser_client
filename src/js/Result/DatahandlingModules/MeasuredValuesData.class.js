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

    getDataAsTableNEW(methodId, sites) {
        let method = this.getMethod(sites, methodId);

        let table = {
            name: method.method_name,
            columns: [
                { header: 'Site ID', key: 'site_id', width: 10},
				{ header: 'Dataset name', key: 'dataset_name', width: 30},
				{ header: 'Sample name', key: 'sample_name', width: 30},
            ],
            rows: []
        }

        if(method.method_id == 33) {
            table.columns.push({ header: 'Unburned', key: 'unburned', width: 30});
            table.columns.push({ header: 'Burned', key: 'burned', width: 30});
        }




        
        let unburnedSeries = [];
        let burnedSeries = [];
        //since this is ms - there should be pars of values/AEs, one with a prepMethod and one without, both connected to the sample physical_sample
        //these needs to be paired up in 2 series

        dataset.analysis_entities.forEach((ae) => {
            if(ae.prepMethods.length > 0 && ae.prepMethods.includes(82)) {
                burnedSeries.push([
                    ae.physical_sample_id,
                    parseFloat(ae.measured_values[0].measured_value)
                ]);
            } else {
                unburnedSeries.push([
                    ae.physical_sample_id,
                    parseFloat(ae.measured_values[0].measured_value)
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

        physicalSampleIds.forEach((physicalSampleId) => {
            let unburnedValue = "N/A";
            let burnedValue = "N/A";

            //find sample name based on physical_sample_id
            let physicalSample = this.getPhysicalSampleByPhysicalSampleId(site, physicalSampleId)
            let sampleName = physicalSample.sample_name;
            
            //find the unburned value
            let unburnedSeriesItem = unburnedSeries.find((seriesItem) => {
                return seriesItem[0] == physicalSampleId;
            });
            if(unburnedSeriesItem) {
                unburnedValue = unburnedSeriesItem[1];
            }

            //find the burned value
            let burnedSeriesItem = burnedSeries.find((seriesItem) => {
                return seriesItem[0] == physicalSampleId;
            });
            if(burnedSeriesItem) {
                burnedValue = burnedSeriesItem[1];
            }
        });
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

    getDataAsTable(methodId, sites) {
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

                            let row = [site.site_id, dataGroup.dataset_name, physicalSample.sample_name, seriesItem[1], burnedSibling ? burnedSibling[1] : "N/A"];
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