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

    // State persistence (consent-gated)
    saveToStorage() {
      const h = this.errorHandler;
      try {
        if (window.storageService) {
          const state = {
            highlightedLayers: Array.from(this.highlightedLayers),
            highlightConfig: this.highlightConfig,
            highlightScaleMultiplier: this.highlightScaleMultiplier
          };
          window.storageService.set(this.config.STORAGE_KEYS.HIGHLIGHT_STATE, state);
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const state = {
              highlightedLayers: Array.from(this.highlightedLayers),
              highlightConfig: this.highlightConfig,
              highlightScaleMultiplier: this.highlightScaleMultiplier
            };
            localStorage.setItem('mp4_highlight_state', JSON.stringify(state));
          }
        }
      } catch (e) {
        try { h.logWarning('HighlightState.saveToStorage failed', 'HighlightState.saveToStorage', { error: e }); } catch (ignore) {}
      }
    }

    loadFromStorage() {
      const h = this.errorHandler;
      try {
        if (window.storageService) {
          const state = window.storageService.get(this.config.STORAGE_KEYS.HIGHLIGHT_STATE);
          if (state) {
            if (state.highlightedLayers && Array.isArray(state.highlightedLayers)) {
              this.highlightedLayers = new Set(state.highlightedLayers);
            }
            if (state.highlightConfig && typeof state.highlightConfig === 'object') {
              this.highlightConfig = state.highlightConfig;
            }
            if (typeof state.highlightScaleMultiplier === 'number') {
              this.highlightScaleMultiplier = state.highlightScaleMultiplier;
            }
          }
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const saved = localStorage.getItem('mp4_highlight_state');
            if (saved) {
              const state = JSON.parse(saved);
              if (state.highlightedLayers && Array.isArray(state.highlightedLayers)) {
                this.highlightedLayers = new Set(state.highlightedLayers);
              }
              if (state.highlightConfig && typeof state.highlightConfig === 'object') {
                this.highlightConfig = state.highlightConfig;
              }
              if (typeof state.highlightScaleMultiplier === 'number') {
                this.highlightScaleMultiplier = state.highlightScaleMultiplier;
              }
            }
          }
        }
      } catch (e) {
        try { h.logWarning('HighlightState.loadFromStorage failed', 'HighlightState.loadFromStorage', { error: e }); } catch (ignore) {}
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
