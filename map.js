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
        this._showGridHeatmap = false; // runtime state (persisted via storage)

        // Layer visibility state (runtime UI state, separate from data)
        this.layerVisibility = {};
        try {
            const keys = Object.keys(LAYERS || {});
            for (let k = 0; k < keys.length; k++) this.layerVisibility[keys[k]] = true;
        } catch (e) {
            console.debug('Failed to initialize layer visibility from LAYERS:', e);
        }
        // Ensure the virtual 'route' layer is present and visible by default
        this.layerVisibility.route = true;

        // Initialize state managers
        this.mapState = new MapState(MP4Config);
        this.selectionState = new SelectionState(MP4Config);
        this.routeState = new RouteState(MP4Config);
        this.layerState = new LayerState(Object.keys(LAYERS || {}), MP4Config);

        // Initialize error handler
        this.errorHandler = typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler();

        // Initialize layerState with current visibility
        if (this.layerState) {
            Object.keys(this.layerVisibility).forEach(key => {
                this.layerState.setLayerVisible(key, this.layerVisibility[key]);
            });
        }

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
                    NotificationInterface
                );
            }
        } catch (e) {
                console.error('RouteManager creation failed:', e);
                // Continue without route manager - markers still work
            }

        // Initialize routeState with current route looping (after routeManager is created)
        if (this.routeState) {
            this.routeState.setRouteLooping(this.routeLooping || false);
        }

        try {
            if (typeof TileRenderer !== 'undefined') {
                this.tileRenderer = new TileRenderer(this.mapState, MP4Config);
                this.tileRenderer.map = this; // Keep map reference for canvas access
                this.tileRenderer.canvas = this.canvasTiles || null;
                this.tileRenderer.ctx = this.tileRenderer.canvas ? this.tileRenderer.canvas.getContext('2d') : null;
                try { this.tileRenderer.init(); } catch (e) { console.debug('TileRenderer.init failed', e); }
            }
            if (typeof HeatmapRenderer !== 'undefined') {
                // Create layer config for heatmap rendering
                const layerConfig = {};
                if (typeof LAYERS !== 'undefined') {
                    Object.keys(LAYERS).forEach(key => {
                        layerConfig[key] = { ...LAYERS[key] };
                    });
                }
                this.heatmapRenderer = new HeatmapRenderer(this.mapState, MP4Config, layerConfig, GREEN_CRYSTAL_LAYERS);
                this.heatmapRenderer.map = this; // Keep map reference for canvas access
                this.heatmapRenderer.canvas = this.canvasHeatmap || null;
                this.heatmapRenderer.ctx = this.heatmapRenderer.canvas ? this.heatmapRenderer.canvas.getContext('2d') : null;
                try { this.heatmapRenderer.init(); } catch (e) { console.debug('HeatmapRenderer.init failed', e); }
            }
            if (typeof GridRenderer !== 'undefined') {
                // Create layer config for grid rendering
                const layerConfig = {};
                if (typeof LAYERS !== 'undefined') {
                    Object.keys(LAYERS).forEach(key => {
                        layerConfig[key] = { ...LAYERS[key] };
                    });
                }
                this.gridRenderer = new GridRenderer(this.mapState, this.layerState, MP4Config, layerConfig, GREEN_CRYSTAL_LAYERS);
                this.gridRenderer.map = this; // Keep map reference for canvas access
                try { this.gridRenderer.init(); } catch (e) { console.debug('GridRenderer.init failed', e); }
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
                this.markerRenderer = new MarkerRenderer(this.mapState, this.layerState, this.selectionState, this.markerManager, MP4Config, layerConfig);
                this.markerRenderer.map = this; // Keep map reference for canvas access
                this.markerRenderer.canvas = this.canvas || null;
                this.markerRenderer.ctx = this.markerRenderer.canvas ? this.markerRenderer.canvas.getContext('2d') : null;
                try { this.markerRenderer.init(); } catch (e) { console.debug('MarkerRenderer.init failed', e); }
            }
            if (typeof RouteRenderer !== 'undefined') {
                const routeColor = (typeof LAYERS !== 'undefined' && LAYERS.route) ? LAYERS.route.color : '#00ffb7ff';
                this.routeRenderer = new RouteRenderer(this.mapState, this.layerState, this.routeState, MP4Config, routeColor);
                this.routeRenderer.map = this; // Keep map reference for canvas access
                try { this.routeRenderer.init(); } catch (e) { console.debug('RouteRenderer.init failed', e); }
            }
            if (typeof OverlayRenderer !== 'undefined') {
                const routeColor = (typeof LAYERS !== 'undefined' && LAYERS.route) ? LAYERS.route.color : '#00ffb7ff';
                this.overlayRenderer = new OverlayRenderer(this.mapState, this.selectionState, this.routeState, MP4Config, routeColor);
                this.overlayRenderer.map = this; // Keep map reference for canvas access
                try { this.overlayRenderer.init(); } catch (e) { console.debug('OverlayRenderer.init failed', e); }
            }
            if (typeof RenderPipeline !== 'undefined') {
                // Insert an overlay-clear stage so overlay canvas is cleared
                // exactly once before overlay-rendering stages (grid, markers, route)
                const overlayClearStage = {
                    render: () => {
                        try {
                            if (!this.ctx || !this.canvas) return;
                            const cssWidth = this.canvas.clientWidth;
                            const cssHeight = this.canvas.clientHeight;
                            this.ctx.clearRect(0, 0, cssWidth, cssHeight);
                        } catch (e) { console.debug('overlayClearStage failed', e); }
                    }
                };
                    // Use the concrete `OverlayRenderer` instance in the pipeline
                    // (must be constructed above if the module is available).
                    this.renderPipeline = new RenderPipeline([
                        this.tileRenderer,
                        this.heatmapRenderer,
                        overlayClearStage,
                        this.gridRenderer,
                        this.markerRenderer,
                        this.routeRenderer,
                        this.overlayRenderer
                    ].filter(Boolean));
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
                        this.updateLayerCounts();
                        this.render();
                    } catch (e) {
                        console.debug('MarkerManager callback failed:', e);
                    }
                });
                this.markerManager.setOnCleanupRouteReferences((deletedMarkerUid) => {
                    try {
                        if (this.routeManager) {
                            this.routeManager.cleanupRouteReferences(deletedMarkerUid);
                        }
                    } catch (e) {
                        console.debug('Route cleanup failed:', e);
                    }
                });
            }
            // Set up route callbacks AFTER routeManager is created
            if (this.routeManager) {
                this.routeManager.setOnRouteChanged(() => {
                    try {
                        this.render();
                    } catch (e) {
                        console.debug('Route callback failed:', e);
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
                    } catch (e) { console.debug('updateLoopUI: failed to update button state', e); }
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
                            console.debug('Failed to invalidate route renderer cache on loop toggle', e);
                        }

                        try {
                            if (this.routeManager) this.routeManager.saveRouteLoopingFlag(this.routeLooping);
                        } catch (e) { console.debug('loopRoute: failed to persist loop flag', e); }
                        try { this.render(); } catch (e) { console.debug('loopRoute: failed to request render', e); }
                        updateLoopUI();
                    });
                }
                updateLoopUI();
            } catch (e) { console.debug('InteractiveMap: loop controls initialization failed', e); }

            // Phase 2: input and state scaffolds
            try {
                // State managers are already initialized above

                if (typeof GestureHandler !== 'undefined') {
                    this.gestureHandler = new GestureHandler(this, MP4Config);
                    try { this.gestureHandler.init(); } catch (e) { console.debug('GestureHandler.init failed', e); }
                }
                if (typeof PointerHandler !== 'undefined') {
                    this.pointerHandler = new PointerHandler(this, MP4Config);
                    try { this.pointerHandler.init(); } catch (e) { console.debug('PointerHandler.init failed', e); }
                }
                if (typeof KeyboardHandler !== 'undefined') {
                    this.keyboardHandler = new KeyboardHandler(this, MP4Config);
                    try { this.keyboardHandler.init(); } catch (e) { console.debug('KeyboardHandler.init failed', e); }
                }
            } catch (e) { console.debug('InteractiveMap: input/state scaffolding setup failed', e); }
        } catch (e) { console.debug('InteractiveMap: renderer and manager initialization failed', e); }
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
        
        
        // Images cache
        this.images = {};
        this.currentImage = null;
        this.currentResolution = 0;
        this.loadingResolution = null;
        // Internal trackers for robust tile loading and cancellation
        this._tilesetGeneration = 0; // increment on tileset/grayscale change
        this._imageControllers = {}; // AbortController per resolution
        this._imageElements = {}; // IMG elements in-flight per resolution
        this._imageBitmaps = {}; // ImageBitmap objects stored per resolution
        this._preloadLinks = []; // Optional <link> elements created for preload/prefetch
        // Bitmap decoding concurrency control to avoid overwhelming decoders
        this._bitmapLimit = 2;
        this._bitmapActive = 0;
        this._bitmapQueue = [];
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
        } catch (e) { console.debug('InteractiveMap: device detection failed', e); }

    // Method to update loop UI (called when route changes)
    this.updateLoopUI = () => {
        try {
            const loopBtn = document.getElementById('loopRouteBtn');
            if (!loopBtn) return;
            loopBtn.classList.toggle('active', this.routeLooping);
            loopBtn.setAttribute('aria-pressed', this.routeLooping ? 'true' : 'false');
        } catch (e) { console.debug('updateLoopUI: failed to update button state', e); }
    };
        
        // Markers
        this.markers = [];
        this.customMarkers = []; // Will be updated by markerManager callback when loaded
        // Route animation state is now managed by RouteState
        // Initialize route animation state through state manager
        if (this.routeState) {
            this.routeState.setAnimationOffset(0);
            this.routeState.setAnimationFrameId(null);
            this.routeState.setLastAnimationTime(0);
            this.routeState.setAnimationSpeed(MP4Config.ROUTE.ANIMATION_SPEED);
            this.routeState.routeLineWidth = MP4Config.ROUTE.LINE_WIDTH;
        } else {
            // Fallback for when RouteState is not available
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
                let g = null;
                if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                    g = window._mp4Storage.loadSetting('mp4_grid_visible');
                } else {
                    try { g = localStorage.getItem('mp4_grid_visible'); } catch (e) { g = null; }
                }
                if (g === null || typeof g === 'undefined') {
                    this.layerState.setGridVisible(true);
                } else {
                    this.layerState.setGridVisible(g === '1' || g === 1 || g === 'true' || g === true);
                }
            } catch (e) {
                this.layerState.setGridVisible(true);
            }
        } else {
            // Fallback for when LayerState is not available
            this.layerVisibility = {};
            try {
                const keys = Object.keys(LAYERS || {});
                for (let k = 0; k < keys.length; k++) this.layerVisibility[keys[k]] = true;
            } catch (e) {
                console.debug('Failed to initialize layer visibility from LAYERS:', e);
            }
            this.layerVisibility.route = true;
            try {
                let g = null;
                if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                    g = window._mp4Storage.loadSetting('mp4_grid_visible');
                } else {
                    try { g = localStorage.getItem('mp4_grid_visible'); } catch (e) { g = null; }
                }
                if (g === null || typeof g === 'undefined') {
                    this.layerVisibility.grid = true;
                } else {
                    this.layerVisibility.grid = (g === '1' || g === 1 || g === 'true' || g === true);
                }
            } catch (e) {
                this.layerVisibility.grid = true;
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

        // Initialize TooltipManager and attach it to the map container
        try {
            if (typeof TooltipManager !== 'undefined') {
                try { this.tooltipManager = new TooltipManager(); this.tooltipManager.init(this.canvas.parentElement); } catch (e) { console.debug('TooltipManager.init failed', e); }
            }
        } catch (e) {
            console.debug('TooltipManager initialization failed:', e);
        }
        // Move tooltip into the map container and ensure container is positioned so absolute coords align
        try {
            const parent = this.canvas && this.canvas.parentElement;
            if (this.tooltip && parent) {
                try { if (window.getComputedStyle(parent).position === 'static') parent.style.position = 'relative'; } catch (e) { console.debug('Failed to set parent position for tooltip:', e); }
                try { parent.appendChild(this.tooltip); } catch (e) { console.debug('Failed to append tooltip to parent:', e); }
                try { this.tooltip.style.position = 'absolute'; this.tooltip.style.zIndex = '999'; this.tooltip.style.pointerEvents = 'none'; } catch (e) { console.debug('Failed to style tooltip:', e); }
            }
        } catch (e) {
            console.debug('Tooltip positioning setup failed:', e);
        }
        // Tileset and heatmap settings are now managed by LayerState
        if (this.layerState) {
            // Load tileset from storage
            try {
                let t = null;
                if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                    t = window._mp4Storage.loadSetting('mp4_tileset');
                } else {
                    try { t = localStorage.getItem('mp4_tileset'); } catch (e) { t = null; }
                }
                // LayerState doesn't have tileset yet, so we'll handle this later
                this.tileset = t || 'sat';
            } catch (e) { this.tileset = 'sat'; }

            // Load tileset grayscale from storage
            try {
                let g = null;
                if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                    g = window._mp4Storage.loadSetting('mp4_tileset_grayscale');
                } else {
                    try { g = localStorage.getItem('mp4_tileset_grayscale'); } catch (e) { g = null; }
                }
                this.tilesetGrayscale = (g === '1' || g === 1 || g === true);
            } catch (e) { this.tilesetGrayscale = false; }

            // Load grid heatmap from storage
            try {
                let gh = null;
                if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                    gh = window._mp4Storage.loadSetting('mp4_grid_heatmap');
                } else {
                    try { gh = localStorage.getItem('mp4_grid_heatmap'); } catch (e) { gh = null; }
                }
                this.layerState.setHeatmapVisible(gh === '1' || gh === 1 || gh === true);
            } catch (e) {
                this.layerState.setHeatmapVisible(false);
            }
        } else {
            // Fallback for when LayerState is not available
            try {
                let t = null;
                if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                    t = window._mp4Storage.loadSetting('mp4_tileset');
                } else {
                    try { t = localStorage.getItem('mp4_tileset'); } catch (e) { t = null; }
                }
                this.tileset = t || 'sat';
            } catch (e) { this.tileset = 'sat'; }

            try {
                let g = null;
                if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                    g = window._mp4Storage.loadSetting('mp4_tileset_grayscale');
                } else {
                    try { g = localStorage.getItem('mp4_tileset_grayscale'); } catch (e) { g = null; }
                }
                this.tilesetGrayscale = (g === '1' || g === 1 || g === true);
            } catch (e) { this.tilesetGrayscale = false; }

            try {
                let gh = null;
                if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                    gh = window._mp4Storage.loadSetting('mp4_grid_heatmap');
                } else {
                    try { gh = localStorage.getItem('mp4_grid_heatmap'); } catch (e) { gh = null; }
                }
                this._showGridHeatmap = (gh === '1' || gh === 1 || gh === true);
            } catch (e) { this._showGridHeatmap = false; }
        }
        
        // Load marker scaling configuration (consent-gated)
        try {
            if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent()) {
                const savedScaling = StorageInterface.loadMarkerScaling();
                if (savedScaling) {
                    MP4Config.MARKER_SCALING.userScaleMultiplier = savedScaling.userScaleMultiplier || MP4Config.MARKER_SCALING.userScaleMultiplier;
                    MP4Config.MARKER_SCALING.highlightMultiplier = savedScaling.highlightMultiplier || MP4Config.MARKER_SCALING.highlightMultiplier;
                }
            }
        } catch (e) {
            console.debug('Failed to load marker scaling config:', e);
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
            console.debug('RouteAnimation initialization failed', e);
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
        return this.routeState ? this.routeState.getAnimationOffset() : this._fallbackRouteDashOffset;
    }

    set _routeDashOffset(value) {
        if (this.routeState) {
            this.routeState.setAnimationOffset(value);
        } else {
            this._fallbackRouteDashOffset = value;
        }
    }

    get _routeRaf() {
        return this.routeState ? this.routeState.getAnimationFrameId() : this._fallbackRouteRaf;
    }

    set _routeRaf(value) {
        if (this.routeState) {
            this.routeState.setAnimationFrameId(value);
        } else {
            this._fallbackRouteRaf = value;
        }
    }

    get _lastRouteAnimTime() {
        return this.routeState ? this.routeState.getLastAnimationTime() : this._fallbackLastRouteAnimTime;
    }

    set _lastRouteAnimTime(value) {
        if (this.routeState) {
            this.routeState.setLastAnimationTime(value);
        } else {
            this._fallbackLastRouteAnimTime = value;
        }
    }

    get _routeAnimationSpeed() {
        return this.routeState ? this.routeState.getAnimationSpeed() : this._fallbackRouteAnimationSpeed;
    }

    set _routeAnimationSpeed(value) {
        if (this.routeState) {
            this.routeState.setAnimationSpeed(value);
        } else {
            this._fallbackRouteAnimationSpeed = value;
        }
    }

    get routeLineWidth() {
        return this.routeState ? this.routeState.routeLineWidth : this._fallbackRouteLineWidth;
    }

    set routeLineWidth(value) {
        if (this.routeState) {
            this.routeState.routeLineWidth = value;
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
            console.debug('Failed to preload map images:', e);
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
                console.debug('Failed to set tile canvas transform:', e);
            }
        }
        if (this.ctxHeatmap) {
            try { this.ctxHeatmap.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {
                console.debug('Failed to set heatmap canvas transform:', e);
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

        this.updateResolution();
        // Recreate honeycomb pattern when the canvas size or DPR changes
        try { this._createHoneycombPattern && this._createHoneycombPattern(); } catch (e) {
            console.debug('Failed to recreate honeycomb pattern:', e);
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
    
    zoomIn() {
        if (this.mapState) {
            this.mapState.zoomIn();
            this.updateResolution();
            this.render();
            // Update cursor hover after programmatic zoom
            try {
                const rect = this.canvas.getBoundingClientRect();
                let localX, localY;
                if (Number.isFinite(this.lastMouseX) && Number.isFinite(this.lastMouseY)) {
                    localX = this.lastMouseX - rect.left;
                    localY = this.lastMouseY - rect.top;
                } else {
                    localX = rect.width / 2;
                    localY = rect.height / 2;
                }
                this.checkMarkerHover(localX, localY);
                try { this.saveViewToStorage(); } catch (err) {
                    console.debug('Failed to save view after zoom in:', err);
                }
            } catch (err) {
                console.debug('Failed to update cursor hover after zoom in:', err);
            }
        } else {
            // Fallback
            const centerX = this.canvas.clientWidth / 2;
            const centerY = this.canvas.clientHeight / 2;
            const worldX = (centerX - this.panX) / this.zoom;
            const worldY = (centerY - this.panY) / this.zoom;

            this.zoom = Math.min(this.mapState ? this.mapState.maxZoom : (MP4Config.ZOOM ? MP4Config.ZOOM.MAX || 4 : 4), this.zoom * 1.3);

            this.panX = centerX - worldX * this.zoom;
            this.panY = centerY - worldY * this.zoom;

            this.updateResolution();
            this.render();
            // Update cursor hover after programmatic zoom
            try {
                const rect = this.canvas.getBoundingClientRect();
                let localX, localY;
                if (Number.isFinite(this.lastMouseX) && Number.isFinite(this.lastMouseY)) {
                    localX = this.lastMouseX - rect.left;
                    localY = this.lastMouseY - rect.top;
                } else {
                    localX = rect.width / 2;
                    localY = rect.height / 2;
                }
                this.checkMarkerHover(localX, localY);
                try { this.saveViewToStorage(); } catch (err) {
                    console.debug('Failed to save view after zoom in:', err);
                }
            } catch (err) {
                console.debug('Failed to update cursor hover after zoom in:', err);
            }
        }
    }
    
    zoomOut() {
        if (this.mapState) {
            this.mapState.zoomOut();
            this.updateResolution();
            this.render();
            // Update cursor hover after programmatic zoom
            try {
                const rect = this.canvas.getBoundingClientRect();
                let localX, localY;
                if (Number.isFinite(this.lastMouseX) && Number.isFinite(this.lastMouseY)) {
                    localX = this.lastMouseX - rect.left;
                    localY = this.lastMouseY - rect.top;
                } else {
                    localX = rect.width / 2;
                    localY = rect.height / 2;
                }
                this.checkMarkerHover(localX, localY);
                try { this.saveViewToStorage(); } catch (err) {
                    console.debug('Failed to save view after zoom out:', err);
                }
            } catch (err) {
                console.debug('Failed to update cursor hover after zoom out:', err);
            }
        } else {
            // Fallback
            const centerX = this.canvas.clientWidth / 2;
            const centerY = this.canvas.clientHeight / 2;
            const worldX = (centerX - this.panX) / this.zoom;
            const worldY = (centerY - this.panY) / this.zoom;

            this.zoom = Math.max(this.mapState ? this.mapState.minZoom : (MP4Config.ZOOM ? MP4Config.ZOOM.DEFAULT_MIN || 0.05 : 0.05), this.zoom / 1.3);

            this.panX = centerX - worldX * this.zoom;
            this.panY = centerY - worldY * this.zoom;

            this.updateResolution();
            this.render();
            // Update cursor hover after programmatic zoom
            try {
                const rect = this.canvas.getBoundingClientRect();
                let localX, localY;
                if (Number.isFinite(this.lastMouseX) && Number.isFinite(this.lastMouseY)) {
                    localX = this.lastMouseX - rect.left;
                    localY = this.lastMouseY - rect.top;
                } else {
                    localX = rect.width / 2;
                    localY = rect.height / 2;
                }
                this.checkMarkerHover(localX, localY);
                try { this.saveViewToStorage(); } catch (err) {
                    console.debug('Failed to save view after zoom out:', err);
                }
            } catch (err) {
                console.debug('Failed to update cursor hover after zoom out:', err);
            }
        }
    }
    
    resetView() {
        // Reset view to the same initial fit used on page load (fit full map into container)
        const cssWidth = this.canvas.parentElement.clientWidth;
        const cssHeight = this.canvas.parentElement.clientHeight;
        // Reserve padding for axis labels (match constructor logic)
        const labelFontMax = 48;
        const labelPadding = 8;
        const halfW = labelFontMax * 0.6;
        const halfH = labelFontMax / 2;
        const availW = Math.max(32, cssWidth - 2 * (labelPadding + halfW));
        const availH = Math.max(32, cssHeight - 2 * (labelPadding + halfH));
        const fitZoom = Math.min(availW / MP4Config.MAP_SIZE, availH / MP4Config.MAP_SIZE);
        this.zoom = Math.max(this.minZoom || MP4Config.ZOOM.DEFAULT_MIN, Math.min(MP4Config.ZOOM.MAX, fitZoom));
        this.centerMap();
        this.updateResolution();
        // Ensure an appropriately-sized tile image is loaded for the reset view
        try { this.loadInitialImage(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.resetView.loadInitialImage'); }
        this.render();
        // Update cursor hover after resetting view
        try {
            const rect = this.canvas.getBoundingClientRect();
            let localX, localY;
            if (Number.isFinite(this.lastMouseX) && Number.isFinite(this.lastMouseY)) {
                localX = this.lastMouseX - rect.left;
                localY = this.lastMouseY - rect.top;
            } else {
                localX = rect.width / 2;
                localY = rect.height / 2;
            }
            this.checkMarkerHover(localX, localY);
            try { this.saveViewToStorage(); } catch (err) { this.errorHandler.logError(err, 'InteractiveMap.resetView.saveViewToStorage'); }
        } catch (err) {
            this.errorHandler.logError(err, 'InteractiveMap.resetView');
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
            console.debug('loadViewFromStorage failed:', e);
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
        try { tileset = String(tileset); } catch (e) { return; }
        if (!tileset) return;
        if (this.tileset === tileset) return;
        if (tileset !== 'sat' && tileset !== 'holo') return;
        this.tileset = tileset;
        // Increment generation and abort any in-flight tile loads from previous tileset
        try { this._tilesetGeneration = (this._tilesetGeneration || 0) + 1; } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTileset.incrementGeneration'); }
        try { this._abortAndCleanupTileLoads(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTileset.abortTileLoads'); }
                    try { if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') window._mp4Storage.saveSetting('mp4_tileset', tileset); /* do not write without consent/helper */ } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTileset.saveTilesetSetting'); }
        // Clear cached images and reload (folder may change depending on
        // whether grayscale variants are enabled)
        this.images = {};
        this.currentImage = null;
        this.currentResolution = 0;
        this.loadingResolution = null;
        try { this.preloadAllMapImages(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTileset.preloadImages'); }
        try { this.loadInitialImage(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTileset.loadInitialImage'); }
        try { this.render(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTileset.render'); }
    }

    // Return the tiles folder name depending on current tileset and whether
    // grayscale variants are enabled. Example: 'sat' or 'sat_bw'.
    getTilesetFolder() {
        try {
            const base = String(this.tileset || 'sat');
            return this.tilesetGrayscale ? `${base}_bw` : base;
        } catch (e) { return this.tilesetGrayscale ? 'sat_bw' : 'sat'; }
    }

    setTilesetGrayscale(enabled) {
        enabled = !!enabled;
        if (this.tilesetGrayscale === enabled) return;
        this.tilesetGrayscale = enabled;
        try { if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') window._mp4Storage.saveSetting('mp4_tileset_grayscale', this.tilesetGrayscale ? '1' : '0'); /* do not write without consent/helper */ } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTilesetGrayscale.saveSetting'); }
        try {
            // increment generation and abort previous loads so we don't mix tilesets
            try { this._tilesetGeneration = (this._tilesetGeneration || 0) + 1; } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTilesetGrayscale.incrementGeneration'); }
            try { this._abortAndCleanupTileLoads(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTilesetGrayscale.abortTileLoads'); }
            // Switch to grayscale tile folder and reload tiles instead of
            // applying runtime canvas filters.
            this.images = {};
            this.currentImage = null;
            this.currentResolution = 0;
            this.loadingResolution = null;
            try { this.preloadAllMapImages(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTilesetGrayscale.preloadAllMapImages'); }
            try { this.loadInitialImage(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTilesetGrayscale.loadInitialImage'); }
            try { if (this.renderPipeline && typeof this.renderPipeline.render === 'function') { this.renderPipeline.render(); } else if (this.tileRenderer && typeof this.tileRenderer.render === 'function') { try { this.tileRenderer.render(); } catch (err) { this.errorHandler.logError(err, 'InteractiveMap.setTilesetGrayscale.tileRenderer.render'); } } } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTilesetGrayscale.renderPipeline'); }
        } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setTilesetGrayscale'); }
    }

    // Toggle and persist the grid heatmap overlay
    setGridHeatmap(enabled) {
        enabled = !!enabled;
        if (this._showGridHeatmap === enabled) return;
        this._showGridHeatmap = enabled;
        try { if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') window._mp4Storage.saveSetting('mp4_grid_heatmap', this._showGridHeatmap ? '1' : '0'); /* do not write without consent/helper */ } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setGridHeatmap.saveSetting'); }
        try {
            // Redraw the full overlay so we clear any previously painted heatmap pixels
            try { this.render(); } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.setGridHeatmap.render'); }
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
        try { if (this.tileRenderer && typeof this.tileRenderer.determineBestResolution === 'function') { return this.tileRenderer.determineBestResolution(); } } catch (e) { this.errorHandler.logError(e, 'InteractiveMap.getNeededResolution.determineBestResolution'); }
        // Fallback: Calculate displayed size of the map on screen in CSS pixels
        const displayedCss = MP4Config.MAP_SIZE * this.zoom;
        const dpr = window.devicePixelRatio || 1;
        const displayedPx = displayedCss * dpr;

        // Find the smallest resolution that covers the displayed size in device pixels
        for (let i = 0; i < MP4Config.TILE_RESOLUTIONS.length; i++) {
            if (MP4Config.TILE_RESOLUTIONS[i] >= displayedPx) {
                return i;
            }
        }
        return MP4Config.TILE_RESOLUTIONS.length - 1;
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
        const needed = this.getNeededResolution();
        
        if (needed !== this.currentResolution && this.loadingResolution !== needed) {
            this.loadImage(needed);
        }
        
        // Update status display
        const status = document.getElementById('resolutionStatus');
        if (status) {
            const res = MP4Config.TILE_RESOLUTIONS[this.currentResolution] || MP4Config.TILE_RESOLUTIONS[0];
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
            console.warn('setMarkers called without markerManager available');
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
        if (!this.layerVisibility) this.layerVisibility = {};
        this.layerVisibility[layerKey] = !!show;
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
            if (!this.layerVisibility[layerKey]) continue;
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

        this.canvas.style.cursor = foundCursor ? 'pointer' : 'grab';
        // Only re-render when necessary (cursor state change may not require a full redraw,
        // but keep render for simplicity to ensure any visual selection overlay remains correct).
        this.render();
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

            // Create temporary marker
            const tempMarker = { uid: '', x: insertPosition.x, y: insertPosition.y };

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
            console.debug('Route insert start failed:', err);
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
            console.debug('Route node drag start failed:', err);
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
        } catch (e) { try { this.tooltip.style.left = `${x + 15}px`; this.tooltip.style.top = `${y - 10}px`; } catch (e) {} }
        // Style tooltip using the layer's color when available
        try {
            const layerCol = (key && LAYERS && LAYERS[key] && LAYERS[key].color) ? LAYERS[key].color : null;
            if (layerCol) {
                try { this.tooltip.style.borderColor = layerCol; } catch (e) {}
                try { if (typeof colorToRgba === 'function') this.tooltip.style.background = colorToRgba(layerCol, 0.12) || this.tooltip.style.background; } catch (e) {}
            } else {
                try { this.tooltip.style.borderColor = '#22d3ee'; } catch (e) {}
                try { this.tooltip.style.background = 'rgba(10, 25, 41, 0.95)'; } catch (e) {}
            }
        } catch (e) {}
        this.tooltip.style.display = 'block';
    }
    
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
    }

    // Update tooltip position to follow the selected marker (idempotent)
    _updateTooltipPosition() {
        try {
            if (!this.tooltip) return;
            if (!this.selectedMarker || !this.selectedMarkerLayer) return;
            // Compute marker screen position
            const pos = this.markerManager ? this.markerManager.getScreenPosition(this.selectedMarker, {zoom: this.zoom, panX: this.panX, panY: this.panY}, MAP_SIZE) : null;
            const mx = (pos && typeof pos.x === 'number') ? pos.x : (this.selectedMarker && typeof this.selectedMarker.x === 'number' ? this.selectedMarker.x * MAP_SIZE * this.zoom + this.panX : null);
            const my = (pos && typeof pos.y === 'number') ? pos.y : (this.selectedMarker && typeof this.selectedMarker.y === 'number' ? this.selectedMarker.y * MAP_SIZE * this.zoom + this.panY : null);
            if (mx === null || my === null) return;
            // Compute offsets of canvas inside parent container so absolute positioning aligns
            const parent = this.tooltip.parentElement;
            let canvasOffsetLeft = 0, canvasOffsetTop = 0;
            try {
                if (this.canvas && parent) {
                    const canvasRect = this.canvas.getBoundingClientRect();
                    const parentRect = parent.getBoundingClientRect();
                    canvasOffsetLeft = Math.round(canvasRect.left - parentRect.left);
                    canvasOffsetTop = Math.round(canvasRect.top - parentRect.top);
                }
            } catch (e) {}

            const margin = 6;
            let desiredLeft = Math.round(canvasOffsetLeft + mx + 15);
            let desiredTop = Math.round(canvasOffsetTop + my - 10);
            if (parent) {
                const maxLeft = Math.max(0, parent.clientWidth - (this.tooltip.offsetWidth || 120) - margin);
                const maxTop = Math.max(0, parent.clientHeight - (this.tooltip.offsetHeight || 28) - margin);
                desiredLeft = Math.min(Math.max(desiredLeft, margin), maxLeft);
                desiredTop = Math.min(Math.max(desiredTop, margin), maxTop);
            }
            this.tooltip.style.left = `${desiredLeft}px`;
            this.tooltip.style.top = `${desiredTop}px`;
            // Ensure visible when following
            if (this.tooltip.style.display !== 'block') this.tooltip.style.display = 'block';
        } catch (e) {}
    }
    
    render() {
        // Full redraw: use RenderPipeline exclusively
        if (this.renderPipeline && typeof this.renderPipeline.render === 'function') {
            try {
                this.renderPipeline.render();
            } catch (e) {
                console.debug('map.render: renderPipeline.render failed', e);
                // Fall back to individual renderers
                try { if (this.tileRenderer && typeof this.tileRenderer.render === 'function') this.tileRenderer.render(); } catch (err) { console.debug('renderTiles: tileRenderer.render failed', err); }
                try { if (this.heatmapRenderer && typeof this.heatmapRenderer.render === 'function') this.heatmapRenderer.render(); } catch (err) { console.debug('renderHeatmap: heatmapRenderer.render failed', err); }
                try { if (this.gridRenderer && typeof this.gridRenderer.render === 'function') this.gridRenderer.render(); } catch (err) { console.debug('renderGrid: gridRenderer.render failed', err); }
                try { if (this.markerRenderer && typeof this.markerRenderer.render === 'function') this.markerRenderer.render(); } catch (err) { console.debug('renderMarkers: markerRenderer.render failed', err); }
                try { if (this.routeRenderer && typeof this.routeRenderer.render === 'function') this.routeRenderer.render(); } catch (err) { console.debug('renderRoute: routeRenderer.render failed', err); }
                try { if (this.overlayRenderer && typeof this.overlayRenderer.render === 'function') this.overlayRenderer.render(); } catch (err) { console.debug('renderOverlay: overlayRenderer.render failed', err); }
                return;
            }
            // Ensure DOM quadrant labels are updated
            try { if (this.gridRenderer && typeof this.gridRenderer.updateQuadLabels === 'function') this.gridRenderer.updateQuadLabels(); } catch (e) {}
            // Update tooltip position (keeps selected marker tooltip anchored during pan/zoom)
            try { if (typeof this._updateTooltipPosition === 'function') this._updateTooltipPosition(); } catch (e) {}
            return;
        }

        // Fallback: individual renderers (legacy path)
        try { if (this.tileRenderer && typeof this.tileRenderer.render === 'function') this.tileRenderer.render(); } catch (e) { console.debug('renderTiles: tileRenderer.render failed', e); }
        try { if (this.heatmapRenderer && typeof this.heatmapRenderer.render === 'function') this.heatmapRenderer.render(); } catch (e) { console.debug('renderHeatmap: heatmapRenderer.render failed', e); }
        try { if (this.gridRenderer && typeof this.gridRenderer.render === 'function') this.gridRenderer.render(); } catch (e) { console.debug('renderGrid: gridRenderer.render failed', e); }
        try { if (this.markerRenderer && typeof this.markerRenderer.render === 'function') this.markerRenderer.render(); } catch (e) { console.debug('renderMarkers: markerRenderer.render failed', e); }
        try { if (this.routeRenderer && typeof this.routeRenderer.render === 'function') this.routeRenderer.render(); } catch (e) { console.debug('renderRoute: routeRenderer.render failed', e); }
        try { if (this.overlayRenderer && typeof this.overlayRenderer.render === 'function') this.overlayRenderer.render(); } catch (e) { console.debug('renderOverlay: overlayRenderer.render failed', e); }
        // Ensure DOM quadrant labels are updated
        try { if (this.gridRenderer && typeof this.gridRenderer.updateQuadLabels === 'function') this.gridRenderer.updateQuadLabels(); } catch (e) {}
        // Update tooltip position
        try { if (typeof this._updateTooltipPosition === 'function') this._updateTooltipPosition(); } catch (e) {}
    }

    // Draw only the overlay contents (route, markers, tooltip).


    // Draw the quadrant grid separating the map into 4 equal sections
    renderQuadrantGrid() {
        try { this.gridRenderer.renderQuadrantGrid(); } catch (e) { console.debug('map.renderQuadrantGrid delegate failed', e); }
    }


    // Draw fine detail grid covering the map area (8x8 subdivision)
    renderDetailGrid() {
        try { this.gridRenderer.renderDetailGrid(); } catch (e) { console.debug('map.renderDetailGrid delegate failed', e); }
    }
            



    
    // Draw axis index labels for the 8x8 grid
    renderAxisLabels() {
        try { this.gridRenderer.renderAxisLabels(); } catch (e) { console.debug('map.renderAxisLabels delegate failed', e); }
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
            if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent()) {
                StorageInterface.saveMarkerScaling({
                    userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                    highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                });
            }
        } catch (e) {
            console.debug('Failed to save marker scaling config:', e);
        }
        // Trigger re-render to show new sizes
        this.render();
    }

    // Update marker user scale multiplier and save to storage (consent-gated)
    updateMarkerUserScaleMultiplier(newMultiplier) {
        MP4Config.MARKER_SCALING.userScaleMultiplier = Math.max(0.5, Math.min(1.5, newMultiplier));
        try {
            if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent()) {
                StorageInterface.saveMarkerScaling({
                    userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                    highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                });
            }
        } catch (e) {
            console.debug('Failed to save marker scaling config:', e);
        }
        // Trigger re-render to show new sizes
        this.render();
    }

    // Update marker highlight multiplier and save to storage (consent-gated)
    updateMarkerHighlightMultiplier(newMultiplier) {
        MP4Config.MARKER_SCALING.highlightMultiplier = Math.max(1.5, Math.min(2.5, newMultiplier));
        try {
            if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent()) {
                StorageInterface.saveMarkerScaling({
                    userScaleMultiplier: MP4Config.MARKER_SCALING.userScaleMultiplier,
                    highlightMultiplier: MP4Config.MARKER_SCALING.highlightMultiplier
                });
            }
        } catch (e) {
            console.debug('Failed to save marker scaling config:', e);
        }
        // Trigger re-render to show new sizes
        this.render();
    }
    




    setRoute(routeIndices, lengthNormalized, routeSources) {
        if (this.routeManager) {
            this.routeManager.setRoute(routeIndices, lengthNormalized, routeSources);
        } else {
            // Fallback for when routeManager is not available
            console.warn('RouteManager not available, cannot set route');
        }
        
        // Reset the start-point flag when a new route is set (will be overridden by generation if applicable)
        // Do not change `routeLooping` here — looping is controlled explicitly by user preference.

        // Invalidate route renderer caches when route changes
        try {
            if (this.routeRenderer && typeof this.routeRenderer.invalidateCache === 'function') {
                this.routeRenderer.invalidateCache();
            }
        } catch (e) {
            console.debug('Failed to invalidate route renderer cache', e);
        }

        // Update route length display in sidebar
        try {
            const el = document.getElementById('routeLength');
            if (el) this.updateLayerCounts();
        } catch (e) {}

        // Update loop UI if route looping state changed
        try { this.updateLoopUI(); } catch (e) {}

        this.render();
        // Start animated route when a route is set
        if (this.currentRoute && this.currentRoute.length) {
            // Ensure the virtual 'route' layer is visible so the computed route appears
            if (!this.layerVisibility) this.layerVisibility = {};
            this.layerVisibility.route = true;
            // If the sidebar toggle exists, check it so the UI reflects the change
            try {
                const cb = document.getElementById('toggle_route');
                if (cb) cb.checked = true;
            } catch (e) {}
            this.startRouteAnimation();
            // Persist the route so it survives reloads
            try { this.saveRouteToStorage(); } catch (e) {}
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
            console.debug('Failed to invalidate route renderer cache', e);
        }

        // Update UI counts via the central updater so it shows '0'
        try { this.updateLayerCounts(); } catch (e) {}
        this.render();
        // Stop animated route when cleared
        this.stopRouteAnimation();
        // If we were in route edit mode, exit via canonical helper so visuals cleanly update
        try { if (typeof exitEditModeForLayer === 'function') exitEditModeForLayer('route'); } catch (e) {}
        // Remove persisted route when cleared
        try {
            this.routeManager.clearRoute();
        } catch (e) {}
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

// Initialize
let map;

// LocalStorage helpers for layer visibility persistence
function loadLayerVisibilityFromStorage() {
    try {
        if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
            return window._mp4Storage.loadSetting('mp4_layerVisibility');
        }
        return null;
    } catch (e) {
        return null;
    }
}

function saveLayerVisibilityToStorage(obj) {
    try {
        if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
            window._mp4Storage.saveSetting('mp4_layerVisibility', obj || {});
        }
    } catch (e) {}
}

// Highlight multiplier persistence
function loadHighlightMultiplierFromStorage() {
    try {
        if (!window._mp4Storage || typeof window._mp4Storage.hasStorageConsent !== 'function' || !window._mp4Storage.hasStorageConsent()) return null;
        const v = (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') ? window._mp4Storage.loadSetting('mp4_highlightMultiplier') : null;
        if (v === null || typeof v === 'undefined') return null;
        return (typeof v === 'string') ? parseFloat(v) : Number(v);
    } catch (e) { return null; }
}

function saveHighlightMultiplierToStorage(v) {
    try {
        if (!window._mp4Storage || typeof window._mp4Storage.hasStorageConsent !== 'function' || !window._mp4Storage.hasStorageConsent()) return;
        if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
            window._mp4Storage.saveSetting('mp4_highlightMultiplier', v);
        }
    } catch (e) {}
}

// Highlighted layers persistence (consent-gated)
function loadHighlightedLayersFromStorage() {
    try {
        if (!window._mp4Storage || typeof window._mp4Storage.hasStorageConsent !== 'function' || !window._mp4Storage.hasStorageConsent()) return null;
        const s = (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') ? window._mp4Storage.loadSetting('mp4_highlighted_layers') : null;
        if (!s) return null;
        return s;
    } catch (e) { return null; }
}

function saveHighlightedLayersToStorage(obj) {
    try {
        if (!window._mp4Storage || typeof window._mp4Storage.hasStorageConsent !== 'function' || !window._mp4Storage.hasStorageConsent()) return;
        if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
            window._mp4Storage.saveSetting('mp4_highlighted_layers', obj || {});
        }
    } catch (e) {}
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
        if (_editOverlayRaf_module) { try { cancelAnimationFrame(_editOverlayRaf_module); } catch (e) {} _editOverlayRaf_module = null; }
        // Start fade-out by removing visible class
        ov.classList.remove('visible');
        // Keep aria-hidden=false during fade; only mark hidden after transition completes
        try { ov.setAttribute('aria-hidden', 'false'); } catch (e) {}
        if (_overlayHideTimer_module) { try { clearTimeout(_overlayHideTimer_module); } catch (e) {} }
        _overlayHideTimer_module = setTimeout(() => {
            try {
                // If overlay was re-enabled in the meantime, don't clear
                if (map && (map.editMarkersMode || map.editRouteMode)) { _overlayHideTimer_module = null; return; }
                try { ov.setAttribute('aria-hidden', 'true'); } catch (e) {}
                try { ov.style.left = ''; ov.style.top = ''; ov.style.width = ''; ov.style.height = ''; ov.style.backgroundColor = ''; } catch (e) {}
            } catch (e) {}
            _overlayHideTimer_module = null;
        }, 220);
    } catch (e) {}
}

// Helper: exit edit mode for a layer if it's currently in edit mode
// This is the canonical exit path used by Hide All, manual toggle, and swipe toggle
// Defined at module scope so it's accessible from both initializeLayerIcons() and init()
function exitEditModeForLayer(layerKey) {
    try {
        if (layerKey === 'customMarkers' && map && map.editMarkersMode) {
            map.editMarkersMode = false;
            try { map._exitEditMode && map._exitEditMode('customMarkers'); } catch (e) {}
            try {
                const editToggle = document.getElementById('editMarkersToggle');
                if (editToggle) {
                    editToggle.setAttribute('aria-pressed', 'false');
                    editToggle.classList.remove('active');
                }
            } catch (e) {}
            try {
                const mini = document.getElementById('editMarkersToggleMini');
                if (mini) {
                    mini.classList.remove('glow');
                    mini.setAttribute('aria-pressed', 'false');
                }
            } catch (e) {}
            // Properly hide edit overlay with full cleanup
            hideEditOverlayProperly();
            try { if (map && typeof map.render === 'function') map.render(); } catch (e) {}
        } else if (layerKey === 'route' && map && map.editRouteMode) {
            map.editRouteMode = false;
            try { map._exitEditMode && map._exitEditMode('route'); } catch (e) {}
            try {
                const routeEditToggle = document.getElementById('editRouteToggle');
                if (routeEditToggle) {
                    routeEditToggle.setAttribute('aria-pressed', 'false');
                    routeEditToggle.classList.remove('active');
                }
            } catch (e) {}
            try {
                const mini = document.getElementById('editRouteToggleMini');
                if (mini) {
                    mini.classList.remove('glow');
                    mini.setAttribute('aria-pressed', 'false');
                }
            } catch (e) {}
            // Reset cursor to grab when exiting route edit mode
            try { if (map.canvas) map.canvas.style.cursor = 'grab'; } catch (e) {}
            // Properly hide edit overlay with full cleanup
            hideEditOverlayProperly();
            try { if (map && typeof map.render === 'function') map.render(); } catch (e) {}
        }
    } catch (e) {}
}

async function initializeLayerIcons() {
    // Dynamically build layer toggle list from `LAYERS` so adding layers is data-driven.
    const container = document.getElementById('layerList');
    if (!container) return;
    container.innerHTML = '';

    const layerEntries = Object.entries(LAYERS || {});
    const savedVisibility = loadLayerVisibilityFromStorage() || {};
    // Ensure a 'route' toggle is present even if not defined in LAYERS (virtual layer)
    /*if (!LAYERS.route) {
        // Use a non-mutating fallback so we don't accidentally create runtime data
        // that should live in a data file. `data/route.js` should provide `LAYERS.route`.
        layerEntries.push(['route', { name: 'Route', icon: '➤', color: '#ffa500' }]);
    }*/
    // Ensure route layer always appears at the top of the list
    const preferred = ['route'];
    const orderedEntries = [];
    // push route first if it exists
    const routeIdx = layerEntries.findIndex(e => e[0] === 'route');
    if (routeIdx >= 0) orderedEntries.push(layerEntries[routeIdx]);
    // Place `customMarkers` immediately after `route` when present so it's below the route layer
    const customIdx = layerEntries.findIndex(e => e[0] === 'customMarkers');
    if (customIdx >= 0) orderedEntries.push(layerEntries[customIdx]);
    // collect all static layers (excluding route and customMarkers) and add them in REVERSED order
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

    // Insert a runtime-only `grid` layer so users can toggle grid visibility from the sidebar.
    // Always append it at the end of the ordered list.
    const hasGrid = orderedEntries.some(e => e[0] === 'grid');
    if (!hasGrid) {
        // Use a darker teal backdrop so the white icon remains visible,
        // and explicitly set the icon color to match the gridlines (cyan).
        const gridEntry = ['grid', { name: 'Grid', icon: '▦', color: '#155962ff', iconColor: '#22d3ee' }];
        orderedEntries.push(gridEntry);
    }

    // Pending/batched layer toggle applier (RAF) and debounced storage saver
    let _pendingLayerToggles = {};
    let _layerToggleRaf = null;
    let _layerToggleSaveTimeout = null;
    const _scheduleApplyLayerToggles = () => {
        if (_layerToggleRaf) return;
        _layerToggleRaf = requestAnimationFrame(() => {
            const toApply = _pendingLayerToggles;
            _pendingLayerToggles = {};
            _layerToggleRaf = null;
            try {
                if (map) {
                    // Apply each pending toggle via the existing map API so side-effects run
                    for (const [k, v] of Object.entries(toApply)) {
                        try {
                            if (k === 'route') {
                                map.layerVisibility = Object.assign({}, map.layerVisibility || {}, { route: v });
                                try { map.render(); } catch (e) {}
                            } else {
                                if (typeof map.toggleLayer === 'function') {
                                    map.toggleLayer(k, v);
                                } else {
                                    if (!map.layerVisibility) map.layerVisibility = {};
                                    map.layerVisibility[k] = v;
                                }
                            }
                        } catch (e) { _logError(e, 'initializeLayerIcons._scheduleApplyLayerToggles.applyToggle'); }
                    }
                    try { if (map) map.render(); } catch (e) { _logError(e, 'initializeLayerIcons._scheduleApplyLayerToggles.render'); }
                }
            } catch (e) { _logError(e, 'initializeLayerIcons._scheduleApplyLayerToggles'); }
        });
    };
    const _scheduleSaveLayerVisibility = () => {
        try { if (_layerToggleSaveTimeout) clearTimeout(_layerToggleSaveTimeout); } catch (e) { _logError(e, 'initializeLayerIcons._scheduleSaveLayerVisibility.clearTimeout'); }
        _layerToggleSaveTimeout = setTimeout(() => {
            try { saveLayerVisibilityToStorage && saveLayerVisibilityToStorage(map && map.layerVisibility ? map.layerVisibility : {}); } catch (e) { _logError(e, 'initializeLayerIcons._scheduleSaveLayerVisibility.saveStorage'); }
            _layerToggleSaveTimeout = null;
        }, 300);
    };

    // Helper: convert hex color or rgb(...) strings to rgba(r,g,b,a)
    function colorToRgba(color, alpha) {
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

    // Gesture tracking for pointerdown-swipe toggles
    let _gestureActive = false;
    let _gesturePointerId = null;
    let _gestureToggled = new Set();
    const _controlsEl = document.querySelector('.controls');

    orderedEntries.forEach(([layerKey, layer]) => {
        // root row as a button (replaces hidden checkbox + label for reliable mobile toggles)
        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'layer-toggle';
        label.dataset.layer = layerKey;
        // Determine initial checked state: preference order -> saved storage -> runtime map state -> default false
        const initialChecked = (savedVisibility && Object.prototype.hasOwnProperty.call(savedVisibility, layerKey)) ? !!savedVisibility[layerKey] : !!(map && map.layerVisibility && map.layerVisibility[layerKey]);
        // reflect active visual state on the row
        if (initialChecked) label.classList.add('active');
        label.setAttribute('aria-pressed', initialChecked ? 'true' : 'false');

        // icon
        const iconDiv = document.createElement('div');
        iconDiv.className = 'layer-icon';
        if (layer.icon) iconDiv.textContent = layer.icon;
        if (layer.color) iconDiv.style.backgroundColor = layer.color;
        // allow a separate icon color (useful for white icons on colored backdrops)
        if (layer.iconColor) iconDiv.style.color = layer.iconColor;
        // Icon click toggles highlight for this layer (separate from visibility toggle on the row)
        try {
            // Prevent pointer/touch on the icon backdrop from bubbling to the row
            try { iconDiv.addEventListener('pointerdown', (ev) => { try { ev.stopPropagation(); } catch (e) {} }); } catch (e) {}
            try { iconDiv.addEventListener('touchstart', (ev) => { try { ev.stopPropagation(); } catch (e) {} }, { passive: true }); } catch (e) {}
            const _handleIconActivate = (ev) => {
                try { if (ev && ev.stopPropagation) ev.stopPropagation(); } catch (e) { _logError(e, 'initializeLayerIcons._handleIconActivate.stopPropagation'); }
                try {
                    const k = label.dataset && label.dataset.layer;
                    if (!k) return;
                    if (map && typeof map.toggleLayerHighlight === 'function') {
                        map.toggleLayerHighlight(k, (layer && layer.highlightScale) ? layer.highlightScale : 2.0);
                        try {
                            if (map.highlightedLayers && map.highlightedLayers.has(k)) {
                                if (!map.layerVisibility || !map.layerVisibility[k]) {
                                    if (typeof map.toggleLayer === 'function') {
                                        try { map.toggleLayer(k, true); } catch (e) { /* suppressed */ }
                                    } else {
                                        try { if (!map.layerVisibility) map.layerVisibility = {}; map.layerVisibility[k] = true; } catch (e) { _logError(e, 'initializeLayerIcons._handleIconActivate.setVisibility'); }
                                        try { if (map && typeof map.render === 'function') map.render(); } catch (e) { _logError(e, 'initializeLayerIcons._handleIconActivate.renderAfterVisibility'); }
                                    }
                                    try {
                                        const row = document.querySelector('#layerList .layer-toggle[data-layer="' + k + '"]');
                                        if (row) { row.classList.add('active'); row.setAttribute('aria-pressed', 'true'); }
                                    } catch (e) { _logError(e, 'initializeLayerIcons._handleIconActivate.updateRowUI'); }
                                    try { _scheduleSaveLayerVisibility(); } catch (e) { _logError(e, 'initializeLayerIcons._handleIconActivate.saveLayers'); }
                                }
                            }
                        } catch (e) { _logError(e, 'initializeLayerIcons._handleIconActivate.highlightFlow'); }
                    } else if (map) {
                        map.highlightedLayers = map.highlightedLayers || new Set();
                        if (map.highlightedLayers.has(k)) {
                            map.highlightedLayers.delete(k);
                        } else {
                            map.highlightedLayers.add(k);
                            map._highlightConfig = map._highlightConfig || {}; map._highlightConfig[k] = { scale: (layer && typeof layer.highlightScale === 'number') ? layer.highlightScale : 2.0 };
                        }
                        try { if (typeof map.render === 'function') map.render(); } catch (e) {}
                    }
                    try {
                        const isHighlighted = !!(map && map.highlightedLayers && map.highlightedLayers.has(k));
                        try { iconDiv.classList.toggle('highlighted', isHighlighted); } catch (e) {}
                        try { label.classList.toggle('has-inline-highlight', isHighlighted); } catch (e) {}
                        try {
                            if (isHighlighted) {
                                const col = (layer && layer.color) ? layer.color : iconDiv.style.backgroundColor;
                                label.style.setProperty('--layer-inline-highlight-color', col);
                                const glow1 = colorToRgba(col, 0.72) || 'rgba(34,211,238,0.72)';
                                const glow2 = colorToRgba(col, 0.32) || 'rgba(34,211,238,0.32)';
                                iconDiv.style.boxShadow = `0 0 12px ${glow1}, 0 0 28px ${glow2}`;
                            } else {
                                label.style.removeProperty('--layer-inline-highlight-color');
                                iconDiv.style.boxShadow = '';
                            }
                        } catch (e) {}
                    } catch (e) {}
                } catch (e) {}
            };
            try { iconDiv._lastActivate = 0; } catch (e) {}
            try { iconDiv.addEventListener('click', (ev) => { try { const last = iconDiv._lastActivate || 0; if (Date.now() - last < 500) return; _handleIconActivate(ev); } catch (e) {} }); } catch (e) {}
            try { iconDiv.addEventListener('pointerup', (ev) => { try { if (ev && ev.preventDefault) ev.preventDefault(); if (ev && ev.stopPropagation) ev.stopPropagation(); iconDiv._lastActivate = Date.now(); _handleIconActivate(ev); } catch (e) {} }); } catch (e) {}
        } catch (e) {}
        label.appendChild(iconDiv);

        // info
        const info = document.createElement('div');
        info.className = 'layer-info';
        const nameDiv = document.createElement('div');
        nameDiv.className = 'layer-name';
        nameDiv.textContent = layer.name || layerKey;
        const countDiv = document.createElement('div');
        countDiv.className = 'layer-count';

        // count span id strategy: use `${layerKey}Count` to be predictable; special-case 'route' -> 'routeLength'
        const countSpan = document.createElement('span');
        countSpan.id = (layerKey === 'route') ? 'routeLength' : `${layerKey}Count`;
        if (layer.markerCountText) {
            countSpan.textContent = layer.markerCountText;
        } else if (Array.isArray(layer.markers)) {
            const configuredMax = (typeof layer.maxMarkers === 'number') ? layer.maxMarkers : (map && map.layerConfig && map.layerConfig[layerKey] && map.layerConfig[layerKey].maxMarkers);
            if (typeof configuredMax === 'number') {
                countSpan.textContent = `${layer.markers.length} / ${configuredMax}`;
            } else {
                countSpan.textContent = `${layer.markers.length}`;
            }
        } else {
            countSpan.textContent = '';
        }

        countDiv.appendChild(countSpan);
        // optional suffix like "markers" or "length" (configurable per-layer)
        if (layer && layer.countSuffix) {
            countDiv.appendChild(document.createTextNode(' ' + layer.countSuffix));
        } else if (layerKey === 'route') {
            // route shows length (not a count)
            countDiv.appendChild(document.createTextNode(' length'));
        } else if (Array.isArray(layer.markers)) {
            // default suffix for data layers that expose a markers array
            countDiv.appendChild(document.createTextNode(' markers'));
        }

        info.appendChild(nameDiv);
        info.appendChild(countDiv);
        label.appendChild(info);

        // append to container
        container.appendChild(label);
        // Ensure icon backdrop reflects any pre-existing highlighted state (e.g. loaded from storage)
        try {
            const isHighlightedNow = !!(map && map.highlightedLayers && map.highlightedLayers.has(layerKey));
            try { iconDiv.classList.toggle('highlighted', isHighlightedNow); } catch (e) {}
            try { label.classList.toggle('has-inline-highlight', isHighlightedNow); } catch (e) {}
            try {
                if (isHighlightedNow) {
                    const col = (layer && layer.color) ? layer.color : iconDiv.style.backgroundColor;
                    label.style.setProperty('--layer-inline-highlight-color', col);
                    const glow1 = colorToRgba(col, 0.72) || 'rgba(34,211,238,0.72)';
                    const glow2 = colorToRgba(col, 0.32) || 'rgba(34,211,238,0.32)';
                    iconDiv.style.boxShadow = `0 0 12px ${glow1}, 0 0 28px ${glow2}`;
                } else {
                    label.style.removeProperty('--layer-inline-highlight-color');
                    iconDiv.style.boxShadow = '';
                }
            } catch (e) {}
        } catch (e) {}

        // Pointer gesture: immediate toggle on pointerdown; swiping across rows toggles them
        label.addEventListener('pointerdown', (ev) => {
            try {
                // Only track primary pointers
                if (ev.isPrimary === false) return;
                try { ev.preventDefault(); } catch (e) {}
                // Temporarily disable sidebar scrolling while interacting with layer rows
                try { if (_controlsEl) _controlsEl.style.touchAction = 'none'; } catch (e) {}
                _gestureActive = true;
                _gesturePointerId = ev.pointerId;
                _gestureToggled.add(label);

                const checked = !label.classList.contains('active');
                
                // Immediate visual feedback for responsiveness
                try { label.classList.toggle('active', checked); } catch (e) { _logError(e, 'initializeLayerIcons.label.toggleActive.pointerdown'); }
                try { label.setAttribute('aria-pressed', checked ? 'true' : 'false'); } catch (e) { _logError(e, 'initializeLayerIcons.label.setAttribute.pointerdown'); }

                // Update runtime visibility object so other code reads the new state
                try { if (!map.layerVisibility) map.layerVisibility = {}; map.layerVisibility[layerKey] = !!checked; } catch (e) { _logError(e, 'initializeLayerIcons.label.setVisibility.pointerdown'); }

                // If turning off a layer that's in edit mode, exit edit mode after visibility is updated
                if (!checked) {
                    try { exitEditModeForLayer(layerKey); } catch (e) { _logError(e, 'initializeLayerIcons.exitEditModeForLayer.pointerdown'); }
                }

                // Queue the heavier work to RAF to batch rapid toggles
                try { _pendingLayerToggles[layerKey] = !!checked; _scheduleApplyLayerToggles(); } catch (e) { _logError(e, 'initializeLayerIcons._scheduleApplyLayerToggles.pointerdown'); }

                // Debounced save to storage
                try { _scheduleSaveLayerVisibility(); } catch (e) { _logError(e, 'initializeLayerIcons._scheduleSaveLayerVisibility.pointerdown'); }
            } catch (e) { _logError(e, 'initializeLayerIcons.label.pointerdown'); }
        });

        // On touch devices, prevent native touch scrolling while interacting with
        // the layer row so swipes toggle rows instead of scrolling the sidebar.
        try {
            label.addEventListener('touchstart', (ev) => { try { ev.preventDefault(); } catch (e) { _logError(e, 'initializeLayerIcons.label.touchstart.preventDefault'); } }, { passive: false });
            label.addEventListener('touchmove', (ev) => { try { ev.preventDefault(); } catch (e) { _logError(e, 'initializeLayerIcons.label.touchmove.preventDefault'); } }, { passive: false });
        } catch (e) { _logError(e, 'initializeLayerIcons.label.touchEventListeners'); }

        // No pressed-state handlers for layer toggles: remove animations/press
        // feedback to avoid delayed or sticky toggles on mobile when tapping
        // multiple rows rapidly.

        // No hidden checkbox: click handler above performs toggle and persistence.

        // Apply saved/initial state to runtime if it differs from current map state
        try {
            const current = !!(map && map.layerVisibility && map.layerVisibility[layerKey]);
            if (initialChecked !== current) {
                if (!map.layerVisibility) map.layerVisibility = {};
                if (layerKey === 'route') {
                    map.layerVisibility.route = initialChecked;
                    try { map.render(); } catch (e) { _logError(e, 'initializeLayerIcons.label.render.syncInitialState'); }
                } else {
                    map.toggleLayer(layerKey, initialChecked);
                }
                // ensure the row visual matches the applied initial state
                label.classList.toggle('active', initialChecked);
                label.setAttribute('aria-pressed', initialChecked ? 'true' : 'false');
            }
        } catch (e) {}
    });

    // Document-wide pointer handlers to support swipe-to-toggle across rows
    document.addEventListener('pointermove', (ev) => {
        try {
            if (!_gestureActive || ev.pointerId !== _gesturePointerId) return;
            const el = document.elementFromPoint(ev.clientX, ev.clientY);
            if (!el) return;
            const row = (typeof el.closest === 'function') ? el.closest('.layer-toggle') : null;
            if (!row) return;
            if (_gestureToggled.has(row)) return;
            _gestureToggled.add(row);

            const k = row.dataset && row.dataset.layer;
            const willChecked = !row.classList.contains('active');

            try { row.classList.toggle('active', willChecked); } catch (e) { _logError(e, 'initializeLayerIcons.swipeToggle.toggleActive'); }
            try { row.setAttribute('aria-pressed', willChecked ? 'true' : 'false'); } catch (e) { _logError(e, 'initializeLayerIcons.swipeToggle.setAttribute'); }
            try { if (!map.layerVisibility) map.layerVisibility = {}; map.layerVisibility[k] = !!willChecked; } catch (e) { _logError(e, 'initializeLayerIcons.swipeToggle.setVisibility'); }
            
            // If turning off a layer that's in edit mode, exit edit mode after visibility is updated
            if (!willChecked) {
                try { exitEditModeForLayer(k); } catch (e) { _logError(e, 'initializeLayerIcons.swipeToggle.exitEdit'); }
            }

            try { _pendingLayerToggles[k] = !!willChecked; _scheduleApplyLayerToggles(); } catch (e) { _logError(e, 'initializeLayerIcons.swipeToggle.scheduleApply'); }
            try { _scheduleSaveLayerVisibility(); } catch (e) { _logError(e, 'initializeLayerIcons.swipeToggle.scheduleSave'); }
        } catch (e) { _logError(e, 'initializeLayerIcons.swipeToggle'); }
    }, { passive: true });

    const _endGesture = (ev) => {
        try {
            if (!_gestureActive) return;
            if (ev && ev.pointerId && ev.pointerId !== _gesturePointerId) return;
        } catch (e) { _logError(e, 'initializeLayerIcons._endGesture.guard'); }
        _gestureActive = false;
        _gesturePointerId = null;
        try { _gestureToggled.clear(); } catch (e) { _logError(e, 'initializeLayerIcons._endGesture.clearToggled'); }
        try { if (_controlsEl) _controlsEl.style.touchAction = 'manipulation'; } catch (e) { _logError(e, 'initializeLayerIcons._endGesture.touchAction'); }
    };

    document.addEventListener('pointerup', _endGesture, { passive: true });
    document.addEventListener('pointercancel', _endGesture, { passive: true });

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
            'controllers/SettingsController.js'
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
        console.debug('Failed to load controller modules:', e);
    }

    // Create map
    map = new InteractiveMap('mapCanvas');
        // Highlighting runtime state: set of layer keys currently highlighted
        try {
            map.highlightedLayers = new Set();
            map._highlightConfig = Object.assign({}, map._highlightConfig || {});
            // Global multiplier applied to all highlight scales (user-configurable)
            try { map.highlightScaleMultiplier = (function(){ const v = loadHighlightMultiplierFromStorage(); return (typeof v === 'number' && !isNaN(v)) ? v : 1.0; })(); } catch (e) { map.highlightScaleMultiplier = 1.0; }
            map.setLayerHighlight = function(layerKey, scale) {
                try { if (!this.highlightedLayers) this.highlightedLayers = new Set(); } catch (e) { _logError(e, 'setLayerHighlight.initHighlightedLayers'); }
                try { this.highlightedLayers.add(layerKey); } catch (e) { _logError(e, 'setLayerHighlight.addLayer'); }
                // (debug logs removed)
                try { this._highlightConfig = this._highlightConfig || {}; this._highlightConfig[layerKey] = { scale: (typeof scale === 'number') ? scale : 2.0 }; } catch (e) { _logError(e, 'setLayerHighlight.setConfig'); }
                try { if (typeof this.render === 'function') this.render(); } catch (e) { _logError(e, 'setLayerHighlight.render'); }
                try { saveHighlightedLayersToStorage && saveHighlightedLayersToStorage(this._highlightConfig || {}); } catch (e) { _logError(e, 'setLayerHighlight.saveStorage'); }
                // Ensure hit-testing is recalculated to match new visual sizes.
                try {
                    if (typeof this.checkMarkerHover === 'function') {
                        if (typeof this.lastMouseX === 'number' && typeof this.lastMouseY === 'number') {
                            try {
                                const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
                                if (rect) {
                                    const lx = this.lastMouseX - rect.left;
                                    const ly = this.lastMouseY - rect.top;
                                    try { this.checkMarkerHover(lx, ly); } catch (e) { _logError(e, 'setLayerHighlight.checkMarkerHover.withOffset'); }
                                } else {
                                    try { this.checkMarkerHover(this.lastMouseX, this.lastMouseY); } catch (e) { _logError(e, 'setLayerHighlight.checkMarkerHover.noOffset'); }
                                }
                            } catch (e) { _logError(e, 'setLayerHighlight.getBoundingRect'); }
                        } else {
                            try {
                                const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
                                if (rect) this.checkMarkerHover(rect.width / 2, rect.height / 2);
                            } catch (e) { _logError(e, 'setLayerHighlight.checkMarkerHover.center'); }
                        }
                    }
                } catch (e) { _logError(e, 'setLayerHighlight.hoverCheck'); }
            };
            map.clearLayerHighlight = function(layerKey) {
                try { if (this.highlightedLayers) this.highlightedLayers.delete(layerKey); } catch (e) { _logError(e, 'clearLayerHighlight.deleteLayer'); }
                // (debug logs removed)
                try { if (this._highlightConfig) delete this._highlightConfig[layerKey]; } catch (e) { _logError(e, 'clearLayerHighlight.deleteConfig'); }
                try { if (typeof this.render === 'function') this.render(); } catch (e) { _logError(e, 'clearLayerHighlight.render'); }
                try { saveHighlightedLayersToStorage && saveHighlightedLayersToStorage(this._highlightConfig || {}); } catch (e) { _logError(e, 'clearLayerHighlight.saveStorage'); }
                // Recompute hit testing after clearing highlight
                try {
                    if (typeof this.checkMarkerHover === 'function') {
                        if (typeof this.lastMouseX === 'number' && typeof this.lastMouseY === 'number') {
                            try {
                                const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
                                if (rect) {
                                    const lx = this.lastMouseX - rect.left;
                                    const ly = this.lastMouseY - rect.top;
                                    try { this.checkMarkerHover(lx, ly); } catch (e) { _logError(e, 'clearLayerHighlight.checkMarkerHover.withOffset'); }
                                } else {
                                    try { this.checkMarkerHover(this.lastMouseX, this.lastMouseY); } catch (e) { _logError(e, 'clearLayerHighlight.checkMarkerHover.noOffset'); }
                                }
                            } catch (e) { _logError(e, 'clearLayerHighlight.getBoundingRect'); }
                        } else {
                            try { const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null; if (rect) this.checkMarkerHover(rect.width/2, rect.height/2); } catch (e) { _logError(e, 'clearLayerHighlight.checkMarkerHover.center'); }
                        }
                    }
                } catch (e) { _logError(e, 'clearLayerHighlight.hoverCheck'); }
            };
            map.toggleLayerHighlight = function(layerKey, scale) {
                try { if (!this.highlightedLayers) this.highlightedLayers = new Set(); } catch (e) { _logError(e, 'toggleLayerHighlight.initHighlightedLayers'); }
                if (this.highlightedLayers && this.highlightedLayers.has(layerKey)) {
                    try { this.clearLayerHighlight(layerKey); } catch (e) { _logError(e, 'toggleLayerHighlight.clearLayerHighlight'); }
                } else {
                    try { this.setLayerHighlight(layerKey, scale); } catch (e) { _logError(e, 'toggleLayerHighlight.setLayerHighlight'); }
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
                        } catch (e) { _logError(e, '_enterEditMode.setOutlineColor'); }
                    }
                } catch (e) {}
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
                    } catch (e) {}
                    // Reset cursor when exiting route edit mode
                    if (layerKey === 'route') {
                        try { if (map.canvas) map.canvas.style.cursor = 'grab'; } catch (e) {}
                    }
                } catch (e) {}
            };
            // Apply any previously saved highlighted layers (consent-gated)
            try {
                const saved = (typeof loadHighlightedLayersFromStorage === 'function') ? loadHighlightedLayersFromStorage() : null;
                if (saved && typeof saved === 'object') {
                    for (const layerKey of Object.keys(saved)) {
                        try {
                            if (!window.LAYERS || !window.LAYERS[layerKey]) continue;
                            // Ensure layer is visible so the highlight is visible on load
                            map.layerVisibility = map.layerVisibility || {};
                            map.layerVisibility[layerKey] = true;
                            const scale = (saved[layerKey] && typeof saved[layerKey].scale === 'number') ? saved[layerKey].scale : (map._highlightConfig && map._highlightConfig[layerKey] && map._highlightConfig[layerKey].scale) || 2.0;
                            map.setLayerHighlight(layerKey, scale);
                        } catch (e) {}
                    }
                }
            } catch (e) {}
            // Grid DOM label creation is handled by GridRenderer.init()
            // Ensure GridRenderer performed its init (idempotent)
            try { if (map && map.gridRenderer && typeof map.gridRenderer.init === 'function') { map.gridRenderer.init(); } } catch (e) { /* deferred createGridQuadLabels failed (suppressed) */ }


        } catch (e) {}
    // Runtime metadata for the special `customMarkers` layer: deletable, not selectable
    try {
        if (typeof LAYERS !== 'undefined' && LAYERS.customMarkers) {
            LAYERS.customMarkers.deletable = true;
            LAYERS.customMarkers.selectable = true;
            if (typeof LAYERS.customMarkers.maxMarkers !== 'number') {
                LAYERS.customMarkers.maxMarkers = (map && map.layerConfig && map.layerConfig.customMarkers && map.layerConfig.customMarkers.maxMarkers) || 50;
            }
        }
    } catch (e) {}

    // Populate layer icons from LAYERS definitions
    initializeLayerIcons();

    // Initialize UI controllers
    let sidebarController, toolbarController, settingsController;
    try {
        if (typeof SidebarController !== 'undefined') {
            sidebarController = new SidebarController(map, MP4Config, this.errorHandler);
            sidebarController.init();
        }
        if (typeof ToolbarController !== 'undefined') {
            toolbarController = new ToolbarController(map, MP4Config, this.errorHandler);
            toolbarController.init();
        }
        if (typeof SettingsController !== 'undefined') {
            settingsController = new SettingsController(map, MP4Config, this.errorHandler);
            settingsController.init();
            // Load saved settings after controller is initialized
            settingsController.loadSavedSettings();
        }
    } catch (e) {
        console.debug('Failed to initialize UI controllers:', e);
    }

    // Load custom markers from storage if consent is given
    try {
        if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
            const markers = window._mp4Storage.loadSetting('mp4_customMarkers');
            if (markers && Array.isArray(markers)) {
                // Load markers into markerManager (should always be available in decoupled code)
                if (map.markerManager) {
                    map.markerManager.setMarkers(markers);
                } else {
                    console.warn('markerManager not available during init, markers not loaded');
                }
            }
        }
    } catch (e) {
        console.debug('Failed to load markers on page load:', e);
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
    } catch (e) {}
    // Attempt to restore a previously saved route (if any) - consent-gated
    try { 
        if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent()) {
            map.loadRouteFromStorage(); 
        }
    } catch (e) {}
    // Load route looping preference independently (persisted separately from route data)
    // Note: routeManager.loadFromStorage() already loads the looping flag, so this is redundant
    try {
        if (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function' && window._mp4Storage.hasStorageConsent()) {
            // Looping flag is already loaded by routeManager.loadFromStorage() above
            // Update UI after loading loop state
            try { map.updateLoopUI(); } catch (e) {}
        }
    } catch (e) { /* default to false */ }
    // Attempt to restore saved map view (pan/zoom) when consent is present
    try {
        const consent = (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function') ? window._mp4Storage.hasStorageConsent() : (localStorage.getItem('mp4_storage_consent') === '1');
        if (consent && map && typeof map.loadViewFromStorage === 'function') {
            try { map.loadViewFromStorage(); } catch (e) {}
        }
    } catch (e) {}
    // Wire the compact Save-data toggle and Clear button (consent-aware)
    // NOTE: Storage consent controls are now handled by SettingsController

    // Ensure the sidebar counts reflect current map state now that elements exist
    try { map.updateLayerCounts(); } catch (e) {}

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
                btn.addEventListener('click', () => { try { btn.blur(); } catch (e) {} });
            } catch (e) {}
        });
    } catch (e) {}

    // Ensure on-screen toggles/buttons don't retain focus after interaction
    try {
        document.addEventListener('click', (ev) => {
            try {
                const sel = (ev && ev.target) ? ev.target.closest('button, .control-btn, .zoom-btn, .hints-toggle, .layer-toggle, [role="button"]') : null;
                if (sel && typeof sel.blur === 'function') {
                    // blur after current event loop so any click handlers still run
                    setTimeout(() => { try { sel.blur(); } catch (e) {} }, 0);
                }
            } catch (e) {}
        }, true);
    } catch (e) {}

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
            } catch (e) { consentMarginBottom = 0; }

            // Align overlay's bottom to the footer height so it always sits
            // immediately above the footer area (CSS variable controls height).
            try {
                hintsOverlay.style.bottom = 'var(--sidebar-footer-height)';
            } catch (e) {}

        } catch (e) {}
    }
    try { positionHintsOverlay(); } catch (e) {}
    try { window.addEventListener('resize', positionHintsOverlay, { passive: true }); } catch (e) {}
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
                try { document.body.appendChild(overlay); } catch (e) {}
            }
            try { overlay.style.display = 'flex'; } catch (e) {}
        } catch (e) {}
    }

    function endRouteCompute() {
        try {
            if (map) map._computingRoute = false;
            const overlay = document.getElementById('computingOverlay');
            if (overlay) try { overlay.style.display = 'none'; } catch (e) {}
        } catch (e) {}
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
                } catch (e) {}
                // Keep aria-hidden=false while visible (during fade in/out)
                ov.classList.add('visible');
                try { ov.setAttribute('aria-hidden', 'false'); } catch (e) {}
                // continue RAF while visible so overlay follows pan/zoom smoothly
                _editOverlayRaf_module = requestAnimationFrame(_updateOverlayFrame);
            } else {
                // Should not usually reach here because updateEditOverlay controls RAF lifecycle,
                // but defensively hide overlay and clear inline sizes.
                ov.classList.remove('visible');
                try { ov.setAttribute('aria-hidden', 'true'); } catch (e) {}
                try { ov.style.left = ''; ov.style.top = ''; ov.style.width = ''; ov.style.height = ''; } catch (e) {}
                _editOverlayRaf_module = null;
            }
        } catch (e) { _editOverlayRaf_module = null; }
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
                } catch (e) {}
                if (_overlayHideTimer_module) { try { clearTimeout(_overlayHideTimer_module); } catch (e) {} _overlayHideTimer_module = null; }
                if (!_editOverlayRaf_module) _editOverlayRaf_module = requestAnimationFrame(_updateOverlayFrame);
                return;
            }

            // Turning off: stop RAF, but keep inline sizing for the transition,
            // then clear sizing after the CSS opacity transition to avoid snapping.
            if (_editOverlayRaf_module) { try { cancelAnimationFrame(_editOverlayRaf_module); } catch (e) {} _editOverlayRaf_module = null; }
            // Start fade-out by removing visible class
            ov.classList.remove('visible');
            // Keep aria-hidden=false during fade; only mark hidden after transition completes
            try { ov.setAttribute('aria-hidden', 'false'); } catch (e) {}
            if (_overlayHideTimer_module) { try { clearTimeout(_overlayHideTimer_module); } catch (e) {} }
            _overlayHideTimer_module = setTimeout(() => {
                try {
                    // If overlay was re-enabled in the meantime, don't clear
                    if (map && (map.editMarkersMode || map.editRouteMode)) { _overlayHideTimer_module = null; return; }
                    try { ov.setAttribute('aria-hidden', 'true'); } catch (e) {}
                    try { ov.style.left = ''; ov.style.top = ''; ov.style.width = ''; ov.style.height = ''; ov.style.backgroundColor = ''; } catch (e) {}
                } catch (e) {}
                _overlayHideTimer_module = null;
            }, 220); // slightly longer than CSS transition (160ms) to ensure smooth fade
        } catch (e) {}
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
                try { if (sidebarEl) { sidebarEl.style.setProperty(`--${sidebarCssPrefix}-border`, border); sidebarEl.style.setProperty(`--${sidebarCssPrefix}-glow1`, glow1); } } catch (e) {}
                try { if (miniEl) { miniEl.style.setProperty('--edit-layer-glow1', glow1); miniEl.style.setProperty('--edit-layer-glow2', glow2); miniEl.style.setProperty('--edit-layer-border', border); } } catch (e) {}
            } else {
                try { if (sidebarEl) { sidebarEl.style.removeProperty(`--${sidebarCssPrefix}-border`); sidebarEl.style.removeProperty(`--${sidebarCssPrefix}-glow1`); } } catch (e) {}
                try { if (miniEl) { miniEl.style.removeProperty('--edit-layer-glow1'); miniEl.style.removeProperty('--edit-layer-glow2'); } } catch (e) {}
            }
        } catch (e) {}
    }
    
    // Layer toggle handlers are created dynamically in `initializeLayerIcons()`
    
    // Custom marker controls
    document.getElementById('exportCustom').addEventListener('click', () => {
        try {
            if (this.markerManager) {
                this.markerManager.exportMarkers();
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
            let initial = (map && typeof map.highlightScaleMultiplier === 'number') ? map.highlightScaleMultiplier : 1.0;
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
                } catch (e) {}
            });
        }
    } catch (e) {}
    
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
                } catch (e) {}
            });
        }
    } catch (e) {}
    
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
                } catch (e) {}
            });
        }
    } catch (e) {}
    
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
                        uid = this.markerManager ? this.markerManager.generateUID(x, y) : `cm_${Math.random().toString(16).slice(2, 10)}`;
                    } else {
                        uid = (typeof m.uid === 'string' && m.uid) ? m.uid : (this.markerManager ? this.markerManager.generateUID(x, y) : `cm_${Math.random().toString(16).slice(2, 10)}`);
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
                    return this.markerManager ? !this.markerManager.markerExists(imported.uid) : !currentMarkers.some(current => current.uid === imported.uid);
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
                
                if (this.markerManager) {
                    this.markerManager.setMarkers(mergedMarkers);
                    // The setMarkers method handles saving to storage and notifying changes
                } else {
                    // Fallback if markerManager not available (should not happen in decoupled code)
                    console.warn('markerManager not available during marker import');
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
        const markerCount = this.markerManager ? this.markerManager.getAllMarkers().length : 0;
        if (markerCount === 0) {
            NotificationUtils.showInfo('No custom markers to clear.');
            return;
        }
        if (NotificationUtils.confirmDestructiveAction('Clear all custom markers? This cannot be undone.')) {
            if (this.markerManager) {
                this.markerManager.clearMarkers();
                // The clearMarkers method handles updating LAYERS and triggering callbacks
            } else {
                // Fallback (should not happen in decoupled code)
                console.warn('markerManager not available during clear markers');
                map.customMarkers = [];
            }
            map.updateLayerCounts();
            // Exit marker edit mode via canonical helper so visuals/overlay are cleaned up
            try { if (typeof exitEditModeForLayer === 'function') exitEditModeForLayer('customMarkers'); } catch (e) {}
            try { map._draggingCandidate = null; map._draggingMarker = null; } catch (e) {}
            try { map.canvas.style.cursor = 'grab'; } catch (e) {}
            try { map.render(); } catch (e) {}
        }
    });

    // Routing controls
    const computeImprovedBtn = document.getElementById('computeRouteImprovedBtn');
    const clearRouteBtn = document.getElementById('clearRouteBtn');
    if (computeImprovedBtn) {
        computeImprovedBtn.addEventListener('click', () => {
            beginRouteCompute();
            
            // Check for active drag operations and cancel them before computing
            if (map.pointerHandler && 
                (map._routeInsert || map._routeNodeCandidate || map._draggingMarker)) {
                map.pointerHandler._cancelRouteDragOperations('TSP route computation');
            }
            
            // Build combined visible marker sources from LAYERS (skip virtual 'route')
            const sources = [];
            const layerEntries2 = Object.entries(LAYERS || {});
            for (let li = 0; li < layerEntries2.length; li++) {
                const layerKey = layerEntries2[li][0];
                const layer = layerEntries2[li][1];
                if (layerKey === 'route') continue;
                if (!map.layerVisibility[layerKey]) continue;
                if (!Array.isArray(layer.markers)) continue;
                for (let i = 0; i < layer.markers.length; i++) {
                    sources.push({ marker: layer.markers[i], layerKey, layerIndex: i });
                }
            }
            if (sources.length === 0) {
                NotificationUtils.showRouteComputationError('No visible markers available to route.');
                return;
            }

            if (typeof TSPEuclid === 'undefined' || typeof TSPEuclid.solveTSPAdvanced !== 'function') {
                NotificationUtils.showRouteComputationError('Advanced TSP solver not available.');
                return;
            }

            computeImprovedBtn.disabled = true;
            const oldText2 = computeImprovedBtn.textContent;
            computeImprovedBtn.textContent = 'Computing';

            // Find index of selected marker in sources array (if any selected)
            let selectedMarkerIndex = -1;
            if (map.selectedMarker && map.selectedMarkerLayer) {
                for (let si = 0; si < sources.length; si++) {
                    if (sources[si].marker.uid === map.selectedMarker.uid && sources[si].layerKey === map.selectedMarkerLayer) {
                        selectedMarkerIndex = si;
                        break;
                    }
                }
            }

            setTimeout(() => {
                try {
                    const points = sources.map(s => ({ x: s.marker.x, y: s.marker.y }));
                    
                    // If a marker is selected, start the TSP from that marker
                    const solveOpts = { restarts: 24, threeOptIters: Math.max(2000, points.length * 30) };
                    if (selectedMarkerIndex >= 0) {
                        solveOpts.startPoint = selectedMarkerIndex;
                    }
                    
                    const result = TSPEuclid.solveTSPAdvanced(points, solveOpts);
                    if (result && Array.isArray(result.tour)) {
                        // Rotate tour to start from selected marker if one was selected
                        let finalTour = result.tour;
                        if (selectedMarkerIndex >= 0 && result.tour.length > 0) {
                            // Find position of selected marker in the tour
                            const selectedPos = result.tour.indexOf(selectedMarkerIndex);
                            if (selectedPos >= 0 && selectedPos < result.tour.length) {
                                // Rotate tour so selected marker is at index 0
                                finalTour = result.tour.slice(selectedPos).concat(result.tour.slice(0, selectedPos));
                                // log removed
                            }
                        }
                        
                        // Compute non-looping length (sum of consecutive segments only)
                        let length = 0;
                        try {
                            if (Array.isArray(finalTour) && finalTour.length > 1) {
                                for (let i = 0; i < finalTour.length - 1; i++) {
                                    const a = points[finalTour[i]];
                                    const b = points[finalTour[i + 1]];
                                    const dx = b.x - a.x;
                                    const dy = b.y - a.y;
                                    length += Math.sqrt(dx * dx + dy * dy);
                                }
                            } else {
                                length = 0;
                            }
                        } catch (e) {
                            length = (typeof result.length === 'number') ? result.length : 0;
                        }
                        map.setRoute(finalTour, length, sources);
                        // Do not change looping preference when computing a route; looping is explicit via UI.
                        // Deselect the marker after route is computed
                        try {
                            map.selectedMarker = null;
                            map.selectedMarkerLayer = null;
                            map.hideTooltip();
                        } catch (e) {}
                        // Enter route edit mode automatically so user can refine the computed route
                        try {
                            const routeToggle = document.getElementById('editRouteToggle');
                            if (routeToggle) {
                                // Click the sidebar toggle so its handler performs all UI sync work
                                if (routeToggle.getAttribute('aria-pressed') !== 'true') routeToggle.click();
                            } else {
                                // Fallback: set mode and update overlay/mini toggle directly
                                map.editRouteMode = true;
                                try { updateEditOverlay(); } catch (e) {}
                                try {
                                    const mini = document.getElementById('editRouteToggleMini');
                                        if (mini) { try { setEditToggleColor('route','editRouteToggle','editRouteToggleMini','edit-route', true); } catch(e) {} mini.classList.toggle('glow', true); mini.setAttribute('aria-pressed', 'true'); }
                                } catch (e) {}
                                // Ensure route edit-mode visual state: enter route edit mode helper
                                try { map._enterEditMode && map._enterEditMode('route', 2.0); } catch (e) {}
                                // Disable markers edit mode (and properly exit it)
                                try { map.editMarkersMode = false; } catch (e) {}
                                try { map._exitEditMode && map._exitEditMode('customMarkers'); } catch (e) {}
                                try { const markersToggle = document.getElementById('editMarkersToggle'); if (markersToggle) { markersToggle.setAttribute('aria-pressed','false'); markersToggle.classList.remove('active'); } } catch (e) {}
                                try { const miniMarkers = document.getElementById('editMarkersToggleMini'); if (miniMarkers) { try { setEditToggleColor('markers','editMarkersToggle','editMarkersToggleMini','edit-markers', false); } catch(e) {} miniMarkers.classList.toggle('glow', false); miniMarkers.setAttribute('aria-pressed','false'); } } catch (e) {}
                            }
                        } catch (e) {}
                        // log removed
                    } else {
                        NotificationUtils.showRouteComputationError('Advanced solver returned no route.');
                    }
                } catch (err) {
                    // error logging removed
                    NotificationUtils.showRouteComputationError('Error computing improved route: ' + err.message);
                } finally {
                    computeImprovedBtn.disabled = false;
                    computeImprovedBtn.textContent = oldText2;
                    endRouteCompute();
                }
            }, 50);
        });
    }

    // Compute route using current route waypoints plus nearby visible markers
    function expandRouteNearby() {
        if (typeof RouteComputation !== 'undefined') {
            RouteComputation.expandRouteNearby(map, beginRouteCompute, endRouteCompute, LAYERS, MAP_SIZE);
        } else {
            NotificationUtils.showModuleError('RouteComputation module not available');
        }
    }

    const computeNearbyBtn = document.getElementById('computeRouteNearbyBtn');
    if (computeNearbyBtn) {
        // Require the click to originate from a pointerdown on the button to avoid
        // accidental clicks caused by ending drags over controls. Keep the flag
        // set on pointerdown and only clear it when click is handled or on cancel.
        let _computeNearbyBtnPressed = false;
        try {
            computeNearbyBtn.addEventListener('pointerdown', () => { _computeNearbyBtnPressed = true; });
            // Do not clear on pointerup because the click event fires after pointerup;
            // clearing here would make the click always see false. Clear on pointercancel instead.
            computeNearbyBtn.addEventListener('pointerup', () => { /* noop - preserve flag until click handler */ });
            computeNearbyBtn.addEventListener('pointercancel', () => { _computeNearbyBtnPressed = false; });
        } catch (err) {}

        computeNearbyBtn.addEventListener('click', (e) => {
            // Ignore clicks that didn't originate from a pointerdown on this button
            if (!_computeNearbyBtnPressed) return;
            try {
                expandRouteNearby();
            } catch (err) {
                // suppressed
            } finally {
                _computeNearbyBtnPressed = false;
            }
        });
    }

    // Expose expandRouteNearby for programmatic use
    try { if (map) map.expandRouteNearby = expandRouteNearby; } catch (e) { _logError(e, 'init.exposeExpandRouteNearby'); }

    // Wire mini on-screen Expand Route button if present
    try {
        const computeNearbyMini = document.getElementById('computeRouteNearbyMini');
        if (computeNearbyMini) {
            try {
                const routeColor = (typeof LAYERS !== 'undefined' && LAYERS && LAYERS.route && LAYERS.route.color) ? String(LAYERS.route.color).trim() : null;
                if (routeColor) {
                    computeNearbyMini.style.setProperty('--edit-layer-icon', routeColor);
                    try {
                        const s = routeColor[0] === '#' ? routeColor.slice(1) : routeColor;
                        let r=34,g=211,b=238;
                        if (s.length === 6) { r = parseInt(s.slice(0,2),16); g = parseInt(s.slice(2,4),16); b = parseInt(s.slice(4,6),16); }
                        else if (s.length === 3) { r = parseInt(s[0]+s[0],16); g = parseInt(s[1]+s[1],16); b = parseInt(s[2]+s[2],16); }
                        computeNearbyMini.style.setProperty('--edit-layer-border', routeColor);
                        computeNearbyMini.style.setProperty('--edit-layer-press1', `rgba(${r},${g},${b},0.18)`);
                        computeNearbyMini.style.setProperty('--edit-layer-press2', `rgba(${r},${g},${b},0.08)`);
                    } catch(e) {}
                }
            } catch (e) {}
            computeNearbyMini.addEventListener('click', (e) => { try { expandRouteNearby(); } catch (err) {} });
        }
    } catch (e) {}

    // Route direction toggle: single button that flips animation direction
        try {
            const toggleDirBtn = document.getElementById('toggleRouteDirBtn');
            // Animation direction flag is no longer persisted or flipped; keep forward by default
            try { map._routeAnimationDirection = 1; } catch (e) {}

            // Centralized toggler: reverse waypoint order only (do not change animation direction)
            const toggleRouteDirection = () => {
                try { map._lastRouteAnimTime = performance.now(); } catch (e) {}
                try {
                    if (Array.isArray(map.currentRoute) && map.currentRoute.length > 1 && Array.isArray(map._routeSources)) {
                        const ordered = [];
                        for (let i = 0; i < map.currentRoute.length; i++) {
                            const idx = map.currentRoute[i];
                            const src = map._routeSources && map._routeSources[idx];
                            if (src && src.marker) ordered.push({ marker: src.marker, layerKey: src.layerKey });
                        }
                        if (ordered.length > 1) {
                            ordered.reverse();
                            const newSources = ordered.map((s, i) => ({ marker: s.marker, layerKey: s.layerKey, layerIndex: i }));
                            const newIndices = newSources.map((_, i) => i);
                            try { map.setRoute(newIndices, RouteUtilsCore.computeRouteLengthNormalized(newSources, MAP_SIZE), newSources); } catch (e) {}
                        }
                    }
                } catch (e) {}
                try { map.render(); } catch (e) {}
            };

            if (toggleDirBtn) {
                toggleDirBtn.addEventListener('click', toggleRouteDirection);
            }
            // Expose toggler for mini button and programmatic use
            try { if (map) map.toggleRouteDirection = toggleRouteDirection; } catch (e) { _logError(e, 'init.exposeToggleRouteDirection'); }
            // Wire mini on-screen Reverse Route button if present
            try {
                const toggleDirMini = document.getElementById('toggleRouteDirMini');
                if (toggleDirMini) {
                    try {
                        const routeColor = (typeof LAYERS !== 'undefined' && LAYERS && LAYERS.route && LAYERS.route.color) ? String(LAYERS.route.color).trim() : null;
                        if (routeColor) {
                            toggleDirMini.style.setProperty('--edit-layer-icon', routeColor);
                            try {
                                const s = routeColor[0] === '#' ? routeColor.slice(1) : routeColor;
                                let r=34,g=211,b=238;
                                if (s.length === 6) { r = parseInt(s.slice(0,2),16); g = parseInt(s.slice(2,4),16); b = parseInt(s.slice(4,6),16); }
                                else if (s.length === 3) { r = parseInt(s[0]+s[0],16); g = parseInt(s[1]+s[1],16); b = parseInt(s[2]+s[2],16); }
                                toggleDirMini.style.setProperty('--edit-layer-border', routeColor);
                                toggleDirMini.style.setProperty('--edit-layer-press1', `rgba(${r},${g},${b},0.18)`);
                                toggleDirMini.style.setProperty('--edit-layer-press2', `rgba(${r},${g},${b},0.08)`);
                            } catch(e) {}
                        }
                    } catch (e) {}
                    toggleDirMini.addEventListener('click', (ev) => { try { toggleRouteDirection(); } catch (err) {} });
                }
            } catch (e) {}
        } catch (e) {}

    if (clearRouteBtn) {
        clearRouteBtn.addEventListener('click', () => {
            if (!map.currentRoute || map.currentRoute.length === 0) {
                NotificationUtils.showInfo('No route to clear.');
                return;
            }
            if (NotificationUtils.confirmDestructiveAction('Clear route? This cannot be undone.')) {
                map.clearRoute();
                // Exit route edit mode when route is cleared
                try { map.editRouteMode = false; } catch (e) {}
                try { map._routeNodeCandidate = null; map._routeInsert = null; } catch (e) {}
                // Update sidebar & mini toggles if present
                try {
                    const routeToggle = document.getElementById('editRouteToggle');
                    if (routeToggle) { routeToggle.setAttribute('aria-pressed', 'false'); routeToggle.classList.remove('active'); }
                } catch (e) {}
                try {
                    const miniRoute = document.getElementById('editRouteToggleMini');
                    if (miniRoute) { try { setEditToggleColor('route','editRouteToggle','editRouteToggleMini','edit-route', false); } catch (e) {} miniRoute.classList.toggle('glow', false); miniRoute.setAttribute('aria-pressed', 'false'); }
                } catch (e) {}
                try { updateEditOverlay(); } catch (e) {}
                try { map.render(); } catch (e) {}
            }
        });
    }

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
                    try { hintsOverlay.classList.add('closed'); } catch (e) {}
                    hintsOverlay.setAttribute('aria-hidden', 'true');
                }
                if (hintsToggle) {
                    hintsToggle.setAttribute('aria-expanded', 'false');
                    hintsToggle.classList.remove('active');
                }
            } catch (e) {}
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
                    try { if (dev_loadingResolution) dev_loadingResolution.textContent = (map.loadingResolution != null) ? (MP4Config.TILE_RESOLUTIONS[map.loadingResolution] + 'px') : '—'; } catch (e) {}
                    try { if (dev_imagesCached) dev_imagesCached.textContent = Object.keys(map.images || {}).length; } catch (e) {}
                } catch (e) {
                    if (devStatsPanel) {
                        try { if (dev_bitmapActive) dev_bitmapActive.textContent = 'err'; } catch (e) {}
                        try { if (dev_bitmapQueue) dev_bitmapQueue.textContent = 'err'; } catch (e) {}
                        try { if (dev_imageControllers) dev_imageControllers.textContent = 'err'; } catch (e) {}
                        try { if (dev_imageBitmaps) dev_imageBitmaps.textContent = 'err'; } catch (e) {}
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
                    try { hintsOverlay.classList.toggle('closed', !isOpen); } catch (e) {}
                    hintsToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                    hintsOverlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
                    hintsList.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
                    // Mirror visual pressed state like other toggle buttons
                    try { hintsToggle.classList.toggle('active', !!isOpen); } catch (e) {}
                    // No map.resize() needed — the hints list is now in-flow inside the footer
                });
            }
        } catch (e) {}

        // File migration tools removed — routes and markers now upgrade in place on import/load
    } catch (e) {}

    // Signal that the app finished initial synchronous startup work so the UI
    // (loading fade) can be removed when the page is ready for interaction.
    try {
        // Wait briefly for the initial map image to arrive so the first
        // visible render (especially at very large zooms) doesn't cause
        // heavy decoding work while the page is already unfaded.
        // This polls for either `map.images[needed]` or `map.currentImage`.
        try {
            const waitForInitialImage = (timeoutMs = 4000) => new Promise((resolve) => {
                const start = Date.now();
                (function check() {
                    try {
                        if (map) {
                            const needed = (typeof map.getNeededResolution === 'function') ? map.getNeededResolution() : null;
                            if (needed !== null && map.images && map.images[needed]) return resolve(true);
                            if (map.currentImage) return resolve(true);
                        }
                    } catch (e) {}
                    if (Date.now() - start >= timeoutMs) return resolve(false);
                    setTimeout(check, 80);
                })();
            });
            // await initial image (short timeout) but don't block startup forever
            await waitForInitialImage(4000);
            // Do one overlay render now that the initial image is available
            try {
                if (map && typeof map.render === 'function') map.render();
                // Give the browser a chance to paint and finish any decode work
                await new Promise(res => requestAnimationFrame(() => setTimeout(res, 140)));
            } catch (e) {}
        } catch (e) {}
        try { window._mp4Ready = true; } catch (e) {}
        document.dispatchEvent(new Event('mp4-ready'));
    } catch (e) {}
}

document.addEventListener('DOMContentLoaded', init);
