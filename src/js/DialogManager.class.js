//import Config from '../config/config.js';

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
		
		$(".popover-close-btn").on("click", () => {
			this.hidePopOver();
		});

		/*
		$(".overlay-dialog-close-btn").bind("click", function() {
			$(".overlay-dialog").hide();
		});
		*/
		$("body").on("click", (evt) => {
			console.log(evt);
			//evt.stopPropagation();
			this.closeDialog();
			this.hidePopOver();
		});

		$("#popover-dialog-frame").on("click", (evt) => {
			evt.stopPropagation();
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
	
	showPopOver(title, content) {
		$("#popover-dialog-frame > h1").text(title);
		$("#popover-dialog-frame > .popover-content").html(content);
		$("#popover-dialog").css("display", "grid").hide();
		$("#popover-dialog-frame").hide();
		$("#popover-dialog").show();
		$("#popover-dialog-frame").slideDown(100);
		this.sqs.sqsEventDispatch("popOverOpened", {
			title: title,
			content: content
		});

		return $("#popover-dialog-frame > .popover-content");
	}

	hidePopOver() {
		$("#popover-dialog").fadeOut(100);
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
						window.sqs.dialogManager.showPopOver("About", content);
					}
				},
				{
					name: "team",
					title: "<i class=\"fa fa-user-circle\" aria-hidden=\"true\"></i> Team",
					callback: () => {
						var content = $("#team-section > .overlay-dialog-content").html();
						window.sqs.dialogManager.showPopOver("Team", content);
					}
				},
				{
					name: "legal",
					title: "<i class=\"fa fa-file-text-o\" aria-hidden=\"true\"></i> Legal",
					callback: () => {
						var content = $("#gdpr-infobox").html();
						window.sqs.dialogManager.showPopOver("Legal policy", content);
					}
				}
			]
		};
	}
	
}

export { DialogManager as default }