class DendroLib {
    constructor(attemptUncertainDatingCaculations = true, useLocalColors = true) {
        this.attemptUncertainDatingCaculations = attemptUncertainDatingCaculations;
        this.useLocalColors = useLocalColors;

        this.translationTable = [
            {
                name: "Tree species", //Original (legacy name)
                title: "Tree species", //The proper name it should be called (subject to change)
                dendroLookupId: 121,
            },
            {
                name: "Tree rings",
                title: "Tree rings",
                dendroLookupId: 122
            },
            {
                name: "earlywood/late wood",
                title: "earlywood/late wood",
                dendroLookupId: 123
            },
            {
                name: "No. of radius ",
                title: "No. of radius ",
                dendroLookupId: 124
            },
            {
                name: "3 time series",
                title: "3 time series",
                dendroLookupId: 125
            },
            {
                name: "Sapwood (Sp)",
                title: "Sapwood (Sp)",
                dendroLookupId: 126
            },
            {
                name: "Bark (B)",
                title: "Bark (B)",
                dendroLookupId: 127
            },
            {
                name: "Waney edge (W)",
                title: "Waney edge (W)",
                dendroLookupId: 128
            },
            {
                name: "Pith (P)",
                title: "Pith (P)",
                dendroLookupId: 129
            },
            {
                name: "Tree age ≥",
                title: "Tree age ≥",
                dendroLookupId: 130
            },
            {
                name: "Tree age ≤",
                title: "Tree age ≤",
                dendroLookupId: 131
            },
            {
                name: "Inferred growth year ≥",
                title: "Inferred growth year ≥",
                dendroLookupId: 132
            },
            {
                name: "Inferred growth year ≤",
                title: "Inferred growth year ≤",
                dendroLookupId: 133
            },
            {
                name: "Estimated felling year",
                title: "Estimated felling year",
                dendroLookupId: 134
            },
            {
                name: "Estimated felling year, lower accuracy",
                title: "Estimated felling year, lower accuracy",
                dendroLookupId: 135
            },
            {
                name: "Provenance",
                title: "Provenance",
                dendroLookupId: 136
            },
            {
                name: "Outermost tree-ring date",
                title: "Outermost tree-ring date",
                dendroLookupId: 137
            },
            {
                name: "Not dated",
                title: "Not dated",
                dendroLookupId: 138
            },
            {
                name: "Date note",
                title: "Date note",
                dendroLookupId: 139
            },
            {
                name: "Provenance comment",
                title: "Provenance comment",
                dendroLookupId: 140
            },
        ];
    }

    dbRowsToSampleDataObjects(measurementRows, datingRows) {
        let sampleDataObjects = [];

        //Find unique samples
        let physicalSampleIds = [];
        measurementRows.forEach(row => {
            physicalSampleIds.push(row.physical_sample_id);
        });
        physicalSampleIds = physicalSampleIds.filter((value, index, self) => {
            return self.indexOf(value) === index;
        });

        physicalSampleIds.forEach(physicalSampleId => {
            let sampleDataObject = {
                sampleName: "",
                sampleTaken: "",
                physicalSampleId: physicalSampleId,
                datasets: []
            }

            measurementRows.forEach(m2 => {
                if(physicalSampleId == m2.physical_sample_id) {
                    //Convert value to an integer if possible, otherwise leave as string
                    let value = m2.measurement_value;
                    let intVal = parseInt(m2.measurement_value);
                    if(!isNaN(intVal)) {
                        value = intVal;
                    }

                    sampleDataObject.sampleName = m2.sample;

                    sampleDataObject.datasets.push({
                        id: m2.dendro_lookup_id,
                        label: m2.date_type,
                        value: value
                    });
                }
            })

            datingRows.forEach(m2 => {
                if(physicalSampleId == m2.physical_sample_id) {

                    sampleDataObject.datasets.push({
                        id: m2.dendro_lookup_id,
                        label: m2.date_type,
                        value: "complex",
                        data: {
                            age_type: m2.age_type,
                            older: m2.older,
                            younger: m2.younger,
                            plus: m2.plus,
                            minus: m2.minus,
                            error_uncertainty: m2.error_uncertainty,
                            season: m2.season
                        }
                    });
                }
            });
            
            sampleDataObjects.push(sampleDataObject);

        });

        /*
        measurementRows.map(m => {

            let sampleDataObject = {
                sampleName: m.sample,
                sampleTaken: "",
                physicalSampleId: m.physical_sample_id,
                datasets: []
            }

            measurementRows.forEach(m2 => {
                if(m.physical_sample_id == m2.physical_sample_id) {
                    //Convert value to an integer if possible, otherwise leave as string
                    let value = m2.measurement_value;
                    let intVal = parseInt(m2.measurement_value);
                    if(!isNaN(intVal)) {
                        value = intVal;
                    }

                    sampleDataObject.datasets.push({
                        id: m2.dendro_lookup_id,
                        label: m2.date_type,
                        value: value
                    });
                }
            })

            datingRows.forEach(m2 => {
                if(m.physical_sample_id == m2.physical_sample_id) {

                    sampleDataObject.datasets.push({
                        id: m2.dendro_lookup_id,
                        label: m2.date_type,
                        value: "complex",
                        data: {
                            age_type: m2.age_type,
                            older: m2.older,
                            younger: m2.younger,
                            plus: m2.plus,
                            minus: m2.minus,
                            error_uncertainty: m2.error_uncertainty,
                            season: m2.season
                        }
                    });
                }
            });
            
            sampleDataObjects.push(sampleDataObject);
        });
        */

        return sampleDataObjects;
    }
    
    getTableRowsAsObjects(contentItem) {
        let sampleNameColKey = this.getTableColumnKeyByTitle(contentItem.data, "Sample name");
        let dateSampledColKey = this.getTableColumnKeyByTitle(contentItem.data, "Date sampled");

        let dataObjects = [];
        for(let rowKey in contentItem.data.rows) {
            let row = contentItem.data.rows[rowKey];

            let dataObject = {
                sample_name: row[sampleNameColKey].value,
                date_sampled: row[dateSampledColKey].value,
                datasets: []
            };
    
            row.forEach(cell => {
                if(cell.type == "subtable") {
    
                    let subTable = cell.value;
                    
                    let idColKey = this.getTableColumnKeyByTitle(subTable, "Dendro lookup id");
                    let labelColKey = this.getTableColumnKeyByTitle(subTable, "Measurement type");
                    let valueColKey = this.getTableColumnKeyByTitle(subTable, "Measurement value");
                    let dataColKey = this.getTableColumnKeyByTitle(subTable, "data");
                    
                    subTable.rows.forEach(subTableRow => {
                        let value = subTableRow[valueColKey].value;
                        if(subTableRow[idColKey].value == 134 || subTableRow[idColKey].value == 137) {
                            //This is Estimated felling year or Outermost tree-ring date, these are complex values that needs to be parsed
                            value = "complex";
                        }

                        let dataset = {
                            id: subTableRow[idColKey].value,
                            label: subTableRow[labelColKey].value,
                            value: value,
                            data: subTableRow[dataColKey].value,
                        };
    
                        dataObject.datasets.push(dataset);
                    })
                    
                }
            })
    
            dataObjects.push(dataObject);
        }
        
        return dataObjects;
    }

    /*
    getTableRowsAsObjects(contentItem) {
        let sampleDataObjects = [];
        for(let rowKey in contentItem.data.rows) {
            let row = contentItem.data.rows[rowKey];
    
            let sampleDataObject = {
                sampleName: row[2].value,
                sampleTaken: row[3].value,
                datasets: []
            };
    
            row.forEach(cell => {
                if(cell.type == "subtable") {
    
                    let subTable = cell.value;
                    
                    subTable.rows.forEach(subTableRow => {
                        let dataset = {
                            id: null,
                            label: null,
                            value: null,
                            data: null,
                        };
                        subTableRow.forEach(subTableCell => {
                            if(subTableCell.role == "id") {
                                dataset.id = subTableCell.value;
                            }
                            if(subTableCell.role == "label") {
                                dataset.label = subTableCell.value;
                            }
                            if(subTableCell.role == "value") {
                                dataset.value = subTableCell.value;
                            }
                            if(subTableCell.role == "data") {
                                dataset.data = subTableCell.value;
                                if(typeof dataset.data.date_type != "undefined") {
                                    //This is a date type
                                    dataset.label = dataset.data.date_type;
                                    dataset.value = "complex";
                                }
                            }
                        })
    
                        sampleDataObject.datasets.push(dataset);
                    })
                }
            })
            sampleDataObjects.push(sampleDataObject);
        }
        
        return sampleDataObjects;
    }
    */

    getDendroMeasurementByName(name, sampleDataObject) {
        let dendroLookupId = null;
        for(let key in this.translationTable) {
            if(this.translationTable[key].name == name) {
                dendroLookupId = this.translationTable[key].dendroLookupId;
            }
        }
    
        if(dendroLookupId == null) {
            return false;
        }

        let dpKey = "datasets";
        if(typeof sampleDataObject.data_points != "undefined") {
            dpKey = "data_points";
        }

        for(let key in sampleDataObject[dpKey]) {
            if(sampleDataObject[dpKey][key].id == dendroLookupId) {
                if(sampleDataObject[dpKey][key].value == "complex") {
                    return sampleDataObject[dpKey][key].data;
                }
                return sampleDataObject[dpKey][key].value;
            }
        }
        
    }

    getOldestGerminationYear(dataGroup) {
        let result = {
            name: "Oldest germination year",
            value: null,
            formula: "",
            reliability: null,
            dating_note: null,
            dating_uncertainty: null,
            error_uncertainty: null,
            warnings: []
        };

        let valueMod = 0;
        //if we have an inferrred growth year - great, just return that
        let measurementName = "Inferred growth year ≥";
        let infGrowthYearOlder = this.getDendroMeasurementByName(measurementName, dataGroup);
        if(parseInt(infGrowthYearOlder)) {
            result.value = parseInt(infGrowthYearOlder);
            result.formula = measurementName;
            result.reliability = 1;
            return result;
        }

        //If we don't have an "Inferred growth year" then we really can't say what the oldest possible germination year could be, could be when the dinosaurs roamed the earth, almost...
        return result;
    }
    
    getYoungestGerminationYear(dataGroup) {
        let result = {
            name: "Youngest germination year",
            value: null,
            formula: "",
            reliability: null,
            dating_note: null,
            dating_uncertainty: null,
            error_uncertainty: null,
            warnings: []
        };

        let valueMod = 0;

        //if we have an inferrred growth year - great (actually not sarcasm!), just return that
        let measurementName = "Inferred growth year ≤";
        let infGrowthYearYounger = this.getDendroMeasurementByName(measurementName, dataGroup);
        if(parseInt(infGrowthYearYounger)) {
            result.value = parseInt(infGrowthYearYounger);
            result.formula = measurementName;
            result.reliability = 1;
            return result;
        }
        
        //If we don't want to attempt to do dating calculations based on other variables, we give up here
        if(this.attemptUncertainDatingCaculations == false) {
            return result;
        }

        //Attempt a calculation based on: 'Estimated felling year' - 'Tree age ≥'
        let estFellingYear = this.getDendroMeasurementByName("Estimated felling year", dataGroup);
        if(!estFellingYear) {
            //If we don't have some sort of valid value from efy then there's no point of any of the below
            return result;
        }
        let treeAge = this.getDendroMeasurementByName("Tree age ≥", dataGroup);

        let currentWarnings = [];
        
        let estFellingYearValue = estFellingYear.younger;
        if(!estFellingYearValue) {
            estFellingYearValue = estFellingYear.older;
            if(!parseInt(estFellingYearValue)) {
                return result;
            }
            currentWarnings.push("Using the older estimated felling year for calculation since a younger year was not found");
        }

        //return result; //This used to be the cut-off, WHY?
        
        estFellingYearValue = parseInt(estFellingYearValue);

        if(estFellingYearValue && treeAge && parseInt(treeAge)) {
            result.value = estFellingYearValue - parseInt(treeAge);
            result.formula = 'Estimated felling year - Tree age ≥';
            result.reliability = 2;
            result.warnings.push("Youngest germination year was calculated using: "+result.formula);

            if(estFellingYear.age_type != "AD" && estFellingYear.age_type != null) {
                result.warnings.push("Estimated felling year has an unsupported age_type: "+estFellingYear.age_type);
            }
            if(estFellingYear.dating_uncertainty) {
                result.dating_uncertainty = estFellingYear.dating_uncertainty;
                result.warnings.push("The estimated felling year has an uncertainty specified as: "+estFellingYear.dating_uncertainty);
            }
            if(estFellingYear.error_uncertainty) {
                result.error_uncertainty = estFellingYear.error_uncertainty;
                result.warnings.push("The estimated felling year has an uncertainty specified as: "+estFellingYear.error_uncertainty);
            }
            if(estFellingYear.minus != null && parseInt(estFellingYear.minus)) {
                //result.warnings.push("The estimated felling year has a minus uncertainty specified as: "+estFellingYear.minus);
            }
            if(estFellingYear.plus != null && parseInt(estFellingYear.plus)) {
                //result.warnings.push("The estimated felling year has a plus uncertainty specified as: "+estFellingYear.plus);
                valueMod += estFellingYear.plus;
            }

            result.value += valueMod;

            result.warnings = result.warnings.concat(currentWarnings);
            return result;
        }
    
        //If the above failed, that means we either don't have Estimated felling year OR Tree age >=
        //If we don't have Estimated felling year we're heckin' hecked and have to give up on dating
        //If we DO have Estimated felling year and also a Pith value and Tree rings, we can try a calculation based on that
        let treeRings = this.getDendroMeasurementByName("Tree rings", dataGroup);
        let pith = this.parsePith(this.getDendroMeasurementByName("Pith (P)", dataGroup));

        //Pith can have lower & upper values if it is a range, in which case we should select the upper value here
        let pithValue = null;
        let pithSource = " (lower value)";
        if(pith.lower) {
            pithValue  = parseInt(pith.lower);
        }
        else {
            pithValue = parseInt(pith.value);
            pithSource = "";
        }

        if(estFellingYearValue && parseInt(treeRings) && pithValue && pith.notes != "Measured width") {
            result.value = estFellingYearValue - parseInt(treeRings) - pithValue;
            result.formula = "Estimated felling year - Tree rings - Distance to pith"+pithSource;
            result.reliability = 3;
            result.warnings.push("There is no dendrochronological estimation of the youngest possible germination year, it was therefore calculated using: "+result.formula);
            return result;
        }
    
        //WARNING: this gives a very vauge dating, saying almost nothing about germination year, only minimum lifespan
        if(estFellingYear && estFellingYearValue && parseInt(treeRings)) {
            result.value = estFellingYearValue - parseInt(treeRings);
            result.formula = "Estimated felling year - Tree rings";
            result.reliability = 4;
            result.warnings.push("There is no dendrochronological estimation of the youngest possible germination year, it was therefore calculated using: "+result.formula);
            return result;
        }
        
        //At this point we give up
        return result;
    }
    
    getOldestFellingYear(dataGroup) {
        let result = {
            name: "Oldest felling year",
            value: null,
            formula: "",
            reliability: null,
            dating_note: null,
            dating_uncertainty: null,
            error_uncertainty: null,
            warnings: []
        };

        let valueMod = 0;
        
        let estFellingYear = this.getDendroMeasurementByName("Estimated felling year", dataGroup);

        if(estFellingYear) {
            if(estFellingYear.age_type != "AD" && estFellingYear.age_type != null) {
                result.warnings.push("Estimated felling year has an unsupported age_type: "+estFellingYear.age_type);
            }
            if(estFellingYear.dating_uncertainty) {
                result.dating_uncertainty = estFellingYear.dating_uncertainty;
                valueMod -= estFellingYear.dating_uncertainty;
                //result.warnings.push("The estimated felling year has an uncertainty specified as: "+estFellingYear.dating_uncertainty);
            }
            if(estFellingYear.error_uncertainty) {
                result.error_uncertainty = estFellingYear.error_uncertainty;
                result.warnings.push("The estimated felling year has an uncertainty specified as: "+estFellingYear.error_uncertainty);
            }
            if(estFellingYear.minus != null && parseInt(estFellingYear.minus)) {
                //result.warnings.push("The estimated felling year has a minus uncertainty specified as: "+estFellingYear.minus);
                valueMod -= estFellingYear.minus;
            }
            if(estFellingYear.plus != null && parseInt(estFellingYear.plus)) {
                //result.warnings.push("The estimated felling year has a plus uncertainty specified as: "+estFellingYear.plus);
            }
        }
        
        
        if(estFellingYear && parseInt(estFellingYear.older)) {
            let value = parseInt(estFellingYear.older);
            result.value = value + valueMod;
            result.formula = "Estimated felling year (older)";
            result.reliability = 1;
            return result;
        }
        else if(estFellingYear && parseInt(estFellingYear.younger)) {
            //If there's no older felling year, but there is a younger one, then consider the oldest possible felling year to be unknown
            //result.warnings.push("No value found for the older estimated felling year, using the younger year instead");
            let value = parseInt(estFellingYear.younger);
            result.value = value + valueMod;
            result.formula = "Estimated felling year (younger)";
            result.reliability = 2;
            return result;
        }

        let minTreeAge = this.getDendroMeasurementByName("Tree age ≥", dataGroup);
        let germinationYear = this.getDendroMeasurementByName("Inferred growth year ≤", dataGroup);
        if(minTreeAge && germinationYear) {
            result.formula = "Inferred growth year ≤ + Tree age ≥";
            result.reliability = 3;
            result.value = germinationYear + minTreeAge + valueMod;
            result.warnings.push("Oldest possible feeling year was calculated using: "+result.formula);
        }

        return result;
    }

    getYoungestFellingYear(dataGroup) {
        let result = {
            name: "Youngest felling year",
            value: null,
            formula: "",
            reliability: null,
            dating_note: null,
            dating_uncertainty: null,
            error_uncertainty: null,
            warnings: []
        };

        let valueMod = 0;
        
        let estFellingYear = this.getDendroMeasurementByName("Estimated felling year", dataGroup);
        if(!estFellingYear) {
            return result;
        }

        if(estFellingYear.age_type != "AD" && estFellingYear.age_type != null) {
            result.warnings.push("Estimated felling year has an unsupported age_type: "+estFellingYear.age_type);
        }
        if(estFellingYear.dating_uncertainty) {
            result.dating_uncertainty = estFellingYear.dating_uncertainty;
            valueMod += estFellingYear.dating_uncertainty;
            //result.warnings.push("The estimated felling year has an uncertainty specified as: "+estFellingYear.dating_uncertainty);
        }
        if(estFellingYear.error_uncertainty) {
            result.error_uncertainty = estFellingYear.error_uncertainty;
            result.warnings.push("The estimated felling year has an uncertainty specified as: "+estFellingYear.error_uncertainty);
        }
        /*
        if(estFellingYear.minus != null && parseInt(estFellingYear.minus)) {
            result.warnings.push("The estimated felling year has a minus uncertainty specified as: "+estFellingYear.minus);
        }
        if(estFellingYear.plus != null && parseInt(estFellingYear.plus)) {
            result.warnings.push("The estimated felling year has a plus uncertainty specified as: "+estFellingYear.plus);
            valueMod += estFellingYear.plus;
        }
        */
        
        if(estFellingYear && parseInt(estFellingYear.younger)) {
            let value = parseInt(estFellingYear.younger);
            result.value = value + valueMod;
            result.formula = "Estimated felling year (younger)";
            result.reliability = 1;
            return result;
        }
        else if(estFellingYear && parseInt(estFellingYear.older)) {
            result.warnings.push("No value found for the younger estimated felling year, using the older year instead");
            let value = parseInt(estFellingYear.older);
            result.value = value + valueMod;
            result.formula = "Estimated felling year (older)";
            result.reliability = 2;
            return result;
        }

        let maxTreeAge = this.getDendroMeasurementByName("Tree age ≤", dataGroup);
        let germinationYear = this.getDendroMeasurementByName("Inferred growth year ≥", dataGroup);
        if(maxTreeAge && germinationYear) {
            result.formula = "Inferred growth year ≥ + Tree age ≤";
            result.reliability = 3;
            result.value = germinationYear + maxTreeAge + valueMod;
            result.warnings.push("Youngest possible feeling year was calculated using: "+result.formula);
        }

        return result;
    }
    
    getSamplesWithinTimespan(sampleDataObjects, startYear, endYear) {
        let selected = sampleDataObjects.filter(sampleDataObject => {

            let germinationYear = this.getOldestGerminationYear(sampleDataObject);
            let fellingYear = this.getYoungestFellingYear(sampleDataObject);
            
            //Just a check if both of these values are usable, otherwise there's no point
            if(!germinationYear || !fellingYear) {
                return false;
            }
            
            let leftOverlap = false;
            let innerOverlap = false;
            let outerOverlap = false;
            let rightOverlap = false;

            if(germinationYear.value <= startYear && fellingYear.value >= startYear) {
                leftOverlap = true;
            }

            if(germinationYear.value >= startYear && fellingYear.value <= endYear) {
                innerOverlap = true;
            }

            if(germinationYear.value >= startYear && germinationYear.value <= endYear) {
                rightOverlap = true;
            }

            if(germinationYear.value <= startYear && fellingYear.value >= endYear) {
                outerOverlap = true;
            }

            if(leftOverlap || innerOverlap || outerOverlap || rightOverlap) {
                return true;
            }

            return false;
        });

        return selected;
    }
    
    parseEstimatedFellingYearLowerAccuracy(rawValue) {
        if(typeof rawValue == "undefined") {
            return false;
        }
    
        let result = {
            rawValue: rawValue,
            strValue: rawValue,
            value: parseInt(rawValue),
            lower: NaN,
            upper: NaN,
            note: "Could not parse",
        };

        //Examples
        // "(E 1085)
        // (V 1723/24)
        // "(1720 ± 2)
        // (V 1720/21); (V 1828/29)
        // (1814-1834)
        // "(E 1195)
        // (1625±2)
        // (S 1688)
        // "(V 1558/59); (V 1703/04); (V 1816/17)
        // "(1850±2); (1810±3)

    }

    /**
     * parsePith
     * 
     * The values of pith measurements are numeric values but often represented with string modifiers such as ~ and < and - for ranges,
     * and thus require interpretation
     * 
     * Yes, quite so
     * 
     * If value could not be parsed/interpreted, the value attr of the return obj will be NaN
     * 
     * @param {*} rawPith 
     * @returns 
     */
    parsePith(rawPith) {
        if(typeof rawPith == "undefined") {
            return false;
        }
    
        let result = {
            rawValue: rawPith,
            strValue: rawPith,
            value: parseInt(rawPith),
            lower: NaN,
            upper: NaN,
            note: "Could not parse",
        };

        if(Number.isInteger(rawPith)) {
            rawPith = rawPith.toString();
            result.note = "Discrete number of rings";
        }
    
        if(rawPith.indexOf("x") !== -1) {
            result.note = "No value";
        }
    
        if(rawPith.indexOf("~") !== -1 && rawPith.indexOf("~", rawPith.indexOf("~")+1) == -1) {
            result.strValue = rawPith.substring(rawPith.indexOf("~")+1).trim();
            let range = this.valueIsRange(result.strValue);
            if(range !== false) {
                result.value = range.value;
                result.lower = range.lower;
                result.upper = range.upper;
                result.note = "Estimation, with range";    
            }
            else {
                result.value = parseInt(result.strValue);
                result.note = "Estimation";
            }
        }
    
        if(rawPith.indexOf(">") !== -1) {
            result.strValue = rawPith.substring(rawPith.indexOf(">")+1).trim();
            let range = this.valueIsRange(result.strValue);
            if(range !== false) {
                result.value = range.value;
                result.lower = range.lower;
                result.upper = range.upper;
                result.note = "Greater than, with range";    
            }
            else {
                result.value = parseInt(result.strValue);
                result.note = "Greater than";
            }
        }
    
        if(rawPith.indexOf("<") !== -1) {
            result.strValue = rawPith.substring(rawPith.indexOf("<")+1).trim();
            let range = this.valueIsRange(result.strValue);
            if(range !== false) {
                result.value = range.value;
                result.lower = range.lower;
                result.upper = range.upper;
                result.note = "Less than, with range";    
            }
            else {
                result.value = parseInt(result.strValue);
                result.note = "Less than";
            }
        }
    
        if(rawPith.indexOf("&gt;") !== -1) {
            result.strValue = rawPith.substring(rawPith.indexOf("&gt;")+4).trim();
            let range = this.valueIsRange(result.strValue);
            if(range !== false) {
                result.value = range.value;
                result.lower = range.lower;
                result.upper = range.upper;
                result.note = "Greater than, with range";    
            }
            else {
                result.value = parseInt(result.strValue);
                result.note = "Greater than";
            }
        }
    
        if(rawPith.indexOf("&lt;") !== -1) {
            result.strValue = rawPith.substring(rawPith.indexOf("&lt;")+4).trim();
            let range = this.valueIsRange(result.strValue);
            if(range !== false) {
                result.value = range.value;
                result.lower = range.lower;
                result.upper = range.upper;
                result.note = "Less than, with range";    
            }
            else {
                result.value = parseInt(result.strValue);
                result.note = "Less than";
            }
        }
    
        if(rawPith.indexOf("≤") !== -1) {
            result.strValue = rawPith.substring(rawPith.indexOf("≤")+1).trim();
            let range = this.valueIsRange(result.strValue);
            if(range !== false) {
                result.value = range.value;
                result.lower = range.lower;
                result.upper = range.upper;
                result.note = "Equal to or less than, with range";    
            }
            else {
                result.value = parseInt(result.strValue);
                result.note = "Equal to or less than";
            }
        }
        
        if(rawPith.indexOf("≥") !== -1) {
            result.strValue = rawPith.substring(rawPith.indexOf("≥")+1).trim();
            let range = this.valueIsRange(result.strValue);
            if(range !== false) {
                result.value = range.value;
                result.lower = range.lower;
                result.upper = range.upper;
                result.note = "Equal to or greater than, with range";    
            }
            else {
                result.value = parseInt(result.strValue);
                result.note = "Equal to or greater than";
            }
        }
    
        if(rawPith.indexOf("\"") !== -1) {
            result.strValue = rawPith.substring(rawPith.indexOf("\"")+1).trim();
            let range = this.valueIsRange(result.strValue);
            if(range !== false) {
                result.value = range.value;
                result.lower = range.lower;
                result.upper = range.upper;
                result.note = "Measured width"; //Note that this is a measurement of width - not of number of rings
            }
            else {
                result.value = parseInt(result.strValue);
                result.note = "Measured width";
            }
        }
        
        return result;
    }
    
    valueIsRange(value) {
        let result = {
            value: value,
            lower: null,
            upper: null
        };
        if(value.indexOf("-") !== -1) {
            let lower = value.substring(0, value.indexOf("-"));
            let upper = value.substring(value.indexOf("-")+1);
            result.lower = parseInt(lower);
            result.upper = parseInt(upper);
        }
        else {
            return false;
        }
    
        return result;
    }
    
    
    stripNonDatedObjects(sampleDataObjects) {
        return sampleDataObjects.filter((sampleDataObject) => {
            let notDated = this.getDendroMeasurementByName("Not dated", sampleDataObject);
            if(typeof notDated != "undefined") {
                //if we have explicit information that this is not dated...
                return false;
            }
            let efy = this.getDendroMeasurementByName("Estimated felling year", sampleDataObject);
            if(!efy) {
                //Or if we can't find a felling year...
                return false;
            }
            return true;
        })
    }
    
    /**
     * renderDendroDatingAsString
     * 
     * @param {*} datingObject 
     * @param {*} site 
     * @param {*} useTooltipMarkup 
     * @param {*} sqs - This needs to be provided if useTooltipMarkup is set to true!
     * @returns 
     */
    renderDendroDatingAsString(datingObject, site = null, useTooltipMarkup = true, sqs = null) {
        let renderStr = "";
        if(useTooltipMarkup && datingObject.error_uncertainty) {
            // see site 2019 for an example of this
            let uncertaintyDesc = "";
            if(site) {
                for(let key in site.lookup_tables.error_uncertainty) {
                    if(site.lookup_tables.error_uncertainty[key].error_uncertainty_type == datingObject.error_uncertainty) {
                        uncertaintyDesc = site.lookup_tables.error_uncertainty[key].description;
                    }
                }
            }
            renderStr = "!%data:"+datingObject.error_uncertainty+":!%tooltip:"+uncertaintyDesc+":! ";
            if(sqs != null) {
                renderStr = sqs.parseStringValueMarkup(renderStr);
            }
            else {
                console.warn("Skipping parseStringValueMarkup since we have no reference to sqs");
            }
            
        }
        else if(datingObject.error_uncertainty) {
            renderStr = datingObject.error_uncertainty+" ";
        }

        let youngerDate = datingObject.younger;
        let olderData = datingObject.older;
        let olderSeasonPrefix = "";
        let youngerSeasonPrefix = "";
        if(datingObject.season_id && datingObject.season_type_id == 10) {
            //this is a compound season like: "Winter-Summer", in this case the first season refers to the older date and the second to the younger
            let seasonNames = datingObject.season_name.split("-");
            olderSeasonPrefix = seasonNames[0].charAt(0)+" ";
            youngerSeasonPrefix = seasonNames[1].charAt(0)+" ";
            if(seasonNames[1] == "Winter") {
                //if the younger season is winter, we +1 to the year since e.g. 1790 is actually 1790/1791 since it is not possible to determine which year it is during winter
                youngerDate = youngerDate+"/"+String(youngerDate+1).substring(2);
            }
        }
        if(datingObject.season_id && datingObject.season_type_id == 9) {
            //this is a single season like "Summer"
            olderSeasonPrefix = datingObject.season_name.charAt(0)+" ";
            youngerSeasonPrefix = olderSeasonPrefix;
        }

        //if younger season is winter, we +1 to the year since e.g. 1790 is actually 1790/1791 since it is not possible to determine which year it is during winter
        if(youngerDate && datingObject.season_type_id == 9 && datingObject.season_name == "Winter") {
            youngerDate = youngerDate+"/"+String(youngerDate+1).substring(2);
        }

        if(youngerDate && olderData) {   
            renderStr += olderSeasonPrefix+olderData+" - "+youngerSeasonPrefix+youngerDate;
        }
        else if(youngerDate) {
            renderStr += youngerSeasonPrefix+youngerDate;
        }
        else if(olderData) {
            renderStr += olderSeasonPrefix+olderData;
        }
        
        if(datingObject.age_type) {
            renderStr += " "+datingObject.age_type;
        }

        if(datingObject.dating_uncertainty) {
            renderStr += " (+/-"+datingObject.dating_uncertainty+")";
        }

        if(datingObject.minus && datingObject.plus) {
            renderStr += " (+/-"+datingObject.minus+")";
        }
        else if(datingObject.minus) {
            renderStr += " (+0/-"+datingObject.minus+")";
        }
        else if(datingObject.plus) {
            renderStr += " (+"+datingObject.plus+"/-0)";
        }

        if(datingObject.dating_note && useTooltipMarkup && sqs == null) {
            console.warn("In renderDendroDatingAsString, useTooltipMarkup was requested but no reference to SQS were provided!");
        }
        if(datingObject.dating_note && useTooltipMarkup && sqs != null) {
            renderStr = "!%data:"+renderStr+":!%tooltip:"+datingObject.dating_note+":! ";
            renderStr = sqs.parseStringValueMarkup(renderStr, {
                drawSymbol: true,
                symbolChar: "fa-exclamation",
            });
        }

        return renderStr;
    }

    getBarColorByTreeSpecies(treeSpecies) {
        let colors = [];
        if(this.useLocalColors) {
            colors = ['#0074ab', '#005178', '#bfeaff', '#80d6ff', '#ff7900', '#b35500', '#ffdebf', '#ffbc80', '#daff00', '#99b300'];
            colors = ["#da4167","#899d78","#03440c","#392f5a","#247ba0","#0b3948","#102542"];
        }
        else {
            colors = this.sqs.color.getColorScheme(7);
        }

        switch(treeSpecies.toLowerCase()) {
            case "hassel":
                return colors[0];
            case "gran":
                return colors[1];
            case "tall":
                return colors[2];
            case "asp":
                return colors[3];
            case "björk":
                return colors[4];
            case "ek":
                return colors[5];
            case "bok":
                return colors[6];
        }
        return "black";
    }
}

export { DendroLib as default }