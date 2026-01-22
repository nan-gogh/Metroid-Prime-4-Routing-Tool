// state/LayerState.js
// Manages layer visibility, display states, and layer configuration

(function (global) {
  // Shared NOOP handler used when no ErrorHandler is injected
  globalThis.NOOP_ERROR_HANDLER = globalThis.NOOP_ERROR_HANDLER || {
    logDebug: function () {},
    logWarning: function () {},
    logError: function () {}
  };
  class LayerState extends BaseStateManager {
    constructor(layerKeys, config, options = {}) {
      super(config, options);
      // default to shared NOOP handler when no ErrorHandler injected
      this.errorHandler = options.errorHandler || globalThis.NOOP_ERROR_HANDLER;

      this.layerVisibility = {};
      this.layerConfig = {};
      this._showGridHeatmap = false;
      this.highlightedLayers = new Set();
      this.highlightConfig = {};

      // Initialize layer visibility
      this._initializeLayers(layerKeys || []);

      // Initialize layer configuration
      this._initializeLayerConfig();
      this.storage = (options && options.storage) ? options.storage : (options && options.storageProvider ? options.storageProvider.getInstance() : null);
      this.eventBus = options.eventBus || null;
    }

    _initializeLayers(layerKeys) {
      const h = this.errorHandler;
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
        try { h.logWarning('LayerState._initializeLayers failed', 'LayerState._initializeLayers', { error: e }); } catch (ignore) {}
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
        try { this.errorHandler.logWarning('LayerState._initializeLayerConfig failed', 'LayerState._initializeLayerConfig', { error: e }); } catch (ignore) {}
      }
    }

    _loadGridVisibility() {
      const h = this.errorHandler;
      try {
        // Prefer injected storage (StorageService) when available. Do not fall back
        // to global/localStorage to keep storage access DI-centric.
        if (this.storage && typeof this.storage.get === 'function') {
          const key = (this.config && this.config.STORAGE_KEYS && this.config.STORAGE_KEYS.GRID_VISIBLE) || 'mp4_grid_visible';
          const stored = this.storage.get(key);
          if (stored !== null && typeof stored !== 'undefined') {
            this.layerVisibility.grid = (stored === '1' || stored === 'true' || stored === true);
          } else {
            this.layerVisibility.grid = false; // Default to hidden
          }
        } else {
          // No injected storage available — default to hidden
          this.layerVisibility.grid = false;
        }
      } catch (e) {
        try { h.logWarning('LayerState._loadGridVisibility failed', 'LayerState._loadGridVisibility', { error: e }); } catch (ignore) {}
        this.layerVisibility.grid = false;
      }
    }

    // Layer visibility management
    setLayerVisible(layerKey, visible) {
      const h = this.errorHandler;
      try {
        if (layerKey && typeof layerKey === 'string') {
          const prev = !!this.layerVisibility[layerKey];
          if (this.config && this.config.DEBUG) {
            h.logDebug('LayerState.setLayerVisible called', 'LayerState.setLayerVisible', { layerKey, visible: !!visible, prev });
          }
          this.layerVisibility[layerKey] = !!visible;
          this._emitChange(window.EventTypes.LAYER_VISIBILITY_CHANGED, {
            layerKey,
            visible: !!visible,
            layerVisibility: { ...this.layerVisibility },
            triggeredBy: 'state-setter'
          });
          if (this.config && this.config.DEBUG) {
            h.logDebug('LayerState.setLayerVisible emitted LAYER_VISIBILITY_CHANGED', 'LayerState.setLayerVisible.emit', { layerKey, visible: !!visible });
          }
        }
      } catch (e) {
        try { h.logWarning('LayerState.setLayerVisible failed', 'LayerState.setLayerVisible', { error: e }); } catch (ignore) {}
      }
    }

    toggleLayer(layerKey) {
      const h = this.errorHandler;
      try {
        if (layerKey && typeof layerKey === 'string') {
          const current = !!this.layerVisibility[layerKey];
          if (this.config && this.config.DEBUG) {
            h.logDebug('LayerState.toggleLayer called', 'LayerState.toggleLayer', { layerKey, current });
          }
          this.layerVisibility[layerKey] = !current;
          this._emitChange(window.EventTypes.LAYER_VISIBILITY_CHANGED, {
            layerKey,
            visible: !current,
            layerVisibility: { ...this.layerVisibility },
            triggeredBy: 'state-toggle'
          });
          if (this.config && this.config.DEBUG) {
            h.logDebug('LayerState.toggleLayer emitted LAYER_VISIBILITY_CHANGED', 'LayerState.toggleLayer.emit', { layerKey, visible: !current });
          }
        }
      } catch (e) {
        try { h.logWarning('LayerState.toggleLayer failed', 'LayerState.toggleLayer', { error: e }); } catch (ignore) {}
      }
    }

    isLayerVisible(layerKey) {
      try {
        return !!this.layerVisibility[layerKey];
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.isLayerVisible failed', 'LayerState.isLayerVisible', { error: e }); } catch (ignore) {}
        return false;
      }
    }

    showAllLayers() {
      try {
        Object.keys(this.layerVisibility).forEach(key => {
          this.layerVisibility[key] = true;
        });
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.showAllLayers failed', 'LayerState.showAllLayers', { error: e }); } catch (ignore) {}
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
        try { this.errorHandler.logWarning('LayerState.hideAllLayers failed', 'LayerState.hideAllLayers', { error: e }); } catch (ignore) {}
      }
    }

    getVisibleLayers() {
      try {
        return Object.keys(this.layerVisibility).filter(key => this.layerVisibility[key]);
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.getVisibleLayers failed', 'LayerState.getVisibleLayers', { error: e }); } catch (ignore) {}
        return [];
      }
    }

    getHiddenLayers() {
      try {
        return Object.keys(this.layerVisibility).filter(key => !this.layerVisibility[key]);
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.getHiddenLayers failed', 'LayerState.getHiddenLayers', { error: e }); } catch (ignore) {}
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
        try { this.errorHandler.logWarning('LayerState.setGridVisible failed', 'LayerState.setGridVisible', { error: e }); } catch (ignore) {}
      }
    }

    isGridVisible() {
      try {
        return !!this.layerVisibility.grid;
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.isGridVisible failed', 'LayerState.isGridVisible', { error: e }); } catch (ignore) {}
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
        try { this.errorHandler.logWarning('LayerState.setHeatmapVisible failed', 'LayerState.setHeatmapVisible', { error: e }); } catch (ignore) {}
      }
    }

    isHeatmapVisible() {
      try {
        return !!this._showGridHeatmap;
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.isHeatmapVisible failed', 'LayerState.isHeatmapVisible', { error: e }); } catch (ignore) {}
        return false;
      }
    }

    // Layer counting
    getVisibleCount() {
      try {
        return Object.values(this.layerVisibility).filter(visible => visible).length;
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.getVisibleCount failed', 'LayerState.getVisibleCount', { error: e }); } catch (ignore) {}
        return 0;
      }
    }

    getTotalCount() {
      try {
        return Object.keys(this.layerVisibility).length;
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.getTotalCount failed', 'LayerState.getTotalCount', { error: e }); } catch (ignore) {}
        return 0;
      }
    }

    getHiddenCount() {
      try {
        return this.getTotalCount() - this.getVisibleCount();
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.getHiddenCount failed', 'LayerState.getHiddenCount', { error: e }); } catch (ignore) {}
        return 0;
      }
    }

    // Layer configuration access
    getLayerConfig(layerKey) {
      try {
        return this.layerConfig[layerKey] || {};
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.getLayerConfig failed', 'LayerState.getLayerConfig', { error: e }); } catch (ignore) {}
        return {};
      }
    }

    setLayerConfig(layerKey, config) {
      try {
        this.layerConfig[layerKey] = { ...config };
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.setLayerConfig failed', 'LayerState.setLayerConfig', { error: e }); } catch (ignore) {}
      }
    }

    getMaxMarkers(layerKey) {
      try {
        const config = this.getLayerConfig(layerKey);
        return config.maxMarkers || 0;
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.getMaxMarkers failed', 'LayerState.getMaxMarkers', { error: e }); } catch (ignore) {}
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
        try { this.errorHandler.logWarning('LayerState.setMultipleLayers failed', 'LayerState.setMultipleLayers', { error: e }); } catch (ignore) {}
      }
    }

    // Unified persistence (LayerState)
    saveToStorage() {
      try {
        const key = (this.config?.STORAGE_KEYS?.LAYER_STATE) || 'mp4_layerState';
        const payload = { 
          layerVisibility: { ...this.layerVisibility }, 
          showGridHeatmap: this._showGridHeatmap 
        };
        
        // Check consent FIRST — only save if consent granted
        if (this.storage && typeof this.storage.hasConsent === 'function') {
          if (!this.storage.hasConsent()) {
            return; // No consent — silently return
          }
        }
        
        this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_STARTED, { entity: 'layerState' });

        let saved = false;
        if (this.storage) {
          try {
            if (typeof this.storage.set === 'function') saved = !!this.storage.set(key, payload);
            else if (typeof this.storage.saveSetting === 'function') saved = !!this.storage.saveSetting(key, payload);
          } catch (e) {
            this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'LayerState.saveToStorage.storageCall');
            saved = false;
          }
        }

        if (saved) {
          this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_COMPLETED, { entity: 'layerState', layerCount: Object.keys(this.layerVisibility).length, gridHeatmapVisible: this._showGridHeatmap });
        } else {
          this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_FAILED, { entity: 'layerState', error: 'storage.save returned false or consent denied' });
        }
      } catch (e) {
        try { 
          this.errorHandler?.logError?.(e, 'LayerState.saveToStorage');
          this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_FAILED, { 
            entity: 'layerState',
            error: e.message
          });
        } catch (ignore) {}
      }
    }

    loadFromStorage() {
      try {
        const key = (this.config?.STORAGE_KEYS?.LAYER_STATE) || 'mp4_layer_state';
        let data = null;
        if (this.storage && typeof this.storage.get === 'function') {
          data = this.storage.get(key);
        }
        if (data && typeof data === 'object') {
          if (data.layerVisibility && typeof data.layerVisibility === 'object') {
            this.layerVisibility = { ...this.layerVisibility, ...data.layerVisibility };
          }
          if (typeof data.showGridHeatmap === 'boolean') this._showGridHeatmap = data.showGridHeatmap;
          return true;
        }
        return false;
      } catch (e) {
        try { this.errorHandler?.logError?.(e, 'LayerState.loadFromStorage'); } catch (ignore) {}
        return false;
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
        try { this.errorHandler.logWarning('LayerState.reset failed', 'LayerState.reset', { error: e }); } catch (ignore) {}
      }
    }

    // Utility methods
    hasLayer(layerKey) {
      try {
        return layerKey in this.layerVisibility;
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.hasLayer failed', 'LayerState.hasLayer', { error: e }); } catch (ignore) {}
        return false;
      }
    }

    addLayer(layerKey, visible = true) {
      try {
        if (layerKey && typeof layerKey === 'string' && !this.hasLayer(layerKey)) {
          this.layerVisibility[layerKey] = !!visible;
        }
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.addLayer failed', 'LayerState.addLayer', { error: e }); } catch (ignore) {}
      }
    }

    removeLayer(layerKey) {
      try {
        delete this.layerVisibility[layerKey];
        delete this.layerConfig[layerKey];
      } catch (e) {
        try { this.errorHandler.logWarning('LayerState.removeLayer failed', 'LayerState.removeLayer', { error: e }); } catch (ignore) {}
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.LayerState = LayerState;
  }

})(typeof window !== 'undefined' ? window : global);

