# map.js Refactoring Plan: Tight Coupling Resolution

## Overview

**Problem:** `map.js` contains ~500+ lines of initialization logic for settings, input handlers, rendering pipeline, data loading, and marker/route setup — all tightly coupled in one file.

**Goal:** Extract initialization concerns into small, focused controllers while preserving:
- Event-driven architecture (EventBus-first communication)
- Decoupled modules (no direct cross-references)
- Separation of concerns (input, render, data, settings)
- Proper lifecycle management (`init()` and `destroy()`)
- Dependency injection (no global access; passed via constructor)

---

## Proposed Architecture

### New Controller Structure

```
controllers/
├── SettingsController.js    # App settings UI, persistence, emits setting-change events
├── InputController.js       # Gesture, keyboard, pointer handler lifecycle
├── RenderController.js      # RenderPipeline, TileRenderer, RouteRenderer, OverlayRenderer
├── DataController.js        # Config loading, MarkerManager, storage hooks
└── (BootstrapController.js) # Optional: thin orchestrator kept in map.js bootstrap
```

### Controller Responsibilities

#### 1. **SettingsController**
- **Inputs:** `{ eventBus, containerNode, errorHandler, storageUtils }`
- **Lifecycle:**
  - `init()`: Create settings UI, bind event listeners to DOM elements (radio buttons, toggles, etc.)
  - `destroy()`: Remove all DOM event listeners, unsubscribe from EventBus
- **Event Publishing:**
  - Emits `settings:mapModeChanged`, `settings:gridToggled`, `settings:tileLayerChanged` via EventBus
  - Subscribes to `render:request` to persist render state
- **Internal State:** Caches current settings (map mode, tile layer, grid visibility)
- **Files Modified:** Will read from HTML; integrate with `storageUtils` for persistence

---

#### 2. **InputController**
- **Inputs:** `{ eventBus, canvas, containerNode, mapState, errorHandler }`
- **Lifecycle:**
  - `init()`: Instantiate `GestureHandler`, `KeyboardHandler`, `PointerHandler`; call their `init()` methods
  - `destroy()`: Call `destroy()` on all three handlers (they handle their own cleanup)
- **Event Publishing & Subscription:**
  - Handlers publish pan/zoom/selection events to EventBus
  - Subscribes to no events (pure input → event pipeline)
- **Internal State:** Stores references to the three handler instances for lifecycle management
- **No Changes to Handlers Themselves:** Handlers already follow constructor/init/destroy pattern

---

#### 3. **RenderController**
- **Inputs:** `{ eventBus, canvas, containerNode, mapState, routeState, layerState, selectionState, errorHandler, config }`
- **Lifecycle:**
  - `init()`: Create `RenderPipeline`, instantiate all renderers (`TileRenderer`, `RouteRenderer`, `OverlayRenderer`, etc.), start animation loop
  - `destroy()`: Cancel animation loop, call `destroy()` on pipeline and all renderers
- **Event Publishing & Subscription:**
  - Emits `render:frameRequest`, `render:frameComplete` during animation loop
  - Subscribes to: `pan`, `zoom`, `selection:changed`, `layer:toggled`, `route:updated`, `route:cleared`, `marker:added`, etc.
  - Redraws canvas on relevant events
- **Internal State:** Stores pipeline, renderers, animation frame ID, frame request queue
- **Rendering Flow:** Fully decoupled — renderers pull state from managers via EventBus queries or direct state object reads (if allowed by architecture)

---

#### 4. **DataController**
- **Inputs:** `{ eventBus, config, storageUtils, errorHandler }`
- **Lifecycle:**
  - `init()`: Load `data/config.js`, instantiate `MarkerManager`, initialize route data, set up storage persistence hooks
  - `destroy()`: Unsubscribe all EventBus listeners, call `destroy()` on `MarkerManager`
- **Event Publishing & Subscription:**
  - Emits `data:configLoaded`, `data:markersLoaded` after initialization
  - Subscribes to: `marker:add`, `marker:remove`, `route:save`, `route:load` to persist changes
  - Listens to `settings:mapModeChanged` to reload relevant markers
- **Internal State:** Stores `MarkerManager` instance, loaded config, markers by layer
- **Storage Sync:** All marker/route modifications trigger EventBus events → DataController persists to localStorage

---

### Bootstrap Pattern (Minimal map.js)

**New `map.js` responsibilities:**

1. Create shared instances (not duplicated per controller):
   - `eventBus` (EventUtils.createEventBus)
   - `mapState`, `routeState`, `layerState`, `selectionState` (state managers)
   - `errorHandler` (ErrorHandler instance)
   - `storageUtils` (shared instance)

2. Construct controllers with dependency injection:
   ```javascript
   const settingsCtrl = new SettingsController({
     eventBus, containerNode: document.getElementById('settings'),
     errorHandler, storageUtils
   });
   const inputCtrl = new InputController({
     eventBus, canvas, containerNode: document.body,
     mapState, errorHandler
   });
   const renderCtrl = new RenderController({
     eventBus, canvas, containerNode: document.body,
     mapState, routeState, layerState, selectionState,
     errorHandler, config
   });
   const dataCtrl = new DataController({
     eventBus, config, storageUtils, errorHandler
   });
   ```

3. Initialize in dependency order:
   ```javascript
   await dataCtrl.init();      // Load config and data first
   await settingsCtrl.init();  // UI setup
   await inputCtrl.init();     // Input handlers
   await renderCtrl.init();    // Rendering + animation loop
   ```

4. Wire global cleanup on unload:
   ```javascript
   window.addEventListener('beforeunload', () => {
     renderCtrl.destroy();
     inputCtrl.destroy();
     settingsCtrl.destroy();
     dataCtrl.destroy();
     eventBus.destroy();
   });
   ```

---

## Architecture Compliance

### ✅ Event-Driven Communication
- **Pattern:** All cross-controller communication flows through `eventBus.emit()` and `eventBus.on()`.
- **Example:** Settings change → `eventBus.emit('settings:mapModeChanged')` → RenderController listens and redraws.
- **Benefit:** No direct method calls between controllers; fully decoupled.

### ✅ Dependency Injection
- **Pattern:** Controllers receive dependencies via constructor object (not global access).
- **Example:**
  ```javascript
  constructor({ eventBus, canvas, mapState, errorHandler }) {
    this.eventBus = eventBus;
    this.canvas = canvas;
    this.mapState = mapState;
    this.errorHandler = errorHandler;
  }
  ```
- **Benefit:** Testable, mockable, no hidden globals.

### ✅ Separation of Concerns
- **Input layer** (InputController) is isolated from rendering (RenderController).
- **Data layer** (DataController) is isolated from UI (SettingsController).
- **Each controller owns exactly one domain:** settings, input, rendering, or data.

### ✅ Lifecycle Management
- **Pattern:** Each controller implements `init()` and `destroy()`.
- **init():** Set up DOM listeners, instantiate sub-modules, subscribe to EventBus.
- **destroy():** Unsubscribe from EventBus, remove DOM listeners, clean up sub-modules.
- **Example (InputController.destroy()):**
  ```javascript
  destroy() {
    this.gestureHandler.destroy();
    this.keyboardHandler.destroy();
    this.pointerHandler.destroy();
    // Handlers clean their own EventBus subscriptions
  }
  ```

### ✅ No Global Access
- **Before:** map.js accessed `window.mapState`, `window.eventBus`, etc.
- **After:** Controllers receive these via DI; no new globals introduced.
- **Renderers & handlers:** Still receive shared instances, but only through their parent controller or bootstrap.

### ✅ Rendering Pipeline Preserved
- **RenderController** wraps the existing `RenderPipeline` — no changes to pipeline internals.
- **Renderers** continue to render to canvas; RenderController orchestrates the animation loop and event subscriptions.
- **Example:**
  ```javascript
  this.pipeline = new RenderPipeline(this.canvas);
  this.tileRenderer = new TileRenderer(this.pipeline, config);
  this.routeRenderer = new RouteRenderer(this.pipeline, this.routeState);
  // RenderController coordinates event → render → frame cycle
  ```

---

## Implementation Steps

### Phase 1: Analysis & Scaffolding
1. **Analyze current `map.js`:** Identify logical blocks (lines ~1–50: setup, ~51–150: settings UI, ~151–300: input handlers, etc.)
2. **Create `controllers/` directory**
3. **Create scaffold files** with JSDoc headers, empty `init()`/`destroy()` stubs, constructor DI pattern

### Phase 2: Extract Controllers (1 per commit)
1. **DataController:** Extract config loading, MarkerManager setup, storage sync logic
2. **SettingsController:** Extract settings UI creation, DOM event binding, event emissions
3. **InputController:** Extract handler instantiation, init/destroy delegation
4. **RenderController:** Extract pipeline, renderers, animation loop, event subscriptions

### Phase 3: Refactor Bootstrap
1. Update `map.js` to:
   - Create shared state/eventBus instances
   - Construct controllers with DI
   - Call `init()` in dependency order
   - Set up global cleanup on unload

### Phase 4: Testing & Validation
1. Run smoke tests:
   - `tests/pipelinesmoke.html` — rendering works
   - `tests/routesmoke.html` — route display works
   - `tests/marker_smoke.html` — marker creation/display works
2. Check console for errors, memory leaks (DevTools), and DOM state

### Phase 5: Documentation
1. Update `REFACTORING_PROGRESS.md` with controller summaries
2. Add controller usage notes to README or code comments
3. Link to `MAP_REFACTORING_PLAN.md`

---

## Safety & Review Checkpoints

### Before Each Controller Commit
- [ ] All existing functionality (panning, zooming, rendering, settings) works in smoke tests
- [ ] No console errors or warnings (except expected)
- [ ] No regression in route editing or marker management
- [ ] All `eventBus.on()` calls have matching cleanup in `destroy()`

### After All Controllers Extracted
- [ ] `map.js` is <100 lines (just bootstrap)
- [ ] All controllers follow same JSDoc/lifecycle pattern
- [ ] No circular imports or direct cross-controller calls
- [ ] DI container in `map.js` is the only place states/eventBus are instantiated

### Final Validation
- [ ] Open app in browser; full feature test (pan, zoom, add route, save, refresh, restore)
- [ ] DevTools: heap snapshot before/after session — no growing detached DOM nodes
- [ ] Git log shows clean, atomic commits per controller

---

## File Tree After Refactoring

```
.
├── map.js                           (Refactored to ~50–80 lines: bootstrap only)
├── index.html                       (No change)
├── styles.css                       (No change)
├── MAP_REFACTORING_PLAN.md          (This file)
├── controllers/
│   ├── DataController.js            (NEW: ~150–200 lines)
│   ├── SettingsController.js        (NEW: ~100–150 lines)
│   ├── InputController.js           (NEW: ~60–80 lines)
│   └── RenderController.js          (NEW: ~200–250 lines)
├── data/
│   ├── config.js
│   ├── init.js
│   ├── ... (existing)
├── input/
│   ├── GestureHandler.js            (No change)
│   ├── KeyboardHandler.js           (No change)
│   ├── PointerHandler.js            (No change)
│   └── RouteEditHandler.js          (No change)
├── rendering/
│   ├── RenderPipeline.js            (No change)
│   ├── TileRenderer.js              (No change)
│   ├── RouteRenderer.js             (No change)
│   ├── ... (existing, no change)
├── state/
│   ├── MapState.js                  (No change)
│   ├── RouteState.js                (No change)
│   ├── ... (existing, no change)
└── ... (other files unchanged)
```

---

## Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| `map.js` lines | ~500+ | <100 | ✅ |
| Tight coupling score | High | Low | ✅ |
| Reusable controllers | 0 | 4 | ✅ |
| Direct global access in `map.js` | Multiple | 1 (eventBus, states created once) | ✅ |
| Smoke test coverage | ~60% | 100% | ✅ |
| JSDoc completeness | ~60% | 80%+ | ✅ |

---

## Notes & Risks

### Low Risk
- **Existing handlers follow pattern:** `GestureHandler`, `KeyboardHandler`, etc. already have `init()`/`destroy()`, so extraction is straightforward.
- **EventBus already in place:** No new infrastructure required; just wire events.
- **Smoke tests exist:** Quick validation of core flows.

### Medium Risk
- **Initialization order:** DataController must load before RenderController (needs config). Order matters.
- **Event name consistency:** Must use same event names across emitters/subscribers. Document event dictionary.
- **State mutation:** Controllers must not directly mutate state objects; emit events instead.

### Mitigation
- Add initialization order comments in bootstrap.
- Create `EventTypes.js` or document event names in each controller JSDoc.
- Use EventBus query/read-only patterns where possible (instead of direct state mutation).

---

## Estimated Effort

- **Analysis:** ~1 hour (line mapping, extraction points)
- **Scaffold & DataController:** ~2 hours
- **SettingsController + InputController:** ~1.5 hours
- **RenderController:** ~2 hours (most complex; coordinates multiple renderers)
- **Bootstrap refactor:** ~1 hour
- **Testing & validation:** ~1 hour
- **Documentation & cleanup:** ~0.5 hours

**Total: ~9 hours spread across 5–7 commits**

---

## Related Documents
- [REFACTORING_PLAN.md](REFACTORING_PLAN.md) — High-level refactoring roadmap
- [REFACTORING_PROGRESS.md](REFACTORING_PROGRESS.md) — Completion tracking
- [TODO_CODE_AUDIT_PRIORITY_3.md](TODO_CODE_AUDIT_PRIORITY_3.md) — Priority 3 audit checklist

