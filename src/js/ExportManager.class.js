import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import JSZip from 'jszip';

class ExportManager {
    constructor(sqs) {
        this.sqs = sqs;
    }

    //UNTESTED METHOD
    async getXlsxBookExportForMultipleSites(sites, returnObjectUrl = true) {
        const wb = new ExcelJS.Workbook();

        // --- SITES SHEET ---
        const sitesSheet = wb.addWorksheet("Sites");
        // Define columns for site info
        const siteColumns = [
            { header: "Site ID", key: "site_id" },
            { header: "Site name", key: "site_name" },
            { header: "Site description", key: "site_description" },
            { header: "Latitude (WGS84)", key: "latitude_dd" },
            { header: "Longitude (WGS84)", key: "longitude_dd" },
            { header: "License", key: "license" },
            { header: "Date of export", key: "export_date" },
            { header: "Webclient version", key: "webclient_version" },
            { header: "API version", key: "api_version" },
            { header: "Database attribution", key: "db_attribution" }
        ];
        sitesSheet.columns = siteColumns;

        // Add site rows
        sites.forEach(site => {
            sitesSheet.addRow({
                site_id: site.site_id,
                site_name: site.site_name,
                site_description: site.site_description,
                latitude_dd: site.latitude_dd,
                longitude_dd: site.longitude_dd,
                license: this.sqs.config.dataLicense?.name + " (" + this.sqs.config.dataLicense?.url + ")",
                export_date: new Date().toLocaleDateString('sv-SE'),
                webclient_version: this.sqs.config.version,
                api_version: site.api_source,
                db_attribution: this.sqs.config.dataAttributionString
            });
        });
        sitesSheet.getRow(1).font = { bold: true };

        // --- SAMPLES SHEET ---
        const samplesSheet = wb.addWorksheet("Samples");
        // Gather all sample columns from all sites
        let allSampleColumns = new Set();
        sites.forEach(site => {
            if (Array.isArray(site.samples)) {
                site.samples.forEach(sample => {
                    Object.keys(sample).forEach(key => allSampleColumns.add(key));
                });
            }
        });
        // Add Site ID and Site name columns first
        const sampleColumns = [
            { header: "Site ID", key: "site_id" },
            { header: "Site name", key: "site_name" },
            ...Array.from(allSampleColumns).map(key => ({ header: key, key }))
        ];
        samplesSheet.columns = sampleColumns;

        // Add all samples, with site info
        sites.forEach(site => {
            if (Array.isArray(site.samples)) {
                site.samples.forEach(sample => {
                    samplesSheet.addRow({
                        site_id: site.site_id,
                        site_name: site.site_name,
                        ...sample
                    });
                });
            }
        });
        samplesSheet.getRow(1).font = { bold: true };

        // --- ANALYSES SHEET ---
        const analysesSheet = wb.addWorksheet("Analyses");
        // Gather all analysis columns from all sites
        let allAnalysisColumns = new Set();
        sites.forEach(site => {
            if (Array.isArray(site.analyses)) {
                site.analyses.forEach(analysis => {
                    Object.keys(analysis).forEach(key => allAnalysisColumns.add(key));
                });
            }
        });
        // Add Site ID and Site name columns first
        const analysisColumns = [
            { header: "Site ID", key: "site_id" },
            { header: "Site name", key: "site_name" },
            ...Array.from(allAnalysisColumns).map(key => ({ header: key, key }))
        ];
        analysesSheet.columns = analysisColumns;

        // Add all analyses, with site info
        sites.forEach(site => {
            if (Array.isArray(site.analyses)) {
                site.analyses.forEach(analysis => {
                    analysesSheet.addRow({
                        site_id: site.site_id,
                        site_name: site.site_name,
                        ...analysis
                    });
                });
            }
        });
        analysesSheet.getRow(1).font = { bold: true };

        // --- EXPORT ---
        let buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/octet-stream' });

        if (returnObjectUrl) {
            const blobUrl = URL.createObjectURL(blob);
            return blobUrl;
        }
        return blob;
    }

    async getCsvExport(siteData, returnObjectUrl = true) {
        const sheetsData = await this.prepareCsvExport(siteData); // Get the structured data from your existing method
        const zip = new JSZip();

        // 1. Generate CSV Strings for Each Sheet
        for (const sheetName in sheetsData) {
            if (sheetsData.hasOwnProperty(sheetName)) {
                const sheetArray = sheetsData[sheetName];

                if (sheetArray && sheetArray.length > 0) {
                    // Use papaparse to convert the array of arrays to a CSV string
                    const csvString = Papa.unparse(sheetArray, {
                        quotes: true, // Enclose fields with double quotes
                        header: false, // Assuming your sheetArray already includes the header row
                        delimiter: ",", // Standard CSV delimiter
                    });

                    // Add the CSV string to the ZIP file
                    // Use a clean filename for each sheet
                    const filename = `${sheetName.replace(/[^a-zA-Z0-9]/g, '_')}.csv`; // Sanitize sheet name for filename
                    zip.file(filename, csvString);
                }
            }
        }

        // 2. Create the ZIP Archive
        try {
            let content = await zip.generateAsync({ type: "blob" });
            
            if(returnObjectUrl) {
                content = URL.createObjectURL(content);
            }

            return content;

        } catch (error) {
            console.error("Error generating or downloading ZIP:", error);
        }
    }

    async prepareCsvExport(siteData) {
        // --- SITE SHEET ---
        const siteMetaColumns = [
            "Site identifier",
            "License", 
            "Date of export",
            "Webclient version",
            "API version",
            "Site name",
            "Site description",
            "Latitude (WGS84)",
            "Longitude (WGS84)",
            "Database attribution",
        ];
        const siteMetaRow = [
            this.siteId,
            this.sqs.config.dataLicense.name+" ("+this.sqs.config.dataLicense.url+")",
            new Date().toLocaleDateString('sv-SE'),
            this.sqs.config.version,
            siteData.api_source,
            siteData.site_name,
            siteData.site_description,
            siteData.latitude_dd,
            siteData.longitude_dd,
            this.sqs.config.dataAttributionString,
        ];
        const siteSheet = [siteMetaColumns, siteMetaRow];

        // --- SAMPLES SHEET ---
        let samplesSheet = [];
        let samplesHeader = [];
        let samplesRows = [];
        for(let key in this.sqs.siteReportManager.siteReport.data.sections) {
            let section = this.sqs.siteReportManager.siteReport.data.sections[key];
            if(section.name == "samples") {
                for(let key2 in section.contentItems) {
                    let contentItem = section.contentItems[key2];
                    if(contentItem.name == "sampleGroups") {
                        let subTableColumnKey = null;
                        let columnKeys = [];
                        let sampleGroupColumns = [];

                        contentItem.data.columns.forEach((column, index) => {
                            if(column.dataType != "subtable" && column.dataType != "component") {
                                columnKeys.push(index);
                                sampleGroupColumns.push(column.title);
                            }
                            if(column.dataType == "subtable") {
                                subTableColumnKey = index;
                            }
                        });

                        if(subTableColumnKey != null) {
                            contentItem.data.rows.forEach(sampleGroupRow => {
                                let sampleGroupCsvRowValues = [];
                                columnKeys.forEach(key3 => {
                                    let v = this.sqs.parseStringValueMarkup(sampleGroupRow[key3].value, { drawSymbol: false });
                                    v = this.stripHtmlUsingDOM(v);
                                    sampleGroupCsvRowValues.push(v);
                                });

                                let subTable = sampleGroupRow[subTableColumnKey].value;
                                let columns = [...sampleGroupColumns];
                                subTable.columns.forEach(subTableColumn => {
                                    columns.push(subTableColumn.title);
                                });

                                if(samplesHeader.length === 0) {
                                    samplesHeader = columns;
                                }

                                subTable.rows.forEach(subTableRow => {
                                    let csvRow = [...sampleGroupCsvRowValues];
                                    subTableRow.forEach((subTableCell, index) => {
                                        let cellValue = this.sqs.parseStringValueMarkup(subTableCell.value, { drawSymbol: false });
                                        cellValue = this.stripHtmlUsingDOM(cellValue);
                                        csvRow.push(cellValue);
                                    });
                                    samplesRows.push(csvRow);
                                });
                            });
                        }
                    }
                }
            }
        }
        if(samplesHeader.length > 0) {
            samplesSheet.push(samplesHeader, ...samplesRows);
        }

        // --- ANALYSES SHEET ---
        let analysesSheets = {}; // { worksheetName: [ [header], [row1], ... ] }
        for(let key in this.sqs.siteReportManager.siteReport.data.sections) {
            let section = this.sqs.siteReportManager.siteReport.data.sections[key];
            if(section.name == "analyses") {
                section.sections.forEach(analysisSection => {
                    let worksheetName = analysisSection.title;
                    let analysisRows = [];
                    let analysisHeader = [];
                    let analysisColumnRowCreated = false;

                    analysisSection.contentItems.forEach(contentItem => {
                        if(this.sqs.isPromise(contentItem)) {
                            return;
                        }
                        let dataTable = contentItem.data;
                        let subTableColumnKey = null;
                        let sampleColumns = [];
                        let columnKeys = [];
                        dataTable.columns.forEach((column, index) => {
                            if(column.dataType != "subtable" && column.dataType != "component") {
                                columnKeys.push(index);
                                sampleColumns.push(column.title);
                            }
                            if(column.dataType == "subtable") {
                                subTableColumnKey = index;
                            }
                        });

                        if(subTableColumnKey != null) {
                            dataTable.rows.forEach(analysisRow => {
                                let analysisCsvRowValues = [];
                                columnKeys.forEach(key3 => {
                                    let v = this.sqs.parseStringValueMarkup(analysisRow[key3].value, { drawSymbol: false });
                                    v = this.stripHtmlUsingDOM(v);
                                    analysisCsvRowValues.push(v);
                                });

                                let subTable = analysisRow[subTableColumnKey].value;
                                let valueColumns = [...sampleColumns];
                                subTable.columns.forEach(subTableColumn => {
                                    valueColumns.push(subTableColumn.title);
                                });

                                if(!analysisColumnRowCreated) {
                                    analysisHeader = valueColumns;
                                    analysisColumnRowCreated = true;
                                }

                                subTable.rows.forEach(subTableRow => {
                                    let csvRow = [...analysisCsvRowValues];
                                    subTableRow.forEach((subTableCell, index) => {
                                        let cellValue = this.sqs.parseStringValueMarkup(subTableCell.value, { drawSymbol: false });
                                        cellValue = this.stripHtmlUsingDOM(cellValue);
                                        csvRow.push(cellValue);
                                    });
                                    analysisRows.push(csvRow);
                                });
                            });
                        } else {
                            // No subtable, just flat data
                            if(!analysisColumnRowCreated) {
                                analysisHeader = sampleColumns;
                                analysisColumnRowCreated = true;
                            }
                            dataTable.rows.forEach(row => {
                                let csvRow = [];
                                columnKeys.forEach(key3 => {
                                    let v = this.sqs.parseStringValueMarkup(row[key3].value, { drawSymbol: false });
                                    v = this.stripHtmlUsingDOM(v);
                                    csvRow.push(v);
                                });
                                analysisRows.push(csvRow);
                            });
                        }
                    });

                    if(analysisHeader.length > 0) {
                        analysesSheets[worksheetName] = [analysisHeader, ...analysisRows];
                    }
                });
            }
        }

        // Return an object with all "worksheets"
        return {
            Site: siteSheet,
            Samples: samplesSheet,
            ...analysesSheets // Each analysis worksheet as its own key
        };
    }

    async getXlsxBookExport(siteData, returnObjectUrl = true) {

        const wb = new ExcelJS.Workbook();
        const siteWorksheet = wb.addWorksheet("Site");
        const samplesWorksheet = wb.addWorksheet("Samples");

        let siteMetaColumns = [
            "Site identifier",
            "License", 
            "Date of export",
            "Webclient version",
            "API version",
            "Site name",
            "Site description",
            "Latitude (WGS84)",
            "Longitude (WGS84)",
            "Database attribution",
        ];

        let headerRow = siteWorksheet.addRow(siteMetaColumns);
        headerRow.eachCell((cell) => {
            cell.font = { bold: true };
        });

        let siteMetaRow = [
            this.siteId,
            this.sqs.config.dataLicense.name+" ("+this.sqs.config.dataLicense.url+")",
            new Date().toLocaleDateString('sv-SE'),
            this.sqs.config.version,
            siteData.api_source,
            siteData.site_name,
            siteData.site_description,
            siteData.latitude_dd,
            siteData.longitude_dd,
            this.sqs.config.dataAttributionString,
        ];

        siteWorksheet.addRow(siteMetaRow);


        for(let key in this.sqs.siteReportManager.siteReport.data.sections) {
            let section = this.sqs.siteReportManager.siteReport.data.sections[key];

            let samplesColumnRowCreated = false;

            if(section.name == "samples") {
                for(let key2 in section.contentItems) {
                    let contentItem = section.contentItems[key2];
                    if(contentItem.name == "sampleGroups") {
                        let subTableColumnKey = null;
                        let columnKeys = [];
                        let sampleGroupColumns = [];

                        contentItem.data.columns.forEach((column, index) => {
                            //we exclude columns with a dataType marked as subtables and components from the export
                            
                            if(column.dataType != "subtable" && column.dataType != "component") {
                                columnKeys.push(index);
                                sampleGroupColumns.push(column.title);
                            }

                            if(column.dataType == "subtable") {
                                subTableColumnKey = index;
                            }
                        });


                        if(subTableColumnKey != null) {
                            contentItem.data.rows.forEach(sampleGroupRow => {

                                let sampleGroupExcelRowValues = [];
                                columnKeys.forEach(key3 => {
                                    let v = this.sqs.parseStringValueMarkup(sampleGroupRow[key3].value, { drawSymbol: false });
                                    v = this.stripHtmlUsingDOM(v);
                                    sampleGroupExcelRowValues.push(v);
                                });

                                let subTable = sampleGroupRow[subTableColumnKey].value;

                                let columns = [...sampleGroupColumns];
                                subTable.columns.forEach(subTableColumn => {
                                    columns.push(subTableColumn.title);
                                });

                                if(!samplesColumnRowCreated) {
                                    //push a header row for the subtables/samples
                                    let columnRow = samplesWorksheet.addRow(columns);
                                    columnRow.eachCell((cell) => {
                                        cell.font = { bold: true };
                                    });
                                    samplesColumnRowCreated = true;
                                }

                                subTable.rows.forEach(subTableRow => {
                                    let excelRow = [...sampleGroupExcelRowValues];
                                    subTableRow.forEach((subTableCell, index) => {
                                        let cellValue = this.sqs.parseStringValueMarkup(subTableCell.value, { drawSymbol: false });
                                        cellValue = this.stripHtmlUsingDOM(cellValue);
                                        excelRow.push(cellValue);
                                    });
                                    samplesWorksheet.addRow(excelRow);
                                });
                            });

                        };
                    }
                }
            }

            if(section.name == "analyses") {
                section.sections.forEach(analysisSection => {

                    //check if a worksheet with this name already exists
                    let worksheet = wb.getWorksheet(analysisSection.title);
                    if(!worksheet) {
                        worksheet = wb.addWorksheet(analysisSection.title);
                    }
                    else {
                        //This should never happen, but it did previously due to a bug in the way data was compiled in the DatasetModule.
                        //I am keeping this check here, just in case a similar bug appears again.
                        console.warn("Worksheet with name "+analysisSection.title+" already exists, skipping...");
                    }
                    
                    let biblioRef = null;
                    let contactIds = new Set();
                    for(let k in siteData.datasets) {
                        if(siteData.datasets[k].method_id == 10) {
                            siteData.lookup_tables.biblio.forEach(biblio => {
                                if(biblio.biblio_id == siteData.datasets[k].biblio_id) {
                                    biblioRef = biblio;
                                }
                            });

                            siteData.datasets[k].contacts.forEach(contact_id => {
                                contactIds.add(contact_id);
                            });

                            continue;
                        }
                    }

                    const contactIdsArr = Array.from(contactIds);
                    let contactString = this.sqs.renderContacts(siteData, contactIdsArr, false);
                    
                    if(biblioRef) {
                        let r = worksheet.addRow(["Dataset reference; please cite this dataset as:"]);
                        r.eachCell((cell) => {
                            cell.font = { bold: true };
                        });
                        worksheet.addRow([biblioRef.full_reference]);
                    }
                    else {
                        let r = worksheet.addRow(["Dataset reference"]);
                        r.eachCell((cell) => {
                            cell.font = { bold: true };
                        });
                        worksheet.addRow(["No reference found"]);
                    }
                    let r = worksheet.addRow(["Dataset contact information:"]);
                    r.eachCell((cell) => {
                        cell.font = { bold: true };
                    });
                    if(contactIdsArr.length > 0) {
                        worksheet.addRow([contactString]);
                    }
                    else {
                        worksheet.addRow(["No contact information found"]);
                    }
                    
                    worksheet.addRow([]);

                    let analysisColumnRowCreated = false;
                    analysisSection.contentItems.forEach(contentItem => {
                        if(this.sqs.isPromise(contentItem)) {
                            console.warn("Content item is a promise");
                            return;
                        }

                        if(contentItem.methodId && (contentItem.methodId == 10 || contentItem.methodId == 171)) {
                            //this is for dendro and ceramic data
                            this.addLegacyStructureDataToWorksheet(worksheet, contentItem, analysisColumnRowCreated == false);
                        }
                        else {
                            this.addDataToWorksheet(worksheet, contentItem, analysisColumnRowCreated == false);
                        }
                        analysisColumnRowCreated = true;
                    });
                });
            }
        }

        let buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/octet-stream' });

        if(returnObjectUrl) {
            const blobUrl = URL.createObjectURL(blob);
            return blobUrl;
        }

        return blob;
    }

    async contentItemToExcelBlobUrl(contentItem) {
        const ws_name = "SEAD Data";
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet(ws_name);

        let styles = {
            header1: { size: 14, bold: true },
            header2: { size: 12, bold: true },
        }

        dataRows.forEach(row => {
            let addStyle = null;
            if(typeof row[0] == 'object') {
                if(row[0].style == 'header2') {
                    addStyle = styles.header2;
                }
                row.splice(0, 1);
            }

            ws.addRow(row);
            
            if(addStyle != null) {
                ws.lastRow.font = addStyle;
            }
        });

        let buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const blobUrl = URL.createObjectURL(blob);
        console.log(blobUrl);
        return blobUrl;

        /*
        wb.xlsx.writeBuffer().then(buffer => {
            const blob = new Blob([buffer], { type: 'application/octet-stream' });
            const blobUrl = URL.createObjectURL(blob);

            //$("#site-report-xlsx-export-download-btn").attr("href", blobUrl);
            //$("#site-report-xlsx-export-download-btn").attr("download", filename+".xlsx");

            console.log(buffer);
            console.log(blob);

            //URL.revokeObjectURL(blobUrl);
        });
        */
    }

    stripHtmlUsingDOM(input) {
		const temporaryElement = document.createElement('div');
		temporaryElement.innerHTML = input;
		return temporaryElement.textContent || temporaryElement.innerText || '';
	}

    /**
     * Adds data from a content item to an Excel worksheet, optionally including a header row.
     *
     * @param {Object} worksheet - The worksheet object to which rows will be added.
     * @param {Object} contentItem - The content item containing the data to export.
     * @param {boolean} [addHeaderRow=false] - Whether to add a header row with column titles.
     *
     * @description
     * This method exports the data from the provided content item into the specified worksheet.
     * It inserts the dataset name as the first column, skips columns with data types "subtable" or "component",
     * and processes cell values to remove HTML markup. If `addHeaderRow` is true, a bold header row is added.
     */
    addDataToWorksheet(worksheet, contentItem, addHeaderRow = false) {
		let dataTable = contentItem.data;

		let columnRow = [];
		//insert dataset name as the first column
		columnRow.push("Dataset");
		dataTable.columns.forEach((column, index) => {
			if(column.dataType != "subtable" && column.dataType != "component") {
				columnRow.push(column.title);
			}
		});
		if(addHeaderRow) {
			let headerRow = worksheet.addRow(columnRow);
			headerRow.eachCell((cell) => {
				cell.font = { bold: true };
			});
		}

		dataTable.rows.forEach((row, index) => {
			let excelRow = [];

			//insert dataset name as the first column
			excelRow.push(contentItem.title);

			dataTable.columns.forEach((column, index) => {
				if(column.dataType != "subtable" && column.dataType != "component") {
					let cellValue = this.sqs.parseStringValueMarkup(row[index].value, { drawSymbol: false });
					cellValue = this.stripHtmlUsingDOM(cellValue);
					excelRow.push(cellValue);
				}
			});

			worksheet.addRow(excelRow);
		});
	}

    /**
     * Adds legacy structured data from a content item to an Excel worksheet.
     * 
     * This method processes the provided data table, excluding columns with data types "subtable" and "component" from the export.
     * If a subtable is present, it flattens the subtable rows into the worksheet, optionally adding a header row.
     * HTML markup is stripped from cell values before exporting.
     *
     * @param {Object} worksheet - The worksheet object to which rows will be added.
     * @param {Object} contentItem - The content item containing the data table to export.
     * @param {boolean} [addHeaderRow=false] - Whether to add a header row to the worksheet.
     */
	addLegacyStructureDataToWorksheet(worksheet, contentItem, addHeaderRow = false) {
		let dataTable = contentItem.data;
		let subTableColumnKey = null;
		let sampleColumns = [];
		let columnKeys = [];
		dataTable.columns.forEach((column, index) => {
			//we exclude columns with a dataType marked as subtables and components from the export
			if(column.dataType != "subtable" && column.dataType != "component") {
				columnKeys.push(index);
				sampleColumns.push(column.title);
			}

			if(column.dataType == "subtable") {
				subTableColumnKey = index;
			}
		});

		if(subTableColumnKey != null) {
			dataTable.rows.forEach(analysisRow => {

				let analysisExcelRowValues = [];
				columnKeys.forEach(key3 => {
					let v = this.sqs.parseStringValueMarkup(analysisRow[key3].value, { drawSymbol: false });
					v = this.stripHtmlUsingDOM(v);
					analysisExcelRowValues.push(v);
				});

				let subTable = analysisRow[subTableColumnKey].value;

				let valueColumnKeys = [];
				let valueColumns = [...sampleColumns];
				subTable.columns.forEach((subTableColumn, index) => {
					if(subTableColumn.exclude_from_export !== true && subTableColumn.hidden !== true) {
						valueColumnKeys.push(index);
						valueColumns.push(subTableColumn.title);
					}
				});
				
				if(addHeaderRow) {
					let headersRow = worksheet.addRow(valueColumns);
					headersRow.eachCell((cell) => {
						cell.font = { bold: true };
					});
				}
				addHeaderRow = false;
				
				subTable.rows.forEach(subTableRow => {
					let excelRow = [...analysisExcelRowValues];
					subTableRow.forEach((subTableCell, index) => {
						if(valueColumnKeys.includes(index)) {
							let cellValue = this.sqs.parseStringValueMarkup(subTableCell.value, { drawSymbol: false });
							cellValue = this.stripHtmlUsingDOM(cellValue);
							excelRow.push(cellValue);
						}
					});

					worksheet.addRow(excelRow);
				});
			});
		}
	}

    recursivelyPrepareJsonExport(exportStruct) {
        //traverse through exportStruct and strip all html from every value
		for(let key in exportStruct) {
			if(typeof exportStruct[key] == "object") {
				exportStruct[key] = this.recursivelyPrepareJsonExport(exportStruct[key]);
			}
			else {
				if(typeof exportStruct[key] == "string") {
					exportStruct[key] = exportStruct[key].replace(/<[^>]*>?/gm, '');
				}
			}
		}

		return exportStruct;
    }

    async getJsonExport(exportStruct, returnObjectUrl = true) {
		exportStruct = this.recursivelyPrepareJsonExport(exportStruct);

        exportStruct.license = this.sqs.config.dataLicense.name+" ("+this.sqs.config.dataLicense.url+")";

        let json = JSON.stringify(exportStruct, (key, value) => {
            if(key == "renderInstance") {
                value = null;
            }
            return value;
        }, 2);
        
        
        const blob = new Blob([json], { type: "application/json" });
        if(returnObjectUrl) {
            return URL.createObjectURL(blob);
        }

        return blob;
	}


}

export default ExportManager;