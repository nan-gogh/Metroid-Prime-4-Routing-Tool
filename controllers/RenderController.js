// controllers/RenderController.js
// Manages rendering pipeline, canvas setup, and all renderers
// Extracts renderer creation and pipeline setup from map.js constructor

(function (global) {
  class RenderController {
    constructor(options) {
      // Required dependencies
      this.mapState = options.mapState;
      this.tilesetState = options.tilesetState;
      this.imageState = options.imageState;
      this.eventBus = options.eventBus || window.eventBus;
      this.errorHandler = options.errorHandler;

      // Optional dependencies
      this.config = options.config || global.MP4Config || {};
      this.markerManager = options.markerManager;
      this.routeManager = options.routeManager;
      this.layerState = options.layerState;
      this.selectionState = options.selectionState;
      this.routeAnimationState = options.routeAnimationState;
      this.dragState = options.dragState;
      this.highlightState = options.highlightState;
      this.heatmapDisplayState = options.heatmapDisplayState;

      // Canvas references (passed from map) - can be object with {main,tiles,...} or individual canvases
      this.canvas = options.canvas;
      this.containerNode = options.containerNode;
      
      // Store map reference for RenderContext creation
      // This allows proper access to all canvas elements and contexts
      this.map = options.map || null;

      // Renderer instances (created in init)
      this.tileRenderer = null;
      this.heatmapRenderer = null;
      this.gridRenderer = null;
      this.markerRenderer = null;
      this.routeRenderer = null;
      this.overlayRenderer = null;
      this.renderPipeline = null;

      // Animation and rendering state
      this.animationFrameId = null;
      this.isDestroyed = false;

      // Event listener cleanup
      this._eventUnsubscribers = [];
    }

    /**
     * Initialize rendering system: create renderers, pipeline, and event subscriptions
     */
    async init() {
      try {
        // Set up ImageState callback for renderer dirty marking
        if (this.imageState) {
          this.imageState.setOnMarkRendererDirty((rendererName) => {
            this.markRendererDirty(rendererName);
          });
        }

        // Create renderers
        await this._createRenderers();

        // Set up render pipeline
        this._createRenderPipeline();

        // Set up event subscriptions
        this._setupEventSubscriptions();

        // Start initial render
        this._requestRender();

      } catch (e) {
        this.errorHandler.logError(e, 'RenderController.init failed');
        throw e;
      }
    }

    /**
     * Create and initialize all renderers
     * @private
     */
    async _createRenderers() {
      // TileRenderer
      if (typeof TileRenderer !== 'undefined') {
        this.tileRenderer = new TileRenderer(
          this.mapState,
          this.tilesetState,
          this.imageState,
          this.config,
          { lowSpec: false, errorHandler: this.errorHandler } // TODO: detect low spec
        );
        try {
          await this.tileRenderer.init();
        } catch (e) {
          console.debug('TileRenderer.init failed', 'RenderController._createRenderers', { error: e });
        }
      }

      // HeatmapRenderer
      if (typeof HeatmapRenderer !== 'undefined') {
        const layerConfig = {};
        if (typeof LAYERS !== 'undefined') {
          Object.keys(LAYERS).forEach(key => {
            layerConfig[key] = { ...LAYERS[key] };
          });
        }
        this.heatmapRenderer = new HeatmapRenderer(
          this.mapState,
          this.heatmapDisplayState,
          this.config,
          layerConfig,
          GREEN_CRYSTAL_LAYERS
        );
        try {
          await this.heatmapRenderer.init();
        } catch (e) {
          console.debug('HeatmapRenderer.init failed', 'RenderController._createRenderers', { error: e });
        }
      }

      // GridRenderer
      if (typeof GridRenderer !== 'undefined') {
        const layerConfig = {};
        if (typeof LAYERS !== 'undefined') {
          Object.keys(LAYERS).forEach(key => {
            layerConfig[key] = { ...LAYERS[key] };
          });
        }
        this.gridRenderer = new GridRenderer(
          this.mapState,
          this.layerState,
          this.highlightState,
          this.config,
          layerConfig,
          GREEN_CRYSTAL_LAYERS,
          this.layerState ? this.layerState.isHeatmapVisible() : false,
          { errorHandler: this.errorHandler }
        );
        try {
          await this.gridRenderer.init(this.containerNode);
        } catch (e) {
          console.debug('GridRenderer.init failed', 'RenderController._createRenderers', { error: e });
        }
      }

      // MarkerRenderer
      if (typeof MarkerRenderer !== 'undefined') {
        const layerConfig = {};
        if (typeof LAYERS !== 'undefined') {
          Object.keys(LAYERS).forEach(key => {
            layerConfig[key] = { ...LAYERS[key] };
            if (key === 'customMarkers') {
              delete layerConfig[key].markers; // Managed by markerManager
            }
          });
        }
        this.markerRenderer = new MarkerRenderer(
          this.mapState,
          this.layerState,
          this.selectionState,
          this.markerManager,
          this.config,
          layerConfig,
          this.highlightState
        );
        try {
          await this.markerRenderer.init();
        } catch (e) {
          console.debug('MarkerRenderer.init failed', 'RenderController._createRenderers', { error: e });
        }
      }

      // RouteRenderer
      if (typeof RouteRenderer !== 'undefined') {
        const routeColor = (typeof LAYERS !== 'undefined' && LAYERS.route) ? LAYERS.route.color : '#00ffb7ff';
        this.routeRenderer = new RouteRenderer(
          this.mapState,
          this.layerState,
          this.routeAnimationState,
          this.routeManager,
          this.dragState,
          this.highlightState,
          this.config,
          routeColor,
          { errorHandler: this.errorHandler }
        );
        try {
          await this.routeRenderer.init();
        } catch (e) {
          console.debug('RouteRenderer.init failed', 'RenderController._createRenderers', { error: e });
        }
      }

      // OverlayRenderer
      if (typeof OverlayRenderer !== 'undefined') {
        const routeColor = (typeof LAYERS !== 'undefined' && LAYERS.route) ? LAYERS.route.color : '#00ffb7ff';
        this.overlayRenderer = new OverlayRenderer(
          this.mapState,
          this.selectionState,
          this.config,
          routeColor,
          this.eventBus,
          { errorHandler: this.errorHandler }
        );
        try {
          await this.overlayRenderer.init();
        } catch (e) {
          console.debug('OverlayRenderer.init failed', 'RenderController._createRenderers', { error: e });
        }
      }
    }

    /**
     * Create render pipeline with all renderers
     * @private
     */
    _createRenderPipeline() {
      if (typeof RenderPipeline !== 'undefined') {
        // Create RenderContext - must pass InteractiveMap instance for proper canvas access
        const renderContext = typeof RenderContext !== 'undefined' && this.map ?
          RenderContext.fromMap(this.map) : null;

        // Create composite stage
        const compositeStage = typeof CompositeStage !== 'undefined' ?
          new CompositeStage() : null;

        // Pipeline order: Tile → Heatmap → Grid/Markers/Route/Overlay → Composite
        this.renderPipeline = new RenderPipeline([
          this.tileRenderer,
          this.heatmapRenderer,
          this.gridRenderer,
          this.markerRenderer,
          this.routeRenderer,
          this.overlayRenderer,
          compositeStage
        ].filter(Boolean), renderContext, this.mapState);
      }
    }

    /**
     * Set up event subscriptions for render triggers
     * NOTE: Event subscription is now coordinated by InteractiveMap (map.js) which is the single owner
     * of all render event coordination. RenderController focuses only on pipeline execution.
     * This avoids duplicate listeners and ensures consistent render batching.
     * @private
     */
    _setupEventSubscriptions() {
      // Subscribe to render intent events. Actual state-side effects (e.g. resolution
      // selection) are handled by InteractiveMap (`map.js`). RenderController only
      // listens for render intent events and executes the pipeline.
      if (!this.eventBus) return;

      try {
        // Full render requested
        const unsubFull = this.eventBus.on(window.EventTypes.RENDER_REQUESTED, (data) => {
          // Optionally allow callers to mark specific renderers dirty via data, but
          // default is a full render request.
          if (data && Array.isArray(data.renderers) && data.renderers.length > 0) {
            try {
              data.renderers.forEach(r => this.markRendererDirty(r));
            } catch (e) {
              try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions.renderers.forEach'); } catch (logErr) { try { console.debug('RenderController handler log failed', logErr); } catch (ignore) {} }
            }
          } else {
            // Mark all known renderers dirty so pipeline performs full render
            try {
              const all = ['TileRenderer', 'HeatmapRenderer', 'GridRenderer', 'MarkerRenderer', 'RouteRenderer', 'OverlayRenderer', 'CompositeStage'];
              all.forEach(name => this.markRendererDirty(name));
            } catch (e) {
              try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions.markAll'); } catch (logErr) { try { console.debug('RenderController handler log failed', logErr); } catch (ignore) {} }
            }
          }
          this._requestRender();
        });
        this._eventUnsubscribers.push(unsubFull);

        // Selective render requested (explicit renderer list)
        const unsubSelective = this.eventBus.on(window.EventTypes.RENDER_SELECTIVE_REQUESTED, (data) => {
          if (data && data.renderers && Array.isArray(data.renderers)) {
            try { data.renderers.forEach(r => this.markRendererDirty(r)); } catch (e) { try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions.renderers.forEach'); } catch (logErr) { try { console.debug('RenderController handler log failed', logErr); } catch (ignore) {} } }
            this._requestRender();
          }
        });
        this._eventUnsubscribers.push(unsubSelective);
        // Additional render-related subscriptions: listen for domain events that affect rendering
        const unsubLayerVis = this.eventBus.on(window.EventTypes.LAYER_VISIBILITY_CHANGED, (data) => {
          try {
            if (data && data.layerKey === 'grid') this.markRendererDirty('GridRenderer');
            this.markRendererDirty('MarkerRenderer');
            this.markRendererDirty('RouteRenderer');
            this.markRendererDirty('OverlayRenderer');
            this._requestRender();
          } catch (e) { try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions.LAYER_VISIBILITY_CHANGED'); } catch (logErr) { try { console.debug('RenderController handler log failed', logErr); } catch (ignore) {} } }
        });
        this._eventUnsubscribers.push(unsubLayerVis);

        const unsubTileset = this.eventBus.on(window.EventTypes.TILESET_CHANGED, (data) => {
          try { this.markRendererDirty('TileRenderer'); this._requestRender(); } catch (e) { try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions.TILESET_CHANGED'); } catch (logErr) { try { console.debug('RenderController handler log failed', logErr); } catch (ignore) {} } }
        });
        this._eventUnsubscribers.push(unsubTileset);

        const unsubTilesetGray = this.eventBus.on(window.EventTypes.TILESET_GRAYSCALE_CHANGED, (data) => {
          try { this.markRendererDirty('TileRenderer'); this._requestRender(); } catch (e) { try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions.TILESET_GRAYSCALE_CHANGED'); } catch (logErr) { try { console.debug('RenderController handler log failed', logErr); } catch (ignore) {} } }
        });
        this._eventUnsubscribers.push(unsubTilesetGray);

        const unsubDisplay = this.eventBus.on(window.EventTypes.DISPLAY_SETTINGS_CHANGED, (data) => {
          try {
            if (data && typeof data.gridVisible === 'boolean') this.markRendererDirty('GridRenderer');
            if (data && typeof data.heatmapVisible === 'boolean') this.markRendererDirty('HeatmapRenderer');
            this._requestRender();
          } catch (e) { try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions.DISPLAY_SETTINGS_CHANGED'); } catch (logErr) { try { console.debug('RenderController handler log failed', logErr); } catch (ignore) {} } }
        });
        this._eventUnsubscribers.push(unsubDisplay);

        const unsubHeatmapVis = this.eventBus.on(window.EventTypes.HEATMAP_VISIBILITY_CHANGED, (data) => {
          try { this.markRendererDirty('HeatmapRenderer'); this.markRendererDirty('CompositeStage'); this._requestRender(); } catch (e) { try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions.HEATMAP_VISIBILITY_CHANGED'); } catch (logErr) { try { console.debug('RenderController handler log failed', logErr); } catch (ignore) {} } }
        });
        this._eventUnsubscribers.push(unsubHeatmapVis);

        const unsubLayerHighlight = this.eventBus.on(window.EventTypes.LAYER_HIGHLIGHT_CHANGED, (data) => {
          try { this._requestRender(); } catch (e) { try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions.LAYER_HIGHLIGHT_CHANGED'); } catch (logErr) { try { console.debug('RenderController handler log failed', logErr); } catch (ignore) {} } }
        });
        this._eventUnsubscribers.push(unsubLayerHighlight);

        const unsubSelectionCleared = this.eventBus.on(window.EventTypes.SELECTION_CLEARED, (data) => {
          try { this.markRendererDirty('MarkerRenderer'); this.markRendererDirty('OverlayRenderer'); this._requestRender(); } catch (e) { try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions.SELECTION_CLEARED'); } catch (logErr) { try { console.debug('RenderController handler log failed', logErr); } catch (ignore) {} } }
        });
        this._eventUnsubscribers.push(unsubSelectionCleared);

        const unsubSelectionChanged = this.eventBus.on(window.EventTypes.SELECTION_CHANGED, (data) => {
          try { this.markRendererDirty('OverlayRenderer'); this._requestRender(); } catch (e) { try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions.SELECTION_CHANGED'); } catch (logErr) { try { console.debug('RenderController handler log failed', logErr); } catch (ignore) {} } }
        });
        this._eventUnsubscribers.push(unsubSelectionChanged);

        const unsubRouteUpdated = this.eventBus.on(window.EventTypes.ROUTE_UPDATED, (data) => {
          try { this.markRendererDirty('RouteRenderer'); this._requestRender(); } catch (e) { try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions.ROUTE_UPDATED'); } catch (logErr) { try { console.debug('RenderController handler log failed', logErr); } catch (ignore) {} } }
        });
        this._eventUnsubscribers.push(unsubRouteUpdated);
      } catch (e) {
        try { this.errorHandler && this.errorHandler.logError(e, 'RenderController._setupEventSubscriptions'); } catch (err) { /* swallow */ }
      }
    }

    /**
     * Request a render (batched via animation frame)
     * @private
     */
    _requestRender() {
      if (this.isDestroyed) return;

      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }

      this.animationFrameId = requestAnimationFrame(() => {
        this.animationFrameId = null;
        this._render();
      });
    }

    /**
     * Execute the actual render
     * @private
     */
    _render() {
      if (this.isDestroyed) return;

      try {
        if (this.renderPipeline && typeof this.renderPipeline.render === 'function') {
          this.renderPipeline.render();
        } else {
          // Fallback: render individual renderers
          this._renderFallback();
        }
      } catch (e) {
        console.debug('Render failed', 'RenderController._render', { error: e });
      }
    }

    /**
     * Fallback rendering when pipeline is not available
     * @private
     */
    _renderFallback() {
      const renderers = [
        this.tileRenderer,
        this.heatmapRenderer,
        this.gridRenderer,
        this.markerRenderer,
        this.routeRenderer,
        this.overlayRenderer
      ];

      renderers.forEach(renderer => {
        if (renderer && typeof renderer.render === 'function') {
          try {
            renderer.render();
          } catch (e) {
            console.debug(`Fallback render failed for ${renderer.constructor.name}`, 'RenderController._renderFallback', { error: e });
          }
        }
      });
    }

    /**
     * Mark a specific renderer as dirty for selective updates
     * @param {string} rendererName - Name of the renderer to mark dirty
     */
    markRendererDirty(rendererName) {
      if (this.renderPipeline && typeof this.renderPipeline.markDirty === 'function') {
        this.renderPipeline.markDirty(rendererName);

        // Mark composite stage dirty for sub-canvas renderers
        const subCanvasRenderers = ['HeatmapRenderer', 'GridRenderer', 'MarkerRenderer', 'RouteRenderer', 'OverlayRenderer'];
        if (subCanvasRenderers.includes(rendererName)) {
          this.renderPipeline.markDirty('CompositeStage');
        }
      } else {
        // Fallback: full render
        this._requestRender();
      }
    }

    /**
     * Get renderer by name
     * @param {string} name - Renderer name
     * @returns {Object|null} Renderer instance or null
     */
    getRenderer(name) {
      switch (name) {
        case 'TileRenderer': return this.tileRenderer;
        case 'HeatmapRenderer': return this.heatmapRenderer;
        case 'GridRenderer': return this.gridRenderer;
        case 'MarkerRenderer': return this.markerRenderer;
        case 'RouteRenderer': return this.routeRenderer;
        case 'OverlayRenderer': return this.overlayRenderer;
        default: return null;
      }
    }

    /**
     * Clean up resources and cancel rendering
     */
    destroy() {
      this.isDestroyed = true;

      // Cancel pending animation frame
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }

      // Clean up event listeners
      this._eventUnsubscribers.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (e) {
          console.debug('Failed to unsubscribe event listener', 'RenderController.destroy', { error: e });
        }
      });
      this._eventUnsubscribers = [];

      // Clean up renderers
      const renderers = [
        this.tileRenderer,
        this.heatmapRenderer,
        this.gridRenderer,
        this.markerRenderer,
        this.routeRenderer,
        this.overlayRenderer
      ];

      renderers.forEach(renderer => {
        if (renderer && typeof renderer.destroy === 'function') {
          try {
            renderer.destroy();
          } catch (e) {
            console.debug(`Failed to destroy ${renderer.constructor.name}`, 'RenderController.destroy', { error: e });
          }
        }
      });

      // Clean up pipeline
      if (this.renderPipeline && typeof this.renderPipeline.destroy === 'function') {
        try {
          this.renderPipeline.destroy();
        } catch (e) {
          console.debug('Failed to destroy renderPipeline', 'RenderController.destroy', { error: e });
        }
      }

      // Clear references
      this.tileRenderer = null;
      this.heatmapRenderer = null;
      this.gridRenderer = null;
      this.markerRenderer = null;
      this.routeRenderer = null;
      this.overlayRenderer = null;
      this.renderPipeline = null;
    }
  }

  // Export for global access
  global.RenderController = RenderController;
})(typeof window !== 'undefined' ? window : global);
