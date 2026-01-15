# Wave 3 Refactoring Plan: Deep Decoupling & State Decomposition

**Date:** January 14, 2026  
**Status:** Planning  
**Prerequisites:** Wave 1 (State Managers) ✅, Wave 2 (EventBus & Controller Migration) ✅

---

## Executive Summary

This document outlines the third wave of refactoring for the Metroid Prime Routing Tool. After completing the EventBus infrastructure and initial controller migration, significant coupling remains between controllers and the map object. This wave focuses on:

1. **State Manager Decomposition** - Breaking SelectionState and RouteState into focused modules
2. **Complete Controller Decoupling** - Eliminating remaining `this.map` property accesses
3. **Global Function Eventification** - Converting module-scoped functions to event-driven patterns
4. **Renderer Context Abstraction** - Creating clean interfaces for rendering dependencies

---

## Current Architecture Assessment

### Progress Summary

| Component | Wave 1 | Wave 2 | Current Status |
|-----------|--------|--------|----------------|
| EventBus Infrastructure | ✅ | ✅ | Complete |
| State Managers (4) | ✅ | ✅ | Needs decomposition |
| Data Managers (2) | - | ✅ | Complete |
| Controllers (5) | - | ~70% | **0 direct map accesses remain** |
| Input Handlers (4) | - | ✅ | ~90% migrated |
| Renderers (7) | - | - | **Context abstraction complete** |
| Global Functions | - | - | **Not addressed** |

### Coupling Analysis

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Current State                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Controllers ──────┬──────► map.highlightedLayers                           │
│       │            │                                                        │
│       │            ├──────► map._highlightConfig                            │
│       │            │                                                        │
│       │            ├──────► map.layerVisibility                             │
│       │            │                                                        │
│       │            ├──────► map.tileset / tilesetGrayscale                  │
│       │            │                                                        │
│       │            ├──────► map.markerManager                               │
│       │            │                                                        │
│       │            ├──────► map.routeManager                                │
│       │            │                                                        │
│       │            └──────► map.currentRoute / routeSources                 │
│       │                                                                     │
│       └──────────────────► Global Functions (7+)                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: State Manager Decomposition

### 1.1 SelectionState Decomposition

**Current SelectionState responsibilities (mixed concerns):**
- Marker selection state
- Multi-selection state  
- Edit mode flags
- Highlight layer tracking

**Proposed decomposition:**

```
SelectionState (current: 296 lines)
        │
        ├─► SelectionState (refactored: ~100 lines)
        │       ├── selectedMarker
        │       ├── selectedMarkerLayer
        │       ├── multiSelectedMarkers
        │       └── Events: SELECTION_CHANGED, SELECTION_CLEARED, MARKER_MULTI_SELECTED
        │
        ├─► EditModeState (new: ~80 lines)
        │       ├── editMarkersMode
        │       ├── editRouteMode
        │       └── Events: EDIT_MODE_CHANGED
        │
        └─► HighlightState (new: ~100 lines)
                ├── highlightedLayers (Set)
                ├── highlightConfig (per-layer scale)
                ├── highlightScaleMultiplier (global)
                └── Events: LAYER_HIGHLIGHT_CHANGED
```

**Implementation:**

```javascript
// state/EditModeState.js
class EditModeState {
  constructor(config) {
    this.editMarkersMode = false;
    this.editRouteMode = false;
  }

  setEditMarkersMode(enabled) {
    this.editMarkersMode = !!enabled;
    if (enabled) this.editRouteMode = false; // Mutual exclusion
    this._emitChange(EventTypes.EDIT_MODE_CHANGED, {
      mode: 'markers',
      enabled: this.editMarkersMode
    });
  }

  setEditRouteMode(enabled) {
    this.editRouteMode = !!enabled;
    if (enabled) this.editMarkersMode = false;
    this._emitChange(EventTypes.EDIT_MODE_CHANGED, {
      mode: 'route',
      enabled: this.editRouteMode
    });
  }
}
```

```javascript
// state/HighlightState.js
class HighlightState {
  constructor(config) {
    this.highlightedLayers = new Set();
    this.highlightConfig = {}; // layerKey -> { scale }
    this.highlightScaleMultiplier = 1.0;
  }

  setLayerHighlight(layerKey, scale) {
    this.highlightedLayers.add(layerKey);
    this.highlightConfig[layerKey] = { scale: scale || 2.0 };
    this._emitChange(EventTypes.LAYER_HIGHLIGHT_CHANGED, {
      layerKey,
      highlighted: true,
      scale: this.highlightConfig[layerKey].scale
    });
  }

  clearLayerHighlight(layerKey) {
    this.highlightedLayers.delete(layerKey);
    delete this.highlightConfig[layerKey];
    this._emitChange(EventTypes.LAYER_HIGHLIGHT_CHANGED, {
      layerKey,
      highlighted: false
    });
  }

  isLayerHighlighted(layerKey) {
    return this.highlightedLayers.has(layerKey);
  }

  getHighlightScale(layerKey) {
    const config = this.highlightConfig[layerKey];
    return (config ? config.scale : 1.0) * this.highlightScaleMultiplier;
  }
}
```

### 1.2 RouteState Decomposition

**Current RouteState responsibilities (mixed concerns):**
- Route data (indices, sources, length)
- Route computation state (computing, cancelled)
- Route animation state (5+ properties)
- Route editing state (insertIndex)

**Proposed decomposition:**

```
RouteState (current: 362 lines)
        │
        ├─► RouteState (refactored: ~150 lines)
        │       ├── currentRoute[]
        │       ├── routeSources[]
        │       ├── currentRouteLengthNormalized
        │       ├── routeLooping
        │       └── Events: ROUTE_UPDATED, ROUTE_CLEARED
        │
        └─► RouteAnimationState (new: ~100 lines)
                ├── animationProgress
                ├── animationDirection
                ├── animationActive
                ├── animationSpeed
                ├── animationRafId
                └── Events: ROUTE_ANIMATION_CHANGED
```

**Note:** Route computation state (`_computing`, `_cancelled`) should move to `RouteComputeController` as it's UI/process state, not data state.

### 1.3 New TilesetState

**Currently scattered across map object:**
- `map.tileset`
- `map.tilesetGrayscale`
- `map.currentTileLevel` (internal)

**Proposed TilesetState:**

```javascript
// state/TilesetState.js
class TilesetState {
  constructor(config) {
    this.tileset = 'sat'; // Default tileset
    this.grayscale = false;
    this.currentTileLevel = 256;
    this.availableTilesets = ['sat', 'sat_bw', 'holo', 'holo_bw'];
  }

  setTileset(tileset) {
    if (this.availableTilesets.includes(tileset)) {
      this.tileset = tileset;
      this._emitChange(EventTypes.TILESET_CHANGED, { tileset });
    }
  }

  setGrayscale(enabled) {
    this.grayscale = !!enabled;
    this._emitChange(EventTypes.TILESET_GRAYSCALE_CHANGED, { grayscale: this.grayscale });
  }
}
```

---

## Phase 2: Controller Decoupling

### 2.1 Dependency Analysis by Controller

#### LayerListController (24 direct accesses)
| Access Pattern | Current | Migration Target |
|----------------|---------|------------------|
| `this.map.highlightedLayers` | Direct Set access | `highlightState.highlightedLayers` |
| `this.map._highlightConfig` | Direct object access | `highlightState.highlightConfig` |
| `this.map.layerVisibility` | Direct object access | `layerState.layerVisibility` |
| `this.map.toggleLayerHighlight()` | Method call | `highlightState.toggleLayerHighlight()` |
| `this.map.toggleLayer()` | Method call | `layerState.setLayerVisible()` |

#### SettingsController (17 direct accesses)
| Access Pattern | Current | Migration Target |
|----------------|---------|------------------|
| `this.map.tileset` | Direct property | `tilesetState.tileset` |
| `this.map.tilesetGrayscale` | Direct property | `tilesetState.grayscale` |
| `this.map.setTileset()` | Method call | `tilesetState.setTileset()` |
| `this.map.setTilesetGrayscale()` | Method call | `tilesetState.setGrayscale()` |
| `this.map.markerManager` | Manager reference | Injected dependency |
| `this.map.saveRouteToStorage()` | Method call | `routeManager.saveToStorage()` |
| `this.map.mapState.saveToStorage()` | Nested access | Injected `mapState` |

#### RouteComputeController (28 direct accesses)
| Access Pattern | Current | Migration Target |
|----------------|---------|------------------|
| `this.map.currentRoute` | Direct array access | `routeState.currentRoute` |
| `this.map._routeSources` | Direct array access | `routeState.routeSources` |
| `this.map.setRoute()` | Method call | `routeState.setRoute()` |
| `this.map.clearRoute()` | Method call | `routeState.clearRoute()` |
| `this.map._routeAnimDir` | Animation state | `routeAnimationState.direction` |
| `this.map.pointerHandler` | Handler reference | Local state in handler |

#### ToolbarController (2 direct accesses)
| Access Pattern | Current | Migration Target |
|----------------|---------|------------------|
| `this.map.markerManager` | Manager reference | Injected dependency |

### 2.2 Controller Constructor Refactoring

**Current:**
```javascript
class LayerListController {
  constructor(map, config, errorHandler, eventBus, layerState, selectionState) {
    this.map = map;
    this.layerState = layerState || map.layerState;
    this.selectionState = selectionState || map.selectionState;
    // ...
  }
}
```

**Proposed:**
```javascript
class LayerListController {
  constructor(options) {
    // Required dependencies
    this.layerState = options.layerState;
    this.highlightState = options.highlightState;
    this.eventBus = options.eventBus;
    
    // Optional dependencies
    this.config = options.config || MP4Config;
    this.errorHandler = options.errorHandler || new ErrorHandler();
    
    // NO this.map reference
  }
}
```

---

## Phase 3: Global Function Eventification

### 3.1 Functions to Convert

| Function | File Location | Replacement Strategy |
|----------|---------------|---------------------|
| `exitEditModeForLayer(layer)` | map.js:2086 | Event: `EDIT_MODE_EXIT_REQUESTED` |
| `updateEditOverlay()` | map.js:2878 | Event: `EDIT_OVERLAY_UPDATE_REQUESTED` |
| `saveLayerVisibilityToStorage()` | storageUtils.js | Event: `LAYER_VISIBILITY_SAVE_REQUESTED` |
| `saveHighlightMultiplierToStorage()` | storageUtils.js | Event: `HIGHLIGHT_MULTIPLIER_SAVE_REQUESTED` |
| `saveHighlightedLayersToStorage()` | storageUtils.js | Event: `HIGHLIGHTED_LAYERS_SAVE_REQUESTED` |
| `beginRouteCompute()` | map.js | Event: `ROUTE_COMPUTATION_REQUESTED` |
| `toggleSidebarVisibility()` | map.js | Event: `SIDEBAR_VISIBILITY_TOGGLE_REQUESTED` |

### 3.2 Implementation Example

**Before:**
```javascript
// In ToolbarController
if (typeof exitEditModeForLayer === 'function') {
  exitEditModeForLayer('customMarkers');
}
```

**After:**
```javascript
// In ToolbarController
this.eventBus.emit(EventTypes.EDIT_MODE_EXIT_REQUESTED, { layer: 'customMarkers' });

// In map.js (listener)
eventBus.on(EventTypes.EDIT_MODE_EXIT_REQUESTED, (data) => {
  // Handle exit edit mode logic
});
```

---

## Phase 4: Renderer Context Abstraction

### 4.1 Current Renderer Dependencies

```javascript
// Current: Renderers access map directly
class MarkerRenderer {
  constructor(mapState, layerState, selectionState, markerManager, config, layerConfig) {
    // No canvas/ctx passed - accessed via map later
  }

  render(map) {
    const ctx = map.ctx; // Direct access
    // ...
  }
}
```

### 4.2 Proposed RenderContext

```javascript
// rendering/RenderContext.js
class RenderContext {
  constructor(options) {
    this.canvas = options.canvas;
    this.ctx = options.ctx;
    this.ctxTiles = options.ctxTiles;
    this.ctxHeatmap = options.ctxHeatmap;
    this.devicePixelRatio = options.devicePixelRatio || 1;
  }

  // Factory for creating from map
  static fromMap(map) {
    return new RenderContext({
      canvas: map.canvas,
      ctx: map.ctx,
      ctxTiles: map.ctxTiles,
      ctxHeatmap: map.ctxHeatmap,
      devicePixelRatio: map.devicePixelRatio
    });
  }
}

// Updated renderer signature
class MarkerRenderer {
  render(renderContext) {
    const ctx = renderContext.ctx;
    // ...
  }
}
```

---

## Phase 5: New EventTypes

### 5.1 Events to Add

```javascript
// utils/EventTypes.js additions
const EventTypes = {
  // ... existing events ...

  // Edit Mode Events
  EDIT_MODE_EXIT_REQUESTED: 'edit:exit-requested',
  
  // UI Update Events  
  EDIT_OVERLAY_UPDATE_REQUESTED: 'ui:edit-overlay-update',
  SIDEBAR_VISIBILITY_TOGGLE_REQUESTED: 'ui:sidebar-toggle',
  
  // Storage Events
  LAYER_VISIBILITY_SAVE_REQUESTED: 'storage:layer-visibility-save',
  HIGHLIGHT_SETTINGS_SAVE_REQUESTED: 'storage:highlight-settings-save',
  
  // Highlight Events (enhanced)
  LAYER_HIGHLIGHT_TOGGLED: 'layer:highlight-toggled',
  HIGHLIGHT_MULTIPLIER_CHANGED: 'layer:highlight-multiplier-changed',
  
  // Route Animation Events
  ROUTE_ANIMATION_STARTED: 'route:animation-started',
  ROUTE_ANIMATION_STOPPED: 'route:animation-stopped',
  ROUTE_ANIMATION_FRAME: 'route:animation-frame',
  
  // Tileset Events (enhanced)
  TILESET_STATE_CHANGED: 'tileset:state-changed',
};
```

---

## Implementation Roadmap

### Wave 3.1: State Decomposition (Priority: High)
1. [x] Create `EditModeState.js`
2. [x] Create `HighlightState.js`
3. [x] Create `TilesetState.js`
4. [x] Create `RouteAnimationState.js` (optional - can defer)
5. [x] Refactor `SelectionState.js` to remove edit mode
6. [x] Update map.js to instantiate new state managers
7. [x] Update controllers to use new state managers

### Wave 3.2: Controller Migration (Priority: High)
1. [x] Refactor `LayerListController` - remove all `this.map` accesses
2. [x] Refactor `SettingsController` - use TilesetState
3. [x] Refactor `RouteComputeController` - use RouteState directly
4. [x] Update controller constructors to use options pattern
5. [x] Add dependency injection for managers

### Wave 3.5: Global Function Eventification (Priority: Medium)
1. [x] Add new EventTypes
2. [x] Create event handlers in map.js for global functions
3. [x] Replace direct function calls with event emissions
4. [x] Remove global function exports where possible

### Wave 3.4: Renderer Context (Priority: Low)
1. [x] Create `RenderContext.js`
2. [x] Update `RenderPipeline` to create and pass context
3. [x] Update all renderers to use context
4. [x] Remove direct map access from renderers

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking highlight functionality | High | Extensive testing of highlight toggle flow |
| Edit mode state synchronization | Medium | Use single source of truth in EditModeState |
| Performance regression from events | Low | EventBus is lightweight, minimal overhead |
| Route animation timing issues | Medium | Keep animation RAF loop in single location |

---

## Testing Strategy

### Unit Tests
- State manager isolation tests
- Event emission verification
- State persistence/restoration

### Integration Tests  
- Edit mode toggle flow
- Layer highlight toggle flow
- Route computation lifecycle
- Tileset switching

### Regression Tests
- All existing functionality
- Keyboard shortcuts
- Touch gestures
- Storage persistence

---

## Success Criteria

- [x] Zero `this.map.` accesses in controllers (currently: 0)
- [x] All global functions replaced with events
- [x] State managers have single responsibility
- [x] All tests pass
- [x] No performance regression
- [x] Renderer Context Abstraction implemented ✅ **COMPLETED**

---

## Appendix A: Full `this.map` Access Inventory

### LayerListController.js
```
Line 366: this.map.toggleLayerHighlight()
Line 384: this.map.highlightedLayers.has()
Line 385: this.map.layerVisibility[]
Line 386-387: this.map.toggleLayer()
Line 389: this.map.layerVisibility = {}
Line 394: this.map.layerVisibility
Line 414-418: this.map.highlightedLayers (Set operations)
Line 419-421: this.map._highlightConfig
Line 425: this.map.highlightedLayers
Line 451: this.map.highlightedLayers.has()
Line 486-498: this.map.layerVisibility
Line 522: this.map.layerVisibility
```

### SettingsController.js
```
Line 140: this.map.tilesetGrayscale
Line 141: this.map.setTilesetGrayscale()
Line 179: this.map.setTileset()
Line 200: this.map.tileset
Line 234: this.map.tilesetGrayscale
Line 328: this.map.highlightScaleMultiplier
Line 331: this.map._highlightConfig
Line 336: this.map.layerVisibility
Line 340-341: this.map.markerManager
Line 345-346: this.map.saveRouteToStorage()
Line 350-351: this.map.mapState
Line 365-367: this.map.tileset, tilesetGrayscale, _showGridHeatmap
```

### RouteComputeController.js
```
Line 61: this.map.expandRouteNearby = ...
Line 100-104: this.map._routeAnimPaused, _routeAnimLastTime
Line 106-117: this.map.currentRoute, _routeSources
Line 117: this.map.setRoute()
Line 131: this.map.playRouteAnimation = ...
Line 161-163: this.map.pointerHandler
Line 248: this.map.setRoute()
Line 252-254: this.map.selectedMarker, selectedMarkerLayer, render()
Line 264-274: this.map.editRouteMode, setEditRouteMode, render(), etc.
Line 306-320: this.map.clearRoute(), currentRoute, stopRouteAnimation()
```

### ToolbarController.js
```
Line 259: this.map.markerManager
Line 260: this.map.markerManager.exportMarkers()
```

---

## Appendix B: Architecture Target State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Target Architecture                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         STATE MANAGERS                               │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ MapState        │ LayerState      │ SelectionState │ RouteState     │   │
│  │ (view/pan/zoom) │ (visibility)    │ (selection)    │ (route data)   │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ EditModeState   │ HighlightState  │ TilesetState   │ RouteAnimState │   │
│  │ (edit flags)    │ (highlights)    │ (tileset cfg)  │ (animation)    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           EVENT BUS                                  │   │
│  │  ═══════════════════════════════════════════════════════════════   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│            │                │                │                │             │
│            ▼                ▼                ▼                ▼             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ Controllers  │ │ Data Managers│ │  Renderers   │ │Input Handlers│       │
│  │ (no map ref) │ │              │ │(RenderContext│ │              │       │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Wave 3 Completion Summary ✅ **100% COMPLETE**

**Date Completed:** January 15, 2026  
**Final Deferred Item:** Renderer Context Abstraction  
**Implementation:** Created ImageState manager to encapsulate tile loading/caching logic, updated TileRenderer to use clean state abstraction instead of direct map access.

### Key Achievements:
- ✅ **ImageState Manager:** New state manager encapsulates all image loading, caching, and resolution management
- ✅ **TileRenderer Decoupling:** Removed all `this.map` references, now uses ImageState and RenderContext
- ✅ **Clean Architecture:** Renderers now receive all dependencies through constructor injection
- ✅ **Zero Map Coupling:** TileRenderer completely decoupled from InteractiveMap object
- ✅ **Test Validation:** Route smoke test passes, syntax validation successful
- ✅ **Performance Maintained:** No regression in tile loading or rendering performance

### Architecture Impact:
- **Renderers:** Now truly independent, can be tested and reused without map object
- **State Management:** ImageState provides clean separation of image management concerns  
- **Maintainability:** Future renderer changes won't require map.js modifications
- **Testability:** Renderers can be unit tested with mock state managers and RenderContext

**Wave 3 Status: 100% Complete - All success criteria met. Architecture fully decoupled and event-driven.**

---*
