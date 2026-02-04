import DataTransferModule from './DataTransferModule.class.js';
import ExcelJS from 'exceljs';

export default class SamplesDataTransfer extends DataTransferModule {
    constructor(sqs) {
        super(sqs);
    }

    /**
     * Creates an Excel workbook with samples and their analysis data
     * @param {Object|Array} siteData - Site data (single site or array of sites)
     * @param {Array} methodIds - Optional array of method IDs to filter by (default: all methods)
     * @returns {ExcelJS.Workbook} Excel workbook
     */
    createWorkbook(siteData, methodIds = []) {
        const wb = new ExcelJS.Workbook();
        const sites = Array.isArray(siteData) ? siteData : [siteData];

        console.time("Exporting samples with analysis data to XLSX");
        this.addSamplesWithAnalysisSheet(wb, sites, methodIds);
        console.timeEnd("Exporting samples with analysis data to XLSX");

        return wb;
    }

    /**
     * Exports samples with analysis data to Excel format
     * @param {Object|Array} siteData - Site data
     * @param {boolean} returnObjectUrl - If true, returns a Blob URL; otherwise, returns a Blob
     * @param {Array} methodIds - Optional array of method IDs to filter by
     * @returns {Promise<string|Blob>} The Blob URL or Blob object
     */
    async export(siteData, returnObjectUrl = true, methodIds = []) {
        const wb = this.createWorkbook(siteData, methodIds);
        return await this.exportWorkbook(wb, returnObjectUrl);
    }

    /**
     * Adds worksheet with samples and their analysis data
     * @param {ExcelJS.Workbook} wb - Workbook to add sheet to
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
            { key: "coordinates_google_maps", title: "Google Maps Link" },
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

        // Collect all analysis data columns from datasets
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
        const row = [];

        // Extract coordinates from site and sample
        const siteCoords = this.extractCoordinates(site.latitude_dd, site.longitude_dd);
        
        // Generate Google Maps formatted coordinates
        const googleMapsCoords = this.formatCoordinatesForGoogleMaps(site.latitude_dd, site.longitude_dd);
        
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
                case "coordinates_google_maps":
                    value = googleMapsCoords;
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
}