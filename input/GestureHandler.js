// input/GestureHandler.js
// Minimal scaffold for gestures (pinch, double-tap) - non-invasive layer

(function (global) {
  class GestureHandler {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
    }

    init() {
      // Gesture recognition can be implemented incrementally; for now we rely on PointerHandler + map helpers
    }

    // Example hook used by PointerHandler when detecting multi-pointer gestures
    onPinch(centroid, scale) {
      try {
        if (typeof this.map.onPinch === 'function') this.map.onPinch(centroid, scale);
      } catch (e) { console.debug('GestureHandler.onPinch failed', e); }
    }
  }

  global.GestureHandler = GestureHandler;
})(window);
