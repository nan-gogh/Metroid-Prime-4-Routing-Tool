# Heatmap Architectural Decoupling & Unified Clearing Architecture

## Problem Statement

The heatmap rendering system had three architectural issues:

1. **Inconsistent Clearing Pattern**: Heatmap was clearing its canvas inside `HeatmapRenderer._renderNow()`, while overlays were cleared by `OverlayClearStage` in the pipeline
2. **Lack of Modular Symmetry**: The heatmap clearing wasn't integrated into the dirty flag system like overlay clearing was
3. **Renderer Responsibility Confusion**: HeatmapRenderer was responsible for both rendering AND canvas management, while other renderers only render

## Solution: Unified Clear Stage Architecture

### Before
```
Pipeline Order:
  TileRenderer → HeatmapRenderer [clears inside] → OverlayClearStage → GridRenderer/Markers/Route/Overlay

Problem: Two different clearing patterns
```

### After
```
Pipeline Order:
  TileRenderer → HeatmapClearStage → HeatmapRenderer → OverlayClearStage → GridRenderer/Markers/Route/Overlay

Benefit: Consistent architecture with dedicated clear stages
```

## Implementation Details

### 1. Created HeatmapClearStage (New)
**File**: [map.js](map.js#L145-L160)

```javascript
const heatmapClearStage = {
    render: (renderContext) => {
        try {
            if (!renderContext || !renderContext.ctxHeatmap) return;
            const canvasSize = renderContext.getCanvasSize();
            renderContext.ctxHeatmap.clearRect(0, 0, canvasSize.width, canvasSize.height);
        } catch (e) { moduleErrorHandler.logDebug('heatmapClearStage failed', ...); }
    }
};
Object.defineProperty(heatmapClearStage.constructor, 'name', { value: 'HeatmapClearStage' });
```

**Responsibility**: Clear the heatmap canvas once per frame, before heatmap rendering
**Dirty Flag Integration**: Marks dirty whenever HeatmapRenderer is marked dirty
**Canvas**: Dedicated heatmap canvas at z-index 1

### 2. Removed Canvas Clearing from HeatmapRenderer
**File**: [rendering/HeatmapRenderer.js](rendering/HeatmapRenderer.js#L85-L97)

**Before**:
```javascript
_renderNow(renderContext) {
    // ... setup ...
    
    // Clear offscreen
    hmCtx.clearRect(0, 0, pw, ph);
    
    // CRITICAL: Clear the heatmap canvas before drawing
    if (renderContext.ctxHeatmap) {
        renderContext.ctxHeatmap.clearRect(0, 0, cssWidth, cssHeight);
    }
    
    // ... render heatmap data ...
}
```

**After**:
```javascript
_renderNow(renderContext) {
    // ... setup ...
    
    // Clear offscreen buffer only
    // (heatmap canvas clearing is now handled by HeatmapClearStage in pipeline)
    hmCtx.clearRect(0, 0, pw, ph);
    
    // ... render heatmap data ...
}
```

**Benefit**: HeatmapRenderer now has single responsibility - rendering only
**Separation of Concerns**: Canvas lifecycle managed by pipeline, not renderer

### 3. Updated RenderPipeline Order
**File**: [map.js](map.js#L168-L177)

```javascript
this.renderPipeline = new RenderPipeline([
    this.tileRenderer,           // Renders background tiles
    heatmapClearStage,           // ← NEW: Clear heatmap canvas
    this.heatmapRenderer,        // ← Renders heatmap visualization
    overlayClearStage,           // Clear overlay canvas
    this.gridRenderer,           // Renders grid lines
    this.markerRenderer,         // Renders markers
    this.routeRenderer,          // Renders route
    this.overlayRenderer         // Renders tooltips/UI
].filter(Boolean), renderContext);
```

**Critical Order**:
- Heatmap canvas cleared BEFORE heatmap rendering
- Overlay canvas cleared BEFORE overlay renderers
- Each renderer operates on a clean canvas

### 4. Enhanced markRendererDirty with Auto-Linking
**File**: [map.js](map.js#L1537-L1560)

```javascript
markRendererDirty(rendererName) {
    if (this.renderPipeline && typeof this.renderPipeline.markDirty === 'function') {
        this.renderPipeline.markDirty(rendererName);
        
        // When marking overlay renderers dirty, also mark OverlayClearStage dirty
        const overlayRenderers = ['GridRenderer', 'MarkerRenderer', 'RouteRenderer', 'OverlayRenderer'];
        if (overlayRenderers.includes(rendererName)) {
            this.renderPipeline.markDirty('OverlayClearStage');
        }
        
        // When marking HeatmapRenderer dirty, also mark HeatmapClearStage dirty
        if (rendererName === 'HeatmapRenderer') {
            this.renderPipeline.markDirty('HeatmapClearStage');
        }
    }
}
```

**Purpose**: Prevents manual coupling of clear stages to renderers
**Behavior**: Automatically ensures clear stages are marked whenever their dependent renderers are marked

### 5. Updated RENDER_REQUESTED Handler
**File**: [map.js](map.js#L2077-2092)

```javascript
eventBus.on(window.EventTypes.RENDER_REQUESTED, (data) => {
    try {
        if (map && map.renderPipeline && typeof map.renderPipeline.markDirty === 'function') {
            // Mark all renderers dirty for a full render, batched via rAF
            // Both HeatmapClearStage and OverlayClearStage MUST be marked dirty
            const allRenderers = [
                'TileRenderer', 
                'HeatmapClearStage',      // ← NEW: Include heatmap clear
                'HeatmapRenderer', 
                'OverlayClearStage', 
                'GridRenderer', 
                'MarkerRenderer', 
                'RouteRenderer', 
                'OverlayRenderer'
            ];
            allRenderers.forEach(name => map.renderPipeline.markDirty(name));
        }
    } catch (e) { /* error handling */ }
});
```

**Ensures**: During pan/zoom, heatmap canvas is cleared along with all other operations

## Architectural Principles Established

### 1. **Modular Rendering Pipeline**
```
Clear Stage 1 → Render Stage 1 → Clear Stage 2 → Render Stage 2
```

Each visual layer has a dedicated clear stage that runs immediately before its renderer. This prevents accumulation while maintaining clean separation of concerns.

### 2. **Heatmap as Independent Visualization**
- Heatmap rendering is now symmetric with overlay rendering
- Both have: clear stage + render stage + dirty flag integration
- No special-casing or embedded clearing logic in renderers

### 3. **Dirty Flag Cascading**
```
markRendererDirty('HeatmapRenderer')
    → markDirty('HeatmapRenderer')
    → auto-link: markDirty('HeatmapClearStage')  // Automatic!
    → Single render pass clears then draws
```

Prevents bugs from forgetting to mark clear stages.

### 4. **Canvas Layering Architecture**
```
z-index 0: Tiles Canvas          (TileRenderer)
z-index 1: Heatmap Canvas        (HeatmapClearStage → HeatmapRenderer)
z-index 2: Overlay Canvas        (OverlayClearStage → Grid/Markers/Route/Overlay)

Each layer independently managed, cleared, and rendered
```

## Coupling Analysis: Heatmap State Management

### Current Coupling (Minimal)
The heatmap renderer still reads from `layerState.isHeatmapVisible()` for visibility control. This is appropriate because:

1. **Configuration, not Coupling**: Visibility is a display preference stored in LayerState (which manages all display settings)
2. **No Data Coupling**: HeatmapRenderer doesn't depend on layer membership or structure
3. **Clean Interface**: Single method `isHeatmapVisible()` is all the coupling needed
4. **Decoupled Rendering**: HeatmapRenderer doesn't touch LayerState during rendering

### Potential Future Improvement
Could create a dedicated `HeatmapDisplayState` to further decouple:
```javascript
class HeatmapDisplayState {
    _heatmapVisible = false;
    isVisible() { return this._heatmapVisible; }
    setVisible(v) { this._heatmapVisible = !!v; }
}
```

However, this would require refactoring LayerState and might be over-engineering since heatmap visibility is fundamentally a display setting.

## Files Modified

1. **[rendering/HeatmapRenderer.js](rendering/HeatmapRenderer.js#L85-L97)**
   - Removed heatmap canvas clearing from `_renderNow()`
   - Now only clears offscreen buffer
   - Canvas lifecycle delegated to pipeline

2. **[map.js](map.js#L128-L180)**
   - Created HeatmapClearStage (parallel to OverlayClearStage)
   - Updated RenderPipeline order to include HeatmapClearStage
   - Stored reference to HeatmapClearStage for dirty marking

3. **[map.js](map.js#L1537-1560)**
   - Enhanced markRendererDirty() with HeatmapClearStage auto-linking
   - Maintains architectural consistency

4. **[map.js](map.js#L2077-2092)**
   - Updated RENDER_REQUESTED handler to include HeatmapClearStage
   - Ensures heatmap clears during pan/zoom operations

## Benefits of This Architecture

✅ **Unified Pattern**: Both heatmap and overlay use identical clear→render pattern
✅ **Modular Responsibility**: Clear stages handle canvas lifecycle, renderers handle content
✅ **Dirty Flag Integration**: Clear stages automatically managed via auto-linking
✅ **Maintainability**: Adding new visual layers follows the same pattern
✅ **Performance**: Selective rendering respects all clear stages
✅ **Prevents Accumulation**: No special-casing, consistent clearing architecture
✅ **Decoupled Logic**: Each stage independent, failures don't cascade

## Testing Checklist

- [ ] Click heatmap button → clean toggle without trails
- [ ] Press key 4 → heatmap toggles cleanly
- [ ] Pan map → no heatmap accumulation
- [ ] Zoom in/out → no heatmap trails
- [ ] Initial page load → no artifacts
- [ ] Open DevTools → verify pipeline order in render logs
- [ ] Watch performance → no degradation from clear stages

## Migration Notes

This refactoring is **backward compatible**:
- All public APIs unchanged
- HeatmapRenderer still works the same from caller perspective
- Pipeline order change is internal optimization
- No modifications needed to HeatmapRenderer consumers
