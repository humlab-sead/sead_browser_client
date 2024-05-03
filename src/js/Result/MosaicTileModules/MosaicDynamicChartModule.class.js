import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDynamicChartModule extends MosaicTileModule {
    constructor(sqs) {
        super();
        this.sqs = sqs;
        this.title = "Generate chart";
		this.name = "mosaic-dynamic-chart";
        this.requestId = 0;
		this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
        this.pendingRequestPromise = null;
        this.active = true;
        this.data = null;
        this.renderIntoNode = null;
        this.plot = null;
        this.renderComplete = false;
        this.chartType = "plotly";
        this.chartFormId = "sqs-form-chart-"+nanoid();
    }

    async render(renderIntoNode = null) {
        this.renderComplete = false;
        if(renderIntoNode) {
            this.renderIntoNode = renderIntoNode;
        }
        if(renderIntoNode == null && this.renderIntoNode == null) {
            console.warn("Tried to render "+this.name+" without a node to render into!");
            return false;
        }
        this.active = true;
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");
        //this.sqs.setLoadingIndicator(this.renderIntoNode, true);

        this.renderPieChart();
        //this.renderChartFormInterface(this.renderIntoNode);
        
        //this.sqs.setLoadingIndicator(this.renderIntoNode, false);
        /*
        resultMosaic.renderPieChartPlotly(this.renderIntoNode, chartData, { showlegend: false }).then(plot => {
            this.plot = plot;
        })
        */
        this.renderComplete = true;
    }

    renderChartFormInterface(renderIntoNode) {
        //create a html form with dropdown inputs for x-axis, y-axis and type of chart
        let form = document.createElement("form");
        form.id = "sqs-form-chart-"+nanoid();

        const chartOptions = [
            "Tree species", 
            "Tree rings",
            "Bark (B)",
            "EW/LW measurements",
            "Not dated",
            "Pith (P)",
            "Waney edge (W)"
        ];
        let chartOptionsHtml = "";
        chartOptions.forEach((option) => {
            chartOptionsHtml += `<option value="${option}">${option}</option>`;
        });

        $(form).addClass("mosaic-dynamic-chart-form");
        let out = `
            <div>
                <div class="dropdown-group">
                    <label for="chart-type">Chart type</label>
                    <select id="chart-type" name="chart-type">
                        <option value="bar">Bar</option>
                        <option value="donut" selected>Donut</option>
                    </select>
                </div>

                <hr class="thin-divider-line">
                
                <div id="bar-chart-options" class="mosaic-dynamic-chart-options-container">
                    <div class="dropdown-group">
                        <label for="x-axis">X-axis</label>
                        <select id="x-axis" name="x-axis">
                            <option value="dataset_count">Time</option>
                        </select>
                    </div>

                    <div class="dropdown-group">
                        <label for="y-axis">Y-axis</label>
                        <select id="y-axis" name="y-axis">
                            <option value="dataset_count">Dataset count</option>
                            <option value="method_name">Wayney edges</option>
                            <option value="method_abbrev_or_alt_name" selected>Trees</option>
                        </select>
                    </div>
                </div>
                

                <div id="pie-chart-options" class="mosaic-dynamic-chart-options-container">
                    <div class="dropdown-group">
                        <label for="variable">Metric</label>
                        <select id="variable" name="variable">

                            ${chartOptionsHtml}

                            <!--
                            <option value="analysis_methods">Analysis methods</option>    
                            <option value="dataset_count">Dataset count</option>
                            <option value="dataset_type">Dataset type</option>
                            -->
                        </select>
                    </div>
                    
                    <div class="dropdown-group">
                        <label for="group-by">Group by</label>
                        <select id="group-by" name="group-by">
                            <option value="time">Time</option>
                            <option value="dataset_count">Dataset count</option>
                        </select>
                    </div>
                </div>


                <button id="mosaic-dynamic-chart-form-submit" type="submit">Generate chart</button>
            </div>
        `;

        form.innerHTML = out;

        $(renderIntoNode).html(form);

        $("#chart-type").on("change", (evt) => {
            if(evt.target.value == "bar") {
                $("#bar-chart-options").show();
                $("#pie-chart-options").hide();
            }
            if(evt.target.value == "donut") {
                $("#bar-chart-options").hide();
                $("#pie-chart-options").show();
            }
        });

        $("#chart-type").trigger("change");

        $("#mosaic-dynamic-chart-form-submit").on("click", (evt) => {
            this.renderPieChart();
        });
    }

    renderPieChart() {
        let variable = $("#pie-chart-options", "#"+this.chartFormId).find("#variable").val() ? $("#pie-chart-options").find("#variable").val() : "Tree species";
        
        let resultMosaic = this.sqs.resultManager.getModule("mosaic");

        let requestBody = {
            sites: resultMosaic.sites,
            requestId: ++this.requestId,
            variable: variable
        };

        requestBody = JSON.stringify(requestBody);

        //set loading indicator
        this.sqs.setLoadingIndicator(this.renderIntoNode, true);

        $.ajax({
            method: "POST",
            url: this.sqs.config.dataServerAddress+"/dendro/dynamicchart",
            dataType: "json",
            headers: {
                "Content-Type": "application/json"
            },
            data: requestBody,
            success: (data) => {

                this.data = data.categories;

                if(data.categories.length == 0) {
                    //set no data msg
                    this.sqs.setNoDataMsg(this.renderIntoNode, true);
                    return false;
                }

                let chartData = [{
                    labels: [],
                    values: [],
                    customdata: [],
                    marker: {
                        colors: this.sqs.color.getColorScheme(data.categories.length)
                    },
                    type: 'pie',
                    hole: 0.4,
                    name: "Dynamic chart",
                    hoverinfo: 'label+percent',
                    textinfo: 'label+percent',
                    textposition: "inside",
                    //hovertemplate: "%{percent} of datasets are %{customdata}<extra></extra>"
                }];
        
                data.categories.sort((a, b) => {
                    if(a.count > b.count) {
                        return -1;
                    }
                    else {
                        return 1;
                    }
                });
        
                data.categories.forEach(category => {
                    chartData[0].labels.push(category.name);
                    chartData[0].values.push(category.count);
                    //chartData[0].customdata.push(method.method_name);
                });

                let resultMosaic = this.sqs.resultManager.getModule("mosaic");
                resultMosaic.renderPieChartPlotly(this.renderIntoNode, chartData).then(plot => {
                    this.plot = plot;
                })

                if($("#"+this.chartFormId).length == 0) {
                    let form = document.createElement("form");
                    form.id = this.chartFormId;

                    const chartOptions = [
                        "Tree species",
                        "Bark (B)",
                        "Not dated",
                        "Waney edge (W)"
                    ];
                    let chartOptionsHtml = "";
                    chartOptions.forEach((option) => {
                        let selected = "";
                        if(variable == option) {
                            selected = "selected";
                        }
                        chartOptionsHtml += `<option ${selected} value="${option}">${option}</option>`;
                    });

                    $(form).addClass("mosaic-dynamic-chart-form");
                    let out = `
                        <div id="pie-chart-options" class="mosaic-dynamic-chart-options-container">
                            <div class="dropdown-group">
                                <label for="variable">Metric</label>
                                <select id="variable" name="variable">
                                    ${chartOptionsHtml}
                                </select>
                            </div>
                        </div>
                    `;

                    /*
                    out += `
                    <div id="bar-chart-options">
                            <div class="dropdown-group">
                                <label for="x-axis">X-axis</label>
                                <select id="x-axis" name="x-axis">
                                    <option value="Felling year">Felling year</option>
                                </select>
                            </div>

                            <div class="dropdown-group">
                                <label for="y-axis">Y-axis</label>
                                <select id="y-axis" name="y-axis">
                                    <option value="dataset_count">Number of datings</option>
                                </select>
                            </div>
                        </div>
                    `;
                    */

                    form.innerHTML = out;

                    $(this.renderIntoNode).append(form);

                    $("#pie-chart-options").on("change", (evt) => {
                        this.renderPieChart();
                    });
                }
            },
            error: (err) => {
                console.error("Error fetching chart data: ", err);
            }
        });
    }


    getPieChartFormOptions() {
        /*
        possibilities:
        * analysis methods grouped by dataset count
        * dataset count grouped by time
        * analysis methods grouped by time
        * dataset type grouped by dataset count 
        * dataset type grouped by time 
        */

        let out = `
        
        `;
        return out;
    }

    async update() {
        this.render();
    }

    async fetch() {
        
    }

    getAvailableExportFormats() {
        return ["json", "csv", "png"];
    }

    formatDataForExport(data, format = "json") {
        if(format == "csv") {

            let includeColumns = [];
            if(data.length > 0) {
                includeColumns = Object.keys(data[0]);
            }

            //includeColumns = ["description","method_abbrev_or_alt_name","method_name","dataset_count"];

            //remove columns that we don't want to include
            data = data.map((item) => {
                let newItem = {};
                includeColumns.forEach((column) => {
                    newItem[column] = item[column];
                });
                return newItem;
            });
        }
        if(format == "png") {
            let resultMosaic = this.sqs.resultManager.getModule("mosaic");
            resultMosaic.exportPieChartPlotly(this.renderIntoNode, this.plot);
        }

        return data;
    }
}

export default MosaicDynamicChartModule;