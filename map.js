// Pure Canvas-based Interactive Map

const MAP_SIZE = 8192;
const RESOLUTIONS = [256, 512, 1024, 2048, 4096, 8192];
const MIN_ZOOM = 0.05;
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
        this.lastTap = 0;
        
        // Images cache
        this.images = {};
        this.currentImage = null;
        this.currentResolution = 0;
        this.loadingResolution = null;
        
        // Markers
        this.markers = [];
        this.customMarkers = [];
        this.hoveredMarker = null;
        this.hoveredMarkerLayer = null; // layer key like 'greenCrystals' or 'customMarkers'
        // Selected marker (toggled by click/tap) — used to show persistent tooltip
        this.selectedMarker = null;
        this.selectedMarkerLayer = null;
        
        // Layer visibility state (runtime UI state, separate from data)
        this.layerVisibility = {
            'greenCrystals': true,
            'customMarkers': true
        };
        
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
        
        // Setup
        this.resize();
        this.bindEvents();
        this.centerMap();
        this.preloadAllMapImages();
        this.loadInitialImage();
        this.render();
    }

    // Preload map images at all resolutions to reduce hiccups during zoom/pan
    preloadAllMapImages() {
        const head = document.head || document.getElementsByTagName('head')[0];
        for (let i = 0; i < RESOLUTIONS.length; i++) {
            const size = RESOLUTIONS[i];
            const href = `tiles/${size}.avif`;

            // Hint browser to fetch early
            try {
                const link = document.createElement('link');
                link.rel = 'preload';
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
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * zoomFactor));
            
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
                const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.pinch.startZoom * factor));

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

                // treat short tap (no movement, short press) as click/tap for double-tap detection
                if (!moved && dt < 300) {
                    const now = Date.now();
                    if (now - this.lastTap < 300) {
                        // double-tap -> zoom in centered
                        const centerX = localX;
                        const centerY = localY;
                        const worldX = (centerX - this.panX) / this.zoom;
                        const worldY = (centerY - this.panY) / this.zoom;
                        this.zoom = Math.min(MAX_ZOOM, this.zoom * 1.6);
                        this.panX = centerX - worldX * this.zoom;
                        this.panY = centerY - worldY * this.zoom;
                        this.updateResolution();
                        this.render();
                        this.lastTap = 0;
                    } else {
                        // single tap: record time only — selection/tooltip handled on `click` event
                        this.lastTap = now;
                    }
                }
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
                if (hit.layerKey === 'customMarkers') {
                    if (typeof MarkerUtils !== 'undefined') {
                        MarkerUtils.deleteCustomMarker(hit.marker.uid);
                        this.customMarkers = LAYERS.customMarkers.markers;
                        this.updateCustomMarkerCount();
                        this.render();
                        // Update cursor/hit state at the click location after deletion
                        this.checkMarkerHover(localX, localY);
                    }
                } else if (hit.layerKey === 'greenCrystals') {
                    // Toggle selection for canonical markers -> show/hide persistent tooltip
                    const uid = hit.marker.uid;
                    if (this.selectedMarker && this.selectedMarker.uid === uid && this.selectedMarkerLayer === 'greenCrystals') {
                        // deselect
                        this.selectedMarker = null;
                        this.selectedMarkerLayer = null;
                        this.hideTooltip();
                        this.render();
                    } else {
                        // select
                        this.selectedMarker = hit.marker;
                        this.selectedMarkerLayer = 'greenCrystals';
                        // compute screen coords for tooltip placement
                        const screenX = hit.marker.x * MAP_SIZE * this.zoom + this.panX;
                        const screenY = hit.marker.y * MAP_SIZE * this.zoom + this.panY;
                        this.showTooltip(hit.marker, screenX, screenY, 'greenCrystals');
                        this.render();
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
                    if (typeof MarkerUtils !== 'undefined') {
                        MarkerUtils.addCustomMarker(worldX, worldY);
                        this.customMarkers = LAYERS.customMarkers.markers;
                        this.updateCustomMarkerCount();
                        this.render();
                        // Update cursor/hit state at the click location after placement
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
        
        this.zoom = Math.max(MIN_ZOOM, this.zoom / 1.3);
        
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
        img.src = `tiles/${size}.avif`;
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
        this.customMarkers = LAYERS.customMarkers.markers;
        this.render();
        
        const count = document.getElementById('crystalCount');
        if (count) count.textContent = markers.length;
        
        this.updateCustomMarkerCount();
    }
    
    updateCustomMarkerCount() {
        const count = document.getElementById('customCount');
        if (count) count.textContent = `${this.customMarkers.length} / 50`;
    }
    
    toggleMarkers(show) {
        this.layerVisibility.greenCrystals = show;
        // If crystals are hidden, clear any selected crystal tooltip
        if (!show && this.selectedMarkerLayer === 'greenCrystals') {
            this.selectedMarker = null;
            this.selectedMarkerLayer = null;
            this.hideTooltip();
        }
        this.render();
    }
    
    toggleCustomMarkers(show) {
        this.layerVisibility.customMarkers = show;
        this.render();
    }
    
    checkMarkerHover(mouseX, mouseY) {
        // Only determine whether the cursor is over any marker (for pointer cursor).
        // Selection and tooltip display are managed via click/tap toggles, not hover.
        const markerRadius = this.getHitRadius();
        let foundCursor = false;

        if (this.layerVisibility.customMarkers) {
            for (let i = this.customMarkers.length - 1; i >= 0; i--) {
                const marker = this.customMarkers[i];
                const screenX = marker.x * MAP_SIZE * this.zoom + this.panX;
                const screenY = marker.y * MAP_SIZE * this.zoom + this.panY;
                if (Math.hypot(mouseX - screenX, mouseY - screenY) < markerRadius) {
                    foundCursor = true;
                    break;
                }
            }
        }

        if (this.layerVisibility.greenCrystals) {
            for (let i = this.markers.length - 1; i >= 0; i--) {
                const marker = this.markers[i];
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

        // Check custom markers first
        if (this.layerVisibility.customMarkers) {
            for (let i = this.customMarkers.length - 1; i >= 0; i--) {
                const marker = this.customMarkers[i];
                const mx = marker.x * MAP_SIZE * this.zoom + this.panX;
                const my = marker.y * MAP_SIZE * this.zoom + this.panY;
                if (Math.hypot(screenX - mx, screenY - my) < markerRadius) {
                    return { marker: { ...marker }, index: i, layerKey: 'customMarkers' };
                }
            }
        }

        // Then check green crystals
        if (this.layerVisibility.greenCrystals) {
            for (let i = this.markers.length - 1; i >= 0; i--) {
                const marker = this.markers[i];
                const mx = marker.x * MAP_SIZE * this.zoom + this.panX;
                const my = marker.y * MAP_SIZE * this.zoom + this.panY;
                if (Math.hypot(screenX - mx, screenY - my) < markerRadius) {
                    return { marker: { ...marker }, index: i, layerKey: 'greenCrystals' };
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
        
        // Draw map image
        if (this.currentImage) {
            const size = MAP_SIZE * this.zoom;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(this.currentImage, this.panX, this.panY, size, size);
        }
        
        // Draw markers from all visible layers
        this.renderMarkers();

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
        return Math.max(6, Math.min(16, 10 * this.zoom));
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
        
        // Render green crystals if visible
        if (this.layerVisibility.greenCrystals) {
            const crystalColor = LAYERS.greenCrystals?.color || '#22c55e';
            this.markers.forEach((marker, index) => {
                const screenX = marker.x * MAP_SIZE * this.zoom + this.panX;
                const screenY = marker.y * MAP_SIZE * this.zoom + this.panY;
                
                // Skip if off-screen
                if (screenX < -20 || screenX > cssWidth + 20 ||
                    screenY < -20 || screenY > cssHeight + 20) {
                    return;
                }
                
                const isSelected = this.selectedMarker && this.selectedMarker.uid === marker.uid && this.selectedMarkerLayer === 'greenCrystals';
                const size = isSelected ? baseSize * 1.3 : baseSize; // Adjust size when selected
                
                // Single circle with solid fill and border
                ctx.beginPath();
                ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
                ctx.fillStyle = isSelected ? this.lightenColor(crystalColor, 30) : crystalColor;
                ctx.fill();
                ctx.strokeStyle = isSelected ? this.lightenColor(crystalColor, 50) : this.darkenColor(crystalColor, 50);
                ctx.lineWidth = isSelected ? 2 : 1.5;
                ctx.stroke();
            });
        }
        
        // Render custom markers if visible
        if (this.layerVisibility.customMarkers) {
            const customColor = LAYERS.customMarkers?.color || '#ff6b6b';
            this.customMarkers.forEach((marker, index) => {
                const screenX = marker.x * MAP_SIZE * this.zoom + this.panX;
                const screenY = marker.y * MAP_SIZE * this.zoom + this.panY;

                // Skip if off-screen
                if (screenX < -20 || screenX > cssWidth + 20 ||
                    screenY < -20 || screenY > cssHeight + 20) {
                    return;
                }

                // Always render custom markers without hover-based visual changes
                const size = baseSize; // Use baseSize for custom markers
                ctx.beginPath();
                ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
                ctx.fillStyle = customColor;
                ctx.fill();
                ctx.strokeStyle = this.darkenColor(customColor, 50);
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });
        }
    }
}

// Initialize
let map;

async function initializeLayerIcons() {
    // Dynamically populate layer icons and colors from LAYERS definitions
    // Matches DOM order to LAYERS key order (insertion order)
    const toggles = document.querySelectorAll('.layer-toggle');
    const layerKeys = Object.keys(LAYERS);
    
    toggles.forEach((toggle, index) => {
        const layerKey = layerKeys[index];
        if (layerKey && LAYERS[layerKey]) {
            const layer = LAYERS[layerKey];
            const iconDiv = toggle.querySelector('.layer-icon');
            const nameDiv = toggle.querySelector('.layer-name');
            const countDiv = toggle.querySelector('.layer-count');
            const checkbox = toggle.querySelector('input[type="checkbox"]');
            if (iconDiv) {
                // Set icon text
                if (layer.icon) {
                    iconDiv.textContent = layer.icon;
                }
                // Set background color from layer definition
                if (layer.color) {
                    iconDiv.style.backgroundColor = layer.color;
                }
            }
            // Set display name from layer metadata
            if (nameDiv && layer.name) nameDiv.textContent = layer.name;

            // Initialize counts and checkbox state where applicable
            if (layerKey === 'greenCrystals') {
                if (countDiv) {
                    const n = (layer.markers && layer.markers.length) || 0;
                    countDiv.innerHTML = `<span id="crystalCount">${n}</span> markers`;
                }
                if (checkbox && typeof map !== 'undefined') checkbox.checked = !!map.layerVisibility.greenCrystals;
            } else if (layerKey === 'customMarkers') {
                if (countDiv) {
                    const n = (layer.markers && layer.markers.length) || 0;
                    const max = (map && map.layerConfig && map.layerConfig.customMarkers && map.layerConfig.customMarkers.maxMarkers) || 50;
                    countDiv.innerHTML = `<span id="customCount">${n} / ${max}</span>`;
                }
                if (checkbox && typeof map !== 'undefined') checkbox.checked = !!map.layerVisibility.customMarkers;
            }
        }
    });
}

async function init() {
    // Create map
    map = new InteractiveMap('mapCanvas');
    
    // GREEN_CRYSTALS is loaded from data/greenCrystals.js
    if (typeof GREEN_CRYSTALS !== 'undefined') {
        map.setMarkers(GREEN_CRYSTALS);
        console.log('✓ Loaded GREEN_CRYSTALS:', GREEN_CRYSTALS.length, 'markers');
    } else if (typeof LAYERS !== 'undefined' && LAYERS.greenCrystals) {
        map.setMarkers(LAYERS.greenCrystals.markers);
        console.log('✓ Loaded from LAYERS.greenCrystals:', LAYERS.greenCrystals.markers.length, 'markers');
    } else {
        console.error('✗ GREEN_CRYSTALS data not loaded. Check data/greenCrystals.js is loaded.');
    }
    
    // Populate layer icons from LAYERS definitions
    initializeLayerIcons();
    
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
    
    document.getElementById('toggleCrystals').addEventListener('change', (e) => {
        map.toggleMarkers(e.target.checked);
    });
    
    document.getElementById('toggleCustom').addEventListener('change', (e) => {
        map.toggleCustomMarkers(e.target.checked);
    });
    
    // Custom marker controls
    document.getElementById('exportCustom').addEventListener('click', () => {
        if (typeof MarkerUtils !== 'undefined') {
            MarkerUtils.exportCustomMarkers();
        }
    });
    
    document.getElementById('importCustom').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    
    document.getElementById('importFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && typeof MarkerUtils !== 'undefined') {
            MarkerUtils.importCustomMarkers(file).then(() => {
                map.customMarkers = LAYERS.customMarkers.markers;
                map.updateCustomMarkerCount();
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
                map.updateCustomMarkerCount();
                map.render();
            }
        }
    });

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
