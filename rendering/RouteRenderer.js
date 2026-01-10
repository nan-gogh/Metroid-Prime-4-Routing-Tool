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
     * @param {InteractiveMap} map - The parent map instance
     * @param {Object} config - Configuration object from MP4Config
     */
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this._lastRenderTime = 0;
      this._renderCount = 0;
      this._cachedPath = null;
      this._pathCacheValid = false;
      this._glowCache = null;
      this._glowCacheValid = false;
      this._colorCache = {}; // Cache for hex to rgba conversions
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
      const map = this.map;
      if (!map) return false;

      // Check for empty or invalid route
      if (!map.currentRoute || !Array.isArray(map.currentRoute) || map.currentRoute.length === 0) {
        return false;
      }

      // Check route visibility
      if (!map.layerVisibility || !map.layerVisibility.route) {
        return false;
      }

      // Check route sources exist
      if (!map._routeSources || !Array.isArray(map._routeSources)) {
        return false;
      }

      // Validate route indices are within bounds
      const maxIndex = map._routeSources.length - 1;
      for (const idx of map.currentRoute) {
        if (typeof idx !== 'number' || idx < 0 || idx > maxIndex) {
          console.warn('RouteRenderer: Invalid route index', idx, 'max allowed:', maxIndex);
          return false;
        }
      }

      return true;
    }

    // Micro-optimization: Cache path computation when route hasn't changed
    _computePathData() {
      const map = this.map;
      // Include marker positions in cache key to detect when waypoints are dragged
      const markerPositions = map.currentRoute.map(idx => {
        const src = map._routeSources[idx];
        const m = src && src.marker;
        return m ? `${m.x},${m.y}` : 'invalid';
      }).join('|');
      const routeKey = JSON.stringify(map.currentRoute) + '|' + map.routeLooping + '|' + map.zoom + '|' + map.panX + '|' + map.panY + '|' + markerPositions;

      if (this._cachedPath && this._pathCacheValid && this._cachedPath.key === routeKey) {
        return this._cachedPath.data;
      }

      const pathData = {
        points: [],
        valid: true
      };

      const n = map.currentRoute.length;
      for (let i = 0; i < n; i++) {
        const idx = map.currentRoute[i];
        const src = map._routeSources[idx];
        const m = src && src.marker;

        if (!m || typeof m.x !== 'number' || typeof m.y !== 'number') {
          console.warn('RouteRenderer: Invalid marker at index', idx);
          pathData.valid = false;
          continue;
        }

        const MAP_SIZE = (this.config && this.config.MAP_SIZE) ? this.config.MAP_SIZE : (typeof window !== 'undefined' && window.MAP_SIZE) ? window.MAP_SIZE : 8192;
        const x = m.x * MAP_SIZE * map.zoom + map.panX;
        const y = m.y * MAP_SIZE * map.zoom + map.panY;

        pathData.points.push({ x, y });
      }

      // Handle route looping
      if (map.routeLooping && pathData.points.length > 0) {
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
      const map = this.map;
      // Include marker positions in cache key to detect when waypoints are dragged
      const markerPositions = map.currentRoute.map(idx => {
        const src = map._routeSources[idx];
        const m = src && src.marker;
        return m ? `${m.x},${m.y}` : 'invalid';
      }).join('|');
      const glowKey = JSON.stringify(map.currentRoute) + '|' + map.routeLooping + '|glow|' + map.zoom + '|' + map.panX + '|' + map.panY + '|' + markerPositions;

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
     */
    render() {
      const startTime = performance.now();
      this._renderCount++;

      try {
        if (!this._validateRouteData()) {
          return;
        }

        const map = this.map;
        const ctx = map.ctx;
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

        ctx.restore();

        // Performance monitoring
        const renderTime = performance.now() - startTime;
        this._lastRenderTime = renderTime;

        // Log performance warnings for slow renders
        if (renderTime > 16.67) { // Slower than 60fps
          console.debug(`RouteRenderer: Slow render (${renderTime.toFixed(2)}ms) for ${pathData.points.length} points`);
        }

      } catch (e) {
        console.debug('RouteRenderer.render failed', e);
      }
    }

    _shouldRenderGlow() {
      const map = this.map;
      return !!(map.highlightedLayers && map.highlightedLayers.has && map.highlightedLayers.has('route'));
    }

    _setupLineStyle(ctx) {
      const map = this.map;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const routeHex = (typeof LAYERS !== 'undefined' && LAYERS.route) ? LAYERS.route.color : null;
      if (routeHex) {
        ctx.strokeStyle = this._hexToRgba(routeHex, 1);
      }

      const baseLine = (typeof map.routeLineWidth === 'number') ? map.routeLineWidth : 3;
      const detailScale = map.getDetailScale ? map.getDetailScale() : 1;
      ctx.lineWidth = Math.max(1, baseLine * map.zoom * detailScale);

      // Optimized dash pattern calculation
      const spacingScale = Math.max(0.35, baseLine / 5);
      const dashLen = Math.max(3, 8 * map.zoom * spacingScale * detailScale);
      const gapLen = Math.max(3, 6 * map.zoom * spacingScale * detailScale);

      if (routeHex) {
        ctx.setLineDash([dashLen, gapLen]);
        ctx.lineDashOffset = -map._routeDashOffset;
      }
    }

    _renderGlow(ctx) {
      const map = this.map;
      const pathData = this._computeGlowPathData();

      try {
        const glowAlpha = 0.85;
        const routeHex = (typeof LAYERS !== 'undefined' && LAYERS.route) ? LAYERS.route.color : null;
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

        const baseLine = (typeof map.routeLineWidth === 'number') ? map.routeLineWidth : 3;
        const detailScale = map.getDetailScale ? map.getDetailScale() : 1;
        const glowLine = Math.max(1, baseLine * map.zoom * detailScale) * 2.6;

        ctx.lineWidth = glowLine;
        ctx.strokeStyle = glowColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 18;
        ctx.setLineDash([]);
        ctx.stroke();
        ctx.restore();

      } catch (e) {
        console.debug('RouteRenderer: Glow render failed', e);
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
      const map = this.map;
      const routeHex = (typeof LAYERS !== 'undefined' && LAYERS.route) ? LAYERS.route.color : null;
      const nodeFill = routeHex ? this._hexToRgba(routeHex, 0.95) : null;

      if (nodeFill) {
        ctx.fillStyle = nodeFill;
      }

      const dotSize = map.getRouteNodeSize ? map.getRouteNodeSize() : 6;

      // Skip the closing loop point for node rendering
      const nodeCount = map.routeLooping ? pathData.points.length - 1 : pathData.points.length;

      for (let i = 0; i < nodeCount; i++) {
        const point = pathData.points[i];
        ctx.beginPath();
        ctx.arc(point.x, point.y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _renderSingleNode(ctx, point) {
      if (!point) return;

      const map = this.map;
      ctx.save();

      const routeHex = (typeof LAYERS !== 'undefined' && LAYERS.route) ? LAYERS.route.color : null;
      const nodeFill = routeHex ? this._hexToRgba(routeHex, 0.95) : null;

      if (nodeFill) {
        ctx.fillStyle = nodeFill;
      }

      const dotSize = map.getRouteNodeSize ? map.getRouteNodeSize() : 6;
      ctx.beginPath();
      ctx.arc(point.x, point.y, dotSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Optimized hex to rgba conversion with caching
    _hexToRgba(h, a) {
      if (!h || typeof h !== 'string') return null;

      // Simple cache for common colors
      const cacheKey = h + '_' + a;
      if (this._colorCache[cacheKey]) {
        return this._colorCache[cacheKey];
      }

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
      const result = `rgba(${r}, ${g}, ${b}, ${alpha})`;

      this._colorCache[cacheKey] = result;
      return result;
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
