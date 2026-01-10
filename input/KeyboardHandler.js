// input/KeyboardHandler.js
// Minimal scaffold for keyboard shortcuts and bindings

(function (global) {
  class KeyboardHandler {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.bound = false;
    }

    init() {
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
      try {
        // Global Escape: exit any edit mode
        if (ev.key === 'Escape' || ev.key === 'Esc') {
          try {
            // Prefer clicking the toggles so their handlers run UI sync
            const markersToggle = document.getElementById('editMarkersToggle');
            const routeToggle = document.getElementById('editRouteToggle');
            if (this.map && this.map.editMarkersMode) {
              if (markersToggle) markersToggle.click(); else this.map.editMarkersMode = false;
            }
            if (this.map && this.map.editRouteMode) {
              if (routeToggle) routeToggle.click(); else this.map.editRouteMode = false;
            }
            try { if (typeof updateEditOverlay === 'function') updateEditOverlay(); } catch (err) {}
          } catch (err) {}
          try { ev.preventDefault(); } catch (err) {}
          return;
        }
        
        // Ignore when typing in form controls, buttons, links or contenteditable elements
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.tagName === 'BUTTON' || active.tagName === 'A' || active.isContentEditable)) return;

        // Toggle sidebar with Space
        if (ev.code === 'Space' || ev.key === ' ') {
          try {
            const app = document.querySelector('.app-container');
            const collapsed = app.classList.contains('sidebar-collapsed');
            // Call setSidebarCollapsed if it exists, otherwise toggle manually
            if (typeof setSidebarCollapsed === 'function') {
              setSidebarCollapsed(!collapsed);
            } else {
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
          } catch (err) {}
          return;
        }

        // Basic zoom shortcuts
        if (ev.key === '+' || ev.key === '=') {
          if (this.map && typeof this.map.zoomIn === 'function') this.map.zoomIn();
          try { ev.preventDefault(); } catch (err) {}
          return;
        } else if (ev.key === '-') {
          if (this.map && typeof this.map.zoomOut === 'function') this.map.zoomOut();
          try { ev.preventDefault(); } catch (err) {}
          return;
        } else if (ev.key === '0') {
          if (this.map && typeof this.map.resetView === 'function') this.map.resetView();
          try { ev.preventDefault(); } catch (err) {}
          return;
        }

        // Edit mode toggles: Q/q for route, E/e for markers
        if (ev.key === 'q' || ev.key === 'Q') {
          try {
            const routeToggleEl = document.getElementById('editRouteToggle');
            if (routeToggleEl) {
              routeToggleEl.click();
            } else if (this.map) {
              this.map.editRouteMode = !this.map.editRouteMode;
              if (this.map.editRouteMode) {
                try { this.map._enterEditMode && this.map._enterEditMode('route', 2.0); } catch (e) {}
                try { this.map.editMarkersMode = false; } catch (e) {}
                try { this.map._exitEditMode && this.map._exitEditMode('customMarkers'); } catch (e) {}
                this._updateEditModeUI('route', true);
              } else {
                try { this.map._exitEditMode && this.map._exitEditMode('route'); } catch (e) {}
              }
            }
          } catch (err) {}
          try { ev.preventDefault(); } catch (err) {}
          return;
        } else if (ev.key === 'e' || ev.key === 'E') {
          try {
            const editToggleEl = document.getElementById('editMarkersToggle');
            if (editToggleEl) {
              editToggleEl.click();
            } else if (this.map) {
              this.map.editMarkersMode = !this.map.editMarkersMode;
              if (this.map.editMarkersMode) {
                try { this.map._enterEditMode && this.map._enterEditMode('customMarkers', 2.0); } catch (e) {}
                try { this.map.editRouteMode = false; } catch (e) {}
                try { this.map._exitEditMode && this.map._exitEditMode('route'); } catch (e) {}
                this._updateEditModeUI('markers', true);
              } else {
                try { this.map._exitEditMode && this.map._exitEditMode('customMarkers'); } catch (e) {}
              }
            }
          } catch (err) {}
          try { ev.preventDefault(); } catch (err) {}
          return;
        }

        // Tileset shortcuts: 1=Satellite, 2=Holographic, 3=Toggle grayscale
        if (ev.key === '1') {
          try { this.map && this.map.setTileset && this.map.setTileset('sat'); } catch (err) {}
          this._updateTilesetUI('sat');
          ev.preventDefault();
          return;
        } else if (ev.key === '2') {
          try { this.map && this.map.setTileset && this.map.setTileset('holo'); } catch (err) {}
          this._updateTilesetUI('holo');
          ev.preventDefault();
          return;
        } else if (ev.key === '3') {
          try { this.map && this.map.setTilesetGrayscale && this.map.setTilesetGrayscale(!this.map.tilesetGrayscale); } catch (err) {}
          this._updateTilesetUI('grayscale');
          try { ev.preventDefault(); } catch (err) {}
          return;
        }

        // Quick clears: Y=clear route, X=clear custom markers
        if (ev.key === 'y' || ev.key === 'Y') {
          try {
            const btn = document.getElementById('clearRouteBtn');
            if (btn) btn.click(); else if (this.map && this.map.clearRoute) this.map.clearRoute();
          } catch (err) {}
          try { ev.preventDefault(); } catch (err) {}
          return;
        } else if (ev.key === 'x' || ev.key === 'X') {
          try {
            const btn = document.getElementById('clearCustom');
            if (btn) btn.click(); else if (typeof MarkerUtils !== 'undefined' && MarkerUtils.clearCustomMarkers) MarkerUtils.clearCustomMarkers();
          } catch (err) {}
          try { ev.preventDefault(); } catch (err) {}
          return;
        }

        // C/c - expand route nearby (only if no modifiers)
        if ((ev.key === 'c' || ev.key === 'C') && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey) {
          try { if (typeof expandRouteNearby === 'function') expandRouteNearby(); } catch (err) {}
          try { ev.preventDefault(); } catch (err) {}
          return;
        }

        // < - Reverse route direction
        if (ev.key === '<') {
          try {
            const btn = document.getElementById('toggleRouteDirBtn');
            if (btn) btn.click();
          } catch (err) {}
          try { ev.preventDefault(); } catch (err) {}
          return;
        }

        // Arrow keys + WASD: pan by a fraction of viewport (Shift for larger steps)
        const stepFrac = ev.shiftKey ? 0.25 : 0.08;
        let moved = false;
        try {
          const key = ev.key;
          if (key === 'ArrowLeft' || key === 'a' || key === 'A') { 
            this.map.panX += Math.round(this.map.canvas.clientWidth * stepFrac); 
            moved = true; 
          }
          else if (key === 'ArrowRight' || key === 'd' || key === 'D') { 
            this.map.panX -= Math.round(this.map.canvas.clientWidth * stepFrac); 
            moved = true; 
          }
          else if (key === 'ArrowUp' || key === 'w' || key === 'W') { 
            this.map.panY += Math.round(this.map.canvas.clientHeight * stepFrac); 
            moved = true; 
          }
          else if (key === 'ArrowDown' || key === 's' || key === 'S') { 
            this.map.panY -= Math.round(this.map.canvas.clientHeight * stepFrac); 
            moved = true; 
          }
        } catch (err) {}

        if (moved) {
          try { 
            ev.preventDefault(); 
            this.map.updateResolution(); 
            this.map.render(); 
          } catch (err) {}
          return;
        }

      } catch (e) { console.debug('KeyboardHandler._onKeyDown failed', e); }
    }

    _updateEditModeUI(mode, enabled) {
      try {
        if (mode === 'route') {
          const routeToggle = document.getElementById('editRouteToggle');
          const miniRoute = document.getElementById('editRouteToggleMini');
          if (routeToggle) { 
            routeToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false'); 
            routeToggle.classList.toggle('active', enabled); 
          }
          if (miniRoute) { 
            try { if (typeof setEditToggleColor === 'function') setEditToggleColor('route','editRouteToggle','editRouteToggleMini','edit-route', enabled); } catch(e) {} 
            miniRoute.classList.toggle('glow', enabled); 
            miniRoute.setAttribute('aria-pressed', enabled ? 'true' : 'false'); 
          }
        } else if (mode === 'markers') {
          const markersToggle = document.getElementById('editMarkersToggle');
          const miniMarkers = document.getElementById('editMarkersToggleMini');
          if (markersToggle) { 
            markersToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false'); 
            markersToggle.classList.toggle('active', enabled); 
          }
          if (miniMarkers) { 
            try { if (typeof setEditToggleColor === 'function') setEditToggleColor('markers','editMarkersToggle','editMarkersToggleMini','edit-markers', enabled); } catch(e) {} 
            miniMarkers.classList.toggle('glow', enabled); 
            miniMarkers.setAttribute('aria-pressed', enabled ? 'true' : 'false'); 
          }
        }
      } catch (e) { console.debug('KeyboardHandler._updateEditModeUI failed', e); }
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
      } catch (e) { console.debug('KeyboardHandler._updateTilesetUI failed', e); }
    }
  }

  global.KeyboardHandler = KeyboardHandler;
})(window);
