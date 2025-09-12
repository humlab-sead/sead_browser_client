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
		this.visibleSection = "both";
        
        this.setDefaultOptionValue("display", true);
        this.setDefaultOptionValue("collapseIntoVertial", false);
        this.setDefaultOptionValue("showElements", []);
        this.setDefaultOptionValue("hideElements", []);

        $(this.anchor).css("display", "none"); //This should be "flex" when view is activated
		
		console.log("Init of new View", this.anchor);

		//this.mobileBreakpointMediaQuery = "screen and (max-width:"+Config.screenMobileWidthBreakPoint+"px)";

		this.setupResizableSections();
		this.setSectionSizes(leftSize, rightSize, false);



		/*
		enquire.register(this.mobileBreakpointMediaQuery, {
			match : () => {
                this.mode = "mobileMode";
                console.log("Mobile mode enabled", this.anchor);
                this.apply();
				return;
				

				
				
				//$("#sead-logo").removeClass("sead-logo-large").addClass("sead-logo-small");
				//$("#sead-logo").hide();
				$("#aux-menu").hide();
				this.sqs.sqsEventDispatch("layoutChange", this.mode);
				
				//$("#facetMenu").hide();
				//$(".facetMenuItemsContainer").css("position", "relative").css("box-shadow", "none");
				//$("#facet-menu-mobile-container").show();
				this.sqs.sqsEventDispatch("layoutResize");
			},
			unmatch : () => {
				this.mode = "desktopMode";
                console.log("Desktop mode enabled");
                this.apply();
                

				if(this.options.collapseIntoVertial === true) {
					let rightContents = $("#site-report-right-container", this.anchor);
					console.log(rightContents);
					$(".section-right", this.anchor).append(rightContents);
				}
				else {
					this.toggleToggleButton(false);
				}
				this.switchSection("both");
				$(".ui-resizable-handle").show();
				this.setSectionSizes(this.leftInitSize, this.rightInitSize, false);
				//$("#sead-logo").removeClass("sead-logo-small").addClass("sead-logo-large");
				$("#sead-logo").show();
				
				//FIXME: The hiding/showing of these needs to be handled on a case-by-base basis
				//$("#aux-menu").show();
				//$("#facet-menu").show();
				
				
				this.sqs.sqsEventDispatch("layoutChange", this.mode);
				this.sqs.sqsEventDispatch("layoutResize");
			}
		});
		*/
		
		//Bind actions for clicking on the panel toggle button
		$(".section-toggle-button", this.anchor).on("click", () => {
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
		this.sqs.sqsEventListen("layoutResize", () => {
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
            }
        }

        if(this.layoutManager.getMode() == "desktopMode") {
            if(this.options.collapseIntoVertial === true) {
                let rightContents = $("#site-report-right-container", this.anchor);
                $(".section-right", this.anchor).append(rightContents);
            }
            else {
                this.toggleToggleButton(false);
			}
			if(this.getVisibleSection() != "both") {
				this.switchSection("both");
			}
            $(".ui-resizable-handle").show();
            this.setSectionSizes(this.leftInitSize, this.rightInitSize, true);
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
		if(show) {
			//console.log("show toggle button");
			$(".section-toggle-button", this.anchor).show();
		}
		else {
			//console.log("hide toggle button");
			$(".section-toggle-button", this.anchor).hide();
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
		this.leftLastSize = leftSize;
		this.rightLastSize = rightSize;

		const leftSection = $(this.anchor + " > .section-left");
		const rightSection = $(this.anchor + " > .section-right");
		const dragHandle = leftSection.find(".custom-resize-handle");

		if(animate) {
			leftSection.css('transition', 'width 0.3s ease, min-width 0.3s ease, max-width 0.3s ease');
			rightSection.css('transition', 'width 0.3s ease, min-width 0.3s ease, max-width 0.3s ease');
		}
		else {
			leftSection.css('transition', 'none');
			rightSection.css('transition', 'none');
		}

		leftSection.css("width", leftSize + "vw");
		rightSection.css("width", rightSize + "vw");
		
		// Update handle position and appearance based on left section size
		if(leftSize === 0) {
			// Section is collapsed - position handle at the left edge
			dragHandle.addClass('handle-collapsed');
		} else {
			dragHandle.removeClass('handle-collapsed');
		}

		if(rightSize == 0) {
			rightSection.css("display", "none");
		}
		else {
			rightSection.css("display", "block");
		}
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

	/**
	* Function: setupResizableSections
	* Does what it says on the tin.
	**/
	setupResizableSections() {
		// Create a custom drag handle
		const dragHandle = $('<div class="custom-resize-handle"></div>');
		$(this.anchor + " > .section-left").append(dragHandle);

		// Check if the left section is already collapsed and position the handle accordingly
		if (this.leftLastSize === 0) {
			dragHandle.addClass('handle-collapsed');
		}

		let isDragging = false;
		let initialX, initialLeftWidth;
		const container = $(this.anchor);
		const leftSection = $(this.anchor + " > .section-left");
		const rightSection = $(this.anchor + " > .section-right");
		
		// Function to disable transitions during drag
		const setTransitionsEnabled = (enabled) => {
			if (enabled) {
				leftSection.css('transition', 'min-width 0.3s ease, max-width 0.3s ease');
				rightSection.css('transition', 'min-width 0.3s ease, max-width 0.3s ease');
			} else {
				leftSection.css('transition', 'none');
				rightSection.css('transition', 'none');
			}
		};
		
		// Mouse down event - start dragging
		dragHandle.on('mousedown', (e) => {
			isDragging = true;
			initialX = e.clientX;
			initialLeftWidth = leftSection.outerWidth();
			
			// Disable transitions during drag
			setTransitionsEnabled(false);
			
			// Add dragging class to body for cursor styling
			$('body').addClass('resizing');
			
			e.preventDefault();
		});
		
		// Mouse move event - update section widths during drag
		$(document).on('mousemove', (e) => {
			if (!isDragging) return;
			
			const deltaX = e.clientX - initialX;
			const totalWidth = container.width();
			
			// Check if we're starting from a collapsed state
			const isExpandingFromCollapsed = this.leftLastSize === 0;
			
			// Calculate new widths
			let newLeftWidth, leftWidthPercent, rightWidthPercent;
			
			if (isExpandingFromCollapsed) {
				// When expanding from collapsed, we want positive movement to expand
				newLeftWidth = Math.max(0, deltaX);
				leftWidthPercent = (newLeftWidth / totalWidth) * 100;
			} else {
				newLeftWidth = initialLeftWidth + deltaX;
				leftWidthPercent = (newLeftWidth / totalWidth) * 100;
			}
			
			rightWidthPercent = 100 - leftWidthPercent;
			
			// Handle minimum threshold for collapsing
			if(leftWidthPercent < 8 && !isExpandingFromCollapsed) {
				leftSection.css('width', '0vw');
				rightSection.css('width', '100vw');
				this.leftLastSize = 0;
				this.rightLastSize = 100;
				// Make sure the handle stays visible
				dragHandle.addClass('handle-collapsed');
				return;
			}
			
			if(rightWidthPercent < 8) {
				rightSection.css('width', '0vw');
				leftSection.css('width', '100vw');
				this.leftLastSize = 100;
				this.rightLastSize = 0;
				return;
			}
			
			// Update widths
			leftSection.css('width', leftWidthPercent + 'vw');
			rightSection.css('width', rightWidthPercent + 'vw');
			
			// If we're expanding from collapsed, update handle position
			if (isExpandingFromCollapsed && leftWidthPercent > 0) {
				dragHandle.removeClass('handle-collapsed');
			}
			
			// Store the new values
			this.leftLastSize = leftWidthPercent;
			this.rightLastSize = rightWidthPercent;
		});
		
		// Mouse up event - stop dragging
		$(document).on('mouseup', (e) => {
			if (isDragging) {
				isDragging = false;
				
				// Re-enable transitions after drag
				setTransitionsEnabled(true);
				
				// Remove dragging class
				$('body').removeClass('resizing');
				
				// Dispatch resize event
				this.sqs.sqsEventDispatch("layoutResize", e);
				
				// Calculate and store final widths
				const wp = this.calculateWidthsAsPercentage();
				this.leftLastSize = wp.left;
				this.rightLastSize = wp.right;
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
