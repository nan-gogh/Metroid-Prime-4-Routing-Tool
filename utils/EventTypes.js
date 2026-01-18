// utils/EventTypes.js
// Event type constants for EventBus communication

const EventTypes = {
    // Render Events
    RENDER_REQUESTED: 'render:requested',
    /**
     * Scaffolding: emitted when a render cycle has fully completed.
     * Not currently used by core, preserved for future pipeline hooks.
     */
    RENDER_COMPLETED: 'render:completed',
    RENDER_PIPELINE_DIRTY: 'render:pipeline-dirty',
    RENDER_SELECTIVE_REQUESTED: 'render:selective-requested',

    // Renderer-specific Events
    /**
     * Scaffolding: renderer:* events indicate incremental updates from
     * individual renderers (tiles, markers, route, overlay). Preserve
     * these as lightweight hooks for future optimizations and observers.
     */
    RENDERER_TILES_UPDATED: 'renderer:tiles-updated',
    RENDERER_MARKERS_UPDATED: 'renderer:markers-updated',
    RENDERER_ROUTE_UPDATED: 'renderer:route-updated',
    RENDERER_OVERLAY_UPDATED: 'renderer:overlay-updated',

    // Layer Events
    /**
     * Emitted when layer visibility changes.
     * @event LAYER_VISIBILITY_CHANGED
     * @param {Object} data
     * @param {string} data.layerKey - The layer identifier
     * @param {boolean} data.visible - Whether the layer is visible
     * @param {Object} [data.layerVisibility] - Complete layer visibility state (emitted by LayerState)
     * @param {string} [data.source] - Source of the change (emitted by controllers)
     */
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
    ROUTE_EDIT_REQUESTED: 'route:edit-requested',
    /**
     * Emitted when route data changes.
     * @event ROUTE_UPDATED
     * @param {Object} data
     * @param {Array<number>} [data.route] - Array of route indices (RouteState format)
     * @param {number} [data.lengthNormalized] - Normalized route length 0-1 (RouteState format)
     * @param {Array} [data.sources] - Route source objects (RouteState format)
     * @param {boolean} [data.looping] - Whether route loops (RouteState format)
     * @param {number} [data.routeLength] - Route length in pixels (RouteManager format)
     * @param {number} [data.pointCount] - Number of points in route (RouteManager format)
     */
    ROUTE_UPDATED: 'route:updated',
    ROUTE_CLEARED: 'route:cleared',
    ROUTE_LOOPING_CHANGED: 'route:looping-changed',
    ROUTE_DIRECTION_CHANGED: 'route:direction-changed',
    /**
     * Scaffolding: emitted when a route is expanded (e.g. nearby expansion
     * or programmatic augment). Currently unused but kept for future
     * features that may react to expansion events.
     */
    ROUTE_EXPANDED: 'route:expanded',
    ROUTE_ANIMATION_STARTED: 'route:animation-started',
    ROUTE_ANIMATION_STOPPED: 'route:animation-stopped',
    ROUTE_ANIMATION_OFFSET_CHANGED: 'route:animation-offset-changed',
    ROUTE_ANIMATION_FRAME_CHANGED: 'route:animation-frame-changed',
    ROUTE_ANIMATION_SPEED_CHANGED: 'route:animation-speed-changed',
    ROUTE_ANIMATION_DIRECTION_CHANGED: 'route:animation-direction-changed',
    ROUTE_LINE_WIDTH_CHANGED: 'route:line-width-changed',
    ROUTE_SEGMENT_INSERT_REQUESTED: 'route:segment-insert-requested',
    ROUTE_WAYPOINT_DRAG_REQUESTED: 'route:waypoint-drag-requested',
    ROUTE_WAYPOINT_DRAG_STARTED: 'route:waypoint-drag-started',
    ROUTE_WAYPOINT_DRAG_CHANGED: 'route:waypoint-drag-changed',
    ROUTE_WAYPOINT_DRAG_FINALIZED: 'route:waypoint-drag-finalized',

    // Marker Events
    /**
     * Emitted when a marker is selected.
     * @event MARKER_SELECTED
     * @param {Object} data
     * @param {Object} data.marker - The selected marker object
     * @param {string} data.layerKey - The layer containing the marker
     * @param {number} data.layerIndex - Index of marker in layer array
     */
    MARKER_SELECTED: 'marker:selected',
    MARKER_DESELECTED: 'marker:deselected',
    MARKER_MULTI_SELECTED: 'marker:multi-selected',
    /**
     * Emitted to request marker editing operations.
     * @event MARKER_EDIT_REQUESTED
     * @param {Object} data
     * @param {string} data.action - Action type ('add', 'remove', 'move', 'edit')
     * @param {number} [data.x] - X coordinate for add operations
     * @param {number} [data.y] - Y coordinate for add operations
     * @param {Object} [data.marker] - Marker object for edit operations
     * @param {string} [data.layerKey] - Layer key for operations
     */
    MARKER_EDIT_REQUESTED: 'marker:edit-requested',
    MARKER_ADDED: 'marker:added',
    MARKER_REMOVED: 'marker:removed',
    MARKER_MOVED: 'marker:moved',
    MARKER_EDITED: 'marker:edited',

    // Input Events
    /**
     * Emitted on pointer down events.
     * @event INPUT_POINTER_DOWN
     * @param {Object} data
     * @param {number} data.pointerId - Unique pointer identifier
     * @param {number} data.clientX - Client X coordinate
     * @param {number} data.clientY - Client Y coordinate
     * @param {number} data.button - Mouse button (0=left, 1=middle, 2=right)
     * @param {number} data.timeStamp - Event timestamp
     */
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
    /**
     * Emitted when map view (pan/zoom) changes.
     * @event MAP_VIEW_CHANGED
     * @param {Object} data
     * @param {number} data.panX - X pan offset
     * @param {number} data.panY - Y pan offset
     * @param {number} data.zoom - Zoom level
     * @param {string} [data.triggeredBy] - What triggered the change ('pan', 'zoomIn', 'zoomOut', etc.)
     */
    MAP_VIEW_CHANGED: 'map:view-changed',
    MAP_RESOLUTION_CHANGED: 'map:resolution-changed',
    /**
     * Scaffolding: indicates a change of display mode (e.g. sat/holo/custom).
     * Keep this for UI mode switches that may be added later.
     */
    MAP_MODE_CHANGED: 'map:mode-changed',
    MAP_ZOOM_IN_REQUESTED: 'map:zoom-in-requested',
    MAP_ZOOM_OUT_REQUESTED: 'map:zoom-out-requested',
    MAP_VIEW_RESET_REQUESTED: 'map:view-reset-requested',
    TILESET_CHANGED: 'tileset:changed',
    TILESET_GRAYSCALE_CHANGED: 'tileset:grayscale-changed',
    DISPLAY_SETTINGS_CHANGED: 'display:settings-changed',
    HEATMAP_VISIBILITY_CHANGED: 'heatmap:visibility-changed',
    EDIT_MODE_CHANGED: 'edit:mode-changed',
    SELECTION_CHANGED: 'selection:changed',
    SELECTION_CLEARED: 'selection:cleared',

    // Drag Events
    DRAG_STATE_CHANGED: 'drag:state-changed',
    DRAG_ALL_CANCELLED: 'drag:all-cancelled',
    MARKER_DRAG_CANDIDATE_CHANGED: 'marker:drag-candidate-changed',
    MARKER_DRAG_STARTED: 'marker:drag-started',
    MARKER_POSITION_UPDATE_REQUESTED: 'marker:position-update-requested',
    MARKER_POSITION_UPDATED: 'marker:position-updated',
    MARKER_DRAG_ENDED: 'marker:drag-ended',
    ROUTE_INSERT_CHANGED: 'route:insert-changed',
    ROUTE_INSERT_FINALIZED: 'route:insert-finalized',
    ROUTE_INSERT_CANCELLED: 'route:insert-cancelled',
    ROUTE_NODE_CANDIDATE_CHANGED: 'route:node-candidate-changed',
    ROUTE_NODE_CANDIDATE_CANCELLED: 'route:node-candidate-cancelled',
    ROUTE_PREVIEW_CHANGED: 'route:preview-changed',

    // Highlight Events (enhanced)
    LAYER_HIGHLIGHT_TOGGLED: 'layer:highlight-toggled',
    HIGHLIGHT_MULTIPLIER_CHANGED: 'layer:highlight-multiplier-changed',

    // Route Animation Events
    ROUTE_ANIMATION_FRAME: 'route:animation-frame',

    // Storage Events (enhanced)
    HIGHLIGHT_SETTINGS_SAVE_REQUESTED: 'storage:highlight-settings-save',
    LAYER_VISIBILITY_SAVE_REQUESTED: 'storage:layer-visibility-save',
    // Marker scaling persistence (user + highlight multipliers)
    MARKER_SCALING_SAVE_REQUESTED: 'storage:marker-scaling-save',
    HIGHLIGHT_MULTIPLIER_SAVE_REQUESTED: 'storage:highlight-multiplier-save',
    HIGHLIGHTED_LAYERS_SAVE_REQUESTED: 'storage:highlighted-layers-save',

    // Tileset Events (enhanced)
    TILESET_STATE_CHANGED: 'tileset:state-changed',

    // Route Computation Events
    ROUTE_COMPUTATION_REQUESTED: 'route:computation-requested',

    // Edit Mode Events (UI transitions)
    EDIT_MODE_ENTER_REQUESTED: 'edit:mode-enter-requested',
    EDIT_MODE_EXIT_REQUESTED: 'edit:mode-exit-requested',
    EDIT_OVERLAY_UPDATE_REQUESTED: 'edit:overlay-update-requested',

    // Sidebar Events
    SIDEBAR_VISIBILITY_TOGGLE_REQUESTED: 'sidebar:visibility-toggle-requested',

    // UI Events
    TOOLTIP_SHOW_REQUESTED: 'ui:tooltip-show-requested',
    TOOLTIP_HIDE_REQUESTED: 'ui:tooltip-hide-requested',
  };

  // Make constants available globally
  window.EventTypes = EventTypes;