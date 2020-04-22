
class Router {
    constructor(hqs) {
        this.hqs = hqs;

        this.hqs.hqsEventListen("siteReportClosed", () => {
            let portal = this.hqs.portalManager.getActivePortal();
            if(portal.name != "general") {
                history.pushState({}, "", "/"+portal.name);
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
                if(this.portalExists(pathComponents[1])) {
                    this.hqs.layoutManager.setActiveView("filters");
                    this.hqs.portalManager.setActivePortal(pathComponents[1]);
                }
                else {
                    console.log("404 - Page not found!");
                    this.hqs.layoutManager.setActiveView("filters");
                    this.hqs.dialogManager.showPopOver("404 - Page not found!", "/"+pathComponents[1]);
                }
                break;
        }
    }

    portalExists(portalName) {
        for(let key in this.hqs.config.portals) {
            if(this.hqs.config.portals[key].name == portalName) {
                return true;
            }
        }
        return false;
    }
}

export { Router as default };