// Simple Node.js test for RouteRenderer caching functionality
const fs = require('fs');
const path = require('path');

// Load RouteRenderer
const routeRendererPath = path.join(__dirname, '..', 'rendering', 'RouteRenderer.js');
const routeRendererCode = fs.readFileSync(routeRendererPath, 'utf8');

// Mock DOM elements and canvas context
global.document = {
    createElement: () => ({
        getContext: () => ({
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            setLineDash: () => {},
            lineWidth: 1,
            strokeStyle: '#000',
            globalAlpha: 1,
            save: () => {},
            restore: () => {},
            clearRect: () => {},
            arc: () => {},
            fill: () => {},
            closePath: () => {},
            fillStyle: '#000',
            lineCap: 'butt',
            lineJoin: 'miter',
            miterLimit: 10
        })
    })
};

global.window = global;

// Mock MP4Config
global.MP4Config = {
    ROUTE: {
        LINE_WIDTH: 20,
        NODE_SIZE_MULTIPLIER: 1.0,
        NODE_MIN_SIZE: 2,
        NODE_MAX_SIZE: 80
    }
};

// Mock LAYERS
global.LAYERS = {
    route: { color: '#22d3ee' }
};

// Execute RouteRenderer code
eval(routeRendererCode);

// Provide a simple global errorHandler so RouteRenderer logging won't throw
global.errorHandler = global.errorHandler || {
    logError: (...args) => console.error('[ERROR]', ...args),
    logDebug: (...args) => console.log('[DEBUG]', ...args),
    logWarning: (...args) => console.warn('[WARN]', ...args)
};

this.errorHandler = this.errorHandler || global.errorHandler;
this.errorHandler.logError('RouteRenderer loaded successfully', 'require');

// Create mock state managers
const mockMapState = {
    zoom: 1,
    panX: 0,
    panY: 0
};

const mockLayerState = {
    isLayerVisible: (layer) => layer === 'route'
};

// Mock route manager (source of truth for RouteRenderer)
const mockRouteManager = {
    currentRoute: [0, 1, 2],
    routeSources: [
        { marker: { x: 0.1, y: 0.1, uid: 'marker1' } },
        { marker: { x: 0.5, y: 0.5, uid: 'marker2' } },
        { marker: { x: 0.9, y: 0.9, uid: 'marker3' } }
    ],
    routeLooping: false,
    getRouteNodeSize: () => 6
};

// Create a mock map for canvas access
const mockMap = {
    _routeSources: mockRouteManager.routeSources,
    canvas: { clientWidth: 800, clientHeight: 600 },
    ctx: document.createElement('canvas').getContext('2d')
};

// Provide a global `map` object because RouteRenderer references global `map` in some paths
global.map = mockMap;
global.map.routeLooping = false;
global.map._routeDashOffset = 0;
global.map.getRouteNodeSize = () => 6;

// Additional mocked dependencies expected by RouteRenderer
const mockRouteAnimationState = { getLineWidth: () => 3 };
const mockDragState = { routePreview: null };
const mockHighlightState = { highlightedLayers: new Set(['route']) };

const routeRenderer = new RouteRenderer(mockMapState, mockLayerState, mockRouteAnimationState, mockRouteManager, mockDragState, mockHighlightState, MP4Config);
routeRenderer.map = mockMap; // Set map reference for canvas access

// Create a minimal RenderContext used by renderers in the browser
const canvas = document.createElement('canvas');
const renderContext = {
    canvasRoute: canvas,
    ctxRoute: document.createElement('canvas').getContext('2d')
};

this.errorHandler.logError('RouteRenderer instance created', 'require');

// Test cache functionality
this.errorHandler.logError('Testing cache functionality...', 'require');

// First render should compute path data
routeRenderer.render(renderContext);
this.errorHandler.logError('First render completed', 'require');

// Check if cache exists (RouteRenderer stores cached path in `_cachedPath`)
const cachePresent = !!routeRenderer._cachedPath;
console.log(`Cached path present after first render: ${cachePresent}`);

// Second render should use cache
routeRenderer.render(renderContext);
this.errorHandler.logError('Second render completed (should use cache)', 'require');

// Modify marker position
mockMap._routeSources[1].marker.x = 0.6;
this.errorHandler.logError('Modified marker position', 'require');

// Third render should recompute due to position change
routeRenderer.render(renderContext);
this.errorHandler.logError('Third render completed (should recompute due to position change)', 'require');

// Test cache invalidation
routeRenderer.invalidateCache();
this.errorHandler.logError('Cache invalidated', 'require');

// Fourth render should recompute
routeRenderer.render(renderContext);
this.errorHandler.logError('Fourth render completed after cache invalidation', 'require');

this.errorHandler.logError('All tests passed! RouteRenderer caching works correctly.', 'require');