// rendering/OverlayRenderer.js
// Handles transient overlay drawing: route preview dot + selected marker tooltip

(function (global) {
  class OverlayRenderer {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
    }

    init() {
      // no-op for now; kept for symmetry and future state
    }

    render() {
      try {
        const map = this.map;
        const ctx = map && map.ctx;
        if (!map || !ctx) return;

        // Draw transient route preview dot (when editing route)
        try {
          if (map.editRouteMode && map._routePreview) {
            const pos = (typeof RouteUtils !== 'undefined' && RouteUtils.getRoutePreviewScreenPosition) ? RouteUtils.getRoutePreviewScreenPosition(map._routePreview, map) : null;
            if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
              const px = pos.x;
              const py = pos.y;
              // Derive route color like RouteRenderer uses
              const routeHex = (LAYERS && LAYERS.route) ? LAYERS.route.color : null;
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
              } catch (e) {}
              const dotSize = (map.getRouteNodeSize && typeof map.getRouteNodeSize === 'function') ? map.getRouteNodeSize() : 6;
              ctx.save();
              ctx.beginPath();
              ctx.fillStyle = nodeFill || 'rgba(34, 211, 238, 1)';
              ctx.arc(px, py, dotSize, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
        } catch (e) { /* non-fatal */ }

        // Tooltip follow: prefer TooltipManager when available
        try {
          if (map.selectedMarker && map.selectedMarkerLayer) {
            const m = map.selectedMarker;
            const pos2 = (typeof MarkerUtils !== 'undefined' && MarkerUtils.getMarkerScreenPosition) ? MarkerUtils.getMarkerScreenPosition(m, map) : null;
            if (pos2 && typeof pos2.x === 'number' && typeof pos2.y === 'number') {
              // Compute canvas-local coords and offset into container
              let canvasOffsetLeft = 0, canvasOffsetTop = 0;
              try {
                const canvasRect = map.canvas.getBoundingClientRect();
                const parentRect = (map.canvas.parentElement && map.canvas.parentElement.getBoundingClientRect) ? map.canvas.parentElement.getBoundingClientRect() : { left: 0, top: 0 };
                canvasOffsetLeft = Math.round(canvasRect.left - parentRect.left);
                canvasOffsetTop = Math.round(canvasRect.top - parentRect.top);
              } catch (e) {}
              const tooltipX = Math.round(canvasOffsetLeft + pos2.x + 15);
              const tooltipY = Math.round(canvasOffsetTop + pos2.y - 10);
              if (map.tooltipManager && typeof map.tooltipManager.update === 'function') {
                try { map.tooltipManager.update(tooltipX, tooltipY); } catch (e) { console.debug('OverlayRenderer: tooltipManager update failed', e.message); }
              } else {
                try { map.showTooltip(m, pos2.x, pos2.y, map.selectedMarkerLayer); } catch (e) { console.debug('OverlayRenderer: showTooltip failed', e.message); }
              }
            }
          }
        } catch (e) { /* non-fatal */ }

        // Position selected marker tooltip (DOM)
        try {
          if (map.selectedMarker && map.selectedMarkerLayer) {
            const m = map.selectedMarker;
            const pos = (typeof MarkerUtils !== 'undefined' && MarkerUtils.getMarkerScreenPosition) ? MarkerUtils.getMarkerScreenPosition(m, map) : null;
            if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
              try { map.showTooltip(m, pos.x, pos.y, map.selectedMarkerLayer); } catch (e) {}
            }
          }
        } catch (e) { /* non-fatal */ }
      } catch (e) { console.debug('OverlayRenderer.render failed', e); }
    }
  }

  global.OverlayRenderer = OverlayRenderer;
})(window);
