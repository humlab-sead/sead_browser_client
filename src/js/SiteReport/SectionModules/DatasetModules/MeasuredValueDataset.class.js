import DatasetModule from "./DatasetModule.class";
/*
* Class: MeasuredValueDataset
 */

class MeasuredValueDataset extends DatasetModule {
	constructor(analysis) {
		super();
		this.sqs = analysis.sqs;
		this.analysis = analysis;
		this.section = analysis.section;
		this.data = analysis.data;
		this.analyses = [];
		this.datasetFetchPromises = [];
		this.datasets = [];
		this.buildIsComplete = false;
		this.methodGroupId = 2;

		this.metaDataFetchingPromises = [];
		this.metaDataFetchingPromises.push(this.analysis.fetchMethodGroupMetaData(this.methodGroupId));
		this.metaDataFetchingPromises.push(this.analysis.fetchMethodsInGroup(this.methodGroupId));
	}

	offerAnalyses(datasets, sectionsList) {
		this.sectionsList = sectionsList;
		for(let key = datasets.length - 1; key >= 0; key--) {
			if(datasets[key].methodGroupId == this.methodGroupId) { //Claim all in method group 2
				console.log("MeasuredValueDataset claiming ", datasets[key].datasetId);
				let dataset = datasets.splice(key, 1)[0];
				this.datasets.push(dataset);
			}
		}

		return new Promise((resolve, reject) => {
			for(let key in this.datasets) {
				let p = this.analysis.fetchAnalysis(this.datasets[key]);
				this.datasetFetchPromises.push(p);
				p = this.fetchDataset(this.datasets[key]);
				this.datasetFetchPromises.push(p);
			}
			
			Promise.all(this.datasetFetchPromises).then(() => {
				if(this.datasets.length > 0) {
					this.buildSection(this.datasets);
				}
				resolve();
			});
		});
	}
	
	destroy() {
	}
	
	async fetchDataset(dataset) {
		await new Promise((resolve, reject) => {
			$.ajax(this.sqs.config.siteReportServerAddress+"/qse_dataset2?dataset_id=eq."+dataset.datasetId, {
				method: "get",
				dataType: "json",
				success: async (data, textStatus, xhr) => {
					dataset.dataPoints = [];
					data.map((dataPoint) => {
						dataset.dataPoints.push({
							datasetId: dataPoint.dataset_id,
							analysisEntityId: dataPoint.analysis_entity_id,
							physicalSampleId: dataPoint.physical_sample_id,
							sampleGroupId: dataPoint.sample_group_id,
							sampleTypeId: dataPoint.sample_type_id,
							sampleName: dataPoint.sample_name
						});
					});

					await this.requestMetaDataForDataset(dataset);
					await this.fetchMeasuredValues(dataset);
					resolve();
				}
			});
		});
	}

	async fetchMeasuredValues(dataset) {
		let analysisEntityIds = new Set();
		dataset.dataPoints.map((dp) => {
			analysisEntityIds.add(dp.analysisEntityId);
		});
		let measuredValues = await this.sqs.fetchFromTable("measured_values", "analysis_entity_id", Array.from(analysisEntityIds));

		dataset.dataPoints.map((dp) => {
			measuredValues.map((mv) => {
				if(dp.analysisEntityId == mv.analysis_entity_id) {
					dp.measuredValue = mv.measured_value;
				}
			});
		});
	}

	async requestMetaDataForDataset(dataset) {
		await this.analysis.fetchSampleType(dataset);
	}

	
	buildSection(datasets) {
		//Create sections
		//We want to create as many sections as there are different types of methods in our datasets (usually just one though)
		datasets.map((dataset) => {
			let section = this.analysis.getSectionByMethodId(dataset.methodId);
			if(section === false) {
				let method = this.analysis.getMethodMetaDataById(dataset.methodId);
				var sectionsLength = this.sectionsList.push({
					"name": dataset.methodId,
					"title": dataset.methodName,
					"methodDescription": method.description,
					"collapsed": true,
					"contentItems": []
				});
				section = this.sectionsList[sectionsLength-1];
			}
			this.appendDatasetToSection(section, dataset);
		});
		
		this.buildIsComplete = true;
		this.sqs.sqsEventDispatch("siteAnalysisBuildComplete");
	}

	appendDatasetToSection(section, dataset) {
		var analysis = dataset;
		
		//Defining columns
		var columns = [
			{
				"dataType": "number",
				"pkey": true,
				"title": "Analysis entity id"
			},
			{
				"dataType": "number",
				"pkey": false,
				"title": "Sample name"
			},
			{
				"dataType": "number",
				"pkey": false,
				"title": "Sample group"
			},
			{
				"dataType": "number",
				"pkey": false,
				"title": "Sample type"
			},
			{
				"dataType": "string",
				"pkey": false,
				"title": "Measured value"
			}
		];
		
		//Filling up the rows
		var rows = [];
		for(var k in analysis.dataPoints) {
			
			var row = [
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataPoints[k].analysisEntityId
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataPoints[k].sampleName
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataPoints[k].sampleGroupId
				},
				{
					"type": "cell",
					"tooltip": analysis.dataPoints[k].sampleType.description,
					"value": analysis.dataPoints[k].sampleType.type_name
				},
				{
					"type": "cell",
					"tooltip": "",
					"value": analysis.dataPoints[k].measuredValue
				}
			];
			rows.push(row);
		}
		
		//Defining the contentItem
		let contentItem = {
			"name": analysis.datasetId,
			"title": analysis.datasetName,
			"titleTooltip": "Name of the dataset",
			"datasetId": analysis.datasetId,
			"data": {
				"columns": columns,
				"rows": rows
			},
			"renderOptions": [
				{
					"name": "Spreadsheet",
					"selected": false,
					"type": "table"
				},
				{
					"name": "Bar chart",
					"selected": true,
					"type": "bar",
					"options": [
						{
							"title": "X axis",
							"type": "select",
							"selected": 1,
							//"options": [1, 2, 3, 4],
							"options": [
								{
									"title": 1,
									"value": 1,
									"selected": true
								},
								{
									"title": 2,
									"value": 2,
								},
								{
									"title": 3,
									"value": 3,
								},
								{
									"title": 4,
									"value": 4,
								},
							]
						},
						{
							"title": "Y axis",
							"type": "select",
							"selected": 4,
							//"options": [1, 2, 3, 4],
							"options": [
								{
									"title": 1,
									"value": 1,
								},
								{
									"title": 2,
									"value": 2,
									"selected": true
								},
								{
									"title": 3,
									"value": 3,
								},
								{
									"title": 4,
									"value": 4,
								},
							]
						},
						{
							"title": "Sort",
							"type": "select",
							"selected": 4,
							//"options": [1, 2, 3, 4],
							"options": [
								{
									"title": 1,
									"value": 1,
									"selected": true
								},
								{
									"title": 2,
									"value": 2,
								},
								{
									"title": 3,
									"value": 3,
								},
								{
									"title": 4,
									"value": 4,
								},
							]
						}
					]/*,
					"options": {
						"xAxis": 1,
						"yAxis": 5,
						"sort": 5
					}*/
				}
			]
		};
		section.contentItems.push(contentItem);
	}
	
	isBuildComplete() {
		return this.buildIsComplete;
	}
}

export { MeasuredValueDataset as default }