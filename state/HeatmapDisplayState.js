// state/HeatmapDisplayState.js
// Manages heatmap display settings as a fully independent system

(function (global) {
  class HeatmapDisplayState extends BaseStateManager {
    /**
     * Creates a new HeatmapDisplayState for managing heatmap visibility independently
     * @param {Object} config - Configuration object (defaults to global MP4Config)
     * @param {Object} options - Options object with eventBus and errorHandler (defaults to window.eventBus)
     */
    constructor(config, options = {}) {
      super(config, options);

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
        this.errorHandler && console.debug('HeatmapDisplayState.isVisible failed', 'HeatmapDisplayState.isVisible', { error: e });
        return false;
      }
    }

    /**
     * Set heatmap visibility and emit change event
     * @param {boolean} visible - Whether heatmap should be visible
     */
    setVisible(visible) {
      try {
        visible = !!visible;
        if (this._heatmapVisible === visible) return; // No change
        
        this._heatmapVisible = visible;
        
        // Emit event for subscribers (UI updates, rendering)
        if (this.eventBus && window.EventTypes && window.EventTypes.HEATMAP_VISIBILITY_CHANGED) {
          try {
            this.eventBus.emit(window.EventTypes.HEATMAP_VISIBILITY_CHANGED, {
              visible: visible,
              triggeredBy: 'heatmap-display-state'
            });
          } catch (e) {
            this.errorHandler && console.debug('HeatmapDisplayState: Failed to emit HEATMAP_VISIBILITY_CHANGED', 'HeatmapDisplayState.setVisible.emit', { error: e });
          }
        }
      } catch (e) {
        this.errorHandler && console.debug('HeatmapDisplayState.setVisible failed', 'HeatmapDisplayState.setVisible', { error: e });
      }
    }

    /**
     * Toggle heatmap visibility
     * @returns {boolean} New visibility state
     */
    toggle() {
      try {
        this.setVisible(!this._heatmapVisible);
        return this._heatmapVisible;
      } catch (e) {
        this.errorHandler && console.debug('HeatmapDisplayState.toggle failed', 'HeatmapDisplayState.toggle', { error: e });
        return this._heatmapVisible;
      }
    }

    /**
     * Load heatmap visibility from storage
     * @param {Object} storageService - Storage service for loading persisted state
     * @returns {boolean} Loaded visibility state
     */
    loadFromStorage(storageService) {
      try {
        if (!storageService) return this._heatmapVisible;
        
        const stored = storageService.loadSetting(this.config.STORAGE_KEYS?.GRID_HEATMAP);
        const loaded = stored === '1' || stored === 1 || stored === true;
        this._heatmapVisible = loaded;
        return loaded;
      } catch (e) {
        this.errorHandler && console.debug('HeatmapDisplayState.loadFromStorage failed', 'HeatmapDisplayState.loadFromStorage', { error: e });
        return this._heatmapVisible;
      }
    }

    /**
     * Save heatmap visibility to storage
     * @param {Object} storageService - Storage service for persisting state
     */
    saveToStorage(storageService) {
      try {
        if (!storageService) return;
        
        storageService.saveSetting(
          this.config.STORAGE_KEYS?.GRID_HEATMAP,
          this._heatmapVisible ? '1' : '0'
        );
      } catch (e) {
        this.errorHandler && console.debug('HeatmapDisplayState.saveToStorage failed', 'HeatmapDisplayState.saveToStorage', { error: e });
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

