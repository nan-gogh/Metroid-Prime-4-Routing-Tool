// state/EditModeState.js
// Manages edit mode state (markers and route editing)

(function (global) {
  // Shared NOOP handler for guarded logging when no ErrorHandler is injected
  globalThis.NOOP_ERROR_HANDLER = globalThis.NOOP_ERROR_HANDLER || {
    logDebug: function () {},
    logWarning: function () {},
    logError: function () {}
  };
  class EditModeState extends BaseStateManager {
    /**
     * Creates a new EditModeState for managing edit mode state
     * @param {Object} config - Configuration object (defaults to global MP4Config)
    * @param {Object} options - Options object with eventBus and errorHandler (expects `eventBus` via DI)
     */
    constructor(config, options = {}) {
      super(config, options);
      // default to shared NOOP handler when no errorHandler is injected
      this.errorHandler = options.errorHandler || globalThis.NOOP_ERROR_HANDLER;
      this.editMarkersMode = false;
      this.editRouteMode = false;
      // Injected services (prefer provider when available)
      this.storage = (options && options.storage) ? options.storage : (options && options.storageProvider && typeof options.storageProvider.getInstance === 'function' ? options.storageProvider.getInstance() : null);
      this.storageProvider = options && options.storageProvider ? options.storageProvider : null;
      this.eventBus = options.eventBus || null;
    }

    // Edit mode management
    setEditMarkersMode(enabled) {
      const h = this.errorHandler;
      try {
        // Diagnostic logging reduced to avoid noisy output
        if (enabled && this.editRouteMode) {
          // Exit route edit mode first
          this.setEditRouteMode(false);
        }
        this.editMarkersMode = !!enabled;
        this._emitChange(EventTypes.EDIT_MODE_CHANGED, {
          mode: !!enabled ? 'markers' : null,
          enabled: !!enabled,
          markersEnabled: !!enabled,
          routeEnabled: this.editRouteMode
        });
        // Emitted EDIT_MODE_CHANGED
        
        // Emit enter/exit events for UI effects (layer highlighting)
        if (enabled) {
          this._emitChange(EventTypes.EDIT_MODE_ENTER_REQUESTED, {
            mode: 'customMarkers'
          });
        } else {
          this._emitChange(EventTypes.EDIT_MODE_EXIT_REQUESTED, {
            mode: 'customMarkers'
          });
        }
      } catch (e) {
        try { h.logWarning('EditModeState.setEditMarkersMode failed', 'EditModeState.setEditMarkersMode', { error: e }); } catch (ignore) {}
      }
    }

    setEditRouteMode(enabled) {
      const h = this.errorHandler;
      try {
        // Diagnostic logging reduced to avoid noisy output
        if (enabled && this.editMarkersMode) {
          // Exit markers edit mode first
          this.setEditMarkersMode(false);
        }
        this.editRouteMode = !!enabled;
        this._emitChange(EventTypes.EDIT_MODE_CHANGED, {
          mode: !!enabled ? 'route' : null,
          enabled: !!enabled,
          markersEnabled: this.editMarkersMode,
          routeEnabled: !!enabled
        });
        // Emitted EDIT_MODE_CHANGED
        
        // Emit enter/exit events for UI effects (layer highlighting)
        if (enabled) {
          this._emitChange(EventTypes.EDIT_MODE_ENTER_REQUESTED, {
            mode: 'route'
          });
        } else {
          this._emitChange(EventTypes.EDIT_MODE_EXIT_REQUESTED, {
            mode: 'route'
          });
        }
      } catch (e) {
        try { h.logWarning('EditModeState.setEditRouteMode failed', 'EditModeState.setEditRouteMode', { error: e }); } catch (ignore) {}
      }
    }

    isInEditMode() {
      return this.editMarkersMode || this.editRouteMode;
    }

    getCurrentEditMode() {
      if (this.editMarkersMode) return 'markers';
      if (this.editRouteMode) return 'route';
      return null;
    }

    // Edit mode UI helpers (called by InteractiveMap)
    enterEditMode(layerKey, scale = 2.0) {
      try {
        // Add edit-mode-outline class for editable layers
        const editableLayers = ['route', 'customMarkers', 'greenCrystals'];
        if (editableLayers.includes(layerKey)) {
          const row = document.querySelector('#layerList .layer-toggle[data-layer="' + layerKey + '"]');
          if (row) {
            // Set edit-mode outline color from layer's configured color
            const layerColor = (typeof LAYERS !== 'undefined' && LAYERS && LAYERS[layerKey] && LAYERS[layerKey].color)
              ? LAYERS[layerKey].color : '#a78bfa';
            row.style.setProperty('--edit-mode-outline-color', layerColor);
            row.classList.add('edit-mode-outline');
          }
        }
      } catch (e) {
        try { this.errorHandler.logWarning('EditModeState.enterEditMode failed', 'EditModeState.enterEditMode', { error: e }); } catch (ignore) {}
      }
    }

    exitEditMode(layerKey) {
      try {
        // Remove edit-mode-outline class
        const row = document.querySelector('#layerList .layer-toggle[data-layer="' + layerKey + '"]');
        if (row) {
          row.classList.remove('edit-mode-outline');
          row.style.removeProperty('--edit-mode-outline-color');
        }
      } catch (e) {
        try { this.errorHandler.logWarning('EditModeState.exitEditMode failed', 'EditModeState.exitEditMode', { error: e }); } catch (ignore) {}
      }
    }

    // Unified persistence (EditModeState)
    saveToStorage() {
      try {
        const key = (this.config?.STORAGE_KEYS?.EDIT_MODE_STATE) || 'mp4_editModeState';
        const payload = { editMarkersMode: this.editMarkersMode, editRouteMode: this.editRouteMode };
        const stor = this.storage || (this.storageProvider && typeof this.storageProvider.getInstance === 'function' ? this.storageProvider.getInstance() : null);
        if (typeof storageUtils !== 'undefined' && typeof storageUtils.saveWithEvents === 'function') {
          storageUtils.saveWithEvents(stor, key, payload, this.eventBus, 'editMode', this.errorHandler);
          return;
        }

        // Fallback behavior
        if (stor && typeof stor.hasConsent === 'function') { if (!stor.hasConsent()) return; }
        this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_STARTED, { entity: 'editMode' });
        let saved = false;
        if (stor) { try { if (typeof stor.set === 'function') saved = !!stor.set(key, payload); else if (typeof stor.saveSetting === 'function') saved = !!stor.saveSetting(key, payload); } catch (e) { this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'EditModeState.saveToStorage.storageCall'); saved = false; } }
        if (saved) this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_COMPLETED, { entity: 'editMode', editMarkersMode: this.editMarkersMode, editRouteMode: this.editRouteMode }); else this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_FAILED, { entity: 'editMode', error: 'storage.save returned false or consent denied' });
      } catch (e) { 
        this.errorHandler?.logError?.(e, 'EditModeState.saveToStorage');
        this.eventBus?.emit?.(window.EventTypes?.STORAGE_SAVE_FAILED, { 
          entity: 'editMode',
          error: e.message
        });
      }
    }

    loadFromStorage() {
      try {
        const key = (this.config?.STORAGE_KEYS?.EDIT_MODE_STATE) || 'mp4_edit_mode_state';
        const stor = this.storage || (this.storageProvider && typeof this.storageProvider.getInstance === 'function' ? this.storageProvider.getInstance() : null);
        let data = null;
        if (stor && typeof stor.get === 'function') {
          data = stor.get(key);
        }
        if (data && typeof data === 'object') {
          if (typeof data.editMarkersMode === 'boolean') this.editMarkersMode = data.editMarkersMode;
          if (typeof data.editRouteMode === 'boolean') this.editRouteMode = data.editRouteMode;
          return true;
        }
        return false;
      } catch (e) {
        this.errorHandler?.logError?.(e, 'EditModeState.loadFromStorage');
        return false;
      }
    }



    // State serialization for debugging/testing
    toJSON() {
      return {
        editMarkersMode: this.editMarkersMode,
        editRouteMode: this.editRouteMode
      };
    }

    // Reset all state
    reset() {
      try {
        this.editMarkersMode = false;
        this.editRouteMode = false;
      } catch (e) {
        try { this.errorHandler.logWarning('EditModeState.reset failed', 'EditModeState.reset', { error: e }); } catch (ignore) {}
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.EditModeState = EditModeState;
  }

})(typeof window !== 'undefined' ? window : global);
