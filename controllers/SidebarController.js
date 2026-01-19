// controllers/SidebarController.js
// Handles sidebar layer visibility controls and show/hide all functionality

(function (global) {
  class SidebarController {
    constructor(options) {
      // Required dependencies
      this.layerState = options.layerState;
      this.selectionState = options.selectionState;
      this.editModeState = options.editModeState;
      this.eventBus = options.eventBus;

      // Optional dependencies
      this.config = options.config || global.MP4Config || {};
      this.errorHandler = options.errorHandler || (typeof global.errorHandler !== 'undefined' ? global.errorHandler : null);
      this.eventTypes = window.EventTypes || {};

      // Keep map reference for UI operations (temporary)
      this.map = options.map;

      this._renderScheduled = false;
      this._scheduleRender = this._scheduleRender.bind(this);
    }

    /**
     * Initialize sidebar controls
     */
    init() {
      this._bindShowHideAllButtons();
      this._bindLayerCheckboxes();
      this._updateLayerCounts();
    }

    /**
     * Bind show all / hide all layer buttons
     */
    _bindShowHideAllButtons() {
      try {
        const showBtn = document.getElementById('showAllLayersBtn');
        const hideBtn = document.getElementById('hideAllLayersBtn');

        if (showBtn) {
          showBtn.addEventListener('click', () => this._applyLayerToggle(true));
        }
        if (hideBtn) {
          hideBtn.addEventListener('click', () => this._applyLayerToggle(false));
        }
      } catch (e) {
        console.debug('SidebarController: Failed to bind show/hide all buttons', 'SidebarController._bindShowHideAllButtons', { error: e });
      }
    }

    /**
     * Apply layer visibility toggle to all layers
     * @param {boolean} show - Whether to show or hide all layers
     */
    _applyLayerToggle(show) {
      try {
        const rows = Array.from(document.querySelectorAll('#layerList .layer-toggle'));
        const newVisibility = {};

        rows.forEach(row => {
          const key = row.dataset.layer;
          // Preserve disabled rows (edit-locked) when hiding
          if (!show && row.classList && row.classList.contains('disabled')) {
            try {
              newVisibility[key] = !!(this.layerState && this.layerState.layerVisibility && this.layerState.layerVisibility[key]);
            } catch (e) {
              newVisibility[key] = false;
            }
            return;
          }

          newVisibility[key] = !!show;
          // Update visual state
          try {
            row.classList.toggle('active', !!show);
            row.setAttribute('aria-pressed', !!show ? 'true' : 'false');
          } catch (e) {
            if (this.errorHandler) this.errorHandler.logError(e, 'SidebarController: Failed to update layer row visual state');
          }
        });

        // Apply new visibility (handled by event listener)
        // Emit layer visibility changed event with standard format (bulk operation)
        this.eventBus.emit(this.eventTypes.LAYER_VISIBILITY_CHANGED, {
          layerKey: null,
          visible: null,
          layerVisibility: newVisibility,
          triggeredBy: 'show-hide-all'
        });

        // Exit edit modes when hiding layers
        if (!show) {
          this._exitEditModesForHiddenLayers(newVisibility);
        }

        // Save to storage
        if (this.layerState) {
          this.eventBus.emit(EventTypes.LAYER_VISIBILITY_SAVE_REQUESTED, {
            layerVisibility: this.layerState.layerVisibility
          });
        }

        // Deselect markers when hiding all layers
        if (!show) {
          this._deselectHiddenMarkers();
        }

        // Emit render requested event
        this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'SidebarController: Failed to apply layer toggle');
      }
    }

    /**
     * Exit edit modes for layers that are being hidden
     * @param {Object} newVisibility - New visibility state
     */
    _exitEditModesForHiddenLayers(newVisibility) {
      try {
        if (newVisibility && newVisibility.customMarkers === false) {
          this.eventBus.emit(EventTypes.EDIT_MODE_EXIT_REQUESTED, { mode: 'customMarkers' });
        }
        if (newVisibility && newVisibility.route === false) {
          this.eventBus.emit(EventTypes.EDIT_MODE_EXIT_REQUESTED, { mode: 'route' });
        }
      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'SidebarController: Failed to exit edit modes');
      }
    }

    /**
     * Deselect any selected markers when hiding layers
     */
    _deselectHiddenMarkers() {
      try {
        if (this.selectionState) {
          this.selectionState.clearSelectedMarker();
        }
        // Emit selection cleared event instead of direct render
        this.eventBus.emit(this.eventTypes.SELECTION_CLEARED, {
          triggeredBy: 'layer-hide-all'
        });
      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'SidebarController: Failed to deselect markers');
      }
    }

    /**
     * Bind individual layer checkboxes
     */
    _bindLayerCheckboxes() {
      // Layer checkboxes are created dynamically by initializeLayerIcons()
      // This method would be called after layer icons are initialized
      try {
        const layerRows = document.querySelectorAll('#layerList .layer-toggle');
        layerRows.forEach(row => {
          const checkbox = row.querySelector('input[type="checkbox"]');
          if (checkbox) {
            checkbox.addEventListener('change', (e) => {
              this._handleLayerCheckboxChange(row.dataset.layer, e.target.checked);
            });
          }
        });
      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'SidebarController: Failed to bind layer checkboxes');
      }
    }

    /**
     * Handle individual layer checkbox changes
     * @param {string} layerKey - The layer key
     * @param {boolean} checked - Whether the checkbox is checked
     */
    _handleLayerCheckboxChange(layerKey, checked) {
      try {
        // Update layer visibility via event (handled by map listener)
        const newVisibility = { ...this.layerState.layerVisibility };
        newVisibility[layerKey] = checked;

        // Exit edit mode if hiding the layer being edited
        if (!checked) {
          if (layerKey === 'customMarkers' && this.editModeState && this.editModeState.editMarkersMode) {
            this.editModeState.setEditMarkersMode(false);
          } else if (layerKey === 'route' && this.editModeState && this.editModeState.editRouteMode) {
            this.editModeState.setEditRouteMode(false);
          }
        }

        // Emit layer visibility changed event with standard format
        this.eventBus.emit(this.eventTypes.LAYER_VISIBILITY_CHANGED, {
          layerKey: layerKey,
          visible: checked,
          layerVisibility: newVisibility,
          triggeredBy: 'sidebar-toggle'
        });

        // Save to storage
        if (this.layerState) {
          this.eventBus.emit(EventTypes.LAYER_VISIBILITY_SAVE_REQUESTED, {
            layerVisibility: this.layerState.layerVisibility
          });
        }
      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'SidebarController: Failed to handle layer checkbox change');
      }
    }

    /**
     * Update layer counts in the sidebar
     */
    _updateLayerCounts() {
      try {
        // Emit layer counts update event instead of direct call
        this.eventBus.emit(this.eventTypes.LAYER_COUNTS_CHANGED, {
          triggeredBy: 'sidebar-controller'
        });
      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'SidebarController: Failed to update layer counts');
      }
    }

    /**
     * Schedule a render to avoid multiple renders during batch operations
     */
    _scheduleRender() {
      if (this._renderScheduled) return;

      this._renderScheduled = true;
      requestAnimationFrame(() => {
        this._renderScheduled = false;
        try {
          // Emit render requested event instead of direct render
          this.eventBus.emit(this.eventTypes.RENDER_REQUESTED, {
            triggeredBy: 'sidebar-controller'
          });
        } catch (e) {
          if (this.errorHandler) this.errorHandler.logError(e, 'SidebarController: Scheduled render failed');
        }
      });
    }

    /**
     * Update the visual state of layer checkboxes to match current visibility
     */
    updateLayerCheckboxStates() {
      try {
        const layerRows = document.querySelectorAll('#layerList .layer-toggle');
        layerRows.forEach(row => {
          const layerKey = row.dataset.layer;
          const isVisible = this.layerState ? this.layerState.isLayerVisible(layerKey) : false;
          const checkbox = row.querySelector('input[type="checkbox"]');

          if (checkbox) {
            checkbox.checked = !!isVisible;
          }

          try {
            row.classList.toggle('active', !!isVisible);
            row.setAttribute('aria-pressed', !!isVisible ? 'true' : 'false');
          } catch (e) {
            if (this.errorHandler) this.errorHandler.logError(e, 'SidebarController: Failed to update layer row visual state');
          }
        });
      } catch (e) {
        if (this.errorHandler) this.errorHandler.logError(e, 'SidebarController: Failed to update layer checkbox states');
      }
    }
  }

  // Make globally available
  global.SidebarController = SidebarController;

})(typeof window !== 'undefined' ? window : this);
