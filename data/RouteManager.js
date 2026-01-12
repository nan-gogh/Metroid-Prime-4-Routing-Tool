// RouteManager class - decoupled route management
// Handles all route operations without global state dependencies

class RouteManager {
    constructor(markerManager, storage, notifications) {
        this.markerManager = markerManager;
        this.storage = storage;
        this.notifications = notifications;

        // Internal state
        this.currentRoute = [];
        this.routeSources = [];
        this.currentRouteLengthNormalized = 0;
        this.routeLooping = false;
        this.onRouteChanged = null;

        // Load persisted route on initialization
        this.loadFromStorage();
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
                console.debug('RouteManager._notifyRouteChanged failed:', e);
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
            console.warn('Failed to load route from storage:', e);
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
            console.warn('Failed to save route to storage:', e);
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

    // Get route data for export
    getRouteDataForExport() {
        const pts = [];
        for (let i = 0; i < this.currentRoute.length; i++) {
            const idx = this.currentRoute[i];
            const src = this.routeSources[idx];
            if (src && src.marker) {
                pts.push({
                    uid: src.marker.uid || '',
                    x: Number(src.marker.x),
                    y: Number(src.marker.y)
                });
            }
        }
        return pts;
    }

    // Compute route length
    computeRouteLength(mapSize) {
        let length = 0;
        for (let i = 1; i < this.currentRoute.length; i++) {
            const prev = this.routeSources[this.currentRoute[i-1]];
            const curr = this.routeSources[this.currentRoute[i]];
            if (prev && curr && prev.marker && curr.marker) {
                const dx = (curr.marker.x - prev.marker.x) * mapSize;
                const dy = (curr.marker.y - prev.marker.y) * mapSize;
                length += Math.sqrt(dx*dx + dy*dy);
            }
        }
        return length;
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
            const dist = this._pointToLineDistance(worldX, worldY, prev.marker.x, prev.marker.y, curr.marker.x, curr.marker.y);
            if (dist < closestDist && dist <= threshold / (mapSize * viewState.zoom)) {
                closestDist = dist;
                closestSegment = {
                    index: i - 1,
                    t: this._getParameterT(worldX, worldY, prev.marker.x, prev.marker.y, curr.marker.x, curr.marker.y)
                };
            }
        }

        return closestSegment;
    }

    // Helper: distance from point to line segment
    _pointToLineDistance(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx*dx + dy*dy);

        if (length === 0) return Math.sqrt((px - x1)*(px - x1) + (py - y1)*(py - y1));

        const t = Math.max(0, Math.min(1, ((px - x1)*dx + (py - y1)*dy) / (length*length)));
        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;

        return Math.sqrt((px - closestX)*(px - closestX) + (py - closestY)*(py - closestY));
    }

    // Helper: get parameter t along line segment
    _getParameterT(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx*dx + dy*dy);

        if (length === 0) return 0;

        return Math.max(0, Math.min(1, ((px - x1)*dx + (py - y1)*dy) / (length*length)));
    }

    // Get route node size for rendering
    getRouteNodeSize(lineWidth, zoom, scale = 1) {
        const baseSize = Math.max(2, Math.min(16, 10 * zoom * scale));
        return Math.max(baseSize, lineWidth * 2);
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
}

// Make RouteManager globally available
window.RouteManager = RouteManager;