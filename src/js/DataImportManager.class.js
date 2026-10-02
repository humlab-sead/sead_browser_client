import { saveAs } from "file-saver";

/*
Class: DataImportManager
The "Import data" dialog, for sysadmins (the account menu offers it only to them; see
UserManager). It sends an edited SEAD Data Format (SDF) workbook to json_api_server:

1. /sdf/validate checks it against the database and answers with a report, shown here.
2. If it is valid and changes something, /sdf/change-request turns it into a change request
   bundle (.zip) for sead_change_control, which is downloaded.

Nothing is written to the database by either step. The server checks the user's role itself
on both requests; the session cookie is what identifies them.
*/
class DataImportManager {
	constructor(sqs) {
		this.sqs = sqs;
		this.file = null;
		this.report = null;
		this.busy = false;
	}

	showImportDialog() {
		this.file = null;
		this.report = null;
		//a request still running from an earlier opening of the dialog no longer touches it
		this.busy = false;

		const template = document.getElementById("data-import-template");
		this.container = this.sqs.dialogManager.showPopOverFragment("Import data", template.content.cloneNode(true), { width: "760px" });

		$(".data-import-file", this.container).on("change", (event) => {
			const files = event.currentTarget.files;
			this.selectFile(files && files.length ? files[0] : null);
		});

		const dropzone = $(".data-import-dropzone", this.container);
		dropzone.on("dragover", (event) => {
			event.preventDefault();
			dropzone.addClass("data-import-dropzone-active");
		});
		dropzone.on("dragleave", () => {
			dropzone.removeClass("data-import-dropzone-active");
		});
		dropzone.on("drop", (event) => {
			event.preventDefault();
			dropzone.removeClass("data-import-dropzone-active");
			const files = event.originalEvent.dataTransfer.files;
			this.selectFile(files && files.length ? files[0] : null);
		});

		$(".data-import-validate", this.container).on("click", () => {
			this.validate();
		});
		$(".data-import-change-request", this.container).on("click", () => {
			this.createChangeRequest();
		});

		this.renderState();
	}

	selectFile(file) {
		if(this.busy) {
			return;
		}
		if(file != null && !/\.xlsx$/i.test(file.name)) {
			this.setStatus("That is not an Excel workbook (.xlsx). An SDF workbook is the .xlsx downloaded with \"Download XLSX\".", "error");
			return;
		}
		this.file = file;
		this.report = null;
		$(".data-import-report", this.container).empty();
		this.setStatus("");
		$(".data-import-file-name", this.container).text(file ? file.name+" ("+this.formatSize(file.size)+")" : "Choose an SDF workbook (.xlsx), or drop it here");
		this.renderState();
	}

	/*
	* Function: renderState
	* Check is possible once a file is chosen; a change request once that file has been checked,
	* found valid, and changes something.
	*/
	renderState() {
		const canRequest = this.report != null && this.report.ok && this.report.summary != null && !this.report.summary.empty;
		$(".data-import-validate", this.container).prop("disabled", this.busy || this.file == null);
		$(".data-import-change-request", this.container).prop("disabled", this.busy).toggle(canRequest);
		$(".data-import-file", this.container).prop("disabled", this.busy);
		$(".data-import-dropzone", this.container).toggleClass("data-import-dropzone-disabled", this.busy);
	}

	setStatus(message, level = "info", working = false) {
		const status = $(".data-import-status", this.container).empty();
		status.attr("class", "data-import-status data-import-status-"+level);
		if(working) {
			status.append("<div class='cute-little-loading-indicator'></div>");
		}
		status.append($("<span></span>").text(message));
	}

	async validate() {
		if(this.file == null || this.busy) {
			return;
		}
		const file = this.file;
		const container = this.container;
		this.report = null;
		$(".data-import-report", container).empty();
		this.setBusy(true, "Checking "+file.name+" against the database. A large workbook can take a few minutes...");

		try {
			const response = await this.upload("/sdf/validate", file);
			if(response.status != 200 && response.status != 422) {
				throw new Error(await this.errorMessage(response));
			}
			const report = await response.json();
			if(container !== this.container) {
				return;
			}
			this.report = report;
			this.renderReport(report);
			this.setStatus(this.reportVerdict(report), report.ok ? "success" : "error");
		}
		catch(error) {
			console.error("SDF validation failed", error);
			if(container === this.container) {
				this.setStatus(this.failureMessage(error, "The workbook could not be checked"), "error");
			}
		}
		finally {
			if(container === this.container) {
				this.setBusy(false);
			}
		}
	}

	async createChangeRequest() {
		if(this.file == null || this.busy) {
			return;
		}
		const file = this.file;
		const container = this.container;
		this.setBusy(true, "Creating the change request...");

		try {
			const response = await this.upload("/sdf/change-request", file);
			if(response.status == 422) {
				//Either a report (the database changed since the workbook was checked), or a
				//refusal such as a workbook whose only changes are conflicts
				const body = await response.json();
				if(container !== this.container) {
					return;
				}
				if(Array.isArray(body.errors)) {
					this.report = body;
					this.renderReport(body);
					this.setStatus(this.reportVerdict(body), "error");
				}
				else {
					this.setStatus(body.error || "No change request could be made from this workbook.", "error");
				}
				return;
			}
			if(!response.ok) {
				throw new Error(await this.errorMessage(response));
			}
			//downloaded even if the dialog was closed meanwhile: it was asked for
			const blob = await response.blob();
			saveAs(blob, this.filenameOf(response, "sdf_change_request.zip"));
			if(container === this.container) {
				this.setStatus("The change request has been downloaded. It is a bundle for sead_change_control, where it is reviewed before it is applied to SEAD.", "success");
			}
		}
		catch(error) {
			console.error("SDF change request failed", error);
			if(container === this.container) {
				this.setStatus(this.failureMessage(error, "The change request could not be created"), "error");
			}
		}
		finally {
			if(container === this.container) {
				this.setBusy(false);
			}
		}
	}

	setBusy(busy, message = null) {
		this.busy = busy;
		if(busy) {
			this.setStatus(message, "info", true);
		}
		this.renderState();
	}

	/*
	* Function: upload
	* Posts the workbook as multipart field "file", with the session cookie. A signed-out or
	* unauthorised user is answered with 401/403, which errorMessage explains.
	*/
	upload(path, file) {
		const form = new FormData();
		form.append("file", file, file.name);
		return fetch(this.sqs.config.dataServerAddress+path, {
			method: "POST",
			credentials: "include",
			body: form
		});
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
		if(response.status == 413) {
			return "The file is too large.";
		}
		return "The server answered "+response.status+".";
	}

	failureMessage(error, doing) {
		if(error instanceof TypeError) {
			return doing+": the server could not be reached.";
		}
		return doing+": "+(error && error.message ? error.message : "unknown error");
	}

	filenameOf(response, fallback) {
		const disposition = response.headers.get("Content-Disposition") || "";
		const match = disposition.match(/filename="?([^";]+)"?/);
		return match ? match[1] : fallback;
	}

	reportVerdict(report) {
		if(!report.ok) {
			const n = report.errors ? report.errors.length : 0;
			return "The workbook cannot be imported: "+this.count(n, "problem")+" must be fixed first. See below.";
		}
		if(report.summary && report.summary.empty) {
			return report.summary.conflicts > 0
				? "The workbook is valid, but its only changes conflict with changes made in SEAD since it was exported."
				: "The workbook is valid, but it changes nothing.";
		}
		return "The workbook is valid. Review the changes below, then create a change request.";
	}

	/*
	* Function: renderReport
	* The validation report: what the workbook is, what it would change, and its errors and
	* warnings. Every value from the report is inserted as text - messages quote cell values.
	*/
	renderReport(report) {
		const node = $(".data-import-report", this.container).empty();

		if(report.export) {
			const exp = report.export;
			const sites = Array.isArray(exp.site_ids) ? exp.site_ids.join(", ") : exp.site_ids;
			this.renderFacts(node, "Workbook", [
				["Exported", exp.exported_at ? String(exp.exported_at).replace("T", " ").replace(/\.\d+Z$|Z$/, " UTC") : null],
				["Exported by", exp.exported_by],
				["Sites", sites],
				["Database", [exp.database_name, exp.database_release].filter(Boolean).join(", ")],
				["Format", exp.sdf_version ? "SDF "+exp.sdf_version : null]
			]);
		}

		if(report.summary) {
			const s = report.summary;
			this.renderFacts(node, "Changes", [
				["Updated rows", s.updates],
				["New rows", s.inserts],
				["Deleted rows", s.deletes],
				["Conflicts", s.conflicts, "Rows changed both in the workbook and in SEAD since export. They are left out of the change request."],
				["Proposals", s.proposals, "Added columns or sheets, put forward for review as new database structure."],
				["Blocked", s.blocked],
				["Unchanged rows", s.unchanged_rows]
			].filter(([label, value]) => value > 0 || label == "Updated rows"));
		}

		if(Array.isArray(report.database_changes_since_export) && report.database_changes_since_export.length) {
			this.renderIssues(node, "Changes in SEAD since this workbook was exported", report.database_changes_since_export.map(change => ({
				message: change.project+": "+change.change+(change.committed_at ? " ("+String(change.committed_at).slice(0, 10)+")" : "")
			})), "info");
		}

		this.renderIssues(node, "Errors", report.errors || [], "error", report.suppressed);
		this.renderIssues(node, "Warnings", report.warnings || [], "warning", report.suppressed);
	}

	renderFacts(node, title, facts) {
		const shown = facts.filter(([label, value]) => value !== null && value !== undefined && value !== "");
		if(shown.length == 0) {
			return;
		}
		const section = $("<div class='data-import-section'></div>").appendTo(node);
		$("<h4></h4>").text(title).appendTo(section);
		const table = $("<table class='data-import-facts'></table>").appendTo(section);
		shown.forEach(([label, value, help]) => {
			const row = $("<tr></tr>").appendTo(table);
			$("<th></th>").text(label).appendTo(row);
			const cell = $("<td></td>").text(value).appendTo(row);
			if(help) {
				cell.attr("title", help);
			}
		});
	}

	renderIssues(node, title, issues, level, suppressed = {}) {
		if(issues.length == 0) {
			return;
		}
		const section = $("<div class='data-import-section'></div>").appendTo(node);
		$("<h4></h4>").text(title+" ("+issues.length+")").appendTo(section);
		const list = $("<ul class='data-import-issues data-import-issues-"+level+"'></ul>").appendTo(section);
		const codes = new Set();
		issues.forEach(issue => {
			const item = $("<li></li>").appendTo(list);
			const where = [issue.sheet, issue.cell || (issue.row ? "row "+issue.row : null)].filter(Boolean).join(" ");
			if(where) {
				$("<span class='data-import-issue-where'></span>").text(where).appendTo(item);
			}
			$("<span></span>").text(issue.message).appendTo(item);
			if(issue.code) {
				codes.add(issue.code);
			}
		});
		//the server lists at most a few issues of each kind and counts the rest
		const more = [...codes].reduce((sum, code) => sum + (suppressed && suppressed[code] ? suppressed[code] : 0), 0);
		if(more > 0) {
			$("<li class='data-import-issues-more'></li>").text("...and "+more+" more like these.").appendTo(list);
		}
	}

	count(n, noun) {
		return n+" "+noun+(n == 1 ? "" : "s");
	}

	formatSize(bytes) {
		if(bytes >= 1024 * 1024) {
			return (bytes / 1024 / 1024).toFixed(1)+" MB";
		}
		return Math.max(1, Math.round(bytes / 1024))+" kB";
	}
}

export { DataImportManager as default }
