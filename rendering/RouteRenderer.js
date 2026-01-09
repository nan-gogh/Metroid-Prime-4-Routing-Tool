// rendering/RouteRenderer.js
// Minimal scaffold for route rendering and animation control.

(function (global) {
  class RouteRenderer {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
    }

    init() {}

    render() {
      if (typeof this.map.renderRoute === 'function') this.map.renderRoute();
    }
  }

  global.RouteRenderer = RouteRenderer;
})(window);
