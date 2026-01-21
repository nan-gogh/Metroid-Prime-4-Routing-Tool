// controllers/SettingsController.js
// Handles settings controls: storage consent, tileset selection, grid/heatmap toggles

(function (global) {
  if (typeof globalThis.__MP4_NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.__MP4_NOOP_ERROR_HANDLER = { logDebug: function(){}, logWarning: function(){}, logError: function(){} };
  }

  class SettingsController {
    constructor(options) {
      // Required dependencies
      this.layerState = options.layerState;
      this.highlightState = options.highlightState;
      this.tilesetState = options.tilesetState;
      this.heatmapDisplayState = options.heatmapDisplayState;
      this.markerManager = options.markerManager;
      this.mapState = options.mapState;
      this.eventBus = options.eventBus;

      // Optional dependencies
      this.config = options.config || global.MP4Config || {};
      this.errorHandler = options.errorHandler || globalThis.__MP4_NOOP_ERROR_HANDLER;
      this.eventTypes = window.EventTypes || {};
      
      // REQUIRED managers for Phase 5 privacy features (core architecture)
      this.consentManager = options.consentManager;
      this.dataExportController = options.dataExportController;
      // Optional storage provider for dependency injection
      this.storageProvider = options.storageProvider || null;
      
      // Validate required managers
      if (!this.consentManager) {
        this.errorHandler.logWarning(
          'SettingsController: ConsentManager not provided (required)',
          'SettingsController.constructor'
        );
      }
      if (!this.dataExportController) {
        this.errorHandler.logWarning(
          'SettingsController: DataExportController not provided (required)',
          'SettingsController.constructor'
        );
      }
      
      // Optional map reference for operations that previously called map methods
      this.map = options.map || null;
      // Event listener cleanup
      this._eventUnsubscribers = [];
    }

    /**
     * Initialize settings controls
     */
    init() {
      this._bindStorageConsentToggle();
      this._bindTilesetControls();
      this._bindDisplayToggles();
      this._bindHighlightControls();
      this._bindEventListeners();
      this._bindDataExportControls();
      this._updateSidebarHandleEmphasis();
    }

    /**
     * Helper to obtain the underlying StorageService instance.
     * Prefers injected storageProvider, falls back to global getStorageService().
     */
    _getStorageInstance() {
      try {
        if (this.storageProvider && typeof this.storageProvider.getInstance === 'function') {
          return this.storageProvider.getInstance();
        }
        if (typeof getStorageService === 'function') return getStorageService();
      } catch (e) {
        // ignore and return null
      }
      return null;
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
              if (typeof NotificationUtils !== 'undefined' && NotificationUtils.confirmStorageConsentAsync) {
                const confirmed = await NotificationUtils.confirmStorageConsentAsync();
                if (!confirmed) {
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
              const clearConfirmed = await this._confirmClearDataAsync();
              if (!clearConfirmed) {
                this._updateConsentToggleUI(saveLabel, true);
                this._setStorageConsent(true);
              } else {
                this._clearAllSavedData();
                // Reload page after clearing
                try {
                  location.reload();
                } catch (e) {
                  this.errorHandler.logWarning('SettingsController: Failed to reload after clearing data', 'SettingsController._setStorageConsent.reload', { error: e });
                }
              }
            }

            // Update UI
            this._updateConsentToggleUI(saveLabel, on);
            this._updateSidebarHandleEmphasis();
          });
        }
      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to bind storage consent toggle', 'SettingsController._bindStorageConsentToggle', { error: e });
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
        this.errorHandler.logWarning('SettingsController: Failed to bind tileset controls', 'SettingsController._bindTilesetControls', { error: e });
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
            if (this.heatmapDisplayState) {
              // Toggle heatmap visibility via dedicated HeatmapDisplayState
              this.heatmapDisplayState.toggle();
              this._updateGridHeatmapButtonState();
            }
          });
          this._updateGridHeatmapButtonState();
        }

        // Grid toggle
        const gridToggleBtn = document.getElementById('gridToggleBtn');
        if (gridToggleBtn) {
          gridToggleBtn.addEventListener('click', () => {
            if (this.layerState) {
              // Toggle grid visibility via LayerState
              const newVisible = !this.layerState.isGridVisible();
              this.layerState.setGridVisible(newVisible);
              this._updateGridButtonState();
              this._saveDisplaySettings();
            }
          });
          this._updateGridButtonState();
        }

        // Grayscale toggle
        const tilesetGrayscaleBtn = document.getElementById('tilesetGrayscaleBtn');
        if (tilesetGrayscaleBtn) {
          tilesetGrayscaleBtn.addEventListener('click', () => {
            if (this.tilesetState) {
              const newGrayscale = !this.tilesetState.grayscale;
              this.tilesetState.setGrayscale(newGrayscale);
              this._updateGrayscaleButtonState();
              this._saveDisplaySettings();
              // Emit tileset grayscale changed event
              this.eventBus.emit(this.eventTypes.TILESET_GRAYSCALE_CHANGED, {
                grayscale: newGrayscale,
                triggeredBy: 'grayscale-toggle'
              });
            }
          });
          this._updateGrayscaleButtonState();
        }

      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to bind display toggles', 'SettingsController._bindDisplayToggles', { error: e });
      }
    }

    /**
     * Bind highlight scaling controls
     */
    _bindHighlightControls() {
      try {
        // Marker size slider
        const markerSlider = document.getElementById('markerSizeSlider');
        const markerLabel = document.getElementById('markerSizeValue');
        if (markerSlider && markerLabel) {
          let initial = (this.config && this.config.MARKER_SCALING) ? this.config.MARKER_SCALING.userScaleMultiplier : 1.0;
          markerSlider.value = initial;
          markerLabel.textContent = `${(initial * 100).toFixed(0)}%`;
          // Initial slider fill calculation
          try {
            if (markerSlider.offsetWidth && markerSlider.offsetWidth > 0) {
              const thumbOffsetPercent = (7 / markerSlider.offsetWidth) * 100;
              const fillPercent = Math.max(thumbOffsetPercent, Math.min(100 - thumbOffsetPercent, ((initial - 0.5) / (1.5 - 0.5)) * (100 - 2 * thumbOffsetPercent) + thumbOffsetPercent));
              markerSlider.style.setProperty('--slider-fill', fillPercent + '%');
            }
          } catch (e) {}

          const updateMarkerScale = (v, evTarget) => {
            let val = parseFloat(v) || 1.0;
            val = Math.max(0.5, Math.min(1.5, val));
            if (evTarget) evTarget.value = val;
            markerLabel.textContent = `${(val * 100).toFixed(0)}%`;
            // Update slider fill visualization
            try {
              const width = evTarget && evTarget.offsetWidth ? evTarget.offsetWidth : markerSlider.offsetWidth;
              if (width && width > 0) {
                const thumbOffsetPercent = (7 / width) * 100;
                const fillPercent = Math.max(thumbOffsetPercent, Math.min(100 - thumbOffsetPercent, ((val - 0.5) / (1.5 - 0.5)) * (100 - 2 * thumbOffsetPercent) + thumbOffsetPercent));
                if (evTarget) evTarget.style.setProperty('--slider-fill', fillPercent + '%');
                else markerSlider.style.setProperty('--slider-fill', fillPercent + '%');
              }
            } catch (e) {}
            // Emit storage/save request for marker scaling so authoritative handler persists it
            try {
              try { this.eventBus.emit(this.eventTypes.MARKER_SCALING_SAVE_REQUESTED, { userScaleMultiplier: val }); } catch (e) {}
              // Also update local config fallback so renderers pick up changes immediately
              if (this.config && this.config.MARKER_SCALING) this.config.MARKER_SCALING.userScaleMultiplier = val;
              // Request a render so marker renderer picks up new scale
              try { this.eventBus.emit(this.eventTypes.RENDER_REQUESTED); } catch (e) {}
            } catch (e) {
              this.errorHandler.logWarning('SettingsController: Failed to update marker scale', 'SettingsController._bindHighlightControls.markerScale', { error: e });
            }
          };

          markerSlider.addEventListener('input', (ev) => updateMarkerScale(ev.target.value, ev.target));

          markerSlider.addEventListener('change', (ev) => {
            try { updateMarkerScale(ev.target.value, ev.target); } catch (e) { this.errorHandler.logWarning('SettingsController: markerSize change failed', 'SettingsController._bindHighlightControls.markerChange', { error: e }); }
            try {
              // Trigger hover update for UX parity
              if (this.map && typeof this.map.checkMarkerHover === 'function') {
                if (typeof this.map.lastMouseX === 'number' && typeof this.map.lastMouseY === 'number') {
                  this.map.checkMarkerHover(this.map.lastMouseX, this.map.lastMouseY);
                } else {
                  const rect = this.map && this.map.canvas && this.map.canvas.getBoundingClientRect ? this.map.canvas.getBoundingClientRect() : null;
                  if (rect && this.map.checkMarkerHover) this.map.checkMarkerHover(rect.width / 2, rect.height / 2);
                }
              }
            } catch (e) { this.errorHandler.logWarning('SettingsController: markerSize change hover update failed', 'SettingsController._bindHighlightControls.markerChangeHover', { error: e }); }
          });
        }

        // Highlight scale slider (affects both HighlightState and marker highlight multiplier where applicable)
        const highlightSlider = document.getElementById('highlightScaleSlider');
        const highlightLabel = document.getElementById('highlightScaleValue');
        if (highlightSlider && highlightLabel) {
          // Prefer configured marker scaling (MP4Config) so slider defaults match app defaults;
          // fall back to HighlightState if config not available.
          let initial = (this.config && this.config.MARKER_SCALING && typeof this.config.MARKER_SCALING.highlightMultiplier === 'number') ?
            this.config.MARKER_SCALING.highlightMultiplier :
            ((this.highlightState && typeof this.highlightState.highlightScaleMultiplier === 'number') ? this.highlightState.highlightScaleMultiplier : 2.0);
          highlightSlider.value = initial;
          // Display a user-facing mapped value (legacy UI expectation)
          // Map internal highlight multiplier (1.5-2.5) to a user percent starting near 110%
          const displayInitial = Number(initial) - 0.4;
          highlightLabel.textContent = `${Math.round(displayInitial * 100)}%`;

          // Initial slider fill calculation
          try {
            if (highlightSlider.offsetWidth && highlightSlider.offsetWidth > 0) {
              const thumbOffsetPercent = (7 / highlightSlider.offsetWidth) * 100;
              const fillPercent = Math.max(thumbOffsetPercent, Math.min(100 - thumbOffsetPercent, ((initial - 1.5) / (2.5 - 1.5)) * (100 - 2 * thumbOffsetPercent) + thumbOffsetPercent));
              highlightSlider.style.setProperty('--slider-fill', fillPercent + '%');
            }
          } catch (e) {}

          const updateHighlight = (v, evTarget) => {
            let val = parseFloat(v) || 1.0;
            val = Math.max(1.5, Math.min(2.5, val));
            if (evTarget) evTarget.value = val;

            // Update UI label (legacy mapping)
            const display = Number(val) - 0.4;
            highlightLabel.textContent = `${Math.round(display * 100)}%`;

            try {
              if (this.highlightState && typeof this.highlightState.setHighlightScaleMultiplier === 'function') {
                this.highlightState.setHighlightScaleMultiplier(val);
              }
              // Emit storage/save request for highlight multiplier so authoritative handler persists it
              try { this.eventBus.emit(this.eventTypes.HIGHLIGHT_MULTIPLIER_SAVE_REQUESTED, { multiplier: val }); } catch (e) {}
              // Also update local config fallback so renderers pick up changes immediately
              if (this.config && this.config.MARKER_SCALING) this.config.MARKER_SCALING.highlightMultiplier = val;

              // Update slider fill visualization
              try {
                const width = evTarget && evTarget.offsetWidth ? evTarget.offsetWidth : highlightSlider.offsetWidth;
                if (width && width > 0) {
                  const thumbOffsetPercent = (7 / width) * 100;
                  const fillPercent = Math.max(thumbOffsetPercent, Math.min(100 - thumbOffsetPercent, ((val - 1.5) / (2.5 - 1.5)) * (100 - 2 * thumbOffsetPercent) + thumbOffsetPercent));
                  if (evTarget) evTarget.style.setProperty('--slider-fill', fillPercent + '%');
                  else highlightSlider.style.setProperty('--slider-fill', fillPercent + '%');
                }
              } catch (e) {}

              // Request persistence via EventBus where map listens
              try { this.eventBus.emit(this.eventTypes.HIGHLIGHT_MULTIPLIER_SAVE_REQUESTED, { multiplier: val }); } catch (e) {}

              // Request render so renderers pick up new settings
              try { this.eventBus.emit(this.eventTypes.RENDER_REQUESTED); } catch (e) {}
            } catch (e) {
              this.errorHandler.logWarning('SettingsController: Failed to update highlight scale', 'SettingsController._bindHighlightControls.highlightScale', { error: e });
            }
          };

          highlightSlider.addEventListener('input', (ev) => updateHighlight(ev.target.value, ev.target));

          highlightSlider.addEventListener('change', (ev) => {
            try { updateHighlight(ev.target.value, ev.target); } catch (e) { this.errorHandler.logWarning('SettingsController: highlight change failed', 'SettingsController._bindHighlightControls.highlightChange', { error: e }); }
            try {
              // Trigger hover update for UX parity
              if (this.map && typeof this.map.checkMarkerHover === 'function') {
                if (typeof this.map.lastMouseX === 'number' && typeof this.map.lastMouseY === 'number') {
                  this.map.checkMarkerHover(this.map.lastMouseX, this.map.lastMouseY);
                } else {
                  const rect = this.map && this.map.canvas && this.map.canvas.getBoundingClientRect ? this.map.canvas.getBoundingClientRect() : null;
                  if (rect && this.map.checkMarkerHover) this.map.checkMarkerHover(rect.width / 2, rect.height / 2);
                }
              }
            } catch (e) { this.errorHandler.logWarning('SettingsController: highlight change hover update failed', 'SettingsController._bindHighlightControls.highlightChangeHover', { error: e }); }
          });
        }

      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to bind highlight controls', 'SettingsController._bindHighlightControls', { error: e });
      }
    }

    /**
     * Bind event listeners for state changes
     */
    _bindEventListeners() {
      try {
        // Standardized event listener setup using EventUtils
        if (window.EventUtils && typeof window.EventUtils.setupEventListeners === 'function') {
          const unsubscribers = window.EventUtils.setupEventListeners(this.eventBus, [
            {
              event: this.eventTypes.DISPLAY_SETTINGS_CHANGED,
              handler: (data) => {
                try {
                  if (data && typeof data.gridVisible === 'boolean') {
                    this._updateGridButtonState();
                  }
                } catch (e) {
                  this.errorHandler.logWarning('SettingsController: Failed to handle DISPLAY_SETTINGS_CHANGED', 'SettingsController._bindEventListeners.DISPLAY_SETTINGS_CHANGED', { error: e });
                }
              }
            }
          ], this, this.errorHandler);

          // Store unsubscribers for cleanup
          if (Array.isArray(unsubscribers)) {
            this._eventUnsubscribers.push(...unsubscribers);
          }
        } else {
          // Fallback - store unsubscribe function
          const unsubscribe = this.eventBus.on(this.eventTypes.DISPLAY_SETTINGS_CHANGED, (data) => {
            try {
              if (data && typeof data.gridVisible === 'boolean') {
                this._updateGridButtonState();
              }
            } catch (e) {
              this.errorHandler.logWarning('SettingsController: Failed to handle DISPLAY_SETTINGS_CHANGED', 'SettingsController._bindEventListeners.DISPLAY_SETTINGS_CHANGED', { error: e });
            }
          });

          if (typeof unsubscribe === 'function') {
            this._eventUnsubscribers.push(unsubscribe);
          }
        }
      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to bind event listeners', 'SettingsController._bindEventListeners', { error: e });
      }
    }

    /**
     * Set the tileset and update UI
     * @param {string} tileset - 'sat' or 'holo'
     */
    _setTileset(tileset) {
      try {
        if (this.tilesetState) {
          this.tilesetState.setTileset(tileset);
          this._updateTilesetButtonStates();
          this._saveDisplaySettings();
          // Emit tileset changed event
          this.eventBus.emit(this.eventTypes.TILESET_CHANGED, {
            tileset: tileset,
            triggeredBy: 'tileset-selection'
          });
        }
      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to set tileset', 'SettingsController._setTileset', { tileset, error: e });
      }
    }

    /**
     * Update tileset button visual states
     */
    _updateTilesetButtonStates() {
      try {
        const tilesetSatBtn = document.getElementById('tilesetSatBtn');
        const tilesetHoloBtn = document.getElementById('tilesetHoloBtn');
        const currentTileset = this.tilesetState ? this.tilesetState.tileset : 'sat';

        if (tilesetSatBtn) {
          tilesetSatBtn.classList.toggle('active', currentTileset === 'sat');
        }
        if (tilesetHoloBtn) {
          tilesetHoloBtn.classList.toggle('active', currentTileset === 'holo');
        }
      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to update tileset button states', 'SettingsController._updateTilesetButtonStates', { error: e });
      }
    }

    /**
     * Update grid/heatmap button state
     */
    _updateGridHeatmapButtonState() {
      try {
        const gridHeatmapBtn = document.getElementById('gridHeatmapBtn');
        if (gridHeatmapBtn && this.heatmapDisplayState) {
          gridHeatmapBtn.classList.toggle('active', this.heatmapDisplayState.isVisible());
        }
      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to update grid/heatmap button state', 'SettingsController._updateGridHeatmapButtonState', { error: e });
      }
    }

    /**
     * Update grid button state
     */
    _updateGridButtonState() {
      try {
        const gridToggleBtn = document.getElementById('gridToggleBtn');
        if (gridToggleBtn && this.layerState) {
          gridToggleBtn.classList.toggle('active', this.layerState.isGridVisible());
        }
      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to update grid button state', 'SettingsController._updateGridButtonState', { error: e });
      }
    }

    /**
     * Update grayscale button state
     */
    _updateGrayscaleButtonState() {
      try {
        const tilesetGrayscaleBtn = document.getElementById('tilesetGrayscaleBtn');
        if (tilesetGrayscaleBtn && this.tilesetState) {
          tilesetGrayscaleBtn.classList.toggle('active', !!this.tilesetState.grayscale);
        }
      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to update grayscale button state', 'SettingsController._updateGrayscaleButtonState', { error: e });
      }
    }

    /**
     * Get current storage consent status
     * @returns {boolean} Whether storage consent is granted
     */
    _getStorageConsent() {
      try {
        const storage = this._getStorageInstance();
        if (storage && typeof storage.hasConsent === 'function') {
          return storage.hasConsent();
        } else if (storage && typeof storage.hasStorageConsent === 'function') {
          return storage.hasStorageConsent();
        }
        return false;
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
        const storage = this._getStorageInstance();
        if (storage && typeof storage.set === 'function') {
          if (consent) storage.set(this.config.STORAGE_KEYS.STORAGE_CONSENT, '1');
          else storage.remove && storage.remove(this.config.STORAGE_KEYS.STORAGE_CONSENT);
        } else if (storage && typeof storage.setStorageConsent === 'function') {
          storage.setStorageConsent(consent);
        }
      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to set storage consent', 'SettingsController._setStorageConsent', { error: e });
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
        this.errorHandler.logWarning('SettingsController: Failed to update consent toggle UI', 'SettingsController._updateConsentToggleUI', { error: e });
      }
    }

    /**
     * Async confirm clearing saved data
     * @returns {Promise<boolean>} Whether to proceed with clearing
     */
    async _confirmClearDataAsync() {
      try {
        if (typeof NotificationUtils !== 'undefined' && NotificationUtils.confirmClearDataAsync) {
          return await NotificationUtils.confirmClearDataAsync();
        }
        return await TaskScheduler.deferToNextTask(() => confirm('Clear all saved progress? This cannot be undone.'));
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
        if (this.highlightState) {
          this.highlightState.saveToStorage();
        }

        // Save layer visibility
        if (this.layerState) {
          this.layerState.saveToStorage();
        }

        // Save markers
        if (this.markerManager) {
          this.markerManager.saveToStorage();
        }

        // Save route (need routeManager - not currently injected)
        // TODO: Inject routeManager or emit event

        // Save view
        if (this.mapState) {
          this.mapState.saveToStorage();
        }

      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to save all settings', 'SettingsController._saveAllSettings', { error: e });
      }
    }

    /**
     * Save display-related settings
     */
    _saveDisplaySettings() {
      try {
        const settings = {
          tileset: this.tilesetState ? this.tilesetState.tileset : 'sat',
          tilesetGrayscale: this.tilesetState ? this.tilesetState.grayscale : false,
          gridVisible: this.layerState ? this.layerState.isGridVisible() : false
        };

        const storage = this._getStorageInstance();
        if (storage && typeof storage.set === 'function') {
          storage.set(this.config.STORAGE_KEYS.TILESET, settings.tileset);
          storage.set(this.config.STORAGE_KEYS.TILESET_GRAYSCALE, settings.tilesetGrayscale ? '1' : '0');
          storage.set(this.config.STORAGE_KEYS.GRID_VISIBLE, settings.gridVisible ? '1' : '0');
        } else if (storage && typeof storage.saveSetting === 'function') {
          storage.saveSetting('mp4_tileset', settings.tileset);
          storage.saveSetting('mp4_tileset_grayscale', settings.tilesetGrayscale ? '1' : '0');
          storage.saveSetting('mp4_grid_visible', settings.gridVisible ? '1' : '0');
        } else {
          // Fallback to global storage service
          const svc = this._getStorageInstance();
          if (svc && typeof svc.set === 'function') {
            svc.set('mp4_tileset', settings.tileset);
            svc.set('mp4_tileset_grayscale', settings.tilesetGrayscale ? '1' : '0');
            svc.set('mp4_grid_visible', settings.gridVisible ? '1' : '0');
          }
        }
      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to save display settings', 'SettingsController._saveDisplaySettings', { error: e });
      }
    }

    /**
     * Clear all saved data
     */
    _clearAllSavedData() {
      try {
        const storage = this._getStorageInstance();
        if (storage && typeof storage.remove === 'function') {
          // Clear all storage keys using StorageService
          const keys = Object.values(this.config.STORAGE_KEYS);
          keys.forEach(key => {
            try {
              storage.remove(key);
            } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'SettingsController._clearSavedData.removeItem'); }
          });
        } else if (storage && typeof storage.clearSavedData === 'function') {
          storage.clearSavedData(true);
        } else {
          // Fallback to global storage service
          const svc = this._getStorageInstance();
          const keys = [
            'mp4_customMarkers', 'mp4_saved_route', 'mp4_layerVisibility',
            'mp4_tileset', 'mp4_tileset_grayscale', 'mp4_grid_heatmap',
            'mp4_map_view', 'mp4_route_looping_flag', 'mp4_highlightMultiplier',
            'mp4_highlighted_layers', 'mp4_storage_consent'
          ];
          keys.forEach(key => {
            try {
              if (svc && typeof svc.remove === 'function') {
                svc.remove(key);
              }
            } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'SettingsController._clearSavedData.removeItem'); }
          });
        }
      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to clear saved data', 'SettingsController._clearAllSavedData', { error: e });
      }
    }

    /**
     * Update layer counts (delegate to map)
     */
    _updateLayerCounts() {
      try {
        // Emit layer counts changed event instead of direct call
        this.eventBus.emit(this.eventTypes.LAYER_COUNTS_CHANGED);
      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to emit layer counts changed event', 'SettingsController._updateLayerCounts', { error: e });
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
        this.errorHandler.logWarning('SettingsController: Failed to update sidebar handle emphasis', 'SettingsController._updateSidebarHandleEmphasis', { error: e });
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
        this.errorHandler.logWarning('SettingsController: Failed to load saved settings', 'SettingsController.loadSavedSettings', { error: e });
      }
    }

    /**
     * Bind data export controls (GDPR compliance - Phase 5 - CORE ARCHITECTURE)
     * ConsentManager and DataExportController are REQUIRED dependencies
     * @private
     */
    _bindDataExportControls() {
      try {
        // Verify required managers are available
        if (!this.dataExportController || !this.consentManager) {
          this.errorHandler.logWarning(
            'SettingsController: Cannot bind export controls - required managers missing',
            'SettingsController._bindDataExportControls'
          );
          return;
        }

        // Look for export data button
        const exportBtn = document.getElementById('exportDataButton');
        if (exportBtn) {
          exportBtn.addEventListener('click', async (ev) => {
            try {
              ev.preventDefault();
              this.errorHandler.logDebug('SettingsController: Export button clicked', 'SettingsController._bindDataExportControls.click');
              
              // Disable button during export
              exportBtn.disabled = true;
              exportBtn.textContent = 'Exporting...';
              
              // Trigger export and download
              const success = await this.dataExportController.downloadDataExportAsync();
              
              if (success) {
                this.errorHandler.logDebug('SettingsController: Data export successful', 'SettingsController._bindDataExportControls.success');
              } else {
                this.errorHandler.logWarning('SettingsController: Data export failed', 'SettingsController._bindDataExportControls.failed');
              }
              
              // Re-enable button
              exportBtn.disabled = false;
              exportBtn.textContent = 'Export Data (GDPR)';
            } catch (e) {
              this.errorHandler.logError(e, 'SettingsController._bindDataExportControls.click', { error: e });
              exportBtn.disabled = false;
              exportBtn.textContent = 'Export Data (GDPR)';
            }
          });
        }

        // Look for storage stats display
        const statsBtn = document.getElementById('storageStatsButton');
        if (statsBtn) {
          statsBtn.addEventListener('click', (ev) => {
            try {
              ev.preventDefault();
              const stats = this.dataExportController?.getStorageSizeStats?.();
              if (stats) {
                const message = `Storage Usage: ${stats.formattedUsed} / ${stats.formattedMax} (${stats.usedPercentage}%)`;
                this.errorHandler.logDebug('SettingsController: Storage stats', 'SettingsController._bindDataExportControls.stats', stats);
                if (typeof NotificationUtils !== 'undefined' && NotificationUtils.showInfoAsync) {
                  NotificationUtils.showInfoAsync(message);
                }
              }
            } catch (e) {
              this.errorHandler.logWarning('SettingsController: Failed to show storage stats', 'SettingsController._bindDataExportControls.stats', { error: e });
            }
          });
        }
      } catch (e) {
        this.errorHandler.logWarning('SettingsController: Failed to bind data export controls', 'SettingsController._bindDataExportControls', { error: e });
      }
    }

    /**
     * Clean up event listeners to prevent memory leaks
     */
    destroy() {
      try {
        // Unsubscribe all event listeners
        if (Array.isArray(this._eventUnsubscribers)) {
          for (const unsub of this._eventUnsubscribers) {
            if (typeof unsub === 'function') {
              unsub();
            }
          }
          this._eventUnsubscribers = [];
        }
        
        // Cleanup managers
        if (this.consentManager && typeof this.consentManager.destroy === 'function') {
          this.consentManager.destroy();
        }
        if (this.dataExportController && typeof this.dataExportController.destroy === 'function') {
          this.dataExportController.destroy();
        }
      } catch (e) {
        this.errorHandler && this.errorHandler.logWarning('SettingsController.destroy failed', 'SettingsController.destroy', { error: e });
      }
    }
  }

  // Make globally available
  global.SettingsController = SettingsController;

})(typeof window !== 'undefined' ? window : this);
