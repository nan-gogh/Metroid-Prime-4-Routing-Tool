// StorageService.js - Unified storage access layer
// Consolidates all localStorage operations with consent checking and error handling

class StorageService {
    constructor(consentChecker, errorHandler = null, eventBus = null) {
        this._consentChecker = consentChecker;
        this._errorHandler = errorHandler || new ErrorHandler();
        this._cache = new Map();
        this._eventBus = eventBus || (typeof window !== 'undefined' ? window.eventBus : null);
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
}

// Global storage service instance
// Will be initialized by the main application with proper consent checker
let storageService = null;

/**
 * Initialize the global storage service
 * @param {Function} consentChecker - Function that returns true if user has storage consent
 * @param {ErrorHandler} errorHandler - Error handler instance
 */
function initializeStorageService(consentChecker, errorHandler = null) {
    storageService = new StorageService(consentChecker, errorHandler);
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
    window.storageService = storageService; // Global instance
}