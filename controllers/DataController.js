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

        // Set up cross-cutting event listeners (storage, route import/export)
        try { this._setupEventListeners(); } catch (e) { this.errorHandler.logWarning(e, 'DataController.init.setupEventListeners'); }

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

    _setupEventListeners() {
      if (!this.eventBus || typeof window === 'undefined' || !window.EventTypes) return;
      try {
        const et = window.EventTypes;
        // Storage lifecycle notifications
        const onSaveStarted = (data) => {
          try {
            this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('DataController.onSaveStarted', 'DataController._setupEventListeners', { data });
            // Suppress noisy autosave notifications for map view
            if (data && data.entity === 'mapView') {
              this.errorHandler.logDebug && this.errorHandler.logDebug('Autosave started for mapView (suppressed UI)', 'DataController.onSaveStarted');
              return;
            }
            // Suppress notifications if storage consent not granted
            try {
              const storageInstance = this.storageProvider && typeof this.storageProvider.getInstance === 'function' ? this.storageProvider.getInstance() : null;
              if (storageInstance && typeof storageInstance.hasConsent === 'function' && !storageInstance.hasConsent()) {
                this.errorHandler.logDebug && this.errorHandler.logDebug('Storage save started but consent not granted - suppressing UI', 'DataController.onSaveStarted');
                return;
              }
            } catch (__ ) {}
            if (this.notificationInterface && typeof this.notificationInterface.showInfo === 'function') this.notificationInterface.showInfo(`Saving ${data && data.entity ? data.entity : data && data.key ? data.key : ''}`);
          } catch (__) {}
        };
        const onSaveCompleted = (data) => {
          try {
            this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('DataController.onSaveCompleted', 'DataController._setupEventListeners', { data });
            // Suppress autosave success to avoid frequent popups for mapView
            if (data && data.entity === 'mapView') {
              this.errorHandler.logDebug && this.errorHandler.logDebug('Autosave completed for mapView (suppressed UI)', 'DataController.onSaveCompleted');
              return;
            }
            // Suppress notifications if storage consent not granted
            try {
              const storageInstance = this.storageProvider && typeof this.storageProvider.getInstance === 'function' ? this.storageProvider.getInstance() : null;
              if (storageInstance && typeof storageInstance.hasConsent === 'function' && !storageInstance.hasConsent()) {
                this.errorHandler.logDebug && this.errorHandler.logDebug('Storage save completed but consent not granted - suppressing UI', 'DataController.onSaveCompleted');
                return;
              }
            } catch (__ ) {}
            if (this.notificationInterface && typeof this.notificationInterface.showSuccess === 'function') this.notificationInterface.showSuccess(`${data && data.entity ? data.entity : data && data.key ? data.key : 'Save'} saved`);
          } catch (__) {}
        };
        const onSaveFailed = (data) => {
          try {
            this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('DataController.onSaveFailed', 'DataController._setupEventListeners', { data });
            // Don't surface errors to the user for autosave failures of map view;
            // downgrade to debug to avoid persistent console warnings during pan/zoom.
            if (data && data.entity === 'mapView') {
              this.errorHandler.logDebug && this.errorHandler.logDebug(data && data.error ? data.error : 'mapView autosave failed', 'DataController.onSaveFailed');
              return;
            }
            // If storage consent is not granted, suppress user-facing errors
            try {
              const storageInstance = this.storageProvider && typeof this.storageProvider.getInstance === 'function' ? this.storageProvider.getInstance() : null;
              if (storageInstance && typeof storageInstance.hasConsent === 'function' && !storageInstance.hasConsent()) {
                this.errorHandler.logDebug && this.errorHandler.logDebug('Storage save failed but consent not granted - suppressing UI', 'DataController.onSaveFailed', { entity: data && data.entity });
                return;
              }
            } catch (__) {}
            if (this.notificationInterface && typeof this.notificationInterface.showRouteError === 'function') {
              this.notificationInterface.showRouteError(data && data.error ? data.error : 'Save failed');
            } else if (this.notificationInterface && typeof this.notificationInterface.showError === 'function') {
              this.notificationInterface.showError(data && data.error ? data.error : 'Save failed');
            }
          } catch (__) {}
        };

        this._eventUnsubscribers.push(this.eventBus.on(et.STORAGE_SAVE_STARTED, onSaveStarted));
        this._eventUnsubscribers.push(this.eventBus.on(et.STORAGE_SAVE_COMPLETED, onSaveCompleted));
        this._eventUnsubscribers.push(this.eventBus.on(et.STORAGE_SAVE_FAILED, onSaveFailed));

        // Route import/export notifications
        const onRouteImportStarted = () => { try { if (this.notificationInterface && typeof this.notificationInterface.showInfo === 'function') this.notificationInterface.showInfo('Importing route...'); } catch (__) {} };
        const onRouteImportCompleted = (d) => { try { if (this.notificationInterface && typeof this.notificationInterface.showSuccess === 'function') this.notificationInterface.showSuccess('Route imported'); this.eventBus.emit(et.RENDER_REQUESTED, {}); } catch (__) {} };
        const onRouteImportFailed = (d) => { try { if (this.notificationInterface && typeof this.notificationInterface.showRouteError === 'function') this.notificationInterface.showRouteError(d && d.error ? d.error : 'Route import failed'); } catch (__) {} };

        const onRouteExportStarted = () => { try { if (this.notificationInterface && typeof this.notificationInterface.showInfo === 'function') this.notificationInterface.showInfo('Exporting route...'); } catch (__) {} };
        const onRouteExportCompleted = () => { try { if (this.notificationInterface && typeof this.notificationInterface.showSuccess === 'function') this.notificationInterface.showSuccess('Route exported'); } catch (__) {} };
        const onRouteExportFailed = (d) => { try { if (this.notificationInterface && typeof this.notificationInterface.showRouteError === 'function') this.notificationInterface.showRouteError(d && d.error ? d.error : 'Route export failed'); } catch (__) {} };

        this._eventUnsubscribers.push(this.eventBus.on(et.ROUTE_IMPORT_STARTED, onRouteImportStarted));
        this._eventUnsubscribers.push(this.eventBus.on(et.ROUTE_IMPORT_COMPLETED, onRouteImportCompleted));
        this._eventUnsubscribers.push(this.eventBus.on(et.ROUTE_IMPORT_FAILED, onRouteImportFailed));
        this._eventUnsubscribers.push(this.eventBus.on(et.ROUTE_EXPORT_STARTED, onRouteExportStarted));
        this._eventUnsubscribers.push(this.eventBus.on(et.ROUTE_EXPORT_COMPLETED, onRouteExportCompleted));
        this._eventUnsubscribers.push(this.eventBus.on(et.ROUTE_EXPORT_FAILED, onRouteExportFailed));
      } catch (e) {
        this.errorHandler.logWarning(e, 'DataController._setupEventListeners');
      }
    }

    /**
     * Create MarkerManager and RouteManager
     * @private
     */
    async _createManagers() {
      // Build a storage adapter that adapts the provided StorageService (via provider)
      // to the methods expected by managers. Prefer injected provider, fall back to global.
      // Prefer injected storageProvider; do not fall back to global getters.
      let storageInstance = null;
      try {
        if (this.storageProvider && typeof this.storageProvider.getInstance === 'function') {
          storageInstance = this.storageProvider.getInstance();
        }
      } catch (e) {
        storageInstance = null;
      }

      const cfgKeys = this.config && this.config.STORAGE_KEYS ? this.config.STORAGE_KEYS : {};

      const storageAdapter = {
        // Markers
        saveMarkers: (markers) => {
          try {
            if (typeof storageUtils !== 'undefined' && storageInstance) {
              return storageUtils.saveWithEvents(storageInstance, cfgKeys.MARKERS || 'mp4_markers', markers, this.eventBus, cfgKeys.MARKERS || 'mp4_markers', this.errorHandler);
            }
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
            if (typeof storageUtils !== 'undefined' && storageInstance) return storageUtils.loadWithEvents(storageInstance, cfgKeys.MARKERS || 'mp4_markers', [], this.eventBus, cfgKeys.MARKERS || 'mp4_markers', this.errorHandler);
            if (storageInstance && typeof storageInstance.get === 'function') return storageInstance.get(cfgKeys.MARKERS || 'mp4_markers', []);
            if (storageInstance && typeof storageInstance.loadMarkers === 'function') return storageInstance.loadMarkers();
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.loadMarkers', {}); }
          return [];
        },
        // Route
        saveRoute: (routeData) => {
          try {
            if (typeof storageUtils !== 'undefined' && storageInstance) {
              return storageUtils.saveWithEvents(storageInstance, cfgKeys.ROUTE || 'mp4_route', routeData, this.eventBus, cfgKeys.ROUTE || 'mp4_route', this.errorHandler);
            }
            if (storageInstance && typeof storageInstance.set === 'function') return storageInstance.set(cfgKeys.ROUTE || 'mp4_route', routeData);
            if (storageInstance && typeof storageInstance.saveRoute === 'function') return storageInstance.saveRoute(routeData);
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.saveRoute', {}); }
          return false;
        },
        loadRoute: () => {
          try {
            if (typeof storageUtils !== 'undefined' && storageInstance) return storageUtils.loadWithEvents(storageInstance, cfgKeys.ROUTE || 'mp4_route', null, this.eventBus, cfgKeys.ROUTE || 'mp4_route', this.errorHandler);
            if (storageInstance && typeof storageInstance.get === 'function') return storageInstance.get(cfgKeys.ROUTE || 'mp4_route', null);
            if (storageInstance && typeof storageInstance.loadRoute === 'function') return storageInstance.loadRoute();
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.loadRoute', {}); }
          return null;
        },
        // Route looping flag
        saveRouteLoopingFlag: (flag) => {
          try {
            if (typeof storageUtils !== 'undefined' && storageInstance) {
              return storageUtils.saveWithEvents(storageInstance, cfgKeys.ROUTE_LOOPING || 'mp4_route_looping', !!flag, this.eventBus, cfgKeys.ROUTE_LOOPING || 'mp4_route_looping', this.errorHandler);
            }
            if (storageInstance && typeof storageInstance.set === 'function') return storageInstance.set(cfgKeys.ROUTE_LOOPING || 'mp4_route_looping', !!flag);
            if (storageInstance && typeof storageInstance.saveRouteLoopingFlag === 'function') return storageInstance.saveRouteLoopingFlag(!!flag);
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.saveRouteLoopingFlag', {}); }
          return false;
        },
        loadRouteLoopingFlag: () => {
          try {
            if (typeof storageUtils !== 'undefined' && storageInstance) return storageUtils.loadWithEvents(storageInstance, cfgKeys.ROUTE_LOOPING || 'mp4_route_looping', false, this.eventBus, cfgKeys.ROUTE_LOOPING || 'mp4_route_looping', this.errorHandler);
            if (storageInstance && typeof storageInstance.get === 'function') return storageInstance.get(cfgKeys.ROUTE_LOOPING || 'mp4_route_looping', false);
            if (storageInstance && typeof storageInstance.loadRouteLoopingFlag === 'function') return storageInstance.loadRouteLoopingFlag();
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.loadRouteLoopingFlag', {}); }
          return false;
        },
        // Generic setting access for legacy code
        loadSetting: (key) => {
          try {
            if (typeof storageUtils !== 'undefined' && storageInstance) return storageUtils.loadWithEvents(storageInstance, key, null, this.eventBus, key, this.errorHandler);
            if (storageInstance && typeof storageInstance.loadSetting === 'function') return storageInstance.loadSetting(key);
            if (storageInstance && typeof storageInstance.get === 'function') return storageInstance.get(key, null);
          } catch (e) { this.errorHandler.logWarning(e, 'DataController.storageAdapter.loadSetting', {}); }
          return null;
        },
        saveSetting: (key, val) => {
          try {
            if (typeof storageUtils !== 'undefined' && storageInstance) return storageUtils.saveWithEvents(storageInstance, key, val, this.eventBus, key, this.errorHandler);
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
        // Central consent gating: skip all loads if storage provider reports no consent
        if (storage && typeof storage.hasConsent === 'function' && !storage.hasConsent()) {
          try { this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('DataController._loadStoredData: skipping loads due to no consent', 'DataController._loadStoredData'); } catch (__) {}
          return;
        }

        // Use storageUtils when available to standardize behavior
        if (window.storageUtils && typeof window.storageUtils.loadWithEvents === 'function') {
          const savedScaling = window.storageUtils.loadWithEvents(storage, this.config.STORAGE_KEYS.MARKER_SCALING, null, this.eventBus, 'markerScaling', this.errorHandler);
          if (savedScaling) {
            this.config.MARKER_SCALING.userScaleMultiplier = savedScaling.userScaleMultiplier || this.config.MARKER_SCALING.userScaleMultiplier;
            this.config.MARKER_SCALING.highlightMultiplier = savedScaling.highlightMultiplier || this.config.MARKER_SCALING.highlightMultiplier;
          }
        } else {
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
