import { parse } from 'ol/xml.js';
import DataHandlingModule from './DataHandlingModule.class.js';

class EntityAgesData extends DataHandlingModule {
    constructor(sqs) {
        super(sqs);
        this.methodIds = [176];
        this.methodGroupIds = [];
        this.data = [];
    }

    setData(data) {
        this.data = data;
    }

    formatColumnName(string) {
        //if it is a number, return it as is
        if(!isNaN(string)) {
            return string;
        }
        let keyName = string.replace(/_/g, ' ');
        keyName = keyName.charAt(0).toUpperCase() + keyName.slice(1);
        return keyName;
    }

    getDataAsTable(methodId, sites) {
        let method = this.getMethod(sites, methodId);
        
        if(!method) {
            return null;
        }

        let table = {
            name: method.method_name,
            columns: [...this.commonColumns], // Create a copy of commonColumns
            rows: []
        }

        let valueColumnsSet = new Set();
        sites.forEach(site => {
            site.data_groups.forEach((dataGroup) => {
                if(this.claimedDataGroup(dataGroup) && dataGroup.method_ids.includes(methodId)) {
                    dataGroup.values.forEach((value) => {
                        valueColumnsSet.add(this.formatColumnName(value.key));
                    });
                }
            });
        });

        let valueColumns = Array.from(valueColumnsSet);
        //add to table columns
        valueColumns.forEach((valueColumn) => {
            table.columns.push({ header: valueColumn, key: valueColumn, width: 30 });
        });

        sites.forEach((site) => {
            let siteBiblioIds = this.getSiteBiblioIds(site);
            let siteBiblioAsString = this.getBibliosString(site, siteBiblioIds);

            site.data_groups.forEach((dataGroup) => {
                if(this.claimedDataGroup(dataGroup)) {

                    dataGroup.values.sort((a, b) => {
                        return a.physical_sample_id - b.physical_sample_id;
                    });

                    let processedSampleIds = [];
                    dataGroup.values.forEach((value) => {
                        if(processedSampleIds.includes(value.physical_sample_id)) {
                            return;
                        }

                        let sampleGroupBiblioIds = this.getSampleGroupBiblioIds(site, value.physical_sample_id);
                        let row = [
                            site.site_id, 
                            dataGroup.dataset_name,
                            this.getSampleNameByPhysicalSampleId(site, value.physical_sample_id), 
                            siteBiblioAsString, 
                            this.getBibliosString(site, dataGroup.biblio_ids), 
                            this.getBibliosString(site, sampleGroupBiblioIds)
                        ];

                        let valueFound = false;
                        valueColumns.forEach((valueColumn) => {
                            let v = dataGroup.values.find((v) => (this.formatColumnName(v.key) === valueColumn && value.physical_sample_id === v.physical_sample_id));
                            let printValue = v ? v.value : '';
                            if(value) {
                                valueFound = true;
                                printValue = this.sqs.tryParseValueAsNumber(printValue);
                            }

                            value.key = this.formatColumnName(value.key);

                            row.push(value ? printValue : '');
                        });

                        if(valueFound) {
                            table.rows.push(row);
                        }

                        processedSampleIds.push(value.physical_sample_id);
                    });

                }
            });
        });

        if(table.rows.length == 0) {
            return null;
        }
        return table;
    }
}

export default EntityAgesData;