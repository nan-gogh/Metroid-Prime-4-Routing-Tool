// controllers/ToolbarController.js
// Handles toolbar controls: zoom buttons, edit mode toggles, export/import buttons

(function (global) {
  if (typeof globalThis.__MP4_NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.__MP4_NOOP_ERROR_HANDLER = { logDebug: function(){}, logWarning: function(){}, logError: function(){} };
  }

  class ToolbarController {
    constructor(options) {
      // Required dependencies
      this.layerState = options.layerState;
      this.selectionState = options.selectionState;
      this.editModeState = options.editModeState;
      this.markerManager = options.markerManager;
      this.eventBus = options.eventBus;

      // Optional dependencies
      this.config = options.config || global.MP4Config || {};
      this.errorHandler = options.errorHandler || globalThis.__MP4_NOOP_ERROR_HANDLER;
      this.eventTypes = window.EventTypes || {};

      // NO map reference needed anymore
    }

    /**
     * Initialize toolbar controls
     */
    init() {
      this._bindZoomControls();
      this._bindEditModeToggles();
      this._bindExportImportControls();
      this._bindRouteControls();
      this._bindPressedHandlers();
      // Subscribe to edit mode changes to keep toolbar toggles in sync
      try {
        if (this.eventBus && this.eventBus.on && this.eventTypes && this.eventTypes.EDIT_MODE_CHANGED) {
          this.eventBus.on(this.eventTypes.EDIT_MODE_CHANGED, (data) => {
            try {
              this.updateEditToggleStates();
            } catch (e) {
              if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed in EDIT_MODE_CHANGED handler');
            }
          });
        }
      } catch (e) {
        if (this.errorHandler) this.errorHandler.logWarning('ToolbarController: Failed to subscribe to EDIT_MODE_CHANGED', 'ToolbarController.init.subscribe', { error: e });
      }
    }

    /**
     * Bind zoom in/out/reset view buttons
     */
    _bindZoomControls() {
      try {
        const zoomInBtn = document.getElementById('zoomIn');
        const zoomOutBtn = document.getElementById('zoomOut');
        const resetViewBtn = document.getElementById('resetView');

        if (zoomInBtn) {
          zoomInBtn.addEventListener('click', () => {
            // Emit zoom in requested event instead of direct call
            this.eventBus.emit(this.eventTypes.MAP_ZOOM_IN_REQUESTED, {
              triggeredBy: 'toolbar-zoom-in'
            });
          });
        }

        if (zoomOutBtn) {
          zoomOutBtn.addEventListener('click', () => {
            // Emit zoom out requested event instead of direct call
            this.eventBus.emit(this.eventTypes.MAP_ZOOM_OUT_REQUESTED, {
              triggeredBy: 'toolbar-zoom-out'
            });
          });
        }

        if (resetViewBtn) {
          resetViewBtn.addEventListener('click', () => {
            // Emit view reset requested event instead of direct call
            this.eventBus.emit(this.eventTypes.MAP_VIEW_RESET_REQUESTED, {
              triggeredBy: 'toolbar-reset-view'
            });
          });
        }

        // Add pressed state feedback
        [zoomInBtn, zoomOutBtn, resetViewBtn].forEach(btn => {
          if (btn) {
            this._addPressedHandlers(btn);
          }
        });

      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to bind zoom controls');
      }
    }

    /**
     * Bind edit mode toggle buttons
     */
    _bindEditModeToggles() {
      try {
        // Edit markers toggle
        const editMarkersToggle = document.getElementById('editMarkersToggle');
        const editMarkersToggleMini = document.getElementById('editMarkersToggleMini');
        if (editMarkersToggle && this.editModeState) {
          // Reflect initial state
          try {
            editMarkersToggle.setAttribute('aria-pressed', this.editModeState ? this.editModeState.editMarkersMode : false ? 'true' : 'false');
            editMarkersToggle.classList.toggle('active', !!(this.editModeState && this.editModeState.editMarkersMode));
            if (editMarkersToggleMini) {
              editMarkersToggleMini.setAttribute('aria-pressed', this.editModeState ? this.editModeState.editMarkersMode : false ? 'true' : 'false');
              editMarkersToggleMini.classList.toggle('glow', !!(this.editModeState && this.editModeState.editMarkersMode));
            }
          } catch (e) {
            if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to set initial marker edit toggle state');
          }

          const toggleMarkersEdit = () => {
            // Prefer authoritative state from EditModeState rather than reading DOM attributes
            const on = !!(this.editModeState && !this.editModeState.editMarkersMode);
            // Toggle requested; reduced diagnostic logging

            if (this.editModeState) {
              try {
                this.editModeState.setEditMarkersMode(on);
                // Ensure route edit mode is disabled via state (UI will sync via EDIT_MODE_CHANGED)
                try { this.editModeState.setEditRouteMode(false); } catch (e) {}
                this._setEditToggleColor('customMarkers', on);
              } catch (e) {
                if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to toggle marker edit mode (state)');
              }

              // Request overlay update; controllers will update DOM in response to EDIT_MODE_CHANGED
              try { this.eventBus.emit(this.eventTypes.EDIT_OVERLAY_UPDATE_REQUESTED); } catch (e) { if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to emit EDIT_OVERLAY_UPDATE_REQUESTED'); }
            }
          };

          editMarkersToggle.addEventListener('click', toggleMarkersEdit);
          if (editMarkersToggleMini) {
            editMarkersToggleMini.addEventListener('click', toggleMarkersEdit);
          }
        }

        // Edit route toggle
        const editRouteToggle = document.getElementById('editRouteToggle');
        const editRouteToggleMini = document.getElementById('editRouteToggleMini');
        if (editRouteToggle && this.editModeState) {
          // Reflect initial state
          try {
            editRouteToggle.setAttribute('aria-pressed', this.editModeState ? this.editModeState.editRouteMode : false ? 'true' : 'false');
            editRouteToggle.classList.toggle('active', !!(this.editModeState && this.editModeState.editRouteMode));
            if (editRouteToggleMini) {
              editRouteToggleMini.setAttribute('aria-pressed', this.editModeState ? this.editModeState.editRouteMode : false ? 'true' : 'false');
              editRouteToggleMini.classList.toggle('glow', !!(this.editModeState && this.editModeState.editRouteMode));
            }
          } catch (e) {
            if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to set initial route edit toggle state');
          }

          const toggleRouteEdit = () => {
            // Prefer authoritative state from EditModeState rather than reading DOM attributes
            const on = !!(this.editModeState && !this.editModeState.editRouteMode);
            // Toggle requested; reduced diagnostic logging

            if (this.editModeState) {
              try {
                this.editModeState.setEditRouteMode(on);
                // Ensure marker edit mode is disabled via state (UI will sync via EDIT_MODE_CHANGED)
                try { this.editModeState.setEditMarkersMode(false); } catch (e) {}
                this._setEditToggleColor('route', on);
              } catch (e) {
                if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to toggle route edit mode (state)');
              }

              // Request overlay update; controllers will update DOM in response to EDIT_MODE_CHANGED
              try { this.eventBus.emit(this.eventTypes.EDIT_OVERLAY_UPDATE_REQUESTED); } catch (e) { if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to emit EDIT_OVERLAY_UPDATE_REQUESTED'); }
            }
          };

          editRouteToggle.addEventListener('click', toggleRouteEdit);
          if (editRouteToggleMini) {
            editRouteToggleMini.addEventListener('click', toggleRouteEdit);
          }
        }

        // Set initial toggle states and colors
        this.updateEditToggleStates();

      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to bind edit mode toggles');
      }
    }

    /**
     * Bind export/import controls
     */
    _bindExportImportControls() {
      try {
        // Custom markers export
        const exportCustomBtn = document.getElementById('exportCustom');
        if (exportCustomBtn) {
          exportCustomBtn.addEventListener('click', () => {
            if (this.markerManager) {
              // Let MarkerManager emit events and show notifications.
              this.markerManager.exportMarkers();
            } else {
              // Marker manager missing is an internal condition — suppressed verbose debug
            }
          });
        }

        // Route export/import (handled by existing code in map.js for now)
        // These are more complex and involve file handling

      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to bind export/import controls');
      }
    }

    /**
     * Bind route computation controls
     */
    _bindRouteControls() {
      try {
        // Route computation buttons are handled in the main init() function
        // for now, as they involve complex state management

        // Loop route toggle is handled in InteractiveMap constructor

      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to bind route controls');
      }
    }

    /**
     * Add pressed state handlers to buttons
     */
    _bindPressedHandlers() {
      try {
        // Add pressed handlers to all control buttons
        this._addPressedHandlersToSelector('.control-btn');

        // Prevent buttons from retaining focus
        this._preventButtonFocus('.control-btn, .zoom-btn, .hints-toggle, .layer-toggle');

      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to bind pressed handlers');
      }
    }

    /**
     * Add pressed state handlers to a specific button
     * @param {HTMLElement} btn - The button element
     */
    _addPressedHandlers(btn) {
      if (!btn) return;

      btn.addEventListener('pointerdown', () => btn.classList.add('pressed'));
      btn.addEventListener('pointerup', () => btn.classList.remove('pressed'));
      btn.addEventListener('pointercancel', () => btn.classList.remove('pressed'));

      // Prevent stuck pressed state
      btn.addEventListener('mouseleave', () => {
        if (!btn.classList.contains('emphasized')) {
          btn.classList.remove('pressed');
        }
      });
    }

    /**
     * Add pressed handlers to all elements matching a selector
     * @param {string} selector - CSS selector
     */
    _addPressedHandlersToSelector(selector) {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el) {
            this._addPressedHandlers(el);
          }
        });
      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, `ToolbarController: Failed to add pressed handlers to selector: ${selector}`);
      }
    }

    /**
     * Prevent buttons from retaining keyboard focus
     * @param {string} selector - CSS selector for buttons
     */
    _preventButtonFocus(selector) {
      try {
        const buttons = document.querySelectorAll(selector);
        buttons.forEach(btn => {
          if (btn) {
            btn.addEventListener('click', () => {
              try {
                btn.blur();
              } catch (e) {
                if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to blur button on click');
              }
            });
          }
        });

        // Global click handler to blur interactive elements
        document.addEventListener('click', (ev) => {
          try {
            const target = ev && ev.target ? ev.target.closest('button, .control-btn, .zoom-btn, .hints-toggle, .layer-toggle, [role="button"]') : null;
            if (target && typeof target.blur === 'function') {
              setTimeout(() => {
                try {
                  target.blur();
                } catch (e) {
                  if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to blur target element');
                }
              }, 0);
            }
          } catch (e) {
            if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to handle global click for button blur');
          }
        }, true);

      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to prevent button focus');
      }
    }

    /**
     * Update edit toggle button states to reflect current edit modes
     */
    updateEditToggleStates() {
      try {
        const editMarkersToggle = document.getElementById('editMarkersToggle');
        const editRouteToggle = document.getElementById('editRouteToggle');
        const editMarkersToggleMini = document.getElementById('editMarkersToggleMini');
        const editRouteToggleMini = document.getElementById('editRouteToggleMini');

        if (editMarkersToggle && this.editModeState) {
          const isActive = !!this.editModeState.editMarkersMode;
          editMarkersToggle.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          editMarkersToggle.classList.toggle('active', isActive);
          this._setEditToggleColor('customMarkers', isActive);
          if (editMarkersToggleMini) {
            try {
              editMarkersToggleMini.setAttribute('aria-pressed', isActive ? 'true' : 'false');
              editMarkersToggleMini.classList.toggle('glow', isActive);
            } catch (e) {}
          }
        }

        if (editRouteToggle && this.editModeState) {
          const isActive = !!this.editModeState.editRouteMode;
          editRouteToggle.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          editRouteToggle.classList.toggle('active', isActive);
          this._setEditToggleColor('route', isActive);
          if (editRouteToggleMini) {
            try {
              editRouteToggleMini.setAttribute('aria-pressed', isActive ? 'true' : 'false');
              editRouteToggleMini.classList.toggle('glow', isActive);
            } catch (e) {}
          }
        }

      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to update edit toggle states');
      }
    }

    /**
     * Set the glow color for edit toggles based on layer colors
     * @param {string} layerKey - The layer key ('customMarkers' or 'route')
     * @param {boolean} on - Whether the edit mode is active
     */
    _setEditToggleColor(layerKey, on) {
      try {
        // Get layer color from global LAYERS
        const layerColor = (typeof window.LAYERS !== 'undefined' && window.LAYERS && window.LAYERS[layerKey] && window.LAYERS[layerKey].color) ?
          String(window.LAYERS[layerKey].color).trim() : '#22d3ee';

        // Parse hex color to RGB
        const parseHexSimple = (h) => {
          if (!h || h[0] !== '#') return null;
          const s = h.slice(1);
          if (s.length === 6) {
            return { r: parseInt(s.slice(0,2),16), g: parseInt(s.slice(2,4),16), b: parseInt(s.slice(4,6),16) };
          } else if (s.length === 3) {
            return { r: parseInt(s[0]+s[0],16), g: parseInt(s[1]+s[1],16), b: parseInt(s[2]+s[2],16) };
          } else if (s.length === 8) {
            return { r: parseInt(s.slice(0,2),16), g: parseInt(s.slice(2,4),16), b: parseInt(s.slice(4,6),16), a: parseInt(s.slice(6,8),16) / 255 };
          } else if (s.length === 4) {
            return { r: parseInt(s[0]+s[0],16), g: parseInt(s[1]+s[1],16), b: parseInt(s[2]+s[2],16), a: parseInt(s[3]+s[3],16) / 255 };
          }
          return null;
        };

        const rgb = parseHexSimple(layerColor) || { r: 34, g: 211, b: 238 };
        const isRoute = (layerKey === 'route');
        const glow1 = `rgba(${rgb.r},${rgb.g},${rgb.b},${isRoute ? 0.9 : 0.75})`;
        const glow2 = `rgba(${rgb.r},${rgb.g},${rgb.b},${isRoute ? 0.6 : 0.35})`;
        const border = layerColor;

        // Apply to mini toggles
        const miniEl = document.getElementById(layerKey === 'customMarkers' ? 'editMarkersToggleMini' : 'editRouteToggleMini');
        if (miniEl) {
          if (on) {
            miniEl.style.setProperty('--edit-layer-glow1', glow1);
            miniEl.style.setProperty('--edit-layer-glow2', glow2);
            miniEl.style.setProperty('--edit-layer-border', border);
          } else {
            miniEl.style.removeProperty('--edit-layer-glow1');
            miniEl.style.removeProperty('--edit-layer-glow2');
            miniEl.style.removeProperty('--edit-layer-border');
          }
        }

        // Apply to sidebar toggles
        const sidebarEl = document.getElementById(layerKey === 'customMarkers' ? 'editMarkersToggle' : 'editRouteToggle');
        if (sidebarEl) {
          const cssPrefix = layerKey === 'customMarkers' ? 'edit-markers' : 'edit-route';
          if (on) {
            sidebarEl.style.setProperty(`--${cssPrefix}-border`, border);
            sidebarEl.style.setProperty(`--${cssPrefix}-glow1`, glow1);
          } else {
            sidebarEl.style.removeProperty(`--${cssPrefix}-border`);
            sidebarEl.style.removeProperty(`--${cssPrefix}-glow1`);
          }
        }

      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to set edit toggle color');
      }
    }
  }

  // Make globally available
  global.ToolbarController = ToolbarController;

})(typeof window !== 'undefined' ? window : this);