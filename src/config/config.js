var Config = {
	dataLicense: {
		name: "Creative Commons Attribution 4.0 International",
		shortName: "CC-BY-4.0",
		url: "https://creativecommons.org/licenses/by/4.0/"
	},
	serverRoot: "http://supersead.humlab.umu.se", //for images and such
	//serverAddress: "http://dev.humlab.umu.se:8089", //for json data (old)
	serverAddress: "https://seadserv.humlab.umu.se:8089", //New server
	//serverAddress: "http://localhost:8089", //for json data - test server for testing range filters - makes random data
	viewStateServerAddress: "http://seadserv.humlab.umu.se:8081",
	siteReportServerAddress: "http://seadserv.humlab.umu.se:3000", //for site reports, which uses a PostgREST interface - production db (3000)
	//siteReportServerAddress: "http://seadserv.humlab.umu.se:8080", //for site reports, which uses a PostgREST interface - development db
	defaultResultModule: "map", //map, mosaic or table
	facetSectionDefaultWidth: 30, //percentage of total window width
	facetBodyHeight: 268, //default facet height in px
	discreteFacetRowHeight: 20, //used for calculations in the facet sliding window (paging) functionality
	discreteFacetTextSize: 10, //used for calculations in the facet sliding window  (paging) functionality
	cookieWarningEnabled: true, //cookie warning popup - disabled, because we're actually not using cookies atm
	viewstateLoadingScreenEnabled: false,
	requireLoginForViewstateStorage: true,
	rangeFilterFuzzyLabels: true, //Rounds labels to avoid very long numbersm
	screenMobileWidthBreakPoint: 720, //If the screen wisiteReportServerAddressdth is smaller than this, the layout of the site goes into mobile mode
	siteReportExportAttributionString: "Buckland P.I., Sjölander M., Eriksson E.J. (2018) Strategic Environmental Archaeology Database (SEAD). In: Smith C. (eds) Encyclopedia of Global Archaeology. Springer, Cham. DOI:10.1007/978-3-319-51726-1_833-2",
	keyColors: [ //Colors used as source/origin-colors when generating color schemes
		"5B83AD",
		"A02000",
		"ff0000",
		"00ff00",
		"0000ff",
		"ffff00",
		"ff00ff",
		"00ffff",
		"0000ff"
	],
	activePortal: "general",
	portals: [
		{
			name: "general",
			title: "<i class=\"fa fa-globe\" aria-hidden=\"true\"></i> General",
			//color: "#00d",
			color: "#2d5e8d",
			filters: [
				"sample_groups",
				"sites",
				"country",
				"geochronology",
				"relative_age_name",
				"ecocode",
				"ecocode_system",
				"tbl_denormalized_measured_values_33_0",
				"tbl_denormalized_measured_values_33_82",
				"tbl_denormalized_measured_values_32",
				"tbl_denormalized_measured_values_37",
				"family",
				"genus",
				"species",
				"species_author",
				"dataset_master"
			]
		},
		{
			name: "palaeo",
			title: "<i class=\"fa fa-bug\" aria-hidden=\"true\"></i> Palaeoentomology",
			//color: "#d00",
			color: "#2d5e8d",
			filters: [
				"sample_groups",
				"sites",
				"country",
				"geochronology",
				"relative_age_name",
				"ecocode",
				"ecocode_system",
				"tbl_denormalized_measured_values_33_0",
				"tbl_denormalized_measured_values_33_82",
				"tbl_denormalized_measured_values_32",
				"tbl_denormalized_measured_values_37",
				"family",
				"genus",
				"species",
				"species_author"
			]
		},
		{
			name: "dendro",
			title: "<i class=\"fa fa-tree\" aria-hidden=\"true\"></i> Dendrochronology",
			//color: "#0d0",
			color: "#2d5e8d",
			filters: [
				"sample_groups",
				"sites",
				"country",
				"geochronology",
				"relative_age_name",
				"ecocode",
				"ecocode_system",
				"tbl_denormalized_measured_values_33_0",
				"tbl_denormalized_measured_values_33_82",
				"tbl_denormalized_measured_values_32",
				"tbl_denormalized_measured_values_37",
				"family",
				"genus",
				"species",
				"species_author"
			]
		},
		{
			name: "archaeobotany",
			title: "<i class=\"fa fa-adjust\" aria-hidden=\"true\"></i> Archaeobotany",
			//color: "#d0d",
			color: "#2d5e8d",
			filters: [
				"sample_groups",
				"sites",
				"country",
				"geochronology",
				"relative_age_name",
				"ecocode",
				"ecocode_system",
				"tbl_denormalized_measured_values_33_0",
				"tbl_denormalized_measured_values_33_82",
				"tbl_denormalized_measured_values_32",
				"tbl_denormalized_measured_values_37",
				"family",
				"genus",
				"species",
				"species_author"
			]
		},
		{
			name: "pollen",
			title: "<i class=\"fa fa-leaf\" aria-hidden=\"true\"></i> Pollen",
			//color: "#d0d",
			color: "#2d5e8d",
			filters: [
				"sample_groups",
				"sites",
				"country",
				"geochronology",
				"relative_age_name",
				"ecocode",
				"ecocode_system",
				"tbl_denormalized_measured_values_33_0",
				"tbl_denormalized_measured_values_33_82",
				"tbl_denormalized_measured_values_32",
				"tbl_denormalized_measured_values_37",
				"family",
				"genus",
				"species",
				"species_author"
			]
		},
		{
			name: "ceramic",
			title: "<i class=\"fa fa-beer\" aria-hidden=\"true\"></i> Ceramic",
			//color: "#d0d",
			color: "#2d5e8d",
			filters: [
				"sample_groups",
				"sites",
				"country",
				"geochronology",
				"relative_age_name",
				"ecocode",
				"ecocode_system",
				"tbl_denormalized_measured_values_33_0",
				"tbl_denormalized_measured_values_33_82",
				"tbl_denormalized_measured_values_32",
				"tbl_denormalized_measured_values_37",
				"family",
				"genus",
				"species",
				"species_author"
			]
		}
	]
}

export { Config as default }