import Shepherd from 'shepherd.js';

class GeneralTutorial {
    constructor(sqs) {
        this.sqs = sqs;
        this.enabled = true;
        this.tutorial = 'General Tutorial';
        this.name = "general";
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
            title: 'Tutorial',
            text: `Welcome to SEAD! Or the Strategic Environmental Archeology Database. This is a brief tutorial to help you get started. Click on 'Next' to continue.`,
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
            title: 'Domains of data',
            text: `The SEAD system contains many types of data from archeological excavations and palaeoecological investigations. The data are organized into different 'domains', which can be selected via this menu.
            <br /><br />
            Selecting a domain narrows the available data and filters to those most relevant to a research field. The "General" domain shows all filters and all data in the system.
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
            title: 'Select the Paleoentomology domain',
            text: `
            The Paleoentomology domain contains data from fossilized insects, which can be used to perform reconstructions of past environments. Please click on it now.`,
            classes: 'tutorial-container',
            attachTo: { element: '#domains-menu-anchor-point [menu-item=palaeoentomology]', on: 'right' },
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
            title: 'Filters',
            text: `Filters limit the sites shown in the result section.
                <br /><br />
            Click on the Filters menu to open it and continue the tour.
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
            text: `Click on the site name 'Abercynafon' to filter out all other data and only show this site.
            `,
            classes: 'tutorial-container',
            beforeShowPromise: () => {
                return new Promise((resolve) => {
                    this.sqs.sqsEventListen("facetDataRendered", () => {
                        resolve();
                    });
                });
            },
            attachTo: { element: '#facet-section [facet-row-id="4814"]', on: 'right' },
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
            text: `This is the results section. Altering the filters will update what you see here, which is a summary of the data currently selected.
            <br /><br />
            Here you will see all the sites that contains data matching your selected filters. Currently we are only seeing the site we selected in the site filter since we have filtered everything else out.
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
            title: 'Result section',
            text: `
            Go ahead and click on the site on the map, this will open a small popup with the site name, click on that as well and it will take you to the landing page for this site.
            `,
            classes: 'tutorial-container',
            attachTo: { element: '#tutorial-map-targeting-box', on: 'bottom' },
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
            title: 'Site reports',
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
            title: 'Site information',
            text: `This section shows general site information and metadata, such as location, description and data source references.`,
            attachTo: { element: '#site-report-right-container', on: 'right' },
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
            text: `This section shows the samples at this site. These can be of various types, such as soil samples, wood samples and ceramic shards. These samples are organised into sample groups, which is what you see in this table.
            <br /><br />
            Clicking on a group expands it to show details of the individual samples. You can go ahead and do that now if you like. How the context of a group is defined is up to the scientist who entered the data.`,
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
            text: `This section shows the various analyses performed on the samples. Clicking on an analysis will show you the results.
            Sometimes several ways of viewing the results are available.
            `,
            attachTo: { element: '#site-report-section-analyses', on: 'right' },
            beforeShowPromise: () => {
                return new Promise((resolve) => {
                //poll for the existance of #site-report-section-analyses
                let interval = setInterval(() => {
                    if($("#site-report-section-analyses").length > 0) {
                    clearInterval(interval);
                    resolve();
                    }
                }, 100);
                });
            },
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
            text: `
            Go ahead and click on the Palaeoentomology analysis to expand it.`,
            attachTo: { element: '#site-report-section-1--3 > h3.site-report-level-title', on: 'right' },
            classes: 'tutorial-container',
            advanceOn: { selector: '#site-report-section-1--3 > h3.site-report-level-title', event: 'click' },
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
            text: `Here you can see the results of the analysis, in this case an abundance count of fossilized insects, displayed as number of individuals per taxon in each sample. These data can then be used to perform an environmental reconstruction.`,
            attachTo: { element: '#cic-89323', on: 'right' },
            classes: 'tutorial-container',
            scrollTo: true,
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
            text: `This is the environmental reconstruction. It shows the most prevalent environment types at the site, based on the abundance of fossilized insects.
            <br /><br />
            Below this you can see a detailed reconstruction of the environments represented by each sample.`,
            attachTo: { element: '#site-report-section-analyses .content-item-container:nth-of-type(2)', on: 'right' },
            classes: 'tutorial-container',
            scrollTo: true,
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
            title: 'Back to filters',
            text: `There are many other types of datasets and analyses, but we can't cover everything here. Now let's go back to the filters and result section. Click on the 'Back' button in the top left corner.`,
            attachTo: { element: '#site-report-exit-menu', on: 'right' },
            advanceOn: { selector: '#site-report-exit-menu', event: 'click' },
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
            title: "That's all!",
            text: `This concludes the tutorial. You can always restart it by clicking on the 'Tutorial' option in the auxiliary menu.`,
            classes: 'tutorial-container',
            buttons: [
            {
                text: 'Done',
                classes: 'yes-button',
                action: this.tour.complete
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
        this.sqs.sqsEventUnlisten('viewChange');
        this.sqs.sqsEventUnlisten('domainChanged');
    }
}

export { GeneralTutorial as default }