// rendering/OverlayRenderer.js
// Handles transient overlay drawing: selected marker tooltip and future UI elements

(function (global) {
  class OverlayRenderer {
    constructor(mapState, selectionState, config, routeColor, eventBus) {
      this.mapState = mapState;
      this.selectionState = selectionState;
      this.config = config || (global.MP4Config || {});
      this.routeColor = routeColor || ((global.LAYERS && global.LAYERS.route) ? global.LAYERS.route.color : '#00ffb7ff');
      this.errorHandler = global.errorHandler;
      this.eventBus = eventBus || (global.eventBus || null);
      // No direct map reference needed - all access through state managers and renderContext
    }

    init() {
      // No initialization needed beyond constructor
    }

    render(renderContext) {
      try {
        if (!renderContext || !renderContext.ctxOverlay) return;

        // Clear overlay canvas at start of frame
        if (renderContext.canvasOverlay) {
          const overlayCanvas = renderContext.canvasOverlay;
          const ctx = renderContext.ctxOverlay;
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        const ctx = renderContext.ctxOverlay;
        if (!ctx) return;

        // Position selected marker tooltip (from SelectionState via event bus)
        // OverlayRenderer emits tooltip position updates and map.js handles DOM positioning
        try {
          if (this.selectionState.selectedMarker && this.selectionState.selectedMarkerLayer) {
            const m = this.selectionState.selectedMarker;
            const layerKey = this.selectionState.selectedMarkerLayer;
            const pos = MarkerUtilsCore.getMarkerScreenPosition(m, {zoom: this.mapState.zoom, panX: this.mapState.panX, panY: this.mapState.panY}, this.config.MAP_SIZE || 8192);
            
            if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
              // Emit tooltip position update event instead of calling map directly
              if (this.eventBus) {
                try {
                  this.eventBus.emit(window.EventTypes.TOOLTIP_SHOW_REQUESTED, {
                    marker: m,
                    x: pos.x,
                    y: pos.y,
                    layerKey: layerKey
                  });
                } catch (e) {
                  if (this.errorHandler) this.errorHandler.logDebug('OverlayRenderer: Failed to emit tooltip event', 'OverlayRenderer.render.tooltipEvent', { error: e });
                }
              }
            }
          } else {
            // Hide tooltip if no marker selected
            if (this.eventBus) {
              try {
                this.eventBus.emit(window.EventTypes.TOOLTIP_HIDE_REQUESTED, {});
              } catch (e) {
                if (this.errorHandler) this.errorHandler.logDebug('OverlayRenderer: Failed to emit hide tooltip event', 'OverlayRenderer.render.hideTooltipEvent', { error: e });
              }
            }
          }
        } catch (e) {
          if (this.errorHandler) this.errorHandler.logDebug('OverlayRenderer.render: Tooltip positioning failed', 'OverlayRenderer.render.tooltip', { error: e });
        }
      } catch (e) { this.errorHandler.logDebug('OverlayRenderer.render failed', 'OverlayRenderer.render', { error: e }); }
    }
  }

  global.OverlayRenderer = OverlayRenderer;
})(window);
