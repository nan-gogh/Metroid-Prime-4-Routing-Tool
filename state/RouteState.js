// state/RouteState.js
// Manages route data and basic route state (no animation or computation)

(function (global) {
  class RouteState extends BaseStateManager {
    constructor(config, options = {}) {
      super(config, options);
      this.currentRoute = null; // array of indices into _routeSources
      this.routeLengthNormalized = 0; // normalized route length (0-1)
      this._routeSources = []; // array of source objects {marker, layerKey}

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
        this._emitChange(window.EventTypes.ROUTE_UPDATED, {
          route: routeIndices,
          lengthNormalized: lengthNormalized || 0,
          sources: routeSources || []
        });
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
        this._emitChange(window.EventTypes.ROUTE_CLEARED);
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
        this._emitChange(window.EventTypes.ROUTE_UPDATED, {
          route: this.currentRoute,
          lengthNormalized: this.routeLengthNormalized,
          sources: this._routeSources,
          looping: !!looping
        });
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
            routeLooping: this.routeLooping
          };
          window.storageService.set(this.config.STORAGE_KEYS.ROUTE_STATE, state);
        } else if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
          const consent = (typeof checkStorageConsent === 'function') ? checkStorageConsent() : false;
          if (consent) {
            const state = {
              routeLooping: this.routeLooping
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
        routeLooping: this.routeLooping,
        hasRouteInsert: !!this._routeInsert,
        hasRoutePreview: !!this._routePreview
      };
    }

    // Reset all state
    reset() {
      try {
        this.clearRoute();
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
