class UserManager {
	constructor(sqs) {
		this.sqs = sqs;
		this.user = null;
		this.googleLoginRendered = false;

		this.sqs.sqsEventListen("seadSaveStateClicked", () => {
			this.sqs.stateManager.setViewStateDialog("save");
			this.renderGoogleLogin();
		});

		this.sqs.sqsEventListen("seadLoadStateClicked", () => {
			this.sqs.stateManager.setViewStateDialog("load");
			this.renderGoogleLogin();
		});

		this.sqs.sqsEventListen("popOverClosed", () => {
			this.unRenderGoogeLogin();
		});
	}

	googleLogin() {

		/*
		gapi.auth2.init({
			client_id: 
		});
		*/

		
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

		let dialog = this.sqs.stateManager.getViewStateDialog();
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
		$("#viewstate-load-list").show();
		$("#viewstate-save-input").show();
		$("#viewstate-save-btn").show();
		$("#googleLoginContainer #google-signin").hide();
		$("#googleLoginInformation").show();
		$("#googleLoginInformation .google-user-profile-image").attr("src", this.user.image);
		$("#googleLoginInformation .google-user-profile-name").html(this.user.name);
		$("#googleLoginInformation .google-user-profile-email").html(this.user.email);

		$(".google-user-sign-out > a").on("click", this.googleLogout);
	}

	renderUserLoggedOut(dialog) {
		$("#viewstate-load-list").hide();
		$("#viewstate-save-input").hide();
		$("#viewstate-save-btn").hide();
		$("#googleLoginInformation").hide();

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
		console.log("activateGoogleLoginButton");
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

		var profile = googleUser.getBasicProfile();

		window.sqs.userManager.user = {
			"id": profile.getId(),
			"name": profile.getName(),
			"email": profile.getEmail(),
			"image": profile.getImageUrl(),
			"id_token":  googleUser.getAuthResponse().id_token
		};

		window.sqs.userManager.renderUserLoggedIn();
		window.sqs.sqsEventDispatch("userLoggedIn", window.sqs.userManager.user);
	}

	googleLoginFail(error) {
		console.log("googleLoginFail", error);
	}

	googleLogout() {
		let auth2 = gapi.auth2.getAuthInstance();
		auth2.signOut().then(() => {
			//"this" is NOT the UserManager here
			window.sqs.userManager.user = null;
			let dialog = window.sqs.stateManager.getViewStateDialog();
			if(dialog == "save") {
				$("#googleLoginContainer #googleLoginRecommendationSave").show();
				$("#googleLoginContainer #googleLoginRecommendationLoad").hide();
			}
			if(dialog == "load") {
				$("#googleLoginContainer #googleLoginRecommendationLoad").show();
				$("#googleLoginContainer #googleLoginRecommendationSave").hide();
			}
			
			$("#googleLoginInformation").hide();
			$("#viewstate-load-list").hide();
			$("#googleLoginContainer #google-signin").show();
			$("#viewstate-load-list").hide();
			$("#viewstate-save-input").hide();
			$("#viewstate-save-btn").hide();
		});

		//auth2.disconnect(); //Revokes all of the scopes that the user granted.

		window.sqs.sqsEventDispatch("userLoggedOut");
	}

	sqsMenu() {
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