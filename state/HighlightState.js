// state/HighlightState.js
// Manages layer highlighting state and configuration

(function (global) {
  // Shared NOOP handler used when no ErrorHandler is injected
  globalThis.NOOP_ERROR_HANDLER = globalThis.NOOP_ERROR_HANDLER || {
    logDebug: function () {},
    logWarning: function () {},
    logError: function () {}
  };
  class HighlightState extends BaseStateManager {
    constructor(config, options = {}) {
      super(config, options);
      // Default to shared NOOP error handler when none provided
      this.errorHandler = options.errorHandler || globalThis.NOOP_ERROR_HANDLER;
      this.highlightedLayers = new Set();
      this.highlightConfig = {}; // layerKey -> { scale }
      this.highlightScaleMultiplier = 1.0;
      this._previousHighlights = new Map(); // layerKey -> wasHighlighted
      this.storage = (options && options.storage) ? options.storage : (options && options.storageProvider && typeof options.storageProvider.getInstance === 'function' ? options.storageProvider.getInstance() : null);
      this.eventBus = options.eventBus || null;
    }

    // Layer highlighting management
    setLayerHighlight(layerKey, scale) {
      const h = this.errorHandler;
      try {
        const wasHighlighted = this.highlightedLayers.has(layerKey);
        this.highlightedLayers.add(layerKey);
        this.highlightConfig[layerKey] = { scale: scale || 2.0 };

        if (!wasHighlighted) {
          this._emitChange(window.EventTypes.LAYER_HIGHLIGHT_CHANGED, {
            layerKey,
            highlighted: true,
            scale: this.highlightConfig[layerKey].scale,
            highlightedLayers: Array.from(this.highlightedLayers)
          });
        }
      } catch (e) {
        try { h.logWarning('HighlightState.setLayerHighlight failed', 'HighlightState.setLayerHighlight', { error: e }); } catch (ignore) {}
      }
    }

    clearLayerHighlight(layerKey) {
      const h = this.errorHandler;
      try {
        const wasHighlighted = this.highlightedLayers.has(layerKey);
        this.highlightedLayers.delete(layerKey);
        delete this.highlightConfig[layerKey];

        if (wasHighlighted) {
          this._emitChange(window.EventTypes.LAYER_HIGHLIGHT_CHANGED, {
            layerKey,
            highlighted: false,
            highlightedLayers: Array.from(this.highlightedLayers)
          });
        }
      } catch (e) {
        try { h.logWarning('HighlightState.clearLayerHighlight failed', 'HighlightState.clearLayerHighlight', { error: e }); } catch (ignore) {}
      }
    }

    toggleLayerHighlight(layerKey) {
      const h = this.errorHandler;
      try {
        if (this.highlightedLayers.has(layerKey)) {
          this.clearLayerHighlight(layerKey);
        } else {
          this.setLayerHighlight(layerKey);
        }
        // Emit a toggled event for consumers who subscribe specifically to toggle actions
        try {
          const highlighted = this.highlightedLayers.has(layerKey);
          this._emitChange(window.EventTypes.LAYER_HIGHLIGHT_TOGGLED, {
            layerKey,
            highlighted,
            highlightedLayers: Array.from(this.highlightedLayers)
          });
        } catch (e) {
          try { h.logWarning('HighlightState.emitToggleChange failed', 'HighlightState.toggleLayerHighlight', { error: e }); } catch (ignore) {}
        }
      } catch (e) {
        try { h.logWarning('HighlightState.toggleLayerHighlight failed', 'HighlightState.toggleLayerHighlight', { error: e }); } catch (ignore) {}
      }
    }

    isLayerHighlighted(layerKey) {
      try {
        return this.highlightedLayers.has(layerKey);
      } catch (e) {
        try { this.errorHandler.logWarning('HighlightState.isLayerHighlighted failed', 'HighlightState.isLayerHighlighted', { error: e }); } catch (ignore) {}
        return false;
      }
    }

    getHighlightScale(layerKey) {
      try {
        const config = this.highlightConfig[layerKey];
        return (config ? config.scale : 1.0) * this.highlightScaleMultiplier;
      } catch (e) {
        try { this.errorHandler.logWarning('HighlightState.getHighlightScale failed', 'HighlightState.getHighlightScale', { error: e }); } catch (ignore) {}
        return 1.0;
      }
    }

    setHighlightScaleMultiplier(multiplier) {
      const h = this.errorHandler;
      try {
        this.highlightScaleMultiplier = Math.max(0.1, Math.min(5.0, multiplier)); // Clamp between 0.1 and 5.0
        this._emitChange(window.EventTypes.LAYER_HIGHLIGHT_MULTIPLIER_CHANGED, {
          multiplier: this.highlightScaleMultiplier
        });
      } catch (e) {
        try { h.logWarning('HighlightState.setHighlightScaleMultiplier failed', 'HighlightState.setHighlightScaleMultiplier', { error: e }); } catch (ignore) {}
      }
    }

    clearAllHighlights() {
      const h = this.errorHandler;
      try {
        const hadHighlights = this.highlightedLayers.size > 0;
        this.highlightedLayers.clear();
        this.highlightConfig = {};

        if (hadHighlights) {
          this._emitChange(window.EventTypes.LAYER_HIGHLIGHT_CHANGED, {
            layerKey: null,
            highlighted: false,
            highlightedLayers: []
          });
        }
      } catch (e) {
        try { h.logWarning('HighlightState.clearAllHighlights failed', 'HighlightState.clearAllHighlights', { error: e }); } catch (ignore) {}
      }
    }

    // Unified persistence (HighlightState)
    saveToStorage() {
      try {
        const key = (this.config?.STORAGE_KEYS?.HIGHLIGHT_STATE) || 'mp4_highlightState';
        const payload = { 
          highlightedLayers: Array.from(this.highlightedLayers), 
          highlightConfig: this.highlightConfig, 
          highlightScaleMultiplier: this.highlightScaleMultiplier 
        };
        
        // Check consent FIRST — only save if consent granted
        if (this.storage && typeof this.storage.hasConsent === 'function') {
          if (!this.storage.hasConsent()) {
            return; // No consent — silently return
          }
        }
        
        this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_STARTED, { entity: 'highlight' });

        let saved = false;
        if (this.storage) {
          try {
            if (typeof this.storage.set === 'function') saved = !!this.storage.set(key, payload);
            else if (typeof this.storage.saveSetting === 'function') saved = !!this.storage.saveSetting(key, payload);
          } catch (e) {
            this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'HighlightState.saveToStorage.storageCall');
            saved = false;
          }
        }

        if (saved) {
          this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_COMPLETED, { entity: 'highlight', highlightedCount: this.highlightedLayers.size });
        } else {
          this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_FAILED, { entity: 'highlight', error: 'storage.save returned false or consent denied' });
        }
      } catch (e) {
        try { 
          this.errorHandler?.logError?.(e, 'HighlightState.saveToStorage');
          this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_FAILED, { 
            entity: 'highlight',
            error: e.message
          });
        } catch (ignore) {}
      }
    }

    loadFromStorage() {
      try {
        const key = (this.config?.STORAGE_KEYS?.HIGHLIGHT_STATE) || 'mp4_highlight_state';
        let data = null;
        if (this.storage && typeof this.storage.get === 'function') {
          data = this.storage.get(key);
        }
        if (data && typeof data === 'object') {
          if (data.highlightedLayers && Array.isArray(data.highlightedLayers)) {
            this.highlightedLayers = new Set(data.highlightedLayers);
          }
          if (data.highlightConfig && typeof data.highlightConfig === 'object') {
            this.highlightConfig = data.highlightConfig;
          }
          if (typeof data.highlightScaleMultiplier === 'number') {
            this.highlightScaleMultiplier = data.highlightScaleMultiplier;
          }
          return true;
        }
        return false;
      } catch (e) {
        try { this.errorHandler?.logError?.(e, 'HighlightState.loadFromStorage'); } catch (ignore) {}
        return false;
      }
    }

    // State serialization for debugging/testing
    toJSON() {
      return {
        highlightedLayers: Array.from(this.highlightedLayers),
        highlightConfig: this.highlightConfig,
        highlightScaleMultiplier: this.highlightScaleMultiplier
      };
    }

    // Reset all state
    reset() {
      try {
        this.highlightedLayers.clear();
        this.highlightConfig = {};
        this.highlightScaleMultiplier = 1.0;
        this._previousHighlights.clear();
      } catch (e) {
        try { this.errorHandler.logWarning('HighlightState.reset failed', 'HighlightState.reset', { error: e }); } catch (ignore) {}
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.HighlightState = HighlightState;
  }

})(typeof window !== 'undefined' ? window : global);
