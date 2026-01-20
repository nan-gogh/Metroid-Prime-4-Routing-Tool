// Notification interface for abstracting user feedback operations
// Provides a clean API for notifications without direct NotificationUtils coupling

if (typeof globalThis.__MP4_NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.__MP4_NOOP_ERROR_HANDLER = { logDebug: function(){}, logWarning: function(){}, logError: function(){} };
}

const NotificationInterface = {
    // Error notifications
    showError: function(message) {
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showLoadError) {
            NotificationUtils.showLoadError(message);
        } else {
            const h = (typeof window !== 'undefined' && window.errorHandler) ? window.errorHandler : globalThis.__MP4_NOOP_ERROR_HANDLER;
            h.logError(message, 'NotificationInterface.showError');
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
            const h = (typeof window !== 'undefined' && window.errorHandler) ? window.errorHandler : globalThis.__MP4_NOOP_ERROR_HANDLER;
            h.logDebug('NotificationInterface.showSuccess: ' + message, 'NotificationInterface.showSuccess');
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
            const h = (typeof window !== 'undefined' && window.errorHandler) ? window.errorHandler : globalThis.__MP4_NOOP_ERROR_HANDLER;
            h.logDebug('NotificationInterface.showUpgradeNotification: ' + message, 'NotificationInterface.showUpgradeNotification');
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
            const h = (typeof window !== 'undefined' && window.errorHandler) ? window.errorHandler : globalThis.__MP4_NOOP_ERROR_HANDLER;
            h.logError('Load error: ' + message, 'NotificationInterface.showLoadError');
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