// state/DragState.js
// Centralized state management for all dragging operations
// Single source of truth for drag state across the application

(function (global) {
  // Shared NOOP handler for guarded logging when no ErrorHandler is injected
  globalThis.NOOP_ERROR_HANDLER = globalThis.NOOP_ERROR_HANDLER || {
    logDebug: function () {},
    logWarning: function () {},
    logError: function () {}
  };
  class DragState extends BaseStateManager {
    constructor(config, options = {}) {
      super(config, options);
      // Default to shared NOOP handler when no errorHandler injected
      this.errorHandler = options.errorHandler || globalThis.NOOP_ERROR_HANDLER;

      // Core dragging states
      this.isDragging = false; // Basic panning
      this.draggingMarker = null; // Active marker drag: { uid, layerKey, pointerId, offsetX, offsetY, originalX, originalY }
      this.draggingCandidate = null; // Marker drag candidate: { uid, layerKey, pointerId, offsetX, offsetY, startClientX, startClientY }

      // Route-specific dragging states
      this.routeInsert = null; // Route segment insertion: { pointerId, tempIndex, tempSource, prevSources, prevIndices, prevRouteLooping, originalMarker, hoverMarker, hoverOccupied, initialDragLocalX, initialDragLocalY, initialPanX, ... }
      this.routeNodeCandidate = null; // Route node drag candidate: { pointerId, routePos, startClientX, startClientY }
      this.waypointDrag = null; // Route waypoint drag: { pointerId, waypointIndex, startWorldX, startWorldY }
      this.routePreview = null; // Route preview: { index, t, worldX, worldY, screenX, screenY }

      // Performance optimization: Create fast accessors
      this._createFastAccessors();
    }

    // Performance optimization: Create fast property accessors
    _createFastAccessors() {
      try {
        Object.defineProperties(this, {
          // Marker dragging
          hasDraggingMarker: { get: () => !!this.draggingMarker },
          hasDraggingCandidate: { get: () => !!this.draggingCandidate },

          // Route dragging
          hasRouteInsert: { get: () => !!this.routeInsert },
          hasRouteNodeCandidate: { get: () => !!this.routeNodeCandidate },
          hasWaypointDrag: { get: () => !!this.waypointDrag },
          hasRoutePreview: { get: () => !!this.routePreview },

          // Any active drag
          hasActiveDrag: { get: () => this.isDragging || this.hasDraggingMarker || this.hasDraggingCandidate || this.hasRouteInsert || this.hasRouteNodeCandidate || this.hasWaypointDrag }
        });
      } catch (e) {
        try {
          this.errorHandler.logWarning('DragState fast accessors failed', 'DragState.constructor.fastAccessors', { error: e });
        } catch (ignore) {}
      }
    }

    // ===== MARKER DRAGGING =====

    setDraggingCandidate(candidate) {
      this.draggingCandidate = candidate ? { ...candidate } : null;
      this._emitChange(window.EventTypes.MARKER_DRAG_CANDIDATE_CHANGED, { candidate: this.draggingCandidate });
    }

    promoteDraggingCandidate(ev) {
      if (!this.draggingCandidate) return false;

      // Find original marker position for cleanup
      let markerObj = null;
      try {
        if (this.draggingCandidate.layerKey && global.LAYERS && global.LAYERS[this.draggingCandidate.layerKey]) {
          const layer = global.LAYERS[this.draggingCandidate.layerKey];
          if (Array.isArray(layer.markers)) {
            markerObj = layer.markers.find(m => m.uid === this.draggingCandidate.uid);
          }
        }
      } catch (e) {
        try {
          this.errorHandler.logWarning('Failed to find marker object for drag promotion', 'DragState.promoteDraggingCandidate', { error: e });
        } catch (ignore) {}
      }

      this.draggingMarker = {
        uid: this.draggingCandidate.uid,
        layerKey: this.draggingCandidate.layerKey,
        pointerId: this.draggingCandidate.pointerId,
        offsetX: this.draggingCandidate.offsetX,
        offsetY: this.draggingCandidate.offsetY,
        originalX: markerObj ? markerObj.x : undefined,
        originalY: markerObj ? markerObj.y : undefined
      };

      this.draggingCandidate = null;
      this._emitChange(window.EventTypes.MARKER_DRAG_STARTED, { marker: this.draggingMarker });
      return true;
    }

    updateDraggingMarkerPosition(x, y) {
      if (!this.draggingMarker) return false;

      // Emit marker position update request - let MarkerManager handle the actual mutation
      // This avoids bypassing MarkerManager's data management
      this._emitChange(window.EventTypes.MARKER_POSITION_UPDATE_REQUESTED, { 
        markerUid: this.draggingMarker.uid,
        newX: x, 
        newY: y 
      });

      return true;
    }

    finalizeDraggingMarker() {
      if (!this.draggingMarker) return;

      this._emitChange(window.EventTypes.MARKER_DRAG_ENDED, { marker: this.draggingMarker });
      this.draggingMarker = null;
    }

    cancelDraggingMarker() {
      if (!this.draggingMarker) return;

      // Restore original position if available
        if (this.draggingMarker.originalX !== undefined && this.draggingMarker.originalY !== undefined) {
        this.updateDraggingMarkerPosition(this.draggingMarker.originalX, this.draggingMarker.originalY);
        try {
          this.errorHandler.logDebug('Restored marker to original position', 'DragState.cancelDraggingMarker', {
            markerUid: this.draggingMarker.uid, originalX: this.draggingMarker.originalX, originalY: this.draggingMarker.originalY
          });
        } catch (ignore) {}
      }

      this.finalizeDraggingMarker();
    }

    // ===== ROUTE DRAGGING =====

    setRouteInsert(insertState) {
      this.routeInsert = insertState ? { ...insertState } : null;
      this._emitChange(window.EventTypes.ROUTE_INSERT_CHANGED, { insert: this.routeInsert });
    }

    setRouteNodeCandidate(candidate) {
      this.routeNodeCandidate = candidate ? { ...candidate } : null;
      this._emitChange(window.EventTypes.ROUTE_NODE_CANDIDATE_CHANGED, { candidate: this.routeNodeCandidate });
    }

    setWaypointDrag(dragState) {
      this.waypointDrag = dragState ? { ...dragState } : null;
      this._emitChange(window.EventTypes.ROUTE_WAYPOINT_DRAG_CHANGED, { drag: this.waypointDrag });
    }

    setRoutePreview(preview) {
      this.routePreview = preview ? { ...preview } : null;
      this._emitChange(window.EventTypes.ROUTE_PREVIEW_CHANGED, { preview: this.routePreview });
    }

    finalizeRouteInsert() {
      if (!this.routeInsert) return;

      this._emitChange(window.EventTypes.ROUTE_INSERT_FINALIZED, { insert: this.routeInsert });
      this.routeInsert = null;
    }

    finalizeWaypointDrag(ev) {
      if (!this.waypointDrag) return;

      // Emit FINALIZED first so RouteEditHandler can store pointer coords
      // for drop target detection
      this._emitChange(window.EventTypes.ROUTE_WAYPOINT_DRAG_FINALIZED, { 
        pointerId: ev ? ev.pointerId : null,
        clientX: ev ? ev.clientX : 0,
        clientY: ev ? ev.clientY : 0
      });
      
      // THEN emit CHANGED via setWaypointDrag(null) so RouteEditHandler's
      // CHANGED listener can process the pending finalize with drop target detection
      this.setWaypointDrag(null);
    }

    cancelRouteInsert(reason = 'Operation cancelled') {
      if (!this.routeInsert) return;

      try {
        this.errorHandler.logWarning('Cancelling route insert', 'DragState.cancelRouteInsert', { reason });
      } catch (ignore) {}

      // Release pooled objects
      if (this.routeInsert.tempMarker && typeof markerPool !== 'undefined') {
        markerPool.release(this.routeInsert.tempMarker);
      }
      if (this.routeInsert.tempSource && typeof routeSourcePool !== 'undefined') {
        routeSourcePool.release(this.routeInsert.tempSource);
      }

      this._emitChange(window.EventTypes.ROUTE_INSERT_CANCELLED, { insert: this.routeInsert, reason });
      this.routeInsert = null;
    }

    cancelRouteNodeCandidate() {
      if (!this.routeNodeCandidate) return;

      this._emitChange(window.EventTypes.ROUTE_NODE_CANDIDATE_CANCELLED, { candidate: this.routeNodeCandidate });
      this.routeNodeCandidate = null;
    }

    // ===== BASIC PANNING =====

    setDragging(isDragging) {
      const changed = this.isDragging !== isDragging;
      this.isDragging = isDragging;
      if (changed) {
        this._emitChange(window.EventTypes.DRAG_STATE_CHANGED, { isDragging: this.isDragging });
      }
    }

    // ===== CLEANUP =====

    finalizeAllDrags(ev) {
      let finalized = false;

      // Finalize marker drag if active
      if (this.draggingMarker && (!ev || ev.pointerId === this.draggingMarker.pointerId)) {
        this.finalizeDraggingMarker();
        finalized = true;
      }

      // Finalize route insert if active
      if (this.routeInsert && (!ev || ev.pointerId === this.routeInsert.pointerId)) {
        this.finalizeRouteInsert();
        finalized = true;
      }

      // Finalize waypoint drag if active
      if (this.waypointDrag && (!ev || ev.pointerId === this.waypointDrag.pointerId)) {
        this.finalizeWaypointDrag(ev);
        finalized = true;
      }

      // Clear route node candidate
      if (this.routeNodeCandidate && (!ev || ev.pointerId === this.routeNodeCandidate.pointerId)) {
        this.setRouteNodeCandidate(null);
        finalized = true;
      }

      // Clear dragging candidate
      if (this.draggingCandidate && (!ev || ev.pointerId === this.draggingCandidate.pointerId)) {
        this.draggingCandidate = null;
        finalized = true;
      }

      // Clear route preview
      if (this.routePreview) {
        this.routePreview = null;
        finalized = true;
      }

      // End panning
      if (this.isDragging) {
        this.setDragging(false);
        finalized = true;
      }

      if (finalized) {
        this._emitChange(window.EventTypes.RENDER_REQUESTED, { reason: 'drag:all-finalized', event: ev });
      }

      return finalized;
    }

    cancelAllDrags(reason = 'All operations cancelled') {
      let cancelled = false;

      if (this.draggingCandidate) {
        this.draggingCandidate = null;
        cancelled = true;
      }

      if (this.draggingMarker) {
        this.cancelDraggingMarker();
        cancelled = true;
      }

      if (this.routeInsert) {
        this.cancelRouteInsert(reason);
        cancelled = true;
      }

      if (this.routeNodeCandidate) {
        this.cancelRouteNodeCandidate();
        cancelled = true;
      }

      if (this.waypointDrag) {
        this.setWaypointDrag(null);
        cancelled = true;
      }

      if (this.routePreview) {
        this.routePreview = null;
        cancelled = true;
      }

      if (this.isDragging) {
        this.setDragging(false);
        cancelled = true;
      }

      if (cancelled) {
        this._emitChange(window.EventTypes.DRAG_ALL_CANCELLED, { reason });
      }

      return cancelled;
    }

    // ===== SERIALIZATION =====

    toJSON() {
      return {
        isDragging: this.isDragging,
        hasDraggingMarker: this.hasDraggingMarker,
        hasDraggingCandidate: this.hasDraggingCandidate,
        hasRouteInsert: this.hasRouteInsert,
        hasRouteNodeCandidate: this.hasRouteNodeCandidate,
        hasRoutePreview: this.hasRoutePreview,
        hasActiveDrag: this.hasActiveDrag
      };
    }

    // State persistence methods (for consistency with other state managers)
    // DragState manages transient operations, so these are no-ops
    saveToStorage() {
      // Drag state is transient and not persisted
      return false;
    }

    loadFromStorage() {
      // Drag state is transient and not loaded from storage
      return false;
    }
  }

  // Export to global scope
  global.DragState = DragState;

})(typeof window !== 'undefined' ? window : global);
