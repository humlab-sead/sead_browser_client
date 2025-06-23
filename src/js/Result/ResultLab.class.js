import ResultModule from './ResultModule.class.js'
import "../../../node_modules/cesium/Build/Cesium/Widgets/widgets.css";
import demoData from '../../assets/gw-demo-ds-students-service.json';

/*
* Class: ResultModule
*/
class ResultLab extends ResultModule {

    constructor(resultManager, renderIntoNode = "#result-lab-container") {
		super(resultManager);
		this.renderIntoNode = renderIntoNode;
		this.name = "lab";
		this.prettyName = "Lab";
		this.icon = "<i class='fa fa-flask'></i>";
		this.experimental = true;

		$(this.renderIntoNode).append("<div class='result-lab-render-container'></div>");
		$(".result-lab-render-container", this.renderIntoNode).css("height", "100%");

		this.renderLabIntoNode = $(".result-lab-render-container", renderIntoNode)[0];
    }

	update() {
		console.log("ResultLab.update()");
		this.render();
	}

	isVisible() {
		return false;
	}

    async render(fetch = true) {
		super.render();

		$(this.renderIntoNode).show();
		$(this.renderIntoNode).html("");

		/*
        const data = [
			{ "city": "New York", "population": 8419000 },
			{ "city": "Los Angeles", "population": 3980000 },
			{ "city": "Chicago", "population": 2705000 }
		];

		const fields = [
			{ name: "city", semanticType: "nominal", analyticType: "dimension" },
			{ name: "population", semanticType: "quantitative", analyticType: "measure" }
		];
		*/

		console.log(demoData)

		const { data, fields } = demoData;

        // Create a root and render
        /*
		const root = createRoot($(this.renderIntoNode)[0]);
        root.render(
            React.createElement(GraphicWalker, { data: data, fields: fields })
        );
		*/

        /*
		import("@kanaries/graphic-walker").then(gw => {
			console.log(gw);

            this.gw = gw;
            new gw.GraphicWalker();
		});
        */
	}


	async fetchData() {
		if(this.resultManager.getResultDataFetchingSuspended()) {
			console.warn("ResultLab.fetchData() called while data fetching is suspended.");
			return false;
		}
		
		var reqData = this.resultManager.getRequestData(++this.requestId, "map");

		this.resultManager.showLoadingIndicator(true);
		return $.ajax(Config.serverAddress+"/api/result/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: (respData, textStatus, jqXHR) => {
				//Only load this data if it matches the last request id dispatched. Otherwise it's old data.
				if(respData.RequestId == this.requestId && this.active) {
					this.importResultData(respData);
					this.resultManager.showLoadingIndicator(false);
				}
				else {
					console.log("WARN: ResultMap discarding old result package data ("+respData.RequestId+"/"+this.requestId+").");
				}
			},
			error: (respData, textStatus, jqXHR) => {
				console.error("Error fetching data for result lab: ", textStatus, respData);
				this.resultManager.showLoadingIndicator(false, true);
			}
		});
	}

	importResultData(data, renderMap = true) {
		this.sql = data.Query;
		this.data = [];
		var keyMap = {};

		for(var key in data.Meta.Columns) {
			if(data.Meta.Columns[key].FieldKey == "category_id") {
				keyMap.id = parseInt(key);
			}
			if(data.Meta.Columns[key].FieldKey == "category_name") {
				keyMap.title = parseInt(key);
			}
			if(data.Meta.Columns[key].FieldKey == "latitude_dd") {
				keyMap.lat = parseInt(key);
			}
			if(data.Meta.Columns[key].FieldKey == "longitude_dd") {
				keyMap.lng = parseInt(key);
			}
		}
		
		for(var key in data.Data.DataCollection) {
			var dataItem = {};
			dataItem.id = data.Data.DataCollection[key][keyMap.id];
			dataItem.title = data.Data.DataCollection[key][keyMap.title];
			dataItem.lng = data.Data.DataCollection[key][keyMap.lng];
			dataItem.lat = data.Data.DataCollection[key][keyMap.lat];
			
			this.data.push(dataItem);
		}

		this.renderData = JSON.parse(JSON.stringify(this.data)); //Make a copy
		/*
		this.renderData = this.resultManager.sqs.sqsOffer("resultMapData", {
			data: this.renderData
		}).data;
		*/

		this.resultManager.sqs.sqsEventDispatch("resultModuleRenderComplete");
	}

    async unrender() {
		$(this.renderIntoNode).hide();
	}

	setActive(active) {
		super.setActive(active);

		if(!active) {
			$(this.renderIntoNode).hide();
		}
	}
}

export { ResultLab as default }