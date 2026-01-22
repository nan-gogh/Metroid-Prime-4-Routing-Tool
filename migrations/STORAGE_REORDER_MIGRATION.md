STORAGE REORDER MIGRATION

Goal
- Remove runtime storage fallbacks and enforce a clear init order: initialize StorageService first, create StorageServiceProvider from it, then construct state managers and controllers.
- Provide an incremental, reversible patch series so maintainers can apply, test, and rollback each step.

General notes
- Work on a feature branch and run the app between steps.
- Keep changes small and test after each patch.
- This migration touches `map.js` primarily; other constructors may be adjusted later.

Prerequisites
- Ensure all controller files are present (they are loaded dynamically in `map.js`).
- Tests should be runnable in the dev environment.

Apply pattern
- Each step below includes an "apply_patch" style diff snippet. You can apply them with the repository's normal workflow; the CLI steps show how to apply using git or by copying the diff into the `apply_patch` tool used by the automation.

Step 1 — Make provider stable (no-op provider in constructor)
- Goal: ensure `InteractiveMap` constructor creates an inert `storageProvider` object but does NOT create state managers that depend on storage. This reduces the initial surface area.
- Test: app must construct without errors; state managers will be null until `init()` runs.

Patch (apply first):
*** Begin Patch
*** Update File: map.js
@@
-        // Initialize storage provider for dependency injection (preferred) with legacy fallbacks
-        try {
-            let globalStorage = (typeof window !== 'undefined' && window.storageProvider && typeof window.storageProvider.getInstance === 'function') ? window.storageProvider.getInstance() : (typeof window !== 'undefined' ? window.storageService : null);
-            if (typeof StorageServiceProvider !== 'undefined') {
-                this.storageProvider = new StorageServiceProvider(globalStorage, this.errorHandler);
-            } else {
-                // Fallback minimal provider that wraps an internal instance
-                (function() {
-                    let _inst = globalStorage;
-                    this.storageProvider = {
-                        getInstance: function() { return _inst; },
-                        setInstance: function(s) { _inst = s; }
-                    };
-                }).call(this);
-            }
-            if (typeof window !== 'undefined') window.storageProvider = this.storageProvider;
-            // Propagate resolved storage instance to legacy utilities that support injection
-            try {
-                const resolved = this._getStorageInstance();
-                if (typeof MarkerUtils !== 'undefined' && MarkerUtils && typeof MarkerUtils.setStorageInstance === 'function') {
-                    try { MarkerUtils.setStorageInstance(resolved); } catch (e) { this.errorHandler.logWarning && this.errorHandler.logWarning(e, 'InteractiveMap.constructor.injectMarkerUtilsStorage'); }
-                }
-            } catch (e) { /* best-effort */ }
-        } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.constructor.storageProvider', { message: 'Failed to initialize storageProvider' }); }
+        // Initialize an inert storage provider placeholder. Real provider and state
+        // managers will be created in `init()` after StorageService is initialized.
+        try {
+            this.storageProvider = {
+                getInstance: function() { return null; },
+                setInstance: function(s) { this._inst = s; }
+            };
+            if (typeof window !== 'undefined') window.storageProvider = this.storageProvider;
+        } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.constructor.storageProvider', { message: 'Failed to create placeholder storageProvider' }); }
@@
-        // Initialize state managers
-        this.mapState = new MapState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
-        this.selectionState = new SelectionState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
-        this.editModeState = new EditModeState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
-        this.highlightState = new HighlightState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
-        this.tilesetState = new TilesetState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
-        this.routeAnimationState = new RouteAnimationState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
-        this.routeEditState = new RouteEditState({ eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
-        this.dragState = new DragState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
-        this.layerState = new LayerState(Object.keys(LAYERS || {}), MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
-        this.heatmapDisplayState = new HeatmapDisplayState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
-        this.imageState = new ImageState(MP4Config, this.tilesetState, this.mapState, { errorHandler: this.errorHandler });
+        // State managers will be created in `init()` when storageProvider is available.
+        this.mapState = null;
+        this.selectionState = null;
+        this.editModeState = null;
+        this.highlightState = null;
+        this.tilesetState = null;
+        this.routeAnimationState = null;
+        this.routeEditState = null;
+        this.dragState = null;
+        this.layerState = null;
+        this.heatmapDisplayState = null;
+        this.imageState = null;
*** End Patch

Notes
- This step reduces constructor-side work; it must be followed by Step 2 which creates state managers in `init()`.

Step 2 — Initialize StorageService early and create provider + state managers in `init()`
- Goal: move state manager construction into `init()` after calling `initializeStorageService()` and creating `StorageServiceProvider` from the initialized instance.
- Test: after applying, the app should create state managers during `init()` and no code should expect them earlier.

Patch (apply second):
*** Begin Patch
*** Update File: map.js
@@
     async init() {
-        // Ensure StorageService is initialized early so provider-backed constructors
-        // receive a real storage instance before controllers/managers are created.
-        try {
-            if (typeof initializeStorageService !== 'undefined') {
-                const consentChecker = () => {
-                    try {
-                        const inst = (this.storageProvider && typeof this.storageProvider.getInstance === 'function') ? this.storageProvider.getInstance() : ((typeof window !== 'undefined' && window.storageProvider && typeof window.storageProvider.getInstance === 'function') ? window.storageProvider.getInstance() : null);
-                        if (inst && typeof inst.hasConsent === 'function') return inst.hasConsent();
-                    } catch (__) {}
-                    return false;
-                };
-                initializeStorageService(consentChecker, this.errorHandler, this.eventBus);
-                try {
-                    // (legacy reference removed) previously used a global storage accessor here
-                    if (initializedSvc) {
-                        if (typeof StorageServiceProvider !== 'undefined') {
-                            try { this.storageProvider = new StorageServiceProvider(initializedSvc, this.errorHandler); if (typeof window !== 'undefined') window.storageProvider = this.storageProvider; } catch (err) { this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(err, 'InteractiveMap.init.earlySetProvider'); }
-                        } else if (this.storageProvider && typeof this.storageProvider.setInstance === 'function') {
-                            try { this.storageProvider.setInstance(initializedSvc); if (typeof window !== 'undefined' && window.storageProvider && typeof window.storageProvider.setInstance === 'function') window.storageProvider.setInstance(initializedSvc); } catch (err) { this.errorHandler && this.errorHandler.logWarning && this.errorHandler.logWarning(err, 'InteractiveMap.init.earlySetProvider.setInstance'); }
-                        }
-                    }
-                } catch (__) { /* best-effort */ }
-            }
-        } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init.StorageServiceEarly', { message: 'Failed to initialize StorageService early' }); }
+        // Initialize StorageService first, then create provider and state managers.
+        try {
+            if (typeof initializeStorageService !== 'undefined') {
+                // Initialize synchronously via initializeStorageService()
+                const consentChecker = () => false; // conservative default; ConsentManager can update later
+                initializeStorageService(consentChecker, this.errorHandler, this.eventBus);
+            }
+        } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init.StorageServiceEarly', { message: 'Failed to initialize StorageService early' }); }
+
+        // Create provider from initialized StorageService
+        try {
+            const initializedSvc = (typeof window !== 'undefined' && window.storageService) ? window.storageService : null;
+            if (initializedSvc) {
+                if (typeof StorageServiceProvider !== 'undefined') {
+                    this.storageProvider = new StorageServiceProvider(initializedSvc, this.errorHandler);
+                } else if (this.storageProvider && typeof this.storageProvider.setInstance === 'function') {
+                    this.storageProvider.setInstance(initializedSvc);
+                }
+                if (typeof window !== 'undefined') window.storageProvider = this.storageProvider;
+            }
+        } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init.StorageServiceProviderCreate'); }
+
+        // Create state managers now that provider is available
+        try {
+            this.mapState = new MapState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
+            this.selectionState = new SelectionState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
+            this.editModeState = new EditModeState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
+            this.highlightState = new HighlightState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
+            this.tilesetState = new TilesetState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
+            this.routeAnimationState = new RouteAnimationState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
+            this.routeEditState = new RouteEditState({ eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
+            this.dragState = new DragState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
+            this.layerState = new LayerState(Object.keys(LAYERS || {}), MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
+            this.heatmapDisplayState = new HeatmapDisplayState(MP4Config, { eventBus: this.eventBus, errorHandler: this.errorHandler, storageProvider: this.storageProvider });
+            this.imageState = new ImageState(MP4Config, this.tilesetState, this.mapState, { errorHandler: this.errorHandler });
+        } catch (e) { moduleErrorHandler && moduleErrorHandler.logWarning(e, 'InteractiveMap.init.createStateManagers'); }
*** End Patch

Notes
- This step must run before any code that reads `this.mapState` or similar during initialization.
- Replace `consentChecker` with a better synchronous implementation later (Step 3).

Step 3 — Make Consent handling deterministic and enable StorageService.hasConsent
- Goal: ensure `initializeStorageService()` can be called before `ConsentManager` safely (i.e., a `consentChecker` that reads persisted consent or a default false that `ConsentManager` flips later).
- Actions:
  - Ensure `initializeStorageService()` returns/sets `window.storageService` immediately (already true in `data/StorageService.js`).
  - If your consent persistence lives in storage itself, use a lightweight default consentChecker that reads `localStorage` directly or a tiny cookie. Alternatively, pass a default function that returns false and have `ConsentManager` update `StorageService`.

Step 4 — Remove legacy fallbacks and global accessors
- After verifying app stability and tests pass, systematically remove legacy `window.storageService` reads across the codebase and require `storageProvider` everywhere.
- Tests: run unit tests and manual smoke tests.

Step 5 — Cleanup and harden
- Replace synchronous consentChecker with final implementation.
- Remove any temporary placeholder provider code.
- Add tests asserting that constructors reject missing `storageProvider` (or explicitly require it).

Rollback strategy
- Each patch is additive; use `git checkout -- path` or `git revert` to rollback any applied commit.

Questions or next actions
- I can produce the actual `apply_patch` calls and apply Step 1 and Step 2 now, or I can generate individual patch files per step in `migrations/` so you can apply them manually. Which do you prefer?
