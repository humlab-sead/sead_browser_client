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

    start() {
      $(".tutorial-dialog").hide();
      this.sqs.dialogManager.hidePopOver();
      $("body").addClass("tutorial-active");
      this.tour.on("complete", () => {
        $("body").removeClass("tutorial-active");
      });
      this.tour.on("cancel", () => {
        $("body").removeClass("tutorial-active");
      });

      Promise.resolve(this.sqs.reset({
        resultModule: "map",
      })).then(() => {
        this.tour.start();
      });
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
          visibleInModes: ["desktopMode"],
          callback: () => {
            if(this.sqs.facetManager.facets.length > 0) {
              if(!window.confirm("Starting the tutorial will reset the view and clear any filters you may have chosen. Do you still wish to do this?")) {
                return;
              }
            }

            let content = "<div class='tutorial-dialog'>";
            content += this.getTutorialSelectForm();
            content += "<br />";
            content += "<button class='yes-button'>Start tour</button> <button class='no-button'>Cancel</button>";
            content += "</div>";
            this.sqs.reset({
              resultModule: "map",
            });

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
