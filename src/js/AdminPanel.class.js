import orcidIdIcon from "../assets/icons/orcid.logo.icon.svg";

/*
Class: AdminPanel
The admin panel, for users with the administer_users permission (the account menu offers it
only to them; see UserManager). It administers SEAD's users and roles through json_api_server's
/admin endpoints, in two tabs:

Users
- every user who has signed in, has a role, or is signed in now, with what their login said about them
- giving and taking away roles, and a note on why someone has them
- signing a user out everywhere
- giving a role to a user id that has not signed in yet

Roles
- what each role may do, out of the permissions there are (Administer users, SEAD agent)
- creating and deleting roles; sysadmin is built in, and always administers users

The server checks the permission itself on every request, and refuses any change that would
take administer_users from the admin making it; the panel disables those controls to match.
Every value from the server is inserted as text - names and organisations come from the
users' login providers.
*/
class AdminPanel {
	constructor(sqs) {
		this.sqs = sqs;
		this.users = [];
		this.roles = [];
		this.permissions = [];
		this.you = null;
		this.container = null;
	}

	showAdminPanel() {
		const template = document.getElementById("admin-panel-template");
		this.container = this.sqs.dialogManager.showPopOverFragment("Admin", template.content.cloneNode(true), { width: "1100px" });
		this.users = [];

		$(".admin-tab", this.container).on("click", (event) => {
			this.showTab($(event.currentTarget).attr("data-tab"));
		});
		$(".admin-users-filter", this.container).on("input", () => {
			this.renderUsers();
		});
		$(".admin-refresh", this.container).on("click", () => {
			this.load();
		});
		$(".admin-add-user", this.container).on("submit", (event) => {
			event.preventDefault();
			this.addUser();
		});
		$(".admin-add-role", this.container).on("submit", (event) => {
			event.preventDefault();
			this.addRole();
		});

		this.showTab("users");
		this.load();
	}

	showTab(tab) {
		$(".admin-tab", this.container).each((index, node) => {
			const selected = $(node).attr("data-tab") == tab;
			$(node).toggleClass("admin-tab-selected", selected).attr("aria-selected", selected ? "true" : "false");
		});
		$(".admin-tab-panel", this.container).each((index, node) => {
			$(node).toggle($(node).attr("data-tab") == tab);
		});
	}

	/*
	* Function: load
	* The users and the roles, which both tabs need: the users tab gives roles, the roles tab
	* counts their users.
	*/
	async load() {
		const container = this.container;
		this.setStatus("Fetching the users and roles...", "info", true);
		try {
			const [usersResponse, rolesResponse] = await Promise.all([this.request("GET", "/admin/users"), this.request("GET", "/admin/roles")]);
			for(const response of [usersResponse, rolesResponse]) {
				if(!response.ok) {
					throw new Error(await this.errorMessage(response));
				}
			}
			const users = await usersResponse.json();
			const roles = await rolesResponse.json();
			if(container !== this.container) {
				return;
			}
			this.users = users.users;
			this.you = users.you;
			this.roles = roles.roles;
			this.permissions = roles.permissions;
			this.setStatus("");
			this.renderRoleOptions();
			this.renderUsers();
			this.renderRoles();
		}
		catch(error) {
			console.error("Could not fetch the users and roles", error);
			if(container === this.container) {
				this.setStatus(this.failureMessage(error, "The users and roles could not be fetched"), "error");
			}
		}
	}

	/*
	* Function: request
	* A request to json_api_server with the session cookie. Its answer to a signed-out or
	* unauthorised user (401/403) is explained by errorMessage.
	*/
	request(method, path, body = null) {
		const options = {
			method: method,
			credentials: "include"
		};
		if(body != null) {
			options.headers = { "Content-Type": "application/json" };
			options.body = JSON.stringify(body);
		}
		return fetch(this.sqs.config.dataServerAddress+path, options);
	}

	userPath(user) {
		return "/admin/users/"+encodeURIComponent(user.id);
	}

	renderRoleOptions() {
		const select = $(".admin-add-user-role", this.container).empty();
		this.roles.forEach(role => {
			$("<option></option>").attr("value", role.id).text(role.id).attr("title", this.roleSummary(role)).appendTo(select);
		});
	}

	/*
	* Function: keepsAdmin
	* Whether these roles, defined as given, administer users. Asked about the admin's own roles
	* before a change, as the server does.
	*/
	keepsAdmin(roleIds, roles = this.roles) {
		return roles.some(role => roleIds.includes(role.id) && role.permissions.includes("administer_users"));
	}

	yourRoles() {
		const you = this.users.find(user => user.id == this.you);
		return you ? you.roles : [];
	}

	roleSummary(role) {
		const permissions = role.permissions.map(id => this.permissionLabel(id)).join(", ") || "No permissions";
		return (role.description ? role.description+"\n" : "")+permissions;
	}

	permissionLabel(id) {
		const permission = this.permissions.find(p => p.id == id);
		return permission ? permission.label : id;
	}

	/*
	* Function: renderUsers
	* The users that match the filter, the signed-in first and then by name.
	*/
	renderUsers() {
		const filter = String($(".admin-users-filter", this.container).val() || "").trim().toLowerCase();
		const shown = this.users.filter(user => filter == "" || this.searchText(user).includes(filter));
		shown.sort((a, b) => (b.signed_in - a.signed_in) || this.nameOf(a).localeCompare(this.nameOf(b)));

		const signedIn = this.users.filter(user => user.signed_in).length;
		const withRoles = this.users.filter(user => user.roles.length > 0).length;
		let summary = this.count(this.users.length, "user")+", "+signedIn+" signed in now, "+withRoles+" with a role.";
		if(filter != "") {
			summary = this.count(shown.length, "user")+" of "+summary;
		}
		$(".admin-users-summary", this.container).text(summary);

		const tbody = $(".admin-users-table tbody", this.container).empty();
		shown.forEach(user => {
			tbody.append(this.renderUser(user));
		});
		if(shown.length == 0) {
			$("<tr><td colspan='5' class='admin-users-empty'></td></tr>").appendTo(tbody)
				.find("td").text(this.users.length ? "No user matches." : "Nobody has signed in yet.");
		}
	}

	searchText(user) {
		return [user.display_name, user.email, user.organization, user.id, user.uri, user.note].filter(Boolean).join(" ").toLowerCase();
	}

	nameOf(user) {
		return user.display_name || user.id;
	}

	renderUser(user) {
		const isYou = user.id == this.you;
		const row = $("<tr class='admin-user'></tr>").attr("data-user-id", user.id);

		const who = $("<td class='admin-user-who'></td>").appendTo(row);
		const name = $("<div class='admin-user-name'></div>").appendTo(who);
		if(user.signed_in) {
			$("<span class='admin-user-online' title='Signed in now'></span>").appendTo(name);
		}
		name.append(document.createTextNode(this.nameOf(user)));
		if(isYou) {
			$("<span class='admin-user-you'></span>").text("you").appendTo(name);
		}
		const details = [this.providerLabel(user.provider), user.organization, user.email].filter(Boolean).join(" · ");
		if(details) {
			$("<div class='admin-user-detail'></div>").text(details).appendTo(who);
		}
		if(user.uri) {
			const orcid = $("<a class='admin-user-detail admin-user-orcid' target='_blank' rel='noopener noreferrer'></a>").attr("href", user.uri).appendTo(who);
			$("<img class='login-provider-icon' alt='ORCID iD icon' />").attr("src", orcidIdIcon).appendTo(orcid);
			orcid.append(document.createTextNode(" "+user.uri));
		}
		$("<div class='admin-user-id'></div>").text(user.id).appendTo(who);

		const seen = $("<td class='admin-user-seen'></td>").appendTo(row);
		if(user.last_sign_in_at) {
			$("<div></div>").text(this.formatDate(user.last_sign_in_at)).appendTo(seen);
			$("<div class='admin-user-detail'></div>").text(this.count(user.sign_ins, "sign-in")+" since "+this.formatDate(user.first_sign_in_at, false)).appendTo(seen);
		}
		else {
			$("<div class='admin-user-detail'></div>").text(user.signed_in ? "Signed in now" : "No sign-in recorded").appendTo(seen);
		}

		const roles = $("<td class='admin-user-roles'></td>").appendTo(row);
		this.roles.forEach(role => {
			const label = $("<label class='admin-user-role'></label>").attr("title", this.roleSummary(role)).appendTo(roles);
			const checkbox = $("<input type='checkbox' />").attr("value", role.id).prop("checked", user.roles.includes(role.id)).appendTo(label);
			label.append(document.createTextNode(" "+role.id));
			if(isYou && user.roles.includes(role.id) && !this.keepsAdmin(user.roles.filter(id => id != role.id))) {
				//the server refuses it too
				checkbox.prop("disabled", true);
				label.attr("title", "This role is what lets you administer users, so you cannot take it away from yourself. Another admin has to.");
			}
			checkbox.on("change", () => {
				const newRoles = this.roles.map(r => r.id).filter(id => id == role.id ? checkbox.prop("checked") : user.roles.includes(id));
				this.saveUser(user, { roles: newRoles });
			});
		});
		if(user.roles_updated_by) {
			$("<div class='admin-user-detail'></div>")
				.text("Last changed by "+user.roles_updated_by+(user.roles_updated_at ? ", "+this.formatDate(user.roles_updated_at, false) : ""))
				.appendTo(roles);
		}

		const noteCell = $("<td class='admin-user-note'></td>").appendTo(row);
		const note = $("<textarea class='admin-user-note-input' rows='2' maxlength='500' placeholder='Note, e.g. why they have a role. The user can see it.'></textarea>")
			.val(user.note || "").attr("aria-label", "Note on "+this.nameOf(user)).appendTo(noteCell);
		note.on("change", () => {
			this.saveUser(user, { roles: user.roles, note: String(note.val()) });
		});

		const actions = $("<td class='admin-user-actions'></td>").appendTo(row);
		if(user.signed_in && !isYou) {
			$("<button type='button' class='light-theme-button'>Sign out</button>")
				.attr("title", "End all of "+this.nameOf(user)+"'s sessions")
				.on("click", () => this.endSessions(user))
				.appendTo(actions);
		}

		return row;
	}

	/*
	* Function: saveUser
	* Gives the user these roles (and note). The row is redrawn from the server's answer, or
	* put back as it was if the change did not go through.
	*/
	async saveUser(user, change) {
		const container = this.container;
		$(".admin-user[data-user-id='"+CSS.escape(user.id)+"'] :input", container).prop("disabled", true);
		this.setStatus("Saving "+this.nameOf(user)+"...", "info", true);
		try {
			const response = await this.request("PUT", this.userPath(user), change);
			if(!response.ok) {
				throw new Error(await this.errorMessage(response));
			}
			const saved = await response.json();
			//the roles tab counts each role's users
			this.roles.forEach(role => {
				role.users += (saved.roles.includes(role.id) ? 1 : 0) - (user.roles.includes(role.id) ? 1 : 0);
			});
			user.roles = saved.roles;
			if(typeof change.note == "string") {
				user.note = change.note.trim() || null;
			}
			user.roles_updated_by = this.you;
			user.roles_updated_at = new Date().toISOString();
			if(container === this.container) {
				this.setStatus("Saved "+this.nameOf(user)+".", "success");
			}
			if(user.id == this.you) {
				//what the menu offers follows the roles
				this.sqs.userManager.checkSigninStatus();
			}
		}
		catch(error) {
			console.error("Could not save the user", error);
			if(container === this.container) {
				this.setStatus(this.failureMessage(error, this.nameOf(user)+" could not be saved"), "error");
			}
		}
		if(container === this.container) {
			this.redrawUser(user);
			this.renderRoles();
		}
	}

	async endSessions(user) {
		if(!window.confirm("Sign "+this.nameOf(user)+" out of SEAD everywhere?")) {
			return;
		}
		const container = this.container;
		this.setStatus("Signing "+this.nameOf(user)+" out...", "info", true);
		try {
			const response = await this.request("DELETE", this.userPath(user)+"/sessions");
			if(!response.ok) {
				throw new Error(await this.errorMessage(response));
			}
			user.signed_in = false;
			if(container === this.container) {
				this.setStatus(this.nameOf(user)+" has been signed out.", "success");
				this.renderUsers();
			}
		}
		catch(error) {
			console.error("Could not sign the user out", error);
			if(container === this.container) {
				this.setStatus(this.failureMessage(error, this.nameOf(user)+" could not be signed out"), "error");
			}
		}
	}

	redrawUser(user) {
		const row = $(".admin-user[data-user-id='"+CSS.escape(user.id)+"']", this.container);
		if(row.length) {
			row.replaceWith(this.renderUser(user));
		}
	}

	/*
	* Function: addUser
	* Gives a role to a user id, who may not have signed in yet - their role is waiting for them
	* when they do. A user already listed keeps their other roles.
	*/
	async addUser() {
		const input = $(".admin-add-user-id", this.container);
		const id = String(input.val() || "").trim();
		const role = String($(".admin-add-user-role", this.container).val() || "");
		if(id == "" || role == "") {
			return;
		}
		let user = this.users.find(u => u.id == id);
		if(user == null) {
			user = { id: id, provider: null, display_name: null, roles: [], signed_in: false, sign_ins: 0 };
		}
		const container = this.container;
		this.setStatus("Giving "+id+" the role "+role+"...", "info", true);
		try {
			const response = await this.request("PUT", this.userPath(user), { roles: [...new Set([...user.roles, role])] });
			if(!response.ok) {
				throw new Error(await this.errorMessage(response));
			}
			if(container !== this.container) {
				return;
			}
			input.val("");
			$(".admin-users-filter", this.container).val("");
			await this.load();
			if(container === this.container) {
				this.setStatus(id+" has the role "+role+".", "success");
			}
		}
		catch(error) {
			console.error("Could not add the user", error);
			if(container === this.container) {
				this.setStatus(this.failureMessage(error, "The role could not be given"), "error");
			}
		}
	}

	/*
	* Function: renderRoles
	* Every role, with a checkbox for each permission. Built-in roles cannot be deleted and keep
	* their locked permissions; nor can a change take administer_users away from you.
	*/
	renderRoles() {
		const head = $(".admin-roles-table thead tr", this.container).empty();
		$("<th></th>").text("Role").appendTo(head);
		$("<th></th>").text("Description").appendTo(head);
		this.permissions.forEach(permission => {
			$("<th class='admin-role-permission-head'></th>").text(permission.label).attr("title", permission.description).appendTo(head);
		});
		$("<th></th>").text("Users").appendTo(head);
		$("<th><span class='sr-only'>Actions</span></th>").appendTo(head);

		const tbody = $(".admin-roles-table tbody", this.container).empty();
		this.roles.forEach(role => {
			tbody.append(this.renderRole(role));
		});

		const permissions = $(".admin-add-role-permissions", this.container).empty();
		this.permissions.forEach(permission => {
			const label = $("<label class='admin-add-role-permission'></label>").attr("title", permission.description).appendTo(permissions);
			$("<input type='checkbox' />").attr("value", permission.id).appendTo(label);
			label.append(document.createTextNode(" "+permission.label));
		});
	}

	renderRole(role) {
		const row = $("<tr class='admin-role'></tr>").attr("data-role-id", role.id);
		const yours = this.yourRoles().includes(role.id);

		const name = $("<td class='admin-role-name'></td>").appendTo(row);
		$("<div class='admin-user-name'></div>").text(role.id).appendTo(name);
		if(role.builtin) {
			$("<div class='admin-user-detail'></div>").text("Built in").appendTo(name);
		}
		if(role.updated_by) {
			$("<div class='admin-user-detail'></div>")
				.text("Last changed by "+role.updated_by+(role.updated_at ? ", "+this.formatDate(role.updated_at, false) : ""))
				.appendTo(name);
		}

		const descriptionCell = $("<td class='admin-role-description'></td>").appendTo(row);
		const description = $("<textarea class='admin-user-note-input' rows='2' maxlength='300' placeholder='What the role is for'></textarea>")
			.val(role.description || "").attr("aria-label", "Description of "+role.id).appendTo(descriptionCell);
		description.on("change", () => {
			this.saveRole(role, { description: String(description.val()), permissions: role.permissions });
		});

		this.permissions.forEach(permission => {
			const cell = $("<td class='admin-role-permission'></td>").appendTo(row);
			const has = role.permissions.includes(permission.id);
			const checkbox = $("<input type='checkbox' />").attr("value", permission.id).prop("checked", has)
				.attr("aria-label", permission.label+" for "+role.id).attr("title", permission.description).appendTo(cell);
			const without = role.permissions.filter(id => id != permission.id);
			if(has && role.locked.includes(permission.id)) {
				checkbox.prop("disabled", true).attr("title", "The "+role.id+" role always has "+permission.label+".");
			}
			else if(has && yours && !this.keepsAdmin(this.yourRoles(), this.roles.map(r => r.id == role.id ? Object.assign({}, r, { permissions: without }) : r))) {
				checkbox.prop("disabled", true).attr("title", "This is what lets you administer users, so you cannot take it away from your own role. Another admin has to.");
			}
			checkbox.on("change", () => {
				const permissions = this.permissions.map(p => p.id).filter(id => id == permission.id ? checkbox.prop("checked") : role.permissions.includes(id));
				this.saveRole(role, { description: role.description, permissions: permissions });
			});
		});

		$("<td class='admin-role-users'></td>").text(role.users).appendTo(row);

		const actions = $("<td class='admin-user-actions'></td>").appendTo(row);
		if(!role.builtin) {
			const remove = $("<button type='button' class='light-theme-button'>Delete</button>")
				.on("click", () => this.deleteRole(role))
				.appendTo(actions);
			if(yours && !this.keepsAdmin(this.yourRoles(), this.roles.filter(r => r.id != role.id))) {
				remove.prop("disabled", true).attr("title", "This role is what lets you administer users, so you cannot delete it. Another admin has to.");
			}
		}

		return row;
	}

	rolePath(role) {
		return "/admin/roles/"+encodeURIComponent(role.id);
	}

	/*
	* Function: saveRole
	* Gives the role this description and these permissions. Your own permissions may have
	* changed with it, so the page is brought in step (the menu, the agent chatbox).
	*/
	async saveRole(role, change) {
		const container = this.container;
		$(".admin-role[data-role-id='"+CSS.escape(role.id)+"'] :input", container).prop("disabled", true);
		this.setStatus("Saving the role "+role.id+"...", "info", true);
		try {
			const response = await this.request("PUT", this.rolePath(role), change);
			if(!response.ok) {
				throw new Error(await this.errorMessage(response));
			}
			const saved = await response.json();
			Object.assign(role, { description: saved.description, permissions: saved.permissions, updated_at: saved.updated_at, updated_by: saved.updated_by });
			if(container === this.container) {
				this.setStatus("Saved the role "+role.id+".", "success");
			}
			if(this.yourRoles().includes(role.id)) {
				this.sqs.userManager.checkSigninStatus();
			}
		}
		catch(error) {
			console.error("Could not save the role", error);
			if(container === this.container) {
				this.setStatus(this.failureMessage(error, "The role "+role.id+" could not be saved"), "error");
			}
		}
		if(container === this.container) {
			this.renderRoleOptions();
			this.renderRoles();
			this.renderUsers();
		}
	}

	async addRole() {
		const id = String($(".admin-add-role-id", this.container).val() || "").trim();
		const description = String($(".admin-add-role-description", this.container).val() || "").trim();
		const permissions = $(".admin-add-role-permissions input:checked", this.container).map((index, node) => $(node).val()).get();
		if(id == "") {
			return;
		}
		const container = this.container;
		this.setStatus("Creating the role "+id+"...", "info", true);
		try {
			const response = await this.request("POST", "/admin/roles", { id: id, description: description, permissions: permissions });
			if(!response.ok) {
				throw new Error(await this.errorMessage(response));
			}
			if(container !== this.container) {
				return;
			}
			$(".admin-add-role", this.container)[0].reset();
			await this.load();
			if(container === this.container) {
				this.setStatus("Created the role "+id+". Give it to users in the Users tab.", "success");
			}
		}
		catch(error) {
			console.error("Could not create the role", error);
			if(container === this.container) {
				this.setStatus(this.failureMessage(error, "The role could not be created"), "error");
			}
		}
	}

	async deleteRole(role) {
		const who = role.users > 0 ? " It is taken away from the "+this.count(role.users, "user")+" who "+(role.users == 1 ? "has" : "have")+" it." : "";
		if(!window.confirm("Delete the role "+role.id+"?"+who)) {
			return;
		}
		const container = this.container;
		this.setStatus("Deleting the role "+role.id+"...", "info", true);
		try {
			const response = await this.request("DELETE", this.rolePath(role));
			if(!response.ok) {
				throw new Error(await this.errorMessage(response));
			}
			if(this.yourRoles().includes(role.id)) {
				this.sqs.userManager.checkSigninStatus();
			}
			if(container !== this.container) {
				return;
			}
			await this.load();
			if(container === this.container) {
				this.setStatus("Deleted the role "+role.id+".", "success");
			}
		}
		catch(error) {
			console.error("Could not delete the role", error);
			if(container === this.container) {
				this.setStatus(this.failureMessage(error, "The role "+role.id+" could not be deleted"), "error");
			}
		}
	}

	setStatus(message, level = "info", working = false) {
		const status = $(".admin-status", this.container).empty();
		status.attr("class", "admin-status admin-status-"+level);
		if(working) {
			status.append("<div class='cute-little-loading-indicator'></div>");
		}
		status.append($("<span></span>").text(message));
	}

	async errorMessage(response) {
		if(response.status == 401) {
			//the session has ended; bring the menu back in step
			this.sqs.userManager.checkSigninStatus();
			return "You are no longer signed in. Please sign in again.";
		}
		if(response.status == 403) {
			this.sqs.userManager.checkSigninStatus();
		}
		try {
			const body = await response.json();
			if(body && body.error) {
				return body.error;
			}
		}
		catch(e) {
			//not a JSON error body - keep the status
		}
		return "The server answered "+response.status+".";
	}

	failureMessage(error, doing) {
		if(error instanceof TypeError) {
			return doing+": the server could not be reached.";
		}
		return doing+": "+(error && error.message ? error.message : "unknown error");
	}

	providerLabel(providerId) {
		if(providerId == null) {
			return null;
		}
		const provider = this.sqs.userManager.getProvider(providerId);
		const labels = { saml: "SEAD login", orcid: "ORCID", google: "Google", github: "GitHub" };
		return provider ? provider.label : (labels[providerId] || providerId);
	}

	formatDate(value, withTime = true) {
		const date = new Date(value);
		if(isNaN(date)) {
			return "";
		}
		const options = withTime
			? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
			: { year: "numeric", month: "short", day: "numeric" };
		return date.toLocaleString("en-GB", options);
	}

	count(n, noun) {
		return n+" "+noun+(n == 1 ? "" : "s");
	}
}

export { AdminPanel as default }
