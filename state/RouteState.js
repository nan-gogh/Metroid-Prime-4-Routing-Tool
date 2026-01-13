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
    }

    // Route data management
    setRoute(routeIndices, lengthNormalized, routeSources) {
      try {
        this.currentRoute = routeIndices;
        this.routeLengthNormalized = lengthNormalized || 0;
        this._routeSources = routeSources || [];
      } catch (e) {
        console.debug('RouteState.setRoute failed', e);
      }
    }

    clearRoute() {
      try {
        this.currentRoute = null;
        this.routeLengthNormalized = 0;
        this._routeSources = [];
        this.clearRoutePreview();
      } catch (e) {
        console.debug('RouteState.clearRoute failed', e);
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
        console.debug('RouteState.setComputing failed', e);
      }
    }

    isComputing() {
      return this._computingRoute;
    }

    setComputationProgress(progress) {
      try {
        this._computationProgress = Math.max(0, Math.min(1, progress));
      } catch (e) {
        console.debug('RouteState.setComputationProgress failed', e);
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
        console.debug('RouteState.setAnimationOffset failed', e);
      }
    }

    getAnimationOffset() {
      return this._routeDashOffset;
    }

    setAnimationFrameId(rafId) {
      try {
        this._routeRaf = rafId;
      } catch (e) {
        console.debug('RouteState.setAnimationFrameId failed', e);
      }
    }

    getAnimationFrameId() {
      return this._routeRaf;
    }

    setLastAnimationTime(time) {
      try {
        this._lastRouteAnimTime = time;
      } catch (e) {
        console.debug('RouteState.setLastAnimationTime failed', e);
      }
    }

    getLastAnimationTime() {
      return this._lastRouteAnimTime;
    }

    setAnimationSpeed(speed) {
      try {
        this._routeAnimationSpeed = speed;
      } catch (e) {
        console.debug('RouteState.setAnimationSpeed failed', e);
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
        console.debug('RouteState.setAnimationEnabled failed', e);
      }
    }

    // Route editing state
    setRouteInsert(insertState) {
      try {
        this._routeInsert = insertState || null;
      } catch (e) {
        console.debug('RouteState.setRouteInsert failed', e);
      }
    }

    getRouteInsert() {
      return this._routeInsert;
    }

    clearRouteInsert() {
      try {
        this._routeInsert = null;
      } catch (e) {
        console.debug('RouteState.clearRouteInsert failed', e);
      }
    }

    setRouteLooping(looping) {
      try {
        this.routeLooping = !!looping;
      } catch (e) {
        console.debug('RouteState.setRouteLooping failed', e);
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
        console.debug('RouteState.setRoutePreview failed', e);
      }
    }

    getRoutePreview() {
      return this._routePreview;
    }

    clearRoutePreview() {
      try {
        this._routePreview = null;
      } catch (e) {
        console.debug('RouteState.clearRoutePreview failed', e);
      }
    }

    // State persistence (consent-gated)
    saveToStorage() {
      try {
        if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
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
        console.debug('RouteState.saveToStorage failed', e);
      }
    }

    loadFromStorage() {
      try {
        if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
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
        console.debug('RouteState.loadFromStorage failed', e);
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
        console.debug('RouteState.reset failed', e);
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
        console.debug('RouteState.hasValidRoute failed', e);
        return false;
      }
    }

    getRouteWaypointCount() {
      try {
        return this.currentRoute ? this.currentRoute.length : 0;
      } catch (e) {
        console.debug('RouteState.getRouteWaypointCount failed', e);
        return 0;
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.RouteState = RouteState;
  }

})(typeof window !== 'undefined' ? window : global);
