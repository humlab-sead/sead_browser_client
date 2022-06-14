import { nanoid } from "nanoid";
import Color from "../Color.class";
import '../../../node_modules/datatables/media/css/jquery.dataTables.min.css';
import ResultModule from './ResultModule.class.js'
import Config from '../../config/config.json';

import '../../assets/taxa-images/figure1.png';
import '../../assets/taxa-images/figure2.png';
import '../../assets/taxa-images/figure3.png';

/*
* Class: ResultTaxon
*/
class ResultTaxon extends ResultModule {
	/*
	* Function: constructor
	*/
	constructor(resultManager) {
		super(resultManager);
		this.resultManager = resultManager;
		this.sqs = resultManager.sqs;
		this.name = "taxon";
		this.prettyName = "Taxon";
		this.icon = "<i class=\"fa fa-bug\" aria-hidden=\"true\"></i>";
		this.maxRenderCount = 100000;
		this.hasCurrentData = false;
		this.data = {
			columns: [],
			rows: []
		};
		this.taxonId = null;

		$(window).on("seadFacetSelection", (event, evtObject) => {
			if(evtObject.facet.name == "species") {
				if(evtObject.facet.selections.length > 0) {
					this.taxonId = parseInt(evtObject.facet.selections[0]);
				}
			}
		});
	}
	
	/*
	* Function: clearData
	*/
	clearData() {
		this.data.columns = [];
		this.data.rows = [];
	}
	
	/*
	* Function: fetchData
	*/
	fetchData() {
		if(this.resultDataFetchingSuspended) {
			this.pendingDataFetch = true;
			return false;
		}

		var reqData = this.resultManager.getRequestData(++this.requestId, "tabular");

		this.resultManager.showLoadingIndicator(true);
		return $.ajax(Config.serverAddress+"/api/result/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: (respData, textStatus, jqXHR) => {
				//Only load this data if it matches the last request id dispatched. Otherwise it's old data.
				//Also drop the data if the result module has switched since it was requested.
				if(respData.RequestId == this.requestId && this.resultManager.getActiveModule().name == this.name) {
					this.importResultData(respData);
					this.resultManager.showLoadingIndicator(false);
				}
				else {
					console.log("WARN: ResultTable discarding old result package data ("+respData.requestId+"/"+this.requestId+").");
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
		this.data.columns = [];
		this.data.rows = [];

		for(var key in data.Meta.Columns) {
			var c = data.Meta.Columns[key];
			this.data.columns.push({
				title: c.DisplayText,
				field: c.FieldKey
			});
		}

		var rowsCount = data.Data.DataCollection.length;
		
		if(rowsCount > this.maxRenderCount) {
			this.unrender();
			this.resultManager.renderMsg(true, {
				title: "Too much data",
				body: "This dataset contains "+rowsCount+" rows of data. Please narrow down you search to fall within "+this.maxRenderCount+" rows of data by applying more filters."
			});
			return;
		}

		for(var key in data.Data.DataCollection) {
			var d = data.Data.DataCollection[key];

			var row = {};

			var i = 0;
			for(var ck in this.data.columns) {
				row[this.data.columns[ck].field] = d[i];
				i++;
			}

			this.data.rows.push(row);
		}

		//If this module has gone inactive (normally by being replaced) since this request was sent, ignore the response
		if(this.active) {
			this.renderData();
		}
		
	}
	
	/*
	* Function: render
	*/
	render() {
		var xhr = this.fetchData();
		xhr.then((data, textStatus, xhr) => { //success
		},
		function(xhr, textStatus, errorThrown) { //error
			console.log(errorThrown);
		});
	}

	/**
	 * groupByAttribute
	 * 
	 * I would like to take this opportunity to apologize to anyone who might have to read and understand this function in the future
	 */
	groupByAttribute(itemArray, attributes = []) {

		if(typeof attributes == "string") {
			attributes = [attributes];
		}

		let groups = [];
		itemArray.forEach(item => {
			let groupKey = null;
			for(let key in groups) {
				let group = groups[key];

				let matchAll = true;
				attributes.forEach(attr => {
					if(group.attributes[attr] != item[attr]) {
						matchAll = false;
					}
				});

				if(matchAll) {
					groupKey = key;
				}
			}

			if(groupKey == null) {
				let group = {};
				group.attributes = [];
				attributes.forEach(attr => {
					group.attributes[attr] = item[attr];
				});
				group.items = [item];
				groups.push(group);
			}
			else {
				groups[groupKey].items.push(item);
			}
		});

		return groups;
	}

	async fetchGbifImages(taxonData) {
		//GBIF API search
		// https://api.gbif.org/v1/species/match?verbose=true&family=CERCOPIDAE&genus=Lepyronia
		let family = taxonData.family.family_name;
		let genus = taxonData.genus.genus_name;

		let gbifData = await fetch("https://api.gbif.org/v1/species/match?verbose=true&family="+family+"&genus="+genus).then(response => response.json());
		
		console.log(gbifData);

		// https://api.gbif.org/v1/species/2015780
		
		// https://api.gbif.org/v1/species/2015780/media

		let gbifMedia = await fetch("https://api.gbif.org/v1/species/"+gbifData.genusKey+"/media").then(response => response.json());

		console.log(gbifMedia)

		

		return gbifMedia;
	}

	/*
	* Function: renderData
	*/
	async renderData(taxonId = null) {

		if(taxonId != null) {
			this.taxonId = taxonId;
		}

		console.log("taxon - renderData", this.taxonId);

		if(this.taxonId == null) {
			this.taxonId = 31907
			this.taxonId = 18054;
			//this.taxonId = 350;
			this.taxonId = 39708;
			this.taxonId = 30652;
			//return;
		}

		this.resultManager.renderMsg(false);

		const fragment = document.getElementById("result-taxon-container-content-template");
		const instance = document.importNode(fragment.content, true);
		
		let taxonData = await fetch('https://supersead.humlab.umu.se/jsonapi/taxon/'+this.taxonId).then(response => response.json());

		console.log(taxonData);

		let taxonSpecString = this.sqs.formatTaxon(taxonData);

		$("#rcb-species-value", instance).html(taxonSpecString);


		let measurableAttributesHtml = "";
		taxonData.measured_attributes.forEach(attr => {
			let value = attr.data;
			if(parseFloat(value)) {
				value = parseFloat(value);
			}
			//First letter to lower-case
			let atttributeType = attr.attribute_type.charAt(0).toLowerCase() + attr.attribute_type.slice(1);
			measurableAttributesHtml += "<div>"+attr.attribute_measure+" "+atttributeType+" "+value+" "+attr.attribute_units+"</div>";
		});
		$("#rcb-measurable-attributes", instance).html(measurableAttributesHtml);

		let taxaNotesHtml = "";
		taxonData.taxonomy_notes.forEach(taxaNote => {

			let textValue = taxaNote.taxonomy_notes;
			if(this.isUrl(taxaNote.taxonomy_notes)) {
				textValue = "<a target='_blank' href='"+taxaNote.taxonomy_notes+"'>"+taxaNote.taxonomy_notes+"</a>";
			}

			taxaNotesHtml += "<div>";
			taxaNotesHtml += "<h4>"+taxaNote.biblio.authors+"</h4>";
			taxaNotesHtml += textValue;
			taxaNotesHtml += "</div><br />";
			//registerTooltip(anchor, msg, options = {})
			//this.sqs.tooltipManager.registerTooltip("#rcb-taxonomic-notes", "Hello!");
		});
		$("#rcb-taxonomic-notes", instance).html(taxaNotesHtml);

		let distHtml = "";
		taxonData.distribution.forEach(dist => {
			let tooltipId = nanoid();
			distHtml += "<h4 id='"+tooltipId+"'>"+dist.biblio.authors+"</h4>";
			distHtml += "<div>"+dist.distribution_text+"</div><br />";

			let tooltipText = dist.biblio.full_reference ? dist.biblio.full_reference : dist.biblio.authors+" "+dist.biblio.title
			tooltipText = "<h3 class='tooltip-header'>Reference</h3>"+tooltipText;
			this.sqs.tooltipManager.registerTooltip("#"+tooltipId, tooltipText, { drawSymbol: true });
		});
		$("#rcb-distribution", instance).html(distHtml);


		let bioHtml = "";
		taxonData.biology.forEach(bio => {
			let tooltipId = nanoid();
			bioHtml += "<h4 id='"+tooltipId+"'>"+bio.biblio.authors+"</h4>";
			bioHtml += "<div>"+bio.biology_text+"</div><br />";

			let tooltipText = bio.biblio.full_reference ? bio.biblio.full_reference : bio.biblio.authors+" "+bio.biblio.title
			tooltipText = "<h3 class='tooltip-header'>Reference</h3>"+tooltipText;
			this.sqs.tooltipManager.registerTooltip("#"+tooltipId, tooltipText, { drawSymbol: true });
		});
		$("#rcb-biology", instance).html(bioHtml);

		let seasonalityGroups = this.groupByAttribute(taxonData.taxa_seasonality, ["activity_type_id", "location_id"]);

		seasonalityGroups.forEach(group => {
			let locationName = group.items[0].location.location_name;
			let activityName = group.items[0].activity_type.activity_type;
			let header = activityName+" - "+locationName;
			
			group.domId = "rcb-year-wheel-"+nanoid();
			let seasonalityGroupTooltipId = "tt-"+nanoid();
			let html = "<div class='rcb-seasonlity-year-wheel'>";
			html += "<h4 id='"+seasonalityGroupTooltipId+"' class='centered-label'>"+header+"</h4>";
			html += "<div id='"+group.domId+"' class='rcb-year-wheel'></div>";
			html += "</div>";
			$("#rcb-seasonlity-year-wheels", instance).append(html);

			let tooltipText = "The activity: '"+activityName+"' is known for this species in the location: '"+locationName+"'";
			if(group.items[0].activity_type.description) {
				tooltipText += "<br />Activity description: '"+group.items[0].activity_type.description+"'";
			}
			
			this.sqs.tooltipManager.registerTooltip("#"+seasonalityGroupTooltipId, tooltipText, { drawSymbol: true });
		});

		$('#result-taxon-container').html("");
		$('#result-taxon-container').append(instance);
		$('#result-taxon-container').show();

		if(!Config.useExternalTaxonApis) {
			$("#result-taxon-image-container").html("");
			$("#result-taxon-image-container").addClass("result-taxon-image-container-2-col");
			$("#result-taxon-image-container").append("<div><img src='/figure1.png' /></div>");
			$("#result-taxon-image-container").append("<div><img src='/figure2.png' /></div>");
			$("#result-taxon-image-container").append("<div><img src='/figure3.png' /></div>");
		}
		else {
			this.fetchGbifImages(taxonData).then(gbifMedia => {
				$("#result-taxon-image-container").html("");
	
				if(gbifMedia.results.length > 1) {
					$("#result-taxon-image-container").addClass("result-taxon-image-container-2-col");
				}
	
				gbifMedia.results.forEach(gbifImage => {
					$("#result-taxon-image-container").append("<div><img src='"+gbifImage.identifier+"' /><div class='attribution'>GBIF</div></div>");
				});
			});
		}

		seasonalityGroups.forEach(group => {
			this.renderYearWheel(group.domId, group.items);
		})

		if(seasonalityGroups.length == 0) {
			const noDataBoxFrag = document.getElementById("no-data-box");
			const noDataBox = document.importNode(noDataBoxFrag.content, true);
			$("#rcb-seasonlity-year-wheels").html("");
			$("#rcb-seasonlity-year-wheels").append(noDataBox);
		}

		this.resultManager.sqs.sqsEventDispatch("resultModuleRenderComplete");

		return true;
	}

	renderYearWheel(anchor, seasonalityItems = []) {

		let selectedMonths = [];
		seasonalityItems.forEach(item => {
			selectedMonths.push(item.season.season_name);
		});

		let chartConfig = {
		type : 'pie',
		width : '100%',
		height : '100%',
		x : '0px',
		y : '0px',
		'scale-r': {
			'ref-angle':270
		},
		backgroundColor: 'rgba(0, 0, 0, 0)',
		title : {
			text : '',
			fontSize : '12px'
		},
		plot : {
			borderWidth : '1px',
			borderColor : '#888',
			borderAlpha : 1.0,
			slice : '40%',
			//pieTransform : 'flow=5',
			hoverState : {
			visible : false
			},
			tooltip : {
			text : '%plot-description'
			},
			valueBox : {
			placement : 'fixed=50%;60%',
			fontSize : '11px',
			fontColor: "#000",
			text : '%t'
			}
		},
		plotarea : {
			margin : '15px 5px 5px 5px'
		},
		series:[]
		};

		let months = [];
		months.push({
			name: "Janary",
			shortName: "Jan"
		});
		months.push({
			name: "February",
			shortName: "Feb"
		});
		months.push({
			name: "March",
			shortName: "Mar"
		});
		months.push({
			name: "April",
			shortName: "Apr"
		});
		months.push({
			name: "May",
			shortName: "May"
		});
		months.push({
			name: "June",
			shortName: "Jun"
		});
		months.push({
			name: "July",
			shortName: "Jul"
		});
		months.push({
			name: "August",
			shortName: "Aug"
		});
		months.push({
			name: "September",
			shortName: "Sep"
		});
		months.push({
			name: "October",
			shortName: "Oct"
		});
		months.push({
			name: "November",
			shortName: "Nov"
		});
		months.push({
			name: "December",
			shortName: "Dec"
		});


		const color = new Color();
		let selectionColor = color.getColorScheme(1);

		months.forEach(month => {
			let bgColor = "#fff";
			let fontColor = "#000";
			if(selectedMonths.includes(month.name)) {
				bgColor = selectionColor;
				bgColor = "#000";
				fontColor = "#fff";
			}
			
			chartConfig.series.push({
				values : [1],
				backgroundColor : bgColor,
				valueBox: {
					fontColor: fontColor,
				},
				tooltip: {
					backgroundColor: "#000"
				},
				text: month.shortName,
				description: month.name,
			});
		});

		zingchart.render({
			id : anchor,
			width: '100%',
			height: '100%',
			data : chartConfig,
		});

	}

	isUrl(string) {
		let url;
		
		try {
			url = new URL(string);
		} catch (_) {
			return false;  
		}

		return url.protocol === "http:" || url.protocol === "https:";
	}
	
	getRenderStatus() {
		return this.renderStatus;
	}
	
	/*
	* Function: unrender
	*/
	unrender() {
		$("#result-taxon-container").hide();
	}
	
	/*
	* Function: exportSettings
	*/
	exportSettings() {
		return {
		};
	}
	
	/*
	* Function: importSettings
	*/
	importSettings(settings) {
	}

}

export { ResultTaxon as default }