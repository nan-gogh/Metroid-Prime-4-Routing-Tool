// Small storage helper that gates reads/writes behind user consent.

(function(){
    // Known keys used by the app
    const KNOWN_KEYS = [
        'mp4_tileset', 'mp4_tileset_grayscale', 'mp4_layerVisibility',
        'mp4_saved_route', 'mp4_customMarkers', 'routeDir'
    ];

    function hasStorageConsent() {
        try {
            return localStorage.getItem('mp4_storage_consent') === '1';
        } catch (e) { return false; }
    }

    function setStorageConsent(accepted) {
        try {
            if (accepted) {
                localStorage.setItem('mp4_storage_consent', '1');
            } else {
                // remove consent flag to reflect unchecked state
                localStorage.removeItem('mp4_storage_consent');
            }
            return true;
        } catch (e) { return false; }
    }

    function saveSetting(key, value) {
        try {
            if (!key) return false;
            // Always allow writing consent flag itself
            if (key === 'mp4_storage_consent') {
                return setStorageConsent(String(value) === '1' || value === true);
            }
            if (!hasStorageConsent()) return false;
            if (typeof value === 'string') {
                localStorage.setItem(key, value);
            } else {
                localStorage.setItem(key, JSON.stringify(value));
            }
            return true;
        } catch (e) { return false; }
    }

    function loadSetting(key) {
        try {
            if (!key) return null;
            // Always allow reading the consent flag so the toggle can reflect it
            if (key === 'mp4_storage_consent') {
                return localStorage.getItem('mp4_storage_consent');
            }
            if (!hasStorageConsent()) return null;
            const raw = localStorage.getItem(key);
            if (raw === null || raw === undefined) return null;
            try { return JSON.parse(raw); } catch (e) { return raw; }
        } catch (e) { return null; }
    }

    function clearSavedData(removeConsent = true) {
        try {
            for (const k of KNOWN_KEYS) {
                try { localStorage.removeItem(k); } catch (e) {}
            }
            if (removeConsent) try { localStorage.removeItem('mp4_storage_consent'); } catch (e) {}
            return true;
        } catch (e) { return false; }
    }

    // Expose globally
    window._mp4Storage = {
        hasStorageConsent,
        setStorageConsent,
        saveSetting,
        loadSetting,
        clearSavedData
    };
})();
