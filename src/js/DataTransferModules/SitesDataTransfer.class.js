import DataTransferModule from './DataTransferModule.class.js';
import ExcelJS from 'exceljs';

export default class SitesDataTransfer extends DataTransferModule {
    constructor(sqs) {
        super(sqs);
    }

    /**
     * Creates an Excel workbook with comprehensive site data including samples and analysis
     * @param {Object|Array} siteData - Site data (single site or array of sites)
     * @param {Array} methodIds - Optional array of method IDs to filter by (default: all methods)
     * @param {Array} dataModules - Array of data modules for analysis sheets
     * @returns {ExcelJS.Workbook} Excel workbook
     */
    createWorkbook(siteData, methodIds = [], dataModules = []) {
        const wb = new ExcelJS.Workbook();
        const sites = Array.isArray(siteData) ? siteData : [siteData];

        console.time("Exporting sites to XLSX");
        this.addSiteSheet(wb, sites);
        console.timeEnd("Exporting sites to XLSX");

        console.time("Exporting samples to XLSX");
        this.addSamplesSheet(wb, sites);
        console.timeEnd("Exporting samples to XLSX");

        this.addAnalysisSheets(wb, sites, methodIds, dataModules);

        return wb;
    }

    /**
     * Exports sites to Excel format
     * @param {Object|Array} siteData - Site data
     * @param {boolean} returnObjectUrl - If true, returns a Blob URL; otherwise, returns a Blob
     * @param {Array} methodIds - Optional array of method IDs to filter by
     * @param {Array} dataModules - Array of data modules for analysis sheets
     * @returns {Promise<string|Blob>} The Blob URL or Blob object
     */
    async export(siteData, returnObjectUrl = true, methodIds = [], dataModules = []) {
        const wb = this.createWorkbook(siteData, methodIds, dataModules);
        return await this.exportWorkbook(wb, returnObjectUrl);
    }

    /**
     * Adds Site metadata worksheet
     * @param {ExcelJS.Workbook} wb - Workbook to add sheet to
     * @param {Array} sites - Array of site data
     */
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
            { key: "coordinates_google_maps", title: "Google Maps Link" },
            { key: "latitude_dd", title: "Latitude (WGS84)" },
            { key: "longitude_dd", title: "Longitude (WGS84)" },
            { key: "db_attribution", title: "Database attribution" }
        ];

        // Prepare data rows
        const dataRows = sites.map(site => [
            site.site_id,
            this.sqs.config.dataLicense.name + " (" + this.sqs.config.dataLicense.url + ")",
            new Date().toLocaleDateString('sv-SE'),
            this.sqs.config.version,
            site.api_source,
            site.site_name,
            site.site_description,
            this.formatCoordinatesForGoogleMaps(site.latitude_dd, site.longitude_dd),
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
                filterButton: true
            })),
            rows: dataRows
        });

        // Auto-fit columns
        siteWorksheet.columns.forEach(column => {
            let maxLength = 10;
            column.eachCell({ includeEmpty: true }, cell => {
                maxLength = Math.max(maxLength, (cell.value ? cell.value.toString().length : 0));
            });
            column.width = maxLength + 2;
        });
    }

    /**
     * Adds Samples worksheet
     * @param {ExcelJS.Workbook} wb - Workbook to add sheet to
     * @param {Array} sites - Array of site data
     */
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
                            site.site_id,
                            site.site_name ?? ""
                        ];
                        
                        // Process sampleGroup columns - only from sampleGroup
                        sampleGroupKeys.forEach(col => {
                            let value = sampleGroup[col.key] ?? "";
                            value = this.formatCellValue(value, col.key, site);
                            row.push(value !== undefined ? value : "");
                        });
                        
                        // Process physicalSample columns - only from physicalSample
                        physicalSampleKeys.forEach(col => {
                            let value = physicalSample[col.key] ?? "";
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
                filterButton: true
            })),
            rows: dataRows
        });

        // Auto-fit columns
        samplesWorksheet.columns.forEach(column => {
            let maxLength = 10;
            column.eachCell({ includeEmpty: true }, cell => {
                maxLength = Math.max(maxLength, (cell.value ? cell.value.toString().length : 0));
            });
            column.width = maxLength + 2;
        });
    }

    /**
     * Collects all unique sample keys from sites
     * @param {Array} sites - Array of site data
     * @returns {{sampleGroupKeys: Array, physicalSampleKeys: Array}} Arrays of key/title objects
     */
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

    /**
     * Adds analysis data worksheets for each method
     * @param {ExcelJS.Workbook} workbook - Workbook to add sheets to
     * @param {Array} sites - Array of site data
     * @param {Array} methodIds - Optional array of method IDs to filter by
     * @param {Array} dataModules - Array of data modules for generating tables
     */
    addAnalysisSheets(workbook, sites, methodIds = [], dataModules = []) {
        const datagroupsByMethod = this.groupDatagroupsByMethod(sites);

        if(methodIds.length > 0 && methodIds[0] != "all") {
            // Remove all datagroups not in methodIds
            for (const methodId of datagroupsByMethod.keys()) {
                if (!methodIds.includes(methodId)) {
                    datagroupsByMethod.delete(methodId);
                }
            }
        }

        let worksheetNames = new Set();

        for (const [methodId, methodGrouping] of datagroupsByMethod.entries()) {
            this.sqs.sqsEventDispatch("exportProgress", {
                methodId: methodId,
                methodName: methodGrouping.method_name,
            });

            let tables = [];
            dataModules.forEach((dataModule) => {
                tables.push(dataModule.getDataAsTable(methodId, sites));
            });

            let filteredTables = tables.filter(table => {
                if (table == null || table.rows.length === 0) {
                    return false;
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

                // Auto-fit columns
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
            case "descriptions":
                value = this.sqs.formatSampleGroupDescriptions(value, site, false);
                break;
            case "dimensions":
                value = this.sqs.formatDimensions(value, site, false);
                break;
            case "horizons":
                value = this.sqs.formatHorizons(value, site, false);
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
}