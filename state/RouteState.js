// state/RouteState.js
// Manages route data, computation state, animation, and editing state

(function (global) {
  class RouteState {
    constructor(config) {
      this.config = config || (global.MP4Config || {});
      this.currentRoute = null; // array of indices into _routeSources
      this.routeLengthNormalized = 0; // normalized route length (0-1)
      this._routeSources = []; // array of source objects {marker, layerKey}

      // Route computation state
      this._computingRoute = false;
      this._computationProgress = 0; // 0-1 progress indicator

      // Route animation state
      this._routeDashOffset = 0; // px offset for animated dashes
      this._routeRaf = null; // requestAnimationFrame ID
      this._lastRouteAnimTime = 0;
      this._routeAnimationSpeed = (this.config.ROUTE && this.config.ROUTE.ANIMATION_SPEED) || 100; // pixels per second
      this.routeLineWidth = (this.config.ROUTE && this.config.ROUTE.LINE_WIDTH) || 3; // base stroke width

      // Route editing state
      this._routeInsert = null; // insertion state {pointerId, tempIndex, prevSources, prevIndices, prevRouteLooping, hoverMarker, hoverOccupied}
      this.routeLooping = false; // whether route should loop back to start

      // Route preview state
      this._routePreview = null; // preview route data for temporary display
      this.errorHandler = typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler();
    }

    // Route data management
    setRoute(routeIndices, lengthNormalized, routeSources) {
      try {
        this.currentRoute = routeIndices;
        this.routeLengthNormalized = lengthNormalized || 0;
        this._routeSources = routeSources || [];
      } catch (e) {
        this.errorHandler.logDebug('RouteState.setRoute failed', 'RouteState.setRoute', { error: e });
      }
    }

    clearRoute() {
      try {
        this.currentRoute = null;
        this.routeLengthNormalized = 0;
        this._routeSources = [];
        this.clearRoutePreview();
      } catch (e) {
        this.errorHandler.logDebug('RouteState.clearRoute failed', 'RouteState.clearRoute', { error: e });
      }
    }

    getRoute() {
      return this.currentRoute;
    }

    getRouteLength() {
      return this.routeLengthNormalized;
    }

    getRouteLengthPixels(mapSize = 8192) {
      return this.routeLengthNormalized * mapSize;
    }

    getRouteSources() {
      return this._routeSources;
    }

    // Route computation state
    setComputing(isComputing) {
      try {
        this._computingRoute = !!isComputing;
        if (!isComputing) {
          this._computationProgress = 0;
        }
      } catch (e) {
        this.errorHandler.logDebug('RouteState.setComputing failed', 'RouteState.setComputing', { error: e });
      }
    }

    isComputing() {
      return this._computingRoute;
    }

    setComputationProgress(progress) {
      try {
        this._computationProgress = Math.max(0, Math.min(1, progress));
      } catch (e) {
        this.errorHandler.logDebug('RouteState.setComputationProgress failed', 'RouteState.setComputationProgress', { error: e });
      }
    }

    getComputationProgress() {
      return this._computationProgress;
    }

    // Route animation state
    setAnimationOffset(offset) {
      try {
        this._routeDashOffset = offset;
      } catch (e) {
        this.errorHandler.logDebug('RouteState.setAnimationOffset failed', 'RouteState.setAnimationOffset', { error: e });
      }
    }

    getAnimationOffset() {
      return this._routeDashOffset;
    }

    setAnimationFrameId(rafId) {
      try {
        this._routeRaf = rafId;
      } catch (e) {
        this.errorHandler.logDebug('RouteState.setAnimationFrameId failed', 'RouteState.setAnimationFrameId', { error: e });
      }
    }

    getAnimationFrameId() {
      return this._routeRaf;
    }

    setLastAnimationTime(time) {
      try {
        this._lastRouteAnimTime = time;
      } catch (e) {
        this.errorHandler.logDebug('RouteState.setLastAnimationTime failed', 'RouteState.setLastAnimationTime', { error: e });
      }
    }

    getLastAnimationTime() {
      return this._lastRouteAnimTime;
    }

    setAnimationSpeed(speed) {
      try {
        this._routeAnimationSpeed = speed;
      } catch (e) {
        this.errorHandler.logDebug('RouteState.setAnimationSpeed failed', 'RouteState.setAnimationSpeed', { error: e });
      }
    }

    getAnimationSpeed() {
      return this._routeAnimationSpeed;
    }

    setAnimationEnabled(enabled) {
      try {
        if (enabled && !this._routeRaf) {
          // Animation will be started externally
        } else if (!enabled && this._routeRaf) {
          // Animation will be stopped externally
        }
      } catch (e) {
        this.errorHandler.logDebug('RouteState.setAnimationEnabled failed', 'RouteState.setAnimationEnabled', { error: e });
      }
    }

    // Route editing state
    setRouteInsert(insertState) {
      try {
        this._routeInsert = insertState || null;
      } catch (e) {
        this.errorHandler.logDebug('RouteState.setRouteInsert failed', 'RouteState.setRouteInsert', { error: e });
      }
    }

    getRouteInsert() {
      return this._routeInsert;
    }

    clearRouteInsert() {
      try {
        this._routeInsert = null;
      } catch (e) {
        this.errorHandler.logDebug('RouteState.getRouteInsert failed', 'RouteState.getRouteInsert', { error: e });
      }
    }

    setRouteLooping(looping) {
      try {
        this.routeLooping = !!looping;
      } catch (e) {
        this.errorHandler.logDebug('RouteState.setRouteLooping failed', 'RouteState.setRouteLooping', { error: e });
      }
    }

    getRouteLooping() {
      return this.routeLooping;
    }

    // Route preview state
    setRoutePreview(previewRoute) {
      try {
        this._routePreview = previewRoute;
      } catch (e) {
        this.errorHandler.logDebug('RouteState.getRouteLooping failed', 'RouteState.getRouteLooping', { error: e });
      }
    }

    getRoutePreview() {
      return this._routePreview;
    }

    clearRoutePreview() {
      try {
        this._routePreview = null;
      } catch (e) {
        this.errorHandler.logDebug('RouteState.clearRouteInsert failed', 'RouteState.clearRouteInsert', { error: e });
      }
    }

    // State persistence (consent-gated)
    saveToStorage() {
      try {
        if (window.storageService) {
          const state = {
            routeLooping: this.routeLooping,
            routeLineWidth: this.routeLineWidth,
            animationSpeed: this._routeAnimationSpeed
          };
          window.storageService.set(this.config.STORAGE_KEYS.ROUTE_STATE, state);
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const state = {
              routeLooping: this.routeLooping,
              routeLineWidth: this.routeLineWidth,
              animationSpeed: this._routeAnimationSpeed
            };
            localStorage.setItem('mp4_route_state', JSON.stringify(state));
          }
        }
      } catch (e) {
        this.errorHandler.logDebug('RouteState.saveToStorage failed', 'RouteState.saveToStorage', { error: e });
      }
    }

    loadFromStorage() {
      try {
        if (window.storageService) {
          const state = window.storageService.get(this.config.STORAGE_KEYS.ROUTE_STATE);
          if (state) {
            if (typeof state.routeLooping === 'boolean') {
              this.routeLooping = state.routeLooping;
            }
            if (typeof state.routeLineWidth === 'number') {
              this.routeLineWidth = state.routeLineWidth;
            }
            if (typeof state.animationSpeed === 'number') {
              this._routeAnimationSpeed = state.animationSpeed;
            }
          }
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const saved = localStorage.getItem('mp4_route_state');
            if (saved) {
              const state = JSON.parse(saved);
              if (typeof state.routeLooping === 'boolean') {
                this.routeLooping = state.routeLooping;
              }
              if (typeof state.routeLineWidth === 'number') {
                this.routeLineWidth = state.routeLineWidth;
              }
              if (typeof state.animationSpeed === 'number') {
                this._routeAnimationSpeed = state.animationSpeed;
              }
            }
          }
        }
      } catch (e) {
        this.errorHandler.logDebug('RouteState.loadFromStorage failed', 'RouteState.loadFromStorage', { error: e });
      }
    }

    // State serialization for debugging/testing
    toJSON() {
      return {
        currentRoute: this.currentRoute,
        routeLengthNormalized: this.routeLengthNormalized,
        routeSourcesCount: this._routeSources.length,
        computingRoute: this._computingRoute,
        computationProgress: this._computationProgress,
        routeDashOffset: this._routeDashOffset,
        routeAnimationSpeed: this._routeAnimationSpeed,
        routeLineWidth: this.routeLineWidth,
        routeLooping: this.routeLooping,
        hasRouteInsert: !!this._routeInsert,
        hasRoutePreview: !!this._routePreview
      };
    }

    // Reset all state
    reset() {
      try {
        this.clearRoute();
        this.setComputing(false);
        this.setAnimationOffset(0);
        this.setAnimationFrameId(null);
        this.setLastAnimationTime(0);
        this.clearRouteInsert();
        this.setRouteLooping(false);
        this.clearRoutePreview();
      } catch (e) {
        this.errorHandler.logDebug('RouteState.reset failed', 'RouteState.reset', { error: e });
      }
    }

    // Utility methods
    hasValidRoute() {
      try {
        return Array.isArray(this.currentRoute) &&
               this.currentRoute.length > 0 &&
               Array.isArray(this._routeSources) &&
               this._routeSources.length > 0;
      } catch (e) {
        this.errorHandler.logDebug('RouteState.hasValidRoute failed', 'RouteState.hasValidRoute', { error: e });
        return false;
      }
    }

    getRouteWaypointCount() {
      try {
        return this.currentRoute ? this.currentRoute.length : 0;
      } catch (e) {
        this.errorHandler.logDebug('RouteState.getRouteWaypointCount failed', 'RouteState.getRouteWaypointCount', { error: e });
        return 0;
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.RouteState = RouteState;
  }

})(typeof window !== 'undefined' ? window : global);
