// rendering/TooltipManager.js
// Centralized tooltip manager: handles DOM placement, rAF-batched updates, clamping and minimal DOM writes

(function (global) {
  class TooltipManager {
    constructor() {
      this.container = null; // DOM element containing the map
      this.tooltip = null;   // tooltip DOM element
      this._pending = false;
      this._last = { x: null, y: null, content: null, visible: false };
      this._requested = { x: null, y: null, content: null, visible: false };
      this._boundRAF = this._applyPending.bind(this);
    }

    init(container) {
      // TooltipManager uses an injected errorHandler if available; do not use a global instance
      this.errorHandler = this.errorHandler || null;
      
      try {
        this.container = container || document.body;
        // Try to adopt existing tooltip if present
        const existing = document.getElementById('tooltip');
        if (existing) {
          this.tooltip = existing;
        } else {
          this.tooltip = document.createElement('div');
          this.tooltip.id = 'tooltip';
          this.tooltip.style.position = 'absolute';
          this.tooltip.style.pointerEvents = 'none';
          this.tooltip.style.display = 'none';
          this.container.appendChild(this.tooltip);
        }
        // Ensure container is positioned
        try { if (window.getComputedStyle(this.container).position === 'static') this.container.style.position = 'relative'; } catch (e) { if (this.errorHandler && typeof this.errorHandler.logDebug === 'function') { this.errorHandler.logDebug('TooltipManager: getComputedStyle failed', 'TooltipManager.init.getComputedStyle', { message: e.message }); } else if (typeof console !== 'undefined' && console.debug) { console.debug('TooltipManager: getComputedStyle failed', 'TooltipManager.init.getComputedStyle', { message: e.message }); } }
        // Ensure tooltip is inside container
        try { if (this.tooltip.parentElement !== this.container) this.container.appendChild(this.tooltip); } catch (e) { if (this.errorHandler && typeof this.errorHandler.logDebug === 'function') { this.errorHandler.logDebug('TooltipManager: appendChild failed', 'TooltipManager.init.appendChild', { message: e.message }); } else if (typeof console !== 'undefined' && console.debug) { console.debug('TooltipManager: appendChild failed', 'TooltipManager.init.appendChild', { message: e.message }); } }
      } catch (e) { if (this.errorHandler && typeof this.errorHandler.logDebug === 'function') { this.errorHandler.logDebug('TooltipManager.init failed', 'TooltipManager.init', { error: e }); } else if (typeof console !== 'undefined' && console.debug) { console.debug('TooltipManager.init failed', 'TooltipManager.init', { error: e }); } }
    }

    show(content, x, y) {
      this._requested.content = content;
      this._requested.x = x;
      this._requested.y = y;
      this._requested.visible = true;
      this._schedule();
    }

    update(x, y) {
      this._requested.x = x;
      this._requested.y = y;
      this._requested.visible = true;
      this._schedule();
    }

    hide() {
      this._requested.visible = false;
      this._schedule();
    }

    _schedule() {
      if (this._pending) return;
      this._pending = true;
      requestAnimationFrame(this._boundRAF);
    }

    _applyPending() {
      this._pending = false;
      try {
        const req = this._requested;
        const last = this._last;
        // Update content only when changed
        if (req.content !== last.content) {
          this.tooltip.textContent = req.content || '';
          last.content = req.content;
        }
        // Update visibility
        if (req.visible !== last.visible) {
          this.tooltip.style.display = req.visible ? 'block' : 'none';
          last.visible = req.visible;
        }
        // Update position if changed
        if (req.visible && (req.x !== last.x || req.y !== last.y)) {
          this._place(req.x, req.y);
          last.x = req.x; last.y = req.y;
        }
      } catch (e) { if (this.errorHandler && typeof this.errorHandler.logDebug === 'function') { this.errorHandler.logDebug('TooltipManager._applyPending failed', 'TooltipManager._applyPending', { error: e }); } else if (typeof console !== 'undefined' && console.debug) { console.debug('TooltipManager._applyPending failed', 'TooltipManager._applyPending', { error: e }); } }
    }

    _place(x, y) {
      try {
        if (typeof x !== 'number' || typeof y !== 'number') return;
        const parent = this.container;
        let desiredLeft = Math.round(x);
        let desiredTop = Math.round(y);
        // clamp to container bounds with margin
        const margin = 6;
        const tw = this.tooltip.offsetWidth || 120;
        const th = this.tooltip.offsetHeight || 28;
        if (parent) {
          const maxLeft = Math.max(0, parent.clientWidth - tw - margin);
          const maxTop = Math.max(0, parent.clientHeight - th - margin);
          desiredLeft = Math.min(Math.max(desiredLeft, margin), maxLeft);
          desiredTop = Math.min(Math.max(desiredTop, margin), maxTop);
        }
        this.tooltip.style.left = desiredLeft + 'px';
        this.tooltip.style.top = desiredTop + 'px';
      } catch (e) { if (this.errorHandler && typeof this.errorHandler.logDebug === 'function') { this.errorHandler.logDebug('TooltipManager._place failed', 'TooltipManager._place', { error: e }); } else if (typeof console !== 'undefined' && console.debug) { console.debug('TooltipManager._place failed', 'TooltipManager._place', { error: e }); } }
    }
  }

  global.TooltipManager = TooltipManager;
})(window);

