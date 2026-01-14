// controllers/SettingsController.js
// Handles settings controls: storage consent, tileset selection, grid/heatmap toggles

(function (global) {
  class SettingsController {
    constructor(map, config, errorHandler, eventBus) {
      this.map = map;
      this.config = config || global.MP4Config || {};
      this.errorHandler = errorHandler || (typeof global.errorHandler !== 'undefined' ? global.errorHandler : null);
      this.eventBus = eventBus || global.eventBus;
    }

    /**
     * Initialize settings controls
     */
    init() {
      this._bindStorageConsentToggle();
      this._bindTilesetControls();
      this._bindDisplayToggles();
      this._bindHighlightControls();
      this._updateSidebarHandleEmphasis();
    }

    /**
     * Bind storage consent toggle
     */
    _bindStorageConsentToggle() {
      try {
        const saveLabel = document.getElementById('saveDataToggle_label');
        if (saveLabel) {
          // Initialize state from consent flag
          const consent = this._getStorageConsent();
          this._updateConsentToggleUI(saveLabel, consent);

          saveLabel.addEventListener('click', async (ev) => {
            const current = saveLabel.getAttribute('aria-pressed') === 'true';
            const on = !current;

            if (on) {
              if (typeof NotificationUtils !== 'undefined' && NotificationUtils.confirmStorageConsent) {
                if (!NotificationUtils.confirmStorageConsent()) {
                  return;
                }
              }
            }

            // Set consent
            this._setStorageConsent(on);

            if (on) {
              // Save current settings
              await this._saveAllSettings();
              this._updateLayerCounts();
            } else {
              // Clear saved data
              if (!this._confirmClearData()) {
                this._updateConsentToggleUI(saveLabel, true);
                this._setStorageConsent(true);
              } else {
                this._clearAllSavedData();
                // Reload page after clearing
                try {
                  location.reload();
                } catch (e) {
                  this.errorHandler.logDebug('SettingsController: Failed to reload after clearing data', 'SettingsController._setStorageConsent.reload', { error: e });
                }
              }
            }

            // Update UI
            this._updateConsentToggleUI(saveLabel, on);
            this._updateSidebarHandleEmphasis();
          });
        }
      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to bind storage consent toggle', 'SettingsController._bindStorageConsentToggle', { error: e });
      }
    }

    /**
     * Bind tileset selection controls
     */
    _bindTilesetControls() {
      try {
        const tilesetSatBtn = document.getElementById('tilesetSatBtn');
        const tilesetHoloBtn = document.getElementById('tilesetHoloBtn');

        if (tilesetSatBtn) {
          tilesetSatBtn.addEventListener('click', () => {
            this._setTileset('sat');
          });
        }

        if (tilesetHoloBtn) {
          tilesetHoloBtn.addEventListener('click', () => {
            this._setTileset('holo');
          });
        }

        // Update initial button states
        this._updateTilesetButtonStates();

      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to bind tileset controls', 'SettingsController._bindTilesetControls', { error: e });
      }
    }

    /**
     * Bind display toggles (grid, heatmap, grayscale)
     */
    _bindDisplayToggles() {
      try {
        // Grid/Heatmap toggle
        const gridHeatmapBtn = document.getElementById('gridHeatmapBtn');
        if (gridHeatmapBtn) {
          gridHeatmapBtn.addEventListener('click', () => {
            if (this.map) {
              this.map._showGridHeatmap = !this.map._showGridHeatmap;
              this._updateGridHeatmapButtonState();
              this._saveDisplaySettings();
              this.map.render();
            }
          });
          this._updateGridHeatmapButtonState();
        }

        // Grayscale toggle
        const tilesetGrayscaleBtn = document.getElementById('tilesetGrayscaleBtn');
        if (tilesetGrayscaleBtn) {
          tilesetGrayscaleBtn.addEventListener('click', () => {
            if (this.map) {
              this.map.setTilesetGrayscale(!this.map.tilesetGrayscale);
              this._updateGrayscaleButtonState();
              this._saveDisplaySettings();
            }
          });
          this._updateGrayscaleButtonState();
        }

      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to bind display toggles', 'SettingsController._bindDisplayToggles', { error: e });
      }
    }

    /**
     * Bind highlight scaling controls
     */
    _bindHighlightControls() {
      try {
        // Highlight scaling sliders are handled in the main init() function
        // as they involve complex UI positioning and value handling

      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to bind highlight controls', 'SettingsController._bindHighlightControls', { error: e });
      }
    }

    /**
     * Set the tileset and update UI
     * @param {string} tileset - 'sat' or 'holo'
     */
    _setTileset(tileset) {
      try {
        if (this.map) {
          this.map.setTileset(tileset);
          this._updateTilesetButtonStates();
          this._saveDisplaySettings();
        }
      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to set tileset', 'SettingsController._setTileset', { tileset, error: e });
      }
    }

    /**
     * Update tileset button visual states
     */
    _updateTilesetButtonStates() {
      try {
        const tilesetSatBtn = document.getElementById('tilesetSatBtn');
        const tilesetHoloBtn = document.getElementById('tilesetHoloBtn');
        const currentTileset = this.map ? this.map.tileset : 'sat';

        if (tilesetSatBtn) {
          tilesetSatBtn.classList.toggle('active', currentTileset === 'sat');
        }
        if (tilesetHoloBtn) {
          tilesetHoloBtn.classList.toggle('active', currentTileset === 'holo');
        }
      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to update tileset button states', 'SettingsController._updateTilesetButtonStates', { error: e });
      }
    }

    /**
     * Update grid/heatmap button state
     */
    _updateGridHeatmapButtonState() {
      try {
        const gridHeatmapBtn = document.getElementById('gridHeatmapBtn');
        if (gridHeatmapBtn && this.map) {
          gridHeatmapBtn.classList.toggle('active', !!this.map._showGridHeatmap);
        }
      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to update grid/heatmap button state', 'SettingsController._updateGridHeatmapButtonState', { error: e });
      }
    }

    /**
     * Update grayscale button state
     */
    _updateGrayscaleButtonState() {
      try {
        const tilesetGrayscaleBtn = document.getElementById('tilesetGrayscaleBtn');
        if (tilesetGrayscaleBtn && this.map) {
          tilesetGrayscaleBtn.classList.toggle('active', !!this.map.tilesetGrayscale);
        }
      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to update grayscale button state', 'SettingsController._updateGrayscaleButtonState', { error: e });
      }
    }

    /**
     * Get current storage consent status
     * @returns {boolean} Whether storage consent is granted
     */
    _getStorageConsent() {
      try {
        if (window.storageService) {
          return window.storageService.hasConsent();
        } else if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function') {
          return window._mp4Storage.hasStorageConsent();
        }
        return localStorage.getItem('mp4_storage_consent') === '1';
      } catch (e) {
        return false;
      }
    }

    /**
     * Set storage consent
     * @param {boolean} consent - Whether to grant consent
     */
    _setStorageConsent(consent) {
      try {
        if (window.storageService) {
          if (consent) {
            window.storageService.set(this.config.STORAGE_KEYS.STORAGE_CONSENT, '1');
          } else {
            window.storageService.remove(this.config.STORAGE_KEYS.STORAGE_CONSENT);
          }
        } else if (window._mp4Storage && typeof window._mp4Storage.setStorageConsent === 'function') {
          window._mp4Storage.setStorageConsent(consent);
        } else {
          if (consent) {
            localStorage.setItem('mp4_storage_consent', '1');
          } else {
            localStorage.removeItem('mp4_storage_consent');
          }
        }
      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to set storage consent', 'SettingsController._setStorageConsent', { error: e });
      }
    }

    /**
     * Update consent toggle UI
     * @param {HTMLElement} toggle - The toggle element
     * @param {boolean} consent - Current consent state
     */
    _updateConsentToggleUI(toggle, consent) {
      try {
        toggle.classList.toggle('active', !!consent);
        toggle.setAttribute('aria-pressed', !!consent ? 'true' : 'false');

        const label = toggle.querySelector('.layer-name');
        if (label) {
          label.textContent = consent ? 'Clear Savedata' : 'Save Progress';
        }
      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to update consent toggle UI', 'SettingsController._updateConsentToggleUI', { error: e });
      }
    }

    /**
     * Confirm clearing saved data
     * @returns {boolean} Whether to proceed with clearing
     */
    _confirmClearData() {
      try {
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.confirmClearData) {
          return NotificationUtils.confirmClearData();
        }
        return confirm('Clear all saved progress? This cannot be undone.');
      } catch (e) {
        return false;
      }
    }

    /**
     * Save all current settings
     */
    async _saveAllSettings() {
      try {
        // Save display settings
        this._saveDisplaySettings();

        // Save highlight settings
        if (typeof saveHighlightMultiplierToStorage === 'function' && this.map) {
          saveHighlightMultiplierToStorage(this.map.highlightScaleMultiplier || 1.0);
        }
        if (typeof saveHighlightedLayersToStorage === 'function' && this.map) {
          saveHighlightedLayersToStorage(this.map._highlightConfig || {});
        }

        // Save layer visibility
        if (typeof saveLayerVisibilityToStorage === 'function' && this.map) {
          saveLayerVisibilityToStorage(this.map.layerVisibility || {});
        }

        // Save markers
        if (this.map && this.map.markerManager) {
          this.map.markerManager.saveToStorage();
        }

        // Save route
        if (this.map && typeof this.map.saveRouteToStorage === 'function') {
          this.map.saveRouteToStorage();
        }

        // Save view
        if (this.map && this.map.mapState && typeof this.map.mapState.saveToStorage === 'function') {
          this.map.mapState.saveToStorage();
        }

      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to save all settings', 'SettingsController._saveAllSettings', { error: e });
      }
    }

    /**
     * Save display-related settings
     */
    _saveDisplaySettings() {
      try {
        const settings = {
          tileset: this.map ? this.map.tileset : 'sat',
          tilesetGrayscale: this.map ? this.map.tilesetGrayscale : false,
          gridHeatmap: this.map ? this.map._showGridHeatmap : false
        };

        if (window.storageService) {
          window.storageService.set(this.config.STORAGE_KEYS.TILESET, settings.tileset);
          window.storageService.set(this.config.STORAGE_KEYS.TILESET_GRAYSCALE, settings.tilesetGrayscale ? '1' : '0');
          window.storageService.set(this.config.STORAGE_KEYS.GRID_HEATMAP, settings.gridHeatmap ? '1' : '0');
        } else if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
          window._mp4Storage.saveSetting('mp4_tileset', settings.tileset);
          window._mp4Storage.saveSetting('mp4_tileset_grayscale', settings.tilesetGrayscale ? '1' : '0');
          window._mp4Storage.saveSetting('mp4_grid_heatmap', settings.gridHeatmap ? '1' : '0');
        } else {
          localStorage.setItem('mp4_tileset', settings.tileset);
          localStorage.setItem('mp4_tileset_grayscale', settings.tilesetGrayscale ? '1' : '0');
          localStorage.setItem('mp4_grid_heatmap', settings.gridHeatmap ? '1' : '0');
        }
      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to save display settings', 'SettingsController._saveDisplaySettings', { error: e });
      }
    }

    /**
     * Clear all saved data
     */
    _clearAllSavedData() {
      try {
        if (window.storageService) {
          // Clear all storage keys using StorageService
          const keys = Object.values(this.config.STORAGE_KEYS);
          keys.forEach(key => {
            try {
              window.storageService.remove(key);
            } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'SettingsController._clearSavedData.removeItem'); }
          });
        } else if (window._mp4Storage && typeof window._mp4Storage.clearSavedData === 'function') {
          window._mp4Storage.clearSavedData(true);
        } else {
          const keys = [
            'mp4_customMarkers', 'mp4_saved_route', 'mp4_layerVisibility',
            'mp4_tileset', 'mp4_tileset_grayscale', 'mp4_grid_heatmap',
            'mp4_map_view', 'mp4_route_looping_flag', 'mp4_highlightMultiplier',
            'mp4_highlighted_layers', 'mp4_storage_consent'
          ];
          keys.forEach(key => {
            try {
              localStorage.removeItem(key);
            } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'SettingsController._clearSavedData.removeItem'); }
          });
        }
      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to clear saved data', 'SettingsController._clearAllSavedData', { error: e });
      }
    }

    /**
     * Update layer counts (delegate to map)
     */
    _updateLayerCounts() {
      try {
        if (this.map && typeof this.map.updateLayerCounts === 'function') {
          this.map.updateLayerCounts();
        }
      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to update layer counts', 'SettingsController._updateLayerCounts', { error: e });
      }
    }

    /**
     * Update sidebar handle emphasis based on consent status
     */
    _updateSidebarHandleEmphasis() {
      try {
        const consent = this._getStorageConsent();
        const handle = document.getElementById('sidebarHandle');
        if (handle) {
          handle.classList.toggle('emphasized', !consent);
        }
      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to update sidebar handle emphasis', 'SettingsController._updateSidebarHandleEmphasis', { error: e });
      }
    }

    /**
     * Load saved display settings and apply them
     */
    loadSavedSettings() {
      try {
        const consent = this._getStorageConsent();
        if (!consent) return;

        // Note: Tileset settings are loaded during map initialization in map.js
        // to avoid conflicts. This controller focuses on UI state management.

        // Update UI to reflect current map settings
        this._updateTilesetButtonStates();
        this._updateGrayscaleButtonState();
        this._updateGridHeatmapButtonState();

      } catch (e) {
        this.errorHandler.logDebug('SettingsController: Failed to load saved settings', 'SettingsController.loadSavedSettings', { error: e });
      }
    }
  }

  // Make globally available
  global.SettingsController = SettingsController;

})(typeof window !== 'undefined' ? window : this);