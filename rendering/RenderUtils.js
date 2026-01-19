// rendering/RenderUtils.js
// Shared rendering utilities: color conversion, coordinate helpers, and common shapes

(function (global) {
  const RenderUtils = {
    // Convert hex string (#RRGGBB, #RRGGBBAA, #RGB) to rgba(...) string.
    // Delegates to existing ColorUtils if available.
    hexToRgba(hex, alpha = 1) {
      try {
        if (typeof global.ColorUtils !== 'undefined' && typeof global.ColorUtils.hexToRgba === 'function') {
          return global.ColorUtils.hexToRgba(hex, alpha);
        }

        if (!hex || typeof hex !== 'string') return null;
        let s = hex.replace('#', '').trim();
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

        const a = (typeof alpha === 'number') ? (alpha * alphaFromHex) : alphaFromHex;
        return `rgba(${r}, ${g}, ${b}, ${a})`;
      } catch (e) {
        try { console.debug('RenderUtils.hexToRgba failed', 'RenderUtils.hexToRgba', { error: e, hex, alpha }); } catch (__) { }
        return null;
      }
    },

    // Draw a filled circle
    drawCircle(ctx, x, y, radius, fillStyle = null, strokeStyle = null) {
      if (!ctx) return;
      try {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        if (fillStyle) {
          ctx.fillStyle = fillStyle;
          ctx.fill();
        }
        if (strokeStyle) {
          ctx.strokeStyle = strokeStyle;
          ctx.stroke();
        }
      } catch (e) {
        try { console.debug('RenderUtils.drawCircle failed', 'RenderUtils.drawCircle', { error: e }); } catch (__) { }
      }
    },

    // Draw a rounded rectangle
    drawRoundedRect(ctx, x, y, w, h, r = 6, fillStyle = null, strokeStyle = null) {
      if (!ctx) return;
      try {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
        if (fillStyle) {
          ctx.fillStyle = fillStyle;
          ctx.fill();
        }
        if (strokeStyle) {
          ctx.strokeStyle = strokeStyle;
          ctx.stroke();
        }
      } catch (e) {
        try { console.debug('RenderUtils.drawRoundedRect failed', 'RenderUtils.drawRoundedRect', { error: e }); } catch (__) { }
      }
    },

    // Safe wrapper for transforming world coordinates to screen using mapState
    worldToScreen(mapState, worldX, worldY, mapSize) {
      try {
        const MAP_SIZE = mapSize || (typeof window !== 'undefined' && window.MAP_SIZE) || (mapState && mapState.MAP_SIZE) || 8192;
        if (!mapState) return null;
        const x = worldX * MAP_SIZE * (mapState.zoom || 1) + (mapState.panX || 0);
        const y = worldY * MAP_SIZE * (mapState.zoom || 1) + (mapState.panY || 0);
        return { x, y };
      } catch (e) {
        try { console.debug('RenderUtils.worldToScreen failed', 'RenderUtils.worldToScreen', { error: e }); } catch (__) { }
        return null;
      }
    }
  };

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RenderUtils;
  } else if (typeof define === 'function' && define.amd) {
    define([], function() { return RenderUtils; });
  } else {
    global.RenderUtils = RenderUtils;
  }

})(typeof window !== 'undefined' ? window : global);

