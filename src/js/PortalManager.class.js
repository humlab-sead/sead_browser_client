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

        /**NOTE:
        This is a temporary function for auto-creating the master dataset facet and selecting the appropriate dataset based on selected portal
        It should be removed when portals are properly implemented
        **/
        this.hqs.hqsEventListen("portalChanged", (evt, newPortalName) => {
            let newPortal = this.getPortal(newPortalName);
            $("#facet-menu .l2-title").css("border-left", "4px solid "+newPortal.color);
            
            if(newPortalName == "general") {
                let facet = this.hqs.facetManager.getFacetByName("dataset_master");
                if(facet) {
                    facet.destroy();
                }
            }

            if(newPortalName != "general") {
                let facet = this.hqs.facetManager.getFacetByName("dataset_master");
                if(facet === false) {
                    //Add master dataset facet and select the appropriate portal, and minimzie or hide it
                    let facetTemplate = this.hqs.facetManager.getFacetTemplateByFacetId("dataset_master");
                    facet = this.hqs.facetManager.makeNewFacet(facetTemplate);
                    this.hqs.facetManager.addFacet(facet);
                }

                if(newPortal.datasetId !== false) {
                    facet.setSelections([newPortal.datasetId], false);
                    facet.renderSelections();
                    let minimizeInterval = setInterval(() => {
                        if(facet.isDataLoaded) {
                            facet.minimize();
                            clearInterval(minimizeInterval);
                        }
                    }, 100);
                }
            }
        });

        /**If the master_dataset facet is deleted, this is equivalent to reverting to the general portal (mostly)
        - not totally because the filter list will still be filtered according to the portal, but that will leave the user in a weird mix of things, so let's not have that
        instead we just revert the user to the general portal**/
        this.hqs.hqsEventListen("seadFacetDeletion", (evt, arg) => {
            let facet = arg.facet;
            if(facet.name == "dataset_master") {
                this.setActivePortal("general");
            }
        })

    }

    getPortal(portalName) {
        for(let key in this.config.portals) {
            if(this.config.portals[key].name == portalName) {
                return this.config.portals[key];
            }
        }
    }

    getActivePortal() {
        return this.activePortal;
    }

    setActivePortal(portalName, updateUrl = true) {
        this.activePortal = this.getPortal(portalName);
        this.hqs.menuManager.createMenu(this.hqsMenu());
        $("#portal-menu .hqs-menu-title-subtext").css("background-color", this.activePortal.color);
        
        if(updateUrl) {
            let portalPath = "";
            if(portalName != "general") {
                portalPath = portalName;
            }
            
            window.history.pushState({ portal: portalName },
                "SEAD",
                "/"+portalPath);
        }
        this.hqs.hqsEventDispatch("portalChanged", portalName);
    }

    /*
	* Function: hqsMenu
	*/
	hqsMenu() {
        var menu = {
            title: "Portal",
            subText: this.activePortal.title,
            layout: "vertical",
            collapsed: true,
            anchor: "#portal-menu",
            customStyleClasses: "hqs-menu-block-vertical-flexible",
            weight: 1,
            staticSelection: true,
            items: []
        };

        let selectedPortal = this.getActivePortal();

        for(let key in this.config.portals) {
            let portal = config.portals[key];

            menu.items.push({
                name: portal.name,
                //title: "<i class=\"fa fa-tree\" aria-hidden=\"true\"></i> "+portal.title,
                title: portal.title,
                staticSelection: portal.name == selectedPortal.name,
                callback: () => {
                    this.setActivePortal(portal.name);
                }
            });
        }
        
        return menu;
    }

}

export { PortalManager as default }