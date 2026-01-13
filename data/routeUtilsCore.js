// Pure route utility functions - no global dependencies
// These functions operate on data passed as parameters only

const RouteUtilsCore = {
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
        const markerHash = RouteUtilsCore.extractHashFromUID(marker.uid);
        return markerHash === targetHash;
    },

    // Find layer key by matching coordinate hash
    findLayerKeyByHash: (targetHash, layers) => {
        for (const [layerKey, layerData] of Object.entries(layers)) {
            if (layerData.markers && Array.isArray(layerData.markers)) {
                const found = layerData.markers.find(marker =>
                    RouteUtilsCore.markerMatchesCoordinates(marker, targetHash)
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

    // Compute normalized route length (divided by mapSize for 0-1 range)
    computeRouteLengthNormalized: (sources, mapSize) => {
        if (!Array.isArray(sources)) return 0;
        const indices = sources.map((_, i) => i);
        return RouteUtilsCore.computeRouteLength(indices, sources, mapSize) / mapSize;
    },

    // Find route segment at screen position
    findRouteSegmentAt: (routeIndices, routeSources, screenX, screenY, viewState, mapSize, threshold = 10) => {
        // Convert screen to world coordinates
        const worldX = (screenX - viewState.panX) / (mapSize * viewState.zoom);
        const worldY = (screenY - viewState.panY) / (mapSize * viewState.zoom);

        // Find closest segment
        let closestDist = Infinity;
        let closestSegment = null;

        for (let i = 1; i < routeIndices.length; i++) {
            const prev = routeSources[routeIndices[i-1]];
            const curr = routeSources[routeIndices[i]];

            if (!prev || !curr || !prev.marker || !curr.marker) continue;

            // Check distance to line segment
            const dist = RouteUtilsCore._pointToLineDistance(worldX, worldY, prev.marker.x, prev.marker.y, curr.marker.x, curr.marker.y);
            if (dist < closestDist && dist <= threshold / (mapSize * viewState.zoom)) {
                closestDist = dist;
                closestSegment = {
                    index: i - 1,
                    t: RouteUtilsCore._getParameterT(worldX, worldY, prev.marker.x, prev.marker.y, curr.marker.x, curr.marker.y)
                };
            }
        }

        return closestSegment;
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

    // Create ordered sources array from indices
    createOrderedSources: (indices, sources) => {
        return indices.map(idx => sources[idx]).filter(Boolean);
    },

    // Generate hash for route points (similar to marker hash)
    generateRouteHash: (points) => {
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
    },

    // Validate route data for export
    validateRouteForExport: (routeIndices, routeSources) => {
        if (!Array.isArray(routeIndices) || routeIndices.length === 0) {
            throw new Error('No route to export.');
        }
        if (!Array.isArray(routeSources)) {
            throw new Error('Invalid route sources.');
        }
    },

    // Extract route points from route data
    extractRoutePoints: (routeIndices, routeSources) => {
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
    },

    // Create JSON string for route export
    createRouteJson: (points, timestamp, hash, length) => {
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
    },

    // Get route preview screen position
    getRoutePreviewScreenPosition: (routePreview, viewState, mapSize) => {
        if (!routePreview || !viewState) return null;
        try {
            if (typeof routePreview.screenX === 'number' && typeof routePreview.screenY === 'number') {
                return { x: Number(routePreview.screenX), y: Number(routePreview.screenY) };
            }
            if (typeof routePreview.x === 'number' && typeof routePreview.y === 'number') {
                const x = routePreview.x * mapSize * viewState.zoom + viewState.panX;
                const y = routePreview.y * mapSize * viewState.zoom + viewState.panY;
                return { x: Number(x), y: Number(y) };
            }
            return null;
        } catch (e) { return null; }
    },

    // Get route node size for rendering
    getRouteNodeSize: (lineWidth, zoom, scale = 1) => {
        const baseSize = Math.max(2, Math.min(16, 10 * zoom * scale));
        return Math.max(baseSize, lineWidth * 2);
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
    },

    // Find the position of a marker in the route
    findRoutePositionOfMarker: (markerUid, routeIndices, routeSources) => {
        if (!Array.isArray(routeIndices) || !Array.isArray(routeSources)) return -1;
        if (typeof markerUid !== 'string') return -1;

        for (let i = 0; i < routeIndices.length; i++) {
            const idx = routeIndices[i];
            const source = routeSources[idx];
            if (source && source.marker && source.marker.uid === markerUid) {
                return i;
            }
        }
        return -1;
    }
};

// Make RouteUtilsCore globally available
window.RouteUtilsCore = RouteUtilsCore;