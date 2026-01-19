// state/BaseStateManager.js
// Abstract base class for all state managers providing common patterns and utilities

(function (global) {
  class BaseStateManager {
    /**
     * Base constructor for all state managers
     * @param {Object} config - Application configuration object
     * @param {Object} options - Options object
     * @param {EventBus} options.eventBus - Event bus for cross-module communication
     * @param {ErrorHandler} options.errorHandler - Error handler for logging
     */
    constructor(config, options = {}) {
      this.config = config || (global.MP4Config || {});
      this.eventBus = options.eventBus || (typeof window !== 'undefined' ? window.eventBus : null) || (typeof global !== 'undefined' ? global.eventBus : null);
      this.errorHandler = options.errorHandler || new ErrorHandler();
    }

    /**
     * Emit a change event through the event bus
     * @param {string} event - Event type to emit
     * @param {Object} data - Event data payload
     * @protected
     */
    _emitChange(event, data) {
      try {
        if (this.eventBus) {
          this.eventBus.emit(event, data);
        }
      } catch (e) {
        console.debug(`${this.constructor.name}._emitChange failed`, `${this.constructor.name}._emitChange`, { error: e, event });
      }
    }

    /**
     * Save state to persistent storage
     * @abstract
     * @returns {boolean} Success status
     */
    saveToStorage() {
      // Abstract method - subclasses must implement
      throw new Error(`${this.constructor.name}.saveToStorage() must be implemented by subclass`);
    }

    /**
     * Load state from persistent storage
     * @abstract
     * @returns {boolean} Success status
     */
    loadFromStorage() {
      // Abstract method - subclasses must implement
      throw new Error(`${this.constructor.name}.loadFromStorage() must be implemented by subclass`);
    }

    /**
     * Get the class name for logging purposes
     * @returns {string} Class name
     * @protected
     */
    _getClassName() {
      return this.constructor.name;
    }
  }

  // Export to global scope
  global.BaseStateManager = BaseStateManager;

})(typeof window !== 'undefined' ? window : global);
