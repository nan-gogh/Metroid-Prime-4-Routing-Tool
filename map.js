// Pure Canvas-based Interactive Map

class InteractiveMap {
    constructor(canvasId) {
        // Overlay canvas (interactive) — keep `this.canvas`/`this.ctx` for
        // backwards compatibility with existing code.
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // Background tile canvas (non-interactive). May be null if the
        // element is not present; later tasks will render tiles into this
        // context and leave the overlay for routes/markers.
        this.canvasTiles = document.getElementById('mapTiles');
        this.ctxTiles = this.canvasTiles ? this.canvasTiles.getContext('2d') : null;
        // Heatmap canvas (optional) sits above tiles but beneath overlay markers
        this.canvasHeatmap = document.getElementById('heatmapCanvas');
        this.ctxHeatmap = this.canvasHeatmap ? this.canvasHeatmap.getContext('2d') : null;

        // Initialize state managers
        this.mapState = new MapState(MP4Config);
        this.selectionState = new SelectionState(MP4Config);
        this.editModeState = new EditModeState(MP4Config);
        this.highlightState = new HighlightState(MP4Config);
        this.tilesetState = new TilesetState(MP4Config);
        this.routeState = new RouteState(MP4Config);
        this.routeAnimationState = new RouteAnimationState(MP4Config);
        this.routeEditState = new RouteEditState({ eventBus: this.eventBus, errorHandler: this.errorHandler });
        this.layerState = new LayerState(Object.keys(LAYERS || {}), MP4Config);
        this.imageState = new ImageState(MP4Config, this.tilesetState, this.mapState);

        // Initialize error handler
        this.errorHandler = typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler();

        // Initialize canvas dimensions for mapState
        if (this.mapState) {
            this.mapState.setCanvasSize(this.canvas.width, this.canvas.height, window.devicePixelRatio || 1);
        }

        // Create managers BEFORE renderers so renderers can access them
        if (typeof MarkerManager !== 'undefined' && typeof StorageInterface !== 'undefined' && typeof NotificationInterface !== 'undefined') {
            this.markerManager = new MarkerManager(
                { maxMarkers: 50, layerPrefix: 'cm' },
                StorageInterface,
                NotificationInterface
            );
        }
        // Create RouteManager
        try {
            if (typeof RouteManager !== 'undefined') {
                this.routeManager = new RouteManager(
                    this.markerManager,
                    StorageInterface,
                    NotificationInterface,
                    eventBus
                );
            }
        } catch (e) {
                this.errorHandler.logError(e, 'RouteManager creation failed');
                // Continue without route manager - markers still work
            }

        // Initialize routeState with current route looping (after routeManager is created)
        if (this.routeState) {
            this.routeState.setRouteLooping(this.routeLooping || false);
        }

        // Set up ImageState callback for renderer dirty marking
        if (this.imageState) {
            this.imageState.setOnMarkRendererDirty((rendererName) => {
                this.markRendererDirty(rendererName);
            });
        }

        try {
            if (typeof TileRenderer !== 'undefined') {
                this.tileRenderer = new TileRenderer(this.mapState, this.tilesetState, this.imageState, MP4Config, { lowSpec: this._lowSpec });
                try { this.tileRenderer.init(); } catch (e) { moduleErrorHandler.logDebug('TileRenderer.init failed', 'InteractiveMap.init.tileRenderer', { error: e }); }
            }
            if (typeof HeatmapRenderer !== 'undefined') {
                // Create layer config for heatmap rendering
                const layerConfig = {};
                if (typeof LAYERS !== 'undefined') {
                    Object.keys(LAYERS).forEach(key => {
                        layerConfig[key] = { ...LAYERS[key] };
                    });
                }
                this.heatmapRenderer = new HeatmapRenderer(this.mapState, this.layerState, MP4Config, layerConfig, GREEN_CRYSTAL_LAYERS);
                try { this.heatmapRenderer.init(); } catch (e) { moduleErrorHandler.logDebug('HeatmapRenderer.init failed', 'InteractiveMap.init.heatmapRenderer', { error: e }); }
            }
            if (typeof GridRenderer !== 'undefined') {
                // Create layer config for grid rendering
                const layerConfig = {};
                if (typeof LAYERS !== 'undefined') {
                    Object.keys(LAYERS).forEach(key => {
                        layerConfig[key] = { ...LAYERS[key] };
                    });
                }
                this.gridRenderer = new GridRenderer(this.mapState, this.layerState, this.highlightState, MP4Config, layerConfig, GREEN_CRYSTAL_LAYERS, this._showGridHeatmap);
                try { this.gridRenderer.init(this.canvas.parentElement); } catch (e) { moduleErrorHandler.logDebug('GridRenderer.init failed', 'InteractiveMap.init.gridRenderer', { error: e }); }
            }
            if (typeof MarkerRenderer !== 'undefined') {
                // Create layer config for rendering (exclude customMarkers.markers since it's managed by markerManager)
                const layerConfig = {};
                if (typeof LAYERS !== 'undefined') {
                    Object.keys(LAYERS).forEach(key => {
                        layerConfig[key] = { ...LAYERS[key] };
                        if (key === 'customMarkers') {
                            // Remove markers array since it's managed by markerManager
                            delete layerConfig[key].markers;
                        }
                    });
                }
                this.markerRenderer = new MarkerRenderer(this.mapState, this.layerState, this.selectionState, this.markerManager, MP4Config, layerConfig, this.highlightState);
                try { this.markerRenderer.init(); } catch (e) { moduleErrorHandler.logDebug('MarkerRenderer.init failed', 'InteractiveMap.init.markerRenderer', { error: e }); }
            }
            if (typeof RouteRenderer !== 'undefined') {
                const routeColor = (typeof LAYERS !== 'undefined' && LAYERS.route) ? LAYERS.route.color : '#00ffb7ff';
                this.routeRenderer = new RouteRenderer(this.mapState, this.layerState, this.routeState, this.routeAnimationState, MP4Config, routeColor);
                this.routeRenderer.map = this; // Keep map reference for canvas access
                try { this.routeRenderer.init(); } catch (e) { moduleErrorHandler.logDebug('RouteRenderer.init failed', 'InteractiveMap.init.routeRenderer', { error: e }); }
            }
            if (typeof OverlayRenderer !== 'undefined') {
                const routeColor = (typeof LAYERS !== 'undefined' && LAYERS.route) ? LAYERS.route.color : '#00ffb7ff';
                this.overlayRenderer = new OverlayRenderer(this.mapState, this.selectionState, this.routeState, MP4Config, routeColor);
                try { this.overlayRenderer.init(); } catch (e) { moduleErrorHandler.logDebug('OverlayRenderer.init failed', 'InteractiveMap.init.overlayRenderer', { error: e }); }
            }
            if (typeof RenderPipeline !== 'undefined') {
                // Insert an overlay-clear stage so overlay canvas is cleared
                // exactly once before overlay-rendering stages (grid, markers, route)
                const overlayClearStage = {
                    render: (renderContext) => {
                        try {
                            if (!renderContext || !renderContext.ctx) return;
                            const canvasSize = renderContext.getCanvasSize();
                            renderContext.ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
                        } catch (e) { moduleErrorHandler.logDebug('overlayClearStage failed', 'InteractiveMap.init.overlayClearStage', { error: e }); }
                    }
                };
                    // Use the concrete `OverlayRenderer` instance in the pipeline
                    // (must be constructed above if the module is available).
                    // Create RenderContext for clean canvas access abstraction
                    const renderContext = typeof RenderContext !== 'undefined' ?
                        RenderContext.fromMap(this) : null;

                    this.renderPipeline = new RenderPipeline([
                        this.tileRenderer,
                        this.heatmapRenderer,
                        overlayClearStage,
                        this.gridRenderer,
                        this.markerRenderer,
                        this.routeRenderer,
                        this.overlayRenderer
                    ].filter(Boolean), renderContext);
            }

            // Set up callbacks AFTER managers are created
            if (this.markerManager) {
                this.markerManager.setOnChanged(() => {
                    try {
                        const markers = this.markerManager.getAllMarkers();
                        this.customMarkers = markers;
                        // Update LAYERS for rendering compatibility
                        if (typeof LAYERS !== 'undefined' && LAYERS.customMarkers) {
                            LAYERS.customMarkers.markers = markers;
                        }
                        this.markRendererDirty('MarkerRenderer');
                    } catch (e) {
                        moduleErrorHandler.logDebug('MarkerManager callback failed', 'InteractiveMap.init.markerManagerCallback', { error: e });
                    }
                });
                this.markerManager.setOnCleanupRouteReferences((deletedMarkerUid) => {
                    try {
                        if (this.routeManager) {
                            this.routeManager.cleanupRouteReferences(deletedMarkerUid);
                        }
                    } catch (e) {
                        moduleErrorHandler.logDebug('Route cleanup failed', 'InteractiveMap.init.routeCleanup', { error: e });
                    }
                });
            }
            // Set up route callbacks AFTER routeManager is created
            if (this.routeManager) {
                this.routeManager.setOnRouteChanged(() => {
                    try {
                        this.markRendererDirty('RouteRenderer');
                    } catch (e) {
                        moduleErrorHandler.logDebug('Route callback failed', 'InteractiveMap.init.routeCallback', { error: e });
                    }
                });
            }

            // Loop Route toggle: explicit control for closing/opening computed/manual routes
            try {
                const loopBtn = document.getElementById('loopRouteBtn');
                const updateLoopUI = () => {
                    if (!loopBtn) return;
                    try { 
                        loopBtn.classList.toggle('active', this.routeLooping);
                        loopBtn.setAttribute('aria-pressed', this.routeLooping ? 'true' : 'false');
                    } catch (e) { moduleErrorHandler.logDebug('updateLoopUI: failed to update button state', 'InteractiveMap.init.updateLoopUI', { error: e }); }
                };
                if (loopBtn) {
                    loopBtn.addEventListener('click', () => {
                        this.routeLooping = !this.routeLooping;

                        // Recalculate route length to account for added/removed closing segment
                        if (this.currentRoute && this._routeSources && this.currentRoute.length >= 3) {
                            let lengthNormalized = this.routeManager ? this.routeManager.computeRouteLengthNormalized(MP4Config.MAP_SIZE) : 0;
                            // Add closing segment length if looping is enabled
                            if (this.routeLooping) {
                                const firstSrc = this._routeSources[this.currentRoute[0]];
                                const lastSrc = this._routeSources[this.currentRoute[this.currentRoute.length - 1]];
                                if (firstSrc && firstSrc.marker && lastSrc && lastSrc.marker) {
                                    const dx = (firstSrc.marker.x - lastSrc.marker.x) * MP4Config.MAP_SIZE;
                                    const dy = (firstSrc.marker.y - lastSrc.marker.y) * MP4Config.MAP_SIZE;
                                    const closingSegmentLength = Math.hypot(dx, dy) / MP4Config.MAP_SIZE;
                                    lengthNormalized += closingSegmentLength;
                                }
                            }
                            // Update route length via manager
                            if (this.routeManager) {
                                this.routeManager.currentRouteLengthNormalized = lengthNormalized;
                            }
                        }

                        // Invalidate route renderer caches when looping changes
                        try {
                            if (this.routeRenderer && typeof this.routeRenderer.invalidateCache === 'function') {
                                this.routeRenderer.invalidateCache();
                            }
                        } catch (e) {
                            this.errorHandler.logDebug('Failed to invalidate route renderer cache on loop toggle', 'InteractiveMap.loopRoute.invalidateCache', { error: e });
                        }

                        try {
                            if (this.routeManager) this.routeManager.saveRouteLoopingFlag(this.routeLooping);
                        } catch (e) { this.errorHandler.logDebug('loopRoute: failed to persist loop flag', 'InteractiveMap.loopRoute.persistFlag', { error: e }); }
                        try { this.render(); } catch (e) { this.errorHandler.logDebug('loopRoute: failed to request render', 'InteractiveMap.loopRoute.render', { error: e }); }
                        updateLoopUI();
                    });
                }
                updateLoopUI();
            } catch (e) { moduleErrorHandler.logDebug('InteractiveMap: loop controls initialization failed', 'InteractiveMap.init.loopControls', { error: e }); }

            // Phase 2: input and state scaffolds
            try {
                // State managers are already initialized above

                if (typeof GestureHandler !== 'undefined') {
                    this.gestureHandler = new GestureHandler(this, MP4Config);
                    try { this.gestureHandler.init(); } catch (e) { moduleErrorHandler.logDebug('GestureHandler.init failed', 'InteractiveMap.init.gestureHandler', { error: e }); }
                }
                if (typeof PointerHandler !== 'undefined') {
                    this.pointerHandler = new PointerHandler(this, MP4Config, eventBus);
                    try { this.pointerHandler.init(); } catch (e) { moduleErrorHandler.logDebug('PointerHandler.init failed', 'InteractiveMap.init.pointerHandler', { error: e }); }
                }
                if (typeof KeyboardHandler !== 'undefined') {
                    this.keyboardHandler = new KeyboardHandler(this, MP4Config, eventBus);
                    try { this.keyboardHandler.init(); } catch (e) { moduleErrorHandler.logDebug('KeyboardHandler.init failed', 'InteractiveMap.init.keyboardHandler', { error: e }); }
                }
            } catch (e) { moduleErrorHandler.logDebug('InteractiveMap: input/state scaffolding setup failed', 'InteractiveMap.init.inputStateSetup', { error: e }); }
        } catch (e) { moduleErrorHandler.logDebug('InteractiveMap: renderer and manager initialization failed', 'InteractiveMap.init.rendererManagerInit', { error: e }); }
        // Initialize map state through state manager
        if (this.mapState) {
            this.mapState.setView(0, 0, MP4Config.ZOOM.DEFAULT_MIN);
        } else {
            // Fallback for when MapState is not available
            this.zoom = MP4Config.ZOOM.DEFAULT_MIN;
            this.panX = 0;
            this.panY = 0;
        }
        
        // Interaction state
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.pointerDownTime = 0;
        this.minClickDuration = 150; // ms - threshold for distinguishing drag from click
        // Pointer/touch state
        this.pointers = new Map(); // pointerId -> {x,y,clientX,clientY,downTime}
        this.pinch = null; // {startDistance, startZoom}
        this._bitmapTimeoutMs = 15000; // timeout for bitmap decode tasks
        // Detect low-spec devices and reduce concurrency / preloads conservatively
        this._lowSpec = false;
        try {
            const dm = (typeof navigator !== 'undefined' && navigator.deviceMemory) ? Number(navigator.deviceMemory) : null;
            const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? Number(navigator.hardwareConcurrency) : null;
            if ((dm !== null && !Number.isNaN(dm) && dm <= 1.5) || (hc !== null && !Number.isNaN(hc) && hc <= 2)) {
                this._lowSpec = true;
                this._bitmapLimit = 1;
            }
        } catch (e) { this.errorHandler.logDebug('InteractiveMap: device detection failed', 'InteractiveMap.deviceDetection', { error: e }); }

    // Method to update loop UI (called when route changes)
    this.updateLoopUI = () => {
        try {
            const loopBtn = document.getElementById('loopRouteBtn');
            if (!loopBtn) return;
            loopBtn.classList.toggle('active', this.routeLooping);
            loopBtn.setAttribute('aria-pressed', this.routeLooping ? 'true' : 'false');
        } catch (e) { this.errorHandler.logDebug('updateLoopUI: failed to update button state', 'InteractiveMap.updateLoopUI', { error: e }); }
    };
        
        // Markers
        this.markers = [];
        this.customMarkers = []; // Will be updated by markerManager callback when loaded
        // Route animation state is now managed by RouteAnimationState
        // Initialize route animation state through state manager
        if (this.routeAnimationState) {
            this.routeAnimationState.setAnimationOffset(0);
            this.routeAnimationState.setAnimationFrameId(null);
            this.routeAnimationState.setLastAnimationTime(0);
            this.routeAnimationState.setAnimationSpeed(MP4Config.ROUTE.ANIMATION_SPEED);
            this.routeAnimationState.setLineWidth(MP4Config.ROUTE.LINE_WIDTH);
        } else {
            // Fallback for when RouteAnimationState is not available
            this._routeDashOffset = 0;
            this._routeRaf = null;
            this._lastRouteAnimTime = 0;
            this._routeAnimationSpeed = MP4Config.ROUTE.ANIMATION_SPEED;
            this.routeLineWidth = MP4Config.ROUTE.LINE_WIDTH;
        }
        // Selection state is now managed by SelectionState
        // Initialize selection state through state manager
        if (this.selectionState) {
            // Selection state is initialized in SelectionState constructor
        } else {
            // Fallback for when SelectionState is not available
            this.hoveredMarker = null;
            this.hoveredMarkerLayer = null;
            this.selectedMarker = null;
            this.selectedMarkerLayer = null;
            this.editMarkersMode = false;
            this.editRouteMode = false;
        }
        
        // Layer visibility state is now managed by LayerState
        // Initialize layer visibility through state manager
        if (this.layerState) {
            // LayerState initializes visibility in constructor
            // Set grid visibility from storage
            try {
                const g = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.GRID_VISIBLE);
                if (g === null || typeof g === 'undefined') {
                    this.layerState.setGridVisible(true);
                } else {
                    this.layerState.setGridVisible(g === '1' || g === 1 || g === 'true' || g === true);
                }
            } catch (e) {
                this.layerState.setGridVisible(true);
            }
        }
        
        // Layer configuration is now managed by LayerState
        if (this.layerState) {
            // LayerState initializes config in constructor
        } else {
            // Fallback for when LayerState is not available
            this.layerConfig = {
                'customMarkers': {
                    maxMarkers: (MP4Config && MP4Config.CUSTOM_MARKERS && MP4Config.CUSTOM_MARKERS.MAX_COUNT) || 50
                }
            };
        }

        // Edit modes are now managed by SelectionState
        if (this.selectionState) {
            // SelectionState initializes edit modes in constructor
        } else {
            // Fallback for when SelectionState is not available
            this.editMarkersMode = false;
            this.editRouteMode = false;
        }
        // Whether the current route should be rendered as a closed loop.
        // Default: do not loop routes unless user explicitly enables looping via the UI.
        // Wheel save timer used to delay saving until wheel stops
        this._wheelSaveTimer = null;
        // Marker shrink tuning: value in [0..1]. 0 = no marker shrink (markers stay at full size),
        // 1 = markers follow `getDetailScale()` fully. Use <1 to make markers shrink less.
        this.markerShrinkFactor = 0.6;
        
        // Tooltip element
        this.tooltip = document.getElementById('tooltip');

        // TooltipManager initialization removed - tooltips are now managed by OverlayRenderer via showTooltip()
        // Move tooltip into the map container and ensure container is positioned so absolute coords align
        try {
            const parent = this.canvas && this.canvas.parentElement;
            if (this.tooltip && parent) {
                try { if (window.getComputedStyle(parent).position === 'static') parent.style.position = 'relative'; } catch (e) { moduleErrorHandler.logDebug('Failed to set parent position for tooltip', 'InteractiveMap.init.tooltipPosition', { error: e }); }
                try { parent.appendChild(this.tooltip); } catch (e) { moduleErrorHandler.logDebug('Failed to append tooltip to parent', 'InteractiveMap.init.tooltipAppend', { error: e }); }
                try { this.tooltip.style.position = 'absolute'; this.tooltip.style.zIndex = '999'; this.tooltip.style.pointerEvents = 'none'; } catch (e) { moduleErrorHandler.logDebug('Failed to style tooltip', 'InteractiveMap.init.tooltipStyle', { error: e }); }
            }
        } catch (e) {
            moduleErrorHandler.logDebug('Tooltip positioning setup failed', 'InteractiveMap.init.tooltipSetup', { error: e });
        }
        // Tileset and heatmap settings are now managed by LayerState
        if (this.layerState) {
            // Load tileset from storage
            try {
                const t = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.TILESET);
                // LayerState doesn't have tileset yet, so we'll handle this later
                this.tileset = t || 'sat';
            } catch (e) { this.tileset = 'sat'; }

            // Load tileset grayscale from storage
            try {
                const g = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE);
                this.tilesetGrayscale = (g === '1' || g === 1 || g === true);
            } catch (e) { this.tilesetGrayscale = false; }

            // Load grid heatmap from storage
            try {
                const gh = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.GRID_HEATMAP);
                this.layerState.setHeatmapVisible(gh === '1' || gh === 1 || gh === true);
            } catch (e) {
                this.layerState.setHeatmapVisible(false);
            }
        } else {
            // Fallback for when LayerState is not available
            try {
                const t = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.TILESET);
                this.tileset = t || 'sat';
            } catch (e) { this.tileset = 'sat'; }

            try {
                const g = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE);
                this.tilesetGrayscale = (g === '1' || g === 1 || g === true);
            } catch (e) { this.tilesetGrayscale = false; }

            try {
                const gh = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.GRID_HEATMAP);
                this._showGridHeatmap = (gh === '1' || gh === 1 || gh === true);
            } catch (e) { this._showGridHeatmap = false; }
        }
        
        // Load marker scaling configuration (consent-gated)
        try {
            if (window.storageService && window.storageService.hasConsent()) {
                const savedScaling = window.storageService.get(MP4Config.STORAGE_KEYS.MARKER_SCALING);
                if (savedScaling) {
                    MP4Config.MARKER_SCALING.userScaleMultiplier = savedScaling.userScaleMultiplier || MP4Config.MARKER_SCALING.userScaleMultiplier;
                    MP4Config.MARKER_SCALING.highlightMultiplier = savedScaling.highlightMultiplier || MP4Config.MARKER_SCALING.highlightMultiplier;
                }
            } else if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent() && typeof StorageInterface !== 'undefined') {
                const savedScaling = StorageInterface.loadMarkerScaling();
                if (savedScaling) {
                    MP4Config.MARKER_SCALING.userScaleMultiplier = savedScaling.userScaleMultiplier || MP4Config.MARKER_SCALING.userScaleMultiplier;
                    MP4Config.MARKER_SCALING.highlightMultiplier = savedScaling.highlightMultiplier || MP4Config.MARKER_SCALING.highlightMultiplier;
                }
            }
        } catch (e) {
            moduleErrorHandler.logDebug('Failed to load marker scaling config', 'InteractiveMap.init.markerScaling', { error: e });
        }
        
        // Setup
        this.resize();
        this.bindEvents();
        // Fit the full map into the container on initial load so we pick a sensible resolution.
        // Reserve padding for axis labels so indices are visible on load.
        const cssWidth = this.canvas.parentElement.clientWidth;
        const cssHeight = this.canvas.parentElement.clientHeight;
        // Assume the maximum label font size used by `renderAxisLabels()` (clamped there).
        const labelFontMax = 48;
        const labelPadding = 8;
        const halfW = labelFontMax * 0.6; // approx half-width of label
        const halfH = labelFontMax / 2;
        // Available space after reserving label margins on both sides
        const availW = Math.max(32, cssWidth - 2 * (labelPadding + halfW));
        const availH = Math.max(32, cssHeight - 2 * (labelPadding + halfH));
        const fitZoom = Math.min(availW / MP4Config.MAP_SIZE, availH / MP4Config.MAP_SIZE);

        if (this.mapState) {
            const initialZoom = Math.max(this.mapState.minZoom, Math.min(this.mapState.maxZoom, fitZoom));
            this.mapState.setZoom(initialZoom);
            this.mapState.centerMap();
            this.imageState.updateResolution();
            this.updateResolution();
        } else {
            // Fallback
            this.zoom = Math.max(this.minZoom || MP4Config.ZOOM.DEFAULT_MIN, Math.min(MP4Config.ZOOM.MAX, fitZoom));
            this.centerMap();
        }
        this.preloadAllMapImages();
        this.loadInitialImage();

        // Initialize route animation properties
        try {
            if (typeof RouteAnimation !== 'undefined' && typeof RouteAnimation.initialize === 'function') {
                RouteAnimation.initialize(this);
            }
        } catch (e) {
            moduleErrorHandler.logDebug('RouteAnimation initialization failed', 'InteractiveMap.init.routeAnimation', { error: e });
        }

        this.render();
    }

    // Getters for backward compatibility - delegate to state managers
    get zoom() {
        return this.mapState ? this.mapState.zoom : this._fallbackZoom;
    }

    set zoom(value) {
        if (this.mapState) {
            this.mapState.zoom = value;
        } else {
            this._fallbackZoom = value;
        }
    }

    get panX() {
        return this.mapState ? this.mapState.panX : this._fallbackPanX;
    }

    set panX(value) {
        if (this.mapState) {
            this.mapState.panX = value;
        } else {
            this._fallbackPanX = value;
        }
    }

    get panY() {
        return this.mapState ? this.mapState.panY : this._fallbackPanY;
    }

    set panY(value) {
        if (this.mapState) {
            this.mapState.panY = value;
        } else {
            this._fallbackPanY = value;
        }
    }

    get minZoom() {
        return this.mapState ? this.mapState.minZoom : DEFAULT_MIN_ZOOM;
    }

    get selectedMarker() {
        return this.selectionState ? this.selectionState.selectedMarker : this._fallbackSelectedMarker;
    }

    set selectedMarker(value) {
        if (this.selectionState) {
            this.selectionState.setSelectedMarker(value, this.selectedMarkerLayer);
        } else {
            this._fallbackSelectedMarker = value;
        }
    }

    get selectedMarkerLayer() {
        return this.selectionState ? this.selectionState.selectedMarkerLayer : this._fallbackSelectedMarkerLayer;
    }

    set selectedMarkerLayer(value) {
        if (this.selectionState) {
            this.selectionState.selectedMarkerLayer = value;
        } else {
            this._fallbackSelectedMarkerLayer = value;
        }
    }

    get editMarkersMode() {
        return this.selectionState ? this.selectionState.editMarkersMode : this._fallbackEditMarkersMode;
    }

    set editMarkersMode(value) {
        if (this.selectionState) {
            this.selectionState.setEditMarkersMode(value);
        } else {
            this._fallbackEditMarkersMode = value;
        }
    }

    get editRouteMode() {
        return this.selectionState ? this.selectionState.editRouteMode : this._fallbackEditRouteMode;
    }

    set editRouteMode(value) {
        if (this.selectionState) {
            this.selectionState.setEditRouteMode(value);
        } else {
            this._fallbackEditRouteMode = value;
        }
    }

    get layerVisibility() {
        return this.layerState ? this.layerState.layerVisibility : this._fallbackLayerVisibility;
    }

    set layerVisibility(value) {
        if (this.layerState) {
            this.layerState.layerVisibility = value;
        } else {
            this._fallbackLayerVisibility = value;
        }
    }

    get _showGridHeatmap() {
        return this.layerState ? this.layerState.isHeatmapVisible() : this._fallbackShowGridHeatmap;
    }

    set _showGridHeatmap(value) {
        if (this.layerState) {
            this.layerState.setHeatmapVisible(value);
        } else {
            this._fallbackShowGridHeatmap = value;
        }
    }

    get _routeDashOffset() {
        return this.routeAnimationState ? this.routeAnimationState.getAnimationOffset() : this._fallbackRouteDashOffset;
    }

    set _routeDashOffset(value) {
        if (this.routeAnimationState) {
            this.routeAnimationState.setAnimationOffset(value);
        } else {
            this._fallbackRouteDashOffset = value;
        }
    }

    get _routeRaf() {
        return this.routeAnimationState ? this.routeAnimationState.getAnimationFrameId() : this._fallbackRouteRaf;
    }

    set _routeRaf(value) {
        if (this.routeAnimationState) {
            this.routeAnimationState.setAnimationFrameId(value);
        } else {
            this._fallbackRouteRaf = value;
        }
    }

    get _lastRouteAnimTime() {
        return this.routeAnimationState ? this.routeAnimationState.getLastAnimationTime() : this._fallbackLastRouteAnimTime;
    }

    set _lastRouteAnimTime(value) {
        if (this.routeAnimationState) {
            this.routeAnimationState.setLastAnimationTime(value);
        } else {
            this._fallbackLastRouteAnimTime = value;
        }
    }

    get _routeAnimationSpeed() {
        return this.routeAnimationState ? this.routeAnimationState.getAnimationSpeed() : this._fallbackRouteAnimationSpeed;
    }

    set _routeAnimationSpeed(value) {
        if (this.routeAnimationState) {
            this.routeAnimationState.setAnimationSpeed(value);
        } else {
            this._fallbackRouteAnimationSpeed = value;
        }
    }

    get routeLineWidth() {
        return this.routeAnimationState ? this.routeAnimationState.getLineWidth() : this._fallbackRouteLineWidth;
    }

    set routeLineWidth(value) {
        if (this.routeAnimationState) {
            this.routeAnimationState.setLineWidth(value);
        } else {
            this._fallbackRouteLineWidth = value;
        }
    }

    // Getters for route data - delegate to routeManager
    get currentRoute() {
        return this.routeManager ? this.routeManager.currentRoute : null;
    }

    get currentRouteLengthNormalized() {
        return this.routeManager ? this.routeManager.currentRouteLengthNormalized : 0;
    }

    get currentRouteLength() {
        return this.currentRouteLengthNormalized * MP4Config.MAP_SIZE;
    }

    get _routeSources() {
        return this.routeManager ? this.routeManager.routeSources : null;
    }

    get routeLooping() {
        return this.routeManager ? this.routeManager.routeLooping : false;
    }

    set routeLooping(value) {
        if (this.routeManager) {
            this.routeManager.setRouteLooping(value);
        }
    }

    // Preload map images at all resolutions to reduce hiccups during zoom/pan
    preloadAllMapImages() {
        try {
            if (this.tileRenderer && typeof this.tileRenderer.preloadAllMapImages === 'function') {
                return this.tileRenderer.preloadAllMapImages();
            }
        } catch (e) {
            this.errorHandler.logDebug('Failed to preload map images', 'InteractiveMap.preloadAllMapImages', { error: e });
        }
    }
    
    resize() {
        const container = this.canvas.parentElement;
        const cssWidth = container.clientWidth;
        const cssHeight = container.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        this.dpr = dpr;

        // Set CSS size and backing store size for high-DPI displays
        this.canvas.style.width = cssWidth + 'px';
        this.canvas.style.height = cssHeight + 'px';
        this.canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
        this.canvas.height = Math.max(1, Math.floor(cssHeight * dpr));

        // If a separate tile canvas exists, size its backing store too
        if (this.canvasTiles && this.ctxTiles) {
            this.canvasTiles.style.width = cssWidth + 'px';
            this.canvasTiles.style.height = cssHeight + 'px';
            this.canvasTiles.width = Math.max(1, Math.floor(cssWidth * dpr));
            this.canvasTiles.height = Math.max(1, Math.floor(cssHeight * dpr));
        }

        // Size heatmap canvas if present
        if (this.canvasHeatmap && this.ctxHeatmap) {
            this.canvasHeatmap.style.width = cssWidth + 'px';
            this.canvasHeatmap.style.height = cssHeight + 'px';
            this.canvasHeatmap.width = Math.max(1, Math.floor(cssWidth * dpr));
            this.canvasHeatmap.height = Math.max(1, Math.floor(cssHeight * dpr));
        }

        // Scale drawing so we can use CSS pixels in drawing code
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (this.ctxTiles) {
            try { this.ctxTiles.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {
                this.errorHandler.logDebug('Failed to set tile canvas transform', 'InteractiveMap.resize.tileTransform', { error: e });
            }
        }
        if (this.ctxHeatmap) {
            try { this.ctxHeatmap.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {
                this.errorHandler.logDebug('Failed to set heatmap canvas transform', 'InteractiveMap.resize.heatmapTransform', { error: e });
            }
        }

        // Update MapState with new canvas dimensions
        if (this.mapState) {
            this.mapState.setCanvasSize(cssWidth, cssHeight, dpr);
        } else {
            // Fallback: compute a device-aware minimum zoom so smallest resolution can be reached
            const minRes = MP4Config.TILE_RESOLUTIONS[0];
            // minZoom such that minRes >= MAP_SIZE * minZoom * dpr => minZoom = minRes / (MAP_SIZE * dpr)
            this.minZoom = Math.max(0.005, Math.min(MP4Config.ZOOM.DEFAULT_MIN, minRes / (MP4Config.MAP_SIZE * dpr)));
        }

        this.imageState.updateResolution();
        // Recreate honeycomb pattern when the canvas size or DPR changes
        try { this._createHoneycombPattern && this._createHoneycombPattern(); } catch (e) {
            this.errorHandler.logDebug('Failed to recreate honeycomb pattern', 'InteractiveMap.resize.honeycombPattern', { error: e });
        }
        this.render();
    }  
    
    centerMap() {
        if (this.mapState) {
            this.mapState.centerMap();
        } else {
            // Fallback
            const cssWidth = this.canvas.clientWidth;
            const cssHeight = this.canvas.clientHeight;
            const mapWidth = MP4Config.MAP_SIZE * this.zoom;
            const mapHeight = MP4Config.MAP_SIZE * this.zoom;
            this.panX = (cssWidth - mapWidth) / 2;
            this.panY = (cssHeight - mapHeight) / 2;
        }
    }

    zoomIn() {
        // Use mapState.zoomIn() which properly handles zoom center and pan adjustment
        if (this.mapState && typeof this.mapState.zoomIn === 'function') {
            // Zoom to canvas center (no explicit centerX/centerY means it defaults to canvas center)
            this.mapState.zoomIn();
            this.imageState.updateResolution();
            this.updateResolution();
            this.render();
        }
    }

    zoomOut() {
        // Use mapState.zoomOut() which properly handles zoom center and pan adjustment
        if (this.mapState && typeof this.mapState.zoomOut === 'function') {
            // Zoom from canvas center (no explicit centerX/centerY means it defaults to canvas center)
            this.mapState.zoomOut();
            this.imageState.updateResolution();
            this.updateResolution();
            this.render();
        }
    }

    resetView() {
        // Use mapState.resetView() which properly centers and sets zoom through modular infrastructure
        if (this.mapState && typeof this.mapState.resetView === 'function') {
            this.mapState.resetView();
            this.imageState.updateResolution();
            this.updateResolution();
            this.render();
        }
    }
    
    bindEvents() {
        // All pointer events are now handled by PointerHandler
        // Route export/import handlers
        const exportRouteBtn = document.getElementById('exportRoute');
        const importRouteBtn = document.getElementById('importRoute');
        const importRouteFile = document.getElementById('importRouteFile');

        if (exportRouteBtn) {
            exportRouteBtn.addEventListener('click', () => {
                try {
                    if (map.routeManager && typeof map.routeManager.exportRoute === 'function') {
                        map.routeManager.exportRoute({ zoom: map.zoom, panX: map.panX, panY: map.panY }, MP4Config.MAP_SIZE);
                    } else {
                        NotificationUtils.showRouteError('Route manager not available.');
                    }
                } catch (err) {
                    NotificationUtils.showRouteError('Failed to export route: ' + (err.message || String(err)));
                }
            });
        }

        if (importRouteBtn && importRouteFile) {
            importRouteBtn.addEventListener('click', () => importRouteFile.click());
            importRouteFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        try {
                            routeManager.importRouteFromContent(ev.target.result);
                        } catch (err) {
                            NotificationUtils.showRouteError('Failed to import route: ' + (err.message || String(err)));
                        }
                    } catch (err) {
                        NotificationUtils.showRouteError('Failed to import route: ' + (err.message || String(err)));
                    }
                };
                reader.onerror = () => NotificationUtils.showFileError('Failed to read file');
                reader.readAsText(file);
                e.target.value = '';
            });
        }




        // pointerleave similar to mouseleave. Keep tooltip visible when cursor
        // moves into UI areas (sidebar, controls, layer list) so it doesn't
        // disappear when users move from map to UI to inspect details.
        // NOTE: Now handled by PointerHandler
        
        // Click handler - place custom markers or delete them when tapped
        // NOTE: Now handled by PointerHandler
        
        // Window resize
        window.addEventListener('resize', () => {
            this.resize();
            this.render();
        });
        
        // Keyboard shortcuts are now handled by KeyboardHandler

        // Ensure sidebar scroll is always responsive by adding explicit wheel handler
        // This bypasses any gesture delays and makes scrolling work immediately
        const controlsEl = document.querySelector('.controls');
        if (controlsEl) {
            controlsEl.addEventListener('wheel', (e) => {
                // Allow wheel events to scroll the controls immediately without any delays
                // Do not preventDefault—let the browser handle natural scrolling
                controlsEl.scrollTop += e.deltaY > 0 ? 40 : -40;
            }, { passive: true });

            // Also handle pointer events on sidebar to enable touch scrolling
            controlsEl.addEventListener('pointerdown', (e) => {
                // Reset momentum by forcing the element to a neutral state
                controlsEl.style.scrollBehavior = 'auto';
            }, { passive: true });
        }
    }
    

    

    

    
    saveViewToStorage() {
        try {
            if (this.mapState && typeof this.mapState.saveToStorage === 'function') {
                this.mapState.saveToStorage();
            }
        } catch (e) {
            this.errorHandler.logError(e, 'InteractiveMap.saveViewToStorage');
        }
    }

    loadViewFromStorage() {
        try {
            if (this.mapState && typeof this.mapState.loadFromStorage === 'function') {
                const result = this.mapState.loadFromStorage();
                if (result) {
                    try { this.updateResolution(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.loadViewFromStorage.updateResolution'); }
                    try { this.render(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.loadViewFromStorage.render'); }
                }
                return result;
            }
            return false;
        } catch (e) { 
            this.errorHandler.logDebug('loadViewFromStorage failed', 'InteractiveMap.loadViewFromStorage', { error: e });
            return false; 
        }
    }

    loadInitialImage() {
        try { if (this.tileRenderer && typeof this.tileRenderer.loadInitialImage === 'function') { return this.tileRenderer.loadInitialImage(); } } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.loadInitialImage.tileRenderer'); }
        try { const needed = this.getNeededResolution(); this.loadImage(needed); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.loadInitialImage.loadImage'); }
    }
    
    loadImage(resolutionIndex) {
        try { if (this.tileRenderer && typeof this.tileRenderer.loadImage === 'function') { return this.tileRenderer.loadImage(resolutionIndex); } } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.loadImage.tileRenderer'); }
    }


    setTileset(tileset) {
        // Delegate to tilesetState
        if (this.tilesetState) {
            this.tilesetState.setTileset(tileset);
            // Handle the side effects that were previously in this method
            this._handleTilesetChange();
        } else {
            // Fallback to old implementation
            try { tileset = String(tileset); } catch (e) { return; }
            if (!tileset) return;
            if (this.tileset === tileset) return;
            if (tileset !== 'sat' && tileset !== 'holo') return;
            this.tileset = tileset;
            this._handleTilesetChange();
        }
    }

    _handleTilesetChange() {
        // Increment generation and abort any in-flight tile loads from previous tileset
        try { this.imageState.incrementTilesetGeneration(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._handleTilesetChange.incrementGeneration'); }
        try { this._abortAndCleanupTileLoads(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._handleTilesetChange.abortTileLoads'); }
        try { if (window.storageService) { window.storageService.saveSetting(MP4Config.STORAGE_KEYS.TILESET, this.tilesetState ? this.tilesetState.tileset : this.tileset); } } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._handleTilesetChange.saveTilesetSetting'); }
        // Clear cached images and reload (folder may change depending on
        // whether grayscale variants are enabled)
        try { this.preloadAllMapImages(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._handleTilesetChange.preloadImages'); }
        try { this.loadInitialImage(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._handleTilesetChange.loadInitialImage'); }
        this.markRendererDirty('TileRenderer');
    }

    // Return the tiles folder name depending on current tileset and whether
    // grayscale variants are enabled. Example: 'sat' or 'sat_bw'.
    getTilesetFolder() {
        if (this.tilesetState) {
            return this.tilesetState.getTilesetFolder();
        } else {
            // Fallback to old implementation
            try {
                const base = String(this.tileset || 'sat');
                return this.tilesetGrayscale ? `${base}_bw` : base;
            } catch (e) { return this.tilesetGrayscale ? 'sat_bw' : 'sat'; }
        }
    }

    setTilesetGrayscale(enabled) {
        // Delegate to tilesetState
        if (this.tilesetState) {
            this.tilesetState.setGrayscale(enabled);
            // Handle the side effects
            this._handleTilesetChange();
        } else {
            // Fallback to old implementation
            enabled = !!enabled;
            if (this.tilesetGrayscale === enabled) return;
            this.tilesetGrayscale = enabled;
            try { if (window.storageService) { window.storageService.saveSetting(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE, this.tilesetGrayscale ? '1' : '0'); } } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTilesetGrayscale.saveSetting'); }
            this._handleTilesetChange();
        }
    }

    // Toggle and persist the grid heatmap overlay
    setGridHeatmap(enabled) {
        enabled = !!enabled;
        if (this._showGridHeatmap === enabled) return;
        this._showGridHeatmap = enabled;
        try { if (window.storageService) { window.storageService.saveSetting(MP4Config.STORAGE_KEYS.GRID_HEATMAP, this._showGridHeatmap ? '1' : '0'); } } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setGridHeatmap.saveSetting'); }
        try {
            // Redraw the grid renderer to show/hide heatmap
            this.markRendererDirty('GridRenderer');
            // Inline heatmap toggle removed; nothing to update here.
            // Update sidebar button state if present
            try {
                const btn = document.getElementById('gridHeatmapBtn');
                if (btn) {
                    btn.classList.toggle('active', this._showGridHeatmap);
                    btn.setAttribute('aria-pressed', this._showGridHeatmap ? 'true' : 'false');
                }
            } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setGridHeatmap.updateButton'); }
        } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setGridHeatmap'); }
    }

    getNeededResolution() {
        return this.imageState.getNeededResolution();
    }

    _abortAndCleanupTileLoads() {
        try { if (this.tileRenderer && typeof this.tileRenderer._abortAndCleanupTileLoads === 'function') { return this.tileRenderer._abortAndCleanupTileLoads(); } } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._abortAndCleanupTileLoads'); }
    }

    _runBitmapTask(fn) {
        try { if (this.tileRenderer && typeof this.tileRenderer._runBitmapTask === 'function') return this.tileRenderer._runBitmapTask(fn); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._runBitmapTask'); }
        return Promise.reject(new Error('bitmap not available'));
    }

    _withTimeout(fn, ms) {
        try { if (this.tileRenderer && typeof this.tileRenderer._withTimeout === 'function') return this.tileRenderer._withTimeout(fn, ms); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._withTimeout'); }
        return Promise.reject(new Error('timeout-helper not available'));
    }

    // Expose simple runtime stats for diagnostics
    getTileLoadStats() {
        try { if (this.tileRenderer && typeof this.tileRenderer.getTileLoadStats === 'function') return this.tileRenderer.getTileLoadStats(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.getTileLoadStats'); }
        return { bitmapActive: 0, bitmapQueue: 0, imageControllers: 0, imageBitmaps: 0 };
    }
    

    // Draw tiles into the dedicated tile canvas. If `ctxTiles` is not
    // available, fall back to drawing into the overlay context.


    // Create a reusable honeycomb pattern on an offscreen canvas.
    // `size` is the hex radius in CSS pixels. This function respects DPR
    // and low-spec heuristics so the pattern density is reduced on weaker devices.
    _createHoneycombPattern(size = 28) {
        try {
            const dpr = window.devicePixelRatio || 1;
            const base = Number(size) || 28;
            // Adapt hex size slightly based on viewport width so the pattern
            // becomes a bit denser on wide viewports and shrinks on narrow ones.
            const container = this.canvasTiles || this.canvas;
            const containerWidth = (container && container.clientWidth) ? container.clientWidth : (window.innerWidth || 1024);
            const refWidth = 1024; // reference width for scaling
            const viewportRatio = Math.min(1, containerWidth / refWidth);
            const maxShrink = 1; // max 18% shrink on very small viewports
            const viewportMultiplier = 1 - (1 - viewportRatio) * maxShrink;
            // Use a continuous (float) size so the pattern shrinks smoothly
            // with viewport width instead of stepping through integer sizes.
            const adaptiveBase = Math.max(10, base * viewportMultiplier);
            const r = this._lowSpec ? (adaptiveBase * 1.6) : adaptiveBase;
            const hexH = Math.sqrt(3) * r;
            const hSpacing = 1.5 * r;
            const vSpacing = hexH;

            // Pattern tile extents (use integer pixels to avoid blurry seams)
            // Make the pattern tile cover two columns and two rows so repetition is seamless
            const tileW = Math.max(2, Math.ceil(hSpacing * 2));
            const tileH = Math.max(2, Math.ceil(vSpacing * 2));

            const pc = document.createElement('canvas');
            pc.width = Math.max(1, Math.floor(tileW * dpr));
            pc.height = Math.max(1, Math.floor(tileH * dpr));
            const pctx = pc.getContext('2d');
            // Draw in CSS pixels by scaling for DPR
            pctx.scale(dpr, dpr);

            pctx.fillStyle = 'rgba(6,20,30,0.28)';
            pctx.strokeStyle = 'rgba(34,211,238,0.06)';
            pctx.lineWidth = 1;

            // Start slightly negative so partial hexes at the edges are drawn
            const xStart = -hSpacing;
            const yStart = -vSpacing;
            const cols = Math.ceil(tileW / hSpacing) + 3;
            const rows = Math.ceil(tileH / vSpacing) + 3;

            for (let col = 0; col < cols; col++) {
                for (let row = 0; row < rows; row++) {
                    const cx = xStart + col * hSpacing;
                    const cy = yStart + row * vSpacing + (col % 2 ? vSpacing / 2 : 0);
                    // Draw hexagon centered at (cx, cy)
                    pctx.beginPath();
                    for (let i = 0; i < 6; i++) {
                        const angle = (Math.PI / 180) * (60 * i);
                        const x = cx + r * Math.cos(angle);
                        const y = cy + r * Math.sin(angle);
                        if (i === 0) pctx.moveTo(x, y); else pctx.lineTo(x, y);
                    }
                    pctx.closePath();
                    pctx.fill();
                    pctx.stroke();
                }
            }

            // Rotate the pattern tile by 90 degrees into a new canvas so the
            // repeated pattern appears rotated without changing tiling behavior.
            try {
                const rc = document.createElement('canvas');
                // For a 90deg rotation swap width/height to avoid clipping
                rc.width = pc.height;
                rc.height = pc.width;
                const rctx = rc.getContext('2d');
                // Translate to center, rotate 90deg, draw original
                rctx.translate(rc.width / 2, rc.height / 2);
                rctx.rotate(Math.PI / 2);
                rctx.drawImage(pc, -pc.width / 2, -pc.height / 2);
                this._honeycombPatternCanvas = rc;
            } catch (e) {
                // Fallback to the original pattern if rotation fails
                this._honeycombPatternCanvas = pc;
            }
            this._honeycombPattern = null;
        } catch (e) {
            // ignore pattern creation failures
            this._honeycombPatternCanvas = null;
            this._honeycombPattern = null;
        }
    }
    
    updateResolution() {
        const needed = this.imageState.getNeededResolution();
        const current = this.imageState.currentResolution;
        const loading = this.imageState.loadingResolution;
        
        if (needed !== current && loading !== needed) {
            this.tileRenderer.loadImage(needed);
        }
        
        // Update status display
        const status = document.getElementById('resolutionStatus');
        if (status) {
            const res = MP4Config.TILE_RESOLUTIONS[this.imageState.currentResolution] || MP4Config.TILE_RESOLUTIONS[0];
            status.textContent = `${res}px`;
        }
        
        const zoomStatus = document.getElementById('zoomStatus');
        if (zoomStatus) {
            zoomStatus.textContent = `${(this.zoom * 100).toFixed(0)}%`;
        }
    }
    
    setMarkers(markers) {
        if (this.markerManager) {
            this.markerManager.setMarkers(markers);
        } else {
            // Fallback if markerManager not available (should not happen in decoupled code)
            this.errorHandler.logWarning('setMarkers called without markerManager available', 'InteractiveMap.setMarkers');
            this.markers = markers;
            this.customMarkers = markers;
            this.render();
            this.updateLayerCounts();
        }
    }
    
    updateCustomMarkerCount() {
        // Backwards-compatible alias: update all layer counts
        this.updateLayerCounts();
    }

    // Update counts for all layers in the sidebar (predictable element IDs)
    updateLayerCounts() {
        try {
            const entries = Object.entries(LAYERS || {});
            for (let i = 0; i < entries.length; i++) {
                const layerKey = entries[i][0];
                const layer = entries[i][1];
                const spanId = (layerKey === 'route') ? 'routeLength' : `${layerKey}Count`;
                const el = document.getElementById(spanId);
                if (!el) continue;
                if (layerKey === 'route') {
                    if (this.currentRoute && this.currentRoute.length) {
                        // show normalized map units (map width = 1) with 4 decimal places.
                        const norm = (typeof this.currentRouteLengthNormalized === 'number') ? this.currentRouteLengthNormalized : (this.currentRouteLength / MP4Config.MAP_SIZE || 0);
                        // show just the numeric value (no unit suffix) per request
                        el.textContent = `${norm.toFixed(4)}`;
                    } else {
                        // no route -> display 0
                        el.textContent = '0';
                    }
                } else if (Array.isArray(layer.markers)) {
                    // If layer provides a maxMarkers field use it; otherwise try runtime layerConfig, else just show count
                    const configuredMax = (typeof layer.maxMarkers === 'number') ? layer.maxMarkers : (this.layerConfig && this.layerConfig[layerKey] && this.layerConfig[layerKey].maxMarkers);
                    if (typeof configuredMax === 'number') {
                        el.textContent = `${layer.markers.length} / ${configuredMax}`;
                    } else {
                        el.textContent = `${layer.markers.length}`;
                    }
                } else if (typeof layer.markerCountText === 'string') {
                    el.textContent = layer.markerCountText;
                } else {
                    el.textContent = '';
                }
            }
        } catch (e) {
            // ignore DOM errors
        }
    }
    
    toggleMarkers(show) {
        this.toggleLayer('greenCrystals', show);
    }
    
    toggleCustomMarkers(show) {
        this.toggleLayer('customMarkers', show);
    }

    // Generic layer toggle handler: updates runtime visibility and performs per-layer side-effects
    toggleLayer(layerKey, show) {
        if (this.layerState) {
            this.layerState.setLayerVisible(layerKey, !!show);
        }
        // (debug logs removed)

        // If hiding a layer that currently has a selected marker, clear selection
        if (!show && this.selectedMarkerLayer === layerKey) {
            this.selectedMarker = null;
            this.selectedMarkerLayer = null;
            this.hideTooltip();
        }

        // Only re-render the overlay (markers/route/tooltip). Tiles are expensive
        // to redraw at high zoom and don't change when toggling layers.
        try { this.render(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.toggleLayer.render'); }
    }
    
    checkMarkerHover(mouseX, mouseY) {
        // If a drag candidate or active drag exists, keep the grabbing cursor
        // to avoid flicker before a drag is promoted.
        if (this._draggingCandidate || this._draggingMarker) {
            try { this.canvas.style.cursor = 'grabbing'; } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.checkMarkerHover.setCursor'); }
            return;
        }

        // Only determine whether the cursor is over any marker (for pointer cursor).
        // Selection and tooltip display are managed via click/tap toggles, not hover.
        // compute per-marker hit testing so highlighted/selected markers (larger) are detected properly
        let foundCursor = false;

        // Iterate layers defined in LAYERS to detect hover over any visible marker
        const entries = Object.entries(LAYERS || {});
        for (let li = entries.length - 1; li >= 0 && !foundCursor; li--) {
            const layerKey = entries[li][0];
            const layer = entries[li][1];
            if (!this.layerState || !this.layerState.isLayerVisible(layerKey)) continue;
            if (!Array.isArray(layer.markers)) continue;
            for (let i = layer.markers.length - 1; i >= 0; i--) {
                const marker = layer.markers[i];
                const screenX = marker.x * MP4Config.MAP_SIZE * this.zoom + this.panX;
                const screenY = marker.y * MP4Config.MAP_SIZE * this.zoom + this.panY;
                const r = this.markerRenderer.getMarkerHitRadius(marker, layerKey);
                if (Math.hypot(mouseX - screenX, mouseY - screenY) < r) {
                    foundCursor = true;
                    break;
                }
            }
        }

        const newCursor = foundCursor ? 'pointer' : 'grab';
        // Only update cursor if it changed (avoid DOM thrashing)
        if (this.canvas.style.cursor !== newCursor) {
            this.canvas.style.cursor = newCursor;
        }
        // Don't render on hover - that's handled by pan/zoom events via EventBus
    }

    // findMarkerAt fully delegated to MarkerRenderer (removed legacy fallback)
    findMarkerAt(screenX, screenY) {
        if (!this.markerRenderer || typeof this.markerRenderer.findMarkerAt !== 'function') throw new Error('findMarkerAt removed from map; use markerRenderer.findMarkerAt instead');
        return this.markerRenderer.findMarkerAt(screenX, screenY);
    }

    // Find a route segment near screen coordinates. Returns { index } where
    // index is the index of the first node of the segment (i.e., segment between i and i+1).
    findRouteSegmentAt(screenX, screenY, threshold = 10) {
        return this.routeManager.findRouteSegmentAt(screenX, screenY, {zoom: this.zoom, panX: this.panX, panY: this.panY}, MP4Config.MAP_SIZE, threshold);
    }

    // Compute normalized (map width = 1) non-looping length for given sources array


    // Handle route segment insertion start
    _handleRouteInsertStart(ev, seg, localX, localY, downTime) {
        try {
            if (!this.editRouteMode || !seg || typeof seg.index !== 'number') return;
            if (!Array.isArray(this.currentRoute) || !Array.isArray(this._routeSources)) return;

            const routePos = seg.index + 1; // Insert after the segment index
            const prevSources = this._routeSources.slice();
            const prevIndices = this.currentRoute.slice();

            // Create ordered sources array
            const ordered = RouteUtilsCore.createOrderedSources(prevIndices, prevSources);

            // Calculate insertion position along the segment
            const insertPosition = RouteUtilsCore.calculateSegmentInsertionPosition(seg.index, seg.t, ordered, this.routeLooping);
            if (!insertPosition) return;

            // Create temporary marker using object pool
            const tempMarker = typeof markerPool !== 'undefined' ? markerPool.acquire() : { uid: '', x: 0, y: 0 };
            tempMarker.x = insertPosition.x;
            tempMarker.y = insertPosition.y;

            // Insert waypoint into ordered sources
            const newOrdered = RouteUtilsCore.insertWaypointIntoOrderedSources(ordered, insertPosition, tempMarker, 'temp');

            const newSources = newOrdered;
            const newIndices = newSources.map((_, i) => i);

            // Set the route with the temporary insertion
            this.setRoute(newIndices, RouteUtilsCore.computeRouteLengthNormalized(newSources, MAP_SIZE), newSources);

            // Initialize route insert state
            this._routeInsert = {
                pointerId: ev.pointerId,
                tempIndex: routePos,
                tempMarker, // Store for cleanup
                prevSources,
                prevIndices,
                prevRouteLooping: !!this.routeLooping,
                hoverMarker: null,
                hoverOccupied: false
            };

            // Clear pointer down time to prevent click handling
            this.pointerDownTime = 0;

            try { this.canvas.style.cursor = 'grabbing'; } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.startRouteInsert.setCursor'); }

        } catch (err) {
            this.errorHandler.logDebug('Route insert start failed', 'InteractiveMap.startRouteInsert', { error: err });
            // Clean up pooled objects on failure
            if (this._routeInsert && this._routeInsert.tempMarker && typeof markerPool !== 'undefined') {
                markerPool.release(this._routeInsert.tempMarker);
            }
            this._routeInsert = null;
        }
    }

    // Handle route node drag start
    _handleRouteNodeDragStart(ev, hit, localX, localY, downTime) {
        try {
            if (!this.editRouteMode || !hit || !hit.marker) return;
            if (!Array.isArray(this.currentRoute) || !Array.isArray(this._routeSources)) return;

            // Find the route position of this marker
            const routePos = RouteUtilsCore.findRoutePositionOfMarker(hit.marker.uid, this.currentRoute, this._routeSources);

            if (routePos === -1) return; // Marker not in current route

            // Set up route node candidate for dragging
            this._routeNodeCandidate = {
                pointerId: ev.pointerId,
                routePos: routePos,
                startClientX: ev.clientX,
                startClientY: ev.clientY
            };

            // Clear pointer down time to prevent click handling
            this.pointerDownTime = 0;

        } catch (err) {
            this.errorHandler.logDebug('Route node drag start failed', 'InteractiveMap.handleRouteNodeDragStart', { error: err });
            this._routeNodeCandidate = null;
        }
    }
    
    showTooltip(marker, x, y, layerKey) {
        if (!this.tooltip) return;

        // Determine layer key: explicit param, or selected/hovered fallback
        const key = layerKey || this.selectedMarkerLayer || this.hoveredMarkerLayer;
        let layerName = 'Marker';
        if (key && LAYERS[key]) {
            layerName = LAYERS[key].name;
        }

        // Try to find the marker index in the layer (1-based for display)
        let displayIndex = null;
        if (key && LAYERS[key] && Array.isArray(LAYERS[key].markers)) {
            const arr = LAYERS[key].markers;
            for (let i = 0; i < arr.length; i++) {
                if (arr[i].uid === marker.uid) { displayIndex = i + 1; break; }
            }
        }

        // Display layer name, optional index, then marker UID
        const idxPart = (displayIndex !== null) ? ` ${displayIndex}` : '';
        this.tooltip.textContent = `${layerName}${idxPart} - ${marker.uid}`;
        // Compute desired position (relative to map container since tooltip has been moved into it)
        const margin = 6;
        try {
            const parent = this.tooltip.parentElement;
            let canvasOffsetLeft = 0, canvasOffsetTop = 0;
            try {
                if (this.canvas && parent) {
                    const canvasRect = this.canvas.getBoundingClientRect();
                    const parentRect = parent.getBoundingClientRect();
                    canvasOffsetLeft = Math.round(canvasRect.left - parentRect.left);
                    canvasOffsetTop = Math.round(canvasRect.top - parentRect.top);
                }
            } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.showTooltip.computeOffsets'); }

            let desiredLeft = Math.round(canvasOffsetLeft + x + 15);
            let desiredTop = Math.round(canvasOffsetTop + y - 10);

            // Clamp to container bounds so tooltip doesn't overflow
            if (parent) {
                const maxLeft = Math.max(0, parent.clientWidth - (this.tooltip.offsetWidth || 120) - margin);
                const maxTop = Math.max(0, parent.clientHeight - (this.tooltip.offsetHeight || 28) - margin);
                desiredLeft = Math.min(Math.max(desiredLeft, margin), maxLeft);
                desiredTop = Math.min(Math.max(desiredTop, margin), maxTop);
            }
            this.tooltip.style.left = `${desiredLeft}px`;
            this.tooltip.style.top = `${desiredTop}px`;
        } catch (e) { 
            this.errorHandler.logError(e, 'InteractiveMap.showTooltip.positioning');
            try { this.tooltip.style.left = `${x + 15}px`; this.tooltip.style.top = `${y - 10}px`; } catch (e) { 
                this.errorHandler.logError(e, 'InteractiveMap.showTooltip.fallbackPositioning');
            }
        }
        // Style tooltip using the layer's color when available
        try {
            const layerCol = (key && LAYERS && LAYERS[key] && LAYERS[key].color) ? LAYERS[key].color : null;
            if (layerCol) {
                try { this.tooltip.style.borderColor = layerCol; } catch (e) { 
                    this.errorHandler.logError(e, 'InteractiveMap.showTooltip.setBorderColor');
                }
                try { if (typeof colorToRgba === 'function') this.tooltip.style.background = colorToRgba(layerCol, 0.12) || this.tooltip.style.background; } catch (e) { 
                    this.errorHandler.logError(e, 'InteractiveMap.showTooltip.setBackgroundColor');
                }
            } else {
                try { this.tooltip.style.borderColor = '#22d3ee'; } catch (e) { 
                    this.errorHandler.logError(e, 'InteractiveMap.showTooltip.setDefaultBorderColor');
                }
                try { this.tooltip.style.background = 'rgba(10, 25, 41, 0.95)'; } catch (e) { 
                    this.errorHandler.logError(e, 'InteractiveMap.showTooltip.setDefaultBackground');
                }
            }
        } catch (e) { 
            this.errorHandler.logError(e, 'InteractiveMap.showTooltip.styling');
        }
        this.tooltip.style.display = 'block';
    }
    
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
    }

    
    render() {
        // Full redraw: use RenderPipeline exclusively
        if (this.renderPipeline && typeof this.renderPipeline.render === 'function') {
            try {
                this.renderPipeline.render();
            } catch (e) {
                this.errorHandler.logDebug('map.render: renderPipeline.render failed', 'InteractiveMap.render.renderPipeline', { error: e });
                // Fall back to individual renderers with renderContext
                const fallbackRenderContext = typeof RenderContext !== 'undefined' ? RenderContext.fromMap(this) : null;
                try { if (this.tileRenderer && typeof this.tileRenderer.render === 'function') this.tileRenderer.render(fallbackRenderContext); } catch (err) { this.errorHandler.logDebug('renderTiles: tileRenderer.render failed', 'InteractiveMap.render.tileRenderer', { error: err }); }
                try { if (this.heatmapRenderer && typeof this.heatmapRenderer.render === 'function') this.heatmapRenderer.render(fallbackRenderContext); } catch (err) { this.errorHandler.logDebug('renderHeatmap: heatmapRenderer.render failed', 'InteractiveMap.render.heatmapRenderer', { error: err }); }
                try { if (this.gridRenderer && typeof this.gridRenderer.render === 'function') this.gridRenderer.render(fallbackRenderContext); } catch (err) { this.errorHandler.logDebug('renderGrid: gridRenderer.render failed', 'InteractiveMap.render.gridRenderer', { error: err }); }
                try { if (this.markerRenderer && typeof this.markerRenderer.render === 'function') this.markerRenderer.render(fallbackRenderContext); } catch (err) { this.errorHandler.logDebug('renderMarkers: markerRenderer.render failed', 'InteractiveMap.render.markerRenderer', { error: err }); }
                try { if (this.routeRenderer && typeof this.routeRenderer.render === 'function') this.routeRenderer.render(fallbackRenderContext); } catch (err) { this.errorHandler.logDebug('renderRoute: routeRenderer.render failed', 'InteractiveMap.render.routeRenderer', { error: err }); }
                try { if (this.overlayRenderer && typeof this.overlayRenderer.render === 'function') this.overlayRenderer.render(fallbackRenderContext); } catch (err) { this.errorHandler.logDebug('renderOverlay: overlayRenderer.render failed', 'InteractiveMap.render.overlayRenderer', { error: err }); }
                return;
            }
            // Ensure DOM quadrant labels are updated
            try { if (this.gridRenderer && typeof this.gridRenderer.updateQuadLabels === 'function') this.gridRenderer.updateQuadLabels(); } catch (e) { 
                this.errorHandler.logError(e, 'InteractiveMap.render.updateQuadLabels');
            }
            return;
        }

        // Fallback: individual renderers (legacy path)
        try { if (this.tileRenderer && typeof this.tileRenderer.render === 'function') this.tileRenderer.render(); } catch (e) { this.errorHandler.logDebug('renderTiles: tileRenderer.render failed', 'InteractiveMap.render.fallback.tileRenderer', { error: e }); }
        try { if (this.heatmapRenderer && typeof this.heatmapRenderer.render === 'function') this.heatmapRenderer.render(); } catch (e) { this.errorHandler.logDebug('renderHeatmap: heatmapRenderer.render failed', 'InteractiveMap.render.fallback.heatmapRenderer', { error: e }); }
        try { if (this.gridRenderer && typeof this.gridRenderer.render === 'function') this.gridRenderer.render(); } catch (e) { this.errorHandler.logDebug('renderGrid: gridRenderer.render failed', 'InteractiveMap.render.fallback.gridRenderer', { error: e }); }
        try { if (this.markerRenderer && typeof this.markerRenderer.render === 'function') this.markerRenderer.render(); } catch (e) { this.errorHandler.logDebug('renderMarkers: markerRenderer.render failed', 'InteractiveMap.render.fallback.markerRenderer', { error: e }); }
        try { if (this.routeRenderer && typeof this.routeRenderer.render === 'function') this.routeRenderer.render(); } catch (e) { this.errorHandler.logDebug('renderRoute: routeRenderer.render failed', 'InteractiveMap.render.fallback.routeRenderer', { error: e }); }
        try { if (this.overlayRenderer && typeof this.overlayRenderer.render === 'function') this.overlayRenderer.render(); } catch (e) { this.errorHandler.logDebug('renderOverlay: overlayRenderer.render failed', 'InteractiveMap.render.fallback.overlayRenderer', { error: e }); }
        // Ensure DOM quadrant labels are updated
        try { if (this.gridRenderer && typeof this.gridRenderer.updateQuadLabels === 'function') this.gridRenderer.updateQuadLabels(); } catch (e) { 
            this.errorHandler.logError(e, 'InteractiveMap.render.fallback.updateQuadLabels');
        }
    }

    /**
     * Marks a specific renderer as dirty, scheduling a selective render.
     * Use this instead of calling render() directly for better performance.
     * @param {string} rendererName - The constructor name of the renderer (e.g., 'TileRenderer')
     */
    markRendererDirty(rendererName) {
        if (this.renderPipeline && typeof this.renderPipeline.markDirty === 'function') {
            this.renderPipeline.markDirty(rendererName);
        } else {
            // Fallback: trigger full render if pipeline doesn't support dirty flags
            this.requestRender();
        }
    }

    /**
     * Requests a batched render using the render pipeline's dirty flag system.
     * Multiple calls in the same frame will be batched together.
     */
    requestRender() {
        if (this.renderPipeline && typeof this.renderPipeline.markDirty === 'function') {
            // Mark all renderers as dirty for a full render
            const allRenderers = ['TileRenderer', 'HeatmapRenderer', 'GridRenderer', 'MarkerRenderer', 'RouteRenderer', 'OverlayRenderer'];
            allRenderers.forEach(name => this.renderPipeline.markDirty(name));
        } else {
            // Fallback: immediate render if pipeline doesn't support dirty flags
            this.render();
        }
    }

    /**
     * Forces an immediate full render, bypassing the dirty flag batching system.
     * Use this for initial setup or when immediate visual feedback is required.
     */
    forceRender() {
        this.render();
    }

    // Draw only the overlay contents (route, markers, tooltip).


    // Draw the quadrant grid separating the map into 4 equal sections
    renderQuadrantGrid() {
        try { this.gridRenderer.renderQuadrantGrid(); } catch (e) { this.errorHandler.logDebug('map.renderQuadrantGrid delegate failed', 'InteractiveMap.renderQuadrantGrid', { error: e }); }
    }


    // Draw fine detail grid covering the map area (8x8 subdivision)
    renderDetailGrid() {
        try { this.gridRenderer.renderDetailGrid(); } catch (e) { this.errorHandler.logDebug('map.renderDetailGrid delegate failed', 'InteractiveMap.renderDetailGrid', { error: e }); }
    }
            



    
    // Draw axis index labels for the 8x8 grid
    renderAxisLabels() {
        try { this.gridRenderer.renderAxisLabels(); } catch (e) { this.errorHandler.logDebug('map.renderAxisLabels delegate failed', 'InteractiveMap.renderAxisLabels', { error: e }); }
    }
    
    // Helper: lighten a hex color by a given percentage
    lightenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
    
    // Helper: darken a hex color by a given percentage
    darkenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
    
    // Get marker base size from config
    getMarkerBaseSize() {
        return MP4Config.MARKER_SCALING.baseSize;
    }

    // Get marker user scale multiplier from config
    getMarkerUserScaleMultiplier() {
        return MP4Config.MARKER_SCALING.userScaleMultiplier;
    }

    // Get marker highlight multiplier from config
    getMarkerHighlightMultiplier() {
        return MP4Config.MARKER_SCALING.highlightMultiplier;
    }

    // Delegated to MarkerRenderer
    getHitRadius() {
        if (!this.markerRenderer || typeof this.markerRenderer.getHitRadius !== 'function') throw new Error('getHitRadius removed from map; use markerRenderer.getHitRadius instead');
        return this.markerRenderer.getHitRadius();
    }

    // Delegated to MarkerRenderer
    getMarkerHitRadius(marker, layerKey) {
        if (!this.markerRenderer || typeof this.markerRenderer.getMarkerHitRadius !== 'function') throw new Error('getMarkerHitRadius removed from map; use markerRenderer.getMarkerHitRadius instead');
        return this.markerRenderer.getMarkerHitRadius(marker, layerKey);
    }

    // Delegated to MarkerRenderer
    getMarkerRenderSize(marker, layerKey) {
        if (!this.markerRenderer || typeof this.markerRenderer.getMarkerRenderSize !== 'function') throw new Error('getMarkerRenderSize removed from map; use markerRenderer.getMarkerRenderSize instead');
        return this.markerRenderer.getMarkerRenderSize(marker, layerKey);
    }

    // Update marker base size and save to storage (consent-gated)
    updateMarkerBaseSize(newSize) {
        MP4Config.MARKER_SCALING.baseSize = Math.max(2, Math.min(12, newSize));
        try {
            if (window.storageService && window.storageService.hasConsent()) {
                window.storageService.set(MP4Config.STORAGE_KEYS.MARKER_SCALING, {
                    userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                    highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                });
            } else if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent() && typeof StorageInterface !== 'undefined') {
                StorageInterface.saveMarkerScaling({
                    userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                    highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                });
            }
        } catch (e) {
            this.errorHandler.logDebug('Failed to save marker scaling config', 'InteractiveMap.updateMarkerBaseSize', { error: e });
        }
        // Trigger re-render to show new sizes
        this.render();
    }

    // Update marker user scale multiplier and save to storage (consent-gated)
    updateMarkerUserScaleMultiplier(newMultiplier) {
        MP4Config.MARKER_SCALING.userScaleMultiplier = Math.max(0.5, Math.min(1.5, newMultiplier));
        try {
            if (window.storageService && window.storageService.hasConsent()) {
                window.storageService.set(MP4Config.STORAGE_KEYS.MARKER_SCALING, {
                    userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                    highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                });
            } else if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent() && typeof StorageInterface !== 'undefined') {
                StorageInterface.saveMarkerScaling({
                    userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                    highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                });
            }
        } catch (e) {
            this.errorHandler.logDebug('Failed to save marker scaling config', 'InteractiveMap.updateMarkerUserScaleMultiplier', { error: e });
        }
        // Trigger re-render to show new sizes
        this.render();
    }

    // Update marker highlight multiplier and save to storage (consent-gated)
    updateMarkerHighlightMultiplier(newMultiplier) {
        MP4Config.MARKER_SCALING.highlightMultiplier = Math.max(1.5, Math.min(2.5, newMultiplier));
        try {
            if (window.storageService && window.storageService.hasConsent()) {
                window.storageService.set(MP4Config.STORAGE_KEYS.MARKER_SCALING, {
                    userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                    highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                });
            } else if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent() && typeof StorageInterface !== 'undefined') {
                StorageInterface.saveMarkerScaling({
                    userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                    highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                });
            }
        } catch (e) {
            this.errorHandler.logDebug('Failed to save marker scaling config', 'InteractiveMap.updateMarkerHighlightMultiplier', { error: e });
        }
        // Trigger re-render to show new sizes
        this.render();
    }
    




    setRoute(routeIndices, lengthNormalized, routeSources) {
        if (this.routeManager) {
            this.routeManager.setRoute(routeIndices, lengthNormalized, routeSources);
        } else {
            // Fallback for when routeManager is not available
            this.errorHandler.logWarning('RouteManager not available, cannot set route', 'InteractiveMap.setRoute');
        }
        
        // Reset the start-point flag when a new route is set (will be overridden by generation if applicable)
        // Do not change `routeLooping` here — looping is controlled explicitly by user preference.

        // Invalidate route renderer caches when route changes
        try {
            if (this.routeRenderer && typeof this.routeRenderer.invalidateCache === 'function') {
                this.routeRenderer.invalidateCache();
            }
        } catch (e) {
            this.errorHandler.logDebug('Failed to invalidate route renderer cache', 'InteractiveMap.setRoute.invalidateCache', { error: e });
        }

        // Update route length display in sidebar
        try {
            // Layer counts will be updated via ROUTE_UPDATED event
        } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setRoute.updateLayerCounts'); }

        // Update loop UI if route looping state changed
        try { this.updateLoopUI(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setRoute.updateLoopUI'); }

        this.render();
        // Start animated route when a route is set
        if (this.currentRoute && this.currentRoute.length) {
            // Ensure the virtual 'route' layer is visible so the computed route appears
            if (this.layerState) {
                this.layerState.setLayerVisible('route', true);
            }
            // If the sidebar toggle exists, check it so the UI reflects the change
            try {
                const cb = document.getElementById('toggle_route');
                if (cb) cb.checked = true;
            } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setRoute.updateRouteToggle'); }
            this.startRouteAnimation();
            // Persist the route so it survives reloads
            try { this.saveRouteToStorage(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setRoute.saveRouteToStorage'); }
        } else {
            this.stopRouteAnimation();
        }
    }

    clearRoute() {
        // Check for active drag operations and cancel them before clearing
        if (this.pointerHandler && 
            (this._routeInsert || this._routeNodeCandidate || this._draggingMarker)) {
            this.pointerHandler._cancelRouteDragOperations('Route clearing');
        }
        
        if (this.routeManager) {
            this.routeManager.clearRoute();
        }

        // Invalidate route renderer caches when route is cleared
        try {
            if (this.routeRenderer && typeof this.routeRenderer.invalidateCache === 'function') {
                this.routeRenderer.invalidateCache();
            }
        } catch (e) {
            this.errorHandler.logDebug('Failed to invalidate route renderer cache', 'InteractiveMap.clearRoute.invalidateCache', { error: e });
        }

        // Update UI counts via the central updater so it shows '0'
        try {
            // Layer counts will be updated via ROUTE_CLEARED event
        } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.clearRoute.updateLayerCounts'); }
        this.render();
        // Stop animated route when cleared
        this.stopRouteAnimation();
        // If we were in route edit mode, exit via canonical helper so visuals cleanly update
        try { if (window.eventBus) window.eventBus.emit(window.EventTypes.EDIT_MODE_EXIT_REQUESTED, { layer: 'route' }); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.clearRoute.exitEditModeForLayer'); }
        // Remove persisted route when cleared
        try {
            this.routeManager.clearRoute();
        } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.clearRoute.clearRoute'); }
    }

    // Persist the current route to localStorage as an ordered list of positions with uid and layer info
    saveRouteToStorage() {
        this.routeManager.saveToStorage();
    }

    // Attempt to load a previously saved route from localStorage and apply it
    loadRouteFromStorage() {
        this.routeManager.loadFromStorage();
    }

    startRouteAnimation() {
        if (typeof RouteAnimation !== 'undefined' && typeof RouteAnimation.startAnimation === 'function') {
            RouteAnimation.startAnimation(this);
        }
    }

    stopRouteAnimation() {
        if (typeof RouteAnimation !== 'undefined' && typeof RouteAnimation.stopAnimation === 'function') {
            RouteAnimation.stopAnimation(this);
        }
    }
}

// Module-level error handler for utility functions
const moduleErrorHandler = typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler();

// Initialize
let map;

// LocalStorage helpers for layer visibility persistence
function loadLayerVisibilityFromStorage() {
    try {
        // Use StorageService if available, otherwise fall back to legacy method
        if (window.storageService && typeof window.storageService.loadSetting === 'function') {
            return window.storageService.loadSetting(MP4Config.STORAGE_KEYS.LAYER_VISIBILITY);
        } else {
            // Fallback to legacy method
            if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                return window._mp4Storage.loadSetting('mp4_layerVisibility');
            }
            return null;
        }
    } catch (e) {
        moduleErrorHandler.logError(e, 'loadLayerVisibilityFromStorage');
        return null;
    }
}

function saveLayerVisibilityToStorage(obj) {
    try {
        // Use StorageService if available, otherwise fall back to legacy method
        if (window.storageService && typeof window.storageService.saveSetting === 'function') {
            window.storageService.saveSetting(MP4Config.STORAGE_KEYS.LAYER_VISIBILITY, obj || {});
        } else {
            // Fallback to legacy method
            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                window._mp4Storage.saveSetting('mp4_layerVisibility', obj || {});
            }
        }
    } catch (e) { moduleErrorHandler.logError(e, 'saveLayerVisibilityToStorage'); }
}

// Highlight multiplier persistence
function loadHighlightMultiplierFromStorage() {
    try {
        // Use StorageService if available, otherwise fall back to legacy method
        if (window.storageService && typeof window.storageService.loadSetting === 'function') {
            const v = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.HIGHLIGHT_MULTIPLIER);
            if (v === null || typeof v === 'undefined') return null;
            return (typeof v === 'string') ? parseFloat(v) : Number(v);
        } else {
            // Fallback to legacy method
            if (!window._mp4Storage || typeof window._mp4Storage.hasStorageConsent !== 'function' || !window._mp4Storage.hasStorageConsent()) return null;
            const v = (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') ? window._mp4Storage.loadSetting('mp4_highlightMultiplier') : null;
            if (v === null || typeof v === 'undefined') return null;
            return (typeof v === 'string') ? parseFloat(v) : Number(v);
        }
    } catch (e) { moduleErrorHandler.logError(e, 'loadHighlightMultiplierFromStorage'); return null; }
}

function saveHighlightMultiplierToStorage(v) {
    try {
        // Use StorageService if available, otherwise fall back to legacy method
        if (window.storageService && typeof window.storageService.saveSetting === 'function') {
            window.storageService.saveSetting(MP4Config.STORAGE_KEYS.HIGHLIGHT_MULTIPLIER, v);
        } else {
            // Fallback to legacy method
            if (!window._mp4Storage || typeof window._mp4Storage.hasStorageConsent !== 'function' || !window._mp4Storage.hasStorageConsent()) return;
            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                window._mp4Storage.saveSetting('mp4_highlightMultiplier', v);
            }
        }
    } catch (e) { moduleErrorHandler.logError(e, 'saveHighlightMultiplierToStorage'); }
}

// Highlighted layers persistence (consent-gated)
function loadHighlightedLayersFromStorage() {
    try {
        // Use StorageService if available, otherwise fall back to legacy method
        if (window.storageService && typeof window.storageService.loadSetting === 'function') {
            const s = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.HIGHLIGHTED_LAYERS);
            if (!s) return null;
            return s;
        } else {
            // Fallback to legacy method
            if (!window._mp4Storage || typeof window._mp4Storage.hasStorageConsent !== 'function' || !window._mp4Storage.hasStorageConsent()) return null;
            const s = (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') ? window._mp4Storage.loadSetting('mp4_highlighted_layers') : null;
            if (!s) return null;
            return s;
        }
    } catch (e) { moduleErrorHandler.logError(e, 'loadHighlightedLayersFromStorage'); return null; }
}

function saveHighlightedLayersToStorage(obj) {
    try {
        // Use StorageService if available, otherwise fall back to legacy method
        if (window.storageService && typeof window.storageService.saveSetting === 'function') {
            window.storageService.saveSetting(MP4Config.STORAGE_KEYS.HIGHLIGHTED_LAYERS, obj || {});
        } else {
            // Fallback to legacy method
            if (!window._mp4Storage || typeof window._mp4Storage.hasStorageConsent !== 'function' || !window._mp4Storage.hasStorageConsent()) return;
            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                window._mp4Storage.saveSetting('mp4_highlighted_layers', obj || {});
            }
        }
    } catch (e) { moduleErrorHandler.logError(e, 'saveHighlightedLayersToStorage'); }
}

// Module-scoped variables for edit overlay RAF and timer (shared with init() updateEditOverlay)
let _editOverlayRaf_module = null;
let _overlayHideTimer_module = null;

// Helper: properly hide the edit overlay with RAF cancellation and transition cleanup
// This replicates the "turning off" path from updateEditOverlay() but at module scope
function hideEditOverlayProperly() {
    try {
        const ov = document.getElementById('editOverlay');
        if (!ov) return;
        // Cancel any ongoing RAF
        if (_editOverlayRaf_module) { try { cancelAnimationFrame(_editOverlayRaf_module); } catch (e) { moduleErrorHandler.logError(e, 'hideEditOverlayProperly.cancelAnimationFrame'); } _editOverlayRaf_module = null; }
        // Start fade-out by removing visible class
        ov.classList.remove('visible');
        // Keep aria-hidden=false during fade; only mark hidden after transition completes
        try { ov.setAttribute('aria-hidden', 'false'); } catch (e) { moduleErrorHandler.logError(e, 'hideEditOverlayProperly.setAriaHiddenFalse'); }
        if (_overlayHideTimer_module) { try { clearTimeout(_overlayHideTimer_module); } catch (e) { moduleErrorHandler.logError(e, 'hideEditOverlayProperly.clearTimeout'); } }
        _overlayHideTimer_module = setTimeout(() => {
            try {
                // If overlay was re-enabled in the meantime, don't clear
                if (map && (map.editMarkersMode || map.editRouteMode)) { _overlayHideTimer_module = null; return; }
                try { ov.setAttribute('aria-hidden', 'true'); } catch (e) { moduleErrorHandler.logError(e, 'hideEditOverlayProperly.setAriaHiddenTrue'); }
                try { ov.style.left = ''; ov.style.top = ''; ov.style.width = ''; ov.style.height = ''; ov.style.backgroundColor = ''; } catch (e) { moduleErrorHandler.logError(e, 'hideEditOverlayProperly.resetStyles'); }
            } catch (e) { moduleErrorHandler.logError(e, 'hideEditOverlayProperly.timeoutCallback'); }
            _overlayHideTimer_module = null;
        }, 220);
    } catch (e) { moduleErrorHandler.logError(e, 'hideEditOverlayProperly'); }
}

// Helper: exit edit mode for a layer if it's currently in edit mode
// This is the canonical exit path used by Hide All, manual toggle, and swipe toggle
// Defined at module scope so it's accessible from both initializeLayerIcons() and init()
function exitEditModeForLayer(layerKey) {
    try {
        if (layerKey === 'customMarkers' && map && map.editMarkersMode) {
            map.editMarkersMode = false;
            try { map._exitEditMode && map._exitEditMode('customMarkers'); } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.exitCustomMarkersMode'); }
            try {
                const editToggle = document.getElementById('editMarkersToggle');
                if (editToggle) {
                    editToggle.setAttribute('aria-pressed', 'false');
                    editToggle.classList.remove('active');
                }
            } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.updateEditMarkersToggle'); }
            try {
                const mini = document.getElementById('editMarkersToggleMini');
                if (mini) {
                    mini.classList.remove('glow');
                    mini.setAttribute('aria-pressed', 'false');
                }
            } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.updateMiniEditMarkersToggle'); }
            // Properly hide edit overlay with full cleanup
            hideEditOverlayProperly();
            try { if (map && typeof map.render === 'function') map.render(); } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.renderAfterExitCustomMarkers'); }
        } else if (layerKey === 'route' && map && map.editRouteMode) {
            map.editRouteMode = false;
            try { map._exitEditMode && map._exitEditMode('route'); } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.exitRouteMode'); }
            try {
                const routeEditToggle = document.getElementById('editRouteToggle');
                if (routeEditToggle) {
                    routeEditToggle.setAttribute('aria-pressed', 'false');
                    routeEditToggle.classList.remove('active');
                }
            } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.updateRouteEditToggle'); }
            try {
                const mini = document.getElementById('editRouteToggleMini');
                if (mini) {
                    mini.classList.remove('glow');
                    mini.setAttribute('aria-pressed', 'false');
                }
            } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.updateMiniRouteEditToggle'); }
            // Reset cursor to grab when exiting route edit mode
            try { if (map.canvas) map.canvas.style.cursor = 'grab'; } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.resetCursor'); }
            // Properly hide edit overlay with full cleanup
            hideEditOverlayProperly();
            try { if (map && typeof map.render === 'function') map.render(); } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.renderAfterExitRoute'); }
        }
    } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer'); }
}

// Utility: attach pressed-state handlers to any element matching selector
function attachPressedHandlers(selector) {
    const els = document.querySelectorAll(selector);
    els.forEach(el => {
        // Skip tileset toggles, they have special handling
        if (el.id === 'tilesetSatBtn' || el.id === 'tilesetHoloBtn') return;
        el.addEventListener('pointerdown', () => el.classList.add('pressed'));
        el.addEventListener('pointerup', () => el.classList.remove('pressed'));
        el.addEventListener('pointercancel', () => el.classList.remove('pressed'));
        el.addEventListener('mouseleave', () => el.classList.remove('pressed'));
    });
}

async function init() {
    // Load controller modules
    try {
        // Load controller scripts dynamically
        const controllerScripts = [
            'controllers/SidebarController.js',
            'controllers/ToolbarController.js',
            'controllers/SettingsController.js',
            'controllers/LayerListController.js'
        ];

        for (const script of controllerScripts) {
            if (!document.querySelector(`script[src="${script}"]`)) {
                await new Promise((resolve, reject) => {
                    const scriptEl = document.createElement('script');
                    scriptEl.src = script;
                    scriptEl.onload = resolve;
                    scriptEl.onerror = reject;
                    document.head.appendChild(scriptEl);
                });
            }
        }
    } catch (e) {
        moduleErrorHandler.logDebug('Failed to load controller modules', 'InteractiveMap.loadControllerModules', { error: e });
    }

    // Initialize StorageService with consent checker
    try {
        if (typeof initializeStorageService !== 'undefined') {
            initializeStorageService(window._mp4Storage.hasStorageConsent.bind(window._mp4Storage));
        }
    } catch (e) {
        console.warn('Failed to initialize StorageService:', e);
    }

    // Initialize EventBus for cross-module communication
    try {
        if (typeof eventBus !== 'undefined') {
            eventBus.setErrorHandler(moduleErrorHandler);
            
            // Set up event listeners for cross-module communication
            eventBus.on(window.EventTypes.RENDER_REQUESTED, (data) => {
                try {
                    // Use renderPipeline's batching system instead of direct render()
                    // This ensures multiple render requests in one frame are batched together
                    if (map && map.renderPipeline && typeof map.renderPipeline.markDirty === 'function') {
                        // Mark all renderers dirty for a full render, batched via rAF
                        const allRenderers = ['TileRenderer', 'HeatmapRenderer', 'GridRenderer', 'MarkerRenderer', 'RouteRenderer', 'OverlayRenderer'];
                        allRenderers.forEach(name => map.renderPipeline.markDirty(name));
                    } else if (map && typeof map.render === 'function') {
                        // Fallback if pipeline is not available
                        map.render();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:RENDER_REQUESTED handler');
                }
            });
            
            eventBus.on(window.EventTypes.LAYER_VISIBILITY_CHANGED, (data) => {
                try {
                    // Update layer state manager when controllers change visibility
                    // Only handle events with layerVisibility (from controllers), not layerKey (from layerState itself)
                    if (data && data.layerVisibility && map && map.layerState) {
                        map.layerState.layerVisibility = data.layerVisibility;
                    }
                    // Render when layer visibility changes
                    if (map && typeof map.render === 'function') {
                        map.render();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:LAYER_VISIBILITY_CHANGED handler');
                }
            });
            
            eventBus.on(window.EventTypes.LAYER_COUNTS_CHANGED, (data) => {
                try {
                    if (map && typeof map.updateLayerCounts === 'function') {
                        map.updateLayerCounts();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:LAYER_COUNTS_CHANGED handler');
                }
            });
            
            eventBus.on(window.EventTypes.LAYER_HIGHLIGHT_CHANGED, (data) => {
                try {
                    // Update highlighted layers state
                    if (data && data.highlightedLayers && map) {
                        map.highlightedLayers = data.highlightedLayers;
                    }
                    // Trigger render for highlight changes
                    if (map && typeof map.render === 'function') {
                        map.render();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:LAYER_HIGHLIGHT_CHANGED handler');
                }
            });
            
            eventBus.on(window.EventTypes.SELECTION_CLEARED, (data) => {
                try {
                    if (map && typeof map.render === 'function') {
                        map.render();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:SELECTION_CLEARED handler');
                }
            });
            
            eventBus.on(window.EventTypes.TILESET_CHANGED, (data) => {
                try {
                    // Tileset state has changed, trigger side effects
                    // NOTE: Do NOT call map.setTileset() here - it would emit the event again!
                    // The state has already changed; just handle the consequences.
                    if (map) {
                        try { map.imageState.incrementTilesetGeneration(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_CHANGED - incrementGeneration'); }
                        try { map._abortAndCleanupTileLoads(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_CHANGED - abortTileLoads'); }
                        try { if (window.storageService) { window.storageService.saveSetting(MP4Config.STORAGE_KEYS.TILESET, map.tilesetState.tileset); } } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_CHANGED - saveSetting'); }
                        try { map.preloadAllMapImages(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_CHANGED - preloadImages'); }
                        try { map.loadInitialImage(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_CHANGED - loadInitialImage'); }
                        try { map.markRendererDirty('TileRenderer'); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_CHANGED - markDirty'); }
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:TILESET_CHANGED handler');
                }
            });
            
            eventBus.on(window.EventTypes.TILESET_GRAYSCALE_CHANGED, (data) => {
                try {
                    // Grayscale state has changed, trigger side effects
                    // NOTE: Do NOT call map.setTilesetGrayscale() here - it would emit the event again!
                    if (map) {
                        try { if (window.storageService) { window.storageService.saveSetting(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE, map.tilesetState.grayscale ? '1' : '0'); } } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_GRAYSCALE_CHANGED - saveSetting'); }
                        try { map.imageState.incrementTilesetGeneration(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_GRAYSCALE_CHANGED - incrementGeneration'); }
                        try { map._abortAndCleanupTileLoads(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_GRAYSCALE_CHANGED - abortTileLoads'); }
                        try { map.preloadAllMapImages(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_GRAYSCALE_CHANGED - preloadImages'); }
                        try { map.loadInitialImage(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_GRAYSCALE_CHANGED - loadInitialImage'); }
                        try { map.markRendererDirty('TileRenderer'); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_GRAYSCALE_CHANGED - markDirty'); }
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:TILESET_GRAYSCALE_CHANGED handler');
                }
            });
            
            eventBus.on(window.EventTypes.DISPLAY_SETTINGS_CHANGED, (data) => {
                try {
                    // Display settings have changed, apply them to the map
                    if (map && map.layerState && typeof map.setGridHeatmap === 'function') {
                        map.setGridHeatmap(map.layerState.heatmapVisible, map.layerState.gridVisible);
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:DISPLAY_SETTINGS_CHANGED handler');
                }
            });
            
            eventBus.on(window.EventTypes.MAP_ZOOM_IN_REQUESTED, (data) => {
                try {
                    if (map && typeof map.zoomIn === 'function') {
                        map.zoomIn();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:MAP_ZOOM_IN_REQUESTED handler');
                }
            });
            
            eventBus.on(window.EventTypes.MAP_ZOOM_OUT_REQUESTED, (data) => {
                try {
                    if (map && typeof map.zoomOut === 'function') {
                        map.zoomOut();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:MAP_ZOOM_OUT_REQUESTED handler');
                }
            });
            
            eventBus.on(window.EventTypes.MAP_VIEW_RESET_REQUESTED, (data) => {
                try {
                    if (map && typeof map.resetView === 'function') {
                        map.resetView();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:MAP_VIEW_RESET_REQUESTED handler');
                }
            });
            
            eventBus.on(window.EventTypes.EDIT_MODE_CHANGED, (data) => {
                try {
                    // Edit mode changes require a render to show/hide edit overlays
                    if (map && typeof map.render === 'function') {
                        map.render();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:EDIT_MODE_CHANGED handler');
                }
            });

            eventBus.on(window.EventTypes.TOOLTIP_HIDE_REQUESTED, (data) => {
                try {
                    if (map && typeof map.hideTooltip === 'function') {
                        map.hideTooltip();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:TOOLTIP_HIDE_REQUESTED handler');
                }
            });

            eventBus.on(window.EventTypes.EDIT_MODE_ENTER_REQUESTED, (data) => {
                try {
                    if (map && typeof map._enterEditMode === 'function' && data && data.mode) {
                        map._enterEditMode(data.mode, data.scale || 2.0);
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:EDIT_MODE_ENTER_REQUESTED handler');
                }
            });

            eventBus.on(window.EventTypes.EDIT_MODE_EXIT_REQUESTED, (data) => {
                try {
                    if (map && typeof map._exitEditMode === 'function' && data && data.mode) {
                        map._exitEditMode(data.mode);
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:EDIT_MODE_EXIT_REQUESTED handler');
                }
            });
            
            // State synchronization listeners
            eventBus.on(window.EventTypes.SELECTION_CHANGED, (data) => {
                try {
                    // NOTE: Do NOT try to sync back to SelectionState here!
                    // The SELECTION_CHANGED event was GENERATED BY SelectionState
                    // Syncing back would create an infinite loop:
                    // Event fired → setSelectedMarker called → SelectionState emits event → back to here → loop
                    
                    // Only perform side effects: rendering and UI updates
                    // The actual state is already updated in SelectionState
                    
                    // Trigger selective render for selection changes using dirty flag system
                    // OverlayRenderer is the only renderer affected by marker selection changes
                    if (map && typeof map.markRendererDirty === 'function') {
                        map.markRendererDirty('OverlayRenderer');
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:SELECTION_CHANGED handler');
                }
            });
            
            eventBus.on(window.EventTypes.MAP_VIEW_CHANGED, (data) => {
                try {
                    // MAP_VIEW_CHANGED event comes FROM mapState, so don't call setPan/setZoom again
                    // (that would create an infinite loop). Just handle derived effects and rendering.
                    if (data && map && map.mapState) {
                        // If zoom changed, update resolution and image state
                        if (typeof data.zoom === 'number' && data.zoom !== map.mapState.zoom) {
                            map.imageState && map.imageState.updateResolution && map.imageState.updateResolution();
                            map.updateResolution && map.updateResolution();
                        }
                        // Trigger render for view changes (map.mapState already has the new panX, panY, zoom)
                        if (map && typeof map.render === 'function') {
                            map.render();
                        }
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:MAP_VIEW_CHANGED handler');
                }
            });
            
            eventBus.on(window.EventTypes.ROUTE_UPDATED, (data) => {
                try {
                    // Update route state
                    if (data && map && map.routeState) {
                        if (data.route) {
                            map.routeState.setRoute(data.route);
                        }
                        if (typeof data.looping === 'boolean') {
                            map.routeState.setRouteLooping(data.looping);
                        }
                        // Update layer counts for route length display
                        if (map && typeof map.updateLayerCounts === 'function') {
                            map.updateLayerCounts();
                        }
                        // Trigger render for route changes
                        if (map && typeof map.render === 'function') {
                            map.render();
                        }
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:ROUTE_UPDATED handler');
                }
            });
            
            eventBus.on(window.EventTypes.ROUTE_CLEARED, (data) => {
                try {
                    // Update layer counts to show route length as 0
                    if (map && typeof map.updateLayerCounts === 'function') {
                        map.updateLayerCounts();
                    }
                    // Trigger render for route clearing
                    if (map && typeof map.render === 'function') {
                        map.render();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:ROUTE_CLEARED handler');
                }
            });

            // Marker event listeners
            eventBus.on(window.EventTypes.MARKER_ADDED, (data) => {
                try {
                    if (map && typeof map.updateLayerCounts === 'function') {
                        map.updateLayerCounts();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:MARKER_ADDED handler');
                }
            });

            eventBus.on(window.EventTypes.MARKER_REMOVED, (data) => {
                try {
                    if (map && typeof map.updateLayerCounts === 'function') {
                        map.updateLayerCounts();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:MARKER_REMOVED handler');
                }
            });

            eventBus.on(window.EventTypes.MARKER_EDITED, (data) => {
                try {
                    if (map && typeof map.updateLayerCounts === 'function') {
                        map.updateLayerCounts();
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:MARKER_EDITED handler');
                }
            });

            // Phase 3: Global Function Eventification - Event Handlers
            eventBus.on(window.EventTypes.EDIT_OVERLAY_UPDATE_REQUESTED, (data) => {
                try {
                    updateEditOverlay();
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:EDIT_OVERLAY_UPDATE_REQUESTED handler');
                }
            });

            eventBus.on(window.EventTypes.LAYER_VISIBILITY_SAVE_REQUESTED, (data) => {
                try {
                    if (data && data.layerVisibility) {
                        saveLayerVisibilityToStorage(data.layerVisibility);
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:LAYER_VISIBILITY_SAVE_REQUESTED handler');
                }
            });

            eventBus.on(window.EventTypes.HIGHLIGHT_MULTIPLIER_SAVE_REQUESTED, (data) => {
                try {
                    if (data && typeof data.multiplier === 'number') {
                        saveHighlightMultiplierToStorage(data.multiplier);
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:HIGHLIGHT_MULTIPLIER_SAVE_REQUESTED handler');
                }
            });

            eventBus.on(window.EventTypes.HIGHLIGHTED_LAYERS_SAVE_REQUESTED, (data) => {
                try {
                    if (data && data.highlightConfig) {
                        saveHighlightedLayersToStorage(data.highlightConfig);
                    }
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:HIGHLIGHTED_LAYERS_SAVE_REQUESTED handler');
                }
            });

            eventBus.on(window.EventTypes.ROUTE_COMPUTATION_REQUESTED, (data) => {
                try {
                    beginRouteCompute();
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:ROUTE_COMPUTATION_REQUESTED handler');
                }
            });
            eventBus.on(window.EventTypes.SIDEBAR_VISIBILITY_TOGGLE_REQUESTED, (data) => {
                try {
                    const app = document.querySelector('.app-container');
                    const collapsed = app.classList.contains('sidebar-collapsed');
                    setSidebarCollapsed(!collapsed);
                } catch (e) {
                    moduleErrorHandler.logError(e, 'EventBus:SIDEBAR_VISIBILITY_TOGGLE_REQUESTED handler');
                }
            });
        }
    } catch (e) {
        console.warn('Failed to initialize EventBus:', e);
    }

    // Create map
    map = new InteractiveMap('mapCanvas');
    // Expose map globally for renderers and other modules to access
    window.interactiveMap = map;
        // Highlighting runtime state: delegated to HighlightState
        try {
            // For backward compatibility, expose highlighting through modular HighlightState
            // Old properties left intact for legacy code, but these now delegate to highlightState
            Object.defineProperty(map, 'highlightedLayers', {
                get() {
                    return this.highlightState ? this.highlightState.highlightedLayers : new Set();
                },
                set(value) {
                    if (this.highlightState && value instanceof Set) {
                        this.highlightState.highlightedLayers = value;
                    }
                }
            });

            Object.defineProperty(map, '_highlightConfig', {
                get() {
                    return this.highlightState ? this.highlightState.highlightConfig : {};
                },
                set(value) {
                    if (this.highlightState && typeof value === 'object') {
                        this.highlightState.highlightConfig = value;
                    }
                }
            });

            // Delegate highlighting methods to highlightState
            map.setLayerHighlight = function(layerKey, scale) {
                if (this.highlightState && typeof this.highlightState.setLayerHighlight === 'function') {
                    this.highlightState.setLayerHighlight(layerKey, scale);
                }
            };

            map.clearLayerHighlight = function(layerKey) {
                if (this.highlightState && typeof this.highlightState.clearLayerHighlight === 'function') {
                    this.highlightState.clearLayerHighlight(layerKey);
                }
            };

            map.toggleLayerHighlight = function(layerKey, scale) {
                if (this.highlightState && typeof this.highlightState.toggleLayerHighlight === 'function') {
                    this.highlightState.toggleLayerHighlight(layerKey, scale);
                }
            };


            // Store previous highlight state for layers so edit-mode can restore it later
            // State tracking functions removed - edit mode no longer modifies highlight state

            // Read the inline highlight color from CSS (exposed as --layer-inline-highlight-color)
            map.getLayerInlineOutlineColor = function(layerKey) {
                try {
                    const row = document.querySelector('#layerList .layer-toggle[data-layer="' + layerKey + '"]');
                    if (!row) return '#22d3ee';
                    const s = window.getComputedStyle(row).getPropertyValue('--layer-inline-highlight-color');
                    if (s && s.trim()) return s.trim();
                } catch (e) { _logError(e, 'getLayerInlineOutlineColor.cssQuery'); }
                return '#22d3ee';
            };

            // Enter/exit edit-mode helpers that ensure outline is turned on and colored
            map._enterEditMode = function(layerKey, scale) {
                try {
                    // add edit-mode-outline class only for route and marker layers
                    const editableLayers = ['route', 'customMarkers', 'greenCrystals'];
                    if (editableLayers.includes(layerKey)) {
                        try {
                            const row = document.querySelector('#layerList .layer-toggle[data-layer="' + layerKey + '"]');
                            if (row) {
                                // Set edit-mode outline color from layer's configured color
                                const layerColor = (typeof LAYERS !== 'undefined' && LAYERS && LAYERS[layerKey] && LAYERS[layerKey].color) ? LAYERS[layerKey].color : '#a78bfa';
                                row.style.setProperty('--edit-mode-outline-color', layerColor);
                                row.classList.add('edit-mode-outline');
                            }
                        } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._enterEditMode.setOutlineColor'); }
                    }
                } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._enterEditMode'); }
            };

            map._exitEditMode = function(layerKey) {
                try {
                    // remove edit-mode-outline class
                    try {
                        const row = document.querySelector('#layerList .layer-toggle[data-layer="' + layerKey + '"]');
                        if (row) {
                            row.classList.remove('edit-mode-outline');
                            row.style.removeProperty('--edit-mode-outline-color');
                        }
                    } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._exitEditMode.removeOutline'); }
                    // Reset cursor when exiting route edit mode
                    if (layerKey === 'route') {
                        try { if (map.canvas) map.canvas.style.cursor = 'grab'; } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._exitEditMode.resetCursor'); }
                    }
                } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._exitEditMode'); }
            };
            // Apply any previously saved highlighted layers (consent-gated)
            try {
                const saved = (typeof loadHighlightedLayersFromStorage === 'function') ? loadHighlightedLayersFromStorage() : null;
                if (saved && typeof saved === 'object') {
                    for (const layerKey of Object.keys(saved)) {
                        try {
                            if (!window.LAYERS || !window.LAYERS[layerKey]) continue;
                            // Ensure layer is visible so the highlight is visible on load
                            if (map.layerState) {
                                map.layerState.setLayerVisible(layerKey, true);
                            }
                            const scale = (saved[layerKey] && typeof saved[layerKey].scale === 'number') ? saved[layerKey].scale : (map._highlightConfig && map._highlightConfig[layerKey] && map._highlightConfig[layerKey].scale) || 2.0;
                            map.setLayerHighlight(layerKey, scale);
                        } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.init.setLayerHighlight'); }
                    }
                }
            } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.init.loadHighlightedLayers'); }
            // Grid DOM label creation is handled by GridRenderer.init()
            // Ensure GridRenderer performed its init (idempotent)
            try { if (map && map.gridRenderer && typeof map.gridRenderer.init === 'function') { map.gridRenderer.init(); } } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.init.gridRendererInit'); }


        } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.init'); }
    // Runtime metadata for the special `customMarkers` layer: deletable, not selectable
    try {
        if (typeof LAYERS !== 'undefined' && LAYERS.customMarkers) {
            LAYERS.customMarkers.deletable = true;
            LAYERS.customMarkers.selectable = true;
            if (typeof LAYERS.customMarkers.maxMarkers !== 'number') {
                LAYERS.customMarkers.maxMarkers = (map && map.layerConfig && map.layerConfig.customMarkers && map.layerConfig.customMarkers.maxMarkers) || 50;
            }
        }
    } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.init.configureCustomMarkers'); }

    // Populate layer icons from LAYERS definitions
    let layerListController;
    try {
        if (typeof LayerListController !== 'undefined') {
            layerListController = new LayerListController({
                layerState: map.layerState,
                highlightState: map.highlightState,
                eventBus: eventBus,
                config: MP4Config,
                errorHandler: moduleErrorHandler
            });
            await layerListController.init();
        }
    } catch (e) {
        moduleErrorHandler.logDebug('Failed to initialize LayerListController', 'InteractiveMap.initUIControllers.layerListController', { error: e });
    }

    // Initialize UI controllers
    let sidebarController, toolbarController, settingsController;
    try {
        if (typeof SidebarController !== 'undefined') {
            sidebarController = new SidebarController({
                layerState: map.layerState,
                selectionState: map.selectionState,
                editModeState: map.editModeState,
                eventBus: eventBus,
                config: MP4Config,
                errorHandler: moduleErrorHandler,
                map: map // For UI operations
            });
            sidebarController.init();
        }
        if (typeof ToolbarController !== 'undefined') {
            toolbarController = new ToolbarController({
                layerState: map.layerState,
                selectionState: map.selectionState,
                editModeState: map.editModeState,
                markerManager: map.markerManager,
                eventBus: eventBus,
                config: MP4Config,
                errorHandler: moduleErrorHandler
            });
            toolbarController.init();
        }
        if (typeof SettingsController !== 'undefined') {
            settingsController = new SettingsController({
                layerState: map.layerState,
                highlightState: map.highlightState,
                tilesetState: map.tilesetState,
                markerManager: map.markerManager,
                mapState: map.mapState,
                eventBus: eventBus,
                config: MP4Config,
                errorHandler: moduleErrorHandler
            });
            settingsController.init();
            // Load saved settings after controller is initialized
            settingsController.loadSavedSettings();
        }
    } catch (e) {
        moduleErrorHandler.logDebug('Failed to initialize UI controllers', 'InteractiveMap.initUIControllers', { error: e });
    }

    // Load custom markers from storage if consent is given
    try {
        // Use StorageService if available, otherwise fall back to legacy method
        let markers = null;
        if (window.storageService && typeof window.storageService.loadSetting === 'function') {
            markers = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.CUSTOM_MARKERS);
        } else {
            // Fallback to legacy method
            if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                markers = window._mp4Storage.loadSetting('mp4_customMarkers');
            }
        }
        if (markers && Array.isArray(markers)) {
            // Load markers into markerManager (should always be available in decoupled code)
            if (map.markerManager) {
                map.markerManager.setMarkers(markers);
            } else {
                moduleErrorHandler.logWarning('markerManager not available during init, markers not loaded', 'InteractiveMap.loadMarkersFromStorage');
            }
        }
    } catch (e) {
        moduleErrorHandler.logDebug('Failed to load markers on page load', 'InteractiveMap.loadMarkersFromStorage', { error: e });
    }

    // Wire Show All / Hide All layer buttons — batch updates to avoid N renders/storage writes
    // NOTE: Layer visibility controls are now handled by SidebarController
    // Load markers from storage (consent-gated)
    try {
        if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent()) {
            if (map.markerManager && typeof map.markerManager.loadMarkers === 'function') {
                map.markerManager.loadMarkers();
            }
        }
    } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.loadMarkersFromStorage'); }
    // Attempt to restore a previously saved route (if any) - consent-gated
    try { 
        if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent()) {
            map.loadRouteFromStorage(); 
        }
    } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.loadRouteFromStorage'); }
    // Load route looping preference independently (persisted separately from route data)
    // Note: routeManager.loadFromStorage() already loads the looping flag, so this is redundant
    try {
        if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent()) {
            // Looping flag is already loaded by routeManager.loadFromStorage() above
            // Update UI after loading loop state
            try { map.updateLoopUI(); } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.updateLoopUI'); }
        }
    } catch (e) { /* default to false */ }
    // Attempt to restore saved map view (pan/zoom) when consent is present
    try {
        const consent = (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function') ? window._mp4Storage.hasStorageConsent() : (localStorage.getItem('mp4_storage_consent') === '1');
        if (consent && map && typeof map.loadViewFromStorage === 'function') {
            try { map.loadViewFromStorage(); } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.loadViewFromStorage'); }
        }
    } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.restoreSavedMapView'); }
    // Wire the compact Save-data toggle and Clear button (consent-aware)
    // NOTE: Storage consent controls are now handled by SettingsController

    // Ensure the sidebar counts reflect current map state now that elements exist
    try { map.updateLayerCounts(); } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.updateLayerCounts'); }

    // Setup controls
    // NOTE: Zoom controls are now handled by ToolbarController

    // Attach pressed handlers to all sidebar control buttons (Compute/Clear/Export/etc.)
    attachPressedHandlers('.control-btn');

    // Prevent control buttons from retaining keyboard focus after click so
    // shortcuts remain available and focus outline does not persist on the last button.
    try {
        const controls = document.querySelectorAll('.control-btn');
        controls.forEach(btn => {
            try {
                btn.addEventListener('click', () => { try { btn.blur(); } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.blurControlButton'); } });
            } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.addBlurEventListener'); }
        });
    } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.setupControlButtonBlurHandlers'); }

    // Ensure on-screen toggles/buttons don't retain focus after interaction
    try {
        document.addEventListener('click', (ev) => {
            try {
                const sel = (ev && ev.target) ? ev.target.closest('button, .control-btn, .zoom-btn, .hints-toggle, .layer-toggle, [role="button"]') : null;
                if (sel && typeof sel.blur === 'function') {
                    // blur after current event loop so any click handlers still run
                    setTimeout(() => { try { sel.blur(); } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.blurElement'); } }, 0);
                }
            } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.handleClickEventForBlur'); }
        }, true);
    } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.setupGlobalBlurHandler'); }

    // Position the hints overlay exactly above the Hints toggle button
    function positionHintsOverlay() {
        try {
            const sidebar = document.querySelector('.sidebar');
            const hintsBtn = document.getElementById('hintsToggleBtn');
            const hintsOverlay = document.getElementById('hintsOverlay');
            const consentBtn = document.getElementById('saveDataToggle_label');
            if (!sidebar || !hintsBtn || !hintsOverlay) return;
            const sidebarRect = sidebar.getBoundingClientRect();
            const hintRect = hintsBtn.getBoundingClientRect();
            // Calculate extra offset from consent toggle's bottom margin if present
            let consentMarginBottom = 0;
            try {
                if (consentBtn) {
                    const cs = window.getComputedStyle(consentBtn);
                    consentMarginBottom = parseFloat(cs.marginBottom) || 0;
                }
            } catch (e) { consentMarginBottom = 0; moduleErrorHandler.logError(e, 'positionHintsOverlay.getConsentMargin'); }

            // Align overlay's bottom to the footer height so it always sits
            // immediately above the footer area (CSS variable controls height).
            try {
                hintsOverlay.style.bottom = 'var(--sidebar-footer-height)';
            } catch (e) { moduleErrorHandler.logError(e, 'positionHintsOverlay.setOverlayBottomStyle'); }

        } catch (e) { moduleErrorHandler.logError(e, 'positionHintsOverlay'); }
    }
    try { positionHintsOverlay(); } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.positionHintsOverlay'); }
    try { window.addEventListener('resize', positionHintsOverlay, { passive: true }); } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.addResizeListener'); }
    // Helpers to lock UI while route computation runs
    function beginRouteCompute() {
        try {
            if (map) map._computingRoute = true;
            let overlay = document.getElementById('computingOverlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'computingOverlay';
                overlay.className = 'computing-overlay';
                const inner = document.createElement('div');
                inner.className = 'computing-inner';
                inner.textContent = 'Computing route…';
                overlay.appendChild(inner);
                try { document.body.appendChild(overlay); } catch (e) { moduleErrorHandler.logError(e, 'beginRouteCompute.appendOverlayToBody'); }
            }
            try { overlay.style.display = 'flex'; } catch (e) { moduleErrorHandler.logError(e, 'beginRouteCompute.showOverlay'); }
        } catch (e) { moduleErrorHandler.logError(e, 'beginRouteCompute'); }
    }

    function endRouteCompute() {
        try {
            if (map) map._computingRoute = false;
            const overlay = document.getElementById('computingOverlay');
            if (overlay) try { overlay.style.display = 'none'; } catch (e) { moduleErrorHandler.logError(e, 'endRouteCompute.hideOverlay'); }
        } catch (e) { moduleErrorHandler.logError(e, 'endRouteCompute'); }
    }
    
    // Helper to show/hide and position the edit overlay when either edit mode is active
    // Use module-scoped variables so exitEditModeForLayer can also control the RAF/timer
    // Global edit-overlay alpha so both RAF-updates and on-show logic agree
    const EDIT_OVERLAY_ALPHA = 0.35;
    function _updateOverlayFrame() {
        try {
            const ov = document.getElementById('editOverlay');
            if (!ov) return;
            // Position overlay to match the map's rendered tile area (MAP_SIZE * zoom)
            if (map && (map.editMarkersMode || map.editRouteMode)) {
                const size = (MAP_SIZE * (map.zoom || 1));
                const left = Number(map.panX || 0);
                const top = Number(map.panY || 0);
                ov.style.left = Math.round(left) + 'px';
                ov.style.top = Math.round(top) + 'px';
                ov.style.width = Math.round(size) + 'px';
                ov.style.height = Math.round(size) + 'px';
                // Ensure overlay color follows the currently active edit mode
                try {
                    const layerKey = (map.editMarkersMode ? 'customMarkers' : (map.editRouteMode ? 'route' : null));
                    if (layerKey && LAYERS && LAYERS[layerKey] && LAYERS[layerKey].color) {
                        const hex = String(LAYERS[layerKey].color || '').trim();
                        const parseHex = (h) => {
                            if (!h || h[0] !== '#') return null;
                            const s = h.slice(1);
                            if (s.length === 6) {
                                const r = parseInt(s.slice(0,2),16);
                                const g = parseInt(s.slice(2,4),16);
                                const b = parseInt(s.slice(4,6),16);
                                return { r,g,b, a: 1 };
                            } else if (s.length === 8) {
                                const r = parseInt(s.slice(0,2),16);
                                const g = parseInt(s.slice(2,4),16);
                                const b = parseInt(s.slice(4,6),16);
                                const a = parseInt(s.slice(6,8),16) / 255;
                                return { r,g,b, a };
                            }
                            return null;
                        };
                        const c = parseHex(hex);
                        if (c) {
                            ov.style.backgroundColor = `rgba(${c.r},${c.g},${c.b},${EDIT_OVERLAY_ALPHA})`;
                        }
                    }
                } catch (e) { moduleErrorHandler.logError(e, '_updateOverlayFrame.setBackgroundColor'); }
                // Keep aria-hidden=false while visible (during fade in/out)
                ov.classList.add('visible');
                try { ov.setAttribute('aria-hidden', 'false'); } catch (e) { moduleErrorHandler.logError(e, '_updateOverlayFrame.setAriaHiddenFalse'); }
                // continue RAF while visible so overlay follows pan/zoom smoothly
                _editOverlayRaf_module = requestAnimationFrame(_updateOverlayFrame);
            } else {
                // Should not usually reach here because updateEditOverlay controls RAF lifecycle,
                // but defensively hide overlay and clear inline sizes.
                ov.classList.remove('visible');
                try { ov.setAttribute('aria-hidden', 'true'); } catch (e) { moduleErrorHandler.logError(e, '_updateOverlayFrame.setAriaHiddenTrue'); }
                try { ov.style.left = ''; ov.style.top = ''; ov.style.width = ''; ov.style.height = ''; } catch (e) { moduleErrorHandler.logError(e, '_updateOverlayFrame.clearStyles'); }
                _editOverlayRaf_module = null;
            }
        } catch (e) { moduleErrorHandler.logError(e, '_updateOverlayFrame'); _editOverlayRaf_module = null; }
    }

    function updateEditOverlay() {
        try {
            const ov = document.getElementById('editOverlay');
            if (!ov) return;
            const on = !!(map && (map.editMarkersMode || map.editRouteMode));
            // If turning on, cancel any pending hide and start RAF-driven updates
            if (on) {
                // Determine overlay color based on active edit mode's layer color
                try {
                    const layerKey = (map.editMarkersMode ? 'customMarkers' : (map.editRouteMode ? 'route' : null));
                    if (layerKey && LAYERS && LAYERS[layerKey] && LAYERS[layerKey].color) {
                        const hex = String(LAYERS[layerKey].color || '').trim();
                        // parse #RRGGBB or #RRGGBBAA
                        const parseHex = (h) => {
                            if (!h || h[0] !== '#') return null;
                            const s = h.slice(1);
                            if (s.length === 6) {
                                const r = parseInt(s.slice(0,2),16);
                                const g = parseInt(s.slice(2,4),16);
                                const b = parseInt(s.slice(4,6),16);
                                return { r,g,b, a: 1 };
                            } else if (s.length === 8) {
                                const r = parseInt(s.slice(0,2),16);
                                const g = parseInt(s.slice(2,4),16);
                                const b = parseInt(s.slice(4,6),16);
                                const a = parseInt(s.slice(6,8),16) / 255;
                                return { r,g,b, a };
                            }
                            return null;
                        };
                        const c = parseHex(hex);
                        if (c) {
                            ov.style.backgroundColor = `rgba(${c.r},${c.g},${c.b},${EDIT_OVERLAY_ALPHA})`;
                        }
                    }
                } catch (e) { moduleErrorHandler.logError(e, 'updateEditOverlay.setBackgroundColor'); }
                if (_overlayHideTimer_module) { try { clearTimeout(_overlayHideTimer_module); } catch (e) { moduleErrorHandler.logError(e, 'updateEditOverlay.clearHideTimer'); } _overlayHideTimer_module = null; }
                if (!_editOverlayRaf_module) _editOverlayRaf_module = requestAnimationFrame(_updateOverlayFrame);
                return;
            }

            // Turning off: stop RAF, but keep inline sizing for the transition,
            // then clear sizing after the CSS opacity transition to avoid snapping.
            if (_editOverlayRaf_module) { try { cancelAnimationFrame(_editOverlayRaf_module); } catch (e) { moduleErrorHandler.logError(e, 'updateEditOverlay.cancelAnimationFrame'); } _editOverlayRaf_module = null; }
            // Start fade-out by removing visible class
            ov.classList.remove('visible');
            // Keep aria-hidden=false during fade; only mark hidden after transition completes
            try { ov.setAttribute('aria-hidden', 'false'); } catch (e) { moduleErrorHandler.logError(e, 'updateEditOverlay.setAriaHiddenFalse'); }
            if (_overlayHideTimer_module) { try { clearTimeout(_overlayHideTimer_module); } catch (e) { moduleErrorHandler.logError(e, 'updateEditOverlay.clearHideTimerSecond'); } }
            _overlayHideTimer_module = setTimeout(() => {
                try {
                    // If overlay was re-enabled in the meantime, don't clear
                    if (map && (map.editMarkersMode || map.editRouteMode)) { _overlayHideTimer_module = null; return; }
                    try { ov.setAttribute('aria-hidden', 'true'); } catch (e) { moduleErrorHandler.logError(e, 'updateEditOverlay.setAriaHiddenTrue'); }
                    try { ov.style.left = ''; ov.style.top = ''; ov.style.width = ''; ov.style.height = ''; ov.style.backgroundColor = ''; } catch (e) { moduleErrorHandler.logError(e, 'updateEditOverlay.clearStyles'); }
                } catch (e) { moduleErrorHandler.logError(e, 'updateEditOverlay.hideTimerCallback'); }
                _overlayHideTimer_module = null;
            }, 220); // slightly longer than CSS transition (160ms) to ensure smooth fade
        } catch (e) { moduleErrorHandler.logError(e, 'updateEditOverlay'); }
    }
    
    // Unified helper: apply layer color to sidebar and mini edit-toggle buttons
    function setEditToggleColor(layerKey, sidebarId, miniId, sidebarCssPrefix, on) {
        try {
            const layerColor = (typeof LAYERS !== 'undefined' && LAYERS && LAYERS[layerKey] && LAYERS[layerKey].color) ? String(LAYERS[layerKey].color).trim() : '#22d3ee';
            const hex = layerColor;
            const parseHexSimple = (h) => {
                if (!h || h[0] !== '#') return null;
                const s = h.slice(1);
                if (s.length === 6) {
                    return { r: parseInt(s.slice(0,2),16), g: parseInt(s.slice(2,4),16), b: parseInt(s.slice(4,6),16) };
                } else if (s.length === 3) {
                    return { r: parseInt(s[0]+s[0],16), g: parseInt(s[1]+s[1],16), b: parseInt(s[2]+s[2],16) };
                } else if (s.length === 8) {
                    return { r: parseInt(s.slice(0,2),16), g: parseInt(s.slice(2,4),16), b: parseInt(s.slice(4,6),16), a: parseInt(s.slice(6,8),16) / 255 };
                } else if (s.length === 4) {
                    return { r: parseInt(s[0]+s[0],16), g: parseInt(s[1]+s[1],16), b: parseInt(s[2]+s[2],16), a: parseInt(s[3]+s[3],16) / 255 };
                }
                return null;
            };
            const rgb = parseHexSimple(hex) || { r: 34, g: 211, b: 238 };
            const isRoute = (layerKey === 'route');
            const glow1 = `rgba(${rgb.r},${rgb.g},${rgb.b},${isRoute ? 0.9 : 0.75})`;
            const glow2 = `rgba(${rgb.r},${rgb.g},${rgb.b},${isRoute ? 0.6 : 0.35})`;
            const border = hex;
            const sidebarEl = document.getElementById(sidebarId);
            const miniEl = document.getElementById(miniId);
            if (on) {
                try { if (sidebarEl) { sidebarEl.style.setProperty(`--${sidebarCssPrefix}-border`, border); sidebarEl.style.setProperty(`--${sidebarCssPrefix}-glow1`, glow1); } } catch (e) { moduleErrorHandler.logError(e, 'setEditToggleColor.setSidebarStyles'); }
                try { if (miniEl) { miniEl.style.setProperty('--edit-layer-glow1', glow1); miniEl.style.setProperty('--edit-layer-glow2', glow2); miniEl.style.setProperty('--edit-layer-border', border); } } catch (e) { moduleErrorHandler.logError(e, 'setEditToggleColor.setMiniStyles'); }
            } else {
                try { if (sidebarEl) { sidebarEl.style.removeProperty(`--${sidebarCssPrefix}-border`); sidebarEl.style.removeProperty(`--${sidebarCssPrefix}-glow1`); } } catch (e) { moduleErrorHandler.logError(e, 'setEditToggleColor.removeSidebarStyles'); }
                try { if (miniEl) { miniEl.style.removeProperty('--edit-layer-glow1'); miniEl.style.removeProperty('--edit-layer-glow2'); } } catch (e) { moduleErrorHandler.logError(e, 'setEditToggleColor.removeMiniStyles'); }
            }
        } catch (e) { moduleErrorHandler.logError(e, 'setEditToggleColor'); }
    }
    
    // Layer toggle handlers are created dynamically in `initializeLayerIcons()`
    
    // Custom marker controls
    document.getElementById('exportCustom').addEventListener('click', () => {
        try {
            if (map.markerManager) {
                map.markerManager.exportMarkers();
            } else {
                NotificationUtils.showMarkerError('Marker manager not available.');
            }
        } catch (err) {
            NotificationUtils.showMarkerError('Failed to export custom markers: ' + (err.message || String(err)));
        }
    });

    // Edit markers toggle - enables placing, dragging and deleting custom markers
    // NOTE: Edit mode toggles are now handled by ToolbarController

    // Edit route toggle - enables route editing interactions
    // NOTE: Edit mode toggles are now handled by ToolbarController

    // Tileset controls (Satellite / Holographic)
    // NOTE: Tileset and display controls are now handled by SettingsController

    // Settings: highlight size multiplier slider wiring
    try {
        const slider = document.getElementById('highlightScaleSlider');
        const label = document.getElementById('highlightScaleValue');
        if (slider && label) {
            // Get initial value from highlightState instead of map property
            let initial = (map && map.highlightState && typeof map.highlightState.highlightScaleMultiplier === 'number') ? map.highlightState.highlightScaleMultiplier : 1.0;
            slider.value = initial;
            // Display a mapped user-facing value while keeping internal numbers unchanged.
            // Users expect the displayed slider to start near 1.2x, so show (internal + 0.6).
            const displayInitial = Number(initial) + 0.6;
            const pctInitial = Math.round(displayInitial * 100);
            label.textContent = `${pctInitial}%`;
            
            slider.addEventListener('input', (ev) => {
                const v = parseFloat(ev.target.value) || 1.0;
                // Map displayed value to (internal + 0.6) so UI range appears to start around 1.2x
                const display = Number(v) + 0.6;
                const pct = Math.round(display * 100);
                label.textContent = `${pct}%`;
                // Update highlightScaleMultiplier via HighlightState
                if (map && map.highlightState && typeof map.highlightState.setHighlightScaleMultiplier === 'function') {
                    map.highlightState.setHighlightScaleMultiplier(v);
                }
            });
            
            slider.addEventListener('change', (ev) => {
                try {
                    if (map) {
                        map.render();
                        if (typeof map.checkMarkerHover === 'function') {
                            if (typeof map.lastMouseX === 'number' && typeof map.lastMouseY === 'number') {
                                map.checkMarkerHover(map.lastMouseX, map.lastMouseY);
                            } else {
                                const rect = map.canvas && map.canvas.getBoundingClientRect ? map.canvas.getBoundingClientRect() : null;
                                if (rect) map.checkMarkerHover(rect.width / 2, rect.height / 2);
                            }
                        }
                    }
                } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.handleHighlightSizeSliderChange'); }
            });
        }
    } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.setupHighlightSizeSlider'); }
    
    // Settings: marker size slider wiring
    try {
        const slider = document.getElementById('markerSizeSlider');
        const label = document.getElementById('markerSizeValue');
        if (slider && label) {
            let initial = MP4Config.MARKER_SCALING.userScaleMultiplier;
            slider.value = initial;
            label.textContent = `${(initial * 100).toFixed(0)}%`;
            // Calculate thumb offset for precise fill alignment
            const thumbOffsetPercent = (7 / slider.offsetWidth) * 100; // Half thumb width (7px) as percentage
            const fillPercent = Math.max(thumbOffsetPercent, Math.min(100 - thumbOffsetPercent, ((initial - 0.5) / (1.5 - 0.5)) * (100 - 2 * thumbOffsetPercent) + thumbOffsetPercent));
            slider.style.setProperty('--slider-fill', fillPercent + '%');
            
            slider.addEventListener('input', (ev) => {
                let v = parseFloat(ev.target.value) || 1.0;
                // Clamp to the intended range (50% to 150%)
                v = Math.max(0.5, Math.min(1.5, v));
                ev.target.value = v; // Update the slider position
                label.textContent = `${(v * 100).toFixed(0)}%`;
                // Update slider fill visualization
                const thumbOffsetPercent = (7 / ev.target.offsetWidth) * 100; // Half thumb width (7px) as percentage
                const fillPercent = Math.max(thumbOffsetPercent, Math.min(100 - thumbOffsetPercent, ((v - 0.5) / (1.5 - 0.5)) * (100 - 2 * thumbOffsetPercent) + thumbOffsetPercent));
                ev.target.style.setProperty('--slider-fill', fillPercent + '%');
                if (map && typeof map.updateMarkerUserScaleMultiplier === 'function') {
                    map.updateMarkerUserScaleMultiplier(v);
                }
            });
            
            slider.addEventListener('change', (ev) => {
                try {
                    if (map) {
                        map.render();
                        if (typeof map.checkMarkerHover === 'function') {
                            if (typeof map.lastMouseX === 'number' && typeof map.lastMouseY === 'number') {
                                map.checkMarkerHover(map.lastMouseX, map.lastMouseY);
                            } else {
                                const rect = map.canvas && map.canvas.getBoundingClientRect ? map.canvas.getBoundingClientRect() : null;
                                if (rect) map.checkMarkerHover(rect.width / 2, rect.height / 2);
                            }
                        }
                    }
                } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.handleMarkerSizeSliderChange'); }
            });
        }
    } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.setupMarkerSizeSlider'); }
    
    // Settings: highlight scale slider wiring
    try {
        const slider = document.getElementById('highlightScaleSlider');
        const label = document.getElementById('highlightScaleValue');
        if (slider && label) {
            let initial = MP4Config.MARKER_SCALING.highlightMultiplier;
            slider.value = initial;
            label.textContent = `x${initial.toFixed(1)}`;
            // Calculate thumb offset for precise fill alignment
            const thumbOffsetPercent = (7 / slider.offsetWidth) * 100; // Half thumb width (7px) as percentage
            const fillPercent = Math.max(thumbOffsetPercent, Math.min(100 - thumbOffsetPercent, ((initial - 1.5) / (2.5 - 1.5)) * (100 - 2 * thumbOffsetPercent) + thumbOffsetPercent));
            slider.style.setProperty('--slider-fill', fillPercent + '%');
            
            slider.addEventListener('input', (ev) => {
                let v = parseFloat(ev.target.value) || 1.2;
                // Clamp to the intended range (1.5x to 2.5x)
                v = Math.max(1.5, Math.min(2.5, v));
                ev.target.value = v; // Update the slider position
                label.textContent = `x${v.toFixed(1)}`;
                // Update slider fill visualization
                const thumbOffsetPercent = (7 / ev.target.offsetWidth) * 100; // Half thumb width (7px) as percentage
                const fillPercent = Math.max(thumbOffsetPercent, Math.min(100 - thumbOffsetPercent, ((v - 1.5) / (2.5 - 1.5)) * (100 - 2 * thumbOffsetPercent) + thumbOffsetPercent));
                ev.target.style.setProperty('--slider-fill', fillPercent + '%');
                if (map && typeof map.updateMarkerHighlightMultiplier === 'function') {
                    map.updateMarkerHighlightMultiplier(v);
                }
            });
            
            slider.addEventListener('change', (ev) => {
                try {
                    if (map) {
                        map.render();
                        if (typeof map.checkMarkerHover === 'function') {
                            if (typeof map.lastMouseX === 'number' && typeof map.lastMouseY === 'number') {
                                map.checkMarkerHover(map.lastMouseX, map.lastMouseY);
                            } else {
                                const rect = map.canvas && map.canvas.getBoundingClientRect ? map.canvas.getBoundingClientRect() : null;
                                if (rect) map.checkMarkerHover(rect.width / 2, rect.height / 2);
                            }
                        }
                    }
                } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.handleHighlightScaleSliderChange'); }
            });
        }
    } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.setupHighlightScaleSlider'); }
    
    document.getElementById('importCustom').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    
    document.getElementById('importFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const obj = JSON.parse(ev.target.result);
                let markersToImport = [];

                // Handle different formats
                if (obj && Array.isArray(obj.markers)) {
                    // Format: { markers: [...], ... }
                    markersToImport = obj.markers;
                } else if (Array.isArray(obj)) {
                    // Format: bare array
                    markersToImport = obj;
                } else {
                    throw new Error('Invalid marker file: missing markers array');
                }

                if (!Array.isArray(markersToImport) || markersToImport.length === 0) {
                    throw new Error('File contains no markers');
                }

                // Detect legacy marker file (legacy UIDs like cm01, cm02) vs current hashed UIDs
                const isLegacyMarkersFile = MarkerUtilsCore.isLegacyMarkerFile(markersToImport);

                // Build migratedMarkers: for legacy files regenerate hashed UIDs; for modern files keep provided UIDs
                const migratedMarkers = markersToImport.map(m => {
                    if (typeof m.x !== 'number' || typeof m.y !== 'number') {
                        throw new Error('Invalid marker: x and y must be numbers');
                    }
                    const x = Number(m.x);
                    const y = Number(m.y);
                    let uid;
                    if (isLegacyMarkersFile) {
                        uid = map.markerManager ? map.markerManager.generateUID(x, y) : `cm_${Math.random().toString(16).slice(2, 10)}`;
                    } else {
                        uid = (typeof m.uid === 'string' && m.uid) ? m.uid : (map.markerManager ? map.markerManager.generateUID(x, y) : `cm_${Math.random().toString(16).slice(2, 10)}`);
                    }
                    return { uid, x, y };
                });
                if (isLegacyMarkersFile) {
                    NotificationUtils.showUpgradeNotification(`Upgraded custom markers: ${migratedMarkers.length} markers regenerated. UIDs and layers matched by coordinate hash.`);
                    // log removed
                }

                // Check if current markers exist
                const currentMarkers = this.markerManager ? this.markerManager.getAllMarkers() : [];
                const maxMarkers = map?.layerConfig?.customMarkers?.maxMarkers || 50;
                
                // Count only NEW markers (those without matching UIDs)
                const newMarkersCount = migratedMarkers.filter(imported => {
                    return map.markerManager ? !map.markerManager.markerExists(imported.uid) : !currentMarkers.some(current => current.uid === imported.uid);
                }).length;
                
                const totalAfterImport = currentMarkers.length + newMarkersCount;

                if (totalAfterImport > maxMarkers) {
                    const needToDelete = totalAfterImport - maxMarkers;
                    NotificationUtils.showImportError(
                        `Cannot import ${migratedMarkers.length} markers.\n\n` +
                        `You have ${currentMarkers.length} markers, import would add ${newMarkersCount} new ones.\n\n` +
                        `Total would be ${totalAfterImport}, maximum is ${maxMarkers}.\n\n` +
                        `Please delete at least ${needToDelete} marker(s) first.`
                    );
                    e.target.value = '';
                    return;
                }

                // Merge markers: replace those with matching UIDs, add new ones
                const mergedMarkers = currentMarkers.slice();
                for (let i = 0; i < migratedMarkers.length; i++) {
                    const importedMarker = migratedMarkers[i];
                    const existingIdx = mergedMarkers.findIndex(m => m.uid === importedMarker.uid);
                    if (existingIdx >= 0) {
                        // Overwrite marker with same UID (hash)
                        mergedMarkers[existingIdx] = importedMarker;
                    } else {
                        // Add new marker
                        mergedMarkers.push(importedMarker);
                    }
                }
                
                if (map.markerManager) {
                    map.markerManager.setMarkers(mergedMarkers);
                    // The setMarkers method handles saving to storage and notifying changes
                } else {
                    // Fallback if markerManager not available (should not happen in decoupled code)
                    moduleErrorHandler.logWarning('markerManager not available during marker import', 'InteractiveMap.importMarkers');
                }

                // log removed
                e.target.value = '';
            } catch (error) {
                // error logging removed
                NotificationUtils.showMarkerError('Failed to import markers: ' + (error.message || String(error)));
                e.target.value = '';
            }
        };
        reader.onerror = () => {
            NotificationUtils.showFileError('Failed to read file');
            e.target.value = '';
        };
        reader.readAsText(file);
    });
    
    document.getElementById('clearCustom').addEventListener('click', () => {
        const markerCount = map.markerManager ? map.markerManager.getAllMarkers().length : 0;
        if (markerCount === 0) {
            NotificationUtils.showInfo('No custom markers to clear.');
            return;
        }
        if (NotificationUtils.confirmDestructiveAction('Clear all custom markers? This cannot be undone.')) {
            if (map.markerManager) {
                map.markerManager.clearMarkers();
                // The clearMarkers method handles updating LAYERS and triggering callbacks
            } else {
                // Fallback (should not happen in decoupled code)
                moduleErrorHandler.logWarning('markerManager not available during clear markers', 'InteractiveMap.clearMarkers');
                map.customMarkers = [];
            }
            // Layer counts will be updated via MARKER_REMOVED event
            // Exit marker edit mode via canonical helper so visuals/overlay are cleaned up
            try { if (window.eventBus) window.eventBus.emit(window.EventTypes.EDIT_MODE_EXIT_REQUESTED, { layer: 'customMarkers' }); } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.clearMarkers.exitEditMode'); }
            try { map._draggingCandidate = null; map._draggingMarker = null; } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.clearMarkers.clearDraggingState'); }
            try { map.canvas.style.cursor = 'grab'; } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.clearMarkers.resetCursor'); }
            try { map.render(); } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.clearMarkers.renderAfterClearing'); }
        }
    });

    // Initialize route computation controller
    try {
        if (typeof RouteComputeController !== 'undefined') {
            const routeComputeController = new RouteComputeController({
                routeState: map.routeState,
                routeAnimationState: map.routeAnimationState,
                layerState: map.layerState,
                selectionState: map.selectionState,
                editModeState: map.editModeState,
                routeEditState: map.routeEditState,
                pointerHandler: map.pointerHandler,
                eventBus: eventBus,
                config: MP4Config,
                errorHandler: moduleErrorHandler
            });
            routeComputeController.init();
        } else {
            moduleErrorHandler.logError('RouteComputeController not available', 'InteractiveMap.init.initializeRouteComputeController');
        }
    } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.initializeRouteComputeController'); }

    // Sidebar toggle logic
    const app = document.querySelector('.app-container');
    // Support multiple possible handle IDs for backwards compatibility
    const handle = document.getElementById('sidebarHandle') || document.getElementById('sidebarToggle');
    // No persistence: sidebar state should always start open on load
    function setSidebarCollapsed(collapsed, persist = false) {
        if (collapsed) {
            app.classList.add('sidebar-collapsed');
            handle && handle.setAttribute('aria-expanded', 'false');
            // Close hints overlay when sidebar collapses
            try {
                const hintsOverlay = document.getElementById('hintsOverlay');
                const hintsToggle = document.getElementById('hintsToggleBtn');
                if (hintsOverlay) {
                    hintsOverlay.classList.remove('visible');
                    // Mark closed explicitly so CSS can target the closed state
                    try { hintsOverlay.classList.add('closed'); } catch (e) { this.errorHandler.logError(e, 'sidebarToggle.addClosedClass', { hintsOverlay }); }
                    hintsOverlay.setAttribute('aria-hidden', 'true');
                }
                if (hintsToggle) {
                    hintsToggle.setAttribute('aria-expanded', 'false');
                    hintsToggle.classList.remove('active');
                }
            } catch (e) { this.errorHandler.logError(e, 'sidebarToggle.closeHintsOverlay', { hintsOverlay, hintsToggle }); }
        } else {
            app.classList.remove('sidebar-collapsed');
            handle && handle.setAttribute('aria-expanded', 'true');
        }
        // do not persist sidebar state to localStorage
        // Resize map after sidebar animation
        setTimeout(() => map.resize(), 300);
    }

    if (handle) {
        handle.addEventListener('click', () => {
            const collapsed = app.classList.contains('sidebar-collapsed');
            setSidebarCollapsed(!collapsed);
        });
        // Pointer feedback for short press state (avoid sticky hover on mobile)
        handle.addEventListener('pointerdown', (e) => {
            handle.classList.add('pressed');
        });
        handle.addEventListener('pointerup', (e) => {
            handle.classList.remove('pressed');
        });
        handle.addEventListener('pointercancel', (e) => {
            handle.classList.remove('pressed');
        });
    } else {
        NotificationUtils.showLoadError('Sidebar handle element not found; collapsing unavailable');
    }

    // Start with the sidebar collapsed on page load
    setSidebarCollapsed(true, false);

    // Keyboard shortcuts for UI: toggle sidebar and arrow-key panning
    // Keyboard shortcuts are now handled by KeyboardHandler

    // Bind dev sidebar controls (if present)
    try {
        const devStatsPanel = document.getElementById('devStatsPanel');
        const dev_bitmapActive = document.getElementById('dev_bitmapActive');
        const dev_bitmapQueue = document.getElementById('dev_bitmapQueue');
        const dev_imageControllers = document.getElementById('dev_imageControllers');
        const dev_imageBitmaps = document.getElementById('dev_imageBitmaps');
        const devStats = document.getElementById('devStats');

        // live stats updater (populate panel rows if present)
        if ((devStatsPanel || devStats) && map && typeof map.getTileLoadStats === 'function') {
            const upd = () => {
                try {
                    const s = map.getTileLoadStats();
                    if (dev_bitmapActive) dev_bitmapActive.textContent = s.bitmapActive;
                    if (dev_bitmapQueue) dev_bitmapQueue.textContent = s.bitmapQueue;
                    if (dev_imageControllers) dev_imageControllers.textContent = s.imageControllers;
                    if (dev_imageBitmaps) dev_imageBitmaps.textContent = s.imageBitmaps;
                    if (!devStatsPanel && devStats) devStats.textContent = `dec:${s.bitmapActive} q:${s.bitmapQueue} ctrl:${s.imageControllers} bmp:${s.imageBitmaps}`;
                    // Detailed panel values
                    const dev_loadingResolution = document.getElementById('dev_loadingResolution');
                    const dev_imagesCached = document.getElementById('dev_imagesCached');
                    try { if (dev_loadingResolution) dev_loadingResolution.textContent = (map.imageState.loadingResolution != null) ? (MP4Config.TILE_RESOLUTIONS[map.imageState.loadingResolution] + 'px') : '—'; } catch (e) { map.errorHandler.logError(e, 'updateDevStats.loadingResolution', { loadingResolution: map.imageState.loadingResolution }); }
                    try { if (dev_imagesCached) dev_imagesCached.textContent = Object.keys(map.imageState.images || {}).length; } catch (e) { map.errorHandler.logError(e, 'updateDevStats.imagesCached', { imagesCount: Object.keys(map.imageState.images || {}).length }); }
                } catch (e) {
                    if (devStatsPanel) {
                        try { if (dev_bitmapActive) dev_bitmapActive.textContent = 'err'; } catch (e) { map.errorHandler.logError(e, 'updateDevStats.setBitmapActiveError', { dev_bitmapActive }); }
                        try { if (dev_bitmapQueue) dev_bitmapQueue.textContent = 'err'; } catch (e) { map.errorHandler.logError(e, 'updateDevStats.setBitmapQueueError', { dev_bitmapQueue }); }
                        try { if (dev_imageControllers) dev_imageControllers.textContent = 'err'; } catch (e) { map.errorHandler.logError(e, 'updateDevStats.setImageControllersError', { dev_imageControllers }); }
                        try { if (dev_imageBitmaps) dev_imageBitmaps.textContent = 'err'; } catch (e) { map.errorHandler.logError(e, 'updateDevStats.setImageBitmapsError', { dev_imageBitmaps }); }
                    } else if (devStats) {
                        devStats.textContent = 'error';
                    }
                }
            };
            upd();
            map._devStatsInterval = setInterval(upd, 600);
        }

        // GitHub button
        const githubBtn = document.getElementById('githubBtn');
        if (githubBtn) {
            githubBtn.addEventListener('click', () => {
                window.open('https://github.com/nan-gogh/Metroid-Prime-4-Routing-Tool', '_blank');
            });
        }

        // Discord button
        const discordBtn = document.getElementById('discordBtn');
        if (discordBtn) {
            discordBtn.addEventListener('click', () => {
                window.open('https://discord.gg/AwqA6987ta', '_blank');
            });
        }

        // Update contributor shine effect dynamically
        function updateContributorShine() {
            const rows = document.querySelectorAll('.dataminer-row');
            const totalRows = rows.length;
            
            rows.forEach((row, index) => {
                // Calculate shine intensity from 100% (top) to ~30% (bottom)
                const progress = totalRows > 1 ? index / (totalRows - 1) : 0;
                const opacity = 1 - (progress * 0.7); // Range: 1.0 to 0.3
                
                const bgOpacity = (18 * opacity) / 100; // Range: 0.18 to 0.054
                const borderOpacity = (25 * opacity) / 100; // Range: 0.25 to 0.075
                const shadowOpacity = (15 * opacity) / 100; // Range: 0.15 to 0.045
                
                row.style.background = `rgba(34, 211, 238, ${bgOpacity})`;
                row.style.borderColor = `rgba(34, 211, 238, ${borderOpacity})`;
                row.style.boxShadow = `0 0 ${Math.max(2, 12 * opacity)}px rgba(34, 211, 238, ${shadowOpacity})`;
                
                // Apply unified cyan hue: lighter at top, darker toward bottom
                const label = row.querySelector('.dataminer-label');
                if (label) {
                    // Base cyan taken from dev-stats numbers: #22d3ee -> HSL(188,86%,53%)
                    const hue = 188; // cyan-teal hue for #22d3ee
                    const sat = 86; // saturation percentage for #22d3ee
                    const lightTop = 50; // lightness for top entry (brighter)
                    const lightBottom = 30; // lightness for bottom entry (brighter than before)
                    const lightness = (lightTop - (progress * (lightTop - lightBottom))).toFixed(1);
                    label.style.color = `hsl(${hue}, ${sat}%, ${lightness}%)`;
                    label.style.fontWeight = index === 0 ? '600' : '400';
                }
            });
        }
        
        updateContributorShine();

        // Hints toggle: expand/collapse hints overlay on top of sidebar
        try {
            const hintsToggle = document.getElementById('hintsToggleBtn');
            const hintsOverlay = document.getElementById('hintsOverlay');
            const hintsList = document.getElementById('hintsList');
            if (hintsToggle && hintsOverlay && hintsList) {
                hintsToggle.addEventListener('click', () => {
                    const isOpen = hintsOverlay.classList.toggle('visible');
                    // Keep an explicit "closed" class so CSS can easily target the closed state
                    try { hintsOverlay.classList.toggle('closed', !isOpen); } catch (e) { this.errorHandler.logError(e, 'hintsToggle.toggleClosedClass', { isOpen, hintsOverlay }); }
                    hintsToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                    hintsOverlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
                    hintsList.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
                    // Mirror visual pressed state like other toggle buttons
                    try { hintsToggle.classList.toggle('active', !!isOpen); } catch (e) { this.errorHandler.logError(e, 'hintsToggle.toggleActiveClass', { isOpen, hintsToggle }); }
                    // No map.resize() needed — the hints list is now in-flow inside the footer
                });
            }
        } catch (e) { this.errorHandler.logError(e, 'init.setupHintsToggle', { hintsOverlay, hintsToggle, hintsList }); }

        // File migration tools removed — routes and markers now upgrade in place on import/load
    } catch (e) { this.errorHandler.logError(e, 'init.initializeUIComponents', {}); }

    // Signal that the app finished initial synchronous startup work so the UI
    // (loading fade) can be removed when the page is ready for interaction.
    try {
        // Wait briefly for the initial map image to arrive so the first
        // visible render (especially at very large zooms) doesn't cause
        // heavy decoding work while the page is already unfaded.
        // This polls for either `map.images[needed]` or `map.currentImage`.
        try {
            const waitForInitialImage = (timeoutMs = 500) => new Promise((resolve) => {
                const start = Date.now();
                (function check() {
                    try {
                        if (map) {
                            const needed = (typeof map.getNeededResolution === 'function') ? map.getNeededResolution() : null;
                            if (needed !== null && map.images && map.images[needed]) return resolve(true);
                            if (map.currentImage) return resolve(true);
                        }
                    } catch (e) { moduleErrorHandler.logError(e, 'waitForInitialImage.checkImageAvailability', { needed, mapImages: map.images, currentImage: map.currentImage }); }
                    if (Date.now() - start >= timeoutMs) return resolve(false);
                    setTimeout(check, 30);
                })();
            });
            // await initial image (short timeout) but don't block startup forever
            await waitForInitialImage(500);
            // Do one overlay render now that the initial image is available
            try {
                if (map && typeof map.render === 'function') map.render();
                // Give the browser a chance to paint and finish any decode work
                await new Promise(res => requestAnimationFrame(() => setTimeout(res, 50)));
            } catch (e) { moduleErrorHandler.logError(e, 'init: Failed to render initial overlay'); }
        } catch (e) { moduleErrorHandler.logError(e, 'init: Failed to wait for initial image'); }
        try { window._mp4Ready = true; } catch (e) { moduleErrorHandler.logError(e, 'init: Failed to set _mp4Ready flag'); }
        document.dispatchEvent(new Event('mp4-ready'));
    } catch (e) { moduleErrorHandler.logError(e, 'init: Unexpected error during initialization'); }
}

document.addEventListener('DOMContentLoaded', init);
