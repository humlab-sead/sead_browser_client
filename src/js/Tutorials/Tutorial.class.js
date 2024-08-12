import Shepherd from 'shepherd.js';
import GeneralTutorial from './GeneralTutorial.class';
import DendrochronologyTutorial from './DendrochronologyTutorial.class';
//import shepherd css
import 'shepherd.js/dist/css/shepherd.css';

class Tutorial {
    constructor(sqs) {
        this.sqs = sqs;
        this.tour = null;
        this.tourModules = [];
        this.setCookieOverride = false;

        this.tourModules.push({
          name: "general",
          module: new GeneralTutorial(this.sqs)
        });

        this.tourModules.push({
          name: "dendrochronology",
          module: new DendrochronologyTutorial(this.sqs)
        });
    }

    //are we currently running a tutorial?
    isRunning() {
        if(this.tour != null && this.tour.isActive()) {
            return true;
        }
        else {
            return false;
        }
    }

    setCookie() {
      if(!this.setCookieOverride) {
        //set a cookie to remember that this user has seen the tutorial
        var d = new Date();
        d.setTime(d.getTime() + (365*24*60*60*1000));
        var expires = "expires="+ d.toUTCString();
        document.cookie = "tutorial_status=dismiss; " + expires + "; path=/";
      }
    }

    userHasCookie() {
      var cookieConsent = document.cookie.indexOf('tutorial_status');
      if(cookieConsent == -1) {
          return false;
      }
      else {
          return true;
      }
    }

    init() {
      if(this.sqs.config.tutorialEnabled && this.sqs.layoutManager.getActiveView().name == "filters" && this.userHasCookie() == false) {
        if(this.sqs.requestUrl.split("/").length < 3) {
          $(".tutorial-dialog").show();

          $("#tutorial-select-form-container").html(this.getTutorialSelectForm());

          $(".tutorial-dialog .yes-button").on("click", () => {
            let selectedTour = $("#selected-tour").val();
            for(let key in this.tourModules) {
              if(this.tourModules[key].name == selectedTour) {
                this.tour = this.tourModules[key].module.tour;
              }
            }
            this.start();
          });
          $(".tutorial-dialog .no-button").on("click", () => {
            $(".tutorial-dialog").hide();
            this.sqs.dialogManager.hidePopOver();   
            this.setCookie();
          });
        }
      }
    }

    start() {
      this.setCookie();
      $(".tutorial-dialog").hide();
      this.sqs.dialogManager.hidePopOver();      
      this.tour.start();
    }

    getTutorialSelectForm() {
      let content = `
        <div class="tutorial-menu">
          <p>Please select a tutorial to begin.</p>
          <select id="selected-tour">`;

          for(let key in this.tourModules) {
            if(this.tourModules[key].module.enabled) {
              let name = this.tourModules[key].name;
              let title = this.tourModules[key].module.tutorial;
              content += `<option value="${name}">${title}</option>`;
            }
          }

          content += `
          </select>
        </div>
      `;

      return content;
    }

    bindTutorialSelectForm() {
      $(".tutorial-dialog .yes-button").on("click", () => {
        let selectedTour = $("#selected-tour").val();
        for(let key in this.tourModules) {
          if(this.tourModules[key].name == selectedTour) {
            this.tour = this.tourModules[key].module.tour;
          }
        }
        this.start();
      });
    }

    sqsMenu() {
      let menuItems = [];
      if(this.sqs.config.tutorialEnabled) {
        menuItems.push({
          name: "tutorial",
          title: `<i class="fa fa-question-circle" aria-hidden="true"></i> Tutorial`,
          callback: () => {
            if(this.sqs.facetManager.facets.length > 0) {
              if(!window.confirm("Starting the tutorial will reset the view and clear any filters you may have chosen. Do you still wish to do this?")) {
                return;
              }
            }

            $("#tutorial-question").hide();
            let content = "<div class='tutorial-dialog'>";
            content += this.getTutorialSelectForm();
            content += "<br />";
            content += "<button class='yes-button'>Start tour</button> <button class='no-button'>Cancel</button>";
            content += "</div>";
            this.sqs.reset();
            this.sqs.dialogManager.showPopOver("Tutorial", content);
            this.bindTutorialSelectForm();
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
