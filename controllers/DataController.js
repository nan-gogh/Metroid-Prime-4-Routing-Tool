// controllers/DataController.js
// Manages data loading, marker/route managers, and persistence
// Extracts manager creation and initialization from map.js constructor

(function (global) {
  if (typeof globalThis.__MP4_NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.__MP4_NOOP_ERROR_HANDLER = { logDebug: ()=>{}, logWarning: ()=>{}, logError: ()=>{} };
  }

  class DataController {
    constructor(options) {
      // Required dependencies
      this.mapState = options.mapState;
      this.markerManager = options.markerManager;
      this.routeManager = options.routeManager;
      this.eventBus = options.eventBus || null;
      this.errorHandler = options.errorHandler || globalThis.__MP4_NOOP_ERROR_HANDLER;

      // Optional dependencies
      this.config = options.config || global.MP4Config || {};
      this.notificationInterface = options.notificationInterface || global.NotificationInterface || null;
      // Optional DI: storage provider
      this.storageProvider = options.storageProvider || null;

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
      // Build a storage adapter that adapts the provided StorageService (via provider)
      // to the methods expected by managers. Prefer injected provider, fall back to global.
      let storageInstance = null;
      try {
        if (this.storageProvider && typeof this.storageProvider.getInstance === 'function') {
          storageInstance = this.storageProvider.getInstance();
        } else {
          storageInstance = (typeof getStorageService === 'function') ? getStorageService() : null;
        }
      } catch (e) {
        storageInstance = null;
      }

      const cfgKeys = this.config && this.config.STORAGE_KEYS ? this.config.STORAGE_KEYS : {};

      const storageAdapter = {
        // Markers
        saveMarkers: (markers) => {
          try {
            if (storageInstance && typeof storageInstance.set === 'function') {
              return storageInstance.set(cfgKeys.MARKERS || 'mp4_markers', markers);
            }
            if (storageInstance && typeof storageInstance.saveMarkers === 'function') {
              return storageInstance.saveMarkers(markers);
            }
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.saveMarkers', {}); }
          return false;
        },
        loadMarkers: () => {
          try {
            if (storageInstance && typeof storageInstance.get === 'function') return storageInstance.get(cfgKeys.MARKERS || 'mp4_markers', []);
            if (storageInstance && typeof storageInstance.loadMarkers === 'function') return storageInstance.loadMarkers();
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.loadMarkers', {}); }
          return [];
        },
        // Route
        saveRoute: (routeData) => {
          try {
            if (storageInstance && typeof storageInstance.set === 'function') return storageInstance.set(cfgKeys.ROUTE || 'mp4_route', routeData);
            if (storageInstance && typeof storageInstance.saveRoute === 'function') return storageInstance.saveRoute(routeData);
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.saveRoute', {}); }
          return false;
        },
        loadRoute: () => {
          try {
            if (storageInstance && typeof storageInstance.get === 'function') return storageInstance.get(cfgKeys.ROUTE || 'mp4_route', null);
            if (storageInstance && typeof storageInstance.loadRoute === 'function') return storageInstance.loadRoute();
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.loadRoute', {}); }
          return null;
        },
        // Route looping flag
        saveRouteLoopingFlag: (flag) => {
          try {
            if (storageInstance && typeof storageInstance.set === 'function') return storageInstance.set(cfgKeys.ROUTE_LOOPING || 'mp4_route_looping', !!flag);
            if (storageInstance && typeof storageInstance.saveRouteLoopingFlag === 'function') return storageInstance.saveRouteLoopingFlag(!!flag);
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.saveRouteLoopingFlag', {}); }
          return false;
        },
        loadRouteLoopingFlag: () => {
          try {
            if (storageInstance && typeof storageInstance.get === 'function') return storageInstance.get(cfgKeys.ROUTE_LOOPING || 'mp4_route_looping', false);
            if (storageInstance && typeof storageInstance.loadRouteLoopingFlag === 'function') return storageInstance.loadRouteLoopingFlag();
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.loadRouteLoopingFlag', {}); }
          return false;
        },
        // Generic setting access for legacy code
        loadSetting: (key) => {
          try {
            if (storageInstance && typeof storageInstance.loadSetting === 'function') return storageInstance.loadSetting(key);
            if (storageInstance && typeof storageInstance.get === 'function') return storageInstance.get(key, null);
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.loadSetting', {}); }
          return null;
        },
        saveSetting: (key, val) => {
          try {
            if (storageInstance && typeof storageInstance.saveSetting === 'function') return storageInstance.saveSetting(key, val);
            if (storageInstance && typeof storageInstance.set === 'function') return storageInstance.set(key, val);
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.saveSetting', {}); }
          return false;
        }
      };

      // Keep adapter available for other methods
      this._storageAdapter = storageAdapter;

      // Create MarkerManager
      if (!this.markerManager && typeof MarkerManager !== 'undefined' &&
        storageAdapter) {

        this._markerManager = new MarkerManager(
          { maxMarkers: 50, layerPrefix: 'cm' },
          storageAdapter,
          this.notificationInterface,
          this.eventBus,
          { errorHandler: this.errorHandler }
        );
      } else {
        this._markerManager = this.markerManager;
      }

      // Create RouteManager (depends on MarkerManager)
      if (!this.routeManager && typeof RouteManager !== 'undefined' && this._markerManager) {
        try {
          this._routeManager = new RouteManager(
            this._markerManager,
            storageAdapter,
            this.notificationInterface,
            this.eventBus,
            { errorHandler: this.errorHandler }
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
              this.errorHandler.logWarning(e, 'DataController._setupManagerCallbacks.routeCleanupFailed', { message: 'Route cleanup failed' });
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
            this.errorHandler.logWarning(e, 'DataController._setupManagerCallbacks.routeCallbackFailed', { message: 'Route callback failed' });
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
        const storage = this._storageAdapter || (this.storageProvider && typeof this.storageProvider.getInstance === 'function' ? this.storageProvider.getInstance() : null);
        if (storage && typeof storage.loadSetting === 'function' && storage.loadSetting) {
          const savedScaling = storage.loadSetting(this.config.STORAGE_KEYS.MARKER_SCALING);
          if (savedScaling) {
            this.config.MARKER_SCALING.userScaleMultiplier = savedScaling.userScaleMultiplier || this.config.MARKER_SCALING.userScaleMultiplier;
            this.config.MARKER_SCALING.highlightMultiplier = savedScaling.highlightMultiplier || this.config.MARKER_SCALING.highlightMultiplier;
          }
        } else if (storage && typeof storage.get === 'function') {
          const savedScaling = storage.get(this.config.STORAGE_KEYS.MARKER_SCALING);
          if (savedScaling) {
            this.config.MARKER_SCALING.userScaleMultiplier = savedScaling.userScaleMultiplier || this.config.MARKER_SCALING.userScaleMultiplier;
            this.config.MARKER_SCALING.highlightMultiplier = savedScaling.highlightMultiplier || this.config.MARKER_SCALING.highlightMultiplier;
          }
        }
      } catch (e) {
        this.errorHandler.logWarning(e, 'DataController._loadStoredData.markerScaling', { message: 'Failed to load marker scaling config' });
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
          this.errorHandler.logWarning(e, 'DataController.destroy.unsubscribe', { message: 'Failed to unsubscribe event listener' });
        }
      });
      this._eventUnsubscribers = [];

      // Clean up managers
      if (this._routeManager && typeof this._routeManager.destroy === 'function') {
        try {
          this._routeManager.destroy();
        } catch (e) {
          this.errorHandler.logWarning(e, 'DataController.destroy.routeManager', { message: 'Failed to destroy routeManager' });
        }
      }

      if (this._markerManager && typeof this._markerManager.destroy === 'function') {
        try {
          this._markerManager.destroy();
        } catch (e) {
          this.errorHandler.logWarning(e, 'DataController.destroy.markerManager', { message: 'Failed to destroy markerManager' });
        }
      }

      this._markerManager = null;
      this._routeManager = null;
    }
  }

  // Export for global access
  global.DataController = DataController;
})(typeof window !== 'undefined' ? window : global);
