// input/PointerHandler.js
// Minimal scaffold for unified pointer handling (mouse + touch + pen)

(function (global) {
  class PointerHandler {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.bound = false;
      
      // Performance optimization: Create fast property accessors
      this._createFastAccessors();
      
      // Pointer state
      this.pointers = new Map(); // pointerId -> {x, y, clientX, clientY, downTime}
      this.pinch = null; // {startDistance, startZoom, lastMidX, lastMidY}
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
          panX: { get: () => this.map.panX, set: (v) => this.map.panX = v },
          panY: { get: () => this.map.panY, set: (v) => this.map.panY = v },
          zoom: { get: () => this.map.zoom, set: (v) => this.map.zoom = v },
          canvas: { get: () => this.map.canvas },
          currentRoute: { get: () => this.map.currentRoute },
          _routeSources: { get: () => this.map._routeSources },
          editRouteMode: { get: () => this.map.editRouteMode },
          editMarkersMode: { get: () => this.map.editMarkersMode },
          _routeInsert: { get: () => this.map._routeInsert, set: (v) => this.map._routeInsert = v },
          _draggingMarker: { get: () => this.map._draggingMarker, set: (v) => this.map._draggingMarker = v },
          _routePreview: { get: () => this.map._routePreview, set: (v) => this.map._routePreview = v }
        });

        // Pre-bind frequently called methods (eliminates lookup overhead)
        this._render = this.map.render.bind(this.map);
        this._updateResolution = this.map.updateResolution.bind(this.map);
        this._checkMarkerHover = this.map.checkMarkerHover.bind(this.map);
        this._findRouteSegmentAt = this.map.findRouteSegmentAt.bind(this.map);
        this._setRoute = this.map.setRoute.bind(this.map);
        this._computeRouteLengthNormalized = (sources) => RouteUtils.computeRouteLengthNormalized(sources, this.config.MAP_SIZE || 8192);
        this._saveViewToStorage = this.map.saveViewToStorage.bind(this.map);
        
        // Marker utilities
        if (this.map.markerRenderer) {
          this._findMarkerAt = this.map.markerRenderer.findMarkerAt.bind(this.map.markerRenderer);
        }
        
      } catch (e) { console.debug('PointerHandler fast accessors failed', e); }
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
        canvas.addEventListener('wheel', this._onWheel, { passive: false });
        canvas.addEventListener('pointerdown', this._onPointerDown);
        canvas.addEventListener('pointermove', this._onPointerMove);
        canvas.addEventListener('pointerup', this._onPointerUp);
        canvas.addEventListener('pointercancel', this._onPointerUp);
        this.bound = true;
      } catch (e) { console.debug('PointerHandler.init failed', e); }
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
        this.bound = false;
      } catch (e) { console.debug('PointerHandler.destroy failed', e); }
    }

    _onWheel(ev) {
      try {
        ev.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = ev.clientX - rect.left;
        const mouseY = ev.clientY - rect.top;
        
        // Use a larger zoom step for wheel to match programmatic zoomIn/zoomOut (1.3x)
        const zoomFactor = ev.deltaY > 0 ? (1 / 1.3) : 1.3;
        const newZoom = Math.max(this.map.minZoom || (this.config.ZOOM && this.config.ZOOM.DEFAULT_MIN) || 0.005, 
                                Math.min((this.config.ZOOM && this.config.ZOOM.MAX) || 100, this.zoom * zoomFactor));
        
        // Zoom towards mouse position
        const worldX = (mouseX - this.panX) / this.zoom;
        const worldY = (mouseY - this.panY) / this.zoom;
        
        this.zoom = newZoom;
        
        this.panX = mouseX - worldX * this.zoom;
        this.panY = mouseY - worldY * this.zoom;
        
        this._updateResolution();
        this._render();
        // Update hover/cursor state after zoom so cursor matches visual marker size
        try { this._checkMarkerHover(mouseX, mouseY); } catch (err) {}
        // Debounce wheel until it stops, then save once
        try { if (this.map._wheelSaveTimer) clearTimeout(this.map._wheelSaveTimer); } catch (e) {}
        try {
            this.map._wheelSaveTimer = setTimeout(() => {
                try { this._saveViewToStorage(); } catch (e) {}
            }, 150);
        } catch (e) {}
      } catch (e) { console.debug('PointerHandler._onWheel failed', e); }
    }

    _onPointerDown(ev) {
      try {
        const rect = this.map.canvas.getBoundingClientRect();
        const localX = ev.clientX - rect.left;
        const localY = ev.clientY - rect.top;
        const downTime = Date.now();
        this.pointers.set(ev.pointerId, { x: localX, y: localY, clientX: ev.clientX, clientY: ev.clientY, downTime });
        
        // Clear any transient preview when pointer goes down
        this.map._routePreview = null;
        try { this.map.checkMarkerHover(localX, localY); } catch (e) {}

        if (this.pointers.size === 1) {
          // Single pointer - handle marker interaction and pan start
          this._handleSinglePointerDown(ev, localX, localY, downTime);
        } else if (this.pointers.size === 2) {
          // Two pointers - start pinch
          this._handlePinchStart();
        }
      } catch (e) { console.debug('PointerHandler._onPointerDown failed', e); }
    }

    _handleSinglePointerDown(ev, localX, localY, downTime) {
      try {
        // Determine whether pointerdown hit a marker
        const hit = this.map.markerRenderer ? this.map.markerRenderer.findMarkerAt(localX, localY) : null;
        
        // Handle route editing mode
        if (hit && this.map.editRouteMode && hit.marker && hit.marker.uid && 
            Array.isArray(this.map.currentRoute) && Array.isArray(this.map._routeSources)) {
          // Route node drag logic would go here
          // For now, delegate to map
          if (typeof this.map._handleRouteNodeDragStart === 'function') {
            this.map._handleRouteNodeDragStart(ev, hit, localX, localY, downTime);
          }
          // Record for click detection
          this.pointerDownTime = downTime;
          this.map.pointerDownTime = downTime; // Set on map for click handler
        }
        // Handle custom marker editing
        else if (hit && hit.layerKey === 'customMarkers') {
          if (this.map.editMarkersMode) {
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
            try { this.map.canvas.style.cursor = 'pointer'; } catch (err) {}
          }
        } else {
          // Handle route segment insertion in edit mode
          if (this.map.editRouteMode) {
            const seg = this.map.findRouteSegmentAt ? this.map.findRouteSegmentAt(localX, localY, MP4Config.ROUTE.SEGMENT_DETECTION_THRESHOLD) : null;
            if (seg && typeof seg.index === 'number') {
              // Route insertion logic would go here
              if (typeof this.map._handleRouteInsertStart === 'function') {
                this.map._handleRouteInsertStart(ev, seg, localX, localY, downTime);
              }
            }
          }
          
          // Start single-pointer pan
          this.isDragging = true;
          this.lastMouseX = ev.clientX;
          this.lastMouseY = ev.clientY;
          this.pointerDownTime = downTime;
          this.map.pointerDownTime = downTime; // Set on map for click handler
          this.map.canvas.style.cursor = 'grabbing';
        }
      } catch (e) { console.debug('PointerHandler._handleSinglePointerDown failed', e); }
    }

    _handlePinchStart() {
      try {
        const pts = Array.from(this.pointers.values());
        const dx = pts[0].clientX - pts[1].clientX;
        const dy = pts[0].clientY - pts[1].clientY;
        const dist = Math.hypot(dx, dy);
        const midClientX = (pts[0].clientX + pts[1].clientX) / 2;
        const midClientY = (pts[0].clientY + pts[1].clientY) / 2;
        this.pinch = { 
          startDistance: dist, 
          startZoom: this.zoom, 
          lastMidX: midClientX, 
          lastMidY: midClientY 
        };
        this.isDragging = false;
        this.pointerDownTime = 0; // Stop click timing
      } catch (e) { console.debug('PointerHandler._handlePinchStart failed', e); }
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

        // Handle route node drag promotion
        this._handleRouteNodePromotion(ev, localX, localY);

        // Handle marker drag promotion  
        this._handleMarkerDragPromotion(ev, localX, localY);

        // Handle active route insertion drag
        if (this._routeInsert && ev.pointerId === this._routeInsert.pointerId) {
          this._handleRouteInsertDrag(ev, localX, localY);
          return;
        }

        // Handle active marker drag
        if (this._draggingMarker && ev.pointerId === this._draggingMarker.pointerId) {
          this._handleMarkerDrag(ev, localX, localY);
          return;
        }

        // Handle route preview on hover
        this._handleRoutePreview(localX, localY);

        // Handle pinch-to-zoom
        if (this.pointers.size === 2 && this.pinch) {
          this._handlePinchMove(ev, rect);
          return;
        }

        // Handle basic panning
        if (this.isDragging) {
          this.panX += ev.clientX - this.lastMouseX;
          this.panY += ev.clientY - this.lastMouseY;
          this.lastMouseX = ev.clientX;
          this.lastMouseY = ev.clientY;
          this._render();
        } else {
          // Update hover state (but don't override route preview cursor)
          if (!this.map._routePreview) {
            this._checkMarkerHover(localX, localY);
          }
        }
      } catch (e) { console.debug('PointerHandler._onPointerMove failed', e); }
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

        if (this.pointers.size < 2) this.pinch = null;

        if (this.pointers.size === 0) {
          // Finalize drags and interactions
          this._finalizeDrags(ev, localX, localY);
          
          // Clear transient preview
          this._routePreview = null;
          
          // Save view state
          try { this._saveViewToStorage(); } catch (err) {}
        }

        // Handle route insert finalization
        this._finalizeRouteInsert(ev);
        
      } catch (e) { console.debug('PointerHandler._onPointerUp failed', e); }
    }

    // ===== PERFORMANCE-OPTIMIZED EXTRACTION METHODS =====

    _handleRouteNodePromotion(ev, localX, localY) {
      // Promote route node drag candidates
      if (this.map._routeNodeCandidate && ev.pointerId === this.map._routeNodeCandidate.pointerId) {
        const dxn = ev.clientX - this.map._routeNodeCandidate.startClientX;
        const dyn = ev.clientY - this.map._routeNodeCandidate.startClientY;
        if (Math.hypot(dxn, dyn) > MP4Config.ROUTE.MOVE_THRESHOLD) { // MOVE_THRESHOLD
          this._promoteRouteNodeDrag(ev, localX, localY);
        }
      }
    }

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
        } catch (e) {}
        
        try { 
          this.map.currentRouteLengthNormalized = this._computeRouteLengthNormalized(this._routeSources); 
          this.map.currentRouteLength = this.map.currentRouteLengthNormalized * (this.config.MAP_SIZE || 8192); 
        } catch (e) {}
        
        this._render();
      } catch (err) {}
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
            console.log(`Marker ${this._draggingMarker.uid} moved from (${oldX}, ${oldY}) to (${nx}, ${ny})`);
            // Note: Save only happens at drag end to avoid excessive storage writes
            try { this.map.customMarkers = global.LAYERS.customMarkers.markers; } catch (e) {}
            this._render();
            try { this.canvas.style.cursor = 'grabbing'; } catch (e) {}
          }
        }
      } catch (err) {
        console.warn('Error in _handleMarkerDrag:', err);
      }
    }

    _handleRoutePreview(localX, localY) {
      try {
        const canPreview = !this.isDragging && !this._draggingMarker && !this.map._draggingCandidate && 
                          !this._routeInsert && !this.map._routeNodeCandidate && this.editRouteMode;
        if (canPreview) {
          const seg = this._findRouteSegmentAt ? this._findRouteSegmentAt(localX, localY, MP4Config.ROUTE.SEGMENT_DETECTION_THRESHOLD) : null;
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
                try { this.canvas.style.cursor = 'pointer'; } catch (e) {}
                this._render();
                return;
              }
            }
          } else {
            if (this._routePreview) { 
              this._routePreview = null; 
              try { this._checkMarkerHover(localX, localY); } catch (e) {} 
            }
          }
        }
      } catch (e) {}
    }

    _handlePinchMove(ev, rect) {
      const pts = Array.from(this.pointers.values());
      const dx = pts[0].clientX - pts[1].clientX;
      const dy = pts[0].clientY - pts[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / this.pinch.startDistance;
      const newZoom = Math.max(this.map.minZoom || 0.005, Math.min(100, this.pinch.startZoom * factor));

      const midClientX = (pts[0].clientX + pts[1].clientX) / 2;
      const midClientY = (pts[0].clientY + pts[1].clientY) / 2;
      
      const panDX = midClientX - this.pinch.lastMidX;
      const panDY = midClientY - this.pinch.lastMidY;
      
      const worldX = (midClientX - rect.left - this.panX) / this.zoom;
      const worldY = (midClientY - rect.top - this.panY) / this.zoom;

      this.zoom = newZoom;
      this.panX = midClientX - rect.left - worldX * this.zoom + panDX;
      this.panY = midClientY - rect.top - worldY * this.zoom + panDY;
      
      this.pinch.lastMidX = midClientX;
      this.pinch.lastMidY = midClientY;

      this._updateResolution();
      this._render();
      
      try {
        const midLocalX = this.pinch.lastMidX - rect.left;
        const midLocalY = this.pinch.lastMidY - rect.top;
        this._checkMarkerHover(midLocalX, midLocalY);
      } catch (err) {}
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
        const tempMarker = { uid: '', x: Number(worldX), y: Number(worldY) };
        const tempSource = { marker: tempMarker, layerKey: 'temp', layerIndex: -1 };
        ordered[routePos] = tempSource;
        
        const newSources = ordered;
        const newIndices = newSources.map((_, i) => i);
        this._setRoute(newIndices, this._computeRouteLengthNormalized(newSources), newSources);
        
        this._routeInsert = {
          pointerId: ev.pointerId,
          tempIndex: routePos,
          prevSources,
          prevIndices,
          prevRouteLooping: !!this.map.routeLooping,
          originalMarker: prevSources[prevIndices[routePos]] ? prevSources[prevIndices[routePos]].marker : null, // Store the original marker being dragged
          hoverMarker: null,
          hoverOccupied: false
        };
        this.map._routeNodeCandidate = null;
        this.map.pointerDownTime = 0;
        try { this.canvas.style.cursor = 'grabbing'; } catch (e) {}
      } catch (err) { this.map._routeNodeCandidate = null; }
    }

    _promoteMarkerDrag(ev) {
      this._draggingMarker = {
        uid: this.map._draggingCandidate.uid,
        layerKey: this.map._draggingCandidate.layerKey,
        pointerId: this.map._draggingCandidate.pointerId,
        offsetX: this.map._draggingCandidate.offsetX,
        offsetY: this.map._draggingCandidate.offsetY
      };
      
      // Clear selection if dragging currently selected marker
      try {
        if (this.map.selectedMarker && this.map.selectedMarker.uid === this._draggingMarker.uid && 
            this.map.selectedMarkerLayer === this._draggingMarker.layerKey) {
          this.map.selectedMarker = null;
          this.map.selectedMarkerLayer = null;
          try { this.map.hideTooltip(); } catch (e) {}
        }
      } catch (e) {}
      
      this.map._draggingCandidate = null;
      this.map.pointerDownTime = 0;
      try { this.canvas.style.cursor = 'grabbing'; } catch (e) {}
    }

    _finalizeDrags(ev, localX, localY) {
      this.isDragging = false;
      
      if (this.map._draggingCandidate && ev.pointerId === this.map._draggingCandidate.pointerId) {
        this.map._draggingCandidate = null;
      }
      if (this.map._routeNodeCandidate && ev.pointerId === this.map._routeNodeCandidate.pointerId) {
        this.map._routeNodeCandidate = null;
      }
      if (this._draggingMarker && ev.pointerId === this._draggingMarker.pointerId) {
        console.log('Drag ended for marker:', this._draggingMarker.uid);
        try { 
          if (typeof global.MarkerUtils !== 'undefined' && global.MarkerUtils.saveToLocalStorage) {
            console.log('Calling MarkerUtils.saveToLocalStorage');
            const saveResult = global.MarkerUtils.saveToLocalStorage();
            console.log('saveToLocalStorage result:', saveResult);
            if (!saveResult) {
              console.warn('Failed to save custom marker position after drag');
            }
          } else {
            console.warn('MarkerUtils.saveToLocalStorage not available');
          }
        } catch (e) {
          console.warn('Error saving custom marker position:', e);
        }
        this._draggingMarker = null;
        this.map.pointerDownTime = 0;
      }
      
      const under = this._findMarkerAt ? this._findMarkerAt(localX, localY) : null;
      this.canvas.style.cursor = under ? 'pointer' : 'grab';
    }

    _finalizeRouteInsert(ev) {
      try {
        if (this._routeInsert && ev.pointerId === this._routeInsert.pointerId) {
          if (this._routeInsert.hoverMarker && !this._routeInsert.hoverOccupied) {
            if (this._routeSources && this._routeSources[this._routeInsert.tempIndex]) {
              this._routeSources[this._routeInsert.tempIndex].marker = this._routeInsert.hoverMarker;
            }
            const len = this._computeRouteLengthNormalized(this._routeSources);
            const indices = this._routeSources.map((_, i) => i);
            this._setRoute(indices, len, this._routeSources);
          } else if (this._routeInsert.hoverMarker && this._routeInsert.hoverOccupied) {
            // Handle occupied marker replacement: replace the dragged waypoint with the target marker
            // and remove the duplicate from the route
            if (this._routeSources && this._routeInsert.originalMarker) {
              // Replace the temporary marker with the original dragged marker
              this._routeSources[this._routeInsert.tempIndex].marker = this._routeInsert.originalMarker;
              // Snap the waypoint to the hover marker's position for proper placement
              this._routeSources[this._routeInsert.tempIndex].marker.x = this._routeInsert.hoverMarker.x;
              this._routeSources[this._routeInsert.tempIndex].marker.y = this._routeInsert.hoverMarker.y;
              
              // Remove the duplicate hover marker from the route
              const newSources = [];
              for (let i = 0; i < this._routeSources.length; i++) {
                const src = this._routeSources[i];
                if (!src || !src.marker) continue;
                // Skip the duplicate hover marker (but keep the one we just replaced)
                if (i !== this._routeInsert.tempIndex && src.marker.uid === this._routeInsert.hoverMarker.uid) {
                  continue;
                }
                newSources.push(src);
              }
              
              // Update layer indices
              for (let i = 0; i < newSources.length; i++) {
                newSources[i].layerIndex = i;
              }
              
              const len = this._computeRouteLengthNormalized(newSources);
              const indices = newSources.map((_, i) => i);
              this._setRoute(indices, len, newSources);
            }
          } else {
            // Restore previous route
            try {
              const prev = this._routeInsert.prevSources || [];
              const prevIdx = (Array.isArray(this._routeInsert.prevIndices) && this._routeInsert.prevIndices.length) ? 
                             this._routeInsert.prevIndices : (prev.map((_,i)=>i));
              const len = this._computeRouteLengthNormalized(prev);
              this._setRoute(prevIdx, len, prev);
              try { this.map.routeLooping = !!this._routeInsert.prevRouteLooping; } catch (e) {}
            } catch (err) {}
          }
          this._routeInsert = null;
          this._render();
        }
      } catch (err) {}
    }
  }

  global.PointerHandler = PointerHandler;
})(window);
