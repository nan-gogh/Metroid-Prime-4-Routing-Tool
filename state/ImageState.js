// state/ImageState.js
// Manages tile image loading, caching, and resolution management

(function (global) {
  class ImageState {
    constructor(config, tilesetState, mapState) {
      this.config = config || (global.MP4Config || {});
      this.tilesetState = tilesetState;
      this.mapState = mapState;

      // Error handling
      this.errorHandler = typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler();

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
    getNeededResolution() {
      try {
        if (!this.mapState) return 0;

        const zoom = this.mapState.zoom;
        const canvasWidth = this.mapState.canvasWidth;
        const canvasHeight = this.mapState.canvasHeight;
        const mapSize = this.mapState.mapSize;
        const dpr = this.mapState.devicePixelRatio;

        // Calculate the resolution needed for current zoom level
        // Base multiplier tuned for small screens; scale up on larger canvases so
        // desktop monitors request higher-resolution tiles.
        const baseMultiplier = 3.5;
        const widthScale = Math.max(1, canvasWidth / 1200); // >1 for wider viewports
        const multiplier = Math.min(6, baseMultiplier * widthScale);
        const pixelsNeeded = Math.max(canvasWidth, canvasHeight) * zoom * dpr * multiplier;


        // Find the best resolution from available ones
        // We need the smallest tile resolution that is >= pixelsNeeded
        const resolutions = this.config.TILE_RESOLUTIONS || [256, 512, 1024, 2048, 4096, 8192];
        let bestResolution = resolutions[resolutions.length - 1]; // Default to highest
        let bestIndex = resolutions.length - 1;

        for (let i = 0; i < resolutions.length; i++) {
          if (resolutions[i] >= pixelsNeeded) {
            bestResolution = resolutions[i];
            bestIndex = i;
            break;
          }
        }

        

        return bestIndex;
      } catch (e) {
        this.errorHandler.logError(e, 'ImageState.getNeededResolution failed');
        return 0;
      }
    }

    // Update resolution after loading
    updateResolution() {
      try {
        // Log displayed resolution for debugging
        try { console.debug('ImageState.updateResolution current', { currentResolution: this.currentResolution, pixelSize: this.config.TILE_RESOLUTIONS && this.config.TILE_RESOLUTIONS[this.currentResolution] }); } catch (e) {}
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