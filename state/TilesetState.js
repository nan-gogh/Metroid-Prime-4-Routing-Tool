// state/TilesetState.js
// Manages tileset and display settings

(function (global) {
  // Shared NOOP handler used when no ErrorHandler is injected
  globalThis.NOOP_ERROR_HANDLER = globalThis.NOOP_ERROR_HANDLER || {
    logDebug: function () {},
    logWarning: function () {},
    logError: function () {}
  };
  class TilesetState extends BaseStateManager {
    constructor(config, options = {}) {
      super(config, options);
      // default to shared NOOP handler when no ErrorHandler injected
      this.errorHandler = options.errorHandler || globalThis.NOOP_ERROR_HANDLER;
      this.tileset = 'sat'; // Default tileset
      this.grayscale = false;
      this.storage = (options && options.storage) ? options.storage : (options && options.storageProvider && typeof options.storageProvider.getInstance === 'function' ? options.storageProvider.getInstance() : null);
      this.storageProvider = options && options.storageProvider ? options.storageProvider : null;
      this.eventBus = options.eventBus || null;
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
        try { this.errorHandler.logWarning('TilesetState.setTileset failed', 'TilesetState.setTileset', { error: e }); } catch (ignore) {}
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
        try { this.errorHandler.logWarning('TilesetState.setGrayscale failed', 'TilesetState.setGrayscale', { error: e }); } catch (ignore) {}
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

    // Unified persistence (TilesetState)
    saveToStorage() {
      try {
        const key = (this.config?.STORAGE_KEYS?.TILESET_STATE) || 'mp4_tileset_state';
        const payload = { tileset: this.tileset, grayscale: this.grayscale };
        const stor = this.storage || (this.storageProvider && typeof this.storageProvider.getInstance === 'function' ? this.storageProvider.getInstance() : null);
        if (typeof storageUtils !== 'undefined' && typeof storageUtils.saveWithEvents === 'function') {
          storageUtils.saveWithEvents(stor, key, payload, this.eventBus, 'tileset', this.errorHandler);
          return;
        }

        // Fallback behavior
        if (stor && typeof stor.hasConsent === 'function') { if (!stor.hasConsent()) return; }
        this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_STARTED, { entity: 'tileset' });
        let saved = false;
        if (stor) {
          try { if (typeof stor.set === 'function') saved = !!stor.set(key, payload); else if (typeof stor.saveSetting === 'function') saved = !!stor.saveSetting(key, payload); } catch (e) { this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'TilesetState.saveToStorage.storageCall'); saved = false; }
        }
        if (saved) this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_COMPLETED, { entity: 'tileset', tileset: this.tileset, grayscale: this.grayscale }); else this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_FAILED, { entity: 'tileset', error: 'storage.save returned false or consent denied' });
      } catch (e) {
        try { 
          this.errorHandler?.logError?.(e, 'TilesetState.saveToStorage');
          this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_FAILED, { 
            entity: 'tileset',
            error: e.message
          });
        } catch (ignore) {}
      }
    }

    loadFromStorage() {
      try {
        const key = (this.config?.STORAGE_KEYS?.TILESET_STATE) || 'mp4_tileset_state';
        // Respect consent — skip loads if consent not granted
        const stor = this.storage || (this.storageProvider && typeof this.storageProvider.getInstance === 'function' ? this.storageProvider.getInstance() : null);
        if (stor && typeof stor.hasConsent === 'function') {
          try { if (!stor.hasConsent()) return false; } catch (e) { this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'TilesetState.loadFromStorage.consentCheck'); return false; }
        }

        // Use storageUtils when available
        let data = null;
        if (typeof storageUtils !== 'undefined' && typeof storageUtils.loadWithEvents === 'function') {
          data = storageUtils.loadWithEvents(stor, key, null, this.eventBus, 'tileset', this.errorHandler);
        } else {
          if (stor && typeof stor.get === 'function') data = stor.get(key);
        }

        if (data && typeof data === 'object') {
          if (typeof data.tileset === 'string') this.tileset = data.tileset;
          if (typeof data.grayscale === 'boolean') this.grayscale = data.grayscale;
          return true;
        }
        return false;
      } catch (e) {
        try { this.errorHandler?.logError?.(e, 'TilesetState.loadFromStorage'); } catch (ignore) {}
        return false;
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
        try { this.errorHandler.logWarning('TilesetState.reset failed', 'TilesetState.reset', { error: e }); } catch (ignore) {}
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.TilesetState = TilesetState;
  }

})(typeof window !== 'undefined' ? window : global);
