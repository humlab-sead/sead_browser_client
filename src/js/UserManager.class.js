class UserManager {
	constructor(hqs) {
		this.hqs = hqs;
		this.user = null;
		this.googleLoginRendered = false;

		this.hqs.hqsEventListen("seadSaveStateClicked", () => {
			this.hqs.stateManager.setViewStateDialog("save");
			this.renderGoogleLogin();
		});

		this.hqs.hqsEventListen("seadLoadStateClicked", () => {
			this.hqs.stateManager.setViewStateDialog("load");
			this.renderGoogleLogin();
		});

		this.hqs.hqsEventListen("popOverClosed", () => {
			this.unRenderGoogeLogin();
		});
	}

	googleLogin() {
		gapi.signin2.render('google-signin', {
			'scope': 'profile email',
			'width': 240,
			'height': 50,
			'longtitle': false,
			'theme': 'dark',
			'onsuccess': this.googleLoginSuccess,
			'onfailure': this.googleLoginFail
		});
	}

	renderGoogleLogin() {
		console.log("renderGoogleLogin");

		let dialog = this.hqs.stateManager.getViewStateDialog();
		let dialogNodeId = "";
		if(dialog == "save") {
			dialogNodeId = "#viewStateSaveGoogleLogin";
		}
		if(dialog == "load") {
			dialogNodeId = "#viewStateLoadGoogleLogin";
		}

		let googleLoginNode = $("#googleLoginTemplate")[0].cloneNode(true);
		$(googleLoginNode).attr("id", "googleLoginContainer").show();
		$(dialogNodeId).append(googleLoginNode);

		this.googleLogin();

		if(this.user != null) {
			this.renderUserLoggedIn();
		}
		else {
			this.renderUserLoggedOut(dialog);
		}

		this.googleLoginRendered = true;
	}

	unRenderGoogeLogin() {
		if(this.googleLoginRendered) {
			$("#googleLoginContainer").remove();
			this.googleLoginRendered = false;
		}
	}

	renderUserLoggedIn() {
		console.log("renderUserLoggedIn", this.user);
		$("#googleLoginContainer #google-signin").hide();
		$("#googleLoginContainer #googleLoginRecommendationSave").hide();
		$("#googleLoginContainer #googleLoginRecommendationLoad").hide();
		$("#googleLoginContainer #googleLoginInformation").show();
		$("#googleLoginContainer #googleLoginInformation #googleName").html(this.user.name);
		$("#google-signout").on("click", this.googleLogout);
	}

	renderUserLoggedOut(dialog) {
		$("#googleLoginContainer #google-signin").show();
		if(dialog == "save") {
			$("#googleLoginRecommendationLoad").hide();
			$("#googleLoginRecommendationSave").show();
		}
		if(dialog == "load") {
			$("#googleLoginRecommendationLoad").show();
			$("#googleLoginRecommendationSave").hide();
		}
	}

	activateGoogleLoginButton() {
		let googleLoginNode = $("#googleLoginTemplate")[0].cloneNode(true);
		$(googleLoginNode).attr("id", "googleLogin");
		$("#viewStateSaveGoogleLogin").html(googleLoginNode);

		gapi.signin2.render('google-signin', {
			'scope': 'profile email',
			'width': 240,
			'height': 50,
			'longtitle': false,
			'theme': 'dark',
			'onsuccess': this.googleLoginSuccess,
			'onfailure': this.googleLoginFail
		});
	}

	googleLoginSuccess(googleUser) {
		console.log("googleLoginSuccess");

		var profile = googleUser.getBasicProfile();
		console.log(googleUser, profile);
		/*
		console.log("ID: " + profile.getId()); // Don't send this directly to your server!
        console.log('Full Name: ' + profile.getName());
        console.log('Given Name: ' + profile.getGivenName());
        console.log('Family Name: ' + profile.getFamilyName());
        console.log("Image URL: " + profile.getImageUrl());
		console.log("Email: " + profile.getEmail());
		*/

		window.hqs.userManager.user = {
			"id": profile.getId(),
			"name": profile.getName(),
			"email": profile.getEmail(),
			"id_token":  googleUser.getAuthResponse().id_token
		};

		window.hqs.userManager.renderUserLoggedIn();
		window.hqs.hqsEventDispatch("userLoggedIn", window.hqs.userManager.user);
	}

	googleLoginFail(error) {
		console.log("googleLoginFail", error);
	}

	googleLogout() {
		var auth2 = gapi.auth2.getAuthInstance();
		auth2.signOut().then(() => {
			this.user = null;
			window.hqs.userManager.user = null;
			let dialog = window.hqs.stateManager.getViewStateDialog();
			if(dialog == "save") {
				$("#googleLoginContainer #googleLoginRecommendationSave").show();
				$("#googleLoginContainer #googleLoginRecommendationLoad").hide();
			}
			if(dialog == "load") {
				$("#googleLoginContainer #googleLoginRecommendationLoad").show();
				$("#googleLoginContainer #googleLoginRecommendationSave").hide();
			}
			
			$("#googleLoginContainer #googleLoginInformation").hide();
			$("#googleLoginContainer #google-signin").show();
		});

		this.hqs.hqsEventDispatch("userLoggedOut");
	}

	hqsMenu() {
		return {
			title: "Account",
			layout: "vertical",
			collapsed: true,
			anchor: "#account-menu",
			weight: -5,
			items: [
				{
					name: "account",
					title: "Account",
					callback: () => {
						this.login();
					}
				}
			]
		};
	}
}

export { UserManager as default }