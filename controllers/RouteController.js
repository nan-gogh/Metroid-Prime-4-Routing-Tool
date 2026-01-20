// controllers/RouteController.js
// Centralized route coordination controller
// Handles all route-specific operations and coordination between input, state, and rendering

(function (global) {
  if (typeof globalThis.__MP4_NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.__MP4_NOOP_ERROR_HANDLER = { logDebug: ()=>{}, logWarning: ()=>{}, logError: ()=>{} };
  }

  class RouteController {
    constructor(routeManager, dragState, mapState, config, eventBus, errorHandler) {
      this.routeManager = routeManager;
      this.dragState = dragState;
      this.mapState = mapState;
      this.config = config || (global.MP4Config || {});
      this.eventBus = eventBus || window.eventBus;
      this.eventTypes = window.EventTypes || {};
      this.errorHandler = errorHandler || globalThis.__MP4_NOOP_ERROR_HANDLER;

      // Bind methods for performance
      this.findRouteSegmentAt = this.findRouteSegmentAt.bind(this);
      this.findRouteWaypointAt = this.findRouteWaypointAt.bind(this);
      this.setRoute = this.setRoute.bind(this);
    }

    // Find a route segment near screen coordinates
    findRouteSegmentAt(screenX, screenY, threshold = 10) {
      const result = this.routeManager.findRouteSegmentAt(screenX, screenY, {
        zoom: this.mapState.zoom,
        panX: this.mapState.panX,
        panY: this.mapState.panY
      }, this.config.MAP_SIZE, threshold);
      return result;
    }

    // Find a route waypoint near screen coordinates
    findRouteWaypointAt(screenX, screenY, threshold = 30) {
      return this.routeManager.findRouteWaypointAt(screenX, screenY, {
        zoom: this.mapState.zoom,
        panX: this.mapState.panX,
        panY: this.mapState.panY
      }, this.config.MAP_SIZE, threshold);
    }

    // Set route data
    setRoute(routeIndices, lengthNormalized, routeSources) {
      try {
        // Delegate to route manager
        this.routeManager.setRoute(routeIndices, lengthNormalized, routeSources);

        // Handle UI updates that depend on route changes
        try {
          // Invalidate route renderer cache
          if (typeof routeRenderer !== 'undefined' && routeRenderer.invalidateCache) {
            routeRenderer.invalidateCache();
          }
        } catch (e) {
          this.errorHandler.logWarning('Failed to invalidate route renderer cache', 'RouteController.setRoute.invalidateCache', { error: e });
        }

        try {
          // Update layer counts if route affects them
          if (typeof layerState !== 'undefined' && layerState.updateCounts) {
            layerState.updateCounts();
          }
        } catch (e) {
          this.errorHandler.logError(e, 'RouteController.setRoute.updateLayerCounts');
        }

        try {
          // Update loop UI
          if (typeof updateLoopUI === 'function') {
            updateLoopUI();
          }
        } catch (e) {
          this.errorHandler.logError(e, 'RouteController.setRoute.updateLoopUI');
        }

        try {
          // Update route toggle UI
          if (typeof updateRouteToggle === 'function') {
            updateRouteToggle();
          }
        } catch (e) {
          this.errorHandler.logError(e, 'RouteController.setRoute.updateRouteToggle');
        }

        try {
          // Save route to storage
          if (typeof saveRouteToStorage === 'function') {
            saveRouteToStorage();
          }
        } catch (e) {
          this.errorHandler.logError(e, 'RouteController.setRoute.saveRouteToStorage');
        }

      } catch (e) {
        this.errorHandler.logError(e, 'RouteController.setRoute');
      }
    }

    clearRoute() {
      try {
        // Clear the route through RouteManager (this emits ROUTE_CLEARED event)
        this.routeManager.clearRoute();
      } catch (e) {
        this.errorHandler.logError(e, 'RouteController.clearRoute');
      }
    }
  }

  // Make RouteController globally available
  global.RouteController = RouteController;

})(typeof window !== 'undefined' ? window : global);
