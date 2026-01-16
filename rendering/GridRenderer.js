// rendering/GridRenderer.js
// Minimal scaffold for grid overlay / quadrant label rendering.

(function (global) {
  class GridRenderer {
    /**
     * Creates a new GridRenderer instance for rendering grid overlays and quadrant labels.
     * @param {Object} mapState - The map state manager
     * @param {Object} layerState - The layer state manager
     * @param {Object} highlightState - The highlight state manager
     * @param {Object} config - Configuration object (defaults to global MP4Config)
     * @param {Object} layers - Layer configuration object (defaults to global LAYERS)
     * @param {Array} greenCrystalLayers - Array of green crystal layer keys (defaults to GREEN_CRYSTAL_LAYERS)
     * @param {boolean} showGridHeatmap - Whether to show grid heatmap overlay
     */
    constructor(mapState, layerState, highlightState, config, layers, greenCrystalLayers, showGridHeatmap = false) {
      this.mapState = mapState;
      this.layerState = layerState;
      this.highlightState = highlightState;
      this.config = config || (global.MP4Config || {});
      this.layers = layers || (global.LAYERS || {});
      this.greenCrystalLayers = greenCrystalLayers || (global.GREEN_CRYSTAL_LAYERS || []);
      this.showGridHeatmap = showGridHeatmap;
      this.errorHandler = global.errorHandler;
    }

    /**
     * Initializes the grid renderer by creating DOM elements for quadrant labels.
     * Sets up a positioned container with grid labels (A1, B1, etc.) that can display marker counts.
     * @param {HTMLElement} canvasParent - The parent element of the canvas for DOM label positioning
     */
    init(canvasParent) {
      try {
        const parent = canvasParent;
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
      } catch (e) { this.errorHandler.logDebug('GridRenderer.init failed', 'GridRenderer.init', { error: e }); }
    }

    /**
     * Renders the grid overlay when the grid layer is enabled.
     * Includes quadrant grid lines, detail grid, axis labels, and updates DOM quadrant labels.
     * @param {RenderContext} renderContext - The render context providing canvas access
     */
    render(renderContext) {
      try {
        // Only render the grid when the runtime grid layer is enabled
        if (!this.layerState.isLayerVisible('grid')) return;
        try { this.renderQuadrantGrid(renderContext); } catch (e) { this.errorHandler.logDebug('GridRenderer.render: renderQuadrantGrid failed', 'GridRenderer.render.renderQuadrantGrid', { error: e }); }
        try { this.renderDetailGrid(renderContext); } catch (e) { this.errorHandler.logDebug('GridRenderer.render: renderDetailGrid failed', 'GridRenderer.render.renderDetailGrid', { error: e }); }
        // Keep DOM labels in sync
        try { this.updateQuadLabels(renderContext); } catch (e) { this.errorHandler.logDebug('GridRenderer.render: updateQuadLabels failed', 'GridRenderer.render.updateQuadLabels', { error: e }); }
      } catch (e) { this.errorHandler.logDebug('GridRenderer.render: non-fatal error', 'GridRenderer.render', { error: e }); }
    }

    /**
     * Draws the quadrant grid that separates the map into 4 equal sections.
     * Renders cyan crosshairs at the map center with zoom-scaled opacity.
     * @param {RenderContext} renderContext - The render context providing canvas access
     */
    renderQuadrantGrid(renderContext) {
      try {
        const ctx = renderContext.ctx;
        const { width: cssWidth, height: cssHeight } = renderContext.getCanvasSize();

        // Map boundaries in screen coordinates
        const mapScreenLeft = 0 * this.mapState.zoom + this.mapState.panX;
        const mapScreenTop = 0 * this.mapState.zoom + this.mapState.panY;
        const mapScreenRight = (this.config.MAP_SIZE || 8192) * this.mapState.zoom + this.mapState.panX;
        const mapScreenBottom = (this.config.MAP_SIZE || 8192) * this.mapState.zoom + this.mapState.panY;

        // Map center is at (MAP_SIZE/2, MAP_SIZE/2) in normalized coords
        // Calculate screen position of center
        const mapCenterX = ((this.config.MAP_SIZE || 8192) / 2) * this.mapState.zoom + this.mapState.panX;
        const mapCenterY = ((this.config.MAP_SIZE || 8192) / 2) * this.mapState.zoom + this.mapState.panY;

        // Only draw grid lines if they're visible on screen
        if (mapCenterX > mapScreenLeft && mapCenterX < mapScreenRight &&
            mapCenterY > mapScreenTop && mapCenterY < mapScreenBottom) {
            ctx.save();
            // Scale opacity with zoom for visibility at all levels
            const opacity = Math.min(0.6, 0.15 + this.mapState.zoom * 0.5);
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
      } catch (e) { this.errorHandler.logDebug('GridRenderer.renderQuadrantGrid failed', 'GridRenderer.renderQuadrantGrid', { error: e }); }
    }

    /**
     * Draws the fine detail grid covering the map area (8x8 subdivision).
     * Renders cyan grid lines and optionally a green crystal heatmap overlay.
     * The heatmap shows marker density using radial gradients on a dedicated canvas layer.
     * @param {RenderContext} renderContext - The render context providing canvas access
     */
    renderDetailGrid(renderContext) {
      try {
        const ctx = renderContext.ctx;
        const { width: cssWidth, height: cssHeight } = renderContext.getCanvasSize();

        // Map boundaries in screen coordinates
        const mapScreenLeft = 0 * this.mapState.zoom + this.mapState.panX;
        const mapScreenTop = 0 * this.mapState.zoom + this.mapState.panY;
        const mapScreenRight = (this.config.MAP_SIZE || 8192) * this.mapState.zoom + this.mapState.panX;
        const mapScreenBottom = (this.config.MAP_SIZE || 8192) * this.mapState.zoom + this.mapState.panY;

        // Grid spacing: divide map into 8x8 = 64 cells (each 1024x1024)
        const gridSpacing = (this.config.MAP_SIZE || 8192) / 8;

        ctx.save();
        // Scale opacity with zoom for visibility at all levels
        const opacity = Math.min(0.4, 0.05 + this.mapState.zoom * 0.3);

        // Heatmap rendering is now handled exclusively by HeatmapRenderer
        // GridRenderer only handles the 8x8 grid itself

        // Cyan gridlines for both satellite and holo views
        ctx.strokeStyle = 'rgba(34, 211, 238, 1.0)';
        ctx.lineWidth = 1;
        
        // Draw vertical grid lines
        for (let i = 1; i < 8; i++) {
            const mapX = gridSpacing * i;
            const screenX = mapX * this.mapState.zoom + this.mapState.panX;
            
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
            const screenY = mapY * this.mapState.zoom + this.mapState.panY;
            
            // Only draw if visible on screen and within map area
            if (screenY > mapScreenTop && screenY < mapScreenBottom) {
                ctx.beginPath();
                ctx.moveTo(Math.max(mapScreenLeft, 0), screenY);
                ctx.lineTo(Math.min(mapScreenRight, cssWidth), screenY);
                ctx.stroke();
            }
        }
        
        this.renderAxisLabels(renderContext);
        ctx.restore();
      } catch (e) { this.errorHandler.logDebug('GridRenderer.renderDetailGrid failed', 'GridRenderer.renderDetailGrid', { error: e }); }
    }

    /**
     * Renders axis labels (A-H for columns, 1-8 for rows) around the map perimeter.
     * Labels are positioned outside the map boundaries and scale with zoom level.
     * Uses Orbitron font to match the DOM quadrant labels styling.
     * @param {RenderContext} renderContext - The render context providing canvas access
     */
    renderAxisLabels(renderContext) {
      try {
        const ctx = renderContext.ctx;
        const { width: cssWidth, height: cssHeight } = renderContext.getCanvasSize();

        // Map boundaries in screen coordinates
        const mapScreenLeft = 0 * this.mapState.zoom + this.mapState.panX;
        const mapScreenTop = 0 * this.mapState.zoom + this.mapState.panY;
        const mapScreenRight = (this.config.MAP_SIZE || 8192) * this.mapState.zoom + this.mapState.panX;
        const mapScreenBottom = (this.config.MAP_SIZE || 8192) * this.mapState.zoom + this.mapState.panY;

        // Grid spacing: divide map into 8x8 = 64 cells (each 1024x1024)
        const gridSpacing = (this.config.MAP_SIZE || 8192) / 8;

        ctx.save();
        // Compute a readable font size based on zoom but clamp it
        const fontMin = 12;
        const fontMax = 48; // avoid excessively large labels when zooming in
        const fontSize = Math.max(fontMin, Math.min(fontMax, Math.round(this.mapState.zoom * 80)));
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
            const screenX = mapX * this.mapState.zoom + this.mapState.panX;

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
            const screenY = mapY * this.mapState.zoom + this.mapState.panY;

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
      } catch (e) { this.errorHandler.logDebug('GridRenderer.renderAxisLabels failed', 'GridRenderer.renderAxisLabels', { error: e }); }
    }

    /**
     * Updates the DOM quadrant labels with marker counts and positioning.
     * Labels show green crystal marker counts per quadrant and are only visible
     * when the grid layer is both enabled and highlighted.
     */
    updateQuadLabels(renderContext) {
      try {
        const canvas = renderContext && renderContext.canvas;
        const parent = canvas && canvas.parentElement;
        const container = parent ? parent.querySelector('#gridQuadLabels') : null;
        if (!container) return;
        // Show labels only when the grid layer is visible AND it is highlighted
        const shouldShow = !!(this.layerState && this.layerState.isGridVisible()) && !!(this.highlightState && this.highlightState.isLayerHighlighted('grid'));
        container.style.display = shouldShow ? 'block' : 'none';
        if (!shouldShow) return;
        const cols = MP4Config.GRID.COLS, rows = MP4Config.GRID.ROWS;
        const gridSpacing = (this.config.MAP_SIZE || 8192) / MP4Config.GRID.COLS;
        const cssWidth = canvas ? canvas.clientWidth : 0;
        const cssHeight = canvas ? canvas.clientHeight : 0;
        const labels = container.querySelectorAll('.grid-quad-label');
        const fontMin = 12;
        const fontMax = 48;
        const fontSize = Math.max(fontMin, Math.min(fontMax, Math.round(this.mapState.zoom * 80)));
        const pad = Math.max(2, Math.round(fontSize * 0.18));
        const greenKeys = this.greenCrystalLayers;
        const counts = new Array(cols * rows).fill(0);
        try {
            greenKeys.forEach(k => {
                const layer = this.layers[k];
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
        } catch (e) { this.errorHandler.logDebug('GridRenderer.updateQuadLabels: failed to compute counts', 'GridRenderer.updateQuadLabels.computeCounts', { error: e }); }

        for (let i = 0; i < labels.length; i++) {
          const el = labels[i];
          const c = Number(el.dataset.col);
          const r = Number(el.dataset.row);
          const mapX = (gridSpacing * (c + 0.5));
          const mapY = (gridSpacing * (r + 0.5));
          const screenX = mapX * this.mapState.zoom + this.mapState.panX;
          const screenY = mapY * this.mapState.zoom + this.mapState.panY;
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
      } catch (e) { this.errorHandler.logDebug('GridRenderer.updateQuadLabels: non-fatal error', 'GridRenderer.updateQuadLabels', { error: e }); }
    }
  }

  global.GridRenderer = GridRenderer;
})(window);
