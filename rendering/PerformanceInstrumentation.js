// rendering/PerformanceInstrumentation.js
// Instrumentation API for measuring rendering performance and identifying bottlenecks.

(function (global) {
  /**
   * PerformanceInstrumentation tracks rendering metrics and provides diagnostic data.
   * Manages tile load latency, decode duration, frame times, and event aggregation.
   */
  class PerformanceInstrumentation {
    constructor() {
      // Tile metrics
      this.tileMetrics = {
        loadStartCount: 0,
        loadStartTotalMs: 0,
        loadCompletedCount: 0,
        loadCompletedTotalMs: 0,
        decodeStartCount: 0,
        decodeStartTotalMs: 0,
        decodeCompletedCount: 0,
        decodeCompletedTotalMs: 0,
        lastLoadLatencyMs: 0,
        lastDecodeLatencyMs: 0,
      };

      // Frame metrics
      this.frameMetrics = {
        frameCount: 0,
        frameTotalMs: 0,
        framesOver16msCount: 0,
        framesOver33msCount: 0,
        lastFrameMs: 0,
        maxFrameMs: 0,
      };

      // Renderer-specific metrics
      this.rendererMetrics = new Map();

      // Event history for detailed analysis
      this.eventHistory = [];
      this.maxHistorySize = 100;
    }

    /**
     * Record the start of a tile load operation.
     * @param {string} tileKey - Identifier for the tile being loaded
     */
    recordTileLoadStart(tileKey) {
      const startTime = performance.now();
      this.tileMetrics.loadStartCount++;
      this._recordEvent('tile-load-start', { tileKey, timestamp: startTime });
    }

    /**
     * Record the completion of a tile load operation.
     * @param {string} tileKey - Identifier for the tile
     * @param {number} durationMs - Load duration in milliseconds
     */
    recordTileLoadComplete(tileKey, durationMs) {
      this.tileMetrics.loadCompletedCount++;
      this.tileMetrics.loadCompletedTotalMs += durationMs;
      this.tileMetrics.lastLoadLatencyMs = durationMs;
      this._recordEvent('tile-load-complete', { tileKey, durationMs });
    }

    /**
     * Record the start of a bitmap decode operation.
     * @param {string} tileKey - Identifier for the tile being decoded
     */
    recordDecodeStart(tileKey) {
      const startTime = performance.now();
      this.tileMetrics.decodeStartCount++;
      this._recordEvent('decode-start', { tileKey, timestamp: startTime });
    }

    /**
     * Record the completion of a bitmap decode operation.
     * @param {string} tileKey - Identifier for the tile
     * @param {number} durationMs - Decode duration in milliseconds
     */
    recordDecodeComplete(tileKey, durationMs) {
      this.tileMetrics.decodeCompletedCount++;
      this.tileMetrics.decodeCompletedTotalMs += durationMs;
      this.tileMetrics.lastDecodeLatencyMs = durationMs;
      this._recordEvent('decode-complete', { tileKey, durationMs });
    }

    /**
     * Record frame rendering time.
     * Automatically categorizes frames by performance tier.
     * @param {number} frameTimeMs - Frame time in milliseconds
     * @param {Array<string>} renderersInvolved - List of renderer names that ran this frame
     */
    recordFrame(frameTimeMs, renderersInvolved = []) {
      this.frameMetrics.frameCount++;
      this.frameMetrics.frameTotalMs += frameTimeMs;
      this.frameMetrics.lastFrameMs = frameTimeMs;
      if (frameTimeMs > this.frameMetrics.maxFrameMs) {
        this.frameMetrics.maxFrameMs = frameTimeMs;
      }
      if (frameTimeMs > 16) this.frameMetrics.framesOver16msCount++;
      if (frameTimeMs > 33) this.frameMetrics.framesOver33msCount++;
      this._recordEvent('frame', { frameTimeMs, renderers: renderersInvolved });
    }

    /**
     * Record a renderer's frame time contribution.
     * @param {string} rendererName - Name/class of renderer
     * @param {number} timeMs - Time spent in this renderer
     */
    recordRendererTime(rendererName, timeMs) {
      if (!this.rendererMetrics.has(rendererName)) {
        this.rendererMetrics.set(rendererName, {
          callCount: 0,
          totalMs: 0,
          maxMs: 0,
          avgMs: 0,
        });
      }
      const metrics = this.rendererMetrics.get(rendererName);
      metrics.callCount++;
      metrics.totalMs += timeMs;
      if (timeMs > metrics.maxMs) metrics.maxMs = timeMs;
      metrics.avgMs = metrics.totalMs / metrics.callCount;
    }

    /**
     * Get aggregate statistics for reporting.
     * @returns {Object} Summary of all collected metrics
     */
    getSummary() {
      const avgLoadMs = this.tileMetrics.loadCompletedCount > 0
        ? this.tileMetrics.loadCompletedTotalMs / this.tileMetrics.loadCompletedCount
        : 0;
      const avgDecodeMs = this.tileMetrics.decodeCompletedCount > 0
        ? this.tileMetrics.decodeCompletedTotalMs / this.tileMetrics.decodeCompletedCount
        : 0;
      const avgFrameMs = this.frameMetrics.frameCount > 0
        ? this.frameMetrics.frameTotalMs / this.frameMetrics.frameCount
        : 0;

      return {
        tiles: {
          avgLoadMs: avgLoadMs.toFixed(2),
          avgDecodeMs: avgDecodeMs.toFixed(2),
          lastLoadLatencyMs: this.tileMetrics.lastLoadLatencyMs.toFixed(2),
          lastDecodeLatencyMs: this.tileMetrics.lastDecodeLatencyMs.toFixed(2),
          loadCompletedCount: this.tileMetrics.loadCompletedCount,
          decodeCompletedCount: this.tileMetrics.decodeCompletedCount,
        },
        frames: {
          avgFrameMs: avgFrameMs.toFixed(2),
          maxFrameMs: this.frameMetrics.maxFrameMs.toFixed(2),
          lastFrameMs: this.frameMetrics.lastFrameMs.toFixed(2),
          frameCount: this.frameMetrics.frameCount,
          framesOver16ms: this.frameMetrics.framesOver16msCount,
          framesOver33ms: this.frameMetrics.framesOver33msCount,
        },
        renderers: Object.fromEntries(
          Array.from(this.rendererMetrics.entries()).map(([name, m]) => [
            name,
            {
              callCount: m.callCount,
              avgMs: m.avgMs.toFixed(2),
              maxMs: m.maxMs.toFixed(2),
              totalMs: m.totalMs.toFixed(2),
            },
          ])
        ),
      };
    }

    /**
     * Reset all metrics to start fresh.
     */
    reset() {
      this.tileMetrics = {
        loadStartCount: 0,
        loadStartTotalMs: 0,
        loadCompletedCount: 0,
        loadCompletedTotalMs: 0,
        decodeStartCount: 0,
        decodeStartTotalMs: 0,
        decodeCompletedCount: 0,
        decodeCompletedTotalMs: 0,
        lastLoadLatencyMs: 0,
        lastDecodeLatencyMs: 0,
      };
      this.frameMetrics = {
        frameCount: 0,
        frameTotalMs: 0,
        framesOver16msCount: 0,
        framesOver33msCount: 0,
        lastFrameMs: 0,
        maxFrameMs: 0,
      };
      this.rendererMetrics.clear();
      this.eventHistory = [];
    }

    /**
     * Get the last N events for debugging.
     * @param {number} count - Number of events to retrieve (default 20)
     * @returns {Array} Recent events in reverse chronological order
     */
    getRecentEvents(count = 20) {
      return this.eventHistory.slice(-count);
    }

    /**
     * Record an internal event for history tracking.
     * @private
     */
    _recordEvent(eventType, data) {
      this.eventHistory.push({
        type: eventType,
        data,
        timestamp: performance.now(),
      });
      if (this.eventHistory.length > this.maxHistorySize) {
        this.eventHistory.shift();
      }
    }
  }

  // Export to global scope
  if (typeof window !== 'undefined') {
    window.PerformanceInstrumentation = PerformanceInstrumentation;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceInstrumentation;
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : {});
