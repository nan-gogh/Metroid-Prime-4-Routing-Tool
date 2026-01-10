// Marker utility functions for export/import

const MarkerUtils = {
    // Callback for when markers change - set by map during initialization
    _onMarkersChanged: null,
    
    // Callback for route cleanup when markers are deleted
    _onCleanupRouteReferences: null,
    
    // Set callback to be called when markers are modified
    setOnMarkersChanged(callback) {
        this._onMarkersChanged = callback;
    },
    
    // Set callback for route cleanup
    setOnCleanupRouteReferences(callback) {
        this._onCleanupRouteReferences = callback;
    },
    
    // Internal method to notify listeners of marker changes
    _notifyMarkersChanged() {
        if (this._onMarkersChanged) {
            try {
                this._onMarkersChanged();
            } catch (e) {
                console.debug('MarkerUtils._notifyMarkersChanged failed:', e);
            }
        }
    },
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
    getMarkerScreenPosition(marker, map) {
        if (!marker || !map) return null;
        try {
            const x = Number(marker.x) * MAP_SIZE * map.zoom + map.panX;
            const y = Number(marker.y) * MAP_SIZE * map.zoom + map.panY;
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
        if (markers.length === 0) {
            throw new Error('No custom markers to export.');
        }
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
                    // Update map runtime state via callback
                    MarkerUtils._notifyMarkersChanged();
                    
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
    
    // Add a new custom marker
    addCustomMarker(x, y) {
        const prefix = LAYERS.customMarkers?.prefix || 'cm';
        const uid = MarkerUtils.generateUID(x, y, prefix);
        const marker = { uid, x, y };
        LAYERS.customMarkers.markers.push(marker);
        MarkerUtils.saveToLocalStorage();
        // Update map runtime state via callback
        MarkerUtils._notifyMarkersChanged();

        return marker;
    },
    
    // Delete a custom marker by UID
    deleteCustomMarker(uid) {
        const index = LAYERS.customMarkers.markers.findIndex(m => m.uid === uid);
        if (index !== -1) {
            LAYERS.customMarkers.markers.splice(index, 1);
            MarkerUtils.saveToLocalStorage();
            
            // Clean up route references to this marker if a route exists
            if (this._onCleanupRouteReferences) {
                try {
                    this._onCleanupRouteReferences(uid);
                } catch (e) {
                    console.debug('Route cleanup callback failed:', e);
                }
            }
            
            // Update map runtime state via callback
            MarkerUtils._notifyMarkersChanged();
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
            if (this._onCleanupRouteReferences) {
                try {
                    this._onCleanupRouteReferences(uidsToRemove[i]);
                } catch (e) {
                    console.debug('Route cleanup callback failed:', e);
                }
            }
        }
        
        // Update map runtime state via callback
        MarkerUtils._notifyMarkersChanged();
    },
    
    // Save to localStorage
    saveToLocalStorage() {
        try {
            console.log('MarkerUtils.saveToLocalStorage called, markers:', LAYERS.customMarkers?.markers?.length || 0);

            // Try StorageUtils first (if available) - this handles consent properly
            if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.saveSetting === 'function') {
                console.log('Trying StorageUtils.saveSetting');
                const result = StorageUtils.saveSetting('mp4_customMarkers', LAYERS.customMarkers.markers);
                console.log('StorageUtils.saveSetting result:', result);
                if (result) return true;
                // If StorageUtils failed, don't try fallbacks - respect consent
                console.log('StorageUtils failed, not trying fallbacks');
                return false;
            } else {
                console.log('StorageUtils not available');
            }

            // Fallback to _mp4Storage - this also handles consent properly
            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                console.log('Trying _mp4Storage.saveSetting');
                const result = window._mp4Storage.saveSetting('mp4_customMarkers', LAYERS.customMarkers.markers);
                console.log('_mp4Storage.saveSetting result:', result);
                if (result) return true;
                // If _mp4Storage failed, don't try direct localStorage - respect consent
                console.log('_mp4Storage failed, not trying direct localStorage');
                return false;
            } else {
                console.log('_mp4Storage not available');
            }

            // No consent-gated storage available - do not save
            console.log('No consent-gated storage available, not saving');
            return false;
        } catch (e) {
            console.warn('Error in MarkerUtils.saveToLocalStorage:', e);
            return false;
        }
    },

    // Load custom markers from localStorage into LAYERS and update map/UI
    loadFromLocalStorage() {
        try {
            let data = null;

            // Try StorageUtils first (if available) - this handles consent properly
            if (typeof StorageUtils !== 'undefined' && typeof StorageUtils.loadSetting === 'function') {
                data = StorageUtils.loadSetting('mp4_customMarkers');
            }

            // Fallback to _mp4Storage - this also handles consent properly
            if (data === null && window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                data = window._mp4Storage.loadSetting('mp4_customMarkers');
            }

            // No direct localStorage fallback - respect consent like other data

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

    // Merge custom markers from a route into existing markers
    // Takes array of {uid, x, y} and adds any that don't already exist
    mergeCustomMarkers(markersArray) {
        try {
            if (!Array.isArray(markersArray)) return [];
            // Ensure custom markers layer exists
            if (!LAYERS.customMarkers) {
                LAYERS.customMarkers = { name: 'Custom Marker', icon: '📍', color: '#ff6b6b', prefix: 'cm', markers: [] };
            }

            // Add markers from the array that don't already exist
            let addedCount = 0;
            for (const marker of markersArray) {
                if (marker && marker.uid && !MarkerUtils.markerExists(marker.uid, LAYERS.customMarkers.markers)) {
                    LAYERS.customMarkers.markers.push({
                        uid: marker.uid,
                        x: Number(marker.x),
                        y: Number(marker.y)
                    });
                    addedCount++;
                }
            }

            // Only save and notify if we actually added markers
            if (addedCount > 0) {
                // Persist to localStorage
                MarkerUtils.saveToLocalStorage();
                // Update map via callback
                MarkerUtils._notifyMarkersChanged();
            }

            return LAYERS.customMarkers.markers;
        } catch (e) {
            // error logging removed
            return [];
        }
    },

    // Clean up route references when a marker is deleted
    // NOTE: This method is deprecated - route cleanup is now handled via callback
    cleanupRouteReferences(deletedMarkerUid) {
        // This method is no longer used - route cleanup is handled by the map via callback
        console.debug('cleanupRouteReferences is deprecated - using callback instead');
    }
};

// Make MarkerUtils globally available
window.MarkerUtils = MarkerUtils;
