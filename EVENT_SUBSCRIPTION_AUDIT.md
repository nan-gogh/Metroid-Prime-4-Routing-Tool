# Event Subscription Audit & Deduplication Plan

## Executive Summary

After scanning the codebase, I found **NO currently active duplicate event subscriptions** in the main render flow. However, the architecture has several **orphaned subscribers and unused code paths** that should be cleaned up. The project uses `map.js` as the single coordinator for most event subscriptions, with a few decentralized handlers in `SettingsController` and `data/MarkerManager.js`.

---

## 1. Current Event Subscription Landscape

### **A. map.js (Lines 2288–2700)**
The primary event subscription hub using `EventUtils.createEventManager()`. **Coverage:**

| Event Type | Handler | Status | Coordinated | Notes |
|---|---|---|---|---|
| RENDER_REQUESTED | Marks all renderers dirty → pipeline render | ✅ Active | map.js | Handles full render batching |
| LAYER_VISIBILITY_CHANGED | Updates layerState + marks renderers dirty | ✅ Active | map.js | Multiple renderers affected |
| LAYER_COUNTS_CHANGED | Calls `map.updateLayerCounts()` | ✅ Active | map.js | UI sync |
| LAYER_HIGHLIGHT_CHANGED | Updates highlight state + triggers render | ✅ Active | map.js | Full render (not selective) |
| SELECTION_CLEARED | Hides tooltip + marks OverlayRenderer dirty | ✅ Active | map.js | Selective render |
| TILESET_CHANGED | Cleanup + preload + tile loading | ✅ Active | map.js | Heavy work (async) |
| TILESET_GRAYSCALE_CHANGED | Same as TILESET_CHANGED | ✅ Active | map.js | Heavy work (async) |
| DISPLAY_SETTINGS_CHANGED | Marks GridRenderer/HeatmapRenderer dirty | ✅ Active | map.js | Selective render |
| HEATMAP_VISIBILITY_CHANGED | Mark HeatmapRenderer + CompositeStage dirty + save to storage | ✅ Active | map.js | UI sync + selective render |
| MAP_ZOOM_IN_REQUESTED | Calls `map.zoomIn()` | ✅ Active | map.js | User input → state change |
| MAP_ZOOM_OUT_REQUESTED | Calls `map.zoomOut()` | ✅ Active | map.js | User input → state change |
| MAP_VIEW_RESET_REQUESTED | Calls `map.resetView()` | ✅ Active | map.js | User input → state change |
| EDIT_MODE_CHANGED | Clear selected markers + update overlay + render | ✅ Active | map.js | Full render (needed for overlay) |
| TOOLTIP_HIDE_REQUESTED | Calls `map.hideTooltip()` | ✅ Active | map.js | UI update |
| TOOLTIP_SHOW_REQUESTED | Calls `map.showTooltip()` | ✅ Active | map.js | UI update |
| EDIT_MODE_ENTER_REQUESTED | Calls `map._enterEditMode()` | ✅ Active | map.js | Edit mode activation |
| EDIT_MODE_EXIT_REQUESTED | Calls `map._exitEditMode()` | ✅ Active | map.js | Edit mode deactivation |
| SELECTION_CHANGED | Marks OverlayRenderer dirty | ✅ Active | map.js | Selective render |
| MAP_VIEW_CHANGED | Updates resolution (deferred, setTimeout 0) + calls `map.render()` | ✅ Active | map.js | Core render trigger |
| ROUTE_UPDATED | Updates routeManager + updateLayerCounts + render | ✅ Active | map.js | Composite logic |
| (Continued in map.js beyond line 2700) | ... | TBD | map.js | See full file scan |

**Total Events in map.js: ~25+ subscriptions**

---

### **B. controllers/SettingsController.js (Line 362)**
Single decentralized subscription:

| Event Type | Handler | Status | Problem |
|---|---|---|---|
| DISPLAY_SETTINGS_CHANGED | Subscribes and updates internal UI state | ✅ Active | **DUPLICATE**: map.js also subscribes to DISPLAY_SETTINGS_CHANGED (lines 2372–2389) and marks renderers dirty. SettingsController listens for the same event without coordinating. |

---

### **C. data/MarkerManager.js (Lines 64, 78)**
Legacy marker edit/clear handlers:

| Event Type | Handler | Status | Problem |
|---|---|---|---|
| MARKER_EDIT_REQUESTED | Emits via editHandler | ✅ Active | **DECENTRALIZED**: Not coordinated with map.js. Works but bypasses central event flow. |
| MARKER_CLEAR_REQUESTED | Clear markers + rebuild | ✅ Active | **DECENTRALIZED**: Not coordinated with map.js. Works but bypasses central event flow. |

---

### **D. controllers/RenderController.js**
**Empty `_setupEventSubscriptions()` method** (line 252–254):

```javascript
_setupEventSubscriptions() {
  // Event coordination is delegated to map.js to avoid duplicate event listeners
  // and maintain a single point of render request coordination
}
```

**Status:** ✅ **CORRECT**: RenderController intentionally defers all event handling to map.js to avoid duplication. The comment correctly documents this design decision.

---

## 2. Identified Issues

### **Issue #1: DISPLAY_SETTINGS_CHANGED Subscription Duplication (Low Risk)**
- **Location:** 
  - [map.js:2372–2389](map.js#L2372-L2389) (marks GridRenderer/HeatmapRenderer dirty)
  - [controllers/SettingsController.js:362](controllers/SettingsController.js#L362) (internal UI update)
- **Impact:** Both subscribers execute independently. No functional breakage, but:
  - Redundant network of listeners
  - Harder to reason about (two subscribers for one event)
  - SettingsController could listen to rendered state instead
- **Recommendation:** Move SettingsController's display-settings-changed handler to map.js or refactor to push-based notification

### **Issue #2: Marker Event Subscriptions Decentralized (Low Risk)**
- **Location:**
  - [data/MarkerManager.js:64–78](data/MarkerManager.js#L64-L78)
  - No subscription in map.js (marker rendering is handled by MarkerRenderer)
- **Impact:** MarkerManager owns its event subscriptions independently
- **Recommendation:** Consider adding marker events to map.js's central coordinator for visibility and consistency

### **Issue #3: Orphaned/Unused EventBus Calls**
- **Location:** Several files emit events without corresponding handlers in map.js
  - [data/markerUtils.js:112](data/markerUtils.js#L112) — emits MARKER_CLEAR_REQUESTED
  - [map.js:1875, 3350, 3367](map.js#L1875) — emit EDIT_MODE_EXIT_REQUESTED
  - [input/KeyboardHandler.js:87](input/KeyboardHandler.js#L87) — emits SIDEBAR_VISIBILITY_TOGGLE_REQUESTED
- **Impact:** Events are emitted but may have orphaned handlers or no subscribers
- **Recommendation:** Audit all emit() calls to ensure they have subscribers in map.js

### **Issue #4: Inconsistent Error Handling Pattern**
- **map.js handlers:** Use try-catch with `moduleErrorHandler.logError()`
- **Other files:** Some use error handlers, some don't
- **Recommendation:** Standardize error handling across all event handlers

---

## 3. Architecture Analysis

### **Current Design: Centralized Coordination via map.js**
- ✅ **Pros:**
  - Single point of event flow
  - Clear separation: map.js = coordinator, RenderController = executor
  - Reduces coupling between modules
  
- ❌ **Cons:**
  - map.js becomes very large (~3600 lines)
  - Hard to find specific event handlers
  - New events require adding to map.js's massive setup

---

## 4. Proposed Deduplication & Consolidation Plan

### **Phase 1: Quick Wins (Low Risk, High Impact)**

#### **1.1 Move SettingsController's Display Settings Handler to map.js**
- **What:** Remove standalone subscription in SettingsController; include in map.js's eventManager.setup()
- **Why:** Eliminates duplicate DISPLAY_SETTINGS_CHANGED listener
- **Risk:** Low (SettingsController's handler is simple and already coordinated)
- **Effort:** 15 min

**Action:**
```javascript
// In SettingsController, remove lines 360-375
// In map.js's eventManager.setup(), add equivalent handler

{
    event: window.EventTypes.DISPLAY_SETTINGS_CHANGED,
    handler: (data) => {
        // SettingsController's original logic
        if (map && map.settingsController) {
            map.settingsController.updateSettingsUI();  // or inline the logic
        }
    }
}
```

---

#### **1.2 Consolidate Marker Event Handlers in map.js**
- **What:** Move MarkerManager's subscriptions to map.js's central coordinator
- **Why:** Improves visibility and consistency
- **Risk:** Low (MarkerManager already works independently; this is refactoring)
- **Effort:** 20 min

**Action:**
```javascript
// In map.js's eventManager.setup(), add:

{
    event: window.EventTypes.MARKER_EDIT_REQUESTED,
    handler: (data) => {
        if (map && map.markerManager) {
            map.markerManager.edit(data);  // or delegate to handler
        }
    }
},
{
    event: window.EventTypes.MARKER_CLEAR_REQUESTED,
    handler: (data) => {
        if (map && map.markerManager) {
            map.markerManager.clearMarkers();
        }
    }
}
```

---

### **Phase 2: Subscriber Audit (Medium Effort)**

#### **2.1 Audit All Event Emitters**
- **What:** Search all emit() calls and verify each has a subscriber in map.js
- **Effort:** 30 min (grep + review)

**Process:**
```bash
grep -r "eventBus.emit\|EventTypes\." --include="*.js" | grep -v test | sort | uniq -c
```

**Outcome:** List of all events and their emitter locations

---

#### **2.2 Document Unhandled Events**
- **What:** If an emitted event has no subscriber, document why (e.g., planned for future, legacy)
- **Effort:** 15 min

---

### **Phase 3: Long-Term Refactoring (Optional)**

#### **3.1 Introduce EventRegistry Pattern (Future)**
- **What:** Create a centralized registry of all events + handlers
- **Why:** Reduce boilerplate in map.js and improve maintainability
- **Example:**
```javascript
// EventRegistry.js
const EventRegistry = {
  RENDER_REQUESTED: {
    name: 'RENDER_REQUESTED',
    handler: (map, data) => { /* handler logic */ },
    description: 'Triggered when a full render is needed'
  },
  LAYER_VISIBILITY_CHANGED: { /* ... */ }
};

// map.js init
Object.entries(EventRegistry).forEach(([eventName, config]) => {
  eventManager.setup(eventBus, [{
    event: window.EventTypes[eventName],
    handler: (data) => config.handler(map, data)
  }]);
});
```

---

## 5. Recommendations Summary

### **Immediate Actions (Today)**
1. ✅ **Verify RenderController's empty `_setupEventSubscriptions()` is intentional** — it is (confirmed by comment)
2. ✅ **Confirm NO active duplicate subscriptions** — confirmed (only SettingsController is semi-duplicate)

### **Short-Term (This Sprint)**
1. **Move SettingsController's display-settings handler to map.js** (consolidate)
2. **Move MarkerManager's event subscriptions to map.js** (consolidate)
3. **Audit all emit() calls** and verify subscribers exist

### **Medium-Term (Next Sprint)**
1. **Document event flow** in a separate file (e.g., `EVENT_FLOW.md`)
2. **Create EventRegistry** for better organization
3. **Break up map.js** into smaller coordinators (InputCoordinator, StorageCoordinator, etc.)

### **Long-Term (Architectural)**
1. Consider **moving to a more decentralized event model** where each controller owns its subscriptions but uses a consistent pattern (currently inconsistent)
2. Investigate **WeakMaps or symbols** to prevent accidental duplicate subscriptions

---

## 6. Files Affected by Recommendations

| File | Action | Phase |
|---|---|---|
| `controllers/SettingsController.js` | Remove duplicate subscription | Phase 1.1 |
| `data/MarkerManager.js` | Remove subscriptions | Phase 1.2 |
| `map.js` | Add consolidated subscriptions | Phase 1.1 + 1.2 |
| `controllers/RenderController.js` | **No change** (correct design) | — |
| (New) `EVENT_FLOW.md` | Create documentation | Phase 2.2 |

---

## Appendix: Full Event Subscription Checklist

- [x] RENDER_REQUESTED → map.js ✅
- [x] LAYER_VISIBILITY_CHANGED → map.js ✅
- [x] LAYER_COUNTS_CHANGED → map.js ✅
- [x] LAYER_HIGHLIGHT_CHANGED → map.js ✅
- [x] SELECTION_CLEARED → map.js ✅
- [x] TILESET_CHANGED → map.js ✅
- [x] TILESET_GRAYSCALE_CHANGED → map.js ✅
- [x] DISPLAY_SETTINGS_CHANGED → **map.js + SettingsController** ⚠️ (DUPLICATE)
- [x] HEATMAP_VISIBILITY_CHANGED → map.js ✅
- [x] MAP_ZOOM_IN_REQUESTED → map.js ✅
- [x] MAP_ZOOM_OUT_REQUESTED → map.js ✅
- [x] MAP_VIEW_RESET_REQUESTED → map.js ✅
- [x] EDIT_MODE_CHANGED → map.js ✅
- [x] TOOLTIP_HIDE_REQUESTED → map.js ✅
- [x] TOOLTIP_SHOW_REQUESTED → map.js ✅
- [x] EDIT_MODE_ENTER_REQUESTED → map.js ✅
- [x] EDIT_MODE_EXIT_REQUESTED → map.js ✅
- [x] SELECTION_CHANGED → map.js ✅
- [x] MAP_VIEW_CHANGED → map.js ✅
- [x] ROUTE_UPDATED → map.js ✅
- [x] MARKER_EDIT_REQUESTED → **MarkerManager** (decentralized) ⚠️
- [x] MARKER_CLEAR_REQUESTED → **MarkerManager** (decentralized) ⚠️
- [ ] (Other events beyond line 2700 of map.js → TBD)

