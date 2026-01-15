// tests/selectionstate_test.js
// Comprehensive test suite for SelectionState class

(function() {
  // Mock global MP4Config
  global.MP4Config = {
    MAP_SIZE: 8192,
    MIN_ZOOM: 0.1,
    MAX_ZOOM: 10.0
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

  // Mock LAYERS for testing
  global.LAYERS = {
    route: { color: '#ff0000' },
    customMarkers: { color: '#00ff00' }
  };

  // Load dependencies
  const fs = require('fs');
  const path = require('path');

  // Load ErrorHandler first
  const errorHandlerScript = fs.readFileSync(path.join(__dirname, '../utils/ErrorHandler.js'), 'utf8');
  eval(errorHandlerScript);

  // Make ErrorHandler globally available
  global.ErrorHandler = ErrorHandler;

  // Load SelectionState
  const script = fs.readFileSync(path.join(__dirname, '../state/SelectionState.js'), 'utf8');
  eval(script);

  class SelectionStateTest {
    constructor() {
      this.tests = [];
      this.passed = 0;
      this.failed = 0;
    }

    test(name, fn) {
      this.tests.push({ name, fn });
    }

    run() {
      console.log('Running SelectionState tests...\n');

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

  const test = new SelectionStateTest();

  // Test constructor
  test.test('constructor initializes default state', () => {
    const state = new SelectionState();
    test.assertEqual(state.selectedMarker, null);
    test.assertEqual(state.selectedMarkerLayer, null);
    test.assertEqual(state.editMarkersMode, false);
    test.assertEqual(state.editRouteMode, false);
    test.assert(state.highlightedLayers instanceof Set);
    test.assertEqual(state.highlightedLayers.size, 0);
  });

  // Test marker selection
  test.test('setSelectedMarker and clearSelectedMarker', () => {
    const state = new SelectionState();
    const marker = { uid: 'test-marker', x: 0.5, y: 0.5 };

    state.setSelectedMarker(marker, 'customMarkers');
    test.assertEqual(state.selectedMarker, marker);
    test.assertEqual(state.selectedMarkerLayer, 'customMarkers');

    state.clearSelectedMarker();
    test.assertEqual(state.selectedMarker, null);
    test.assertEqual(state.selectedMarkerLayer, null);
  });

  test.test('isMarkerSelected', () => {
    const state = new SelectionState();
    const marker1 = { uid: 'marker1', x: 0.5, y: 0.5 };
    const marker2 = { uid: 'marker2', x: 0.3, y: 0.7 };

    state.setSelectedMarker(marker1, 'customMarkers');

    test.assert(state.isMarkerSelected(marker1, 'customMarkers'));
    test.assert(!state.isMarkerSelected(marker2, 'customMarkers'));
    test.assert(!state.isMarkerSelected(marker1, 'route'));
  });

  // Test edit modes
  test.test('setEditMarkersMode and setEditRouteMode', () => {
    const state = new SelectionState();

    state.setEditMarkersMode(true);
    test.assertEqual(state.editMarkersMode, true);
    test.assertEqual(state.editRouteMode, false);

    state.setEditRouteMode(true);
    test.assertEqual(state.editMarkersMode, false); // Should be disabled
    test.assertEqual(state.editRouteMode, true);

    state.setEditMarkersMode(true);
    test.assertEqual(state.editMarkersMode, true);
    test.assertEqual(state.editRouteMode, false); // Should be disabled
  });

  test.test('isInEditMode and getCurrentEditMode', () => {
    const state = new SelectionState();

    test.assertEqual(state.isInEditMode(), false);
    test.assertEqual(state.getCurrentEditMode(), null);

    state.setEditMarkersMode(true);
    test.assertEqual(state.isInEditMode(), true);
    test.assertEqual(state.getCurrentEditMode(), 'markers');

    state.setEditRouteMode(true);
    test.assertEqual(state.isInEditMode(), true);
    test.assertEqual(state.getCurrentEditMode(), 'route');
  });

  // Test layer highlighting
  test.test('setLayerHighlight and toggleLayerHighlight', () => {
    const state = new SelectionState();

    state.setLayerHighlight('route', true);
    test.assert(state.isLayerHighlighted('route'));
    test.assert(!state.isLayerHighlighted('customMarkers'));

    state.setLayerHighlight('route', false);
    test.assert(!state.isLayerHighlighted('route'));

    state.toggleLayerHighlight('customMarkers');
    test.assert(state.isLayerHighlighted('customMarkers'));

    state.toggleLayerHighlight('customMarkers');
    test.assert(!state.isLayerHighlighted('customMarkers'));
  });

  test.test('clearAllHighlights', () => {
    const state = new SelectionState();

    state.setLayerHighlight('route', true);
    state.setLayerHighlight('customMarkers', true);
    state.setLayerHighlight('energyTank', true);

    test.assertEqual(state.highlightedLayers.size, 3);

    state.clearAllHighlights();
    test.assertEqual(state.highlightedLayers.size, 0);
  });

  // Test state persistence
  test.test('saveToStorage and loadFromStorage', () => {
    const state1 = new SelectionState();

    state1.setLayerHighlight('route', true);
    state1.setLayerHighlight('customMarkers', true);
    state1.setEditMarkersMode(true);

    state1.saveToStorage();

    const state2 = new SelectionState();
    state2.loadFromStorage();

    test.assert(state2.isLayerHighlighted('route'));
    test.assert(state2.isLayerHighlighted('customMarkers'));
    test.assert(!state2.isLayerHighlighted('energyTank'));
    test.assertEqual(state2.editMarkersMode, true);
    test.assertEqual(state2.editRouteMode, false);
  });

  // Test toJSON serialization
  test.test('toJSON serialization', () => {
    const state = new SelectionState();
    const marker = { uid: 'test-marker', x: 0.5, y: 0.5 };

    state.setSelectedMarker(marker, 'customMarkers');
    state.setLayerHighlight('route', true);
    state.setEditRouteMode(true);

    const json = state.toJSON();

    test.assertDeepEqual(json.selectedMarker, { uid: 'test-marker', x: 0.5, y: 0.5 });
    test.assertEqual(json.selectedMarkerLayer, 'customMarkers');
    test.assertEqual(json.editMarkersMode, false);
    test.assertEqual(json.editRouteMode, true);
    test.assertDeepEqual(json.highlightedLayers, ['route']);
  });

  // Test reset
  test.test('reset method', () => {
    const state = new SelectionState();
    const marker = { uid: 'test-marker', x: 0.5, y: 0.5 };

    state.setSelectedMarker(marker, 'customMarkers');
    state.setLayerHighlight('route', true);
    state.setEditMarkersMode(true);

    state.reset();

    test.assertEqual(state.selectedMarker, null);
    test.assertEqual(state.selectedMarkerLayer, null);
    test.assertEqual(state.editMarkersMode, false);
    test.assertEqual(state.editRouteMode, false);
    test.assertEqual(state.highlightedLayers.size, 0);
  });

  // Test error handling
  test.test('error handling in methods', () => {
    const state = new SelectionState();

    // These should not throw errors even with invalid inputs
    state.setSelectedMarker(null, undefined);
    state.setLayerHighlight(null, true);
    state.toggleLayerHighlight(undefined);
    state.isMarkerSelected(null, null);
    state.isLayerHighlighted(null);

    // State should remain valid
    test.assertEqual(state.selectedMarker, null);
    test.assertEqual(state.selectedMarkerLayer, null);
  });

  // Run tests
  const success = test.run();
  process.exit(success ? 0 : 1);

})();