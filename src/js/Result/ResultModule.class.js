/* 
Class: ResultModule
*/
/*
* Class: ResultModule
*/
class ResultModule {
	/*
	* Function: constructor
	*/
	constructor(resultManager) {
		this.resultManager = resultManager;
		this.active = true;
		this.name = "";
		this.requestId = 0;
		this.data = [];
	}
	/*
	* Function: setActive
	*/
	setActive(active) {
		this.active = active;
	}
	
}

export { ResultModule as default }