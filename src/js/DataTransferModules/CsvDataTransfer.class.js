import DataTransferModule from './DataTransferModule.class.js';

export default class CsvDataTransfer extends DataTransferModule {
    constructor(sqs) {
        super(sqs);
    }

    /**
     * Exports sites to CSV format with basic metadata
     * @param {Object|Array} siteData - Site data (single site or array of sites)
     * @param {boolean} returnObjectUrl - If true, returns a Blob URL; otherwise, returns a Blob
     * @returns {Promise<string|Blob>} The Blob URL or Blob object
     */
    async exportSites(siteData, returnObjectUrl = true) {
        const sites = Array.isArray(siteData) ? siteData : [siteData];
        
        let siteExportCsv = "\uFEFF"; // Byte Order Mark (BOM) to force Excel to open the file with UTF-8 encoding
        siteExportCsv += `"Id","Name","National site identifier","Latitude","Longitude","Description"\r\n`;
    
        sites.forEach(site => {
            // Sanitize each value
            const siteName = this.sanitizeForCsv(site.site_name);
            const siteDescription = this.sanitizeForCsv(site.site_description);
            const nationalSiteIdentifier = this.sanitizeForCsv(site.national_site_identifier);
    
            // Add the sanitized values to the CSV string
            siteExportCsv += `${this.sanitizeForCsv(site.site_id)},${siteName},${nationalSiteIdentifier},${this.sanitizeForCsv(site.latitude_dd)},${this.sanitizeForCsv(site.longitude_dd)},${siteDescription}\r\n`;
        });
    
        const bytes = new TextEncoder().encode(siteExportCsv);
        const blob = new Blob([bytes], {
            type: "text/csv;charset=utf-8"
        });

        if (returnObjectUrl) {
            return URL.createObjectURL(blob);
        }
        return blob;
    }

    /**
     * Sanitizes a value for CSV output
     * @param {*} str - Value to sanitize
     * @returns {string} Sanitized CSV value
     */
    sanitizeForCsv(str) {
        if (str == null) {
            return '""'; // Return empty quotes if the value is null or undefined
        }
        str = str.toString(); // Ensure the value is a string
        if (str.startsWith('"') && str.endsWith('"')) {
            // If already wrapped in quotes, return as-is
            return str;
        }
        // Otherwise, wrap in quotes and replace any existing double quotes with escaped quotes
        return `"${str.replace(/"/g, '""')}"`;
    }

    /**
     * Exports full sites with all data as CSV files in ZIP archive
     * @param {Object|Array} siteData - Site data with full details
     * @param {Array} methodIds - Optional array of method IDs to filter by
     * @param {Array} dataModules - Array of data modules for analysis sheets
     * @returns {Promise<string|Blob>} The Blob URL or Blob object
     */
    async exportFullSitesAsCSV(siteData, methodIds = [], dataModules = []) {
        // Import SitesDataTransfer to reuse workbook creation
        const SitesDataTransfer = (await import('./SitesDataTransfer.class.js')).default;
        const sitesTransfer = new SitesDataTransfer(this.sqs);
        
        const wb = sitesTransfer.createWorkbook(siteData, methodIds, dataModules);
        const csvFilesData = this.convertXlsxWorkbookToCsvs(wb);
        return await this.exportCsvsAsZipFile(csvFilesData);
    }
}
