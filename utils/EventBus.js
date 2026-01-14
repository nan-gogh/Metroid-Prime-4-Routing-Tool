// utils/EventBus.js
// Centralized event bus for cross-module communication

(function (global) {
  class EventBus {
    constructor() {
      this._listeners = new Map();
      this._errorHandler = null;
    }

    setErrorHandler(errorHandler) {
      this._errorHandler = errorHandler;
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
            if (this._errorHandler) {
              this._errorHandler.logError(e, `EventBus.emit.${event}`);
            } else {
              console.error(`EventBus handler error for ${event}:`, e);
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