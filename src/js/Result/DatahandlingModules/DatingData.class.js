import { parse } from 'ol/xml.js';
import DataHandlingModule from './DataHandlingModule.class.js';

class DatingData extends DataHandlingModule {
    constructor(sqs) {
        super(sqs);
        this.methodIds = [14, 151, 148, 38, 150];
        this.methodGroupIds = [19, 20, 3];
        this.excludeMethodIds = [10];
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
            columns: this.commonColumns,
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

                        let siteRefStr = siteBiblioIds.length > 0 ? siteBiblioIds.join(", ") : "";
                        let datasetRefStr = dataGroup.biblio_ids.length > 0 ? dataGroup.biblio_ids.join(", ") : "";
                        let sampleGroupBiblioIds = this.getSampleGroupBiblioIds(site, value.physical_sample_id);
                        let sampleGroupRefStr = sampleGroupBiblioIds.length > 0 ? sampleGroupBiblioIds.join(", ") : "";

                        let row = [site.site_id, dataGroup.dataset_name, this.getSampleNameByPhysicalSampleId(site, dataGroup.physical_sample_id), siteRefStr, datasetRefStr, sampleGroupRefStr];
                        let valueFound = false;
                        valueColumns.forEach((valueColumn) => {
                            let v = dataGroup.values.find((v) => this.formatColumnName(v.key) === valueColumn);
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

export default DatingData;