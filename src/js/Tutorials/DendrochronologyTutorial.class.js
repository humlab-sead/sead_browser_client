import Shepherd from 'shepherd.js';

class DendrochronologyTutorial {
    constructor(sqs) {
        this.sqs = sqs;
        this.enabled = true;
        this.tutorial = 'Dendrochronology Tutorial';
        this.name = 'dendrochronology';
        this.tour = new Shepherd.Tour({
            useModalOverlay: true,
            defaultStepOptions: {
            }
        });
            
        this.initSteps();
    }

    initSteps() {
        this.stepCounter = 1;

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Dendrochronology in SEAD',
            text: `Welcome to SEAD! Or the Strategic Environmental Archeology Database. This is a brief tutorial to help you get started with exploring the dendrochronological data. Click on 'Next' to continue.`,
            classes: 'tutorial-container',
            buttons: [
            {
                text: 'Next',
                classes: 'yes-button',
                action: this.tour.next
            },
            {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
            }
            ]
        });

        //filter-menu-domain-area
        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Domains of data',
            text: `The SEAD system contains many types of data from archaeological excavations, buildings and palaeoecological investigations. This data is organised into domains, please click on the domain menu to select the dendrochronology domain.
            `,
            classes: 'tutorial-container',
            attachTo: { element: '#filter-menu-domain-area', on: 'right' },
            advanceOn: { selector: '#filter-menu-domain-area', event: 'click' },
            buttons: [
                {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Select the Dendrochronology domain',
            text: `
            Select dendrochronology to open the dendrochronological data.`,
            classes: 'tutorial-container',
            attachTo: { element: '#domains-menu-anchor-point [menu-item=dendrochronology]', on: 'right' },
            advanceOn: {
            event: 'domainChanged'
            },
            buttons: [
            {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
            }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Dendrochronology domain',
            text: `
            Here is the overview of the entire dendrochronological dataset in the SEAD database. In the map it is possible to zoom and manually select a site. 
            Some statistics of the entire dataset is also shown.
            `,
            classes: 'tutorial-container',
            attachTo: { element: '#result-section', on: 'left' },
            buttons: [
                {
                    text: 'Next',
                    classes: 'yes-button',
                    action: this.tour.next
                },
                {
                    text: 'Exit tour',
                    classes: 'no-button',
                    action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Filters',
            text: `By using site filters it is possible to filter the sites according to several criteria. Please click on the filter menu to open it.
            `,
            classes: 'tutorial-container',
            attachTo: { element: '#filter-menu-filter-area', on: 'right' },
            advanceOn: { selector: '#filter-menu-filter-area', event: 'click' },
            buttons: [
                {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Filters',
            text: `Select the Space/Time category.
            `,
            classes: 'tutorial-container',
            attachTo: { element: '#filters-menu-anchor-point [menu-item=space_time]', on: 'right' },
            advanceOn: { selector: '#filters-menu-anchor-point [menu-item=space_time]', event: 'click' },
            buttons: [
                {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Sites',
            text: `Select the Site filter to add it.
            `,
            classes: 'tutorial-container',
            attachTo: { element: '#filters-menu-anchor-point [menu-item=sites]', on: 'right' },
            advanceOn: { selector: '#filters-menu-anchor-point [menu-item=sites]', event: 'click' },
            buttons: [
                {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Select site',
            text: `Click on the site name '12709 Stenkumla' to filter out all other data and only show this site.
            `,
            classes: 'tutorial-container',
            beforeShowPromise: () => {
                return new Promise((resolve) => {
                    this.sqs.sqsEventListen("facetDataRendered", () => {
                        resolve();
                    });
                });
            },
            attachTo: { element: '#facet-section [facet-row-id="3827"]', on: 'right' },
            advanceOn: { selector: '.facet', event: 'click' },
            buttons: [
                {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Result section',
            text: `
            Go ahead and click on the site on the map, this will open a small popup with the site name, click on that as well and it will take you to the landing page for this site.
            `,
            classes: 'tutorial-container',
            attachTo: { element: '#tutorial-map-targeting-box-upper-left', on: 'bottom' },
            advanceOn: {
                event: 'viewChange'
            },
            buttons: [
                {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Landing pages',
            text: `You are now on the landing page. This page contains all the data associated with the site you clicked on. Here you can see the individual samples taken at the site, as well as the analyses performed on those samples.
            <br /><br />
            Let's briefly go over it in more detail.
            `,
            classes: 'tutorial-container',
            buttons: [
                {
                text: 'Next',
                classes: 'yes-button',
                action: this.tour.next
                },
                {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Samples',
            text: `This section shows the samples at this site. These samples are organised into sample groups, which is what you see in this table.
            Within dendrochronology, a sample group is usually a section of a building or an artefact.
            <br /><br />
            Clicking on a group expands it to show details of the individual samples. You can go ahead and do that now if you like.`,
            attachTo: { element: '#site-report-section-samples', on: 'right' },
            classes: 'tutorial-container',
            buttons: [
                {
                text: 'Next',
                classes: 'yes-button',
                action: this.tour.next
                },
                {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Analyses',
            text: `This section shows the analyses performed on the samples taken. Click on Dendrochronology to expand it.`,
            attachTo: { element: ' #site-report-section-analyses', on: 'right' },
            advanceOn: { selector: '#site-report-section-analyses .site-report-level-container', event: 'click' },
            classes: 'tutorial-container',
            buttons: [
                {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
                }
            ]
        });
       

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Analyses',
            text: `The two samples from our selected investigation is shown. It is also possible to select different viewing options and sortings under display options. If the site contains undated samples, these will only be shown under the spreadsheet view. Click on the bar for sample 12709 to see the sample information.`,
            attachTo: { element: '#site-report-section-analyses .site-report-level-container', on: 'right' },
            advanceOn: { selector: '.dendro-bar', event: 'click' },
            classes: 'tutorial-container',
            buttons: [
                {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Sample information',
            text: `Here is all the information regarding this sample. Click the X in the upper right corner to close the information window.`,
            attachTo: { element: '.dendro-chart-tooltip-container', on: 'right' },
            advanceOn: { selector: '.dendro-tooltip-close-button', event: 'click' },
            classes: 'tutorial-container',
            buttons: [
                {
                text: 'Exit tour',
                classes: 'no-button',
                action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Exporting data',
            text: `It is also possible to export the site data by clicking the export button. Click next to continue the tutorial.`,
            attachTo: { element: '#site-report-section-analyses .site-report-toolbar-export-btn', on: 'top' },
            advanceOn: { selector: '#site-report-section-analyses .site-report-toolbar-export-btn', event: 'click' },
            classes: 'tutorial-container',
            buttons: [
                {
                    text: 'Next',
                    classes: 'yes-button',
                    action: this.tour.next
                },
                {
                    text: 'Exit tour',
                    classes: 'no-button',
                    action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Returning to the filters',
            text: `By clicking the arrow you will return to the Dendro domain.`,
            attachTo: { element: '#site-report-exit-menu', on: 'right' },
            advanceOn: { selector: '#site-report-exit-menu', event: 'click' },
            beforeShowPromise: () => {
                //close any active popup dialogs, in case the user clicked the export button in the previous step
                return new Promise((resolve) => {
                    setTimeout(() => {
                        this.sqs.dialogManager.hidePopOver();
                        resolve();
                    }, 250);
                });
            },
            classes: 'tutorial-container',
            buttons: [
                {
                    text: 'Exit tour',
                    classes: 'no-button',
                    action: this.tour.complete,
                }
            ]
        });

        this.tour.addStep({
            id: this.stepCounter++,
            title: 'Conclusion',
            text: `Here you can experiment with other filters or search for a specific site by using the magnifying glass in the site filter found under Site filters -> Site. This concludes the tutorial.`,
            //attachTo: { element: '#site-report-exit-menu', on: 'right' },
            classes: 'tutorial-container',
            buttons: [
                {
                    text: 'Complete tour',
                    classes: 'no-button',
                    action: this.tour.complete,
                }
            ]
        });


        this.sqs.sqsEventListen('domainChanged', () => {
            //if we are on the domain step
            if(this.tour.isActive() && this.tour.getCurrentStep().id == 3) {
                this.tour.next();
            }
        });

        //listen to viewChange event
        this.sqs.sqsEventListen('viewChange', (event, data) => {
            if(data.viewName == 'siteReport' && this.tour.isActive() && typeof this.tour.getCurrentStep() != "undefined" && this.tour.getCurrentStep().id > 1) {
                this.tour.next();
            }
        });
        
    }

    destroy() {
        this.tour.complete();
        //unregister event listeners
        this.sqs.sqsEventUnlisten('domainChanged');
        this.sqs.sqsEventUnlisten('viewChange');
    }
}

export { DendrochronologyTutorial as default };