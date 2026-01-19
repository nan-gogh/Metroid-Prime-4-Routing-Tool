// utils/EventTypes.js
// Event type constants for EventBus communication

const EventTypes = {
    // Render Events
    RENDER_REQUESTED: 'render:requested',
    /**
     * Optional: emitted when a full render cycle has completed.
     * Useful for telemetry, end-to-end tests, or plugins that need a
     * deterministic "render finished" notification.
     * @event RENDER_COMPLETED
     * @param {Object} data
     * @param {number} [data.frameId] - Optional frame identifier (RAF id)
     * @param {Array<string>} [data.renderers] - List of renderer names that ran
     * @param {number} [data.durationMs] - Optional total render duration in ms
     */
    RENDER_COMPLETED: 'render:completed',
    RENDER_PIPELINE_DIRTY: 'render:pipeline-dirty',
    RENDER_SELECTIVE_REQUESTED: 'render:selective-requested',

    // Renderer-specific Events
    /**
     * Optional per-renderer incremental hooks.
     * These events are emitted by individual renderers to signal
     * incremental progress or small updates. Keep as observer hooks
     * for metrics, debugging, or incremental UIs.
     * @typedef {Object} RendererEventData
     * @property {string} renderer - Name of the renderer (e.g. 'TileRenderer')
     * @property {Array<Object>} [items] - Renderer-specific items (tiles, markers, route segments)
     * @property {Object} [meta] - Optional metadata (bounding box, affected tile keys, etc.)
     *
     * @event RENDERER_TILES_UPDATED
     * @param {RendererEventData} data
     */
    RENDERER_TILES_UPDATED: 'renderer:tiles-updated',
    /**
     * @event RENDERER_MARKERS_UPDATED
     * @param {RendererEventData} data
     */
    RENDERER_MARKERS_UPDATED: 'renderer:markers-updated',
    /**
     * @event RENDERER_ROUTE_UPDATED
     * @param {RendererEventData} data
     */
    RENDERER_ROUTE_UPDATED: 'renderer:route-updated',
    /**
     * @event RENDERER_OVERLAY_UPDATED
     * @param {RendererEventData} data
     */
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
    // Per-layer marker diff events (added/removed/moved) removed from
    // the core API because they are not referenced. Reintroduce only
    // if you implement incremental marker diffs in the data or
    // rendering subsystems.

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
    // `ROUTE_EXPANDED` removed (unused scaffolding). Reintroduce only
    // if programmatic route expansion events are implemented.
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
    /**
     * Emitted to request clearing all custom markers.
     * Handled by MarkerManager to perform an authoritative clear and persistence.
     * @event MARKER_CLEAR_REQUESTED
     */
    MARKER_CLEAR_REQUESTED: 'marker:clear-requested',
    MARKER_ADDED: 'marker:added',
    MARKER_REMOVED: 'marker:removed',
    MARKER_MOVED: 'marker:moved',
    MARKER_EDITED: 'marker:edited',

    // Input-level constants (pointer/click/key/pan/zoom/rotate) have
    // been removed from the core EventTypes because the codebase uses
    // higher-level, state-driven events (e.g., `MAP_VIEW_CHANGED`,
    // `MARKER_*`, and route edit events). Reintroduce only if you
    // normalize raw input events onto the EventBus.

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
    /**
     * Emitted when the map's chosen image/tile resolution changes.
     * Emitted by `ImageState` or the rendering pipeline when the
     * resolution multiplier or selected tile resolution is updated.
     * @event MAP_RESOLUTION_CHANGED
     * @param {Object} data
     * @param {number} data.multiplier - Effective resolution multiplier (e.g. 1.0, 2.0)
     * @param {number} data.selectedIndex - Index into the configured tile resolutions
     * @param {number} [data.tileSize] - Pixel size of tiles at the selected resolution
     * @param {string} [data.triggeredBy] - Source of the change ('viewport', 'dpr', 'manual')
     */
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
    // Keep `LAYER_HIGHLIGHT_MULTIPLIER_CHANGED` as the canonical event
    // used by the HighlightState; duplicate/ambiguous names were
    // removed to avoid confusion.
    LAYER_HIGHLIGHT_MULTIPLIER_CHANGED: 'layer:highlight-multiplier-changed',

    // Route Animation Events
    // (non-suffixed `ROUTE_ANIMATION_FRAME` removed; use
    // `ROUTE_ANIMATION_FRAME_CHANGED` which is emitted by the
    // animation subsystem.)

    // Storage Events (enhanced)
    // `HIGHLIGHT_SETTINGS_SAVE_REQUESTED` removed (unused). Keep
    // the persistence hooks below which are emitted by settings
    // controllers when users change visibility/scaling presets.
    LAYER_VISIBILITY_SAVE_REQUESTED: 'storage:layer-visibility-save',
    // Marker scaling persistence (user + highlight multipliers)
    MARKER_SCALING_SAVE_REQUESTED: 'storage:marker-scaling-save',
    HIGHLIGHT_MULTIPLIER_SAVE_REQUESTED: 'storage:highlight-multiplier-save',
    HIGHLIGHTED_LAYERS_SAVE_REQUESTED: 'storage:highlighted-layers-save',

    // Tileset Events (enhanced)
    /**
     * Emitted to report tileset loader/selection state changes. Useful
     * for UI feedback when switching imagery (sat/holo) or handling
     * loader errors.
     * @event TILESET_STATE_CHANGED
     * @param {Object} data
     * @param {string} data.tilesetKey - Identifier for the tileset
     * @param {'loading'|'ready'|'error'} data.state - Current tileset state
     * @param {Object} [data.details] - Additional details (error info, stats)
     */
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