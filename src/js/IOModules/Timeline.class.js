import noUiSlider from "nouislider";
import "nouislider/dist/nouislider.min.css";
import IOModule from "./IOModule.class";
import { nanoid } from "nanoid";
import Plotly from "plotly.js-dist-min";
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { isArray } from "lodash";

class Timeline extends IOModule {
    constructor(sqs, id, template) {
        super(sqs, id, template);

        this.slider = null;
        this.sliderMin = -10000000;
		this.sliderMax = 10000000;

        this.verboseLogging = false;
        this.debugValuesInSlider = false;

        this.currentValuesInitialized = false;
        this.datasets = {
			unfiltered: [],
			filtered: []
		};

        //the "currentValues" are the values of the slider, it's similar to the "selections" but with the difference that:
        //1. When the selections are being changed, a new filter load and broadbast needs to be performed. currentValues is just the internal state of this module and needs not necessarily be broadcasted when changed.
        //2. The selections should always be in a very specific format - which is years BP. The currentValues can be in an internal "virtual" format, such as a pretend version of BP which might have a reversed polarity, so it's e.g. -20000BP to +75 BP.
		this.currentValues = [this.sliderMin, this.sliderMax];

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
        this.timelineDomId = null;
        this.traceIdCounter = 0;
        this.chartTraces = [];
        this.chartTraceColors = this.sqs.color.generateDistinctColors(10, 0.75);
        this.selectedGraphDataOption = userSettings.timelineGraphDataOption || "δ18O from GISP2 Ice Core";
        //this.selectedGraphDataOption = userSettings.timelineGraphDataOption || "SEAD data points";

        this.timeFormatsForImport = [
            "Years BP",
            "AD/BC",
            "Date",
            "Timestamp/Epoch",
            "Other"
        ];

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
				name: "10K years",
				older: -10000,
				younger: yearNowBP
			},
			{
				id: 4,
				name: "200K years",
				older: -200000,
				younger: yearNowBP
			},
			{
				id: 5,
				name: "2.58M years",
				older: -2580000,
				younger: yearNowBP
			},
			{
				id: 6,
				name: "5.33M years",
				older: -5330000,
				younger: yearNowBP
			}
		];

        let scale = this.getSelectedScale();
        this.setSelections([scale.older, scale.younger], false);

        this.graphDataOptions = [
            /*
            new GraphDataOption(
                "SEAD data points",
                this.chartTraceColors.shift(),
                "sead_query_api",
                {}
            ),
            */
            new GraphDataOption(
                "δ18O from GISP2 Ice Core",
                this.chartTraceColors.shift(),
                "postgrest",
                {
                    table: "tbl_temperatures",
                    xColumn: "years_bp",
                    yColumn: "d180_gisp2"
                }
            ),
            new GraphDataOption(
                "Import data",
                this.chartTraceColors.shift(),
                "",
                {}
            ),
        ];

        this.populateDatingSystemsSelector();
        this.populateScaleDefinitionsSelector();
		this.populateGraphDataOptionsSelector(this.graphDataOptions);

        $("#timeline-data-selector-clicked-btn").on("click", (e) => {
            let graphDataOption = this.getSelectedGraphDataOption()

            if(graphDataOption.name == "Import data") {
                this.openFileDialog();
                return;
            }

            this.sqs.setUserSettings({
                timelineGraphDataOption: graphDataOption
            });

            this.addAllSelectedTracesToGraph();
        });

        $(".facet-text-search-btn", this.getDomRef()).hide();
    
        this.initDroppable();
    }

    openFileDialog() {
        // Create an input element of type 'file'
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".csv, .xls, .xlsx"; // Optional: Restrict file types
    
        // Add an event listener to handle the file selection
        fileInput.addEventListener("change", (event) => {
            const files = event.target.files; // Get the selected files
            if (files.length > 0) {
                const file = files[0];
                this.handleFileImport(file);
            }
        });
    
        // Programmatically trigger the file dialog
        fileInput.click();
    }

    initDroppable() {
        const timelineContainer = $(".timeline-container", this.getDomRef());

        // 1. Prevent default behavior for dragover and drop
        timelineContainer.on("dragover", function (e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).addClass("droppable-dragover"); // Optional: Add class for visual feedback
        });

        timelineContainer.on("dragleave", function (e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).removeClass("droppable-dragover"); // Optional
        });

        timelineContainer.on("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            $(e.currentTarget).removeClass("droppable-dragover");

            const files = e.originalEvent.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileImport(files[0]);
            }
        });
    }

    async handleFileImport(file) {
        let importResult = null;

        if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
            importResult = await this.loadExcel(file);
        } else if(file.name.endsWith(".csv")) {
            importResult = await this.loadCSV(file);
        }
        else {
            //notify the user that the file is not supported
            this.sqs.notificationManager.notify("Unsupported file type. Please drop a .xlsx, .xls, or .csv file.", "error");
        }

        const { jsonData, xColumn, yColumn, timeFormat } = importResult;

        let trace = {
            x: jsonData.map((row) => row.x),
            y: jsonData.map((row) => row.y),
            mode: 'lines',
            type: 'scatter',
            name: `${yColumn} (${timeFormat})`,
            marker: {
                size: 5,
                color: this.chartTraceColors[this.traceIdCounter % this.chartTraceColors.length],
                line: {
                    width: 0.5,
                    color: this.chartTraceColors[this.traceIdCounter % this.chartTraceColors.length]
                }
            }
        };

        // Plot the graph with the selected data
        this.traceIdCounter++;
        this.addTraceToGraph(trace);
    }

    async loadExcel(file) {
        return new Promise((resolve, reject) => {
            // Handle Excel file import
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const workbook = new ExcelJS.Workbook();
                    await workbook.xlsx.load(e.target.result); // Load the Excel file

                    // Render the unified import form and get the parsed data
                    let importResult = await this.renderImportFormExcel(workbook);
                    if (!importResult) {
                        console.warn("Import process was canceled or failed.");
                        return;
                    }
                    resolve(importResult);
                } catch (error) {
                    console.error("ERROR: Failed to parse Excel file:", error);
                    reject(error);
                }
            };
            reader.readAsArrayBuffer(file); // Read the file as an ArrayBuffer
        });
    }

    async loadCSV(file) {
        return new Promise((resolve, reject) => {
            // Handle CSV file import
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const csvContent = e.target.result;
                    const parsedData = this.parseCSV(csvContent);
                    // Render the unified import form and get the parsed data
                    let importResult = await this.renderImportFormCsv(parsedData);
                    if (!importResult) {
                        console.warn("Import process was canceled or failed.");
                        return;
                    }
                    resolve(importResult);
                } catch (error) {
                    console.error("ERROR: Failed to parse CSV file:", error);
                    reject(error);
                }
            };
            reader.readAsText(file); // Read the file as text
        });
    }

    parseCSV(csvContent) {
        // Use PapaParse to parse the CSV content
        const result = Papa.parse(csvContent, {
            header: true, // Automatically extract headers
            skipEmptyLines: true, // Skip empty lines
            dynamicTyping: true, // Automatically convert numeric values
            //delimiter: ";", // Specify the delimiter (comma for CSV)
        });
    
        if (result.errors.length > 0) {
            console.error("ERROR: Failed to parse CSV file:", result.errors);
            throw new Error("Failed to parse CSV file.");
        }
    
        // Return headers and data
        const headers = result.meta.fields || []; // Extract headers from the metadata
        const data = result.data; // Extract parsed data rows
    
        return { headers, data };
    }
    

    convertToBP(value, timeFormat) {
        switch (timeFormat) {
            case "AD/BC":
                return this.convertADBCtoBP(value);
            case "Date":
                return this.convertDateToBP(value);
            case "Timestamp/Epoch":
                return this.convertTimestampToBP(value);
            case "Years BP":
                return value; // Already in BP
            default:
                throw new Error(`Unsupported time format: ${timeFormat}`);
        }
    }

    convertTimestampToBP(timestamp) {
        const year = new Date(timestamp).getFullYear();
        const bp = 1950 - year;
    
        return bp;
    }

    convertDateToBP(dateString) {
        const date = new Date(dateString);
        if (isNaN(date)) {
            throw new Error(`Invalid date format: ${dateString}`);
        }
    
        const year = date.getFullYear();
        const bp = 1950 - year;
    
        return bp;
    }

    async renderImportFormCsv(csvData) {
        let headers = csvData.headers;
        return new Promise((resolve) => {
            const formContent = $(`<div class="timeline-import-form-container"></div>`);
    
            // X-axis column selection
            let xColumnSelect = $(`<select id='x-column-select' class='timeline-form-select'></select>`);
            formContent.append($("<label for='x-column-select' class='timeline-form-label'>Select X-axis Column (Time):</label>"));
            formContent.append(xColumnSelect);
            formContent.append($("<div class='timeline-form-spacing'></div>")); // Add spacing
    
            // Time format selection
            let timeFormatSelect = $(`<select id='time-format-select' class='timeline-form-select'></select>`);
            this.timeFormatsForImport.forEach((format) => {
                timeFormatSelect.append($(`<option value="${format}">${format}</option>`));
            });
            formContent.append($("<label for='time-format-select' class='timeline-form-label'>Select Time Format (X-axis):</label>"));
            formContent.append(timeFormatSelect);
            formContent.append($("<div class='timeline-form-spacing'></div>")); // Add spacing

            // Y-axis column selection
            let yColumnSelect = $(`<select id='y-column-select' class='timeline-form-select'></select>`);
            formContent.append($("<label for='y-column-select' class='timeline-form-label'>Select Y-axis Column (Data):</label>"));
            formContent.append(yColumnSelect);
            formContent.append($("<div class='timeline-form-spacing'></div>")); // Add spacing
    
            // Submit button
            let submitButtonId = "submit-import-form-" + nanoid(6);
            formContent.append($(`<button id='${submitButtonId}' class='btn btn-primary timeline-form-submit-btn'>Submit</button>`));
    
            // Show the form in a popover
            this.sqs.dialogManager.showPopOver("Import Data", formContent);
    
            // Populate column options
            headers.forEach((header) => {
                const label = header;
                xColumnSelect.append($(`<option value="${label}">${label}</option>`));
                yColumnSelect.append($(`<option value="${label}">${label}</option>`));
            });
    
            // Handle form submission
            $(`#${submitButtonId}`).on("click", () => {
                const xColumn = $("#x-column-select").val();
                const yColumn = $("#y-column-select").val();
                const timeFormat = $("#time-format-select").val();
    
                if (!xColumn || !yColumn || !timeFormat) {
                    console.warn("Form submission incomplete. Please fill out all fields.");
                    return;
                }
    
                this.sqs.dialogManager.hidePopOver();
    
                // Convert CSV data to JSON
                const jsonData = csvData.data.map((row) => {
                    const xValue = row[xColumn];
                    const yValue = row[yColumn];
    
                    if (xValue !== null && yValue !== null) {
                        try {
                            const xBP = this.convertToBP(xValue, timeFormat); // Convert X-axis value to BP
                            return { x: xBP, y: yValue };
                        } catch (error) {
                            console.warn(`Skipping row due to conversion error:`, error);
                        }
                    }
                    return null;
                }).filter((row) => row !== null); // Remove null rows
    
                // Resolve with the parsed data and metadata
                resolve({ jsonData, xColumn, yColumn, timeFormat });
            });
        });
    }

    async renderImportFormExcel(workbook) {
        return new Promise((resolve) => {
            const worksheetNames = workbook.worksheets.map((sheet) => sheet.name);
    
            // Create the form container
            let formContent = $(`<div class="timeline-import-form-container"></div>`);
    
            // Worksheet selection
            let worksheetSelect = $(`<select id='worksheet-select' class='timeline-form-select'></select>`);
            worksheetNames.forEach((name) => {
                worksheetSelect.append($(`<option value="${name}">${name}</option>`));
            });
            formContent.append($("<label for='worksheet-select' class='timeline-form-label'>Select Worksheet:</label>"));
            formContent.append(worksheetSelect);
            formContent.append($("<div class='timeline-form-spacing'></div>")); // Add spacing
    
            // X-axis column selection
            let xColumnSelect = $(`<select id='x-column-select' class='timeline-form-select'></select>`);
            formContent.append($("<label for='x-column-select' class='timeline-form-label'>Select X-axis Column (Time):</label>"));
            formContent.append(xColumnSelect);
            formContent.append($("<div class='timeline-form-spacing'></div>")); // Add spacing
    
            // Time format selection
            let timeFormatSelect = $(`<select id='time-format-select' class='timeline-form-select'></select>`);
            this.timeFormatsForImport.forEach((format) => {
                timeFormatSelect.append($(`<option value="${format}">${format}</option>`));
            });
            formContent.append($("<label for='time-format-select' class='timeline-form-label'>Select Time Format (X-axis):</label>"));
            formContent.append(timeFormatSelect);
            formContent.append($("<div class='timeline-form-spacing'></div>")); // Add spacing
    
            // Y-axis column selection
            let yColumnSelect = $(`<select id='y-column-select' class='timeline-form-select'></select>`);
            formContent.append($("<label for='y-column-select' class='timeline-form-label'>Select Y-axis Column (Data):</label>"));
            formContent.append(yColumnSelect);
            formContent.append($("<div class='timeline-form-spacing'></div>")); // Add spacing
    
            // Submit button
            let submitButtonId = "submit-import-form-" + nanoid(6);
            formContent.append($(`<button id='${submitButtonId}' class='btn btn-primary timeline-form-submit-btn'>Submit</button>`));
    
            // Show the form in a popover
            this.sqs.dialogManager.showPopOver("Import Data", formContent);
    
            // Populate column options when a worksheet is selected
            const populateColumns = () => {
                const selectedWorksheetName = $("#worksheet-select").val();
                const selectedWorksheet = workbook.getWorksheet(selectedWorksheetName);
                const headers = this.getHeadersFromWorksheet(selectedWorksheet);
    
                xColumnSelect.empty();
                yColumnSelect.empty();
                headers.forEach((header) => {
                    const label = typeof header.name === "object" ? header.name.richText[0].text : header.name;
                    xColumnSelect.append($(`<option value="${label}">${label}</option>`));
                    yColumnSelect.append($(`<option value="${label}">${label}</option>`));
                });
            };
    
            // Populate columns initially and on worksheet change
            populateColumns();
            $("#worksheet-select").on("change", populateColumns);
    
            // Handle form submission
            $(`#${submitButtonId}`).on("click", () => {
                const selectedWorksheetName = $("#worksheet-select").val();
                const selectedWorksheet = workbook.getWorksheet(selectedWorksheetName);
                const xColumn = $("#x-column-select").val();
                const yColumn = $("#y-column-select").val();
                const timeFormat = $("#time-format-select").val();
    
                if (!selectedWorksheet || !xColumn || !yColumn || !timeFormat) {
                    console.warn("Form submission incomplete. Please fill out all fields.");
                    return;
                }
    
                this.sqs.dialogManager.hidePopOver();
    
                // Convert worksheet data to JSON
                const jsonData = this.convertWorksheetToJSON(selectedWorksheet, xColumn, yColumn, timeFormat);
    
                // Resolve with the parsed data and metadata
                resolve({ jsonData, xColumn, yColumn, timeFormat });
            });
        });
    }

    getHeadersFromWorksheet(worksheet) {
        const headers = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
            headers.push({ name: cell.value, index: colNumber });
        });
        return headers;
    }

    convertWorksheetToJSON(worksheet, xColumnName, yColumnName, timeFormat = "Years BP") {
        const jsonData = [];
        const headerRow = worksheet.getRow(1); // Assume the first row contains headers
        const columnMap = {};
    
        // Map column names to their indices
        headerRow.eachCell((cell, colNumber) => {
            if (cell.value) {
                columnMap[cell.value] = colNumber;
            }
        });
    
        // Ensure the selected columns exist in the column map
        const xColumnIndex = columnMap[xColumnName];
        const yColumnIndex = columnMap[yColumnName];
    
        if (!xColumnIndex || !yColumnIndex) {
            console.error(`ERROR: Could not find columns "${xColumnName}" or "${yColumnName}" in the worksheet.`);
            return jsonData;
        }
    
        // Iterate through the rows and extract data from the selected columns
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip the header row
    
            const xValue = row.getCell(xColumnIndex).value;
            const yValue = row.getCell(yColumnIndex).value;
    
            if (xValue !== null && yValue !== null) {
                try {
                    const xBP = this.convertToBP(xValue, timeFormat); // Convert X-axis value to BP
                    jsonData.push({ x: xBP, y: yValue });
                } catch (error) {
                    console.warn(`Skipping row ${rowNumber} due to conversion error:`, error);
                }
            }
        });
    
        return jsonData;
    }

    async askUserToSelectColumns(headers) {
        return new Promise((resolve) => {
            const headerNames = headers.map((header) => header.name);

            let popOverContent = $(`<div></div>`);

            let xColumnSelect = $(`<select id='x-column-select'></select>`);
            let yColumnSelect = $(`<select id='y-column-select'></select>`);
            headerNames.forEach((name) => {
                let label = name;
                if(typeof name == 'object') {
                    label = name["richText"][0].text;
                }
                xColumnSelect.append($(`<option value="${label}">${label}</option>`));
                yColumnSelect.append($(`<option value="${label}">${label}</option>`));
            });

            popOverContent.append($("<label for='x-column-select'>Select X-axis column:</label>"));
            popOverContent.append(xColumnSelect);
            popOverContent.append($("<label for='y-column-select'>Select Y-axis column:</label>"));
            popOverContent.append(yColumnSelect);

            let btnId = "select-columns-btn-"+nanoid(6);
            popOverContent.append($("<button id='"+btnId+"' class='btn btn-primary'>Select</button>"));
            this.sqs.dialogManager.showPopOver("Select columns for X and Y axes", popOverContent);
            $("#"+btnId).on("click", (e) => {
                const xColumn = $("#x-column-select").val();
                const yColumn = $("#y-column-select").val();
                this.sqs.dialogManager.hidePopOver();

                resolve({ xColumn, yColumn });
            });
        });
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
            const selected = option.name === this.selectedGraphDataOption.name ? 'selected' : '';
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
        if(this.timelineDomId) {
            this.updateGraph();
        }
        else {
            this.renderGraph();
        }
    }

    getSelectedGraphDataOption() {
        const selectedOption = $("#timeline-data-selector").val();
        const selectedGraphDataOption = this.graphDataOptions.find(option => option.name === selectedOption);
        return selectedGraphDataOption;
    }

    getGraphRange() {
        let range = [];
        let datingSystem = this.getSelectedDatingSystem();
        if(datingSystem == "BP") {
            range = [this.selections[0]*-1, this.selections[1]*-1];
        }
        else {
            range[0] = this.convertADBCtoBP(this.selections[0] * -1);
            range[1] = this.convertADBCtoBP(this.selections[1] * -1);
        }

        return range;
    }

    updateGraph() {
        let range = this.getGraphRange();

        // Update the x-axis range
        Plotly.relayout(this.timelineDomId, {
            'xaxis.range': range,
        }).then(() => {
            console.log(`IOModule ${this.name} graph range updated to: ${range}`);
        });
    }

    updateAllSelectedTraces() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} updating all selected traces.`);
        }

        this.chartTraces.forEach((trace) => {
            const traceName = trace.trace.name;
            const graphDataOption = this.getGraphDataOptionByTraceName(traceName);
            if(graphDataOption) {
                this.updateTraceInGraph(trace);
            }
        });
    }

    async addAllSelectedTracesToGraph() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} adding all selected traces to graph.`);
        }

        let graphDataOption = this.getSelectedGraphDataOption();
        if(this.isTraceRendered(graphDataOption.name)) {
            console.warn(`IOModule ${this.name} graph already rendered, refusing to add another one.`);
            return;
        }

        this.chartTraces.forEach((trace) => {
            if(!trace.hidden) {

            }
        });

        this.fetchGraphData(graphDataOption).then(graphTrace => {
            this.addTraceToGraph(graphTrace, true);
        });
    }

    isTraceRendered(traceName) {
        const trace = this.chartTraces.find(t => t.trace.name === traceName);
        return trace ? true : false;
    }

    isTraceVisible(traceName) {
        const trace = this.chartTraces.find(t => t.trace.name === traceName);
        return trace && !trace.hidden ? true : false;
    }

    async fetchGraphData(graphDataOption) {
        return new Promise((resolve) => {
            if(this.verboseLogging) {
                console.log(`IOModule ${this.name} fetching graph data.`);
            }
    
            let server = this.sqs.config.siteReportServerAddress;
            if(graphDataOption.endpoint == "postgrest") {
                const fetcher = new PostgRESTFetcher(server, graphDataOption.endpointConfig.table);
                let bpValues = this.convertSliderSelectionsToBP(this.selections);
                fetcher.fetchSeriesData(graphDataOption.endpointConfig.xColumn, graphDataOption.endpointConfig.yColumn, bpValues[0], bpValues[1]).then(series => {
                    const trace = {
                        x: series.x,
                        y: series.y,
                        mode: 'lines',
                        type: 'scatter',
                        name: graphDataOption.name,
                        marker: {
                            size: 5,
                            color: graphDataOption.color,
                            line: {
                                width: 0.5,
                                color: graphDataOption.color
                            }
                        }
                    };

                    resolve(trace);
                });
            }
            if(graphDataOption.endpoint == "sead_query_api") {
                /*
                this.datasets.filtered here is in the format:
                [ 
                {min: -10000000, max: -9800000, value: 0},
                {min: -9800000, max: -9600000, value: 0},
                {min: -9600000, max: -9400000, value: 0},
                ...
                ]

                we need to convert it to a series of points for the graph, so we need to create a new array with the x and y values
                where x is the midpoint of the min and max values, and y is the value
                */
                console.log(this.datasets.filtered);

                const trace = {
                    x: this.datasets.filtered.map((item) => item.min), // Use `min` values for x-axis
                    y: this.datasets.filtered.map((item) => item.value), // Use `value` for y-axis
                    type: 'bar', // Set the type to 'bar' for a bar graph
                    name: graphDataOption.name,
                    marker: {
                        color: graphDataOption.color, // Use the color from the graphDataOption
                    }
                };

                resolve(trace);
            }
        });
    }

    importData(importData, overwrite = true) {
        super.importData(importData);

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
    }

    updateTraceInGraph(trace) {
        if (this.verboseLogging) {
            console.log(`IOModule ${this.name} updating trace in graph.`);
        }

        const traceId = this.chartTraces.find(t => t.trace.name === trace.name).id;
        if (traceId !== undefined) {
            Plotly.update(this.timelineDomId, trace, [traceId]).then(() => {
                console.log(`IOModule ${this.name} trace updated in graph.`);
            });
        } else {
            console.warn(`Trace with name ${trace.name} not found in chartTraces.`);
        }
    }

    addTraceToGraph(trace, builtIn = false, reRenderIfAlreadyExists = false) {
        if (this.verboseLogging) {
            console.log(`IOModule ${this.name} adding plot to graph.`);
        }

        let graphDataOption = this.getGraphDataOptionByTraceName(trace.name);
        if(graphDataOption && this.isTraceRendered(graphDataOption.name) && !reRenderIfAlreadyExists) {
            console.warn(`IOModule ${this.name} graph already rendered, refusing to add another one.`);
            return;
        }
        else if(graphDataOption && this.isTraceRendered(graphDataOption.name) && reRenderIfAlreadyExists) {
            //remove the trace from the graph
            const traceId = this.chartTraces.find(t => t.trace.name === trace.name).id;
            this.deleteTraceFromGraph(traceId);
        }
    
        if (this.timelineDomId) {

            //if we are using BP, but displaying in AD/BC, we need to convert the x values
            if(this.selectedDatingSystem == "AD/BC") {
                trace.x = trace.x.map((value) => this.convertBPtoADBC(value));
            }
    
            Plotly.addTraces(this.timelineDomId, [trace]).then(t => {
                const plotDiv = document.getElementById(this.timelineDomId);
                const newTraceIndex = plotDiv.data.length - 1;

                // add a ref to this trace in the chartDataOptions array
                this.graphDataOptions.forEach((option) => {
                    if (option.name === trace.name) {
                        option.traceId = newTraceIndex;
                    }
                });

                this.addToChartTraces({
                    id: newTraceIndex,
                    trace: trace,
                    builtIn: builtIn,
                    hidden: false,
                });

                this.traceIdCounter++;

                // Add a new div for the trace with a delete button
                this.updateLegend();
            });
    
            
        } else {
            console.warn(`WARN: Timeline graph not initialized, cannot add plot to graph.`);
        }
    }
    
    addToChartTraces(trace) {
        if (this.verboseLogging) {
            console.log(`IOModule ${this.name} adding trace to chartTraces.`);
        }

        //check if it already exists
        const existingTrace = this.chartTraces.find(t => t.trace.name === trace.name);
        if (existingTrace) {
            console.warn(`Trace with name ${trace.name} already exists in chartTraces.`);
            return;
        }
    
        this.chartTraces.push(trace);
    }

    removeFromChartTracesByName(traceName) {
        if (this.verboseLogging) {
            console.log(`IOModule ${this.name} removing trace from chartTraces.`);
        }

        const traceIndex = this.chartTraces.findIndex(trace => trace.trace.name === traceName);
        if (traceIndex !== -1) {
            this.chartTraces.splice(traceIndex, 1);
        } else {
            console.warn(`Trace with name ${traceName} not found in chartTraces.`);
        }   
    }

    getChartTraceByName(traceName) {
        return this.chartTraces.find(trace => trace.trace.name === traceName);
    }

    updateLegend() {
        // Clear the legend container
        const legendContainer = $("#timeline-data-selector-traces-list");
        legendContainer.empty();
    
        this.chartTraces.forEach((trace) => {
            const eyeClass = trace.hidden ? "fa-eye-slash" : "fa-eye";
            const traceDiv = $(`
                <div class="timeline-trace-item">
                    <span class="trace-legend" style="background-color: ${trace.trace.marker.color};"></span>
                    <span class="trace-name">${trace.trace.name}</span>
                    <i class="fa ${eyeClass} hide-plot" aria-hidden="true"></i>
                    <i class="fa fa-trash-o remove-plot" aria-hidden="true"></i>
                </div>
            `);
    
            // Add delete functionality
            traceDiv.find(".remove-plot").on("click", () => {
                this.deleteTraceFromGraph(trace.id);
                traceDiv.remove();
            });

            // Add hide/show functionality
            traceDiv.find(".hide-plot").on("click", () => {
                if(!trace.hidden) {
                    //set .hide-plot to fa-eye-slash
                    traceDiv.find(".hide-plot").removeClass("fa-eye").addClass("fa-eye-slash");
                    this.hideTraceFromGraph(trace.id);
                }
                else {
                    //set .hide-plot to fa-eye
                    traceDiv.find(".hide-plot").removeClass("fa-eye-slash").addClass("fa-eye");
                    this.showTraceInGraph(trace.id);
                }
            });
    
            // Append the trace div to the container
            legendContainer.append(traceDiv);
        });
    }

    getGraphDataOptionByTraceName(traceName) {
        return this.graphDataOptions.find(option => option.name === traceName);
    }


    showTraceInGraph(traceId) {
        if (this.verboseLogging) {
            console.log(`IOModule ${this.name} showing trace in graph.`);
        }
    
        // Find the trace in this.chartTraces by its traceId
        const traceIndex = this.chartTraces.findIndex((trace) => trace.id === traceId);
    
        if (traceIndex === -1) {
            console.warn(`No trace found for traceId: ${traceId}`);
            return;
        }
    
        // Show the trace in Plotly
        Plotly.restyle(this.timelineDomId, { visible: true }, [traceIndex]).then(() => {
            // Update the chartTraces to show that the trace is visible
            this.chartTraces[traceIndex].hidden = false;
    
            // Update the legend to reflect the changes
            this.updateLegend();
        }).catch((error) => {
            console.error(`Failed to show trace with traceId: ${traceId}`, error);
        });
    }

    hideTraceFromGraph(traceId) {
        if (this.verboseLogging) {
            console.log(`IOModule ${this.name} hiding trace in graph.`);
        }
    
        // Find the trace in this.chartTraces by its traceId
        const traceIndex = this.chartTraces.findIndex((trace) => trace.id === traceId);
    
        if (traceIndex === -1) {
            console.warn(`No trace found for traceId: ${traceId}`);
            return;
        }

        // Hide the trace in Plotly
        Plotly.restyle(this.timelineDomId, { visible: false }, [traceIndex]).then(() => {
            // Update the chartTraces to show that the trace is hidden
            this.chartTraces[traceIndex].hidden = true;
    
            // Enforce the fixed range for the x-axis and y-axis
            const range = this.getGraphRange(); // Ensure this method returns the desired fixed range
            this.plotlyLayout.xaxis.range = range;
            Plotly.relayout(this.timelineDomId, this.plotlyLayout);
    
            // Update the legend to reflect the changes
            this.updateLegend();
        }).catch((error) => {
            console.error(`Failed to hide trace with traceId: ${traceId}`, error);
        });
    }

    deleteTraceFromGraph(traceId) {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} deleting trace from graph.`);
        }

        // Find the trace in this.chartTraces by its traceId
        const traceIndex = this.chartTraces.findIndex((trace) => trace.id === traceId);
    
        if (traceIndex === -1) {
            console.warn(`No trace found for traceId: ${traceId}`);
            return;
        }
    
        // Remove the trace from Plotly
        Plotly.deleteTraces(this.timelineDomId, traceIndex).then(() => {
            // Remove the trace from chartTraces
            this.chartTraces.splice(traceIndex, 1);
    
            // Rebuild chartTraces to ensure indices match Plotly's internal data
            this.chartTraces = this.chartTraces.map((trace, index) => ({
                ...trace,
                id: index // Update the id to match the new index
            }));

            // If the trace was built-in, set its rendered property to false
            this.graphDataOptions.forEach((option) => {
                if (option.name === traceId) {
                    console.log(option);
                }
            });
    
            // Update the legend to reflect the changes
            this.updateLegend();
        }).catch((error) => {
            console.error(`Failed to delete trace with traceId: ${traceId}`, error);
        });
    }

    renderGraph() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} rendering graph.`);
        }
        
        this.timelineDomId = "graph-"+nanoid(6);
        $(".timeline-graph", this.getDomRef()).attr("id", this.timelineDomId);

        let range = this.getGraphRange();

        this.plotlyLayout = {
            xaxis: {
                range: range,
                showticklabels: true,
                tickformat: '~s',
                fixedrange: true,
                autorange: "reversed"
            },
            yaxis: {
                showticklabels: false,
                zeroline: false,
                fixedrange: true
            },
            margin: {
                l: 30, // Left margin
                r: 30, // Right margin
                t: 10, // Top margin
                b: 70  // Bottom margin
            },
            showlegend: false,
            paper_bgcolor: 'rgba(0,0,0,0)', // Transparent background for the outer area
            plot_bgcolor: 'rgba(0,0,0,0)'   // Transparent background for the plot area
        };

        const config = {
            responsive: true, // Makes the chart responsive
            displayModeBar: false
        };

        Plotly.newPlot(this.timelineDomId, [], this.plotlyLayout, config);

        //this.updateGraph();

        this.addAllSelectedTracesToGraph();

        this.sqs.sqsEventListen("layoutResize", () => {
            Plotly.Plots.resize(this.timelineDomId);
        });
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
        this.setSelectedScale(selectedScale, false, false);

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

        if(this.debugValuesInSlider) {
            this.upperManualInputNodeDebugOutput = $(".noUi-handle-upper .slider-manual-input-container .range-facet-debug-output", this.getDomRef());
            this.lowerManualInputNodeDebugOutput = $(".noUi-handle-lower .slider-manual-input-container .range-facet-debug-output", this.getDomRef());

            this.upperManualInputNodeDebugOutput.show();
            this.lowerManualInputNodeDebugOutput.show();
        }

        $(".slider-manual-input-container", this.getDomRef()).on("change", (evt) => {
            this.sliderManualInputCallback(evt);
        });


        this.slider.off("update");
        this.slider.on("update", (values, slider) => {
            this.sliderUpdateCallback(values);
        });
        this.slider.on("change", (values, slider) => {
            this.setSelections([parseInt(values[0]), parseInt(values[1])]);
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

    sliderManualInputCallback(evt) {
        let tabIndex = $(evt.target).attr("tabindex");
        let value = evt.target.value;
        let previousValue = this.selections[tabIndex-1];
        value = this.parseInputValue(value, previousValue);

        if(!value) {
            console.warn("WARN: Value is not valid, ignoring");
            return;
        }

        //if the dating system is BP, we need to reverse the value
        let datingSystem = this.getSelectedDatingSystem();
        if(datingSystem == "BP") {
            value = value * -1;
        }

        //we have to process the value here before we are ready to start using it because there are a few things to consider:
        //if the scale is AD/BC, we need to convert the value to BP

        //and when the value is BP we need to reverse it since the slider is set up to handle BP in reverse (for technical reasons), so plus is minus and minus should be plus

        /*
        if(this.selectedDatingSystem == "BP") {
            value = value * -1;
        }
        */

        
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
    }

    parseInputValue(value) {
        // Ensure the value is a string and clean it up
        if (value === undefined || value === null) return false;
    
        value = value.toString().trim().toLowerCase();
        value = value.replace(/,/g, '');      // remove commas
        value = value.replace(/\s+/g, '');    // remove all spaces
    
        // Extract era suffix if present: bc, ad, bp
        const eraMatch = value.match(/(bc|ad|bp)$/);
        let era = null;
        if (eraMatch) {
            era = eraMatch[1];
            value = value.replace(/(bc|ad|bp)$/, '');
        }
    
        // Handle k/m suffix
        let multiplier = 1;
        if (value.endsWith('k')) {
            multiplier = 1000;
            value = value.slice(0, -1);
        } else if (value.endsWith('m')) {
            multiplier = 1000000;
            value = value.slice(0, -1);
        }
    
        // Try parsing the numeric part
        let numeric = parseFloat(value);
        if (isNaN(numeric)) return false; // Invalid number
    
        numeric *= multiplier;
    
        // Handle AD/BC
        if (era === 'bc') {
            return this.convertADBCtoBP(-numeric);
        } else if (era === 'ad') {
            return this.convertADBCtoBP(numeric);
        } else if (era === 'bp' || era === null) {
            return numeric;
        } else {
            return false; // Unexpected suffix
        }
    }

    renderSlider() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} rendering slider.`);
        }
        //this.createChart();

        // Generate random data
        const x = Array.from({ length: 500 }, () => Math.random()).sort((a, b) => a - b);
        const y = x.map((val, index) => index);
        
        //create the slider
        if(this.slider == null) {
            this.initSlider();
        }

    }

	getSelectedScale() {
		return this.scaleDefinitions.find((scale) => scale.id == this.selectedScale);
	}

    setSelectedScale(selectedScale, newDatingSystem = false, triggerUpdate = true) {
		console.log("Setting selected scale", selectedScale, newDatingSystem);

        /*
		if (this.selectedDatingSystem === "AD/BC") {
			this.sliderMin = this.currentYear + selectedScale.older;
			this.sliderMax = this.sqs.config.constants.BP + selectedScale.younger;
		} else {
			this.sliderMin = selectedScale.older + this.bpDiff;
			this.sliderMax = selectedScale.younger;
		}
        */
        this.sliderMin = selectedScale.older + this.bpDiff;
        this.sliderMax = selectedScale.younger;

		if(newDatingSystem) {
			//recalculate the current values to fit the new dating system
			/*
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
            */
		}
	
		if(this.slider) {
			this.slider.updateOptions({
				range: {
					'min': this.sliderMin,
					'max': this.sliderMax,
				},
				//start: this.currentValues
			});
		}
		else {
			console.warn("WARN: Slider not initialized yet, cannot set scale");
		}

        if(this.currentValuesInitialized == false) {
            console.warn("Current values not initialized at setSelectedScale, setting to slider range");
            this.currentValues[0] = this.sliderMin;
            this.currentValues[1] = this.sliderMax;
        }

		this.setSelections(this.currentValues, triggerUpdate);

        console.log("Setting slider values to", this.currentValues);
        this.sliderUpdateCallback(this.currentValues);

        if(triggerUpdate) {
            // Trigger any updates or re-rendering needed for the slider
            this.sliderUpdateCallback(this.currentValues);

            this.fetchData();

            let graphDataOption = this.getSelectedGraphDataOption();
            this.fetchGraphData(graphDataOption).then(graphTrace => {
                this.addTraceToGraph(graphTrace, true, true);
            });
        }
	}

    getSelectedDatingSystem() {
        const selectedOption = $("#timeline-dating-system-selector").val();
        const selectedDatingSystem = this.datingSystems.find(option => option === selectedOption);
        return selectedDatingSystem;
    }

    convertSliderSelectionsToBP(selections) {
		return [selections[1] * -1, selections[0] * -1];
	}

    formatValueForDisplay(value, datingSystem, prettyPrint = true, includeDatingSystem = true) {
        // Convert BP to AD/BC if the AD/BC system is selected
        if (datingSystem === "AD/BC") {
            value = this.convertBPtoADBC(value);
        }
    
        const absValue = Math.abs(value);
        const isOldEnough = absValue >= 5000;
    
        let formattedValue;
    
        // Apply pretty formatting for large numbers
        if (prettyPrint && isOldEnough) {
            if (absValue >= 1_000_000) {
                formattedValue = (absValue / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
            } else if (absValue >= 1_000) {
                formattedValue = (absValue / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
            } else {
                formattedValue = absValue.toString();
            }
        } else {
            formattedValue = absValue.toString();
        }
    
        // Add suffix for AD/BC system
        if (includeDatingSystem && datingSystem === "AD/BC") {
            console.log(value);
            formattedValue += ` ${value > 0 ? "AD" : "BC"}`;
        } else if (includeDatingSystem) {
            // Add suffix for BP system
            formattedValue += " BP";
        }
    
        return formattedValue;
    }

    sliderUpdateCallback(values, moveSlider = false) {
        if(this.verboseLogging) {
            //.log("IOModule "+this.name+" slider update callback", values);
        }
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
		
		this.currentValues = values;
        this.currentValuesInitialized = true;
		$(this.lowerManualInputNode).val(this.formatValueForDisplay(this.currentValues[0], this.selectedDatingSystem, true, false));
		$(this.upperManualInputNode).val(this.formatValueForDisplay(this.currentValues[1], this.selectedDatingSystem, true, false));

        if(this.debugValuesInSlider) {
            $(this.lowerManualInputNodeDebugOutput).val(this.currentValues[0]);
            $(this.upperManualInputNodeDebugOutput).val(this.currentValues[1]);
        }

		if (this.selectedDatingSystem === "AD/BC") {
            let lowerSuffix = this.convertBPtoADBC(this.currentValues[0]) > 0 ? "AD" : "BC";
            let upperSuffix = this.convertBPtoADBC(this.currentValues[1]) > 0 ? "AD" : "BC";
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

    setSelections(selections, triggerUpdate = true) {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} setting selections (${selections}).`);
        }

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
		
		if(selectionsUpdated && triggerUpdate) {
            /*
            let graphDataOption = this.getSelectedGraphDataOption();
            this.fetchGraphData(graphDataOption).then(graphTrace => {
                this.addTraceToGraph(graphTrace, true, true);
            });
            */
            
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

class PostgRESTFetcher {
    constructor(baseUrl, tableName) {
      this.baseUrl = baseUrl.endsWith('/')
        ? `${baseUrl}${tableName}`
        : `${baseUrl}/${tableName}`;
    }
  
    /**
     * Fetches data and returns filtered series data for a chart
     * @param {string} xColumn - Column name for X axis (default: 'years_bp')
     * @param {string} yColumn - Column name for Y axis (default: 'd180_gisp2')
     * @param {number} [minX] - Optional minimum value for X (inclusive)
     * @param {number} [maxX] - Optional maximum value for X (inclusive)
     * @returns {Promise<{ x: number[], y: number[] }>}
     */
    async fetchSeriesData(xColumn = 'years_bp', yColumn = 'd180_gisp2', minX, maxX) {
        const filters = [];
      
        // Defensive BP logic: higher BP is older
        const [bpStart, bpEnd] = [minX, maxX].sort((a, b) => a - b); // ascending
      
        if (bpStart !== undefined) {
          filters.push(`${xColumn}=gte.${encodeURIComponent(bpStart)}`);
        }
        if (bpEnd !== undefined) {
          filters.push(`${xColumn}=lte.${encodeURIComponent(bpEnd)}`);
        }
      
        const filterQuery = filters.length ? `&${filters.join('&')}` : '';
        const url = `${this.baseUrl}?select=${xColumn},${yColumn}${filterQuery}`;
      
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch data: ${response.statusText}`);
        }
      
        const rawData = await response.json();
      
        const x = [];
        const y = [];
      
        for (const row of rawData) {
          if (row[xColumn] != null && row[yColumn] != null) {
            x.push(Number(row[xColumn]));
            y.push(Number(row[yColumn]));
          }
        }
      
        return { x, y };
    }
}
  

  class GraphDataOption {
    constructor(name, color, endpoint, endpointConfig) {
        this.name = name;
        this.endpoint = endpoint;
        this.color = color;
        this.endpointConfig = endpointConfig;
    }
}

  export default Timeline;