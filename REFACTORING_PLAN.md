# Metroid Prime 4 Routing Tool - Refactoring Plan

## Executive Summary

This document outlines a comprehensive refactoring strategy for the Metroid Prime 4 Routing Tool. The primary goal is to improve code maintainability, reduce duplication, and enhance modularity **without changing the application's appearance, features, or user-end-result**.

The codebase currently suffers from a **6,012-line "god class"** (`InteractiveMap` in `map.js`) that handles all responsibilities from rendering to input handling to persistence. This plan proposes decomposing it into focused, testable modules while preserving the script-tag-based architecture (no bundler required).

---

## Table of Contents

1. [Current Architecture Analysis](#current-architecture-analysis)
2. [Identified Issues](#identified-issues)
3. [Proposed Module Structure](#proposed-module-structure)
4. [Detailed Refactoring Recommendations](#detailed-refactoring-recommendations)
5. [Implementation Roadmap](#implementation-roadmap)
6. [Risk Mitigation](#risk-mitigation)

---

## Current Architecture Analysis

### File Structure Overview

| File | Lines | Purpose | Coupling Level |
|------|-------|---------|----------------|
| `map.js` | 6,012 | **God class** - everything | Critical |
| `markerUtils.js` | 443 | Custom marker CRUD | Moderate |
| `routeUtils.js` | ~200 | Route persistence | Moderate |
| `storageHelper.js` | ~75 | LocalStorage wrapper | Low |
| `init.js` | 5 | Global LAYERS init | Low |
| `tsp_euclid.js` | 238 | TSP solver | Isolated |
| `styles.css` | 1,556 | All styling | N/A |
| Layer files (22) | ~50-100 each | Static marker data | Low |

### InteractiveMap Class Responsibilities (God Class)

The `InteractiveMap` class in `map.js` currently handles **all** of the following:

1. **Canvas Management** (3 canvases: tiles, heatmap, overlay)
2. **Tile Loading & Caching** (resolution switching, ImageBitmap decoding)
3. **Rendering Pipeline** (tiles, heatmap, grid, markers, route, edit overlays)
4. **Input Handling** (mouse, touch, keyboard, wheel, pinch-zoom)
5. **Marker Management** (visibility, hit-testing, selection, tooltips)
6. **Route Management** (editing, animation, computation)
7. **State Persistence** (localStorage integration)
8. **UI Integration** (sidebar controls, checkboxes, buttons, modals)
9. **Coordinate Transformations** (world ↔ screen conversions)
10. **Heatmap Computation** (crystal counting, HSL color mapping)

### Data Flow

```
index.html
    ↓ loads
LAYERS (global) ← Layer files (22 scripts)
    ↓
InteractiveMap (constructor)
    ↓ wires up
DOM elements (sidebar, controls, canvases)
    ↓
init() function (~2,800 lines of UI wiring)
```

---

## Identified Issues

### 🔴 Critical Issues

#### 1. God Class Anti-Pattern
- **File:** `map.js`
- **Problem:** Single 6,012-line class with 10+ distinct responsibilities
- **Impact:** Impossible to test individual features, high cognitive load, merge conflicts
- **Evidence:** Constructor alone is ~200 lines; `init()` function is ~2,800 lines

#### 2. Duplicated "greenKeys" Arrays
- **Files:** `map.js` (lines 2373, 2510, 4025)
- **Problem:** The same array `['geCrystallization1', 'geCrystallization2', 'geCrystallization3', 'gibardaumRock']` is defined in 3 separate locations
- **Impact:** Easy to forget updating one location; already required 3 separate edits for the Gibardaum Rock addition
- **Fix:** Extract to a single constant `GREEN_CRYSTAL_LAYERS`

#### 3. Hardcoded Magic Numbers
- **Locations:** Throughout `map.js`
- **Examples:**
  - `8192` (MAP_SIZE) appears ~20+ times
  - `256`, `512`, `1024`, `2048`, `4096` (tile resolutions)
  - `65` (heatmap blob radius)
  - `0.7` (heatmap overlay opacity)
  - Grid cell sizes, marker radii, animation durations
- **Impact:** Changing any constant requires find-and-replace across thousands of lines

#### 4. Inline UI Wiring in init()
- **Location:** `map.js` lines 3200-6012
- **Problem:** ~2,800 lines of event listener setup mixed with business logic
- **Impact:** Cannot reuse UI patterns; difficult to modify sidebar behavior

### 🟡 Moderate Issues

#### 5. Tight Coupling to Global `map` Variable
- **Files:** `markerUtils.js`, `routeUtils.js`
- **Problem:** Utility modules directly reference global `map` variable via `typeof map !== 'undefined'`
- **Impact:** Cannot test utilities in isolation; circular dependency risk
- **Evidence:** `markerUtils.js` has 8 references to `typeof map`, `routeUtils.js` has similar patterns

#### 6. Mixed Rendering Logic
- **Location:** `map.js` rendering methods
- **Problem:** Tile rendering, heatmap, grid overlay, markers, and route are interleaved
- **Impact:** Cannot optimize individual render passes; difficult to add new visual layers

#### 7. Redundant Error Handling Patterns
- **Location:** Throughout all JS files
- **Problem:** Repetitive `try { ... } catch (e) {}` blocks with empty catches
- **Evidence:** `markerUtils.js` has 20+ empty catch blocks
- **Impact:** Silent failures; difficult to debug issues

#### 8. Inconsistent Persistence Patterns
- **Files:** `markerUtils.js`, `routeUtils.js`, `map.js`
- **Problem:** Three different patterns for localStorage access:
  1. Direct `localStorage.getItem/setItem`
  2. Via `_mp4Storage` helper
  3. Via `MarkerUtils.saveToLocalStorage()`
- **Impact:** Inconsistent consent handling; potential data loss

### 🟢 Minor Issues

#### 9. Legacy Compatibility Code
- **Files:** `markerUtils.js` (lines 300-340), `routeUtils.js` (legacy upgrade)
- **Problem:** Code for upgrading legacy marker/route formats
- **Impact:** Technical debt; could be removed after sufficient time

#### 10. Unused Variables and Dead Code Paths
- **Location:** Various
- **Examples:**
  - `GE_CRYSTALLIZATION_1` constant exported but never used
  - Several commented-out `// log removed` lines
  - Unused `cloneTour()` function in TSP solver

#### 11. Inconsistent Naming Conventions
- **Examples:**
  - `_routeSources` (underscore prefix for "private")
  - `currentRoute` (no underscore)
  - `MAP_SIZE` vs `this.mapSize`
  - Function names: `renderDetailGrid` vs `_updateGridQuadLabels`

#### 12. Large CSS File
- **File:** `styles.css` (1,556 lines)
- **Problem:** Single file for all styles
- **Impact:** Difficult to find relevant styles; potential for selector conflicts

---

## Proposed Module Structure

### Phase 1: Extract Constants and Configuration

```
data/
├── config.js           (NEW) - All constants and configuration
├── init.js
├── markerUtils.js
├── routeUtils.js
├── storageHelper.js
└── layers/
    └── ... (unchanged)
```

**config.js contents:**
```javascript
const MP4Config = {
    MAP_SIZE: 8192,
    TILE_RESOLUTIONS: [256, 512, 1024, 2048, 4096, 8192],
    
    HEATMAP: {
        BLOB_RADIUS: 65,
        OVERLAY_OPACITY: 0.7,
        MAX_CRYSTAL_COUNT: 16,
        HUE_RANGE: { MIN: 0, MAX: 120 }
    },
    
    GRID: {
        ROWS: 8,
        COLS: 8
    },
    
    LAYERS: {
        GREEN_CRYSTAL: ['geCrystallization1', 'geCrystallization2', 'geCrystallization3', 'gibardaumRock'],
        YELLOW_CRYSTAL: ['yeCrystallization'],
        // ... other layer groupings
    },
    
    ANIMATION: {
        ROUTE_DASH_SPEED: 0.05,
        ZOOM_DURATION: 200
    },
    
    STORAGE_KEYS: {
        CUSTOM_MARKERS: 'mp4_customMarkers',
        ROUTE: 'mp4_route',
        SETTINGS: 'mp4_settings'
    }
};
```

### Phase 2: Extract Rendering Modules

```
rendering/
├── TileRenderer.js     (NEW) - Tile loading, caching, resolution switching
├── HeatmapRenderer.js  (NEW) - Heatmap computation and rendering
├── GridRenderer.js     (NEW) - Grid overlay and quadrant labels
├── MarkerRenderer.js   (NEW) - Marker drawing and hit-testing
├── RouteRenderer.js    (NEW) - Route path and animation
└── RenderPipeline.js   (NEW) - Orchestrates render order
```

### Phase 3: Extract Input Handling

```
input/
├── PointerHandler.js   (NEW) - Unified mouse/touch handling
├── KeyboardHandler.js  (NEW) - Keyboard shortcuts
└── GestureHandler.js   (NEW) - Pinch-zoom, pan gestures
```

### Phase 4: Extract State Management

```
state/
├── MapState.js         (NEW) - View state (offset, zoom)
├── SelectionState.js   (NEW) - Selected marker, edit mode
├── RouteState.js       (NEW) - Route data, computation
└── LayerState.js       (NEW) - Layer visibility
```

### Phase 5: Slim Down InteractiveMap

After extractions, `InteractiveMap` becomes a thin orchestrator:

```javascript
class InteractiveMap {
    constructor(config) {
        this.config = config;
        this.state = new MapState();
        this.tileRenderer = new TileRenderer(this.state, config);
        this.heatmapRenderer = new HeatmapRenderer(this.state, config);
        this.markerRenderer = new MarkerRenderer(this.state, config);
        this.routeRenderer = new RouteRenderer(this.state, config);
        this.pipeline = new RenderPipeline([
            this.tileRenderer,
            this.heatmapRenderer,
            this.markerRenderer,
            this.routeRenderer
        ]);
        this.inputHandler = new PointerHandler(this.state, this.pipeline);
    }
    
    render() {
        this.pipeline.render();
    }
}
```

### Final Module Dependency Graph

```
                    ┌─────────────┐
                    │  index.html │
                    └──────┬──────┘
                           │ loads
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │ config.js  │  │  init.js   │  │ layers/*.js│
    └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
          │               │               │
          ▼               ▼               ▼
    ┌─────────────────────────────────────────────┐
    │              InteractiveMap                 │
    │  (thin orchestrator, ~500 lines target)     │
    └───────────────────┬─────────────────────────┘
                        │ uses
    ┌───────────────────┼───────────────────┐
    ▼                   ▼                   ▼
┌──────────┐    ┌──────────────┐    ┌──────────┐
│ Renderers│    │ Input Handlers│   │  State   │
│ Pipeline │    │              │    │ Managers │
└──────────┘    └──────────────┘    └──────────┘
```

---

## Detailed Refactoring Recommendations

### Priority 1: Quick Wins (Low Risk, High Impact)

#### 1.1 Extract GREEN_CRYSTAL_LAYERS Constant
**Effort:** 15 minutes | **Risk:** Very Low

```javascript
// data/config.js (or top of map.js temporarily)
const GREEN_CRYSTAL_LAYERS = ['geCrystallization1', 'geCrystallization2', 'geCrystallization3', 'gibardaumRock'];

// Replace in map.js lines 2373, 2510, 4025:
// const greenKeys = ['geCrystallization1', ...];
// with:
// const greenKeys = GREEN_CRYSTAL_LAYERS;
```

#### 1.2 Extract Magic Numbers to Constants
**Effort:** 1 hour | **Risk:** Low

Create a constants block at the top of `map.js`:
```javascript
const MAP_SIZE = 8192;
const TILE_RESOLUTIONS = [256, 512, 1024, 2048, 4096, 8192];
const HEATMAP_BLOB_RADIUS = 65;
const HEATMAP_OPACITY = 0.7;
const GRID_ROWS = 8;
const GRID_COLS = 8;
```

Then find-and-replace all hardcoded values.

#### 1.3 Clean Up Empty Catch Blocks
**Effort:** 30 minutes | **Risk:** Low

Replace:
```javascript
try { ... } catch (e) {}
```

With:
```javascript
try { ... } catch (e) { console.debug('Operation failed:', e.message); }
```

Or remove the try-catch if the error is truly ignorable.

### Priority 2: Module Extractions (Medium Risk, High Impact)

#### 2.1 Extract TileRenderer
**Effort:** 4 hours | **Risk:** Medium

Extract from `InteractiveMap`:
- `loadTileForResolution()`
- `switchTileResolution()`
- `determineBestResolution()`
- `renderTiles()`
- Tile caching logic (`this.tiles`, `this.pendingLoads`)

**Target file:** `rendering/TileRenderer.js` (~300 lines)

**Interface:**
```javascript
class TileRenderer {
    constructor(canvas, config) { }
    render(offset, scale) { }
    preloadResolution(res) { }
    invalidateCache() { }
}
```

#### 2.2 Extract HeatmapRenderer
**Effort:** 3 hours | **Risk:** Medium

Extract from `InteractiveMap`:
- `renderHeatmap()`
- `computeCrystalCountForMarker()`
- HSL color mapping logic
- Per-marker blob rendering

**Target file:** `rendering/HeatmapRenderer.js` (~200 lines)

**Interface:**
```javascript
class HeatmapRenderer {
    constructor(canvas, config) { }
    render(markers, visibleLayers, offset, scale) { }
    setEnabled(enabled) { }
}
```

#### 2.3 Extract MarkerRenderer
**Effort:** 3 hours | **Risk:** Medium

Extract from `InteractiveMap`:
- `renderMarkers()`
- `renderEditOverlay()`
- `getMarkerAtScreen()`
- Hit-testing logic

**Target file:** `rendering/MarkerRenderer.js` (~400 lines)

**Interface:**
```javascript
class MarkerRenderer {
    constructor(canvas, config) { }
    render(markers, visibleLayers, offset, scale) { }
    hitTest(screenX, screenY) { }
    setEditMode(mode) { }
}
```

#### 2.4 Extract RouteRenderer
**Effort:** 2 hours | **Risk:** Medium

Extract from `InteractiveMap`:
- `renderRoute()`
- Route animation logic (`_routeAnimOffset`, `_routeAnimFrame`)
- Dash pattern computation

**Target file:** `rendering/RouteRenderer.js` (~200 lines)

#### 2.5 Extract GridRenderer
**Effort:** 2 hours | **Risk:** Low

Extract from `InteractiveMap`:
- `renderDetailGrid()`
- `_updateGridQuadLabels()`
- Quadrant label rendering

**Target file:** `rendering/GridRenderer.js` (~300 lines)

### Priority 3: Input Handler Extraction (Medium Risk)

#### 3.1 Extract PointerHandler
**Effort:** 4 hours | **Risk:** Medium

Extract from `InteractiveMap`:
- `bindEvents()` pointer event handlers
- Pan logic
- Pinch-zoom logic
- Marker click/drag handling

**Target file:** `input/PointerHandler.js` (~500 lines)

**Interface:**
```javascript
class PointerHandler {
    constructor(element, callbacks) {
        // callbacks: { onPan, onZoom, onMarkerClick, onMarkerDrag, ... }
    }
    enable() { }
    disable() { }
}
```

### Priority 4: Decouple Utilities from Global `map` (Low Risk)

#### 4.1 Refactor markerUtils.js to Accept Context
**Effort:** 2 hours | **Risk:** Low

Change:
```javascript
// Current
if (typeof map !== 'undefined' && map) {
    map.customMarkers = LAYERS.customMarkers.markers;
    map.updateLayerCounts();
    map.render();
}
```

To:
```javascript
// Proposed - use callbacks set during initialization
const MarkerUtils = {
    _onMarkersChanged: null,
    
    setOnMarkersChanged(callback) {
        this._onMarkersChanged = callback;
    },
    
    _notifyChange() {
        if (this._onMarkersChanged) this._onMarkersChanged();
    },
    
    addCustomMarker(x, y) {
        // ... add marker logic ...
        this._notifyChange();
    }
};
```

### Priority 5: Slim init() Function (High Risk, High Impact)

#### 5.1 Extract UI Controllers
**Effort:** 8 hours | **Risk:** High

The ~2,800-line `init()` function should be split into:

1. **SidebarController** - Checkbox handling, panel toggling
2. **ToolbarController** - Edit mode buttons, import/export
3. **SettingsController** - Storage consent, theme selection
4. **TooltipController** - Marker tooltip display

Each controller follows a pattern:
```javascript
class SidebarController {
    constructor(map, elements) {
        this.map = map;
        this.elements = elements;
    }
    
    bind() {
        // Wire up event listeners
    }
    
    updateState(state) {
        // Update UI to reflect state
    }
}
```

---

## Implementation Roadmap

### Sprint 1: Foundation (Week 1)
| Task | Effort | Risk | Dependencies |
|------|--------|------|--------------|
| Create `config.js` with all constants | 2h | Low | None |
| Extract `GREEN_CRYSTAL_LAYERS` | 15m | Very Low | config.js |
| Replace magic numbers with constants | 2h | Low | config.js |
| Clean up empty catch blocks | 1h | Low | None |
| **Total** | **~5h** | | |

### Sprint 2: Rendering Modules (Week 2-3)
| Task | Effort | Risk | Dependencies |
|------|--------|------|--------------|
| Extract `TileRenderer` | 4h | Medium | config.js |
| Extract `HeatmapRenderer` | 3h | Medium | config.js |
| Extract `GridRenderer` | 2h | Low | config.js |
| Extract `MarkerRenderer` | 3h | Medium | config.js |
| Extract `RouteRenderer` | 2h | Medium | config.js |
| Create `RenderPipeline` orchestrator | 2h | Medium | All renderers |
| **Total** | **~16h** | | |

### Sprint 3: Input Handling (Week 4)
| Task | Effort | Risk | Dependencies |
|------|--------|------|--------------|
| Extract `PointerHandler` | 4h | Medium | RenderPipeline |
| Extract `KeyboardHandler` | 2h | Low | RenderPipeline |
| Refactor `markerUtils.js` callbacks | 2h | Low | None |
| Refactor `routeUtils.js` callbacks | 2h | Low | None |
| **Total** | **~10h** | | |

### Sprint 4: UI Controllers (Week 5-6)
| Task | Effort | Risk | Dependencies |
|------|--------|------|--------------|
| Extract `SidebarController` | 4h | High | All previous |
| Extract `ToolbarController` | 3h | High | All previous |
| Extract `SettingsController` | 2h | Medium | storageHelper.js |
| Extract `TooltipController` | 2h | Low | MarkerRenderer |
| Slim down `init()` to ~200 lines | 4h | High | All controllers |
| **Total** | **~15h** | | |

### Sprint 5: Cleanup & Documentation (Week 7)
| Task | Effort | Risk | Dependencies |
|------|--------|------|--------------|
| Remove legacy upgrade code (if safe) | 2h | Medium | None |
| Remove dead code and unused variables | 2h | Low | None |
| Add JSDoc comments to all modules | 4h | None | All modules |
| Update README with architecture docs | 2h | None | All modules |
| **Total** | **~10h** | | |

### Total Estimated Effort: ~56 hours over 7 weeks

---

## Risk Mitigation

### Testing Strategy

Since there are no automated tests, implement manual testing checkpoints:

1. **Before each extraction:**
   - Document current behavior with screenshots
   - Record expected behavior for all features

2. **After each extraction:**
   - Verify all rendering looks identical
   - Test all input methods (mouse, touch, keyboard)
   - Test all UI controls
   - Test persistence (save/load markers and routes)

3. **Regression checklist:**
   - [ ] Tile loading and resolution switching works
   - [ ] Heatmap displays correctly
   - [ ] Grid overlay shows proper counts
   - [ ] All 22 marker layers render correctly
   - [ ] Custom markers can be added/deleted
   - [ ] Route editing and animation works
   - [ ] TSP optimization produces correct routes
   - [ ] Import/export functionality works
   - [ ] LocalStorage persistence works
   - [ ] Touch/pinch-zoom works on mobile

### Rollback Plan

1. Use Git branches for each sprint
2. Keep `map.js.backup` as a fallback
3. Merge to main only after full testing

### Gradual Migration

If full extraction feels risky, use a **facade pattern**:

```javascript
// Keep old methods as facades that delegate to new modules
class InteractiveMap {
    renderTiles() {
        // Old code path (deprecated)
        if (!this.tileRenderer) {
            // ... existing 200-line method ...
        }
        // New code path
        else {
            this.tileRenderer.render(this.offset, this.scale);
        }
    }
}
```

This allows gradual migration and easy rollback.

---

## Appendix: Code Smell Inventory

### A. Duplicated Code Locations

| Pattern | Locations | Line Count |
|---------|-----------|------------|
| greenKeys array | 3 locations | 3×5 = 15 lines |
| `typeof map !== 'undefined'` check | ~15 locations | ~45 lines |
| Empty catch blocks | ~25 locations | ~50 lines |
| localStorage try-catch | ~10 locations | ~40 lines |

### B. Long Methods (>100 lines)

| Method | Lines | Responsibility Count |
|--------|-------|---------------------|
| `init()` | ~2,800 | 15+ |
| `bindEvents()` | ~750 | 8 |
| `renderMarkers()` | ~300 | 3 |
| `renderDetailGrid()` | ~200 | 2 |
| `renderHeatmap()` | ~150 | 2 |

### C. High Fan-Out Methods

| Method | Dependencies |
|--------|--------------|
| `init()` | DOM, LAYERS, map, MarkerUtils, RouteUtils, TSPEuclid, _mp4Storage |
| `constructor()` | All canvas elements, all config options |

---

## Conclusion

This refactoring plan prioritizes **maintainability** and **modularity** while respecting the project's script-tag-based architecture. The phased approach minimizes risk by extracting modules incrementally and maintaining backward compatibility throughout.

**Key outcomes after refactoring:**
- `map.js` reduced from 6,012 lines to ~500 lines
- 8-10 focused modules with single responsibilities
- Eliminated all duplicate code patterns
- All magic numbers extracted to configuration
- Utilities decoupled from global state
- Clear separation between rendering, input, and state management

The estimated 56 hours of work over 7 weeks will result in a significantly more maintainable codebase that is easier to extend, debug, and potentially test in the future.
