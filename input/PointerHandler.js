// input/PointerHandler.js
// Minimal scaffold for unified pointer handling (mouse + touch + pen)

(function (global) {
  class PointerHandler {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.bound = false;
    }

    init() {
      if (this.bound) return;
      try {
        const canvas = this.map.canvas;
        if (!canvas) return;
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        canvas.addEventListener('pointerdown', this._onPointerDown);
        canvas.addEventListener('pointermove', this._onPointerMove);
        canvas.addEventListener('pointerup', this._onPointerUp);
        canvas.addEventListener('pointercancel', this._onPointerUp);
        this.bound = true;
      } catch (e) { console.debug('PointerHandler.init failed', e); }
    }

    destroy() {
      try {
        const canvas = this.map.canvas;
        if (!canvas || !this.bound) return;
        canvas.removeEventListener('pointerdown', this._onPointerDown);
        canvas.removeEventListener('pointermove', this._onPointerMove);
        canvas.removeEventListener('pointerup', this._onPointerUp);
        canvas.removeEventListener('pointercancel', this._onPointerUp);
        this.bound = false;
      } catch (e) { console.debug('PointerHandler.destroy failed', e); }
    }

    _onPointerDown(ev) {
      try {
        if (typeof this.map.onPointerDown === 'function') this.map.onPointerDown(ev);
      } catch (e) { console.debug('PointerHandler._onPointerDown', e); }
    }

    _onPointerMove(ev) {
      try {
        if (typeof this.map.onPointerMove === 'function') this.map.onPointerMove(ev);
      } catch (e) { console.debug('PointerHandler._onPointerMove', e); }
    }

    _onPointerUp(ev) {
      try {
        if (typeof this.map.onPointerUp === 'function') this.map.onPointerUp(ev);
      } catch (e) { console.debug('PointerHandler._onPointerUp', e); }
    }
  }

  global.PointerHandler = PointerHandler;
})(window);
