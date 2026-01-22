(function (global) {
  class ViewportContext {
    constructor(options = {}) {
      this.zoom = typeof options.zoom === 'number' ? options.zoom : 1;
      this.panX = typeof options.panX === 'number' ? options.panX : 0;
      this.panY = typeof options.panY === 'number' ? options.panY : 0;
      this.canvasWidth = typeof options.canvasWidth === 'number' ? options.canvasWidth : 0;
      this.canvasHeight = typeof options.canvasHeight === 'number' ? options.canvasHeight : 0;
      this.devicePixelRatio = typeof options.devicePixelRatio === 'number' ? options.devicePixelRatio : (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
      this.routeDashOffset = typeof options.routeDashOffset === 'number' ? options.routeDashOffset : 0;
      this.routeLooping = !!options.routeLooping;
    }

    static fromMapState(mapState) {
      if (!mapState) return new ViewportContext();
      // Do not read map-owned animation fallbacks here; RenderPipeline snapshots
      // animation offset from RouteAnimationState and injects it into the
      // viewportContext for each frame. Keep this method focused on view transforms.
      return new ViewportContext({
        zoom: mapState.zoom,
        panX: mapState.panX,
        panY: mapState.panY,
        canvasWidth: mapState.canvasWidth || 0,
        canvasHeight: mapState.canvasHeight || 0,
        devicePixelRatio: mapState.devicePixelRatio || (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
        routeDashOffset: 0,
        routeLooping: !!mapState.routeLooping
      });
    }

    // Convert normalized world coordinates (0..1) to screen pixels
    worldToScreen(normX, normY, mapSize) {
      const ms = mapSize || 8192;
      return {
        x: (normX * ms) * this.zoom + this.panX,
        y: (normY * ms) * this.zoom + this.panY
      };
    }

    // Convert screen pixels to normalized world coordinates (0..1)
    screenToWorld(screenX, screenY, mapSize) {
      const ms = mapSize || 8192;
      return {
        x: (screenX - this.panX) / this.zoom / ms,
        y: (screenY - this.panY) / this.zoom / ms
      };
    }

    getDetailScale() {
      return 1;
    }
  }

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ViewportContext;
  } else if (typeof define === 'function' && define.amd) {
    define([], () => ViewportContext);
  } else {
    global.ViewportContext = ViewportContext;
  }
})(typeof window !== 'undefined' ? window : global);
