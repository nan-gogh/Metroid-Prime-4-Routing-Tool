// utils/storageUtils.js
// Small helper to standardize consent-checked load/save with EventBus lifecycle events
(function (global) {
  function _hasConsent(storage) {
    try {
      return storage && typeof storage.hasConsent === 'function' ? storage.hasConsent() : true;
    } catch (e) {
      return false;
    }
  }

  function saveWithEvents(storage, key, payload, eventBus, entity, errorHandler) {
    try {
      if (!storage) return false;
      if (!_hasConsent(storage)) {
        try { errorHandler && errorHandler.logDebug && errorHandler.logDebug(entity + '.saveWithEvents: no consent', 'storageUtils.saveWithEvents'); } catch (__) {}
        return false;
      }

      try { eventBus && eventBus.emit && eventBus.emit(window.EventTypes.STORAGE_SAVE_STARTED, { entity }); } catch (__) {}

      let saved = false;
      try {
        if (typeof storage.set === 'function') saved = !!storage.set(key, payload);
        else if (typeof storage.saveSetting === 'function') saved = !!storage.saveSetting(key, payload);
        else if (typeof storage.save === 'function') saved = !!storage.save(key, payload);
      } catch (e) {
        try { errorHandler && errorHandler.logWarning && errorHandler.logWarning(e, 'storageUtils.saveWithEvents.storageCall'); } catch (__) {}
        saved = false;
      }

      if (saved) {
        try { eventBus && eventBus.emit && eventBus.emit(window.EventTypes.STORAGE_SAVE_COMPLETED, { entity }); } catch (__) {}
      } else {
        try { eventBus && eventBus.emit && eventBus.emit(window.EventTypes.STORAGE_SAVE_FAILED, { entity, error: 'storage.save returned false or consent denied' }); } catch (__) {}
      }

      return saved;
    } catch (e) {
      try { errorHandler && errorHandler.logError && errorHandler.logError(e, 'storageUtils.saveWithEvents'); } catch (__) {}
      try { eventBus && eventBus.emit && eventBus.emit(window.EventTypes.STORAGE_SAVE_FAILED, { entity, error: e && e.message ? e.message : String(e) }); } catch (__) {}
      return false;
    }
  }

  function loadWithEvents(storage, key, defaultValue, eventBus, entity, errorHandler) {
    try {
      if (!storage) return defaultValue;
      if (!_hasConsent(storage)) {
        try { errorHandler && errorHandler.logDebug && errorHandler.logDebug(entity + '.loadWithEvents: no consent', 'storageUtils.loadWithEvents'); } catch (__) {}
        return defaultValue;
      }

      try { eventBus && eventBus.emit && eventBus.emit(window.EventTypes.STORAGE_LOAD_STARTED, { entity }); } catch (__) {}

      let value = defaultValue;
      try {
        if (typeof storage.get === 'function') value = storage.get(key, defaultValue);
        else if (typeof storage.loadSetting === 'function') value = storage.loadSetting(key);
      } catch (e) {
        try { errorHandler && errorHandler.logWarning && errorHandler.logWarning(e, 'storageUtils.loadWithEvents.storageCall'); } catch (__) {}
        try { eventBus && eventBus.emit && eventBus.emit(window.EventTypes.STORAGE_LOAD_FAILED, { entity, error: e && e.message ? e.message : String(e) }); } catch (__) {}
        return defaultValue;
      }

      try { eventBus && eventBus.emit && eventBus.emit(window.EventTypes.STORAGE_LOAD_COMPLETED, { entity }); } catch (__) {}
      return value;
    } catch (e) {
      try { errorHandler && errorHandler.logError && errorHandler.logError(e, 'storageUtils.loadWithEvents'); } catch (__) {}
      try { eventBus && eventBus.emit && eventBus.emit(window.EventTypes.STORAGE_LOAD_FAILED, { entity, error: e && e.message ? e.message : String(e) }); } catch (__) {}
      return defaultValue;
    }
  }

  global.storageUtils = {
    saveWithEvents,
    loadWithEvents,
    _hasConsent
  };
})(typeof window !== 'undefined' ? window : global);
