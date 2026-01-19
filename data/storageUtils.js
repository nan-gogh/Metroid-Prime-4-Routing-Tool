// data/storageUtils.js
// Consolidated storage module: consent-gated low-level API (_mp4Storage)
// and convenient helpers (StorageUtils). Keeps backwards compatibility.

(function () {
  'use strict';

  const KNOWN_KEYS = [
    'mp4_tileset', 'mp4_tileset_grayscale', 'mp4_layerVisibility',
    'mp4_saved_route', 'mp4_customMarkers', 'routeDir', 'mp4_map_view', 'mp4_grid_visible', 'mp4_storage_consent'
  ];

  function hasStorageConsent() {
    try { return localStorage.getItem('mp4_storage_consent') === '1'; } catch (e) { return false; }
  }

  function setStorageConsent(accepted) {
    try {
      if (accepted) {
        localStorage.setItem('mp4_storage_consent', '1');
      } else {
        localStorage.removeItem('mp4_storage_consent');
      }
      return true;
    } catch (e) { return false; }
  }

  function saveSetting(key, value) {
    try {
      if (!key) return false;
      // Always allow writing the consent flag itself
      if (key === 'mp4_storage_consent') return setStorageConsent(String(value) === '1' || value === true);
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
      if (key === 'mp4_storage_consent') return localStorage.getItem('mp4_storage_consent');
      if (!hasStorageConsent()) return null;
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return null;
      try { return JSON.parse(raw); } catch (e) { return raw; }
    } catch (e) { return null; }
  }

  function clearSavedData(removeConsent = true) {
    try {
      for (const k of KNOWN_KEYS) {
        try { localStorage.removeItem(k); } catch (e) {
          // best-effort removal; no central error handler available here
        }
      }
      if (removeConsent) try { localStorage.removeItem('mp4_storage_consent'); } catch (e) { /* ignore */ }
      return true;
    } catch (e) { return false; }
  }

  // Expose low-level consent-gated API
  window._mp4Storage = {
    hasStorageConsent,
    setStorageConsent,
    saveSetting,
    loadSetting,
    clearSavedData
  };

  // Convenience helpers that delegate to _mp4Storage
  const StorageUtils = {
    saveMapView(obj) {
      try {
        if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
          return window._mp4Storage.saveSetting('mp4_map_view', obj || null);
        }
        // Fallback for unusual envs where _mp4Storage isn't present
        try { localStorage.setItem('mp4_map_view', JSON.stringify(obj || null)); return true; } catch (e) { return false; }
      } catch (e) { return false; }
    },

    loadMapView() {
      try {
        if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
          return window._mp4Storage.loadSetting('mp4_map_view');
        }
        let s = null; try { s = localStorage.getItem('mp4_map_view'); } catch (e) { s = null; }
        if (!s) return null; try { return JSON.parse(s); } catch (e) { return s; }
      } catch (e) { return null; }
    },

    // Expose low-level helpers for convenience/testing
    saveSetting: function (k, v) { return saveSetting(k, v); },
    loadSetting: function (k) { return loadSetting(k); },
    hasStorageConsent: function () { return hasStorageConsent(); },
    setStorageConsent: function (v) { return setStorageConsent(v); },
    clearSavedData: function (r) { return clearSavedData(r); }
  };

  window.StorageUtils = StorageUtils;
})();
