
class Router {
    constructor(hqs) {
        this.hqs = hqs;
    }

    route(path = null) {
        if(path == null) {
            path = window.location.pathname;
        }
        let pathComponents = path.split("/");
        switch(pathComponents[1]) {
            case "":
                this.hqs.layoutManager.setActiveView("filters");
            break;
            case "site":
                if(Number.isInteger(parseInt(pathComponents[2]))) {
                    this.hqs.layoutManager.setActiveView("siteReport");
                    let siteId = pathComponents[2];
                    this.hqs.siteReportManager.renderSiteReport(siteId);
                }
                else {
                    console.error("Invalid site requested!");
                    this.hqs.layoutManager.setActiveView("filters");
                    this.hqs.dialogManager.showPopOver("404 - Page not found!", "/"+pathComponents[1]);
                }
            break;
            case "viewstate":
                this.hqs.layoutManager.setActiveView("filters");
            break;
            default:
                console.log("404 - Page not found!");
                this.hqs.layoutManager.setActiveView("filters");
                this.hqs.dialogManager.showPopOver("404 - Page not found!", "/"+pathComponents[1]);
                break;
        }
    }
}

export { Router as default };