import Popper from "popper.js";
import shortid from "shortid";
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
			modifiers: {
				offset: {
					enabled: false,
					offset: "0, 0"
				},
				flip: {
					behavior: ["left", "right", "top", "bottom"],
					enabled: true
				},
				preventOverflow: {
					enabled: true
				},
				hide: {
					enabled: false
				}
			}
		};
		
		/*
		* Yeah so this tries to attach all unattached tooltips at this interval, which means
		* it will loop through all tooltips even if they're all already attached. Not the most efficient,
		* and could be done better, but it's good enough for now.
		 */
		setInterval(() => {
			this.attachTooltips();
		}, 500);
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
		var tooltipId = "tooltip-"+shortid.generate();

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
			"options": Object.assign(JSON.parse(JSON.stringify(this.defaultOptions)), options),
			"attached": false
		};

		if(found) {
			console.warn("Re-defining tooltip for anchor", anchor);
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
			console.log("Failed to de-register tooltip", anchor, "- not found");
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
			if(this.tooltips[key].attached === false) {
				var found = $(this.tooltips[key].anchor).length;
				if(found > 1) {
					console.log("WARN: Multiple anchor targets found when attaching tooltip.");
				}
				
				if(found == 1) { 
					if(this.tooltips[key].msg != null && typeof this.tooltips[key].msg == "function") {
						//This is a bit of a hack - if you pass in a function as the tooltip "msg" then it will execute it as a regular custom callback
						//so basically we're hijacking the tooltip manager to do something similar but different from just showing tooltips
						$(this.tooltips[key].anchor).on("mouseover", null, this.tooltips[key], (evt) => {
							evt.data.msg();
						});
						if(typeof this.tooltips[key].options.mouseout == "function") { //If a mouseout property/callback was provided...
							$(this.tooltips[key].anchor).on("mouseout", null, this.tooltips[key], (evt) => {
								evt.data.options.mouseout();
							});
						}
					}
					else {
						this.tooltips[key].tooltipNode = this.createTooltip(this.tooltips[key]);
					}
					this.tooltips[key].attached = true;
				}
				
				if(found == 0) {
					//Try again later
					allTooltipsAttached = false;
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
		
		tooltip.tooltipNode = $("<div class='popper' style='display:none;'>"+tooltip.msg+"</div>");
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

		new Popper(tooltip.anchor, tooltip.tooltipNode, tooltip.options);
		
		$(anchor).on("mouseover", (evt) => {
			var tooltip = this.getTooltipById($(evt.currentTarget).attr("tooltip-anchor-id"));
			if(!tooltip.rendered) {
				this.renderTooltip(tooltip);
			}
		});
		$(anchor).on("mouseout", (evt) => {
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
		
		var popper = new Popper($(tooltip.anchor)[0], tooltip.tooltipNode, tooltip.options);
		
		tooltip.sticky = sticky;
		tooltip.popper = popper;
		tooltip.rendered = true;
		$(tooltip.tooltipNode).show();
		tooltip.popper.update();
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
		if(typeof(tooltip.popper) == "undefined") { //This should never happen, but it does...
			console.log("Tooltip popper was undefined!");
			console.log(tooltip);
		}
		else {
			tooltip.popper.destroy();
		}
		
		$(tooltip.tooltipNode).hide();
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