
import * as d3 from "d3";
import Popper from "popper.js";
import Tooltip from "tooltip.js";
import tippy from 'tippy.js';
import shortid from 'shortid';
import Config from '../config/config.js';

/*
Class: DialogManager
Simple machine for handling some basic rendering of overlay/popup-dialogs.
*/
class DialogManager {
	/* 
	* Function: constructor
	*/
	constructor(hqs) {
		this.hqs = hqs;
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
			this.closeDialog();
			this.hidePopOver();
		});

		$("#popover-dialog-frame").on("click", (evt) => {
			evt.stopPropagation();
		});
		
		this.hqs.hqsEventListen("seadStateLoadComplete", () => {
			if(Config.viewstateLoadingScreenEnabled) {
				this.removeCover();
			}
		});
		this.hqs.hqsEventListen("seadStateLoadFailed", () => {
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
		$("#popover-dialog").fadeIn(100);
		this.hqs.hqsEventDispatch("popOverOpened", {
			title: title,
			content: content
		});
	}

	hidePopOver() {
		$("#popover-dialog").fadeOut(100);
		this.hqs.hqsEventDispatch("popOverClosed", {});
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
		
		d3.select("#cover-tiles").selectAll(".cover-tile").data(this.coverTiles)
			.enter()
			.append("div")
			.attr("id", (d, i) => {
				return "cover-tile-"+d.id;
			})
			.classed("cover-tile", true)
			.style("left", (d, i) => {
				return d.col * tileWidth+"vw";
			})
			.style("top", (d, i) => {
				return d.row * tileHeight+"vh";
			})
			.style("background-color", (d, i) => {
				var c = 230 + (Math.random()*10);
				c = Math.round(c);
				return "rgb("+c+", "+c+", "+c+")";
			})
			.style("width", (tileWidth+0.01)+"vw")
			.style("height", (tileHeight+0.01)+"vh");
		
		d3.select("#cover-tiles").append("div")
			.attr("id", "cover-tiles-logo");
		
		if(text != "") {
			d3.select("#cover-tiles").append("div")
				.attr("id", "cover-tiles-text")
				.text(text);
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
	
	hqsMenu() {

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
						//window.sead.dialogManager.renderDialog("#about-section");
						var content = $("#about-section > .overlay-dialog-content").html();
						content = $(content);
						$("#data-license-section", content).text(Config.dataLicense.name).attr("href", Config.dataLicense.url);
						window.hqs.dialogManager.showPopOver("About", content);
					}
				},
				{
					name: "team",
					title: "<i class=\"fa fa-user-circle\" aria-hidden=\"true\"></i> Team",
					callback: () => {
						//window.sead.dialogManager.renderDialog("#team-section");
						var content = $("#team-section > .overlay-dialog-content").html();
						window.hqs.dialogManager.showPopOver("Team", content);
					}
				}
			]
		};
	}
	
}

export { DialogManager as default }