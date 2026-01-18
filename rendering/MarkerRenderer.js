// rendering/MarkerRenderer.js
// Minimal scaffold for marker drawing and hit-testing.

(function (global) {
  class MarkerRenderer {
    /**
     * Creates a new MarkerRenderer instance for drawing markers and handling hit detection.
     * @param {Object} mapState - The map state manager
     * @param {Object} layerState - The layer state manager
     * @param {Object} selectionState - The selection state manager
     * @param {Object} markerManager - The marker manager for custom markers
     * @param {Object} config - Configuration object (defaults to global MP4Config)
     * @param {Object} layers - Layer configuration object (defaults to global LAYERS)
     * @param {Object} highlightState - The highlight state manager (for marker highlighting)
     */
    constructor(mapState, layerState, selectionState, markerManager, config, layers, highlightState) {
      this.mapState = mapState;
      this.layerState = layerState;
      this.selectionState = selectionState;
      this.markerManager = markerManager;
      this.highlightState = highlightState;
      this.config = config || (global.MP4Config || {});
      this.layers = layers || (global.LAYERS || {});
      this.errorHandler = global.errorHandler;
      // No direct map reference needed - all access through state managers and renderContext
    }

    /**
     * Initializes the marker renderer with size caching for hit-test accuracy.
     * Prepares internal caches to ensure hit detection matches visual rendering.
     */
    init() {
      // Prepare any caches
      this._markerSizeFrame = {};
      // Cache layer keys to avoid repeated Object.entries calls in render()
      this._layerKeyCache = null;
      this._lastLayersRef = null;
    }

    /**
     * Renders all visible markers for enabled layers.
     * Draws circular markers with appropriate sizing, colors, and selection highlights.
     * Selected markers get a glowing shadow effect for emphasis.
     * @param {RenderContext} renderContext - The render context providing canvas access
     */
    render(renderContext) {
      if (!renderContext || !renderContext.ctxMarker) return;

      // Clear marker canvas at start of frame
      const markerCanvas = renderContext.canvasMarker;
      if (markerCanvas) {
        const ctx = renderContext.ctxMarker;
        ctx.clearRect(0, 0, markerCanvas.width, markerCanvas.height);
      }

      // Fully migrated marker rendering from map.renderMarkers()
      const ctx = renderContext.ctxMarker;
      const canvasSize = renderContext.getCanvasSize();
      const cssWidth = canvasSize.width;
      const cssHeight = canvasSize.height;
      
      // Cache layer keys to avoid repeated Object.entries calls
      if (this._lastLayersRef !== LAYERS) {
        this._layerKeyCache = Object.entries(LAYERS || {});
        this._lastLayersRef = LAYERS;
      }
      
      const entries = this._layerKeyCache;
      for (let li = 0; li < entries.length; li++) {
        const layerKey = entries[li][0];
        const layer = entries[li][1];
        if (!this.layerState.isLayerVisible(layerKey)) continue;
        
        // Special handling for customMarkers: use markers from markerManager if available
        let markersToRender = layer.markers;
        if (layerKey === 'customMarkers' && this.markerManager) {
          markersToRender = this.markerManager.getAllMarkers();
        } else if (!Array.isArray(layer.markers)) {
          continue;
        }
        
        const color = layer.color || '#888';
        // Removed verbose debug logging for custom markers rendering
        for (let i = 0; i < markersToRender.length; i++) {
          const marker = markersToRender[i];
          const screenX = marker.x * (this.config.MAP_SIZE || 8192) * this.mapState.zoom + this.mapState.panX;
          const screenY = marker.y * (this.config.MAP_SIZE || 8192) * this.mapState.zoom + this.mapState.panY;
          if (screenX < -20 || screenX > cssWidth + 20 || screenY < -20 || screenY > cssHeight + 20) continue;
          const isSelected = this.selectionState.selectedMarker && this.selectionState.selectedMarker.uid === marker.uid && this.selectionState.selectedMarkerLayer === layerKey;
          const size = this.getMarkerRenderSize(marker, layerKey);
          try { const key = (layerKey || '') + '|' + (marker && marker.uid ? String(marker.uid) : String(i)); this._markerSizeFrame[key] = size; } catch (e) { /* silently ignore cache failures */ }

          if (isSelected) {
            try {
              ctx.save();
              ctx.shadowBlur = Math.max(6, size * 1.5);
              ctx.shadowColor = color;
              ctx.beginPath();
              ctx.arc(screenX, screenY, size + 2, 0, Math.PI * 2);
              ctx.fillStyle = color;
              ctx.fill();
              ctx.restore();
            } catch (e) { this.errorHandler && this.errorHandler.logDebug('MarkerRenderer: failed to draw selection halo', 'MarkerRenderer.render.selectionHalo', { error: e }); }
          }

          try {
            ctx.beginPath();
            ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          } catch (e) { this.errorHandler && this.errorHandler.logDebug('MarkerRenderer: failed to draw marker', 'MarkerRenderer.render.marker', { error: e }); }
        }
      }
    }

    /**
     * Computes marker size based on zoom, highlighting, selection, and configuration.
     * @param {Object} params - Parameters for size calculation
     * @param {number} params.zoom - Current zoom level
     * @param {boolean} params.isHighlighted - Whether marker is highlighted
     * @param {boolean} params.isSelected - Whether marker is selected
     * @param {number} params.baseSize - Base marker size
     * @param {number} params.userScaleMultiplier - User scale multiplier
     * @param {number} params.highlightMultiplier - Highlight multiplier
     * @returns {number} Computed marker size
     */
    computeMarkerSize({ zoom = 1, isHighlighted = false, isSelected = false, baseSize = 4, userScaleMultiplier = 1.0, highlightMultiplier = 2.0 }) {
      try {
        const config = this.config.MARKER_SCALING || {};
        const selectionMultiplier = config.selectionMultiplier || 1.3;
        const zoomShrinkThreshold = config.zoomShrinkThreshold || 0.5;
        const zoomShrinkRate = config.zoomShrinkRate || 0.75;

        // Step 1: Apply zoom scaling
        // Use zoom = 0.1 as reference point where markers show at baseSize
        const referenceZoom = 0.1;
        let zoomScaling;
        if (zoom <= zoomShrinkThreshold) {
          // Normal growth up to zoom = zoomShrinkThreshold
          zoomScaling = Math.max(0.01, zoom) / referenceZoom;
        } else {
          // Behavior beyond zoomShrinkThreshold depends on zoomShrinkRate
          const normalGrowth = Math.max(0.01, zoom) / referenceZoom;
          const maxShrinking = (zoomShrinkThreshold / referenceZoom) * (zoomShrinkThreshold / zoom);
          
          // Linear interpolation between normal growth (rate=0) and maximum shrinking (rate=1)
          zoomScaling = normalGrowth + zoomShrinkRate * (maxShrinking - normalGrowth);
        }
        let size = baseSize * zoomScaling;
        
        // Step 2: Apply user scale multiplier
        size *= userScaleMultiplier;
        
        // Step 3: Apply selection bonus
        if (isSelected) {
          size *= selectionMultiplier;
        }
        
        // Step 4: Apply highlight multiplier (only increases size, never decreases)
        if (isHighlighted) {
          size *= highlightMultiplier;
        }
        
        // Ensure minimum size
        return Math.max(size, 1);
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('MarkerRenderer.computeMarkerSize failed', 'MarkerRenderer.computeMarkerSize', { error: e });
        return baseSize || 4;
      }
    }

    /**
     * Returns the base hit radius used for marker interaction detection.
     * Accounts for zoom scaling, marker shrinking, and touch padding.
     * @returns {number} The computed hit radius in pixels
     */
    getHitRadius() {
      try {
        // Use same size calculation as render size but add touch padding
        const renderSize = this.computeMarkerSize({
          zoom: this.mapState.zoom || 1,
          baseSize: this.config.MARKER_SCALING ? this.config.MARKER_SCALING.baseSize : 4
        });
        const touchPadding = this.config.TOUCH_PADDING || 4;
        return renderSize + touchPadding;
      } catch (e) { 
        return (this.config.MARKER_SCALING ? this.config.MARKER_SCALING.baseSize : 4) + 4; 
      }
    }

    /**
     * Computes the precise hit radius for a specific marker, accounting for highlighting and selection.
     * Uses cached render size when available to ensure hit detection matches visual appearance.
     * @param {Object} marker - The marker object to compute radius for
     * @param {string} layerKey - The layer key the marker belongs to
     * @returns {number} The computed hit radius in pixels including touch padding
     */
    getMarkerHitRadius(marker, layerKey) {
      try {
        // Prefer per-frame rendered size cache when available to guarantee hitbox == visual
        try {
          if (this._markerSizeFrame && marker && marker.uid) {
            const key = (layerKey || '') + '|' + String(marker.uid);
            const last = this._markerSizeFrame[key];
            if (typeof last === 'number' && last > 0) return last + (this.config.TOUCH_PADDING || 0);
          }
        } catch (e) { this.errorHandler.logError('MarkerRenderer.getMarkerHitRadius: Failed to get cached size:', 'function', e); }
        const base = this.config.MARKER_SCALING ? this.config.MARKER_SCALING.baseSize : 6;
        const detailScale = 1; // Static detail scale - zoom scaling is handled in computeMarkerSize
        const markerShrinkFactor = 0.6; // Default, could be from config

        let highlighted = false;
        let highlightScale = undefined;
        try {
          // Check highlight state from HighlightState, not layerState
          if (this.highlightState && this.highlightState.highlightedLayers && this.highlightState.highlightedLayers.has(layerKey)) {
            highlighted = true;
            const cfg = (this.highlightState.highlightConfig && this.highlightState.highlightConfig[layerKey]) ? this.highlightState.highlightConfig[layerKey] : null;
            highlightScale = (cfg && typeof cfg.scale === 'number') ? cfg.scale : 2.0;
          }
        } catch (e) { this.errorHandler.logError('MarkerRenderer.getMarkerHitRadius: Failed to check highlight state:', 'function', e); }

        const isSelected = this.selectionState.selectedMarker && marker && this.selectionState.selectedMarker.uid === marker.uid && this.selectionState.selectedMarkerLayer === layerKey;
        const size = this.computeMarkerSize({
          baseSize: base,
          zoom: detailScale,
          isHighlighted: highlighted,
          isSelected: isSelected,
          highlightMultiplier: highlightScale || (this.config.MARKER_SCALING ? this.config.MARKER_SCALING.highlightMultiplier : 2.0)
        });
        return size + (this.config.TOUCH_PADDING || 0);
      } catch (e) {
        return this.getHitRadius();
      }
    }

    /**
     * Computes the visual render size for a marker, accounting for zoom, highlighting, and selection.
     * Ensures hit detection and visual rendering use consistent sizing calculations.
     * @param {Object} marker - The marker object to compute size for
     * @param {string} layerKey - The layer key the marker belongs to
     * @returns {number} The computed render size in pixels
     */
    getMarkerRenderSize(marker, layerKey) {
      try {
        // Get current zoom
        const zoom = this.mapState.zoom || 1;
        
        // Check highlight state from HighlightState (via highlightState, not layerState)
        let isHighlighted = false;
        try {
          if (this.highlightState && this.highlightState.highlightedLayers && this.highlightState.highlightedLayers.has(layerKey)) {
            isHighlighted = true;
          }
        } catch (e) { this.errorHandler.logError('MarkerRenderer.getMarkerRenderSize: Failed to check highlight state:', 'function', e); }
        
        // Check selection state
        const isSelected = this.selectionState.selectedMarker && marker && this.selectionState.selectedMarker.uid === marker.uid && this.selectionState.selectedMarkerLayer === layerKey;
        
        // Use unified calculator
        return this.computeMarkerSize({
          zoom,
          isHighlighted,
          isSelected,
          baseSize: this.config.MARKER_SCALING ? this.config.MARKER_SCALING.baseSize : 4,
          userScaleMultiplier: this.config.MARKER_SCALING ? this.config.MARKER_SCALING.userScaleMultiplier : 1.0,
          highlightMultiplier: this.config.MARKER_SCALING ? this.config.MARKER_SCALING.highlightMultiplier : 2.0
        });
      } catch (e) { 
        return this.config.MARKER_SCALING ? this.config.MARKER_SCALING.baseSize : 4; 
      }
    }

    /**
     * Finds the topmost marker at the specified screen coordinates.
     * Iterates through layers in reverse order (later layers have priority) and
     * checks each marker's hit radius to find intersections.
     * @param {number} screenX - The screen X coordinate to test
     * @param {number} screenY - The screen Y coordinate to test
     * @returns {Object|null} Object containing {marker, index, layerKey} or null if no marker found
     */
    findMarkerAt(screenX, screenY) {
      const entries = Object.entries(LAYERS || {});
      // Iterate in reverse so later layers (higher in DOM) get priority
      for (let li = entries.length - 1; li >= 0; li--) {
        const layerKey = entries[li][0];
        const layer = entries[li][1];
        if (!this.layerState.isLayerVisible(layerKey)) continue;
        if (!Array.isArray(layer.markers)) continue;
        for (let i = layer.markers.length - 1; i >= 0; i--) {
          const marker = layer.markers[i];
          const mx = marker.x * (this.config.MAP_SIZE || 8192) * this.mapState.zoom + this.mapState.panX;
          const my = marker.y * (this.config.MAP_SIZE || 8192) * this.mapState.zoom + this.mapState.panY;
          const r = this.getMarkerHitRadius(marker, layerKey);
          if (Math.hypot(screenX - mx, screenY - my) < r) {
            return { marker: marker, index: i, layerKey };
          }
        }
      }
      return null;
    }

    /**
     * Performs hit testing at the specified coordinates (alias for findMarkerAt).
     * @param {number} x - The X coordinate to test
     * @param {number} y - The Y coordinate to test
     * @returns {Object|null} Object containing {marker, index, layerKey} or null if no marker found
     */
    hitTest(x, y) {
      return this.findMarkerAt(x, y);
    }
  }

  global.MarkerRenderer = MarkerRenderer;
})(window);
