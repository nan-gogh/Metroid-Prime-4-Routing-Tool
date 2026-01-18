// state/SelectionState.js
// Manages marker selection state

(function (global) {
  class SelectionState extends BaseStateManager {
    constructor(config, options = {}) {
      super(config, options);
      this.selectedMarker = null;
      this.selectedMarkerLayer = null;
      this.multiSelectedMarkers = new Set(); // For future multi-selection support
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
        this.errorHandler.logDebug('SelectionState.setSelectedMarker failed', 'SelectionState.setSelectedMarker', { error: e });
      }
    }

    clearSelectedMarker() {
      try {
        this.selectedMarker = null;
        this.selectedMarkerLayer = null;
        this._emitChange(window.EventTypes.SELECTION_CLEARED);
      } catch (e) {
        this.errorHandler.logDebug('SelectionState.clearSelectedMarker failed', 'SelectionState.clearSelectedMarker', { error: e });
      }
    }

    isMarkerSelected(marker, layerKey) {
      try {
        return this.selectedMarker &&
               this.selectedMarkerLayer === layerKey &&
               this.selectedMarker.uid === marker.uid;
      } catch (e) {
        this.errorHandler.logDebug('SelectionState.isMarkerSelected failed', 'SelectionState.isMarkerSelected', { error: e });
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
        this.errorHandler.logDebug('SelectionState.addToMultiSelection failed', 'SelectionState.addToMultiSelection', { error: e });
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
        this.errorHandler.logDebug('SelectionState.removeFromMultiSelection failed', 'SelectionState.removeFromMultiSelection', { error: e });
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
        this.errorHandler.logDebug('SelectionState.clearMultiSelection failed', 'SelectionState.clearMultiSelection', { error: e });
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
        this.errorHandler.logDebug('SelectionState.isInMultiSelection failed', 'SelectionState.isInMultiSelection', { error: e });
        return false;
      }
    }

    getMultiSelectedCount() {
      return this.multiSelectedMarkers.size;
    }

    // State persistence (consent-gated)
    saveToStorage() {
      try {
        if (window.storageService) {
          const state = {
            selectedMarker: this.selectedMarker ? {
              uid: this.selectedMarker.uid,
              x: this.selectedMarker.x,
              y: this.selectedMarker.y
            } : null,
            selectedMarkerLayer: this.selectedMarkerLayer,
            multiSelectedMarkers: Array.from(this.multiSelectedMarkers)
          };
          window.storageService.set(this.config.STORAGE_KEYS.SELECTION_STATE, state);
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const state = {
              selectedMarker: this.selectedMarker ? {
                uid: this.selectedMarker.uid,
                x: this.selectedMarker.x,
                y: this.selectedMarker.y
              } : null,
              selectedMarkerLayer: this.selectedMarkerLayer,
              multiSelectedMarkers: Array.from(this.multiSelectedMarkers)
            };
            localStorage.setItem('mp4_selection_state', JSON.stringify(state));
          }
        }
      } catch (e) {
        this.errorHandler.logDebug('SelectionState.saveToStorage failed', 'SelectionState.saveToStorage', { error: e });
      }
    }

    loadFromStorage() {
      try {
        if (window.storageService) {
          const state = window.storageService.get(this.config.STORAGE_KEYS.SELECTION_STATE);
          if (state) {
            if (state.selectedMarker && typeof state.selectedMarker === 'object') {
              this.selectedMarker = state.selectedMarker;
            }
            if (typeof state.selectedMarkerLayer === 'string') {
              this.selectedMarkerLayer = state.selectedMarkerLayer;
            }
            if (state.multiSelectedMarkers && Array.isArray(state.multiSelectedMarkers)) {
              this.multiSelectedMarkers = new Set(state.multiSelectedMarkers);
            }
          }
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const saved = localStorage.getItem('mp4_selection_state');
            if (saved) {
              const state = JSON.parse(saved);
              if (state.selectedMarker && typeof state.selectedMarker === 'object') {
                this.selectedMarker = state.selectedMarker;
              }
              if (typeof state.selectedMarkerLayer === 'string') {
                this.selectedMarkerLayer = state.selectedMarkerLayer;
              }
              if (state.multiSelectedMarkers && Array.isArray(state.multiSelectedMarkers)) {
                this.multiSelectedMarkers = new Set(state.multiSelectedMarkers);
              }
            }
          }
        }
      } catch (e) {
        this.errorHandler.logDebug('SelectionState.loadFromStorage failed', 'SelectionState.loadFromStorage', { error: e });
      }
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
      } catch (e) {
        this.errorHandler.logDebug('SelectionState.reset failed', 'SelectionState.reset', { error: e });
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.SelectionState = SelectionState;
  }

})(typeof window !== 'undefined' ? window : global);
