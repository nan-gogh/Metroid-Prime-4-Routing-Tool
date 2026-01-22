// Route animation utilities for managing route dash animations
// Extracted from map.js to improve modularity and testability


// Ensure a single shared NOOP handler exists globally to avoid duplicate declarations
if (typeof globalThis.__MP4_NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.__MP4_NOOP_ERROR_HANDLER = { logDebug: function () {}, logWarning: function () {}, logError: function () {} };
}

const RouteAnimation = {
    _errorHandler: globalThis.__MP4_NOOP_ERROR_HANDLER,
    setErrorHandler(handler) { this._errorHandler = handler || globalThis.__MP4_NOOP_ERROR_HANDLER; },

    // Configuration constants for route animation
    get CONFIG() {
        return {
            DEFAULT_SPEED: MP4Config.ROUTE.ANIMATION_SPEED || 100, // pixels per second
            DASH_OFFSET_WRAP: MP4Config.ROUTE.DASH_OFFSET_WRAP || 40
        };
    },

    /**
     * Initialize animation defaults on a RouteAnimationState instance
     * @param {RouteAnimationState} routeAnimationState
     * @param {Object} opts
     */
    initialize(routeAnimationState, opts = {}) {
        if (!routeAnimationState) return;
        const h = opts.errorHandler || this._errorHandler;
        try {
            // Ensure the state has sensible defaults
            if (typeof routeAnimationState.getAnimationOffset !== 'function') return;
            if (typeof routeAnimationState.getAnimationOffset() === 'undefined') routeAnimationState.setAnimationOffset(0);
            if (typeof routeAnimationState.getAnimationFrameId() === 'undefined') routeAnimationState.setAnimationFrameId(null);
            if (typeof routeAnimationState.getLastAnimationTime() === 'undefined') routeAnimationState.setLastAnimationTime(0);
            if (typeof routeAnimationState.getAnimationSpeed() === 'undefined') routeAnimationState.setAnimationSpeed(this.CONFIG.DEFAULT_SPEED);
            if (typeof routeAnimationState.getLineWidth() === 'undefined') routeAnimationState.setLineWidth(MP4Config.ROUTE.LINE_WIDTH || 3);
            if (typeof routeAnimationState.getAnimationDirection === 'function' && typeof routeAnimationState.getAnimationDirection() === 'undefined') routeAnimationState.setAnimationDirection(1);
        } catch (e) {
            h && h.logWarning && h.logWarning(e, 'RouteAnimation.initialize');
        }
    },

    /**
     * Start route animation
     * @param {Object} opts - { routeAnimationState, routeManager, mapState, eventBus, renderCallback, errorHandler }
     */
    start(opts = {}) {
        // RouteAnimationController is the single owner of RAF lifecycle
        if (window.RouteAnimationController && typeof window.RouteAnimationController.start === 'function') {
            try { return window.RouteAnimationController.start(opts); } catch (e) { this._errorHandler && this._errorHandler.logWarning && this._errorHandler.logWarning(e, 'RouteAnimation.start.controller'); }
        } else {
            // If controller is unavailable, log an explicit warning — controller is expected.
            const h = opts.errorHandler || this._errorHandler;
            h && h.logWarning && h.logWarning(new Error('RouteAnimationController not available; cannot start animation'), 'RouteAnimation.start.missingController');
        }
    },

    /**
     * Stop route animation
     * @param {Object} opts - { routeAnimationState, errorHandler }
     */
    stop(opts = {}) {
        // Delegate to RouteAnimationController exclusively
        if (window.RouteAnimationController && typeof window.RouteAnimationController.stop === 'function') {
            try { return window.RouteAnimationController.stop(opts); } catch (e) { this._errorHandler && this._errorHandler.logWarning && this._errorHandler.logWarning(e, 'RouteAnimation.stop.controller'); }
        } else {
            const h = opts.errorHandler || this._errorHandler;
            h && h.logWarning && h.logWarning(new Error('RouteAnimationController not available; cannot stop animation'), 'RouteAnimation.stop.missingController');
        }
    },

    /**
     * Set direction on RouteAnimationState
     * @param {RouteAnimationState} routeAnimationState
     * @param {number} direction
     */
    setDirection(routeAnimationState, direction) {
        if (!routeAnimationState) return;
        try { routeAnimationState.setAnimationDirection(direction === -1 ? -1 : 1); } catch (e) { this._errorHandler && this._errorHandler.logWarning && this._errorHandler.logWarning(e, 'RouteAnimation.setDirection'); }
    },

    isAnimating(routeAnimationState) {
        return routeAnimationState && typeof routeAnimationState.getAnimationFrameId === 'function' && !!routeAnimationState.getAnimationFrameId();
    }
};

// Make RouteAnimation globally available
window.RouteAnimation = RouteAnimation;
