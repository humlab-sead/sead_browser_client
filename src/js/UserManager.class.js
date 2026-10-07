import orcidIdIcon from "../assets/icons/orcid.logo.icon.svg";

/*
Class: UserManager
Signing in and out. The session itself lives in json_api_server (a cookie on this origin);
this keeps the client's view of it - the aux menu entry and the sign-in and account
dialogs - in step with /auth/status.

Whatever needs a signed-in user (saving a viewstate) goes through whenSignedIn, which sends
a signed-out user to the sign-in dialog and carries on with the action once they are in.

Signing in for the first time - or after the privacy policy has changed - is not enough to
have an account: the user is first asked to accept the privacy policy (the consent dialog).
Until they do, they are the pending user, the page goes on as though they were signed out,
and the server gives them no roles and keeps nothing about them. Declining signs them out.
The Account dialog shows what SEAD keeps about the user, and lets them delete their account.

Which sign-in options exist is decided by the server: /auth/status lists them, and the
dialog shows a button only for those. It also gives the user's roles and the permissions
they give, which decide what is offered: the sysadmin role gets "Import data", the
administer_users permission "Admin", the sead_agent permission the agent chatbox. The
server checks them again itself. "userAccessChanged" is dispatched whenever they may have changed.
*/
class UserManager {
	constructor(sqs) {
		this.sqs = sqs;
		this.user = null;
		this.roles = [];
		this.permissions = [];
		this.providers = [];
		//Signed in, but yet to accept the privacy policy (see above)
		this.pendingUser = null;
		//What to do once the user has signed in through the sign-in dialog (whenSignedIn)
		this.afterSignIn = null;

		//One listener for the page's lifetime: the login popup reports back through it
		window.addEventListener("message", (event) => {
			this.handleLoginMessage(event);
		});

		//So the menu reflects a session that already exists, and asks for the privacy policy
		//to be accepted if it has not been
		this.checkSigninStatus({ askConsent: true });
	}

	getUser() {
		//the user object is expected to contain the at least the following properties:
		//provider, id, displayName, emails
		return this.user;
	}

	/*
	* Function: checkSigninStatus
	* Brings the page in step with the session. With askConsent, a user who has yet to accept
	* the privacy policy is asked to; otherwise they are only kept as the pending user.
	*/
	async checkSigninStatus({ askConsent = false } = {}) {
		try {
			const response = await fetch(this.sqs.config.dataServerAddress+'/auth/status', {
				credentials: 'include' // Important: send cookies!
			});
			const data = await response.json();
			this.providers = Array.isArray(data.providers) ? data.providers : [];
			if(this.applyStatus(data.loggedIn ? data.user : null, data) == false && askConsent) {
				this.showConsentDialog();
			}
		}
		catch(error) {
			console.warn("Could not check sign-in status:", error);
			this.setUser(null);
		}
	}

	/*
	* Function: applyStatus
	* The user the session is signed in as, and their access. A user who has yet to accept the
	* privacy policy becomes the pending user, and the page is left signed out. Returns
	* whether the user (or nobody) is now signed in, as opposed to pending.
	*/
	applyStatus(user, { roles = [], permissions = [], consent = null } = {}) {
		if(user != null && consent != null && consent.required) {
			this.pendingUser = user;
			this.setUser(null);
			return false;
		}
		this.pendingUser = null;
		this.setUser(user, roles, permissions);
		return true;
	}

	setUser(user, roles = [], permissions = []) {
		const wasLoggedIn = this.user != null;
		this.user = user;
		this.roles = user != null && Array.isArray(roles) ? roles : [];
		this.permissions = user != null && Array.isArray(permissions) ? permissions : [];
		this.renderMenuState();
		this.renderLoginComponents();
		this.sqs.sqsEventDispatch("userAccessChanged", { user: user, roles: this.roles, permissions: this.permissions });

		if(user != null) {
			this.sqs.sqsEventDispatch("userLoggedIn", { user: user });
		}
		else if(wasLoggedIn) {
			this.sqs.sqsEventDispatch("userLoggedOut", {});
		}
	}

	hasRole(role) {
		return this.roles.includes(role);
	}

	hasPermission(permission) {
		return this.permissions.includes(permission);
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
			//Only if the sign-in dialog is still up: closing it, or opening another dialog over it, called the action off
			const signInDialogOpen = $("#popover-dialog:visible #sign-in-dialog-login").length > 0;
			const afterSignIn = this.afterSignIn;
			this.afterSignIn = null;

			if(this.applyStatus(data.user, data) == false) {
				//The action waits for the privacy policy to be accepted, and is called off with the dialog
				this.afterSignIn = signInDialogOpen ? afterSignIn : null;
				this.showConsentDialog();
				return;
			}
			$.notify("Signed in as "+data.user.displayName, "success");
			if(signInDialogOpen) {
				this.sqs.dialogManager.hidePopOver();
				if(afterSignIn) {
					afterSignIn();
				}
			}
		}
		if(data.type === "login-failure") {
			$.notify(data.message || "Signing in did not succeed.", "error");
		}
	}

	async signOut() {
		const signedIn = this.user || this.pendingUser;
		const provider = signedIn ? signedIn.provider : null;
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

		this.endShibbolethSession(provider);
		this.pendingUser = null;
		this.setUser(null);
		this.sqs.dialogManager.hidePopOver();
		$.notify(provider == "saml" ? "Signed out of SEAD. You may still be signed in at your university." : "Signed out of SEAD.", "info");
	}

	endShibbolethSession(provider) {
		if(provider == "saml") {
			//Also end the short-lived Shibboleth session the login was handed over with, so
			//the next "SEAD login" asks again rather than silently signing the same person in.
			//This is local only: the university's own sign-in is left alone.
			fetch("/Shibboleth.sso/Logout", { credentials: 'include' }).catch(() => {});
		}
	}

	/*
	* Function: showConsentDialog
	* Asks the pending user to accept the privacy policy: a summary of what their account keeps,
	* the policy itself, and a box to tick before they can go on. Declining signs them out.
	*/
	showConsentDialog() {
		if(this.pendingUser == null || $("#popover-dialog:visible .privacy-consent").length > 0) {
			return;
		}
		const template = document.getElementById("privacy-consent-template");
		const container = this.sqs.dialogManager.showPopOverFragment("Your SEAD account", template.content.cloneNode(true), { width: "680px" });
		$(".privacy-consent-name", container).text(this.pendingUser.displayName || "");
		$(".privacy-consent-policy-text", container).append($("#gdpr-infobox > .overlay-dialog-content").children().clone());

		const checkbox = $(".privacy-consent-checkbox", container);
		const accept = $(".privacy-consent-accept", container);
		checkbox.on("change", () => {
			accept.prop("disabled", !checkbox.prop("checked"));
		});
		$(".privacy-consent-decline", container).on("click", () => {
			this.afterSignIn = null;
			this.signOut();
		});
		accept.on("click", () => {
			this.acceptPrivacyPolicy(container);
		});
	}

	/*
	* Function: acceptPrivacyPolicy
	* Tells the server the pending user accepted the policy they were shown (its version is in
	* the page), which creates their account. They are then signed in, and whatever they signed
	* in to do carries on.
	*/
	async acceptPrivacyPolicy(container) {
		const user = this.pendingUser;
		const status = $(".privacy-consent-status", container).empty();
		$(".privacy-consent-actions button", container).prop("disabled", true);
		try {
			const response = await fetch(this.sqs.config.dataServerAddress+"/auth/consent", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ version: $("#gdpr-infobox").attr("data-privacy-policy-version") })
			});
			const body = await response.json().catch(() => ({}));
			if(!response.ok) {
				throw new Error(body.error || "The server answered "+response.status+".");
			}
			const afterSignIn = this.afterSignIn;
			this.afterSignIn = null;
			this.applyStatus(user, body);
			this.sqs.dialogManager.hidePopOver();
			$.notify("Signed in as "+user.displayName, "success");
			if(afterSignIn) {
				afterSignIn();
			}
		}
		catch(error) {
			console.error("Could not accept the privacy policy", error);
			status.text(error instanceof TypeError ? "The server could not be reached. Please try again." : error.message);
			$(".privacy-consent-decline", container).prop("disabled", false);
			$(".privacy-consent-accept", container).prop("disabled", !$(".privacy-consent-checkbox", container).prop("checked"));
		}
	}

	/*
	* Function: renderLoginComponent
	* The one login component, used in the sign-in and account dialogs.
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

	/*
	* Function: whenSignedIn
	* Runs the action right away for a signed-in user. A signed-out user gets the sign-in dialog
	* instead, and the action runs once they have signed in through it.
	*
	* Note: if the popup is blocked the login leaves the page, and the action is forgotten with it.
	*/
	whenSignedIn(action) {
		if(this.user != null) {
			action();
			return;
		}
		if(this.pendingUser != null) {
			this.afterSignIn = action;
			this.showConsentDialog();
			return;
		}
		this.showSignInDialog(action);
	}

	showSignInDialog(afterSignIn = null) {
		this.afterSignIn = afterSignIn;
		this.sqs.dialogManager.showPopOver("Sign in", "<div id='sign-in-dialog-login'></div>");
		this.renderLoginComponent("#sign-in-dialog-login");
	}

	showAccountDialog() {
		const container = this.sqs.dialogManager.showPopOver("Account", "<div id='account-dialog-login'></div>", { width: "640px" });
		this.renderLoginComponent("#account-dialog-login");
		const accountData = document.getElementById("account-data-template").content.cloneNode(true);
		$("#account-dialog-login").after(accountData);
		this.renderAccountData($(".account-data", container));
	}

	/*
	* Function: renderAccountData
	* What SEAD keeps about the signed-in user (GET /auth/account), and deleting their account.
	* Every value is inserted as text.
	*/
	async renderAccountData(node) {
		$(".account-data-policy-link", node).on("click", () => {
			this.sqs.dialogManager.showPrivacyPolicy();
		});
		const deleteButton = $(".account-data-delete-button", node);
		if(this.hasPermission("administer_users")) {
			deleteButton.prop("disabled", true).attr("title", "Your account administers users. Ask another admin to take that role from you first.");
		}
		deleteButton.on("click", () => {
			this.deleteAccount(node);
		});

		const content = $(".account-data-content", node);
		try {
			const response = await fetch(this.sqs.config.dataServerAddress+"/auth/account", { credentials: "include" });
			if(!response.ok) {
				throw new Error("The server answered "+response.status+".");
			}
			const data = await response.json();
			const account = data.account || {};
			const consent = account.privacy_consent || null;
			const facts = [
				["Identifier", data.id],
				["Name", account.display_name],
				["Email", account.email],
				["Organisation", account.organization],
				["ORCID iD", account.uri],
				["Account since", this.formatDate(account.first_sign_in_at)],
				["Last signed in", this.formatDate(account.last_sign_in_at)],
				["Sign-ins", account.sign_ins],
				["Roles", data.roles.join(", ") || "None"],
				["Note from the administrators", data.note],
				["Saved viewstates", data.viewstates],
				["Privacy policy accepted", consent ? this.formatDate(consent.at)+" (version of "+consent.version+")" : null]
			].filter(([label, value]) => value !== null && value !== undefined && value !== "");
			const table = $("<table class='account-data-facts'></table>");
			facts.forEach(([label, value]) => {
				const row = $("<tr></tr>").appendTo(table);
				$("<th></th>").text(label).appendTo(row);
				$("<td></td>").text(value).appendTo(row);
			});
			content.empty().append(table);
		}
		catch(error) {
			console.error("Could not fetch the account", error);
			content.empty().text("What SEAD keeps about you could not be fetched. "+(error instanceof TypeError ? "The server could not be reached." : error.message));
		}
	}

	/*
	* Function: deleteAccount
	* Deletes the signed-in user's account, once they have confirmed it, and signs them out.
	*/
	async deleteAccount(node) {
		if(!window.confirm("Delete your SEAD account? What SEAD keeps about you is removed, your private viewstates with it, and you are signed out. Your public viewstates are kept for their links, but no longer linked to you.")) {
			return;
		}
		const provider = this.user ? this.user.provider : null;
		const status = $(".account-data-status", node).empty();
		$(".account-data-delete-button", node).prop("disabled", true);
		try {
			const response = await fetch(this.sqs.config.dataServerAddress+"/auth/account", {
				method: "DELETE",
				credentials: "include"
			});
			const body = await response.json().catch(() => ({}));
			if(!response.ok) {
				throw new Error(body.error || "The server answered "+response.status+".");
			}
		}
		catch(error) {
			console.error("Could not delete the account", error);
			status.text(error instanceof TypeError ? "The server could not be reached. Please try again." : error.message);
			$(".account-data-delete-button", node).prop("disabled", false);
			return;
		}
		this.endShibbolethSession(provider);
		this.pendingUser = null;
		this.setUser(null);
		this.sqs.dialogManager.hidePopOver();
		$.notify("Your SEAD account has been deleted.", "info");
	}

	formatDate(value) {
		if(!value) {
			return null;
		}
		const date = new Date(value);
		return isNaN(date) ? null : date.toLocaleString("en-GB", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
		this.menuItems.importData.visible = this.hasRole("sysadmin");
		this.menuItems.admin.visible = this.hasPermission("administer_users");
		this.menuItems.account.title = "<i class=\"fa fa-user\" aria-hidden=\"true\"></i> "+$("<span></span>").text(signedIn ? this.user.displayName : "").html();

		$("[menu-item='account'] > .first-level-item-title", "#aux-menu").html(this.menuItems.account.title);
		const menu = this.sqs.menuManager.getMenuByAnchor("#aux-menu");
		if(menu) {
			menu.updateMenuItemVisibilityForCurrentMode();
		}
	}

	sqsMenu() {
		//Only for sysadmins, and for those who administer users (renderMenuState)
		const importData = {
			name: "import-data",
			title: "Import data",
			visible: false,
			callback: () => {
				this.sqs.dataImportManager.showImportDialog();
			}
		};
		const admin = {
			name: "admin",
			title: "Admin",
			visible: false,
			callback: () => {
				this.sqs.adminPanel.showAdminPanel();
			}
		};
		this.menuItems = {
			importData: importData,
			admin: admin,
			signIn: {
				name: "sign-in",
				title: "<i class=\"fa fa-sign-in\" aria-hidden=\"true\"></i> Sign in",
				callback: () => {
					//Signed in already, but yet to accept the privacy policy
					if(this.pendingUser != null) {
						this.afterSignIn = null;
						this.showConsentDialog();
						return;
					}
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
					importData,
					admin,
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
