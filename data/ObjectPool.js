// Object Pool for performance optimization - reduces GC pressure during frequent object creation
// Integrated with ErrorHandler for robust error handling

// Note: `ErrorHandler` class is exported by `utils/ErrorHandler.js` and attached to
// `window.ErrorHandler` for convenience. Pools do not assume a global instance;
// set a default handler for pre-allocated pools via `setObjectPoolDefaultErrorHandler(handler)`.

class ObjectPool {
    constructor(factory, reset, initialSize = 10, errorHandler = null) {
        this._factory = factory;
        this._reset = reset;
        this._pool = [];
        this._errorHandler = errorHandler || null;
        this._stats = {
            created: 0,
            acquired: 0,
            released: 0,
            peakSize: 0
        };

        // Pre-populate pool
        try {
            for (let i = 0; i < initialSize; i++) {
                this._pool.push(this._factory());
                this._stats.created++;
            }
            this._stats.peakSize = Math.max(this._stats.peakSize, this._pool.length);
        } catch (e) {
            if (this._errorHandler) this._errorHandler.logError(e, 'ObjectPool.constructor.prePopulate', { initialSize });
        }
    }

    /**
     * Acquire an object from the pool or create a new one if pool is empty
     * @returns {Object} Pooled object
     */
    acquire() {
        let obj;
        try {
            if (this._pool.length > 0) {
                obj = this._pool.pop();
            } else {
                obj = this._factory();
                this._stats.created++;
            }
            this._stats.acquired++;
            this._stats.peakSize = Math.max(this._stats.peakSize, this._pool.length + 1);
            return obj;
        } catch (e) {
            if (this._errorHandler) this._errorHandler.logError(e, 'ObjectPool.acquire');
            // Fallback: return a fresh object
            return this._factory();
        }
    }

    /**
     * Release an object back to the pool after resetting it
     * @param {Object} obj - Object to release
     */
    release(obj) {
        if (!obj) {
            if (this._errorHandler) this._errorHandler.logWarning('Attempted to release null/undefined object', 'ObjectPool.release');
            return;
        }

        try {
            this._reset(obj);
            this._pool.push(obj);
            this._stats.released++;
        } catch (e) {
            if (this._errorHandler) this._errorHandler.logError(e, 'ObjectPool.release', { error: e, obj });
            // Don't add corrupted object back to pool
        }
    }

    /**
     * Get pool statistics for debugging/performance monitoring
     * @returns {Object} Pool statistics
     */
    getStats() {
        return {
            ...this._stats,
            currentSize: this._pool.length,
            utilization: this._stats.acquired > 0 ? (this._stats.released / this._stats.acquired * 100).toFixed(1) + '%' : '0%'
        };
    }

    /**
     * Clear the pool and reset statistics
     */
    clear() {
        this._pool.length = 0;
        this._stats = {
            created: 0,
            acquired: 0,
            released: 0,
            peakSize: 0
        };
    }

    /**
     * Resize the pool by adding or removing objects
     * @param {number} newSize - Target pool size
     */
    resize(newSize) {
        try {
            const currentSize = this._pool.length;
            if (newSize > currentSize) {
                // Grow pool
                for (let i = currentSize; i < newSize; i++) {
                    this._pool.push(this._factory());
                    this._stats.created++;
                }
            } else if (newSize < currentSize) {
                // Shrink pool
                this._pool.length = newSize;
            }
        } catch (e) {
            if (this._errorHandler) this._errorHandler.logError(e, 'ObjectPool.resize', { newSize });
        }
    }
}

// Specialized pools for common objects

// Marker pool for temporary markers during route editing
const markerPool = new ObjectPool(
    () => ({ uid: '', x: 0, y: 0 }),
    (marker) => {
        marker.uid = '';
        marker.x = 0;
        marker.y = 0;
    },
    50, // Pre-allocate 50 markers (matches max custom markers limit)
    null
);

// Route source pool for temporary route sources
const routeSourcePool = new ObjectPool(
    () => ({ marker: null, layerKey: '', layerIndex: -1 }),
    (source) => {
        source.marker = null;
        source.layerKey = '';
        source.layerIndex = -1;
    },
    50, // Pre-allocate 50 sources 
    null
);

// Allow injection of default error handler for existing pools
function setObjectPoolDefaultErrorHandler(handler) {
    markerPool._errorHandler = handler;
    routeSourcePool._errorHandler = handler;
}

// Debug function to check pool stats (call from console: checkPoolStats())
function checkPoolStats() {
    try {
        console.debug('=== Object Pool Statistics ===', 'ObjectPool', { markerPool: markerPool.getStats(), routeSourcePool: routeSourcePool.getStats() });
    } catch (e) { try { if (markerPool && markerPool._errorHandler && typeof markerPool._errorHandler.logError === 'function') markerPool._errorHandler.logError(e, 'ObjectPool.checkPoolStats'); else if (routeSourcePool && routeSourcePool._errorHandler && typeof routeSourcePool._errorHandler.logError === 'function') routeSourcePool._errorHandler.logError(e, 'ObjectPool.checkPoolStats'); else console.debug('checkPoolStats failed', e); } catch (ignore) {} }
}

// Make debug function globally available
if (typeof window !== 'undefined') {
    window.checkPoolStats = checkPoolStats;
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ObjectPool, markerPool, routeSourcePool };
}
