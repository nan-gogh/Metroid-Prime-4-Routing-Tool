// data/StorageServiceProvider.js
// Simple provider to wrap an existing StorageService instance and expose it for DI
(function (global) {
  class StorageServiceProvider {
    constructor(storageService, errorHandler) {
      this._storageService = storageService || null;
      this._errorHandler = errorHandler || null;
      this._noopStorage = null; // lazily created consent-noop wrapper
    }

    getInstance() {
      try {
        // If underlying storageService exposes consent, and consent is false,
        // return a no-op storage implementation that prevents any real writes
        // and avoids emitting storage lifecycle events. This centralizes
        // consent gating so callers don't need to special-case consent checks.
        if (this._storageService && typeof this._storageService.hasConsent === 'function') {
          try {
            if (!this._storageService.hasConsent()) {
              if (!this._noopStorage) this._noopStorage = createNoopStorage();
              return this._noopStorage;
            }
          } catch (e) {
            // If consent check throws, fall back to returning the real instance
            try { this._errorHandler && this._errorHandler.logWarning && this._errorHandler.logWarning(e, 'StorageServiceProvider.getInstance.hasConsent'); } catch (__) {}
            return this._storageService;
          }
        }
        return this._storageService;
      } catch (e) {
        try { this._errorHandler && this._errorHandler.logWarning && this._errorHandler.logWarning(e, 'StorageServiceProvider.getInstance'); } catch (__) {}
        return this._storageService;
      }
    }

    setInstance(storageService) {
      this._storageService = storageService;
    }
  }

  // Export for CommonJS and attach to window
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageServiceProvider };
  }
  if (typeof global !== 'undefined') {
    global.StorageServiceProvider = StorageServiceProvider;
  }
})(typeof window !== 'undefined' ? window : this);

// Helper: create a no-op storage adapter used when consent is not granted.
function createNoopStorage() {
  const noop = {
    hasConsent: () => false,
    get: (key, defaultValue) => defaultValue === undefined ? null : defaultValue,
    set: (key, value) => true,
    remove: (key) => true,
    clearCache: () => {},
    // high-level helpers
    saveMarkers: (markers) => true,
    loadMarkers: () => [],
    saveRoute: (routeData) => true,
    loadRoute: () => null,
    saveRouteLoopingFlag: (flag) => true,
    loadRouteLoopingFlag: () => false,
    saveSettings: (settings) => true,
    loadSettings: () => ({}),
    saveMarkerScaling: (cfg) => true,
    loadMarkerScaling: () => null,
    getStats: () => ({ cacheSize: 0, hasConsent: false, cachedKeys: [] }),
    getStorageSizeStats: () => ({ usedBytes: 0, maxBytes: 0, availableBytes: 0, usedPercentage: 0, availablePercentage: 100, canStore: false })
  };
  return noop;
}

