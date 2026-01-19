// rendering/RouteRenderer.js
// Route rendering moved out of `map.js` to keep overlay logic modular.
// Enhanced with edge-case handling and micro-optimizations.

(function (global) {
  /**
   * RouteRenderer handles rendering of route paths with performance optimizations.
   * Features include caching, edge-case validation, and performance monitoring.
   */
  class RouteRenderer {
    /**
     * Creates a new RouteRenderer instance.
     * @param {Object} mapState - The map state manager
     * @param {Object} layerState - The layer state manager
     * @param {Object} routeAnimationState - The route animation state manager
     * @param {Object} routeManager - The route manager for route data
     * @param {Object} dragState - The drag state manager for route previews
     * @param {Object} highlightState - The highlight state manager for glow effects
     * @param {Object} config - Configuration object from MP4Config
     * @param {string} routeColor - Route color (defaults to LAYERS.route.color)
     */
    constructor(mapState, layerState, routeAnimationState, routeManager, dragState, highlightState, config, routeColor, options = {}) {
      this.mapState = mapState;
      this.layerState = layerState;
      this.routeAnimationState = routeAnimationState;
      this.routeManager = routeManager;
      this.dragState = dragState;
      this.highlightState = highlightState;
      this.config = config || (global.MP4Config || {});
      this.routeColor = routeColor || ((global.LAYERS && global.LAYERS.route) ? global.LAYERS.route.color : '#00ffb7ff');
      this.errorHandler = options && options.errorHandler ? options.errorHandler : null;
      this._lastRenderTime = 0;
      this._renderCount = 0;
      this._cachedPath = null;
      this._pathCacheValid = false;
      this._glowCache = null;
      this._glowCacheValid = false;
      this._colorCache = {}; // Cache for hex to rgba conversions
      
      // Map reference removed - RouteRenderer is now decoupled from map object
      // Helper that delegates to RenderUtils if available, otherwise falls back
      this._hexToRgba = (h, a) => {
        try {
          if (typeof RenderUtils !== 'undefined' && typeof RenderUtils.hexToRgba === 'function') {
            return RenderUtils.hexToRgba(h, a);
          }

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
        } catch (e) {
          console.debug('RouteRenderer._hexToRgba fallback failed', 'RouteRenderer._hexToRgba', { error: e });
          return null;
        }
      };
    }

    /**
     * Initializes the renderer caches and performance monitoring.
     */
    init() {
      // Initialize caches and performance monitoring
      this._resetCaches();
    }

    _resetCaches() {
      this._cachedPath = null;
      this._pathCacheValid = false;
      this._glowCache = null;
      this._glowCacheValid = false;
    }

    // Edge-case handling: validate route data before rendering
    _validateRouteData() {
      // Get route data from routeManager - the source of truth
      // Do NOT read from routeState to avoid circular event emission
      const currentRoute = this.routeManager && this.routeManager.currentRoute;
      
      // Check for empty or invalid route
      if (!currentRoute || !Array.isArray(currentRoute) || currentRoute.length === 0) {
        return false;
      }

      // Check route visibility
      if (!this.layerState.isLayerVisible('route')) {
        return false;
      }

      // Check route sources exist
      if (!this.routeManager.routeSources || !Array.isArray(this.routeManager.routeSources)) {
        return false;
      }

      // Validate route indices are within bounds
      const maxIndex = this.routeManager.routeSources.length - 1;
      for (const idx of currentRoute) {
        if (typeof idx !== 'number' || idx < 0 || idx > maxIndex) {
          if (this.errorHandler && typeof this.errorHandler.logWarning === 'function') {
            this.errorHandler.logWarning('RouteRenderer: Invalid route index', idx, 'max allowed:', maxIndex);
          } else if (typeof console !== 'undefined' && console.debug) {
            console.debug('RouteRenderer: Invalid route index', idx, 'max allowed:', maxIndex);
          }
          return false;
        }
      }

      return true;
    }

    // Micro-optimization: Cache path computation when route hasn't changed
    _computePathData() {
      // Get route from routeManager (source of truth)
      const currentRoute = this.routeManager && this.routeManager.currentRoute;
      if (!currentRoute || !Array.isArray(currentRoute)) {
        return { points: [], valid: false };
      }

      // Include marker positions in cache key to detect when waypoints are dragged
      const markerPositions = currentRoute.map(idx => {
        const src = this.routeManager.routeSources[idx];
        const m = src && src.marker;
        return m ? `${m.x},${m.y}` : 'invalid';
      }).join('|');
      const routeKey = JSON.stringify(currentRoute) + '|' + this.routeManager.routeLooping + '|' + this.mapState.zoom + '|' + this.mapState.panX + '|' + this.mapState.panY + '|' + markerPositions;

      if (this._cachedPath && this._pathCacheValid && this._cachedPath.key === routeKey) {
        return this._cachedPath.data;
      }

      const pathData = {
        points: [],
        valid: true
      };

      const n = currentRoute.length;
      for (let i = 0; i < n; i++) {
        const idx = currentRoute[i];
        const src = this.routeManager.routeSources[idx];
        const m = src && src.marker;

        if (!m || typeof m.x !== 'number' || typeof m.y !== 'number') {
          if (this.errorHandler && typeof this.errorHandler.logWarning === 'function') {
            this.errorHandler.logWarning('RouteRenderer: Invalid marker at index', idx);
          } else if (typeof console !== 'undefined' && console.debug) {
            console.debug('RouteRenderer: Invalid marker at index', idx);
          }
          pathData.valid = false;
          continue;
        }

        const MAP_SIZE = (this.config && this.config.MAP_SIZE) ? this.config.MAP_SIZE : (typeof window !== 'undefined' && window.MAP_SIZE) ? window.MAP_SIZE : 8192;
        const x = m.x * MAP_SIZE * this.mapState.zoom + this.mapState.panX;
        const y = m.y * MAP_SIZE * this.mapState.zoom + this.mapState.panY;

        pathData.points.push({ x, y });
      }

      // Handle route looping: close the route by connecting the last waypoint back to the first
      // Only when BOTH conditions are met: route looping is enabled AND route has at least 3 waypoints
      const routeLooping = this.routeManager && this.routeManager.routeLooping;
      if (routeLooping && pathData.points.length >= 3) {
        pathData.points.push({ ...pathData.points[0] });
      }

      this._cachedPath = {
        key: routeKey,
        data: pathData
      };
      this._pathCacheValid = true;

      return pathData;
    }

    // Micro-optimization: Cache glow path separately
    _computeGlowPathData() {
      // Get route from routeManager (source of truth)
      const currentRoute = this.routeManager && this.routeManager.currentRoute;
      if (!currentRoute || !Array.isArray(currentRoute)) {
        return { points: [], valid: false };
      }

      // Include marker positions in cache key to detect when waypoints are dragged
      const markerPositions = currentRoute.map(idx => {
        const src = this.routeManager.routeSources[idx];
        const m = src && src.marker;
        return m ? `${m.x},${m.y}` : 'invalid';
      }).join('|');
      const glowKey = JSON.stringify(currentRoute) + '|' + this.routeManager.routeLooping + '|glow|' + this.mapState.zoom + '|' + this.mapState.panX + '|' + this.mapState.panY + '|' + markerPositions;

      if (this._glowCache && this._glowCacheValid && this._glowCache.key === glowKey) {
        return this._glowCache.data;
      }

      const pathData = this._computePathData();
      this._glowCache = {
        key: glowKey,
        data: pathData
      };
      this._glowCacheValid = true;

      return pathData;
    }

    /**
     * Renders the route path to the map canvas.
     * Includes performance monitoring and automatic cache invalidation.
     * @param {RenderContext} renderContext - The render context providing canvas access
     */
    render(renderContext) {
      const startTime = performance.now();
      this._renderCount++;

      try {
        if (!this._validateRouteData()) {
          return;
        }

        // Clear route canvas at start of frame
        if (renderContext && renderContext.canvasRoute) {
          const routeCanvas = renderContext.canvasRoute;
          const ctx = renderContext.ctxRoute;
          ctx.clearRect(0, 0, routeCanvas.width, routeCanvas.height);
        }

        const ctx = renderContext ? renderContext.ctxRoute : null;
        if (!ctx) {
          this.errorHandler.logWarning('RouteRenderer.render called without valid renderContext', 'RouteRenderer.render');
          return;
        }
        const pathData = this._computePathData();

        if (!pathData.valid || pathData.points.length < 2) {
          // Edge case: single point or invalid path - render as single node
          this._renderSingleNode(ctx, pathData.points[0]);
          return;
        }

        ctx.save();
        this._setupLineStyle(ctx);

        // Render glow effect if highlighted
        if (this._shouldRenderGlow()) {
          this._renderGlow(ctx);
        }

        // Render main route path
        this._renderMainPath(ctx, pathData);

        // Render route nodes
        this._renderNodes(ctx, pathData);

        // Render route preview dot (transient UI element during route editing)
        this._renderRoutePreview(ctx);

        ctx.restore();

        // Performance monitoring
        const renderTime = performance.now() - startTime;
        this._lastRenderTime = renderTime;

        // Log performance warnings for slow renders
        if (renderTime > 16.67) { // Slower than 60fps
          console.debug(`RouteRenderer: Slow render (${renderTime.toFixed(2)}ms) for ${pathData.points.length} points`, 'RouteRenderer.render.performance', { renderTime, pointCount: pathData.points.length });
        }

      } catch (e) {
        console.debug('RouteRenderer.render failed', 'RouteRenderer.render', { error: e });
      }
    }

    _shouldRenderGlow() {
      return !!(this.highlightState && this.highlightState.highlightedLayers && this.highlightState.highlightedLayers.has && this.highlightState.highlightedLayers.has('route'));
    }

    _setupLineStyle(ctx) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const routeHex = this.routeColor;
      if (routeHex) {
        ctx.strokeStyle = this._hexToRgba(routeHex, 1);
      }

      const baseLine = this.routeAnimationState ? this.routeAnimationState.getLineWidth() : 3;
      const detailScale = 1; // Simplified - was map.getDetailScale() which may not exist
      ctx.lineWidth = Math.max(1, baseLine * this.mapState.zoom * detailScale);

      // Optimized dash pattern calculation
      const spacingScale = Math.max(0.35, baseLine / 5);
      const dashLen = Math.max(3, 8 * this.mapState.zoom * spacingScale * detailScale);
      const gapLen = Math.max(3, 6 * this.mapState.zoom * spacingScale * detailScale);

      if (routeHex) {
        ctx.setLineDash([dashLen, gapLen]);
        ctx.lineDashOffset = -map._routeDashOffset;
      }
    }

    _renderGlow(ctx) {
      const pathData = this._computeGlowPathData();

      try {
        const glowAlpha = 0.85;
        const routeHex = this.routeColor;
        const glowColor = routeHex ? this._hexToRgba(routeHex, glowAlpha) : 'rgba(34,211,238,0.85)';

        ctx.save();
        ctx.beginPath();

        for (let i = 0; i < pathData.points.length; i++) {
          const point = pathData.points[i];
          if (i === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        }

        const baseLine = this.routeAnimationState ? this.routeAnimationState.getLineWidth() : 3;
        const detailScale = 1; // Simplified - was map.getDetailScale() which may not exist
        const glowLine = Math.max(1, baseLine * this.mapState.zoom * detailScale) * 2.6;

        ctx.lineWidth = glowLine;
        ctx.strokeStyle = glowColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 18;
        ctx.setLineDash([]);
        ctx.stroke();
        ctx.restore();

      } catch (e) {
        console.debug('RouteRenderer: Glow render failed', 'RouteRenderer._renderGlow', { error: e });
      }
    }

    _renderMainPath(ctx, pathData) {
      ctx.beginPath();

      for (let i = 0; i < pathData.points.length; i++) {
        const point = pathData.points[i];
        if (i === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);
    }

    _renderNodes(ctx, pathData) {
      const routeHex = this.routeColor;
      const nodeFill = routeHex ? this._hexToRgba(routeHex, 0.95) : null;

      if (nodeFill) {
        ctx.fillStyle = nodeFill;
      }

      const lineWidth = this.routeAnimationState ? this.routeAnimationState.getLineWidth() : 3;
      const dotSize = this.routeManager && typeof this.routeManager.getRouteNodeSize === 'function' ?
        this.routeManager.getRouteNodeSize(lineWidth, this.mapState.zoom) : 6;

      // Skip the closing loop point for node rendering (only when a loop was actually added)
      const nodeCount = (map.routeLooping && pathData.points.length >= 4) ? pathData.points.length - 1 : pathData.points.length;

      for (let i = 0; i < nodeCount; i++) {
        const point = pathData.points[i];
        ctx.beginPath();
        ctx.arc(point.x, point.y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _renderSingleNode(ctx, point) {
      if (!point) return;

      ctx.save();

      const routeHex = this.routeColor;
      const nodeFill = routeHex ? this._hexToRgba(routeHex, 0.95) : null;

      if (nodeFill) {
        ctx.fillStyle = nodeFill;
      }

      const lineWidth = this.routeAnimationState ? this.routeAnimationState.getLineWidth() : 3;
      const dotSize = this.routeManager && typeof this.routeManager.getRouteNodeSize === 'function' ?
        this.routeManager.getRouteNodeSize(lineWidth, this.mapState.zoom) : 6;
      ctx.beginPath();
      ctx.arc(point.x, point.y, dotSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    

    /**
     * Invalidates all internal caches when route data changes.
     * This should be called whenever the route markers or path data is modified
     * to ensure subsequent renders use fresh computed data.
     */
    invalidateCache() {
      this._resetCaches();
    }

    /**
     * Renders the route preview dot when editing a route.
     * Shows where the next waypoint will be placed during route editing.
     * @param {CanvasRenderingContext2D} ctx - The route canvas context
     */
    _renderRoutePreview(ctx) {
      try {
        // Get route preview from dragState
        const routePreview = this.dragState ? this.dragState.routePreview : null;
        if (!routePreview) return;

        // Transform route preview coordinates to screen coordinates
        const MAP_SIZE = (this.config && this.config.MAP_SIZE) ? this.config.MAP_SIZE : (typeof window !== 'undefined' && window.MAP_SIZE) ? window.MAP_SIZE : 8192;
        const pos = {
          x: routePreview.x * MAP_SIZE * this.mapState.zoom + this.mapState.panX,
          y: routePreview.y * MAP_SIZE * this.mapState.zoom + this.mapState.panY
        };

        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;

        const px = pos.x;
        const py = pos.y;

        // Use the same route color logic as the rest of RouteRenderer
        const routeHex = this.routeColor;
        let nodeFill = null;

        try {
          nodeFill = this._hexToRgba(routeHex, 0.95);
        } catch (e) {
          this.errorHandler && console.debug('RouteRenderer._renderRoutePreview: Failed to parse route color', 'RouteRenderer._renderRoutePreview.colorParse', { error: e });
        }

        const dotSize = (global.map && global.map.getRouteNodeSize && typeof global.map.getRouteNodeSize === 'function') ?
          global.map.getRouteNodeSize() : 6;

        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = nodeFill || 'rgba(34, 211, 238, 1)';
        ctx.arc(px, py, dotSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

      } catch (e) {
        this.errorHandler && console.debug('RouteRenderer._renderRoutePreview failed', 'RouteRenderer._renderRoutePreview', { error: e });
      }
    }

    /**
     * Returns performance statistics for route rendering operations.
     * @returns {Object} Performance metrics containing:
     *   - lastRenderTime: Time in milliseconds for the most recent render
     *   - renderCount: Total number of render operations performed
     *   - averageRenderTime: Average render time across all operations
     */
    getPerformanceStats() {
      return {
        lastRenderTime: this._lastRenderTime,
        renderCount: this._renderCount,
        averageRenderTime: this._renderCount > 0 ? (this._lastRenderTime / this._renderCount) : 0
      };
    }
  }

  global.RouteRenderer = RouteRenderer;
})(window);

