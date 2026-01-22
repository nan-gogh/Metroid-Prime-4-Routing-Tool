// data/StorageServiceProvider.js
// Simple provider to wrap an existing StorageService instance and expose it for DI
(function (global) {
  class StorageServiceProvider {
    constructor(storageService, errorHandler) {
      this._storageService = storageService || null;
      this._errorHandler = errorHandler || null;
    }

    getInstance() {
      return this._storageService;
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

