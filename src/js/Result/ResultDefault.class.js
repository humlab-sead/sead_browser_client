//import Config from '../../config/config.js'

/*
* Class: ResultDefault
*
* This is a pseudo-result module which just renders some appropriate information in the result section when no other result module is active.
* 
*/
class ResultDefault {
	constructor() {
	
	}

	isVisible() {
		return true;
	}

	render() {
		var domObj = $("#result-default-contents-template")[0].cloneNode(true);
		$(domObj).attr("id", "result-default-contents");
		$(domObj).css("display", "block");
		$("#result-container").append(domObj);
	}

	update() {
	}

	unrender() {
		$("#result-default-contents").remove();
	}
}

export { ResultDefault as default }