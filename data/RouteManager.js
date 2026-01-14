// RouteManager class - decoupled route management
// Handles all route operations without global state dependencies

class RouteManager {
    constructor(markerManager, storage, notifications) {
        this.markerManager = markerManager;
        this.storage = storage;
        this.notifications = notifications;
        
        // Error handling
        this.errorHandler = typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler();

        // Internal state
        this.currentRoute = [];
        this.routeSources = [];
        this.currentRouteLengthNormalized = 0;
        this.routeLooping = false;
        this.onRouteChanged = null;

        // Note: loadFromStorage() is called explicitly after consent is obtained
    }

    // Set callback for when route changes
    setOnRouteChanged(callback) {
        this.onRouteChanged = callback;
    }

    // Internal notification method
    _notifyRouteChanged() {
        if (this.onRouteChanged) {
            try {
                this.onRouteChanged();
            } catch (e) {
                this.errorHandler.logDebug('RouteManager._notifyRouteChanged failed', 'RouteManager._notifyRouteChanged', { error: e });
            }
        }
    }

    // Load route from storage
    loadFromStorage() {
        try {
            const routeData = this.storage.loadRoute();
            if (routeData) {
                this.currentRoute = routeData.indices || [];
                this.routeSources = routeData.sources || [];
                this.currentRouteLengthNormalized = routeData.lengthNormalized || 0;
            }
            this.routeLooping = this.storage.loadRouteLoopingFlag();
        } catch (e) {
            this.errorHandler.logWarning(e, 'RouteManager.loadFromStorage.failed', {});
            this.currentRoute = [];
            this.routeSources = [];
            this.currentRouteLengthNormalized = 0;
            this.routeLooping = false;
        }
    }

    // Save route to storage
    saveToStorage() {
        try {
            const routeData = {
                indices: this.currentRoute,
                sources: this.routeSources,
                lengthNormalized: this.currentRouteLengthNormalized
            };
            this.storage.saveRoute(routeData);
            this.storage.saveRouteLoopingFlag(this.routeLooping);
        } catch (e) {
            this.errorHandler.logWarning(e, 'RouteManager.saveToStorage.failed', {});
        }
    }

    // Set route data
    setRoute(indices, lengthNormalized, sources) {
        this.currentRoute = indices || [];
        this.currentRouteLengthNormalized = lengthNormalized || 0;
        this.routeSources = sources || [];

        this.saveToStorage();
        this._notifyRouteChanged();
    }

    // Clear route
    clearRoute() {
        this.currentRoute = [];
        this.routeSources = [];
        this.currentRouteLengthNormalized = 0;

        this.saveToStorage();
        this._notifyRouteChanged();
    }

    // Set route looping
    setRouteLooping(looping) {
        this.routeLooping = Boolean(looping);
        this.storage.saveRouteLoopingFlag(this.routeLooping);
        this._notifyRouteChanged();
    }

    // Save route looping flag to storage
    saveRouteLoopingFlag(looping) {
        this.routeLooping = Boolean(looping);
        this.storage.saveRouteLoopingFlag(this.routeLooping);
    }

    // Get route data for export
    getRouteDataForExport() {
        return RouteUtilsCore.extractRoutePoints(this.currentRoute, this.routeSources);
    }

    // Compute route length
    computeRouteLength(mapSize) {
        return RouteUtilsCore.computeRouteLength(this.currentRoute, this.routeSources, mapSize);
    }

    // Compute normalized route length (divided by mapSize for 0-1 range)
    computeRouteLengthNormalized(mapSize) {
        return RouteUtilsCore.computeRouteLengthNormalized(this.routeSources, mapSize);
    }

    // Find position of marker in current route
    findRoutePositionOfMarker(markerUid) {
        return RouteUtilsCore.findRoutePositionOfMarker(markerUid, this.currentRoute, this.routeSources);
    }

    // Find route segment at screen position
    findRouteSegmentAt(screenX, screenY, viewState, mapSize, threshold = 10) {
        return RouteUtilsCore.findRouteSegmentAt(this.currentRoute, this.routeSources, screenX, screenY, viewState, mapSize, threshold);
    }

    // Export route to file
    exportRoute(viewState, mapSize) {
        try {
            RouteUtilsCore.validateRouteForExport(this.currentRoute, this.routeSources);
            const points = this.getRouteDataForExport();
            const timestamp = Date.now();
            const hash = RouteUtilsCore.generateRouteHash(points);
            const json = RouteUtilsCore.createRouteJson(points, timestamp, hash, this.currentRouteLengthNormalized);

            // Download the file
            this._downloadRouteFile(json, timestamp, hash);

            this.notifications.showSuccess('Route exported successfully');
            return true;
        } catch (err) {
            this.notifications.showError('Export failed: ' + err.message);
            throw err;
        }
    }

    // Import route from file
    importRoute(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    this._processImportedRoute(data);
                    this.notifications.showSuccess('Route imported successfully');
                    resolve(true);
                } catch (err) {
                    this.notifications.showError('Import failed: ' + err.message);
                    reject(err);
                }
            };
            reader.onerror = () => {
                this.notifications.showError('Failed to read file');
                reject(new Error('File read error'));
            };
            reader.readAsText(file);
        });
    }

    // Import route from content string (for backward compatibility)
    importRouteFromContent(content) {
        try {
            const data = JSON.parse(content);
            this._processImportedRoute(data);
            this.notifications.showSuccess('Route imported successfully');
            return true;
        } catch (err) {
            this.notifications.showError('Import failed: ' + err.message);
            throw err;
        }
    }

    // Process imported route data
    _processImportedRoute(data) {
        if (!data.points || !Array.isArray(data.points)) {
            throw new Error('Invalid route file format');
        }

        const routeIndices = [];
        const routeSources = [];

        for (let i = 0; i < data.points.length; i++) {
            const point = data.points[i];
            const marker = this._findMarkerForPoint(point);

            if (marker) {
                routeSources.push({ marker });
                routeIndices.push(i);
            } else {
                this.errorHandler.logWarning(`Could not find marker for route point ${i}`, 'RouteManager.importRoute.markerNotFound', { routePointIndex: i, point });
            }
        }

        if (routeIndices.length === 0) {
            throw new Error('No valid markers found for imported route');
        }

        this.setRoute(routeIndices, data.length || 0, routeSources);
    }

    // Find marker for imported route point
    _findMarkerForPoint(point) {
        // Try to find by UID first in markerManager
        if (point.uid && this.markerManager) {
            const marker = this.markerManager.markers.find(m => m.uid === point.uid);
            if (marker) return marker;
        }

        // Fall back to coordinate matching
        if (this.markerManager) {
            const targetHash = RouteUtilsCore.getCoordinateHash(point.x, point.y);
            const marker = this.markerManager.markers.find(m =>
                RouteUtilsCore.markerMatchesCoordinates(m, targetHash)
            );
            if (marker) return marker;
        }

        return null;
    }

    // Download route file
    _downloadRouteFile(json, timestamp, hash) {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `route-${timestamp}${hash ? '-' + hash : ''}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Get route node size for rendering
    getRouteNodeSize(lineWidth, zoom, scale = 1) {
        return RouteUtilsCore.getRouteNodeSize(lineWidth, zoom, scale);
    }

    // Get route statistics
    getRouteStats() {
        return {
            pointCount: this.currentRoute.length,
            lengthNormalized: this.currentRouteLengthNormalized,
            looping: this.routeLooping,
            hasValidPoints: this.currentRoute.every(idx => this.routeSources[idx] && this.routeSources[idx].marker)
        };
    }

    // Cleanup route references when markers are deleted
    cleanupRouteReferences(deletedMarkerUid) {
        let changed = false;

        // Remove route sources that reference the deleted marker
        for (let i = this.routeSources.length - 1; i >= 0; i--) {
            const source = this.routeSources[i];
            if (source && source.marker && source.marker.uid === deletedMarkerUid) {
                this.routeSources.splice(i, 1);
                changed = true;

                // Adjust indices that come after this removed source
                for (let j = 0; j < this.currentRoute.length; j++) {
                    if (this.currentRoute[j] > i) {
                        this.currentRoute[j]--;
                    } else if (this.currentRoute[j] === i) {
                        // Remove this index from the route
                        this.currentRoute.splice(j, 1);
                        j--; // Adjust loop counter
                    }
                }
            }
        }

        if (changed) {
            this.saveToStorage();
            this._notifyRouteChanged();
        }
    }
}

// Make RouteManager globally available
window.RouteManager = RouteManager;