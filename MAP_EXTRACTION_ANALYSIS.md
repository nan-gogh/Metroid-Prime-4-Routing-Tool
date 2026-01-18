# map.js Extraction Analysis & Plan

## Current Structure Overview

**Total Lines:** 3,396
- **Constructor:** Lines 4-478 (~474 lines - 14% of file)
- **Getters/Setters:** Lines 480-650 (~170 lines - 5% of file)  
- **Methods:** Lines 651+ (~2,745 lines - 81% of file)

## Detailed Constructor Breakdown

### Lines 4-30: Canvas Setup (27 lines)
```javascript
// Overlay canvas (interactive) — keep `this.canvas`/`this.ctx` for backwards compatibility
this.canvas = document.getElementById(canvasId);
this.ctx = this.canvas.getContext('2d');

// Background tile canvas (non-interactive)
this.canvasTiles = document.getElementById('mapTiles');
this.ctxTiles = this.canvasTiles ? this.canvasTiles.getContext('2d') : null;

// Heatmap canvas (optional)
this.canvasHeatmap = document.getElementById('heatmapCanvas');
this.ctxHeatmap = this.canvasHeatmap ? this.canvasHeatmap.getContext('2d') : null;

// Sub-canvas architecture: Each renderer has its own canvas
this.canvasGrid = document.getElementById('gridCanvas');
this.ctxGrid = this.canvasGrid ? this.canvasGrid.getContext('2d') : null;
this.canvasMarker = document.getElementById('markerCanvas');
this.ctxMarker = this.canvasMarker ? this.canvasMarker.getContext('2d') : null;
this.canvasRoute = document.getElementById('routeCanvas');
this.ctxRoute = this.canvasRoute ? this.canvasRoute.getContext('2d') : null;
this.canvasOverlay = document.getElementById('overlayCanvas');
this.ctxOverlay = this.canvasOverlay ? this.canvasOverlay.getContext('2d') : null;
```
**→ RenderController:** Canvas references needed for RenderPipeline and renderers

---

### Lines 32-50: Error Handler & State Managers (19 lines)
```javascript
// Initialize error handler FIRST
this.errorHandler = typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler();

// Set error handler on global eventBus
if (window.eventBus) {
    window.eventBus.setErrorHandler(this.errorHandler);
}

// Initialize state managers
this.mapState = new MapState(MP4Config, { eventBus: window.eventBus, errorHandler: this.errorHandler });
this.selectionState = new SelectionState(MP4Config, { eventBus: window.eventBus, errorHandler: this.errorHandler });
this.editModeState = new EditModeState(MP4Config, { eventBus: window.eventBus, errorHandler: this.errorHandler });
this.highlightState = new HighlightState(MP4Config, { eventBus: window.eventBus, errorHandler: this.errorHandler });
this.tilesetState = new TilesetState(MP4Config, { eventBus: window.eventBus, errorHandler: this.errorHandler });
this.routeAnimationState = new RouteAnimationState(MP4Config, { eventBus: window.eventBus, errorHandler: this.errorHandler });
this.routeEditState = new RouteEditState({ eventBus: window.eventBus, errorHandler: this.errorHandler });
this.dragState = new DragState(window.eventBus, this.errorHandler);
this.layerState = new LayerState(Object.keys(LAYERS || {}), MP4Config, { eventBus: window.eventBus, errorHandler: this.errorHandler });
this.heatmapDisplayState = new HeatmapDisplayState(MP4Config, { eventBus: window.eventBus, errorHandler: this.errorHandler });
this.imageState = new ImageState(MP4Config, this.tilesetState, this.mapState);
```
**→ Bootstrap (map.js):** Shared instances created once, passed to controllers via DI

---

### Lines 52-56: Canvas Dimensions (5 lines)
```javascript
// Initialize canvas dimensions for mapState
if (this.mapState) {
    this.mapState.setCanvasSize(this.canvas.width, this.canvas.height, window.devicePixelRatio || 1);
}
```
**→ RenderController:** Canvas sizing logic

---

### Lines 57-90: Managers (MarkerManager, RouteManager) (34 lines)
```javascript
// Create managers BEFORE renderers so renderers can access them
if (typeof MarkerManager !== 'undefined' && typeof StorageInterface !== 'undefined' && typeof NotificationInterface !== 'undefined') {
    this.markerManager = new MarkerManager(
        { maxMarkers: 50, layerPrefix: 'cm' },
        StorageInterface,
        NotificationInterface,
        window.eventBus
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
```
**→ DataController:** Manager instantiation and lifecycle

---

### Lines 84-90: ImageState Callbacks (7 lines)
```javascript
// Set up ImageState callback for renderer dirty marking
if (this.imageState) {
    this.imageState.setOnMarkRendererDirty((rendererName) => {
        this.markRendererDirty(rendererName);
    });
}
```
**→ RenderController:** ImageState callback setup

---

### Lines 91-170: Renderers Initialization (80 lines)
```javascript
try {
    if (typeof TileRenderer !== 'undefined') {
        this.tileRenderer = new TileRenderer(this.mapState, this.tilesetState, this.imageState, MP4Config, { lowSpec: this._lowSpec });
        try { this.tileRenderer.init(); } catch (e) { ... }
    }
    if (typeof HeatmapRenderer !== 'undefined') {
        // Create layer config...
        this.heatmapRenderer = new HeatmapRenderer(this.mapState, this.heatmapDisplayState, MP4Config, layerConfig, GREEN_CRYSTAL_LAYERS);
        try { this.heatmapRenderer.init(); } catch (e) { ... }
    }
    // GridRenderer, MarkerRenderer, RouteRenderer, OverlayRenderer...
    if (typeof RenderPipeline !== 'undefined') {
        // Pipeline setup with all renderers...
        this.renderPipeline = new RenderPipeline([...], renderContext);
    }
} catch (e) { ... }
```
**→ RenderController:** All renderer instantiation and pipeline setup

---

### Lines 172-190: Manager Callbacks (19 lines)
```javascript
// Set up callbacks AFTER managers are created
if (this.markerManager) {
    this.markerManager.setOnCleanupRouteReferences((deletedMarkerUid) => {
        if (this.routeManager) {
            this.routeManager.cleanupRouteReferences(deletedMarkerUid);
        }
    });
}
if (this.routeManager) {
    this.routeManager.setOnRouteChanged(() => {
        this.markRendererDirty('RouteRenderer');
    });
}
```
**→ DataController:** Manager callback setup

---

### Lines 192-250: Settings UI - Loop Route Button (59 lines)
```javascript
// Loop Route toggle: explicit control for closing/opening computed/manual routes
try {
    const loopBtn = document.getElementById('loopRouteBtn');
    const updateLoopUI = () => {
        if (!loopBtn) return;
        loopBtn.classList.toggle('active', this.routeLooping);
        loopBtn.setAttribute('aria-pressed', this.routeLooping ? 'true' : 'false');
    };
    if (loopBtn) {
        loopBtn.addEventListener('click', () => {
            this.routeLooping = !this.routeLooping;
            // Route recalculation logic...
            this.routeManager.saveRouteLoopingFlag(this.routeLooping);
            this.render();
            updateLoopUI();
        });
    }
    updateLoopUI();
} catch (e) { ... }
```
**→ SettingsController:** Route looping UI and event handling

---

### Lines 252-260: Input Handlers (9 lines)
```javascript
// Phase 2: input and state scaffolds
try {
    if (typeof GestureHandler !== 'undefined') {
        this.gestureHandler = new GestureHandler(this, MP4Config);
        try { this.gestureHandler.init(); } catch (e) { ... }
    }
    if (typeof PointerHandler !== 'undefined') {
        this.pointerHandler = new PointerHandler(this, MP4Config, eventBus);
        try { this.pointerHandler.init(); } catch (e) { ... }
    }
    if (typeof KeyboardHandler !== 'undefined') {
        this.keyboardHandler = new KeyboardHandler(this, MP4Config, eventBus);
        try { this.keyboardHandler.init(); } catch (e) { ... }
    }
} catch (e) { ... }
```
**→ InputController:** Handler instantiation and initialization

---

### Lines 262-330: State Initialization (69 lines)
```javascript
// Initialize route animation state through state manager
if (this.routeAnimationState) {
    this.routeAnimationState.setAnimationOffset(0);
    // ... more state initialization
}

// Layer visibility state
if (this.layerState) {
    // Load grid visibility from storage
    try {
        const g = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.GRID_VISIBLE);
        this.layerState.setGridVisible(g === '1' || g === 1 || g === 'true' || g === true);
    } catch (e) {
        this.layerState.setGridVisible(false);
    }
}
```
**→ Bootstrap:** State initialization (keep in map.js for now, or move to DataController)

---

### Lines 330-450: Storage Loading (121 lines)
```javascript
// Load tileset from storage
try {
    const t = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.TILESET);
    this.tileset = t || 'sat';
} catch (e) { this.tileset = 'sat'; }

// Load tileset grayscale
try {
    const g = window.storageService.loadSetting(MP4Config.STORAGE_KEYS.TILESET_GRAYSCALE);
    this.tilesetGrayscale = (g === '1' || g === 1 || g === true);
} catch (e) { this.tilesetGrayscale = false; }

// Load heatmap visibility
if (this.heatmapDisplayState) {
    try {
        this.heatmapDisplayState.loadFromStorage(window.storageService);
    } catch (e) {
        this.heatmapDisplayState.setVisible(false);
    }
}

// Load marker scaling configuration
try {
    if (window.storageService && window.storageService.hasConsent()) {
        const savedScaling = window.storageService.get(MP4Config.STORAGE_KEYS.MARKER_SCALING);
        if (savedScaling) {
            MP4Config.MARKER_SCALING.userScaleMultiplier = savedScaling.userScaleMultiplier;
            MP4Config.MARKER_SCALING.highlightMultiplier = savedScaling.highlightMultiplier;
        }
    }
} catch (e) { ... }
```
**→ DataController:** Storage loading and config initialization

---

### Lines 452-478: Initial Setup (27 lines)
```javascript
// Setup
this.resize();
this.bindEvents();
// Fit the full map into the container on initial load
const cssWidth = this.canvas.parentElement.clientWidth;
const cssHeight = this.canvas.parentElement.clientHeight;
// ... zoom fitting logic ...
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
} catch (e) { ... }

this.render();
```
**→ Bootstrap:** Initial setup orchestration

---

## Extraction Summary

| Controller | Lines to Extract | Primary Responsibility |
|------------|------------------|----------------------|
| **DataController** | ~155 lines (Managers: 34, Callbacks: 19, Storage: 121) | Data loading, managers, persistence |
| **SettingsController** | ~59 lines (Loop UI) | Settings UI, user preferences |
| **InputController** | ~9 lines (Handlers) | Input event handling |
| **RenderController** | ~87 lines (Renderers: 80, Canvas: 27, Callbacks: 7) | Rendering pipeline, canvas management |
| **Bootstrap (map.js)** | ~50 lines (State init, setup) | DI container, initialization orchestration |

**Total extracted:** ~360 lines (~76% of constructor)
**Remaining in map.js:** ~114 lines (24% of constructor) + getters/setters + methods

## Next Steps

1. **Create controller scaffold files** with JSDoc headers and empty `init()`/`destroy()` stubs
2. **Extract DataController first** (managers and storage - most independent)
3. **Extract RenderController** (renderers and pipeline)
4. **Extract InputController** (handlers)
5. **Extract SettingsController** (UI controls)
6. **Refactor bootstrap** to use DI and controller orchestration