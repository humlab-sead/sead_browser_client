import { nanoid } from "nanoid";
import DatasetModule from "./DatasetModule.class";
/*
* Class: DatingToPeriodDataset
*
 */

class IsotopeDataset extends DatasetModule {
	constructor(analysis) {
		super();
		this.sqs = analysis.sqs;
		this.analysis = analysis;
		this.data = analysis.data;
        this.buildIsComplete = true;
        this.methodIds = [175];
    }

    getIsotopeValueSpecifierById(siteData, isotope_value_specifier_id) {
        for(let key in siteData.lookup_tables.isotope_value_specifiers) {
            let isotopeValueSpecifier = siteData.lookup_tables.isotope_value_specifiers[key];
            if(isotopeValueSpecifier.isotope_value_specifier_id == isotope_value_specifier_id) {
                return isotopeValueSpecifier;
            }
        }
        return null;
    }

    getIsotopeTypeById(siteData, isotope_type_id) {
        for(let key in siteData.lookup_tables.isotope_types) {
            let isotopeType = siteData.lookup_tables.isotope_types[key];
            if(isotopeType.isotope_type_id == isotope_type_id) {
                return isotopeType;
            }
        }
        return null;
    }

    getUnitById(siteData, unit_id) {
        for(let key in siteData.lookup_tables.units) {
            let unit = siteData.lookup_tables.units[key];
            if(unit.unit_id == unit_id) {
                return unit;
            }
        }
        return null;
    }

    async makeSection(siteData, sections) {
		let methodDatasets = this.claimDatasets(siteData);
        
        if(methodDatasets.length == 0) {
            return;
        }

        let columns = [
            {
                "dataType": "subtable",
            },
            {
                "dataType": "number",
                "pkey": true,
                "title": "Analysis entitiy id",
                "hidden": true
            },
            {
                "dataType": "string",
                "title": "Sample"
            },
            {
                "dataType": "string",
                "title": "Preparation method"
            }
        ];

        let rows = [];

        let section = this.getSectionByMethodId(this.methodIds[0], sections);			
        if(!section) {
            let method = this.getAnalysisMethodMetaById(siteData, this.methodIds[0]);
            section = {
                "name": this.methodIds[0],
                "title": method.method_name,
                "methodId": this.methodIds[0],
                "methodDescription": method.description,
                "collapsed": true,
                "contentItems": []
            };
            sections.push(section);
        }

        let uniqueDatasetBiblioIds = [];
        let uniqueDatasetContactIds = [];

        methodDatasets.forEach(dataset => {

            uniqueDatasetBiblioIds = uniqueDatasetBiblioIds.concat(dataset.biblio_ids);
            uniqueDatasetContactIds = uniqueDatasetContactIds.concat(dataset.contacts);

            dataset.analysis_entities.forEach(ae => {
                
                let subTable = {
                    /*
                    "meta": {
                        dataStructure: "key-value"
                    },
                    */
                    "expanded": false,
                    "columns": [
                        {
                            "pkey": true,
                            "title": "Isotope ID",
                            hidden: true
                        },
                        {
                            "title": "Measurement"
                        },
                        {
                            "title": "Unit"
                        },
                        {
                            "title": "Value specifier"
                        },
                        {
                            "title": "Isotope type"
                        },
                        {
                            "title": "Standard",
                            hidden: true
                        }
                    ],
                    "rows": []
                };

                ae.isotopes.forEach(isotopeDataPoint => {
                    /*
                    isotopeDataPoint.isotope_id
                    isotopeDataPoint.isotope_measurement_id
                    isotopeDataPoint.isotope_value_specifier_id;
                    isotopeDataPoint.measurement_isotope_type_id;
                    isotopeDataPoint.measurement_method_id;
                    isotopeDataPoint.measurement_standard_id;
                    isotopeDataPoint.measurement_value;
                    isotopeDataPoint.unit_id;
                    */
                    let isotopeValueSpecifier = this.getIsotopeValueSpecifierById(siteData, isotopeDataPoint.isotope_value_specifier_id);
                    let isotopeType = this.getIsotopeTypeById(siteData, isotopeDataPoint.measurement_isotope_type_id);
                    let unit = this.getUnitById(siteData, isotopeDataPoint.unit_id);
                    let measurementValue = isotopeDataPoint.measurement_value ? isotopeDataPoint.measurement_value : "No value";

                    subTable.rows.push([
                        {
                            "type": "cell",
                            "tooltip": "",
                            "value": isotopeDataPoint.isotope_id
                        },
                        {
                            "type": "cell",
                            "tooltip": "",
                            "value": measurementValue
                        },
                        {
                            "type": "cell",
                            "tooltip": unit.description,
                            "value": unit.unit_name
                        },
                        {
                            "type": "cell",
                            "tooltip": isotopeValueSpecifier.description,
                            "value": isotopeValueSpecifier.name
                        },
                        {
                            "type": "cell",
                            "tooltip": isotopeType.description,
                            "value": isotopeType.designation
                        },
                        {
                            "type": "cell",
                            "tooltip": "",
                            "value": isotopeDataPoint.measurement_standard_id
                        }
                    ]);
                    
                });

                let prepMethodString = "";
                let prepMethodDesc = "";
                if(ae.prepMethods.length > 1) {
                    console.warn("More than one prep method for analysis entity", ae.analysis_entity_id, "we do not currently support this");
                }

                if(ae.prepMethods.length > 0) {
                    let prepMethodId = ae.prepMethods[0];
                    siteData.lookup_tables.prep_methods.forEach(prepMethod => {
                        if(prepMethod.method_id == prepMethodId) {
                            prepMethodString = prepMethod.method_name;
                            prepMethodDesc = prepMethod.description;
                        }
                    });
                }

                let row = [
                    {
                        "type": "subtable",
                        "value": subTable
                    },
                    {
                        "type": "cell",
                        "tooltip": "",
                        "value": ae.analysis_entity_id
                    },
                    {
                        "type": "cell",
                        "tooltip": "",
                        "value": ae.physical_sample_id
                    },
                    {
                        "type": "cell",
                        "tooltip": prepMethodDesc,
                        "value": prepMethodString
                    }
                ];

                rows.push(row);
            });
        });

        uniqueDatasetBiblioIds = uniqueDatasetBiblioIds.filter((value, index, self) => {
            return self.indexOf(value) === index;
        });
        uniqueDatasetContactIds = uniqueDatasetContactIds.filter((value, index, self) => {
            return self.indexOf(value) === index;
        });

        let method = this.analysis.getMethodMetaDataById(this.methodIds[0]);
        
        let contentItem = {
            "name": nanoid(), //Normally: analysis.datasetId
            "title": method.method_name, //Normally this would be: analysis.datasetName
            "datasetReference": this.sqs.renderBiblioReference(siteData, uniqueDatasetBiblioIds),
            "datasetReferencePlain": this.sqs.renderBiblioReference(siteData, uniqueDatasetBiblioIds, false),
            "datasetContacts": this.sqs.renderContacts(siteData, uniqueDatasetContactIds),
            "data": {
                "columns": columns,
                "rows": rows
            },
            "renderOptions": [
                {
                    "name": "Spreadsheet",
                    "selected": true,
                    "type": "table",
                }
            ]
        };

        section.contentItems.push(contentItem);
    }

    /*
	* Function: isBuildComplete
	*/
	isBuildComplete() {
		return this.buildIsComplete;
	}

	/*
	* Function: destroy
	*/
	destroy() {
	}

}

export { IsotopeDataset as default }