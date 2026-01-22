// controllers/DataExportController.js
// CORE ARCHITECTURE: Implements GDPR data export functionality for user privacy
// This is a REQUIRED component for GDPR compliance and data portability
// Allows users to export all their stored data in JSON format

(function (global) {
  if (typeof globalThis.__MP4_NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.__MP4_NOOP_ERROR_HANDLER = { logDebug: function(){}, logWarning: function(){}, logError: function(){} };
  }

  class DataExportController {
    /**
     * @param {Object} options - Configuration options
     * @param {Object} options.markerManager - MarkerManager instance
     * @param {Object} options.routeManager - RouteManager instance
     * @param {Object} options.storage - StorageService instance
     * @param {Object} options.mapState - MapState instance
     * @param {Object} options.layerState - LayerState instance
     * @param {Object} options.eventBus - EventBus instance
     * @param {Object} options.config - App configuration
     * @param {Object} options.errorHandler - ErrorHandler instance
     */
    constructor(options) {
      this.markerManager = options.markerManager;
      this.routeManager = options.routeManager;
      this.storage = options.storage;
      this.mapState = options.mapState;
      this.layerState = options.layerState;
      this.eventBus = options.eventBus || window.eventBus;
      this.config = options.config || global.MP4Config || {};
      this.errorHandler = options.errorHandler || globalThis.__MP4_NOOP_ERROR_HANDLER;

      this._notificationManager = options.notificationManager || null;
      this._eventUnsubscribers = [];
    }

    /**
     * Export all user data as JSON
     * @async
     * @returns {Promise<Object>} Complete user data export
     */
    async exportAllDataAsync() {
      try {
        this.errorHandler.logDebug('DataExportController: Exporting all user data', 'DataExportController.exportAllDataAsync');

        // Emit export started event
        if (this.eventBus) {
          try {
            this.eventBus.emit(window.EventTypes?.STORAGE_EXPORT_STARTED, {
              entities: ['markers', 'routes', 'settings', 'state']
            });
          } catch (__) {}
        }

        const exportData = {
          version: '1.0',
          exportDate: new Date().toISOString(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          entities: {
            markers: this._exportMarkers(),
            routes: this._exportRoutes(),
            settings: this._exportSettings(),
            state: this._exportApplicationState(),
            privacy: this._exportPrivacyInfo()
          }
        };

        this.errorHandler.logDebug('DataExportController: Export completed', 'DataExportController.exportAllDataAsync', {
          markerCount: exportData.entities.markers.length,
          routeCount: Object.keys(exportData.entities.routes).length
        });

        // Emit export completed event
        if (this.eventBus) {
          try {
            this.eventBus.emit(window.EventTypes?.STORAGE_EXPORT_COMPLETED, {
              dataSize: JSON.stringify(exportData).length,
              entityCount: Object.keys(exportData.entities).length
            });
          } catch (__) {}
        }

        return exportData;
      } catch (e) {
        this.errorHandler.logError(e, 'DataExportController.exportAllDataAsync');

        // Emit export failed event
        if (this.eventBus) {
          try {
            this.eventBus.emit(window.EventTypes?.STORAGE_EXPORT_FAILED, {
              error: e.message
            });
          } catch (__) {}
        }

        throw e;
      }
    }

    /**
     * Export user data and download as JSON file
     * @async
     * @param {string} [filename] - Optional custom filename (defaults to timestamp-based)
     */
    async downloadDataExportAsync(filename = null) {
      try {
        const data = await this.exportAllDataAsync();
        const exportFilename = filename || `metroid_data_${new Date().toISOString().split('T')[0]}.json`;

        // Create blob and download
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = exportFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this.errorHandler.logDebug('DataExportController: File downloaded', 'DataExportController.downloadDataExportAsync', {
          filename: exportFilename,
          size: blob.size
        });

        if (this._notificationManager && typeof this._notificationManager.showNotification === 'function') {
          this._notificationManager.showNotification(
            `Data exported to ${exportFilename}`,
            'success'
          );
        }

        return true;
      } catch (e) {
        this.errorHandler.logError(e, 'DataExportController.downloadDataExportAsync');
        
        if (this._notificationManager && typeof this._notificationManager.showNotification === 'function') {
          this._notificationManager.showNotification(
            'Failed to export data',
            'error'
          );
        }

        return false;
      }
    }

    /**
     * Export markers
     * @private
     * @returns {Array} Markers array
     */
    _exportMarkers() {
      try {
        if (!this.markerManager) return [];
        const markers = this.markerManager.getMarkers?.();
        return Array.isArray(markers) ? markers : [];
      } catch (e) {
        this.errorHandler.logWarning('DataExportController: Failed to export markers', 'DataExportController._exportMarkers', { error: e });
        return [];
      }
    }

    /**
     * Export routes
     * @private
     * @returns {Object} Routes data
     */
    _exportRoutes() {
      try {
        const routes = {};

        // Current route
        if (this.routeManager) {
          const route = this.routeManager.getCurrentRoute?.();
          if (route) {
            routes.current = {
              indices: route.indices,
              length: route.length,
              sources: route.sources,
              looping: route.looping
            };
          }
        }

        return routes;
      } catch (e) {
        this.errorHandler.logWarning('DataExportController: Failed to export routes', 'DataExportController._exportRoutes', { error: e });
        return {};
      }
    }

    /**
     * Export settings
     * @private
     * @returns {Object} Settings data
     */
    _exportSettings() {
      try {
        const settings = {};

        if (this.storage) {
          // Tileset preference
          const tileset = this.storage.get(this.config.STORAGE_KEYS?.TILESET_STATE);
          if (tileset) settings.tileset = tileset;

          // Grayscale preference
          const grayscale = this.storage.get(this.config.STORAGE_KEYS?.GRAYSCALE_ENABLED);
          if (typeof grayscale === 'boolean') settings.grayscale = grayscale;

          // Layer visibility
          const layerVisibility = this.storage.get(this.config.STORAGE_KEYS?.LAYER_STATE);
          if (layerVisibility) settings.layerVisibility = layerVisibility;
        }

        return settings;
      } catch (e) {
        this.errorHandler.logWarning('DataExportController: Failed to export settings', 'DataExportController._exportSettings', { error: e });
        return {};
      }
    }

    /**
     * Export application state
     * @private
     * @returns {Object} State data
     */
    _exportApplicationState() {
      try {
        const state = {};

        // Map view (pan/zoom)
        if (this.mapState) {
          state.mapView = {
            panX: this.mapState.panX,
            panY: this.mapState.panY,
            zoom: this.mapState.zoom
          };
        }

        // Layer states
        if (this.layerState) {
          state.layerVisibility = this.layerState.getLayerVisibility?.();
        }

        return state;
      } catch (e) {
        this.errorHandler.logWarning('DataExportController: Failed to export application state', 'DataExportController._exportApplicationState', { error: e });
        return {};
      }
    }

    /**
     * Export privacy and metadata info
     * @private
     * @returns {Object} Privacy info
     */
    _exportPrivacyInfo() {
      return {
        dataType: 'Personal User Data Export',
        purpose: 'GDPR Data Subject Access Request',
        dataRetention: 'User can delete at any time via consent revocation',
        thirdParties: 'No third-party sharing',
        notes: 'This export contains all data stored by the Metroid Prime 4 Routing Tool in the configured storage provider'
      };
    }

    /**
     * Import user data from JSON
     * @async
     * @param {Object} importData - Data exported from exportAllDataAsync
     * @returns {Promise<boolean>} True if import successful
     */
    async importUserDataAsync(importData) {
      try {
        if (!importData || typeof importData !== 'object') {
          throw new Error('Invalid import data format');
        }

        this.errorHandler.logDebug('DataExportController: Importing user data', 'DataExportController.importUserDataAsync', {
          version: importData.version
        });

        if (this.eventBus) {
          try {
            this.eventBus.emit(window.EventTypes?.STORAGE_IMPORT_STARTED, {
              version: importData.version
            });
          } catch (__) {}
        }

        const { entities } = importData;

        // Import markers
        if (entities?.markers && Array.isArray(entities.markers) && this.markerManager) {
          for (const marker of entities.markers) {
            try {
              this.markerManager.addMarker?.(marker);
            } catch (e) {
              this.errorHandler.logWarning('DataExportController: Failed to import marker', 'DataExportController.importUserDataAsync.marker', { error: e });
            }
          }
        }

        // Import routes
        if (entities?.routes?.current && this.routeManager) {
          try {
            const route = entities.routes.current;
            this.routeManager.setRoute?.(route.indices, route.length, route.sources);
            if (typeof route.looping === 'boolean') {
              this.routeManager.setRouteLooping?.(route.looping);
            }
          } catch (e) {
            this.errorHandler.logWarning('DataExportController: Failed to import route', 'DataExportController.importUserDataAsync.route', { error: e });
          }
        }

        // Import settings
        if (entities?.settings && this.storage) {
          try {
            if (entities.settings.tileset) {
              this.storage.set(this.config.STORAGE_KEYS?.TILESET_STATE, entities.settings.tileset);
            }
            if (typeof entities.settings.grayscale === 'boolean') {
              this.storage.set(this.config.STORAGE_KEYS?.GRAYSCALE_ENABLED, entities.settings.grayscale);
            }
            if (entities.settings.layerVisibility) {
              this.storage.set(this.config.STORAGE_KEYS?.LAYER_STATE, entities.settings.layerVisibility);
            }
          } catch (e) {
            this.errorHandler.logWarning('DataExportController: Failed to import settings', 'DataExportController.importUserDataAsync.settings', { error: e });
          }
        }

        this.errorHandler.logDebug('DataExportController: Import completed', 'DataExportController.importUserDataAsync');

        if (this.eventBus) {
          try {
            this.eventBus.emit(window.EventTypes?.STORAGE_IMPORT_COMPLETED, {
              markersImported: entities?.markers?.length || 0
            });
          } catch (__) {}
        }

        return true;
      } catch (e) {
        this.errorHandler.logError(e, 'DataExportController.importUserDataAsync');

        if (this.eventBus) {
          try {
            this.eventBus.emit(window.EventTypes?.STORAGE_IMPORT_FAILED, {
              error: e.message
            });
          } catch (__) {}
        }

        return false;
      }
    }

    /**
     * Get storage size statistics
     * @returns {Object} Storage stats
     */
    getStorageSizeStats() {
      try {
        if (!this.storage || typeof this.storage.getStorageSizeStats !== 'function') {
          return null;
        }

        return this.storage.getStorageSizeStats();
      } catch (e) {
        this.errorHandler.logWarning('DataExportController: Failed to get storage stats', 'DataExportController.getStorageSizeStats', { error: e });
        return null;
      }
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
        this.errorHandler.logDebug('DataExportController: Destroyed', 'DataExportController.destroy');
      } catch (e) {
        this.errorHandler.logWarning('DataExportController: Failed to destroy', 'DataExportController.destroy', { error: e });
      }
    }
  }

  // Export for use in modules
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataExportController;
  }

  // Global exposure for browser environment
  if (typeof window !== 'undefined') {
    window.DataExportController = DataExportController;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
