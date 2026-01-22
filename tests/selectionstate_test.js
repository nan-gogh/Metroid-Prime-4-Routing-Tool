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

  // Mock storage (StorageService-like) for testing - provides get/set/remove
  const mockStorage = {
    data: {},
    get: function(key) { return (key in this.data) ? this.data[key] : null; },
    set: function(key, value) { this.data[key] = value; },
    remove: function(key) { delete this.data[key]; },
    clear: function() { this.data = {}; }
  };

  // Mock LAYERS for testing
  global.LAYERS = {
    route: { color: '#ff0000' },
    customMarkers: { color: '#00ff00' }
  };

  // Load dependencies
  const fs = require('fs');
  const path = require('path');

  // Load ErrorHandler module and make available
  const { ErrorHandler } = require(path.join(__dirname, '../utils/ErrorHandler.js'));
  global.ErrorHandler = ErrorHandler;
  // Provide an ErrorHandler instance for tests
  global.errorHandler = new ErrorHandler();

  // Load SelectionState
  // Ensure BaseStateManager is loaded (SelectionState depends on it)
  const { setupTestEnv } = require('./test_helpers');
  setupTestEnv();
    // Read and eval the SelectionState source with a local BaseStateManager binding
    const script = fs.readFileSync(path.join(__dirname, '../state/SelectionState.js'), 'utf8');
    // Extract the class body so we can eval it in the current test module scope
    const classStart = script.indexOf('class SelectionState');
    const registerMarker = '\n  // Register globally';
    const registerIndex = script.indexOf(registerMarker, classStart);
    let classSource;
    if (classStart !== -1 && registerIndex !== -1) {
      classSource = script.substring(classStart, registerIndex);
    } else {
      classSource = script;
    }

    // Provide a local BaseStateManager binding and evaluate the class
    const BaseStateManager = global.BaseStateManager;
    var SelectionState;
    eval(classSource);
    // Register on global for tests to access
    global.SelectionState = SelectionState;
  // SelectionState is registered on `global` by the evaluated module

  class SelectionStateTest {
    constructor() {
      this.tests = [];
      this.passed = 0;
      this.failed = 0;
      this.errorHandler = (typeof global !== 'undefined' && global.errorHandler) ? global.errorHandler : new ErrorHandler();
    }

    test(name, fn) {
      this.tests.push({ name, fn });
    }

    run() {
      this.errorHandler.logError('Running SelectionState tests...\n', 'function');

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
    const state = new SelectionState({}, { storage: mockStorage, errorHandler: ErrorHandler });
    test.assertEqual(state.selectedMarker, null);
    test.assertEqual(state.selectedMarkerLayer, null);
    test.assert(state.multiSelectedMarkers instanceof Set);
    test.assertEqual(state.multiSelectedMarkers.size, 0);
  });

  // Test marker selection
  test.test('setSelectedMarker and clearSelectedMarker', () => {
    const state = new SelectionState({}, { storage: mockStorage, errorHandler: ErrorHandler });
    const marker = { uid: 'test-marker', x: 0.5, y: 0.5 };

    state.setSelectedMarker(marker, 'customMarkers');
    test.assertEqual(state.selectedMarker, marker);
    test.assertEqual(state.selectedMarkerLayer, 'customMarkers');

    state.clearSelectedMarker();
    test.assertEqual(state.selectedMarker, null);
    test.assertEqual(state.selectedMarkerLayer, null);
  });

  test.test('isMarkerSelected', () => {
    const state = new SelectionState({}, { storage: mockStorage, errorHandler: ErrorHandler });
    const marker1 = { uid: 'marker1', x: 0.5, y: 0.5 };
    const marker2 = { uid: 'marker2', x: 0.3, y: 0.7 };

    state.setSelectedMarker(marker1, 'customMarkers');

    test.assert(state.isMarkerSelected(marker1, 'customMarkers'));
    test.assert(!state.isMarkerSelected(marker2, 'customMarkers'));
    test.assert(!state.isMarkerSelected(marker1, 'route'));
  });

  // Note: Edit mode and layer highlighting moved to EditModeState and LayerState.

  // Test state persistence (selection-specific)
  test.test('saveToStorage and loadFromStorage', () => {
    const state1 = new SelectionState({}, { storage: mockStorage, errorHandler: ErrorHandler });

    state1.addToMultiSelection({ uid: 'm1' }, 'route');
    state1.addToMultiSelection({ uid: 'm2' }, 'customMarkers');

    state1.saveToStorage();

    const state2 = new SelectionState({}, { storage: mockStorage, errorHandler: ErrorHandler });
    state2.loadFromStorage();

    test.assert(state2.isInMultiSelection({ uid: 'm1' }, 'route'));
    test.assert(state2.isInMultiSelection({ uid: 'm2' }, 'customMarkers'));
    test.assertEqual(state2.getMultiSelectedCount(), 2);
  });

  // Test toJSON serialization
  test.test('toJSON serialization', () => {
    const state = new SelectionState({}, { storage: mockStorage, errorHandler: ErrorHandler });
    const marker = { uid: 'test-marker', x: 0.5, y: 0.5 };

    state.setSelectedMarker(marker, 'customMarkers');
    state.addToMultiSelection({ uid: 'm1' }, 'route');

    const json = state.toJSON();

    test.assertDeepEqual(json.selectedMarker, { uid: 'test-marker', x: 0.5, y: 0.5 });
    test.assertEqual(json.selectedMarkerLayer, 'customMarkers');
    test.assertDeepEqual(json.multiSelectedMarkers, ['route:m1']);
  });

  // Test reset
  test.test('reset method', () => {
    const state = new SelectionState({}, { storage: mockStorage, errorHandler: ErrorHandler });
    const marker = { uid: 'test-marker', x: 0.5, y: 0.5 };

    state.setSelectedMarker(marker, 'customMarkers');
    state.addToMultiSelection({ uid: 'm1' }, 'route');

    state.reset();

    test.assertEqual(state.selectedMarker, null);
    test.assertEqual(state.selectedMarkerLayer, null);
    test.assertEqual(state.getMultiSelectedCount(), 0);
  });

  // Test error handling
  test.test('error handling in methods', () => {
    const state = new SelectionState({}, { storage: mockStorage, errorHandler: ErrorHandler });

    // These should not throw errors even with invalid inputs
    state.setSelectedMarker(null, undefined);
    state.addToMultiSelection(null, null);
    state.removeFromMultiSelection(null, null);
    state.isMarkerSelected(null, null);
    state.isInMultiSelection(null, null);

    // State should remain valid
    test.assertEqual(state.selectedMarker, null);
    test.assertEqual(state.selectedMarkerLayer, null);
  });

  // Run tests
  const success = test.run();
  process.exit(success ? 0 : 1);

})();