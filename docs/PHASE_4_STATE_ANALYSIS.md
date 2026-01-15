# InteractiveMap State Management Analysis

## Overview

This document inventories all state-related properties and methods in the `InteractiveMap` class that need to be extracted into dedicated state management classes as part of Phase 4.

## State Properties Inventory

### MapState (View/Pan/Zoom State)

**Properties:**
- `this.zoom` - Current zoom level (default: 0.1)
- `this.panX` - Horizontal pan offset in screen pixels (default: 0)
- `this.panY` - Vertical pan offset in screen pixels (default: 0)
- `this.minZoom` - Minimum zoom level (computed from device capabilities)

**Methods that mutate this state:**
- `zoomIn(centerX?, centerY?)` - Increases zoom by 30% centered on optional point
- `zoomOut(centerX?, centerY?)` - Decreases zoom by ~23% centered on optional point
- `resize()` - Updates canvas dimensions and recomputes minZoom
- `fitView()` - Fits entire map in viewport, updates zoom/pan
- `resetView()` - Resets to default zoom/pan
- `setViewFromStorage()` - Loads saved zoom/pan from storage

**Methods that read this state:**
- All rendering methods access zoom/pan for coordinate transformations
- `screenToWorld()`, `worldToScreen()` coordinate conversion methods
- Route rendering uses zoom/pan for positioning
- Marker hit-testing uses zoom/pan for coordinate calculations

### SelectionState (Marker/Route Selection & Edit Mode)

**Properties:**
- `this.selectedMarker` - Currently selected marker object (default: null)
- `this.selectedMarkerLayer` - Layer key of selected marker (default: null)
- `this.hoveredMarker` - Currently hovered marker (transient)
- `this.hoveredMarkerLayer` - Layer key of hovered marker (transient)
- `this.editMarkersMode` - Whether marker editing is enabled (default: false)
- `this.editRouteMode` - Whether route editing is enabled (default: false)
- `this.highlightedLayers` - Set of highlighted layer keys (default: new Set())

**Methods that mutate this state:**
- `setSelectedMarker(marker, layerKey)` - Sets selected marker
- `clearSelectedMarker()` - Clears marker selection
- `setEditMarkersMode(enabled)` - Toggles marker edit mode
- `setEditRouteMode(enabled)` - Toggles route edit mode
- `toggleLayerHighlight(layerKey)` - Adds/removes layer from highlight set
- `clearLayerHighlights()` - Clears all highlights

**Methods that read this state:**
- `renderMarkers()` - Uses selection state for visual feedback
- `renderEditOverlay()` - Shows edit mode UI elements
- Tooltip display logic uses selected/hovered marker state
- Route editing interactions check editRouteMode

### RouteState (Route Data & Computation)

**Properties:**
- `this.currentRoute` - Array of marker indices representing current route (managed by routeManager)
- `this._routeSources` - Array of route source objects (managed by routeManager)
- `this.currentRouteLengthNormalized` - Normalized route length (managed by routeManager)
- `this.routeLooping` - Whether route should be rendered as closed loop (default: false)
- `this._routeDashOffset` - Animation offset for dashed route lines (default: 0)
- `this._routeRaf` - RequestAnimationFrame ID for route animation
- `this._lastRouteAnimTime` - Timestamp for animation timing
- `this._routeAnimationSpeed` - Animation speed in pixels/second

**Methods that mutate this state:**
- Route state is primarily managed by `routeManager`, not direct InteractiveMap methods
- `toggleRouteLoop()` - Toggles routeLooping flag
- Route animation methods update `_routeDashOffset`, `_routeRaf`, `_lastRouteAnimTime`

**Methods that read this state:**
- `renderRoute()` - Uses all route state for rendering
- Route export/import functions access route data
- Route length calculations use currentRouteLengthNormalized

### LayerState (Layer Visibility & Display)

**Properties:**
- `this.layerVisibility` - Object mapping layer keys to boolean visibility (default: all true)
- `this._showGridHeatmap` - Whether grid heatmap overlay is enabled (default: false)
- `this.tileset` - Current tileset ('sat' or 'holo', default: 'sat')
- `this.tilesetGrayscale` - Whether tiles are rendered in grayscale (default: false)

**Methods that mutate this state:**
- `toggleLayer(layerKey, show?)` - Shows/hides individual layer
- `showAllLayers()` - Makes all layers visible
- `hideAllLayers()` - Hides all layers except route
- `setGridHeatmapEnabled(enabled)` - Toggles heatmap overlay
- `setTileset(tileset)` - Changes tileset (sat/holo)
- `setTilesetGrayscale(enabled)` - Toggles grayscale mode

**Methods that read this state:**
- All rendering methods check `layerVisibility` before rendering
- GridRenderer checks `_showGridHeatmap` for heatmap rendering
- TileRenderer uses `tileset` and `tilesetGrayscale` for tile loading

## State Dependencies Analysis

### Inter-State Dependencies

**MapState dependencies:**
- All rendering modules depend on zoom/pan for coordinate transformations
- SelectionState hit-testing depends on zoom/pan for screen↔world conversions
- RouteState rendering depends on zoom/pan for positioning

**SelectionState dependencies:**
- Depends on LayerState for layer visibility (can't select hidden markers)
- Marker rendering depends on selection state for visual feedback
- Route editing depends on editRouteMode flag

**RouteState dependencies:**
- Route rendering depends on LayerState.route visibility
- Route computation depends on MapState for coordinate transformations
- Route editing depends on SelectionState.editRouteMode

**LayerState dependencies:**
- All rendering modules depend on layerVisibility
- Grid heatmap depends on _showGridHeatmap flag
- Tile rendering depends on tileset/grayscale settings

### External Dependencies

**Managers (routeManager, markerManager):**
- RouteState properties are actually managed by routeManager
- Marker data is managed by markerManager
- InteractiveMap acts as a bridge between managers and state

**Storage:**
- Many state properties are persisted to localStorage
- Layer visibility, tileset preferences, grid settings are saved/loaded

**Configuration:**
- Some defaults come from MP4Config (animation speeds, marker scaling, etc.)
- Canvas dimensions and device capabilities affect state constraints

## State Mutation Points

### Input Handlers (PointerHandler, KeyboardHandler)
- **Pan operations:** Update MapState.panX/panY
- **Zoom operations:** Update MapState.zoom with center point calculations
- **Marker selection:** Update SelectionState.selectedMarker
- **Layer toggles:** Update LayerState.layerVisibility

### UI Controllers (init() function)
- **Layer checkboxes:** Update LayerState.layerVisibility
- **Edit mode buttons:** Update SelectionState.editMarkersMode/editRouteMode
- **Tileset selectors:** Update LayerState.tileset
- **Grid toggles:** Update LayerState._showGridHeatmap

### Storage Loading
- **Initialization:** Loads saved state from localStorage into all state managers
- **Consent checks:** Only loads user preferences if storage consent given

### Route Operations
- **Route changes:** Update RouteState via routeManager callbacks
- **Route editing:** Update RouteState.currentRoute through routeManager

## Proposed State Manager Interfaces

### MapState
```javascript
class MapState {
  constructor() {
    this.zoom = DEFAULT_ZOOM;
    this.panX = 0;
    this.panY = 0;
    this.minZoom = DEFAULT_MIN_ZOOM;
    this.canvasWidth = 0;
    this.canvasHeight = 0;
  }

  // View transformation methods
  screenToWorld(screenX, screenY) { /* ... */ }
  worldToScreen(worldX, worldY) { /* ... */ }
  fitBounds(bounds) { /* ... */ }
  centerOn(worldX, worldY) { /* ... */ }

  // Zoom methods
  zoomIn(centerX?, centerY?) { /* ... */ }
  zoomOut(centerX?, centerY?) { /* ... */ }
  setZoom(zoom, centerX?, centerY?) { /* ... */ }

  // Pan methods
  pan(deltaX, deltaY) { /* ... */ }
  setPan(x, y) { /* ... */ }
}
```

### SelectionState
```javascript
class SelectionState {
  constructor() {
    this.selectedMarker = null;
    this.selectedMarkerLayer = null;
    this.editMode = null; // 'markers', 'route', null
    this.highlightedLayers = new Set();
  }

  selectMarker(marker, layerKey) { /* ... */ }
  clearSelection() { /* ... */ }
  setEditMode(mode) { /* ... */ }
  getEditMode() { /* ... */ }
  setHighlightedLayers(layers) { /* ... */ }
  addHighlightedLayer(layer) { /* ... */ }
  clearHighlightedLayers() { /* ... */ }
}
```

### RouteState
```javascript
class RouteState {
  constructor() {
    this.currentRoute = null;
    this.sources = [];
    this.lengthNormalized = 0;
    this.isLooping = false;
    this.animationOffset = 0;
    this.isComputing = false;
    this.computationProgress = 0;
  }

  setRoute(route, sources) { /* ... */ }
  clearRoute() { /* ... */ }
  setLooping(isLooping) { /* ... */ }
  setAnimationOffset(offset) { /* ... */ }
  setComputing(isComputing) { /* ... */ }
  setComputationProgress(progress) { /* ... */ }
}
```

### LayerState
```javascript
class LayerState {
  constructor(layerKeys) {
    this.visibility = {};
    this.gridVisible = true;
    this.heatmapVisible = false;
    this.tileset = 'sat';
    this.grayscale = false;
  }

  setLayerVisible(layerKey, visible) { /* ... */ }
  toggleLayer(layerKey) { /* ... */ }
  showAllLayers() { /* ... */ }
  hideAllLayers() { /* ... */ }
  setGridVisible(visible) { /* ... */ }
  setHeatmapVisible(visible) { /* ... */ }
  setTileset(tileset) { /* ... */ }
  setGrayscale(enabled) { /* ... */ }
}
```

## Migration Strategy

### Phase 4.1: State Manager Creation
1. Enhance existing scaffold files with complete interfaces
2. Add coordinate transformation methods to MapState
3. Add layer management methods to LayerState
4. Add route management methods to RouteState
5. Add selection management methods to SelectionState

### Phase 4.2: InteractiveMap Integration
1. Add state manager instances to InteractiveMap constructor
2. Update state access throughout InteractiveMap to delegate to managers
3. Update state mutation methods to use managers
4. Maintain backward compatibility during transition

### Phase 4.3: Renderer Updates
1. Update renderer constructors to accept state managers
2. Replace direct map.state access with manager access
3. Update RenderPipeline to pass managers to renderers

### Phase 4.4: Input Handler Updates
1. Update input handlers to mutate state managers
2. Remove direct InteractiveMap state manipulation
3. Add state change callbacks if needed

### Phase 4.5: Testing & Cleanup
1. Verify all functionality works with new state management
2. Remove old state properties from InteractiveMap
3. Update documentation and JSDoc comments

## Success Criteria

- ✅ All state properties extracted from InteractiveMap
- ✅ State managers are independently testable
- ✅ Renderers work with state managers, not InteractiveMap
- ✅ Input handlers mutate state managers
- ✅ All existing functionality preserved
- ✅ InteractiveMap reduced to ~500 lines (thin orchestrator)
- ✅ State changes properly trigger re-renders</content>
<parameter name="filePath">d:\Fragments\Metroid\Metroid Prime 5 Routing Tool\Metroid-Prime-4-Routing-Tool\PHASE_4_STATE_ANALYSIS.md