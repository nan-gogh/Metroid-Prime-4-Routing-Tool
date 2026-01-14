// StorageService.js - Unified storage access layer
// Consolidates all localStorage operations with consent checking and error handling

class StorageService {
    constructor(consentChecker, errorHandler = null) {
        this._consentChecker = consentChecker;
        this._errorHandler = errorHandler || (typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler());
        this._cache = new Map();
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

        // Check cache first
        if (this._cache.has(key)) {
            return this._cache.get(key);
        }

        try {
            const value = localStorage.getItem(key);
            const parsed = value !== null ? JSON.parse(value) : defaultValue;
            this._cache.set(key, parsed);
            return parsed;
        } catch (e) {
            this._errorHandler.logWarning(`StorageService.get: Failed to load ${key}`, 'StorageService.get', { key, error: e });
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

        try {
            const serialized = JSON.stringify(value);
            localStorage.setItem(key, serialized);
            this._cache.set(key, value);
            return true;
        } catch (e) {
            this._errorHandler.logWarning(`StorageService.set: Failed to save ${key}`, 'StorageService.set', { key, value, error: e });
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
        } catch (e) {
            this._errorHandler.logWarning(`StorageService.remove: Failed to remove ${key}`, 'StorageService.remove', { key, error: e });
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