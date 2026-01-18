// input/PointerHandler.js
// Minimal scaffold for unified pointer handling (mouse + touch + pen)

(function (global) {
  class PointerHandler {
    constructor(map, config, eventBus) {
      this.map = map;
        this.markerManager = map.markerManager;
      this.config = config || (global.MP4Config || {});
      this.errorHandler = map.errorHandler || (global.errorHandler);
      this.eventBus = eventBus || window.eventBus;
      this.eventTypes = window.EventTypes || {};
      this.gestureHandler = map.gestureHandler; // Reference to map's gesture handler
      this.bound = false;

      // Get state managers from map
      this.mapState = map.mapState;
      this.selectionState = map.selectionState;
      this.editModeState = map.editModeState;
      this.dragState = map.dragState; // Centralized drag state
      this.imageState = map.imageState;

      // Create route edit handler for route-specific interactions
      if (typeof RouteEditHandler !== 'undefined') {
        this.routeEditHandler = new RouteEditHandler(map, this.config, eventBus, this.editModeState, this.dragState);
      }

      // Create marker edit handler for marker-specific interactions
      if (typeof MarkerEditHandler !== 'undefined') {
        this.markerEditHandler = new MarkerEditHandler(
          this.mapState,
          this.selectionState,
          this.editModeState,
          map.markerManager,
          map.layerVisibility,
          map.layerConfig,
          map.showTooltip.bind(map),
          map.hideTooltip.bind(map),
          map.checkMarkerHover ? map.checkMarkerHover.bind(map) : null,
          this.config,
          this.eventBus,
          this.errorHandler
        );
      }

      // Performance optimization: Create fast property accessors
      this._createFastAccessors();
      
      // Pointer state
      this.pointers = new Map(); // pointerId -> {x, y, clientX, clientY, downTime}
      this.lastMouseX = 0;
      this.lastMouseY = 0;
      this.pointerDownTime = 0;
      this.minClickDuration = 150; // ms
      this._cachedRect = null;
      this._panFrameScheduled = false;
    }

    // Performance optimization: Create fast property accessors and method bindings
    _createFastAccessors() {
      try {
        // Fast property accessors for hot path (avoids this.map.property lookup)
        Object.defineProperties(this, {
          panX: { get: () => this.mapState.panX, set: (v) => this.mapState.panX = v },
          panY: { get: () => this.mapState.panY, set: (v) => this.mapState.panY = v },
          zoom: { get: () => this.mapState.zoom, set: (v) => this.mapState.zoom = v },
          canvas: { get: () => this.map.canvas },
          isDragging: { get: () => this.dragState.isDragging },
          hasActiveDrag: { get: () => this.dragState.hasActiveDrag },
          editMarkersMode: { get: () => this.editModeState ? this.editModeState.editMarkersMode : false },
          editRouteMode: { get: () => this.editModeState ? this.editModeState.editRouteMode : false },
          _draggingMarker: { get: () => this.dragState.draggingMarker, set: (v) => this.dragState.draggingMarker = v }
        });

        // Pre-bind frequently called methods (eliminates lookup overhead)
        // Note: _render binding removed - now using EventBus for render requests
        this._updateResolution = this.imageState.updateResolution.bind(this.imageState);
        this._checkMarkerHover = this.map.checkMarkerHover.bind(this.map);
        this._findMarkerAt = this.map.checkMarkerHover.bind(this.map);
        this._saveViewToStorage = this.map.saveViewToStorage ? this.map.saveViewToStorage.bind(this.map) : () => {};
        
        // Marker utilities
        if (this.map.markerRenderer) {
          this._findMarkerAt = this.map.markerRenderer.findMarkerAt.bind(this.map.markerRenderer);
        }
        
      } catch (e) { this.errorHandler.logDebug('PointerHandler fast accessors failed', 'PointerHandler.constructor.fastAccessors', { error: e }); }
    }

    init() {
      if (this.bound) return;
      try {
        const canvas = this.map.canvas;
        if (!canvas) return;
        this._onWheel = this._onWheel.bind(this);
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onMouseLeave = this._onMouseLeave.bind(this);
        this._onClick = this._onClick.bind(this);
        this._onPageUnload = this._onPageUnload.bind(this);
        canvas.addEventListener('wheel', this._onWheel, { passive: false });
        canvas.addEventListener('pointerdown', this._onPointerDown);
        canvas.addEventListener('pointermove', this._onPointerMove);
        canvas.addEventListener('pointerup', this._onPointerUp);
        canvas.addEventListener('pointercancel', this._onPointerUp);
        canvas.addEventListener('mouseleave', this._onMouseLeave);
        canvas.addEventListener('click', this._onClick);
        
        // Add page unload handler to clean up drag state on page refresh/reload
        window.addEventListener('beforeunload', this._onPageUnload);
        
        this.bound = true;
      } catch (e) { this.errorHandler.logDebug('PointerHandler.init failed', 'PointerHandler.init', { error: e }); }
    }

    destroy() {
      try {
        const canvas = this.map.canvas;
        if (!canvas || !this.bound) return;
        canvas.removeEventListener('wheel', this._onWheel);
        canvas.removeEventListener('pointerdown', this._onPointerDown);
        canvas.removeEventListener('pointermove', this._onPointerMove);
        canvas.removeEventListener('pointerup', this._onPointerUp);
        canvas.removeEventListener('pointercancel', this._onPointerUp);
        canvas.removeEventListener('mouseleave', this._onMouseLeave);
        canvas.removeEventListener('click', this._onClick);
        
        // Remove page unload handler
        window.removeEventListener('beforeunload', this._onPageUnload);
        
        this.bound = false;
      } catch (e) { this.errorHandler.logDebug('PointerHandler.destroy failed', 'PointerHandler.destroy', { error: e }); }
    }

    _onWheel(ev) {
      try {
        ev.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = ev.clientX - rect.left;
        const mouseY = ev.clientY - rect.top;
        
        // Use a larger zoom step for wheel to match programmatic zoomIn/zoomOut (1.3x)
        const zoomFactor = ev.deltaY > 0 ? (1 / 1.3) : 1.3;
        const newZoom = Math.max(this.mapState.minZoom,
                                Math.min(this.mapState.maxZoom, this.zoom * zoomFactor));
        
        // Zoom towards mouse position
        const worldX = (mouseX - this.panX) / this.zoom;
        const worldY = (mouseY - this.panY) / this.zoom;
        
        // Use MapState APIs so MAP_VIEW_CHANGED is emitted and other subsystems react
        try {
          this.mapState.setZoom(newZoom, mouseX, mouseY);
        } catch (e) {
          // Fallback to direct set if mapState methods unavailable
          this.zoom = newZoom;
          this.panX = mouseX - worldX * this.zoom;
          this.panY = mouseY - worldY * this.zoom;
          // Emit a view change manually
          try { this.mapState && this.mapState._emitChange && this.mapState._emitChange(window.EventTypes.MAP_VIEW_CHANGED, { panX: this.mapState.panX, panY: this.mapState.panY, zoom: this.mapState.zoom, triggeredBy: 'wheel' }); } catch (e) {}
        }
        
        this._updateResolution();
        this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
        // Update hover/cursor state after zoom so cursor matches visual marker size
        try { this._checkMarkerHover(mouseX, mouseY); } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'PointerHandler._onWheel.checkMarkerHover'); }
        // Debounce wheel until it stops, then save once
        try { if (this._wheelSaveTimer) clearTimeout(this._wheelSaveTimer); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onWheel.clearTimer'); }
        try {
          this._wheelSaveTimer = setTimeout(() => {
            try { this._saveViewToStorage(); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onWheel.saveViewToStorage'); }
          }, 150);
        } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onWheel.setTimeout'); }
      } catch (e) { this.errorHandler.logDebug('PointerHandler._onWheel failed', 'PointerHandler._onWheel', { error: e }); }
    }

    _onPointerDown(ev) {
      try {
        // Cache canvas rect for the active pointer interaction to avoid layout thrash
        this._cachedRect = this.map.canvas.getBoundingClientRect();
        const rect = this._cachedRect;
        const localX = ev.clientX - rect.left;
        const localY = ev.clientY - rect.top;
        const downTime = Date.now();
        this.pointers.set(ev.pointerId, { x: localX, y: localY, clientX: ev.clientX, clientY: ev.clientY, downTime });
        
        try { this._checkMarkerHover(localX, localY); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onPointerDown.checkMarkerHover'); }

        if (this.pointers.size === 1) {
          // Single pointer - handle marker interaction and pan start
          this._handleSinglePointerDown(ev, localX, localY, downTime);
        } else if (this.pointers.size === 2) {
          // Two pointers - start pinch
          if (this.gestureHandler) {
            this.gestureHandler.startPinch(Array.from(this.pointers.values()));
          }
        }
      } catch (e) { this.errorHandler.logDebug('PointerHandler._onPointerDown failed', 'PointerHandler._onPointerDown', { error: e }); }
    }

    _handleSinglePointerDown(ev, localX, localY, downTime) {
      try {
        // Determine whether pointerdown hit a marker
        const hit = this.map.markerRenderer ? this.map.markerRenderer.findMarkerAt(localX, localY) : null;

        // Try route-specific handling first
        if (this.routeEditHandler && this.routeEditHandler.handlePointerDown(ev, localX, localY, downTime)) {
          // Route handler handled it
          this.pointerDownTime = downTime;
          return;
        }

        // Handle custom marker editing
        if (hit && hit.layerKey === 'customMarkers') {
            if (this.editMarkersMode) {
            // Prepare for marker drag
            this.dragState.setDraggingCandidate({
              uid: hit.marker.uid,
              layerKey: hit.layerKey,
              pointerId: ev.pointerId,
              offsetX: localX - (hit.marker.x * (this.config.MAP_SIZE || 8192) * this.map.zoom + this.map.panX),
              offsetY: localY - (hit.marker.y * (this.config.MAP_SIZE || 8192) * this.map.zoom + this.map.panY),
              startClientX: ev.clientX,
              startClientY: ev.clientY
            });
            this.dragState.setDragging(false);
            this.pointerDownTime = downTime;
            try { this.canvas.style.cursor = 'grabbing'; } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'PointerHandler._handleSinglePointerDown.setCursor'); }
          } else {
                try { this.mapState && this.mapState._emitChange && this.mapState._emitChange(window.EventTypes.MAP_VIEW_CHANGED, { panX: this.mapState.panX, panY: this.mapState.panY, zoom: this.mapState.zoom, triggeredBy: 'wheel' }); } catch (e) {}
            this.pointerDownTime = downTime;
            try { this.canvas.style.cursor = 'pointer'; } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'PointerHandler._handleSinglePointerDown.setCursor'); }
          }
        } else {
          // Start single-pointer pan
          this.dragState.setDragging(true);
          this.lastMouseX = ev.clientX;
          this.lastMouseY = ev.clientY;
          this.pointerDownTime = downTime;
          try { this.canvas.style.cursor = 'grabbing'; } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'PointerHandler._handleSinglePointerDown.setCursor'); }
        }
      } catch (e) { this.errorHandler.logDebug('PointerHandler._handleSinglePointerDown failed', 'PointerHandler._handleSinglePointerDown', { error: e }); }
    }

    _onPointerMove(ev) {
      try {
        // Use cached rect during pointer interactions to avoid reflow/layout costs
        const rect = this._cachedRect || this.canvas.getBoundingClientRect();
        const localX = ev.clientX - rect.left;
        const localY = ev.clientY - rect.top;

        // Update pointer position in our tracking
        if (this.pointers.has(ev.pointerId)) {
          const p = this.pointers.get(ev.pointerId);
          p.x = localX; p.y = localY; p.clientX = ev.clientX; p.clientY = ev.clientY;
        }

        // Try route-specific handling first
        if (this.routeEditHandler && this.routeEditHandler.handlePointerMove(ev, localX, localY)) {
          return; // Route handler handled it
        }

        // Handle marker drag promotion
        this._handleMarkerDragPromotion(ev, localX, localY);

        // Handle active marker drag
        if (this._draggingMarker && ev.pointerId === this._draggingMarker.pointerId) {
          this._handleMarkerDrag(ev, localX, localY);
          return;
        }

        // Handle pinch-to-zoom
        if (this.pointers.size === 2 && this.gestureHandler && this.gestureHandler.isPinching()) {
          const updatedView = this.gestureHandler.handlePinchMove(
            Array.from(this.pointers.values()), 
            rect, 
            { panX: this.panX, panY: this.panY, zoom: this.zoom }
          );
          // Apply view via MapState API (update internal state) and batch emission to rAF
          try {
            if (this.mapState && typeof this.mapState.setView === 'function') {
              this.mapState.setView(updatedView.panX, updatedView.panY, updatedView.zoom);
              this._scheduleEmitViewChange('pinch');
            } else {
              this.panX = updatedView.panX;
              this.panY = updatedView.panY;
              this.zoom = updatedView.zoom;
            }
          } catch (e) {
            this.panX = updatedView.panX;
            this.panY = updatedView.panY;
            this.zoom = updatedView.zoom;
          }
          this._updateResolution();
          this.map.updateResolution();
          this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
          
          // Update marker hover during pinch
          try {
            const midLocalX = (this.gestureHandler.pinch.lastMidX - rect.left);
            const midLocalY = (this.gestureHandler.pinch.lastMidY - rect.top);
            this._checkMarkerHover(midLocalX, midLocalY);
          } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'PointerHandler._onPointerMove.routeHandler'); }
          return;
        }

        // Handle basic panning (only when basic panning is active and no specialized drags)
        if (this.isDragging) {
          const dx = ev.clientX - this.lastMouseX;
          const dy = ev.clientY - this.lastMouseY;
          try {
            if (this.mapState && typeof this.mapState.setView === 'function') {
              // Update view without emitting every move; batch emit once per rAF
              this.mapState.setView(this.mapState.panX + dx, this.mapState.panY + dy, this.mapState.zoom);
              this._scheduleEmitViewChange('pan');
            } else {
              this.panX += dx;
              this.panY += dy;
              try { this.mapState && this.mapState._emitChange && this.mapState._emitChange(window.EventTypes.MAP_VIEW_CHANGED, { panX: this.mapState.panX, panY: this.mapState.panY, zoom: this.mapState.zoom, triggeredBy: 'pan' }); } catch (e) {}
            }
          } catch (e) {
            this.panX += dx;
            this.panY += dy;
          }
          this.lastMouseX = ev.clientX;
          this.lastMouseY = ev.clientY;
          this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
          // Skip hover check during pan - it's expensive and unnecessary
        } else if (!this.hasActiveDrag) {
          // Update hover state (only when not dragging anything)
          this._checkMarkerHover(localX, localY);
        }
      } catch (e) { this.errorHandler.logDebug('PointerHandler._onPointerMove failed', 'PointerHandler._onPointerMove', { error: e }); }
    }

    _onPointerUp(ev) {
      try {
        // Clear cached rect when interaction ends
        const rect = this._cachedRect || this.canvas.getBoundingClientRect();
        const localX = ev.clientX - rect.left;
        const localY = ev.clientY - rect.top;
        this._cachedRect = null;

        const p = this.pointers.get(ev.pointerId);
        const downTime = p ? p.downTime : 0;
        const moved = p ? (Math.hypot(p.clientX - ev.clientX, p.clientY - ev.clientY) > 8) : true;

        this.pointers.delete(ev.pointerId);

        if (this.pointers.size < 2) {
          if (this.gestureHandler) {
            this.gestureHandler.endPinch();
          }
        }

        if (this.pointers.size === 0) {
          // Finalize drags and interactions
          this._finalizeDrags(ev, localX, localY);

          // Save view state
          try { this._saveViewToStorage(); } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'PointerHandler._onPointerUp.saveViewToStorage'); }
        }

        // Handle route insert finalization
        if (this.routeEditHandler) {
          this.routeEditHandler.handlePointerUp(ev, localX, localY);
        }
        
      } catch (e) { this.errorHandler.logDebug('PointerHandler._onPointerUp failed', 'PointerHandler._onPointerUp', { error: e }); }
    }

    _scheduleEmitViewChange(triggeredBy) {
      if (this._panFrameScheduled) return;
      this._panFrameScheduled = true;
      requestAnimationFrame(() => {
        this._panFrameScheduled = false;
        try {
          if (this.mapState && this.mapState._emitChange) {
            this.mapState._emitChange(window.EventTypes.MAP_VIEW_CHANGED, { panX: this.mapState.panX, panY: this.mapState.panY, zoom: this.mapState.zoom, triggeredBy });
          }
        } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._scheduleEmitViewChange'); }
      });
    }

    // ===== PERFORMANCE-OPTIMIZED EXTRACTION METHODS =====

    _handleMarkerDragPromotion(ev, localX, localY) {
      // Promote marker drag candidates
      if (this.dragState.draggingCandidate && ev.pointerId === this.dragState.draggingCandidate.pointerId) {
        const dx = ev.clientX - this.dragState.draggingCandidate.startClientX;
        const dy = ev.clientY - this.dragState.draggingCandidate.startClientY;
        if (Math.hypot(dx, dy) > MP4Config.ROUTE.MOVE_THRESHOLD) { // MOVE_THRESHOLD
          this._promoteMarkerDrag(ev);
        }
      }
    }

    _handleMarkerDrag(ev, localX, localY) {
      try {
        const centerX = localX - (this._draggingMarker.offsetX || 0);
        const centerY = localY - (this._draggingMarker.offsetY || 0);
        const worldX = (centerX - this.panX) / this.zoom / (this.config.MAP_SIZE || 8192);
        const worldY = (centerY - this.panY) / this.zoom / (this.config.MAP_SIZE || 8192);
        
        const nx = Math.max(0, Math.min(1, worldX));
        const ny = Math.max(0, Math.min(1, worldY));

        // Use DragState to update marker position during drag
        this.dragState.updateDraggingMarkerPosition(nx, ny);
        
        // Mark marker renderer dirty for immediate visual feedback
        try { this.eventBus.emit(this.eventTypes.RENDER_REQUESTED); } catch (e) {}
        
        try { this.canvas.style.cursor = 'grabbing'; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._handleMarkerDrag.setCursor'); }
      } catch (err) {
        NotificationUtils.showSaveError('Error in marker drag: ' + err.message);
      }
    }

    _promoteMarkerDrag(ev) {
      // Use DragState to promote the candidate to active drag
      if (this.dragState.promoteDraggingCandidate(ev)) {
        // Clear selection if dragging currently selected marker
        try {
          if (this.selectionState && this.selectionState.selectedMarker && this.selectionState.selectedMarker.uid === this._draggingMarker.uid &&
              this.selectionState.selectedMarkerLayer === this._draggingMarker.layerKey) {
            try { this.selectionState.clearSelectedMarker(); } catch (e) { /* ignore */ }
            try { this.map.hideTooltip(); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._promoteMarkerDrag.hideTooltip'); }
          }
        } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._promoteMarkerDrag.clearSelection'); }

        this.pointerDownTime = 0;
        try { this.canvas.style.cursor = 'grabbing'; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._promoteMarkerDrag.setCursor'); }
      }
    }

    _finalizeDrags(ev, localX, localY) {
      // Use DragState to finalize all drags
      const hadDraggingMarker = this.dragState.hasDraggingMarker;
      this.dragState.finalizeAllDrags(ev);
      
      // Save marker position if one was being dragged
      if (hadDraggingMarker) {
        try {
          if (this.markerManager && typeof this.markerManager.saveToStorage === 'function') {
            this.markerManager.saveToStorage();
          }
        } catch (e) {
          this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._finalizeDrags.markerSave');
        }
      }
      
      const under = this._findMarkerAt ? this._findMarkerAt(localX, localY) : null;
      try { this.canvas.style.cursor = under ? 'pointer' : 'grab'; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._finalizeDrags.setCursor'); }
    }

    _onMouseLeave(ev) {
      try {
        this.dragState.setDragging(false);
        try { this.canvas.style.cursor = 'grab'; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onMouseLeave.setCursor'); }
        try {
          const related = ev && ev.relatedTarget ? ev.relatedTarget : null;
          let enteredUi = false;
          try {
            if (related && related.closest) {
              enteredUi = !!related.closest('.sidebar, .controls, .zoom-controls, #layerList, .header, .sidebar-handle');
            }
          } catch (e) { enteredUi = false; }
          // If pointer left into the UI, keep tooltip visible; otherwise hide it.
          if (!enteredUi) try { this.map.hideTooltip(); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onMouseLeave.hideTooltip'); }
        } catch (e) { try { this.map.hideTooltip(); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onMouseLeave.fallbackHideTooltip'); } }

        // Handle route-specific mouse leave
        if (this.routeEditHandler) {
          this.routeEditHandler.handleMouseLeave(ev);
        }
      } catch (e) { this.errorHandler.logDebug('PointerHandler._onMouseLeave failed', 'PointerHandler._onMouseLeave', { error: e }); }
    }

    _onClick(e) {
      try {
        // Check if this was a quick tap (not a held drag)
        // If pointer was held > minClickDuration, treat as pan, not a click to place/delete marker
        const holdDuration = Date.now() - this.pointerDownTime;
        
        // Only interact on quick taps (less than threshold)
        const isQuickTap = this.pointerDownTime > 0 && holdDuration < this.minClickDuration;
        
        // Clear timer after use (important for preventing double-placement)
        this.pointerDownTime = 0;
        
        // Determine whether a marker exists at the click location (don't rely on hoveredMarker for custom markers)
        const rect = this.canvas.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const hit = this._findMarkerAt ? this._findMarkerAt(localX, localY) : null;

        if (isQuickTap && hit) {
          const layerKey = hit.layerKey;
          // Helper determination: deletable layers (custom markers) vs selectable layers
          const isDeletable = !!(LAYERS[layerKey] && LAYERS[layerKey].deletable);
          const isSelectable = !!(LAYERS[layerKey] && (LAYERS[layerKey].selectable !== false));

          // Try route-specific click handling first
          if (this.routeEditHandler && this.routeEditHandler.handleClick(e, localX, localY, isQuickTap, hit)) {
            return; // Route handler handled it
          }

          // Try marker-specific click handling
          if (this.markerEditHandler && this.markerEditHandler.handleClick(e, localX, localY, isQuickTap, hit)) {
            return; // Marker handler handled it
          }

        } else if (e.button === 0 && isQuickTap && !hit) {
          // Try marker-specific empty space click handling (for deselection/placement)
          if (this.markerEditHandler && this.markerEditHandler.handleClick(e, localX, localY, isQuickTap, hit)) {
            return; // Marker handler handled it
          }
        }
      } catch (e) { this.errorHandler.logDebug('PointerHandler._onClick failed', 'PointerHandler._onClick', { error: e }); }
    }

    // ===== PAGE UNLOAD CLEANUP =====

    _onPageUnload(ev) {
      try {
        this.errorHandler && this.errorHandler.logDebug('PointerHandler: Cleaning up drag state on page unload', 'PointerHandler._onPageUnload.start', {});
        
        // Use DragState to cancel all drags (handles marker and route drag cleanup)
        this.dragState.cancelAllDrags('Page unload');
        
        // Clear remaining transient states
        this.pointers.clear();
        
        this.errorHandler && this.errorHandler.logDebug('PointerHandler: Drag state cleanup complete', 'PointerHandler._onPageUnload.complete', {});
        
      } catch (e) {
        this.errorHandler && this.errorHandler.logWarning(e, 'PointerHandler._onPageUnload.failed', {});
      }
    }

    /**
     * Cancel any active route drag operations and clean up pooled objects
     * @param {string} reason - Reason for cancellation
     */

  }

  global.PointerHandler = PointerHandler;
})(window);
