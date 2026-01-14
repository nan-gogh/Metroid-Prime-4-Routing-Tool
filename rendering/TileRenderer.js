// rendering/TileRenderer.js
// Minimal scaffold for tile rendering module. Gradually replace methods from map.js.

(function (global) {
  class TileRenderer {
    /**
     * Creates a new TileRenderer instance for handling map tile loading and rendering.
     * @param {Object} mapState - The map state manager
     * @param {Object} config - Configuration object (defaults to global MP4Config)
     */
    constructor(mapState, config) {
      this.mapState = mapState;
      this.config = config || (global.MP4Config || {});
      // Keep map reference for canvas access during transition
      this.map = null;
      this.canvas = null;
      this.ctx = null;
      this.errorHandler = typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler();
    }

    /**
     * Initializes tile-related caches and properties on the map object.
     * This ensures backward compatibility with existing code that accesses these properties.
     */
    init() {
      // Initialize tile-related caches on the map object so existing code
      // that accesses them continues to work during migration.
      this.map.images = this.map.images || {};
      this.map._imageControllers = this.map._imageControllers || {};
      this.map._imageElements = this.map._imageElements || {};
      this.map._imageBitmaps = this.map._imageBitmaps || {};
      this.map._bitmapQueue = this.map._bitmapQueue || [];
      this.map._bitmapActive = this.map._bitmapActive || 0;
      this.map._bitmapLimit = this.map._bitmapLimit || 2;
      this.map._bitmapTimeoutMs = this.map._bitmapTimeoutMs || 15000;
    }

    /**
     * Renders the map tiles, background, and honeycomb pattern to the tile canvas.
     * This method handles the main tile rendering logic migrated from map.renderTiles().
     */
    render() {
      // Migrate rendering logic from map.renderTiles()
      const map = this.map;
      const ctxT = map.ctxTiles || map.ctx;
      if (!ctxT) return;
      const cssWidth = (map.canvasTiles || map.canvas).clientWidth;
      const cssHeight = (map.canvasTiles || map.canvas).clientHeight;

      // Clear background and draw honeycomb pattern
      try {
        ctxT.fillStyle = '#041018';
        ctxT.fillRect(0, 0, cssWidth, cssHeight);

        try {
          if (!map._honeycombPatternCanvas) {
            const baseSize = 28;
            const preferred = (map._lowSpec ? Math.round(baseSize * 1.6) : baseSize);
            try { map._createHoneycombPattern(preferred); } catch (e) { this.errorHandler.logDebug('TileRenderer: _createHoneycombPattern failed', 'TileRenderer.render.honeycomb', { error: e }); }
          }

          if (map._honeycombPatternCanvas) {
            if (!map._honeycombPattern) {
              try { map._honeycombPattern = ctxT.createPattern(map._honeycombPatternCanvas, 'repeat'); } catch (e) { map._honeycombPattern = null; }
            }
            if (map._honeycombPattern) {
              ctxT.save();
              ctxT.fillStyle = map._honeycombPattern;
              ctxT.fillRect(0, 0, cssWidth, cssHeight);
              ctxT.restore();
            }
          }
        } catch (e) { this.errorHandler.logDebug('TileRenderer: honeycomb fill failed', 'TileRenderer.render.honeycombFill', { error: e }); }
      } catch (e) { this.errorHandler.logDebug('TileRenderer: background fill failed', 'TileRenderer.render.backgroundFill', { error: e }); }

      if (this.map.currentImage) {
        const size = (this.config.MAP_SIZE || 8192) * this.mapState.zoom;
        try { ctxT.imageSmoothingEnabled = true; ctxT.imageSmoothingQuality = 'high'; } catch (e) { this.errorHandler.logDebug('TileRenderer: image smoothing not supported', 'TileRenderer.render.imageSmoothing', { error: e.message }); }
        try { ctxT.drawImage(this.map.currentImage, this.mapState.panX, this.mapState.panY, size, size); } catch (e) { this.errorHandler.logDebug('TileRenderer: drawImage failed', 'TileRenderer.render.drawImage', { error: e }); }
      }
    }

    /**
     * Preloads commonly used tile resolutions to improve performance.
     * Loads the current needed resolution and optionally the next higher resolution
     * if not on a low-spec device. Uses staggered loading to avoid overwhelming the network.
     */
    preloadAllMapImages() {
      const initial = (typeof this.map.getNeededResolution === 'function') ? this.map.getNeededResolution() : 0;
      const toPreload = [initial];
      if (!this.map._lowSpec && (initial + 1 < this.config.TILE_RESOLUTIONS.length)) toPreload.push(initial + 1);

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
      const needed = (typeof this.map.getNeededResolution === 'function') ? this.map.getNeededResolution() : 0;
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
      if (this.map.images[resolutionIndex]) {
        this.map.currentImage = this.map.images[resolutionIndex];
        this.map.currentResolution = resolutionIndex;
        try { this.map.markRendererDirty('TileRenderer'); } catch (e) { this.errorHandler.logDebug('TileRenderer: render failed after tile load', 'TileRenderer.loadImage.markDirty', { error: e.message }); }
        return;
      }

      if (this.map.loadingResolution === resolutionIndex) return;
      this.map.loadingResolution = resolutionIndex;

      const gen = this.map._tilesetGeneration;
      const folder = this.map.getTilesetFolder();
      const href = `tiles/${folder}/${size}.avif`;

      // Try fetch + createImageBitmap first (abortable)
      try {
        if (window.fetch && window.createImageBitmap) {
          const controller = new AbortController();
          try { this.map._imageControllers[resolutionIndex] = controller; } catch (e) { this.errorHandler.logDebug('TileRenderer: failed to set image controller', 'TileRenderer.loadImage.setController', { error: e.message }); }

          let fetchTimer = null;
          try {
            fetchTimer = setTimeout(() => { try { controller.abort(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to abort controller in timeout'); } }, this.map._bitmapTimeoutMs || 15000);
          } catch (e) { fetchTimer = null; }

          const resp = await fetch(href, { signal: controller.signal });
          try { if (fetchTimer) clearTimeout(fetchTimer); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to clear fetch timer'); }
          try { delete this.map._imageControllers[resolutionIndex]; } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to delete image controller'); }
          if (!resp.ok) throw new Error('fetch-failed');
          const blob = await resp.blob();
          if (this.map._tilesetGeneration !== gen) { this.map.loadingResolution = null; return; }

          let bmp = null;
          try { bmp = await this._runBitmapTask(() => createImageBitmap(blob)); } catch (e) { bmp = null; }

          if (bmp) {
            try { bmp._tilesetFolder = folder; } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to set tileset folder on bitmap'); }
            // Close previous bitmap if safe
            try {
              const prev = this.map._imageBitmaps[resolutionIndex];
              if (prev && typeof prev.close === 'function') {
                let safeToClose = true;
                if (prev === this.map.currentImage) safeToClose = false;
                try { for (const v of Object.values(this.map.images || {})) { if (v === prev) { safeToClose = false; break; } } } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to check bitmap usage'); }
                if (safeToClose) { try { prev.close(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to close previous bitmap'); } }
              }
            } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to handle previous bitmap cleanup'); }

            if (this.map._tilesetGeneration === gen) {
              try { this.map._imageBitmaps[resolutionIndex] = bmp; } catch (e) { this.errorHandler.logDebug('TileRenderer: failed to cache bitmap', 'TileRenderer.loadImage.cacheBitmap', { error: e.message }); }
              try { this.map.images[resolutionIndex] = bmp; } catch (e) { this.errorHandler.logDebug('TileRenderer: failed to cache image', 'TileRenderer.loadImage.cacheImage', { error: e.message }); }
            } else {
              try { if (bmp && typeof bmp.close === 'function') bmp.close(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to close unused bitmap'); }
              this.map.loadingResolution = null;
              return;
            }

            this.map.loadingResolution = null;
            try {
              const curFolder = this.map.getTilesetFolder();
              const imgFolder = bmp._tilesetFolder || null;
              if ((imgFolder && imgFolder === curFolder) || (!this.map.currentImage || resolutionIndex === this.map.getNeededResolution())) {
                this.map.currentImage = bmp;
                this.map.currentResolution = resolutionIndex;
                try { this.map.markRendererDirty('TileRenderer'); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to render after setting current image'); }
              }
            } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to set current image'); }
            try { this.map.updateResolution(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to update resolution'); }
            return;
          }
        }
      } catch (err) {
        try { delete this.map._imageControllers[resolutionIndex]; } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to delete image controller on error'); }
      }

      // Fallback to <img>
      try {
        const img = new Image();
        try { img._tilesetFolder = folder; } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to set tileset folder on image'); }
        try { this.map._imageElements[resolutionIndex] = img; } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to cache image element'); }
        img.onload = () => {
          try {
            this.map.images[resolutionIndex] = img;
            this.map.loadingResolution = null;
            const curFolder = this.map.getTilesetFolder();
            const imgFolder = img._tilesetFolder || null;
            if ((imgFolder && imgFolder === curFolder) || (!this.map.currentImage || resolutionIndex === this.map.getNeededResolution())) {
              this.map.currentImage = img;
              this.map.currentResolution = resolutionIndex;
              try { this.map.markRendererDirty('TileRenderer'); } catch (e) { this.errorHandler.logDebug('TileRenderer: render failed after image load', 'TileRenderer.loadImage.markDirtyAfterLoad', { error: e.message }); }
            }
            try { this.map.updateResolution(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to update resolution after image load'); }
          } catch (e) { this.map.loadingResolution = null; }
        };
        img.onerror = () => { this.map.loadingResolution = null; };
        img.src = href;
      } catch (e) {
        this.map.loadingResolution = null;
      }
    }

    // Abort and cleanup any in-flight tile loads
    _abortAndCleanupTileLoads() {
      try {
        for (const k in this.map._imageControllers) {
          try { this.map._imageControllers[k].abort(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to abort image controller'); }
        }
      } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to abort image controllers'); }
      this.map._imageControllers = {};

      try {
        for (const k in this.map._imageElements) {
          try { const img = this.map._imageElements[k]; img.onload = null; img.onerror = null; try { img.src = ''; } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to clear image src'); } } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to cleanup image element'); }
        }
      } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to cleanup image elements'); }
      this.map._imageElements = {};

      try {
        for (const k in this.map._imageBitmaps) {
          try {
            const bmp = this.map._imageBitmaps[k];
            if (!bmp || typeof bmp.close !== 'function') continue;
            if (bmp === this.map.currentImage) continue;
            let inUse = false;
            try { for (const v of Object.values(this.map.images || {})) { if (v === bmp) { inUse = true; break; } } } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to check bitmap usage during cleanup'); }
            if (inUse) continue;
            try { bmp.close(); } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to close bitmap during cleanup'); }
          } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to cleanup bitmap'); }
        }
      } catch (e) { this.errorHandler.logError(e, 'TileRenderer: Failed to cleanup image bitmaps'); }
      this.map._imageBitmaps = {};
    }

    // Run a bitmap decode task with concurrency limiting. `fn` should return a Promise that resolves to an ImageBitmap.
    _runBitmapTask(fn) {
      return new Promise((resolve, reject) => {
        const task = async () => {
          this.map._bitmapActive++;
          try {
            const res = await this._withTimeout(() => fn(), this.map._bitmapTimeoutMs);
            resolve(res);
          } catch (e) {
            reject(e);
          } finally {
            this.map._bitmapActive--;
            const next = this.map._bitmapQueue.shift();
            if (next) setTimeout(next, 0);
          }
        };

        if (this.map._bitmapActive < (this.map._bitmapLimit || 2)) {
          task();
        } else {
          this.map._bitmapQueue.push(task);
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
        bitmapActive: this.map._bitmapActive || 0,
        bitmapQueue: (this.map._bitmapQueue && this.map._bitmapQueue.length) || 0,
        imageControllers: Object.keys(this.map._imageControllers || {}).length,
        imageBitmaps: Object.keys(this.map._imageBitmaps || {}).length
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
        const gen = this.map._tilesetGeneration;
        if (this.map.images[i]) return;
        const size = this.config.TILE_RESOLUTIONS[i];
        const folder = this.map.getTilesetFolder();
        const href = `tiles/${folder}/${size}.avif`;

        (async () => {
          try {
            if (window.fetch && window.createImageBitmap) {
              const controller = new AbortController();
              try { this.map._imageControllers[i] = controller; } catch (e) { console.error('TileRenderer: Failed to set image controller for preload:', e); }
              const resp = await fetch(href, { signal: controller.signal });
              try { delete this.map._imageControllers[i]; } catch (e) { console.error('TileRenderer: Failed to delete image controller after fetch:', e); }
              if (!resp.ok) throw new Error('fetch-failed');
              const blob = await resp.blob();
              if (this.map._tilesetGeneration !== gen) return;
              let bmp = null;
              try { bmp = await this._runBitmapTask(() => createImageBitmap(blob)); } catch (e) { bmp = null; }
              if (bmp) {
                try { bmp._tilesetFolder = folder; } catch (e) { console.error('TileRenderer: Failed to set tileset folder on preloaded bitmap:', e); }
                try { this.map._imageBitmaps[i] = bmp; } catch (e) { console.error('TileRenderer: Failed to cache preloaded bitmap:', e); }
                try { this.map.images[i] = bmp; } catch (e) { console.error('TileRenderer: Failed to cache preloaded image:', e); }
                return;
              }
            }
          } catch (err) {
            try { delete this.map._imageControllers[i]; } catch (e) { console.error('TileRenderer: Failed to delete image controller on preload error:', e); }
          }

          // Fallback to <img>
          try {
            const img = new Image();
            try { img._tilesetFolder = folder; } catch (e) { console.error('TileRenderer: Failed to set tileset folder on preloaded image:', e); }
            try { this.map._imageElements[i] = img; } catch (e) { console.error('TileRenderer: Failed to cache preloaded image element:', e); }
            img.onload = () => {
              try {
                if (this.map._tilesetGeneration !== gen) { img.onload = null; img.onerror = null; img.src = ''; return; }
                try { this.map.images[i] = img; } catch (e) { console.error('TileRenderer: Failed to cache preloaded image on load:', e); }
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
        const displayedCss = this.config.MAP_SIZE * (this.map.zoom || 0);
        const dpr = window.devicePixelRatio || 1;
        const displayedPx = displayedCss * dpr;
        for (let i = 0; i < this.config.TILE_RESOLUTIONS.length; i++) {
          if (this.config.TILE_RESOLUTIONS[i] >= displayedPx) return i;
        }
        return this.config.TILE_RESOLUTIONS.length - 1;
      } catch (e) { return 0; }
    }
  }

  global.TileRenderer = TileRenderer;
})(window);
