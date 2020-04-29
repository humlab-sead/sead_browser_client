import 'babel-polyfill';
import "../index.html";
import 'jquery-ui-bundle';
import 'notifyjs-browser';
import 'zingtouch';
import 'cookieconsent';
import '../../node_modules/cookieconsent/build/cookieconsent.min.js';
import '../../node_modules/cookieconsent/build/cookieconsent.min.css';
//import '../../node_modules/jquery.tabulator/dist/css/tabulator.min.css'; //new name: tabulator-tables
import 'jquery-ui/themes/base/base.css';
import '../stylesheets/sqsLayoutManager.scss';
import '../stylesheets/sqsMenu.scss';
import '../stylesheets/style.scss';
import '../../flexnav/css/flexnav.css';
import '../../flexnav/js/jquery.flexnav.js';
import '../../node_modules/font-awesome/css/font-awesome.css';
import '../../node_modules/normalize.css/normalize.css';
import SeadQuerySystem from './SeadQuerySystem.class.js';
import Config from '../config/config.js';
import "../assets/icons/favicon.ico";
import "../assets/icons/site.webmanifest";

"use strict";

//Set some globals
window.$ = $;
window.jQuery = jQuery;
window.sqs = null;
window.config = Config;

//When document ready...
$(document).ready(() => {
    window.sqs = new SeadQuerySystem();
    window.sqs.init();
});

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


