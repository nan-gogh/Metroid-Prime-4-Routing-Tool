// state/LayerState.js
// Manages layer visibility, display states, and layer configuration

(function (global) {
  class LayerState extends BaseStateManager {
    constructor(layerKeys, config, options = {}) {
      super(config, options);

      this.layerVisibility = {};
      this.layerConfig = {};
      this._showGridHeatmap = false;
      this.highlightedLayers = new Set();
      this.highlightConfig = {};

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
        console.debug('LayerState._initializeLayers failed', 'LayerState._initializeLayers', { error: e });
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
        console.debug('LayerState._initializeLayerConfig failed', 'LayerState._initializeLayerConfig', { error: e });
      }
    }

    _loadGridVisibility() {
      try {
        if (window.storageService) {
          const stored = window.storageService.get(this.config.STORAGE_KEYS.GRID_VISIBLE);
          if (stored !== null) {
            this.layerVisibility.grid = (stored === '1' || stored === 'true' || stored === true);
          } else {
            this.layerVisibility.grid = false; // Default to hidden
          }
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const stored = localStorage.getItem('mp4_grid_visible');
            if (stored !== null) {
              this.layerVisibility.grid = (stored === '1' || stored === 'true' || stored === 'true');
            } else {
              this.layerVisibility.grid = false; // Default to hidden
            }
          } else {
            this.layerVisibility.grid = false; // Default to hidden
          }
        } else {
          this.layerVisibility.grid = false; // Default to hidden
        }
      } catch (e) {
        console.debug('LayerState._loadGridVisibility failed', 'LayerState._loadGridVisibility', { error: e });
        this.layerVisibility.grid = false;
      }
    }

    // Layer visibility management
    setLayerVisible(layerKey, visible) {
      try {
        if (layerKey && typeof layerKey === 'string') {
          this.layerVisibility[layerKey] = !!visible;
          this._emitChange(window.EventTypes.LAYER_VISIBILITY_CHANGED, {
            layerKey,
            visible: !!visible,
            layerVisibility: { ...this.layerVisibility }
          });
        }
      } catch (e) {
        console.debug('LayerState.setLayerVisible failed', 'LayerState.setLayerVisible', { error: e });
      }
    }

    toggleLayer(layerKey) {
      try {
        if (layerKey && typeof layerKey === 'string') {
          const current = !!this.layerVisibility[layerKey];
          this.layerVisibility[layerKey] = !current;
          this._emitChange(window.EventTypes.LAYER_VISIBILITY_CHANGED, {
            layerKey,
            visible: !current,
            layerVisibility: { ...this.layerVisibility }
          });
        }
      } catch (e) {
        console.debug('LayerState.toggleLayer failed', 'LayerState.toggleLayer', { error: e });
      }
    }

    isLayerVisible(layerKey) {
      try {
        return !!this.layerVisibility[layerKey];
      } catch (e) {
        console.debug('LayerState.isLayerVisible failed', 'LayerState.isLayerVisible', { error: e });
        return false;
      }
    }

    showAllLayers() {
      try {
        Object.keys(this.layerVisibility).forEach(key => {
          this.layerVisibility[key] = true;
        });
      } catch (e) {
        console.debug('LayerState.showAllLayers failed', 'LayerState.showAllLayers', { error: e });
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
        console.debug('LayerState.hideAllLayers failed', 'LayerState.hideAllLayers', { error: e });
      }
    }

    getVisibleLayers() {
      try {
        return Object.keys(this.layerVisibility).filter(key => this.layerVisibility[key]);
      } catch (e) {
        console.debug('LayerState.getVisibleLayers failed', 'LayerState.getVisibleLayers', { error: e });
        return [];
      }
    }

    getHiddenLayers() {
      try {
        return Object.keys(this.layerVisibility).filter(key => !this.layerVisibility[key]);
      } catch (e) {
        console.debug('LayerState.getHiddenLayers failed', 'LayerState.getHiddenLayers', { error: e });
        return [];
      }
    }

    // Special display states
    setGridVisible(visible) {
      try {
        this.layerVisibility.grid = !!visible;
        this._emitChange(window.EventTypes.DISPLAY_SETTINGS_CHANGED, {
          gridVisible: !!visible,
          heatmapVisible: this._showGridHeatmap
        });
      } catch (e) {
        console.debug('LayerState.setGridVisible failed', 'LayerState.setGridVisible', { error: e });
      }
    }

    isGridVisible() {
      try {
        return !!this.layerVisibility.grid;
      } catch (e) {
        console.debug('LayerState.isGridVisible failed', 'LayerState.isGridVisible', { error: e });
        return false;
      }
    }

    setHeatmapVisible(visible) {
      try {
        this._showGridHeatmap = !!visible;
        this._emitChange(window.EventTypes.DISPLAY_SETTINGS_CHANGED, {
          gridVisible: !!this.layerVisibility.grid,
          heatmapVisible: !!visible
        });
      } catch (e) {
        console.debug('LayerState.setHeatmapVisible failed', 'LayerState.setHeatmapVisible', { error: e });
      }
    }

    isHeatmapVisible() {
      try {
        return !!this._showGridHeatmap;
      } catch (e) {
        console.debug('LayerState.isHeatmapVisible failed', 'LayerState.isHeatmapVisible', { error: e });
        return false;
      }
    }

    // Layer counting
    getVisibleCount() {
      try {
        return Object.values(this.layerVisibility).filter(visible => visible).length;
      } catch (e) {
        console.debug('LayerState.getVisibleCount failed', 'LayerState.getVisibleCount', { error: e });
        return 0;
      }
    }

    getTotalCount() {
      try {
        return Object.keys(this.layerVisibility).length;
      } catch (e) {
        console.debug('LayerState.getTotalCount failed', 'LayerState.getTotalCount', { error: e });
        return 0;
      }
    }

    getHiddenCount() {
      try {
        return this.getTotalCount() - this.getVisibleCount();
      } catch (e) {
        console.debug('LayerState.getHiddenCount failed', 'LayerState.getHiddenCount', { error: e });
        return 0;
      }
    }

    // Layer configuration access
    getLayerConfig(layerKey) {
      try {
        return this.layerConfig[layerKey] || {};
      } catch (e) {
        console.debug('LayerState.getLayerConfig failed', 'LayerState.getLayerConfig', { error: e });
        return {};
      }
    }

    setLayerConfig(layerKey, config) {
      try {
        this.layerConfig[layerKey] = { ...config };
      } catch (e) {
        console.debug('LayerState.setLayerConfig failed', 'LayerState.setLayerConfig', { error: e });
      }
    }

    getMaxMarkers(layerKey) {
      try {
        const config = this.getLayerConfig(layerKey);
        return config.maxMarkers || 0;
      } catch (e) {
        console.debug('LayerState.getMaxMarkers failed', 'LayerState.getMaxMarkers', { error: e });
        return 0;
      }
    }

    // Bulk operations
    setMultipleLayers(visibilityMap) {
      try {
        Object.keys(visibilityMap).forEach(key => {
          this.layerVisibility[key] = !!visibilityMap[key];
        });
        this._emitChange(window.EventTypes.LAYER_VISIBILITY_CHANGED, {
          layerKey: null,
          visible: null,
          layerVisibility: { ...this.layerVisibility },
          triggeredBy: 'bulk-update'
        });
      } catch (e) {
        console.debug('LayerState.setMultipleLayers failed', 'LayerState.setMultipleLayers', { error: e });
      }
    }

    // State persistence (consent-gated)
    saveToStorage() {
      try {
        if (window.storageService) {
          const state = {
            layerVisibility: { ...this.layerVisibility },
            showGridHeatmap: this._showGridHeatmap
          };
          window.storageService.set(this.config.STORAGE_KEYS.LAYER_STATE, state);
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
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
        console.debug('LayerState.saveToStorage failed', 'LayerState.saveToStorage', { error: e });
      }
    }

    loadFromStorage() {
      try {
        if (window.storageService) {
          const state = window.storageService.get(this.config.STORAGE_KEYS.LAYER_STATE);
          if (state) {
            if (state.layerVisibility && typeof state.layerVisibility === 'object') {
              this.layerVisibility = { ...this.layerVisibility, ...state.layerVisibility };
            }
            if (typeof state.showGridHeatmap === 'boolean') {
              this._showGridHeatmap = state.showGridHeatmap;
            }
          }
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
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
        console.debug('LayerState.loadFromStorage failed', 'LayerState.loadFromStorage', { error: e });
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
        console.debug('LayerState.reset failed', 'LayerState.reset', { error: e });
      }
    }

    // Utility methods
    hasLayer(layerKey) {
      try {
        return layerKey in this.layerVisibility;
      } catch (e) {
        console.debug('LayerState.hasLayer failed', 'LayerState.hasLayer', { error: e });
        return false;
      }
    }

    addLayer(layerKey, visible = true) {
      try {
        if (layerKey && typeof layerKey === 'string' && !this.hasLayer(layerKey)) {
          this.layerVisibility[layerKey] = !!visible;
        }
      } catch (e) {
        console.debug('LayerState.addLayer failed', 'LayerState.addLayer', { error: e });
      }
    }

    removeLayer(layerKey) {
      try {
        delete this.layerVisibility[layerKey];
        delete this.layerConfig[layerKey];
      } catch (e) {
        console.debug('LayerState.removeLayer failed', 'LayerState.removeLayer', { error: e });
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.LayerState = LayerState;
  }

})(typeof window !== 'undefined' ? window : global);

