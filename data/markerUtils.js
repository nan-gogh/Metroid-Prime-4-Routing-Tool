// Marker utility functions - now uses manager pattern with dependency injection
// Legacy compatibility layer that delegates to MarkerManager instance

const MarkerUtils = {
    _manager: null,
    _errorHandler: null,

    // Inject error handler after initialization
    setErrorHandler(handler) {
        this._errorHandler = handler;
    },

    // Factory method to create manager with dependencies
    createManager(config, storage, notifications, eventBus) {
        if (this._manager) {
            if (this._errorHandler) {
                this._errorHandler.logWarning('MarkerManager already exists, returning existing instance', 'MarkerUtils.createManager.duplicate', {});
            }
            return this._manager;
        }

        this._manager = new MarkerManager(config, storage, notifications, eventBus, { errorHandler: this._errorHandler });

        // Set up route cleanup callback compatibility
        this._manager.onCleanupRouteReferences = (uid) => {
            if (this._onCleanupRouteReferences) {
                try {
                    this._onCleanupRouteReferences(uid);
                } catch (e) {
                    console.debug('Route cleanup callback failed', 'MarkerUtils.routeCleanupCallback', { error: e });
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
                    this._manager = new MarkerManager({ maxMarkers: 50, layerPrefix: 'cm' }, StorageInterface, NotificationInterface, window.eventBus, { errorHandler: this._errorHandler });
                    
                    // Set up route cleanup callback
                    this._manager.onCleanupRouteReferences = (uid) => {
                        if (this._onCleanupRouteReferences) {
                            try {
                                this._onCleanupRouteReferences(uid);
                            } catch (e) {
                                console.debug('Route cleanup callback failed', 'MarkerUtils.getManager.routeCleanupCallback', { error: e });
                            }
                        }
                    };
                    
                    console.debug('On-demand MarkerManager creation succeeded', 'MarkerUtils.getManager.creationSuccess', {});
                } catch (e) {
                    if (this._errorHandler) this._errorHandler.logError(e, 'MarkerUtils.getManager.creationFailed', {});
                    throw new Error('MarkerManager creation failed: ' + e.message);
                }
            } else {
                throw new Error('MarkerManager dependencies not available. Required: MarkerManager, StorageInterface, NotificationInterface');
            }
        }
        return this._manager;
    },

    // Legacy callback setters for backward compatibility
    setOnCleanupRouteReferences(callback) {
        this._onCleanupRouteReferences = callback;
        if (this._manager) {
            this._manager.onCleanupRouteReferences = (uid) => {
                if (callback) {
                    try {
                        callback(uid);
                    } catch (e) {
                        console.debug('Route cleanup callback failed', 'MarkerUtils.setOnCleanupRouteReferences', { error: e });
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
        // Prefer event-driven clear so MarkerManager remains authoritative.
        if (window.eventBus && window.EventTypes && window.EventTypes.MARKER_CLEAR_REQUESTED) {
            try {
                window.eventBus.emit(window.EventTypes.MARKER_CLEAR_REQUESTED);
                return;
            } catch (e) {
                console.debug('MarkerUtils.clearCustomMarkers emit failed', 'MarkerUtils.clearCustomMarkers', { error: e });
                // Fall through to direct call
            }
        }
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

