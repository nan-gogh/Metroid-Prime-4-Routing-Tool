// StorageInterface.js (deprecated shim)
// Purpose: Backwards-compatible facade to the new StorageService API.
// Deprecated: Use StorageService/StorageServiceProvider via DI instead.
(function (global) {
    if (typeof global === 'undefined') return;

    if (global.StorageInterface) {
        // Already present (possibly an older version) — no-op.
        return;
    }

    function warnOnce() {
        if (!warnOnce._warned) {
            try {
                if (global.console && console.warn) console.warn('StorageInterface is deprecated. Use StorageService/StorageServiceProvider via DI.');
            } catch (e) {}
            warnOnce._warned = true;
        }
    }

    function getService() {
        // Prefer the runtime-initialized StorageService instance
        if (global.storageService) return global.storageService;
        // Fallback to storageProvider shim used elsewhere
        if (global.storageProvider && typeof global.storageProvider.getInstance === 'function') {
            return global.storageProvider.getInstance();
        }
        // No storage available — return a noop object
        return null;
    }

    var shim = {
        saveMarkers: function (markers) {
            warnOnce();
            var svc = getService();
            if (!svc || typeof svc.saveMarkers !== 'function') return false;
            return svc.saveMarkers(markers);
        },
        loadMarkers: function () {
            warnOnce();
            var svc = getService();
            if (!svc || typeof svc.loadMarkers !== 'function') return [];
            return svc.loadMarkers();
        },
        saveRoute: function (routeData) {
            warnOnce();
            var svc = getService();
            if (!svc || typeof svc.saveRoute !== 'function') return false;
            return svc.saveRoute(routeData);
        },
        loadRoute: function () {
            warnOnce();
            var svc = getService();
            if (!svc || typeof svc.loadRoute !== 'function') return null;
            return svc.loadRoute();
        },
        saveSettings: function (settings) {
            warnOnce();
            var svc = getService();
            if (!svc || typeof svc.saveSettings !== 'function') return false;
            return svc.saveSettings(settings);
        },
        loadSettings: function () {
            warnOnce();
            var svc = getService();
            if (!svc || typeof svc.loadSettings !== 'function') return {};
            return svc.loadSettings();
        },
        // Generic get/set for backward compatibility
        get: function (key, defaultValue) {
            warnOnce();
            var svc = getService();
            if (!svc || typeof svc.get !== 'function') return defaultValue;
            return svc.get(key, defaultValue);
        },
        set: function (key, value) {
            warnOnce();
            var svc = getService();
            if (!svc || typeof svc.set !== 'function') return false;
            return svc.set(key, value);
        }
    };

    global.StorageInterface = shim;

    // Export for CommonJS environments as well
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = shim;
    }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
