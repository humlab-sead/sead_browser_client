import { parse } from 'ol/xml.js';
import DataHandlingModule from './DataHandlingModule.class.js';

class DatingData extends DataHandlingModule {
    constructor(sqs) {
        super(sqs);
        this.methodIds = [14, 151, 148, 38, 150];
        this.methodGroupIds = [19, 20, 3];
        this.excludeMethodIds = [10];
        this.data = [];

        this.excludeColumnsInTable = [
            "relative_age_id",
            "relative_date_id",
            "method_id",
        ];
        this.tableColumnRenameMap = {};
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

    collectKeys(dataGroups) {
        let valueColumnsMap = new Map();
        dataGroups.forEach((dataGroup) => {
            dataGroup.values.forEach((value) => {
                const origKey = value.key;
                // Exclude unwanted keys
                if (this.excludeColumnsInTable.includes(origKey)) return;
                // Use rename if present, otherwise format
                const displayName = this.tableColumnRenameMap[origKey] || this.formatColumnName(origKey);
                valueColumnsMap.set(origKey, displayName);
            });
        });
        return valueColumnsMap;
    }

    getDataAsTable(methodId, sites) {
        let method = this.getMethod(sites, methodId);
        if(!method) {
            return null;
        }

        let table = {
            name: this.getSanitizedMethodName(method.method_name),
            columns: [...this.commonColumns], // Create a copy of commonColumns
            rows: []
        }

        // First, collect all claimed data groups for the given methodId
        let claimedDataGroups = [];
        sites.forEach(site => {
            site.data_groups.forEach((dataGroup) => {
                if(this.claimedDataGroup(dataGroup) && dataGroup.method_ids.includes(methodId)) {
                    claimedDataGroups.push(dataGroup);
                }
            });
        });

        // Now collect keys with renaming/exclusion
        let valueColumnsMap = this.collectKeys(claimedDataGroups);
        let valueColumns = Array.from(valueColumnsMap.entries()); // [ [origKey, displayName], ... ]

        // Add to table columns
        valueColumns.forEach(([origKey, displayName]) => {
            table.columns.push({ header: displayName, key: origKey, width: 30 });
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
                            site.site_name,
                            dataGroup.dataset_name, 
                            this.getSampleNameByPhysicalSampleId(site, value.physical_sample_id), 
                            siteBiblioAsString, 
                            this.getBibliosString(site, dataGroup.biblio_ids), 
                            this.getBibliosString(site, sampleGroupBiblioIds)
                        ];
                        
                        let valueFound = false;
                        valueColumns.forEach(([origKey, displayName]) => {
                            let v = dataGroup.values.find((v) => v.key === origKey);
                            let printValue = v ? v.value : '';
                            if(v) {
                                valueFound = true;
                                printValue = this.sqs.tryParseValueAsNumber(printValue);
                            }
                            row.push(printValue);
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

        this.removeEmptyColumnsFromTable(table, this.commonColumns.length);
        return table;
    }
}

export default DatingData;