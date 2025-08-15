class UserManager {
	constructor(sqs) {
		this.sqs = sqs;
		this.user = null;
		this.googleLoginRendered = false;

		this.sqs.sqsEventListen("seadSaveStateClicked", () => {
			this.sqs.stateManager.setViewStateDialog("save");
			this.renderGenericLogin();
			this.checkSigninStatus();
		});

		this.sqs.sqsEventListen("seadLoadStateClicked", () => {
			this.sqs.stateManager.setViewStateDialog("load");
			this.renderGenericLogin();
			this.checkSigninStatus();
		});

		this.sqs.sqsEventListen("popOverClosed", () => {
			this.unrenderGenericLogin();
		});

		
	}

	getUser() {
		//the user object is expected to contain the at least the following properties:
		//displayName, email, provider
		return this.user;
	}

	async checkSigninStatus() {
		const response = await fetch(this.sqs.config.dataServerAddress+'/auth/status', {
			credentials: 'include' // Important: send cookies!
		});
		const data = await response.json();
		console.log(data);
		if (data.loggedIn) {
			// User is logged in, data.user contains user info
			this.user = data.user;
			this.renderLoggedIn();
		} else {
			// Not logged in
			this.user = null;
			this.renderLoggedOut();
		}
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

	renderLoggedIn() {

		console.log(this.user);

		let userImage = this.user.photos && this.user.photos.length > 0 ? this.user.photos[0].value : "";

		let providerCapitalized = this.user.provider.charAt(0).toUpperCase() + this.user.provider.slice(1);

		document.getElementById("login-status-container").innerHTML = `
		Logged in with ${providerCapitalized}<br /><br />
		<div class="user-profile">
			<img src="${userImage}" alt="User Image" class="user-profile-image" />
			<span style='font-weight:bold;'>${this.user.displayName}</span>
		</div>`;

		document.getElementById("login-status-container").style.display = "block";
		document.getElementById("login-options-container").style.display = "none";

		document.getElementById("logout-button").style.display = "block";
		document.getElementById("logout-button").onclick = () => {
			console.log("Logout clicked");
			fetch(this.sqs.config.dataServerAddress + '/auth/logout', {
				method: 'POST',
				credentials: 'include' // Important: send cookies!
			}).then(() => {
				this.user = null;
				console.log("User logged out");
				this.renderLoggedOut();
			}).catch(error => {
				console.error('Logout failed:', error);
			});
		}

		document.getElementById("viewstate-save-input").style.display = "block";
		document.getElementById("viewstate-save-btn").style.display = "block";
	}

	renderLoggedOut() {
		document.getElementById("login-status-container").innerHTML = "Not logged in";
		document.getElementById("login-status-container").style.display = "none";
		document.getElementById("login-options-container").style.display = "block";

		document.getElementById("logout-button").style.display = "none";
	}

	renderGenericLogin() {
		let dialog = this.sqs.stateManager.getViewStateDialog();
		let dialogNodeId = "";
		if(dialog == "save") {
			dialogNodeId = "#viewStateSaveLogin";
		}
		if(dialog == "load") {
			dialogNodeId = "#viewStateLoadLogin";
		}

		const template = document.getElementById('login-template');
		const clone = template.content.cloneNode(true);
		$(dialogNodeId).append(clone);

		$(".login-button").on("click", (event) => {
			const provider = $(event.currentTarget).attr("provider");
			const popup = window.open(this.sqs.config.dataServerAddress + `/auth/${provider}`, `${provider}Login`, "width=500,height=600");

			window.addEventListener("message", (event) => {
				if (event.origin !== window.location.origin) return; // Security check
				if (event.data.type === "login-success" && event.data.provider === provider) {
					this.user = event.data.user;
					this.renderLoggedIn();
					popup.close();
				}
			});
		});
	}

	unrenderGenericLogin() {
		$("#google-login-button").off("click");
		$("#login-container").remove();
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