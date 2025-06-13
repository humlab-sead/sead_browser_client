import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { data } from 'jquery';
import { isArray } from 'lodash';
import AbundanceData from './Result/DatahandlingModules/AbundanceData.class.js';
import DatingData from './Result/DatahandlingModules/DatingData.class.js';
import DendroCeramicsData from './Result/DatahandlingModules/DendroCeramicsData.class.js';
import EntityAgesData from './Result/DatahandlingModules/EntityAgesData.class.js';
import IsotopeData from './Result/DatahandlingModules/IsotopeData.class.js';
import MeasuredValuesData from './Result/DatahandlingModules/MeasuredValuesData.class.js';

class ExportManager {
    constructor(sqs) {
        this.sqs = sqs;

        this.dataModules = [];
        this.dataModules.push(new AbundanceData(sqs));
        this.dataModules.push(new DatingData(sqs));
        this.dataModules.push(new DendroCeramicsData(sqs));
        this.dataModules.push(new EntityAgesData(sqs));
        this.dataModules.push(new IsotopeData(sqs));
        this.dataModules.push(new MeasuredValuesData(sqs));
    }

    getXlsxBookOfSites(siteData, methodIds = []) {
        const wb = new ExcelJS.Workbook();
        const sites = Array.isArray(siteData) ? siteData : [siteData];

        console.time("Exporting sites to XLSX");
        this.addSiteSheet(wb, sites);
        console.timeEnd("Exporting sites to XLSX");

        console.time("Exporting samples to XLSX");
        this.addSamplesSheet(wb, sites);
        console.timeEnd("Exporting samples to XLSX");

        this.addAnalysisSheets(wb, sites, methodIds);

        return wb;
    }

    async getCsvExportOfSites(siteData, methodIds = []) {
        const wb = this.getXlsxBookOfSites(siteData, methodIds);

        let csvFilesData = this.convertXlsxWorkbookToCsvs(wb);

        return await this.exportCsvsAsZipFile(csvFilesData);
    }

    async getXlsxBookExport(siteData, returnObjectUrl = true, methodIds = []) {
        const wb = this.getXlsxBookOfSites(siteData, methodIds);
        return await this.exportWorkbook(wb, returnObjectUrl);
    }

    addSiteSheet(wb, sites) {
        const siteWorksheet = wb.addWorksheet("Site");

        // Define columns and headers
        const siteMetaColumns = [
            { key: "site_id", title: "Site identifier" },
            { key: "license", title: "License" },
            { key: "export_date", title: "Date of export" },
            { key: "webclient_version", title: "Webclient version" },
            { key: "api_version", title: "API version" },
            { key: "site_name", title: "Site name" },
            { key: "site_description", title: "Site description" },
            { key: "latitude_dd", title: "Latitude (WGS84)" },
            { key: "longitude_dd", title: "Longitude (WGS84)" },
            { key: "db_attribution", title: "Database attribution" }
        ];

        // Prepare data rows
        const dataRows = sites.map(site => [
            site.site_id ?? this.siteId,
            this.sqs.config.dataLicense.name + " (" + this.sqs.config.dataLicense.url + ")",
            new Date().toLocaleDateString('sv-SE'),
            this.sqs.config.version,
            site.api_source,
            site.site_name,
            site.site_description,
            site.latitude_dd,
            site.longitude_dd,
            this.sqs.config.dataAttributionString,
        ]);

        // Add as an Excel Table for banded rows and filter drop-downs
        siteWorksheet.addTable({
            name: 'SiteTable',
            ref: 'A1',
            headerRow: true,
            style: {
                theme: 'TableStyleMedium2',
                showRowStripes: true
            },
            columns: siteMetaColumns.map(col => ({
                name: col.title,
                filterButton: true // Enable filter drop-downs
            })),
            rows: dataRows
        });

        // Optionally, auto-fit columns
        siteWorksheet.columns.forEach(column => {
            let maxLength = 10;
            column.eachCell({ includeEmpty: true }, cell => {
                maxLength = Math.max(maxLength, (cell.value ? cell.value.toString().length : 0));
            });
            column.width = maxLength + 2;
        });
    }

    addSamplesSheetOLD(wb, sites) {
        const samplesWorksheet = wb.addWorksheet("Samples");

        // Get arrays of {key, title} objects
        const { sampleGroupKeys, physicalSampleKeys } = this.collectSampleKeys(sites);

        // Compose columns: always start with Site ID and Site name
        let sampleSheetColumns = [
            { key: "site_id", title: "Site ID" },
            { key: "site_name", title: "Site name" },
            ...sampleGroupKeys,
            ...physicalSampleKeys
        ];

        // Add header row with display titles
        samplesWorksheet.addRow(sampleSheetColumns.map(col => col.title)).eachCell(cell => cell.font = { bold: true });

        // Add data rows
        sites.forEach(site => {
            if (!Array.isArray(site.sample_groups)) return;
            site.sample_groups.forEach(sampleGroup => {
                if (Array.isArray(sampleGroup.physical_samples)) {
                    sampleGroup.physical_samples.forEach(physicalSample => {
                        let row = [
                            site.site_id ?? this.siteId,
                            site.site_name ?? ""
                        ];
                        sampleSheetColumns.slice(2).forEach(col => {
                            let value;
                            // Prefer physicalSample, then sampleGroup
                            if (col.key in physicalSample) {
                                value = physicalSample[col.key];
                            } else if (col.key in sampleGroup) {
                                value = sampleGroup[col.key];
                            } else {
                                value = "";
                            }
                            value = this.formatCellValue(value, col.key, site);
                            row.push(value !== undefined ? value : "");
                        });
                        samplesWorksheet.addRow(row);
                    });
                }
            });
        });
    }

    addSamplesSheet(wb, sites) {
        const samplesWorksheet = wb.addWorksheet("Samples");

        // Get arrays of {key, title} objects
        const { sampleGroupKeys, physicalSampleKeys } = this.collectSampleKeys(sites);

        // Compose columns: always start with Site ID and Site name
        let sampleSheetColumns = [
            { key: "site_id", title: "Site ID" },
            { key: "site_name", title: "Site name" },
            ...sampleGroupKeys,
            ...physicalSampleKeys
        ];

        // Prepare all data rows
        const dataRows = [];
        sites.forEach(site => {
            if (!Array.isArray(site.sample_groups)) return;
            site.sample_groups.forEach(sampleGroup => {
                if (Array.isArray(sampleGroup.physical_samples)) {
                    sampleGroup.physical_samples.forEach(physicalSample => {
                        let row = [
                            site.site_id ?? this.siteId,
                            site.site_name ?? ""
                        ];
                        sampleSheetColumns.slice(2).forEach(col => {
                            let value;
                            // Prefer physicalSample, then sampleGroup
                            if (col.key in physicalSample) {
                                value = physicalSample[col.key];
                            } else if (col.key in sampleGroup) {
                                value = sampleGroup[col.key];
                            } else {
                                value = "";
                            }
                            value = this.formatCellValue(value, col.key, site);
                            row.push(value !== undefined ? value : "");
                        });
                        dataRows.push(row);
                    });
                }
            });
        });

        // Add as an Excel Table for banded rows and filter drop-downs
        samplesWorksheet.addTable({
            name: 'SamplesTable',
            ref: 'A1',
            headerRow: true,
            style: {
                theme: 'TableStyleMedium2',
                showRowStripes: true
            },
            columns: sampleSheetColumns.map(col => ({
                name: col.title,
                filterButton: true // Explicitly enable filter drop-downs
            })),
            rows: dataRows
        });

        // Optionally, auto-fit columns
        samplesWorksheet.columns.forEach(column => {
            let maxLength = 10;
            column.eachCell({ includeEmpty: true }, cell => {
                maxLength = Math.max(maxLength, (cell.value ? cell.value.toString().length : 0));
            });
            column.width = maxLength + 2;
        });
    }

    collectSampleKeys(sites) {
        // Exception maps for renaming
        const sampleGroupKeyTitleMap = {
            biblio: "Sample group references",
            features: "Sample group features",
            sampling_method_id: "Sample group sampling method", 
            relative_age_id: "Sample group relative age",
            coordinates: "Sample group coordinates",
            datasets: "Sample group datasets",
            date_updated: "Sample group date updated",
            descriptions: "Sample group descriptions",
            method_id: "Sample group method id",
            notes: "Sample group notes",
            sampling_context: "Sample group sampling context",
            sampling_method_id: "Sample group sampling method",
        };
        const physicalSampleKeyTitleMap = {
            alt_ref_type_id: "Sample alt ref type id",
            alt_refs: "Sample alt refs",
            coordinates: "Sample coordinates",
            date_sampled: "Sample date sampled",
            date_updated: "Sample date updated",
            descriptions: "Sample descriptions",
            dimensions: "Sample dimensions",
            features: "Sample features",
            horizons: "Sample horizons",
            locations: "Sample locations",
        };

        const skipSampleGroupKeys = [
            "physical_samples",
            "site_id",
            "sampling_context_id",
            "sample_type_id",
        ];

        const sampleGroupKeySet = new Set();
        const physicalSampleKeySet = new Set();
        
        sites.forEach(site => {
            if (!Array.isArray(site.sample_groups)) return;
            site.sample_groups.forEach(sampleGroup => {
                Object.keys(sampleGroup).forEach(key => {
                    if(skipSampleGroupKeys.includes(key)) return;
                    
                    sampleGroupKeySet.add(key);
                });
                if (Array.isArray(sampleGroup.physical_samples)) {
                    sampleGroup.physical_samples.forEach(physicalSample => {
                        Object.keys(physicalSample).forEach(key => {
                            if (key === "sample_group_id") return;
                            physicalSampleKeySet.add(key);
                        });
                    });
                }
            });
        });

        // Convert sets to arrays of {key, title}
        const sampleGroupKeys = Array.from(sampleGroupKeySet).sort().map(key => ({
            key,
            title: sampleGroupKeyTitleMap[key] || this.defaultTitle(key)
        }));
        const physicalSampleKeys = Array.from(physicalSampleKeySet).sort().map(key => ({
            key,
            title: physicalSampleKeyTitleMap[key] || this.defaultTitle(key)
        }));

        return { sampleGroupKeys, physicalSampleKeys };
    }

    defaultTitle(key) {
        return key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
    }

    /**
     * Prepares a single row of data for the "Samples" worksheet.
     * @param {Object} site The current site data.
     * @param {Object} sampleGroup The current sample group data.
     * @param {Object} physicalSample The current physical sample data.
     * @param {Array} sampleSheetColumns The ordered list of columns for the sample sheet.
     * @returns {Array} An array of values for the row.
     */
    prepareSampleRow(site, sampleGroup, physicalSample, sampleSheetColumns) {
        let row = [
            site.site_id ?? this.siteId,
            site.site_name ?? ""
        ];
        sampleSheetColumns.slice(2).forEach(col => { // Start from index 2 to skip "Site ID" and "Site name"
            let value;
            if (col in physicalSample) {
                value = physicalSample[col];
            } else if (col.startsWith("Group ") && col.substring(6) in sampleGroup) { // Check for 'Group ' prefix
                value = sampleGroup[col.substring(6)];
            } else {
                value = "";
            }

            value = this.formatCellValue(value, col, site);
            row.push(value !== undefined ? value : "");
        });
        return row;
    }

    addAnalysisSheets(workbook, sites, methodIds = []) {
        const datagroupsByMethod = this.groupDatagroupsByMethod(sites);

        //remove all datagroups in datagroupsByMethod that are not in methodIds
        for (const methodId of datagroupsByMethod.keys()) {
            if (!methodIds.includes(methodId)) {
                datagroupsByMethod.delete(methodId);
            }
        }

        let worksheetNames = new Set();

        for (const [methodId, methodGrouping] of datagroupsByMethod.entries()) {

            this.sqs.sqsEventDispatch("exportProgress", {
                methodId: methodId,
                methodName: methodGrouping.method_name,
            });

            let tables = [];
            this.dataModules.forEach((dataModule) => {
                tables.push(dataModule.getDataAsTable(methodId, sites));
            });

            let filteredTables = tables.filter(table => {
                if (table == null || table.rows.length === 0) {
                    return false; // Exclude empty tables
                }
                return true;
            });

            filteredTables.forEach((table) => {
                if (worksheetNames.has(table.name)) {
                    console.warn(`Worksheet with name "${table.name}" already exists. Renaming to avoid conflict.`);
                    table.name = this.sanitizeWorksheetName(table.name + "_1");
                } else {
                    worksheetNames.add(table.name);
                }

                // Prepare worksheet and data for addTable
                let datasetWorksheet = workbook.addWorksheet(table.name);

                // Prepare columns for addTable
                const columns = table.columns.map(col => ({
                    name: col.header || col.title || col.key,
                    filterButton: true
                }));

                // Prepare rows for addTable (should be array of arrays)
                const rows = table.rows;

                // Add as an Excel Table for banded rows and filter drop-downs
                datasetWorksheet.addTable({
                    name: this.sanitizeWorksheetName(table.name + "Table"),
                    ref: 'A1',
                    headerRow: true,
                    style: {
                        theme: 'TableStyleMedium2',
                        showRowStripes: true
                    },
                    columns,
                    rows
                });

                // Optionally, auto-fit columns
                datasetWorksheet.columns.forEach(column => {
                    let maxLength = 10;
                    column.eachCell({ includeEmpty: true }, cell => {
                        maxLength = Math.max(maxLength, (cell.value ? cell.value.toString().length : 0));
                    });
                    column.width = maxLength + 2;
                });

            });
        }
    }

    /**
     * Groups datasets by their method ID.
     * @param {Array} sites An array of site data.
     * @returns {Map<string, { method_name: string, datasets: Array<object>, site: object }>} A map of datasets grouped by method.
     */
    groupDatasetsByMethod(sites) {
        const datasetsByMethod = new Map();

        sites.forEach(site => {
            if (!Array.isArray(site.datasets)) return;
            site.datasets.forEach(dataset => {
                const methodId = dataset.method_id;
                if (!methodId) {
                    console.warn(`Dataset ${dataset.dataset_id} has no method_id. Skipping for method grouping.`);
                    return;
                }

                let methodName = methodId; // Default to method_id
                if (site.lookup_tables && site.lookup_tables.methods) {
                    const methodLookup = site.lookup_tables.methods.find(m => m.method_id === methodId);
                    if (methodLookup && methodLookup.method_name) {
                        methodName = methodLookup.method_name;
                    }
                }

                if (!datasetsByMethod.has(methodId)) {
                    datasetsByMethod.set(methodId, {
                        method_name: methodName,
                        datasets: [],
                        site: site
                    });
                }
                datasetsByMethod.get(methodId).datasets.push(dataset);
            });
        });
        return datasetsByMethod;
    }

    /**
     * Groups data_groups by their method IDs.
     * @param {Array} sites An array of site data.
     * @returns {Map<string, { method_name: string, data_groups: Array<object>, site: object }>} A map of data_groups grouped by method.
     */
    groupDatagroupsByMethod(sites) {
        const datagroupsByMethod = new Map();

        sites.forEach(site => {
            if (!Array.isArray(site.data_groups)) return;
            site.data_groups.forEach(data_group => {
                if (!Array.isArray(data_group.method_ids)) return;
                data_group.method_ids.forEach(methodId => {
                    if (!methodId) return;

                    // Try to get method name from lookup table
                    let methodName = methodId;
                    if (site.lookup_tables && site.lookup_tables.methods) {
                        const methodLookup = site.lookup_tables.methods.find(m => m.method_id === methodId);
                        if (methodLookup && methodLookup.method_name) {
                            methodName = methodLookup.method_name;
                        }
                    }

                    if (!datagroupsByMethod.has(methodId)) {
                        datagroupsByMethod.set(methodId, {
                            method_name: methodName,
                            data_groups: [],
                            site: site
                        });
                    }
                    datagroupsByMethod.get(methodId).data_groups.push(data_group);
                });
            });
        });

        return datagroupsByMethod;
    }

    /**
     * Sanitizes a string to be used as an Excel worksheet name.
     * @param {string} name The proposed worksheet name.
     * @returns {string} The sanitized worksheet name.
     */
    sanitizeWorksheetName(name) {
        return name.substring(0, 30).replace(/[/\\?*[\]:]/g, '_');
    }

    hasValue(entity) {
        // Check if the entity has any non-empty values
        return Object.values(entity).some(value => {
            if (Array.isArray(value)) {
                return value.length > 0;
            }
            return value != null && value !== '';
        });
    }

    /**
     * Determines the headers and data keys for an analysis sheet based on its datasets.
     * @param {Array} datagroups An array of datasets for a specific method.
     * @returns {{analysisEntityHeaders: Array, analysisEntityDataKeys: Array}} An object containing header display names and their corresponding data keys.
     */
    getAnalysisHeaders(datagroups) {
        console.log(datagroups)
        const analysisHeaderKeys = new Map();

        //Add standard headers for the site and dataset
        analysisHeaderKeys.set("Site ID", "site_id");
        analysisHeaderKeys.set("Site Name", "site_name");
        analysisHeaderKeys.set("Method ID", "method_id");
        analysisHeaderKeys.set("Method Name", "method_name");
        /*
        analysisHeaderKeys.set("Dataset ID", "dataset_id");
        analysisHeaderKeys.set("Dataset Title", "title");
        */
        analysisHeaderKeys.set("Dataset References", "dataset_references");
        analysisHeaderKeys.set("Dataset Contacts", "dataset_contacts");



        let keysThathouldBeDescendedInto = ["dating_values"];

        // Here we go through each dataset and add its properties as headers
        // We also check if the dataset has analysis entities (it should) and add their properties as headers
        // Then finally we need to descend into some special properties of analysis entities, such as "abundances" and "dating_values"
        datagroups.forEach(datagroup => {

            if (Array.isArray(datagroup.values)) {
                datagroup.values.forEach((value) => {
                    for (const key in value) {
                        if (value.hasOwnProperty(key)) {
                            //Only add this key if at least one entity has a value for it
                            if(this.hasValue(value)) {
                                analysisHeaderKeys.set(key, key);

                                // Check if the key should be descended into
                                if (keysThathouldBeDescendedInto.includes(key)) {
                                    //console.log(entity[key]);
                                    /*
                                    entity[key].forEach((value) => {
                                        console.log(value);
                                    });
                                    */
                                }
                            }
                        }
                    }

                    // Special handling for abundances
                    if (value.abundances) {
                        analysisHeaderKeys.set("taxon", "taxon");
                        analysisHeaderKeys.set("abundance", "abundance");
                        analysisHeaderKeys.set("abundance_element", "abundance_element");
                        analysisHeaderKeys.set("identification_levels", "identification_levels");
                        analysisHeaderKeys.set("modifications", "modifications");
                    }
                });
            }
        });

        const analysisEntityHeaders = Array.from(analysisHeaderKeys.keys());
        const analysisEntityDataKeys = Array.from(analysisHeaderKeys.values());
        return { analysisEntityHeaders, analysisEntityDataKeys };
    }

    getAnalysisHeadersForSpecialMethods(datagroups) {
        //This is a special case for dendrochronology (10) and ceramics (171), where we need to handle the data differently.
    }

    /**
     * Formats a cell value based on its type and column key.
     * @param {*} value The raw cell value.
     * @param {string} col The column key.
     * @param {Object} site The site object for context.
     * @returns {*} The formatted cell value.
     */
    formatCellValue(value, col, site) {
        switch (col) {
            case "alt_refs":
                value = this.sqs.formatAltRefs(value, site, false);
                break;
            case "coordinates":
                value = this.sqs.formatCoordinates(value, site, false);
                break;
            case "features":
                value = this.sqs.formatFeatures(value, site, false);
                break;
            case "sampling_context":
                value = this.sqs.formatSamplingContext(value, site, false);
                break;
            case "sampling_method_id":
                value = this.sqs.formatSamplingMethod(value, site, false);
                break;
            case "descriptions": // this is sample group descriptions
                value = this.sqs.formatSampleGroupDescriptions(value, site, false);
                break;
            case "dimensions":
                value = this.sqs.formatDimensions(value, site, false);
                break;
            case "horizons":
                value = this.sqs.formatHorizons(value, site, false);
                break;
            case "alt_ref_type_id": //not available in site.lookup_tables yet
                break;
            case "sample_type_id": 
                break;
            case "biblio":
                let biblioIds = [];
                if (Array.isArray(value)) {
                    value.forEach(biblio => {
                        if (biblio.biblio_id) {
                            biblioIds.push(biblio.biblio_id);
                        }
                    });
                }
                value = this.sqs.renderBiblioReference(site, biblioIds, false);
                break;
            default:
                if (Array.isArray(value)) {
                    value = value.map(v => typeof v === "object" && v !== null ? JSON.stringify(v) : v).join("; ");
                } else if (typeof value === "object" && value !== null) {
                    value = JSON.stringify(value);
                }
                break;
        }
        // Clean up HTML if needed for any string value
        if (typeof value === 'string') {
            value = this.sqs.parseStringValueMarkup(value, { drawSymbol: false });
            value = this.stripHtmlUsingDOM(value);
        }
        return value;
    }

    convertXlsxWorkbookToCsvs(wb) {
        const csvData = {};

        wb.eachSheet((worksheet, sheetId) => {
            if (worksheet.name) {
                const csvLines = [];

                // Get headers from the first row
                const headerRow = worksheet.getRow(1);
                if (headerRow.values && headerRow.values.length > 0) {
                // exceljs row.values returns an array with index 0 being null,
                // so we slice from index 1 to get actual column values
                const headers = headerRow.values.slice(1).map(cell => {
                    // Ensure values are treated as strings and handle potential null/undefined
                    return cell !== null && cell !== undefined ? String(cell).replace(/"/g, '""') : "";
                });
                csvLines.push(headers.map(h => `"${h}"`).join(','));
                }

                // Iterate through rows starting from the second row (skipping headers)
                for (let i = 2; i <= worksheet.rowCount; i++) {
                    const row = worksheet.getRow(i);
                    if (row.values && row.values.length > 0) {
                        const rowValues = row.values.slice(1).map(cell => {
                        // Ensure values are treated as strings and handle potential null/undefined
                        const cellValue = cell !== null && cell !== undefined ? String(cell) : "";
                        // Escape double quotes by doubling them, then wrap the entire field in quotes
                        return `"${cellValue.replace(/"/g, '""')}"`;
                        });
                        csvLines.push(rowValues.join(','));
                    }
                }
                csvData[worksheet.name] = csvLines.join('\n');
            }
        });

        return csvData;
    }

    async exportCsvsAsZipFile(csvFilesData, returnObjectUrl = true) {
        const zip = new JSZip();

        // Add each CSV string to the ZIP file
        for (const [filename, csvString] of Object.entries(csvFilesData)) {
            // Ensure the filename ends with .csv and is sanitized
            const safeFilename = filename.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+$/, '') + '.csv';
            zip.file(safeFilename, csvString);
        }

        try {
            let content = await zip.generateAsync({ type: "blob" });
            if (returnObjectUrl) {
                content = URL.createObjectURL(content);
            }
            return content;
        } catch (error) {
            console.error("Error generating or downloading ZIP:", error);
            return null;
        }
    }

    /**
     * Exports the Excel workbook to a buffer or an object URL.
     * @param {ExcelJS.Workbook} wb The Excel workbook instance.
     * @param {boolean} returnObjectUrl If true, returns a Blob URL; otherwise, returns a Blob.
     * @returns {Promise<string|Blob>} The Blob URL or Blob object.
     */
    async exportWorkbook(wb, returnObjectUrl) {
        let buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/octet-stream' });

        if (returnObjectUrl) {
            const blobUrl = URL.createObjectURL(blob);
            return blobUrl;
        }
        return blob;
    }

    // Assuming this method exists in your original class or needs to be provided
    stripHtmlUsingDOM(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    }

    getDatasetReference(site, dataset) {
        if (!dataset || !site || !site.lookup_tables || !site.lookup_tables.biblio) {
            return "No reference found";
        }

        const biblioRef = site.lookup_tables.biblio.find(b => b.biblio_id === dataset.biblio_id);
        if (biblioRef) {
            return biblioRef.full_reference;
        }
        return "No reference found";
    }

    getDatasetContactInfo(site, dataset) {
        if (!dataset || !site || !site.lookup_tables || !site.lookup_tables.dataset_contacts) {
            return "No contact information found";
        }

        const contactIds = dataset.contacts || [];
        if (contactIds.length === 0) {
            return "No contact information found";
        }

        return this.sqs.renderContacts(site, contactIds, false);
    }

    recursivelyExpandAndFlatten(obj, excludeProperties = [], parentPath = [], maxDepth = 15, depth = 0, visited = new Set()) {
        // Base cases for recursion termination
        if (depth > maxDepth || typeof obj !== 'object' || obj === null) {
            return [];
        }

        // Circular reference detection: if we've seen this object before in the current path,
        // it means there's a cycle, so stop recursing to prevent infinite loops.
        if (visited.has(obj)) {
            return []; // Or handle as an error/warning if desired
        }
        visited.add(obj); // Mark the current object as visited

        let result = [];

        // Special handling for arrays: only process the first item for its structure
        if (Array.isArray(obj)) {
            if (obj.length > 0) {
                // Pass 'excludeProperties' along to the recursive call
                result = result.concat(
                    this.recursivelyExpandAndFlatten(obj[0], excludeProperties, parentPath, maxDepth, depth + 1, visited)
                );
            }
            visited.delete(obj); // Remove from visited once processing of this object (array) is complete
            return result; // Return immediately after array handling
        }

        // Handle regular objects
        // Use Object.entries for robust iteration over own enumerable properties
        for (const [key, value] of Object.entries(obj)) {
            // === MODIFICATION START ===
            // Check if the current key is in the excludeProperties list
            if (excludeProperties.includes(key)) {
                continue; // Skip this property entirely
            }
            // === MODIFICATION END ===

            const currentPath = [...parentPath, key];

            // If the value is a nested object (or array, which will be handled in the next recursive call)
            if (typeof value === 'object' && value !== null) {
                // Pass 'excludeProperties' along to the recursive call
                result = result.concat(
                    this.recursivelyExpandAndFlatten(value, excludeProperties, currentPath, maxDepth, depth + 1, visited)
                );
            } else {
                // For primitive values (or functions, symbols etc. not to be recursed)
                const lastPathSegment = currentPath[currentPath.length - 1];
                result.push({
                    title: lastPathSegment,
                    path: currentPath
                });
            }
        }

        visited.delete(obj); // Remove from visited once processing of this object is complete
        return result;
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

        console.log(wb);
        console.log(buffer);
        console.log(blob);

        if (returnObjectUrl) {
            const blobUrl = URL.createObjectURL(blob);
            console.log(blobUrl);
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