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
      // Delegate to map.renderHeatmap() until functionality is migrated
      if (typeof this.map.renderHeatmap === 'function') this.map.renderHeatmap();
    }
  }

  global.HeatmapRenderer = HeatmapRenderer;
})(window);
