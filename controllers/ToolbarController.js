// controllers/ToolbarController.js
// Handles toolbar controls: zoom buttons, edit mode toggles, export/import buttons

(function (global) {
  class ToolbarController {
    constructor(map, config, errorHandler) {
      this.map = map;
      this.config = config || global.MP4Config || {};
      this.errorHandler = errorHandler || (typeof global.errorHandler !== 'undefined' ? global.errorHandler : null);

    /**
     * Initialize toolbar controls
     */
    init() {
      this._bindZoomControls();
      this._bindEditModeToggles();
      this._bindExportImportControls();
      this._bindRouteControls();
      this._bindPressedHandlers();
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
            if (this.map && typeof this.map.zoomIn === 'function') {
              this.map.zoomIn();
            }
          });
        }

        if (zoomOutBtn) {
          zoomOutBtn.addEventListener('click', () => {
            if (this.map && typeof this.map.zoomOut === 'function') {
              this.map.zoomOut();
            }
          });
        }

        if (resetViewBtn) {
          resetViewBtn.addEventListener('click', () => {
            if (this.map && typeof this.map.resetView === 'function') {
              this.map.resetView();
            }
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
        if (editMarkersToggle && this.map) {
          // Reflect initial state
          try {
            editMarkersToggle.setAttribute('aria-pressed', this.map.editMarkersMode ? 'true' : 'false');
            editMarkersToggle.classList.toggle('active', !!this.map.editMarkersMode);
            if (editMarkersToggleMini) {
              editMarkersToggleMini.setAttribute('aria-pressed', this.map.editMarkersMode ? 'true' : 'false');
              editMarkersToggleMini.classList.toggle('glow', !!this.map.editMarkersMode);
            }
          } catch (e) {
            if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to set initial marker edit toggle state');
          }

          const toggleMarkersEdit = () => {
            const on = !(editMarkersToggle.getAttribute('aria-pressed') === 'true');
            try {
              editMarkersToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
              editMarkersToggle.classList.toggle('active', on);
              if (editMarkersToggleMini) {
                editMarkersToggleMini.setAttribute('aria-pressed', on ? 'true' : 'false');
                editMarkersToggleMini.classList.toggle('glow', on);
              }
            } catch (e) {
              if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to toggle marker edit button state');
            }

            if (this.map) {
              this.map.editMarkersMode = on;
              if (on) {
                // Exit route edit mode when entering marker edit mode
                this.map.editRouteMode = false;
                try {
                  const routeToggle = document.getElementById('editRouteToggle');
                  const routeToggleMini = document.getElementById('editRouteToggleMini');
                  if (routeToggle) {
                    routeToggle.setAttribute('aria-pressed', 'false');
                    routeToggle.classList.remove('active');
                  }
                  if (routeToggleMini) {
                    routeToggleMini.setAttribute('aria-pressed', 'false');
                    routeToggleMini.classList.remove('glow');
                  }
                } catch (e) {
                  if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to exit route edit mode when entering marker edit');
                }
              }

              // Update edit overlay
              try {
                if (typeof updateEditOverlay === 'function') {
                  updateEditOverlay();
                }
              } catch (e) {
                if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to update edit overlay');
              }

              // Update layer visibility for custom markers
              if (this.map.layerVisibility) {
                this.map.layerVisibility.customMarkers = on;
                try {
                  if (typeof saveLayerVisibilityToStorage === 'function') {
                    saveLayerVisibilityToStorage(this.map.layerVisibility);
                  }
                } catch (e) {
                  if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to save layer visibility to storage');
                }
              }

              this.map.render();
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
        if (editRouteToggle && this.map) {
          // Reflect initial state
          try {
            editRouteToggle.setAttribute('aria-pressed', this.map.editRouteMode ? 'true' : 'false');
            editRouteToggle.classList.toggle('active', !!this.map.editRouteMode);
            if (editRouteToggleMini) {
              editRouteToggleMini.setAttribute('aria-pressed', this.map.editRouteMode ? 'true' : 'false');
              editRouteToggleMini.classList.toggle('glow', !!this.map.editRouteMode);
            }
          } catch (e) {
            if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to set initial route edit toggle state');
          }

          const toggleRouteEdit = () => {
            const on = !(editRouteToggle.getAttribute('aria-pressed') === 'true');
            try {
              editRouteToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
              editRouteToggle.classList.toggle('active', on);
              if (editRouteToggleMini) {
                editRouteToggleMini.setAttribute('aria-pressed', on ? 'true' : 'false');
                editRouteToggleMini.classList.toggle('glow', on);
              }
            } catch (e) {
              if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to toggle route edit button state');
            }

            if (this.map) {
              this.map.editRouteMode = on;
              if (on) {
                // Exit marker edit mode when entering route edit mode
                this.map.editMarkersMode = false;
                try {
                  const markersToggle = document.getElementById('editMarkersToggle');
                  const markersToggleMini = document.getElementById('editMarkersToggleMini');
                  if (markersToggle) {
                    markersToggle.setAttribute('aria-pressed', 'false');
                    markersToggle.classList.remove('active');
                  }
                  if (markersToggleMini) {
                    markersToggleMini.setAttribute('aria-pressed', 'false');
                    markersToggleMini.classList.remove('glow');
                  }
                } catch (e) {
                  if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to exit marker edit mode when entering route edit');
                }
              }

              // Update edit overlay
              try {
                if (typeof updateEditOverlay === 'function') {
                  updateEditOverlay();
                }
              } catch (e) {
                if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to update edit overlay');
              }

              this.map.render();
            }
          };

          editRouteToggle.addEventListener('click', toggleRouteEdit);
          if (editRouteToggleMini) {
            editRouteToggleMini.addEventListener('click', toggleRouteEdit);
          }
        }

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
            try {
              if (this.map && this.map.markerManager) {
                this.map.markerManager.exportMarkers();
              } else {
                if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showMarkerError) {
                  NotificationUtils.showMarkerError('Marker manager not available.');
                }
              }
            } catch (err) {
              if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showMarkerError) {
                NotificationUtils.showMarkerError('Failed to export custom markers: ' + (err.message || String(err)));
              }
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

        if (editMarkersToggle && this.map) {
          const isActive = !!this.map.editMarkersMode;
          editMarkersToggle.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          editMarkersToggle.classList.toggle('active', isActive);
        }

        if (editRouteToggle && this.map) {
          const isActive = !!this.map.editRouteMode;
          editRouteToggle.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          editRouteToggle.classList.toggle('active', isActive);
        }

      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'ToolbarController: Failed to update edit toggle states');
      }
    }
  }

  // Make globally available
  global.ToolbarController = ToolbarController;

})(typeof window !== 'undefined' ? window : this);