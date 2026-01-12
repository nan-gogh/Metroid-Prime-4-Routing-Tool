// Pure utility functions for marker operations
// No global dependencies - all parameters passed explicitly

const MarkerUtilsCore = {
    // Check if a marker with given UID exists in an array
    markerExists(uid, markerArray) {
        if (!Array.isArray(markerArray)) return false;
        return markerArray.some(m => m.uid === uid);
    },

    // Find marker by UID in an array, returns index or -1
    findMarkerIndex(uid, markerArray) {
        if (!Array.isArray(markerArray)) return -1;
        return markerArray.findIndex(m => m.uid === uid);
    },

    // Compute screen position of a marker: returns { x, y } in CSS pixels
    // Pure helper for UI code to convert normalized marker coords to screen coords
    getMarkerScreenPosition(marker, viewState, mapSize) {
        if (!marker || !viewState || typeof mapSize !== 'number') return null;
        try {
            const x = Number(marker.x) * mapSize * viewState.zoom + viewState.panX;
            const y = Number(marker.y) * mapSize * viewState.zoom + viewState.panY;
            return { x: Number(x), y: Number(y) };
        } catch (e) { return null; }
    },

    // Determine whether a UID looks like the new position-hash format
    // Expected format: <prefix>_<8-hex-chars>, e.g. 'cm_4b4f2ee3'
    isHashedUID(uid) {
        if (!uid || typeof uid !== 'string') return false;
        return /^[A-Za-z]+_[0-9a-fA-F]{8}$/.test(uid);
    },

    // Heuristic: detect legacy marker UID (present but not hashed)
    // Returns true when UID exists but does not match the hashed pattern
    isLegacyMarkerUID(uid) {
        if (!uid || typeof uid !== 'string') return false;
        return !MarkerUtilsCore.isHashedUID(uid);
    },

    // Given an array of marker objects, determine whether the file is legacy.
    // A file is considered legacy when any marker has a non-hashed UID or missing UID.
    isLegacyMarkerFile(markersArray) {
        if (!Array.isArray(markersArray)) return false;
        for (let i = 0; i < markersArray.length; i++) {
            const m = markersArray[i];
            if (!m) return true;
            if (typeof m.uid === 'undefined' || m.uid === null) return true;
            if (MarkerUtilsCore.isLegacyMarkerUID(m.uid)) return true;
        }
        return false;
    },

    // Generate a hash of marker data for unique filenames
    hashMarkerData(markers) {
        const data = JSON.stringify(markers.map(m => ({ x: m.x, y: m.y })));
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16).substring(0, 8); // 8-char hex string
    },

    // Generate position-based UID using coordinate hash with layer prefix
    // Prefix defaults to 'm' but should be taken from layer definition
    generateUID(x, y, prefix = 'm') {
        // Hash coordinates to deterministic UID
        // Combine coordinates into a high-precision string for stable hash
        const coordStr = `${x.toFixed(10)},${y.toFixed(10)}`;
        // Simple but effective hash function (DJB2-like)
        let hash = 5381;
        for (let i = 0; i < coordStr.length; i++) {
            hash = ((hash << 5) + hash) + coordStr.charCodeAt(i);
            hash = hash & hash; // Convert to 32-bit integer
        }
        // Convert to 8-character hex, always positive
        const hex = Math.abs(hash).toString(16).padStart(8, '0').slice(-8);
        return `${prefix}_${hex}`;
    },

    // ---------- Marker sizing helpers (pure functions) ----------

    // computeBaseMarkerRadius(zoom, routeNodeSize) -> number
    computeBaseMarkerRadius(zoom, routeNodeSize) {
        try {
            const z = (typeof zoom === 'number') ? zoom : 1;
            const base = Math.max(2, Math.min(16, 10 * z));
            if (typeof routeNodeSize === 'number') return Math.max(base, routeNodeSize + 10 * z);
            return base;
        } catch (e) { return 8; }
    },

    // computeDetailScale(zoom) -> number
    computeDetailScale(zoom) {
        try {
            const z = (typeof zoom === 'number' && zoom > 0) ? zoom : 1;
            const min = 0.1;
            const exp = 0.7;
            const val = Math.pow(z, -exp);
            return Math.max(min, Math.min(1, val));
        } catch (e) { return 1; }
    },

    // computeMarkerScale(detailScale, markerShrinkFactor) -> number
    computeMarkerScale(detailScale, markerShrinkFactor) {
        try {
            const ds = (typeof detailScale === 'number') ? detailScale : 1;
            const mf = (typeof markerShrinkFactor === 'number') ? markerShrinkFactor : 0.6;
            return 1 - (1 - ds) * mf;
        } catch (e) { return 1; }
    },

    // computeHitRadius(base, detailScale, markerShrinkFactor, touchPadding) -> number
    computeHitRadius(base, detailScale, markerShrinkFactor, touchPadding) {
        try {
            const b = (typeof base === 'number') ? base : 8;
            const ds = (typeof detailScale === 'number') ? detailScale : 1;
            const mf = (typeof markerShrinkFactor === 'number') ? markerShrinkFactor : 0.6;
            const scaled = Math.max(1, b * (1 - (1 - ds) * mf));
            return scaled + (touchPadding || 0);
        } catch (e) { return (base || 8) + (touchPadding || 0); }
    },

    // computeMarkerRenderSize({ baseSize, detailScale, markerShrinkFactor, highlighted, highlightScale, highlightScaleMultiplier, isSelected }) -> number
    computeMarkerRenderSize(opts) {
        try {
            const baseSize = (typeof opts.baseSize === 'number') ? opts.baseSize : 8;
            const detailScale = (typeof opts.detailScale === 'number') ? opts.detailScale : 1;
            const markerShrinkFactor = (typeof opts.markerShrinkFactor === 'number') ? opts.markerShrinkFactor : 0.6;
            const markerScale = 1 - (1 - detailScale) * markerShrinkFactor;

            let highlightMult = 1;
            if (opts.highlighted) {
                const cfgScale = (typeof opts.highlightScale === 'number') ? opts.highlightScale : 2.0;
                highlightMult = cfgScale;
                try {
                    const gm = (typeof opts.highlightScaleMultiplier === 'number') ? opts.highlightScaleMultiplier : 1.0;
                    highlightMult = highlightMult * gm;
                    highlightMult = Math.max(highlightMult, 0.6);
                } catch (e) {}
            }

            const isSelected = !!opts.isSelected;
            const rawSize = isSelected ? baseSize * 1.3 * highlightMult : baseSize * highlightMult;
            const size = Math.max(1, rawSize * markerScale);
            return size;
        } catch (e) { return Math.max(1, opts.baseSize || 8); }
    },

    // Create export JSON for markers (pure function)
    createExportJson(markers, timestamp, dataHash) {
        const exported = new Date(timestamp).toISOString();
        const markersJson = markers.map(m =>
            `{"uid": "${m.uid}", "x": ${m.x}, "y": ${m.y}}`
        ).join(',\n    ');

        return `{
  "exported": "${exported}",
  "count": ${markers.length},
  "markers": [
    ${markersJson}
  ]
}`;
    },

    // Download JSON blob (UI concern - pure function that returns blob info)
    createDownloadBlob(json, timestamp, dataHash) {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const filename = `markers-${timestamp}-${dataHash}.json`;

        return { url, filename, blob };
    },

    // Validate marker data (pure function)
    validateMarker(marker) {
        if (!marker || typeof marker !== 'object') return false;
        if (typeof marker.x !== 'number' || typeof marker.y !== 'number') return false;
        if (isNaN(marker.x) || isNaN(marker.y)) return false;
        if (marker.x < 0 || marker.x > 1 || marker.y < 0 || marker.y > 1) return false;
        return true;
    },

    // Upgrade legacy markers (pure function)
    upgradeLegacyMarkers(markers, prefix = 'cm') {
        if (!Array.isArray(markers)) return [];

        const upgraded = [];
        for (const marker of markers) {
            if (MarkerUtilsCore.validateMarker(marker)) {
                const uid = MarkerUtilsCore.generateUID(marker.x, marker.y, prefix);
                upgraded.push({ uid, x: marker.x, y: marker.y });
            }
        }
        return upgraded;
    },

    // Generate unique UID with collision avoidance (pure function)
    generateUniqueUID(x, y, prefix, existingUIDs) {
        let uid = MarkerUtilsCore.generateUID(x, y, prefix);

        // Check for collision and append counter if needed
        if (Array.isArray(existingUIDs) && existingUIDs.includes(uid)) {
            let counter = 1;
            while (existingUIDs.includes(`${uid}_${counter}`)) {
                counter++;
            }
            uid = `${uid}_${counter}`;
        }

        return uid;
    }
};

// Make MarkerUtilsCore globally available
window.MarkerUtilsCore = MarkerUtilsCore;