// controllers/DataController.js
// Manages data loading, marker/route managers, and persistence
// Extracts manager creation and initialization from map.js constructor

(function (global) {
  class DataController {
    constructor(options) {
      // Required dependencies
      this.mapState = options.mapState;
      this.markerManager = options.markerManager;
      this.routeManager = options.routeManager;
      this.eventBus = options.eventBus || window.eventBus;
      this.errorHandler = options.errorHandler;

      // Optional dependencies
      this.config = options.config || global.MP4Config || {};
      this.storageUtils = options.storageUtils || {
        StorageInterface: global.StorageInterface,
        NotificationInterface: global.NotificationInterface
      };

      // Manager instances (will be created in init)
      this._markerManager = null;
      this._routeManager = null;

      // Event listener cleanup
      this._eventUnsubscribers = [];
    }

    /**
     * Initialize data layer: create managers, set up callbacks, load stored data
     */
    async init() {
      try {
        // Create managers if not provided
        await this._createManagers();

        // Set up manager callbacks
        this._setupManagerCallbacks();

        // Load initial data from storage
        await this._loadStoredData();

        // Emit data ready event
        this.eventBus.emit('data:ready', {
          hasMarkers: !!this._markerManager,
          hasRoutes: !!this._routeManager
        });

      } catch (e) {
        this.errorHandler.logError(e, 'DataController.init failed');
        throw e;
      }
    }

    /**
     * Create MarkerManager and RouteManager
     * @private
     */
    async _createManagers() {
      // Create MarkerManager
      if (!this.markerManager && typeof MarkerManager !== 'undefined' &&
          this.storageUtils.StorageInterface && this.storageUtils.NotificationInterface) {

        this._markerManager = new MarkerManager(
          { maxMarkers: 50, layerPrefix: 'cm' },
          this.storageUtils.StorageInterface,
          this.storageUtils.NotificationInterface,
          this.eventBus
        );
      } else {
        this._markerManager = this.markerManager;
      }

      // Create RouteManager (depends on MarkerManager)
      if (!this.routeManager && typeof RouteManager !== 'undefined' && this._markerManager) {
        try {
          this._routeManager = new RouteManager(
            this._markerManager,
            this.storageUtils.StorageInterface,
            this.storageUtils.NotificationInterface,
            this.eventBus
          );
        } catch (e) {
          this.errorHandler.logError(e, 'DataController: RouteManager creation failed');
          // Continue without route manager - markers still work
        }
      } else {
        this._routeManager = this.routeManager;
      }
    }

    /**
     * Set up callbacks between managers
     * @private
     */
    _setupManagerCallbacks() {
      if (this._markerManager) {
        // When markers are deleted, clean up route references
        this._markerManager.setOnCleanupRouteReferences((deletedMarkerUid) => {
          if (this._routeManager) {
            try {
              this._routeManager.cleanupRouteReferences(deletedMarkerUid);
            } catch (e) {
              this.errorHandler.logDebug('Route cleanup failed', 'DataController._setupManagerCallbacks', { error: e });
            }
          }
        });
      }

      if (this._routeManager) {
        // When routes change, emit events for render updates
        this._routeManager.setOnRouteChanged(() => {
          try {
            this.eventBus.emit('route:updated');
          } catch (e) {
            this.errorHandler.logDebug('Route callback failed', 'DataController._setupManagerCallbacks', { error: e });
          }
        });
      }
    }

    /**
     * Load stored data (markers, routes, settings)
     * @private
     */
    async _loadStoredData() {
      // Load marker scaling configuration
      try {
        if (this.storageUtils.StorageInterface && typeof this.storageUtils.StorageInterface.hasConsent === 'function' && this.storageUtils.StorageInterface.hasConsent()) {
          const savedScaling = this.storageUtils.StorageInterface.get(this.config.STORAGE_KEYS.MARKER_SCALING);
          if (savedScaling) {
            this.config.MARKER_SCALING.userScaleMultiplier = savedScaling.userScaleMultiplier || this.config.MARKER_SCALING.userScaleMultiplier;
            this.config.MARKER_SCALING.highlightMultiplier = savedScaling.highlightMultiplier || this.config.MARKER_SCALING.highlightMultiplier;
          }
        }
      } catch (e) {
        this.errorHandler.logDebug('Failed to load marker scaling config', 'DataController._loadStoredData', { error: e });
      }

      // Additional storage loading can be added here
    }

    /**
     * Get the marker manager instance
     */
    getMarkerManager() {
      return this._markerManager;
    }

    /**
     * Get the route manager instance
     */
    getRouteManager() {
      return this._routeManager;
    }

    /**
     * Clean up resources and event listeners
     */
    destroy() {
      // Clean up event listeners
      this._eventUnsubscribers.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (e) {
          this.errorHandler.logDebug('Failed to unsubscribe event listener', 'DataController.destroy', { error: e });
        }
      });
      this._eventUnsubscribers = [];

      // Clean up managers
      if (this._routeManager && typeof this._routeManager.destroy === 'function') {
        try {
          this._routeManager.destroy();
        } catch (e) {
          this.errorHandler.logDebug('Failed to destroy routeManager', 'DataController.destroy', { error: e });
        }
      }

      if (this._markerManager && typeof this._markerManager.destroy === 'function') {
        try {
          this._markerManager.destroy();
        } catch (e) {
          this.errorHandler.logDebug('Failed to destroy markerManager', 'DataController.destroy', { error: e });
        }
      }

      this._markerManager = null;
      this._routeManager = null;
    }
  }

  // Export for global access
  global.DataController = DataController;
})(typeof window !== 'undefined' ? window : global);