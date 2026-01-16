// rendering/OverlayRenderer.js
// Handles transient overlay drawing: route preview dot + selected marker tooltip

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
        const ctx = renderContext.ctx;
        if (!ctx) return;

        // Draw transient route preview dot (when editing route)
        try {
          if (this.routeState.routePreview) {
            const pos = RouteUtilsCore.getRoutePreviewScreenPosition(this.routeState.routePreview, {zoom: this.mapState.zoom, panX: this.mapState.panX, panY: this.mapState.panY}, this.config.MAP_SIZE || 8192);
            if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
              const px = pos.x;
              const py = pos.y;
              // Derive route color like RouteRenderer uses
              const routeHex = this.routeColor;
              let nodeFill = null;
              try {
                  if (typeof ColorUtils !== 'undefined' && ColorUtils.hexToRgba) {
                      nodeFill = ColorUtils.hexToRgba(routeHex, 0.95);
                  } else if (routeHex && typeof routeHex === 'string') {
                      // simple hex -> rgba fallback
                      const s = routeHex.replace('#', '').trim();
                      let r = 34, g = 211, b = 238, a = 0.95;
                      if (s.length === 6) {
                          r = parseInt(s.slice(0,2),16);
                          g = parseInt(s.slice(2,4),16);
                          b = parseInt(s.slice(4,6),16);
                      } else if (s.length === 8) {
                          r = parseInt(s.slice(0,2),16);
                          g = parseInt(s.slice(2,4),16);
                          b = parseInt(s.slice(4,6),16);
                          a = parseInt(s.slice(6,8),16) / 255 * 0.95;
                      } else if (s.length === 3) {
                          r = parseInt(s[0]+s[0],16);
                          g = parseInt(s[1]+s[1],16);
                          b = parseInt(s[2]+s[2],16);
                      }
                      nodeFill = `rgba(${r}, ${g}, ${b}, ${a})`;
                  }
              } catch (e) { (this.errorHandler || global.errorHandler || console).error('OverlayRenderer.render: Failed to parse route color:', e); }
              const dotSize = (this.map.getRouteNodeSize && typeof this.map.getRouteNodeSize === 'function') ? this.map.getRouteNodeSize() : 6;
              ctx.save();
              ctx.beginPath();
              ctx.fillStyle = nodeFill || 'rgba(34, 211, 238, 1)';
              ctx.arc(px, py, dotSize, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
        } catch (e) { /* non-fatal */ }

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
