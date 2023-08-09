import { nanoid } from "nanoid";
import * as d3 from 'd3';
import DendroLib from "../../Common/DendroLib.class";
import Plotly from 'plotly.js-dist-min';

class DendroPlotly {
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
        $(this.anchorNodeSelector+" svg").remove();
        let contentItem = this.contentItem;
        this.dataObjects = contentItem.data.dataGroups;

        let totalNumOfSamples = this.dataObjects.length;
        this.dataObjects = this.stripNonDatedObjects(this.dataObjects);
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
        
        let sampleNames = [];

        let absoluteGerminationValues = [];
        let relativeGerminationValues = [];
        let absoluteCertaintyValues = [];
        let relativeCertaintyValues = [];
        let absoluteFellingValues = [];
        let relativeFellingValues = [];

        let index = 0;
        let oldestYear = null;
        let youngestYear = null;
        this.dataObjects.forEach(d => {
            d.barObject = this.getBarObjectFromDataObject(d, index++);
            sampleNames.push(d.sample_name);

            absoluteGerminationValues.push(d.barObject.germinationUncertainty.x.value);
            relativeGerminationValues.push(d.barObject.germinationUncertainty.width.value);

            absoluteCertaintyValues.push(d.barObject.certainty.x.value);
            relativeCertaintyValues.push(d.barObject.certainty.width.value);

            absoluteFellingValues.push(d.barObject.fellingUncertainty.x.value);
            relativeFellingValues.push(d.barObject.fellingUncertainty.width.value);
            
            if(oldestYear == null || d.barObject.germinationUncertainty.x.value > oldestYear) {
                oldestYear = d.barObject.germinationUncertainty.x.value;
            }
            if(youngestYear == null || (d.barObject.fellingUncertainty.x.value + d.barObject.fellingUncertainty.width.value) > youngestYear) {
                youngestYear = d.barObject.fellingUncertainty.x.value;
            }
        });

        /*
        if(oldestYear == null) {
            this.dataObjects.forEach(d => {
                if(oldestYear == null || d.barObject.certainty.x.value > oldestYear) {
                    oldestYear = d.barObject.certainty.x.value;
                }
            });
        }
        */

        console.log(oldestYear, youngestYear);

        const germinationTrace = {
            y: sampleNames,
            base: absoluteGerminationValues,
            x: relativeGerminationValues,
            name: 'Germination uncertainty',
            type: 'bar',
            orientation: 'h',
            text: "Germination uncertainty",
            hoverinfo: 'x',
            marker: {
                color: 'lightgreen'
            }
        };

        const certaintyTrace = {
            y: sampleNames,
            x: relativeCertaintyValues,
            base: absoluteCertaintyValues,
            name: 'Certainty',
            type: 'bar',
            orientation: 'h',
            text: "Certain dating",
            hoverinfo: 'text',
            marker: {
                color: 'darkgreen'
            }
        };

        const fellingTrace = {
            y: sampleNames,
            x: relativeFellingValues,
            base: absoluteFellingValues,
            name: 'Felling uncertainty',
            type: 'bar',
            orientation: 'h',
            text: "Felling uncertainty",
            hoverinfo: 'text',
            marker: {
                color: 'brown'
            }
        };

        const data = [germinationTrace, certaintyTrace, fellingTrace];

        const layout = {
            barmode: 'stack',
            title: 'Dendrochronological dating',
            hovermode: 'closest',
            yaxis: {
                type: 'category',
            },
            xaxis: {
                range: [oldestYear - 100, youngestYear + 100],
            }
        };

        //$(this.anchorNodeSelector).attr("id", "dendrochart-"+nanoid());
        Plotly.newPlot("contentItem-dendro", data, layout, {responsive: true});

        // Add click event listener to the chart
        document.getElementById('contentItem-dendro').on('plotly_click', function(eventData) {
            const clickedData = eventData.points[0];
            const barIndex = clickedData.pointIndex;

            console.log(eventData);
            console.log(clickedData);
        });
    }

    removeInfoTooltip() {
        if(this.infoTooltipId) {
            $("#dendro-chart-svg").off("click");
            $("#"+this.infoTooltipId).remove();
            this.infoTooltipId = null;
        }
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

    clearSampleWarnings() {
        this.sampleWarnings = [];
        this.dataObjects.forEach((d) => {
            this.sampleWarnings.push({
                sampleName: d.sample_name,
                warnings: []
            })
        });
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
            barObject.certainty.x.value = youngestGerminationYear.value;
            barObject.certainty.x.warnings = youngestGerminationYear.warnings;
            let unknownSapwood = 10; //If the number of sapwood rings are unknown, we assume at least 10
            barObject.sapwood.width.value = youngestGerminationYear.value + oldestFellingYear.value - youngestGerminationYear.value + unknownSapwood;
        }

        //Figure out Width
        if(youngestGerminationYear.value && oldestFellingYear.value) {

            let datingUncert = 0;
            if(parseInt(oldestFellingYear.dating_uncertainty)) {
                datingUncert = parseInt(oldestFellingYear.dating_uncertainty);
            }

            barObject.certainty.width.value = oldestFellingYear.value - youngestGerminationYear.value
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
            barObject.germinationUncertainty.x.value = oldestGerminationYear.value;
        }
        barObject.germinationUncertainty.x.warnings = oldestGerminationYear.warnings;

        //Width
        if(oldestGerminationYear.value == null) {
            barObject.germinationUncertainty.width.value = null;    
        }
        else {
            barObject.germinationUncertainty.width.value = youngestGerminationYear.value - oldestGerminationYear.value;
        }
        barObject.germinationUncertainty.width.warnings = youngestGerminationYear.warnings.concat(oldestGerminationYear.warnings);

        //FELLING-UNCERT BAR
        //X
        barObject.fellingUncertainty.x.value = oldestFellingYear.value;
        barObject.fellingUncertainty.x.warnings = oldestFellingYear.warnings;
        //Width
        barObject.fellingUncertainty.width.value = youngestFellingYear.value - oldestFellingYear.value;
        barObject.fellingUncertainty.width.warnings = youngestFellingYear.warnings.concat(oldestFellingYear.warnings);

        return barObject;
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

}

export { DendroPlotly as default }