# Overlay Rendering & Clearing Fix

## Problems Identified

### 1. Overlay Canvas Not Clearing
**Symptom:** Overlay elements (grid, markers, routes) accumulate trails during pan/zoom instead of being cleanly redrawn each frame.

**Root Cause:** The `overlayClearStage` was defined in the RenderPipeline but was never marked as dirty during selective rendering operations. When pan/zoom events triggered `RENDER_REQUESTED`, the dirty flag system would:
1. Mark specific overlay renderers as dirty
2. RenderPipeline would skip stages not in the dirty set
3. `overlayClearStage` was skipped because it had no name/constructor.name was "Object"
4. Result: Canvas not cleared, new content drawn over old content = trails/accumulation

### 2. Lack of Modular Infrastructure Usage
**Symptom:** Overlay rendering wasn't properly using the decoupled modular infrastructure (dirty flags, batch rendering, etc.).

**Root Cause:** 
- `overlayClearStage` wasn't integrated into dirty flag system
- No automatic linking between overlay renderer dirty marking and canvas clearing
- Selective rendering logic didn't account for the clear stage

## Solutions Implemented

### 1. Give OverlayClearStage a Proper Name
**File:** `map.js` lines 130-157

```javascript
// Store reference to overlay clear stage for dirty marking
this._overlayClearStage = overlayClearStage;
```

Added a reference to store the stage so it can be identified by name.

### 2. Ensure OverlayClearStage is Always Marked Dirty with Overlays
**File:** `map.js` lines 1516-1530

Updated `markRendererDirty()` to automatically mark `OverlayClearStage` dirty whenever ANY overlay renderer is marked dirty:

```javascript
markRendererDirty(rendererName) {
    if (this.renderPipeline && typeof this.renderPipeline.markDirty === 'function') {
        this.renderPipeline.markDirty(rendererName);
        
        // When marking overlay renderers dirty, also mark OverlayClearStage dirty
        const overlayRenderers = ['GridRenderer', 'MarkerRenderer', 'RouteRenderer', 'OverlayRenderer'];
        if (overlayRenderers.includes(rendererName)) {
            this.renderPipeline.markDirty('OverlayClearStage');
        }
    }
```

### 3. Include OverlayClearStage in Full Render Requests
**File:** `map.js` lines 2033-2048

Updated `RENDER_REQUESTED` event handler to explicitly mark `OverlayClearStage` dirty:

```javascript
eventBus.on(window.EventTypes.RENDER_REQUESTED, (data) => {
    // ...
    const allRenderers = ['TileRenderer', 'HeatmapRenderer', 'OverlayClearStage', 'GridRenderer', 'MarkerRenderer', 'RouteRenderer', 'OverlayRenderer'];
    allRenderers.forEach(name => map.renderPipeline.markDirty(name));
```

## Rendering Pipeline Flow

### Before Fix (Problematic)
```
Pan/Zoom Event
    ↓
emit(RENDER_REQUESTED)
    ↓
Mark dirty: TileRenderer, HeatmapRenderer, GridRenderer, MarkerRenderer, RouteRenderer, OverlayRenderer
    ↓
RenderPipeline.render(dirtySet)
    ↓
[TileRenderer] → [HeatmapRenderer] → [OverlayClearStage*SKIPPED*] → [GridRenderer] → [MarkerRenderer] → [RouteRenderer] → [OverlayRenderer]
    ↓
Result: Canvas NOT cleared before drawing → trails accumulate
```

### After Fix (Correct)
```
Pan/Zoom Event
    ↓
emit(RENDER_REQUESTED)
    ↓
Mark dirty: TileRenderer, HeatmapRenderer, OverlayClearStage✓, GridRenderer, MarkerRenderer, RouteRenderer, OverlayRenderer
    ↓
RenderPipeline.render(dirtySet)
    ↓
[TileRenderer] → [HeatmapRenderer] → [OverlayClearStage✓] → [GridRenderer] → [MarkerRenderer] → [RouteRenderer] → [OverlayRenderer]
    ↓
Result: Canvas cleared before each frame → clean rendering, no trails
```

## Dirty Flag Auto-Linking

When overlay renderers are marked dirty individually (e.g., from markers changed):

```
markerManager.onChange()
    ↓
markRendererDirty('MarkerRenderer')
    ↓
Inside markRendererDirty:
  - Mark MarkerRenderer dirty
  - Check if it's an overlay renderer → YES
  - Also mark OverlayClearStage dirty ✓
    ↓
RenderPipeline.render()
    ↓
[OverlayClearStage✓] → [MarkerRenderer] → Clean frame
```

## Key Principles

1. **OverlayClearStage MUST run before ANY overlay rendering**
   - Canvas must be clean before drawing new content
   - Prevents accumulation/trails

2. **Automatic synchronization**
   - Whenever an overlay renderer is marked dirty, automatically mark OverlayClearStage dirty
   - No need to remember in every call site

3. **Modular infrastructure**
   - Uses existing dirty flag system
   - Uses existing batch rendering via RenderPipeline
   - No special-case logic needed

## Expected Results After Fix

✓ Pan/zoom operations produce clean frames without trails
✓ Grid, markers, and routes update smoothly during interactions
✓ No overlay accumulation on initial page load
✓ Selective rendering properly batches canvas operations
✓ Each frame clears overlay canvas before drawing
✓ Modular architecture properly decoupled and functional
