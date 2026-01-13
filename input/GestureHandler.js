// input/GestureHandler.js
// Handles multi-touch gestures (pinch-to-zoom, pan) extracted from PointerHandler

(function (global) {
  class GestureHandler {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.pinch = null; // {startDistance, startZoom, lastMidX, lastMidY}
      this.pointers = new Map(); // Track pointers for gesture recognition

      // Get state managers from map
      this.mapState = map.mapState;
      this.selectionState = map.selectionState;
      this.routeState = map.routeState;
      this.layerState = map.layerState;
    }

    init() {
      // Gesture recognition is now fully implemented
    }

    // ===== PINCH-TO-ZOOM GESTURES =====

    /**
     * Start a pinch gesture when two pointers are detected
     * @param {Array} pointerValues - Array of pointer objects from PointerHandler.pointers
     */
    startPinch(pointerValues) {
      try {
        const pts = pointerValues;
        if (pts.length < 2) return false;

        const dx = pts[0].clientX - pts[1].clientX;
        const dy = pts[0].clientY - pts[1].clientY;
        const dist = Math.hypot(dx, dy);
        const midClientX = (pts[0].clientX + pts[1].clientX) / 2;
        const midClientY = (pts[0].clientY + pts[1].clientY) / 2;

        this.pinch = {
          startDistance: dist,
          startZoom: this.mapState.zoom,
          lastMidX: midClientX,
          lastMidY: midClientY
        };

        return true;
      } catch (e) {
        this.errorHandler && this.errorHandler.logError(e, 'GestureHandler.startPinch');
        return false;
      }
    }

    /**
     * Handle pinch movement for zoom and pan
     * @param {Array} pointerValues - Array of pointer objects
     * @param {DOMRect} canvasRect - Canvas bounding rectangle
     * @param {Object} viewState - Current view state {panX, panY, zoom}
     * @returns {Object} Updated view state {panX, panY, zoom}
     */
    handlePinchMove(pointerValues, canvasRect, viewState) {
      if (!this.pinch || pointerValues.length < 2) return viewState;

      try {
        const pts = pointerValues;
        const dx = pts[0].clientX - pts[1].clientX;
        const dy = pts[0].clientY - pts[1].clientY;
        const dist = Math.hypot(dx, dy);
        const factor = dist / this.pinch.startDistance;

        // Calculate new zoom with bounds
        const newZoom = Math.max(this.mapState.minZoom, Math.min(this.mapState.maxZoom, this.pinch.startZoom * factor));

        // Calculate centroid for pan
        const midClientX = (pts[0].clientX + pts[1].clientX) / 2;
        const midClientY = (pts[0].clientY + pts[1].clientY) / 2;

        // Handle pan during pinch
        const panDX = midClientX - this.pinch.lastMidX;
        const panDY = midClientY - this.pinch.lastMidY;

        // Convert centroid to world coordinates for proper pan calculation
        const worldX = (midClientX - canvasRect.left - viewState.panX) / viewState.zoom;
        const worldY = (midClientY - canvasRect.top - viewState.panY) / viewState.zoom;

        // Update view state
        const updatedState = {
          zoom: newZoom,
          panX: midClientX - canvasRect.left - worldX * newZoom + panDX,
          panY: midClientY - canvasRect.top - worldY * newZoom + panDY
        };

        // Update pinch state for next move
        this.pinch.lastMidX = midClientX;
        this.pinch.lastMidY = midClientY;

        return updatedState;
      } catch (e) {
        this.errorHandler && this.errorHandler.logError(e, 'GestureHandler.handlePinchMove');
        return viewState;
      }
    }

    /**
     * End pinch gesture
     */
    endPinch() {
      this.pinch = null;
    }

    /**
     * Check if pinch gesture is active
     */
    isPinching() {
      return this.pinch !== null;
    }

    // ===== LEGACY COMPATIBILITY =====

    // Example hook used by PointerHandler when detecting multi-pointer gestures
    onPinch(centroid, scale) {
      try {
        if (typeof this.map.onPinch === 'function') this.map.onPinch(centroid, scale);
      } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'GestureHandler.onPinch'); }
    }
  }

  global.GestureHandler = GestureHandler;
})(window);
