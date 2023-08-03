import 'babel-polyfill';
import config from '../config/config.json';
import html from "../index.ejs";
import 'notifyjs-browser';
import 'zingtouch';
import 'cookieconsent';
import '../../node_modules/cookieconsent/build/cookieconsent.min.js';
import '../../node_modules/cookieconsent/build/cookieconsent.min.css';
import '../stylesheets/SqsLayoutManager.scss';
import '../stylesheets/SqsMenu.scss';
import '../stylesheets/style.scss';
//import '../../flexnav/css/flexnav.css';
//import '../../flexnav/js/jquery.flexnav.js';
import 'font-awesome/css/font-awesome.css';
import '../../node_modules/normalize.css/normalize.css';
import SeadQuerySystem from './SeadQuerySystem.class.js';
import "../assets/icons/favicon.ico";
import "../assets/icons/android-chrome-192x192.png";
//import "../site.webmanifest";
import "../../node_modules/jquery-ui-dist/jquery-ui.min.css"
import "../../node_modules/jquery-ui-dist/jquery-ui.min.js"

import "../assets/SEAD-logo-with-subtext.png";
import "../assets/filter-menu.svg";

import "../assets/logo-loading-indicator.webp";
import "../assets/su_logo.jpg";
import "../assets/riksbanken-logo.png";
import "../assets/umu-logo-en.png";
import "../assets/mal-logo.png";
import "../assets/lu-logo.png";

"use strict";

window.Config = config;
window.config = config;


$(function() {
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


