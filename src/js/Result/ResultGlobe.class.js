import ResultModule from './ResultModule.class.js'
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
		this.experimental = true;

		$(this.renderIntoNode).append("<div class='result-globe-render-container'></div>");
		$(".result-globe-render-container", this.renderIntoNode).css("height", "100%");

		this.renderGlobeIntoNode = $(".result-globe-render-container", renderIntoNode)[0];
    }

	update() {
		console.log("ResultGlobe.update()");
		this.render();
	}

	isVisible() {
		return false;
	}

    render(fetch = true) {
		super.render();

		$(this.renderIntoNode).show();
		$(this.renderIntoNode).html("");

		import("cesium").then(Cesium => {
			this.cesium = Cesium;
			Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0NjcwNWEyNi1jMWY0LTRkY2ItYTNjOC1jYzRmOGY5YjFiZGEiLCJpZCI6MjQ0NjAyLCJpYXQiOjE3Mjc0NDUxNTR9.vzRMNvNDlL_FlLsFoB-yc1bNWQdbbpjJ3AJ19jr8_os';
			const { Color, Viewer, Cartesian3, Cartesian2, LabelStyle, VerticalOrigin, HeightReference } = Cesium;
		
			this.viewer = new Viewer($(this.renderIntoNode).attr("id"), {
				animation: false,
				timeline: false,
			});

			this.viewer.scene.skyBox = null;  // Remove stars/spacebox
			this.viewer.scene.skyAtmosphere = null;  // Remove blue atmospheric glow
			this.viewer.scene.backgroundColor = Cesium.Color.WHITE;  // Change background to black (or any solid color)
			this.viewer.clock.shouldAnimate = false;

			this.viewer.camera.setView({
				destination: Cartesian3.fromDegrees(10.0, 50.0, 5000000) // (lon, lat, height in meters)
			});
			
			$(this.renderIntoNode).append(`
				<div id='result-globe-control-panel'>
				<h3>Eco codes</h3>

				<label>Ecocode calculated by:</label><br />
				<select id='result-globe-ecocode-calculation'>
					<option value='abundance'>Abundance of all taxa related to ecocode</option>
					<option value='taxa'>Number of unique taxa related to ecocode</option>
				</select>
				
				<ul id='result-globe-ecocode-list'>
				</ul>
				</div>
				`);

			if(fetch) {
				this.fetchData().then((data, textStatus, xhr) => {
					if(this.active) {
						this.data = data;
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
							this.viewer.entities.add({
								properties: {
									entityType: 'site'
								},
								position: Cartesian3.fromDegrees(site[lngKey], site[latKey]),  // Convert lat/lng to Cartesian3
								point: { // Add a point to represent the site
									pixelSize: 6,
									color: Color.fromBytes(1, 0, 157, 100),
									outlineColor: Color.fromBytes(255, 255, 255, 128), 
									outlineWidth: 0.5, 
								},
							});
						});

						this.renderControlPanel(data);
					}
				}).catch((xhr, textStatus, errorThrown) => { //error
					console.error("Error fetching data for result globe: ", textStatus, errorThrown);
				});
			}
		});
	}

	async renderControlPanel(data) {

		$("#result-globe-ecocode-calculation").on("change", (evt) => {
			const selectedEcocode = $("input[name='ecocode']:checked").val();
			const selectedCalculation = $(evt.target).val();
			this.renderBars(selectedEcocode, selectedCalculation);
		});

		let siteIds = data.Data.DataCollection.map(site => site[0]);

		$("#result-globe-ecocode-list").html("");
		for(let key in this.sqs.bugsEcoCodeDefinitions) {
			let ecocode = this.sqs.bugsEcoCodeDefinitions[key];
			$("#result-globe-ecocode-list").append(`
				<li>
					<input value='${ecocode.ecocode_definition_id}' type='radio' name='ecocode' />
					${ecocode.name}
				</li>
			`);

			// Bind the change event to all radio buttons after they are added to the DOM
		}

		$("input[name='ecocode']").on("change", (evt) => {
			const selectedEcocode = $(evt.target).val();

			$.ajax(Config.dataServerAddress + "/ecocodes/sites/individual/"+selectedEcocode, {
				data: JSON.stringify(siteIds),
				dataType: "json",
				method: "post",
				contentType: 'application/json; charset=utf-8',
				crossDomain: true,
				success: (respData, textStatus, jqXHR) => {
					this.ecoCodeData = respData;
					const selectedCalculation = $("#result-globe-ecocode-calculation").val();
					this.renderBars(selectedEcocode, selectedCalculation, this.ecoCodeData);
				},
				error: (respData, textStatus, jqXHR) => {
					console.error("Error fetching ecocodes for result globe: ", textStatus, respData);
				}
			});
			
		});
		
	}

	renderBars(selectedEcocode, selectedCalculationMode, ecoCodeData = null) {
		const { Color, Viewer, Cartesian3, Cartesian2, LabelStyle, VerticalOrigin, HeightReference } = this.cesium;

		if(ecoCodeData) {
			this.ecoCodeData = ecoCodeData;
		}

		let removedBars = 0;
		const entities = this.viewer.entities.values;

		for (let i = entities.length - 1; i >= 0; i--) {
			const entity = entities[i];
			if (
				entity.properties &&
				entity.properties.entityType &&
				entity.properties.entityType.getValue() === 'ecocodeBar'
			) {
				this.viewer.entities.remove(entity);
				removedBars++;
			}
		}

		let siteIdKey = null;
		let siteNameKey = null;
		let lngKey = null;
		let latKey = null;

		this.data.Meta.Columns.forEach((column, index) => {
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


		let maxTotalAbundance = 0;
		let maxTotalTaxa = 0;
		this.ecoCodeData.forEach((siteEcocodeData) => {
			if(siteEcocodeData.totalAbundance > maxTotalAbundance) {
				maxTotalAbundance = siteEcocodeData.totalAbundance;
			}
			if(siteEcocodeData.taxaCount > maxTotalTaxa) {
				maxTotalTaxa = siteEcocodeData.taxaCount;
			}
		});

		this.ecoCodeData.forEach((siteEcocodeData) => {
			siteEcocodeData.site_id;
			siteEcocodeData.abbreviation;
			siteEcocodeData.definition;
			siteEcocodeData.name;
			siteEcocodeData.taxaCount;
			siteEcocodeData.totalAbundance;

			let ecocodeColorHex = this.sqs.config.ecocodeColors.find(ecocode => ecocode.ecocode_definition_id == siteEcocodeData.ecocode_definition_id).color;
			let ecocodeColorRgb = Color.fromCssColorString(ecocodeColorHex);

			if(siteEcocodeData.ecocode_definition_id != selectedEcocode) {
				return;
			}

			//find the site in the data.Data.DataCollection
			let site = this.data.Data.DataCollection.find(site => site[siteIdKey] == siteEcocodeData.site_id);
			let siteId =  site[siteIdKey];
			let siteLat = site[latKey];
			let siteLng = site[lngKey];

			let height = 0;
			if(selectedCalculationMode == "abundance") {
				height = (siteEcocodeData.totalAbundance / maxTotalAbundance) * 1000000; // Height of the cylinder (proportional to the value)
			}
			else {
				height = (siteEcocodeData.taxaCount / maxTotalTaxa) * 1000000; // Height of the cylinder (proportional to the value
			}
			this.viewer.entities.add({
				properties: {
					entityType: 'ecocodeBar'
				},
				position: Cartesian3.fromDegrees(siteLng, siteLat, height / 2),  // Convert lat/lng to Cartesian3
				cylinder: {
					length: height, // The height of the cylinder (proportional to the value)
					topRadius: 8000, // Radius of the top of the cylinder
					bottomRadius: 8000, // Radius of the bottom of the cylinder
					material: Color.fromBytes(ecocodeColorRgb.red*255, ecocodeColorRgb.green*255, ecocodeColorRgb.blue*255, 255), // Color of the cylinder
					verticalOrigin: VerticalOrigin.BOTTOM,
					HeightReference: HeightReference.CLAMP_TO_GROUND
				}
			});

		});

		/*
		this.viewer.scene.postRender.addEventListener(() => {
			this.updateCylinderRadius();
		});
		*/
	}

	updateCylinderRadius() {
		const cameraPosition = this.viewer.camera.positionWC;

		// Loop through all entities and apply changes only to non-siteCircle entities
		this.viewer.entities.values.forEach(entity => {
			if (entity.entityType !== 'siteCircle' && entity.cylinder) {  // Ignore siteCircle entities
				const cylinderPosition = entity.position.getValue(this.viewer.clock.currentTime);

				// Calculate distance between the camera and the cylinder
				const distance = Cartesian3.distance(cameraPosition, cylinderPosition);

				// Adjust the radius dynamically based on the distance
				const scaleFactor = distance * 0.000005;  // Adjust this factor for your needs
				entity.cylinder.topRadius = scaleFactor;
				entity.cylinder.bottomRadius = scaleFactor;
			}
		});
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