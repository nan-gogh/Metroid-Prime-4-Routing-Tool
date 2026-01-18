// Pure route math utilities - no global dependencies or state
// These functions operate on data passed as parameters only

const RouteMath = {
    // Generate coordinate hash for route points
    getCoordinateHash: (x, y) => {
        const coordStr = `${x.toFixed(10)},${y.toFixed(10)}`;
        let hash = 5381;
        for (let j = 0; j < coordStr.length; j++) {
            hash = ((hash << 5) + hash) + coordStr.charCodeAt(j);
            hash = hash & hash;
        }
        const hex = Math.abs(hash).toString(16).padStart(8, '0').slice(-8);
        return hex;
    },

    // Extract hash portion from UID (ignore prefix)
    extractHashFromUID: (uid) => {
        if (!uid || typeof uid !== 'string') return null;
        const parts = uid.split('_');
        return parts.length > 1 ? parts[parts.length - 1] : null;
    },

    // Check if a marker matches target coordinates by hash
    markerMatchesCoordinates: (marker, targetHash) => {
        const markerHash = RouteMath.extractHashFromUID(marker.uid);
        return markerHash === targetHash;
    },

    // Find layer key by matching coordinate hash
    findLayerKeyByHash: (targetHash, layers) => {
        for (const [layerKey, layerData] of Object.entries(layers)) {
            if (layerData.markers && Array.isArray(layerData.markers)) {
                const found = layerData.markers.find(marker =>
                    RouteMath.markerMatchesCoordinates(marker, targetHash)
                );
                if (found) return layerKey;
            }
        }
        return null;
    },

    // Compute route length from route data
    computeRouteLength: (routeIndices, routeSources, mapSize) => {
        let length = 0;
        for (let i = 1; i < routeIndices.length; i++) {
            const prev = routeSources[routeIndices[i-1]];
            const curr = routeSources[routeIndices[i]];
            if (prev && curr && prev.marker && curr.marker) {
                const dx = (curr.marker.x - prev.marker.x) * mapSize;
                const dy = (curr.marker.y - prev.marker.y) * mapSize;
                length += Math.sqrt(dx*dx + dy*dy);
            }
        }
        return length;
    },

    // Helper: distance from point to line segment
    _pointToLineDistance: (px, py, x1, y1, x2, y2) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx*dx + dy*dy);

        if (length === 0) return Math.sqrt((px - x1)*(px - x1) + (py - y1)*(py - y1));

        const t = Math.max(0, Math.min(1, ((px - x1)*dx + (py - y1)*dy) / (length*length)));
        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;

        return Math.sqrt((px - closestX)*(px - closestX) + (py - closestY)*(py - closestY));
    },

    // Helper: get parameter t along line segment
    _getParameterT: (px, py, x1, y1, x2, y2) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx*dx + dy*dy);

        if (length === 0) return 0;

        return Math.max(0, Math.min(1, ((px - x1)*dx + (py - y1)*dy) / (length*length)));
    },

    // Get route node size based on zoom and scale
    getRouteNodeSize: (lineWidth, zoom, scale) => {
        const baseSize = lineWidth * 2;
        const zoomFactor = Math.max(0.5, Math.min(2, zoom));
        const scaledSize = baseSize * zoomFactor * scale;
        return Math.max(2, Math.min(80, scaledSize));
    },

    // Get route preview screen position
    getRoutePreviewScreenPosition: (routePreview, viewState, mapSize) => {
        if (!routePreview || !viewState) return null;
        try {
            if (typeof routePreview.screenX === 'number' && typeof routePreview.screenY === 'number') {
                return { x: routePreview.screenX, y: routePreview.screenY };
            }
            if (typeof routePreview.worldX === 'number' && typeof routePreview.worldY === 'number') {
                const screenX = routePreview.worldX * mapSize * viewState.zoom + viewState.panX;
                const screenY = routePreview.worldY * mapSize * viewState.zoom + viewState.panY;
                return { x: screenX, y: screenY };
            }
        } catch (e) {
            // Ignore errors
        }
        return null;
    },

    // Create ordered sources array from indices
    createOrderedSources: (indices, sources) => {
        return indices.map(idx => sources[idx]).filter(Boolean);
    },

    // Calculate insertion position along a route segment
    calculateSegmentInsertionPosition: (segmentIndex, t, orderedSources, routeLooping) => {
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
    },

    // Insert waypoint into ordered sources array
    insertWaypointIntoOrderedSources: (orderedSources, insertPosition, tempMarker, type) => {
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
};

// Register globally
if (typeof window !== 'undefined') {
    window.RouteMath = RouteMath;
}