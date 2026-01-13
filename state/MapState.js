// state/MapState.js
// Complete view/pan/zoom state management for the map

(function (global) {
  class MapState {
    constructor(config) {
      this.config = config || global.MP4Config || {};

      // View state
      this.panX = 0;
      this.panY = 0;
      this.zoom = this.config.ZOOM ? this.config.ZOOM.DEFAULT_MIN || 0.1 : 0.1;

      // Canvas dimensions (updated by resize)
      this.canvasWidth = 0;
      this.canvasHeight = 0;
      this.devicePixelRatio = global.devicePixelRatio || 1;

      // Zoom constraints
      this.minZoom = this.config.ZOOM ? this.config.ZOOM.DEFAULT_MIN || 0.05 : 0.05;
      this.maxZoom = this.config.ZOOM ? this.config.ZOOM.MAX || 4 : 4;
      this.mapSize = this.config.MAP_SIZE || 8192;
    }

    // Canvas dimension management
    setCanvasSize(width, height, dpr) {
      this.canvasWidth = width;
      this.canvasHeight = height;
      this.devicePixelRatio = dpr || 1;
      this.updateMinZoom();
    }

    // Update minimum zoom based on device capabilities and canvas size
    updateMinZoom() {
      const minRes = (this.config.TILE_RESOLUTIONS || [256])[0];
      const computedMinZoom = minRes / (this.mapSize * this.devicePixelRatio);
      this.minZoom = Math.max(0.005, Math.min(
        this.config.ZOOM ? this.config.ZOOM.DEFAULT_MIN || 0.05 : 0.05,
        computedMinZoom
      ));
    }

    // Coordinate transformation methods
    screenToWorld(screenX, screenY) {
      return {
        x: (screenX - this.panX) / this.zoom,
        y: (screenY - this.panY) / this.zoom
      };
    }

    worldToScreen(worldX, worldY) {
      return {
        x: worldX * this.zoom + this.panX,
        y: worldY * this.zoom + this.panY
      };
    }

    // View transformation methods
    fitBounds(bounds) {
      if (!bounds || !this.canvasWidth || !this.canvasHeight) return;

      // Reserve padding for axis labels (similar to InteractiveMap initialization)
      const labelFontMax = 48;
      const labelPadding = 8;
      const halfW = labelFontMax * 0.6;
      const halfH = labelFontMax / 2;
      const availW = Math.max(32, this.canvasWidth - 2 * (labelPadding + halfW));
      const availH = Math.max(32, this.canvasHeight - 2 * (labelPadding + halfH));

      const fitZoom = Math.min(availW / this.mapSize, availH / this.mapSize);
      this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, fitZoom));
      this.centerMap();
    }

    centerOn(worldX, worldY) {
      if (!this.canvasWidth || !this.canvasHeight) return;

      const centerX = this.canvasWidth / 2;
      const centerY = this.canvasHeight / 2;

      this.panX = centerX - worldX * this.zoom;
      this.panY = centerY - worldY * this.zoom;
    }

    centerMap() {
      if (!this.canvasWidth || !this.canvasHeight) return;

      const mapWidth = this.mapSize * this.zoom;
      const mapHeight = this.mapSize * this.zoom;
      this.panX = (this.canvasWidth - mapWidth) / 2;
      this.panY = (this.canvasHeight - mapHeight) / 2;
    }

    // Zoom methods
    zoomIn(centerX, centerY) {
      const center = this._getZoomCenter(centerX, centerY);
      const worldPoint = this.screenToWorld(center.x, center.y);

      this.zoom = Math.min(this.maxZoom, this.zoom * 1.3);

      this.panX = center.x - worldPoint.x * this.zoom;
      this.panY = center.y - worldPoint.y * this.zoom;
    }

    zoomOut(centerX, centerY) {
      const center = this._getZoomCenter(centerX, centerY);
      const worldPoint = this.screenToWorld(center.x, center.y);

      this.zoom = Math.max(this.minZoom, this.zoom / 1.3);

      this.panX = center.x - worldPoint.x * this.zoom;
      this.panY = center.y - worldPoint.y * this.zoom;
    }

    setZoom(zoom, centerX, centerY) {
      const center = this._getZoomCenter(centerX, centerY);
      const worldPoint = this.screenToWorld(center.x, center.y);

      this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));

      this.panX = center.x - worldPoint.x * this.zoom;
      this.panY = center.y - worldPoint.y * this.zoom;
    }

    // Pan methods
    pan(deltaX, deltaY) {
      this.panX += deltaX;
      this.panY += deltaY;
    }

    setPan(x, y) {
      this.panX = x;
      this.panY = y;
    }

    // View state management
    setView(panX, panY, zoom) {
      this.panX = panX;
      this.panY = panY;
      this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    }

    getView() {
      return {
        panX: this.panX,
        panY: this.panY,
        zoom: this.zoom
      };
    }

    // Reset to default view
    resetView() {
      this.zoom = this.config.ZOOM ? this.config.ZOOM.DEFAULT_MIN || 0.1 : 0.1;
      this.centerMap();
    }

    // Helper method for zoom center calculation
    _getZoomCenter(centerX, centerY) {
      if (centerX !== undefined && centerY !== undefined) {
        return { x: centerX, y: centerY };
      }
      // Default to canvas center
      return {
        x: this.canvasWidth / 2,
        y: this.canvasHeight / 2
      };
    }

    // Bounds checking
    getVisibleBounds() {
      const topLeft = this.screenToWorld(0, 0);
      const bottomRight = this.screenToWorld(this.canvasWidth, this.canvasHeight);

      return {
        left: topLeft.x,
        top: topLeft.y,
        right: bottomRight.x,
        bottom: bottomRight.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y
      };
    }

    // Check if a world point is visible on screen
    isPointVisible(worldX, worldY, padding = 0) {
      const screen = this.worldToScreen(worldX, worldY);
      return screen.x >= -padding &&
             screen.x <= this.canvasWidth + padding &&
             screen.y >= -padding &&
             screen.y <= this.canvasHeight + padding;
    }

    // State persistence (consent-gated)
    saveToStorage() {
      try {
        if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.saveMapView === 'function') {
          const viewData = { panX: this.panX, panY: this.panY, zoom: this.zoom };
          StorageUtils.saveMapView(viewData);
        }
      } catch (e) {
        console.debug('MapState.saveToStorage failed', e);
      }
    }

    loadFromStorage() {
      try {
        if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.loadMapView === 'function') {
          const viewData = StorageUtils.loadMapView();
          if (viewData && typeof viewData === 'object') {
            // Apply zoom bounds
            const minZoom = this.minZoom;
            const maxZoom = this.maxZoom;
            
            if (typeof viewData.zoom === 'number' && Number.isFinite(viewData.zoom)) {
              this.zoom = Math.max(minZoom, Math.min(maxZoom, viewData.zoom));
            }
            if (typeof viewData.panX === 'number' && Number.isFinite(viewData.panX)) {
              this.panX = viewData.panX;
            }
            if (typeof viewData.panY === 'number' && Number.isFinite(viewData.panY)) {
              this.panY = viewData.panY;
            }
            return true;
          }
        }
        return false;
      } catch (e) {
        console.debug('MapState.loadFromStorage failed', e);
        return false;
      }
    }
  }

  global.MapState = MapState;
})(window);
