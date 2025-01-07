import Facet from './Facet.class';
import Plotly from 'plotly.js-dist-min';
//import "ion-rangeslider";
//import "ion-rangeslider/css/ion.rangeSlider.min.css";
import noUiSlider from "nouislider";
import "nouislider/dist/nouislider.min.css";
import Config from '../config/config.json';


/**
 * The timeline component is strange because it's really a facet/filter more than it is a result module, so keep that in mind when working with it.
 */

class TimelineFacet extends Facet {
	constructor(sqs, id = null, template = {}, mapObject = null) {
        super(sqs, id, template);

        this.totalUpper = null; //Lowest possible value of this filter, without filters applied
		this.totalLower = null; //Highest possible value of this fulter, without filters applied
		this.datasets = {
			unfiltered: [],
			filtered: []
		};
		this.selections = [];
		this.minDataValue = null;
		this.maxDataValue = null;

		this.map = mapObject;
		this.chart = null;
		this.sliderElement = null;
		this.sliderAnchorNode = null;
        this.resizeInterval = null;
        
        this.enabled = true;
		
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

		this.datingSystems.forEach((system) => {
			const selected = system === this.selectedDatingSystem ? 'selected' : '';
			$("#timeline-dating-system-selector").append(`<option value="${system}" ${selected}>${system}</option>`);
		});

		this.scaleDefinitions.forEach((scale) => {
			const selected = scale.id === this.selectedScale ? 'selected' : '';
			$("#timeline-scale-selector").append(`<option value="${scale.id}" ${selected}>${scale.name}</option>`);
		});

		this.graphDataOptions = [
			{
				name: "Sites",
				endpoint: "sites"
			}
		];

		this.graphDataOptions.forEach((option) => {
			$("#timeline-data-selector").append(`<option value="${option.name}">${option.name}</option>`);
		});

		$("#timeline-data-selector").on("change", (e) => {
		});

		//this.setupResizableSections();
    }

	getSliderValues() {
		return this.currentValues;
	}

    render() {
		console.log("Rendering timeline facet");

		if(this.slider == null) {
			this.build();
		}

		/*
		this.fetchTimeData(this.data).then(d => {
			//this.data = d;
			if(Config.timelineEnabled) {
				this.render();
			}
		});
		*/
    }

	setSliderScale(scale) {
		this.selectedScale = scale.id;
		this.setSelectedScale(scale);
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

	setSelectedScale(selectedScale, newDatingSystem = false) {
		if (this.selectedDatingSystem === "AD/BC") {
			this.sliderMin = this.currentYear + selectedScale.older;
			this.sliderMax = this.sqs.config.constants.BP + selectedScale.younger;
		} else {
			this.sliderMin = selectedScale.older + this.bpDiff;
			this.sliderMax = selectedScale.younger;	
		}

		if(newDatingSystem) {
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

		// Trigger any updates or re-rendering needed for the slider
		this.sliderUpdateCallback(this.currentValues);
	}

	formatValueForDisplay(value, datingSystem) {
		if(datingSystem == "BP") {
			return value * -1;
		}
		if(datingSystem == "AD/BC") {
			if(value < 0) {
				value = Math.abs(value);
			}
		}

		return value;
	}

	getSelectedScale() {
		return this.scaleDefinitions.find((scale) => scale.id == this.selectedScale);
	}

	getDomRef() {
		return $("#timeline-container");
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
		$(".slider-manual-input-container .range-facet-manual-input", this.domObj).css("width", 10 + digitSpace);
		

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
		

		this.adjustCurtains(values);

		if(moveSlider) {
			console.log("Moving slider to", values);
			this.slider.set(values);
		}
	}

	adjustCurtains(values) {
		let from = ((values[0] - this.sliderMin) / (this.sliderMax - this.sliderMin)) * 100;
		let to = ((values[1] - this.sliderMin) / (this.sliderMax - this.sliderMin)) * 100;

		// Convert the slider values to percentages for the curtains
		let leftCurtainWidth = parseFloat((from).toFixed(2));  // Convert 'from' percentage
		let rightCurtainWidth = parseFloat((100 - to).toFixed(2));  // Convert 'to' percentage and subtract from 100

		// Adjust the left curtain's width
		$("#result-timeline-curtain-left").css('width', leftCurtainWidth + '%');

		// Adjust the right curtain's width
		$("#result-timeline-curtain-right").css('width', rightCurtainWidth + '%');
	}
	

	build() {
		var x = [];
        for (var i = 0; i < 500; i ++) {
            x[i] = Math.random();
        }

        x.sort((a, b) => a - b);

        var trace = {
            x: x,
            y: x.map((val, index) => index),
            type: 'scatter',
            mode: 'lines'
        };
        var data = [trace];

        let layout = {
            title: 'Timeline',
            plot_bgcolor: this.sqs.color.colors.paneBgColor,
			paper_bgcolor: this.sqs.color.colors.paneBgColor,
			//plot_bgcolor: "#FFA07A",
			//paper_bgcolor: "#FFA07A",
			autosize: true,
            responsive: true,
            margin: { l: 50, r: 50, t: 0, b: 0 },
        };

        let options = {
            displayModeBar: false,
            responsive: true,
			staticPlot: true //no interactions
        };

        Plotly.newPlot('result-timeline', data, layout, options);

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
			$("#result-timeline-curtain-left").css('width', '0%');
			$("#result-timeline-curtain-right").css('width', '0%');

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

		
		//create the slider
		this.slider = noUiSlider.create($("#result-timeline-slider .range-slider-input")[0], {
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
		var upperManualInputNode = $("#facet-template .slider-manual-input-container[endpoint='upper']")[0].cloneNode(true);
		var lowerManualInputNode = $("#facet-template .slider-manual-input-container[endpoint='lower']")[0].cloneNode(true);
		
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
			console.log(values);
			//this.fetchData();
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
	}

	setupResizableSections() {
		$("#timeline-container").resizable({
			handles: "n",
			resize: (event, ui) => {
				$("#result-map-container").css("height", "calc(100% - "+ui.size.height+"px)");
			}
		}).on("resize", (e) => {
		});
    }

    setSelections(selections) {
		//selections is always BP
		//if the scale display is also BP, then we can just grab the number straight from the slider
		//the first value is the lower bound, the second value is the upper bound
		//but if the scale is AD, we need to reverse the numbers since the slider is set up to handle BP

		if(this.selectedScale == 1) {
			//if the selected scale is modern history, we actually reverse the displayed numbers since ION cannot handle a larger "from" value than "to"
			//so the internal logic will be the reverse of what is displayed
			let from = this.sliderMax - (selections[0] - this.sliderMin);
			let to = this.sliderMax - (selections[1] - this.sliderMin);
			
			selections[0] = from;
			selections[1] = to;
		
			//now we also need to convert this to BP (from 1950)
			selections[0] = 1950 - selections[0];
			selections[1] = 1950 - selections[1];
		}

		console.log(selections)
		

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
		
		//$(".slider-manual-input-container[endpoint='upper'] > input", this.getDomRef()).val(this.selections[1]);
		//$(".slider-manual-input-container[endpoint='lower'] > input", this.getDomRef()).val(this.selections[0]);
		
		if(selectionsUpdated) {
			this.sqs.facetManager.queueFacetDataFetch(this);
			this.broadcastSelection();
		}
	}


    async fetchData(render = true) {
        console.log("Fetching data for timeline");

        if(!this.dataFetchingEnabled) {
			console.warn("WARN: fetchData called on a facet where dataFetchingEnabled is false. Ignoring.");
			return;
		}
		this.showLoadingIndicator(true);
		
		var requestType = "populate";
		/*FIXME: This is undefined, should be facet that triggered the request, not necessarily this facet (could be one above in the chain).
		* Except for when a facet was deleted - this should not count as the trigger in that instance. Yeah it's confusing and I hate it.
		*/
		var triggerCode = this.sqs.facetManager.getLastTriggeringFacet().name;

		let targetCode = this.name;
		
		if(typeof this.filters != "undefined") {
			//this is a multistage facet
			targetCode = this.getCurrentFilter().name;
		}
		
		var fs = this.sqs.facetManager.getFacetState();
		var fc = this.sqs.facetManager.facetStateToDEF(fs, {
			requestType: requestType,
			targetCode: targetCode,
			triggerCode: triggerCode
		});

		let domainCode = this.sqs.domainManager.getActiveDomain().name;
		domainCode = domainCode == "general" ? "" : domainCode;

		var reqData = {
			requestId: ++this.requestId,
			requestType: requestType,
			targetCode: targetCode,
			triggerCode: triggerCode,
			domainCode: domainCode,
			facetConfigs: fc
		};

		return $.ajax(config.serverAddress+"/api/facets/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: (respData, textStatus, jqXHR) => {
				if(this.deleted == false && respData.FacetsConfig.RequestId == this.requestId) { //Only load this data if it matches the last request id dispatched. Otherwise it's old data.
					this.importData(respData);
					if(render && this.minimized == false) {
						this.renderData();
						//dispatch event that this facet has been rendered
						this.sqs.sqsEventDispatch("facetDataRendered", {
							facet: this
						});
					}
                    this.showLoadingIndicator(false);
				}
				else {
					console.warn("WARN: Not importing facet data since this facet is either deleted or "+respData.FacetsConfig.RequestId+" != "+this.requestId);
				}

				for(var key in this.sqs.facetManager.pendingDataFetchQueue) {
					if(this === this.sqs.facetManager.pendingDataFetchQueue[key]) {
						this.sqs.facetManager.pendingDataFetchQueue.splice(key, 1);
					}
				}

				if(this.sqs.facetManager.pendingDataFetchQueue.length == 0) {
					$.event.trigger("seadFacetPendingDataFetchQueueEmpty", {
						facet: this
					});
				}
				
			},
			error: (respData, textStatus, jqXHR) => {
				this.showLoadingIndicator(false, true);
			}
		});
    }

    renderData() {
        console.log("Rendering data for timeline");

		if(this.slider == null) {
			this.build();
		}

        console.log(this.totalLower, this.totalUpper);
        console.log(this.datasets);
    }

    importData(importData, overwrite = true) {
		super.importData(importData);

		let setHandles = false;
		if(this.totalUpper == null || this.totalLower == null ) {
			setHandles = true;
		}

		this.totalLower = importData.IntervalInfo.FullExtent.DataLow;
		this.totalUpper = importData.IntervalInfo.FullExtent.DataHigh;

		let filteredData = false;
		for(let k in importData.Picks) {
			if(importData.Picks[k].FacetCode == this.name) {
				//This is a dataset narrowed by a selection, so import it into the filtered section of the dataset
				filteredData = true;
			}
		}

		let targetSection = null;
		if(filteredData) {
			this.datasets.filtered = [];
			targetSection = this.datasets.filtered;
		}
		else {
			this.datasets.unfiltered = [];
			targetSection = this.datasets.unfiltered;
		}

		//Create internal format
		let bins = importData.Items;
		for(let itemKey in bins) {
			targetSection.push({
				//Value spans:
				min: bins[itemKey].Extent[0], //Greater Than - except for the first item which should be >=
				max: bins[itemKey].Extent[1], //Lesser Than - except for the last item which should be <=
				value: bins[itemKey].Count //value/count for this category/span
			});
		}

		console.log("Imported data for timeline", this.datasets);
	}

    broadcastSelection(filter = null) {
		$.event.trigger("seadFacetSelection", {
			facet: this,
			filter: filter
		});
	}

    formatWithSpaces(number) {
		return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
	}

    async fetchTimeData() {
        
    }

    getSelections() {
        return this.selections;
    }

    getSelectedSites() {
        return this.map.data;
    }

    unrender() {

    }
}

export default TimelineFacet;