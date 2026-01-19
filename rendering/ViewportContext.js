// rendering/ViewportContext.js
// Encapsulates current viewport state (zoom, pan, canvas dimensions)
// passed to renderers so they don't need direct access to MapState

(function (global) {
  class ViewportContext {
    /**
     * Encapsulate viewport state for rendering.
     * @param {number} zoom - Current zoom level
     * @param {number} panX - X pan offset in canvas coordinates
     * @param {number} panY - Y pan offset in canvas coordinates
     * @param {number} canvasWidth - Canvas width in CSS pixels
     * @param {number} canvasHeight - Canvas height in CSS pixels
     * @param {number} [devicePixelRatio=1] - Device pixel ratio for HiDPI displays
     */
    constructor(zoom, panX, panY, canvasWidth, canvasHeight, devicePixelRatio = 1) {
      this.zoom = zoom;
      this.panX = panX;
      this.panY = panY;
      this.canvasWidth = canvasWidth;
      this.canvasHeight = canvasHeight;
      this.devicePixelRatio = devicePixelRatio;
    }

    /**
     * Create a ViewportContext from MapState.
     * @param {MapState} mapState
     * @returns {ViewportContext}
     */
    static fromMapState(mapState) {
      if (!mapState) {
        return new ViewportContext(1, 0, 0, 0, 0, 1);
      }
      return new ViewportContext(
        mapState.zoom,
        mapState.panX,
        mapState.panY,
        mapState.canvasWidth,
        mapState.canvasHeight,
        mapState.devicePixelRatio
      );
    }
  }

  // Export for different module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ViewportContext;
  } else if (typeof define === 'function' && define.amd) {
    define([], () => ViewportContext);
  } else {
    global.ViewportContext = ViewportContext;
  }
})(typeof window !== 'undefined' ? window : global);
