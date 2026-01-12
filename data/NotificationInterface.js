// Notification interface for abstracting user feedback operations
// Provides a clean API for notifications without direct NotificationUtils coupling

const NotificationInterface = {
    // Error notifications
    showError: function(message) {
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showLoadError) {
            NotificationUtils.showLoadError(message);
        } else {
            console.error('Notification error:', message);
            // Fallback: could show alert or update DOM directly
        }
    },

    // Success notifications
    showSuccess: function(message) {
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showSuccess) {
            NotificationUtils.showSuccess(message);
        } else {
            console.log('Notification success:', message);
            // Fallback: could show temporary message
        }
    },

    // Upgrade notifications (for legacy data)
    showUpgradeNotification: function(message) {
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showUpgradeNotification) {
            NotificationUtils.showUpgradeNotification(message);
        } else {
            console.log('Notification upgrade:', message);
            // Fallback: could show alert
        }
    },

    // Load error notifications
    showLoadError: function(message) {
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showLoadError) {
            NotificationUtils.showLoadError(message);
        } else {
            console.error('Load error:', message);
            // Fallback: could show alert
        }
    }
};

// Make NotificationInterface globally available
window.NotificationInterface = NotificationInterface;