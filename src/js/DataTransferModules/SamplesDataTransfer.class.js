import DataTransferModule from './DataTransferModule.class.js';
import ExcelJS from 'exceljs';

const SAMPLES_ANALYSIS_SHEET_NAME = "Samples with Analysis Data";
const SAMPLES_ANALYSIS_SCHEMA_SHEET_NAME = "__SamplesAnalysisSchema";

export default class SamplesDataTransfer extends DataTransferModule {
    constructor(sqs) {
        super(sqs);

        window.sqs.sqsEventListen("dataImportFileDropped", (evt, data) => {
            //call import
            this.import(data.file).then(importedData => {
                console.log("Imported data:", importedData);
                window.sqs.sqsEventDispatch("dataImportCompleted", {
                    importedData
                });
            })
            .catch(error => {
                console.error("Error importing data:", error);
                window.sqs.sqsEventDispatch("dataImportFailed", {
                    error: error.message || String(error)
                });
            });
        });
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

    async import(file) {
        const wb = new ExcelJS.Workbook();
        const buffer = await this.readImportFileAsBuffer(file);
        await wb.xlsx.load(buffer);

        const worksheet = wb.getWorksheet(SAMPLES_ANALYSIS_SHEET_NAME);
        if (!worksheet) {
            throw new Error(`Worksheet "${SAMPLES_ANALYSIS_SHEET_NAME}" not found`);
        }

        const columnSchema = this.readImportedColumnSchema(wb, worksheet);
        const importedRows = this.readImportedDataRows(worksheet, columnSchema);
        const sites = this.rebuildSitesFromImportedRows(importedRows, columnSchema);

        if (sites.length === 0) {
            return [];
        }
        return sites.length === 1 ? sites[0] : sites;
    }

    /**
     * Adds worksheet with samples and their analysis data
     * @param {ExcelJS.Workbook} wb - Workbook to add sheet to
     * @param {Array} sites - Array of site data
     * @param {Array} methodIds - Optional array of method IDs to filter by
     */
    addSamplesWithAnalysisSheet(wb, sites, methodIds = []) {
        const worksheet = wb.addWorksheet(SAMPLES_ANALYSIS_SHEET_NAME);

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

        columns.forEach((col, index) => {
            if (this.shouldHideColumn(col)) {
                worksheet.getColumn(index + 1).hidden = true;
            }
        });

        this.addSamplesWithAnalysisSchemaSheet(wb, columns);

        // Auto-fit columns
        worksheet.columns.forEach(column => {
            if (column.hidden) return;
            let maxLength = 10;
            column.eachCell({ includeEmpty: true }, cell => {
                maxLength = Math.max(maxLength, (cell.value ? cell.value.toString().length : 0));
            });
            column.width = Math.min(maxLength + 2, 50); // Cap at 50 for very wide columns
        });
    }

    getSamplesWithAnalysisBaseColumns() {
        return [
            { key: "site_id", title: "Site ID" },
            { key: "site_name", title: "Site name" },
            { key: "coordinates_google_maps", title: "Google Maps Link" },
            { key: "site_latitude", title: "Site Latitude (WGS84)" },
            { key: "site_longitude", title: "Site Longitude (WGS84)" },
            { key: "site_coordinate_system", title: "Site Coordinate System" },
            { key: "sample_group_id", title: "Sample Group ID" },
            { key: "sample_group_name", title: "Sample Group Name" },
            { key: "sample_id", title: "Sample ID" },
            { key: "physical_sample_id", title: "Physical Sample ID" },
            { key: "sample_name", title: "Sample Name" },
            { key: "sample_x", title: "Sample X" },
            { key: "sample_y", title: "Sample Y" },
            { key: "sample_z", title: "Sample Z" },
            { key: "sample_xy_coordinate_system", title: "Sample X/Y Coordinate System" },
            { key: "sample_z_coordinate_system", title: "Sample Z Coordinate System" },
            { key: "sample_type_id", title: "Sample Type ID" },
            { key: "sample_type", title: "Sample Type" },
            { key: "sampling_method_id", title: "Sampling Method ID" },
            { key: "sampling_method", title: "Sampling Method" },
            { key: "sample_date", title: "Sample Date" },
            { key: "analysis_method_id", title: "Analysis Method ID" },
            { key: "analysis_method_name", title: "Analysis Method" },
            { key: "dataset_id", title: "Dataset ID" },
            { key: "dataset_name", title: "Dataset Name" }
        ];
    }

    addSamplesWithAnalysisSchemaSheet(wb, columns) {
        const existing = wb.getWorksheet(SAMPLES_ANALYSIS_SCHEMA_SHEET_NAME);
        if (existing) {
            wb.removeWorksheet(existing.id);
        }

        const schemaSheet = wb.addWorksheet(SAMPLES_ANALYSIS_SCHEMA_SHEET_NAME);
        schemaSheet.state = 'veryHidden';
        schemaSheet.addRow([
            "column_index",
            "key",
            "title",
            "method_id",
            "analysis_key",
            "hidden"
        ]);

        columns.forEach((column, index) => {
            schemaSheet.addRow([
                index + 1,
                column.key || "",
                column.title || "",
                column.methodId ?? "",
                column.analysisKey || "",
                this.shouldHideColumn(column) ? 1 : 0
            ]);
        });
    }

    async readImportFileAsBuffer(file) {
        if (file instanceof ArrayBuffer) return file;
        if (ArrayBuffer.isView(file)) {
            return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        }
        if (file && typeof file.arrayBuffer === 'function') {
            return await file.arrayBuffer();
        }
        throw new Error("Unsupported input for import; expected File, Blob, ArrayBuffer, or TypedArray");
    }

    readImportedColumnSchema(wb, worksheet) {
        const schemaSheet = wb.getWorksheet(SAMPLES_ANALYSIS_SCHEMA_SHEET_NAME);
        if (schemaSheet) {
            const schema = [];
            for (let rowNumber = 2; rowNumber <= schemaSheet.rowCount; rowNumber++) {
                const row = schemaSheet.getRow(rowNumber);
                const columnIndex = this.parseMaybeNumber(this.normalizeImportedCellValue(row.getCell(1).value));
                const key = this.normalizeImportedCellValue(row.getCell(2).value);
                const title = this.normalizeImportedCellValue(row.getCell(3).value);
                const methodIdRaw = this.normalizeImportedCellValue(row.getCell(4).value);
                const analysisKey = this.normalizeImportedCellValue(row.getCell(5).value);
                const hiddenRaw = this.normalizeImportedCellValue(row.getCell(6).value);

                if (!columnIndex || !key) continue;

                schema.push({
                    columnIndex,
                    key,
                    title,
                    methodId: this.parseMaybeNumber(methodIdRaw),
                    analysisKey,
                    hidden: hiddenRaw === 1 || hiddenRaw === "1" || hiddenRaw === true || hiddenRaw === "true"
                });
            }

            if (schema.length > 0) {
                return schema;
            }
        }

        return this.buildFallbackImportedColumnSchema(worksheet);
    }

    buildFallbackImportedColumnSchema(worksheet) {
        const headerRow = worksheet.getRow(1);
        const baseColumns = this.getSamplesWithAnalysisBaseColumns();
        const baseTitleToKey = new Map(
            baseColumns.map(col => [this.normalizeImportedColumnTitle(col.title), col.key])
        );

        const schema = [];
        for (let columnIndex = 1; columnIndex <= worksheet.columnCount; columnIndex++) {
            const rawTitle = this.normalizeImportedCellValue(headerRow.getCell(columnIndex).value);
            const title = this.normalizeImportedColumnTitle(rawTitle);
            if (!title) continue;

            const knownKey = baseTitleToKey.get(title);
            if (knownKey) {
                schema.push({
                    columnIndex,
                    key: knownKey,
                    title: rawTitle,
                    hidden: worksheet.getColumn(columnIndex).hidden === true
                });
                continue;
            }

            const analysisColumn = this.parseAnalysisColumnFromTitle(rawTitle);
            if (analysisColumn) {
                schema.push({
                    columnIndex,
                    key: analysisColumn.key,
                    title: rawTitle,
                    methodId: analysisColumn.methodId,
                    methodName: analysisColumn.methodName,
                    analysisKey: analysisColumn.analysisKey,
                    hidden: worksheet.getColumn(columnIndex).hidden === true
                });
                continue;
            }

            schema.push({
                columnIndex,
                key: this.toSnakeCase(rawTitle),
                title: rawTitle,
                hidden: worksheet.getColumn(columnIndex).hidden === true
            });
        }

        return schema;
    }

    parseAnalysisColumnFromTitle(title) {
        if (typeof title !== 'string') return null;
        const separatorIndex = title.indexOf(':');
        if (separatorIndex < 1) return null;

        const methodLabel = title.slice(0, separatorIndex).trim();
        const analysisTitle = title.slice(separatorIndex + 1).trim();
        if (!methodLabel || !analysisTitle) return null;

        let methodId = null;
        let methodName = methodLabel;
        const methodIdMatch = methodLabel.match(/\[id:\s*(-?\d+)\]\s*$/i);
        if (methodIdMatch) {
            methodId = Number(methodIdMatch[1]);
            methodName = methodLabel.replace(/\[id:\s*-?\d+\]\s*$/i, '').trim();
        }

        const analysisKey = this.toSnakeCase(analysisTitle);
        const methodToken = methodId !== null ? methodId : this.toSnakeCase(methodName);
        return {
            methodId,
            methodName,
            analysisKey,
            key: `analysis_${methodToken}_${analysisKey}`
        };
    }

    readImportedDataRows(worksheet, columnSchema) {
        const rows = [];

        for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
            const row = worksheet.getRow(rowNumber);
            const valuesByColumn = new Map();
            let hasValues = false;

            columnSchema.forEach(column => {
                const cellValue = this.normalizeImportedCellValue(row.getCell(column.columnIndex).value);
                if (!this.isBlankValue(cellValue)) {
                    hasValues = true;
                }
                valuesByColumn.set(column.columnIndex, cellValue);
            });

            if (!hasValues) continue;
            rows.push({ rowNumber, valuesByColumn });
        }

        return rows;
    }

    normalizeImportedColumnTitle(value) {
        if (typeof value !== 'string') return '';
        return value.trim().toLowerCase().replace(/\s+/g, ' ');
    }

    normalizeImportedCellValue(value) {
        if (value === null || value === undefined) return "";
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'object') {
            if (Array.isArray(value.richText)) {
                return value.richText.map(part => part.text || '').join('');
            }
            if (value.text !== undefined && value.text !== null) {
                return value.text;
            }
            if (value.result !== undefined && value.result !== null) {
                return value.result;
            }
            if (value.hyperlink) {
                return value.text || value.hyperlink;
            }
            if (value.formula && value.result !== undefined && value.result !== null) {
                return value.result;
            }
            return JSON.stringify(value);
        }
        if (typeof value === 'string') {
            return value.trim();
        }
        return value;
    }

    toSnakeCase(value) {
        if (typeof value !== 'string') return '';
        return value
            .trim()
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .toLowerCase();
    }

    coerceImportedScalar(value) {
        if (value === null || value === undefined) return "";
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (typeof value !== 'string') return value;

        const trimmed = value.trim();
        if (trimmed === '') return '';
        if (/^(true|false)$/i.test(trimmed)) {
            return trimmed.toLowerCase() === 'true';
        }
        if (/^-?\d+$/.test(trimmed)) {
            return Number(trimmed);
        }
        if (/^-?\d+\.\d+$/.test(trimmed)) {
            return Number(trimmed);
        }
        return trimmed;
    }

    splitImportedList(value) {
        if (value === null || value === undefined || value === '') return [];
        if (Array.isArray(value)) return value.map(v => this.coerceImportedScalar(v));
        if (typeof value === 'number' || typeof value === 'boolean') return [value];
        if (typeof value !== 'string') return [value];

        return value
            .split(';')
            .map(part => this.coerceImportedScalar(part))
            .filter(part => part !== '');
    }

    readColumnValueByKey(importedRow, keyToColumnMap, key) {
        const columnIndex = keyToColumnMap.get(key);
        if (!columnIndex) return "";
        return importedRow.valuesByColumn.get(columnIndex);
    }

    rebuildSitesFromImportedRows(importedRows, columnSchema) {
        const siteStates = new Map();
        const keyToColumnMap = new Map();

        columnSchema.forEach(column => {
            if (column.key && !keyToColumnMap.has(column.key)) {
                keyToColumnMap.set(column.key, column.columnIndex);
            }
        });

        const analysisGroups = new Map();
        columnSchema.forEach(column => {
            const parsed = this.parseAnalysisColumnInfo(column);
            if (!parsed) return;

            const methodKey = parsed.methodId !== null && parsed.methodId !== undefined
                ? `id:${parsed.methodId}`
                : `name:${parsed.methodName || parsed.methodToken || 'unknown'}`;

            if (!analysisGroups.has(methodKey)) {
                analysisGroups.set(methodKey, {
                    methodId: parsed.methodId,
                    methodName: parsed.methodName || null,
                    methodToken: parsed.methodToken || null,
                    columns: []
                });
            }

            analysisGroups.get(methodKey).columns.push({
                ...column,
                analysisKey: parsed.analysisKey
            });
        });

        importedRows.forEach(importedRow => {
            const rawSiteId = this.readColumnValueByKey(importedRow, keyToColumnMap, 'site_id');
            const siteId = this.isBlankValue(rawSiteId)
                ? `imported_site_${importedRow.rowNumber}`
                : this.coerceImportedScalar(rawSiteId);
            const siteState = this.ensureImportedSiteState(siteStates, siteId);

            this.setIfEmpty(siteState.site, 'site_name', this.readColumnValueByKey(importedRow, keyToColumnMap, 'site_name'));
            this.setIfEmpty(siteState.site, 'latitude_dd', this.readColumnValueByKey(importedRow, keyToColumnMap, 'site_latitude'));
            this.setIfEmpty(siteState.site, 'longitude_dd', this.readColumnValueByKey(importedRow, keyToColumnMap, 'site_longitude'));

            const rawSampleGroupId = this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_group_id');
            const sampleGroupId = this.isBlankValue(rawSampleGroupId)
                ? `imported_group_${importedRow.rowNumber}`
                : this.coerceImportedScalar(rawSampleGroupId);
            const sampleGroupState = this.ensureImportedSampleGroupState(siteState, sampleGroupId);

            this.setIfEmpty(sampleGroupState.sampleGroup, 'sample_group_name', this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_group_name'));
            this.setIfEmpty(sampleGroupState.sampleGroup, 'date_sampled', this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_date'));

            const sampleTypeIdRaw = this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_type_id');
            const sampleTypeName = this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_type');
            const sampleTypeId = this.ensureLookupSampleType(siteState, sampleTypeIdRaw, sampleTypeName);
            if (sampleTypeId !== null && sampleTypeId !== undefined && this.isBlankValue(sampleGroupState.sampleGroup.sample_type_id)) {
                sampleGroupState.sampleGroup.sample_type_id = sampleTypeId;
            }

            const samplingMethodIdRaw = this.readColumnValueByKey(importedRow, keyToColumnMap, 'sampling_method_id');
            const samplingMethodName = this.readColumnValueByKey(importedRow, keyToColumnMap, 'sampling_method');
            const samplingMethodId = this.ensureLookupMethod(siteState, samplingMethodIdRaw, samplingMethodName);
            if (samplingMethodId !== null && samplingMethodId !== undefined && this.isBlankValue(sampleGroupState.sampleGroup.sampling_method_id)) {
                sampleGroupState.sampleGroup.sampling_method_id = samplingMethodId;
            }

            const rawPhysicalSampleId = this.readColumnValueByKey(importedRow, keyToColumnMap, 'physical_sample_id');
            const rawSampleId = this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_id');
            const physicalSampleId = !this.isBlankValue(rawPhysicalSampleId)
                ? this.coerceImportedScalar(rawPhysicalSampleId)
                : (!this.isBlankValue(rawSampleId)
                    ? this.coerceImportedScalar(rawSampleId)
                    : `imported_sample_${importedRow.rowNumber}`);

            const physicalSample = this.ensureImportedPhysicalSample(sampleGroupState, physicalSampleId);
            this.setIfEmpty(physicalSample, 'sample_name', this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_name'));
            this.setIfEmpty(physicalSample, 'date_sampled', this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_date'));

            const sampleX = this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_x');
            const sampleY = this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_y');
            const sampleZ = this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_z');
            const xySystems = this.splitImportedList(this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_xy_coordinate_system'))
                .map(value => String(value).trim())
                .filter(value => value !== '');
            const zSystems = this.splitImportedList(this.readColumnValueByKey(importedRow, keyToColumnMap, 'sample_z_coordinate_system'))
                .map(value => String(value).trim())
                .filter(value => value !== '');

            const coordinates = [];
            const xDimensionId = this.ensureLookupDimension(siteState, 'x/north', -9001);
            const yDimensionId = this.ensureLookupDimension(siteState, 'y/east', -9002);
            const zDimensionId = this.ensureLookupDimension(siteState, 'z', -9003);
            const xyMethodId = xySystems.length > 0 ? this.ensureLookupMethod(siteState, null, xySystems[0]) : null;
            const zMethodId = zSystems.length > 0 ? this.ensureLookupMethod(siteState, null, zSystems[0]) : null;

            if (!this.isBlankValue(sampleX)) {
                coordinates.push({
                    measurement: this.coerceImportedScalar(sampleX),
                    dimension_id: xDimensionId,
                    coordinate_method_id: xyMethodId ?? null
                });
            }
            if (!this.isBlankValue(sampleY)) {
                coordinates.push({
                    measurement: this.coerceImportedScalar(sampleY),
                    dimension_id: yDimensionId,
                    coordinate_method_id: xyMethodId ?? null
                });
            }
            if (!this.isBlankValue(sampleZ)) {
                coordinates.push({
                    measurement: this.coerceImportedScalar(sampleZ),
                    dimension_id: zDimensionId,
                    coordinate_method_id: zMethodId ?? null
                });
            }
            if (coordinates.length > 0 && (!Array.isArray(physicalSample.coordinates) || physicalSample.coordinates.length === 0)) {
                physicalSample.coordinates = coordinates;
            }

            const analysisMethodIds = this.splitImportedList(this.readColumnValueByKey(importedRow, keyToColumnMap, 'analysis_method_id'));
            const analysisMethodNames = this.splitImportedList(this.readColumnValueByKey(importedRow, keyToColumnMap, 'analysis_method_name'));
            const maxMethodLength = Math.max(analysisMethodIds.length, analysisMethodNames.length);
            for (let i = 0; i < maxMethodLength; i++) {
                this.ensureLookupMethod(siteState, analysisMethodIds[i], analysisMethodNames[i]);
            }

            const baseDatasetIds = this.splitImportedList(this.readColumnValueByKey(importedRow, keyToColumnMap, 'dataset_id'));
            const baseDatasetNames = this.splitImportedList(this.readColumnValueByKey(importedRow, keyToColumnMap, 'dataset_name'));

            analysisGroups.forEach(group => {
                const hasMethodValues = group.columns.some(column => {
                    const value = importedRow.valuesByColumn.get(column.columnIndex);
                    return !this.isBlankValue(value);
                });
                if (!hasMethodValues) return;

                const methodId = this.ensureLookupMethod(siteState, group.methodId, group.methodName);
                const entries = this.buildImportedMethodEntries(importedRow, group.columns);
                if (entries.length === 0) return;

                entries.forEach((entry, index) => {
                    if (this.isBlankValue(entry.physical_sample_id)) {
                        entry.physical_sample_id = physicalSample.physical_sample_id;
                    }
                    if (this.isBlankValue(entry.method_id) && methodId !== null && methodId !== undefined) {
                        entry.method_id = methodId;
                    }

                    const fallbackDatasetId = baseDatasetIds[index] ?? baseDatasetIds[0] ?? null;
                    const fallbackDatasetName = baseDatasetNames[index] ?? baseDatasetNames[0] ?? "";
                    const dataset = this.ensureImportedDataset(
                        siteState,
                        entry.dataset_id ?? fallbackDatasetId,
                        entry.method_id ?? methodId,
                        entry.dataset_name ?? fallbackDatasetName
                    );

                    entry.dataset_id = dataset.dataset_id;
                    entry.method_id = dataset.method_id;
                    dataset.analysis_entities.push(entry);
                });
            });
        });

        return Array.from(siteStates.values()).map(state => state.site);
    }

    ensureImportedSiteState(siteStates, siteId) {
        if (siteStates.has(siteId)) {
            return siteStates.get(siteId);
        }

        const site = {
            site_id: siteId,
            site_name: "",
            latitude_dd: "",
            longitude_dd: "",
            sample_groups: [],
            datasets: [],
            lookup_tables: {
                methods: [],
                sample_types: [],
                dimensions: []
            }
        };

        const state = {
            site,
            sampleGroups: new Map(),
            datasets: new Map(),
            methodsById: new Map(),
            methodsByName: new Map(),
            sampleTypesById: new Map(),
            sampleTypesByName: new Map(),
            dimensionsByName: new Map(),
            nextGeneratedMethodId: -1,
            nextGeneratedSampleTypeId: -1,
            nextGeneratedDatasetId: -1,
            nextGeneratedDimensionId: -1000
        };

        siteStates.set(siteId, state);
        return state;
    }

    ensureImportedSampleGroupState(siteState, sampleGroupId) {
        if (siteState.sampleGroups.has(sampleGroupId)) {
            return siteState.sampleGroups.get(sampleGroupId);
        }

        const sampleGroup = {
            sample_group_id: sampleGroupId,
            sample_group_name: "",
            sample_type_id: null,
            sampling_method_id: null,
            physical_samples: []
        };

        const sampleGroupState = {
            sampleGroup,
            physicalSamples: new Map()
        };

        siteState.sampleGroups.set(sampleGroupId, sampleGroupState);
        siteState.site.sample_groups.push(sampleGroup);
        return sampleGroupState;
    }

    ensureImportedPhysicalSample(sampleGroupState, physicalSampleId) {
        if (sampleGroupState.physicalSamples.has(physicalSampleId)) {
            return sampleGroupState.physicalSamples.get(physicalSampleId);
        }

        const physicalSample = {
            physical_sample_id: physicalSampleId,
            sample_name: ""
        };

        sampleGroupState.physicalSamples.set(physicalSampleId, physicalSample);
        sampleGroupState.sampleGroup.physical_samples.push(physicalSample);
        return physicalSample;
    }

    ensureImportedDataset(siteState, datasetIdRaw, methodIdRaw, datasetNameRaw) {
        const methodId = this.coerceImportedScalar(methodIdRaw);
        let datasetId = this.coerceImportedScalar(datasetIdRaw);
        const datasetName = this.normalizeImportedText(datasetNameRaw);

        let datasetKey = datasetId;
        if (this.isBlankValue(datasetKey)) {
            datasetKey = `method_${methodId}`;
        }

        if (!siteState.datasets.has(datasetKey)) {
            if (this.isBlankValue(datasetId)) {
                datasetId = siteState.nextGeneratedDatasetId--;
            }

            const dataset = {
                dataset_id: datasetId,
                dataset_name: datasetName || "",
                method_id: this.isBlankValue(methodId) ? null : methodId,
                analysis_entities: []
            };

            siteState.datasets.set(datasetKey, dataset);
            siteState.site.datasets.push(dataset);
            return dataset;
        }

        const dataset = siteState.datasets.get(datasetKey);
        if (this.isBlankValue(dataset.dataset_name) && !this.isBlankValue(datasetName)) {
            dataset.dataset_name = datasetName;
        }
        if (this.isBlankValue(dataset.method_id) && !this.isBlankValue(methodId)) {
            dataset.method_id = methodId;
        }
        return dataset;
    }

    ensureLookupMethod(siteState, methodIdRaw, methodNameRaw) {
        const parsedMethodId = this.parseMaybeNumber(this.coerceImportedScalar(methodIdRaw));
        const methodName = this.normalizeImportedText(methodNameRaw);
        const normalizedName = typeof methodName === 'string' && methodName !== '' ? methodName.toLowerCase() : null;

        if (parsedMethodId !== null && parsedMethodId !== undefined && parsedMethodId !== '') {
            if (siteState.methodsById.has(parsedMethodId)) {
                const existing = siteState.methodsById.get(parsedMethodId);
                if (normalizedName && this.isBlankValue(existing.method_name)) {
                    existing.method_name = methodName;
                    siteState.methodsByName.set(normalizedName, parsedMethodId);
                }
                return parsedMethodId;
            }

            const method = {
                method_id: parsedMethodId,
                method_name: this.isBlankValue(methodName) ? `Method ${parsedMethodId}` : methodName
            };
            siteState.methodsById.set(parsedMethodId, method);
            if (normalizedName) {
                siteState.methodsByName.set(normalizedName, parsedMethodId);
            }
            siteState.site.lookup_tables.methods.push(method);
            return parsedMethodId;
        }

        if (!normalizedName) return null;
        if (siteState.methodsByName.has(normalizedName)) {
            return siteState.methodsByName.get(normalizedName);
        }

        const generatedMethodId = siteState.nextGeneratedMethodId--;
        const method = {
            method_id: generatedMethodId,
            method_name: methodName
        };
        siteState.methodsById.set(generatedMethodId, method);
        siteState.methodsByName.set(normalizedName, generatedMethodId);
        siteState.site.lookup_tables.methods.push(method);
        return generatedMethodId;
    }

    ensureLookupSampleType(siteState, sampleTypeIdRaw, sampleTypeNameRaw) {
        const parsedSampleTypeId = this.parseMaybeNumber(this.coerceImportedScalar(sampleTypeIdRaw));
        const sampleTypeName = this.normalizeImportedText(sampleTypeNameRaw);
        const normalizedName = typeof sampleTypeName === 'string' && sampleTypeName !== '' ? sampleTypeName.toLowerCase() : null;

        if (parsedSampleTypeId !== null && parsedSampleTypeId !== undefined && parsedSampleTypeId !== '') {
            if (siteState.sampleTypesById.has(parsedSampleTypeId)) {
                const existing = siteState.sampleTypesById.get(parsedSampleTypeId);
                if (normalizedName && this.isBlankValue(existing.type_name)) {
                    existing.type_name = sampleTypeName;
                    siteState.sampleTypesByName.set(normalizedName, parsedSampleTypeId);
                }
                return parsedSampleTypeId;
            }

            const sampleType = {
                type_id: parsedSampleTypeId,
                type_name: this.isBlankValue(sampleTypeName) ? `Sample type ${parsedSampleTypeId}` : sampleTypeName
            };
            siteState.sampleTypesById.set(parsedSampleTypeId, sampleType);
            if (normalizedName) {
                siteState.sampleTypesByName.set(normalizedName, parsedSampleTypeId);
            }
            siteState.site.lookup_tables.sample_types.push(sampleType);
            return parsedSampleTypeId;
        }

        if (!normalizedName) return null;
        if (siteState.sampleTypesByName.has(normalizedName)) {
            return siteState.sampleTypesByName.get(normalizedName);
        }

        const generatedSampleTypeId = siteState.nextGeneratedSampleTypeId--;
        const sampleType = {
            type_id: generatedSampleTypeId,
            type_name: sampleTypeName
        };
        siteState.sampleTypesById.set(generatedSampleTypeId, sampleType);
        siteState.sampleTypesByName.set(normalizedName, generatedSampleTypeId);
        siteState.site.lookup_tables.sample_types.push(sampleType);
        return generatedSampleTypeId;
    }

    ensureLookupDimension(siteState, dimensionNameRaw, preferredId = null) {
        const dimensionName = this.normalizeImportedText(dimensionNameRaw);
        if (this.isBlankValue(dimensionName)) return null;

        const normalizedName = String(dimensionName).trim().toLowerCase();
        if (siteState.dimensionsByName.has(normalizedName)) {
            return siteState.dimensionsByName.get(normalizedName);
        }

        let dimensionId = preferredId;
        if (dimensionId === null || dimensionId === undefined || siteState.site.lookup_tables.dimensions.some(d => d.dimension_id === dimensionId)) {
            dimensionId = siteState.nextGeneratedDimensionId--;
        }

        const dimension = {
            dimension_id: dimensionId,
            dimension_name: dimensionName
        };

        siteState.dimensionsByName.set(normalizedName, dimensionId);
        siteState.site.lookup_tables.dimensions.push(dimension);
        return dimensionId;
    }

    setIfEmpty(target, key, value) {
        if (!target || !key) return;
        if (!this.isBlankValue(target[key])) return;
        if (this.isBlankValue(value)) return;
        target[key] = typeof value === 'string' ? value.trim() : value;
    }

    normalizeImportedText(value) {
        if (value === null || value === undefined) return "";
        if (typeof value === 'string') return value.trim();
        return String(value);
    }

    isBlankValue(value) {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim() === '';
        return false;
    }

    buildImportedMethodEntries(importedRow, methodColumns) {
        const valuesByAnalysisKey = new Map();
        methodColumns.forEach(column => {
            if (!column.analysisKey) return;
            const rawValue = importedRow.valuesByColumn.get(column.columnIndex);
            if (this.isBlankValue(rawValue)) return;
            valuesByAnalysisKey.set(column.analysisKey, this.splitImportedList(rawValue));
        });

        if (valuesByAnalysisKey.size === 0) return [];

        const entryCount = Math.max(
            1,
            ...Array.from(valuesByAnalysisKey.values()).map(values => values.length || 0)
        );

        const entries = [];
        for (let index = 0; index < entryCount; index++) {
            const entry = {};
            valuesByAnalysisKey.forEach((values, analysisKey) => {
                const value = values.length === 1
                    ? values[0]
                    : (values[index] !== undefined ? values[index] : '');
                if (!this.isBlankValue(value)) {
                    entry[analysisKey] = this.coerceImportedScalar(value);
                }
            });
            if (Object.keys(entry).length > 0) {
                entries.push(entry);
            }
        }
        return entries;
    }

    parseAnalysisColumnInfo(column) {
        if (!column || !column.key) return null;
        if (!column.key.startsWith('analysis_')) return null;

        if (column.analysisKey && (column.methodId !== undefined || column.methodName)) {
            return {
                methodId: this.parseMaybeNumber(column.methodId),
                methodName: column.methodName || null,
                methodToken: column.methodId ?? column.methodName ?? null,
                analysisKey: column.analysisKey
            };
        }

        const match = column.key.match(/^analysis_([^_]+)_(.+)$/);
        if (!match) return null;

        const methodToken = match[1];
        return {
            methodId: this.parseMaybeNumber(methodToken),
            methodName: column.methodName || null,
            methodToken,
            analysisKey: column.analysisKey || match[2]
        };
    }

    parseMaybeNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return Number.isNaN(value) ? null : value;
        if (typeof value !== 'string') return value;

        const trimmed = value.trim();
        if (trimmed === '') return null;
        if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
        if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed);
        return trimmed;
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
        const baseColumns = this.getSamplesWithAnalysisBaseColumns();

        baseColumns.forEach(col => {
            columns.push(col);
            columnKeys.push(col.key);
        });

        // Collect all analysis data columns from datasets
        // Map structure: methodId -> Set of column names
        const methodColumnsMap = new Map();
        
        const addIdKeysFromItem = (item, columnSet) => {
            if (!item || typeof item !== 'object') return;
            Object.keys(item).forEach(key => {
                if (/_id$/.test(key)) {
                    columnSet.add(key);
                }
            });
        };

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
                                // Skip internal/complex fields
                                if (!['abundances', 'dating_values', 'measured_values', 'date_updated', 'prepMethods'].includes(key)) {
                                    columnSet.add(key);
                                }
                            });
                            columnSet.add('method_id');
                            columnSet.add('dataset_id');
                            columnSet.add('analysis_entity_id');
                            columnSet.add('physical_sample_id');

                            // Add prepMethods as a column
                            if (entity.prepMethods) {
                                columnSet.add('prep_methods');
                            }

                            // Handle special nested structures
                            if (entity.abundances && Array.isArray(entity.abundances)) {
                                columnSet.add('taxon');
                                columnSet.add('abundance');
                                columnSet.add('abundance_element');
                                entity.abundances.forEach(abundance => addIdKeysFromItem(abundance, columnSet));
                            }
                            if (entity.measured_values && Array.isArray(entity.measured_values)) {
                                columnSet.add('measured_value');
                                entity.measured_values.forEach(measured => addIdKeysFromItem(measured, columnSet));
                            }
                            if (entity.dating_values && Array.isArray(entity.dating_values)) {
                                columnSet.add('dating_value');
                                columnSet.add('dating_uncertainty');
                                columnSet.add('dating_method');
                                entity.dating_values.forEach(dating => addIdKeysFromItem(dating, columnSet));
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
                            ...this.collectIdFields(abundance),
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
                            ...this.collectIdFields(measured),
                            measured_value: measured.measured_value
                        });
                    });
                } else if (entity.dating_values && Array.isArray(entity.dating_values)) {
                    // Create entries for each dating value
                    entity.dating_values.forEach(dating => {
                        methodMap.get(methodId).push({
                            ...enrichedEntity,
                            ...this.collectIdFields(dating),
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
                case "physical_sample_id":
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
                case "sample_type_id":
                    value = sampleGroup.sample_type_id;
                    break;
                case "sampling_method":
                    value = samplingMethod;
                    break;
                case "sampling_method_id":
                    value = sampleGroup.sampling_method_id;
                    break;
                case "sample_date":
                    value = physicalSample.date_sampled || sampleGroup.date_sampled;
                    break;
                case "analysis_method_id":
                    if (analysisDataByMethod && analysisDataByMethod.size > 0) {
                        const methodIds = Array.from(analysisDataByMethod.keys());
                        value = methodIds.join('; ');
                    }
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
                case "dataset_id":
                    // Collect all dataset IDs for this sample
                    if (analysisDataByMethod && analysisDataByMethod.size > 0) {
                        const datasetIds = new Set();
                        analysisDataByMethod.forEach(dataList => {
                            dataList.forEach(data => {
                                if (data.dataset_id !== undefined && data.dataset_id !== null) {
                                    datasetIds.add(data.dataset_id);
                                }
                            });
                        });
                        value = Array.from(datasetIds).join('; ');
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

    collectIdFields(item) {
        if (!item || typeof item !== 'object') return {};
        return Object.keys(item).reduce((acc, key) => {
            if (/_id$/.test(key)) {
                acc[key] = item[key];
            }
            return acc;
        }, {});
    }

    shouldHideColumn(column) {
        if (!column) return false;
        if (column.hidden) return true;
        if (!column.key) return false;
        return /_id$/.test(column.key);
    }
}
