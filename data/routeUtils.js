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
    }
};
