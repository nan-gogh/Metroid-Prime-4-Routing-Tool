// MarkerManager class - decoupled marker management
// Handles all marker operations without global state dependencies

if (typeof globalThis.__MP4_NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.__MP4_NOOP_ERROR_HANDLER = { logDebug: function(){}, logWarning: function(){}, logError: function(){} };
}

class MarkerManager {
        constructor(config, storage, notifications, eventBus, options = {}) {
        this.config = config || { maxMarkers: 50, layerPrefix: 'cm' };
        this.storage = storage;
        this.notifications = notifications;
        this.eventBus = eventBus || null;
        
        // Error handling (constructor-injected)
        this.errorHandler = options.errorHandler || globalThis.__MP4_NOOP_ERROR_HANDLER;

        // Internal state
        this.markers = [];
        this.onCleanupRouteReferences = null;

        // Event listener cleanup
        this._eventUnsubscribers = [];

        // Set up event listeners for decoupled communication
        this._setupEventListeners();

        // Note: loadFromStorage() is called explicitly after consent is obtained
    }

    // Set callback for route cleanup when markers are deleted
    setOnCleanupRouteReferences(callback) {
        this.onCleanupRouteReferences = callback;
    }

    // Set up event listeners for decoupled communication
    _setupEventListeners() {
        if (this.eventBus && window.EventTypes) {
            try {
                const eventManager = (window.EventUtils && typeof window.EventUtils.createEventManager === 'function') ?
                    window.EventUtils.createEventManager(this) : null;

                if (eventManager) {
                    const h = this.errorHandler;
                    eventManager.setup(this.eventBus, [
                        {
                            event: window.EventTypes.MARKER_EDIT_REQUESTED,
                            handler: (data) => {
                                if (data && data.action === 'add' && typeof data.x === 'number' && typeof data.y === 'number') {
                                    this.addMarker(data.x, data.y);
                                } else if (data && data.action === 'remove' && data.uid) {
                                    this.removeMarker(data.uid);
                                }
                            }
                        },
                        {
                            event: window.EventTypes.MARKER_CLEAR_REQUESTED,
                            handler: () => {
                                try {
                                    this.clearMarkers();
                                } catch (e) {
                                    h.logWarning('MarkerManager clear handler failed', 'MarkerManager._setupEventListeners', { error: e });
                                }
                            }
                        }
                    ], this, this.errorHandler);
                } else {
                    // Fallback: subscribe directly and store unsubscriber
                    const unsubscribeEdit = this.eventBus.on(window.EventTypes.MARKER_EDIT_REQUESTED, (data) => {
                        try {
                            if (data && data.action === 'add' && typeof data.x === 'number' && typeof data.y === 'number') {
                                this.addMarker(data.x, data.y);
                            } else if (data && data.action === 'remove' && data.uid) {
                                this.removeMarker(data.uid);
                            }
                        } catch (e) {
                            this.errorHandler.logWarning('MarkerManager MARKER_EDIT_REQUESTED handler failed', 'MarkerManager._setupEventListeners', { error: e });
                        }
                    });

                    if (typeof unsubscribeEdit === 'function') this._eventUnsubscribers.push(unsubscribeEdit);

                    const unsubscribeClear = this.eventBus.on(window.EventTypes.MARKER_CLEAR_REQUESTED, () => {
                        try {
                            this.clearMarkers();
                        } catch (e) {
                            this.errorHandler.logWarning('MarkerManager MARKER_CLEAR_REQUESTED handler failed', 'MarkerManager._setupEventListeners', { error: e });
                        }
                    });

                    if (typeof unsubscribeClear === 'function') this._eventUnsubscribers.push(unsubscribeClear);
                }
            } catch (e) {
                this.errorHandler.logWarning('MarkerManager._setupEventListeners failed', 'MarkerManager._setupEventListeners', { error: e });
            }
        }
    }

    // Internal notification method
    _notifyChanged(eventType, eventData) {
        // Emit EventBus event if available
        if (this.eventBus && eventType) {
            try {
                this.eventBus.emit(eventType, eventData);
            } catch (e) {
                this.errorHandler.logWarning('MarkerManager EventBus emission failed', 'MarkerManager._notifyChanged.emit', { error: e, eventType });
            }
        }
    }

    // Load markers from storage (alias for loadFromStorage for API consistency)
    loadMarkers() {
        return this.loadFromStorage();
    }

    // Load markers from storage
    loadFromStorage() {
        try {
            // Respect consent: do not load or emit storage events when consent is not granted
            if (this.storage && typeof this.storage.hasConsent === 'function') {
                try {
                    if (!this.storage.hasConsent()) {
                        try { this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('MarkerManager.loadFromStorage: skipping load due to no consent', 'MarkerManager.loadFromStorage'); } catch (__) {}
                        return false;
                    }
                } catch (e) {
                    this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'MarkerManager.loadFromStorage.consentCheck');
                    return false;
                }
            }

            this.eventBus?.emit(window.EventTypes.STORAGE_LOAD_STARTED, { entity: 'markers' });
            const markers = (typeof this.storage.loadMarkers === 'function') ? this.storage.loadMarkers() : (this.storage.get ? this.storage.get((this.config?.STORAGE_KEYS?.CUSTOM_MARKERS) || 'mp4_customMarkers', []) : []);
            if (Array.isArray(markers)) {
                // Validate and filter markers
                this.markers = markers.filter(marker => MarkerUtilsCore.validateMarker(marker));
                this.eventBus?.emit(window.EventTypes.STORAGE_LOAD_COMPLETED, { entity: 'markers' });
                return true;
            }
            this.eventBus?.emit(window.EventTypes.STORAGE_LOAD_COMPLETED, { entity: 'markers' });
        } catch (e) {
            this.errorHandler.logWarning(e, 'MarkerManager.loadFromStorage.failed', {});
            this.eventBus?.emit(window.EventTypes.STORAGE_LOAD_FAILED, { entity: 'markers', error: e.message });
        }
        return false;
    }

    // Save markers to storage (unified pattern)
    saveToStorage() {
        try {
            // Debug: entry
            try { this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('MarkerManager.saveToStorage called', 'MarkerManager.saveToStorage', { markerCount: this.markers.length, hasStorage: !!this.storage }); } catch (__) {}

            // Check consent FIRST, before emitting any events
            if (this.storage && typeof this.storage.hasConsent === 'function') {
                const consent = this.storage.hasConsent();
                try { this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('MarkerManager.saveToStorage: consent check', 'MarkerManager.saveToStorage', { hasConsent: consent }); } catch (__) {}
                if (!consent) {
                    try { this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('MarkerManager.saveToStorage: aborting due to no consent', 'MarkerManager.saveToStorage', {}); } catch (__) {}
                    return; // No consent — silently return
                }
            }

            this.eventBus?.emit(window.EventTypes.STORAGE_SAVE_STARTED, { entity: 'markers' });

            // Get storage key from config
            const key = (this.config?.STORAGE_KEYS?.CUSTOM_MARKERS) || 'mp4_customMarkers';

            // Use StorageService adapter and respect its return value
            let saved = false;
            if (this.storage) {
                try {
                    if (typeof this.storage.set === 'function') {
                        saved = !!this.storage.set(key, this.markers);
                    } else if (typeof this.storage.saveMarkers === 'function') {
                        saved = !!this.storage.saveMarkers(this.markers);
                    }
                } catch (e) {
                    this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'MarkerManager.saveToStorage.storageCall', { key });
                    saved = false;
                }
            }

            try { this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('MarkerManager.saveToStorage result', 'MarkerManager.saveToStorage', { key, saved, markerCount: this.markers.length }); } catch (__) {}

            if (saved) {
                this.eventBus?.emit(window.EventTypes.STORAGE_SAVE_COMPLETED, {
                    entity: 'markers',
                    count: this.markers.length
                });
            } else {
                this.eventBus?.emit(window.EventTypes.STORAGE_SAVE_FAILED, {
                    entity: 'markers',
                    error: 'storage.save returned false or consent denied'
                });
            }
        } catch (e) {
            this.errorHandler.logError(e, 'MarkerManager.saveToStorage');
            this.eventBus?.emit(window.EventTypes.STORAGE_SAVE_FAILED, { 
                entity: 'markers', 
                error: e.message 
            });
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

        try { this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('MarkerManager.addMarker: added', 'MarkerManager.addMarker', { uid: marker.uid, x: marker.x, y: marker.y }); } catch (__) {}
        this.saveToStorage();
        this._notifyChanged(window.EventTypes ? window.EventTypes.MARKER_ADDED : null, { marker, layerKey: this.config.layerPrefix });

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
                this.errorHandler.logWarning('MarkerManager cleanup callback failed', 'MarkerManager.deleteMarker.cleanupCallback', { error: e });
            }
        }

        try { this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('MarkerManager.removeMarker: removed', 'MarkerManager.removeMarker', { uid }); } catch (__) {}
        this.saveToStorage();
        this._notifyChanged(window.EventTypes ? window.EventTypes.MARKER_REMOVED : null, { uid, layerKey: this.config.layerPrefix });

        return true;
    }

    // Update marker position (for drag operations)
    // NOTE: Does NOT auto-save - caller must explicitly saveToStorage() when drag is finalized
    updateMarkerPosition(uid, x, y) {
        const index = this.findMarkerIndex(uid);
        if (index === -1) return false;

        // Update position (record old for diagnostics)
        const oldPos = { x: this.markers[index].x, y: this.markers[index].y };
        this.markers[index].x = Number(x);
        this.markers[index].y = Number(y);
        try { this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('MarkerManager.updateMarkerPosition', 'MarkerManager.updateMarkerPosition', { uid, oldPos, newPos: { x: this.markers[index].x, y: this.markers[index].y } }); } catch (__) {}

        // Notify that marker was moved (for rendering)
        this._notifyChanged(window.EventTypes ? window.EventTypes.MARKER_EDITED : null, { 
            uid, 
            marker: this.markers[index], 
            layerKey: this.config.layerPrefix,
            action: 'moved'
        });

        return true;
    }

    // Get marker screen position (needs view state)
    getScreenPosition(marker, viewState, mapSize) {
        return MarkerUtilsCore.getMarkerScreenPosition(marker, viewState, mapSize);
    }

    // Clear all markers
    clearMarkers() {
        this.markers = [];
        try { this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('MarkerManager.clearMarkers called', 'MarkerManager.clearMarkers', {}); } catch (__) {}
        this.saveToStorage();
        this._notifyChanged(window.EventTypes ? window.EventTypes.MARKER_REMOVED : null, { all: true, layerKey: this.config.layerPrefix });
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

    // Set all markers (replaces existing markers)
    setMarkers(markers) {
        if (!Array.isArray(markers)) {
            throw new Error('Markers must be an array');
        }
        
        // Validate all markers
        const validMarkers = markers.filter(marker => MarkerUtilsCore.validateMarker(marker));
        
        this.markers = validMarkers;
        try { this.errorHandler && this.errorHandler.logDebug && this.errorHandler.logDebug('MarkerManager.setMarkers: replaced markers', 'MarkerManager.setMarkers', { count: this.markers.length }); } catch (__) {}
        this.saveToStorage();
        this._notifyChanged(window.EventTypes ? window.EventTypes.MARKER_EDITED : null, { all: true, layerKey: this.config.layerPrefix });
    }

    // Check if marker exists by UID (alias for markerExists)
    hasMarker(uid) {
        return this.markerExists(uid);
    }

    // Export markers to JSON
    exportMarkers() {
        try {
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
        } catch (err) {
            // Distinguish validation errors (no data to export) from unexpected errors
            const isValidationError = err && err.message && err.message.includes('No custom markers to export');
            if (isValidationError) {
                this.errorHandler && this.errorHandler.logWarning(err && err.message ? err.message : String(err), 'MarkerManager.exportMarkers.validation');
            } else {
                this.errorHandler && this.errorHandler.logError(err, 'MarkerManager.exportMarkers');
            }
            if (this.notifications && typeof this.notifications.showMarkerError === 'function') {
                this.notifications.showMarkerError('Failed to export markers: ' + (err && err.message ? err.message : String(err)));
            }
            // Don't re-throw validation errors—user has been notified
            if (!isValidationError) {
                throw err;
            }
            return false;
        }
    }

    // Import markers from JSON file
    importMarkers(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    let markersToImport = [];

                    // Handle different formats
                    if (data && Array.isArray(data.markers)) {
                        // Format: { markers: [...], ... }
                        markersToImport = data.markers;
                    } else if (Array.isArray(data)) {
                        // Format: bare array
                        markersToImport = data;
                    } else {
                        throw new Error('Invalid marker file: missing markers array');
                    }

                    if (!Array.isArray(markersToImport) || markersToImport.length === 0) {
                        throw new Error('File contains no markers');
                    }

                    // Detect legacy marker file (legacy UIDs like cm01, cm02) vs current hashed UIDs
                    const isLegacyMarkersFile = MarkerUtilsCore.isLegacyMarkerFile(markersToImport);

                    // Build migratedMarkers: for legacy files regenerate hashed UIDs; for modern files keep provided UIDs
                    const migratedMarkers = markersToImport.map(m => {
                        if (typeof m.x !== 'number' || typeof m.y !== 'number') {
                            throw new Error('Invalid marker: x and y must be numbers');
                        }
                        const x = Number(m.x);
                        const y = Number(m.y);
                        let uid;
                        if (isLegacyMarkersFile) {
                            uid = MarkerUtilsCore.generateUniqueUID(x, y, this.config.layerPrefix, this.markers.map(existing => existing.uid));
                        } else {
                            uid = (typeof m.uid === 'string' && m.uid) ? m.uid : MarkerUtilsCore.generateUniqueUID(x, y, this.config.layerPrefix, this.markers.map(existing => existing.uid));
                        }
                        return { uid, x, y };
                    });

                    // Check limits: count only NEW markers (those without matching UIDs)
                    const newMarkersCount = migratedMarkers.filter(imported => !this.markerExists(imported.uid)).length;
                    const totalAfterImport = this.markers.length + newMarkersCount;

                    if (totalAfterImport > this.config.maxMarkers) {
                        const needToDelete = totalAfterImport - this.config.maxMarkers;
                        throw new Error(
                            `Cannot import ${migratedMarkers.length} markers.\n\n` +
                            `You have ${this.markers.length} markers, import would add ${newMarkersCount} new ones.\n\n` +
                            `Total would be ${totalAfterImport}, maximum is ${this.config.maxMarkers}.\n\n` +
                            `Please delete at least ${needToDelete} marker(s) first.`
                        );
                    }

                    // Merge markers: replace those with matching UIDs, add new ones
                    const mergedMarkers = this.markers.slice();
                    let replacedCount = 0;
                    let addedCount = 0;

                    for (const importedMarker of migratedMarkers) {
                        const existingIdx = mergedMarkers.findIndex(m => m.uid === importedMarker.uid);
                        if (existingIdx >= 0) {
                            // Replace marker with same UID (hash)
                            mergedMarkers[existingIdx] = importedMarker;
                            replacedCount++;
                        } else {
                            // Add new marker
                            mergedMarkers.push(importedMarker);
                            addedCount++;
                        }
                    }

                    // Update markers
                    this.markers = mergedMarkers;
                    this.saveToStorage();

                    // If legacy was detected, notify user
                    if (isLegacyMarkersFile && migratedMarkers.length > 0) {
                        this.notifications.showUpgradeNotification(`Upgraded custom markers: ${migratedMarkers.length} markers regenerated. UIDs and layers matched by coordinate hash.`);
                    }

                    // Notify about the import
                    const imported = migratedMarkers.map(m => ({ uid: m.uid, x: m.x, y: m.y }));
                    this._notifyChanged(window.EventTypes ? window.EventTypes.MARKER_ADDED : null, {
                        markers: imported,
                        layerKey: this.config.layerPrefix,
                        replaced: replacedCount,
                        added: addedCount
                    });

                    resolve({
                        imported: imported.length,
                        replaced: replacedCount,
                        added: addedCount
                    });
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
            this._notifyChanged(window.EventTypes ? window.EventTypes.MARKER_ADDED : null, { count: addedCount, layerKey: this.config.layerPrefix });
        }

        return this.markers;
    }

    /**
     * Clean up event listeners to prevent memory leaks
     */
    destroy() {
        try {
            // Unsubscribe all event listeners
            if (Array.isArray(this._eventUnsubscribers)) {
                for (const unsub of this._eventUnsubscribers) {
                    if (typeof unsub === 'function') {
                        unsub();
                    }
                }
                this._eventUnsubscribers = [];
            }
        } catch (e) {
            this.errorHandler.logWarning('MarkerManager.destroy failed', 'MarkerManager.destroy', { error: e });
        }
    }
}

// Make MarkerManager globally available
window.MarkerManager = MarkerManager;
