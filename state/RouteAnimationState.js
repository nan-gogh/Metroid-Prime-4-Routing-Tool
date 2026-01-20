// state/RouteAnimationState.js
// Manages route animation state and configuration

(function (global) {
  class RouteAnimationState extends BaseStateManager {
    constructor(config, options = {}) {
      super(config, options);

      // Animation state
      this.animationOffset = 0; // px offset for animated dashes
      this.animationFrameId = null; // requestAnimationFrame ID
      this.lastAnimationTime = 0;
      this.animationSpeed = (this.config.ROUTE && this.config.ROUTE.ANIMATION_SPEED) || 100; // pixels per second
      this.lineWidth = (this.config.ROUTE && this.config.ROUTE.LINE_WIDTH) || 3; // base stroke width
      this.animationDirection = 1; // 1 for forward, -1 for reverse
      // Injected services (prefer DI, fall back to globals for compatibility)
      this.storage = (options && options.storage) ? options.storage : (typeof window !== 'undefined' ? window.storageService : null);
      this.eventBus = (options && options.eventBus) ? options.eventBus : (typeof window !== 'undefined' ? window.eventBus : null);
    }

    // Animation offset management
    setAnimationOffset(offset) {
      try {
        this.animationOffset = offset;
        this._emitChange(window.EventTypes.ROUTE_ANIMATION_OFFSET_CHANGED, { offset });
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('RouteAnimationState.setAnimationOffset failed', 'RouteAnimationState.setAnimationOffset', { error: e });
      }
    }

    getAnimationOffset() {
      return this.animationOffset;
    }

    // Animation frame management
    setAnimationFrameId(rafId) {
      try {
        this.animationFrameId = rafId;
        this._emitChange(window.EventTypes.ROUTE_ANIMATION_FRAME_CHANGED, { frameId: rafId });
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('RouteAnimationState.setAnimationFrameId failed', 'RouteAnimationState.setAnimationFrameId', { error: e });
      }
    }

    getAnimationFrameId() {
      return this.animationFrameId;
    }

    clearAnimationFrameId() {
      try {
        if (this.animationFrameId) {
          cancelAnimationFrame(this.animationFrameId);
          this.animationFrameId = null;
          this._emitChange(window.EventTypes.ROUTE_ANIMATION_FRAME_CHANGED, { frameId: null });
        }
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('RouteAnimationState.clearAnimationFrameId failed', 'RouteAnimationState.clearAnimationFrameId', { error: e });
      }
    }

    // Animation timing
    setLastAnimationTime(time) {
      try {
        this.lastAnimationTime = time;
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('RouteAnimationState.setLastAnimationTime failed', 'RouteAnimationState.setLastAnimationTime', { error: e });
      }
    }

    getLastAnimationTime() {
      return this.lastAnimationTime;
    }

    // Animation speed configuration
    setAnimationSpeed(speed) {
      try {
        this.animationSpeed = Math.max(1, speed); // Minimum 1 pixel/second
        this._emitChange(window.EventTypes.ROUTE_ANIMATION_SPEED_CHANGED, { speed: this.animationSpeed });
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('RouteAnimationState.setAnimationSpeed failed', 'RouteAnimationState.setAnimationSpeed', { error: e });
      }
    }

    getAnimationSpeed() {
      return this.animationSpeed;
    }

    // Line width configuration
    setLineWidth(width) {
      try {
        this.lineWidth = Math.max(1, width); // Minimum 1 pixel
        this._emitChange(window.EventTypes.ROUTE_LINE_WIDTH_CHANGED, { width: this.lineWidth });
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('RouteAnimationState.setLineWidth failed', 'RouteAnimationState.setLineWidth', { error: e });
      }
    }

    getLineWidth() {
      return this.lineWidth;
    }

    // Animation direction management
    setAnimationDirection(direction) {
      try {
        this.animationDirection = direction === -1 ? -1 : 1;
        this._emitChange(window.EventTypes.ROUTE_ANIMATION_DIRECTION_CHANGED, { direction: this.animationDirection });
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('RouteAnimationState.setAnimationDirection failed', 'RouteAnimationState.setAnimationDirection', { error: e });
      }
    }

    getAnimationDirection() {
      return this.animationDirection;
    }

    // Animation control
    startAnimation() {
      try {
        this._emitChange(window.EventTypes.ROUTE_ANIMATION_STARTED);
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('RouteAnimationState.startAnimation failed', 'RouteAnimationState.startAnimation', { error: e });
      }
    }

    stopAnimation() {
      try {
        this.clearAnimationFrameId();
        this._emitChange(window.EventTypes.ROUTE_ANIMATION_STOPPED);
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('RouteAnimationState.stopAnimation failed', 'RouteAnimationState.stopAnimation', { error: e });
      }
    }

    isAnimating() {
      return this.animationFrameId !== null;
    }

    // Unified persistence methods — use injected storage when available and emit storage events
    saveToStorage() {
      try {
        const key = this.config && this.config.STORAGE_KEYS ? this.config.STORAGE_KEYS.ROUTE_ANIMATION : 'mp4_route_animation_state';
        const payload = {
          animationSpeed: this.animationSpeed,
          lineWidth: this.lineWidth,
          animationDirection: this.animationDirection
        };

        try {
          this.eventBus && this.eventBus.emit && this.eventBus.emit(window.EventTypes.STORAGE_SAVE_STARTED, { entity: 'routeAnimation' });
        } catch (evErr) {
          /* non-fatal */
        }

        if (this.storage && typeof this.storage.set === 'function') {
          this.storage.set(key, payload);
        } else if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.saveRouteAnimation === 'function') {
          StorageUtils.saveRouteAnimation(payload);
        } else if (typeof localStorage !== 'undefined') {
          // last-resort fallback (consent not checked here because higher-level consent manager should gate calls)
          try { localStorage.setItem(key, JSON.stringify(payload)); } catch (_) {}
        }

        try {
          this.eventBus && this.eventBus.emit && this.eventBus.emit(window.EventTypes.STORAGE_SAVE_COMPLETED, { entity: 'routeAnimation' });
        } catch (evErr) { /* non-fatal */ }
      } catch (e) {
        this.errorHandler && this.errorHandler.logError(e, 'RouteAnimationState.saveToStorage');
        try { this.eventBus && this.eventBus.emit && this.eventBus.emit(window.EventTypes.STORAGE_SAVE_FAILED, { entity: 'routeAnimation', error: e && e.message ? e.message : String(e) }); } catch (__) {}
      }
    }

    loadFromStorage() {
      try {
        const key = this.config && this.config.STORAGE_KEYS ? this.config.STORAGE_KEYS.ROUTE_ANIMATION : 'mp4_route_animation_state';
        let data = null;

        if (this.storage && typeof this.storage.get === 'function') {
          data = this.storage.get(key);
        } else if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.loadRouteAnimation === 'function') {
          data = StorageUtils.loadRouteAnimation();
        } else if (typeof localStorage !== 'undefined') {
          try { const raw = localStorage.getItem(key); data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }
        }

        if (data && typeof data === 'object') {
          if (typeof data.animationSpeed === 'number') this.animationSpeed = data.animationSpeed;
          if (typeof data.lineWidth === 'number') this.lineWidth = data.lineWidth;
          if (typeof data.animationDirection === 'number') this.animationDirection = data.animationDirection;
          return true;
        }
        return false;
      } catch (e) {
        this.errorHandler && this.errorHandler.logError(e, 'RouteAnimationState.loadFromStorage');
        return false;
      }
    }

    // State serialization for debugging/testing
    toJSON() {
      return {
        animationOffset: this.animationOffset,
        animationFrameId: this.animationFrameId,
        lastAnimationTime: this.lastAnimationTime,
        animationSpeed: this.animationSpeed,
        lineWidth: this.lineWidth,
        animationDirection: this.animationDirection,
        isAnimating: this.isAnimating()
      };
    }

    // Reset animation state
    reset() {
      try {
        this.setAnimationOffset(0);
        this.clearAnimationFrameId();
        this.setLastAnimationTime(0);
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('RouteAnimationState.reset failed', 'RouteAnimationState.reset', { error: e });
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.RouteAnimationState = RouteAnimationState;
  }

})(typeof window !== 'undefined' ? window : global);
