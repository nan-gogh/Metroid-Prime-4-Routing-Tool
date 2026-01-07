// Pure Canvas-based Interactive Map

const MAP_SIZE = 8192;
const RESOLUTIONS = [256, 512, 1024, 2048, 4096, 8192];
// Default zoom limits; `minZoom` is computed per-device in `resize()`
const DEFAULT_MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const DEFAULT_ZOOM = 0.1;

class InteractiveMap {
    constructor(canvasId) {
        // Overlay canvas (interactive) — keep `this.canvas`/`this.ctx` for
        // backwards compatibility with existing code.
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // Background tile canvas (non-interactive). May be null if the
        // element is not present; later tasks will render tiles into this
        // context and leave the overlay for routes/markers.
        this.canvasTiles = document.getElementById('mapTiles');
        this.ctxTiles = this.canvasTiles ? this.canvasTiles.getContext('2d') : null;
        
        // Map state
        this.zoom = DEFAULT_ZOOM;
        this.panX = 0;
        this.panY = 0;
        
        // Interaction state
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.pointerDownTime = 0;
        this.minClickDuration = 150; // ms - threshold for distinguishing drag from click
        // Pointer/touch state
        this.pointers = new Map(); // pointerId -> {x,y,clientX,clientY,downTime}
        this.pinch = null; // {startDistance, startZoom}
        
        
        // Images cache
        this.images = {};
        this.currentImage = null;
        this.currentResolution = 0;
        this.loadingResolution = null;
        // Internal trackers for robust tile loading and cancellation
        this._tilesetGeneration = 0; // increment on tileset/grayscale change
        this._imageControllers = {}; // AbortController per resolution
        this._imageElements = {}; // IMG elements in-flight per resolution
        this._imageBitmaps = {}; // ImageBitmap objects stored per resolution
        this._preloadLinks = []; // Optional <link> elements created for preload/prefetch
        // Bitmap decoding concurrency control to avoid overwhelming decoders
        this._bitmapLimit = 2;
        this._bitmapActive = 0;
        this._bitmapQueue = [];
        this._bitmapTimeoutMs = 15000; // timeout for bitmap decode tasks
        // Detect low-spec devices and reduce concurrency / preloads conservatively
        this._lowSpec = false;
        try {
            const dm = (typeof navigator !== 'undefined' && navigator.deviceMemory) ? Number(navigator.deviceMemory) : null;
            const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? Number(navigator.hardwareConcurrency) : null;
            if ((dm !== null && !Number.isNaN(dm) && dm <= 1.5) || (hc !== null && !Number.isNaN(hc) && hc <= 2)) {
                this._lowSpec = true;
                this._bitmapLimit = 1;
            }
        } catch (e) {}

    // Loop Route toggle: explicit control for closing/opening computed/manual routes
    try {
        const loopBtn = document.getElementById('loopRouteBtn');
        const updateLoopUI = () => {
            if (!loopBtn) return;
            try { loopBtn.setAttribute('aria-pressed', map.routeLooping ? 'true' : 'false'); } catch (e) {}
        };
        if (loopBtn) {
            loopBtn.addEventListener('click', () => {
                map.routeLooping = !map.routeLooping;
                try {
                    if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                        window._mp4Storage.saveSetting('mp4_route_looping_flag', map.routeLooping ? '1' : '0');
                    } else {
                        try { localStorage.setItem('mp4_route_looping_flag', map.routeLooping ? '1' : '0'); } catch (e) {}
                    }
                } catch (e) {}
                try { map.render(); } catch (e) {}
                updateLoopUI();
            });
        }
        updateLoopUI();
    } catch (e) {}
        
        // Markers
        this.markers = [];
        this.customMarkers = (LAYERS && LAYERS.customMarkers && Array.isArray(LAYERS.customMarkers.markers)) ? LAYERS.customMarkers.markers : [];
        // Current route: array of marker indices in `this.markers` order (or null)
        this.currentRoute = null;
        this.currentRouteLength = 0;
        // Route animation state
        this._routeDashOffset = 0; // px offset used for animated dashes
        this._routeRaf = null; // requestAnimationFrame id
        this._lastRouteAnimTime = 0;
        this._routeAnimationSpeed = 100; // pixels per second
        // Configurable route stroke width (CSS pixels). Multiply by `zoom` in render.
        this.routeLineWidth = 20; // default base stroke width
        this.hoveredMarker = null;
        this.hoveredMarkerLayer = null; // layer key identifying which LAYERS entry the hovered marker belongs to
        // Selected marker (toggled by click/tap) — used to show persistent tooltip
        this.selectedMarker = null;
        this.selectedMarkerLayer = null;
        // Dragging state for custom markers
        this._draggingMarker = null; // { uid, layerKey, pointerId, offsetX, offsetY }
        this._draggingCandidate = null; // temporary candidate before movement threshold
        
        // Layer visibility state (runtime UI state, separate from data)
        this.layerVisibility = {};
        try {
            const keys = Object.keys(LAYERS || {});
            for (let k = 0; k < keys.length; k++) this.layerVisibility[keys[k]] = true;
        } catch (e) {}
        // Ensure the virtual 'route' layer is present and visible by default
        this.layerVisibility.route = true;
        // Grid overlay is a runtime layer (can be toggled via `toggleLayer('grid', show)`)
        // Default grid visibility: enabled on page load unless saved state says otherwise.
        try {
            let g = null;
            if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                g = window._mp4Storage.loadSetting('mp4_grid_visible');
            } else {
                try { g = localStorage.getItem('mp4_grid_visible'); } catch (e) { g = null; }
            }
            if (g === null || typeof g === 'undefined') {
                this.layerVisibility.grid = true;
            } else {
                this.layerVisibility.grid = (g === '1' || g === 1 || g === 'true' || g === true);
            }
        } catch (e) {
            this.layerVisibility.grid = true;
        }
        
        // Layer configuration (runtime constraints, not data)
        this.layerConfig = {
            'customMarkers': {
                maxMarkers: 50
            }
        };
        // Touch hit padding (CSS pixels) to make tapping easier on mobile
        this.touchPadding = 0;
        // Edit mode for custom markers: when true, markers can be placed/dragged/deleted
        this.editMarkersMode = false;
        // Edit mode for route editing: when true, route editing interactions are enabled
        this.editRouteMode = false;
        // Whether the current route should be rendered as a closed loop.
        // Default: do not loop routes unless user explicitly enables looping via the UI.
        this.routeLooping = false;
        // Wheel save timer used to delay saving until wheel stops
        this._wheelSaveTimer = null;
        // Marker shrink tuning: value in [0..1]. 0 = no marker shrink (markers stay at full size),
        // 1 = markers follow `getDetailScale()` fully. Use <1 to make markers shrink less.
        this.markerShrinkFactor = 0.6;
        
        // Tooltip element
        this.tooltip = document.getElementById('tooltip');
        // Tileset selection (sat / holo). Persisted in localStorage as 'mp4_tileset'
        try {
            let t = null;
            if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                t = window._mp4Storage.loadSetting('mp4_tileset');
            } else {
                try { t = localStorage.getItem('mp4_tileset'); } catch (e) { t = null; }
            }
            this.tileset = t || 'sat';
        } catch (e) { this.tileset = 'sat'; }
        // Optional grayscale flag for tiles; persisted as 'mp4_tileset_grayscale'
        try {
            let g = null;
            if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                g = window._mp4Storage.loadSetting('mp4_tileset_grayscale');
            } else {
                try { g = localStorage.getItem('mp4_tileset_grayscale'); } catch (e) { g = null; }
            }
            this.tilesetGrayscale = (g === '1' || g === 1 || g === true);
        } catch (e) { this.tilesetGrayscale = false; }
        
        // Setup
        this.resize();
        this.bindEvents();
        // Fit the full map into the container on initial load so we pick a sensible resolution.
        // Reserve padding for axis labels so indices are visible on load.
        const cssWidth = this.canvas.parentElement.clientWidth;
        const cssHeight = this.canvas.parentElement.clientHeight;
        // Assume the maximum label font size used by `renderAxisLabels()` (clamped there).
        const labelFontMax = 48;
        const labelPadding = 8;
        const halfW = labelFontMax * 0.6; // approx half-width of label
        const halfH = labelFontMax / 2;
        // Available space after reserving label margins on both sides
        const availW = Math.max(32, cssWidth - 2 * (labelPadding + halfW));
        const availH = Math.max(32, cssHeight - 2 * (labelPadding + halfH));
        const fitZoom = Math.min(availW / MAP_SIZE, availH / MAP_SIZE);
        this.zoom = Math.max(this.minZoom || DEFAULT_MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));
        this.centerMap();
        this.preloadAllMapImages();
        this.loadInitialImage();
        this.render();
    }

    // Preload map images at all resolutions to reduce hiccups during zoom/pan
    preloadAllMapImages() {
        const initial = this.getNeededResolution();
        // Only consider the currently-needed resolution and (unless low-spec)
        // one higher neighbor.
        const toPreload = [initial];
        if (!this._lowSpec && (initial + 1 < RESOLUTIONS.length)) toPreload.push(initial + 1);
        for (let p = 0; p < toPreload.length; p++) {
            const i = toPreload[p];
            const size = RESOLUTIONS[i];
            const folder = this.getTilesetFolder();
            const href = `tiles/${folder}/${size}.avif`;

            // Stagger fetches to avoid a burst of work on load
            (function(i, size, folder, href){
                const gen = this._tilesetGeneration;
                setTimeout(async () => {
                    // If tileset changed since scheduling, skip
                    if (this._tilesetGeneration !== gen) return;
                    if (this.images[i]) return;

                    // Try fetch + createImageBitmap path first
                    try {
                        if (window.fetch && window.createImageBitmap) {
                            const controller = new AbortController();
                            try { this._imageControllers[i] = controller; } catch (e) {}
                            const resp = await fetch(href, { signal: controller.signal });
                            try { delete this._imageControllers[i]; } catch (e) {}
                            if (!resp.ok) throw new Error('fetch-failed');
                            const blob = await resp.blob();
                            // Generation may have changed while fetching
                            if (this._tilesetGeneration !== gen) { return; }
                            const bmp = await createImageBitmap(blob);
                            try { bmp._tilesetFolder = folder; } catch (e) {}
                            if (this._tilesetGeneration === gen) {
                                try { this._imageBitmaps[i] = bmp; } catch (e) {}
                                try { this.images[i] = bmp; } catch (e) {}
                            } else {
                                try { if (bmp && typeof bmp.close === 'function') bmp.close(); } catch (e) {}
                                try { if (bmp && typeof bmp.close === 'function') bmp.close(); } catch (e) {}
                            }
                            return;
                        }
                    } catch (err) {
                        try { delete this._imageControllers[i]; } catch (e) {}
                        // fall through to image element fallback
                    }

                    // Fallback to <img> element loading
                    try {
                        const img = new Image();
                        try { img._tilesetFolder = folder; } catch (e) {}
                        try { this._imageElements[i] = img; } catch (e) {}
                        img.onload = () => {
                            try {
                                if (this._tilesetGeneration !== gen) {
                                    try { img.onload = null; img.onerror = null; img.src = ''; } catch (e) {}
                                    return;
                                }
                                try { this.images[i] = img; } catch (e) {}
                            } catch (e) {}
                        };
                        img.onerror = () => {
                            try { img.onload = null; img.onerror = null; } catch (e) {}
                        };
                        img.src = href;
                    } catch (e) {
                        // Give up for this resolution
                    }
                }, i * 150);
            }).call(this, i, size, folder, href);
        }
    }
    
    resize() {
        const container = this.canvas.parentElement;
        const cssWidth = container.clientWidth;
        const cssHeight = container.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        this.dpr = dpr;

        // Set CSS size and backing store size for high-DPI displays
        this.canvas.style.width = cssWidth + 'px';
        this.canvas.style.height = cssHeight + 'px';
        this.canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
        this.canvas.height = Math.max(1, Math.floor(cssHeight * dpr));

        // If a separate tile canvas exists, size its backing store too
        if (this.canvasTiles && this.ctxTiles) {
            this.canvasTiles.style.width = cssWidth + 'px';
            this.canvasTiles.style.height = cssHeight + 'px';
            this.canvasTiles.width = Math.max(1, Math.floor(cssWidth * dpr));
            this.canvasTiles.height = Math.max(1, Math.floor(cssHeight * dpr));
        }

        // Scale drawing so we can use CSS pixels in drawing code
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (this.ctxTiles) {
            try { this.ctxTiles.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {}
        }
        // compute a device-aware minimum zoom so smallest resolution can be reached
        const minRes = RESOLUTIONS[0];
        // minZoom such that minRes >= MAP_SIZE * minZoom * dpr => minZoom = minRes / (MAP_SIZE * dpr)
        this.minZoom = Math.max(0.005, Math.min(DEFAULT_MIN_ZOOM, minRes / (MAP_SIZE * dpr)));
        this.updateResolution();
        // Recreate honeycomb pattern when the canvas size or DPR changes
        try { this._createHoneycombPattern && this._createHoneycombPattern(); } catch (e) {}
        this.render();
    }
    
    centerMap() {
        const cssWidth = this.canvas.clientWidth;
        const cssHeight = this.canvas.clientHeight;
        const mapWidth = MAP_SIZE * this.zoom;
        const mapHeight = MAP_SIZE * this.zoom;
        this.panX = (cssWidth - mapWidth) / 2;
        this.panY = (cssHeight - mapHeight) / 2;
    }
    
    bindEvents() {
        // Mouse wheel zoom (passive: false required for preventDefault to work)
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Use a larger zoom step for wheel to match programmatic zoomIn/zoomOut (1.3x)
            const zoomFactor = e.deltaY > 0 ? (1 / 1.3) : 1.3;
            const newZoom = Math.max(this.minZoom || DEFAULT_MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * zoomFactor));
            
            // Zoom towards mouse position
            const worldX = (mouseX - this.panX) / this.zoom;
            const worldY = (mouseY - this.panY) / this.zoom;
            
            this.zoom = newZoom;
            
            this.panX = mouseX - worldX * this.zoom;
            this.panY = mouseY - worldY * this.zoom;
            
            this.updateResolution();
            this.render();
            // Update hover/cursor state after zoom so cursor matches visual marker size
            try { this.checkMarkerHover(mouseX, mouseY); } catch (err) {}
            // Debounce wheel until it stops, then save once
            try { if (this._wheelSaveTimer) clearTimeout(this._wheelSaveTimer); } catch (e) {}
            try {
                this._wheelSaveTimer = setTimeout(() => {
                    try { this.saveViewToStorage(); } catch (e) {}
                }, 150);
            } catch (e) {}
        }, { passive: false });
        // Pointer events (unified for mouse + touch + pen)
        this.canvas.addEventListener('pointerdown', (e) => {
            // Removed setPointerCapture to avoid blocking interactions on sidebar after panning
            const rect = this.canvas.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            const downTime = Date.now();
            this.pointers.set(e.pointerId, { x: localX, y: localY, clientX: e.clientX, clientY: e.clientY, downTime });
            // Clear any transient preview when pointer goes down
            this._routePreview = null;
            try { this.checkMarkerHover(localX, localY); } catch (e) {}

                if (this.pointers.size === 1) {
                    // Determine whether pointerdown hit a marker — handle route-node-drag
                    // when in route-edit mode, otherwise treat customMarkers specially.
                    const hit = this.findMarkerAt(localX, localY);
                    // If in route-edit mode and user pressed on a marker that's part of the current route,
                    // begin an edit-drag of that waypoint (replace with a temporary waypoint in route order).
                    if (hit && this.editRouteMode && hit.marker && hit.marker.uid && Array.isArray(this.currentRoute) && Array.isArray(this._routeSources)) {
                        let routePos = -1;
                        for (let i = 0; i < this.currentRoute.length; i++) {
                            const src = this._routeSources[this.currentRoute[i]];
                            if (src && src.marker && src.marker.uid === hit.marker.uid) { routePos = i; break; }
                        }
                        if (routePos >= 0) {
                            // Create a candidate for route-node-drag; promote on pointermove when movement exceeds threshold
                            this._routeNodeCandidate = {
                                uid: hit.marker.uid,
                                layerKey: hit.layerKey,
                                pointerId: e.pointerId,
                                routePos: routePos,
                                startClientX: e.clientX,
                                startClientY: e.clientY
                            };
                            // Do not zero pointerDownTime yet so clicks still register if user doesn't move
                            this.pointerDownTime = downTime;
                            try { this.canvas.style.cursor = 'pointer'; } catch (e) {}
                            // Prevent starting a pan immediately; wait for promotion on pointermove
                            return;
                        }
                    }
                    if (hit && hit.layerKey === 'customMarkers') {
                        if (this.editMarkersMode) {
                            // Edit mode: prepare for potential drag of the custom marker
                            this._draggingCandidate = {
                                uid: hit.marker.uid,
                                layerKey: hit.layerKey,
                                pointerId: e.pointerId,
                                // pixel offset from marker center to pointer to avoid jump when drag starts
                                offsetX: localX - (hit.marker.x * MAP_SIZE * this.zoom + this.panX),
                                offsetY: localY - (hit.marker.y * MAP_SIZE * this.zoom + this.panY),
                                startClientX: e.clientX,
                                startClientY: e.clientY
                            };
                            this.isDragging = false;
                            this.pointerDownTime = downTime;
                            this.canvas.style.cursor = 'grabbing';
                        } else {
                            // Normal mode: do not start pan when tapping a custom marker
                            // but record time for click detection so tooltip/selection still works
                            this.isDragging = false;
                            this.pointerDownTime = downTime;
                            try { this.canvas.style.cursor = 'pointer'; } catch (err) {}
                        }
                    } else {
                        // If in route-edit mode and user pressed near a route segment, begin an insert-drag
                        if (this.editRouteMode) {
                            const seg = this.findRouteSegmentAt(localX, localY, 10);
                            if (seg && typeof seg.index === 'number') {
                                try {
                                    const worldX = (localX - this.panX) / this.zoom / MAP_SIZE;
                                    const worldY = (localY - this.panY) / this.zoom / MAP_SIZE;
                                    const prevSources = Array.isArray(this._routeSources) ? this._routeSources.slice() : [];
                                    const prevIndices = Array.isArray(this.currentRoute) ? this.currentRoute.slice() : [];
                                    // Build a route-ordered sources array (so segment indices map to positions)
                                    const ordered = [];
                                    for (let ri = 0; ri < prevIndices.length; ri++) {
                                        const srcIdx = prevIndices[ri];
                                        const src = prevSources[srcIdx];
                                        if (!src) continue;
                                        ordered.push({ marker: src.marker, layerKey: src.layerKey, layerIndex: ordered.length });
                                    }
                                    // Create temporary marker/source and insert into the route-ordered array
                                    const tempMarker = { uid: '', x: Number(worldX), y: Number(worldY) };
                                    const tempSource = { marker: tempMarker, layerKey: 'temp', layerIndex: -1 };
                                    const insertAt = seg.index + 1;
                                    ordered.splice(insertAt, 0, tempSource);
                                    const newSources = ordered;
                                    const newIndices = newSources.map((_, i) => i);
                                    // Apply as current route (temporary, ordered)
                                    this.setRoute(newIndices, this.computeRouteLengthNormalized(newSources), newSources);
                                    // While inserting, treat the temporary route as having an explicit start point
                                    // Do not change looping preference while inserting; looping is explicit via UI
                                    // Save insertion state for ongoing drag
                                    this._routeInsert = {
                                        pointerId: e.pointerId,
                                        tempIndex: insertAt,
                                        prevSources,
                                        prevIndices,
                                            prevRouteLooping: !!this.routeLooping,
                                        hoverMarker: null,
                                        hoverOccupied: false
                                    };
                                    // Prevent click handler from firing for this gesture
                                    this.pointerDownTime = 0;
                                    this.canvas.style.cursor = 'grabbing';
                                    // Do not start pan
                                    return;
                                } catch (err) { /* fallthrough to pan */ }
                            }
                        }
                        // start single-pointer pan
                        this.isDragging = true;
                        this.lastMouseX = e.clientX;
                        this.lastMouseY = e.clientY;
                        // Track timing for click detection
                        this.pointerDownTime = downTime;
                        this.canvas.style.cursor = 'grabbing';
                    }
                } else if (this.pointers.size === 2) {
                // begin pinch
                const pts = Array.from(this.pointers.values());
                const dx = pts[0].clientX - pts[1].clientX;
                const dy = pts[0].clientY - pts[1].clientY;
                const dist = Math.hypot(dx, dy);
                const midClientX = (pts[0].clientX + pts[1].clientX) / 2;
                const midClientY = (pts[0].clientY + pts[1].clientY) / 2;
                this.pinch = { startDistance: dist, startZoom: this.zoom, lastMidX: midClientX, lastMidY: midClientY };
                this.isDragging = false;
                // Stop tracking click timing once pinch starts
                this.pointerDownTime = 0;
            }
        });

        this.canvas.addEventListener('pointermove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;

            if (this.pointers.has(e.pointerId)) {
                const p = this.pointers.get(e.pointerId);
                p.x = localX; p.y = localY; p.clientX = e.clientX; p.clientY = e.clientY;
            }

            // If we have a dragging candidate for this pointer, promote to active drag
            const MOVE_THRESHOLD = 8; // pixels
            if (this._draggingCandidate && e.pointerId === this._draggingCandidate.pointerId) {
                const dx = e.clientX - this._draggingCandidate.startClientX;
                const dy = e.clientY - this._draggingCandidate.startClientY;
                if (Math.hypot(dx, dy) > MOVE_THRESHOLD) {
                    // Promote candidate to active dragging marker and cancel click
                    this._draggingMarker = {
                        uid: this._draggingCandidate.uid,
                        layerKey: this._draggingCandidate.layerKey,
                        pointerId: this._draggingCandidate.pointerId,
                        offsetX: this._draggingCandidate.offsetX,
                        offsetY: this._draggingCandidate.offsetY
                    };
                    // If the marker being dragged is currently selected, clear selection and hide tooltip
                    try {
                        if (this.selectedMarker && this.selectedMarker.uid === this._draggingMarker.uid && this.selectedMarkerLayer === this._draggingMarker.layerKey) {
                            this.selectedMarker = null;
                            this.selectedMarkerLayer = null;
                            try { this.hideTooltip(); } catch (e) {}
                        }
                    } catch (e) {}
                    this._draggingCandidate = null;
                    // Prevent click handler from firing for this interaction
                    this.pointerDownTime = 0;
                    try { this.canvas.style.cursor = 'grabbing'; } catch (e) {}
                }
            }

            // Promote a route-node candidate to an active temporary route-insert when moved enough
            if (this._routeNodeCandidate && e.pointerId === this._routeNodeCandidate.pointerId) {
                const dxn = e.clientX - this._routeNodeCandidate.startClientX;
                const dyn = e.clientY - this._routeNodeCandidate.startClientY;
                if (Math.hypot(dxn, dyn) > MOVE_THRESHOLD) {
                    try {
                        const routePos = Number(this._routeNodeCandidate.routePos) || 0;
                        const prevSources = Array.isArray(this._routeSources) ? this._routeSources.slice() : [];
                        const prevIndices = Array.isArray(this.currentRoute) ? this.currentRoute.slice() : [];
                        // Build route-ordered array
                        const ordered = [];
                        for (let ri = 0; ri < prevIndices.length; ri++) {
                            const srcIdx = prevIndices[ri];
                            const src = prevSources[srcIdx];
                            if (!src) continue;
                            ordered.push({ marker: src.marker, layerKey: src.layerKey, layerIndex: ordered.length });
                        }
                        // Insert a temporary marker replacing the selected node
                        const worldX = (localX - this.panX) / this.zoom / MAP_SIZE;
                        const worldY = (localY - this.panY) / this.zoom / MAP_SIZE;
                        const tempMarker = { uid: '', x: Number(worldX), y: Number(worldY) };
                        const tempSource = { marker: tempMarker, layerKey: 'temp', layerIndex: -1 };
                        ordered[routePos] = tempSource;
                        const newSources = ordered;
                        const newIndices = newSources.map((_, i) => i);
                        this.setRoute(newIndices, this.computeRouteLengthNormalized(newSources), newSources);
                        this._routeInsert = {
                            pointerId: e.pointerId,
                            tempIndex: routePos,
                            prevSources,
                            prevIndices,
                            prevRouteLooping: !!this.routeLooping,
                            hoverMarker: null,
                            hoverOccupied: false
                        };
                        this._routeNodeCandidate = null;
                        // Prevent click handler
                        this.pointerDownTime = 0;
                        try { this.canvas.style.cursor = 'grabbing'; } catch (e) {}
                        // Let subsequent pointermove logic handle position updates via _routeInsert
                        return;
                    } catch (err) { this._routeNodeCandidate = null; }
                }
            }

            // If we're dragging a temporary route-insert waypoint, update its position and hover state
            if (this._routeInsert && e.pointerId === this._routeInsert.pointerId) {
                try {
                    const tempIdx = this._routeInsert.tempIndex;
                    if (this._routeSources && this._routeSources[tempIdx]) {
                        const worldX = (localX - this.panX) / this.zoom / MAP_SIZE;
                        const worldY = (localY - this.panY) / this.zoom / MAP_SIZE;
                        // Clamp to map bounds
                        this._routeSources[tempIdx].marker.x = Math.max(0, Math.min(1, Number(worldX)));
                        this._routeSources[tempIdx].marker.y = Math.max(0, Math.min(1, Number(worldY)));
                    }
                    // Check for marker under pointer to snap to
                    const hitMarker = this.findMarkerAt(localX, localY);
                    if (hitMarker && hitMarker.marker && hitMarker.marker.uid) {
                        // Check if marker already part of route (exclude temp index)
                        let exists = false;
                        for (let i = 0; i < this._routeSources.length; i++) {
                            if (i === this._routeInsert.tempIndex) continue;
                            const s = this._routeSources[i];
                            if (s && s.marker && s.marker.uid && s.marker.uid === hitMarker.marker.uid) { exists = true; break; }
                        }
                        this._routeInsert.hoverMarker = hitMarker.marker;
                        this._routeInsert.hoverOccupied = !!exists;
                    } else {
                        this._routeInsert.hoverMarker = null;
                        this._routeInsert.hoverOccupied = false;
                    }
                    // Update length and render
                    try { this.currentRouteLengthNormalized = this.computeRouteLengthNormalized(this._routeSources); this.currentRouteLength = this.currentRouteLengthNormalized * MAP_SIZE; } catch (e) {}
                    this.render();
                } catch (err) {}
                return;
            }

            // If we're currently dragging a custom marker with this pointer, move it
            if (this._draggingMarker && e.pointerId === this._draggingMarker.pointerId) {
                try {
                    // Compute marker center in screen (local) coords using pointer offset
                    const centerX = localX - (this._draggingMarker.offsetX || 0);
                    const centerY = localY - (this._draggingMarker.offsetY || 0);
                    // Convert to normalized world coords [0..1]
                    const worldX = (centerX - this.panX) / this.zoom / MAP_SIZE;
                    const worldY = (centerY - this.panY) / this.zoom / MAP_SIZE;
                    // Clamp to bounds
                    const nx = Math.max(0, Math.min(1, worldX));
                    const ny = Math.max(0, Math.min(1, worldY));

                    // Update the marker in LAYERS directly and persist
                    if (LAYERS && LAYERS.customMarkers && Array.isArray(LAYERS.customMarkers.markers)) {
                        const idx = LAYERS.customMarkers.markers.findIndex(m => m.uid === this._draggingMarker.uid);
                        if (idx >= 0) {
                            LAYERS.customMarkers.markers[idx].x = nx;
                            LAYERS.customMarkers.markers[idx].y = ny;
                            try { if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.saveToLocalStorage === 'function') MarkerUtils.saveToLocalStorage(); } catch (e) {}
                            try { this.customMarkers = LAYERS.customMarkers.markers; } catch (e) {}
                            try { this.render(); } catch (e) {}
                            try { this.canvas.style.cursor = 'grabbing'; } catch (e) {}
                        }
                    }
                } catch (err) {
                    // ignore drag errors
                }
                return;
            }

            // Show a lightweight preview when hovering near a route segment in edit mode
            try {
                const canPreview = !this.isDragging && !this._draggingMarker && !this._draggingCandidate && !this._routeInsert && !this._routeNodeCandidate && this.editRouteMode;
                if (canPreview) {
                    const seg = this.findRouteSegmentAt(localX, localY, 10);
                    if (seg && typeof seg.index === 'number') {
                        const len = Array.isArray(this.currentRoute) ? this.currentRoute.length : 0;
                        if (len > 1) {
                            const idxA = this.currentRoute[seg.index];
                            const idxB = this.currentRoute[(seg.index + 1) % len];
                            const srcA = this._routeSources && this._routeSources[idxA];
                            const srcB = this._routeSources && this._routeSources[idxB];
                            if (srcA && srcB && srcA.marker && srcB.marker) {
                                const ax = srcA.marker.x * MAP_SIZE * this.zoom + this.panX;
                                const ay = srcA.marker.y * MAP_SIZE * this.zoom + this.panY;
                                const bx = srcB.marker.x * MAP_SIZE * this.zoom + this.panX;
                                const by = srcB.marker.y * MAP_SIZE * this.zoom + this.panY;
                                const t = (typeof seg.t === 'number') ? seg.t : 0;
                                const px = ax + (bx - ax) * t;
                                const py = ay + (by - ay) * t;
                                const worldX = (px - this.panX) / this.zoom / MAP_SIZE;
                                const worldY = (py - this.panY) / this.zoom / MAP_SIZE;
                                this._routePreview = { index: seg.index, t, worldX, worldY, screenX: px, screenY: py };
                                try { this.canvas.style.cursor = 'pointer'; } catch (e) {}
                                try { this.render(); } catch (e) {}
                                return;
                            }
                        }
                    } else {
                        if (this._routePreview) { this._routePreview = null; try { this.checkMarkerHover(localX, localY); } catch (e) {} }
                    }
                }
            } catch (e) {}

            if (this.pointers.size === 2 && this.pinch) {
                // handle pinch-to-zoom and pan
                const pts = Array.from(this.pointers.values());
                const dx = pts[0].clientX - pts[1].clientX;
                const dy = pts[0].clientY - pts[1].clientY;
                const dist = Math.hypot(dx, dy);
                const factor = dist / this.pinch.startDistance;
                const newZoom = Math.max(this.minZoom || DEFAULT_MIN_ZOOM, Math.min(MAX_ZOOM, this.pinch.startZoom * factor));

                // current pinch center
                const midClientX = (pts[0].clientX + pts[1].clientX) / 2;
                const midClientY = (pts[0].clientY + pts[1].clientY) / 2;
                
                // calculate pan from center movement
                const panDX = midClientX - this.pinch.lastMidX;
                const panDY = midClientY - this.pinch.lastMidY;
                
                // zoom towards current midpoint
                const worldX = (midClientX - rect.left - this.panX) / this.zoom;
                const worldY = (midClientY - rect.top - this.panY) / this.zoom;

                this.zoom = newZoom;
                this.panX = midClientX - rect.left - worldX * this.zoom + panDX;
                this.panY = midClientY - rect.top - worldY * this.zoom + panDY;
                
                // update last midpoint for next frame
                this.pinch.lastMidX = midClientX;
                this.pinch.lastMidY = midClientY;

                this.updateResolution();
                this.render();
                // Update hover state using current pinch midpoint so cursor updates during pinch-zoom
                try {
                    const midLocalX = this.pinch.lastMidX - rect.left;
                    const midLocalY = this.pinch.lastMidY - rect.top;
                    this.checkMarkerHover(midLocalX, midLocalY);
                } catch (err) {}
                return;
            }

            if (this.isDragging) {
                this.panX += e.clientX - this.lastMouseX;
                this.panY += e.clientY - this.lastMouseY;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.render();
            } else {
                // pointer hover (or mouse move) - check markers
                this.checkMarkerHover(localX, localY);
            }
        });
        // Route export/import handlers
        const exportRouteBtn = document.getElementById('exportRoute');
        const importRouteBtn = document.getElementById('importRoute');
        const importRouteFile = document.getElementById('importRouteFile');

        if (exportRouteBtn) {
            exportRouteBtn.addEventListener('click', () => {
                try {
                    if (typeof RouteUtils !== 'undefined' && typeof RouteUtils.exportRoute === 'function') {
                        RouteUtils.exportRoute(map, MarkerUtils);
                    } else {
                        alert('Route utilities not available.');
                    }
                } catch (err) {
                    alert('Failed to export route: ' + (err.message || String(err)));
                }
            });
        }

        if (importRouteBtn && importRouteFile) {
            importRouteBtn.addEventListener('click', () => importRouteFile.click());
            importRouteFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const obj = JSON.parse(ev.target.result);
                        if (!obj || !Array.isArray(obj.points) || obj.points.length === 0) {
                            throw new Error('Invalid route file: missing points array');
                        }

                        // Upgrade legacy route points if needed
                        if (typeof RouteUtils !== 'undefined' && typeof RouteUtils.upgradeLegacyRoute === 'function') {
                            const upgrade = RouteUtils.upgradeLegacyRoute(obj.points, LAYERS);
                            if (upgrade.upgraded) {
                                alert(`Upgraded route: ${upgrade.count} points regenerated. UIDs and layers matched by coordinate hash.`);
                                // log removed
                            }
                        }

                        // Extract custom markers from the route points (those with 'cm' prefix)
                        let customMarkersFromRoute = obj.points
                            .filter(p => p.uid && p.uid.startsWith('cm_'))
                            .map(p => ({ uid: p.uid, x: Number(p.x), y: Number(p.y) }));

                        // Detect if route's custom markers use legacy incremental UIDs
                        const routeMarkersAreLegacy = (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.isLegacyMarkerFile === 'function')
                            ? MarkerUtils.isLegacyMarkerFile(customMarkersFromRoute)
                            : customMarkersFromRoute.some(m => typeof m.uid === 'undefined' || !(/^[A-Za-z]+_[0-9a-fA-F]{8}$/.test(String(m.uid))));

                        // If legacy, regenerate hashed UIDs and update the source points' uid fields
                        if (routeMarkersAreLegacy) {
                            const regenerated = customMarkersFromRoute.map(m => ({
                                uid: (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.generateUID === 'function') ? MarkerUtils.generateUID(m.x, m.y, 'cm') : `cm_${Math.random().toString(16).slice(2,10)}`,
                                x: m.x,
                                y: m.y
                            }));
                            // Replace uids in obj.points for customMarkers entries by matching coordinates
                            let updatedCount = 0;
                            for (let i = 0; i < obj.points.length; i++) {
                                const p = obj.points[i];
                                if (p && p.uid && p.uid.startsWith('cm_')) {
                                    const match = regenerated.find(r => Math.abs(r.x - Number(p.x)) < 0.0000001 && Math.abs(r.y - Number(p.y)) < 0.0000001);
                                    if (match) {
                                        if (p.uid !== match.uid) updatedCount++;
                                        p.uid = match.uid;
                                    }
                                }
                            }
                            customMarkersFromRoute = regenerated;
                            alert(`Upgraded custom markers: ${updatedCount} markers regenerated. UIDs and layers matched by coordinate hash.`);
                            // log removed
                        }

                        // If custom markers exist in route, merge them with capacity check
                        if (customMarkersFromRoute.length > 0) {
                            const currentMarkers = (LAYERS && LAYERS.customMarkers && Array.isArray(LAYERS.customMarkers.markers))
                                ? LAYERS.customMarkers.markers
                                : [];
                            const maxMarkers = map?.layerConfig?.customMarkers?.maxMarkers || 50;
                            
                            // Count only NEW markers (those without matching UIDs)
                            const newMarkersCount = customMarkersFromRoute.filter(imported => {
                                return typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.markerExists === 'function'
                                    ? !MarkerUtils.markerExists(imported.uid, currentMarkers)
                                    : !currentMarkers.some(current => current.uid === imported.uid);
                            }).length;
                            
                            const totalAfterImport = currentMarkers.length + newMarkersCount;
                            
                            if (totalAfterImport > maxMarkers) {
                                const needToDelete = totalAfterImport - maxMarkers;
                                alert(
                                    `Cannot import route custom markers.\n\n` +
                                    `You have ${currentMarkers.length} markers, route would add ${newMarkersCount} new ones.\n\n` +
                                    `Total would be ${totalAfterImport}, maximum is ${maxMarkers}.\n\n` +
                                    `Please delete at least ${needToDelete} marker(s) first.`
                                );
                                e.target.value = '';
                                return;
                            }
                            
                            // Merge markers: replace those with matching UIDs, add new ones
                            const mergedMarkers = currentMarkers.slice();
                            for (let i = 0; i < customMarkersFromRoute.length; i++) {
                                const importedMarker = customMarkersFromRoute[i];
                                const existingIdx = typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.findMarkerIndex === 'function'
                                    ? MarkerUtils.findMarkerIndex(importedMarker.uid, mergedMarkers)
                                    : mergedMarkers.findIndex(m => m.uid === importedMarker.uid);
                                if (existingIdx >= 0) {
                                    // Overwrite marker with same UID (hash)
                                    mergedMarkers[existingIdx] = importedMarker;
                                } else {
                                    // Add new marker
                                    mergedMarkers.push(importedMarker);
                                }
                            }
                            
                            try {
                                if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.mergeCustomMarkers === 'function') {
                                    MarkerUtils.mergeCustomMarkers(mergedMarkers);
                                } else {
                                    if (LAYERS.customMarkers) {
                                        LAYERS.customMarkers.markers = mergedMarkers;
                                        if (typeof map !== 'undefined' && map) {
                                            map.customMarkers = LAYERS.customMarkers.markers;
                                            if (typeof map.updateLayerCounts === 'function') map.updateLayerCounts();
                                            map.render();
                                        }
                                    }
                                }
                            } catch (e) {
                                console.warn('Failed to merge custom markers from route:', e);
                            }
                        }

                        // Build sources from all points in the route (derive layer from UID prefix)
                        const sources = [];
                        for (let i = 0; i < obj.points.length; i++) {
                            const p = obj.points[i];
                            if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
                                console.warn('Route contains invalid point at index', i);
                                continue;
                            }
                            const layerKey = (typeof RouteUtils !== 'undefined' && typeof RouteUtils.findLayerKeyByPrefix === 'function')
                                ? RouteUtils.findLayerKeyByPrefix(p.uid, LAYERS)
                                : 'unknown';
                            sources.push({
                                marker: {
                                    uid: p.uid || '',
                                    x: Number(p.x),
                                    y: Number(p.y)
                                },
                                layerKey: layerKey,
                                layerIndex: i
                            });
                        }
                        const routeIndices = sources.map((_, i) => i);
                        const length = typeof obj.length === 'number' ? obj.length : 0;

                        // Replace any cloned marker objects in `sources` with canonical
                        // marker objects from `LAYERS` (if available) so route waypoints
                        // stay coupled to their source markers after reload/import.
                        try {
                            for (let si = 0; si < sources.length; si++) {
                                const s = sources[si];
                                try {
                                    const uid = s && s.marker && s.marker.uid;
                                    const layer = s && s.layerKey;
                                    if (!uid) continue;
                                    if (layer && LAYERS && LAYERS[layer] && Array.isArray(LAYERS[layer].markers)) {
                                        const found = LAYERS[layer].markers.find(m => m.uid === uid);
                                        if (found) { s.marker = found; continue; }
                                    }
                                    // fallback: search across customMarkers specifically
                                    if (LAYERS && LAYERS.customMarkers && Array.isArray(LAYERS.customMarkers.markers)) {
                                        const found2 = LAYERS.customMarkers.markers.find(m => m.uid === uid);
                                        if (found2) s.marker = found2;
                                    }
                                } catch (e) {}
                            }
                        } catch (e) {}

                        // Set the route with all points
                        map.setRoute(routeIndices, length, sources);
                        // log removed
                    } catch (err) {
                        // error logging removed
                        alert('Failed to import route: ' + (err.message || String(err)));
                    }
                };
                reader.onerror = () => alert('Failed to read file');
                reader.readAsText(file);
                e.target.value = '';
            });
        }

        this.canvas.addEventListener('pointerup', (e) => {
            // Pointer capture no longer used; removed releasePointerCapture call
            const rect = this.canvas.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;

            const p = this.pointers.get(e.pointerId);
            const downTime = p ? p.downTime : 0;
            const dt = Date.now() - downTime;
            const moved = p ? (Math.hypot(p.clientX - e.clientX, p.clientY - e.clientY) > 8) : true;

            this.pointers.delete(e.pointerId);

            if (this.pointers.size < 2) this.pinch = null;

            if (this.pointers.size === 0) {
                // finalize drag
                this.isDragging = false;
                // If a dragging candidate exists but was never promoted, clear it and allow click
                if (this._draggingCandidate && e.pointerId === this._draggingCandidate.pointerId) {
                    this._draggingCandidate = null;
                }
                // If a route-node candidate exists but was never promoted, clear it so clicks behave normally
                if (this._routeNodeCandidate && e.pointerId === this._routeNodeCandidate.pointerId) {
                    this._routeNodeCandidate = null;
                }
                // If a custom marker drag was in progress, finalize it and clear state
                if (this._draggingMarker && e.pointerId === this._draggingMarker.pointerId) {
                    // Save persisted state (already saved during move, but ensure final save)
                    try { if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.saveToLocalStorage === 'function') MarkerUtils.saveToLocalStorage(); } catch (e) {}
                    this._draggingMarker = null;
                    // Prevent the subsequent click handler from treating this as a tap
                    this.pointerDownTime = 0;
                }
                // update cursor based on whether any marker is under the pointer
                const under = this.findMarkerAt(localX, localY);
                this.canvas.style.cursor = under ? 'pointer' : 'grab';
                // clear any transient route preview
                this._routePreview = null;
                // Save view state
                try { this.saveViewToStorage(); } catch (err) {}

                // short tap (no movement, short press) — let `click` handler manage selection/placement
            }

            // Finalize any in-progress route-insert drag for this pointer
            try {
                    if (this._routeInsert && e.pointerId === this._routeInsert.pointerId) {
                    const tempIdx = this._routeInsert.tempIndex;
                    // If hovered a free marker, snap and finalize
                    if (this._routeInsert.hoverMarker && !this._routeInsert.hoverOccupied) {
                        // Replace temp marker with actual marker reference
                        if (this._routeSources && this._routeSources[tempIdx]) {
                            this._routeSources[tempIdx].marker = this._routeInsert.hoverMarker;
                        }
                        // Recompute length and persist
                        const len = this.computeRouteLengthNormalized(this._routeSources);
                        const indices = this._routeSources.map((_, i) => i);
                        this.setRoute(indices, len, this._routeSources);
                    } else if (this._routeInsert.hoverMarker && this._routeInsert.hoverOccupied) {
                        // Hovered a marker that already has a waypoint: overwrite it.
                        try {
                            // Find existing index of the occupied marker (exclude tempIdx)
                            let existingIdx = -1;
                            for (let i = 0; i < this._routeSources.length; i++) {
                                if (i === tempIdx) continue;
                                const s = this._routeSources[i];
                                if (s && s.marker && s.marker.uid && this._routeInsert.hoverMarker && s.marker.uid === this._routeInsert.hoverMarker.uid) { existingIdx = i; break; }
                            }
                            if (existingIdx >= 0) {
                                // Remove the existing waypoint so we don't have duplicates
                                this._routeSources.splice(existingIdx, 1);
                                // Adjust tempIdx if needed
                                let targetIdx = tempIdx;
                                if (existingIdx < tempIdx) targetIdx = tempIdx - 1;
                                // Ensure temp slot exists (if temp was removed by splice above, insert a placeholder)
                                if (!this._routeSources[targetIdx]) {
                                    // insert at targetIdx
                                    this._routeSources.splice(targetIdx, 0, { marker: this._routeInsert.hoverMarker, layerKey: 'temp' });
                                } else {
                                    // Replace the marker at the temp slot with the hovered marker
                                    this._routeSources[targetIdx].marker = this._routeInsert.hoverMarker;
                                }
                                // Recompute lengths and set route
                                const len2 = this.computeRouteLengthNormalized(this._routeSources);
                                const indices2 = this._routeSources.map((_, i) => i);
                                this.setRoute(indices2, len2, this._routeSources);
                            } else {
                                // Fallback: restore previous route if something unexpected happened
                                const prev = this._routeInsert.prevSources || [];
                                const prevIdx = (Array.isArray(this._routeInsert.prevIndices) && this._routeInsert.prevIndices.length) ? this._routeInsert.prevIndices : (prev.map((_,i)=>i));
                                const len = this.computeRouteLengthNormalized(prev);
                                this.setRoute(prevIdx, len, prev);
                                try { this.routeLooping = !!this._routeInsert.prevRouteLooping; } catch (e) {}
                            }
                        } catch (err) {
                            try {
                                const prev = this._routeInsert.prevSources || [];
                                const prevIdx = (Array.isArray(this._routeInsert.prevIndices) && this._routeInsert.prevIndices.length) ? this._routeInsert.prevIndices : (prev.map((_,i)=>i));
                                const len = this.computeRouteLengthNormalized(prev);
                                this.setRoute(prevIdx, len, prev);
                                try { this.routeLooping = !!this._routeInsert.prevRouteLooping; } catch (e) {}
                            } catch (err2) {}
                        }
                    } else {
                        // Restore previous route (remove temp)
                        try {
                            const prev = this._routeInsert.prevSources || [];
                            const prevIdx = (Array.isArray(this._routeInsert.prevIndices) && this._routeInsert.prevIndices.length) ? this._routeInsert.prevIndices : (prev.map((_,i)=>i));
                            const len = this.computeRouteLengthNormalized(prev);
                            this.setRoute(prevIdx, len, prev);
                            // Restore previous looping preference
                            try { this.routeLooping = !!this._routeInsert.prevRouteLooping; } catch (e) {}
                        } catch (err) {}
                    }
                    // clear insertion state
                    this._routeInsert = null;
                    try { this.render(); } catch (e) {}
                }
            } catch (err) {}
        });

        this.canvas.addEventListener('pointercancel', (e) => {
            this.pointers.delete(e.pointerId);
            if (this.pointers.size === 0) {
                this.isDragging = false;
                this.pinch = null;
                this.canvas.style.cursor = 'grab';
                // clear transient preview
                this._routePreview = null;
                // clear any candidate/active drag
                if (this._draggingCandidate && this._draggingCandidate.pointerId === e.pointerId) this._draggingCandidate = null;
                if (this._draggingMarker && this._draggingMarker.pointerId === e.pointerId) this._draggingMarker = null;
                if (this._routeNodeCandidate && this._routeNodeCandidate.pointerId === e.pointerId) this._routeNodeCandidate = null;
                if (this._routeInsert && this._routeInsert.pointerId === e.pointerId) {
                    // restore previous route and flag on cancel
                    try {
                        const prev = this._routeInsert.prevSources || [];
                        const prevIdx = (Array.isArray(this._routeInsert.prevIndices) && this._routeInsert.prevIndices.length) ? this._routeInsert.prevIndices : (prev.map((_,i)=>i));
                        const len = this.computeRouteLengthNormalized(prev);
                        this.setRoute(prevIdx, len, prev);
                        try { this.routeLooping = !!this._routeInsert.prevRouteLooping; } catch (e) {}
                    } catch (err) {}
                    this._routeInsert = null;
                }
            }
        });

        // pointerleave similar to mouseleave. Keep tooltip visible when cursor
        // moves into UI areas (sidebar, controls, layer list) so it doesn't
        // disappear when users move from map to UI to inspect details.
        this.canvas.addEventListener('mouseleave', (ev) => {
            this.isDragging = false;
            this.canvas.style.cursor = 'grab';
            try {
                const related = ev && ev.relatedTarget ? ev.relatedTarget : null;
                let enteredUi = false;
                try {
                    if (related && related.closest) {
                        enteredUi = !!related.closest('.sidebar, .controls, .zoom-controls, #layerList, .header, .sidebar-handle');
                    }
                } catch (e) { enteredUi = false; }
                // If pointer left into the UI, keep tooltip visible; otherwise hide it.
                if (!enteredUi) this.hideTooltip();
            } catch (e) { try { this.hideTooltip(); } catch (e) {} }
            // clear hover preview
            this._routePreview = null;
            // If a route-insert was in progress, cancel and restore
            try {
                if (this._routeInsert) {
                    const prev = this._routeInsert.prevSources || [];
                    const prevIdx = (Array.isArray(this._routeInsert.prevIndices) && this._routeInsert.prevIndices.length) ? this._routeInsert.prevIndices : (prev.map((_,i)=>i));
                    const len = this.computeRouteLengthNormalized(prev);
                    this.setRoute(prevIdx, len, prev);
                    try { this.routeLooping = !!this._routeInsert.prevRouteLooping; } catch (e) {}
                    this._routeInsert = null;
                }
                // Clear any unpromoted route-node candidate so clicks behave normally after leave
                if (this._routeNodeCandidate) this._routeNodeCandidate = null;
            } catch (e) {}
        });
        
        // Click handler - place custom markers or delete them when tapped
        this.canvas.addEventListener('click', (e) => {
            // Check if this was a quick tap (not a held drag)
            // If pointer was held > minClickDuration, treat as pan, not a click to place/delete marker
            const holdDuration = Date.now() - this.pointerDownTime;
            
            // Only interact on quick taps (less than threshold)
            const isQuickTap = this.pointerDownTime > 0 && holdDuration < this.minClickDuration;
            
            // Clear timer after use (important for preventing double-placement)
            this.pointerDownTime = 0;
            
            // Determine whether a marker exists at the click location (don't rely on hoveredMarker for custom markers)
            const rect = this.canvas.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            const hit = this.findMarkerAt(localX, localY);

            if (isQuickTap && hit) {
                const layerKey = hit.layerKey;
                // Helper determination: deletable layers (custom markers) vs selectable layers
                const isDeletable = !!(LAYERS[layerKey] && LAYERS[layerKey].deletable);
                const isSelectable = !!(LAYERS[layerKey] && (LAYERS[layerKey].selectable !== false));

                // Route edit mode: tapping markers toggles their membership in the current route
                if (this.editRouteMode) {
                    try {
                        const uid = hit.marker && hit.marker.uid;
                        if (!uid) return;

                        // Build ordered list of existing route marker UIDs
                        const existing = [];
                        if (Array.isArray(this.currentRoute) && Array.isArray(this._routeSources)) {
                            for (let i = 0; i < this.currentRoute.length; i++) {
                                const src = this._routeSources[this.currentRoute[i]];
                                if (src && src.marker && src.marker.uid) existing.push(src.marker.uid);
                            }
                        }

                        const inIdx = existing.indexOf(uid);
                        const newSources = [];
                        const newIndices = [];

                        if (inIdx >= 0) {
                            // Remove the tapped marker from the route
                            for (let i = 0; i < this.currentRoute.length; i++) {
                                const src = this._routeSources[this.currentRoute[i]];
                                if (!src || !src.marker) continue;
                                if (src.marker.uid === uid) continue;
                                newSources.push({ marker: src.marker, layerKey: src.layerKey, layerIndex: newSources.length });
                                newIndices.push(newSources.length - 1);
                            }
                        } else {
                            // Preserve existing route points (if any)
                            if (Array.isArray(this.currentRoute) && Array.isArray(this._routeSources)) {
                                for (let i = 0; i < this.currentRoute.length; i++) {
                                    const src = this._routeSources[this.currentRoute[i]];
                                    if (!src || !src.marker) continue;
                                    newSources.push({ marker: src.marker, layerKey: src.layerKey, layerIndex: newSources.length });
                                    newIndices.push(newSources.length - 1);
                                }
                            }
                            // Append the tapped marker as a new route point
                            newSources.push({ marker: hit.marker, layerKey: layerKey, layerIndex: newSources.length });
                            newIndices.push(newSources.length - 1);
                        }

                        // Compute simple path length (pixels) as sum of Euclidean segments
                        let lengthPx = 0;
                        for (let i = 1; i < newSources.length; i++) {
                            const a = newSources[i - 1].marker;
                            const b = newSources[i].marker;
                            if (!a || !b) continue;
                            const dx = (a.x - b.x) * MAP_SIZE;
                            const dy = (a.y - b.y) * MAP_SIZE;
                            lengthPx += Math.hypot(dx, dy);
                        }
                        const lengthNormalized = lengthPx / MAP_SIZE;

                        // Apply the new route
                        this.setRoute(newIndices, lengthNormalized, newSources);
                        // Do not change looping preference on manual tap edits; looping is user-controlled
                        this.render();
                    } catch (err) {
                        console.warn('Route edit tap failed:', err);
                    }
                    return;
                }

                if (this.editMarkersMode) {
                    // In edit mode: allow deletion (custom markers are editable regardless of flags)
                    const isCustom = (layerKey === 'customMarkers');
                    if (isDeletable || isCustom) {
                        if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.deleteCustomMarker === 'function') {
                            MarkerUtils.deleteCustomMarker(hit.marker.uid);
                            this.checkMarkerHover(localX, localY);
                        }
                    }
                } else {
                    // Normal mode: selection and tooltip behavior
                    if (isSelectable) {
                        const uid = hit.marker.uid;
                        if (this.selectedMarker && this.selectedMarker.uid === uid && this.selectedMarkerLayer === layerKey) {
                            // deselect
                            this.selectedMarker = null;
                            this.selectedMarkerLayer = null;
                            this.hideTooltip();
                            this.render();
                        } else {
                            // select
                            this.selectedMarker = hit.marker;
                            this.selectedMarkerLayer = layerKey;
                            // compute screen coords for tooltip placement
                            const screenX = hit.marker.x * MAP_SIZE * this.zoom + this.panX;
                            const screenY = hit.marker.y * MAP_SIZE * this.zoom + this.panY;
                            this.showTooltip(hit.marker, screenX, screenY, layerKey);
                            this.render();
                        }
                    }
                }
            } else if (e.button === 0 && isQuickTap && !hit) {
                // If a marker is currently selected, a quick tap anywhere on the
                // map should deselect it (not start a placement). This avoids
                // accidental placement while the user intends to dismiss selection.
                if (this.selectedMarker) {
                    this.selectedMarker = null;
                    this.selectedMarkerLayer = null;
                    try { this.hideTooltip(); } catch (e) {}
                    try { this.render(); } catch (e) {}
                    return;
                }
                // Quick tap on empty space - place custom marker
                // Reuse previously computed localX/localY to avoid redundant layout read
                const clientX = localX;
                const clientY = localY;

                // Convert to world coordinates (0-1 normalized)
                const worldX = (clientX - this.panX) / this.zoom / MAP_SIZE;
                const worldY = (clientY - this.panY) / this.zoom / MAP_SIZE;
                
                // Only place if within map bounds
                if (worldX >= 0 && worldX <= 1 && worldY >= 0 && worldY <= 1) {
                    // Do not allow placement when the custom markers layer is hidden
                    if (!this.layerVisibility || !this.layerVisibility.customMarkers) {
                        return;
                    }
                    // Only place markers when edit mode is active
                    if (this.editMarkersMode) {
                        if (typeof MarkerUtils !== 'undefined') {
                            MarkerUtils.addCustomMarker(worldX, worldY);
                            // MarkerUtils updates LAYERS and triggers map updates; ensure hover state refresh
                            this.checkMarkerHover(localX, localY);
                        }
                    }
                }
            }
        });
        
        // Window resize
        window.addEventListener('resize', () => {
            this.resize();
            this.render();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // debug logging removed
            // Global Escape: exit any edit mode
            if (e.key === 'Escape' || e.key === 'Esc') {
                try {
                    // Prefer clicking the toggles so their handlers run UI sync
                    const markersToggle = document.getElementById('editMarkersToggle');
                    const routeToggle = document.getElementById('editRouteToggle');
                    if (map && map.editMarkersMode) {
                        if (markersToggle) markersToggle.click(); else map.editMarkersMode = false;
                    }
                    if (map && map.editRouteMode) {
                        if (routeToggle) routeToggle.click(); else map.editRouteMode = false;
                    }
                    try { updateEditOverlay(); } catch (err) {}
                } catch (err) {}
                try { e.preventDefault(); } catch (err) {}
                return;
            }
            if (e.key === '+' || e.key === '=') {
                this.zoomIn();
                try { e.preventDefault(); } catch (err) {}
            } else if (e.key === '-') {
                this.zoomOut();
                try { e.preventDefault(); } catch (err) {}
            } else if (e.key === '0') {
                this.resetView();
                try { e.preventDefault(); } catch (err) {}
            }
        });

        // Ensure sidebar scroll is always responsive by adding explicit wheel handler
        // This bypasses any gesture delays and makes scrolling work immediately
        const controlsEl = document.querySelector('.controls');
        if (controlsEl) {
            controlsEl.addEventListener('wheel', (e) => {
                // Allow wheel events to scroll the controls immediately without any delays
                // Do not preventDefault—let the browser handle natural scrolling
                controlsEl.scrollTop += e.deltaY > 0 ? 40 : -40;
            }, { passive: true });

            // Also handle pointer events on sidebar to enable touch scrolling
            controlsEl.addEventListener('pointerdown', (e) => {
                // Reset momentum by forcing the element to a neutral state
                controlsEl.style.scrollBehavior = 'auto';
            }, { passive: true });
        }
    }
    
    zoomIn() {
        const centerX = this.canvas.clientWidth / 2;
        const centerY = this.canvas.clientHeight / 2;
        const worldX = (centerX - this.panX) / this.zoom;
        const worldY = (centerY - this.panY) / this.zoom;
        
        this.zoom = Math.min(MAX_ZOOM, this.zoom * 1.3);
        
        this.panX = centerX - worldX * this.zoom;
        this.panY = centerY - worldY * this.zoom;
        
        this.updateResolution();
        this.render();
        // Update cursor hover after programmatic zoom
        try {
            const rect = this.canvas.getBoundingClientRect();
            let localX, localY;
            if (Number.isFinite(this.lastMouseX) && Number.isFinite(this.lastMouseY)) {
                localX = this.lastMouseX - rect.left;
                localY = this.lastMouseY - rect.top;
            } else {
                localX = rect.width / 2;
                localY = rect.height / 2;
            }
            this.checkMarkerHover(localX, localY);
            try { this.saveViewToStorage(); } catch (err) {}
        } catch (err) {}
    }
    
    zoomOut() {
        const centerX = this.canvas.clientWidth / 2;
        const centerY = this.canvas.clientHeight / 2;
        const worldX = (centerX - this.panX) / this.zoom;
        const worldY = (centerY - this.panY) / this.zoom;
        
        this.zoom = Math.max(this.minZoom || DEFAULT_MIN_ZOOM, this.zoom / 1.3);
        
        this.panX = centerX - worldX * this.zoom;
        this.panY = centerY - worldY * this.zoom;
        
        this.updateResolution();
        this.render();
        // Update cursor hover after programmatic zoom
        try {
            const rect = this.canvas.getBoundingClientRect();
            let localX, localY;
            if (Number.isFinite(this.lastMouseX) && Number.isFinite(this.lastMouseY)) {
                localX = this.lastMouseX - rect.left;
                localY = this.lastMouseY - rect.top;
            } else {
                localX = rect.width / 2;
                localY = rect.height / 2;
            }
            this.checkMarkerHover(localX, localY);
            try { this.saveViewToStorage(); } catch (err) {}
        } catch (err) {}
    }
    
    resetView() {
        // Reset view to the same initial fit used on page load (fit full map into container)
        const cssWidth = this.canvas.parentElement.clientWidth;
        const cssHeight = this.canvas.parentElement.clientHeight;
        // Reserve padding for axis labels (match constructor logic)
        const labelFontMax = 48;
        const labelPadding = 8;
        const halfW = labelFontMax * 0.6;
        const halfH = labelFontMax / 2;
        const availW = Math.max(32, cssWidth - 2 * (labelPadding + halfW));
        const availH = Math.max(32, cssHeight - 2 * (labelPadding + halfH));
        const fitZoom = Math.min(availW / MAP_SIZE, availH / MAP_SIZE);
        this.zoom = Math.max(this.minZoom || DEFAULT_MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));
        this.centerMap();
        this.updateResolution();
        // Ensure an appropriately-sized tile image is loaded for the reset view
        try { this.loadInitialImage(); } catch (e) {}
        this.render();
        // Update cursor hover after resetting view
        try {
            const rect = this.canvas.getBoundingClientRect();
            let localX, localY;
            if (Number.isFinite(this.lastMouseX) && Number.isFinite(this.lastMouseY)) {
                localX = this.lastMouseX - rect.left;
                localY = this.lastMouseY - rect.top;
            } else {
                localX = rect.width / 2;
                localY = rect.height / 2;
            }
            this.checkMarkerHover(localX, localY);
            try { this.saveViewToStorage(); } catch (err) {}
        } catch (err) {}
    }
    
    // Save / restore helpers for map view (panX, panY, zoom)
    scheduleSaveMapView() {
        try {
            if (this._saveViewTimer) clearTimeout(this._saveViewTimer);
        } catch (e) {}
        try {
            this._saveViewTimer = setTimeout(() => {
                try { this.saveViewToStorage(); } catch (e) {}
            }, 300);
        } catch (e) {}
    }

    saveViewToStorage() {
        try {
            const obj = { panX: Number(this.panX || 0), panY: Number(this.panY || 0), zoom: Number(this.zoom || 0) };
            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                window._mp4Storage.saveSetting('mp4_map_view', obj);
            } else {
                try { localStorage.setItem('mp4_map_view', JSON.stringify(obj)); } catch (e) {}
            }
        } catch (e) {}
    }

    loadViewFromStorage() {
        try {
            const v = loadMapViewFromStorage();
            if (!v || typeof v !== 'object') return false;
            if (typeof v.zoom === 'number' && Number.isFinite(v.zoom)) {
                this.zoom = Math.max(this.minZoom || DEFAULT_MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom));
            }
            if (typeof v.panX === 'number' && Number.isFinite(v.panX)) this.panX = v.panX;
            if (typeof v.panY === 'number' && Number.isFinite(v.panY)) this.panY = v.panY;
            try { this.updateResolution(); } catch (e) {}
            try { this.render(); } catch (e) {}
            return true;
        } catch (e) { return false; }
    }

    loadInitialImage() {
        const needed = this.getNeededResolution();
        this.loadImage(needed);
    }
    
    loadImage(resolutionIndex) {
        const size = RESOLUTIONS[resolutionIndex];
        if (this.images[resolutionIndex]) {
            this.currentImage = this.images[resolutionIndex];
            this.currentResolution = resolutionIndex;
            this.render();
            return;
        }

        if (this.loadingResolution === resolutionIndex) return;
        this.loadingResolution = resolutionIndex;

        const gen = this._tilesetGeneration;
        const folder = this.getTilesetFolder();
        const href = `tiles/${folder}/${size}.avif`;

        // Try fetch + createImageBitmap first (abortable)
        (async () => {
            let controller = null;
            try {
                if (window.fetch && window.createImageBitmap) {
                    controller = new AbortController();
                    try { this._imageControllers[resolutionIndex] = controller; } catch (e) {}
                    // Abort fetch if it takes longer than the bitmap timeout window
                    let fetchTimer = null;
                    try {
                        fetchTimer = setTimeout(() => {
                            try { controller.abort(); } catch (e) {}
                        }, this._bitmapTimeoutMs || 15000);
                    } catch (e) { fetchTimer = null; }

                    const resp = await fetch(href, { signal: controller.signal });
                    try { if (fetchTimer) clearTimeout(fetchTimer); } catch (e) {}
                    try { delete this._imageControllers[resolutionIndex]; } catch (e) {}
                    if (!resp.ok) throw new Error('fetch-failed');
                    const blob = await resp.blob();
                    if (this._tilesetGeneration !== gen) { this.loadingResolution = null; return; }

                    // Use the bitmap task queue to limit concurrent decodes. If the
                    // decode times out, treat it as a graceful failure (bmp === null)
                    // so we fall back to the <img> path and keep the queue draining.
                    let bmp = null;
                    try {
                        bmp = await this._runBitmapTask(() => createImageBitmap(blob));
                    } catch (e) {
                        // decode failed or timed out -> do not retry here, fall back
                        bmp = null;
                    }

                        if (bmp) {
                        try { bmp._tilesetFolder = folder; } catch (e) {}
                        // Close previous ImageBitmap if we are replacing, but avoid
                        // closing bitmaps that are currently referenced elsewhere
                        try {
                            const prev = this._imageBitmaps[resolutionIndex];
                            if (prev && typeof prev.close === 'function') {
                                let safeToClose = true;
                                if (prev === this.currentImage) safeToClose = false;
                                try {
                                    for (const v of Object.values(this.images || {})) {
                                        if (v === prev) { safeToClose = false; break; }
                                    }
                                } catch (e) {}
                                if (safeToClose) { try { prev.close(); } catch (e) {} }
                            }
                        } catch (e) {}
                        if (this._tilesetGeneration === gen) {
                            try { this._imageBitmaps[resolutionIndex] = bmp; } catch (e) {}
                            try { this.images[resolutionIndex] = bmp; } catch (e) {}
                        } else {
                            try { if (bmp && typeof bmp.close === 'function') bmp.close(); } catch (e) {}
                            this.loadingResolution = null;
                            try { /* discarded due to generation change */ } catch (e) {}
                            return;
                        }
                        this.loadingResolution = null;
                        // Use this image if appropriate
                        try {
                            const curFolder = this.getTilesetFolder();
                            const imgFolder = bmp._tilesetFolder || null;
                            if ((imgFolder && imgFolder === curFolder) || (!this.currentImage || resolutionIndex === this.getNeededResolution())) {
                                this.currentImage = bmp;
                                this.currentResolution = resolutionIndex;
                                this.render();
                            }
                        } catch (e) {}
                        this.updateResolution();
                        return;
                    }
                    // If bmp is null (timeout or decode error) fall through to <img> fallback
                }
            } catch (err) {
                try { delete this._imageControllers[resolutionIndex]; } catch (e) {}
            }

            // Fallback to <img>
            try {
                const img = new Image();
                try { img._tilesetFolder = folder; } catch (e) {}
                try { this._imageElements[resolutionIndex] = img; } catch (e) {}
                img.onload = () => {
                    try {
                        this.images[resolutionIndex] = img;
                        this.loadingResolution = null;
                        try { /* img stored for resolution */ } catch (e) {}
                        const curFolder = this.getTilesetFolder();
                        const imgFolder = img._tilesetFolder || null;
                        if ((imgFolder && imgFolder === curFolder) || (!this.currentImage || resolutionIndex === this.getNeededResolution())) {
                            this.currentImage = img;
                            this.currentResolution = resolutionIndex;
                            this.render();
                        }
                        this.updateResolution();
                    } catch (e) { this.loadingResolution = null; }
                };
                img.onerror = () => { this.loadingResolution = null; };
                img.src = href;
            } catch (e) {
                this.loadingResolution = null;
                // error logging removed
            }
        })();
    }

    setTileset(tileset) {
        try { tileset = String(tileset); } catch (e) { return; }
        if (!tileset) return;
        if (this.tileset === tileset) return;
        if (tileset !== 'sat' && tileset !== 'holo') return;
        this.tileset = tileset;
        // Increment generation and abort any in-flight tile loads from previous tileset
        try { this._tilesetGeneration = (this._tilesetGeneration || 0) + 1; } catch (e) {}
        try { this._abortAndCleanupTileLoads(); } catch (e) {}
                    try { if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') window._mp4Storage.saveSetting('mp4_tileset', tileset); /* do not write without consent/helper */ } catch (e) {}
        // Clear cached images and reload (folder may change depending on
        // whether grayscale variants are enabled)
        this.images = {};
        this.currentImage = null;
        this.currentResolution = 0;
        this.loadingResolution = null;
        try { this.preloadAllMapImages(); } catch (e) {}
        try { this.loadInitialImage(); } catch (e) {}
        try { this.render(); } catch (e) {}
    }

    // Return the tiles folder name depending on current tileset and whether
    // grayscale variants are enabled. Example: 'sat' or 'sat_bw'.
    getTilesetFolder() {
        try {
            const base = String(this.tileset || 'sat');
            return this.tilesetGrayscale ? `${base}_bw` : base;
        } catch (e) { return this.tilesetGrayscale ? 'sat_bw' : 'sat'; }
    }

    setTilesetGrayscale(enabled) {
        enabled = !!enabled;
        if (this.tilesetGrayscale === enabled) return;
        this.tilesetGrayscale = enabled;
        try { if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') window._mp4Storage.saveSetting('mp4_tileset_grayscale', this.tilesetGrayscale ? '1' : '0'); /* do not write without consent/helper */ } catch (e) {}
        try {
            // increment generation and abort previous loads so we don't mix tilesets
            try { this._tilesetGeneration = (this._tilesetGeneration || 0) + 1; } catch (e) {}
            try { this._abortAndCleanupTileLoads(); } catch (e) {}
            // Switch to grayscale tile folder and reload tiles instead of
            // applying runtime canvas filters.
            this.images = {};
            this.currentImage = null;
            this.currentResolution = 0;
            this.loadingResolution = null;
            try { this.preloadAllMapImages(); } catch (e) {}
            try { this.loadInitialImage(); } catch (e) {}
            try { this.renderTiles(); } catch (e) {}
        } catch (e) {}
    }
    
    getNeededResolution() {
        // Calculate displayed size of the map on screen in CSS pixels
        const displayedCss = MAP_SIZE * this.zoom;
        const dpr = window.devicePixelRatio || 1;
        const displayedPx = displayedCss * dpr;

        // Find the smallest resolution that covers the displayed size in device pixels
        for (let i = 0; i < RESOLUTIONS.length; i++) {
            if (RESOLUTIONS[i] >= displayedPx) {
                return i;
            }
        }
        return RESOLUTIONS.length - 1;
    }

    // Abort and cleanup any in-flight tile loads, image elements, and ImageBitmaps
    _abortAndCleanupTileLoads() {
        try {
            // Abort fetches
            for (const k in this._imageControllers) {
                try { this._imageControllers[k].abort(); } catch (e) {}
            }
        } catch (e) {}
        this._imageControllers = {};

        try {
            // Remove and neutralize image elements
            for (const k in this._imageElements) {
                try {
                    const img = this._imageElements[k];
                    img.onload = null;
                    img.onerror = null;
                    try { img.src = ''; } catch (e) {}
                } catch (e) {}
            }
        } catch (e) {}
        this._imageElements = {};

        try {
            // Close ImageBitmaps when possible to free GPU memory, but avoid
            // closing bitmaps that are currently referenced by `this.currentImage`
            // or present in `this.images` to prevent use-after-close.
            for (const k in this._imageBitmaps) {
                try {
                    const bmp = this._imageBitmaps[k];
                    if (!bmp || typeof bmp.close !== 'function') continue;
                    // If this bitmap is the one currently displayed, skip closing
                    if (bmp === this.currentImage) continue;
                    // If any entry in this.images references the same bitmap, skip
                    let inUse = false;
                    try {
                        for (const v of Object.values(this.images || {})) {
                            if (v === bmp) { inUse = true; break; }
                        }
                    } catch (e) {}
                    if (inUse) continue;
                    try { bmp.close(); } catch (e) {}
                } catch (e) {}
            }
        } catch (e) {}
        // Rebuild bitmap map: keep a reference to the currently used bitmap if any
        const preserved = {};
        try {
            if (this.currentImage && typeof this.currentImage !== 'string' && typeof this.currentImage !== 'number') {
                // If currentImage is an ImageBitmap, preserve it under its resolution
                if (this.currentResolution != null && this._imageBitmaps && this._imageBitmaps[this.currentResolution] === this.currentImage) {
                    preserved[this.currentResolution] = this.currentImage;
                }
            }
        } catch (e) {}
        this._imageBitmaps = preserved;
    }

    // Run a bitmap decode task with concurrency limiting. `fn` should return
    // a Promise that resolves to an ImageBitmap.
    _runBitmapTask(fn) {
        return new Promise((resolve, reject) => {
            const task = async () => {
                this._bitmapActive++;
                try {
                    const res = await this._withTimeout(() => fn(), this._bitmapTimeoutMs);
                    resolve(res);
                } catch (e) {
                    reject(e);
                } finally {
                    this._bitmapActive--;
                    // schedule next queued task
                    const next = this._bitmapQueue.shift();
                    if (next) setTimeout(next, 0);
                }
            };

            if (this._bitmapActive < (this._bitmapLimit || 2)) {
                task();
            } else {
                this._bitmapQueue.push(task);
            }
        });
    }

    // Helper: run a promise-returning function with a timeout (ms)
    _withTimeout(fn, ms) {
        return new Promise((resolve, reject) => {
            let done = false;
            const timer = setTimeout(() => {
                if (done) return;
                done = true;
                reject(new Error('bitmap-decode-timeout'));
            }, ms || 0);

            Promise.resolve()
                .then(() => fn())
                .then((v) => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    resolve(v);
                })
                .catch((err) => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    // Expose simple runtime stats for diagnostics
    getTileLoadStats() {
        return {
            bitmapActive: this._bitmapActive || 0,
            bitmapQueue: (this._bitmapQueue && this._bitmapQueue.length) || 0,
            imageControllers: Object.keys(this._imageControllers || {}).length,
            imageBitmaps: Object.keys(this._imageBitmaps || {}).length
        };
    }
    

    // Draw tiles into the dedicated tile canvas. If `ctxTiles` is not
    // available, fall back to drawing into the overlay context.
    renderTiles() {
        const ctxT = this.ctxTiles || this.ctx;
        if (!ctxT) return;
        const cssWidth = (this.canvasTiles || this.canvas).clientWidth;
        const cssHeight = (this.canvasTiles || this.canvas).clientHeight;

        // Clear background (use app theme dark-blue) and draw subtle honeycomb pattern
        try {
            // Base fill
            ctxT.fillStyle = '#041018';
            ctxT.fillRect(0, 0, cssWidth, cssHeight);

            // Use a cached honeycomb pattern (offscreen canvas) for performance.
            try {
                // Create pattern canvas if missing (size tuned for low-spec devices)
                if (!this._honeycombPatternCanvas) {
                    // default base size; increase on low-spec to reduce density
                    const baseSize = 28;
                    const preferred = (this._lowSpec ? Math.round(baseSize * 1.6) : baseSize);
                    this._createHoneycombPattern(preferred);
                }

                if (this._honeycombPatternCanvas) {
                    if (!this._honeycombPattern) {
                        try { this._honeycombPattern = ctxT.createPattern(this._honeycombPatternCanvas, 'repeat'); } catch (e) { this._honeycombPattern = null; }
                    }
                    if (this._honeycombPattern) {
                        ctxT.save();
                        ctxT.fillStyle = this._honeycombPattern;
                        ctxT.fillRect(0, 0, cssWidth, cssHeight);
                        ctxT.restore();
                    }
                }
            } catch (e) {}
        } catch (e) {}

        if (this.currentImage) {
            const size = MAP_SIZE * this.zoom;
            try { ctxT.imageSmoothingEnabled = true; ctxT.imageSmoothingQuality = 'high'; } catch (e) {}
            try { ctxT.drawImage(this.currentImage, this.panX, this.panY, size, size); } catch (e) {}
        }
    }

    // Create a reusable honeycomb pattern on an offscreen canvas.
    // `size` is the hex radius in CSS pixels. This function respects DPR
    // and low-spec heuristics so the pattern density is reduced on weaker devices.
    _createHoneycombPattern(size = 28) {
        try {
            const dpr = window.devicePixelRatio || 1;
            const base = Number(size) || 28;
            // Adapt hex size slightly based on viewport width so the pattern
            // becomes a bit denser on wide viewports and shrinks on narrow ones.
            const container = this.canvasTiles || this.canvas;
            const containerWidth = (container && container.clientWidth) ? container.clientWidth : (window.innerWidth || 1024);
            const refWidth = 1024; // reference width for scaling
            const viewportRatio = Math.min(1, containerWidth / refWidth);
            const maxShrink = 1; // max 18% shrink on very small viewports
            const viewportMultiplier = 1 - (1 - viewportRatio) * maxShrink;
            // Use a continuous (float) size so the pattern shrinks smoothly
            // with viewport width instead of stepping through integer sizes.
            const adaptiveBase = Math.max(10, base * viewportMultiplier);
            const r = this._lowSpec ? (adaptiveBase * 1.6) : adaptiveBase;
            const hexH = Math.sqrt(3) * r;
            const hSpacing = 1.5 * r;
            const vSpacing = hexH;

            // Pattern tile extents (use integer pixels to avoid blurry seams)
            // Make the pattern tile cover two columns and two rows so repetition is seamless
            const tileW = Math.max(2, Math.ceil(hSpacing * 2));
            const tileH = Math.max(2, Math.ceil(vSpacing * 2));

            const pc = document.createElement('canvas');
            pc.width = Math.max(1, Math.floor(tileW * dpr));
            pc.height = Math.max(1, Math.floor(tileH * dpr));
            const pctx = pc.getContext('2d');
            // Draw in CSS pixels by scaling for DPR
            pctx.scale(dpr, dpr);

            pctx.fillStyle = 'rgba(6,20,30,0.28)';
            pctx.strokeStyle = 'rgba(34,211,238,0.06)';
            pctx.lineWidth = 1;

            // Start slightly negative so partial hexes at the edges are drawn
            const xStart = -hSpacing;
            const yStart = -vSpacing;
            const cols = Math.ceil(tileW / hSpacing) + 3;
            const rows = Math.ceil(tileH / vSpacing) + 3;

            for (let col = 0; col < cols; col++) {
                for (let row = 0; row < rows; row++) {
                    const cx = xStart + col * hSpacing;
                    const cy = yStart + row * vSpacing + (col % 2 ? vSpacing / 2 : 0);
                    // Draw hexagon centered at (cx, cy)
                    pctx.beginPath();
                    for (let i = 0; i < 6; i++) {
                        const angle = (Math.PI / 180) * (60 * i);
                        const x = cx + r * Math.cos(angle);
                        const y = cy + r * Math.sin(angle);
                        if (i === 0) pctx.moveTo(x, y); else pctx.lineTo(x, y);
                    }
                    pctx.closePath();
                    pctx.fill();
                    pctx.stroke();
                }
            }

            // Rotate the pattern tile by 90 degrees into a new canvas so the
            // repeated pattern appears rotated without changing tiling behavior.
            try {
                const rc = document.createElement('canvas');
                // For a 90deg rotation swap width/height to avoid clipping
                rc.width = pc.height;
                rc.height = pc.width;
                const rctx = rc.getContext('2d');
                // Translate to center, rotate 90deg, draw original
                rctx.translate(rc.width / 2, rc.height / 2);
                rctx.rotate(Math.PI / 2);
                rctx.drawImage(pc, -pc.width / 2, -pc.height / 2);
                this._honeycombPatternCanvas = rc;
            } catch (e) {
                // Fallback to the original pattern if rotation fails
                this._honeycombPatternCanvas = pc;
            }
            this._honeycombPattern = null;
        } catch (e) {
            // ignore pattern creation failures
            this._honeycombPatternCanvas = null;
            this._honeycombPattern = null;
        }
    }
    
    updateResolution() {
        const needed = this.getNeededResolution();
        
        if (needed !== this.currentResolution && this.loadingResolution !== needed) {
            this.loadImage(needed);
        }
        
        // Update status display
        const status = document.getElementById('resolutionStatus');
        if (status) {
            const res = RESOLUTIONS[this.currentResolution] || RESOLUTIONS[0];
            status.textContent = `${res}px`;
        }
        
        const zoomStatus = document.getElementById('zoomStatus');
        if (zoomStatus) {
            zoomStatus.textContent = `${(this.zoom * 100).toFixed(0)}%`;
        }
    }
    
    setMarkers(markers) {
        this.markers = markers;
        this.customMarkers = (LAYERS && LAYERS.customMarkers && Array.isArray(LAYERS.customMarkers.markers)) ? LAYERS.customMarkers.markers : this.customMarkers;
        this.render();
        this.updateLayerCounts();
    }
    
    updateCustomMarkerCount() {
        // Backwards-compatible alias: update all layer counts
        this.updateLayerCounts();
    }

    // Update counts for all layers in the sidebar (predictable element IDs)
    updateLayerCounts() {
        try {
            const entries = Object.entries(LAYERS || {});
            for (let i = 0; i < entries.length; i++) {
                const layerKey = entries[i][0];
                const layer = entries[i][1];
                const spanId = (layerKey === 'route') ? 'routeLength' : `${layerKey}Count`;
                const el = document.getElementById(spanId);
                if (!el) continue;
                if (layerKey === 'route') {
                    if (this.currentRoute && this.currentRoute.length) {
                        // show normalized map units (map width = 1) with 4 decimal places.
                        const norm = (typeof this.currentRouteLengthNormalized === 'number') ? this.currentRouteLengthNormalized : (this.currentRouteLength / MAP_SIZE || 0);
                        // show just the numeric value (no unit suffix) per request
                        el.textContent = `${norm.toFixed(4)}`;
                    } else {
                        // no route -> display 0
                        el.textContent = '0';
                    }
                } else if (Array.isArray(layer.markers)) {
                    // If layer provides a maxMarkers field use it; otherwise try runtime layerConfig, else just show count
                    const configuredMax = (typeof layer.maxMarkers === 'number') ? layer.maxMarkers : (this.layerConfig && this.layerConfig[layerKey] && this.layerConfig[layerKey].maxMarkers);
                    if (typeof configuredMax === 'number') {
                        el.textContent = `${layer.markers.length} / ${configuredMax}`;
                    } else {
                        el.textContent = `${layer.markers.length}`;
                    }
                } else if (typeof layer.markerCountText === 'string') {
                    el.textContent = layer.markerCountText;
                } else {
                    el.textContent = '';
                }
            }
        } catch (e) {
            // ignore DOM errors
        }
    }
    
    toggleMarkers(show) {
        this.toggleLayer('greenCrystals', show);
    }
    
    toggleCustomMarkers(show) {
        this.toggleLayer('customMarkers', show);
    }

    // Generic layer toggle handler: updates runtime visibility and performs per-layer side-effects
    toggleLayer(layerKey, show) {
        if (!this.layerVisibility) this.layerVisibility = {};
        this.layerVisibility[layerKey] = !!show;
        // (debug logs removed)

        // If hiding a layer that currently has a selected marker, clear selection
        if (!show && this.selectedMarkerLayer === layerKey) {
            this.selectedMarker = null;
            this.selectedMarkerLayer = null;
            this.hideTooltip();
        }

        // Only re-render the overlay (markers/route/tooltip). Tiles are expensive
        // to redraw at high zoom and don't change when toggling layers.
        try { this.renderOverlay(); } catch (e) { try { this.render(); } catch (e) {} }
    }
    
    checkMarkerHover(mouseX, mouseY) {
        // If a drag candidate or active drag exists, keep the grabbing cursor
        // to avoid flicker before a drag is promoted.
        if (this._draggingCandidate || this._draggingMarker) {
            try { this.canvas.style.cursor = 'grabbing'; } catch (e) {}
            return;
        }

        // Only determine whether the cursor is over any marker (for pointer cursor).
        // Selection and tooltip display are managed via click/tap toggles, not hover.
        // compute per-marker hit testing so highlighted/selected markers (larger) are detected properly
        let foundCursor = false;

        // Iterate layers defined in LAYERS to detect hover over any visible marker
        const entries = Object.entries(LAYERS || {});
        for (let li = entries.length - 1; li >= 0 && !foundCursor; li--) {
            const layerKey = entries[li][0];
            const layer = entries[li][1];
            if (!this.layerVisibility[layerKey]) continue;
            if (!Array.isArray(layer.markers)) continue;
            for (let i = layer.markers.length - 1; i >= 0; i--) {
                const marker = layer.markers[i];
                const screenX = marker.x * MAP_SIZE * this.zoom + this.panX;
                const screenY = marker.y * MAP_SIZE * this.zoom + this.panY;
                const r = this.getMarkerHitRadius(marker, layerKey);
                if (Math.hypot(mouseX - screenX, mouseY - screenY) < r) {
                    foundCursor = true;
                    break;
                }
            }
        }

        this.canvas.style.cursor = foundCursor ? 'pointer' : 'grab';
        // Only re-render when necessary (cursor state change may not require a full redraw,
        // but keep render for simplicity to ensure any visual selection overlay remains correct).
        this.render();
    }

    // Find marker at screen coordinates; returns { marker, index, layerKey } or null
    findMarkerAt(screenX, screenY) {
        const entries = Object.entries(LAYERS || {});
        // Iterate in reverse so later layers (higher in DOM) get priority
        for (let li = entries.length - 1; li >= 0; li--) {
            const layerKey = entries[li][0];
            const layer = entries[li][1];
            if (!this.layerVisibility[layerKey]) continue;
            if (!Array.isArray(layer.markers)) continue;
            for (let i = layer.markers.length - 1; i >= 0; i--) {
                const marker = layer.markers[i];
                const mx = marker.x * MAP_SIZE * this.zoom + this.panX;
                const my = marker.y * MAP_SIZE * this.zoom + this.panY;
                const r = this.getMarkerHitRadius(marker, layerKey);
                if (Math.hypot(screenX - mx, screenY - my) < r) {
                    return { marker: marker, index: i, layerKey };
                }
            }
        }

        return null;
    }

    // Find a route segment near screen coordinates. Returns { index } where
    // index is the index of the first node of the segment (i.e., segment between i and i+1).
    findRouteSegmentAt(screenX, screenY, threshold = 10) {
        try {
            if (!this.currentRoute || !Array.isArray(this._routeSources) || this.currentRoute.length < 2) return null;
            // If the pointer is within any route node's hit radius, treat as node interaction (do not select a segment)
            try {
                const nodeRadius = (typeof this.getRouteNodeSize === 'function') ? (this.getRouteNodeSize() + 4) : 8;
                for (let i = 0; i < this.currentRoute.length; i++) {
                    const idxN = this.currentRoute[i];
                    const srcN = this._routeSources && this._routeSources[idxN];
                    if (!srcN || !srcN.marker) continue;
                    const nx = srcN.marker.x * MAP_SIZE * this.zoom + this.panX;
                    const ny = srcN.marker.y * MAP_SIZE * this.zoom + this.panY;
                    if (Math.hypot(screenX - nx, screenY - ny) <= nodeRadius) return null;
                }
            } catch (e) {}
            let best = null;
            const len = this.currentRoute.length;
            const segCount = this.routeLooping ? len : (len - 1);
            for (let i = 0; i < segCount; i++) {
                const idxA = this.currentRoute[i];
                const idxB = this.currentRoute[(i + 1) % len];
                const srcA = this._routeSources && this._routeSources[idxA];
                const srcB = this._routeSources && this._routeSources[idxB];
                if (!srcA || !srcB || !srcA.marker || !srcB.marker) continue;
                const ax = srcA.marker.x * MAP_SIZE * this.zoom + this.panX;
                const ay = srcA.marker.y * MAP_SIZE * this.zoom + this.panY;
                const bx = srcB.marker.x * MAP_SIZE * this.zoom + this.panX;
                const by = srcB.marker.y * MAP_SIZE * this.zoom + this.panY;
                // Project point P onto segment AB
                const vx = bx - ax, vy = by - ay;
                const wx = screenX - ax, wy = screenY - ay;
                const vlen2 = vx * vx + vy * vy;
                if (vlen2 <= 0) continue;
                const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vlen2));
                const px = ax + vx * t;
                const py = ay + vy * t;
                const dist = Math.hypot(screenX - px, screenY - py);
                if (dist <= threshold) {
                    if (!best || dist < best.dist) best = { index: i, dist, t };
                }
            }
            return best;
        } catch (e) { return null; }
    }

    // Compute normalized (map width = 1) non-looping length for given sources array
    computeRouteLengthNormalized(sources) {
        try {
            if (!Array.isArray(sources) || sources.length < 2) return 0;
            let lengthPx = 0;
            for (let i = 1; i < sources.length; i++) {
                const a = sources[i - 1].marker;
                const b = sources[i].marker;
                if (!a || !b) continue;
                const dx = (b.x - a.x) * MAP_SIZE;
                const dy = (b.y - a.y) * MAP_SIZE;
                lengthPx += Math.hypot(dx, dy);
            }
            return lengthPx / MAP_SIZE;
        } catch (e) { return 0; }
    }
    
    showTooltip(marker, x, y, layerKey) {
        if (!this.tooltip) return;

        // Determine layer key: explicit param, or selected/hovered fallback
        const key = layerKey || this.selectedMarkerLayer || this.hoveredMarkerLayer;
        let layerName = 'Marker';
        if (key && LAYERS[key]) {
            layerName = LAYERS[key].name;
        }

        // Try to find the marker index in the layer (1-based for display)
        let displayIndex = null;
        if (key && LAYERS[key] && Array.isArray(LAYERS[key].markers)) {
            const arr = LAYERS[key].markers;
            for (let i = 0; i < arr.length; i++) {
                if (arr[i].uid === marker.uid) { displayIndex = i + 1; break; }
            }
        }

        // Display layer name, optional index, then marker UID
        const idxPart = (displayIndex !== null) ? ` ${displayIndex}` : '';
        this.tooltip.textContent = `${layerName}${idxPart} - ${marker.uid}`;
        this.tooltip.style.left = `${x + 15}px`;
        this.tooltip.style.top = `${y - 10}px`;
        // Style tooltip using the layer's color when available
        try {
            const layerCol = (key && LAYERS && LAYERS[key] && LAYERS[key].color) ? LAYERS[key].color : null;
            if (layerCol) {
                try { this.tooltip.style.borderColor = layerCol; } catch (e) {}
                try { if (typeof colorToRgba === 'function') this.tooltip.style.background = colorToRgba(layerCol, 0.12) || this.tooltip.style.background; } catch (e) {}
            } else {
                try { this.tooltip.style.borderColor = '#22d3ee'; } catch (e) {}
                try { this.tooltip.style.background = 'rgba(10, 25, 41, 0.95)'; } catch (e) {}
            }
        } catch (e) {}
        this.tooltip.style.display = 'block';
    }
    
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
    }
    
    render() {
        // Full redraw: tiles + overlay
        try { this.renderTiles(); } catch (e) {}
        try { this.renderOverlay(); } catch (e) {}
    }

    // Draw only the overlay contents (route, markers, tooltip).
    renderOverlay() {
        const ctx = this.ctx;
        const cssWidth = this.canvas.clientWidth;
        const cssHeight = this.canvas.clientHeight;

        // Clear overlay (transparent) before drawing route/markers
        try { ctx.clearRect(0, 0, cssWidth, cssHeight); } catch (e) {}

        // Draw grid overlays (toggleable via `layerVisibility.grid`)
        if (this.layerVisibility && this.layerVisibility.grid) {
            this.renderQuadrantGrid();
            this.renderDetailGrid();
        }
        // Always update the DOM quadrant labels if the helper exists.
        // The helper decides visibility based on both layer visibility
        // and highlight state so labels stay in sync with interactions.
        try {
            if (typeof this._updateGridQuadLabels === 'function') this._updateGridQuadLabels();
        } catch (e) { /* _updateGridQuadLabels failed (suppressed) */ }

        // Draw markers from all visible layers onto the overlay canvas
        this.renderMarkers();

        // Draw computed route on top of the map but beneath markers (so markers remain visible)
        this.renderRoute();

        // Draw transient route-insert preview (when hovering near a segment in edit mode)
        try {
            if (this.editRouteMode && this._routePreview && this._routePreview.screenX && this._routePreview.screenY) {
                const px = this._routePreview.screenX;
                const py = this._routePreview.screenY;
                // Derive route color like renderRoute() uses
                const routeHex = (LAYERS && LAYERS.route) ? LAYERS.route.color : null;
                const hexToRgba = (h, a) => {
                    if (!h || typeof h !== 'string') return null;
                    let s = h.replace('#', '').trim();
                    if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
                    if (s.length === 4) s = s.split('').map(ch => ch + ch).join('');
                    let r = 0, g = 0, b = 0, alphaFromHex = 1;
                    if (s.length === 6) {
                        r = parseInt(s.slice(0, 2), 16);
                        g = parseInt(s.slice(2, 4), 16);
                        b = parseInt(s.slice(4, 6), 16);
                    } else if (s.length === 8) {
                        r = parseInt(s.slice(0, 2), 16);
                        g = parseInt(s.slice(2, 4), 16);
                        b = parseInt(s.slice(4, 6), 16);
                        alphaFromHex = parseInt(s.slice(6, 8), 16) / 255;
                    } else {
                        return null;
                    }
                    const alpha = (typeof a === 'number') ? (a * alphaFromHex) : alphaFromHex;
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                };
                const nodeFill = routeHex ? hexToRgba(routeHex, 0.95) : null;
                const dotSize = (this.getRouteNodeSize && typeof this.getRouteNodeSize === 'function') ? this.getRouteNodeSize() : 6;
                ctx.save();
                ctx.beginPath();
                ctx.fillStyle = nodeFill || 'rgba(34, 211, 238, 1)';
                ctx.arc(px, py, dotSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        } catch (e) {}

        // If a marker is selected, ensure tooltip is positioned at its current screen coords
        if (this.selectedMarker && this.selectedMarkerLayer) {
            const m = this.selectedMarker;
            const screenX = m.x * MAP_SIZE * this.zoom + this.panX;
            const screenY = m.y * MAP_SIZE * this.zoom + this.panY;
            this.showTooltip(m, screenX, screenY, this.selectedMarkerLayer);
        }
    }

    // Draw the quadrant grid separating the map into 4 equal sections
    renderQuadrantGrid() {
        const ctx = this.ctx;
        const cssWidth = this.canvas.clientWidth;
        const cssHeight = this.canvas.clientHeight;
        
        // Map boundaries in screen coordinates
        const mapScreenLeft = 0 * this.zoom + this.panX;
        const mapScreenTop = 0 * this.zoom + this.panY;
        const mapScreenRight = MAP_SIZE * this.zoom + this.panX;
        const mapScreenBottom = MAP_SIZE * this.zoom + this.panY;
        
        // Map center is at (MAP_SIZE/2, MAP_SIZE/2) in normalized coords
        // Calculate screen position of center
        const mapCenterX = (MAP_SIZE / 2) * this.zoom + this.panX;
        const mapCenterY = (MAP_SIZE / 2) * this.zoom + this.panY;
        
        // Only draw grid lines if they're visible on screen
        if (mapCenterX > mapScreenLeft && mapCenterX < mapScreenRight &&
            mapCenterY > mapScreenTop && mapCenterY < mapScreenBottom) {
            
            ctx.save();
            // Scale opacity with zoom for visibility at all levels
            const opacity = Math.min(0.6, 0.15 + this.zoom * 0.5);
            // Cyan gridlines for both satellite and holo views
            ctx.strokeStyle = 'rgba(34, 211, 238, ' + opacity + ')';
            ctx.lineWidth = 2;
            
            // Vertical center line (clipped to map area)
            ctx.beginPath();
            ctx.moveTo(mapCenterX, Math.max(mapScreenTop, 0));
            ctx.lineTo(mapCenterX, Math.min(mapScreenBottom, cssHeight));
            ctx.stroke();
            
            // Horizontal center line (clipped to map area)
            ctx.beginPath();
            ctx.moveTo(Math.max(mapScreenLeft, 0), mapCenterY);
            ctx.lineTo(Math.min(mapScreenRight, cssWidth), mapCenterY);
            ctx.stroke();
            
            ctx.restore();
        }
    }

    // Draw fine detail grid covering the map area (8x8 subdivision)
    renderDetailGrid() {
        const ctx = this.ctx;
        const cssWidth = this.canvas.clientWidth;
        const cssHeight = this.canvas.clientHeight;
        
        // Map boundaries in screen coordinates
        const mapScreenLeft = 0 * this.zoom + this.panX;
        const mapScreenTop = 0 * this.zoom + this.panY;
        const mapScreenRight = MAP_SIZE * this.zoom + this.panX;
        const mapScreenBottom = MAP_SIZE * this.zoom + this.panY;
        
        // Grid spacing: divide map into 8x8 = 64 cells (each 1024x1024)
        const gridSpacing = MAP_SIZE / 8;
        
        ctx.save();
        // Scale opacity with zoom for visibility at all levels
        const opacity = Math.min(0.4, 0.05 + this.zoom * 0.3);
        // Cyan gridlines for both satellite and holo views
        ctx.strokeStyle = 'rgba(34, 211, 238, 1.0)';
        ctx.lineWidth = 1;
        
        // Draw vertical grid lines
        for (let i = 1; i < 8; i++) {
            const mapX = gridSpacing * i;
            const screenX = mapX * this.zoom + this.panX;
            
            // Only draw if visible on screen and within map area
            if (screenX > mapScreenLeft && screenX < mapScreenRight) {
                ctx.beginPath();
                ctx.moveTo(screenX, Math.max(mapScreenTop, 0));
                ctx.lineTo(screenX, Math.min(mapScreenBottom, cssHeight));
                ctx.stroke();
            }
        }
        
        // Draw horizontal grid lines
        for (let i = 1; i < 8; i++) {
            const mapY = gridSpacing * i;
            const screenY = mapY * this.zoom + this.panY;
            
            // Only draw if visible on screen and within map area
            if (screenY > mapScreenTop && screenY < mapScreenBottom) {
                ctx.beginPath();
                ctx.moveTo(Math.max(mapScreenLeft, 0), screenY);
                ctx.lineTo(Math.min(mapScreenRight, cssWidth), screenY);
                ctx.stroke();
            }
        }
        
        this.renderAxisLabels();
    }
    
    // Draw axis index labels for the 8x8 grid
    renderAxisLabels() {
        const ctx = this.ctx;
        const cssWidth = this.canvas.clientWidth;
        const cssHeight = this.canvas.clientHeight;
        
        // Map boundaries in screen coordinates
        const mapScreenLeft = 0 * this.zoom + this.panX;
        const mapScreenTop = 0 * this.zoom + this.panY;
        const mapScreenRight = MAP_SIZE * this.zoom + this.panX;
        const mapScreenBottom = MAP_SIZE * this.zoom + this.panY;
        
        // Grid spacing: divide map into 8x8 = 64 cells (each 1024x1024)
        const gridSpacing = MAP_SIZE / 8;
        
        ctx.save();
        // Compute a readable font size based on zoom but clamp it
        const fontMin = 12;
        const fontMax = 48; // avoid excessively large labels when zooming in
        const fontSize = Math.max(fontMin, Math.min(fontMax, Math.round(this.zoom * 80)));
        // Use Orbitron (with Space Grotesk fallback) for canvas axis labels to match DOM quadrant labels
        ctx.font = `700 ${fontSize}px "Orbitron", "Space Grotesk", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif`;
        ctx.textBaseline = 'middle';
        
        // Always use cyan for labels
        ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';

        // padding from map edge (pixels) and half-dimensions to keep label fully outside
        const padding = 8;
        const halfH = fontSize / 2;
        const halfW = fontSize * 0.6; // approximate half-width for centered digits

        // Draw X-axis labels (A-H) — centered on each column, placed fully outside
        ctx.textAlign = 'center';
        for (let i = 0; i < 8; i++) {
            const mapX = gridSpacing * (i + 0.5); // Center of each cell
            const screenX = mapX * this.zoom + this.panX;

            // Only draw if centered column is within the horizontal viewport
            if (screenX + halfW < 0 || screenX - halfW > cssWidth) continue;

            // Draw above the map (y placed so label bottom is at map top - padding)
            const yAbove = mapScreenTop - padding - halfH;
            if (yAbove >= 0) ctx.fillText(String.fromCharCode(65 + i), screenX, yAbove);

            // Draw below the map (y placed so label top is at map bottom + padding)
            const yBelow = mapScreenBottom + padding + halfH;
            if (yBelow <= cssHeight) ctx.fillText(String.fromCharCode(65 + i), screenX, yBelow);
        }

        // Draw Y-axis labels (1-8) — centered on each row, placed fully outside
        ctx.textAlign = 'right';
        for (let i = 0; i < 8; i++) {
            const mapY = gridSpacing * (i + 0.5); // Center of each cell
            const screenY = mapY * this.zoom + this.panY;

            // Only draw if centered row is within vertical viewport
            if (screenY + halfH < 0 || screenY - halfH > cssHeight) continue;

            // Draw left of the map (x placed so label right edge is at map left - padding)
            const xLeft = mapScreenLeft - padding - halfW;
            if (xLeft >= 0) ctx.fillText(String(i + 1), xLeft, screenY);

            // Draw right of the map (x placed so label left edge is at map right + padding)
            const xRight = mapScreenRight + padding + halfW;
            if (xRight <= cssWidth) {
                ctx.textAlign = 'left';
                ctx.fillText(String(i + 1), xRight, screenY);
                ctx.textAlign = 'right';
            }
        }

        ctx.restore();
    }
    
    // Helper: lighten a hex color by a given percentage
    lightenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
    
    // Helper: darken a hex color by a given percentage
    darkenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
    
    // Base marker radius in CSS pixels (used for rendering and hit-testing)
    getBaseMarkerRadius() {
        // Default marker sizing behavior
        // Lower the base minimum so markers can shrink more when zoomed out
        const base = Math.max(2, Math.min(16, 10 * this.zoom));
        // Ensure markers are always a bit larger than route node dots so
        // markers (and hitboxes) remain easier to interact with at high zoom.
        try {
            const nodeSize = this.getRouteNodeSize();
            return Math.max(base, nodeSize + 10 * this.zoom);
        } catch (e) {
            return base;
        }
    }

    // Compute route node dot size in a single place so markers can reference it
    getRouteNodeSize() {
        const baseLine = (typeof this.routeLineWidth === 'number') ? this.routeLineWidth : 3;
        // Computed size from stroke width and zoom. Reduce multiplier and
        // maximum so nodes (and consequently markers) remain a bit smaller
        // at high zoom levels.
        const computed = baseLine * this.zoom * 1.0;
        // Minimum size should scale with zoom but allow smaller values when
        // zoomed out.
        const minSize = Math.max(2, 3 * this.zoom);
        // Lower maximum to keep sizes more compact at high zoom
        const maxSize = 80;
        // Apply detail-scale so node dots shrink slightly as user zooms in
        const scale = this.getDetailScale ? this.getDetailScale() : 1;
        const sized = computed * scale;
        return Math.max(minSize, Math.min(maxSize, sized));
    }

    // Compute a small detail scale factor that slightly reduces marker/route
    // visuals when zoomed in to improve detailed viewing. Returns a value
    // in (0.6..1], where 1 means no shrink (zoom <= 1) and lower values
    // shrink visuals progressively for higher zoom levels.
    getDetailScale() {
        try {
            const z = (typeof this.zoom === 'number' && this.zoom > 0) ? this.zoom : 1;
                // Increase shrink intensity: allow smaller minimum and faster falloff
                const min = 0.1; // don't shrink beyond this
                const exp = 0.7; // exponent controls how quickly it shrinks
            const val = Math.pow(z, -exp);
            // Clamp to [min, 1]
            return Math.max(min, Math.min(1, val));
        } catch (e) { return 1; }
    }

    // Hit radius used for interaction (render radius + touch padding)
    getHitRadius() {
        try {
            const base = this.getBaseMarkerRadius();
            const detailScale = (typeof this.getDetailScale === 'function') ? this.getDetailScale() : 1;
            const markerShrinkFactor = (typeof this.markerShrinkFactor === 'number') ? this.markerShrinkFactor : 0.6;
            const markerScale = 1 - (1 - detailScale) * markerShrinkFactor;
            const scaled = Math.max(1, base * markerScale);
            return scaled + (this.touchPadding || 0);
        } catch (e) {
            return this.getBaseMarkerRadius() + (this.touchPadding || 0);
        }
    }

    // Compute per-marker hit radius that accounts for highlight scaling and selection
    getMarkerHitRadius(marker, layerKey) {
        try {
            // Prefer per-frame rendered size cache when available to guarantee hitbox == visual
            try {
                if (this._markerSizeFrame && marker && marker.uid) {
                    const key = (layerKey || '') + '|' + String(marker.uid);
                    const last = this._markerSizeFrame[key];
                    if (typeof last === 'number' && last > 0) return last + (this.touchPadding || 0);
                }
            } catch (e) {}
            const base = this.getBaseMarkerRadius();
            const detailScale = (typeof this.getDetailScale === 'function') ? this.getDetailScale() : 1;
            const markerShrinkFactor = (typeof this.markerShrinkFactor === 'number') ? this.markerShrinkFactor : 0.6;
            const markerScale = 1 - (1 - detailScale) * markerShrinkFactor;

            // Highlight multiplier (per-layer) if applicable
            let highlightMult = 1;
            try {
                if (this.highlightedLayers && this.highlightedLayers.has(layerKey)) {
                    const cfg = (this._highlightConfig && this._highlightConfig[layerKey]) ? this._highlightConfig[layerKey] : null;
                    highlightMult = (cfg && typeof cfg.scale === 'number') ? cfg.scale : 2.0;
                }
            } catch (e) {}

            // Selected marker gets an additional visual emphasis
            const isSelected = this.selectedMarker && marker && this.selectedMarker.uid === marker.uid && this.selectedMarkerLayer === layerKey;
            const rawSize = isSelected ? base * 1.3 * highlightMult : base * highlightMult;
            const sized = Math.max(1, rawSize * markerScale);
            return sized + (this.touchPadding || 0);
        } catch (e) {
            return this.getHitRadius();
        }
    }

    // Compute the render size for a marker — extracted so draw and hit-testing share exact logic
    getMarkerRenderSize(marker, layerKey) {
        try {
            const baseSize = this.getBaseMarkerRadius();
            const detailScale = (typeof this.getDetailScale === 'function') ? this.getDetailScale() : 1;
            const markerShrinkFactor = (typeof this.markerShrinkFactor === 'number') ? this.markerShrinkFactor : 0.6;
            const markerScale = 1 - (1 - detailScale) * markerShrinkFactor;

            // Highlight multiplier (per-layer) if applicable
            let highlightMult = 1;
            try {
                if (this.highlightedLayers && this.highlightedLayers.has(layerKey)) {
                    const cfg = (this._highlightConfig && this._highlightConfig[layerKey]) ? this._highlightConfig[layerKey] : null;
                    highlightMult = (cfg && typeof cfg.scale === 'number') ? cfg.scale : 2.0;
                    try {
                        const gm = (typeof this.highlightScaleMultiplier === 'number') ? this.highlightScaleMultiplier : 1.0;
                        highlightMult = highlightMult * gm;
                        // Allow highlighted markers to shrink down to the slider minimum
                        // (slider min is 0.6). Previously a 1.15 floor prevented reductions.
                        highlightMult = Math.max(highlightMult, 0.6);
                    } catch (e) {}
                }
            } catch (e) {}

            const isSelected = this.selectedMarker && marker && this.selectedMarker.uid === marker.uid && this.selectedMarkerLayer === layerKey;
            const rawSize = isSelected ? baseSize * 1.3 * highlightMult : baseSize * highlightMult;
            const size = Math.max(1, rawSize * markerScale);
            return size;
        } catch (e) { return Math.max(1, this.getBaseMarkerRadius()); }
    }
    
    renderMarkers() {
        const ctx = this.ctx;
        const baseSize = this.getBaseMarkerRadius();
        const detailScale = this.getDetailScale();
        // Reduce marker shrink effect so markers remain more readable at high zoom.
        const markerShrinkFactor = (typeof this.markerShrinkFactor === 'number') ? this.markerShrinkFactor : 0.6;
        const markerScale = 1 - (1 - detailScale) * markerShrinkFactor;
        // Per-frame cache mapping "<layerKey>|<uid>" -> rendered size
        try { this._markerSizeFrame = {}; } catch (e) { this._markerSizeFrame = {}; }
        const cssWidth = this.canvas.clientWidth;
        const cssHeight = this.canvas.clientHeight;
        // Generic rendering for all point-marker layers defined in LAYERS.
        const entries = Object.entries(LAYERS || {});
        for (let li = 0; li < entries.length; li++) {
            const layerKey = entries[li][0];
            const layer = entries[li][1];
            if (!this.layerVisibility[layerKey]) continue;
            if (!Array.isArray(layer.markers)) continue;

            const color = layer.color || '#888';

            for (let i = 0; i < layer.markers.length; i++) {
                const marker = layer.markers[i];
                const screenX = marker.x * MAP_SIZE * this.zoom + this.panX;
                const screenY = marker.y * MAP_SIZE * this.zoom + this.panY;

                // Skip if off-screen
                if (screenX < -20 || screenX > cssWidth + 20 || screenY < -20 || screenY > cssHeight + 20) continue;

                const isSelected = this.selectedMarker && this.selectedMarker.uid === marker.uid && this.selectedMarkerLayer === layerKey;
                // Compute render size via shared helper and cache it for this frame
                const size = this.getMarkerRenderSize(marker, layerKey);
                try {
                    const key = (layerKey || '') + '|' + (marker && marker.uid ? String(marker.uid) : String(i));
                    this._markerSizeFrame[key] = size;
                } catch (e) {}

                // Draw selection halo using the layer color (no lightening)
                if (isSelected) {
                    try {
                        ctx.save();
                        ctx.shadowBlur = Math.max(6, size * 1.5);
                        ctx.shadowColor = color;
                        ctx.beginPath();
                        ctx.arc(screenX, screenY, size + 2, 0, Math.PI * 2);
                        ctx.fillStyle = color;
                        ctx.fill();
                        ctx.restore();
                    } catch (e) {}
                }

                // Draw marker core
                ctx.beginPath();
                ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            }
        }
    }

    // Render a polyline route stored in `this.currentRoute` (array of indices)
    renderRoute() {
        if (!this.currentRoute || !Array.isArray(this.currentRoute) || this.currentRoute.length === 0) return;
        if (!this.layerVisibility.route) return;
        if (!this._routeSources || !Array.isArray(this._routeSources)) return;
        const ctx = this.ctx;
        const n = this.currentRoute.length;
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        // Use the route layer's configured color (provided by data/route.js)
        // so route rendering matches the sidebar icon backdrop. Do not provide
        // a hardcoded color fallback here — the color should come from data.
        const routeHex = (LAYERS && LAYERS.route) ? LAYERS.route.color : null;
        const hexToRgba = (h, a) => {
            if (!h || typeof h !== 'string') return null;
            let s = h.replace('#', '').trim();
            // Expand shorthand 3/4-digit hex (eg. #abc or #abcd)
            if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
            if (s.length === 4) s = s.split('').map(ch => ch + ch).join('');

            let r = 0, g = 0, b = 0, alphaFromHex = 1;
            if (s.length === 6) {
                r = parseInt(s.slice(0, 2), 16);
                g = parseInt(s.slice(2, 4), 16);
                b = parseInt(s.slice(4, 6), 16);
            } else if (s.length === 8) {
                r = parseInt(s.slice(0, 2), 16);
                g = parseInt(s.slice(2, 4), 16);
                b = parseInt(s.slice(4, 6), 16);
                alphaFromHex = parseInt(s.slice(6, 8), 16) / 255;
            } else {
                return null;
            }

            const alpha = (typeof a === 'number') ? (a * alphaFromHex) : alphaFromHex;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };
        // Use fully opaque stroke color for the route (no transparency)
        if (routeHex) ctx.strokeStyle = hexToRgba(routeHex, 1);
        // Use configurable `routeLineWidth` (base CSS pixels) scaled by zoom
        // and reduced slightly when zoomed in so strokes remain crisp.
        const baseLine = (typeof this.routeLineWidth === 'number') ? this.routeLineWidth : 3;
        const detailScale = this.getDetailScale();
        ctx.lineWidth = Math.max(1, baseLine * this.zoom * detailScale);
        // configure dashed stroke for animated route (shorter dashes; scale with zoom and base line width)
        const spacingScale = Math.max(0.35, baseLine / 5);
        // Use smaller base multipliers so dashes are shorter and tighter
        const dashLen = Math.max(3, 8 * this.zoom * spacingScale * detailScale);
        const gapLen = Math.max(3, 6 * this.zoom * spacingScale * detailScale);
        if (routeHex) {
            ctx.setLineDash([dashLen, gapLen]);
            ctx.lineDashOffset = -this._routeDashOffset;
        }

        // If the route layer is highlighted, draw a glowing, thicker under-stroke
        // using the route color before drawing the animated dashed stroke. This
        // emphasizes the path itself (not markers) when `route` highlight is on.
        try {
            const isHighlighted = !!(this.highlightedLayers && this.highlightedLayers.has('route'));
            if (isHighlighted) {
                try {
                    const glowAlpha = 0.85;
                    const glowColor = routeHex ? hexToRgba(routeHex, glowAlpha) : 'rgba(34,211,238,0.85)';
                    // Build path first then stroke with a heavy blurred stroke beneath
                    ctx.save();
                    ctx.beginPath();
                    let glowPathStarted = false;
                    for (let i = 0; i < n; i++) {
                        const idx = this.currentRoute[i];
                        const src = this._routeSources[idx];
                        const m = src && src.marker;
                        if (!m) continue;
                        const x = m.x * MAP_SIZE * this.zoom + this.panX;
                        const y = m.y * MAP_SIZE * this.zoom + this.panY;
                        if (!glowPathStarted) { ctx.moveTo(x, y); glowPathStarted = true; } else ctx.lineTo(x, y);
                    }
                    if (this.routeLooping && n > 0) {
                        const firstIdx = this.currentRoute[0];
                        const firstSrc = this._routeSources[firstIdx];
                        const firstM = firstSrc && firstSrc.marker;
                        if (firstM) {
                            const x = firstM.x * MAP_SIZE * this.zoom + this.panX;
                            const y = firstM.y * MAP_SIZE * this.zoom + this.panY;
                            ctx.lineTo(x, y);
                        }
                    }
                    // Thicker base for the glow (scale with zoom/detail)
                    const glowLine = Math.max(1, baseLine * this.zoom * detailScale) * 2.6;
                    ctx.lineWidth = glowLine;
                    ctx.strokeStyle = glowColor;
                    ctx.shadowColor = glowColor;
                    ctx.shadowBlur = 18;
                    ctx.setLineDash([]); // solid line for glow (not dashed)
                    // Draw glow underneath the main stroke
                    ctx.stroke();
                    ctx.restore();
                } catch (e) {}
            }
        } catch (e) {}

        // Draw path (main animated dashed stroke)
        ctx.beginPath();
        let mainPathStarted = false;
        for (let i = 0; i < n; i++) {
            const idx = this.currentRoute[i];
            const src = this._routeSources[idx];
            const m = src && src.marker;
            if (!m) continue;
            const x = m.x * MAP_SIZE * this.zoom + this.panX;
            const y = m.y * MAP_SIZE * this.zoom + this.panY;
            if (!mainPathStarted) { ctx.moveTo(x, y); mainPathStarted = true; } else ctx.lineTo(x, y);
        }
        // Close the loop if no start point was provided (full loop); otherwise open polyline
        if (this.routeLooping && n > 0) {
            const firstIdx = this.currentRoute[0];
            const firstSrc = this._routeSources[firstIdx];
            const firstM = firstSrc && firstSrc.marker;
            if (firstM) {
                const x = firstM.x * MAP_SIZE * this.zoom + this.panX;
                const y = firstM.y * MAP_SIZE * this.zoom + this.panY;
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        // reset dash state so other drawings are unaffected
        ctx.setLineDash([]);

        // Draw small circles at nodes using the same base color (slightly more opaque)
        const nodeFill = routeHex ? hexToRgba(routeHex, 0.95) : null;
        if (nodeFill) ctx.fillStyle = nodeFill;
        // Node dot size: use the shared helper so sizing (including min/max)
        // is consistent with marker sizing.
        const dotSize = this.getRouteNodeSize();
        for (let i = 0; i < n; i++) {
            const idx = this.currentRoute[i];
            const src = this._routeSources[idx];
            const m = src && src.marker;
            if (!m) continue;
            const x = m.x * MAP_SIZE * this.zoom + this.panX;
            const y = m.y * MAP_SIZE * this.zoom + this.panY;
            ctx.beginPath();
            ctx.arc(x, y, dotSize, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    setRoute(routeIndices, lengthNormalized, routeSources) {
        this.currentRoute = routeIndices ? routeIndices.slice() : null;
        this._routeSources = Array.isArray(routeSources) ? routeSources.slice() : null;
        // lengthNormalized is in normalized map units (map width = 1). Store both
        // normalized length and pixel length for compatibility.
        this.currentRouteLengthNormalized = typeof lengthNormalized === 'number' ? lengthNormalized : 0;
        this.currentRouteLength = this.currentRouteLengthNormalized * MAP_SIZE;
        // Reset the start-point flag when a new route is set (will be overridden by generation if applicable)
        // Do not change `routeLooping` here — looping is controlled explicitly by user preference.
        // Update route length display in sidebar
        try {
            const el = document.getElementById('routeLength');
            if (el) this.updateLayerCounts();
        } catch (e) {}

        this.render();
        // Start animated route when a route is set
        if (this.currentRoute && this.currentRoute.length) {
            // Ensure the virtual 'route' layer is visible so the computed route appears
            if (!this.layerVisibility) this.layerVisibility = {};
            this.layerVisibility.route = true;
            // If the sidebar toggle exists, check it so the UI reflects the change
            try {
                const cb = document.getElementById('toggle_route');
                if (cb) cb.checked = true;
            } catch (e) {}
            this.startRouteAnimation();
            // Persist the route so it survives reloads
            try { this.saveRouteToStorage(); } catch (e) {}
        } else {
            this.stopRouteAnimation();
        }
    }

    clearRoute() {
        this.currentRoute = null;
        this.currentRouteLength = 0;
        this.currentRouteLengthNormalized = 0;
        // Update UI counts via the central updater so it shows '0'
        try { this.updateLayerCounts(); } catch (e) {}
        this.render();
        // Stop animated route when cleared
        this.stopRouteAnimation();
        // If we were in route edit mode, exit via canonical helper so visuals cleanly update
        try { if (typeof exitEditModeForLayer === 'function') exitEditModeForLayer('route'); } catch (e) {}
        // Remove persisted route when cleared
        try {
            if (typeof RouteUtils !== 'undefined' && typeof RouteUtils.clearRoute === 'function') {
                RouteUtils.clearRoute();
            } else {
                localStorage.removeItem('mp4_saved_route');
            }
        } catch (e) {}
    }

    // Persist the current route to localStorage as an ordered list of positions with uid and layer info
    saveRouteToStorage() {
        try {
            if (!this.currentRoute || !Array.isArray(this._routeSources) || !this.currentRoute.length) return;
            const pts = [];
            for (let i = 0; i < this.currentRoute.length; i++) {
                const idx = this.currentRoute[i];
                const src = this._routeSources && this._routeSources[idx];
                if (!src || !src.marker) return; // abort if marker is missing
                // Store uid and x, y only (layer field removed - derived from UID prefix on load)
                pts.push({
                    uid: src.marker.uid || '',
                    x: Number(src.marker.x),
                    y: Number(src.marker.y)
                });
            }
            const payload = { points: pts, length: this.currentRouteLengthNormalized };
            if (typeof RouteUtils !== 'undefined' && typeof RouteUtils.saveRoute === 'function') {
                RouteUtils.saveRoute(payload);
            } else if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                window._mp4Storage.saveSetting('mp4_saved_route', payload);
            } else {
                // No storage helper available -> do not persist without explicit consent
            }
        } catch (e) {}
    }

    // Attempt to load a previously saved route from localStorage and apply it
    loadRouteFromStorage() {
        try {
            const obj = (typeof RouteUtils !== 'undefined' && typeof RouteUtils.loadRoute === 'function')
                ? RouteUtils.loadRoute()
                : null;
            if (!obj) return false;
            
            // Upgrade legacy route points if needed
            if (typeof RouteUtils !== 'undefined' && typeof RouteUtils.upgradeLegacyRoute === 'function') {
                const upgrade = RouteUtils.upgradeLegacyRoute(obj.points, LAYERS);
                if (upgrade.upgraded) {
                    alert(`Upgraded route: ${upgrade.count} points regenerated. UIDs and layers matched by coordinate hash.`);
                    // log removed
                    // Save the upgraded route back to localStorage
                    if (typeof RouteUtils !== 'undefined' && typeof RouteUtils.saveRoute === 'function') {
                        RouteUtils.saveRoute(obj);
                    }
                }
            }

            const sources = [];
            for (let i = 0; i < obj.points.length; i++) {
                const p = obj.points[i];
                if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
                    console.warn('Saved route contains invalid point at index', i);
                    return false;
                }
                // Reconstruct sources with uid and layer info
                // Extract layer by matching UID prefix
                const layerKey = (typeof RouteUtils !== 'undefined' && typeof RouteUtils.findLayerKeyByPrefix === 'function')
                    ? RouteUtils.findLayerKeyByPrefix(p.uid, LAYERS)
                    : 'unknown';
                sources.push({
                    marker: {
                        uid: p.uid || '',
                        x: p.x,
                        y: p.y
                    },
                    layerKey: layerKey,
                    layerIndex: i
                });
            }

            // Extract custom markers from saved route (those with 'cm' prefix)
            const customMarkersFromRoute = obj.points
                .filter(p => p.uid && p.uid.startsWith('cm_'))
                .map(p => ({ uid: p.uid, x: Number(p.x), y: Number(p.y) }));

            // Merge custom markers if present
            if (customMarkersFromRoute.length > 0) {
                try {
                    if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.mergeCustomMarkers === 'function') {
                        MarkerUtils.mergeCustomMarkers(customMarkersFromRoute);
                    }
                } catch (e) {
                    console.warn('Failed to merge custom markers from saved route:', e);
                }
            }

            const routeIndices = sources.map((_, i) => i);
            const length = typeof obj.length === 'number' ? obj.length : 0;

            // Canonicalize source marker objects to reference the markers stored
            // in `LAYERS` (especially `customMarkers`) so moving markers after
            // reload keeps associated waypoints in sync.
            try {
                for (let si = 0; si < sources.length; si++) {
                    const s = sources[si];
                    try {
                        const uid = s && s.marker && s.marker.uid;
                        const layer = s && s.layerKey;
                        if (!uid) continue;
                        if (layer && LAYERS && LAYERS[layer] && Array.isArray(LAYERS[layer].markers)) {
                            const found = LAYERS[layer].markers.find(m => m.uid === uid);
                            if (found) { s.marker = found; continue; }
                        }
                        if (LAYERS && LAYERS.customMarkers && Array.isArray(LAYERS.customMarkers.markers)) {
                            const found2 = LAYERS.customMarkers.markers.find(m => m.uid === uid);
                            if (found2) s.marker = found2;
                        }
                    } catch (e) {}
                }
            } catch (e) {}

            this.setRoute(routeIndices, length, sources);
            // Load the loop flag from localStorage (persisted separately from route data)
            try {
                let loopFlag = null;
                if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                    loopFlag = window._mp4Storage.loadSetting('mp4_route_looping_flag');
                } else {
                    try { loopFlag = localStorage.getItem('mp4_route_looping_flag'); } catch (e) { loopFlag = null; }
                }
                // Stored flag `mp4_route_looping_flag` now represents explicit looping preference
                this.routeLooping = (loopFlag === '1' || loopFlag === 1 || loopFlag === true);
            } catch (e) { /* default to false */ }
            // log removed
            return true;
        } catch (e) {
            console.warn('Failed to load saved route:', e);
            return false;
        }
    }

    startRouteAnimation() {
        if (this._routeRaf) return;
        this._lastRouteAnimTime = performance.now();
        const step = (t) => {
            const dt = Math.max(0, t - this._lastRouteAnimTime) / 1000; // seconds
            this._lastRouteAnimTime = t;
            // advance offset by speed * dt * direction (scale with zoom so perceived
            // animation speed remains consistent across zoom levels)
            // Coerce direction to a number so persisted string values still work
            const dir = (Number(this._routeAnimationDirection) === -1) ? -1 : 1;
            const zoomFactor = (typeof this.zoom === 'number' && this.zoom > 0) ? this.zoom : 1;
            this._routeDashOffset = (this._routeDashOffset + this._routeAnimationSpeed * dt * dir * zoomFactor + 1000000) % 1000000;
            // only continue animating if there is a route
            if (!this.currentRoute || !this.currentRoute.length) {
                this._routeRaf = null;
                return;
            }
            // Only redraw the overlay (route + markers) for animation frames
            try { this.renderOverlay(); } catch (e) { try { this.render(); } catch (e) {} }
            this._routeRaf = requestAnimationFrame(step);
        };
        this._routeRaf = requestAnimationFrame(step);
    }

    stopRouteAnimation() {
        if (this._routeRaf) {
            cancelAnimationFrame(this._routeRaf);
            this._routeRaf = null;
        }
    }
}

// Initialize
let map;

// LocalStorage helpers for layer visibility persistence
function loadLayerVisibilityFromStorage() {
    try {
        let s = null;
        if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
            s = window._mp4Storage.loadSetting('mp4_layerVisibility');
        } else {
            try { s = localStorage.getItem('mp4_layerVisibility'); } catch (e) { s = null; }
        }
        if (!s) return null;
        return (typeof s === 'string') ? JSON.parse(s) : s;
    } catch (e) {
        return null;
    }
}

function saveLayerVisibilityToStorage(obj) {
    try {
        if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
            window._mp4Storage.saveSetting('mp4_layerVisibility', obj || {});
        } else {
            try { localStorage.setItem('mp4_layerVisibility', JSON.stringify(obj || {})); } catch (e) {}
        }
    } catch (e) {}
}

// Highlight multiplier persistence
function loadHighlightMultiplierFromStorage() {
    try {
        // Only load saved multiplier when storage consent is granted
        const consent = (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function') ? window._mp4Storage.hasStorageConsent() : (localStorage.getItem('mp4_storage_consent') === '1');
        if (!consent) return null;
        let v = null;
        if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
            v = window._mp4Storage.loadSetting('mp4_highlightMultiplier');
        } else {
            try { v = localStorage.getItem('mp4_highlightMultiplier'); } catch (e) { v = null; }
        }
        if (v === null || typeof v === 'undefined') return null;
        return (typeof v === 'string') ? parseFloat(v) : Number(v);
    } catch (e) { return null; }
}

function saveHighlightMultiplierToStorage(v) {
    try {
        // Only save when user has consented to local storage
        const consent = (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function') ? window._mp4Storage.hasStorageConsent() : (localStorage.getItem('mp4_storage_consent') === '1');
        if (!consent) return;
        if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
            window._mp4Storage.saveSetting('mp4_highlightMultiplier', v);
        } else {
            try { localStorage.setItem('mp4_highlightMultiplier', String(v)); } catch (e) {}
        }
    } catch (e) {}
}

// Highlighted layers persistence (consent-gated)
function loadHighlightedLayersFromStorage() {
    try {
        const consent = (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function') ? window._mp4Storage.hasStorageConsent() : (localStorage.getItem('mp4_storage_consent') === '1');
        if (!consent) return null;
        let s = null;
        if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
            s = window._mp4Storage.loadSetting('mp4_highlighted_layers');
        } else {
            try { s = localStorage.getItem('mp4_highlighted_layers'); } catch (e) { s = null; }
        }
        if (!s) return null;
        return (typeof s === 'string') ? JSON.parse(s) : s;
    } catch (e) { return null; }
}

function saveHighlightedLayersToStorage(obj) {
    try {
        const consent = (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function') ? window._mp4Storage.hasStorageConsent() : (localStorage.getItem('mp4_storage_consent') === '1');
        if (!consent) return;
        if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
            window._mp4Storage.saveSetting('mp4_highlighted_layers', obj || {});
        } else {
            try { localStorage.setItem('mp4_highlighted_layers', JSON.stringify(obj || {})); } catch (e) {}
        }
    } catch (e) {}
}

// Map view persistence (consent-gated). Stores an object {panX, panY, zoom}
function loadMapViewFromStorage() {
    try {
        let s = null;
        if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
            s = window._mp4Storage.loadSetting('mp4_map_view');
        } else {
            try { s = localStorage.getItem('mp4_map_view'); } catch (e) { s = null; }
        }
        if (!s) return null;
        return (typeof s === 'string') ? JSON.parse(s) : s;
    } catch (e) {
        return null;
    }
}

function saveMapViewToStorage(obj) {
    try {
        if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
            window._mp4Storage.saveSetting('mp4_map_view', obj || null);
        } else {
            try { localStorage.setItem('mp4_map_view', JSON.stringify(obj || null)); } catch (e) {}
        }
    } catch (e) {}
}

// Module-scoped variables for edit overlay RAF and timer (shared with init() updateEditOverlay)
let _editOverlayRaf_module = null;
let _overlayHideTimer_module = null;

// Helper: properly hide the edit overlay with RAF cancellation and transition cleanup
// This replicates the "turning off" path from updateEditOverlay() but at module scope
function hideEditOverlayProperly() {
    try {
        const ov = document.getElementById('editOverlay');
        if (!ov) return;
        // Cancel any ongoing RAF
        if (_editOverlayRaf_module) { try { cancelAnimationFrame(_editOverlayRaf_module); } catch (e) {} _editOverlayRaf_module = null; }
        // Start fade-out by removing visible class
        ov.classList.remove('visible');
        // Keep aria-hidden=false during fade; only mark hidden after transition completes
        try { ov.setAttribute('aria-hidden', 'false'); } catch (e) {}
        if (_overlayHideTimer_module) { try { clearTimeout(_overlayHideTimer_module); } catch (e) {} }
        _overlayHideTimer_module = setTimeout(() => {
            try {
                // If overlay was re-enabled in the meantime, don't clear
                if (map && (map.editMarkersMode || map.editRouteMode)) { _overlayHideTimer_module = null; return; }
                try { ov.setAttribute('aria-hidden', 'true'); } catch (e) {}
                try { ov.style.left = ''; ov.style.top = ''; ov.style.width = ''; ov.style.height = ''; ov.style.backgroundColor = ''; } catch (e) {}
            } catch (e) {}
            _overlayHideTimer_module = null;
        }, 220);
    } catch (e) {}
}

// Helper: exit edit mode for a layer if it's currently in edit mode
// This is the canonical exit path used by Hide All, manual toggle, and swipe toggle
// Defined at module scope so it's accessible from both initializeLayerIcons() and init()
function exitEditModeForLayer(layerKey) {
    try {
        if (layerKey === 'customMarkers' && map && map.editMarkersMode) {
            map.editMarkersMode = false;
            try { map._exitEditMode && map._exitEditMode('customMarkers'); } catch (e) {}
            try {
                const editToggle = document.getElementById('editMarkersToggle');
                if (editToggle) {
                    editToggle.setAttribute('aria-pressed', 'false');
                    editToggle.classList.remove('pressed');
                }
            } catch (e) {}
            try {
                const mini = document.getElementById('editMarkersToggleMini');
                if (mini) {
                    mini.classList.remove('glow');
                    mini.setAttribute('aria-pressed', 'false');
                }
            } catch (e) {}
            // Properly hide edit overlay with full cleanup
            hideEditOverlayProperly();
            try { if (map && typeof map.render === 'function') map.render(); } catch (e) {}
        } else if (layerKey === 'route' && map && map.editRouteMode) {
            map.editRouteMode = false;
            try { map._exitEditMode && map._exitEditMode('route'); } catch (e) {}
            try {
                const routeEditToggle = document.getElementById('editRouteToggle');
                if (routeEditToggle) {
                    routeEditToggle.setAttribute('aria-pressed', 'false');
                    routeEditToggle.classList.remove('pressed');
                }
            } catch (e) {}
            try {
                const mini = document.getElementById('editRouteToggleMini');
                if (mini) {
                    mini.classList.remove('glow');
                    mini.setAttribute('aria-pressed', 'false');
                }
            } catch (e) {}
            // Properly hide edit overlay with full cleanup
            hideEditOverlayProperly();
            try { if (map && typeof map.render === 'function') map.render(); } catch (e) {}
        }
    } catch (e) {}
}

async function initializeLayerIcons() {
    // Dynamically build layer toggle list from `LAYERS` so adding layers is data-driven.
    const container = document.getElementById('layerList');
    if (!container) return;
    container.innerHTML = '';

    const layerEntries = Object.entries(LAYERS || {});
    const savedVisibility = loadLayerVisibilityFromStorage() || {};
    // Ensure a 'route' toggle is present even if not defined in LAYERS (virtual layer)
    /*if (!LAYERS.route) {
        // Use a non-mutating fallback so we don't accidentally create runtime data
        // that should live in a data file. `data/route.js` should provide `LAYERS.route`.
        layerEntries.push(['route', { name: 'Route', icon: '➤', color: '#ffa500' }]);
    }*/
    // Ensure route layer always appears at the top of the list
    const preferred = ['route'];
    const orderedEntries = [];
    // push route first if it exists
    const routeIdx = layerEntries.findIndex(e => e[0] === 'route');
    if (routeIdx >= 0) orderedEntries.push(layerEntries[routeIdx]);
    // Place `customMarkers` immediately after `route` when present so it's below the route layer
    const customIdx = layerEntries.findIndex(e => e[0] === 'customMarkers');
    if (customIdx >= 0) orderedEntries.push(layerEntries[customIdx]);
    // collect all static layers (excluding route and customMarkers) and add them in REVERSED order
    const staticLayers = [];
    for (let i = 0; i < layerEntries.length; i++) {
        const k = layerEntries[i][0];
        if (k === 'route' || k === 'customMarkers') continue;
        staticLayers.push(layerEntries[i]);
    }
    // Add static layers in reversed order to sidebar (but rendering stays original order)
    for (let i = staticLayers.length - 1; i >= 0; i--) {
        orderedEntries.push(staticLayers[i]);
    }

    // Insert a runtime-only `grid` layer so users can toggle grid visibility from the sidebar.
    // Always append it at the end of the ordered list.
    const hasGrid = orderedEntries.some(e => e[0] === 'grid');
    if (!hasGrid) {
        // Use a darker teal backdrop so the white icon remains visible,
        // and explicitly set the icon color to match the gridlines (cyan).
        const gridEntry = ['grid', { name: 'Grid', icon: '▦', color: '#155962ff', iconColor: '#22d3ee' }];
        orderedEntries.push(gridEntry);
    }

    // Pending/batched layer toggle applier (RAF) and debounced storage saver
    let _pendingLayerToggles = {};
    let _layerToggleRaf = null;
    let _layerToggleSaveTimeout = null;
    const _scheduleApplyLayerToggles = () => {
        if (_layerToggleRaf) return;
        _layerToggleRaf = requestAnimationFrame(() => {
            const toApply = _pendingLayerToggles;
            _pendingLayerToggles = {};
            _layerToggleRaf = null;
            try {
                if (map) {
                    // Apply each pending toggle via the existing map API so side-effects run
                    for (const [k, v] of Object.entries(toApply)) {
                        try {
                            if (k === 'route') {
                                map.layerVisibility = Object.assign({}, map.layerVisibility || {}, { route: v });
                                try { map.renderOverlay(); } catch (e) { try { map.render(); } catch (e) {} }
                            } else {
                                if (typeof map.toggleLayer === 'function') {
                                    map.toggleLayer(k, v);
                                } else {
                                    if (!map.layerVisibility) map.layerVisibility = {};
                                    map.layerVisibility[k] = v;
                                }
                            }
                        } catch (e) {}
                    }
                    try { if (map) map.renderOverlay(); } catch (e) { try { if (map) map.render(); } catch (e) {} }
                }
            } catch (e) {}
        });
    };
    const _scheduleSaveLayerVisibility = () => {
        try { if (_layerToggleSaveTimeout) clearTimeout(_layerToggleSaveTimeout); } catch (e) {}
        _layerToggleSaveTimeout = setTimeout(() => {
            try { saveLayerVisibilityToStorage && saveLayerVisibilityToStorage(map && map.layerVisibility ? map.layerVisibility : {}); } catch (e) {}
            _layerToggleSaveTimeout = null;
        }, 300);
    };

    // Helper: convert hex color or rgb(...) strings to rgba(r,g,b,a)
    function colorToRgba(color, alpha) {
        try {
            if (!color) return null;
            const c = String(color).trim();
            if (c.startsWith('#')) {
                let s = c.replace('#','');
                if (s.length === 3) s = s.split('').map(ch => ch+ch).join('');
                if (s.length === 6 || s.length === 8) {
                    const r = parseInt(s.slice(0,2),16);
                    const g = parseInt(s.slice(2,4),16);
                    const b = parseInt(s.slice(4,6),16);
                    const aHex = (s.length === 8) ? parseInt(s.slice(6,8),16)/255 : 1;
                    const a = (typeof alpha === 'number') ? alpha * aHex : aHex;
                    return `rgba(${r}, ${g}, ${b}, ${a})`;
                }
            }
            // rgb/rgba input: try to extract numbers
            const m = c.match(/rgba?\(([^)]+)\)/i);
            if (m) {
                const parts = m[1].split(',').map(p=>p.trim());
                const r = parseInt(parts[0]) || 0;
                const g = parseInt(parts[1]) || 0;
                const b = parseInt(parts[2]) || 0;
                let a = 1;
                if (parts.length >= 4) a = parseFloat(parts[3]) || 1;
                a = (typeof alpha === 'number') ? alpha * a : a;
                return `rgba(${r}, ${g}, ${b}, ${a})`;
            }
            return null;
        } catch (e) { return null; }
    }

    // Gesture tracking for pointerdown-swipe toggles
    let _gestureActive = false;
    let _gesturePointerId = null;
    let _gestureToggled = new Set();
    const _controlsEl = document.querySelector('.controls');

    orderedEntries.forEach(([layerKey, layer]) => {
        // root row as a button (replaces hidden checkbox + label for reliable mobile toggles)
        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'layer-toggle';
        label.dataset.layer = layerKey;
        // Determine initial checked state: preference order -> saved storage -> runtime map state -> default false
        const initialChecked = (savedVisibility && Object.prototype.hasOwnProperty.call(savedVisibility, layerKey)) ? !!savedVisibility[layerKey] : !!(map && map.layerVisibility && map.layerVisibility[layerKey]);
        // reflect active visual state on the row
        if (initialChecked) label.classList.add('active');
        label.setAttribute('aria-pressed', initialChecked ? 'true' : 'false');

        // icon
        const iconDiv = document.createElement('div');
        iconDiv.className = 'layer-icon';
        if (layer.icon) iconDiv.textContent = layer.icon;
        if (layer.color) iconDiv.style.backgroundColor = layer.color;
        // allow a separate icon color (useful for white icons on colored backdrops)
        if (layer.iconColor) iconDiv.style.color = layer.iconColor;
        // Icon click toggles highlight for this layer (separate from visibility toggle on the row)
        try {
            // Prevent pointer/touch on the icon backdrop from bubbling to the row
            try { iconDiv.addEventListener('pointerdown', (ev) => { try { ev.stopPropagation(); } catch (e) {} }); } catch (e) {}
            try { iconDiv.addEventListener('touchstart', (ev) => { try { ev.stopPropagation(); } catch (e) {} }, { passive: true }); } catch (e) {}
            const _handleIconActivate = (ev) => {
                try { if (ev && ev.stopPropagation) ev.stopPropagation(); } catch (e) {}
                try {
                    const k = label.dataset && label.dataset.layer;
                    if (!k) return;
                    if (map && typeof map.toggleLayerHighlight === 'function') {
                        map.toggleLayerHighlight(k, (layer && layer.highlightScale) ? layer.highlightScale : 2.0);
                        try {
                            if (map.highlightedLayers && map.highlightedLayers.has(k)) {
                                if (!map.layerVisibility || !map.layerVisibility[k]) {
                                    if (typeof map.toggleLayer === 'function') {
                                        try { map.toggleLayer(k, true); } catch (e) { /* suppressed */ }
                                    } else {
                                        try { if (!map.layerVisibility) map.layerVisibility = {}; map.layerVisibility[k] = true; } catch (e) {}
                                        try { if (map && typeof map.renderOverlay === 'function') map.renderOverlay(); else if (map && typeof map.render === 'function') map.render(); } catch (e) {}
                                    }
                                    try {
                                        const row = document.querySelector('#layerList .layer-toggle[data-layer="' + k + '"]');
                                        if (row) { row.classList.add('active'); row.setAttribute('aria-pressed', 'true'); }
                                    } catch (e) {}
                                    try { _scheduleSaveLayerVisibility(); } catch (e) {}
                                }
                            }
                        } catch (e) {}
                    } else if (map) {
                        map.highlightedLayers = map.highlightedLayers || new Set();
                        if (map.highlightedLayers.has(k)) {
                            map.highlightedLayers.delete(k);
                        } else {
                            map.highlightedLayers.add(k);
                            map._highlightConfig = map._highlightConfig || {}; map._highlightConfig[k] = { scale: (layer && typeof layer.highlightScale === 'number') ? layer.highlightScale : 2.0 };
                        }
                        try { if (typeof map.render === 'function') map.render(); } catch (e) {}
                    }
                    try {
                        const isHighlighted = !!(map && map.highlightedLayers && map.highlightedLayers.has(k));
                        try { iconDiv.classList.toggle('highlighted', isHighlighted); } catch (e) {}
                        try { label.classList.toggle('has-inline-highlight', isHighlighted); } catch (e) {}
                        try {
                            if (isHighlighted) {
                                const col = (layer && layer.color) ? layer.color : iconDiv.style.backgroundColor;
                                label.style.setProperty('--layer-inline-highlight-color', col);
                                const glow1 = colorToRgba(col, 0.72) || 'rgba(34,211,238,0.72)';
                                const glow2 = colorToRgba(col, 0.32) || 'rgba(34,211,238,0.32)';
                                iconDiv.style.boxShadow = `0 0 12px ${glow1}, 0 0 28px ${glow2}`;
                            } else {
                                label.style.removeProperty('--layer-inline-highlight-color');
                                iconDiv.style.boxShadow = '';
                            }
                        } catch (e) {}
                    } catch (e) {}
                } catch (e) {}
            };
            try { iconDiv._lastActivate = 0; } catch (e) {}
            try { iconDiv.addEventListener('click', (ev) => { try { const last = iconDiv._lastActivate || 0; if (Date.now() - last < 500) return; _handleIconActivate(ev); } catch (e) {} }); } catch (e) {}
            try { iconDiv.addEventListener('pointerup', (ev) => { try { if (ev && ev.preventDefault) ev.preventDefault(); if (ev && ev.stopPropagation) ev.stopPropagation(); iconDiv._lastActivate = Date.now(); _handleIconActivate(ev); } catch (e) {} }); } catch (e) {}
        } catch (e) {}
        label.appendChild(iconDiv);

        // info
        const info = document.createElement('div');
        info.className = 'layer-info';
        const nameDiv = document.createElement('div');
        nameDiv.className = 'layer-name';
        nameDiv.textContent = layer.name || layerKey;
        const countDiv = document.createElement('div');
        countDiv.className = 'layer-count';

        // count span id strategy: use `${layerKey}Count` to be predictable; special-case 'route' -> 'routeLength'
        const countSpan = document.createElement('span');
        countSpan.id = (layerKey === 'route') ? 'routeLength' : `${layerKey}Count`;
        if (layer.markerCountText) {
            countSpan.textContent = layer.markerCountText;
        } else if (Array.isArray(layer.markers)) {
            const configuredMax = (typeof layer.maxMarkers === 'number') ? layer.maxMarkers : (map && map.layerConfig && map.layerConfig[layerKey] && map.layerConfig[layerKey].maxMarkers);
            if (typeof configuredMax === 'number') {
                countSpan.textContent = `${layer.markers.length} / ${configuredMax}`;
            } else {
                countSpan.textContent = `${layer.markers.length}`;
            }
        } else {
            countSpan.textContent = '';
        }

        countDiv.appendChild(countSpan);
        // optional suffix like "markers" or "length" (configurable per-layer)
        if (layer && layer.countSuffix) {
            countDiv.appendChild(document.createTextNode(' ' + layer.countSuffix));
        } else if (layerKey === 'route') {
            // route shows length (not a count)
            countDiv.appendChild(document.createTextNode(' length'));
        } else if (Array.isArray(layer.markers)) {
            // default suffix for data layers that expose a markers array
            countDiv.appendChild(document.createTextNode(' markers'));
        }

        info.appendChild(nameDiv);
        info.appendChild(countDiv);
        label.appendChild(info);

        // append to container
        container.appendChild(label);
        // Ensure icon backdrop reflects any pre-existing highlighted state (e.g. loaded from storage)
        try {
            const isHighlightedNow = !!(map && map.highlightedLayers && map.highlightedLayers.has(layerKey));
            try { iconDiv.classList.toggle('highlighted', isHighlightedNow); } catch (e) {}
            try { label.classList.toggle('has-inline-highlight', isHighlightedNow); } catch (e) {}
            try {
                if (isHighlightedNow) {
                    const col = (layer && layer.color) ? layer.color : iconDiv.style.backgroundColor;
                    label.style.setProperty('--layer-inline-highlight-color', col);
                    const glow1 = colorToRgba(col, 0.72) || 'rgba(34,211,238,0.72)';
                    const glow2 = colorToRgba(col, 0.32) || 'rgba(34,211,238,0.32)';
                    iconDiv.style.boxShadow = `0 0 12px ${glow1}, 0 0 28px ${glow2}`;
                } else {
                    label.style.removeProperty('--layer-inline-highlight-color');
                    iconDiv.style.boxShadow = '';
                }
            } catch (e) {}
        } catch (e) {}

        // Pointer gesture: immediate toggle on pointerdown; swiping across rows toggles them
        label.addEventListener('pointerdown', (ev) => {
            try {
                // Only track primary pointers
                if (ev.isPrimary === false) return;
                try { ev.preventDefault(); } catch (e) {}
                // Temporarily disable sidebar scrolling while interacting with layer rows
                try { if (_controlsEl) _controlsEl.style.touchAction = 'none'; } catch (e) {}
                _gestureActive = true;
                _gesturePointerId = ev.pointerId;
                _gestureToggled.add(label);

                const checked = !label.classList.contains('active');
                
                // Immediate visual feedback for responsiveness
                try { label.classList.toggle('active', checked); } catch (e) {}
                try { label.setAttribute('aria-pressed', checked ? 'true' : 'false'); } catch (e) {}

                // Update runtime visibility object so other code reads the new state
                try { if (!map.layerVisibility) map.layerVisibility = {}; map.layerVisibility[layerKey] = !!checked; } catch (e) {}

                // If turning off a layer that's in edit mode, exit edit mode after visibility is updated
                if (!checked) {
                    try { exitEditModeForLayer(layerKey); } catch (e) {}
                }

                // Queue the heavier work to RAF to batch rapid toggles
                try { _pendingLayerToggles[layerKey] = !!checked; _scheduleApplyLayerToggles(); } catch (e) {}

                // Debounced save to storage
                try { _scheduleSaveLayerVisibility(); } catch (e) {}
            } catch (e) {}
        });

        // On touch devices, prevent native touch scrolling while interacting with
        // the layer row so swipes toggle rows instead of scrolling the sidebar.
        try {
            label.addEventListener('touchstart', (ev) => { try { ev.preventDefault(); } catch (e) {} }, { passive: false });
            label.addEventListener('touchmove', (ev) => { try { ev.preventDefault(); } catch (e) {} }, { passive: false });
        } catch (e) {}

        // No pressed-state handlers for layer toggles: remove animations/press
        // feedback to avoid delayed or sticky toggles on mobile when tapping
        // multiple rows rapidly.

        // No hidden checkbox: click handler above performs toggle and persistence.

        // Apply saved/initial state to runtime if it differs from current map state
        try {
            const current = !!(map && map.layerVisibility && map.layerVisibility[layerKey]);
            if (initialChecked !== current) {
                if (!map.layerVisibility) map.layerVisibility = {};
                if (layerKey === 'route') {
                    map.layerVisibility.route = initialChecked;
                    try { map.renderOverlay(); } catch (e) { try { map.render(); } catch (e) {} }
                } else {
                    map.toggleLayer(layerKey, initialChecked);
                }
                // ensure the row visual matches the applied initial state
                label.classList.toggle('active', initialChecked);
                label.setAttribute('aria-pressed', initialChecked ? 'true' : 'false');
            }
        } catch (e) {}
    });

    // Document-wide pointer handlers to support swipe-to-toggle across rows
    document.addEventListener('pointermove', (ev) => {
        try {
            if (!_gestureActive || ev.pointerId !== _gesturePointerId) return;
            const el = document.elementFromPoint(ev.clientX, ev.clientY);
            if (!el) return;
            const row = (typeof el.closest === 'function') ? el.closest('.layer-toggle') : null;
            if (!row) return;
            if (_gestureToggled.has(row)) return;
            _gestureToggled.add(row);

            const k = row.dataset && row.dataset.layer;
            const willChecked = !row.classList.contains('active');

            try { row.classList.toggle('active', willChecked); } catch (e) {}
            try { row.setAttribute('aria-pressed', willChecked ? 'true' : 'false'); } catch (e) {}
            try { if (!map.layerVisibility) map.layerVisibility = {}; map.layerVisibility[k] = !!willChecked; } catch (e) {}
            
            // If turning off a layer that's in edit mode, exit edit mode after visibility is updated
            if (!willChecked) {
                try { exitEditModeForLayer(k); } catch (e) {}
            }

            try { _pendingLayerToggles[k] = !!willChecked; _scheduleApplyLayerToggles(); } catch (e) {}
            try { _scheduleSaveLayerVisibility(); } catch (e) {}
        } catch (e) {}
    }, { passive: true });

    const _endGesture = (ev) => {
        try {
            if (!_gestureActive) return;
            if (ev && ev.pointerId && ev.pointerId !== _gesturePointerId) return;
        } catch (e) {}
        _gestureActive = false;
        _gesturePointerId = null;
        try { _gestureToggled.clear(); } catch (e) {}
        try { if (_controlsEl) _controlsEl.style.touchAction = 'manipulation'; } catch (e) {}
    };

    document.addEventListener('pointerup', _endGesture, { passive: true });
    document.addEventListener('pointercancel', _endGesture, { passive: true });

}

// Utility: attach pressed-state handlers to any element matching selector
function attachPressedHandlers(selector) {
    const els = document.querySelectorAll(selector);
    els.forEach(el => {
        el.addEventListener('pointerdown', () => el.classList.add('pressed'));
        el.addEventListener('pointerup', () => el.classList.remove('pressed'));
        el.addEventListener('pointercancel', () => el.classList.remove('pressed'));
    });
}

async function init() {
    // Create map
    map = new InteractiveMap('mapCanvas');
        // Highlighting runtime state: set of layer keys currently highlighted
        try {
            map.highlightedLayers = new Set();
            map._highlightConfig = Object.assign({}, map._highlightConfig || {});
            // Global multiplier applied to all highlight scales (user-configurable)
            try { map.highlightScaleMultiplier = (function(){ const v = loadHighlightMultiplierFromStorage(); return (typeof v === 'number' && !isNaN(v)) ? v : 1.0; })(); } catch (e) { map.highlightScaleMultiplier = 1.0; }
            map.setLayerHighlight = function(layerKey, scale) {
                try { if (!this.highlightedLayers) this.highlightedLayers = new Set(); } catch (e) {}
                try { this.highlightedLayers.add(layerKey); } catch (e) {}
                // (debug logs removed)
                try { this._highlightConfig = this._highlightConfig || {}; this._highlightConfig[layerKey] = { scale: (typeof scale === 'number') ? scale : 2.0 }; } catch (e) {}
                try { if (typeof this.render === 'function') this.render(); } catch (e) {}
                try { saveHighlightedLayersToStorage && saveHighlightedLayersToStorage(this._highlightConfig || {}); } catch (e) {}
                // Ensure hit-testing is recalculated to match new visual sizes.
                try {
                    if (typeof this.checkMarkerHover === 'function') {
                        if (typeof this.lastMouseX === 'number' && typeof this.lastMouseY === 'number') {
                            try {
                                const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
                                if (rect) {
                                    const lx = this.lastMouseX - rect.left;
                                    const ly = this.lastMouseY - rect.top;
                                    try { this.checkMarkerHover(lx, ly); } catch (e) {}
                                } else {
                                    try { this.checkMarkerHover(this.lastMouseX, this.lastMouseY); } catch (e) {}
                                }
                            } catch (e) {}
                        } else {
                            try {
                                const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
                                if (rect) this.checkMarkerHover(rect.width / 2, rect.height / 2);
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
            };
            map.clearLayerHighlight = function(layerKey) {
                try { if (this.highlightedLayers) this.highlightedLayers.delete(layerKey); } catch (e) {}
                // (debug logs removed)
                try { if (this._highlightConfig) delete this._highlightConfig[layerKey]; } catch (e) {}
                try { if (typeof this.render === 'function') this.render(); } catch (e) {}
                try { saveHighlightedLayersToStorage && saveHighlightedLayersToStorage(this._highlightConfig || {}); } catch (e) {}
                // Recompute hit testing after clearing highlight
                try {
                    if (typeof this.checkMarkerHover === 'function') {
                        if (typeof this.lastMouseX === 'number' && typeof this.lastMouseY === 'number') {
                            try {
                                const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
                                if (rect) {
                                    const lx = this.lastMouseX - rect.left;
                                    const ly = this.lastMouseY - rect.top;
                                    try { this.checkMarkerHover(lx, ly); } catch (e) {}
                                } else {
                                    try { this.checkMarkerHover(this.lastMouseX, this.lastMouseY); } catch (e) {}
                                }
                            } catch (e) {}
                        } else {
                            try { const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null; if (rect) this.checkMarkerHover(rect.width/2, rect.height/2); } catch (e) {}
                        }
                    }
                } catch (e) {}
            };
            map.toggleLayerHighlight = function(layerKey, scale) {
                try { if (!this.highlightedLayers) this.highlightedLayers = new Set(); } catch (e) {}
                if (this.highlightedLayers && this.highlightedLayers.has(layerKey)) {
                    try { this.clearLayerHighlight(layerKey); } catch (e) {}
                } else {
                    try { this.setLayerHighlight(layerKey, scale); } catch (e) {}
                }
            };

            // Store previous highlight state for layers so edit-mode can restore it later
            // State tracking functions removed - edit mode no longer modifies highlight state

            // Read the inline highlight color from CSS (exposed as --layer-inline-highlight-color)
            map.getLayerInlineOutlineColor = function(layerKey) {
                try {
                    const row = document.querySelector('#layerList .layer-toggle[data-layer="' + layerKey + '"]');
                    if (!row) return '#22d3ee';
                    const s = window.getComputedStyle(row).getPropertyValue('--layer-inline-highlight-color');
                    if (s && s.trim()) return s.trim();
                } catch (e) {}
                return '#22d3ee';
            };

            // Enter/exit edit-mode helpers that ensure outline is turned on and colored
            map._enterEditMode = function(layerKey, scale) {
                try {
                    // add edit-mode-outline class only for route and marker layers
                    const editableLayers = ['route', 'customMarkers', 'greenCrystals'];
                    if (editableLayers.includes(layerKey)) {
                        try {
                            const row = document.querySelector('#layerList .layer-toggle[data-layer="' + layerKey + '"]');
                            if (row) {
                                // Set edit-mode outline color from layer's configured color
                                const layerColor = (typeof LAYERS !== 'undefined' && LAYERS && LAYERS[layerKey] && LAYERS[layerKey].color) ? LAYERS[layerKey].color : '#a78bfa';
                                row.style.setProperty('--edit-mode-outline-color', layerColor);
                                row.classList.add('edit-mode-outline');
                            }
                        } catch (e) {}
                    }
                } catch (e) {}
            };

            map._exitEditMode = function(layerKey) {
                try {
                    // remove edit-mode-outline class
                    try {
                        const row = document.querySelector('#layerList .layer-toggle[data-layer="' + layerKey + '"]');
                        if (row) {
                            row.classList.remove('edit-mode-outline');
                            row.style.removeProperty('--edit-mode-outline-color');
                        }
                    } catch (e) {}
                } catch (e) {}
            };
            // Apply any previously saved highlighted layers (consent-gated)
            try {
                const saved = (typeof loadHighlightedLayersFromStorage === 'function') ? loadHighlightedLayersFromStorage() : null;
                if (saved && typeof saved === 'object') {
                    for (const layerKey of Object.keys(saved)) {
                        try {
                            if (!window.LAYERS || !window.LAYERS[layerKey]) continue;
                            // Ensure layer is visible so the highlight is visible on load
                            map.layerVisibility = map.layerVisibility || {};
                            map.layerVisibility[layerKey] = true;
                            const scale = (saved[layerKey] && typeof saved[layerKey].scale === 'number') ? saved[layerKey].scale : (map._highlightConfig && map._highlightConfig[layerKey] && map._highlightConfig[layerKey].scale) || 2.0;
                            map.setLayerHighlight(layerKey, scale);
                        } catch (e) {}
                    }
                }
            } catch (e) {}
            // Prepare grid quadrant labels (8x8 A1..H8) so they can be toggled
            // on/off quickly when the `grid` layer is highlighted. Labels are
            // DOM elements positioned over the map and updated each render.
            map._createGridQuadLabels = function() {
                try {
                    const parent = this.canvas && this.canvas.parentElement;
                    if (!parent) return;
                    // (debug logs removed)
                    // Ensure parent is positioned so absolute children align
                    try { if (window.getComputedStyle(parent).position === 'static') parent.style.position = 'relative'; } catch (e) {}
                    // Container for labels
                    let container = parent.querySelector('#gridQuadLabels');
                    if (!container) {
                        container = document.createElement('div');
                        container.id = 'gridQuadLabels';
                        container.className = 'grid-quad-labels';
                        container.setAttribute('aria-hidden', 'true');
                        // pointer-events none so labels don't interfere with map interaction
                        container.style.pointerEvents = 'none';
                        parent.appendChild(container);
                        // (debug logs removed)
                    }
                    container.innerHTML = '';
                    // Create 8x8 labels A-H (columns) x 1-8 (rows)
                    const cols = 8, rows = 8;
                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            const colLetter = String.fromCharCode(65 + c); // A..H
                            const rowNumber = (r + 1).toString();
                            const span = document.createElement('div');
                            span.className = 'grid-quad-label';
                            span.dataset.col = c;
                            span.dataset.row = r;
                            span.textContent = `${colLetter}${rowNumber}`;
                            container.appendChild(span);
                        }
                    }
                    // initialize hidden
                    container.style.display = 'none';
                    // (debug logs removed)
                } catch (e) {}
            };

            map._updateGridQuadLabels = function() {
                try {
                    const parent = this.canvas && this.canvas.parentElement;
                    const container = parent ? parent.querySelector('#gridQuadLabels') : null;
                    if (!container) return;
                    const shouldShow = !!(this.layerVisibility && this.layerVisibility.grid) && !!(this.highlightedLayers && this.highlightedLayers.has('grid'));
                    // (debug logs removed)
                    container.style.display = shouldShow ? 'block' : 'none';
                    if (!shouldShow) return;
                    const cols = 8, rows = 8;
                    const gridSpacing = MAP_SIZE / 8; // matches renderDetailGrid
                    const cssWidth = this.canvas.clientWidth;
                    const cssHeight = this.canvas.clientHeight;
                    // Position each label in its cell center
                    const labels = container.querySelectorAll('.grid-quad-label');
                    // Compute font sizing to match canvas axis labels (scale with zoom)
                    const fontMin = 12;
                    const fontMax = 48;
                    const fontSize = Math.max(fontMin, Math.min(fontMax, Math.round(this.zoom * 80)));
                    const pad = Math.max(2, Math.round(fontSize * 0.18));
                    for (let i = 0; i < labels.length; i++) {
                        const el = labels[i];
                        const c = Number(el.dataset.col);
                        const r = Number(el.dataset.row);
                        // cell center in absolute MAP pixels
                        const mapX = (gridSpacing * (c + 0.5));
                        const mapY = (gridSpacing * (r + 0.5));
                        const screenX = mapX * this.zoom + this.panX;
                        const screenY = mapY * this.zoom + this.panY;
                        // Use CSS translate(-50%,-50%) for centering — set left/top directly
                        el.style.left = Math.round(screenX) + 'px';
                        el.style.top = Math.round(screenY) + 'px';
                        // Scale label typography to match outside axis labels
                        el.style.fontSize = fontSize + 'px';
                        el.style.padding = pad + 'px ' + (pad * 3) + 'px';
                        if (i === 0) {
                            // sample
                        }
                    }
                } catch (e) {}
            };
        } catch (e) {}
        // Now that label creation function exists, prepare DOM labels
        try { if (typeof map._createGridQuadLabels === 'function') { map._createGridQuadLabels(); } } catch (e) { /* deferred createGridQuadLabels failed (suppressed) */ }
    // Load persisted custom markers (if any) via MarkerUtils so data-layer stays pure
    if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.loadFromLocalStorage === 'function') {
        try { MarkerUtils.loadFromLocalStorage(); } catch (e) { console.warn('Failed to load custom markers:', e); }
    }
    // Runtime metadata for the special `customMarkers` layer: deletable, not selectable
    try {
        if (typeof LAYERS !== 'undefined' && LAYERS.customMarkers) {
            LAYERS.customMarkers.deletable = true;
            LAYERS.customMarkers.selectable = true;
            if (typeof LAYERS.customMarkers.maxMarkers !== 'number') {
                LAYERS.customMarkers.maxMarkers = (map && map.layerConfig && map.layerConfig.customMarkers && map.layerConfig.customMarkers.maxMarkers) || 50;
            }
        }
    } catch (e) {}

    // Data-driven primary layer selection: prefer `LAYERS.primary` if set,
    // otherwise pick the first LAYERS entry that contains markers.
    try {
        let primaryKey = (typeof LAYERS === 'object' && typeof LAYERS.primary === 'string' && LAYERS[LAYERS.primary]) ? LAYERS.primary : null;
        if (!primaryKey) {
            const entries = Object.entries(LAYERS || {});
            for (let i = 0; i < entries.length; i++) {
                const k = entries[i][0];
                const layer = entries[i][1];
                if (Array.isArray(layer.markers) && layer.markers.length > 0) { primaryKey = k; break; }
            }
        }

        if (primaryKey) {
            map.setMarkers(LAYERS[primaryKey].markers);
            // log removed
        } else {
            console.warn('No layer marker data available; no markers loaded.');
        }
    } catch (e) {
        console.warn('Failed to initialize primary markers:', e);
    }
    
    // Populate layer icons from LAYERS definitions
    initializeLayerIcons();
    // Wire Show All / Hide All layer buttons — batch updates to avoid N renders/storage writes
    try {
        const showBtn = document.getElementById('showAllLayersBtn');
        const hideBtn = document.getElementById('hideAllLayersBtn');
        let _renderScheduled = false;
        const scheduleRender = () => {
            if (_renderScheduled) return;
            _renderScheduled = true;
            requestAnimationFrame(() => { _renderScheduled = false; try { if (map) map.renderOverlay(); } catch (e) { try { if (map) map.render(); } catch (e) {} } });
        };

        const applyToggle = (checked) => {
            const rows = Array.from(document.querySelectorAll('#layerList .layer-toggle'));
            const newVisibility = {};
            rows.forEach(row => {
                const key = row.dataset.layer;
                // Preserve any rows that are disabled (edit-locked) when clearing visibility.
                // "Hide All" should not turn off layers currently locked by edit modes.
                if (!checked && row.classList && row.classList.contains('disabled')) {
                    try { newVisibility[key] = !!(map && map.layerVisibility && map.layerVisibility[key]); } catch (e) { newVisibility[key] = false; }
                    return;
                }
                newVisibility[key] = !!checked;
                // reflect active visual state on the row
                try { row.classList.toggle('active', !!checked); row.setAttribute('aria-pressed', !!checked ? 'true' : 'false'); } catch (e) {}
            });
            try {
                map.layerVisibility = Object.assign({}, map.layerVisibility || {}, newVisibility);
            } catch (e) { map.layerVisibility = Object.assign({}, newVisibility); }
            // If we're hiding all layers, ensure any active edit modes are exited
            if (!checked) {
                try {
                    if (newVisibility && newVisibility.customMarkers === false) {
                        exitEditModeForLayer('customMarkers');
                    }
                    if (newVisibility && newVisibility.route === false) {
                        exitEditModeForLayer('route');
                    }
                } catch (e) {}
            }
            try { saveLayerVisibilityToStorage(map.layerVisibility); } catch (e) {}
            // When hiding all layers, deselect any selected marker so the UI
            // doesn't retain a selection pointing to now-hidden content.
            if (!checked) {
                try {
                    if (map) {
                        map.selectedMarker = null;
                        map.selectedMarkerLayer = null;
                        try { if (typeof map.hideTooltip === 'function') map.hideTooltip(); } catch (e) {}
                        try { if (typeof map.render === 'function') map.render(); } catch (e) {}
                    }
                } catch (e) {}
            }
            scheduleRender();
        };

        if (showBtn) showBtn.addEventListener('click', () => applyToggle(true));
        if (hideBtn) hideBtn.addEventListener('click', () => applyToggle(false));
    } catch (e) {}
    // Attempt to restore a previously saved route (if any)
    try { map.loadRouteFromStorage(); } catch (e) {}
    // Attempt to restore saved map view (pan/zoom) when consent is present
    try {
        const consent = (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function') ? window._mp4Storage.hasStorageConsent() : (localStorage.getItem('mp4_storage_consent') === '1');
        if (consent && map && typeof map.loadViewFromStorage === 'function') {
            try { map.loadViewFromStorage(); } catch (e) {}
        }
    } catch (e) {}
    // Wire the compact Save-data toggle and Clear button (consent-aware)
    try {
        const saveLabel = document.getElementById('saveDataToggle_label');
        if (saveLabel) {
            // Initialize state from consent flag
            const consent = (window._mp4Storage && typeof window._mp4Storage.hasStorageConsent === 'function') ? window._mp4Storage.hasStorageConsent() : (localStorage.getItem('mp4_storage_consent') === '1');
            try { saveLabel.classList.toggle('pressed', !!consent); } catch (e) {}
            try { saveLabel.setAttribute('aria-pressed', !!consent ? 'true' : 'false'); } catch (e) {}
                try {
                    const lbl = saveLabel.querySelector('.layer-name');
                    if (lbl) lbl.textContent = consent ? 'Clear Savedata' : 'Save Progress';
                } catch (e) {}

            saveLabel.addEventListener('click', async (ev) => {
                const current = saveLabel.getAttribute('aria-pressed') === 'true';
                const on = !current;
                if (on) {
                    const confirmMsg = 'Enable local storage? It stores the following on this device only:\n\n' +
                        '• Map view (position & zoom)\n' +
                        '• Layer visibility\n' +
                        '• Tileset & grayscale setup\n' +
                        '• Custom markers & routes\n' +
                        '• Route direction\n' +
                        '• Route looping\n\n' +
                        'Tap OK to enable or Cancel to keep storage off.';
                    if (!confirm(confirmMsg)) {
                        return;
                    }
                }
                try {
                    if (window._mp4Storage && typeof window._mp4Storage.setStorageConsent === 'function') {
                        window._mp4Storage.setStorageConsent(on);
                    } else {
                        if (on) localStorage.setItem('mp4_storage_consent', '1'); else localStorage.removeItem('mp4_storage_consent');
                    }
                } catch (e) {}

                if (on) {
                    try {
                        try {
                            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                                window._mp4Storage.saveSetting('mp4_tileset', (map && map.tileset) ? map.tileset : 'sat');
                                window._mp4Storage.saveSetting('mp4_tileset_grayscale', (map && map.tilesetGrayscale) ? '1' : '0');
                            } else {
                                try { localStorage.setItem('mp4_tileset', (map && map.tileset) ? map.tileset : 'sat'); } catch (e) {}
                                try { localStorage.setItem('mp4_tileset_grayscale', (map && map.tilesetGrayscale) ? '1' : '0'); } catch (e) {}
                            }
                        } catch (e) {}
                        try { saveHighlightMultiplierToStorage && saveHighlightMultiplierToStorage(map && map.highlightScaleMultiplier ? map.highlightScaleMultiplier : 1.0); } catch (e) {}
                        try { saveHighlightedLayersToStorage && saveHighlightedLayersToStorage(map && map._highlightConfig ? map._highlightConfig : {}); } catch (e) {}
                        try { saveLayerVisibilityToStorage(map && map.layerVisibility ? map.layerVisibility : {}); } catch (e) {}
                        try { if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.saveToLocalStorage === 'function') MarkerUtils.saveToLocalStorage(); } catch (e) {}
                        try { if (map && typeof map.saveRouteToStorage === 'function') map.saveRouteToStorage(); } catch (e) {}
                        try { if (map && typeof map.saveViewToStorage === 'function') map.saveViewToStorage(); } catch (e) {}
                        // Route direction persistence removed; do not save `routeDir`.
                    } catch (e) {}
                    try { saveLabel.classList.toggle('pressed', true); } catch (e) {}
                    try { map.updateLayerCounts(); } catch (e) {}
                } else {
                    const confirmMsg = 'Disable local storage? This will permanently delete the following saved data from this device:\n\n' +
                        '• Map view (position & zoom)\n' +
                        '• Layer visibility\n' +
                        '• Tileset & grayscale setup\n' +
                        '• Custom markers & routes\n' +
                        '• Route direction\n' +
                        '• Route looping\n\n' +
                        'Tap OK to delete saved data and continue, or Cancel to keep it.';
                    if (!confirm(confirmMsg)) {
                        try { saveLabel.setAttribute('aria-pressed', 'true'); } catch (e) {}
                        try { saveLabel.classList.toggle('pressed', true); } catch (e) {}
                        try { if (window._mp4Storage && typeof window._mp4Storage.setStorageConsent === 'function') window._mp4Storage.setStorageConsent(true); else localStorage.setItem('mp4_storage_consent','1'); } catch (e) {}
                    } else {
                        try {
                            if (window._mp4Storage && typeof window._mp4Storage.clearSavedData === 'function') {
                                window._mp4Storage.clearSavedData(true);
                            } else {
                                const keys = ['mp4_customMarkers','mp4_saved_route','mp4_layerVisibility','mp4_tileset','mp4_tileset_grayscale','mp4_map_view','mp4_route_looping_flag','mp4_highlightMultiplier','mp4_highlighted_layers','mp4_storage_consent'];
                                for (const k of keys) try { localStorage.removeItem(k); } catch (e) {}
                            }
                        } catch (e) {}
                        try { saveLabel.classList.toggle('pressed', false); } catch (e) {}
                        try { saveLabel.setAttribute('aria-pressed', 'false'); } catch (e) {}
                        try { location.reload(); } catch (e) { /* fallback: continue without reload */ }
                    }
                }
                // reflect state attribute after all processing
                try { saveLabel.setAttribute('aria-pressed', !!on ? 'true' : 'false'); } catch (e) {}
                try {
                    const lbl = saveLabel.querySelector('.layer-name');
                    if (lbl) lbl.textContent = on ? 'Clear Savedata' : 'Save Progress';
                } catch (e) {}
            });
        }
        // no separate Clear button — deletion handled via consent toggle
    } catch (e) {}
    // Ensure the sidebar counts reflect current map state now that elements exist
    try { map.updateLayerCounts(); } catch (e) {}
    
    // Setup controls
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    const resetViewBtn = document.getElementById('resetView');
    
    zoomInBtn.addEventListener('click', () => map.zoomIn());
    zoomOutBtn.addEventListener('click', () => map.zoomOut());
    resetViewBtn.addEventListener('click', () => map.resetView());
    
    // Add pressed state feedback to all buttons
    [zoomInBtn, zoomOutBtn, resetViewBtn].forEach(btn => {
        btn.addEventListener('pointerdown', () => btn.classList.add('pressed'));
        btn.addEventListener('pointerup', () => btn.classList.remove('pressed'));
        btn.addEventListener('pointercancel', () => btn.classList.remove('pressed'));
    });

    // For the second group, prevent stuck pressed state by removing on mouseleave
    [zoomInBtn, zoomOutBtn, resetViewBtn, document.getElementById('sidebarHandle')].forEach(btn => {
        if (btn) {
            btn.addEventListener('mouseleave', () => btn.classList.remove('pressed'));
        }
    });

    // Attach pressed handlers to all sidebar control buttons (Compute/Clear/Export/etc.)
    attachPressedHandlers('.control-btn');

    // Prevent control buttons from retaining keyboard focus after click so
    // shortcuts remain available and focus outline does not persist on the last button.
    try {
        const controls = document.querySelectorAll('.control-btn');
        controls.forEach(btn => {
            try {
                btn.addEventListener('click', () => { try { btn.blur(); } catch (e) {} });
            } catch (e) {}
        });
    } catch (e) {}

    // Ensure on-screen toggles/buttons don't retain focus after interaction
    try {
        document.addEventListener('click', (ev) => {
            try {
                const sel = (ev && ev.target) ? ev.target.closest('button, .control-btn, .zoom-btn, .hints-toggle, .layer-toggle, [role="button"]') : null;
                if (sel && typeof sel.blur === 'function') {
                    // blur after current event loop so any click handlers still run
                    setTimeout(() => { try { sel.blur(); } catch (e) {} }, 0);
                }
            } catch (e) {}
        }, true);
    } catch (e) {}

    // Position the hints overlay exactly above the Hints toggle button
    function positionHintsOverlay() {
        try {
            const sidebar = document.querySelector('.sidebar');
            const hintsBtn = document.getElementById('hintsToggleBtn');
            const hintsOverlay = document.getElementById('hintsOverlay');
            const consentBtn = document.getElementById('saveDataToggle_label');
            if (!sidebar || !hintsBtn || !hintsOverlay) return;
            const sidebarRect = sidebar.getBoundingClientRect();
            const hintRect = hintsBtn.getBoundingClientRect();
            // Calculate extra offset from consent toggle's bottom margin if present
            let consentMarginBottom = 0;
            try {
                if (consentBtn) {
                    const cs = window.getComputedStyle(consentBtn);
                    consentMarginBottom = parseFloat(cs.marginBottom) || 0;
                }
            } catch (e) { consentMarginBottom = 0; }

            // Compute distance from bottom of sidebar to top of the hints button,
            // then add consent toggle bottom margin so overlay clears that gap below.
            const rawOffset = Math.round(sidebarRect.bottom - hintRect.top + consentMarginBottom);
            const bottomOffset = Math.max(0, rawOffset);
            hintsOverlay.style.bottom = bottomOffset + 'px';
        } catch (e) {}
    }
    try { positionHintsOverlay(); } catch (e) {}
    try { window.addEventListener('resize', positionHintsOverlay, { passive: true }); } catch (e) {}
    // Helpers to lock UI while route computation runs
    function beginRouteCompute() {
        try {
            if (typeof map !== 'undefined' && map) map._computingRoute = true;
            let overlay = document.getElementById('computingOverlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'computingOverlay';
                overlay.className = 'computing-overlay';
                const inner = document.createElement('div');
                inner.className = 'computing-inner';
                inner.textContent = 'Computing route…';
                overlay.appendChild(inner);
                try { document.body.appendChild(overlay); } catch (e) {}
            }
            try { overlay.style.display = 'flex'; } catch (e) {}
        } catch (e) {}
    }

    function endRouteCompute() {
        try {
            if (typeof map !== 'undefined' && map) map._computingRoute = false;
            const overlay = document.getElementById('computingOverlay');
            if (overlay) try { overlay.style.display = 'none'; } catch (e) {}
        } catch (e) {}
    }
    
    // Helper to show/hide and position the edit overlay when either edit mode is active
    // Use module-scoped variables so exitEditModeForLayer can also control the RAF/timer
    // Global edit-overlay alpha so both RAF-updates and on-show logic agree
    const EDIT_OVERLAY_ALPHA = 0.35;
    function _updateOverlayFrame() {
        try {
            const ov = document.getElementById('editOverlay');
            if (!ov) return;
            // Position overlay to match the map's rendered tile area (MAP_SIZE * zoom)
            if (map && (map.editMarkersMode || map.editRouteMode)) {
                const size = (MAP_SIZE * (map.zoom || 1));
                const left = Number(map.panX || 0);
                const top = Number(map.panY || 0);
                ov.style.left = Math.round(left) + 'px';
                ov.style.top = Math.round(top) + 'px';
                ov.style.width = Math.round(size) + 'px';
                ov.style.height = Math.round(size) + 'px';
                // Ensure overlay color follows the currently active edit mode
                try {
                    const layerKey = (map.editMarkersMode ? 'customMarkers' : (map.editRouteMode ? 'route' : null));
                    if (layerKey && LAYERS && LAYERS[layerKey] && LAYERS[layerKey].color) {
                        const hex = String(LAYERS[layerKey].color || '').trim();
                        const parseHex = (h) => {
                            if (!h || h[0] !== '#') return null;
                            const s = h.slice(1);
                            if (s.length === 6) {
                                const r = parseInt(s.slice(0,2),16);
                                const g = parseInt(s.slice(2,4),16);
                                const b = parseInt(s.slice(4,6),16);
                                return { r,g,b, a: 1 };
                            } else if (s.length === 8) {
                                const r = parseInt(s.slice(0,2),16);
                                const g = parseInt(s.slice(2,4),16);
                                const b = parseInt(s.slice(4,6),16);
                                const a = parseInt(s.slice(6,8),16) / 255;
                                return { r,g,b, a };
                            }
                            return null;
                        };
                        const c = parseHex(hex);
                        if (c) {
                            ov.style.backgroundColor = `rgba(${c.r},${c.g},${c.b},${EDIT_OVERLAY_ALPHA})`;
                        }
                    }
                } catch (e) {}
                // Keep aria-hidden=false while visible (during fade in/out)
                ov.classList.add('visible');
                try { ov.setAttribute('aria-hidden', 'false'); } catch (e) {}
                // continue RAF while visible so overlay follows pan/zoom smoothly
                _editOverlayRaf_module = requestAnimationFrame(_updateOverlayFrame);
            } else {
                // Should not usually reach here because updateEditOverlay controls RAF lifecycle,
                // but defensively hide overlay and clear inline sizes.
                ov.classList.remove('visible');
                try { ov.setAttribute('aria-hidden', 'true'); } catch (e) {}
                try { ov.style.left = ''; ov.style.top = ''; ov.style.width = ''; ov.style.height = ''; } catch (e) {}
                _editOverlayRaf_module = null;
            }
        } catch (e) { _editOverlayRaf_module = null; }
    }

    function updateEditOverlay() {
        try {
            const ov = document.getElementById('editOverlay');
            if (!ov) return;
            const on = !!(map && (map.editMarkersMode || map.editRouteMode));
            // If turning on, cancel any pending hide and start RAF-driven updates
            if (on) {
                // Determine overlay color based on active edit mode's layer color
                try {
                    const layerKey = (map.editMarkersMode ? 'customMarkers' : (map.editRouteMode ? 'route' : null));
                    if (layerKey && LAYERS && LAYERS[layerKey] && LAYERS[layerKey].color) {
                        const hex = String(LAYERS[layerKey].color || '').trim();
                        // parse #RRGGBB or #RRGGBBAA
                        const parseHex = (h) => {
                            if (!h || h[0] !== '#') return null;
                            const s = h.slice(1);
                            if (s.length === 6) {
                                const r = parseInt(s.slice(0,2),16);
                                const g = parseInt(s.slice(2,4),16);
                                const b = parseInt(s.slice(4,6),16);
                                return { r,g,b, a: 1 };
                            } else if (s.length === 8) {
                                const r = parseInt(s.slice(0,2),16);
                                const g = parseInt(s.slice(2,4),16);
                                const b = parseInt(s.slice(4,6),16);
                                const a = parseInt(s.slice(6,8),16) / 255;
                                return { r,g,b, a };
                            }
                            return null;
                        };
                        const c = parseHex(hex);
                        if (c) {
                            ov.style.backgroundColor = `rgba(${c.r},${c.g},${c.b},${EDIT_OVERLAY_ALPHA})`;
                        }
                    }
                } catch (e) {}
                if (_overlayHideTimer_module) { try { clearTimeout(_overlayHideTimer_module); } catch (e) {} _overlayHideTimer_module = null; }
                if (!_editOverlayRaf_module) _editOverlayRaf_module = requestAnimationFrame(_updateOverlayFrame);
                return;
            }

            // Turning off: stop RAF, but keep inline sizing for the transition,
            // then clear sizing after the CSS opacity transition to avoid snapping.
            if (_editOverlayRaf_module) { try { cancelAnimationFrame(_editOverlayRaf_module); } catch (e) {} _editOverlayRaf_module = null; }
            // Start fade-out by removing visible class
            ov.classList.remove('visible');
            // Keep aria-hidden=false during fade; only mark hidden after transition completes
            try { ov.setAttribute('aria-hidden', 'false'); } catch (e) {}
            if (_overlayHideTimer_module) { try { clearTimeout(_overlayHideTimer_module); } catch (e) {} }
            _overlayHideTimer_module = setTimeout(() => {
                try {
                    // If overlay was re-enabled in the meantime, don't clear
                    if (map && (map.editMarkersMode || map.editRouteMode)) { _overlayHideTimer_module = null; return; }
                    try { ov.setAttribute('aria-hidden', 'true'); } catch (e) {}
                    try { ov.style.left = ''; ov.style.top = ''; ov.style.width = ''; ov.style.height = ''; ov.style.backgroundColor = ''; } catch (e) {}
                } catch (e) {}
                _overlayHideTimer_module = null;
            }, 220); // slightly longer than CSS transition (160ms) to ensure smooth fade
        } catch (e) {}
    }
    
    // Unified helper: apply layer color to sidebar and mini edit-toggle buttons
    function setEditToggleColor(layerKey, sidebarId, miniId, sidebarCssPrefix, on) {
        try {
            const layerColor = (typeof LAYERS !== 'undefined' && LAYERS && LAYERS[layerKey] && LAYERS[layerKey].color) ? String(LAYERS[layerKey].color).trim() : '#22d3ee';
            const hex = layerColor;
            const parseHexSimple = (h) => {
                if (!h || h[0] !== '#') return null;
                const s = h.slice(1);
                if (s.length === 6) {
                    return { r: parseInt(s.slice(0,2),16), g: parseInt(s.slice(2,4),16), b: parseInt(s.slice(4,6),16) };
                } else if (s.length === 3) {
                    return { r: parseInt(s[0]+s[0],16), g: parseInt(s[1]+s[1],16), b: parseInt(s[2]+s[2],16) };
                } else if (s.length === 8) {
                    return { r: parseInt(s.slice(0,2),16), g: parseInt(s.slice(2,4),16), b: parseInt(s.slice(4,6),16), a: parseInt(s.slice(6,8),16) / 255 };
                } else if (s.length === 4) {
                    return { r: parseInt(s[0]+s[0],16), g: parseInt(s[1]+s[1],16), b: parseInt(s[2]+s[2],16), a: parseInt(s[3]+s[3],16) / 255 };
                }
                return null;
            };
            const rgb = parseHexSimple(hex) || { r: 34, g: 211, b: 238 };
            const isRoute = (layerKey === 'route');
            const glow1 = `rgba(${rgb.r},${rgb.g},${rgb.b},${isRoute ? 0.9 : 0.75})`;
            const glow2 = `rgba(${rgb.r},${rgb.g},${rgb.b},${isRoute ? 0.6 : 0.35})`;
            const border = hex;
            const sidebarEl = document.getElementById(sidebarId);
            const miniEl = document.getElementById(miniId);
            if (on) {
                try { if (sidebarEl) { sidebarEl.style.setProperty(`--${sidebarCssPrefix}-border`, border); sidebarEl.style.setProperty(`--${sidebarCssPrefix}-glow1`, glow1); } } catch (e) {}
                try { if (miniEl) { miniEl.style.setProperty('--edit-layer-glow1', glow1); miniEl.style.setProperty('--edit-layer-glow2', glow2); miniEl.style.setProperty('--edit-layer-border', border); } } catch (e) {}
            } else {
                try { if (sidebarEl) { sidebarEl.style.removeProperty(`--${sidebarCssPrefix}-border`); sidebarEl.style.removeProperty(`--${sidebarCssPrefix}-glow1`); } } catch (e) {}
                try { if (miniEl) { miniEl.style.removeProperty('--edit-layer-glow1'); miniEl.style.removeProperty('--edit-layer-glow2'); } } catch (e) {}
            }
        } catch (e) {}
    }
    
    // Layer toggle handlers are created dynamically in `initializeLayerIcons()`
    
    // Custom marker controls
    document.getElementById('exportCustom').addEventListener('click', () => {
        if (typeof MarkerUtils !== 'undefined') {
            MarkerUtils.exportCustomMarkers();
        }
    });

    // Edit markers toggle - enables placing, dragging and deleting custom markers
    const editToggle = document.getElementById('editMarkersToggle');
    if (editToggle && map) {
        // Reflect initial state
        try { editToggle.setAttribute('aria-pressed', map.editMarkersMode ? 'true' : 'false'); } catch (e) {}
        try { editToggle.classList.toggle('pressed', !!map.editMarkersMode); } catch (e) {}
        editToggle.addEventListener('click', () => {
            const on = !(editToggle.getAttribute('aria-pressed') === 'true');
            try { editToggle.setAttribute('aria-pressed', on ? 'true' : 'false'); } catch (e) {}
            try { editToggle.classList.toggle('pressed', on); } catch (e) {}
                    try { setEditToggleColor('customMarkers','editMarkersToggle','editMarkersToggleMini','edit-markers', on); } catch (e) {}
            try {
                map.editMarkersMode = !!on;
                try {
                    if (map.editMarkersMode) {
                        // Exit route edit mode FIRST (before entering markers mode) to preserve state order
                        if (map.editRouteMode) {
                            try { map._exitEditMode && map._exitEditMode('route'); } catch (e) {}
                        }
                        // Remember previous highlight state, ensure layer highlight is on and mark as editing
                        try { map._enterEditMode && map._enterEditMode('customMarkers', 2.0); } catch (e) {}
                        // Clear selection and update UI
                        try { map.selectedMarker = null; } catch (e) {}
                        try { map.selectedMarkerLayer = null; } catch (e) {}
                        try { map.hideTooltip(); } catch (e) {}
                        try { map.render(); } catch (e) {}
                        try { updateEditOverlay(); } catch (e) {}
                    } else {
                        // Exit edit mode for this layer and restore prior highlight state
                        try { map._exitEditMode && map._exitEditMode('customMarkers'); } catch (e) {}
                        try { updateEditOverlay(); } catch (e) {}
                    }
                } catch (e) {}
                    // If enabling custom marker edit mode, ensure route edit mode is disabled
                    // NOTE: we already exited route mode before entering markers mode (see above)
                    try {
                        if (map.editMarkersMode && map.editRouteMode) {
                            map.editRouteMode = false;
                            // update sidebar toggle UI if present
                            try {
                                const routeToggle = document.getElementById('editRouteToggle');
                                if (routeToggle) { routeToggle.setAttribute('aria-pressed', 'false'); routeToggle.classList.remove('pressed'); }
                            } catch (e) {}
                            // update mini on-screen route toggle if present
                            try {
                                const miniRoute = document.getElementById('editRouteToggleMini');
                                if (miniRoute) { try { setEditToggleColor('route','editRouteToggle','editRouteToggleMini','edit-route', false); } catch(e) {} miniRoute.classList.toggle('glow', false); miniRoute.setAttribute('aria-pressed', 'false'); }
                            } catch (e) {}
                            // re-enable route sidebar row if it was disabled
                            try {
                                const row = document.querySelector('#layerList .layer-toggle[data-layer="route"]');
                                if (row) { row.classList.remove('disabled'); row.removeAttribute('aria-disabled'); }
                            } catch (e) {}
                        }
                    } catch (e) {}
                if (map.editMarkersMode) {
                    // Ensure the customMarkers layer is visible when entering edit mode
                    try {
                        // Prefer using the existing toggle API so UI and state stay in sync
                        if (typeof map.toggleLayer === 'function') {
                            map.toggleLayer('customMarkers', true);
                        } else {
                            if (!map.layerVisibility) map.layerVisibility = {};
                            map.layerVisibility.customMarkers = true;
                            try { map.renderOverlay(); } catch (e) { try { map.render(); } catch (e) {} }
                        }
                        // Update the sidebar row visual if present and disable toggling while editing
                        try {
                            const row = document.querySelector('#layerList .layer-toggle[data-layer="customMarkers"]');
                            if (row) {
                                row.classList.add('active');
                                row.setAttribute('aria-pressed', 'true');
                            }
                        } catch (e) {}
                        try { saveLayerVisibilityToStorage && saveLayerVisibilityToStorage(map.layerVisibility); } catch (e) {}
                    } catch (e) {}
                    // Also update mini on-screen toggle if present
                    try {
                        const mini = document.getElementById('editMarkersToggleMini');
                        if (mini) { try { setEditToggleColor('customMarkers','editMarkersToggle','editMarkersToggleMini','edit-markers', true); } catch(e) {} mini.classList.toggle('glow', true); mini.setAttribute('aria-pressed', 'true'); }
                    } catch (e) {}
                }
                if (!map.editMarkersMode) {
                    // Clear any in-progress dragging state
                    map._draggingCandidate = null;
                    map._draggingMarker = null;
                    try { map.canvas.style.cursor = 'grab'; } catch (e) {}
                    try { map.render(); } catch (e) {}
                    // Re-enable the customMarkers sidebar row if present
                    try {
                        const row = document.querySelector('#layerList .layer-toggle[data-layer="customMarkers"]');
                        if (row) {
                            // no longer disabling/enabling row
                        }
                    } catch (e) {}
                    // Also update mini on-screen toggle if present
                    try {
                        const mini = document.getElementById('editMarkersToggleMini');
                        if (mini) { mini.classList.toggle('glow', false); mini.setAttribute('aria-pressed', 'false'); }
                    } catch (e) {}
                }
            } catch (e) {}
        });
        // Wire the on-screen mini toggle to proxy clicks to the sidebar toggle
        try {
                const mini = document.getElementById('editMarkersToggleMini');
            if (mini) {
                try { mini.setAttribute('aria-pressed', map.editMarkersMode ? 'true' : 'false'); } catch (e) {}
                try { if (map.editMarkersMode) { try { setEditToggleColor('customMarkers','editMarkersToggle','editMarkersToggleMini','edit-markers', true); } catch(e) {} } } catch (e) {}
                // Ensure mini icon uses layer color permanently (set at init)
                try {
                    const markerColor = (typeof LAYERS !== 'undefined' && LAYERS && LAYERS.customMarkers && LAYERS.customMarkers.color) ? String(LAYERS.customMarkers.color).trim() : null;
                    if (markerColor) {
                        mini.style.setProperty('--edit-layer-icon', markerColor);
                        // derive simple rgba press colors
                        try {
                            const s = markerColor[0] === '#' ? markerColor.slice(1) : markerColor;
                            let r=34,g=211,b=238;
                            if (s.length === 6) { r = parseInt(s.slice(0,2),16); g = parseInt(s.slice(2,4),16); b = parseInt(s.slice(4,6),16); }
                            else if (s.length === 3) { r = parseInt(s[0]+s[0],16); g = parseInt(s[1]+s[1],16); b = parseInt(s[2]+s[2],16); }
                            mini.style.setProperty('--edit-layer-border', markerColor);
                            mini.style.setProperty('--edit-layer-press1', `rgba(${r},${g},${b},0.18)`);
                            mini.style.setProperty('--edit-layer-press2', `rgba(${r},${g},${b},0.08)`);
                        } catch(e) {}
                    }
                } catch (e) {}
                try { mini.classList.toggle('glow', !!map.editMarkersMode); } catch (e) {}
                mini.addEventListener('click', () => { try { editToggle.click(); } catch (e) {} });
            }
        } catch (e) {}
    }

    // Edit route toggle - enables route editing interactions
    const routeEditToggle = document.getElementById('editRouteToggle');
    // Ensure mini toggle vars are set unconditionally
    try {
        const mini = document.getElementById('editRouteToggleMini');
        if (mini) {
            const routeColor = (typeof LAYERS !== 'undefined' && LAYERS && LAYERS.route && LAYERS.route.color) ? String(LAYERS.route.color).trim() : null;
            if (routeColor) {
                mini.style.setProperty('--edit-layer-icon', routeColor);
                try {
                    const s = routeColor[0] === '#' ? routeColor.slice(1) : routeColor;
                    let r=34,g=211,b=238;
                    if (s.length === 6) { r = parseInt(s.slice(0,2),16); g = parseInt(s.slice(2,4),16); b = parseInt(s.slice(4,6),16); }
                    else if (s.length === 3) { r = parseInt(s[0]+s[0],16); g = parseInt(s[1]+s[1],16); b = parseInt(s[2]+s[2],16); }
                    mini.style.setProperty('--edit-layer-border', routeColor);
                    mini.style.setProperty('--edit-layer-press1', `rgba(${r},${g},${b},0.18)`);
                    mini.style.setProperty('--edit-layer-press2', `rgba(${r},${g},${b},0.08)`);
                } catch(e) {}
            }
        }
    } catch (e) {}
    if (routeEditToggle && map) {
        // Reflect initial state
        try { routeEditToggle.setAttribute('aria-pressed', map.editRouteMode ? 'true' : 'false'); } catch (e) {}
        try { routeEditToggle.classList.toggle('pressed', !!map.editRouteMode); } catch (e) {}
        routeEditToggle.addEventListener('click', () => {
            const on = !(routeEditToggle.getAttribute('aria-pressed') === 'true');
            try { routeEditToggle.setAttribute('aria-pressed', on ? 'true' : 'false'); } catch (e) {}
            try { routeEditToggle.classList.toggle('pressed', on); } catch (e) {}
            try { setEditToggleColor('route','editRouteToggle','editRouteToggleMini','edit-route', on); } catch (e) {}
            try {
                map.editRouteMode = !!on;
                    try {
                        if (map.editRouteMode) {
                            // Exit markers edit mode FIRST (before entering route mode) to preserve state order
                            if (map.editMarkersMode) {
                                try { map._exitEditMode && map._exitEditMode('customMarkers'); } catch (e) {}
                            }
                            // Enter route edit mode: remember previous highlight and ensure outline is on + editing class
                            try { map._enterEditMode && map._enterEditMode('route', 2.0); } catch (e) {}
                            try { map.selectedMarker = null; } catch (e) {}
                            try { map.selectedMarkerLayer = null; } catch (e) {}
                            try { map.hideTooltip(); } catch (e) {}
                            try { map.render(); } catch (e) {}
                            try { updateEditOverlay(); } catch (e) {}
                        } else {
                            // Exit route edit mode: remove editing modifier and restore prev highlight state
                            try { map._exitEditMode && map._exitEditMode('route'); } catch (e) {}
                            try { updateEditOverlay(); } catch (e) {}
                        }
                    } catch (e) {}
                    // If enabling route edit mode, ensure custom-marker edit mode is disabled
                    // NOTE: we already exited markers mode before entering route mode (see above)
                    try {
                        if (map.editRouteMode && map.editMarkersMode) {
                            map.editMarkersMode = false;
                            // update sidebar toggle UI if present
                            try {
                                const markersToggle = document.getElementById('editMarkersToggle');
                                if (markersToggle) { markersToggle.setAttribute('aria-pressed', 'false'); markersToggle.classList.remove('pressed'); }
                            } catch (e) {}
                            // update mini on-screen markers toggle if present
                            try {
                                const miniMarkers = document.getElementById('editMarkersToggleMini');
                                if (miniMarkers) { try { setEditToggleColor('customMarkers','editMarkersToggle','editMarkersToggleMini','edit-markers', false); } catch(e) {} miniMarkers.classList.toggle('glow', false); miniMarkers.setAttribute('aria-pressed', 'false'); }
                            } catch (e) {}
                            // re-enable customMarkers sidebar row if it was disabled
                            // NOTE: do NOT remove has-inline-highlight here - _exitEditMode already synced it correctly
                            try {
                                const row = document.querySelector('#layerList .layer-toggle[data-layer="customMarkers"]');
                                if (row) { row.classList.remove('disabled'); row.removeAttribute('aria-disabled'); }
                            } catch (e) {}
                        }
                    } catch (e) {}
                if (map.editRouteMode) {
                    // Ensure the route layer is visible when entering edit mode
                    try {
                        if (typeof map.toggleLayer === 'function') {
                            map.toggleLayer('route', true);
                        } else {
                            if (!map.layerVisibility) map.layerVisibility = {};
                            map.layerVisibility.route = true;
                            try { map.renderOverlay(); } catch (e) { try { map.render(); } catch (e) {} }
                        }
                        // Update the sidebar row visual if present and disable toggling while editing
                        try {
                            const row = document.querySelector('#layerList .layer-toggle[data-layer="route"]');
                            if (row) {
                                row.classList.add('active');
                                row.setAttribute('aria-pressed', 'true');
                            }
                        } catch (e) {}
                        try { saveLayerVisibilityToStorage && saveLayerVisibilityToStorage(map.layerVisibility); } catch (e) {}
                    } catch (e) {}
                    // Also update mini on-screen toggle if present
                    try {
                        const mini = document.getElementById('editRouteToggleMini');
                                    if (mini) { try { setEditToggleColor('route','editRouteToggle','editRouteToggleMini','edit-route', true); } catch(e) {} mini.classList.toggle('glow', true); mini.setAttribute('aria-pressed', 'true'); }
                    } catch (e) {}
                }
                if (!map.editRouteMode) {
                    // Clear any in-progress route edit state
                    try { map.render(); } catch (e) {}
                    // Re-enable the route sidebar row if present
                    try {
                        const row = document.querySelector('#layerList .layer-toggle[data-layer="route"]');
                        if (row) {
                            // no longer disabling/enabling row
                        }
                    } catch (e) {}
                    // Also update mini on-screen toggle if present
                    try {
                        const mini = document.getElementById('editRouteToggleMini');
                        if (mini) { mini.classList.toggle('glow', false); mini.setAttribute('aria-pressed', 'false'); }
                    } catch (e) {}
                }
            } catch (e) {}
        });
        // Wire the on-screen mini toggle to proxy clicks to the sidebar toggle
        try {
            const mini = document.getElementById('editRouteToggleMini');
            if (mini) {
                try { mini.setAttribute('aria-pressed', map.editRouteMode ? 'true' : 'false'); } catch (e) {}
                try { mini.classList.toggle('glow', !!map.editRouteMode); } catch (e) {}
                mini.addEventListener('click', () => { try { routeEditToggle.click(); } catch (e) {} });
            }
        } catch (e) {}
    }

    // Tileset controls (Satellite / Holographic)
    const tilesetSatBtn = document.getElementById('tilesetSatBtn');
    const tilesetHoloBtn = document.getElementById('tilesetHoloBtn');
    function updateTilesetUI() {
        if (!tilesetSatBtn || !tilesetHoloBtn) return;
        const current = (map && map.tileset) ? map.tileset : 'sat';
        tilesetSatBtn.classList.toggle('pressed', current === 'sat');
        tilesetHoloBtn.classList.toggle('pressed', current === 'holo');
        tilesetSatBtn.setAttribute('aria-pressed', current === 'sat' ? 'true' : 'false');
        tilesetHoloBtn.setAttribute('aria-pressed', current === 'holo' ? 'true' : 'false');
        // Grayscale button reflects map.tilesetGrayscale
        if (tilesetGrayscaleBtn) {
            const g = (map && map.tilesetGrayscale) ? true : false;
            tilesetGrayscaleBtn.classList.toggle('pressed', g);
            tilesetGrayscaleBtn.setAttribute('aria-pressed', g ? 'true' : 'false');
        }
    }
    const tilesetGrayscaleBtn = document.getElementById('tilesetGrayscaleBtn');
    if (tilesetSatBtn && tilesetHoloBtn) {
        tilesetSatBtn.addEventListener('click', () => { map.setTileset('sat'); updateTilesetUI(); });
        tilesetHoloBtn.addEventListener('click', () => { map.setTileset('holo'); updateTilesetUI(); });
        if (tilesetGrayscaleBtn) {
            tilesetGrayscaleBtn.addEventListener('click', () => {
                map.setTilesetGrayscale(!map.tilesetGrayscale);
                updateTilesetUI();
            });
        }
        // Apply grayscale to canvas on init, then update UI to reflect state
        try { map.setTilesetGrayscale(map.tilesetGrayscale); } catch (e) {}
        updateTilesetUI();
    }

    // Settings: highlight size multiplier slider wiring
    try {
        const slider = document.getElementById('highlightScaleSlider');
        const label = document.getElementById('highlightScaleValue');
        if (slider && label) {
            let initial = (map && typeof map.highlightScaleMultiplier === 'number') ? map.highlightScaleMultiplier : 1.0;
            slider.value = initial;
            // Display a mapped user-facing value while keeping internal numbers unchanged.
            // Users expect the displayed slider to start near 1.2x, so show (internal + 0.6).
            const displayInitial = Number(initial) + 0.6;
            const pctInitial = Math.round(displayInitial * 100);
            label.textContent = `${pctInitial}%`;
            
            slider.addEventListener('input', (ev) => {
                const v = parseFloat(ev.target.value) || 1.0;
                if (map) map.highlightScaleMultiplier = v;
                // Map displayed value to (internal + 0.6) so UI range appears to start around 1.2x
                const display = Number(v) + 0.6;
                const pct = Math.round(display * 100);
                label.textContent = `${pct}%`;
                try { saveHighlightMultiplierToStorage && saveHighlightMultiplierToStorage(v); } catch (e) {}
                try { map.renderOverlay ? map.renderOverlay() : map.render(); } catch (e) {}
            });
            
            slider.addEventListener('change', (ev) => {
                try {
                    if (map) {
                        map.render();
                        if (typeof map.checkMarkerHover === 'function') {
                            if (typeof map.lastMouseX === 'number' && typeof map.lastMouseY === 'number') {
                                map.checkMarkerHover(map.lastMouseX, map.lastMouseY);
                            } else {
                                const rect = map.canvas && map.canvas.getBoundingClientRect ? map.canvas.getBoundingClientRect() : null;
                                if (rect) map.checkMarkerHover(rect.width / 2, rect.height / 2);
                            }
                        }
                    }
                } catch (e) {}
            });
        }
    } catch (e) {}
    
    document.getElementById('importCustom').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    
    document.getElementById('importFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const obj = JSON.parse(ev.target.result);
                let markersToImport = [];

                // Handle different formats
                if (obj && Array.isArray(obj.markers)) {
                    // Format: { markers: [...], ... }
                    markersToImport = obj.markers;
                } else if (Array.isArray(obj)) {
                    // Format: bare array
                    markersToImport = obj;
                } else {
                    throw new Error('Invalid marker file: missing markers array');
                }

                if (!Array.isArray(markersToImport) || markersToImport.length === 0) {
                    throw new Error('File contains no markers');
                }

                // Detect legacy marker file (legacy UIDs like cm01, cm02) vs current hashed UIDs
                const isLegacyMarkersFile = (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.isLegacyMarkerFile === 'function')
                    ? MarkerUtils.isLegacyMarkerFile(markersToImport)
                    : markersToImport.some(m => typeof m.uid === 'undefined' || !(/^[A-Za-z]+_[0-9a-fA-F]{8}$/.test(String(m.uid))));

                // Build migratedMarkers: for legacy files regenerate hashed UIDs; for modern files keep provided UIDs
                const migratedMarkers = markersToImport.map(m => {
                    if (typeof m.x !== 'number' || typeof m.y !== 'number') {
                        throw new Error('Invalid marker: x and y must be numbers');
                    }
                    const x = Number(m.x);
                    const y = Number(m.y);
                    let uid;
                    if (isLegacyMarkersFile) {
                        uid = (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.generateUID === 'function')
                            ? MarkerUtils.generateUID(x, y, 'cm')
                            : `cm_${Math.random().toString(16).slice(2, 10)}`;
                    } else {
                        uid = (typeof m.uid === 'string' && m.uid) ? m.uid : ((typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.generateUID === 'function') ? MarkerUtils.generateUID(x, y, 'cm') : `cm_${Math.random().toString(16).slice(2, 10)}`);
                    }
                    return { uid, x, y };
                });
                if (isLegacyMarkersFile) {
                    alert(`Upgraded custom markers: ${migratedMarkers.length} markers regenerated. UIDs and layers matched by coordinate hash.`);
                    // log removed
                }

                // Check if current markers exist
                const currentMarkers = (LAYERS && LAYERS.customMarkers && Array.isArray(LAYERS.customMarkers.markers))
                    ? LAYERS.customMarkers.markers
                    : [];
                const maxMarkers = map?.layerConfig?.customMarkers?.maxMarkers || 50;
                
                // Count only NEW markers (those without matching UIDs)
                const newMarkersCount = migratedMarkers.filter(imported => {
                    return typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.markerExists === 'function'
                        ? !MarkerUtils.markerExists(imported.uid, currentMarkers)
                        : !currentMarkers.some(current => current.uid === imported.uid);
                }).length;
                
                const totalAfterImport = currentMarkers.length + newMarkersCount;

                if (totalAfterImport > maxMarkers) {
                    const needToDelete = totalAfterImport - maxMarkers;
                    alert(
                        `Cannot import ${migratedMarkers.length} markers.\n\n` +
                        `You have ${currentMarkers.length} markers, import would add ${newMarkersCount} new ones.\n\n` +
                        `Total would be ${totalAfterImport}, maximum is ${maxMarkers}.\n\n` +
                        `Please delete at least ${needToDelete} marker(s) first.`
                    );
                    e.target.value = '';
                    return;
                }

                // Merge markers: replace those with matching UIDs, add new ones
                const mergedMarkers = currentMarkers.slice();
                for (let i = 0; i < migratedMarkers.length; i++) {
                    const importedMarker = migratedMarkers[i];
                    const existingIdx = typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.findMarkerIndex === 'function'
                        ? MarkerUtils.findMarkerIndex(importedMarker.uid, mergedMarkers)
                        : mergedMarkers.findIndex(m => m.uid === importedMarker.uid);
                    if (existingIdx >= 0) {
                        // Overwrite marker with same UID (hash)
                        mergedMarkers[existingIdx] = importedMarker;
                    } else {
                        // Add new marker
                        mergedMarkers.push(importedMarker);
                    }
                }
                
                if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.mergeCustomMarkers === 'function') {
                    MarkerUtils.mergeCustomMarkers(mergedMarkers);
                } else {
                    // Fallback if mergeCustomMarkers not available
                    if (LAYERS.customMarkers) {
                        LAYERS.customMarkers.markers = mergedMarkers;
                        if (typeof map !== 'undefined' && map) {
                            map.customMarkers = LAYERS.customMarkers.markers;
                            if (typeof map.updateLayerCounts === 'function') map.updateLayerCounts();
                            map.render();
                        }
                    }
                }

                // log removed
                e.target.value = '';
            } catch (error) {
                // error logging removed
                alert('Failed to import markers: ' + (error.message || String(error)));
                e.target.value = '';
            }
        };
        reader.onerror = () => {
            alert('Failed to read file');
            e.target.value = '';
        };
        reader.readAsText(file);
    });
    
    document.getElementById('clearCustom').addEventListener('click', () => {
        const markerCount = (LAYERS && LAYERS.customMarkers && Array.isArray(LAYERS.customMarkers.markers)) ? LAYERS.customMarkers.markers.length : 0;
        if (markerCount === 0) {
            alert('No custom markers to clear.');
            return;
        }
        if (confirm('Clear all custom markers? This cannot be undone.')) {
            if (typeof MarkerUtils !== 'undefined') {
                MarkerUtils.clearCustomMarkers();
                map.customMarkers = LAYERS.customMarkers.markers;
                map.updateLayerCounts();
                // Exit marker edit mode via canonical helper so visuals/overlay are cleaned up
                try { if (typeof exitEditModeForLayer === 'function') exitEditModeForLayer('customMarkers'); } catch (e) {}
                try { map._draggingCandidate = null; map._draggingMarker = null; } catch (e) {}
                try { map.canvas.style.cursor = 'grab'; } catch (e) {}
                try { map.render(); } catch (e) {}
            }
        }
    });

    // Routing controls
    const computeImprovedBtn = document.getElementById('computeRouteImprovedBtn');
    const clearRouteBtn = document.getElementById('clearRouteBtn');
    if (computeImprovedBtn) {
        computeImprovedBtn.addEventListener('click', () => {
            beginRouteCompute();
            // Build combined visible marker sources from LAYERS (skip virtual 'route')
            const sources = [];
            const layerEntries2 = Object.entries(LAYERS || {});
            for (let li = 0; li < layerEntries2.length; li++) {
                const layerKey = layerEntries2[li][0];
                const layer = layerEntries2[li][1];
                if (layerKey === 'route') continue;
                if (!map.layerVisibility[layerKey]) continue;
                if (!Array.isArray(layer.markers)) continue;
                for (let i = 0; i < layer.markers.length; i++) {
                    sources.push({ marker: layer.markers[i], layerKey, layerIndex: i });
                }
            }
            if (sources.length === 0) {
                alert('No visible markers available to route.');
                return;
            }

            if (typeof TSPEuclid === 'undefined' || typeof TSPEuclid.solveTSPAdvanced !== 'function') {
                alert('Advanced TSP solver not available.');
                return;
            }

            computeImprovedBtn.disabled = true;
            const oldText2 = computeImprovedBtn.textContent;
            computeImprovedBtn.textContent = 'Computing';

            // Find index of selected marker in sources array (if any selected)
            let selectedMarkerIndex = -1;
            if (map.selectedMarker && map.selectedMarkerLayer) {
                for (let si = 0; si < sources.length; si++) {
                    if (sources[si].marker.uid === map.selectedMarker.uid && sources[si].layerKey === map.selectedMarkerLayer) {
                        selectedMarkerIndex = si;
                        break;
                    }
                }
            }

            setTimeout(() => {
                try {
                    const points = sources.map(s => ({ x: s.marker.x, y: s.marker.y }));
                    
                    // If a marker is selected, start the TSP from that marker
                    const solveOpts = { restarts: 24, threeOptIters: Math.max(2000, points.length * 30) };
                    if (selectedMarkerIndex >= 0) {
                        solveOpts.startPoint = selectedMarkerIndex;
                    }
                    
                    const result = TSPEuclid.solveTSPAdvanced(points, solveOpts);
                    if (result && Array.isArray(result.tour)) {
                        // Rotate tour to start from selected marker if one was selected
                        let finalTour = result.tour;
                        if (selectedMarkerIndex >= 0 && result.tour.length > 0) {
                            // Find position of selected marker in the tour
                            const selectedPos = result.tour.indexOf(selectedMarkerIndex);
                            if (selectedPos >= 0 && selectedPos < result.tour.length) {
                                // Rotate tour so selected marker is at index 0
                                finalTour = result.tour.slice(selectedPos).concat(result.tour.slice(0, selectedPos));
                                // log removed
                            }
                        }
                        
                        // Compute non-looping length (sum of consecutive segments only)
                        let length = 0;
                        try {
                            if (Array.isArray(finalTour) && finalTour.length > 1) {
                                for (let i = 0; i < finalTour.length - 1; i++) {
                                    const a = points[finalTour[i]];
                                    const b = points[finalTour[i + 1]];
                                    const dx = b.x - a.x;
                                    const dy = b.y - a.y;
                                    length += Math.sqrt(dx * dx + dy * dy);
                                }
                            } else {
                                length = 0;
                            }
                        } catch (e) {
                            length = (typeof result.length === 'number') ? result.length : 0;
                        }
                        map.setRoute(finalTour, length, sources);
                        // Do not change looping preference when computing a route; looping is explicit via UI.
                        // Deselect the marker after route is computed
                        try {
                            map.selectedMarker = null;
                            map.selectedMarkerLayer = null;
                            map.hideTooltip();
                        } catch (e) {}
                        // Enter route edit mode automatically so user can refine the computed route
                        try {
                            const routeToggle = document.getElementById('editRouteToggle');
                            if (routeToggle) {
                                // Click the sidebar toggle so its handler performs all UI sync work
                                if (routeToggle.getAttribute('aria-pressed') !== 'true') routeToggle.click();
                            } else {
                                // Fallback: set mode and update overlay/mini toggle directly
                                map.editRouteMode = true;
                                try { updateEditOverlay(); } catch (e) {}
                                try {
                                    const mini = document.getElementById('editRouteToggleMini');
                                        if (mini) { try { setEditToggleColor('route','editRouteToggle','editRouteToggleMini','edit-route', true); } catch(e) {} mini.classList.toggle('glow', true); mini.setAttribute('aria-pressed', 'true'); }
                                } catch (e) {}
                                // Ensure route edit-mode visual state: enter route edit mode helper
                                try { map._enterEditMode && map._enterEditMode('route', 2.0); } catch (e) {}
                                // Disable markers edit mode (and properly exit it)
                                try { map.editMarkersMode = false; } catch (e) {}
                                try { map._exitEditMode && map._exitEditMode('customMarkers'); } catch (e) {}
                                try { const markersToggle = document.getElementById('editMarkersToggle'); if (markersToggle) { markersToggle.setAttribute('aria-pressed','false'); markersToggle.classList.remove('pressed'); } } catch (e) {}
                                try { const miniMarkers = document.getElementById('editMarkersToggleMini'); if (miniMarkers) { try { setEditToggleColor('markers','editMarkersToggle','editMarkersToggleMini','edit-markers', false); } catch(e) {} miniMarkers.classList.toggle('glow', false); miniMarkers.setAttribute('aria-pressed','false'); } } catch (e) {}
                            }
                        } catch (e) {}
                        // log removed
                    } else {
                        alert('Advanced solver returned no route.');
                    }
                } catch (err) {
                    // error logging removed
                    alert('Error computing improved route: ' + err.message);
                } finally {
                    computeImprovedBtn.disabled = false;
                    computeImprovedBtn.textContent = oldText2;
                    endRouteCompute();
                }
            }, 50);
        });
    }

    // Compute route using current route waypoints plus nearby visible markers
    function expandRouteNearby() {
        beginRouteCompute();
        try {
                // debug logging removed
            if (!map.currentRoute || !Array.isArray(map.currentRoute) || map.currentRoute.length < 2) {
                return;
            }

            // Build route waypoints in normalized coordinates
            const routePts = [];
            const routeUIDs = new Set();
            for (let i = 0; i < map.currentRoute.length; i++) {
                const idx = map.currentRoute[i];
                const src = map._routeSources && map._routeSources[idx];
                if (!src || !src.marker) continue;
                routePts.push({ x: src.marker.x, y: src.marker.y });
                if (src.marker.uid) routeUIDs.add(src.marker.uid);
            }
            if (routePts.length < 2) { return; }

            // Threshold in pixels for proximity; tuneable
            const THRESHOLD_PX = 160;
            const thresholdNorm = THRESHOLD_PX / MAP_SIZE;

            // Collect candidate markers from visible layers (exclude virtual 'route')
            const poolSources = [];
            const layerEntries = Object.entries(LAYERS || {});
            for (let li = 0; li < layerEntries.length; li++) {
                const layerKey = layerEntries[li][0];
                const layer = layerEntries[li][1];
                if (layerKey === 'route') continue;
                if (!map.layerVisibility[layerKey]) continue;
                if (!Array.isArray(layer.markers)) continue;
                for (let mi = 0; mi < layer.markers.length; mi++) {
                    const m = layer.markers[mi];
                    if (!m) continue;
                    // Always include route markers (they may be in other layers)
                    if (m.uid && routeUIDs.has(m.uid)) continue; // will add route points separately
                    // Compute minimal distance from m to route polyline (normalized units)
                    let minDist = Infinity;
                    const len = routePts.length;
                    const segCount = map.routeLooping ? len : (len - 1);
                    for (let si = 0; si < segCount; si++) {
                        const a = routePts[si];
                        const b = routePts[(si + 1) % len];
                        if (!a || !b) continue;
                        const vx = b.x - a.x, vy = b.y - a.y;
                        const wx = m.x - a.x, wy = m.y - a.y;
                        const vlen2 = vx * vx + vy * vy;
                        if (vlen2 <= 0) continue;
                        const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vlen2));
                        const px = a.x + vx * t;
                        const py = a.y + vy * t;
                        const dist = Math.hypot(m.x - px, m.y - py);
                        if (dist < minDist) minDist = dist;
                    }
                    if (minDist <= thresholdNorm) {
                        poolSources.push({ marker: m, layerKey: layerKey, layerIndex: mi });
                    }
                }
            }

            // Assign nearby markers to the nearest route segment (by projection)
            const routeLen = routePts.length;
            const segCount = map.routeLooping ? routeLen : (routeLen - 1);
            const segments = new Array(segCount);
            for (let si = 0; si < segCount; si++) segments[si] = [];
            for (let i = 0; i < poolSources.length; i++) {
                const s = poolSources[i];
                if (!s || !s.marker) continue;
                // find closest segment and its t
                let bestSeg = -1; let bestDist = Infinity; let bestT = 0;
                for (let si = 0; si < segCount; si++) {
                    const a = routePts[si];
                    const b = routePts[(si + 1) % routeLen];
                    if (!a || !b) continue;
                    const vx = b.x - a.x, vy = b.y - a.y;
                    const wx = s.marker.x - a.x, wy = s.marker.y - a.y;
                    const vlen2 = vx * vx + vy * vy;
                    if (vlen2 <= 0) continue;
                    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vlen2));
                    const px = a.x + vx * t, py = a.y + vy * t;
                    const dist = Math.hypot(s.marker.x - px, s.marker.y - py);
                    if (dist < bestDist) { bestDist = dist; bestSeg = si; bestT = t; }
                }
                if (bestSeg >= 0) segments[bestSeg].push({ src: s, t: bestT, dist: bestDist });
            }

            // Helper: solve fixed-endpoint shortest Hamiltonian path for small N using DP
            function solveFixedPathForSegment(pointsArr) {
                // pointsArr: array of {x,y} with first=start and last=end
                const n = pointsArr.length;
                if (n <= 2) return [0, 1];
                const k = n - 2; // intermediates count

                // Safety: if too many intermediates, fall back to a cheap greedy solver
                const DP_MAX_K = 14; // 2^14 ~= 16k states
                // distance matrix
                const d = Array.from({ length: n }, () => new Array(n).fill(0));
                for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                    const dx = pointsArr[i].x - pointsArr[j].x; const dy = pointsArr[i].y - pointsArr[j].y;
                    d[i][j] = Math.hypot(dx, dy);
                }

                if (k > DP_MAX_K) {
                    // Greedy nearest-neighbor between fixed endpoints: start at 0, pick nearest unvisited intermediate, finish at n-1
                    try {
                        const visited = new Array(n).fill(false);
                        visited[0] = true; visited[n - 1] = true;
                        const order = [0];
                        let cur = 0;
                        let remaining = k;
                        while (remaining > 0) {
                            let bestIdx = -1; let bestDist = Infinity;
                            for (let j = 1; j < n - 1; j++) {
                                if (visited[j]) continue;
                                if (d[cur][j] < bestDist) { bestDist = d[cur][j]; bestIdx = j; }
                            }
                            if (bestIdx < 0) break;
                            visited[bestIdx] = true;
                            order.push(bestIdx);
                            cur = bestIdx;
                            remaining--;
                        }
                        order.push(n - 1);
                        return order;
                    } catch (err) {
                        // Fallback to trivial ordering on error
                        const seq = [];
                        for (let i = 0; i < n; i++) seq.push(i);
                        return seq;
                    }
                }

                // DP exact solver for small k
                try {
                    const FULL = 1 << k;
                    const dp = new Array(FULL).fill(null).map(() => new Array(k).fill(Infinity));
                    const parent = new Array(FULL).fill(null).map(() => new Array(k).fill(-1));
                    // init
                    for (let j = 0; j < k; j++) {
                        const mask = 1 << j;
                        dp[mask][j] = d[0][j + 1];
                    }
                    for (let mask = 1; mask < FULL; mask++) {
                        for (let last = 0; last < k; last++) {
                            if (!(mask & (1 << last))) continue;
                            const prevMask = mask ^ (1 << last);
                            if (prevMask === 0) continue;
                            for (let prev = 0; prev < k; prev++) {
                                if (!(prevMask & (1 << prev))) continue;
                                const val = dp[prevMask][prev] + d[prev + 1][last + 1];
                                if (val < dp[mask][last]) { dp[mask][last] = val; parent[mask][last] = prev; }
                            }
                        }
                    }
                    // close to end
                    let best = Infinity; let bestLast = -1; const ALL = FULL - 1;
                    if (k === 0) {
                        return [0, n - 1];
                    }
                    for (let last = 0; last < k; last++) {
                        const cost = dp[ALL][last] + d[last + 1][n - 1];
                        if (cost < best) { best = cost; bestLast = last; }
                    }
                    // reconstruct
                    const order = [];
                    let mask = ALL; let cur = bestLast;
                    while (cur >= 0) {
                        order.push(cur + 1);
                        const p = parent[mask][cur];
                        mask = mask ^ (1 << cur);
                        cur = p;
                    }
                    order.reverse();
                    // full path indices
                    const path = [0].concat(order).concat([n - 1]);
                    return path;
                } catch (err) {
                    // On any unexpected failure, fallback to simple ordering
                    const seq = [];
                    for (let i = 0; i < n; i++) seq.push(i);
                    return seq;
                }
            }

            // Build final ordered sources by solving per-segment fixed path
            const finalSources = [];
            for (let si = 0; si < segCount; si++) {
                const aIdx = map.currentRoute[si];
                const bIdx = map.currentRoute[(si + 1) % map.currentRoute.length];
                const srcA = map._routeSources && map._routeSources[aIdx];
                const srcB = map._routeSources && map._routeSources[bIdx];
                if (!srcA || !srcA.marker || !srcB || !srcB.marker) continue;
                // gather segment points: start, intermediates, end
                const pts = [ { x: srcA.marker.x, y: srcA.marker.y, srcObj: { marker: srcA.marker, layerKey: srcA.layerKey } } ];
                // sort markers along segment by t for deterministic ordering before solving
                const bucket = segments[si] || [];
                bucket.sort((p,q) => p.t - q.t);
                // Limit intermediates per-segment to avoid exponential DP blowup and OOM
                const MAX_INTERMEDIATES = 14;
                const limited = (bucket.length > MAX_INTERMEDIATES) ? bucket.slice(0, MAX_INTERMEDIATES) : bucket;
                for (let bi = 0; bi < limited.length; bi++) {
                    pts.push({ x: limited[bi].src.marker.x, y: limited[bi].src.marker.y, srcObj: limited[bi].src });
                }
                pts.push({ x: srcB.marker.x, y: srcB.marker.y, srcObj: { marker: srcB.marker, layerKey: srcB.layerKey } });
                if (pts.length <= 2) {
                    // just append start (except when already added) and let loop continue; avoid duplicating
                    if (finalSources.length === 0) finalSources.push({ marker: srcA.marker, layerKey: srcA.layerKey, layerIndex: finalSources.length });
                    finalSources.push({ marker: srcB.marker, layerKey: srcB.layerKey, layerIndex: finalSources.length });
                    continue;
                }
                // prepare points array for DP (x,y only)
                const pointsArr = pts.map(p => ({ x: p.x, y: p.y }));
                const order = solveFixedPathForSegment(pointsArr);
                // append according to order, but avoid duplicating the shared points between segments
                for (let oi = 0; oi < order.length; oi++) {
                    const pi = order[oi];
                    const srcEntry = pts[pi].srcObj;
                    // skip adding the start if it's already the last appended
                    if (finalSources.length > 0) {
                        const last = finalSources[finalSources.length - 1];
                        if (last && last.marker && srcEntry && srcEntry.marker && last.marker.uid === srcEntry.marker.uid) continue;
                    }
                    finalSources.push({ marker: srcEntry.marker, layerKey: srcEntry.layerKey || 'route', layerIndex: finalSources.length });
                }
            }

            if (finalSources.length < 2) { alert('Not enough markers in the pool to compute a route.'); return; }

            // compute overall length
            let totalLen = 0;
            for (let i = 1; i < finalSources.length; i++) {
                const a = finalSources[i - 1].marker; const b = finalSources[i].marker;
                if (!a || !b) continue;
                const dx = b.x - a.x, dy = b.y - a.y;
                totalLen += Math.hypot(dx, dy);
            }
            const indices = finalSources.map((_, i) => i);
            map.setRoute(indices, totalLen, finalSources);
            try { map.selectedMarker = null; map.selectedMarkerLayer = null; map.hideTooltip(); } catch (e) {}
            try { const routeToggle = document.getElementById('editRouteToggle'); if (routeToggle && routeToggle.getAttribute('aria-pressed') !== 'true') routeToggle.click(); } catch (e) {}
        } catch (e) { /* Nearby compute failed (suppressed) */ alert('Failed to compute nearby route.'); } finally { try { endRouteCompute(); } catch (err) {} }
    }

    const computeNearbyBtn = document.getElementById('computeRouteNearbyBtn');
    if (computeNearbyBtn) {
        // Require the click to originate from a pointerdown on the button to avoid
        // accidental clicks caused by ending drags over controls. Keep the flag
        // set on pointerdown and only clear it when click is handled or on cancel.
        let _computeNearbyBtnPressed = false;
        try {
            computeNearbyBtn.addEventListener('pointerdown', () => { _computeNearbyBtnPressed = true; });
            // Do not clear on pointerup because the click event fires after pointerup;
            // clearing here would make the click always see false. Clear on pointercancel instead.
            computeNearbyBtn.addEventListener('pointerup', () => { /* noop - preserve flag until click handler */ });
            computeNearbyBtn.addEventListener('pointercancel', () => { _computeNearbyBtnPressed = false; });
        } catch (err) {}

        computeNearbyBtn.addEventListener('click', (e) => {
            // Ignore clicks that didn't originate from a pointerdown on this button
            if (!_computeNearbyBtnPressed) return;
            try {
                expandRouteNearby();
            } catch (err) {
                // suppressed
            } finally {
                _computeNearbyBtnPressed = false;
            }
        });
    }

    // Expose expandRouteNearby for programmatic use
    try { if (typeof map !== 'undefined' && map) map.expandRouteNearby = expandRouteNearby; } catch (e) {}

    // Wire mini on-screen Expand Route button if present
    try {
        const computeNearbyMini = document.getElementById('computeRouteNearbyMini');
        if (computeNearbyMini) {
            try {
                const routeColor = (typeof LAYERS !== 'undefined' && LAYERS && LAYERS.route && LAYERS.route.color) ? String(LAYERS.route.color).trim() : null;
                if (routeColor) {
                    computeNearbyMini.style.setProperty('--edit-layer-icon', routeColor);
                    try {
                        const s = routeColor[0] === '#' ? routeColor.slice(1) : routeColor;
                        let r=34,g=211,b=238;
                        if (s.length === 6) { r = parseInt(s.slice(0,2),16); g = parseInt(s.slice(2,4),16); b = parseInt(s.slice(4,6),16); }
                        else if (s.length === 3) { r = parseInt(s[0]+s[0],16); g = parseInt(s[1]+s[1],16); b = parseInt(s[2]+s[2],16); }
                        computeNearbyMini.style.setProperty('--edit-layer-border', routeColor);
                        computeNearbyMini.style.setProperty('--edit-layer-press1', `rgba(${r},${g},${b},0.18)`);
                        computeNearbyMini.style.setProperty('--edit-layer-press2', `rgba(${r},${g},${b},0.08)`);
                    } catch(e) {}
                }
            } catch (e) {}
            computeNearbyMini.addEventListener('click', (e) => { try { expandRouteNearby(); } catch (err) {} });
        }
    } catch (e) {}

    // Route direction toggle: single button that flips animation direction
        try {
            const toggleDirBtn = document.getElementById('toggleRouteDirBtn');
            // Animation direction flag is no longer persisted or flipped; keep forward by default
            try { map._routeAnimationDirection = 1; } catch (e) {}

            // Centralized toggler: reverse waypoint order only (do not change animation direction)
            const toggleRouteDirection = () => {
                try { map._lastRouteAnimTime = performance.now(); } catch (e) {}
                try {
                    if (Array.isArray(map.currentRoute) && map.currentRoute.length > 1 && Array.isArray(map._routeSources)) {
                        const ordered = [];
                        for (let i = 0; i < map.currentRoute.length; i++) {
                            const idx = map.currentRoute[i];
                            const src = map._routeSources && map._routeSources[idx];
                            if (src && src.marker) ordered.push({ marker: src.marker, layerKey: src.layerKey });
                        }
                        if (ordered.length > 1) {
                            ordered.reverse();
                            const newSources = ordered.map((s, i) => ({ marker: s.marker, layerKey: s.layerKey, layerIndex: i }));
                            const newIndices = newSources.map((_, i) => i);
                            try { map.setRoute(newIndices, map.computeRouteLengthNormalized(newSources), newSources); } catch (e) {}
                        }
                    }
                } catch (e) {}
                try { map.render(); } catch (e) {}
            };

            if (toggleDirBtn) {
                toggleDirBtn.addEventListener('click', toggleRouteDirection);
            }
            // Expose toggler for mini button and programmatic use
            try { if (typeof map !== 'undefined' && map) map.toggleRouteDirection = toggleRouteDirection; } catch (e) {}
            // Wire mini on-screen Reverse Route button if present
            try {
                const toggleDirMini = document.getElementById('toggleRouteDirMini');
                if (toggleDirMini) {
                    try {
                        const routeColor = (typeof LAYERS !== 'undefined' && LAYERS && LAYERS.route && LAYERS.route.color) ? String(LAYERS.route.color).trim() : null;
                        if (routeColor) {
                            toggleDirMini.style.setProperty('--edit-layer-icon', routeColor);
                            try {
                                const s = routeColor[0] === '#' ? routeColor.slice(1) : routeColor;
                                let r=34,g=211,b=238;
                                if (s.length === 6) { r = parseInt(s.slice(0,2),16); g = parseInt(s.slice(2,4),16); b = parseInt(s.slice(4,6),16); }
                                else if (s.length === 3) { r = parseInt(s[0]+s[0],16); g = parseInt(s[1]+s[1],16); b = parseInt(s[2]+s[2],16); }
                                toggleDirMini.style.setProperty('--edit-layer-border', routeColor);
                                toggleDirMini.style.setProperty('--edit-layer-press1', `rgba(${r},${g},${b},0.18)`);
                                toggleDirMini.style.setProperty('--edit-layer-press2', `rgba(${r},${g},${b},0.08)`);
                            } catch(e) {}
                        }
                    } catch (e) {}
                    toggleDirMini.addEventListener('click', (ev) => { try { toggleRouteDirection(); } catch (err) {} });
                }
            } catch (e) {}
        } catch (e) {}

    if (clearRouteBtn) {
        clearRouteBtn.addEventListener('click', () => {
            if (!map.currentRoute || map.currentRoute.length === 0) {
                alert('No route to clear.');
                return;
            }
            if (confirm('Clear route? This cannot be undone.')) {
                map.clearRoute();
                // Exit route edit mode when route is cleared
                try { map.editRouteMode = false; } catch (e) {}
                try { map._routeNodeCandidate = null; map._routeInsert = null; } catch (e) {}
                // Update sidebar & mini toggles if present
                try {
                    const routeToggle = document.getElementById('editRouteToggle');
                    if (routeToggle) { routeToggle.setAttribute('aria-pressed', 'false'); routeToggle.classList.remove('pressed'); }
                } catch (e) {}
                try {
                    const miniRoute = document.getElementById('editRouteToggleMini');
                    if (miniRoute) { try { setEditToggleColor('route','editRouteToggle','editRouteToggleMini','edit-route', false); } catch (e) {} miniRoute.classList.toggle('glow', false); miniRoute.setAttribute('aria-pressed', 'false'); }
                } catch (e) {}
                try { updateEditOverlay(); } catch (e) {}
                try { map.render(); } catch (e) {}
            }
        });
    }

    // Sidebar toggle logic
    const app = document.querySelector('.app-container');
    // Support multiple possible handle IDs for backwards compatibility
    const handle = document.getElementById('sidebarHandle') || document.getElementById('sidebarToggle');
    // No persistence: sidebar state should always start open on load
    function setSidebarCollapsed(collapsed, persist = false) {
        if (collapsed) {
            app.classList.add('sidebar-collapsed');
            handle && handle.setAttribute('aria-expanded', 'false');
            // Close hints overlay when sidebar collapses
            try {
                const hintsOverlay = document.getElementById('hintsOverlay');
                const hintsToggle = document.getElementById('hintsToggleBtn');
                if (hintsOverlay) {
                    hintsOverlay.classList.remove('visible');
                    hintsOverlay.setAttribute('aria-hidden', 'true');
                }
                if (hintsToggle) {
                    hintsToggle.setAttribute('aria-expanded', 'false');
                    hintsToggle.classList.remove('pressed');
                }
            } catch (e) {}
        } else {
            app.classList.remove('sidebar-collapsed');
            handle && handle.setAttribute('aria-expanded', 'true');
        }
        // do not persist sidebar state to localStorage
        // Resize map after sidebar animation
        setTimeout(() => map.resize(), 300);
    }

    if (handle) {
        handle.addEventListener('click', () => {
            const collapsed = app.classList.contains('sidebar-collapsed');
            setSidebarCollapsed(!collapsed);
        });
        // Pointer feedback for short press state (avoid sticky hover on mobile)
        handle.addEventListener('pointerdown', (e) => {
            handle.classList.add('pressed');
        });
        handle.addEventListener('pointerup', (e) => {
            handle.classList.remove('pressed');
        });
        handle.addEventListener('pointercancel', (e) => {
            handle.classList.remove('pressed');
        });
    } else {
        console.warn('Sidebar handle element not found; collapsing unavailable');
    }

    // Always start with the sidebar open on page load
    setSidebarCollapsed(false, false);

    // Keyboard shortcuts for UI: toggle sidebar and arrow-key panning
    try {
        document.addEventListener('keydown', (e) => {
                // Global Escape: exit any edit mode
                if (e.key === 'Escape' || e.key === 'Esc') {
                    try {
                        const markersToggle = document.getElementById('editMarkersToggle');
                        const routeToggle = document.getElementById('editRouteToggle');
                        if (map && map.editMarkersMode) {
                            if (markersToggle) markersToggle.click(); else map.editMarkersMode = false;
                        }
                        if (map && map.editRouteMode) {
                            if (routeToggle) routeToggle.click(); else map.editRouteMode = false;
                        }
                        try { updateEditOverlay(); } catch (err) {}
                    } catch (err) {}
                    try { e.preventDefault(); } catch (err) {}
                    return;
                }
            // Ignore when typing in form controls, buttons, links or contenteditable elements
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.tagName === 'BUTTON' || active.tagName === 'A' || active.isContentEditable)) return;

            // Toggle sidebar with Space only (avoid accidental toggles)
            if (e.code === 'Space' || e.key === ' ') {
                try {
                    const collapsed = app.classList.contains('sidebar-collapsed');
                    setSidebarCollapsed(!collapsed);
                    e.preventDefault();
                } catch (err) {}
                return;
            }

            // Tileset shortcuts: '1' -> Satellite, '2' -> Holographic, '3' -> toggle grayscale
            // Zoom shortcuts: 'q' -> Zoom In, 'e' -> Zoom Out (case-insensitive)
            try {
                if (e.key === 'q' || e.key === 'Q') {
                    try {
                        // Toggle Edit Route mode via the sidebar toggle if present
                        const routeToggleEl = document.getElementById('editRouteToggle');
                        if (routeToggleEl) {
                            try { routeToggleEl.click(); } catch (err) {
                                if (typeof map !== 'undefined' && map) map.editRouteMode = !map.editRouteMode;
                            }
                        } else if (typeof map !== 'undefined' && map) {
                            map.editRouteMode = !map.editRouteMode;
                            try {
                                if (map.editRouteMode) {
                                    try { map._enterEditMode && map._enterEditMode('route', 2.0); } catch (e) {}
                                    // disable markers mode and exit it cleanly
                                    try { map.editMarkersMode = false; } catch (e) {}
                                    try { map._exitEditMode && map._exitEditMode('customMarkers'); } catch (e) {}
                                    try { const markersToggle = document.getElementById('editMarkersToggle'); if (markersToggle) { markersToggle.setAttribute('aria-pressed','false'); markersToggle.classList.remove('pressed'); } } catch (e) {}
                                    try { const miniMarkers = document.getElementById('editMarkersToggleMini'); if (miniMarkers) { try { setEditToggleColor('markers','editMarkersToggle','editMarkersToggleMini','edit-markers', false); } catch(e) {} miniMarkers.classList.toggle('glow', false); miniMarkers.setAttribute('aria-pressed','false'); } } catch (e) {}
                                } else {
                                    try { map._exitEditMode && map._exitEditMode('route'); } catch (e) {}
                                }
                            } catch (e) {}
                        }
                    } catch (err) {}
                    try { e.preventDefault(); } catch (err) {}
                    return;
                } else if (e.key === 'e' || e.key === 'E') {
                    try {
                        // Toggle Edit Markers mode via the sidebar toggle if present
                        const editToggleEl = document.getElementById('editMarkersToggle');
                        if (editToggleEl) {
                            // Avoid toggling when focus is in a form control (checked earlier)
                            try { editToggleEl.click(); } catch (err) { /* fallback below */ }
                        } else if (typeof map !== 'undefined' && map) {
                            map.editMarkersMode = !map.editMarkersMode;
                            try {
                                if (map.editMarkersMode) {
                                    try { map._enterEditMode && map._enterEditMode('customMarkers', 2.0); } catch (e) {}
                                    // disable route mode and exit it cleanly
                                    try { map.editRouteMode = false; } catch (e) {}
                                    try { map._exitEditMode && map._exitEditMode('route'); } catch (e) {}
                                    try { const routeToggle = document.getElementById('editRouteToggle'); if (routeToggle) { routeToggle.setAttribute('aria-pressed','false'); routeToggle.classList.remove('pressed'); } } catch (e) {}
                                    try { const miniRoute = document.getElementById('editRouteToggleMini'); if (miniRoute) { try { setEditToggleColor('route','editRouteToggle','editRouteToggleMini','edit-route', false); } catch(e) {} miniRoute.classList.toggle('glow', false); miniRoute.setAttribute('aria-pressed','false'); } } catch (e) {}
                                } else {
                                    try { map._exitEditMode && map._exitEditMode('customMarkers'); } catch (e) {}
                                }
                            } catch (e) {}
                        }
                    } catch (err) {}
                    try { e.preventDefault(); } catch (err) {}
                    return;
                }
                if (e.key === '1') {
                    try { map.setTileset('sat'); } catch (err) {}
                    // update UI buttons if present
                    try {
                        const sat = document.getElementById('tilesetSatBtn');
                        const holo = document.getElementById('tilesetHoloBtn');
                        const gbtn = document.getElementById('tilesetGrayscaleBtn');
                        if (sat) { sat.classList.add('pressed'); sat.setAttribute('aria-pressed', 'true'); }
                        if (holo) { holo.classList.remove('pressed'); holo.setAttribute('aria-pressed', 'false'); }
                        if (gbtn) { gbtn.classList.toggle('pressed', !!map.tilesetGrayscale); gbtn.setAttribute('aria-pressed', map.tilesetGrayscale ? 'true' : 'false'); }
                    } catch (err) {}
                    e.preventDefault();
                    return;
                } else if (e.key === '2') {
                    try { map.setTileset('holo'); } catch (err) {}
                    try {
                        const sat = document.getElementById('tilesetSatBtn');
                        const holo = document.getElementById('tilesetHoloBtn');
                        const gbtn = document.getElementById('tilesetGrayscaleBtn');
                        if (holo) { holo.classList.add('pressed'); holo.setAttribute('aria-pressed', 'true'); }
                        if (sat) { sat.classList.remove('pressed'); sat.setAttribute('aria-pressed', 'false'); }
                        if (gbtn) { gbtn.classList.toggle('pressed', !!map.tilesetGrayscale); gbtn.setAttribute('aria-pressed', map.tilesetGrayscale ? 'true' : 'false'); }
                    } catch (err) {}
                    e.preventDefault();
                    return;
                } else if (e.key === '3') {
                    try { map.setTilesetGrayscale(!map.tilesetGrayscale); } catch (err) {}
                    try {
                        const gbtn = document.getElementById('tilesetGrayscaleBtn');
                        if (gbtn) { gbtn.classList.toggle('pressed', !!map.tilesetGrayscale); gbtn.setAttribute('aria-pressed', map.tilesetGrayscale ? 'true' : 'false'); }
                    } catch (err) {}
                    try { e.preventDefault(); } catch (err) {}
                    return;
                }
                // Quick clears: Y = clear route, X = clear custom markers
                if (e.key === 'y' || e.key === 'Y') {
                    try {
                        const btn = document.getElementById('clearRouteBtn');
                        if (btn) btn.click(); else if (typeof map !== 'undefined' && map) map.clearRoute();
                    } catch (err) {}
                    try { e.preventDefault(); } catch (err) {}
                    return;
                } else if (e.key === 'x' || e.key === 'X') {
                    try {
                        const btn = document.getElementById('clearCustom');
                        if (btn) btn.click(); else if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.clearCustomMarkers === 'function') MarkerUtils.clearCustomMarkers();
                    } catch (err) {}
                    try { e.preventDefault(); } catch (err) {}
                    return;
                } else if (e.key === 'c' || e.key === 'C') {
                    // Ignore if any modifier key is down (pen buttons or OS gestures may emit modifiers)
                    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
                        try { expandRouteNearby(); } catch (err) {}
                    }
                    try { e.preventDefault(); } catch (err) {}
                    return;
                } else if (e.key === '<') {
                    // Map '<' to Reverse Route (same as toggleRouteDirBtn)
                    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
                        try {
                            const dirBtn = document.getElementById('toggleRouteDirBtn');
                            if (dirBtn) {
                                dirBtn.click();
                            } else {
                                // Mirror toggleRouteDirection behavior when button not present: reverse waypoints only
                                try { map._lastRouteAnimTime = performance.now(); } catch (e) {}
                                try {
                                    if (Array.isArray(map.currentRoute) && map.currentRoute.length > 1 && Array.isArray(map._routeSources)) {
                                        const ordered = [];
                                        for (let i = 0; i < map.currentRoute.length; i++) {
                                            const idx = map.currentRoute[i];
                                            const src = map._routeSources && map._routeSources[idx];
                                            if (src && src.marker) ordered.push({ marker: src.marker, layerKey: src.layerKey });
                                        }
                                        if (ordered.length > 1) {
                                            ordered.reverse();
                                            const newSources = ordered.map((s, i) => ({ marker: s.marker, layerKey: s.layerKey, layerIndex: i }));
                                            const newIndices = newSources.map((_, i) => i);
                                            try { map.setRoute(newIndices, map.computeRouteLengthNormalized(newSources), newSources); } catch (e) {}
                                        }
                                    }
                                } catch (e) {}
                                try { map.render(); } catch (e) {}
                            }
                        } catch (err) {}
                    }
                    try { e.preventDefault(); } catch (err) {}
                    return;
                // 'R' mapping removed to avoid accidental activation
                }
            } catch (err) {}

            // Arrow keys + WASD: pan by a fraction of viewport (Shift for larger steps)
            const stepFrac = e.shiftKey ? 0.25 : 0.08;
            let moved = false;
            try {
                const key = e.key;
                if (key === 'ArrowLeft' || key === 'a' || key === 'A') { map.panX += Math.round(map.canvas.clientWidth * stepFrac); moved = true; }
                else if (key === 'ArrowRight' || key === 'd' || key === 'D') { map.panX -= Math.round(map.canvas.clientWidth * stepFrac); moved = true; }
                else if (key === 'ArrowUp' || key === 'w' || key === 'W') { map.panY += Math.round(map.canvas.clientHeight * stepFrac); moved = true; }
                else if (key === 'ArrowDown' || key === 's' || key === 'S') { map.panY -= Math.round(map.canvas.clientHeight * stepFrac); moved = true; }
            } catch (err) {}

            if (moved) {
                try { e.preventDefault(); map.updateResolution(); map.render(); } catch (err) {}
            }
        });
    } catch (e) {}

    // Bind dev sidebar controls (if present)
    try {
        const devStatsPanel = document.getElementById('devStatsPanel');
        const dev_bitmapActive = document.getElementById('dev_bitmapActive');
        const dev_bitmapQueue = document.getElementById('dev_bitmapQueue');
        const dev_imageControllers = document.getElementById('dev_imageControllers');
        const dev_imageBitmaps = document.getElementById('dev_imageBitmaps');
        const devStats = document.getElementById('devStats');

        // live stats updater (populate panel rows if present)
        if ((devStatsPanel || devStats) && map && typeof map.getTileLoadStats === 'function') {
            const upd = () => {
                try {
                    const s = map.getTileLoadStats();
                    if (dev_bitmapActive) dev_bitmapActive.textContent = s.bitmapActive;
                    if (dev_bitmapQueue) dev_bitmapQueue.textContent = s.bitmapQueue;
                    if (dev_imageControllers) dev_imageControllers.textContent = s.imageControllers;
                    if (dev_imageBitmaps) dev_imageBitmaps.textContent = s.imageBitmaps;
                    if (!devStatsPanel && devStats) devStats.textContent = `dec:${s.bitmapActive} q:${s.bitmapQueue} ctrl:${s.imageControllers} bmp:${s.imageBitmaps}`;
                } catch (e) {
                    if (devStatsPanel) {
                        try { if (dev_bitmapActive) dev_bitmapActive.textContent = 'err'; } catch (e) {}
                        try { if (dev_bitmapQueue) dev_bitmapQueue.textContent = 'err'; } catch (e) {}
                        try { if (dev_imageControllers) dev_imageControllers.textContent = 'err'; } catch (e) {}
                        try { if (dev_imageBitmaps) dev_imageBitmaps.textContent = 'err'; } catch (e) {}
                    } else if (devStats) {
                        devStats.textContent = 'error';
                    }
                }
            };
            upd();
            map._devStatsInterval = setInterval(upd, 600);
        }

        // GitHub button
        const githubBtn = document.getElementById('githubBtn');
        if (githubBtn) {
            githubBtn.addEventListener('click', () => {
                window.open('https://github.com/nan-gogh/Metroid-Prime-4-Routing-Tool', '_blank');
            });
        }

        // Discord button
        const discordBtn = document.getElementById('discordBtn');
        if (discordBtn) {
            discordBtn.addEventListener('click', () => {
                window.open('https://discord.gg/AwqA6987ta', '_blank');
            });
        }

        // Update contributor shine effect dynamically
        function updateContributorShine() {
            const rows = document.querySelectorAll('.dataminer-row');
            const totalRows = rows.length;
            
            rows.forEach((row, index) => {
                // Calculate shine intensity from 100% (top) to ~30% (bottom)
                const progress = totalRows > 1 ? index / (totalRows - 1) : 0;
                const opacity = 1 - (progress * 0.7); // Range: 1.0 to 0.3
                
                const bgOpacity = (18 * opacity) / 100; // Range: 0.18 to 0.054
                const borderOpacity = (25 * opacity) / 100; // Range: 0.25 to 0.075
                const shadowOpacity = (15 * opacity) / 100; // Range: 0.15 to 0.045
                
                row.style.background = `rgba(34, 211, 238, ${bgOpacity})`;
                row.style.borderColor = `rgba(34, 211, 238, ${borderOpacity})`;
                row.style.boxShadow = `0 0 ${Math.max(2, 12 * opacity)}px rgba(34, 211, 238, ${shadowOpacity})`;
                
                // Apply unified cyan hue: lighter at top, darker toward bottom
                const label = row.querySelector('.dataminer-label');
                if (label) {
                    // Base cyan taken from dev-stats numbers: #22d3ee -> HSL(188,86%,53%)
                    const hue = 188; // cyan-teal hue for #22d3ee
                    const sat = 86; // saturation percentage for #22d3ee
                    const lightTop = 50; // lightness for top entry (brighter)
                    const lightBottom = 30; // lightness for bottom entry (brighter than before)
                    const lightness = (lightTop - (progress * (lightTop - lightBottom))).toFixed(1);
                    label.style.color = `hsl(${hue}, ${sat}%, ${lightness}%)`;
                    label.style.fontWeight = index === 0 ? '600' : '400';
                }
            });
        }
        
        updateContributorShine();

        // Hints toggle: expand/collapse hints overlay on top of sidebar
        try {
            const hintsToggle = document.getElementById('hintsToggleBtn');
            const hintsOverlay = document.getElementById('hintsOverlay');
            const hintsList = document.getElementById('hintsList');
            if (hintsToggle && hintsOverlay && hintsList) {
                hintsToggle.addEventListener('click', () => {
                    const isOpen = hintsOverlay.classList.toggle('visible');
                    hintsToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                    hintsOverlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
                    hintsList.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
                    // Mirror visual pressed state like other toggle buttons
                    try { hintsToggle.classList.toggle('pressed', !!isOpen); } catch (e) {}
                    // No map.resize() needed — overlay is outside layout flow
                });
            }
        } catch (e) {}

        // File migration tools removed — routes and markers now upgrade in place on import/load
    } catch (e) {}

    // Signal that the app finished initial synchronous startup work so the UI
    // (loading fade) can be removed when the page is ready for interaction.
    try {
        // Wait briefly for the initial map image to arrive so the first
        // visible render (especially at very large zooms) doesn't cause
        // heavy decoding work while the page is already unfaded.
        // This polls for either `map.images[needed]` or `map.currentImage`.
        try {
            const waitForInitialImage = (timeoutMs = 4000) => new Promise((resolve) => {
                const start = Date.now();
                (function check() {
                    try {
                        if (map) {
                            const needed = (typeof map.getNeededResolution === 'function') ? map.getNeededResolution() : null;
                            if (needed !== null && map.images && map.images[needed]) return resolve(true);
                            if (map.currentImage) return resolve(true);
                        }
                    } catch (e) {}
                    if (Date.now() - start >= timeoutMs) return resolve(false);
                    setTimeout(check, 80);
                })();
            });
            // await initial image (short timeout) but don't block startup forever
            await waitForInitialImage(4000);
            // Do one overlay render now that the initial image is available
            try {
                if (map && typeof map.renderOverlay === 'function') map.renderOverlay();
                // Give the browser a chance to paint and finish any decode work
                await new Promise(res => requestAnimationFrame(() => setTimeout(res, 140)));
            } catch (e) {}
        } catch (e) {}
        try { window._mp4Ready = true; } catch (e) {}
        document.dispatchEvent(new Event('mp4-ready'));
    } catch (e) {}
}

document.addEventListener('DOMContentLoaded', init);
