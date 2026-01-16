// rendering/RenderContext.js
// Encapsulates canvas and rendering context access for renderers

(function (global) {
  class RenderContext {
    /**
     * Creates a new RenderContext instance that provides clean access to rendering surfaces.
     * @param {Object} options - Configuration options
     * @param {HTMLCanvasElement} options.canvas - Main overlay canvas (display composite)
     * @param {CanvasRenderingContext2D} options.ctx - Main overlay context
     * @param {CanvasRenderingContext2D} options.ctxTiles - Background tiles context
     * @param {CanvasRenderingContext2D} options.ctxHeatmap - Heatmap context
     * @param {CanvasRenderingContext2D} options.ctxGrid - Grid layer context (sub-canvas)
     * @param {CanvasRenderingContext2D} options.ctxMarker - Marker layer context (sub-canvas)
     * @param {CanvasRenderingContext2D} options.ctxRoute - Route layer context (sub-canvas)
     * @param {CanvasRenderingContext2D} options.ctxOverlay - Overlay layer context (sub-canvas)
     * @param {HTMLCanvasElement} options.canvasHeatmap - Heatmap canvas element
     * @param {HTMLCanvasElement} options.canvasGrid - Grid sub-canvas element
     * @param {HTMLCanvasElement} options.canvasMarker - Marker sub-canvas element
     * @param {HTMLCanvasElement} options.canvasRoute - Route sub-canvas element
     * @param {HTMLCanvasElement} options.canvasOverlay - Overlay sub-canvas element
     * @param {number} options.devicePixelRatio - Device pixel ratio for scaling
     */
    constructor(options) {
      // Main composite canvas
      this.canvas = options.canvas;
      this.ctx = options.ctx;
      
      // Background layers
      this.ctxTiles = options.ctxTiles;
      this.ctxHeatmap = options.ctxHeatmap;
      
      // Sub-canvas contexts (independent layers for selective rendering)
      this.ctxGrid = options.ctxGrid;
      this.ctxMarker = options.ctxMarker;
      this.ctxRoute = options.ctxRoute;
      this.ctxOverlay = options.ctxOverlay;
      
      // Sub-canvas elements (for sizing and positioning)
      this.canvasHeatmap = options.canvasHeatmap;
      this.canvasGrid = options.canvasGrid;
      this.canvasMarker = options.canvasMarker;
      this.canvasRoute = options.canvasRoute;
      this.canvasOverlay = options.canvasOverlay;
      
      this.devicePixelRatio = options.devicePixelRatio || 1;

      // Error handler for context operations
      this.errorHandler = options.errorHandler || global.errorHandler;
    }

    /**
     * Factory method to create RenderContext from an InteractiveMap instance.
     * @param {InteractiveMap} map - The map instance to extract context from
     * @returns {RenderContext} New RenderContext instance
     */
    static fromMap(map) {
      return new RenderContext({
        // Main display canvas
        canvas: map.canvas,
        ctx: map.ctx,
        
        // Background layers
        ctxTiles: map.ctxTiles,
        ctxHeatmap: map.ctxHeatmap,
        
        // Sub-canvases (independent layers)
        ctxGrid: map.ctxGrid,
        ctxMarker: map.ctxMarker,
        ctxRoute: map.ctxRoute,
        ctxOverlay: map.ctxOverlay,
        canvasHeatmap: map.canvasHeatmap,
        canvasGrid: map.canvasGrid,
        canvasMarker: map.canvasMarker,
        canvasRoute: map.canvasRoute,
        canvasOverlay: map.canvasOverlay,
        
        devicePixelRatio: map.devicePixelRatio || 1,
        errorHandler: map.errorHandler
      });
    }

    /**
     * Gets the CSS dimensions of the main canvas.
     * @returns {Object} Object with width and height properties
     */
    getCanvasSize() {
      return {
        width: this.canvas ? this.canvas.clientWidth : 0,
        height: this.canvas ? this.canvas.clientHeight : 0
      };
    }

    /**
     * Gets the actual pixel dimensions of the main canvas.
     * @returns {Object} Object with width and height properties
     */
    getCanvasPixelSize() {
      return {
        width: this.canvas ? this.canvas.width : 0,
        height: this.canvas ? this.canvas.height : 0
      };
    }

    /**
     * Safely clears a rectangular area on the main context.
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Width to clear
     * @param {number} height - Height to clear
     */
    clearRect(x, y, width, height) {
      try {
        if (this.ctx) {
          this.ctx.clearRect(x, y, width, height);
        }
      } catch (e) {
        this.errorHandler && this.errorHandler.logError(e, 'RenderContext.clearRect');
      }
    }

    /**
     * Safely saves the current context state.
     */
    save() {
      try {
        if (this.ctx) {
          this.ctx.save();
        }
      } catch (e) {
        this.errorHandler && this.errorHandler.logError(e, 'RenderContext.save');
      }
    }

    /**
     * Safely restores the previous context state.
     */
    restore() {
      try {
        if (this.ctx) {
          this.ctx.restore();
        }
      } catch (e) {
        this.errorHandler && this.errorHandler.logError(e, 'RenderContext.restore');
      }
    }

    /**
     * Validates that all required contexts are available.
     * @returns {boolean} True if all contexts are valid
     */
    isValid() {
      return !!(this.canvas && this.ctx);
    }

    /**
     * Gets a summary of the render context state for debugging.
     * @returns {Object} Context state information
     */
    getDebugInfo() {
      return {
        hasCanvas: !!this.canvas,
        hasCtx: !!this.ctx,
        hasCtxTiles: !!this.ctxTiles,
        hasCtxHeatmap: !!this.ctxHeatmap,
        canvasSize: this.getCanvasSize(),
        canvasPixelSize: this.getCanvasPixelSize(),
        devicePixelRatio: this.devicePixelRatio
      };
    }
  }

  // Export for use in other modules
  global.RenderContext = RenderContext;

})(typeof window !== 'undefined' ? window : this);