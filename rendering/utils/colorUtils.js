// rendering/utils/colorUtils.js
// Small color utilities for converting hex colors to rgba strings

(function (global) {
  const ColorUtils = {
    // Convert #RRGGBB or #RRGGBBAA or short forms to rgba(r,g,b,a)
    hexToRgba(hex, alpha = 1) {
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
    }
  };

  global.ColorUtils = ColorUtils;
})(window);
