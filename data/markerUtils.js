// Marker utility functions for export/import

const MarkerUtils = {
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
        return !MarkerUtils.isHashedUID(uid);
    },

    // Given an array of marker objects, determine whether the file is legacy.
    // A file is considered legacy when any marker has a non-hashed UID or missing UID.
    isLegacyMarkerFile(markersArray) {
        if (!Array.isArray(markersArray)) return false;
        for (let i = 0; i < markersArray.length; i++) {
            const m = markersArray[i];
            if (!m) return true;
            if (typeof m.uid === 'undefined' || m.uid === null) return true;
            if (MarkerUtils.isLegacyMarkerUID(m.uid)) return true;
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
    
    // Export custom markers to JSON
    exportCustomMarkers() {
        const markers = LAYERS.customMarkers.markers;
        const dataHash = MarkerUtils.hashMarkerData(markers);
        const now = new Date();
        const timestamp = now.getTime(); // milliseconds
        
        // Format markers each on a single line with spaces after colons/commas
        // to match the style used in static layer files (copy-paste friendly).
        const markersJson = markers.map(m =>
            `{"uid": "${m.uid}", "x": ${m.x}, "y": ${m.y}}`
        ).join(',\n    ');
        
        // Manually construct JSON for compact marker formatting
        const json = `{
  "exported": "${now.toISOString()}",
  "count": ${markers.length},
  "markers": [
    ${markersJson}
  ]
}`;
        
        // Trigger download
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `markers-${timestamp}-${dataHash}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        // log removed
    },
    
    // Import markers from JSON file
    importCustomMarkers(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    const imported = [];
                    
                    if (!Array.isArray(data.markers)) {
                        throw new Error('Invalid format: markers must be an array');
                    }
                    
                    // Check if imported data is legacy and upgrade if needed
                    let isLegacy = false;
                    try {
                        if (MarkerUtils.isLegacyMarkerFile(data.markers)) {
                            isLegacy = true;
                            // log removed
                        }
                    } catch (e) {
                        console.warn('Legacy detection during import failed:', e);
                    }
                    
                    // Validate and add markers
                    for (const marker of data.markers) {
                        if (typeof marker.x !== 'number' || typeof marker.y !== 'number') {
                            throw new Error('Invalid marker: x and y must be numbers');
                        }
                        
                        if (LAYERS.customMarkers.markers.length >= (map?.layerConfig?.customMarkers?.maxMarkers || 50)) {
                            break;
                        }
                        
                        // Always generate position-based UID with layer prefix
                        const prefix = LAYERS.customMarkers?.prefix || 'cm';
                        let uid = MarkerUtils.generateUID(marker.x, marker.y, prefix);
                        // Check for collision
                        if (LAYERS.customMarkers.markers.some(m => m.uid === uid)) {
                            // In extremely rare case of hash collision, append a counter
                            let counter = 1;
                            while (LAYERS.customMarkers.markers.some(m => m.uid === `${uid}_${counter}`)) {
                                counter++;
                            }
                            uid = `${uid}_${counter}`;
                        }
                        
                        const newMarker = { uid, x: marker.x, y: marker.y };
                        LAYERS.customMarkers.markers.push(newMarker);
                        imported.push(newMarker);
                    }
                    
                    // If legacy was detected, notify user with unified message
                    if (isLegacy && imported.length > 0) {
                        alert(`Upgraded custom markers: ${imported.length} markers regenerated. UIDs and layers matched by coordinate hash.`);
                    }
                    
                    // Persist to localStorage
                    MarkerUtils.saveToLocalStorage();
                    // Update map runtime state if available
                    try {
                        if (typeof map !== 'undefined' && map) {
                            map.customMarkers = LAYERS.customMarkers.markers;
                            if (typeof map.updateLayerCounts === 'function') map.updateLayerCounts();
                            map.render();
                        }
                    } catch (e) {}
                    
                    // log removed
                    resolve(imported);
                } catch (error) {
                    // error logging removed
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
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
    
    // Add a new custom marker
    addCustomMarker(x, y) {
        const maxMarkers = map?.layerConfig?.customMarkers?.maxMarkers || 50;
        if (LAYERS.customMarkers.markers.length >= maxMarkers) {
            return null;
        }
        
        const prefix = LAYERS.customMarkers?.prefix || 'cm';
        const uid = MarkerUtils.generateUID(x, y, prefix);
        const marker = { uid, x, y };
        LAYERS.customMarkers.markers.push(marker);
        MarkerUtils.saveToLocalStorage();
        // Update map runtime state and counts
        try {
            if (typeof map !== 'undefined' && map) {
                map.customMarkers = LAYERS.customMarkers.markers;
                if (typeof map.updateLayerCounts === 'function') map.updateLayerCounts();
                map.render();
            }
        } catch (e) {}

        return marker;
    },
    
    // Delete a custom marker by UID
    deleteCustomMarker(uid) {
        const index = LAYERS.customMarkers.markers.findIndex(m => m.uid === uid);
        if (index !== -1) {
            LAYERS.customMarkers.markers.splice(index, 1);
            MarkerUtils.saveToLocalStorage();
            
            // Clean up route references to this marker if a route exists
            MarkerUtils.cleanupRouteReferences(uid);
            
            // Update map runtime state and counts
            try {
                if (typeof map !== 'undefined' && map) {
                    map.customMarkers = LAYERS.customMarkers.markers;
                    if (typeof map.updateLayerCounts === 'function') map.updateLayerCounts();
                    map.render();
                    // If the deleted marker was selected, clear selection and hide tooltip
                    try {
                        if (map.selectedMarker && map.selectedMarker.uid === uid) {
                            map.selectedMarker = null;
                            map.selectedMarkerLayer = null;
                            try { map.hideTooltip(); } catch (e) {}
                        }
                    } catch (e) {}
                }
            } catch (e) {}
            return true;
        }
        return false;
    },
    
    // Delete all custom markers
    clearCustomMarkers() {
        const count = LAYERS.customMarkers.markers.length;
        const uidsToRemove = LAYERS.customMarkers.markers.map(m => m.uid);
        LAYERS.customMarkers.markers.length = 0;
        // Persist removal via consent-aware helper when available
        try {
            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                window._mp4Storage.saveSetting('mp4_customMarkers', []);
            }
        } catch (e) {}
        // Ensure persisted key is removed unconditionally so Clear Markers always clears saved data
        try { localStorage.removeItem('mp4_customMarkers'); } catch (e) {}
        
        // Clean up route references for all removed markers
        for (let i = 0; i < uidsToRemove.length; i++) {
            MarkerUtils.cleanupRouteReferences(uidsToRemove[i]);
        }
        
        // Update map runtime state and counts
        try {
            if (typeof map !== 'undefined' && map) {
                map.customMarkers = LAYERS.customMarkers.markers;
                if (typeof map.updateLayerCounts === 'function') map.updateLayerCounts();
                map.render();
                // Clear any selected marker and hide tooltip when all markers are removed
                try {
                    map.selectedMarker = null;
                    map.selectedMarkerLayer = null;
                    try { map.hideTooltip(); } catch (e) {}
                } catch (e) {}
            }
        } catch (e) {}
    },
    
    // Save to localStorage
    saveToLocalStorage() {
        try {
            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                window._mp4Storage.saveSetting('mp4_customMarkers', LAYERS.customMarkers.markers);
            } else {
                // Do not persist without consent/helper
            }
        } catch (e) {
            // error logging removed
        }
    }
    ,
    // Load custom markers from localStorage into LAYERS and update map/UI
    loadFromLocalStorage() {
        try {
            let data = null;
            if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                data = window._mp4Storage.loadSetting('mp4_customMarkers');
            } else {
                try {
                    const saved = localStorage.getItem('mp4_customMarkers');
                    data = saved ? JSON.parse(saved) : null;
                } catch (e) { data = null; }
            }
            if (!data) return [];
            if (!Array.isArray(data)) return [];

            // If the saved data appears to be legacy (legacy UIDs / missing uid),
            // upgrade the UIDs in place and notify the user.
            try {
                if (MarkerUtils.isLegacyMarkerFile(data)) {
                    // Regenerate hashed UIDs for all legacy markers
                    const prefix = 'cm';
                    const upgradedMarkers = [];
                    for (let i = 0; i < data.length; i++) {
                        const m = data[i];
                        if (typeof m.x === 'number' && typeof m.y === 'number') {
                            const newUid = MarkerUtils.generateUID(m.x, m.y, prefix);
                            upgradedMarkers.push({ uid: newUid, x: m.x, y: m.y });
                        }
                    }
                    // Replace data with upgraded markers
                    data.length = 0;
                    for (let i = 0; i < upgradedMarkers.length; i++) {
                        data.push(upgradedMarkers[i]);
                    }
                    // Notify user of upgrade with unified message
                    alert(`Upgraded custom markers: ${upgradedMarkers.length} markers regenerated. UIDs and layers matched by coordinate hash.`);
                    // log removed
                }
            } catch (e) {
                // If any error occurs during legacy detection/upgrade, log and continue
                console.warn('Legacy detection/upgrade failed for saved custom markers:', e);
            }

            // Replace markers array in LAYERS
            LAYERS.customMarkers = LAYERS.customMarkers || { name: 'Custom Marker', icon: '📍', color: '#ff6b6b', markers: [] };
            LAYERS.customMarkers.markers = data.slice();
            // Notify map if present
            try {
                if (typeof map !== 'undefined' && map) {
                    map.customMarkers = LAYERS.customMarkers.markers;
                    if (typeof map.updateLayerCounts === 'function') map.updateLayerCounts();
                    map.render();
                }
            } catch (e) {}
            return LAYERS.customMarkers.markers;
        } catch (e) {
            // error logging removed
            return [];
        }
    },

    // Merge (replace) custom markers with a new set
    // Takes array of {uid, x, y} and replaces entire LAYERS.customMarkers.markers
    mergeCustomMarkers(markersArray) {
        try {
            if (!Array.isArray(markersArray)) return [];
            // Replace entire custom markers array
            if (!LAYERS.customMarkers) {
                LAYERS.customMarkers = { name: 'Custom Marker', icon: '📍', color: '#ff6b6b', prefix: 'cm', markers: [] };
            }
            LAYERS.customMarkers.markers = markersArray.slice();
            // Persist to localStorage
            MarkerUtils.saveToLocalStorage();
            // Update map if present
            try {
                if (typeof map !== 'undefined' && map) {
                    map.customMarkers = LAYERS.customMarkers.markers;
                    if (typeof map.updateLayerCounts === 'function') map.updateLayerCounts();
                    map.render();
                }
            } catch (e) {}
            return LAYERS.customMarkers.markers;
        } catch (e) {
            // error logging removed
            return [];
        }
    },

    // Clean up route references when a marker is deleted
    // Removes any route point that references the given marker UID
    cleanupRouteReferences(deletedMarkerUid) {
        try {
            if (typeof map === 'undefined' || !map) return;
            
            // If no route exists, nothing to clean up
            if (!map.currentRoute || !Array.isArray(map.currentRoute)) return;
            if (!map._routeSources || !Array.isArray(map._routeSources)) return;
            
            // Find indices of route sources that reference the deleted marker
            const indicesToRemove = [];
            for (let i = 0; i < map._routeSources.length; i++) {
                const src = map._routeSources[i];
                if (src && src.marker && src.marker.uid === deletedMarkerUid) {
                    indicesToRemove.push(i);
                }
            }
            
            // Remove route points in reverse order to maintain indices
            for (let i = indicesToRemove.length - 1; i >= 0; i--) {
                const idx = indicesToRemove[i];
                // Remove from _routeSources
                map._routeSources.splice(idx, 1);
                // Remove from currentRoute (indices in currentRoute reference _routeSources)
                const routeIdx = map.currentRoute.indexOf(idx);
                if (routeIdx !== -1) {
                    map.currentRoute.splice(routeIdx, 1);
                }
                // Adjust remaining indices in currentRoute that were > idx
                for (let j = 0; j < map.currentRoute.length; j++) {
                    if (map.currentRoute[j] > idx) {
                        map.currentRoute[j]--;
                    }
                }
            }
            
            // Recalculate route length and update UI
            if (map.currentRoute.length > 0) {
                // Recalculate total route length from remaining points
                let totalLength = 0;
                for (let i = 0; i < map.currentRoute.length - 1; i++) {
                    const p1 = map._routeSources[map.currentRoute[i]].marker;
                    const p2 = map._routeSources[map.currentRoute[i + 1]].marker;
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    totalLength += Math.sqrt(dx * dx + dy * dy);
                }
                map.currentRouteLengthNormalized = totalLength;
                map.currentRouteLength = totalLength * 8192; // MAP_SIZE
                try { map.saveRouteToStorage(); } catch (e) {}
                map.render();
                // log removed
            } else {
                // No points left, clear the route entirely
                map.clearRoute();
                // log removed
            }
        } catch (e) {
            console.warn('Failed to cleanup route references:', e);
        }
    }
};
