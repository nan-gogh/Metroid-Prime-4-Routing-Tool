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

      this.errorHandler = typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler();
    }

    // Animation offset management
    setAnimationOffset(offset) {
      try {
        this.animationOffset = offset;
        this._emitChange(window.EventTypes.ROUTE_ANIMATION_OFFSET_CHANGED, { offset });
      } catch (e) {
        console.debug('RouteAnimationState.setAnimationOffset failed', 'RouteAnimationState.setAnimationOffset', { error: e });
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
        console.debug('RouteAnimationState.setAnimationFrameId failed', 'RouteAnimationState.setAnimationFrameId', { error: e });
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
        console.debug('RouteAnimationState.clearAnimationFrameId failed', 'RouteAnimationState.clearAnimationFrameId', { error: e });
      }
    }

    // Animation timing
    setLastAnimationTime(time) {
      try {
        this.lastAnimationTime = time;
      } catch (e) {
        console.debug('RouteAnimationState.setLastAnimationTime failed', 'RouteAnimationState.setLastAnimationTime', { error: e });
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
        console.debug('RouteAnimationState.setAnimationSpeed failed', 'RouteAnimationState.setAnimationSpeed', { error: e });
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
        console.debug('RouteAnimationState.setLineWidth failed', 'RouteAnimationState.setLineWidth', { error: e });
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
        console.debug('RouteAnimationState.setAnimationDirection failed', 'RouteAnimationState.setAnimationDirection', { error: e });
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
        console.debug('RouteAnimationState.startAnimation failed', 'RouteAnimationState.startAnimation', { error: e });
      }
    }

    stopAnimation() {
      try {
        this.clearAnimationFrameId();
        this._emitChange(window.EventTypes.ROUTE_ANIMATION_STOPPED);
      } catch (e) {
        console.debug('RouteAnimationState.stopAnimation failed', 'RouteAnimationState.stopAnimation', { error: e });
      }
    }

    isAnimating() {
      return this.animationFrameId !== null;
    }

    // State persistence (consent-gated)
    saveToStorage() {
      try {
        if (window.storageService) {
          const state = {
            animationSpeed: this.animationSpeed,
            lineWidth: this.lineWidth
          };
          window.storageService.set(this.config.STORAGE_KEYS.ROUTE_ANIMATION_STATE, state);
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const state = {
              animationSpeed: this.animationSpeed,
              lineWidth: this.lineWidth
            };
            localStorage.setItem('mp4_route_animation_state', JSON.stringify(state));
          }
        }
      } catch (e) {
        console.debug('RouteAnimationState.saveToStorage failed', 'RouteAnimationState.saveToStorage', { error: e });
      }
    }

    loadFromStorage() {
      try {
        if (window.storageService) {
          const state = window.storageService.get(this.config.STORAGE_KEYS.ROUTE_ANIMATION_STATE);
          if (state) {
            if (typeof state.animationSpeed === 'number') {
              this.animationSpeed = state.animationSpeed;
            }
            if (typeof state.lineWidth === 'number') {
              this.lineWidth = state.lineWidth;
            }
          }
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const saved = localStorage.getItem('mp4_route_animation_state');
            if (saved) {
              const state = JSON.parse(saved);
              if (typeof state.animationSpeed === 'number') {
                this.animationSpeed = state.animationSpeed;
              }
              if (typeof state.lineWidth === 'number') {
                this.lineWidth = state.lineWidth;
              }
            }
          }
        }
      } catch (e) {
        console.debug('RouteAnimationState.loadFromStorage failed', 'RouteAnimationState.loadFromStorage', { error: e });
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
        console.debug('RouteAnimationState.reset failed', 'RouteAnimationState.reset', { error: e });
      }
    }

    // State persistence methods
    saveToStorage() {
      try {
        const animationData = {
          animationSpeed: this.animationSpeed,
          lineWidth: this.lineWidth,
          animationDirection: this.animationDirection
        };
        
        if (window.storageService) {
          window.storageService.set(this.config.STORAGE_KEYS?.ROUTE_ANIMATION, animationData);
        } else if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.saveRouteAnimation === 'function') {
          StorageUtils.saveRouteAnimation(animationData);
        }
      } catch (e) {
        console.debug('RouteAnimationState.saveToStorage failed', 'RouteAnimationState.saveToStorage', { error: e });
      }
    }

    loadFromStorage() {
      try {
        let animationData = null;
        
        if (window.storageService) {
          animationData = window.storageService.get(this.config.STORAGE_KEYS?.ROUTE_ANIMATION);
        } else if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.loadRouteAnimation === 'function') {
          animationData = StorageUtils.loadRouteAnimation();
        }
        
        if (animationData && typeof animationData === 'object') {
          if (typeof animationData.animationSpeed === 'number') {
            this.animationSpeed = animationData.animationSpeed;
          }
          if (typeof animationData.lineWidth === 'number') {
            this.lineWidth = animationData.lineWidth;
          }
          if (typeof animationData.animationDirection === 'number') {
            this.animationDirection = animationData.animationDirection;
          }
          return true;
        }
        return false;
      } catch (e) {
        console.debug('RouteAnimationState.loadFromStorage failed', 'RouteAnimationState.loadFromStorage', { error: e });
        return false;
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.RouteAnimationState = RouteAnimationState;
  }

})(typeof window !== 'undefined' ? window : global);
