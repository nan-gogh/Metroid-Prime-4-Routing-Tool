// Marker utility functions - now uses manager pattern with dependency injection
// Legacy compatibility layer that delegates to MarkerManager instance

const MarkerUtils = {
    _manager: null,

    // Factory method to create manager with dependencies
    createManager(config, storage, notifications) {
        if (this._manager) {
            console.warn('MarkerManager already exists, returning existing instance');
            return this._manager;
        }

        this._manager = new MarkerManager(config, storage, notifications);

        // Set up legacy callback compatibility
        this._manager.onChanged = () => {
            if (this._onMarkersChanged) {
                try {
                    this._onMarkersChanged();
                } catch (e) {
                    console.debug('MarkerUtils._notifyMarkersChanged failed:', e);
                }
            }
        };

        this._manager.onCleanupRouteReferences = (uid) => {
            if (this._onCleanupRouteReferences) {
                try {
                    this._onCleanupRouteReferences(uid);
                } catch (e) {
                    console.debug('Route cleanup callback failed:', e);
                }
            }
        };

        return this._manager;
    },

    // Get the current manager instance
    getManager() {
        if (!this._manager) {
            throw new Error('MarkerManager not initialized. Call createManager() first.');
        }
        return this._manager;
    },

    // Legacy callback setters for backward compatibility
    setOnMarkersChanged(callback) {
        this._onMarkersChanged = callback;
        if (this._manager) {
            this._manager.onChanged = () => {
                if (callback) {
                    try {
                        callback();
                    } catch (e) {
                        console.debug('MarkerUtils._notifyMarkersChanged failed:', e);
                    }
                }
            };
        }
    },

    setOnCleanupRouteReferences(callback) {
        this._onCleanupRouteReferences = callback;
        if (this._manager) {
            this._manager.onCleanupRouteReferences = (uid) => {
                if (callback) {
                    try {
                        callback(uid);
                    } catch (e) {
                        console.debug('Route cleanup callback failed:', e);
                    }
                }
            };
        }
    },

    // ---------- Legacy compatibility methods (delegate to manager) ----------

    // Export custom markers - delegates to manager
    exportCustomMarkers() {
        return this.getManager().exportMarkers();
    },

    // Import markers from JSON file - delegates to manager
    importCustomMarkers(file) {
        return this.getManager().importMarkers(file);
    },

    // Add a new custom marker - delegates to manager
    addCustomMarker(x, y) {
        return this.getManager().addMarker(x, y);
    },

    // Delete a custom marker by UID - delegates to manager
    deleteCustomMarker(uid) {
        return this.getManager().removeMarker(uid);
    },

    // Delete all custom markers - delegates to manager
    clearCustomMarkers() {
        return this.getManager().clearMarkers();
    },

    // Get marker count - delegates to manager
    getMarkerCount() {
        return this.getManager().getCount();
    },

    // Get all markers - delegates to manager
    getAllMarkers() {
        return this.getManager().getAllMarkers();
    },

    // Check if marker exists - delegates to manager
    markerExists(uid) {
        return this.getManager().hasMarker(uid);
    },

    // Find marker index - delegates to manager
    findMarkerIndex(uid) {
        return this.getManager().findMarkerIndex(uid);
    },

    // Get screen position - delegates to manager
    getMarkerScreenPosition(marker, viewState, mapSize = 8192) {
        return this.getManager().getScreenPosition(marker, viewState, mapSize);
    },

    // ---------- Pure utility functions (delegate to MarkerUtilsCore) ----------

    // UID validation functions
    isHashedUID(uid) {
        return MarkerUtilsCore.isHashedUID(uid);
    },

    isLegacyMarkerUID(uid) {
        return MarkerUtilsCore.isLegacyMarkerUID(uid);
    },

    isLegacyMarkerFile(markersArray) {
        return MarkerUtilsCore.isLegacyMarkerFile(markersArray);
    },

    // Data hashing
    hashMarkerData(markers) {
        return MarkerUtilsCore.hashMarkerData(markers);
    },

    // UID generation
    generateUID(x, y, prefix = 'm') {
        return MarkerUtilsCore.generateUID(x, y, prefix);
    },

    // Marker sizing helpers
    computeBaseMarkerRadius(zoom, routeNodeSize) {
        return MarkerUtilsCore.computeBaseMarkerRadius(zoom, routeNodeSize);
    },

    computeDetailScale(zoom) {
        return MarkerUtilsCore.computeDetailScale(zoom);
    },

    computeMarkerScale(detailScale, markerShrinkFactor) {
        return MarkerUtilsCore.computeMarkerScale(detailScale, markerShrinkFactor);
    },

    computeHitRadius(base, detailScale, markerShrinkFactor, touchPadding) {
        return MarkerUtilsCore.computeHitRadius(base, detailScale, markerShrinkFactor, touchPadding);
    },

    computeMarkerRenderSize(opts) {
        return MarkerUtilsCore.computeMarkerRenderSize(opts);
    },

    // ---------- Deprecated methods (kept for compatibility) ----------

    // Save to localStorage - DEPRECATED: Use manager's saveMarkers instead
    saveToLocalStorage() {
        console.warn('MarkerUtils.saveToLocalStorage() is deprecated. Use MarkerManager.saveMarkers() instead.');
        return this.getManager().saveMarkers();
    },

    // Load from localStorage - DEPRECATED: Use manager's loadMarkers instead
    loadFromLocalStorage() {
        console.warn('MarkerUtils.loadFromLocalStorage() is deprecated. Use MarkerManager.loadMarkers() instead.');
        return this.getManager().loadMarkers();
    },

    // Merge custom markers - DEPRECATED: Use manager's mergeMarkers instead
    mergeCustomMarkers(markersArray) {
        console.warn('MarkerUtils.mergeCustomMarkers() is deprecated. Use MarkerManager.mergeMarkers() instead.');
        return this.getManager().mergeMarkers(markersArray);
    },

    // Clean up route references - DEPRECATED: Handled by manager callbacks
    cleanupRouteReferences(deletedMarkerUid) {
        console.debug('cleanupRouteReferences is deprecated - using manager callbacks instead');
    }
};

// Make MarkerUtils globally available
window.MarkerUtils = MarkerUtils;
