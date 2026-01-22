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
      // Storage will be obtained via injected provider (`options.storage`) or `storageProvider` when needed
      this.storage = (options && options.storage) ? options.storage : null;
      this.eventBus = options.eventBus || null;
    }

    // Animation offset management
    setAnimationOffset(offset) {
      try {
        this.animationOffset = offset;
        this._emitChange(EventTypes.ROUTE_ANIMATION_OFFSET_CHANGED, { offset });
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
        this._emitChange(EventTypes.ROUTE_ANIMATION_FRAME_CHANGED, { frameId: rafId });
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
          this._emitChange(EventTypes.ROUTE_ANIMATION_FRAME_CHANGED, { frameId: null });
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
        this._emitChange(EventTypes.ROUTE_ANIMATION_SPEED_CHANGED, { speed: this.animationSpeed });
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
        this._emitChange(EventTypes.ROUTE_LINE_WIDTH_CHANGED, { width: this.lineWidth });
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
        this._emitChange(EventTypes.ROUTE_ANIMATION_DIRECTION_CHANGED, { direction: this.animationDirection });
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
        this._emitChange(EventTypes.ROUTE_ANIMATION_STARTED);
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('RouteAnimationState.startAnimation failed', 'RouteAnimationState.startAnimation', { error: e });
      }
    }

    stopAnimation() {
      try {
        this.clearAnimationFrameId();
        this._emitChange(EventTypes.ROUTE_ANIMATION_STOPPED);
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug('RouteAnimationState.stopAnimation failed', 'RouteAnimationState.stopAnimation', { error: e });
      }
    }

    isAnimating() {
      return this.animationFrameId !== null;
    }

    // Unified persistence methods — use StorageService exclusively (RouteAnimationState)
    saveToStorage() {
      try {
        const key = (this.config?.STORAGE_KEYS?.ROUTE_ANIMATION_STATE) || 'mp4_routeAnimationState';
        const payload = {
          animationSpeed: this.animationSpeed,
          lineWidth: this.lineWidth,
          animationDirection: this.animationDirection
        };

        // Check consent FIRST — only save if consent granted
        if (this.storage && typeof this.storage.hasConsent === 'function') {
          if (!this.storage.hasConsent()) {
            return; // No consent — silently return
          }
        }

        this.eventBus?.emit(EventTypes.STORAGE_SAVE_STARTED, { entity: 'routeAnimation' });

        let saved = false;
        if (this.storage) {
          try {
            if (typeof this.storage.set === 'function') saved = !!this.storage.set(key, payload);
            else if (typeof this.storage.saveSetting === 'function') saved = !!this.storage.saveSetting(key, payload);
          } catch (e) {
            this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'RouteAnimationState.saveToStorage.storageCall');
            saved = false;
          }
        }

        if (saved) {
          this.eventBus?.emit(EventTypes.STORAGE_SAVE_COMPLETED, { entity: 'routeAnimation', animationSpeed: this.animationSpeed, lineWidth: this.lineWidth });
        } else {
          this.eventBus?.emit(EventTypes.STORAGE_SAVE_FAILED, { entity: 'routeAnimation', error: 'storage.save returned false or consent denied' });
        }
      } catch (e) {
        this.errorHandler?.logError?.(e, 'RouteAnimationState.saveToStorage');
        this.eventBus?.emit(EventTypes.STORAGE_SAVE_FAILED, { 
          entity: 'routeAnimation', 
          error: e?.message || String(e) 
        });
      }
    }

    loadFromStorage() {
      try {
        const key = (this.config?.STORAGE_KEYS?.ROUTE_ANIMATION_STATE) || 'mp4_routeAnimationState';
        let data = null;

        // Only use injected storage provider for persistence. No global/localStorage fallback.
        if (this.storage && typeof this.storage.get === 'function') {
          data = this.storage.get(key);
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
