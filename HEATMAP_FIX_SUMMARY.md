# Heatmap & Grid Separation Fix

## Problems Identified

1. **Undefined Canvas Context Error**
   - HeatmapRenderer was trying to use `this.ctx` which was never initialized
   - This caused: `TypeError: Cannot read properties of undefined (reading 'save')`
   - When pressing key 4, the heatmap would fail to render with this error

2. **Architectural Spaghetti**
   - GridRenderer contained duplicate heatmap rendering code (~130 lines)
   - Both GridRenderer and HeatmapRenderer were trying to render to the same heatmap canvas
   - Grid and heatmap were conflated under the name "gridHeatmap" (confusing naming)

3. **Canvas Accumulation Issue**
   - GridRenderer was clearing the heatmap canvas every frame
   - But GridRenderer also had its own heatmap drawing code
   - When HeatmapRenderer tried to render, both were interfering with each other
   - This caused overlays (grid, markers) to disappear on second toggle

## Solutions Implemented

### 1. Fixed HeatmapRenderer Canvas Context
**File:** `rendering/HeatmapRenderer.js` (line 154)
- Changed: `this.ctx.save()` 
- To: Use `renderContext.ctxHeatmap` properly
- HeatmapRenderer now gets canvas context from `renderContext` parameter
- Added null check: returns early if `ctxHeatmap` is not available

### 2. Removed Duplicate Heatmap Code from GridRenderer
**File:** `rendering/GridRenderer.js` (lines 170-267)
- Deleted ~130 lines of duplicate heatmap rendering logic
- Removed heatmap canvas clearing from GridRenderer
- GridRenderer now focuses solely on drawing the 8x8 grid
- HeatmapRenderer handles its own canvas clearing when disabled

### 3. Clean Separation of Concerns
- **HeatmapRenderer**: Responsible for green crystal density heatmap visualization
  - Uses dedicated `heatmapCanvas` (z-index: 1)
  - Renders above tiles but below markers
  - Uses offscreen buffer with radial gradients
  - Clears canvas when disabled

- **GridRenderer**: Responsible for 8x8 grid visualization
  - Uses overlay canvas context (z-index: 2)
  - Draws cyan grid lines
  - Draws axis labels
  - No longer touches heatmap canvas

## Rendering Pipeline Order
1. TileRenderer (z-index: 0) - Background tiles
2. HeatmapRenderer (z-index: 1) - Green crystal heatmap
3. OverlayClearStage - Clear overlay canvas
4. GridRenderer (z-index: 2) - 8x8 grid lines
5. MarkerRenderer (z-index: 2) - Markers and highlights
6. RouteRenderer (z-index: 2) - Routes
7. OverlayRenderer (z-index: 2) - Tooltips

## Expected Behavior After Fix

✓ Pressing key 4 toggles heatmap visibility
✓ Heatmap button in sidebar updates state correctly
✓ Grid and markers remain visible when heatmap is toggled
✓ No canvas corruption or accumulation of overlays
✓ Each renderer manages its own canvas independently
✓ No more `undefined context` errors

## Naming Convention Notes
- The toggle is still called "gridHeatmap" due to UI consistency
- But internally they are now properly separated
- Future refactor could rename to `heatmapVisible` for clarity
