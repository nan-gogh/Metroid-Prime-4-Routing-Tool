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
        this.layerVisibility.grid = true;
        
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

                if (this.pointers.size === 1) {
                    // Determine whether pointerdown hit a custom marker — if so, mark candidate
                    // but do not start the drag until movement exceeds threshold. This preserves
                    // quick-tap behavior (click to delete) when the user just taps.
                    const hit = this.findMarkerAt(localX, localY);
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
                                console.log(`✓ Upgraded ${upgrade.count} legacy route points on import`);
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
                            console.log(`Imported route contained legacy marker UIDs; regenerated ${updatedCount} hashed UIDs`);
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

                        // Set the route with all points
                        map.setRoute(routeIndices, length, sources);
                        console.log('✓ Imported route (points:', sources.length + ', custom markers: ' + customMarkersFromRoute.length + ')');
                    } catch (err) {
                        console.error('Import route failed:', err);
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
                // Save view state
                try { this.saveViewToStorage(); } catch (err) {}

                // short tap (no movement, short press) — let `click` handler manage selection/placement
            }
        });

        this.canvas.addEventListener('pointercancel', (e) => {
            this.pointers.delete(e.pointerId);
            if (this.pointers.size === 0) {
                this.isDragging = false;
                this.pinch = null;
                this.canvas.style.cursor = 'grab';
                // clear any candidate/active drag
                if (this._draggingCandidate && this._draggingCandidate.pointerId === e.pointerId) this._draggingCandidate = null;
                if (this._draggingMarker && this._draggingMarker.pointerId === e.pointerId) this._draggingMarker = null;
            }
        });

        // pointerleave similar to mouseleave
        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'grab';
            this.hideTooltip();
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
                console.error(`Failed to load: ${size}px`);
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
        const markerRadius = this.getHitRadius();
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
                if (Math.hypot(mouseX - screenX, mouseY - screenY) < markerRadius) {
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
        const markerRadius = this.getHitRadius();

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
                if (Math.hypot(screenX - mx, screenY - my) < markerRadius) {
                    return { marker: { ...marker }, index: i, layerKey };
                }
            }
        }

        return null;
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

        // Draw markers from all visible layers onto the overlay canvas
        this.renderMarkers();

        // Draw computed route on top of the map but beneath markers (so markers remain visible)
        this.renderRoute();

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
        ctx.font = `${fontSize}px Arial`;
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
    
    renderMarkers() {
        const ctx = this.ctx;
        const baseSize = this.getBaseMarkerRadius();
        const detailScale = this.getDetailScale();
        // Reduce marker shrink effect so markers remain more readable at high zoom.
        const markerShrinkFactor = (typeof this.markerShrinkFactor === 'number') ? this.markerShrinkFactor : 0.6;
        const markerScale = 1 - (1 - detailScale) * markerShrinkFactor;
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
                // Base size already considers route-node sizing; apply detailScale
                // here to ensure marker visuals shrink uniformly when zoomed in.
                const rawSize = isSelected ? baseSize * 1.3 : baseSize;
                const size = Math.max(1, rawSize * markerScale);

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

        // Draw path
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const idx = this.currentRoute[i];
            const src = this._routeSources[idx];
            const m = src && src.marker;
            if (!m) continue;
            const x = m.x * MAP_SIZE * this.zoom + this.panX;
            const y = m.y * MAP_SIZE * this.zoom + this.panY;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        // Close the loop if no start point was provided (full loop); otherwise open polyline
        if (!this._routeGeneratedWithStartPoint && n > 0) {
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
        this._routeGeneratedWithStartPoint = false;
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
                    console.log(`✓ Upgraded ${upgrade.count} legacy route points to new UID format`);
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
            this.setRoute(routeIndices, length, sources);
            // Load the loop flag from localStorage (persisted separately from route data)
            try {
                let loopFlag = null;
                if (window._mp4Storage && typeof window._mp4Storage.loadSetting === 'function') {
                    loopFlag = window._mp4Storage.loadSetting('mp4_route_looping_flag');
                } else {
                    try { loopFlag = localStorage.getItem('mp4_route_looping_flag'); } catch (e) { loopFlag = null; }
                }
                this._routeGeneratedWithStartPoint = (loopFlag === '1' || loopFlag === 1 || loopFlag === true);
            } catch (e) { /* default to false */ }
            console.log('Loaded saved route (points:', sources.length + ', custom markers: ' + customMarkersFromRoute.length + ')');
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
    // append all other entries in original order, excluding `route` and `customMarkers`
    for (let i = 0; i < layerEntries.length; i++) {
        const k = layerEntries[i][0];
        if (k === 'route' || k === 'customMarkers') continue;
        orderedEntries.push(layerEntries[i]);
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

        // Click handler: toggle active state and perform the same actions as the checkbox change handler
        label.addEventListener('click', (ev) => {
            try {
                const checked = !label.classList.contains('active');
                // Prevent turning off the customMarkers layer while in edit mode
                if (layerKey === 'customMarkers' && typeof map !== 'undefined' && map && map.editMarkersMode && !checked) {
                    // Keep visual state active and do nothing else
                    try { label.classList.toggle('active', true); } catch (e) {}
                    try { label.setAttribute('aria-pressed', 'true'); } catch (e) {}
                    return;
                }
                // update visual and accessibility state
                label.classList.toggle('active', checked);
                label.setAttribute('aria-pressed', checked ? 'true' : 'false');
                // update runtime visibility and render
                if (!map.layerVisibility) map.layerVisibility = {};
                if (layerKey === 'route') {
                    map.layerVisibility.route = checked;
                    try { map.renderOverlay(); } catch (e) { try { map.render(); } catch (e) {} }
                } else {
                    map.toggleLayer(layerKey, checked);
                }
                // persist updated map.layerVisibility
                try { saveLayerVisibilityToStorage(map.layerVisibility); } catch (e) {}
            } catch (e) {}
        });

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
            console.log('✓ Loaded markers from', primaryKey + ':', LAYERS[primaryKey].markers.length, 'markers');
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
                newVisibility[key] = !!checked;
                // reflect active visual state on the row
                try { row.classList.toggle('active', !!checked); row.setAttribute('aria-pressed', !!checked ? 'true' : 'false'); } catch (e) {}
            });
            try {
                map.layerVisibility = Object.assign({}, map.layerVisibility || {}, newVisibility);
            } catch (e) { map.layerVisibility = Object.assign({}, newVisibility); }
            try { saveLayerVisibilityToStorage(map.layerVisibility); } catch (e) {}
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
            try { saveLabel.classList.toggle('active', !!consent); } catch (e) {}
            try { saveLabel.setAttribute('aria-pressed', !!consent ? 'true' : 'false'); } catch (e) {}

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
                        try { saveLayerVisibilityToStorage(map && map.layerVisibility ? map.layerVisibility : {}); } catch (e) {}
                        try { if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.saveToLocalStorage === 'function') MarkerUtils.saveToLocalStorage(); } catch (e) {}
                        try { if (map && typeof map.saveRouteToStorage === 'function') map.saveRouteToStorage(); } catch (e) {}
                        try { if (map && typeof map.saveViewToStorage === 'function') map.saveViewToStorage(); } catch (e) {}
                        try {
                            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                                window._mp4Storage.saveSetting('routeDir', String(map && map._routeAnimationDirection ? map._routeAnimationDirection : 1));
                            } else {
                                try { localStorage.setItem('routeDir', String(map && map._routeAnimationDirection ? map._routeAnimationDirection : 1)); } catch (e) {}
                            }
                        } catch (e) {}
                    } catch (e) {}
                    try { saveLabel.classList.toggle('active', true); } catch (e) {}
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
                        try { saveLabel.classList.toggle('active', true); } catch (e) {}
                        try { if (window._mp4Storage && typeof window._mp4Storage.setStorageConsent === 'function') window._mp4Storage.setStorageConsent(true); else localStorage.setItem('mp4_storage_consent','1'); } catch (e) {}
                    } else {
                        try {
                            if (window._mp4Storage && typeof window._mp4Storage.clearSavedData === 'function') {
                                window._mp4Storage.clearSavedData(true);
                            } else {
                                const keys = ['mp4_customMarkers','mp4_saved_route','mp4_layerVisibility','mp4_tileset','mp4_tileset_grayscale','mp4_map_view','mp4_route_looping_flag','routeDir','mp4_storage_consent'];
                                for (const k of keys) try { localStorage.removeItem(k); } catch (e) {}
                            }
                        } catch (e) {}
                        try { saveLabel.classList.toggle('active', false); } catch (e) {}
                        try { saveLabel.setAttribute('aria-pressed', 'false'); } catch (e) {}
                        try { location.reload(); } catch (e) { /* fallback: continue without reload */ }
                    }
                }
                // reflect state attribute after all processing
                try { saveLabel.setAttribute('aria-pressed', !!on ? 'true' : 'false'); } catch (e) {}
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

    // Attach pressed handlers to all sidebar control buttons (Compute/Clear/Export/etc.)
    attachPressedHandlers('.control-btn');
    
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
            try {
                map.editMarkersMode = !!on;
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
                                row.classList.add('disabled');
                                row.setAttribute('aria-disabled', 'true');
                            }
                        } catch (e) {}
                        try { saveLayerVisibilityToStorage && saveLayerVisibilityToStorage(map.layerVisibility); } catch (e) {}
                    } catch (e) {}
                    // Also update mini on-screen toggle if present
                    try {
                        const mini = document.getElementById('editMarkersToggleMini');
                        if (mini) { mini.classList.toggle('glow', true); mini.setAttribute('aria-pressed', 'true'); }
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
                            row.classList.remove('disabled');
                            row.removeAttribute('aria-disabled');
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
                try { mini.classList.toggle('glow', !!map.editMarkersMode); } catch (e) {}
                mini.addEventListener('click', () => { try { editToggle.click(); } catch (e) {} });
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
                    console.log('Imported legacy marker file: regenerated UIDs');
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

                console.log('✓ Imported and merged', migratedMarkers.length, 'custom markers');
                e.target.value = '';
            } catch (error) {
                console.error('Import failed:', error);
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
                map.render();
            }
        }
    });

    // Routing controls
    const computeImprovedBtn = document.getElementById('computeRouteImprovedBtn');
    const clearRouteBtn = document.getElementById('clearRouteBtn');
    if (computeImprovedBtn) {
        computeImprovedBtn.addEventListener('click', () => {
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
                                console.log(`✓ Route starting from selected marker (${map.selectedMarker.uid})`);
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
                        // Track whether this route was generated with a start point
                        map._routeGeneratedWithStartPoint = (selectedMarkerIndex >= 0);
                        // Persist the loop flag to localStorage (separate from route data, not exported)
                        try {
                            const flagValue = map._routeGeneratedWithStartPoint ? '1' : '0';
                            if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') {
                                window._mp4Storage.saveSetting('mp4_route_looping_flag', flagValue);
                            } else {
                                try { localStorage.setItem('mp4_route_looping_flag', flagValue); } catch (e) {}
                            }
                        } catch (e) {}
                        // Deselect the marker after route is computed
                        try {
                            map.selectedMarker = null;
                            map.selectedMarkerLayer = null;
                            map.hideTooltip();
                        } catch (e) {}
                        console.log('Improved route length (non-looping normalized):', length, 'tour size:', finalTour.length, 'start point:', (selectedMarkerIndex >= 0));
                    } else {
                        alert('Advanced solver returned no route.');
                    }
                } catch (err) {
                    console.error(err);
                    alert('Error computing improved route: ' + err.message);
                } finally {
                    computeImprovedBtn.disabled = false;
                    computeImprovedBtn.textContent = oldText2;
                }
            }, 50);
        });
    }

    // Route direction toggle: single button that flips animation direction
        try {
            const toggleDirBtn = document.getElementById('toggleRouteDirBtn');
            // load persisted direction (1 forward, -1 reverse)
            let stored = 1;
            try {
                const raw = localStorage.getItem('routeDir');
                // If key is missing `raw` will be null; avoid Number(null) === 0
                const parsed = (raw !== null) ? Number(raw) : NaN;
                stored = Number.isFinite(parsed) ? parsed : 1;
            } catch (e) { stored = 1; }
            map._routeAnimationDirection = stored;
            const updateRouteDirUI = () => {
                if (toggleDirBtn) toggleDirBtn.setAttribute('aria-pressed', Number(map._routeAnimationDirection) === -1 ? 'true' : 'false');
            };
            if (toggleDirBtn) {
                toggleDirBtn.addEventListener('click', () => {
                    // Coerce current value to number then flip between 1 and -1
                    map._routeAnimationDirection = (Number(map._routeAnimationDirection) === 1) ? -1 : 1;
                    try { if (window._mp4Storage && typeof window._mp4Storage.saveSetting === 'function') window._mp4Storage.saveSetting('routeDir', String(map._routeAnimationDirection)); /* do not write without consent/helper */ } catch (e) {}
                    // Flip internal dash offset so the dash pattern continues smoothly
                    try {
                        map._routeDashOffset = (1000000 - (Number(map._routeDashOffset) || 0)) % 1000000;
                    } catch (e) {}
                    // Reset the last animation timestamp so the next RAF frame doesn't use a large dt
                    try { map._lastRouteAnimTime = performance.now(); } catch (e) {}
                    // Render immediately to show updated direction without waiting a frame
                    try { map.render(); } catch (e) {}
                    updateRouteDirUI();
                });
            }
            updateRouteDirUI();
        } catch (e) {}

    if (clearRouteBtn) {
        clearRouteBtn.addEventListener('click', () => {
            if (!map.currentRoute || map.currentRoute.length === 0) {
                alert('No route to clear.');
                return;
            }
            if (confirm('Clear computed route? This cannot be undone.')) {
                map.clearRoute();
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
        // Swap the handle glyph instead of rotating it with CSS
        if (handle) {
            const icon = handle.querySelector('.handle-icon');
            if (icon) icon.textContent = collapsed ? '▶' : '◀';
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

            // Tileset shortcuts: '1' -> Satellite, '2' -> Holographic, 'g' -> toggle grayscale
            // Zoom shortcuts: 'q' -> Zoom In, 'e' -> Zoom Out (case-insensitive)
            try {
                if (e.key === 'q' || e.key === 'Q') {
                    try { map.zoomOut(); } catch (err) {}
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
                } else if (e.key === 'g' || e.key === 'G') {
                    try { map.setTilesetGrayscale(!map.tilesetGrayscale); } catch (err) {}
                    try {
                        const gbtn = document.getElementById('tilesetGrayscaleBtn');
                        if (gbtn) { gbtn.classList.toggle('pressed', !!map.tilesetGrayscale); gbtn.setAttribute('aria-pressed', map.tilesetGrayscale ? 'true' : 'false'); }
                    } catch (err) {}
                    e.preventDefault();
                    return;
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
