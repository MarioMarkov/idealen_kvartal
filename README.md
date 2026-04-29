# Sofia District Intelligence

Interactive MapLibre dashboard combining Sofia planning-unit profiles with real estate and livability signals.

## Product idea

Yes, the Neighborhood Profile Explorer and Property Value Explainer fit naturally together. The combined flow is:

1. Click or search a planning unit.
2. Show who lives there and how dense it is: population density, building density, income, schools, and infrastructure.
3. Show what it costs: sale and rental price per square meter.
4. Explain why: compare prices against metro access, parks, air quality, flood overlays, schools, income, and development activity.
5. Flag opportunities: areas with stronger livability signals than their current price level appear as potentially undervalued.

## Run

Run the local app server:

```bash
python3 server.py
```

Then visit `http://127.0.0.1:8081`.

This server does two things:

- Serves `index.html`, `app.js`, and `styles.css`.
- Proxies SofiaPlan dataset requests through `/api/sofiaplan/datasets/{id}` and caches the large responses under `.cache/sofiaplan`.

Use a different port if needed:

```bash
PORT=8082 python3 server.py
```

## Data

The app fetches public SofiaPlan GeoJSON datasets at runtime from `https://api.sofiaplan.bg/datasets/{id}`:

- 266 planning unit boundaries
- 624 sale and rental prices
- 635 income level
- 593 school NVE scores
- 437 metro access
- 330 park access
- 581 NO2 air quality
- 446 and 412 flood risk overlays
- 632 building density
- 622 population
- 629 building permits

The schemas may use different field names, so `app.js` detects join keys and metric fields with a mix of exact and fuzzy matches. The dataset status panel shows what loaded and which join key was found.

## Next steps

- Confirm the exact SofiaPlan dataset IDs and field names for each metric, especially planning-unit boundaries and purchase/rental price columns.
- If the raw API responses are too large for production, add a small backend cache that downloads the datasets once, normalizes them by planning-unit ID, and serves a compact `/planning-units` GeoJSON plus `/profiles/{id}` endpoint.
- Replace the current heuristic value score with weights you can defend for your use case, for example investor yield, family livability, or balanced market value.
