// utils/EventBus.js
// Centralized event bus for cross-module communication

(function (global) {
  // Shared NOOP handler used when no ErrorHandler is injected
  globalThis.NOOP_ERROR_HANDLER = globalThis.NOOP_ERROR_HANDLER || {
    logDebug: function () {},
    logWarning: function () {},
    logError: function () {}
  };
  // EventBus uses an injected ErrorHandler via `setErrorHandler()`.
  // It no longer creates or depends on a global `errorHandler`.
  class EventBus {
    constructor() {
      this._listeners = new Map();
      // default to shared NOOP handler until a real handler is injected
      this._errorHandler = globalThis.NOOP_ERROR_HANDLER;
    }

    setErrorHandler(errorHandler) {
      this._errorHandler = errorHandler || globalThis.NOOP_ERROR_HANDLER;
    }

    on(event, callback, context = null) {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, new Set());
      }
      const listener = context ? callback.bind(context) : callback;
      listener._originalCallback = callback;
      this._listeners.get(event).add(listener);
      return () => this.off(event, callback);
    }

    off(event, callback) {
      const listeners = this._listeners.get(event);
      if (listeners) {
        // Remove all bound versions of this callback
        for (const listener of listeners) {
          if (listener._originalCallback === callback) {
            listeners.delete(listener);
            break;
          }
        }
      }
    }

    emit(event, data = null) {
      const listeners = this._listeners.get(event);
      if (listeners) {
        listeners.forEach(listener => {
          try {
            listener(data);
          } catch (e) {
            const h = this._errorHandler || globalThis.NOOP_ERROR_HANDLER;
            try {
              if (h && typeof h.logError === 'function') {
                h.logError(e, `EventBus.emit.${event}`);
              } else if (h && typeof h.logWarning === 'function') {
                h.logWarning(`EventBus.emit.${event} handler error`, `EventBus.emit.${event}`, { error: e });
              }
            } catch (logErr) {
              /* best-effort */
            }
          }
        });
      }
    }

    clear() {
      this._listeners.clear();
    }

    getListenerCount(event) {
      return this._listeners.get(event)?.size || 0;
    }

    // Debug method to inspect current listeners
    getDebugInfo() {
      const info = {};
      for (const [event, listeners] of this._listeners) {
        info[event] = listeners.size;
      }
      return info;
    }
  }

  // Create global instance
  global.EventBus = EventBus;
  global.eventBus = new EventBus();

})(typeof window !== 'undefined' ? window : global);