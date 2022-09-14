import { nanoid } from "nanoid";
//import 'zingchart/es6';
import * as d3 from 'd3';
import DendroLib from "../../Common/DendroLib.class";


class DendroChart {
    constructor(siteReport, contentItem) {
        this.siteReport = siteReport;
        this.sqs = siteReport.sqs;
        this.attemptUncertainDatingCaculations = true;
        this.showUncertainty = "all";
        this.contentItem = contentItem;
        let selectedSort = this.getSelectedRenderOptionExtra("Sort");
        this.selectedSort = selectedSort.value;
        let selectedUncertainty = this.getSelectedRenderOptionExtra("Uncertainty");
        this.showUncertainty = selectedUncertainty.value;
        this.selectedSampleGroup = this.getSelectedRenderOptionExtra("Sample group");
        this.USE_LOCAL_COLORS = true;
        this.infoTooltipId = null;
        this.tooltipId = null;
        this.sampleWarnings = [];
        this.dendroLib = new DendroLib();

        this.sqs.sqsEventListen("siteReportClosed", () => {
            this.removeInfoTooltip();
		});

        this.lookupTable = [
            {
                name: "Tree species", //What we call it - this is the name we use for internal code references
                title: "Tree species", //The proper name it should be called (subject to change), this should match up with what is actually in the database
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

    getTableColumnKeyByTitle(table, searchTitle) {
        for(let key in table.columns) {
            let col = table.columns[key];
            if(col.title == searchTitle) {
                return key;
            }
        }
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
        
        console.log(dataObjects);
        return dataObjects;
    }

    getDendroMeasurementById(dendroLookupId, dataObject) {
        for(let key in dataObject.datasets) {
            if(dataObject.datasets[key].id == dendroLookupId) {
                if(dataObject.datasets[key].value == "complex") {
                    return dataObject.datasets[key].data;
                }
                return dataObject.datasets[key].value;
            }
        }
    }
    
    getDendroMeasurementByName(name, dataObject) {
        let dendroLookupId = null;
        for(let key in this.lookupTable) {
            if(this.lookupTable[key].name == name) {
                dendroLookupId = this.lookupTable[key].dendroLookupId;
            }
        }
    
        if(dendroLookupId == null) {
            return false;
        }
        
        return this.getDendroMeasurementById(dendroLookupId, dataObject);
    }
    
    getDendroMeasurementTypeById(id) {
        for(let key in this.lookupTable) {
            if(this.lookupTable[key].dendroLookupId == id) {
                return this.lookupTable[key];
            }
        }
        return null;
    }
    
    getOldestGerminationYearOLD(dataObject) {
        let retVal = {
            name: "Oldest germination year",
            value: null,
            formula: "",
            reliability: null,
            warnings: []
        }

        //a) if we have an inferrred growth year - great, just return that
        let infGrowthYearOlder = this.getDendroMeasurementByName("Inferred growth year ≥", dataObject);
        if(parseInt(infGrowthYearOlder)) {
            retVal.value = parseInt(infGrowthYearOlder);
            retVal.formula = "Inferred growth year ≥"
            retVal.reliability = 1;
            return retVal;
        }

        //b) If above failed...then attempt a calculation based on: 'Estimated felling year' - 'Tree age ≤'
        let estFellingYear = this.getDendroMeasurementByName("Estimated felling year", dataObject);
        let treeAge = this.getDendroMeasurementByName("Tree age ≤", dataObject);
        if(estFellingYear && treeAge && parseInt(estFellingYear.older) && parseInt(treeAge)) {
            retVal.value = parseInt(estFellingYear.older) - parseInt(treeAge);
            retVal.formula = "Estimated felling year (older) - Tree age ≤";
            retVal.reliability = 2;
            retVal.warnings.push({
                label: "Oldest germination year",
                description: "The value for the oldest possible germination year was calculated using the formula: "+retVal.formula+", since we couldn't find a value for "+this.getDendroMeasurementTypeById(132).name
            });
            return retVal;
        }
    
        //If the above failed, that means we either don't have Estimated felling year OR Tree age <=
        //If we don't have Estimated felling year we're fecked and have to give up on dating
        //If we DO have Estimated felling year and also a Pith value and Tree rings, we can try a calculation based on that
        let treeRings = this.getDendroMeasurementByName("Tree rings", dataObject);
        let pith = this.parsePith(this.getDendroMeasurementByName("Pith (P)", dataObject));
        if(parseInt(estFellingYear.older) && parseInt(treeRings) && (parseInt(pith.value) || parseInt(pith.upper))) {
            if(pith.notes == "Measured width") {
                //If pith is designated as Measured width, we can't reasonably use it and need to bail out
                return retVal;
            }
    
            //Pith can have lower & upper values if it is a range, in which case we should select the upper value here
            let pithValue = pith.upper ? pith.upper : pith.value;
    
            retVal.value = parseInt(estFellingYear.older) - parseInt(treeRings) - parseInt(pithValue);
            retVal.formula = "Estimated felling year (older) - Tree rings - Distance to pith";
            retVal.reliability = 3;
            retVal.warnings.push({
                label: "Oldest germination year",
                description: "The value for the oldest possible germination year was calculated using the formula: "+retVal.formula+", since we couldn't find a value for "+this.getDendroMeasurementTypeById(132).name+", nor could be find a value for "+this.getDendroMeasurementTypeById(131).name
            });
            return retVal;
        }
    
        /*
        //WARNING: this gives a very vauge dating, saying almost nothing about germination year, only minimum lifespan
        if(parseInt(estFellingYear.older) && parseInt(treeRings)) {
            retVal.value = parseInt(estFellingYear.older) - parseInt(treeRings);
            retVal.source = "Estimated felling year (older) - Tree rings";
            retVal.reliability = 4;
            return retVal;
        }
        */
    
        //At this point we give up
        return retVal;
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

        if(!isNaN(rawPith)) { //if not not a number... in other words, if pith is a number (and not a string), just return at this point
            return result;
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
    
    
    stripNonDatedObjects(dataObjects, verbose = false) {
        return dataObjects.filter((dataObject) => {
            let notDated = this.getDendroMeasurementByName("Not dated", dataObject);
            if(typeof notDated != "undefined") {
                //if we have explicit information that this is not dated...
                if(verbose) {
                    console.log("Discarding sample "+dataObject.sample_name+" because it's marked as not dated");
                }
                return false;
            }
            let oldestFellingYear = this.dendroLib.getOldestFellingYear(dataObject);
            let youngestFellingYear = this.dendroLib.getYoungestFellingYear(dataObject);
            
            if(!oldestFellingYear.value || !youngestFellingYear.value) {
                //Or if we can't find a felling year...
                if(verbose) {
                    console.log("Discarding sample "+dataObject.sample_name+" because we couldn't find a felling year for it");
                }
                return false;
            }
            return true;
        })
    }

    getDataObjectBySampleName(dataObjects, sampleName) {
        if(typeof sampleName == "undefined") {
            console.warn("Tried to get a dataObject with an undefined sampleName");
            return null;
        }
        for(let key in dataObjects) {
            if(dataObjects[key].sample_name == sampleName) {
                return dataObjects[key];
            }
        }
        return null;
    }

    renderBarHoverTooltip(container, dataObject, tooltips = []) {
        let dendroBarNode = $("svg [sample-name="+dataObject.sample_name+"].dendro-bar");
        let dendroBarGerminationNode = $("svg [sample-name="+dataObject.sample_name+"].dendro-bar-germination-uncertainty");
        let dendroBarFellingNode = $("svg [sample-name="+dataObject.sample_name+"].dendro-bar-felling-uncertainty");
        let sapwoodNode = $("svg [sample-name="+dataObject.sample_name+"].dendro-sapwood-bar");
        let fellingUnknownNode = $("svg [sample-name="+dataObject.sample_name+"].dendro-ukn-felling");
        
        let renderTopOrBottom = false;
        if(tooltips.includes("germinationYearOldest")) {
            this.germinationYearOldestTooltipId = this.renderBarTooltip(container, this.dendroLib.getOldestGerminationYear(dataObject).value, dendroBarGerminationNode, renderTopOrBottom = !renderTopOrBottom, "left");
        }
        if(tooltips.includes("germinationYearYoungest")) {
            this.germinationYearYoungestTooltipId = this.renderBarTooltip(container, this.dendroLib.getYoungestGerminationYear(dataObject).value, dendroBarNode, renderTopOrBottom = !renderTopOrBottom, "left");
        }
        if(tooltips.includes("fellingYearOldest")) {
            this.fellingYearOldestTooltipId = this.renderBarTooltip(container, this.dendroLib.getOldestFellingYear(dataObject).value, dendroBarNode, renderTopOrBottom = !renderTopOrBottom, "right");
        }
        if(tooltips.includes("fellingYearYoungest")) {
            this.fellingYearYoungestTooltipId = this.renderBarTooltip(container, this.dendroLib.getYoungestFellingYear(dataObject).value, dendroBarFellingNode, renderTopOrBottom = !renderTopOrBottom, "right");
        }
        if(tooltips.includes("sapwoodOldest")) {
            this.sapwoodOldestTooltipId = this.renderBarTooltip(container, "Sapwood ≥ 10", sapwoodNode, renderTopOrBottom = !renderTopOrBottom, "left");
        }
        if(tooltips.includes("sapwoodYoungest")) {
            this.sapwoodYoungestTooltipId = this.renderBarTooltip(container, this.dendroLib.getYoungestFellingYear(dataObject).value+10, sapwoodNode, renderTopOrBottom = !renderTopOrBottom, "right");
        }
        if(tooltips.includes("fellingUnknown")) {
            this.fellingUnknownTooltipId = this.renderBarTooltip(container, "Unknown ➟", fellingUnknownNode, renderTopOrBottom = !renderTopOrBottom, "left");
        }
    }

    renderBarTooltip(container, value, el, renderTop = true, renderLeftOrRight = "left") {
        let nodeId = "tooltip-"+nanoid();

        let tooltipGroup = container.append("g")
        .classed("dendro-chart-tooltip", true)
        .attr("id", nodeId)
        tooltipGroup.append("path").attr("opacity", 0);
        tooltipGroup.append("rect").attr("opacity", 0);
        tooltipGroup.append("text").attr("opacity", 0);

        if(value == null) {
            value = "?";
        }

        let numValueChars = value.toString().length;
        let xPos = (numValueChars / 2) + 2;
        let width = numValueChars + 4;

        container.select("#"+nodeId)
        .attr("transform", () => {
            let x = 0;
            if(renderLeftOrRight == "left") {
                x = parseFloat($(el).attr("x")) - xPos;
            }
            else {
                x = parseFloat($(el).attr("x")) + parseFloat($(el).attr("width")) - xPos;
            }
            let y = 0;
            if(renderTop) {
                y = parseFloat($(el).attr("y")) - 5;
            }
            else {
                y = parseFloat($(el).attr("y")) + parseFloat($(el).attr("height")) + 1;
            }
            return "translate("+x+", "+y+")";
        })

        container.select("#"+nodeId+" path")
        .attr("opacity", 1)
        .attr("transform", () => {
            let x = xPos;
            let y = 0;
            let rot = 0;
            if(renderTop) {
                y = 4.9;
                rot = 180;
            }
            else {
                y = -0.9;
            }
            return "translate("+x+", "+y+"), rotate("+rot+")";
        })

        container.select("#"+nodeId+" rect")
        .attr("opacity", 1)
        .attr("width", width)
        .attr("height", 4);

        container.select("#"+nodeId+" text")
        .attr("opacity", 1)
        .attr("x", xPos)
        .attr("y", 2.75)
        .text(value);

        return nodeId;
    }

    unrenderBarHoverTooltip(container) {
        if(this.germinationYearOldestTooltipId) {
            container.selectAll("#"+this.germinationYearOldestTooltipId).remove();
            this.germinationYearOldestTooltipId = null;
        }
        if(this.germinationYearYoungestTooltipId) {
            container.selectAll("#"+this.germinationYearYoungestTooltipId).remove();
            this.germinationYearYoungestTooltipId = null;
        }
        if(this.fellingYearOldestTooltipId) {
            container.selectAll("#"+this.fellingYearOldestTooltipId).remove();
            this.fellingYearOldestTooltipId = null;
        }
        if(this.fellingYearYoungestTooltipId) {
            container.selectAll("#"+this.fellingYearYoungestTooltipId).remove();
            this.fellingYearYoungestTooltipId = null;
        }
        if(this.sapwoodOldestTooltipId) {
            container.selectAll("#"+this.sapwoodOldestTooltipId).remove();
            this.sapwoodOldestTooltipId = null;
        }
        if(this.sapwoodYoungestTooltipId) {
            container.selectAll("#"+this.sapwoodYoungestTooltipId).remove();
            this.sapwoodYoungestTooltipId = null;
        }
        if(this.fellingUnknownTooltipId) {
            container.selectAll("#"+this.fellingUnknownTooltipId).remove();
            this.fellingUnknownTooltipId = null;
        }
    }

    getWarningsBySampleName(sampleName) {
        for(let key in this.sampleWarnings) {
            if(sampleName == this.sampleWarnings[key].sampleName) {
                return this.sampleWarnings[key];
            }
        }
        return false;
    }

    /*
    registerSampleWarning(sampleName, type, warning) {
        let sampleWarnings = this.getWarningsBySampleName(sampleName);

        let warningObj = {
            msg: warning,
            icon: "⚠️",
            type: type
        };

        if(typeof warning == 'string') {
            if(!this.sampleWarningsExists(sampleWarnings, warningObj)) {
                sampleWarnings.warnings.push(warningObj);
            }
        }

        if(typeof warning == 'object') {
            warning.forEach(w => {
                warningObj.msg = w;
                if(!this.sampleWarningsExists(sampleWarnings, warningObj)) {
                    sampleWarnings.warnings.push(warningObj);
                }
            });
        }
    }
    */

    sampleWarningsExists(sampleWarnings, newWarningObj) {
        let warningExists = false;
        sampleWarnings.warnings.forEach(regWarning => {
            if(regWarning.type == newWarningObj.type && regWarning.msg == newWarningObj.msg) {
                warningExists = true;
            }
        });

        return warningExists;
    }

    getBarColorByTreeSpecies(treeSpecies, colorMod = false) {

        let colors = [];
        if(this.USE_LOCAL_COLORS) {
            colors = ['#0074ab', '#005178', '#bfeaff', '#80d6ff', '#ff7900', '#b35500', '#ffdebf', '#ffbc80', '#daff00', '#99b300'];
            colors = ["#da4167","#899d78","#03440c","#392f5a","#247ba0","#0b3948","#102542"];
        }
        else {
            colors = this.sqs.color.getColorScheme(7);
        }

        let selectedColor = null;

        switch(treeSpecies.toLowerCase()) {
            case "hassel":
                selectedColor = colors[0];
                break;
            case "gran":
                selectedColor = colors[1];
                break;
            case "tall":
                selectedColor = colors[2];
                break;
            case "asp":
                selectedColor = colors[3];
                break;
            case "björk":
                selectedColor = colors[4];
                break;
            case "ek":
                selectedColor = colors[5];
                break;
            case "bok":
                selectedColor = colors[6];
                break;
        }

        if(!selectedColor) {
            return "#000";
        }

        if(colorMod) {
            let colorObj = d3.color(selectedColor);
            colorObj.r += colorMod;
            colorObj.g += colorMod;
            colorObj.b += colorMod;
            selectedColor = "rgb("+colorObj.r+", "+colorObj.g+", "+colorObj.b+")";
        }

        return selectedColor;
    }

    getBarProperties(dataObject) {
        let d = dataObject;

        let props = {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        };

        //try to figure out a reasonable value for X
        let fellingYear = this.getOldestFellingYear(d).value;
        if(!fellingYear) {
            fellingYear = this.getYoungestFellingYear(d).value;
        }
        props.x = this.xScale(fellingYear);



        //Width should ideally be from the younger planting year to the older felling year
        let plantingYear = this.getYoungestGerminationYear(d).value;
        if(!plantingYear) {
            plantingYear = this.getOldestGerminationYear(d).value;
        }
        props.widthRaw = this.xScale(fellingYear) - this.xScale(plantingYear);
        props.width = (this.xScale(fellingYear) - this.xScale(plantingYear));


        //make sure the x value is not smaller than the stop-x (width)


        return props;
    }

    getBarObjectFromDataObject(dataObject, barIndex = 0) {
        let d = dataObject;
        let barObject = {
            sample_name: d.sample_name,
            //dataObject: dataObject,
            height: 0,
            certainty: {
                x: {
                    value: 0,
                    warnings: [],
                },
                y: {
                    value: barIndex * (this.barHeight + this.barMarginY) + this.chartTopPadding,
                    warnings: []
                },
                width: {
                    value: 0,
                    warnings: []
                }
            },
            germinationUncertainty: {
                x: {
                    value: 0,
                    warnings: [],
                },
                y: {
                    value: barIndex * (this.barHeight + this.barMarginY) + this.chartTopPadding,
                    warnings: []
                },
                width: {
                    value: 0,
                    warnings: []
                }
            },
            fellingUncertainty: {
                x: {
                    value: 0,
                    warnings: [],
                },
                y: {
                    value: barIndex * (this.barHeight + this.barMarginY) + this.chartTopPadding,
                    warnings: []
                },
                width: {
                    value: 0,
                    warnings: []
                }
            },
            sapwood: {
                width: {
                    value: 0,
                    warnings: []
                }
            }
        };


        let oldestFellingYear = this.dendroLib.getOldestFellingYear(d);
        let youngestFellingYear = this.dendroLib.getYoungestFellingYear(d);
        let youngestGerminationYear = this.dendroLib.getYoungestGerminationYear(d);
        let oldestGerminationYear = this.dendroLib.getOldestGerminationYear(d);

        //CERTAINTY BAR

        //Figure out X
        if(youngestGerminationYear.value) {
            barObject.certainty.x.value = this.xScale(youngestGerminationYear.value);
            barObject.certainty.x.warnings = youngestGerminationYear.warnings;
            let unknownSapwood = 10; //If the number of sapwood rings are unknown, we assume at least 10
            barObject.sapwood.width.value = this.xScale(youngestGerminationYear.value + oldestFellingYear.value - youngestGerminationYear.value + unknownSapwood);
        }

        //Figure out Width
        if(youngestGerminationYear.value && oldestFellingYear.value) {

            let datingUncert = 0;
            if(parseInt(oldestFellingYear.dating_uncertainty)) {
                datingUncert = parseInt(oldestFellingYear.dating_uncertainty);
            }

            barObject.certainty.width.value = this.xScale(oldestFellingYear.value) - this.xScale(youngestGerminationYear.value)
            //barObject.certainty.width.warnings = oldestFellingYear.warnings.concat(youngestGerminationYear.warnings);
            barObject.certainty.width.warnings = oldestFellingYear.warnings;
        }

        //GERM-UNCERT BAR
        //X
        if(oldestGerminationYear.value == null) {
            //If this is null then it's an unknown year and should be drawn as a bar fading to infinity
            barObject.germinationUncertainty.x.value = null;
        }
        else {
            barObject.germinationUncertainty.x.value = this.xScale(oldestGerminationYear.value);
        }
        barObject.germinationUncertainty.x.warnings = oldestGerminationYear.warnings;

        //Width
        if(oldestGerminationYear.value == null) {
            barObject.germinationUncertainty.width.value = null;    
        }
        else {
            barObject.germinationUncertainty.width.value = this.xScale(youngestGerminationYear.value) - this.xScale(oldestGerminationYear.value);
        }
        barObject.germinationUncertainty.width.warnings = youngestGerminationYear.warnings.concat(oldestGerminationYear.warnings);

        //FELLING-UNCERT BAR
        //X
        barObject.fellingUncertainty.x.value = this.xScale(oldestFellingYear.value);
        barObject.fellingUncertainty.x.warnings = oldestFellingYear.warnings;
        //Width
        barObject.fellingUncertainty.width.value = this.xScale(youngestFellingYear.value) - this.xScale(oldestFellingYear.value);
        barObject.fellingUncertainty.width.warnings = youngestFellingYear.warnings.concat(oldestFellingYear.warnings);

        

        return barObject;
    }

    concatWarnings(warnings, datingResult) {
        if(datingResult && datingResult.warnings) {
            warnings = warnings.concat(datingResult.warnings);
        }
        return warnings;
    }

    drawCertaintyBars(container, dataObjects, initialTransitions = true) {

        let bars = container.selectAll(".dendro-bar")
            .data(dataObjects)
            .join("rect")
            .classed("dendro-bar", true)
            .attr("fill", (d) => {
                let treeSpecies = this.getDendroMeasurementByName("Tree species", d);
                if(!treeSpecies) {
                    return "#666";
                }
                return this.getBarColorByTreeSpecies(treeSpecies);
            })
            .attr("sample-name", d => d.sample_name);

        if(initialTransitions) {
            bars.attr("x", (d) => {
                return d.barObject.certainty.x.value;
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
            //this.registerSampleWarning(d.barObject.sample_name, "youngestGerminationYear", d.barObject.warnings);
            return d.barObject.certainty.x.value;
        })
        .attr("width", (d, i) => {
            //this.registerSampleWarning(d.barObject.sample_name, "youngestFellingYear", d.barObject.warnings);
            return d.barObject.certainty.width.value;
        })

        container.selectAll(".dendro-bar")
            .on("mouseover", (evt) => {
                let sampleName = $(evt.target).attr("sample-name");
                let d = this.getDataObjectBySampleName(dataObjects, sampleName);
                this.renderBarHoverTooltip(container, d, ["germinationYearYoungest", "fellingYearOldest"]);
                //this.drawHorizontalGuideLines(container, d);
            })
            .on("mouseout", (evt) => {
                this.unrenderBarHoverTooltip(container);
                this.removeHorizontalGuideLines(container);
            })
            .on("click", (evt) => {
                let sampleName = $(evt.target).attr("sample-name");
                let d = this.getDataObjectBySampleName(dataObjects, sampleName);
                this.drawInfoTooltip(d, evt);
            });
    }

    drawSapwoodBars(container, dataObjects) {
        let sapwoodBars = container.selectAll(".dendro-sapwood-bar")
        .data(dataObjects)
            .join("rect")
            .classed("dendro-bar", true)
            .classed("dendro-sapwood-bar", true)
            .attr("fill", (d) => {
                let treeSpecies = this.getDendroMeasurementByName("Tree species", d);
                if(!treeSpecies) {
                    return "#ccc";
                }
                return this.getBarColorByTreeSpecies(treeSpecies, 20);
            })
            .attr("sample-name", d => d.sample_name)
            .attr("visibility", d => {
                let estimatedFellingYear = this.getDendroMeasurementByName("Estimated felling year", d);
                if(parseInt(estimatedFellingYear.younger) || parseInt(estimatedFellingYear.older)) {
                    return "hidden";
                }
                else {
                    return "visible";
                }
                //return d.barObject.fellingUncertainty.width.value == 0 ? "visible" : "hidden";
            })
            .attr("x", (d) => {
                return d.barObject.certainty.x.value + d.barObject.certainty.width.value;
            })
            .attr("y", (d, i) => {
                return i * (this.barHeight + this.barMarginY) + this.chartTopPadding;
            })
            .attr("width", (d, i) => {
                let value = (this.xScale(0) - this.xScale(10)) * -1;
                return value; //Just trying to get the width in grahical units equal to 10 years
            })
            .attr("height", this.barHeight);
        
        sapwoodBars.on("mouseover", (evt) => {
                let sampleName = $(evt.target).attr("sample-name");
                let d = this.getDataObjectBySampleName(dataObjects, sampleName);
                this.renderBarHoverTooltip(container, d, ["sapwoodOldest", "sapwoodYoungest"]);
            })
            .on("mouseout", (evt) => {
                this.unrenderBarHoverTooltip(container);
            });

        let fellingUnknownBars = container.selectAll(".dendro-ukn-felling")
        .data(dataObjects)
            .join("rect")
            .classed("dendro-bar", true)
            .classed("dendro-ukn-felling", true)
            .attr("fill", "url(#uknFellingGradient)")
            .attr("sample-name", d => d.sample_name)
            .attr("visibility", d => {
                let estimatedFellingYear = this.getDendroMeasurementByName("Estimated felling year", d);
                if(parseInt(estimatedFellingYear.younger) || parseInt(estimatedFellingYear.older)) {
                    return "hidden";
                }
                else {
                    return "visible";
                }
            })
            .attr("x", (d) => {
                return d.barObject.certainty.x.value + d.barObject.certainty.width.value + (this.xScale(0) - this.xScale(10)) * -1;
            })
            .attr("y", (d, i) => {
                return i * (this.barHeight + this.barMarginY) + this.chartTopPadding;
            })
            .attr("width", (d, i) => {
                let value = 100 - (d.barObject.certainty.x.value + d.barObject.certainty.width.value + (this.xScale(0) - this.xScale(10)) * -1);
                return value;
            })
            .attr("height", this.barHeight);

            fellingUnknownBars.on("mouseover", (evt) => {
                let sampleName = $(evt.target).attr("sample-name");
                let d = this.getDataObjectBySampleName(dataObjects, sampleName);
                this.renderBarHoverTooltip(container, d, ["fellingUnknown"]);
            })
            .on("mouseout", (evt) => {
                this.unrenderBarHoverTooltip(container);
            });

    }

    addDrawableSampleWarning(collection, dataObject, type, warningMsg) {
        let sampleName = dataObject.sample_name;
        let found = false;
        for(let key in collection) {
            if(collection[key].sampleName == sampleName && collection[key].type == type) {
                found = true;
                
                let unique = true;
                collection[key].warnings.forEach(msg => {
                    if(msg == warningMsg) {
                        unique = false;
                    }
                })
                if(unique) {
                    collection[key].warnings.push(warningMsg);
                }
            }
        }
        
        if(!found) {
            collection.push({
                sampleName: sampleName,
                type: type,
                barObject: dataObject.barObject,
                warnings: [warningMsg]
            });
        }
    }

    drawSampleBarWarnings(container, dataObjects) {
        
        let drawableSampleWarnings = [];
        dataObjects.forEach(d => {

            d.barObject.certainty.x.warnings.forEach(warningMsg => {
                this.addDrawableSampleWarning(drawableSampleWarnings, d, "youngestGerminationYear", warningMsg);
            });

            d.barObject.certainty.width.warnings.forEach(warningMsg => {
                this.addDrawableSampleWarning(drawableSampleWarnings, d, "oldestFellingYear", warningMsg);
            });

            d.barObject.germinationUncertainty.width.warnings.forEach(warningMsg => {
                this.addDrawableSampleWarning(drawableSampleWarnings, d, "youngestGerminationYear", warningMsg);
            });

            d.barObject.fellingUncertainty.width.warnings.forEach(warningMsg => {
                this.addDrawableSampleWarning(drawableSampleWarnings, d, "oldestFellingYear", warningMsg);
            });

            if(this.showUncertainty == "estimates") {
                
                d.barObject.germinationUncertainty.x.warnings.forEach(warningMsg => {
                    this.addDrawableSampleWarning(drawableSampleWarnings, d, "oldestGerminationYear", warningMsg);
                });

                d.barObject.fellingUncertainty.x.warnings.forEach(warningMsg => {
                    this.addDrawableSampleWarning(drawableSampleWarnings, d, "youngestFellingYear", warningMsg);
                });
            }
            
        });

        let warningFlags = container.selectAll('.warning-flag')
        .data(drawableSampleWarnings)
        .join("text")
        .classed("warning-flag fa fa-exclamation-triangle", true)
        .attr("sample-name", dsw => {
            return dsw.sampleName;
        })
        .html("&#xf071;")
        .attr("text-anchor", "middle")
        .attr("dating-type", dsw => dsw.type)
        .attr("visibility", (dsw) => {
            let barObject = dsw.barObject;
            switch(dsw.type) {
                case "youngestFellingYear":
                    if(barObject.fellingUncertainty.x.value == 0 || !barObject.fellingUncertainty.x.value) {
                        return "hidden";
                    }
                    break;
                case "oldestGerminationYear": //if oldestGerminationYear width is zero, we don't draw warning for this
                    if(barObject.germinationUncertainty.width.value == 0 || !barObject.germinationUncertainty.width.value) {
                        return "hidden";
                    }
                    break;
            }
            return "visible";
        })
        .attr("x", (dsw, i) => {
            let barObject = dsw.barObject;
            let returnValue = 0;
            let offset = 0.0;
            let offsetMod = 2.0;
            switch(dsw.type) {
                case "oldestFellingYear":
                    returnValue = barObject.fellingUncertainty.x.value;
                    offset -= offsetMod;
                    break;
                case "youngestFellingYear":
                    returnValue = barObject.fellingUncertainty.x.value + barObject.fellingUncertainty.width.value;
                    offset += offsetMod;
                    break;
                case "youngestGerminationYear":
                    returnValue = barObject.certainty.x.value;
                    //returnValue = barObject.germinationUncertainty.x.value + barObject.germinationUncertainty.width.value;
                    offset += offsetMod;
                    break;
                case "oldestGerminationYear":
                    returnValue = barObject.germinationUncertainty.x.value;
                    offset -= offsetMod;
                    break;
            }

            return returnValue + offset;
        })
        .attr("y", (dsw, i) => {
            return dsw.barObject.certainty.y.value + 2.5;
        })
        .on("mouseover", (evt, swr) => {
            this.drawWarningTooltip(swr, evt)
        })
        .on("mouseout", (evt, swr) => {
            this.removeWarningTooltip(swr, evt)
        });
    }

    drawWarningTooltip(swr, evt) {
        let content = "<ul class='tooltip-warning-list'>";
        swr.warnings.forEach(warningMsg => {
            content += "<li>"+warningMsg+"</li>";
        });
        content += "</ul>";
        
        this.drawTooltip(content, evt.pageX, evt.pageY);
    }

    removeWarningTooltip(swr, evt) {
        this.removeTooltip();
    }

    drawTooltip(content, xPos, yPos) {
        if(this.tooltipId != null) {
            return;
        }
        let tooltipContainer = document.createElement("div");
        this.tooltipId = "tooltip-"+nanoid();
        $(tooltipContainer).attr("id", this.tooltipId);
        $(tooltipContainer).addClass("dendro-chart-tooltip-container");
        $(tooltipContainer).css("left", xPos+10);
        $(tooltipContainer).css("top", yPos+2);
        $(tooltipContainer).html(content);

        $("body").append(tooltipContainer);

        //$(tooltipContainer).css("top", evt.mouseX);
        
        setTimeout(() => {
            $("#dendro-chart-svg").on("click", (evt) => {
                if(this.tooltipId) {
                    $("#"+this.tooltipId).remove();
                    this.tooltipId = null;
                    $("#dendro-chart-svg").off("click");
                }
            })
        }, 500)
    }

    removeTooltip() {
        if(this.tooltipId) {
            $("#"+this.tooltipId).remove();
            this.tooltipId = null;
        }
    }

    getDendroMetadataForLookupId(lookupId) {
        for(let key in this.siteReport.siteData.lookup_tables.dendro) {
            if(this.siteReport.siteData.lookup_tables.dendro[key].dendro_lookup_id == lookupId) {
                return this.siteReport.siteData.lookup_tables.dendro[key];
            }
        }
        return false;
    }
    
    getSampleGroupBySampleName(sampleName, siteData) {
		for(let key in siteData.sample_groups) {
			for(let sampleKey in siteData.sample_groups[key].physical_samples) {
				if(siteData.sample_groups[key].physical_samples[sampleKey].sample_name == sampleName) {
					return siteData.sample_groups[key]
				}
			}
		}
		return null;
	}

    getSampleBySampleName(sampleName, sampleGroup) {
        for(let key in sampleGroup.physical_samples) {
            if(sampleGroup.physical_samples[key].sample_name == sampleName) {
                return sampleGroup.physical_samples[key];
            }
        }
        return null;
    }


    drawInfoTooltip(dataObject, evt) {
        if(this.infoTooltipId != null) {
            return;
        }

        let sg = this.getSampleGroupBySampleName(dataObject.sample_name, this.siteReport.siteData);
        let sample = this.getSampleBySampleName(dataObject.sample_name, sg);

        console.log(sg, sample);

        let sampleVars = [];

        sampleVars.push({
            label: "Sample name",
            value: dataObject.sample_name
        });

        sampleVars.push({
            label: "Sample group",
            value: sg.sample_group_name
        });

        sampleVars.push({
            label: "Sample type",
            value: sample.sample_type_name,
            tooltip: sample.sample_type_description
        });

        let sampleDescriptions = "";
        sample.descriptions.forEach(desc => {
            let ttId = "value-tooltip-"+nanoid();
            sampleDescriptions += "<span id='"+ttId+"'>"+desc.description+"</span>, ";
            this.sqs.tooltipManager.registerTooltip("#"+ttId, desc.type_description, { drawSymbol: true });
        });
        sampleDescriptions = sampleDescriptions.substring(0, sampleDescriptions.length-2);
        sampleVars.push({
            label: "Sample descriptions",
            value: sampleDescriptions
        });

        let sampleLocations = "<table class='info-tooltip-value-table'><thead>";
        sampleLocations += "<th>Location type</th>";
        sampleLocations += "<th>Value</th>";
        sampleLocations += "</thead><tbody>";
        sample.locations.forEach(loc => {
            let ttId = "value-tooltip-"+nanoid();
            sampleLocations += "<tr><td id='"+ttId+"'>"+loc.location_type+":</td><td>"+loc.location+"</td></tr>";
            this.sqs.tooltipManager.registerTooltip("#"+ttId, loc.location_type_description, { drawSymbol: true });
        });
        sampleLocations += "</tbody></table>";
        if(sample.locations.length > 0) {
            sampleVars.push({
                label: "Sample locations",
                value: sampleLocations
            });
        }


        //TODO: Sampling contexts exists on a sample group level
        /*
        let samplingContexts = "";
        sample.sampling_context.forEach(samplingContext => {

        });
        */
        

        /*
        let sampleDimensions = "";
        sample.dimensions.forEach(dim => {
            let ttId = "value-tooltip-"+nanoid();
            sampleDimensions += "<span id='"+ttId+"'>"+dim.description+"</span>, "
            this.sqs.tooltipManager.registerTooltip("#"+ttId, dim.type_description, { drawSymbol: true });
        });
        sampleDimensions = sampleDimensions.substring(0, sampleDimensions.length-2);
        sampleVars.push({
            label: "Sample dimensions",
            value: sampleDimensions
        });
        */


        let sampleFeatures = "";
        sample.features.forEach(feature => {
            let ttId = "value-tooltip-"+nanoid();
            sampleFeatures += "<span id='"+ttId+"'>"+feature.feature_type_name+"</span>, ";
            if(feature.feature_type_description) {
                this.sqs.tooltipManager.registerTooltip("#"+ttId, feature.feature_type_description, { drawSymbol: true });
            }
        });
        sampleFeatures = sampleFeatures.substring(0, sampleFeatures.length-2);
        if(sampleFeatures.length > 0) {
            sampleVars.push({
                label: "Sample features",
                value: sampleFeatures
            });
        }
        

        //TODO:  sample.locations, sample.dimensions

        dataObject.datasets.forEach(dataset => {
            let value = dataset.value;
            if(value == "complex") {
                value = this.dendroLib.renderDendroDatingAsString(dataset.data, this.siteReport.siteData, true, this.sqs);
            }
            
            let varMeta = this.getDendroMetadataForLookupId(dataset.id);
            sampleVars.push({
                label: dataset.label,
                value: value,
                tooltip: varMeta.description
            });
        });

        let tooltipContainer = document.createElement("div");
        this.infoTooltipId = "info-tooltip-"+nanoid();
        $(tooltipContainer).attr("id", this.infoTooltipId);
        $(tooltipContainer).addClass("dendro-chart-tooltip-container");
        $(tooltipContainer).css("left", evt.pageX+10);
        $(tooltipContainer).css("top", evt.pageY+2);

        let content = "<i class='fa fa-close dendro-tooltip-close-button'></i>";

        content += "<table class='dendro-chart-tooltip-container-content'>";
        sampleVars.forEach(sv => {
            let dendroVarLabelTooltipId = "dendro-var-"+nanoid();
            content += "<tr><td id='"+dendroVarLabelTooltipId+"' class='dendro-tooltip-variable-name-text'>"+sv.label+":</td><td>"+sv.value+"</td></tr>";
            if(sv.tooltip) {
                this.sqs.tooltipManager.registerTooltip("#"+dendroVarLabelTooltipId, sv.tooltip, { drawSymbol: true });
            }
        });
        content += "</table>";

        $(tooltipContainer).html(content);

        $("body").append(tooltipContainer);
        $(".dendro-tooltip-close-button").on("click", () => {
            this.removeInfoTooltip();
        });

        let bottomOfTooltipBox = $(tooltipContainer).position().top + $(tooltipContainer).height();
        if(bottomOfTooltipBox > $(document).height() - 100) {
            $(tooltipContainer).css("top", evt.pageY - $(tooltipContainer).height() - 20);
        }
        
        setTimeout(() => {
            $("#dendro-chart-svg").on("click", (evt) => {
                this.removeInfoTooltip();
            })
        }, 500);
    }

    /*
    createTooltipContainer() {
        let tooltipContainer = document.createElement("div");
        this.infoTooltipId = "info-tooltip-"+nanoid();
        $(tooltipContainer).attr("id", this.infoTooltipId);
        $(tooltipContainer).addClass("dendro-chart-tooltip-container");
        $(tooltipContainer).css("left", evt.pageX+10);
        $(tooltipContainer).css("top", evt.pageY+2);

        let content = "<i class='fa fa-close dendro-tooltip-close-button'></i>";
        content += "<div class='dendro-chart-tooltip-container-content'>";
        content += "</div>";

        $(tooltipContainer).html(content);

        $("body").append(tooltipContainer);
        $(".dendro-tooltip-close-button").on("click", () => {
            this.removeInfoTooltip();
        });

        return ".dendro-chart-tooltip-container-content":
    }
    */

    removeInfoTooltip() {
        if(this.infoTooltipId) {
            $("#dendro-chart-svg").off("click");
            $("#"+this.infoTooltipId).remove();
            this.infoTooltipId = null;
        }
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

        let dendroBarNode = $("svg [sample-name="+d.sample_name+"].dendro-bar");
        let dendroBarGermUncertNode = $("svg [sample-name="+d.sample_name+"].dendro-bar-germination-uncertainty");

        let x2 = (() => {
            //get earliest X point
            let margin = 1 + 9;
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
        .attr("sample-name", d => d.sample_name)
        .html("⚠️")
        .attr("x", (d, i) => {
            let dendroBarNode = $("svg [sample-name="+d.sample_name+"].dendro-bar");
            return dendroBarNode.attr("x");
        })
        .attr("y", (d, i) => {
            return i * (this.barHeight + this.barMarginY) + this.chartTopPadding + 1.5;
        })
        .attr("visibility", (d) => {
            let warnings = this.getWarningsBySampleName(d.sample_name);
            console.log(warnings);

            return true;

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
                //let warnings = this.getWarningsBySampleName(sampleName);

                //let warnFlagNode = $("svg [sample-name="+d.sampleName+"].warning-flag");

                let tooltipContainer = document.createElement("div");
                $(tooltipContainer).addClass("dendro-chart-tooltip-container");
                $(tooltipContainer).css("left", evt.pageX);
                $(tooltipContainer).css("top", evt.pageY)

                let content = "";

                //console.log(warnings);

                /*
                let germYoung = this.dendroLib.getYoungestGerminationYear(d);
                if(germYoung && germYoung.reliability != 1) {
                    content += "<p>The youngest possible germination year for this sample has a high degree of uncertainty. It's calculated as follows: ";
                    content += germYoung.source+"</p>";
                    $(tooltipContainer).html(content);
                }
                let germOld = this.dendroLib.getOldestGerminationYear(d);
                if(germOld && germOld.reliability != 1) {
                    content += "<p>The oldest possible germination year for this sample has a high degree of uncertainty. It's calculated as follows: ";
                    content += germOld.source+"</p>";
                    $(tooltipContainer).html(content);
                }

                let fellingYoung = this.dendroLib.getYoungestFellingYear(d);
                if(fellingYoung && fellingYoung.reliability != 1) {
                    content += "<p>The youngest possible felling year for this sample has a high degree of uncertainty. It's calculated as follows: ";
                    content += fellingYoung.source+"</p>";
                    $(tooltipContainer).html(content);
                }
                let fellingOld = this.dendroLib.getOldestFellingYear(d);
                if(fellingOld && fellingOld.reliability != 1) {
                    content += "<p>The oldest possible felling year for this sample has a high degree of uncertainty. It's calculated as follows: ";
                    content += fellingOld.source+"</p>";
                    $(tooltipContainer).html(content);
                }
                */

                $("body").append(tooltipContainer);
            })
            .on("mouseout", (evt) => {
                $(".dendro-chart-tooltip-container").remove();
                //container.selectAll(".dendro-info-tooltip").remove();
            });
    }

    drawStroke(container, dataObjects, type = "germination") {
        let strokeWidth = 0.2;
        let dashArrayValue = "1.0";
        container.selectAll(".dendro-bar-"+type+"-uncertainty-top-stroke-line")
        .data(dataObjects)
        .join("line")
        .attr("visibility", (d) => {
            if(this.showUncertainty == "none") {
                return "hidden";
            }
            if(type == "felling" && d.barObject.fellingUncertainty.width.value == 0) {
                return "hidden";
            }
            return "visible";
        })
        .attr("stroke", "rgba(0, 0, 0, 0.1)")
        .attr("stroke-width", strokeWidth)
        .attr("x1", (d) => {
            if(type == "germination") {
                if(d.barObject.germinationUncertainty.x.value == null) {
                    return 10;
                }
                else {
                    return d.barObject.germinationUncertainty.x.value;
                }
            }
            if(type == "felling") {
                return d.barObject.fellingUncertainty.x.value;
            }
        })
        .attr("x2", d => {
            if(type == "germination") {
                return d.barObject.certainty.x.value;
            }
            if(type == "felling") {
                return d.barObject.fellingUncertainty.x.value + d.barObject.fellingUncertainty.width.value;
            }
        })
        .attr("y1", (d, i) => {
            return i * (this.barHeight + this.barMarginY) + this.chartTopPadding + strokeWidth/2;
        })
        .attr("y2", (d, i) => {
            return i * (this.barHeight + this.barMarginY) + this.chartTopPadding + strokeWidth/2;
        })
        .attr("stroke-dasharray", dashArrayValue);


        container.selectAll(".dendro-bar-"+type+"-uncertainty-bottom-stroke-line")
        .data(dataObjects)
        .join("line")
        .attr("visibility", (d) => {
            if(this.showUncertainty == "none") {
                return "hidden";
            }
            if(type == "felling" && d.barObject.fellingUncertainty.width.value == 0) {
                return "hidden";
            }
            return "visible";
        })
        .attr("stroke", "rgba(0, 0, 0, 0.1)")
        .attr("stroke-width", strokeWidth)
        .attr("x1", (d) => {
            if(type == "germination") {
                if(d.barObject.germinationUncertainty.x.value == null) {
                    return 10;
                }
                else {
                    return d.barObject.germinationUncertainty.x.value;
                }
            }
            if(type == "felling") {
                return d.barObject.fellingUncertainty.x.value;
            }
        })
        .attr("x2", d => {
            if(type == "germination") {
                return d.barObject.certainty.x.value;
            }
            if(type == "felling") {
                return d.barObject.fellingUncertainty.x.value + d.barObject.fellingUncertainty.width.value;
            }
        })
        .attr("y1", (d, i) => {
            return i * (this.barHeight + this.barMarginY) + this.chartTopPadding + this.barHeight - strokeWidth/2;
        })
        .attr("y2", (d, i) => {
            return i * (this.barHeight + this.barMarginY) + this.chartTopPadding + this.barHeight - strokeWidth/2;
        })
        .attr("stroke-dasharray", dashArrayValue);



        container.selectAll(".dendro-bar-"+type+"-uncertainty-end-stroke-line")
        .data(dataObjects)
        .join("line")
        .attr("visibility", (d) => {
            if(this.showUncertainty == "none") {
                return "hidden";
            }

            if(type == "felling" && d.barObject.fellingUncertainty.width.value == 0) {
                return "hidden";
            }
            
            let result = "visible";
            if(type == "germination") {
                if(d.barObject.germinationUncertainty.x.value == null || d.barObject.germinationUncertainty.width.value == null) {
                    result = "hidden";
                }
            }
            if(type == "felling") {
                if(d.barObject.fellingUncertainty.x.value == null || d.barObject.fellingUncertainty.width.value == null) {
                    result = "hidden";
                }
            }
            
            return result;
        })
        .attr("stroke", "rgba(0, 0, 0, 0.1)")
        .attr("stroke-width", strokeWidth)
        .attr("x1", (d) => {
            if(type == "germination") {
                if(d.barObject.germinationUncertainty.x.value == null) {
                    return 10;
                }
                else {
                    return d.barObject.germinationUncertainty.x.value;
                }
            }
            if(type == "felling") {
                return d.barObject.fellingUncertainty.x.value + d.barObject.fellingUncertainty.width.value;
            }
        })
        .attr("x2", d => {
            if(type == "germination") {
                if(d.barObject.germinationUncertainty.x.value == null) {
                    return 10;
                }
                else {
                    return d.barObject.germinationUncertainty.x.value;
                }
            }
            if(type == "felling") {
                return d.barObject.fellingUncertainty.x.value + d.barObject.fellingUncertainty.width.value;
            }
        })
        .attr("y1", (d, i) => {
            return i * (this.barHeight + this.barMarginY) + this.chartTopPadding + strokeWidth/2;
        })
        .attr("y2", (d, i) => {
            return i * (this.barHeight + this.barMarginY) + this.chartTopPadding + this.barHeight - strokeWidth/2;
        })
        .attr("stroke-dasharray", dashArrayValue);


        /*
        container.selectAll(".dendro-bar-germination-uncertainty-end-stroke-line")
        .data(dataObjects)
        .join("line")
        .attr("visibility", (d) => {
            if(this.showUncertainty == "none") {
                return "hidden";
            }
            if(d.barObject.germinationUncertainty.x.value == null || d.barObject.germinationUncertainty.width.value == null) {
                return "visible";
            }
            else {
                return "hidden";
            }
        })
        .attr("stroke", "rgba(0, 0, 0, 0.1)")
        .attr("stroke-width", strokeWidth)
        .attr("x1", 10)
        .attr("x2", d => d.barObject.certainty.x.value)
        .attr("y1", (d, i) => {
            return i * (this.barHeight + this.barMarginY) + this.chartTopPadding + this.barHeight - strokeWidth;
        })
        .attr("y2", (d, i) => {
            return i * (this.barHeight + this.barMarginY) + this.chartTopPadding + this.barHeight - strokeWidth;
        })
        .attr("stroke-dasharray", "1.5");
        */
    }

    drawGerminationUncertaintyBars(container, dataObjects) {
        container.selectAll(".dendro-bar-germination-uncertainty")
        .data(dataObjects)
        .join("rect")
        .classed("dendro-bar-uncertain", true)
        .classed("dendro-bar-germination-uncertainty", true)
        .classed("dendro-bar-germination-high-uncertainty", d => {
            return false; //FIXME: what is this? do we want this?
        })
        .attr("sample-name", d => d.sample_name)
        .attr("y", (d, i) => {
            return i * (this.barHeight + this.barMarginY) + this.chartTopPadding;
        })
        .attr("height", this.barHeight)
        .attr("width", 0)
        .attr("x", (d) => {
            return d.barObject.certainty.x.value;
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
        .attr("fill", (d) => {
            if(d.barObject.germinationUncertainty.x.value == null) {
                return "url(#uknGerminationGradient)";
            }
            else {
                return "rgba(0,0,0,0.2)";
            }
        })
        .attr("x", (d) => {
            if(d.barObject.germinationUncertainty.x.value == null) {
                return 10;
            }
            else {
                return d.barObject.germinationUncertainty.x.value;
            }
        })
        .attr("width", (d, i) => {
            if(d.barObject.germinationUncertainty.width.value == null) {
                //return 20;
                return d.barObject.certainty.x.value - 10;
            }
            //this.registerSampleWarning(barObject.sample_name, barObject.germinationUncertainty.width.warnings);
            return d.barObject.germinationUncertainty.width.value;
        });

        
    this.drawStroke(container, dataObjects, "germination");
        
    container.selectAll(".dendro-bar-germination-uncertainty")
        .on("mouseover", (evt) => {
            let sampleName = $(evt.target).attr("sample-name");
            let d = this.getDataObjectBySampleName(dataObjects, sampleName);
            if(!d) {
                console.warn("Couldn't find dataObject with sampleName", sampleName);
            }
            this.renderBarHoverTooltip(container, d, ["germinationYearOldest", "germinationYearYoungest"]);
            //this.drawHorizontalGuideLines(container, d);
        })
        .on("mouseout", (evt) => {
            this.unrenderBarHoverTooltip(container);
            //this.removeHorizontalGuideLines(container);
        }).on("click", (evt) => {
            let sampleName = $(evt.target).attr("sample-name");
            let d = this.getDataObjectBySampleName(dataObjects, sampleName);
            this.drawInfoTooltip(d, evt);
        });
        
    }

    drawFellingUncertaintyBars(container, dataObjects) {

        container.selectAll(".dendro-bar-felling-uncertainty")
            .data(dataObjects)
            .join("rect")
            .attr("fill", "rgba(0, 0, 0, 0.2)")
            .classed("dendro-bar-uncertain", true)
            .classed("dendro-bar-felling-uncertainty", true)
            .attr("sample-name", d => d.sample_name)
            .attr("x", (d) => {
                return d.barObject.fellingUncertainty.x.value;
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
                //this.registerSampleWarning(barObject.sample_name, "oldestFellingYear", barObject.fellingUncertainty.width.warnings);
                return d.barObject.fellingUncertainty.width.value;
            })
            .attr("height", this.barHeight)


        container.selectAll(".dendro-bar-felling-uncertainty")
            .on("mouseover", (evt) => {
                let sampleName = $(evt.target).attr("sample-name");
                let d = this.getDataObjectBySampleName(dataObjects, sampleName);
                this.renderBarHoverTooltip(container, d, ["fellingYearOldest", "fellingYearYoungest"]);
                //this.drawHorizontalGuideLines(container, d);
            })
            .on("mouseout", (evt) => {
                this.unrenderBarHoverTooltip(container);
                //this.removeHorizontalGuideLines(container);
            }).on("click", (evt) => {
                let sampleName = $(evt.target).attr("sample-name");
                let d = this.getDataObjectBySampleName(dataObjects, sampleName);
                this.drawInfoTooltip(d, evt);
            });
            
        this.drawStroke(container, dataObjects, "felling");
    }

    

    drawGerminationLabels(container, dataObjects) {
        container.selectAll(".dendro-label-planted")
            .data(dataObjects)
            .enter()
            .append("text")
            .classed("dendro-text", true)
            .attr("x", (d) => {
                let plantingYear = this.dendroLib.getYoungestGerminationYear(d).value;
                if(!plantingYear) {
                    plantingYear = this.dendroLib.getOldestGerminationYear(d).value;
                    console.warn("Warning - using older planting year for planting label")
                }
                return this.xScale(plantingYear) + 5;
            })
            .attr("y", (d, i) => {
                return i * (this.barHeight + this.barMarginY) + this.fontSize;
            })
            .text(d => {
                return this.dendroLib.getOldestGerminationYear(d).value+" - "+this.dendroLib.getYoungestGerminationYear(d).value;

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
                let fellingYear = this.dendroLib.getOldestFellingYear(d).value;
                if(!fellingYear) {
                    fellingYear = this.dendroLib.getYoungestFellingYear(d).value;
                    console.warn("Warning - using younger felling year for felling label")
                }
                return this.xScale(fellingYear) - 4;
            })
            .attr("y", (d, i) => {
                return i * (this.barHeight + this.barMarginY) + this.fontSize;
            })
            .text(d => {
                let fellingYear = this.dendroLib.getOldestFellingYear(d).value;
                if(!fellingYear) {
                    fellingYear = this.dendroLib.getYoungestFellingYear(d).value;
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
                let fellingYear = this.dendroLib.getOldestFellingYear(d).value;
                if(!fellingYear) {
                    fellingYear = this.dendroLib.getYoungestFellingYear(d).value;
                    console.warn("Warning - using younger felling year for felling label")
                }
                return this.xScale(fellingYear) - 1;
            })
            .attr("y", (d, i) => {
                return i * (this.barHeight + this.barMarginY);
            })
            .text(d => {
                let fellingYear = this.dendroLib.getOldestFellingYear(d).value;
                if(!fellingYear) {
                    fellingYear = this.dendroLib.getYoungestFellingYear(d).value;
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
        
        let viewPortHeight = 10 + this.dataObjects.length * (this.barMarginY + this.barHeight);

        container.append("g")
            .classed("dendro-chart-x-axis", true)
            .attr("transform", "translate(0,"+viewPortHeight+")")
            .call(yearAxis);
        
        container.select(".dendro-chart-x-axis .domain")
        .attr("transform", "translate(0, -0.5)");
    }

    drawYAxis(container, dataObjects) {

        container.selectAll(".dendro-chart-y-axis").remove();

        let sampleNames = [];
        let samplePositions = [];
        //let yTick = this.viewBoxAvailableHeight / dataObjects.length;
        let yTick = this.barHeight + this.barMarginY;
        let i = 0;
        dataObjects.forEach(d => {
            sampleNames.push(d.sample_name);
            //samplePositions.push(this.chartTopPadding + (yTick * i++) + (this.barHeight/2 - 0.5) );
            samplePositions.push(this.chartTopPadding + (yTick * i++) + this.barHeight/2 - 0.5);
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


        container.selectAll(".dendro-chart-y-axis")
        .append("text")
        .attr("stroke", "#000")
        .attr("stroke-width", 0.05)
        .attr("x", 0)
        .attr("y", 3.5)
        .html("Samples");
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
                    if(a.sampleName > b.sample_name) {
                        return 1;
                    }
                    if(a.sampleName <= b.sample_name) {
                        return -1;
                    }
                });
                break;
            case "germination year":
                dataObjects.sort((a, b) => {
                    let germA = null;
                    let germB = null;
                    if(this.showUncertainty == "estimates") {
                        germA = this.dendroLib.getOldestGerminationYear(a);
                        germB = this.dendroLib.getOldestGerminationYear(b);

                        if(!germA.value) {
                            germA = this.dendroLib.getYoungestGerminationYear(a);
                        }
                        if(!germB.value) {
                            germB = this.dendroLib.getYoungestGerminationYear(b);
                        }
                    }
                    else {
                        germA = this.dendroLib.getYoungestGerminationYear(a);
                        germB = this.dendroLib.getYoungestGerminationYear(b);
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
                    let fellA = null;
                    let fellB = null;

                    if(this.showUncertainty == "estimates") {
                        fellA = this.dendroLib.getYoungestFellingYear(a);
                        fellB = this.dendroLib.getYoungestFellingYear(b);

                        if(!fellA.value) {
                            fellA = this.dendroLib.getOldestFellingYear(a);
                        }
                        if(!fellB.value) {
                            fellB = this.dendroLib.getOldestFellingYear(b);
                        }
                    }
                    else {
                        fellA = this.dendroLib.getOldestFellingYear(a);
                        fellB = this.dendroLib.getOldestFellingYear(b);
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
                    let specA = this.dendroLib.getDendroMeasurementByName("Tree species", a);
                    let specB = this.dendroLib.getDendroMeasurementByName("Tree species", b);
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

    clearSampleWarnings() {
        this.sampleWarnings = [];
        this.dataObjects.forEach((d) => {
            this.sampleWarnings.push({
                sampleName: d.sample_name,
                warnings: []
            })
        });
    }

    renderChart() {
        
        $(this.anchorNodeSelector+" svg").remove();
        let contentItem = this.contentItem;
        //this.dataObjects = this.getTableRowsAsObjects(contentItem);
        this.dataObjects = contentItem.data.dataGroups;

        let totalNumOfSamples = this.dataObjects.length;
        this.dataObjects = this.stripNonDatedObjects(this.dataObjects);
        //console.log(this.dataObjects.length+" / "+totalNumOfSamples);
        let undatedSamples = totalNumOfSamples - this.dataObjects.length;
        this.clearSampleWarnings();

        this.dataObjects = this.dataObjects.filter(d => {
            let result = false;
            this.siteReport.siteData.sample_groups.forEach(sg => {
                sg.physical_samples.forEach(ps => {
                    if(ps.physical_sample_id == d.physical_sample_id) {
                        if(sg.sample_group_id == this.selectedSampleGroup.value || this.selectedSampleGroup.value == "all") {
                            result = true;
                        }
                    }
                })
            });
            return result;
        });

        this.sortDataObjects(this.dataObjects);
        
        //this.barHeight = 5; //height/thickness of bars
        this.barMarginX = 5;
        this.barMarginY = 2; //y-distance between bars
        this.fontSize = 2; //determines y-offset of labels
        this.chartTopPadding = 5;
        this.chartBottomPadding = 10;
        //this.chartLeftPadding = 10;
        //this.chartRightPadding = 5;
        this.chartLeftPadding = 10;
        this.chartRightPadding = 10;

        const viewBoxWidth = 100; //This defines the coordinate system
        //const viewBoxHeight = 100; //This defines the coordinate system
        const viewBoxHeight = 10 + this.dataObjects.length * 6; //This defines the coordinate system
        
        const maxBarHeight = 6;

        this.viewBoxAvailableHeight = viewBoxHeight - this.chartTopPadding - this.chartBottomPadding
        //this.barHeight = (this.viewBoxAvailableHeight / this.dataObjects.length) - this.barMarginY;
        this.barHeight = 4; //hard-coding this as an experiment
        
        if(this.barHeight > maxBarHeight) {
            this.barHeight = maxBarHeight;
        }
        
        const chartId = "chart-"+nanoid();
        var chartContainer = $("<div id='"+chartId+"' class='site-report-chart-container'></div>");
        $(this.anchorNodeSelector).append(chartContainer);

        this.container = d3.select(this.anchorNodeSelector).append("svg")
            .attr("id", "dendro-chart-svg")
            .classed("dendro-chart-svg", true)
            .attr("preserveAspectRatio", "xMinYMax meet")
            .attr("width", "100%")
            //.attr("height", "100%")
            .attr("height", "100%") //this.viewBoxRenderHeight
            .attr("xmlns", "http://www.w3.org/2000/svg")
            .attr("viewBox", [0, 0, viewBoxWidth, viewBoxHeight])

        if(undatedSamples) {
            this.container.append("text")
            .attr("id", "undated-samples-warning")
            .attr("x", 6)
            .attr("y", 3.5)
            .html(" - "+undatedSamples+" not shown");

            $("#undated-samples-warning").on("mouseover", (evt) => {
                this.drawUndatedSamplesTooltip("There are another "+undatedSamples+" samples not shown in this graph since they lack sufficient dating information. They can be seen in the spreadsheet view.", evt);
            });
            $("#undated-samples-warning").on("mouseout", (evt) => {
                this.removeUndatedSamplesTooltip();
            });
        }

        let extentMin = d3.min(this.dataObjects, d => {
            let plantingYear = this.dendroLib.getOldestGerminationYear(d).value
            if(!plantingYear) {
                plantingYear = this.dendroLib.getYoungestGerminationYear(d).value;
            }
            return plantingYear;
        });
    
        let extentMax = d3.max(this.dataObjects, d => {
            let fellingYear =  this.dendroLib.getOldestFellingYear(d).value;
            if(!fellingYear) {
                fellingYear = this.dendroLib.getYoungestFellingYear(d).value;
            }
            return fellingYear;
        });

        //If we couldn't find a single viable dating for any sample, then we can't calculate a range span at all and thus can't draw anything
        if(!extentMin || !extentMax) {
            d3.select("#undated-samples-warning")
            .text("There are no dateable samples in this dataset.");
            return false;
        }
        
        let yearExtent = [extentMin-10, extentMax+10];

        this.xScale = d3.scaleLinear()
        .domain(yearExtent)
        .range([10, 90]);
    
        this.yScale = d3.scaleLinear()
        .domain([0, this.dataObjects.length])
        .range([0, 100]);
        
        /*
        window.onresize = () => {
            this.calculateScales();
        };
        */

        /*
        window.onresize = () => {
            this.updateChart(this.container, this.dataObjects);
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

        let uknFellingGradient = defs.append("linearGradient")
            .attr("id", "uknFellingGradient")
            .attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "0%");
        
            uknFellingGradient.append("stop")
            .attr("offset", "0%")
            .attr("style", "stop-color:rgb(160, 160, 160);stop-opacity:0.5");

            uknFellingGradient.append("stop")
            .attr("offset", "100%")
            .attr("style", "stop-color:rgb(160, 160, 160);stop-opacity:0.0");

        let uknGerminationGradient = defs.append("linearGradient")
            .attr("id", "uknGerminationGradient")
            .attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "0%");
        
            uknGerminationGradient.append("stop")
            .attr("offset", "0%")
            .attr("style", "stop-color:rgb(160, 160, 160);stop-opacity:0.0");

            uknGerminationGradient.append("stop")
            .attr("offset", "100%")
            .attr("style", "stop-color:rgb(160, 160, 160);stop-opacity:0.5");

        //this.drawCertaintyBars(this.container, this.dataObjects);
        if(this.showUncertainty == "all" || this.showUncertainty == "estimates") {
            //this.drawGerminationUncertaintyBars(this.container, this.dataObjects);
            this.drawFellingUncertaintyBars(this.container, this.dataObjects);
        }
    }

    update(updatedExtrasRenderOption = null) {
        return false;
    }

    updateChart(container, dataObjects) {
        this.clearSampleWarnings();
        this.dataObjects = this.sortDataObjects(this.dataObjects);
        this.removeCertaintyBarsWarnings(container);
        
        let index = 0;
        this.dataObjects.forEach(d => {
            d.barObject = this.getBarObjectFromDataObject(d, index++);
        })

        this.drawCertaintyBars(container, dataObjects);
        this.drawSapwoodBars(container, dataObjects);
        this.drawFellingUncertaintyBars(container, dataObjects);
        //this.drawGerminationUncertaintyBars(container, dataObjects);
        this.drawYAxis(container, dataObjects);
        this.drawSampleBarWarnings(container, dataObjects);
    }

    unrender() {
		if(this.chartId != null) {
            $("#"+this.chartId, this.anchorNodeSelector).remove();
		}
	}
}

export { DendroChart as default }