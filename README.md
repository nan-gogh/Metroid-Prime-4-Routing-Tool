# Metroid Prime 4: Beyond Routing Tool

A lightweight, mobile-first interactive map for tracking collectibles in Metroid Prime 4: Beyond. Built to work well on desktop and mobile with touch-friendly controls and an in-browser routing tool.

## Features

### Map Navigation
- 🗺️ **Multi-input pan & zoom**: Mouse drag, touch gestures, pinch-to-zoom, WASD keys, arrow keys
- 🔍 **Adaptive resolution system**: 6 tile resolutions (256px → 8192px) auto-load based on zoom level
- ⌨️ **Keyboard shortcuts**: 
  - `W`/`A`/`S`/`D` or Arrow Keys: Pan (hold Shift for larger steps)
  - `+`/`-` or Scroll: Zoom in/out
  - `0` or `⌂`: Reset view to center
  - `Space`: Toggle sidebar
  - `1`: Switch to Satellite tileset
  - `2`: Switch to Holographic tileset
  - `G`: Toggle Grayscale mode
- 🎯 **Responsive zoom controls**: On-screen buttons for zoom in/out/reset
- 🔄 **Sidebar toggle**: Collapsible sidebar with animated handle (sidebar state not persisted)

### Tileset System
- 🎨 **Dual tilesets**: Satellite (`sat`) and Holographic (`holo`) map variants
- 🌑 **Grayscale mode**: Server-side grayscale tiles (`sat_bw` / `holo_bw`) preserve colored markers/routes
- 💾 **Persistence**: Tileset and grayscale preferences saved to `localStorage`
- ⚡ **Smart preloading**: Generation-tagged tile loading prevents stale tiles during tileset switches
- 🚫 **Abort controllers**: In-flight tile fetches are cancelled when switching tilesets

### Marker System
- 💎 **Green Crystals layer**: 154 pre-defined collectible markers with position-based UIDs
- 📍 **Custom Markers**: User-placed markers with tap/click placement
  - Quick tap on empty map space places a marker (when Custom Markers layer is visible)
  - Max limit: 50 custom markers (configurable)
  - Position-based UID generation: deterministic hash from coordinates (`cm_xxxxxxxx` format)
  - Layer-defined prefixes: Each layer specifies its own UID prefix (`cm` for custom, `gc` for green crystals)
  - UIDs regenerated on import for backward compatibility with legacy files
- 🎛️ **Layer visibility toggles**: Show/hide individual marker layers independently
- 🎨 **Data-driven architecture**: All layers defined in global `LAYERS` object with `name`, `icon`, `color`, `prefix`, and `markers`
- 📊 **Live marker counts**: Sidebar displays count for each layer dynamically

### Marker Interactions
- 🖱️ **Hover tooltips**: Display marker info on mouse hover
- 👆 **Touch-friendly hit detection**: Larger hit padding for mobile taps
- 🔘 **Selected marker state**: Click/tap to pin a persistent tooltip
- 🗑️ **Delete custom markers**: Click selected custom marker to remove it
- 📍 **Marker rendering**: Adaptive sizing based on zoom level with icon support

### Custom Marker Persistence
- 💾 **LocalStorage auto-save**: Custom markers persist across sessions (`mp4_customMarkers` key)
- 📤 **Export**: Download markers as JSON with timestamp + data hash filename
  - Format: `{ exported, count, markers: [{ uid, x, y }] }`
- 📥 **Import**: Load markers from JSON file
  - Validates marker data (requires numeric x/y)
  - Regenerates UIDs from coordinates for deterministic positioning
  - Hash collision handling with counter suffix
  - Respects max marker limit during import
- 🧹 **Clear All**: Remove all custom markers with confirmation prompt

### Routing System
- 🧭 **Euclidean TSP Solver** (`tools/tsp_euclid.js`):
  - Nearest-neighbor seeding for initial tour
  - Multi-restart 2-opt local search
  - Optional 3-opt polishing for larger marker sets
  - Closed tour visiting all visible markers (Green Crystals + Custom Markers)
- 📏 **Normalized route length**: Distance displayed with map width = 1 for coordinate-system independence
- ▶️ **Animated route rendering**: 
  - Dashed stroke with RAF-driven animation
  - Configurable animation speed (100 pixels/second default)
  - Direction persists across sessions
- 🔄 **Reverse Direction**: Toggle route animation direction (forward/backward)
- 🎨 **Visual styling**: Adaptive stroke width scales with zoom level
- 💾 **Route persistence**: Saved to `localStorage` (`mp4_saved_route` key)
- 📤 **Export route**: JSON format with `{ exported, count, points: [{x,y}], length }`
- 📥 **Import route**: Load previously exported routes
- 🗑️ **Clear route**: Remove route visualization with confirmation
- 🔄 **Auto-enable route layer**: Route layer automatically enabled when computing/importing

### Performance Optimization
- 🧩 **Dual canvas architecture**: Separate canvases for tiles (background) and overlays (routes/markers)
- 🎯 **Visible-region culling**: Only render markers/route segments in viewport
- ⚙️ **Low-spec mode**: 
  - Auto-detects devices with ≤1.5GB RAM or ≤2 CPU cores
  - Reduces bitmap decoder concurrency (2 → 1)
  - Limits tile preloading
  - Manual toggle in Dev Tools
- 🚀 **ImageBitmap decoding**: Modern browsers use `createImageBitmap` with fetch API
  - Fallback to `<img>` elements for older browsers
  - Concurrent bitmap decoder queue with timeout protection (15s)
  - AbortController support for cancellable fetches
- 📊 **Dev Tools panel**: Live stats for decoders, queue depth, active fetches, cached bitmaps

### User Experience
- 📱 **Mobile-first design**: Touch-optimized controls with pressed states (no sticky hover)
- 🚫 **Double-tap zoom prevention**: Disabled on UI elements, works only on map canvas
- ✨ **Loading fade overlay**: Smooth fade-out on page load
- 🎨 **Responsive layout**: Sidebar adapts to screen size
- 🔔 **Status bar**: Real-time display of current zoom level and active tile resolution
- ℹ️ **Keyboard hints**: On-screen reference for all shortcuts
- 🎯 **Accessibility**: ARIA labels, semantic HTML, keyboard navigation support

### Technical Architecture
- 🏗️ **Modular structure**: Separated concerns (map engine, data, utilities, solver)
- 🔄 **Event-driven**: Pointer events for unified mouse/touch handling
- 📦 **No dependencies**: Pure vanilla JavaScript, no frameworks
- 🌐 **Browser compatibility**: Modern Canvas 2D API, tested on Chrome/Edge/Firefox/iOS Safari
- 💾 **LocalStorage integration**: Markers, routes, preferences persist automatically

## Usage

Open `index.html` in a browser, or serve locally:

```bash
# Python
python -m http.server 8080

# Node.js
npx serve
```

Then visit `http://localhost:8080`.

### Navigation Controls

**Mouse/Trackpad:**
- Drag to pan
- Scroll to zoom
- Click marker to select/deselect (shows persistent tooltip)
- Click selected custom marker to delete

**Touch:**
- Drag to pan
- Pinch to zoom
- Tap marker to select/deselect
- Tap selected custom marker to delete
- Quick tap on empty space places custom marker (when Custom Markers layer visible)

**Keyboard:**
- `W`/`A`/`S`/`D` or Arrow Keys: Pan map
- `Shift` + Arrow/WASD: Pan faster
- `+` / `-`: Zoom in/out
- `0` or `⌂`: Reset view
- `Space`: Toggle sidebar
- `1`: Switch to Satellite tileset
- `2`: Switch to Holographic tileset  
- `G`: Toggle Grayscale mode

### Place Markers

- **Quick placement**: Tap/click empty map space (only when `Custom Markers` layer is visible)
- **UID system**: Each marker gets a deterministic position-based UID (e.g., `cm_a3f7b2c9`)
  - Same coordinates always generate the same UID
  - Format: `{prefix}_{8-char-hex-hash}` where prefix is layer-defined (`cm` for custom, `gc` for green crystals)
- **Max limit**: 50 custom markers (configurable in `map.layerConfig.customMarkers.maxMarkers`)
- **Persistence**: Auto-saved to `localStorage` under key `mp4_customMarkers`
- **Delete**: Click/tap a selected custom marker to remove it
- **Export Markers**: Downloads JSON file with timestamp + data hash filename
  - Format: `{ exported, count, markers: [{ uid, x, y }] }`
  - Filename: `custom-markers-{timestamp}-{hash}.json`
- **Import Markers**: 
  - Load JSON file via file picker
  - Validates markers (requires numeric x/y coordinates)
  - Regenerates UIDs from coordinates (backward compatible with legacy sequential UIDs)
  - Handles hash collisions with counter suffix
  - Stops at max limit
- **Clear Markers**: Removes all custom markers after confirmation
  - Updates localStorage and re-renders map

### Compute a Route

Use the sidebar `Compute Route` button to solve a Traveling Salesman Problem tour visiting all visible markers.

**Solver Algorithm:**
- Nearest-neighbor heuristic for initial tour seeding
- Multi-restart 2-opt local search (default: 5 restarts)
- Optional 3-opt polishing for larger marker sets (improves solution quality)
- Implementation: `tools/tsp_euclid.js`

**Route Features:**
- **Normalized length**: Distance displayed with map width = 1 (coordinate-system independent)
- **Animated visualization**: Dashed stroke with requestAnimationFrame-driven offset animation
- **Direction control**: `Reverse Direction` button toggles forward/backward animation
  - Direction persists to localStorage (`routeDir` key)
- **Auto-enable layer**: Route layer automatically becomes visible when computed/imported
- **Persistence**: Route saved to `localStorage` (`mp4_saved_route` key)
  - Stored as: `{ points: [{x,y}], length }`
- **Export Route**: Downloads JSON with metadata
  - Format: `{ exported, count, points, length }`
  - Filename: `route-{timestamp}[-{hash}].json`
- **Import Route**: Load previously exported route JSON
  - Requires `points` array with `{x,y}` entries
  - Automatically persists imported route
- **Clear Route**: Removes route visualization after confirmation
  - Clears localStorage entry

### Tileset & Grayscale

- **Tileset selector**: Switch between `Satellite` and `Holographic` map variants
  - Satellite: Photorealistic satellite imagery style
  - Holographic: Stylized holographic/tactical display
- **Grayscale toggle**: Uses server-side grayscale tile variants (`sat_bw` / `holo_bw`)
  - Only affects tiles; routes and markers remain fully colored
  - Improves visibility in certain lighting conditions
- **Smart loading**: 
  - Tiles preloaded with generation tags to prevent showing stale images during switches
  - In-flight fetches cancelled via AbortController when switching tilesets
  - Auto-detects needed resolution based on current zoom level
- **Persistence**: Tileset and grayscale preferences saved to localStorage
  - Keys: `mp4_tileset`, `mp4_tileset_grayscale`

### Low-Spec Mode (Dev Tools)

Toggle in the Dev Tools panel to reduce resource usage on constrained devices:
- **Auto-detection**: Automatically enabled on devices with ≤1.5GB RAM or ≤2 CPU cores
- **Concurrency reduction**: Bitmap decoder limit reduced from 2 → 1
- **Preload limiting**: Fewer tiles preloaded simultaneously
- **Manual override**: Can be toggled manually in Dev Tools sidebar
- **Live stats**: Monitor decoder activity, queue depth, active fetches, cached bitmaps

## Project Structure

```
├── index.html              # Main HTML document (sidebar + controls)
├── styles.css              # Styling (pressed states for touch, responsive layout)
├── map.js                  # Interactive map engine (rendering, interaction, route UI)
├── tools/
│   └── tsp_euclid.js       # Euclidean TSP solver (NN + 2-opt, 3-opt option)
├── data/
│   ├── init.js             # LAYERS bootstrap
│   ├── greenCrystals.js    # Green Crystals layer (154 markers with gc_ UIDs)
│   ├── customMarkers.js    # Custom markers layer definition
│   ├── route.js            # Route layer metadata (color, name, icon)
│   └── markerUtils.js      # Marker persistence, import/export, UID generation
└── tiles/                  # Map tiles (256-8192px AVIF format)
    ├── sat/                # Satellite tileset
    ├── holo/               # Holographic tileset
    ├── sat_bw/             # Satellite grayscale tiles
    └── holo_bw/            # Holographic grayscale tiles
```

## Data Architecture

All point layers are defined in the global `LAYERS` object. Each layer provides:
- `name`: Display name for sidebar
- `icon`: Emoji or text icon
- `color`: Hex color for rendering
- `prefix`: UID prefix for position-based identifiers (e.g., `"cm"`, `"gc"`)
- `markers`: Array of marker objects `{ uid, x, y }`

**Coordinate system**: Normalized 0-1 range where map width and height = 1

The app renders layers, builds the sidebar, and performs hit-testing dynamically from `LAYERS`, so adding new POI layers requires no changes to `map.js`.

**Custom markers** are pure data in `data/customMarkers.js`; `data/markerUtils.js` centralizes:
- localStorage load/save (`mp4_customMarkers` key)
- Import/export with JSON format validation
- Position-based UID generation with DJB2-like hash algorithm
- Collision handling with counter suffix (`{uid}_1`, `{uid}_2`, etc.)

**UID Generation**: `MarkerUtils.generateUID(x, y, prefix)`
- Hashes coordinates to 8-character hex string: `{prefix}_{hash}`
- Deterministic: same coordinates always produce same UID
- Enables position-based deduplication and tracking
- Future-proof: allows transition from regeneration to stored UIDs for comparisons

## Browser Compatibility

**Requirements:**
- Modern browsers with Canvas 2D API
- Touch and pointer events (mobile-friendly)
- LocalStorage for persistence
- Optional: `createImageBitmap` for optimized tile decoding (fallback to `<img>`)

**Tested on:**
- Chrome/Edge (Desktop & Android)
- Firefox (Desktop & Android)  
- Safari (macOS & iOS)

**Mobile optimizations:**
- Pressed states replace hover effects (no sticky hover)
- Larger hit targets for touch (configurable padding)
- Pinch-to-zoom gesture support
- Auto-detection of low-spec devices (≤1.5GB RAM or ≤2 cores)

## Performance Notes

**Rendering optimizations:**
- Dual canvas architecture: tiles on background canvas, routes/markers on overlay
- Visible-region culling: only draw markers/route segments in viewport
- Adaptive resolution: 6 tile sizes auto-selected based on zoom level
- Stale tile prevention: generation tags ensure old tiles never display after tileset switch

**Loading optimizations:**
- Staggered tile preloading to avoid network/decoder bursts (150ms intervals)
- AbortController for cancellable fetches when switching tilesets
- Bitmap decode queue with concurrency limit (2 concurrent, 1 on low-spec)
- 15-second timeout protection for bitmap operations
- ImageBitmap caching for instant re-display at visited zoom levels

**Routing performance:**
- Client-side TSP solving (no server required)
- Efficient heuristics: O(n²) nearest-neighbor + O(n²) 2-opt per restart
- Optional 3-opt for diminishing returns on large sets (typically <200 markers)
- Route animation via RAF (60fps target) with zoom-scaled speed

## License

MIT (see LICENSE)

## Disclaimer

Fan-made tool for personal use. Metroid Prime 4: Beyond and related assets belong to their respective owners.
