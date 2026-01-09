// state/MapState.js
// Minimal state holder for map view parameters

(function (global) {
  class MapState {
    constructor() {
      this.panX = 0;
      this.panY = 0;
      this.zoom = (global.DEFAULT_ZOOM || 0.1);
    }

    setView(panX, panY, zoom) {
      this.panX = panX; this.panY = panY; this.zoom = zoom;
    }
  }

  global.MapState = MapState;
})(window);
