# Metroid Prime 4: Beyond Routing Tool

A lightweight, mobile-first interactive map for tracking collectibles in Metroid Prime 4: Beyond. Built to work well on desktop and mobile with touch-friendly controls and an in-browser routing tool.

## Highlights (current state)

- 🗺️ Pan & zoom (mouse, touch pinch, keyboard)
- 🔍 Multi-resolution tiles (256 → 8192px, auto-loaded)
- 💎 Green Crystals layer (data-driven markers)
- 📍 Custom Markers with persistence via `MarkerUtils` (localStorage)
- 🧭 Routing: in-browser Euclidean TSP solver (nearest-neighbor seed + multi-restart 2‑opt; optional 3‑opt polishing)
- ▶ Animated route rendering (dashed stroke with RAF-driven animation)
- 🧭 Route metadata: normalized route length (map width = 1) shown in sidebar
- 🎛 Data-driven `LAYERS` architecture (add layers without changing rendering code)
- 📱 Mobile-friendly interactions: replaced hover visuals with press states to avoid hover sticking on touch devices

## Usage

Open `index.html` in a browser, or serve locally:

```bash
# Python
python -m http.server 8080

# Node.js
npx serve
```

Then visit `http://localhost:8080`.

### Compute a Route

Use the sidebar `Compute Route` button to compute a closed tour visiting every visible marker (Green Crystals plus any visible Custom Markers). Key points:

- Solver: `tools/tsp_euclid.js` — the improved heuristic used by the sidebar `Compute Route` button: nearest‑neighbor seed + multi‑restart 2‑opt, with optional 3‑opt polishing for stronger results on larger marker sets.
- Result: `map.setRoute()` stores a normalized length (map width = 1) and the route indices; the sidebar displays the normalized length.
- Visibility: when a route is computed the `route` layer is automatically enabled (sidebar toggle checked) so the polyline is visible even if it was previously hidden.
- Clear Route: `Clear Route` shows a confirmation prompt before removing the visualization.

## Project Structure

```
├── index.html              # Main HTML document (sidebar + controls)
├── styles.css              # Styling; uses .pressed states for touch
├── map.js                  # Interactive map engine (rendering, interaction, route UI)
├── tools/
│   └── tsp_euclid.js       # Euclidean TSP solver (NN + 2-opt, 3-opt option)
├── data/
│   ├── init.js             # LAYERS bootstrap
│   ├── greenCrystals.js    # Green Crystals layer data
│   ├── customMarkers.js    # Custom markers (data-only)
│   ├── route.js            # Route layer metadata (color, name, icon)
│   └── markerUtils.js      # Marker persistence and import/export helpers
└── tiles/                  # Map tiles (256-8192px)
```

## Data Architecture

All point layers are defined in the global `LAYERS` object. Each layer provides `name`, `icon`, `color`, and a `markers` array. The app renders layers, builds the sidebar, and performs hit-testing dynamically from `LAYERS` so adding new POI layers requires no changes to `map.js`.

Custom markers are pure data in `data/customMarkers.js`; `data/markerUtils.js` centralizes localStorage load/save and import/export behavior.

## Browser Compatibility

- Modern browsers with Canvas 2D API
- Touch and pointer events supported (mobile-friendly)
- LocalStorage for persistence

Tested on Chrome/Edge/Firefox and iOS Safari; mobile-focused changes (pressed states, larger hit targets) improve reliability on touch devices.

## Performance Notes

- Tiles and marker rendering are optimized for visible-region culling
- Routing is computed client-side; the sidebar `Compute Route` button calls the improved solver (nearest‑neighbor seed + multi‑restart 2‑opt with optional 3‑opt polishing).

## License

MIT (see LICENSE)

## Disclaimer

Fan-made tool for personal use. Metroid Prime 4: Beyond and related assets belong to their respective owners.
