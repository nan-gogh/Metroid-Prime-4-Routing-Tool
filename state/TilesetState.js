// state/TilesetState.js
// Manages tileset and display settings

(function (global) {
  class TilesetState extends BaseStateManager {
    constructor(config, options = {}) {
      super(config, options);
      this.tileset = 'sat'; // Default tileset
      this.grayscale = false;
    }

    // Tileset management
    setTileset(tileset) {
      try {
        const validTilesets = ['sat', 'sat_bw', 'holo', 'holo_bw'];
        if (validTilesets.includes(tileset)) {
          this.tileset = tileset;
          this._emitChange(window.EventTypes.TILESET_CHANGED, {
            tileset: tileset,
            triggeredBy: 'tileset-state-change'
          });
        }
      } catch (e) {
        this.errorHandler.logDebug('TilesetState.setTileset failed', 'TilesetState.setTileset', { error: e });
      }
    }

    setGrayscale(enabled) {
      try {
        this.grayscale = !!enabled;
        this._emitChange(window.EventTypes.TILESET_GRAYSCALE_CHANGED, {
          grayscale: this.grayscale,
          triggeredBy: 'grayscale-state-change'
        });
      } catch (e) {
        this.errorHandler.logDebug('TilesetState.setGrayscale failed', 'TilesetState.setGrayscale', { error: e });
      }
    }

    getGrayscale() {
      return this.grayscale;
    }

    getTileset() {
      return this.tileset;
    }

    getTilesetFolder() {
      try {
        const base = String(this.tileset || 'sat');
        return this.grayscale ? `${base}_bw` : base;
      } catch (e) {
        return this.grayscale ? 'sat_bw' : 'sat';
      }
    }

    // State persistence (consent-gated)
    saveToStorage() {
      try {
        if (window.storageService) {
          const state = {
            tileset: this.tileset,
            grayscale: this.grayscale
          };
          window.storageService.set(this.config.STORAGE_KEYS.TILESET_STATE, state);
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const state = {
              tileset: this.tileset,
              grayscale: this.grayscale
            };
            localStorage.setItem('mp4_tileset_state', JSON.stringify(state));
          }
        }
      } catch (e) {
        this.errorHandler.logDebug('TilesetState.saveToStorage failed', 'TilesetState.saveToStorage', { error: e });
      }
    }

    loadFromStorage() {
      try {
        if (window.storageService) {
          const state = window.storageService.get(this.config.STORAGE_KEYS.TILESET_STATE);
          if (state) {
            if (typeof state.tileset === 'string') {
              this.tileset = state.tileset;
            }
            if (typeof state.grayscale === 'boolean') {
              this.grayscale = state.grayscale;
            }
          }
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const saved = localStorage.getItem('mp4_tileset_state');
            if (saved) {
              const state = JSON.parse(saved);
              if (typeof state.tileset === 'string') {
                this.tileset = state.tileset;
              }
              if (typeof state.grayscale === 'boolean') {
                this.grayscale = state.grayscale;
              }
            }
          }
        }
      } catch (e) {
        this.errorHandler.logDebug('TilesetState.loadFromStorage failed', 'TilesetState.loadFromStorage', { error: e });
      }
    }

    // State serialization for debugging/testing
    toJSON() {
      return {
        tileset: this.tileset,
        grayscale: this.grayscale
      };
    }

    // Reset all state
    reset() {
      try {
        this.tileset = 'sat';
        this.grayscale = false;
      } catch (e) {
        this.errorHandler.logDebug('TilesetState.reset failed', 'TilesetState.reset', { error: e });
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.TilesetState = TilesetState;
  }

})(typeof window !== 'undefined' ? window : global);