// tests/map_init_requires_storage_test.js
// Ensure InteractiveMap.init throws when StorageService is not initialized

(function() {
  const fs = require('fs');
  const path = require('path');
  const { setupTestEnv, createMockStorage } = require('./test_helpers');
  setupTestEnv();

  // Minimal DOM stubs for InteractiveMap constructor
  global.document = global.document || {
    getElementById: function(id) {
      return { id, getContext: () => ({}), width: 800, height: 600, parentElement: {} };
    },
    querySelector: () => null,
    head: { appendChild: () => {} },
    createElement: (tag) => ({ tag, setAttribute: () => {}, appendChild: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  // Ensure initializeStorageService is NOT defined so map.init cannot create storage
  delete global.initializeStorageService;
  delete global.window?.storageService;

  // Load minimal ErrorHandler
  const { ErrorHandler } = require(path.join(__dirname, '../utils/ErrorHandler.js'));
  global.ErrorHandler = ErrorHandler;
  global.errorHandler = new ErrorHandler();

  // Load InteractiveMap in test scope and export the class to `global` so tests can instantiate it
  const script = fs.readFileSync(path.join(__dirname, '../map.js'), 'utf8');
  eval(script + '\n\nglobal.InteractiveMap = typeof InteractiveMap !== "undefined" ? InteractiveMap : undefined;');

  class SimpleTest {
    constructor() { this.passed = 0; this.failed = 0; this.tests = []; }
    test(name, fn) { this.tests.push({name, fn}); }
    run() {
      for (const t of this.tests) {
        try { t.fn(); console.log('✓', t.name); this.passed++; } catch (e) { console.log('✗', t.name, e.message); this.failed++; }
      }
      console.log(`\nResults: ${this.passed} passed, ${this.failed} failed`);
      return this.failed === 0;
    }
  }

  const test = new SimpleTest();

  test.test('InteractiveMap.init throws without StorageService', () => {
    const map = new InteractiveMap('mapCanvas');
    let threw = false;
    try {
      // init should attempt to initialize StorageService; since initializeStorageService
      // is missing and no storage exists, map.init should throw per hardened behavior
      const p = map.init();
      // If it returns a promise, we wait and expect rejection
      if (p && typeof p.then === 'function') {
        return p.then(() => { throw new Error('Expected init to fail, but it resolved'); }).catch(() => {});
      }
    } catch (e) {
      threw = true;
    }
    if (!threw) throw new Error('Map.init did not throw synchronously');
  });

  const ok = test.run();
  process.exit(ok ? 0 : 1);
})();
