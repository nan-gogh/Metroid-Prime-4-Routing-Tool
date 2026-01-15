// rendering/TileRenderer.js
// Minimal scaffold for tile rendering module. Gradually replace methods from map.js.

(function (global) {
  class TileRenderer {
    /**
     * Creates a new TileRenderer instance for handling map tile loading and rendering.
     * @param {Object} mapState - The map state manager
     * @param {Object} tilesetState - The tileset state manager
     * @param {Object} imageState - The image state manager
     * @param {Object} config - Configuration object (defaults to global MP4Config)
     * @param {Object} options - Additional options including lowSpec flag
     */
    constructor(mapState, tilesetState, imageState, config, options = {}) {
      this.mapState = mapState;
      this.tilesetState = tilesetState;
      this.imageState = imageState;
      this.config = config || (global.MP4Config || {});
      this._lowSpec = options.lowSpec || false;
      this.errorHandler = typeof errorHandler !== 'undefined' ? errorHandler : (global.errorHandler || { logDebug: console.debug, logError: console.error });
      // No direct map reference needed - all access through state managers and renderContext
    }

    /**
     * Initializes tile-related caches and properties.
     * Sets up internal state for tile loading and rendering.
     */
    init() {
      // Initialize honeycomb pattern properties
      this._honeycombPatternCanvas = null;
      this._honeycombPattern = null;
    }

    /**
     * Renders the map tiles, background, and honeycomb pattern to the tile canvas.
     * This method handles the main tile rendering logic migrated from map.renderTiles().
     * @param {RenderContext} renderContext - The render context providing canvas access
     */
    render(renderContext) {
      if (!renderContext || !renderContext.ctxTiles) return;

      // Migrate rendering logic from map.renderTiles()
      const ctxT = renderContext.ctxTiles;
      const { width: cssWidth, height: cssHeight } = renderContext.getCanvasSize();

      // Clear background and draw honeycomb pattern
      try {
        ctxT.fillStyle = '#041018';
        ctxT.fillRect(0, 0, cssWidth, cssHeight);

        try {
          if (!this._honeycombPatternCanvas) {
            const baseSize = 28;
            const preferred = (this._lowSpec ? Math.round(baseSize * 1.6) : baseSize);
            try { this._createHoneycombPattern(preferred); } catch (e) { this.errorHandler.logDebug('TileRenderer: _createHoneycombPattern failed', 'TileRenderer.render.honeycomb', { error: e }); }
          }

          if (this._honeycombPatternCanvas) {
            if (!this._honeycombPattern) {
              try { this._honeycombPattern = ctxT.createPattern(this._honeycombPatternCanvas, 'repeat'); } catch (e) { this._honeycombPattern = null; }
            }
            if (this._honeycombPattern) {
              ctxT.save();
              ctxT.fillStyle = this._honeycombPattern;
              ctxT.fillRect(0, 0, cssWidth, cssHeight);
              ctxT.restore();
            }
          }
        } catch (e) { this.errorHandler.logDebug('TileRenderer: honeycomb fill failed', 'TileRenderer.render.honeycombFill', { error: e }); }
      } catch (e) { this.errorHandler.logDebug('TileRenderer: background fill failed', 'TileRenderer.render.backgroundFill', { error: e }); }

      if (this.imageState.currentImage) {
        const size = (this.config.MAP_SIZE || 8192) * this.mapState.zoom;
        try { ctxT.imageSmoothingEnabled = true; ctxT.imageSmoothingQuality = 'high'; } catch (e) { this.errorHandler.logDebug('TileRenderer: image smoothing not supported', 'TileRenderer.render.imageSmoothing', { error: e.message }); }
        try { ctxT.drawImage(this.imageState.currentImage, this.mapState.panX, this.mapState.panY, size, size); } catch (e) { this.errorHandler.logDebug('TileRenderer: drawImage failed', 'TileRenderer.render.drawImage', { error: e }); }
      }
    }

    /**
     * Preloads commonly used tile resolutions to improve performance.
     * Loads the current needed resolution and optionally the next higher resolution
     * if not on a low-spec device. Uses staggered loading to avoid overwhelming the network.
     */
    preloadAllMapImages() {
      const initial = this.determineBestResolution();
      const toPreload = [initial];
      if (!this._lowSpec && (initial + 1 < this.config.TILE_RESOLUTIONS.length)) toPreload.push(initial + 1);

      for (let p = 0; p < toPreload.length; p++) {
        const i = toPreload[p];
        // Stagger fetches to avoid a burst of work on load
        setTimeout(() => {
          try { this.preloadResolution(i); } catch (e) { this.errorHandler.logDebug('TileRenderer.preloadAllMapImages: preloadResolution failed', 'TileRenderer.preloadAllMapImages', { error: e, resolution: i }); }
        }, i * 150);
      }
    }

    /**
     * Loads the initial tile image based on the current zoom level and device requirements.
     * Determines the needed resolution and triggers loading of that specific tile.
     */
    loadInitialImage() {
      const needed = this.imageState.getNeededResolution();
      this.loadImage(needed);
    }

    /**
     * Asynchronously loads a tile image for the specified resolution index.
     * Uses modern ImageBitmap API when available, with fallback to traditional Image elements.
     * Handles caching, abort controllers, and automatic rendering when appropriate.
     * @param {number} resolutionIndex - The index of the resolution to load (0 = highest quality)
     * @returns {Promise<void>} Resolves when the image is loaded or fails
     */
    async loadImage(resolutionIndex) {
      const size = this.config.TILE_RESOLUTIONS[resolutionIndex];
      if (this.imageState.images[resolutionIndex]) {
        this.imageState.currentImage = this.imageState.images[resolutionIndex];
        this.imageState.currentResolution = resolutionIndex;
        try { this.imageState.markRendererDirty('TileRenderer'); } catch (e) { this.errorHandler.logDebug('TileRenderer: render failed after tile load', 'TileRenderer.loadImage.markDirty', { error: e.message }); }
        return;
      }

      if (this.imageState.loadingResolution === resolutionIndex) return;
      this.imageState.loadingResolution = resolutionIndex;

      const gen = this.imageState._tilesetGeneration;
      const folder = this.imageState.getTilesetFolder();
      const href = `tiles/${folder}/${size}.avif`;

      // Try fetch + createImageBitmap first (abortable)
      try {
        if (window.fetch && window.createImageBitmap) {
          const controller = new AbortController();
          try { this.imageState._imageControllers[resolutionIndex] = controller; } catch (e) { this.errorHandler.logDebug('TileRenderer: failed to set image controller', 'TileRenderer.loadImage.setController', { error: e.message }); }

          let fetchTimer = null;
          try {
            fetchTimer = setTimeout(() => { try { controller.abort(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to abort controller in timeout'); } }, 15000);
          } catch (e) { fetchTimer = null; }

          const resp = await fetch(href, { signal: controller.signal });
          try { if (fetchTimer) clearTimeout(fetchTimer); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to clear fetch timer'); }
          try { delete this.imageState._imageControllers[resolutionIndex]; } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to delete image controller'); }
          if (!resp.ok) throw new Error('fetch-failed');
          const blob = await resp.blob();
          if (this.imageState._tilesetGeneration !== gen) { this.imageState.loadingResolution = null; return; }

          let bmp = null;
          try { bmp = await this._runBitmapTask(() => createImageBitmap(blob)); } catch (e) { bmp = null; }

          if (bmp) {
            try { bmp._tilesetFolder = folder; } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to set tileset folder on bitmap'); }
            // Close previous bitmap if safe
            try {
              const prev = this.imageState._imageBitmaps[resolutionIndex];
              if (prev && typeof prev.close === 'function') {
                let safeToClose = true;
                if (prev === this.imageState.currentImage) safeToClose = false;
                try { for (const v of Object.values(this.imageState.images || {})) { if (v === prev) { safeToClose = false; break; } } } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to check bitmap usage'); }
                if (safeToClose) { try { prev.close(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to close previous bitmap'); } }
              }
            } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to handle previous bitmap cleanup'); }

            if (this.imageState._tilesetGeneration === gen) {
              try { this.imageState._imageBitmaps[resolutionIndex] = bmp; } catch (e) { this.errorHandler.logDebug('TileRenderer: failed to cache bitmap', 'TileRenderer.loadImage.cacheBitmap', { error: e.message }); }
              try { this.imageState.images[resolutionIndex] = bmp; } catch (e) { this.errorHandler.logDebug('TileRenderer: failed to cache image', 'TileRenderer.loadImage.cacheImage', { error: e.message }); }
            } else {
              try { if (bmp && typeof bmp.close === 'function') bmp.close(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to close unused bitmap'); }
              this.imageState.loadingResolution = null;
              return;
            }

            this.imageState.loadingResolution = null;
            try {
              const curFolder = this.imageState.getTilesetFolder();
              const imgFolder = bmp._tilesetFolder || null;
              if ((imgFolder && imgFolder === curFolder) || (!this.imageState.currentImage || resolutionIndex === this.imageState.getNeededResolution())) {
                this.imageState.currentImage = bmp;
                this.imageState.currentResolution = resolutionIndex;
                try { this.imageState.markRendererDirty('TileRenderer'); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to render after setting current image'); }
              }
            } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to set current image'); }
            try { this.imageState.updateResolution(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to update resolution'); }
            return;
          }
        }
      } catch (err) {
        try { delete this.imageState._imageControllers[resolutionIndex]; } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to delete image controller on error'); }
      }

      // Fallback to <img>
      try {
        const img = new Image();
        try { img._tilesetFolder = folder; } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to set tileset folder on image'); }
        try { this.imageState._imageElements[resolutionIndex] = img; } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to cache image element'); }
        img.onload = () => {
          try {
            this.imageState.images[resolutionIndex] = img;
            this.imageState.loadingResolution = null;
            const curFolder = this.imageState.getTilesetFolder();
            const imgFolder = img._tilesetFolder || null;
            if ((imgFolder && imgFolder === curFolder) || (!this.imageState.currentImage || resolutionIndex === this.imageState.getNeededResolution())) {
              this.imageState.currentImage = img;
              this.imageState.currentResolution = resolutionIndex;
              try { this.imageState.markRendererDirty('TileRenderer'); } catch (e) { this.errorHandler.logDebug('TileRenderer: render failed after image load', 'TileRenderer.loadImage.markDirtyAfterLoad', { error: e.message }); }
            }
            try { this.imageState.updateResolution(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to update resolution after image load'); }
          } catch (e) { this.imageState.loadingResolution = null; }
        };
        img.onerror = () => { this.imageState.loadingResolution = null; };
        img.src = href;
      } catch (e) {
        this.imageState.loadingResolution = null;
      }
    }

    // Abort and cleanup any in-flight tile loads
    _abortAndCleanupTileLoads() {
      try {
        for (const k in this.imageState._imageControllers) {
          try { this.imageState._imageControllers[k].abort(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to abort image controller'); }
        }
      } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to abort image controllers'); }
      this.imageState._imageControllers = {};

      try {
        for (const k in this.imageState._imageElements) {
          try { const img = this.imageState._imageElements[k]; img.onload = null; img.onerror = null; try { img.src = ''; } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to clear image src'); } } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to cleanup image element'); }
        }
      } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to cleanup image elements'); }
      this.imageState._imageElements = {};

      try {
        for (const k in this.imageState._imageBitmaps) {
          try {
            const bmp = this.imageState._imageBitmaps[k];
            if (!bmp || typeof bmp.close !== 'function') continue;
            if (bmp === this.imageState.currentImage) continue;
            let inUse = false;
            try { for (const v of Object.values(this.imageState.images || {})) { if (v === bmp) { inUse = true; break; } } } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to check bitmap usage during cleanup'); }
            if (inUse) continue;
            try { bmp.close(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to close bitmap during cleanup'); }
          } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to cleanup bitmap'); }
        }
      } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to cleanup image bitmaps'); }
      this.imageState._imageBitmaps = {};
    }

    // Run a bitmap decode task with concurrency limiting. `fn` should return a Promise that resolves to an ImageBitmap.
    _runBitmapTask(fn) {
      return new Promise((resolve, reject) => {
        const task = async () => {
          this.imageState._bitmapActive++;
          try {
            const res = await this._withTimeout(() => fn(), 10000); // Use a default timeout
            resolve(res);
          } catch (e) {
            reject(e);
          } finally {
            this.imageState._bitmapActive--;
            const next = this.imageState._bitmapQueue.shift();
            if (next) setTimeout(next, 0);
          }
        };

        if (this.imageState._bitmapActive < (this.imageState._bitmapLimit || 2)) {
          task();
        } else {
          this.imageState._bitmapQueue.push(task);
        }
      });
    }

    // Helper: run a promise-returning function with a timeout (ms)
    _withTimeout(fn, ms) {
      return new Promise((resolve, reject) => {
        let done = false;
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error('bitmap-decode-timeout'));
        }, ms || 0);

        setTimeout(() => {
          try {
            const res = fn();
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(res);
          } catch (e) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(e);
          }
        }, 0);
      });
    }

    /**
     * Returns statistics about current tile loading operations.
     * @returns {Object} Statistics object containing:
     *   - bitmapActive: Number of active bitmap decode operations
     *   - bitmapQueue: Number of queued bitmap decode tasks
     *   - imageControllers: Number of active AbortControllers for fetch operations
     *   - imageBitmaps: Number of cached ImageBitmap objects
     */
    getTileLoadStats() {
      return {
        bitmapActive: this.imageState._bitmapActive || 0,
        bitmapQueue: (this.imageState._bitmapQueue && this.imageState._bitmapQueue.length) || 0,
        imageControllers: Object.keys(this.imageState._imageControllers || {}).length,
        imageBitmaps: Object.keys(this.imageState._imageBitmaps || {}).length
      };
    }

    /**
     * Preloads a single tile resolution in the background without affecting the current display.
     * Uses the same loading logic as loadImage but doesn't update currentImage.
     * @param {number} resolutionIndex - The index of the resolution to preload
     */
    preloadResolution(resolutionIndex) {
      try {
        const i = Number(resolutionIndex);
        if (isNaN(i) || i < 0 || i >= this.config.TILE_RESOLUTIONS.length) return;
        const gen = this.imageState._tilesetGeneration;
        if (this.imageState.images[i]) return;
        const size = this.config.TILE_RESOLUTIONS[i];
        const folder = this.tilesetState.getTilesetFolder();
        const href = `tiles/${folder}/${size}.avif`;

        (async () => {
          try {
            if (window.fetch && window.createImageBitmap) {
              const controller = new AbortController();
              try { this.imageState._imageControllers[i] = controller; } catch (e) { console.error('TileRenderer: Failed to set image controller for preload:', e); }
              const resp = await fetch(href, { signal: controller.signal });
              try { delete this.imageState._imageControllers[i]; } catch (e) { console.error('TileRenderer: Failed to delete image controller after fetch:', e); }
              if (!resp.ok) throw new Error('fetch-failed');
              const blob = await resp.blob();
              if (this.imageState._tilesetGeneration !== gen) return;
              let bmp = null;
              try { bmp = await this._runBitmapTask(() => createImageBitmap(blob)); } catch (e) { bmp = null; }
              if (bmp) {
                try { bmp._tilesetFolder = folder; } catch (e) { console.error('TileRenderer: Failed to set tileset folder on preloaded bitmap:', e); }
                try { this.imageState._imageBitmaps[i] = bmp; } catch (e) { console.error('TileRenderer: Failed to cache preloaded bitmap:', e); }
                try { this.imageState.images[i] = bmp; } catch (e) { console.error('TileRenderer: Failed to cache preloaded image:', e); }
                return;
              }
            }
          } catch (err) {
            try { delete this.imageState._imageControllers[i]; } catch (e) { console.error('TileRenderer: Failed to delete image controller on preload error:', e); }
          }

          // Fallback to <img>
          try {
            const img = new Image();
            try { img._tilesetFolder = folder; } catch (e) { console.error('TileRenderer: Failed to set tileset folder on preloaded image:', e); }
            try { this.imageState._imageElements[i] = img; } catch (e) { console.error('TileRenderer: Failed to cache preloaded image element:', e); }
            img.onload = () => {
              try {
                if (this.imageState._tilesetGeneration !== gen) { img.onload = null; img.onerror = null; img.src = ''; return; }
                try { this.imageState.images[i] = img; } catch (e) { console.error('TileRenderer: Failed to cache preloaded image on load:', e); }
              } catch (e) { console.error('TileRenderer: Failed to handle preloaded image load:', e); }
            };
            img.onerror = () => { try { img.onload = null; img.onerror = null; } catch (e) { console.error('TileRenderer: Failed to cleanup preloaded image handlers on error:', e); } };
            img.src = href;
          } catch (e) { console.error('TileRenderer: Failed to preload tile image:', e); }
        })();
      } catch (e) { this.errorHandler.logDebug('TileRenderer.preloadResolution failed', 'TileRenderer.preloadResolution', { error: e }); }
    }

    /**
     * Determines the best tile resolution index based on current zoom level and device pixel ratio.
     * Higher indices represent lower quality but faster loading resolutions.
     * @returns {number} The recommended resolution index (0 = highest quality)
     */
    determineBestResolution() {
      try {
        const displayedCss = this.config.MAP_SIZE * (this.mapState.zoom || 0);
        const dpr = window.devicePixelRatio || 1;
        const displayedPx = displayedCss * dpr;
        for (let i = 0; i < this.config.TILE_RESOLUTIONS.length; i++) {
          if (this.config.TILE_RESOLUTIONS[i] >= displayedPx) return i;
        }
        return this.config.TILE_RESOLUTIONS.length - 1;
      } catch (e) { return 0; }
    }

    /**
     * Creates a honeycomb pattern canvas for background tiling.
     * @param {number} size - Base size for hexagons (default: 28)
     */
    _createHoneycombPattern(size = 28) {
      try {
        const dpr = window.devicePixelRatio || 1;
        const base = Number(size) || 28;
        // Adapt hex size slightly based on viewport width so the pattern
        // becomes a bit denser on wide viewports and shrinks on narrow ones.
        const containerWidth = (window.innerWidth || 1024);
        const refWidth = 1024; // reference width for scaling
        const viewportRatio = Math.min(1, containerWidth / refWidth);
        const maxShrink = 1; // max 18% shrink on very small viewports
        const viewportMultiplier = 1 - (1 - viewportRatio) * maxShrink;
        // Use a continuous (float) size so the pattern shrinks smoothly
        // with viewport width instead of stepping through integer sizes.
        const adaptiveBase = Math.max(10, base * viewportMultiplier);
        const r = this._lowSpec ? (adaptiveBase * 1.6) : adaptiveBase;
        const hexH = Math.sqrt(3) * r;
        const hSpacing = 1.5 * r;
        const vSpacing = hexH;

        // Pattern tile extents (use integer pixels to avoid blurry seams)
        // Make the pattern tile cover two columns and two rows so repetition is seamless
        const tileW = Math.max(2, Math.ceil(hSpacing * 2));
        const tileH = Math.max(2, Math.ceil(vSpacing * 2));

        const pc = document.createElement('canvas');
        pc.width = Math.max(1, Math.floor(tileW * dpr));
        pc.height = Math.max(1, Math.floor(tileH * dpr));
        const pctx = pc.getContext('2d');
        // Draw in CSS pixels by scaling for DPR
        pctx.scale(dpr, dpr);

        pctx.fillStyle = 'rgba(6,20,30,0.28)';
        pctx.strokeStyle = 'rgba(34,211,238,0.06)';
        pctx.lineWidth = 1;

        // Start slightly negative so partial hexes at the edges are drawn
        const xStart = -hSpacing;
        const yStart = -vSpacing;
        const cols = Math.ceil(tileW / hSpacing) + 3;
        const rows = Math.ceil(tileH / vSpacing) + 3;

        for (let col = 0; col < cols; col++) {
          for (let row = 0; row < rows; row++) {
            const cx = xStart + col * hSpacing;
            const cy = yStart + row * vSpacing + (col % 2 ? vSpacing / 2 : 0);
            // Draw hexagon centered at (cx, cy)
            pctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI / 180) * (60 * i);
              const x = cx + r * Math.cos(angle);
              const y = cy + r * Math.sin(angle);
              if (i === 0) pctx.moveTo(x, y); else pctx.lineTo(x, y);
            }
            pctx.closePath();
            pctx.fill();
            pctx.stroke();
          }
        }

        // Rotate the pattern tile by 90 degrees into a new canvas so the
        // repeated pattern appears rotated without changing tiling behavior.
        try {
          const rc = document.createElement('canvas');
          // For a 90deg rotation swap width/height to avoid clipping
          rc.width = pc.height;
          rc.height = pc.width;
          const rctx = rc.getContext('2d');
          // Translate to center, rotate 90deg, draw original
          rctx.translate(rc.width / 2, rc.height / 2);
          rctx.rotate(Math.PI / 2);
          rctx.drawImage(pc, -pc.width / 2, -pc.height / 2);
          this._honeycombPatternCanvas = rc;
        } catch (e) {
          // Fallback to the original pattern if rotation fails
          this._honeycombPatternCanvas = pc;
        }
        this._honeycombPattern = null;
      } catch (e) {
        // ignore pattern creation failures
        this._honeycombPatternCanvas = null;
        this._honeycombPattern = null;
      }
    }
  }

  global.TileRenderer = TileRenderer;
})(window);
