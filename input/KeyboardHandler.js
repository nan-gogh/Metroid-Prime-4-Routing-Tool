// input/KeyboardHandler.js
// Minimal scaffold for keyboard shortcuts and bindings

(function (global) {
  // Ensure a single shared NOOP handler exists globally to avoid duplicate declarations
  if (typeof globalThis.__MP4_NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.__MP4_NOOP_ERROR_HANDLER = { logDebug: function(){}, logWarning: function(){}, logError: function(){} };
  }

  class KeyboardHandler {
    constructor(map, config, eventBus) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.eventBus = eventBus || null;
      this.eventTypes = window.EventTypes || {};
      this.bound = false;

      // Get state managers from map
      this.mapState = map.mapState;
      this.selectionState = map.selectionState;
      this.routeState = map.routeState;
      this.layerState = map.layerState;
      this.tilesetState = map.tilesetState;
      this.imageState = map.imageState;
      this.heatmapDisplayState = map.heatmapDisplayState;
      this.editModeState = map.editModeState;
    }

    init() {
      // Initialize error handler from map reference with safe global NOOP fallback
      this.errorHandler = (this.map && this.map.errorHandler) || global.errorHandler || globalThis.__MP4_NOOP_ERROR_HANDLER;
      
      if (this.bound) return;
      this._onKeyDown = this._onKeyDown.bind(this);
      document.addEventListener('keydown', this._onKeyDown);
      this.bound = true;
    }

    destroy() {
      if (!this.bound) return;
      document.removeEventListener('keydown', this._onKeyDown);
      this.bound = false;
    }

    _onKeyDown(ev) {
      const h = this.errorHandler; // hot-path alias
      try {
        // Global Escape: exit any edit mode
        if (ev.key === 'Escape' || ev.key === 'Esc') {
          try {
            // Drive state rather than manipulating DOM directly
            if (this.editModeState && this.editModeState.editMarkersMode) {
              try { this.editModeState.setEditMarkersMode(false); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler.escape.exitMarkers'); }
            }
            if (this.editModeState && this.editModeState.editRouteMode) {
              try { this.editModeState.setEditRouteMode(false); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler.escape.exitRoute'); }
              try { if (this.map && this.map.canvas) this.map.canvas.style.cursor = 'grab'; } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler.escape.resetCursor'); }
            }
            try { this.eventBus.emit(this.eventTypes.EDIT_OVERLAY_UPDATE_REQUESTED); } catch (err) { this.errorHandler.logError('KeyboardHandler: Failed to update edit overlay on escape:', 'function', err); }
          } catch (err) { this.errorHandler.logError('KeyboardHandler: Failed to handle escape key:', 'function', err); }
          try { ev.preventDefault(); } catch (err) { this.errorHandler.logError('KeyboardHandler: Failed to prevent default on escape:', 'function', err); }
          return;
        }
        
        // Ignore when typing in form controls, buttons, links or contenteditable elements
        // Exception: allow `Space` to be handled when a slider (`<input type="range">`) has focus
        const active = document.activeElement;
        if (active) {
          const tag = active.tagName;
          const type = (active.type || '').toLowerCase();
          const isFormControl = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || active.isContentEditable);
          if (isFormControl) {
            // If it's a range input (slider) and the user pressed Space, allow the Space
            // key to be handled by global shortcuts (toggle sidebar). For all other
            // form controls, ignore keyboard shortcuts to avoid interfering with typing.
            if ((ev.code === 'Space' || ev.key === ' ') && tag === 'INPUT' && type === 'range') {
              // fall through and handle Space below
            } else {
              return;
            }
          }
        }

        // Toggle sidebar with Space
        if (ev.code === 'Space' || ev.key === ' ') {
          try {
            // Emit event to toggle sidebar visibility
            if (this.eventBus) {
              this.eventBus.emit(window.EventTypes.SIDEBAR_VISIBILITY_TOGGLE_REQUESTED);
            } else {
              // Fallback to direct manipulation if eventBus not available
              const app = document.querySelector('.app-container');
              const collapsed = app.classList.contains('sidebar-collapsed');
              if (collapsed) {
                app.classList.remove('sidebar-collapsed');
                const handle = document.getElementById('sidebarHandle') || document.getElementById('sidebarToggle');
                if (handle) handle.setAttribute('aria-expanded', 'true');
              } else {
                app.classList.add('sidebar-collapsed');
                const handle = document.getElementById('sidebarHandle') || document.getElementById('sidebarToggle');
                if (handle) handle.setAttribute('aria-expanded', 'false');
              }
            }
            ev.preventDefault();
          } catch (err) { this.errorHandler.logError('KeyboardHandler: Failed to toggle sidebar:', 'function', err); }
          return;
        }

        // Basic zoom shortcuts
        if (ev.key === '+' || ev.key === '=') {
          if (this.map && typeof this.map.zoomIn === 'function') this.map.zoomIn();
          try { ev.preventDefault(); } catch (err) { this.errorHandler.logError('KeyboardHandler: Failed to prevent default on zoom in:', 'function', err); }
          return;
        } else if (ev.key === '-') {
          if (this.map && typeof this.map.zoomOut === 'function') this.map.zoomOut();
          try { ev.preventDefault(); } catch (err) { this.errorHandler.logError('KeyboardHandler: Failed to prevent default on zoom out:', 'function', err); }
          return;
        } else if (ev.key === '0') {
          if (this.map && typeof this.map.resetView === 'function') this.map.resetView();
          try { ev.preventDefault(); } catch (err) { this.errorHandler.logError('KeyboardHandler: Failed to prevent default on reset view:', 'function', err); }
          return;
        }

        // Edit mode toggles: Q/q for route, E/e for markers
        if (ev.key === 'q' || ev.key === 'Q') {
          try {
            if (this.editModeState) {
              const newMode = !this.editModeState.editRouteMode;
              this.editModeState.setEditRouteMode(newMode);
              if (newMode) {
                try { this.eventBus.emit(this.eventTypes.EDIT_MODE_ENTER_REQUESTED, { mode: 'route', scale: 2.0 }); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler.q.enterRoute'); }
                try { this.editModeState.setEditMarkersMode(false); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler.q.exitMarkers'); }
                try { this.eventBus.emit(this.eventTypes.EDIT_MODE_EXIT_REQUESTED, { mode: 'customMarkers' }); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler.q.exitMarkersMode'); }
                this._updateEditModeUI('route', true);
              } else {
                try { this.eventBus.emit(this.eventTypes.EDIT_MODE_EXIT_REQUESTED, { mode: 'route' }); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler.q.exitRoute'); }
              }
            }
          } catch (err) { this.errorHandler.logError('KeyboardHandler: Failed to handle Q key (route toggle):', 'function', err); }
          try { ev.preventDefault(); } catch (err) { this.errorHandler.logError('KeyboardHandler: Failed to prevent default on Q key:', 'function', err); }
          return;
        } else if (ev.key === 'e' || ev.key === 'E') {
          try {
            if (this.editModeState) {
              const newMode = !this.editModeState.editMarkersMode;
              this.editModeState.setEditMarkersMode(newMode);
              if (newMode) {
                try { this.eventBus.emit(this.eventTypes.EDIT_MODE_ENTER_REQUESTED, { mode: 'customMarkers', scale: 2.0 }); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler.e.enterMarkers'); }
                try { this.editModeState.setEditRouteMode(false); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler.e.exitRoute'); }
                try { this.eventBus.emit(this.eventTypes.EDIT_MODE_EXIT_REQUESTED, { mode: 'route' }); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler.e.exitRouteMode'); }
                this._updateEditModeUI('markers', true);
              } else {
                try { this.eventBus.emit(this.eventTypes.EDIT_MODE_EXIT_REQUESTED, { mode: 'customMarkers' }); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler.e.exitMarkers'); }
              }
            }
          } catch (err) { this.errorHandler.logError('KeyboardHandler: Failed to handle E key (markers toggle):', 'function', err); }
          try { ev.preventDefault(); } catch (err) { this.errorHandler.logError('KeyboardHandler: Failed to prevent default on E key:', 'function', err); }
          return;
        }

        // Tileset shortcuts: 1=Satellite, 2=Holographic, 3=Toggle grayscale
        if (ev.key === '1') {
          try { this.tilesetState && this.tilesetState.setTileset && this.tilesetState.setTileset('sat'); } catch (err) { this.errorHandler.logError('Failed to set satellite tileset', err); }
          this._updateTilesetUI('sat');
          ev.preventDefault();
          return;
        } else if (ev.key === '2') {
          try { this.tilesetState && this.tilesetState.setTileset && this.tilesetState.setTileset('holo'); } catch (err) { this.errorHandler.logError('Failed to set holographic tileset', err); }
          this._updateTilesetUI('holo');
          ev.preventDefault();
          return;
        } else if (ev.key === '3') {
          try { this.tilesetState && this.tilesetState.setGrayscale && this.tilesetState.setGrayscale(!this.tilesetState.getGrayscale()); } catch (err) { this.errorHandler.logError('Failed to toggle tileset grayscale', err); }
          this._updateTilesetUI('grayscale');
          try { ev.preventDefault(); } catch (err) { this.errorHandler.logError('Failed to prevent default on tileset toggle', err); }
          return;
        }

        // Quick clears: Y=clear route, X=clear custom markers
        if (ev.key === 'y' || ev.key === 'Y') {
          try {
            const btn = document.getElementById('clearRouteBtn');
            if (btn) btn.click(); else if (this.map && this.map.routeController && typeof this.map.routeController.clearRoute === 'function') {
              this.map.routeController.clearRoute();
            } else if (this.map && this.map.routeManager && typeof this.map.routeManager.clearRoute === 'function') {
              this.map.routeManager.clearRoute();
            }
          } catch (err) { this.errorHandler.logError('Failed to clear route via Y key', err); }
          try { ev.preventDefault(); } catch (err) { this.errorHandler.logError('Failed to prevent default on Y key', err); }
          return;
        } else if (ev.key === 'x' || ev.key === 'X') {
          try {
            const btn = document.getElementById('clearCustom');
            if (btn) btn.click();
            else if (this.eventBus && this.eventTypes && this.eventTypes.MARKER_CLEAR_REQUESTED) {
              try { this.eventBus.emit(this.eventTypes.MARKER_CLEAR_REQUESTED); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler.clearCustom.emit'); }
            } else if (this.map && this.map.markerManager && typeof this.map.markerManager.clearMarkers === 'function') {
              this.map.markerManager.clearMarkers();
            }
          } catch (err) { this.errorHandler.logError('Failed to clear custom markers via X key', err); }
          try { ev.preventDefault(); } catch (err) { this.errorHandler.logError('Failed to prevent default on X key', err); }
          return;
        }

        // C/c - expand route nearby (only if no modifiers)
        if ((ev.key === 'c' || ev.key === 'C') && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey) {
          try { if (this.map && typeof this.map.expandRouteNearby === 'function') this.map.expandRouteNearby(); } catch (err) { this.errorHandler.logError('Failed to expand route nearby via C key', err); }
          try { ev.preventDefault(); } catch (err) { this.errorHandler.logError('Failed to prevent default on C key', err); }
          return;
        }

        // 4 - toggle grid heatmap
        if (ev.key === '4') {
          try { 
            if (this.heatmapDisplayState && typeof this.heatmapDisplayState.toggle === 'function') {
              this.heatmapDisplayState.toggle();
            } else if (this.map && typeof this.map.setGridHeatmap === 'function') {
              this.map.setGridHeatmap(!this.map._showGridHeatmap);
            }
          } catch (err) { this.errorHandler.logError('Failed to toggle grid heatmap via 4 key', err); }
          try { ev.preventDefault(); } catch (err) { this.errorHandler.logError('Failed to prevent default on 4 key', err); }
          return;
        }

        // < - Reverse route direction
        if (ev.key === '<') {
          try {
            const btn = document.getElementById('toggleRouteDirBtn');
            if (btn) btn.click();
          } catch (err) { this.errorHandler.logError('Failed to reverse route direction via < key', err); }
          try { ev.preventDefault(); } catch (err) { this.errorHandler.logError('Failed to prevent default on < key', err); }
          return;
        }

        // Arrow keys + WASD: pan by a fraction of viewport (Shift for larger steps)
        const stepFrac = ev.shiftKey ? 0.25 : 0.08;
        let moved = false;
        let deltaX = 0, deltaY = 0;
        
        try {
          const key = ev.key;
          if (key === 'ArrowLeft' || key === 'a' || key === 'A') { 
            deltaX = Math.round(this.map.canvas.clientWidth * stepFrac); 
            moved = true; 
          }
          else if (key === 'ArrowRight' || key === 'd' || key === 'D') { 
            deltaX = -Math.round(this.map.canvas.clientWidth * stepFrac); 
            moved = true; 
          }
          else if (key === 'ArrowUp' || key === 'w' || key === 'W') { 
            deltaY = Math.round(this.map.canvas.clientHeight * stepFrac); 
            moved = true; 
          }
          else if (key === 'ArrowDown' || key === 's' || key === 'S') { 
            deltaY = -Math.round(this.map.canvas.clientHeight * stepFrac); 
            moved = true; 
          }
        } catch (err) { this.errorHandler.logError('Failed to handle arrow key panning', err); }

        if (moved) {
          try { 
            ev.preventDefault(); 
            // Use MapState.setPan() to properly update state and emit events through modular infrastructure
            const newPanX = this.mapState.panX + deltaX;
            const newPanY = this.mapState.panY + deltaY;
            this.mapState.setPan(newPanX, newPanY);
            
            this.map.updateResolution(); 
            this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
            
            // Save view after keyboard pan
            try { this.map.saveViewToStorage(); } catch (err) { this.errorHandler && this.errorHandler.logError(err, 'KeyboardHandler.pan.saveViewToStorage'); }
          } catch (err) { this.errorHandler.logError('Failed to update map after keyboard pan', err); }
          return;
        }

      } catch (e) { h.logWarning('KeyboardHandler._onKeyDown failed', 'KeyboardHandler._onKeyDown', { error: e }); }
    }

    _updateEditModeUI(mode, enabled) {
      try {
        // UI synchronization delegated to centralized handlers. Emit overlay update request
        // and rely on EDIT_MODE_CHANGED listeners (ToolbarController/SidebarController) to update DOM.
        if (this.eventBus && this.eventTypes && this.eventTypes.EDIT_OVERLAY_UPDATE_REQUESTED) {
          try { this.eventBus.emit(this.eventTypes.EDIT_OVERLAY_UPDATE_REQUESTED); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'KeyboardHandler._updateEditModeUI.emitOverlayUpdate'); }
        }
      } catch (e) { this.errorHandler && this.errorHandler.logWarning('KeyboardHandler._updateEditModeUI failed', 'KeyboardHandler._updateEditModeUI', { error: e }); }
    }

    _updateTilesetUI(tileset) {
      try {
        const sat = document.getElementById('tilesetSatBtn');
        const holo = document.getElementById('tilesetHoloBtn');
        const gbtn = document.getElementById('tilesetGrayscaleBtn');
        
        if (tileset === 'sat') {
          if (sat) { sat.classList.add('active'); sat.setAttribute('aria-pressed', 'true'); }
          if (holo) { holo.classList.remove('active'); holo.setAttribute('aria-pressed', 'false'); }
        } else if (tileset === 'holo') {
          if (holo) { holo.classList.add('active'); holo.setAttribute('aria-pressed', 'true'); }
          if (sat) { sat.classList.remove('active'); sat.setAttribute('aria-pressed', 'false'); }
        }
        
        // Update grayscale button for both tileset changes
        if (gbtn && this.map) { 
          gbtn.classList.toggle('active', !!this.map.tilesetGrayscale); 
          gbtn.setAttribute('aria-pressed', this.map.tilesetGrayscale ? 'true' : 'false'); 
        }
      } catch (e) { this.errorHandler && this.errorHandler.logWarning('KeyboardHandler._updateTilesetUI failed', 'KeyboardHandler._updateTilesetUI', { error: e }); }
    }
  }

  global.KeyboardHandler = KeyboardHandler;
})(window);

