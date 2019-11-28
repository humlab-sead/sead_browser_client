/*
* Class: HqsLayoutManager
* This class is responsible for adapting the user interface to various devices and their capabilities, primarily in terms of screen space.
* It relies on the Enquire js lib which in turn relies on CSS3 media queries.
*
* Assumed entities:
* .section-toggle-button
* .section-right
* .section-left
* ...and more?
*/

import enquire from 'enquire.js'

class HqsLayoutManager {

	constructor(hqs, anchor, leftSize = 70, rightSize = 30, options = {}) {
		this.hqs = hqs;
		this.anchor = anchor;
		this.leftInitSize = leftSize;
		this.rightInitSize = rightSize;
		this.leftLastSize = leftSize;
		this.righLastSize = rightSize;
		this.options = options;
		
		$(this.anchor).css("display", "flex");
		
		

		//Transition to small-screen mode at this width (in pixels)
		this.screenMobileWidthBreakPoint = 720;
		this.screenLargeWidthBreakPoint = 2000;

		this.mobileBreakpointMediaQuery = "screen and (max-width:"+this.screenMobileWidthBreakPoint+"px)";
		//this.screenBreakpointMediaQuery = "screen and (min-width:"+this.screenLargeWidthBreakPoint+"px)";
		
		this.hqs.hqsEventListen("hqsInitComplete", () => {
			this.setupResizableSections();
			this.setSectionSizes(leftSize, rightSize, false);

			enquire.register(this.mobileBreakpointMediaQuery, {
				match : () => {
					console.log("Mobile mode enabled");
					
					this.switchSection("left");
					this.toggleToggleButton(true);
					//$("#sead-logo").removeClass("sead-logo-large").addClass("sead-logo-small");
					$("#sead-logo").hide();
					$("#aux-menu").hide();
					this.hqs.hqsEventDispatch("layoutChange", "mobileMode");
	
					
					//$("#facetMenu").hide();
					//$(".facetMenuItemsContainer").css("position", "relative").css("box-shadow", "none");
					//$("#facet-menu-mobile-container").show();
					this.hqs.hqsEventDispatch("layoutResize");
				},
				unmatch : () => {
					console.log("Desktop mode enabled");
					
					$(this.anchor+" > .section-left").removeClass("full-section");
					$(this.anchor+" > .section-right").removeClass("full-section");
					$(this.anchor+" > .section-left").removeClass("hidden-section");
					$(this.anchor+" > .section-right").removeClass("hidden-section");
					this.toggleToggleButton(false);
					$(".ui-resizable-handle").show();
					console.log(this.leftInitSize, this.rightInitSize);
					this.setSectionSizes(this.leftInitSize, this.rightInitSize, false);
					//$("#sead-logo").removeClass("sead-logo-small").addClass("sead-logo-large");
					$("#sead-logo").show();
					$("#aux-menu").show();
					this.hqs.hqsEventDispatch("layoutChange", "desktopMode");
					this.hqs.hqsEventDispatch("layoutResize");
				}
			});

		});
		
		//Bind actions for clicking on the panel toggle button
		$("#section-toggle-button", this.anchor).bind("click", () => {
			//Just toggles which section is shown based on which one is currently shown/hidden
			if($(this.anchor+" > .section-right").css("display") == "none") {
				this.switchSection("right");
			}
			else {
				this.switchSection("left");
			}
		});

		/*
		$(window).on("seadStateLoad", (event, data) =>  {
			this.setSectionSizes(data.state.layout.left, 100-data.state.layout.left, false);
		});
		*/

		//React to resize event to collapse header when necessary
		this.hqs.hqsEventListen("layoutResize", () => {
			/*
			let headerWidth = $("#header-space").width();
			console.log(headerWidth);
			if(headerWidth < 350) {
				//Switch to smaller logo
				$("#sead-logo").removeClass("sead-logo-large").addClass("sead-logo-small");
			}
			else {
				$("#sead-logo").removeClass("sead-logo-small").addClass("sead-logo-large");
			}
			*/
		});
	}

	/*
	compressHeader() {
		$("#header-container").animate({
			height: "40px"
		}, 500);
	}
	*/


	/**
	* Function: toggleToggleButton
	* Toggles the showing/hiding of the toggle-section button (in small screen mode)
	*/
	toggleToggleButton(show) {
		if(show) {
			$("#section-toggle-button").show();
		}
		else {
			$("#section-toggle-button").hide();
		}
	}

	/**
	* Function: switchSection
	* Takes care of everything needing to be done when switching between left/right sections in small-screen mode
	**/
	switchSection(section) {
		console.log("switchSection");

		this.hqs.hqsEventDispatch("layoutResize");
		
		$(".ui-resizable-handle").hide();

		$(this.anchor+" > .section-left").removeClass("full-section");
		$(this.anchor+" > .section-right").removeClass("full-section");
		$(this.anchor+" > .section-left").removeClass("hidden-section");
		$(this.anchor+" > .section-right").removeClass("hidden-section");
		
		var hideSection = null;
		var showSection = null;
		
		if(section == "left") {
			showSection = $(this.anchor+" > .section-left");
			hideSection = $(this.anchor+" > .section-right");
			$("#facet-menu").show();
			$("#sead-logo").hide();
		}
		else {
			hideSection = $(this.anchor+" > .section-left");
			showSection = $(this.anchor+" > .section-right");
			$("#facet-menu").hide();
			$("#sead-logo").show();
		}

		showSection.addClass("full-section");
		//showSection.css("width", "100vw");
		hideSection.addClass("hidden-section");
	}

	setSectionSizes(leftSize, rightSize, animate = true) {

		this.leftLastSize = leftSize;
		this.righLastSize = rightSize;

		if(animate) {
			$(this.anchor+" > .section-left").animate(
				{
					width: leftSize+"vw"
				},
				250,
				"easeOutCubic"
			);

			$(this.anchor+" > .section-right").animate(
				{
					width: rightSize+"vw"
				},
				250,
				"easeOutCubic"
			);
		}
		else {
			$(this.anchor+" > .section-left").css("width", leftSize+"vw");
			$(this.anchor+" > .section-right").css("width", rightSize+"vw");
		}
		
		if(rightSize == 0) {
			$(this.anchor+" > .section-right").css("display", "none");
			$(".ui-resizable-handle").hide();
		}
		else {
			$(this.anchor+" > .section-right").css("display", "block");
			$(".ui-resizable-handle").show();
		}
	}

	calculateWidthsAsPercentage() {
		var totalWidth = $(document).width();
		var leftWidth = $(this.anchor+" .section-left").width();
		var rightSectionWidth = totalWidth - leftWidth;
		var rightWidthPercent = (rightSectionWidth / totalWidth) * 100;
		var leftWidthPercent = 100 - rightWidthPercent;

		return {
			left: leftWidthPercent,
			right: rightWidthPercent
		};
	}

	/**
	* Function: setupResizableSections
	* Does what it says on the tin.
	**/
	setupResizableSections() {
		$(this.anchor+" > .section-left").resizable({
			handles: "e",
			resize: (event, ui) => {
				//Slave right section to being the inverse size of the left section
				/*
				var totalWidth = $(document).width();
				var rightSectionWidth = totalWidth - ui.size.width;
				var rightWidthPercent = (rightSectionWidth / totalWidth) * 100;
				var leftWidthPercent = 100 - rightWidthPercent;
				*/
				var wp = this.calculateWidthsAsPercentage();
				$(this.anchor+" > .section-left").css("width", wp.left+"vw");
				$(this.anchor+" > .section-right").css("width", wp.right+"vw");
			}
		}).on("resize", (e) => {
			this.hqs.hqsEventDispatch("layoutResize", e);
			//This was to prevent an issue with section-resize events being propagated as window-resize events
			e.stopPropagation();

			var wp = this.calculateWidthsAsPercentage();
			this.leftLastSize = wp.left;
			this.rightLastSize = wp.right;
		});
		
		$(window).on("resize", (evt) => {
			this.hqs.hqsEventDispatch("layoutResize", evt);
		});
	}

	static removeResizable() {
		$("#section-left").resizable("destroy");
	}
	
	destroy() {
		//enquire.unregister(this.mobileBreakpointMediaQuery);
		//enquire.unregister(this.screenBreakpointMediaQuery);
	}

}

export { HqsLayoutManager as default }
