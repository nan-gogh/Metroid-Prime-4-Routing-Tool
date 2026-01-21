// StorageService.js - Unified storage access layer
// Consolidates all localStorage operations with consent checking and error handling

class StorageService {
    constructor(consentChecker, errorHandler = null, eventBus = null) {
        this._consentChecker = consentChecker;
        this._errorHandler = errorHandler || new ErrorHandler();
        this._cache = new Map();
        this._eventBus = eventBus || null;
    }

    /**
     * Check if user has given storage consent
     * @returns {boolean} True if storage consent is granted
     */
    hasConsent() {
        try {
            return this._consentChecker ? this._consentChecker() : false;
        } catch (e) {
            this._errorHandler.logWarning('StorageService.hasConsent: consent checker failed', 'StorageService.hasConsent', { error: e });
            return false;
        }
    }

    /**
     * Get a value from storage with consent checking
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if key not found or consent denied
     * @returns {*} Stored value or defaultValue
     */
    get(key, defaultValue = null) {
        if (!this.hasConsent()) {
            return defaultValue;
        }

        // Emit load started
        try { this._eventBus && this._eventBus.emit && this._eventBus.emit(window.EventTypes.STORAGE_LOAD_STARTED, { key }); } catch (__) {}

        // Check cache first
        if (this._cache.has(key)) {
            try { this._eventBus && this._eventBus.emit && this._eventBus.emit(window.EventTypes.STORAGE_LOAD_COMPLETED, { key, source: 'cache' }); } catch (__) {}
            return this._cache.get(key);
        }

        try {
            const value = localStorage.getItem(key);
            const parsed = value !== null ? JSON.parse(value) : defaultValue;
            this._cache.set(key, parsed);
            try { this._eventBus && this._eventBus.emit && this._eventBus.emit(window.EventTypes.STORAGE_LOAD_COMPLETED, { key, source: 'localStorage' }); } catch (__) {}
            return parsed;
        } catch (e) {
            this._errorHandler.logWarning(`StorageService.get: Failed to load ${key}`, 'StorageService.get', { key, error: e });
            try { this._eventBus && this._eventBus.emit && this._eventBus.emit(window.EventTypes.STORAGE_LOAD_FAILED, { key, error: e && e.message ? e.message : String(e) }); } catch (__) {}
            return defaultValue;
        }
    }

    /**
     * Set a value in storage with consent checking
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {boolean} True if successful, false otherwise
     */
    set(key, value) {
        if (!this.hasConsent()) {
            return false;
        }

        // Emit save started
        try { this._eventBus && this._eventBus.emit && this._eventBus.emit(window.EventTypes.STORAGE_SAVE_STARTED, { key }); } catch (__) {}

        try {
            const serialized = JSON.stringify(value);
            localStorage.setItem(key, serialized);
            this._cache.set(key, value);
            try { this._eventBus && this._eventBus.emit && this._eventBus.emit(window.EventTypes.STORAGE_SAVE_COMPLETED, { key }); } catch (__) {}
            return true;
        } catch (e) {
            this._errorHandler.logWarning(`StorageService.set: Failed to save ${key}`, 'StorageService.set', { key, value, error: e });
            try {
                this._eventBus && this._eventBus.emit && this._eventBus.emit(window.EventTypes.STORAGE_SAVE_FAILED, { key, error: e && e.message ? e.message : String(e) });
            } catch (__) {}
            // Quota handling
            try {
                if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
                    this._eventBus && this._eventBus.emit && this._eventBus.emit(window.EventTypes.STORAGE_QUOTA_EXCEEDED, { key, error: e && e.message ? e.message : String(e) });
                }
            } catch (__) {}
            return false;
        }
    }

    /**
     * Remove a value from storage
     * @param {string} key - Storage key to remove
     */
    remove(key) {
        try {
            this._cache.delete(key);
            localStorage.removeItem(key);
            try { this._eventBus && this._eventBus.emit && this._eventBus.emit(window.EventTypes.STORAGE_SAVE_COMPLETED, { key, removed: true }); } catch (__) {}
        } catch (e) {
            this._errorHandler.logWarning(`StorageService.remove: Failed to remove ${key}`, 'StorageService.remove', { key, error: e });
            try { this._eventBus && this._eventBus.emit && this._eventBus.emit(window.EventTypes.STORAGE_SAVE_FAILED, { key, error: e && e.message ? e.message : String(e) }); } catch (__) {}
        }
    }

    /**
     * Clear all cached values
     */
    clearCache() {
        this._cache.clear();
    }

    /**
     * Get storage statistics for debugging
     * @returns {Object} Statistics about cached items
     */
    getStats() {
        return {
            cacheSize: this._cache.size,
            hasConsent: this.hasConsent(),
            cachedKeys: Array.from(this._cache.keys())
        };
    }

    // ===== LEGACY COMPATIBILITY METHODS =====
    // These methods maintain backward compatibility with existing code

    /**
     * Load a setting (legacy _mp4Storage compatibility)
     * @param {string} key - Storage key
     * @returns {*} Stored value or null
     */
    loadSetting(key) {
        return this.get(key, null);
    }

    /**
     * Save a setting (legacy _mp4Storage compatibility)
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {boolean} True if successful
     */
    saveSetting(key, value) {
        return this.set(key, value);
    }

    // ===== STORAGEINTERFACE CONSOLIDATION METHODS =====
    // These replace the deprecated StorageInterface.js module

    /**
     * Save markers to storage (from StorageInterface.saveMarkers)
     * @param {Array} markers - Markers array to save
     * @returns {boolean} True if successful
     */
    saveMarkers(markers) {
        try {
            if (!this.hasConsent()) {
                this._errorHandler.logDebug('StorageService.saveMarkers: No consent', 'StorageService.saveMarkers');
                return false;
            }
            return this.set('mp4_customMarkers', markers);
        } catch (e) {
            this._errorHandler.logWarning('Failed to save markers to storage', 'StorageService.saveMarkers', { error: e });
            return false;
        }
    }

    /**
     * Load markers from storage (from StorageInterface.loadMarkers)
     * @returns {Array} Markers array or empty array if not found
     */
    loadMarkers() {
        try {
            if (!this.hasConsent()) {
                return [];
            }
            const data = this.get('mp4_customMarkers');
            return Array.isArray(data) ? data : [];
        } catch (e) {
            this._errorHandler.logWarning('Failed to load markers from storage', 'StorageService.loadMarkers', { error: e });
            return [];
        }
    }

    /**
     * Save route data to storage (from StorageInterface.saveRoute)
     * @param {Object} routeData - Route data to save
     * @returns {boolean} True if successful
     */
    saveRoute(routeData) {
        try {
            if (!this.hasConsent()) {
                return false;
            }
            return this.set('mp4_route', routeData);
        } catch (e) {
            this._errorHandler.logWarning('Failed to save route to storage', 'StorageService.saveRoute', { error: e });
            return false;
        }
    }

    /**
     * Load route data from storage (from StorageInterface.loadRoute)
     * @returns {Object|null} Route data or null if not found
     */
    loadRoute() {
        try {
            if (!this.hasConsent()) {
                return null;
            }
            return this.get('mp4_route', null);
        } catch (e) {
            this._errorHandler.logWarning('Failed to load route from storage', 'StorageService.loadRoute', { error: e });
            return null;
        }
    }

    /**
     * Save route looping flag (from StorageInterface.saveRouteLoopingFlag)
     * @param {boolean} looping - Whether route should loop
     * @returns {boolean} True if successful
     */
    saveRouteLoopingFlag(looping) {
        try {
            if (!this.hasConsent()) {
                return false;
            }
            return this.set('mp4_routeLooping', looping);
        } catch (e) {
            this._errorHandler.logWarning('Failed to save route looping flag', 'StorageService.saveRouteLoopingFlag', { error: e });
            return false;
        }
    }

    /**
     * Load route looping flag (from StorageInterface.loadRouteLoopingFlag)
     * @returns {boolean} Looping flag or false if not set
     */
    loadRouteLoopingFlag() {
        try {
            if (!this.hasConsent()) {
                return false;
            }
            return this.get('mp4_routeLooping', false);
        } catch (e) {
            this._errorHandler.logWarning('Failed to load route looping flag', 'StorageService.loadRouteLoopingFlag', { error: e });
            return false;
        }
    }

    /**
     * Save settings object (from StorageInterface.saveSettings)
     * @param {Object} settings - Settings object to save
     * @returns {boolean} True if successful
     */
    saveSettings(settings) {
        try {
            if (!this.hasConsent()) {
                return false;
            }
            return this.set('mp4_settings', settings);
        } catch (e) {
            this._errorHandler.logWarning('Failed to save settings to storage', 'StorageService.saveSettings', { error: e });
            return false;
        }
    }

    /**
     * Load settings object (from StorageInterface.loadSettings)
     * @returns {Object} Settings object or empty object if not found
     */
    loadSettings() {
        try {
            if (!this.hasConsent()) {
                return {};
            }
            const data = this.get('mp4_settings', null);
            return (data && typeof data === 'object') ? data : {};
        } catch (e) {
            this._errorHandler.logWarning('Failed to load settings from storage', 'StorageService.loadSettings', { error: e });
            return {};
        }
    }

    /**
     * Save marker scaling configuration (from StorageInterface.saveMarkerScaling)
     * @param {Object} config - Scaling config object
     * @returns {boolean} True if successful
     */
    saveMarkerScaling(config) {
        try {
            if (!this.hasConsent()) {
                return false;
            }
            return this.set('mp4_markerScaling', config);
        } catch (e) {
            this._errorHandler.logWarning('Failed to save marker scaling to storage', 'StorageService.saveMarkerScaling', { error: e });
            return false;
        }
    }

    /**
     * Load marker scaling configuration (from StorageInterface.loadMarkerScaling)
     * @returns {Object|null} Scaling config or null if not set
     */
    loadMarkerScaling() {
        try {
            if (!this.hasConsent()) {
                return null;
            }
            return this.get('mp4_markerScaling', null);
        } catch (e) {
            this._errorHandler.logWarning('Failed to load marker scaling from storage', 'StorageService.loadMarkerScaling', { error: e });
            return null;
        }
    }
}

// Global storage service instance
// Will be initialized by the main application with proper consent checker
let storageService = null;

/**
 * Initialize the global storage service
 * @param {Function} consentChecker - Function that returns true if user has storage consent
 * @param {ErrorHandler} errorHandler - Error handler instance
 */
function initializeStorageService(consentChecker, errorHandler = null, eventBus = null) {
    // Allow passing an app-level eventBus so StorageService can emit storage lifecycle events
    storageService = new StorageService(consentChecker, errorHandler, eventBus);
    return storageService;
}

/**
 * Get the global storage service instance
 * @returns {StorageService|null} Storage service instance or null if not initialized
 */
function getStorageService() {
    return storageService;
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageService, initializeStorageService, getStorageService };
}

// Global exposure for browser environment
if (typeof window !== 'undefined') {
    window.StorageService = StorageService;
    window.initializeStorageService = initializeStorageService;
    window.getStorageService = getStorageService;
}