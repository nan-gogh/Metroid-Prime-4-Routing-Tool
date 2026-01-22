// controllers/RenderController.js
// Manages rendering pipeline, canvas setup, and all renderers
// Extracts renderer creation and pipeline setup from map.js constructor

(function (global) {
  if (typeof globalThis.__MP4_NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.__MP4_NOOP_ERROR_HANDLER = { logDebug: ()=>{}, logWarning: ()=>{}, logError: ()=>{} };
  }

  class RenderController {
    constructor(options) {
      // Required dependencies
      this.mapState = options.mapState;
      this.tilesetState = options.tilesetState;
      this.imageState = options.imageState;
      this.eventBus = options.eventBus || null;
      this.errorHandler = options.errorHandler || globalThis.__MP4_NOOP_ERROR_HANDLER;

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
      
      // Canvas/container inputs (prefer explicit canvas object instead of full `map`)
      // Expect `options.canvas` to be either a single canvas or an object with named canvases
      this.canvas = options.canvas;
      this.containerNode = options.containerNode;

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
      const h = this.errorHandler;
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
        h.logError(e, 'RenderController.init failed');
        throw e;
      }
    }

    /**
     * Create and initialize all renderers
     * @private
     */
    async _createRenderers() {
      const h = this.errorHandler;
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
          try { h.logWarning('TileRenderer.init failed', 'RenderController._createRenderers', { error: e }); } catch (ignore) {}
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
          try { h.logWarning('HeatmapRenderer.init failed', 'RenderController._createRenderers', { error: e }); } catch (ignore) {}
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
           try { h.logWarning('GridRenderer.init failed', 'RenderController._createRenderers', { error: e }); } catch (ignore) {}
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
           try { h.logWarning('MarkerRenderer.init failed', 'RenderController._createRenderers', { error: e }); } catch (ignore) {}
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
          { errorHandler: this.errorHandler, eventBus: this.eventBus }
        );
        try {
          await this.routeRenderer.init();
        } catch (e) {
           try { h.logWarning('RouteRenderer.init failed', 'RenderController._createRenderers', { error: e }); } catch (ignore) {}
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
           try { h.logWarning('OverlayRenderer.init failed', 'RenderController._createRenderers', { error: e }); } catch (ignore) {}
        }
      }
    }

    /**
     * Create render pipeline with all renderers
     * @private
     */
    _createRenderPipeline() {
      if (typeof RenderPipeline !== 'undefined') {
        // Build RenderContext from provided canvas object (avoid requiring full InteractiveMap)
        let renderContext = null;
        if (typeof RenderContext !== 'undefined' && this.canvas) {
          const canvases = this.canvas || {};
          const mainCanvas = canvases.main || canvases.canvas || null;
          const canvasTiles = canvases.tiles || canvases.tiles || null;
          const canvasHeatmap = canvases.heatmap || canvases.canvasHeatmap || null;
          const canvasGrid = canvases.grid || null;
          const canvasMarker = canvases.marker || null;
          const canvasRoute = canvases.route || null;
          const canvasOverlay = canvases.overlay || null;

          const ctx = mainCanvas && mainCanvas.getContext ? mainCanvas.getContext('2d') : null;
          const ctxTiles = canvasTiles && canvasTiles.getContext ? canvasTiles.getContext('2d') : null;
          const ctxHeatmap = canvasHeatmap && canvasHeatmap.getContext ? canvasHeatmap.getContext('2d') : null;
          const ctxGrid = canvasGrid && canvasGrid.getContext ? canvasGrid.getContext('2d') : null;
          const ctxMarker = canvasMarker && canvasMarker.getContext ? canvasMarker.getContext('2d') : null;
          const ctxRoute = canvasRoute && canvasRoute.getContext ? canvasRoute.getContext('2d') : null;
          const ctxOverlay = canvasOverlay && canvasOverlay.getContext ? canvasOverlay.getContext('2d') : null;

          renderContext = new RenderContext({
            canvas: mainCanvas,
            ctx: ctx,
            ctxTiles: ctxTiles,
            ctxHeatmap: ctxHeatmap,
            ctxGrid: ctxGrid,
            ctxMarker: ctxMarker,
            ctxRoute: ctxRoute,
            ctxOverlay: ctxOverlay,
            canvasHeatmap: canvasHeatmap,
            canvasGrid: canvasGrid,
            canvasMarker: canvasMarker,
            canvasRoute: canvasRoute,
            canvasOverlay: canvasOverlay,
            devicePixelRatio: (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1,
            errorHandler: this.errorHandler
          });
        }

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
        ].filter(Boolean), renderContext, this.mapState, { eventBus: this.eventBus, errorHandler: this.errorHandler, routeAnimationState: this.routeAnimationState });
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

      const h = this.errorHandler;

      try {
        // Full render requested
        const unsubFull = this.eventBus.on(window.EventTypes.RENDER_REQUESTED, (data) => {
          // Optionally allow callers to mark specific renderers dirty via data, but
          // default is a full render request.
          if (data && Array.isArray(data.renderers) && data.renderers.length > 0) {
            try {
              data.renderers.forEach(r => this.markRendererDirty(r));
            } catch (e) {
              try { h.logError(e, 'RenderController._setupEventSubscriptions.renderers.forEach'); } catch (err) { /* swallow */ }
            }
          } else {
            // Mark all known renderers dirty so pipeline performs full render
            try {
              const all = ['TileRenderer', 'HeatmapRenderer', 'GridRenderer', 'MarkerRenderer', 'RouteRenderer', 'OverlayRenderer', 'CompositeStage'];
              all.forEach(name => this.markRendererDirty(name));
            } catch (e) {
              try { h.logError(e, 'RenderController._setupEventSubscriptions.markAll'); } catch (err) { /* swallow */ }
            }
          }
          this._requestRender();
        });
        this._eventUnsubscribers.push(unsubFull);

        // Selective render requested (explicit renderer list)
        const unsubSelective = this.eventBus.on(window.EventTypes.RENDER_SELECTIVE_REQUESTED, (data) => {
          if (data && data.renderers && Array.isArray(data.renderers)) {
            try { data.renderers.forEach(r => this.markRendererDirty(r)); } catch (e) { try { h.logError(e, 'RenderController._setupEventSubscriptions.renderers.forEach'); } catch (err) { /* swallow */ } }
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
          } catch (e) { try { h.logError(e, 'RenderController._setupEventSubscriptions.LAYER_VISIBILITY_CHANGED'); } catch (err) { /* swallow */ } }
        });
        this._eventUnsubscribers.push(unsubLayerVis);

        const unsubTileset = this.eventBus.on(window.EventTypes.TILESET_CHANGED, (data) => {
          try { this.markRendererDirty('TileRenderer'); this._requestRender(); } catch (e) { try { h.logError(e, 'RenderController._setupEventSubscriptions.TILESET_CHANGED'); } catch (err) { /* swallow */ } }
        });
        this._eventUnsubscribers.push(unsubTileset);

        const unsubTilesetGray = this.eventBus.on(window.EventTypes.TILESET_GRAYSCALE_CHANGED, (data) => {
          try { this.markRendererDirty('TileRenderer'); this._requestRender(); } catch (e) { try { h.logError(e, 'RenderController._setupEventSubscriptions.TILESET_GRAYSCALE_CHANGED'); } catch (err) { /* swallow */ } }
        });
        this._eventUnsubscribers.push(unsubTilesetGray);

        const unsubDisplay = this.eventBus.on(window.EventTypes.DISPLAY_SETTINGS_CHANGED, (data) => {
          try {
            if (data && typeof data.gridVisible === 'boolean') this.markRendererDirty('GridRenderer');
            if (data && typeof data.heatmapVisible === 'boolean') this.markRendererDirty('HeatmapRenderer');
            this._requestRender();
          } catch (e) { try { h.logError(e, 'RenderController._setupEventSubscriptions.DISPLAY_SETTINGS_CHANGED'); } catch (err) { /* swallow */ } }
        });
        this._eventUnsubscribers.push(unsubDisplay);

        const unsubHeatmapVis = this.eventBus.on(window.EventTypes.HEATMAP_VISIBILITY_CHANGED, (data) => {
          try { this.markRendererDirty('HeatmapRenderer'); this.markRendererDirty('CompositeStage'); this._requestRender(); } catch (e) { try { h.logError(e, 'RenderController._setupEventSubscriptions.HEATMAP_VISIBILITY_CHANGED'); } catch (err) { /* swallow */ } }
        });
        this._eventUnsubscribers.push(unsubHeatmapVis);

        const unsubLayerHighlight = this.eventBus.on(window.EventTypes.LAYER_HIGHLIGHT_CHANGED, (data) => {
          try { this._requestRender(); } catch (e) { try { h.logError(e, 'RenderController._setupEventSubscriptions.LAYER_HIGHLIGHT_CHANGED'); } catch (err) { /* swallow */ } }
        });
        this._eventUnsubscribers.push(unsubLayerHighlight);

        const unsubSelectionCleared = this.eventBus.on(window.EventTypes.SELECTION_CLEARED, (data) => {
          try { this.markRendererDirty('MarkerRenderer'); this.markRendererDirty('OverlayRenderer'); this._requestRender(); } catch (e) { try { h.logError(e, 'RenderController._setupEventSubscriptions.SELECTION_CLEARED'); } catch (err) { /* swallow */ } }
        });
        this._eventUnsubscribers.push(unsubSelectionCleared);

        const unsubSelectionChanged = this.eventBus.on(window.EventTypes.SELECTION_CHANGED, (data) => {
          try { this.markRendererDirty('OverlayRenderer'); this._requestRender(); } catch (e) { try { h.logError(e, 'RenderController._setupEventSubscriptions.SELECTION_CHANGED'); } catch (err) { /* swallow */ } }
        });
        this._eventUnsubscribers.push(unsubSelectionChanged);

        const unsubRouteUpdated = this.eventBus.on(window.EventTypes.ROUTE_UPDATED, (data) => {
          try { this.markRendererDirty('RouteRenderer'); this._requestRender(); } catch (e) { try { h.logError(e, 'RenderController._setupEventSubscriptions.ROUTE_UPDATED'); } catch (err) { /* swallow */ } }
        });
        this._eventUnsubscribers.push(unsubRouteUpdated);
      } catch (e) {
        try { h.logError(e, 'RenderController._setupEventSubscriptions'); } catch (err) { /* swallow */ }
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

      const h = this.errorHandler;

      try {
        if (this.renderPipeline && typeof this.renderPipeline.render === 'function') {
          this.renderPipeline.render();
        } else {
          // Fallback: render individual renderers
          this._renderFallback();
        }
      } catch (e) {
        h.logWarning('Render failed', 'RenderController._render', { error: e });
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

      // Build renderContext and viewportContext once per fallback render
      const renderContext = (typeof RenderContext !== 'undefined' && this.canvas) ? (function(ctrl){
        const canvases = ctrl.canvas || {};
        const mainCanvas = canvases.main || canvases.canvas || null;
        const canvasTiles = canvases.tiles || null;
        const canvasHeatmap = canvases.heatmap || null;
        const canvasGrid = canvases.grid || null;
        const canvasMarker = canvases.marker || null;
        const canvasRoute = canvases.route || null;
        const canvasOverlay = canvases.overlay || null;
        const ctx = mainCanvas && mainCanvas.getContext ? mainCanvas.getContext('2d') : null;
        const ctxTiles = canvasTiles && canvasTiles.getContext ? canvasTiles.getContext('2d') : null;
        const ctxHeatmap = canvasHeatmap && canvasHeatmap.getContext ? canvasHeatmap.getContext('2d') : null;
        const ctxGrid = canvasGrid && canvasGrid.getContext ? canvasGrid.getContext('2d') : null;
        const ctxMarker = canvasMarker && canvasMarker.getContext ? canvasMarker.getContext('2d') : null;
        const ctxRoute = canvasRoute && canvasRoute.getContext ? canvasRoute.getContext('2d') : null;
        const ctxOverlay = canvasOverlay && canvasOverlay.getContext ? canvasOverlay.getContext('2d') : null;
        return new RenderContext({ canvas: mainCanvas, ctx: ctx, ctxTiles: ctxTiles, ctxHeatmap: ctxHeatmap, ctxGrid: ctxGrid, ctxMarker: ctxMarker, ctxRoute: ctxRoute, ctxOverlay: ctxOverlay, canvasHeatmap: canvasHeatmap, canvasGrid: canvasGrid, canvasMarker: canvasMarker, canvasRoute: canvasRoute, canvasOverlay: canvasOverlay, devicePixelRatio: (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1, errorHandler: ctrl.errorHandler });
      })(this) : null;
      const viewportContext = (typeof ViewportContext !== 'undefined' && this.mapState) ? ViewportContext.fromMapState(this.mapState) : null;
      // Snapshot animation offset from routeAnimationState once per fallback render
      try {
        if (viewportContext && this.routeAnimationState && typeof this.routeAnimationState.getAnimationOffset === 'function') {
          viewportContext.routeDashOffset = this.routeAnimationState.getAnimationOffset() || 0;
        }
      } catch (e) { try { this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'RenderController._renderFallback.snapshotAnimationOffset'); } catch (__) {} }

      renderers.forEach(renderer => {
        if (renderer && typeof renderer.render === 'function') {
          try {
            renderer.render(renderContext, viewportContext);
          } catch (e) {
            const h = this.errorHandler;
            h.logWarning(`Fallback render failed for ${renderer.constructor.name}`, 'RenderController._renderFallback', { error: e });
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
          this.errorHandler.logWarning('Failed to unsubscribe event listener', 'RenderController.destroy', { error: e });
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
            this.errorHandler.logWarning(`Failed to destroy ${renderer.constructor.name}`, 'RenderController.destroy', { error: e });
          }
        }
      });

      // Clean up pipeline
      if (this.renderPipeline && typeof this.renderPipeline.destroy === 'function') {
        try {
          this.renderPipeline.destroy();
        } catch (e) {
          this.errorHandler.logWarning('Failed to destroy renderPipeline', 'RenderController.destroy', { error: e });
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
