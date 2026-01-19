// utils/EventUtils.js
// Utilities for standardized event handling patterns across the application

(function (global) {
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
      const eh = errorHandler || (global && (global.errorHandler || (global.window && global.window.errorHandler))) || null;

      return function(data) {
        try {
          return handler.call(context || this, data);
        } catch (e) {
          const errorContext = context ? `${context.constructor.name || 'Unknown'}.${eventName}` : eventName;
          if (eh && typeof eh.logError === 'function') {
            eh.logError(e, `EventHandler.${errorContext}`, { eventData: data });
          } else if (typeof ErrorHandler !== 'undefined') {
            try { new ErrorHandler().logError(e, `EventHandler.${errorContext}`, { eventData: data }); } catch (tmpErr) { /* best-effort */ }
          }
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

      const unsubscribers = [];

      listeners.forEach(config => {
        if (!config.event || typeof config.handler !== 'function') {
          const eh = errorHandler || (global && global.errorHandler) || null;
          if (eh && typeof eh.logWarning === 'function') {
            try { eh.logWarning('Invalid listener configuration', 'EventUtils.setupEventListeners', { config }); } catch (e) { /* best-effort */ }
          } else if (typeof ErrorHandler !== 'undefined') {
            try { new ErrorHandler().logWarning('Invalid listener configuration', 'EventUtils.setupEventListeners', { config }); } catch (e) { /* best-effort */ }
          }
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

      const eh = global && global.errorHandler ? global.errorHandler : (typeof window !== 'undefined' ? window.errorHandler : null);

      unsubscribers.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
          try {
            unsubscribe();
          } catch (e) {
            if (eh && typeof eh.logWarning === 'function') {
              try { eh.logWarning('Error during event listener cleanup', 'EventUtils.cleanupEventListeners', { error: e }); } catch (logErr) { /* best-effort */ }
            } else if (typeof ErrorHandler !== 'undefined') {
              try { new ErrorHandler().logWarning('Error during event listener cleanup', 'EventUtils.cleanupEventListeners', { error: e }); } catch (logErr) { /* best-effort */ }
            }
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