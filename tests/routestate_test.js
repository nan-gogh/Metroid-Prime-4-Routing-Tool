// tests/routestate_test.js
// Comprehensive test suite for RouteState class

(function() {
  // Mock global MP4Config
  global.MP4Config = {
    ROUTE: {
      ANIMATION_SPEED: 150,
      LINE_WIDTH: 4
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

  // Load RouteState
  const fs = require('fs');
  const path = require('path');
  const script = fs.readFileSync(path.join(__dirname, '../state/RouteState.js'), 'utf8');
  eval(script);

  class RouteStateTest {
    constructor() {
      this.tests = [];
      this.passed = 0;
      this.failed = 0;
    }

    test(name, fn) {
      this.tests.push({ name, fn });
    }

    run() {
      this.errorHandler.logError('Running RouteState tests...\n', 'function');

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

  const test = new RouteStateTest();

  // Test constructor
  test.test('constructor initializes default state', () => {
    const state = new RouteState();
    test.assertEqual(state.currentRoute, null);
    test.assertEqual(state.routeLengthNormalized, 0);
    test.assert(Array.isArray(state._routeSources));
    test.assertEqual(state._routeSources.length, 0);
    test.assertEqual(state._computingRoute, false);
    test.assertEqual(state._computationProgress, 0);
    test.assertEqual(state._routeDashOffset, 0);
    test.assertEqual(state._routeRaf, null);
    test.assertEqual(state._lastRouteAnimTime, 0);
    test.assertEqual(state._routeAnimationSpeed, 150);
    test.assertEqual(state.routeLineWidth, 4);
    test.assertEqual(state.routeLooping, false);
    test.assertEqual(state._routeInsert, null);
    test.assertEqual(state._routePreview, null);
  });

  // Test route data management
  test.test('setRoute and clearRoute', () => {
    const state = new RouteState();
    const routeIndices = [0, 1, 2];
    const sources = [{ marker: { x: 0.1, y: 0.2 } }, { marker: { x: 0.3, y: 0.4 } }];

    state.setRoute(routeIndices, 0.75, sources);
    test.assertDeepEqual(state.currentRoute, routeIndices);
    test.assertEqual(state.routeLengthNormalized, 0.75);
    test.assertDeepEqual(state._routeSources, sources);

    state.clearRoute();
    test.assertEqual(state.currentRoute, null);
    test.assertEqual(state.routeLengthNormalized, 0);
    test.assertEqual(state._routeSources.length, 0);
  });

  test.test('route getters', () => {
    const state = new RouteState();
    const routeIndices = [0, 1, 2];
    const sources = [{ marker: { x: 0.1, y: 0.2 } }];

    state.setRoute(routeIndices, 0.5, sources);

    test.assertDeepEqual(state.getRoute(), routeIndices);
    test.assertEqual(state.getRouteLength(), 0.5);
    test.assertEqual(state.getRouteLengthPixels(8192), 4096);
    test.assertDeepEqual(state.getRouteSources(), sources);
  });

  // Test route computation state
  test.test('computation state management', () => {
    const state = new RouteState();

    state.setComputing(true);
    test.assertEqual(state.isComputing(), true);
    test.assertEqual(state.getComputationProgress(), 0);

    state.setComputationProgress(0.75);
    test.assertEqual(state.getComputationProgress(), 0.75);

    state.setComputing(false);
    test.assertEqual(state.isComputing(), false);
    test.assertEqual(state.getComputationProgress(), 0); // Reset when computation ends
  });

  // Test route animation state
  test.test('animation state management', () => {
    const state = new RouteState();

    state.setAnimationOffset(25);
    test.assertEqual(state.getAnimationOffset(), 25);

    state.setAnimationFrameId(42);
    test.assertEqual(state.getAnimationFrameId(), 42);

    state.setLastAnimationTime(123456);
    test.assertEqual(state.getLastAnimationTime(), 123456);

    state.setAnimationSpeed(200);
    test.assertEqual(state.getAnimationSpeed(), 200);
  });

  // Test route editing state
  test.test('route editing state', () => {
    const state = new RouteState();
    const insertState = { pointerId: 1, tempIndex: 2 };

    state.setRouteInsert(insertState);
    test.assertDeepEqual(state.getRouteInsert(), insertState);

    state.clearRouteInsert();
    test.assertEqual(state.getRouteInsert(), null);

    state.setRouteLooping(true);
    test.assertEqual(state.getRouteLooping(), true);

    state.setRouteLooping(false);
    test.assertEqual(state.getRouteLooping(), false);
  });

  // Test route preview state
  test.test('route preview state', () => {
    const state = new RouteState();
    const previewRoute = { indices: [0, 1], length: 0.3 };

    state.setRoutePreview(previewRoute);
    test.assertDeepEqual(state.getRoutePreview(), previewRoute);

    state.clearRoutePreview();
    test.assertEqual(state.getRoutePreview(), null);
  });

  // Test state persistence
  test.test('saveToStorage and loadFromStorage', () => {
    const state1 = new RouteState();

    state1.setRouteLooping(true);
    state1.setAnimationSpeed(250);
    state1.routeLineWidth = 5;

    state1.saveToStorage();

    const state2 = new RouteState();
    state2.loadFromStorage();

    test.assertEqual(state2.getRouteLooping(), true);
    test.assertEqual(state2.getAnimationSpeed(), 250);
    test.assertEqual(state2.routeLineWidth, 5);
  });

  // Test toJSON serialization
  test.test('toJSON serialization', () => {
    const state = new RouteState();
    const routeIndices = [0, 1, 2];
    const sources = [{ marker: { x: 0.1, y: 0.2 } }, { marker: { x: 0.3, y: 0.4 } }];

    state.setRoute(routeIndices, 0.6, sources);
    state.setComputing(true);
    state.setComputationProgress(0.8);
    state.setAnimationOffset(30);
    state.setRouteLooping(true);
    state.setRouteInsert({ tempIndex: 1 });
    state.setRoutePreview({ test: true });

    const json = state.toJSON();

    test.assertDeepEqual(json.currentRoute, routeIndices);
    test.assertEqual(json.routeLengthNormalized, 0.6);
    test.assertEqual(json.routeSourcesCount, 2);
    test.assertEqual(json.computingRoute, true);
    test.assertEqual(json.computationProgress, 0.8);
    test.assertEqual(json.routeDashOffset, 30);
    test.assertEqual(json.routeLooping, true);
    test.assertEqual(json.hasRouteInsert, true);
    test.assertEqual(json.hasRoutePreview, true);
  });

  // Test utility methods
  test.test('utility methods', () => {
    const state = new RouteState();

    // Empty state
    test.assertEqual(state.hasValidRoute(), false);
    test.assertEqual(state.getRouteWaypointCount(), 0);

    // With route
    const routeIndices = [0, 1, 2];
    const sources = [{ marker: { x: 0.1, y: 0.2 } }];
    state.setRoute(routeIndices, 0.5, sources);

    test.assertEqual(state.hasValidRoute(), true);
    test.assertEqual(state.getRouteWaypointCount(), 3);
  });

  // Test reset
  test.test('reset method', () => {
    const state = new RouteState();
    const routeIndices = [0, 1];
    const sources = [{ marker: { x: 0.1, y: 0.2 } }];

    state.setRoute(routeIndices, 0.5, sources);
    state.setComputing(true);
    state.setComputationProgress(0.7);
    state.setAnimationOffset(25);
    state.setAnimationFrameId(42);
    state.setLastAnimationTime(123);
    state.setRouteInsert({ tempIndex: 1 });
    state.setRouteLooping(true);
    state.setRoutePreview({ test: true });

    state.reset();

    test.assertEqual(state.currentRoute, null);
    test.assertEqual(state.routeLengthNormalized, 0);
    test.assertEqual(state._routeSources.length, 0);
    test.assertEqual(state.isComputing(), false);
    test.assertEqual(state.getComputationProgress(), 0);
    test.assertEqual(state.getAnimationOffset(), 0);
    test.assertEqual(state.getAnimationFrameId(), null);
    test.assertEqual(state.getLastAnimationTime(), 0);
    test.assertEqual(state.getRouteInsert(), null);
    test.assertEqual(state.getRouteLooping(), false);
    test.assertEqual(state.getRoutePreview(), null);
  });

  // Test error handling
  test.test('error handling in methods', () => {
    const state = new RouteState();

    // These should not throw errors even with invalid inputs
    state.setRoute(null, undefined, null);
    state.setComputing(undefined);
    state.setComputationProgress(NaN);
    state.setAnimationOffset(null);
    state.setRouteInsert(undefined);
    state.setRouteLooping(null);
    state.setRoutePreview(null);

    // State should remain valid - check each property individually
    test.assertEqual(state.currentRoute, null, 'currentRoute should be null');
    test.assertEqual(state.isComputing(), false, 'isComputing should return false');
    test.assertEqual(state.getRouteInsert(), null, 'getRouteInsert should return null');
    test.assertEqual(state.getRoutePreview(), null, 'getRoutePreview should return null');
  });

  // Run tests
  const success = test.run();
  process.exit(success ? 0 : 1);

})();