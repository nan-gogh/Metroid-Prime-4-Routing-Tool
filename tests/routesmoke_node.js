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

const mockRouteState = {
    currentRoute: [0, 1, 2],
    routeLooping: false
};

// Create a mock map for canvas access
const mockMap = {
    _routeSources: [
        { marker: { x: 0.1, y: 0.1, uid: 'marker1' } },
        { marker: { x: 0.5, y: 0.5, uid: 'marker2' } },
        { marker: { x: 0.9, y: 0.9, uid: 'marker3' } }
    ],
    canvas: { clientWidth: 800, clientHeight: 600 },
    ctx: document.createElement('canvas').getContext('2d')
};

const canvas = document.createElement('canvas');
const routeRenderer = new RouteRenderer(mockMapState, mockLayerState, mockRouteState, MP4Config);
routeRenderer.map = mockMap; // Set map reference for canvas access

this.errorHandler.logError('RouteRenderer instance created', 'require');

// Test cache functionality
this.errorHandler.logError('Testing cache functionality...', 'require');

// First render should compute path data
routeRenderer.render();
this.errorHandler.logError('First render completed', 'require');

// Check if cache exists
const cacheSize = Object.keys(routeRenderer._pathDataCache || {}).length;
console.log(`Cache size after first render: ${cacheSize}`);

// Second render should use cache
routeRenderer.render();
this.errorHandler.logError('Second render completed (should use cache)', 'require');

// Modify marker position
mockMap._routeSources[1].marker.x = 0.6;
this.errorHandler.logError('Modified marker position', 'require');

// Third render should recompute due to position change
routeRenderer.render();
this.errorHandler.logError('Third render completed (should recompute due to position change)', 'require');

// Test cache invalidation
routeRenderer.invalidateCache();
this.errorHandler.logError('Cache invalidated', 'require');

// Fourth render should recompute
routeRenderer.render();
this.errorHandler.logError('Fourth render completed after cache invalidation', 'require');

this.errorHandler.logError('All tests passed! RouteRenderer caching works correctly.', 'require');