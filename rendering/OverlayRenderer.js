// rendering/OverlayRenderer.js
// Handles transient overlay drawing: selected marker tooltip and future UI elements

(function (global) {
  class OverlayRenderer {
    constructor(mapState, selectionState, routeState, config, routeColor) {
      this.mapState = mapState;
      this.selectionState = selectionState;
      this.routeState = routeState;
      this.config = config || (global.MP4Config || {});
      this.routeColor = routeColor || ((global.LAYERS && global.LAYERS.route) ? global.LAYERS.route.color : '#00ffb7ff');
      this.errorHandler = global.errorHandler;
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

        // Position selected marker tooltip (from SelectionState via DOM)
        // OverlayRenderer is responsible for updating tooltip position every frame to keep it anchored to the marker
        try {
          if (this.selectionState.selectedMarker && this.selectionState.selectedMarkerLayer) {
            const m = this.selectionState.selectedMarker;
            const layerKey = this.selectionState.selectedMarkerLayer;
            const pos = MarkerUtilsCore.getMarkerScreenPosition(m, {zoom: this.mapState.zoom, panX: this.mapState.panX, panY: this.mapState.panY}, this.config.MAP_SIZE || 8192);
            
            if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
              // Get the map instance from window global (all renderers have access to global map)
              // This is set in map.js during initialization
              const mapInstance = window.interactiveMap || (window.interactiveMapInstance && window.interactiveMapInstance());
              
              if (mapInstance && typeof mapInstance.showTooltip === 'function') {
                // showTooltip handles DOM positioning with container offset
                try {
                  mapInstance.showTooltip(m, pos.x, pos.y, layerKey);
                } catch (e) {
                  if (this.errorHandler) this.errorHandler.logDebug('OverlayRenderer: showTooltip failed', 'OverlayRenderer.render.showTooltip', { error: e, message: e.message });
                }
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
