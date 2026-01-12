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
            this.markers = this.storage.loadMarkers() || [];
        } catch (e) {
            console.warn('Failed to load markers from storage:', e);
            this.markers = [];
        }
    }

    // Save markers to storage
    saveToStorage() {
        try {
            this.storage.saveMarkers(this.markers);
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

    // Generate UID for marker
    generateUID(x, y) {
        const coordHash = this.getCoordinateHash(x, y);
        return `${this.config.layerPrefix}_${coordHash}`;
    }

    // Get coordinate hash (8-char hex)
    getCoordinateHash(x, y) {
        const coordStr = `${x.toFixed(10)},${y.toFixed(10)}`;
        let hash = 5381;
        for (let j = 0; j < coordStr.length; j++) {
            hash = ((hash << 5) + hash) + coordStr.charCodeAt(j);
            hash = hash & hash;
        }
        const hex = Math.abs(hash).toString(16).padStart(8, '0').slice(-8);
        return hex;
    }

    // Add a custom marker
    addMarker(x, y) {
        if (this.markers.length >= this.config.maxMarkers) {
            this.notifications.showError(`Maximum ${this.config.maxMarkers} custom markers allowed.`);
            return null;
        }

        const uid = this.generateUID(x, y);

        // Check for collision and handle it
        if (this.markerExists(uid)) {
            // Find unique UID
            let counter = 1;
            let uniqueUid = uid;
            while (this.markerExists(uniqueUid)) {
                uniqueUid = `${uid}_${counter}`;
                counter++;
            }
            uid = uniqueUid;
        }

        const marker = { uid, x: Number(x), y: Number(y) };
        this.markers.push(marker);

        this.saveToStorage();
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
        this._notifyChanged();

        return true;
    }

    // Get marker screen position (needs view state)
    getScreenPosition(marker, viewState, mapSize) {
        if (!marker || !viewState || !mapSize) return null;
        try {
            const x = Number(marker.x) * mapSize * viewState.zoom + viewState.panX;
            const y = Number(marker.y) * mapSize * viewState.zoom + viewState.panY;
            return { x: Number(x), y: Number(y) };
        } catch (e) {
            return null;
        }
    }

    // Clear all markers
    clearMarkers() {
        this.markers = [];
        this.saveToStorage();
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
}

// Make MarkerManager globally available
window.MarkerManager = MarkerManager;