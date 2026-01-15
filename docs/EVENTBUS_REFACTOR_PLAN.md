# EventBus Implementation for Cross-Module Communication

**Document Version:** 1.0  
**Date:** January 14, 2026  
**Author:** GitHub Copilot  
**Status:** Proposed Implementation Plan

---

## Executive Summary

This document outlines a comprehensive refactoring plan to implement an EventBus pattern for cross-module communication in the Metroid Prime 4 Routing Tool. The current architecture relies heavily on direct method calls between modules, creating tight coupling that hinders maintainability, testability, and extensibility.

**Current Problem:** Controllers directly call `map.render()`, `map.updateLayerCounts()`, and other map methods, creating dependencies that make the codebase difficult to test and extend.

**Proposed Solution:** Implement a centralized EventBus that enables loose coupling through publish-subscribe communication patterns.

**Expected Benefits:**
- Loose coupling between modules
- Improved testability
- Better separation of concerns
- Easier extensibility
- Clearer data flow documentation

---

## Current Architecture Analysis

### Coupling Patterns Identified

The codebase currently exhibits several tight coupling patterns:

#### 1. Controller-to-Map Direct Calls
```javascript
// controllers/SidebarController.js
this.map.render();                    // Direct render call
this.map.updateLayerCounts();         // Direct UI update call
this.map.layerVisibility = {...};     // Direct property access
```

#### 2. Input Handler-to-Map Direct Calls
```javascript
// input/PointerHandler.js
this._render = this.map.render.bind(this.map);  // Bound method reference
this.map.updateResolution();                     // Direct method call
```

#### 3. State Manager Dependencies
- State managers are passive data containers
- No notification system when state changes
- Controllers must poll or directly modify state

#### 4. Limited Cross-Module Communication
- No direct communication between controllers
- All inter-module communication flows through the map
- No event-driven state synchronization

### Current Communication Flow
```
User Input → Input Handlers → Map (direct calls)
Controllers → Map (direct calls)
Map → State Managers (direct property access)
Map → Renderers (direct method calls)
```

### Problems with Current Approach

1. **Tight Coupling**: Modules depend on specific interfaces of other modules
2. **Testing Difficulty**: Controllers require full map instances for testing
3. **Maintenance Burden**: Adding new modules requires modifying existing code
4. **State Synchronization Issues**: Multiple modules updating shared state
5. **No Loose Coupling**: UI concerns tightly bound to business logic
6. **Hard to Extend**: New features requiring state change reactions need code modifications

---

## Proposed EventBus Architecture

### EventBus Design

```javascript
// utils/EventBus.js
class EventBus {
    constructor() {
        this._listeners = new Map();
        this._errorHandler = null;
    }

    setErrorHandler(errorHandler) {
        this._errorHandler = errorHandler;
    }

    on(event, callback, context = null) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        const listener = context ? callback.bind(context) : callback;
        listener._originalCallback = callback;
        this._listeners.get(event).add(listener);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            // Remove all bound versions of this callback
            for (const listener of listeners) {
                if (listener._originalCallback === callback) {
                    listeners.delete(listener);
                    break;
                }
            }
        }
    }

    emit(event, data = null) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(data);
                } catch (e) {
                    if (this._errorHandler) {
                        this._errorHandler.logError(e, `EventBus.emit.${event}`);
                    } else {
                        console.error(`EventBus handler error for ${event}:`, e);
                    }
                }
            });
        }
    }

    clear() {
        this._listeners.clear();
    }

    getListenerCount(event) {
        return this._listeners.get(event)?.size || 0;
    }
}

// Global instance
window.eventBus = new EventBus();
```

### New Communication Flow
```
User Input → Input Handlers → EventBus.emit('input:action')
EventBus → Controllers → EventBus.emit('render:requested')
EventBus → Map → Renderers
State Changes → EventBus.emit('state:changed')
EventBus → Interested Modules
```

---

## Event Type Definitions

### Core Event Categories

#### Render Events
```javascript
// Render control events
'render:requested'              // Request a render cycle
'render:completed'              // Render cycle finished
'render:pipeline-dirty'         // Specific renderer needs update

// Renderer-specific events
'renderer:tiles-updated'        // Tile renderer state changed
'renderer:markers-updated'      // Marker renderer state changed
'renderer:route-updated'        // Route renderer state changed
'renderer:overlay-updated'      // Overlay renderer state changed
```

#### Layer Events
```javascript
// Layer visibility events
'layer:visibility-changed'      // Layer show/hide state changed
'layer:counts-changed'          // Layer marker counts updated
'layer:highlight-changed'       // Layer highlight settings changed
'layer:edit-mode-changed'       // Layer edit mode toggled

// Layer data events
'layer:markers-added'           // Markers added to layer
'layer:markers-removed'         // Markers removed from layer
'layer:markers-moved'           // Markers repositioned
```

#### Route Events
```javascript
// Route computation events
'route:computation-started'     // Route computation began
'route:computation-completed'   // Route computation finished
'route:computation-failed'      // Route computation error

// Route state events
'route:updated'                 // Route data changed
'route:cleared'                 // Route cleared
'route:direction-changed'       // Route direction reversed
'route:expanded'                // Route expanded with nearby markers
```

#### Marker Events
```javascript
// Marker selection events
'marker:selected'               // Marker selection changed
'marker:deselected'             // Marker deselected
'marker:multi-selected'         // Multiple markers selected

// Marker editing events
'marker:added'                  // New marker created
'marker:removed'                // Marker deleted
'marker:moved'                  // Marker position changed
'marker:edited'                 // Marker properties edited
```

#### Input Events
```javascript
// Pointer events
'input:pointer-down'            // Mouse/touch down
'input:pointer-move'            // Mouse/touch move
'input:pointer-up'              // Mouse/touch up
'input:click'                   // Click detected
'input:double-click'            // Double click detected

// Keyboard events
'input:key-down'                // Key pressed
'input:key-up'                  // Key released

// Gesture events
'input:pan'                     // Pan gesture
'input:zoom'                    // Zoom gesture
'input:rotate'                  // Rotate gesture
```

#### State Events
```javascript
// Map state events
'map:view-changed'              // Pan/zoom changed
'map:resolution-changed'        // Canvas resolution changed
'map:mode-changed'              // Map mode changed

// Selection state events
'selection:changed'             // Selection changed
'selection:cleared'             // Selection cleared

// UI state events
'ui:tooltip-shown'              // Tooltip displayed
'ui:tooltip-hidden'             // Tooltip hidden
'ui:overlay-shown'              // UI overlay shown
'ui:overlay-hidden'             // UI overlay hidden
```

#### Storage Events
```javascript
// Storage operation events
'storage:settings-loaded'       // Settings loaded from storage
'storage:settings-saved'        // Settings saved to storage
'storage:view-loaded'           // Map view loaded
'storage:view-saved'            // Map view saved
```

---

## Implementation Strategy

### Phase 1: Core EventBus Infrastructure

#### Step 1.1: Create EventBus Class
- Create `utils/EventBus.js`
- Implement basic on/off/emit functionality
- Add error handling integration
- Create global instance

#### Step 1.2: Initialize EventBus in Application
```javascript
// map.js - in init() function
if (typeof EventBus !== 'undefined') {
    window.eventBus = new EventBus();
    window.eventBus.setErrorHandler(this.errorHandler);
}
```

#### Step 1.3: Add EventBus to Module Dependencies
Update all controllers and handlers to accept EventBus as dependency:
```javascript
// Constructor signature change
constructor(map, config, errorHandler, eventBus) {
    this.eventBus = eventBus || window.eventBus;
    // ...
}
```

### Phase 2: Controller Migration

#### Step 2.1: SidebarController Migration
**Current Code:**
```javascript
_applyLayerToggle(show) {
    // ... layer visibility logic ...
    this._scheduleRender();  // Direct render call
}
```

**New Code:**
```javascript
_applyLayerToggle(show) {
    // ... layer visibility logic ...
    this.eventBus.emit('layer:visibility-changed', {
        layerVisibility: newVisibility,
        triggeredBy: 'sidebar-toggle'
    });
    this.eventBus.emit('render:requested');
}
```

#### Step 2.2: SettingsController Migration
**Current Code:**
```javascript
// Grid/heatmap toggle
this.map.render();
```

**New Code:**
```javascript
// Grid/heatmap toggle
this.eventBus.emit('render:requested');
```

#### Step 2.3: ToolbarController Migration
Replace direct render calls with event emissions.

#### Step 2.4: RouteComputeController Migration
**Current Code:**
```javascript
try { this.map.render(); } catch (e) { /* error */ }
```

**New Code:**
```javascript
this.eventBus.emit('render:requested');
```

### Phase 3: Input Handler Migration

#### Step 3.1: PointerHandler Migration
**Current Code:**
```javascript
this._render = this.map.render.bind(this.map);
// ...
this._render();  // Direct call
```

**New Code:**
```javascript
// Remove bound render method
// ...
this.eventBus.emit('render:requested');
```

#### Step 3.2: KeyboardHandler Migration
Replace direct render calls with event emissions.

#### Step 3.3: RouteEditHandler Migration
Replace direct render calls with event emissions.

### Phase 4: Map.js Event Listeners

#### Step 4.1: Add Render Event Listener
```javascript
// In InteractiveMap.init()
this.eventBus.on('render:requested', () => {
    this.render();
});
```

#### Step 4.2: Add Layer Event Listeners
```javascript
this.eventBus.on('layer:visibility-changed', (data) => {
    this.layerVisibility = data.layerVisibility;
    this.updateLayerCounts();
});

this.eventBus.on('layer:counts-changed', () => {
    this.updateLayerCounts();
});
```

#### Step 4.3: Add State Synchronization Listeners ✅ **COMPLETED**
```javascript
// Added to map.js init() function:
eventBus.on(window.EventTypes.SELECTION_CHANGED, (data) => {
    // Update selection state and trigger render
});

eventBus.on(window.EventTypes.MAP_VIEW_CHANGED, (data) => {
    // Update map view state (pan, zoom) and trigger render
});

eventBus.on(window.EventTypes.ROUTE_UPDATED, (data) => {
    // Update route state and trigger render
});
```

### Phase 5: State Manager Enhancement

#### Step 5.1: Add Event Emission to State Managers ✅ **COMPLETED**
```javascript
// state/LayerState.js - Added event emission to:
setLayerVisible(layerKey, visible) {
    // ... existing logic ...
    this._emitChange(window.EventTypes.LAYER_VISIBILITY_CHANGED, { layerKey, visible, layerVisibility: {...} });
}

toggleLayer(layerKey) {
    // ... existing logic ...
    this._emitChange(window.EventTypes.LAYER_VISIBILITY_CHANGED, { layerKey, visible: !current, layerVisibility: {...} });
}

// state/RouteState.js - Added event emission to:
setRoute(routeIndices, lengthNormalized, routeSources) {
    // ... existing logic ...
    this._emitChange(window.EventTypes.ROUTE_UPDATED, { route: routeIndices, lengthNormalized, sources: routeSources });
}

clearRoute() {
    // ... existing logic ...
    this._emitChange(window.EventTypes.ROUTE_CLEARED);
}

// state/SelectionState.js - Added event emission to:
setSelectedMarker(marker, layerKey) {
    // ... existing logic ...
    this._emitChange(window.EventTypes.SELECTION_CHANGED, { marker, layer });
}

// state/MapState.js - Added event emission to:
setZoom(zoom, centerX, centerY) {
    // ... existing logic ...
    this._emitChange(window.EventTypes.MAP_VIEW_CHANGED, { panX: this.panX, panY: this.panY, zoom: this.zoom });
}
```

#### Step 5.2: RouteState Enhancement ✅ **COMPLETED**
Event emission for route changes was implemented as part of Step 5.1. RouteState now emits `ROUTE_UPDATED` and `ROUTE_CLEARED` events.

#### Step 5.3: SelectionState Enhancement ✅ **COMPLETED**
Event emission for selection changes was implemented as part of Step 5.1. SelectionState now emits `SELECTION_CHANGED`, `SELECTION_CLEARED`, `EDIT_MODE_CHANGED`, and `LAYER_HIGHLIGHT_CHANGED` events.

### Phase 6: Renderer Integration

#### Step 6.1: RenderPipeline Dirty Flags ✅ **COMPLETED**
```javascript
// rendering/RenderPipeline.js
markDirty(rendererName) {
    this._dirtyFlags.add(rendererName);
    // Emit event to notify other modules that a renderer needs updating
    if (window.eventBus) {
        window.eventBus.emit(window.EventTypes.RENDER_PIPELINE_DIRTY, { renderer: rendererName });
    }
    this._scheduleRender();
    return this;
}
```

#### Step 6.2: Selective Rendering ✅ **COMPLETED**
```javascript
render(dirtyOnly = null) {
    const startTime = performance.now();
    this._renderCount++;

    // Emit event when selective rendering is requested
    if (dirtyOnly && window.eventBus) {
        window.eventBus.emit(window.EventTypes.RENDER_SELECTIVE_REQUESTED, { renderers: Array.from(dirtyOnly) });
    }
    // ... existing render logic
}
```

---

## Files Requiring Changes

### Core Infrastructure Files
- **NEW:** `utils/EventBus.js` - EventBus class implementation
- `index.html` - Add EventBus script tag
- `map.js` - Initialize EventBus, add event listeners

### Controller Files (5 files)
- `controllers/SidebarController.js` - Replace direct map calls
- `controllers/SettingsController.js` - Replace direct map calls
- `controllers/ToolbarController.js` - Replace direct map calls
- `controllers/RouteComputeController.js` - Replace direct map calls
- `controllers/LayerListController.js` - Replace direct map calls

### Input Handler Files (3 files)
- `input/PointerHandler.js` - Replace direct render calls
- `input/KeyboardHandler.js` - Replace direct render calls
- `input/RouteEditHandler.js` - Replace direct render calls

### State Manager Files (4 files)
- `state/LayerState.js` - Add event emission
- `state/RouteState.js` - Add event emission
- `state/SelectionState.js` - Add event emission
- `state/MapState.js` - Add event emission

### Rendering Files (1 file)
- `rendering/RenderPipeline.js` - Integrate with EventBus for dirty flags

### Data Manager Files (2 files)
- `data/MarkerManager.js` - Add event emission for marker changes
- `data/RouteManager.js` - Add event emission for route changes

---

## Detailed File-by-File Changes

### utils/EventBus.js (NEW FILE)
```javascript
// Complete EventBus implementation as shown above
```

### map.js Changes
**Lines to modify:** ~50 lines
**Changes:**
- Add EventBus initialization in init()
- Add event listeners for render requests
- Add event listeners for state synchronization
- Remove direct method exposure where appropriate

### Controller Changes Summary
**Total direct calls to replace:** ~25 calls across 5 controllers
**Pattern:**
```javascript
// Before
this.map.render();
this.map.updateLayerCounts();

// After
this.eventBus.emit('render:requested');
this.eventBus.emit('layer:counts-changed');
```

### Input Handler Changes Summary
**Total direct calls to replace:** ~15 calls across 3 handlers
**Pattern:**
```javascript
// Before
this._render();

// After
this.eventBus.emit('render:requested');
```

---

## Testing Strategy

### Unit Testing Approach
```javascript
// tests/utils/eventbus_test.js
describe('EventBus', () => {
    let eventBus;
    
    beforeEach(() => {
        eventBus = new EventBus();
    });
    
    it('should emit events to listeners', () => {
        const callback = jasmine.createSpy('callback');
        eventBus.on('test:event', callback);
        
        eventBus.emit('test:event', { data: 'test' });
        
        expect(callback).toHaveBeenCalledWith({ data: 'test' });
    });
    
    it('should handle multiple listeners', () => {
        const callback1 = jasmine.createSpy('callback1');
        const callback2 = jasmine.createSpy('callback2');
        
        eventBus.on('test:event', callback1);
        eventBus.on('test:event', callback2);
        
        eventBus.emit('test:event');
        
        expect(callback1).toHaveBeenCalled();
        expect(callback2).toHaveBeenCalled();
    });
});
```

### Controller Testing Improvements
```javascript
// tests/controllers/sidebar_controller_test.js
describe('SidebarController with EventBus', () => {
    let mockEventBus, controller;
    
    beforeEach(() => {
        mockEventBus = {
            emit: jasmine.createSpy('emit'),
            on: jasmine.createSpy('on'),
            off: jasmine.createSpy('off')
        };
        controller = new SidebarController(mockMap, mockConfig, mockErrorHandler, mockEventBus);
    });
    
    it('should emit render request when toggling layers', () => {
        controller._applyLayerToggle(true);
        
        expect(mockEventBus.emit).toHaveBeenCalledWith('render:requested');
        expect(mockEventBus.emit).toHaveBeenCalledWith('layer:visibility-changed', jasmine.any(Object));
    });
});
```

---

## Benefits Analysis

### 1. Loose Coupling
- Modules communicate through events, not direct references
- Easier to replace or mock dependencies
- Reduced circular dependency risks

### 2. Improved Testability
- Controllers can be tested with mocked EventBus
- No need for full map instances in unit tests
- Event emissions can be verified independently

### 3. Better Separation of Concerns
- UI logic separated from business logic
- Clear boundaries between modules
- Single responsibility principle better enforced

### 4. Easier Extensibility
- New modules can listen to existing events without code changes
- Adding new features that react to state changes is trivial
- Plugin-like architecture becomes possible

### 5. Clear Data Flow
- Event system documents how modules communicate
- Easier to understand application flow
- Better debugging capabilities

### 6. State Synchronization
- Centralized event system prevents state inconsistencies
- Reactive updates instead of polling
- Predictable state change propagation

---

## Challenges and Mitigations

### Challenge 1: Event Naming Consistency
**Problem:** Inconsistent event naming across modules
**Mitigation:** Define event naming conventions upfront, create constants file

### Challenge 2: Event Handler Errors
**Problem:** Event handler errors could break application flow
**Mitigation:** Built-in error handling in EventBus with error logging

### Challenge 3: Memory Leaks
**Problem:** Forgotten event listeners could cause memory leaks
**Mitigation:** Return unsubscribe functions, clear listeners on module destruction

### Challenge 4: Event Ordering Dependencies
**Problem:** Some events may need to be processed in specific order
**Mitigation:** Use synchronous event emission, document event dependencies

### Challenge 5: Debugging Complexity
**Problem:** Event flow harder to trace than direct calls
**Mitigation:** Add event logging, create event flow diagrams

### Challenge 6: Migration Effort
**Problem:** Large number of direct calls to replace
**Mitigation:** Phased migration approach, comprehensive testing

---

## Migration Plan

### Phase 1: Infrastructure (Week 1)
- [ ] Create EventBus.js
- [ ] Add EventBus initialization
- [ ] Define event type constants
- [ ] Create comprehensive tests

### Phase 2: Controller Migration (Week 2)
- [ ] Migrate SidebarController
- [ ] Migrate SettingsController
- [ ] Migrate ToolbarController
- [ ] Migrate RouteComputeController
- [ ] Migrate LayerListController

### Phase 3: Input Handler Migration (Week 3)
- [ ] Migrate PointerHandler
- [ ] Migrate KeyboardHandler
- [ ] Migrate RouteEditHandler

### Phase 4: Map.js Integration (Week 4)
- [ ] Add event listeners to map.js
- [ ] Remove direct method exposure
- [ ] Update initialization logic

### Phase 5: State Manager Enhancement (Week 5)
- [x] Add event emission to LayerState
- [x] Add event emission to RouteState
- [x] Add event emission to SelectionState
- [x] Add event emission to MapState

### Phase 6: Testing and Validation (Week 6)
- [ ] Update all unit tests
- [ ] Integration testing
- [ ] Performance testing
- [ ] Documentation updates

---

## Success Metrics

### Code Quality Metrics
- **Coupling Reduction:** 80% reduction in direct method calls
- **Test Coverage:** 90% of controllers testable without map instances
- **Event Documentation:** 100% of events documented with payload schemas

### Performance Metrics
- **Memory Usage:** No increase in memory usage
- **Event Latency:** < 1ms average event emission time
- **Render Performance:** No degradation in render performance

### Maintainability Metrics
- **New Feature Time:** 50% reduction in time to add state-reactive features
- **Bug Fix Time:** 30% reduction in time to fix state synchronization bugs
- **Code Review Time:** 40% reduction in code review time for new features

---

## Risk Assessment

### High Risk Items
1. **Event Handler Errors Breaking UI:** Mitigated by error handling in EventBus
2. **Memory Leaks from Uncleaned Listeners:** Mitigated by proper cleanup patterns
3. **Performance Degradation:** Mitigated by efficient EventBus implementation

### Medium Risk Items
1. **Complex Event Dependencies:** Mitigated by clear documentation
2. **Testing Complexity:** Mitigated by comprehensive test suite
3. **Developer Learning Curve:** Mitigated by detailed documentation

### Low Risk Items
1. **Event Naming Inconsistencies:** Mitigated by constants and conventions
2. **Debugging Difficulty:** Mitigated by logging and monitoring tools

---

## Conclusion

Implementing an EventBus for cross-module communication represents a significant architectural improvement that will:

1. **Decouple modules** for better maintainability
2. **Enable easier testing** through dependency injection
3. **Provide clearer data flow** documentation
4. **Support future extensibility** without code changes
5. **Improve state synchronization** across the application

The migration effort is substantial but worthwhile, with clear benefits that will compound over time as the codebase grows. The phased approach ensures minimal disruption while providing a solid foundation for future development.

**Recommended Action:** Proceed with Phase 1 infrastructure implementation and begin controller migration.

---

## Appendices

### Appendix A: Event Payload Schemas
### Appendix B: Migration Checklist
### Appendix C: Testing Guidelines
### Appendix D: Performance Benchmarks