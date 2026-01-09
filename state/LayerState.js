// state/LayerState.js
// Simple layer visibility manager

(function (global) {
  class LayerState {
    constructor(layers) {
      this.visibility = {};
      (layers || []).forEach(k => this.visibility[k] = true);
    }

    setVisible(key, visible) { this.visibility[key] = !!visible; }
    isVisible(key) { return !!this.visibility[key]; }
  }

  global.LayerState = LayerState;
})(window);
