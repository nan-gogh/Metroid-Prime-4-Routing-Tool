// state/HeatmapDisplayState.js
// Manages heatmap display settings as a fully independent system

(function (global) {
  // Shared NOOP handler used when no ErrorHandler is injected
  globalThis.NOOP_ERROR_HANDLER = globalThis.NOOP_ERROR_HANDLER || {
    logDebug: function () {},
    logWarning: function () {},
    logError: function () {}
  };
  class HeatmapDisplayState extends BaseStateManager {
    /**
     * Creates a new HeatmapDisplayState for managing heatmap visibility independently
     * @param {Object} config - Configuration object (defaults to global MP4Config)
    * @param {Object} options - Options object with eventBus and errorHandler (expects `eventBus` via DI)
     */
    constructor(config, options = {}) {
      super(config, options);
      // Default to shared NOOP handler when none provided
      this.errorHandler = options.errorHandler || globalThis.NOOP_ERROR_HANDLER;

      // Internal visibility state - completely independent from layer system
      this._heatmapVisible = false;
    }

    /**
     * Get current heatmap visibility
     * @returns {boolean} True if heatmap is visible
     */
    isVisible() {
      try {
        return !!this._heatmapVisible;
      } catch (e) {
        try { this.errorHandler.logWarning('HeatmapDisplayState.isVisible failed', 'HeatmapDisplayState.isVisible', { error: e }); } catch (ignore) {}
        return false;
      }
    }

    /**
     * Set heatmap visibility and emit change event
     * @param {boolean} visible - Whether heatmap should be visible
     */
    setVisible(visible) {
      const h = this.errorHandler;
      try {
        visible = !!visible;
        if (this._heatmapVisible === visible) return; // No change

        this._heatmapVisible = visible;

        // Emit event for subscribers (UI updates, rendering)
        if (this.eventBus && EventTypes && EventTypes.HEATMAP_VISIBILITY_CHANGED) {
          try {
            this.eventBus.emit(EventTypes.HEATMAP_VISIBILITY_CHANGED, {
              visible: visible,
              triggeredBy: 'heatmap-display-state'
            });
          } catch (e) {
            try { h.logWarning('HeatmapDisplayState: Failed to emit HEATMAP_VISIBILITY_CHANGED', 'HeatmapDisplayState.setVisible.emit', { error: e }); } catch (ignore) {}
          }
        }
      } catch (e) {
        try { h.logWarning('HeatmapDisplayState.setVisible failed', 'HeatmapDisplayState.setVisible', { error: e }); } catch (ignore) {}
      }
    }

    /**
     * Toggle heatmap visibility
     * @returns {boolean} New visibility state
     */
    toggle() {
      const h = this.errorHandler;
      try {
        this.setVisible(!this._heatmapVisible);
        return this._heatmapVisible;
      } catch (e) {
        try { h.logWarning('HeatmapDisplayState.toggle failed', 'HeatmapDisplayState.toggle', { error: e }); } catch (ignore) {}
        return this._heatmapVisible;
      }
    }

    /**
     * Load heatmap visibility from storage
     * @param {Object} storageService - Storage service for loading persisted state
     * @returns {boolean} Loaded visibility state
     */
    loadFromStorage(storageService) {
      const h = this.errorHandler;
      try {
        if (!storageService) return this._heatmapVisible;

        this.eventBus?.emit(EventTypes.STORAGE_LOAD_STARTED, { entity: 'heatmapDisplay' });
        const stored = storageService.loadSetting(this.config.STORAGE_KEYS?.GRID_HEATMAP);
        const loaded = stored === '1' || stored === 1 || stored === true;
        this._heatmapVisible = loaded;
        this.eventBus?.emit(EventTypes.STORAGE_LOAD_COMPLETED, { entity: 'heatmapDisplay' });
        return loaded;
      } catch (e) {
        try { h.logWarning('HeatmapDisplayState.loadFromStorage failed', 'HeatmapDisplayState.loadFromStorage', { error: e }); } catch (ignore) {}
        this.eventBus?.emit(EventTypes.STORAGE_LOAD_FAILED, { entity: 'heatmapDisplay', error: e.message });
        return this._heatmapVisible;
      }
    }

    /**
     * Save heatmap visibility to storage (unified pattern)
     */
    saveToStorage() {
      try {
        if (!this.storage) return;

        const key = (this.config?.STORAGE_KEYS?.GRID_HEATMAP) || 'mp4_grid_heatmap';
        const value = this._heatmapVisible ? '1' : '0';
        
        this.eventBus?.emit(EventTypes.STORAGE_SAVE_STARTED, { entity: 'heatmapDisplay' });
        
        if (typeof this.storage.set === 'function') {
          this.storage.set(key, value);
        }
        
        this.eventBus?.emit(EventTypes.STORAGE_SAVE_COMPLETED, { 
          entity: 'heatmapDisplay',
          visible: this._heatmapVisible
        });
      } catch (e) {
        try { 
          this.errorHandler?.logError?.(e, 'HeatmapDisplayState.saveToStorage');
          this.eventBus?.emit(EventTypes.STORAGE_SAVE_FAILED, { 
            entity: 'heatmapDisplay', 
            error: e.message 
          });
        } catch (ignore) {}
      }
    }

    /**
     * Completely reset state (for testing)
     */
    reset() {
      this._heatmapVisible = false;
    }
  }

  // Export for use in modules
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HeatmapDisplayState;
  }
  global.HeatmapDisplayState = HeatmapDisplayState;
})(typeof window !== 'undefined' ? window : global);

