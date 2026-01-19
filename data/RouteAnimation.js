// Route animation utilities for managing route dash animations
// Extracted from map.js to improve modularity and testability

const RouteAnimation = {
    errorHandler: typeof errorHandler !== 'undefined' ? errorHandler : new ErrorHandler(),
    
    // Configuration constants for route animation
    get CONFIG() {
        return {
            DEFAULT_SPEED: MP4Config.ROUTE.ANIMATION_SPEED || 100, // pixels per second
            DASH_OFFSET_WRAP: MP4Config.ROUTE.DASH_OFFSET_WRAP || 40
        };
    },

    /**
     * Start route animation for a map instance
     * @param {Object} map - The map instance to animate
     */
    startAnimation(map) {
        if (!map) return;

        // Check if animation is already running using RouteAnimationState if available
        if (map.routeAnimationState && map.routeAnimationState.getAnimationFrameId()) return;
        if (!map.routeAnimationState && map._routeRaf) return;

        // Initialize animation state
        if (map.routeAnimationState) {
            map.routeAnimationState.setLastAnimationTime(performance.now());
        } else {
            map._lastRouteAnimTime = performance.now();
        }

        const step = (timestamp) => {
            // Get timing from RouteAnimationState if available
            const lastTime = map.routeAnimationState ? 
                map.routeAnimationState.getLastAnimationTime() : 
                map._lastRouteAnimTime;
            
            const dt = Math.max(0, timestamp - lastTime) / 1000; // seconds
            
            // Update timing
            if (map.routeAnimationState) {
                map.routeAnimationState.setLastAnimationTime(timestamp);
            } else {
                map._lastRouteAnimTime = timestamp;
            }

            // Advance offset by speed * dt * direction (scale with zoom so perceived
            // animation speed remains consistent across zoom levels)
            const dir = (Number(map._routeAnimationDirection) === -1) ? -1 : 1;
            const zoomFactor = (typeof map.zoom === 'number' && map.zoom > 0) ? map.zoom : 1;
            const speed = map._routeAnimationSpeed || this.CONFIG.DEFAULT_SPEED;

            const currentOffset = map.routeAnimationState ? 
                map.routeAnimationState.getAnimationOffset() : 
                map._routeDashOffset;
            
            const newOffset = (currentOffset + speed * dt * dir * zoomFactor + this.CONFIG.DASH_OFFSET_WRAP) % this.CONFIG.DASH_OFFSET_WRAP;

            // Update offset
            if (map.routeAnimationState) {
                map.routeAnimationState.setAnimationOffset(newOffset);
            } else {
                map._routeDashOffset = newOffset;
            }

            // Only continue animating if there is a route
            if (!map.currentRoute || !map.currentRoute.length) {
                this.stopAnimation(map);
                return;
            }

            // Only redraw the route for animation frames through the batched render pipeline
            try {
                if (map.markRendererDirty) {
                    map.markRendererDirty('RouteRenderer');
                } else if (map.render) {
                    map.render(); // Fallback for compatibility
                }
            } catch (e) {
                console.debug('RouteAnimation: render failed', 'RouteAnimation.step.render', { error: e });
            }

            // Schedule next frame and store RAF ID properly
            const rafId = requestAnimationFrame(step);
            if (map.routeAnimationState) {
                map.routeAnimationState.setAnimationFrameId(rafId);
            } else {
                map._routeRaf = rafId;
            }
        };

        // Start first frame and store RAF ID properly
        const rafId = requestAnimationFrame(step);
        if (map.routeAnimationState) {
            map.routeAnimationState.setAnimationFrameId(rafId);
        } else {
            map._routeRaf = rafId;
        }
    },

    /**
     * Stop route animation for a map instance
     * @param {Object} map - The map instance to stop animating
     */
    stopAnimation(map) {
        if (!map) return;

        // Get current RAF ID using RouteAnimationState if available
        const currentRafId = map.routeAnimationState ? 
            map.routeAnimationState.getAnimationFrameId() : 
            map._routeRaf;

        if (currentRafId) {
            cancelAnimationFrame(currentRafId);
            
            // Clear RAF ID using RouteAnimationState if available
            if (map.routeAnimationState) {
                map.routeAnimationState.setAnimationFrameId(null);
            } else {
                map._routeRaf = null;
            }
        }
    },

    /**
     * Set animation direction for a map instance
     * @param {Object} map - The map instance
     * @param {number} direction - 1 for forward, -1 for reverse
     */
    setDirection(map, direction) {
        if (!map) return;

        map._routeAnimationDirection = Number(direction) === -1 ? -1 : 1;
    },

    /**
     * Check if animation is currently running
     * @param {Object} map - The map instance
     * @returns {boolean} True if animation is running
     */
    isAnimating(map) {
        return map && map._routeRaf !== null && map._routeRaf !== undefined;
    },

    /**
     * Initialize animation properties on a map instance
     * @param {Object} map - The map instance to initialize
     */
    initialize(map) {
        if (!map) return;

        if (typeof map._routeAnimationSpeed === 'undefined') {
            map._routeAnimationSpeed = this.CONFIG.DEFAULT_SPEED;
        }

        if (typeof map._routeAnimationDirection === 'undefined') {
            map._routeAnimationDirection = 1; // forward by default
        }

        if (typeof map._routeDashOffset === 'undefined') {
            map._routeDashOffset = 0;
        }

        if (typeof map._routeRaf === 'undefined') {
            map._routeRaf = null;
        }

        if (typeof map._lastRouteAnimTime === 'undefined') {
            map._lastRouteAnimTime = 0;
        }
    }
};

// Make RouteAnimation globally available
window.RouteAnimation = RouteAnimation;
