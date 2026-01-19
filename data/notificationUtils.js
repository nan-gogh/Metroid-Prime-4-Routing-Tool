// Notification utilities for centralized user feedback
// Extracted from map.js to improve modularity and testability

const NotificationUtils = {
    // Error handler will be injected after initialization
    setErrorHandler(handler) {
        this._errorHandler = handler;
    },
    // Show error message to user (now internally async for performance)
    showError(message, title = 'Error') {
        try {
            if (typeof message !== 'string') message = String(message);
            // Defer alert to separate macrotask to prevent performance violations
            TaskScheduler.deferToNextTask(async () => {
                alert(`${title}: ${message}`);
            });
        } catch (e) {
            if (NotificationUtils._errorHandler) {
                NotificationUtils._errorHandler.logError(e, 'NotificationUtils.showError');
            }
        }
    },

    // Show success message to user (now internally async for performance)
    showSuccess(message, title = 'Success') {
        try {
            if (typeof message !== 'string') message = String(message);
            // Defer alert to separate macrotask to prevent performance violations
            TaskScheduler.deferToNextTask(async () => {
                alert(`${title}: ${message}`);
            });
        } catch (e) {
            if (NotificationUtils._errorHandler) {
                NotificationUtils._errorHandler.logError(e, 'NotificationUtils.showSuccess');
            }
        }
    },

    // Show informational message to user (now internally async for performance)
    showInfo(message, title = 'Info') {
        try {
            if (typeof message !== 'string') message = String(message);
            // Defer alert to separate macrotask to prevent performance violations
            TaskScheduler.deferToNextTask(async () => {
                alert(`${title}: ${message}`);
            });
        } catch (e) {
            if (NotificationUtils._errorHandler) {
                NotificationUtils._errorHandler.logError(e, 'NotificationUtils.showInfo');
            }
        }
    },

    // Show confirmation dialog and return boolean result
    confirmAction(message, title = 'Confirm') {
        try {
            if (typeof message !== 'string') message = String(message);
            return confirm(`${title}: ${message}`);
        } catch (e) {
            if (NotificationUtils._errorHandler) {
                NotificationUtils._errorHandler.logError(e, 'NotificationUtils.confirmAction');
            }
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
    },

    // ============================================================
    // ASYNC CONFIRMATION METHODS - Properly handle performance
    // These defer the blocking dialog to a separate macrotask
    // Always use these async versions in event handlers
    // ============================================================

    // Async confirmation that defers the blocking dialog to prevent performance warnings
    async confirmActionAsync(message, title = 'Confirm') {
        try {
            if (typeof message !== 'string') message = String(message);
            // Defer to next macrotask to separate dialog from event handler
            return await TaskScheduler.deferToNextTask(async () => {
                return confirm(`${title}: ${message}`);
            });
        } catch (e) {
            if (NotificationUtils._errorHandler) {
                NotificationUtils._errorHandler.logError(e, 'NotificationUtils.confirmActionAsync');
            }
            return false;
        }
    },

    // Async destructive action confirmation
    async confirmDestructiveActionAsync(message) {
        return this.confirmActionAsync(message, 'Warning');
    },

    // Async storage consent confirmation
    async confirmStorageConsentAsync() {
        const message = 'This will enable local storage for routes, markers, and map settings.\n\n' +
                       'Stored data includes:\n' +
                       '• Custom markers\n' +
                       '• Saved routes\n' +
                       '• Layer visibility\n' +
                       '• Map view settings\n' +
                       '• Route looping\n\n' +
                       'Tap OK to enable or Cancel to keep storage off.';
        return this.confirmActionAsync(message, 'Enable Storage');
    },

    // Async clear data confirmation
    async confirmClearDataAsync() {
        const message = 'This will permanently delete all saved routes, markers, and map settings.\n\n' +
                       'This action cannot be undone.\n\n' +
                       'Tap OK to delete saved data and continue, or Cancel to keep it.';
        return this.confirmDestructiveActionAsync(message);
    }
};

// Make NotificationUtils globally available
window.NotificationUtils = NotificationUtils;