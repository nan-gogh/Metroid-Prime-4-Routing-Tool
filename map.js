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
        this.pointerStartX = 0;
        this.pointerStartY = 0;
        this.minClickDistance = 5; // pixels - threshold for drag vs click
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
        this.showMarkers = true;
        this.showCustomMarkers = true;
        this.hoveredMarker = null;
        this.hoveredMarkerLayer = null; // 'crystals' or 'custom'
        
        // Tooltip element
        this.tooltip = document.getElementById('tooltip');
        
        // Setup
        this.resize();
        this.bindEvents();
        this.centerMap();
        this.loadInitialImage();
        this.render();
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
            this.pointers.set(e.pointerId, { x: localX, y: localY, clientX: e.clientX, clientY: e.clientY, downTime: Date.now() });

            if (this.pointers.size === 1) {
                // start single-pointer pan
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                // Track starting position for click detection
                this.pointerStartX = e.clientX;
                this.pointerStartY = e.clientY;
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
                this.canvas.style.cursor = this.hoveredMarker ? 'pointer' : 'grab';

                // treat short tap (no movement, short press) as click/tap
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
                        // single tap: check markers and show tooltip or click
                        this.checkMarkerHover(localX, localY);
                        if (this.hoveredMarker) {
                            console.log('Marker tapped:', this.hoveredMarker);
                            this.showTooltip(this.hoveredMarker, localX, localY);
                        }
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
        
        // Click handler - place custom markers or interact with existing markers
        this.canvas.addEventListener('click', (e) => {
            // Check if this was a genuine click (minimal movement) or a drag release
            const distanceMoved = Math.hypot(
                e.clientX - this.pointerStartX,
                e.clientY - this.pointerStartY
            );
            
            // Ignore clicks that were part of a drag operation
            if (distanceMoved > this.minClickDistance) {
                return;
            }
            
            if (this.hoveredMarker) {
                console.log('Marker clicked:', this.hoveredMarker);
                // Could open a popup, mark as collected, etc.
            } else if (e.button === 0) {
                // Left click on empty space - place custom marker
                const rect = this.canvas.getBoundingClientRect();
                const clientX = e.clientX - rect.left;
                const clientY = e.clientY - rect.top;
                
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
                    }
                }
            }
        });
        
        // Right-click handler - delete custom markers
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.hoveredMarker && this.hoveredMarkerLayer === 'custom') {
                if (typeof MarkerUtils !== 'undefined') {
                    MarkerUtils.deleteCustomMarker(this.hoveredMarker.uid);
                    this.customMarkers = LAYERS.customMarkers.markers;
                    this.updateCustomMarkerCount();
                    this.render();
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
        this.showMarkers = show;
        this.render();
    }
    
    toggleCustomMarkers(show) {
        this.showCustomMarkers = show;
        this.render();
    }
    
    checkMarkerHover(mouseX, mouseY) {
        if (!this.showMarkers) {
            this.hoveredMarker = null;
            this.hideTooltip();
            return;
        }
        
        const markerRadius = Math.max(8, 12 * this.zoom);
        let found = null;
        let foundLayer = null;
        
        // Check custom markers first (rendered on top)
        if (this.showCustomMarkers) {
            for (let i = this.customMarkers.length - 1; i >= 0; i--) {
                const marker = this.customMarkers[i];
                const screenX = marker.x * MAP_SIZE * this.zoom + this.panX;
                const screenY = marker.y * MAP_SIZE * this.zoom + this.panY;
                
                const dist = Math.hypot(mouseX - screenX, mouseY - screenY);
                if (dist < markerRadius) {
                    found = { ...marker, index: i };
                    foundLayer = 'custom';
                    break;
                }
            }
        }
        
        // Check green crystals
        if (!found && this.showMarkers) {
            for (let i = this.markers.length - 1; i >= 0; i--) {
                const marker = this.markers[i];
                const screenX = marker.x * MAP_SIZE * this.zoom + this.panX;
                const screenY = marker.y * MAP_SIZE * this.zoom + this.panY;
                
                const dist = Math.hypot(mouseX - screenX, mouseY - screenY);
                if (dist < markerRadius) {
                    found = { ...marker, index: i };
                    foundLayer = 'crystals';
                    break;
                }
            }
        }
        
        if (found !== this.hoveredMarker) {
            this.hoveredMarker = found;
            this.hoveredMarkerLayer = foundLayer;
            this.canvas.style.cursor = found ? 'pointer' : 'grab';
            
            if (found) {
                this.showTooltip(found, mouseX, mouseY);
            } else {
                this.hideTooltip();
            }
            
            this.render();
        }
    }
    
    showTooltip(marker, x, y) {
        if (!this.tooltip) return;
        this.tooltip.textContent = `Green Crystal #${marker.index + 1}`;
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
        
        // Draw markers
        if (this.showMarkers) {
            this.renderMarkers();
        }
    }
    
    renderMarkers() {
        const ctx = this.ctx;
        const baseSize = Math.max(6, Math.min(16, 10 * this.zoom));
        const cssWidth = this.canvas.clientWidth;
        const cssHeight = this.canvas.clientHeight;
        
        // Render green crystals
        this.markers.forEach((marker, index) => {
            const screenX = marker.x * MAP_SIZE * this.zoom + this.panX;
            const screenY = marker.y * MAP_SIZE * this.zoom + this.panY;
            
            // Skip if off-screen
            if (screenX < -20 || screenX > cssWidth + 20 ||
                screenY < -20 || screenY > cssHeight + 20) {
                return;
            }
            
            const isHovered = this.hoveredMarker && this.hoveredMarker.index === index && this.hoveredMarkerLayer === 'crystals';
            const size = isHovered ? baseSize * 1.3 : baseSize;
            
            // Single circle with solid fill and border
            ctx.beginPath();
            ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? '#4ade80' : '#22c55e';
            ctx.fill();
            ctx.strokeStyle = isHovered ? '#86efac' : '#166534';
            ctx.lineWidth = isHovered ? 2 : 1.5;
            ctx.stroke();
        });
        
        // Render custom markers
        if (this.showCustomMarkers) {
            this.customMarkers.forEach((marker, index) => {
                const screenX = marker.x * MAP_SIZE * this.zoom + this.panX;
                const screenY = marker.y * MAP_SIZE * this.zoom + this.panY;
                
                // Skip if off-screen
                if (screenX < -20 || screenX > cssWidth + 20 ||
                    screenY < -20 || screenY > cssHeight + 20) {
                    return;
                }
                
                const isHovered = this.hoveredMarker && this.hoveredMarker.index === index && this.hoveredMarkerLayer === 'custom';
                const size = isHovered ? baseSize * 1.3 : baseSize;
                
                // Custom markers in red/orange with slightly different style
                ctx.beginPath();
                ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
                ctx.fillStyle = isHovered ? '#ff8787' : '#ff6b6b';
                ctx.fill();
                ctx.strokeStyle = isHovered ? '#ffa8a8' : '#c92a2a';
                ctx.lineWidth = isHovered ? 2 : 1.5;
                ctx.stroke();
            });
        }
    }
}

// Initialize
let map;

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
