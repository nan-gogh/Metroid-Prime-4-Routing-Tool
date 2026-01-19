// controllers/SettingsController.js
// Handles settings controls: storage consent, tileset selection, grid/heatmap toggles

(function (global) {
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
      this.errorHandler = options.errorHandler || null;
      this.eventTypes = window.EventTypes || {};
      
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
                  console.debug('SettingsController: Failed to reload after clearing data', 'SettingsController._setStorageConsent.reload', { error: e });
                }
              }
            }

            // Update UI
            this._updateConsentToggleUI(saveLabel, on);
            this._updateSidebarHandleEmphasis();
          });
        }
      } catch (e) {
        console.debug('SettingsController: Failed to bind storage consent toggle', 'SettingsController._bindStorageConsentToggle', { error: e });
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
        console.debug('SettingsController: Failed to bind tileset controls', 'SettingsController._bindTilesetControls', { error: e });
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
        console.debug('SettingsController: Failed to bind display toggles', 'SettingsController._bindDisplayToggles', { error: e });
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
              console.debug('SettingsController: Failed to update marker scale', 'SettingsController._bindHighlightControls.markerScale', { error: e });
            }
          };

          markerSlider.addEventListener('input', (ev) => updateMarkerScale(ev.target.value, ev.target));

          markerSlider.addEventListener('change', (ev) => {
            try { updateMarkerScale(ev.target.value, ev.target); } catch (e) { console.debug('SettingsController: markerSize change failed', 'SettingsController._bindHighlightControls.markerChange', { error: e }); }
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
            } catch (e) { console.debug('SettingsController: markerSize change hover update failed', 'SettingsController._bindHighlightControls.markerChangeHover', { error: e }); }
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
              console.debug('SettingsController: Failed to update highlight scale', 'SettingsController._bindHighlightControls.highlightScale', { error: e });
            }
          };

          highlightSlider.addEventListener('input', (ev) => updateHighlight(ev.target.value, ev.target));

          highlightSlider.addEventListener('change', (ev) => {
            try { updateHighlight(ev.target.value, ev.target); } catch (e) { console.debug('SettingsController: highlight change failed', 'SettingsController._bindHighlightControls.highlightChange', { error: e }); }
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
            } catch (e) { console.debug('SettingsController: highlight change hover update failed', 'SettingsController._bindHighlightControls.highlightChangeHover', { error: e }); }
          });
        }

      } catch (e) {
        console.debug('SettingsController: Failed to bind highlight controls', 'SettingsController._bindHighlightControls', { error: e });
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
                  console.debug('SettingsController: Failed to handle DISPLAY_SETTINGS_CHANGED', 'SettingsController._bindEventListeners.DISPLAY_SETTINGS_CHANGED', { error: e });
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
              console.debug('SettingsController: Failed to handle DISPLAY_SETTINGS_CHANGED', 'SettingsController._bindEventListeners.DISPLAY_SETTINGS_CHANGED', { error: e });
            }
          });

          if (typeof unsubscribe === 'function') {
            this._eventUnsubscribers.push(unsubscribe);
          }
        }
      } catch (e) {
        console.debug('SettingsController: Failed to bind event listeners', 'SettingsController._bindEventListeners', { error: e });
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
        console.debug('SettingsController: Failed to set tileset', 'SettingsController._setTileset', { tileset, error: e });
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
        console.debug('SettingsController: Failed to update tileset button states', 'SettingsController._updateTilesetButtonStates', { error: e });
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
        console.debug('SettingsController: Failed to update grid/heatmap button state', 'SettingsController._updateGridHeatmapButtonState', { error: e });
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
        console.debug('SettingsController: Failed to update grid button state', 'SettingsController._updateGridButtonState', { error: e });
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
        console.debug('SettingsController: Failed to update grayscale button state', 'SettingsController._updateGrayscaleButtonState', { error: e });
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
        console.debug('SettingsController: Failed to set storage consent', 'SettingsController._setStorageConsent', { error: e });
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
        console.debug('SettingsController: Failed to update consent toggle UI', 'SettingsController._updateConsentToggleUI', { error: e });
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
        console.debug('SettingsController: Failed to save all settings', 'SettingsController._saveAllSettings', { error: e });
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

        if (window.storageService) {
          window.storageService.set(this.config.STORAGE_KEYS.TILESET, settings.tileset);
          window.storageService.set(this.config.STORAGE_KEYS.TILESET_GRAYSCALE, settings.tilesetGrayscale ? '1' : '0');
          window.storageService.set(this.config.STORAGE_KEYS.GRID_VISIBLE, settings.gridVisible ? '1' : '0');
        } else if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
          window._mp4Storage.saveSetting('mp4_tileset', settings.tileset);
          window._mp4Storage.saveSetting('mp4_tileset_grayscale', settings.tilesetGrayscale ? '1' : '0');
          window._mp4Storage.saveSetting('mp4_grid_visible', settings.gridVisible ? '1' : '0');
        } else {
          localStorage.setItem('mp4_tileset', settings.tileset);
          localStorage.setItem('mp4_tileset_grayscale', settings.tilesetGrayscale ? '1' : '0');
          localStorage.setItem('mp4_grid_visible', settings.gridVisible ? '1' : '0');
        }
      } catch (e) {
        console.debug('SettingsController: Failed to save display settings', 'SettingsController._saveDisplaySettings', { error: e });
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
        console.debug('SettingsController: Failed to clear saved data', 'SettingsController._clearAllSavedData', { error: e });
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
        console.debug('SettingsController: Failed to emit layer counts changed event', 'SettingsController._updateLayerCounts', { error: e });
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
        console.debug('SettingsController: Failed to update sidebar handle emphasis', 'SettingsController._updateSidebarHandleEmphasis', { error: e });
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
        console.debug('SettingsController: Failed to load saved settings', 'SettingsController.loadSavedSettings', { error: e });
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
      } catch (e) {
        this.errorHandler && console.debug('SettingsController.destroy failed', 'SettingsController.destroy', { error: e });
      }
    }
  }

  // Make globally available
  global.SettingsController = SettingsController;

})(typeof window !== 'undefined' ? window : this);
