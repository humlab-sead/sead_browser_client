import { nanoid } from "nanoid";
import MosaicTileModule from "./MosaicTileModule.class";

class MosaicDatedSitesModule extends MosaicTileModule {
  constructor(sqs) {
    super();
    this.sqs = sqs;
    this.title = "Dated sites";
    this.name = "mosaic-dated-sites";
    this.domains = ["general", "palaeo", "archaeobotany", "isotopes"];
    this.requestId = 0;
    this.pendingRequestPromise = null;
    this.active = true;
    this.data = null;
    this.renderIntoNode = null;
    this.plot = null;
    this.renderComplete = false;
    this.chartType = "plotly";
    this.showChartSelector = false;
  }

  /**
   * Ensures we POST an array of numeric site IDs (not objects).
   * Accepts: [5634, ...] or [{site_id:5634}, {id:5634}, ...]
   */
  normalizeSiteIds(input) {
    if (!Array.isArray(input)) return [];

    // If already numbers, keep them
    const allNumbers = input.every(v => typeof v === "number" || (typeof v === "string" && v.trim() !== ""));
    if (allNumbers) {
      return input
        .map(v => (typeof v === "number" ? v : Number(v)))
        .filter(v => Number.isFinite(v));
    }

    // Otherwise assume objects
    return input
      .map(v => {
        if (v && typeof v === "object") {
          const candidate = v.site_id ?? v.siteId ?? v.id ?? v.site ?? null;
          const n = Number(candidate);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      })
      .filter(v => Number.isFinite(v));
  }

  async fetchData(renderIntoNode = null) {
    const resultMosaic = this.sqs.resultManager.getModule("mosaic");

    if (renderIntoNode) {
      this.sqs.setLoadingIndicator(renderIntoNode, true);
    }

    // Ensure we send an array of numeric site ids
    const siteIds = this.normalizeSiteIds(resultMosaic?.sites);
    const requestBody = JSON.stringify(siteIds);

    const response = await super.fetchData("/graphs/datings", requestBody);
    if (!response) {
      if (renderIntoNode) this.sqs.setLoadingIndicator(renderIntoNode, false);
      return false;
    }

    const data = await response.json();

    // Always stop spinner once we have a response
    if (renderIntoNode) {
      this.sqs.setLoadingIndicator(renderIntoNode, false);
    }

    return {
      requestId: ++this.requestId,
      data
    };
  }

  /**
   * Converts backend histogram into Plotly bar series.
   *
   * Backend v2 shape expected:
   *   histogram: [{ bin_start: Number, bin_end: Number, count: Number }, ...]
   *
   * We keep backwards-compatible parsing for older shapes.
   */
  formatDataToPlotlyChartData(data) {
    if (!data || !Array.isArray(data.histogram) || data.histogram.length === 0) {
      console.warn("Fetch for dated sites returned bad value:", data);
      this.sqs.setNoDataMsg(this.renderIntoNode);
      return null;
    }

    const x = [];
    const y = [];
    const hovertemplate = [];
    const customdata = [];

    data.histogram.forEach(item => {
      // Preferred: new backend fields
      if (item.bin_start !== undefined && item.bin_end !== undefined) {
        const start = Number(item.bin_start);
        const end = Number(item.bin_end);
        const label = `${Math.round(start)} – ${Math.round(end)}`;

        x.push(label);
        y.push(item.count !== undefined ? item.count : (item.value || 0));
        hovertemplate.push(`${label}<br>%{y} sites<extra></extra>`);
        customdata.push({ bin_start: start, bin_end: end });
        return;
      }

      // Back-compat: startYear/endYear
      if (item.startYear !== undefined && item.endYear !== undefined) {
        const label = `${item.startYear} – ${item.endYear}`;
        x.push(label);
        y.push(item.count !== undefined ? item.count : (item.datingsNum !== undefined ? item.datingsNum : (item.value || 0)));
        hovertemplate.push(`${label}<br>%{y} sites<extra></extra>`);
        customdata.push({ startYear: item.startYear, endYear: item.endYear });
        return;
      }

      // Back-compat: label
      if (item.label !== undefined) {
        x.push(item.label);
        y.push(item.count !== undefined ? item.count : (item.value || 0));
        hovertemplate.push(`${item.label}<br>%{y} sites<extra></extra>`);
        customdata.push({ label: item.label });
        return;
      }

      // Fallback
      const fallbackLabel = item.name || "";
      x.push(fallbackLabel);
      y.push(item.count !== undefined ? item.count : (item.value || 0));
      hovertemplate.push(`%{x}<br>%{y} sites<extra></extra>`);
      customdata.push({ name: fallbackLabel });
    });

    return [
      {
        x,
        y,
        customdata,
        type: "bar",
        name: "Dated sites (binned by span)",
        hovertemplate,
        marker: {
          color: this.sqs.color.getColorScheme(1)[0]
        }
      }
    ];
  }

  /**
   * Plotly layout tuned for bin labels. Uses only first/last labels as ticks to reduce clutter.
   */
  getPlotlyChartLayoutConfig(data) {
    if (!data || !Array.isArray(data.histogram) || data.histogram.length === 0) return {};

    // Try to build start/end labels from new backend fields; fallback to existing shapes
    const first = data.histogram[0];
    const last = data.histogram[data.histogram.length - 1];

    const firstLabel =
      (first.bin_start !== undefined && first.bin_end !== undefined)
        ? `${Math.round(first.bin_start)} – ${Math.round(first.bin_end)}`
        : (first.startYear !== undefined && first.endYear !== undefined)
          ? `${first.startYear} – ${first.endYear}`
          : (first.label || first.name || "");

    const lastLabel =
      (last.bin_start !== undefined && last.bin_end !== undefined)
        ? `${Math.round(last.bin_start)} – ${Math.round(last.bin_end)}`
        : (last.startYear !== undefined && last.endYear !== undefined)
          ? `${last.startYear} – ${last.endYear}`
          : (last.label || last.name || "");

    // helper to compact large numbers and append unit
    const formatAge = (n) => {
      const num = Number(n);
      if (!Number.isFinite(num)) return String(n);
      const abs = Math.abs(num);
      if (abs >= 1e6) {
        let v = (num / 1e6).toFixed(1).replace(/\.0$/, "");
        return `${v}M BP`;
      }
      if (abs >= 1e3) {
        let v = (num / 1e3).toFixed(1).replace(/\.0$/, "");
        return `${v}k BP`;
      }
      return `${Math.round(num)} BP`;
    };

    const firstTickVal = first.bin_start !== undefined ? Number(first.bin_start) : (first.startYear !== undefined ? Number(first.startYear) : null);
    const lastTickVal = last.bin_end !== undefined ? Number(last.bin_end) : (last.endYear !== undefined ? Number(last.endYear) : null);

    const firstTickText = firstTickVal !== null && Number.isFinite(firstTickVal) ? formatAge(firstTickVal) : firstLabel;
    const lastTickText = lastTickVal !== null && Number.isFinite(lastTickVal) ? formatAge(lastTickVal) : lastLabel;

    return {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      bargap: 0.25,
      xaxis: {
        title: "Age range (BP)",
        tickangle: -45,
        tickvals: [firstLabel, lastLabel],
        ticktext: [firstTickText, lastTickText]
      },
      yaxis: {
        title: "Number of sites"
      },
      margin: {
        l: 70,
        r: 50,
        b: 70,
        t: 50,
        pad: 4
      }
    };
  }

  async render(renderIntoNode = null) {
    super.render();
    this.renderComplete = false;

    if (renderIntoNode) this.renderIntoNode = renderIntoNode;
    if (renderIntoNode == null && this.renderIntoNode == null) {
      console.warn(`Tried to render ${this.name} without a node to render into!`);
      return false;
    }

    this.active = true;

    // Clear previous content
    $(this.renderIntoNode).empty();

    const varId = nanoid();
    const chartContainerId = `chart-container-${varId}`;

    const tileHtml = `
      <div class="dated-sites-tile-container" id="${varId}" style="display:flex;flex-direction:column;height:100%;width:100%;">
        <div class="dated-sites-tile-header" style="flex:0 0 auto;">
          <h3 style="margin:0;font-size:1.1em;">${this.title}</h3>
        </div>
        <div class="dated-sites-tile-chart" id="${chartContainerId}" style="flex:1 1 0;min-height:180px;width:100%;"></div>
      </div>
    `;

    $(this.renderIntoNode).append(tileHtml);

    this.sqs.setLoadingIndicator(`#${chartContainerId}`, true);

    const response = await this.fetchData(`#${chartContainerId}`);
    if (!response) return false;

    this.data = response.data;

    if (!this.active) return false;

    if (!this.data || !Array.isArray(this.data.histogram) || this.data.histogram.length === 0) {
      this.sqs.setNoDataMsg(this.renderIntoNode);
      this.renderComplete = true;
      return;
    }

    const plotData = this.formatDataToPlotlyChartData(this.data);
    if (!plotData) {
      this.renderComplete = true;
      return;
    }

    const layout = this.getPlotlyChartLayoutConfig(this.data);
    const resultMosaic = this.sqs.resultManager.getModule("mosaic");

    this.plot = await resultMosaic.renderHistogramPlotly(`#${chartContainerId}`, plotData, layout);

    this.renderComplete = true;
  }

  async update() {
    this.renderComplete = false;
    this.sqs.setLoadingIndicator(this.renderIntoNode, true, false);

    const response = await this.fetchData();
    if (!response) return;

    this.data = response.data;

    this.sqs.setLoadingIndicator(this.renderIntoNode, false, false);
    this.render(this.renderIntoNode);
    this.renderComplete = true;
  }

  getAvailableExportFormats() {
    return ["json", "csv"];
  }

  formatDataForExport(data, format = "json") {
    if (!data) return data;

    if (format === "csv") {
      const histogram = data.histogram || [];
      let includeColumns = [];

      if (histogram.length > 0) {
        includeColumns = Object.keys(histogram[0]);
      }

      return histogram.map(item => {
        const row = {};
        includeColumns.forEach(col => {
          row[col] = item[col];
        });
        return row;
      });
    }

    return data;
  }
}

export default MosaicDatedSitesModule;
