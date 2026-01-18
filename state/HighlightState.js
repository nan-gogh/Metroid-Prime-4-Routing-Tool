// state/HighlightState.js
// Manages layer highlighting state and configuration

(function (global) {
  class HighlightState extends BaseStateManager {
    constructor(config, options = {}) {
      super(config, options);
      this.highlightedLayers = new Set();
      this.highlightConfig = {}; // layerKey -> { scale }
      this.highlightScaleMultiplier = 1.0;
      this._previousHighlights = new Map(); // layerKey -> wasHighlighted
    }

    // Layer highlighting management
    setLayerHighlight(layerKey, scale) {
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
        this.errorHandler.logDebug('HighlightState.setLayerHighlight failed', 'HighlightState.setLayerHighlight', { error: e });
      }
    }

    clearLayerHighlight(layerKey) {
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
        this.errorHandler.logDebug('HighlightState.clearLayerHighlight failed', 'HighlightState.clearLayerHighlight', { error: e });
      }
    }

    toggleLayerHighlight(layerKey) {
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
          this.errorHandler.logDebug('HighlightState.emitToggleChange failed', 'HighlightState.toggleLayerHighlight', { error: e });
        }
      } catch (e) {
        this.errorHandler.logDebug('HighlightState.toggleLayerHighlight failed', 'HighlightState.toggleLayerHighlight', { error: e });
      }
    }

    isLayerHighlighted(layerKey) {
      try {
        return this.highlightedLayers.has(layerKey);
      } catch (e) {
        this.errorHandler.logDebug('HighlightState.isLayerHighlighted failed', 'HighlightState.isLayerHighlighted', { error: e });
        return false;
      }
    }

    getHighlightScale(layerKey) {
      try {
        const config = this.highlightConfig[layerKey];
        return (config ? config.scale : 1.0) * this.highlightScaleMultiplier;
      } catch (e) {
        this.errorHandler.logDebug('HighlightState.getHighlightScale failed', 'HighlightState.getHighlightScale', { error: e });
        return 1.0;
      }
    }

    setHighlightScaleMultiplier(multiplier) {
      try {
        this.highlightScaleMultiplier = Math.max(0.1, Math.min(5.0, multiplier)); // Clamp between 0.1 and 5.0
        this._emitChange(window.EventTypes.LAYER_HIGHLIGHT_MULTIPLIER_CHANGED, {
          multiplier: this.highlightScaleMultiplier
        });
      } catch (e) {
        this.errorHandler.logDebug('HighlightState.setHighlightScaleMultiplier failed', 'HighlightState.setHighlightScaleMultiplier', { error: e });
      }
    }

    clearAllHighlights() {
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
        this.errorHandler.logDebug('HighlightState.clearAllHighlights failed', 'HighlightState.clearAllHighlights', { error: e });
      }
    }

    // State persistence (consent-gated)
    saveToStorage() {
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
        this.errorHandler.logDebug('HighlightState.saveToStorage failed', 'HighlightState.saveToStorage', { error: e });
      }
    }

    loadFromStorage() {
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
        this.errorHandler.logDebug('HighlightState.loadFromStorage failed', 'HighlightState.loadFromStorage', { error: e });
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
        this.errorHandler.logDebug('HighlightState.reset failed', 'HighlightState.reset', { error: e });
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.HighlightState = HighlightState;
  }

})(typeof window !== 'undefined' ? window : global);