// Marker utility functions - now uses manager pattern with dependency injection
// Legacy compatibility layer that delegates to MarkerManager instance

const MarkerUtils = {
    _manager: null,
    errorHandler: typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler(),

    // Factory method to create manager with dependencies
    createManager(config, storage, notifications) {
        if (this._manager) {
            this.errorHandler.logWarning('MarkerManager already exists, returning existing instance', 'MarkerUtils.createManager.duplicate', {});
            return this._manager;
        }

        this._manager = new MarkerManager(config, storage, notifications);

        // Set up legacy callback compatibility
        this._manager.onChanged = () => {
            if (this._onMarkersChanged) {
                try {
                    this._onMarkersChanged();
                } catch (e) {
                    this.errorHandler.logDebug('MarkerUtils._notifyMarkersChanged failed', 'MarkerUtils._notifyMarkersChanged', { error: e });
                }
            }
        };

        this._manager.onCleanupRouteReferences = (uid) => {
            if (this._onCleanupRouteReferences) {
                try {
                    this._onCleanupRouteReferences(uid);
                } catch (e) {
                    this.errorHandler.logDebug('Route cleanup callback failed', 'MarkerUtils.routeCleanupCallback', { error: e });
                }
            }
        };

        return this._manager;
    },

    // Get the current manager instance
    getManager() {
        if (!this._manager) {
            // Try to create manager if dependencies are available
            if (typeof MarkerManager !== 'undefined' && typeof StorageInterface !== 'undefined' && typeof NotificationInterface !== 'undefined') {
                try {
                    this._manager = new MarkerManager({ maxMarkers: 50, layerPrefix: 'cm' }, StorageInterface, NotificationInterface);
                    
                    // Set up callbacks
                    this._manager.onChanged = () => {
                        if (this._onMarkersChanged) {
                            try {
                                this._onMarkersChanged();
                            } catch (e) {
                                this.errorHandler.logDebug('MarkerUtils._notifyMarkersChanged failed', 'MarkerUtils.getManager._notifyMarkersChanged', { error: e });
                            }
                        }
                    };

                    this._manager.onCleanupRouteReferences = (uid) => {
                        if (this._onCleanupRouteReferences) {
                            try {
                                this._onCleanupRouteReferences(uid);
                            } catch (e) {
                                this.errorHandler.logDebug('Route cleanup callback failed', 'MarkerUtils.getManager.routeCleanupCallback', { error: e });
                            }
                        }
                    };
                    
                    this.errorHandler.logDebug('On-demand MarkerManager creation succeeded', 'MarkerUtils.getManager.creationSuccess', {});
                } catch (e) {
                    this.errorHandler.logError(e, 'MarkerUtils.getManager.creationFailed', {});
                    throw new Error('MarkerManager creation failed: ' + e.message);
                }
            } else {
                throw new Error('MarkerManager dependencies not available. Required: MarkerManager, StorageInterface, NotificationInterface');
            }
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
                        this.errorHandler.logDebug('MarkerUtils._notifyMarkersChanged failed', 'MarkerUtils.setOnMarkersChanged', { error: e });
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
                        this.errorHandler.logDebug('Route cleanup callback failed', 'MarkerUtils.setOnCleanupRouteReferences', { error: e });
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
    }
};

// Make MarkerUtils globally available
window.MarkerUtils = MarkerUtils;
