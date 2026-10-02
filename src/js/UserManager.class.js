import orcidIdIcon from "../assets/icons/orcid.logo.icon.svg";

/*
Class: UserManager
Signing in and out. The session itself lives in json_api_server (a cookie on this origin);
this keeps the client's view of it - the aux menu entry, the sign-in dialog and the login
component in the viewstate dialogs - in step with /auth/status.

Which sign-in options exist is decided by the server: /auth/status lists them, and the
dialog shows a button only for those.
*/
class UserManager {
	constructor(sqs) {
		this.sqs = sqs;
		this.user = null;
		this.providers = [];

		this.sqs.sqsEventListen("seadSaveStateClicked", () => {
			this.sqs.stateManager.setViewStateDialog("save");
			this.renderLoginComponent("#viewStateSaveLogin");
		});

		this.sqs.sqsEventListen("seadLoadStateClicked", () => {
			this.sqs.stateManager.setViewStateDialog("load");
			this.renderLoginComponent("#viewStateLoadLogin");
		});

		//One listener for the page's lifetime: the login popup reports back through it
		window.addEventListener("message", (event) => {
			this.handleLoginMessage(event);
		});

		//So the menu reflects a session that already exists
		this.checkSigninStatus();
	}

	getUser() {
		//the user object is expected to contain the at least the following properties:
		//provider, id, displayName, emails
		return this.user;
	}

	async checkSigninStatus() {
		try {
			const response = await fetch(this.sqs.config.dataServerAddress+'/auth/status', {
				credentials: 'include' // Important: send cookies!
			});
			const data = await response.json();
			this.providers = Array.isArray(data.providers) ? data.providers : [];
			this.setUser(data.loggedIn ? data.user : null);
		}
		catch(error) {
			console.warn("Could not check sign-in status:", error);
			this.setUser(null);
		}
	}

	setUser(user) {
		const wasLoggedIn = this.user != null;
		this.user = user;
		this.renderMenuState();
		this.renderLoginComponents();

		if(user != null) {
			this.sqs.sqsEventDispatch("userLoggedIn", { user: user });
		}
		else if(wasLoggedIn) {
			this.sqs.sqsEventDispatch("userLoggedOut", {});
		}
	}

	getProvider(providerId) {
		return this.providers.find(provider => provider.id == providerId) || null;
	}

	/*
	* Function: login
	* Opens the provider's login in a popup, which posts the result back (handleLoginMessage).
	* If the popup is blocked, the login happens in this window instead, and the server
	* sends the browser back here when it is done.
	*/
	login(providerId) {
		const provider = this.getProvider(providerId);
		if(provider == null) {
			return;
		}
		const loginUrl = new URL(provider.loginUrl, this.sqs.config.serverRoot);
		const popup = window.open(loginUrl.href, "seadLogin", "width=520,height=680");
		if(popup == null || popup.closed || typeof popup.closed == "undefined") {
			loginUrl.searchParams.set("return", window.location.pathname + window.location.search);
			window.location.assign(loginUrl.href);
			return;
		}
		popup.focus();
	}

	handleLoginMessage(event) {
		if (event.origin !== window.location.origin) return; // Security check
		const data = event.data;
		if(data == null || typeof data != "object") {
			return;
		}
		if(data.type === "login-success") {
			this.setUser(data.user);
			if(this.sqs.stateManager.getViewStateDialog() == null) {
				this.sqs.dialogManager.hidePopOver();
			}
			$.notify("Signed in as "+data.user.displayName, "success");
		}
		if(data.type === "login-failure") {
			$.notify(data.message || "Signing in did not succeed.", "error");
		}
	}

	async signOut() {
		const provider = this.user ? this.user.provider : null;
		try {
			const response = await fetch(this.sqs.config.dataServerAddress + '/auth/logout', {
				method: 'POST',
				credentials: 'include' // Important: send cookies!
			});
			if(!response.ok) {
				throw new Error("Logout answered "+response.status);
			}
		}
		catch(error) {
			console.error('Logout failed:', error);
			$.notify("Signing out did not succeed.", "error");
			return;
		}

		if(provider == "saml") {
			//Also end the short-lived Shibboleth session the login was handed over with, so
			//the next "SEAD login" asks again rather than silently signing the same person in.
			//This is local only: the university's own sign-in is left alone.
			fetch("/Shibboleth.sso/Logout", { credentials: 'include' }).catch(() => {});
		}

		this.setUser(null);
		this.sqs.dialogManager.hidePopOver();
		$.notify(provider == "saml" ? "Signed out of SEAD. You may still be signed in at your university." : "Signed out of SEAD.", "info");
	}

	/*
	* Function: renderLoginComponent
	* The one login component, used in the sign-in dialog and in the viewstate dialogs.
	* Shows the sign-in options when signed out, and who is signed in otherwise.
	*/
	renderLoginComponent(containerSelector) {
		const template = document.getElementById('login-template');
		const container = $(containerSelector);
		container.empty();
		container[0].appendChild(template.content.cloneNode(true));

		$(".orcid-id-icon", container).attr("src", orcidIdIcon);
		$(".login-button[provider]", container).on("click", (event) => {
			this.login($(event.currentTarget).attr("provider"));
		});
		$(".login-signout-button", container).on("click", () => {
			this.signOut();
		});

		this.updateLoginComponent(container);
	}

	renderLoginComponents() {
		$(".login-container").each((index, node) => {
			this.updateLoginComponent($(node).parent());
		});
	}

	updateLoginComponent(container) {
		const signedIn = this.user != null;
		$(".login-signed-in", container).toggle(signedIn);
		$(".login-signed-out", container).toggle(!signedIn);

		$(".login-button[provider]", container).each((index, node) => {
			const provider = this.getProvider($(node).attr("provider"));
			$(node).toggle(provider != null);
			if(provider != null && $(node).attr("provider") == "saml") {
				$(".login-button-label", node).text(provider.label);
			}
		});
		$(".login-no-providers", container).toggle(this.providers.length == 0);

		const userContainer = $(".login-user", container).empty();
		if(signedIn) {
			userContainer.append(this.renderUserDetails());
		}
	}

	renderUserDetails() {
		const details = $("<div class='login-user-details'></div>");
		$("<div class='login-user-name'></div>").text(this.user.displayName).appendTo(details);

		const provider = this.getProvider(this.user.provider);
		const via = $("<div class='login-user-detail'></div>").text("Signed in with "+(provider ? provider.label : this.user.provider));
		if(this.user.organization) {
			via.append(document.createTextNode(" ("+this.user.organization+")"));
		}
		via.appendTo(details);

		if(this.user.uri) {
			//ORCID's display guidelines: an authenticated iD is shown as its full URI, with the iD icon
			const orcid = $("<a class='login-user-detail login-user-orcid' target='_blank' rel='noopener noreferrer'></a>").attr("href", this.user.uri);
			$("<img class='login-provider-icon' alt='ORCID iD icon' />").attr("src", orcidIdIcon).appendTo(orcid);
			orcid.append(document.createTextNode(" "+this.user.uri));
			orcid.appendTo(details);
		}

		const email = Array.isArray(this.user.emails) && this.user.emails.length ? this.user.emails[0].value : null;
		if(email) {
			$("<div class='login-user-detail'></div>").text(email).appendTo(details);
		}

		return details;
	}

	showSignInDialog() {
		this.sqs.stateManager.setViewStateDialog(null);
		this.sqs.dialogManager.showPopOver("Sign in", "<div id='sign-in-dialog-login'></div>");
		this.renderLoginComponent("#sign-in-dialog-login");
	}

	showAccountDialog() {
		this.sqs.stateManager.setViewStateDialog(null);
		this.sqs.dialogManager.showPopOver("Account", "<div id='account-dialog-login'></div>");
		this.renderLoginComponent("#account-dialog-login");
	}

	/*
	* Function: renderMenuState
	* The aux menu shows "Sign in" when signed out, and the user's name - with Account and
	* Sign out under it - when signed in. The items are toggled in place.
	*/
	renderMenuState() {
		if(!this.menuItems) {
			return;
		}
		const signedIn = this.user != null;
		this.menuItems.signIn.visible = !signedIn;
		this.menuItems.account.visible = signedIn;
		this.menuItems.account.title = "<i class=\"fa fa-user\" aria-hidden=\"true\"></i> "+$("<span></span>").text(signedIn ? this.user.displayName : "").html();

		$("[menu-item='account'] > .first-level-item-title", "#aux-menu").html(this.menuItems.account.title);
		const menu = this.sqs.menuManager.getMenuByAnchor("#aux-menu");
		if(menu) {
			menu.updateMenuItemVisibilityForCurrentMode();
		}
	}

	sqsMenu() {
		this.menuItems = {
			signIn: {
				name: "sign-in",
				title: "<i class=\"fa fa-sign-in\" aria-hidden=\"true\"></i> Sign in",
				callback: () => {
					this.showSignInDialog();
				}
			},
			account: {
				name: "account",
				title: "<i class=\"fa fa-user\" aria-hidden=\"true\"></i>",
				visible: false,
				children: [
					{
						name: "account-details",
						title: "Account",
						callback: () => {
							this.showAccountDialog();
						}
					},
					{
						name: "sign-out",
						title: "Sign out",
						callback: () => {
							this.signOut();
						}
					}
				]
			}
		};
		this.renderMenuState();

		return {
			title: "Account",
			layout: "vertical",
			collapsed: true,
			anchor: "#account-menu",
			weight: 10,
			items: [
				this.menuItems.signIn,
				this.menuItems.account
			]
		};
	}
}

export { UserManager as default }
