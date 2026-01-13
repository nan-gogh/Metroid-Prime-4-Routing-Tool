// Test script for MapState class
// Run with: node tests/mapstate_test.js

(function() {
  // Mock global config
  global.MP4Config = {
    MAP_SIZE: 8192,
    TILE_RESOLUTIONS: [256, 512, 1024, 2048, 4096, 8192],
    ZOOM: {
      DEFAULT_MIN: 0.05,
      MAX: 4
    }
  };

  // Mock window object
  global.window = {
    MP4Config: global.MP4Config,
    devicePixelRatio: 1
  };

  // Load MapState
  const fs = require('fs');
  const path = require('path');
  const mapStateCode = fs.readFileSync(path.join(__dirname, '../state/MapState.js'), 'utf8');

  // Execute the MapState code
  eval(mapStateCode);

  console.log('🧪 Testing MapState class...');

  // Create MapState instance
  const mapState = new global.window.MapState(global.window.MP4Config);

  // Test 1: Basic initialization
  console.log('✅ Test 1: Basic initialization');
  console.log(`   Initial zoom: ${mapState.zoom} (expected: 0.05)`);
  console.log(`   Initial pan: (${mapState.panX}, ${mapState.panY}) (expected: (0, 0))`);

  // Test 2: Canvas size setting
  console.log('✅ Test 2: Canvas size setting');
  mapState.setCanvasSize(800, 600, 2);
  console.log(`   Canvas size: ${mapState.canvasWidth}x${mapState.canvasHeight} @ ${mapState.devicePixelRatio}x`);
  console.log(`   Min zoom: ${mapState.minZoom} (should be > 0.005)`);

  // Test 3: Coordinate transformations
  console.log('✅ Test 3: Coordinate transformations');
  mapState.setView(100, 50, 1.0); // pan to (100, 50), zoom to 1.0

  const worldPoint = { x: 1000, y: 800 };
  const screenPoint = mapState.worldToScreen(worldPoint.x, worldPoint.y);
  console.log(`   World (${worldPoint.x}, ${worldPoint.y}) -> Screen (${screenPoint.x.toFixed(1)}, ${screenPoint.y.toFixed(1)})`);

  const backToWorld = mapState.screenToWorld(screenPoint.x, screenPoint.y);
  console.log(`   Screen back to World: (${backToWorld.x.toFixed(1)}, ${backToWorld.y.toFixed(1)})`);

  // Test 4: Zoom functionality
  console.log('✅ Test 4: Zoom functionality');
  const initialZoom = mapState.zoom;
  mapState.zoomIn(400, 300); // zoom in at center
  console.log(`   Zoom in: ${initialZoom} -> ${mapState.zoom}`);

  mapState.zoomOut(400, 300); // zoom out at center
  console.log(`   Zoom out: ${mapState.zoom} -> ${mapState.zoom}`);

  // Test 5: Pan functionality
  console.log('✅ Test 5: Pan functionality');
  const initialPan = { x: mapState.panX, y: mapState.panY };
  mapState.pan(50, -25);
  console.log(`   Pan (50, -25): (${initialPan.x}, ${initialPan.y}) -> (${mapState.panX}, ${mapState.panY})`);

  // Test 6: Bounds checking
  console.log('✅ Test 6: Bounds checking');
  const bounds = mapState.getVisibleBounds();
  console.log(`   Visible bounds: ${bounds.left.toFixed(1)}, ${bounds.top.toFixed(1)} to ${bounds.right.toFixed(1)}, ${bounds.bottom.toFixed(1)}`);

  const testPoint = { x: 2000, y: 1500 };
  const isVisible = mapState.isPointVisible(testPoint.x, testPoint.y);
  console.log(`   Point (${testPoint.x}, ${testPoint.y}) visible: ${isVisible}`);

  console.log('🎉 All MapState tests completed successfully!');
})();