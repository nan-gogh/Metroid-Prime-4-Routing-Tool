# Sub-Canvas Architecture Refactor Plan

**Objective:** Decouple rendering of different layer types to eliminate forced redraws and improve performance

**Current State:** Single overlay canvas used by Grid, Markers, Route, Overlay renderers  
**Target State:** Each renderer has its own canvas, only redraws when its data changes

---

## Architecture Changes

### Canvas Structure

**Before:**
```
mapTiles (TileRenderer)
heatmapCanvas (HeatmapRenderer)
mapCanvas (ALL overlay: Grid + Markers + Route + Overlay)
```

**After:**
```
mapTiles (TileRenderer)
heatmapCanvas (HeatmapRenderer)
gridCanvas (GridRenderer) ← NEW
markerCanvas (MarkerRenderer) ← NEW
routeCanvas (RouteRenderer) ← NEW
overlayCanvas (OverlayRenderer) ← NEW (replaces mapCanvas)
```

### Rendering Pipeline Changes

**Before:**
```
OverlayClearStage → clears entire canvas
  → GridRenderer → draws to canvas
  → MarkerRenderer → draws to canvas
  → RouteRenderer → draws to canvas
  → OverlayRenderer → draws to canvas
```
**Problem:** One renderer's clear forces all to redraw

**After:**
```
GridRenderer → clears its canvas → draws to gridCanvas
MarkerRenderer → clears its canvas → draws to markerCanvas
RouteRenderer → clears its canvas → draws to routeCanvas
OverlayRenderer → clears its canvas → draws to overlayCanvas
CompositeStage → layers all canvases onto main display
```
**Benefit:** Each renderer only clears/redraws its own content

---

## Implementation Steps

### Phase 1: Canvas Setup
- [ ] Add new canvas elements to index.html (gridCanvas, markerCanvas, routeCanvas, overlayCanvas)
- [ ] Update RenderContext to expose all 7 canvases
- [ ] Update InteractiveMap to initialize all canvases and contexts

### Phase 2: Renderer Updates
- [ ] Update GridRenderer to use gridCanvas
- [ ] Update MarkerRenderer to use markerCanvas
- [ ] Update RouteRenderer to use routeCanvas
- [ ] Update OverlayRenderer to use overlayCanvas
- [ ] Add canvas clearing logic to each renderer

### Phase 3: Pipeline Changes
- [ ] Remove OverlayClearStage and HeatmapClearStage
- [ ] Add CompositeStage to layer canvases onto display
- [ ] Update RenderPipeline to handle independent canvases

### Phase 4: Cleanup
- [ ] Revert the band-aid fix in markRendererDirty()
- [ ] Update RENDERING_ARCHITECTURE_ISSUES.md with resolved issues
- [ ] Add tests for selective rendering with independent canvases

---

## Files to Modify

1. **index.html** - Add canvas elements
2. **map.js** - Initialize all canvases and contexts
3. **rendering/RenderContext.js** - Add new canvas accessors
4. **rendering/GridRenderer.js** - Use gridCanvas
5. **rendering/MarkerRenderer.js** - Use markerCanvas
6. **rendering/RouteRenderer.js** - Use routeCanvas
7. **rendering/OverlayRenderer.js** - Use overlayCanvas
8. **rendering/RenderPipeline.js** - Remove clear stage coupling
9. **RENDERING_ARCHITECTURE_ISSUES.md** - Document resolved issues

---

## Performance Impact

### Current Performance (Band-Aid Fix)
- Mark MarkerRenderer dirty → Forces Grid, Route, Overlay to redraw

### After Refactor
- Mark MarkerRenderer dirty → Only MarkerRenderer redraws
- Composite stage layers result onto display (very fast, GPU accelerated)

**Expected Improvements:**
- ✅ Reduced render calls per user interaction
- ✅ Better selective rendering efficiency
- ✅ Clearer architectural separation
- ✅ Easier to add new renderers without coupling
- ✅ Resolves Issues #1, #2, #4 from RENDERING_ARCHITECTURE_ISSUES.md

---

## Compositing Strategy

CompositeStage will:
1. Clear the display canvas
2. Draw gridCanvas to display (lowest layer)
3. Draw markerCanvas to display
4. Draw routeCanvas to display
5. Draw overlayCanvas to display (highest layer)

This is GPU-accelerated (drawImage is native operation).

---

## Risk Analysis

**Low Risk:**
- Canvas size/scaling already handled by existing code
- Each renderer already has independent rendering logic
- CompositeStage is simple drawImage operations

**Medium Risk:**
- Need to ensure all renderers properly clear their canvases
- Need to verify canvas context initialization for all 7 canvases
- Performance testing to confirm GPU acceleration benefits

**Mitigation:**
- Add validation tests for each canvas
- Verify canvas element creation and context acquisition
- Benchmark before/after performance

---

## Testing Strategy

### Unit Tests
- [ ] Each renderer clears its canvas properly
- [ ] Each renderer draws to correct canvas
- [ ] CompositeStage layers canvases correctly

### Integration Tests
- [ ] Mark individual renderer dirty → only that renderer redraws
- [ ] Multiple renderers marked dirty → all redraw independently
- [ ] No visual artifacts (missing content, blank canvases)
- [ ] Performance is better than band-aid approach

### Visual Tests
- [ ] Grid always visible when grid layer enabled
- [ ] Markers appear/disappear instantly
- [ ] Routes display correctly
- [ ] All layers composite cleanly

---

## Resolution of Architecture Issues

### Issues Resolved

**Issue #1: Plain Object Stage Identification** (Currently Fixed)
- ✅ No longer relevant when clear stages are removed

**Issue #4: Three Separate RAF Systems**
- ✅ Simplified to single RenderPipeline RAF
- ✅ Clear stages no longer needed

**Issue A: Inconsistent Batching Philosophy**
- ✅ All rendering through RenderPipeline
- ✅ No more forced redraws due to clear operations

**Related Issue: Forced Redraw Coupling**
- ✅ Removed dependency between unrelated renderers
- ✅ Each renderer truly independent

### Issues Still Present (For Future Work)

**Issue #2: RouteAnimation Independent RAF Loop** - Still needs consolidation  
**Issue #3: Event Handlers Bypass Batching** - Still needs audit  
**Issue #5: RouteAnimation Dual Pathway** - Still needs fixing  
**Issue #6: HeatmapRenderer Independent RAF** - Still needs review  
**Issue #7: Public clearDirtyFlags() Risk** - Still needs API restriction

---

## Notes

This refactor addresses the core architectural flaw causing the band-aid fix. By giving each renderer its own canvas, we eliminate the artificial coupling that forces all renderers to redraw when the canvas is cleared.

The compositing stage is a proven pattern in graphics applications and should provide minimal performance overhead while significantly improving architectural cleanliness.

This is a medium-effort refactor (few hours) that will provide long-term architectural benefits and reduce technical debt.
