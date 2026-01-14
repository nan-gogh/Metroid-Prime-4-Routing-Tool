// state/SelectionState.js
// Manages marker selection, edit modes, and layer highlighting state

(function (global) {
  class SelectionState {
    constructor(config) {
      this.config = config || (global.MP4Config || {});
      this.selectedMarker = null;
      this.selectedMarkerLayer = null;
      this.editMarkersMode = false;
      this.editRouteMode = false;
      this.highlightedLayers = new Set();
      this._previousHighlights = new Map(); // layerKey -> wasHighlighted
      this.errorHandler = typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler();
    }

    // Marker selection management
    setSelectedMarker(marker, layerKey) {
      try {
        this.selectedMarker = marker;
        this.selectedMarkerLayer = layerKey || null;
      } catch (e) {
        this.errorHandler.logDebug('SelectionState.setSelectedMarker failed', 'SelectionState.setSelectedMarker', { error: e });
      }
    }

    clearSelectedMarker() {
      try {
        this.selectedMarker = null;
        this.selectedMarkerLayer = null;
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

    // Edit mode management
    setEditMarkersMode(enabled) {
      try {
        if (enabled && this.editRouteMode) {
          // Exit route edit mode first
          this.setEditRouteMode(false);
        }
        this.editMarkersMode = !!enabled;
      } catch (e) {
        this.errorHandler.logDebug('SelectionState.setEditMarkersMode failed', 'SelectionState.setEditMarkersMode', { error: e });
      }
    }

    setEditRouteMode(enabled) {
      try {
        if (enabled && this.editMarkersMode) {
          // Exit markers edit mode first
          this.setEditMarkersMode(false);
        }
        this.editRouteMode = !!enabled;
      } catch (e) {
        this.errorHandler.logDebug('SelectionState.setEditRouteMode failed', 'SelectionState.setEditRouteMode', { error: e });
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

    // Layer highlighting management
    setLayerHighlight(layerKey, highlighted) {
      try {
        if (highlighted) {
          this.highlightedLayers.add(layerKey);
        } else {
          this.highlightedLayers.delete(layerKey);
        }
      } catch (e) {
        this.errorHandler.logDebug('SelectionState.setLayerHighlight failed', 'SelectionState.setLayerHighlight', { error: e });
      }
    }

    toggleLayerHighlight(layerKey) {
      try {
        if (this.highlightedLayers.has(layerKey)) {
          this.highlightedLayers.delete(layerKey);
        } else {
          this.highlightedLayers.add(layerKey);
        }
      } catch (e) {
        this.errorHandler.logDebug('SelectionState.toggleLayerHighlight failed', 'SelectionState.toggleLayerHighlight', { error: e });
      }
    }

    isLayerHighlighted(layerKey) {
      try {
        return this.highlightedLayers.has(layerKey);
      } catch (e) {
        this.errorHandler.logDebug('SelectionState.isLayerHighlighted failed', 'SelectionState.isLayerHighlighted', { error: e });
        return false;
      }
    }

    clearAllHighlights() {
      try {
        this.highlightedLayers.clear();
      } catch (e) {
        this.errorHandler.logDebug('SelectionState.clearAllHighlights failed', 'SelectionState.clearAllHighlights', { error: e });
      }
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
        this.errorHandler.logDebug('SelectionState.enterEditMode failed', 'SelectionState.enterEditMode', { error: e });
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
        this.errorHandler.logDebug('SelectionState.exitEditMode failed', 'SelectionState.exitEditMode', { error: e });
      }
    }

    // State persistence (consent-gated)
    saveToStorage() {
      try {
        if (window.storageService) {
          const state = {
            highlightedLayers: Array.from(this.highlightedLayers),
            editMarkersMode: this.editMarkersMode,
            editRouteMode: this.editRouteMode
          };
          window.storageService.set(this.config.STORAGE_KEYS.SELECTION_STATE, state);
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const state = {
              highlightedLayers: Array.from(this.highlightedLayers),
              editMarkersMode: this.editMarkersMode,
              editRouteMode: this.editRouteMode
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
            if (state.highlightedLayers && Array.isArray(state.highlightedLayers)) {
              this.highlightedLayers = new Set(state.highlightedLayers);
            }
            if (typeof state.editMarkersMode === 'boolean') {
              this.editMarkersMode = state.editMarkersMode;
            }
            if (typeof state.editRouteMode === 'boolean') {
              this.editRouteMode = state.editRouteMode;
            }
          }
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const saved = localStorage.getItem('mp4_selection_state');
            if (saved) {
              const state = JSON.parse(saved);
              if (state.highlightedLayers && Array.isArray(state.highlightedLayers)) {
                this.highlightedLayers = new Set(state.highlightedLayers);
              }
              if (typeof state.editMarkersMode === 'boolean') {
                this.editMarkersMode = state.editMarkersMode;
              }
              if (typeof state.editRouteMode === 'boolean') {
                this.editRouteMode = state.editRouteMode;
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
        selectedMarker: this.selectedMarker ? { uid: this.selectedMarker.uid, x: this.selectedMarker.x, y: this.selectedMarker.y } : null,
        selectedMarkerLayer: this.selectedMarkerLayer,
        editMarkersMode: this.editMarkersMode,
        editRouteMode: this.editRouteMode,
        highlightedLayers: Array.from(this.highlightedLayers)
      };
    }

    // Reset all state
    reset() {
      try {
        this.clearSelectedMarker();
        this.editMarkersMode = false;
        this.editRouteMode = false;
        this.clearAllHighlights();
        this._previousHighlights.clear();
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
