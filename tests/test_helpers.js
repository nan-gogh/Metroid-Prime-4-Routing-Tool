// tests/test_helpers.js
// Shared test helpers for Node unit tests

const path = require('path');

function ensureErrorHandler() {
  const { ErrorHandler } = require(path.join(__dirname, '../utils/ErrorHandler.js'));
  global.ErrorHandler = global.ErrorHandler || ErrorHandler;
  global.errorHandler = global.errorHandler || new ErrorHandler();
  return global.ErrorHandler;
}

function ensureBaseStateManager() {
  // Try to require the canonical BaseStateManager which registers `global.BaseStateManager`
  try {
    require(path.join(__dirname, '../state/BaseStateManager.js'));
  } catch (e) {
    // ignore
  }

  if (!global.BaseStateManager) {
    // Provide a minimal fallback base class for tests
    class BaseStateManager {
      constructor(config, options = {}) {
        this.config = config || (global.MP4Config || {});
        this.eventBus = options.eventBus || null;
        this.errorHandler = options.errorHandler || global.errorHandler || { logError: () => {}, logWarning: () => {}, logDebug: () => {} };
      }
      _emitChange(event, data) {
        try { this.eventBus && this.eventBus.emit && this.eventBus.emit(event, data); } catch (e) {}
      }
    }
    global.BaseStateManager = BaseStateManager;
  }
  return global.BaseStateManager;
}

function ensureEventTypes() {
  global.EventTypes = global.EventTypes || {
    MAP_VIEW_CHANGED: 'map:view_changed',
    STORAGE_SAVE_STARTED: 'storage:save_started',
    STORAGE_SAVE_COMPLETED: 'storage:save_completed',
    STORAGE_SAVE_FAILED: 'storage:save_failed'
  };
  global.window = global.window || {};
  global.window.EventTypes = global.window.EventTypes || global.EventTypes;
  return global.EventTypes;
}

function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    data: store,
    get(key) { return key in this.data ? this.data[key] : null; },
    set(key, value) { this.data[key] = value; },
    remove(key) { delete this.data[key]; },
    clear() { this.data = {}; }
  };
}

function setupTestEnv(opts = {}) {
  ensureErrorHandler();
  ensureBaseStateManager();
  ensureEventTypes();
  global.MP4Config = global.MP4Config || opts.mp4config || {};
}

module.exports = {
  setupTestEnv,
  ensureErrorHandler,
  ensureBaseStateManager,
  ensureEventTypes,
  createMockStorage
};
