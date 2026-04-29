const API_ROOT = "/api/sofiaplan/datasets";

const DATASETS = {
  boundaries: { id: 266, label: "Планови единици", key: "id", join: "id" },
  prices: { id: 624, label: "Цени на имоти", key: "ge_id", join: "id" },
  income: { id: 635, label: "Ниво на доходи", key: "obns_cyr", join: "district" },
  schools: { id: 593, label: "НВО резултати", key: "regname", join: "name" },
  metro: { id: 437, label: "Достъп до метро", join: "spatial" },
  parks: { id: 330, label: "Достъп до паркове", join: "spatial" },
  air: { id: 581, label: "Качество на въздуха (NO₂)", join: "spatial" },
  density: { id: 632, label: "Застроеност", key: "id", join: "id" },
  population: { id: 622, label: "Население", key: "id", join: "id" },
  permits: { id: 629, label: "Строителни разрешения", key: "id", join: "id" },
};

const FIELD_HINTS = {
  id: {
    exact: ["GE_ID", "ge_id", "GEID", "geid", "GE", "ge", "id_ge", "ID_GE", "code", "CODE", "gid", "GID", "id", "ID"],
    fuzzy: [/^ge[_\s-]?id$/i, /^ge$/i, /planning.*unit/i, /ident/i],
  },
  name: {
    exact: ["name", "NAME", "ime", "IME", "rayon", "RAION", "district", "DISTRICT", "ge_name", "GE_NAME"],
    fuzzy: [/name/i, /име/i, /район/i, /district/i],
  },
  planningUnitName: {
    exact: ["regname", "REGNAME", "ge_name", "GE_NAME", "name", "NAME"],
    fuzzy: [/regname/i, /ge.*name/i, /name/i, /име/i],
  },
  district: {
    exact: ["rajon", "RAJON", "district", "DISTRICT", "obns_cyr", "OBNS_CYR", "rayon"],
    fuzzy: [/rajon/i, /район/i, /district/i, /obns/i],
  },
  salePrice: {
    exact: [
      "cena_ap_kv_m",
      "cena_ofis_kv_m",
      "sale_eur_m2",
      "sale_price_eur_m2",
      "sale_sqm",
      "price_sale",
      "avg_sale",
      "purchase_price",
      "prodajba",
      "SALE",
      "sale",
    ],
    fuzzy: [/cena.*(kv|m2|sqm|sq)/i, /sale.*(m2|sqm|sq|eur|price)/i, /purchase.*(m2|sqm|sq|eur|price)/i, /прод/i, /цена.*кв/i],
  },
  rentPrice: {
    exact: [
      "naem_ap_kv_m",
      "naem_ofis_kv_m",
      "naem_mag_kv_m",
      "rent_eur_m2",
      "rent_price_eur_m2",
      "rent_sqm",
      "price_rent",
      "avg_rent",
      "naem",
      "RENT",
      "rent",
    ],
    fuzzy: [/naem.*(kv|m2|sqm|sq)/i, /rent.*(m2|sqm|sq|eur|price)/i, /наем.*кв/i],
  },
  income: {
    exact: ["sr_mes_dohod", "sr_god_dohod", "dohod_ofis", "income_pct", "pct_vs_avg", "income_index", "avg_income", "income", "DOHOD", "dohod"],
    fuzzy: [/income/i, /доход/i, /avg.*salary/i, /pct.*avg/i],
  },
  nve: {
    exact: ["nve_avg", "avg_score", "score", "grade_4", "grade_7", "NVE", "nvo", "NVO"],
    fuzzy: [/nve/i, /nvo/i, /score/i, /оцен/i, /матур/i],
  },
  metro: {
    exact: ["pct_within_800m", "metro_800", "access_800", "p800", "PCT_800"],
    fuzzy: [/800/i, /metro/i, /метро/i],
  },
  parks: {
    exact: ["pct_within_400m", "park_400", "green_400", "p400", "PCT_400"],
    fuzzy: [/400/i, /park/i, /green/i, /парк/i, /зел/i],
  },
  no2: {
    exact: ["level", "no2", "NO2", "annual_no2", "avg_no2", "value", "VALUE"],
    fuzzy: [/no.?2/i, /азот/i, /annual/i],
  },
  buildingDensity: {
    exact: ["zastr_plytnost", "zastr_intenzivnost", "building_density", "density", "plot_ratio", "intensity", "FAR", "far", "kint"],
    fuzzy: [/density/i, /intensity/i, /застро/i, /плът/i, /kint/i],
  },
  population: {
    exact: ["ppl_35kvm_sum", "ppl_30kvm_sum", "ppl_40kvm_sum", "population", "pop", "POP", "residents", "people", "naselenie"],
    fuzzy: [/population/i, /residents/i, /насел/i, /people/i],
  },
  permits: {
    exact: ["jil_2010", "permits", "permit_count", "count", "COUNT", "cnt", "CNT"],
    fuzzy: [/permit/i, /count/i, /разреш/i, /строеж/i],
  },
};

// Legend labels for each map metric: [left (low/red side), right (high/green side)]
const LEGEND_LABELS = {
  score:            ["Надценен",             "Подценен"],
  salePrice:        ["Висока цена",          "Ниска цена"],
  rentPrice:        ["Висок наем",           "Нисък наем"],
  income:           ["Ниски доходи",         "Високи доходи"],
  nve:              ["Слаби резултати",      "Отлични резултати"],
  infrastructure:   ["Слаба инфраструктура", "Добра инфраструктура"],
  populationDensity:["Рядко население",    "Гъсто население"],
  buildingDensity:  ["Ниска застроеност",   "Висока застроеност"],
};

const state = {
  datasets: {},
  joined: new Map(),
  selectedId: null,
  compareIds: [],
  mode: "score",
  mapMetric: "score",
  ranges: {},
  chart: null,
};

const els = {
  profilePanel: document.querySelector("#profilePanel"),
  datasetStatus: document.querySelector("#datasetStatus"),
  loadingStatus: document.querySelector("#loadingStatus"),
  districtSearch: document.querySelector("#districtSearch"),
  topOpportunities: document.querySelector("#topOpportunities"),
  compareSlots: document.querySelector("#compareSlots"),
  clearCompareButton: document.querySelector("#clearCompareButton"),
  mapMetricSelect: document.querySelector("#mapMetricSelect"),
  compareModeButton: document.querySelector("#compareModeButton"),
  compareChart: document.querySelector("#compareChart"),
  legendLeft: document.querySelector("#legendLeft"),
  legendRight: document.querySelector("#legendRight"),
};

const MAP_SOURCE_ID = "planning-units";
const MAP_FILL_LAYER_ID = "planning-units-fill";
const MAP_LINE_LAYER_ID = "planning-units-line";

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
  renderDatasetStatus();
  wireControls();

  const entries = await Promise.all(
    Object.entries(DATASETS).map(async ([key, config]) => [key, await loadDataset(config)])
  );

  state.datasets = Object.fromEntries(entries);
  renderDatasetStatus();

  if (!state.datasets.boundaries.geojson) {
    setLoading("Границите на плановите единици не можаха да бъдат заредени. Проверете API на СофияПлан или CORS достъпа.");
    return;
  }

  buildJoinedProfiles();
  calculateRanges();
  await mapReady;
  drawBoundaries();
  renderTopOpportunities();
  updateComparePanel();
  els.loadingStatus.classList.add("hidden");
}

function wireControls() {
  els.mapMetricSelect.addEventListener("change", () => {
    state.mapMetric = els.mapMetricSelect.value;
    setMode("score");
    updateLayerStyles();
    updateLegendLabels();
    renderTopOpportunities(els.districtSearch.value);
  });
  els.districtSearch.addEventListener("input", () => renderTopOpportunities(els.districtSearch.value));
  els.compareModeButton.addEventListener("click", () => setMode(state.mode === "compare" ? "score" : "compare"));
  els.clearCompareButton.addEventListener("click", () => {
    state.compareIds = [];
    updateComparePanel();
    updateLayerStyles();
  });
}

function updateLegendLabels() {
  const labels = LEGEND_LABELS[state.mapMetric] || LEGEND_LABELS.score;
  els.legendLeft.textContent = labels[0];
  els.legendRight.textContent = labels[1];
}

function setMode(mode) {
  state.mode = mode;
  els.compareModeButton.classList.toggle("active", mode === "compare");
}

async function loadDataset(config) {
  const url = `${API_ROOT}/${config.id}`;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const geojson = await response.json();
    const features = Array.isArray(geojson.features) ? geojson.features : [];
    const key = config.key || detectField(features, FIELD_HINTS.id);
    const index = key ? indexFeatures(features, key) : new Map();

    return {
      ...config,
      url,
      geojson,
      features,
      key,
      index,
      status: features.length ? "ok" : "empty",
      error: "",
    };
  } catch (error) {
    return {
      ...config,
      url,
      geojson: null,
      features: [],
      key: "",
      index: new Map(),
      status: "bad",
      error: error.message || "Грешка при зареждане",
    };
  }
}

function indexFeatures(features, key) {
  const index = new Map();
  for (const feature of features) {
    const id = normalizeId(feature.properties?.[key]);
    if (!id) continue;

    const existing = index.get(id);
    if (!existing || isNewerFeature(feature, existing)) {
      index.set(id, feature);
    }
  }
  return index;
}

function isNewerFeature(candidate, existing) {
  const candidateYear = parseLooseNumber(candidate.properties?.godina);
  const existingYear = parseLooseNumber(existing.properties?.godina);
  if (isFiniteNumber(candidateYear) && isFiniteNumber(existingYear)) return candidateYear > existingYear;
  if (isFiniteNumber(candidateYear)) return true;
  return false;
}

function findDatasetMatch(profile, dataset) {
  if (dataset.join === "id") return dataset.index.get(profile.id) || null;

  if (dataset.join === "name") {
    return findByNormalizedText(dataset.features, FIELD_HINTS.planningUnitName, profile.name);
  }

  if (dataset.join === "district") {
    return findByNormalizedText(dataset.features, FIELD_HINTS.district, profile.district);
  }

  if (dataset.join === "spatial") {
    return findContainingFeature(dataset.features, profile.centroid);
  }

  return null;
}

function findByNormalizedText(features, hints, value) {
  const normalized = normalizeLookupValue(value);
  if (!normalized) return null;

  return (
    features.find((feature) => normalizeLookupValue(getText(feature.properties, hints)) === normalized) ||
    null
  );
}

function findContainingFeature(features, point) {
  if (!point) return null;
  const matches = features.filter((feature) => pointInFeature(point, feature));
  matches.sort((a, b) => (parseLooseNumber(a.properties?.tobreak) ?? Infinity) - (parseLooseNumber(b.properties?.tobreak) ?? Infinity));
  return matches[0] || null;
}

function buildJoinedProfiles() {
  const boundaryFeatures = state.datasets.boundaries.features;
  const boundaryKey = state.datasets.boundaries.key || detectField(boundaryFeatures, FIELD_HINTS.id);

  for (const feature of boundaryFeatures) {
    const props = feature.properties || {};
    const id = normalizeId(props[boundaryKey]) || normalizeId(feature.id);
    if (!id) continue;
    const name = getText(props, FIELD_HINTS.planningUnitName) || `Планова единица ${id}`;
    const district = normalizeLookupValue(getText(props, FIELD_HINTS.district));

    const profile = {
      id,
      feature,
      name,
      district,
      centroid: featureCentroid(feature),
      boundary: props,
      sources: {},
      raw: {},
      metrics: {},
      score: null,
    };

    for (const [key, dataset] of Object.entries(state.datasets)) {
      if (key === "boundaries") continue;
      const match = findDatasetMatch(profile, dataset);
      profile.sources[key] = match || null;
      profile.raw[key] = match?.properties || {};
    }

    profile.metrics = extractMetrics(profile);
    state.joined.set(id, profile);
  }
}

function extractMetrics(profile) {
  const raw = profile.raw;
  const areaKm2 = geoJsonAreaKm2(profile.feature);
  const population = getNumber(raw.population, FIELD_HINTS.population);
  const metro = accessScore(raw.metro, 800);
  const parks = accessScore(raw.parks, 400);
  const no2 = getNumber(raw.air, FIELD_HINTS.no2);
  const permits = getNumber(raw.permits, FIELD_HINTS.permits);

  const metrics = {
    salePrice: getNumber(raw.prices, FIELD_HINTS.salePrice),
    rentPrice: getNumber(raw.prices, FIELD_HINTS.rentPrice),
    income: getNumber(raw.income, FIELD_HINTS.income),
    nve: getNveScore(raw.schools),
    metro,
    parks,
    no2,
    buildingDensity: getNumber(raw.density, FIELD_HINTS.buildingDensity),
    population,
    populationDensity: isFiniteNumber(population) && areaKm2 > 0 ? population / areaKm2 : null,
    areaKm2,
    permits,
  };

  metrics.infrastructure = calculateInfrastructureScore(metrics);
  return metrics;
}

function calculateRanges() {
  const keys = [
    "salePrice",
    "rentPrice",
    "income",
    "nve",
    "metro",
    "parks",
    "no2",
    "buildingDensity",
    "population",
    "populationDensity",
    "areaKm2",
    "permits",
  ];
  for (const key of keys) {
    const values = [...state.joined.values()].map((profile) => profile.metrics[key]).filter(isFiniteNumber);
    state.ranges[key] = {
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 1,
      avg: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    };
  }

  for (const profile of state.joined.values()) {
    profile.metrics.infrastructure = calculateInfrastructureScore(profile.metrics);
  }

  const infrastructureValues = [...state.joined.values()]
    .map((profile) => profile.metrics.infrastructure)
    .filter(isFiniteNumber);
  state.ranges.infrastructure = {
    min: infrastructureValues.length ? Math.min(...infrastructureValues) : 0,
    max: infrastructureValues.length ? Math.max(...infrastructureValues) : 1,
    avg: infrastructureValues.length
      ? infrastructureValues.reduce((sum, value) => sum + value, 0) / infrastructureValues.length
      : null,
  };

  for (const profile of state.joined.values()) {
    profile.score = calculateUndervaluedScore(profile);
  }

  const scores = [...state.joined.values()].map((profile) => profile.score).filter(isFiniteNumber);
  state.ranges.score = {
    min: scores.length ? Math.min(...scores) : -1,
    max: scores.length ? Math.max(...scores) : 1,
    avg: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
  };
}

function calculateUndervaluedScore(profile) {
  const m = profile.metrics;
  const signals = [
    normMetric("metro", m.metro),
    normMetric("parks", m.parks),
    normMetric("infrastructure", m.infrastructure),
    normMetric("income", m.income),
    normMetric("nve", m.nve),
    inverseNormMetric("no2", m.no2),
    inverseNormMetric("buildingDensity", m.buildingDensity),
  ].filter(isFiniteNumber);

  if (!signals.length) return null;

  const quality = average(signals);
  const price = normMetric("salePrice", m.salePrice) ?? normMetric("rentPrice", m.rentPrice);
  if (!isFiniteNumber(price)) return quality - 0.5;

  return quality - price;
}

function drawBoundaries() {
  map.addSource(MAP_SOURCE_ID, {
    type: "geojson",
    data: styledBoundaryGeoJson(),
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
    const id = event.features?.[0]?.properties?._profileId;
    const profile = state.joined.get(normalizeId(id));
    if (profile) selectProfile(profile);
  });

  map.on("mousemove", MAP_FILL_LAYER_ID, (event) => {
    map.getCanvas().style.cursor = "pointer";
    const name = event.features?.[0]?.properties?._profileName;
    if (name) map.getCanvas().title = name;
  });

  map.on("mouseleave", MAP_FILL_LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
    map.getCanvas().title = "";
  });

  const bounds = geoJsonBounds(state.datasets.boundaries.geojson);
  if (bounds) {
    map.fitBounds(bounds, { padding: 30, duration: 0 });
  }
}

function getFeatureId(feature) {
  const key = state.datasets.boundaries.key || detectField([feature], FIELD_HINTS.id);
  return normalizeId(feature.properties?.[key]) || normalizeId(feature.id);
}

function styledBoundaryGeoJson() {
  return {
    type: "FeatureCollection",
    features: state.datasets.boundaries.features.map((feature) => {
      const id = getFeatureId(feature);
      const profile = state.joined.get(id);
      const style = styleForFeature(feature);
      return {
        ...feature,
        properties: {
          ...(feature.properties || {}),
          _profileId: id,
          _profileName: profile?.name || "",
          _fillColor: style.fillColor,
          _fillOpacity: style.fillOpacity,
          _lineColor: style.color,
          _lineWidth: style.weight,
        },
      };
    }),
  };
}

function selectProfile(profile) {
  state.selectedId = profile.id;
  if (state.mode === "compare") {
    addCompare(profile.id);
  }

  renderProfile(profile);
  renderTopOpportunities(els.districtSearch.value);
  updateLayerStyles();
}

function addCompare(id) {
  state.compareIds = state.compareIds.filter((candidate) => candidate !== id);
  state.compareIds.push(id);
  if (state.compareIds.length > 2) state.compareIds.shift();
  updateComparePanel();
}

function styleForFeature(feature) {
  const id = getFeatureId(feature);
  const profile = state.joined.get(id);
  const isSelected = state.selectedId === id;
  const isCompared = state.compareIds.includes(id);
  const color = profile ? colorForProfile(profile) : "#9aa39b";

  return {
    color: isSelected || isCompared ? "#17201b" : "#ffffff",
    weight: isSelected || isCompared ? 2.4 : 0.8,
    opacity: 0.95,
    fillColor: color,
    fillOpacity: profile ? 0.66 : 0.2,
  };
}

function updateLayerStyles() {
  const source = map.getSource(MAP_SOURCE_ID);
  if (source) source.setData(styledBoundaryGeoJson());
}

function colorForScore(score) {
  if (!isFiniteNumber(score)) return "#9aa39b";
  const t = clamp(normalize(score, state.ranges.score.min, state.ranges.score.max), 0, 1);
  if (t < 0.5) return mixColor("#bd4d3f", "#e8d66c", t * 2);
  return mixColor("#e8d66c", "#0f7b55", (t - 0.5) * 2);
}

function colorForProfile(profile) {
  if (state.mapMetric === "score") return colorForScore(profile.score);

  const value = profile.metrics[state.mapMetric];
  const range = state.ranges[state.mapMetric];
  if (!isFiniteNumber(value) || !range) return "#9aa39b";

  const t = clamp(normalize(value, range.min, range.max), 0, 1);
  if (["salePrice", "rentPrice", "no2", "buildingDensity", "populationDensity"].includes(state.mapMetric)) {
    return mixColor("#0f7b55", "#bd4d3f", t);
  }
  return mixColor("#d7dfcf", "#0f7b55", t);
}

function renderProfile(profile) {
  const m = profile.metrics;
  const score = profile.score;
  const scoreLabel = isFiniteNumber(score) ? `${score > 0 ? "+" : ""}${score.toFixed(2)}` : "Без оценка";

  els.profilePanel.innerHTML = `
    <div class="profile-header">
      <div class="profile-title-row">
        <div>
          <span class="section-kicker">Планова единица</span>
          <h2>${escapeHtml(profile.name)}</h2>
        </div>
        <div class="score-pill ${score < 0 ? "negative" : ""}">${scoreLabel}<br>привлекателност</div>
      </div>
      <div class="profile-meta">
        <span class="meta-chip">ГЕ ${escapeHtml(profile.id)}</span>
        <span class="meta-chip">${countSources(profile)} набора от данни</span>
      </div>
    </div>
    <div class="metric-grid">
      ${metricCard("Продажна цена", formatMoney(m.salePrice), avgLine("salePrice", m.salePrice, "градската средна"), barWidth("salePrice", m.salePrice), "bad")}
      ${metricCard("Наем", formatMoney(m.rentPrice), avgLine("rentPrice", m.rentPrice, "градската средна"), barWidth("rentPrice", m.rentPrice), "bad")}
      ${metricCard("Ниво на доходи", formatNumber(m.income), avgLine("income", m.income, "средното за набора"), barWidth("income", m.income))}
      ${metricCard("Успех на учениците", formatNumber(m.nve), "Резултат от НВО", barWidth("nve", m.nve))}
      ${metricCard("Инфраструктура", formatScore(m.infrastructure), infrastructureLine(m), barWidth("infrastructure", m.infrastructure))}
      ${metricCard("Достъп до метро", formatPercentish(m.metro), "Обхват 800 м", barWidth("metro", m.metro))}
      ${metricCard("Достъп до паркове", formatPercentish(m.parks), "Зелени площи в 400 м", barWidth("parks", m.parks))}
      ${metricCard("Качество на въздуха", formatNo2(m.no2), "По-ниски стойности са по-добри", inverseBarWidth("no2", m.no2), "warning")}
      ${metricCard("Застроеност", formatNumber(m.buildingDensity), "Интензивност на застряване", barWidth("buildingDensity", m.buildingDensity), "warning")}
      ${metricCard("Гъстота на население", formatDensity(m.populationDensity), `${formatInteger(m.population)} жители, ${formatArea(m.areaKm2)}`, barWidth("populationDensity", m.populationDensity))}
      ${metricCard("Строителни разрешения", formatInteger(m.permits), "Строителна активност", barWidth("permits", m.permits))}
    </div>
    <div class="insight-block">
      <span class="section-kicker">Анализ на стойността</span>
      <h3>${escapeHtml(verdictLabel(profile))}</h3>
      <p>${escapeHtml(priceExplanation(profile))}</p>
      <div class="signal-list">
        ${explainSignals(profile).map((signal) => `<span class="${signal.tone}">${escapeHtml(signal.text)}</span>`).join("")}
      </div>
    </div>
  `;
}

function metricCard(label, value, sub, width, tone = "") {
  return `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
      <div class="metric-sub">${escapeHtml(sub)}</div>
      <div class="bar ${tone}" style="--w: ${width}%"><span></span></div>
    </article>
  `;
}

function updateComparePanel() {
  const slots = [0, 1].map((idx) => {
    const profile = state.joined.get(state.compareIds[idx]);
    return `<div class="compare-slot ${profile ? "filled" : ""}">${profile ? escapeHtml(profile.name) : idx === 0 ? "Първи избор" : "Втори избор"}</div>`;
  });
  els.compareSlots.innerHTML = slots.join("");
  renderChart();
}

function renderTopOpportunities(query = "") {
  const needle = query.trim().toLowerCase();
  const profiles = [...state.joined.values()]
    .filter((profile) => !needle || profile.name.toLowerCase().includes(needle) || profile.id.includes(needle))
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
    .slice(0, needle ? 40 : 14);

  if (!profiles.length) {
    els.topOpportunities.innerHTML = `<div class="muted-note">Няма намерени планови единици.</div>`;
    return;
  }

  const total = [...state.joined.values()].filter(
    (profile) => !needle || profile.name.toLowerCase().includes(needle) || profile.id.includes(needle)
  ).length;

  els.topOpportunities.innerHTML = `
    <div class="muted-note">${needle ? `${profiles.length} от ${total} съвпадения` : `Топ ${profiles.length} от ${total} планови единици`}</div>
    ${profiles
    .map((profile) => {
      const selected = profile.id === state.selectedId ? "selected" : "";
      const score = isFiniteNumber(profile.score) ? `${profile.score > 0 ? "+" : ""}${profile.score.toFixed(2)}` : "N/A";
      return `
        <button class="opportunity-row ${selected}" type="button" data-id="${escapeHtml(profile.id)}">
          <span>
            <strong>${escapeHtml(profile.name)}</strong>
            <small>${escapeHtml(formatMoney(profile.metrics.salePrice))} продажба / ${escapeHtml(formatMoney(profile.metrics.rentPrice))} наем</small>
          </span>
          <b>${escapeHtml(score)}</b>
        </button>
      `;
    })
    .join("")}
  `;

  els.topOpportunities.querySelectorAll(".opportunity-row").forEach((button) => {
    button.addEventListener("click", () => {
      const profile = state.joined.get(button.dataset.id);
      if (!profile) return;
      selectProfile(profile);
      const bounds = featureBounds(profile.feature);
      if (bounds) map.fitBounds(bounds, { padding: 34, maxZoom: 15 });
    });
  });
}

function renderChart() {
  const profiles = state.compareIds.map((id) => state.joined.get(id)).filter(Boolean);
  const labels = ["Стойност", "Доходи", "Училища", "Транспорт", "Паркове", "Инфраструктура"];
  const datasets = profiles.map((profile, index) => ({
    label: profile.name,
    data: chartValues(profile),
    fill: true,
    borderColor: index === 0 ? "#0f7b55" : "#256b8f",
    backgroundColor: index === 0 ? "rgba(15, 123, 85, 0.18)" : "rgba(37, 107, 143, 0.16)",
    pointBackgroundColor: index === 0 ? "#0f7b55" : "#256b8f",
  }));

  if (state.chart) {
    state.chart.data.datasets = datasets;
    state.chart.update();
    return;
  }

  state.chart = new Chart(els.compareChart, {
    type: "radar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { boxWidth: 10, font: { size: 11 } } },
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 25 },
          pointLabels: { font: { size: 11 } },
          grid: { color: "#d8d2c7" },
          angleLines: { color: "#d8d2c7" },
        },
      },
    },
  });
}

function chartValues(profile) {
  const m = profile.metrics;
  const value = isFiniteNumber(profile.score) ? normalize(profile.score, state.ranges.score.min, state.ranges.score.max) : null;
  return [
    toChart(value),
    toChart(normMetric("income", m.income)),
    toChart(normMetric("nve", m.nve)),
    toChart(normMetric("metro", m.metro)),
    toChart(normMetric("parks", m.parks)),
    toChart(normMetric("infrastructure", m.infrastructure)),
  ];
}

function calculateInfrastructureScore(metrics) {
  const signals = [
    percentishScore(metrics.metro),
    percentishScore(metrics.parks),
    inverseNormMetric("no2", metrics.no2),
    normMetric("permits", metrics.permits),
  ].filter(isFiniteNumber);

  return signals.length ? Math.round(average(signals) * 100) : null;
}

function verdictLabel(profile) {
  if (!isFiniteNumber(profile.score)) return "Недостатъчно данни за оценка";
  if (profile.score >= 0.22) return "Изглежда подценен";
  if (profile.score <= -0.18) return "Изглежда надценен спрямо показателите";
  return "Изглежда на справедлива цена";
}

function priceExplanation(profile) {
  const m = profile.metrics;
  const qualitySignals = [
    normMetric("income", m.income),
    normMetric("nve", m.nve),
    normMetric("infrastructure", m.infrastructure),
    inverseNormMetric("no2", m.no2),
  ].filter(isFiniteNumber);
  const quality = qualitySignals.length ? Math.round(average(qualitySignals) * 100) : null;
  const priceText = avgLine("salePrice", m.salePrice, "градската средна продажна цена").toLowerCase();

  if (!isFiniteNumber(quality)) {
    return `Необходими са повече съвпадащи набори от данни за пълен анализ. Текущ сигнал за продажна цена: ${priceText}.`;
  }

  return `Качественият показател е ${quality}/100, а продажната цена е ${priceText}. Инвестиционната привлекателност сравнява качеството с цената — силни услуги при под средни цени се открояват като възможности.`;
}

function explainSignals(profile) {
  const m = profile.metrics;
  return [
    signal("Доходи", normMetric("income", m.income), "good"),
    signal("Училища", normMetric("nve", m.nve), "good"),
    signal("Инфраструктура", normMetric("infrastructure", m.infrastructure), "good"),
    signal("Въздух", inverseNormMetric("no2", m.no2), "good"),
    signal("Ценово натоварване", normMetric("salePrice", m.salePrice), "bad"),
  ].filter(Boolean);
}

function signal(label, value, goodTone) {
  if (!isFiniteNumber(value)) return null;
  const levelBg = value >= 0.66 ? "висок" : value <= 0.34 ? "нисък" : "среден";
  const levelKey = value >= 0.66 ? "strong" : value <= 0.34 ? "weak" : "average";
  const tone = levelKey === "strong" ? goodTone : levelKey === "weak" ? (goodTone === "good" ? "bad" : "good") : "neutral";
  return { text: `${label}: ${levelBg}`, tone };
}

function infrastructureLine(metrics) {
  const parts = [];
  if (isFiniteNumber(metrics.metro)) parts.push(`${formatPercentish(metrics.metro)} метро`);
  if (isFiniteNumber(metrics.parks)) parts.push(`${formatPercentish(metrics.parks)} паркове`);
  if (isFiniteNumber(metrics.no2)) parts.push(`${formatNo2(metrics.no2)} NO₂`);
  return parts.length ? parts.join(" / ") : "Комбиниран показател за достъп и риск";
}

function renderDatasetStatus() {
  els.datasetStatus.innerHTML = Object.entries(DATASETS)
    .map(([key, config]) => {
      const dataset = state.datasets[key];
      const status = dataset?.status || "loading";
      const detail = dataset
        ? dataset.status === "ok"
          ? `${dataset.features.length} обекта, ключ: ${dataset.key || "не е открит"}`
          : dataset.error || dataset.status
        : `Набор ${config.id}`;
      return `
        <div class="dataset-row">
          <div>
            <strong>${escapeHtml(config.label)}</strong>
            <span>${escapeHtml(detail)}</span>
          </div>
          <i class="status-dot ${status === "ok" ? "ok" : status === "bad" ? "bad" : ""}"></i>
        </div>
      `;
    })
    .join("");
}

function setLoading(message) {
  els.loadingStatus.textContent = message;
  els.loadingStatus.classList.remove("hidden");
}

function accessScore(props, targetMeters) {
  if (!props) return null;
  const from = parseLooseNumber(props.frombreak);
  const to = parseLooseNumber(props.tobreak);
  if (!isFiniteNumber(from) || !isFiniteNumber(to)) return getNumber(props, FIELD_HINTS.metro);
  if (from <= targetMeters && to <= targetMeters) return 1;
  if (from <= targetMeters && to > targetMeters) return 0.5;
  return 0;
}

function getNveScore(props) {
  const direct = getNumber(props, FIELD_HINTS.nve);
  if (isFiniteNumber(direct)) return direct;
  const legenda = parseLooseNumber(props?.legenda);
  if (isFiniteNumber(legenda)) return legenda;
  return null;
}

function detectField(features, hints) {
  const props = features.find((feature) => feature?.properties)?.properties || {};
  const keys = Object.keys(props);
  for (const exact of hints.exact) {
    if (Object.prototype.hasOwnProperty.call(props, exact)) return exact;
  }
  return keys.find((key) => hints.fuzzy.some((pattern) => pattern.test(key))) || "";
}

function getNumber(props = {}, hints) {
  if (!props) return null;
  const keys = Object.keys(props);
  const exactKey = hints.exact.find((key) => isFiniteNumber(parseLooseNumber(props[key])));
  if (exactKey) return parseLooseNumber(props[exactKey]);

  const fuzzyKey = keys.find((key) => hints.fuzzy.some((pattern) => pattern.test(key)) && isFiniteNumber(parseLooseNumber(props[key])));
  if (fuzzyKey) return parseLooseNumber(props[fuzzyKey]);

  return null;
}

function getText(props = {}, hints) {
  if (!props) return "";
  for (const exact of hints.exact) {
    if (props[exact] != null && String(props[exact]).trim()) return String(props[exact]).trim();
  }
  const key = Object.keys(props).find((candidate) => hints.fuzzy.some((pattern) => pattern.test(candidate)));
  return key && props[key] != null ? String(props[key]).trim() : "";
}

// Handles both Bulgarian locale (comma decimal, dot thousands) and international formats
function parseLooseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let cleaned = value.replace(/\s/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Comma is decimal separator (e.g. "1.234,56" -> "1234.56")
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Dot is decimal separator (e.g. "1,234.56" -> "1234.56")
    cleaned = cleaned.replace(/,/g, "");
  }
  cleaned = cleaned.replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function normalizeId(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function normalizeLookupValue(value) {
  if (value == null) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^район\s+/, "");
}

function normMetric(key, value) {
  if (!isFiniteNumber(value)) return null;
  const range = state.ranges[key];
  return range ? normalize(value, range.min, range.max) : null;
}

function inverseNormMetric(key, value) {
  const normalized = normMetric(key, value);
  return isFiniteNumber(normalized) ? 1 - normalized : null;
}

function percentishScore(value) {
  if (!isFiniteNumber(value)) return null;
  if (value >= 0 && value <= 1) return value;
  if (value >= 0 && value <= 100) return value / 100;
  return null;
}

function normalize(value, min, max) {
  if (!isFiniteNumber(value) || !isFiniteNumber(min) || !isFiniteNumber(max) || max === min) return 0.5;
  return (value - min) / (max - min);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toChart(value) {
  return Math.round(clamp(isFiniteNumber(value) ? value : 0.5, 0, 1) * 100);
}

function barWidth(key, value) {
  const normalized = normMetric(key, value);
  return isFiniteNumber(normalized) ? Math.round(toChart(normalized)) : 0;
}

function inverseBarWidth(key, value) {
  const normalized = inverseNormMetric(key, value);
  return isFiniteNumber(normalized) ? Math.round(toChart(normalized)) : 0;
}

function avgLine(key, value, label) {
  const avg = state.ranges[key]?.avg;
  if (!isFiniteNumber(value) || !isFiniteNumber(avg)) return "Няма открито поле";
  const delta = avg === 0 ? 0 : ((value - avg) / Math.abs(avg)) * 100;
  return `${Math.abs(delta).toFixed(0)}% ${delta >= 0 ? "над" : "под"} ${label}`;
}

function countSources(profile) {
  return Object.values(profile.sources).filter(Boolean).length;
}

function formatMoney(value) {
  if (!isFiniteNumber(value)) return "N/A";
  return `${formatNumber(value)} /м²`;
}

function formatNo2(value) {
  if (!isFiniteNumber(value)) return "N/A";
  return `${formatNumber(value)} μg/m³`;
}

function formatPercentish(value) {
  if (!isFiniteNumber(value)) return "N/A";
  return value <= 1 ? `${Math.round(value * 100)}%` : `${formatNumber(value)}%`;
}

function formatInteger(value) {
  if (!isFiniteNumber(value)) return "N/A";
  return Math.round(value).toLocaleString("bg-BG");
}

function formatDensity(value) {
  if (!isFiniteNumber(value)) return "N/A";
  return `${Math.round(value).toLocaleString("bg-BG")} /км²`;
}

function formatArea(value) {
  if (!isFiniteNumber(value)) return "неизвестна площ";
  return `${value.toLocaleString("bg-BG", { maximumFractionDigits: 2 })} км²`;
}

function formatScore(value) {
  if (!isFiniteNumber(value)) return "N/A";
  return `${Math.round(value)}/100`;
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

function geoJsonBounds(geojson) {
  const points = [];
  for (const feature of geojson?.features || []) {
    points.push(...collectLonLat(feature.geometry?.coordinates));
  }
  return pointsToBounds(points);
}

function featureBounds(feature) {
  return pointsToBounds(collectLonLat(feature?.geometry?.coordinates));
}

function pointsToBounds(points) {
  if (!points.length) return null;
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

function featureCentroid(feature) {
  const points = collectLonLat(feature?.geometry?.coordinates);
  if (!points.length) return null;
  const sums = points.reduce(
    (acc, point) => ({ lon: acc.lon + point[0], lat: acc.lat + point[1] }),
    { lon: 0, lat: 0 }
  );
  return [sums.lon / points.length, sums.lat / points.length];
}

function collectLonLat(coordinates) {
  const points = [];
  walkCoordinates(coordinates, points);
  return points;
}

function walkCoordinates(value, points) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    points.push([value[0], value[1]]);
    return;
  }
  value.forEach((entry) => walkCoordinates(entry, points));
}

function pointInFeature(point, feature) {
  const geometry = feature?.geometry;
  if (!geometry) return false;

  if (geometry.type === "Polygon") return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

function pointInPolygon(point, rings) {
  if (!Array.isArray(rings) || !rings.length) return false;
  if (!pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((ring) => pointInRing(point, ring));
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function geoJsonAreaKm2(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return null;

  if (geometry.type === "Polygon") {
    return Math.abs(polygonAreaMeters(geometry.coordinates)) / 1_000_000;
  }

  if (geometry.type === "MultiPolygon") {
    const area = geometry.coordinates.reduce((sum, polygon) => sum + Math.abs(polygonAreaMeters(polygon)), 0);
    return area / 1_000_000;
  }

  return null;
}

function polygonAreaMeters(rings) {
  if (!Array.isArray(rings) || !rings.length) return 0;
  const outer = Math.abs(ringAreaMeters(rings[0]));
  const holes = rings.slice(1).reduce((sum, ring) => sum + Math.abs(ringAreaMeters(ring)), 0);
  return outer - holes;
}

function ringAreaMeters(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  const projected = ring.map(([lon, lat]) => projectLonLat(lon, lat));
  let area = 0;
  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index];
    const next = projected[(index + 1) % projected.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function projectLonLat(lon, lat) {
  const earthRadius = 6378137;
  const latRad = (Number(lat) * Math.PI) / 180;
  return {
    x: (Number(lon) * Math.PI * earthRadius) / 180,
    y: Math.log(Math.tan(Math.PI / 4 + latRad / 2)) * earthRadius,
  };
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
