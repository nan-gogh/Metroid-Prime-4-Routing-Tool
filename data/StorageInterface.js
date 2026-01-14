// Storage interface for abstracting localStorage operations
// Provides a clean API for persistence operations without direct localStorage coupling

const StorageInterface = {
    errorHandler: typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler(),
    // Marker storage operations
    saveMarkers: function(markers) {
        try {
            localStorage.setItem('mp4_customMarkers', JSON.stringify(markers));
            return true;
        } catch (e) {
            this.errorHandler.logWarning('Failed to save markers to localStorage', 'StorageInterface.saveMarkers', { error: e });
            return false;
        }
    },

    loadMarkers: function() {
        try {
            const data = localStorage.getItem('mp4_customMarkers');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            this.errorHandler.logWarning('Failed to load markers from localStorage', 'StorageInterface.loadMarkers', { error: e });
            return [];
        }
    },

    // Route storage operations
    saveRoute: function(routeData) {
        try {
            localStorage.setItem('mp4_route', JSON.stringify(routeData));
            return true;
        } catch (e) {
            this.errorHandler.logWarning('Failed to save route to localStorage', 'StorageInterface.saveRoute', { error: e });
            return false;
        }
    },

    loadRoute: function() {
        try {
            const data = localStorage.getItem('mp4_route');
            return data ? JSON.parse(data) : null;
        } catch (e) {
            this.errorHandler.logWarning('Failed to load route from localStorage', 'StorageInterface.loadRoute', { error: e });
            return null;
        }
    },

    // Route looping flag
    saveRouteLoopingFlag: function(looping) {
        try {
            localStorage.setItem('mp4_routeLooping', JSON.stringify(looping));
            return true;
        } catch (e) {
            this.errorHandler.logWarning('Failed to save route looping flag', 'StorageInterface.saveRouteLoopingFlag', { error: e });
            return false;
        }
    },

    loadRouteLoopingFlag: function() {
        try {
            const data = localStorage.getItem('mp4_routeLooping');
            return data ? JSON.parse(data) : false;
        } catch (e) {
            this.errorHandler.logWarning('Failed to load route looping flag', 'StorageInterface.loadRouteLoopingFlag', { error: e });
            return false;
        }
    },

    // Settings storage
    saveSettings: function(settings) {
        try {
            localStorage.setItem('mp4_settings', JSON.stringify(settings));
            return true;
        } catch (e) {
            this.errorHandler.logWarning('Failed to save settings to localStorage', 'StorageInterface.saveSettings', { error: e });
            return false;
        }
    },

    loadSettings: function() {
        try {
            const data = localStorage.getItem('mp4_settings');
            return data ? JSON.parse(data) : {};
        } catch (e) {
            this.errorHandler.logWarning('Failed to load settings from localStorage', 'StorageInterface.loadSettings', { error: e });
            return {};
        }
    },

    // Marker scaling configuration (only saved with consent)
    saveMarkerScaling: function(config) {
        try {
            localStorage.setItem('mp4_markerScaling', JSON.stringify(config));
            return true;
        } catch (e) {
            this.errorHandler.logWarning('Failed to save marker scaling to localStorage', 'StorageInterface.saveMarkerScaling', { error: e });
            return false;
        }
    },

    loadMarkerScaling: function() {
        try {
            const data = localStorage.getItem('mp4_markerScaling');
            return data ? JSON.parse(data) : null;
        } catch (e) {
            this.errorHandler.logWarning('Failed to load marker scaling from localStorage', 'StorageInterface.loadMarkerScaling', { error: e });
            return null;
        }
    }
};

// Make StorageInterface globally available
window.StorageInterface = StorageInterface;