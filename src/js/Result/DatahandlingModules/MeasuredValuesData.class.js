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

    getPrepMethodString(site, prepMethodIds) {
        //look in site.lookup_tables.prep_methods
        let prepMethodString = "";
        site.lookup_tables.prep_methods.forEach((prepMethod) => {
            if(prepMethodIds.includes(prepMethod.method_id)) {
                prepMethodString += prepMethod.method_name + ", ";
            }
        });

        if(prepMethodString.length > 0) {
            prepMethodString = prepMethodString.substring(0, prepMethodString.length - 2);
        }
        return prepMethodString;
    }

    getDataAsTable(methodId, sites) {
        let method = this.getMethod(sites, methodId);

        let table = {
            name: method.method_name,
            columns: [],
            rows: []
        }

        this.commonColumns.forEach((column) => {
            table.columns.push(column);
        });
        
        let series = [];
        let plainValueSeries = [];
        let unburnedSeries = [];
        let burnedSeries = [];
        //there should be pars of values/AEs, one with a prepMethod 82 and one without, both connected to the sample physical_sample
        //these needs to be paired up in 2 series

        let valueGroups = [];
        let allSiteBiblioIds = new Set();
        sites.forEach((site) => {
            site.data_groups.forEach((dataGroup) => {
                if(this.claimedDataGroup(dataGroup)) {
                    
                    dataGroup.biblio_ids.forEach((biblioId) => {
                        allSiteBiblioIds.add(biblioId);
                    });

                    //group values by physical_sample_id
                    
                    dataGroup.values.forEach((value) => {
                        let group = valueGroups.find((group) => group.physical_sample_id == value.physical_sample_id);
                        if(!group) {
                            group = {
                                physical_sample_id: value.physical_sample_id,
                                site: site,
                                values: []
                            }
                            valueGroups.push(group);
                        }
                        group.values.push(value);
                    });

                }
            });
        });

        let valueColumns = new Set();
        valueColumns.add("Value");
        valueGroups.forEach((group) => {
            group.values.forEach((value) => {
                if(value.prep_methods.length > 0) {
                    //look up this prep_method
                    let prepMethod = this.getPrepMethodString(group.site, value.prep_methods);
                    valueColumns.add(prepMethod);
                }
            });
        });

        Array.from(valueColumns).forEach((valueColumn) => {
            table.columns.push({ header: valueColumn, key: valueColumn, width: 30 });
        });

        valueGroups.forEach((group) => {

            let physicalSample = this.getPhysicalSampleByPhysicalSampleId(group.site, group.physical_sample_id);
            let sampleGroupBiblioIds = this.getSampleGroupBiblioIds(group.site, group.physical_sample_id);

            let siteBiblioIds = this.getSiteBiblioIds(group.site);
            let siteBiblioAsString = this.getBibliosString(group.site, siteBiblioIds);

            let datasetBiblioIds = new Set();
            let datasetName = "";
            group.values.forEach((value) => {
                //find the dataset with this analysis_entity_id
                group.site.datasets.forEach((dataset) => {
                    if(dataset) {
                        dataset.analysis_entities.forEach((ae) => {
                            if(ae.analysis_entity_id == value.analysis_entity_id) {
                                datasetBiblioIds.add(ae.biblio_id);
                                datasetName = dataset.dataset_name; //we assume that all values in the group belongs to the same dataset
                            }
                        });
                    }
                });
            });

            let row = [
                group.site.site_id, 
                datasetName, //datasetname
                physicalSample.sample_name, 
                siteBiblioAsString, //site references
                this.getBibliosString(group.site, Array.from(datasetBiblioIds)), //dataset references
                this.getBibliosString(group.site, sampleGroupBiblioIds) //sample groups references
            ];

            //a value group is basically the last columns of a row, and we need to fill out all the columns we have in the valueColumns set
            Array.from(valueColumns).forEach((valueColumn) => {
            
                if(valueColumn == "Value") {
                    let value = group.values.find((v) => {
                        return v.prep_methods.length == 0;
                    });
                    row.push(value ? value.value : "");
                    return;
                }

                let value = group.values.find((v) => {
                    let prepMethod = this.getPrepMethodString(group.site, v.prep_methods);
                    return prepMethod === valueColumn;
                });

                row.push(value ? value.value : "");
            });

            table.rows.push(row);
        });

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
}

export default MeasuredValuesData;