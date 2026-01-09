// rendering/RouteRenderer.js
// Route rendering moved out of `map.js` to keep overlay logic modular.

(function (global) {
  class RouteRenderer {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
    }

    init() {
      // no-op for now; kept for parity with other renderers
    }

    render() {
      const map = this.map;
      if (!map) return;
      try {
        if (!map.currentRoute || !Array.isArray(map.currentRoute) || map.currentRoute.length === 0) return;
        if (!map.layerVisibility || !map.layerVisibility.route) return;
        if (!map._routeSources || !Array.isArray(map._routeSources)) return;

        const ctx = map.ctx;
        const n = map.currentRoute.length;
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const MAP_SIZE = (this.config && this.config.MAP_SIZE) ? this.config.MAP_SIZE : (typeof window !== 'undefined' && window.MAP_SIZE) ? window.MAP_SIZE : 8192;

        const routeHex = (typeof LAYERS !== 'undefined' && LAYERS.route) ? LAYERS.route.color : null;
        const hexToRgba = (h, a) => {
          if (!h || typeof h !== 'string') return null;
          let s = h.replace('#', '').trim();
          if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
          if (s.length === 4) s = s.split('').map(ch => ch + ch).join('');
          let r = 0, g = 0, b = 0, alphaFromHex = 1;
          if (s.length === 6) {
            r = parseInt(s.slice(0, 2), 16);
            g = parseInt(s.slice(2, 4), 16);
            b = parseInt(s.slice(4, 6), 16);
          } else if (s.length === 8) {
            r = parseInt(s.slice(0, 2), 16);
            g = parseInt(s.slice(2, 4), 16);
            b = parseInt(s.slice(4, 6), 16);
            alphaFromHex = parseInt(s.slice(6, 8), 16) / 255;
          } else {
            return null;
          }
          const alpha = (typeof a === 'number') ? (a * alphaFromHex) : alphaFromHex;
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        if (routeHex) ctx.strokeStyle = hexToRgba(routeHex, 1);
        const baseLine = (typeof map.routeLineWidth === 'number') ? map.routeLineWidth : 3;
        const detailScale = map.getDetailScale ? map.getDetailScale() : 1;
        ctx.lineWidth = Math.max(1, baseLine * map.zoom * detailScale);
        const spacingScale = Math.max(0.35, baseLine / 5);
        const dashLen = Math.max(3, 8 * map.zoom * spacingScale * detailScale);
        const gapLen = Math.max(3, 6 * map.zoom * spacingScale * detailScale);
        if (routeHex) {
          ctx.setLineDash([dashLen, gapLen]);
          ctx.lineDashOffset = -map._routeDashOffset;
        }

        try {
          const isHighlighted = !!(map.highlightedLayers && map.highlightedLayers.has('route'));
          if (isHighlighted) {
            try {
              const glowAlpha = 0.85;
              const glowColor = routeHex ? hexToRgba(routeHex, glowAlpha) : 'rgba(34,211,238,0.85)';
              ctx.save();
              ctx.beginPath();
              let glowPathStarted = false;
              for (let i = 0; i < n; i++) {
                const idx = map.currentRoute[i];
                const src = map._routeSources[idx];
                const m = src && src.marker;
                if (!m) continue;
                const x = m.x * MAP_SIZE * map.zoom + map.panX;
                const y = m.y * MAP_SIZE * map.zoom + map.panY;
                if (!glowPathStarted) { ctx.moveTo(x, y); glowPathStarted = true; } else ctx.lineTo(x, y);
              }
              if (map.routeLooping && n > 0) {
                const firstIdx = map.currentRoute[0];
                const firstSrc = map._routeSources[firstIdx];
                const firstM = firstSrc && firstSrc.marker;
                if (firstM) {
                  const x = firstM.x * MAP_SIZE * map.zoom + map.panX;
                  const y = firstM.y * MAP_SIZE * map.zoom + map.panY;
                  ctx.lineTo(x, y);
                }
              }
              const glowLine = Math.max(1, baseLine * map.zoom * detailScale) * 2.6;
              ctx.lineWidth = glowLine;
              ctx.strokeStyle = glowColor;
              ctx.shadowColor = glowColor;
              ctx.shadowBlur = 18;
              ctx.setLineDash([]);
              ctx.stroke();
              ctx.restore();
            } catch (e) { /* non-fatal */ }
          }
        } catch (e) { /* non-fatal */ }

        ctx.beginPath();
        let mainPathStarted = false;
        for (let i = 0; i < n; i++) {
          const idx = map.currentRoute[i];
          const src = map._routeSources[idx];
          const m = src && src.marker;
          if (!m) continue;
          const x = m.x * MAP_SIZE * map.zoom + map.panX;
          const y = m.y * MAP_SIZE * map.zoom + map.panY;
          if (!mainPathStarted) { ctx.moveTo(x, y); mainPathStarted = true; } else ctx.lineTo(x, y);
        }
        if (map.routeLooping && n > 0) {
          const firstIdx = map.currentRoute[0];
          const firstSrc = map._routeSources[firstIdx];
          const firstM = firstSrc && firstSrc.marker;
          if (firstM) {
            const x = firstM.x * MAP_SIZE * map.zoom + map.panX;
            const y = firstM.y * MAP_SIZE * map.zoom + map.panY;
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);

        const nodeFill = routeHex ? hexToRgba(routeHex, 0.95) : null;
        if (nodeFill) ctx.fillStyle = nodeFill;
        const dotSize = map.getRouteNodeSize ? map.getRouteNodeSize() : 6;
        for (let i = 0; i < n; i++) {
          const idx = map.currentRoute[i];
          const src = map._routeSources[idx];
          const m = src && src.marker;
          if (!m) continue;
          const x = m.x * MAP_SIZE * map.zoom + map.panX;
          const y = m.y * MAP_SIZE * map.zoom + map.panY;
          ctx.beginPath();
          ctx.arc(x, y, dotSize, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      } catch (e) {
        console.debug('RouteRenderer.render failed', e);
      }
    }
  }

  global.RouteRenderer = RouteRenderer;
})(window);
