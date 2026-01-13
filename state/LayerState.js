// state/LayerState.js
// Manages layer visibility, display states, and layer configuration

(function (global) {
  class LayerState {
    constructor(layerKeys, config) {
      this.config = config || (global.MP4Config || {});
      this.layerVisibility = {};
      this.layerConfig = {};
      this._showGridHeatmap = false;

      // Initialize layer visibility
      this._initializeLayers(layerKeys || []);

      // Initialize layer configuration
      this._initializeLayerConfig();
    }

    _initializeLayers(layerKeys) {
      try {
        // Set all layers to visible by default
        layerKeys.forEach(key => {
          this.layerVisibility[key] = true;
        });

        // Ensure route layer is always visible
        this.layerVisibility.route = true;

        // Initialize grid visibility with default or stored value
        this._loadGridVisibility();
      } catch (e) {
        console.debug('LayerState._initializeLayers failed', e);
      }
    }

    _initializeLayerConfig() {
      try {
        // Initialize layer constraints
        this.layerConfig = {
          'customMarkers': {
            maxMarkers: (this.config.CUSTOM_MARKERS && this.config.CUSTOM_MARKERS.MAX_COUNT) || 50
          }
        };
      } catch (e) {
        console.debug('LayerState._initializeLayerConfig failed', e);
      }
    }

    _loadGridVisibility() {
      try {
        if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const stored = localStorage.getItem('mp4_grid_visible');
            if (stored !== null) {
              this.layerVisibility.grid = (stored === '1' || stored === 'true' || stored === 'true');
            } else {
              this.layerVisibility.grid = true; // Default to visible
            }
          } else {
            this.layerVisibility.grid = true; // Default to visible
          }
        } else {
          this.layerVisibility.grid = true; // Default to visible
        }
      } catch (e) {
        console.debug('LayerState._loadGridVisibility failed', e);
        this.layerVisibility.grid = true;
      }
    }

    // Layer visibility management
    setLayerVisible(layerKey, visible) {
      try {
        if (layerKey && typeof layerKey === 'string') {
          this.layerVisibility[layerKey] = !!visible;
        }
      } catch (e) {
        console.debug('LayerState.setLayerVisible failed', e);
      }
    }

    toggleLayer(layerKey) {
      try {
        if (layerKey && typeof layerKey === 'string') {
          const current = !!this.layerVisibility[layerKey];
          this.layerVisibility[layerKey] = !current;
        }
      } catch (e) {
        console.debug('LayerState.toggleLayer failed', e);
      }
    }

    isLayerVisible(layerKey) {
      try {
        return !!this.layerVisibility[layerKey];
      } catch (e) {
        console.debug('LayerState.isLayerVisible failed', e);
        return false;
      }
    }

    showAllLayers() {
      try {
        Object.keys(this.layerVisibility).forEach(key => {
          this.layerVisibility[key] = true;
        });
      } catch (e) {
        console.debug('LayerState.showAllLayers failed', e);
      }
    }

    hideAllLayers() {
      try {
        Object.keys(this.layerVisibility).forEach(key => {
          // Keep route layer visible (it's special)
          if (key !== 'route') {
            this.layerVisibility[key] = false;
          }
        });
      } catch (e) {
        console.debug('LayerState.hideAllLayers failed', e);
      }
    }

    getVisibleLayers() {
      try {
        return Object.keys(this.layerVisibility).filter(key => this.layerVisibility[key]);
      } catch (e) {
        console.debug('LayerState.getVisibleLayers failed', e);
        return [];
      }
    }

    getHiddenLayers() {
      try {
        return Object.keys(this.layerVisibility).filter(key => !this.layerVisibility[key]);
      } catch (e) {
        console.debug('LayerState.getHiddenLayers failed', e);
        return [];
      }
    }

    // Special display states
    setGridVisible(visible) {
      try {
        this.layerVisibility.grid = !!visible;
      } catch (e) {
        console.debug('LayerState.setGridVisible failed', e);
      }
    }

    isGridVisible() {
      try {
        return !!this.layerVisibility.grid;
      } catch (e) {
        console.debug('LayerState.isGridVisible failed', e);
        return false;
      }
    }

    setHeatmapVisible(visible) {
      try {
        this._showGridHeatmap = !!visible;
      } catch (e) {
        console.debug('LayerState.setHeatmapVisible failed', e);
      }
    }

    isHeatmapVisible() {
      try {
        return !!this._showGridHeatmap;
      } catch (e) {
        console.debug('LayerState.isHeatmapVisible failed', e);
        return false;
      }
    }

    // Layer counting
    getVisibleCount() {
      try {
        return Object.values(this.layerVisibility).filter(visible => visible).length;
      } catch (e) {
        console.debug('LayerState.getVisibleCount failed', e);
        return 0;
      }
    }

    getTotalCount() {
      try {
        return Object.keys(this.layerVisibility).length;
      } catch (e) {
        console.debug('LayerState.getTotalCount failed', e);
        return 0;
      }
    }

    getHiddenCount() {
      try {
        return this.getTotalCount() - this.getVisibleCount();
      } catch (e) {
        console.debug('LayerState.getHiddenCount failed', e);
        return 0;
      }
    }

    // Layer configuration access
    getLayerConfig(layerKey) {
      try {
        return this.layerConfig[layerKey] || {};
      } catch (e) {
        console.debug('LayerState.getLayerConfig failed', e);
        return {};
      }
    }

    setLayerConfig(layerKey, config) {
      try {
        this.layerConfig[layerKey] = { ...config };
      } catch (e) {
        console.debug('LayerState.setLayerConfig failed', e);
      }
    }

    getMaxMarkers(layerKey) {
      try {
        const config = this.getLayerConfig(layerKey);
        return config.maxMarkers || 0;
      } catch (e) {
        console.debug('LayerState.getMaxMarkers failed', e);
        return 0;
      }
    }

    // Bulk operations
    setMultipleLayers(visibilityMap) {
      try {
        Object.keys(visibilityMap).forEach(key => {
          this.layerVisibility[key] = !!visibilityMap[key];
        });
      } catch (e) {
        console.debug('LayerState.setMultipleLayers failed', e);
      }
    }

    // State persistence (consent-gated)
    saveToStorage() {
      try {
        if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const state = {
              layerVisibility: { ...this.layerVisibility },
              showGridHeatmap: this._showGridHeatmap
            };
            localStorage.setItem('mp4_layer_state', JSON.stringify(state));
          }
        }
      } catch (e) {
        console.debug('LayerState.saveToStorage failed', e);
      }
    }

    loadFromStorage() {
      try {
        if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const saved = localStorage.getItem('mp4_layer_state');
            if (saved) {
              const state = JSON.parse(saved);
              if (state.layerVisibility && typeof state.layerVisibility === 'object') {
                this.layerVisibility = { ...this.layerVisibility, ...state.layerVisibility };
              }
              if (typeof state.showGridHeatmap === 'boolean') {
                this._showGridHeatmap = state.showGridHeatmap;
              }
            }
          }
        }
      } catch (e) {
        console.debug('LayerState.loadFromStorage failed', e);
      }
    }

    // State serialization for debugging/testing
    toJSON() {
      return {
        layerVisibility: { ...this.layerVisibility },
        showGridHeatmap: this._showGridHeatmap,
        layerConfig: { ...this.layerConfig },
        visibleCount: this.getVisibleCount(),
        totalCount: this.getTotalCount(),
        visibleLayers: this.getVisibleLayers(),
        hiddenLayers: this.getHiddenLayers()
      };
    }

    // Reset all state
    reset() {
      try {
        // Reset to default visibility (all visible except special cases)
        Object.keys(this.layerVisibility).forEach(key => {
          this.layerVisibility[key] = true;
        });
        this.layerVisibility.route = true; // Route always visible
        this._showGridHeatmap = false;
        this._initializeLayerConfig(); // Reset config
      } catch (e) {
        console.debug('LayerState.reset failed', e);
      }
    }

    // Utility methods
    hasLayer(layerKey) {
      try {
        return layerKey in this.layerVisibility;
      } catch (e) {
        console.debug('LayerState.hasLayer failed', e);
        return false;
      }
    }

    addLayer(layerKey, visible = true) {
      try {
        if (layerKey && typeof layerKey === 'string' && !this.hasLayer(layerKey)) {
          this.layerVisibility[layerKey] = !!visible;
        }
      } catch (e) {
        console.debug('LayerState.addLayer failed', e);
      }
    }

    removeLayer(layerKey) {
      try {
        delete this.layerVisibility[layerKey];
        delete this.layerConfig[layerKey];
      } catch (e) {
        console.debug('LayerState.removeLayer failed', e);
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.LayerState = LayerState;
  }

})(typeof window !== 'undefined' ? window : global);
