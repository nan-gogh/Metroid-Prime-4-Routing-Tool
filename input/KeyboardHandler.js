// input/KeyboardHandler.js
// Minimal scaffold for keyboard shortcuts and bindings

(function (global) {
  class KeyboardHandler {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.bound = false;
    }

    init() {
      if (this.bound) return;
      this._onKeyDown = this._onKeyDown.bind(this);
      window.addEventListener('keydown', this._onKeyDown);
      this.bound = true;
    }

    destroy() {
      if (!this.bound) return;
      window.removeEventListener('keydown', this._onKeyDown);
      this.bound = false;
    }

    _onKeyDown(ev) {
      try {
        if (typeof this.map.onKeyDown === 'function') this.map.onKeyDown(ev);
      } catch (e) { console.debug('KeyboardHandler._onKeyDown', e); }
    }
  }

  global.KeyboardHandler = KeyboardHandler;
})(window);
