import ResultModule from './ResultModule.class.js'
import SqsMenu from '../SqsMenu.class.js';
import { Color, Viewer, Cartesian3, Cartesian2, LabelStyle, VerticalOrigin } from "cesium"; 
import "../../../node_modules/cesium/Build/Cesium/Widgets/widgets.css";


/*
* Class: ResultModule
*/
class ResultGlobe extends ResultModule {

    constructor(resultManager, renderIntoNode = "#result-globe-container") {
		super(resultManager);
		this.renderIntoNode = renderIntoNode;
		this.name = "globe";
		this.prettyName = "Globe";
		this.icon = "<i class='fa fa-globe'></i>";

		$(this.renderIntoNode).append("<div class='result-globe-render-container'></div>");
		$(".result-globe-render-container", this.renderIntoNode).css("height", "100%");

		this.renderGlobeIntoNode = $(".result-globe-render-container", renderIntoNode)[0];
    }

    render(fetch = true) {
		super.render();

		$(this.renderIntoNode).show();
		$(this.renderIntoNode).html("");

		//Create a Viewer instances and add the DataSource.
		
		const viewer = new Viewer($(this.renderIntoNode).attr("id"), {
			animation: false,
			timeline: false,
		});
		viewer.clock.shouldAnimate = false;

		viewer.camera.setView({
			destination: Cartesian3.fromDegrees(10.0, 50.0, 5000000) // (lon, lat, height in meters)
		});
        
		
		if(fetch) {
			this.fetchData().then((data, textStatus, xhr) => {
				if(this.active) {

					//this should be extracted from data.Meta.Columns instead
					let siteIdKey = null;
					let siteNameKey = null;
					let lngKey = null;
					let latKey = null;

					data.Meta.Columns.forEach((column, index) => {
						if(column.FieldKey == "category_id") {
							siteIdKey = index;
						}
						if(column.FieldKey == "category_name") {
							siteNameKey = index;
						}
						if(column.FieldKey == "longitude_dd") {
							lngKey = index;
						}
						if(column.FieldKey == "latitude_dd") {
							latKey = index;
						}
					});

					data.Data.DataCollection.forEach(site => {
						// Add each site as a point (billboard or label) to the Cesium viewer
						viewer.entities.add({
							position: Cartesian3.fromDegrees(site[lngKey], site[latKey]),  // Convert lat/lng to Cartesian3
							point: { // Add a point to represent the site
								pixelSize: 10,
								color: Color.RED,
							},
							label: { // Add a label with the site's title
								font: '14pt sans-serif',
								style: LabelStyle.FILL_AND_OUTLINE,
								outlineWidth: 2,
								verticalOrigin: VerticalOrigin.BOTTOM,
								pixelOffset: new Cartesian2(0, -9) // Adjust label position
							},
						});

						let height = 50*10000; // Height of the cylinder (proportional to the value)

						viewer.entities.add({
							position: Cartesian3.fromDegrees(site[lngKey], site[latKey], height / 2),  // Convert lat/lng to Cartesian3
							cylinder: {
								length: height, // The height of the cylinder (proportional to the value)
								topRadius: 5000, // Radius of the top of the cylinder
								bottomRadius: 5000, // Radius of the bottom of the cylinder
								material: Color.BLUE.withAlpha(0.5), // Color and transparency of the cylinder
								verticalOrigin: VerticalOrigin.BOTTOM,
							}
						});
					});
	
				}
			}).catch((xhr, textStatus, errorThrown) => { //error
				console.error("Error fetching data for result globe: ", textStatus, errorThrown);
			});
		}
		
	}

	async fetchData() {
		if(this.resultManager.getResultDataFetchingSuspended()) {
			console.warn("ResultGlobe.fetchData() called while data fetching is suspended.");
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
				console.error("Error fetching data for result globe: ", textStatus, respData);
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

    unrender() {
		$(this.renderIntoNode).hide();
	}

	setActive(active) {
		super.setActive(active);

		if(!active) {
			$(this.renderIntoNode).hide();
		}
	}
}

export { ResultGlobe as default }