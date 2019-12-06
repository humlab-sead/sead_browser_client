import Config from '../config/config.js';

class PortalManager {

    constructor(hqs) {
        this.hqs = hqs;
        this.config = Config;
        this.activePortal = this.getPortal(Config.activePortal);

        /* PROBLEM: If this auto-shows when exiting desktop mode, it will also try to render itself in the site reports, which we dont want
        //FIXME: This event doesn't get caught because the layout manager inits before the portal manager and sends out the event before this has started listening
        this.hqs.hqsEventListen("layoutChange", (evt, mode) => {
            if(mode == "mobileMode") {
                $("#portal-menu").hide();
            }
            if(mode == "desktopMode") {
                $("#portal-menu").show();
            }
        });
        */

    }

    getPortal(portalName) {
        for(let key in this.config.portals) {
            if(this.config.portals[key].name == portalName) {
                return this.config.portals[key];
            }
        }
    }

    setActivePortal(portalName) {
        this.activePortal = this.getPortal(portalName);
        this.hqs.menuManager.createMenu(this.hqsMenu());
        $("#portal-menu .hqs-menu-title-subtext").css("background-color", this.activePortal.color);
        this.hqs.hqsEventDispatch("portalChanged", portalName);
    }

    /*
	* Function: hqsMenu
	*/
	hqsMenu() {

        var menu = {
            //title: "Portal<br /><span class='portalNameText'>Dendrochronology</span>",
            title: "Portal",
            subText: this.activePortal.title,
            layout: "vertical",
            collapsed: true,
            anchor: "#portal-menu",
            customStyleClasses: "hqs-menu-block-vertical-flexible",
            weight: 1,
            items: []
        };

        for(let key in this.config.portals) {
            let portal = config.portals[key];
            menu.items.push({
                name: portal.name,
                //title: "<i class=\"fa fa-tree\" aria-hidden=\"true\"></i> "+portal.title,
                title: portal.title,
                callback: () => {
                    this.setActivePortal(portal.name);
                }
            });
        }
        
        return menu;
    }

}

export { PortalManager as default }