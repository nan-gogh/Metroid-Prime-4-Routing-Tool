// Notification interface for abstracting user feedback operations
// Provides a clean API for notifications without direct NotificationUtils coupling

const NotificationInterface = {
    // Error notifications
    showError: function(message) {
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showLoadError) {
            NotificationUtils.showLoadError(message);
        } else {
            if (typeof window !== 'undefined' && window.errorHandler) {
                window.errorHandler.logError(message, 'NotificationInterface.showError');
            } else {
                console.error('NotificationInterface.showError:', message);
            }
            // Fallback: try to show alert for critical errors
            try {
                alert('Error: ' + message);
            } catch (e) {
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
            if (typeof window !== 'undefined' && window.errorHandler) {
                window.errorHandler.logError('Notification success: ' + message, 'NotificationInterface.showSuccess');
            } else {
                console.debug('NotificationInterface.showSuccess:', message);
            }
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
            if (typeof window !== 'undefined' && window.errorHandler) {
                window.errorHandler.logError('Notification upgrade: ' + message, 'NotificationInterface.showUpgradeNotification');
            } else {
                console.debug('NotificationInterface.showUpgradeNotification:', message);
            }
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
            if (typeof window !== 'undefined' && window.errorHandler) {
                window.errorHandler.logError('Load error: ' + message, 'NotificationInterface.showLoadError');
            } else {
                console.error('NotificationInterface.showLoadError:', message);
            }
            try {
                alert('Load Error: ' + message);
            } catch (e) {
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