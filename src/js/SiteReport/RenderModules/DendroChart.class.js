import shortid from "shortid";
//import 'zingchart/es6';
import * as d3 from 'd3';


class DendroChart {
    constructor(siteReport, contentItem) {
        this.siteReport = siteReport;
        this.attemptUncertainDatingCaculations = true;
        this.showUncertainty = "all";
        this.contentItem = contentItem;
        let selectedSort = this.getSelectedRenderOptionExtra("Sort");
        this.selectedSort = selectedSort.value;
        let selectedUncertainty = this.getSelectedRenderOptionExtra("Uncertainty");
        this.showUncertainty = selectedUncertainty.value;
        this.USE_LOCAL_COLORS = true;
    }

    getSelectedRenderOptionExtra(extraOptionTitle = "Sort") {
        let renderOption = null;
        this.contentItem.renderOptions.forEach(ro => {
            if(ro.name == "Graph") {
                renderOption = ro;
            }
        });

        let sortOptionSelect = null;
        renderOption.options.forEach(roE => {
            if(roE.title == extraOptionTitle) {
                sortOptionSelect = roE;
            }
        });

        let selectedOption = null;
        sortOptionSelect.options.forEach(selectOption => {
            if(selectOption.selected === true) {
                selectedOption = selectOption;
            }
        });

        if(selectedOption == null && sortOptionSelect.options.length > 0) {
            selectedOption = sortOptionSelect.options[0];
        }
        else if(selectedOption == null) {
            return false;
        }

        return selectedOption;
    }

    getTableRowsAsObjects(contentItem) {
        let dataObjects = [];
        for(let rowKey in contentItem.data.rows) {
            let row = contentItem.data.rows[rowKey];
    
            let dataObject = {
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
    
                        dataObject.datasets.push(dataset);
                    })
                    
                }
            })
    
            dataObjects.push(dataObject);
    
        }
    
        return dataObjects;
    }
    
    getDendroMeasurementByName(name, dataObject) {
        const translationTable = [
            {
                name: "Tree species", //What we call it 
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
    
        let dendroLookupId = null;
        for(let key in translationTable) {
            if(translationTable[key].name == name) {
                dendroLookupId = translationTable[key].dendroLookupId;
            }
        }
    
        if(dendroLookupId == null) {
            return false;
        }
    
        for(let key in dataObject.datasets) {
            if(dataObject.datasets[key].id == dendroLookupId) {
                if(dataObject.datasets[key].value == "complex") {
                    return dataObject.datasets[key].data;
                }
                return dataObject.datasets[key].value;
            }
        }
    }
    
    
    getOldestGerminationYear(dataObject) {
        //a) if we have an inferrred growth year - great, just return that
        let infGrowthYearOlder = this.getDendroMeasurementByName("Inferred growth year ≥", dataObject);
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
        let estFellingYear = this.getDendroMeasurementByName("Estimated felling year", dataObject);
        let treeAge = this.getDendroMeasurementByName("Tree age ≤", dataObject);
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
        let treeRings = this.getDendroMeasurementByName("Tree rings", dataObject);
        let pith = this.parsePith(this.getDendroMeasurementByName("Pith (P)", dataObject));
        if(parseInt(estFellingYear.older) && parseInt(treeRings) && (parseInt(pith.value) || parseInt(pith.upper))) {
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
        if(parseInt(estFellingYear.older) && parseInt(treeRings)) {
            return {
                value: parseInt(estFellingYear.older) - parseInt(treeRings),
                source: "Estimated felling year (older) - Tree rings",
                reliability: 4
            };
        }
        
    
        //At this point we give up
        return false;
    }
    
    
    getYoungestGerminationYear(dataObject) {
        //a) if we have an inferrred growth year - great, just return that
        let infGrowthYearOlder = this.getDendroMeasurementByName("Inferred growth year ≤", dataObject);
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
        let estFellingYear = this.getDendroMeasurementByName("Estimated felling year", dataObject);
        let treeAge = this.getDendroMeasurementByName("Tree age ≥", dataObject);
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
        let treeRings = this.getDendroMeasurementByName("Tree rings", dataObject);
        let pith = this.parsePith(this.getDendroMeasurementByName("Pith (P)", dataObject));
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
        estFellingYear = this.getDendroMeasurementByName("Estimated felling year", dataObject);
        treeRings = this.getDendroMeasurementByName("Tree rings", dataObject);
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
    
    
    getOldestFellingYear(dataObject) {
        let estFellingYear = this.getDendroMeasurementByName("Estimated felling year", dataObject);
    
        if(parseInt(estFellingYear.older)) {
            return {
                value: parseInt(estFellingYear.older),
                source: "Estimated felling year (older)",
                reliability: 1
            };
        }
        else if(parseInt(estFellingYear.younger)) {
            return {
                value: parseInt(estFellingYear.younger),
                source: "Estimated felling year (younger)",
                reliability: 2
            };
        }
        else {
            return false;
        }
    }
    
    getYoungestFellingYear(dataObject) {
        let estFellingYear = this.getDendroMeasurementByName("Estimated felling year", dataObject);
    
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
    
    
    stripNonDatedObjects(dataObjects) {
        return dataObjects.filter((dataObject) => {
            let notDated = this.getDendroMeasurementByName("Not dated", dataObject);
            if(typeof notDated != "undefined") {
                //if we have explicit information that this is not dated...
                return false;
            }
            let efy = this.getDendroMeasurementByName("Estimated felling year", dataObject);
            if(!efy) {
                //Or if we can't find a felling year...
                return false;
            }
            return true;
        })
    }
    
    renderDendroDatingAsString(datingObject) {
    
        let renderStr = "";
    
        if(datingObject.younger && datingObject.older) {
            renderStr = datingObject.older+" - "+datingObject.younger;
        }
        else if(datingObject.younger) {
            renderStr = datingObject.younger;
        }
        else if(datingObject.older) {
            renderStr = datingObject.older;
        }
    
        if(datingObject.age_type) {
            renderStr += " "+datingObject.age_type;
        }
    
        if(datingObject.season) {
            renderStr = datingObject.season+" "+renderStr;
        }
    
        return renderStr;
    }

    getDataObjectBySampleName(dataObjects, sampleName) {
        for(let key in dataObjects) {
            if(dataObjects[key].sampleName == sampleName) {
                return dataObjects[key];
            }
        }
        return false;
    }

    renderBarHoverTooltip(container, dataObject, tooltips = []) {
        let dendroBarNode = $("svg [sample-name="+dataObject.sampleName+"].dendro-bar");
        let dendroBarGerminationNode = $("svg [sample-name="+dataObject.sampleName+"].dendro-bar-germination-uncertainty");
        let dendroBarFellingNode = $("svg [sample-name="+dataObject.sampleName+"].dendro-bar-felling-uncertainty");

        if(tooltips.includes("germinationYearOldest")) {
            this.renderTooltipGerminationYearOldest(container, dataObject, dendroBarGerminationNode);
        }
        if(tooltips.includes("germinationYearYoungest")) {
            this.renderTooltipGerminationYearYoungest(container, dataObject, dendroBarNode);
        }
        if(tooltips.includes("fellingYearOldest")) {
            this.renderTooltipFellingYearOldest(container, dataObject, dendroBarNode); //dendroBarFellingNode
        }
        if(tooltips.includes("fellingYearYoungest")) {
            this.renderTooltipFellingYearYoungest(container, dataObject, dendroBarFellingNode);
        }
    }

    renderTooltipGerminationYearOldest(container, dataObject, el) {
        let tooltipGroup = container.append("g")
        .classed("dendro-chart-tooltip", true)
        .attr("id", "tooltip-germination-year-oldest")
        tooltipGroup.append("path").attr("opacity", 0);
        tooltipGroup.append("rect").attr("opacity", 0);
        tooltipGroup.append("text").attr("opacity", 0);
        
        container.select("#tooltip-germination-year-oldest")
        .attr("transform", () => {
            let x = parseFloat($(el).attr("x")) - 4;
            let y = parseFloat($(el).attr("y")) + parseFloat($(el).attr("height")) + 1;
            return "translate("+x+", "+y+")";
        })

        container.select("#tooltip-germination-year-oldest path")
        .attr("opacity", 1)
        .attr("transform", () => {
            let x = 4;
            let y = -0.9;
            return "translate("+x+", "+y+")";
        })

        container.select("#tooltip-germination-year-oldest rect")
        .attr("opacity", 1)
        .attr("width", 8)
        .attr("height", 4);

        let oldGerm = this.getOldestGerminationYear(dataObject);
        let value = "N/A";
        if(oldGerm) {
            value = oldGerm.value;
        }

        container.select("#tooltip-germination-year-oldest text")
        .attr("opacity", 1)
        .attr("x", 4)
        .attr("y", 3)
        .text(value);
    }
    
    renderTooltipGerminationYearYoungest(container, dataObject, el) {

        let tooltipGroup = container.append("g")
        .classed("dendro-chart-tooltip", true)
        .attr("id", "tooltip-germination-year-youngest")
        tooltipGroup.append("path").attr("opacity", 0);
        tooltipGroup.append("rect").attr("opacity", 0);
        tooltipGroup.append("text").attr("opacity", 0);

        container.select("#tooltip-germination-year-youngest")
        .attr("transform", () => {
            let x = parseFloat($(el).attr("x")) - 4;
            let y = parseFloat($(el).attr("y")) - 5;
            return "translate("+x+", "+y+")";
        })

        container.select("#tooltip-germination-year-youngest path")
        .attr("opacity", 1)
        .attr("transform", () => {
            let x = 4;
            let y = 4.9;
            return "translate("+x+", "+y+"), rotate(180)";
        })

        container.select("#tooltip-germination-year-youngest rect")
        .attr("opacity", 1)
        .attr("width", 8)
        .attr("height", 4);

        container.select("#tooltip-germination-year-youngest text")
        .attr("opacity", 1)
        .attr("x", 4)
        .attr("y", 3)
        .text(this.getYoungestGerminationYear(dataObject).value);
    }

    renderTooltipFellingYearOldest(container, dataObject, el) {

        let tooltipGroup = container.append("g")
        .classed("dendro-chart-tooltip", true)
        .attr("id", "tooltip-felling-year-oldest")
        tooltipGroup.append("path").attr("opacity", 0);
        tooltipGroup.append("rect").attr("opacity", 0);
        tooltipGroup.append("text").attr("opacity", 0);

        container.select("#tooltip-felling-year-oldest")
        .attr("transform", () => {
            let x = parseFloat($(el).attr("x")) + parseFloat($(el).attr("width")) - 4;
            let y = parseFloat($(el).attr("y")) - 5;
            return "translate("+x+", "+y+")";
        })

        container.select("#tooltip-felling-year-oldest path")
        .attr("opacity", 1)
        .attr("transform", () => {
            let x = 4;
            let y = 4.9;
            return "translate("+x+", "+y+"), rotate(180)";
        })

        container.select("#tooltip-felling-year-oldest rect")
        .attr("opacity", 1)
        .attr("width", 8)
        .attr("height", 4);

        container.select("#tooltip-felling-year-oldest text")
        .attr("opacity", 1)
        .attr("x", 4)
        .attr("y", 3)
        .text(this.getOldestFellingYear(dataObject).value);
    }

    renderTooltipFellingYearYoungest(container, dataObject, el) {

        let tooltipGroup = container.append("g")
        .classed("dendro-chart-tooltip", true)
        .attr("id", "tooltip-felling-year-youngest")
        tooltipGroup.append("path").attr("opacity", 0);
        tooltipGroup.append("rect").attr("opacity", 0);
        tooltipGroup.append("text").attr("opacity", 0);

        container.select("#tooltip-felling-year-youngest")
        .attr("transform", () => {
            let x = parseFloat($(el).attr("x")) + parseFloat($(el).attr("width")) - 4;
            let y = parseFloat($(el).attr("y")) + parseFloat($(el).attr("height")) + 1;
            return "translate("+x+", "+y+")";
        })

        container.select("#tooltip-felling-year-youngest path")
        .attr("opacity", 1)
        .attr("transform", () => {
            let x = 4;
            let y = -0.9;
            return "translate("+x+", "+y+")";
        })

        container.select("#tooltip-felling-year-youngest rect")
        .attr("opacity", 1)
        .attr("width", 8)
        .attr("height", 4);

        container.select("#tooltip-felling-year-youngest text")
        .attr("opacity", 1)
        .attr("x", 4)
        .attr("y", 3)
        .text(this.getYoungestFellingYear(dataObject).value);
    }

    unrenderBarHoverTooltip(container) {
        container.selectAll("#tooltip-germination-year-oldest").remove();
        container.selectAll("#tooltip-germination-year-youngest").remove();
        container.selectAll("#tooltip-felling-year-oldest").remove();
        container.selectAll("#tooltip-felling-year-youngest").remove();
    }

    getWarningsBySampleName(sampleName) {
        for(let key in this.sampleWarnings) {
            if(sampleName == this.sampleWarnings[key].sampleName) {
                return this.sampleWarnings[key];
            }
        }
        return false;
    }

    addSampleWarning(sampleName, warningMsg = "Warning!") {
        let sampleWarning = this.getWarningsBySampleName(sampleName);
        sampleWarning.warnings.push({
            msg: warningMsg,
            icon: "⚠️",
        });

        console.warn(sampleName+" - "+warningMsg);
    }


    getBarColorByTreeSpecies(treeSpecies) {

        let colors = [];
        if(this.USE_LOCAL_COLORS) {
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

    drawCertaintyBars(container, dataObjects, initialTransitions = true) {

        let warningFlags = [];
        dataObjects.forEach(d => {
            warningFlags.push({
                sampleName: d.sampleName,
                warnings: []
            });
        });


        let bars = container.selectAll(".dendro-bar")
            .data(dataObjects)
            .join("rect")
            .classed("dendro-bar", true)
            .attr("fill", (d) => {
                let treeSpecies = this.getDendroMeasurementByName("Tree species", d);
                return this.getBarColorByTreeSpecies(treeSpecies);
            })
            .attr("sample-name", d => d.sampleName);


        if(initialTransitions) {
            bars.attr("x", (d) => {
                let fellingYear = this.getOldestFellingYear(d).value;
                if(!fellingYear) {
                    fellingYear = this.getYoungestFellingYear(d).value;
                }
                return this.xScale(fellingYear) - this.chartRightPadding;
            })
            .attr("y", (d, i) => {
                return i * (this.barHeight + this.barMarginY) + this.chartTopPadding;
            })
            .attr("width", (d, i) => {
                return 0;
            })
            .attr("height", this.barHeight);
        }

        bars.transition()
        .attr("x", (d) => {
            let plantingYear = this.getYoungestGerminationYear(d).value;
            if(!plantingYear) {
                plantingYear = this.getOldestGerminationYear(d).value;
                this.addSampleWarning(d.sampleName, "Warnings - using older (rather than younger) germination year for calculation of youngest possible germination year, since there is no data for the oldest year.");
            }
            return this.xScale(plantingYear) + this.chartLeftPadding;
        })
        .attr("width", (d, i) => {
            //Width should ideally be from the younger planting year to the older felling year
            let fellingYear = this.getOldestFellingYear(d).value;
            if(!fellingYear) {
                fellingYear = this.getYoungestFellingYear(d).value;
                this.addSampleWarning(d.sampleName, "Using younger felling year instead of older");
            }
            let plantingYear = this.getYoungestGerminationYear(d).value;
            if(!plantingYear) {
                plantingYear = this.getOldestGerminationYear(d).value;
                this.addSampleWarning(d.sampleName, "Using older germination year instead of younger");
            }
            return (this.xScale(fellingYear) - this.xScale(plantingYear)) - this.chartLeftPadding - this.chartRightPadding;
        })
        

        container.selectAll(".dendro-bar")
            .on("mouseover", (evt) => {
                let sampleName = $(evt.target).attr("sample-name");
                let d = this.getDataObjectBySampleName(dataObjects, sampleName);
                this.renderBarHoverTooltip(container, d, ["germinationYearYoungest", "fellingYearOldest"]);
                this.drawHorizontalGuideLines(container, d);
                this.drawInfoTooltip(d, evt);
            })
            .on("mouseout", (evt) => {
                this.unrenderBarHoverTooltip(container);
                this.removeHorizontalGuideLines(container);
                this.removeInfoTooltip();
            });

        setTimeout(() => {
            this.drawCertaintyBarsWarnings(container, dataObjects);
        }, 500);
        
    }

    drawInfoTooltip(d, evt) {
        let tooltipContainer = document.createElement("div");
        $(tooltipContainer).addClass("dendro-chart-tooltip-container");
        $(tooltipContainer).css("left", evt.pageX+2);
        $(tooltipContainer).css("top", evt.pageY+2)

        let dendroVars = [
            "Tree species",
            "Tree rings",
            "No. of radius",
            "Sapwood (Sp)",
            "Pith (P)",
            "Waney edge (W)",
            "Provenance",
            "Provenance comment",
            "Date note",
        ];
        let content = "";
        dendroVars.forEach(dv => {
            content += "<span class='dendro-tooltip-variable-name-text'>"+dv+"</span>: "+this.getDendroMeasurementByName(dv, d)+"<br />";
        });

        $(tooltipContainer).html(content);

        $("body").append(tooltipContainer);
    }

    removeInfoTooltip() {
        $(".dendro-chart-tooltip-container").remove();
    }

    drawUndatedSamplesTooltip(text, evt) {
        let tooltipContainer = document.createElement("div");
        $(tooltipContainer).addClass("dendro-chart-tooltip-container");
        $(tooltipContainer).css("left", evt.pageX+2);
        $(tooltipContainer).css("top", evt.pageY+2)

        let content = "<span class='dendro-tooltip-variable-name-text'>"+text+"</span>";

        $(tooltipContainer).html(content);

        $("body").append(tooltipContainer);
    }

    removeUndatedSamplesTooltip() {
        $(".dendro-chart-tooltip-container").remove();
    }

    drawHorizontalGuideLines(container, d) {
        let dendroBarNode = $("svg [sample-name="+d.sampleName+"].dendro-bar");
        let dendroBarGermUncertNode = $("svg [sample-name="+d.sampleName+"].dendro-bar-germination-uncertainty");

        let x2 = (() => {
            //get earliest X point
            let margin = 1;
            if($(dendroBarGermUncertNode).attr("width") > 0) {
                return parseFloat($(dendroBarGermUncertNode).attr("x")) - margin;
            }
            return parseFloat($(dendroBarNode).attr("x")) - margin;
        })();

        container.append("line")
        .classed("dendro-horizontal-guide-line", true)
        .attr("x1", x2)
        .attr("y1", () => {
            return parseFloat(dendroBarNode.attr("y")) + this.barHeight/2;
        })
        .attr("x2", x2)
        .attr("y2", () => {
            return parseFloat(dendroBarNode.attr("y")) + this.barHeight/2;
        })
        .transition()
        .duration(100)
        .attr("x1", () => {
            return 7;
        })
    }

    removeHorizontalGuideLines(container) {
        container.selectAll(".dendro-horizontal-guide-line").remove();
    }

    removeCertaintyBarsWarnings(container) {
        //$(".warning-flag").off("mouseover").off("mouseout").remove();
        container.selectAll(".warning-flag").remove();
    }

    drawCertaintyBarsWarnings(container, dataObjects) {
        //Draw warnings for missing youngestGerminationYear
        container.selectAll(".warning-flag")
        .data(dataObjects)
        .join("text")
        .classed("warning-flag", true)
        .attr("sample-name", d => d.sampleName)
        .html("⚠️")
        .attr("x", (d, i) => {
            let dendroBarNode = $("svg [sample-name="+d.sampleName+"].dendro-bar");
            return dendroBarNode.attr("x");
        })
        .attr("y", (d, i) => {
            return i * (this.barHeight + this.barMarginY) + this.chartTopPadding + 1.5;
        })
        .attr("visibility", (d) => {
            let germYoung = this.getYoungestGerminationYear(d);
            let germOld = this.getOldestGerminationYear(d);

            //console.log(germYoung, germOld)
            return germYoung.reliability == 1 && germOld.reliability == 1 ? "hidden" : "visible";
        })
        .attr("opacity", "0")
        .transition().duration(200)
        .attr("opacity", "1");

        container.selectAll(".warning-flag")
            .on("mouseover", (evt) => {
                let sampleName = $(evt.target).attr("sample-name");
                let d = this.getDataObjectBySampleName(dataObjects, sampleName);
                console.log(d);

                //let warnFlagNode = $("svg [sample-name="+d.sampleName+"].warning-flag");

                let tooltipContainer = document.createElement("div");
                $(tooltipContainer).addClass("dendro-chart-tooltip-container");
                $(tooltipContainer).css("left", evt.pageX);
                $(tooltipContainer).css("top", evt.pageY)

                let content = "";

                let germYoung = this.getYoungestGerminationYear(d);
                if(germYoung && germYoung.reliability != 1) {
                    content += "<p>The youngest possible germination year for this sample has a high degree of uncertainty. It's calculated as follows: ";
                    content += germYoung.source+"</p>";
                    $(tooltipContainer).html(content);
                }
                let germOld = this.getOldestGerminationYear(d);
                if(germOld && germOld.reliability != 1) {
                    content += "<p>The oldest possible germination year for this sample has a high degree of uncertainty. It's calculated as follows: ";
                    content += germOld.source+"</p>";
                    $(tooltipContainer).html(content);
                }

                let fellingYoung = this.getYoungestFellingYear(d);
                if(fellingYoung && fellingYoung.reliability != 1) {
                    content += "<p>The youngest possible felling year for this sample has a high degree of uncertainty. It's calculated as follows: ";
                    content += fellingYoung.source+"</p>";
                    $(tooltipContainer).html(content);
                }
                let fellingOld = this.getOldestFellingYear(d);
                if(fellingOld && fellingOld.reliability != 1) {
                    content += "<p>The oldest possible felling year for this sample has a high degree of uncertainty. It's calculated as follows: ";
                    content += fellingOld.source+"</p>";
                    $(tooltipContainer).html(content);
                }

                $("body").append(tooltipContainer);
            })
            .on("mouseout", (evt) => {
                $(".dendro-chart-tooltip-container").remove();
                //container.selectAll(".dendro-info-tooltip").remove();
            });
    }

    drawGerminationUncertaintyBars(container, dataObjects) {
        let bars = container.selectAll(".dendro-bar-germination-uncertainty")
            .data(dataObjects)
            .join("rect")
            .classed("dendro-bar-uncertain", true)
            .classed("dendro-bar-germination-uncertainty", true)
            .classed("dendro-bar-germination-high-uncertainty", d => {
                let germYoung = this.getYoungestGerminationYear(d);
                let germOld = this.getOldestGerminationYear(d);
                //console.log(germYoung);
                if(germYoung.reliability != 1) {
                    return true;
                }
            })
            .attr("sample-name", d => d.sampleName)
            /*
            .attr("visibility", (d) => {
                let germYoung = this.getYoungestGerminationYear(d);
                let germOld = this.getOldestGerminationYear(d);
                return "visible";
                return !germYoung || !germOld ? "hidden" : "visible";
            })*/
            .attr("y", (d, i) => {
                return i * (this.barHeight + this.barMarginY) + this.chartTopPadding;
            })
            .attr("height", this.barHeight)
            .attr("width", 0)
            .attr("x", (d) => {
                let germYounger = this.getYoungestGerminationYear(d);
                if(germYounger) {
                    return this.xScale(germYounger.value) + this.chartLeftPadding;
                }
                else {
                    return 0;
                }
            })
            .attr("visibility", () => {
                if(this.showUncertainty == "none") {
                    return "hidden";
                }
                else {
                    return "visible";
                }
            })
            .transition()
            .delay(100)
            .duration(500)
            .attr("x", (d) => {
                let germOlder = this.getOldestGerminationYear(d);
                if(germOlder) {
                    return this.xScale(germOlder.value) + this.chartLeftPadding;
                }
                else {
                    return 0;
                }
            })
            .attr("width", (d, i) => {
                let germOlder = this.getOldestGerminationYear(d);
                let germYounger = this.getYoungestGerminationYear(d);

                if(germYounger.reliability != 1) {
                    return 0;
                }

                if(germOlder && germYounger) {
                    //console.log(this.xScale(germYounger) - this.xScale(germOlder))
                    return this.xScale(germYounger.value) - this.xScale(germOlder.value);
                }
                else {
                    return 0;
                }
            })
            

        container.selectAll(".dendro-bar-germination-uncertainty")
            .on("mouseover", (evt) => {
                let sampleName = $(evt.target).attr("sample-name");
                let d = this.getDataObjectBySampleName(dataObjects, sampleName);
                if(!d) {
                    console.warn("Couldn't find dataObject with sampleName", sampleName);
                }
                this.renderBarHoverTooltip(container, d, ["germinationYearOldest", "germinationYearYoungest"]);
                this.drawHorizontalGuideLines(container, d);
            })
            .on("mouseout", (evt) => {
                this.unrenderBarHoverTooltip(container);
                this.removeHorizontalGuideLines(container);
            })

        //Here we might look for samples which can't be given a germination year with any degree of accuracy and draw the uncertainty to infinity for these
        /*
        dataObjects = dataObjects.filter((d) => {
            let germOlder = this.getOldestGerminationYear(d).value;
            let germYounger = this.getYoungestGerminationYear(d).value;
            return !germOlder && germYounger;
        });
        */

        /*
        if(this.showUncertainty == "all") {
            let groups = container.selectAll(".dendro-bar-germination-high-uncertainty")
                .data(dataObjects)
                .enter()
                .append("rect")
                    .classed("dendro-bar-uncertain", true)
                    .classed("dendro-bar-germination-high-uncertainty", true)
                    .attr("sample-name", d => d.sampleName)
                    .attr("x", (d) => {
                        return this.barMarginX;
                    })
                    .attr("y", (d, i) => {
                        return i * (this.barHeight + this.barMarginY);
                    })
                    .transition()
                    .delay(0)
                    .duration(500)
                    .attr("width", (d, i) => {
                        let germOlder = this.getOldestGerminationYear(d);
                        let germYounger = this.getYoungestGerminationYear(d);
                        if(!germOlder && germYounger) {
                            return this.xScale(germYounger.value);
                        }
                        else {
                            return 0;
                        }
                    })
                    .attr("height", this.barHeight);
        }
        */

        
    }

    drawFellingUncertaintyBars(container, dataObjects) {

        let bars = container.selectAll(".dendro-bar-felling-uncertainty")
            .data(dataObjects)
            .join("rect")
            .classed("dendro-bar-uncertain", true)
            .classed("dendro-bar-felling-uncertainty", true)
            .attr("sample-name", d => d.sampleName)
            .attr("x", (d) => {
                let fellingOlder = this.getOldestFellingYear(d).value;
                if(fellingOlder) {
                    return this.xScale(fellingOlder) - this.barMarginX;
                }
                else {
                    return 0;
                }
            })
            .attr("y", (d, i) => {
                return i * (this.barHeight + this.barMarginY) + this.chartTopPadding;
            })
            .attr("visibility", () => {
                if(this.showUncertainty == "none") {
                    return "hidden";
                }
                else {
                    return "visible";
                }
            })
            .transition()
            .delay(0)
            .duration(500)
            .attr("width", (d, i) => {
                let fellingOlder = this.getOldestFellingYear(d).value;
                let fellingYounger = this.getYoungestFellingYear(d).value;
                if(fellingOlder && fellingYounger) {
                    return this.xScale(fellingYounger) - this.xScale(fellingOlder);
                }
                else {
                    return 0;
                }
            })
            .attr("height", this.barHeight)


        container.selectAll(".dendro-bar-felling-uncertainty")
            .on("mouseover", (evt) => {
                let sampleName = $(evt.target).attr("sample-name");
                let d = this.getDataObjectBySampleName(dataObjects, sampleName);
                this.renderBarHoverTooltip(container, d, ["fellingYearOldest", "fellingYearYoungest"]);
                this.drawHorizontalGuideLines(container, d);
            })
            .on("mouseout", (evt) => {
                this.unrenderBarHoverTooltip(container);
                this.removeHorizontalGuideLines(container);
            })
    }

    drawGerminationLabels(container, dataObjects) {
        container.selectAll(".dendro-label-planted")
            .data(dataObjects)
            .enter()
            .append("text")
            .classed("dendro-text", true)
            .attr("x", (d) => {
                let plantingYear = this.getYoungestGerminationYear(d).value;
                if(!plantingYear) {
                    plantingYear = this.getOldestGerminationYear(d).value;
                    console.warn("Warning - using older planting year for planting label")
                }
                return this.xScale(plantingYear) + 5;
            })
            .attr("y", (d, i) => {
                return i * (this.barHeight + this.barMarginY) + this.fontSize;
            })
            .text(d => {
                return this.getOldestGerminationYear(d).value+" - "+this.getYoungestGerminationYear(d).value;

                let plantingYear = this.getYoungestGerminationYear(d).value;
                if(!plantingYear) {
                    plantingYear = this.getOldestGerminationYear(d).value;
                    console.warn("Warning - using older planting year for planting label")
                    plantingYear = plantingYear + ' \uf071';
                }
                return plantingYear;
            })
    }

    drawFellingLabels(container, dataObjects) {
        container.selectAll(".dendro-label-felled")
            .data(dataObjects)
            .enter()
            .append("text")
            .classed("dendro-text", true)
            .attr("x", (d) => {
                let fellingYear = this.getOldestFellingYear(d).value;
                if(!fellingYear) {
                    fellingYear = this.getYoungestFellingYear(d).value;
                    console.warn("Warning - using younger felling year for felling label")
                }
                return this.xScale(fellingYear) - 4;
            })
            .attr("y", (d, i) => {
                return i * (this.barHeight + this.barMarginY) + this.fontSize;
            })
            .text(d => {
                let fellingYear = this.getOldestFellingYear(d).value;
                if(!fellingYear) {
                    fellingYear = this.getYoungestFellingYear(d).value;
                    console.warn("Warning - using younger felling year for felling label")
                    //fellingYear = fellingYear + ' \uf071';
                }
                return fellingYear;
            })
    
            container.selectAll(".dendro-label-felled-extras")
            .data(dataObjects)
            .enter()
            .append("text")
            .classed("dendro-text-extras", true)
            .attr("x", (d) => {
                let fellingYear = this.getOldestFellingYear(d).value;
                if(!fellingYear) {
                    fellingYear = this.getYoungestFellingYear(d).value;
                    console.warn("Warning - using younger felling year for felling label")
                }
                return this.xScale(fellingYear) - 1;
            })
            .attr("y", (d, i) => {
                return i * (this.barHeight + this.barMarginY);
            })
            .text(d => {
                let fellingYear = this.getOldestFellingYear(d).value;
                if(!fellingYear) {
                    fellingYear = this.getYoungestFellingYear(d).value;
                    console.warn("Warning - using younger felling year for felling label")
                    fellingYear = '\uf071';
                }
                else {
                    fellingYear = "";
                }
                return fellingYear;
            })
    }

    drawXAxis(container, yearExtent) {
        
        let xScaleStart = this.chartLeftPadding;
        let xScaleEnd = 100 - this.chartRightPadding;

        let ticksNum = 5; //this will result in ticksNum+1, which makes perfect sense, because I say so
        let tickValues = [];
        let yearStep = (yearExtent[1] - yearExtent[0]) / ticksNum;
        for(let i = 0; i <= ticksNum; i++) {
            tickValues.push(Math.round(yearExtent[0] + (i * yearStep)));
        }

        let xScaleLine = d3.scaleLinear()
        .domain(yearExtent)
        .range([xScaleStart, xScaleEnd]);

        const yearAxis = d3.axisTop(xScaleLine);
        yearAxis.tickSizeInner(1)
        yearAxis.tickSizeOuter(0)
        yearAxis.tickPadding(1)
        yearAxis.tickValues(tickValues)
        yearAxis.tickFormat(v => v);

        container.append("g")
            .classed("dendro-chart-x-axis", true)
            .attr("transform", "translate(0,99)")
            .call(yearAxis);
        
        container.select(".dendro-chart-x-axis .domain")
        .attr("transform", "translate(0, -0.5)");
    }

    drawYAxis(container, dataObjects) {

        container.selectAll(".dendro-chart-y-axis").remove();

        let sampleNames = [];
        let samplePositions = [];
        let yTick = this.viewBoxAvailableHeight / dataObjects.length;
        let i = 0;
        dataObjects.forEach(d => {
            sampleNames.push(d.sampleName);
            samplePositions.push(this.chartTopPadding + (yTick * i++) + (this.barHeight/2 - 0.5) );
        });

        var sampleScale = d3.scaleOrdinal()
        .domain(sampleNames)
        .range(samplePositions);

        const sampleAxis = d3.axisRight(sampleScale);
        sampleAxis.tickSizeInner(1)
        sampleAxis.tickSizeOuter(0)
        sampleAxis.tickPadding(1)
        sampleAxis.tickFormat(v => v);

        container.append("g")
            .classed("dendro-chart-y-axis", true)
            .attr("transform", "translate(0,0)")
            .call(sampleAxis);

        container.select(".dendro-chart-y-axis .domain")
            .attr("transform", "translate(-0.5, 0)");
    }

    calculateScales() {
        let svgNode = $(this.anchorNodeSelector+" svg");
        this.svgScale = svgNode.width() / 100;

        this.svgScaleX = d3.scaleLinear()
        .domain([0, $(this.anchorNodeSelector+" svg").width()])
        .range([0, 100]);

        this.svgScaleY = d3.scaleLinear()
        .domain([0, $(this.anchorNodeSelector+" svg").height()])
        .range([0, 100]);
    }

    sortDataObjects(dataObjects) {
        switch(this.selectedSort) {
            case "alphabetical":
                dataObjects.sort((a, b) => {
                    if(a.sampleName > b.sampleName) {
                        return 1;
                    }
                    if(a.sampleName <= b.sampleName) {
                        return -1;
                    }
                });
                break;
            case "germination year":
                dataObjects.sort((a, b) => {
                    let germA = this.getOldestGerminationYear(a);
                    let germB = this.getOldestGerminationYear(b);
                    if(!germA || !germB) {
                        germA = this.getYoungestGerminationYear(a);
                        germB = this.getYoungestGerminationYear(b);
                    }
                    if(germA.value > germB.value) {
                        return 1;
                    }
                    if(germA.value <= germB.value) {
                        return -1;
                    }
                });
                break;
            case "felling year":
                dataObjects.sort((a, b) => {
                    let fellA = this.getYoungestFellingYear(a);
                    let fellB = this.getYoungestFellingYear(b);
                    if(!fellA || !fellB) {
                        fellA = this.getOldestFellingYear(a);
                        fellB = this.getOldestFellingYear(b);
                    }
                    if(fellA.value > fellB.value) {
                        return 1;
                    }
                    if(fellA.value <= fellB.value) {
                        return -1;
                    }
                });
                break;
            case "tree species":
                dataObjects.sort((a, b) => {
                    let specA = this.getDendroMeasurementByName("Tree species", a);
                    let specB = this.getDendroMeasurementByName("Tree species", b);
                    if(specA > specB) {
                        return 1;
                    }
                    if(specA <= specB) {
                        return -1;
                    }
                });
                break;
        }
        return dataObjects;
    }

    render(anchorNodeSelector) {
		this.anchorNodeSelector = anchorNodeSelector;
		var node = null;
		this.contentItem.renderOptions.forEach((ro, i) => {
			if(ro.selected) {
				switch(ro.type) {
					case "dendrochart":
						node = this.renderChart();
						break;
				}
			}
		});
		return this;
	}

    renderChart() {
        this.sampleWarnings = [];
        $(this.anchorNodeSelector+" svg").remove();
        let contentItem = this.contentItem;
        this.dataObjects = this.getTableRowsAsObjects(contentItem);
        let totalNumOfSamples = this.dataObjects.length;
        this.dataObjects = this.stripNonDatedObjects(this.dataObjects);
        let undatedSamples = totalNumOfSamples - this.dataObjects.length;

        this.dataObjects.forEach((d) => {
            this.sampleWarnings.push({
                sampleName: d.sampleName,
                warnings: []
            })
        });

        this.sortDataObjects(this.dataObjects);

        //this.barHeight = 5; //height/thickness of bars
        this.barMarginX = 5;
        this.barMarginY = 1; //y-distance between bars
        this.fontSize = 2; //determines y-offset of labels
        this.chartTopPadding = 5;
        this.chartBottomPadding = 10;
        this.chartLeftPadding = 10;
        this.chartRightPadding = 5;

        const viewBoxWidth = 100;
        const viewBoxHeight = 100;

        this.viewBoxAvailableHeight = viewBoxHeight - this.chartTopPadding - this.chartBottomPadding
        this.barHeight = (this.viewBoxAvailableHeight / this.dataObjects.length) - this.barMarginY;
        const chartHeight = this.dataObjects.length * this.barHeight * this.barMarginY;
        if(chartHeight > viewBoxHeight) {
            this.barHeight = 3;
        }

        let viewBoxAvailableWidth = viewBoxWidth - this.chartLeftPadding - this.chartRightPadding
        this.barWidth = (viewBoxAvailableWidth / this.dataObjects.length) - this.barMarginX;
        
        const chartPaddingX = 10;
        const chartPaddingY = 10;
    
        const chartId = "chart-"+shortid.generate();
        var chartContainer = $("<div id='"+chartId+"' class='site-report-chart-container'></div>");
        $(this.anchorNodeSelector).append(chartContainer);
    
        this.container = d3.select(this.anchorNodeSelector).append("svg")
            .attr("id", "dendro-chart-svg")
            .classed("dendro-chart-svg", true)
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("xmlns", "http://www.w3.org/2000/svg")
            .attr("viewBox", [0, 0, viewBoxWidth, viewBoxHeight]);

        if(undatedSamples) {
            this.container.append("text")
            .attr("id", "undated-samples-warning")
            .attr("x", -2)
            .attr("y", 2)
            .text("⚠ "+undatedSamples+" samples not shown");

            $("#undated-samples-warning").on("mouseover", (evt) => {
                this.drawUndatedSamplesTooltip("There are another "+undatedSamples+" samples not shown in this graph since they lack sufficient dating information. They are available in the spreadsheet view.", evt);
            });
            $("#undated-samples-warning").on("mouseout", (evt) => {
                this.removeUndatedSamplesTooltip();
            });
        }

        let extentMin = d3.min(this.dataObjects, d => {
            let plantingYear = this.getOldestGerminationYear(d).value
            if(!plantingYear) {
                plantingYear = this.getYoungestGerminationYear(d).value;
            }
            return plantingYear;
        });
    
        let extentMax = d3.max(this.dataObjects, d => {
            let fellingYear =  this.getOldestFellingYear(d).value;
            if(!fellingYear) {
                fellingYear = this.getYoungestFellingYear(d).value;
            }
            return fellingYear;
        });

        //If we couldn't find a single viable dating for any sample, then we can't calculate a range span at all and thus can't draw anything
        if(!extentMin || !extentMax) {
            this.container.append("text")
            .classed("dendro-text-large-warn", true)
            .attr("y", 4)
            .html("There are no dateable samples in this dataset.");

            this.container.append("text")
            .classed("dendro-text-large-warn", true)
            .attr("y", 7)
            .html("There are "+this.dataObjects.length+" samples with non-dating data.");

            return false;
        }
        
        let yearExtent = [extentMin, extentMax];

        this.xScale = d3.scaleLinear()
        .domain(yearExtent)
        .range([0, 100]);
    
        this.yScale = d3.scaleLinear()
        .domain([0, this.dataObjects.length])
        .range([0, 100]);
        
        /*
        this.calculateScales();
        window.onresize = () => {
            this.calculateScales();
        };
        */

        this.updateChart(this.container, this.dataObjects);

        this.drawXAxis(this.container, yearExtent);
        this.drawYAxis(this.container, this.dataObjects);

        let defs = this.container.append("defs");
        let gradient = defs.append("linearGradient")
            .attr("id", "gradient1")
            .attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "0%");
        
        gradient.append("stop")
            .attr("offset", "0%")
            .attr("style", "stop-color:rgb(85, 51, 0);stop-opacity:0");

        gradient.append("stop")
            .attr("offset", "100%")
            .attr("style", "stop-color:rgb(85, 51, 0);stop-opacity:0.5");

        this.drawCertaintyBars(this.container, this.dataObjects);
        if(this.showUncertainty == "all" || this.showUncertainty == "estimates") {
            this.drawGerminationUncertaintyBars(this.container, this.dataObjects);
            this.drawFellingUncertaintyBars(this.container, this.dataObjects);
        }
    }

    update(updatedExtrasRenderOption = null) {
        return false;
    }

    updateChart(container, dataObjects) {
        this.dataObjects = this.sortDataObjects(this.dataObjects);
        this.removeCertaintyBarsWarnings(container);
        this.drawCertaintyBars(container, dataObjects);
        this.drawFellingUncertaintyBars(container, dataObjects);
        this.drawGerminationUncertaintyBars(container, dataObjects);
        this.drawYAxis(container, dataObjects);
    }

    unrender() {
		if(this.chartId != null) {
            $("#"+this.chartId, this.anchorNodeSelector).remove();
		}
	}
}

export { DendroChart as default }