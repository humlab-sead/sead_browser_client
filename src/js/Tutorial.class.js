import Shepherd from 'shepherd.js';
//import shepherd css
import 'shepherd.js/dist/css/shepherd.css';

class Tutorial {
    constructor(sqs) {
        this.sqs = sqs;
        this.tour = null;
    }

    init() {
      this.tour = new Shepherd.Tour({
        useModalOverlay: true,
        defaultStepOptions: {
          //classes: 'shepherd-theme-arrows'
        }
      });

      $("#tutorial-question .no-button").on("click", () => {
        $("#tutorial-question").hide();
      });

      $("#tutorial-question .yes-button").on("click", () => {
        this.sqs.reset();
        this.tour.start();
        $("#tutorial-question").hide();
      });

      this.stepCounter = 1;

      this.tour.addStep({
          id: this.stepCounter++,
          title: 'Overview',
          text: `The SEAD system contains many types of data from archeological excavations and investigations.
          The data is organized into different domains, which can be selected via this menu.
          <br /><br />
          Selecting a domain narrows down the available filters to those relevant to the selected domain.
          It also filters the results to only show those that are relevant.
          Let's keep it on the "General" domain for now, which shows all filters and all data in the system.
          `,
          classes: 'tutorial-container',
          attachTo: { element: '#filter-menu-domain-area', on: 'right' },
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
          title: 'Domains',
          text: `Each domain has its own set of filters associated with it, which can be selected via this menu. Filters are used to narrow down the amount of sites shown in the result section.
	  <br /><br />
          Click on the Filters menu to open it and continue the tour.
          `,
          classes: 'tutorial-container',
          attachTo: { element: '#filter-menu-container', on: 'right' },
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
          text: `Select the Site filter.
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
          text: `Click on the site 'Abercynafon'.
          `,
          classes: 'tutorial-container',
          beforeShowPromise: () => {
              return new Promise((resolve) => {
                  this.sqs.sqsEventListen("facetDataRendered", () => {
                    resolve();
                  });
              });
          },
          attachTo: { element: '#facet-section .facet:first-of-type .tutorial-target', on: 'right' },
          advanceOn: { selector: '#facet-section .facet:first-of-type .tutorial-target', event: 'click' },
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
          text: `This is the result section. Here you will see all the archeological sites that contains data matching your selected filters. Currently we are only seeing the site we selected in the filter.
          <br /><br />
          Go ahead and click on the site on the map, this will take you to the landing page for this site.
          `,
          classes: 'tutorial-container',
          attachTo: { element: '#result-section', on: 'left' },
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
          text: `You are now on the site report page. This page contains all the data associated with the site you clicked on.
          Here you can see the individual samples taken at the site, as well as the analyses performed on those samples.
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
          text: `This section shows general site information, such as location, description and data source references.`,
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
          text: `This section shows the samples taken. These can be soil samples, wood samples, ceramic shards, or other types of samples.
          The samples are divided into sample groups, which is what you see in this table. Clicking on a group expands it to show the individual samples.
          You can go ahead and do that now if you like.
          How the context of a group is defined is up to the archeologist who entered the data.`,
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
          This site only has one analysis associated with it. 
          <br /><br />
          Go ahead and click on it to expand it.`,
          attachTo: { element: '#site-report-section-analyses', on: 'right' },
          classes: 'tutorial-container',
          advanceOn: { selector: '#site-report-section-3 > h3.site-report-level-title', event: 'click' },
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
        text: `Here you can see the results of the analysis, in this case an abundance count of fossilized insects, displayed as number of individuals per sample.
        This data is then used to perform an environment reconstruction.`,
        attachTo: { element: '#cic-34772', on: 'right' },
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
        text: `This is the climate reconstruction. It shows the most prevalent environment types at the site, based on the abundance count of fossilized insects.`,
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
        text: `This concludes the tutorial. Please see our non-existant manual for further help, or send an email into the void of cyberspace because we don't have any support address. Good luck!`,
        classes: 'tutorial-container',
        buttons: [
          {
            text: 'Done',
            classes: 'yes-button',
            action: this.tour.complete
          }
        ]
      });

      //listen to viewChange event
      this.sqs.sqsEventListen('viewChange', (event, data) => {
        if(data.viewName == 'siteReport' && this.tour.isActive() && typeof this.tour.getCurrentStep() != "undefined" && this.tour.getCurrentStep().id > 1) {
            this.tour.next();
        }
      });

      if(this.sqs.config.tutorialEnabled && this.sqs.layoutManager.getActiveView().name == "filters" && this.userHasCookie() == false) {
        if(this.sqs.requestUrl.split("/").length < 3) {
          $("#tutorial-question").show();
        }
      }
    }

    userHasCookie() {
        //use the cookie-consent cookie to see if this user has visited us before
        var cookieConsent = document.cookie.indexOf('cookieconsent_status');

        if(cookieConsent == -1) {
            return false;
        }
        else {
            return true;
        }
    }

    start() {
        this.tour.start();
    }

    sqsMenu() {
      let menuItems = [];
      if(this.sqs.config.tutorialEnabled) {
        menuItems.push({
          name: "tutorial",
          title: `<i class="fa fa-question-circle" aria-hidden="true"></i> Tutorial`,
          callback: () => {
            if(this.sqs.facetManager.facets.length > 0) {
              if(window.confirm("Starting the tutorial will reset the view and clear any filters you may have chosen. Do you still wish to do this?")) {
                this.sqs.reset();
                this.tour.start();
              }
            }
            else {
              this.sqs.reset();
              this.tour.start();
            }
          }
        });
      }

      return {
        title: "Tutorial",
        layout: "vertical",
        collapsed: true,
        anchor: "#tutorial-menu",
        triggers: [],
        weight: -1,
        items: menuItems
      };
    }
}
export { Tutorial as default }
