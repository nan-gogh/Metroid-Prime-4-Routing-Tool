// input/MarkerEditHandler.js
// Marker-specific pointer interactions (selection, deletion, placement)
// Extracted from PointerHandler to improve modularity and maintainability

(function (global) {
  class MarkerEditHandler {
    constructor(mapState, selectionState, editModeState, markerManager, layerVisibility, layerConfig, showTooltip, hideTooltip, checkMarkerHover, config, eventBus, errorHandler) {
      this.mapState = mapState;
      this.selectionState = selectionState;
      this.editModeState = editModeState;
      this.markerManager = markerManager;
      this.layerVisibility = layerVisibility;
      this.layerConfig = layerConfig;
      this.showTooltip = showTooltip;
      this.hideTooltip = hideTooltip;
      this.config = config || (global.MP4Config || {});
      this.eventBus = eventBus || window.eventBus;
      this.eventTypes = window.EventTypes || {};
      this.errorHandler = errorHandler;

      // Bind helper methods
      this._checkMarkerHover = checkMarkerHover ? checkMarkerHover.bind(this) : null;

      // Create fast property accessors
      this._createFastAccessors();
    }

    // Performance optimization: Create fast property accessors
    _createFastAccessors() {
      try {
        // Fast property accessors for hot path (avoids this.map.property lookup)
        Object.defineProperties(this, {
          panX: { get: () => this.mapState.panX },
          panY: { get: () => this.mapState.panY },
          zoom: { get: () => this.mapState.zoom },
          editMarkersMode: { get: () => this.editModeState ? this.editModeState.editMarkersMode : false },
          selectedMarker: {
            get: () => this.selectionState.selectedMarker,
            set: (v) => this.selectionState.selectedMarker = v
          },
          selectedMarkerLayer: {
            get: () => this.selectionState.selectedMarkerLayer,
            set: (v) => this.selectionState.selectedMarkerLayer = v
          }
        });
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('MarkerEditHandler fast accessors failed', 'MarkerEditHandler.constructor.fastAccessors', { error: e });
      }
    }

    // ===== MARKER-SPECIFIC POINTER HANDLING =====

    handleClick(ev, localX, localY, isQuickTap, hit) {
      try {
        // Only handle quick taps
        if (!isQuickTap) return false;

        // Handle marker hit (selection/deletion)
        if (hit) {
          return this._handleMarkerClick(hit, localX, localY);
        }

        // Handle empty space click (placement)
        return this._handleEmptySpaceClick(ev, localX, localY);

      } catch (e) {
        this.errorHandler.logDebug('MarkerEditHandler.handleClick failed', 'MarkerEditHandler.handleClick', { error: e });
        return false;
      }
    }

    // ===== MARKER-SPECIFIC METHODS =====

    _handleMarkerClick(hit, localX, localY) {
      const layerKey = hit.layerKey;

      // Helper determination: deletable layers (custom markers) vs selectable layers
      const isDeletable = !!(LAYERS[layerKey] && LAYERS[layerKey].deletable);
      const isSelectable = !!(LAYERS[layerKey] && (LAYERS[layerKey].selectable !== false));

      if (this.editMarkersMode) {
        // In edit mode: allow deletion (custom markers are editable regardless of flags)
        const isCustom = (layerKey === 'customMarkers');
        if (isDeletable || isCustom) {
          if (this.markerManager) {
            this.markerManager.removeMarker(hit.marker.uid);
            // Refresh hover state after deletion
            this._checkMarkerHover && this._checkMarkerHover(localX, localY);
          }
          return true; // Handled
        }
      } else {
        // Normal mode: selection and tooltip behavior
        if (isSelectable) {
          const uid = hit.marker.uid;
          if (this.selectedMarker && this.selectedMarker.uid === uid && this.selectedMarkerLayer === layerKey) {
            // Deselect
            this.selectedMarker = null;
            this.selectedMarkerLayer = null;
            try { this.hideTooltip(); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'MarkerEditHandler._handleMarkerClick.hideTooltip'); }
            this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
          } else {
            // Select
            this.selectedMarker = hit.marker;
            this.selectedMarkerLayer = layerKey;
            // Compute screen coords for tooltip placement
            const screenX = hit.marker.x * (this.config.MAP_SIZE || 8192) * this.zoom + this.panX;
            const screenY = hit.marker.y * (this.config.MAP_SIZE || 8192) * this.zoom + this.panY;
            this.showTooltip(hit.marker, screenX, screenY, layerKey);
            this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
          }
          return true; // Handled
        }
      }

      return false; // Not handled
    }

    _handleEmptySpaceClick(ev, localX, localY) {
      // If a marker is currently selected, a quick tap anywhere on the
      // map should deselect it (not start a placement). This avoids
      // accidental placement while the user intends to dismiss selection.
      if (this.selectedMarker) {
        this.selectedMarker = null;
        this.selectedMarkerLayer = null;
        try { this.hideTooltip(); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'MarkerEditHandler._handleEmptySpaceClick.hideTooltip'); }
        this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
        return true; // Handled (deselection)
      }

      // Quick tap on empty space - place custom marker
      // Convert to world coordinates (0-1 normalized)
      const worldX = (localX - this.panX) / this.zoom / (this.config.MAP_SIZE || 8192);
      const worldY = (localY - this.panY) / this.zoom / (this.config.MAP_SIZE || 8192);

      // Only place if within map bounds
      if (worldX >= 0 && worldX <= 1 && worldY >= 0 && worldY <= 1) {
        // Do not allow placement when the custom markers layer is hidden
        if (!this.layerVisibility || !this.layerVisibility.customMarkers) {
          return false;
        }

        // Only place markers when edit mode is active
        if (this.editMarkersMode) {
          // Check marker limit before adding
          const maxMarkers = this.layerConfig && this.layerConfig.customMarkers && this.layerConfig.customMarkers.maxMarkers || 50;
          const currentMarkerCount = this.markerManager ? this.markerManager.getCount() : 0;
          if (currentMarkerCount >= maxMarkers) {
            return false; // Silently ignore - could show a message but click handler shouldn't alert
          }

          if (this.markerManager) {
            this.markerManager.addMarker(worldX, worldY);
            // markerManager updates markers and triggers map updates; ensure hover state refresh
            this._checkMarkerHover && this._checkMarkerHover(localX, localY);
          }
          return true; // Handled
        }
      }

      return false; // Not handled
    }
  }

  // Export to global scope
  global.MarkerEditHandler = MarkerEditHandler;

})(this);