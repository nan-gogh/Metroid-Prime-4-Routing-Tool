// MarkerManager class - decoupled marker management
// Handles all marker operations without global state dependencies

class MarkerManager {
    constructor(config, storage, notifications) {
        this.config = config || { maxMarkers: 50, layerPrefix: 'cm' };
        this.storage = storage;
        this.notifications = notifications;

        // Internal state
        this.markers = [];
        this.onChanged = null;
        this.onCleanupRouteReferences = null;

        // Load persisted markers on initialization
        this.loadFromStorage();
    }

    // Set callback for when markers change
    setOnChanged(callback) {
        this.onChanged = callback;
    }

    // Set callback for route cleanup when markers are deleted
    setOnCleanupRouteReferences(callback) {
        this.onCleanupRouteReferences = callback;
    }

    // Internal notification method
    _notifyChanged() {
        if (this.onChanged) {
            try {
                this.onChanged();
            } catch (e) {
                console.debug('MarkerManager._notifyChanged failed:', e);
            }
        }
    }

    // Load markers from storage
    loadFromStorage() {
        try {
            // Use consent-gated storage if available, fallback to interface
            let markers = [];
            if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                markers = window._mp4Storage.loadSetting('mp4_customMarkers') || [];
            } else if (this.storage && typeof this.storage.loadMarkers === 'function') {
                markers = this.storage.loadMarkers() || [];
            }
            
            this.markers = markers;
            // Synchronize with LAYERS for backward compatibility
            if (typeof LAYERS !== 'undefined' && LAYERS.customMarkers) {
                LAYERS.customMarkers.markers = this.markers;
            }
        } catch (e) {
            console.warn('Failed to load markers from storage:', e);
            this.markers = [];
            // Synchronize with LAYERS even on failure
            if (typeof LAYERS !== 'undefined' && LAYERS.customMarkers) {
                LAYERS.customMarkers.markers = this.markers;
            }
        }
    }

    // Save markers to storage
    saveToStorage() {
        try {
            // Use consent-gated storage if available, fallback to interface
            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                window._mp4Storage.saveSetting('mp4_customMarkers', this.markers);
            } else if (this.storage && typeof this.storage.saveMarkers === 'function') {
                this.storage.saveMarkers(this.markers);
            }
        } catch (e) {
            console.warn('Failed to save markers to storage:', e);
        }
    }

    // Check if marker exists by UID
    markerExists(uid) {
        return this.markers.some(m => m.uid === uid);
    }

    // Find marker index by UID
    findMarkerIndex(uid) {
        return this.markers.findIndex(m => m.uid === uid);
    }

    // Generate UID for marker (using MarkerUtilsCore)
    generateUID(x, y) {
        return MarkerUtilsCore.generateUID(x, y, this.config.layerPrefix);
    }

    // Get coordinate hash (using MarkerUtilsCore)
    getCoordinateHash(x, y) {
        return MarkerUtilsCore.getCoordinateHash(x, y);
    }

    // Add a custom marker
    addMarker(x, y) {
        if (this.markers.length >= this.config.maxMarkers) {
            this.notifications.showError(`Maximum ${this.config.maxMarkers} custom markers allowed.`);
            return null;
        }

        const uid = MarkerUtilsCore.generateUniqueUID(x, y, this.config.layerPrefix, this.markers.map(m => m.uid));

        const marker = { uid, x: Number(x), y: Number(y) };
        this.markers.push(marker);

        this.saveToStorage();
        // Synchronize with LAYERS for backward compatibility
        if (typeof LAYERS !== 'undefined' && LAYERS.customMarkers) {
            LAYERS.customMarkers.markers = this.markers;
        }
        this._notifyChanged();

        return marker;
    }

    // Remove a marker by UID
    removeMarker(uid) {
        const index = this.findMarkerIndex(uid);
        if (index === -1) return false;

        this.markers.splice(index, 1);

        // Notify route cleanup
        if (this.onCleanupRouteReferences) {
            try {
                this.onCleanupRouteReferences(uid);
            } catch (e) {
                console.debug('MarkerManager cleanup callback failed:', e);
            }
        }

        this.saveToStorage();
        // Synchronize with LAYERS for backward compatibility
        if (typeof LAYERS !== 'undefined' && LAYERS.customMarkers) {
            LAYERS.customMarkers.markers = this.markers;
        }
        this._notifyChanged();

        return true;
    }

    // Get marker screen position (needs view state)
    getScreenPosition(marker, viewState, mapSize) {
        return MarkerUtilsCore.getMarkerScreenPosition(marker, viewState, mapSize);
    }

    // Clear all markers
    clearMarkers() {
        this.markers = [];
        this.saveToStorage();
        // Synchronize with LAYERS for backward compatibility
        if (typeof LAYERS !== 'undefined' && LAYERS.customMarkers) {
            LAYERS.customMarkers.markers = this.markers;
        }
        this._notifyChanged();
    }

    // Get marker count
    getCount() {
        return this.markers.length;
    }

    // Check if at max capacity
    isAtMaxCapacity() {
        return this.markers.length >= this.config.maxMarkers;
    }

    // Get all markers
    getAllMarkers() {
        return [...this.markers]; // Return copy to prevent external modification
    }

    // Check if marker exists by UID (alias for markerExists)
    hasMarker(uid) {
        return this.markerExists(uid);
    }

    // Export markers to JSON
    exportMarkers() {
        if (this.markers.length === 0) {
            throw new Error('No custom markers to export.');
        }

        const dataHash = MarkerUtilsCore.hashMarkerData(this.markers);
        const now = new Date();
        const timestamp = now.getTime();

        // Create JSON using MarkerUtilsCore
        const json = MarkerUtilsCore.createExportJson(this.markers, timestamp, dataHash);

        // Create download blob
        const downloadInfo = MarkerUtilsCore.createDownloadBlob(json, timestamp, dataHash);

        // Trigger download (UI concern - could be moved to a separate UI handler)
        const a = document.createElement('a');
        a.href = downloadInfo.url;
        a.download = downloadInfo.filename;
        a.click();
        URL.revokeObjectURL(downloadInfo.url);

        // Save to storage and notify
        this.saveToStorage();
        this.notifications.showSuccess('Markers exported successfully');

        return true;
    }

    // Import markers from JSON file
    importMarkers(file) {
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
                    if (MarkerUtilsCore.isLegacyMarkerFile(data.markers)) {
                        isLegacy = true;
                        data.markers = MarkerUtilsCore.upgradeLegacyMarkers(data.markers, this.config.layerPrefix);
                    }

                    // Validate and add markers
                    for (const marker of data.markers) {
                        if (!MarkerUtilsCore.validateMarker(marker)) {
                            throw new Error('Invalid marker: x and y must be numbers');
                        }

                        if (this.markers.length >= this.config.maxMarkers) {
                            break;
                        }

                        // Generate unique UID
                        const uid = MarkerUtilsCore.generateUniqueUID(marker.x, marker.y, this.config.layerPrefix, this.markers.map(m => m.uid));

                        const newMarker = { uid, x: marker.x, y: marker.y };
                        this.markers.push(newMarker);
                        imported.push(newMarker);
                    }

                    // If legacy was detected, notify user
                    if (isLegacy && imported.length > 0) {
                        this.notifications.showUpgradeNotification(`Upgraded custom markers: ${imported.length} markers regenerated. UIDs and layers matched by coordinate hash.`);
                    }

                    // Persist to storage and notify
                    this.saveToStorage();
                    // Synchronize with LAYERS for backward compatibility
                    if (typeof LAYERS !== 'undefined' && LAYERS.customMarkers) {
                        LAYERS.customMarkers.markers = this.markers;
                    }
                    this._notifyChanged();

                    resolve(imported);
                } catch (error) {
                    this.notifications.showError('Error importing markers: ' + error.message);
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    // Merge markers from an array
    mergeMarkers(markersArray) {
        if (!Array.isArray(markersArray)) return [];

        let addedCount = 0;
        for (const marker of markersArray) {
            if (MarkerUtilsCore.validateMarker(marker) && !this.markerExists(marker.uid)) {
                this.markers.push({
                    uid: marker.uid,
                    x: Number(marker.x),
                    y: Number(marker.y)
                });
                addedCount++;
            }
        }

        // Only save and notify if we actually added markers
        if (addedCount > 0) {
            this.saveToStorage();
            // Synchronize with LAYERS for backward compatibility
            if (typeof LAYERS !== 'undefined' && LAYERS.customMarkers) {
                LAYERS.customMarkers.markers = this.markers;
            }
            this._notifyChanged();
        }

        return this.markers;
    }
}

// Make MarkerManager globally available
window.MarkerManager = MarkerManager;