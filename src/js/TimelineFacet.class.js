import Facet from './Facet.class';
import Plotly from 'plotly.js-dist-min';
import "ion-rangeslider";
import "ion-rangeslider/css/ion.rangeSlider.min.css";
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
		this.sliderMin = -100;
		this.sliderMax = 10000000;
		this.selections = [this.sliderMin, this.sliderMax];

		let userSettings = this.sqs.getUserSettings();
		this.selectedScale = userSettings.timelineScale || 6;

		this.datingSystems = [
			"BP",
			"AD/BC"
		];
		this.selectedDatingSystem = userSettings.timelineDatingSystem || "BP";

		this.bpDiff = new Date().getFullYear() - 1950;

		this.scaleDefinitions = [
			{
				id: 1,
				name: "Modern history (1500  years)",
				//unit: "year",
				from: 1500,
				to: new Date().getFullYear() - this.bpDiff
			},
			{
				id: 2,
				name: "Historical (900 years)",
				//unit: "year",
				from: -900,
				to: new Date().getFullYear() - this.bpDiff
			},
			{
				id: 3,
				name: "Neolithic (10,000 years)",
				//unit: "BP",
				from: -10000,
				to: -2900
			},
			{
				id: 4,
				name: "Mesolithic (200,000 years)",
				//unit: "BP",
				from: -200000,
				to: -10000
			},
			{
				id: 5,
				name: "Paleolithic (2.58 million years)",
				//unit: "BP",
				from: -2580000,
				to: -200000
			},
			{
				id: 6,
				name: "Pliocene Epoch (5.33 million years)",
				//unit: "BP",
				from: -5330000,
				to: -2580000
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

    }

    render() {
		console.log("Rendering timeline facet");

		if(this.slider == null) {
			this.build();
		}
    }

	setSliderScale(scale) {
		this.sliderMin = scale.from;
		this.sliderMax = scale.to;

		this.slider.data("ionRangeSlider").update({
			min: this.sliderMin,
			max: this.sliderMax,
			from: this.sliderMin,
			to: this.sliderMax,
		});
	}

	setSelectedScale() {
		if(this.selectedDatingSystem == "AD/BC") {
			this.sliderMin = this.scaleDefinitions[this.selectedScale - 1].from + this.bpDiff;
			this.sliderMax = this.scaleDefinitions[this.selectedScale - 1].to + this.bpDiff;
		}
		else {
			this.sliderMin = this.scaleDefinitions[this.selectedScale - 1].from;
			this.sliderMax = this.scaleDefinitions[this.selectedScale - 1].to;
		}
	}

	build() {
		console.log("Building timeline facet");
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
			console.log("Dating system selector changed", e.target.value);
			this.selectedDatingSystem = e.target.value;

			let userSettings = this.sqs.getUserSettings();
			userSettings.timelineDatingSystem = this.selectedDatingSystem;
			this.sqs.storeUserSettings(userSettings);

			this.setSelectedScale();

			//update slider
			this.slider.data("ionRangeSlider").update({
				min: this.sliderMin,
				max: this.sliderMax,
				from: this.sliderMin,
				to: this.sliderMax,
			});
		});

		$("#timeline-scale-selector").on("change", (e) => {
			console.log("Scale selector changed", e.target.value);
			this.selectedScale = parseInt(e.target.value);

			//reset curtains
			$("#result-timeline-curtain-left").css('width', '0%');
			$("#result-timeline-curtain-right").css('width', '0%');

			let userSettings = this.sqs.getUserSettings();
			userSettings.timelineScale = this.selectedScale;
			this.sqs.storeUserSettings(userSettings);

			//update chart and sliders max/mins to reflect new time span
			let scale = this.scaleDefinitions.find((scale) => scale.id == this.selectedScale);
			if(scale != null) {
				this.setSliderScale(scale);
			}
			else {
				console.warn("WARN: Could not find selected scale in scale definitions");
			}
		});

		this.setSelectedScale();
		
        
    	this.slider = $("#result-timeline-slider .range-slider-input").ionRangeSlider({
			type: "double",
			min: this.sliderMin,
			max: this.sliderMax,
			step: 1,
			skin: "flat",
			prettify_enabled: true, // Enables prettify function
			prettify: (num) => {

				if(this.selectedDatingSystem == "AD/BC") {
					//if the selected scale is modern history, we actually reverse the displayed numbers since ION cannot handle a larger "from" value than "to"
					//so the internal logic will be the reverse of what is displayed
					let suffix = " AD";
					let pastValue = (num - this.sliderMin);
					if(this.sliderMax - pastValue < 0) {
						suffix = " BC";
					}
					return this.formatWithSpaces(Math.abs(this.sliderMax - pastValue)) + suffix;
				}
				else {
					return this.formatWithSpaces(Math.abs(num))+" BP";
				}

				/*
				if(this.selectedScale == 1) {
					//if the selected scale is modern history, we actually reverse the displayed numbers since ION cannot handle a larger "from" value than "to"
					//so the internal logic will be the reverse of what is displayed
					return this.sliderMax - (num - this.sliderMin) + " AD";
				}
				else if(this.selectedScale == 2) {
					let suffix = " AD";
					let pastValue = (num - this.sliderMin);
					if(this.sliderMax - pastValue < 0) {
						suffix = " BC";
					}
					return Math.abs(this.sliderMax - pastValue) + suffix;
				}
				else {
					return this.formatWithSpaces(num)+" BP";
				}
				*/
			},
            onFinish: (data) => {
				let values = [];
				values.push(data.from);
				values.push(data.to);
                //this.setSelections(values);
				this.sliderMovedCallback(values);
			},
            onChange: (data) => {
				this.sliderMax = this.slider.data("ionRangeSlider").options.max;

				let from = ((data.from - this.sliderMin) / (this.sliderMax - this.sliderMin)) * 100;
				let to = ((data.to - this.sliderMin) / (this.sliderMax - this.sliderMin)) * 100;

				// Convert the slider values to percentages for the curtains
				let leftCurtainWidth = parseFloat((from).toFixed(2));  // Convert 'from' percentage
				let rightCurtainWidth = parseFloat((100 - to).toFixed(2));  // Convert 'to' percentage and subtract from 100

                // Adjust the left curtain's width
                $("#result-timeline-curtain-left").css('width', leftCurtainWidth + '%');
        
                // Adjust the right curtain's width
                $("#result-timeline-curtain-right").css('width', rightCurtainWidth + '%');
            }
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
            $("#timeline-container .range-slider-input").data("ionRangeSlider").update();
        });
	}

	getCurrentScale() {
		return this.scaleDefinitions.find((scale) => scale.id == this.selectedScale);
	}

	sliderMovedCallback(values) {
		let scale = this.getCurrentScale();
		let from = values[0];
		let to = values[1];

		let fromBP = from;
		let toBP = to;

		if(scale.unit == "year") {
			from = this.sliderMax - (values[0] - this.sliderMin);
			to = this.sliderMax - (values[1] - this.sliderMin);

			Config.constants.BP;
			
			//convert to BP
			fromBP = Config.constants.BP - from;
			toBP = Config.constants.BP - to;
		}
		console.log(from, to);
		console.log(fromBP, toBP);

		if(fromBP < toBP) {
			this.setSelections([fromBP, toBP]);
		}
		else {
			console.warn("WARN: Slider moved callback called with invalid values, from is greater than to");
		}

		
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

		//set slider max and min values
		/*
		this.slider.data("ionRangeSlider").update({
			min: this.totalLower,
			max: this.totalUpper,
			from: setHandles ? this.totalLower : this.selections[0],
			to: setHandles ? this.totalUpper: this.selections[1]
		});
		*/
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