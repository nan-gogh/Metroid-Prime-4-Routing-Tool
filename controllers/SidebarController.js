// controllers/SidebarController.js
// Handles sidebar layer visibility controls and show/hide all functionality

(function (global) {
  class SidebarController {
    constructor(map, config, errorHandler) {
      this.map = map;
      this.config = config || global.MP4Config || {};
      this.errorHandler = errorHandler || (typeof global.errorHandler !== 'undefined' ? global.errorHandler : null);
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
        this.errorHandler.logDebug('SidebarController: Failed to bind show/hide all buttons', 'SidebarController._bindShowHideAllButtons', { error: e });
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
              newVisibility[key] = !!(this.map && this.map.layerVisibility && this.map.layerVisibility[key]);
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

        // Apply new visibility
        try {
          this.map.layerVisibility = Object.assign({}, this.map.layerVisibility || {}, newVisibility);
        } catch (e) {
          this.map.layerVisibility = Object.assign({}, newVisibility);
        }

        // Exit edit modes when hiding layers
        if (!show) {
          this._exitEditModesForHiddenLayers(newVisibility);
        }

        // Save to storage
        try {
          if (typeof saveLayerVisibilityToStorage === 'function') {
            saveLayerVisibilityToStorage(this.map.layerVisibility);
          }
        } catch (e) {
          if (this.errorHandler) this.errorHandler.logError(e, 'SidebarController: Failed to save layer visibility to storage');
        }

        // Deselect markers when hiding all layers
        if (!show) {
          this._deselectHiddenMarkers();
        }

        this._scheduleRender();
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
          if (typeof exitEditModeForLayer === 'function') {
            exitEditModeForLayer('customMarkers');
          }
        }
        if (newVisibility && newVisibility.route === false) {
          if (typeof exitEditModeForLayer === 'function') {
            exitEditModeForLayer('route');
          }
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
        if (this.map) {
          this.map.selectedMarker = null;
          this.map.selectedMarkerLayer = null;
          if (typeof this.map.hideTooltip === 'function') {
            this.map.hideTooltip();
          }
          this.map.render();
        }
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
        if (this.map && this.map.layerVisibility) {
          this.map.layerVisibility[layerKey] = checked;

          // Exit edit mode if hiding the layer being edited
          if (!checked) {
            if (layerKey === 'customMarkers' && this.map.editMarkersMode) {
              if (typeof exitEditModeForLayer === 'function') {
                exitEditModeForLayer('customMarkers');
              }
            } else if (layerKey === 'route' && this.map.editRouteMode) {
              if (typeof exitEditModeForLayer === 'function') {
                exitEditModeForLayer('route');
              }
            }
          }

          // Save to storage
          try {
            if (typeof saveLayerVisibilityToStorage === 'function') {
              saveLayerVisibilityToStorage(this.map.layerVisibility);
            }
          } catch (e) {
            if (this.errorHandler) this.errorHandler.logError(e, 'SidebarController: Failed to save layer visibility to storage');
          }

          this._updateLayerCounts();
          this._scheduleRender();
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
        if (this.map && typeof this.map.updateLayerCounts === 'function') {
          this.map.updateLayerCounts();
        }
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
          if (this.map) this.map.render();
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
          const isVisible = this.map && this.map.layerVisibility && this.map.layerVisibility[layerKey];
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