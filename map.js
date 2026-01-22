// Pure Canvas-based Interactive Map

// Single shared ErrorHandler instance for the whole app
const appErrorHandler = typeof ErrorHandler !== 'undefined' ? new ErrorHandler() : null;

// Inject appErrorHandler into utility modules that need it
function initializeErrorHandlerInjection() {
    if (!appErrorHandler) return;
    
    // Inject into utilities
    if (typeof NotificationUtils !== 'undefined' && typeof NotificationUtils.setErrorHandler === 'function') {
        NotificationUtils.setErrorHandler(appErrorHandler);
    }
    if (typeof TaskScheduler !== 'undefined' && typeof TaskScheduler.setErrorHandler === 'function') {
        TaskScheduler.setErrorHandler(appErrorHandler);
    }
    if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.setErrorHandler === 'function') {
        MarkerUtils.setErrorHandler(appErrorHandler);
    }
    if (typeof RouteAnimation !== 'undefined' && typeof RouteAnimation.setErrorHandler === 'function') {
        RouteAnimation.setErrorHandler(appErrorHandler);
    }
    // If ObjectPool helper is available, set default error handler for pre-allocated pools
    if (typeof setObjectPoolDefaultErrorHandler !== 'undefined' && typeof setObjectPoolDefaultErrorHandler === 'function') {
        try { setObjectPoolDefaultErrorHandler(appErrorHandler); } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'ObjectPool.setDefaultErrorHandler', { message: 'Failed to set ObjectPool default error handler' }); }
    }
}

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

        // Sub-canvas architecture: Each renderer has its own canvas for independent rendering
        // This allows selective rendering without forcing unrelated renderers to redraw
        this.canvasGrid = document.getElementById('gridCanvas');
        this.ctxGrid = this.canvasGrid ? this.canvasGrid.getContext('2d') : null;
        this.canvasMarker = document.getElementById('markerCanvas');
        this.ctxMarker = this.canvasMarker ? this.canvasMarker.getContext('2d') : null;
        this.canvasRoute = document.getElementById('routeCanvas');
        this.ctxRoute = this.canvasRoute ? this.canvasRoute.getContext('2d') : null;
        this.canvasOverlay = document.getElementById('overlayCanvas');
        this.ctxOverlay = this.canvasOverlay ? this.canvasOverlay.getContext('2d') : null;

        // Initialize error handler FIRST (before state managers that need it)
        this.errorHandler = appErrorHandler || new ErrorHandler();

        // Centralize eventBus reference (prefer global instance for top-level map)
        this.eventBus = (typeof window !== 'undefined' && window.eventBus) ? window.eventBus : null;
        // Set error handler on eventBus if available
        if (this.eventBus) {
            this.eventBus.setErrorHandler(this.errorHandler);
        }

        // Storage provider will be created in `init()` after StorageService is initialized.
        this.storageProvider = null;

        // State managers will be created in `init()` when storageProvider is available.
        this.mapState = null;
        this.selectionState = null;
        this.editModeState = null;
        this.highlightState = null;
        this.tilesetState = null;
        this.routeAnimationState = null;
        this.routeEditState = null;
        this.dragState = null;
        this.layerState = null;
        this.heatmapDisplayState = null;
        this.imageState = null;

        // State managers initialized

        // Initialize controllers
        this.dataController = null;
        this.renderController = null;
        this.inputController = null;

        // Initialize canvas dimensions for mapState
        if (this.mapState) {
            this.mapState.setCanvasSize(this.canvas.width, this.canvas.height, window.devicePixelRatio || 1);
        }
    }

    // Helper to obtain the active StorageService instance
    _getStorageInstance() {
        try {
            if (this.storageProvider && typeof this.storageProvider.getInstance === 'function') {
                return this.storageProvider.getInstance();
            }
            if (typeof window !== 'undefined' && window.storageProvider && typeof window.storageProvider.getInstance === 'function') {
                return window.storageProvider.getInstance();
            }
        } catch (e) {
            try { this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'InteractiveMap._getStorageInstance'); } catch (__) {}
        }
        return null;
    }

    // Final consent checker: synchronously determine whether storage consent is present.
    // Preference order: StorageService.hasConsent() if available; otherwise read localStorage flag.
    _consentChecker() {
        try {
            const svc = this._getStorageInstance();
            if (svc && typeof svc.hasConsent === 'function') return svc.hasConsent();
            if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
                return localStorage.getItem('mp4_storage_consent') === '1';
            }
        } catch (e) {
            try { this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'InteractiveMap._consentChecker'); } catch (__) {}
        }
        return false;
    }

    // Asynchronous initialization of controllers and complex setup
    async init() {
        // Ensure StorageService is initialized early so provider-backed constructors
        // receive a real storage instance before controllers/managers are created.
        try {
            if (typeof initializeStorageService !== 'undefined') {
                // Final consent checker: prefer an explicit in-memory override, then a consent cookie
                // Reading cookies is limited in scope and used only to remember an explicit prior consent.
                // We deliberately avoid reading `localStorage` here so no broader storage access occurs.
                const finalConsentChecker = () => {
                    try {
                        if (typeof window !== 'undefined' && typeof window.__mp4_consent_override !== 'undefined') {
                            return !!window.__mp4_consent_override;
                        }
                        if (typeof document !== 'undefined' && typeof document.cookie === 'string') {
                            // Look for cookie named mp4_storage_consent=1
                            const parts = document.cookie.split(';').map(p => p.trim());
                            for (const p of parts) {
                                if (p.indexOf('mp4_storage_consent=') === 0) {
                                    return p.split('=')[1] === '1';
                                }
                            }
                        }
                    } catch (e) { /* best-effort - default to no consent */ }
                    return false;
                };

                // Initialize StorageService with the final consent checker
                const createdService = initializeStorageService(finalConsentChecker, this.errorHandler, this.eventBus);
                
                // Create provider from the initialized service
                if (createdService && typeof StorageServiceProvider !== 'undefined') {
                    this.storageProvider = new StorageServiceProvider(createdService, this.errorHandler);
                    if (typeof window !== 'undefined') window.storageProvider = this.storageProvider;
                }
            }
        } catch (e) { 
            moduleErrorHandler && moduleErrorHandler.logError(e, 'InteractiveMap.init.StorageServiceEarly', { message: 'Failed to initialize StorageService early' }); 
        }
        // Create state managers now that provider is available
        try {
            // Require a valid StorageService instance before creating state managers
            const svc = this._getStorageInstance();
            if (!svc) {
                const err = new Error('StorageService not available: initialization requires a valid StorageService instance');
                this.errorHandler && this.errorHandler.logError && this.errorHandler.logError(err, 'InteractiveMap.init.createStateManagers');
                // CRITICAL: Rethrow to prevent cascade failures - app cannot function without state managers
                throw err;
            }

            if (!this.mapState) {
                this.mapState = new MapState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
                this.selectionState = new SelectionState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
                this.editModeState = new EditModeState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
                this.highlightState = new HighlightState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
                this.tilesetState = new TilesetState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
                this.routeAnimationState = new RouteAnimationState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
                this.routeEditState = new RouteEditState({ eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
                this.dragState = new DragState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
                this.layerState = new LayerState(Object.keys(LAYERS || {}), MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
                this.heatmapDisplayState = new HeatmapDisplayState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
                this.imageState = new ImageState(MP4Config, this.tilesetState, this.mapState, { errorHandler: this.errorHandler });

                // Initialize canvas dimensions for mapState
                try { this.mapState.setCanvasSize(this.canvas.width, this.canvas.height, window.devicePixelRatio || 1); } catch (__) {}
            }
        } catch (e) {
            // Log critical initialization failure and rethrow - app cannot continue without state managers
            moduleErrorHandler && moduleErrorHandler.logError && moduleErrorHandler.logError(e, 'InteractiveMap.init.createStateManagers.CRITICAL');
            throw e;
        }
        // Phase 1: data and render controllers
        try {
            // Initialize DataController (managers)
            if (typeof DataController !== 'undefined') {
                this.dataController = new DataController({
                    mapState: this.mapState,
                    eventBus: this.eventBus,
                    errorHandler: this.errorHandler,
                    config: MP4Config,
                    notificationInterface: (typeof NotificationInterface !== 'undefined') ? NotificationInterface : null,
                    storageProvider: this.storageProvider
                });
                try {
                    await this.dataController.init();
                    // Get manager references for backward compatibility
                    this.markerManager = this.dataController.getMarkerManager();
                    this.routeManager = this.dataController.getRouteManager();
                } catch (e) {
                    moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init', { message: 'DataController.init failed' });
                }
            }

            // Initialize routeState with current route looping (after routeManager is created)
            // RouteState removed - route looping is managed by RouteManager

            // Initialize RenderController (renderers and pipeline)
            if (typeof RenderController !== 'undefined') {
                this.renderController = new RenderController({
                    mapState: this.mapState,
                    tilesetState: this.tilesetState,
                    imageState: this.imageState,
                    eventBus: this.eventBus,
                    errorHandler: this.errorHandler,
                    config: MP4Config,
                    markerManager: this.markerManager,
                    routeManager: this.routeManager,
                    layerState: this.layerState,
                    selectionState: this.selectionState,
                    routeAnimationState: this.routeAnimationState,
                    dragState: this.dragState,
                    highlightState: this.highlightState,
                    storageProvider: this.storageProvider,
                    heatmapDisplayState: this.heatmapDisplayState,
                    canvas: {
                        main: this.canvas,
                        tiles: this.canvasTiles,
                        heatmap: this.canvasHeatmap,
                        grid: this.canvasGrid,
                        marker: this.canvasMarker,
                        route: this.canvasRoute,
                        overlay: this.canvasOverlay
                    },
                    containerNode: this.canvas.parentElement,
                    map: this  // Pass map instance for RenderContext creation
                });
                try {
                    await this.renderController.init();
                    // Get renderer references for backward compatibility
                    this.tileRenderer = this.renderController.getRenderer('TileRenderer');
                    this.heatmapRenderer = this.renderController.getRenderer('HeatmapRenderer');
                    this.gridRenderer = this.renderController.getRenderer('GridRenderer');
                    this.markerRenderer = this.renderController.getRenderer('MarkerRenderer');
                    this.routeRenderer = this.renderController.getRenderer('RouteRenderer');
                    this.overlayRenderer = this.renderController.getRenderer('OverlayRenderer');
                    this.renderPipeline = this.renderController.renderPipeline;
                } catch (e) {
                    moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init', { message: 'RenderController.init failed' });
                }
            }
        } catch (e) { moduleErrorHandler && moduleErrorHandler.logError(e, 'InteractiveMap.init.rendererManagerInit', { message: 'InteractiveMap: renderer and manager initialization failed' }); }

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
        } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.deviceDetection', { message: 'InteractiveMap: device detection failed' }); }

        // Method to update loop UI (called when route changes)
        this.updateLoopUI = () => {
            try {
                const loopBtn = document.getElementById('loopRouteBtn');
                if (!loopBtn) return;
                loopBtn.classList.toggle('active', this.routeLooping);
                loopBtn.setAttribute('aria-pressed', this.routeLooping ? 'true' : 'false');
            } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.updateLoopUI', { message: 'updateLoopUI: failed to update button state' }); }
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
                const _stor = getStorage();
                let g = null;
                if (_stor && typeof _stor.loadSetting === 'function') {
                    g = _stor.loadSetting(MP4Config.STORAGE_KEYS.GRID_VISIBLE);
                } else if (_stor && typeof _stor.get === 'function') {
                    g = _stor.get(MP4Config.STORAGE_KEYS.GRID_VISIBLE);
                }

                if (g === null || typeof g === 'undefined') {
                    this.layerState.setGridVisible(false);
                } else {
                    this.layerState.setGridVisible(g === '1' || g === 1 || g === 'true' || g === true);
                }
            } catch (e) {
                this.layerState.setGridVisible(false);
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
        // Keep tooltip at root level for proper positioning above sidebar
        try {
            if (this.tooltip) {
                try { this.tooltip.style.position = 'absolute'; this.tooltip.style.zIndex = '150'; this.tooltip.style.pointerEvents = 'none'; } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init.tooltipStyle', { message: 'Failed to style tooltip' }); }
            }
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init.tooltipSetup', { message: 'Tooltip positioning setup failed' });
        }
        // Tileset settings managed by TilesetState, Heatmap by HeatmapDisplayState
        if (this.layerState) {
            // Load tileset from storage
            try {
                const _stor = getStorage();
                let t = null;
                if (_stor && typeof _stor.loadSetting === 'function') t = _stor.loadSetting(MP4Config.STORAGE_KEYS.TILESET);
                else if (_stor && typeof _stor.get === 'function') t = _stor.get(MP4Config.STORAGE_KEYS.TILESET);
                this.tileset = t || 'sat';
            } catch (e) { this.tileset = 'sat'; }

            // Load tileset grayscale from storage
            try {
                const _stor = getStorage();
                let g = null;
                if (_stor && typeof _stor.loadSetting === 'function') g = _stor.loadSetting(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE);
                else if (_stor && typeof _stor.get === 'function') g = _stor.get(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE);
                this.tilesetGrayscale = (g === '1' || g === 1 || g === true);
            } catch (e) { this.tilesetGrayscale = false; }
        } else {
            // Fallback for when LayerState is not available
            try {
                const _stor = getStorage();
                let t = null;
                if (_stor && typeof _stor.loadSetting === 'function') t = _stor.loadSetting(MP4Config.STORAGE_KEYS.TILESET);
                else if (_stor && typeof _stor.get === 'function') t = _stor.get(MP4Config.STORAGE_KEYS.TILESET);
                this.tileset = t || 'sat';
            } catch (e) { this.tileset = 'sat'; }

            try {
                const _stor = getStorage();
                let g = null;
                if (_stor && typeof _stor.loadSetting === 'function') g = _stor.loadSetting(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE);
                else if (_stor && typeof _stor.get === 'function') g = _stor.get(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE);
                this.tilesetGrayscale = (g === '1' || g === 1 || g === true);
            } catch (e) { this.tilesetGrayscale = false; }
        }

        // Load heatmap visibility from storage into dedicated HeatmapDisplayState
        if (this.heatmapDisplayState) {
            try {
                const _stor = getStorage();
                this.heatmapDisplayState.loadFromStorage(_stor);
            } catch (e) {
                this.heatmapDisplayState.setVisible(false);
            }
        }
        
        // Load marker scaling configuration (consent-gated)
        try {
            const _stor = getStorage();
            let savedScaling = null;
            if (_stor && typeof _stor.hasConsent === 'function' && _stor.hasConsent()) {
                if (typeof _stor.get === 'function') savedScaling = _stor.get(MP4Config.STORAGE_KEYS.MARKER_SCALING);
                else if (typeof _stor.loadSetting === 'function') savedScaling = _stor.loadSetting(MP4Config.STORAGE_KEYS.MARKER_SCALING);
            } else if (_stor && typeof _stor.loadMarkerScaling === 'function') {
                savedScaling = _stor.loadMarkerScaling();
            }
            if (savedScaling) {
                MP4Config.MARKER_SCALING.userScaleMultiplier = savedScaling.userScaleMultiplier || MP4Config.MARKER_SCALING.userScaleMultiplier;
                MP4Config.MARKER_SCALING.highlightMultiplier = savedScaling.highlightMultiplier || MP4Config.MARKER_SCALING.highlightMultiplier;
            }
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init.markerScaling', { message: 'Failed to load marker scaling config' });
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
                RouteAnimation.initialize(this.routeAnimationState, { errorHandler: this.errorHandler });
            }
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init.routeAnimation', { message: 'RouteAnimation initialization failed' });
        }

        this.render();

        // Loop Route toggle: explicit control for closing/opening computed/manual routes
        try {
            const loopBtn = document.getElementById('loopRouteBtn');
            const updateLoopUI = () => {
                if (!loopBtn) return;
                try { 
                    loopBtn.classList.toggle('active', this.routeLooping);
                    loopBtn.setAttribute('aria-pressed', this.routeLooping ? 'true' : 'false');
                } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init.updateLoopUI', { message: 'updateLoopUI: failed to update button state' }); }
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
                        moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.loopRoute.invalidateCache', { message: 'Failed to invalidate route renderer cache on loop toggle' });
                    }

                    try {
                        if (this.routeManager) this.routeManager.saveRouteLoopingFlag(this.routeLooping);
                    } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.loopRoute.persistFlag', { message: 'loopRoute: failed to persist loop flag' }); }
                    try { this.render(); } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.loopRoute.render', { message: 'loopRoute: failed to request render' }); }
                    updateLoopUI();
                });
            }
            updateLoopUI();
        } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init.loopControls', { message: 'InteractiveMap: loop controls initialization failed' }); }

        // Phase 2: input and state scaffolds
        try {
            // Initialize InputController (gesture, keyboard, pointer handlers)
            if (typeof InputController !== 'undefined') {
                this.inputController = new InputController({
                    // Provide explicit small services instead of full InteractiveMap
                    mapState: this.mapState,
                    canvas: this.canvas,
                    markerManager: this.markerManager,
                    markerRenderer: this.markerRenderer,
                    layerVisibility: this.layerVisibility,
                    layerConfig: this.layerConfig,
                    selectionState: this.selectionState,
                    editModeState: this.editModeState,
                    dragState: this.dragState,
                    imageState: this.imageState,
                    routeManager: this.routeManager,
                    routeController: this.routeController,
                    eventBus: this.eventBus,
                    errorHandler: this.errorHandler,
                    config: MP4Config,
                    storageProvider: this.storageProvider,
                    // Bind helper callbacks expected by handlers
                    checkMarkerHover: this.checkMarkerHover ? this.checkMarkerHover.bind(this) : null,
                    saveViewToStorage: this.saveViewToStorage ? this.saveViewToStorage.bind(this) : null,
                    showTooltip: this.showTooltip ? this.showTooltip.bind(this) : null,
                    hideTooltip: this.hideTooltip ? this.hideTooltip.bind(this) : null,
                    updateResolution: this.updateResolution ? this.updateResolution.bind(this) : null,
                    // UI action hooks and view helpers
                    zoomIn: this.zoomIn ? this.zoomIn.bind(this) : null,
                    zoomOut: this.zoomOut ? this.zoomOut.bind(this) : null,
                    resetView: this.resetView ? this.resetView.bind(this) : null,
                    expandRouteNearby: this.expandRouteNearby ? this.expandRouteNearby.bind(this) : null,
                    setGridHeatmap: this.setGridHeatmap ? this.setGridHeatmap.bind(this) : null,
                    _showGridHeatmap: this._showGridHeatmap || false
                });
                try {
                    await this.inputController.init();
                    // Get handler references for backward compatibility
                    this.gestureHandler = this.inputController.getGestureHandler();
                    this.pointerHandler = this.inputController.getPointerHandler();
                    this.keyboardHandler = this.inputController.getKeyboardHandler();
                } catch (e) {
                    moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init', { message: 'InputController.init failed' });
                }
            }
        } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init.inputStateSetup', { message: 'InteractiveMap: input/state scaffolding setup failed' }); }
    }

    // Cleanup method to properly destroy controllers and resources
    destroy() {
        // Destroy controllers in reverse order of initialization
        if (this.inputController && typeof this.inputController.destroy === 'function') {
            try {
                this.inputController.destroy();
            } catch (e) {
                moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.destroy', { message: 'InputController.destroy failed' });
            }
        }

        if (this.renderController && typeof this.renderController.destroy === 'function') {
            try {
                this.renderController.destroy();
            } catch (e) {
                moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.destroy', { message: 'RenderController.destroy failed' });
            }
        }

        if (this.dataController && typeof this.dataController.destroy === 'function') {
            try {
                this.dataController.destroy();
            } catch (e) {
                moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.destroy', { message: 'DataController.destroy failed' });
            }
        }

        // Clear controller references
        this.inputController = null;
        this.renderController = null;
        this.dataController = null;
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
        return this.editModeState ? this.editModeState.editMarkersMode : this._fallbackEditMarkersMode;
    }

    set editMarkersMode(value) {
        if (this.editModeState) {
            this.editModeState.setEditMarkersMode(value);
        } else {
            this._fallbackEditMarkersMode = value;
        }
    }

    get editRouteMode() {
        return this.editModeState ? this.editModeState.editRouteMode : this._fallbackEditRouteMode;
    }

    set editRouteMode(value) {
        if (this.editModeState) {
            this.editModeState.setEditRouteMode(value);
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
        return this.routeAnimationState ? this.routeAnimationState.getAnimationOffset() : undefined;
    }

    set _routeDashOffset(value) {
        if (this.routeAnimationState) {
            this.routeAnimationState.setAnimationOffset(value);
        }
    }

    get _routeRaf() {
        return this.routeAnimationState ? this.routeAnimationState.getAnimationFrameId() : undefined;
    }

    set _routeRaf(value) {
        if (this.routeAnimationState) {
            this.routeAnimationState.setAnimationFrameId(value);
        }
    }

    get _lastRouteAnimTime() {
        return this.routeAnimationState ? this.routeAnimationState.getLastAnimationTime() : undefined;
    }

    set _lastRouteAnimTime(value) {
        if (this.routeAnimationState) {
            this.routeAnimationState.setLastAnimationTime(value);
        }
    }

    get _routeAnimationSpeed() {
        return this.routeAnimationState ? this.routeAnimationState.getAnimationSpeed() : undefined;
    }

    set _routeAnimationSpeed(value) {
        if (this.routeAnimationState) {
            this.routeAnimationState.setAnimationSpeed(value);
        }
    }

    get routeLineWidth() {
        return this.routeAnimationState ? this.routeAnimationState.getLineWidth() : undefined;
    }

    set routeLineWidth(value) {
        if (this.routeAnimationState) {
            this.routeAnimationState.setLineWidth(value);
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
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.preloadAllMapImages', { message: 'Failed to preload map images' });
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
                moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.resize.tileTransform', { message: 'Failed to set tile canvas transform' });
            }
        }
        if (this.ctxHeatmap) {
            try { this.ctxHeatmap.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {
                moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.resize.heatmapTransform', { message: 'Failed to set heatmap canvas transform' });
            }
        }

        // Size sub-canvas elements (grid, marker, route, overlay)
        // Each renderer manages its own independent canvas
        if (this.canvasGrid && this.ctxGrid) {
            this.canvasGrid.style.width = cssWidth + 'px';
            this.canvasGrid.style.height = cssHeight + 'px';
            this.canvasGrid.width = Math.max(1, Math.floor(cssWidth * dpr));
            this.canvasGrid.height = Math.max(1, Math.floor(cssHeight * dpr));
            try { this.ctxGrid.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {
                moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.resize.gridTransform', { message: 'Failed to set grid canvas transform' });
            }
        }
        if (this.canvasMarker && this.ctxMarker) {
            this.canvasMarker.style.width = cssWidth + 'px';
            this.canvasMarker.style.height = cssHeight + 'px';
            this.canvasMarker.width = Math.max(1, Math.floor(cssWidth * dpr));
            this.canvasMarker.height = Math.max(1, Math.floor(cssHeight * dpr));
            try { this.ctxMarker.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {
                moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.resize.markerTransform', { message: 'Failed to set marker canvas transform' });
            }
        }
        if (this.canvasRoute && this.ctxRoute) {
            this.canvasRoute.style.width = cssWidth + 'px';
            this.canvasRoute.style.height = cssHeight + 'px';
            this.canvasRoute.width = Math.max(1, Math.floor(cssWidth * dpr));
            this.canvasRoute.height = Math.max(1, Math.floor(cssHeight * dpr));
            try { this.ctxRoute.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {
                moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.resize.routeTransform', { message: 'Failed to set route canvas transform' });
            }
        }
        if (this.canvasOverlay && this.ctxOverlay) {
            this.canvasOverlay.style.width = cssWidth + 'px';
            this.canvasOverlay.style.height = cssHeight + 'px';
            this.canvasOverlay.width = Math.max(1, Math.floor(cssWidth * dpr));
            this.canvasOverlay.height = Math.max(1, Math.floor(cssHeight * dpr));
            try { this.ctxOverlay.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {
                moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.resize.overlayTransform', { message: 'Failed to set overlay canvas transform' });
            }
        }

        // Update MapState with new canvas dimensions
        if (this.mapState) {
            this.mapState.setCanvasSize(cssWidth, cssHeight, dpr);
        } else {
            // minZoom is a read-only property delegating to mapState.minZoom
            // Without mapState, we cannot update minZoom - log warning
            moduleErrorHandler && moduleErrorHandler.logWarning('resize() called before mapState initialized', 'InteractiveMap.resize.noMapState');
        }

        this.imageState.updateResolution();
        // Recreate honeycomb pattern when the canvas size or DPR changes
        try { this._createHoneycombPattern && this._createHoneycombPattern(); } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.resize.honeycombPattern', { message: 'Failed to recreate honeycomb pattern' });
        }
        // Trigger full render when canvas resizes (affects all renderers through batched pipeline)
        this.requestRender();
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
            // Trigger batched render for zoom change through pipeline
            this.requestRender();
        }
    }

    zoomOut() {
        // Use mapState.zoomOut() which properly handles zoom center and pan adjustment
        if (this.mapState && typeof this.mapState.zoomOut === 'function') {
            // Zoom from canvas center (no explicit centerX/centerY means it defaults to canvas center)
            this.mapState.zoomOut();
            this.imageState.updateResolution();
            this.updateResolution();
            // Trigger batched render for zoom change through pipeline
            this.requestRender();
        }
    }

    resetView() {
        // Use mapState.resetView() which properly centers and sets zoom through modular infrastructure
        if (this.mapState && typeof this.mapState.resetView === 'function') {
            this.mapState.resetView();
            this.imageState.updateResolution();
            this.updateResolution();
            // Trigger batched render for view reset through pipeline
            this.requestRender();
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
                if (map.routeManager && typeof map.routeManager.exportRoute === 'function') {
                    // Let RouteManager emit events and show notifications.
                    map.routeManager.exportRoute({ zoom: map.zoom, panX: map.panX, panY: map.panY }, MP4Config.MAP_SIZE);
                } else {
                    moduleErrorHandler.logWarning('Route manager not available', 'InteractiveMap.bindEvents.exportRoute');
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
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.loadViewFromStorage', { message: 'loadViewFromStorage failed' });
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
        try {
            const _stor = getStorage();
            if (_stor && typeof _stor.saveSetting === 'function') _stor.saveSetting(MP4Config.STORAGE_KEYS.TILESET, this.tilesetState ? this.tilesetState.tileset : this.tileset);
            else if (_stor && typeof _stor.set === 'function') _stor.set(MP4Config.STORAGE_KEYS.TILESET, this.tilesetState ? this.tilesetState.tileset : this.tileset);
        } catch (e) { this.errorHandler.logError(e, 'InteractiveMap._handleTilesetChange.saveTilesetSetting'); }
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
            try {
                const _stor = getStorage();
                if (_stor && typeof _stor.saveSetting === 'function') _stor.saveSetting(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE, this.tilesetGrayscale ? '1' : '0');
                else if (_stor && typeof _stor.set === 'function') _stor.set(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE, this.tilesetGrayscale ? '1' : '0');
            } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTilesetGrayscale.saveSetting'); }
            this._handleTilesetChange();
        }
    }

    // Toggle and persist the grid heatmap overlay
    setGridHeatmap(enabled) {
        enabled = !!enabled;
        // Use heatmapDisplayState if available, fallback to old method
        if (this.heatmapDisplayState) {
            if (this.heatmapDisplayState.isVisible() === enabled) return;
            this.heatmapDisplayState.setVisible(enabled);
            // Event handler in eventBus will mark renderers dirty and save to storage
        } else {
            // Fallback to old implementation using _showGridHeatmap
            if (this._showGridHeatmap === enabled) return;
            this._showGridHeatmap = enabled;
            try {
                const _stor = getStorage();
                if (_stor && typeof _stor.saveSetting === 'function') _stor.saveSetting(MP4Config.STORAGE_KEYS.GRID_HEATMAP, this._showGridHeatmap ? '1' : '0');
                else if (_stor && typeof _stor.set === 'function') _stor.set(MP4Config.STORAGE_KEYS.GRID_HEATMAP, this._showGridHeatmap ? '1' : '0');
            } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setGridHeatmap.saveSetting'); }
            try {
                // Redraw the heatmap renderer to show/hide heatmap overlay
                this.markRendererDirty('HeatmapRenderer');
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
        

        if (typeof needed !== 'number') {
            try { moduleErrorHandler.logWarn('InteractiveMap.updateResolution: needed is not a number', { needed }); } catch (e) { /* best-effort logging */ }
        }

        if (needed !== current && loading !== needed) {
            try {
                if (this.tileRenderer && typeof this.tileRenderer.loadImage === 'function') {
                    try { this.tileRenderer.loadImage(needed); } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'InteractiveMap.updateResolution.tileRenderer.loadImage'); }
                }
            } catch (e) { this.errorHandler && this.errorHandler.logError(e, 'InteractiveMap.updateResolution.tileRenderer.loadImage'); }
        }

        // Update status display
        const status = document.getElementById('resolutionStatus');
        if (status) {
            // Show the needed resolution, not the currently loaded one
            // This ensures the display is correct even before images finish loading
            const res = MP4Config.TILE_RESOLUTIONS[needed] || MP4Config.TILE_RESOLUTIONS[0];
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

        // Mark renderers as dirty and execute selective render
        // Only re-render affected renderers based on what changed
        try { 
            // Markers, routes, and overlays always affected by layer toggles
            this.markRendererDirty('MarkerRenderer');
            this.markRendererDirty('RouteRenderer');
            this.markRendererDirty('OverlayRenderer');
            // Grid layer visibility change requires grid to be redrawn too
            if (layerKey === 'grid') {
                this.markRendererDirty('GridRenderer');
            }
            // Request selective render via RenderController (preserve immediate fallback)
            try {
                if (this.eventBus && window.EventTypes && window.EventTypes.RENDER_SELECTIVE_REQUESTED) {
                    const dirtyRenderers = this.renderPipeline && typeof this.renderPipeline.getDirtyRenderers === 'function'
                        ? Array.from(this.renderPipeline.getDirtyRenderers()) : ['MarkerRenderer', 'RouteRenderer', 'OverlayRenderer'];
                    try { this.eventBus.emit(window.EventTypes.RENDER_SELECTIVE_REQUESTED, { renderers: dirtyRenderers }); } catch (e) { try { this.errorHandler && this.errorHandler.logError(e, 'InteractiveMap.toggleLayer.emitRenderSelective'); } catch (logErr) { try { moduleErrorHandler && moduleErrorHandler.logWarning(logErr, 'InteractiveMap.toggleLayer.emitRenderSelective.logFallback', { message: 'toggleLayer emit failed' }); } catch (ignore) {} } }
                } else if (this.renderPipeline && typeof this.renderPipeline.render === 'function') {
                    const dirtyRenderers = this.renderPipeline.getDirtyRenderers();
                    if (dirtyRenderers.size > 0) this.renderPipeline.render(dirtyRenderers);
                }
            } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.toggleLayer.requestSelectiveRender'); }
        } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.toggleLayer.render'); }
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
            const ordered = RouteMath.createOrderedSources(prevIndices, prevSources);

            // Calculate insertion position along the segment
            const insertPosition = RouteMath.calculateSegmentInsertionPosition(seg.index, seg.t, ordered, this.routeLooping);
            if (!insertPosition) return;

            // Create temporary marker using object pool
            const tempMarker = typeof markerPool !== 'undefined' ? markerPool.acquire() : { uid: '', x: 0, y: 0 };
            tempMarker.x = insertPosition.x;
            tempMarker.y = insertPosition.y;

            // Insert waypoint into ordered sources
            const newOrdered = RouteMath.insertWaypointIntoOrderedSources(ordered, insertPosition, tempMarker, 'temp');

            const newSources = newOrdered;
            const newIndices = newSources.map((_, i) => i);

            // Set the route with the temporary insertion
            const computedLength = this.routeManager ? this.routeManager.computeRouteLengthNormalized(newSources, MP4Config.MAP_SIZE) : 0;
            this.setRoute(newIndices, computedLength, newSources);

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
            moduleErrorHandler && moduleErrorHandler.logWarning(err, 'InteractiveMap.startRouteInsert', { message: 'Route insert start failed' });
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
            const routePos = (this.routeManager && typeof this.routeManager.findRoutePositionOfMarker === 'function') ?
                this.routeManager.findRoutePositionOfMarker(hit.marker.uid) : -1;

            if (routePos === -1) return; // Marker not in current route

            // Set up route node candidate for dragging
            this.pointerHandler.dragState.setRouteNodeCandidate({
                pointerId: ev.pointerId,
                routePos: routePos,
                startClientX: ev.clientX,
                startClientY: ev.clientY
            });

            // Clear pointer down time to prevent click handling
            this.pointerDownTime = 0;

        } catch (err) {
            moduleErrorHandler && moduleErrorHandler.logWarning(err, 'InteractiveMap.handleRouteNodeDragStart', { message: 'Route node drag start failed' });
            this.pointerHandler.dragState.setRouteNodeCandidate(null);
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
        // Compute desired position (relative to viewport since tooltip is at root level)
        const margin = 6;
        try {
            let desiredLeft = Math.round(x + 15);
            let desiredTop = Math.round(y - 10);

            // Clamp to viewport bounds so tooltip doesn't overflow
            const maxLeft = Math.max(0, window.innerWidth - (this.tooltip.offsetWidth || 120) - margin);
            const maxTop = Math.max(0, window.innerHeight - (this.tooltip.offsetHeight || 28) - margin);
            desiredLeft = Math.min(Math.max(desiredLeft, margin), maxLeft);
            desiredTop = Math.min(Math.max(desiredTop, margin), maxTop);
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
                try {
                    let bg = null;
                    if (typeof RenderUtils !== 'undefined' && typeof RenderUtils.hexToRgba === 'function') {
                        bg = RenderUtils.hexToRgba(layerCol, 0.12);
                    } else if (typeof ColorUtils !== 'undefined' && typeof ColorUtils.hexToRgba === 'function') {
                        bg = ColorUtils.hexToRgba(layerCol, 0.12);
                    } else if (typeof colorToRgba === 'function') {
                        bg = colorToRgba(layerCol, 0.12);
                    }
                    this.tooltip.style.background = bg || this.tooltip.style.background;
                } catch (e) { 
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
                moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.render.renderPipeline', { message: 'map.render: renderPipeline.render failed' });
                // Fall back to individual renderers with renderContext
                const fallbackRenderContext = typeof RenderContext !== 'undefined' ? RenderContext.fromMap(this) : null;
                const fallbackViewportContext = typeof ViewportContext !== 'undefined' ? ViewportContext.fromMapState(this.mapState) : null;
                try { if (this.tileRenderer && typeof this.tileRenderer.render === 'function') this.tileRenderer.render(fallbackRenderContext); } catch (err) { moduleErrorHandler && moduleErrorHandler.logWarning(err, 'InteractiveMap.render.tileRenderer', { message: 'renderTiles: tileRenderer.render failed' }); }
                try { if (this.heatmapRenderer && typeof this.heatmapRenderer.render === 'function') this.heatmapRenderer.render(fallbackRenderContext); } catch (err) { moduleErrorHandler && moduleErrorHandler.logWarning(err, 'InteractiveMap.render.heatmapRenderer', { message: 'renderHeatmap: heatmapRenderer.render failed' }); }
                try { if (this.gridRenderer && typeof this.gridRenderer.render === 'function') this.gridRenderer.render(fallbackRenderContext, fallbackViewportContext); } catch (err) { moduleErrorHandler && moduleErrorHandler.logWarning(err, 'InteractiveMap.render.gridRenderer', { message: 'renderGrid: gridRenderer.render failed' }); }
                try { if (this.markerRenderer && typeof this.markerRenderer.render === 'function') this.markerRenderer.render(fallbackRenderContext); } catch (err) { moduleErrorHandler && moduleErrorHandler.logWarning(err, 'InteractiveMap.render.markerRenderer', { message: 'renderMarkers: markerRenderer.render failed' }); }
                try { if (this.routeRenderer && typeof this.routeRenderer.render === 'function') this.routeRenderer.render(fallbackRenderContext, fallbackViewportContext); } catch (err) { moduleErrorHandler && moduleErrorHandler.logWarning(err, 'InteractiveMap.render.routeRenderer', { message: 'renderRoute: routeRenderer.render failed' }); }
                try { if (this.overlayRenderer && typeof this.overlayRenderer.render === 'function') this.overlayRenderer.render(fallbackRenderContext); } catch (err) { moduleErrorHandler && moduleErrorHandler.logWarning(err, 'InteractiveMap.render.overlayRenderer', { message: 'renderOverlay: overlayRenderer.render failed' }); }
                return;
            }
            // Ensure DOM quadrant labels are updated
            try { if (this.gridRenderer && typeof this.gridRenderer.updateQuadLabels === 'function') this.gridRenderer.updateQuadLabels(); } catch (e) { 
                this.errorHandler.logError(e, 'InteractiveMap.render.updateQuadLabels');
            }
            return;
        }

        // Fallback: individual renderers (legacy path)
        const legacyViewportContext = typeof ViewportContext !== 'undefined' ? ViewportContext.fromMapState(this.mapState) : null;
        try { if (this.tileRenderer && typeof this.tileRenderer.render === 'function') this.tileRenderer.render(); } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.render.fallback.tileRenderer', { message: 'renderTiles: tileRenderer.render failed' }); }
        try { if (this.heatmapRenderer && typeof this.heatmapRenderer.render === 'function') this.heatmapRenderer.render(); } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.render.fallback.heatmapRenderer', { message: 'renderHeatmap: heatmapRenderer.render failed' }); }
        try { if (this.gridRenderer && typeof this.gridRenderer.render === 'function') this.gridRenderer.render(null, legacyViewportContext); } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.render.fallback.gridRenderer', { message: 'renderGrid: gridRenderer.render failed' }); }
        try { if (this.markerRenderer && typeof this.markerRenderer.render === 'function') this.markerRenderer.render(); } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.render.fallback.markerRenderer', { message: 'renderMarkers: markerRenderer.render failed' }); }
        try { if (this.routeRenderer && typeof this.routeRenderer.render === 'function') this.routeRenderer.render(null, legacyViewportContext); } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.render.fallback.routeRenderer', { message: 'renderRoute: routeRenderer.render failed' }); }
        try { if (this.overlayRenderer && typeof this.overlayRenderer.render === 'function') this.overlayRenderer.render(); } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.render.fallback.overlayRenderer', { message: 'renderOverlay: overlayRenderer.render failed' }); }
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
        if (this.renderController && typeof this.renderController.markRendererDirty === 'function') {
            this.renderController.markRendererDirty(rendererName);
        } else if (this.renderPipeline && typeof this.renderPipeline.markDirty === 'function') {
            // Fallback to direct pipeline access if renderController not available
            this.renderPipeline.markDirty(rendererName);

            // Sub-canvas architecture: Each renderer manages its own canvas independently
            // CompositeStage must be marked dirty whenever a sub-canvas renderer changes
            // to ensure sub-canvases are composited onto the display
            const subCanvasRenderers = ['HeatmapRenderer', 'GridRenderer', 'MarkerRenderer', 'RouteRenderer', 'OverlayRenderer'];
            if (subCanvasRenderers.includes(rendererName)) {
                this.renderPipeline.markDirty('CompositeStage');
            }
        } else {
            // Fallback: trigger full render if pipeline doesn't support dirty flags
            this._requestFullRender();
        }
    }

    /**
     * Requests a full render of all renderers via the batching system.
     * Used for expensive operations like zoom, pan, resize that affect tiles and overlays.
     * Marks all renderers dirty and schedules RAF for batched execution.
     * @private Internal method - use markRendererDirty() for selective updates
     */
    _requestFullRender() {
        if (this.renderPipeline && typeof this.renderPipeline.markDirty === 'function') {
            // Mark all renderers dirty for full render
            const allRenderers = ['TileRenderer', 'HeatmapRenderer', 'GridRenderer', 'MarkerRenderer', 'RouteRenderer', 'OverlayRenderer'];
            allRenderers.forEach(name => this.renderPipeline.markDirty(name));
            // CompositeStage already marked dirty by markRendererDirty() for overlays, but mark explicitly
            this.renderPipeline.markDirty('CompositeStage');
        } else {
            // Fallback: immediate render if pipeline doesn't support dirty flags
            this.render();
        }
    }

    /**
     * Requests a batched render using the render pipeline's dirty flag system.
     * Multiple calls in the same frame will be batched together into a single RAF callback.
     * Used specifically for zoom/pan/resize operations that affect all renderers.
     * This method delegates to _requestFullRender() which properly queues all renderers.
     */
    requestRender() {
        // For top-level operations (zoom, pan, resize), mark all renderers dirty
        // This ensures consistent, batched rendering behavior through the pipeline
        this._requestFullRender();
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
        try { this.gridRenderer.renderQuadrantGrid(); } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.renderQuadrantGrid', { message: 'map.renderQuadrantGrid delegate failed' }); }
    }


    // Draw fine detail grid covering the map area (8x8 subdivision)
    renderDetailGrid() {
        try { this.gridRenderer.renderDetailGrid(); } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.renderDetailGrid', { message: 'map.renderDetailGrid delegate failed' }); }
    }
            



    
    // Draw axis index labels for the 8x8 grid
    renderAxisLabels() {
        try { this.gridRenderer.renderAxisLabels(); } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.renderAxisLabels', { message: 'map.renderAxisLabels delegate failed' }); }
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
            const _stor = getStorage();
            if (_stor && typeof _stor.hasConsent === 'function' && _stor.hasConsent()) {
                if (typeof _stor.set === 'function') {
                    _stor.set(MP4Config.STORAGE_KEYS.MARKER_SCALING, {
                        userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                        highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                    });
                } else if (typeof _stor.saveSetting === 'function') {
                    _stor.saveSetting(MP4Config.STORAGE_KEYS.MARKER_SCALING, {
                        userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                        highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                    });
                }
            } else if (_stor && typeof _stor.saveMarkerScaling === 'function') {
                _stor.saveMarkerScaling({
                    userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                    highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                });
            }
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.updateMarkerBaseSize', { message: 'Failed to save marker scaling config' });
        }
        // Trigger re-render to show new sizes
        this.render();
    }

    // Update marker user scale multiplier and save to storage (consent-gated)
    updateMarkerUserScaleMultiplier(newMultiplier) {
        MP4Config.MARKER_SCALING.userScaleMultiplier = Math.max(0.5, Math.min(1.5, newMultiplier));
        try {
            const _stor = getStorage();
            if (_stor && typeof _stor.hasConsent === 'function' && _stor.hasConsent()) {
                if (typeof _stor.set === 'function') {
                    _stor.set(MP4Config.STORAGE_KEYS.MARKER_SCALING, {
                        userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                        highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                    });
                } else if (typeof _stor.saveSetting === 'function') {
                    _stor.saveSetting(MP4Config.STORAGE_KEYS.MARKER_SCALING, {
                        userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                        highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                    });
                }
            } else if (_stor && typeof _stor.saveMarkerScaling === 'function') {
                _stor.saveMarkerScaling({
                    userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                    highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                });
            }
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.updateMarkerUserScaleMultiplier', { message: 'Failed to save marker scaling config' });
        }
        // Trigger re-render to show new sizes
        this.render();
    }

    // Update marker highlight multiplier and save to storage (consent-gated)
    updateMarkerHighlightMultiplier(newMultiplier) {
        MP4Config.MARKER_SCALING.highlightMultiplier = Math.max(1.5, Math.min(2.5, newMultiplier));
        try {
            const _stor = getStorage();
            if (_stor && typeof _stor.hasConsent === 'function' && _stor.hasConsent()) {
                if (typeof _stor.set === 'function') {
                    _stor.set(MP4Config.STORAGE_KEYS.MARKER_SCALING, {
                        userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                        highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                    });
                } else if (typeof _stor.saveSetting === 'function') {
                    _stor.saveSetting(MP4Config.STORAGE_KEYS.MARKER_SCALING, {
                        userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                        highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                    });
                }
            } else if (_stor && typeof _stor.saveMarkerScaling === 'function') {
                _stor.saveMarkerScaling({
                    userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                    highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                });
            }
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.updateMarkerHighlightMultiplier', { message: 'Failed to save marker scaling config' });
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
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.setRoute.invalidateCache', { message: 'Failed to invalidate route renderer cache' });
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
            (this._routeInsert || this.pointerHandler.dragState.routeNodeCandidate || this._draggingMarker)) {
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
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.clearRoute.invalidateCache', { message: 'Failed to invalidate route renderer cache' });
        }

        // Update UI counts via the central updater so it shows '0'
        try {
            // Layer counts will be updated via ROUTE_CLEARED event
        } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.clearRoute.updateLayerCounts'); }
        this.render();
        // Stop animated route when cleared
        this.stopRouteAnimation();
        // If we were in route edit mode, exit via canonical helper so visuals cleanly update
        try { if (this.eventBus) this.eventBus.emit(window.EventTypes.EDIT_MODE_EXIT_REQUESTED, { mode: 'route' }); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.clearRoute.exitEditModeForLayer'); }
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
        const opts = {
            routeAnimationState: this.routeAnimationState,
            routeManager: this.routeManager,
            mapState: this.mapState,
            eventBus: this.eventBus,
            renderCallback: () => {
                try {
                    if (this.markRendererDirty) this.markRendererDirty('RouteRenderer');
                    else if (this.eventBus && window.EventTypes && window.EventTypes.RENDER_SELECTIVE_REQUESTED) this.eventBus.emit(window.EventTypes.RENDER_SELECTIVE_REQUESTED, { renderers: ['RouteRenderer'] });
                    else if (this.render) this.render();
                } catch (e) { /* swallow render errors from callback */ }
            },
            errorHandler: this.errorHandler
        };

        try {
            if (window.RouteAnimationController && typeof window.RouteAnimationController.start === 'function') {
                window.RouteAnimationController.start(opts);
            } else if (typeof RouteAnimation !== 'undefined' && typeof RouteAnimation.start === 'function') {
                RouteAnimation.start(opts);
            }
        } catch (e) {
            this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'InteractiveMap.startRouteAnimation.call');
        }
    }

    stopRouteAnimation() {
        const opts = { routeAnimationState: this.routeAnimationState, errorHandler: this.errorHandler };
        try {
            if (window.RouteAnimationController && typeof window.RouteAnimationController.stop === 'function') {
                window.RouteAnimationController.stop(opts);
            } else if (typeof RouteAnimation !== 'undefined' && typeof RouteAnimation.stop === 'function') {
                RouteAnimation.stop(opts);
            }
        } catch (e) {
            this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'InteractiveMap.stopRouteAnimation.call');
        }
    }

    /**
     * Cleans up all event listeners and resources to prevent memory leaks.
     * Should be called when the InteractiveMap instance is no longer needed.
     */
    destroy() {
        // Clean up all stored event listeners
        if (this._eventUnsubscribers && Array.isArray(this._eventUnsubscribers)) {
            this._eventUnsubscribers.forEach(unsubscribe => {
                try {
                    if (typeof unsubscribe === 'function') {
                        unsubscribe();
                    }
                } catch (e) {
                    moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.destroy.unsubscribe', { message: 'Failed to unsubscribe event listener' });
                }
            });
            this._eventUnsubscribers.length = 0; // Clear the array
        }

        // Stop any ongoing animations
        try {
            this.stopRouteAnimation();
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.destroy.stopAnimation', { message: 'Failed to stop route animation during destroy' });
        }

        // Clean up renderers if they have destroy methods
        const renderers = [this.tileRenderer, this.heatmapRenderer, this.gridRenderer, this.markerRenderer, this.routeRenderer, this.overlayRenderer];
        renderers.forEach(renderer => {
            try {
                if (renderer && typeof renderer.destroy === 'function') {
                    renderer.destroy();
                }
            } catch (e) {
                moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.destroy.renderer', { message: 'Failed to destroy renderer', renderer: renderer ? renderer.constructor.name : 'unknown' });
            }
        });

        // Clean up state managers if they have destroy methods
        const stateManagers = [this.mapState, this.routeAnimationState, this.selectionState, this.layerState, this.editModeState, this.tilesetState, this.imageState];
        stateManagers.forEach(manager => {
            try {
                if (manager && typeof manager.destroy === 'function') {
                    manager.destroy();
                }
            } catch (e) {
                moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.destroy.stateManager', { message: 'Failed to destroy state manager', manager: manager ? manager.constructor.name : 'unknown' });
            }
        });

        // Clean up controllers if they have destroy methods
        try {
            if (this.routeController && typeof this.routeController.destroy === 'function') {
                this.routeController.destroy();
            }
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.destroy.routeController', { message: 'Failed to destroy route controller' });
        }

        // Clean up input handlers if they have destroy methods
        try {
            if (this.gestureHandler && typeof this.gestureHandler.destroy === 'function') {
                this.gestureHandler.destroy();
            }
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.destroy.gestureHandler', { message: 'Failed to destroy gesture handler' });
        }

        // Clean up route manager if it has destroy method
        try {
            if (this.routeManager && typeof this.routeManager.destroy === 'function') {
                this.routeManager.destroy();
            }
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.destroy.routeManager', { message: 'Failed to destroy route manager' });
        }

        // Clean up marker manager if it has destroy method
        try {
            if (this.markerManager && typeof this.markerManager.destroy === 'function') {
                this.markerManager.destroy();
            }
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.destroy.markerManager', { message: 'Failed to destroy marker manager' });
        }

        // Clean up settings controller if it has destroy method
        try {
            if (this.settingsController && typeof this.settingsController.destroy === 'function') {
                this.settingsController.destroy();
            }
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.destroy.settingsController', { message: 'Failed to destroy settings controller' });
        }

        // Clear references to prevent memory leaks
        this.canvas = null;
        this.ctx = null;
        this.canvasTiles = null;
        this.ctxTiles = null;
        this.canvasGrid = null;
        this.ctxGrid = null;
        this.canvasMarker = null;
        this.ctxMarker = null;
        this.canvasRoute = null;
        this.ctxRoute = null;
        this.canvasOverlay = null;
        this.ctxOverlay = null;
        this.tooltip = null;
    }
}

// Module-level error handler for utility functions
const moduleErrorHandler = appErrorHandler || new ErrorHandler();

// Centralized storage resolver: prefer injected provider, then new StorageService, then legacy _mp4Storage
function getStorage() {
    try {
        // Prefer the map's injected provider when available
        if (typeof map !== 'undefined' && map && map.storageProvider && typeof map.storageProvider.getInstance === 'function') {
            return map.storageProvider.getInstance();
        }
        // Fallback to a global provider if one was set for legacy reasons
        if (typeof window !== 'undefined' && window.storageProvider && typeof window.storageProvider.getInstance === 'function') {
            return window.storageProvider.getInstance();
        }
    } catch (e) {
        // swallow - fallback to null
    }
    return null;
}

// Initialize
let map;
// Queue for event unsubscriber functions registered before `map` is created.
let _pendingEventUnsubscribers = [];
function addEventUnsubscriber(unsub) {
    if (map && Array.isArray(map._eventUnsubscribers)) {
        map._eventUnsubscribers.push(unsub);
    } else {
        _pendingEventUnsubscribers.push(unsub);
    }
}
function flushPendingUnsubscribers() {
    if (!map) return;
    map._eventUnsubscribers = map._eventUnsubscribers || [];
    for (const u of _pendingEventUnsubscribers) {
        map._eventUnsubscribers.push(u);
    }
    _pendingEventUnsubscribers = [];
}

// LocalStorage helpers for layer visibility persistence
function loadLayerVisibilityFromStorage() {
    try {
        const _stor = getStorage();
        if (_stor && typeof _stor.loadSetting === 'function') return _stor.loadSetting(MP4Config.STORAGE_KEYS.LAYER_VISIBILITY);
        if (_stor && typeof _stor.get === 'function') return _stor.get(MP4Config.STORAGE_KEYS.LAYER_VISIBILITY);
        return null;
    } catch (e) {
        moduleErrorHandler.logError(e, 'loadLayerVisibilityFromStorage');
        return null;
    }
}

function saveLayerVisibilityToStorage(obj) {
    try {
        const _stor = getStorage();
        if (_stor && typeof _stor.saveSetting === 'function') {
            _stor.saveSetting(MP4Config.STORAGE_KEYS.LAYER_VISIBILITY, obj || {});
            return;
        }
        if (_stor && typeof _stor.set === 'function') {
            _stor.set(MP4Config.STORAGE_KEYS.LAYER_VISIBILITY, obj || {});
            return;
        }
        return;
    } catch (e) { moduleErrorHandler.logError(e, 'saveLayerVisibilityToStorage'); }
}

// Highlight multiplier persistence
function loadHighlightMultiplierFromStorage() {
    try {
        const _stor = getStorage();
        if (_stor && typeof _stor.loadSetting === 'function') {
            const v = _stor.loadSetting(MP4Config.STORAGE_KEYS.HIGHLIGHT_MULTIPLIER);
            if (v === null || typeof v === 'undefined') return null;
            return (typeof v === 'string') ? parseFloat(v) : Number(v);
        }
        if (_stor && typeof _stor.get === 'function') {
            const v = _stor.get(MP4Config.STORAGE_KEYS.HIGHLIGHT_MULTIPLIER);
            if (v === null || typeof v === 'undefined') return null;
            return (typeof v === 'string') ? parseFloat(v) : Number(v);
        }
        return null;
    } catch (e) { moduleErrorHandler.logError(e, 'loadHighlightMultiplierFromStorage'); return null; }
}

function saveHighlightMultiplierToStorage(v) {
    try {
        const _stor = getStorage();
        if (_stor && typeof _stor.saveSetting === 'function') {
            _stor.saveSetting(MP4Config.STORAGE_KEYS.HIGHLIGHT_MULTIPLIER, v);
            return;
        }
        if (_stor && typeof _stor.set === 'function') {
            _stor.set(MP4Config.STORAGE_KEYS.HIGHLIGHT_MULTIPLIER, v);
            return;
        }
        return;
    } catch (e) { moduleErrorHandler.logError(e, 'saveHighlightMultiplierToStorage'); }
}

// Highlighted layers persistence (consent-gated)
function loadHighlightedLayersFromStorage() {
    try {
        const _stor = getStorage();
        if (_stor && typeof _stor.loadSetting === 'function') {
            const s = _stor.loadSetting(MP4Config.STORAGE_KEYS.HIGHLIGHTED_LAYERS);
            if (!s) return null;
            return s;
        }
        if (_stor && typeof _stor.get === 'function') {
            const s = _stor.get(MP4Config.STORAGE_KEYS.HIGHLIGHTED_LAYERS);
            if (!s) return null;
            return s;
        }
        return null;
    } catch (e) { moduleErrorHandler.logError(e, 'loadHighlightedLayersFromStorage'); return null; }
}

function saveHighlightedLayersToStorage(obj) {
    try {
        const _stor = getStorage();
        if (_stor && typeof _stor.saveSetting === 'function') {
            _stor.saveSetting(MP4Config.STORAGE_KEYS.HIGHLIGHTED_LAYERS, obj || {});
            return;
        }
        if (_stor && typeof _stor.set === 'function') {
            _stor.set(MP4Config.STORAGE_KEYS.HIGHLIGHTED_LAYERS, obj || {});
            return;
        }
        return;
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
            // Update canonical state and delegate UI updates to centralized handlers
            map.editMarkersMode = false;
            try { map._exitEditMode && map._exitEditMode('customMarkers'); } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.exitCustomMarkersMode'); }
            // Hide edit overlay and request a render; UI toggles update via EDIT_MODE_CHANGED/LAYER_VISIBILITY_CHANGED listeners
            hideEditOverlayProperly();
            try {
                if (this.eventBus && window.EventTypes && window.EventTypes.RENDER_REQUESTED) {
                    try { this.eventBus.emit(window.EventTypes.RENDER_REQUESTED, {}); } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.emit RENDER_REQUESTED'); }
                } else if (map && typeof map.render === 'function') {
                    map.render();
                }
            } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.renderAfterExitCustomMarkers'); }
        } else if (layerKey === 'route' && map && map.editRouteMode) {
            // Update canonical state and delegate UI updates to centralized handlers
            map.editRouteMode = false;
            try { map._exitEditMode && map._exitEditMode('route'); } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.exitRouteMode'); }
            // Reset cursor and hide overlay; REST of UI updated by centralized listeners
            try { if (map.canvas) map.canvas.style.cursor = 'grab'; } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.resetCursor'); }
            hideEditOverlayProperly();
            try {
                if (this.eventBus && window.EventTypes && window.EventTypes.RENDER_REQUESTED) {
                    try { this.eventBus.emit(window.EventTypes.RENDER_REQUESTED, {}); } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.emit RENDER_REQUESTED'); }
                } else if (map && typeof map.render === 'function') {
                    map.render();
                }
            } catch (e) { moduleErrorHandler.logError(e, 'exitEditModeForLayer.renderAfterExitRoute'); }
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
                    scriptEl.onload = () => {
                        resolve();
                    };
                    scriptEl.onerror = (e) => {
                        reject(e);
                    };
                    document.head.appendChild(scriptEl);
                });
            }
        }
    } catch (e) {
        try { moduleErrorHandler.logError(e, 'InteractiveMap.init.loadControllerModules'); } catch (logErr) { /* best-effort logging */ }
        // Continue anyway - some controllers might still work
    }

    // Ensure StorageService is initialized (if not already). Some environments
    // StorageService initialization happens early in init() - no fallback needed here
    // State managers are constructed with storageProvider; no manual propagation needed
    

    // Initialize EventBus for cross-module communication
    try {
        if (typeof eventBus !== 'undefined') {
            eventBus.setErrorHandler(moduleErrorHandler);

            // Use EventUtils for standardized batch event listener setup
            // Create a global target object for pending unsubscribers
            if (!window._pendingEventUnsubscribers) {
                window._pendingEventUnsubscribers = [];
            }
            
            // Only set up event listeners if EventTypes are available
            if (!window.EventTypes) {
                moduleErrorHandler.logWarn('EventTypes not available, skipping event listener setup', 'InteractiveMap.init.eventSetup');
                return;
            }
            
            const eventManager = window.EventUtils.createEventManager(window, '_pendingEventUnsubscribers');

            eventManager.setup(eventBus, [
                {
                    event: window.EventTypes.LAYER_VISIBILITY_CHANGED,
                    handler: (data) => {
                        try {
                            const h = moduleErrorHandler;

                            // Entry for LAYER_VISIBILITY_CHANGED (diagnostics removed)

                            // Update layer state manager when controllers change visibility
                            // Only handle events with layerVisibility (from controllers), not layerKey (from layerState itself)
                            if (data && data.layerVisibility && map && map.layerState) {
                                map.layerState.layerVisibility = data.layerVisibility;
                            }

                            // CENTRALIZED EDIT MODE EXIT: Exit edit modes when respective layers are hidden
                            // This ensures ALL paths (SidebarController, LayerListController, LayerState, map.toggleLayer)
                            // properly exit edit modes, maintaining architectural consistency
                            if (data && map && map.editModeState) {
                                // Check individual layer visibility changes
                                if (data.layerKey && data.visible === false) {
                                    if (data.layerKey === 'customMarkers' && map.editModeState.editMarkersMode) {
                                        map.editModeState.setEditMarkersMode(false);
                                    }
                                    else if (data.layerKey === 'route' && map.editModeState.editRouteMode) {
                                        map.editModeState.setEditRouteMode(false);
                                    }
                                }
                                // Also handle bulk visibility changes (show/hide all)
                                else if (data.layerVisibility) {
                                    if (data.layerVisibility.customMarkers === false && map.editModeState.editMarkersMode) {
                                        map.editModeState.setEditMarkersMode(false);
                                    }
                                    if (data.layerVisibility.route === false && map.editModeState.editRouteMode) {
                                        map.editModeState.setEditRouteMode(false);
                                    }
                                }

                                // Log post-check state
                                // Post LAYER_VISIBILITY_CHANGED state updated (diagnostics removed)
                            }
                            
                            // Rendering is handled by RenderController; do not perform markDirty/render here.
                        } catch (e) {
                            try { moduleErrorHandler && moduleErrorHandler.logError(e, 'map.LAYER_VISIBILITY_CHANGED.handler'); } catch (ignore) {}
                        }
                    }
                },
                {
                    event: window.EventTypes.LAYER_COUNTS_CHANGED,
                    handler: (data) => {
                        if (map && typeof map.updateLayerCounts === 'function') {
                            map.updateLayerCounts();
                        }
                    }
                },
                {
                    event: window.EventTypes.LAYER_HIGHLIGHT_CHANGED,
                    handler: (data) => {
                        // Update highlighted layers state; rendering owned by RenderController
                        if (data && data.highlightedLayers && map) {
                            map.highlightedLayers = data.highlightedLayers;
                        }
                    }
                },
                {
                    event: window.EventTypes.SELECTION_CLEARED,
                    handler: (data) => {
                        if (map && typeof map.hideTooltip === 'function') {
                            map.hideTooltip();
                        }
                        // Rendering handled by RenderController; do not mark dirty here.
                    }
                },
                {
                    event: window.EventTypes.TILESET_CHANGED,
                    handler: (data) => {
                        // Tileset state has changed, trigger side effects
                        // NOTE: Do NOT call map.setTileset() here - it would emit the event again!
                        // The state has already changed; just handle the consequences.
                        if (map) {
                            try { map.imageState.incrementTilesetGeneration(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_CHANGED - incrementGeneration'); }
                            try { map._abortAndCleanupTileLoads(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_CHANGED - abortTileLoads'); }
                            try {
                                const _stor = getStorage();
                                if (_stor && typeof _stor.saveSetting === 'function') _stor.saveSetting(MP4Config.STORAGE_KEYS.TILESET, map.tilesetState.tileset);
                                else if (_stor && typeof _stor.set === 'function') _stor.set(MP4Config.STORAGE_KEYS.TILESET, map.tilesetState.tileset);
                            } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_CHANGED - saveSetting'); }
                            try { map.preloadAllMapImages(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_CHANGED - preloadImages'); }
                            try { map.loadInitialImage(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_CHANGED - loadInitialImage'); }
                            // Rendering owned by RenderController; do not mark dirty/render here.
                        }
                    }
                },
                {
                    event: window.EventTypes.TILESET_GRAYSCALE_CHANGED,
                    handler: (data) => {
                        // Grayscale state has changed, trigger side effects
                        // NOTE: Do NOT call map.setTilesetGrayscale() here - it would emit the event again!
                        if (map) {
                            try {
                                const _stor = getStorage();
                                if (_stor && typeof _stor.saveSetting === 'function') _stor.saveSetting(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE, map.tilesetState.grayscale ? '1' : '0');
                                else if (_stor && typeof _stor.set === 'function') _stor.set(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE, map.tilesetState.grayscale ? '1' : '0');
                            } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_GRAYSCALE_CHANGED - saveSetting'); }
                            try { map.imageState.incrementTilesetGeneration(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_GRAYSCALE_CHANGED - incrementGeneration'); }
                            try { map._abortAndCleanupTileLoads(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_GRAYSCALE_CHANGED - abortTileLoads'); }
                            try { map.preloadAllMapImages(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_GRAYSCALE_CHANGED - preloadImages'); }
                            try { map.loadInitialImage(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:TILESET_GRAYSCALE_CHANGED - loadInitialImage'); }
                            // Rendering owned by RenderController; do not mark dirty/render here.
                        }
                    }
                },
                {
                    event: window.EventTypes.DISPLAY_SETTINGS_CHANGED,
                    handler: (data) => {
                        // Display settings have changed — update persistence/UI as needed.
                        // Rendering decisions are owned by RenderController; do not markDirty/render here.
                            if (map && data && typeof data.persist === 'boolean') {
                            try {
                                const _stor = getStorage();
                                if (_stor && typeof _stor.saveSetting === 'function') _stor.saveSetting(MP4Config.STORAGE_KEYS.DISPLAY_SETTINGS, data);
                                else if (_stor && typeof _stor.set === 'function') _stor.set(MP4Config.STORAGE_KEYS.DISPLAY_SETTINGS, data);
                            } catch (e) { try { moduleErrorHandler && moduleErrorHandler.logError && moduleErrorHandler.logError(e, 'EventBus:DISPLAY_SETTINGS_CHANGED.saveSetting'); } catch (logErr) { try { moduleErrorHandler && moduleErrorHandler.logWarning(logErr, 'EventBus:DISPLAY_SETTINGS_CHANGED.saveSetting.logFallback', { message: 'DISPLAY_SETTINGS_CHANGED save failed' }); } catch (ignore) {} } }
                        }
                    }
                },
                {
                    event: window.EventTypes.HEATMAP_VISIBILITY_CHANGED,
                    handler: (data) => {
                        // Heatmap visibility changed via dedicated HeatmapDisplayState
                        // Update UI button state and persist visibility. Rendering handled by RenderController.
                        try {
                            const btn = document.getElementById('gridHeatmapBtn');
                            if (btn && map && map.heatmapDisplayState) {
                                const isVisible = map.heatmapDisplayState.isVisible();
                                btn.classList.toggle('active', isVisible);
                                btn.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
                            }
                        } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'EventBus:HEATMAP_VISIBILITY_CHANGED.updateButton', { message: 'HEATMAP_VISIBILITY_CHANGED: Failed to update button state' }); }

                        if (map && map.heatmapDisplayState) {
                            try {
                                const _stor = getStorage();
                                if (_stor) map.heatmapDisplayState.saveToStorage(_stor);
                            } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'EventBus:HEATMAP_VISIBILITY_CHANGED.saveStorage', { message: 'HEATMAP_VISIBILITY_CHANGED: Failed to save storage' }); }
                        }
                    }
                },
                {
                    event: window.EventTypes.MAP_ZOOM_IN_REQUESTED,
                    handler: (data) => {
                        if (map && typeof map.zoomIn === 'function') {
                            map.zoomIn();
                        }
                    }
                },
                {
                    event: window.EventTypes.MAP_ZOOM_OUT_REQUESTED,
                    handler: (data) => {
                        if (map && typeof map.zoomOut === 'function') {
                            map.zoomOut();
                        }
                    }
                },
                {
                    event: window.EventTypes.MAP_VIEW_RESET_REQUESTED,
                    handler: (data) => {
                        if (map && typeof map.resetView === 'function') {
                            map.resetView();
                        }
                    }
                },
                {
                    event: window.EventTypes.EDIT_MODE_CHANGED,
                    handler: (data) => {
                        const h = moduleErrorHandler;
                        // EDIT_MODE_CHANGED handler entry (diagnostics removed)

                        // LAYER AUTO-ENABLE: When entering edit mode, automatically show the respective layer
                        // This ensures users can see what they're editing
                        if (data && data.enabled && map && map.layerState) {
                            try {
                                if (data.mode === 'markers' && !map.layerState.isLayerVisible('customMarkers')) {
                                    map.layerState.setLayerVisible('customMarkers', true);
                                }
                                else if (data.mode === 'route' && !map.layerState.isLayerVisible('route')) {
                                    map.layerState.setLayerVisible('route', true);
                                }
                            } catch (e) {
                                h.logError(e, 'map.EDIT_MODE_CHANGED.autoEnableLayer');
                            }
                        }
                        
                        // When entering any edit mode, deselect any selected marker to prevent confusion
                        if (data && data.enabled && map && map.selectionState) {
                            if (map.selectionState.selectedMarker) {
                                // Use SelectionState's clearSelectedMarker method for proper decoupling
                                map.selectionState.clearSelectedMarker();
                                // Also hide tooltip since SelectionState.clearSelectedMarker doesn't emit TOOLTIP_HIDE_REQUESTED
                                if (typeof map.hideTooltip === 'function') {
                                    map.hideTooltip();
                                }
                            }
                        }

                        // Edit mode changes require updating the overlay UI and then rendering
                        updateEditOverlay();
                        try {
                            if (this.eventBus && window.EventTypes && window.EventTypes.RENDER_REQUESTED) {
                                try { this.eventBus.emit(window.EventTypes.RENDER_REQUESTED, {}); } catch (e) { moduleErrorHandler.logError(e, 'EDIT_MODE_CHANGED.emit RENDER_REQUESTED'); }
                            } else if (map && typeof map.render === 'function') {
                                map.render();
                            }
                        } catch (e) { moduleErrorHandler.logError(e, 'EDIT_MODE_CHANGED.renderFallback'); }
                    }
                },
                {
                    event: window.EventTypes.TOOLTIP_HIDE_REQUESTED,
                    handler: (data) => {
                        if (map && typeof map.hideTooltip === 'function') {
                            map.hideTooltip();
                        }
                    }
                },
                {
                    event: window.EventTypes.TOOLTIP_SHOW_REQUESTED,
                    handler: (data) => {
                        if (map && typeof map.showTooltip === 'function' && data && data.marker && typeof data.x === 'number' && typeof data.y === 'number') {
                            map.showTooltip(data.marker, data.x, data.y, data.layerKey);
                        }
                    }
                },
                {
                    event: window.EventTypes.EDIT_MODE_ENTER_REQUESTED,
                    handler: (data) => {
                        if (map && typeof map._enterEditMode === 'function' && data && data.mode) {
                            map._enterEditMode(data.mode, data.scale || 2.0);
                        }
                    }
                },
                {
                    event: window.EventTypes.EDIT_MODE_EXIT_REQUESTED,
                    handler: (data) => {
                        if (map && typeof map._exitEditMode === 'function' && data && data.mode) {
                            map._exitEditMode(data.mode);
                        }
                    }
                },
                {
                    event: window.EventTypes.SELECTION_CHANGED,
                    handler: (data) => {
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
                    }
                },
                {
                    event: window.EventTypes.MAP_VIEW_CHANGED,
                    handler: (data) => {
                        // MAP_VIEW_CHANGED event comes FROM mapState, so don't call setPan/setZoom again
                        // (that would create an infinite loop). Just handle derived effects and rendering.
                        if (data && map && map.mapState) {
                            // Always update resolution when MAP_VIEW_CHANGED is received (mapState already updated)
                            // Defer updateResolution off the input stack to prevent heavy bitmap decode
                            // from blocking rAF during zoom transitions (especially 4K -> 8K)
                            if (typeof data.zoom === 'number') {
                                try { map.imageState && map.imageState.updateResolution && map.imageState.updateResolution(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:MAP_VIEW_CHANGED - imageState.updateResolution'); }
                                try { map.updateResolution && map.updateResolution(); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:MAP_VIEW_CHANGED - updateResolution'); }
                            }
                            // Trigger render intent for view changes (map.mapState already has the new panX, panY, zoom)
                            // InteractiveMap handles state-side effects and then emits a render intent
                            if (this.eventBus && window.EventTypes && window.EventTypes.RENDER_REQUESTED) {
                                try { this.eventBus.emit(window.EventTypes.RENDER_REQUESTED, {}); } catch (e) { moduleErrorHandler.logError(e, 'EventBus:MAP_VIEW_CHANGED - emit RENDER_REQUESTED'); }
                            } else if (map && typeof map.render === 'function') {
                                // Fallback: call direct render if no event bus is available
                                map.render();
                            }
                        }
                    }
                },
                {
                    event: window.EventTypes.ROUTE_UPDATED,
                    handler: (data) => {
                        // RouteManager is the canonical source of truth for route data.
                        if (map && map.routeManager) {
                            try {
                                if (data && Array.isArray(data.route)) {
                                    try { map.routeManager.setRoute(data.route, data.lengthNormalized || 0, data.sources || []); } catch (e) { try { moduleErrorHandler && moduleErrorHandler.logError && moduleErrorHandler.logError(e, 'EventBus:ROUTE_UPDATED.setRoute'); } catch (logErr) { try { moduleErrorHandler && moduleErrorHandler.logWarning(logErr, 'EventBus:ROUTE_UPDATED.setRoute.logFallback', { message: 'ROUTE_UPDATED.setRoute failed' }); } catch (ignore) {} } }
                                }
                            } catch (e) { try { moduleErrorHandler && moduleErrorHandler.logError && moduleErrorHandler.logError(e, 'EventBus:ROUTE_UPDATED.handler'); } catch (logErr) { try { moduleErrorHandler && moduleErrorHandler.logWarning(logErr, 'EventBus:ROUTE_UPDATED.handler.logFallback', { message: 'ROUTE_UPDATED handler failed' }); } catch (ignore) {} } }

                            if (data && typeof data.looping === 'boolean') {
                                try { map.routeManager.setRouteLooping(data.looping); } catch (e) { try { moduleErrorHandler && moduleErrorHandler.logError && moduleErrorHandler.logError(e, 'EventBus:ROUTE_UPDATED.setRouteLooping'); } catch (logErr) { try { moduleErrorHandler && moduleErrorHandler.logWarning(logErr, 'EventBus:ROUTE_UPDATED.setRouteLooping.logFallback', { message: 'ROUTE_UPDATED.setRouteLooping failed' }); } catch (ignore) {} } }
                            }

                            // Update layer counts; rendering handled by RenderController
                            if (map && typeof map.updateLayerCounts === 'function') {
                                map.updateLayerCounts();
                            }
                        }
                    }
                },
                {
                    event: window.EventTypes.ROUTE_CLEARED,
                    handler: (data) => {
                        // Update layer counts to show route length as 0
                        if (map && typeof map.updateLayerCounts === 'function') {
                            map.updateLayerCounts();
                        }
                        // Rendering handled by RenderController
                    }
                },
                {
                    event: window.EventTypes.MARKER_ADDED,
                    handler: (data) => {
                        // Sync LAYERS.customMarkers.markers from authoritative MarkerManager source
                        if (map && map.markerManager && LAYERS.customMarkers) {
                            LAYERS.customMarkers.markers = map.markerManager.getAllMarkers();
                        }
                        // Update display counts (UI update, not rendering)
                        if (map && typeof map.updateLayerCounts === 'function') {
                            map.updateLayerCounts();
                        }
                        // Rendering handled by RenderController; do not mark dirty here.
                    }
                },
                {
                    event: window.EventTypes.MARKER_REMOVED,
                    handler: (data) => {
                        // Sync LAYERS.customMarkers.markers from authoritative MarkerManager source
                        if (map && map.markerManager && LAYERS.customMarkers) {
                            LAYERS.customMarkers.markers = map.markerManager.getAllMarkers();
                        }
                        // Clear selection if markers were removed from the selected layer
                        if (data && data.layerKey === 'cm' && map && map.selectionState && map.selectedMarkerLayer === 'customMarkers') {
                            if (data.uid && map.selectedMarker && map.selectedMarker.uid === data.uid) {
                                map.selectionState.clearSelectedMarker();
                            } else if (data.all) {
                                map.selectionState.clearSelectedMarker();
                            }
                        }
                        // Update display counts (UI update, not rendering)
                        if (map && typeof map.updateLayerCounts === 'function') {
                            map.updateLayerCounts();
                        }
                        // Rendering handled by RenderController; do not mark dirty here.
                        // For bulk clears, keep the explicit full-render request for UX feedback
                        if (data && data.all && eventBus && typeof eventBus.emit === 'function') {
                            eventBus.emit(window.EventTypes.RENDER_REQUESTED);
                        }
                    }
                },
                {
                    event: window.EventTypes.MARKER_EDITED,
                    handler: (data) => {
                        // Sync LAYERS.customMarkers.markers from authoritative MarkerManager source
                        if (map && map.markerManager && LAYERS.customMarkers) {
                            LAYERS.customMarkers.markers = map.markerManager.getAllMarkers();
                        }
                        // Update display counts (UI update, not rendering)
                        if (map && typeof map.updateLayerCounts === 'function') {
                            map.updateLayerCounts();
                        }
                        // Rendering handled by RenderController; do not mark dirty here.
                    }
                },
                {
                    event: window.EventTypes.MARKER_POSITION_UPDATE_REQUESTED,
                    handler: (data) => {
                        // Handle marker position update during drag operations
                        if (data && data.markerUid && typeof data.newX === 'number' && typeof data.newY === 'number') {
                            if (map && map.markerManager) {
                                // Update marker position through MarkerManager (handles storage and notifications)
                                const success = map.markerManager.updateMarkerPosition(data.markerUid, data.newX, data.newY);

                                if (success && LAYERS.customMarkers) {
                                    // Sync with LAYERS for rendering
                                    const allMarkers = map.markerManager.getAllMarkers();
                                    LAYERS.customMarkers.markers = allMarkers;
                                    // Rendering handled by RenderController; do not mark dirty here.
                                }
                            }
                        }
                    }
                },
                {
                    event: window.EventTypes.EDIT_OVERLAY_UPDATE_REQUESTED,
                    handler: (data) => {
                        updateEditOverlay();
                    }
                },
                {
                    event: window.EventTypes.LAYER_VISIBILITY_SAVE_REQUESTED,
                    handler: (data) => {
                        if (data && data.layerVisibility) {
                            saveLayerVisibilityToStorage(data.layerVisibility);
                        }
                    }
                },
                {
                    event: window.EventTypes.HIGHLIGHT_MULTIPLIER_SAVE_REQUESTED,
                    handler: (data) => {
                        if (data && typeof data.multiplier === 'number') {
                            saveHighlightMultiplierToStorage(data.multiplier);
                        }
                    }
                },
                {
                    event: window.EventTypes.MARKER_SCALING_SAVE_REQUESTED,
                    handler: (data) => {
                        try {
                            if (!data) return;
                            // Update in-memory config if provided
                            if (typeof data.userScaleMultiplier === 'number') {
                                MP4Config.MARKER_SCALING.userScaleMultiplier = Math.max(0.5, Math.min(1.5, data.userScaleMultiplier));
                            }
                            if (typeof data.highlightMultiplier === 'number') {
                                MP4Config.MARKER_SCALING.highlightMultiplier = Math.max(1.5, Math.min(2.5, data.highlightMultiplier));
                            }

                            // Persist using available storage APIs
                            try {
                                const _stor = getStorage();
                                if (_stor && typeof _stor.hasConsent === 'function' && _stor.hasConsent()) {
                                    if (typeof _stor.set === 'function') {
                                        _stor.set(MP4Config.STORAGE_KEYS.MARKER_SCALING, {
                                            userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                                            highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                                        });
                                    } else if (typeof _stor.saveSetting === 'function') {
                                        _stor.saveSetting(MP4Config.STORAGE_KEYS.MARKER_SCALING, {
                                            userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                                            highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                                        });
                                    }
                                } else if (_stor && typeof _stor.saveMarkerScaling === 'function') {
                                    _stor.saveMarkerScaling({
                                        userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                                        highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                                    });
                                }
                            } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'MARKER_SCALING_SAVE_REQUESTED.persist'); }

                            // Request a render so renderers pick up new settings (delegated to RenderController)
                            try {
                                if (this.eventBus && window.EventTypes && window.EventTypes.RENDER_REQUESTED) {
                                    this.eventBus.emit(window.EventTypes.RENDER_REQUESTED, {});
                                } else if (map && typeof map.render === 'function') {
                                    map.render();
                                }
                            } catch (e) { moduleErrorHandler.logError(e, 'MARKER_SCALING_SAVE_REQUESTED.emitRender'); }
                        } catch (e) { moduleErrorHandler.logError(e, 'MARKER_SCALING_SAVE_REQUESTED'); }
                    }
                },
                {
                    event: window.EventTypes.HIGHLIGHTED_LAYERS_SAVE_REQUESTED,
                    handler: (data) => {
                        if (data && data.highlightConfig) {
                            saveHighlightedLayersToStorage(data.highlightConfig);
                        }
                    }
                },
                {
                    event: window.EventTypes.ROUTE_COMPUTATION_REQUESTED,
                    handler: (data) => {
                        beginRouteCompute();
                    }
                },
                {
                    event: window.EventTypes.SIDEBAR_VISIBILITY_TOGGLE_REQUESTED,
                    handler: (data) => {
                        const app = document.querySelector('.app-container');
                        const collapsed = app.classList.contains('sidebar-collapsed');
                        setSidebarCollapsed(!collapsed);
                    }
                }
            ], null, moduleErrorHandler);
        }
    } catch (e) {
        moduleErrorHandler.logWarn('Failed to initialize EventBus', 'InteractiveMap.init.EventBus', { error: e });
    }

    // Create map
    map = new InteractiveMap('mapCanvas');

    // Expose map globally for renderers and other modules to access
    window.interactiveMap = map;
    // Flush any event unsubscriber functions that were queued before `map` existed
    try { flushPendingUnsubscribers(); } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'init.flushPendingUnsubscribers', { message: 'Failed to flush pending unsubscribers' }); }

    // Initialize controllers asynchronously
    await map.init();
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
            // These are now called by event handlers for EDIT_MODE_ENTER_REQUESTED/EDIT_MODE_EXIT_REQUESTED
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
                        } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap._enterEditMode.setOutlineColor'); }
                    }
                } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap._enterEditMode'); }
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
                    } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap._exitEditMode.removeOutline'); }
                    // Reset cursor when exiting route edit mode
                    if (layerKey === 'route') {
                        try { if (map.canvas) map.canvas.style.cursor = 'grab'; } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap._exitEditMode.resetCursor'); }
                    }
                } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap._exitEditMode'); }
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

    // Inject appErrorHandler into utility modules
    initializeErrorHandlerInjection();

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
        moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.initUIControllers.layerListController', { message: 'Failed to initialize LayerListController' });
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
        // Initialize Phase 5 REQUIRED managers for GDPR compliance
        let consentManager = null;
        let dataExportController = null;
        
        // Retrieve StorageService from injected provider only
        let storageService = null;
        try {
            storageService = map && typeof map._getStorageInstance === 'function' ? map._getStorageInstance() : null;
        } catch (e) {
            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.initUIControllers.getStorage', { message: 'Failed to get StorageService' });
        }
        
                // Phase 5 initialization diagnostics removed
        
        try {
          if (typeof ConsentManager !== 'undefined' && storageService) {
            consentManager = new ConsentManager({
              storage: storageService,
              eventBus: eventBus,
              config: MP4Config,
              errorHandler: moduleErrorHandler
            });
            // ConsentManager initialized
          } else {
            moduleErrorHandler && moduleErrorHandler.logDebug('ConsentManager not initialized - missing dependencies', 'InteractiveMap.initUIControllers', {
              consentManagerDefined: typeof ConsentManager !== 'undefined',
              storageServiceAvailable: !!storageService
            });
          }
        } catch (e) {
          moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.initUIControllers.ConsentManager', { message: 'Failed to initialize ConsentManager' });
        }
        
        try {
          if (typeof DataExportController !== 'undefined' && map.markerManager && map.routeManager && storageService) {
            dataExportController = new DataExportController({
              markerManager: map.markerManager,
              routeManager: map.routeManager,
              storage: storageService,
              mapState: map.mapState,
              layerState: map.layerState,
              eventBus: eventBus,
              config: MP4Config,
              errorHandler: moduleErrorHandler
            });
            // DataExportController initialized
          } else {
            moduleErrorHandler && moduleErrorHandler.logDebug('DataExportController not initialized - missing dependencies', 'InteractiveMap.initUIControllers', {
              dataExportControllerDefined: typeof DataExportController !== 'undefined',
              markerManagerAvailable: !!map.markerManager,
              routeManagerAvailable: !!map.routeManager,
              storageServiceAvailable: !!storageService
            });
          }
        } catch (e) {
          moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.initUIControllers.DataExportController', { message: 'Failed to initialize DataExportController' });
        }

        if (typeof SettingsController !== 'undefined') {
            settingsController = new SettingsController({
                layerState: map.layerState,
                heatmapDisplayState: map.heatmapDisplayState,
                highlightState: map.highlightState,
                tilesetState: map.tilesetState,
                markerManager: map.markerManager,
                mapState: map.mapState,
                map: map,
                // Inject small helpers to avoid SettingsController reading from global map
                checkMarkerHover: map.checkMarkerHover ? map.checkMarkerHover.bind(map) : null,
                canvas: map.canvas,
                lastMouseX: map.lastMouseX,
                lastMouseY: map.lastMouseY,
                eventBus: eventBus,
                config: MP4Config,
                errorHandler: moduleErrorHandler,
                consentManager: consentManager,
                dataExportController: dataExportController,
                storageProvider: map.storageProvider
            });
            settingsController.init();
            // Load saved settings after controller is initialized
            settingsController.loadSavedSettings();
        }
    } catch (e) {
        moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.initUIControllers', { message: 'Failed to initialize UI controllers' });
    }

    // Load custom markers from storage if consent is given
    try {
        let markers = null;
        try {
            const _stor = getStorage();
            if (_stor && typeof _stor.loadSetting === 'function') {
                markers = _stor.loadSetting(MP4Config.STORAGE_KEYS.CUSTOM_MARKERS);
            } else if (_stor && typeof _stor.get === 'function') {
                markers = _stor.get(MP4Config.STORAGE_KEYS.CUSTOM_MARKERS);
            }
        } catch (inner) {
            // swallow - no legacy fallback
        }

        if (markers && Array.isArray(markers)) {
            if (map.markerManager) {
                map.markerManager.setMarkers(markers);
            } else {
                moduleErrorHandler.logWarning('markerManager not available during init, markers not loaded', 'InteractiveMap.loadMarkersFromStorage');
            }
        }
    } catch (e) {
        moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.loadMarkersFromStorage', { message: 'Failed to load markers on page load' });
    }

    // Wire Show All / Hide All layer buttons — batch updates to avoid N renders/storage writes
    // NOTE: Layer visibility controls are now handled by SidebarController
    // Load markers from storage (consent-gated)
    try {
        try {
            const _stor = getStorage();
            if (_stor && typeof _stor.hasStorageConsent === 'function' && _stor.hasStorageConsent()) {
                if (map.markerManager && typeof map.markerManager.loadMarkers === 'function') {
                    map.markerManager.loadMarkers();
                }
            }
        } catch (inner) {
            // no legacy fallback
        }
    } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.loadMarkersFromStorage'); }
    // Attempt to restore a previously saved route (if any) - consent-gated
    try {
        try {
            const _stor = getStorage();
            if (_stor && typeof _stor.hasStorageConsent === 'function' && _stor.hasStorageConsent()) {
                map.loadRouteFromStorage();
            }
        } catch (inner) {
            // no legacy fallback
        }
    } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.loadRouteFromStorage'); }
    // Load route looping preference independently (persisted separately from route data)
    // Note: routeManager.loadFromStorage() already loads the looping flag, so this is redundant
    try {
        try {
            const _stor = getStorage();
            if (_stor && typeof _stor.hasStorageConsent === 'function' && _stor.hasStorageConsent()) {
                try { map.updateLoopUI(); } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.updateLoopUI'); }
            }
        } catch (inner) {
            // no legacy fallback
        }
    } catch (e) { /* default to false */ }
    // Attempt to restore saved map view (pan/zoom) when consent is present
    try {
        try {
            const _stor = getStorage();
            const consent = (_stor && typeof _stor.hasStorageConsent === 'function') ? _stor.hasStorageConsent() : (localStorage.getItem('mp4_storage_consent') === '1');
            if (consent && map && typeof map.loadViewFromStorage === 'function') {
                try { map.loadViewFromStorage(); } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.loadViewFromStorage'); }
            }
        } catch (inner) {
            // Fallback: check if storage service has consent
            const svc = map && typeof map._getStorageInstance === 'function' ? map._getStorageInstance() : null;
            const consent = svc && typeof svc.hasConsent === 'function' ? svc.hasConsent() : false;
            if (consent && map && typeof map.loadViewFromStorage === 'function') {
                try { map.loadViewFromStorage(); } catch (e) { moduleErrorHandler.logError(e, 'InteractiveMap.init.loadViewFromStorage'); }
            }
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
            // Position overlay to match the map's rendered tile area (MP4Config.MAP_SIZE * zoom)
            if (map && (map.editMarkersMode || map.editRouteMode)) {
                const size = (MP4Config.MAP_SIZE * (map.zoom || 1));
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
    // NOTE: Custom marker export is now handled by ToolbarController
    // NOTE: Custom marker import/clear are handled here due to complex file operations

    // Edit markers toggle - enables placing, dragging and deleting custom markers
    // NOTE: Edit mode toggles are now handled by ToolbarController

    // Edit route toggle - enables route editing interactions
    // NOTE: Edit mode toggles are now handled by ToolbarController

    // Tileset controls (Satellite / Holographic)
    // NOTE: Tileset and display controls are now handled by SettingsController

    // Settings sliders (marker/highlight) are handled by `SettingsController`.
    
    document.getElementById('importCustom').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    
    document.getElementById('importFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            if (map.markerManager) {
                await map.markerManager.importMarkers(file);
            } else {
                // Fallback if markerManager not available — log instead of notifying user
                moduleErrorHandler.logWarning('markerManager not available during marker import', 'InteractiveMap.importMarkers');
                moduleErrorHandler.logError('Marker manager not available', 'InteractiveMap.importMarkers');
            }
        } catch (error) {
            NotificationUtils.showMarkerError('Failed to import markers: ' + (error.message || String(error)));
        } finally {
            // Clear the file input
            e.target.value = '';
        }
    });
    
    document.getElementById('clearCustom').addEventListener('click', async () => {
        const markerCount = map.markerManager ? map.markerManager.getAllMarkers().length : 0;
        if (markerCount === 0) {
            NotificationUtils.showInfo('No custom markers to clear.');
            return;
        }
        const confirmed = await NotificationUtils.confirmDestructiveActionAsync('Clear all custom markers? This cannot be undone.');
        if (confirmed) {
            // Heavy work runs in separate macrotask due to async confirmation
                try {
                    if (this.eventBus && window.EventTypes && window.EventTypes.MARKER_CLEAR_REQUESTED) {
                        try {
                            this.eventBus.emit(window.EventTypes.MARKER_CLEAR_REQUESTED);
                        } catch (e) {
                            moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.clearMarkers', { message: 'Failed to emit MARKER_CLEAR_REQUESTED' });
                            // Fallback to direct call when emit fails
                            if (map.markerManager && typeof map.markerManager.clearMarkers === 'function') map.markerManager.clearMarkers();
                            else { moduleErrorHandler.logWarning('markerManager not available during clear markers', 'InteractiveMap.clearMarkers'); map.customMarkers = []; }
                    }
                    } else if (map.markerManager && typeof map.markerManager.clearMarkers === 'function') {
                        map.markerManager.clearMarkers();
                        // The clearMarkers method handles updating LAYERS and triggering callbacks
                    } else {
                        // Fallback (should not happen in decoupled code)
                        moduleErrorHandler.logWarning('markerManager not available during clear markers', 'InteractiveMap.clearMarkers');
                        map.customMarkers = [];
                    }
                    // Layer counts will be updated via MARKER_REMOVED event
                    // Exit marker edit mode via canonical helper so visuals/overlay are cleaned up
                    if (this.eventBus) this.eventBus.emit(window.EventTypes.EDIT_MODE_EXIT_REQUESTED, { mode: 'customMarkers' });
                    map._draggingCandidate = null;
                    map._draggingMarker = null;
                    map.canvas.style.cursor = 'grab';
                    // Rendering handled by MARKER_REMOVED event system
                } catch (e) {
                    moduleErrorHandler.logError(e, 'InteractiveMap.clearMarkers');
                }
        }
    });

    // Initialize route computation controller
    try {
        if (typeof RouteComputeController !== 'undefined') {
            const routeComputeController = new RouteComputeController({
                routeManager: map.routeManager,
                routeAnimationState: map.routeAnimationState,
                layerState: map.layerState,
                selectionState: map.selectionState,
                editModeState: map.editModeState,
                routeEditState: map.routeEditState,
                pointerHandler: map.pointerHandler,
                eventBus: eventBus,
                config: MP4Config,
                routeManager: map.routeManager,
                errorHandler: moduleErrorHandler,
                storageProvider: this.storageProvider
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
        // Sidebar handle missing — internal condition, log to ErrorHandler instead of notifying user
        moduleErrorHandler.logError('Sidebar handle element not found; collapsing unavailable', 'InteractiveMap.init.sidebarHandle');
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
                if (this.eventBus && window.EventTypes && window.EventTypes.RENDER_REQUESTED) {
                    try { this.eventBus.emit(window.EventTypes.RENDER_REQUESTED, {}); } catch (e) { moduleErrorHandler.logError(e, 'init.emit RENDER_REQUESTED'); }
                } else if (map && typeof map.render === 'function') {
                    map.render();
                }
            } catch (e) { moduleErrorHandler.logError(e, 'init: Failed to render initial overlay'); }
        } catch (e) { moduleErrorHandler.logError(e, 'init: Failed to wait for initial image'); }
        try { window._mp4Ready = true; } catch (e) { moduleErrorHandler.logError(e, 'init: Failed to set _mp4Ready flag'); }
        document.dispatchEvent(new Event('mp4-ready'));
    } catch (e) { moduleErrorHandler.logError(e, 'init: Unexpected error during initialization'); }
}

document.addEventListener('DOMContentLoaded', init);

