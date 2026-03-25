//import Config from '../config/config.js';
import Dropzone from 'dropzone';
/*
Class: DialogManager
Simple machine for handling some basic rendering of overlay/popup-dialogs.
*/
class DialogManager {
	/* 
	* Function: constructor
	*/
		constructor(sqs) {
			this.sqs = sqs;
			this.coverActive = false;
			this.coverTiles = [];
			this.coverTilesNum = 12;
			this.tooltips = [];
			this.importDropzone = null;
		
		$(".popover-close-btn").on("click", () => {
			this.hidePopOver();
		});

		$("#popover-dialog-frame").on("click", (evt) => {
			evt.stopPropagation();
		});

		$("#popover-dialog").on("click", () => {
			this.hidePopOver();
		});

		$("#quickstart-what-is-sead").on("click", () => {
			const content = `
				<p>SEAD — the Strategic Environmental Archaeology Database — is an open-access research infrastructure for 
				archaeological and palaeoenvironmental data. It stores, manages, and makes available a wide range of datasets 
				focused on how past human societies interacted with their natural environment.</p>
				<p>The database contains records from across northern Europe and beyond, covering evidence from biological 
				proxies such as pollen, insects, plants, and vertebrates, as well as dendrochronological and other 
				environmental data tied to archaeological sites.</p>
				<p>Using the SEAD browser you can:</p>
				<ul>
					<li>Search and filter archaeological sites by domain, time period, location, and more.</li>
					<li>Browse datasets and samples associated with each site.</li>
					<li>Export results in multiple formats for use in your own research.</li>
				</ul>
				<p>SEAD is free to use and all data is openly available for research and education.</p>
			`;
			this.showPopOver("What is SEAD?", content, { width: "600px" });
		});

		$("#quickstart-data-in-sead").on("click", () => {
			const content = `
				<p>Data in SEAD is organised in a three-level hierarchy:</p>
				<p style="text-align:center; font-size:1.1em;"><strong>Site &rarr; Sample group &rarr; Sample</strong></p>
				<ul>
					<li><strong>Site</strong> — a geographical or archaeological location where fieldwork took place, 
					such as an excavation, a lake, or a bog. Sites are the primary unit you search and filter in the browser.</li>
					<li><strong>Sample group</strong> — a logical collection of samples from the same context within a site, 
					e.g. a sediment core, a trench, or a stratigraphic unit.</li>
					<li><strong>Sample</strong> — an individual physical or analytical unit from which data were obtained, 
					e.g. a sediment slice, a single find, or a wood specimen.</li>
				</ul>
				<p>The <strong>filters</strong> in the left panel filter the list of <strong>sites</strong>. Once you find sites 
				of interest, click a site in the result section (table or map view) to open its <strong>landing page</strong>, where you can explore 
				all associated sample groups and their individual samples in detail.</p>
			`;
			this.showPopOver("Data in SEAD", content, { width: "600px" });
		});
		
		$("#quickstart-feedback").on("click", () => {
			const content = `
				<p>Hi! I am Johan von Boer, the frontend developer of the SEAD browser, and I want to hear your feedback. If you have any suggestions, encounter any issues, or just want to share your thoughts, please email me!</p>
				<p>You can reach me at <a href="mailto:johan.von.boer@umu.se">johan.von.boer@umu.se</a>.</p>
			`;
			this.showPopOver("Feedback", content, { width: "600px" });
		});

		this.sqs.sqsEventListen("seadStateLoadComplete", () => {
			if(Config.viewstateLoadingScreenEnabled) {
				this.removeCover();
			}
		});
		this.sqs.sqsEventListen("seadStateLoadFailed", () => {
			if(Config.viewstateLoadingScreenEnabled) {
				this.removeCover();
			}
		});
		
		
		var newVisitor = false;
		if(newVisitor) {
			$("#header-space").animate({"height": "50vh"}, 1000);
			$("#header-container").css("align-items", "flex-end");
		}
		
	}
	
	showPopOver(title, content, options = {}) {

		$("#popover-dialog").css("grid-template-columns", "5% 1fr 5%");
		$("#popover-dialog").css("grid-template-rows", "5% 1fr 5%");

		if(options.width) {
			$("#popover-dialog-frame").css("width", options.width);
		}
		if(options.height) {
			$("#popover-dialog-frame").css("height", options.height);
		}
		if(options.margin) {
			$("#popover-dialog").css("grid-template-columns", options.margin+" 1fr "+options.margin);
			$("#popover-dialog").css("grid-template-rows", options.margin+" 1fr "+options.margin);
		}

		if(title == "") {
			$("#popover-dialog-frame > h1").hide();
		}
		else {
			$("#popover-dialog-frame > h1").text(title);
			$("#popover-dialog-frame > h1").show();
		}

		$("#popover-dialog-frame > .popover-content").html(content);
		$("#popover-dialog").css("display", "grid");
		//$("#popover-dialog-frame").hide();
		$("#popover-dialog").show();
		//$("#popover-dialog-frame").slideDown(100);
		this.sqs.sqsEventDispatch("popOverOpened", {
			title: title,
			content: content
		});

		return $("#popover-dialog-frame > .popover-content");
	}

	showPopOverFragment(title, fragment, options = {}) {
		$("#popover-dialog").css("grid-template-columns", "5% 1fr 5%");
		$("#popover-dialog").css("grid-template-rows", "5% 1fr 5%");

		if(options.width) {
			$("#popover-dialog-frame").css("width", options.width);
		}
		if(options.height) {
			$("#popover-dialog-frame").css("height", options.height);
		}
		if(options.margin) {
			$("#popover-dialog").css("grid-template-columns", options.margin+" 1fr "+options.margin);
			$("#popover-dialog").css("grid-template-rows", options.margin+" 1fr "+options.margin);
		}

		if(title == "") {
			$("#popover-dialog-frame > h1").hide();
		}
		else {
			$("#popover-dialog-frame > h1").text(title);
			$("#popover-dialog-frame > h1").show();
		}

		// Clear previous content and append the fragment/node
		const contentContainer = $("#popover-dialog-frame > .popover-content");
		contentContainer.empty();
		// If fragment is a DocumentFragment or Node, append it
		if (fragment instanceof DocumentFragment || fragment instanceof Node) {
			contentContainer[0].appendChild(fragment);
		} else if (typeof fragment === "string") {
			// fallback: if a string is passed, set as HTML
			contentContainer.html(fragment);
		}

		$("#popover-dialog").css("display", "grid");
		$("#popover-dialog").show();

		this.sqs.sqsEventDispatch("popOverOpened", {
			title: title,
			content: fragment
		});

		return contentContainer;
	}

	hidePopOver() {
		$("#popover-dialog").hide();
		$("#popover-dialog-frame").css("width", "");
		$("#popover-dialog-frame").css("height", "");
		this.sqs.sqsEventDispatch("popOverClosed", {});
	}

	/* 
	* Function: renderDialog
	* 
	* Renders the given dialog. Note that the dialog must already exist as a DOM object in the document. This function doesn not create any HTML/DOM-objects, it just makes them visible and inserts some data.
	*
	* Parameters:
	* dialogDomId - The DOM ID or XPath to your dialog.
	* vars - An array of objects containing key/value pairs to dynamically insert into the dialog template.
	* 
	*/
	renderDialog(dialogDomId, vars = []) {
		var dialog = $(dialogDomId);

		for(var key in vars) {
			dialog.find(vars[key].key).html(vars[key].value);
		}

		//$(".dialog-container").html("").append(dialog);
		dialog.fadeIn(100);
		this.dialogOpenedTime = Date.now();
	}

	/* 
	* Function: closeDialog
	* 
	* Parameters:
	* notIfYoungerThan - Will not close if less than this time (in ms) has elapsed since the dialog was opened. Used to get around a minor menu issue, nothing you need to worry about, probably...
	*/
	closeDialog(notIfYoungerThan = 500) {
		if(Date.now() - this.dialogOpenedTime > notIfYoungerThan) {
			$(".overlay-dialog").fadeOut(100);
		}
	}
	
	setCover(text = "") {
		
		if(this.coverActive) {
			return false;
		}
		
		var tileWidth = 100.0 / parseFloat(this.coverTilesNum);
		var tileHeight = 100.0 / parseFloat(this.coverTilesNum);
		
		for(var i = 0; i < this.coverTilesNum; i++) {
			for(var j = 0; j < this.coverTilesNum; j++) {
				this.coverTiles.push({
					id: i + "-" + j,
					col: i,
					row: j
				});
			}
		}
		
		$("#cover-tiles").show();


		for(let key in this.coverTiles) {
			let tile = this.coverTiles[key];
			let tileNode = $("<div></div>");
			tileNode.addClass("cover-tile");
			tileNode.attr("id", "cover-tile-"+tile.id);
			tileNode.css("background-color", () => {
				var c = 230 + (Math.random()*10);
				c = Math.round(c);
				return "rgb("+c+", "+c+", "+c+")";
			})
			tileNode.css("top", tile.row * tileHeight+"vh");
			tileNode.css("left", tile.col * tileWidth+"vw");
			tileNode.css("width", (tileWidth+0.01)+"vw");
			tileNode.css("height", (tileHeight+0.01)+"vh");
			$("#cover-tiles").append(tileNode);
		}

		let logoNode = $("<div></div>");
		logoNode.attr("id", "cover-tiles-logo");
		$("#cover-tiles").append(logoNode);

		if(text != "") {
			let textNode = $("<div></div>").attr("id", "cover-tiles-text").text(text);
			$("#cover-tiles").append(textNode);
		}
		
		this.coverActive = true;
	}
	
	setCoverTileTimeout(tile) {
		setTimeout(() => {
			$("#cover-tile-"+tile.id).animate({
				backgroundColor: "#888"
			}, 50);
			$("#cover-tile-"+tile.id).fadeOut(200, () => {
				$("#cover-tile-"+tile.id).remove();
				for(var key in this.coverTiles) {
					if(this.coverTiles[key].id == tile.id) {
						this.coverTiles.splice(key, 1);
					}
				}
			});
		}, ((1+Math.random()) * 100) + (tile.row+1) * 40);
	
	}
	
	removeCover() {
		for(var key in this.coverTiles) {
			var tile = this.coverTiles[key];
			this.setCoverTileTimeout(tile);
		}
		
		$("#cover-tiles-logo").animate({
			top: "-100vh"
		}, 500, () => {
			$("#cover-tiles-logo").remove();
		});
		
		if($("#cover-tiles-text").length > 0) {
			$("#cover-tiles-text").animate({
				top: "200vh"
			}, 500, () => {
				$("#cover-tiles-text").remove();
			});
		}
		setTimeout(() => {
			$("#cover-tiles").hide();
		}, 750);
		
		this.coverActive = false;
	}


	/**
	 * var content = $("#gdpr-infobox").html();
		window.sqs.dialogManager.showPopOver("Legal policy", content);
	 */
	
	sqsMenu() {

		return {
			title: "About",
			layout: "vertical",
			collapsed: true,
			anchor: "#help-menu",
			weight: -5,
			items: [
				{
					name: "about",
					title: "<i class=\"fa fa-info-circle\" aria-hidden=\"true\"></i> About",
					callback: () => {
						var content = $("#about-section > .overlay-dialog-content").html();
						content = $(content);
						
						$("#data-license-section", content).text(Config.dataLicense.name).attr("href", Config.dataLicense.url);
						window.sqs.dialogManager.showPopOver("About", content, {
							width: "700px"
						});
					}
				},
				{
					name: "legal",
					title: "<i class=\"fa fa-file-text-o\" aria-hidden=\"true\"></i> Legal",
					callback: () => {
						var content = $("#gdpr-infobox > .overlay-dialog-content").html();
						window.sqs.dialogManager.showPopOver("Legal policy", content, {
							width: "700px"
						});
					}
				},
				{
					name: "import",
					visible: false,
					title: "<i class=\"fa fa-file-text-o\" aria-hidden=\"true\"></i> Import data",
					callback: () => {
						const content = $("#import-dialog").html();
						const popoverContent = window.sqs.dialogManager.showPopOver("Import data", content);
						const importContainer = popoverContent.find(".dropzone").get(0);
						if (!importContainer) {
							console.warn("Import container not found in popover content");
							return;
						}

						// Keep one Dropzone instance and recreate it for the current popover content.
						if (this.importDropzone) {
							this.importDropzone.destroy();
							this.importDropzone = null;
						}

						this.importDropzone = new Dropzone(importContainer, {
							url: "/fake-url-for-dropzone",
							autoProcessQueue: false,
							acceptedFiles: ".xlsx",
							init: function() {
								this.on("addedfile", function(file) {
									console.log("File added to Dropzone:", file);
									window.sqs.sqsEventDispatch("dataImportFileDropped", {
										file: file
									});
									this.removeFile(file);
								});
							}
						});
					}
				}
			]
		};
	}
	
}

export { DialogManager as default }
