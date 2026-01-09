// rendering/HeatmapRenderer.js
// Minimal scaffold for heatmap rendering module.

(function (global) {
  class HeatmapRenderer {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.canvas = map.canvasHeatmap || null;
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    }

    init() {
      // Setup any offscreen buffers or caches
    }

    render() {
      // Fully migrated heatmap rendering logic (previously in map.renderHeatmap)
      if (!this.ctx || !this.canvas) return;
      try {
        const cssWidth = this.map.canvas.clientWidth;
        const cssHeight = this.map.canvas.clientHeight;
        // Clear previous heatmap
        try { this.ctx.clearRect(0, 0, cssWidth, cssHeight); } catch (e) {}
        if (!this.map._showGridHeatmap) return;
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
        } catch (e) { console.debug('HeatmapRenderer.render: failed to build buckets', e); }

        // Compute maxCount for mapping range
        const counts = buckets.map(b => b.length);
        const maxCount = Math.max(1, ...counts);
        const rangeMin = 1;
        const rangeMax = Math.max(16, maxCount || 16);

        const hmCtx = this.ctx;
        hmCtx.save();
        for (let idx = 0; idx < buckets.length; idx++) {
          const markers = buckets[idx];
          const cnt = markers.length;
          if (!cnt) continue;
          // Normalize and gamma
          const tRaw = Math.min(1, Math.max(0, (cnt - rangeMin) / (rangeMax - rangeMin)));
          const gamma = 0.6;
          const t = Math.pow(tRaw, gamma);
          // Hue mapping
          const hue = Math.round(this.config.HEATMAP.HUE_RANGE.MIN + (this.config.HEATMAP.HUE_RANGE.MAX - this.config.HEATMAP.HUE_RANGE.MIN) * t);
          const sat = 100;
          const light = 55;
          // alpha mapping per cell
          const alphaMin = 0.1; const alphaMax = 1; const steps = 5;
          const ratioForAlpha = Math.min(1, Math.max(0, (cnt - 1) / steps));
          const targetAlpha = Math.max(alphaMin, Math.min(alphaMax, alphaMin + ratioForAlpha * (alphaMax - alphaMin)));
          const perMarkerAlpha = Math.max(0.01, targetAlpha / cnt);

          // Draw per-marker blobs
          for (let m of markers) {
            try {
              const screenX = m.mx * MAP_SIZE * this.map.zoom + this.map.panX;
              const screenY = m.my * MAP_SIZE * this.map.zoom + this.map.panY;
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
            } catch (e) { console.debug('HeatmapRenderer.render: failed to draw marker blob', e); }
          }
        }
        hmCtx.restore();
      } catch (e) { console.debug('HeatmapRenderer.render: non-fatal error', e); }
    }
  }

  global.HeatmapRenderer = HeatmapRenderer;
})(window);
