import MosaicTileModule from "./MosaicTileModule.class";

/**
 * DendroBaseModule - Base class for dendrochronology tile modules
 *
 * Holds dendro-specific data parsing and fetching. Generic charting/export
 * infrastructure lives in MosaicTileModule (the shared base).
 */
class DendroBaseModule extends MosaicTileModule {
    constructor(sqs) {
        super(sqs);
        this.domains = ["dendrochronology"];
        this.showChartSelector = false; // Dendro modules don't need chart selector
    }

    /**
     * Parse numeric dendro values handling special formats
     */
    parseDendroNumericValue(value) {
        if(!value || value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim();

        if(stringValue === "" || stringValue.toLowerCase() === "undefined") {
            return null;
        }

        // Handle greater than (>28 becomes 29)
        if(stringValue.startsWith(">")) {
            const num = parseFloat(stringValue.substring(1));
            return isNaN(num) ? null : num + 1;
        }

        // Handle less than (<28 becomes 27)
        if(stringValue.startsWith("<")) {
            const num = parseFloat(stringValue.substring(1));
            return isNaN(num) ? null : num - 1;
        }

        // Handle ranges (71-72 becomes 71)
        if(stringValue.includes("-")) {
            const parts = stringValue.split("-");
            const num = parseFloat(parts[0]);
            return isNaN(num) ? null : num;
        }

        // Strip out uncertainty symbols: ?, ~, and any whitespace
        const cleaned = stringValue.replace(/[?~\s]/g, "");

        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    /**
     * Parse binary dendro values (Yes/No)
     */
    parseDendroBinaryValue(value) {
        if(!value || value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim();

        if(stringValue === "" || stringValue.toLowerCase() === "undefined") {
            return null;
        }

        const cleaned = stringValue.replace(/[?~\s]/g, "").toLowerCase();

        if(cleaned === "ja" || cleaned === "yes" || cleaned === "y" || cleaned === "j") {
            return "Yes";
        }

        if(cleaned === "nej" || cleaned === "no" || cleaned === "n") {
            return "No";
        }

        return null;
    }

    /**
     * Parse ternary dendro values (Yes/Maybe/No)
     */
    parseDendroTernaryValue(value, variableName = "") {
        if(!value || value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim().toLowerCase();

        if(stringValue === "") {
            return null;
        }

        if(variableName === "Waney edge (W)") {
            if(stringValue === "w" || stringValue === "b") {
                return "Yes";
            }

            if(stringValue.includes("ej w") || stringValue === "nej") {
                return "No";
            }

            if(stringValue.includes("nära") ||
               stringValue.includes("near") ||
               stringValue.includes("?") ||
               stringValue === "undefined" ||
               stringValue === "indeterminable" ||
               stringValue.includes("eller") ||
               stringValue.includes("or")) {
                return "Maybe";
            }
        }

        return null;
    }

    /**
     * Fetch variable data from API
     */
    async fetchVariable(variableName, sites, requestId, type = 'categorical') {
        const requestBody = {
            sites: sites,
            requestId: requestId,
            variable: variableName
        };

        try {
            const response = await super.fetchData("/dendro/dynamicchart", JSON.stringify(requestBody));

            if(!response) {
                return { variable: variableName, data: null, error: true, type: type };
            }

            const data = await response.json();

            return { variable: variableName, data: data, error: false, type: type };
        } catch(error) {
            console.warn(`Failed to fetch ${variableName}:`, error);
            return { variable: variableName, data: null, error: true, type: type };
        }
    }

    /**
     * Fetch sample types data
     */
    async fetchSampleTypes(sites, requestId) {
        const requestBody = {
            sites: sites,
            requestId: requestId
        };

        try {
            const response = await super.fetchData("/site/sampletypes", JSON.stringify(requestBody));

            if(!response) {
                return { variable: 'Sample types', data: null, error: true, type: 'categorical' };
            }

            const data = await response.json();

            return { variable: 'Sample types', data: data, error: false, type: 'sampleTypes' };
        } catch(error) {
            console.warn('Failed to fetch Sample types:', error);
            return { variable: 'Sample types', data: null, error: true, type: 'categorical' };
        }
    }

    /**
     * Fetch building types data
     */
    async fetchBuildingTypes(sites, requestId) {
        const requestBody = {
            sites: sites,
            requestId: requestId
        };

        try {
            const response = await super.fetchData("/site/buildingtypes", JSON.stringify(requestBody));

            if(!response) {
                return { variable: 'Building types', data: null, error: true, type: 'categorical' };
            }

            const data = await response.json();

            return { variable: 'Building types', data: data, error: false, type: 'buildingTypes' };
        } catch(error) {
            console.warn('Failed to fetch Building types:', error);
            return { variable: 'Building types', data: null, error: true, type: 'categorical' };
        }
    }

    /**
     * Get color index for consistent coloring across modules
     */
    getColorIndexForVariable(variableName) {
        const colorMap = {
            'Sapwood (Sp)': 0,
            'Pith (P)': 1,
            'Tree rings': 2,
            'Number of analysed radii.': 3,
            'Tree age (mirrored)': 4,
            'Bark (B)': 5,
            'EW/LW measurements': 6,
            'Waney edge (W)': 7,
            'Tree species': 8,
            'Sample types': 9
        };
        return colorMap[variableName] || 0;
    }

    /**
     * Fetch total number of samples for the current sites
     * Returns null if not available
     */
    async fetchTotalSamplesCount() {
        try {
            let resultMosaic = this.sqs.resultManager.getModule("mosaic");
            const requestBody = {
                sites: resultMosaic.sites,
                requestId: ++this.requestId
            };
            const response = await super.fetchData("/site/samplescount", JSON.stringify(requestBody));
            if(!response) {
                return null;
            }
            const data = await response.json();
            return data.count ?? null;
        } catch(error) {
            console.warn('Failed to fetch total sample count:', error);
            return null;
        }
    }

    getAvailableExportFormats() {
        return ["png"];
    }
}

export default DendroBaseModule;
