import ExcelJS from 'exceljs';
import proj4 from 'proj4';

export default class DataTransferModule {
    constructor(sqs) {
        this.sqs = sqs;
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

    /**
     * Converts a field name to a default human-readable title
     * @param {string} key - Field name
     * @returns {string} Title-cased string
     */
    defaultTitle(key) {
        return key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
    }

    /**
     * Strips HTML tags from a string using DOM parser
     * @param {string} html - HTML string
     * @returns {string} Text content without HTML tags
     */
    stripHtmlUsingDOM(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
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

    /**
     * Converts an Excel workbook to CSV files (one per sheet)
     * @param {ExcelJS.Workbook} wb - Excel workbook
     * @returns {Object} Map of worksheet names to CSV strings
     */
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

    /**
     * Exports CSV files as a ZIP archive
     * @param {Object} csvFilesData - Map of filenames to CSV strings
     * @param {boolean} returnObjectUrl - If true, returns a Blob URL; otherwise, returns a Blob
     * @returns {Promise<string|Blob>} The Blob URL or Blob object
     */
    async exportCsvsAsZipFile(csvFilesData, returnObjectUrl = true) {
        const JSZip = (await import('jszip')).default;
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
     * Sanitizes a string to be used as an Excel worksheet name.
     * @param {string} name The proposed worksheet name.
     * @returns {string} The sanitized worksheet name.
     */
    sanitizeWorksheetName(name) {
        return name.substring(0, 30).replace(/[/\\?*[\]:]/g, '_');
    }

    /**
     * Initialize proj4 projection definitions (call once)
     * Based on OpenLayersMap.preparePlanarCoordinates
     */
    initializeProjectionDefinitions() {
        if (this._projDefsInitialized) {
            return;
        }

        // WGS84 (EPSG:4326) – explicit, for clarity/consistency
        proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

        // SWEREF99 TM (EPSG:3006) – correct definition (NOT UTM zone 33)
        // Central meridian 15, scale 0.9996, false easting 500000.
        proj4.defs(
            "EPSG:3006",
            "+proj=tmerc +lat_0=0 +lon_0=15 +k=0.9996 +x_0=500000 +y_0=0 " +
            "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
        );

        // RT90 family (Bessel + 7-param Helmert to WGS84)
        proj4.defs(
            "EPSG:3018", // RT90 0.0 gon V
            "+proj=tmerc +lat_0=0 +lon_0=18.0582777777778 +k=1 +x_0=1500000 +y_0=0 " +
            "+ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs"
        );
        proj4.defs(
            "EPSG:3019", // RT90 2.5 gon V?  (Do NOT rely on this label; see below.)
            "+proj=tmerc +lat_0=0 +lon_0=11.3082777777778 +k=1 +x_0=1500000 +y_0=0 " +
            "+ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs"
        );
        proj4.defs(
            "EPSG:3020", // RT90 5 gon V
            "+proj=tmerc +lat_0=0 +lon_0=13.5582777777778 +k=1 +x_0=1500000 +y_0=0 " +
            "+ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs"
        );
        proj4.defs(
            "EPSG:3021", // RT90 2.5 gon V
            "+proj=tmerc +lat_0=0 +lon_0=15.8082777777778 +k=1 +x_0=1500000 +y_0=0 " +
            "+ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs"
        );
        proj4.defs(
            "EPSG:3024", // RT90 0 gon
            "+proj=tmerc +lat_0=0 +lon_0=20.8082777777778 +k=1 +x_0=1500000 +y_0=0 " +
            "+ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs"
        );

        // UTM helpers
        proj4.defs(
            "EPSG:32632",
            "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs"
        );
        proj4.defs(
            "EPSG:32633",
            "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs"
        );

        // local grids
        proj4.defs(
            "gothenburg-local",
            "+proj=tmerc +lat_0=0 +lon_0=11.304996 +k=1.00000867 " +
            "+x_0=-6370680.1969 +y_0=-80.0124 +ellps=GRS80 +units=m +no_defs"
        );

        this._projDefsInitialized = true;
    }

    /**
     * Converts planar coordinates to WGS84 based on coordinate method ID
     * Based on OpenLayersMap.preparePlanarCoordinates
     * @param {number|string} x - X/Easting/Longitude coordinate
     * @param {number|string} y - Y/Northing/Latitude coordinate
     * @param {number} coordinateMethodId - Coordinate method ID from database
     * @returns {{longitude: number, latitude: number, coordinateSystem: string}|null} Converted coordinates or null
     */
    convertPlanarCoordinatesToWGS84(x, y, coordinateMethodId) {
        if (!x || !y || !coordinateMethodId) {
            return null;
        }

        this.initializeProjectionDefinitions();

        const X = Number(x);
        const Y = Number(y);

        if (isNaN(X) || isNaN(Y)) {
            return null;
        }

        // IMPORTANT: proj4 expects [x,y] = [easting, northing] for projected CRS.
        const XY = [X, Y];
        let outputCoords = null;
        let coordinateSystem = null;

        switch (coordinateMethodId) {
            case 113: // "Malmö stads koordinatnät"
            case 105: // "Local grid"
            case 108: // "Göteborgs kommuns koordinatsystem" (treat as local)
                // Local grids cannot be converted to WGS84 without specific transformation
                outputCoords = null;
                coordinateSystem = "local";
                break;

            case 103: // "RT90 5 gon V"
                outputCoords = proj4("EPSG:3020", "EPSG:4326", XY); // => [lon, lat]
                coordinateSystem = "EPSG:4326";
                break;

            case 69: // "RT90 2.5 gon V"
                outputCoords = proj4("EPSG:3021", "EPSG:4326", XY);
                coordinateSystem = "EPSG:4326";
                break;

            case 72: // "WGS84" (already lon/lat)
                outputCoords = [X, Y];
                coordinateSystem = "EPSG:4326";
                break;

            case 70: // "SWEREF 99 TM (Swedish)"
                outputCoords = proj4("EPSG:3006", "EPSG:4326", XY);
                coordinateSystem = "EPSG:4326";
                break;

            case 114: // "WGS84 UTM zone 32"
                outputCoords = proj4("EPSG:32632", "EPSG:4326", XY);
                coordinateSystem = "EPSG:4326";
                break;

            case 120: // "WGS84 UTM zone 33N"
                outputCoords = proj4("EPSG:32633", "EPSG:4326", XY);
                coordinateSystem = "EPSG:4326";
                break;

            case 123: // "UTM U32 euref89" (commonly ETRS89 / UTM 32N)
                outputCoords = proj4(
                    "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
                    "EPSG:4326",
                    XY
                );
                coordinateSystem = "EPSG:4326";
                break;

            // Heights/depths etc. are intentionally ignored here (no planar output)
            case 78: // "Height from datum"
            case 80: // "Height from surface"
            case 77: // "Depth from reference level"
            case 76: // "Altitude above sea level"
            case 79: // "Depth from surface"
            case 121: // "Rikets höjdsystem 1900"
            case 102: // "RH70"
            case 115: // "Depth from surface lower sample boundary"
            case 116: // "Depth from surface upper sample boundary"
            case 122: // "Depth from surface lower sample boundary "
            case 125: // "Upper sample boundary"
            case 126: // "Lower sample boundary depth"
                outputCoords = null;
                coordinateSystem = null;
                break;

            default:
                console.warn(
                    "WARN: Support for coordinate method not implemented (ID " +
                    coordinateMethodId + ")"
                );
                outputCoords = null;
                coordinateSystem = null;
        }

        if (!outputCoords || !coordinateSystem || coordinateSystem === "local") {
            return null;
        }

        // outputCoords is [longitude, latitude]
        return {
            longitude: outputCoords[0],
            latitude: outputCoords[1],
            coordinateSystem: coordinateSystem
        };
    }

    /**
     * Formats coordinates as a Google Maps link in WGS84
     * Converts from various coordinate systems to WGS84 when possible
     * @param {number|string} lat - Latitude or Y coordinate
     * @param {number|string} lon - Longitude or X coordinate
     * @param {number} coordinateMethodId - Optional coordinate method ID for conversion
     * @returns {string} Google Maps URL or empty string
     */
    formatCoordinatesForGoogleMaps(lat, lon, coordinateMethodId = null) {
        if (!lat || !lon) {
            return "";
        }

        let latitude = parseFloat(lat);
        let longitude = parseFloat(lon);

        if (isNaN(latitude) || isNaN(longitude)) {
            return "";
        }

        // If we have a coordinate method ID, use the comprehensive conversion
        if (coordinateMethodId) {
            const converted = this.convertPlanarCoordinatesToWGS84(longitude, latitude, coordinateMethodId);
            if (converted) {
                latitude = converted.latitude;
                longitude = converted.longitude;
            }
        }

        // Format with reasonable precision (6 decimal places is ~0.1 meters)
        // Google Maps URL format: https://www.google.com/maps?q=latitude,longitude
        const latStr = latitude.toFixed(6);
        const lonStr = longitude.toFixed(6);
        return `https://www.google.com/maps?q=${latStr},${lonStr}`;
    }
}