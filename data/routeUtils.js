// Route utility functions for export/import/storage

const RouteUtils = {
    // Export route points to JSON format
    exportRoute(map, MarkerUtils) {
        try {
            if (!map || !map.currentRoute || !Array.isArray(map._routeSources) || !map.currentRoute.length) {
                throw new Error('No route to export.');
            }
            const pts = [];
            for (let i = 0; i < map.currentRoute.length; i++) {
                const idx = map.currentRoute[i];
                const src = map._routeSources && map._routeSources[idx];
                if (!src || !src.marker) continue;
                // Capture uid, x, y (no layer field needed — prefix in UID determines layer)
                pts.push({
                    uid: src.marker.uid || '',
                    x: Number(src.marker.x),
                    y: Number(src.marker.y)
                });
            }
            if (!pts.length) throw new Error('No valid points to export.');

            const now = new Date();
            const timestamp = now.getTime();
            let hash = '';
            try {
                if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.hashMarkerData === 'function') {
                    // reuse hash function by mapping points to marker-like objects
                    hash = MarkerUtils.hashMarkerData(pts.map(p => ({ x: p.x, y: p.y })));
                }
            } catch (e) { hash = ''; }

            const exported = now.toISOString();
            const pointsJson = pts.map(p => JSON.stringify({ uid: p.uid, x: p.x, y: p.y })).join(',\n    ');
            const json = `{
  "exported": "${exported}",
  "count": ${pts.length},
  "length": ${map.currentRouteLengthNormalized || 0},
  "points": [
    ${pointsJson}
  ]
}`;
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `route-${timestamp}${hash ? '-' + hash : ''}.json`;
            a.click();
            URL.revokeObjectURL(url);
            // log removed
            return true;
        } catch (err) {
            // error logging removed
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
    findLayerKeyByCoordinateHash(x, y, LAYERS) {
        const targetHash = RouteUtils.getCoordinateHash(x, y);
        try {
            const entries = Object.entries(LAYERS || {});
            for (let i = 0; i < entries.length; i++) {
                const layerKey = entries[i][0];
                const layer = entries[i][1];
                if (layer && Array.isArray(layer.markers)) {
                    for (let m = 0; m < layer.markers.length; m++) {
                        const marker = layer.markers[m];
                        const markerHash = RouteUtils.extractHashFromUID(marker.uid);
                        if (markerHash === targetHash) {
                            return layerKey;
                        }
                    }
                }
            }
        } catch (e) {}
        return 'customMarkers'; // fallback
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

    // Upgrade legacy route points in place
    upgradeLegacyRoute(routePoints, LAYERS) {
        const isLegacy = routePoints.some(p => typeof p.uid === 'undefined');
        if (!isLegacy) return { upgraded: false, count: 0 };

        let upgradedCount = 0;
        for (let i = 0; i < routePoints.length; i++) {
            const p = routePoints[i];
            if (typeof p.uid === 'undefined') {
                if (typeof p.x === 'number' && typeof p.y === 'number') {
                    const hash = RouteUtils.getCoordinateHash(p.x, p.y);
                    const layerKey = RouteUtils.findLayerKeyByCoordinateHash(p.x, p.y, LAYERS);
                    const layerPrefix = (LAYERS[layerKey]?.prefix) || 'cm';
                    p.uid = `${layerPrefix}_${hash}`;
                    upgradedCount++;
                }
            }
        }
        return { upgraded: true, count: upgradedCount };
    },

    // Save route to localStorage
    saveRoute(routeData) {
        const payload = { points: routeData.points, length: routeData.length };
        if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
            window._mp4Storage.saveSetting('mp4_saved_route', payload);
        } else {
            try { localStorage.setItem('mp4_saved_route', JSON.stringify(payload)); } catch (e) {}
        }
        // log removed
    },

    // Load route from localStorage
    loadRoute() {
        try {
            let obj = null;
            if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                obj = window._mp4Storage.loadSetting('mp4_saved_route');
            } else {
                try {
                    const raw = localStorage.getItem('mp4_saved_route');
                    obj = raw ? JSON.parse(raw) : null;
                } catch (e) { obj = null; }
            }
            if (!obj) return null;
            if (!obj || !Array.isArray(obj.points) || obj.points.length === 0) return null;
            return obj;
        } catch (e) {
            console.warn('Failed to load route from localStorage:', e);
            return null;
        }
    },

    // Clear route from localStorage
    clearRoute() {
        try {
            // Remove persisted route key unconditionally so Clear Route always clears saved data
            try { localStorage.removeItem('mp4_saved_route'); } catch (e) {}
            // Also attempt to clear via helper if present
            try { if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') window._mp4Storage.saveSetting('mp4_saved_route', null); } catch (e) {}
        } catch (e) {}
        // log removed
    },

    // Clean up route references when a marker is deleted
    cleanupRouteReferences(map, deletedMarkerUid) {
        try {
            if (!map || !Array.isArray(map.currentRoute) || !Array.isArray(map._routeSources)) return;
            if (!deletedMarkerUid) return;

            // Find and remove any route sources that reference the deleted marker
            const newSources = [];
            const newIndices = [];

            for (let i = 0; i < map._routeSources.length; i++) {
                const src = map._routeSources[i];
                if (!src || !src.marker) continue;

                // Skip sources that reference the deleted marker
                if (src.marker.uid === deletedMarkerUid) {
                    continue; // Remove this waypoint from the route
                }

                // Keep sources that don't reference the deleted marker
                newSources.push(src);
                newIndices.push(newSources.length - 1);
            }

            // Only update the route if waypoints were actually removed
            if (newSources.length !== map._routeSources.length) {
                const lengthNormalized = RouteUtils.computeRouteLengthNormalized(newSources, map.constructor.MAP_SIZE || 8192);
                if (map.setRoute) {
                    map.setRoute(newIndices, lengthNormalized, newSources);
                }
                console.debug(`Removed ${map._routeSources.length - newSources.length} waypoints referencing deleted marker ${deletedMarkerUid}`);
            }
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

    // Find the route segment at the given screen coordinates
    findRouteSegmentAt(routeData, screenX, screenY, zoom, panX, panY, mapSize, nodeSize, threshold = 10) {
        try {
            const { currentRoute, routeSources, routeLooping } = routeData;
            if (!currentRoute || !Array.isArray(routeSources) || currentRoute.length < 2) return null;

            // If the pointer is within any route node's hit radius, treat as node interaction (do not select a segment)
            try {
                const nodeRadius = (typeof nodeSize === 'number') ? (nodeSize + 4) : 8;
                for (let i = 0; i < currentRoute.length; i++) {
                    const idxN = currentRoute[i];
                    const srcN = routeSources && routeSources[idxN];
                    if (!srcN || !srcN.marker) continue;
                    const nx = srcN.marker.x * mapSize * zoom + panX;
                    const ny = srcN.marker.y * mapSize * zoom + panY;
                    if (Math.hypot(screenX - nx, screenY - ny) <= nodeRadius) return null;
                }
            } catch (e) {}

            let best = null;
            const len = currentRoute.length;
            const segCount = routeLooping ? len : (len - 1);
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
                // Project point P onto segment AB
                const vx = bx - ax, vy = by - ay;
                const wx = screenX - ax, wy = screenY - ay;
                const vlen2 = vx * vx + vy * vy;
                if (vlen2 <= 0) continue;
                const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vlen2));
                const px = ax + vx * t;
                const py = ay + vy * t;
                const dist = Math.hypot(screenX - px, screenY - py);
                if (dist <= threshold) {
                    if (!best || dist < best.dist) best = { index: i, dist, t };
                }
            }
            return best;
        } catch (e) { return null; }
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
    calculateSegmentInsertionPosition(segmentIndex, t, orderedSources) {
        try {
            if (!Array.isArray(orderedSources) || segmentIndex < 0 || segmentIndex >= orderedSources.length - 1) {
                return null;
            }

            const segStart = orderedSources[segmentIndex];
            const segEnd = orderedSources[segmentIndex + 1];

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
            if (!payload) return false;

            // Try StorageUtils first (if available) - this handles consent properly
            if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.saveSetting === 'function') {
                const result = StorageUtils.saveSetting('mp4_saved_route', payload);
                if (result) return true;
                // If StorageUtils failed, don't try fallbacks - respect consent
                return false;
            }

            // Fallback to _mp4Storage - this also handles consent properly
            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                const result = window._mp4Storage.saveSetting('mp4_saved_route', payload);
                if (result) return true;
                // If _mp4Storage failed, don't try direct localStorage - respect consent
                return false;
            }

            // No consent-gated storage available - do not save
            return false;
        } catch (e) {
            return false;
        }
    },

    // Load route from storage with fallback hierarchy
    loadRoute() {
        try {
            // Try StorageUtils first (if available) - this handles consent properly
            if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.loadSetting === 'function') {
                return StorageUtils.loadSetting('mp4_saved_route');
            }

            // Fallback to _mp4Storage - this also handles consent properly
            if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                return window._mp4Storage.loadSetting('mp4_saved_route');
            }

            // No direct localStorage fallback - respect consent like other data
            return null;
        } catch (e) {
            return null;
        }
    },

    // Save route looping flag to storage
    saveRouteLoopingFlag(flag) {
        try {
            const value = flag ? '1' : '0';

            // Try StorageUtils first (if available) - this handles consent properly
            if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.saveSetting === 'function') {
                const result = StorageUtils.saveSetting('mp4_route_looping_flag', value);
                if (result) return true;
                // If StorageUtils failed, don't try fallbacks - respect consent
                return false;
            }

            // Fallback to _mp4Storage - this also handles consent properly
            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                const result = window._mp4Storage.saveSetting('mp4_route_looping_flag', value);
                if (result) return true;
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
                return StorageUtils.loadSetting('mp4_route_looping_flag');
            }

            // Fallback to _mp4Storage - this also handles consent properly
            if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                return window._mp4Storage.loadSetting('mp4_route_looping_flag');
            }

            // No direct localStorage fallback - respect consent like other data
            return null;
        } catch (e) {
            return null;
        }
    }
};

// Make RouteUtils globally available
window.RouteUtils = RouteUtils;
