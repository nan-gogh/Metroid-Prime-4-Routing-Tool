// tests/selectionstate_refactored_test.js
// Simple test for refactored SelectionState (marker selection only)

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

  // Mock EventTypes
  global.EventTypes = {
    SELECTION_CHANGED: 'selection_changed',
    SELECTION_CLEARED: 'selection_cleared'
  };

  // Load dependencies
  const fs = require('fs');
  const path = require('path');

  // Load ErrorHandler first
  const errorHandlerScript = fs.readFileSync(path.join(__dirname, '../utils/ErrorHandler.js'), 'utf8');
  eval(errorHandlerScript);

  // Make ErrorHandler globally available
  global.ErrorHandler = eval('ErrorHandler');

  // Load SelectionState
  const script = fs.readFileSync(path.join(__dirname, '../state/SelectionState.js'), 'utf8');
  eval(script);

  // Make SelectionState globally available
  global.SelectionState = eval('SelectionState');

  class SelectionStateRefactoredTest {
    constructor() {
      this.tests = [];
      this.passed = 0;
      this.failed = 0;
    }

    test(name, fn) {
      this.tests.push({ name, fn });
    }

    run() {
      console.log('Running SelectionState refactored tests...\n');

      for (const test of this.tests) {
        try {
          test.fn();
          console.log('✓ ' + test.name);
          this.passed++;
        } catch (e) {
          console.log('✗ ' + test.name + ': ' + e.message);
          this.failed++;
        }
      }

      console.log(`\nResults: ${this.passed} passed, ${this.failed} failed`);
    }
  }

  const testSuite = new SelectionStateRefactoredTest();

  // Test basic marker selection
  testSuite.test('constructor initializes default state', () => {
    const state = new SelectionState();
    if (state.selectedMarker !== null) throw new Error('selectedMarker should be null');
    if (state.selectedMarkerLayer !== null) throw new Error('selectedMarkerLayer should be null');
    if (!(state.multiSelectedMarkers instanceof Set)) throw new Error('multiSelectedMarkers should be a Set');
  });

  testSuite.test('setSelectedMarker and clearSelectedMarker', () => {
    const state = new SelectionState();
    const mockMarker = { uid: 'test-marker' };

    // Set marker
    state.setSelectedMarker(mockMarker, 'test-layer');
    if (state.selectedMarker.uid !== 'test-marker') throw new Error('selectedMarker not set correctly');
    if (state.selectedMarkerLayer !== 'test-layer') throw new Error('selectedMarkerLayer not set correctly');

    // Clear marker
    state.clearSelectedMarker();
    if (state.selectedMarker !== null) throw new Error('selectedMarker not cleared');
    if (state.selectedMarkerLayer !== null) throw new Error('selectedMarkerLayer not cleared');
  });

  testSuite.test('isMarkerSelected', () => {
    const state = new SelectionState();
    const mockMarker1 = { uid: 'marker1' };
    const mockMarker2 = { uid: 'marker2' };

    state.setSelectedMarker(mockMarker1, 'layer1');

    if (!state.isMarkerSelected(mockMarker1, 'layer1')) throw new Error('should return true for selected marker');
    if (state.isMarkerSelected(mockMarker2, 'layer1')) throw new Error('should return false for different marker');
    if (state.isMarkerSelected(mockMarker1, 'layer2')) throw new Error('should return false for different layer');
  });

  testSuite.test('multi-selection support', () => {
    const state = new SelectionState();
    const mockMarker1 = { uid: 'marker1' };
    const mockMarker2 = { uid: 'marker2' };

    // Add to multi-selection
    state.addToMultiSelection(mockMarker1, 'layer1');
    state.addToMultiSelection(mockMarker2, 'layer1');

    if (state.multiSelectedMarkers.size !== 2) throw new Error('should have 2 markers in multi-selection');

    // Check if in multi-selection
    if (!state.isInMultiSelection(mockMarker1, 'layer1')) throw new Error('marker1 should be in multi-selection');
    if (!state.isInMultiSelection(mockMarker2, 'layer1')) throw new Error('marker2 should be in multi-selection');

    // Remove from multi-selection
    state.removeFromMultiSelection(mockMarker1, 'layer1');
    if (state.multiSelectedMarkers.size !== 1) throw new Error('should have 1 marker after removal');
    if (state.isInMultiSelection(mockMarker1, 'layer1')) throw new Error('marker1 should not be in multi-selection');

    // Clear multi-selection
    state.clearMultiSelection();
    if (state.multiSelectedMarkers.size !== 0) throw new Error('multi-selection should be empty after clear');
  });

  // Run the tests
  testSuite.run();

})();