// controllers/ToolbarController.js
// Handles toolbar controls: zoom buttons, edit mode toggles, export/import buttons

(function (global) {
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
      this.errorHandler = options.errorHandler || (typeof global.errorHandler !== 'undefined' ? global.errorHandler : null);
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
        if (editMarkersToggle && this.map) {
          // Reflect initial state
          try {
            editMarkersToggle.setAttribute('aria-pressed', this.selectionState ? this.selectionState.editMarkersMode : false ? 'true' : 'false');
            editMarkersToggle.classList.toggle('active', !!(this.selectionState && this.selectionState.editMarkersMode));
            if (editMarkersToggleMini) {
              editMarkersToggleMini.setAttribute('aria-pressed', this.selectionState ? this.selectionState.editMarkersMode : false ? 'true' : 'false');
              editMarkersToggleMini.classList.toggle('glow', !!(this.selectionState && this.selectionState.editMarkersMode));
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

            if (this.selectionState) {
              this.selectionState.setEditMarkersMode(on);
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

              // Update edit overlay
              this.eventBus.emit(EventTypes.EDIT_OVERLAY_UPDATE_REQUESTED);

              // Update layer visibility for custom markers
              if (this.layerState && this.layerState.layerVisibility) {
                const newVisibility = { ...this.layerState.layerVisibility };
                newVisibility.customMarkers = on;
                this.eventBus.emit(EventTypes.LAYER_VISIBILITY_SAVE_REQUESTED, {
                  layerVisibility: newVisibility
                });
              }

              // Emit events instead of direct render call
              this.eventBus.emit(this.eventTypes.EDIT_MODE_CHANGED, {
                mode: 'markers',
                enabled: on,
                triggeredBy: 'toolbar-toggle'
              });
              if (this.layerState) {
                this.eventBus.emit(this.eventTypes.LAYER_VISIBILITY_CHANGED, {
                  layerVisibility: { ...this.layerState.layerVisibility, customMarkers: on },
                  triggeredBy: 'edit-mode-toggle'
                });
              }
              this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
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
        if (editRouteToggle && this.selectionState) {
          // Reflect initial state
          try {
            editRouteToggle.setAttribute('aria-pressed', this.selectionState.editRouteMode ? 'true' : 'false');
            editRouteToggle.classList.toggle('active', !!this.selectionState.editRouteMode);
            if (editRouteToggleMini) {
              editRouteToggleMini.setAttribute('aria-pressed', this.selectionState.editRouteMode ? 'true' : 'false');
              editRouteToggleMini.classList.toggle('glow', !!this.selectionState.editRouteMode);
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

            if (this.selectionState) {
              this.selectionState.setEditRouteMode(on);
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

              // Update edit overlay
              this.eventBus.emit(EventTypes.EDIT_OVERLAY_UPDATE_REQUESTED);

              // Emit edit mode changed event instead of direct render
              this.eventBus.emit(this.eventTypes.EDIT_MODE_CHANGED, {
                mode: 'route',
                enabled: on,
                triggeredBy: 'toolbar-route-edit-toggle'
              });
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
              if (this.markerManager) {
                this.markerManager.exportMarkers();
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

        if (editMarkersToggle && this.selectionState) {
          const isActive = !!this.selectionState.editMarkersMode;
          editMarkersToggle.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          editMarkersToggle.classList.toggle('active', isActive);
        }

        if (editRouteToggle && this.selectionState) {
          const isActive = !!this.selectionState.editRouteMode;
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