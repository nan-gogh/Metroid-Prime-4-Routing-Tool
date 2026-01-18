// controllers/RouteComputeController.js
// Handles route computation UI interactions and delegates to RouteComputation module

class RouteComputeController {
    constructor(options) {
        // Required dependencies
        this.routeManager = options.routeManager;
        this.routeAnimationState = options.routeAnimationState;
        this.layerState = options.layerState;
        this.selectionState = options.selectionState;
        this.editModeState = options.editModeState;
        this.routeEditState = options.routeEditState;
        this.pointerHandler = options.pointerHandler;
        this.eventBus = options.eventBus;
        // Local reference to global event type constants for consistency
        this.eventTypes = (typeof window !== 'undefined' && window.EventTypes) ? window.EventTypes : (typeof global !== 'undefined' ? global.EventTypes : {});

        // Optional dependencies
        this.config = options.config || MP4Config;
        // Optional access to centralized route manager for consistent calculations
        this.routeManager = options.routeManager || null;
        this.errorHandler = options.errorHandler || new ErrorHandler();

        // For compatibility with extracted code
        this.moduleErrorHandler = this.errorHandler;
    }

    init() {
        this._bindComputeImproved();
        this._bindComputeNearby();
        this._bindClearRoute();
        this._bindDirectionToggle();
    }

    _bindComputeImproved() {
        const computeImprovedBtn = document.getElementById('computeRouteImprovedBtn');
        if (computeImprovedBtn) {
            computeImprovedBtn.addEventListener('click', () => {
                this.computeImprovedRoute();
            });
        }
    }

    _bindComputeNearby() {
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
            } catch (err) { this.errorHandler.logError(err, 'RouteComputeController.init.setupComputeNearbyButtonPointerEvents'); }

            computeNearbyBtn.addEventListener('click', (e) => {
                // Ignore clicks that didn't originate from a pointerdown on this button
                if (!_computeNearbyBtnPressed) return;
                try {
                    this.expandRouteNearby();
                } catch (err) {
                    // suppressed
                } finally {
                    _computeNearbyBtnPressed = false;
                }
            });
        }

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
                        } catch(e) { this.errorHandler.logError(e, 'RouteComputeController.init.setComputeNearbyMiniStyles'); }
                    }
                } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.init.setupComputeNearbyMiniButton'); }
                computeNearbyMini.addEventListener('click', (e) => { try { this.expandRouteNearby(); } catch (err) { this.errorHandler.logError(err, 'RouteComputeController.expandRouteNearby'); } });
            }
        } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.init.initializeComputeNearbyMini'); }
    }

    _bindClearRoute() {
        const clearRouteBtn = document.getElementById('clearRouteBtn');
        if (clearRouteBtn) {
            clearRouteBtn.addEventListener('click', () => {
                this.clearRoute();
            });
        }
    }

    _bindDirectionToggle() {
        try {
            const toggleDirBtn = document.getElementById('toggleRouteDirBtn');
            // Animation direction flag is no longer persisted or flipped; keep forward by default
            try { this.routeAnimationState.setAnimationDirection(1); } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.init.setRouteAnimationDirection'); }

            // Centralized toggler: reverse waypoint order only (do not change animation direction)
            const toggleRouteDirection = () => {
                try { this.routeAnimationState.setLastAnimationTime(performance.now()); } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.toggleRouteDirection.setLastRouteAnimTime'); }
                try {
                    if (Array.isArray(this.routeManager.getRoute()) && this.routeManager.getRoute().length > 1 && Array.isArray(this.routeManager.getRouteSources())) {
                        const ordered = [];
                        for (let i = 0; i < this.routeManager.getRoute().length; i++) {
                            const idx = this.routeManager.getRoute()[i];
                            const src = this.routeManager.getRouteSources() && this.routeManager.getRouteSources()[idx];
                            if (src && src.marker) ordered.push({ marker: src.marker, layerKey: src.layerKey });
                        }
                        if (ordered.length > 1) {
                            ordered.reverse();
                            const newSources = ordered.map((s, i) => ({ marker: s.marker, layerKey: s.layerKey, layerIndex: i }));
                            const newIndices = newSources.map((_, i) => i);
                            try { 
                                const len = this.routeManager ? this.routeManager.computeRouteLengthNormalized(newSources, this.config.MAP_SIZE) : 0;
                                this.routeManager.setRoute(newIndices, len, newSources);
                            } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.toggleRouteDirection.setReversedRoute'); }
                        }
                    }
                } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.toggleRouteDirection.reverseRouteDirection'); }
                // Emit route direction changed event for subscribers
                try { this.eventBus.emit(this.eventTypes.ROUTE_DIRECTION_CHANGED, { triggeredBy: 'route-direction-toggle' }); } catch (e) { this.errorHandler.logDebug('RouteComputeController.emitRouteDirectionChanged failed', 'RouteComputeController.toggleRouteDirection', { error: e }); }
                // Emit render requested event instead of direct render
                this.eventBus.emit(this.eventTypes.RENDER_REQUESTED, {
                    triggeredBy: 'route-direction-toggle'
                });
            };

            if (toggleDirBtn) {
                toggleDirBtn.addEventListener('click', toggleRouteDirection);
            }
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
                            } catch(e) { this.errorHandler.logError(e, 'RouteComputeController.init.setToggleDirectionMiniStyles'); }
                        }
                    } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.init.setupToggleDirectionMiniButton'); }
                    toggleDirMini.addEventListener('click', (ev) => { try { toggleRouteDirection(); } catch (err) { this.errorHandler.logError(err, 'RouteComputeController.toggleRouteDirection'); } });
                }
            } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.init.initializeToggleDirectionMini'); }
        } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.init.setupRouteDirectionToggle'); }
    }

    computeImprovedRoute(startMarkerIndex = -1) {
        // Emit event to request route computation UI update
        this.eventBus.emit(EventTypes.ROUTE_COMPUTATION_REQUESTED);

        // Check for active drag operations and cancel them before computing
        if (this.pointerHandler &&
            (this.routeEditState.hasRouteInsert() || this.routeEditState.hasRouteNodeCandidate() || this.pointerHandler._draggingMarker)) {
            this.pointerHandler._cancelRouteDragOperations('TSP route computation');
        }

        // Build combined visible marker sources from LAYERS (skip virtual 'route')
        const sources = [];
        const layerEntries2 = Object.entries(LAYERS || {});
        for (let li = 0; li < layerEntries2.length; li++) {
            const layerKey = layerEntries2[li][0];
            const layer = layerEntries2[li][1];
            if (layerKey === 'route') continue;
            if (!this.layerState.isLayerVisible(layerKey)) continue;
            if (!Array.isArray(layer.markers)) continue;
            for (let i = 0; i < layer.markers.length; i++) {
                sources.push({ marker: layer.markers[i], layerKey, layerIndex: i });
            }
        }
        if (sources.length === 0) {
            NotificationUtils.showRouteComputationError('No visible markers available to route.');
            return;
        }

        if (typeof TSPEuclid === 'undefined' || typeof TSPEuclid.solveTSPAdvanced !== 'function') {
            NotificationUtils.showRouteComputationError('Advanced TSP solver not available.');
            return;
        }

        const computeImprovedBtn = document.getElementById('computeRouteImprovedBtn');
        if (computeImprovedBtn) {
            computeImprovedBtn.disabled = true;
            const oldText2 = computeImprovedBtn.textContent;
            computeImprovedBtn.textContent = 'Computing';

            // Find index of selected marker in sources array (if any selected)
            let selectedMarkerIndex = startMarkerIndex;
            if (selectedMarkerIndex === -1 && this.selectionState && this.selectionState.selectedMarker && this.selectionState.selectedMarkerLayer) {
                for (let si = 0; si < sources.length; si++) {
                    if (sources[si].marker.uid === this.selectionState.selectedMarker.uid && sources[si].layerKey === this.selectionState.selectedMarkerLayer) {
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
                            this.errorHandler.logError(e, 'RouteComputeController.computeImprovedRoute.getRouteLength');
                        }
                        this.routeManager.setRoute(finalTour, length, sources);
                        // Do not change looping preference when computing a route; looping is explicit via UI.
                        // Deselect the marker after route is computed
                        try {
                            this.selectionState.clearSelectedMarker();
                            this.eventBus.emit(EventTypes.TOOLTIP_HIDE_REQUESTED);
                        } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.computeImprovedRoute.deselectMarker'); }
                        // Enter route edit mode automatically so user can refine the computed route
                        try {
                            const routeToggle = document.getElementById('editRouteToggle');
                            if (routeToggle) {
                                // Click the sidebar toggle so its handler performs all UI sync work
                                if (routeToggle.getAttribute('aria-pressed') !== 'true') routeToggle.click();
                            } else {
                                // Fallback: set mode and update overlay/mini toggle directly
                                this.editModeState.setEditRouteMode(true);
                                this.eventBus.emit(EventTypes.EDIT_OVERLAY_UPDATE_REQUESTED);
                                try {
                                    const mini = document.getElementById('editRouteToggleMini');
                                        if (mini) { try { setEditToggleColor('route','editRouteToggle','editRouteToggleMini','edit-route', true); } catch(e) { this.errorHandler.logError(e, 'RouteComputeController.computeImprovedRoute.setEditToggleColor'); } mini.classList.toggle('glow', true); mini.setAttribute('aria-pressed', 'true'); }
                                } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.computeImprovedRoute.setupMiniRouteToggle'); }
                                // Ensure route edit-mode visual state: enter route edit mode helper
                                try { this.eventBus.emit(EventTypes.EDIT_MODE_ENTER_REQUESTED, { mode: 'route', scale: 2.0 }); } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.computeImprovedRoute.enterRouteEditMode'); }
                                // Disable markers edit mode (and properly exit it)
                                this.editModeState.setEditMarkersMode(false);
                                try { this.eventBus.emit(EventTypes.EDIT_MODE_EXIT_REQUESTED, { mode: 'customMarkers' }); } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.computeImprovedRoute.exitCustomMarkersEditMode'); }
                                try { const markersToggle = document.getElementById('editMarkersToggle'); if (markersToggle) { markersToggle.setAttribute('aria-pressed','false'); markersToggle.classList.remove('active'); } } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.computeImprovedRoute.updateMarkersToggle'); }
                                try { const miniMarkers = document.getElementById('editMarkersToggleMini'); if (miniMarkers) { try { setEditToggleColor('markers','editMarkersToggle','editMarkersToggleMini','edit-markers', false); } catch(e) { this.errorHandler.logError(e, 'RouteComputeController.computeImprovedRoute.setMiniMarkersToggleColor'); } miniMarkers.classList.toggle('glow', false); miniMarkers.setAttribute('aria-pressed','false'); } } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.computeImprovedRoute.updateMiniMarkersToggle'); }
                            }
                        } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.computeImprovedRoute.enterRouteEditModeAfterComputation'); }
                        // log removed
                    } else {
                        NotificationUtils.showRouteComputationError('Advanced solver returned no route.');
                    }
                } catch (err) {
                    // error logging removed
                    NotificationUtils.showRouteComputationError('Error computing improved route: ' + err.message);
                } finally {
                    if (computeImprovedBtn) {
                        computeImprovedBtn.disabled = false;
                        computeImprovedBtn.textContent = oldText2;
                    }
                    endRouteCompute();
                }
            }, 50);
        }
    }

    expandRouteNearby() {
        if (typeof RouteComputation !== 'undefined') {
            RouteComputation.expandRouteNearby(this.map, beginRouteCompute, endRouteCompute, LAYERS, this.config.MAP_SIZE);
        } else {
            NotificationUtils.showModuleError('RouteComputation module not available');
        }
    }

    clearRoute() {
        if (!this.routeManager.getRoute() || this.routeManager.getRoute().length === 0) {
            NotificationUtils.showInfo('No route to clear.');
            return;
        }
        // Use async confirmation to properly handle blocking dialog in separate macrotask
        NotificationUtils.confirmDestructiveActionAsync('Clear route? This cannot be undone.').then(confirmed => {
            if (confirmed) {
                this.routeManager.clearRoute();
                // Exit route edit mode when route is cleared
                this.editModeState.setEditRouteMode(false);
                // Clean up pooled objects before clearing state
                try {
                    const routeInsert = this.routeEditState.getRouteInsert();
                    if (routeInsert && routeInsert.tempMarker && typeof markerPool !== 'undefined') {
                        markerPool.release(routeInsert.tempMarker);
                    }
                } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.clearRoute.releasePooledObjects'); }
                try { this.routeEditState.clearRouteNodeCandidate(); this.routeEditState.clearRouteInsert(); } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.clearRoute.clearRouteCandidates'); }
                // Update sidebar & mini toggles if present
                try {
                    const routeToggle = document.getElementById('editRouteToggle');
                    if (routeToggle) { routeToggle.setAttribute('aria-pressed', 'false'); routeToggle.classList.remove('active'); }
                } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.clearRoute.updateRouteToggle'); }
                try {
                    const miniRoute = document.getElementById('editRouteToggleMini');
                    if (miniRoute) { try { setEditToggleColor('route','editRouteToggle','editRouteToggleMini','edit-route', false); } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.clearRoute.setMiniRouteToggleColor'); } miniRoute.classList.toggle('glow', false); miniRoute.setAttribute('aria-pressed', 'false'); }
                } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.clearRoute.updateMiniRouteToggle'); }
                try { this.eventBus.emit(EventTypes.EDIT_OVERLAY_UPDATE_REQUESTED); } catch (e) { this.errorHandler.logError(e, 'RouteComputeController.clearRoute.updateEditOverlay'); }
                // Emit render requested event instead of direct render
                this.eventBus.emit(this.eventTypes.RENDER_REQUESTED, {
                    triggeredBy: 'route-clear'
                });
            }
        }).catch(e => {
            this.errorHandler.logError(e, 'RouteComputeController.clearRoute');
        });
    }
}

// Export for use in other modules
window.RouteComputeController = RouteComputeController;