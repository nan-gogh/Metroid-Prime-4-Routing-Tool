// rendering/GridRenderer.js
// Minimal scaffold for grid overlay / quadrant label rendering.

(function (global) {
  class GridRenderer {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
    }

    init() {
      // Create grid DOM elements helper on the map for backward compatibility
      try {
        if (typeof this.map._createGridQuadLabels !== 'function') {
          this.map._createGridQuadLabels = () => {
            try {
              const parent = this.map.canvas && this.map.canvas.parentElement;
              if (!parent) return;
              // Keep original behavior (create #gridQuadLabels with empty spans)
              let container = parent.querySelector('#gridQuadLabels');
              if (!container) {
                container = document.createElement('div');
                container.id = 'gridQuadLabels';
                container.className = 'grid-quad-labels';
                container.setAttribute('aria-hidden', 'true');
                container.style.pointerEvents = 'none';
                parent.appendChild(container);
              }
              container.innerHTML = '';
              const cols = this.config.GRID.COLS, rows = this.config.GRID.ROWS;
              for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                  const colLetter = String.fromCharCode(65 + c);
                  const rowNumber = (r + 1).toString();
                  const span = document.createElement('div');
                  span.className = 'grid-quad-label';
                  span.dataset.col = c;
                  span.dataset.row = r;
                  const labelText = document.createElement('span');
                  labelText.className = 'grid-quad-index';
                  labelText.textContent = `${colLetter}${rowNumber}`;
                  const countBadge = document.createElement('span');
                  countBadge.className = 'grid-quad-count';
                  countBadge.setAttribute('aria-hidden', 'true');
                  countBadge.textContent = '';
                  span.appendChild(labelText);
                  span.appendChild(countBadge);
                  container.appendChild(span);
                }
              }
              container.style.display = 'none';
            } catch (e) { console.debug('GridRenderer.init._createGridQuadLabels failed', e); }
          };
        }

        // Ensure labels exist initially
        try { if (typeof this.map._createGridQuadLabels === 'function') this.map._createGridQuadLabels(); } catch (e) { console.debug('GridRenderer.init: createGridQuadLabels failed', e); }
      } catch (e) { console.debug('GridRenderer.init failed', e); }
    }

    updateQuadLabels() {
      try {
        const map = this.map;
        const parent = map.canvas && map.canvas.parentElement;
        const container = parent ? parent.querySelector('#gridQuadLabels') : null;
        if (!container) return;
        const shouldShow = !!(map.layerVisibility && map.layerVisibility.grid) && !!(map.highlightedLayers && map.highlightedLayers.has('grid'));
        container.style.display = shouldShow ? 'block' : 'none';
        if (!shouldShow) return;
        const cols = MP4Config.GRID.COLS, rows = MP4Config.GRID.ROWS;
        const gridSpacing = MAP_SIZE / MP4Config.GRID.COLS;
        const cssWidth = map.canvas.clientWidth;
        const cssHeight = map.canvas.clientHeight;
        const labels = container.querySelectorAll('.grid-quad-label');
        const fontMin = 12;
        const fontMax = 48;
        const fontSize = Math.max(fontMin, Math.min(fontMax, Math.round(map.zoom * 80)));
        const pad = Math.max(2, Math.round(fontSize * 0.18));
        const greenKeys = GREEN_CRYSTAL_LAYERS;
        const counts = new Array(cols * rows).fill(0);
        try {
          if (typeof LAYERS !== 'undefined') {
            greenKeys.forEach(k => {
              const layer = LAYERS[k];
              if (layer && Array.isArray(layer.markers)) {
                layer.markers.forEach(m => {
                  const mx = Number(m.x); const my = Number(m.y);
                  if (!isFinite(mx) || !isFinite(my)) return;
                  let cc = Math.floor(Math.min(cols - 1, Math.max(0, mx * cols)));
                  let rr = Math.floor(Math.min(rows - 1, Math.max(0, my * rows)));
                  counts[rr * cols + cc]++;
                });
              }
            });
          }
        } catch (e) { console.debug('GridRenderer.updateQuadLabels: failed to compute counts', e); }

        for (let i = 0; i < labels.length; i++) {
          const el = labels[i];
          const c = Number(el.dataset.col);
          const r = Number(el.dataset.row);
          const mapX = (gridSpacing * (c + 0.5));
          const mapY = (gridSpacing * (r + 0.5));
          const screenX = mapX * map.zoom + map.panX;
          const screenY = mapY * map.zoom + map.panY;
          el.style.left = Math.round(screenX) + 'px';
          el.style.top = Math.round(screenY) + 'px';
          el.style.fontSize = fontSize + 'px';
          el.style.padding = pad + 'px ' + (pad * 3) + 'px';
          const gapPx = Math.max(2, Math.round(fontSize * 0.12));
          el.style.gap = gapPx + 'px';
          const badge = el.querySelector('.grid-quad-count');
          if (badge) {
            const val = counts[r * cols + c] || 0;
            if (val > 0) {
              badge.textContent = val.toString();
              const countFont = fontSize;
              const countPadV = Math.max(2, Math.round(countFont * 0.15));
              const countPadH = Math.max(4, Math.round(countFont * 0.25));
              badge.style.fontSize = countFont + 'px';
              badge.style.lineHeight = countFont + 'px';
              badge.style.height = (countFont + countPadV * 2) + 'px';
              badge.style.minWidth = (countFont + countPadH * 2) + 'px';
              badge.style.padding = countPadV + 'px ' + countPadH + 'px';
              badge.style.borderRadius = Math.round((countFont + countPadV * 2) / 2) + 'px';
              badge.style.display = 'inline-block';
            } else {
              badge.textContent = '';
              badge.style.display = 'none';
            }
          }
        }
      } catch (e) { console.debug('GridRenderer.updateQuadLabels: non-fatal error', e); }
    }
  }

  global.GridRenderer = GridRenderer;
})(window);
