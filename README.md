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
  - `3`: Toggle Grayscale mode
  - `Q`: Toggle Edit Route mode
  - `E`: Toggle Edit Markers mode
  - `C`: Expand Route (add nearby markers to existing route)
  - `Y`: Clear Route
  - `X`: Clear Custom Markers
  - `<`: Reverse Route direction
- 🎯 **Responsive zoom controls**: On-screen buttons for zoom in/out/reset
- 🔄 **Sidebar toggle**: Collapsible sidebar with animated handle (sidebar state not persisted)

### Tileset System
- 🎨 **Dual tilesets**: Satellite (`sat`) and Holographic (`holo`) map variants
- 🌑 **Grayscale mode**: Server-side grayscale tiles (`sat_bw` / `holo_bw`) preserve colored markers/routes
- 💾 **Persistence**: Tileset and grayscale preferences saved to `localStorage` (when consent enabled)
- ⚡ **Smart preloading**: Generation-tagged tile loading prevents stale tiles during tileset switches
- 🚫 **Abort controllers**: In-flight tile fetches are cancelled when switching tilesets

### Grid Overlay
- ▫ **Toggleable grid overlay**: An 8x8 grid can be toggled from the sidebar to help plan routes and reference areas. Grid lines are drawn in cyan for high contrast on both tilesets.

### Marker System
- 💎 **20 Collectible Layers**: Comprehensive marker coverage for all Sol Valley collectibles
  - **GE Crystallization** (3 phases): 394 total markers across spawning phases
  - **Gibardaum Rock**: 16 markers
  - **Kyuveria Plant**: Plant collectibles
  - **Energy Tank**: 3 markers
  - **Boost Tank**: 3 markers
  - **Shot Upgrade**: Weapon upgrades
  - **Missile Expansion**: Missile capacity upgrades
  - **Shot Expansion**: Shot capacity upgrades
  - **Bomb Expansion**: Bomb capacity upgrades
  - **Mech Part**: Mechanical components
  - **Area Entrance**: 6 entrance locations
  - **Save Station**: Save point locations
  - **Shrine Lift**: Shrine access points
  - **Tokabi's Camp**: Story locations
  - **Scout Bot**: Scout bot encounters
  - **GF Debris**: Galactic Federation debris
  - **Custom Markers**: User-placed markers (max 50)
- 📍 **Custom Markers**: User-placed markers with tap/click placement
  - Quick tap on empty map space places a marker (when Custom Markers layer is visible and Edit Markers mode active)
  - Max limit: 50 custom markers (configurable)
  - Position-based UID generation: deterministic hash from coordinates (`cm_xxxxxxxx` format)
  - Layer-defined prefixes: Each layer specifies its own UID prefix
  - UIDs regenerated on import for backward compatibility with legacy files
- 🎛️ **Layer visibility toggles**: Show/hide individual marker layers independently with Show All/Hide All buttons
- 🎨 **Data-driven architecture**: All layers defined in global `LAYERS` object with `name`, `icon`, `color`, `prefix`, and `markers`
- 📊 **Live marker counts**: Sidebar displays count for each layer dynamically

### Marker Interactions
- 🖱️ **Hover tooltips**: Display marker info on mouse hover
- 👆 **Touch-friendly hit detection**: Larger hit padding for mobile taps
- 🔘 **Selected marker state**: Click/tap to pin a persistent tooltip
- 🗑️ **Delete custom markers**: Click selected custom marker to remove it (in Edit Markers mode)
- 📍 **Marker rendering**: Adaptive sizing based on zoom level with emoji icon support
- 🎯 **Route waypoint editing**: In Edit Route mode, click route waypoints to toggle their inclusion in the route
- ✨ **Segment insertion preview**: Hover near route segments to see preview of where a new waypoint would be inserted
- 🖱️ **Smart cursor**: Pointer cursor appears when hovering markers or route segments in edit modes

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

### Privacy & Local Storage Consent
- 🔒 **Local Storage Consent**: Non-essential persistence (map view, tileset preferences, custom markers, and route data) is gated behind a user-controlled consent toggle in the sidebar. A cyan-colored toggle button is located at the bottom of the sidebar above the Controls hint button. Enabling the toggle allows the app to save data locally (device-only).
- 💾 **Map view persistence**: When consent is enabled, the current map pan and zoom are saved and restored on reload so you return to the same view.
- 🧾 **Route loop preference**: The route looping behavior is controlled by the Loop Route button and persisted across sessions when consent is enabled.
- 🗂️ **Layer visibility**: When consent is enabled, the sidebar's layer visibility state is saved so which marker layers you had shown/hidden will be restored on reload.
- 🗺️ **Tileset & Grayscale preferences**: Tileset choice and the grayscale toggle are persisted when consent is enabled, returning you to the same map style on subsequent visits.
- 🎨 **No tracking**: All data stays on your device; no analytics or external tracking.

### Routing System
- 🧭 **Dual Routing Algorithms**:
  - **Compute Route**: Full TSP solver using visible markers (`tools/tsp_euclid.js`)
    - Nearest-neighbor seeding for initial tour
    - Multi-restart 2-opt local search
    - Optional 3-opt polishing for larger marker sets
    - Closed tour visiting all visible markers (all enabled layers)
  - **Expand Route**: Intelligent route expansion adding nearby markers
    - Per-segment candidate selection within fixed distance
    - Fixed-endpoint TSP solving for each segment
    - Dynamic programming for small segments (≤14 intermediates)
    - Greedy fallback for large segments to prevent OOM
    - Preserves route waypoint order
- 🎨 **Edit Route Mode**: Interactive route editing with visual feedback
  - Click existing markers to toggle route membership
  - Drag route waypoints to reposition or snap to nearby markers
  - Click and drag route segments to insert new waypoints
  - Transient preview dot follows cursor when hovering near segments
  - Full undo via pointercancel or releasing outside valid snap targets
- 📏 **Normalized route length**: Distance displayed with map width = 1 for coordinate-system independence
- ▶️ **Animated route rendering**: 
  - Dashed stroke with RAF-driven animation
  - Configurable animation speed (100 pixels/second default)
  - Cyan color matching UI theme
- 🔄 **Route controls**:
  - **Loop Route**: Toggle to close the route into a loop
  - **Reverse Route**: Reverse waypoint order and animation direction
  - **Expand Route**: Add nearby markers using intelligent segment insertion
  - **Clear Route**: Remove route with confirmation
- 🔒 **Computing lock**: UI interactions blocked during route computation to prevent race conditions
- 🎨 **Visual styling**: Adaptive stroke width scales with zoom level
- 💾 **Route persistence**: Saved to `localStorage` when consent enabled
- 📤 **Export route**: JSON format with `{ exported, count, points: [{x,y}], length }`
- 📥 **Import route**: Load previously exported routes
- 🎯 **Auto-enable route layer**: Route layer automatically enabled when computing/importing

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
- 🔔 **Dev Tools panel**: Real-time display of current zoom level, active tile resolution, decoder stats
- ℹ️ **Keyboard hints overlay**: Collapsible on-screen reference for all shortcuts with cyan-styled keys
- 🎨 **Cyan UI theme**: Section titles with glow effect, consistent color scheme throughout
- 🎯 **Accessibility**: ARIA labels, semantic HTML, keyboard navigation support
- 🖱️ **Smart cursor feedback**: Pointer cursor for interactive elements, grab/grabbing for pan

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

The sidebar includes a **Links** section with quick access to the project's GitHub repository and a Discord community invite.

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
- `3`: Toggle Grayscale mode
- `Q`: Toggle Edit Route mode
- `E`: Toggle Edit Markers mode
- `C`: Expand Route (add nearby markers)
- `Y`: Clear Route
- `X`: Clear Custom Markers
- `<`: Reverse Route direction
- `Escape`: Exit any edit mode

### Place Markers

- **Edit mode**: Enable "Edit Markers" mode via sidebar button or `E` key
- **Quick placement**: Tap/click empty map space (only when Edit Markers mode is active)
- **UID system**: Each marker gets a deterministic position-based UID (e.g., `cm_a3f7b2c9`)
  - Same coordinates always generate the same UID
  - Format: `{prefix}_{8-char-hex-hash}` where prefix is layer-defined
- **Max limit**: 50 custom markers (configurable in `map.layerConfig.customMarkers.maxMarkers`)
- **Persistence**: Auto-saved to `localStorage` when consent enabled
- **Delete**: In Edit Markers mode, click/tap a selected custom marker to remove it
- **Drag**: In Edit Markers mode, drag custom markers to reposition them
- **Export Markers**: Downloads JSON file with timestamp + data hash filename
  - Format: `{ exported, count, markers: [{ uid, x, y }] }`
  - Filename: `markers-{timestamp}-{hash}.json`
- **Import Markers**: 
  - Load JSON file via file picker
  - Validates markers (requires numeric x/y coordinates)
  - Regenerates UIDs from coordinates (backward compatible with legacy sequential UIDs)
  - Handles hash collisions with counter suffix
  - Stops at max limit
- **Clear Markers**: Removes all custom markers after confirmation

### Compute & Edit Routes

**Compute Route** solves a Traveling Salesman Problem tour visiting all visible markers:
- Uses multi-restart 2-opt with optional 3-opt polishing
- Visits all markers from enabled layers
- Automatically enables the route layer
- Locks UI during computation to prevent race conditions

**Expand Route** adds nearby markers to an existing route:
- Intelligently inserts markers into route segments
- Uses per-segment TSP solving with fixed endpoints
- Configurable distance threshold
- Preserves existing waypoint order

**Edit Route Mode** (toggle with `Q` key or sidebar button):
- **Visual feedback**: Semi-transparent cyan overlay appears when active
- **Toggle waypoints**: Click markers to add/remove them from the route
- **Drag waypoints**: Click and drag existing route waypoints
  - Drag to reposition as free-floating waypoint
  - Snap to nearby markers to replace with that marker
  - Release outside snap range to cancel (route restored)
- **Insert waypoints**: Click and drag route segments
  - Preview dot shows insertion point as you hover
  - Drag to place new waypoint at any position
  - Snap to nearby markers or place at arbitrary coordinates
- **Pointer cursor**: Automatically appears when hovering waypoints or segments

**Route Controls:**
- **Loop Route**: Toggle to close the route into a continuous loop
- **Reverse Route** (`<` key): Reverse waypoint order and animation direction  
- **Export Route**: Save as JSON with metadata
- **Import Route**: Load previously exported route
- **Clear Route** (`Y` key): Remove route after confirmation

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
├── styles.css              # Styling (cyan theme, pressed states, responsive layout)
├── map.js                  # Interactive map engine (rendering, interaction, route UI, edit modes)
├── tools/
│   └── tsp_euclid.js       # Euclidean TSP solver (NN + 2-opt, 3-opt option)
├── data/
│   ├── init.js             # LAYERS bootstrap
│   ├── markerUtils.js      # Marker persistence, import/export, UID generation
│   ├── routeUtils.js       # Route utilities (export, import, clearing)
│   ├── storageHelper.js    # LocalStorage consent gating
│   └── layers/
│       ├── geCrystallization1.js   # GE Crystal Phase 1 (84 markers, gc1_ UIDs)
│       ├── geCrystallization2.js   # GE Crystal Phase 2 (135 markers, gc2_ UIDs)
│       ├── geCrystallization3.js   # GE Crystal Phase 3 (175 markers, gc3_ UIDs)
│       ├── gibardaumRock.js        # Gibardaum Rock (16 markers, gr_ UIDs)
│       ├── kyuveriaPlant.js        # Kyuveria Plant collectibles
│       ├── energyTank.js           # Energy Tanks (3 markers, et_ UIDs)
│       ├── boostTank.js            # Boost Tanks (3 markers, bt_ UIDs)
│       ├── shotUpgrade.js          # Shot Upgrades
│       ├── missileExpansion.js     # Missile Expansions
│       ├── shotExpansion.js        # Shot Expansions
│       ├── bombExpansion.js        # Bomb Expansions
│       ├── mechPart.js             # Mech Parts
│       ├── areaEntrance.js         # Area Entrances (6 markers, ae_ UIDs)
│       ├── saveStation.js          # Save Stations
│       ├── shrineLift.js           # Shrine Lifts
│       ├── tokabisCamp.js          # Tokabi's Camp locations
│       ├── scoutBot.js             # Scout Bot encounters
│       ├── gfDebris.js             # GF Debris
│       ├── customMarkers.js        # Custom markers layer definition
│       └── route.js                # Route layer metadata (color, name, icon)
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

**Crystallization layers** (`data/layers/geCrystallization*.js`):
- Extracted from PNG images using connected components analysis with color-based filtering
- Tolerance: ±12 RGB deviation from target green (#6ac77e)
- Clustering: 15px distance threshold for marker aggregation
- Each layer maintains unique prefix (`gc1_`, `gc2_`, `gc3_`) for distinction
- Position-based UID generation from coordinates ensures deterministic identification

**All collectible layers** follow the same structure with unique prefixes and markers extracted from game data.

**Custom markers** are pure data in `data/customMarkers.js`; `data/markerUtils.js` centralizes:
- localStorage load/save with consent gating
- Import/export with JSON format validation
- Position-based UID generation with DJB2-like hash algorithm
- Collision handling with counter suffix (`{uid}_1`, `{uid}_2`, etc.)
- Drag-and-drop repositioning in Edit Markers mode

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

## Contributors

This tool was developed with contributions from:
- **Cryptic Jacknife** - Crystal data extraction GOAT
- **Supreme Dirt** - Crystal data extraction
- **Meta_X** - Crystal data extraction
- **rekameohs** - Image data contribution
- **Tal** - Spark ignition

## Changelog

### v0.6.0 - Enhanced Routing & Edit Modes
- **Edit Route Mode**: Interactive waypoint editing with drag-and-drop, segment insertion, and snap-to-marker functionality
- **Edit Markers Mode**: Drag custom markers to reposition them with visual feedback
- **Expand Route**: Intelligent route expansion algorithm adds nearby markers using per-segment TSP
- **Route preview**: Transient preview dot follows cursor when hovering near route segments
- **Keyboard shortcuts expanded**: Q/E for edit modes, C for Expand Route, Y for Clear Route, X for Clear Markers, < for Reverse Route
- **Computing overlay**: Full-screen lock during route computation prevents race conditions
- **Loop Route control**: Explicit UI toggle for route looping behavior
- **17 collectible layers**: Added comprehensive marker coverage beyond GE Crystallization
- **Cyan UI theme**: Section title glows, consistent color scheme, enhanced visual hierarchy
- **Storage consent UI**: Relocated to sidebar bottom with matching control styling

### v0.5.0 - Infrastructure & Routing Enhancements
- **Three GE Crystallization Layers**: Added Layer 1 (84 markers), Layer 2 (135 markers), and Layer 3 (175 markers) for a total of 394 unique collectible markers across all crystallization phases
- **Project structure refactor**: Reorganized layer definition files into dedicated `data/layers/` subfolder for improved code organization and maintainability

## License

MIT (see LICENSE)

## Disclaimer

Fan-made tool for personal use. Metroid Prime 4: Beyond and related assets belong to their respective owners.
