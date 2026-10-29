/*
* Class: sqsView
* This class is responsible for adapting the user interface to various devices and their capabilities, primarily in terms of screen space.
* It relies on the Enquire js lib which in turn relies on CSS3 media queries.
*
* Important: This class has some severe limitations:
* 1. It only handles a 2-pane left/right layout
* 2. It only handles a single page/view - meaning the Filter/result view and the site repots each have their own separate Views
*
* Assumed entities:
* .section-toggle-button
* .section-right
* .section-left
* ...and more?
*/

import enquire from 'enquire.js'

class SqsView {

    /*
    * Function: constructor
    */
	constructor(layoutManager, anchor, name, leftSize = 70, rightSize = 30, options = {}) {
        this.layoutManager = layoutManager;
        this.sqs = layoutManager.sqs;
        this.anchor = anchor;
        this.name = name;
		this.leftInitSize = leftSize;
		this.rightInitSize = rightSize;
		this.leftLastSize = leftSize;
		this.righLastSize = rightSize;
		this.options = options;
		this.visibleSection = "both"; //enum "left", "right", "both"
		this.minSectionWidth = 12; //Minimum width of a section in viewport percentage terms
        
        this.setDefaultOptionValue("display", true);
        this.setDefaultOptionValue("collapseIntoVertial", false);
        this.setDefaultOptionValue("showElements", []);
        this.setDefaultOptionValue("hideElements", []);

        $(this.anchor).css("display", "none"); //This should be "flex" when view is activated
		
		//console.log("Init of new View", this.anchor);

		//this.mobileBreakpointMediaQuery = "screen and (max-width:"+Config.screenMobileWidthBreakPoint+"px)";

		this.setupResizableSections();
		this.setSectionSizes(leftSize, rightSize, false);

		this.initSwitchSectionToggle();
		this.initShowOnlyLeftSectionToggle();
		this.initShowOnlyRightSectionToggle();
		this.updateSectionCollapseButtons();

		//React to resize event to collapse header when necessary
		this.sqs.sqsEventListen("layoutResize", () => {
		});
    }
    
    
    apply() {
		//FIXME: When site report is being exited then setView(Fitlers) is being called, which takes us back - not to the fitlers btu to the reuslt section (in mobile mode), which is not techincally wrong, but the rules for this view doesnt account for this
		console.log("View "+this.name, "applying", this.layoutManager.getMode());
        $(this.anchor).css("display", "flex"); //used to be 'flex'
		$(this.anchor).css("visibility", "visible");

        if(this.layoutManager.getMode() == "mobileMode") {
            if(this.options.collapseIntoVertial === true) {
                if(this.getVisibleSection() == "both") {
					this.switchSection("left");
				}
                //Also move all the stuff from the right section over to the left here
                let rightContents = $(".section-right", this.anchor).children();
                $(".site-report-title-container", this.anchor).append(rightContents);
            }
            else {
				if(this.getVisibleSection() == "both") {
					this.switchSection("left");
				}
                
                this.toggleToggleButton(true);
				this.toggleSectionCollapseButtons(false);
            }
        }

        if(this.layoutManager.getMode() == "desktopMode") {
            if(this.options.collapseIntoVertial === true) {
                let rightContents = $("#site-report-right-container", this.anchor);
                $(".section-right", this.anchor).append(rightContents);
            }
            else {
                this.toggleToggleButton(false);
				this.toggleSectionCollapseButtons(true);
			}
			if(this.getVisibleSection() != "both") {
				this.switchSection("both");
			}
            $(".ui-resizable-handle").show();
            this.setSectionSizes(this.leftInitSize, this.rightInitSize, true);
			this.updateSectionCollapseButtons();
		}
		
		for(let key in this.options.rules) {
            let evaluation = this.options.rules[key].evaluator;
            if(typeof evaluation == "undefined") {
                evaluation = true;
            }
            if(typeof evaluation == "function") {
                evaluation = evaluation();
            }
            //console.log(this.options.showElements[key].anchor, evaluation);
            if(evaluation) {
                $(this.options.rules[key].selector).show();
            }
            else {
                $(this.options.rules[key].selector).hide();
            }
        }
    }

    cleanup() {
        console.log(this.name, "cleanup");
    }
	
    /*
    * Function: getMode
    */
	getMode() {
		return this.mode;
	}


	/**
	* Function: toggleToggleButton
	* Toggles the showing/hiding of the toggle-section button (in small screen mode)
	*/
	toggleToggleButton(show) {
		const toggleButton = $("#switch-section-button", this.anchor);
		if(toggleButton.length == 0) {
			return;
		}

		if(show) {
			toggleButton.show();
			this.updateSwitchSectionButton();
		}
		else {
			toggleButton.hide();
		}
	}

	/**
	* Function: switchSection
	* Takes care of everything needing to be done when switching between left/right sections in small-screen mode
	**/
	switchSection(section) {
		this.setVisibleSection(section);
		this.apply();

		console.log("switchSection", section);
		
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
			showSection.addClass("full-section");
			hideSection.addClass("hidden-section");
			//$("#facet-menu").show(); //NOPE - Not in the site reports!
			//$("#sead-logo").hide();
		}
		else if(section == "right") {
			hideSection = $(this.anchor+" > .section-left");
			showSection = $(this.anchor+" > .section-right");
			showSection.addClass("full-section");
			hideSection.addClass("hidden-section");
			//$("#facet-menu").hide();
			//$("#sead-logo").show();
		}
		else if(section == "both") {
			$(this.anchor+" > .section-left").removeClass("full-section");
			$(this.anchor+" > .section-right").removeClass("full-section");
			$(this.anchor+" > .section-left").removeClass("hidden-section");
			$(this.anchor+" > .section-right").removeClass("hidden-section");
		}

		this.apply();
		this.sqs.sqsEventDispatch("layoutResize");
		this.updateSwitchSectionButton();
	}

	getVisibleSection() {
		return this.visibleSection;
	}

	setVisibleSection(section) {
		this.visibleSection = section;
	}

    /*
    * Function: setSectionSizes
    */
	setSectionSizes(leftSize, rightSize, animate = true) {
		//console.log("Set section sizes:", leftSize, rightSize);
		this.leftLastSize = leftSize;
		this.rightLastSize = rightSize;

		const container = $(this.anchor);

		if(leftSize < this.minSectionWidth) {
			leftSize = 0;
			rightSize = 100;
			this.visibleSection = "right";
		}
		else if(rightSize < this.minSectionWidth) {
			rightSize = 0;
			leftSize = 100;
			this.visibleSection = "left";
		}
		else {
			this.visibleSection = "both";
		}

		//The width transition is only switched on for these programmatic changes, so that dragging and window resizing are not animated
		clearTimeout(this.sectionAnimationTimeout);
		container.toggleClass("sections-animating", animate);

		this.applySectionWidths(leftSize, rightSize);

		//send event - but wait for css animation to complete
		if(animate) {
			this.sectionAnimationTimeout = setTimeout(() => {
				container.removeClass("sections-animating");
				this.sqs.sqsEventDispatch("layoutResize");
			}, 300);
		}
		else {
			this.sqs.sqsEventDispatch("layoutResize");
		}
	}

	/*
	* Function: applySectionWidths
	* The section widths are derived in CSS from a single custom property on the container, so this is all that needs doing while dragging
	*/
	applySectionWidths(leftSize, rightSize) {
		const container = document.querySelector(this.anchor);
		if(container) {
			container.style.setProperty("--section-left-width", leftSize + "vw");
		}
		this.updateDividerState(leftSize, rightSize);
	}

    /*
    * Function: calculateWidthsAsPercentage
    */
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

	updateSwitchSectionButton() {
		const toggleBtn = $("#switch-section-button", this.anchor);
		if(toggleBtn.length == 0) {
			return;
		}

		const nextSection = this.visibleSection == "right" ? "left" : "right";
		const label = nextSection == "right" ? "Show result" : "Show filters";

		toggleBtn.text(label);
		toggleBtn.attr("title", label);
		toggleBtn.attr("aria-label", label);
	}

	toggleSectionCollapseButtons(show) {
		$(this.anchor + " > .section-divider").toggleClass("section-divider-active", show);
		if(show) {
			this.updateSectionCollapseButtons();
		}
	}

	/**
	* Function: updateDividerState
	* Marks on the divider which section, if any, is collapsed, so that the drag handle and the collapse buttons can stay on screen
	**/
	updateDividerState(leftSize, rightSize) {
		const divider = document.querySelector(this.anchor + " > .section-divider");
		if(!divider) {
			return;
		}
		divider.classList.toggle("left-section-collapsed", leftSize === 0);
		divider.classList.toggle("right-section-collapsed", rightSize === 0);
	}

	updateSectionCollapseButtons() {
		const leftToggleBtn = $("#filter-section-toggle-button-left", this.anchor);
		const rightToggleBtn = $("#filter-section-toggle-button-right", this.anchor);
		if(leftToggleBtn.length == 0 && rightToggleBtn.length == 0) {
			return;
		}

		const desktopMode = this.layoutManager.getMode() == "desktopMode";
		$(this.anchor + " > .section-divider").toggleClass("section-divider-active", desktopMode);
		if(!desktopMode) {
			return;
		}

		this.updateDividerState(this.visibleSection === "right" ? 0 : null, this.visibleSection === "left" ? 0 : null);

		//When a section is collapsed, only the button which brings it back is shown
		leftToggleBtn.toggle(this.visibleSection !== "left");
		rightToggleBtn.toggle(this.visibleSection !== "right");

		const leftTitle = this.visibleSection === "right" ? "Show both sections" : "Show only result section";
		const rightTitle = this.visibleSection === "left" ? "Show both sections" : "Show only filter section";
		leftToggleBtn.attr('title', leftTitle);
		leftToggleBtn.attr('aria-label', leftTitle);
		rightToggleBtn.attr('title', rightTitle);
		rightToggleBtn.attr('aria-label', rightTitle);
	}

	initShowOnlyLeftSectionToggle() {
		const toggleBtn = $("#filter-section-toggle-button-left", this.anchor);
		if(toggleBtn.length == 0) {
			return;
		}

		toggleBtn.off("click.sqs-view-show-only-left");
		toggleBtn.on("click.sqs-view-show-only-left", () => {
			const isCollapsed = this.leftLastSize === 0;

			if(isCollapsed) {
				const leftSize = this.leftInitSize || 30;
				const rightSize = 100 - leftSize;
				this.setSectionSizes(leftSize, rightSize, true);
			}
			else {
				this.setSectionSizes(0, 100, true);
			}

			this.updateSectionCollapseButtons();
		});
	}

	initShowOnlyRightSectionToggle() {
		const toggleBtn = $("#filter-section-toggle-button-right", this.anchor);
		if(toggleBtn.length == 0) {
			return;
		}

		toggleBtn.off("click.sqs-view-show-only-right");
		toggleBtn.on("click.sqs-view-show-only-right", () => {
			const isCollapsed = this.rightLastSize === 0;

			if(isCollapsed) {
				const rightSize = this.rightInitSize || 30;
				const leftSize = 100 - rightSize;
				this.setSectionSizes(leftSize, rightSize, true);
			}
			else {
				this.setSectionSizes(100, 0, true);
			}

			this.updateSectionCollapseButtons();
		});
	}

	initSwitchSectionToggle() {
		const toggleBtn = $("#switch-section-button", this.anchor);
		if(toggleBtn.length == 0) {
			return;
		}

		toggleBtn.off("click.sqs-view-switch-section");
		toggleBtn.on("click.sqs-view-switch-section", () => {
			const nextSection = this.visibleSection == "right" ? "left" : "right";
			this.switchSection(nextSection);
		});

		this.updateSwitchSectionButton();
	}

	/**
	* Function: setupResizableSections
	* Does what it says on the tin.
	**/
	setupResizableSections() {
		// Create a custom drag handle - it lives in the divider, which sits on the boundary between the sections and does not scroll with them
		const dragHandle = $('<div class="custom-resize-handle"></div>');
		const divider = $(this.anchor + " > .section-divider");
		if(divider.length > 0) {
			divider.prepend(dragHandle);
		}
		else {
			$(this.anchor + " > .section-left").append(dragHandle);
		}

		let isDragging = false;
		let initialX, initialLeftWidth, totalWidth, isExpandingFromCollapsed;
		let pendingClientX = null;
		let frameRequest = null;
		const container = $(this.anchor);

		// Applies the latest mouse position - at most once per frame, and without reading any layout, which would force the browser to lay out the result section synchronously
		const applyDrag = () => {
			frameRequest = null;
			const deltaX = pendingClientX - initialX;

			let leftWidthPercent;
			if (isExpandingFromCollapsed) {
				// When expanding from collapsed, we want positive movement to expand
				leftWidthPercent = (Math.max(0, deltaX) / totalWidth) * 100;
			} else {
				leftWidthPercent = ((initialLeftWidth + deltaX) / totalWidth) * 100;
			}
			let rightWidthPercent = 100 - leftWidthPercent;

			// Handle minimum threshold for collapsing
			if(leftWidthPercent < this.minSectionWidth && !isExpandingFromCollapsed) {
				leftWidthPercent = 0;
				rightWidthPercent = 100;
			}
			else if(rightWidthPercent < this.minSectionWidth) {
				leftWidthPercent = 100;
				rightWidthPercent = 0;
			}

			this.applySectionWidths(leftWidthPercent, rightWidthPercent);

			// Store the new values
			this.leftLastSize = leftWidthPercent;
			this.rightLastSize = rightWidthPercent;
		};

		// Mouse down event - start dragging
		dragHandle.on('mousedown', (e) => {
			isDragging = true;
			initialX = e.clientX;
			// Layout is only read here, once, rather than on every move
			totalWidth = container.width();
			initialLeftWidth = $(this.anchor + " > .section-left").outerWidth();
			isExpandingFromCollapsed = this.leftLastSize === 0;
			
			// Add dragging class to body for cursor styling - this also switches off the section transitions
			container.removeClass("sections-animating");
			$('body').addClass('resizing');
			
			e.preventDefault();
		});
		
		// Mouse move event - just note the position, the widths are updated on the next frame
		$(document).on('mousemove', (e) => {
			if (!isDragging) return;
			pendingClientX = e.clientX;
			if(frameRequest === null) {
				frameRequest = requestAnimationFrame(applyDrag);
			}
		});
		
		// Mouse up event - stop dragging
		$(document).on('mouseup', (e) => {
			if (isDragging) {
				isDragging = false;

				// Make sure the final position is applied
				if(frameRequest !== null) {
					cancelAnimationFrame(frameRequest);
					applyDrag();
				}
				
				// Remove dragging class
				$('body').removeClass('resizing');
				
				// Dispatch resize event
				this.sqs.sqsEventDispatch("layoutResize", e);
				
				// Calculate and store final widths
				const wp = this.calculateWidthsAsPercentage();
				this.leftLastSize = wp.left;
				this.rightLastSize = wp.right;

				if(wp.left < this.minSectionWidth) {
					this.visibleSection = "right";
				}
				else if(wp.right < this.minSectionWidth) {
					this.visibleSection = "left";
				}
				else {
					this.visibleSection = "both";
				}
				this.updateSectionCollapseButtons();
				this.updateSwitchSectionButton();
			}
		});
		
		// Window resize event
		$(window).on("resize", (evt) => {
			this.sqs.sqsEventDispatch("layoutResize", evt);
		});
		
		// Remove the jQuery UI handle if it exists
		$(".ui-resizable-handle", this.anchor).remove();
	}
    
    /*
    * Function: setDefaultOptionValue
    *
    * Sets the default option value for an option - if none was given.
    */
    setDefaultOptionValue(key, value) {
        if(typeof this.options[key] == "undefined") {
            this.options[key] = value;
        }
    }

	static removeResizable() {
		$("#section-left").resizable("destroy");
	}

	setActive(active) {
		this.active = active;
		if(this.active) {
			$(this.anchor).css("visibility", "visible");
		}
		else {
			$(this.anchor).css("visibility", "hidden");
		}
	}

	getActive() {
		return this.active;
	}

    /*
    * Function: destroy
    */
	destroy() {
		$(this.anchor).hide();
	}

}

export { SqsView as default }
