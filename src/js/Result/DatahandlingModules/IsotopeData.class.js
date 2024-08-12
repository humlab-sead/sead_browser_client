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
            name: method.method_name,
            columns: [],
            rows: []
        }

        if(table.rows.length == 0) {
            return null;
        }
        return table;
    }
}

export default IsotopeData;