import 'babel-polyfill';
import config from '../config/config.json';
import html from "../index.html";
import 'jquery-ui-bundle';
import 'notifyjs-browser';
import 'zingtouch';
import 'cookieconsent';
import '../../node_modules/cookieconsent/build/cookieconsent.min.js';
import '../../node_modules/cookieconsent/build/cookieconsent.min.css';
import 'jquery-ui/themes/base/base.css';
import '../stylesheets/SqsLayoutManager.scss';
import '../stylesheets/SqsMenu.scss';
import '../stylesheets/style.scss';
import '../../flexnav/css/flexnav.css';
import '../../flexnav/js/jquery.flexnav.js';
import 'font-awesome/css/font-awesome.css';
import '../../node_modules/normalize.css/normalize.css';
import SeadQuerySystem from './SeadQuerySystem.class.js';
import "../assets/icons/favicon.ico";
import "../assets/icons/android-chrome-192x192.png";
import "../site.webmanifest";

import "../assets/SEAD-logo-with-subtext.png";

"use strict";

window.Config = config;
window.config = config;

$(function() {
    window.sqs = new SeadQuerySystem();
    window.sqs.init();
})
/*
$(document).ready(() => {
    window.sqs = new SeadQuerySystem();
    window.sqs.init();
});
*/

/*
fetch('/config.json')
    .then(response => {
        if(response.ok === false) {
            alert('Could not load configuration!');
            return false;
        }
        return response.json();
    })
    .then((Config) => {
    //Set some globals
    window.Config = Config;
    window.$ = $;
    window.jQuery = jQuery;
    window.sqs = null;
    window.config = Config;

    //When document ready...
    $(document).ready(() => {
        window.sqs = new SeadQuerySystem();
        window.sqs.init();
    });
});
*/




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


