var Config = {
	serverRoot: "http://supersead.humlab.umu.se", //for images and such
	serverAddress: "http://dev.humlab.umu.se:8089", //for json data
	//serverAddress: "http://localhost:8089", //for json data - test server for testing range filters - makes random data
	//viewStateServerAddress: "http://localhost:8081",
	viewStateServerAddress: "http://seadserv.humlab.umu.se:8081",
	//siteReportServerAddress: "http://dataserver.humlab.umu.se:3000", //for site reports, which uses a PostgREST interface - production db (3000)
	siteReportServerAddress: "http://seadserv.humlab.umu.se:3000",
	//siteReportServerAddress: "http://dataserver.humlab.umu.se:3001", //for site reports, which uses a PostgREST interface - development db (3001)
    //serverAddress: "http://dev.humlab.umu.se:9080", //VAS
	//serverAddress: "http://dev.humlab.umu.se:9091" //for json data
	//serverAddress: "http://dev.humlab.umu.se:8089"
	defaultResultModule: "mosaic",
	facetSectionDefaultWidth: 30, //percentage of total window width
	facetBodyHeight: 268, //default facet height in px
	discreteFacetRowHeight: 20, //used for calculations in the facet sliding window (paging) functionality
	discreteFacetTextSize: 10, //used for calculations in the facet sliding window  (paging) functionality
	cookieWarningEnabled: false, //cookie warning popup - disabled, because we're actually not using cookies atm
	viewstateLoadingScreenEnabled: false,
	requireLoginForViewstateStorage: true,
	activePortal: "general",
	portals: [
		{
			name: "general",
			title: "<i class=\"fa fa-globe\" aria-hidden=\"true\"></i> General",
			//color: "#00d",
			color: "#444",
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
			name: "palaeo",
			title: "<i class=\"fa fa-bug\" aria-hidden=\"true\"></i> Palaeoentomology",
			//color: "#d00",
			color: "#444",
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
			color: "#444",
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
			color: "#444",
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
			color: "#444",
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
			color: "#444",
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