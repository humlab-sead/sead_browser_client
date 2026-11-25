import Config from '../config/config.json';

/*
Class: CookieConsent
The cookie notice (Config.legalNoticeMsg). Until it has been agreed to, a banner in the bottom right
corner asks for it; it can always be read again under Cookies in the main menu (DialogManager).

The banner keeps out of the way of dialogs, so the privacy policy it links to can be read before
agreeing to anything - and the privacy policy itself can be agreed from, while that's still to do.

Agreeing is kept in the cookie the cookieconsent package kept it in before this replaced it, so
that those who agreed there aren't asked again.
*/
class CookieConsent {
	constructor(sqs) {
		this.sqs = sqs;
		this.cookieName = "cookieconsent_status";
		this.cookieValue = "dismiss";
		this.expiryDays = 365;
		this.banner = null;

		if(!this.needsConsent()) {
			return;
		}

		this.sqs.sqsEventListen("popOverOpened", () => {
			this.updateBannerVisibility();
		}, this);
		this.sqs.sqsEventListen("popOverClosed", () => {
			this.updateBannerVisibility();
		}, this);

		this.showBanner();
	}

	hasConsented() {
		return document.cookie.split(";").some((cookie) => {
			return cookie.trim() == this.cookieName+"="+this.cookieValue;
		});
	}

	needsConsent() {
		return Config.cookieWarningEnabled && !this.hasConsented();
	}

	showBanner() {
		const template = document.getElementById("cookie-consent-template");
		this.banner = $(template.content.cloneNode(true).firstElementChild);
		this.renderNotice(this.banner);
		$("body").append(this.banner);
		this.updateBannerVisibility();
	}

	updateBannerVisibility() {
		if(this.banner) {
			this.banner.toggle(!$("#popover-dialog").is(":visible"));
		}
	}

	/*
	* Function: renderNotice
	* Fills in the notice and binds its privacy policy link and its "I agree" button, in the banner or a dialog.
	*/
	renderNotice(container) {
		$(".cookie-consent-message", container).html(Config.legalNoticeMsg);
		$(".privacy-policy-link", container).on("click", () => {
			this.sqs.dialogManager.showPrivacyPolicy();
		});
		$(".cookie-consent-accept", container).on("click", () => {
			this.accept();
		});
	}

	/*
	* Function: renderAcceptRow
	* The "I agree" button for the end of the privacy policy, while the cookies are yet to be agreed to.
	*/
	renderAcceptRow() {
		const row = $("<div class='cookie-consent-actions cookie-consent-pending'></div>");
		const button = $("<button type='button' class='sqs-btn sqs-btn-primary cookie-consent-accept'>I agree to the use of cookies</button>");
		button.on("click", () => {
			this.accept();
		});
		return row.append(button);
	}

	/*
	* Function: showCookiePolicy
	* The notice again, in a dialog, from the main menu.
	*/
	showCookiePolicy() {
		const template = document.getElementById("cookie-policy-template");
		const container = this.sqs.dialogManager.showPopOverFragment("Cookies", template.content.cloneNode(true), {
			width: "560px"
		});
		this.renderNotice(container);
		this.renderStatus(container);
	}

	renderStatus(container) {
		if(this.hasConsented()) {
			$(".cookie-policy-status", container).text("You have agreed to the use of cookies.");
			$(".cookie-consent-pending", container).remove();
		}
		else {
			$(".cookie-policy-status", container).text("You have not yet agreed to the use of cookies.");
		}
	}

	accept() {
		const expires = new Date(Date.now() + this.expiryDays * 24 * 60 * 60 * 1000);
		document.cookie = this.cookieName+"="+this.cookieValue+"; expires="+expires.toUTCString()+"; path=/; SameSite=Lax";

		if(this.banner) {
			this.banner.remove();
			this.banner = null;
		}
		this.sqs.sqsEventUnlisten("popOverOpened", this);
		this.sqs.sqsEventUnlisten("popOverClosed", this);

		//Whichever dialog it was agreed from
		this.renderStatus($("#popover-dialog-frame > .popover-content"));
	}
}

export { CookieConsent as default }
