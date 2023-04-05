
class Router {
    constructor(sqs) {
        this.sqs = sqs;

        this.sqs.sqsEventListen("siteReportClosed", () => {
            let domain = this.sqs.domainManager.getActiveDomain();
            if(domain.name != "general") {
                history.pushState({}, "", "/"+domain.name);
            }
            else {
                history.pushState({}, "", "/");
            }
        });
    }

    route(path = null) {
        if(path == null) {
            path = window.location.pathname;
        }
        let pathComponents = path.split("/");
        switch(pathComponents[1]) {
            case "":
                this.sqs.layoutManager.setActiveView("filters");
            break;
            case "site":
                if(Number.isInteger(parseInt(pathComponents[2]))) {
                    this.sqs.layoutManager.setActiveView("siteReport");
                    let siteId = pathComponents[2];
                    this.sqs.siteReportManager.renderSiteReport(siteId);
                }
                else {
                    console.error("Invalid site requested!");
                    this.sqs.layoutManager.setActiveView("filters");
                    this.sqs.dialogManager.showPopOver("404 - Page not found!", "/"+pathComponents[1]);
                }
            break;
            case "viewstate":
                this.sqs.layoutManager.setActiveView("filters");
            break;
            case "species":
                let taxonId = pathComponents[2];
                this.sqs.taxaModule.renderTaxon(taxonId);
            break;
            default:
                if(this.domainExists(pathComponents[1])) {
                    this.sqs.layoutManager.setActiveView("filters");
                    this.sqs.domainManager.setActiveDomain(pathComponents[1]);
                }
                else {
                    console.log("404 - Page not found!");
                    this.sqs.layoutManager.setActiveView("filters");
                    this.sqs.dialogManager.showPopOver("404 - Page not found!", "/"+pathComponents[1]);
                }
                break;
        }
    }

    domainExists(domainName) {
        for(let key in this.sqs.config.domains) {
            if(this.sqs.config.domains[key].name == domainName) {
                return true;
            }
        }
        return false;
    }
}

export { Router as default };