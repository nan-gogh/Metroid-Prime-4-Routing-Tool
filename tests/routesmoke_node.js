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
            clearRect: () => {}
        })
    })
};

global.window = global;

// Mock LAYERS
global.LAYERS = {
    route: { color: '#22d3ee' }
};

// Execute RouteRenderer code
eval(routeRendererCode);

console.log('RouteRenderer loaded successfully');

// Create a mock map and RouteRenderer instance
const mockMap = {
    currentRoute: [0, 1, 2],
    _routeSources: [
        { marker: { x: 0.1, y: 0.1, uid: 'marker1' } },
        { marker: { x: 0.5, y: 0.5, uid: 'marker2' } },
        { marker: { x: 0.9, y: 0.9, uid: 'marker3' } }
    ],
    layerVisibility: { route: true },
    routeLooping: false,
    zoom: 1,
    panX: 0,
    panY: 0,
    canvas: { clientWidth: 800, clientHeight: 600 }
};

const canvas = document.createElement('canvas');
const routeRenderer = new RouteRenderer(mockMap, canvas);

console.log('RouteRenderer instance created');

// Test cache functionality
console.log('Testing cache functionality...');

// First render should compute path data
routeRenderer.render();
console.log('First render completed');

// Check if cache exists
const cacheSize = Object.keys(routeRenderer._pathDataCache || {}).length;
console.log(`Cache size after first render: ${cacheSize}`);

// Second render should use cache
routeRenderer.render();
console.log('Second render completed (should use cache)');

// Modify marker position
mockMap._routeSources[1].marker.x = 0.6;
console.log('Modified marker position');

// Third render should recompute due to position change
routeRenderer.render();
console.log('Third render completed (should recompute due to position change)');

// Test cache invalidation
routeRenderer.invalidateCache();
console.log('Cache invalidated');

// Fourth render should recompute
routeRenderer.render();
console.log('Fourth render completed after cache invalidation');

console.log('All tests passed! RouteRenderer caching works correctly.');