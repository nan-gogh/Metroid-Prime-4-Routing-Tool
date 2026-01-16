// rendering/CompositeStage.js
// Composites sub-canvas layers onto the main display canvas
// This replaces the old OverlayClearStage concept and enables independent sub-canvas rendering

(function (global) {
  class CompositeStage {
    /**
     * Creates a new CompositeStage for layering sub-canvases onto the main display.
     * @param {Object} config - Configuration object
     */
    constructor(config) {
      this.config = config || {};
      this.errorHandler = global.errorHandler;
    }

    /**
     * Composites all sub-canvas layers onto the main display canvas.
     * Layer order (bottom to top):
     * 1. Grid canvas
     * 2. Marker canvas
     * 3. Route canvas
     * 4. Overlay canvas (transient elements)
     * 
     * @param {RenderContext} renderContext - The render context providing canvas access
     */
    render(renderContext) {
      if (!renderContext || !renderContext.ctx || !renderContext.canvas) return;

      try {
        const ctx = renderContext.ctx;
        const canvasSize = renderContext.getCanvasSize();

        // Clear the main display canvas
        ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

        // Composite sub-canvases in order (bottom to top)
        const layers = [
          { canvas: renderContext.canvasHeatmap, name: 'Heatmap' },
          { canvas: renderContext.canvasGrid, name: 'Grid' },
          { canvas: renderContext.canvasMarker, name: 'Marker' },
          { canvas: renderContext.canvasRoute, name: 'Route' },
          { canvas: renderContext.canvasOverlay, name: 'Overlay' }
        ];

        for (let layer of layers) {
          if (!layer.canvas) continue;
          try {
            // Draw this sub-canvas onto the main display canvas
            // drawImage is GPU-accelerated and very efficient
            ctx.drawImage(layer.canvas, 0, 0);
          } catch (e) {
            this.errorHandler && this.errorHandler.logDebug(
              `CompositeStage: Failed to composite ${layer.name} layer`,
              'CompositeStage.render.composite',
              { error: e, layerName: layer.name }
            );
          }
        }
      } catch (e) {
        this.errorHandler && this.errorHandler.logDebug(
          'CompositeStage: Failed to render',
          'CompositeStage.render',
          { error: e }
        );
      }
    }

    /**
     * Initialize any resources needed for compositing.
     */
    init() {
      // No initialization needed for composite stage
    }
  }

  // Export for use in other modules
  global.CompositeStage = CompositeStage;

})(typeof window !== 'undefined' ? window : this);
