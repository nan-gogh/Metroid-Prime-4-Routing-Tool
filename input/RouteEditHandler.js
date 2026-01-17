// input/RouteEditHandler.js
// Handles route-specific pointer interactions (drag, insert, preview)
// Extracted from PointerHandler to reduce complexity

(function (global) {
  class RouteEditHandler {
    constructor(map, config, eventBus, editModeState) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.errorHandler = map.errorHandler || (global.errorHandler);
      this.eventBus = eventBus || window.eventBus;
      this.eventTypes = window.EventTypes || {};

      // Get state managers from map
      this.mapState = map.mapState;
      this.routeState = map.routeState;
      this.selectionState = map.selectionState;
      this.editModeState = editModeState || (map && map.editModeState);

      // Performance optimization: Create fast property accessors
      this._createFastAccessors();

      // Route-specific state
      this._routeInsert = null;
      this._routePreview = null;

      // Bind methods for performance (removed _render binding - now using EventBus)
      this._findRouteSegmentAt = this.map.findRouteSegmentAt.bind(this.map);
      this._setRoute = this.map._setRoute ? this.map._setRoute.bind(this.map) : null;
      this._computeRouteLengthNormalized = this.map._computeRouteLengthNormalized ?
        this.map._computeRouteLengthNormalized.bind(this.map) : null;
    }

    // Performance optimization: Create fast property accessors
    _createFastAccessors() {
      try {
        Object.defineProperties(this, {
          panX: { get: () => this.mapState.panX },
          panY: { get: () => this.mapState.panY },
          zoom: { get: () => this.mapState.zoom },
          canvas: { get: () => this.map.canvas },
          currentRoute: { get: () => this.routeState.currentRoute },
          _routeSources: { get: () => this.routeState._routeSources },
          editRouteMode: { get: () => this.editModeState ? this.editModeState.editRouteMode : false },
          _routeInsert: {
            get: () => this.__routeInsert,
            set: (v) => {
              this.__routeInsert = v;
              this.routeState._routeInsert = v;
            }
          },
          _routePreview: {
            get: () => this.__routePreview,
            set: (v) => {
              this.__routePreview = v;
              this.routeState._routePreview = v;
            }
          }
        });
      } catch (e) {
        this.errorHandler.logDebug('RouteEditHandler fast accessors failed', 'RouteEditHandler.constructor.fastAccessors', { error: e });
      }
    }

    // ===== ROUTE-SPECIFIC POINTER HANDLING =====

    handlePointerDown(ev, localX, localY, downTime) {
      try {
        // Route node drag start
        const hit = this.map.checkMarkerHover ? this.map.checkMarkerHover(localX, localY) : null;
        if (hit && this.editRouteMode && hit.marker && hit.marker.uid) {
          if (typeof this.map._handleRouteNodeDragStart === 'function') {
            this.map._handleRouteNodeDragStart(ev, hit, localX, localY, downTime);
          }
          return true; // Handled
        }

        // Route segment insertion
        if (this.editRouteMode) {
          const seg = this._findRouteSegmentAt ?
            this._findRouteSegmentAt(localX, localY, this.config.ROUTE.SEGMENT_DETECTION_THRESHOLD) : null;
          if (seg && typeof seg.index === 'number') {
            if (typeof this.map._handleRouteInsertStart === 'function') {
              this.map._handleRouteInsertStart(ev, seg, localX, localY, downTime);
            }
            return true; // Handled
          }
        }

        return false; // Not handled
      } catch (e) {
        this.errorHandler.logDebug('RouteEditHandler.handlePointerDown failed', 'RouteEditHandler.handlePointerDown', { error: e });
        return false;
      }
    }

    handlePointerMove(ev, localX, localY) {
      try {
        // Handle route node drag promotion
        this._handleRouteNodePromotion(ev, localX, localY);

        // Handle active route insertion drag
        if (this._routeInsert && ev.pointerId === this._routeInsert.pointerId) {
          this._handleRouteInsertDrag(ev, localX, localY);
          return true; // Handled
        }

        // Handle route preview on hover
        this._handleRoutePreview(localX, localY);

        return false; // Not handled
      } catch (e) {
        this.errorHandler.logDebug('RouteEditHandler.handlePointerMove failed', 'RouteEditHandler.handlePointerMove', { error: e });
        return false;
      }
    }

    handlePointerUp(ev, localX, localY) {
      try {
        this._finalizeRouteInsert(ev);
        return false; // Continue with other handlers
      } catch (e) {
        this.errorHandler.logDebug('RouteEditHandler.handlePointerUp failed', 'RouteEditHandler.handlePointerUp', { error: e });
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
        this.errorHandler.logDebug('RouteEditHandler.handleClick failed', 'RouteEditHandler.handleClick', { error: e });
        return false;
      }
    }

    handleMouseLeave(ev) {
      try {
        // Clear hover preview
        this._routePreview = null;

        // If a route-insert was in progress, cancel and restore
        if (this._routeInsert) {
          this._cancelRouteInsert('Mouse left canvas');
        }

        // Clear any unpromoted route-node candidate
        if (this.map._routeNodeCandidate) {
          this.map._routeNodeCandidate = null;
        }

        return false; // Continue with other handlers
      } catch (e) {
        this.errorHandler.logDebug('RouteEditHandler.handleMouseLeave failed', 'RouteEditHandler.handleMouseLeave', { error: e });
        return false;
      }
    }

    // ===== ROUTE-SPECIFIC METHODS =====

    _handleRouteNodePromotion(ev, localX, localY) {
      if (this.map._routeNodeCandidate && ev.pointerId === this.map._routeNodeCandidate.pointerId) {
        const dxn = ev.clientX - this.map._routeNodeCandidate.startClientX;
        const dyn = ev.clientY - this.map._routeNodeCandidate.startClientY;
        if (Math.hypot(dxn, dyn) > (this.config.ROUTE?.MOVE_THRESHOLD || 5)) {
          this._promoteRouteNodeDrag(ev, localX, localY);
        }
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

        // Update route and render
        try {
          if (this.map.routeRenderer && typeof this.map.routeRenderer.invalidateCache === 'function') {
            this.map.routeRenderer.invalidateCache();
          }
        } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'RouteEditHandler.handlePointerUp.invalidateCache'); }

        try {
          let newLengthNormalized = this._computeRouteLengthNormalized ?
            this._computeRouteLengthNormalized(this._routeSources) : 0;

          // Adjust for looping if enabled and we have 3+ waypoints
          if (this.map.routeLooping && this._routeSources && this._routeSources.length >= 3) {
            const firstSrc = this._routeSources[0];
            const lastSrc = this._routeSources[this._routeSources.length - 1];
            if (firstSrc && firstSrc.marker && lastSrc && lastSrc.marker) {
              const dx = (firstSrc.marker.x - lastSrc.marker.x) * (this.config.MAP_SIZE || 8192);
              const dy = (firstSrc.marker.y - lastSrc.marker.y) * (this.config.MAP_SIZE || 8192);
              const closingSegmentLength = Math.hypot(dx, dy) / (this.config.MAP_SIZE || 8192);
              newLengthNormalized += closingSegmentLength;
            }
          }

          this.map.routeManager.currentRouteLengthNormalized = newLengthNormalized;

          // Update UI display
          try {
            // Emit layer counts changed event instead of direct call
            this.eventBus.emit(this.eventTypes.LAYER_COUNTS_CHANGED);
          } catch (e) {
            this.errorHandler.logDebug('Failed to update layer counts after route insert drag', 'RouteEditHandler.handlePointerUp.updateLayerCounts', { error: e });
          }

          // Update route length display immediately
          try {
            const dev_routeLength = document.getElementById('dev_routeLength');
            if (dev_routeLength) {
              dev_routeLength.textContent = (typeof this.map.currentRouteLengthNormalized === 'number' && !isNaN(this.map.currentRouteLengthNormalized)) ?
                this.map.currentRouteLengthNormalized.toFixed(3) : '—';
            }
          } catch (e) { this.errorHandler.logDebug('Failed to update route length display on route modification', 'RouteEditHandler.handlePointerUp.updateRouteLengthDisplay', { error: e }); }
        } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'RouteEditHandler.handlePointerUp.updateRouteLength'); }

        this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
      } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'RouteEditHandler.handlePointerUp.finalizeRouteInsert'); }
    }

    _handleRoutePreview(localX, localY) {
      try {
        const canPreview = !this.map.isDragging && !this.map._draggingMarker && !this.map._draggingCandidate &&
                          !this._routeInsert && !this.map._routeNodeCandidate && this.editRouteMode;
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
                this._routePreview = { index: seg.index, t, worldX, worldY, screenX: px, screenY: py };
                try { this.canvas.style.cursor = 'pointer'; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'RouteEditHandler.handlePointerMove.setCursor'); }
                this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
                return;
              }
            }
          } else {
            if (this._routePreview) {
              this._routePreview = null;
              // Let PointerHandler handle marker hover
            }
          }
        }
      } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'RouteEditHandler.handlePointerMove.routePreview'); }
    }

    _promoteRouteNodeDrag(ev, localX, localY) {
      try {
        const routePos = Number(this.map._routeNodeCandidate.routePos) || 0;
        const prevSources = Array.isArray(this._routeSources) ? this._routeSources.slice() : [];
        const prevIndices = Array.isArray(this.currentRoute) ? this.currentRoute.slice() : [];

        const ordered = [];
        for (let ri = 0; ri < prevIndices.length; ri++) {
          const srcIdx = prevIndices[ri];
          const src = prevSources[srcIdx];
          if (!src) continue;
          ordered.push({ marker: src.marker, layerKey: src.layerKey, layerIndex: ordered.length });
        }

        const worldX = (localX - this.panX) / this.zoom / (this.config.MAP_SIZE || 8192);
        const worldY = (localY - this.panY) / this.zoom / (this.config.MAP_SIZE || 8192);
        
        // Use pooled objects for performance
        const tempMarker = global.markerPool ? global.markerPool.acquire() : { uid: '', x: 0, y: 0 };
        tempMarker.x = Number(worldX);
        tempMarker.y = Number(worldY);
        
        const tempSource = global.routeSourcePool ? global.routeSourcePool.acquire() : { marker: null, layerKey: '', layerIndex: -1 };
        tempSource.marker = tempMarker;
        tempSource.layerKey = 'temp';
        tempSource.layerIndex = -1;
        
        ordered[routePos] = tempSource;

        const newSources = ordered;
        const newIndices = newSources.map((_, i) => i);
        if (this._setRoute) {
          this._setRoute(newIndices, this._computeRouteLengthNormalized ?
            this._computeRouteLengthNormalized(newSources) : 0, newSources);
        }

        this._routeInsert = {
          pointerId: ev.pointerId,
          tempIndex: routePos,
          tempSource, // Store reference for cleanup
          prevSources,
          prevIndices,
          prevRouteLooping: !!this.map.routeLooping,
          originalMarker: prevSources[prevIndices[routePos]] ?
            prevSources[prevIndices[routePos]].marker : null,
          hoverMarker: null,
          hoverOccupied: false,
          initialDragLocalX: localX,
          initialDragLocalY: localY,
          initialPanX: this.panX,
          initialPanY: this.panY
        };
        this.map._routeNodeCandidate = null;
        this.map.pointerDownTime = 0;
        try { this.canvas.style.cursor = 'grabbing'; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'RouteEditHandler._promoteRouteNodeDrag.setCursor'); }
      } catch (err) {
        this.map._routeNodeCandidate = null;
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
            if (this._setRoute) {
              this._setRoute(indices, len, this._routeSources);
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
              if (this._setRoute) {
                this._setRoute(indices, len, newSources);
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
              if (this._setRoute) {
                this._setRoute(prevIdx, len, prev);
              }
              try { this.map.routeLooping = !!this._routeInsert.prevRouteLooping; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'RouteEditHandler._finalizeRouteInsert.restoreRouteLooping'); }
            } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'RouteEditHandler._finalizeRouteInsert.restoreRoute'); }
          }
          this._routeInsert = null;
          this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
        }
      } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'RouteEditHandler._finalizeRouteInsert.main'); }
    }

    _handleRouteEditClick(marker, layerKey) {
      try {
        const uid = marker.uid;
        if (!uid) return;

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

        // Apply the new route
        if (this._setRoute) {
          this._setRoute(newIndices, lengthNormalized, newSources);
        }
        this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
      } catch (err) {
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
            if (this._setRoute) {
              this._setRoute(prevIdx, len, prev);
            }

            if (this._routeInsert.prevRouteLooping !== undefined) {
              this.map.routeLooping = !!this._routeInsert.prevRouteLooping;
            }
          }
          this._routeInsert = null;
        }
      } catch (e) {
        this.errorHandler.logDebug('RouteEditHandler._cancelRouteInsert failed', 'RouteEditHandler._cancelRouteInsert', { error: e });
      }
    }

    // ===== UTILITY METHODS =====

    _findMarkerAt(localX, localY) {
      // Delegate to map's marker finding logic
      return this.map.checkMarkerHover ? this.map.checkMarkerHover(localX, localY) : null;
    }

    // ===== CLEANUP =====

    cancelOperations(reason = 'Operation cancelled') {
      try {
        this._cancelRouteInsert(reason);
        if (this.map._routeNodeCandidate) {
          this.map._routeNodeCandidate = null;
        }
        this._routePreview = null;
      } catch (e) {
        this.errorHandler.logDebug('RouteEditHandler.cancelOperations failed', 'RouteEditHandler.cancelOperations', { error: e });
      }
    }
  }

  global.RouteEditHandler = RouteEditHandler;
})(window);