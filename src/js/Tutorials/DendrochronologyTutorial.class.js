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
            title: 'Select the Dendrochronology domain',
            text: `
            The Dendrochronology domain contains data from ..., which can be used to ... Please click on it now.`,
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

        this.sqs.sqsEventListen('domainChanged', () => {
            //if we are on the domain step
            if(this.tour.isActive() && this.tour.getCurrentStep().id == 3) {
                this.tour.next();
            }
        });
    }

    destroy() {
        this.tour.complete();
        //unregister event listeners
        this.sqs.sqsEventUnlisten('domainChanged');
    }
}

export { DendrochronologyTutorial as default };