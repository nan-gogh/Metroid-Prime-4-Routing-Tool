// controllers/LayerListController.js
// Handles dynamic layer list creation, toggle events, swipe gestures, and highlight controls

(function (global) {
  class LayerListController {
    constructor(options) {
      // Required dependencies
      this.layerState = options.layerState;
      this.highlightState = options.highlightState;
      this.eventBus = options.eventBus;

      // Optional dependencies
      this.config = options.config || global.MP4Config || {};
      this.errorHandler = options.errorHandler || (typeof global.errorHandler !== 'undefined' ? global.errorHandler : null);
      this.eventTypes = window.EventTypes || {};

      // Gesture tracking state
      this._gestureActive = false;
      this._gesturePointerId = null;
      this._gestureToggled = new Set();

      // Pending/batched layer toggle applier (RAF) and debounced storage saver
      this._pendingLayerToggles = {};
      this._layerToggleRaf = null;
      this._layerToggleSaveTimeout = null;

      // Bind methods
      this._scheduleApplyLayerToggles = this._scheduleApplyLayerToggles.bind(this);
      this._scheduleSaveLayerVisibility = this._scheduleSaveLayerVisibility.bind(this);
      this._endGesture = this._endGesture.bind(this);
    }

    /**
     * Initialize layer list controls
     */
    async init() {
      this._createLayerRows();
      this._bindLayerToggleEvents();
      this._bindSwipeGestures();
      this._bindHighlightControls();
    }

    /**
     * Create layer toggle rows from LAYERS data
     */
    _createLayerRows() {
      const container = document.getElementById('layerList');
      if (!container) return;
      container.innerHTML = '';

      const layerEntries = Object.entries(global.LAYERS || {});
      const savedVisibility = this._loadLayerVisibilityFromStorage() || {};

      // Ensure route layer always appears at the top of the list
      const preferred = ['route'];
      const orderedEntries = [];

      // Push route first if it exists
      const routeIdx = layerEntries.findIndex(e => e[0] === 'route');
      if (routeIdx >= 0) orderedEntries.push(layerEntries[routeIdx]);

      // Place `customMarkers` immediately after `route` when present
      const customIdx = layerEntries.findIndex(e => e[0] === 'customMarkers');
      if (customIdx >= 0) orderedEntries.push(layerEntries[customIdx]);

      // Collect all static layers (excluding route and customMarkers) and add them in REVERSED order
      const staticLayers = [];
      for (let i = 0; i < layerEntries.length; i++) {
        const k = layerEntries[i][0];
        if (k === 'route' || k === 'customMarkers') continue;
        staticLayers.push(layerEntries[i]);
      }

      // Add static layers in reversed order to sidebar (but rendering stays original order)
      for (let i = staticLayers.length - 1; i >= 0; i--) {
        orderedEntries.push(staticLayers[i]);
      }

      orderedEntries.forEach(([layerKey, layer]) => {
        this._createLayerRow(container, layerKey, layer, savedVisibility);
      });
    }

    /**
     * Create a single layer row element
     */
    _createLayerRow(container, layerKey, layer, savedVisibility) {
      // Root row as a button (replaces hidden checkbox + label for reliable mobile toggles)
      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'layer-toggle';
      label.dataset.layer = layerKey;

      // Determine initial checked state: preference order -> saved storage -> runtime map state -> default false
      const initialChecked = (savedVisibility && Object.prototype.hasOwnProperty.call(savedVisibility, layerKey))
        ? !!savedVisibility[layerKey]
        : !!(this.layerState && this.layerState.isLayerVisible(layerKey));

      // Reflect active visual state on the row
      if (initialChecked) label.classList.add('active');
      label.setAttribute('aria-pressed', initialChecked ? 'true' : 'false');

      // Icon
      const iconDiv = document.createElement('div');
      iconDiv.className = 'layer-icon';
      if (layer.icon) iconDiv.textContent = layer.icon;
      if (layer.color) iconDiv.style.backgroundColor = layer.color;
      // Allow a separate icon color (useful for white icons on colored backdrops)
      if (layer.iconColor) iconDiv.style.color = layer.iconColor;

      label.appendChild(iconDiv);

      // Info
      const info = document.createElement('div');
      info.className = 'layer-info';
      const nameDiv = document.createElement('div');
      nameDiv.className = 'layer-name';
      nameDiv.textContent = layer.name || layerKey;
      const countDiv = document.createElement('div');
      countDiv.className = 'layer-count';

      // Count span id strategy: use `${layerKey}Count` to be predictable; special-case 'route' -> 'routeLength'
      const countSpan = document.createElement('span');
      countSpan.id = (layerKey === 'route') ? 'routeLength' : `${layerKey}Count`;
      if (layer.markerCountText) {
        countSpan.textContent = layer.markerCountText;
      } else if (Array.isArray(layer.markers)) {
        const configuredMax = (typeof layer.maxMarkers === 'number')
          ? layer.maxMarkers
          : (this.layerState && this.layerState.layerConfig && this.layerState.layerConfig[layerKey] && this.layerState.layerConfig[layerKey].maxMarkers);
        if (typeof configuredMax === 'number') {
          countSpan.textContent = `${layer.markers.length} / ${configuredMax}`;
        } else {
          countSpan.textContent = `${layer.markers.length}`;
        }
      } else {
        countSpan.textContent = '';
      }

      countDiv.appendChild(countSpan);
      // Optional suffix like "markers" or "length" (configurable per-layer)
      if (layer && layer.countSuffix) {
        countDiv.appendChild(document.createTextNode(' ' + layer.countSuffix));
      } else if (layerKey === 'route') {
        // Route shows length (not a count)
        countDiv.appendChild(document.createTextNode(' length'));
      } else if (Array.isArray(layer.markers)) {
        // Default suffix for data layers that expose a markers array
        countDiv.appendChild(document.createTextNode(' markers'));
      }

      info.appendChild(nameDiv);
      info.appendChild(countDiv);
      label.appendChild(info);

      // Append to container
      container.appendChild(label);

      // Ensure icon backdrop reflects any pre-existing highlighted state (e.g. loaded from storage)
      this._updateHighlightVisuals(iconDiv, label, layerKey, layer);
    }

    /**
     * Bind layer toggle events (clicks, touches)
     */
    _bindLayerToggleEvents() {
      const layerToggles = document.querySelectorAll('#layerList .layer-toggle');
      layerToggles.forEach(label => {
        const layerKey = label.dataset.layer;

        // Pointer down for immediate toggle
        label.addEventListener('pointerdown', (ev) => {
          this._handleLayerTogglePointerDown(ev, label, layerKey);
        });

        // Touch event prevention for mobile
        try {
          label.addEventListener('touchstart', (ev) => {
            try { ev.preventDefault(); } catch (e) {
              this._logError(e, 'LayerListController._bindLayerToggleEvents.touchstart.preventDefault');
            }
          }, { passive: false });
          label.addEventListener('touchmove', (ev) => {
            try { ev.preventDefault(); } catch (e) {
              this._logError(e, 'LayerListController._bindLayerToggleEvents.touchmove.preventDefault');
            }
          }, { passive: false });
        } catch (e) {
          this._logError(e, 'LayerListController._bindLayerToggleEvents.touchEventListeners');
        }
      });
    }

    /**
     * Bind swipe gesture handling for cross-row toggles
     */
    _bindSwipeGestures() {
      document.addEventListener('pointermove', (ev) => {
        this._handleSwipePointerMove(ev);
      }, { passive: true });

      document.addEventListener('pointerup', this._endGesture, { passive: true });
      document.addEventListener('pointercancel', this._endGesture, { passive: true });
    }

    /**
     * Bind highlight controls (icon clicks)
     */
    _bindHighlightControls() {
      const layerIcons = document.querySelectorAll('#layerList .layer-icon');
      layerIcons.forEach(iconDiv => {
        // Prevent pointer/touch on the icon backdrop from bubbling to the row
        try {
          iconDiv.addEventListener('pointerdown', (ev) => {
            try { ev.stopPropagation(); } catch (e) { this._logError(e, 'LayerListController._bindHighlightControls.pointerdown.stopPropagation'); }
          });
          iconDiv.addEventListener('touchstart', (ev) => {
            try { ev.stopPropagation(); } catch (e) { this._logError(e, 'LayerListController._bindHighlightControls.touchstart.stopPropagation'); }
          }, { passive: true });
        } catch (e) { this._logError(e, 'LayerListController._bindHighlightControls.eventListeners'); }

        const _handleIconActivate = (ev) => {
          this._handleIconClick(ev, iconDiv);
        };

        try {
          iconDiv._lastActivate = 0;
        } catch (e) { this._logError(e, 'LayerListController._bindHighlightControls.setLastActivate'); }

        try {
          iconDiv.addEventListener('click', (ev) => {
            try {
              const last = iconDiv._lastActivate || 0;
              if (Date.now() - last < 500) return;
              _handleIconActivate(ev);
            } catch (e) { this._logError(e, 'LayerListController._bindHighlightControls.click.handler'); }
          });
        } catch (e) { this._logError(e, 'LayerListController._bindHighlightControls.click.listener'); }

        try {
          iconDiv.addEventListener('pointerup', (ev) => {
            try {
              if (ev && ev.preventDefault) ev.preventDefault();
              if (ev && ev.stopPropagation) ev.stopPropagation();
              iconDiv._lastActivate = Date.now();
              _handleIconActivate(ev);
            } catch (e) { this._logError(e, 'LayerListController._bindHighlightControls.pointerup.handler'); }
          });
        } catch (e) { this._logError(e, 'LayerListController._bindHighlightControls.pointerup.listener'); }
      });
    }

    /**
     * Handle pointer down on layer toggle
     */
    _handleLayerTogglePointerDown(ev, label, layerKey) {
      try {
        // Only track primary pointers
        if (ev.isPrimary === false) return;
        try { ev.preventDefault(); } catch (e) { this._logError(e, 'LayerListController._handleLayerTogglePointerDown.preventDefault'); }

        // Temporarily disable sidebar scrolling while interacting with layer rows
        const controlsEl = document.querySelector('.controls');
        try { if (controlsEl) controlsEl.style.touchAction = 'none'; } catch (e) { this._logError(e, 'LayerListController._handleLayerTogglePointerDown.touchAction'); }

        this._gestureActive = true;
        this._gesturePointerId = ev.pointerId;
        this._gestureToggled.add(label);

        const checked = !label.classList.contains('active');

        // Immediate visual feedback for responsiveness
        try { label.classList.toggle('active', checked); } catch (e) {
          this._logError(e, 'LayerListController._handleLayerTogglePointerDown.toggleActive');
        }
        try { label.setAttribute('aria-pressed', checked ? 'true' : 'false'); } catch (e) {
          this._logError(e, 'LayerListController._handleLayerTogglePointerDown.setAttribute');
        }

        // Visibility update is handled by the LAYER_VISIBILITY_CHANGED event listener

        // If turning off a layer that's in edit mode, exit edit mode after visibility is updated
        if (!checked) {
          try { this._exitEditModeForLayer(layerKey); } catch (e) {
            this._logError(e, 'LayerListController._exitEditModeForLayer.pointerdown');
          }
        }

        // Queue the heavier work to RAF to batch rapid toggles
        try { this._pendingLayerToggles[layerKey] = !!checked; this._scheduleApplyLayerToggles(); } catch (e) {
          this._logError(e, 'LayerListController._scheduleApplyLayerToggles.pointerdown');
        }

        // Debounced save to storage
        try { this._scheduleSaveLayerVisibility(); } catch (e) {
          this._logError(e, 'LayerListController._scheduleSaveLayerVisibility.pointerdown');
        }
      } catch (e) {
        this._logError(e, 'LayerListController._handleLayerTogglePointerDown');
      }
    }

    /**
     * Handle swipe pointer move across rows
     */
    _handleSwipePointerMove(ev) {
      try {
        if (!this._gestureActive || ev.pointerId !== this._gesturePointerId) return;
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        if (!el) return;
        const row = (typeof el.closest === 'function') ? el.closest('.layer-toggle') : null;
        if (!row) return;
        if (this._gestureToggled.has(row)) return;
        this._gestureToggled.add(row);

        const k = row.dataset && row.dataset.layer;
        const willChecked = !row.classList.contains('active');

        try { row.classList.toggle('active', willChecked); } catch (e) {
          this._logError(e, 'LayerListController._handleSwipePointerMove.toggleActive');
        }
        try { row.setAttribute('aria-pressed', willChecked ? 'true' : 'false'); } catch (e) {
          this._logError(e, 'LayerListController._handleSwipePointerMove.setAttribute');
        }
        // Visibility update is handled by the LAYER_VISIBILITY_CHANGED event listener

        // If turning off a layer that's in edit mode, exit edit mode after visibility is updated
        if (!willChecked) {
          try { this._exitEditModeForLayer(k); } catch (e) {
            this._logError(e, 'LayerListController._handleSwipePointerMove.exitEdit');
          }
        }

        try { this._pendingLayerToggles[k] = !!willChecked; this._scheduleApplyLayerToggles(); } catch (e) {
          this._logError(e, 'LayerListController._handleSwipePointerMove.scheduleApply');
        }
        try { this._scheduleSaveLayerVisibility(); } catch (e) {
          this._logError(e, 'LayerListController._handleSwipePointerMove.scheduleSave');
        }
      } catch (e) {
        this._logError(e, 'LayerListController._handleSwipePointerMove');
      }
    }

    /**
     * Handle icon click for layer highlighting
     */
    _handleIconClick(ev, iconDiv) {
      try { if (ev && ev.stopPropagation) ev.stopPropagation(); } catch (e) {
        this._logError(e, 'LayerListController._handleIconClick.stopPropagation');
      }

      try {
        const label = iconDiv.closest('.layer-toggle');
        const k = label && label.dataset && label.dataset.layer;
        if (!k) return;

        if (this.highlightState && typeof this.highlightState.toggleLayerHighlight === 'function') {
          const layer = global.LAYERS && global.LAYERS[k];
          this.highlightState.toggleLayerHighlight(k);
          this._handleHighlightFlow(k, layer, label);
        } else {
          this._handleLegacyHighlight(k, iconDiv, label);
        }
        this._updateHighlightVisuals(iconDiv, label, k, global.LAYERS && global.LAYERS[k]);
      } catch (e) {
        this._logError(e, 'LayerListController._handleIconClick');
      }
    }

    /**
     * Handle highlight flow for modern map API
     */
    _handleHighlightFlow(k, layer, label) {
      try {
        if (this.highlightState && this.highlightState.isLayerHighlighted(k)) {
          if (!this.layerState || !this.layerState.isLayerVisible(k)) {
            if (this.layerState && typeof this.layerState.setLayerVisible === 'function') {
              try { this.layerState.setLayerVisible(k, true); } catch (e) { /* suppressed */ }
            }
          }
          this._updateRowUIAfterHighlight(k);
          try { this._scheduleSaveLayerVisibility(); } catch (e) {
            this._logError(e, 'LayerListController._handleHighlightFlow.saveLayers');
          }
        }
      } catch (e) {
        this._logError(e, 'LayerListController._handleHighlightFlow');
      }
    }

    /**
     * Handle legacy highlight system
     */
    _handleLegacyHighlight(k, iconDiv, label) {
      if (this.highlightState) {
        this.highlightState.toggleLayerHighlight(k);
      }
      // Emit events instead of direct render call
      this.eventBus.emit(this.eventTypes.LAYER_HIGHLIGHT_CHANGED, {
        highlightedLayers: this.highlightState ? Array.from(this.highlightState.highlightedLayers) : [],
        triggeredBy: 'legacy-highlight'
      });
      this.eventBus.emit(this.eventTypes.RENDER_REQUESTED);
    }

    /**
     * Update row UI after highlight activation
     */
    _updateRowUIAfterHighlight(k) {
      try {
        const row = document.querySelector('#layerList .layer-toggle[data-layer="' + k + '"]');
        if (row) {
          row.classList.add('active');
          row.setAttribute('aria-pressed', 'true');
        }
      } catch (e) {
        this._logError(e, 'LayerListController._updateRowUIAfterHighlight');
      }
    }

    /**
     * Update highlight visual effects
     */
    _updateHighlightVisuals(iconDiv, label, layerKey, layer) {
      try {
        const isHighlighted = !!(this.highlightState && this.highlightState.isLayerHighlighted(layerKey));
        try { iconDiv.classList.toggle('highlighted', isHighlighted); } catch (e) { this._logError(e, 'LayerListController._updateHighlightVisuals.iconClassToggle'); }
        try { label.classList.toggle('has-inline-highlight', isHighlighted); } catch (e) { this._logError(e, 'LayerListController._updateHighlightVisuals.labelClassToggle'); }
        try {
          if (isHighlighted) {
            const col = (layer && layer.color) ? layer.color : iconDiv.style.backgroundColor;
            label.style.setProperty('--layer-inline-highlight-color', col);
            const glow1 = this._colorToRgba(col, 0.72) || 'rgba(34,211,238,0.72)';
            const glow2 = this._colorToRgba(col, 0.32) || 'rgba(34,211,238,0.32)';
            iconDiv.style.boxShadow = `0 0 12px ${glow1}, 0 0 28px ${glow2}`;
          } else {
            label.style.removeProperty('--layer-inline-highlight-color');
            iconDiv.style.boxShadow = '';
          }
        } catch (e) { this._logError(e, 'LayerListController._updateHighlightVisuals.styleUpdate'); }
      } catch (e) {
        this._logError(e, 'LayerListController._updateHighlightVisuals');
      }
    }

    /**
     * Schedule layer toggle application via RAF
     */
    _scheduleApplyLayerToggles() {
      if (this._layerToggleRaf) return;
      this._layerToggleRaf = requestAnimationFrame(() => {
        const toApply = this._pendingLayerToggles;
        this._pendingLayerToggles = {};
        this._layerToggleRaf = null;
        try {
          // Apply each pending toggle via the layerState
          for (const [k, v] of Object.entries(toApply)) {
            try {
              if (this.layerState) {
                // Special handling for grid layer
                if (k === 'grid' && typeof this.layerState.setGridVisible === 'function') {
                  this.layerState.setGridVisible(v);
                } else if (typeof this.layerState.setLayerVisible === 'function') {
                  this.layerState.setLayerVisible(k, v);
                }
              }
            } catch (e) { this._logError(e, 'LayerListController._scheduleApplyLayerToggles.applyToggle'); }
          }
        } catch (e) { this._logError(e, 'LayerListController._scheduleApplyLayerToggles'); }
      });
    }

    /**
     * Schedule debounced save to storage
     */
    _scheduleSaveLayerVisibility() {
      try { if (this._layerToggleSaveTimeout) clearTimeout(this._layerToggleSaveTimeout); } catch (e) {
        this._logError(e, 'LayerListController._scheduleSaveLayerVisibility.clearTimeout');
      }
      this._layerToggleSaveTimeout = setTimeout(() => {
        try {
          const layerVisibility = this.layerState ? this.layerState.layerVisibility : {};
          this._saveLayerVisibilityToStorage(layerVisibility);
        } catch (e) {
          this._logError(e, 'LayerListController._scheduleSaveLayerVisibility.saveStorage');
        }
        this._layerToggleSaveTimeout = null;
      }, 300);
    }

    /**
     * End gesture tracking
     */
    _endGesture(ev) {
      try {
        if (!this._gestureActive) return;
        if (ev && ev.pointerId && ev.pointerId !== this._gesturePointerId) return;
      } catch (e) { this._logError(e, 'LayerListController._endGesture.guard'); }
      this._gestureActive = false;
      this._gesturePointerId = null;
      try { this._gestureToggled.clear(); } catch (e) { this._logError(e, 'LayerListController._endGesture.clearToggled'); }
      const controlsEl = document.querySelector('.controls');
      try { if (controlsEl) controlsEl.style.touchAction = 'manipulation'; } catch (e) { this._logError(e, 'LayerListController._endGesture.touchAction'); }
    }

    /**
     * Convert hex color or rgb(...) strings to rgba(r,g,b,a)
     */
    _colorToRgba(color, alpha) {
      try {
        if (!color) return null;
        const c = String(color).trim();
        if (c.startsWith('#')) {
          let s = c.replace('#','');
          if (s.length === 3) s = s.split('').map(ch => ch+ch).join('');
          if (s.length === 6 || s.length === 8) {
            const r = parseInt(s.slice(0,2),16);
            const g = parseInt(s.slice(2,4),16);
            const b = parseInt(s.slice(4,6),16);
            const aHex = (s.length === 8) ? parseInt(s.slice(6,8),16)/255 : 1;
            const a = (typeof alpha === 'number') ? alpha * aHex : aHex;
            return `rgba(${r}, ${g}, ${b}, ${a})`;
          }
        }
        // rgb/rgba input: try to extract numbers
        const m = c.match(/rgba?\(([^)]+)\)/i);
        if (m) {
          const parts = m[1].split(',').map(p=>p.trim());
          const r = parseInt(parts[0]) || 0;
          const g = parseInt(parts[1]) || 0;
          const b = parseInt(parts[2]) || 0;
          let a = 1;
          if (parts.length >= 4) a = parseFloat(parts[3]) || 1;
          a = (typeof alpha === 'number') ? alpha * a : a;
          return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        return null;
      } catch (e) { return null; }
    }

    /**
     * Load layer visibility from storage
     */
    _loadLayerVisibilityFromStorage() {
      try {
        if (typeof global.loadLayerVisibilityFromStorage === 'function') {
          return global.loadLayerVisibilityFromStorage();
        }
        // Fallback if function not available
        return null;
      } catch (e) {
        this._logError(e, 'LayerListController._loadLayerVisibilityFromStorage');
        return null;
      }
    }

    /**
     * Save layer visibility to storage
     */
    _saveLayerVisibilityToStorage(obj) {
      try {
        this.eventBus.emit(EventTypes.LAYER_VISIBILITY_SAVE_REQUESTED, {
          layerVisibility: obj
        });
      } catch (e) {
        this._logError(e, 'LayerListController._saveLayerVisibilityToStorage');
      }
    }

    /**
     * Exit edit mode for a layer
     */
    _exitEditModeForLayer(layerKey) {
      try {
        this.eventBus.emit(EventTypes.EDIT_MODE_EXIT_REQUESTED, { mode: layerKey });
      } catch (e) {
        this._logError(e, 'LayerListController._exitEditModeForLayer');
      }
    }

    /**
     * Log error with context
     */
    _logError(error, context) {
      this.errorHandler.logError(error, `LayerListController.${context}`);
    }
  }

  // Export to global scope
  global.LayerListController = LayerListController;

})(typeof window !== 'undefined' ? window : global);