# Heatmap Accumulation and Button Toggle Fix

## Issues Fixed

### 1. Heatmap Canvas Not Clearing (Accumulation/Trails)
**Problem**: The heatmap was accumulating and leaving trails when panning/zooming or during initial page load.

**Root Cause**: `HeatmapRenderer._renderNow()` was not clearing the heatmap canvas before drawing new content. It only cleared the offscreen buffer and the overlay canvas when disabled, but when enabled, it would blit accumulated content on top of previous frames.

**Solution**: Added explicit canvas clearing at the start of `_renderNow()` before rendering new heatmap:
```javascript
// CRITICAL: Clear the heatmap canvas before drawing to prevent accumulation
try {
  if (renderContext.ctxHeatmap) {
    renderContext.ctxHeatmap.clearRect(0, 0, cssWidth, cssHeight);
  }
} catch (e) { console.error('HeatmapRenderer._renderNow: Failed to clear heatmap canvas:', e); }
```

**File Modified**: [rendering/HeatmapRenderer.js](../rendering/HeatmapRenderer.js#L98-L103)

### 2. Sidebar Heatmap Button Not Toggling
**Problem**: The sidebar heatmap button did not toggle the heatmap visibility, while key 4 worked correctly.

**Root Cause**: Double-update bug in the event flow:
1. SettingsController button click calls `layerState.setHeatmapVisible(newValue)` - updates state
2. SettingsController emits `DISPLAY_SETTINGS_CHANGED` event
3. map.js handler receives it and calls `map.setGridHeatmap(map.layerState.isHeatmapVisible())`
4. setGridHeatmap() checks `if (this._showGridHeatmap === enabled) return;` 
5. Since state was already updated in step 1, the condition is true and it returns early without marking the renderer dirty!

**Solution**: Changed DISPLAY_SETTINGS_CHANGED handler to directly mark HeatmapRenderer dirty instead of calling setGridHeatmap:
```javascript
eventBus.on(window.EventTypes.DISPLAY_SETTINGS_CHANGED, (data) => {
    try {
        // Display settings have changed, mark HeatmapRenderer dirty to re-render
        // NOTE: SettingsController already updated layerState before emitting this event,
        //       so we just need to mark the renderer dirty to trigger a re-render
        if (map && typeof map.markRendererDirty === 'function') {
            map.markRendererDirty('HeatmapRenderer');
        }
    } catch (e) {
        moduleErrorHandler.logError(e, 'EventBus:DISPLAY_SETTINGS_CHANGED handler');
    }
});
```

**File Modified**: [map.js](../map.js#L2152-L2161)

## How It Works Now

### Sidebar Button Click Flow
1. User clicks heatmap button
2. SettingsController updates `layerState.setHeatmapVisible(newValue)`
3. SettingsController emits `DISPLAY_SETTINGS_CHANGED`
4. map.js handler marks `HeatmapRenderer` dirty
5. RenderPipeline marks HeatmapRenderer for rendering in next frame
6. `HeatmapRenderer.render()` is called with dirty flag
7. `HeatmapRenderer._renderNow()` clears the heatmap canvas, re-renders content
8. Result: Clean toggle without accumulation

### Key 4 Flow (Already Working)
1. User presses key 4
2. KeyboardHandler calls `map.setGridHeatmap(!map._showGridHeatmap)` with opposite value
3. setGridHeatmap() checks early return - value is different, so continues
4. Calls `markRendererDirty('HeatmapRenderer')`
5. Same rendering flow as above

### Pan/Zoom Flow
1. User pans or zooms
2. PointerHandler emits `RENDER_REQUESTED`
3. map.js handler marks HeatmapRenderer dirty (among others)
4. HeatmapRenderer._renderNow() clears and re-renders with new screen coordinates
5. Result: No accumulation during pan/zoom

## Critical Points

- **Canvas clearing MUST happen before rendering** to prevent accumulation. The order is critical:
  1. Clear offscreen buffer
  2. Clear heatmap canvas on the actual rendering canvas
  3. Build and render heatmap data
  4. Blit result to heatmap canvas

- **Event handler timing** is critical. The DISPLAY_SETTINGS_CHANGED handler must not try to update state that was already updated by the sender.

- **HeatmapRenderer is in RENDER_REQUESTED** dirty list to ensure it renders during pan/zoom operations with current pan/zoom values.

## Testing

To verify the fixes:
1. Click heatmap button in sidebar - heatmap should toggle cleanly
2. Press key 4 - heatmap should toggle cleanly (should already work)
3. Pan map - no trails should appear
4. Zoom in/out - no accumulation should be visible
5. Initial page load - no trails or artifacts
