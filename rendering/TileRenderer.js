// rendering/TileRenderer.js
// Minimal scaffold for tile rendering module. Gradually replace methods from map.js.

(function (global) {
  class TileRenderer {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.canvas = map.canvasTiles || null;
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    }

    init() {
      // Place to initialize caches / preload strategies
    }

    render() {
      // Migrate rendering logic from map.renderTiles()
      const map = this.map;
      const ctxT = map.ctxTiles || map.ctx;
      if (!ctxT) return;
      const cssWidth = (map.canvasTiles || map.canvas).clientWidth;
      const cssHeight = (map.canvasTiles || map.canvas).clientHeight;

      // Clear background and draw honeycomb pattern
      try {
        ctxT.fillStyle = '#041018';
        ctxT.fillRect(0, 0, cssWidth, cssHeight);

        try {
          if (!map._honeycombPatternCanvas) {
            const baseSize = 28;
            const preferred = (map._lowSpec ? Math.round(baseSize * 1.6) : baseSize);
            try { map._createHoneycombPattern(preferred); } catch (e) { console.debug('TileRenderer: _createHoneycombPattern failed', e); }
          }

          if (map._honeycombPatternCanvas) {
            if (!map._honeycombPattern) {
              try { map._honeycombPattern = ctxT.createPattern(map._honeycombPatternCanvas, 'repeat'); } catch (e) { map._honeycombPattern = null; }
            }
            if (map._honeycombPattern) {
              ctxT.save();
              ctxT.fillStyle = map._honeycombPattern;
              ctxT.fillRect(0, 0, cssWidth, cssHeight);
              ctxT.restore();
            }
          }
        } catch (e) { console.debug('TileRenderer: honeycomb fill failed', e); }
      } catch (e) { console.debug('TileRenderer: background fill failed', e); }

      if (map.currentImage) {
        const size = MAP_SIZE * map.zoom;
        try { ctxT.imageSmoothingEnabled = true; ctxT.imageSmoothingQuality = 'high'; } catch (e) {}
        try { ctxT.drawImage(map.currentImage, map.panX, map.panY, size, size); } catch (e) { console.debug('TileRenderer: drawImage failed', e); }
      }
    }

    // Future methods:
    // preloadResolution(), determineBestResolution(), invalidateCache(), setTileset()
  }

  global.TileRenderer = TileRenderer;
})(window);
