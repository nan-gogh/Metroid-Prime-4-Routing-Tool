// input/RouteEditHandler.js
// Handles route-specific pointer interactions (drag, insert, preview)
// Extracted from PointerHandler to reduce complexity

(function (global) {
  class RouteEditHandler {
    constructor(map, config, eventBus, editModeState, dragState) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.errorHandler = map.errorHandler || (global.errorHandler);
      this.eventBus = eventBus || window.eventBus;
      this.dragState = dragState;

      // Get state managers from map
      this.mapState = map.mapState;
      this.selectionState = map.selectionState;
      this.editModeState = editModeState || (map && map.editModeState);

      // Route utilities for calculations

      // Canonical route-length computation: use RouteManager only
      try {
        if (map && map.routeManager && typeof map.routeManager.computeRouteLengthNormalized === 'function') {
          this._computeRouteLengthNormalized = map.routeManager.computeRouteLengthNormalized.bind(map.routeManager);
        } else {
          this._computeRouteLengthNormalized = null;
        }
      } catch (e) {
        this._computeRouteLengthNormalized = null;
      }

      // Helper to call marker hover without touching map directly
      this._checkMarkerHover = map.checkMarkerHover ? map.checkMarkerHover.bind(map) : () => null;

      // Route finding functions
      this._findRouteWaypointAt = (screenX, screenY) => {
        if (this.map.routeController && typeof this.map.routeController.findRouteWaypointAt === 'function') {
          return this.map.routeController.findRouteWaypointAt(screenX, screenY);
        }
        return null;
      };
      this._findRouteSegmentAt = this.map.routeController ? this.map.routeController.findRouteSegmentAt.bind(this.map.routeController) : null;

      // Performance optimization: Create fast property accessors
      this._createFastAccessors();
    }

    // Performance optimization: Create fast property accessors
    _createFastAccessors() {
      try {
        Object.defineProperties(this, {
          panX: { get: () => this.mapState.panX },
          panY: { get: () => this.mapState.panY },
          zoom: { get: () => this.mapState.zoom },
          canvas: { get: () => this.map.canvas },
          currentRoute: { get: () => this.map.routeManager ? this.map.routeManager.currentRoute : [] },
          _routeSources: { get: () => this.map.routeManager ? this.map.routeManager.routeSources : [] },
          editRouteMode: { get: () => this.editModeState ? this.editModeState.editRouteMode : false },
          _routeInsert: {
            get: () => this.dragState.routeInsert,
            set: (v) => this.dragState.setRouteInsert(v)
          },
          _routePreview: {
            get: () => this.dragState.routePreview,
            set: (v) => this.dragState.setRoutePreview(v)
          },
          _waypointDrag: {
            get: () => this.dragState.waypointDrag,
            set: (v) => this.dragState.setWaypointDrag(v)
          }
        });
      } catch (e) {
        console.debug('RouteEditHandler fast accessors failed', 'RouteEditHandler.constructor.fastAccessors', { error: e });
      }

      // Pending waypoint finalization event (stores pointer event for drop target detection)
      this._pendingWaypointFinalize = null;

      // Event listener cleanup
      this._eventUnsubscribers = [];

      // Set up event listeners for drag finalization
      this._setupDragFinalizeListeners();
    }

    // Set up listeners for waypoint drag finalization events
    _setupDragFinalizeListeners() {
      try {
        if (!this.eventBus || !window.EventTypes) return;

        // Use EventUtils for standardized event handling
        const eventManager = window.EventUtils.createEventManager(this);

        eventManager.setup(this.eventBus, [
          {
            event: window.EventTypes.ROUTE_WAYPOINT_DRAG_FINALIZED,
            handler: (data) => {
              // Store the finalize event with pointer coords for processing
              // when ROUTE_WAYPOINT_DRAG_CHANGED fires with null drag
              if (data && (data.clientX !== undefined || data.pointerId !== undefined)) {
                this._pendingWaypointFinalize = data;
              }
            }
          },
          {
            event: window.EventTypes.ROUTE_WAYPOINT_DRAG_CHANGED,
            handler: (data) => {
              // When drag transitions to null, we need to finalize
              if (!data.drag) {
                if (this._pendingWaypointFinalize) {
                  // Normal finalization: process drop target
                  const ev = this._pendingWaypointFinalize;
                  this._pendingWaypointFinalize = null;

                  // Check if we dropped on a valid marker
                  let localX = 0, localY = 0;
                  try {
                    const rect = this.canvas.getBoundingClientRect();
                    localX = (ev.clientX || 0) - rect.left;
                    localY = (ev.clientY || 0) - rect.top;
                  } catch (e) {
                    this.errorHandler && console.debug('Failed to get local coords', 'RouteEditHandler._setupDragFinalizeListeners', { error: e });
                  }

                  const hit = this._findMarkerAt(localX, localY);

                  let snapToMarker = null;
                  let cancel = true;

                  if (hit && hit.marker && hit.marker.uid) {
                    // Check if this marker is already in the route
                    let alreadyInRoute = false;
                    for (let i = 0; i < this.currentRoute.length; i++) {
                      const src = this._routeSources[this.currentRoute[i]];
                      if (src && src.marker && src.marker.uid === hit.marker.uid) {
                        alreadyInRoute = true;
                        break;
                      }
                    }

                    if (!alreadyInRoute) {
                      snapToMarker = {
                        uid: hit.marker.uid,
                        layerKey: hit.layerKey
                      };
                      cancel = false;
                    }
                  }

                  // Emit finalize event to RouteManager with drop target information
                  this.eventBus.emit(window.EventTypes.ROUTE_EDIT_REQUESTED, {
                    finalizeWaypointDrag: true,
                    snapToMarker: snapToMarker,
                    cancel: cancel
                  });
                } else {
                  // External cancellation (escape, mouse leave, etc.)
                  // No pending finalize means drag was aborted, cancel it
                  this.eventBus.emit(window.EventTypes.ROUTE_EDIT_REQUESTED, {
                    finalizeWaypointDrag: true,
                    snapToMarker: null,
                    cancel: true
                  });
                }
              }
            }
          }
        ], this, this.errorHandler);
      } catch (e) {
        this.errorHandler && console.debug('RouteEditHandler._setupDragFinalizeListeners failed', 'RouteEditHandler._setupDragFinalizeListeners', { error: e });
      }
    }

    // ===== ROUTE-SPECIFIC POINTER HANDLING =====

    handlePointerDown(ev, localX, localY, downTime) {
      try {
        // Route node drag start - check regular markers first
        const hit = this._checkMarkerHover ? this._checkMarkerHover(localX, localY) : null;
        if (hit && this.editRouteMode && hit.marker && hit.marker.uid) {
          // Find route position and set local candidate state
            const routePos = (this.map && this.map.routeManager && typeof this.map.routeManager.findRoutePositionOfMarker === 'function') ?
            this.map.routeManager.findRoutePositionOfMarker(hit.marker.uid) : -1;
          if (routePos !== -1) {
            this.dragState.setRouteNodeCandidate({
              pointerId: ev.pointerId,
              routePos: routePos,
              startClientX: ev.clientX,
              startClientY: ev.clientY
            });
            return true; // Handled
          }
        }

        // Route waypoint drag start - check route waypoints if no regular marker hit
        if (this.editRouteMode) {
          const waypointHit = this._findRouteWaypointAt ? this._findRouteWaypointAt(localX, localY) : null;
          if (waypointHit && waypointHit.marker) {
            // Find route position and set local candidate state
            const routePos = (this.map && this.map.routeManager && typeof this.map.routeManager.findRoutePositionOfMarker === 'function') ?
              this.map.routeManager.findRoutePositionOfMarker(waypointHit.marker.uid) : -1;
            if (routePos !== -1) {
              this.dragState.setRouteNodeCandidate({
                pointerId: ev.pointerId,
                routePos: routePos,
                startClientX: ev.clientX,
                startClientY: ev.clientY
              });
              return true; // Handled
            }
          }
        }

        // Route segment insertion
        if (this.editRouteMode) {
          const seg = this._findRouteSegmentAt ?
            this._findRouteSegmentAt(localX, localY, this.config.ROUTE.SEGMENT_DETECTION_THRESHOLD) : null;
          if (seg && typeof seg.index === 'number') {
            // Initialize route segment insertion directly (event-driven architecture)
            this._startRouteSegmentInsertion(ev, seg, localX, localY, downTime);
            return true; // Handled
          }
        }

        return false; // Not handled
      } catch (e) {
        this.errorHandler.logError('RouteEditHandler.handlePointerDown failed:', 'interactions', e);
        console.debug('RouteEditHandler.handlePointerDown failed', 'RouteEditHandler.handlePointerDown', { error: e });
        return false;
      }
    }

    handlePointerMove(ev, localX, localY) {
      try {
        // Handle route node drag promotion
        this._handleRouteNodePromotion(ev, localX, localY);

        // Handle active waypoint drag
        if (this.dragState.waypointDrag && ev.pointerId === this.dragState.waypointDrag.pointerId) {
          this._handleWaypointDrag(ev, localX, localY);
          return true; // Handled
        }

        // Handle active route insertion drag
        if (this._routeInsert && ev.pointerId === this._routeInsert.pointerId) {
          this._handleRouteInsertDrag(ev, localX, localY);
          return true; // Handled
        }

        // Handle route preview on hover
        this._handleRoutePreview(localX, localY);

        return false; // Not handled
      } catch (e) {
        this.errorHandler.logError('RouteEditHandler.handlePointerMove failed:', 'interactions', e);
        console.debug('RouteEditHandler.handlePointerMove failed', 'RouteEditHandler.handlePointerMove', { error: e });
        return false;
      }
    }

    handlePointerUp(ev, localX, localY) {
      try {
        // Clear route node candidate if active
        if (this.dragState.routeNodeCandidate && ev.pointerId === this.dragState.routeNodeCandidate.pointerId) {
          this.dragState.setRouteNodeCandidate(null);
        }

        // Waypoint drag finalization is handled by DragState.finalizeAllDrags()
        // in PointerHandler._finalizeDrags(). RouteEditHandler does not finalize
        // to maintain centralized DragState architecture and event-driven design.

        this._finalizeRouteInsert(ev);
        return false; // Continue with other handlers
      } catch (e) {
        console.debug('RouteEditHandler.handlePointerUp failed', 'RouteEditHandler.handlePointerUp', { error: e });
        return false;
      }
    }

    handleClick(ev, localX, localY, isQuickTap, hit) {
      try {
        const shouldReturn = !isQuickTap || !this.editRouteMode;
        if (shouldReturn) {
          return false;
        }

        // Use hit passed from PointerHandler (it already did the detection)
        if (!hit || !hit.marker || !hit.marker.uid) {
          return false;
        }

        // Route edit mode: tapping markers toggles their membership in the current route
        this._handleRouteEditClick(hit.marker, hit.layerKey);
        return true; // Handled

      } catch (e) {
        console.debug('RouteEditHandler.handleClick failed', 'RouteEditHandler.handleClick', { error: e });
        return false;
      }
    }

    handleMouseLeave(ev) {
      try {
        // Clear hover preview
        this.dragState.setRoutePreview(null);

        // If a route-insert was in progress, cancel and restore
        if (this._routeInsert) {
          this._cancelRouteInsert('Mouse left canvas');
        }

        // If a waypoint drag was in progress, cancel it (use DragState setter)
        if (this._waypointDrag) {
          this.dragState.setWaypointDrag(null);
        }

        // Clear any unpromoted route-node candidate
        if (this.dragState.routeNodeCandidate) {
          this.dragState.setRouteNodeCandidate(null);
        }

        return false; // Continue with other handlers
      } catch (e) {
        console.debug('RouteEditHandler.handleMouseLeave failed', 'RouteEditHandler.handleMouseLeave', { error: e });
        return false;
      }
    }

    // ===== ROUTE-SPECIFIC METHODS =====

    _handleRouteNodePromotion(ev, localX, localY) {
      if (this.dragState.routeNodeCandidate && ev.pointerId === this.dragState.routeNodeCandidate.pointerId) {
        const dxn = ev.clientX - this.dragState.routeNodeCandidate.startClientX;
        const dyn = ev.clientY - this.dragState.routeNodeCandidate.startClientY;
        const dist = Math.hypot(dxn, dyn);
        if (dist > (this.config.ROUTE?.MOVE_THRESHOLD || 5)) {
          this._promoteRouteNodeDrag(ev, localX, localY);
        }
      }
    }

    _handleWaypointDrag(ev, localX, localY) {
      try {
        if (!this.dragState.waypointDrag) return; // Safety check
        
        const worldX = (localX - this.panX) / this.zoom / (this.config.MAP_SIZE || 8192);
        const worldY = (localY - this.panY) / this.zoom / (this.config.MAP_SIZE || 8192);

        // Emit waypoint drag update
        if (this.eventBus && window.EventTypes.ROUTE_WAYPOINT_DRAG_REQUESTED) {
          this.eventBus.emit(window.EventTypes.ROUTE_WAYPOINT_DRAG_REQUESTED, {
            waypointIndex: this.dragState.waypointDrag.waypointIndex,
            worldX: Math.max(0, Math.min(1, Number(worldX))),
            worldY: Math.max(0, Math.min(1, Number(worldY)))
          });
        }

        // Invalidate route renderer cache via events
        try { this.eventBus.emit(window.EventTypes.RENDER_PIPELINE_DIRTY, { renderer: 'RouteRenderer' }); } catch (e) {}
        try { this.eventBus.emit(window.EventTypes.RENDER_REQUESTED); } catch (e) {}

      } catch (e) {
        this.errorHandler.logError('Error in _handleWaypointDrag:', 'interactions', e);
        this.errorHandler && this.errorHandler.logError(e, 'RouteEditHandler._handleWaypointDrag');
      }
    }

    _handleRouteInsertDrag(ev, localX, localY) {
      try {
        const tempIdx = this._routeInsert.tempIndex;
        if (this._routeSources && this._routeSources[tempIdx]) {
          const worldX = (localX - this.panX) / this.zoom / (this.config.MAP_SIZE || 8192);
          const worldY = (localY - this.panY) / this.zoom / (this.config.MAP_SIZE || 8192);
          this._routeSources[tempIdx].marker.x = Math.max(0, Math.min(1, Number(worldX)));
          this._routeSources[tempIdx].marker.y = Math.max(0, Math.min(1, Number(worldY)));
        }

        // Check for marker snapping
        const hitMarker = this._findMarkerAt ? this._findMarkerAt(localX, localY) : null;
        if (hitMarker && hitMarker.marker && hitMarker.marker.uid) {
          let exists = false;
          for (let i = 0; i < this._routeSources.length; i++) {
            if (i === this._routeInsert.tempIndex) continue;
            const s = this._routeSources[i];
            if (s && s.marker && s.marker.uid && s.marker.uid === hitMarker.marker.uid) {
              exists = true; break;
            }
          }
          this._routeInsert.hoverMarker = hitMarker.marker;
          this._routeInsert.hoverOccupied = !!exists;
        } else {
          this._routeInsert.hoverMarker = null;
          this._routeInsert.hoverOccupied = false;
        }

        // Update route and render via events
        try { this.eventBus.emit(window.EventTypes.RENDER_PIPELINE_DIRTY, { renderer: 'RouteRenderer' }); } catch (e) {}
        try { this.eventBus.emit(window.EventTypes.RENDER_REQUESTED); } catch (e) {}

        try {
          let newLengthNormalized = this._computeRouteLengthNormalized ?
            this._computeRouteLengthNormalized(this._routeSources) : 0;

          // Adjust for looping if enabled and we have 3+ waypoints
          if ((this.map && this.map.routeLooping) && this._routeSources && this._routeSources.length >= 3) {
            const firstSrc = this._routeSources[0];
            const lastSrc = this._routeSources[this._routeSources.length - 1];
            if (firstSrc && firstSrc.marker && lastSrc && lastSrc.marker) {
              const dx = (firstSrc.marker.x - lastSrc.marker.x) * (this.config.MAP_SIZE || 8192);
              const dy = (firstSrc.marker.y - lastSrc.marker.y) * (this.config.MAP_SIZE || 8192);
              const closingSegmentLength = Math.hypot(dx, dy) / (this.config.MAP_SIZE || 8192);
              newLengthNormalized += closingSegmentLength;
            }
          }

          // Update UI display
          try {
            this.eventBus.emit(window.EventTypes.LAYER_COUNTS_CHANGED);
          } catch (e) {
            console.debug('Failed to update layer counts after route insert drag', 'RouteEditHandler.handlePointerUp.updateLayerCounts', { error: e });
          }

          // Update route length display immediately using computed value
          try {
            const dev_routeLength = document.getElementById('dev_routeLength');
            if (dev_routeLength) {
              dev_routeLength.textContent = (typeof newLengthNormalized === 'number' && !isNaN(newLengthNormalized)) ?
                newLengthNormalized.toFixed(3) : '—';
            }
          } catch (e) { console.debug('Failed to update route length display on route modification', 'RouteEditHandler.handlePointerUp.updateRouteLengthDisplay', { error: e }); }
        } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'RouteEditHandler.handlePointerUp.updateRouteLength'); }
      } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'RouteEditHandler.handlePointerUp.finalizeRouteInsert'); }
    }

    _handleRoutePreview(localX, localY) {
      try {
        const canPreview = !this.dragState.isDragging && !this.dragState.hasDraggingMarker && !this.dragState.hasDraggingCandidate &&
              !this._routeInsert && !this.dragState.hasRouteNodeCandidate && this.editRouteMode;
        if (canPreview) {
          const seg = this._findRouteSegmentAt ?
            this._findRouteSegmentAt(localX, localY, this.config.ROUTE?.SEGMENT_DETECTION_THRESHOLD || 20) : null;
          if (seg && typeof seg.index === 'number') {
            const len = Array.isArray(this.currentRoute) ? this.currentRoute.length : 0;
            if (len > 1) {
              const idxA = this.currentRoute[seg.index];
              const idxB = this.currentRoute[(seg.index + 1) % len];
              const srcA = this._routeSources && this._routeSources[idxA];
              const srcB = this._routeSources && this._routeSources[idxB];
              if (srcA && srcB && srcA.marker && srcB.marker) {
                const ax = srcA.marker.x * (this.config.MAP_SIZE || 8192) * this.zoom + this.panX;
                const ay = srcA.marker.y * (this.config.MAP_SIZE || 8192) * this.zoom + this.panY;
                const bx = srcB.marker.x * (this.config.MAP_SIZE || 8192) * this.zoom + this.panX;
                const by = srcB.marker.y * (this.config.MAP_SIZE || 8192) * this.zoom + this.panY;
                const t = (typeof seg.t === 'number') ? seg.t : 0;
                const px = ax + (bx - ax) * t;
                const py = ay + (by - ay) * t;
                const worldX = (px - this.panX) / this.zoom / (this.config.MAP_SIZE || 8192);
                const worldY = (py - this.panY) / this.zoom / (this.config.MAP_SIZE || 8192);
                this.dragState.setRoutePreview({ index: seg.index, t, worldX, worldY, screenX: px, screenY: py });
                try { this.canvas.style.cursor = 'pointer'; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'RouteEditHandler.handlePointerMove.setCursor'); }
                this.eventBus.emit(window.EventTypes.RENDER_REQUESTED);
                return;
              }
            }
          } else {
            if (this._routePreview) {
              this.dragState.setRoutePreview(null);
              // Let PointerHandler handle marker hover
            }
          }
        }
      } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'RouteEditHandler.handlePointerMove.routePreview'); }
    }

    _promoteRouteNodeDrag(ev, localX, localY) {
      try {
        const routePos = Number(this.dragState.routeNodeCandidate.routePos) || 0;

        // Get the current marker position
        const sourceIndex = this.currentRoute[routePos];
        const source = this._routeSources[sourceIndex];
        if (!source || !source.marker) {
          return;
        }

        // CRITICAL: Emit drag start event to RouteManager FIRST
        // This ensures RouteManager.dragWaypointState is set BEFORE
        // DragState.setWaypointDrag() emits ROUTE_WAYPOINT_DRAG_CHANGED
        // which RouteManager also listens to. Without this order,
        // RouteManager sees the CHANGED event with no dragWaypointState.
        this.eventBus.emit(window.EventTypes.ROUTE_WAYPOINT_DRAG_STARTED, {
          waypointIndex: routePos
        });

        // THEN set up waypoint drag state using centralized DragState
        // This emits ROUTE_WAYPOINT_DRAG_CHANGED which RouteManager
        // also listens to, but now dragWaypointState will be set
        this.dragState.setWaypointDrag({
          pointerId: ev.pointerId,
          waypointIndex: routePos,
          startWorldX: source.marker.x,
          startWorldY: source.marker.y
        });

        // Clear local candidate state
        this.dragState.setRouteNodeCandidate(null);
        try { this.canvas.style.cursor = 'grabbing'; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'RouteEditHandler._promoteRouteNodeDrag.setCursor'); }
      } catch (err) {
        this.errorHandler.logError('Error in _promoteRouteNodeDrag:', 'interactions', err);
        this.dragState.setRouteNodeCandidate(null);
        this.dragState.setWaypointDrag(null);
      }
    }

    _startRouteSegmentInsertion(ev, seg, localX, localY, downTime) {
      try {
        if (!seg || typeof seg.index !== 'number') return;

        // Emit route segment insert request event (decoupled architecture)
        this.eventBus.emit(window.EventTypes.ROUTE_SEGMENT_INSERT_REQUESTED, {
          segmentIndex: seg.index,
          t: seg.t,
          tempMarker: { x: 0, y: 0, uid: '' } // Temporary marker will be positioned by RouteManager
        });

        // Initialize route insert state for drag handling
        this.dragState.setRouteInsert({
          pointerId: ev.pointerId,
          tempIndex: seg.index + 1, // Index where temp marker was inserted
          hoverMarker: null,
          hoverOccupied: false
        });

        // Clear pointer down time to prevent click handling
        if (this.map) this.map.pointerDownTime = 0;

        try { this.canvas.style.cursor = 'grabbing'; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'RouteEditHandler._startRouteSegmentInsertion.setCursor'); }

      } catch (err) {
        this.errorHandler && this.errorHandler.logError(err, 'RouteEditHandler._startRouteSegmentInsertion');
      }
    }

    _finalizeRouteInsert(ev) {
      try {
        if (this._routeInsert && ev.pointerId === this._routeInsert.pointerId) {
          if (this._routeInsert.hoverMarker && !this._routeInsert.hoverOccupied) {
            if (this._routeSources && this._routeSources[this._routeInsert.tempIndex]) {
              this._routeSources[this._routeInsert.tempIndex].marker = this._routeInsert.hoverMarker;
            }
            const len = this._computeRouteLengthNormalized ?
              this._computeRouteLengthNormalized(this._routeSources) : 0;
            const indices = this._routeSources.map((_, i) => i);
            
            // Emit route edit request instead of direct call (decoupled architecture)
            if (this.eventBus && window.EventTypes.ROUTE_EDIT_REQUESTED) {
              this.eventBus.emit(window.EventTypes.ROUTE_EDIT_REQUESTED, {
                indices: indices,
                lengthNormalized: len,
                sources: this._routeSources
              });
            }
          } else if (this._routeInsert.hoverMarker && this._routeInsert.hoverOccupied) {
            // Handle occupied marker replacement
            if (this._routeSources && this._routeInsert.originalMarker) {
              this._routeSources[this._routeInsert.tempIndex].marker = this._routeInsert.originalMarker;
              this._routeSources[this._routeInsert.tempIndex].marker.x = this._routeInsert.hoverMarker.x;
              this._routeSources[this._routeInsert.tempIndex].marker.y = this._routeInsert.hoverMarker.y;

              const newSources = [];
              for (let i = 0; i < this._routeSources.length; i++) {
                const src = this._routeSources[i];
                if (!src || !src.marker) continue;
                if (i !== this._routeInsert.tempIndex && src.marker.uid === this._routeInsert.hoverMarker.uid) {
                  continue;
                }
                newSources.push(src);
              }

              for (let i = 0; i < newSources.length; i++) {
                newSources[i].layerIndex = i;
              }

              const len = this._computeRouteLengthNormalized ?
                this._computeRouteLengthNormalized(newSources) : 0;
              const indices = newSources.map((_, i) => i);
              
              // Emit route edit request instead of direct call (decoupled architecture)
              if (this.eventBus && window.EventTypes.ROUTE_EDIT_REQUESTED) {
                this.eventBus.emit(window.EventTypes.ROUTE_EDIT_REQUESTED, {
                  indices: indices,
                  lengthNormalized: len,
                  sources: newSources
                });
              }
            }
          } else {
            // Restore previous route
            try {
              const prev = this._routeInsert.prevSources || [];
              const prevIdx = (Array.isArray(this._routeInsert.prevIndices) && this._routeInsert.prevIndices.length) ?
                             this._routeInsert.prevIndices : (prev.map((_,i)=>i));
              const len = this._computeRouteLengthNormalized ?
                this._computeRouteLengthNormalized(prev) : 0;
              
              // Emit route edit request instead of direct call (decoupled architecture)
              if (this.eventBus && window.EventTypes.ROUTE_EDIT_REQUESTED) {
                this.eventBus.emit(window.EventTypes.ROUTE_EDIT_REQUESTED, {
                  indices: prevIdx,
                  lengthNormalized: len,
                  sources: prev
                });
              }
              
              // Emit route looping change instead of direct assignment (decoupled architecture)
              if (this.eventBus && window.EventTypes.ROUTE_LOOPING_CHANGED) {
                this.eventBus.emit(window.EventTypes.ROUTE_LOOPING_CHANGED, {
                  looping: !!this._routeInsert.prevRouteLooping
                });
              }
            } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'RouteEditHandler._finalizeRouteInsert.restoreRoute'); }
          }
          this.dragState.setRouteInsert(null);
          this.eventBus.emit(window.EventTypes.RENDER_REQUESTED);
        }
      } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'RouteEditHandler._finalizeRouteInsert.main'); }
    }

    _handleRouteEditClick(marker, layerKey) {
      try {
        const uid = marker.uid;
        if (!uid) return;

        // Clear any drag candidates before processing the click
        this.dragState.setRouteNodeCandidate(null);
        this.dragState.setWaypointDrag(null);

        // Build ordered list of existing route marker UIDs
        const existing = [];
        if (Array.isArray(this.currentRoute) && Array.isArray(this._routeSources)) {
          for (let i = 0; i < this.currentRoute.length; i++) {
            const src = this._routeSources[this.currentRoute[i]];
            if (src && src.marker && src.marker.uid) existing.push(src.marker.uid);
          }
        }

        const inIdx = existing.indexOf(uid);
        const newSources = [];
        const newIndices = [];

        if (inIdx >= 0) {
          // Remove the tapped marker from the route
          for (let i = 0; i < this.currentRoute.length; i++) {
            const src = this._routeSources[this.currentRoute[i]];
            if (!src || !src.marker) continue;
            if (src.marker.uid === uid) continue;
            newSources.push({ marker: src.marker, layerKey: src.layerKey, layerIndex: newSources.length });
            newIndices.push(newSources.length - 1);
          }
        } else {
          // Preserve existing route points
          if (Array.isArray(this.currentRoute) && Array.isArray(this._routeSources)) {
            for (let i = 0; i < this.currentRoute.length; i++) {
              const src = this._routeSources[this.currentRoute[i]];
              if (!src || !src.marker) continue;
              newSources.push({ marker: src.marker, layerKey: src.layerKey, layerIndex: newSources.length });
              newIndices.push(newSources.length - 1);
            }
          }
          // Append the tapped marker as a new route point
          newSources.push({ marker: marker, layerKey: layerKey, layerIndex: newSources.length });
          newIndices.push(newSources.length - 1);
        }

        // Compute simple path length
        let lengthPx = 0;
        for (let i = 1; i < newSources.length; i++) {
          const a = newSources[i - 1].marker;
          const b = newSources[i].marker;
          if (!a || !b) continue;
          const dx = (a.x - b.x) * (this.config.MAP_SIZE || 8192);
          const dy = (a.y - b.y) * (this.config.MAP_SIZE || 8192);
          lengthPx += Math.hypot(dx, dy);
        }
        const lengthNormalized = lengthPx / (this.config.MAP_SIZE || 8192);

        // Emit route edit request event (decoupled from map)
        this.eventBus.emit(window.EventTypes.ROUTE_EDIT_REQUESTED, {
          indices: newIndices,
          lengthNormalized: lengthNormalized,
          sources: newSources
        });
      } catch (err) {
        this.errorHandler.logError('RouteEditHandler: _handleRouteEditClick failed', 'interactions', err);
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showRouteError) {
          NotificationUtils.showRouteError('Route edit tap failed: ' + err.message);
        }
      }
    }

    _cancelRouteInsert(reason = 'Route modification cancelled') {
      try {
        if (this._routeInsert) {
          // Release pooled objects if they exist
          if (this._routeInsert.tempSource && global.routeSourcePool) {
            global.routeSourcePool.release(this._routeInsert.tempSource);
          }
          
          if (this._routeInsert.prevSources && this._routeInsert.prevIndices) {
            const prev = this._routeInsert.prevSources || [];
            const prevIdx = (Array.isArray(this._routeInsert.prevIndices) && this._routeInsert.prevIndices.length) ?
                           this._routeInsert.prevIndices : (prev.map((_,i)=>i));
            const len = this.map.routeManager ?
              this.map.routeManager.computeRouteLengthNormalized(this.config.MAP_SIZE || 8192) : 0;
            
            // Emit route edit request instead of direct call (decoupled architecture)
            if (this.eventBus && window.EventTypes.ROUTE_EDIT_REQUESTED) {
              this.eventBus.emit(window.EventTypes.ROUTE_EDIT_REQUESTED, {
                indices: prevIdx,
                lengthNormalized: len,
                sources: prev
              });
            }

            // Emit route looping change instead of direct assignment (decoupled architecture)
            if (this.eventBus && window.EventTypes.ROUTE_LOOPING_CHANGED && this._routeInsert.prevRouteLooping !== undefined) {
              this.eventBus.emit(window.EventTypes.ROUTE_LOOPING_CHANGED, {
                looping: !!this._routeInsert.prevRouteLooping
              });
            }
          }
          this.dragState.setRouteInsert(null);
        }
      } catch (e) {
        console.debug('RouteEditHandler._cancelRouteInsert failed', 'RouteEditHandler._cancelRouteInsert', { error: e });
      }
    }

    // ===== UTILITY METHODS =====

    _findMarkerAt(localX, localY) {
      // Delegate to map's marker finding logic
      return this.map.checkMarkerHover ? this.map.checkMarkerHover(localX, localY) : null;
    }

    // ===== CLEANUP =====

    /**
     * Clean up event listeners to prevent memory leaks.
     * Call this method when the RouteEditHandler is being destroyed or recreated.
     */
    destroy() {
      try {
        // Unsubscribe all event listeners
        if (Array.isArray(this._eventUnsubscribers)) {
          for (const unsub of this._eventUnsubscribers) {
            if (typeof unsub === 'function') {
              unsub();
            }
          }
          this._eventUnsubscribers = [];
        }
        
        // Cancel any pending operations
        this.cancelOperations('Destroyed');
      } catch (e) {
        this.errorHandler && console.debug('RouteEditHandler.destroy failed', 'RouteEditHandler.destroy', { error: e });
      }
    }

    cancelOperations(reason = 'Operation cancelled') {
      try {
        this._cancelRouteInsert(reason);
        if (this.dragState.routeNodeCandidate) {
          this.dragState.setRouteNodeCandidate(null);
        }
        if (this._waypointDrag) {
          this.dragState.setWaypointDrag(null);
        }
        this.dragState.setRoutePreview(null);
      } catch (e) {
        console.debug('RouteEditHandler.cancelOperations failed', 'RouteEditHandler.cancelOperations', { error: e });
      }
    }
  }

  global.RouteEditHandler = RouteEditHandler;
})(window);

