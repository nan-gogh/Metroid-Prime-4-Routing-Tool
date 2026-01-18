// Notification interface for abstracting user feedback operations
// Provides a clean API for notifications without direct NotificationUtils coupling

const NotificationInterface = {
    // Error notifications
    showError: function(message) {
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showLoadError) {
            NotificationUtils.showLoadError(message);
        } else {
            this.errorHandler.logError('Notification error:', 'function', message);
            // Fallback: try to show alert for critical errors
            try {
                alert('Error: ' + message);
            } catch (e) {
                // If alert fails, try to update a status element
                const statusEl = document.getElementById('status') || document.getElementById('notification-area');
                if (statusEl) {
                    statusEl.textContent = 'Error: ' + message;
                    statusEl.style.color = 'red';
                    setTimeout(() => { statusEl.textContent = ''; }, 5000);
                }
            }
        }
    },

    // Success notifications
    showSuccess: function(message) {
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showSuccess) {
            NotificationUtils.showSuccess(message);
        } else {
            this.errorHandler.logError('Notification success:', 'function', message);
            // Fallback: try to show temporary success message
            try {
                const statusEl = document.getElementById('status') || document.getElementById('notification-area');
                if (statusEl) {
                    statusEl.textContent = message;
                    statusEl.style.color = 'green';
                    setTimeout(() => { statusEl.textContent = ''; }, 3000);
                }
            } catch (e) {
                // Silent fallback if DOM manipulation fails
            }
        }
    },

    // Upgrade notifications (for legacy data)
    showUpgradeNotification: function(message) {
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showUpgradeNotification) {
            NotificationUtils.showUpgradeNotification(message);
        } else {
            this.errorHandler.logError('Notification upgrade:', 'function', message);
            // Fallback: try to show upgrade message
            try {
                const statusEl = document.getElementById('status') || document.getElementById('notification-area');
                if (statusEl) {
                    statusEl.textContent = 'Upgrade: ' + message;
                    statusEl.style.color = 'blue';
                    setTimeout(() => { statusEl.textContent = ''; }, 5000);
                }
            } catch (e) {
                // Silent fallback if DOM manipulation fails
            }
        }
    },

    // Load error notifications
    showLoadError: function(message) {
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showLoadError) {
            NotificationUtils.showLoadError(message);
        } else {
            this.errorHandler.logError('Load error:', 'function', message);
            // Fallback: try to show alert for load errors
            try {
                alert('Load Error: ' + message);
            } catch (e) {
                // If alert fails, try to update a status element
                const statusEl = document.getElementById('status') || document.getElementById('notification-area');
                if (statusEl) {
                    statusEl.textContent = 'Load Error: ' + message;
                    statusEl.style.color = 'red';
                    setTimeout(() => { statusEl.textContent = ''; }, 5000);
                }
            }
        }
    }
};

// Make NotificationInterface globally available
window.NotificationInterface = NotificationInterface;