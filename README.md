# Sofia District Intelligence

Interactive MapLibre choropleth map of Sofia planning units showing rent prices, air quality, and transit scores.

## Run

```bash
python3 server.py          # http://127.0.0.1:8081
PORT=8082 python3 server.py
```

No build step. Plain HTML/CSS/JS served from disk.

---

## Getting the data

### Planning-unit profiles — `datasets.py`

Fetches three SofiaPlan datasets, joins them per planning unit, and writes `.cache/sofiaplan/profiles.json`:

| Dataset | ID | Field used |
|---|---|---|
| Boundaries (polygons) | 266 | join anchor |
| Rent prices | 624 | `naem_ap_kv_m` (latest year per unit) |
| Air quality (PM10) | 165 | `p1` (latest year per sensor) |

```bash
python3 datasets.py          # rebuilds profiles.json
```

Each raw dataset is cached at `.cache/sofiaplan/{id}.json`. Delete to force re-fetch. The server calls `get_or_build_profiles()` on startup; add `?refresh` to `/api/profiles` to rebuild.

### Transit stops — `sumc.py`

Queries the OpenStreetMap Overpass API for metro stations and surface stops (bus/tram/trolleybus) within Sofia's bounding box `(42.55, 23.18, 42.78, 23.50)`. Results are cached as GeoJSON at `.cache/sumc/metro.geojson` and `.cache/sumc/stops.geojson`.

```bash
python3 sumc.py              # rebuilds both cache files
```

### Real estate listings — `imot_scraper.py`

POSTs to `imot.bg/pcgi/mapgfix.cgi` to get map markers, then fetches detail for each via `mapgfixd.cgi`. Writes `listings.json`.

```bash
python3 imot_scraper.py
```

The `slink` field in `MAP_FORM` expires periodically — refresh it from DevTools Network tab if results come back empty.

---

## Data formats

### `/api/profiles` — composite FeatureCollection

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": { "type": "Polygon", "coordinates": [...] },
    "properties": {
      "id": "123",
      "name": "Лозенец",
      "district": "Триадица",
      "rentPrice": 12.5,
      "airQuality": 28.3,
      "airSamples": 2,
      "metroStops": 3,
      "busStops": 14,
      "transitScore": 17
    }
  }],
  "ranges": {
    "rentPrice":    { "min": 4.1, "max": 22.0, "avg": 10.3, "count": 89, "colorMin": 5.2, "colorMax": 19.8 },
    "airQuality":   { ... },
    "transitScore": { ... }
  },
  "datasets": [{
    "key": "rent", "label": "Цени за наем...", "metric": "rentPrice",
    "metricLabel": "Наем (€/м²)", "datasetId": 624,
    "apiUrl": "https://api.sofiaplan.bg/datasets/624",
    "pageUrl": "https://sofiaplan.bg/portfolio/opendata",
    "rowCount": 89
  }]
}
```

`colorMin`/`colorMax` are the p5/p95 percentiles used for the color ramp (outliers don't blow out the scale).

### `/api/transit/metro` and `/api/transit/stops` — GeoJSON Point features

Metro properties: `osmId`, `name`, `code`, `network`, `line`  
Stop properties: `osmId`, `name`, `code`, `vehicleType` (`bus`/`tram`/`trolleybus`), `operator`

### `listings.json` — array of objects

Each object is the raw imot.bg detail payload plus `{ id, lat, lng }` appended by the scraper.

---

## Putting data on the map

All map logic lives in `app.js` using [MapLibre GL JS](https://maplibre.org/). The base map is OpenStreetMap raster tiles.

### Planning-unit layer (choropleth)

`drawBoundaries()` adds a `geojson` source from the profiles payload. Before adding to the source, `styledGeoJson()` bakes style values into each feature's properties:

```
_fillColor   → colorForFeature()  — linear interpolation between #0f7b55 (good) and #bd4d3f (bad)
_fillOpacity → 0.66 if metric value exists, else 0.18
_lineColor   → white normally, dark (#17201b) when selected
_lineWidth   → 0.8 normally, 2.4 when selected
```

The fill and line layers reference these properties via `["get", "_fillColor"]` etc., so re-styling on metric change is a single `source.setData()` call — no layer recreation.

Color interpolation uses `colorMin`/`colorMax` from `ranges` (p5–p95). For `higherIsBetter` metrics the `t` parameter is flipped so green always means "good".

### Transit and listings layers

`addMetroLayer()`, `addStopsLayer()`, and `loadListingsLayer()` each call `map.addSource()` + `map.addLayer()` with `type: "circle"`. Radius is zoom-interpolated via `["interpolate", ["linear"], ["zoom"], ...]`. Bus stops are inserted *before* the metro layer so metro dots render on top.

Visibility is toggled with `map.setLayoutProperty(layerId, "visibility", "visible"|"none")`.

### API endpoints

| Path | Handler | Cache |
|---|---|---|
| `GET /api/profiles` | `get_or_build_profiles()` | `.cache/sofiaplan/profiles.json` |
| `GET /api/transit/metro` | `get_metro_stations()` | `.cache/sumc/metro.geojson` |
| `GET /api/transit/stops` | `get_surface_stops()` | `.cache/sumc/stops.geojson` |
| `GET /listings.json` | static file | `listings.json` |

All JSON responses are served with `Cache-Control: public, max-age=3600`. Append `?refresh` to any `/api/*` URL to force a rebuild.
