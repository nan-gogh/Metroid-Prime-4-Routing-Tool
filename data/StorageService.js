// StorageService.js - Unified storage access layer
// Consolidates all localStorage operations with consent checking and error handling

class StorageService {
    constructor(consentChecker, errorHandler = null, eventBus = null) {
        this._consentChecker = consentChecker;
        this._errorHandler = errorHandler || new ErrorHandler();
        this._cache = new Map();
        this._eventBus = eventBus || null;
        this._consentOverride = null; // explicit override when consent state is managed programmatically
    }

    /**
     * Check whether localStorage appears available for read/write operations.
     * Uses a light touch feature-detect with try/catch to avoid throwing in restricted environments.
     * @returns {boolean}
     */
    _canUseLocalStorage() {
        try {
            if (typeof localStorage === 'undefined' || localStorage === null) return false;
            const testKey = '__mp4_storage_test__';
            localStorage.setItem(testKey, '1');
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Check if user has given storage consent
     * @returns {boolean} True if storage consent is granted
     */
    hasConsent() {
        try {
            if (this._consentOverride !== null) return !!this._consentOverride;
            if (this._consentChecker) return !!this._consentChecker();
            // Default: no consent until ConsentManager explicitly sets it
            return false;
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
        // Allow reading the consent flag even when consent is not yet granted
        const CONSENT_KEY = 'mp4_storage_consent';
        if (!this.hasConsent() && key !== CONSENT_KEY) {
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
        // Allow writing the consent flag even when consent is currently false
        const CONSENT_KEY = 'mp4_storage_consent';
        if (key !== CONSENT_KEY && !this.hasConsent()) {
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
            // Allow removing consent key even if consent is false
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

    /**
     * Calculate total size of stored items
     * @returns {number} Total bytes used in localStorage
     */
    _calculateUsedStorage() {
        try {
            let totalBytes = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    const value = localStorage.getItem(key) || '';
                    totalBytes += key.length + value.length;
                }
            }
            return totalBytes;
        } catch (e) {
            this._errorHandler.logWarning('StorageService: Failed to calculate storage usage', 'StorageService._calculateUsedStorage', { error: e });
            return 0;
        }
    }

    /**
     * Get detailed storage size statistics (GDPR feature)
     * @returns {Object} Storage size information including quota and usage percentage
     */
    getStorageSizeStats() {
        try {
            const usedBytes = this._calculateUsedStorage();
            // Typical localStorage quota is 5-10MB (5242880-10485760 bytes)
            // Most browsers default to 5MB
            const maxBytes = 5242880; // 5MB

            return {
                usedBytes,
                maxBytes,
                availableBytes: Math.max(0, maxBytes - usedBytes),
                usedPercentage: Math.round((usedBytes / maxBytes) * 100),
                availablePercentage: Math.max(0, Math.round(((maxBytes - usedBytes) / maxBytes) * 100)),
                canStore: usedBytes < (maxBytes * 0.9), // 90% threshold
                formattedUsed: this._formatBytes(usedBytes),
                formattedMax: this._formatBytes(maxBytes),
                formattedAvailable: this._formatBytes(Math.max(0, maxBytes - usedBytes))
            };
        } catch (e) {
            this._errorHandler.logWarning('StorageService: Failed to get storage size stats', 'StorageService.getStorageSizeStats', { error: e });
            return {
                usedBytes: 0,
                maxBytes: 5242880,
                availableBytes: 5242880,
                usedPercentage: 0,
                availablePercentage: 100,
                canStore: true
            };
        }
    }

    /**
     * Programmatically set consent state for storage operations.
     * Updates an internal override and optionally persists the choice.
     * Emits STORAGE_CONSENT_CHANGED via eventBus.
     * @param {boolean} granted
     * @param {boolean} persist
     */
    setConsent(granted, persist = true) {
        try {
            const old = this.hasConsent();
            this._consentOverride = !!granted;
            // Only persist consent to localStorage when explicitly requested AND
            // the new state is granted AND localStorage is available. This avoids
            // writing anything when consent is not given or localStorage is
            // unavailable (privacy modes, node tests, etc.). We intentionally
            // avoid removing items from localStorage here to prevent write
            // operations when revoking consent in restricted environments.
            if (persist && !!granted) {
                try {
                    if (this._canUseLocalStorage()) {
                        localStorage.setItem('mp4_storage_consent', '1');
                    }
                } catch (e) { /* best-effort */ }
            }
            try { this._eventBus && this._eventBus.emit && this._eventBus.emit(window.EventTypes.STORAGE_CONSENT_CHANGED, { consent: !!granted, oldConsent: old, newConsent: !!granted }); } catch (__) {}
            return true;
        } catch (e) {
            this._errorHandler.logWarning('StorageService.setConsent failed', 'StorageService.setConsent', { error: e });
            return false;
        }
    }

    /**
     * Replace the consentChecker function used by hasConsent()
     * @param {Function|null} fn
     */
    setConsentChecker(fn) {
        try {
            this._consentChecker = typeof fn === 'function' ? fn : null;
            return true;
        } catch (e) {
            this._errorHandler.logWarning('StorageService.setConsentChecker failed', 'StorageService.setConsentChecker', { error: e });
            return false;
        }
    }

    /**
     * Format bytes to human-readable format
     * @private
     * @param {number} bytes - Number of bytes
     * @returns {string} Formatted string (e.g. "1.23 MB")
     */
    _formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Clear all application data from storage
     * @returns {boolean} True if successful
     */
    clearAll() {
        try {
            const keysToKeep = ['mp4_storage_consent']; // Keep consent flag
            const keysToClear = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('mp4_') && !keysToKeep.includes(key)) {
                    keysToClear.push(key);
                }
            }

            for (const key of keysToClear) {
                this.remove(key);
            }

            this._cache.clear();
            this._errorHandler.logDebug('StorageService: All application data cleared', 'StorageService.clearAll');
            return true;
        } catch (e) {
            this._errorHandler.logWarning('StorageService: Failed to clear all data', 'StorageService.clearAll', { error: e });
            return false;
        }
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
 * @param {EventBus} eventBus - Event bus instance for storage lifecycle events
 */
function initializeStorageService(consentChecker, errorHandler = null, eventBus = null) {
    // Allow passing an app-level eventBus so StorageService can emit storage lifecycle events
    storageService = new StorageService(consentChecker, errorHandler, eventBus);
    // Expose the initialized instance on window for legacy fallback and provider access
    if (typeof window !== 'undefined') {
        window.storageService = storageService;
    }
    return storageService;
}

/**
 * Get the global storage service instance
 * @returns {StorageService|null} Storage service instance or null if not initialized
 */
// Note: legacy global accessor removed. Use `initializeStorageService()` and
// DI via a `StorageServiceProvider` or `window.storageService` (legacy fallback).

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageService, initializeStorageService };
}

// Global exposure for browser environment (legacy fallback)
if (typeof window !== 'undefined') {
    window.StorageService = StorageService;
    window.initializeStorageService = initializeStorageService;
    // Runtime-initialized instance will be placed on `window.storageService` by initialize routine.
}