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

  // Mock storage (StorageService-like) for testing
  const mockStorage = {
    data: {},
    get: function(key) { return (key in this.data) ? this.data[key] : null; },
    set: function(key, value) { this.data[key] = value; },
    remove: function(key) { delete this.data[key]; },
    clear: function() { this.data = {}; }
  };

  // Mock EventTypes
  global.EventTypes = {
    SELECTION_CHANGED: 'selection_changed',
    SELECTION_CLEARED: 'selection_cleared'
  };

  // Load dependencies
  const fs = require('fs');
  const path = require('path');

  // Load ErrorHandler first
  // Load ErrorHandler module and make available
  const { ErrorHandler } = require(path.join(__dirname, '../utils/ErrorHandler.js'));
  global.ErrorHandler = ErrorHandler;
  // Provide an ErrorHandler instance for tests
  global.errorHandler = new ErrorHandler();

  // Load SelectionState
  // Ensure BaseStateManager is loaded (SelectionState depends on it)
  require(path.join(__dirname, '../state/BaseStateManager.js'));
  // Read and eval the SelectionState source with a local BaseStateManager binding
  const script = fs.readFileSync(path.join(__dirname, '../state/SelectionState.js'), 'utf8');
  // Extract the class body and eval it in the test scope so BaseStateManager is visible
  const classStart = script.indexOf('class SelectionState');
  const registerMarker = '\n  // Register globally';
  const registerIndex = script.indexOf(registerMarker, classStart);
  let classSource;
  if (classStart !== -1 && registerIndex !== -1) {
    classSource = script.substring(classStart, registerIndex);
  } else {
    classSource = script;
  }

  const BaseStateManager = global.BaseStateManager;
  var SelectionState;
  eval(classSource);
  global.SelectionState = SelectionState;

  class SelectionStateRefactoredTest {
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
      this.errorHandler.logError('Running SelectionState refactored tests...\n', 'SelectionState');

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
    const state = new global.SelectionState({}, { storage: mockStorage, errorHandler: ErrorHandler });
    if (state.selectedMarker !== null) throw new Error('selectedMarker should be null');
    if (state.selectedMarkerLayer !== null) throw new Error('selectedMarkerLayer should be null');
    if (!(state.multiSelectedMarkers instanceof Set)) throw new Error('multiSelectedMarkers should be a Set');
  });

  testSuite.test('setSelectedMarker and clearSelectedMarker', () => {
    const state = new global.SelectionState({}, { storage: mockStorage, errorHandler: ErrorHandler });
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
    const state = new global.SelectionState({}, { storage: mockStorage, errorHandler: ErrorHandler });
    const mockMarker1 = { uid: 'marker1' };
    const mockMarker2 = { uid: 'marker2' };

    state.setSelectedMarker(mockMarker1, 'layer1');

    if (!state.isMarkerSelected(mockMarker1, 'layer1')) throw new Error('should return true for selected marker');
    if (state.isMarkerSelected(mockMarker2, 'layer1')) throw new Error('should return false for different marker');
    if (state.isMarkerSelected(mockMarker1, 'layer2')) throw new Error('should return false for different layer');
  });

  testSuite.test('multi-selection support', () => {
    const state = new SelectionState({}, { storage: mockStorage, errorHandler: ErrorHandler });
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