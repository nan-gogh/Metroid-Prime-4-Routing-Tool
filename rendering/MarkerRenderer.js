// rendering/MarkerRenderer.js
// Minimal scaffold for marker drawing and hit-testing.

(function (global) {
  class MarkerRenderer {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.canvas = map.canvas || null;
      this.ctx = map.ctx || null;
    }

    init() {
      // Prepare any caches
    }

    render() {
      // Fully migrated marker rendering from map.renderMarkers()
      const map = this.map;
      const ctx = map.ctx;
      if (!ctx) return;
      const baseSize = map.getBaseMarkerRadius ? map.getBaseMarkerRadius() : 6;
      const detailScale = map.getDetailScale ? map.getDetailScale() : 1;
      const markerShrinkFactor = (typeof map.markerShrinkFactor === 'number') ? map.markerShrinkFactor : 0.6;
      const markerScale = 1 - (1 - detailScale) * markerShrinkFactor;
      try { map._markerSizeFrame = {}; } catch (e) { map._markerSizeFrame = {}; }
      const cssWidth = map.canvas.clientWidth;
      const cssHeight = map.canvas.clientHeight;
      const entries = Object.entries(LAYERS || {});
      for (let li = 0; li < entries.length; li++) {
        const layerKey = entries[li][0];
        const layer = entries[li][1];
        if (!map.layerVisibility[layerKey]) continue;
        if (!Array.isArray(layer.markers)) continue;
        const color = layer.color || '#888';
        for (let i = 0; i < layer.markers.length; i++) {
          const marker = layer.markers[i];
          const screenX = marker.x * MAP_SIZE * map.zoom + map.panX;
          const screenY = marker.y * MAP_SIZE * map.zoom + map.panY;
          if (screenX < -20 || screenX > cssWidth + 20 || screenY < -20 || screenY > cssHeight + 20) continue;
          const isSelected = map.selectedMarker && map.selectedMarker.uid === marker.uid && map.selectedMarkerLayer === layerKey;
          const size = map.getMarkerRenderSize(marker, layerKey);
          try { const key = (layerKey || '') + '|' + (marker && marker.uid ? String(marker.uid) : String(i)); map._markerSizeFrame[key] = size; } catch (e) {}

          if (isSelected) {
            try {
              ctx.save();
              ctx.shadowBlur = Math.max(6, size * 1.5);
              ctx.shadowColor = color;
              ctx.beginPath();
              ctx.arc(screenX, screenY, size + 2, 0, Math.PI * 2);
              ctx.fillStyle = color;
              ctx.fill();
              ctx.restore();
            } catch (e) { console.debug('MarkerRenderer: failed to draw selection halo', e); }
          }

          try {
            ctx.beginPath();
            ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          } catch (e) { console.debug('MarkerRenderer: failed to draw marker', e); }
        }
      }
    }

    hitTest(x, y) {
      if (typeof this.map.findMarkerAt === 'function') return this.map.findMarkerAt(x, y);
      return null;
    }
  }

  global.MarkerRenderer = MarkerRenderer;
})(window);
