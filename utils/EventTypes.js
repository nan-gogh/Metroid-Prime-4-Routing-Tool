// utils/EventTypes.js
// Event type constants for EventBus communication

const EventTypes = {
    // Render Events
    /**
     * Request a render cycle. Payload is optional; when provided it may
     * include contextual fields to help callers identify the source of
     * the request.
     * @event RENDER_REQUESTED
     * @param {Object} [data]
    * @param {string} [data.triggeredBy] - Identifier for the triggering action (e.g. 'route-clear')
    * @param {string} [data.reason] - Optional reason string (alias for `triggeredBy` used by some emitters)
    * @param {Event} [data.event] - Optional original DOM/pointer event that caused the render
     */
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
    /**
     * Emitted when the render pipeline's internal state changes in a way that
     * requires re-evaluation (e.g. renderer list, pipeline ordering). Listeners
     * can use this to invalidate cached render preparations.
     * @event RENDER_PIPELINE_DIRTY
     * @param {Object} [data]
     * @param {Array<string>} [data.renderers] - Optional list of affected renderers
     */
    RENDER_PIPELINE_DIRTY: 'render:pipeline-dirty',
    /**
     * Request a selective render of one or more renderers. Emitters should
     * supply a `renderers` array with names of renderers to run; omitting it
     * is treated as a normal `RENDER_REQUESTED`.
     * @event RENDER_SELECTIVE_REQUESTED
     * @param {Object} data
     * @param {Array<string>} [data.renderers] - Names of renderers to run
     */
    RENDER_SELECTIVE_REQUESTED: 'render:selective-requested',

    // Renderer-specific Events (retained observer hooks)
    /**
     * Optional per-renderer incremental hooks.
     * These event constants are retained as observer/plugin hooks but are
     * NOT emitted by the core rendering pipeline in normal operation.
     * Keep them here so plugins, telemetry collectors, or debugging tools
     * can choose to emit or listen for fine-grained renderer progress.
     * When used, emitters should follow the `RendererEventData` contract
     * below. Core code currently uses higher-level render requests and
     * does not emit these by default.
     * @typedef {Object} RendererEventData
     * @property {string} renderer - Name of the renderer (e.g. 'TileRenderer')
     * @property {Array<Object>} [items] - Renderer-specific items (tiles, markers, route segments)
     * @property {Object} [meta] - Optional metadata (bounding box, affected tile keys, etc.)
     *
     * @event RENDERER_TILES_UPDATED
     * @param {RendererEventData} data
     * @note Retained hook: not emitted by core (plugins only)
     */
    RENDERER_TILES_UPDATED: 'renderer:tiles-updated',
    /**
     * @event RENDERER_MARKERS_UPDATED
     * @param {RendererEventData} data
     * @note Retained hook: not emitted by core (plugins only)
     */
    RENDERER_MARKERS_UPDATED: 'renderer:markers-updated',
    /**
     * @event RENDERER_ROUTE_UPDATED
     * @param {RendererEventData} data
     * @note Retained hook: not emitted by core (plugins only)
     */
    RENDERER_ROUTE_UPDATED: 'renderer:route-updated',
    /**
     * @event RENDERER_OVERLAY_UPDATED
     * @param {RendererEventData} data
     * @note Retained hook: not emitted by core (plugins only)
     */
    RENDERER_OVERLAY_UPDATED: 'renderer:overlay-updated',

    // Layer Events
    /**
     * Emitted when layer visibility changes.
     * Emitters must provide the complete `layerVisibility` object; when
     * performing a bulk update the `layerKey` and `visible` fields MAY be
     * set to `null` to indicate multiple-layer changes.
     * @event LAYER_VISIBILITY_CHANGED
     * @param {Object} data
     * @param {string|null} data.layerKey - The layer identifier, or null for bulk updates
     * @param {boolean|null} data.visible - Whether the layer is visible, or null for bulk updates
     * @param {Object} data.layerVisibility - Complete layer visibility state (always provided)
     * @param {string} [data.source] - Optional source of the change (emitted by controllers)
     */
    LAYER_VISIBILITY_CHANGED: 'layer:visibility-changed',
    /**
     * Emitted when layer counts (number of markers per layer) change.
     * Payload is optional; when provided it may include a `triggeredBy`
     * field to indicate the source of the update.
     * @event LAYER_COUNTS_CHANGED
     * @param {Object} [data]
     * @param {string} [data.triggeredBy]
     */
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
    // Route import/export lifecycle events
    ROUTE_IMPORT_STARTED: 'route:import-started',
    ROUTE_IMPORT_COMPLETED: 'route:import-completed',
    ROUTE_IMPORT_FAILED: 'route:import-failed',
    ROUTE_EXPORT_STARTED: 'route:export-started',
    ROUTE_EXPORT_COMPLETED: 'route:export-completed',
    ROUTE_EXPORT_FAILED: 'route:export-failed',
    /**
     * Emitted when route data changes. Currently the canonical emitter is
     * `RouteManager`, which provides the RouteManager-format fields below.
     * @event ROUTE_UPDATED
     * @param {Object} data
    * @param {number} data.routeLength - Route length in pixels
    * @param {number} data.pointCount - Number of points in route
    * @param {boolean} [data.looping] - Optional whether the route is looping
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
     * Emitted when the display mode changes (e.g. switching imagery set).
     * @event MAP_MODE_CHANGED
     * @param {Object} data
     * @param {string} data.mode - New display mode key (e.g. 'sat', 'holo')
     */
    MAP_MODE_CHANGED: 'map:mode-changed',
    /**
     * Request a zoom-in action. Optional center may be provided.
     * @event MAP_ZOOM_IN_REQUESTED
     * @param {Object} [data]
     * @param {number} [data.centerX]
     * @param {number} [data.centerY]
     */
    MAP_ZOOM_IN_REQUESTED: 'map:zoom-in-requested',
    /**
     * Request a zoom-out action. Optional center may be provided.
     * @event MAP_ZOOM_OUT_REQUESTED
     * @param {Object} [data]
     * @param {number} [data.centerX]
     * @param {number} [data.centerY]
     */
    MAP_ZOOM_OUT_REQUESTED: 'map:zoom-out-requested',
    /**
     * Request the view to reset (fit-to-viewport).
     * @event MAP_VIEW_RESET_REQUESTED
     */
    MAP_VIEW_RESET_REQUESTED: 'map:view-reset-requested',
    /**
     * Emitted when the active tileset changes.
     * @event TILESET_CHANGED
     * @param {Object} data
     * @param {string} data.tilesetKey - Tileset identifier (e.g. 'sat')
     */
    TILESET_CHANGED: 'tileset:changed',
    /**
     * Emitted when tileset grayscale mode toggles.
     * @event TILESET_GRAYSCALE_CHANGED
     * @param {Object} data
     * @param {boolean} data.grayscale - Whether grayscale is active
     */
    TILESET_GRAYSCALE_CHANGED: 'tileset:grayscale-changed',
    /**
     * Emitted when general display settings change (e.g., theme, overlays).
     * @event DISPLAY_SETTINGS_CHANGED
     * @param {Object} data - Partial settings object describing changed keys
     */
    DISPLAY_SETTINGS_CHANGED: 'display:settings-changed',
    /**
     * Emitted when heatmap visibility toggles.
     * @event HEATMAP_VISIBILITY_CHANGED
     * @param {Object} data
     * @param {boolean} data.visible - Whether heatmap is visible
     */
    HEATMAP_VISIBILITY_CHANGED: 'heatmap:visibility-changed',
    /**
     * Emitted when the global edit mode state changes.
     * @event EDIT_MODE_CHANGED
     * @param {Object} data
     * @param {string} data.mode - Edit mode key
     * @param {boolean} data.active - Whether the mode is active
     */
    EDIT_MODE_CHANGED: 'edit:mode-changed',
    /**
     * Emitted when the current selection changes.
     * @event SELECTION_CHANGED
     * @param {Object} data
     * @param {Array<Object>} data.selected - Array of selected items
     */
    SELECTION_CHANGED: 'selection:changed',
    /**
     * Emitted when selection is cleared.
     * @event SELECTION_CLEARED
     */
    SELECTION_CLEARED: 'selection:cleared',

    // Drag Events
    /**
     * Emitted when the drag subsystem state changes.
     * @event DRAG_STATE_CHANGED
     * @param {Object} data
     * @param {string} data.state - New drag state ('idle','dragging',...)
     */
    DRAG_STATE_CHANGED: 'drag:state-changed',
    /**
     * Emitted to cancel all ongoing drags.
     * @event DRAG_ALL_CANCELLED
     */
    DRAG_ALL_CANCELLED: 'drag:all-cancelled',
    /**
     * Emitted when the candidate marker for dragging changes (hover->candidate).
     * @event MARKER_DRAG_CANDIDATE_CHANGED
     * @param {Object} data
     * @param {Object|null} data.marker - Marker object or null
     */
    MARKER_DRAG_CANDIDATE_CHANGED: 'marker:drag-candidate-changed',
    /**
     * Emitted when a marker drag starts.
     * @event MARKER_DRAG_STARTED
     * @param {Object} data
     * @param {Object} data.marker - Marker being dragged
     */
    MARKER_DRAG_STARTED: 'marker:drag-started',
    /**
     * Request to update a marker's position during drag.
     * @event MARKER_POSITION_UPDATE_REQUESTED
     * @param {Object} data
     * @param {string} data.markerId - Identifier for the marker
     * @param {number} data.x
     * @param {number} data.y
     */
    MARKER_POSITION_UPDATE_REQUESTED: 'marker:position-update-requested',
    /**
     * Emitted when a marker's position has been updated.
     * @event MARKER_POSITION_UPDATED
     * @param {Object} data
     * @param {string} data.markerId
     * @param {number} data.x
     * @param {number} data.y
     */
    MARKER_POSITION_UPDATED: 'marker:position-updated',
    /**
     * Emitted when a marker drag operation ends.
     * @event MARKER_DRAG_ENDED
     * @param {Object} data
     * @param {string} data.markerId
     */
    MARKER_DRAG_ENDED: 'marker:drag-ended',
    /**
     * Emitted when a route insert preview changes (e.g., candidate index).
     * @event ROUTE_INSERT_CHANGED
     * @param {Object} data
     */
    ROUTE_INSERT_CHANGED: 'route:insert-changed',
    /**
     * Emitted when a route insert is finalized.
     * @event ROUTE_INSERT_FINALIZED
     * @param {Object} data
     */
    ROUTE_INSERT_FINALIZED: 'route:insert-finalized',
    /**
     * Emitted when a route insert is cancelled.
     * @event ROUTE_INSERT_CANCELLED
     */
    ROUTE_INSERT_CANCELLED: 'route:insert-cancelled',
    /**
     * Emitted when a candidate route node changes during an insert operation.
     * @event ROUTE_NODE_CANDIDATE_CHANGED
     * @param {Object} data
     */
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
    /**
     * Request saving current layer visibility to persistent storage.
     * @event LAYER_VISIBILITY_SAVE_REQUESTED
     * @param {Object} data
     * @param {Object} data.layerVisibility - Full visibility object to persist
     */
    LAYER_VISIBILITY_SAVE_REQUESTED: 'storage:layer-visibility-save',
    /**
     * Request saving marker scaling settings.
     * @event MARKER_SCALING_SAVE_REQUESTED
     * @param {Object} data
     * @param {Object} data.scaling - Scaling object to persist
     */
    MARKER_SCALING_SAVE_REQUESTED: 'storage:marker-scaling-save',
    /**
     * Request saving highlight multiplier settings.
     * @event HIGHLIGHT_MULTIPLIER_SAVE_REQUESTED
     * @param {Object} data
     * @param {number} data.multiplier
     */
    HIGHLIGHT_MULTIPLIER_SAVE_REQUESTED: 'storage:highlight-multiplier-save',
    /**
     * Request saving the set of highlighted layers.
     * @event HIGHLIGHTED_LAYERS_SAVE_REQUESTED
     * @param {Object} data
     * @param {Array<string>} data.layerKeys
     */
    HIGHLIGHTED_LAYERS_SAVE_REQUESTED: 'storage:highlighted-layers-save',

    // Generic storage lifecycle events
    STORAGE_SAVE_STARTED: 'storage:save-started',
    STORAGE_SAVE_COMPLETED: 'storage:save-completed',
    STORAGE_SAVE_FAILED: 'storage:save-failed',

    STORAGE_LOAD_STARTED: 'storage:load-started',
    STORAGE_LOAD_COMPLETED: 'storage:load-completed',
    STORAGE_LOAD_FAILED: 'storage:load-failed',

    STORAGE_QUOTA_EXCEEDED: 'storage:quota-exceeded',
    STORAGE_CONSENT_CHANGED: 'storage:consent-changed',

    // Data export/import events (GDPR compliance)
    STORAGE_EXPORT_STARTED: 'storage:export-started',
    STORAGE_EXPORT_COMPLETED: 'storage:export-completed',
    STORAGE_EXPORT_FAILED: 'storage:export-failed',

    STORAGE_IMPORT_STARTED: 'storage:import-started',
    STORAGE_IMPORT_COMPLETED: 'storage:import-completed',
    STORAGE_IMPORT_FAILED: 'storage:import-failed',

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
    /**
     * Request entering an edit mode.
     * @event EDIT_MODE_ENTER_REQUESTED
     * @param {Object} data
     * @param {string} data.mode - Mode to enter (e.g. 'route', 'customMarkers')
     * @param {number} [data.scale] - Optional scale/zoom hint for the UI
     */
    EDIT_MODE_ENTER_REQUESTED: 'edit:mode-enter-requested',
    /**
     * Request exiting an edit mode.
     * @event EDIT_MODE_EXIT_REQUESTED
     * @param {Object} data
     * @param {string} data.mode - Mode to exit (e.g. 'route', 'customMarkers')
     */
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