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
          { lowSpec: false } // TODO: detect low spec
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
          this.layerState ? this.layerState.isHeatmapVisible() : false
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
          routeColor
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
          this.eventBus
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
        ].filter(Boolean), renderContext);
      }
    }

    /**
     * Set up event subscriptions for render triggers
     * @private
     */
    _setupEventSubscriptions() {
      // Pan/zoom events
      this._eventUnsubscribers.push(
        this.eventBus.on('pan', () => this._requestRender()),
        this.eventBus.on('zoom', () => this._requestRender()),
        this.eventBus.on('map:reset', () => this._requestRender())
      );

      // Selection changes
      this._eventUnsubscribers.push(
        this.eventBus.on('selection:changed', () => this._requestRender()),
        this.eventBus.on('marker:selected', () => this._requestRender()),
        this.eventBus.on('marker:deselected', () => this._requestRender())
      );

      // Layer visibility changes
      this._eventUnsubscribers.push(
        this.eventBus.on('layer:toggled', () => this._requestRender()),
        this.eventBus.on('layer:visibility-changed', () => this._requestRender())
      );

      // Route changes
      this._eventUnsubscribers.push(
        this.eventBus.on('route:updated', () => this._requestRender()),
        this.eventBus.on('route:cleared', () => this._requestRender()),
        this.eventBus.on('route:marker-added', () => this._requestRender()),
        this.eventBus.on('route:marker-removed', () => this._requestRender())
      );

      // Marker changes
      this._eventUnsubscribers.push(
        this.eventBus.on('marker:added', () => this._requestRender()),
        this.eventBus.on('marker:removed', () => this._requestRender()),
        this.eventBus.on('marker:updated', () => this._requestRender())
      );
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
