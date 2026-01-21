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
