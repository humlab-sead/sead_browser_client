
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

            if(this.sqs.seoManager) {
                this.sqs.seoManager.setDomainMeta(domain);
            }
        });
    }

    route(path = null) {
        if(path == null) {
            path = window.location.pathname;
        }
        let pathComponents = path.split("/");
        this.sqs.requestUrl = path;
        switch(pathComponents[1]) {
            case "":
                this.sqs.layoutManager.setActiveView("filters");
                this.sqs.domainManager.setActiveDomain("general", false);
                if(this.sqs.seoManager) {
                    this.sqs.seoManager.setDefaultRouteMeta("/");
                }
            break;
            case "site":
                if(Number.isInteger(parseInt(pathComponents[2]))) {
                    this.sqs.layoutManager.setActiveView("siteReport");
                    let siteId = pathComponents[2];
                    this.sqs.siteReportManager.renderSiteReport(siteId, false);
                    if(this.sqs.seoManager) {
                        this.sqs.seoManager.setSiteMeta(siteId);
                    }
                }
                else {
                    console.error("Invalid site requested!");
                    this.sqs.layoutManager.setActiveView("filters");
                    this.sqs.dialogManager.showPopOver("404 - Page not found!", "/"+pathComponents[1]);
                    if(this.sqs.seoManager) {
                        this.sqs.seoManager.setNotFoundMeta(path);
                    }
                }
            break;
            case "viewstate":
                this.sqs.layoutManager.setActiveView("filters");
                if(this.sqs.seoManager) {
                    this.sqs.seoManager.setViewstateMeta(pathComponents[2]);
                }
            break;
            case "species":
            case "taxon":
                this.sqs.layoutManager.setActiveView("filters");
                this.sqs.taxaModule.renderTaxon(pathComponents[2]);
                if(this.sqs.seoManager) {
                    this.sqs.seoManager.setTaxonMeta(pathComponents[2]);
                }
            break;
            default:
                if(this.domainExists(pathComponents[1])) {
                    this.sqs.layoutManager.setActiveView("filters");
                    this.sqs.domainManager.setActiveDomain(pathComponents[1], false);
                    if(this.sqs.seoManager) {
                        this.sqs.seoManager.setDomainMeta(this.sqs.domainManager.getActiveDomain());
                    }
                }
                else {
                    console.log("404 - Page not found!");
                    this.sqs.layoutManager.setActiveView("filters");
                    this.sqs.dialogManager.showPopOver("404 - Page not found!", "/"+pathComponents[1]);
                    if(this.sqs.seoManager) {
                        this.sqs.seoManager.setNotFoundMeta(path);
                    }
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
