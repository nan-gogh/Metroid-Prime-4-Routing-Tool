// Notification utilities for centralized user feedback
// Extracted from map.js to improve modularity and testability

const NotificationUtils = {
    // Show error message to user
    showError(message, title = 'Error') {
        try {
            if (typeof message !== 'string') message = String(message);
            alert(`${title}: ${message}`);
        } catch (e) {
            console.error('Failed to show error notification:', e);
        }
    },

    // Show success message to user
    showSuccess(message, title = 'Success') {
        try {
            if (typeof message !== 'string') message = String(message);
            alert(`${title}: ${message}`);
        } catch (e) {
            console.error('Failed to show success notification:', e);
        }
    },

    // Show informational message to user
    showInfo(message, title = 'Info') {
        try {
            if (typeof message !== 'string') message = String(message);
            alert(`${title}: ${message}`);
        } catch (e) {
            console.error('Failed to show info notification:', e);
        }
    },

    // Show confirmation dialog and return boolean result
    confirmAction(message, title = 'Confirm') {
        try {
            if (typeof message !== 'string') message = String(message);
            return confirm(`${title}: ${message}`);
        } catch (e) {
            console.error('Failed to show confirmation dialog:', e);
            return false;
        }
    },

    // Show route-specific error
    showRouteError(message) {
        this.showError(message, 'Route Error');
    },

    // Show marker-specific error
    showMarkerError(message) {
        this.showError(message, 'Marker Error');
    },

    // Show file operation error
    showFileError(message) {
        this.showError(message, 'File Error');
    },

    // Show upgrade notification
    showUpgradeNotification(message) {
        this.showInfo(message, 'Upgrade Complete');
    },

    // Confirm destructive action
    confirmDestructiveAction(message) {
        return this.confirmAction(message, 'Warning');
    },

    // Show route computation specific error
    showRouteComputationError(message) {
        this.showError(message, 'Route Computation Error');
    },

    // Show import/file operation error
    showImportError(message) {
        this.showError(message, 'Import Error');
    },

    // Confirm storage consent with specific messaging
    confirmStorageConsent() {
        const message = 'This will enable local storage for routes, markers, and map settings.\n\n' +
                       'Stored data includes:\n' +
                       '• Custom markers\n' +
                       '• Saved routes\n' +
                       '• Layer visibility\n' +
                       '• Map view settings\n' +
                       '• Route looping\n\n' +
                       'Tap OK to enable or Cancel to keep storage off.';
        return this.confirmAction(message, 'Enable Storage');
    },

    // Confirm clearing all saved data
    confirmClearData() {
        const message = 'This will permanently delete all saved routes, markers, and map settings.\n\n' +
                       'This action cannot be undone.\n\n' +
                       'Tap OK to delete saved data and continue, or Cancel to keep it.';
        return this.confirmDestructiveAction(message);
    },

    // Show route computation informational messages
    showRouteComputationInfo(message) {
        this.showInfo(message, 'Route Computation');
    },

    // Show module availability errors
    showModuleError(message) {
        this.showError(message, 'Module Error');
    },

    // Show loading/saving operation errors
    showLoadError(message) {
        this.showError(message, 'Load Error');
    },

    // Show save operation errors
    showSaveError(message) {
        this.showError(message, 'Save Error');
    }
};

// Make NotificationUtils globally available
window.NotificationUtils = NotificationUtils;