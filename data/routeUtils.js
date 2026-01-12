// Route utility functions for export/import/storage

const RouteUtils = {
    // Export route points to JSON format
    // Helper: validate route data for export
    validateRouteForExport(map) {
        if (!map || !map.currentRoute || !Array.isArray(map._routeSources) || !map.currentRoute.length) {
            throw new Error('No route to export.');
        }
    },

    // Helper: extract route points from map data
    extractRoutePoints(map) {
        const pts = [];
        for (let i = 0; i < map.currentRoute.length; i++) {
            const idx = map.currentRoute[i];
            const src = map._routeSources && map._routeSources[idx];
            if (!src || !src.marker) continue;
            pts.push({
                uid: src.marker.uid || '',
                x: Number(src.marker.x),
                y: Number(src.marker.y)
            });
        }
        if (!pts.length) throw new Error('No valid points to export.');
        return pts;
    },

    // Helper: generate hash for route points
    generateRouteHash(points, MarkerUtils) {
        try {
            if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.hashMarkerData === 'function') {
                return MarkerUtils.hashMarkerData(points.map(p => ({ x: p.x, y: p.y })));
            }
        } catch (e) {}
        return '';
    },

    // Helper: create JSON string for route export
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
    },

    // Helper: download route file as blob
    downloadRouteFile(json, timestamp, hash) {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `route-${timestamp}${hash ? '-' + hash : ''}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    exportRoute(map, MarkerUtils) {
        try {
            RouteUtils.validateRouteForExport(map);
            const points = RouteUtils.extractRoutePoints(map);
            const timestamp = Date.now();
            const hash = RouteUtils.generateRouteHash(points, MarkerUtils);
            const json = RouteUtils.createRouteJson(points, timestamp, hash, map.currentRouteLengthNormalized);
            RouteUtils.downloadRouteFile(json, timestamp, hash);
            return true;
        } catch (err) {
            throw err;
        }
    },

    // Helper: extract hash portion from UID (ignore prefix)
    extractHashFromUID(uid) {
        if (!uid || typeof uid !== 'string') return null;
        const parts = uid.split('_');
        return parts.length > 1 ? parts[parts.length - 1] : null;
    },

    // Helper: generate just the coordinate hash (no prefix)
    getCoordinateHash(x, y) {
        const coordStr = `${x.toFixed(10)},${y.toFixed(10)}`;
        let hash = 5381;
        for (let j = 0; j < coordStr.length; j++) {
            hash = ((hash << 5) + hash) + coordStr.charCodeAt(j);
            hash = hash & hash;
        }
        const hex = Math.abs(hash).toString(16).padStart(8, '0').slice(-8);
        return hex;
    },

    // Compute a screen position for a route preview object or normalized coords
    getRoutePreviewScreenPosition(routePreview, map) {
        if (!routePreview || !map) return null;
        try {
            if (typeof routePreview.screenX === 'number' && typeof routePreview.screenY === 'number') {
                return { x: Number(routePreview.screenX), y: Number(routePreview.screenY) };
            }
            if (typeof routePreview.x === 'number' && typeof routePreview.y === 'number') {
                const x = routePreview.x * MAP_SIZE * map.zoom + map.panX;
                const y = routePreview.y * MAP_SIZE * map.zoom + map.panY;
                return { x: Number(x), y: Number(y) };
            }
            return null;
        } catch (e) { return null; }
    },


    // Helper: find layer key by matching coordinate hash (ignoring UID prefix)
    // Helper: check if a marker matches the target coordinates
    markerMatchesCoordinates(marker, targetHash) {
        const markerHash = RouteUtils.extractHashFromUID(marker.uid);
        return markerHash === targetHash;
    },

    // Helper: find layer key containing a specific marker
    findLayerKeyForMarker(layers, targetHash) {
        const entries = Object.entries(layers || {});
        for (let i = 0; i < entries.length; i++) {
            const [layerKey, layer] = entries[i];
            if (layer && Array.isArray(layer.markers)) {
                for (let m = 0; m < layer.markers.length; m++) {
                    if (RouteUtils.markerMatchesCoordinates(layer.markers[m], targetHash)) {
                        return layerKey;
                    }
                }
            }
        }
        return null;
    },

    findLayerKeyByCoordinateHash(x, y, LAYERS) {
        const targetHash = RouteUtils.getCoordinateHash(x, y);
        const layerKey = RouteUtils.findLayerKeyForMarker(LAYERS, targetHash);
        return layerKey || 'customMarkers'; // fallback
    },

    // Helper: extract prefix from UID (everything before the last underscore)
    extractPrefix(uid) {
        if (!uid || typeof uid !== 'string') return 'cm';
        const parts = uid.split('_');
        return parts.length > 1 ? parts[0] : 'cm';
    },

    // Helper: find layer key by matching UID prefix against layer.prefix field
    findLayerKeyByPrefix(uid, LAYERS) {
        const prefix = RouteUtils.extractPrefix(uid);
        try {
            const entries = Object.entries(LAYERS || {});
            for (let i = 0; i < entries.length; i++) {
                const layerKey = entries[i][0];
                const layer = entries[i][1];
                if (layer && layer.prefix === prefix) {
                    return layerKey;
                }
            }
        } catch (e) {}
        return 'customMarkers'; // fallback
    },

    // Helper: check if route contains legacy points (without uid)
    isLegacyRoute(routePoints) {
        return routePoints.some(p => typeof p.uid === 'undefined');
    },

    // Helper: generate UID for a single point
    generatePointUid(point, LAYERS) {
        if (typeof point.x !== 'number' || typeof point.y !== 'number') {
            return null;
        }
        const hash = RouteUtils.getCoordinateHash(point.x, point.y);
        const layerKey = RouteUtils.findLayerKeyByCoordinateHash(point.x, point.y, LAYERS);
        const layerPrefix = (LAYERS[layerKey]?.prefix) || 'cm';
        return `${layerPrefix}_${hash}`;
    },

    // Helper: upgrade a single point in place
    upgradeSinglePoint(point, LAYERS) {
        if (typeof point.uid === 'undefined') {
            point.uid = RouteUtils.generatePointUid(point, LAYERS);
            return point.uid !== null;
        }
        return false;
    },

    // Upgrade legacy route points in place
    upgradeLegacyRoute(routePoints, LAYERS) {
        if (!RouteUtils.isLegacyRoute(routePoints)) {
            return { upgraded: false, count: 0 };
        }

        let upgradedCount = 0;
        for (let i = 0; i < routePoints.length; i++) {
            if (RouteUtils.upgradeSinglePoint(routePoints[i], LAYERS)) {
                upgradedCount++;
            }
        }
        return { upgraded: true, count: upgradedCount };
    },



    // Clear route from localStorage
    clearRoute() {
        try {
            // Remove persisted route key unconditionally so Clear Route always clears saved data
            try { localStorage.removeItem(MP4Config.STORAGE_KEYS.ROUTE); } catch (e) {}
            // Also attempt to clear via helper if present
            try { if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') window._mp4Storage.saveSetting(MP4Config.STORAGE_KEYS.ROUTE, null); } catch (e) {}
        } catch (e) {}
        // log removed
    },

    // Clean up route references when a marker is deleted
    // Helper: filter out route sources that reference a deleted marker
    filterRouteSources(sources, deletedMarkerUid) {
        return sources.filter(src => src && src.marker && src.marker.uid !== deletedMarkerUid);
    },

    // Helper: create new indices for filtered sources
    reindexRouteSources(filteredSources) {
        return filteredSources.map((_, index) => index);
    },

    // Helper: update route if sources were changed
    updateRouteIfChanged(map, originalSources, newSources, newIndices) {
        if (newSources.length !== originalSources.length) {
            const lengthNormalized = RouteUtils.computeRouteLengthNormalized(newSources, map.constructor.MAP_SIZE || 8192);
            if (map.setRoute) {
                map.setRoute(newIndices, lengthNormalized, newSources);
            }
            console.debug(`Removed ${originalSources.length - newSources.length} waypoints referencing deleted marker`);
            return true;
        }
        return false;
    },

    cleanupRouteReferences(map, deletedMarkerUid) {
        try {
            if (!map || !Array.isArray(map.currentRoute) || !Array.isArray(map._routeSources)) return;
            if (!deletedMarkerUid) return;

            const newSources = RouteUtils.filterRouteSources(map._routeSources, deletedMarkerUid);
            const newIndices = RouteUtils.reindexRouteSources(newSources);
            RouteUtils.updateRouteIfChanged(map, map._routeSources, newSources, newIndices);
        } catch (e) {
            console.debug('RouteUtils.cleanupRouteReferences failed:', e);
        }
    },

    // Compute normalized (map width = 1) non-looping length for given sources array
    computeRouteLengthNormalized(sources, mapSize = 8192) {
        try {
            if (!Array.isArray(sources) || sources.length < 2) return 0;
            let lengthPx = 0;
            for (let i = 1; i < sources.length; i++) {
                const a = sources[i - 1].marker;
                const b = sources[i].marker;
                if (!a || !b) continue;
                const dx = (b.x - a.x) * mapSize;
                const dy = (b.y - a.y) * mapSize;
                lengthPx += Math.hypot(dx, dy);
            }
            return lengthPx / mapSize;
        } catch (e) { return 0; }
    },

    // Helper: check if pointer is over a route node
    isPointerOverRouteNode(routeData, screenX, screenY, zoom, panX, panY, mapSize, nodeSize) {
        const { currentRoute, routeSources } = routeData;
        if (!currentRoute || !Array.isArray(routeSources)) return false;

        const nodeRadius = (typeof nodeSize === 'number') ? (nodeSize + 4) : 8;
        for (let i = 0; i < currentRoute.length; i++) {
            const idxN = currentRoute[i];
            const srcN = routeSources && routeSources[idxN];
            if (!srcN || !srcN.marker) continue;
            const nx = srcN.marker.x * mapSize * zoom + panX;
            const ny = srcN.marker.y * mapSize * zoom + panY;
            if (Math.hypot(screenX - nx, screenY - ny) <= nodeRadius) {
                return true;
            }
        }
        return false;
    },

    // Helper: project point onto line segment and return distance
    projectPointOntoSegment(ax, ay, bx, by, px, py) {
        const vx = bx - ax, vy = by - ay;
        const wx = px - ax, wy = py - ay;
        const vlen2 = vx * vx + vy * vy;
        if (vlen2 <= 0) return null;

        const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vlen2));
        const projX = ax + vx * t;
        const projY = ay + vy * t;
        const dist = Math.hypot(px - projX, py - projY);
        return { dist, t, projX, projY };
    },

    // Helper: find the closest route segment within threshold
    findClosestRouteSegment(routeData, screenX, screenY, zoom, panX, panY, mapSize, threshold) {
        const { currentRoute, routeSources, routeLooping } = routeData;
        if (!currentRoute || !Array.isArray(routeSources) || currentRoute.length < 2) return null;

        let best = null;
        const len = currentRoute.length;
        // Only include closing segment for routes with 3+ waypoints
        const segCount = (routeLooping && len >= 3) ? len : (len - 1);

        for (let i = 0; i < segCount; i++) {
            const idxA = currentRoute[i];
            const idxB = currentRoute[(i + 1) % len];
            const srcA = routeSources && routeSources[idxA];
            const srcB = routeSources && routeSources[idxB];
            if (!srcA || !srcB || !srcA.marker || !srcB.marker) continue;

            const ax = srcA.marker.x * mapSize * zoom + panX;
            const ay = srcA.marker.y * mapSize * zoom + panY;
            const bx = srcB.marker.x * mapSize * zoom + panX;
            const by = srcB.marker.y * mapSize * zoom + panY;

            const projection = RouteUtils.projectPointOntoSegment(ax, ay, bx, by, screenX, screenY);
            if (!projection) continue;

            if (projection.dist <= threshold && (!best || projection.dist < best.dist)) {
                best = { index: i, dist: projection.dist, t: projection.t };
            }
        }
        return best;
    },

    // Find the route segment at the given screen coordinates
    findRouteSegmentAt(routeData, screenX, screenY, zoom, panX, panY, mapSize, nodeSize, threshold = 10) {
        try {
            // If the pointer is within any route node's hit radius, treat as node interaction
            if (RouteUtils.isPointerOverRouteNode(routeData, screenX, screenY, zoom, panX, panY, mapSize, nodeSize)) {
                return null;
            }

            return RouteUtils.findClosestRouteSegment(routeData, screenX, screenY, zoom, panX, panY, mapSize, threshold);
        } catch (e) {
            return null;
        }
    },

    // Calculate the visual size of route nodes based on zoom and styling
    getRouteNodeSize(routeLineWidth, zoom, detailScale = 1) {
        const baseLine = (typeof routeLineWidth === 'number') ? routeLineWidth : 3;
        // Computed size from stroke width and zoom. Reduce multiplier and
        // maximum so nodes (and consequently markers) remain a bit smaller
        // at high zoom levels.
        const computed = baseLine * zoom * 1.0;
        // Minimum size should scale with zoom but allow smaller values when
        // zoomed out.
        const minSize = Math.max(2, 3 * zoom);
        // Lower maximum to keep sizes more compact at high zoom
        const maxSize = 80;
        // Apply detail-scale so node dots shrink slightly as user zooms in
        const sized = computed * detailScale;
        return Math.max(minSize, Math.min(maxSize, sized));
    },

    // Validate route data integrity
    validateRouteData(route, sources, options = {}) {
        try {
            const {
                requireSources = true,
                requireMinLength = 0,
                checkIndices = false,
                allowEmpty = false
            } = options;

            // Check for empty or invalid route
            if (!allowEmpty && (!route || !Array.isArray(route) || route.length < requireMinLength)) {
                return { valid: false, reason: `Route is empty or invalid (min length: ${requireMinLength})` };
            }

            // Allow empty routes if explicitly permitted
            if (allowEmpty && (!route || !Array.isArray(route))) {
                return { valid: false, reason: 'Route must be an array' };
            }

            // Check route sources exist if required
            if (requireSources && (!sources || !Array.isArray(sources))) {
                return { valid: false, reason: 'Route sources are missing or invalid' };
            }

            // Validate route indices are within bounds if requested
            if (checkIndices && sources && Array.isArray(sources) && route && Array.isArray(route)) {
                const maxIndex = sources.length - 1;
                for (const idx of route) {
                    if (typeof idx !== 'number' || idx < 0 || idx > maxIndex) {
                        return { valid: false, reason: `Invalid route index ${idx}, max allowed: ${maxIndex}` };
                    }
                }
            }

            // Validate that sources have valid markers if sources exist
            if (sources && Array.isArray(sources) && route && Array.isArray(route)) {
                for (const idx of route) {
                    const src = sources[idx];
                    if (!src || !src.marker || typeof src.marker.x !== 'number' || typeof src.marker.y !== 'number') {
                        return { valid: false, reason: `Invalid source at index ${idx}` };
                    }
                }
            }

            return { valid: true };
        } catch (e) {
            return { valid: false, reason: `Validation error: ${e.message}` };
        }
    },

    // Quick validation for route existence and basic structure
    hasValidRoute(route, sources) {
        return RouteUtils.validateRouteData(route, sources, {
            requireSources: true,
            requireMinLength: 0,
            checkIndices: false,
            allowEmpty: true
        }).valid;
    },

    // Validate route for rendering (stricter checks)
    validateRouteForRendering(route, sources, layerVisibility) {
        // First check basic validity
        const basicCheck = RouteUtils.validateRouteData(route, sources, {
            requireSources: true,
            requireMinLength: 1,
            checkIndices: true,
            allowEmpty: false
        });

        if (!basicCheck.valid) return basicCheck;

        // Check route visibility
        if (!layerVisibility || !layerVisibility.route) {
            return { valid: false, reason: 'Route layer is not visible' };
        }

        return { valid: true };
    },

    // Calculate insertion position along a route segment
    calculateSegmentInsertionPosition(segmentIndex, t, orderedSources, routeLooping = false) {
        try {
            if (!Array.isArray(orderedSources) || segmentIndex < 0) {
                return null;
            }

            const maxSegmentIndex = routeLooping ? orderedSources.length - 1 : orderedSources.length - 2;
            if (segmentIndex > maxSegmentIndex) {
                return null;
            }

            const segStart = orderedSources[segmentIndex];
            const segEnd = (segmentIndex < orderedSources.length - 1) ? 
                          orderedSources[segmentIndex + 1] : 
                          (routeLooping ? orderedSources[0] : null);

            if (!segStart || !segEnd || !segStart.marker || !segEnd.marker) {
                return null;
            }

            const insertionT = (typeof t === 'number') ? Math.max(0, Math.min(1, t)) : 0.5;
            const worldX = segStart.marker.x + (segEnd.marker.x - segStart.marker.x) * insertionT;
            const worldY = segStart.marker.y + (segEnd.marker.y - segStart.marker.y) * insertionT;

            return {
                x: Number(worldX),
                y: Number(worldY),
                segmentIndex,
                t: insertionT
            };
        } catch (e) {
            return null;
        }
    },

    // Create ordered sources array from route indices and sources
    createOrderedSources(routeIndices, routeSources) {
        try {
            if (!Array.isArray(routeIndices) || !Array.isArray(routeSources)) {
                return [];
            }

            const ordered = [];
            for (let ri = 0; ri < routeIndices.length; ri++) {
                const srcIdx = routeIndices[ri];
                const src = routeSources[srcIdx];
                if (!src) continue;
                ordered.push({
                    marker: src.marker,
                    layerKey: src.layerKey,
                    layerIndex: ordered.length
                });
            }
            return ordered;
        } catch (e) {
            return [];
        }
    },

    // Insert a waypoint into an ordered sources array
    insertWaypointIntoOrderedSources(orderedSources, insertPosition, marker, layerKey = 'temp') {
        try {
            if (!Array.isArray(orderedSources) || !insertPosition || typeof insertPosition.segmentIndex !== 'number') {
                return orderedSources;
            }

            const routePos = insertPosition.segmentIndex + 1;
            const tempSource = {
                marker: marker || { uid: '', x: insertPosition.x, y: insertPosition.y },
                layerKey: layerKey,
                layerIndex: -1
            };

            // Insert at the calculated position
            const newOrdered = [...orderedSources];
            newOrdered.splice(routePos, 0, tempSource);

            // Update layer indices
            for (let i = 0; i < newOrdered.length; i++) {
                newOrdered[i].layerIndex = i;
            }

            return newOrdered;
        } catch (e) {
            return orderedSources;
        }
    },

    // Find the route position of a marker in the current route
    findRoutePositionOfMarker(markerUid, routeIndices, routeSources) {
        try {
            if (!markerUid || !Array.isArray(routeIndices) || !Array.isArray(routeSources)) {
                return -1;
            }

            for (let i = 0; i < routeIndices.length; i++) {
                const srcIdx = routeIndices[i];
                const src = routeSources[srcIdx];
                if (src && src.marker && src.marker.uid === markerUid) {
                    return i;
                }
            }
            return -1;
        } catch (e) {
            return -1;
        }
    },

    // Convert internal route format to storage format
    convertRouteToStorageFormat(routeIndices, routeSources) {
        try {
            if (!Array.isArray(routeIndices) || !Array.isArray(routeSources) || !routeIndices.length) {
                return null;
            }

            const points = [];
            for (let i = 0; i < routeIndices.length; i++) {
                const idx = routeIndices[i];
                const src = routeSources && routeSources[idx];
                if (!src || !src.marker) {
                    return null; // abort if marker is missing
                }
                // Store uid and x, y only (layer field derived from UID prefix on load)
                points.push({
                    uid: src.marker.uid || '',
                    x: Number(src.marker.x),
                    y: Number(src.marker.y)
                });
            }
            return { points };
        } catch (e) {
            return null;
        }
    },

    // Convert storage format to internal route format
    convertStorageToRouteFormat(storagePoints, LAYERS) {
        try {
            if (!Array.isArray(storagePoints)) {
                return null;
            }

            const sources = [];
            for (let i = 0; i < storagePoints.length; i++) {
                const p = storagePoints[i];
                if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
                    return null; // invalid point
                }
                // Reconstruct sources with uid and layer info
                // Extract layer by matching UID prefix
                const layerKey = RouteUtils.findLayerKeyByPrefix(p.uid, LAYERS) || 'unknown';
                sources.push({
                    marker: {
                        uid: p.uid || '',
                        x: p.x,
                        y: p.y
                    },
                    layerKey: layerKey,
                    layerIndex: i
                });
            }

            const routeIndices = sources.map((_, i) => i);
            return { sources, indices: routeIndices };
        } catch (e) {
            return null;
        }
    },

    // Canonicalize route markers to reference actual markers in LAYERS
    canonicalizeRouteMarkers(sources, LAYERS) {
        try {
            if (!Array.isArray(sources) || !LAYERS) return;

            for (let si = 0; si < sources.length; si++) {
                const s = sources[si];
                if (!s || !s.marker) continue;

                const uid = s.marker.uid;
                const layer = s.layerKey;

                if (!uid) continue;

                // Try to find the marker in the specified layer first
                if (layer && LAYERS[layer] && Array.isArray(LAYERS[layer].markers)) {
                    const found = LAYERS[layer].markers.find(m => m.uid === uid);
                    if (found) {
                        s.marker = found;
                        continue;
                    }
                }

                // Fallback: search in customMarkers
                if (LAYERS.customMarkers && Array.isArray(LAYERS.customMarkers.markers)) {
                    const found2 = LAYERS.customMarkers.markers.find(m => m.uid === uid);
                    if (found2) s.marker = found2;
                }
            }
        } catch (e) {
            // Silently fail - canonicalization is not critical
        }
    },

    // Extract custom markers from route points
    extractCustomMarkersFromRoute(routePoints) {
        try {
            if (!Array.isArray(routePoints)) return [];

            return routePoints
                .filter(p => p && p.uid && p.uid.startsWith('cm_'))
                .map(p => ({
                    uid: p.uid,
                    x: Number(p.x),
                    y: Number(p.y)
                }));
        } catch (e) {
            return [];
        }
    },

    // Find layer key by matching UID prefix
    findLayerKeyByPrefix(uid, LAYERS) {
        try {
            if (!uid || !LAYERS) return 'unknown';

            // Extract prefix from uid (everything before first underscore)
            const prefix = uid.split('_')[0];
            if (!prefix) return 'unknown';

            // Check if any layer key starts with this prefix
            for (const layerKey in LAYERS) {
                if (layerKey.startsWith(prefix)) {
                    return layerKey;
                }
            }

            return 'unknown';
        } catch (e) {
            return 'unknown';
        }
    },

    // Save route to storage with fallback hierarchy
    saveRoute(payload) {
        try {
            console.log('RouteUtils.saveRoute called with payload:', payload);
            if (!payload) {
                console.log('No payload to save');
                return false;
            }

            // Try StorageUtils first (if available) - this handles consent properly
            if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.saveSetting === 'function') {
                const result = StorageUtils.saveSetting(MP4Config.STORAGE_KEYS.ROUTE, payload);
                console.log('StorageUtils.saveSetting result:', result);
                if (result) return true;
                // If StorageUtils failed, don't try fallbacks - respect consent
                return false;
            }

            // Fallback to _mp4Storage - this also handles consent properly
            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                const result = window._mp4Storage.saveSetting(MP4Config.STORAGE_KEYS.ROUTE, payload);
                console.log('_mp4Storage.saveSetting result:', result);
                if (result) return true;
                // If _mp4Storage failed, don't try direct localStorage - respect consent
                return false;
            }

            // No consent-gated storage available - do not save
            console.log('No consent-gated storage available');
            return false;
        } catch (e) {
            NotificationUtils.showSaveError('Route save failed: ' + e.message);
            return false;
        }
    },

    // Load route from storage with fallback hierarchy
    loadRoute() {
        try {
            console.log('RouteUtils.loadRoute called');

            // Try StorageUtils first (if available) - this handles consent properly
            if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.loadSetting === 'function') {
                const result = StorageUtils.loadSetting(MP4Config.STORAGE_KEYS.ROUTE);
                console.log('StorageUtils.loadSetting result:', result);
                return result;
            }

            // Fallback to _mp4Storage - this also handles consent properly
            if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                const result = window._mp4Storage.loadSetting(MP4Config.STORAGE_KEYS.ROUTE);
                console.log('_mp4Storage.loadSetting result:', result);
                return result;
            }

            // No direct localStorage fallback - respect consent like other data
            console.log('No consent-gated storage available, returning null');
            return null;
        } catch (e) {
            NotificationUtils.showLoadError('Failed to load route from storage: ' + e.message);
            return null;
        }
    },

    // Save route looping flag to storage
    saveRouteLoopingFlag(flag) {
        try {
            // Save 'enabled' when true, null when false to avoid default value conflicts
            const value = flag ? 'enabled' : null;

            // Try StorageUtils first (if available) - this handles consent properly
            if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.saveSetting === 'function') {
                const result = StorageUtils.saveSetting(MP4Config.STORAGE_KEYS.ROUTE_LOOPING_FLAG, value);
                if (result !== false) return true; // StorageUtils returns true on success, false on failure
                // If StorageUtils failed, don't try fallbacks - respect consent
                return false;
            }

            // Fallback to _mp4Storage - this also handles consent properly
            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                const result = window._mp4Storage.saveSetting(MP4Config.STORAGE_KEYS.ROUTE_LOOPING_FLAG, value);
                if (result !== false) return true;
                // If _mp4Storage failed, don't try direct localStorage - respect consent
                return false;
            }

            // No consent-gated storage available - do not save
            return false;
        } catch (e) {
            return false;
        }
    },

    // Load route looping flag from storage
    loadRouteLoopingFlag() {
        try {
            // Try StorageUtils first (if available) - this handles consent properly
            if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.loadSetting === 'function') {
                const result = StorageUtils.loadSetting(MP4Config.STORAGE_KEYS.ROUTE_LOOPING_FLAG);
                if (result !== null) return result;
            }

            // Fallback to _mp4Storage - this also handles consent properly
            if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                const result = window._mp4Storage.loadSetting(MP4Config.STORAGE_KEYS.ROUTE_LOOPING_FLAG);
                if (result !== null) return result;
            }

            // No consent-gated storage available - return null
            return null;
        } catch (e) {
            return null;
        }
    },

    // Save route to storage for a given map instance
    saveRouteToStorage(map) {
        try {
            console.log('RouteUtils.saveRouteToStorage called');
            if (!map.currentRoute || !Array.isArray(map._routeSources) || !map.currentRoute.length) {
                console.log('No route to save');
                return;
            }

            const payload = RouteUtils.convertRouteToStorageFormat(map.currentRoute, map._routeSources);
            console.log('Converted payload:', payload);
            if (!payload) {
                console.log('convertRouteToStorageFormat returned null');
                return; // conversion failed
            }

            payload.length = map.currentRouteLengthNormalized;
            console.log('Final payload to save:', payload);

            const saveResult = RouteUtils.saveRoute(payload);
            console.log('saveRoute result:', saveResult);
        } catch (e) {
            NotificationUtils.showSaveError('Route save to storage failed: ' + e.message);
        }
    },

    // Load route from storage and apply it to a given map instance
    loadRouteFromStorage(map, LAYERS, MarkerUtils) {
        try {
            console.log('RouteUtils.loadRouteFromStorage called');
            
            // Check for active drag operations and cancel them before loading
            if (map && map.pointerHandler && 
                (map._routeInsert || map._routeNodeCandidate || map._draggingMarker)) {
                map.pointerHandler._cancelRouteDragOperations('Route loading from storage');
            }
            
            const obj = RouteUtils.loadRoute();
            console.log('Loaded route data:', obj);
            if (!obj) {
                console.log('No route data to load');
                return false;
            }

            // Upgrade legacy route points if needed
            if (typeof RouteUtils !== 'undefined' && typeof RouteUtils.upgradeLegacyRoute === 'function') {
                const upgrade = RouteUtils.upgradeLegacyRoute(obj.points, LAYERS);
                if (upgrade.upgraded) {
                    NotificationUtils.showUpgradeNotification(`Upgraded route: ${upgrade.count} points regenerated. UIDs and layers matched by coordinate hash.`);
                    // log removed
                    // Save the upgraded route back to localStorage
                    RouteUtils.saveRoute(obj);
                }
            }

            // Convert storage format to internal route format
            const routeData = RouteUtils.convertStorageToRouteFormat(obj.points, LAYERS);
            if (!routeData) {
                NotificationUtils.showLoadError('Failed to convert saved route from storage format');
                return false;
            }

            const { sources, indices: routeIndices } = routeData;

            // Extract custom markers from saved route (those with 'cm' prefix)
            const customMarkersFromRoute = RouteUtils.extractCustomMarkersFromRoute(obj.points);

            // Merge custom markers if present
            if (customMarkersFromRoute.length > 0) {
                try {
                    if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.mergeCustomMarkers === 'function') {
                        MarkerUtils.mergeCustomMarkers(customMarkersFromRoute);
                    }
                } catch (e) {
                    NotificationUtils.showLoadError('Failed to merge custom markers from saved route: ' + e.message);
                }
            }

            const length = typeof obj.length === 'number' ? obj.length : 0;

            // Canonicalize source marker objects to reference the markers stored
            // in `LAYERS` (especially `customMarkers`) so moving markers after
            // reload keeps associated waypoints in sync.
            RouteUtils.canonicalizeRouteMarkers(sources, LAYERS);

            map.setRoute(routeIndices, length, sources);
            // log removed
            return true;
        } catch (e) {
            NotificationUtils.showLoadError('Failed to load saved route: ' + e.message);
            return false;
        }
    },

    // ===== ROUTE IMPORT EXTRACTIONS =====

    // Validate route import data structure
    validateRouteImportData(data) {
        try {
            if (!data || typeof data !== 'object') {
                return { valid: false, error: 'Invalid data format' };
            }
            
            if (!Array.isArray(data.points) || data.points.length === 0) {
                return { valid: false, error: 'Missing or empty points array' };
            }
            
            // Validate each point has required coordinates
            for (let i = 0; i < data.points.length; i++) {
                const point = data.points[i];
                if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
                    return { valid: false, error: `Invalid point at index ${i}: missing or invalid coordinates` };
                }
                // Basic bounds checking (normalized coordinates should be 0-1)
                if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
                    return { valid: false, error: `Point at index ${i} has coordinates outside valid range (0-1)` };
                }
            }
            
            return { valid: true };
        } catch (e) {
            return { valid: false, error: `Validation failed: ${e.message}` };
        }
    },

    // Validate custom marker capacity before import
    validateCustomMarkerCapacity(currentMarkers, newMarkers, maxMarkers = 50) {
        try {
            if (!Array.isArray(currentMarkers)) currentMarkers = [];
            if (!Array.isArray(newMarkers)) newMarkers = [];
            
            // Count only NEW markers (those without matching UIDs)
            const newMarkersCount = newMarkers.filter(imported => {
                return !currentMarkers.some(current => current.uid === imported.uid);
            }).length;
            
            const totalAfterImport = currentMarkers.length + newMarkersCount;
            
            if (totalAfterImport > maxMarkers) {
                const needToDelete = totalAfterImport - maxMarkers;
                return {
                    valid: false,
                    error: `Cannot import custom markers`,
                    details: {
                        currentCount: currentMarkers.length,
                        newCount: newMarkersCount,
                        totalAfterImport,
                        maxMarkers,
                        needToDelete
                    }
                };
            }
            
            return {
                valid: true,
                details: {
                    currentCount: currentMarkers.length,
                    newCount: newMarkersCount,
                    totalAfterImport
                }
            };
        } catch (e) {
            return { valid: false, error: `Capacity validation failed: ${e.message}` };
        }
    },

    // Process imported custom markers with legacy UID handling
    processImportedCustomMarkers(routePoints, MarkerUtils) {
        try {
            if (!Array.isArray(routePoints)) {
                return { markers: [], legacyDetected: false, regeneratedCount: 0 };
            }
            
            // Extract custom markers from the route points (those with 'cm' prefix)
            let customMarkersFromRoute = routePoints
                .filter(p => p.uid && p.uid.startsWith('cm_'))
                .map(p => ({ uid: p.uid, x: Number(p.x), y: Number(p.y) }));
            
            if (customMarkersFromRoute.length === 0) {
                return { markers: [], legacyDetected: false, regeneratedCount: 0 };
            }
            
            // Detect if route's custom markers use legacy incremental UIDs
            const routeMarkersAreLegacy = (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.isLegacyMarkerFile === 'function')
                ? MarkerUtils.isLegacyMarkerFile(customMarkersFromRoute)
                : customMarkersFromRoute.some(m => typeof m.uid === 'undefined' || !(/^[A-Za-z]+_[0-9a-fA-F]{8}$/.test(String(m.uid))));
            
            let regeneratedCount = 0;
            
            if (routeMarkersAreLegacy) {
                const regenerated = customMarkersFromRoute.map(m => ({
                    uid: (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.generateUID === 'function') 
                        ? MarkerUtils.generateUID(m.x, m.y, 'cm') 
                        : `cm_${Math.random().toString(16).slice(2,10)}`,
                    x: m.x,
                    y: m.y
                }));
                
                // Update UIDs in the original route points for customMarkers entries by matching coordinates
                for (let i = 0; i < routePoints.length; i++) {
                    const p = routePoints[i];
                    if (p && p.uid && p.uid.startsWith('cm_')) {
                        const match = regenerated.find(r => Math.abs(r.x - Number(p.x)) < 0.0000001 && Math.abs(r.y - Number(p.y)) < 0.0000001);
                        if (match && p.uid !== match.uid) {
                            p.uid = match.uid;
                            regeneratedCount++;
                        }
                    }
                }
                
                customMarkersFromRoute = regenerated;
            }
            
            return {
                markers: customMarkersFromRoute,
                legacyDetected: routeMarkersAreLegacy,
                regeneratedCount
            };
        } catch (e) {
            NotificationUtils.showLoadError('Failed to process imported custom markers: ' + e.message);
            return { markers: [], legacyDetected: false, regeneratedCount: 0, error: e.message };
        }
    },

    // Main route import orchestration function
    importRouteFromFile(fileContent, map, LAYERS, MarkerUtils, maxCustomMarkers = 50) {
        try {
            // Check for active drag operations and cancel them before importing
            if (map && map.pointerHandler && 
                (map._routeInsert || map._routeNodeCandidate || map._draggingMarker)) {
                map.pointerHandler._cancelRouteDragOperations('Route import');
            }
            
            // Parse JSON
            const obj = JSON.parse(fileContent);
            
            // Validate basic structure
            const validation = RouteUtils.validateRouteImportData(obj);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            
            // Upgrade legacy route points if needed
            if (typeof RouteUtils.upgradeLegacyRoute === 'function') {
                const upgrade = RouteUtils.upgradeLegacyRoute(obj.points, LAYERS);
                if (upgrade.upgraded) {
                    NotificationUtils.showUpgradeNotification(`Upgraded route: ${upgrade.count} points regenerated. UIDs and layers matched by coordinate hash.`);
                }
            }
            
            // Process custom markers
            const markerProcessing = RouteUtils.processImportedCustomMarkers(obj.points, MarkerUtils);
            const customMarkersFromRoute = markerProcessing.markers;
            
            if (markerProcessing.legacyDetected && markerProcessing.regeneratedCount > 0) {
                NotificationUtils.showUpgradeNotification(`Upgraded custom markers: ${markerProcessing.regeneratedCount} markers regenerated. UIDs and layers matched by coordinate hash.`);
            }
            
            // Validate capacity if custom markers exist
            if (customMarkersFromRoute.length > 0) {
                const currentMarkers = (LAYERS && LAYERS.customMarkers && Array.isArray(LAYERS.customMarkers.markers))
                    ? LAYERS.customMarkers.markers
                    : [];
                
                const capacityValidation = RouteUtils.validateCustomMarkerCapacity(currentMarkers, customMarkersFromRoute, maxCustomMarkers);
                if (!capacityValidation.valid) {
                    throw new Error(
                        `Cannot import route custom markers.\n\n` +
                        `You have ${capacityValidation.details.currentCount} markers, route would add ${capacityValidation.details.newCount} new ones.\n\n` +
                        `Total would be ${capacityValidation.details.totalAfterImport}, maximum is ${maxCustomMarkers}.\n\n` +
                        `Please delete at least ${capacityValidation.details.needToDelete} marker(s) first.`
                    );
                }
                
                // Merge markers: replace those with matching UIDs, add new ones
                const mergedMarkers = currentMarkers.slice();
                for (let i = 0; i < customMarkersFromRoute.length; i++) {
                    const importedMarker = customMarkersFromRoute[i];
                    const existingIdx = (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.findMarkerIndex === 'function')
                        ? MarkerUtils.findMarkerIndex(importedMarker.uid, mergedMarkers)
                        : mergedMarkers.findIndex(m => m.uid === importedMarker.uid);
                    
                    if (existingIdx >= 0) {
                        // Overwrite marker with same UID (hash)
                        mergedMarkers[existingIdx] = importedMarker;
                    } else {
                        // Add new marker
                        mergedMarkers.push(importedMarker);
                    }
                }
                
                // Apply the merged markers
                if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.mergeCustomMarkers === 'function') {
                    MarkerUtils.mergeCustomMarkers(mergedMarkers);
                } else {
                    if (LAYERS.customMarkers) {
                        LAYERS.customMarkers.markers = mergedMarkers;
                        if (map) {
                            map.customMarkers = LAYERS.customMarkers.markers;
                            if (typeof map.updateLayerCounts === 'function') map.updateLayerCounts();
                            if (typeof map.render === 'function') map.render();
                        }
                    }
                }
            }
            
            // Build sources from all points in the route
            const sources = [];
            for (let i = 0; i < obj.points.length; i++) {
                const p = obj.points[i];
                if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
                    NotificationUtils.showLoadError(`Route contains invalid point at index ${i}`);
                    continue;
                }
                
                const layerKey = (typeof RouteUtils.findLayerKeyByPrefix === 'function')
                    ? RouteUtils.findLayerKeyByPrefix(p.uid, LAYERS)
                    : 'unknown';
                
                sources.push({
                    marker: {
                        uid: p.uid || '',
                        x: Number(p.x),
                        y: Number(p.y)
                    },
                    layerKey: layerKey,
                    layerIndex: i
                });
            }
            
            const routeIndices = sources.map((_, i) => i);
            const length = typeof obj.length === 'number' ? obj.length : 0;
            
            // Canonicalize route markers
            if (typeof RouteUtils.canonicalizeRouteMarkers === 'function') {
                RouteUtils.canonicalizeRouteMarkers(sources, LAYERS);
            }
            
            // Set the route
            if (map && typeof map.setRoute === 'function') {
                map.setRoute(routeIndices, length, sources);
            }
            
            return { success: true, pointsImported: sources.length, markersProcessed: customMarkersFromRoute.length };
            
        } catch (e) {
            NotificationUtils.showImportError('Route import failed: ' + e.message);
            return { success: false, error: e.message };
        }
    }
};

// Make RouteUtils globally available
window.RouteUtils = RouteUtils;
