import { computePosition, autoUpdate, arrow, flip, shift, offset, hide } from "@floating-ui/dom";
import { nanoid } from "nanoid";
/*
* Class: TooltipManager
*
* TLDR; Use the registerTooltip function to make tooltips.
*
* Ok so this kind of turned into an entire system for tooltips which was not the intention but whatevs...
* Basically, you would call registerTooltip and this just registers the fact that you want to attach
* a certain tooltip to a certain node. Then the system will attempt to attach this tooltip to an actual node.
* I say attempt because if the node doesn't exist in the DOM yet it will keep trying until it pops up.
* If it finds the right anchor node, it will actually make the tooltip node itself and attach mouseover/interaction
* events to it.
*
* We are using the Popper.js library for the positioning of the tooltips, but we have to do the creation and stuff of
* the tooltips ourselves (yes I tried using Tooltip.js which is built around Popper but I couldn't make friends with it).
*
*/
class TooltipManager {
	/*
	* Function: constructor
	*/
	constructor(sqs) {
		this.sqs = sqs;
		this.tooltips = [];
		this.defaultOptions = {
			arrow: true,
			drawSymbol: false,
			symbolChar: "fa-question-circle",
			anchorPoint: "container", // should the tooltip popup when hovering over the container area, or just the symbol (if it exists)? options: 'symbol' or 'container'
			html: true,
			placement: "top",
			highlightAnchor: false,
			middleware: [offset(9), flip({ padding: 8 }), shift({ padding: 8 }), hide()],
		};
		
		/*
		* Yeah so this tries to attach all unattached tooltips at this interval, which means
		* it will loop through all tooltips even if they're all already attached. Not the most efficient,
		* and could be done better, but it's good enough for now.
		 */
		setInterval(() => {
			this.attachTooltips();
		}, 1000);
	}
	
	registerCallback(anchor, eventType, callback) {

	}

	/*
	* Function: registerTooltip
	*
	* Use to this to register a new tooltip. Basically all other functions in this class is internal stuff you shouldn't call from outside.
	*
	* Parameters:
	*  anchor - The DOM node (or search path) to which this tooltip will be anchored and also the button/triggerzone for spawning the popup.
	*  msg - The contents of the tooltip.
	*  options - Extra Popper.js options + the option of specifying drawSymbol:true which will then draw and attach the tooltip to a little question mark instead of the anchor.
	 */
	registerTooltip(anchor, msg, options = {}) {
		var tooltipId = "tooltip-"+nanoid();

		let found = false;
		let foundKey;
		this.tooltips.forEach((tt, key) => {
			if(tt.anchor == anchor) {
				found = true;
				foundKey = key;
			}
		});

		let ttObject = {
			"id": tooltipId,
			"anchor": anchor,
			"msg": msg,
			"options": Object.assign({}, this.defaultOptions, options),
			"attached": false,
			"attachmentAttemtps": 0,
		};

		if(found) {
			//console.warn("Re-defining tooltip for anchor", anchor);
			this.tooltips[foundKey] = ttObject;
		}
		else {
			this.tooltips.push(ttObject);
			
		}
		return tooltipId;
	}

	unRegisterTooltip(anchor) {
		let found = false;
		for(let key in this.tooltips) {
			if(this.tooltips[key].anchor == anchor) {
				found = true;
				if(this.tooltips[key].attached) {
					$(this.tooltips[key].tooltipNode).remove();
					$(this.tooltips[key].anchor).remove();
				}
				this.tooltips.splice(key, 1);
				return;
			}
		}
		if(!found) {
			console.log("Failed to unregister tooltip", anchor, "- not found");
		}
	}
	
	/*
	* Function: attachTooltips
	*
	* Since the anchor DOM-element of the tooltip may not exist yet when registerTooltip is called, this function does a sort
	* of lazy attaching of the tooltips as the DOM anchors become available.
	*
	 */
	attachTooltips() {
		
		var allTooltipsAttached = true;
		
		for(var key in this.tooltips) {
			let tt = this.tooltips[key];
			if(tt.attached === false) {
				var found = $(tt.anchor).length;
				if(found > 1) {
					console.log("WARN: Multiple anchor targets found when attaching tooltip.");
				}

				if(found == 1) { 
					if(tt.msg != null && typeof tt.msg == "function") {
						//This is a bit of a hack - if you pass in a function as the tooltip "msg" then it will execute it as a regular custom callback
						//so basically we're hijacking the tooltip manager to do something similar but different from just showing tooltips

						let eventType = "mouseover";
						if(typeof tt.options.eventType != "undefined") {
							eventType = tt.options.eventType;
						}
						$(tt.anchor).on(eventType, null, tt, (evt) => {
							evt.data.msg(evt);
						});
						if(typeof tt.options.mouseout == "function") { //If a mouseout property/callback was provided...
							$(tt.anchor).on("mouseout", null, tt, (evt) => {
								evt.data.options.mouseout();
							});
						}
					}
					else {
						tt.tooltipNode = this.createTooltip(tt);
					}
					tt.attached = true;
				}
				
				if(found == 0) {
					//Try again later
					allTooltipsAttached = false;
					tt.attachmentAttemtps++;
					/*
					if(tt.attachmentAttemtps > 10) {
						console.warn("WARN: Tooltip with anchor "+tt.anchor+" not found after 10 attempts, giving up.");
						tt.attached = true;
					}
					*/
				}
			}
		}
	}
	
	/*
	* Function: createTooltip
	*
	* Creates a tooltip, but does not show it.
	*
	 */
	createTooltip(tooltip) {
		
		$(tooltip.anchor).attr("tooltip-anchor-id", tooltip.id);

		tooltip.tooltipNode = $(`<div class='popper' data-state='closed' data-side='top' data-visibility='visible' style='display:none; position:absolute; top:0; left:0;'>`+tooltip.msg+`</div>`)[0];

		if(tooltip.options.arrow) {
			tooltip.arrowNode = $("<div class='popper-arrow'></div>")[0];
			$(tooltip.tooltipNode).append(tooltip.arrowNode);
		}

		$("body").append(tooltip.tooltipNode);
		//new Popper(tooltip.anchor, tooltip.tooltipNode, tooltip.options);
		
		var anchor = tooltip.anchor;
		if(tooltip.options.drawSymbol) {
			let colorAttr = "";
			if(tooltip.options.symbolColor) {
				colorAttr = "color:"+tooltip.options.symbolColor+";";
			}
			var symbol = $("<i style=\""+colorAttr+"\" class=\"fa "+tooltip.options.symbolChar+" help-icon\" tooltip-anchor-id='"+tooltip.id+"' aria-hidden=\"true\"></i>");
			$(tooltip.anchor).append(symbol);
			
			if(tooltip.options.anchorPoint == "symbol") {
				anchor = symbol;
			}
		}
		tooltip.referenceNode = $(anchor)[0];

		//new Popper(tooltip.anchor, tooltip.tooltipNode, tooltip.options);
		
		$(anchor).on("mouseenter focusin", (evt) => {
			var tooltip = this.getTooltipById($(evt.currentTarget).attr("tooltip-anchor-id"));
			if(!tooltip.rendered) {
				this.renderTooltip(tooltip);
			}
		});
		$(anchor).on("mouseleave focusout", (evt) => {
			var tooltip = this.getTooltipById($(evt.currentTarget).attr("tooltip-anchor-id"));
			if(!tooltip.sticky) {
				this.unRenderTooltip(tooltip);
			}
		});
		
		return tooltip.tooltipNode;
	}
	
	/*
	* Function: renderTooltip
	*
	* Renders a tooltip.
	*
	 */
	renderTooltip(tooltip, sticky = false) {
		if(tooltip.options.highlightAnchor) {
			$(tooltip.anchor).addClass("tooltip-anchor-highlight");
		}

		if(tooltip.hideTimeout) {
			clearTimeout(tooltip.hideTimeout);
			tooltip.hideTimeout = undefined;
		}

		$(tooltip.tooltipNode).show();
		$(tooltip.tooltipNode).attr("data-visibility", "visible");
		$(tooltip.tooltipNode).attr("data-state", "closed");

		tooltip.sticky = sticky;
		tooltip.rendered = true;

		requestAnimationFrame(() => {
			if(tooltip.rendered) {
				$(tooltip.tooltipNode).attr("data-state", "open");
			}
		});

		const referenceEl = tooltip.referenceNode || $(tooltip.anchor)[0];
		const floatingEl = tooltip.tooltipNode;
		const tooltipMiddleware = Array.isArray(tooltip.options.middleware) ? [...tooltip.options.middleware] : [];
		if(tooltip.arrowNode) {
			tooltipMiddleware.push(arrow({ element: tooltip.arrowNode }));
		}

		const updatePosition = () => {
			computePosition(referenceEl, floatingEl, {
				placement: tooltip.options.placement || 'top',
				middleware: tooltipMiddleware,
			}).then(({x, y, placement, middlewareData}) => {
				Object.assign(floatingEl.style, { left: `${x}px`, top: `${y}px` });

				const side = placement.split("-")[0];
				$(floatingEl).attr("data-side", side);

				if(middlewareData.hide) {
					if(middlewareData.hide.referenceHidden || middlewareData.hide.escaped) {
						$(floatingEl).attr("data-visibility", "hidden");
					}
					else {
						$(floatingEl).attr("data-visibility", "visible");
					}
				}

				if(tooltip.arrowNode && middlewareData.arrow) {
					const staticSide = {
						top: "bottom",
						right: "left",
						bottom: "top",
						left: "right",
					}[side];

					Object.assign(tooltip.arrowNode.style, {
						left: middlewareData.arrow.x != null ? `${middlewareData.arrow.x}px` : "",
						top: middlewareData.arrow.y != null ? `${middlewareData.arrow.y}px` : "",
						right: "",
						bottom: "",
					});

					if(staticSide) {
						tooltip.arrowNode.style[staticSide] = "-6px";
					}
				}
			});
		};

		updatePosition();
		tooltip.floatingCleanup = autoUpdate(referenceEl, floatingEl, updatePosition);
	}
	
	/*
	* Function: unRenderTooltip
	*
	 */
	unRenderTooltip(tooltip) {
		if(tooltip.options.highlightAnchor) {
			$(tooltip.anchor).removeClass("tooltip-anchor-highlight");
		}
		tooltip.rendered = false;
		if(typeof tooltip.floatingCleanup === "function") {
			tooltip.floatingCleanup();
			tooltip.floatingCleanup = undefined;
		}
		$(tooltip.tooltipNode).attr("data-state", "closed");
		tooltip.hideTimeout = setTimeout(() => {
			if(!tooltip.rendered) {
				$(tooltip.tooltipNode).hide();
				$(tooltip.tooltipNode).attr("data-visibility", "visible");
			}
		}, 140);
	}
	
	/*
	* Function: getTooltipByName
	*
	 */
	getTooltipById(tooltipId) {
		for(var key in this.tooltips) {
			if(this.tooltips[key].id == tooltipId) {
				return this.tooltips[key];
			}
		}
		return false;
	}
	
}

export { TooltipManager as default }
