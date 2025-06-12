import DataHandlingModule from './DataHandlingModule.class.js';

class IsotopeData extends DataHandlingModule {
    constructor(sqs) {
        super(sqs);
        this.methodIds = [175];
        this.data = [];
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
            let siteBiblioIds = this.getSiteBiblioIds(site);
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
            site.data_groups.forEach((dataGroup) => {
                if(this.claimedDataGroup(dataGroup)) {

                    dataGroup.values.sort((a, b) => {
                        return a.physical_sample_id - b.physical_sample_id;
                    });

                    /*
                    let row = [site.site_id, dataGroup.sample_name];
                    let valueFound = false;
                    valueColumns.forEach((valueColumn) => {
                        let value = dataGroup.values.find((value) => value.key === valueColumn);
                        if(value) {
                            valueFound = true;
                        }
                        if(value && value.valueType == 'complex' && value.methodId == 10) {
                            let rowValue = "";
                            if(value.value) {
                                rowValue = this.dendroLib.renderDendroDatingAsString(value.value, site, false, this.sqs);
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
                    */
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

export default IsotopeData;