# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Run

```bash
python3 server.py          # serves on http://127.0.0.1:8081
PORT=8082 python3 server.py
```

No build step. The app is plain HTML/CSS/JS loaded directly from disk.

## Architecture

This is a single-page, no-framework app with three files:

- **`server.py`** — stdlib-only Python HTTP server. Serves static files and proxies `GET /api/sofiaplan/datasets/{id}` to `https://api.sofiaplan.bg/datasets/{id}`, caching raw JSON responses under `.cache/sofiaplan/{id}.json`. Delete cache files to force a re-fetch.
- **`app.js`** — all application logic (~1150 lines). Loaded as a plain `<script>` tag.
- **`styles.css`** — all styling.

### `app.js` data flow

1. **`DATASETS`** — registry of 12 SofiaPlan dataset IDs and their join strategies (`"id"`, `"name"`, `"district"`, or `"spatial"`).
2. **`FIELD_HINTS`** — exact + fuzzy regex lists for detecting field names from each dataset's GeoJSON properties (needed because the upstream API uses inconsistent Bulgarian/English column names across datasets).
3. **`loadDataset()`** — fetches each dataset, detects its join key via `detectField()`, and builds a lookup index via `indexFeatures()`.
4. **`buildJoinedProfiles()`** — iterates boundary features (dataset 266) and, for each planning unit, calls `findDatasetMatch()` to join all other datasets by id, name, district, or spatial point-in-polygon. Produces a `Map<id, profile>` in `state.joined`.
5. **`extractMetrics()`** — reads joined raw properties through `FIELD_HINTS` and emits a typed `metrics` object per profile.
6. **`calculateRanges()`** — computes min/max/avg across all joined profiles and then calls `calculateUndervaluedScore()` for each (requires ranges to exist first).
7. **`drawBoundaries()`** — adds a MapLibre GL source + fill/line layers. Layer paint properties are pre-baked into GeoJSON feature properties (`_fillColor`, `_lineColor`, etc.) by `styledBoundaryGeoJson()` and refreshed by calling `source.setData()` via `updateLayerStyles()`.
8. **`calculateUndervaluedScore()`** — the value-fit score: `quality − price`, where quality is an average of normalized livability signals and price is a normalized sale price (or rent as fallback). Score > 0 means livability exceeds price.

### Key state object

```js
state = {
  datasets,     // raw loaded datasets keyed by DATASETS key
  joined,       // Map<normalizedId, profile>  — the central data model
  selectedId,   // currently inspected planning unit id
  compareIds,   // up to 2 ids for radar chart comparison
  mode,         // "score" | "compare"
  mapMetric,    // which metric drives the choropleth color
  ranges,       // min/max/avg per metric key, computed after all data loads
  chart,        // Chart.js instance (reused, not recreated)
}
```

### Spatial join

Datasets with `join: "spatial"` (metro, parks, air quality, flood risk) are matched by computing the planning unit centroid (`featureCentroid`) and testing point-in-polygon against each feature in the dataset using a ray-casting algorithm (`pointInRing`). For access datasets (metro/parks), `accessScore()` reads `frombreak`/`tobreak` fields to derive a 0/0.5/1 score.

## Dataset IDs

| Key | ID | Content |
|---|---|---|
| boundaries | 266 | Planning unit polygons (join anchor) |
| prices | 624 | Sale and rental prices per m² |
| income | 635 | Income level |
| schools | 593 | NVE school scores |
| metro | 437 | Metro access zones |
| parks | 330 | Park access zones |
| air | 581 | NO2 air quality |
| floodHigh | 446 | High flood risk areas |
| floodMedium | 412 | Medium flood risk areas |
| density | 632 | Building density |
| population | 622 | Population counts |
| permits | 629 | Building permits |

## Debugging dataset joins

The **Dataset status** panel (bottom of the sidebar) shows per-dataset status and which join key was detected. `profile.sources` contains the matched feature (or `null`) for each dataset key. Open the browser console — `state.joined` is globally accessible and shows the full joined profile for any planning unit.
