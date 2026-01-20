// state/SelectionState.js
// Manages marker selection state

(function (global) {
  // Shared NOOP handler used when no ErrorHandler is injected
  globalThis.NOOP_ERROR_HANDLER = globalThis.NOOP_ERROR_HANDLER || {
    logDebug: function () {},
    logWarning: function () {},
    logError: function () {}
  };
  class SelectionState extends BaseStateManager {
    constructor(config, options = {}) {
      super(config, options);
      // default to shared NOOP handler when no ErrorHandler injected
      this.errorHandler = options.errorHandler || globalThis.NOOP_ERROR_HANDLER;
      this.selectedMarker = null;
      this.selectedMarkerLayer = null;
      this.multiSelectedMarkers = new Set(); // For future multi-selection support

      this.storage = (options && options.storage) ? options.storage : (typeof window !== 'undefined' ? window.storageService : null);
      this.eventBus = (options && options.eventBus) ? options.eventBus : (typeof window !== 'undefined' ? window.eventBus : null);

      // Set up event listeners
      this._setupEventListeners();
    }

    _setupEventListeners() {
      try {
        const EventUtils = (typeof window !== 'undefined' && window.EventUtils) || (typeof global !== 'undefined' && global.EventUtils);
        const EventTypes = (typeof window !== 'undefined' && window.EventTypes) || (typeof global !== 'undefined' && global.EventTypes);
        if (this.eventBus && EventUtils && EventTypes) {
          this._eventManager = EventUtils.createEventManager(this, '_eventUnsubscribers');
          this._eventManager.setup(this.eventBus, [
            {
              event: EventTypes.LAYER_VISIBILITY_CHANGED,
              handler: this._handleLayerVisibilityChanged.bind(this)
            }
          ]);
        }
      } catch (e) {
        try { this.errorHandler.logWarning('SelectionState._setupEventListeners failed', 'SelectionState._setupEventListeners', { error: e }); } catch (ignore) {}
      }
    }

    _handleLayerVisibilityChanged(data) {
      const h = this.errorHandler;
      try {
        if (data && data.layerKey && data.visible === false) {
          // Layer is being turned off - check if we have a selected marker on this layer
          if (this.selectedMarker && this.selectedMarkerLayer === data.layerKey) {
            // Clear the selection since the layer is no longer visible
            this.clearSelectedMarker();
          }

          // Also check multi-selection (for future use)
          const markersToRemove = [];
          this.multiSelectedMarkers.forEach(key => {
            const [layerKey] = key.split(':');
            if (layerKey === data.layerKey) {
              markersToRemove.push(key);
            }
          });

          markersToRemove.forEach(key => {
            this.multiSelectedMarkers.delete(key);
          });

          // Emit change if any multi-selections were removed
          if (markersToRemove.length > 0) {
            this._emitChange(window.EventTypes.MARKER_MULTI_SELECTED, {
              action: 'clear_layer',
              layerKey: data.layerKey,
              removedCount: markersToRemove.length,
              multiSelectedCount: this.multiSelectedMarkers.size
            });
          }
        }
      } catch (e) {
        try { h.logWarning('SelectionState._handleLayerVisibilityChanged failed', 'SelectionState._handleLayerVisibilityChanged', { error: e }); } catch (ignore) {}
      }
    }

    // Marker selection management
    setSelectedMarker(marker, layerKey) {
      try {
        this.selectedMarker = marker;
        this.selectedMarkerLayer = layerKey || null;
        this._emitChange(window.EventTypes.SELECTION_CHANGED, {
          marker: marker,
          layer: layerKey || null
        });
      } catch (e) {
        try { this.errorHandler.logWarning('SelectionState.setSelectedMarker failed', 'SelectionState.setSelectedMarker', { error: e }); } catch (ignore) {}
      }
    }

    clearSelectedMarker() {
      try {
        this.selectedMarker = null;
        this.selectedMarkerLayer = null;
        this._emitChange(window.EventTypes.SELECTION_CLEARED);
      } catch (e) {
        try { this.errorHandler.logWarning('SelectionState.clearSelectedMarker failed', 'SelectionState.clearSelectedMarker', { error: e }); } catch (ignore) {}
      }
    }

    isMarkerSelected(marker, layerKey) {
      try {
        return this.selectedMarker &&
               this.selectedMarkerLayer === layerKey &&
               this.selectedMarker.uid === marker.uid;
      } catch (e) {
        try { this.errorHandler.logWarning('SelectionState.isMarkerSelected failed', 'SelectionState.isMarkerSelected', { error: e }); } catch (ignore) {}
        return false;
      }
    }

    // Multi-selection support (for future use)
    addToMultiSelection(marker, layerKey) {
      try {
        if (marker && layerKey) {
          const key = `${layerKey}:${marker.uid}`;
          this.multiSelectedMarkers.add(key);
          this._emitChange(window.EventTypes.MARKER_MULTI_SELECTED, {
            action: 'add',
            marker: marker,
            layer: layerKey,
            multiSelectedCount: this.multiSelectedMarkers.size
          });
        }
      } catch (e) {
        try { this.errorHandler.logWarning('SelectionState.addToMultiSelection failed', 'SelectionState.addToMultiSelection', { error: e }); } catch (ignore) {}
      }
    }

    removeFromMultiSelection(marker, layerKey) {
      try {
        if (marker && layerKey) {
          const key = `${layerKey}:${marker.uid}`;
          this.multiSelectedMarkers.delete(key);
          this._emitChange(window.EventTypes.MARKER_MULTI_SELECTED, {
            action: 'remove',
            marker: marker,
            layer: layerKey,
            multiSelectedCount: this.multiSelectedMarkers.size
          });
        }
      } catch (e) {
        try { this.errorHandler.logWarning('SelectionState.removeFromMultiSelection failed', 'SelectionState.removeFromMultiSelection', { error: e }); } catch (ignore) {}
      }
    }

    clearMultiSelection() {
      try {
        const hadSelections = this.multiSelectedMarkers.size > 0;
        this.multiSelectedMarkers.clear();
        if (hadSelections) {
          this._emitChange(window.EventTypes.MARKER_MULTI_SELECTED, {
            action: 'clear',
            multiSelectedCount: 0
          });
        }
      } catch (e) {
        try { this.errorHandler.logWarning('SelectionState.clearMultiSelection failed', 'SelectionState.clearMultiSelection', { error: e }); } catch (ignore) {}
      }
    }

    isInMultiSelection(marker, layerKey) {
      try {
        if (marker && layerKey) {
          const key = `${layerKey}:${marker.uid}`;
          return this.multiSelectedMarkers.has(key);
        }
        return false;
      } catch (e) {
        try { this.errorHandler.logWarning('SelectionState.isInMultiSelection failed', 'SelectionState.isInMultiSelection', { error: e }); } catch (ignore) {}
        return false;
      }
    }

    getMultiSelectedCount() {
      return this.multiSelectedMarkers.size;
    }

    // Unified persistence
    saveToStorage() {
      try {
        const key = this.config && this.config.STORAGE_KEYS ? this.config.STORAGE_KEYS.SELECTION_STATE : 'mp4_selection_state';
        const payload = {
          selectedMarker: this.selectedMarker ? { uid: this.selectedMarker.uid, x: this.selectedMarker.x, y: this.selectedMarker.y } : null,
          selectedMarkerLayer: this.selectedMarkerLayer,
          multiSelectedMarkers: Array.from(this.multiSelectedMarkers)
        };
        try { this.eventBus && this.eventBus.emit && this.eventBus.emit(window.EventTypes.STORAGE_SAVE_STARTED, { entity: 'selection' }); } catch (__) {}
        if (this.storage && typeof this.storage.set === 'function') this.storage.set(key, payload);
        else if (typeof localStorage !== 'undefined') { try { localStorage.setItem(key, JSON.stringify(payload)); } catch (__) {} }
        try { this.eventBus && this.eventBus.emit && this.eventBus.emit(window.EventTypes.STORAGE_SAVE_COMPLETED, { entity: 'selection' }); } catch (__) {}
      } catch (e) { try { this.errorHandler.logWarning('SelectionState.saveToStorage failed', 'SelectionState.saveToStorage', { error: e }); } catch (ignore) {} }
    }

    loadFromStorage() {
      try {
        const key = this.config && this.config.STORAGE_KEYS ? this.config.STORAGE_KEYS.SELECTION_STATE : 'mp4_selection_state';
        let data = null;
        if (this.storage && typeof this.storage.get === 'function') data = this.storage.get(key);
        else if (typeof localStorage !== 'undefined') { try { const raw = localStorage.getItem(key); data = raw ? JSON.parse(raw) : null; } catch (__) { data = null; } }
        if (data && typeof data === 'object') {
          if (data.selectedMarker && typeof data.selectedMarker === 'object') this.selectedMarker = data.selectedMarker;
          if (typeof data.selectedMarkerLayer === 'string') this.selectedMarkerLayer = data.selectedMarkerLayer;
          if (data.multiSelectedMarkers && Array.isArray(data.multiSelectedMarkers)) this.multiSelectedMarkers = new Set(data.multiSelectedMarkers);
          return true;
        }
        return false;
      } catch (e) { try { this.errorHandler.logWarning('SelectionState.loadFromStorage failed', 'SelectionState.loadFromStorage', { error: e }); } catch (ignore) {} return false; }
    }

    // State serialization for debugging/testing
    toJSON() {
      return {
        selectedMarker: this.selectedMarker ? {
          uid: this.selectedMarker.uid,
          x: this.selectedMarker.x,
          y: this.selectedMarker.y
        } : null,
        selectedMarkerLayer: this.selectedMarkerLayer,
        multiSelectedMarkers: Array.from(this.multiSelectedMarkers)
      };
    }

    // Reset all state
    reset() {
      try {
        this.clearSelectedMarker();
        this.clearMultiSelection();

        // Clean up event listeners
        if (this._eventManager) {
          this._eventManager.cleanup();
        }
      } catch (e) {
        try { this.errorHandler.logWarning('SelectionState.reset failed', 'SelectionState.reset', { error: e }); } catch (ignore) {}
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.SelectionState = SelectionState;
  }

})(typeof window !== 'undefined' ? window : global);

