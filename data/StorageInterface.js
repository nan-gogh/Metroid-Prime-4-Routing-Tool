// Storage interface for abstracting localStorage operations
// Provides a clean API for persistence operations without direct localStorage coupling

const StorageInterface = {
    // Marker storage operations
    saveMarkers: function(markers) {
        try {
            localStorage.setItem('mp4_customMarkers', JSON.stringify(markers));
            return true;
        } catch (e) {
            console.warn('Failed to save markers to localStorage:', e);
            return false;
        }
    },

    loadMarkers: function() {
        try {
            const data = localStorage.getItem('mp4_customMarkers');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.warn('Failed to load markers from localStorage:', e);
            return [];
        }
    },

    // Route storage operations
    saveRoute: function(routeData) {
        try {
            localStorage.setItem('mp4_route', JSON.stringify(routeData));
            return true;
        } catch (e) {
            console.warn('Failed to save route to localStorage:', e);
            return false;
        }
    },

    loadRoute: function() {
        try {
            const data = localStorage.getItem('mp4_route');
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.warn('Failed to load route from localStorage:', e);
            return null;
        }
    },

    // Route looping flag
    saveRouteLoopingFlag: function(looping) {
        try {
            localStorage.setItem('mp4_routeLooping', JSON.stringify(looping));
            return true;
        } catch (e) {
            console.warn('Failed to save route looping flag:', e);
            return false;
        }
    },

    loadRouteLoopingFlag: function() {
        try {
            const data = localStorage.getItem('mp4_routeLooping');
            return data ? JSON.parse(data) : false;
        } catch (e) {
            console.warn('Failed to load route looping flag:', e);
            return false;
        }
    },

    // Settings storage
    saveSettings: function(settings) {
        try {
            localStorage.setItem('mp4_settings', JSON.stringify(settings));
            return true;
        } catch (e) {
            console.warn('Failed to save settings to localStorage:', e);
            return false;
        }
    },

    loadSettings: function() {
        try {
            const data = localStorage.getItem('mp4_settings');
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.warn('Failed to load settings from localStorage:', e);
            return {};
        }
    }
};

// Make StorageInterface globally available
window.StorageInterface = StorageInterface;