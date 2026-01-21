// controllers/ConsentManager.js
// CORE ARCHITECTURE: Manages user consent for storage operations and privacy preferences
// This is a REQUIRED component for GDPR compliance and privacy management
// Handles consent state, events, and lifecycle

(function (global) {
  if (typeof globalThis.__MP4_NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.__MP4_NOOP_ERROR_HANDLER = { logDebug: function(){}, logWarning: function(){}, logError: function(){} };
  }

  class ConsentManager {
    /**
     * @param {Object} options - Configuration options
     * @param {Object} options.storage - StorageService instance
     * @param {Object} options.eventBus - EventBus instance
     * @param {Object} options.config - App configuration
     * @param {Object} options.errorHandler - ErrorHandler instance
     */
    constructor(options) {
      this.storage = options.storage;
      this.eventBus = options.eventBus || window.eventBus;
      this.config = options.config || global.MP4Config || {};
      this.errorHandler = options.errorHandler || globalThis.__MP4_NOOP_ERROR_HANDLER;

      this._consentKey = (this.config?.STORAGE_KEYS?.STORAGE_CONSENT) || 'mp4_storage_consent';
      this._notificationManager = options.notificationManager || null;
      this._eventUnsubscribers = [];

      this._setupEventListeners();
    }

    /**
     * Setup event listeners for consent-related events
     * @private
     */
    _setupEventListeners() {
      try {
        if (this.eventBus && typeof this.eventBus.on === 'function') {
          // Listen for storage quota exceeded to suggest consent review
          this._eventUnsubscribers.push(
            this.eventBus.on(window.EventTypes?.STORAGE_QUOTA_EXCEEDED, (data) => {
              this._handleQuotaExceeded(data);
            })
          );
        }
      } catch (e) {
        this.errorHandler.logWarning('ConsentManager: Failed to setup event listeners', 'ConsentManager._setupEventListeners', { error: e });
      }
    }

    /**
     * Get current consent status
     * @returns {boolean} Whether user has granted storage consent
     */
    getConsent() {
      try {
        if (!this.storage) return false;
        const consentValue = this.storage.get(this._consentKey, null);
        return consentValue === '1' || consentValue === true;
      } catch (e) {
        this.errorHandler.logWarning('ConsentManager: Failed to get consent', 'ConsentManager.getConsent', { error: e });
        return false;
      }
    }

    /**
     * Check if user has given consent (alias for getConsent)
     * @returns {boolean}
     */
    hasConsent() {
      return this.getConsent();
    }

    /**
     * Request consent from user via UI prompt
     * @async
     * @returns {Promise<boolean>} True if user granted consent
     */
    async requestConsentAsync() {
      try {
        this.errorHandler.logDebug('ConsentManager: Requesting user consent', 'ConsentManager.requestConsentAsync');

        // Emit consent request started
        if (this.eventBus) {
          try {
            this.eventBus.emit(window.EventTypes?.STORAGE_CONSENT_CHANGED, {
              consent: false,
              state: 'requesting'
            });
          } catch (__) {}
        }

        // Show confirmation dialog
        let userConsented = false;
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.confirmStorageConsentAsync) {
          userConsented = await NotificationUtils.confirmStorageConsentAsync();
        }

        if (userConsented) {
          this.setConsent(true);
        }

        return userConsented;
      } catch (e) {
        this.errorHandler.logError(e, 'ConsentManager.requestConsentAsync');
        return false;
      }
    }

    /**
     * Set consent status and emit event
     * @param {boolean} granted - Whether to grant consent
     * @returns {boolean} True if successful
     */
    setConsent(granted) {
      try {
        if (!this.storage) return false;

        const oldConsent = this.getConsent();

        if (granted) {
          this.storage.set(this._consentKey, '1');
        } else {
          this.storage.remove(this._consentKey);
        }

        this.errorHandler.logDebug('ConsentManager: Consent changed', 'ConsentManager.setConsent', {
          oldConsent,
          newConsent: granted
        });

        // Emit event for consent change
        if (this.eventBus) {
          try {
            this.eventBus.emit(window.EventTypes?.STORAGE_CONSENT_CHANGED, {
              consent: granted,
              state: 'changed',
              oldConsent,
              newConsent: granted
            });
          } catch (__) {}
        }

        return true;
      } catch (e) {
        this.errorHandler.logError(e, 'ConsentManager.setConsent', { granted });
        return false;
      }
    }

    /**
     * Revoke consent and clear user data
     * @async
     * @returns {Promise<boolean>} True if successful
     */
    async revokeConsentAsync() {
      try {
        this.errorHandler.logDebug('ConsentManager: Revoking consent', 'ConsentManager.revokeConsentAsync');

        // Clear all stored data
        if (typeof clearSavedData === 'function') {
          clearSavedData(true);
        } else if (this.storage && typeof this.storage.clearAll === 'function') {
          this.storage.clearAll();
        }

        // Remove consent flag
        if (this.storage && typeof this.storage.remove === 'function') {
          this.storage.remove(this._consentKey);
        }

        // Emit revocation event
        if (this.eventBus) {
          try {
            this.eventBus.emit(window.EventTypes?.STORAGE_CONSENT_CHANGED, {
              consent: false,
              state: 'revoked',
              dataCleared: true
            });
          } catch (__) {}
        }

        this.errorHandler.logDebug('ConsentManager: Consent revoked and data cleared', 'ConsentManager.revokeConsentAsync');
        return true;
      } catch (e) {
        this.errorHandler.logError(e, 'ConsentManager.revokeConsentAsync');
        return false;
      }
    }

    /**
     * Get storage statistics including used space and quota info
     * @returns {Object} Storage stats
     */
    getStorageStats() {
      try {
        if (!this.storage) return null;

        const stats = this.storage.getStats?.();
        if (!stats) return null;

        // Add quota information
        return {
          ...stats,
          consentStatus: this.getConsent(),
          usagePercentage: stats.usedBytes && stats.maxBytes 
            ? (stats.usedBytes / stats.maxBytes * 100).toFixed(2)
            : null
        };
      } catch (e) {
        this.errorHandler.logWarning('ConsentManager: Failed to get storage stats', 'ConsentManager.getStorageStats', { error: e });
        return null;
      }
    }

    /**
     * Handle storage quota exceeded event
     * @private
     */
    _handleQuotaExceeded(data) {
      try {
        this.errorHandler.logWarning('ConsentManager: Storage quota exceeded', 'ConsentManager._handleQuotaExceeded', {
          key: data?.key,
          error: data?.error
        });

        // Show notification to user
        if (this._notificationManager && typeof this._notificationManager.showNotification === 'function') {
          this._notificationManager.showNotification(
            'Storage quota exceeded. Some data could not be saved.',
            'warning'
          );
        }

        // Emit quota exceeded event for UI handling
        if (this.eventBus) {
          try {
            this.eventBus.emit(window.EventTypes?.STORAGE_QUOTA_EXCEEDED, {
              context: 'ConsentManager',
              handled: true
            });
          } catch (__) {}
        }
      } catch (e) {
        this.errorHandler.logError(e, 'ConsentManager._handleQuotaExceeded');
      }
    }

    /**
     * Export privacy policy information
     * @returns {Object} Privacy information
     */
    getPrivacyInfo() {
      return {
        consentRequired: true,
        dataCollected: [
          'Custom markers',
          'Saved routes',
          'Layer visibility settings',
          'Map view state',
          'Route looping preference',
          'Tileset preference',
          'Grid/heatmap settings'
        ],
        storageMechanism: 'localStorage (client-side only)',
        dataCleared: 'User can revoke consent to clear all stored data',
        thirdParties: 'No third-party data sharing',
        lastConsentChange: this.storage?.get?.('mp4_storage_consent_timestamp') || null
      };
    }

    /**
     * Cleanup and unsubscribe from events
     */
    destroy() {
      try {
        this._eventUnsubscribers.forEach(unsub => {
          try { unsub(); } catch (__) {}
        });
        this._eventUnsubscribers = [];
        this.errorHandler.logDebug('ConsentManager: Destroyed', 'ConsentManager.destroy');
      } catch (e) {
        this.errorHandler.logWarning('ConsentManager: Failed to destroy', 'ConsentManager.destroy', { error: e });
      }
    }
  }

  // Export for use in modules
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConsentManager;
  }

  // Global exposure for browser environment
  if (typeof window !== 'undefined') {
    window.ConsentManager = ConsentManager;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
