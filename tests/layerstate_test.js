// tests/layerstate_test.js
// Comprehensive test suite for LayerState class

(function() {
  // Include ErrorHandler for testing
  if (typeof ErrorHandler === 'undefined') {
    // Simple mock ErrorHandler for testing
    global.ErrorHandler = class ErrorHandler {
      logDebug() {}
      logError() {}
    };
  }

  // Mock global MP4Config
  global.MP4Config = {
    CUSTOM_MARKERS: {
      MAX_COUNT: 75
    },
    STORAGE_KEYS: {
      LAYER_STATE: 'mp4_layer_state',
      GRID_VISIBLE: 'mp4_grid_visible'
    }
  };

  // Mock Storage API
  global.Storage = function() {};

  // Mock localStorage for testing
  const mockLocalStorage = {
    data: {},
    getItem: function(key) { return this.data[key] || null; },
    setItem: function(key, value) { this.data[key] = value; },
    removeItem: function(key) { delete this.data[key]; },
    clear: function() { this.data = {}; }
  };
  global.localStorage = mockLocalStorage;

  // Mock checkStorageConsent function
  global.checkStorageConsent = function() { return true; };

  // Load LayerState
  const fs = require('fs');
  const path = require('path');
  const script = fs.readFileSync(path.join(__dirname, '../state/LayerState.js'), 'utf8');
  eval(script);

  class LayerStateTest {
    constructor() {
      this.tests = [];
      this.passed = 0;
      this.failed = 0;
    }

    test(name, fn) {
      this.tests.push({ name, fn });
    }

    run() {
      this.errorHandler.logError('Running LayerState tests...\n', 'function');

      for (const test of this.tests) {
        try {
          test.fn();
          console.log(`✓ ${test.name}`);
          this.passed++;
        } catch (e) {
          console.log(`✗ ${test.name}: ${e.message}`);
          this.failed++;
        }
      }

      console.log(`\nResults: ${this.passed} passed, ${this.failed} failed`);
      return this.failed === 0;
    }

    assert(condition, message = 'Assertion failed') {
      if (!condition) throw new Error(message);
    }

    assertEqual(a, b, message = 'Values not equal') {
      if (a !== b) throw new Error(`${message}: expected ${b}, got ${a}`);
    }

    assertDeepEqual(a, b, message = 'Objects not equal') {
      const aStr = JSON.stringify(a);
      const bStr = JSON.stringify(b);
      if (aStr !== bStr) throw new Error(`${message}: expected ${bStr}, got ${aStr}`);
    }
  }

  const test = new LayerStateTest();

  // Test constructor
  test.test('constructor initializes default state', () => {
    const layerKeys = ['route', 'customMarkers', 'energyTank'];
    const state = new LayerState(layerKeys);

    test.assertEqual(state.getTotalCount(), 4); // 3 provided + grid
    test.assert(state.isLayerVisible('route'));
    test.assert(state.isLayerVisible('customMarkers'));
    test.assert(state.isLayerVisible('energyTank'));
    test.assert(!state.isLayerVisible('grid')); // Grid should be hidden by default
    test.assertEqual(state.isHeatmapVisible(), false);
    test.assertEqual(state.getVisibleCount(), 3); // route, customMarkers, energyTank (grid is off)
  });

  // Test layer visibility
  test.test('setLayerVisible and isLayerVisible', () => {
    const state = new LayerState(['route', 'customMarkers']);

    state.setLayerVisible('customMarkers', false);
    test.assert(!state.isLayerVisible('customMarkers'));
    test.assert(state.isLayerVisible('route')); // Should remain visible

    state.setLayerVisible('customMarkers', true);
    test.assert(state.isLayerVisible('customMarkers'));
  });

  test.test('toggleLayer', () => {
    const state = new LayerState(['route', 'customMarkers']);

    test.assert(state.isLayerVisible('customMarkers'));
    state.toggleLayer('customMarkers');
    test.assert(!state.isLayerVisible('customMarkers'));
    state.toggleLayer('customMarkers');
    test.assert(state.isLayerVisible('customMarkers'));
  });

  // Test bulk operations
  test.test('showAllLayers and hideAllLayers', () => {
    const state = new LayerState(['route', 'customMarkers', 'energyTank']);

    // Hide some layers first
    state.setLayerVisible('customMarkers', false);
    state.setLayerVisible('energyTank', false);
    test.assertEqual(state.getVisibleCount(), 1); // only route always visible (grid is off by default)

    state.showAllLayers();
    test.assertEqual(state.getVisibleCount(), 4); // All visible

    state.hideAllLayers();
    test.assertEqual(state.getVisibleCount(), 1); // only route always visible
  });

  test.test('getVisibleLayers and getHiddenLayers', () => {
    const state = new LayerState(['route', 'customMarkers', 'energyTank']);

    state.setLayerVisible('customMarkers', false);
    state.setLayerVisible('energyTank', false);

    const visible = state.getVisibleLayers();
    const hidden = state.getHiddenLayers();

    test.assert(visible.includes('route'));
    test.assert(!visible.includes('grid')); // grid is now hidden by default
    test.assert(!visible.includes('customMarkers'));
    test.assert(!visible.includes('energyTank'));

    test.assert(hidden.includes('customMarkers'));
    test.assert(hidden.includes('energyTank'));
    test.assert(hidden.includes('grid')); // grid is now hidden by default
    test.assert(!hidden.includes('route'));
  });

  // Test special display states
  test.test('grid visibility', () => {
    const state = new LayerState(['route']);

    state.setGridVisible(false);
    test.assert(!state.isGridVisible());

    state.setGridVisible(true);
    test.assert(state.isGridVisible());
  });

  test.test('heatmap visibility', () => {
    const state = new LayerState(['route']);

    state.setHeatmapVisible(true);
    test.assert(state.isHeatmapVisible());

    state.setHeatmapVisible(false);
    test.assert(!state.isHeatmapVisible());
  });

  // Test layer counting
  test.test('layer counting methods', () => {
    const state = new LayerState(['route', 'customMarkers', 'energyTank']);

    test.assertEqual(state.getTotalCount(), 4); // 3 + grid
    test.assertEqual(state.getVisibleCount(), 3); // grid is off by default
    test.assertEqual(state.getHiddenCount(), 1); // grid is hidden

    state.setLayerVisible('customMarkers', false);
    state.setLayerVisible('energyTank', false);

    test.assertEqual(state.getVisibleCount(), 1); // only route (grid is off)
    test.assertEqual(state.getHiddenCount(), 3);
  });

  // Test layer configuration
  test.test('layer configuration', () => {
    const state = new LayerState(['route', 'customMarkers']);

    // Check default config
    const customConfig = state.getLayerConfig('customMarkers');
    test.assertEqual(customConfig.maxMarkers, 75); // From MP4Config

    // Set custom config
    state.setLayerConfig('customMarkers', { maxMarkers: 100, customProp: 'test' });
    const updatedConfig = state.getLayerConfig('customMarkers');
    test.assertEqual(updatedConfig.maxMarkers, 100);
    test.assertEqual(updatedConfig.customProp, 'test');

    // Test max markers getter
    test.assertEqual(state.getMaxMarkers('customMarkers'), 100);
    test.assertEqual(state.getMaxMarkers('nonexistent'), 0);
  });

  // Test bulk operations
  test.test('setMultipleLayers', () => {
    const state = new LayerState(['route', 'customMarkers', 'energyTank']);

    const newVisibility = {
      'customMarkers': false,
      'energyTank': false,
      'route': true // Should remain true
    };

    state.setMultipleLayers(newVisibility);

    test.assert(!state.isLayerVisible('customMarkers'));
    test.assert(!state.isLayerVisible('energyTank'));
    test.assert(state.isLayerVisible('route'));
  });

  // Test state persistence
  // test.test('saveToStorage and loadFromStorage', () => {
  //   const state1 = new LayerState(['route', 'customMarkers']);

  //   state1.setLayerVisible('customMarkers', false);
  //   state1.setHeatmapVisible(true);

  //   state1.saveToStorage();

  //   const state2 = new LayerState(['route', 'customMarkers']);
  //   state2.loadFromStorage();

  //   test.assert(!state2.isLayerVisible('customMarkers'), 'customMarkers should be hidden after loading');
  //   test.assert(state2.isHeatmapVisible(), 'heatmap should be visible after loading');
  // });

  // Test toJSON serialization
  test.test('toJSON serialization', () => {
    const state = new LayerState(['route', 'customMarkers']);

    state.setLayerVisible('customMarkers', false);
    state.setHeatmapVisible(true);

    const json = state.toJSON();

    test.assertEqual(json.showGridHeatmap, true);
    test.assertEqual(json.visibleCount, 1); // only route (grid is off by default)
    test.assertEqual(json.totalCount, 3); // route + customMarkers + grid
    test.assert(json.visibleLayers.includes('route'));
    test.assert(!json.visibleLayers.includes('grid')); // grid is off by default
    test.assert(json.hiddenLayers.includes('customMarkers'));
    test.assert(json.hiddenLayers.includes('grid')); // grid is off by default
  });

  // Test utility methods
  test.test('utility methods', () => {
    const state = new LayerState(['route']);

    test.assert(state.hasLayer('route'));
    test.assert(!state.hasLayer('nonexistent'));

    state.addLayer('newLayer', false);
    test.assert(state.hasLayer('newLayer'));
    test.assert(!state.isLayerVisible('newLayer'));

    state.removeLayer('newLayer');
    test.assert(!state.hasLayer('newLayer'));
  });

  // Test reset
  test.test('reset method', () => {
    const state = new LayerState(['route', 'customMarkers']);

    state.setLayerVisible('customMarkers', false);
    state.setHeatmapVisible(true);
    state.setLayerConfig('customMarkers', { maxMarkers: 200 });

    state.reset();

    test.assert(state.isLayerVisible('route'));
    test.assert(state.isLayerVisible('customMarkers')); // Should be reset to visible
    test.assert(!state.isHeatmapVisible()); // Should be reset to false
    test.assertEqual(state.getMaxMarkers('customMarkers'), 75); // Should be reset to config default
  });

  // Test error handling
  test.test('error handling in methods', () => {
    const state = new LayerState(['route']);
    const initialCount = state.getTotalCount();

    // These should not throw errors even with invalid inputs
    state.setLayerVisible(null, undefined);
    state.toggleLayer(undefined);
    state.isLayerVisible(null);
    state.getLayerConfig(null);
    state.setLayerConfig(null, null);
    state.addLayer(null, null); // Should not add invalid layer
    state.removeLayer(null);

    // State should remain valid - count should be unchanged
    test.assertEqual(state.getTotalCount(), initialCount);
    test.assert(state.isLayerVisible('route'));
  });

  // Run tests
  const success = test.run();
  process.exit(success ? 0 : 1);

})();