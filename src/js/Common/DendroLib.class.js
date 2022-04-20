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

        for(let key in sampleDataObject.datasets) {
            if(sampleDataObject.datasets[key].id == dendroLookupId) {
                if(sampleDataObject.datasets[key].value == "complex") {
                    return sampleDataObject.datasets[key].data;
                }
                return sampleDataObject.datasets[key].value;
            }
        }
    }

    getOldestGerminationYear(sampleDataObject) {
        //a) if we have an inferrred growth year - great, just return that
        let infGrowthYearOlder = this.getDendroMeasurementByName("Inferred growth year ≥", sampleDataObject);
        if(parseInt(infGrowthYearOlder)) {
            return {
                value: parseInt(infGrowthYearOlder),
                source: "Inferred growth year ≥",
                reliability: 1
            }
        }
        else {
            //If we don't want to attempt to do dating calculations based on other variables, we give up here
            if(this.attemptUncertainDatingCaculations == false) {
                return false;
            }
        }
        //b) If above failed...then attempt a calculation based on: 'Estimated felling year' - 'Tree age ≤'
        let estFellingYear = this.getDendroMeasurementByName("Estimated felling year", sampleDataObject);
        let treeAge = this.getDendroMeasurementByName("Tree age ≤", sampleDataObject);
        if(estFellingYear && treeAge && parseInt(estFellingYear.older) && parseInt(treeAge)) {
            return {
                value: parseInt(estFellingYear.older) - parseInt(treeAge),
                source: "Estimated felling year (older) - Tree age ≤",
                reliability: 2
            }
        }
    
        //If the above failed, that means we either don't have Estimated felling year OR Tree age <=
        //If we don't have Estimated felling year we're fecked and have to give up on dating
        //If we DO have Estimated felling year and also a Pith value and Tree rings, we can try a calculation based on that
        let treeRings = this.getDendroMeasurementByName("Tree rings", sampleDataObject);
        let pith = this.parsePith(this.getDendroMeasurementByName("Pith (P)", sampleDataObject));
        if(estFellingYear && parseInt(estFellingYear.older) && parseInt(treeRings) && (parseInt(pith.value) || parseInt(pith.upper))) {
            if(pith.notes == "Measured width") {
                //If pith is designated as Measured width, we can't reasonably use it and need to bail out
                return false;
            }
    
            //Pith can have lower & upper values if it is a range, in which case we should select the upper value here
            let pithValue = pith.upper ? pith.upper : pith.value;
    
            return {
                value: parseInt(estFellingYear.older) - parseInt(treeRings) - parseInt(pithValue),
                source: "Estimated felling year (older) - Tree rings - Distance to pith",
                reliability: 3
            };
        }
    
        //WARNING: this gives a very vauge dating, saying almost nothing about germination year, only minimum lifespan
        if(estFellingYear && parseInt(estFellingYear.older) && parseInt(treeRings)) {
            return {
                value: parseInt(estFellingYear.older) - parseInt(treeRings),
                source: "Estimated felling year (older) - Tree rings",
                reliability: 4
            };
        }
        
    
        //At this point we give up
        return false;
    }
    
    
    getYoungestGerminationYear(sampleDataObject) {
        //a) if we have an inferrred growth year - great, just return that
        let infGrowthYearOlder = this.getDendroMeasurementByName("Inferred growth year ≤", sampleDataObject);
        if(parseInt(infGrowthYearOlder)) {
            return {
                value: parseInt(infGrowthYearOlder),
                source: "Inferred growth year ≤",
                reliability: 1
            }
        }
        else {
            //If we don't want to attempt to do dating calculations based on other variables, we give up here
            if(this.attemptUncertainDatingCaculations == false) {
                return false;
            }
        }
        
        //Character stash: ≥ ≤ 
    
        //b) If above failed...then attempt a calculation based on: 'Estimated felling year' - 'Tree age ≥'
        let estFellingYear = this.getDendroMeasurementByName("Estimated felling year", sampleDataObject);
        let treeAge = this.getDendroMeasurementByName("Tree age ≥", sampleDataObject);
        if(parseInt(estFellingYear.younger) && parseInt(treeAge)) {
            return {
                value: parseInt(estFellingYear.younger) - parseInt(treeAge),
                source: "Estimated felling year (younger) - Tree age ≥",
                reliability: 2
            }
        }

        
        //If the above failed, that means we either don't have Estimated felling year OR Tree age >=
        //If we don't have Estimated felling year we're fecked and have to give up on dating
        //If we DO have Estimated felling year and also a Pith value and Tree rings, we can try a calculation based on that
        let treeRings = this.getDendroMeasurementByName("Tree rings", sampleDataObject);
        let pith = this.parsePith(this.getDendroMeasurementByName("Pith (P)", sampleDataObject));
        if(parseInt(estFellingYear.younger) && parseInt(treeRings) && (parseInt(pith.value) || parseInt(pith.lower))) {
            if(pith.notes == "Measured width") {
                //If pith is designated as Measured width, we can't reasonably use it and need to bail out
                return false;
            }
    
            //Pith can have lower & upper values if it is a range, in which case we should select the upper value here
            let pithValue = pith.lower ? pith.lower : pith.value;
    
            return {
                value: parseInt(estFellingYear.younger) - parseInt(treeRings) - parseInt(pithValue),
                source: "Estimated felling year (younger) - Tree rings - Distance to pith",
                reliability: 3
            };
        }
        
    
        //WARNING: this gives a very vauge dating, saying almost nothing about germination year, only minimum lifespan
        estFellingYear = this.getDendroMeasurementByName("Estimated felling year", sampleDataObject);
        treeRings = this.getDendroMeasurementByName("Tree rings", sampleDataObject);
        if(parseInt(estFellingYear.younger) && parseInt(treeRings)) {
            return {
                value: parseInt(estFellingYear.younger) - parseInt(treeRings),
                source: "Estimated felling year (younger) - Tree rings",
                reliability: 4
            };
        }
        
    
        //At this point we give up
        return false;
    }
    
    
    getOldestFellingYear(sampleDataObject) {
        let ageType = "AD";
        let estFellingYear = this.getDendroMeasurementByName("Estimated felling year", sampleDataObject);
        
        estFellingYear.age_type; //Normally "AD"
        estFellingYear.season; //often null
        estFellingYear.error_uncertainty; //normally null, but if it's 1 that's "Ca"
        estFellingYear.plus; //integer
        estFellingYear.minus; //integer

        if(estFellingYear.age_type != "AD" && estFellingYear.age_type != null && typeof estFellingYear.age_type != "undefined") {
            //if age type is something other than "AD" or null/undefined, assume this is a BC date
            ageType = "BC";
        }
        
        if(parseInt(estFellingYear.older)) {
            let value = parseInt(estFellingYear.older);
            value = ageType == "AD" ? value : value * -1;
            return {
                value: value,
                source: "Estimated felling year (older)",
                reliability: 1
            };
        }
        else if(parseInt(estFellingYear.younger)) {
            let value = parseInt(estFellingYear.younger);
            value = ageType == "AD" ? value : value * -1;
            return {
                value: value,
                source: "Estimated felling year (younger)",
                reliability: 2
            };
        }
        else {
            
            return false;
        }
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
    
    getYoungestFellingYear(sampleDataObject) {
        let estFellingYear = this.getDendroMeasurementByName("Estimated felling year", sampleDataObject);

        if(!estFellingYear) {
            return false;
        }
    
        if(parseInt(estFellingYear.younger)) {
            return {
                value: parseInt(estFellingYear.younger),
                source: "Estimated felling year (younger)",
                reliability: 1
            };
        }
        else if(parseInt(estFellingYear.older)) {
            //If there's no younger, but we have an older, revert to that
            return {
                value: parseInt(estFellingYear.older),
                source: "Estimated felling year (older)",
                reliability: 2
            };
        }
        else {
            return false;
        }
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
            strValue: rawPith,
            value: parseInt(rawPith),
            lower: NaN,
            upper: NaN,
            note: "Could not parse",
        };

        if(Number.isInteger(rawPith)) {
            rawPith = rawPith.toString();
        }
    
        if(rawPith.indexOf("x") !== -1) {
            //We assume 'x' means no value - but this needs to be checked with the dendro ppl
            result.note = "No value";
        }
    
        if(rawPith.indexOf("~") !== -1 && rawPith.indexOf("~", rawPith.indexOf("~")) == -1) {
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
    
    renderDendroDatingAsString(datingObject, site = null, useTooltipMarkup = true) {

        let renderStr = "";
    
        if(useTooltipMarkup && datingObject.error_uncertainty) {
            let uncertaintyDesc = "";
            if(site) {
                for(let key in site.lookup_tables.error_uncertainty) {
                    if(site.lookup_tables.error_uncertainty[key].error_uncertainty_type == datingObject.error_uncertainty) {
                        uncertaintyDesc = site.lookup_tables.error_uncertainty[key].description;
                    }
                }
            }
            renderStr = "!%data:"+datingObject.error_uncertainty+":!%tooltip:"+uncertaintyDesc+":! ";
        }
        else if(datingObject.error_uncertainty) {
            renderStr = datingObject.error_uncertainty+" ";
        }

        if(datingObject.younger && datingObject.older) {
            renderStr += datingObject.older+" - "+datingObject.younger;
        }
        else if(datingObject.younger) {
            renderStr += datingObject.younger;
        }
        else if(datingObject.older) {
            renderStr += datingObject.older;
        }
        
        if(datingObject.age_type) {
            renderStr += " "+datingObject.age_type;
        }
    
        if(datingObject.season) {
            renderStr = datingObject.season+" "+renderStr;
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