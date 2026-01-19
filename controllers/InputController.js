// controllers/InputController.js
// Manages user input handlers (gesture, keyboard, pointer)
// Extracts input handler creation and initialization from map.js constructor

(function (global) {
  class InputController {
    constructor(options) {
      // Required dependencies
      this.map = options.map; // Reference to InteractiveMap instance
      this.eventBus = options.eventBus || window.eventBus;
      this.errorHandler = options.errorHandler;

      // Optional dependencies
      this.config = options.config || global.MP4Config || {};

      // Handler instances (created in init)
      this.gestureHandler = null;
      this.keyboardHandler = null;
      this.pointerHandler = null;
    }

    /**
     * Initialize input handlers
     */
    async init() {
      try {
        // Create and initialize handlers
        await this._createHandlers();
      } catch (e) {
        this.errorHandler.logError(e, 'InputController.init failed');
        throw e;
      }
    }

    /**
     * Create and initialize all input handlers
     * @private
     */
    async _createHandlers() {
      // GestureHandler - handles touch gestures
      if (typeof GestureHandler !== 'undefined') {
        this.gestureHandler = new GestureHandler(this.map, this.config);
        try {
          await this.gestureHandler.init();
        } catch (e) {
          console.debug('GestureHandler.init failed', 'InputController._createHandlers', { error: e });
        }
      }

      // PointerHandler - handles mouse/touch events
      if (typeof PointerHandler !== 'undefined') {
        this.pointerHandler = new PointerHandler(this.map, this.config, this.eventBus);
        try {
          await this.pointerHandler.init();
        } catch (e) {
          console.debug('PointerHandler.init failed', 'InputController._createHandlers', { error: e });
        }
      }

      // KeyboardHandler - handles keyboard shortcuts
      if (typeof KeyboardHandler !== 'undefined') {
        this.keyboardHandler = new KeyboardHandler(this.map, this.config, this.eventBus);
        try {
          await this.keyboardHandler.init();
        } catch (e) {
          console.debug('KeyboardHandler.init failed', 'InputController._createHandlers', { error: e });
        }
      }
    }

    /**
     * Get the gesture handler instance
     */
    getGestureHandler() {
      return this.gestureHandler;
    }

    /**
     * Get the keyboard handler instance
     */
    getKeyboardHandler() {
      return this.keyboardHandler;
    }

    /**
     * Get the pointer handler instance
     */
    getPointerHandler() {
      return this.pointerHandler;
    }

    /**
     * Clean up input handlers
     */
    destroy() {
      // Clean up handlers in reverse order
      const handlers = [this.keyboardHandler, this.pointerHandler, this.gestureHandler];

      handlers.forEach(handler => {
        if (handler && typeof handler.destroy === 'function') {
          try {
            handler.destroy();
          } catch (e) {
            console.debug(`Failed to destroy ${handler.constructor.name}`, 'InputController.destroy', { error: e });
          }
        }
      });

      // Clear references
      this.gestureHandler = null;
      this.keyboardHandler = null;
      this.pointerHandler = null;
    }
  }

  // Export for global access
  global.InputController = InputController;
})(typeof window !== 'undefined' ? window : global);
