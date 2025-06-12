import DataHandlingModule from './DataHandlingModule.class.js';
import DendroLib from '../../../../lib/sead_common/DendroLib.class.js'

class DendroCeramicsData extends DataHandlingModule {
    constructor(sqs) {
        super(sqs);
        this.methodIds = [10, 171, 172];
        this.data = [];
        this.dendroLib = new DendroLib();
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
        
        let valueColumnsSet = new Set();
        sites.forEach(site => {
            site.data_groups.forEach((dataGroup) => {
                if(this.claimedDataGroup(dataGroup) && dataGroup.method_ids.includes(methodId)) {
                    dataGroup.values.forEach((value) => {
                        valueColumnsSet.add(value.key);
                    });
                }
            });
        });

        let valueColumns = Array.from(valueColumnsSet);
        //add to table columns
        valueColumns.forEach((valueColumn) => {
            table.columns.push({ header: valueColumn, key: valueColumn, width: 30 });
        });


        sites.forEach(site => {
            let siteBiblioIds = this.getSiteBiblioIds(site);
            let siteBiblioAsString = this.getBibliosString(site, siteBiblioIds);

            site.data_groups.forEach((dataGroup) => {
                if(this.claimedDataGroup(dataGroup)) {
                    let sampleGroupBiblioIds = this.getSampleGroupBiblioIds(site, dataGroup.physical_sample_id);

                    let row = [
                        site.site_id, 
                        site.site_name,
                        "",  //dataset name
                        dataGroup.sample_name, 
                        siteBiblioAsString, 
                        this.getBibliosString(site, dataGroup.biblio_ids ? dataGroup.biblio_ids : []), 
                        this.getBibliosString(site, sampleGroupBiblioIds)
                    ];

                    let valueFound = false;
                    valueColumns.forEach((valueColumn) => {
                        let value = dataGroup.values.find((value) => value.key === valueColumn);
                        if(value) {
                            valueFound = true;
                        }
                        if(value && value.valueType == 'complex' && value.methodId == 10) {
                            let rowValue = "";
                            if(value.data) {
                                rowValue = this.dendroLib.renderDendroDatingAsString(value.data, site, false, this.sqs);
                            }
                            row.push(rowValue);
                        }
                        else {
                            row.push(value ? value.value : '');
                        }
                    });

                    if(valueFound) {
                        table.rows.push(row);
                    }
                    
                }
            });
        });
    
        if(table.rows.length == 0) {
            return null;
        }
        /*
        sites.forEach((site) => {
            let biblio = this.getDatasetBiblio(site);
            let contacts = this.getDatasetContacts(site);
            console.log(biblio, contacts);
        });
        */

        this.removeEmptyColumnsFromTable(table, this.commonColumns.length);
        return table;
    }

    getDataAsTableOLD() {
        let dataGroups = this.getDataGroups();

        let table = {
            name: this.constructor.name,
            columns: [
                { header: 'Site ID', key: 'site_id', width: 10},
				{ header: 'Sample name', key: 'sample_name', width: 30},
            ],
            rows: []
        }

        let valueColumnsSet = new Set();

        dataGroups.forEach((dataGroup) => {
            dataGroup.values.forEach((value) => {
                valueColumnsSet.add(value.key);
            });
        });

        let valueColumns = Array.from(valueColumnsSet);
        //add to table columns
        valueColumns.forEach((valueColumn) => {
            table.columns.push({ header: valueColumn, key: valueColumn, width: 30 });
        });

        dataGroups.forEach((dataGroup) => {

            let row = [dataGroup.site_id, dataGroup.sample_name];
            valueColumns.forEach((valueColumn) => {
                let value = dataGroup.values.find((value) => value.key === valueColumn);
                if(value && value.valueType == 'complex' && value.methodId == 10) {
                    //here we can assume this is a dendro date, and format it as such
                    let site = {
                        lookup_tables: this.lookupTables
                    };
                    row.push(this.dendroLib.renderDendroDatingAsString(value.value, site, false, this.sqs));
                }
                else {
                    row.push(value ? value.value : '');
                }
            });

            table.rows.push(row);
        });

        return table;
    }
}

export default DendroCeramicsData;