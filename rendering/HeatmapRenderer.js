// rendering/HeatmapRenderer.js
// Minimal scaffold for heatmap rendering module.

(function (global) {
  class HeatmapRenderer {
    /**
     * Creates a new HeatmapRenderer instance for rendering green crystal density heatmaps.
     * @param {Object} map - The map instance that owns this renderer
     * @param {Object} config - Configuration object (defaults to global MP4Config)
     */
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.canvas = map.canvasHeatmap || null;
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    }

    /**
     * Initializes the heatmap renderer with offscreen buffer and rendering state.
     * Sets up internal scheduling flags and canvas size tracking for performance optimization.
     */
    init() {
      // Setup an offscreen buffer and internal scheduling flags
      this.offscreenCanvas = null;
      this.offscreenCtx = null;
      this._pendingRender = false;
      this._lastCanvasSize = { w: 0, h: 0, dpr: 1 };
    }

    _ensureBufferSize() {
      try {
        const cssWidth = this.map.canvas.clientWidth;
        const cssHeight = this.map.canvas.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        const pw = Math.max(1, Math.round(cssWidth * dpr));
        const ph = Math.max(1, Math.round(cssHeight * dpr));
        if (!this.offscreenCanvas || this.offscreenCanvas.width !== pw || this.offscreenCanvas.height !== ph) {
          this.offscreenCanvas = document.createElement('canvas');
          this.offscreenCanvas.width = pw;
          this.offscreenCanvas.height = ph;
          this.offscreenCtx = this.offscreenCanvas.getContext('2d');
          // Keep pixel-clean drawing
          try { this.offscreenCtx.imageSmoothingEnabled = true; this.offscreenCtx.imageSmoothingQuality = 'high'; } catch (e) {}
          this._lastCanvasSize = { w: cssWidth, h: cssHeight, dpr };
        }
      } catch (e) { /* ignore */ }
    }

    /**
     * Schedules a throttled render of the green crystal heatmap using requestAnimationFrame.
     * Clears the canvas if heatmap is disabled, otherwise delegates to _renderNow() for actual rendering.
     * Uses offscreen buffering and DPR-aware scaling for crisp rendering at all zoom levels.
     */
    render() {
      // Schedule rAF-based render to throttle heavy work
      if (!this.ctx || !this.canvas) return;
      // Clear visible canvas quickly if heatmap disabled
      try {
        if (!this.map._showGridHeatmap) {
          try { const cssWidth = this.map.canvas.clientWidth; const cssHeight = this.map.canvas.clientHeight; this.ctx.clearRect(0, 0, cssWidth, cssHeight); } catch (e) {}
          return;
        }
      } catch (e) {}

      if (this._pendingRender) return;
      this._pendingRender = true;
      requestAnimationFrame(() => {
        this._pendingRender = false;
        try { this._renderNow(); } catch (e) { console.debug('HeatmapRenderer._renderNow failed', e); }
      });
    }

    _renderNow() {
      try {
        this._ensureBufferSize();
        if (!this.offscreenCtx) return;
        const hmCtx = this.offscreenCtx;
        const cssWidth = this.map.canvas.clientWidth;
        const cssHeight = this.map.canvas.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        const pw = Math.round(cssWidth * dpr);
        const ph = Math.round(cssHeight * dpr);

        // Clear offscreen
        try { hmCtx.clearRect(0, 0, pw, ph); } catch (e) {}

        // Build buckets (coarse 8x8 grid) and draw into offscreen
        const cols = this.config.GRID.COLS, rows = this.config.GRID.ROWS;
        const buckets = new Array(cols * rows);
        for (let i = 0; i < buckets.length; i++) buckets[i] = [];
        try {
          if (typeof LAYERS !== 'undefined') {
            const greenKeys = GREEN_CRYSTAL_LAYERS;
            greenKeys.forEach(k => {
              const layer = LAYERS[k];
              if (layer && Array.isArray(layer.markers)) {
                layer.markers.forEach(m => {
                  const mx = Number(m.x); const my = Number(m.y);
                  if (!isFinite(mx) || !isFinite(my)) return;
                  const cc = Math.min(cols - 1, Math.max(0, Math.floor(mx * cols)));
                  const rr = Math.min(rows - 1, Math.max(0, Math.floor(my * rows)));
                  buckets[rr * cols + cc].push({mx, my});
                });
              }
            });
          }
        } catch (e) { console.debug('HeatmapRenderer._renderNow: failed to build buckets', e); }

        // Compute counts and draw soft radial blobs per marker into offscreen
        const counts = buckets.map(b => b.length);
        const maxCount = Math.max(1, ...counts);
        const rangeMin = 1;
        const rangeMax = Math.max(16, maxCount || 16);

        hmCtx.save();
        // Draw scaled to pixel (use DPR scaling)
        hmCtx.scale(dpr, dpr);
        for (let idx = 0; idx < buckets.length; idx++) {
          const markers = buckets[idx];
          const cnt = markers.length;
          if (!cnt) continue;
          const tRaw = Math.min(1, Math.max(0, (cnt - rangeMin) / (rangeMax - rangeMin)));
          const gamma = 0.6;
          const t = Math.pow(tRaw, gamma);
          const hue = Math.round(this.config.HEATMAP.HUE_RANGE.MIN + (this.config.HEATMAP.HUE_RANGE.MAX - this.config.HEATMAP.HUE_RANGE.MIN) * t);
          const sat = 100; const light = 55;
          const alphaMin = 0.05; const alphaMax = 0.85; const steps = 8;
          const ratioForAlpha = Math.min(1, Math.max(0, (cnt - 1) / steps));
          const targetAlpha = Math.max(alphaMin, Math.min(alphaMax, alphaMin + ratioForAlpha * (alphaMax - alphaMin)));
          const perMarkerAlpha = Math.max(0.01, targetAlpha / cnt);

          for (let m of markers) {
            try {
              const screenX = m.mx * MAP_SIZE * this.map.zoom + this.map.panX;
              const screenY = m.my * MAP_SIZE * this.map.zoom + this.map.panY;
              // offscreen coords use CSS px scaled by DPR, but we drew scaled so use CSS coords
              if (screenX + 2 < 0 || screenX - 2 > cssWidth || screenY + 2 < 0 || screenY - 2 > cssHeight) continue;
              const radius = Math.max(8, Math.round((MAP_SIZE / 8) * this.map.zoom * 0.45));
              const cx = Math.round(screenX);
              const cy = Math.round(screenY);
              const g = hmCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
              g.addColorStop(0.0, `hsla(${hue}, ${sat}%, ${light}%, ${perMarkerAlpha})`);
              g.addColorStop(0.5, `hsla(${hue}, ${sat}%, ${light}%, ${Math.max(0.02, perMarkerAlpha * 0.6)})`);
              g.addColorStop(1.0, `hsla(${hue}, ${sat}%, ${light}%, 0)`);
              hmCtx.globalCompositeOperation = 'lighter';
              hmCtx.fillStyle = g;
              hmCtx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
              hmCtx.globalCompositeOperation = 'source-over';
            } catch (e) { /* per-marker failures non-fatal */ }
          }
        }
        hmCtx.restore();

        // Blit offscreen to visible canvas with screen blend to integrate with tiles
        try {
          this.ctx.save();
          try { this.ctx.globalCompositeOperation = 'screen'; } catch (e) {}
          // draw scaled (use DPR-aware drawImage)
          try { this.ctx.drawImage(this.offscreenCanvas, 0, 0, pw, ph, 0, 0, cssWidth, cssHeight); } catch (e) { }
          try { this.ctx.globalCompositeOperation = 'source-over'; } catch (e) {}
          this.ctx.restore();
        } catch (e) { console.debug('HeatmapRenderer._renderNow: blit failed', e); }

      } catch (e) { console.debug('HeatmapRenderer._renderNow: non-fatal error', e); }
    }
  }

  global.HeatmapRenderer = HeatmapRenderer;
})(window);
