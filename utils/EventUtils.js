// utils/EventUtils.js
// Utilities for standardized event handling patterns across the application

(function (global) {
  // Shared NOOP handler used when no ErrorHandler is injected
  globalThis.NOOP_ERROR_HANDLER = globalThis.NOOP_ERROR_HANDLER || {
    logDebug: function () {},
    logWarning: function () {},
    logError: function () {}
  };
  // EventUtils relies on an injected ErrorHandler passed to its methods.
  // It no longer creates or uses a global `errorHandler` fallback.
  class EventUtils {
    /**
     * Creates a standardized event handler with built-in error handling
     * @param {Function} handler - The event handler function
     * @param {Object} context - Context object for error logging
     * @param {string} eventName - Event name for error context
     * @param {Object} errorHandler - Error handler instance (optional, falls back to global)
     * @returns {Function} Wrapped event handler with error handling
     */
    static createEventHandler(handler, context = null, eventName = '', errorHandler = null) {
      const h = errorHandler || globalThis.NOOP_ERROR_HANDLER;

      return function(data) {
        try {
          return handler.call(context || this, data);
        } catch (e) {
          const errorContext = context ? `${context.constructor.name || 'Unknown'}.${eventName}` : eventName;
          try { h.logError(e, `EventHandler.${errorContext}`, { eventData: data }); } catch (ignore) {}
        }
      };
    }

    /**
     * Sets up multiple event listeners with automatic cleanup tracking
     * @param {Object} eventBus - The event bus instance
     * @param {Array} listeners - Array of listener configurations
     * @param {Object} context - Context object for handlers
     * @param {Object} errorHandler - Error handler instance
     * @returns {Array} Array of unsubscribe functions
     *
     * Listener configuration format:
     * { event: 'EVENT_NAME', handler: function(data) {...}, context: optional }
     */
    static setupEventListeners(eventBus, listeners, context = null, errorHandler = null) {
      if (!eventBus || !Array.isArray(listeners)) {
        return [];
      }

      const h = errorHandler || globalThis.NOOP_ERROR_HANDLER;
      const unsubscribers = [];

      listeners.forEach(config => {
        if (!config.event || typeof config.handler !== 'function') {
          try { h.logWarning('Invalid listener configuration', 'EventUtils.setupEventListeners', { config }); } catch (ignore) {}
          return;
        }

        const handlerContext = config.context || context;
        const wrappedHandler = this.createEventHandler(
          config.handler,
          handlerContext,
          config.event,
          errorHandler
        );

        const unsubscribe = eventBus.on(config.event, wrappedHandler, handlerContext);
        if (typeof unsubscribe === 'function') {
          unsubscribers.push(unsubscribe);
        }
      });

      return unsubscribers;
    }

    /**
     * Cleans up event listeners by calling all unsubscribe functions
     * @param {Array} unsubscribers - Array of unsubscribe functions
     */
    static cleanupEventListeners(unsubscribers) {
      if (!Array.isArray(unsubscribers)) {
        return;
      }

      const h = globalThis.NOOP_ERROR_HANDLER;

      unsubscribers.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
          try {
            unsubscribe();
          } catch (e) {
            try { h.logWarning('Error during event listener cleanup', 'EventUtils.cleanupEventListeners', { error: e }); } catch (ignore) {}
          }
        }
      });
    }

    /**
     * Creates a batch event listener setup for classes with destroy() methods
     * @param {Object} target - Target object that will store unsubscribers
     * @param {string} propertyName - Property name to store unsubscribers array (default: '_eventUnsubscribers')
     * @returns {Object} Object with setup and cleanup methods
     */
    static createEventManager(target, propertyName = '_eventUnsubscribers') {
      if (!target) {
        throw new Error('Target object is required for EventManager');
      }

      // Initialize unsubscribers array if it doesn't exist
      if (!target[propertyName]) {
        target[propertyName] = [];
      }

      return {
        /**
         * Sets up event listeners and tracks them for cleanup
         * @param {Object} eventBus - The event bus instance
         * @param {Array} listeners - Array of listener configurations
         * @param {Object} context - Context object for handlers
         * @param {Object} errorHandler - Error handler instance
         */
        setup: function(eventBus, listeners, context = null, errorHandler = null) {
          const unsubscribers = EventUtils.setupEventListeners(eventBus, listeners, context || target, errorHandler);
          target[propertyName].push(...unsubscribers);
        },

        /**
         * Cleans up all tracked event listeners
         */
        cleanup: function() {
          EventUtils.cleanupEventListeners(target[propertyName]);
          target[propertyName] = [];
        }
      };
    }
  }

  // Export for different environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventUtils;
  } else if (typeof define === 'function' && define.amd) {
    define([], function() { return EventUtils; });
  } else {
    global.EventUtils = EventUtils;
  }

})(typeof window !== 'undefined' ? window : global);