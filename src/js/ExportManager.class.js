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
import SamplesDataTransfer from './DataTransferModules/SamplesDataTransfer.class.js';
import SitesDataTransfer from './DataTransferModules/SitesDataTransfer.class.js';
import CsvDataTransfer from './DataTransferModules/CsvDataTransfer.class.js';

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

        // Initialize data transfer modules
        this.dataTransferModules = [];
        this.dataTransferModules.push(new SamplesDataTransfer(sqs));
        this.dataTransferModules.push(new SitesDataTransfer(sqs));
        this.dataTransferModules.push(new CsvDataTransfer(sqs));
    }

    getXlsxOfSamples(siteData, methodIds = []) {
        const dataTransferModule = this.getDataTransferModuleByName('samples');
        if(!dataTransferModule) {
            this.sqs.notificationManager.notify(`Samples data transfer module not found, please contact ${this.sqs.config.supportEmail}`, "error");
            return;
        }
        return dataTransferModule.createWorkbook(siteData, methodIds);
    }

    getXlsxBookOfSites(siteData, methodIds = []) {
        const dataTransferModule = this.getDataTransferModuleByName('sites');
        if(!dataTransferModule) {
            this.sqs.notificationManager.notify(`Sites data transfer module not found, please contact ${this.sqs.config.supportEmail}`, "error");
            return;
        }
        return dataTransferModule.createWorkbook(siteData, methodIds, this.dataModules);
    }

    async getCsvExportOfSites(siteData, methodIds = []) {
        
        const dataTransferModule = this.getDataTransferModuleByName('csv');
        if(!dataTransferModule) {
            this.sqs.notificationManager.notify(`CSV data transfer module not found, please contact ${this.sqs.config.supportEmail}`, "error");
            return;
        }
        return await dataTransferModule.exportFullSitesAsCSV(siteData, methodIds, this.dataModules);
    }

    async getSamplesXlsxBookExport(siteData, returnObjectUrl = true, methodIds = []) {
        const dataTransferModule = this.getDataTransferModuleByName('samples');
        if(!dataTransferModule) {
            this.sqs.notificationManager.notify(`Samples data transfer module not found, please contact ${this.sqs.config.supportEmail}`, "error");
            return;
        }
        return await dataTransferModule.export(siteData, returnObjectUrl, methodIds);
    }

    async getXlsxBookExport(siteData, returnObjectUrl = true, methodIds = []) {
        const dataTransferModule = this.getDataTransferModuleByName('sites');
        if(!dataTransferModule) {
            this.sqs.notificationManager.notify(`Sites data transfer module not found, please contact ${this.sqs.config.supportEmail}`, "error");
            return;
        }
        return await dataTransferModule.export(siteData, returnObjectUrl, methodIds, this.dataModules);
    }

    getDataTransferModuleByName(name) {
        switch (name) {
            case 'samples':
                return this.dataTransferModules.find(module => module instanceof SamplesDataTransfer);
            case 'sites':
                return this.dataTransferModules.find(module => module instanceof SitesDataTransfer);
            case 'csv':
                return this.dataTransferModules.find(module => module instanceof CsvDataTransfer);
            default:
                return null;
        }
    }

    // Note: Site export methods (addSiteSheet, addSamplesSheet, addAnalysisSheets,
    // collectSampleKeys, groupDatagroupsByMethod) have been moved to SitesDataTransfer class.
    // These legacy methods remain for backward compatibility but should be considered deprecated.

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

    // Note: Sample export methods (addSamplesWithAnalysisSheet, collectSamplesWithAnalysisColumns,
    // prepareSamplesWithAnalysisRows, buildSampleAnalysisMap, buildSampleAnalysisRow) 
    // have been moved to SamplesDataTransfer class. These legacy methods remain for backward compatibility
    // but should be considered deprecated.

    /**
     * Adds a comprehensive worksheet with samples and all their analysis data
     * @param {ExcelJS.Workbook} wb - The workbook to add the sheet to
     * @param {Array} sites - Array of site data
     * @param {Array} methodIds - Optional array of method IDs to filter by
     */
    addSamplesWithAnalysisSheet(wb, sites, methodIds = []) {
        const worksheet = wb.addWorksheet("Samples with Analysis Data");

        // Collect all columns needed across all samples and analysis data
        const { columns, columnKeys } = this.collectSamplesWithAnalysisColumns(sites, methodIds);

        // Prepare all data rows
        const dataRows = this.prepareSamplesWithAnalysisRows(sites, columnKeys, methodIds);

        if (dataRows.length === 0) {
            console.warn("No sample data found to export");
            return;
        }

        // Add as an Excel Table
        worksheet.addTable({
            name: 'SamplesAnalysisTable',
            ref: 'A1',
            headerRow: true,
            style: {
                theme: 'TableStyleMedium2',
                showRowStripes: true
            },
            columns: columns.map(col => ({
                name: col.title,
                filterButton: true
            })),
            rows: dataRows
        });

        // Auto-fit columns
        worksheet.columns.forEach(column => {
            let maxLength = 10;
            column.eachCell({ includeEmpty: true }, cell => {
                maxLength = Math.max(maxLength, (cell.value ? cell.value.toString().length : 0));
            });
            column.width = Math.min(maxLength + 2, 50); // Cap at 50 for very wide columns
        });
    }

    /**
     * Collects all columns needed for samples with analysis data
     * @param {Array} sites - Array of site data
     * @param {Array} methodIds - Optional array of method IDs to filter by
     * @returns {{columns: Array, columnKeys: Array}} Column definitions and keys
     */
    collectSamplesWithAnalysisColumns(sites, methodIds = []) {
        const columns = [];
        const columnKeys = [];

        // Add base site and sample columns
        const baseColumns = [
            { key: "site_id", title: "Site ID" },
            { key: "site_name", title: "Site name" },
            { key: "site_latitude", title: "Site Latitude (WGS84)" },
            { key: "site_longitude", title: "Site Longitude (WGS84)" },
            { key: "site_coordinate_system", title: "Site Coordinate System" },
            { key: "sample_group_id", title: "Sample Group ID" },
            { key: "sample_group_name", title: "Sample Group Name" },
            { key: "sample_id", title: "Sample ID" },
            { key: "sample_name", title: "Sample Name" },
            { key: "sample_x", title: "Sample X" },
            { key: "sample_y", title: "Sample Y" },
            { key: "sample_z", title: "Sample Z" },
            { key: "sample_xy_coordinate_system", title: "Sample X/Y Coordinate System" },
            { key: "sample_z_coordinate_system", title: "Sample Z Coordinate System" },
            { key: "sample_type", title: "Sample Type" },
            { key: "sampling_method", title: "Sampling Method" },
            { key: "sample_date", title: "Sample Date" },
            { key: "analysis_method_name", title: "Analysis Method" },
            { key: "dataset_name", title: "Dataset Name" }
        ];

        baseColumns.forEach(col => {
            columns.push(col);
            columnKeys.push(col.key);
        });

        // Collect all analysis data columns from data modules
        // Map structure: methodId -> Set of column names
        const methodColumnsMap = new Map();
        
        sites.forEach(site => {
            if (!Array.isArray(site.datasets)) return;
            
            site.datasets.forEach(dataset => {
                const methodId = dataset.method_id;
                
                // Filter by method IDs if specified
                if (methodIds.length > 0 && methodIds[0] !== "all") {
                    if (!methodIds.includes(methodId)) return;
                }
                
                // Collect column names from analysis entities
                if (Array.isArray(dataset.analysis_entities)) {
                    dataset.analysis_entities.forEach(entity => {
                        if (methodId) {
                            if (!methodColumnsMap.has(methodId)) {
                                methodColumnsMap.set(methodId, new Set());
                            }
                            
                            const columnSet = methodColumnsMap.get(methodId);
                            
                            Object.keys(entity).forEach(key => {
                                // Skip internal/complex fields and IDs we handle separately
                                if (!['abundances', 'dating_values', 'measured_values', 'method_id', 'physical_sample_id', 'dataset_id', 'analysis_entity_id', 'date_updated', 'prepMethods'].includes(key)) {
                                    columnSet.add(key);
                                }
                            });

                            // Add prepMethods as a column
                            if (entity.prepMethods) {
                                columnSet.add('prep_methods');
                            }

                            // Handle special nested structures
                            if (entity.abundances && Array.isArray(entity.abundances)) {
                                columnSet.add('taxon');
                                columnSet.add('abundance');
                                columnSet.add('abundance_element');
                            }
                            if (entity.measured_values && Array.isArray(entity.measured_values)) {
                                columnSet.add('measured_value');
                            }
                            if (entity.dating_values && Array.isArray(entity.dating_values)) {
                                columnSet.add('dating_value');
                                columnSet.add('dating_uncertainty');
                                columnSet.add('dating_method');
                            }
                        }
                    });
                }
            });
        });

        // Add analysis columns grouped by method
        // Sort methods for consistent ordering
        const sortedMethodIds = Array.from(methodColumnsMap.keys()).sort();
        
        sortedMethodIds.forEach(methodId => {
            // Look up method name
            let methodName = methodId;
            for (const site of sites) {
                const lookedUpName = this.lookupValue(site, 'methods', 'method_id', methodId, 'method_name');
                if (lookedUpName) {
                    methodName = lookedUpName;
                    break;
                }
            }
            
            const columnSet = methodColumnsMap.get(methodId);
            const sortedColumns = Array.from(columnSet).sort();
            
            sortedColumns.forEach(key => {
                const title = this.defaultTitle(key);
                columns.push({ 
                    key: `analysis_${methodId}_${key}`, 
                    title: `${methodName}: ${title}`,
                    methodId: methodId,
                    analysisKey: key
                });
                columnKeys.push(`analysis_${methodId}_${key}`);
            });
        });

        return { columns, columnKeys };
    }

    /**
     * Prepares data rows for samples with analysis data
     * @param {Array} sites - Array of site data
     * @param {Array} columnKeys - Array of column keys to include
     * @param {Array} methodIds - Optional array of method IDs to filter by
     * @returns {Array} Array of data rows
     */
    prepareSamplesWithAnalysisRows(sites, columnKeys, methodIds = []) {
        const dataRows = [];

        sites.forEach(site => {
            if (!Array.isArray(site.sample_groups)) return;

            // Build a map of physical_sample_id to analysis data grouped by method
            const sampleAnalysisMap = this.buildSampleAnalysisMap(site, methodIds);

            site.sample_groups.forEach(sampleGroup => {
                if (!Array.isArray(sampleGroup.physical_samples)) return;

                sampleGroup.physical_samples.forEach(physicalSample => {
                    const sampleId = physicalSample.physical_sample_id;
                    const analysisDataByMethod = sampleAnalysisMap.get(sampleId) || new Map();

                    // Create a single row with all analysis data for this sample
                    const row = this.buildSampleAnalysisRow(
                        site, 
                        sampleGroup, 
                        physicalSample, 
                        analysisDataByMethod, 
                        columnKeys
                    );
                    dataRows.push(row);
                });
            });
        });

        return dataRows;
    }

    /**
     * Builds a map of sample IDs to their analysis data grouped by method
     * @param {Object} site - Site data
     * @param {Array} methodIds - Optional array of method IDs to filter by
     * @returns {Map} Map of sample ID to array of analysis data
     */
    /**
     * Builds a map of sample IDs to their analysis data grouped by method
     * @param {Object} site - Site data
     * @param {Array} methodIds - Optional array of method IDs to filter by
     * @returns {Map} Map of sample ID to Map of method ID to array of analysis data
     */
    buildSampleAnalysisMap(site, methodIds = []) {
        const sampleAnalysisMap = new Map();

        if (!Array.isArray(site.datasets)) return sampleAnalysisMap;

        site.datasets.forEach(dataset => {
            const methodId = dataset.method_id;
            
            // Filter by method IDs if specified
            if (methodIds.length > 0 && methodIds[0] !== "all") {
                if (!methodIds.includes(methodId)) return;
            }

            if (!Array.isArray(dataset.analysis_entities)) return;

            dataset.analysis_entities.forEach(entity => {
                const sampleId = entity.physical_sample_id;
                
                if (!sampleId || !methodId) return;

                if (!sampleAnalysisMap.has(sampleId)) {
                    sampleAnalysisMap.set(sampleId, new Map());
                }
                
                const methodMap = sampleAnalysisMap.get(sampleId);
                if (!methodMap.has(methodId)) {
                    methodMap.set(methodId, []);
                }

                // Enrich entity with dataset info
                const enrichedEntity = {
                    ...entity,
                    method_id: methodId,
                    dataset_id: dataset.dataset_id,
                    dataset_name: dataset.dataset_name
                };

                // Handle different types of analysis data
                if (entity.abundances && Array.isArray(entity.abundances)) {
                    // Create entries for each abundance
                    entity.abundances.forEach(abundance => {
                        methodMap.get(methodId).push({
                            ...enrichedEntity,
                            taxon: abundance.taxon_name || abundance.taxon_id,
                            abundance: abundance.abundance,
                            abundance_element: abundance.element_name || abundance.element_id
                        });
                    });
                } else if (entity.measured_values && Array.isArray(entity.measured_values)) {
                    // Create entries for each measured value
                    entity.measured_values.forEach(measured => {
                        methodMap.get(methodId).push({
                            ...enrichedEntity,
                            measured_value: measured.measured_value
                        });
                    });
                } else if (entity.dating_values && Array.isArray(entity.dating_values)) {
                    // Create entries for each dating value
                    entity.dating_values.forEach(dating => {
                        methodMap.get(methodId).push({
                            ...enrichedEntity,
                            dating_value: dating.age,
                            dating_uncertainty: dating.uncertainty,
                            dating_method: dating.method_name
                        });
                    });
                } else {
                    // Simple analysis data without nested arrays
                    methodMap.get(methodId).push(enrichedEntity);
                }
            });
        });

        return sampleAnalysisMap;
    }

    /**
     * Builds a single row for a sample with all its analysis data from different methods
     * @param {Object} site - Site data
     * @param {Object} sampleGroup - Sample group data
     * @param {Object} physicalSample - Physical sample data
     * @param {Map} analysisDataByMethod - Map of method ID to array of analysis data
     * @param {Array} columnKeys - Array of column keys
     * @returns {Array} Row data
     */
    buildSampleAnalysisRow(site, sampleGroup, physicalSample, analysisDataByMethod, columnKeys) {
        console.log(site);
        const row = [];

        // Extract coordinates from site and sample
        const siteCoords = this.extractCoordinates(site.latitude_dd, site.longitude_dd);
        
        // Try multiple locations for sample coordinates
        let sampleX = null;
        let sampleY = null;
        let sampleZ = null;
        const sampleXYCoordMethods = new Set();
        const sampleZCoordMethods = new Set();
        
        // First try physical sample coordinates
        if (physicalSample.coordinates && Array.isArray(physicalSample.coordinates) && physicalSample.coordinates.length > 0) {
            // Coordinates structure: { measurement: <value>, dimension_id: <id>, coordinate_method_id: <id>, accuracy: <value> }
            physicalSample.coordinates.forEach(coord => {
                if (coord.dimension_id && coord.measurement !== undefined && coord.measurement !== null) {
                    // Look up dimension name using dimension_id
                    const dimensionName = this.lookupValue(site, 'dimensions', 'dimension_id', coord.dimension_id, 'dimension_name')?.toLowerCase() || '';
                    
                    // Check for X/latitude/north variations
                    if (dimensionName.includes('latitude') || 
                        dimensionName === 'lat' || 
                        dimensionName.includes('north') ||
                        dimensionName === 'x/north') {
                        sampleX = coord.measurement;
                        if (coord.coordinate_method_id) {
                            sampleXYCoordMethods.add(coord.coordinate_method_id);
                        }
                    } 
                    // Check for Y/longitude/east variations
                    else if (dimensionName.includes('longitude') || 
                             dimensionName === 'lon' || 
                             dimensionName === 'long' ||
                             dimensionName.includes('east') ||
                             dimensionName === 'y/east') {
                        sampleY = coord.measurement;
                        if (coord.coordinate_method_id) {
                            sampleXYCoordMethods.add(coord.coordinate_method_id);
                        }
                    }
                    // Check for Z/height/altitude variations
                    else if (dimensionName.includes('height') ||
                             dimensionName.includes('altitude') ||
                             dimensionName.includes('elevation') ||
                             dimensionName === 'z') {
                        sampleZ = coord.measurement;
                        if (coord.coordinate_method_id) {
                            sampleZCoordMethods.add(coord.coordinate_method_id);
                        }
                    }
                }
            });
        }
        
        // Fall back to sample group coordinates if not found in physical sample
        if (!sampleX && !sampleY && !sampleZ && sampleGroup.coordinates && Array.isArray(sampleGroup.coordinates) && sampleGroup.coordinates.length > 0) {
            sampleGroup.coordinates.forEach(coord => {
                if (coord.dimension_id && coord.measurement !== undefined && coord.measurement !== null) {
                    // Look up dimension name using dimension_id
                    const dimensionName = this.lookupValue(site, 'dimensions', 'dimension_id', coord.dimension_id, 'dimension_name')?.toLowerCase() || '';
                    
                    // Check for X/latitude/north variations
                    if (dimensionName.includes('latitude') || 
                        dimensionName === 'lat' || 
                        dimensionName.includes('north') ||
                        dimensionName === 'x/north') {
                        sampleX = coord.measurement;
                        if (coord.coordinate_method_id) {
                            sampleXYCoordMethods.add(coord.coordinate_method_id);
                        }
                    } 
                    // Check for Y/longitude/east variations
                    else if (dimensionName.includes('longitude') || 
                             dimensionName === 'lon' || 
                             dimensionName === 'long' ||
                             dimensionName.includes('east') ||
                             dimensionName === 'y/east') {
                        sampleY = coord.measurement;
                        if (coord.coordinate_method_id) {
                            sampleXYCoordMethods.add(coord.coordinate_method_id);
                        }
                    }
                    // Check for Z/height/altitude variations
                    else if (dimensionName.includes('height') ||
                             dimensionName.includes('altitude') ||
                             dimensionName.includes('elevation') ||
                             dimensionName === 'z') {
                        sampleZ = coord.measurement;
                        if (coord.coordinate_method_id) {
                            sampleZCoordMethods.add(coord.coordinate_method_id);
                        }
                    }
                }
            });
        }
        
        // Look up X/Y coordinate system(s) from method(s)
        const sampleXYCoordSystems = Array.from(sampleXYCoordMethods).map(methodId =>
            this.lookupValue(site, 'methods', 'method_id', methodId, 'method_name')
        ).filter(name => name);
        const sampleXYCoordSystem = sampleXYCoordSystems.join('; ');
        
        // Look up Z coordinate system(s) from method(s)
        const sampleZCoordSystems = Array.from(sampleZCoordMethods).map(methodId =>
            this.lookupValue(site, 'methods', 'method_id', methodId, 'method_name')
        ).filter(name => name);
        const sampleZCoordSystem = sampleZCoordSystems.join('; ');
        
        const sampleCoords = this.extractCoordinatesXYZ(sampleX, sampleY, sampleZ, sampleXYCoordSystem, sampleZCoordSystem);

        // Get sample type and sampling method from lookup tables
        const sampleType = this.lookupValue(site, 'sample_types', 'type_id', sampleGroup.sample_type_id, 'type_name');
        const samplingMethod = this.lookupValue(site, 'methods', 'method_id', sampleGroup.sampling_method_id, 'method_name');

        columnKeys.forEach(key => {
            let value = "";

            switch(key) {
                case "site_id":
                    value = site.site_id;
                    break;
                case "site_name":
                    value = site.site_name;
                    break;
                case "site_latitude":
                    value = siteCoords.latitude;
                    break;
                case "site_longitude":
                    value = siteCoords.longitude;
                    break;
                case "site_coordinate_system":
                    value = "WGS84";
                    break;
                case "sample_group_id":
                    value = sampleGroup.sample_group_id;
                    break;
                case "sample_group_name":
                    value = sampleGroup.sample_group_name || sampleGroup.sample_name;
                    break;
                case "sample_id":
                    value = physicalSample.physical_sample_id;
                    break;
                case "sample_name":
                    value = physicalSample.sample_name;
                    break;
                case "sample_x":
                    value = sampleCoords.x;
                    break;
                case "sample_y":
                    value = sampleCoords.y;
                    break;
                case "sample_z":
                    value = sampleCoords.z;
                    break;
                case "sample_xy_coordinate_system":
                    value = sampleCoords.xySystem;
                    break;
                case "sample_z_coordinate_system":
                    value = sampleCoords.zSystem;
                    break;
                case "sample_type":
                    value = sampleType;
                    break;
                case "sampling_method":
                    value = samplingMethod;
                    break;
                case "sample_date":
                    value = physicalSample.date_sampled || sampleGroup.date_sampled;
                    break;
                case "analysis_method_name":
                    // Collect all method names for this sample
                    if (analysisDataByMethod && analysisDataByMethod.size > 0) {
                        const methodNames = Array.from(analysisDataByMethod.keys()).map(methodId =>
                            this.lookupValue(site, 'methods', 'method_id', methodId, 'method_name')
                        ).filter(name => name);
                        value = methodNames.join('; ');
                    }
                    break;
                case "dataset_name":
                    // Collect all dataset names for this sample
                    if (analysisDataByMethod && analysisDataByMethod.size > 0) {
                        const datasetNames = new Set();
                        analysisDataByMethod.forEach(dataList => {
                            dataList.forEach(data => {
                                if (data.dataset_id) {
                                    const name = this.lookupDatasetName(site, data.dataset_id);
                                    if (name) datasetNames.add(name);
                                }
                            });
                        });
                        value = Array.from(datasetNames).join('; ');
                    }
                    break;
                default:
                    // Handle analysis data columns with format: analysis_<methodId>_<key>
                    if (key.startsWith("analysis_") && analysisDataByMethod) {
                        // Parse the key format: analysis_<methodId>_<analysisKey>
                        const keyParts = key.split('_');
                        if (keyParts.length >= 3) {
                            const methodId = parseInt(keyParts[1]);
                            const analysisKey = keyParts.slice(2).join('_');
                            
                            // Get analysis data for this specific method
                            if (analysisDataByMethod.has(methodId)) {
                                const dataList = analysisDataByMethod.get(methodId);
                                // Collect all values for this key across all entries for this method
                                const values = dataList.map(data => {
                                    let val = data[analysisKey];
                                    
                                    // Special handling for prep_methods - lookup the method name
                                    if (analysisKey === 'prep_methods' && val) {
                                        const prepMethodIds = Array.isArray(val) ? val : [val];
                                        const prepMethodNames = prepMethodIds.map(prepMethodId => 
                                            this.lookupValue(site, 'methods', 'method_id', prepMethodId, 'method_name')
                                        ).filter(name => name);
                                        return prepMethodNames.join(', ');
                                    }
                                    
                                    return val;
                                }).filter(v => v !== undefined && v !== null && v !== '');
                                
                                value = values.join('; ');
                            }
                        }
                    }
                    break;
            }

            // Format complex values
            if (typeof value === 'object' && value !== null) {
                value = JSON.stringify(value);
            } else if (Array.isArray(value)) {
                value = value.join("; ");
            }

            // Clean up HTML if needed
            if (typeof value === 'string') {
                value = this.stripHtmlUsingDOM(value);
            }

            row.push(value !== undefined && value !== null ? value : "");
        });

        return row;
    }

    /**
     * Extracts and formats coordinates
     * @param {number|string} latitude - Latitude value
     * @param {number|string} longitude - Longitude value
     * @returns {{latitude: string, longitude: string, system: string}} Formatted coordinates
     */
    extractCoordinates(latitude, longitude) {
        return {
            latitude: latitude ? String(latitude) : "",
            longitude: longitude ? String(longitude) : "",
            system: (latitude || longitude) ? "WGS84" : ""
        };
    }

    /**
     * Extracts and formats X/Y/Z coordinates with coordinate systems
     * @param {number|string} x - X coordinate value
     * @param {number|string} y - Y coordinate value
     * @param {number|string} z - Z coordinate value
     * @param {string} xySystem - X/Y coordinate system name
     * @param {string} zSystem - Z coordinate system name
     * @returns {{x: string, y: string, z: string, xySystem: string, zSystem: string}} Formatted coordinates
     */
    extractCoordinatesXYZ(x, y, z, xySystem, zSystem) {
        return {
            x: x !== null && x !== undefined ? String(x) : "",
            y: y !== null && y !== undefined ? String(y) : "",
            z: z !== null && z !== undefined ? String(z) : "",
            xySystem: xySystem || "",
            zSystem: zSystem || ""
        };
    }

    /**
     * Looks up a value from site lookup tables
     * @param {Object} site - Site data
     * @param {string} tableName - Name of the lookup table
     * @param {string} keyField - Field name to match
     * @param {*} keyValue - Value to match
     * @param {string} returnField - Field to return
     * @returns {string} Looked up value or empty string
     */
    lookupValue(site, tableName, keyField, keyValue, returnField) {
        if (!site.lookup_tables || !site.lookup_tables[tableName]) return "";
        
        const entry = site.lookup_tables[tableName].find(item => 
            item[keyField] === keyValue
        );
        
        return entry ? (entry[returnField] || "") : "";
    }

    /**
     * Looks up dataset name from site datasets or data_groups
     * @param {Object} site - Site data
     * @param {*} datasetId - Dataset ID to look up
     * @returns {string} Dataset name or empty string
     */
    lookupDatasetName(site, datasetId) {
        // First try datasets array
        if (site.datasets && Array.isArray(site.datasets)) {
            const dataset = site.datasets.find(ds => ds.dataset_id === datasetId);
            if (dataset) {
                return dataset.dataset_name || dataset.title || dataset.name || "";
            }
        }
        
        // Then try data_groups
        if (site.data_groups && Array.isArray(site.data_groups)) {
            const dataGroup = site.data_groups.find(dg => dg.dataset_id === datasetId);
            if (dataGroup) {
                return dataGroup.dataset_name || dataGroup.title || dataGroup.name || "";
            }
        }
        
        return "";
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

        if(methodIds.length > 0 && methodIds[0] != "all") {
            //remove all datagroups in datagroupsByMethod that are not in methodIds
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