// controllers/InputController.js
// Manages user input handlers (gesture, keyboard, pointer)
// Extracts input handler creation and initialization from map.js constructor

(function (global) {
  if (typeof globalThis.NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.NOOP_ERROR_HANDLER = { logDebug: function () {}, logWarning: function () {}, logError: function () {} };
  }

  class InputController {
    constructor(options) {
      // Required dependencies (accept explicit small services instead of full `map`)
      this.eventBus = options.eventBus || null;
      this.errorHandler = options.errorHandler || globalThis.NOOP_ERROR_HANDLER;

      // Build a lightweight map-like object for legacy handlers that still expect `map`
      this._mapLike = {
        mapState: options.mapState || null,
        selectionState: options.selectionState || null,
        routeState: options.routeState || null,
        layerState: options.layerState || null,
        tilesetState: options.tilesetState || null,
        imageState: options.imageState || null,
        heatmapDisplayState: options.heatmapDisplayState || null,
        editModeState: options.editModeState || null,
        routeController: options.routeController || null,
        routeManager: options.routeManager || null,
        markerManager: options.markerManager || null,
        markerRenderer: options.markerRenderer || null,
        layerVisibility: options.layerVisibility || null,
        layerConfig: options.layerConfig || null,
        dragState: options.dragState || null,
        canvas: options.canvas || null,
        _showGridHeatmap: (options._showGridHeatmap === undefined) ? false : options._showGridHeatmap,
        // Action hooks (optional)
        zoomIn: options.zoomIn || function () {},
        zoomOut: options.zoomOut || function () {},
        resetView: options.resetView || function () {},
        expandRouteNearby: options.expandRouteNearby || function () {},
        setGridHeatmap: options.setGridHeatmap || function () {},
        showTooltip: options.showTooltip || null,
        hideTooltip: options.hideTooltip || null,
        saveViewToStorage: options.saveViewToStorage || null,
        checkMarkerHover: options.checkMarkerHover || null,
        updateResolution: options.updateResolution || null
      };

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
      const h = this.errorHandler;

      // GestureHandler - handles touch gestures
      if (typeof GestureHandler !== 'undefined') {
        this.gestureHandler = new GestureHandler(this._mapLike, this.config);
        try {
          await this.gestureHandler.init();
        } catch (e) {
          try { h.logWarning('GestureHandler.init failed', 'InputController._createHandlers', { error: e }); } catch (ignore) {}
        }
      }

      // PointerHandler - handles mouse/touch events
      if (typeof PointerHandler !== 'undefined') {
        this.pointerHandler = new PointerHandler({
          mapState: this._mapLike.mapState,
          canvas: this._mapLike.canvas,
          markerManager: this._mapLike.markerManager,
          markerRenderer: this._mapLike.markerRenderer,
          layerVisibility: this._mapLike.layerVisibility,
          layerConfig: this._mapLike.layerConfig,
          eventBus: this.eventBus,
          errorHandler: this.errorHandler,
          gestureHandler: this.gestureHandler,
          selectionState: this._mapLike.selectionState,
          editModeState: this._mapLike.editModeState,
          dragState: this._mapLike.dragState,
          imageState: this._mapLike.imageState,
          checkMarkerHover: this._mapLike.checkMarkerHover ? this._mapLike.checkMarkerHover.bind(this._mapLike) : null,
          saveViewToStorage: this._mapLike.saveViewToStorage ? this._mapLike.saveViewToStorage.bind(this._mapLike) : null,
          showTooltip: this._mapLike.showTooltip ? this._mapLike.showTooltip.bind(this._mapLike) : null,
          hideTooltip: this._mapLike.hideTooltip ? this._mapLike.hideTooltip.bind(this._mapLike) : null,
          updateResolution: this._mapLike.updateResolution ? this._mapLike.updateResolution.bind(this._mapLike) : null,
          routeManager: this._mapLike.routeManager,
          routeController: this._mapLike.routeController,
          config: this.config
        }, this.config, this.eventBus);
        try {
          await this.pointerHandler.init();
        } catch (e) {
          try { h.logWarning('PointerHandler.init failed', 'InputController._createHandlers', { error: e }); } catch (ignore) {}
        }
      }

      // KeyboardHandler - handles keyboard shortcuts
      if (typeof KeyboardHandler !== 'undefined') {
        this.keyboardHandler = new KeyboardHandler(this._mapLike, this.config, this.eventBus);
        try {
          await this.keyboardHandler.init();
        } catch (e) {
          try { h.logWarning('KeyboardHandler.init failed', 'InputController._createHandlers', { error: e }); } catch (ignore) {}
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
            try { this.errorHandler.logWarning(`Failed to destroy ${handler.constructor.name}`, 'InputController.destroy', { error: e }); } catch (ignore) {}
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
