# RAF Scheduling Analysis - Suspicious Code Patterns

## Summary
Found several RAF-related systems with critical interactions that could cause scheduling issues. The main concern is the separation between the RenderPipeline's RAF scheduling and the RouteAnimation's independent RAF, plus edit overlay RAF management.

---

## 1. RENDER PIPELINE RAF SCHEDULING

### RenderPipeline._scheduleRender() - [rendering/RenderPipeline.js](rendering/RenderPipeline.js#L53-L67)
**Lines 53-67**
```javascript
_scheduleRender() {
  if (this._frameScheduled) return;

  this._frameScheduled = true;
  requestAnimationFrame(() => {
    this._frameScheduled = false;
    this.render(this._dirtyFlags);
    this._dirtyFlags.clear();
  });
}
```
**Status:** ✓ GOOD - Properly gates RAF with `_frameScheduled` flag and clears dirty flags after render

**Risk Factor:** LOW - This is the primary rendering pathway and works correctly

---

## 2. ROUTE ANIMATION RAF (INDEPENDENT SYSTEM)

### RouteAnimation.startAnimation() - [data/RouteAnimation.js](data/RouteAnimation.js#L18-L51)
**Lines 18-51**
```javascript
startAnimation(map) {
    if (!map || map._routeRaf) return;

    map._lastRouteAnimTime = performance.now();
    const step = (timestamp) => {
        // ... animation frame calculation ...
        if (!map.currentRoute || !map.currentRoute.length) {
            this.stopAnimation(map);
            return;
        }

        try {
            if (map.render) map.render();
        } catch (e) {
            this.errorHandler.logDebug('RouteAnimation: render failed', 'RouteAnimation.step.render', { error: e });
        }

        map._routeRaf = requestAnimationFrame(step);
    };

    map._routeRaf = requestAnimationFrame(step);
}
```

**CRITICAL ISSUE FOUND:** ⚠️ **Calls `map.render()` directly inside RAF loop (Line 45)**
- This bypasses RenderPipeline's batching system entirely
- When route animation is running, every RAF frame calls render()
- This can conflict with RenderPipeline's `_scheduleRender()` batching
- No synchronization between the two RAF loops

### RouteAnimation.stopAnimation() - [data/RouteAnimation.js](data/RouteAnimation.js#L58-L66)
**Lines 58-66**
```javascript
stopAnimation(map) {
    if (!map) return;

    if (map._routeRaf) {
        cancelAnimationFrame(map._routeRaf);
        map._routeRaf = null;
    }
}
```
**Status:** ✓ GOOD - Properly cancels RAF and clears the ID

---

## 3. EDIT OVERLAY RAF MANAGEMENT

### map.js - hideEditOverlayProperly() - [map.js](map.js#L1954-L1980)
**Lines 1960-1961 (CRITICAL)**
```javascript
if (_editOverlayRaf_module) { 
    try { 
        cancelAnimationFrame(_editOverlayRaf_module); 
    } catch (e) { 
        moduleErrorHandler.logError(e, 'hideEditOverlayProperly.cancelAnimationFrame'); 
    } 
    _editOverlayRaf_module = null; 
}
```

**Issue Found:** ⚠️ **Module-scoped RAF cancellation**
- Cancels any pending edit overlay RAF before hiding
- Module-level variable `_editOverlayRaf_module` controls separate RAF
- This is a third RAF system independent of both RenderPipeline and RouteAnimation
- Could interact poorly if called while RenderPipeline RAF is pending

### map.js - updateEditOverlay() - [map.js](map.js#L2856-2900+)
**Lines 2856-2857 (Comments)**
```javascript
// Use module-scoped variables so exitEditModeForLayer can also control the RAF/timer
// Global edit-overlay alpha so both RAF-updates and on-show logic agree
```

**Status:** Module-level RAF coordination, risk of conflicts

---

## 4. TOOLTIP MANAGER RAF

### TooltipManager._schedule() - [rendering/TooltipManager.js](rendering/TooltipManager.js#L56-L61)
**Lines 56-61**
```javascript
_schedule() {
  if (this._pending) return;
  this._pending = true;
  requestAnimationFrame(this._boundRAF);
}

_applyPending() {
  this._pending = false;
  // ... update DOM ...
}
```

**Status:** ✓ GOOD - Simple RAF gating with `_pending` flag

---

## 5. HEATMAP RENDERER RAF

### HeatmapRenderer.render() - [rendering/HeatmapRenderer.js](rendering/HeatmapRenderer.js#L55-L75)
**Lines 55-75**
```javascript
render(renderContext) {
  if (!renderContext.ctx || !renderContext.canvas) return;
  
  try {
    if (!this.heatmapDisplayState || !this.heatmapDisplayState.isVisible()) {
      return;
    }
  } catch (e) { console.error('...'); }

  if (this._pendingRender) return;
  this._pendingRender = true;
  requestAnimationFrame(() => {
    this._pendingRender = false;
    try { this._renderNow(renderContext); } catch (e) { ... }
  });
}
```

**Status:** ✓ GOOD - Uses `_pendingRender` flag to prevent multiple RAF schedules

---

## 6. RENDER PIPELINE DIRTY FLAG INTERACTION

### map.js - markRendererDirty() - [map.js](map.js#L1543-L1572)
**Lines 1543-1572**
```javascript
markRendererDirty(rendererName) {
    if (this.renderPipeline && typeof this.renderPipeline.markDirty === 'function') {
        this.renderPipeline.markDirty(rendererName);
        
        // Auto-link dependent clear stages...
        const overlayRenderers = ['GridRenderer', 'MarkerRenderer', 'RouteRenderer', 'OverlayRenderer'];
        if (overlayRenderers.includes(rendererName)) {
            this.renderPipeline.markDirty('OverlayClearStage');
        }
        
        if (rendererName === 'HeatmapRenderer') {
            this.renderPipeline.markDirty('HeatmapClearStage');
        }
    } else {
        this.requestRender();
    }
}
```

**Status:** ✓ GOOD - Properly integrates with RenderPipeline system
- Marks dirty flags that trigger RAF
- Auto-marks dependent clear stages

---

## 7. EVENT BUS RAF COORDINATION

### map.js - EventBus listeners - [map.js](map.js#L2078+)
**Lines 2078-2300+ (Various event handlers)**

**Issue Found:** ⚠️ **Direct map.render() calls in event handlers**
- `[map.js#L2097]` - PAN event calls `map.render()`
- `[map.js#L2113]` - ZOOM event calls `map.render()`
- `[map.js#L2138]` - SCROLL event calls `map.render()`
- `[map.js#L2148]` - WHEEL event calls `map.render()`

These should use `markRendererDirty()` for batching instead of direct `render()` calls.

**Current behavior:**
1. Event fires
2. EventBus listener calls `map.render()` directly
3. `map.render()` calls `renderPipeline.render()` immediately (not batched)
4. RouteAnimation RAF also fires and calls `map.render()`
5. Multiple render cycles per frame possible

---

## 8. CLEARDIRTYFLAGS API (POTENTIAL ISSUE)

### RenderPipeline.clearDirtyFlags() - [rendering/RenderPipeline.js](rendering/RenderPipeline.js#L97-L101)
**Lines 97-101**
```javascript
clearDirtyFlags() {
  this._dirtyFlags.clear();
  return this;
}
```

**Risk:** ⚠️ **Publicly callable method that clears flags without scheduling**
- Could be called externally to accidentally clear pending renders
- No RAF scheduled if called before `_scheduleRender()`
- Could cause silent frame drops

**Current usage:** Not found in grep, but exists as public API

---

## 9. ROUTE RENDER CALLBACK

### map.js - routeRaf getter/setter - [map.js](map.js#L648-L656)
**Lines 648-656**
```javascript
get _routeRaf() {
    return this.routeAnimationState ? this.routeAnimationState.getAnimationFrameId() : this._fallbackRouteRaf;
}

set _routeRaf(value) {
    if (this.routeAnimationState) {
        this.routeAnimationState.setAnimationFrameId(value);
    } else {
        this._fallbackRouteRaf = value;
    }
}
```

**Issue Found:** ⚠️ **Dual pathway for route RAF**
- Primary path: `routeAnimationState.setAnimationFrameId()`
- Fallback path: `_fallbackRouteRaf` 
- RouteAnimation.js directly sets `map._routeRaf` expecting the fallback
- If RouteAnimationState exists, the setter redirects to it
- Potential for RAF ID loss if state isn't properly initialized

---

## SUMMARY OF ISSUES

### CRITICAL (Must Fix)
1. **RouteAnimation runs independent RAF loop** - Calls `map.render()` every frame, bypasses RenderPipeline batching
2. **Event handlers call render() directly** - PAN/ZOOM/SCROLL/WHEEL events bypass batching system
3. **Three separate RAF systems** - RenderPipeline, RouteAnimation, and EditOverlay don't coordinate

### HIGH PRIORITY
1. **Route RAF dual pathway** - RouteAnimation expects direct assignment, but redirects through state
2. **Edit overlay RAF cancellation** - Module-level RAF could conflict with pipeline RAF during transitions

### MEDIUM PRIORITY  
1. **clearDirtyFlags() public API** - Could be called to accidentally cancel pending renders
2. **No synchronization** between event system, route animation, and render pipeline

---

## RECOMMENDATIONS

1. **Route Animation Integration**
   - Make RouteAnimation respect RenderPipeline batching
   - Use `map.markRendererDirty('RouteRenderer')` instead of direct `render()`
   - Or synchronize RouteAnimation RAF with RenderPipeline RAF

2. **Event Handler Refactoring**
   - Change PAN/ZOOM/SCROLL event handlers to use `markRendererDirty()`
   - Let RenderPipeline batch all changes into one RAF frame
   - Coordinates with example in [map.js#L2089](map.js#L2089) comment: "batched via rAF"

3. **Edit Overlay RAF**
   - Consider integrating with RenderPipeline instead of separate RAF
   - Or ensure `hideEditOverlayProperly()` doesn't cancel RenderPipeline's RAF

4. **Add RAF Coordination Test**
   - Verify only one RAF loop runs per frame
   - Check frame timing with multiple renderers marked dirty
   - Test route animation + pan/zoom simultaneously

---

## FILES INVOLVED
- [rendering/RenderPipeline.js](rendering/RenderPipeline.js) - Primary RAF scheduler
- [data/RouteAnimation.js](data/RouteAnimation.js) - Independent RAF loop
- [map.js](map.js) - Event handlers, overlay RAF, render coordination
- [rendering/HeatmapRenderer.js](rendering/HeatmapRenderer.js) - Secondary RAF
- [rendering/TooltipManager.js](rendering/TooltipManager.js) - Minor RAF usage
- [state/RouteAnimationState.js](state/RouteAnimationState.js) - RAF ID management
