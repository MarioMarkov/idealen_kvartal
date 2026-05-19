const PROFILES_URL = "/api/profiles";

const METRIC_LABELS = {
  rentPrice: {
    title: "Наем",
    short: "наем",
    unit: "€/м²",
    legend: ["Нисък наем", "Висок наем"],
    higherIsBetter: false,
  },
  airQuality: {
    title: "Качество на въздуха",
    short: "ФПЧ10",
    unit: "µg/m³",
    legend: ["Чист въздух", "Замърсен въздух"],
    higherIsBetter: false,
  },
};

const state = {
  features: [],
  byId: new Map(),
  ranges: {},
  datasets: [],
  selectedId: null,
  mapMetric: "rentPrice",
};

const els = {
  profilePanel: document.querySelector("#profilePanel"),
  datasetStatus: document.querySelector("#datasetStatus"),
  loadingStatus: document.querySelector("#loadingStatus"),
  districtSearch: document.querySelector("#districtSearch"),
  topOpportunities: document.querySelector("#topOpportunities"),
  mapMetricSelect: document.querySelector("#mapMetricSelect"),
  legendLeft: document.querySelector("#legendLeft"),
  legendRight: document.querySelector("#legendRight"),
  toggleMetro: document.querySelector("#toggleMetro"),
  toggleStops: document.querySelector("#toggleStops"),
  metroCount: document.querySelector("#metroCount"),
  stopsCount: document.querySelector("#stopsCount"),
};

const MAP_SOURCE_ID = "planning-units";
const MAP_FILL_LAYER_ID = "planning-units-fill";
const MAP_LINE_LAYER_ID = "planning-units-line";

const METRO_SOURCE_ID = "transit-metro";
const METRO_LAYER_ID = "transit-metro-circle";
const STOPS_SOURCE_ID = "transit-stops";
const STOPS_LAYER_ID = "transit-stops-circle";

const map = new maplibregl.Map({
  container: "map",
  center: [23.3219, 42.6977],
  zoom: 11,
  minZoom: 9,
  maxZoom: 18,
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  },
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
const mapReady = new Promise((resolve) => map.on("load", resolve));

init();

async function init() {
  wireControls();
  renderDatasetStatus();

  let payload;
  try {
    const response = await fetch(PROFILES_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    payload = await response.json();
  } catch (error) {
    els.loadingStatus.textContent = `Грешка при зареждане: ${error.message}`;
    return;
  }

  state.features = payload.features || [];
  state.ranges = payload.ranges || {};
  state.datasets = payload.datasets || [];
  state.byId = new Map(state.features.map((feature) => [feature.properties.id, feature]));

  renderDatasetStatus();
  updateLegendLabels();
  await mapReady;
  drawBoundaries();
  renderTopOpportunities();
  els.loadingStatus.classList.add("hidden");

  loadTransitLayers();
}

async function loadTransitLayers() {
  const [metroResult, stopsResult] = await Promise.allSettled([
    fetch("/api/transit/metro").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    fetch("/api/transit/stops").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  ]);

  if (metroResult.status === "fulfilled") {
    addMetroLayer(metroResult.value);
  } else {
    els.metroCount.textContent = "недостъпно";
  }

  if (stopsResult.status === "fulfilled") {
    addStopsLayer(stopsResult.value);
  } else {
    els.stopsCount.textContent = "недостъпно";
  }
}

function addMetroLayer(geojson) {
  const count = geojson.features?.length ?? 0;
  els.metroCount.textContent = `${count} станции`;

  map.addSource(METRO_SOURCE_ID, { type: "geojson", data: geojson });

  map.addLayer({
    id: METRO_LAYER_ID,
    type: "circle",
    source: METRO_SOURCE_ID,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7, 16, 10],
      "circle-color": "#c1272d",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.95,
    },
  });

  map.on("click", METRO_LAYER_ID, (event) => {
    const f = event.features?.[0];
    if (!f) return;
    new maplibregl.Popup({ closeButton: true })
      .setLngLat(f.geometry.coordinates)
      .setHTML(`<strong>М · ${escapeHtml(f.properties.name)}</strong><br><small>Код ${escapeHtml(f.properties.code)}</small>`)
      .addTo(map);
  });
  map.on("mouseenter", METRO_LAYER_ID, () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", METRO_LAYER_ID, () => { map.getCanvas().style.cursor = ""; });

  els.toggleMetro.addEventListener("change", () => {
    const v = els.toggleMetro.checked ? "visible" : "none";
    map.setLayoutProperty(METRO_LAYER_ID, "visibility", v);
  });
}

function addStopsLayer(geojson) {
  const count = geojson.features?.length ?? 0;
  els.stopsCount.textContent = `${count} спирки`;

  map.addSource(STOPS_SOURCE_ID, { type: "geojson", data: geojson });

  // Insert below metro so metro dots stay on top.
  const beforeId = map.getLayer(METRO_LAYER_ID) ? METRO_LAYER_ID : undefined;
  map.addLayer({
    id: STOPS_LAYER_ID,
    type: "circle",
    source: STOPS_SOURCE_ID,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 1.5, 14, 3.5, 16, 6],
      "circle-color": "#256b8f",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 1,
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0.45, 14, 0.9],
    },
  }, beforeId);

  map.on("click", STOPS_LAYER_ID, (event) => {
    const f = event.features?.[0];
    if (!f) return;
    let lines = f.properties.lines;
    if (typeof lines === "string") {
      try { lines = JSON.parse(lines); } catch { lines = []; }
    }
    const linesText = Array.isArray(lines) && lines.length ? lines.join(", ") : "—";
    new maplibregl.Popup({ closeButton: true })
      .setLngLat(f.geometry.coordinates)
      .setHTML(`<strong>${escapeHtml(f.properties.name || "Спирка")}</strong><br><small>Код ${escapeHtml(f.properties.code)} · Линии: ${escapeHtml(linesText)}</small>`)
      .addTo(map);
  });
  map.on("mouseenter", STOPS_LAYER_ID, () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", STOPS_LAYER_ID, () => { map.getCanvas().style.cursor = ""; });

  els.toggleStops.addEventListener("change", () => {
    map.setLayoutProperty(STOPS_LAYER_ID, "visibility", els.toggleStops.checked ? "visible" : "none");
  });
}

function wireControls() {
  els.mapMetricSelect.addEventListener("change", () => {
    state.mapMetric = els.mapMetricSelect.value;
    updateLegendLabels();
    updateLayerStyles();
    renderTopOpportunities(els.districtSearch.value);
  });
  els.districtSearch.addEventListener("input", () => renderTopOpportunities(els.districtSearch.value));
}

function updateLegendLabels() {
  const labels = METRIC_LABELS[state.mapMetric].legend;
  els.legendLeft.textContent = labels[0];
  els.legendRight.textContent = labels[1];
}

function drawBoundaries() {
  map.addSource(MAP_SOURCE_ID, {
    type: "geojson",
    data: styledGeoJson(),
    generateId: true,
  });

  map.addLayer({
    id: MAP_FILL_LAYER_ID,
    type: "fill",
    source: MAP_SOURCE_ID,
    paint: {
      "fill-color": ["get", "_fillColor"],
      "fill-opacity": ["get", "_fillOpacity"],
    },
  });

  map.addLayer({
    id: MAP_LINE_LAYER_ID,
    type: "line",
    source: MAP_SOURCE_ID,
    paint: {
      "line-color": ["get", "_lineColor"],
      "line-width": ["get", "_lineWidth"],
      "line-opacity": 0.95,
    },
  });

  map.on("click", MAP_FILL_LAYER_ID, (event) => {
    const id = event.features?.[0]?.properties?.id;
    const feature = state.byId.get(String(id));
    if (feature) selectFeature(feature);
  });

  map.on("mousemove", MAP_FILL_LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", MAP_FILL_LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
  });

  const bounds = geoJsonBounds(state.features);
  if (bounds) map.fitBounds(bounds, { padding: 30, duration: 0 });
}

function styledGeoJson() {
  return {
    type: "FeatureCollection",
    features: state.features.map((feature) => {
      const style = styleForFeature(feature);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          _fillColor: style.fillColor,
          _fillOpacity: style.fillOpacity,
          _lineColor: style.lineColor,
          _lineWidth: style.lineWidth,
        },
      };
    }),
  };
}

function styleForFeature(feature) {
  const id = feature.properties.id;
  const isSelected = state.selectedId === id;
  const color = colorForFeature(feature);
  return {
    fillColor: color,
    fillOpacity: feature.properties[state.mapMetric] == null ? 0.18 : 0.66,
    lineColor: isSelected ? "#17201b" : "#ffffff",
    lineWidth: isSelected ? 2.4 : 0.8,
  };
}

function colorForFeature(feature) {
  const value = feature.properties[state.mapMetric];
  const range = state.ranges[state.mapMetric];
  if (!isFiniteNumber(value) || !range || range.min === range.max) return "#9aa39b";
  const t = clamp((value - range.min) / (range.max - range.min), 0, 1);
  return mixColor("#0f7b55", "#bd4d3f", t);
}

function updateLayerStyles() {
  const source = map.getSource(MAP_SOURCE_ID);
  if (source) source.setData(styledGeoJson());
}

function selectFeature(feature) {
  state.selectedId = feature.properties.id;
  renderProfile(feature);
  renderTopOpportunities(els.districtSearch.value);
  updateLayerStyles();
}

function renderProfile(feature) {
  const p = feature.properties;
  els.profilePanel.classList.remove("hidden");
  els.profilePanel.innerHTML = `
    <div class="profile-header">
      <div class="profile-title-row">
        <div>
          <span class="section-kicker">Планова единица</span>
          <h2>${escapeHtml(p.name)}</h2>
        </div>
      </div>
      <div class="profile-meta">
        <span class="meta-chip">ГЕ ${escapeHtml(p.id)}</span>
        ${p.district ? `<span class="meta-chip">${escapeHtml(p.district)}</span>` : ""}
      </div>
    </div>
    <div class="metric-grid">
      ${metricCard("rentPrice", p.rentPrice)}
      ${metricCard("airQuality", p.airQuality, p.airSamples)}
    </div>
  `;
}

function metricCard(metricKey, value, samples) {
  const meta = METRIC_LABELS[metricKey];
  const range = state.ranges[metricKey];
  const valueText = isFiniteNumber(value) ? `${formatNumber(value)} ${meta.unit}` : "N/A";
  let sub = "Няма данни за района";
  if (isFiniteNumber(value) && range && isFiniteNumber(range.avg)) {
    const delta = ((value - range.avg) / Math.abs(range.avg)) * 100;
    sub = `${Math.abs(delta).toFixed(0)}% ${delta >= 0 ? "над" : "под"} средното`;
    if (samples != null) sub += ` · ${samples} сензор${samples === 1 ? "" : "а"}`;
  }
  const width = isFiniteNumber(value) && range && range.max !== range.min
    ? Math.round(((value - range.min) / (range.max - range.min)) * 100)
    : 0;
  const tone = meta.higherIsBetter ? "" : "bad";
  return `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(meta.title)}</div>
      <div class="metric-value">${escapeHtml(valueText)}</div>
      <div class="metric-sub">${escapeHtml(sub)}</div>
      <div class="bar ${tone}" style="--w: ${width}%"><span></span></div>
    </article>
  `;
}

function renderTopOpportunities(query = "") {
  const needle = query.trim().toLowerCase();
  const meta = METRIC_LABELS[state.mapMetric];
  const filtered = state.features
    .filter((feature) => !needle || feature.properties.name.toLowerCase().includes(needle) || feature.properties.id.includes(needle))
    .filter((feature) => isFiniteNumber(feature.properties[state.mapMetric]))
    .sort((a, b) => {
      const av = a.properties[state.mapMetric];
      const bv = b.properties[state.mapMetric];
      return meta.higherIsBetter ? bv - av : av - bv;
    })
    .slice(0, needle ? 40 : 14);

  if (!filtered.length) {
    els.topOpportunities.innerHTML = `<div class="muted-note">Няма намерени планови единици с данни.</div>`;
    return;
  }

  els.topOpportunities.innerHTML = `
    <div class="muted-note">${needle ? `${filtered.length} съвпадения` : `Топ ${filtered.length} по ${meta.short}`}</div>
    ${filtered
      .map((feature) => {
        const p = feature.properties;
        const selected = p.id === state.selectedId ? "selected" : "";
        const value = `${formatNumber(p[state.mapMetric])} ${meta.unit}`;
        return `
          <button class="opportunity-row ${selected}" type="button" data-id="${escapeHtml(p.id)}">
            <span>
              <strong>${escapeHtml(p.name)}</strong>
              <small>${escapeHtml(p.district || "")}</small>
            </span>
            <b>${escapeHtml(value)}</b>
          </button>
        `;
      })
      .join("")}
  `;

  els.topOpportunities.querySelectorAll(".opportunity-row").forEach((button) => {
    button.addEventListener("click", () => {
      const feature = state.byId.get(button.dataset.id);
      if (!feature) return;
      selectFeature(feature);
      const bounds = featureBounds(feature);
      if (bounds) map.fitBounds(bounds, { padding: 34, maxZoom: 15 });
    });
  });
}

function renderDatasetStatus() {
  if (!state.datasets.length) {
    els.datasetStatus.innerHTML = `<div class="muted-note">Зареждане...</div>`;
    return;
  }
  els.datasetStatus.innerHTML = state.datasets
    .map((dataset) => `
      <div class="dataset-row">
        <div>
          <strong>${escapeHtml(dataset.label)}</strong>
          <span>${escapeHtml(dataset.category)} · ${dataset.rowCount} района</span>
          <div class="dataset-links">
            <a href="${escapeHtml(dataset.apiUrl)}" target="_blank" rel="noopener">API</a>
            <a href="${escapeHtml(dataset.pageUrl)}" target="_blank" rel="noopener">Източник</a>
          </div>
        </div>
        <i class="status-dot ok"></i>
      </div>
    `)
    .join("");
}

function geoJsonBounds(features) {
  const points = [];
  for (const feature of features) collectLonLat(feature.geometry?.coordinates, points);
  return pointsToBounds(points);
}

function featureBounds(feature) {
  const points = [];
  collectLonLat(feature?.geometry?.coordinates, points);
  return pointsToBounds(points);
}

function pointsToBounds(points) {
  if (!points.length) return null;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const [lon, lat] = points[i];
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}

function collectLonLat(value, points) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    points.push([value[0], value[1]]);
    return;
  }
  value.forEach((entry) => collectLonLat(entry, points));
}

function mixColor(a, b, amount) {
  const colorA = hexToRgb(a);
  const colorB = hexToRgb(b);
  const mixed = colorA.map((channel, index) => Math.round(channel + (colorB[index] - channel) * amount));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((start) => parseInt(clean.slice(start, start + 2), 16));
}

function formatNumber(value) {
  if (!isFiniteNumber(value)) return "N/A";
  return Number(value).toLocaleString("bg-BG", { maximumFractionDigits: 1 });
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
