// Route utility functions - now uses RouteManager for decoupled operations

const RouteUtils = {
    _manager: null,

    // Factory method to create manager with dependencies
    createManager(markerManager, storage, notifications) {
        if (this._manager) {
            console.warn('RouteManager already exists, returning existing instance');
            return this._manager;
        }

        this._manager = new RouteManager(markerManager, storage, notifications);

        // Set up legacy callback compatibility
        this._manager.setOnRouteChanged(() => {
            if (this._onRouteChanged) {
                try {
                    this._onRouteChanged();
                } catch (e) {
                    console.debug('RouteUtils._notifyRouteChanged failed:', e);
                }
            }
        });

        return this._manager;
    },

    // Get the current manager instance
    getManager() {
        if (!this._manager) {
            throw new Error('RouteManager not initialized. Call createManager() first.');
        }
        return this._manager;
    },

    // Legacy callback setters for backward compatibility
    setOnRouteChanged(callback) {
        this._onRouteChanged = callback;
        // Note: This now just stores the callback - actual route validation moved to manager
    },

    // Import route - delegate to manager
    importRoute(file, layers) {
        return this.getManager().importRoute(file, layers);
    },

    // Set route data - delegate to manager
    setRoute(indices, lengthNormalized, sources) {
        return this.getManager().setRoute(indices, lengthNormalized, sources);
    },

    // Clear route - delegate to manager
    clearRoute() {
        return this.getManager().clearRoute();
    },

    // Set route looping - delegate to manager
    setRouteLooping(looping) {
        return this.getManager().setRouteLooping(looping);
    },

    // Get route data for export - delegate to manager
    getRouteDataForExport() {
        return this.getManager().getRouteDataForExport();
    },

    // Compute route length - delegate to manager
    computeRouteLength(mapSize) {
        return this.getManager().computeRouteLength(mapSize);
    },

    // Compute normalized route length from sources array
    computeRouteLengthNormalized(sources, mapSize) {
        if (!Array.isArray(sources)) return 0;
        const indices = sources.map((_, i) => i);
        return RouteUtilsCore.computeRouteLength(indices, sources, mapSize) / mapSize;
    },

    // Find route segment at position - delegate to manager
    findRouteSegmentAt(screenX, screenY, viewState, mapSize, threshold) {
        return this.getManager().findRouteSegmentAt(screenX, screenY, viewState, mapSize, threshold);
    },

    // Get route node size - delegate to manager
    getRouteNodeSize(lineWidth, zoom, scale) {
        return this.getManager().getRouteNodeSize(lineWidth, zoom, scale);
    },

    // Get route statistics - delegate to manager
    getRouteStats() {
        return this.getManager().getRouteStats();
    },

    // Cleanup route references - delegate to manager
    cleanupRouteReferences(deletedMarkerUid) {
        return this.getManager().cleanupRouteReferences(deletedMarkerUid);
    },

    // Export route - delegate to manager
    exportRoute(viewState, mapSize) {
        return this.getManager().exportRoute(viewState, mapSize);
    },

    // Save route to storage - delegate to manager
    saveRouteToStorage() {
        return this.getManager().saveToStorage();
    },

    // Load route from storage - delegate to manager
    loadRouteFromStorage() {
        return this.getManager().loadFromStorage();
    },

    // Import route from content string (backward compatibility)
    importRouteFromFile(content, map, layers, markerUtils, maxMarkers) {
        // Ignore map, markerUtils, maxMarkers for backward compatibility
        return this.getManager().importRouteFromContent(content, layers);
    },
};

// Legacy functions for backward compatibility - these delegate to RouteUtilsCore
RouteUtils.extractHashFromUID = RouteUtilsCore.extractHashFromUID;
RouteUtils.getCoordinateHash = RouteUtilsCore.getCoordinateHash;
RouteUtils.markerMatchesCoordinates = RouteUtilsCore.markerMatchesCoordinates;
RouteUtils.findLayerKeyByHash = RouteUtilsCore.findLayerKeyByHash;
RouteUtils.getRoutePreviewScreenPosition = RouteUtilsCore.getRoutePreviewScreenPosition;
RouteUtils.createOrderedSources = RouteUtilsCore.createOrderedSources;
RouteUtils.calculateSegmentInsertionPosition = RouteUtilsCore.calculateSegmentInsertionPosition;
RouteUtils.insertWaypointIntoOrderedSources = RouteUtilsCore.insertWaypointIntoOrderedSources;
RouteUtils.findRoutePositionOfMarker = RouteUtilsCore.findRoutePositionOfMarker;

// Make RouteUtils globally available
window.RouteUtils = RouteUtils;
