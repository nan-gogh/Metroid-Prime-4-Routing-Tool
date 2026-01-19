// state/ImageState.js
// Manages tile image loading, caching, and resolution management

(function (global) {
  class ImageState {
    constructor(config, tilesetState, mapState, options = {}) {
      this.config = config || (global.MP4Config || {});
      this.tilesetState = tilesetState;
      this.mapState = mapState;

      // Error handling (constructor-injected)
      this.errorHandler = options.errorHandler || new ErrorHandler();

      // Images cache
      this.images = {};
      this.currentImage = null;
      this.currentResolution = 0;
      this.loadingResolution = null;

      // Internal trackers for robust tile loading and cancellation
      this._tilesetGeneration = 0; // increment on tileset/grayscale change
      this._imageControllers = {}; // AbortController per resolution
      this._imageElements = {}; // IMG elements in-flight per resolution
      this._imageBitmaps = {}; // ImageBitmap objects stored per resolution
      this._preloadLinks = []; // Optional <link> elements created for preload/prefetch

      // Bitmap decoding concurrency control to avoid overwhelming decoders
      this._bitmapLimit = 2;
      this._bitmapActive = 0;
      this._bitmapQueue = [];

      // Callback for when renderer needs to be marked dirty
      this.onMarkRendererDirty = null;
    }

    // Set callback for marking renderer dirty
    setOnMarkRendererDirty(callback) {
      this.onMarkRendererDirty = callback;
    }

    // Mark renderer as needing update
    markRendererDirty(rendererName) {
      if (this.onMarkRendererDirty) {
        this.onMarkRendererDirty(rendererName);
      }
    }

    // Get the needed resolution based on current zoom and canvas size
    // Combines a zoom-driven baseline (with gamma bias) and the legacy
    // pixels-needed computation. Returns the safer (higher) index so we
    // never under-provision the displayed canvas.
    getNeededResolution() {
      try {
        if (!this.mapState) return 0;

        const zoom = (typeof this.mapState.zoom === 'number') ? this.mapState.zoom : 1;
        const resolutions = this.config.TILE_RESOLUTIONS || [256, 512, 1024, 2048, 4096, 8192];

        // Plain linear mapping from zoomMin..zoomMax to resolution index.
        const zoomMin = (this.config && this.config.ZOOM && typeof this.config.ZOOM.DEFAULT_MIN === 'number') ? this.config.ZOOM.DEFAULT_MIN : 0.05;
        const zoomMax = (this.config && this.config.ZOOM && typeof this.config.ZOOM.MAX === 'number') ? this.config.ZOOM.MAX : 4;
        let normalized = 0;
        if (zoomMax > zoomMin) {
          normalized = (zoom - zoomMin) / (zoomMax - zoomMin);
          normalized = Math.max(0, Math.min(1, normalized));
        }

        const sorted = [...resolutions].sort((a, b) => a - b);
        const maxIndex = sorted.length - 1;
        const idx = Math.max(0, Math.min(maxIndex, Math.round(normalized * maxIndex)));

        return idx;
      } catch (e) {
        this.errorHandler.logError(e, 'ImageState.getNeededResolution failed');
        return 0;
      }
    }

    // Update resolution after loading
    updateResolution() {
      try {
        // Mark renderer dirty so UI updates reflect new resolution
        if (this.onMarkRendererDirty) {
          this.onMarkRendererDirty('TileRenderer');
        }
      } catch (e) {
        this.errorHandler.logError(e, 'ImageState.updateResolution failed');
      }
    }

    // Clear all cached images
    clearCache() {
      try {
        this.images = {};
        this.currentImage = null;
        this.currentResolution = 0;
        this.loadingResolution = null;

        // Cancel any ongoing loads
        Object.values(this._imageControllers).forEach(controller => {
          try { controller.abort(); } catch (e) {}
        });
        this._imageControllers = {};

        // Clear image elements
        this._imageElements = {};
        this._imageBitmaps = {};

        // Clear preload links
        this._preloadLinks.forEach(link => {
          try { if (link.parentNode) link.parentNode.removeChild(link); } catch (e) {}
        });
        this._preloadLinks = [];
      } catch (e) {
        this.errorHandler.logError(e, 'ImageState.clearCache failed');
      }
    }

    // Get current tileset folder
    getTilesetFolder() {
      return this.tilesetState ? this.tilesetState.getTilesetFolder() : 'sat';
    }

    // Increment tileset generation (called when tileset changes)
    incrementTilesetGeneration() {
      this._tilesetGeneration++;
      this.clearCache();
    }
  }

  // Export for different module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageState;
  } else if (typeof define === 'function' && define.amd) {
    define([], () => ImageState);
  } else {
    global.ImageState = ImageState;
  }
})(typeof window !== 'undefined' ? window : global);