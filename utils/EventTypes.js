// utils/EventTypes.js
// Event type constants for EventBus communication

(function (global) {
  const EventTypes = {
    // Render Events
    RENDER_REQUESTED: 'render:requested',
    RENDER_COMPLETED: 'render:completed',
    RENDER_PIPELINE_DIRTY: 'render:pipeline-dirty',
    RENDER_SELECTIVE_REQUESTED: 'render:selective-requested',

    // Renderer-specific Events
    RENDERER_TILES_UPDATED: 'renderer:tiles-updated',
    RENDERER_MARKERS_UPDATED: 'renderer:markers-updated',
    RENDERER_ROUTE_UPDATED: 'renderer:route-updated',
    RENDERER_OVERLAY_UPDATED: 'renderer:overlay-updated',

    // Layer Events
    LAYER_VISIBILITY_CHANGED: 'layer:visibility-changed',
    LAYER_COUNTS_CHANGED: 'layer:counts-changed',
    LAYER_HIGHLIGHT_CHANGED: 'layer:highlight-changed',
    LAYER_HIGHLIGHT_MULTIPLIER_CHANGED: 'layer:highlight-multiplier-changed',
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
    ROUTE_ANIMATION_STARTED: 'route:animation-started',
    ROUTE_ANIMATION_STOPPED: 'route:animation-stopped',
    ROUTE_ANIMATION_OFFSET_CHANGED: 'route:animation-offset-changed',
    ROUTE_ANIMATION_FRAME_CHANGED: 'route:animation-frame-changed',
    ROUTE_ANIMATION_SPEED_CHANGED: 'route:animation-speed-changed',
    ROUTE_ANIMATION_DIRECTION_CHANGED: 'route:animation-direction-changed',
    ROUTE_LINE_WIDTH_CHANGED: 'route:line-width-changed',

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
    MAP_ZOOM_IN_REQUESTED: 'map:zoom-in-requested',
    MAP_ZOOM_OUT_REQUESTED: 'map:zoom-out-requested',
    MAP_VIEW_RESET_REQUESTED: 'map:view-reset-requested',
    TILESET_CHANGED: 'tileset:changed',
    TILESET_GRAYSCALE_CHANGED: 'tileset:grayscale-changed',
    DISPLAY_SETTINGS_CHANGED: 'display:settings-changed',
    EDIT_MODE_CHANGED: 'edit:mode-changed',
    SELECTION_CHANGED: 'selection:changed',
    SELECTION_CLEARED: 'selection:cleared',

    // UI Events
    UI_TOOLTIP_SHOWN: 'ui:tooltip-shown',
    UI_TOOLTIP_HIDDEN: 'ui:tooltip-hidden',
    UI_OVERLAY_SHOWN: 'ui:overlay-shown',
    UI_OVERLAY_HIDDEN: 'ui:overlay-hidden',
    TOOLTIP_HIDE_REQUESTED: 'ui:tooltip-hide-requested',
    EDIT_MODE_ENTER_REQUESTED: 'ui:edit-mode-enter-requested',
    EDIT_MODE_EXIT_REQUESTED: 'ui:edit-mode-exit-requested',
    EDIT_OVERLAY_UPDATE_REQUESTED: 'ui:edit-overlay-update-requested',
    SIDEBAR_VISIBILITY_TOGGLE_REQUESTED: 'ui:sidebar-visibility-toggle-requested',

    // Highlight Events (enhanced)
    LAYER_HIGHLIGHT_TOGGLED: 'layer:highlight-toggled',
    HIGHLIGHT_MULTIPLIER_CHANGED: 'layer:highlight-multiplier-changed',

    // Route Animation Events
    ROUTE_ANIMATION_FRAME: 'route:animation-frame',

    // Storage Events (enhanced)
    HIGHLIGHT_SETTINGS_SAVE_REQUESTED: 'storage:highlight-settings-save',

    // Tileset Events (enhanced)
    TILESET_STATE_CHANGED: 'tileset:state-changed',

    // Route Computation Events
    ROUTE_COMPUTATION_REQUESTED: 'route:computation-requested',
  };

  // Make constants available globally
  global.EventTypes = EventTypes;

})(typeof window !== 'undefined' ? window : global);