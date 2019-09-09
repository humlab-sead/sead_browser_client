import 'babel-polyfill';
import "../index.html";
import 'jquery-ui-bundle';
import 'notifyjs-browser';
import 'bootstrap';
import 'zingtouch';
import 'cookieconsent';
import '../../node_modules/cookieconsent/build/cookieconsent.min.js';
import '../../node_modules/cookieconsent/build/cookieconsent.min.css';
import '../../node_modules/jquery.tabulator/dist/css/tabulator.min.css';
import 'jquery-ui/themes/base/base.css';
import '../stylesheets/HqsLayoutManager.css';
import '../stylesheets/HqsMenu.scss';
import '../stylesheets/style.scss';
import '../../flexnav/css/flexnav.css';
import '../../flexnav/js/jquery.flexnav.js';
import '../../node_modules/font-awesome/css/font-awesome.css';
import '../../node_modules/normalize.css/normalize.css';
import '../../node_modules/openlayers/dist/ol.css';
import HumlabQuerySystem from './HumlabQuerySystem.class.js';
import Config from '../config/config.js';
import "../assets/icons/favicon.ico";
import "../assets/icons/site.webmanifest";

//Set some globals
window.$ = $;
window.jQuery = jQuery;
window.hqs = null;
window.config = Config;

//When document ready...
$(document).ready(() => {
    window.hqs = new HumlabQuerySystem({
        portal: "dendro"
    });
    window.hqs.init();
    //window.hqs.resultManager.setActiveModule(Config.defaultResultModule, false);
    //debugScript();
	debugSize();
});

function debugScript() {
    $(".add-facet-btn").each(function() {
        if($(this).attr("name") == "geochronology" || $(this).attr("name") == "site") {
            $(this).trigger("click");
        }
    });
}

function debugSize() {
	$.each( $('*'), function() {
        if( $(this).width() > $('body').width()) {
            console.log("Wide Element: ", $(this), "Width: "+$(this).width()+" / "+$('body').width());
        }
    });

    $.each( $('*'), function() {
        if( $(this).height() > $(window).height()) {
            console.log("High Element: ", $(this), "Height: ", $(this).height());
        }
    });
}


