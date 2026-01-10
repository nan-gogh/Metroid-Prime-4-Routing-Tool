// input/PointerHandler.js
// Minimal scaffold for unified pointer handling (mouse + touch + pen)

(function (global) {
  class PointerHandler {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.bound = false;
      
      // Pointer state
      this.pointers = new Map(); // pointerId -> {x, y, clientX, clientY, downTime}
      this.pinch = null; // {startDistance, startZoom, lastMidX, lastMidY}
      this.isDragging = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;
      this.pointerDownTime = 0;
      this.minClickDuration = 150; // ms
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
        const rect = this.map.canvas.getBoundingClientRect();
        const mouseX = ev.clientX - rect.left;
        const mouseY = ev.clientY - rect.top;
        
        // Use a larger zoom step for wheel to match programmatic zoomIn/zoomOut (1.3x)
        const zoomFactor = ev.deltaY > 0 ? (1 / 1.3) : 1.3;
        const newZoom = Math.max(this.map.minZoom || (this.config.ZOOM && this.config.ZOOM.DEFAULT_MIN) || 0.005, 
                                Math.min((this.config.ZOOM && this.config.ZOOM.MAX) || 100, this.map.zoom * zoomFactor));
        
        // Zoom towards mouse position
        const worldX = (mouseX - this.map.panX) / this.map.zoom;
        const worldY = (mouseY - this.map.panY) / this.map.zoom;
        
        this.map.zoom = newZoom;
        
        this.map.panX = mouseX - worldX * this.map.zoom;
        this.map.panY = mouseY - worldY * this.map.zoom;
        
        this.map.updateResolution();
        this.map.render();
        // Update hover/cursor state after zoom so cursor matches visual marker size
        try { this.map.checkMarkerHover(mouseX, mouseY); } catch (err) {}
        // Debounce wheel until it stops, then save once
        try { if (this.map._wheelSaveTimer) clearTimeout(this.map._wheelSaveTimer); } catch (e) {}
        try {
            this.map._wheelSaveTimer = setTimeout(() => {
                try { this.map.saveViewToStorage(); } catch (e) {}
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
            this.map.canvas.style.cursor = 'grabbing';
          } else {
            // Normal mode - record for click detection
            this.isDragging = false;
            this.pointerDownTime = downTime;
            try { this.map.canvas.style.cursor = 'pointer'; } catch (err) {}
          }
        } else {
          // Handle route segment insertion in edit mode
          if (this.map.editRouteMode) {
            const seg = this.map.findRouteSegmentAt ? this.map.findRouteSegmentAt(localX, localY, 10) : null;
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
          startZoom: this.map.zoom, 
          lastMidX: midClientX, 
          lastMidY: midClientY 
        };
        this.isDragging = false;
        this.pointerDownTime = 0; // Stop click timing
      } catch (e) { console.debug('PointerHandler._handlePinchStart failed', e); }
    }

    _onPointerMove(ev) {
      try {
        if (typeof this.map.onPointerMove === 'function') this.map.onPointerMove(ev);
      } catch (e) { console.debug('PointerHandler._onPointerMove', e); }
    }

    _onPointerUp(ev) {
      try {
        if (typeof this.map.onPointerUp === 'function') this.map.onPointerUp(ev);
      } catch (e) { console.debug('PointerHandler._onPointerUp', e); }
    }
  }

  global.PointerHandler = PointerHandler;
})(window);
