import DataHandlingModule from './DataHandlingModule.class.js';
class AbundanceData extends DataHandlingModule {
    constructor(sqs) {
        super(sqs);
        this.methodIds = [3, 6, 8, 15, 40, 111];
        this.data = [];
    }

    getTaxonByTaxonId(site, taxonId) {
        //use this.lookupTables.taxa to get the taxon 
        let taxon = site.lookup_tables.taxa.find((taxon) => taxon.taxon_id == taxonId);
        return taxon;
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

        table.columns = table.columns.concat([
            { header: 'Taxon', key: 'taxon', width: 30},
            { header: 'Abundance', key: 'abundance', width: 30},
            { header: 'Modifications', key: 'modifications', width: 30},
            { header: 'Element type', key: 'element_type', width: 30}
        ]);

        sites.forEach((site) => {

            let siteBiblioIds = this.getSiteBiblioIds(site);
            let siteBiblioAsString = this.getBibliosString(site, siteBiblioIds);

            site.data_groups.forEach((dataGroup) => {
                if(this.claimedDataGroup(dataGroup) && dataGroup.method_ids.includes(methodId)) {

                    dataGroup.values.forEach((value) => {

                        let sampleGroupBiblioIds = this.getSampleGroupBiblioIds(site, value.physical_sample_id);

                        let row = [
                            site.site_id, 
                            dataGroup.dataset_name, 
                            this.getSampleNameByPhysicalSampleId(site, value.physical_sample_id), 
                            siteBiblioAsString, 
                            this.getBibliosString(site, dataGroup.biblio_ids), 
                            this.getBibliosString(site, sampleGroupBiblioIds)
                        ];

                        if(value.valueType == 'complex') {
                            let taxon = this.getTaxonByTaxonId(site, value.data.taxon_id);
                            if(!taxon) {
                                console.warn("Could not find taxon with id " + value.data.taxon_id);
                                row.push(value.data.taxon_id);
                            }
                            else {
                                row.push(this.sqs.formatTaxon(taxon, null, false));
                            }
                            
                            let modificationsString = "";
                            value.data.modifications.forEach((modification) => {
                                site.lookup_tables.abundance_modifications.forEach((modType) => {
                                    if(modType.modification_type_id == modification.modification_type_id) {
                                        modificationsString += modType.modification_type_name + ", ";
                                    }
                                });
                            });
                            if(modificationsString.length > 0) {
                                modificationsString = modificationsString.substring(0, modificationsString.length - 2);
                            }

                            let abundanceElementString = "";
                            site.lookup_tables.abundance_elements.forEach((element) => {
                                if(element.abundance_element_id == value.data.abundance_element_id) {
                                    abundanceElementString = element.element_name;
                                }
                            });

                            row.push(value.data.abundance);
                            row.push(modificationsString);
                            row.push(abundanceElementString);
                        }

                        table.rows.push(row);
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

export default AbundanceData;