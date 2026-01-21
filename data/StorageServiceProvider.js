// Simple StorageServiceProvider for dependency injection
// Wraps a StorageService instance and exposes a stable getInstance() API
(function(global) {
  function StorageServiceProvider(storageService, errorHandler) {
    this._instance = storageService || null;
    this.errorHandler = errorHandler || null;
  }

  StorageServiceProvider.prototype.getInstance = function() {
    return this._instance;
  };

  StorageServiceProvider.prototype.setInstance = function(svc) {
    this._instance = svc;
  };

  // Export for CommonJS and attach to window for legacy code
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageServiceProvider };
  }
  if (typeof global !== 'undefined') {
    global.StorageServiceProvider = StorageServiceProvider;
  }
})(typeof window !== 'undefined' ? window : this);
// data/StorageServiceProvider.js
// Simple provider to wrap an existing StorageService instance and expose it for DI
(function (global) {
  class StorageServiceProvider {
    constructor(storageService) {
      this._storageService = storageService || null;
    }

    getInstance() {
      return this._storageService;
    }

    setInstance(storageService) {
      this._storageService = storageService;
    }
  }

  if (typeof global !== 'undefined') {
    global.StorageServiceProvider = StorageServiceProvider;
  }

})(typeof window !== 'undefined' ? window : global);
