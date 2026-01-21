# Wave 6 Implementation Plan: Complete Breakdown & Execution Strategy

**Document Date:** January 21, 2026  
**Status:** Ready for Execution  
**Scope:** Completing all remaining Wave 6 work  
**Estimated Effort:** ~40-50 hours across ~6 phases  

---

## 📊 Current State Assessment

### ✅ Already Completed (Phase 5: Consent & Privacy)

**Files Created:**
- ✅ `controllers/ConsentManager.js` (297 lines) - GDPR consent lifecycle management
- ✅ `controllers/DataExportController.js` (405 lines) - Data portability and GDPR export/import

**Files Enhanced:**
- ✅ `data/StorageService.js` - Added quota tracking (4 new methods)
- ✅ `utils/EventTypes.js` - Added 6 privacy/consent events
- ✅ `controllers/SettingsController.js` - Integrated managers as REQUIRED core architecture

**Cleanup Completed:**
- ✅ Removed broken `StorageServiceProvider` abstraction
- ✅ Switched to global `getStorageService()` function
- ✅ Fixed syntax errors (map.js, SettingsController.js)
- ✅ Removed all Phase 5 diagnostic logDebug statements

**Git Commits:**
- `2bfebab` - Remove localStorage fallbacks
- `e1e10bf` - Add ConsentManager and DataExportController
- `301af86` - Reclassify managers as REQUIRED
- `adc5319` - Add missing script tags
- `47d76ee` - Add StorageService fallback logging
- `a221bde` - Remove StorageServiceProvider abstraction
- `1316455` - Fix syntax errors
- `e1a32aa` - Remove diagnostic logs

**Wave 6 Checklist Progress:** 3/10 storage items complete ✅, Phase 5 complete ✅

---

### ❌ NOT Yet Completed (Phases 1-4: Route & Storage)

**Route Phases (25 hours work):**
- [ ] Phase 1: console.debug → errorHandler migration (6 files affected)
- [ ] Phase 2: RouteRenderer viewport decoupling (ViewportContext)
- [ ] Phase 3: Route state unification (deduplicate across RouteAnimationState, RouteRenderer cache)
- [ ] Phase 4: Route import/export events (ROUTE_IMPORT_*, ROUTE_EXPORT_*)
- [ ] Phase 5: RouteComputeController consolidation

**Storage Phases (28 hours work):**
- [ ] Phase 1: Storage service injection (replace `window.storageService` global access)
- [ ] Phase 2: Unified storage events (STORAGE_SAVE_*, STORAGE_LOAD_*, STORAGE_QUOTA_*)
- [ ] Phase 3: StorageInterface deprecation & cleanup
- [ ] Phase 4: Marker & settings storage unification (consistent save/load patterns)
- [ ] Phase 5: Already done via ConsentManager/DataExportController ✅

**Testing & Documentation:**
- [ ] Unit tests for route events
- [ ] Unit tests for storage events
- [ ] Integration tests (full save/load cycles)
- [ ] Smoke tests (end-to-end workflows)
- [ ] Migration guide updates

---

## 🎯 Recommended Execution Order

### Block 1: Console Cleanup (Route Phase 1) — 4-6 hours

**Why First?** Quick wins, improves debugging immediately, no architectural changes.

**Files to Update:**
1. `data/RouteManager.js` (20+ console.debug calls)
2. `state/RouteAnimationState.js` (15+ console.debug calls)
3. `input/RouteEditHandler.js` (5+ console.debug calls)
4. `controllers/RouteComputeController.js` (5+ console.debug calls)
5. `rendering/RouteRenderer.js` (if any debug calls)

**Per-File Pattern:**
```javascript
// FIND: console.debug('message', 'context', data);
// REPLACE: this.errorHandler.logDebug('message', { context: data });

// FIND: console.warn('message');
// REPLACE: this.errorHandler.logWarning('message');

// FIND: console.error('message', error);
// REPLACE: this.errorHandler.logError(error, 'module.method');
```

**Acceptance Criteria:**
- [ ] Zero `console.debug()` calls in route-related files
- [ ] All logging goes through `this.errorHandler`
- [ ] No console output in browser DevTools for route operations
- [ ] Smoke test: routes work after changes

**Commit Message:** "Wave 6 Phase 1: Migrate route console.debug to errorHandler logging"

---

### Block 2: Storage Service Injection (Storage Phase 1) — 8-10 hours

**Why Next?** Dependency injection enables all subsequent storage work; high-impact refactor.

**Files to Create:**
1. `data/StorageServiceProvider.js` (60 lines) - Provider pattern for DI

**Files to Update:**
1. `map.js` - Create provider, inject into managers
2. `controllers/DataController.js` - Accept storageProvider in options
3. `state/MapState.js` - Replace `window.storageService` with injected dependency
4. `state/RouteAnimationState.js` - Same
5. `state/SelectionState.js` - Same
6. `state/EditModeState.js` - Same
7. `input/PointerHandler.js` - Same (if uses storage)
8. `controllers/SettingsController.js` - Already enhanced; verify compatibility

**Per-File Pattern:**
```javascript
// BEFORE: Direct global access
const setting = window.storageService.loadSetting(key);

// AFTER: Injected provider access
constructor(options) {
    this.storage = options.storageProvider?.getInstance() || window.storageService;
}
// Usage:
const setting = this.storage.loadSetting(key);
```

**Acceptance Criteria:**
- [ ] StorageServiceProvider created and integrated
- [ ] All state managers accept `storageProvider` in constructor
- [ ] Fallback to `window.storageService` if not provided (for backward compat)
- [ ] Zero direct `window.storageService` access in state managers
- [ ] All storage operations work identically
- [ ] No console errors about undefined storageService

**Commit Message:** "Wave 6 Storage Phase 1: Inject StorageService via provider pattern"

---

### Block 3: Unified Storage Events (Storage Phase 2) — 6-8 hours

**Why After Injection?** Need clean injected access before adding event emission.

**Files to Create:**
1. `controllers/StorageFeedbackController.js` (80 lines) - Optional UI feedback handler

**Files to Update:**
1. `utils/EventTypes.js` - Add 6 storage event types (SAVE_STARTED, SAVE_COMPLETED, SAVE_FAILED, LOAD_STARTED, LOAD_COMPLETED, LOAD_FAILED)
2. `data/StorageService.js` - Emit events on set(), get(), remove(), clear()
3. `data/MarkerManager.js` - Emit events in saveToStorage()/loadFromStorage()
4. `data/RouteManager.js` - Emit events in saveToStorage()/loadFromStorage()
5. `state/MapState.js` - Emit events in saveToStorage()/loadFromStorage()
6. `state/RouteAnimationState.js` - Emit events in saveToStorage()/loadFromStorage()

**Per-File Pattern:**
```javascript
// StorageService.set()
set(key, value) {
    try {
        this.eventBus?.emit(window.EventTypes.STORAGE_SAVE_STARTED, { key, size: JSON.stringify(value).length });
        // ... existing save logic
        this.eventBus?.emit(window.EventTypes.STORAGE_SAVE_COMPLETED, { key });
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            this.eventBus?.emit(window.EventTypes.STORAGE_QUOTA_EXCEEDED, { key });
        }
        this.eventBus?.emit(window.EventTypes.STORAGE_SAVE_FAILED, { key, error: e.message });
    }
}

// Manager.saveToStorage()
saveToStorage() {
    try {
        this.eventBus?.emit(window.EventTypes.STORAGE_SAVE_STARTED, { entity: 'markers' });
        const data = this.getMarkerArray();
        this.storage.set(MP4Config.STORAGE_KEYS.MARKERS, data);
        this.eventBus?.emit(window.EventTypes.STORAGE_SAVE_COMPLETED, { entity: 'markers' });
    } catch (e) {
        this.errorHandler?.logError(e, 'MarkerManager.saveToStorage');
    }
}
```

**Acceptance Criteria:**
- [ ] 6 new EventTypes defined for storage operations
- [ ] StorageService emits events on all operations
- [ ] All managers emit events in saveToStorage()/loadFromStorage()
- [ ] UI can listen to events and show feedback
- [ ] No errors emitting events (graceful fallback if eventBus missing)

**Commit Message:** "Wave 6 Storage Phase 2: Add unified storage event system"

---

### Block 4: Route Events (Route Phase 4) — 6-8 hours

**Why Here?** Route events follow same pattern as storage events; easier after completing storage work.

**Files to Update:**
1. `utils/EventTypes.js` - Add 6 route event types (ROUTE_IMPORT_STARTED/COMPLETED/FAILED, ROUTE_EXPORT_STARTED/COMPLETED/FAILED)
2. `data/RouteManager.js` - Emit events in importRoute(), exportRoute()
3. `controllers/RouteController.js` - Verify route update handling via events

**Per-File Pattern:**
```javascript
// RouteManager.importRoute()
importRoute(fileContent) {
    try {
        this.eventBus?.emit(window.EventTypes.ROUTE_IMPORT_STARTED, { fileSize: fileContent.length });
        const route = this._parseRouteFile(fileContent);
        this.setRoute(route.indices, route.length, route.sources);
        // setRoute emits ROUTE_UPDATED
        this.eventBus?.emit(window.EventTypes.ROUTE_IMPORT_COMPLETED, { 
            route: this.currentRoute,
            pointCount: route.indices.length 
        });
    } catch (e) {
        this.errorHandler?.logError(e, 'RouteManager.importRoute');
        this.eventBus?.emit(window.EventTypes.ROUTE_IMPORT_FAILED, { error: e.message });
        throw e;
    }
}

// RouteManager.exportRoute()
exportRoute() {
    try {
        this.eventBus?.emit(window.EventTypes.ROUTE_EXPORT_STARTED, { route: this.currentRoute });
        const fileContent = this._generateRouteFile();
        this.eventBus?.emit(window.EventTypes.ROUTE_EXPORT_COMPLETED, { fileSize: fileContent.length });
        return fileContent;
    } catch (e) {
        this.errorHandler?.logError(e, 'RouteManager.exportRoute');
        this.eventBus?.emit(window.EventTypes.ROUTE_EXPORT_FAILED, { error: e.message });
        throw e;
    }
}
```

**Acceptance Criteria:**
- [ ] 6 new route event types defined
- [ ] importRoute() emits 3-event sequence (STARTED → COMPLETED/FAILED)
- [ ] exportRoute() emits 3-event sequence (STARTED → COMPLETED/FAILED)
- [ ] UI can listen and show progress
- [ ] Existing route functionality unchanged

**Commit Message:** "Wave 6 Route Phase 4: Add route import/export event system"

---

### Block 5: RouteRenderer Viewport Decoupling (Route Phase 2) — 6-8 hours

**Why Here?** Requires understanding of how routes are rendered; builds on events work.

**Files to Create/Update:**
1. `rendering/RouteViewportContext.js` - Encapsulate viewport requirements for routes
2. `rendering/RouteRenderer.js` - Replace `this.mapState` access with viewport parameter
3. `rendering/RenderController.js` - Pass viewport context to RouteRenderer

**Per-File Pattern:**
```javascript
// NEW: RouteViewportContext.js
class RouteViewportContext {
    constructor(mapState) {
        this.zoom = mapState.zoom;
        this.panX = mapState.panX;
        this.panY = mapState.panY;
        this.lineWidth = this._computeLineWidth(mapState.zoom);
        this.nodeRadius = this._computeNodeRadius(mapState.zoom);
    }
    
    _computeLineWidth(zoom) {
        return Math.max(1, 2 * zoom);
    }
    
    _computeNodeRadius(zoom) {
        return Math.max(3, 6 * zoom);
    }
}

// UPDATED: RouteRenderer.render()
render(renderContext, viewportContext) {
    const vp = viewportContext || this._createFallbackViewport();
    // Use vp.zoom, vp.panX, vp.panY instead of this.mapState.*
}
```

**Acceptance Criteria:**
- [ ] RouteViewportContext created and working
- [ ] RouteRenderer uses viewport instead of mapState
- [ ] Routes render correctly at all zoom levels
- [ ] No performance regression
- [ ] ViewportContext passed through render pipeline

**Commit Message:** "Wave 6 Route Phase 2: Decouple RouteRenderer from mapState via ViewportContext"

---

### Block 6: Route State Unification (Route Phase 3) — 4-6 hours

**Why Here?** Final architectural cleanup; ensures single source of truth.

**Files to Review:**
1. `data/RouteManager.js` - Verify it owns route state (indices, sources, length)
2. `state/RouteAnimationState.js` - Verify it owns only animation parameters
3. `rendering/RouteRenderer.js` - Verify cache is performance-only, not authoritative

**Verification Checklist:**
- [ ] RouteManager.currentRoute is authoritative source
- [ ] RouteAnimationState owns dashOffset, animationSpeed, looping (animation params only)
- [ ] RouteRenderer._cache is invalidated on ROUTE_UPDATED events
- [ ] No route state duplicated elsewhere

**Per-File Changes (if needed):**
```javascript
// Verify: RouteManager owns all route data
class RouteManager {
    constructor() {
        this.currentRoute = { indices: [], sources: [], length: 0 };
        // This is THE source of truth
    }
}

// Verify: RouteAnimationState owns only animation
class RouteAnimationState {
    constructor() {
        this.dashOffset = 0;
        this.animationSpeed = 1.0;
        this.looping = false;
        // NOT currentRoute, NOT routeSources
    }
}
```

**Acceptance Criteria:**
- [ ] No route state in RouteRenderer (only cache)
- [ ] No route state duplicated in RouteAnimationState
- [ ] All route updates go through RouteManager.setRoute()
- [ ] Cache properly invalidated

**Commit Message:** "Wave 6 Route Phase 3: Unify route state in RouteManager"

---

### Block 7: RouteComputeController Consolidation (Route Phase 5) — 3-4 hours

**Why Here?** Final route work; builds on unified state.

**Files to Update:**
1. `controllers/RouteComputeController.js` - Remove duplicate route length calculations

**Changes:**
```javascript
// BEFORE: Calculates length locally
async computeRouteAsync(markers) {
    const tour = this.tspSolver.solve(markers);
    const len = this._computeLength(tour, markers);  // ← Duplicate calculation
    this.routeManager.setRoute(tour, len, sources);
}

// AFTER: Delegates to RouteManager
async computeRouteAsync(markers) {
    const tour = this.tspSolver.solve(markers);
    this.routeManager.setRoute(tour, 0, sources);  // RouteManager computes length
    // RouteManager.setRoute → emit ROUTE_UPDATED → RouteRenderer re-renders
}
```

**Acceptance Criteria:**
- [ ] No duplicate route length calculation
- [ ] TSP result properly applied via RouteManager
- [ ] Length computed by RouteManager and persisted correctly

**Commit Message:** "Wave 6 Route Phase 5: Consolidate route computation in RouteManager"

---

### Block 8: Storage Cleanup & Unification (Storage Phases 3-4) — 8-10 hours

**Why Last?** Touches most files; do after proving event system works.

**Storage Phase 3: Deprecate StorageInterface**
```javascript
// data/StorageInterface.js - TOP OF FILE
/**
 * @deprecated Use StorageService instead
 * This interface is maintained for backward compatibility only.
 * New code should use: window.storageService via dependency injection
 * See: StorageServiceProvider, DataController, state managers
 */
```

**Storage Phase 4: Unify Manager Patterns**
```javascript
// Template for all managers
saveToStorage() {
    try {
        this.eventBus?.emit(EventTypes.STORAGE_SAVE_STARTED, { 
            entity: this.constructor.name 
        });
        const data = this._getStorageData();
        const key = MP4Config.STORAGE_KEYS[this.constructor.name.toUpperCase()];
        this.storage.set(key, data);
        this.eventBus?.emit(EventTypes.STORAGE_SAVE_COMPLETED, { 
            entity: this.constructor.name 
        });
    } catch (e) {
        this.errorHandler?.logError(e, `${this.constructor.name}.saveToStorage`);
    }
}

loadFromStorage() {
    try {
        this.eventBus?.emit(EventTypes.STORAGE_LOAD_STARTED, { 
            entity: this.constructor.name 
        });
        const key = MP4Config.STORAGE_KEYS[this.constructor.name.toUpperCase()];
        const data = this.storage.get(key);
        if (data) {
            this._loadStorageData(data);
        }
        this.eventBus?.emit(EventTypes.STORAGE_LOAD_COMPLETED, { 
            entity: this.constructor.name 
        });
    } catch (e) {
        this.errorHandler?.logError(e, `${this.constructor.name}.loadFromStorage`);
    }
}
```

**Files to Update:**
1. `data/MarkerManager.js` - Apply unified pattern
2. `data/RouteManager.js` - Apply unified pattern
3. `state/MapState.js` - Apply unified pattern
4. `state/RouteAnimationState.js` - Apply unified pattern
5. `state/SelectionState.js` - Apply unified pattern
6. `state/EditModeState.js` - Apply unified pattern

**Acceptance Criteria:**
- [ ] All managers follow identical save/load pattern
- [ ] All emit STORAGE_SAVE_STARTED/COMPLETED events
- [ ] StorageInterface marked as deprecated with pointer to new pattern
- [ ] No new code uses StorageInterface directly

**Commit Message:** "Wave 6 Storage Phases 3-4: Unify storage patterns, deprecate StorageInterface"

---

### Block 9: Testing & Documentation — 6-8 hours

**Unit Tests:**
```javascript
// tests/wave6_route_events.js
- RouteManager emits ROUTE_IMPORT_STARTED on import
- RouteManager emits ROUTE_IMPORT_COMPLETED on success
- RouteManager emits ROUTE_IMPORT_FAILED on error
- RouteManager emits ROUTE_EXPORT_STARTED on export
- RouteManager emits ROUTE_EXPORT_COMPLETED on success

// tests/wave6_storage_events.js
- StorageService emits STORAGE_SAVE_STARTED on save
- StorageService emits STORAGE_SAVE_COMPLETED on success
- StorageService emits STORAGE_SAVE_FAILED on error
- StorageService emits STORAGE_QUOTA_EXCEEDED when quota exceeded
- MarkerManager emits STORAGE_SAVE_STARTED/COMPLETED on saveToStorage()
```

**Integration Tests:**
```javascript
// tests/wave6_integration.js
- Full route import → render → save → load cycle
- Full marker save → clear → import cycle
- Multiple storage operations in sequence
- Storage events received correctly in UI
```

**Smoke Tests:**
- Create wave6_smoke.html testing all end-to-end workflows
- Route create, save, export, import, reload
- Marker add, save, clear, import, reload
- Settings save and reload

**Documentation:**
- Create WAVE_6_MIGRATION_GUIDE.md for developers
- Update REFACTORING_PROGRESS.md with completion status
- Create WAVE_6_COMPLETION_SUMMARY.md

**Acceptance Criteria:**
- [ ] All 20 unit tests pass
- [ ] All 5 integration tests pass
- [ ] Smoke tests all pass
- [ ] Developer migration guide clear and complete
- [ ] REFACTORING_PROGRESS.md shows Wave 6 complete

**Commit Message:** "Wave 6: Complete testing suite and migration documentation"

---

## 📈 Parallel Work Opportunities

These can be done concurrently:

**Track A (Routes):**
1. Block 1: Console cleanup
2. Block 5: Viewport decoupling
3. Block 6: State unification
4. Block 7: Compute consolidation

**Track B (Storage):**
1. Block 2: Service injection
2. Block 3: Unified events
3. Block 8: Cleanup & unification

**Suggested Parallelization:**
- Do Block 1 & 2 in parallel (4-6h + 8-10h simultaneously)
- Then Block 3 & 4 (6-8h each simultaneously)
- Then Block 5, 6, 7 (route work, can be sequential)
- Then Block 8 (storage consolidation)
- Finally Block 9 (testing & docs)

**Estimated Timeline with Parallelization:**
- Week 1: Blocks 1+2, 3+4 (12-18 hours of wall-clock time)
- Week 2: Blocks 5+6+7 (12-16 hours of wall-clock time)
- Week 3: Block 8 (8-10 hours)
- Week 3: Block 9 (6-8 hours)
- **Total: ~50 hours work, ~2.5 weeks wall-clock time**

---

## 🚨 Risk Mitigation

### Risk 1: Event Emission Performance
**Mitigation:** 
- Use optional chaining (`?.emit()`) to gracefully handle missing eventBus
- Add performance monitoring to check event emission overhead
- Consider event batching for bulk operations

### Risk 2: Breaking Existing Code
**Mitigation:**
- Keep fallback to `window.storageService` in all managers
- Mark StorageInterface as deprecated, don't delete
- Add test before/after each phase

### Risk 3: Incomplete Event Coverage
**Mitigation:**
- Create comprehensive event audit (grep for all save/load operations)
- Document which operations emit which events
- Cross-check against Wave 6 plan

### Risk 4: Storage Service Provider Misuse
**Mitigation:**
- Ensure getInstance() always returns valid service
- Add null checks at injection points
- Provide clear error messages if provider misconfigured

---

## ✅ Completion Criteria

**All Work Complete When:**

1. **Console Logging:**
   - [ ] Zero `console.debug()`, `console.warn()`, `console.error()` in route code
   - [ ] All logging goes through errorHandler
   - [ ] Browser DevTools shows no console spam from routes

2. **Dependency Injection:**
   - [ ] StorageService injected into all managers via provider
   - [ ] No direct `window.storageService` access in state managers
   - [ ] Fallback still works for backward compatibility

3. **Event Systems:**
   - [ ] 6 route events defined and emitted correctly
   - [ ] 6 storage events defined and emitted correctly
   - [ ] UI can listen and respond to all events
   - [ ] Quota exceeded handling in place

4. **Architecture:**
   - [ ] Route state unified in RouteManager (single source of truth)
   - [ ] RouteRenderer uses ViewportContext exclusively
   - [ ] All managers follow identical save/load pattern
   - [ ] StorageInterface marked deprecated

5. **Testing:**
   - [ ] 20+ unit tests pass
   - [ ] 5+ integration tests pass
   - [ ] All smoke tests pass
   - [ ] No console errors or warnings

6. **Documentation:**
   - [ ] WAVE_6_MIGRATION_GUIDE.md complete
   - [ ] REFACTORING_PROGRESS.md updated
   - [ ] Inline code comments explain event patterns
   - [ ] All commits have clear messages

7. **Git History:**
   - [ ] 8-10 clear commits, each completing one phase
   - [ ] Each commit passes its own tests
   - [ ] Wave 6 branch ready for main merge

---

## 📋 Phase Dependency Graph

```
┌─────────────────┐
│ Start: Current  │  Phase 5 complete ✅
│ State (Phase 5) │  ConsentManager, DataExportController
└────────┬────────┘
         │
         ├──────────────────────────┬──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
    ┌─────────────┐         ┌──────────────┐         ┌──────────────┐
    │  Block 1    │         │  Block 2     │         │   PARALLEL   │
    │ (4-6 hours) │         │ (8-10 hours) │         │   POSSIBLE   │
    │ Console Fix │         │   DI Setup   │         └──────────────┘
    └──────┬──────┘         └──────┬───────┘
           │                       │
           └───────────┬───────────┘
                       │
                       ▼
                ┌────────────────┐
                │  Block 3 + 4   │
                │ (12-16 hours)  │
                │  Event Systems │
                │   (PARALLEL)   │
                └────────┬───────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌────────┐      ┌────────┐      ┌────────┐
    │ Block 5│      │ Block 6│      │ Block 8│
    │  Viewport     │ State  │      │ Storage│
    │ (6-8h)│      │ Unify  │      │ Cleanup│
    │  ROUTE│      │ (4-6h) │      │(8-10h) │
    └────────┘      └────────┘      └────────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  Block 7     │
                  │  Compute     │
                  │ (3-4 hours)  │
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  Block 9     │
                  │ Test & Docs  │
                  │ (6-8 hours)  │
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  Wave 6      │
                  │  COMPLETE ✅  │
                  └──────────────┘
```

---

## 📝 Execution Checklist

**Before Starting:**
- [ ] Read this entire plan
- [ ] Read WAVE_6_REFACTORING_PLAN.md
- [ ] Verify Phase 5 changes are all committed
- [ ] Create `wave-6-implementation` branch from main
- [ ] Have test environment ready

**Block 1 (Console Cleanup):**
- [ ] Identify all console.debug/warn/error in route files
- [ ] Replace with errorHandler calls
- [ ] Run tests to verify nothing broke
- [ ] Commit with message from Block 1

**Block 2 (DI Setup):**
- [ ] Create StorageServiceProvider
- [ ] Inject into DataController
- [ ] Update all state managers to accept storageProvider
- [ ] Verify all storage operations still work
- [ ] Commit with message from Block 2

**Block 3 (Storage Events):**
- [ ] Add 6 storage EventTypes
- [ ] Update StorageService to emit events
- [ ] Update all managers to emit in save/load
- [ ] Create smoke test for event emission
- [ ] Commit with message from Block 3

**Block 4 (Route Events):**
- [ ] Add 6 route EventTypes
- [ ] Update RouteManager import/export to emit
- [ ] Verify UI responds to events
- [ ] Commit with message from Block 4

**Block 5 (Viewport Decoupling):**
- [ ] Create RouteViewportContext
- [ ] Update RouteRenderer to use context
- [ ] Verify routes render correctly
- [ ] Commit with message from Block 5

**Block 6 (State Unification):**
- [ ] Verify RouteManager is single source of truth
- [ ] Verify RouteAnimationState owns only animation params
- [ ] Remove any duplicate route state
- [ ] Commit with message from Block 6

**Block 7 (Compute Consolidation):**
- [ ] Remove duplicate route length calculation
- [ ] Verify TSP still works correctly
- [ ] Commit with message from Block 7

**Block 8 (Storage Cleanup):**
- [ ] Mark StorageInterface as deprecated
- [ ] Apply unified pattern to all managers
- [ ] Verify all save/load operations work
- [ ] Commit with message from Block 8

**Block 9 (Testing & Docs):**
- [ ] Create comprehensive unit tests
- [ ] Create integration tests
- [ ] Create and pass smoke tests
- [ ] Write WAVE_6_MIGRATION_GUIDE.md
- [ ] Update REFACTORING_PROGRESS.md
- [ ] Final comprehensive commit

**After Completion:**
- [ ] Verify all 10 Wave 6 checklist items ✅
- [ ] Run full smoke test suite
- [ ] Verify no console errors
- [ ] Create PR from wave-6-implementation → main
- [ ] Request code review
- [ ] Merge to main with summary commit

---

## 📚 Reference Information

### Key Files Overview

**Route Management:**
- `data/RouteManager.js` - ~600 lines, singleton route state manager
- `state/RouteAnimationState.js` - ~200 lines, animation parameters
- `rendering/RouteRenderer.js` - ~400 lines, route visualization
- `input/RouteEditHandler.js` - ~300 lines, route interaction
- `controllers/RouteController.js` - ~200 lines, route coordination

**Storage Management:**
- `data/StorageService.js` - ~300 lines, unified storage layer
- `data/StorageInterface.js` - ~200 lines, legacy (to deprecate)
- `data/MarkerManager.js` - ~500 lines (uses storage)
- `state/MapState.js` - ~200 lines (uses storage)
- `state/RouteAnimationState.js` - ~200 lines (uses storage)

**New Files (Phase 5):**
- `controllers/ConsentManager.js` - 297 lines ✅
- `controllers/DataExportController.js` - 405 lines ✅

**Configuration:**
- `data/config.js` - MP4Config.STORAGE_KEYS definitions
- `utils/EventTypes.js` - All event definitions

### Event Types Reference

**Route Events (To Add):**
- `ROUTE_IMPORT_STARTED`
- `ROUTE_IMPORT_COMPLETED`
- `ROUTE_IMPORT_FAILED`
- `ROUTE_EXPORT_STARTED`
- `ROUTE_EXPORT_COMPLETED`
- `ROUTE_EXPORT_FAILED`

**Storage Events (To Add):**
- `STORAGE_SAVE_STARTED`
- `STORAGE_SAVE_COMPLETED`
- `STORAGE_SAVE_FAILED`
- `STORAGE_LOAD_STARTED`
- `STORAGE_LOAD_COMPLETED`
- `STORAGE_LOAD_FAILED`

**Storage Events (Already Exist from Phase 5):**
- `STORAGE_QUOTA_EXCEEDED` ✅
- `STORAGE_CONSENT_CHANGED` ✅

---

## 🔗 Related Documentation

- [WAVE_6_REFACTORING_PLAN.md](WAVE_6_REFACTORING_PLAN.md) - Original comprehensive plan
- [REFACTORING_PROGRESS.md](REFACTORING_PROGRESS.md) - Wave 1-5 completion status
- [.github/copilot-instructions.md](../.github/copilot-instructions.md) - Architecture overview

---

**Document Status:** Ready for Implementation  
**Last Updated:** January 21, 2026  
**Next Action:** Begin Block 1 (Console Cleanup)

