import ol from 'openlayers';
import * as d3 from 'd3';
import Config from '../../config/config.js'
import HqsMenu from '../HqsMenu.class.js'
import ResultModule from './ResultModule.class.js'
import Timeline from './Timeline.class.js';

/*
* Class: ResultMap
*/
class ResultMap extends ResultModule {
	/*
	* Function: constructor
	*/
	constructor(resultManager, renderIntoNode = "#result-map-container") {
		super(resultManager);
		this.renderIntoNode = renderIntoNode;
		$(this.renderIntoNode).append("<div class='result-map-render-container'></div>");
		$(this.renderIntoNode).append("<div class='result-timeline-render-container'></div>");
		this.renderMapIntoNode = $(".result-map-render-container", renderIntoNode)[0];
		this.renderTimelineIntoNode = $(".result-timeline-render-container", renderIntoNode)[0];
		
		this.olMap = null;
		this.name = "map";
		this.prettyName = "Geographic";
		this.icon = "<i class=\"fa fa-globe\" aria-hidden=\"true\"></i>";
		this.baseLayers = [];
		this.dataLayers = [];
        this.currentZoomLevel = 4;
		this.selectPopupOverlay = null;
		
		let stamenLayer = new ol.layer.Tile({
			source: new ol.source.Stamen({
				layer: 'terrain-background'
			}),
			visible: true
		});
		stamenLayer.setProperties({
			"layerId": "stamen",
			"title": "Stamen",
			"type": "baseLayer"
		});
		
		let bingAerialLayer = new ol.layer.Tile({
			source: new ol.source.BingMaps({
				key: 'At_1FuTga4p88618KkMhqxYZE71lCvBhzEx7ccisF9rShHoLsDLv-5zzGh3l25X5',
				imagerySet: "Aerial"
			}),
			visible: false
		});
		bingAerialLayer.setProperties({
			"layerId": "bingAerial",
			"title": "Bing Aerial",
			"type": "baseLayer"
		});
		
		let bingAerialLabelsLayer = new ol.layer.Tile({
			source: new ol.source.BingMaps({
				key: 'At_1FuTga4p88618KkMhqxYZE71lCvBhzEx7ccisF9rShHoLsDLv-5zzGh3l25X5',
				imagerySet: "AerialWithLabels"
			}),
			visible: false
		});
		bingAerialLabelsLayer.setProperties({
			"layerId": "bingAerialLabels",
			"title": "Bing Aerial + Labels",
			"type": "baseLayer"
		});
		
		let arcticDemLayer = new ol.layer.Tile({
			source: new ol.source.TileArcGISRest({
				url: "http://elevation2.arcgis.com/arcgis/rest/services/Polar/ArcticDEM/ImageServer",
				attributions: "<a target='_blank' href='https://www.pgc.umn.edu/data/arcticdem/'>NSF PGC ArcticDEM</a>"
			}),
			visible: false
		});
		arcticDemLayer.setProperties({
			"layerId": "arcticDem",
			"title": "PGC ArcticDEM",
			"type": "baseLayer"
		});
		
		this.baseLayers.push(stamenLayer);
		this.baseLayers.push(bingAerialLayer);
		this.baseLayers.push(bingAerialLabelsLayer);
		this.baseLayers.push(arcticDemLayer);
		
		var dataLayer = new ol.layer.Vector();
		dataLayer.setProperties({
			layerId: "clusterPoints",
			title: "Clustered",
			type: "dataLayer",
			renderCallback: this.renderClusteredPointsLayer,
			visible: true
		});
		this.dataLayers.push(dataLayer);
		
		dataLayer = new ol.layer.Vector();
		dataLayer.setProperties({
			layerId: "points",
			title: "Individual",
			type: "dataLayer",
			renderCallback: this.renderPointsLayer,
			visible: false
		});
		this.dataLayers.push(dataLayer);

		this.resultManager.hqs.hqsEventListen("siteReportClosed", () => {
			if(this.olMap != null) {
				this.olMap.updateSize();
			}
		});
		
		
		//This whole thing is a silly fix for a silly bug in OL regarding dynamic resizing, and it blurs the map, but it's better than nothing
		/*
		$(window).on("resize", () => {
			if(this.olMap != null) {
				$(this.renderIntoNode).hide();
				if(typeof(this.resizeTimeout) != "undefined") {
					clearTimeout(this.resizeTimeout);
				}
				this.resizeTimeout = setTimeout(() => {
					$(this.renderIntoNode).show();
					this.olMap.updateSize();	
				}, 100);
			}
		});
		*/

		$(window).on("resize", () => {
			if(this.olMap != null) {
				$(this.renderMapIntoNode).hide();
				if(typeof(this.resizeTimeout) != "undefined") {
					clearTimeout(this.resizeTimeout);
				}
				this.resizeTimeout = setTimeout(() => {
					$(this.renderMapIntoNode).show();
					this.olMap.updateSize();	
				}, 100);
			}
		});
		
		this.timeline = new Timeline(this);
	}
	
	/*
	* Function: clearData
	*/
	clearData() {
		this.data = [];
	}
	
	/*
	* Function: fetchData
	*/
	fetchData() {
		
		if(this.resultDataFetchingSuspended) {
			this.pendingDataFetch = true;
			return false;
		}
		
		var reqData = this.resultManager.getRequestData(++this.requestId, "map");

		this.resultManager.showLoadingIndicator(true);
		return $.ajax(Config.serverAddress+"/api/result/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: (respData, textStatus, jqXHR) => {
				if(respData.requestId == this.requestId && this.active) { //Only load this data if it matches the last request id dispatched. Otherwise it's old data.
					this.importResultData(respData);
                    this.resultManager.showLoadingIndicator(false);
				}
				else {
					console.log("WARN: ResultMap discarding old result package data ("+respData.requestId+"/"+this.requestId+").");
				}

			},
			error: (respData, textStatus, jqXHR) => {
                this.resultManager.showLoadingIndicator(false, true);
			},
			complete: (xhr, textStatus) => {
				
			}
		});
	}
	
	/*
	* Function: importResultData
	*/
	importResultData(data) {
		this.data = [];

		var keyMap = {};

		for(var key in data.meta.columns) {
            if(data.meta.columns[key].fieldKey == "category_id") {
                keyMap.id = parseInt(key);
            }
			if(data.meta.columns[key].fieldKey == "category_name") {
				keyMap.title = parseInt(key);
			}
			if(data.meta.columns[key].fieldKey == "latitude_dd") {
				keyMap.lat = parseInt(key);
			}
			if(data.meta.columns[key].fieldKey == "longitude_dd") {
				keyMap.lng = parseInt(key);
			}
		}
		
		for(var key in data.data.dataCollection) {
			var dataItem = {};
            dataItem.id = data.data.dataCollection[key][keyMap.id];
			dataItem.title = data.data.dataCollection[key][keyMap.title];
			dataItem.lng = data.data.dataCollection[key][keyMap.lng];
			dataItem.lat = data.data.dataCollection[key][keyMap.lat];
			
			this.data.push(dataItem);
		}
		
		//If we have over 2000 data points, switch default rendering mode to clustering
		if(this.data.length > 2000) {
			this.dataLayers.forEach((element, index, array) => {
				if(element.getProperties().layerId == "clusterPoints") {
					element.setVisible(true);
				}
				else if(element.getProperties().layerId == "points") {
					element.setVisible(false);
				}
			})
		}

        this.renderData = JSON.parse(JSON.stringify(this.data)); //Make a copy
        this.renderData = this.resultManager.hqs.hqsOffer("resultMapData", {
            data: this.renderData
        }).data;
		
		this.renderMap();
		this.renderVisibleDataLayers();
		this.timeline.render();
        this.resultManager.hqs.hqsEventDispatch("resultModuleRenderComplete");
	}
	
	/*
	* Function: render
	*/
	render() {
		var xhr = this.fetchData();
		xhr.then((data, textStatus, xhr) => { //success
			if(this.active) {
				this.renderInterfaceControls();
			}
		},
		function(xhr, textStatus, errorThrown) { //error
			console.log(errorThrown);
		});
	}
	
	/*
	* Function: setMapBaseLayer
	*/
	setMapBaseLayer(baseLayerId) {
		this.baseLayers.forEach((layer, index, array) => {
			if(layer.getProperties().layerId == baseLayerId) {
				layer.setVisible(true);
			}
			else {
				layer.setVisible(false);
			}
		});
	}
	
	/*
	* Function: setMapDataLayer
	*/
	setMapDataLayer(dataLayerId) {
		this.clearSelections();
		this.dataLayers.forEach((layer, index, array) => {
			if(layer.getProperties().layerId == dataLayerId && layer.getVisible() == false) {
				layer.setVisible(true);
				layer.getProperties().renderCallback(this);
			}
			if(layer.getProperties().layerId != dataLayerId && layer.getVisible() == true) {
				this.removeLayer(layer.getProperties().layerId);
				layer.setVisible(false);
			}
		});

	}
	
	removeLayer(layerId) {
		this.olMap.getLayers().forEach((element, index, array)=> {
			if(typeof(element) != "undefined" && element.getProperties().layerId == layerId) {
				this.olMap.removeLayer(element);
			}
		});
	}
	
	renderBaseLayerControl() {
		//Render baselayer picker
		d3.select(".ol-overlaycontainer-stopevent")
			.append("div")
			.attr("id", "result-map-baselayer-control")
			.attr("class", "ol-unselectable ol-control result-map-control-container")
			.style("top", "5.0em")
			.append("button")
			.attr("id", "baselayer-picker-button")
			.attr("type", "button")
			.attr("title", "Select baselayer")
			.attr("class", "fa fa-map-o result-map-control")
			.attr("aria-hidden", "true");
		
		d3.select(".ol-overlaycontainer-stopevent")
			.append("div")
			.attr("id", "result-map-baselayer-picker")
			.attr("class", "ol-unselectable ol-control result-map-control-picker")
			.style("top", "4.4em")
			.append("ul");
		
		d3.select("#result-map-baselayer-picker > ul").selectAll("li").data(this.baseLayers)
			.enter()
			.append("li")
			.attr("id", (d, i) => {
				return "map-baselayer-"+d.getProperties().layerId;
			})
			.attr("baselayer", (d, i) => {
				return d.getProperties().layerId;
			})
			.text((d, i) => {
				return d.getProperties().title;
			});
		
		
		$("#result-map-baselayer-control").on("click", () => {
			$("#result-map-baselayer-picker").toggle(100);
		});
		
		$("body").on("click", () => {
			$("#result-map-baselayer-picker").hide(100);
		});
		
		$("#result-map-baselayer-picker > ul > li").on("click", (evt) => {
			this.setMapBaseLayer($(evt.target).attr("baselayer"));
			$("#result-map-baselayer-picker").toggle(100);
			evt.stopPropagation();
		});
		
		//Done with baselayer picker
	}
	
	renderDataLayerControl() {
		//Render point renderer-picker
		d3.select(".ol-overlaycontainer-stopevent")
			.append("div")
			.attr("id", "result-map-datalayer-control")
			.attr("class", "ol-unselectable ol-control result-map-control-container")
			.style("top", "7.1em")
			.append("button")
			.attr("id", "datalayer-picker-button")
			.attr("type", "button")
			.attr("title", "Select datalayer")
			.attr("class", "fa fa-map-marker result-map-control")
			.attr("aria-hidden", "true");
		
		d3.select(".ol-overlaycontainer-stopevent")
			.append("div")
			.attr("id", "result-map-datalayer-picker")
			.attr("class", "ol-unselectable ol-control result-map-control-picker")
			.style("top", "7.4em")
			.append("ul");
		
		d3.select("#result-map-datalayer-picker > ul").selectAll("li").data(this.dataLayers)
			.enter()
			.append("li")
			.attr("id", (d, i) => {
				return "map-datalayer-"+d.getProperties().layerId;
			})
			.attr("datalayer", (d, i) => {
				return d.getProperties().layerId;
			})
			.text((d, i) => {
				return d.getProperties().title;
			});
		
		$("#result-map-datalayer-control").on("click", () => {
			$("#result-map-datalayer-picker").toggle(100);
		});
		
		$("body").on("click", () => {
			$("#result-map-datalayer-picker").hide(100);
		});
		
		$("#result-map-datalayer-picker > ul > li").on("click", (evt) => {
			this.setMapDataLayer($(evt.target).attr("datalayer"));
			$("#result-map-datalayer-picker").toggle(100);
			evt.stopPropagation();
		});
	}
	
	/*
	* Function: renderInterface
	*/
	renderInterfaceControls() {
		d3.select(this.renderMapIntoNode)
			.append("div")
			.attr("id", "result-map-controls-container");

		d3.select("#result-map-controls-container")
			.append("div")
			.attr("id", "result-map-baselayer-controls-menu");
		new HqsMenu(this.resultManager.hqs, this.resultMapBaseLayersControlsHqsMenu());

		d3.select("#result-map-controls-container")
			.append("div")
			.attr("id", "result-map-datalayer-controls-menu");
		new HqsMenu(this.resultManager.hqs, this.resultMapDataLayersControlsHqsMenu());
	}

	/*
	* Function: renderMap
	*/
	renderMap(removeAllDataLayers = true) {
		
		$(this.renderIntoNode).show();
		//$(this.renderMapIntoNode).show();
		//$(this.timelineNode).show();

		if(this.olMap == null) {
			console.log("Rendering map into", this.renderMapIntoNode);

			this.olMap = new ol.Map({
				controls: ol.control.defaults({
					attributionOptions: {
						collapsible: true
					}
				}),
				//target: this.renderIntoNode.substr(1),
				target: this.renderMapIntoNode,
				layers: new ol.layer.Group({
					layers: this.baseLayers
				}),
				view: new ol.View({
					center: ol.proj.fromLonLat([12.41, 48.82]),
					zoom: this.currentZoomLevel
				})
			});

			$("#facet-result-panel .section-left").on("resize", () => {
				clearTimeout(this.resizeTicker);
				this.resizeTicker = setTimeout(() => {
					if(this.active) {
						this.olMap.updateSize();
					}
				}, 100);
			});

			//NOTE: This can not be pre-defined in HTML since the DOM object itself is removed along with the overlay it's attached to when the map is destroyed.
			d3.select("#result-container")
				.append("div")
				.classed("map-popup-box", true)
				.attr("id", "popup-container")
				.append("table")
				.attr("id", "map-popup-sites-table")
				.append("tbody");

			this.selectPopupOverlay = new ol.Overlay({
                element: document.getElementById('popup-container'),
                positioning: 'bottom-center',
                offset: [0, -17]
            });
            this.olMap.addOverlay(this.selectPopupOverlay);
			
			var selectInteraction = new ol.interaction.Select({
				condition: ol.events.condition.click,
				style: (feature) => {
					if(this.getVisibleDataLayer().getProperties().layerId == "clusterPoints") {
                        return this.getClusterPointStyle(feature, {
                            selected: true,
                            highlighted: false
                        });
					}
					else {
                        return this.getPointStyle(feature, {
                            selected: true,
                            highlighted: false
                        });
					}
				}
			});

			selectInteraction.setProperties({
				selectInteraction: true
			});



            selectInteraction.on("select", (evt) => {
				if(evt.selected.length == 1 && evt.selected[0].getProperties().hasOwnProperty("features") == false) {
                    var feature = evt.selected[0];
                    var coords = feature.getGeometry().getCoordinates();
                    var prop = feature.getProperties();

                    $("#map-popup-title").html("");
                    var tableRows = "<tr row-site-id='"+prop.id+"'><td>"+prop.name+"</td></tr>";
					tableRows = hqs.hqsOffer("resultMapPopupSites", {
						tableRows: tableRows,
						olFeatures: prop.features
					}).tableRows;
                    $("#map-popup-sites-table tbody").html(tableRows);

					this.selectPopupOverlay.setPosition(coords);
				}
				else if(evt.selected.length == 1 && evt.selected[0].getProperties().hasOwnProperty("features") == true) {
                    var feature = evt.selected[0];
                    var coords = feature.getGeometry().getCoordinates();
                    var prop = evt.selected[0].getProperties();

                    $("#map-popup-title").html("");
                    /*
                    if(prop.features.length > 20) {
                    	$("#map-popup-show-all-sites-btn").show();
                        $("#map-popup-sites-table").hide();
                    }
                    else {
                        $("#map-popup-show-all-sites-btn").hide();
                        $("#map-popup-sites-table").show();
					}
					*/
                    var tableRows = "";
                    for(var fk in prop.features) {
                        tableRows += "<tr row-site-id='"+prop.features[fk].getProperties().id+"'><td>"+prop.features[fk].getProperties().name+"</td></tr>";
                    }

                    tableRows = hqs.hqsOffer("resultMapPopupSites", {
                    	tableRows: tableRows,
						olFeatures: prop.features
					}).tableRows;

                    $("#map-popup-sites-table tbody").html(tableRows);

                    $("#map-popup-show-all-sites-btn").on("click", (evt) => {
                        $("#map-popup-sites-table").show();
                        $("#map-popup-show-all-sites-btn").hide();
	                    this.selectPopupOverlay.setPosition();
	                    this.selectPopupOverlay.setPosition(coords);
                    });
					this.selectPopupOverlay.setPosition(coords);
				}
				else {
					this.selectPopupOverlay.setPosition();
				}
                hqs.hqsEventDispatch("resultMapPopupRender");
			});
			
			this.olMap.addInteraction(selectInteraction);


            this.olMap.on("moveend", () => {
                var newZoomLevel = this.olMap.getView().getZoom();
                if (newZoomLevel != this.currentZoomLevel) {
                    this.currentZoomLevel = newZoomLevel;
                    //console.log(this.currentZoomLevel)
                    //FIXME: REMOVE CLUSTER SELECTIONS?

                }
			});

		}
		
		if(removeAllDataLayers) {
			this.dataLayers.forEach((layer, index, array) => {
				if(layer.getVisible()) {
					this.removeLayer(layer.getProperties().layerId)
				}
			});
		}

        this.resultManager.hqs.hqsEventDispatch("resultModuleRenderComplete");
	}

	/*
	* Function: clearSelections
	*/
	clearSelections() {
		var interactions = this.olMap.getInteractions();
		interactions.forEach((interaction) => {
			var prop = interaction.getProperties();
			if(prop.selectInteraction) {
				interaction.getFeatures().clear();
				this.selectPopupOverlay.setPosition();
			}
		});
	}

	/*
	* Function: getVisibleDataLayer
	*/
    getVisibleDataLayer() {
		for(var key in this.dataLayers) {
			if(this.dataLayers[key].getProperties().visible) {
				return this.dataLayers[key];
			}
		}
		return false;
	}

	/*
	* Function: getVisibleDataLayers
	*/
	getVisibleDataLayers() {
		var visibleLayers = [];
		for(var key in this.dataLayers) {
			if(this.dataLayers[key].getProperties().visible) {
				visibleLayers.push(this.dataLayers[key]);
			}
		}
		return visibleLayers;
	}

	/*
	* Function: getVisibleBaseLayers
	*/
	getVisibleBaseLayers() {
		var visibleLayers = [];
		for(var key in this.baseLayers) {
			if(this.baseLayers[key].getProperties().visible) {
				visibleLayers.push(this.baseLayers[key]);
			}
		}
		return visibleLayers;
	}

	/*
	* Function: renderVisibleDataLayers
	*/
	renderVisibleDataLayers() {
		for(var k in this.dataLayers) {
			var layerProperties = this.dataLayers[k].getProperties();
			if(layerProperties.visible) {
				this.dataLayers[k].setVisible(false);
				this.setMapDataLayer(layerProperties.layerId);
			}
		}
	}
	
	/*
	* Function: renderPointsLayer
	*/
	renderPointsLayer(resultMapModule) {
		var geojson = resultMapModule.getDataAsGeoJSON();
		
		var gf = new ol.format.GeoJSON({
			featureProjection: "EPSG:3857"
		});
		var featurePoints = gf.readFeatures(geojson);
		
		var pointsSource = new ol.source.Vector({
			features: featurePoints
		});
		
		var layer = new ol.layer.Vector({
			source: pointsSource,
			style: (feature, resolution) => {
				var style = resultMapModule.getPointStyle(feature);
				return style;
			},
			zIndex: 1
		});
		
		layer.setProperties({
			"layerId": "points",
			"type": "dataLayer"
		});
		
		resultMapModule.olMap.addLayer(layer);
	}
	
	/*
	* Function: renderClusteredPointsLayer
	*/
	renderClusteredPointsLayer(resultMapModule) {
		
		var geojson = resultMapModule.getDataAsGeoJSON();
		
		var gf = new ol.format.GeoJSON({
			featureProjection: "EPSG:3857"
		});
		var featurePoints = gf.readFeatures(geojson);
		
		var pointsSource = new ol.source.Vector({
			features: featurePoints
		});
		
		var clusterSource = new ol.source.Cluster({
			distance: 25,
			source: pointsSource
		});
		
		var clusterLayer = new ol.layer.Vector({
			source: clusterSource,
			style: (feature, resolution) => {
				var style = resultMapModule.getClusterPointStyle(feature);
				return style;
			},
			zIndex: 1
		});
		
		clusterLayer.setProperties({
			"layerId": "clusterPoints",
			"type": "dataLayer"
		});
		
		resultMapModule.olMap.addLayer(clusterLayer);
	}

	getLayerById(layerId) {
		for(var key in this.dataLayers) {
			if(this.dataLayers[key].getProperties().layerId == layerId) {
				return this.dataLayers[key];
			}
		}
        for(var key in this.baseLayers) {
            if(this.baseLayers[key].getProperties().layerId == layerId) {
                return this.baseLayers[key];
            }
        }
        return false;
	}

	/*
	* Function: getPointStyle
	*/
	getPointStyle(feature, options = { selected: false, highlighted: false }) {
		
		var pointSize = 8;
		var zIndex = 0;
		var text = "";
		
		//default values if point is not selected and not highlighted
		var fillColor = "#214466";
		fillColor = [160, 32, 0, 0.6];
		var strokeColor = "#fff";
		
		//if point is highlighted (its a hit when doing a search)
		if(options.highlighted) {
			fillColor = "#ff00ff";
			strokeColor = "#00ff00";
			zIndex = 10;
		}
		//if point is selected (clicked on)
		if(options.selected) {
			fillColor = "#ffffff";
			strokeColor = "#000000";
			zIndex = 10;
			//text = feature.getProperties().name;
		}

		/*
		//This is not working reliably for some reason.
		if(this.currentZoomLevel > 9) {
			text = feature.getProperties().name;
		}
		*/

		var styles = [];
		
		styles.push(new ol.style.Style({
			image: new ol.style.Circle({
				radius: pointSize,
				stroke: new ol.style.Stroke({
					color: strokeColor
				}),
				fill: new ol.style.Fill({
					color: fillColor
				})
			}),
			zIndex: zIndex,
			text: new ol.style.Text({
				text: text,
				offsetX: 15,
				textAlign: 'left',
				fill: new ol.style.Fill({
					color: '#fff'
				}),
				stroke: new ol.style.Stroke({
					color: '#000',
					width: 2
				}),
				scale: 1.2
			})
			
		}));
		
		return styles;
	}
	
	/*
	* Function: getClusterPointStyle
	*/
	getClusterPointStyle(feature, options = { selected: false, highlighted: false }) {
		var pointsNum = feature.get('features').length;
		var clusterSizeText = pointsNum.toString();
		if(pointsNum > 999) {
			clusterSizeText = pointsNum.toString().substring(0, 1)+"k+";
		}
		var pointSize = 8+(Math.log10(feature.getProperties().features.length)*15);
		
		
		var zIndex = 0;
		
		//default values if point is not selected and not highlighted
		var fillColor = "#214466";
		fillColor = [160, 32, 0, 0.6];
		var strokeColor = "#fff";
		var textColor = "#fff";
		
		//if point is highlighted (its a hit when doing a search)
		if(options.highlighted) {
			fillColor = "#ffdd00";
			textColor = "#000";
			zIndex = 10;
		}
		//if point is selected (clicked on)
		if(options.selected) {
			fillColor = "#ffffff";
			//fillColor = [0, 0, 255, 0.5];
			textColor = "#000";
			zIndex = 10;
		}
		
		var styles = [];
		
		styles.push(new ol.style.Style({
			image: new ol.style.Circle({
				radius: pointSize,
				stroke: new ol.style.Stroke({
					color: strokeColor
				}),
				fill: new ol.style.Fill({
					color: fillColor
				})
			}),
			zIndex: zIndex,
			text: new ol.style.Text({
				text: clusterSizeText,
				offsetY: 1,
				fill: new ol.style.Fill({
					color: textColor
				})
			})
		}));
		
		
		if(pointsNum == 1) {
			var pointName = feature.get('features')[0].getProperties().name;
			if(pointName != null) {
				styles.push(new ol.style.Style({
					zIndex: zIndex,
					text: new ol.style.Text({
						text: pointName,
						offsetX: 15,
						textAlign: 'left',
						fill: new ol.style.Fill({
							color: '#fff'
						}),
						stroke: new ol.style.Stroke({
							color: '#000',
							width: 2
						}),
						scale: 1.2
					})
				}));
			}
			
		}
		
		return styles;
	}
	
	
	/*
	* Function: unrender
	*/
	unrender() {
		$(this.renderIntoNode).hide();
		$(".map-popup-box").remove();
	}
	
	/*
	* Function: getDataAsGeoJSON
	*/
	getDataAsGeoJSON() {
		var geojson = {
			"type": "FeatureCollection",
			"features": [
			]
		};

		for(var key in this.renderData) {
			var feature = {
				"type": "Feature",
				"geometry": {
					"type": "Point",
					"coordinates": [this.renderData[key].lng, this.renderData[key].lat]
				},
				"properties": {
					id: this.renderData[key].id,
					name: this.renderData[key].title
				}
			};
			geojson.features.push(feature);
		}

		return geojson;
	}
	
	/*
	* Function: exportSettings
	*/
	exportSettings() {
		var struct = {};
		if(this.olMap != null) {
			struct = {
				center: this.olMap.getView().getCenter(),
				zoom: this.olMap.getView().getZoom(),
				baseLayers: [],
				dataLayers: []
			};

			var baseLayers = this.getVisibleBaseLayers();
			for(var key in baseLayers) {
				struct.baseLayers.push(baseLayers[key].getProperties().layerId);
			}
			var dataLayers = this.getVisibleDataLayers();
			for(var key in dataLayers) {
				struct.dataLayers.push(dataLayers[key].getProperties().layerId);
			}
		}
		else {
			return false;
		}

		return struct;
	}
	
	/*
	* Function: importSettings
	*/
	importSettings(settings) {
		if(typeof(settings.center) != "undefined" && typeof(settings.zoom) != "undefined") {
			this.settingsImportInterval = setInterval(() => { //Map may not have been initialized yet, so wait until it has
				if(this.olMap != null) {
					this.olMap.getView().setCenter(settings.center);
					this.olMap.getView().setZoom(settings.zoom);
					clearInterval(this.settingsImportInterval);

					if(settings.baseLayers.length > 0) {
						this.setMapBaseLayer(settings.baseLayers[0]);
					}
					if(settings.dataLayers.length > 0) {
						this.setMapDataLayer(settings.dataLayers[0]);
					}
				}
			}, 500);
		}
	}

	/*
	* Function: resultMapBaseLayersControlsHqsMenu
	*/
	resultMapBaseLayersControlsHqsMenu() {
		var menu = {
			title: "<i class=\"fa fa-globe result-map-control-icon\" aria-hidden=\"true\"></i>&nbsp;Baselayer", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: "#result-map-baselayer-controls-menu", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
			staticSelection: true, //whether a selected item remains highlighted or not, purely visual
			visible: true, //show this menu by default
			style: {
				menuTitleClass: "result-map-control-menu-title",
				l1TitleClass: "result-map-control-item-title"
			},
			items: [ //The menu items contained in this menu
			]
		};

		for(var key in this.baseLayers) {
			var prop = this.baseLayers[key].getProperties();
			menu.items.push({
				name: prop.layerId, //identifier of this item, should be unique within this menu
				title: prop.title, //displayed in the UI
				tooltip: "",
				staticSelection: prop.visible, //For tabs - highlighting the currently selected
				callback: this.makeMapControlMenuCallback(prop)
			});
		}
		return menu;
	}

	/*
	* Function: resultMapDataLayersControlsHqsMenu
	*/
	resultMapDataLayersControlsHqsMenu() {
		var menu = {
			title: "<i class=\"fa fa-map-marker result-map-control-icon\" aria-hidden=\"true\"></i>&nbsp;Datalayer", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: "#result-map-datalayer-controls-menu", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
			staticSelection: true, //whether a selected item remains highlighted or not, purely visual
			visible: true, //show this menu by default
			style: {
				menuTitleClass: "result-map-control-menu-title",
				l1TitleClass: "result-map-control-item-title"
			},
			items: [ //The menu items contained in this menu
			]
		};

		for(var key in this.dataLayers) {
			var prop = this.dataLayers[key].getProperties();

			menu.items.push({
				name: prop.layerId, //identifier of this item, should be unique within this menu
				title: prop.title, //displayed in the UI
				tooltip: "",
				staticSelection: prop.visible, //For tabs - highlighting the currently selected
				callback: this.makeMapControlMenuCallback(prop)
			});
		}
		return menu;
	}

	/*
	* Function: makeMapControlMenuCallback
	*/
	makeMapControlMenuCallback(layerProperties) {
		return () => {
			switch(layerProperties.type) {
				case "dataLayer":
					this.setMapDataLayer(layerProperties.layerId);
					break;
				case "baseLayer":
					this.setMapBaseLayer(layerProperties.layerId);
					break;
			}
		}
	}

}

export { ResultMap as default }