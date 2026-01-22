// Marker utility functions - now uses manager pattern with dependency injection
// Legacy compatibility layer that delegates to MarkerManager instance

if (typeof globalThis.__MP4_NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.__MP4_NOOP_ERROR_HANDLER = { logDebug: function(){}, logWarning: function(){}, logError: function(){} };
}

const MarkerUtils = {
    _manager: null,
    _errorHandler: globalThis.__MP4_NOOP_ERROR_HANDLER,
    _storageInstance: null,

    // Inject error handler after initialization
    setErrorHandler(handler) {
        this._errorHandler = handler || globalThis.__MP4_NOOP_ERROR_HANDLER;
    },

    // Inject an explicit storage instance (preferred over global accessor)
    setStorageInstance(storageInstance) {
        this._storageInstance = storageInstance || null;
    },

    // Factory method to create manager with dependencies
    createManager(config, storage, notifications, eventBus) {
        if (this._manager) {
            this._errorHandler.logWarning('MarkerManager already exists, returning existing instance', 'MarkerUtils.createManager.duplicate', {});
            return this._manager;
        }

        const h = this._errorHandler;
        this._manager = new MarkerManager(config, storage, notifications, eventBus, { errorHandler: this._errorHandler });

        // Set up route cleanup callback compatibility
        this._manager.onCleanupRouteReferences = (uid) => {
            if (this._onCleanupRouteReferences) {
                try {
                    this._onCleanupRouteReferences(uid);
                } catch (e) {
                    h.logWarning('Route cleanup callback failed', 'MarkerUtils.routeCleanupCallback', { error: e });
                }
            }
        };

        return this._manager;
    },

    // Get the current manager instance
    getManager() {
        if (!this._manager) {
            // Try to create manager if dependencies are available
                // Prefer injected storage instance; fall back to global storage provider or window.storageService
                    const storageService = this._storageInstance || (typeof window !== 'undefined' && window.storageProvider && typeof window.storageProvider.getInstance === 'function' ? window.storageProvider.getInstance() : (typeof window !== 'undefined' && window.storageService ? window.storageService : null));
            if (typeof MarkerManager !== 'undefined' && storageService !== null && typeof NotificationInterface !== 'undefined') {
                try {
                    const h = this._errorHandler;
                    this._manager = new MarkerManager({ maxMarkers: 50, layerPrefix: 'cm' }, storageService || {}, NotificationInterface, null, { errorHandler: this._errorHandler });

                    // Set up route cleanup callback
                    this._manager.onCleanupRouteReferences = (uid) => {
                        if (this._onCleanupRouteReferences) {
                            try {
                                this._onCleanupRouteReferences(uid);
                            } catch (e) {
                                h.logWarning('Route cleanup callback failed', 'MarkerUtils.getManager.routeCleanupCallback', { error: e });
                            }
                        }
                    };

                    h.logDebug('On-demand MarkerManager creation succeeded', 'MarkerUtils.getManager.creationSuccess', {});
                } catch (e) {
                    this._errorHandler.logError(e, 'MarkerUtils.getManager.creationFailed', {});
                    throw new Error('MarkerManager creation failed: ' + e.message);
                }
            } else {
                throw new Error('MarkerManager dependencies not available. Required: MarkerManager, StorageService, NotificationInterface');
            }
        }
        return this._manager;
    },

    // Legacy callback setters for backward compatibility
        setOnCleanupRouteReferences(callback) {
        this._onCleanupRouteReferences = callback;
        if (this._manager) {
            const h = this._errorHandler;
            this._manager.onCleanupRouteReferences = (uid) => {
                if (callback) {
                    try {
                        callback(uid);
                    } catch (e) {
                        h.logWarning('Route cleanup callback failed', 'MarkerUtils.setOnCleanupRouteReferences', { error: e });
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
        // Prefer emitting via manager's injected eventBus if available
        try {
            const storageService = this._storageInstance || (typeof window !== 'undefined' && window.storageProvider && typeof window.storageProvider.getInstance === 'function' ? window.storageProvider.getInstance() : (typeof window !== 'undefined' && window.storageService ? window.storageService : {}));
            const mgr = this._manager || (this._manager = (typeof MarkerManager !== 'undefined' ? new MarkerManager({ maxMarkers: 50, layerPrefix: 'cm' }, storageService || {}, NotificationInterface, null, { errorHandler: this._errorHandler }) : null));
            if (mgr && mgr.eventBus && EventTypes && EventTypes.MARKER_CLEAR_REQUESTED) {
                try {
                    mgr.eventBus.emit(EventTypes.MARKER_CLEAR_REQUESTED);
                    return;
                } catch (e) {
                    this._errorHandler.logWarning('MarkerUtils.clearCustomMarkers emit failed', 'MarkerUtils.clearCustomMarkers', { error: e });
                    // Fall through to direct call
                }
            }
        } catch (e) {
            // Silence manager creation errors here and fall back
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

