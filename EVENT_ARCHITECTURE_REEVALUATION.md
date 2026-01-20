# Event Architecture Re-evaluation
## Compliance with Rendering Architecture, Event Bus Logic, and Modular Infrastructure Goals

**Date:** 2026-01-20  
**Context:** Re-evaluation of event subscription consolidation plan against project principles

---

## 1. Project Architectural Principles (Re-established)

From the codebase and documentation, the intended architecture is:

1. **Separation of Concerns**: Each module owns its domain-specific logic
2. **Event Bus as Decoupling**: Modules communicate via events, not direct calls
3. **Decentralized Ownership**: Domain owners subscribe to their relevant events
4. **Single Render Coordinator**: Render pipeline batching via RenderController
5. **No Module Coupling**: Dependencies flow inward; event flow is outward

---

## 2. Critical Architectural Analysis

### **A. Current Reality vs. Intended Design**

**Current State (map.js as Universal Coordinator):**
```javascript
// map.js: lines 2288–2700
const eventManager = window.EventUtils.createEventManager(window, '_pendingEventUnsubscribers');
eventManager.setup(eventBus, [
  // 25+ event subscriptions, ALL in map.js
  { event: RENDER_REQUESTED, handler: ... },
  { event: LAYER_VISIBILITY_CHANGED, handler: ... },
  { event: TILESET_CHANGED, handler: ... },
  { event: DISPLAY_SETTINGS_CHANGED, handler: ... },
  { event: MARKER_EDIT_REQUESTED, handler: ... },
  // ... etc
]);
```

**Problems with Centralized Coordination in map.js:**

| Problem | Impact | Severity |
|---------|--------|----------|
| **Violation of Separation of Concerns** | map.js owns subscriptions for domains it doesn't own (markers, settings, tiles, etc.) | HIGH |
| **Poor Scalability** | Every new event requires modifying map.js; no modular addition path | HIGH |
| **Tight Coupling** | map.js knows about MarkerManager, SettingsController, TileRenderer internals | HIGH |
| **Code Bloat** | map.js has 3600+ lines; event setup adds 400+ more | MEDIUM |
| **Testability** | Testing event logic requires instantiating entire map; can't test subscriptions in isolation | MEDIUM |
| **Discoverability** | Where do I find the handler for MARKER_EDIT_REQUESTED? → Buried in map.js | MEDIUM |

---

### **B. What Each Module Should Own (Correct Design)**

Based on the principle **"Domain owners manage their event subscriptions"**:

#### **1. RenderController → Render-Related Events**
```javascript
// CORRECT PRINCIPLE: RenderController owns rendering concerns
RenderController.prototype._setupEventSubscriptions = function() {
  // RenderController subscribes to events that trigger rendering
  eventBus.on(EventTypes.RENDER_REQUESTED, () => this._requestRender());
  eventBus.on(EventTypes.MAP_VIEW_CHANGED, () => this._requestRender());
  eventBus.on(EventTypes.TILESET_CHANGED, () => this.markRendererDirty('TileRenderer'));
  eventBus.on(EventTypes.LAYER_VISIBILITY_CHANGED, () => this.markRendererDirty('*'));
  eventBus.on(EventTypes.DISPLAY_SETTINGS_CHANGED, (data) => {
    if (data.gridVisible !== undefined) this.markRendererDirty('GridRenderer');
    if (data.heatmapVisible !== undefined) this.markRendererDirty('HeatmapRenderer');
  });
  // ... other rendering concerns
};
```

**Why?**
- Rendering is RenderController's domain
- Render batching logic is already here
- Follows the "single executor, single subscriber" pattern
- Self-contained; can be tested in isolation

---

#### **2. MarkerManager → Marker-Domain Events**
```javascript
// CORRECT PRINCIPLE: Domain owner manages its events
MarkerManager.prototype._setupEventSubscriptions = function() {
  // MarkerManager owns marker data and subscriptions
  this.eventBus.on(EventTypes.MARKER_EDIT_REQUESTED, (data) => {
    this._handleEditRequest(data);
  });
  this.eventBus.on(EventTypes.MARKER_CLEAR_REQUESTED, () => {
    this.clearMarkers();
  });
};
```

**Why?**
- MarkerManager owns marker state and data
- Marker events are part of marker domain, not rendering domain
- Better separation; MarkerManager can be replaced without touching map.js

**Current State:** ✅ MarkerManager already does this (lines 64–78)

---

#### **3. SettingsController → Display Settings**
```javascript
// CORRECT PRINCIPLE: Each controller owns its UI/state concerns
SettingsController.prototype._setupEventSubscriptions = function() {
  // SettingsController subscribes to its domain events for UI state sync
  this.eventBus.on(EventTypes.DISPLAY_SETTINGS_CHANGED, (data) => {
    this.updateSettingsUI();  // UI state update
  });
};
```

**Why?**
- SettingsController owns display settings UI
- This is NOT a rendering concern; it's a UI concern
- This is NOT a duplicate—it's a different subscriber for a different reason:
  - RenderController: "Re-render when settings change" (rendering concern)
  - SettingsController: "Update UI to reflect settings" (UI concern)

**Current State:** ✅ SettingsController already does this (line 362)

---

#### **4. InteractiveMap (map.js) → User Input & Navigation**
```javascript
// CORRECT PRINCIPLE: map.js owns user interaction coordination
InteractiveMap.prototype._setupUserInputSubscriptions = function() {
  // Map navigation/user input events
  eventBus.on(EventTypes.MAP_ZOOM_IN_REQUESTED, () => this.zoomIn());
  eventBus.on(EventTypes.MAP_ZOOM_OUT_REQUESTED, () => this.zoomOut());
  eventBus.on(EventTypes.MAP_VIEW_RESET_REQUESTED, () => this.resetView());
  
  // Modal/UI overlay events
  eventBus.on(EventTypes.EDIT_MODE_ENTER_REQUESTED, (data) => this._enterEditMode(data.mode));
  eventBus.on(EventTypes.EDIT_MODE_EXIT_REQUESTED, (data) => this._exitEditMode(data.mode));
  
  // Tooltip management (UI concern of the map display)
  eventBus.on(EventTypes.TOOLTIP_SHOW_REQUESTED, (data) => this.showTooltip(...));
  eventBus.on(EventTypes.TOOLTIP_HIDE_REQUESTED, () => this.hideTooltip());
};
```

**Why?**
- map.js is the InteractiveMap—user input coordination is its domain
- These are NOT rendering events; they're interaction/state events
- Should remain in map.js (but separate from rendering concerns)

---

#### **5. InputController (future) → Input Device Subscriptions**
```javascript
// CORRECT PRINCIPLE: Controllers own their specific concerns
InputController.prototype._setupEventSubscriptions = function() {
  // Input pipeline events (zoom, pan, rotation) triggered by user devices
  this.eventBus.on(EventTypes.INPUT_ZOOM_DETECTED, (data) => {
    // Input controller processes and may emit MAP_VIEW_CHANGED
    this.mapState.setZoom(data.zoom);
  });
};
```

---

## 3. Corrected Subscription Ownership Model

### **Subscription Matrix (Correct Design)**

| Event Type | Current Owner | **Correct Owner** | Reason |
|---|---|---|---|
| RENDER_REQUESTED | map.js | **RenderController** | Rendering concern; controller owns pipeline |
| MAP_VIEW_CHANGED | map.js | **InteractiveMap (map.js)** | State-derived event: keep state side-effects in `map.js`, then emit `RENDER_REQUESTED` for RenderController |
| TILESET_CHANGED | map.js | **RenderController** | Tile rendering state; mark TileRenderer dirty |
| TILESET_GRAYSCALE_CHANGED | map.js | **RenderController** | Tile rendering state |
| LAYER_VISIBILITY_CHANGED | map.js | **RenderController** | Affects render; multiple renderers dirty |
| DISPLAY_SETTINGS_CHANGED | map.js + SettingsController | **RenderController** (render) + **SettingsController** (UI) | Two concerns, should have two subscribers |
| HEATMAP_VISIBILITY_CHANGED | map.js | **RenderController** | Render pipeline concern |
| LAYER_HIGHLIGHT_CHANGED | map.js | **RenderController** | Render concern |
| LAYER_COUNTS_CHANGED | map.js | **RenderController** (or UI layer) | Render or UI concern |
| SELECTION_CHANGED | map.js | **RenderController** | Mark OverlayRenderer dirty |
| SELECTION_CLEARED | map.js | **RenderController** | Mark OverlayRenderer dirty |
| MARKER_EDIT_REQUESTED | map.js ❌ | **MarkerManager** ✅ | Marker domain; already correct |
| MARKER_CLEAR_REQUESTED | map.js ❌ | **MarkerManager** ✅ | Marker domain; already correct |
| MAP_ZOOM_IN_REQUESTED | map.js | **InteractiveMap** ✅ | User input; already correct |
| MAP_ZOOM_OUT_REQUESTED | map.js | **InteractiveMap** ✅ | User input; already correct |
| MAP_VIEW_RESET_REQUESTED | map.js | **InteractiveMap** ✅ | User input; already correct |
| EDIT_MODE_CHANGED | map.js | **InteractiveMap** | Edit mode state; already correct |
| EDIT_MODE_ENTER_REQUESTED | map.js | **InteractiveMap** | Edit mode interaction; already correct |
| EDIT_MODE_EXIT_REQUESTED | map.js | **InteractiveMap** | Edit mode interaction; already correct |
| TOOLTIP_HIDE_REQUESTED | map.js | **InteractiveMap** | Tooltip is map UI; already correct |
| TOOLTIP_SHOW_REQUESTED | map.js | **InteractiveMap** | Tooltip is map UI; already correct |
| ROUTE_UPDATED | map.js | **RouteController** (planned) | Route domain concern |

---

## 4. Principle-Based Reallocation

### **The Core Issue: Mixing Concerns in map.js**

**Current Problem:**
```
map.js (3600 lines)
├── User Input Events (correct domain)
│   ├── MAP_ZOOM_IN_REQUESTED
│   ├── MAP_VIEW_RESET_REQUESTED
│   └── EDIT_MODE_*_REQUESTED
├── Render Events (WRONG - should be RenderController)
│   ├── RENDER_REQUESTED
│   ├── MAP_VIEW_CHANGED
│   ├── TILESET_CHANGED
│   └── LAYER_VISIBILITY_CHANGED
├── Marker Events (WRONG - should be MarkerManager)
│   ├── MARKER_EDIT_REQUESTED ❌
│   └── MARKER_CLEAR_REQUESTED ❌
└── Tooltip Events (correct domain—map UI)
    ├── TOOLTIP_SHOW_REQUESTED
    └── TOOLTIP_HIDE_REQUESTED
```

**Correct Distribution:**

```
RenderController (controller)
├── RENDER_REQUESTED
├── MAP_VIEW_CHANGED → marks all renderers dirty
├── TILESET_CHANGED → marks TileRenderer dirty
├── LAYER_VISIBILITY_CHANGED → marks MarkerRenderer/RouteRenderer dirty
├── DISPLAY_SETTINGS_CHANGED → marks GridRenderer/HeatmapRenderer dirty
├── HEATMAP_VISIBILITY_CHANGED → marks HeatmapRenderer dirty
└── SELECTION_* → marks OverlayRenderer dirty

MarkerManager (data manager)
├── MARKER_EDIT_REQUESTED → edit marker data
└── MARKER_CLEAR_REQUESTED → clear markers

SettingsController (UI controller)
└── DISPLAY_SETTINGS_CHANGED → update UI buttons/state

InteractiveMap/map.js (map interaction coordinator)
├── MAP_ZOOM_IN_REQUESTED → zoomIn()
├── MAP_ZOOM_OUT_REQUESTED → zoomOut()
├── MAP_VIEW_RESET_REQUESTED → resetView()
├── EDIT_MODE_CHANGED → updateEditOverlay()
├── EDIT_MODE_ENTER_REQUESTED → _enterEditMode()
├── EDIT_MODE_EXIT_REQUESTED → _exitEditMode()
├── TOOLTIP_SHOW_REQUESTED → showTooltip()
└── TOOLTIP_HIDE_REQUESTED → hideTooltip()
```

---

## 5. Re-evaluated Consolidation Plan (Corrected)

### **Phase 1: Move Render Subscriptions from map.js → RenderController**

**What:** Move lines 2290–2550 (render-related subscriptions) from map.js's eventManager.setup() into RenderController._setupEventSubscriptions()

- RENDER_REQUESTED
- TILESET_CHANGED
- TILESET_GRAYSCALE_CHANGED
- LAYER_VISIBILITY_CHANGED
- LAYER_HIGHLIGHT_CHANGED
- DISPLAY_SETTINGS_CHANGED (render portion only)
- HEATMAP_VISIBILITY_CHANGED
- SELECTION_CLEARED
- SELECTION_CHANGED

**Why:** 
- Rendering is RenderController's domain
- Follows separation of concerns
- RenderController can handle its own pipeline batching
- Reduces map.js bloat

**Risk:** Low (RenderController already has _requestRender() and markRendererDirty())

**Effort:** 45 min (move subscriptions + adjust cleanup in destroy())

---

### **Phase 2: Verify MarkerManager & SettingsController Ownership**

**What:** Confirm these already own their domain events correctly

**Events:**
- MarkerManager: MARKER_EDIT_REQUESTED, MARKER_CLEAR_REQUESTED ✅ (already correct)
- SettingsController: DISPLAY_SETTINGS_CHANGED ✅ (already correct for UI concern)

**Action:** Add JSDoc comments explaining why these remain decentralized

**Why:**
- Not duplicates—different concerns
- Already follow separation of concerns
- No changes needed

**Risk:** None

**Effort:** 10 min (documentation)

---

### **Phase 3: Cleanup map.js Event Subscriptions**

**What:** Remove render-related subscriptions from map.js; keep only user input/map control events

**Events to Keep in map.js:**
- MAP_ZOOM_IN_REQUESTED
- MAP_ZOOM_OUT_REQUESTED
- MAP_VIEW_RESET_REQUESTED
- EDIT_MODE_CHANGED
- EDIT_MODE_ENTER_REQUESTED
- EDIT_MODE_EXIT_REQUESTED
- TOOLTIP_HIDE_REQUESTED
- TOOLTIP_SHOW_REQUESTED

**Why:**
- These are map interaction concerns
- map.js owns the map state and user input coordination
- Reduces map.js from 3600 to ~3100 lines

**Risk:** Low (just moving code, not changing logic)

**Effort:** 30 min

---

### **Phase 4: Update RenderController._setupEventSubscriptions()**

**What:** Implement full subscription setup (currently empty)

**Code Pattern:**
```javascript
_setupEventSubscriptions() {
  if (!this.eventBus) return;
  
  // Render batching trigger: full render on RENDER_REQUESTED
  this._eventUnsubscribers.push(
    this.eventBus.on(window.EventTypes.RENDER_REQUESTED, () => {
      this._requestRender();
    })
  );
  
  // NOTE: `MAP_VIEW_CHANGED` is state-derived and should be handled in `map.js`.
  // `map.js` should perform any state-side effects (resolution selection, storage, UI updates)
  // and then emit `RENDER_REQUESTED` or `RENDER_SELECTIVE_REQUESTED` which RenderController subscribes to.
  // RenderController should therefore subscribe to render intent events only:
  // (Example shown above: RENDER_REQUESTED -> this._requestRender())
  
  // ... etc for all render events
}
```

**Why:**
- Centralizes render subscription logic in the render controller
- Proper domain ownership
- Easier to test render subscription behavior

**Risk:** Low (RenderController already has cleanup infrastructure)

**Effort:** 60 min

---

## 6. Compliance Matrix (Corrected Plan)

### **Architecture Principles Compliance**

| Principle | Current State | After Correction |
|-----------|---|---|
| **Separation of Concerns** | ❌ Violated (map.js owns all domains) | ✅ Fixed (each owner manages their domain) |
| **Event Bus as Decoupling** | ❌ Partially (render still coupled via map.js) | ✅ Full (modules decouple via events, not function calls) |
| **Decentralized Ownership** | ❌ Centralized in map.js | ✅ Distributed (RenderController, MarkerManager, SettingsController, etc.) |
| **Single Render Coordinator** | ✅ RenderController owns pipeline | ✅ Maintained (now also owns subscriptions) |
| **No Module Coupling** | ❌ map.js knows about all modules' internals | ✅ Improved (modules communicate via events) |
| **Proper Module Usage** | ❌ Modules don't own their concerns | ✅ Improved (each module owns its subscriptions) |

---

## 7. Implementation Sequence (Prioritized)

### **Must-Do (High Priority - Restore Architecture)**
1. **Phase 1:** Move render subscriptions from map.js → RenderController
2. **Phase 3:** Cleanup map.js; remove render concerns

### **Should-Do (Medium Priority - Documentation)**
3. **Phase 2:** Document why SettingsController & MarkerManager remain decentralized (not duplicates)

### **Nice-to-Have (Low Priority - Optimization)**
4. **Phase 4:** Implement RenderController._setupEventSubscriptions() with full subscription setup

---

## 8. Summary of Changes

### **Final Subscription Distribution**

| Module | Responsibility | Events |
|---|---|---|
| **RenderController** | Pipeline batching + render triggers | RENDER_REQUESTED, MAP_VIEW_CHANGED, TILESET_*, LAYER_*, DISPLAY_SETTINGS_CHANGED (render), HEATMAP_*, SELECTION_* |
| **InteractiveMap/map.js** | User input coordination + map UI | MAP_ZOOM_*, MAP_VIEW_RESET, EDIT_MODE_*, TOOLTIP_* |
| **MarkerManager** | Marker data management | MARKER_EDIT_REQUESTED, MARKER_CLEAR_REQUESTED |
| **SettingsController** | Display settings UI | DISPLAY_SETTINGS_CHANGED (UI portion) |

### **Files to Modify**
1. `controllers/RenderController.js` — Implement _setupEventSubscriptions()
2. `map.js` — Remove render subscriptions, keep user input subscriptions
3. `controllers/SettingsController.js` — Add clarifying comment (no logic change)
4. `data/MarkerManager.js` — Add clarifying comment (no logic change)

### **Expected Outcomes**
- ✅ Better separation of concerns
- ✅ Proper module ownership
- ✅ Easier to test and maintain
- ✅ Clearer event flow and discoverability
- ✅ Reduced map.js bloat
- ✅ Full compliance with decoupling principles

