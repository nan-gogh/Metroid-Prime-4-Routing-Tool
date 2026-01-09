// rendering/MarkerRenderer.js
// Minimal scaffold for marker drawing and hit-testing.

(function (global) {
  class MarkerRenderer {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.canvas = map.canvas || null;
      this.ctx = map.ctx || null;
    }

    init() {
      // Prepare any caches
    }

    render() {
      if (typeof this.map.renderMarkers === 'function') this.map.renderMarkers();
    }

    hitTest(x, y) {
      if (typeof this.map.findMarkerAt === 'function') return this.map.findMarkerAt(x, y);
      return null;
    }
  }

  global.MarkerRenderer = MarkerRenderer;
})(window);
