import ResultModule from './ResultModule.class.js'
import Config from '../../config/config.json';
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
		this.mode = null; // Will be set based on active domain
		this.currentVariable = null; // Currently selected variable
		this.cylinderBaseRadius = 8000;
		this.cylinderMinRadius = 1500;
		this.cylinderMaxRadius = 40000;
		this.cylinderReferenceHeight = 5000000;
		this.cylinderRadiusListenerAttached = false;

		// Available dendro variables
		this.dendroVariables = [
			{ name: "Tree age ≥", type: "numeric", description: "Youngest tree age" },
			{ name: "Tree age ≤", type: "numeric", description: "Oldest tree age" },
			{ name: "Tree species", type: "categorical", description: "Tree species distribution" },
			{ name: "Sapwood (Sp)", type: "numeric", description: "Number of sapwood rings" },
			{ name: "Pith (P)", type: "numeric", description: "Pith presence" },
			{ name: "Tree rings", type: "numeric", description: "Number of tree rings" },
			{ name: "Number of analysed radii.", type: "numeric", description: "Analysed radii count" },
			{ name: "Bark (B)", type: "binary", description: "Bark presence" },
			{ name: "Waney edge (W)", type: "ternary", description: "Waney edge presence" }
		];

		$(this.renderIntoNode).append("<div class='result-globe-render-container'></div>");
		$(".result-globe-render-container", this.renderIntoNode).css("height", "100%");

		this.renderGlobeIntoNode = $(".result-globe-render-container", renderIntoNode)[0];
    }

	update() {
		console.log("ResultGlobe.update()");
		this.render();
	}

	getVisualizationMode() {
		const activeDomain = this.sqs.domainManager.getActiveDomain();
		if (activeDomain.name === "dendrochronology") {
			return "dendro";
		}
		return "ecocodes";
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
			const { Color, Viewer, Cartesian3, Cartesian2, LabelStyle, VerticalOrigin, HeightReference, UrlTemplateImageryProvider, Credit } = Cesium;
		
			this.viewer = new Viewer($(this.renderIntoNode).attr("id"), {
				animation: false,
				timeline: false,
				baseLayerPicker: false,
				imageryProvider: false, // Disable default imagery
			});

			// Add Stamen Terrain layer with labels
			const terrainImageryProvider = new UrlTemplateImageryProvider({
				url: 'https://tiles-eu.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png',
				credit: new Credit('&copy; <a href="https://www.stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a>, &copy; <a href="https://www.openstreetmap.org/about/">OpenStreetMap contributors</a>, &copy; <a href="https://stamen.com/">Stamen Design</a>')
			});
			this.viewer.imageryLayers.addImageryProvider(terrainImageryProvider);

			this.viewer.scene.skyBox = null;  // Remove stars/spacebox
			this.viewer.scene.skyAtmosphere = null;  // Remove blue atmospheric glow
			this.viewer.scene.backgroundColor = Cesium.Color.WHITE;  // Change background to black (or any solid color)
			this.viewer.clock.shouldAnimate = false;

			this.viewer.camera.setView({
				destination: Cartesian3.fromDegrees(10.0, 50.0, 5000000) // (lon, lat, height in meters)
			});
			this.cylinderReferenceHeight = 5000000;
			
			const mode = this.getVisualizationMode();
			this.mode = mode;

			if (mode === "ecocodes") {
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
			} else if (mode === "dendro") {
				$(this.renderIntoNode).append(`
					<div id='result-globe-control-panel'>
					<h3>Dendrochronological Variables</h3>

					<label>Select variable to visualize:</label><br />
					
					<ul id='result-globe-variable-list'>
					</ul>
					</div>
				`);
			}

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
		const mode = this.getVisualizationMode();

		if (mode === "ecocodes") {
			this.renderEcoCodesControlPanel(data);
		} else if (mode === "dendro") {
			this.renderDendroControlPanel(data);
		}
	}

	async renderEcoCodesControlPanel(data) {
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

	async renderDendroControlPanel(data) {
		$("#result-globe-variable-list").html("");
		
		this.dendroVariables.forEach(variable => {
			$("#result-globe-variable-list").append(`
				<li>
					<input value='${variable.name}' type='radio' name='dendro-variable' />
					${variable.name}
					<span class='variable-description'>${variable.description}</span>
				</li>
			`);
		});

		$("input[name='dendro-variable']").on("change", async (evt) => {
			const selectedVariable = $(evt.target).val();
			this.currentVariable = selectedVariable;
			await this.fetchAndRenderDendroVariable(selectedVariable);
		});
	}

	renderBars(selectedEcocode, selectedCalculationMode, ecoCodeData = null) {
		const { Color, Viewer, Cartesian3, Cartesian2, LabelStyle, VerticalOrigin, HeightReference } = this.cesium;

		if(ecoCodeData) {
			this.ecoCodeData = ecoCodeData;
		}

		// Use the new removeAllBars method
		this.removeAllBars();
		this.attachCylinderRadiusListener();

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
			const radius = this.getScaledCylinderRadius();
			this.viewer.entities.add({
				properties: {
					entityType: 'ecocodeBar'
				},
				position: Cartesian3.fromDegrees(siteLng, siteLat, height / 2),  // Convert lat/lng to Cartesian3
				cylinder: {
					length: height, // The height of the cylinder (proportional to the value)
					topRadius: radius, // Radius of the top of the cylinder
					bottomRadius: radius, // Radius of the bottom of the cylinder
					material: Color.fromBytes(ecocodeColorRgb.red*255, ecocodeColorRgb.green*255, ecocodeColorRgb.blue*255, 255), // Color of the cylinder
					verticalOrigin: VerticalOrigin.BOTTOM,
					HeightReference: HeightReference.CLAMP_TO_GROUND
				}
			});

		});

		this.updateBarRadii();
	}

	getScaledCylinderRadius() {
		if (!this.viewer || !this.viewer.camera || !this.viewer.camera.positionCartographic) {
			return this.cylinderBaseRadius;
		}

		const cameraHeight = this.viewer.camera.positionCartographic.height || this.cylinderReferenceHeight;
		const referenceHeight = this.cylinderReferenceHeight || cameraHeight;
		const scale = referenceHeight > 0 ? cameraHeight / referenceHeight : 1;
		const radius = this.cylinderBaseRadius * scale;

		return Math.min(this.cylinderMaxRadius, Math.max(this.cylinderMinRadius, radius));
	}

	attachCylinderRadiusListener() {
		if (!this.viewer || this.cylinderRadiusListenerAttached) {
			return;
		}

		this.cylinderRadiusListenerAttached = true;
		this.viewer.camera.changed.addEventListener(() => {
			this.updateBarRadii();
		});
	}

	updateBarRadii() {
		if (!this.viewer) {
			return;
		}

		const radius = this.getScaledCylinderRadius();

		this.viewer.entities.values.forEach(entity => {
			if (!entity.cylinder || !entity.properties || !entity.properties.entityType) {
				return;
			}

			const entityType = entity.properties.entityType.getValue(this.viewer.clock.currentTime);
			if (entityType !== 'ecocodeBar' && entityType !== 'dendroBar') {
				return;
			}

			entity.cylinder.topRadius = radius;
			entity.cylinder.bottomRadius = radius;
		});
	}

	updateCylinderRadius() {
		this.updateBarRadii();
	}

	renderDendroBars(variableName, dendroData, variableConfig) {
		const { Color, Cartesian3, VerticalOrigin, HeightReference } = this.cesium;

		console.log("Rendering dendro bars for variable:", variableName, "with data:", dendroData, "and config:", variableConfig);

		// dendroData has structure: { categories: [{site_id, average, count}] }
		// Each entry represents one site with the average value and sample count for this variable

		let siteIdKey = null;
		let lngKey = null;
		let latKey = null;

		this.data.Meta.Columns.forEach((column, index) => {
			if(column.FieldKey == "category_id") {
				siteIdKey = index;
			}
			if(column.FieldKey == "longitude_dd") {
				lngKey = index;
			}
			if(column.FieldKey == "latitude_dd") {
				latKey = index;
			}
		});

		// Find max value for scaling
		let maxValue = 0;
		dendroData.categories.forEach(cat => {
			const value = variableConfig.type === "numeric" ? cat.average : cat.count;
			if (value > maxValue) {
				maxValue = value;
			}
		});

		// Render bars for each site
		dendroData.categories.forEach(cat => {
			const siteId = cat.site_id;
			const site = this.data.Data.DataCollection.find(s => s[siteIdKey] == siteId);
			
			if (!site) {
				console.warn("Site not found for site_id:", siteId);
				return;
			}

			const siteLat = site[latKey];
			const siteLng = site[lngKey];

			// For numeric variables, use average; for categorical, use count
			const displayValue = variableConfig.type === "numeric" ? cat.average : cat.count;
			const height = maxValue > 0 ? (displayValue / maxValue) * 1000000 : 0;
			
			const radius = this.getScaledCylinderRadius();
			this.viewer.entities.add({
				properties: {
					entityType: 'dendroBar'
				},
				position: Cartesian3.fromDegrees(siteLng, siteLat, height / 2),
				cylinder: {
					length: height,
					topRadius: radius,
					bottomRadius: radius,
					material: Color.fromBytes(0, 128, 255, 255),
					verticalOrigin: VerticalOrigin.BOTTOM,
					HeightReference: HeightReference.CLAMP_TO_GROUND
				}
			});

			console.log(`Rendered bar for site_id ${siteId} at (${siteLat}, ${siteLng}) with height ${height} based on ${variableConfig.type === "numeric" ? "average" : "count"}: ${displayValue}`);
		});
	}

	renderCategoricalBars(variableName, siteData, variableConfig) {
		const { Color, Cartesian3, VerticalOrigin, HeightReference } = this.cesium;

		let siteIdKey = null;
		let lngKey = null;
		let latKey = null;

		this.data.Meta.Columns.forEach((column, index) => {
			if(column.FieldKey == "category_id") {
				siteIdKey = index;
			}
			if(column.FieldKey == "longitude_dd") {
				lngKey = index;
			}
			if(column.FieldKey == "latitude_dd") {
				latKey = index;
			}
		});

		// siteData is a Map of siteId -> { category: count }
		// For binary: {Yes: count, No: count}
		// For ternary: {Yes: count, No: count, Maybe: count}

		// Find max count for scaling
		let maxCount = 0;
		siteData.forEach(categories => {
			Object.values(categories).forEach(count => {
				if (count > maxCount) maxCount = count;
			});
		});

		// Color mapping
		const colorMap = {
			'Yes': Color.fromBytes(0, 200, 0, 255),
			'No': Color.fromBytes(200, 0, 0, 255),
			'Maybe': Color.fromBytes(128, 128, 128, 255)
		};

		// Render bars for each site
		siteData.forEach((categories, siteId) => {
			const site = this.data.Data.DataCollection.find(s => s[siteIdKey] == siteId);
			if (!site) return;

			const siteLat = site[latKey];
			const siteLng = site[lngKey];

			// Get the dominant category (highest count)
			let dominantCategory = null;
			let dominantCount = 0;
			Object.entries(categories).forEach(([category, count]) => {
				if (count > dominantCount) {
					dominantCount = count;
					dominantCategory = category;
				}
			});

			if (!dominantCategory) return;

			const height = maxCount > 0 ? (dominantCount / maxCount) * 1000000 : 0;
			const color = colorMap[dominantCategory] || Color.fromBytes(128, 128, 255, 255);

			const radius = this.getScaledCylinderRadius();
			this.viewer.entities.add({
				properties: {
					entityType: 'dendroBar'
				},
				position: Cartesian3.fromDegrees(siteLng, siteLat, height / 2),
				cylinder: {
					length: height,
					topRadius: radius,
					bottomRadius: radius,
					material: color,
					verticalOrigin: VerticalOrigin.BOTTOM,
					HeightReference: HeightReference.CLAMP_TO_GROUND
				}
			});
		});
	}

	async fetchAndRenderDendroVariable(variableName) {
		// Remove existing bars
		this.removeAllBars();

		// Find variable config to determine type
		const variableConfig = this.dendroVariables.find(v => v.name === variableName);
		if (!variableConfig) {
			console.error("Variable configuration not found:", variableName);
			return;
		}

		let siteIds = this.data.Data.DataCollection.map(site => site[0]);
		
		// For categorical variables (including binary and ternary), use variablepersite/categorical
		// For numeric variables, use variablepersite/average
		if (variableConfig.type === "binary" || variableConfig.type === "ternary" || variableConfig.type === "categorical") {
			console.log("Fetching categorical variable data for:", variableName);
			await this.fetchAndRenderCategoricalVariable(variableName, variableConfig, siteIds);
		} else {
			console.log("Fetching numeric variable data for:", variableName);
			await this.fetchAndRenderNumericCategoricalVariable(variableName, variableConfig, siteIds);
		}
	}

	async fetchAndRenderNumericCategoricalVariable(variableName, variableConfig, siteIds) {
		const requestBody = {
			sites: siteIds,
			requestId: ++this.requestId,
			variable: variableName
		};

		try {
			const response = await fetch(Config.dataServerAddress + "/dendro/variablepersite/average", {
				method: "POST",
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				console.error("Error fetching dendro variable data, status:", response.status);
				return;
			}

			const dendroData = await response.json();
			
			if (!dendroData || !dendroData.categories || dendroData.categories.length === 0) {
				console.warn("No data available for variable:", variableName);
				return;
			}

			this.renderDendroBars(variableName, dendroData, variableConfig);

		} catch(error) {
			console.error("Error fetching dendro variable:", error);
		}
	}

	async fetchAndRenderCategoricalVariable(variableName, variableConfig, siteIds) {
		const requestBody = {
			sites: siteIds,
			requestId: ++this.requestId,
			variable: variableName
		};

		try {
			const response = await fetch(Config.dataServerAddress + "/dendro/variablepersite/categorical", {
				method: "POST",
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				console.error("Error fetching dendro variable data, status:", response.status);
				return;
			}

			const rawData = await response.json();
			
			if (!rawData || !rawData.categories || rawData.categories.length === 0) {
				console.warn("No data available for variable:", variableName);
				return;
			}

			// Process raw data to categorize per site
			const siteData = this.processCategoricalData(rawData, variableConfig, variableName);
			this.renderCategoricalBars(variableName, siteData, variableConfig);

		} catch(error) {
			console.error("Error fetching dendro variable:", error);
		}
	}

	processCategoricalData(rawData, variableConfig, variableName) {
		const siteCategories = new Map();

		// Parse each category and aggregate by site
		// rawData.categories has structure: [{site_id, value_counts: {value1: count1, value2: count2}, ...}]
		rawData.categories.forEach(cat => {
			const siteId = cat.site_id;
			
			if (!siteId || !cat.value_counts) {
				return;
			}

			// Process each value in value_counts
			Object.entries(cat.value_counts).forEach(([valueName, count]) => {
				let normalized;
				if (variableConfig.type === "binary") {
					normalized = this.parseDendroBinaryValue(valueName);
				} else if (variableConfig.type === "ternary") {
					normalized = this.parseDendroTernaryValue(valueName, variableName);
				} else {
					// For categorical type, use the value as-is
					normalized = valueName;
				}

				if (normalized) {
					if (!siteCategories.has(siteId)) {
						siteCategories.set(siteId, {});
					}
					const siteCat = siteCategories.get(siteId);
					siteCat[normalized] = (siteCat[normalized] || 0) + count;
				}
			});
		});

		return siteCategories;
	}

	parseDendroNumericValue(value) {
		if(!value || value === null || value === undefined) {
			return null;
		}

		const stringValue = String(value).trim();
		
		if(stringValue === "" || stringValue.toLowerCase() === "undefined") {
			return null;
		}

		// Handle greater than (>28 becomes 29)
		if(stringValue.startsWith(">")) {
			const num = parseFloat(stringValue.substring(1));
			return isNaN(num) ? null : num + 1;
		}

		// Handle less than (<28 becomes 27)
		if(stringValue.startsWith("<")) {
			const num = parseFloat(stringValue.substring(1));
			return isNaN(num) ? null : num - 1;
		}

		// Handle ranges (71-72 becomes 71)
		if(stringValue.includes("-")) {
			const parts = stringValue.split("-");
			const num = parseFloat(parts[0]);
			return isNaN(num) ? null : num;
		}

		// Strip out uncertainty symbols: ?, ~, and any whitespace
		const cleaned = stringValue.replace(/[?~\s]/g, "");
		
		const num = parseFloat(cleaned);
		return isNaN(num) ? null : num;
	}

	parseDendroBinaryValue(value) {
		if(!value || value === null || value === undefined) {
			return null;
		}

		const stringValue = String(value).trim();
		
		if(stringValue === "" || stringValue.toLowerCase() === "undefined") {
			return null;
		}

		const cleaned = stringValue.replace(/[?~\s]/g, "").toLowerCase();
		
		if(cleaned === "ja" || cleaned === "yes" || cleaned === "y" || cleaned === "j") {
			return "Yes";
		}
		
		if(cleaned === "nej" || cleaned === "no" || cleaned === "n") {
			return "No";
		}
		
		return null;
	}

	parseDendroTernaryValue(value, variableName = "") {
		if(!value || value === null || value === undefined) {
			return null;
		}

		const stringValue = String(value).trim().toLowerCase();
		
		if(stringValue === "") {
			return null;
		}

		if(variableName === "Waney edge (W)") {
			if(stringValue === "w" || stringValue === "b") {
				return "Yes";
			}
			
			if(stringValue.includes("ej w") || stringValue === "nej") {
				return "No";
			}
			
			if(stringValue.includes("nära") || 
			   stringValue.includes("near") ||
			   stringValue.includes("?") ||
			   stringValue === "undefined" ||
			   stringValue === "indeterminable" ||
			   stringValue.includes("eller") ||
			   stringValue.includes("or")) {
				return "Maybe";
			}
		}
		
		return null;
	}

	removeAllBars() {
		if (!this.viewer) return;

		const entities = this.viewer.entities.values;
		for (let i = entities.length - 1; i >= 0; i--) {
			const entity = entities[i];
			if (entity.properties &&
				entity.properties.entityType &&
				(entity.properties.entityType.getValue() === 'ecocodeBar' ||
				 entity.properties.entityType.getValue() === 'dendroBar')) {
				this.viewer.entities.remove(entity);
			}
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

export { ResultGlobe as default }
