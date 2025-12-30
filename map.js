// Pure Canvas-based Interactive Map

const MAP_SIZE = 8192;
const RESOLUTIONS = [256, 512, 1024, 2048, 4096, 8192];
// Default zoom limits; `minZoom` is computed per-device in `resize()`
const DEFAULT_MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const DEFAULT_ZOOM = 0.1;

class InteractiveMap {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
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
        
        // Layer visibility state (runtime UI state, separate from data)
        this.layerVisibility = {};
        try {
            const keys = Object.keys(LAYERS || {});
            for (let k = 0; k < keys.length; k++) this.layerVisibility[keys[k]] = true;
        } catch (e) {}
        // Ensure the virtual 'route' layer is present and visible by default
        this.layerVisibility.route = true;
        
        // Layer configuration (runtime constraints, not data)
        this.layerConfig = {
            'customMarkers': {
                maxMarkers: 50
            }
        };
        // Touch hit padding (CSS pixels) to make tapping easier on mobile
        this.touchPadding = 0;
        
        // Tooltip element
        this.tooltip = document.getElementById('tooltip');
        // Tileset selection (sat / holo). Persisted in localStorage as 'mp4_tileset'
        try { this.tileset = localStorage.getItem('mp4_tileset') || 'sat'; } catch (e) { this.tileset = 'sat'; }
        // Optional grayscale flag for tiles; persisted as 'mp4_tileset_grayscale'
        try { this.tilesetGrayscale = localStorage.getItem('mp4_tileset_grayscale') === '1'; } catch (e) { this.tilesetGrayscale = false; }
        
        // Setup
        this.resize();
        this.bindEvents();
        // Fit the full map into the container on initial load so we pick a sensible resolution
        const cssWidth = this.canvas.parentElement.clientWidth;
        const cssHeight = this.canvas.parentElement.clientHeight;
        const fitZoom = Math.min(cssWidth / MAP_SIZE, cssHeight / MAP_SIZE);
        this.zoom = Math.max(this.minZoom || DEFAULT_MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));
        this.centerMap();
        this.preloadAllMapImages();
        this.loadInitialImage();
        this.render();
    }

    // Preload map images at all resolutions to reduce hiccups during zoom/pan
    preloadAllMapImages() {
        const head = document.head || document.getElementsByTagName('head')[0];
        const initial = this.getNeededResolution();
        for (let i = 0; i < RESOLUTIONS.length; i++) {
            const size = RESOLUTIONS[i];
            const href = `tiles/${this.tileset}/${size}.avif`;

            // Hint browser to fetch early
            try {
                const link = document.createElement('link');
                // Only aggressively preload the initially-needed resolution; prefetch others
                link.rel = (i === initial) ? 'preload' : 'prefetch';
                link.as = 'image';
                link.href = href;
                head.appendChild(link);
            } catch (e) {}

            // Stagger fetches to avoid a burst of work on load
            setTimeout(async () => {
                if (this.images[i]) return;
                try {
                    if (window.fetch && window.createImageBitmap) {
                        const resp = await fetch(href);
                        if (resp.ok) {
                            const blob = await resp.blob();
                            const bmp = await createImageBitmap(blob);
                            this.images[i] = bmp;
                            return;
                        }
                    }
                } catch (err) {
                    // fall through to image element fallback
                }

                try {
                    const img = new Image();
                    img.src = href;
                    if (img.decode) {
                        await img.decode();
                    }
                    this.images[i] = img;
                } catch (e) {
                    const img = new Image();
                    img.onload = () => { this.images[i] = img; };
                    img.src = href;
                }
            }, i * 150);
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

        // Scale drawing so we can use CSS pixels in drawing code
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // compute a device-aware minimum zoom so smallest resolution can be reached
        const minRes = RESOLUTIONS[0];
        // minZoom such that minRes >= MAP_SIZE * minZoom * dpr => minZoom = minRes / (MAP_SIZE * dpr)
        this.minZoom = Math.max(0.005, Math.min(DEFAULT_MIN_ZOOM, minRes / (MAP_SIZE * dpr)));
        this.updateResolution();
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
        // Mouse wheel zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(this.minZoom || DEFAULT_MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * zoomFactor));
            
            // Zoom towards mouse position
            const worldX = (mouseX - this.panX) / this.zoom;
            const worldY = (mouseY - this.panY) / this.zoom;
            
            this.zoom = newZoom;
            
            this.panX = mouseX - worldX * this.zoom;
            this.panY = mouseY - worldY * this.zoom;
            
            this.updateResolution();
            this.render();
        });
        // Pointer events (unified for mouse + touch + pen)
        this.canvas.addEventListener('pointerdown', (e) => {
            this.canvas.setPointerCapture(e.pointerId);
            const rect = this.canvas.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            const downTime = Date.now();
            this.pointers.set(e.pointerId, { x: localX, y: localY, clientX: e.clientX, clientY: e.clientY, downTime });

            if (this.pointers.size === 1) {
                // start single-pointer pan
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                // Track timing for click detection
                this.pointerDownTime = downTime;
                this.canvas.style.cursor = 'grabbing';
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
                    if (!map || !map.currentRoute || !Array.isArray(map._routeSources) || !map.currentRoute.length) {
                        alert('No computed route to export.');
                        return;
                    }
                    const pts = [];
                    for (let i = 0; i < map.currentRoute.length; i++) {
                        const idx = map.currentRoute[i];
                        const src = map._routeSources && map._routeSources[idx];
                        if (!src || !src.marker) continue;
                        pts.push({ x: Number(src.marker.x), y: Number(src.marker.y) });
                    }
                    if (!pts.length) { alert('No valid points to export.'); return; }

                    const now = new Date();
                    const timestamp = now.getTime();
                    let hash = '';
                    try {
                        if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.hashMarkerData === 'function') {
                            // reuse hash function by mapping points to marker-like objects
                            hash = MarkerUtils.hashMarkerData(pts.map(p => ({ x: p.x, y: p.y })));
                        }
                    } catch (e) { hash = ''; }

                    const payload = {
                        exported: now.toISOString(),
                        count: pts.length,
                        points: pts,
                        length: map.currentRouteLengthNormalized || 0
                    };

                    const json = JSON.stringify(payload, null, 2);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `route-${timestamp}${hash ? '-' + hash : ''}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    console.log('✓ Exported route (points:', pts.length + ')');
                } catch (err) {
                    console.error('Export route failed:', err);
                    alert('Failed to export route: ' + err.message);
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
                        const sources = obj.points.map((p, i) => ({ marker: { x: Number(p.x), y: Number(p.y) }, layerKey: 'imported', layerIndex: i }));
                        const routeIndices = sources.map((_, i) => i);
                        const length = typeof obj.length === 'number' ? obj.length : 0;
                        map.setRoute(routeIndices, length, sources);
                        console.log('✓ Imported route (points:', sources.length + ')');
                    } catch (err) {
                        console.error('Import route failed:', err);
                        alert('Failed to import route: ' + (err.message || String(err)));
                    }
                };
                reader.onerror = () => alert('Failed to read file');
                reader.readAsText(file);
            });
        }

        this.canvas.addEventListener('pointerup', (e) => {
            this.canvas.releasePointerCapture && this.canvas.releasePointerCapture(e.pointerId);
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
                // update cursor based on whether any marker is under the pointer
                const under = this.findMarkerAt(localX, localY);
                this.canvas.style.cursor = under ? 'pointer' : 'grab';

                // short tap (no movement, short press) — let `click` handler manage selection/placement
            }
        });

        this.canvas.addEventListener('pointercancel', (e) => {
            this.pointers.delete(e.pointerId);
            if (this.pointers.size === 0) {
                this.isDragging = false;
                this.pinch = null;
                this.canvas.style.cursor = 'grab';
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

                if (isDeletable) {
                    if (typeof MarkerUtils !== 'undefined' && typeof MarkerUtils.deleteCustomMarker === 'function') {
                        MarkerUtils.deleteCustomMarker(hit.marker.uid);
                        // MarkerUtils will update LAYERS and map; ensure hover state updates
                        this.checkMarkerHover(localX, localY);
                    }
                } else if (isSelectable) {
                    // Toggle selection for selectable layers
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
                // otherwise: no default action
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
                    if (typeof MarkerUtils !== 'undefined') {
                        MarkerUtils.addCustomMarker(worldX, worldY);
                        // MarkerUtils updates LAYERS and triggers map updates; ensure hover state refresh
                        this.checkMarkerHover(localX, localY);
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
            } else if (e.key === '-') {
                this.zoomOut();
            } else if (e.key === '0') {
                this.resetView();
            }
        });
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
    }
    
    resetView() {
        this.zoom = DEFAULT_ZOOM;
        this.centerMap();
        this.updateResolution();
        this.render();
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
        
        const img = new Image();
        img.onload = () => {
            this.images[resolutionIndex] = img;
            this.loadingResolution = null;
            
            // Always use this image if we don't have one yet, or if it's the best choice
            if (!this.currentImage || resolutionIndex === this.getNeededResolution()) {
                this.currentImage = img;
                this.currentResolution = resolutionIndex;
                this.render();
            }
            this.updateResolution();
        };
        img.onerror = () => {
            this.loadingResolution = null;
            console.error(`Failed to load: ${size}px`);
        };
                    img.src = `tiles/${this.tileset}/${size}.avif`;
    }

    setTileset(tileset) {
        try { tileset = String(tileset); } catch (e) { return; }
        if (!tileset) return;
        if (this.tileset === tileset) return;
        if (tileset !== 'sat' && tileset !== 'holo') return;
        this.tileset = tileset;
        try { localStorage.setItem('mp4_tileset', tileset); } catch (e) {}
        // Clear cached images and reload
        this.images = {};
        this.currentImage = null;
        this.currentResolution = 0;
        this.loadingResolution = null;
        try { this.preloadAllMapImages(); } catch (e) {}
        try { this.loadInitialImage(); } catch (e) {}
        try { this.render(); } catch (e) {}
    }

    setTilesetGrayscale(enabled) {
        this.tilesetGrayscale = !!enabled;
        try { localStorage.setItem('mp4_tileset_grayscale', this.tilesetGrayscale ? '1' : '0'); } catch (e) {}
        try {
            if (this.canvas) {
                console.log('setTilesetGrayscale: applying', this.tilesetGrayscale);
                this.canvas.classList.toggle('grayscale', this.tilesetGrayscale);
                console.log('canvas.classList contains grayscale?', this.canvas.classList.contains('grayscale'));
            } else {
                console.log('setTilesetGrayscale: no canvas element');
            }
            // Force an immediate redraw so the filter takes effect without
            // waiting for the next pointer/mouse event.
            try { this.render(); } catch (e) {}
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

        // Generic re-render
        this.render();
    }
    
    checkMarkerHover(mouseX, mouseY) {
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
        const ctx = this.ctx;
        const cssWidth = this.canvas.clientWidth;
        const cssHeight = this.canvas.clientHeight;

        // Clear canvas (using CSS pixel sizes since context is scaled)
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, cssWidth, cssHeight);
        
        // Draw map image (apply canvas filter when grayscale is enabled)
        if (this.currentImage) {
            const size = MAP_SIZE * this.zoom;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            try {
                ctx.filter = this.tilesetGrayscale ? 'grayscale(100%)' : 'none';
            } catch (e) {}
            ctx.drawImage(this.currentImage, this.panX, this.panY, size, size);
            // reset filter so subsequent drawing (markers/routes) aren't affected
            try { ctx.filter = 'none'; } catch (e) {}
        }
        
        // Draw markers from all visible layers
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
        return Math.max(minSize, Math.min(maxSize, computed));
    }

    // Hit radius used for interaction (render radius + touch padding)
    getHitRadius() {
        return this.getBaseMarkerRadius() + (this.touchPadding || 0);
    }
    
    renderMarkers() {
        const ctx = this.ctx;
        const baseSize = this.getBaseMarkerRadius();
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
                const size = isSelected ? baseSize * 1.3 : baseSize;

                ctx.beginPath();
                ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
                ctx.fillStyle = isSelected ? this.lightenColor(color, 30) : color;
                ctx.fill();
                ctx.strokeStyle = isSelected ? this.lightenColor(color, 50) : this.darkenColor(color, 50);
                ctx.lineWidth = isSelected ? 2 : 1.5;
                ctx.stroke();
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
        const baseLine = (typeof this.routeLineWidth === 'number') ? this.routeLineWidth : 3;
        ctx.lineWidth = Math.max(2, baseLine * this.zoom);
        // configure dashed stroke for animated route (shorter dashes; scale with zoom and base line width)
        const spacingScale = Math.max(0.35, baseLine / 5);
        // Use smaller base multipliers so dashes are shorter and tighter
        const dashLen = Math.max(3, 8 * this.zoom * spacingScale);
        const gapLen = Math.max(3, 6 * this.zoom * spacingScale);
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
        // close loop
        const firstSrc = this._routeSources[this.currentRoute[0]];
        if (firstSrc && firstSrc.marker) ctx.lineTo(firstSrc.marker.x * MAP_SIZE * this.zoom + this.panX, firstSrc.marker.y * MAP_SIZE * this.zoom + this.panY);
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
        try { localStorage.removeItem('mp4_saved_route'); } catch (e) {}
    }

    // Persist the current route to localStorage as an ordered list of positions
    saveRouteToStorage() {
        try {
            if (!this.currentRoute || !Array.isArray(this._routeSources) || !this.currentRoute.length) return;
            const pts = [];
            for (let i = 0; i < this.currentRoute.length; i++) {
                const idx = this.currentRoute[i];
                const src = this._routeSources && this._routeSources[idx];
                if (!src || !src.marker) return; // abort if marker is missing
                pts.push({ x: Number(src.marker.x), y: Number(src.marker.y) });
            }
            const payload = { points: pts, length: this.currentRouteLengthNormalized };
            localStorage.setItem('mp4_saved_route', JSON.stringify(payload));
        } catch (e) {}
    }

    // Attempt to load a previously saved route from localStorage (positions-only) and apply it
    loadRouteFromStorage() {
        try {
            const raw = localStorage.getItem('mp4_saved_route');
            if (!raw) return false;
            const obj = JSON.parse(raw);
            if (!obj || !Array.isArray(obj.points) || obj.points.length === 0) return false;
            const sources = [];
            for (let i = 0; i < obj.points.length; i++) {
                const p = obj.points[i];
                if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
                    console.warn('Saved route contains invalid point at index', i);
                    return false;
                }
                sources.push({ marker: { x: p.x, y: p.y }, layerKey: 'saved', layerIndex: i });
            }
            const routeIndices = sources.map((_, i) => i);
            const length = typeof obj.length === 'number' ? obj.length : 0;
            this.setRoute(routeIndices, length, sources);
            console.log('Loaded saved route (positions:', sources.length + ')');
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
            this.render();
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

async function initializeLayerIcons() {
    // Dynamically build layer toggle list from `LAYERS` so adding layers is data-driven.
    const container = document.getElementById('layerList');
    if (!container) return;
    container.innerHTML = '';

    const layerEntries = Object.entries(LAYERS || {});
    // Ensure a 'route' toggle is present even if not defined in LAYERS (virtual layer)
    /*if (!LAYERS.route) {
        // Use a non-mutating fallback so we don't accidentally create runtime data
        // that should live in a data file. `data/route.js` should provide `LAYERS.route`.
        layerEntries.push(['route', { name: 'Route', icon: '➤', color: '#ffa500' }]);
    }*/
    // Ensure route and greenCrystals appear at the top of the list (route first).
    const preferred = ['route', 'greenCrystals'];
    const orderedEntries = [];
    // push preferred keys in order if present
    for (let i = 0; i < preferred.length; i++) {
        const key = preferred[i];
        const idx = layerEntries.findIndex(e => e[0] === key);
        if (idx >= 0) orderedEntries.push(layerEntries[idx]);
    }
    // append remaining entries in original order
    for (let i = 0; i < layerEntries.length; i++) {
        const k = layerEntries[i][0];
        if (!preferred.includes(k)) orderedEntries.push(layerEntries[i]);
    }

    orderedEntries.forEach(([layerKey, layer]) => {
        // root label
        const label = document.createElement('label');
        label.className = 'layer-toggle';
        label.dataset.layer = layerKey;

        // checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `toggle_${layerKey}`;
        checkbox.checked = !!(map && map.layerVisibility && map.layerVisibility[layerKey]);
        label.appendChild(checkbox);

        // icon
        const iconDiv = document.createElement('div');
        iconDiv.className = 'layer-icon';
        if (layer.icon) iconDiv.textContent = layer.icon;
        if (layer.color) iconDiv.style.backgroundColor = layer.color;
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

        // Add pressed-state feedback for touch/pointer devices to avoid hover sticking
        label.addEventListener('pointerdown', (e) => {
            label.classList.add('pressed');
        });
        label.addEventListener('pointerup', (e) => {
            label.classList.remove('pressed');
        });
        label.addEventListener('pointercancel', (e) => {
            label.classList.remove('pressed');
        });

        // wire change handler per-layer
        checkbox.addEventListener('change', (e) => {
            const checked = !!e.target.checked;
            // update runtime visibility and use generic toggle
            if (!map.layerVisibility) map.layerVisibility = {};
            if (layerKey === 'route') {
                map.layerVisibility.route = checked;
                map.render();
            } else {
                map.toggleLayer(layerKey, checked);
            }
        });
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
            LAYERS.customMarkers.selectable = false;
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
    // Attempt to restore a previously saved route (if any)
    try { map.loadRouteFromStorage(); } catch (e) {}
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
        if (file && typeof MarkerUtils !== 'undefined') {
            MarkerUtils.importCustomMarkers(file).then(() => {
                map.customMarkers = LAYERS.customMarkers.markers;
                map.updateLayerCounts();
                map.render();
                // Reset file input
                e.target.value = '';
            }).catch(error => {
                alert('Import failed: ' + error.message);
                e.target.value = '';
            });
        }
    });
    
    document.getElementById('clearCustom').addEventListener('click', () => {
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
            computeImprovedBtn.textContent = 'Computing (Improved)...';

            setTimeout(() => {
                try {
                    const points = sources.map(s => ({ x: s.marker.x, y: s.marker.y }));
                    const result = TSPEuclid.solveTSPAdvanced(points, { restarts: 24, threeOptIters: Math.max(2000, points.length * 30) });
                    if (result && Array.isArray(result.tour)) {
                        map.setRoute(result.tour, result.length, sources);
                        console.log('Improved route length (normalized):', result.length, 'tour size:', result.tour.length);
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
                    try { localStorage.setItem('routeDir', String(map._routeAnimationDirection)); } catch (e) {}
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
            if (confirm('Clear computed route? This cannot be undone.')) {
                map.clearRoute();
            }
        });
    }

    // Sidebar toggle logic
    const app = document.querySelector('.app-container');
    // Support multiple possible handle IDs for backwards compatibility
    const handle = document.getElementById('sidebarHandle') || document.getElementById('sidebarToggle');
    const SIDEBAR_KEY = 'mp4_sidebar_collapsed';

    function setSidebarCollapsed(collapsed, persist = true) {
        if (collapsed) {
            app.classList.add('sidebar-collapsed');
            handle && handle.setAttribute('aria-expanded', 'false');
        } else {
            app.classList.remove('sidebar-collapsed');
            handle && handle.setAttribute('aria-expanded', 'true');
        }
        // Swap the handle glyph instead of rotating it with CSS
        if (handle) {
            const icon = handle.querySelector('.handle-icon');
            if (icon) icon.textContent = collapsed ? '▶' : '◀';
        }
        if (persist) localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
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

    // Restore saved preference; default collapsed on mobile
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (window.innerWidth <= 720) {
        setSidebarCollapsed(saved !== '0', false);
    } else {
        if (saved === '1') setSidebarCollapsed(true, false);
    }
}

document.addEventListener('DOMContentLoaded', init);
