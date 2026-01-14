// utils/EventTypes.js
// Event type constants for EventBus communication

(function (global) {
  const EventTypes = {
    // Render Events
    RENDER_REQUESTED: 'render:requested',
    RENDER_COMPLETED: 'render:completed',
    RENDER_PIPELINE_DIRTY: 'render:pipeline-dirty',

    // Renderer-specific Events
    RENDERER_TILES_UPDATED: 'renderer:tiles-updated',
    RENDERER_MARKERS_UPDATED: 'renderer:markers-updated',
    RENDERER_ROUTE_UPDATED: 'renderer:route-updated',
    RENDERER_OVERLAY_UPDATED: 'renderer:overlay-updated',

    // Layer Events
    LAYER_VISIBILITY_CHANGED: 'layer:visibility-changed',
    LAYER_COUNTS_CHANGED: 'layer:counts-changed',
    LAYER_HIGHLIGHT_CHANGED: 'layer:highlight-changed',
    LAYER_EDIT_MODE_CHANGED: 'layer:edit-mode-changed',
    LAYER_MARKERS_ADDED: 'layer:markers-added',
    LAYER_MARKERS_REMOVED: 'layer:markers-removed',
    LAYER_MARKERS_MOVED: 'layer:markers-moved',

    // Route Events
    ROUTE_COMPUTATION_STARTED: 'route:computation-started',
    ROUTE_COMPUTATION_COMPLETED: 'route:computation-completed',
    ROUTE_COMPUTATION_FAILED: 'route:computation-failed',
    ROUTE_UPDATED: 'route:updated',
    ROUTE_CLEARED: 'route:cleared',
    ROUTE_DIRECTION_CHANGED: 'route:direction-changed',
    ROUTE_EXPANDED: 'route:expanded',

    // Marker Events
    MARKER_SELECTED: 'marker:selected',
    MARKER_DESELECTED: 'marker:deselected',
    MARKER_MULTI_SELECTED: 'marker:multi-selected',
    MARKER_ADDED: 'marker:added',
    MARKER_REMOVED: 'marker:removed',
    MARKER_MOVED: 'marker:moved',
    MARKER_EDITED: 'marker:edited',

    // Input Events
    INPUT_POINTER_DOWN: 'input:pointer-down',
    INPUT_POINTER_MOVE: 'input:pointer-move',
    INPUT_POINTER_UP: 'input:pointer-up',
    INPUT_CLICK: 'input:click',
    INPUT_DOUBLE_CLICK: 'input:double-click',
    INPUT_KEY_DOWN: 'input:key-down',
    INPUT_KEY_UP: 'input:key-up',
    INPUT_PAN: 'input:pan',
    INPUT_ZOOM: 'input:zoom',
    INPUT_ROTATE: 'input:rotate',

    // State Events
    MAP_VIEW_CHANGED: 'map:view-changed',
    MAP_RESOLUTION_CHANGED: 'map:resolution-changed',
    MAP_MODE_CHANGED: 'map:mode-changed',
    SELECTION_CHANGED: 'selection:changed',
    SELECTION_CLEARED: 'selection:cleared',

    // UI Events
    UI_TOOLTIP_SHOWN: 'ui:tooltip-shown',
    UI_TOOLTIP_HIDDEN: 'ui:tooltip-hidden',
    UI_OVERLAY_SHOWN: 'ui:overlay-shown',
    UI_OVERLAY_HIDDEN: 'ui:overlay-hidden',

    // Storage Events
    STORAGE_SETTINGS_LOADED: 'storage:settings-loaded',
    STORAGE_SETTINGS_SAVED: 'storage:settings-saved',
    STORAGE_VIEW_LOADED: 'storage:view-loaded',
    STORAGE_VIEW_SAVED: 'storage:view-saved'
  };

  // Make constants available globally
  global.EventTypes = EventTypes;

})(typeof window !== 'undefined' ? window : global);