# Metroid Prime 4: Beyond Routing Tool

A lightweight, mobile-first interactive map for tracking collectibles in Metroid Prime 4: Beyond. Built to work well on desktop and mobile with touch-friendly controls and an in-browser routing tool.

## Highlights (current state)

- 🗺️ Pan & zoom (mouse, touch pinch, keyboard)
- 🔍 Multi-resolution tiles (256 → 8192px, auto-loaded)
- 💎 Green Crystals layer (data-driven markers)
- 📍 Custom Markers with persistence via `MarkerUtils` (localStorage + Export / Import)
- 🧭 Routing: in-browser Euclidean TSP solver (nearest-neighbor seed + multi-restart 2‑opt; optional 3‑opt polishing) (localStorage + Export / Import)
- 🧭 Route metadata: normalized route length (map width = 1) shown in sidebar
- ▶ Animated route rendering (dashed stroke with RAF-driven animation)
- 🎛 Data-driven `LAYERS` architecture (add layers without changing rendering code)
- 📱 Mobile-friendly interactions: replaced hover visuals with press states to avoid hover sticking on touch devices
- ▶ Animated route rendering (dashed stroke with RAF-driven animation)
- 🧩 Rendering: split into two stacked canvases so tiles (background)and overlays (routes/markers) render independently
- 🎨 Tileset & Grayscale: UI allows switching between `sat` and `holo`tilesets and a Grayscale toggle — grayscale uses server-side tilefolders (`*_bw`) for reliable mobile behavior
- ⚡ Preload safety: preloaded tile images are tagged and validated toavoid showing stale tiles during tileset switches
- ✨ UX polish: global load-fade overlay added; sidebar opens by default(sidebar collapsed state is not persisted)

## Usage

Open `index.html` in a browser, or serve locally:

```bash
# Python
python -m http.server 8080

# Node.js
npx serve
```

Then visit `http://localhost:8080`.


### Place Markers

- Quick tap / click on empty map space places a custom marker (touch-friendly). Placement only works when the `Custom Markers` layer is visible in the sidebar.
- Custom markers are stored in `LAYERS.customMarkers.markers` and persisted to `localStorage` under the key `mp4_customMarkers`.
- `Export Markers`: downloads your custom markers as JSON (`exported`, `count`, `markers` where each marker is `{ uid, x, y }`). Uses `MarkerUtils.exportCustomMarkers()`.
- `Import Markers`: opens a JSON file and imports markers via `MarkerUtils.importCustomMarkers(file)`; imported markers are validated, deduplicated by UID, persisted, and added to the map.
- `Clear Markers`: removes all custom markers (calls `MarkerUtils.clearCustomMarkers()`); this also updates the map and localStorage.
- Implementation notes: UIDs are generated like `cm01`, `cm02` by `MarkerUtils.generateUID()`; a soft limit (default 50) prevents importing/adding excessive custom markers. See `data/markerUtils.js` for the full API.

### Compute a Route

Use the sidebar `Compute Route` button to compute a closed tour visiting every visible marker (Green Crystals plus any visible Custom Markers). Key points:

- Solver: `tools/tsp_euclid.js` — the improved heuristic used by the sidebar `Compute Route` button: nearest‑neighbor seed + multi‑restart 2‑opt, with optional 3‑opt polishing for stronger results on larger marker sets.
- Result: `map.setRoute()` stores a normalized length (map width = 1) and the route indices; the sidebar displays the normalized length.
- Visibility: when a route is computed the `route` layer is automatically enabled (sidebar toggle checked) so the polyline is visible even if it was previously hidden.
- Computed or imported routes are persisted to `localStorage` under the key `mp4_saved_route`. The stored object contains `points` (ordered array of { x, y }) and `length` (normalized route length, map width = 1).
- Use the `Export Route` button to download the current route as JSON. The exported payload contains `{ exported, count, points, length }` where `exported` is an ISO timestamp, `count` is the number of points, `points` is the ordered array of positions, and `length` is the normalized length. The filename follows the pattern `route-<timestamp>[-<hash>].json` (a hash is added if `MarkerUtils.hashMarkerData` is available).
- Use the `Import Route` button to load a previously exported route JSON (or any JSON with a `points` array of `{x,y}` entries). Imported routes become the current route and are persisted automatically (same `mp4_saved_route` key).
- Clear Route: `Clear Route` shows a confirmation prompt before removing the visualization.
- Clearing the route via the UI will remove the persisted route from `localStorage`.

### Tileset & Grayscale

- Use the tileset selector in the sidebar to switch between `Satellite` and `Holographic` tilesets.
- Toggle `Grayscale` to use the server-provided grayscale tile variants (`sat_bw` / `holo_bw`). Grayscale is applied only to the tiles so routes and markers remain fully colored.
- When switching tilesets or toggling Grayscale the app preloads the new tiles; preloaded images are tagged so the UI will not display tiles from a previously-selected tileset while new tiles are loading.

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
	├── sat/                # satellite tileset
	├── holo/               # holographic tileset
	├── sat_bw/             # satellite grayscale tiles
	└── holo_bw/            # holographic grayscale tiles
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
