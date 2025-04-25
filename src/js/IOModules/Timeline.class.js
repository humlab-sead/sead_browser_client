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

        this.verboseLogging = true;

        this.currentValuesInitialized = false;

        //the "currentValues" are the values of the slider, it's similar to the "selections" but with the difference that:
        //1. When the selections are being changed, a new filter load and broadbast needs to be performed. currentValues is just the internal state of this module and needs not necessarily be broadcasted when changed.
        //2. The selections should always be in a very specific format - which is years BP. The currentValues can be in an internal "virtual" format, such as a pretend version of BP which might have a reversed polarity, so it's e.g. -20000BP to +75 BP.
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
        this.timelineDomId = null;
        this.traceIdCounter = 0;
        this.chartTraces = [];
        this.chartTraceColors = this.sqs.color.getColorScheme(10, 0.75);
        this.selectedGraphDataOption = userSettings.timelineGraphDataOption || "δ18O from GISP2 Ice Core";

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

        /*
        this.graphDataOptions = [
			{
				name: "δ18O from GISP2 Ice Core",
				endpoint: "postgrest",
                color: this.chartTraceColors.shift(),
                endpointConfig: {
                    table: "tbl_temperatures",
                    xColumn: "years_bp",
                    yColumn: "d180_gisp2"
                }
			},
            {
                name: "Nothing",
                endpoint: null,
                color: "transparent",
                endpointConfig: null
            },
		];
        */

        this.graphDataOptions = [
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
                "Nothing",
                "transparent",
                null
            ),
        ];

        this.populateDatingSystemsSelector();
        this.populateScaleDefinitionsSelector();
		this.populateGraphDataOptionsSelector(this.graphDataOptions);

		$("#timeline-data-selector").on("change", (e) => {
			console.log("Changing data selector", e.target.value);

            this.selectedGraphDataOption = e.target.value;

            this.sqs.setUserSettings({
                timelineGraphDataOption: this.selectedGraphDataOption
            });

            this.updateGraph();
		});

        $(".facet-text-search-btn", this.getDomRef()).hide();
    
        this.initDroppable();
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
        
        if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const workbook = new ExcelJS.Workbook();
                    await workbook.xlsx.load(e.target.result); // Load the Excel file
    
                    // Render the unified import form and get the parsed data
                    const importResult = await this.renderImportFormExcel(workbook);
                    if (!importResult) {
                        console.warn("Import process was canceled or failed.");
                        return;
                    }
    
                    const { jsonData, xColumn, yColumn, timeFormat } = importResult;
    
                    // Plot the graph with the selected data
                    this.traceIdCounter++;
                    this.addTraceToGrah(jsonData, `${yColumn} (${timeFormat})`, this.chartTraceColors[this.traceIdCounter % this.chartTraceColors.length]);
                } catch (error) {
                    console.error("ERROR: Failed to parse Excel file:", error);
                }
            };
            reader.readAsArrayBuffer(file); // Read the file as an ArrayBuffer
        } else if(file.name.endsWith(".csv")) {
            // Handle CSV file import
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const csvContent = e.target.result;
                    const parsedData = this.parseCSV(csvContent);
                    console.log(parsedData)
                    // Render the unified import form and get the parsed data
                    const importResult = await this.renderImportFormCsv(parsedData);
                    if (!importResult) {
                        console.warn("Import process was canceled or failed.");
                        return;
                    }
    
                    const { jsonData, xColumn, yColumn, timeFormat } = importResult;

                    // Plot the graph with the selected data
                    this.traceIdCounter++;
                    this.addTraceToGrah(jsonData, `${yColumn} (${timeFormat})`, this.chartTraceColors[this.traceIdCounter % this.chartTraceColors.length]);
                } catch (error) {
                    console.error("ERROR: Failed to parse CSV file:", error);
                }
            };
            reader.readAsText(file); // Read the file as text
        }
        else {
            //notify the user that the file is not supported
            this.sqs.notificationManager.notify("Unsupported file type. Please drop a .xlsx, .xls, or .csv file.", "error");
        }
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
        this.renderGraph();
    }

    getSelectedGraphDataOption() {
        const selectedOption = $("#timeline-data-selector").val();
        const selectedGraphDataOption = this.graphDataOptions.find(option => option.name === selectedOption);
        return selectedGraphDataOption;
    }

    updateGraph() {
        let graphDataOption = this.getSelectedGraphDataOption();

        //remove the trace from the graph
        this.chartTraces.filter(trace => trace.builtIn).forEach(trace => {
            this.deletePlotFromGraph(trace.id);
        });

        if(graphDataOption.name == "Nothing") {
            //If the user selected "Nothing", AND there's no other traces, then hide the X-axis tick labels
            /*
            let otherTraces = this.chartTraces.filter(trace => !trace.builtIn);
            if(otherTraces.length == 0) {
                Plotly.relayout(this.timelineDomId, {
                    'xaxis.showticklabels': false
                }).then(() => {
                    console.log(`IOModule ${this.name} graph range updated to: false`);
                });
            }
            */
        }
        else {
            /*
            Plotly.relayout(this.timelineDomId, {
                'xaxis.showticklabels': true
            }).then(() => {
                console.log(`IOModule ${this.name} graph range updated to: true`);
            });
            */

            const datingSystem = this.getSelectedDatingSystem();
            let range;
            if(datingSystem == "AD/BC") {
                range = [this.selections[1]*-1, this.selections[0]*-1];
            }
            else {
                range = [this.selections[1], this.selections[0]];
            }

            console.log(range);

            // Update the x-axis range
            Plotly.relayout(this.timelineDomId, {
                'xaxis.range': range,
                'xaxis.autorange': false
            }).then(() => {
                console.log(`IOModule ${this.name} graph range updated to: ${range}`);
            });

            this.fetchGraphData().then(graphTraceData => {
                this.addTraceToGrah(graphTraceData, graphDataOption.name, graphDataOption.color, true);
            });
        }
    }

    async fetchGraphData() {
        return new Promise((resolve) => {
            if(this.verboseLogging) {
                console.log(`IOModule ${this.name} fetching graph data.`);
            }
    
            let graphDataOption = this.getSelectedGraphDataOption();
            
            if(graphDataOption.name == "Nothing") {
                //remove the trace from the graph
                console.warn(`TODO: Remove trace from graph.`);
            }
    
            let server = this.sqs.config.siteReportServerAddress;
            if(graphDataOption.endpoint == "postgrest") {
                const fetcher = new PostgRESTFetcher(server, graphDataOption.endpointConfig.table);
                fetcher.fetchSeriesData(graphDataOption.endpointConfig.xColumn, graphDataOption.endpointConfig.yColumn, this.selections[0], this.selections[1]).then(series => {
                    resolve(series);
                });
            }
        });
    }

    addTraceToGrah(data, traceName = "Trace", traceColor = "blue", builtIn = false) {
        if (this.verboseLogging) {
            console.log(`IOModule ${this.name} adding plot to graph.`);
        }
    
        if (this.timelineDomId) {
            // Transform the data into the format expected by Plotly
            let x, y;

            if(isArray(data)) {
                x = data.map((point) => point.x);
                y = data.map((point) => point.y);
            }
            else {
                x = data.x;
                y = data.y;
            }

            //if we are using BP, but displaying in AD/BC, we need to convert the x values
            if(this.selectedDatingSystem == "AD/BC") {
                x = x.map((value) => this.convertBPtoADBC(value) * -1);
            }

            const trace = {
                x: x,
                y: y,
                mode: 'lines',
                type: 'scatter',
                name: traceName, // Add a meaningful name for the trace
                marker: {
                    size: 5,
                    color: traceColor,
                    line: {
                        width: 0.5,
                        color: traceColor
                    }
                }
            };
    
            Plotly.addTraces(this.timelineDomId, [trace]).then(t => {
                const plotDiv = document.getElementById(this.timelineDomId);
                const newTraceIndex = plotDiv.data.length - 1;

                this.chartTraces.push({
                    id: newTraceIndex,
                    trace: trace,
                    builtIn: builtIn,
                });

                this.traceIdCounter++;

                // Add a new div for the trace with a delete button
                this.updateLegend();
                console.log(this.chartTraces);
            });
    
            
        } else {
            console.warn(`WARN: Timeline graph not initialized, cannot add plot to graph.`);
        }
    }

    updateLegend() {
        let graphDataOption = this.getSelectedGraphDataOption();
        $("#timeline-data-selector-container .trace-legend").css("background-color", graphDataOption.color);

        // Update the legend in the timeline graph based on this.chartTraces
        let importedTraces = this.chartTraces.filter(trace => !trace.builtIn);
        if(importedTraces.length > 0) {
            // Check if #timeline-data-selector-additions exists
            let dataSelectorContainer = $("#timeline-data-selector-additions");
            if (dataSelectorContainer.length === 0) {
                // If it doesn't exist, create it and append it to the DOM
                dataSelectorContainer = $(`<div id="timeline-data-selector-additions" class="timeline-data-selector-container">
                    <label>Imported</label>
                    <div id="timeline-data-selector-additions-list"></div>
                    </div>`);
                $("#timeline-data-selector-container", this.getDomRef()).append(dataSelectorContainer);
            }
        }
        else {
            // If it exists, remove it
            $("#timeline-data-selector-additions").remove();
            return;
        }

        const legendContainer = $("#timeline-data-selector-additions-list");
        legendContainer.empty(); // Clear existing legend items
        importedTraces.forEach((trace) => {
            const traceDiv = $(`
                <div class="timeline-trace-item">
                    <span class="trace-legend" style="background-color: ${trace.trace.marker.color};"></span>
                    <span class="trace-name">${trace.trace.name}</span>
                    <i class="fa fa-trash-o remove-plot" style="color: red; cursor: pointer; margin-left: 8px;" aria-hidden="true"></i>
                </div>
            `);
            // Add delete functionality

            traceDiv.find(".remove-plot").on("click", () => {
                this.deletePlotFromGraph(trace.id);
                // Remove the trace div from the DOM
                traceDiv.remove();
            });

            // Append the trace div to the container
            legendContainer.append(traceDiv);
        });
    }

    deletePlotFromGraph(traceId) {
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
    
            // Update the legend to reflect the changes
            this.updateLegend();
        }).catch((error) => {
            console.error(`Failed to delete trace with traceId: ${traceId}`, error);
        });
    }

    deletePlotFromGraphOLD(traceId) {
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
                id: trace.id // Keep the same ID
            }));

            this.updateLegend();
        });
    }

    renderGraph() {
        if(this.verboseLogging) {
            console.log(`IOModule ${this.name} rendering graph.`);
        }

        if(this.timelineDomId) {
            console.warn(`Timeline graph already initialized, skipping initialization.`);
            this.updateGraph();
            return;
        }

        const graphDataOption = this.getSelectedGraphDataOption();
        
        this.timelineDomId = "graph-"+nanoid(6);
        $(".timeline-graph", this.getDomRef()).attr("id", this.timelineDomId);

        const datingSystem = this.getSelectedDatingSystem();
        let range;
        if(datingSystem == "AD/BC") {
            range = [this.selections[1], this.selections[0]];
        }
        else {
            range = [this.selections[1]*-1, this.selections[0]*-1];
        }

        this.plotlyLayout = {
            xaxis: {
                range: range,
                showticklabels: true,
                tickformat: '~s'
            },
            yaxis: {
                showticklabels: false,
                zeroline: false
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

        this.updateGraph();

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
            let bpValues = this.convertSliderSelectionsToBP([parseInt(values[0]), parseInt(values[1])]);
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

    }

	getSelectedScale() {
		return this.scaleDefinitions.find((scale) => scale.id == this.selectedScale);
	}

    setSelectedScale(selectedScale, newDatingSystem = false, triggerUpdate = true) {
		console.log("Setting selected scale", selectedScale, newDatingSystem);

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

        if(this.currentValuesInitialized == false) {
            console.warn("Current values not initialized at setSelectedScale, setting to slider range");
            this.currentValues[0] = this.sliderMin;
            this.currentValues[1] = this.sliderMax;
        }

		this.setSelections(this.convertSliderSelectionsToBP(this.currentValues), triggerUpdate);

        console.log("Setting slider values to", this.currentValues);
        this.sliderUpdateCallback(this.currentValues);

        if(triggerUpdate) {
            // Trigger any updates or re-rendering needed for the slider
            this.sliderUpdateCallback(this.currentValues);

            this.fetchData();
            this.fetchGraphData();
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
        if(this.verboseLogging) {
            console.log("IOModule "+this.name+" slider update callback", values);
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

		//values[0] = this.sliderMin;
		//values[1] = this.sliderMax;
		
		this.currentValues = values;
        this.currentValuesInitialized = true;
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

    setSelections(selections, triggerUpdate = true) {
		
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