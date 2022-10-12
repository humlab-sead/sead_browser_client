class EcoCodes {
	/*
	* Function: constructor
	*/
	constructor(sqs, siteId) {
		this.sqs = sqs;
		this.siteId = siteId;
		this.buildComplete = false;
		this.auxiliaryDataFetched = true; //There is currently no auxiliary data to fetch for any analysis module, so... 

		//The section structure this will result in after everything is fetched and parsed.
		this.section = {
			"name": "ecocodes",
			"title": "Eco codes",
			"contentItems": [],
			"sections": [] //Each type of analysis/method will get its own section here
		};
	}

    async fetch() {
	}

    /*
	* Function: render
	*/
	async render(siteData) {
        console.log("EcoCode module render");

		/*
        let response = await fetch(this.sqs.config.dataServerAddress+"/ecocodes/site/"+siteData.site_id);
        let ecoCodeBundles = await response.json();
        console.log(ecoCodeBundles);
		*/

        let sampleGroupColumns = [];
        let sampleGroupRows = [];
        let contentItem = {
            "name": "ecocodes-graph",
            "title": "Eco codes",
            "data": {
                "columns": sampleGroupColumns,
                "rows": sampleGroupRows
            },
            "renderOptions": [{
                "selected": true,
                "type": "bar",
                "name": "Chart",
                "options": [
                    
                ]
            }]
        };
        this.section = {
			"name": "ecocodes",
			"title": "Eco codes",
			"collapsed": false,
			"contentItems": [contentItem]
		};
        
		this.sqs.siteReportManager.siteReport.renderSection(this.section);
	}

    destroy() {

    }

}

export { EcoCodes as default }

