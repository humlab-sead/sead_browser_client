import { 
	Chart, 
	CategoryScale, 
	LinearScale, 
	BarController, 
	BarElement,
	Legend,
	Tooltip
 } from "chart.js";

//site 2304

 class EcoCodeChart {
    constructor(siteReport, contentItem) {
		this.siteReport = siteReport;
		this.sqs = this.siteReport.sqs;
		this.contentItem = contentItem;
		this.chartId = null;
		Chart.register(CategoryScale);
		Chart.register(LinearScale);
		Chart.register(BarController);
		Chart.register(BarElement);
		Chart.register(Legend);
		Chart.register(Tooltip);
	}

    render(anchorSelector) {
        console.log("EcoCodeChart render");
    }

    unrender() {
        console.log("EcoCodeChart unrender");
    }
 }

export { EcoCodeChart as default }