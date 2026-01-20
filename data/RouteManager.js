// RouteManager class - decoupled route management
// Handles all route operations without global state dependencies

class RouteManager {
    constructor(markerManager, storage, notifications, eventBus, options = {}) {
        this.markerManager = markerManager;
        this.storage = storage;
        this.notifications = notifications;
        this.eventBus = eventBus;
        
        // Error handling (constructor-injected)
        this.errorHandler = options.errorHandler || new ErrorHandler();

        // Internal state
        this.currentRoute = [];
        this.routeSources = [];
        this.currentRouteLengthNormalized = 0;
        this.routeLooping = false;
        this.onRouteChanged = null;

        // Route version for cache invalidation
        this._routeVersion = 0;

        // Temporary drag state for waypoint repositioning
        this.dragWaypointState = null; // { originalIndex, tempMarker, originalSources, originalIndices }

        // Event listener cleanup
        this._eventUnsubscribers = [];

        // Listen for route edit requests (decoupled from direct method calls)
        this._setupEventListeners();

        // Note: loadFromStorage() is called explicitly after consent is obtained
    }

    // Set up event listeners for decoupled communication
    _setupEventListeners() {
        if (this.eventBus && window.EventTypes) {
            // Use EventUtils for standardized event handling
            const eventManager = window.EventUtils.createEventManager(this);

            eventManager.setup(this.eventBus, [
                {
                    event: window.EventTypes.ROUTE_EDIT_REQUESTED,
                    handler: (data) => {
                        // Handle waypoint drag finalization via ROUTE_EDIT_REQUESTED
                        // This is how RouteEditHandler signals drop target detection completion
                        if (data && data.finalizeWaypointDrag) {
                            this.finalizeWaypointDrag(data.snapToMarker, data.cancel);
                            return;
                        }

                        // Normal route edit request
                        if (data && typeof data.indices !== 'undefined') {
                            this.setRoute(data.indices, data.lengthNormalized, data.sources);
                        }
                    }
                },
                {
                    event: window.EventTypes.ROUTE_LOOPING_CHANGED,
                    handler: (data) => {
                        if (typeof data.looping === 'boolean') {
                            this.setRouteLooping(data.looping);
                        }
                    }
                },
                {
                    event: window.EventTypes.ROUTE_SEGMENT_INSERT_REQUESTED,
                    handler: (data) => {
                        if (data && typeof data.segmentIndex === 'number' && typeof data.t === 'number' && data.tempMarker) {
                            this.insertWaypointAtSegment(data.segmentIndex, data.t, data.tempMarker);
                        }
                    }
                },
                {
                    event: window.EventTypes.ROUTE_WAYPOINT_DRAG_REQUESTED,
                    handler: (data) => {
                        if (data && typeof data.waypointIndex === 'number' && typeof data.worldX === 'number' && typeof data.worldY === 'number') {
                            this.updateWaypointPosition(data.waypointIndex, data.worldX, data.worldY);
                        }
                    }
                },
                {
                    event: window.EventTypes.ROUTE_WAYPOINT_DRAG_STARTED,
                    handler: (data) => {
                        if (data && typeof data.waypointIndex === 'number') {
                            this.startWaypointDrag(data.waypointIndex);
                        }
                    }
                }
            ], this, this.errorHandler);

            // NOTE: ROUTE_WAYPOINT_DRAG_FINALIZED is handled by RouteEditHandler, which
            // detects the drop target and emits ROUTE_EDIT_REQUESTED with proper data.
            // RouteManager handles finalization via ROUTE_EDIT_REQUESTED, not FINALIZED.

            // NOTE: ROUTE_WAYPOINT_DRAG_CHANGED is also handled by RouteEditHandler.
            // When drag transitions to null, RouteEditHandler processes the pending
            // finalize and emits ROUTE_EDIT_REQUESTED. RouteManager should NOT auto-cancel
            // here because RouteEditHandler is the authority on waypoint drag finalization.
        }
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
                this.errorHandler && this.errorHandler.logDebug('RouteManager._notifyRouteChanged failed', 'RouteManager._notifyRouteChanged', { error: e });
            }
        }

        // Emit EventBus event for cross-module communication
        if (this.eventBus && window.EventTypes) {
            try {
                this.eventBus.emit(window.EventTypes.ROUTE_UPDATED, {
                    routeLength: this.currentRouteLengthNormalized,
                    pointCount: this.currentRoute.length,
                    looping: this.routeLooping
                });
            } catch (e) {
                this.errorHandler && this.errorHandler.logDebug('RouteManager EventBus emission failed', 'RouteManager._notifyRouteChanged', { error: e });
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

                // Increment route version for cache invalidation
                this._routeVersion++;
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
        // Validate indices are within marker range
        const validIndices = [];
        const validSources = [];
        const markerCount = this.markerManager ? this.markerManager.getCount() : 0;

        if (indices && Array.isArray(indices)) {
            for (let i = 0; i < indices.length; i++) {
                const index = indices[i];
                if (typeof index === 'number' && index >= 0 && index < markerCount) {
                    validIndices.push(index);
                    validSources.push(sources && sources[i] ? sources[i] : null);
                } else {
                    this.errorHandler.logWarning(`RouteManager.setRoute: Invalid marker index ${index}, skipping`, 'RouteManager.setRoute.validation', {
                        index,
                        markerCount,
                        routeLength: indices.length
                    });
                }
            }
        }

        this.currentRoute = validIndices;
        this.currentRouteLengthNormalized = lengthNormalized || 0;
        this.routeSources = validSources;

        // Increment route version for cache invalidation
        this._routeVersion++;

        this.saveToStorage();

        // Emit ROUTE_CLEARED if route becomes empty, otherwise emit ROUTE_UPDATED
        if (this.currentRoute.length === 0) {
            if (this.eventBus && window.EventTypes) {
                try {
                    this.eventBus.emit(window.EventTypes.ROUTE_CLEARED);
                } catch (e) {
                    this.errorHandler && this.errorHandler.logDebug('RouteManager EventBus emission failed', 'RouteManager.setRoute', { error: e });
                }
            }
        }

        this._notifyRouteChanged();
    }

    // Clear route
    clearRoute() {
        this.currentRoute = [];
        this.routeSources = [];
        this.currentRouteLengthNormalized = 0;

        // Increment route version for cache invalidation
        this._routeVersion++;

        this.saveToStorage();

        // Emit ROUTE_CLEARED event before calling _notifyRouteChanged
        if (this.eventBus && window.EventTypes) {
            try {
                this.eventBus.emit(window.EventTypes.ROUTE_CLEARED);
            } catch (e) {
                this.errorHandler && this.errorHandler.logDebug('RouteManager EventBus emission failed', 'RouteManager.clearRoute', { error: e });
            }
        }

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

    // Get current route indices
    getRoute() {
        return this.currentRoute;
    }

    // Get route sources
    getRouteSources() {
        return this.routeSources;
    }

    // Get route data for export
    getRouteDataForExport() {
        return this.extractRoutePoints(this.currentRoute, this.routeSources);
    }

    // Compute route length
    computeRouteLength(mapSize) {
        return RouteMath.computeRouteLength(this.currentRoute, this.routeSources, mapSize);
    }

    // Compute normalized route length (divided by mapSize for 0-1 range)
    // Accepts either `(mapSize)` to operate on current `routeSources`, or `(sources, mapSize)`.
    computeRouteLengthNormalized(sourcesOrMapSize, mapSizeOptional) {
        try {
            let sources = this.routeSources;
            let mapSize = 8192;

            if (Array.isArray(sourcesOrMapSize)) {
                sources = sourcesOrMapSize;
                mapSize = mapSizeOptional || mapSize;
            } else if (typeof sourcesOrMapSize === 'number') {
                mapSize = sourcesOrMapSize || mapSize;
            }

            if (!Array.isArray(sources)) return 0;

            // Compute total length in pixels, then normalize by mapSize
            let length = 0;
            for (let i = 1; i < sources.length; i++) {
                const prev = sources[i - 1];
                const curr = sources[i];
                if (prev && curr && prev.marker && curr.marker) {
                    const dx = (curr.marker.x - prev.marker.x) * mapSize;
                    const dy = (curr.marker.y - prev.marker.y) * mapSize;
                    length += Math.sqrt(dx * dx + dy * dy);
                }
            }

            return length / mapSize;
        } catch (e) {
            this.errorHandler && this.errorHandler.logDebug('RouteManager.computeRouteLengthNormalized failed', 'RouteManager.computeRouteLengthNormalized', { error: e });
            return 0;
        }
    }

    // Find position of marker in current route
    findRoutePositionOfMarker(markerUid) {
        if (!Array.isArray(this.currentRoute) || !Array.isArray(this.routeSources)) return -1;
        if (typeof markerUid !== 'string') return -1;

        for (let i = 0; i < this.currentRoute.length; i++) {
            const idx = this.currentRoute[i];
            const source = this.routeSources[idx];
            if (source && source.marker && source.marker.uid === markerUid) {
                return i;
            }
        }
        return -1;
    }

    // Find route segment at screen position
    findRouteSegmentAt(screenX, screenY, viewState, mapSize, threshold = 10) {
        // Convert screen to world coordinates
        const worldX = (screenX - viewState.panX) / (mapSize * viewState.zoom);
        const worldY = (screenY - viewState.panY) / (mapSize * viewState.zoom);

        // Find closest segment
        let closestDist = Infinity;
        let closestSegment = null;

        for (let i = 1; i < this.currentRoute.length; i++) {
            const prev = this.routeSources[this.currentRoute[i-1]];
            const curr = this.routeSources[this.currentRoute[i]];

            if (!prev || !curr || !prev.marker || !curr.marker) continue;

            // Check distance to line segment
            const dist = RouteMath._pointToLineDistance(worldX, worldY, prev.marker.x, prev.marker.y, curr.marker.x, curr.marker.y);
            if (dist < closestDist && dist <= threshold / (mapSize * viewState.zoom)) {
                closestDist = dist;
                closestSegment = {
                    index: i - 1,
                    t: RouteMath._getParameterT(worldX, worldY, prev.marker.x, prev.marker.y, curr.marker.x, curr.marker.y)
                };
            }
        }

        return closestSegment;
    }

    // Find route waypoint at screen position
    findRouteWaypointAt(screenX, screenY, viewState, mapSize, threshold = 30) {
        // Convert screen to world coordinates
        const worldX = (screenX - viewState.panX) / (mapSize * viewState.zoom);
        const worldY = (screenY - viewState.panY) / (mapSize * viewState.zoom);

        // Find closest waypoint
        let closestDist = Infinity;
        let closestWaypoint = null;

        for (let i = 0; i < this.currentRoute.length; i++) {
            const source = this.routeSources[this.currentRoute[i]];
            if (!source || !source.marker) continue;

            // Check distance to waypoint
            const dx = worldX - source.marker.x;
            const dy = worldY - source.marker.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const thresholdWorld = threshold / (mapSize * viewState.zoom);

            if (dist < closestDist && dist <= thresholdWorld) {
                closestDist = dist;
                closestWaypoint = {
                    marker: source.marker,
                    index: i
                };
            }
        }

        return closestWaypoint;
    }

    // Insert waypoint at segment
    insertWaypointAtSegment(segmentIndex, t, tempMarker) {
        try {
            const prevIndices = Array.isArray(this.currentRoute) ? this.currentRoute.slice() : [];
            const prevSources = Array.isArray(this.routeSources) ? this.routeSources.slice() : [];

            const ordered = this.createOrderedSources(prevIndices, prevSources);

            // Calculate insertion position
            const insertPosition = this.calculateSegmentInsertionPosition(segmentIndex, t, ordered, this.routeLooping);
            if (!insertPosition) return;

            // Use provided temp marker
            tempMarker.x = insertPosition.x;
            tempMarker.y = insertPosition.y;

            // Insert into ordered sources
            const newOrdered = this.insertWaypointIntoOrderedSources(ordered, insertPosition, tempMarker, 'temp');

            const newSources = newOrdered;
            const newIndices = newSources.map((_, i) => i);

            // Set the route
            this.setRoute(newIndices, this.computeRouteLengthNormalized(newSources, 8192), newSources); // Use default map size

        } catch (e) {
            this.errorHandler && this.errorHandler.logDebug('RouteManager.insertWaypointAtSegment failed', 'RouteManager.insertWaypointAtSegment', { error: e });
        }
    }

    // Start waypoint drag - create temporary drag state
    startWaypointDrag(waypointIndex) {
        try {
            if (!Array.isArray(this.currentRoute) || !Array.isArray(this.routeSources)) return;
            if (waypointIndex < 0 || waypointIndex >= this.currentRoute.length) return;

            // Store original state for restoration if drag is cancelled
            this.dragWaypointState = {
                originalIndex: waypointIndex,
                originalSources: this.routeSources.slice(),
                originalIndices: this.currentRoute.slice(),
                originalLength: this.currentRouteLengthNormalized
            };

            this.errorHandler && this.errorHandler.logDebug('Started waypoint drag', 'RouteManager.startWaypointDrag', { waypointIndex });
        } catch (e) {
            this.errorHandler && this.errorHandler.logDebug('RouteManager.startWaypointDrag failed', 'RouteManager.startWaypointDrag', { error: e });
        }
    }

    // Update waypoint position during drag - create temporary marker
    updateWaypointPosition(waypointIndex, worldX, worldY) {
        try {
            if (!this.dragWaypointState || this.dragWaypointState.originalIndex !== waypointIndex) return;

            // Create or update temporary marker for drag preview
            if (!this.dragWaypointState.tempMarker) {
                // Create a temporary marker for drag preview (not saved to markerManager)
                this.dragWaypointState.tempMarker = {
                    uid: `temp-drag-${Date.now()}`,
                    x: worldX,
                    y: worldY,
                    temp: true // Mark as temporary
                };
            } else {
                // Update existing temp marker position
                this.dragWaypointState.tempMarker.x = worldX;
                this.dragWaypointState.tempMarker.y = worldY;
            }

            // Create temporary route sources with the dragged waypoint replaced
            const tempSources = this.dragWaypointState.originalSources.slice();
            const tempIndices = this.dragWaypointState.originalIndices.slice();

            // Replace the waypoint at the original index with our temp marker
            const sourceIndex = tempIndices[waypointIndex];
            tempSources[sourceIndex] = {
                marker: this.dragWaypointState.tempMarker,
                layerKey: 'temp',
                layerIndex: sourceIndex
            };

            // Update current route temporarily for rendering
            this.routeSources = tempSources;
            this.currentRoute = tempIndices;
            this.currentRouteLengthNormalized = this.computeRouteLengthNormalized(tempSources, 8192);

            // Notify of change for rendering
            this._notifyRouteChanged();

        } catch (e) {
            this.errorHandler && this.errorHandler.logDebug('RouteManager.updateWaypointPosition failed', 'RouteManager.updateWaypointPosition', { error: e });
        }
    }

    // Finalize waypoint drag - either snap to marker or cancel
    finalizeWaypointDrag(snapToMarker, cancel = false) {
        try {
            if (!this.dragWaypointState) return;

            if (cancel || !snapToMarker) {
                // Cancel: restore original route
                this.routeSources = this.dragWaypointState.originalSources.slice();
                this.currentRoute = this.dragWaypointState.originalIndices.slice();
                this.currentRouteLengthNormalized = this.dragWaypointState.originalLength;
                this.errorHandler && this.errorHandler.logDebug('Cancelled waypoint drag - restored original route', 'RouteManager.finalizeWaypointDrag');
            } else {
                // Snap to marker: replace the waypoint with the target marker
                const waypointIndex = this.dragWaypointState.originalIndex;
                const sourceIndex = this.dragWaypointState.originalIndices[waypointIndex];

                // Find the marker in markerManager
                const targetMarker = this.markerManager ? this.markerManager.getAllMarkers().find(m => m.uid === snapToMarker.uid) : null;
                if (targetMarker) {
                    // Replace the waypoint with the target marker
                    this.routeSources[sourceIndex] = {
                        marker: targetMarker,
                        layerKey: snapToMarker.layerKey || 'customMarkers',
                        layerIndex: sourceIndex
                    };

                    // Recalculate route length
                    this.currentRouteLengthNormalized = this.computeRouteLengthNormalized(this.routeSources, 8192);

                    this.errorHandler && this.errorHandler.logDebug('Snapped waypoint to marker', 'RouteManager.finalizeWaypointDrag', { markerUid: snapToMarker.uid });
                } else {
                    // Fallback: cancel if marker not found
                    this.routeSources = this.dragWaypointState.originalSources.slice();
                    this.currentRoute = this.dragWaypointState.originalIndices.slice();
                    this.currentRouteLengthNormalized = this.dragWaypointState.originalLength;
                    this.errorHandler && this.errorHandler.logDebug('Marker not found for snap - cancelled drag', 'RouteManager.finalizeWaypointDrag');
                }
            }

            // Clean up drag state
            this.dragWaypointState = null;

            // Increment route version for cache invalidation
            this._routeVersion++;

            // Save to storage and notify
            this.saveToStorage();
            this._notifyRouteChanged();

        } catch (e) {
            this.errorHandler && this.errorHandler.logDebug('RouteManager.finalizeWaypointDrag failed', 'RouteManager.finalizeWaypointDrag', { error: e });
            // Emergency cleanup
            if (this.dragWaypointState) {
                this.routeSources = this.dragWaypointState.originalSources.slice();
                this.currentRoute = this.dragWaypointState.originalIndices.slice();
                this.currentRouteLengthNormalized = this.dragWaypointState.originalLength;
                this.dragWaypointState = null;
                this._notifyRouteChanged();
            }
        }
    }

    // Export route to file
    exportRoute(viewState, mapSize) {
        try {
            this.validateRouteForExport(this.currentRoute, this.routeSources);
            const points = this.extractRoutePoints(this.currentRoute, this.routeSources);
            const timestamp = Date.now();
            const hash = this.generateRouteHash(points);
            const json = this.createRouteJson(points, timestamp, hash, this.currentRouteLengthNormalized);

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
            const targetHash = RouteMath.getCoordinateHash(point.x, point.y);
            const marker = this.markerManager.markers.find(m =>
                RouteMath.markerMatchesCoordinates(m, targetHash)
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
        return RouteMath.getRouteNodeSize(lineWidth, zoom, scale);
    }

    // Create ordered sources array from indices
    createOrderedSources(indices, sources) {
        return indices.map(idx => sources[idx]).filter(Boolean);
    }

    // Calculate insertion position along a route segment
    calculateSegmentInsertionPosition(segmentIndex, t, orderedSources, routeLooping) {
        if (!Array.isArray(orderedSources) || orderedSources.length < 2) return null;
        if (typeof t !== 'number' || t < 0 || t > 1) return null;

        const len = orderedSources.length;
        const isLastSegment = segmentIndex >= len - 1;

        let p1, p2;
        if (isLastSegment && routeLooping && len > 2) {
            // Last segment connects back to first
            p1 = orderedSources[len - 1];
            p2 = orderedSources[0];
        } else if (segmentIndex < len - 1) {
            p1 = orderedSources[segmentIndex];
            p2 = orderedSources[segmentIndex + 1];
        } else {
            return null;
        }

        if (!p1 || !p2 || !p1.marker || !p2.marker) return null;

        // Interpolate between the two points
        const x = p1.marker.x + (p2.marker.x - p1.marker.x) * t;
        const y = p1.marker.y + (p2.marker.y - p1.marker.y) * t;

        return { x, y, segmentIndex, t };
    }

    // Insert waypoint into ordered sources array
    insertWaypointIntoOrderedSources(orderedSources, insertPosition, tempMarker, type) {
        if (!Array.isArray(orderedSources) || !insertPosition || !tempMarker) return orderedSources;

        const newOrdered = [...orderedSources];
        const insertIndex = insertPosition.segmentIndex + 1;

        // Create source object for the temp marker
        const source = {
            marker: tempMarker,
            type: type || 'temp'
        };

        // Insert at the calculated position
        newOrdered.splice(insertIndex, 0, source);

        return newOrdered;
    }

    // Validate route data for export
    validateRouteForExport(routeIndices, routeSources) {
        if (!Array.isArray(routeIndices) || routeIndices.length === 0) {
            throw new Error('No route to export.');
        }
        if (!Array.isArray(routeSources)) {
            throw new Error('Invalid route sources.');
        }
    }

    // Extract route points from route data
    extractRoutePoints(routeIndices, routeSources) {
        const pts = [];
        for (let i = 0; i < routeIndices.length; i++) {
            const idx = routeIndices[i];
            const src = routeSources[idx];
            if (src && src.marker) {
                pts.push({
                    uid: src.marker.uid || '',
                    x: Number(src.marker.x),
                    y: Number(src.marker.y)
                });
            }
        }
        if (!pts.length) throw new Error('No valid points to export.');
        return pts;
    }

    // Create JSON string for route export
    createRouteJson(points, timestamp, hash, length) {
        const exported = new Date(timestamp).toISOString();
        const pointsJson = points.map(p => JSON.stringify({ uid: p.uid, x: p.x, y: p.y })).join(',\n    ');
        return `{
  "exported": "${exported}",
  "count": ${points.length},
  "length": ${length || 0},
  "points": [
    ${pointsJson}
  ]
}`;
    }

    // Generate hash for route points (similar to marker hash)
    generateRouteHash(points) {
        try {
            // Use similar hashing logic as markers
            const dataStr = points.map(p => `${p.x.toFixed(10)},${p.y.toFixed(10)}`).join('|');
            let hash = 5381;
            for (let j = 0; j < dataStr.length; j++) {
                hash = ((hash << 5) + hash) + dataStr.charCodeAt(j);
                hash = hash & hash;
            }
            return Math.abs(hash).toString(16).padStart(8, '0').slice(-8);
        } catch (e) {
            return '';
        }
    }

    // Get route preview screen position
    getRoutePreviewScreenPosition(routePreview, viewState, mapSize) {
        return RouteMath.getRoutePreviewScreenPosition(routePreview, viewState, mapSize);
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

    /**
     * Clean up event listeners to prevent memory leaks.
     * Call this method when the RouteManager is being destroyed or recreated.
     */
    destroy() {
        try {
            // Unsubscribe all event listeners
            if (Array.isArray(this._eventUnsubscribers)) {
                for (const unsub of this._eventUnsubscribers) {
                    if (typeof unsub === 'function') {
                        unsub();
                    }
                }
                this._eventUnsubscribers = [];
            }
        } catch (e) {
            this.errorHandler && this.errorHandler.logDebug('RouteManager.destroy failed', 'RouteManager.destroy', { error: e });
        }
    }
}

// Make RouteManager globally available
window.RouteManager = RouteManager;
