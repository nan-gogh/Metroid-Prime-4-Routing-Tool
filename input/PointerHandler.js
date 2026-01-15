// input/PointerHandler.js
// Minimal scaffold for unified pointer handling (mouse + touch + pen)

(function (global) {
  class PointerHandler {
    constructor(map, config, eventBus) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.errorHandler = map.errorHandler || (global.errorHandler);
      this.eventBus = eventBus || window.eventBus;
      this.eventTypes = window.EventTypes || {};
      this.gestureHandler = map.gestureHandler; // Reference to map's gesture handler
      this.bound = false;

      // Get state managers from map
      this.mapState = map.mapState;
      this.selectionState = map.selectionState;
      this.routeState = map.routeState;
      this.layerState = map.layerState;
      this.imageState = map.imageState;

      // Create route edit handler for route-specific interactions
      if (typeof RouteEditHandler !== 'undefined') {
        this.routeEditHandler = new RouteEditHandler(map, this.config, eventBus);
      }

      // Performance optimization: Create fast property accessors
      this._createFastAccessors();
      
      // Pointer state
      this.pointers = new Map(); // pointerId -> {x, y, clientX, clientY, downTime}
      this.isDragging = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;
      this.pointerDownTime = 0;
      this.minClickDuration = 150; // ms
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
          editMarkersMode: { get: () => this.selectionState.editMarkersMode },
          _draggingMarker: { get: () => this.map._draggingMarker, set: (v) => this.map._draggingMarker = v }
        });

        // Pre-bind frequently called methods (eliminates lookup overhead)
        // Note: _render binding removed - now using EventBus for render requests
        this._updateResolution = this.imageState.updateResolution.bind(this.imageState);
        this._checkMarkerHover = this.map.checkMarkerHover.bind(this.map);
        this._findMarkerAt = this.map.checkMarkerHover.bind(this.map);
        this._saveViewToStorage = this.map.saveViewToStorage.bind(this.map);
        
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
        
        this.zoom = newZoom;
        
        this.panX = mouseX - worldX * this.zoom;
        this.panY = mouseY - worldY * this.zoom;
        
        this._updateResolution();
        this.map.updateResolution();
        this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
        // Update hover/cursor state after zoom so cursor matches visual marker size
        try { this._checkMarkerHover(mouseX, mouseY); } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'PointerHandler._onWheel.checkMarkerHover'); }
        // Debounce wheel until it stops, then save once
        try { if (this.map._wheelSaveTimer) clearTimeout(this.map._wheelSaveTimer); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onWheel.clearTimer'); }
        try {
            this.map._wheelSaveTimer = setTimeout(() => {
                try { this._saveViewToStorage(); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onWheel.saveViewToStorage'); }
            }, 150);
        } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onWheel.setTimeout'); }
      } catch (e) { this.errorHandler.logDebug('PointerHandler._onWheel failed', 'PointerHandler._onWheel', { error: e }); }
    }

    _onPointerDown(ev) {
      try {
        const rect = this.map.canvas.getBoundingClientRect();
        const localX = ev.clientX - rect.left;
        const localY = ev.clientY - rect.top;
        const downTime = Date.now();
        this.pointers.set(ev.pointerId, { x: localX, y: localY, clientX: ev.clientX, clientY: ev.clientY, downTime });
        
        try { this.map.checkMarkerHover(localX, localY); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onPointerDown.checkMarkerHover'); }

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
          this.map.pointerDownTime = downTime;
          return;
        }

        // Handle custom marker editing
        if (hit && hit.layerKey === 'customMarkers') {
          if (this.editMarkersMode) {
            // Prepare for marker drag
            this.map._draggingCandidate = {
              uid: hit.marker.uid,
              layerKey: hit.layerKey,
              pointerId: ev.pointerId,
              offsetX: localX - (hit.marker.x * (this.config.MAP_SIZE || 8192) * this.map.zoom + this.map.panX),
              offsetY: localY - (hit.marker.y * (this.config.MAP_SIZE || 8192) * this.map.zoom + this.map.panY),
              startClientX: ev.clientX,
              startClientY: ev.clientY
            };
            this.isDragging = false;
            this.pointerDownTime = downTime;
            this.map.pointerDownTime = downTime; // Set on map for click handler
            this.map.canvas.style.cursor = 'grabbing';
          } else {
            // Normal mode - record for click detection
            this.isDragging = false;
            this.pointerDownTime = downTime;
            this.map.pointerDownTime = downTime; // Set on map for click handler
            try { this.map.canvas.style.cursor = 'pointer'; } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'PointerHandler._handleSinglePointerDown.setCursor'); }
          }
        } else {
          // Start single-pointer pan
          this.isDragging = true;
          this.lastMouseX = ev.clientX;
          this.lastMouseY = ev.clientY;
          this.pointerDownTime = downTime;
          this.map.pointerDownTime = downTime; // Set on map for click handler
          this.map.canvas.style.cursor = 'grabbing';
        }
      } catch (e) { this.errorHandler.logDebug('PointerHandler._handleSinglePointerDown failed', 'PointerHandler._handleSinglePointerDown', { error: e }); }
    }

    _onPointerMove(ev) {
      try {
        const rect = this.canvas.getBoundingClientRect();
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
          this.panX = updatedView.panX;
          this.panY = updatedView.panY;
          this.zoom = updatedView.zoom;
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

        // Handle basic panning
        if (this.isDragging) {
          this.panX += ev.clientX - this.lastMouseX;
          this.panY += ev.clientY - this.lastMouseY;
          this.lastMouseX = ev.clientX;
          this.lastMouseY = ev.clientY;
          this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
        } else {
          // Update hover state
          this._checkMarkerHover(localX, localY);
        }
      } catch (e) { this.errorHandler.logDebug('PointerHandler._onPointerMove failed', 'PointerHandler._onPointerMove', { error: e }); }
    }

    _onPointerUp(ev) {
      try {
        const rect = this.canvas.getBoundingClientRect();
        const localX = ev.clientX - rect.left;
        const localY = ev.clientY - rect.top;

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

    // ===== PERFORMANCE-OPTIMIZED EXTRACTION METHODS =====

    _handleMarkerDragPromotion(ev, localX, localY) {
      // Promote marker drag candidates
      if (this.map._draggingCandidate && ev.pointerId === this.map._draggingCandidate.pointerId) {
        const dx = ev.clientX - this.map._draggingCandidate.startClientX;
        const dy = ev.clientY - this.map._draggingCandidate.startClientY;
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

        // Update marker in LAYERS
        if (global.LAYERS && global.LAYERS.customMarkers && Array.isArray(global.LAYERS.customMarkers.markers)) {
          const idx = global.LAYERS.customMarkers.markers.findIndex(m => m.uid === this._draggingMarker.uid);
          if (idx >= 0) {
            const oldX = global.LAYERS.customMarkers.markers[idx].x;
            const oldY = global.LAYERS.customMarkers.markers[idx].y;
            global.LAYERS.customMarkers.markers[idx].x = nx;
            global.LAYERS.customMarkers.markers[idx].y = ny;
            this.errorHandler && this.errorHandler.logDebug(`Marker ${this._draggingMarker.uid} moved from (${oldX}, ${oldY}) to (${nx}, ${ny})`, 'PointerHandler._onPointerMove.markerMoved', { markerUid: this._draggingMarker.uid, oldX, oldY, newX: nx, newY: ny });
            
            // Note: Save only happens at drag end to avoid excessive storage writes
            try { this.map.customMarkers = global.LAYERS.customMarkers.markers; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onPointerMove.updateCustomMarkers'); }
            this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
            try { this.canvas.style.cursor = 'grabbing'; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onPointerMove.setCursor'); }
          }
        }
      } catch (err) {
        NotificationUtils.showSaveError('Error in marker drag: ' + err.message);
      }
    }

    _promoteMarkerDrag(ev) {
      // Find the actual marker object to store original position for cleanup
      let markerObj = null;
      try {
        if (this.map._draggingCandidate && this.map._draggingCandidate.layerKey && LAYERS[this.map._draggingCandidate.layerKey]) {
          const layer = LAYERS[this.map._draggingCandidate.layerKey];
          if (Array.isArray(layer.markers)) {
            markerObj = layer.markers.find(m => m.uid === this.map._draggingCandidate.uid);
          }
        }
      } catch (e) { this.errorHandler.logDebug('Failed to find marker object for drag:', 'PointerHandler._promoteMarkerDrag', { error: e }); }
      
      this._draggingMarker = {
        uid: this.map._draggingCandidate.uid,
        layerKey: this.map._draggingCandidate.layerKey,
        pointerId: this.map._draggingCandidate.pointerId,
        offsetX: this.map._draggingCandidate.offsetX,
        offsetY: this.map._draggingCandidate.offsetY,
        // Store original position for cleanup on page unload
        _originalX: markerObj ? markerObj.x : undefined,
        _originalY: markerObj ? markerObj.y : undefined
      };
      
      // Clear selection if dragging currently selected marker
      try {
        if (this.map.selectedMarker && this.map.selectedMarker.uid === this._draggingMarker.uid && 
            this.map.selectedMarkerLayer === this._draggingMarker.layerKey) {
          this.map.selectedMarker = null;
          this.map.selectedMarkerLayer = null;
          try { this.map.hideTooltip(); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._promoteMarkerDrag.hideTooltip'); }
        }
      } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._promoteMarkerDrag.clearSelection'); }
      
      this.map._draggingCandidate = null;
      this.map.pointerDownTime = 0;
      try { this.canvas.style.cursor = 'grabbing'; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._promoteMarkerDrag.setCursor'); }
    }

    _finalizeDrags(ev, localX, localY) {
      this.isDragging = false;
      
      if (this.map._draggingCandidate && ev.pointerId === this.map._draggingCandidate.pointerId) {
        this.map._draggingCandidate = null;
      }
      if (this._draggingMarker && ev.pointerId === this._draggingMarker.pointerId) {
        this.errorHandler && this.errorHandler.logDebug(`Drag ended for marker: ${this._draggingMarker.uid}`, 'PointerHandler._onPointerUp.dragEnded', { markerUid: this._draggingMarker.uid });
        try { 
          if (this.map.markerManager) {
            this.errorHandler && this.errorHandler.logDebug('Calling markerManager.saveToStorage', 'PointerHandler._onPointerUp.saveToStorage.start', { markerManager: !!this.map.markerManager });
            this.map.markerManager.saveToStorage();
            this.errorHandler && this.errorHandler.logDebug('markerManager.saveToStorage completed', 'PointerHandler._onPointerUp.saveToStorage.completed', {});
          } else {
            NotificationUtils.showSaveError('MarkerManager not available');
          }
        } catch (e) {
          NotificationUtils.showSaveError('Error saving custom marker position: ' + e.message);
        }
        this._draggingMarker = null;
        this.map.pointerDownTime = 0;
      }
      
      const under = this._findMarkerAt ? this._findMarkerAt(localX, localY) : null;
      this.canvas.style.cursor = under ? 'pointer' : 'grab';
    }

    _onMouseLeave(ev) {
      try {
        this.map.isDragging = false;
        this.map.canvas.style.cursor = 'grab';
        try {
          const related = ev && ev.relatedTarget ? ev.relatedTarget : null;
          let enteredUi = false;
          try {
            if (related && related.closest) {
              enteredUi = !!related.closest('.sidebar, .controls, .zoom-controls, #layerList, .header, .sidebar-handle');
            }
          } catch (e) { enteredUi = false; }
          // If pointer left into the UI, keep tooltip visible; otherwise hide it.
          if (!enteredUi) this.map.hideTooltip();
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
        const holdDuration = Date.now() - this.map.pointerDownTime;
        
        // Only interact on quick taps (less than threshold)
        const isQuickTap = this.map.pointerDownTime > 0 && holdDuration < this.minClickDuration;
        
        // Clear timer after use (important for preventing double-placement)
        this.map.pointerDownTime = 0;
        
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
          if (this.routeEditHandler && this.routeEditHandler.handleClick(e, localX, localY, isQuickTap)) {
            return; // Route handler handled it
          }

          if (this.editMarkersMode) {
            // In edit mode: allow deletion (custom markers are editable regardless of flags)
            const isCustom = (layerKey === 'customMarkers');
            if (isDeletable || isCustom) {
              if (this.map.markerManager) {
                this.map.markerManager.removeMarker(hit.marker.uid);
                this._checkMarkerHover(localX, localY);
              }
            }
          } else {
            // Normal mode: selection and tooltip behavior
            if (isSelectable) {
              const uid = hit.marker.uid;
              if (this.map.selectedMarker && this.map.selectedMarker.uid === uid && this.map.selectedMarkerLayer === layerKey) {
                // deselect
                this.map.selectedMarker = null;
                this.map.selectedMarkerLayer = null;
                this.map.hideTooltip();
                this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
              } else {
                // select
                this.map.selectedMarker = hit.marker;
                this.map.selectedMarkerLayer = layerKey;
                // compute screen coords for tooltip placement
                const screenX = hit.marker.x * (this.config.MAP_SIZE || 8192) * this.zoom + this.panX;
                const screenY = hit.marker.y * (this.config.MAP_SIZE || 8192) * this.zoom + this.panY;
                this.map.showTooltip(hit.marker, screenX, screenY, layerKey);
                this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
              }
            }
          }
        } else if (e.button === 0 && isQuickTap && !hit) {
          // If a marker is currently selected, a quick tap anywhere on the
          // map should deselect it (not start a placement). This avoids
          // accidental placement while the user intends to dismiss selection.
          if (this.map.selectedMarker) {
            this.map.selectedMarker = null;
            this.map.selectedMarkerLayer = null;
            try { this.map.hideTooltip(); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'PointerHandler._onClick.hideTooltip'); }
            this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
            return;
          }
          // Quick tap on empty space - place custom marker
          // Reuse previously computed localX/localY to avoid redundant layout read
          const clientX = localX;
          const clientY = localY;

          // Convert to world coordinates (0-1 normalized)
          const worldX = (clientX - this.panX) / this.zoom / (this.config.MAP_SIZE || 8192);
          const worldY = (clientY - this.panY) / this.zoom / (this.config.MAP_SIZE || 8192);
          
          // Only place if within map bounds
          if (worldX >= 0 && worldX <= 1 && worldY >= 0 && worldY <= 1) {
            // Do not allow placement when the custom markers layer is hidden
            if (!this.map.layerVisibility || !this.map.layerVisibility.customMarkers) {
              return;
            }
            // Only place markers when edit mode is active
            if (this.editMarkersMode) {
              // Check marker limit before adding
              const maxMarkers = this.map.layerConfig && this.map.layerConfig.customMarkers && this.map.layerConfig.customMarkers.maxMarkers || 50;
              const currentMarkerCount = this.map.markerManager ? this.map.markerManager.getCount() : 0;
              if (currentMarkerCount >= maxMarkers) {
                return; // Silently ignore - could show a message but click handler shouldn't alert
              }
              if (this.map.markerManager) {
                this.map.markerManager.addMarker(worldX, worldY);
                // markerManager updates markers and triggers map updates; ensure hover state refresh
                this._checkMarkerHover(localX, localY);
              }
            }
          }
        }
      } catch (e) { this.errorHandler.logDebug('PointerHandler._onClick failed', 'PointerHandler._onClick', { error: e }); }
    }

    // ===== PAGE UNLOAD CLEANUP =====

    _onPageUnload(ev) {
      try {
        this.errorHandler && this.errorHandler.logDebug('PointerHandler: Cleaning up drag state on page unload', 'PointerHandler._onPageUnload.start', {});
        
        // Cancel any active marker drag - restore original position if possible
        if (this._draggingMarker) {
          this.errorHandler && this.errorHandler.logDebug(`Cancelling active marker drag for: ${this._draggingMarker.uid}`, 'PointerHandler._onPageUnload.cancelDrag', { markerUid: this._draggingMarker.uid });
          
          // If we have a backup position, restore it
          if (this._draggingMarker._originalX !== undefined && this._draggingMarker._originalY !== undefined) {
            this._draggingMarker.x = this._draggingMarker._originalX;
            this._draggingMarker.y = this._draggingMarker._originalY;
            this.errorHandler && this.errorHandler.logDebug('Restored marker to original position', 'PointerHandler._onPageUnload.restorePosition', { markerUid: this._draggingMarker.uid, originalX: this._draggingMarker._originalX, originalY: this._draggingMarker._originalY });
          }
          
          // Clear drag state
          this._draggingMarker = null;
        }
        
        // Cancel any active route drag operations
        this._cancelRouteDragOperations('Page unload');
        
        // Clear any marker drag candidates
        if (this.map._draggingCandidate) {
          this.map._draggingCandidate = null;
        }
        
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
    _cancelRouteDragOperations(reason = 'Operation cancelled') {
      try {
        // Delegate to RouteEditHandler if available
        if (this.map.routeEditHandler && typeof this.map.routeEditHandler.cancelOperations === 'function') {
          this.map.routeEditHandler.cancelOperations(reason);
        } else {
          // Fallback: manually clean up route insert state
          if (this.map._routeInsert) {
            // Release pooled objects
            if (this.map._routeInsert.tempMarker && typeof markerPool !== 'undefined') {
              markerPool.release(this.map._routeInsert.tempMarker);
            }
            if (this.map._routeInsert.tempSource && typeof routeSourcePool !== 'undefined') {
              routeSourcePool.release(this.map._routeInsert.tempSource);
            }
            this.map._routeInsert = null;
          }
          if (this.map._routeNodeCandidate) {
            this.map._routeNodeCandidate = null;
          }
        }
      } catch (e) {
        this.errorHandler && this.errorHandler.logWarning(e, 'PointerHandler._cancelRouteDragOperations.failed', { reason });
      }
    }
  }

  global.PointerHandler = PointerHandler;
})(window);
