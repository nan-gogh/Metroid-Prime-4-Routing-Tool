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
        if (!map || map._routeRaf) return;

        map._lastRouteAnimTime = performance.now();
        const step = (timestamp) => {
            const dt = Math.max(0, timestamp - map._lastRouteAnimTime) / 1000; // seconds
            map._lastRouteAnimTime = timestamp;

            // Advance offset by speed * dt * direction (scale with zoom so perceived
            // animation speed remains consistent across zoom levels)
            const dir = (Number(map._routeAnimationDirection) === -1) ? -1 : 1;
            const zoomFactor = (typeof map.zoom === 'number' && map.zoom > 0) ? map.zoom : 1;
            const speed = map._routeAnimationSpeed || this.CONFIG.DEFAULT_SPEED;

            map._routeDashOffset = (map._routeDashOffset + speed * dt * dir * zoomFactor + this.CONFIG.DASH_OFFSET_WRAP) % this.CONFIG.DASH_OFFSET_WRAP;

            // Only continue animating if there is a route
            if (!map.currentRoute || !map.currentRoute.length) {
                this.stopAnimation(map);
                return;
            }

            // Only redraw the overlay (route + markers) for animation frames
            try {
                if (map.render) map.render();
            } catch (e) {
                this.errorHandler.logDebug('RouteAnimation: render failed', 'RouteAnimation.step.render', { error: e });
            }

            map._routeRaf = requestAnimationFrame(step);
        };

        map._routeRaf = requestAnimationFrame(step);
    },

    /**
     * Stop route animation for a map instance
     * @param {Object} map - The map instance to stop animating
     */
    stopAnimation(map) {
        if (!map) return;

        if (map._routeRaf) {
            cancelAnimationFrame(map._routeRaf);
            map._routeRaf = null;
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