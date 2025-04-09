import noUiSlider from "nouislider";
import "nouislider/dist/nouislider.min.css";
import IOModule from "./IOModule.class";

class Timeline extends IOModule {
    constructor(sqs, id, template) {
        super(sqs, id, template);

        this.slider = null;
        this.sliderMin = -10000000;
		this.sliderMax = 10000000;

		this.currentValues = [this.sliderMin, this.sliderMax];
		this.selections = [this.sliderMin, this.sliderMax];

		let userSettings = this.sqs.getUserSettings();
		this.selectedScale = userSettings.timelineScale || 6;

		this.datingSystems = [
			"BP",
			"AD/BC"
		];
		this.selectedDatingSystem = userSettings.timelineDatingSystem || "BP";

		this.currentYear = new Date().getFullYear();
		const yearNowBP = (1950 - this.currentYear) * -1;
		
		this.bpDiff = new Date().getFullYear() - 1950;

		//these scales are in BP (but minus), so when using AD/BC we need to recalculate
		this.scaleDefinitions = [
			{
				id: 1,
				name: "500 years",
				older: -500,
				younger: yearNowBP
			},
			{
				id: 2,
				name: "1000 years",
				older: -1000,
				younger: yearNowBP
			},
			{
				id: 3,
				name: "10,000 years",
				older: -10000,
				younger: yearNowBP
			},
			{
				id: 4,
				name: "200,000 years",
				older: -200000,
				younger: yearNowBP
			},
			{
				id: 5,
				name: "2.58 million years",
				older: -2580000,
				younger: yearNowBP
			},
			{
				id: 6,
				name: "5.33 million years",
				older: -5330000,
				younger: yearNowBP
			}
		];

        this.graphDataOptions = [
			{
				name: "Data points",
				endpoint: "data_points"
			}
		];

        this.populateDatingSystemsSelector();
        this.populateScaleDefinitionsSelector();
		this.populateGraphDataOptionsSelector(this.graphDataOptions);

		$("#timeline-data-selector").on("change", (e) => {
			console.log("Changing data selector", e.target.value);
		});

        $(".facet-text-search-btn", this.getDomRef()).hide();
    }


    populateDatingSystemsSelector() {
        //populate the dating systems selector
        this.datingSystems.forEach((system) => {
            const selected = system === this.selectedDatingSystem ? 'selected' : '';
            $("#timeline-dating-system-selector").append(`<option value="${system}" ${selected}>${system}</option>`);
        });
    }

    populateScaleDefinitionsSelector() {
        //populate the scale definitions selector
        this.scaleDefinitions.forEach((scale) => {
            const selected = scale.id === this.selectedScale ? 'selected' : '';
            $("#timeline-scale-selector").append(`<option value="${scale.id}" ${selected}>${scale.name}</option>`);
        });
    }

    populateGraphDataOptionsSelector(graphDataOptions) {
        //populate the graph data options selector
        graphDataOptions.forEach((option) => {
            const selected = option.name === this.selectedGraphDataOption ? 'selected' : '';
            $("#timeline-data-selector").append(`<option value="${option.name}" ${selected}>${option.name}</option>`);
        });
    }

    renderData() {
        console.log(this.data);
        //render yourself into your targeted container
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} rendering data.`);
        }

        this.renderSlider();
    }

    initSlider() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} initializing slider.`);
        }
        
        const timelineContainer = $(".timeline-container", this.getDomRef());
        timelineContainer.show();
        const sliderContainer = $(".range-slider-input", this.getDomRef())[0];

        this.slider = noUiSlider.create(sliderContainer, {
            start: [this.sliderMin, this.sliderMax],
            range: {
                'min': this.sliderMin,
                'max': this.sliderMax
            },
            step: 1,
            connect: true
        });

        const selectedScale = this.getSelectedScale();
        this.setSelectedScale(selectedScale);

        $(".slider-manual-input-container", this.getDomRef()).remove();
        

        var upperManualInputNode;
        var lowerManualInputNode;
        var template = document.getElementById("facet-template");
        if (template && template.content) {
            var upperManualInputContainer = template.content.querySelector(".slider-manual-input-container[endpoint='upper']");
            var lowerManualInputContainer = template.content.querySelector(".slider-manual-input-container[endpoint='lower']");

            upperManualInputNode = upperManualInputContainer ? upperManualInputContainer.cloneNode(true) : null;
            lowerManualInputNode = lowerManualInputContainer ? lowerManualInputContainer.cloneNode(true) : null;

            // Now use upperManualInputNode and lowerManualInputNode
        } else {
            console.error("Facet template not found or its content is empty.");
        }

        $("input", upperManualInputNode).val(this.sliderMax);
        $("input", lowerManualInputNode).val(this.sliderMin);

        $(".noUi-handle-upper", this.getDomRef()).prepend(upperManualInputNode);
        $(".noUi-handle-lower", this.getDomRef()).prepend(lowerManualInputNode);

        $(".slider-manual-input-container", this.getDomRef()).show();

        this.upperManualInputNode = $(".noUi-handle-upper .slider-manual-input-container .range-facet-manual-input", this.getDomRef());
        this.lowerManualInputNode = $(".noUi-handle-lower .slider-manual-input-container .range-facet-manual-input", this.getDomRef());

        $(".slider-manual-input-container", this.getDomRef()).on("change", (evt) => {
            let value = evt.target.value;

            //we have to process the value here before we are ready to start using it because there are a few things to consider:
            //if the scale is AD/BC, we need to convert the value to BP

            //and when the value is BP we need to reverse it since the slider is set up to handle BP in reverse (for technical reasons), so plus is minus and minus should be plus

            if(this.selectedDatingSystem == "BP") {
                value = value * -1;
            }

            let tabIndex = $(evt.target).attr("tabindex");
            if(tabIndex == 1) {
                //this is the lower value

                if(this.selectedDatingSystem == "AD/BC") {
                    //check if the value has a suffix of "BC" or "AD" (including lowercase)
                    let suffix = value.toString().toLowerCase().replace(/[^a-z]/g, '');

                    //strip out any suffix to get the pure number
                    value = value.toString().replace(/[^0-9]/g, '');

                    if(suffix && suffix == "bc") {
                        value = value * -1;
                    }
                    if(suffix && suffix == "ad") {
                        value = value * 1;
                    }

                    //if this is the lower value AND it's (previously) a BC year, then we assume that new the number is punched in is meant to be a BC year, and the reverse for AD of course
                    if(!suffix && this.currentValues[0] < 0) {
                        //this is negative, it's a BC year
                        value = value * -1;
                    }
                }

                //check that the value is within the slider range
                if(value < this.sliderMin) {
                    console.warn("WARN: Lower value is below slider min, setting to min");
                    value = this.sliderMin;
                }

                //and that the value is a number
                if(isNaN(value)) {
                    console.warn("WARN: Lower value is not a number, setting to min");
                    value = this.sliderMin;
                }

                //and that the value is below the upper value
                if(value > this.currentValues[1]) {
                    console.warn("WARN: Lower value is above upper value, setting to upper value - 1");
                    value = this.currentValues[1] - 1;
                }

                this.sliderUpdateCallback([value, this.currentValues[1]], true);
            }
            if(tabIndex == 2) {
                //this is the upper value
                if(this.selectedDatingSystem == "AD/BC") {
                    //check if the value has a suffix of "BC" or "AD" (including lowercase)
                    let suffix = value.toString().toLowerCase().replace(/[^a-z]/g, '');

                    //strip out any suffix to get the pure number
                    value = value.toString().replace(/[^0-9]/g, '');

                    if(suffix && suffix == "bc") {
                        value = value * -1;
                    }
                    if(suffix && suffix == "ad") {
                        value = value * 1;
                    }

                    //if this is the upper value AND it's (previously) a BC year, then we assume that new the number is punched in is meant to be a BC year, and the reverse for AD of course
                    if(!suffix && this.currentValues[1] < 0) {
                        //this is negative, it's a BC year
                        value = value * -1;
                    }
                }

                //check that the value is within the slider range
                if(value > this.sliderMax) {
                    console.warn("WARN: Upper value is above slider max, setting to max");
                    value = this.sliderMax;
                }

                //and that the value is a number
                if(isNaN(value)) {
                    console.warn("WARN: Upper value is not a number, setting to max");
                    value = this.sliderMax;
                }
                //and that the value is above the lower value
                if(value < this.currentValues[0]) {
                    console.warn("WARN: Upper value is below lower value, setting to lower value + 1");
                    value = this.currentValues[0] + 1;
                }

                this.sliderUpdateCallback([this.currentValues[0], value], true);
            }
        });


        this.slider.off("update");
        this.slider.on("update", (values, slider) => {
            this.sliderUpdateCallback(values);
        });
        this.slider.on("change", (values, slider) => {
            //set new selections on this facet
            let bpValues = this.sliderSelectionsToBP([parseInt(values[0]), parseInt(values[1])]);
            this.setSelections(bpValues);
        });

        // Resize the plotly chart when the window is resized, add a delay to allow the layout to settle, this will not work otherwise, it's stupid, but it is what it is
        window.addEventListener('resize', () => {
            if(this.resizeInterval == null) {
                this.resizeInterval = setInterval(() => {
                    if($('#result-timeline').width() > 0) {
                        clearInterval(this.resizeInterval);
                        this.resizeInterval = null;
                        Plotly.Plots.resize('result-timeline');
                    }
                }, 100);
            }
        });
        
        $(window).on('resize', function() {
            //$("#timeline-container .range-slider-input").data("ionRangeSlider").update();
        });

        $("#timeline-dating-system-selector").on("change", (e) => {
            this.selectedDatingSystem = e.target.value;

            let userSettings = this.sqs.getUserSettings();
            userSettings.timelineDatingSystem = this.selectedDatingSystem;
            this.sqs.storeUserSettings(userSettings);

            const selectedScale = this.getSelectedScale();
            this.setSelectedScale(selectedScale, true);
        });

        $("#timeline-scale-selector").on("change", (e) => {
            this.selectedScale = parseInt(e.target.value);

            //reset curtains
            $("#timeline-curtain-left").css('width', '0%');
            $("#timeline-curtain-right").css('width', '0%');

            let userSettings = this.sqs.getUserSettings();
            userSettings.timelineScale = this.selectedScale;
            this.sqs.storeUserSettings(userSettings);

            //update chart and sliders max/mins to reflect new time span
            let scale = this.scaleDefinitions.find((scale) => scale.id == this.selectedScale);
            if(scale) {
                this.setSliderScale(scale);
            }
            else {
                console.warn("WARN: Could not find selected scale in scale definitions");
            }
        });
    }

    renderSlider() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} rendering slider.`);
        }
        //this.createChart();

        // Generate random data
        const x = Array.from({ length: 500 }, () => Math.random()).sort((a, b) => a - b);
        const y = x.map((val, index) => index);
    
        // Update the chart with the generated data
        //this.updateChartData(x, y);
        
        //create the slider
        if(this.slider == null) {
            this.initSlider();
        }
        else {
            console.log("Slider already initialized, not reinitializing");
        }

    }

	getSelectedScale() {
		return this.scaleDefinitions.find((scale) => scale.id == this.selectedScale);
	}

    setSelectedScale(selectedScale, newDatingSystem = false) {
		console.log("Setting selected scale", selectedScale, newDatingSystem);

		if (this.selectedDatingSystem === "AD/BC") {
			this.sliderMin = this.currentYear + selectedScale.older;
			this.sliderMax = this.sqs.config.constants.BP + selectedScale.younger;
		} else {
			this.sliderMin = selectedScale.older + this.bpDiff;
			this.sliderMax = selectedScale.younger;
		}

		if(newDatingSystem) {
            console.log(this.currentValues);
			//recalculate the current values to fit the new dating system
			if(this.selectedDatingSystem === "AD/BC") {
				//going from BP to AD/BC
				this.currentValues[0] = this.convertBPtoADBC(this.currentValues[0]);
				this.currentValues[1] = this.convertBPtoADBC(this.currentValues[1]);
			}
			else {
				//going from AD/BC to BP
				this.currentValues[0] = this.convertADBCtoBP(this.currentValues[0]);
				this.currentValues[1] = this.convertADBCtoBP(this.currentValues[1]);
			}
		}
	
		if(this.slider) {
			this.slider.updateOptions({
				range: {
					'min': this.sliderMin,
					'max': this.sliderMax,
				},
				start: this.currentValues
			});
		}
		else {
			console.warn("WARN: Slider not initialized yet, cannot set scale");
		}

		this.setSelections(this.sliderSelectionsToBP([this.sliderMin, this.sliderMax]));

		// Trigger any updates or re-rendering needed for the slider
		this.sliderUpdateCallback(this.currentValues);

		this.fetchData();
	}

    sliderSelectionsToBP(selections) {
		return [selections[1] * -1, selections[0] * -1];
	}

    formatValueForDisplay(value, datingSystem, prettyPrint = true) {
        const absValue = Math.abs(value);
        const isOldEnough = absValue >= 5000;
    
        if (prettyPrint && isOldEnough) {
            if (absValue >= 1_000_000) {
                return (absValue / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
            } else if (absValue >= 1_000) {
                return (absValue / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
            }
        }
    
        // Always return as positive number for display
        return absValue.toString();
    }

    sliderUpdateCallback(values, moveSlider = false) {
		values[0] = parseInt(values[0], 10);
		values[1] = parseInt(values[1], 10);

		//avoid year zero since it doesn't exist
		if(values[0] == 0) {
			values[0] = -1;
		}
		if(values[1] == 0) {
			values[1] = 1;
		}

		//if current values are not within the slider range, set them to the slider range
		if(values[0] < this.sliderMin) {
			console.log("Lower value ("+values[0]+") is below slider min, setting to min");
			values[0] = this.sliderMin;
		}
		if(values[1] > this.sliderMax) {
			console.log("Upper value ("+values[1]+") is above slider max, setting to max");
			values[1] = this.sliderMax;
		}

		//values[0] = this.sliderMin;
		//values[1] = this.sliderMax;
		
		//console.log("Slider values:", values);
		this.currentValues = values;
		$(this.lowerManualInputNode).val(this.formatValueForDisplay(this.currentValues[0], this.selectedDatingSystem));
		$(this.upperManualInputNode).val(this.formatValueForDisplay(this.currentValues[1], this.selectedDatingSystem));

		if (this.selectedDatingSystem === "AD/BC") {
			let lowerSuffix = this.currentValues[0] > 0 ? "AD" : "BC";
			let upperSuffix = this.currentValues[1] > 0 ? "AD" : "BC";
			$(".slider-manual-input-container[endpoint='lower'] .range-unit-box", this.getDomRef()).html(lowerSuffix);
			$(".slider-manual-input-container[endpoint='upper'] .range-unit-box", this.getDomRef()).html(upperSuffix);
		}

		if (this.selectedDatingSystem === "BP") {
			$(".slider-manual-input-container[endpoint='lower'] .range-unit-box", this.getDomRef()).html("BP");
			$(".slider-manual-input-container[endpoint='upper'] .range-unit-box", this.getDomRef()).html("BP");
		}

		//Adjustments for setting the right size and position of the digit input boxes depending on how big they need to be
		let digits = this.sliderMax.toString().length > this.sliderMin.toString().length ? this.sliderMax.toString().length : this.sliderMin.toString().length;
		var digitSpace = digits*5;
        digitSpace = 40;
		$(".slider-manual-input-container .range-facet-manual-input", this.domObj).css("width", digitSpace);
		

		/* there's some performance degredation to running this code, so it's commented out for now
		let lowerInput = $(".slider-manual-input-container[endpoint='lower']", this.getDomRef())
		let upperInput = $(".slider-manual-input-container[endpoint='upper']", this.getDomRef())

		if(lowerInput[0] && upperInput[0]) {
			console.log(lowerInput, upperInput);

			//detect horizontal overlap between the inputs
			let lowerInputRect = lowerInput[0].getBoundingClientRect();
			let upperInputRect = upperInput[0].getBoundingClientRect();

			if(lowerInputRect.right > upperInputRect.left) {
				//there is overlap, move the lower input to the left
				let overlap = lowerInputRect.right - upperInputRect.left;
				let left = lowerInputRect.left - overlap;
				lowerInput.css("background", "red");
			}
			else {
				lowerInput.css("background", "blue");
			}
		}
		*/
		

		if(this.useCurtains) {
			this.adjustCurtains(values);
		}

		if(moveSlider) {
			console.log("Moving slider to", values);
			this.slider.set(values);
		}
	}

    setSelections(selections) {
		
		let selectionsUpdated = false;
		if(selections.length == 2) {
			if(selections[0] != null && selections[0] != this.selections[0]) {
				this.selections[0] = parseFloat(selections[0]);
				selectionsUpdated = true;
			}
			if(selections[1] != null && selections[1] != this.selections[1]) {
				this.selections[1] = parseFloat(selections[1]);
				selectionsUpdated = true;
			}
		}
		
		if(selectionsUpdated) {
			this.sqs.facetManager.queueFacetDataFetch(this);
			this.broadcastSelection();
		}
	}

    showSqlButton(show = true) {
		if(show) {
			$(".facet-sql-btn", this.getDomRef()).show();
		}
		else {
			$(".facet-sql-btn", this.getDomRef()).hide();
		}
	}

    convertBPtoADBC(bpYear) {
		//the bpYear here is a negative number if it is before 1950 and a positive number if it is after 1950
		if (bpYear < 0) {
			// BC year
			return 1950 - Math.abs(bpYear);
		} else {
			// AD year
			return 1950 + bpYear;
		}
	}

    convertADBCtoBP(adbcYear) {
		//adbcYear is e.g. 2024, or -5000

		if (adbcYear < 0) {
			// BC year
			return (1950 + Math.abs(adbcYear)) * -1;
		} else {
			// AD year
			return (1950 - adbcYear) * -1;
		}
	}

    setSliderScale(scale) {
		this.selectedScale = scale.id;
		this.setSelectedScale(scale);
	}
}
export default Timeline;