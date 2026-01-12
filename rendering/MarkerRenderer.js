// rendering/MarkerRenderer.js
// Minimal scaffold for marker drawing and hit-testing.

(function (global) {
  class MarkerRenderer {
    /**
     * Creates a new MarkerRenderer instance for drawing markers and handling hit detection.
     * @param {Object} map - The map instance that owns this renderer
     * @param {Object} config - Configuration object (defaults to global MP4Config)
     */
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.canvas = map.canvas || null;
      this.ctx = map.ctx || null;
    }

    /**
     * Initializes the marker renderer with size caching for hit-test accuracy.
     * Prepares internal caches to ensure hit detection matches visual rendering.
     */
    init() {
      // Prepare any caches
      this._markerSizeFrame = {};
    }

    /**
     * Renders all visible markers for enabled layers.
     * Draws circular markers with appropriate sizing, colors, and selection highlights.
     * Selected markers get a glowing shadow effect for emphasis.
     */
    render() {
      // Fully migrated marker rendering from map.renderMarkers()
      const map = this.map;
      const ctx = map.ctx;
      if (!ctx) return;
      const cssWidth = map.canvas.clientWidth;
      const cssHeight = map.canvas.clientHeight;
      const entries = Object.entries(LAYERS || {});
      for (let li = 0; li < entries.length; li++) {
        const layerKey = entries[li][0];
        const layer = entries[li][1];
        if (!map.layerVisibility[layerKey]) continue;
        if (!Array.isArray(layer.markers)) continue;
        const color = layer.color || '#888';
        for (let i = 0; i < layer.markers.length; i++) {
          const marker = layer.markers[i];
          const screenX = marker.x * MAP_SIZE * map.zoom + map.panX;
          const screenY = marker.y * MAP_SIZE * map.zoom + map.panY;
          if (screenX < -20 || screenX > cssWidth + 20 || screenY < -20 || screenY > cssHeight + 20) continue;
          const isSelected = map.selectedMarker && map.selectedMarker.uid === marker.uid && map.selectedMarkerLayer === layerKey;
          const size = this.getMarkerRenderSize(marker, layerKey);
          try { const key = (layerKey || '') + '|' + (marker && marker.uid ? String(marker.uid) : String(i)); this._markerSizeFrame[key] = size; } catch (e) {}

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
            } catch (e) { console.debug('MarkerRenderer: failed to draw selection halo', e); }
          }

          try {
            ctx.beginPath();
            ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          } catch (e) { console.debug('MarkerRenderer: failed to draw marker', e); }
        }
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
        const renderSize = MarkerUtils.computeMarkerSize({ 
          zoom: this.map.zoom || 1,
          baseSize: this.map.getMarkerBaseSize()
        });
        const touchPadding = this.map.touchPadding || 4;
        return renderSize + touchPadding;
      } catch (e) { 
        return MP4Config.MARKER_SCALING.baseSize + 4; 
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
            if (typeof last === 'number' && last > 0) return last + (this.map.touchPadding || 0);
          }
        } catch (e) {}
        const base = (typeof this.map.getBaseMarkerRadius === 'function') ? this.map.getBaseMarkerRadius() : 6;
        const detailScale = (typeof this.map.getDetailScale === 'function') ? this.map.getDetailScale() : 1;
        const markerShrinkFactor = (typeof this.map.markerShrinkFactor === 'number') ? this.map.markerShrinkFactor : 0.6;

        let highlighted = false;
        let highlightScale = undefined;
        try {
          if (this.map.highlightedLayers && this.map.highlightedLayers.has(layerKey)) {
            highlighted = true;
            const cfg = (this.map._highlightConfig && this.map._highlightConfig[layerKey]) ? this.map._highlightConfig[layerKey] : null;
            highlightScale = (cfg && typeof cfg.scale === 'number') ? cfg.scale : 2.0;
          }
        } catch (e) {}

        const isSelected = this.map.selectedMarker && marker && this.map.selectedMarker.uid === marker.uid && this.map.selectedMarkerLayer === layerKey;
        const size = (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.computeMarkerRenderSize === 'function') ? MarkerUtils.computeMarkerRenderSize({ baseSize: base, detailScale, markerShrinkFactor, highlighted, highlightScale, highlightScaleMultiplier: this.map.highlightScaleMultiplier, isSelected }) : Math.max(1, (isSelected ? base * 1.3 : base) * 1);
        return size + (this.map.touchPadding || 0);
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
        const zoom = this.map.zoom || 1;
        
        // Check highlight state
        let isHighlighted = false;
        try {
          if (this.map.highlightedLayers && this.map.highlightedLayers.has(layerKey)) {
            isHighlighted = true;
          }
        } catch (e) {}
        
        // Check selection state
        const isSelected = this.map.selectedMarker && marker && this.map.selectedMarker.uid === marker.uid && this.map.selectedMarkerLayer === layerKey;
        
        // Use unified calculator
        return MarkerUtils.computeMarkerSize({
          zoom,
          isHighlighted,
          isSelected,
          baseSize: this.map.getMarkerBaseSize(),
          userScaleMultiplier: this.map.getMarkerUserScaleMultiplier(),
          highlightMultiplier: this.map.getMarkerHighlightMultiplier()
        });
      } catch (e) { 
        return MP4Config.MARKER_SCALING.baseSize; 
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
      const map = this.map;
      const entries = Object.entries(LAYERS || {});
      // Iterate in reverse so later layers (higher in DOM) get priority
      for (let li = entries.length - 1; li >= 0; li--) {
        const layerKey = entries[li][0];
        const layer = entries[li][1];
        if (!map.layerVisibility[layerKey]) continue;
        if (!Array.isArray(layer.markers)) continue;
        for (let i = layer.markers.length - 1; i >= 0; i--) {
          const marker = layer.markers[i];
          const mx = marker.x * MAP_SIZE * map.zoom + map.panX;
          const my = marker.y * MAP_SIZE * map.zoom + map.panY;
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
