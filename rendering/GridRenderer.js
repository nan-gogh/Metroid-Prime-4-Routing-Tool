// rendering/GridRenderer.js
// Minimal scaffold for grid overlay / quadrant label rendering.

(function (global) {
  class GridRenderer {
    /**
     * Creates a new GridRenderer instance for rendering grid overlays and quadrant labels.
     * @param {Object} map - The map instance that owns this renderer
     * @param {Object} config - Configuration object (defaults to global MP4Config)
     */
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
    }

    /**
     * Initializes the grid renderer by creating DOM elements for quadrant labels.
     * Sets up a positioned container with grid labels (A1, B1, etc.) that can display marker counts.
     */
    init() {
      try {
        const parent = this.map.canvas && this.map.canvas.parentElement;
        if (!parent) return;
        // Ensure parent is positioned so absolute children align
        try { if (window.getComputedStyle(parent).position === 'static') parent.style.position = 'relative'; } catch (e) { /* ignore */ }
        // Container for labels
        let container = parent.querySelector('#gridQuadLabels');
        if (!container) {
          container = document.createElement('div');
          container.id = 'gridQuadLabels';
          container.className = 'grid-quad-labels';
          container.setAttribute('aria-hidden', 'true');
          // pointer-events none so labels don't interfere with map interaction
          container.style.pointerEvents = 'none';
          parent.appendChild(container);
        }
        container.innerHTML = '';
        // Create label grid using configured columns/rows
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
        this._labelsContainer = container;
      } catch (e) { console.debug('GridRenderer.init failed', e); }
    }

    /**
     * Renders the grid overlay when the grid layer is enabled.
     * Includes quadrant grid lines, detail grid, axis labels, and updates DOM quadrant labels.
     */
    render() {
      try {
        const map = this.map;
        // Only render the grid when the runtime grid layer is enabled
        if (!map || !(map.layerVisibility && map.layerVisibility.grid)) return;
        try { this.renderQuadrantGrid(); } catch (e) { console.debug('GridRenderer.render: renderQuadrantGrid failed', e); }
        try { this.renderDetailGrid(); } catch (e) { console.debug('GridRenderer.render: renderDetailGrid failed', e); }
        // Keep DOM labels in sync
        try { this.updateQuadLabels(); } catch (e) { console.debug('GridRenderer.render: updateQuadLabels failed', e); }
      } catch (e) { console.debug('GridRenderer.render: non-fatal error', e); }
    }

    /**
     * Draws the quadrant grid that separates the map into 4 equal sections.
     * Renders cyan crosshairs at the map center with zoom-scaled opacity.
     */
    renderQuadrantGrid() {
      try {
        const map = this.map;
        const ctx = map && map.ctx;
        const cssWidth = map.canvas.clientWidth;
        const cssHeight = map.canvas.clientHeight;

        // Map boundaries in screen coordinates
        const mapScreenLeft = 0 * map.zoom + map.panX;
        const mapScreenTop = 0 * map.zoom + map.panY;
        const mapScreenRight = MAP_SIZE * map.zoom + map.panX;
        const mapScreenBottom = MAP_SIZE * map.zoom + map.panY;

        // Map center is at (MAP_SIZE/2, MAP_SIZE/2) in normalized coords
        // Calculate screen position of center
        const mapCenterX = (MAP_SIZE / 2) * map.zoom + map.panX;
        const mapCenterY = (MAP_SIZE / 2) * map.zoom + map.panY;

        // Only draw grid lines if they're visible on screen
        if (mapCenterX > mapScreenLeft && mapCenterX < mapScreenRight &&
            mapCenterY > mapScreenTop && mapCenterY < mapScreenBottom) {
            ctx.save();
            // Scale opacity with zoom for visibility at all levels
            const opacity = Math.min(0.6, 0.15 + map.zoom * 0.5);
            // Cyan gridlines for both satellite and holo views
            ctx.strokeStyle = 'rgba(34, 211, 238, ' + opacity + ')';
            ctx.lineWidth = 2;

            // Vertical center line (clipped to map area)
            ctx.beginPath();
            ctx.moveTo(mapCenterX, Math.max(mapScreenTop, 0));
            ctx.lineTo(mapCenterX, Math.min(mapScreenBottom, cssHeight));
            ctx.stroke();

            // Horizontal center line (clipped to map area)
            ctx.beginPath();
            ctx.moveTo(Math.max(mapScreenLeft, 0), mapCenterY);
            ctx.lineTo(Math.min(mapScreenRight, cssWidth), mapCenterY);
            ctx.stroke();

            ctx.restore();
        }
      } catch (e) { console.debug('GridRenderer.renderQuadrantGrid failed', e); }
    }

    /**
     * Draws the fine detail grid covering the map area (8x8 subdivision).
     * Renders cyan grid lines and optionally a green crystal heatmap overlay.
     * The heatmap shows marker density using radial gradients on a dedicated canvas layer.
     */
    renderDetailGrid() {
      try {
        const map = this.map;
        const ctx = map && map.ctx;
        const cssWidth = map.canvas.clientWidth;
        const cssHeight = map.canvas.clientHeight;

        // Map boundaries in screen coordinates
        const mapScreenLeft = 0 * map.zoom + map.panX;
        const mapScreenTop = 0 * map.zoom + map.panY;
        const mapScreenRight = MAP_SIZE * map.zoom + map.panX;
        const mapScreenBottom = MAP_SIZE * map.zoom + map.panY;

        // Grid spacing: divide map into 8x8 = 64 cells (each 1024x1024)
        const gridSpacing = MAP_SIZE / 8;

        // Clear heatmap backing canvas so it doesn't accumulate between draws
        try {
            if (map.ctxHeatmap && map.canvasHeatmap) {
                map.ctxHeatmap.clearRect(0, 0, cssWidth, cssHeight);
            }
        } catch (e) {}

        ctx.save();
        // Scale opacity with zoom for visibility at all levels
        const opacity = Math.min(0.4, 0.05 + map.zoom * 0.3);

        // Optional green-crystal heatmap (draw into heatmap canvas, above tiles)
        if (map._showGridHeatmap && map.ctxHeatmap) {
            try {
                const cols = MP4Config.GRID.COLS, rows = MP4Config.GRID.ROWS;
                const counts = new Array(cols * rows).fill(0);
                const greenKeys = GREEN_CRYSTAL_LAYERS;
                if (typeof LAYERS !== 'undefined') {
                    greenKeys.forEach(k => {
                        const layer = LAYERS[k];
                        if (layer && Array.isArray(layer.markers)) {
                            layer.markers.forEach(m => {
                                const mx = Number(m.x); const my = Number(m.y);
                                if (!isFinite(mx) || !isFinite(my)) return;
                                const cc = Math.min(cols - 1, Math.max(0, Math.floor(mx * cols)));
                                const rr = Math.min(rows - 1, Math.max(0, Math.floor(my * rows)));
                                counts[rr * cols + cc]++;
                            });
                        }
                    });
                }
                const maxCount = Math.max(1, ...counts);
                const hmCtx = map.ctxHeatmap;
                hmCtx.save();
                // draw heatmap cells into the dedicated canvas; CSS `mix-blend-mode: screen` is used to composite with tiles beneath
                hmCtx.globalCompositeOperation = 'source-over';
                // Map counts (1..16) into a more visible green ramp using HSL and a gamma curve
                const rangeMin = 1;
                const rangeMax = Math.max(16, maxCount || 16);
                // Build buckets of markers per 8x8 cell so we can draw a soft radial blob per marker (lighter and more organic)
                const buckets = new Array(cols * rows);
                for (let i = 0; i < buckets.length; i++) buckets[i] = [];
                try {
                    const greenKeys = GREEN_CRYSTAL_LAYERS;
                    greenKeys.forEach(k => {
                        const layer = LAYERS[k];
                        if (layer && Array.isArray(layer.markers)) {
                            layer.markers.forEach(m => {
                                const mx = Number(m.x); const my = Number(m.y);
                                if (!isFinite(mx) || !isFinite(my)) return;
                                const cc = Math.min(cols - 1, Math.max(0, Math.floor(mx * cols)));
                                const rr = Math.min(rows - 1, Math.max(0, Math.floor(my * rows)));
                                buckets[rr * cols + cc].push({mx, my});
                            });
                        }
                    });
                } catch (e) { console.debug('renderDetailGrid: failed to build heatmap buckets', e); }

                // For each cell with markers, compute the target total alpha and split it across markers
                for (let idx = 0; idx < buckets.length; idx++) {
                    const markers = buckets[idx];
                    const cnt = markers.length;
                    if (!cnt) continue;
                    // Normalize in [0..1] relative to expected range (1..16)
                    const tRaw = Math.min(1, Math.max(0, (cnt - rangeMin) / (rangeMax - rangeMin)));
                    const gamma = 0.6;
                    const t = Math.pow(tRaw, gamma);

                    // HSL hue shifts with t (yellow-green -> green)
                    const hue = Math.round(MP4Config.HEATMAP.HUE_RANGE.MIN + (MP4Config.HEATMAP.HUE_RANGE.MAX - MP4Config.HEATMAP.HUE_RANGE.MIN) * t);
                    const sat = 100; // max saturation
                    const light = 55; // fixed lightness

                    // Target alpha for the whole cell (raised to improve visibility)
                    const alphaMin = 0.01; const alphaMax = 0.75; const steps = 15;
                    const ratioForAlpha = Math.min(1, Math.max(0, (cnt - 1) / steps));
                    const targetAlpha = Math.max(alphaMin, Math.min(alphaMax, alphaMin + ratioForAlpha * (alphaMax - alphaMin)));
                    // Split alpha among markers and apply a slight boost so individual blobs are more visible
                    const alphaBoost = 1.4;
                    const perMarkerAlpha = Math.min(alphaMax, Math.max(0.01, (targetAlpha * alphaBoost) / cnt));

                    // Draw a radial gradient for each marker (smaller radius for less blur)
                    for (let m of markers) {
                        try {
                            const screenX = m.mx * MAP_SIZE * map.zoom + map.panX;
                            const screenY = m.my * MAP_SIZE * map.zoom + map.panY;
                            // Skip off-screen markers early
                            if (screenX + 2 < 0 || screenX - 2 > cssWidth || screenY + 2 < 0 || screenY - 2 > cssHeight) continue;
                            const radius = Math.max(8, Math.round((MAP_SIZE / 8) * map.zoom * 0.45));
                            const cx = Math.round(screenX);
                            const cy = Math.round(screenY);
                            const g = hmCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                            g.addColorStop(0.0, `hsla(${hue}, ${sat}%, ${light}%, ${perMarkerAlpha})`);
                            g.addColorStop(0.5, `hsla(${hue}, ${sat}%, ${light}%, ${Math.max(0.02, perMarkerAlpha * 0.6)})`);
                            g.addColorStop(1.0, `hsla(${hue}, ${sat}%, ${light}%, 0)`);
                            hmCtx.globalCompositeOperation = 'lighter';
                            hmCtx.fillStyle = g;
                            hmCtx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
                            hmCtx.globalCompositeOperation = 'source-over';
                        } catch (e) {}
                    }
                }
                hmCtx.restore();
            } catch (e) { /* non-fatal */ }
        }

        // Cyan gridlines for both satellite and holo views
        ctx.strokeStyle = 'rgba(34, 211, 238, 1.0)';
        ctx.lineWidth = 1;
        
        // Draw vertical grid lines
        for (let i = 1; i < 8; i++) {
            const mapX = gridSpacing * i;
            const screenX = mapX * map.zoom + map.panX;
            
            // Only draw if visible on screen and within map area
            if (screenX > mapScreenLeft && screenX < mapScreenRight) {
                ctx.beginPath();
                ctx.moveTo(screenX, Math.max(mapScreenTop, 0));
                ctx.lineTo(screenX, Math.min(mapScreenBottom, cssHeight));
                ctx.stroke();
            }
        }
        
        // Draw horizontal grid lines
        for (let i = 1; i < 8; i++) {
            const mapY = gridSpacing * i;
            const screenY = mapY * map.zoom + map.panY;
            
            // Only draw if visible on screen and within map area
            if (screenY > mapScreenTop && screenY < mapScreenBottom) {
                ctx.beginPath();
                ctx.moveTo(Math.max(mapScreenLeft, 0), screenY);
                ctx.lineTo(Math.min(mapScreenRight, cssWidth), screenY);
                ctx.stroke();
            }
        }
        
        this.renderAxisLabels();
        ctx.restore();
      } catch (e) { console.debug('GridRenderer.renderDetailGrid failed', e); }
    }

    /**
     * Renders axis labels (A-H for columns, 1-8 for rows) around the map perimeter.
     * Labels are positioned outside the map boundaries and scale with zoom level.
     * Uses Orbitron font to match the DOM quadrant labels styling.
     */
    renderAxisLabels() {
      try {
        const map = this.map;
        const ctx = map && map.ctx;
        const cssWidth = map.canvas.clientWidth;
        const cssHeight = map.canvas.clientHeight;

        // Map boundaries in screen coordinates
        const mapScreenLeft = 0 * map.zoom + map.panX;
        const mapScreenTop = 0 * map.zoom + map.panY;
        const mapScreenRight = MAP_SIZE * map.zoom + map.panX;
        const mapScreenBottom = MAP_SIZE * map.zoom + map.panY;

        // Grid spacing: divide map into 8x8 = 64 cells (each 1024x1024)
        const gridSpacing = MAP_SIZE / 8;

        ctx.save();
        // Compute a readable font size based on zoom but clamp it
        const fontMin = 12;
        const fontMax = 48; // avoid excessively large labels when zooming in
        const fontSize = Math.max(fontMin, Math.min(fontMax, Math.round(map.zoom * 80)));
        // Use Orbitron (with Space Grotesk fallback) for canvas axis labels to match DOM quadrant labels
        ctx.font = `700 ${fontSize}px "Orbitron", "Space Grotesk", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif`;
        ctx.textBaseline = 'middle';

        // Always use cyan for labels
        ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';

        // padding from map edge (pixels) and half-dimensions to keep label fully outside
        const padding = 8;
        const halfH = fontSize / 2;
        const halfW = fontSize * 0.6; // approximate half-width for centered digits

        // Draw X-axis labels (A-H) — centered on each column, placed fully outside
        ctx.textAlign = 'center';
        for (let i = 0; i < 8; i++) {
            const mapX = gridSpacing * (i + 0.5); // Center of each cell
            const screenX = mapX * map.zoom + map.panX;

            // Only draw if centered column is within the horizontal viewport
            if (screenX + halfW < 0 || screenX - halfW > cssWidth) continue;

            // Draw above the map (y placed so label bottom is at map top - padding)
            const yAbove = mapScreenTop - padding - halfH;
            if (yAbove >= 0) ctx.fillText(String.fromCharCode(65 + i), screenX, yAbove);

            // Draw below the map (y placed so label top is at map bottom + padding)
            const yBelow = mapScreenBottom + padding + halfH;
            if (yBelow <= cssHeight) ctx.fillText(String.fromCharCode(65 + i), screenX, yBelow);
        }

        // Draw Y-axis labels (1-8) — centered on each row, placed fully outside
        ctx.textAlign = 'right';
        for (let i = 0; i < 8; i++) {
            const mapY = gridSpacing * (i + 0.5); // Center of each cell
            const screenY = mapY * map.zoom + map.panY;

            // Only draw if centered row is within vertical viewport
            if (screenY + halfH < 0 || screenY - halfH > cssHeight) continue;

            // Draw left of the map (x placed so label right edge is at map left - padding)
            const xLeft = mapScreenLeft - padding - halfW;
            if (xLeft >= 0) ctx.fillText(String(i + 1), xLeft, screenY);

            // Draw right of the map (x placed so label left edge is at map right + padding)
            const xRight = mapScreenRight + padding + halfW;
            if (xRight <= cssWidth) {
                ctx.textAlign = 'left';
                ctx.fillText(String(i + 1), xRight, screenY);
                ctx.textAlign = 'right';
            }
        }

        ctx.restore();
      } catch (e) { console.debug('GridRenderer.renderAxisLabels failed', e); }
    }

    /**
     * Updates the DOM quadrant labels with marker counts and positioning.
     * Labels show green crystal marker counts per quadrant and are only visible
     * when the grid layer is both enabled and highlighted.
     */
    updateQuadLabels() {
      try {
        const map = this.map;
        const parent = map.canvas && map.canvas.parentElement;
        const container = parent ? parent.querySelector('#gridQuadLabels') : null;
        if (!container) return;
        // Show labels only when the grid layer is visible AND it is highlighted
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
